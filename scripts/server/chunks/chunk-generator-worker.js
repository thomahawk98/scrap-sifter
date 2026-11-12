// Node worker thread: generation stays on the server and transfers compact voxel buffers.
import terrain from '../core/terrain.js';
import { parentPort } from 'node:worker_threads';

// Generate requested chunks and transfer their voxel buffers without copying.
parentPort.on('message', ({ chunkPositions, seed }) => {
    const chunks = chunkPositions.map(chunkPos => generateChunkVoxels(chunkPos, seed));
    const transferables = chunks.map(chunk => chunk.voxels.buffer);
    parentPort.postMessage({ chunks }, transferables);
});

// Generate compact voxel IDs for one chunk using the shared seeded terrain field.
function generateChunkVoxels(chunkPos, seed) {
    const CHUNK_SIZE = 16;
    const baseX = chunkPos[0] * CHUNK_SIZE;
    const baseY = chunkPos[1] * CHUNK_SIZE;
    const baseZ = chunkPos[2] * CHUNK_SIZE;

    const data = {
        chunkPos,
        voxels: new Uint16Array(CHUNK_SIZE ** 3),
        empty: true,
    }

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const solid = terrain.getSolidityAt(baseX + x, baseY + y, baseZ + z, seed);
                if (!solid) continue; // air, leave as a 0

                // set the block to 1 to represent stone
                const index = x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE;
                data.voxels[index] = 1;
                data.empty = false;
            }
        }
    }

    return data;
}
