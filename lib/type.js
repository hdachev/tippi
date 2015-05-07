'use strict';

var fail = require('./fail'),
    inspect = require('util').inspect;


// Type classes.
// This is a total draft, if this turns out to work we should go for
// a much more correct and careful implementation of the js type system.
// I'm just aiming at a 80% solution right now.

function Type() {
    this.typeof = null;         // base type string
    this.function = null;       // (this, args) -> retval function
    this.mutable = null;        // primitives and frozen types not mutable
    this.interface = null;      // whether we're expecting unknown properties
    this.properties = null;     // properties on this type
    this.indexer = null;        // indexer type.
    this.elements = null;       // indexed elements type
    this.prototype = null;      // prototype object type
    this.const = null;          // any folded constant
}

Type.prototype.clone = function () {
    var type = new Type();

    type.typeof = this.typeof;
    type.function = this.function;
    type.mutable = this.mutable;
    type.interface = this.interface;
    type.properties = this.properties;
    type.indexer = this.indexer;
    type.elements = this.elements;
    type.prototype = this.prototype;
    type.const = this.const;

    return type;
};

function createDefault() {
    var type = new Type();

    // Restrictive defaults.
    type.function = false;
    type.mutable = false;
    type.interface = false;
    type.properties = false;
    type.indexer = false;
    type.elements = false;

    return type;
}

Type.prototype.toString = function () {
    if (this.const !== null) {
        return inspect(this.const);
    }

    return '`' + (this.typeof || 'any') + '`';
};


// Unknown / any.

exports.createUnknown = function () {
    return new Type();
};


// Primitive types.

var TypeNumber = createDefault();
TypeNumber.typeof = 'number';
TypeNumber.interface = true;

var TypeString = createDefault();
TypeString.typeof = 'string';
TypeString.indexer = TypeNumber;
TypeString.elements = TypeString;

var TypeBoolean = createDefault();
TypeBoolean.typeof = 'boolean';

var TypeNull = createDefault();
TypeNull.typeof = 'object';

var TypeUndefined = createDefault();
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

function fromConstant(value) {
    value instanceof Type && fail();
    return fromValue(value)
         .toConstant(value);
}

exports.fromConstant = fromConstant;


// Base array type.

var TypeArray = createDefault();
TypeArray.typeof = 'object';
TypeArray.mutable = true;
TypeArray.indexer = TypeNumber;
TypeArray.elements = null;

exports.array = TypeArray;


// Base object type.

var TypeObject = createDefault();
TypeObject.typeof = 'object';
TypeObject.mutable = true;
TypeObject.indexer = TypeString;
TypeObject.elements = null;
TypeObject.properties = null;

exports.object = TypeObject;

exports.createObject = function (keys, values) {
    var obj = TypeObject.clone(),
        properties = obj.properties = Object.create(null),
        constant = {};

    for (var i = 0, n = keys.length; i < n; i++) {
        var key = keys[i],
            value = values[i];

        typeof key === 'string' || fail();
        value instanceof Type || fail();
        properties[key] = value;

        if (constant) {
            if (value.isConstant()) {
                constant[key] = value.getConstant();
            }
            else {
                constant = null;
            }
        }
    }

    return constant
         ? obj.toConstant(constant)
         : obj;
};

Type.prototype.getProperty = function (key) {
    typeof key === 'string' || fail();

    // Prototype object.
    if (key === '__proto__') {
        return this.prototype;
    }

    // Lookup the prop up the prototype chain.
    var value = null,
        type = this;

    while (!value && type) {
        value = type.properties && type.properties[key]
             || null;

        type = type.prototype;
    }

    // Propagate constants within object trees on access.
    if (value && this.const && !value.isConstant()) {
        if (!this.properties) {
            this.properties = Object.create(null);
        }
        return (
            this.properties[key] = value
                .toConstant(value[key])
        );
    }

    return value;
};

Type.prototype.setProperty = function (key, value) {
    this.mutable !== false || fail();
    typeof key === 'string' || fail();
    value && value instanceof Type || fail();

    // Prototype object.
    if (key === '__proto__') {
        this.prototype = value;
        return;
    }

    if (!this.properties) {
        this.properties = Object.create(null);
    }

    this.properties[key] = value;

    // Apply to constant, or forget if impossible.
    if (this.const) {
        if (value.isConstant()) {
            this.const[key] = value.getConstant();
        }
        else {
            this.const = null;
        }
    }
};


// Base function.

var TypeFunction = createDefault();
TypeFunction.typeof = 'function';
TypeFunction.mutable = true;

exports.createFunction = function (fun) {
    typeof fun === 'function' || fail();
    var ftype = TypeFunction.clone();
    ftype.function = fun;
    ftype.properties = {
        prototype: TypeObject.clone()
    };

    return ftype;
};


// Constructors and prototypes.

exports.fromConstructor = function (constructor) {
    var obj = TypeObject.clone();

    obj.setProperty(
        'constructor',
        constructor || new Type()
    );

    obj.setProperty(
        '__proto__',
        constructor.getProperty('prototype') || new Type()
    );

    return obj;
};

Type.prototype.isConstructorReturnable = function () {
    if (this === TypeUndefined || this === TypeNull) {
        return false;
    }
    if (this.typeof && this.typeof !== 'object'
                    && this.typeof !== 'function') {
        return false;
    }

    return true;
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

Type.prototype.getFunction = function () {
    return this.function;
};

Type.prototype.doesNotHaveMember = function (key) {
    if (key.typeof === 'string' && key.isConstant()) {
        if (!this.getProperty(key.getConstant())) {
            return this.interface === false;
        }
    }

    return this.indexer
        && this.indexer.isNotAssignable(key);
};

Type.prototype.getMember = function (key) {
    if (key.typeof === 'string' && key.isConstant()) {
        var prop = this.getProperty(key.getConstant());
        if (prop) {
            return prop;
        }
    }

    if (this.indexer && !this.indexer.isNotAssignable(key)) {
        return this.elements;
    }
};

Type.prototype.trySetMember = function (key, value) {
    if (!this.mutable) {
        return false;
    }

    if (key.typeof === 'string' && key.isConstant()) {
        this.setProperty(key.getConstant(), value);
        return true;
    }

    if (this.indexer && !this.indexer.isNotAssignable(key)) {
        return false;
    }

    return true;
};

Type.prototype.isNotMutable = function () {
    return this.mutable === false;
};

Type.prototype.isNotComparable = function () {
    return this.typeof
        && this.typeof !== 'string'
        && this.typeof !== 'number'
        && this.typeof !== 'boolean';
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
        return fromConstant(value);
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

