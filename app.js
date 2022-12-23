const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router');
const router = new Router();
const cors = require('@koa/cors');

const fs = require('fs/promises');
const multibase = require('multibase');
const assert = require('assert');

// TODO: Refactor into common module?
const STORAGE_PATH = process.env.NEARFS_STORAGE_PATH || './storage';

const serveFile = async ctx => {
    // TODO: Cache?
    const cidStr = ctx.params.cid;
    const cid = Buffer.from(multibase.decode(cidStr));

    const cidVersion = cid[0];
    assert(cidVersion === 1, 'Only CID version 1 is supported');

    const codec = cid[1];
    const hashType = cid[2];
    assert(hashType === 0x12, 'Only SHA-256 is supported');
    const hashSize = cid[3];
    assert(hashSize === 32, 'Wrong SHA-256 hash size');
    const hash = cid.subarray(4, 4 + hashSize);

    if (codec === 0x55) {
        const file = `${STORAGE_PATH}/${hash.toString('hex')}`;

        assert(ctx.params.path === undefined, 'CID points to a file');

        const stat = await fs.stat(file).catch(() => false);
        if (stat && stat.isFile()) {
            // TODO: Detect content-type?
            ctx.body = await fs.readFile(file);
            return;
        }
    } else if (codec === 0x70) {
        assert(false, 'Unsupported codec');
    } else {
        // TODO: Use params.path and follow IPFS stuff
        throw new Error(`Unsupported codec: 0x${codec.toString(16)}`);
    }

    ctx.status = 404;
    ctx.body = 'Not found';
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
