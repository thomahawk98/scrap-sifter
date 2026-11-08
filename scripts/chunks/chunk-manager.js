import Chunk from './chunk.js';
import ChunkGenerator from './chunk-generator.js';
import ChunkMesher from './chunk-mesher.js';

export default class ChunkManager {
    constructor(world) {
        this.world = world;
        // Keep every in-memory chunk in one map. Work queues and residency do
        // not move chunks between competing collections.
        this.chunks = world.chunks;
        this.generator = new ChunkGenerator(this);
        this.mesher = new ChunkMesher();
        this.dirtyChunkQueue = [];
        this.queuedChunks = new Set();
    }

    getChunk(cx, cy, cz) { return this.chunks.get(this.world.getChunkKey(cx, cy, cz)) ?? null; }

    createChunk(cx, cy, cz) {
        const key = this.world.getChunkKey(cx, cy, cz);
        let chunk = this.chunks.get(key);
        if (!chunk) {
            chunk = new Chunk(cx, cy, cz);
            this.chunks.set(key, chunk);
        }
        return chunk;
    }

    receiveGeneratedChunk(data, request) {
        const key = this.world.getChunkKey(...data.chunkPos);
        const chunk = this.chunks.get(key);
        if (!chunk || !request || request.key !== key || request.chunk !== chunk || request.revision !== chunk.revision) return;
        // Generation can finish after a chunk was requested or edited elsewhere;
        // accept results only for the exact chunk instance and revision sent.
        chunk.setBlockData(data.voxels, data.empty);
        this.invalidateNeighbors(chunk);
    }

    invalidateNeighbors(chunk) {
        for (const [dx, dy, dz] of [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]]) {
            const neighbor = this.getChunk(chunk.cx + dx, chunk.cy + dy, chunk.cz + dz);
            if (neighbor?.dataStatus === 'ready') neighbor.invalidateMesh();
        }
    }

    update(player, renderer, crossed) {
        if (crossed || !this.hasActiveChunks()) this.evaluateChunks(player, renderer);
        this.addDirtyChunksToQueue();
        this.updateQueue(player, renderer, 5);
        for (const chunk of this.chunks.values()) if (chunk.fade < chunk.maxFade) chunk.fade++;
    }

    hasActiveChunks() {
        for (const chunk of this.chunks.values()) if (chunk.residency === 'active') return true;
        return false;
    }

    getActiveChunkCount() {
        let count = 0;
        for (const chunk of this.chunks.values()) if (chunk.residency === 'active') count++;
        return count;
    }

    addDirtyChunksToQueue() {
        // Only active chunks need a mesh now; cached chunks can rebuild on demand.
        for (const chunk of this.chunks.values()) {
            if (chunk.residency !== 'active' || chunk.dataStatus !== 'ready' || chunk.meshStatus !== 'dirty') continue;
            if (chunk.empty && !chunk.modified) {
                chunk.meshStatus = 'ready';
                chunk.geometry = { vertices: new Float32Array(), indices: new Uint32Array() };
                continue;
            }
            if (!this.queuedChunks.has(chunk)) {
                this.dirtyChunkQueue.push(chunk);
                this.queuedChunks.add(chunk);
            }
        }
    }

    updateQueue(player, renderer, maxChunksPerFrame = 1) {
        this.sortQueue(player);
        let count = 0;
        while (this.dirtyChunkQueue.length && count < maxChunksPerFrame) {
            const chunk = this.dirtyChunkQueue.shift();
            this.queuedChunks.delete(chunk);
            if (this.chunks.get(this.world.getChunkKey(chunk.cx, chunk.cy, chunk.cz)) !== chunk ||
                chunk.residency !== 'active' || chunk.dataStatus !== 'ready' || chunk.meshStatus !== 'dirty') continue;
            const key = this.world.getChunkKey(chunk.cx, chunk.cy, chunk.cz);
            const fadeIn = !renderer.hasChunk(key);
            // Reject a result if block data changes while a mesh is being built.
            const revision = chunk.revision;
            chunk.meshStatus = 'building';
            const geometry = this.mesher.buildMesh(chunk, this.world);
            if (revision !== chunk.revision) { chunk.meshStatus = 'dirty'; continue; }
            chunk.geometry = geometry;
            chunk.meshStatus = 'ready';
            renderer.uploadChunk(chunk, fadeIn);
            count++;
        }
    }

    sortQueue(player) {
        const bias = 5 * (1 - Math.abs(player.velocity[1]));
        const [px, py, pz] = this.world.getChunkCoords(...player.pos);
        this.dirtyChunkQueue.sort((a, b) => Math.hypot(a.cx-px,(a.cy-py)*bias,a.cz-pz) - Math.hypot(b.cx-px,(b.cy-py)*bias,b.cz-pz));
    }

    evaluateChunks(player, renderer) {
        const pos = this.world.getChunkCoords(...player.pos);
        const threshold = this.world.renderDistance;
        this.generateNewChunks(pos, threshold + 1);
        this.updateResidency(pos, threshold, renderer);
    }

    generateNewChunks(pos, threshold) {
        const [px, py, pz] = pos;
        for (let cx=px-threshold; cx<=px+threshold; cx++) for (let cy=py-threshold; cy<=py+threshold; cy++) for (let cz=pz-threshold; cz<=pz+threshold; cz++) {
            if (!this.isChunkInThreshold([cx,cy,cz], pos, threshold)) continue;
            const chunk = this.createChunk(cx,cy,cz);
            if (chunk.dataStatus === 'missing') this.generator.requestNewChunk(cx,cy,cz);
        }
    }

    updateResidency(pos, threshold, renderer) {
        // Residency controls GPU allocation; CPU block data remains available
        // while cached so a nearby chunk can be restored without regeneration.
        for (const [key, chunk] of this.chunks) {
            const active = this.isChunkInThreshold([chunk.cx,chunk.cy,chunk.cz], pos, threshold);
            if (active) {
                chunk.residency = 'active';
                if (chunk.meshStatus === 'ready' && chunk.geometry && !renderer.hasChunk(key)) renderer.uploadChunk(chunk, false);
            } else if (chunk.residency === 'active') {
                chunk.residency = 'cached';
                renderer.deleteChunk(key);
            }
        }
    }

    isChunkInThreshold([cx,cy,cz], [px,py,pz], threshold) {
        const dx=cx-px, dy=cy-py, dz=cz-pz;
        return dx*dx + dy*dy + dz*dz <= threshold*threshold;
    }

    clear(renderer) {
        for (const key of this.chunks.keys()) renderer.deleteChunk(key);
        this.chunks.clear();
        this.dirtyChunkQueue.length = 0;
        this.queuedChunks.clear();
        this.generator.requestQueue.clear();
    }
}
