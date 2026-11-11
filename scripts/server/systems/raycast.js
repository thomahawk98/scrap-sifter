// Traverse voxel cells with 3D DDA and return the first solid block face hit.
export function raycast(pos, dir, world, maxDistance = 10) {

    let x = Math.floor(pos[0]);
    let y = Math.floor(pos[1]);
    let z = Math.floor(pos[2]);

    const stepX = dir[0] > 0 ? 1 : -1;
    const stepY = dir[1] > 0 ? 1 : -1;
    const stepZ = dir[2] > 0 ? 1 : -1;

    let tMaxX = dir[0] !== 0 ? ((x + (stepX > 0 ? 1 : 0)) - pos[0]) / dir[0] : Infinity;
    let tMaxY = dir[1] !== 0 ? ((y + (stepY > 0 ? 1 : 0)) - pos[1]) / dir[1] : Infinity;
    let tMaxZ = dir[2] !== 0 ? ((z + (stepZ > 0 ? 1 : 0)) - pos[2]) / dir[2] : Infinity;

    const tDeltaX = dir[0] !== 0 ? Math.abs(1 / dir[0]) : Infinity;
    const tDeltaY = dir[1] !== 0 ? Math.abs(1 / dir[1]) : Infinity;
    const tDeltaZ = dir[2] !== 0 ? Math.abs(1 / dir[2]) : Infinity;

    let distanceTraveled = 0;
    let lastNormal = [0, 0, 0];

    while (distanceTraveled <= maxDistance) {
        // Query world for a solid block
        const block = world.getBlock(x, y, z);
        if (block && block.type !== 'air') {
            return {
                position: [x, y, z],
                normal: lastNormal,
                block: block
            };
        }

        // Step along the axis with smallest tMax
        if (tMaxX < tMaxY) {
            if (tMaxX < tMaxZ) {
                x += stepX;
                distanceTraveled = tMaxX;
                tMaxX += tDeltaX;
                lastNormal = [-stepX, 0, 0];
            } else {
                z += stepZ;
                distanceTraveled = tMaxZ;
                tMaxZ += tDeltaZ;
                lastNormal = [0, 0, -stepZ];
            }
        } else {
            if (tMaxY < tMaxZ) {
                y += stepY;
                distanceTraveled = tMaxY;
                tMaxY += tDeltaY;
                lastNormal = [0, -stepY, 0];
            } else {
                z += stepZ;
                distanceTraveled = tMaxZ;
                tMaxZ += tDeltaZ;
                lastNormal = [0, 0, -stepZ];
            }
        }
    }

    return null; // no hit within maxDistance
}
