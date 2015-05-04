'use strict';

var fs = require('fs'),
    path = require('path'),
    esprima = require('esprima'),
    fail = require('./lib/fail'),
    check = require('./lib/check'),
    prettyPrint = require('./lib/pretty-print');

var TESTS_DIR = 'test';

Error.stackTraceLimit = 100;

fs.readdir(path.join(__dirname, TESTS_DIR), function (err, files) {
    files.sort().forEach(function (file) {
        var match = /^(?:(fail)|pass)\d+\.js$/.exec(file);
        if (match) {
            var shouldFail = !!match[1];

            fs.readFile(path.join(__dirname, TESTS_DIR, file), 'utf8', function (err, code) {
                console.log('Type checking ' + file + ' ...');

                // Parse and typecheck.
                var parseTime = Date.now();
                var ast = esprima.parse(
                    code,
                    { loc: true }
                );
                parseTime = Date.now() - parseTime;

                var checkTime = Date.now();
                var result = check(ast);
                checkTime = Date.now() - checkTime;

                // Print AST when failing test.
                if (result.hasErrors() !== shouldFail || code.indexOf('//ast') >= 0) {
                    console.log('\nAST: ' + prettyPrint(ast));
                }

                // Output errors.
                console.log(result.errors.map(function (error) {
                    return file + error;
                }).join('\n'));

                if (result.hasErrors() !== shouldFail) {
                    fail(shouldFail ? 'False negative.' : 'False positive.');
                }

                console.log(
                    'Times: parse=' + parseTime + 'ms check=' + checkTime + 'ms\n'
                );
            });
        }
    });
});

