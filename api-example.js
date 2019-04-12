const { Graph } = require('./index.js');

main();

async function main() {

  const network = new Graph();
  network.addEdge('A', 'B', { _cost: 1, _id: 1 });
  network.addEdge('B', 'C', { _cost: 1, _id: 2 });
  network.addEdge('C', 'D', { _cost: 0.9, _id: 3 });
  network.addEdge('C', 'E', { _cost: 0.5, _id: 4 });
  network.addEdge('C', 'F', { _cost: 0.8, _id: 5 });
  network.addEdge('D', 'G', { _cost: 0.7, _id: 6 });
  network.addEdge('E', 'G', { _cost: 0.5, _id: 7 });
  network.addEdge('F', 'G', { _cost: 0.6, _id: 8 });

  console.log(network)

  console.time('runningTime');
  const { distance, segments, route } = network.runDijkstra('A', 'G');
  console.timeEnd('runningTime');

  console.log({ distance });
  console.log({ segments });
  console.log({ route });

}
