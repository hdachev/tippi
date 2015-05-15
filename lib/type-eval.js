'use strict';

var fail = require('./fail'),
    type = require('./type'),
    createStack = require('./stack'),
    evalGuards = require('./type-guards');


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
        if (node.init) {
            stack.scopeWrite(
                node, node.id.name,
                solveExpression(node.init, stack)
            );
        }
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

    IfStatement: function (node, stack) {

        // TODO guard shouldn't effect alt
        evalGuards(node.test, stack);

        var test = solveExpression(node.test, stack),

            testConst = test.isConstant(),
            skipConsequent = testConst && !test.getConstant(),
            skipAlternate = testConst && !skipConsequent;

        if (node.consequent && !skipConsequent) {
            solveStatement(node.consequent, stack);
        }
        if (node.alternate && !skipAlternate) {
            solveStatement(node.alternate, stack);
        }
    },


    // Expressions.

    Literal: function (node) {
        return type.fromConstant(node.value);
    },

    Identifier: function (node, stack) {
        var item = stack.scopeRead(node, node.name);
        if (!item) {
            return type.createUnknown();
        }

        return item;
    },

    ThisExpression: function (node, stack) {
        return stack.scopeRead(node, 'this')
            || type.undefined;
    },

    SequenceExpression: function (node, stack) {
        return solveExpressions(node.expressions, stack);
    },

    LogicalExpression: function (node, stack) {
        var op = node.operator,
            left = solveExpression(node.left, stack);

        // Logical short-circuitry.
        if (left.isConstant()) {
            var falsy = left.getConstant();
            if (op === '&&' && falsy) {
                return left;
            }
            if (op === '||' && !falsy) {
                return left;
            }
        }

        // TODO when left is unknown but right is const
        // we can return nonconstant strictly truthy/falsy types.
        return left.union(
            solveExpression(node.right, stack)
        );
    },

    BinaryExpression: function (node, stack) {
        var op = node.operator,
            left = solveExpression(node.left, stack),
            right = solveExpression(node.right, stack),
            result;

        switch (0) {
        case 0:

            // Addition.
            if (op === '+') {

                // If one operand is a string we allow the other to be anything.
                // TODO don't allow objects with default toString().
                if (left.typeof === 'string' || right.typeof === 'string') {
                    result = type.string;
                    break;
                }

                // Else we require numbers.
                if (left.isNot('number') || right.isNot('number')) {
                    stack.emitError(node, 'Binary `%s`: Incompatible operands %s, %s.', op, left, right);
                    result = type.createUnknown();
                    break;
                }

                result = type.number;
                break;
            }

            // Equality, require assignability.
            if (left.isNotAssignable(right) && right.isNotAssignable(left)) {
                stack.emitError(node, 'Binary `%s`: Incompatible operands %s, %s.', op, left, right);
            }
            if (op === '==' || op === '===' || op === '!=' || op === '!==') {
                result = type.boolean;
                break;
            }

            // Comparison, require primitives.
            if (left.isNotComparable() || right.isNotComparable()) {
                stack.emitError(node, 'Binary `%s`: Incompatible operands %s, %s.', op, left, right);
            }
            if (op === '<' || op === '<=' || op === '>' || op === '>=') {
                result = type.boolean;
                break;
            }

            // Numeric ops.
            if (left.isNot('number') || right.isNot('number')) {
                stack.emitError(node, 'Binary `%s`: Incompatible operands %s, %s.', op, left, right);
            }

            result = type.number;
        }

        // Constant fold.
        if (!left.isConstant() || !right.isConstant()) {
            return result;
        }

        var l = left.getConstant(),
            r = right.getConstant();

        switch (op) {
            /*jshint eqeqeq:false*/
            case '==':  return type.fromConstant(l == r);
            case '===': return type.fromConstant(l === r);
            case '!=':  return type.fromConstant(l != r);
            case '!==': return type.fromConstant(l !== r);
            case '<':   return type.fromConstant(l < r);
            case '<=':  return type.fromConstant(l <= r);
            case '>':   return type.fromConstant(l > r);
            case '>=':  return type.fromConstant(l >= r);
            case '+':   return type.fromConstant(l + r);
            case '-':   return type.fromConstant(l - r);
            case '*':   return type.fromConstant(l * r);
            case '**':  return type.fromConstant(Math.pow(l, r));
            case '/':   return type.fromConstant(l / r);
            case '%':   return type.fromConstant(l % r);
            case '|':   return type.fromConstant(l | r);
            case '&':   return type.fromConstant(l & r);
            case '^':   return type.fromConstant(l ^ r);
        }

        fail('binary ' + op);
    },

    UnaryExpression: function (node, stack) {
        var op = node.operator,
            arg = solveExpression(node.argument, stack);

        switch (op) {
            case 'typeof':
                return arg.typeof
                     ? type.fromConstant(arg.typeof)
                     : type.string;
            case '!':
                if (arg.isConstant()) {
                    return type.fromConstant(!arg.getConstant());
                }
                else {
                    return type.boolean;
                }
        }

        // Numeric operations.
        if (arg.isNot('number')) {
            stack.emitError(node, 'Unary `%s`: Incompatible argument.', op);
        }

        if (arg.isConstant()) {
            var n = arg.getConstant();
            switch (op) {
                case '+': return type.fromConstant(+n);
                case '-': return type.fromConstant(-n);
                case '~': return type.fromConstant(~n);
            }
        }

        return type.number;
    },

    MemberExpression: function (node, stack) {
        return solveMemberExpression(node, stack);
    },

    ObjectExpression: function (node, stack) {
        var keys = [],
            values = [];

        node.properties.forEach(function (node, idx) {
            node.key.type === 'Identifier' || fail('TODO computed properties', node);
            keys[idx] = node.key.name;
            values[idx] = solveExpression(node.value, stack);
        });

        return type.createObject(keys, values);
    },

    ArrayExpression: function (node, stack) {
        var values = [];

        node.elements.forEach(function (node, idx) {
            values[idx] = solveExpression(node, stack);
        });

        return type.createArray(values);
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

        return fun;
    },

    CallExpression: function (node, stack) {
        var thisObj, fun,
            args = solveExpressions(node.arguments, stack);

        // Methods.
        if (node.callee.type === 'MemberExpression') {
            thisObj = solveExpression(node.callee.object, stack);
            fun = solveMemberExpression(node.callee, stack, thisObj);
        }

        // Functions.
        else {
            thisObj = type.undefined;
            fun = solveExpression(node.callee, stack);
        }

        return solveFunctionCall(node, fun, thisObj, args, stack);
    },

    NewExpression: function (node, stack) {
        var fun = solveExpression(node.callee, stack),
            thisObj = type.fromConstructor(fun),
            args = solveExpressions(node.arguments, stack);

        var retObj = solveFunctionCall(node, fun, thisObj, args, stack);
        if (retObj.isConstructorReturnable()) {
            return retObj;
        }
        else {
            return thisObj;
        }
    },


    // Mutation.

    AssignmentExpression: function (node, stack) {
        node.operator === '=' || fail('TODO ' + node.operator);

        // Solve right, folding constants.
        var value = solveExpression(node.right, stack);
        if (!value.isNot('undefined')) {
            stack.emitError(node, 'Assigning `undefined`.');
        }

        // Assigning to a variable.
        // Variable types are also variable.
        if (node.left.type === 'Identifier') {
            stack.scopeWrite(node, node.left.name, value);
        }

        // Assigning to some mutable object's field/element.
        // We grab the left-hand value type and mutate it in place.
        else {
            node.left.type === 'MemberExpression' || fail(node);

            var key = solveMemberExpressionKey(node.left, stack),
                obj = solveExpression(node.left.object, stack);

            if (obj.isNotMutable()) {
                stack.emitError(node, 'Immutable type on the left-hand side of an assigment.');
            }
            if (!obj.trySetMember(key, value)) {
                stack.emitError(node, 'Broken assignment.');
            }
        }

        return value;
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


// Object utils.

function solveMemberExpressionKey(node, stack) {
    node.type === 'MemberExpression' || fail();

    var key;
    if (!node.computed) {
        node.property.type === 'Identifier' || fail(node);
        key = type.fromConstant(node.property.name);
    }
    else {
        key = solveExpression(node.property, stack);
    }

    return key;
}

function solveMemberExpression(node, stack, obj) {
    var key = solveMemberExpressionKey(node, stack);
    if (!obj) {
        obj = solveExpression(node.object, stack);
    }

    if (obj.doesNotHaveMember(key)) {
        stack.emitError(node, 'No property %s defined on %s.', key, obj);
    }
    else {
        var value = obj.getMember(key);
        if (value) {
            return value;
        }
    }

    return type.createUnknown();
}


// Function utils.

function solveFunctionCall(node, funValue, thisObj, args, stack) {
    var fun = funValue.getFunction();
    if (!fun) {
        if (funValue.isNot('function')) {
            stack.emitError(node, 'Not a function `%s`', funValue);
        }

        return type.createUnknown();
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

    var origin = stack.getParentScope();
    var closure = function (fromNode, thisObj, args, stack) {

        // Split path on union args.
        for (var i = 0, n = args.length; i < n; i++) {
            if (args[i].isUnion()) {
                /*jshint loopfunc:true*/
                args = args.slice();
                return type.union(
                    args[i].mapVariants(function (arg) {
                        args[i] = arg;
                        return closure(fromNode, thisObj, args, stack);
                    })
                );
            }
        }

        // Prevent recursions.
        if (stack.detectRecursion(node)) {
            return type.createUnknown();
        }

        // Switch to the callee's scope chain.
        stack = stack.enterCalleeScope(fromNode, node, origin);

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

        //
        node.type === 'ArrowFunctionExpression'
            && fail('TODO ArrowFunctionExpression return:', node);

        // Return value is the union of all returns.
        var retVals = stack.getReturned();
        if (retVals.length) {
            return type.union(retVals);
        }
        else {
            return type.undefined;
        }
    };

    // Type functions.
    return type.createFunction(closure);
}


// Export a program checker.

module.exports = function typeEval(ast, check) {
    solveStatement(ast, createStack(ast, check));
};

