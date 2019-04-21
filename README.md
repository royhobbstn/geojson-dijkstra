# geojson-dijkstra
A fast and flexible implementation of Dijkstra with [GeoJSON](http://geojson.org/) support for NodeJS.

This repo is heavily indebted to the great [ngraph.path](https://github.com/anvaka/ngraph.path) library by [@anvaka](https://github.com/anvaka).  I set out to make the fastest JavaScript [Dijkstra](https://en.wikipedia.org/wiki/Dijkstra's_algorithm) implementation, but couldn't come remotely close until adapting the object node model and queue used in ngraph.  If you can't find what you're looking for here, you might appreciate the additional options ngraph provides.

## Quickstart

```
npm install geojson-dijkstra --save
```

```
const fs = require('fs');
const { Graph, CoordinateLookup, buildEdgeIdList, buildGeoJsonPath } = require('geojson-dijkstra');

// load your geoJson file
const geojson = JSON.parse(fs.readFileSync('./full_network.geojson'));

// add a _cost field (to signify the weight of an edge)
// add an _id field (to uniquely identify each edge)
geojson.features.forEach(feat => {
  feat.properties._cost = feat.properties.MILES;
  feat.properties._id = feat.properties.ID;
});

// create a new object which will hold the network graph
const graph = new Graph();
// load geojson into your network
graph.loadFromGeoJson(geojson);
  
// initialize a coordinate lookup service (optional)
// if you don't use the lookup service, you'll have to make sure that
// your start and end points correspond exactly to line segment 
// endpoints in your geoJson file (down to the last decimal)
const lookup = new CoordinateLookup(graph);
  
// use the lookup to find the closest network nodes to your input coordinates
const startOfPath = lookup.getClosestNetworkPt(-120.868893, 39.500155);
const endOfPath = lookup.getClosestNetworkPt(-120.658215, 35.299585);
  
// run an AStar Dijkstra using your start and end points
const path = graph.findPath(startOfPath, endOfPath, [buildEdgeIdList, buildGeoJsonPath]);
  
// example path output
// {
//  total_cost: 123.456,
//  edge_list: [4, 5, 6, 9, 10, 23, 27],
//  path: (a geojson linestring feature collection)
// }

```

## API

**Graph Methods**

```
graph.loadFromGeoJson(geojson);
````
Loads a geoJSON linestring dataset.  Expects a `_cost` attribute on the geoJSON `properties`, denoting the network weight of the edge, as well as an `_id` attribute which will uniquely identify the edge.

```
graph.findPath(startCoordinate, endCoordinate, [outputFunctions])
```
Runs the Dijkstra A-Star algorithm from the `startCoordinate` to the `endCoordinate`.  

These coordinates must exactly correspond to network nodes in your graph (the start or end points of actual linestrings in your geoJSON).  Because this can be inconvenient, the library provides a `CoordinateLookup` service which will take an input coordinate, and provide the closest network node.

**outputFunctions:**

This parameter is optional.  You can provide a single function by itself, an array of functions, or nothing at all.

By default, `graph.findPath` will output an object with a `total_cost` property:

```
{
  total_cost: 123
}
```

To provide additional outputs, you can add (or create your own) `outputFunctions` functions which can parse Dijkstra internals into usable outputs.

Two built-in output functions are:

```buildGeoJsonPath```

Will append `{ path: (geojson) }` to the response object, where `path` is a GeoJSON linestring of all edges and properties along the shortest path.


```buildEdgeIdList```

Will append `{ edge_list: [array, of, ids] }` to the response object, where `edge_list` is an ordered array of edge-ids `[1023, 1024, 1025]`, corresponding to the `_id` property in your input GeoJSON file.


**CoordinateLookup**

A fast geographically indexed coordinate lookup service leveraging [geokdbush](https://github.com/mourner/geokdbush).

```
const lookup = new CoordinateLookup(graph);
const longitude = -120.868893;
const latitude = 39.500155;
const startOfPath = lookup.getClosestNetworkPt(longitude, latitude);
```

Provide a `longitude` and `latitude` coordinate, and get an array: `[lng, lat]` in return corresponding to the nearest node in your network.


## How fast is it?

Benchmarking wouldn't be entirely fair.  Most pathfinding libraries are multi-purpose and can't take advantage of the shortcuts I did. For example, knowing that the network is geographic means that geojson-dijkstra can use an [A*](https://en.wikipedia.org/wiki/A*_search_algorithm) network optimization by default.  

Suffice to say that if this is not fast enough, you'll probably need to seek a solution implemented in a compiled language.

## Flexible?

I built this library mainly as a base to build a Contraction Hierarchy and ArcFlags implementation.  As these libraries rely on modified implementations of Dijkstras algorithm for processing, I needed to create the fastest implementation possible that was still flexible enough to accomodate these use cases.

**Contraction Hierarchy extension** (in progress)

**ArcFlags extension** (in progress)

## How can I make a directed graph?

The internals are in place to make this possible, but they have not been tested. Feel free to dive into the code, but use at your own risk.