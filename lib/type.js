'use strict';

var fail = require('./fail');


// Type classes.
// This is a total draft, if this turns out to work we should go for
// a much more correct and careful implementation of the js type system.
// I'm just aiming at a 80% solution right now.

function Type() {
    this.typeof = null;         // base type string
    this.function = false;      // (this, args) -> retval function
    this.addable = false;       // strings and numbers support addition
    this.mutable = false;       // primitives and frozen types not mutable
    this.interface = false;     // whether we're expecting unknown properties
    this.properties = false;    // properties on this type
    this.indexer = false;       // indexer type.
    this.elements = false;      // indexed elements type
    this.proto = false;         // prototype type/value tbd how this really works
    this.const = null;          // any folded constant
}

Type.prototype.toString = function () {
    return '(Type ' + (this.typeof || 'any') + ')';
};

Type.prototype.clone = function () {
    var newType = new Type();

    for (var key in this) {
        if (!this.hasOwnProperty(key)) {
            continue;
        }

        var val = this[key];

        // Ignore caches & transitions.
        var prefix = key[0];
        if (prefix === '_') {
            continue;
        }

        newType[key] = val;
    }

    return newType;
};


// Unknown / any.

function createUnknown() {
    var newType = new Type();
    for (var key in newType) {
        if (newType.hasOwnProperty(key) && newType[key] === false) {
            newType[key] = null;
        }
    }

    return newType;
}

var TypeUnknown = createUnknown();
exports.unknown = TypeUnknown;


// Primitive types.

var TypeNumber = new Type();
TypeNumber.typeof = 'number';
TypeNumber.addable = true;
TypeNumber.interface = true;
TypeNumber.proto = Number.prototype;

var TypeString = new Type();
TypeString.typeof = 'string';
TypeString.addable = true;
TypeString.indexer = TypeNumber;
TypeString.elements = TypeString;
TypeString.proto = String.prototype;

var TypeBoolean = new Type();
TypeBoolean.typeof = 'boolean';
TypeBoolean.proto = Boolean.prototype;

var TypeNull = new Type();
TypeNull.typeof = 'object';

var TypeUndefined = new Type();
TypeUndefined.typeof = 'undefined';

exports.string = TypeString;
exports.number = TypeNumber;
exports.boolean = TypeBoolean;
exports.null = TypeNull;
exports.undefined = TypeUndefined;

function fromValue(value) {
    switch (typeof value) {
        case 'string':
            return TypeString;
        case 'number':
            return TypeNumber;
        case 'boolean':
            return TypeBoolean;
        case 'object':
            value === null || fail();
            return TypeNull;
        case 'undefined':
            return TypeUndefined;
        default:
            fail();
    }
}

exports.fromValue = fromValue;


// Base array type.

var TypeArray = new Type();
TypeArray.typeof = 'object';
TypeArray.mutable = true;
TypeArray.indexer = TypeNumber;
TypeArray.elements = null;
TypeArray.proto = Array.prototype;

exports.array = TypeArray;


// Base object type.

var TypeObject = new Type();
TypeObject.typeof = 'object';
TypeObject.mutable = true;
TypeObject.indexer = TypeString;
TypeObject.properties = null;

exports.object = TypeObject;

exports.createObject = function (keys, values) {
    var obj = TypeObject.clone(),
        properties = obj.properties = {};

    for (var i = 0, n = keys.length; i < n; i++) {
        var key = keys[i],
            value = values[i];

        typeof key === 'string' || fail();
        value instanceof Type || fail();
        properties[key] = value;
    }

    return obj;
};


// Base function.

var TypeFunction = new Type();
TypeFunction.typeof = 'function';
TypeFunction.mutable = true;
TypeFunction.proto = Function.prototype;

exports.createFunction = function (fun) {
    typeof fun === 'function' || fail();
    var ftype = TypeFunction.clone();
    ftype.function = fun;
    return ftype;
};


// Public API.

Type.prototype.isNotAssignable = function (value) {
    return !this._isAssignable(value);
};

Type.prototype.isNotEqual = function (value) {
    value instanceof Type || fail();
    return this.isNotAssignable(value)
        || value.isNotAssignable(this);
};

Type.prototype.isNot = function (oftype) {
    return this.typeof && this.typeof !== oftype;
};

Type.prototype.isNotAddable = function () {
    return this.addable === false;
};

Type.prototype.getFunction = function () {
    return this.function;
};

Type.prototype.getMember = function (keyConst) {
    if (this.properties && this.properties[keyConst]) {
        return this.properties[keyConst];
    }

    // This cant work now coz protos are broken.
    // Still trying to figure it all out, but it looks like what we have here is overly simplistic.
    // else if (this.proto) {
    //     return this.proto.getMember(keyConst);
    // }

    if (this.indexer && !this.indexer.isNotAssignable(keyConst)) {
        return this.elements;
    }
};

Type.prototype.doesNotHaveMember = function (keyConst) {
    if (!this.properties || !this.properties[keyConst]) {
        return this.interface === false;
    }
    if (this.indexer && !this.indexer.isNotAssignable(fromValue(keyConst))) {
        return false;
    }
};

Type.prototype.getElements = function (/*keyType*/) {
    return this.elements;
};

Type.prototype.doesNotHaveIndexer = function (key) {
    return this.indexer === false
        || this.indexer && this.indexer.isNotAssignable(key);
};


// Constant folding outcomes.

Type.prototype.isConstant = function () {
    return this.const !== null || this === TypeNull;
};

Type.prototype.getConstant = function () {
    return this.const;
};

Type.prototype.toConstant = function (value) {
    this.const === null || fail();

    if (!this.typeof) {
        return fromValue(value).toConstant(value);
    }

    this.typeof === typeof value || fail();

    if (value === null) {
        return TypeNull;
    }
    if (value === undefined) {
        return TypeUndefined;
    }

    var clone = this.clone();
    clone.const = value;
    return clone;
};


// Assignability.
// TODO invert so that truthy means error, so we can easily
// return error messages for why types not assignable.

Type.prototype._isAssignable = function (other) {
    this instanceof Type || fail();
    other instanceof Type || fail(other);

    if (this === other) {
        return true;
    }

    if (this.typeof && other.typeof && this.typeof !== other.typeof) {
        return false;
    }

    if (this.mutable === true && other.mutable === false) {
        return false;
    }
    if (this.addable === true && other.addable === false) {
        return false;
    }

    if (this.elements && this.elements !== false) {
        if (other.elements === false) {
            return false;
        }
        if (other.elements && this.elements.isNotAssignable(other.elements)) {
            return false;
        }
    }

    if (this.properties && this.properties !== false) {
        if (other.properties === false) {
            return false;
        }
        for (var key in this.properties) {
            if (this.properties[key].isNotAssignable(other.properties[key])) {
                return false;
            }
        }
    }

    return true;
};


// Type unions.

Type.prototype.union = function (other) {
    other instanceof Type || fail();

    // Noop when types are mutually assignable.
    if (!this.isNotEqual(other)) {
        return this;
    }

    fail('TODO type union');
};

exports.union = function createTypeUnion(types) {
    Array.isArray(types) || fail();

    var type;
    for (var i = 0, n = types.length; i < n; i++) {
        if (type) {
            type = type.union(types[i]);
        }
        else {
            type = types[i] || fail();
        }
    }

    return type;
};

