# geojson-dijkstra
A fast and flexible implementation of Dijkstra with GeoJSON support for NodeJS.

This repo is heavily indebted to the great [ngraph.path](https://github.com/anvaka/ngraph.path) library by [@anvaka](https://github.com/anvaka).  I set out to make the fastest JavaScript [Dijkstra](https://en.wikipedia.org/wiki/Dijkstra's_algorithm) implementation, but couldn't come remotely close until adopting the object node model and queue used in ngraph.

## Quickstart

```
npm install geojson-dijkstra --save
```

```
const { Graph, buildEdgeIdList, buildGeoJsonPath } = require('geojson-dijkstra');

const graph = new Graph();

main();

async function main() {

  const geojson_raw = await fs.readFile('./full_network.geojson');
  const geojson = JSON.parse(geojson_raw);

  // set up _cost and _id field
  geojson.features.forEach(feat => {
    feat.properties._cost = feat.properties.MILES;
    feat.properties._id = feat.properties.ID;
  });

  graph.loadFromGeoJson(geojson);
  
  const lookup = new CoordinateLookup();
  
  const startOfPath = lookup.getClosestNetworkPt(-120.868893, 39.500155);
  const endOfPath = lookup.getClosestNetworkPt(-120.658215, 35.299585);
  
  const path = graph.findPath(startOfPath, endOfPath, [buildEdgeIdList, buildGeoJsonPath]);
  
  // path output
  // {
  //  total_cost: 123.456,
  //  edge_list: [4, 5, 6, 9, 10, 23, 27],
  //  path: (geojson output here)
  // }
      
}

```

## API

Graph Methods:
```
graph.loadFromGeoJson(geojson);
````

**Path Output functions:**

By default, `graph.findPath` will output an object with a `total_cost` property:

```
{
  total_cost: 123
}
```

To provide richer outputs, you can provide additional "Path Output" functions which can parse Dijkstra internals into usable outputs.

Two built-in output functions are:

```buildGeoJsonPath```

Returns a GeoJson linestring of all edges and properties of the path.


```buildEdgeIdList```

Returns an ordered array of edge-ids `[1023, 1024, 1025]`, corresponding to the `_id` property in your input geoJson file.


## How fast is it?

Benchmarking wouldn't be entirely fair.  Most pathfinding libraries are multi-purpose and can't take advantage of the shortcuts I did. For example, knowing that the network is geographic means that geojson-dijkstra can use an [A*](https://en.wikipedia.org/wiki/A*_search_algorithm) network optimization by default.  

Suffice to say that if this is not fast enough, you'll probably need to seek a solution implemented in a compiled language.

## Flexible?

I built this library mainly as a base to build a Contraction Hierarchy and ArcFlags implementation.  As these libraries rely on modified implementations of Dijkstras algorithm for processing, I needed to create the fastest implementation possible that was still flexible enough to accomodate these use cases.

**Contraction Hierarchy extension** (in progress)

**ArcFlags extension** (in progress)

