var fs = require('fs'),
    path = require('path');

var DIR = 'test';


// List tests.

function fail() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('FAIL');
    console.error.apply(console, args);
    process.exit();
}

function ast(code) {
    return require('esprima')
        .parse(code, { loc: true });
}

fs.readdir('./test', function (err, files) {
    err && fail(err);

    files.forEach(function (file) {
        var match = /^(?:(fail)|pass)\d+\.js$/.test(file);
        if (match) {
            var shouldFail = !!match[1];
            console.log('Checking', file, '(' + shouldFail + ') ...');

            var code = fs.readFileSync(path.join(__dirname, DIR, file));
            // console.log(ast(code));
            console.log(JSON.stringify(ast(code), null, 2));
        }
    });
});

