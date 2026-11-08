import { decodeBlock } from '../core/block-registry.js';
import { getFaceDirs } from '../core/geometry.js';
import { getBlockFaceColor } from '../core/block-stats.js';

const CHUNK_SIZE = 16;

// CPU geometry generation only. The manager decides when it runs; the renderer
// decides when the resulting buffers are uploaded or released. Vertices keep
// the current world-coordinate format expected by the existing shaders.
export default class ChunkMesher {
    buildMesh(chunk, world) {
        const vertices = [];
        const indices = [];
        let vertexOffset = 0;
        const faces = getFaceDirs();
        const aoFactor = (lx, ly, lz, offsets) => {
            let count = 0;
            for (const [dx, dy, dz] of offsets) {
                if (this.isBlockSolid(chunk, lx + dx, ly + dy, lz + dz, world)) count++;
            }
            return 1 - Math.min(3, count) * 0.2;
        };

        for (let i = 0; i < chunk.blocks.length; i++) {
            const block = chunk.blocks[i];
            if (!block) continue;
            const lx = i & 15;
            const ly = (i >> 4) & 15;
            const lz = i >> 8;
            const blockType = decodeBlock(block).type;
            const wx = chunk.cx * CHUNK_SIZE + lx;
            const wy = chunk.cy * CHUNK_SIZE + ly;
            const wz = chunk.cz * CHUNK_SIZE + lz;

            for (const face of faces) {
                const [dx, dy, dz] = face.offset;
                if (this.isBlockSolid(chunk, lx + dx, ly + dy, lz + dz, world)) continue;
                const color = getBlockFaceColor(blockType, face.normal);
                const base = vertexOffset;
                for (let v = 0; v < 4; v++) {
                    const [vx, vy, vz] = face.verts[v];
                    const ao = aoFactor(lx, ly, lz, face.ao[v]);
                    vertices.push(wx + 0.5 + vx, wy + 0.5 + vy, wz + 0.5 + vz,
                        face.normal[0], face.normal[1], face.normal[2],
                        color[0] * ao, color[1] * ao, color[2] * ao);
                }
                indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
                vertexOffset += 4;
            }
        }
        return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
    }

    isBlockSolid(chunk, lx, ly, lz, world) {
        if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
            return chunk.blocks[chunk.getIndex(lx, ly, lz)] !== 0;
        }
        const block = world.getBlock(chunk.cx * CHUNK_SIZE + lx,
            chunk.cy * CHUNK_SIZE + ly, chunk.cz * CHUNK_SIZE + lz);
        return !!block && block.type !== 'air';
    }
}
