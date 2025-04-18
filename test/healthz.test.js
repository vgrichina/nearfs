const test = require('tape');
const app = require('../app');
const request = require('supertest')(app.callback());
const storage = require('../src/storage');

test('/healthz returns 204 when node is in sync', async t => {
    // Mock storage methods
    const originalReadLatestBlockHeight = storage.readLatestBlockHeight;
    const originalGetLatestBlockTimestamp = storage.getLatestBlockTimestamp;
    
    storage.readLatestBlockHeight = async () => 123;
    storage.getLatestBlockTimestamp = async () => Date.now();
    
    try {
        const { status } = await request.get('/healthz');
        t.isEqual(status, 204);
    } finally {
        // Restore original methods
        storage.readLatestBlockHeight = originalReadLatestBlockHeight;
        storage.getLatestBlockTimestamp = originalGetLatestBlockTimestamp;
    }
});

test('/healthz returns 500 when block height is missing', async t => {
    // Mock storage methods
    const originalReadLatestBlockHeight = storage.readLatestBlockHeight;
    const originalGetLatestBlockTimestamp = storage.getLatestBlockTimestamp;
    
    storage.readLatestBlockHeight = async () => null;
    storage.getLatestBlockTimestamp = async () => Date.now();
    
    try {
        const response = await request.get('/healthz');
        t.isEqual(response.status, 500, 'Response should have 500 status');
    } finally {
        // Restore original methods
        storage.readLatestBlockHeight = originalReadLatestBlockHeight;
        storage.getLatestBlockTimestamp = originalGetLatestBlockTimestamp;
    }
});

test('/healthz returns 500 when block timestamp is missing', async t => {
    // Mock storage methods
    const originalReadLatestBlockHeight = storage.readLatestBlockHeight;
    const originalGetLatestBlockTimestamp = storage.getLatestBlockTimestamp;
    
    storage.readLatestBlockHeight = async () => 123;
    storage.getLatestBlockTimestamp = async () => null;
    
    try {
        const response = await request.get('/healthz');
        t.isEqual(response.status, 500, 'Response should have 500 status');
    } finally {
        // Restore original methods
        storage.readLatestBlockHeight = originalReadLatestBlockHeight;
        storage.getLatestBlockTimestamp = originalGetLatestBlockTimestamp;
    }
});

test('/healthz returns 500 when block timestamp is too old', async t => {
    // Mock storage methods
    const originalReadLatestBlockHeight = storage.readLatestBlockHeight;
    const originalGetLatestBlockTimestamp = storage.getLatestBlockTimestamp;
    
    storage.readLatestBlockHeight = async () => 123;
    // Set timestamp to 2 minutes ago (beyond the 60 second threshold)
    storage.getLatestBlockTimestamp = async () => Date.now() - 120000;
    
    try {
        const response = await request.get('/healthz');
        t.isEqual(response.status, 500, 'Response should have 500 status');
    } finally {
        // Restore original methods
        storage.readLatestBlockHeight = originalReadLatestBlockHeight;
        storage.getLatestBlockTimestamp = originalGetLatestBlockTimestamp;
    }
});