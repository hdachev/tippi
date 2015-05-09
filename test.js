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
        var match = /^fail\d+\.js$/.exec(file);
        if (match) {

            fs.readFile(path.join(__dirname, TESTS_DIR, file), 'utf8', function (err, code) {
                console.log('Type checking ' + file + ' ...');

                // Parse and typecheck.
                var parseTime = Date.now();
                var ast = OFFENDER = esprima.parse(
                    code,
                    { loc: true }
                );
                parseTime = Date.now() - parseTime;

                var checkTime = Date.now();
                var result = check(ast, { name: file });
                checkTime = Date.now() - checkTime;

                // Output errors.
                assertErrors(code, result);
                OFFENDER = null;

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


//fail asserts in testcases

function assertErrors(code, result) {
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

