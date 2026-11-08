export default class ChunkGenerator {
    constructor(manager) {
        this.manager = manager;
        this.world = manager.world;
        this.requestQueue = new Map();
        this.isBusy = false;
        this.inFlight = null;
        this.worker = new Worker(new URL('./chunk-generator-worker.js', import.meta.url), { type: 'module' });
        this.worker.onerror = console.error;
        this.worker.onmessageerror = console.error;
        this.worker.onmessage = ({ data }) => {
            // The manager validates the response and attaches data to its chunk.
            this.manager.receiveGeneratedChunk(data, this.inFlight);
            this.inFlight = null;
            this.isBusy = false;
            this.feedWorkerNewRequest();
        };
    }

    requestNewChunk(cx, cy, cz, priority = 1) {
        const key = this.world.getChunkKey(cx, cy, cz);
        const chunk = this.manager.createChunk(cx, cy, cz);
        // Coalesce queued requests and raise their priority instead of sending
        // duplicate generation work to the worker.
        const request = this.requestQueue.get(key);
        if (request) {
            request.priority += priority;
            return chunk;
        }
        if (chunk.dataStatus === 'ready' || chunk.dataStatus === 'generating') return chunk;
        this.requestQueue.set(key, { key, chunk, priority });
        chunk.dataStatus = 'generating';
        if (!this.isBusy) this.feedWorkerNewRequest();
        return chunk;
    }

    feedWorkerNewRequest() {
        if (!this.requestQueue.size) return;
        let request = null;
        for (const candidate of this.requestQueue.values()) {
            if (!request || candidate.priority > request.priority) request = candidate;
        }
        this.requestQueue.delete(request.key);
        this.inFlight = { key: request.key, chunk: request.chunk, revision: request.chunk.revision };
        this.isBusy = true;
        this.worker.postMessage({ chunkPos: [request.chunk.cx, request.chunk.cy, request.chunk.cz], seed: this.world.seed });
    }
}
