const fs = require('fs');
const { Graph, CoordinateLookup, buildGeoJsonPath, buildEdgeIdList } = require('./index.js');
const createGraph = require('ngraph.graph');
const pathNGraph = require('ngraph.path');
const { getNGraphDist, populateNGraph } = require('../contraction-hierarchy-js/test/test-util.js');
const cheapRuler = require('cheap-ruler');

const ruler = cheapRuler(35, 'miles');


const geojson = JSON.parse(fs.readFileSync('./faf.geojson'));

// set up _cost and _id fields
geojson.features = geojson.features.map(feat => {
  const mph = getMPH(feat.properties.NHS);
  const _cost = (feat.properties.MILES / mph) * 60;
  const _id = feat.properties.ID;
  return Object.assign({}, feat, { properties: { _cost, _id, STFIPS: feat.properties.STFIPS } });
});

// clean and filter network
geojson.features = geojson.features.filter(feat => {
  if (feat.properties._cost && feat.geometry.coordinates /*&& feat.properties.STFIPS === 6*/ ) {
    return true;
  }
});

// define heuristic for A*
const heuristic = function(fromCoords, toCoords) {
  // for A*, your heuristic should never overestimate
  // so I'm assuming 70mph on a straight line distance
  return (ruler.distance(fromCoords, toCoords) / 100) * 60;
};

console.time('createGraph');
const graph = new Graph(geojson, { mutate_inputs: true, heuristic });
console.timeEnd('createGraph');

console.time('createCoordinateLookup');
const lookup = new CoordinateLookup(graph);
console.timeEnd('createCoordinateLookup');

const ngraph = createGraph();
populateNGraph(ngraph, geojson);

const pathFinder = pathNGraph.aStar(ngraph, {
  distance(fromNode, toNode, link) {
    return link.data._cost;
  },
  heuristic(fromNode, toNode) {
    // for A*, your heuristic should never overestimate
    // so I'm assuming 70mph on a straight line distance
    return (ruler.distance([fromNode.data.lng, fromNode.data.lat], [toNode.data.lng, toNode.data.lat]) / 100) * 60;
  }
});

const finder = graph.createFinder({ heuristic, parseOutputFns: [buildGeoJsonPath, buildEdgeIdList] });
const finder2 = graph.createFinder({ parseOutputFns: [buildGeoJsonPath, buildEdgeIdList] });

const coords1 = lookup.getClosestNetworkPt(-88.098578, 44.488832);
//const coords1 = lookup.getClosestNetworkPt(-121.9436463, 37.6992976);
const coords2 = lookup.getClosestNetworkPt(-120.6713655, 35.296016);

const start = coords1;
const end = coords2;

let a;
console.time('nGraph');
for (let i = 0; i < 100; i++) {
  a = getNGraphDist(pathFinder.find(coords1, coords2));
}
console.timeEnd('nGraph');
console.log(a.distance);

let b;
console.time('runningTime');
for (let i = 0; i < 100; i++) {
  b = finder.findPath(start, end);
}
console.timeEnd('runningTime');
console.log(b.total_cost);

let c;
console.time('std');
for (let i = 0; i < 100; i++) {
  c = finder2.findPath(start, end);
}
console.timeEnd('std');
console.log(c.total_cost);


function getMPH(nhs) {
  switch (nhs) {
    case 1:
      return 70;
    case 2:
      return 60;
    case 3:
      return 50;
    case 4:
      return 40;
    case 7:
      return 30;
    case 8:
      return 20;
    default:
      return 10;
  }
}
