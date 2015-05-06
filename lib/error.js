'use strict';

var util = require('util'),
    fail = require('./fail');


// Error and stack trace formatting.

function TippiError(node, message) {

    // Error loc.
    node.loc && node.type || fail();
    this.stack = [];
    this.pushCaller(node);

    // Error message.
    if (Array.isArray(message)) {
        message = util.format.apply(util, message);
    }

    typeof message === 'string' || fail();
    this.message = message;
}

TippiError.prototype.toString = function () {
    return 'Error: '
         + this.message + '\n'
         + this.formatStackTrace() + '\n';
};

TippiError.prototype.formatStackTrace = function () {
    return this.stack
        .map(function (line) {
            return '    at ' + line;
        })
        .join('\n');
};


// Hacky stack trace reconstruction.

TippiError.prototype.pushCaller = function (node) {
    var loc = node.loc,
        fileInfo = node.$scope.getFileInfo();

    this.stack.push(fileInfo.name + ':' + loc.start.line + ':' + loc.start.column);
};

TippiError.prototype.pushCallee = function (node) {
    var idx = this.stack.length - 1,
        funName = node.id && node.id.name || 'anon';

    this.stack[idx] = funName + ' (' + this.stack[idx] + ')';
};


// Maybe we want to dedupe redundant errors.

TippiError.prototype.tryCombine = function (otherError) {
    otherError instanceof TippiError || fail();

    this.formatStackTrace() === otherError.formatStackTrace();
    this.message += '\n    ' + otherError.message;
    return true;
};


//

module.exports = function createError(args) {
    return new TippiError(args[0], args.slice(1));
};

