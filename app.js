const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router');
const router = new Router();
const cors = require('@koa/cors');

const fs = require('fs/promises');

// TODO: Refactor into common module?
const STORAGE_PATH = process.env.NEARFS_STORAGE_PATH || './storage';

const serveFile = async ctx => {
    // TODO: Cache?
    const file = `${STORAGE_PATH}/${ctx.params.cid}`;

    // TODO: Use params.path and follow IPFS stuff

    const stat = await fs.stat(file).catch(() => false);
    if (stat && stat.isFile()) {
        // TODO: Detect content-type?
        ctx.body = await fs.readFile(file);
    } else {
        ctx.status = 404;
        ctx.body = 'Not found';
    }
};

router.get('/', async ctx => {
    ctx.body = 'Hello World!';
});

router.get('/ipfs/:cid', serveFile);
router.get('/ipfs/:cid/:path', serveFile);

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
