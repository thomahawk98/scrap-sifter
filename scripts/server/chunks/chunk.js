import { encodeBlock, decodeBlock } from '../core/block-registry.js';

const CHUNK_SIZE = 16;

// Server chunk data is authoritative; clients build their own render geometry.
export default class Chunk {
    // Allocate metadata before voxel data arrives from a generator worker.
    constructor(cx, cy, cz) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        this.blocks = null;
        this.tileEntities = null;
        this.dataStatus = 'missing'; // missing -> generating -> ready
        this.revision = 0;
        this.modified = false;
        this.empty = false;
    }

    // Flatten local coordinates into the chunk's x-major 16-bit voxel array.
    getIndex(lx, ly, lz) {
        return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
    }

    // Read an encoded voxel and optionally decode it to a block record.
    getBlock(lx, ly, lz, decode = true) {
        if (!this.blocks) return null;
        const id = this.blocks[this.getIndex(lx, ly, lz)];
        if (!id) return null;
        return decode ? decodeBlock(id) : id;
    }

    // Encode a block mutation and advance the chunk's content revision.
    setBlock(lx, ly, lz, block) {
        if (!this.blocks) return false;
        const encodedBlock = encodeBlock(block);
        this.blocks[this.getIndex(lx, ly, lz)] = encodedBlock;
        if (encodedBlock !== 0) this.empty = false;
        this.modified = true;
        this.revision++;
        return true;
    }

    // Install generated voxel data and mark this chunk available to the world.
    setBlockData(blocks, empty = false) {
        this.blocks = blocks;
        this.empty = empty;
        this.dataStatus = 'ready';
        this.revision++;
    }
}
