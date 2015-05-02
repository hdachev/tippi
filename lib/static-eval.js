'use strict';
/*jshint curly:false, eqeqeq:false, eqnull:true*/

var fail = require('./fail');


// Mostly a copy/paste of `substack/static-eval`,
// modded for scope interop and asserts and whatnot.

var FAIL = {};

function tryEval(node) {
    var type = node.type;
    if (type in STATIC_EVAL) {
        return STATIC_EVAL[type](node);
    }

    return FAIL;
}

/*  Concept -
    We can whitelist stdlib funcs that are ok to invoke while const folding.
    Ideally we should be able to check their params though.

var PURE = [
    Array.concat, Array.indexOf, Array.lastIndexOf,
    String.charAt, String.charCodeAt, String.toLowerCase, String.toUpperCase,
    Math.*
];

    Next step would be to have func purity in the type system,
    and start evaluating arbitrary user funcs as well.
*/

var STATIC_EVAL = {

    Literal: function (node) {
        return node.value;
    },

    Identifier: function (node) {
        var item = node.$scope.findItem(node.name);
        if (!item) {
            return FAIL;
        }

        // Constants and single-assigned vars.
        var write = item.getSingleWrite();
        if (!write) {
            return FAIL;
        }

        return tryEval(write);
    },

    UnaryExpression: function (node) {
        var val = tryEval(node.argument);
        if (val === FAIL) return FAIL;

        var op = node.operator;
        if (op === '!') return !val;
        if (op === '+') return +val;
        if (op === '-') return -val;
        if (op === '~') return ~val;

        fail('unary ' + op);
    },

    LogicalExpression: function (node) {
        var op = node.operator;

        var l = tryEval(node.left);
        if (l === FAIL) return FAIL;
        if (op === '&&' && !l) return l;
        if (op === '||' && l) return l;

        var r = tryEval(node.right);
        if (r === FAIL) return FAIL;
        if (op === '&&') return l && r;
        if (op === '||') return l || r;

        fail('logical ' + op);
    },

    BinaryExpression: function (node) {
        var op = node.operator,
            l = tryEval(node.left),
            r = tryEval(node.right);

        if (op === '==') return l == r;
        if (op === '===') return l === r;
        if (op === '!=') return l != r;
        if (op === '!==') return l !== r;

        if (op === '+') return l + r;
        if (op === '<') return l < r;
        if (op === '<=') return l <= r;
        if (op === '>') return l > r;
        if (op === '>=') return l >= r;

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

    ConditionalExpression: function (node) {
        var value = tryEval(node.test);
        if (value === FAIL) return FAIL;

        return value
             ? tryEval(node.consequent)
             : tryEval(node.alternate);
    },

    ArrayExpression: function (node) {
        var arr = [];
        for (var i = 0, l = node.elements.length; i < l; i++) {
            var element = tryEval(node.elements[i]);
            if (element === FAIL) return FAIL;

            arr[i] = element;
        }

        return arr;
    },

    ObjectExpression: function (node) {
        var obj = {};
        for (var i = 0; i < node.properties.length; i++) {
            var property = node.properties[i];

            var key;
            if (property.key.type === 'Identifier') {
                key = property.key.name;
            }
            else {
                key = tryEval(property.key);
                if (key === FAIL) return FAIL;
            }

            var value = tryEval(property.value);
            if (value === FAIL) return FAIL;
            obj[key] = value;
        }

        return obj;
    },

    MemberExpression: function (node) {
        var obj = tryEval(node.object);
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
            key = tryEval(node.property);
            if (key === FAIL) return FAIL;
        }

        return obj[key];
    },
};


//

module.exports = function tryFold(node) {
    if (node.$folds === false) {
        return;
    }

    // Cache results on nodes.
    if (node.$folds !== true) {
        var val = tryEval(node);
        if (val === FAIL) {
            node.$folds = false;
            return;
        }

        node.$folds = true;
        node.$folded = val;
    }

    return { value: node.$folded };
};

