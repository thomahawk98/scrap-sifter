var noise = function (x, y, z) {
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(t, a, b) { return a + t * (b - a); }
    function grad(hash, x, y, z) {
        var h = hash & 15;
        var u = h < 8 ? x : y,
            v = h < 4 ? y : h == 12 || h == 14 ? x : z;
        return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
    }
    function scale(n) { return (1 + n) / 2; }

    var p = new Array(512)
    var permutation = [151, 160, 137, 91, 90, 15,
        131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23,
        190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33,
        88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166,
        77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244,
        102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196,
        135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123,
        5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42,
        223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
        129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228,
        251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107,
        49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
        138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180
    ];
    for (var i = 0; i < 256; i++)
        p[256 + i] = p[i] = permutation[i];

    var X = Math.floor(x) & 255,
        Y = Math.floor(y) & 255,
        Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    var u = fade(x),
        v = fade(y),
        w = fade(z);
    var A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z,
        B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;

    return scale(lerp(w, lerp(v, lerp(u, grad(p[AA], x, y, z),
        grad(p[BA], x - 1, y, z)),
        lerp(u, grad(p[AB], x, y - 1, z),
            grad(p[BB], x - 1, y - 1, z))),
        lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1),
            grad(p[BA + 1], x - 1, y, z - 1)),
            lerp(u, grad(p[AB + 1], x, y - 1, z - 1),
                grad(p[BB + 1], x - 1, y - 1, z - 1)))));
}

const Terrain = {
    getHeightAt: function (x, z, seed) {
        //repeating hills

        /*
        const NW_slope_height = Math.min(Math.modulo(x, 16), Math.modulo(z, 16));
        const SE_slope_height = Math.min(Math.modulo(-x - 1, 16), Math.modulo(-z - 1, 16));
        return Math.min(NW_slope_height, SE_slope_height) * 0.5;
        */

        //weird slope
        //return 64 * Math.sin(x * 0.01) * Math.cos(z * 0.01);

        //giant hill
        /*
        const dist = Math.sqrt(x * x + z * z);
        return 64 - Math.min(64, dist * 0.2);
        */

        //giant crater
        //return Math.sqrt(x * x + z * z) * 0.5;

        //city buildings grid
        /*
        const gridSize = 16;
        const localX = Math.modulo(x, gridSize);
        const localZ = Math.modulo(z, gridSize);
        if (localX < 2 || localX > gridSize - 3 || localZ < 2 || localZ > gridSize - 3) {
            return 0; //street area
        } else {
            return 32; //building area
        }
            */

        //flat terrain for testing
        //return 8;



        //random terrain generation

        //how steep the terrain is
        const scaleX = 0.02;
        const scaleZ = 0.02;

        //how high the terrain can go
        const scaleY = 32;

        return noise(x * scaleX, seed, z * scaleZ) * scaleY;
    },
    getTypeAt: function (x, y, z, seed) {
        const height = this.getHeightAt(x, z, seed);
        if (y > height) return 'air';

        const distFromTop = Math.floor(height - y);
        if (distFromTop === 0) {
            if (Math.random() < 0.1) return 'dead grass';
            if (Math.random() < 0.2) return 'withered grass';
            return 'grass';
        }
        if (distFromTop <= 2) return 'dirt';
        if (distFromTop <= 10) return 'stone';
        return 'rock';
    }
}

export default Terrain;