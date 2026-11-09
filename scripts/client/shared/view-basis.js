// Camera orientation is a unit quaternion. Applying mouse rotation in local
// axes avoids Euler-angle flips when the view turns upside down.
export function rotateLocal(orientation, axis, angle) {
    const halfAngle = angle * 0.5;
    const sine = Math.sin(halfAngle);
    const rotation = [
        Math.cos(halfAngle),
        axis[0] * sine,
        axis[1] * sine,
        axis[2] * sine,
    ];
    const [aw, ax, ay, az] = orientation;
    const [bw, bx, by, bz] = rotation;
    const result = [
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ];
    const length = Math.hypot(...result);
    return result.map(component => component / length);
}

function rotateVector(orientation, vector) {
    const [w, x, y, z] = orientation;
    const [vx, vy, vz] = vector;
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    return [
        vx + w * tx + y * tz - z * ty,
        vy + w * ty + z * tx - x * tz,
        vz + w * tz + x * ty - y * tx,
    ];
}

export function getViewBasis(orientation) {
    return {
        forward: rotateVector(orientation, [0, 0, -1]),
        right: rotateVector(orientation, [1, 0, 0]),
        up: rotateVector(orientation, [0, 1, 0]),
    };
}

export function reverseView(orientation) {
    // Turn the rear camera around local up while preserving the player's roll.
    return rotateLocal(orientation, [0, 1, 0], Math.PI);
}
