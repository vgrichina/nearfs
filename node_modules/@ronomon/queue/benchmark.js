var Queue = require('./index.js');

var calls = 0;
var arrays = new Array(5000);
var arraysLength = arrays.length;
while (arraysLength--) {
  var array = new Array(5000);
  var arrayLength = array.length;
  while (arrayLength--) array[arrayLength] = arrayLength;
  arrays[arraysLength] = array;
  calls += array.length;
}

var now = Date.now();
var queue = new Queue(4);
queue.onData = function(element, end) {
  end();
};
queue.onEnd = function(error) {
  var elapsed = Date.now() - now;
  console.log(elapsed + 'ms ' + (elapsed / calls).toFixed(7) + 'ms per job');
};
for (var index = 0, length = arrays.length; index < length; index++) {
  var array = arrays[index];
  var arrayIndex = 0;
  var arrayLength = array.length;
  while (arrayIndex < arrayLength) {
    queue.push(array[arrayIndex++]);
  }
}
queue.end();
