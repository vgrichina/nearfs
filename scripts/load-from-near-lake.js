const { stream } = require('near-lake-framework');
const minimatch = require('minimatch');

// TODO: Refactor into common module?
const STORAGE_PATH = process.env.NEARFS_STORAGE_PATH || './storage';

const fs = require('fs/promises');

let totalMessages = 0;
let timeStarted = Date.now();

const NUM_RETRIES = 10;
const RETRY_TIMEOUT = 5000;
async function handleStreamerMessage(streamerMessage, options = {}) {
    const { height: blockHeight, timestamp } = streamerMessage.block.header;
    totalMessages++;
    console.log(new Date(), `Block #${blockHeight} Shards: ${streamerMessage.shards.length}`,
        `Speed: ${totalMessages * 1000 / (Date.now() - timeStarted)} blocks/second`,
        `Lag: ${Date.now() - (timestamp / 1000000)} ms`);

    const pipeline = [
        dumpBlockReceipts,
    ].filter(Boolean);

    if (pipeline.length === 0) {
        console.warn('NOTE: No data output pipeline configured. Performing dry run.');
    }

    for (let fn of pipeline) {
        await fn(streamerMessage, options);
    }

    await fs.writeFile(`${STORAGE_PATH}/latest_block_height`, blockHeight.toString());
}

function parseRustEnum(enumObj) {
    if (typeof enumObj === 'string') {
        return [enumObj, {}];
    } else {
        const actionKeys = Object.keys(enumObj);
        if (actionKeys.length !== 1) {
            console.log('rekt enum', enumObj);
            process.exit(1);
        }
        return [actionKeys[0], enumObj[actionKeys[0]]];
    }
}

async function writeToStorage(hash, data) {
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

// TODO: Should be possible to parse from transactions directly when listening to network?

async function dumpBlockReceipts(streamerMessage, { include, exclude }) {
    for (let shard of streamerMessage.shards) {
        let { chunk } = shard;
        if (!chunk) {
            continue;
        }
        for (let { predecessorId, receipt, receiptId, receiverId } of chunk.receipts) {
            if (include && include.find(pattern => !minimatch(accountId, pattern))) {
                return;
            }
            if (exclude && exclude.find(pattern => minimatch(accountId, pattern))) {
                return;
            }

            if (receipt.Action) {
                for (let action of receipt.Action.actions) {
                    const [, actionArgs] = parseRustEnum(action);

                    if (actionArgs.methodName === 'fs_store') {
                        const data = Buffer.from(actionArgs.args, 'base64');
                        const cryptoAsync = require('@ronomon/crypto-async');
                        const hash = await new Promise((resolve, reject) => {
                            cryptoAsync.hash('sha256', data, (error, hash) => error ? reject(error) : resolve(hash));
                        });

                        try {
                            await writeToStorage(hash, data);
                        } catch (e) {
                            console.log('Error writing to storage', e);
                            process.exit(1);
                        }
                    }
                }
            }
        }
    }
}

module.exports = {
    handleStreamerMessage,
}

if (require.main === module) {
    const DEFAULT_BATCH_SIZE = 20;

    const yargs = require('yargs/yargs');
    yargs(process.argv.slice(2))
        .command(['s3 [bucket-name] [start-block-height] [region-name] [endpoint]', '$0'],
            'loads data from NEAR Lake S3 into other datastores',
            yargs => yargs
                .option('start-block-height', {
                    describe: 'block height to start loading from. By default starts from latest known block height or genesis.',
                    number: true
                })
                .describe('bucket-name', 'S3 bucket name')
                .describe('region-name', 'S3 region name')
                .describe('endpoint', 'S3-compatible storage URL')
                .option('include', {
                    describe: 'include only accounts matching this glob pattern. Can be specified multiple times.',
                    array: true
                })
                .option('exclude', {
                    describe: 'exclude accounts matching this glob pattern. Can be specified multiple times.',
                    array: true
                })
                .option('batch-size', {
                    describe: 'how many blocks to try fetch in parallel',
                    number: true,
                    default: DEFAULT_BATCH_SIZE
                })
                .option('limit', {
                    describe: 'How many blocks to fetch before stopping. Unlimited by default.',
                    number: true
                }),
            async argv => {

                const {
                    startBlockHeight,
                    bucketName,
                    regionName,
                    endpoint,
                    batchSize,
                    limit,
                    include,
                    exclude,
                } = argv;

                const latestBlockHeight = (await fs.readFile( `${STORAGE_PATH}/latest_block_height`).catch(() => '')).toString('utf8');

                const { fromEnv } = require("@aws-sdk/credential-providers");
                let blocksProcessed = 0;
                for await (let streamerMessage of stream({
                    credentials: fromEnv(),
                    startBlockHeight: startBlockHeight || latestBlockHeight,
                    s3BucketName: bucketName || "near-lake-data-mainnet",
                    s3RegionName: regionName || "eu-central-1",
                    s3Endpoint: endpoint,
                    blocksPreloadPoolSize: batchSize
                })) {
                    console.log('started');
                    await handleStreamerMessage(streamerMessage, {
                        batchSize,
                        include,
                        exclude,
                    });

                    blocksProcessed++;
                    if (limit && blocksProcessed >= limit) {
                        break;
                    }
                }

            })
        .parse();
}