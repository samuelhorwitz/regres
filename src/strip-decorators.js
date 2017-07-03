// Adapted from https://github.com/babel/babel/blob/master/packages/babel-plugin-transform-decorators/src/index.js

module.exports = function ({ types: t }) {
  function destroyDecorators(path, state) {
    state;

    let classDecorators = path.node.decorators;
    if (classDecorators) {
      path.node.decorators = null;
    }

    for (let method of path.get('body.body')) {
      let decorators = method.node.decorators;
      if (!decorators) continue;

      method.node.decorators = null;
    }
  }

  function hasDecorators(path) {
    if (path.isClass()) {
      if (path.node.decorators) return true;

      for (let method of (path.node.body.body)) {
        if (method.decorators) {
          return true;
        }
      }
    } else if (path.isObjectExpression()) {
      for (let prop of (path.node.properties)) {
        if (prop.decorators) {
          return true;
        }
      }
    }

    return false;
  }

  return {
    inherits: require('babel-plugin-syntax-decorators'),

    visitor: {
      ClassExpression(path) {
        if (!hasDecorators(path)) return;
        destroyDecorators(path, this);
      }
    }
  };
}