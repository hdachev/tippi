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

        // Ignore $caches.
        if (key[0] === '$') {
            continue;
        }

        if (!ast.hasOwnProperty(key) || key === 'loc' || key === 'type') {
            continue;
        }


        var val = ast[key];
        if (typeof val === 'object') {
            val = prettyPrint(val, indent);
        }
        else {
            val = util.inspect(val, COLORS);
        }

        if (val) {
            out += '\n' + indent + key + ': ' + val;
        }
    }

    // Compact representation.
    if (out.length < 512) {
        var compact = out.replace(/\n[\s|]+/g, ' ').trim();
        if (compact.length < 64) {
            return '(' + compact + ')';
        }
    }

    return out;
}

module.exports = prettyPrint;
