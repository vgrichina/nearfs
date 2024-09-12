const minimatch = require('minimatch');
const storage = require('../src/storage');
const { computeHash } = require('../src/util/hash');
const { withTimeCounter, getCounters, resetCounters } = require('fast-near/utils/counters');

let totalMessages = 0;
let timeStarted = Date.now();

function formatDuration(milliseconds) {
    let seconds = Math.floor((milliseconds / 1000) % 60);
    let minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
    let hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
    let days = Math.floor((milliseconds / (1000 * 60 * 60 * 24)));
    return [days, hours, minutes, seconds].map(n => n.toString().padStart(2, '0')).join(':');
}

async function handleStreamerMessage(streamerMessage, options = {}) {
    const { height: blockHeight, timestamp } = streamerMessage.block.header;
    totalMessages++;
    const speed = totalMessages * 1000 / (Date.now() - timeStarted);
    const lagSeconds = (Date.now() - (timestamp / 1000000)) / 1000;
    const estimatedSyncSeconds = lagSeconds / speed;
    console.log(new Date(), `Block #${blockHeight} Shards: ${streamerMessage.shards.length}`,
        `Speed: ${speed.toFixed(2)} blocks/second`,
        `Lag: ${formatDuration(lagSeconds * 1000)}`,
        `Fully synced in: ${formatDuration(estimatedSyncSeconds * 1000)}`);

    await processBlockReceipts(streamerMessage, options);

    if (options.updateBlockHeight) {
        await storage.writeLatestBlockHeight(blockHeight);
    }
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

async function processBlockReceipts(streamerMessage, { include, exclude }) {
    console.time('processBlockReceipts');
    for (let shard of streamerMessage.shards) {
        let { chunk } = shard;
        if (!chunk) {
            continue;
        }
        for (let { receipt, receiver_id } of chunk.receipts) {
            if (include && include.find(pattern => !minimatch(receiver_id, pattern))) {
                continue;
            }
            if (exclude && exclude.find(pattern => minimatch(receiver_id, pattern))) {
                continue;
            }

            if (receipt.Action) {
                for (let action of receipt.Action.actions) {
                    const [, actionArgs] = parseRustEnum(action);

                    if (actionArgs.method_name === 'fs_store') {
                        const data = Buffer.from(actionArgs.args, 'base64');
                        try {
                            const hash = await computeHash(data);
                            await storage.writeBlock(hash, data);
                        } catch (e) {
                            console.log('Error writing to storage', e);
                            process.exit(1);
                        }
                    }
                }
            }
        }
    }
    console.timeEnd('processBlockReceipts');
}

async function loadStream(options) {
    const {
        startBlockHeight,
        bucketName,
        regionName,
        endpoint,
        batchSize,
        limit,
        include,
        exclude,
        updateBlockHeight,
        source,
    } = options;

    const { readBlocks } = require(`fast-near/source/${source}`);

    const defaultStartBlockHeight = parseInt(process.env.NEARFS_DEFAULT_START_BLOCK_HEIGHT || '0');
    const start = startBlockHeight || await storage.readLatestBlockHeight() || defaultStartBlockHeight;

    let blocksProcessed = 0;
    
    for await (let streamerMessage of readBlocks({
        startBlockHeight: start,
        s3BucketName: bucketName || "near-lake-data-mainnet",
        s3RegionName: regionName || "eu-central-1",
        s3Endpoint: endpoint,
    })) {
        await withTimeCounter('handleStreamerMessage', async () => {
            await handleStreamerMessage(streamerMessage, {
                batchSize,
                include,
                exclude,
                updateBlockHeight,
            });
        });

        console.log('counters', getCounters());
        resetCounters();

        blocksProcessed++;
        if (limit && blocksProcessed >= limit) {
            break;
        }
    }

    await storage.closeDatabase();
}

module.exports = {
    handleStreamerMessage,
    loadStream,
}

if (require.main === module) {
    const DEFAULT_BATCH_SIZE = 20;
    const yargs = require('yargs/yargs');
    yargs(process.argv.slice(2))
        .command(['[bucket-name] [start-block-height] [region-name] [endpoint]', '$0'],
            'loads data from NEAR Lake S3 or other sources into other datastores',
            yargs => yargs
                .option('source', {
                    describe: 'Source of the data. Defaults to `neardata`.',
                    choices: ['redis-blocks', 'lake', 's3-lake', 'neardata'],
                    default: 'neardata'
                })
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
                })
                .option('update-block-height', {
                    describe: 'update block height in storage',
                    boolean: true,
                    default: true
                }),
            loadStream)
        .parse();
}