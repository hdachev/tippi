'use strict';

var fail = require('./fail');


// Call stack & scope chain infra.

function StackFrame(node, parentFrame, parentChain, returnTrap, throwTrap) {
    node.$scope && node.loc || fail();
    parentFrame && parentFrame.emitError || fail();

    // Parent stack frame and scope chain.
    this.parentFrame = parentFrame;
    this.parentChain = parentChain || null;

    // AST node of origin, scope gen, values in scope.
    this.node = node || fail();
    this.scope = this.node.$scope;
    this.values = {};

    // Return & throw traps.
    this.returned = returnTrap ? [] : null;
    this.thrown = throwTrap ? [] : null;

    // Scope gens should be strictly increasing.
    if (this.parentChain) {
        this.parentChain.scope.gen < this.scope.gen || fail();
    }
}


// Error reporting.

StackFrame.prototype.emitError = function () {
    // TODO stack trace
    this.parentFrame.emitError.apply(this.parentFrame, arguments);
};


// Entering scopes and jumping scope chains for calls.

StackFrame.prototype.enterChildScope = function (node) {
    node.$scope && node.loc || fail();
    if (node.$scope === this.scope) {
        return this;
    }

    return new StackFrame(
        node,
        this.parentFrame, // dont grow stack for blocks
        this
    );
};

StackFrame.prototype.enterCalleeScope = function (node, origin) {
    origin instanceof StackFrame || fail();
    node.$scope && node.loc || fail();

    origin.scope.gen < node.$scope.gen
        || fail('origin:', origin.scope.gen, 'callee:', node.$scope.gen);

    return new StackFrame(
        node,
        this,
        origin,
        true
    );
};

StackFrame.prototype.getParentScope = function () {
    return this.parentChain;
};


// Scope I/O.

function findScopeItem(chain, fromNode, itemName) {
    fromNode.$scope && fromNode.loc || fail();
    typeof itemName === 'string' || fail('Invalid itemName:', itemName);

    return fromNode.$scope.findItem(itemName)
        || chain.emitError(fromNode, 'No such item in scope: `%s`.', itemName)
        && null;
}

function findScopeValues(chain, scope) {
    while (chain.scope !== scope) {
        chain = chain.parentChain || fail();
    }

    return chain.values;
}

StackFrame.prototype.scopeRead = function (fromNode, itemName) {
    var item = findScopeItem(this, fromNode, itemName);
    if (item) {
        return findScopeValues(this, item.scope)[item.gen];
    }
};

StackFrame.prototype.scopeWrite = function (fromNode, itemName, value) {
    var item = findScopeItem(this, fromNode, itemName);
    if (item) {
        findScopeValues(this, item.scope)[item.gen] = value;
    }
};

StackFrame.prototype.localExists = function (itemName) {
    return !!this.scope.findLocalItem(itemName);
};

StackFrame.prototype.initLocal = function (itemName, value) {
    var item = this.scope.findLocalItem(itemName);
    item || fail();
    findScopeValues(this, item.scope)[item.gen] = value;
};


// Return values and throws.

StackFrame.prototype.returnValue = function (fromNode, value) {
    if (this.returned) {
        value || fail();
        this.returned.push(value);
    }
    else if (this.parentChain) {
        this.parentChain.returnValue(fromNode, value);
    }
    else {
        this.emitError(fromNode, 'Unexpected `return`.');
    }
};

StackFrame.prototype.returnVoid = function () {
    // TODO this is mostly interesting with conditionals
    // when combined with type guard checks like typeof and whatnot.
};

StackFrame.prototype.throwValue = function () {
    // TODO throw statements can work with type guards as well,
    // like `typeof smth === 'string || fail()' is a compile time assert.
};

StackFrame.prototype.getReturned = function () {
    return this.returned;
};


//

module.exports = function createStack(node, context) {
    return new StackFrame(node, context);
};

