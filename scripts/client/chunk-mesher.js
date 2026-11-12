import { getBlockTypeFromId, getBlockTypeIndex } from './shared/block-registry.js';
import { getFaceDirs } from './shared/geometry.js';
import { getBlockFaceColor } from './shared/block-stats.js';
import { getBorderSectionsForChunk } from './shared/world-border.js';

const CHUNK_SIZE = 16;
const PADDED_SIZE = CHUNK_SIZE + 2;
const PADDED_PLANE = PADDED_SIZE * PADDED_SIZE;
const PADDED_VOLUME = PADDED_PLANE * PADDED_SIZE;
const UNKNOWN_VOXEL = 2;
const FACE_UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const BORDER_GRID_DIVISIONS = 4;
const BORDER_LINE_WIDTH = 0.06;
const BORDER_CHUNK_EDGE_WIDTH = 0.18;
const BORDER_COLOR = [1, 0.12, 0.08];

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
    // Cull voxel faces, add border strips, and allocate exact mesh buffers.
    buildMesh(chunk, world, borderOccupancy = null, borderDistance = world?.borderDistance ?? null) {
        const blocks = chunk.blocks;
        const occupancy = borderOccupancy ?? new Uint8Array(PADDED_VOLUME);
        const faceMasks = new Uint8Array(blocks.length);
        const baseX = chunk.cx * CHUNK_SIZE;
        const baseY = chunk.cy * CHUNK_SIZE;
        const baseZ = chunk.cz * CHUNK_SIZE;
        const borderSections = getBorderSectionsForChunk(
            chunk.cx, chunk.cy, chunk.cz, borderDistance, CHUNK_SIZE,
        );

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

        const borderQuadCount = borderSections.reduce((count, section) => count +
            BORDER_GRID_DIVISIONS * 2 + Number(section.maxU === borderDistance) + Number(section.maxV === borderDistance), 0);
        const vertices = new Float32Array((faceCount + borderQuadCount) * 4 * 13);
        const indices = new Uint32Array((faceCount + borderQuadCount) * 6);
        const colorCache = new Map();
        let vertexCursor = 0, indexCursor = 0, vertexOffset = 0;

        for (let i = 0; i < blocks.length; i++) {
            const mask = faceMasks[i];
            if (!mask) continue;
            const x = i & 15, y = (i >> 4) & 15, z = i >> 8;
            const paddedIndex = (x + 1) + (y + 1) * PADDED_SIZE + (z + 1) * PADDED_PLANE;
            const wx = baseX + x, wy = baseY + y, wz = baseZ + z;
            const blockId = blocks[i];
            let material = colorCache.get(blockId);
            if (!material) {
                const type = getBlockTypeFromId(blockId);
                material = {
                    colors: FACES.map(face => getBlockFaceColor(type, face.normal)),
                    textureBase: getBlockTypeIndex(type) * 6,
                };
                colorCache.set(blockId, material);
            }

            for (let faceIndex = 0; faceIndex < FACES.length; faceIndex++) {
                if (!(mask & (1 << faceIndex))) continue;
                const face = FACES[faceIndex];
                const color = material.colors[faceIndex];
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
                    vertices[vertexCursor++] = color[0];
                    vertices[vertexCursor++] = color[1];
                    vertices[vertexCursor++] = color[2];
                    vertices[vertexCursor++] = FACE_UVS[v][0];
                    vertices[vertexCursor++] = FACE_UVS[v][1];
                    vertices[vertexCursor++] = material.textureBase + faceIndex;
                    vertices[vertexCursor++] = shade;
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

        // Append border grid strips as ordinary triangles so chunk depth and fade apply.
        const appendBorderQuad = (section, corners) => {
            const baseVertex = vertexOffset;
            for (const [u, v] of corners) {
                const position = [0, 0, 0];
                position[section.normalAxis] = section.plane;
                position[section.uAxis] = u;
                position[section.vAxis] = v;
                vertices[vertexCursor++] = position[0];
                vertices[vertexCursor++] = position[1];
                vertices[vertexCursor++] = position[2];
                vertices[vertexCursor++] = section.normalAxis === 0 ? section.normalSign : 0;
                vertices[vertexCursor++] = section.normalAxis === 1 ? section.normalSign : 0;
                vertices[vertexCursor++] = section.normalAxis === 2 ? section.normalSign : 0;
                vertices[vertexCursor++] = BORDER_COLOR[0];
                vertices[vertexCursor++] = BORDER_COLOR[1];
                vertices[vertexCursor++] = BORDER_COLOR[2];
                vertices[vertexCursor++] = 0;
                vertices[vertexCursor++] = 0;
                vertices[vertexCursor++] = -1;
                vertices[vertexCursor++] = 1;
            }

            const baseOrientation = section.normalAxis === 1 ? -1 : 1;
            const reverseWinding = baseOrientation * section.normalSign < 0;
            const order = reverseWinding ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
            for (const index of order) indices[indexCursor++] = baseVertex + index;
            vertexOffset += 4;
        };

        for (const section of borderSections) {
            const spanU = section.maxU - section.minU;
            const spanV = section.maxV - section.minV;
            for (let division = 0; division <= BORDER_GRID_DIVISIONS; division++) {
                const edge = division === 0 || division === BORDER_GRID_DIVISIONS;
                const halfWidth = (edge ? BORDER_CHUNK_EDGE_WIDTH : BORDER_LINE_WIDTH) * 0.5;
                const u = section.minU + spanU * division / BORDER_GRID_DIVISIONS;
                const v = section.minV + spanV * division / BORDER_GRID_DIVISIONS;
                const ownsUpperUEdge = division !== BORDER_GRID_DIVISIONS || section.maxU === borderDistance;
                const ownsUpperVEdge = division !== BORDER_GRID_DIVISIONS || section.maxV === borderDistance;
                if (ownsUpperUEdge) {
                    appendBorderQuad(section, [
                        [u - halfWidth, section.minV], [u + halfWidth, section.minV],
                        [u + halfWidth, section.maxV], [u - halfWidth, section.maxV],
                    ]);
                }
                if (ownsUpperVEdge) {
                    appendBorderQuad(section, [
                        [section.minU, v - halfWidth], [section.maxU, v - halfWidth],
                        [section.maxU, v + halfWidth], [section.minU, v + halfWidth],
                    ]);
                }
            }
        }
        return { vertices, indices };
    }
}
