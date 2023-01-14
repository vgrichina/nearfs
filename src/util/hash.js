async function computeHash(data) {
    // TODO: Use sync by default as unlikely to be bottleneck?
    const cryptoAsync = require('@ronomon/crypto-async');
    const hash = await new Promise((resolve, reject) => {
        cryptoAsync.hash('sha256', data, (error, hash) => {
            if (error) {
                reject(error);
            } else {
                resolve(hash);
            }
        });
    });
    return hash;
}

module.exports = {
    computeHash,
};