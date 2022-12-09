var PROCESSING = 1;
var EOF = 2;
var CLOSING = 4;
var CLOSED = 8;
var CLOSED_CLOSING = CLOSED | CLOSING;

var Queue = function(concurrency) {
  var self = this;
  if (arguments.length > 1) {
    throw new Error('too many arguments');
  }
  self.concurrency = Queue.parseConcurrency(concurrency);
  self.length = 0;
  self.running = 0;
  self.error = undefined;
  self.stopped = false;
  self.done = undefined;
  self._flags = 0;
  self._array = [];
  // Using a closure is significantly faster than using Function.bind():
  self._callbackBound = function(error) { self._callback(error); };
};

Queue.prototype.concat = function(jobs) {
  var self = this;
  if (!jobs || jobs.constructor !== Array) {
    throw new Error('jobs must be an Array');
  }
  for (var index = 0, length = jobs.length; index < length; index++) {
    self.push(jobs[index]);
  }
};

Queue.prototype.end = function(error) {
  var self = this;
  if (self._flags & EOF) return;
  self._flags |= EOF;
  if (self._flags & CLOSED_CLOSING) return;
  self._tick(error);
};

Queue.prototype.onData = function(job, end) {
  throw new Error('Queue.onData callback must be defined');
};

Queue.prototype.onEnd = function(error) {
  throw new Error('Queue.onEnd callback must be defined');
};

Queue.prototype.push = function(job) {
  var self = this;
  if (self._flags & EOF) {
    throw new Error('Queue.push() was called after Queue.end()');
  }
  if (self._flags & CLOSED_CLOSING) return;
  self._array.push(job);
  self.length++;
  if (!(self._flags & PROCESSING)) self._process();
};

Queue.prototype.stop = function(error) {
  var self = this;
  if (self._flags & CLOSED_CLOSING) return;
  // If error is provided, _tick will set self.error and CLOSING.
  // If we set CLOSING here, _tick will not set self.error.
  if (!error) self._flags |= CLOSING;
  self.stopped = true;
  self._tick(error);
};

Queue.prototype._callback = function(error) {
  var self = this;
  if (self._flags & CLOSED) {
    throw new Error('an onData handler called end() more than once');
  }
  self.length--;
  self.running--;
  self._tick(error);
};

Queue.prototype._process = function() {
  var self = this;
  if (self._flags & CLOSED_CLOSING) return;
  if (self._flags & PROCESSING) return;
  self._flags |= PROCESSING;
  while (self._array.length) {
    if (
      (self._flags & CLOSED_CLOSING) ||
      (self.running >= self.concurrency)
    ) {
      self._flags &= ~PROCESSING;
      return;
    }
    self.running++;
    self.onData(self._array.shift(), self._callbackBound);
  }
  self._flags &= ~PROCESSING;
};

Queue.prototype._tick = function(error) {
  var self = this;
  if (self._flags & CLOSED) return;
  if (self.done !== undefined) {
    throw new Error('deprecated use of `queue.done`');
  }
  if (error && !(self._flags & CLOSING)) {
    self._flags |= CLOSING;
    self.error = error;
  }
  if (self._flags & CLOSING) {
    if (self.running === 0) {
      // If stop() was called then self.error will be undefined.
      // If error was returned then self.error will be defined.
      self._flags |= CLOSED;
      self.onEnd(self.error);
      return;
    } else {
      return;
    }
  }
  if ((self._flags & EOF) && self.length === 0) {
    if (self.running !== 0) {
      throw new Error('running=' + self.running + ' !== 0');
    }
    self._flags |= CLOSED;
    self.onEnd(undefined);
    return;
  }
  self._process();
};

Queue.parseConcurrency = function(concurrency) {
  var self = this;
  if (concurrency === undefined) return 1;
  if (concurrency === false) return 1;
  if (concurrency === true) return 1024;
  if (typeof concurrency !== 'number') {
    throw new Error('concurrency must be a number');
  }
  if (Math.floor(concurrency) !== concurrency) {
    throw new Error('concurrency must be an integer');
  }
  if (concurrency < 1) {
    throw new Error('concurrency must be at least 1');
  }
  return concurrency;
};

module.exports = Queue;
