const minimatch = require('minimatch');

const storage = require('../src/storage');
const { computeHash } = require('../src/util/hash');
const { blockStream } = require('../src/util/near-lake');

let totalMessages = 0;
let timeStarted = Date.now();

async function handleStreamerMessage(streamerMessage, options = {}) {
    console.log('handleStreamerMessage.size', JSON.stringify(streamerMessage).length);
    const { height: blockHeight, timestamp } = streamerMessage.block.header;
    totalMessages++;
    const speed = totalMessages * 1000 / (Date.now() - timeStarted);
    const lagSeconds = (Date.now() - (timestamp / 1000000)) / 1000;
    const estimatedSyncSeconds = lagSeconds / speed;
    console.log(new Date(), `Block #${blockHeight} Shards: ${streamerMessage.shards.length}`,
        `Speed: ${speed.toFixed(2)} blocks/second`,
        `Lag: ${lagSeconds.toFixed(2)} seconds`,
        `Fully synced in: ${estimatedSyncSeconds.toFixed(2)} seconds`);

    const pipeline = [
        dumpBlockReceipts,
    ].filter(Boolean);

    if (pipeline.length === 0) {
        console.warn('NOTE: No data output pipeline configured. Performing dry run.');
    }

    for (let fn of pipeline) {
        await fn(streamerMessage, options);
    }

    await storage.writeLatestBlockHeight(blockHeight);
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

// TODO: Should be possible to parse from transactions directly when listening to network?

async function dumpBlockReceipts(streamerMessage, { include, exclude }) {
    for (let shard of streamerMessage.shards) {
        let { chunk } = shard;
        if (!chunk) {
            continue;
        }
        for (let { receipt, receiver_id } of chunk.receipts) {
            if (include && include.find(pattern => !minimatch(receiver_id, pattern))) {
                return;
            }
            if (exclude && exclude.find(pattern => minimatch(receiver_id, pattern))) {
                return;
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
    } = options;

    const defaultStartBlockHeight = parseInt(process.env.NEARFS_DEFAULT_START_BLOCK_HEIGHT || '0');

    let blocksProcessed = 0;
    for await (let streamerMessage of blockStream({
        startAfter: startBlockHeight || await storage.readLatestBlockHeight() || defaultStartBlockHeight, // TODO: -1?
        bucketName: bucketName || "near-lake-data-mainnet",
        region: regionName || "eu-central-1",
        endpoint,
        pageSize: batchSize
    })) {
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
}

module.exports = {
    handleStreamerMessage,
    loadStream,
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
            loadStream)
        .parse();
}