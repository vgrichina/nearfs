const STORAGE_PATH = process.env.NEARFS_STORAGE_PATH || './storage';

const fs = require('fs/promises');

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

async function hashAndWriteBlock(data) {
    const cryptoAsync = require('@ronomon/crypto-async');
    const hash = await new Promise((resolve, reject) => {
        cryptoAsync.hash('sha256', data, (error, hash) => error ? reject(error) : resolve(hash));
    });
    await writeBlock(hash, data);
    return hash;
}

async function writeLatestBlockHeight(height) {
    const writeFileAtomic = require('write-file-atomic');
    await writeFileAtomic(`${STORAGE_PATH}/latest_block_height`, height.toString());
}

async function readLatestBlockHeight() {
    return parseInt(await fs.readFile(`${STORAGE_PATH}/latest_block_height`, 'utf8').catch(() => '0'));
}

module.exports = {
    writeBlock,
    hashAndWriteBlock,
    writeLatestBlockHeight,
    readLatestBlockHeight,
};