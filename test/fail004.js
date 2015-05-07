var woot = {}

function addWoot(arg) {
    return arg + woot //fail incompat
}

addWoot(42);
