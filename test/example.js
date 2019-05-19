const fs = require('fs');
const { Graph, CoordinateLookup, buildGeoJsonPath, buildEdgeIdList } = require('../index.js');

const geojson = JSON.parse(fs.readFileSync('../networks/test.geojson'));

const graph = new Graph(geojson);

// create a coordinate lookup to be able to input arbitrary coordinate pairs
// and return the nearest coordinates in the network
const lookup = new CoordinateLookup(graph);
const coords1 = lookup.getClosestNetworkPt(-101.359, 43.341);
const coords2 = lookup.getClosestNetworkPt(-91.669, 40.195);

// create a finder, in which you may specify your A* heuristic (optional)
// and add extra attributes to the result object
const finder = graph.createFinder({ parseOutputFns: [buildGeoJsonPath, buildEdgeIdList] });

// the result will contain a total_cost attribute,
// as well as additional attributes you specified when creating a finder
const result = finder.findPath(coords1, coords2);

console.log(result);
