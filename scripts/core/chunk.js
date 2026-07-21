const CHUNK_SIZE = 16;
import { encodeBlock, decodeBlock } from './block-registry.js';
import { getFaceDirs } from './geometry.js';
import { getBlockFaceColor } from './block-stats.js';
import terrain from './terrain.js';
import structures from './structures.js';
export default class Chunk {
    constructor(cx, cy, cz) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;

        this.geometry = null;
        this.indexCount = 0;

        this.blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        this.tileEntities = null;

        this.dirty = false;
        this.state = 'new';

        this.fade = 1;
        this.isFading = false;
    }

    getIndex(lx, ly, lz) {
        const CHUNK_SIZE = 16;
        return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
    }

    getBlock(lx, ly, lz, decode = true) {
        const index = this.getIndex(lx, ly, lz);
        const id = this.blocks[index];
        if (!id) return null;

        if (!decode) return id;
        return decodeBlock(id);
    }

    //remove block is just setting it to air
    setBlock(lx, ly, lz, block) {
        const value = encodeBlock(block);
        const index = this.getIndex(lx, ly, lz);
        this.blocks[index] = value;

        this.dirty = true;
        this.interactedWith = true;
    }

    generate(world) {
        const seed = world.seed;

        //generate terrain
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let y = 0; y < CHUNK_SIZE; y++) {
                for (let z = 0; z < CHUNK_SIZE; z++) {
                    //find world cors of block
                    const wx = this.cx * CHUNK_SIZE + x;
                    const wy = this.cy * CHUNK_SIZE + y;
                    const wz = this.cz * CHUNK_SIZE + z;

                    const height = terrain.getHeightAt(wx, wz, seed);
                    if (wy > height) continue;

                    const type = terrain.getTypeAt(wx, wy, wz, seed);

                    const block = { type };
                    this.setBlock(x, y, z, block);
                }
            }
        }

        //generate structures
        const structuresInChunk = structures.getStructuresForChunk(this.cx, this.cy, this.cz, world);
        for (const structure of structuresInChunk) {
            const data = structures.templates[structure.name];
            for (const block of data.blocks) {
                const lx = (block.x + structure.x) - this.cx * world.CHUNK_SIZE;
                const ly = (block.y + structure.y) - this.cy * world.CHUNK_SIZE;
                const lz = (block.z + structure.z) - this.cz * world.CHUNK_SIZE;

                const insideChunk = (
                    lx >= 0 && lx < world.CHUNK_SIZE &&
                    ly >= 0 && ly < world.CHUNK_SIZE &&
                    lz >= 0 && lz < world.CHUNK_SIZE
                );
                if (!insideChunk) continue;

                this.setBlock(lx, ly, lz, block);
            }
        }
    }

    rebuildGeometry(world) {
        this.geometry = this.getGeometry(world);
        this.dirty = false;
    }

    //vertices and indices for the chunk
    getGeometry(world) {
        const vertices = [];
        const indices = [];
        let vertexOffset = 0;

        //get face directions
        const faces = getFaceDirs();
        const blocks = this.blocks;

        //world coords for chunk
        const cx = this.cx * CHUNK_SIZE;
        const cy = this.cy * CHUNK_SIZE;
        const cz = this.cz * CHUNK_SIZE;

        //ao helper
        const aoFactor = (lx, ly, lz, aoOffsets) => {
            let count = 0;

            if (this.isBlockSolid(lx + aoOffsets[0][0], ly + aoOffsets[0][1], lz + aoOffsets[0][2], world)) count++;
            if (this.isBlockSolid(lx + aoOffsets[1][0], ly + aoOffsets[1][1], lz + aoOffsets[1][2], world)) count++;
            if (this.isBlockSolid(lx + aoOffsets[2][0], ly + aoOffsets[2][1], lz + aoOffsets[2][2], world)) count++;

            return 1.0 - Math.min(3, count) * 0.2;
        };

        //itterate by index
        for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE; i++) {
            const block = blocks[i];
            if (block === 0) continue; //air

            //local block coords
            const lx = i & 15;
            const ly = (i >> 4) & 15;
            const lz = i >> 8;

            //world block coords
            const wx = cx + lx;
            const wy = cy + ly;
            const wz = cz + lz;

            for (const face of faces) {
                const [dx, dy, dz] = face.offset;

                //face culling
                if (this.isBlockSolid(lx + dx, ly + dy, lz + dz, world)) continue;

                //add vertices and indices for this face
                const color = getBlockFaceColor(decodeBlock(block).type, face.normal);
                const baseIndex = vertexOffset;

                //for every vertice
                for (let v = 0; v < 4; v++) {
                    const [vx, vy, vz] = face.verts[v];
                    const ao = aoFactor(lx, ly, lz, face.ao[v]);

                    //add vertice
                    vertices.push(
                        wx + 0.5 + vx,
                        wy + 0.5 + vy,
                        wz + 0.5 + vz,
                        face.normal[0],
                        face.normal[1],
                        face.normal[2],
                        color[0] * ao,
                        color[1] * ao,
                        color[2] * ao
                    );
                }

                //add indices
                indices.push(
                    baseIndex, baseIndex + 1, baseIndex + 2,
                    baseIndex, baseIndex + 2, baseIndex + 3
                );

                //add to the offset
                vertexOffset += 4;
            }
        }

        return {
            vertices: new Float32Array(vertices),
            indices: new Uint32Array(indices)
        };
    }

    //maximized method
    isBlockSolid(lx, ly, lz, world) {
        const insideChunk = (
            lx >= 0 && lx < CHUNK_SIZE &&
            ly >= 0 && ly < CHUNK_SIZE &&
            lz >= 0 && lz < CHUNK_SIZE
        )

        //fast path for inside chunk
        if (insideChunk) {
            const block = this.getBlock(lx, ly, lz);
            return block && block.type !== 'air';
        }

        //outside chunk, get world coords
        const wx = this.cx * CHUNK_SIZE + lx;
        const wy = this.cy * CHUNK_SIZE + ly;
        const wz = this.cz * CHUNK_SIZE + lz;

        const block = world.getBlock(wx, wy, wz);
        return block && block.type !== 'air';
    }

    deleteBuffers(gl, deleteMessage) {
        if (gl) {
            gl.deleteBuffer(this.vertexBuffer);
            gl.deleteBuffer(this.indexBuffer);
        }
        this.vertexBuffer = null;
        this.indexBuffer = null;
        //console.log('chunk', this.cx, this.cy, this.cz, 'deleted it\'s buffers --', deleteMessage);
    }
}