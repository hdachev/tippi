'use strict';

var fail = require('./fail');
var traverse = require('./traverse');


// Scope.

function Scope(node, parent) {
    this.node = node || fail();
    this.items = {};
    this.parent = parent || fail();
    this.hoisting = parent.hoisting || this;
    this.children = [];

    if (parent.children) {
        parent.children.push(this);
    }
}

Scope.prototype.findItem = function (id) {
    var scope = this;
    while (scope) {
        var item = scope.items && scope.items[id];
        if (item) {
            return item;
        }

        scope = scope.parent;
    }

    return null;
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
    var id = item.id || fail();
    this.items[id] && this.emitError(item.node, 'Multiple declarations for `%s`.', id);
    this.items[id] = item;
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

function ScopeItem(node, scope, id, isHoisted, isConstant) {
    if (isHoisted) {
        scope = scope.hoisting;
    }

    this.node = node || fail();
    this.scope = scope || fail();
    this.id = id || fail();

    this.writes = [];
    this.reads = [];

    this.isHoisted = !!isHoisted;
    this.isConstant = !!isConstant;
    scope.addItem(this);

    this.type = null;
}

ScopeItem.prototype.addWrite = function (node) {
    if (this.isConstant && this.assigns.length) {
        this.scope.emitError('Assigning to constant `%s', this.id);
    }
    else {
        this.writes.push(node);
    }
};

ScopeItem.prototype.addRead = function (node) {
    if (node !== this.node.id) {
        this.reads.push(node);
    }
};

ScopeItem.prototype.debug = function (indent) {
    return indent + this.id + '\n';
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

        var kind = parent.kind;
        var item = new ScopeItem(
            node, scope, node.id.name,
            kind === 'var', kind === 'const'
        );

        if (node.init) {
            item.addWrite(node.init);
        }
    },

    Identifier: function (node, parent, scope) {

        // something.XXX
        if (parent.type === 'MemberExpression' && parent.property === node) {
            return;
        }

        //
        var item = scope.findItem(node.name);
        if (item) {
            item.addRead(node);
        }
        else {
            scope.emitError(node, 'No such item in scope: `%s`.', node.name);
        }
    },


    // Functions, `this` and args.

    ArrowFunctionExpression: function (node, parent, scope) {

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
        new ScopeItem(
            node, scope.parent, node.id.name,
            true, false
        );
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

