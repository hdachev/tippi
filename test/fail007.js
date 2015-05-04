var myObj = { a: 1, b: 2, }

function get(obj, prop) {
    return obj[prop];
}

get(myObj, 'a'); //pass
get(myObj, 'c'); //fail
