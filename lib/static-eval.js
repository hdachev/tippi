'use strict';
/*jshint curly:false, eqeqeq:false, eqnull:true*/

var fail = require('./fail');


// Mostly a copy/paste of `substack/static-eval`,
// modded for scope interop and asserts and whatnot.

var FAIL = {};

function staticEval(node, stack) {
    var type = node.type;
    if (type in STATIC_EVAL) {
        return STATIC_EVAL[type](node, stack);
    }

    return FAIL;
}

module.exports = staticEval;
module.exports.FAIL = FAIL;


//

var STATIC_EVAL = {

    Literal: function (node) {
        return node.value;
    },

    Identifier: function (node, stack) {
        var item = stack.scopeRead(node, node.name);
        if (!item.isConstant()) {
            return FAIL;
        }

        return item.getConstant();
    },

    UnaryExpression: function (node, stack) {
        var val = staticEval(node.argument, stack);
        if (val === FAIL) return FAIL;

        var op = node.operator;
        if (op === '!') return !val;
        if (op === '+') return +val;
        if (op === '-') return -val;
        if (op === '~') return ~val;

        fail('unary ' + op);
    },

    LogicalExpression: function (node, stack) {
        var op = node.operator;

        var l = staticEval(node.left, stack);
        if (l === FAIL) return FAIL;
        if (op === '&&' && !l) return l;
        if (op === '||' && l) return l;

        var r = staticEval(node.right, stack);
        if (r === FAIL) return FAIL;
        if (op === '&&') return l && r;
        if (op === '||') return l || r;

        fail('logical ' + op);
    },

    BinaryExpression: function (node, stack) {
        var op = node.operator;

        var l = staticEval(node.left, stack);
        if (l === FAIL) return FAIL;

        var r = staticEval(node.right, stack);
        if (r === FAIL) return FAIL;

        if (op === '==') return l == r;
        if (op === '===') return l === r;
        if (op === '!=') return l != r;
        if (op === '!==') return l !== r;
        if (op === '<') return l < r;
        if (op === '<=') return l <= r;
        if (op === '>') return l > r;
        if (op === '>=') return l >= r;

        if (op === '+') return l + r;
        if (op === '-') return l - r;
        if (op === '*') return l * r;
        if (op === '**') return Math.pow(l, r);
        if (op === '/') return l / r;
        if (op === '%') return l % r;
        if (op === '|') return l | r;
        if (op === '&') return l & r;
        if (op === '^') return l ^ r;

        fail('binary ' + op);
    },

    ConditionalExpression: function (node, stack) {
        var value = staticEval(node.test, stack);
        if (value === FAIL) return FAIL;

        return value
             ? staticEval(node.consequent, stack)
             : staticEval(node.alternate, stack);
    },

    ArrayExpression: function (node, stack) {
        var arr = [];
        for (var i = 0, l = node.elements.length; i < l; i++) {
            var element = staticEval(node.elements[i], stack);
            if (element === FAIL) return FAIL;

            arr[i] = element;
        }

        return arr;
    },

    ObjectExpression: function (node, stack) {
        var obj = {};
        for (var i = 0; i < node.properties.length; i++) {
            var property = node.properties[i];

            var key;
            if (property.key.type === 'Identifier') {
                key = property.key.name;
            }
            else {
                key = staticEval(property.key, stack);
                if (key === FAIL) return FAIL;
            }

            var value = staticEval(property.value, stack);
            if (value === FAIL) return FAIL;
            obj[key] = value;
        }

        return obj;
    },

    MemberExpression: function (node, stack) {
        var obj = staticEval(node.object, stack);
        if (obj === FAIL) return FAIL;
        if (obj == null) {
            node.emitError(node, 'Cannot read properties of ' + obj);
            return FAIL;
        }

        var key;
        if (node.property.type === 'Identifier') {
            key = node.property.name;
        }
        else {
            key = staticEval(node.property, stack);
            if (key === FAIL) return FAIL;
        }

        return obj[key];
    },
};
