import { getBlockTypeFromId } from './shared/block-registry.js';
import { getFaceDirs } from './shared/geometry.js';
import { getBlockFaceColor } from './shared/block-stats.js';

const CHUNK_SIZE = 16;
const PADDED_SIZE = CHUNK_SIZE + 2;
const PADDED_PLANE = PADDED_SIZE * PADDED_SIZE;
const PADDED_VOLUME = PADDED_PLANE * PADDED_SIZE;
const UNKNOWN_VOXEL = 2;

// Convert small AO coordinate triples to flat offsets once instead of
// allocating and destructuring them for every visible vertex.
const FACES = getFaceDirs().map(face => ({
    ...face,
    neighborOffset: face.offset[0] + face.offset[1] * PADDED_SIZE + face.offset[2] * PADDED_PLANE,
    aoOffsets: face.ao.map(vertex => vertex.map(([x, y, z]) =>
        x + y * PADDED_SIZE + z * PADDED_PLANE)),
}));

// Client CPU mesher: it consumes server voxel IDs and creates only local geometry.
export default class ChunkMesher {
    buildMesh(chunk, world, borderOccupancy = null) {
        const blocks = chunk.blocks;
        const occupancy = borderOccupancy ?? new Uint8Array(PADDED_VOLUME);
        const faceMasks = new Uint8Array(blocks.length);
        const baseX = chunk.cx * CHUNK_SIZE;
        const baseY = chunk.cy * CHUNK_SIZE;
        const baseZ = chunk.cz * CHUNK_SIZE;

        // Fill the chunk interior directly from its compact voxel array.
        for (let i = 0; i < blocks.length; i++) {
            if (blocks[i] === 0) continue;
            const x = i & 15, y = (i >> 4) & 15, z = i >> 8;
            occupancy[(x + 1) + (y + 1) * PADDED_SIZE + (z + 1) * PADDED_PLANE] = 1;
        }

        // Copy just the one-cell border needed by face culling and AO. Direct
        // solid lookups avoid creating decoded block objects in this hot path.
        if (!borderOccupancy) {
            for (let z = -1; z <= CHUNK_SIZE; z++) {
                for (let y = -1; y <= CHUNK_SIZE; y++) {
                    for (let x = -1; x <= CHUNK_SIZE; x++) {
                        if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) continue;
                        const state = world.getVoxelState(baseX + x, baseY + y, baseZ + z);
                        occupancy[(x + 1) + (y + 1) * PADDED_SIZE + (z + 1) * PADDED_PLANE] =
                            state === null ? UNKNOWN_VOXEL : state ? 1 : 0;
                    }
                }
            }
        }

        // Cache face visibility while counting so typed geometry buffers can
        // be allocated exactly once at their final size.
        let faceCount = 0;
        for (let i = 0; i < blocks.length; i++) {
            if (blocks[i] === 0) continue;
            const x = i & 15, y = (i >> 4) & 15, z = i >> 8;
            const paddedIndex = (x + 1) + (y + 1) * PADDED_SIZE + (z + 1) * PADDED_PLANE;
            let mask = 0;
            for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) {
                // Unknown neighbor data suppresses temporary outer faces until
                // that chunk arrives; known air remains an open visible face.
                if (occupancy[paddedIndex + FACES[faceIndex].neighborOffset] === 0) {
                    mask |= 1 << faceIndex;
                    faceCount++;
                }
            }
            faceMasks[i] = mask;
        }

        const vertices = new Float32Array(faceCount * 4 * 9);
        const indices = new Uint32Array(faceCount * 6);
        const colorCache = new Map();
        let vertexCursor = 0, indexCursor = 0, vertexOffset = 0;

        for (let i = 0; i < blocks.length; i++) {
            const mask = faceMasks[i];
            if (!mask) continue;
            const x = i & 15, y = (i >> 4) & 15, z = i >> 8;
            const paddedIndex = (x + 1) + (y + 1) * PADDED_SIZE + (z + 1) * PADDED_PLANE;
            const wx = baseX + x, wy = baseY + y, wz = baseZ + z;
            const blockId = blocks[i];
            let colors = colorCache.get(blockId);
            if (!colors) {
                const type = getBlockTypeFromId(blockId);
                colors = FACES.map(face => getBlockFaceColor(type, face.normal));
                colorCache.set(blockId, colors);
            }

            for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) {
                if (!(mask & (1 << faceIndex))) continue;
                const face = FACES[faceIndex];
                const color = colors[faceIndex];
                for (let v = 0; v < 4; v++) {
                    const [vx, vy, vz] = face.verts[v];
                    const ao = face.aoOffsets[v];
                    const occlusion = Number(occupancy[paddedIndex + ao[0]] === 1) +
                        Number(occupancy[paddedIndex + ao[1]] === 1) +
                        Number(occupancy[paddedIndex + ao[2]] === 1);
                    const shade = 1 - Math.min(3, occlusion) * 0.2;
                    vertices[vertexCursor++] = wx + 0.5 + vx;
                    vertices[vertexCursor++] = wy + 0.5 + vy;
                    vertices[vertexCursor++] = wz + 0.5 + vz;
                    vertices[vertexCursor++] = face.normal[0];
                    vertices[vertexCursor++] = face.normal[1];
                    vertices[vertexCursor++] = face.normal[2];
                    vertices[vertexCursor++] = color[0] * shade;
                    vertices[vertexCursor++] = color[1] * shade;
                    vertices[vertexCursor++] = color[2] * shade;
                }
                indices[indexCursor++] = vertexOffset;
                indices[indexCursor++] = vertexOffset + 1;
                indices[indexCursor++] = vertexOffset + 2;
                indices[indexCursor++] = vertexOffset;
                indices[indexCursor++] = vertexOffset + 2;
                indices[indexCursor++] = vertexOffset + 3;
                vertexOffset += 4;
            }
        }
        return { vertices, indices };
    }
}
