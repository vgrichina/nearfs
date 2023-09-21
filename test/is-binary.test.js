
const test = require('tape');

const { isBinary } = require('../src/util/is-binary');

test('suspected protobuf should not crash', async t => {
    t.notOk(isBinary(Buffer.from('Hello, World\x03hey hey hey\x03icecream so good')));
});

test('text should not be binary', async t => {
    t.notOk(isBinary(Buffer.from('Hello, World')));
    t.notOk(isBinary(Buffer.from('Привіт, світ!', 'utf8')));
});
