'use strict';

var fs = require('fs'),
    path = require('path'),
    esprima = require('esprima'),
    fail = require('./lib/fail'),
    check = require('./lib/check'),
    prettyPrint = require('./lib/pretty-print');

var TESTS_DIR = 'test',
    OFFENDER = null;

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
                var ast = OFFENDER = esprima.parse(
                    code,
                    { loc: true }
                );
                parseTime = Date.now() - parseTime;

                OFFENDER = ast;
                var checkTime = Date.now();
                var result = check(ast, { name: file });
                checkTime = Date.now() - checkTime;
                OFFENDER = null;

                // Print AST when failing test.
                if (result.hasErrors() !== shouldFail || code.indexOf('//ast') >= 0) {
                    console.log('\nAST: ' + prettyPrint(ast));
                }

                // Output errors.
                console.log(
                    result.errors.join('\n')
                );

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

process.on('exit', function () {
    if (OFFENDER) {
        console.log('\nAST: ' + prettyPrint(OFFENDER));
    }
});

