//
const cloneGeoJson = require('@turf/clone').default;
const kdbush = require('kdbush');
const geokdbush = require('geokdbush');
const NodeHeap = require('./queue.js');

// objects
exports.Graph = Graph;
exports.CoordinateLookup = CoordinateLookup;

// output function helpers
exports.buildGeoJsonPath = buildGeoJsonPath;
exports.buildEdgeIdList = buildEdgeIdList;

function Graph(options) {
  this.adjacency_list = {};
  this.geometry = {};
  this.properties = {};
  this.isGeoJson = true;
  this.placement_index = 0;
  this.mutate_inputs = false;
  this.pool = createNodePool();
  if (options && options.allowMutateInputs === true) {
    this.mutate_inputs = true;
  }
}

function heuristic({ start_lat, start_lng, end_lat, end_lng }) {
  const dx = start_lng - end_lng;
  const dy = start_lat - end_lat;
  return (Math.abs(dx) + Math.abs(dy)) * 7;
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
    start_lng: startNode[0],
    start_lat: startNode[1],
    end_lng: endNode[0],
    end_lat: endNode[1],
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

  // add reverse path
  if (isUndirected) {

    const reverse_obj = {
      start: String(end_node),
      end: String(start_node),
      start_lng: endNode[0],
      start_lat: endNode[1],
      end_lng: startNode[0],
      end_lat: startNode[1],
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

  }

  this.placement_index++;

};

function Node(node) {
  this.id = node.id;
  this.dist = node.dist !== undefined ? node.dist : Infinity;
  this.prev = undefined;
  this.visited = undefined;
  this.opened = false; // whether has been put in queue
  this.heapIndex = -1;
  this.score = Infinity;
  // only use heuristic if given coordinates
  this.heuristic = node.start_lat ? heuristic({
    start_lat: node.start_lat,
    start_lng: node.start_lng,
    end_lat: node.end_lat,
    end_lng: node.end_lng
  }) : 0;
}

function createNodePool() {
  var currentInCache = 0;
  var nodeCache = [];

  return {
    createNewState: createNewState,
    reset: reset
  };

  function reset() {
    currentInCache = 0;
  }

  function createNewState(node) {
    var cached = nodeCache[currentInCache];
    if (cached) {
      cached.id = node.id;
      cached.dist = node.dist !== undefined ? node.dist : Infinity;
      cached.prev = undefined;
      cached.visited = undefined;
      cached.opened = false;
      cached.heapIndex = -1;
      cached.score = Infinity;
      // only use heuristic if given coordinates
      cached.heuristic = node.start_lat ? heuristic({
        start_lat: node.start_lat,
        start_lng: node.start_lng,
        end_lat: node.end_lat,
        end_lng: node.end_lng
      }) : 0;
    }
    else {
      cached = new Node(node);
      nodeCache[currentInCache] = cached;
    }
    currentInCache++;
    return cached;
  }

}

Graph.prototype.findPath = function(start, end, parseOutputFns) {

  this.pool.reset();

  const str_start = String(start);
  const str_end = String(end);

  const end_lng = end[0];
  const end_lat = end[1];

  const start_lng = start[0];
  const start_lat = start[1];

  const nodeState = new Map();

  var openSet = new NodeHeap({ rank: 'score' });

  let current = this.pool.createNewState({ id: str_start, dist: 0, start_lat, start_lng, end_lat, end_lng });
  nodeState.set(str_start, current);
  current.opened = 1;
  current.score = current.heuristic;

  // quick exit for start === end
  if (str_start === str_end) {
    current = '';
  }

  while (current) {

    this.adjacency_list[current.id]
      .forEach(edge => {

        let node = nodeState.get(edge.end);
        if (node === undefined) {
          node = this.pool.createNewState({ id: edge.end, start_lat: edge.end_lat, start_lng: edge.end_lng, end_lat, end_lng });
          nodeState.set(edge.end, node);
        }

        if (node.visited === true) {
          return;
        }

        if (!node.opened) {
          openSet.push(node);
          node.opened = true;
        }

        const proposed_distance = current.dist + edge.cost;
        if (proposed_distance >= node.dist) {
          // longer path
          return;
        }

        node.dist = proposed_distance;
        node.prev = edge;
        node.score = proposed_distance + node.heuristic;

        openSet.updateItem(node.heapIndex);
      });

    current.visited = true;

    // get lowest value from heap
    current = openSet.pop();

    if (!current) {
      console.log("There is no path");
      break;
    }

    // exit early if current node becomes end node
    // todo what is !current?
    if (current.id === str_end) {
      current = '';
    }
  }


  // total cost included by default
  const last_node = nodeState.get(str_end);
  let response = { total_cost: (last_node && last_node.dist) || 0 };

  // if no output fns specified
  if (!parseOutputFns) {
    return response;
  }

  // one callback function
  if (!Array.isArray(parseOutputFns)) {
    return Object.assign({}, response, parseOutputFns(this, nodeState, str_start, str_end));
  }

  // array of callback functions
  parseOutputFns.forEach(fn => {
    response = Object.assign({}, response, fn(this, nodeState, str_start, str_end));
  });

  return response;
};

function buildEdgeIdList(graph, node_map, start, end) {
  const edge_list = [];

  if (start === end) {
    return { edge_list };
  }

  let current_node = node_map.get(end);

  if (!current_node) {
    // no path
    return { edge_list };
  }

  do {
    const edge = current_node.prev;
    const index = edge.lookup_index;
    const properties = graph.properties[index];
    edge_list.push(properties._id);
    current_node = node_map.get(edge.start);
  } while (current_node && current_node.prev);

  edge_list.reverse();

  return { edge_list };
}

function buildGeoJsonPath(graph, node_map, start, end) {

  const features = [];

  const path = {
    type: 'FeatureCollection',
    features: features
  };

  // note that if any input edges were missing a _geometry property
  // you will not be able to output a geojson path, and the option will be
  // excluded by default
  if (!graph.isGeoJson || start === end) {
    return { geojsonPath: path };
  }

  let current_node = node_map.get(end);

  if (!current_node) {
    // no path
    return { geojsonPath: path };
  }

  do {
    const edge = current_node.prev;
    const index = edge.lookup_index;
    const properties = graph.properties[index];
    const geometry = graph.geometry[index];
    const feature = {
      "type": "Feature",
      "properties": properties,
      "geometry": {
        "type": "LineString",
        "coordinates": geometry
      }
    };
    features.push(feature);
    current_node = node_map.get(edge.start);
  } while (current_node && current_node.prev);

  path.features.reverse();

  return { geojsonPath: path };
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

    const start_vertex = coordinates[0];
    const end_vertex = coordinates[coordinates.length - 1];

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
