'use strict';

var fail = require('./fail');
var traverse = require('./traverse');
var nextGen = 1;


// Scope.

function Scope(node, parent) {
    this.gen = nextGen++;
    this.node = node || fail();
    this.items = {};
    this.parent = parent || fail();
    this.hoisting = parent.hoisting || this;
    this.children = [];

    if (parent.children) {
        parent.children.push(this);
    }
}

Scope.prototype.findItem = function (name) {
    var scope = this;
    while (scope) {
        var item = scope.items && scope.items[name];
        if (item) {
            return item;
        }

        scope = scope.parent;
    }

    return null;
};

// The public isConstant doesn't care about the variable kind,
// so single-assigned vars and non-overwritten function declarations count as constants.
Scope.prototype.isConstant = function (name) {
    var item = this.findItem(name) || fail();
    return item.writes.length === 0;
};

Scope.prototype.findLocalItem = function (name) {
    return this.items[name] || null;
};

Scope.prototype.getContext = function () {
    var scope = this;
    while (scope.parent) {
        scope = scope.parent;
    }

    return scope;
};

Scope.prototype.emitError = function () {
    var context = this.getContext();
    context.emitError.apply(context, arguments);
};

Scope.prototype.hoistVars = function () {
    this.hoisting = this;
};

Scope.prototype.addItem = function (item) {
    var name = item.name || fail();
    this.items[name] && this.emitError(item.node, 'Multiple declarations for `%s`.', name);
    this.items[name] = item;
};

Scope.prototype.debug = function (indent) {
    if (!indent) {
        indent = '';
    }

    var out = indent + this.node.type + '\n';
    indent += '  ';
    for (var key in this.items) {
        out += this.items[key].debug(indent);
    }
    for (var i = 0; i < this.children.length; i++) {
        out += this.children[i].debug(indent);
    }

    return out;
};


// Scope items.

function ScopeItem(node, scope, name, isHoisted, isConstant) {
    if (isHoisted) {
        scope = scope.hoisting;
    }

    this.gen = nextGen++;
    this.node = node || fail();
    this.scope = scope || fail();
    this.name = name || fail();

    this.init = null;
    this.writes = [];

    this.isHoisted = !!isHoisted;
    this.isConstant = !!isConstant;
    scope.addItem(this);

    this.type = null;
}

ScopeItem.prototype.setInit = function (node) {
    this.init && fail();
    this.init = node;
};

ScopeItem.prototype.addWrite = function (node) {
    if (this.isConstant) {
        this.scope.emitError(node, 'Assigning to constant `%s', this.name);
    }
    else {
        this.writes.push(node);
    }
};

ScopeItem.prototype.debug = function (indent) {
    return indent + this.name + '\n';
};


// AST node types that work with scope items.

var HAS_VAR_SCOPE = {
    Program: true,
    FunctionDeclaration: true,
    FunctionExpression: true,
    ArrowFunctionExpression: true,
};

var HAS_SCOPE = {
    BlockStatement: true,
    TryStatement: true,
    CatchClause: true,
};

var SCOPE_EFFECTS = {

    VariableDeclarator: function (node, parent, scope) {
        parent.type === 'VariableDeclaration' || fail();

        var kind = parent.kind,
            item = new ScopeItem(
                node, scope, node.id.name,
                kind === 'var', kind === 'const'
            );

        if (node.init) {
            item.setInit(node.init);
        }
    },

    AssignmentExpression: function (node, parent, scope) {
        if (node.left.type !== 'Identifier') {
            return;
        }

        var varName = node.left.name,
            item = scope.findItem(varName);

        if (!item) {
            scope.emitError(node, 'Assigning to variable before init: `%s`.', varName);
        }
        if (item.isConstant) {
            scope.emitError(node, 'Assigning to a constant: `%s`.', varName);
        }
    },


    // Functions, `this` and args.

    ArrowFunctionExpression: function (node, parent, scope) {
        node.$func = true;

        // Setup parameter vars.
        node.params.forEach(function (param) {
            param.type === 'Identifier' || fail();

            new ScopeItem(
                param, scope, param.name,
                true, false
            );
        });

        // Setup arguments object.
        new ScopeItem(
            node, scope, 'arguments',
            true, false
        );
    },

    FunctionExpression: function (node, parent, scope) {
        this.ArrowFunctionExpression(node, parent, scope);

        // Function has a fresh `this`.
        new ScopeItem(
            node, scope, 'this',
            true, true
        );
    },

    FunctionDeclaration: function (node, parent, scope) {
        this.FunctionExpression(node, parent, scope);

        // Declare the function var.
        var item = new ScopeItem(
            node, scope.parent, node.id.name,
            true, false
        );

        item.setInit(item);
    },

};


// The context object we're passing could contain
// everything from the stdlib and globals and require() and whatnot,
// along with solver context such as filename and stderr.

module.exports = function getScopes(node, context) {
    context.emitError || fail();

    traverse(node, function (node, parent) {
        visitNode(
            node, parent,
            parent ? parent.$scope : context
        );
    });

    return node.$scope || fail();
};

function visitNode(node, parent, scope) {
    var type = node.type;

    // Setup scopes.
    if (HAS_VAR_SCOPE[type]) {
        scope = new Scope(node, scope);
        scope.hoistVars();
    }
    else if (HAS_SCOPE[type]) {
        scope = new Scope(node, scope);
    }

    // Cache scopes directly on ast nodes.
    node.$scope = scope;

    // Work scope items.
    if (SCOPE_EFFECTS[type]) {
        SCOPE_EFFECTS[type](node, parent, scope);
    }
}

