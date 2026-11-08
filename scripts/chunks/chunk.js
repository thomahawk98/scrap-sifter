const CHUNK_SIZE = 16;
import { encodeBlock, decodeBlock } from '../core/block-registry.js';

// A chunk owns world data and its CPU mesh. GPU resources live in Renderer.
// The three statuses below describe independent parts of the pipeline rather
// than one combined lifecycle state.
export default class Chunk {
    constructor(cx, cy, cz) {
        this.cx = cx;
        this.cy = cy;
        this.cz = cz;
        this.blocks = null;
        this.tileEntities = null;
        this.dataStatus = 'missing'; // missing -> generating -> ready
        this.geometry = null;
        this.meshStatus = 'none'; // none -> dirty -> building -> ready
        this.revision = 0;
        this.modified = false;
        this.empty = false;
        this.residency = 'cached'; // active chunks may be meshed and rendered
        this.fade = 50;
        this.maxFade = 50;
    }

    getIndex(lx, ly, lz) {
        return lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE;
    }

    getBlock(lx, ly, lz, decode = true) {
        if (!this.blocks) return null;
        const id = this.blocks[this.getIndex(lx, ly, lz)];
        if (!id) return null;
        return decode ? decodeBlock(id) : id;
    }

    setBlock(lx, ly, lz, block) {
        if (!this.blocks) return false;
        const encodedBlock = encodeBlock(block);
        this.blocks[this.getIndex(lx, ly, lz)] = encodedBlock;
        if (encodedBlock !== 0) this.empty = false;
        this.modified = true;
        this.revision++;
        this.invalidateMesh();
        return true;
    }

    setBlockData(blocks, empty = false) {
        this.blocks = blocks;
        this.empty = empty;
        this.dataStatus = 'ready';
        this.revision++;
        this.invalidateMesh();
    }

    invalidateMesh() {
        // Geometry depends on this chunk's blocks and its neighboring blocks.
        this.geometry = null;
        this.meshStatus = this.dataStatus === 'ready' ? 'dirty' : 'none';
    }
}
