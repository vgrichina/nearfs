const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router');
const router = new Router();
const cors = require('@koa/cors');

const multibase = require('multibase');
const assert = require('assert');
const mime = require('mime-types');
const { Magic, MAGIC_MIME } = require('mmmagic');
const isHtml = require('is-html');

const { readPBNode, cidToString, readCID, CODEC_RAW, CODEC_DAG_PB, readUnixFSData } = require('fast-ipfs');
const storage = require('./src/storage');

const magic = new Magic(MAGIC_MIME);

const serveFile = async ctx => {
    const rootCid = Buffer.from(multibase.decode(ctx.params.cid));
    const path = ctx.params.path || '';
    const expectDirectory = ctx.path.endsWith('/');
    const { fileData, node, cid } = await getFile(rootCid, path, { useIndexHTML: expectDirectory });
    if (fileData) {
        if (ctx.params.path?.includes('.')) {
            ctx.type = mime.lookup(path);
        } else {
            const detected = await new Promise((resolve, reject) => magic.detect(fileData, (err, result) => err ? reject(err) : resolve(result)));
            ctx.type = detected;
            if (detected.startsWith('text/') && isHtml(fileData.toString('utf8'))) {
                ctx.type = 'text/html';
            }
        }

        // Set cache control header to indicate that resource never expires
        ctx.set('Cache-Control', 'public, max-age=29030400, immutable');

        // Return CID-based Etag like IPFS gateways
        ctx.set('Etag', `W/"${cidToString(cid)}"`);

        ctx.body = fileData;
        return;
    }

    if (node) {
        if (!expectDirectory) {
            ctx.redirect(ctx.path + '/');
            ctx.status = 301;
            ctx.body = `<a href="${ctx.path}/">Moved Permanently</a>.`;
            return;
        }

        // List directory content as HTML
        ctx.type = 'text/html';
        // TODO: Different Etag header format for directory listings?
        // TODO: What should be Cache-Control
        // Return CID-based Etag like IPFS gateways
        ctx.set('Etag', `W/"${cidToString(cid)}"`);
        const ipfsPath = `/ipfs/${cidToString(rootCid)}/${path || ''}`;
        ctx.body = `
            <html>
                <head>
                    <title>Index of ${ipfsPath}</title>
                </head>
                <body>
                    <h1>Index of ${ipfsPath}</h1>
                    <ul>
                        ${node.links.map(link => `<li><a href="${ipfsPath}${link.name}">${link.name}</a></li>`).join('\n')}
                    </ul>
                </body>
            </html>
        `;
        return;
    }

    ctx.status = 404;
    ctx.body = 'Not found';
}

const getFile = async (cid, path, { useIndexHTML }) => {
    console.log('getFile', cidToString(cid), path);
    // TODO: Cache ?
    const { codec, hash } = readCID(cid);

    const blockData = await storage.readBlock(hash);
    if (!blockData) {
        // File not found
        return {};
    }

    if (codec === CODEC_RAW) {
        assert(!path, 'CID points to a file');
        return { fileData: blockData, cid, codec };
    } else if (codec === CODEC_DAG_PB) {
        const blockData = await storage.readBlock(hash);
        const node = readPBNode(blockData);

        if (path) {
            const pathParts = path.split('/');
            const link = node.links.find(link => link.name === pathParts[0]);

            if (!link) {
                // File not found
                return {};
            }

            return await getFile(link.cid, pathParts.slice(1).join('/'), { useIndexHTML });
        }

        if (node.data && node.links.length === 0) {
            return { fileData: readUnixFSData(node.data).data, cid, codec };
        }

        // if all links empty, this is just file split into chunks
        if (node.links.every(link => link.name === '')) {
            const chunks = await Promise.all(node.links.map(link => storage.readBlock(readCID(link.cid).hash)));
            return { fileData: Buffer.concat(chunks), cid, codec };
        }

        if (useIndexHTML) {
            const link = node.links.find(link => link.name === 'index.html');

            if (link) {
                return await getFile(link.cid, '', { useIndexHTML: false });
            }
        }

        // CID points to a directory without index.html (or useIndexHTML is false)
        return { node, cid, codec };
    } else {
        throw new Error(`Unsupported codec: 0x${codec.toString(16)} `);
    }

    throw new Error('Shouldn\'t go here');
};

router.get('/', async ctx => {
    ctx.body = `<h1>Welcome to NEARFS!</h1>

        <p>See <a href="https://github.com/vgrichina/nearfs">https://github.com/vgrichina/nearfs</a> for more information.
    `;
});

router.get('/ipfs/:cid/:path(.+)', serveFile);
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
    (async () => {
        const PORT = process.env.PORT || 3000;
        app.listen(PORT);
        console.log('Listening on http://localhost:%d/', PORT);

        const INIT_STORAGE = ['yes', 'true'].includes((process.env.NEARFS_INIT_STORAGE || '').toLowerCase());
        if (INIT_STORAGE) {
            await storage.init();
        }

        if (['yes', 'true'].includes((process.env.NEARFS_LOAD_NEAR_LAKE || '').toLowerCase())) {
            const { loadStream } = require('./scripts/load-from-near-lake');

            const startBlockHeight = await storage.readLatestBlockHeight() || process.env.NEARFS_DEFAULT_START_BLOCK_HEIGHT || 0;
            await loadStream({
                startBlockHeight,
                bucketName: process.env.NEARFS_LAKE_BUCKET_NAME,
                regionName: process.env.NEARFS_LAKE_REGION_NAME,
                endpoint: process.env.NEARFS_LAKE_ENDPOINT,
                batchSize: process.env.NEARFS_LAKE_BATCH_SIZE,
                incude: process.env.NEARFS_LAKE_INCLUDE,
                exclude: process.env.NEARFS_LAKE_EXCLUDE,
            });
        }
    })().catch(e => {
        console.error(e);
        process.exit(1);
    });
}
