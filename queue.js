/**
 * Based on https://github.com/mourner/tinyqueue
 * Copyright (c) 2017, Vladimir Agafonkin https://github.com/mourner/tinyqueue/blob/master/LICENSE
 * 
 * Adapted for PathFinding needs by @anvaka
 * Copyright (c) 2017, Andrei Kashcha
 * 
 * ReAdapted for PathFinding needs by @royhobbstn
 * Copyright (c) 2019, Daniel Trone
 * 
 */
module.exports = NodeHeap;

function NodeHeap() {
  this.keys = [];
  this.values = [];
  this.lookup = {};
  this.length = 0;
}

NodeHeap.prototype = {

  push: function(item, value) {
    this.keys.push(item);
    this.values.push(value);
    this.lookup[item] = this.length; // key to pos lookup
    this.length++;
    this._up(this.length - 1);
  },

  pop: function() {
    if (this.length === 0) return undefined;

    var top_key = this.keys[0];
    // var top_value = this.values[0];
    this.length--;

    if (this.length > 0) {
      this.keys[0] = this.keys[this.length];
      this.values[0] = this.values[this.length];
      this.lookup[this.keys[0]] = 0;
      this._down(0);
    }
    this.keys.pop();
    this.values.pop();

    // delete this.lookup[top_key]; // todo perf??
    return top_key;
  },

  updateItem: function(key, value) {

    const pos = this.lookup[key];
    this.values[pos] = value;
    this._down(pos);
    this._up(pos);
  },

  _up: function(pos) {
    var keys = this.keys;
    var values = this.values;
    var lookup = this.lookup

    var item_key = keys[pos];
    var item_val = values[pos];

    while (pos > 0) {
      var parent = (pos - 1) >> 1;
      var current_key = keys[parent];
      var current_val = values[parent];
      if (item_val - current_val >= 0) break;
      keys[pos] = current_key;
      values[pos] = current_val;
      this.lookup[current_key] = pos;
      pos = parent;
    }

    keys[pos] = item_key;
    values[pos] = item_val;
    this.lookup[item_key] = pos;
  },

  _down: function(pos) {
    var keys = this.keys;
    var values = this.values;
    var lookup = this.lookup;

    var halfLength = this.length >> 1;
    var item_key = keys[pos];
    var item_val = values[pos];

    while (pos < halfLength) {
      var left = (pos << 1) + 1;
      var right = left + 1;
      var best_key = keys[left];
      var best_val = values[left];

      if (right < this.length && (values[right] - best_val) < 0) {
        left = right;
        best_key = keys[right];
        best_val = values[right];
      }
      if ((best_val - item_val) >= 0) break;

      keys[pos] = best_key;
      values[pos] = best_val;
      lookup[best_key] = pos;
      pos = left;
    }

    keys[pos] = item_key;
    values[pos] = item_val;
    lookup[item_key] = pos;
  }
};
