import Chunk from './chunk.js';
import ChunkGenerator from './chunk-generator.js';
export default class ChunkManager {
    constructor(world) {
        this.world = world;
        this.generator = new ChunkGenerator(this);
        this.dirtyChunkQueue = [];
    }

    update(player, renderer, crossed) {
        if (crossed) this.evaluateChunks(player, renderer);
        this.addDirtyChunksToQueue();
        this.updateQueue(player, renderer, 5, true);

        //update chunk fade values
        for (const chunk of this.world.chunks.values()) {
            if (chunk.fade >= chunk.maxFade) continue;

            chunk.fade++;
        }
    }

    addDirtyChunksToQueue() {
        for (const [key, chunk] of this.world.chunks.entries()) {
            if (!chunk.dirty) continue; // chunk is clean

            if (chunk.empty && !chunk.interactedWith) {
                chunk.dirty = false;
                continue; // chunk is empty
            }

            if (this.dirtyChunkQueue.includes(chunk)) continue; // the chunk is already in the queue
            this.dirtyChunkQueue.push(chunk);
        }
    }

    updateQueue(player, renderer, maxChunksPerFrame = 1, countEmptyChunks = false) {
        this.sortQueue(player); // sort queue by distance to player

        // upload max chunks per frame (1)
        let count = 0;
        while (this.dirtyChunkQueue.length > 0 && count < maxChunksPerFrame) {
            // mesh a chunk with built neighbors
            const chunk = this.getChunkThatHasNeighborsBuilt();
            if (!chunk) return false; // no chunks in dirty chunk queue have all built neighbors :(

            const fadeIn = chunk.geometry ? false : true; // chunks fade in if being generated for the first time
            chunk.rebuildGeometry(this.world);

            // skip chunks far underground with no faces
            const empty = !chunk.geometry.vertices.length && !chunk.geometry.vertices.length;
            if (countEmptyChunks || !empty) {
                renderer.uploadChunk(chunk, fadeIn);
                count++;
            }
            chunk.state = 'loaded';
        }
    }

    sortQueue(player) {
        // bias loading chunks closer to the players y level first (load the terrain on the surface, and load underground chunks afterwards)
        const yBias = 5 * (1 - Math.abs(player.velocity[1]));
        const [px, py, pz] = this.world.getChunkCoords(...player.pos);
        this.dirtyChunkQueue.sort((a, b) => {
            const aDist = Math.hypot(a.cx - px, (a.cy - py) * yBias, a.cz - pz);
            const bDist = Math.hypot(b.cx - px, (b.cy - py) * yBias, b.cz - pz);
            return aDist - bDist;
        });
    }

    getChunkThatHasNeighborsBuilt() {
        for (let i = 0; i < this.dirtyChunkQueue.length; i++) {
            const chunk = this.dirtyChunkQueue[i];
            const neighborsBuilt = this.checkIfAllChunkNeighborsAreBuilt(chunk);
            if (!neighborsBuilt) continue; // current chunk does not have all neighbors built

            this.dirtyChunkQueue.splice(i, 1); // remove the chunk from the dirty chunk queue
            return chunk;
        }
        return false; // no chunks in dirty chunk queue have all built neighbors :(
    }

    checkIfAllChunkNeighborsAreBuilt(chunk) {
        let allNeighborsAreBuilt = true;
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    if (x == 0 && y == 0 && z == 0) continue; // skip this chunk

                    const cx = chunk.cx + x;
                    const cy = chunk.cy + y;
                    const cz = chunk.cz + z;
                    const neighbor = this.world.getChunk(cx, cy, cz);
                    if (neighbor && neighbor.generated) continue; // neighbor is generated

                    this.generator.requestNewChunk(cx, cy, cz, 5);
                    allNeighborsAreBuilt = false;
                }
            }
        }
        return allNeighborsAreBuilt;
    }

    evaluateChunks(player, renderer) {
        console.log('evaluating all chunks')
        const pos = this.world.getChunkCoords(...player.pos);
        const threshold = this.world.renderDistance;

        this.generateNewChunks(pos, threshold + 1);

        this.loadNearbyChunks(pos, threshold, renderer);
        this.unloadDistantChunks(pos, threshold);
        this.archiveUnloadedChunks(renderer);
    }

    generateNewChunks(pos, threshold) {
        const [px, py, pz] = pos;
        for (let cx = px - threshold; cx <= px + threshold; cx++) {
            for (let cy = py - threshold; cy <= py + threshold; cy++) {
                for (let cz = pz - threshold; cz <= pz + threshold; cz++) {
                    // check in a circular boundary around the player
                    const inside = this.isChunkInThreshold([cx, cy, cz], pos, threshold);
                    if (!inside) continue;

                    // check if chunk already exists
                    const key = this.world.getChunkKey(cx, cy, cz);
                    if (this.world.chunks.has(key)) continue; //chunk is already loaded
                    if (this.world.unloadedChunks.has(key)) continue;

                    // create a new blank chunk
                    const newChunk = new Chunk(cx, cy, cz);
                    this.world.unloadedChunks.set(key, newChunk);

                    // tell the generator to generate the chunk data
                    this.generator.requestNewChunk(cx, cy, cz);
                }
            }
        }
    }

    loadNearbyChunks(pos, threshold, renderer) {
        const [px, py, pz] = pos;

        //load nearby unloaded chunks
        for (let cx = px - threshold; cx <= px + threshold; cx++) {
            for (let cy = py - threshold; cy <= py + threshold; cy++) {
                for (let cz = pz - threshold; cz <= pz + threshold; cz++) {
                    // check in a circular boundary around the player
                    const inside = this.isChunkInThreshold([cx, cy, cz], pos, threshold);
                    if (!inside) continue;

                    //find chunk
                    const key = this.world.getChunkKey(cx, cy, cz);
                    if (this.world.chunks.has(key)) continue; //chunk is already loaded

                    // check if chunk is in unloaded chunks
                    const chunk = this.world.unloadedChunks.get(key);
                    if (!chunk || !chunk.generated) continue; // chunk needs to be generated first

                    this.loadChunk(cx, cy, cz, renderer);
                }
            }
        }
    }

    loadChunk(cx, cy, cz, renderer) {
        //find chunk
        const key = this.world.getChunkKey(cx, cy, cz);
        const chunk = this.world.unloadedChunks.get(key);

        //transfer chunk
        this.world.chunks.set(key, chunk);
        this.world.unloadedChunks.delete(key);

        //load chunk
        renderer.uploadChunk(chunk, true);
        chunk.state = 'loaded';
    }

    unloadDistantChunks(pos, threshold) {
        //move distant chunks to reserve
        for (const [key, chunk] of this.world.chunks) {

            //check if chunk is still in render distance
            const chunkPos = [chunk.cx, chunk.cy, chunk.cz];
            const inside = this.isChunkInThreshold(chunkPos, pos, threshold);
            if (inside) continue;

            //unload chunk
            chunk.lastLoaded = performance.now();
            chunk.state = 'unloaded';

            this.world.unloadedChunks.set(key, chunk);
            this.world.chunks.delete(key);
        }
    }

    // delete buffes on old chunks
    archiveUnloadedChunks(renderer) {
        //delete buffers for very old unloaded chunks
        const now = performance.now();
        const bufferDeleteTimeout = 3 * 60000; // 3 minutes

        for (const [key, chunk] of this.world.unloadedChunks) {
            if (!chunk.vertexBuffer && !chunk.indexBuffer) continue; // chunk buffers already deleted
            if (now - chunk.lastLoaded < bufferDeleteTimeout) continue; // chunk still has time left

            //chunk.deleteBuffers(renderer.gl, 'archive chunk timeout'); // delete buffers
            chunk.state = 'archived';
        }
    }

    isChunkInThreshold(cpos, pos, threshold) {
        const [cx, cy, cz] = cpos;
        const [px, py, pz] = pos;
        const dx = cx - px, dy = cy - py, dz = cz - pz;

        return dx * dx + dy * dy + dz * dz <= threshold * threshold;
    }
}