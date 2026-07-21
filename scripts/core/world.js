import { getBlockDropType } from './block-stats.js';
import physics from '../systems/physics.js';
import Chunk from './chunk.js';

const CHUNK_SIZE = 16;
export default class World {
    constructor() {
        this.seed = Math.round(Math.random() * 10000);
        this.chunks = new Map();
        this.unloadedChunks = new Map();
        this.renderDistance = 3; // in chunks
    }

    getChunkKey(cx, cy, cz) {
        return `${cx},${cy},${cz}`;
    }

    getChunkCoords(x, y, z) {
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        return [cx, cy, cz];
    };

    getChunk(cx, cy, cz, create = false) {
        const key = this.getChunkKey(cx, cy, cz);
        let chunk = this.chunks.get(key);

        if (!chunk && create) {
            chunk = new Chunk(cx, cy, cz);
            this.chunks.set(key, chunk);
        }

        return chunk;
    }

    getBlock(x, y, z) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);

        //get chunk
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return { pos: [x, y, z], type: 'air' };

        //local cors
        const lx = Math.modulo(x, CHUNK_SIZE);
        const ly = Math.modulo(y, CHUNK_SIZE);
        const lz = Math.modulo(z, CHUNK_SIZE);

        //get block
        const block = chunk.getBlock(lx, ly, lz);
        if(!block) return { pos: [x, y, z], type: 'air' };
        return { pos: [x, y, z], ...block };
    }

    setBlock(x, y, z, block) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);
        const chunk = this.getChunk(cx, cy, cz, true);
        if (!chunk) return false;

        //local cors
        const lx = Math.modulo(x, CHUNK_SIZE);
        const ly = Math.modulo(y, CHUNK_SIZE);
        const lz = Math.modulo(z, CHUNK_SIZE);

        //set block
        const success = chunk.setBlock(lx, ly, lz, block);

        // Edge handling (VERY important)
        if (lx === 0) {
            const chunk = this.getChunk(cx - 1, cy, cz);
            if (chunk) chunk.dirty = true;
        }
        if (lx === 15) {
            const chunk = this.getChunk(cx + 1, cy, cz);
            if (chunk) chunk.dirty = true;
        }
        if (ly === 0) {
            const chunk = this.getChunk(cx, cy - 1, cz);
            if (chunk) chunk.dirty = true;
        }
        if (ly === 15) {
            const chunk = this.getChunk(cx, cy + 1, cz);
            if (chunk) chunk.dirty = true;
        }

        if (lz === 0) {
            const chunk = this.getChunk(cx, cy, cz - 1);
            if (chunk) chunk.dirty = true;
        }
        if (lz === 15) {
            const chunk = this.getChunk(cx, cy, cz + 1);
            if (chunk) chunk.dirty = true;
        }

        return success;
    };

    generate() {
        const distance = this.renderDistance;
        for (let cx = -distance; cx < distance; cx++) {
            for (let cy = -distance; cy < distance; cy++) {
                for (let cz = -distance; cz < distance; cz++) {
                    const chunk = this.getChunk(cx, cy, cz, true);
                    chunk.generate(this.seed);
                }
            }
        }
    }
    
    evaluateLoadedChunks(player) {
        const playerChunkCoords = this.getChunkCoords(...player.pos);
        const distance = this.renderDistance;

        //unload distant chunks
        for (const [key, chunk] of this.chunks) {
            const distX = Math.abs(chunk.cx - playerChunkCoords[0]);
            const distY = Math.abs(chunk.cy - playerChunkCoords[1]);
            const distZ = Math.abs(chunk.cz - playerChunkCoords[2]);

            //chunk is out of player's render distance
            const outOfRange = (distX > distance || distY > distance || distZ > distance);
            if (outOfRange) {
                //unload chunk
                chunk.lastLoaded = performance.now();
                this.unloadedChunks.set(key, chunk);
                this.chunks.delete(key);
            }
        }

        //load nearby unloaded chunks
        for (let cx = playerChunkCoords[0] - distance; cx <= playerChunkCoords[0] + distance; cx++) {
            for (let cy = playerChunkCoords[1] - distance; cy <= playerChunkCoords[1] + distance; cy++) {
                for (let cz = playerChunkCoords[2] - distance; cz <= playerChunkCoords[2] + distance; cz++) {
                    const key = this.getChunkKey(cx, cy, cz);
                    if (this.chunks.has(key)) continue; //chunk is already loaded

                    const unloadedChunk = this.unloadedChunks.get(key);
                    if (unloadedChunk) {
                        //reload unloaded chunk
                        this.chunks.set(key, unloadedChunk);
                        this.unloadedChunks.delete(key);
                    } else {
                        //generate new chunk
                        const chunk = this.getChunk(cx, cy, cz, true);
                        chunk.generate(this.seed);
                    }
                }
            }
        }

        this.evaluateUnloadedChunks();
    }

    evaluateUnloadedChunks() {
        //delete buffers for very old unloaded chunks
        const now = performance.now();
        const bufferDeleteTimeout = 5 * 60000; // 5 minutes

        for (const [key, chunk] of this.unloadedChunks) {
            if (now - chunk.lastLoaded > bufferDeleteTimeout) {
                //don't permanently delete chunk data, just its buffers
                chunk.deleteBuffers();
            }
        }

        //delete buffers if unloaded chunks exceed a certain limit
        const maxUnloadedChunks = 128;
        if(this.unloadedChunks.size <= maxUnloadedChunks) return;

        const sorted = [...this.unloadedChunks.values()].sort((a, b) => {
            return a.lastLoaded - b.lastLoaded;
        });

        const excess = this.unloadedChunks.size - maxUnloadedChunks;
        for(let i = 0; i < excess; i++) {
            const chunk = sorted[i];
            chunk.deleteBuffers();
        }
    }

    breakBlock(hit, player) {
        const block = this.getBlock(...hit.position);
        if (!block) return console.log('no block found at', hit.position);

        player.outlinedBlock.health--;
        if (player.outlinedBlock.health > 0) return false; // still breaking, don't delete yet

        this.setBlock(...hit.position, { type: 'air' });

        player.attackReload = 10;
        player.outlinedBlock = null;

        //find item with same drop type in player inventory
        const dropType = getBlockDropType(block.type);
        const existing = player.inventory.find(e => e.type === dropType);

        //add item to player inventory
        if (existing) existing.amount++;
        else player.inventory.push({ type: dropType, amount: 1 });

        return true;
    }


    placeBlock(hit, player) {
        let selected = player.inventory[player.selected];
        if (!selected) return false;
        if (selected.amount <= 0) return false;

        //find where the new block will go
        const [x, y, z] = hit.position;
        const [nx, ny, nz] = hit.normal;
        const pos = [x + nx, y + ny, z + nz];

        const block = {
            pos, type: selected.type,
        };

        const collidesWithSelf = physics.anyEntityCollidesWithBlock(block, [player]);
        if (collidesWithSelf) {
            const dir = [Math.round(Math.sin(player.head.yaw)), 0, Math.round(-Math.cos(player.head.yaw))];
            block.pos = [block.pos[0] + dir[0], block.pos[1] - 1, block.pos[2] + dir[2]];
        }

        const valid = this.validateBlockPlacement(block, player);
        if (valid) {
            player.interactReload = 5;

            //remove one block from player inventory stack
            const item = player.inventory.find(e => e.type === selected.type);
            item.amount--;
            if (item.amount <= 0) player.selected = 0; // reset selection if out of items

            return true;
        }
    }

    validateBlockPlacement(block, player) {
        const [x, y, z] = block.pos;

        //check to make sure player has the block in their inventory
        const item = player.inventory.find(e => e.type === block.type);
        if (!item || item.amount <= 0) return false;

        //check if a block is already at this position
        const existing = this.getBlock(x, y, z);
        if (existing && existing.type !== 'air') return false;

        //check if block is inside other entities
        const entities = [player]; // add other entities to check for collision later
        const collides = physics.anyEntityCollidesWithBlock(block, entities);
        if (collides) return false;

        //add the block to the world
        this.setBlock(x, y, z, block);

        return true;
    }
}