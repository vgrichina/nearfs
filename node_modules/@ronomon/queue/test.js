var Queue = require('./index.js');

// Keep the test alive in the face of silent test run errors.
var testInterval = setInterval(function() {}, 1000);

var random = Math.random.bind(Math);

function pad(integer, width) {
  if (typeof integer !== 'number') {
    throw new Error('integer must be a number');
  }
  if (typeof width !== 'number') {
    throw new Error('width must be a number');
  }
  if (Math.floor(width) !== width) {
    throw new Error('width must be an integer');
  }
  if (width < 1) {
    throw new Error('width must be >= 1');
  }
  var string = String(integer);
  while (string.length < width) {
    string = '0' + string;
  }
  return string;
}

function randomConcurrency() {
  if (random() < 0.2) {
    if (random() < 0.5) return undefined;
    if (random() < 0.5) return false;
    return 1;
  } else {
    if (random() < 0.3) return true;
    if (random() < 0.5) return 2 + Math.ceil(random() * 10);
    return Math.ceil(random() * 1024);
  }
}

function test(testCount, end) {
  var label = 'Queue ' + pad(testCount, 4) + ': ';
  var started = {};
  var stopped = {};
  var expected = 1;
  var concurrency = randomConcurrency();
  var queue = new Queue(concurrency);
  var total = Math.round(random() * 1000);
  var pushed = 0;
  var running = 0;
  var length = 0;
  var closed = false;
  var closing = false;
  var errorValue;
  var timeout = setTimeout(
    function() {
      if (!closed) throw new Error(label + 'stalled');
    },
    total * 200 // This is 20x the delay per call we expect.
  );
  function assert() {
    if (concurrency === undefined || concurrency === false) {
      if (queue.concurrency !== 1) {
        throw new Error('queue.concurrency=' + queue.concurrency + ' !== 1');
      }
    } else if (concurrency === true) {
      if (queue.concurrency < 10) {
        throw new Error('queue.concurrency=' + queue.concurrency + ' < true');
      }
    } else {
      if (queue.concurrency !== concurrency) {
        throw new Error(
          'queue.concurrency=' + queue.concurrency + ' !== ' + concurrency
        );
      }
    }
    if (queue.length !== length) {
      throw new Error('queue.length=' + queue.length + ' !== ' + length);
    }
    if (queue.running !== running) {
      throw new Error('queue.running=' + queue.running + ' !== ' + running);
    }
    if (queue.running > queue.concurrency) {
      throw new Error(
        'queue.running=' + queue.running +
        ' > queue.concurrency=' + queue.concurrency
      );
    }
  }
  queue.onData = function(job, end) {
    if (job !== expected) {
      throw new Error('job=' + job + ' !== expected=' + expected);
    }
    if (typeof end !== 'function') {
      throw new Error('job=' + job + ' typeof end !== function');
    }
    if (started.hasOwnProperty(job)) {
      throw new Error('job=' + job + ' already started');
    }
    running++;
    expected++;
    started[job] = true;
    function finish() {
      assert();
      delete started[job];
      stopped[job] = true;
      running--;
      length--;
      if (random() < 0.01) {
        closing = true;
        console.log(
          label +
          pad(job, 4) + ' / ' + pad(total, 4) +
          ' calling queue.stop()'
        );
        queue.stop();
      } else if (random() < 0.01) {
        var error = 'job' + job;
        if (!closing) {
          closing = true;
          if (errorValue === undefined) errorValue = error;
        }
        if (random() < 0.5) {
          console.log(
            label +
            pad(job, 4) + ' / ' + pad(total, 4) +
            ' calling end(error=' + error + ')'
          );
          return end(error);
        } else {
          console.log(
            label +
            pad(job, 4) + ' / ' + pad(total, 4) +
            ' calling queue.stop(error=' + error + ')'
          );
          queue.stop(error);
          // Do not return here, we must still call end().
        }
      }
      end();
    }
    console.log(
      label +
      pad(job, 4) + ' / ' + pad(total, 4) +
      ' concurrency=' + pad(queue.concurrency, 4) +
      ' length=' + pad(length, 4) +
      ' running=' + pad(running, 4)
    );
    if (random() < 0.5) return finish();
    assert();
    setTimeout(finish, Math.round(random() * 10));
  };
  queue.onEnd = function(error) {
    clearTimeout(timeout);
    if (closed) {
      throw new Error('onEnd called more than once');
    }
    closed = true;
    if (errorValue) {
      if (error !== errorValue) {
        throw new Error('error=' + error + ' !== ' + errorValue);
      }
      if (queue.error !== errorValue) {
        throw new Error('queue.error=' + queue.error + ' !== ' + errorValue);
      }
    } else {
      if (error !== undefined) {
        throw new Error('error=' + error + ' !== undefined');
      }
      if (queue.error !== undefined) {
        throw new Error('queue.error=' + queue.error + ' !== undefined ');
      }
    }
    if (closing) {
      if (!errorValue) {
        if (queue.stopped !== true) {
          throw new Error('queue.stopped !== true');
        }
      }
    } else {
      if (queue.stopped !== false) {
        throw new Error('queue.stopped !== false');
      }
    }
    if (Object.keys(started).length !== 0) {
      console.log('started=' + Object.keys(started).join(','));
      throw new Error(
        'onEnd started=' + Object.keys(started).length + ' !== 0'
      );
    }
    if (running !== 0) {
      throw new Error('onEnd running=' + running + ' !== 0');
    }
    var completed = pushed - length;
    if (Object.keys(stopped).length !== completed) {
      console.log('queue.running=' + queue.running);
      console.log('queue.length=' + queue.length);
      console.log('stopped=' + Object.keys(stopped).join(','));
      throw new Error(
        'onEnd stopped=' + Object.keys(stopped).length +
        ' !== (pushed=' + pushed + ' - length=' + length + ')=' +
        (pushed - length)
      );
    }
    if (!closing) {
      if (length !== 0) {
        throw new Error('onEnd length=' + length + ' !== 0');
      }
    }
    assert();
    console.log(
      label +
      pad(completed, 4) + ' / ' + pad(total, 4) +
      ' concurrency=' + pad(queue.concurrency, 4) +
      ' length=' + pad(length, 4) +
      ' running=' + pad(running, 4) +
      (error ? ' error=' + error : ' success')
    );
    end();
  };
  var jobs = new Array(total);
  var jobsLength = jobs.length;
  while (jobsLength--) jobs[jobsLength] = jobsLength + 1;
  var calls = 0;
  function callPush() {
    if (calls++ > 200 || random() < 0.05) {
      setTimeout(push, Math.round(random() * 2));
    } else {
      push();
    }
  }
  function push() {
    if (jobs.length) {
      if (!closing) {
        pushed++;
        length++;
      }
      queue.push(jobs.shift());
      if (!closing && queue.running === 0 && queue.length === pushed && pushed > 0) {
        console.log('length=' + length);
        console.log('pushed=' + pushed);
        console.log(queue);
        throw new Error('queue.push() should trigger processing');
      }
      callPush();
    } else {
      if (random() < 0.1) {
        var error = 'queue.end';
        if (!closing) {
          closing = true;
          if (errorValue === undefined) errorValue = error;
        }
        console.log(label + 'calling queue.end(error=' + error + ')');
        queue.end(error);
      } else {
        queue.end();
      }
      if (queue.running === 0 && !closed) {
        console.log(queue);
        throw new Error('queue.end() should trigger onEnd()');
      }
      if (random() < 0.01) {
        if (random() < 0.5) {
          queue.end();
        } else {
          queue.end('ignore error');
        }
      }
      if (random() < 0.01) {
        try {
          queue.push(0);
        } catch (exception) {
          return;
        }
        throw new Error('queue.push() called after end() without exception');
      }
    }
  }
  if (random() < 0.01) {
    closing = true;
    console.log(label + 'calling queue.stop() before push()');
    queue.stop();
    if (random() < 0.5) {
      queue.stop('ignore error');
    }
  }
  callPush();
}

var testCount = 1;
var testMax = 1000;
function run(error) {
  if (error) throw error;
  if (testCount++ === testMax) {
    clearInterval(testInterval);
    // Wait for any delayed queue.end calls to finish:
    // These might be running after a queue has terminated early through error.
    setTimeout(
      function() {
        console.log('');
        console.log('PASSED ALL TESTS');
        console.log('');
      },
      2000
    );
    return;
  }
  test(testCount, run);
}
run();
