const fs = require('fs');
const { Graph, CoordinateLookup, buildGeoJsonPath, buildEdgeIdList } = require('./index.js');


const geojson = JSON.parse(fs.readFileSync('./test.geojson'));
const network = new Graph();

network.loadFromGeoJson(geojson);

console.log(network)

const lookup = new CoordinateLookup(network);

const coords1 = lookup.getClosestNetworkPt(-100, 43);
const coords2 = lookup.getClosestNetworkPt(-91, 40);

const start = coords1;
const end = coords2;

console.time('runningTime');
const { total_cost, geojsonPath, edge_list } = network.findPath(start, end, [buildGeoJsonPath, buildEdgeIdList]);
console.timeEnd('runningTime');

console.log({ total_cost });
console.log({ geojsonPath });
console.log({ edge_list });
