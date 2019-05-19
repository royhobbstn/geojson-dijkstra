const fs = require('fs');
const { Graph, CoordinateLookup, buildGeoJsonPath, buildEdgeIdList } = require('../index.js');
const createGraph = require('ngraph.graph');
const pathNGraph = require('ngraph.path');
const { getNGraphDist, populateNGraph, cleanseNetwork } = require('./test-util.js');
const cheapRuler = require('cheap-ruler');

const ruler = cheapRuler(35, 'miles');


const geofile = JSON.parse(fs.readFileSync('../networks/faf.geojson'));


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
  // so I'm assuming 70mph on a straight line distance
  return (ruler.distance(fromCoords, toCoords) / 100) * 60;
};

console.time('createGraph');
const graph = new Graph(geojson, { mutate_inputs: true });
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
  },
  oriented: true
});

const pathFinder2 = pathNGraph.aStar(ngraph, {
  distance(fromNode, toNode, link) {
    return link.data._cost;
  },
  oriented: true
});

const finder = graph.createFinder({ heuristic, parseOutputFns: [buildGeoJsonPath, buildEdgeIdList] });
const finder2 = graph.createFinder({ parseOutputFns: [buildGeoJsonPath, buildEdgeIdList] });



const adj_keys = Object.keys(graph.adjacency_list);
const adj_length = adj_keys.length;



// const coords1 = lookup.getClosestNetworkPt(-88.098578, 44.488832);
// const coords1 = lookup.getClosestNetworkPt(-121.9436463, 37.6992976);
// const coords2 = lookup.getClosestNetworkPt(-120.6713655, 35.296016);

const coords = [];

for (let i = 0; i < 100; i++) {
  const rnd1 = Math.floor(Math.random() * adj_length);
  const rnd2 = Math.floor(Math.random() * adj_length);
  const coord = [adj_keys[rnd1].split(',').map(d => Number(d)), adj_keys[rnd2].split(',').map(d => Number(d))];
  // const coord = [
  //   [-113.132497, 41.902277],
  //   [-109.306339, 42.244785]
  // ];
  coords.push(coord);
}


const na = [];
const nd = [];
const fa = [];
const fd = [];


coords.forEach((pair, index) => {
  process.stdout.write(
    '\n\nProcessing ' +
    ((index / coords.length) * 100).toFixed(2) +
    '% complete... ' +
    index +
    '  ' +
    pair +
    '                 \r\n'
  );
  console.log('----');


  console.time('na');
  na[index] = getNGraphDist(pathFinder.find(pair[0], pair[1]));
  console.timeEnd('na');

  console.time('nd');
  nd[index] = getNGraphDist(pathFinder2.find(pair[0], pair[1]));
  console.timeEnd('nd');

  console.time('fa');
  fa[index] = finder.findPath(pair[0], pair[1]);
  console.timeEnd('fa');

  console.time('fd');
  fd[index] = finder2.findPath(pair[0], pair[1]);
  console.timeEnd('fd');
});



let error_count = 0;
for (let i = 0; i < coords.length; i++) {
  const values = [
    na[i].distance,
    nd[i].distance,
    fa[i].total_cost,
    fd[i].total_cost,
  ];

  let min = Infinity;
  let max = -Infinity;

  values.forEach(val => {
    if (val < min) {
      min = val;
    }
    if (val > max) {
      max = val;
    }
  });

  if (max - min > 0.000001) {
    error_count++;
    console.log(
      i,
      coords[i],
      na[i].distance,
      na[i].edgelist.length,
      nd[i].distance,
      nd[i].edgelist.length,
      fa[i].total_cost,
      fa[i].edge_list.length,
      fd[i].total_cost,
      fd[i].edge_list.length
    );
  }
}
console.log(`There were ${error_count} errors.`);

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
