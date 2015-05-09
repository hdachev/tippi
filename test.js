'use strict';

var fs = require('fs'),
    path = require('path'),
    esprima = require('esprima'),
    fail = require('./lib/fail'),
    check = require('./lib/check'),
    prettyPrint = require('./lib/pretty-print');

var TESTS_DIR = 'test',
    PARSE_TIME = 0,
    CHECK_TIME = 0,
    OFFENDER = null;

Error.stackTraceLimit = 100;

fs.readdir(path.join(__dirname, TESTS_DIR), function (err, files) {
    files.sort().forEach(function (file) {
        var match = /^fail\d+\.js$/.exec(file);
        if (match) {

            fs.readFile(path.join(__dirname, TESTS_DIR, file), 'utf8', function (err, code) {

                // Parse and typecheck.
                var parseStart = Date.now();
                var ast = esprima.parse(
                    code,
                    { loc: true }
                );
                PARSE_TIME += Date.now() - parseStart;
                OFFENDER = ast;

                var checkStart = Date.now();
                var result = check(ast, { name: file });
                CHECK_TIME += Date.now() - checkStart;

                // Output errors.
                assertErrorsExpected(code, result);
                OFFENDER = null;
            });
        }
    });
});

function assertErrorsExpected(code, result) {
    var lines = code.split('\n'),
        traps = [];

    lines.forEach(function (line, idx) {
        var trap = /\/\/fail (.*)/.exec(line);
        if (trap) {
            traps.push(new RegExp(
                trap[1].trim().split(/\s+/).join('[^]+') + '[^]+at[^]+' + ':' + (idx + 1) + ':', 'i'
            ));
        }
    });

    result.getErrors().forEach(function (obj) {
        var error = obj.toString();

        for (var i = 0; i < traps.length; i++) {
            if (traps[i].test(error)) {
                console.log(error);
                traps.splice(i, 1);
                return;
            }
        }

        console.log('TRAPS', traps);
        fail('UNEXPECTED', error);
    });

    if (traps.length) {
        console.log('TRAPS', traps);
        fail('NONE MATCH', traps[0]);
    }
}

process.on('exit', function () {
    if (OFFENDER) {
        console.log('\nAST: ' + prettyPrint(OFFENDER));
    }

    console.log(
        'Times: parse=' + PARSE_TIME + 'ms check=' + CHECK_TIME + 'ms\n'
    );
});

