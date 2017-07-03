const camelCase = require('lodash/camelCase');
const isPlainObject = require('lodash/isPlainObject');
const mapKeys = require('lodash/mapKeys');

function defineGlobal(name, result = name) {
    Object.defineProperty(global, name, {configurable: true, get: () => result});
}

defineGlobal('TYPED_ARRAY_SUPPORT', false);
defineGlobal('IMMUTABLE');
defineGlobal('STABLE');
defineGlobal('VOLATILE');
defineGlobal('__camelCaseObj', function(obj) {
    if (isPlainObject(obj)) {
        return mapKeys(obj, (v, k) => camelCase(k));
    }

    return obj;
});

if (!global.console) {
    defineGlobal('console', Object.create(null, {
        debug: {
            enumerable: true,
            value: (...args) => plv8.elog(DEBUG1, ...args)
        },
        log: {
            enumerable: true,
            value: (...args) => plv8.elog(LOG, ...args)
        },
        info: {
            enumerable: true,
            value: (...args) => plv8.elog(INFO, ...args)
        },
        warn: {
            enumerable: true,
            value: (...args) => plv8.elog(WARNING, ...args)
        },
        error: {
            enumerable: true,
            value: (...args) => plv8.elog(ERROR, ...args)
        }
    }));
}
