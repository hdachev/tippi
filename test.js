'use strict';

var fs = require('fs'),
    path = require('path'),
    esprima = require('esprima'),
    fail = require('./lib/fail'),
    check = require('./lib/check'),
    prettyPrint = require('./lib/pretty-print');

var TESTS_DIR = 'test';

fs.readdir(path.join(__dirname, TESTS_DIR), function (err, files) {
    files.sort().forEach(function (file) {
        var match = /^(?:(fail)|pass)\d+\.js$/.exec(file);
        if (match) {
            var shouldFail = !!match[1];

            fs.readFile(path.join(__dirname, TESTS_DIR, file), function (err, code) {
                console.log('\nType checking ' + file + ' ...\n');

                var ast = esprima.parse(
                    code,
                    { loc: true }
                );

                // Print AST.
                console.log('AST: ' + prettyPrint(ast));

                var result = check(ast);

                // Output errors.
                console.log(result.errors.map(function (error) {
                    return file + error;
                }).join('\n'));

                result.hasErrors() === shouldFail
                    || fail(shouldFail ? 'False negative.' : 'False positive.');
            });
        }
    });
});

