const test = require('tape');

const http = require('http');
const { Writable } = require('stream');
const fs = require('fs').promises;
const { readCAR, readBlock } = require('fast-ipfs');

const storage = require('../src/storage');
const { computeHash } = require('../src/util/hash');
const app = require('../app');
const request = require('supertest')(app.callback());

test('/', async t => {
    const { status, text } = await request.get('/');
    t.isEqual(status, 200);
    t.match(text, /vgrichina\/nearfs/);
});

test('handleSubdomain middleware serves content for valid CID subdomains', async t => {
    await loadCar('test/data/hello.car');

    const { status, text } = await request
        .get('/')
        .set('Host', 'bafybeicit72w2sl3agal2jftpkrzwd773fjgdk4dym7pq2pbojyif72v5e.example.com');

    t.isEqual(status, 200);
    t.isEqual(text, 'Hello, World\n');
});

test('handleSubdomain middleware ignores invalid CID subdomains', async t => {
    const { status, text } = await request
        .get('/')
        .set('Host', 'invalid-cid.example.com');

    t.isEqual(status, 200);
    t.match(text, /vgrichina\/nearfs/);
});

test('handleSubdomain middleware serves content for valid CID subdomains with path', async t => {
    await loadCar('test/data/littlelink.car');

    const { status, headers } = await request
        .get('/css/normalize.css')
        .set('Host', 'bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm.example.com');

    t.isEqual(status, 200);
    t.isEqual(headers['content-type'], 'text/css; charset=utf-8');
});

test('/ipfs/:cid not found', async t => {
    const { status } = await request.get('/ipfs/bafkreib3mbbrhmal34xx7loxzxc4ue36y5rg7wvc24xwryg2j2ozek3p4y');
    t.isEqual(status, 404);
});

test('/ipfs/:cid/:path not found', async t => {
    const { status } = await request.get('/ipfs/bafkreib3mbbrhmal34xx7loxzxc4ue36y5rg7wvc24xwryg2j2ozek3p4y/index.html');
    t.isEqual(status, 404);
});

test('/ipfs/:cid hello.car', async t => {
    await loadCar('test/data/hello.car');

    const { status, text } = await request.get('/ipfs/bafybeicit72w2sl3agal2jftpkrzwd773fjgdk4dym7pq2pbojyif72v5e');
    t.isEqual(status, 200);
    t.isEqual(text, 'Hello, World\n');
});

test('/ipfs/:cid/:path hello.car not found', async t => {
    await loadCar('test/data/hello.car');

    const { status } = await request.get('/ipfs/bafybeicit72w2sl3agal2jftpkrzwd773fjgdk4dym7pq2pbojyif72v5e/no-such-file');
    t.isEqual(status, 404);
});

test('/ipfs/:cid/:path big.car', async t => {
    await loadCar('test/data/big.car');

    const { status, body, headers } = await request.get('/ipfs/bafybeiaietzjdt4rsu2mk6qfymye5bgockic43pwsfm25lchld5wrj5gjq/big/file');
    t.isEqual(status, 200);
    t.isEqual(body.length, 1024 * 1024);
    t.isEqual(headers['content-length'], `${1024 * 1024}`);
    t.true(body.every(b => b === 0, 'body is all zeros'));
});

test('/ipfs/:cid/:path big.car nil directory', async t => {
    await loadCar('test/data/big.car');

    const { status, text } = await request.get('/ipfs/bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354/');
    t.isEqual(status, 200);
    t.isEqual(flattenHtml(text), flattenHtml(`
        <html>
            <head>
                <title>Index of /ipfs/bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354/</title>
            </head>
            <body>
                <h1>Index of /ipfs/bafybeiczsscdsbs7ffqz55asqdf3smv6klcw3gofszvwlyarci47bgf354/</h1>
                <ul>

                </ul>
            </body>
        </html>
    `));
});

test('/ipfs/:cid/:path big.car range', async t => {
    // TODO: Range support
});

test('/ipfs/:cid/:path very-big.car', async t => {
    // This test is accessing 200MB file and should fail without streaming
    await loadCar('test/data/very-big.car');

    const stream = new Writable();
    const bodyChunks = [];
    stream._write = (chunk, encoding, callback) => {
        bodyChunks.push(chunk);
        callback();
    };

    const { statusCode, headers } = await pipeGet(t, { path: '/ipfs/bafybeiehvmncxih5sugl5bkgnkramghsqpylxr6jngvlqrez46a2ojme4m/big-car/large.dat', stream });
    t.isEqual(statusCode, 200);

    const body = Buffer.concat(bodyChunks);
    const ZERO_RANGE_SIZE = 100 * 1024 * 1024;
    const PREFIX = 'prefix\n';
    const SUFFIX = 'suffix\n';
    const MID = 'mid\n';
    const TOTAL_SIZE = 2 * ZERO_RANGE_SIZE + PREFIX.length + SUFFIX.length + MID.length;
    t.isEqual(body.length, TOTAL_SIZE);
    t.isEqual(headers['content-length'], `${TOTAL_SIZE}`);
    t.isEqual(body.subarray(0, PREFIX.length).toString(), PREFIX);
    t.isEqual(body.subarray(ZERO_RANGE_SIZE + PREFIX.length, ZERO_RANGE_SIZE + PREFIX.length + MID.length).toString(), MID);
    t.isEqual(body.subarray(-SUFFIX.length).toString(), SUFFIX);
    t.true(body.subarray(PREFIX.length, ZERO_RANGE_SIZE + PREFIX.length).every(b => b === 0, 'range is all zeros'));
    t.true(body.subarray(PREFIX.length + ZERO_RANGE_SIZE + MID.length, -SUFFIX.length).every(b => b === 0, 'range is all zeros'));
});

// NOTE: This is needed as supertest doesn't stop server properly when piping
function pipeGet(t, { path, stream }) {
    const server = http.createServer(app.callback()).listen(0);
    t.teardown(() => server.close());
    return responsePromise = new Promise((resolve) => {
        http.request({
            hostname: 'localhost',
            port: server.address().port,
            path,
            method: 'GET',
        }, (res) => {
            res.on('end', () => resolve(res));
            res.pipe(stream);
        })
            .on('error', (error) => t.fail(`request error: ${error}`))
            .end();
    });
}

test('/ipfs/:cid/:path littlelink.car not found', async t => {
    await loadCar('test/data/littlelink.car');

    const { status } = await request.get('/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/dist/');
    t.isEqual(status, 404);
});

function flattenHtml(html) {
    return html.split('\n').map(line => line.trim()).join('\n');
}

test('/ipfs/:cid littlelink.car directory listing', async t => {
    await loadCar('test/data/littlelink.car');

    const { status, text } = await request.get('/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/');
    t.isEqual(status, 200);
    t.isEqual(flattenHtml(text), flattenHtml(`
        <html>
            <head>
                <title>Index of /ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/</title>
            </head>
            <body>
                <h1>Index of /ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/</h1>
                <ul>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/css">css</a></li>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/deploy.js">deploy.js</a></li>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images">images</a></li>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/privacy.html">privacy.html</a></li>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/web-wallet-api.js">web-wallet-api.js</a></li>
                </ul>
            </body>
        </html>
    `));
});

test('/ipfs/:cid/:path littlelink.car serve deeper listing', async t => {
    await loadCar('test/data/littlelink.car');

    const { status, text } = await request.get('/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/');
    t.isEqual(status, 200);
    t.isEqual(flattenHtml(text), flattenHtml(`
        <html>
            <head>
                <title>Index of /ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/</title>
            </head>
            <body>
                <h1>Index of /ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/</h1>
                <ul>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/avatar.png">avatar.png</a></li>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/avatar.svg">avatar.svg</a></li>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/avatar@2x.png">avatar@2x.png</a></li>
                    <li><a href="/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/icons">icons</a></li>
                </ul>
            </body>
        </html>
    `));
});

test('/ipfs/:cid littlelink.car detect css mime from path', async t => {
    await loadCar('test/data/littlelink.car');

    const { status, headers } = await request.get('/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/css/normalize.css');
    t.isEqual(status, 200);
    t.isEqual(headers['content-type'], 'text/css; charset=utf-8');
});

test('/ipfs/:cid littlelink.car detect css mime from filename parameter', async t => {
    await loadCar('test/data/littlelink.car');

    const { status, headers } = await request.get('/ipfs/bafkreianuugp6nlqritzbwwaiv7m3q7ffy6ichfo7e6cot5t6okop2fwx4?filename=normalize.css');
    t.isEqual(status, 200);
    t.isEqual(headers['content-type'], 'text/css; charset=utf-8');
});

test('/ipfs/:cid/:path web4.car serve index.html', async t => {
    await loadCar('test/data/web4.car');

    const { status, text } = await request.get('/ipfs/bafybeidg3ohf4kscsf6cjbgg7vttcvu7q4olena3kwhpl5wl3trhhougyi/dist/');
    t.isEqual(status, 200);
    t.match(text, /<title>web4: Unstoppable websites on NEAR blockchain and IPFS\/Filecoin.<\/title>/);
});

test('/ipfs/:cid/:path web4.car redirect if directory misses /', async t => {
    await loadCar('test/data/web4.car');

    const { status, text, headers } = await request.get('/ipfs/bafybeidg3ohf4kscsf6cjbgg7vttcvu7q4olena3kwhpl5wl3trhhougyi/dist');
    t.isEqual(status, 301);
    t.isEqual(headers.location, '/ipfs/bafybeidg3ohf4kscsf6cjbgg7vttcvu7q4olena3kwhpl5wl3trhhougyi/dist/');
    t.isEqual(text, '<a href="/ipfs/bafybeidg3ohf4kscsf6cjbgg7vttcvu7q4olena3kwhpl5wl3trhhougyi/dist/">Moved Permanently</a>.');
});

test('/ipfs/:cid/:path web4.car serve css and detect mime from extension', async t => {
    await loadCar('test/data/web4.car');

    const { status, headers } = await request.get('/ipfs/bafybeidg3ohf4kscsf6cjbgg7vttcvu7q4olena3kwhpl5wl3trhhougyi/dist/normalize.css');
    t.isEqual(status, 200);
    t.match(headers['content-type'], /^text\/css/);
});

test('handleSubdomain middleware serves directory listing for valid CID subdomains', async t => {
    await loadCar('test/data/littlelink.car');

    const { status, text } = await request
        .get('/')
        .set('Host', 'bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm.example.com');

    t.isEqual(status, 200);
    t.isEqual(flattenHtml(text), flattenHtml(`
        <html>
            <head>
                <title>Index of /ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/</title>
            </head>
            <body>
                <h1>Index of /ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/</h1>
                <ul>
                    <li><a href="/css">css</a></li>
                    <li><a href="/deploy.js">deploy.js</a></li>
                    <li><a href="/images">images</a></li>
                    <li><a href="/privacy.html">privacy.html</a></li>
                    <li><a href="/web-wallet-api.js">web-wallet-api.js</a></li>
                </ul>
            </body>
        </html>
    `));
});

test('handleSubdomain middleware serves nested directory listing for valid CID subdomains', async t => {
    await loadCar('test/data/littlelink.car');

    const { status, text } = await request
        .get('/images/')
        .set('Host', 'bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm.example.com');

    t.isEqual(status, 200);
    t.isEqual(flattenHtml(text), flattenHtml(`
        <html>
            <head>
                <title>Index of /ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/</title>
            </head>
            <body>
                <h1>Index of /ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/images/</h1>
                <ul>
                    <li><a href="/images/avatar.png">avatar.png</a></li>
                    <li><a href="/images/avatar.svg">avatar.svg</a></li>
                    <li><a href="/images/avatar@2x.png">avatar@2x.png</a></li>
                    <li><a href="/images/icons">icons</a></li>
                </ul>
            </body>
        </html>
    `));
});

async function loadCar(carFile) {
    const carData = await fs.readFile(carFile);
    const [, ...rawBlocks] = await readCAR(carData);
    for (const rawBlock of rawBlocks) {
        const block = await readBlock(rawBlock.data);
        const hash = await computeHash(block.data);
        await storage.writeBlock(hash, block.data);
    }
}
