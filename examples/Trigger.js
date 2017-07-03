const {PGShape} = require('../src/decorators');

module.exports = class Trigger {
    @PGShape(null, 'trigger')
    example({NEW}) {
        // Take a look at the SQL output of this wrapped function to understand how the magic NEW variable is passed in
        return NEW;
    }
}