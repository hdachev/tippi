'use strict';

var fail = require('./fail');


// Type classes.
// This is a total draft, if this turns out to work we should go for
// a much more correct and careful implementation of the js type system.
// I'm just aiming at a 80% solution right now.

var YES = 1,
    NO = -1;

function Type() {
    this.typeof = null;     // typeof
    this.elements = NO;     // indexed item types
    this.functype = NO;     // (this, args) -> retval function

    this.addable = NO;      // strings and numbers support addition
    this.mutable = NO;      // primitives and frozen types not mutable
    this.extensible = NO;   // whether its ok to add new properties
    this.properties = NO;   // object properties

    this.indexed = NO;      // arrays, typed arrays, etc
    this.keyed = NO;        // sets, weakmaps, etc
}

Type.prototype.clear = function () {
    for (var key in this) {
        this[key] = null;
    }
};

var TypeUnknown = new Type();
TypeUnknown.clear();
exports.unknown = TypeUnknown;

exports.getType = function (id) {
    var type = exports[id];
    type instanceof Type || fail('No such type: ' + id);
    return type;
};


// Primitive types.

var TypeString = new Type();
TypeString.typeof = 'string';
TypeString.addable = YES;
TypeString.indexed = YES;
TypeString.elements = TypeString;
TypeString.properties = String.prototype;

var TypeNumber = new Type();
TypeNumber.typeof = 'number';
TypeNumber.addable = YES;
TypeNumber.properties = Number.prototype;

var TypeBoolean = new Type();
TypeBoolean.typeof = 'boolean';
TypeBoolean.properties = Boolean.prototype;

var TypeNull = new Type();
TypeNull.typeof = 'object';

var TypeUndefined = new Type();
TypeUndefined.typeof = 'undefined';

function getValueType(value) {
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

exports.string = TypeString;
exports.number = TypeNumber;
exports.boolean = TypeBoolean;
exports.null = TypeNull;
exports.undefined = TypeUndefined;

exports.getValueType = getValueType;


// Base array type.

var TypeArray = new Type();
TypeArray.typeof = 'object';
TypeArray.mutable = YES;
TypeArray.indexed = YES;
TypeArray.elements = null;
TypeArray.properties = Array.prototype;

exports.array = TypeArray;


// Base object type.

var TypeObject = new Type();
TypeObject.typeof = 'object';
TypeObject.mutable = YES;
TypeObject.indexed = null;
TypeObject.elements = null;
TypeObject.properties = null;

exports.object = TypeObject;


// Base function.

var TypeFunction = new Type();
TypeFunction.typeof = 'function';
TypeFunction.mutable = YES;
TypeFunction.properties = Function.prototype;


// Assignability.

Type.prototype.isAssignable = function (value) {
    if (!(value instanceof Type)) {
        value = getValueType(value);
    }

    return this.isTypeAssignable(value);
};

Type.isTypeAssignable = function (value) {
    if (this.typeof && value.typeof && this.typeof !== value.typeof) {
        return false;
    }

    if (this.mutable === YES && value.mutable === NO) {
        return false;
    }
    if (this.addable === YES && value.addable === NO) {
        return false;
    }

    if (this.elements && this.elements !== NO) {
        if (value.elements === NO) {
            return false;
        }
        if (value.elements && !this.elements.isAssignable(value.elements)) {
            return false;
        }
    }

    if (this.properties && this.properties !== NO) {
        if (value.properties === NO) {
            return false;
        }
        for (var key in this.properties) {
            if (!this.properties[key].isAssignable(value.properties[key])) {
                return false;
            }
        }
    }

    return true;
};


// Transitions.
// Just exploring this for now, not sure if this can work.

Type.prototype.clone = function () {
    var newType = new Type();

    for (var key in this) {

        // Ignore transitions.
        if (key[0] === '_') {
            continue;
        }

        // One-level-deep clone for hashmaps and whatnot.
        var val = this[key];
        if (val && typeof val === 'object') {
            var newVal = newType[key] = {};
            for (var item in val) {
                newVal[item] = val[item];
            }
        }

        // Reference the rest.
        else {
            newType[key] = val;
        }
    }

    return newType;
};

Type.prototype.toNumber = function () {
    if (this.typeof === 'number') {
        return this;
    }
    if (this.typeof) {
        return null;
    }

    this.mutable === YES && fail();

    return TypeNumber;
};

Type.prototype.toAddable = function () {
    if (this.addable === YES) {
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

    this.mutable === YES && fail();

    var newType = this._toAddable = this.clone();
    newType.addable = YES;
    newType.mutable = NO;
    newType.extensible = NO;
    return newType;
};

Type.prototype.toHasProperty = function (name, type) {
    !type || type instanceof Type || fail();
    name && typeof name === 'string' || fail();
    if (this.properties === NO) {
        return null;
    }

    var existing = this.properties && this.properties[name];
    if (existing) {
        if (type === existing) {
            return this;
        }
        if (type && !existing.isAssignable(type)) {
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
    if (this.mutable === NO) {
        this.extensible && fail();
        return this;
    }
    if (this._toFrozen) {
        return this._toFrozen;
    }

    var newType = this._toFrozen = this.clone();
    newType.extensible = NO;
    newType.mutable = NO;
    return newType;
};

Type.prototype.toSealed = function () {
    if (this.extensible === NO) {
        return this;
    }
    if (this._toSealed) {
        return this._toSealed;
    }

    var newType = this._toSealed = this.clone();
    newType.extensible = NO;
    return newType;
};

module.exports = Type;

