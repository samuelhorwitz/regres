// 1. Import the newest build into the code table
// 2. Teardown all functions that aren't undeletable
// 3. Create the startup function
// 4. Setup new stubs
// 5. Call startup (this will also be done by default through the postgres config when plv8 starts)
// 6. Kill all non-excepted connections so they are forced to reconnect and rerun startup script

const fs = require('fs');
const path = require('path');
require('babel-register');
const {getImportSQL, neededStubs} = require(path.resolve(__dirname, './decorator-store.js'));

var consoleBackup = {};

function disableConsole() {
    for (let [key, fn] of Object.entries(console)) {
        consoleBackup[key] = fn;
        console[key] = () => {};
    }
}

function enableConsole() {
    for (let [key, fn] of Object.entries(consoleBackup)) {
        console[key] = consoleBackup[key];
    }
}

function getSurvivorFns(neededStubs, opts) {
    var fns = [];

    for (let stub of neededStubs) {
        let args = [];

        if (stub.pgArgs) {
            for (let arg of stub.pgArgs) {
                if (arg instanceof Function) {
                    args.push(`${opts.fnSchema}.${arg.$$pgTypeId}`);
                }
                else {
                    args.push(arg);
                }
            }
        }

        let argsStr = args.join(', ');
        fns.push(`'${stub.moduleNameSnake}_${stub.fnNameSnake}(${argsStr})'`);
        fns.push(`'__${stub.moduleNameSnake}_${stub.fnNameSnake}(${argsStr})'`);
    }

    return fns.join(',');
}

module.exports = function(mainFile, outFile, opts) {
    disableConsole();
    require('./globals');
    require(mainFile);
    enableConsole();

    var survivorFns = getSurvivorFns(neededStubs, opts);
    var dbBundle = fs.readFileSync(outFile, 'utf8');
    var buf = [];

    // Initialize DB if needed
    buf.push('BEGIN;');
    buf.push('CREATE EXTENSION IF NOT EXISTS plv8;');
    buf.push(`CREATE SCHEMA IF NOT EXISTS ${opts.fnSchema} AUTHORIZATION ${opts.fnSchemaOwner};`);
    buf.push(`CREATE SCHEMA IF NOT EXISTS ${opts.bootSchema} AUTHORIZATION ${opts.bootSchemaOwner};`);
    buf.push(`CREATE TABLE IF NOT EXISTS ${opts.bootSchema}.module (module text);`);
    buf.push(`ALTER TABLE ${opts.bootSchema}.module OWNER TO ${opts.bootSchemaOwner};`);

    // Import
    buf.push(`TRUNCATE ${opts.bootSchema}.module;`);
    buf.push(`INSERT INTO ${opts.bootSchema}.module (module) VALUES ($_REGRES_CODE_$
    ${dbBundle}
    $_REGRES_CODE_$);`);

    // Teardown old functions unless they can only be replaced without database refactoring, in which case, warn
    buf.push(`DO $$
    DECLARE
        _drop record;
    BEGIN
        FOR _drop IN SELECT proname, 'DROP FUNCTION ' || ns.nspname || '.' || proname || '(' || oidvectortypes(proargtypes) || ');' AS query FROM pg_proc INNER JOIN pg_namespace ns ON (pg_proc.pronamespace = ns.oid) WHERE ns.nspname = '${opts.fnSchema}' AND (proname || '(' || oidvectortypes(proargtypes) || ')') NOT IN (${survivorFns}) ORDER BY proname LOOP
        BEGIN
            EXECUTE _drop.query;
        END;
        END LOOP;
    END$$;`);

    buf.push(`DO $$
    DECLARE
        _drop record;
    BEGIN
        CREATE TEMPORARY TABLE IF NOT EXISTS types_to_drop (query text);
        FOR _drop IN SELECT typname, 'DROP TYPE IF EXISTS ' || n.nspname || '.' || t.typname || ';' AS query FROM pg_type t LEFT JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE (t.typrelid = 0 OR (SELECT c.relkind = 'c' FROM pg_catalog.pg_class c WHERE c.oid = t.typrelid)) AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type el WHERE el.oid = t.typelem AND el.typarray = t.oid) AND n.nspname = '${opts.fnSchema}' LOOP
        BEGIN
            INSERT INTO types_to_drop (query) VALUES (_drop.query);
        END;
        END LOOP;
    END$$;`);

    // Create new setup function
    buf.push(`CREATE OR REPLACE FUNCTION ${opts.bootSchema}._startup()
        RETURNS void AS
    $$
        var global = (function(){ return this; }).call(null);
        delete global.require;
        delete global['${opts.regresGlobal}'];

        var rows = plv8.execute("SELECT module FROM ${opts.bootSchema}.module LIMIT 1");

        if (!rows.length) {
            throw new Error('Failure to load modules');
        }

        eval("(function() { " + rows[0].module + "})")();
    $$
        LANGUAGE plv8 VOLATILE SECURITY DEFINER COST 100;
    ALTER FUNCTION ${opts.bootSchema}._startup() OWNER TO ${opts.bootSchemaFnOwner};`);

    // Setup new stubs
    buf.push(getImportSQL(opts));

    // Actually drop types
    buf.push(`DO $$
    DECLARE
        _drop record;
    BEGIN
        FOR _drop IN SELECT query FROM types_to_drop LOOP
        BEGIN
            EXECUTE _drop.query;
        END;
        END LOOP;
    END$$;`);

    // Startup
    buf.push(`SELECT ${opts.bootSchema}._startup();`);
    buf.push(`DO
    $$
        BEGIN
        EXECUTE format($f$ALTER DATABASE %I SET plv8.start_proc TO "${opts.bootSchema}._startup"$f$, current_database());
        END
    $$;
    `);
    buf.push(`SET plv8.start_proc TO "${opts.bootSchema}._startup";`);

    // Kill all external connections to force reboot and new code usage
    buf.push(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename NOT IN (${opts.terminateExceptions}) AND pid != pg_backend_pid();`);
    buf.push('COMMIT;');
    return buf.join('\n');
}
