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
    if (value && this.const !== null && !value.isConstant()) {
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


// Queries.

Type.prototype.isNot = function (basetype) {
    return this.typeof && this.typeof !== basetype;
};

Type.prototype.getFunction = function () {
    return this.function;
};

Type.prototype.doesNotHaveMember = function (key) {
    if (key.isConstant()) {
        if (!this.getProperty(key.getConstant())) {
            return this.interface === false;
        }
    }

    return this.indexer
        && this.indexer.isNotAssignable(key);
};

Type.prototype.getMember = function (key) {
    if (key instanceof TypeUnion) {
        return TypeUnion.getMember(this, key);
    }

    if (key.isConstant()) {
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

    if (key.isConstant()) {
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

Type.prototype.toVariable = function () {
    if (this.const === null) {
        return this;
    }
    if (this.typeof && this.typeof !== 'object') {
        return fromValue(this.const);
    }

    var clone = this.clone();
    clone.const = null;
    return clone;
};


// Assignability.
// TODO this needs recursion control.

Type.prototype.isNotAssignable = function (other) {
    if (other instanceof TypeUnion) {
        return TypeUnion.isNotAssignable(this, other);
    }

    var error;
    this instanceof Type || fail();
    other instanceof Type || fail();

    if (this === other) {
        return null;
    }
    if (this.typeof && other.typeof && this.typeof !== other.typeof) {
        return 'Incompatible basetype.';
    }
    if (this.mutable === true && other.mutable === false) {
        return 'Not mutable.';
    }
    if (this.function && other.function && this.function !== other.function) {
        return 'TODO cant currently reason about function assignability.';
    }

    if (this.indexer) {
        if (other.indexer === false) {
            return 'Not indexable.';
        }
        if (other.indexer && this.indexer !== other.indexer) {
            error = this.indexer.isNotAssignable(other.elements);
            if (error) {
                return 'Indexer not assignable:\n\t' + error;
            }
        }
    }

    if (this.elements) {
        if (other.elements === false) {
            return 'Not indexable.';
        }
        if (other.elements && this.elements !== other.elements) {
            error = this.elements.isNotAssignable(other.elements);
            if (error) {
                return 'Elements not assignable:\n\t' + error;
            }
        }
    }

    // TODO figure out how to deal with prototypes.
    // Perhaps just have the properties dict prototyped to parent?
    if (this.properties && this.properties !== false) {
        if (other.properties && this.properties !== other.properties) {
            for (var key in this.properties) {
                var thisProp = this.properties[key],
                    otherProp = other.properties[key];

                if (thisProp === otherProp) {
                    continue;
                }
                if (!otherProp) {
                    return '.' + key + ' missing.';
                }

                error = thisProp.isNotAssignable(otherProp);
                if (error) {
                    return '.' + key + ' not assignable:\n\t' + error;
                }
            }
        }
    }

    return null;
};

Type.prototype.isNotEqual = function (other) {
    if (other instanceof TypeUnion) {
        return TypeUnion.isNotEqual(this, other);
    }

    if (this.const !== null) {
        if (other.const === null) {
            return 'Not a constant.';
        }
        if (this.const !== other.const) {
            return 'Constant not strict equal.';
        }
    }

    return this.isNotAssignable(other);
};


// Type unions.

Type.prototype.isUnion = function () {
    return false;
};

Type.prototype.mapVariants = function (mapper) {
    return mapper(this);
};

Type.prototype.union = function (other) {
    if (other instanceof TypeUnion) {
        return other.union(this);
    }

    // Noop when types are mutually assignable.
    if (!this.isNotEqual(other)) {
        return this;
    }
    if (!other.isNotEqual(this)) {
        return other;
    }

    return new TypeUnion([this, other]);
};

function TypeUnion(types) {
    this.types = types;
}

TypeUnion.prototype.isUnion = function () {
    return true;
};

TypeUnion.prototype.mapVariants = function (mapper) {
    return this.types.map(mapper);
};

Type.prototype.union_push = function (other) {
    return this.union(other);
};

exports.union = function createTypeUnion(types) {
    Array.isArray(types) && types.length || fail();

    var type = null;
    for (var i = 0, n = types.length; i < n; i++) {
        if (type) {
            type = type.union_push(types[i]);
        }
        else {
            type = types[i] || fail();
        }
    }

    return type;
};

TypeUnion.prototype.clone = function () {
    var types = this.types,
        out = [];

    for (var i = 0, n = types.length; i < n; i++) {
        out[i] = types[i].clone();
    }

    return out;
};

TypeUnion.prototype.union = function (other) {
    return this.clone().union_push(other);
};

TypeUnion.prototype.union_push = function (type) {
    if (type instanceof TypeUnion) {
        for (var i = 0, n = type.types.length; i < n; i++) {
            this.union_push(type.types[i]);
        }

        return;
    }

    type instanceof Type || fail();
    this.types.push(type);
    return this;
};


// TypeUnion implements Type.
// All the stuff below is weak-mode minded,
// tbd how we can switch between strong and weak modes.

TypeUnion.prototype.getProperty = function (key) {
    var types = this.types,
        out = null;

    for (var i = 0, n = types.length; i < n; i++) {
        var prop = types[i].getProperty(key);
        if (prop) {
            if (out) {
                out = out.union_push(prop);
            }
            else {
                out = prop;
            }
        }
    }

    return out;
};

TypeUnion.prototype.setProperty = function (key, value) {
    var types = this.types;
    for (var i = 0, n = types.length; i < n; i++) {
        var type = types[i];
        if (type.mutable === true) {
            type.setProperty(key, value);
        }
    }
};

TypeUnion.prototype.getMember = function (key) {
    var types = this.types,
        out = null;

    for (var i = 0, n = types.length; i < n; i++) {
        var prop = types[i].getMember(key);
        if (prop) {
            if (out) {
                out = out.union_push(prop);
            }
            else {
                out = prop;
            }
        }
    }

    return out;
};

TypeUnion.prototype.trySetMember = function (key, value) {
    var types = this.types,
        ok = false;

    for (var i = 0, n = types.length; i < n; i++) {
        ok = types[i].trySetMember(key, value) || ok;
    }

    return ok;
};

TypeUnion.prototype.doesNotHaveMember = function (key) {
    var types = this.types;
    for (var i = 0, n = types.length; i < n; i++) {
        if (!types[i].doesNotHaveMember(key)) {
            return false;
        }
    }

    return true;
};

TypeUnion.prototype.isNot = function (basetype) {
    var types = this.types;
    for (var i = 0, n = types.length; i < n; i++) {
        var type = types[i];
        if (!type.typeof || type.typeof === basetype) {
            return false;
        }
    }

    return true;
};

TypeUnion.prototype.isNotMutable = function () {
    var types = this.types;
    for (var i = 0, n = types.length; i < n; i++) {
        if (types[i].mutable !== false) {
            return false;
        }
    }

    return true;
};

TypeUnion.prototype.isNotComparable = function () {
    var types = this.types;
    for (var i = 0, n = types.length; i < n; i++) {
        if (!types[i].isNotComparable()) {
            return false;
        }
    }

    return true;
};


//

TypeUnion.prototype.getFunction = function () {
    var funcs = [],
        types = this.types;

    for (var i = 0, n = types.length; i < n; i++) {
        var func = types[i].getFunction();
        if (func) {
            funcs.push(func);
        }
    }

    return function () {
        var out = null;
        for (var i = 0, n = funcs.length; i < n; i++) {
            var value = funcs[i].apply(null, arguments);
            if (value) {
                if (out) {
                    out = out.union_push(value);
                }
                else {
                    out = value;
                }
            }
        }

        return out;
    };
};

TypeUnion.prototype.isConstant = function () {
    var types = this.types;
    var value = 0;
    for (var i = 0, n = types.length; i < n; i++) {
        if (!types[i].isConstant()) {
            return false;
        }

        if (i && types[i].getConstant() !== value) {
            return false;
        }
        else {
            value = types[i].getConstant();
        }
    }

    return true;
};


//

TypeUnion.prototype.isConstructorReturnable = function () {
    fail('TODO');
};

TypeUnion.prototype.getConstant = function () {
    fail('TODO');
};

TypeUnion.prototype.toConstant = function () {
    fail('TODO');
};

TypeUnion.prototype.toVariable = function () {
    fail('TODO');
};


// These are superweak for a union other, TBD how to fix.

TypeUnion.prototype.isNotAssignable = function (other) {
    var types = this.types;
    for (var i = 0, n = types.length; i < n; i++) {
        if (!types[i].isNotAssignable(other)) {
            return false;
        }
    }

    return 'Union none match.';
};

TypeUnion.prototype.isNotEqual = function (other) {
    var types = this.types;
    for (var i = 0, n = types.length; i < n; i++) {
        if (!types[i].isNotEqual(other)) {
            return false;
        }
    }

    return 'Union none match.';
};


// Type <-> TypeUnion interop.

TypeUnion.isNotAssignable = function (type, union) {
    type instanceof Type || fail();
    union instanceof TypeUnion || fail();

    var types = union.types;
    for (var i = 0, n = types.length; i < n; i++) {
        if (!type.isNotAssignable(types[i])) {
            return false;
        }
    }

    return 'Union none match.';
};

TypeUnion.isNotEqual = function (type, union) {
    type instanceof Type || fail();
    union instanceof TypeUnion || fail();

    var types = union.types;
    for (var i = 0, n = types.length; i < n; i++) {
        if (!type.isNotEqual(types[i])) {
            return false;
        }
    }

    return 'Union none match.';
};

TypeUnion.getMember = function (type, keyUnion) {
    type instanceof Type || fail();
    keyUnion instanceof TypeUnion || fail();

    var keys = keyUnion.types,
        out = null;

    for (var i = 0, n = keys.length; i < n; i++) {
        var member = type.getMember(keys[i]);
        if (member) {
            if (out) {
                out = out.union(member);
            }
            else {
                out = member;
            }
        }
    }

    return out;
};


// Must override everything.

Object.keys(Type.prototype).forEach(function (key) {
    TypeUnion.prototype[key] || fail('TypeUnion is missing: ' + key);
});


// Everything's an override.

Object.keys(TypeUnion.prototype).forEach(function (key) {
    Type.prototype[key] || fail('TypeUnion is introducing: ' + key);
});

