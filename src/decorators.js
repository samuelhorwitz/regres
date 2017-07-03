const {neededStubs, neededTypes} = require('./decorator-store');
const {snakeCase} = require('lodash');

// https://davidwalsh.name/javascript-arguments
function getArgs(func) {
  // First match everything inside the function argument parens.
  var args = func.toString().match(/function\s.*?\(([^)]*)\)/)[1];

  // Split the arguments string into an array comma delimited.
  return args.split(',').map(function(arg) {
    // Ensure no inline comments are parsed and trim the whitespace.
    return arg.replace(/\/\*.*\*\//, '').trim();
  }).filter(function(arg) {
    // Ensure no undefined values are added.
    return arg;
  });
}

module.exports = {
    PGShape: function(args, ret, opts = {behavior: 'VOLATILE', isPublic: false, allowNull: false}) {
        return function(target, key, descriptor) {
            neededStubs.push({
                moduleName: target.constructor.name,
                fnName: descriptor.value.name,
                moduleNameSnake: snakeCase(target.constructor.name),
                fnNameSnake: snakeCase(descriptor.value.name),
                fnArgs: getArgs(descriptor.value),
                pgArgs: args,
                pgRet: ret,
                pgBehavior: opts.behavior,
                disallowNull: !opts.allowNull,
                pgPublic: opts.isPublic
            });
        };
    },

    PGType: function(constituents) {
        return function(target) {
            var snakeName = `${snakeCase(target.name)}_${Date.now()}`;
            neededTypes.push({
                name: snakeName,
                constituents
            });
            target.$$pgTypeId = snakeName;
        };
    }
};