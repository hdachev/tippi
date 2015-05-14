var stringifiers = {

    BinaryExpression: function (node) {
        return node.left + ' ' + node.operator + ' ' + node.right;
    },

    UnaryExpression: function (node) {
        return node.left + node.operator; //fail left argument
    },
};

function stringify(node) {
    return stringifiers[node.type](node);
}

function pick() {
    if (unknown) { //fail unknown
        return {
            type: 'BinaryExpression',
            operator: '+',
            left: 10,
            right: 10,
        };
    }
    else {
        return {
            type: 'UnaryExpression',
            operator: '+',
            argument: 10,
        };
    }
}

stringify(pick());
