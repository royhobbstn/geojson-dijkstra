# geojson-dijkstra
A fast and flexible implementation of Dijkstra with GeoJSON support for NodeJS.

This repo is heavily indebted to the great [ngraph.path](https://github.com/anvaka/ngraph.path) library by [@anvaka](https://github.com/anvaka).  I set out to make the fastest JavaScript [Dijkstra](https://en.wikipedia.org/wiki/Dijkstra's_algorithm) implementation, but couldn't come remotely close until adopting the object node model and queue used in ngraph.

## Quickstart

```
npm install geojson-dijkstra --save
```

```
const { Graph, buildEdgeIdList, buildGeoJsonPath } = require('geojson-dijkstra');

const fasterDijkstra = new Graph();

async function readyNetwork() {

  const geojson_raw = await fs.readFile('../networks/full_network.geojson');
  const geojson = JSON.parse(geojson_raw);

  // set up _cost and _id field
  geojson.features.forEach(feat => {
    feat.properties._cost = feat.properties.MILES;
    feat.properties._id = feat.properties.ID;
  });

  fasterDijkstra.loadFromGeoJson(geojson);
  
  fasterDijkstra.findPath(
        [-120.868893, 39.500155],
        [-120.658215, 35.299585], [buildEdgeIdList, buildGeoJsonPath]
      );
}

```

## API

```

```

## How fast is it?

Benchmarking wouldn't be entirely fair.  Most pathfinding libraries are multi-purpose and can't take advantage of the shortcuts I did. For example, knowing that the network is geographic means that I can take advantage of [A*](https://en.wikipedia.org/wiki/A*_search_algorithm) network optimizations by default.  

Suffice to say that if this is not fast enough, you'll probably need to seek a solution implemented in a compiled language.

## Flexible?

I built this library mainly as a base to build a Contraction Hierarchy and ArcFlags implementation.  As these libraries rely on modified implementations of Dijkstras algorithm for processing, I needed to create the fastest implementation possible that was still flexible enough to accomodate these use cases.

**Contraction Hierarchy extension** (in progress)

**ArcFlags extension** (in progress)

