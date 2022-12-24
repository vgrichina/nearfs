const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router');
const router = new Router();
const cors = require('@koa/cors');

const fs = require('fs/promises');
const multibase = require('multibase');
const assert = require('assert');
const mime = require('mime-types');

const { readPBNode, cidToString } = require('fast-ipfs');

// TODO: Refactor into common module?
const STORAGE_PATH = process.env.NEARFS_STORAGE_PATH || './storage';

const fileExists = async (file) => {
    const stat = await fs.stat(file).catch(() => false);
    return stat && stat.isFile();
};

const serveFile = async ctx => {
    const fileData = await getFile(ctx.params.cid, ctx.params.path);
    if (fileData) {
        if (ctx.params.path?.includes('.')) {
            ctx.type = mime.lookup(ctx.params.path);
        }
        ctx.body = fileData;
        return;
    }

    ctx.status = 404;
    ctx.body = 'Not found';
}

const getFile = async (cidStr, path) => {
    console.log('getFile', cidStr, path);
    // TODO: Cache ?
    const cid = Buffer.from(multibase.decode(cidStr));

    const cidVersion = cid[0];
    assert(cidVersion === 1, 'Only CID version 1 is supported');

    const codec = cid[1];
    const hashType = cid[2];
    assert(hashType === 0x12, 'Only SHA-256 is supported');
    const hashSize = cid[3];
    assert(hashSize === 32, 'Wrong SHA-256 hash size');
    const hash = cid.subarray(4, 4 + hashSize);

    const file = `${STORAGE_PATH}/${hash.toString('hex')}`;

    if (codec === 0x55) {
        assert(!path, 'CID points to a file');

        if (await fileExists(file)) {
            const blockData = await fs.readFile(file);
            return blockData;
        }
    } else if (codec === 0x70) {
        assert(!!path, 'CID points to a directory, path is required');
        // TODO: List directories?

        const blockData = await fs.readFile(file);
        const node = readPBNode(blockData);
        const pathParts = path.split('/');
        const link = node.links.find(link => link.name === pathParts[0]);

        return await getFile(cidToString(link.cid), pathParts.slice(1).join('/'));
    } else {
        throw new Error(`Unsupported codec: 0x${codec.toString(16)}`);
    }
};

router.get('/', async ctx => {
    ctx.body = 'Hello World!';
});

router.get('/ipfs/:cid/:path', serveFile);
router.get('/ipfs/:cid', serveFile);

app
    .use(async (ctx, next) => {
        console.log(ctx.method, ctx.path);
        await next();
    })
    .use(cors({ credentials: true }))
    .use(router.routes())
    .use(router.allowedMethods());

module.exports = app;

// Check if module is included or run directly
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT);
    console.log('Listening on http://localhost:%d/', PORT);
}
