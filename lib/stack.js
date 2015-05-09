'use strict';

var fail = require('./fail'),
    createError = require('./error');


// Call stack & scope chain infra.

function StackFrame(node, parentFrame, parentChain, caller) {
    node.$scope && node.loc || fail();
    parentFrame && parentFrame.emitError || fail();

    // Parent stack frame and scope chain.
    this.parentFrame = parentFrame;
    this.parentChain = parentChain || null;

    // AST node of origin, scope gen, values in scope.
    this.node = node || fail();
    this.scope = this.node.$scope;
    this.values = {};

    // Call expression and return trap.
    this.returned = caller ? [] : null;
    this.caller = caller || null;
    this.recursion = false;

    // Scope gens are strictly increasing.
    if (this.parentChain) {
        this.parentChain.scope.gen < this.scope.gen || fail();
    }
}


// Error reporting and stack traces.

StackFrame.prototype.emitError = function () {
    this._bubbleError(createError(
        Array.prototype.slice.call(arguments)
    ));
};

StackFrame.prototype._bubbleError = function (err) {
    if (this.caller) {
        err.pushCallee(this.node);
        err.pushCaller(this.caller);
    }

    if (this.parentFrame._bubbleError) {
        this.parentFrame._bubbleError(err);
    }
    else {
        this.parentFrame.emitError(err);
    }
};


// Entering scopes and jumping scope chains for calls.

StackFrame.prototype.enterChildScope = function (node) {
    node.$scope && node.loc || fail();
    if (node.$scope === this.scope) {
        return this;
    }

    return new StackFrame(
        node,
        this,
        this
    );
};

StackFrame.prototype.enterCalleeScope = function (callerNode, calleeNode, origin) {
    origin instanceof StackFrame || fail();
    calleeNode.$scope && calleeNode.loc || fail();

    // Scope gens are strictly increasing.
    origin.scope.gen < calleeNode.$scope.gen
        || fail('origin:', origin.scope.gen, 'callee:', calleeNode.$scope.gen);

    return new StackFrame(
        calleeNode,
        this,
        origin,
        callerNode
    );
};

StackFrame.prototype.detectRecursion = function (calleeNode) {
    var frame = this,
        closure = null;

    while (frame) {
        if (frame.caller) {
            if (!closure) {
                closure = frame;
            }
            if (frame.node === calleeNode) {
                closure.recursion = true;
                return true;
            }
        }

        frame = frame.parentFrame;
    }

    return false;
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

function findScopeValues(chain, item) {
    while (chain.scope !== item.scope && !chain.values[item.gen]) {
        chain = chain.parentChain;
    }

    return chain.values;
}

StackFrame.prototype.scopeRead = function (fromNode, itemName) {
    var item = findScopeItem(this, fromNode, itemName);
    if (item) {
        return findScopeValues(this, item)[item.gen];
    }
};

StackFrame.prototype.scopeWrite = function (fromNode, itemName, value) {
    var item = findScopeItem(this, fromNode, itemName);
    if (item) {
        findScopeValues(this, item)[item.gen] = value;
    }
};

StackFrame.prototype.scopeGuard = function (fromNode, itemName, value) {
    var item = findScopeItem(this, fromNode, itemName);
    if (item) {
        this.values[item.gen] = value;
    }
};

StackFrame.prototype.localExists = function (itemName) {
    return !!this.scope.findLocalItem(itemName);
};

StackFrame.prototype.initLocal = function (itemName, value) {
    var item = this.scope.findLocalItem(itemName);
    item || fail();
    findScopeValues(this, item)[item.gen] = value;
};


// Returning.

StackFrame.prototype.returnValue = function (fromNode, value) {
    value || fail();

    if (this.returned) {
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
};

StackFrame.prototype.getReturned = function () {
    return this.returned;
};


//

module.exports = function createStack(node, context) {
    return new StackFrame(node, context);
};

