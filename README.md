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
const graph = new Graph(geojson);
  
// initialize a coordinate lookup service (optional)
// if you don't use the lookup service, you'll have to make sure that
// your start and end points correspond exactly to line segment 
// endpoints in your geoJson file (down to the last decimal)
const lookup = new CoordinateLookup(graph);
  
// use the lookup to find the closest network nodes to your input coordinates
const startOfPath = lookup.getClosestNetworkPt(-120.868893, 39.500155);
const endOfPath = lookup.getClosestNetworkPt(-120.658215, 35.299585);

// define heuristic for A* (optional)
const heuristic = function(fromCoords, toCoords) {
  // todo
};


const finder = graph.createFinder({heuristic, outputFns: [buildEdgeIdList, buildGeoJsonPath]});

// run an AStar Dijkstra using your start and end points
const path = finder.findPath(startOfPath, endOfPath);
  
// example path output
// {
//  total_cost: 123.456,
//  edge_list: [4, 5, 6, 9, 10, 23, 27],
//  path: (a geojson linestring feature collection)
// }

```

## Input GeoJSON

Each geojson feature must contain an `_id` property (as a number) and a `_cost` property (as a number. can not be zero.).

Additionally, the following properties can be used to customize:

* `_direction`: 'f' (string) linestring is valid in the forward direction only. default is valid in both directions.
* `_forward_cost`: (number, overrides _cost) cost in the forward direction
* `_backward_cost`: (number, overrides _cost) cost in the backward direction

## API

```
const graph = new Graph(geojson, options_object);
```

On each feature's `properties` object your geojson must have a non-zero numeric `_cost` attribute and a unique numeric `_id` attribute.

Create new new graph.  `options_object` is an object with the following (optional) property:

`mutate_inputs`: (default false)

Allows the mutation of the source dataset.  Dramatically speeds up loading large datasets.  Do not use this options if your in-memory geojson will be used in other places in your application.

**Graph Methods**

```
const finder = graph.createFinder({options_object});
```

Creates a `finder` object with one property; the `findPath` function.

The `options_object` for `graph.createFinder` includes the following **optional** properties:

`heuristicFn`:  This activates A* mode, and will dramatically speed up routing.  Without a heuristic function your path will be routed by a standard implementation of Dijkstra algorithm.

Sending in a heuristic function that has not been properly considered can result in finding suboptimal paths, and a slower running time, so beware!

The trick to creating a good heuristic function is to try to guess the `_cost` between the current point and the end point **without overestimating**.

`outputFns`:  These function determine the answers you will receive from your pathfinding.  

You can provide a single function by itself, an array of functions, or nothing at all.

By default, running `findPath` will return a response with only a `total_cost` property:

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



```
const path = finder.findPath(startCoordinates, endCoordinates);
```

Runs Dijkstra's algorithm from the `startCoordinates` to the `endCoordinates`.  

These coordinates must exactly correspond to network nodes in your graph (the start or end points of actual linestrings in your geoJSON).  Because this can be inconvenient, the library provides a `CoordinateLookup` service which will take an input coordinate, and provide the closest network node.

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

Suffice to say; if this is not fast enough, you'll need to seek a solution implemented in a compiled language.

## Flexible?

I built this library mainly as a data-structure base to build a [Contraction Hierarchy](https://en.wikipedia.org/wiki/Contraction_hierarchies).

Pre-processing a graph with a Contraction Hiererarchy can realize dramatic speeds that far surpass A*.

**[Contraction Hierarchy](https://github.com/royhobbstn/contraction-hierarchy-js) project** (in progress)
