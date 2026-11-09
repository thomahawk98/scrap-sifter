import Chunk from './chunk.js';
import ChunkGenerator from './chunk-generator.js';

// Server chunk storage and generation. Clients subscribe to coordinates; only
// completed block data crosses the socket, while meshing remains client-side.
export default class ChunkManager {
    constructor(world, onChunkReady = () => {}) {
        this.world = world;
        this.chunks = world.chunks;
        this.generator = new ChunkGenerator(this);
        this.onChunkReady = onChunkReady;
        this.requestedBy = new Map();
    }

    getChunk(cx, cy, cz) { return this.chunks.get(this.world.getChunkKey(cx, cy, cz)) ?? null; }

    createChunk(cx, cy, cz) {
        const key = this.world.getChunkKey(cx, cy, cz);
        let chunk = this.chunks.get(key);
        if (!chunk) this.chunks.set(key, chunk = new Chunk(cx, cy, cz));
        return chunk;
    }

    request(playerId, cx, cy, cz) {
        const key = this.world.getChunkKey(cx, cy, cz);
        let subscribers = this.requestedBy.get(key);
        if (!subscribers) this.requestedBy.set(key, subscribers = new Set());
        subscribers.add(playerId);

        const chunk = this.createChunk(cx, cy, cz);
        if (chunk.dataStatus === 'ready') this.onChunkReady(playerId, this.serialize(chunk));
        else this.generator.requestNewChunk(cx, cy, cz);
    }

    release(playerId, key) {
        const subscribers = this.requestedBy.get(key);
        if (!subscribers) return;
        subscribers.delete(playerId);
        if (subscribers.size === 0) this.requestedBy.delete(key);
    }

    releaseAll(playerId) {
        for (const [key, subscribers] of this.requestedBy) {
            subscribers.delete(playerId);
            if (subscribers.size === 0) this.requestedBy.delete(key);
        }
        this.generator.pruneUnsubscribed();
    }

    setPlayerPositions(positions) { this.generator.setPlayerPositions(positions); }

    update() { this.generator.processNextRequests(); }

    receiveGeneratedChunk(data, request) {
        const chunk = this.chunks.get(request.key);
        if (chunk !== request.chunk || chunk.revision !== request.revision) return;
        chunk.setBlockData(data.voxels, data.empty);
        for (const playerId of this.requestedBy.get(request.key) ?? []) {
            this.onChunkReady(playerId, this.serialize(chunk));
        }
    }

    failGenerationRequest(request) {
        if (request.chunk.dataStatus === 'generating') request.chunk.dataStatus = 'missing';
    }

    serialize(chunk) {
        return { chunkPos: [chunk.cx, chunk.cy, chunk.cz], voxels: chunk.blocks, empty: chunk.empty };
    }
}
