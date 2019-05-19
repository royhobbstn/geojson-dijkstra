const fs = require('fs');
const { Graph, buildGeoJsonPath, buildEdgeIdList } = require('./index.js');
const createGraph = require('ngraph.graph');
const pathNGraph = require('ngraph.path');
const { getNGraphDist, populateNGraph, cleanseNetwork } = require('../contraction-hierarchy-js/test/test-util.js');
const cheapRuler = require('cheap-ruler');

const ruler = cheapRuler(35, 'miles');


const geofile = JSON.parse(fs.readFileSync('./faf.geojson'));


// set up _cost and _id fields
geofile.features = geofile.features.map(feat => {
  const mph = getMPH(feat.properties.NHS);
  const _cost = (feat.properties.MILES / mph) * 60;
  const _id = feat.properties.ID;
  return Object.assign({}, feat, { properties: { _cost, _id, STFIPS: feat.properties.STFIPS } });
});

// clean and filter network
geofile.features = geofile.features.filter(feat => {
  if (feat.properties._cost && feat.geometry.coordinates) {
    return true;
  }
});

const geojson = cleanseNetwork(geofile);


// define heuristic for A*
const heuristic = function(fromCoords, toCoords) {
  // for A*, your heuristic should never overestimate
  // so I'm assuming 100mph on a straight line distance
  return (ruler.distance(fromCoords, toCoords) / 100) * 60;
};

console.time('createGraph');
const graph = new Graph(geojson, { mutate_inputs: true });
console.timeEnd('createGraph');

const ngraph = createGraph();
populateNGraph(ngraph, geojson);

const pathFinder = pathNGraph.aStar(ngraph, {
  distance(fromNode, toNode, link) {
    return link.data._cost;
  },
  heuristic(fromNode, toNode) {
    // for A*, your heuristic should never overestimate
    // so I'm assuming 100mph on a straight line distance
    return (ruler.distance([fromNode.data.lng, fromNode.data.lat], [toNode.data.lng, toNode.data.lat]) / 100) * 60;
  }
});

const pathFinder2 = pathNGraph.aStar(ngraph, {
  distance(fromNode, toNode, link) {
    return link.data._cost;
  }
});

const finder = graph.createFinder({ heuristic, parseOutputFns: [buildGeoJsonPath, buildEdgeIdList] });
const finder2 = graph.createFinder({ parseOutputFns: [buildGeoJsonPath, buildEdgeIdList] });



const adj_keys = Object.keys(graph.adjacency_list);
const adj_length = adj_keys.length;

const coords = [];

for (let i = 0; i < 100; i++) {
  const rnd1 = Math.floor(Math.random() * adj_length);
  const rnd2 = Math.floor(Math.random() * adj_length);
  const coord = [adj_keys[rnd1].split(',').map(d => Number(d)), adj_keys[rnd2].split(',').map(d => Number(d))];
  coords.push(coord);
}

const na = [];
const nd = [];
const fa = [];
const fd = [];

console.time('na');
coords.forEach((pair, index) => {
  na[index] = getNGraphDist(pathFinder.find(pair[0], pair[1]));
});
console.timeEnd('na');

console.time('nd');
coords.forEach((pair, index) => {
  nd[index] = getNGraphDist(pathFinder2.find(pair[0], pair[1]));
});
console.timeEnd('nd');

console.time('fa');
coords.forEach((pair, index) => {
  fa[index] = finder.findPath(pair[0], pair[1]);
});
console.timeEnd('fa');

console.time('fd');
coords.forEach((pair, index) => {
  fd[index] = finder2.findPath(pair[0], pair[1]);
});
console.timeEnd('fd');


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
