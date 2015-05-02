'use strict';

var buildScope = require('./build-scope'),
    util = require('util');

function Check() {
    this.errors = [];
}

Check.prototype.emitError = function (node) {
    var loc = node.loc,
        reason = util.format.apply(util, Array.prototype.slice.call(arguments).slice(1)),
        error = '(' + loc.start.line + ',' + loc.start.column + '): ' + reason;

    this.errors.push(error);
};

Check.prototype.hasErrors = function () {
    return this.errors.length > 0;
};

module.exports = function (ast) {

    // Setup scopes.
    var check = new Check();
    buildScope(ast, check);

    // Start populating types.


    return check;
};

