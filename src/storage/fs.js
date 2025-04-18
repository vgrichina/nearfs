const STORAGE_PATH = process.env.NEARFS_STORAGE_PATH || './storage';

const fs = require('fs/promises');

async function init() {
    await fs.mkdir(STORAGE_PATH, { recursive: true });
}

async function writeBlock(hash, data) {
    const storagePath = `${STORAGE_PATH}/${hash.toString('hex')}`;
    // check if file exists
    const stat = await fs.stat(storagePath).catch(() => false);
    if (stat && stat.isFile()) {
        // file exists, check if size matches
        if (stat.size === data.length) {
            // already written
            return;
        }
    }
    await fs.writeFile(storagePath, data);
}

const fileExists = async (file) => {
    const stat = await fs.stat(file).catch(() => false);
    return stat && stat.isFile();
};

const readBlock = async (hash) => {
    const file = `${STORAGE_PATH}/${hash.toString('hex')}`;

    if (await fileExists(file)) {
        return await fs.readFile(file);
    }
}

async function writeLatestBlockHeight(height) {
    const writeFileAtomic = require('write-file-atomic');
    await writeFileAtomic(`${STORAGE_PATH}/latest_block_height`, height.toString());
}

async function readLatestBlockHeight() {
    return parseInt(await fs.readFile(`${STORAGE_PATH}/latest_block_height`, 'utf8').catch(() => '0'));
}

async function writeLatestBlockTimestamp(timestamp) {
    await fs.writeFile(`${STORAGE_PATH}/latest_block_timestamp`, timestamp.toString());
}

async function getLatestBlockTimestamp() {
    try {
        return parseInt(await fs.readFile(`${STORAGE_PATH}/latest_block_timestamp`, 'utf8'));
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