'use strict';

var buildScopes = require('./build-scopes'),
    typeEval = require('./type-eval'),
    util = require('util');


// Currently does error reporting.
// TODO need to figure out where the module stuff goes, the stdlib, etc.
// TODO dont forget different modules could potentially see different stdlibs.

function Check() {
    this.errors = [];
}

Check.prototype.emitError = function (node) {
    var loc = node.loc,
        reason = util.format.apply(util, Array.prototype.slice.call(arguments).slice(1)),
        error = '(' + loc.start.line + ',' + loc.start.column + '): ' + reason;

    this.errors.push(error);
};

Check.prototype.addErrorContext = function () {
    // TODO
};

Check.prototype.hasErrors = function () {
    return this.errors.length > 0;
};


//

module.exports = function (ast) {
    var check = new Check();

    // One pass to setup scopes.
    buildScopes(ast, check);

    // Evaluate types.
    typeEval(ast, check);

    //
    return check;
};

