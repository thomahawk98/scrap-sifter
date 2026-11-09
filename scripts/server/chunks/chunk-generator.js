import { Worker } from 'node:worker_threads';

export default class ChunkGenerator {
    constructor(manager, { workerCount = 2, batchSize = 4 } = {}) {
        this.manager = manager;
        this.world = manager.world;
        this.requestQueue = new Map();
        this.batchSize = batchSize;
        this.playerPositions = [];
        // Keep worker state in slots so concurrency can grow without adding
        // separate worker properties or dispatch paths.
        this.workers = Array.from({ length: workerCount }, () => {
            const slot = {
                worker: new Worker(new URL('./chunk-generator-worker.js', import.meta.url)),
                busy: false,
                batch: null,
            };
            slot.worker.on('message', data => this.handleWorkerMessage(slot, data));
            slot.worker.on('error', error => this.handleWorkerError(slot, error));
            slot.worker.on('exit', code => {
                if (code && slot.busy) this.handleWorkerError(slot, new Error(`Chunk worker exited (${code})`));
            });
            return slot;
        });
    }

    setPlayerPositions(positions) {
        this.playerPositions = positions.map(position => [...position]);
    }

    getPendingCount() {
        return this.requestQueue.size + this.workers.reduce(
            (count, slot) => count + (slot.batch?.length ?? 0), 0
        );
    }

    requestNewChunk(cx, cy, cz) {
        const key = this.world.getChunkKey(cx, cy, cz);
        const chunk = this.manager.createChunk(cx, cy, cz);
        if (this.requestQueue.has(key)) return chunk;
        if (chunk.dataStatus === 'ready' || chunk.dataStatus === 'generating') return chunk;
        // Keep requests pending until a worker is free, then dispatch the
        // nearest available batch to that worker.
        this.requestQueue.set(key, { key, chunk, revision: chunk.revision });
        chunk.dataStatus = 'generating';
        return chunk;
    }

    pruneUnsubscribed() {
        for (const [key, request] of this.requestQueue) {
            if (this.manager.requestedBy.has(key)) continue;
            this.requestQueue.delete(key);
            request.chunk.dataStatus = 'missing';
        }
    }

    processNextRequests() {
        if (!this.requestQueue.size || this.playerPositions.length === 0) return;

        // Ignore queued work whose clients left the viewing area while it waited.
        this.pruneUnsubscribed();
        if (!this.requestQueue.size) return;

        for (const slot of this.workers) {
            if (slot.busy || !this.requestQueue.size) continue;
            const batch = this.takeNearestBatch();
            if (!batch.length) break;

            slot.busy = true;
            slot.batch = batch;
            slot.worker.postMessage({
                chunkPositions: batch.map(request => [request.chunk.cx, request.chunk.cy, request.chunk.cz]),
                seed: this.world.seed,
            });
        }
    }

    takeNearestBatch() {
        // Each batch begins with the closest chunk, then takes the next closest
        // remaining requests for better locality and fewer worker round trips.
        const rankedRequests = [...this.requestQueue.values()].sort((a, b) =>
            this.getDistanceSquared(a.chunk) - this.getDistanceSquared(b.chunk)
        );
        const batch = rankedRequests.slice(0, this.batchSize);
        for (const request of batch) this.requestQueue.delete(request.key);
        return batch;
    }

    getDistanceSquared(chunk) {
        let nearestDistanceSquared = Infinity;
        for (const position of this.playerPositions) {
            const dx = chunk.cx * this.world.CHUNK_SIZE + this.world.CHUNK_SIZE / 2 - position[0];
            const dy = chunk.cy * this.world.CHUNK_SIZE + this.world.CHUNK_SIZE / 2 - position[1];
            const dz = chunk.cz * this.world.CHUNK_SIZE + this.world.CHUNK_SIZE / 2 - position[2];
            nearestDistanceSquared = Math.min(nearestDistanceSquared, dx * dx + dy * dy + dz * dz);
        }
        return nearestDistanceSquared;
    }

    handleWorkerMessage(slot, data) {
        const batch = slot.batch ?? [];
        const generatedChunks = new Map((data.chunks ?? []).map(chunk => [
            this.world.getChunkKey(...chunk.chunkPos), chunk,
        ]));

        // Apply each result independently: a chunk may have left render range
        // or been replaced while the rest of its batch was still generating.
        for (const request of batch) {
            const generatedChunk = generatedChunks.get(request.key);
            if (generatedChunk) this.manager.receiveGeneratedChunk(generatedChunk, request);
            else this.manager.failGenerationRequest(request);
        }

        slot.batch = null;
        slot.busy = false;
        this.processNextRequests();
    }

    handleWorkerError(slot, error) {
        console.error(error);
        for (const request of slot.batch ?? []) this.manager.failGenerationRequest(request);
        slot.batch = null;
        slot.busy = false;
        this.processNextRequests();
    }
}
