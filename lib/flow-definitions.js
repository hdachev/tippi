var esprima = require('esprima-fb'),
    prettyPrint = require('./pretty-print'),
    path = require('path'),
    fs = require('fs'),

    fail = require('./fail'),
    type = require('./type');


//

function readDefinition(node, scope) {
    node.type || fail();
    node.type in READ_DEFINITIONS || fail(node);
    READ_DEFINITIONS[node.type](node, scope);
}

var READ_DEFINITIONS = {

    Program: function (node, scope) {
        var body = node.body;
        Array.isArray(body) || fail();
        for (var i = 0, n = body.length; i < n; i++) {
            readDefinition(body[i], scope);
        }
    },

    DeclareVariable: function (node, scope) {
        var name = node.id.name,
            type = readType(node.id.typeAnnotation, scope);

        scope.setItem(name, type);
    },

    DeclareFunction: function (node, scope) {
        var name = node.id.name,
            type = readType(node.id.typeAnnotation, scope);

        scope.setItem(name, type);
    },

    DeclareClass: function (node, scope) {
        // TODO
    },

    InterfaceDeclaration: function (node, scope) {
        // TODO
    },

};


// Type annotations.

function readType(node, scope) {
    node.type in TYPE_ANNOTATIONS || fail(node);
    return TYPE_ANNOTATIONS[node.type](node, scope) || fail(node);
}

var TYPE_ANNOTATIONS = {


    // Objects.

    ObjectTypeAnnotation: function (node, scope) {
        var properties = node.properties,
            keys = [],
            values = [];

        for (var i = 0, n = properties.length; i < n; i++) {
            var property = properties[i];
            property.type === 'ObjectTypeProperty' || fail(property);

            property.key.type === 'Identifier' || fail();
            keys[i] = property.key.name;
            values[i] = readType(property.value);
        }

        return type.createObject(keys, values);
    },


    // Functions.

    FunctionTypeAnnotation: function (node, scope) {
        return type.createFunction(
            function (fromNode, thisObj, args, stack) {
                // ...
            }
        );
    },


    // Any.

    AnyTypeAnnotation: function (node, scope) {
        return type.createUnknown();
    },


    // Literals.

    TypeAnnotation: function (node, scope) {
        return readType(node.typeAnnotation || fail());
    },

    StringTypeAnnotation: function (node, scope) {
        return type.string;
    },

    NumberTypeAnnotation: function (node, scope) {
        return type.number;
    },

    BooleanTypeAnnotation: function (node, scope) {
        return type.boolean;
    },

};


// Let's start with JS globals.

var CORE = path.join(__dirname, '../vendor/core.js');

var src = fs.readFileSync(CORE, 'utf8'),
    ast = esprima.parse(src, { loc: true }),

    globals = {
        // TODO figure this out
        setItem: function (key, type) {
            this[key] = type;
        }
    },

    constants = GLOBAL;

readDefinition(ast, globals, constants);


//

module.exports = function (options, callback) {
    callback(null, globals);
};

