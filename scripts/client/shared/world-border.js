const AXES = [0, 1, 2];

// Return this chunk's clipped patches of the six border faces, if any.
export function getBorderSectionsForChunk(cx, cy, cz, borderDistance, chunkSize = 16) {
    if (!Number.isFinite(borderDistance) || borderDistance <= 0) return [];

    const chunkMin = [cx, cy, cz].map(value => value * chunkSize);
    const chunkMax = chunkMin.map(value => value + chunkSize);
    const inset = Math.min(0.02, borderDistance * 0.001);
    const sections = [];

    // Keep one face patch inside each chunk that intersects a border plane.
    for (const normalAxis of AXES) {
        const [uAxis, vAxis] = AXES.filter(axis => axis !== normalAxis);
        for (const sign of [-1, 1]) {
            const plane = sign * (borderDistance - inset);
            if (plane < chunkMin[normalAxis] || plane >= chunkMax[normalAxis]) continue;

            const minU = Math.max(chunkMin[uAxis], -borderDistance);
            const maxU = Math.min(chunkMax[uAxis], borderDistance);
            const minV = Math.max(chunkMin[vAxis], -borderDistance);
            const maxV = Math.min(chunkMax[vAxis], borderDistance);
            if (minU >= maxU || minV >= maxV) continue;

            sections.push({
                normalAxis,
                normalSign: -sign,
                plane,
                uAxis,
                vAxis,
                minU,
                maxU,
                minV,
                maxV,
            });
        }
    }

    return sections;
}
