//
const FibonacciHeap = require('@tyriar/fibonacci-heap').FibonacciHeap;

exports.Graph = Graph;

function Graph() {
  this.adjacency_list = {};
  this.geometry = {};
  this.properties = {};
  this.paths = {};
  this.lookup = {};
  this.reverse_lookup = {};
  this.isGeoJson = true;
  this.placement_index = 0;
  this.temp_index = 0;
}


Graph.prototype.addEdge = function(startNode, endNode, attributes, isUndirected) {

  // copying attributes slows things down significantly
  // hopefully it wont be needed

  // any feature without _geometry disables geojson output
  if (!attributes._geometry) {
    this.isGeoJson = false;
  }

  let start_node_index = undefined;
  let end_node_index = undefined;

  // check to see if startNode is in lookup
  if (!this.lookup[startNode]) {
    // if not, add it
    this.lookup[startNode] = String(this.temp_index);
    // and store it in the reverse lookup
    this.reverse_lookup[this.temp_index] = startNode;
    start_node_index = String(this.temp_index);
    this.temp_index++;
  }
  else {
    start_node_index = this.lookup[startNode];
  }

  // check to see if endNode is in lookup
  if (!this.lookup[endNode]) {
    // if not, add it
    this.lookup[endNode] = String(this.temp_index);
    // and store it in the reverse lookup
    this.reverse_lookup[this.temp_index] = endNode;
    end_node_index = String(this.temp_index);
    this.temp_index++; // todo is this okay?
  }
  else {
    end_node_index = this.lookup[endNode];
  }

  // create object to push into adjacency list
  const obj = {
    start: String(start_node_index),
    end: String(end_node_index),
    cost: attributes._cost,
    lookup_index: String(this.placement_index),
    reverse_flag: false
  };

  // add edge to adjacency list; check to see if start node exists;
  if (this.adjacency_list[start_node_index]) {
    this.adjacency_list[start_node_index].push(obj);
  }
  else {
    this.adjacency_list[start_node_index] = [obj];
  }

  if (attributes._geometry) {
    this.geometry[this.placement_index] = attributes._geometry;
    delete attributes._geometry;
  }

  this.properties[this.placement_index] = attributes;
  this.paths[`${start_node_index}|${end_node_index}`] = obj;

  // add reverse path
  if (isUndirected) {

    const reverse_obj = {
      start: String(end_node_index),
      end: String(start_node_index),
      cost: attributes._cost,
      lookup_index: String(this.placement_index),
      reverse_flag: true
    };

    if (this.adjacency_list[end_node_index]) {
      this.adjacency_list[end_node_index].push(reverse_obj);
    }
    else {
      this.adjacency_list[end_node_index] = [reverse_obj];
    }

    this.paths[`${end_node_index}|${start_node_index}`] = reverse_obj;
  }

  this.placement_index++;

};



Graph.prototype.runDijkstra = function(start, end, options) {

  let outputs = {
    path: true,
    nodelist: true,
    edgelist: true,
    distance: true
  };

  // ['path', 'nodelist', 'edgelist', 'distance'];

  // by default, will produce:
  // path: a geojson feature collection of linestrings
  // nodelist: an ordered array of nodes that trace the path
  // edgelist: an ordered array of edge ids (the `_id` attribute of each edge)
  // distance: the numerical accumulated `_cost` of the path

  // if the options object is sent with an `output` property, it will override
  // the above defaults
  if (options && options.output && Array.isArray(options.output)) {

    outputs = {
      path: false,
      nodelist: false,
      edgelist: false,
      distance: false
    };

    options.output.forEach(o => {
      outputs[o] = true;
    });

  }

  // note that if the network was not generated through imported geoJSON,
  // you will not be able to output a geojson path, and the option will be
  // excluded by default

  if (!this.isGeoJson) {
    outputs.path = false;
  }

  start = this.lookup[start];
  end = this.lookup[end];

  if (!start || !end) {
    throw new Error('origin or destination does not exist on graph');
  }

  // quick exit for start === end
  if (start === end) {
    return {
      distance: 0,
      segments: [],
      route: {
        type: 'FeatureCollection',
        features: []
      }
    };
  }

  const heap = new FibonacciHeap();
  const key_to_nodes = {};

  const dist = {}; // distances to each node
  const prev = {}; // node to parent_node lookup
  const visited = {}; // node has been fully explored

  let current = start;
  dist[current] = 0;

  do {
    this.adjacency_list[current]
      .forEach(n => {
        const node = n.end;

        // this optimization may not hold true for directed graphs
        if (visited[node]) {
          return;
        }

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
    if (current === end) {
      current = '';
    }
  } while (current);

  return this._reconstructRoute(end, prev, outputs);

};


Graph.prototype._reconstructRoute = function(end, prev, outputs) {

  let features = [];
  let edgelist = [];
  let nodelist = [];
  let distance = 0;
  let path = {
    type: 'FeatureCollection',
    features: features
  };

  if (outputs.nodelist) {
    // prefill first node in nodelist
    nodelist.push(this.reverse_lookup[end]);
  }

  while (prev[end]) {

    const lookup = this.paths[`${prev[end]}|${end}`];
    const properties = this.properties[lookup.lookup_index];

    if (outputs.path) {
      const feature = {
        "type": "Feature",
        "properties": properties,
        "geometry": {
          "type": "LineString",
          "coordinates": this.geometry[lookup.lookup_index]
        }
      };
      features.push(feature);
    }

    if (outputs.distance) {
      distance += properties._cost;
    }

    if (outputs.edgelist) {
      edgelist.push(properties._id);
    }

    if (outputs.nodelist) {
      const direction = lookup.reverse_flag;
      const start_node = this.reverse_lookup[lookup.start];
      const end_node = this.reverse_lookup[lookup.end];
      if (direction) {
        nodelist.push(end_node);
      }
      else {
        nodelist.push(start_node);
      }
    }

    end = prev[end];
  }


  if (!outputs.path) {
    path = undefined;
  }
  else {
    path.features.reverse();
  }

  if (!outputs.distance) {
    distance = undefined;
  }

  if (!outputs.edgelist) {
    edgelist = undefined;
  }
  else {
    edgelist.reverse();
  }

  if (!outputs.nodelist) {
    nodelist = undefined;
  }
  else {
    nodelist.reverse();
  }

  return { path, distance, edgelist, nodelist };

};


Graph.prototype.loadFromGeoJson = function(geo) {

  // using loadFromGeoJson enables geojson output
  this.isGeoJson = true;

  const f = Array.isArray(geo) ? geo : geo.features;

  // make a copy
  const copy = JSON.parse(JSON.stringify(f));

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
