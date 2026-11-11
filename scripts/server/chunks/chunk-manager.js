import Chunk from './chunk.js';
import ChunkGenerator from './chunk-generator.js';

// Server chunk storage and generation. Clients subscribe to coordinates; only
// completed block data crosses the socket, while meshing remains client-side.
export default class ChunkManager {
    // Bind chunk storage, generation, and network notification callbacks.
    constructor(world, onChunkReady = () => {}, onChunkGenerated = () => {}) {
        this.world = world;
        this.chunks = world.chunks;
        this.generator = new ChunkGenerator(this);
        this.onChunkReady = onChunkReady;
        this.onChunkGenerated = onChunkGenerated;
        this.requestedBy = new Map();
    }

    // Return a ready or pending chunk by integer world coordinates.
    getChunk(cx, cy, cz) { return this.chunks.get(this.world.getChunkKey(cx, cy, cz)) ?? null; }

    // Reuse existing chunk metadata or create an empty generation record.
    createChunk(cx, cy, cz) {
        const key = this.world.getChunkKey(cx, cy, cz);
        let chunk = this.chunks.get(key);
        if (!chunk) this.chunks.set(key, chunk = new Chunk(cx, cy, cz));
        return chunk;
    }

    // Subscribe a player and either send ready data or enqueue generation.
    request(playerId, cx, cy, cz) {
        const key = this.world.getChunkKey(cx, cy, cz);
        let subscribers = this.requestedBy.get(key);
        if (!subscribers) this.requestedBy.set(key, subscribers = new Set());
        subscribers.add(playerId);

        const chunk = this.createChunk(cx, cy, cz);
        if (chunk.dataStatus === 'ready') this.onChunkReady(playerId, this.serialize(chunk));
        else this.generator.requestNewChunk(cx, cy, cz);
    }

    // Remove one player's interest in a chunk key.
    release(playerId, key) {
        const subscribers = this.requestedBy.get(key);
        if (!subscribers) return;
        subscribers.delete(playerId);
        if (subscribers.size === 0) this.requestedBy.delete(key);
    }

    // Remove every subscription for a disconnecting player and prune queued work.
    releaseAll(playerId) {
        for (const [key, subscribers] of this.requestedBy) {
            subscribers.delete(playerId);
            if (subscribers.size === 0) this.requestedBy.delete(key);
        }
        this.generator.pruneUnsubscribed();
    }

    // Keep generation prioritization aligned with current player positions.
    setPlayerPositions(positions) { this.generator.setPlayerPositions(positions); }

    // Dispatch pending work to any available generation worker.
    update() { this.generator.processNextRequests(); }

    // Commit worker data only if the chunk still matches its queued revision.
    receiveGeneratedChunk(data, request) {
        const chunk = this.chunks.get(request.key);
        if (chunk !== request.chunk || chunk.revision !== request.revision) return;
        chunk.setBlockData(data.voxels, data.empty);
        this.onChunkGenerated(chunk);
        for (const playerId of this.requestedBy.get(request.key) ?? []) {
            this.onChunkReady(playerId, this.serialize(chunk));
        }
    }

    // Make a failed in-flight request eligible for another generation attempt.
    failGenerationRequest(request) {
        if (request.chunk.dataStatus === 'generating') request.chunk.dataStatus = 'missing';
    }

    // Send the compact voxel payload required by a client replica.
    serialize(chunk) {
        return { chunkPos: [chunk.cx, chunk.cy, chunk.cz], voxels: chunk.blocks, empty: chunk.empty };
    }
}
