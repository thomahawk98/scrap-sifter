// chunk generator worker
import terrain from '../core/terrain.js';

self.onmessage = (event) => {
    const { chunkPositions, seed } = event.data;
    const chunks = chunkPositions.map(chunkPos => generateChunkVoxels(chunkPos, seed));
    const transferables = chunks.map(chunk => chunk.voxels.buffer);
    self.postMessage({ chunks }, transferables);
}

function generateChunkVoxels(chunkPos, seed) {
    const CHUNK_SIZE = 16;

    const data = {
        chunkPos,
        voxels: new Uint16Array(CHUNK_SIZE ** 3),
        empty: true,
    }

    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {

                // map to world coordinates
                const [wx, wy, wz] = [x, y, z].map((a, i) => a + chunkPos[i] * CHUNK_SIZE);

                const solid = terrain.getSolidityAt(wx, wy, wz, seed);
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
