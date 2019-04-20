/**
 * Based on https://github.com/mourner/tinyqueue
 * Copyright (c) 2017, Vladimir Agafonkin https://github.com/mourner/tinyqueue/blob/master/LICENSE
 * 
 * Adapted for PathFinding needs by @anvaka
 * Copyright (c) 2017, Andrei Kashcha
 *
 * Additional inconsequential changes by @royhobbstn
 * 
 **/

module.exports = NodeHeap;

function NodeHeap(data, options) {

  options = options || {};

  this.data = [];
  this.length = 0;

  this.compare = (a, b) => {
    return a.score - b.score;
  };

  this.setNodeId = (nodeSearchState, heapIndex) => {
    nodeSearchState.heapIndex = heapIndex;
  };

}

NodeHeap.prototype = {

  push: function(item) {
    this.data.push(item);
    this.setNodeId(item, this.length);
    this.length++;
    this._up(this.length - 1);
  },

  pop: function() {
    if (this.length === 0) return undefined;

    var top = this.data[0];
    this.length--;

    if (this.length > 0) {
      this.data[0] = this.data[this.length];
      this.setNodeId(this.data[0], 0);
      this._down(0);
    }
    this.data.pop();

    return top;
  },

  peek: function() {
    return this.data[0];
  },

  updateItem: function(pos) {
    this._down(pos);
    this._up(pos);
  },

  _up: function(pos) {
    var data = this.data;
    var compare = this.compare;
    var setNodeId = this.setNodeId;
    var item = data[pos];

    while (pos > 0) {
      var parent = (pos - 1) >> 1;
      var current = data[parent];
      if (compare(item, current) >= 0) break;
      data[pos] = current;

      setNodeId(current, pos);
      pos = parent;
    }

    data[pos] = item;
    setNodeId(item, pos);
  },

  _down: function(pos) {
    var data = this.data;
    var compare = this.compare;
    var halfLength = this.length >> 1;
    var item = data[pos];
    var setNodeId = this.setNodeId;

    while (pos < halfLength) {
      var left = (pos << 1) + 1;
      var right = left + 1;
      var best = data[left];

      if (right < this.length && compare(data[right], best) < 0) {
        left = right;
        best = data[right];
      }
      if (compare(best, item) >= 0) break;

      data[pos] = best;
      setNodeId(best, pos);
      pos = left;
    }

    data[pos] = item;
    setNodeId(item, pos);
  }
};
