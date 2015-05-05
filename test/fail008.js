function tuple() {
    return { a: 1, b: 2 };
}

var obj0 = tuple(),
    obj1 = tuple();

obj0.c = 3;
obj0.a + obj0.c;
obj1.a + obj1.c; //fail 'c' a b
