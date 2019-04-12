//
const FibonacciHeap = require('@tyriar/fibonacci-heap').FibonacciHeap;

exports.Graph = Graph;

function Graph() {
  this.adjacency_list = {};
  this.geometry = {};
  this.properties = {};
  this.paths = {};
  this.lookup = {};
}


Graph.prototype.addEdge = function(startNode, endNode, attributes, isUndirected) {

  let start_node_index = undefined;
  let end_node_index = undefined;
  let lookup_index = Object.keys(this.properties).length;

  // number of nodes in lookup
  let node_index = Object.keys(this.lookup).length;

  // check to see if startNode is in lookup
  if (!this.lookup[startNode]) {
    // if not, add it
    this.lookup[startNode] = String(node_index);
    start_node_index = String(node_index);
    node_index++;
  }
  else {
    start_node_index = this.lookup[startNode];
  }

  // check to see if endNode is in lookup
  if (!this.lookup[endNode]) {
    // if not, add it
    this.lookup[endNode] = String(node_index);
    end_node_index = String(node_index);
  }
  else {
    end_node_index = this.lookup[endNode];
  }

  // create object to push into adjacency list
  const obj = {
    start: String(start_node_index),
    end: String(end_node_index),
    cost: attributes._cost,
    lookup_index: String(lookup_index),
    reverse_flag: false
  };

  // add edge to adjacency list; check to see if start node exists;
  if (this.adjacency_list[start_node_index]) {
    this.adjacency_list[start_node_index].push(obj);
  }
  else {
    this.adjacency_list[start_node_index] = [obj];
  }

  this.properties[lookup_index] = attributes;
  this.paths[`${start_node_index}|${end_node_index}`] = obj;

  // add reverse path
  if (isUndirected) {

    const reverse_obj = {
      start: String(end_node_index),
      end: String(start_node_index),
      cost: attributes._cost,
      lookup_index: String(lookup_index),
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

};



Graph.prototype.runDijkstra = function(start, end) {

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

  return this._reconstructRoute(end, prev);

};


Graph.prototype._reconstructRoute = function(end, prev) {

  const features = [];
  const segments = [];
  let distance = 0;

  while (prev[end]) {
    // const lookup_index = this.paths[`${end}|${prev[end]}`].lookup_index;

    const lookup_index = this.paths[`${prev[end]}|${end}`].lookup_index;
    const properties = this.properties[lookup_index];
    const feature = {
      "type": "Feature",
      "properties": properties,
      "geometry": {
        "type": "LineString",
        "coordinates": this.geometry[lookup_index]
      }
    };
    features.push(feature);
    distance += properties._cost;
    segments.push(properties._id);
    end = prev[end];
  }

  const route = {
    type: 'FeatureCollection',
    features: features
  };

  return { route, distance, segments };

};


Graph.prototype.loadFromGeoJson = function(geo) {
  const f = Array.isArray(geo) ? geo : geo.features;

  // make a copy
  const copy = JSON.parse(JSON.stringify(f));

  // cleans geojson (mutates in place)
  const features = this._cleanseGeoJsonNetwork(copy);

  let incrementor = 0;

  features.forEach((feature, index) => {
    const coordinates = feature.geometry.coordinates;

    if (!feature.properties || !coordinates || !feature.properties._cost) {
      console.log('invalid feature detected.  skipping...');
      return;
    }

    this.geometry[index] = coordinates;
    this.properties[index] = feature.properties;

    const start_vertex = coordinates[0].join(',');
    const end_vertex = coordinates[coordinates.length - 1].join(',');

    let start_id;

    if (!this.lookup[start_vertex]) {
      incrementor++;
      this.lookup[start_vertex] = incrementor;
      start_id = incrementor;
    }
    else {
      start_id = this.lookup[start_vertex];
    }

    let end_id;

    if (!this.lookup[end_vertex]) {
      incrementor++;
      this.lookup[end_vertex] = incrementor;
      end_id = incrementor;
    }
    else {
      end_id = this.lookup[end_vertex];
    }

    // forward path
    if (feature.properties._direction === 'f' || feature.properties._direction === 'all' || !feature.properties._direction) {

      const forward_cost = feature.properties._forward_cost || feature.properties._cost;

      const edge_obj = {
        start: start_id,
        end: end_id,
        cost: forward_cost,
        lookup_index: index,
        reverse_flag: false
      };

      const proposed_path = this.paths[`${start_id}|${end_id}`];
      if (!proposed_path) {
        // guard against identical longer edge
        this.paths[`${start_id}|${end_id}`] = edge_obj;
      }
      else if (forward_cost < proposed_path.cost) {
        this.paths[`${start_id}|${end_id}`] = edge_obj;
      }

      if (!this.adjacency_list[start_id]) {
        this.adjacency_list[start_id] = [edge_obj];
      }
      else {
        this.adjacency_list[start_id].push(edge_obj);
      }

    }

    // reverse path
    if (feature.properties._direction === 'b' || feature.properties._direction === 'all' || !feature.properties._direction) {

      const reverse_cost = feature.properties._backward_cost || feature.properties._cost;

      const edge_obj_reverse = {
        start: end_id,
        end: start_id,
        cost: reverse_cost,
        lookup_index: index,
        reverse_flag: true
      };

      const proposed_path = this.paths[`${end_id}|${start_id}`];
      if (!proposed_path) {
        // guard against identical longer edge
        this.paths[`${end_id}|${start_id}`] = edge_obj_reverse;
      }
      else if (reverse_cost < proposed_path.cost) {
        this.paths[`${end_id}|${start_id}`] = edge_obj_reverse;
      }

      if (!this.adjacency_list[end_id]) {
        this.adjacency_list[end_id] = [edge_obj_reverse];
      }
      else {
        this.adjacency_list[end_id].push(edge_obj_reverse);
      }

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
