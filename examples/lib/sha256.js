const nodeCrypto = require('crypto');

module.exports = function sha256(str) {
    var createdHash = nodeCrypto.createHash('sha256');
    createdHash.update(str);
    return createdHash.digest();
};
