import Chunk from './chunk.js';
export default class ChunkGenerator {
    constructor(manager) {
        this.manager = manager;
        this.world = manager.world;

        this.requestQueue = new Map(); // new chunk requests
        this.isBusy = false;
        this.worker = new Worker(
            new URL("./chunk-generator-worker.js", import.meta.url),
            { type: "module" }
        );

        this.worker.onerror = console.error;
        this.worker.onmessageerror = console.error;

        this.worker.onmessage = (event) => {
            //console.log('reply recieved');
            this.recieveChunkData(event.data); // deal with the data

            // assign a new task if its available
            const newRequestAvailable = this.requestQueue.size !== 0;
            if (newRequestAvailable) this.feedWorkerNewRequest();
            else this.isBusy = false;
        }
    }

    requestNewChunk(cx, cy, cz, priority = 1) { // the method everyone else will call
        const key = this.world.getChunkKey(cx, cy, cz);
        const request = { key, chunkPos: [cx, cy, cz], priority };

        this.takeRequest(request);
    }

    takeRequest(request) {
        // check for duplicates in request queue
        if (this.requestQueue.has(request.key))
            this.requestQueue.get(request.key).priority += request.priority;
        else
            this.requestQueue.set(request.key, request);

        // give the request to the worker
        if (!this.isBusy) this.feedWorkerNewRequest();
    }

    getHighestPriorityRequestInQueue() {
        if (this.requestQueue.size === 0) return null; // no requests in queue
        let highestPriorityRequest = { priority: -Infinity };
        for (const [key, request] of this.requestQueue.entries()) {
            if (request.priority <= highestPriorityRequest.priority) continue;
            highestPriorityRequest = request;
        }
        return highestPriorityRequest;
    }

    feedWorkerNewRequest() {
        if (this.requestQueue.size == 0) return; // no requests to feed

        const request = this.getHighestPriorityRequestInQueue();
        if (!request) return;

        const message = {
            chunkPos: request.chunkPos,
            seed: this.world.seed,
        }
        this.worker.postMessage(message);
        this.requestQueue.delete(request.key);
        this.isBusy = true;

        //console.log('sent worker a message...');
    }

    recieveChunkData(data) {
        const chunk = this.getChunkAt(...data.chunkPos);
        chunk.blocks = data.voxels;
        chunk.empty = data.empty;
        chunk.generated = true;
        chunk.state = 'data';
    }

    // get chunk from the world or generate new chunk
    getChunkAt(cx, cy, cz) {
        const chunk = this.world.getChunk(cx, cy, cz);
        if (chunk) return chunk;

        const key = this.world.getChunkKey(cx, cy, cz);
        const newChunk = new Chunk(cx, cy, cz);
        this.world.unloadedChunks.set(key, newChunk);
        return newChunk;
    }
}