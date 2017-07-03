require('./types');

var oldRequire = require;

require = function(path) {
    return new (oldRequire(path))()
}

module.exports = {
    Hash: require('./Hash'),
    Trigger: require('./Trigger'),
    TypeExample: require('./TypeExample')
};
