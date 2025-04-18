const test = require('tape');
const storage = require('../src/storage');

test('storage.writeLatestBlockTimestamp and getLatestBlockTimestamp', async t => {
    const timestamp = Date.now();
    await storage.writeLatestBlockTimestamp(timestamp);
    const retrievedTimestamp = await storage.getLatestBlockTimestamp();
    t.isEqual(retrievedTimestamp, timestamp);
});

test('storage.getLatestBlockTimestamp returns 0 when no timestamp exists', async t => {
    const fs = require('fs/promises');
    const storageType = process.env.NEARFS_STORAGE_TYPE || 'fs';
    
    // Skip this test if not using filesystem storage
    if (storageType !== 'fs') {
        t.skip('This test only works with filesystem storage');
        return;
    }
    
    const storagePath = process.env.NEARFS_STORAGE_PATH || './storage';
    const timestampPath = `${storagePath}/latest_block_timestamp`;
    
    try {
        // Delete the timestamp file if it exists
        await fs.unlink(timestampPath).catch(() => {
            // Ignore errors if file doesn't exist
        });
        
        // Now call getLatestBlockTimestamp with no file
        const noTimestamp = await storage.getLatestBlockTimestamp();
        t.isEqual(noTimestamp, 0, 'Should return 0 when timestamp file does not exist');
    } finally {
        // No cleanup needed
    }
});