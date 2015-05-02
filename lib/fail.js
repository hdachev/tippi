'use strict';

var prettyPrint = require('./pretty-print');

function fail() {
    console.log('\nAssertion failed.');

    var args = Array.prototype.slice.call(arguments)
        .map(function (arg) {
            if (arg && arg.type && arg.loc) {
                return prettyPrint(arg);
            }
            else {
                return arg;
            }
        });

    console.error.apply(console, args);
    console.trace();
    process.exit(1);
}

fail.topic = function (topic) {
    return fail.bind(null, topic);
};

module.exports = fail;
