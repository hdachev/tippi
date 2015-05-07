var myObj = { a: 1, b: 2, }

function get(obj, prop) {
    return obj[prop];
}

get(myObj, 'a');
get(myObj, 'c'); //fail c not defined
