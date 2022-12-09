# queue

Process thousands of asynchronous or synchronous jobs, concurrently or
sequentially, safely and efficiently, without creating thousands of closures.

## Installation

`@ronomon/queue` has no dependencies.

```
npm install @ronomon/queue
```

## Usage

**var queue = new Queue([concurrency])**

* `concurrency` An integer >= 1, the maximum number of jobs to run concurrently. **Default: `1`**

Example:

```javascript
var Queue = require('@ronomon/queue');

var queue = new Queue(4);
queue.onData = function(integer, end) {
  console.log('Processing ' + integer + '...');
  // Notify the queue that we are done processing job:
  end();
};
queue.onEnd = function(error) {
  if (error) throw error;
  console.log('Done');
};
queue.push(1);
queue.push(2);
queue.push(3);
queue.push(4);
queue.push(5);
queue.push(6);
queue.push(7);
queue.push(8);
queue.push(9);
queue.push(10);
// Notify the queue that we are done pushing jobs:
queue.end();
```

**queue.onData = function(job, end) { end() }**

* `job` A job which was pushed individually or pushed as part of an `Array` of
jobs.
* `end` A callback for `onData()` to call when `onData()` has finished
processing `job`.

A function which must be provided and which will be called once for each job. If
an error is encountered while processing the job, this can be passed to the
`end` callback to stop the queue and return an error to the `onEnd()` function.

**queue.onEnd = function([error]) {}**

* `error` An error encountered (if any) while pushing jobs onto the queue, or
while processing jobs in the queue.

A function which must be provided and which will be called once `queue.end()`
has been called and once all running and pending jobs in the queue complete. If
an error is encountered, then `onEnd(error)` will be called as soon as all
running jobs complete. If the queue is stopped using `stop()`, then `onEnd()`
will be called as soon as all running jobs complete.

**queue.push(job)**

* `job` Any object, will be passed to the `onData()` function.

**queue.concat(jobs)**

* `jobs` An Array of jobs, each of which will be passed to the `onData()`
function.

**queue.end()**

Notify the queue that no further jobs will be pushed. The queue will wait for
all running and all pending jobs to complete, and will then call the `onEnd()`
function. `queue.end()` is idempotent, successive calls will be ignored.

**queue.end(error)**

* `error` An error encountered while pushing jobs onto the queue.

Notify the queue that no further jobs will be pushed because an error was
encountered while pushing jobs onto the queue. The queue will ignore any pending
jobs, will wait for all running jobs to complete, and will then call the
`onEnd()` function. The `onEnd()` function will be called with the same `error`,
if no jobs return a different `error` before `queue.end(error)` is called. `queue.end(error)` is idempotent, successive calls will be ignored.

**queue.stop([error])**

* `error` An error encountered while pushing jobs onto the queue, or while
processing jobs in the queue.

An optional method to notify the queue that any pending jobs should be ignored.
The queue will ignore any pending jobs, will wait for all running jobs to
complete, and will then call the `onEnd()` function. If no `error` argument is
provided, then the `onEnd()` function will be called without an `error`,
provided no jobs return an `error` before `stop()` is called (if any running
  jobs return an `error` after `stop()` is called, their errors will be
  ignored). `stop()` is idempotent, successive calls will be ignored.

There are several differences between `stop()` and `queue.end()`. `stop()` will
ignore any pending jobs, whereas `queue.end()` will wait for all pending jobs to
complete before calling the `onEnd()` function. A successive call to
`queue.end(error)` will be ignored if `queue.end()` has already been called,
whereas `stop(error)` will stop the queue even if `queue.end()` has already been
called.

## Tests

`@ronomon/queue` ships with a long-running fuzz test:

```
node test.js
```

## Benchmark

To benchmark the cost of the queue implementation:

```
node benchmark.js
```
