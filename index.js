//
const FibonacciHeap = require('@tyriar/fibonacci-heap').FibonacciHeap;
const cloneGeoJson = require('@turf/clone').default;
const kdbush = require('kdbush');
const geokdbush = require('geokdbush');

// objects
exports.Graph = Graph;
exports.CoordinateLookup = CoordinateLookup;

// output function helpers
exports.buildGeoJsonPath = buildGeoJsonPath;
exports.buildEdgeIdList = buildEdgeIdList;
exports.buildNodeList = buildNodeList;

function Graph(options) {
  this.adjacency_list = {};
  this.geometry = {};
  this.properties = {};
  this.paths = {};
  this.isGeoJson = true;
  this.placement_index = 0;
  this.mutate_inputs = false;

  if (options && options.allowMutateInputs === true) {
    this.mutate_inputs = true;
  }
}

function CoordinateLookup(graph) {

  // if one or more features are missing _geometry attributes
  if (!graph.isGeoJson) {
    throw new Error('Coordinate Lookup can only be used on geographic datasets');
  }

  const points_set = new Set();

  Object.keys(graph.geometry).forEach(key => {
    const linestring = graph.geometry[key];
    points_set.add(String(linestring[0]));
    points_set.add(String(linestring[linestring.length - 1]));
  });

  const coordinate_list = [];

  points_set.forEach(pt_str => {
    coordinate_list.push(pt_str.split(',').map(d => Number(d)));
  });

  this.index = kdbush(coordinate_list, (p) => p[0], (p) => p[1]);
}

CoordinateLookup.prototype.getClosestNetworkPt = function(lng, lat) {
  return geokdbush.around(this.index, lng, lat, 1)[0];
};


// fully serializable
// however its possible that it would be quicker to re-build your network
// since a network representation will typically take up more disk
// space than a geojson representation of your network
Graph.prototype.save = function(options) {
  return {
    adjacency_list: this.adjacency_list,
    geometry: this.geometry,
    properties: this.properties,
    paths: this.paths,
    isGeoJson: this.isGeoJson,
    placement_index: this.placement_index,
    mutate_inputs: this.mutate_inputs,
  };
};

Graph.prototype.load = function(parsedGraph) {
  this.adjacency_list = parsedGraph.adjacency_list;
  this.geometry = parsedGraph.geometry;
  this.properties = parsedGraph.properties;
  this.paths = parsedGraph.paths;
  this.isGeoJson = parsedGraph.isGeoJson;
  this.placement_index = parsedGraph.placement_index;
  this.mutate_inputs = parsedGraph.mutate_inputs;
};

Graph.prototype.addEdge = function(startNode, endNode, attrs, isUndirected) {

  // copying attributes slows things down significantly
  const attributes = !this.mutate_inputs ? JSON.parse(JSON.stringify(attrs)) : attrs;

  // any feature without _geometry disables geojson output
  if (!attributes._geometry) {
    this.isGeoJson = false;
  }

  const start_node = String(startNode);
  const end_node = String(endNode);

  // create object to push into adjacency list
  const obj = {
    start: start_node,
    end: end_node,
    cost: attributes._cost,
    lookup_index: String(this.placement_index),
    reverse_flag: false
  };

  // add edge to adjacency list; check to see if start node exists;
  if (this.adjacency_list[start_node]) {
    this.adjacency_list[start_node].push(obj);
  }
  else {
    this.adjacency_list[start_node] = [obj];
  }

  if (attributes._geometry) {
    this.geometry[this.placement_index] = attributes._geometry;
    delete attributes._geometry;
  }

  this.properties[this.placement_index] = attributes;
  this.paths[`${start_node}|${end_node}`] = obj;

  // add reverse path
  if (isUndirected) {

    const reverse_obj = {
      start: String(end_node),
      end: String(start_node),
      cost: attributes._cost,
      lookup_index: String(this.placement_index),
      reverse_flag: true
    };

    if (this.adjacency_list[end_node]) {
      this.adjacency_list[end_node].push(reverse_obj);
    }
    else {
      this.adjacency_list[end_node] = [reverse_obj];
    }

    this.paths[`${end_node}|${start_node}`] = reverse_obj;
  }

  this.placement_index++;

};


Graph.prototype.runDijkstra = function(start, end, parseOutputFns) {

  const str_start = String(start);
  const str_end = String(end);

  const heap = new FibonacciHeap();
  const key_to_nodes = {};

  const dist = {}; // distances to each node
  const prev = {}; // node to parent_node lookup
  const visited = {}; // node has been fully explored

  let current = str_start;
  dist[current] = 0;

  // quick exit for start === end
  if (str_start === str_end) {
    current = '';
  }

  while (current) {
    this.adjacency_list[current]
      .forEach(n => {
        const node = n.end;

        // todo this optimization may not hold true for directed graphs
        if (visited[node]) {
          return;
        }

        // todo plug something in here that takes (dist, prev, visited, etc)

        const segment_distance = n.cost;
        const proposed_distance = dist[current] + segment_distance;

        if (proposed_distance < this._getComparator(dist[node])) {
          if (dist[node] !== undefined) {
            heap.decreaseKey(key_to_nodes[node], proposed_distance);
          }
          else {
            key_to_nodes[node] = heap.insert(proposed_distance, node);
          }
          dist[node] = proposed_distance;
          prev[node] = current;
        }
      });
    visited[current] = true;

    // get lowest value from heap
    const elem = heap.extractMinimum();

    if (elem) {
      current = elem.value;
    }
    else {
      current = '';
    }

    // exit early if current node becomes end node
    if (current === str_end) {
      current = '';
    }
  }

  // total cost included by default
  let response = { total_cost: dist[str_end] };

  // one callback function
  if (!Array.isArray(parseOutputFns)) {
    return Object.assign({}, response, parseOutputFns(this, start, end, prev, dist, visited));
  }

  // array of callback functions
  parseOutputFns.forEach(fn => {
    response = Object.assign({}, response, fn(this, start, end, prev, dist, visited));
  });

  return response;
};

function buildGeoJsonPath(graph, start, end, prev, dist, visited) {

  let str_end = String(end);

  const features = [];

  const path = {
    type: 'FeatureCollection',
    features: features
  };

  // note that if any input edges were missing a _geometry property
  // you will not be able to output a geojson path, and the option will be
  // excluded by default
  if (!graph.isGeoJson) {
    return path;
  }

  while (prev[str_end]) {
    const lookup = graph.paths[`${prev[str_end]}|${str_end}`];
    const properties = graph.properties[lookup.lookup_index];

    const feature = {
      "type": "Feature",
      "properties": properties,
      "geometry": {
        "type": "LineString",
        "coordinates": graph.geometry[lookup.lookup_index]
      }
    };
    features.push(feature);

    str_end = prev[str_end];
  }

  path.features.reverse();

  return { geojsonPath: path };

}

function buildEdgeIdList(graph, start, end, prev, dist, visited) {

  let str_end = String(end);

  let edgelist = [];

  while (prev[str_end]) {
    const lookup = graph.paths[`${prev[str_end]}|${str_end}`];
    const properties = graph.properties[lookup.lookup_index];
    edgelist.push(properties._id);
    str_end = prev[str_end];
  }

  edgelist.reverse();

  return { edgelist };
}

function buildNodeList(graph, start, end, prev, dist, visited) {

  let str_end = String(end);

  // all nodes are converted to strings internally, so if its a number
  // find out now so that it can be converted back later.
  // will support string, number, and array (as array of 2 lat/lng number coordinates only)
  // only comes into play if you need to return a nodelist
  let node_type = typeof end;
  if (node_type === 'object' && Array.isArray(end)) {
    node_type = 'array';
  }
  else if (node_type !== 'string' && node_type !== 'number') {
    throw new Error('invalid object input.  takes only numbers, strings, and coordinate arrays');
  }

  let nodelist = [];

  // prefill first node in nodelist
  if (node_type === 'string') {
    nodelist.push(str_end);
  }
  else if (node_type === 'number') {
    nodelist.push(Number(str_end));
  }
  else if (node_type === 'array') {
    nodelist.push(str_end.split(',').map(d => Number(d)));
  }

  while (prev[str_end]) {

    const lookup = graph.paths[`${prev[str_end]}|${str_end}`];

    if (lookup.reverse_flag) {
      if (node_type === 'string') {
        nodelist.push(lookup.end);
      }
      else if (node_type === 'number') {
        nodelist.push(Number(lookup.end));
      }
      else if (node_type === 'array') {
        nodelist.push(lookup.end.split(',').map(d => Number(d)));
      }
    }
    else {
      if (node_type === 'string') {
        nodelist.push(lookup.start);
      }
      else if (node_type === 'number') {
        nodelist.push(Number(lookup.start));
      }
      else if (node_type === 'array') {
        nodelist.push(lookup.start.split(',').map(d => Number(d)));
      }
    }

    str_end = prev[str_end];
  }

  nodelist.reverse();

  return { nodelist };
}


Graph.prototype.loadFromGeoJson = function(geo) {

  // turf clone is faster than JSON.parse(JSON.stringify(x))
  // still regretable vs mutating - avoid if possible
  const copy = !this.mutate_inputs ? cloneGeoJson(geo).features : geo.features;

  // using loadFromGeoJson enables geojson output
  this.isGeoJson = true;

  // cleans geojson (mutates in place)
  const features = this._cleanseGeoJsonNetwork(copy);

  features.forEach((feature, index) => {
    const coordinates = feature.geometry.coordinates;

    if (!feature.properties || !coordinates || !feature.properties._cost) {
      console.log('invalid feature detected.  skipping...');
      return;
    }

    const start_vertex = coordinates[0].join(',');
    const end_vertex = coordinates[coordinates.length - 1].join(',');

    // undirected
    if (feature.properties._direction === 'all' || !feature.properties._direction) {
      const properties = Object.assign({}, feature.properties, { _cost: feature.properties._cost, _geometry: feature.geometry.coordinates });
      this.addEdge(start_vertex, end_vertex, properties, true);
    }

    // forward path
    if (feature.properties._direction === 'f') {
      const forward_cost = feature.properties._forward_cost || feature.properties._cost;
      const properties = Object.assign({}, feature.properties, { _cost: forward_cost, _geometry: feature.geometry.coordinates, _reverse_flag: false });
      this.addEdge(start_vertex, end_vertex, properties, false);
    }

    // reverse path
    if (feature.properties._direction === 'b') {
      const backward_cost = feature.properties._backward_cost || feature.properties._cost;
      const properties = Object.assign({}, feature.properties, { _cost: backward_cost, _geometry: feature.geometry.coordinates, _reverse_flag: true });
      this.addEdge(end_vertex, start_vertex, properties, false);
    }

  });

};


Graph.prototype._getComparator = function(dist_node) {
  // excessive check necessary to distinguish undefined from 0
  // (dist[node] can on rare circumstances be 'start')
  if (dist_node === 0) {
    return 0;
  }
  if (dist_node === undefined) {
    return Infinity;
  }

  return dist_node;
};


Graph.prototype._cleanseGeoJsonNetwork = function(features) {

  // get rid of duplicate edges (same origin to dest)
  const inventory = {};

  features.forEach(feature => {
    const start = feature.geometry.coordinates[0].join(',');
    const end = feature.geometry.coordinates[feature.geometry.coordinates.length - 1].join(',');
    const id = `${start}|${end}`;

    const reverse_id = `${end}|${start}`;

    if (!feature.properties._direction || feature.properties._direction === 'all' || feature.properties._direction === 'f') {

      if (!inventory[id]) {
        // new segment
        inventory[id] = feature;
      }
      else {
        // a segment with the same origin/dest exists.  choose shortest.
        const old_cost = inventory[id].properties._cost;
        const new_cost = feature.properties._forward_cost || feature.properties._cost;
        if (new_cost < old_cost) {
          // mark old segment for deletion
          inventory[id].properties.__markDelete = true;
          // rewrite old segment because this one is shorter
          inventory[id] = feature;
        }
        else {
          // instead mark new feature for deletion
          feature.properties.__markDelete = true;
        }
      }

    }

    if (!feature.properties._direction || feature.properties._direction === 'all' || feature.properties._direction === 'b') {
      // now reverse
      if (!inventory[reverse_id]) {
        // new segment
        inventory[reverse_id] = feature;
      }
      else {
        // a segment with the same origin/dest exists.  choose shortest.
        const old_cost = inventory[reverse_id].properties._cost;
        const new_cost = feature.properties._backward_cost || feature.properties._cost;
        if (new_cost < old_cost) {
          // mark old segment for deletion
          inventory[reverse_id].properties.__markDelete = true;
          // rewrite old segment because this one is shorter
          inventory[reverse_id] = feature;
        }
        else {
          // instead mark new feature for deletion
          feature.properties.__markDelete = true;
        }
      }
    }

  });

  // filter out marked items
  return features.filter(feature => {
    return !feature.properties.__markDelete;
  });

};
