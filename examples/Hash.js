const {PGShape} = require('../src/decorators');
const sha256 = require('./lib/sha256');

module.exports = class Hash {
    @PGShape(['text', 'bytea'], 'bytea', {behavior: IMMUTABLE})
    sha256(str, buf) {
        // Because we are returning `bytea` we convert our buffer to a hex string
        // with `toString('hex')`. The Postgres wrapper procedures know to turn
        // that back into `bytea` as PLV8 does not allow returning binary data.
        return sha256(Buffer.from(str, 'utf8'), Buffer.from(buf)).toString('hex');
    }
}