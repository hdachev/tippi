'use strict';

var fail = require('./fail'),
    type = require('./type'),
    staticEval = require('./static-eval'),
    createStack = require('./stack');


// Drafting the recursive type solver thing.

var SOLVERS = {


    // Statements.

    Program: function (node, stack) {
        solveStatements(node.body, stack);
    },

    VariableDeclaration: function (node, stack) {
        solveStatements(node.declarations, stack);
    },

    VariableDeclarator: function (node, stack) {
        node.init && stack.scopeWrite(
            node, node.id.name,
            solveExpression(node.init, stack)
        );
    },

    ExpressionStatement: function (node, stack) {
        solveExpression(node.expression, stack);
    },

    BlockStatement: function (node, stack) {
        solveStatements(node.body, stack);
    },

    ReturnStatement: function (node, stack) {
        if (node.argument) {
            stack.returnValue(
                node,
                solveExpression(node.argument, stack)
            );
        }
        else {
            stack.returnVoid(node);
        }
    },


    // Expressions.

    Literal: function (node) {
        return type.fromValue(node.value);
    },

    Identifier: function (node, stack) {
        var item = stack.scopeRead(node, node.name);
        if (!item) {
            stack.emitError(node, 'No such item in scope: `%s`', node.name);
            return type.undefined;
        }

        return item;
    },

    SequenceExpression: function (node, stack) {
        return solveExpressions(node.expressions, stack);
    },

    BinaryExpression: function (node, stack) {
        var op = node.operator,
            left = solveExpression(node.left, stack),
            right = solveExpression(node.right, stack);

        // Logical, allow all types.
        switch (op) {
            case '&&':
            case '||':
                return left.union(right);
        }

        // Equality, require type assignability.
        if (left.isNotAssignable(right) && right.isNotAssignable(left)) {
            stack.emitError(node, 'Binary `%s`: Incompatible operands %s, %s.', op, left, right);
        }
        switch (op) {
            case '==':
            case '===':
            case '!=':
            case '!==':
                return type.boolean;
        }

        // Addition and comparison, numbers and strings.
        if (left.isNotAddable()) {
            stack.emitError(node, 'Binary `%s`: Left operand not addable %s.', op, left);
        }
        if (right.isNotAddable()) {
            stack.emitError(node, 'Binary `%s`: Right operand not addable %s.', op, right);
        }
        switch (op) {
            case '+':
                // TODO we can improve on numerics by tracking ranges
                // so we can do bounds-checking and whatnot.
                return left;

            case '<':
            case '<=':
            case '>':
            case '>=':
                return type.boolean;
        }

        // Numeric ops.
        if (left.isNot('number')) {
            stack.emitError(node, 'Binary `%s`: Left operand not a number %s.', op, left);
        }
        if (right.isNot('number')) {
            stack.emitError(node, 'Binary `%s`: Right operand not a number %s.', op, right);
        }

        return type.number;
    },

    UnaryExpression: function (node, stack) {
        var op = node.operator,
            arg = solveExpression(node.argument, stack);

        if (op === '!') {
            return type.boolean;
        }

        if (arg.isNot('number')) {
            stack.emitError(node, 'Unary `%s`: Incompatible argument.', op);
        }

        return type.number;
    },

    CallExpression: function (node, stack) {
        var args = solveExpressions(node.arguments, stack),
            thisObj = type.undefined,
            fun;

        // Methods.
        if (node.callee.type === 'MemberExpression') {
            thisObj = solveExpression(node.callee.object, stack);
            fun = solveMemberExpression(node.callee, stack, thisObj);
        }

        // Functions.
        else {
            fun = solveExpression(node.callee, stack);
        }

        return solveFunctionCall(node, fun, thisObj, args, stack);
    },

    MemberExpression: function (node, stack) {
        return solveMemberExpression(node, stack);
    },

    ObjectExpression: function (node, stack) {
        var keys = [],
            values = [];

        node.properties.forEach(function (node, idx) {
            node.key.type !== 'Identifier' || fail('TODO computed properties');
            keys[idx] = node.key.name;
            values[idx] = solveExpression(node.value, stack);
        });

        return type.createObject(keys, values);
    },


    // Functions.

    FunctionExpression: function (node, stack) {
        return createClosure(node, stack);
    },

    ArrowFunctionExpression: function (node, stack) {
        return this.FunctionExpression(node, stack);
    },

    FunctionDeclaration: function (node, stack) {
        var fun = this.FunctionExpression(node, stack);
        if (fun) {
            stack.scopeWrite(node, node.id.name, fun);
        }
    },

};


// Utils.

function solveStatement(node, stack) {
    node.type in SOLVERS || fail(node);
    SOLVERS[node.type](node, stack.enterChildScope(node));
}

function solveStatements(nodes, stack) {
    for (var i = 0, n = nodes.length; i < n; i++) {
        var node = nodes[i];
        node.type in SOLVERS || fail(node);
        SOLVERS[node.type](node, stack.enterChildScope(node));
    }
}

function solveExpression(node, stack) {
    node.type in SOLVERS || fail(node);
    return SOLVERS[node.type](node, stack.enterChildScope(node))
        || fail(node);
}

function solveExpressions(nodes, stack) {
    var arr = [];
    for (var i = 0, n = nodes.length; i < n; i++) {
        var node = nodes[i];
        node.type in SOLVERS || fail(node);
        arr[i] = SOLVERS[node.type](node, stack.enterChildScope(node))
            || fail('#' + i + '/' + n, node);
    }

    return arr;
}


//

function solveMemberExpression(node, stack, obj) {
    node.type === 'MemberExpression' || fail();
    if (!obj) {
        obj = solveExpression(node.object, stack);
    }

    // Property.
    var key;
    if (node.property.type === 'Identifier') {
        key = node.property.name;
    }

    // Index.
    else {

        // Try static evaling the property expression.
        // TODO we need to do type checking while static evaling.
        var known = staticEval(node.property, stack);
        if (known) {
            key = known.value;
        }

        // TODO this might be a collection and we can return element types.
        // TODO make element types dependent on index types,
        // TODO this should allow for stuff like [string, number, ...],
        // TODO looking up stuff on unknown objects by symbol, etc.
        else {
            return type.unknown;
        }
    }

    // Property or element.
    if (obj.doesNotHaveMember(key)) {
        stack.emitError(node, 'No property `%s` defined on %s.', key, obj);
    }
    else {
        var value = obj.getMember(key);
        if (value) {
            return value;
        }
    }

    return type.unknown;
}


// Functions.

function solveFunctionCall(node, funValue, thisObj, args, stack) {
    var fun = funValue.getFunction();
    if (!fun) {
        if (funValue.isNot('function')) {
            stack.emitError(node, 'Not a function `%s`', funValue);
        }

        return type.unknown;
    }

    return fun(node, thisObj, args, stack);
}

function createClosure(node, stack) {

    // This is a function declaration or whatever.
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
        || fail();
    stack.scope === node.$scope
        || fail();

    // TODO this is a good place to go through
    // obvious function type requirements,
    // such as unguarded property accesses, numeric operators, etc.

    // Asserting because this got a little messy.
    // Scope of origin is parent scope, so we throw this away.
    var origin = stack.getParentScope();

    // Type functions.
    return type.fromFunction(
        function (fromNode, thisObj, args, stack) {

            // Switch to the callee's scope chain.
            stack = stack.enterCalleeScope(node, origin);

            // Populate `this` and `args`.
            if (stack.localExists('this')) {
                stack.initLocal('this', thisObj);
            }

            // Populate argument vars.
            node.params.forEach(function (id, idx) {
                id.type === 'Identifier' || fail();
                stack.initLocal(
                    id.name,
                    args[idx] || type.undefined
                );
            });

            // TODO arguments object
            solveStatement(node.body, stack);

            // Return value is the union of all returns.
            return type.union(
                stack.getReturned()
            );
        }
    );
}


// Export a program checker.

module.exports = function typeEval(ast, check) {
    solveStatement(ast, createStack(ast, check));
};

