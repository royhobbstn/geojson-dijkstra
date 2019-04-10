const fs = require('fs').promises;
const { cleanseNetwork, toGraph, runDijkstra } = require('./index.js');

main();

async function main() {

  const geojson = await readyNetwork();
  const scrubbed_network = cleanseNetwork(geojson);
  const network = toGraph(scrubbed_network);

  const start = '-118.277145,34.021101';
  const end = '-118.332832,34.035054';

  console.time('runningTime');
  const { distance, segments, route } = runDijkstra(network, start, end);
  console.timeEnd('runningTime');

  console.log({ distance });
  console.log({ segments });
  console.log({ route });

}

async function readyNetwork() {

  const geojson_raw = await fs.readFile('./full_network.geojson');
  const geojson = JSON.parse(geojson_raw);

  // set up cost field
  geojson.features.forEach(feat => {
    const mph = getMPH(feat.properties.NHS);
    feat.properties._cost = (feat.properties.MILES / 60) * mph;
  });

  // clean network
  geojson.features = geojson.features.filter(feat => {
    if (feat.properties._cost && feat.geometry.coordinates && feat.properties.STFIPS === 6) {
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
