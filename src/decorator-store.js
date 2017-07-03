const {snakeCase} = require('lodash');

function getPGTypeDeclaration(type, {fnSchema, fnSchemaFnOwner}) {
    var top = `CREATE TYPE ${fnSchema}.${type.name} AS (`,
        bottom = `);\nALTER TYPE ${fnSchema}.${type.name} OWNER TO ${fnSchemaFnOwner};`,
        middle = [];

    for (let key in type.constituents) {
        middle.push(`\n${snakeCase(key)} ${type.constituents[key]}`);
    }

    return `${top}${middle.join(',')}${bottom}`;
}

function getPGDeclaration(stub, {fnSchema, fnSchemaFnOwner, publicUser, regresGlobal}) {
    var customTypeIndices = [];

    if (stub.pgRet instanceof Function) {
        stub.pgRet = `${fnSchema}.${stub.pgRet.$$pgTypeId}`;
    }

    if (stub.pgArgs) {
        for (let i = 0; i < stub.pgArgs.length; i++) {
            if (stub.pgArgs[i] instanceof Function) {
                stub.pgArgs[i] = `${fnSchema}.${stub.pgArgs[i].$$pgTypeId}`;
                customTypeIndices.push(i);
            }
        }
    }

    var argsStr = '',
        argNames = stub.fnArgs.map(val => snakeCase(val)),
        jsArgNames = argNames.map((val, i) => {
            if (customTypeIndices.includes(i)) {
                return `__camelCaseObj(${val})`;
            }

            return val;
        }).join(', '),
        jsArgNamesNoCamel = argNames.join(', '),
        isBytea = stub.pgRet == 'bytea',
        isTrigger = stub.pgRet == 'trigger',
        stubNamePrefix = '',
        nullCheckStr = '',
        revoke1 = '', revoke2 = '';

    if (isTrigger) {
        stub.pgArgs = [];
    }

    if (!isTrigger && argNames.length !== stub.pgArgs.length) {
        throw new Error('Invalid PGShape');
    }

    for (let i = 0; i < stub.pgArgs.length; i++) {
        if (i !== 0) {
            argsStr += ', ';
        }

        argsStr += `${argNames[i]} ${stub.pgArgs[i]}`;
    }

    if (isBytea) {
        stubNamePrefix = '__'
    }

    if (stub.disallowNull) {
        if (argNames.length > 0) {
            let checks = [];

            for (let i = 0, arg; i < argNames.length; i++) {
                arg = argNames[i];
                checks.push(`(typeof ${arg} == 'undefined' || ${arg} === null)`);
            }

            nullCheckStr = `if (${checks.join(' || ')}) { throw new Error('Function may not have undefined arguments.'); }`;
        }
    }

    if (isBytea) {
        if (!stub.pgPublic) {
            revoke1 = `REVOKE ALL ON FUNCTION ${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) FROM ${publicUser};`;
            revoke2 = `REVOKE ALL ON FUNCTION ${fnSchema}.${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) FROM ${publicUser};`;
        }
        else {
            revoke1 = `GRANT EXECUTE ON FUNCTION ${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) TO ${publicUser};`;
            revoke2 = `GRANT EXECUTE ON FUNCTION ${fnSchema}.${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) TO ${publicUser};`;
        }

        return `
CREATE OR REPLACE FUNCTION ${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${argsStr}) RETURNS text AS $$
    ${nullCheckStr}
    return ${regresGlobal}.${stub.moduleName}.${stub.fnName}(${jsArgNames});
$$ LANGUAGE plv8 ${stub.pgBehavior};
ALTER FUNCTION ${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) OWNER TO ${fnSchemaFnOwner};
${revoke1}

CREATE OR REPLACE FUNCTION ${fnSchema}.${stub.moduleNameSnake}_${stub.fnNameSnake}(${argsStr}) RETURNS ${stub.pgRet} AS $$
    BEGIN
        RETURN decode(${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${jsArgNamesNoCamel}), 'hex');
    END
$$ LANGUAGE plpgsql ${stub.pgBehavior};
ALTER FUNCTION ${fnSchema}.${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) OWNER TO ${fnSchemaFnOwner};
${revoke2}
`;
    }
    else if (isTrigger) {
        return `
CREATE OR REPLACE FUNCTION ${fnSchema}.${stub.moduleNameSnake}_${stub.fnNameSnake}() RETURNS trigger AS $$
    return ${regresGlobal}.${stub.moduleName}.${stub.fnName}({NEW: NEW, OLD: OLD, TG_NAME: TG_NAME, TG_WHEN: TG_WHEN, TG_LEVEL: TG_LEVEL, TG_OP: TG_OP, TG_RELID: TG_RELID, TG_TABLE_NAME: TG_TABLE_NAME, TG_TABLE_SCHEMA: TG_TABLE_SCHEMA, TG_ARGV: TG_ARGV});
$$ LANGUAGE plv8 VOLATILE SECURITY DEFINER;
ALTER FUNCTION ${fnSchema}.${stub.moduleNameSnake}_${stub.fnNameSnake}() OWNER TO ${fnSchemaFnOwner};
REVOKE ALL ON FUNCTION ${fnSchema}.${stub.moduleNameSnake}_${stub.fnNameSnake}() FROM ${publicUser};
`;
    }
    else {
        if (!stub.pgPublic) {
            revoke1 = `REVOKE ALL ON FUNCTION ${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) FROM ${publicUser};`;
        }
        else {
            revoke1 = `GRANT EXECUTE ON FUNCTION ${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) TO ${publicUser};`;
        }

        return `
CREATE OR REPLACE FUNCTION ${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${argsStr}) RETURNS ${stub.pgRet} AS $$
    ${nullCheckStr}
    return ${regresGlobal}.${stub.moduleName}.${stub.fnName}(${jsArgNames});
$$ LANGUAGE plv8 ${stub.pgBehavior};
ALTER FUNCTION ${fnSchema}.${stubNamePrefix}${stub.moduleNameSnake}_${stub.fnNameSnake}(${stub.pgArgs.join(', ')}) OWNER TO ${fnSchemaFnOwner};
${revoke1}
`;
    }
}

var neededStubs = [],
    neededTypes = [];

module.exports = {
    neededStubs, neededTypes,
    getImportSQL: function(opts) {
        var sql = [];

        for (let i = 0; i < neededTypes.length; i++) {
            sql.push(getPGTypeDeclaration(neededTypes[i], opts));
        }

        for (let i = 0; i < neededStubs.length; i++) {
            sql.push(getPGDeclaration(neededStubs[i], opts));
        }

        return sql.join('\n');
    }
};