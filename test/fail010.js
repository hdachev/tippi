function guard(arg) {
    if (typeof arg === 'string') {
        return arg * arg; //fail string
    }
}

guard(undef); //fail scope
