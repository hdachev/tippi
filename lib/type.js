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
    this.extensible = false;    // whether its ok to add new properties
    this.interface = false;     // whether we're expecting unknown properties
    this.properties = false;    // properties on this type
    this.elements = false;      // indexed elements type
    this.$prototype = false;    // prototype type/value tbd how this really works

    this.indexer = false;       // indexer type.
}

Type.prototype.toString = function () {
    return '(Type ' + (this.typeof || 'any') + ')';
};

Type.prototype.clear = function () {
    for (var key in this) {
        if (this.hasOwnProperty(key)) {
            this[key] = null;
        }
    }
};

Type.prototype.clone = function () {
    var newType = new Type();

    for (var key in this) {
        if (!this.hasOwnProperty(key)) {
            continue;
        }

        // Ignore caches & transitions.
        var prefix = key[0];
        if (prefix === '_') {
            continue;
        }

        // If name starts with $ its a reference.
        if (prefix === '$') {
            newType[key] = val;
            continue;
        }

        // One-level-deep clone for hashmaps and whatnot.
        var val = this[key];
        if (val && typeof val === 'object') {
            var newVal;
            if (Array.isArray(val)) {
                newVal = val.slice();
            }
            else {
                newVal = {};
                for (var item in val) {
                    newVal[item] = val[item];
                }
            }

            newType[key] = newVal;
            continue;
        }

        // Immutables dont need the ref prefix.
        newType[key] = val;
    }

    return newType;
};


// Unknown / any.

var TypeUnknown = new Type();
TypeUnknown.clear();
exports.unknown = TypeUnknown;


// Primitive types.

var TypeNumber = new Type();
TypeNumber.typeof = 'number';
TypeNumber.addable = true;
TypeNumber.interface = true;
TypeNumber.$prototype = Number.prototype;

var TypeString = new Type();
TypeString.typeof = 'string';
TypeString.addable = true;
TypeString.indexer = TypeNumber;
TypeString.elements = TypeString;
TypeString.$prototype = String.prototype;

var TypeBoolean = new Type();
TypeBoolean.typeof = 'boolean';
TypeBoolean.$prototype = Boolean.prototype;

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
TypeArray.$prototype = Array.prototype;

exports.array = TypeArray;


// Base object type.

var TypeObject = new Type();
TypeObject.typeof = 'object';
TypeObject.mutable = true;
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
TypeFunction.$prototype = Function.prototype;

exports.fromFunction = function (fun) {
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

Type.prototype.getMember = function (key) {
    if (this.properties && this.properties[key]) {
        return this.properties[key];
    }

    // This cant work now coz protos are broken.
    // Still trying to figure it all out, but it looks like what we have here is overly simplistic.
    // else if (this.$prototype) {
    //     return this.$prototype.getMember(key);
    // }

    if (this.indexer && !this.indexer.isNotAssignable(key)) {
        return this.elements;
    }
};

Type.prototype.doesNotHaveMember = function (key) {
    if (!this.properties || !this.properties[key]) {
        return this.interface === false;
    }
    if (this.indexer && !this.indexer.isNotAssignable(key)) {
        return false;
    }
};


// Assignability.
// TODO invert so that truthy means error, so we can easily
// return error messages for why types not assignable.

Type.prototype._isAssignable = function (value) {
    if (this === value) {
        return true;
    }

    if (!(value instanceof Type)) {
        value = fromValue(value);
    }

    return this._isTypeAssignable(value);
};

Type.prototype._isTypeAssignable = function (value) {
    if (this.typeof && value.typeof && this.typeof !== value.typeof) {
        return false;
    }

    if (this.mutable === true && value.mutable === false) {
        return false;
    }
    if (this.addable === true && value.addable === false) {
        return false;
    }

    if (this.elements && this.elements !== false) {
        if (value.elements === false) {
            return false;
        }
        if (value.elements && this.elements.isNotAssignable(value.elements)) {
            return false;
        }
    }

    if (this.properties && this.properties !== false) {
        if (value.properties === false) {
            return false;
        }
        for (var key in this.properties) {
            if (this.properties[key].isNotAssignable(value.properties[key])) {
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


// Transitions.
// Just exploring this for now, not sure if this can work.

Type.prototype.toNumber = function () {
    if (this.typeof === 'number') {
        return this;
    }
    if (this.typeof) {
        return null;
    }

    this.mutable === true && fail();

    return TypeNumber;
};

Type.prototype.toAddable = function () {
    if (this.addable === true) {
        return this;
    }
    if (this._toAddable) {
        return this._toAddable;
    }

    if (this.typeof) {
        this.typeof === 'string' && fail();
        this.typeof === 'number' && fail();
        return null;
    }

    this.mutable === true && fail();

    var newType = this._toAddable = this.clone();
    newType.addable = true;
    newType.mutable = false;
    newType.extensible = false;
    return newType;
};

Type.prototype.toHasProperty = function (name, type) {
    !type || type instanceof Type || fail();
    name && typeof name === 'string' || fail();
    if (this.properties === false) {
        return null;
    }

    var existing = this.properties && this.properties[name];
    if (existing) {
        if (type === existing) {
            return this;
        }
        if (type && existing.isNotAssignable(type)) {
            return null;
        }
    }

    if (!this.extensible) {
        return null;
    }

    // Specialize addable types, kinda naive but might be useful.
    if (this.addable) {
        if (name in Number.prototype && !(name in String.prototype)) {
            return TypeNumber;
        }
        if (name in String.prototype && !(name in Number.prototype)) {
            return TypeString;
        }
    }

    //
    var newType = this.clone();
    if (!newType.properties) {
        newType.properties = {};
    }

    newType.properties[name] = type;
    return newType;
};

Type.prototype.toFrozen = function () {
    if (this.mutable === false) {
        this.extensible && fail();
        return this;
    }
    if (this._toFrozen) {
        return this._toFrozen;
    }

    var newType = this._toFrozen = this.clone();
    newType.extensible = false;
    newType.mutable = false;
    return newType;
};

Type.prototype.toSealed = function () {
    if (this.extensible === false) {
        return this;
    }
    if (this._toSealed) {
        return this._toSealed;
    }

    var newType = this._toSealed = this.clone();
    newType.extensible = false;
    return newType;
};

