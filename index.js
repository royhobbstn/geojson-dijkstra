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

function Graph(geojson, options) {
  if (!options) {
    options = {};
  }
  this.adjacency_list = {};
  this.mutate_inputs = Boolean(options.allowMutateInputs);
  this._createNodePool = createNodePool;

  if (geojson) {
    this.loadFromGeoJson(geojson);
  }
}

function noOp() {
  return 0;
}

function CoordinateLookup(graph) {

  const points_set = new Set();

  Object.keys(graph.adjacency_list).forEach(key => {
    points_set.add(key);
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


Graph.prototype._addEdge = function(startNode, endNode, attrs, isUndirected) {

  // copying attributes slows things down significantly
  // TODO look closer
  const attributes = !this.mutate_inputs ? JSON.parse(JSON.stringify(attrs)) : attrs;

  let geometry = undefined;

  // any feature without _geometry disables geojson output
  geometry = attributes._geometry;
  delete attributes._geometry; // todo not sure i like this

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
    cost: attributes._forward_cost || attributes._cost,
    attributes,
    geometry
  };

  // add edge to adjacency list; check to see if start node exists;
  if (this.adjacency_list[start_node]) {
    this.adjacency_list[start_node].push(obj);
  }
  else {
    this.adjacency_list[start_node] = [obj];
  }

  // add reverse path
  if (isUndirected) {

    const reverse_obj = {
      start: String(end_node),
      end: String(start_node),
      start_lng: endNode[0],
      start_lat: endNode[1],
      end_lng: startNode[0],
      end_lat: startNode[1],
      cost: attributes._forward_cost || attributes._cost,
      attributes,
      geometry
    };

    if (this.adjacency_list[end_node]) {
      this.adjacency_list[end_node].push(reverse_obj);
    }
    else {
      this.adjacency_list[end_node] = [reverse_obj];
    }

  }

};

function Node(node, heuristic) {
  this.id = node.id;
  this.dist = node.dist !== undefined ? node.dist : Infinity;
  this.prev = undefined;
  this.visited = undefined;
  this.opened = false; // whether has been put in queue
  this.heapIndex = -1;
  this.score = Infinity;
  this.heuristic = heuristic;
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

  function createNewState(node, heuristic) {
    var cached = nodeCache[currentInCache];
    if (cached) {
      cached.id = node.id;
      cached.dist = node.dist !== undefined ? node.dist : Infinity;
      cached.prev = undefined;
      cached.visited = undefined;
      cached.opened = false;
      cached.heapIndex = -1;
      cached.score = Infinity;
      cached.heuristic = heuristic;
    }
    else {
      cached = new Node(node, heuristic);
      nodeCache[currentInCache] = cached;
    }
    currentInCache++;
    return cached;
  }

}

Graph.prototype.createFinder = function(options) {

  const parseOutputFns = options.parseOutputFns;
  const heuristicFn = options.heuristic || noOp;
  const pool = this._createNodePool();
  const adjacency_list = this.adjacency_list;

  return {
    findPath
  };

  function findPath(start, end) {

    pool.reset();

    const str_start = String(start);
    const str_end = String(end);

    const nodeState = new Map();

    var openSet = new NodeHeap({
      compare(a, b) {
        return a.score - b.score;
      }
    });

    let current = pool.createNewState({ id: str_start, dist: 0 }, heuristicFn(start, end));
    nodeState.set(str_start, current);
    current.opened = 1;

    // quick exit for start === end
    if (str_start === str_end) {
      current = '';
    }

    while (current) {

      adjacency_list[current.id]
        .forEach(edge => {

          let node = nodeState.get(edge.end);
          if (node === undefined) {
            node = pool.createNewState({ id: edge.end }, heuristicFn([edge.end_lng, edge.end_lat], end));
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
        // there is no path.  distance will be set to 0
        break;
      }

      // exit early if current node becomes end node
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
  }
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
    edge_list.push(edge.attributes._id);
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
  if (start === end) {
    return { geojsonPath: path };
  }

  let current_node = node_map.get(end);

  if (!current_node) {
    // no path
    return { geojsonPath: path };
  }

  do {
    const edge = current_node.prev;
    const feature = {
      "type": "Feature",
      "properties": edge.attributes,
      "geometry": {
        "type": "LineString",
        "coordinates": edge.geometry
      }
    };
    features.push(feature);
    current_node = node_map.get(edge.start);
  } while (current_node && current_node.prev);

  path.features.reverse();

  return { geojsonPath: detangle(path) };
}


Graph.prototype.loadFromGeoJson = function(geo) {

  // turf clone is faster than JSON.parse(JSON.stringify(x))
  // still regretable vs mutating - avoid if possible
  const copy = !this.mutate_inputs ? cloneGeoJson(geo).features : geo.features;

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

    // TODO revisit directed graphs

    const properties = Object.assign({}, feature.properties, { _cost: feature.properties._cost, _geometry: feature.geometry.coordinates });

    if (feature.properties._direction === 'f') {
      this._addEdge(start_vertex, end_vertex, properties, false);
    }
    else {
      this._addEdge(start_vertex, end_vertex, properties, true);
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

function detangle(geo) {

  // ------ de-tangle routine

  // copy source to avoid mutation
  const features = JSON.parse(JSON.stringify(geo)).features;

  const collection = {
    type: "FeatureCollection",
    features: features
  };

  // if only one feature return
  if (features.length <= 1) {
    return collection;
  }

  // modify first feature
  const cf = features[0];
  const nf = features[1];

  const ce = cf.geometry.coordinates[cf.geometry.coordinates.length - 1];

  const ns = nf.geometry.coordinates[0];
  const ne = nf.geometry.coordinates[nf.geometry.coordinates.length - 1];

  // in case of ce !== ns && ce !== ne. (flip first feature)

  // ce === ns
  const ce_ns = ce[0] === ns[0] && ce[1] === ns[1];
  // ce === ne
  const ce_ne = ce[0] === ne[0] && ce[1] === ne[1];

  if (!ce_ns && !ce_ne) {
    features[0].geometry.coordinates.reverse();
  }

  // modify rest of the features to match orientation of the first
  for (let i = 1; i < features.length; i++) {
    const lastFeature = features[i - 1];
    const currentFeature = features[i];

    const last_end = lastFeature.geometry.coordinates[lastFeature.geometry.coordinates.length - 1];
    const current_end = currentFeature.geometry.coordinates[currentFeature.geometry.coordinates.length - 1];

    // in the case of last_end == current_end  (flip this)
    const le_ce = last_end[0] === current_end[0] && last_end[1] === current_end[1];

    if (le_ce) {
      currentFeature.geometry.coordinates.reverse();
    }

  }

  return collection;
}
