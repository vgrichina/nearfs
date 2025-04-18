const STORAGE_S3_REGION = process.env.NEARFS_STORAGE_S3_REGION || 'us-east-1';
const STORAGE_S3_ENDPOINT = process.env.NEARFS_STORAGE_S3_ENDPOINT || 'http://localhost:9000'; // MinIO
const STORAGE_S3_BUCKET_NAME = process.env.NEARFS_STORAGE_S3_BUCKET_NAME || 'nearfs-storage';

const ACCESS_KEY = process.env.NEARFS_STORAGE_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.NEARFS_STORAGE_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

const debug = require('debug')('nearfs:storage:s3');

// NOTE: Minio is used as aws-sdk doesn't seem to work well with MinIO out of the box
const Minio = require('minio');
const endpointURL = new URL(STORAGE_S3_ENDPOINT);
const minio = new Minio.Client({
    endPoint: endpointURL.hostname,
    region: STORAGE_S3_REGION,
    port: parseInt(endpointURL.port),
    useSSL: endpointURL.protocol === 'https:',
    accessKey: ACCESS_KEY,
    secretKey: SECRET_KEY,
});

async function init() {
    debug('init');
    await minio.makeBucket(STORAGE_S3_BUCKET_NAME, STORAGE_S3_REGION);
}

async function writeBlock(hash, data) {
    debug('writeBlock', STORAGE_S3_BUCKET_NAME, hash.toString('hex'), data.length, 'bytes');
    // Check if object exists already
    try {
        await minio.statObject(STORAGE_S3_BUCKET_NAME, hash.toString('hex'));
        return; // no error means that object exists already
    } catch (e) {
        if (!['NoSuchKey', 'NotFound'].includes(e.code)) {
            debug('writeBlock', STORAGE_S3_BUCKET_NAME, hash.toString('hex'), 'error', e);
            throw e;
        }
    }

    await minio.putObject(STORAGE_S3_BUCKET_NAME, hash.toString('hex'), data);
}

async function streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function readBlock(hash) {
    debug('readBlock', STORAGE_S3_BUCKET_NAME, hash.toString('hex'));
    try {
        const readableStream = await minio.getObject(STORAGE_S3_BUCKET_NAME, hash.toString('hex'));
        return streamToBuffer(readableStream);
    } catch (e) {
        if (e.code === 'NoSuchKey') {
            return null;
        }
        debug('readBlock', STORAGE_S3_BUCKET_NAME, hash.toString('hex'), 'error', e);
        throw e;
    }
}

async function writeLatestBlockHeight(height) {
    await minio.putObject(STORAGE_S3_BUCKET_NAME, 'latest_block_height', height.toString());
}

async function readLatestBlockHeight() {
    try {
        const readableStream = await minio.getObject(STORAGE_S3_BUCKET_NAME, 'latest_block_height');
        const buffer = await streamToBuffer(readableStream);
        return parseInt(buffer.toString('utf8'));
    } catch (e) {
        console.log('Error reading latest block height', e);
        return 0;
    }
}

async function writeLatestBlockTimestamp(timestamp) {
    await minio.putObject(STORAGE_S3_BUCKET_NAME, 'latest_block_timestamp', timestamp.toString());
}

async function getLatestBlockTimestamp() {
    try {
        const readableStream = await minio.getObject(STORAGE_S3_BUCKET_NAME, 'latest_block_timestamp');
        const buffer = await streamToBuffer(readableStream);
        return parseInt(buffer.toString('utf8'));
    } catch (e) {
        return 0;
    }
}

module.exports = {
    init,
    writeBlock,
    readBlock,
    writeLatestBlockHeight,
    readLatestBlockHeight,
    writeLatestBlockTimestamp,
    getLatestBlockTimestamp,
};