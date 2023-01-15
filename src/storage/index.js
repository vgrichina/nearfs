const STORAGE_TYPE = process.env.NEARFS_STORAGE_TYPE || 'fs';

function requireStorage(storageType) {
    switch (storageType) {
        case 'fs':
            return require('./fs');
        case 's3':
            return require('./s3');
        default:
            throw new Error(`Unknown storage type: ${storageType}`);
    }
}

module.exports = requireStorage(STORAGE_TYPE);