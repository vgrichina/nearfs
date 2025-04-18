const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router');
const router = new Router();
const cors = require('@koa/cors');

const multibase = require('multibase');
const assert = require('assert');
const { Readable } = require('stream');
const mime = require('mime-types');
const { fileTypeStream } = require('./src/util/file-type');

const { readPBNode, cidToString, readCID, CODEC_RAW, CODEC_DAG_PB, readUnixFSData } = require('fast-ipfs');
const storage = require('./src/storage');

const serveFile = async ctx => {
    const rootCid = Buffer.from(multibase.decode(ctx.params.cid));
    const path = ctx.params.path || '';
    const expectDirectory = ctx.path.endsWith('/');
    const { fileData, node, cid, size } = await getFile(rootCid, path, { useIndexHTML: expectDirectory });
    if (fileData) {
        let mainReadable = fileData;
        if (ctx.query.filename) {
            ctx.type = mime.lookup(ctx.query.filename);
            ctx.attachment(ctx.query.filename, { type: 'inline' });
        } else if (path.includes('.')) {
            ctx.type = mime.lookup(path);
        } else {
            mainReadable = await fileTypeStream(fileData);
            ctx.type = mainReadable.fileType.mime;
        }

        // Set cache control header to indicate that resource never expires
        ctx.set('Cache-Control', 'public, max-age=29030400, immutable');

        // Return CID-based Etag like IPFS gateways
        ctx.set('Etag', `W/"${cidToString(cid)}"`);

        if (size) {
            console.log('Setting content length', size);
            ctx.length = size;
        }
        ctx.body = mainReadable;
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
        const ipfsPath = `/ipfs/${cidToString(rootCid)}/${path}`;
        const basePath = (ctx.usingSubdomain ? '/' : `/ipfs/${cidToString(rootCid)}/`) + path;
        ctx.body = `
            <html>
                <head>
                    <title>Index of ${ipfsPath}</title>
                </head>
                <body>
                    <h1>Index of ${ipfsPath}</h1>
                    <ul>
                        ${node.links.map(link => `<li><a href="${basePath}${link.name}">${link.name}</a></li>`).join('\n')}
                    </ul>
                </body>
            </html>
        `;
        return;
    }

    ctx.status = 404;
    ctx.body = 'Not found';
}

const getFile = async (cid, path, { useIndexHTML } = { }) => {
    const cidStr = cidToString(cid);
    console.log('getFile', cidStr, path);
    // TODO: Cache ?
    const { codec, hash } = readCID(cid);

    const blockData = await storage.readBlock(hash);
    if (!blockData) {
        // File not found
        return {};
    }

    if (codec === CODEC_RAW) {
        assert(!path, 'CID points to a file');
        return { fileData: Readable.from(blockData), cid, codec, size: blockData.length };
    } else if (codec === CODEC_DAG_PB) {
        const node = readPBNode(blockData);

        if (path) {
            const pathParts = path.split('/');
            const link = node.links.find(link => link.name === pathParts[0]);

            if (!link) {
                // File not found
                return {};
            }

            pathParts.shift();
            return await getFile(link.cid, pathParts.join('/'), { useIndexHTML });
        }

        assert(node.data, `DAG node ${cidStr} has no UnixFS data`);
        const { type, data, fileSize } = readUnixFSData(node.data);
        switch (type) {
            case 1:
                // Directory
                if (useIndexHTML) {
                    const link = node.links.find(link => link.name === 'index.html');

                    if (link) {
                        return await getFile(link.cid, '', { useIndexHTML: false });
                    }
                }

                // CID points to a directory without index.html (or useIndexHTML is false)
                return { node, cid, codec };
            case 2:
                // File
                if (!node.links || node.links.length === 0) {
                    return { fileData: Readable.from(data), cid, codec, size: data.length };
                }

                const fileData = Readable.from((async function* concatStreams() {
                    for (const link of node.links) {
                        const { fileData } = await getFile(link.cid);
                        for await (const chunk of fileData) {
                            yield chunk;
                        }
                    }
                })());

                return { fileData, cid, codec, size: fileSize };

            default:
                throw new Error(`Unknown UnixFS data type: ${type}`);
        }
    } else {
        throw new Error(`Unsupported codec: 0x${codec.toString(16)} `);
    }
};

router.get('/', async ctx => {
    ctx.body = `<h1>Welcome to NEARFS!</h1>

        <p>See <a href="https://github.com/vgrichina/nearfs">https://github.com/vgrichina/nearfs</a> for more information.
    `;
});

const MAX_BLOCK_LAG_TIME_MS = 60_000;
router.get('/healthz', async ctx => {
    const latestBlockHeight = await storage.readLatestBlockHeight();
    const latestBlockTimestamp = await storage.getLatestBlockTimestamp();

    // NOTE: node considered unhealthy if it's out of sync
    if (!latestBlockHeight || !latestBlockTimestamp || Date.now() - latestBlockTimestamp > MAX_BLOCK_LAG_TIME_MS) {
        ctx.throw(500, 'unhealthy (out of sync)');
    }

    ctx.status = 204; // No Content
});

router.get('/ipfs/:cid/:path(.+)', serveFile);
router.get('/ipfs/:cid', serveFile);

const handleSubdomain = async (ctx, next) => {
    const hostname = ctx.hostname;
    const parts = hostname.split('.');
    if (parts.length > 2) {
        const subdomain = parts[0];
        try {
            // Check if the subdomain is a valid CID
            const cid = multibase.decode(subdomain);
            // Set the params to be used by serveFile
            ctx.params = ctx.params || {};
            ctx.params.cid = subdomain;
            ctx.params.path = ctx.path.slice(1); // Remove leading slash
            ctx.usingSubdomain = true;
            await serveFile(ctx);
        } catch (error) {
            // If it's not a valid CID, continue to the next middleware
            await next();
        }
    } else {
        await next();
    }
};

app
    .use(async (ctx, next) => {
        console.log(ctx.method, ctx.path);
        await next();
    })
    .use(handleSubdomain)
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
    })().catch(e => {
        console.error(e);
        process.exit(1);
    });
}
