const stream = require('stream');
const isHtml = require('is-html');

const { isBinary } = require('./is-binary');

const SAMPLE_SIZE = 4 * 1024;

const fileTypeStream = async (readableStream) => {
    const strtok3 = await import('strtok3/core');
    const { fileTypeFromBuffer } = await import('file-type');

    // NOTE: This is modeled after file-type's `fromStream` method
    return new Promise((resolve, reject) => {
        readableStream.on('error', reject);

        readableStream.once('readable', () => {
            try {
                const pass = new stream.PassThrough();
                const outputStream = stream.pipeline(readableStream, pass, () => { });

                const chunk = readableStream.read(SAMPLE_SIZE) ?? readableStream.read() ?? Buffer.alloc(0);
                fileTypeFromBuffer(chunk).catch((error) => {
                    if (error instanceof strtok3.EndOfStreamError) {
                        // Unknown file type
                        return null;
                    } 

                    reject(error);
                }).then((fileType) => {
                    if (!fileType) {
                        // Unknown file type
                        if (isBinary(chunk)) {
                            fileType = { ext: 'bin', mime: 'application/octet-stream' };
                        } else {
                            fileType = { ext: 'txt', mime: 'text/plain' };
                        }
                    }
                        
                    if (fileType.mime.startsWith('text/') && isHtml(chunk.toString('utf8'))) {
                        fileType = { ext: 'html', mime: 'text/html' };
                    }
                    
                    outputStream.fileType = fileType;
                    resolve(outputStream);
                });
            } catch (error) {
                reject(error);
            }
        });
    });
};

module.exports = { fileTypeStream };