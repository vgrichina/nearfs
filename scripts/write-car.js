const fs = require('fs').promises;
const { readCID, readCAR, readBlock } = require('fast-ipfs');
const meow = require('meow');
const storage = require('../src/storage');

const cli = meow(`
    Usage
        write-car <car-file>

`, {
    flags: {
    },
});

// TODO: Check number of arguments given and give usage info
const [srcFile, accountId] = cli.input;

(async () => {
    const carBuffer = await fs.readFile(srcFile);
    const blocks = readCAR(carBuffer).slice(1).map(b => readBlock(b.data));
    for (const block of blocks) {
        const { data, cid } = block;
        const { hash } = readCID(cid);
        await storage.writeBlock(hash, data);
    }
})();