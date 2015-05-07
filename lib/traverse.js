'use strict';

// Hacky ast traversal,
// dont have interwebz right now so this should do for starters.

function traverse(ast, enter, exit, parent) {

    // Stuff in blocks and whatnot are nodes in arrays.
    if (Array.isArray(ast)) {
        for (var i = 0, n = ast.length; i < n; i++) {
            traverse(ast[i], enter, exit, parent);
        }

        return;
    }

    // Abort if this doesn't look like an ast node.
    if (typeof ast.type !== 'string' || !ast.loc) {
        return;
    }

    // Visit.
    enter(ast, parent);

    // Traverse all children.
    for (var key in ast) {
        var val = ast[key];
        if (val && typeof val === 'object') {
            traverse(ast[key], enter, exit, ast);
        }
    }

    // Leave.
    if (exit) {
        exit(ast, parent);
    }
}

module.exports = traverse;
