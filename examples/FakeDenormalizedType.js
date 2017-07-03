const {PGType} = require('../src/decorators');

@PGType({
    createdAt: 'timestamp with time zone',
    content: 'text'
})
class FakeDenormalizedType { }

module.exports = FakeDenormalizedType;
