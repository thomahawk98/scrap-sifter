import ChunkMesher from './chunk-mesher.js';

const mesher = new ChunkMesher();

// Build a chunk mesh off the browser render thread and transfer its buffers back.
self.onmessage = ({ data }) => {
    const { key, cx, cy, cz, revision, blocks, borderOccupancy, borderDistance } = data;
    const chunk = {
        cx, cy, cz, blocks,
        getIndex: (x, y, z) => x + y * 16 + z * 256,
    };
    const geometry = mesher.buildMesh(chunk, null, borderOccupancy, borderDistance);
    self.postMessage({ key, revision, geometry }, [geometry.vertices.buffer, geometry.indices.buffer]);
};
