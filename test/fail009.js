function Point(x, y) {
    this.x = x;
    this.y = y;
}

Point.prototype.add = function (pt) {
    return new Point(
        this.x + pt.x,
        this.y + pt.y
    );
};

var a = new Point(0, 1);
var b = new Point(1, 2);
var c = a.add(b);

c.add({ y: 1, z: 1 }); //fail x defined
