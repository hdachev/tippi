'use strict';
/*jshint curly:false, eqeqeq:false, eqnull:true*/

var fail = require('./fail'),
    traverse = require('./traverse');


// Mostly a copy/paste of `substack/static-eval`.
// Modded for scope interop and to do some basic type checking along the way.

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

        // We can only fold constants.
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
        if (typeof val !== 'number') {
            node.$scope.emitError(node, 'Non-numeric argument for unary `' + op + '`.');
            return FAIL;
        }

        if (op === '+') return +val;
        if (op === '-') return -val;
        if (op === '~') return ~val;
        fail('unary ' + op);
    },

    LogicalExpression: function (node) {
        return this.BinaryExpression(node);
    },

    BinaryExpression: function (node) {
        var l = tryEval(node.left);
        if (l === FAIL) return FAIL;
        var r = tryEval(node.right);
        if (r === FAIL) return FAIL;

        var op = node.operator,
            scope = node.$scope;

        // Logical, untyped.
        if (op === '&&') return l && r;
        if (op === '||') return l || r;

        // Equality, require same type.
        if (typeof r !== typeof l) {
            scope.emitError(node, 'Incompatible operands for `' + op + '`.');
            return FAIL;
        }

        if (op === '==') return l == r;
        if (op === '===') return l === r;
        if (op === '!=') return l != r;
        if (op === '!==') return l !== r;

        // Addition and comparison, numbers & strings only.
        if (typeof l !== 'number' && typeof l !== 'string') {
            scope.emitError(node, 'Incompatible left operand for `' + op + '`.');
            return FAIL;
        }
        if (typeof r !== 'number' && typeof r !== 'string') {
            scope.emitError(node, 'Incompatible right operand for `' + op + '`.');
            return FAIL;
        }

        if (op === '+') return l + r;
        if (op === '<') return l < r;
        if (op === '<=') return l <= r;
        if (op === '>') return l > r;
        if (op === '>=') return l >= r;

        // Number ops.
        if (typeof l !== 'number') {
            scope.emitError(node, 'Incompatible left operand for `' + op + '`: ' + l);
            return FAIL;
        }
        if (typeof r !== 'number') {
            scope.emitError(node, 'Incompatible left operand for `' + op + '`: ' + r);
            return FAIL;
        }

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
        var val = tryEval(node.test);
        if (val === FAIL) return FAIL;
        return val
             ? tryEval(node.consequent)
             : tryEval(node.alternate);
    },

    ArrayExpression: function (node) {
        var xs = [];
        for (var i = 0, l = node.elements.length; i < l; i++) {
            var x = tryEval(node.elements[i]);
            if (x === FAIL) return FAIL;
            xs.push(x);
        }
        return xs;
    },

    ObjectExpression: function (node) {
        var obj = {};
        for (var i = 0; i < node.properties.length; i++) {
            var prop = node.properties[i];
            prop.value || fail();

            var val = tryEval(prop.value);
            if (val === FAIL) return FAIL;
            obj[prop.key.value || prop.key.name] = val;
        }
        return obj;
    },

    MemberExpression: function (node) {
        var obj = tryEval(node.object);
        if (obj === FAIL) return FAIL;
        if (obj == null) {
            node.emitError(node, 'Cannot read property of ' + obj);
            return FAIL;
        }

        if (node.property.type === 'Identifier') {
            return obj[node.property.name];
        }

        var prop = tryEval(node.property);
        if (prop === FAIL) return FAIL;
        return obj[prop];
    },
};

function tryFold(node) {
    if (node.$fold === false) {
        return;
    }

    // Cache results on nodes.
    if (node.$fold !== true) {
        var val = tryEval(node);
        if (val === FAIL) {
            node.$fold = false;
            return;
        }

        node.$fold = true;
        node.$foldValue = val;
    }

    return { value: node.$foldValue };
}


//

var FOLD_TARGETS = {

    VariableDeclarator: function (node) {
        if (node.init) {
            tryFold(node.init);
        }
    },
};

module.exports = function foldConstants(ast) {
    traverse(ast, function (node) {
        var type = node.type;
        if (type in FOLD_TARGETS) {
            FOLD_TARGETS[type](node);
        }
    });
};

