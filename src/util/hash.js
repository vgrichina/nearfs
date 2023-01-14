async function computeHash(data) {
    // TODO: If becomes bottleneck, try async version @ronomon/crypto-async
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest();
}

module.exports = {
    computeHash,
};