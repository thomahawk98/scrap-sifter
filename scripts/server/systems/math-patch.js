// Add backward-compatible vector helpers only when the runtime does not provide them.
Math.normalize ??= function (v) {
    const len = Math.hypot(...v);
    return v.map(n => n / len);
}
// Basic vector arithmetic used by camera and collision calculations.
Math.cross ??= function (a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
Math.sub ??= function (a, b) {
    return a.map((v, i) => v - b[i]);
}
Math.dot ??= function (a, b) {
    return a.reduce((sum, v, i) => sum + v * b[i], 0);
}
// Scalar range helpers used by UI layout and camera controls.
Math.clamp ??= function (value, min, max) {
    return Math.min(Math.max(value, min), max);
}
Math.clamp01 ??= function (value) {
    return Math.clamp(value, 0, 1);
}
// Two-dimensional map and cursor helpers retained for existing callers.
Math.distTo ??= function (x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
Math.dirTo ??= function (x1, y1, x2, y2) {
    return 90 + (Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
}
Math.distToMove ??= function (distance, direction) {
    return ({ x: distance * Math.sin(direction * Math.PI / 180), y: -distance * Math.cos(direction * Math.PI / 180) })
}
// Coordinate wrapping, deterministic sampling, and interpolation helpers.
Math.modulo ??= function (a, n) {
    return ((a % n) + n) % n;
}
Math.seededRandom ??= function (a) {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
Math.easeInOut ??= function (a) {
    a = 1.02 / (1 + 2.71828 ** (-10 * (a - 0.5))) - 0.007;
    return Math.min(Math.max(a, 0), 1);
}
Math.lerp ??= function (a, b, t) {
    return a + (b - a) * t;
}