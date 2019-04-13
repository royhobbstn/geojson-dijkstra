const fs = require('fs').promises;
const { Graph, CoordinateLookup, buildGeoJsonPath, buildEdgeIdList, buildNodeList } = require('./index.js');

main();

async function main() {

  const geojson = await readyNetwork();
  const network = new Graph({ allowMutateInputs: true });

  console.time('buildTime');
  network.loadFromGeoJson(geojson);
  console.timeEnd('buildTime');

  // console.log(network)

  console.time('saveTime');
  const geo_parse = network.save();
  console.timeEnd('saveTime');

  console.time('loadTime');
  const newNetwork = new Graph();
  newNetwork.load(geo_parse);
  console.timeEnd('loadTime');

  console.time('createIndex');
  const lookup = new CoordinateLookup(network);
  console.timeEnd('createIndex');

  const coords1 = lookup.getClosestNetworkPt(-100, 43);
  console.log(coords1);

  const coords2 = lookup.getClosestNetworkPt(-91, 40);
  console.log(coords2);

  // const start = '-118.277145,34.021101';
  // const end = '-118.332832,34.035054';
  const start = coords1;
  const end = coords2;

  console.time('runningTime');
  const { total_cost, geojsonPath, edgelist, nodelist } = network.runDijkstra(start, end, [buildGeoJsonPath, buildEdgeIdList, buildNodeList]);
  console.timeEnd('runningTime');

  console.log({ total_cost });
  console.log({ geojsonPath });
  console.log({ edgelist });
  console.log({ nodelist });

}

async function readyNetwork() {

  // const geojson_raw = await fs.readFile('./full_network.geojson');
  const geojson_raw = await fs.readFile('./test.geojson');

  const geojson = JSON.parse(geojson_raw);

  // set up _cost field
  // geojson.features.forEach(feat => {
  //   const mph = getMPH(feat.properties.NHS);
  //   feat.properties._cost = (feat.properties.MILES / 60) * mph;
  // });

  // set up _id field
  // geojson.features.forEach(feat => {
  //   feat.properties._id = feat.properties.ID;
  // });

  // clean network
  geojson.features = geojson.features.filter(feat => {
    if (feat.properties._cost && feat.geometry.coordinates) {
      return true;
    }
  });

  return geojson;
}

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
