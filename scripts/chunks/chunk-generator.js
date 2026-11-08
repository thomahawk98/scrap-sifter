export default class ChunkGenerator {
    constructor(manager) {
        this.manager = manager;
        this.world = manager.world;
        this.requestQueue = new Map();
        this.isBusy = false;
        this.inFlight = null;
        this.playerPosition = null;
        this.worker = new Worker(new URL('./chunk-generator-worker.js', import.meta.url), { type: 'module' });
        this.worker.onerror = console.error;
        this.worker.onmessageerror = console.error;
        this.worker.onmessage = ({ data }) => {
            // The manager validates the response and attaches data to its chunk.
            this.manager.receiveGeneratedChunk(data, this.inFlight);
            this.inFlight = null;
            this.isBusy = false;
            this.processNextRequest();
        };
    }

    setPlayerPosition(position) {
        this.playerPosition = position;
    }

    requestNewChunk(cx, cy, cz) {
        const key = this.world.getChunkKey(cx, cy, cz);
        const chunk = this.manager.createChunk(cx, cy, cz);
        if (this.requestQueue.has(key)) return chunk;
        if (chunk.dataStatus === 'ready' || chunk.dataStatus === 'generating') return chunk;
        // Leave requests queued until the manager has collected the whole
        // neighborhood, so the first worker job can be the nearest one.
        this.requestQueue.set(key, { key, chunk });
        chunk.dataStatus = 'generating';
        return chunk;
    }

    pruneOutsideRenderDistance(position, renderDistance) {
        for (const [key, request] of this.requestQueue) {
            if (this.isWithinDistance(request.chunk, position, renderDistance)) continue;
            this.requestQueue.delete(key);
            request.chunk.dataStatus = 'missing';
        }
    }

    isWithinDistance(chunk, position, renderDistance) {
        const dx = chunk.cx - position[0];
        const dy = chunk.cy - position[1];
        const dz = chunk.cz - position[2];
        return dx * dx + dy * dy + dz * dz <= renderDistance * renderDistance;
    }

    processNextRequest() {
        if (this.isBusy || !this.requestQueue.size || !this.playerPosition) return;

        // Recheck before dispatch because the player may have moved while this
        // request waited behind another generation job.
        const playerChunkPosition = this.world.getChunkCoords(...this.playerPosition);
        this.pruneOutsideRenderDistance(playerChunkPosition, this.world.renderDistance);
        if (!this.requestQueue.size) return;

        let nearestRequest = null;
        let nearestDistance = Infinity;
        for (const request of this.requestQueue.values()) {
            // Compare chunk centers in world coordinates, so requests are
            // ordered by their actual distance from the player's position.
            const dx = request.chunk.cx * this.world.CHUNK_SIZE + this.world.CHUNK_SIZE / 2 - this.playerPosition[0];
            const dy = request.chunk.cy * this.world.CHUNK_SIZE + this.world.CHUNK_SIZE / 2 - this.playerPosition[1];
            const dz = request.chunk.cz * this.world.CHUNK_SIZE + this.world.CHUNK_SIZE / 2 - this.playerPosition[2];
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < nearestDistance) {
                nearestRequest = request;
                nearestDistance = distance;
            }
        }
        if (!nearestRequest) return;

        this.requestQueue.delete(nearestRequest.key);
        this.inFlight = {
            key: nearestRequest.key,
            chunk: nearestRequest.chunk,
            revision: nearestRequest.chunk.revision,
        };
        this.isBusy = true;
        this.worker.postMessage({
            chunkPos: [nearestRequest.chunk.cx, nearestRequest.chunk.cy, nearestRequest.chunk.cz],
            seed: this.world.seed,
        });
    }
}
