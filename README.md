# Regres: A PLV8 Development Library

Regres is a library that makes maintaining PLV8 procedures a lot easier. PLV8 is a powerful extension created for Postgres that brings the V8 Javascript engine into the database. If you want to keep your stack purely Javascript even when using relational databases, PLV8 is a great choice.

PLV8 is heavily sandboxed which is a positive but makes working with it somewhat complicated if your intention is "Node inside the database" as opposed to one-off Javascript procedures.

Regres has been created to make the entire process easier. All you have to do is create a Javascript/Node application as you normally would and define some public Postgres procedure exposure points using ES6 decorators. Then, Regres will create an installation script and you will have a purely sandboxed Node-like application ready to call inside your database.

The name Regres is a tongue-in-cheek reference to the perception non-Javascript developers have towards the brave new Javascript-everywhere world.

## How to use

You can install Regres via NPM as a global dependency.

`npm install -g regres`

Or you can install it as a local dependency (preferred).

`npm install --save-dev regres`

If you install it as a local dependency, you will call it by calling:

`npm run regres`

Example usage:

`regres build main.js install.sql`

Or you may simply print to stdout:

`regres build main.js`

Run `regres build --help` for all the configuration options.

## Javascript Structure

Regres tries to make formating your Javascript as straightforward as possible. What you should do is try and minimize the amount of helper Javascript that cares about database integration. Make the majority of your Javascript business logic portable across browser and Node environments and then define database specific bindings for procedures you want to be able to call from the database.

### Procedure definitions

There is one main "you have to do things this way" opinion of this tool. The Javascript entrypoint file you feed in must contain code structured as such:

```
module.exports = {
    Foo: new Foo(),
    Bar: new Bar()
};
```

Both `Foo` and `Bar` are ES6 classes and both contain functions that include Postgres shape decorators.

Here is a sample:

```
class Foo {
    @PGShape(['text'], 'text')
    hello(world) {
        var helloThere = `hello ${world}`;
        console.log(helloThere);
        return helloThere;
    }
}
```

First of all you may notice there is `console.log` support. If you've used PLV8 you are aware that you generally have to use `plv8.elog` instead. This project includes all the typical `console` functions wrapping `plv8.elog` (`log`, `info`, `warn`, `error`, and `debug`). This should make portability easier and logging not so much of a "wait what's the other syntax" concentration-breaking endeavor.

Besides that though there is an ES7 decorator at the top of the function.

`@PGShape(['text'], 'text')`

The first argument `['text']`, is an array of Postgres argument types. The second argument `text` is the Postgres return type. There is a third argument as well, an options object: `{behavior: VOLATILE, isPublic: false, allowNull: false}`.

* `behavior`: One of `VOLATILE`, `STABLE` or `IMMUTABLE`. Note that these are not strings but global constants so you do not have to quote them. Just do `{behavior: IMMUTABLE}`. By default, behavior is `VOLATILE`.
* `isPublic`: Whether the `public` role should be granted access to this procedure. Note that if you use a different Postgres role than `public` for public stuff you may specify this as an option when building. By default procedures are not public.
* `allowNull`: Whether the procedure should check it's arguments for `NULL` values or not. By default `NULL` arguments are not allowed. In this case the procedure will throw if `NULL` values are passed.

**A note on binary return values**

PLV8 cannot return byte arrays. However, Regres can. If you specify a `bytea` return type, then you should write your Javascript to return a hexadecimal encoded string. The procedure wrappers that get built will take this hexadecimal string and parse it into a `bytea` value. Note that this is only applicable for functions that are meant to be exposed, all internal functions in PLV8 handle byte buffers just fine.

**A note on trigger function arguments**

Trigger functions have access to a plethora of global state variables when executing in Postgres. These variables are all passed in as a map in the first argument of the function. An example of how one would use these values is below. Note that the example is non-exhaustive; all Postgres trigger globals are passed in, even if not demonstrated here.

```
@PGShape(null, 'trigger')
handleTrigger({NEW, OLD, TG_NAME}) {
...
```

The name of the procedure in Postgres is snake-cased (underscore-separated) and is a concatenation of the key on the top-level `module.exports` with the name of the function as it is defined in Javascript. For example, with the above `Foo` code, a Postgres procedure would exist name `foo_hello(text)`.

### Type definitions

A type is just a Postgres composite type that can be defined via Javascript decorators. The reason one might want to do this is so that their functions can take non-standard types without the type definition being external to the rest of the code.

```
@PGType({
    id: 'integer',
    content: 'text',
    createdAt: 'timestamp with time zone'
})
class SampleType { }
```

The ES6 class is just there as a token, it should be empty.

You may use these types in your Shape definitions like so:

`@PGShape([SampleType], 'text')`

**Important note on type disposability**

Due to the way Postgres handles types, we destroy and recreate the type every install. Therefore any types defined this way should only be used internally to the loaded Javascript. Any types which have meaning outside of the context of the procedures being written should be defined on the Postgres level.

## Examples

Check out the examples folder for examples. On the first install, you will need to disconnect from the Postgres server and reconnect as your active session will not have the startup script triggered which is necessary to instatiate all the globals. However after the first install this should no longer be necessary.

## Caveats

This isn't actually a Node environment so typical Browserify caveats apply. Native binding libraries will not work, etc. This is a Browserify build of your Node application with a maintenance script that handles Postgres procedure exposure and so the sandboxing caveats of PLV8 still exist as do the non-native execution caveats of Browserify builds.

Also, when installing new versions of your code, the installation will purposefully fail if it cannot delete types or procedures that are un-droppable (it will not `CASCADE` as that is more dangerous). The entire installation will fail, not just part.

On the flipside, it goes without saying that if you break your business logic, your functions may install correctly and continue to be bound to the database calls you attached them to, but the results may get messed up if you broke something. This risk is similar to if you have a database trigger that you hot replace but the new trigger code is broken and is not related to PLV8 but should be kept in mind.

Finally, one last fairly major potential gotcha is the fact that you will have to manually run reindexing if you alter the logic of the function. This is no different than if it's a regular PL/PGSQL function, but it should be noted. Function mutability in Postgres can cause inconsistent data states depending on what the function is used for and this is currently on the developer to handle. Regres does not handle any of this stuff, however it might trick you into feeling comfortable about agility without consequence, so beware.
