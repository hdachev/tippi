'use strict';

var buildScopes = require('./build-scopes'),
    foldConstants = require('./fold-constants'),
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
    var check = new Check();

    // Prep work.
    buildScopes(ast, check);
    foldConstants(ast, check);

    //

    return check;
};

