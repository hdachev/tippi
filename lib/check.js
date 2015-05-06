'use strict';

var buildScopes = require('./build-scopes'),
    typeEval = require('./type-eval');


// Currently does error reporting.
// TODO need to figure out where the module stuff goes, the stdlib, etc.
// TODO dont forget different modules could potentially see different stdlibs.

function Check() {
    this.errors = [];
}

Check.prototype.emitError = function (error) {

    // Drop duplicates and whatnot.
    var last = this.errors[this.errors.length - 1];
    if (last && last.tryCombine(error)) {
        return;
    }

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

