import { getBlockFaceColor } from './block-stats.js';
export function getFaceDirs() {
    const faces = [
        {
            normal: [0, 0, 1], offset: [0, 0, 1], verts: [
                [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]
            ],
            ao: [
                [[-1, 0, 1], [0, -1, 1], [-1, -1, 1]],
                [[1, 0, 1], [0, -1, 1], [1, -1, 1]],
                [[1, 0, 1], [0, 1, 1], [1, 1, 1]],
                [[-1, 0, 1], [0, 1, 1], [-1, 1, 1]]
            ]
        },
        {
            normal: [0, 0, -1], offset: [0, 0, -1], verts: [
                [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]
            ],
            ao: [
                [[-1, 0, -1], [0, -1, -1], [-1, -1, -1]],
                [[-1, 0, -1], [0, 1, -1], [-1, 1, -1]],
                [[1, 0, -1], [0, 1, -1], [1, 1, -1]],
                [[1, 0, -1], [0, -1, -1], [1, -1, -1]]
            ]
        },
        {
            normal: [0, 1, 0], offset: [0, 1, 0], verts: [
                [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]
            ],
            ao: [
                [[-1, 1, -1], [0, 1, -1], [-1, 1, 0]],
                [[-1, 1, 1], [0, 1, 1], [-1, 1, 0]],
                [[1, 1, 1], [0, 1, 1], [1, 1, 0]],
                [[1, 1, -1], [0, 1, -1], [1, 1, 0]]
            ]
        },
        {
            normal: [0, -1, 0], offset: [0, -1, 0], verts: [
                [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]
            ],
            ao: [
                [[-1, -1, -1], [0, -1, -1], [-1, -1, 0]],
                [[1, -1, -1], [0, -1, -1], [1, -1, 0]],
                [[1, -1, 1], [0, -1, 1], [1, -1, 0]],
                [[-1, -1, 1], [0, -1, 1], [-1, -1, 0]]
            ]
        },
        {
            normal: [1, 0, 0], offset: [1, 0, 0], verts: [
                [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]
            ],
            ao: [
                [[1, -1, -1], [1, 0, -1], [1, -1, 0]],
                [[1, 1, -1], [1, 0, -1], [1, 1, 0]],
                [[1, 1, 1], [1, 0, 1], [1, 1, 0]],
                [[1, -1, 1], [1, 0, 1], [1, -1, 0]]
            ]
        },
        {
            normal: [-1, 0, 0], offset: [-1, 0, 0], verts: [
                [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]
            ],
            ao: [
                [[-1, -1, -1], [-1, 0, -1], [-1, -1, 0]],
                [[-1, -1, 1], [-1, 0, 1], [-1, -1, 0]],
                [[-1, 1, 1], [-1, 0, 1], [-1, 1, 0]],
                [[-1, 1, -1], [-1, 0, -1], [-1, 1, 0]]
            ]
        }
    ];
    return faces;
}

export function getVerticesAndIndicesFromBlocks(cubes) {
    function aoFactor(side1, side2, corner) {
        const s1 = posSet.has(side1) ? 1 : 0;
        const s2 = posSet.has(side2) ? 1 : 0;
        const c = posSet.has(corner) ? 1 : 0;
        return 1.0 - Math.min(3, s1 + s2 + c) * 0.2;
    }

    const vertices = [], indices = [];
    let vertexOffset = 0;

    const posSet = new Set(cubes.map(c => c.pos.join(',')));
    const faces = getFaceDirs();

    for (const cube of cubes) {
        if(!cube) continue;

        const [x, y, z] = cube.pos;
        for (const face of faces) {
            const [dx, dy, dz] = face.offset;
            if (posSet.has(`${x + dx},${y + dy},${z + dz}`)) continue;

            const color = getBlockFaceColor(cube.type, face.normal);
            const baseIndex = vertexOffset;

            for (let i = 0; i < 4; i++) {
                const [vx, vy, vz] = face.verts[i];
                const aoOffsets = face.ao[i];

                const side1 = `${x + aoOffsets[0][0]},${y + aoOffsets[0][1]},${z + aoOffsets[0][2]}`;
                const side2 = `${x + aoOffsets[1][0]},${y + aoOffsets[1][1]},${z + aoOffsets[1][2]}`;
                const corner = `${x + aoOffsets[2][0]},${y + aoOffsets[2][1]},${z + aoOffsets[2][2]}`;

                const ao = aoFactor(side1, side2, corner);

                vertices.push(
                    x + 0.5 + vx, y + 0.5 + vy, z + 0.5 + vz,  // position
                    ...face.normal,                            // normal
                    color[0] * ao, color[1] * ao, color[2] * ao // AO-colored
                );
            }

            indices.push(
                baseIndex, baseIndex + 1, baseIndex + 2,
                baseIndex, baseIndex + 2, baseIndex + 3
            );
            vertexOffset += 4;
        }
    }

    return {
        vertices: new Float32Array(vertices),
        indices: new Uint16Array(indices)
    };
}