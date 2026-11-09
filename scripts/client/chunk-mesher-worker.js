import ChunkMesher from './chunk-mesher.js';

const mesher = new ChunkMesher();

self.onmessage = ({ data }) => {
    const { key, cx, cy, cz, revision, blocks, borderOccupancy } = data;
    const chunk = {
        cx, cy, cz, blocks,
        getIndex: (x, y, z) => x + y * 16 + z * 256,
    };
    const geometry = mesher.buildMesh(chunk, null, borderOccupancy);
    self.postMessage({ key, revision, geometry }, [geometry.vertices.buffer, geometry.indices.buffer]);
};
