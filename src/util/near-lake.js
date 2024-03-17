const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { fromEnv } = require('@aws-sdk/credential-providers');

// Setup keep-alive agents for AWS
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const { Agent: HttpAgent } = require('http');
const { Agent: HttpsAgent } = require('https');
const httpAgent = new HttpAgent({ keepAlive: true });
const httpsAgent = new HttpsAgent({ keepAlive: true });

async function listObjects(client, { bucketName, startAfter, maxKeys }) {
    return await client.send(
        new ListObjectsV2Command({
            Bucket: bucketName,
            MaxKeys: maxKeys,
            Delimiter: '/',
            StartAfter: startAfter,
            RequestPayer: 'requester',
        })
    );
}

async function getObject(client, { bucketName, key }) {
    return await client.send(
        new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
            RequestPayer: 'requester',
        })
    );
}

function normalizeBlockHeight(number) {
    return number.toString().padStart(12, '0');
}

async function asBuffer(readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function* blockNumbersStream(client, bucketName, startAfter, limit, pageSize = 250) {
    let listObjectsResult;
    const endAt = startAfter + limit;
    do {
        listObjectsResult = await listObjects(client, { bucketName, startAfter: normalizeBlockHeight(startAfter), maxKeys: pageSize });
        const blockNumbers = (listObjectsResult.CommonPrefixes || []).map((p) => parseInt(p.Prefix.split('/')[0]));

        for (const blockNumber of blockNumbers) {
            if (parseInt(blockNumber, 10) >= endAt) {
                return;
            }

            yield blockNumber;
        }

        startAfter = blockNumbers[blockNumbers.length - 1] + 1;
    } while (listObjectsResult.IsTruncated);
}

async function* blockStream({ bucketName, region, endpoint, startAfter, limit, pageSize }) {
    const client = new S3Client({
        credentials: fromEnv(),
        region,
        endpoint,
        requestHandler: new NodeHttpHandler({
            httpAgent,
            httpsAgent,
        }),
        maxAttempts: 3,
    });

    async function getFile(fileName, blockNumber) {
        const blockHeight = normalizeBlockHeight(blockNumber);
        const blockResponse = await getObject(client, { bucketName, key: `${blockHeight}/${fileName}` });
        const data = await asBuffer(blockResponse.Body);
        return { data, blockHeight };
    }

    try {
        for await (const blockNumber of blockNumbersStream(client, bucketName, startAfter, limit, pageSize)) {
            const block = JSON.parse((await getFile('block.json', blockNumber)).data.toString());
            const result = { block, shards: [] };
            for (let shard = 0; shard < block.chunks.length; shard++) {
                const chunk =  JSON.parse((await getFile(`shard_${shard}.json`, blockNumber)).data.toString());
                result.shards.push( chunk );
            }
            yield result;
        }
    } finally {
        client.destroy();
    }
}

module.exports = { blockStream };