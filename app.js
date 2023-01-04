const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router');
const router = new Router();
const cors = require('@koa/cors');

const fs = require('fs/promises');
const multibase = require('multibase');
const assert = require('assert');
const mime = require('mime-types');
const { Magic, MAGIC_MIME } = require('mmmagic');
const isHtml = require('is-html');

const { readPBNode, cidToString, readCID } = require('fast-ipfs');

const magic = new Magic(MAGIC_MIME);

// TODO: Refactor into common module?
const STORAGE_PATH = process.env.NEARFS_STORAGE_PATH || './storage';

const fileExists = async (file) => {
    const stat = await fs.stat(file).catch(() => false);
    return stat && stat.isFile();
};

const serveFile = async ctx => {
    const rootCid = Buffer.from(multibase.decode(ctx.params.cid));
    const path = ctx.params.path;
    const { fileData, node, cid } = await getFile(rootCid, path);
    if (fileData) {
        if (ctx.params.path?.includes('.')) {
            ctx.type = mime.lookup(path);
        } else if (isHtml(fileData.toString('utf8'))) {
            // TODO: Check if this check is fast enough
            ctx.type = 'text/html';
        } else {
            const detected = await new Promise((resolve, reject) => magic.detect(fileData, (err, result) => err ? reject(err) : resolve(result)));
            ctx.type = detected;
        }

        // Set cache control header to indicate that resource never expires
        ctx.set('Cache-Control', 'public, max-age=29030400, immutable');

        // Return CID-based Etag like IPFS gateways
        ctx.set('Etag', `W/"${cidToString(cid)}"`);

        ctx.body = fileData;
        return;
    }

    if (node) {
        // List directory content as HTML
        ctx.type = 'text/html';
        // TODO: Different Etag header format for directory listings?
        // TODO: What should be Cache-Control
        // Return CID-based Etag like IPFS gateways
        ctx.set('Etag', `W/"${cidToString(cid)}"`);
        ctx.body = `
            <html>
                <body>
                    <h1>Index of /ipfs/${cidToString(cid)}/${path}</h1>
                    <ul>${node.links.map(link => `<li><a href="${`/ipfs/${cidToString(link.cid)}`}">${link.name}</a></li>`).join('\n')}
                    </ul>
                </body>
            </html>
        `;
    }

    ctx.status = 404;
    ctx.body = 'Not found';
}

const getFile = async (cid, path) => {
    console.log('getFile', cidToString(cid), path);
    // TODO: Cache ?
    const { codec, hash } = readCID(cid);

    const file = `${STORAGE_PATH}/${hash.toString('hex')}`;

    if (codec === 0x55) {
        assert(!path, 'CID points to a file');

        if (await fileExists(file)) {
            const blockData = await fs.readFile(file);
            return { fileData: blockData, cid, codec };
        }
    } else if (codec === 0x70) {
        const blockData = await fs.readFile(file);
        const node = readPBNode(blockData);

        if (path) {
            const pathParts = path.split('/');
            const link = node.links.find(link => link.name === pathParts[0]);

            return await getFile(link.cid, pathParts.slice(1).join('/'));
        }

        const link = node.links.find(link => link.name === 'index.html');

        if (link) {
            return await getFile(link.cid);
        }

        // CID points to a directory without index.html
        return { node, cid, codec };
    } else {
        throw new Error(`Unsupported codec: 0x${codec.toString(16)} `);
    }
};

router.get('/', async ctx => {
    ctx.body = `<h1>Welcome to NEARFS!</h1>

        <p>See <a href="https://github.com/vgrichina/nearfs">https://github.com/vgrichina/nearfs</a> for more information.
    `;
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

    if (['yes', 'true'].includes((process.env.NEARFS_LOAD_NEAR_LAKE || '').toLowerCase())) {
        const { loadStream } = require('./scripts/load-from-near-lake');
        const fs = require('fs');

        const STORAGE_PATH = process.env.NEARFS_STORAGE_PATH || './storage';
        const startHeightPath = `${STORAGE_PATH}/latest_block_height`;
        const startBlockHeight = (fs.statSync(startHeightPath, { throwIfNoEntry: false }) && parseInt(fs.readFileSync(startHeightPath, { encoding: 'utf8' })))
            || process.env.NEARFS_DEFAULT_START_BLOCK_HEIGHT || 0;
        loadStream({
            startBlockHeight,
            bucketName: process.env.NEARFS_LAKE_BUCKET_NAME,
            regionName: process.env.NEARFS_LAKE_REGION_NAME,
            endpoint: process.env.NEARFS_LAKE_ENDPOINT,
            batchSize: process.env.NEARFS_LAKE_BATCH_SIZE,
            incude: process.env.NEARFS_LAKE_INCLUDE,
            exclude: process.env.NEARFS_LAKE_EXCLUDE,
        }).catch(err => {
            console.error(err)
            process.exit(1);
        });
    }
}
