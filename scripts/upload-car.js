const fs = require('fs').promises;
const meow = require('meow');
const { connect, keyStores, Account, KeyPair } = require('near-api-js');

const { uploadCAR } = require('../src/util/upload');

const cli = meow(`
    Usage
        upload-car <car-file> <signer-account.near>
        
    Select network using NODE_ENV variable.
`, {
    flags: {
        // TODO: Network selection?
    },
    allowUnknownFlags: false
});

// TODO: Check number of arguments given and give usage info
const [srcFile, accountId] = cli.input;

const NEAR_SIGNER_ACCOUNT = process.env.NEAR_SIGNER_ACCOUNT || accountId;
const NEAR_SIGNER_KEY = process.env.NEAR_SIGNER_KEY;

(async () => {
    const config = require('../src/config')(process.env.NODE_ENV);
    const keyStore = NEAR_SIGNER_KEY ? new keyStores.InMemoryKeyStore() : new keyStores.UnencryptedFileSystemKeyStore(`${process.env.HOME}/.near-credentials`);
    if (NEAR_SIGNER_KEY) {
        keyStore.setKey(config.networkId, NEAR_SIGNER_ACCOUNT, KeyPair.fromString(NEAR_SIGNER_KEY));
    }
    const near = await connect({
        ...config,
        keyStore
    })
    let account = new Account(near.connection, NEAR_SIGNER_ACCOUNT);

    // TODO: Refactor above with upload.js
    const carBuffer = await fs.readFile(srcFile);
    await uploadCAR(account, carBuffer);
})();