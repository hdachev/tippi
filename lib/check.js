'use strict';

var buildScopes = require('./build-scopes'),
    typeEval = require('./type-eval');


//

function Check(fileInfo) {
    this.errors = [];
    this.fileInfo = fileInfo;
}

Check.prototype.getFileInfo = function () {
    return this.fileInfo;
};

Check.prototype.emitError = function (error) {

    // Drop duplicates and whatnot.
    var last = this.errors[this.errors.length - 1];
    if (last && last.tryCombine(error)) {
        return;
    }

    this.errors.push(error);
};

Check.prototype.hasErrors = function () {
    return this.errors.length > 0;
};


//

var NOFILE = { name: 'nofile' };

module.exports = function checkAST(ast, fileInfo) {
    var check = new Check(fileInfo || NOFILE);
    buildScopes(ast, check);
    typeEval(ast, check);
    return check;
};

