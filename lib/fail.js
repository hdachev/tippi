'use strict';

function fail() {
    console.error.apply(console, arguments);
    console.trace();
    process.exit();
}

fail.topic = function (topic) {
    return fail.bind(null, topic);
};

module.exports = fail;
