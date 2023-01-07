const test = require('tape');

const fs = require('fs').promises;
const { readCAR, readBlock } = require('fast-ipfs');

const storage = require('../src/storage');
const app = require('../app');
const request = require('supertest')(app.callback());

test('/', async t => {
    const response = await request.get('/');
    t.isEqual(response.status, 200);
    t.match(response.text, /vgrichina\/nearfs/);
});

test('/ipfs/:cid not found', async t => {
    const response = await request.get('/ipfs/bafkreib3mbbrhmal34xx7loxzxc4ue36y5rg7wvc24xwryg2j2ozek3p4y');
    t.isEqual(response.status, 404);
});

test('/ipfs/:cid/:path not found', async t => {
    const response = await request.get('/ipfs/bafkreib3mbbrhmal34xx7loxzxc4ue36y5rg7wvc24xwryg2j2ozek3p4y/index.html');
    t.isEqual(response.status, 404);
});

test('/ipfs/:cid hello', async t => {
    await loadCar('test/data/hello.car');

    const response = await request.get('/ipfs/bafybeicit72w2sl3agal2jftpkrzwd773fjgdk4dym7pq2pbojyif72v5e');
    t.isEqual(response.status, 200);
    t.isEqual(response.text, 'Hello, World\n');
});

async function loadCar(carFile) {
    const carData = await fs.readFile(carFile);
    const [, ...rawBlocks] = await readCAR(carData);
    for (const rawBlock of rawBlocks) {
        const block = await readBlock(rawBlock.data);
        await storage.hashAndWriteBlock(block.data);
    }
}
