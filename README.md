# NEARFS

NEARFS is a distributed file system compatible with IPFS that uses the NEAR blockchain as a backend. It is a work in progress.

## TLDR

- IPFS blocks are recorded in transaction history as `fs_store` function calls
- custom indexer can be used to collect all blocks and store them in a local file system (see `scripts/load-from-near-lake.js`)
- IPFS-compatible gateway can be used to access files (see `app.js`)
- Public gateway is available at https://ipfs.web4.near.page. It provides access to data stored on NEAR mainnet.

## Useful tools

- [web4-deploy](https://github.com/vgrichina/web4-deploy) Deploy your website to NEAR blockchain + IPFS/NEARFS.
- [fast-ipfs](https://github.com/vgrichina/fast-ipfs) Low level utilities to work with IPFS blocks, etc.
- https://near.page Web4 gateway which uses NEARFS to resolve `ipfs://` links when possible.

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
- `AWS_ACCESS_KEY_ID` - AWS access key ID to use when loading blocks from NEAR Lake
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key to use when loading blocks from NEAR Lake

## API

Following IPFS gateway APIs are currently implemented.
Note that there might be some differences in details like error handling, etc.

Most notable difference with regular IPFS is that all calls would either return immediately or 404. There is no wait for content to be fetched from other nodes, etc.

Also only CIDv1 is currently supported (see examples).


### `GET /ipfs/:cid`

Returns IPFS file with given CID.

**Example:**

https://ipfs.web4.near.page/ipfs/bafybeicit72w2sl3agal2jftpkrzwd773fjgdk4dym7pq2pbojyif72v5e

### `GET /ipfs/:cid/:path`

Returns IPFS file with given CID and path.

**Example:**

https://ipfs.web4.near.page/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/privacy.html

### Directory listing

If directory is requested and it has no `index.html` – HTML with its contents is returned.

Otherwise `index.html` is served.

**Example directory**:

https://ipfs.web4.near.page/ipfs/bafybeiepywlzwr2yzyin2bo7k2v5oi37lsgleyvfrf6erjvlze2qec6wkm/

**Example index.html**:

https://ipfs.web4.near.page/ipfs/bafybeidg3ohf4kscsf6cjbgg7vttcvu7q4olena3kwhpl5wl3trhhougyi/dist/
