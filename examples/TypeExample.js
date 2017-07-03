const {PGShape} = require('../src/decorators');
const FakeDenormalizedType = require('./FakeDenormalizedType');

module.exports = class TypeExample {
    @PGShape([FakeDenormalizedType], 'text', {behavior: IMMUTABLE})
    concatRow({createdAt, content}) {
        return `Created At ${createdAt} -- ${content}`;
    }
}