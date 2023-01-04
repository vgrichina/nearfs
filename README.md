# NEARFS

NEARFS is a distributed file system compatible with IPFS that uses the NEAR blockchain as a backend. It is a work in progress.

## TLDR

- IPFS blocks are recorded in transaction history as `fs_store` function calls
- custom indexer can be used to collect all blocks and store them in a local file system (see `scripts/load-from-near-lake.js`)
- IPFS-comptatible gateway can be used to access files (see `app.js`)

## How to run gateway

- `yarn install`
- `yarn start`

## How to run indexer

- `yarn install`
- `node scripts/load-from-near-lake.js --bucket-name [near-lake-bucket-name]`

## Environment variables

- `PORT` - port to run gateway on
- `NEARFS_STORAGE_PATH` - path to NEARFS block storage
- `NEARFS_LOAD_NEAR_LAKE` - if set to `true` (or `yes`) gateway will also load blocks from NEAR Lake. Use this if you want to avoid running `load-from-near-lake.js` script separately.
- `NEARFS_LAKE_BUCKET_NAME` - name of the NEAR Lake S3 bucket to load blocks from
- `NEARFS_LAKE_REGION_NAME` - region of the NEAR Lake S3 bucket to load blocks from
- `NEARFS_LAKE_ENDPOINT` - endpoint of the NEAR Lake S3 bucket to load blocks from
- `NEARFS_LAKE_BATCH_SIZE` - number of blocks to load from NEAR Lake in one batch
- `NEARFS_LAKE_INCLUDE` - comma-separated list of account glob patterns to include when loading blocks from NEAR Lake
- `NEARFS_LAKE_EXCLUDE` - comma-separated list of account glob patterns to exclude when loading blocks from NEAR Lake



