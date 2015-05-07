'use strict';

var type = require('./type'),

    TYPEOFS = {
        'string': type.string,
        'number': type.number,
        'boolean': type.boolean,
        'undefined': type.undefined,
    };

var TYPE_GUARDS = {

    LogicalExpression: function (node, stack) {
        if (node.operator !== '&&') {
            return;
        }

        evalGuards(node.left, stack);
        evalGuards(node.right, stack);
    },

    BinaryExpression: function (node, stack) {
        var handler = TYPE_GUARDS[node.operator];
        if (handler) {
            handler(node, stack);
        }
    },


    // instanceOf guard.

    'instanceof': function (node) {
        var argument = node.left;
        if (argument !== 'Identifier') {
            return;
        }

        var constructor = node.right;
        if (constructor !== 'Identifier') {
            return;
        }

        // TODO
    },


    // typeof guards.

    '==': function (node, stack) {
        TYPE_GUARDS['==='](node, stack);
    },

    '===': function (node, stack) {
        var left = node.left,
            right = node.right;

        // string === typeof var
        if (right.type === 'UnaryExpression') {
            left = node.right;
            right = node.left;
        }

        if (left.type !== 'UnaryExpression' || left.operator !== 'typeof') {
            return;
        }
        if (left.argument.type !== 'Identifier') {
            return;
        }
        if (right.type !== 'Literal') {
            return;
        }

        var guard = TYPEOFS[right.value];
        if (guard) {
            stack.scopeGuard(node, left.argument.name, guard);
        }
    }

};

function evalGuards(node, stack) {
    var handler = TYPE_GUARDS[node.type];
    if (handler) {
        handler(node, stack);
    }
}

module.exports = evalGuards;
