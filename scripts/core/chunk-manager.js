import Chunk from './chunk.js';
export default class ChunkManager {
    constructor() {
        this.dirtyChunkQueue = [];
    }

    update(world, player, renderer, crossed) {
        if (crossed) this.evaluateChunks(world, player, renderer);
        this.addDirtyChunksToQueue(world);
        this.updateQueue(world, player, renderer, 1, true);
    }

    addDirtyChunksToQueue(world) {
        for (const [key, chunk] of world.chunks.entries()) {
            if (!chunk.dirty) continue;

            if (this.dirtyChunkQueue.includes(chunk)) continue; // the chunk is already in the queue
            this.dirtyChunkQueue.push(chunk);
        }
    }

    updateQueue(world, player, renderer, maxChunksPerFrame = 1, countEmptyChunks = false) {

        //sort queue by distance to player
        const [px, py, pz] = world.getChunkCoords(...player.pos);
        this.dirtyChunkQueue.sort((a, b) => {
            const aDist = Math.hypot(a.cx - px, a.cy - py, a.cz - pz);
            const bDist = Math.hypot(b.cx - px, b.cy - py, b.cz - pz);
            return aDist - bDist;
        });

        //upload max chunks per frame (1)
        let count = 0;
        while (this.dirtyChunkQueue.length > 0 && count < maxChunksPerFrame) {
            const chunk = this.dirtyChunkQueue.shift();

            chunk.rebuildGeometry(world);

            const empty = (!chunk.geometry.vertices.length && !chunk.geometry.vertices.length);
            if (countEmptyChunks || !empty) {
                renderer.uploadChunk(chunk);
                count++;
            }
        }
    }

    evaluateChunks(world, player, renderer) {
        const pos = world.getChunkCoords(...player.pos);
        const threshold = world.renderDistance;

        this.generateNewChunks(world, pos, threshold + 1);
        this.loadNearbyChunks(world, pos, threshold, renderer);
        this.reserveDistantChunks(world, pos, threshold);
        this.unloadReserveChunks(world, renderer);
    }

    generateNewChunks(world, pos, threshold) {
        const [px, py, pz] = pos;
        for (let cx = px - threshold; cx <= px + threshold; cx++) {
            for (let cy = py - threshold; cy <= py + threshold; cy++) {
                for (let cz = pz - threshold; cz <= pz + threshold; cz++) {

                    const distance = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2 + (cz - pz) ** 2);
                    if (distance > threshold) continue; //outside spherical render distance

                    //check if chunk already exists
                    const key = world.getChunkKey(cx, cy, cz);
                    if (world.chunks.has(key)) continue;
                    if (world.unloadedChunks.has(key)) continue;

                    //create new chunk
                    const chunk = new Chunk(cx, cy, cz);
                    chunk.generate(world);
                    world.unloadedChunks.set(key, chunk);
                }
            }
        }
    }

    loadNearbyChunks(world, pos, threshold, renderer) {
        const [px, py, pz] = pos;

        //load nearby unloaded chunks
        for (let cx = px - threshold; cx <= px + threshold; cx++) {
            for (let cy = py - threshold; cy <= py + threshold; cy++) {
                for (let cz = pz - threshold; cz <= pz + threshold; cz++) {

                    //check distance to player
                    const distance = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2 + (cz - pz) ** 2);
                    if (distance > threshold) continue; //outside spherical render distance

                    //find chunk
                    const key = world.getChunkKey(cx, cy, cz);
                    if (world.chunks.has(key)) continue; //chunk is already loaded
                    if (!world.unloadedChunks.has(key)) continue; //chunk does not exist

                    //load chunk
                    const chunk = world.unloadedChunks.get(key);
                    world.chunks.set(key, chunk);
                    world.unloadedChunks.delete(key);

                    renderer.uploadChunk(chunk, true);
                    chunk.state = 'loaded';
                }
            }
        }
    }

    reserveDistantChunks(world, pos, threshold) {
        const [px, py, pz] = pos;

        //move distant chunks to reserve
        for (const [key, chunk] of world.chunks) {
            const distX = Math.abs(chunk.cx - px);
            const distY = Math.abs(chunk.cy - py);
            const distZ = Math.abs(chunk.cz - pz);

            //chunk is out of render threshold
            var beyondThreshold = (distX > threshold || distY > threshold || distZ > threshold);
            if (!beyondThreshold) continue; //chunk still in range

            var beyondThreshold = Math.sqrt(distX ** 2 + distY ** 2 + distZ ** 2) > threshold;
            if (!beyondThreshold) continue; //chunk still in range

            //unload chunk
            chunk.lastLoaded = performance.now();
            chunk.state = 'reserve';

            world.unloadedChunks.set(key, chunk);
            world.chunks.delete(key);
        }
    }

    unloadReserveChunks(world, renderer) {
        //delete buffers for very old unloaded chunks
        const now = performance.now();
        const bufferDeleteTimeout = 3 * 60000; // 3 minutes

        for (const [key, chunk] of world.unloadedChunks) {
            if (now - chunk.lastLoaded < bufferDeleteTimeout) continue;
            chunk.deleteBuffers(renderer.gl, 'unloaded chunk timeout'); //delete buffers
        }

        //delete buffers if unloaded chunks exceed a certain limit
        const maxUnloadedChunks = 1024;
        if (world.unloadedChunks.size <= maxUnloadedChunks) return;

        const sorted = [...world.unloadedChunks.values()].sort((a, b) => {
            return a.lastLoaded - b.lastLoaded;
        });

        const excess = world.unloadedChunks.size - maxUnloadedChunks;
        for (let i = 0; i < excess; i++) {
            const chunk = sorted[i];
            chunk.deleteBuffers(renderer.gl, `too many unloaded chunks (${world.unloadedChunks.size})`);
        }
    }
}



//compile a list of all chunks, loaded, reserved, unloaded, and compressed
//check all chunks
//if chunk is in render distance, load it
//if chunk is in render distance + 1, move it to reserve chunks
//if chunk has not been visited for 2 minutes, delete its buffers
//if chunk has not been visited for 10 minutes, delete its geometry and compress it.

//chunks will have 4 states:
/*
- loaded: in use, requesting to be drawn, can be in dirty chunks
- reserve: not in use, should have geometry and buffers though
- unloaded: not in use, should have geometry, but no buffers
- compresed: won't be in use anytime soon, geometry is deleted, blockdata is compressed
*/

/*
issues:
- reserve chunks should hold chunks with no geometry and no buffers that have just been generated,
to keep geometrey of neighbor chunks that are rendered accurate.
- what do we do with ungenerated chunks? Where do they go?
*/

//LTS chunks -> chunks [decompress block array, create buffers]
//debuffered chunks -> chunks [create buffers]
//unloaded chunks -> chunks (chunks are already ready, just not in use)

//dirty chunk queue uses chunks (rendering waiting list) [composes chunk geometry, uploads chunk]
//updates on its own time, just a list of chunks that would like to be redrawn eventually

//chunks -> unloaded chunks (chunk is taken out of the world, still has its geometry and buffers)
//[can be redrawn at a moments notice]
//unloaded chunks -> debuffered chunks (chunk buffers are deleted, chunk will need to be reuploaded to the gpu)
//debuffered chunks -> LTS chunks (chunk geometry is deleted, chunk blocks are compressed)

/*
chunks: chunks in use, drawn, collided with
unloadedChunks: chunks ready to be called at a moments notice, just need to be move to the main chunks list
debufferedChunks: chunks with removed buffers, to be used the buffers must be created and geometry uploaded
compressedChunks: chunks are compressed to minimize storage, geometry is erased
*/
