'use strict';

var util = require('util'),
    COLORS = { colors: true };


// Hacky ast pretty-printer.

function prettyPrint(ast, indent) {
    var out = '';
    if (!indent) {
        indent = '';
    }

    // Stuff in blocks and whatnot are nodes in arrays.
    if (Array.isArray(ast)) {
        var outer = '\n' + indent + '+ ';
        var inner = indent + '| ';
        for (var i = 0, n = ast.length; i < n; i++) {
            if (i === n - 1) {
                inner = indent + '  ';
            }
            out += outer + prettyPrint(ast[i], inner);
        }

        return out;
    }

    // Abort if this doesn't look like an ast node.
    if (typeof ast.type !== 'string' || !ast.loc) {
        return out;
    }

    out += ast.type;
    indent += '  ';

    // Traverse children.
    for (var key in ast) {
        if (!ast.hasOwnProperty(key) || key === 'loc' || key === 'type') {
            continue;
        }

        out += '\n' + indent + key + ': ';

        var val = ast[key];
        if (typeof val === 'object') {
            out += prettyPrint(val, indent);
        }
        else {
            out += util.inspect(val, COLORS);
        }
    }

    return out;
}

module.exports = prettyPrint;
