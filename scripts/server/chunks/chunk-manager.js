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

    failGenerationRequest(request) {
        const chunk = this.chunks.get(request.key);
        if (chunk === request.chunk && chunk.dataStatus === 'generating') chunk.dataStatus = 'missing';
    }

    invalidateNeighbors(chunk) {
        // Meshing reads neighboring blocks for face culling and AO, including
        // diagonal samples at chunk edges and corners.
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;
                    const neighbor = this.getChunk(chunk.cx + dx, chunk.cy + dy, chunk.cz + dz);
                    if (neighbor?.dataStatus === 'ready') neighbor.invalidateMesh();
                }
            }
        }
    }

    update(players, renderer, crossed, deltaScale = 1) {
        const activePlayers = [...players].filter(player => player?.pos);
        if (activePlayers.length === 0) {
            this.generator.setPlayerPositions([]);
            this.generator.pruneOutsideRenderDistance([], this.world.renderDistance);
            for (const [key, chunk] of this.chunks) {
                if (chunk.dataStatus === 'ready') {
                    if (chunk.residency === 'active') renderer.deleteChunk(key);
                    chunk.residency = 'cached';
                } else {
                    this.chunks.delete(key);
                }
            }
            this.dirtyChunkQueue.length = 0;
            this.queuedChunks.clear();
            return;
        }

        const playerChunkPositions = activePlayers.map(player => this.world.getChunkCoords(...player.pos));
        this.generator.setPlayerPositions(activePlayers.map(player => player.pos));
        this.pruneUnneededGeneration(playerChunkPositions);
        if (crossed || !this.hasActiveChunks()) this.evaluateChunks(playerChunkPositions, renderer);
        this.generator.processNextRequests();
        this.addDirtyChunksToQueue();
        this.updateQueue(playerChunkPositions, renderer, 4);
        for (const chunk of this.chunks.values()) {
            chunk.fade = Math.min(chunk.maxFade, chunk.fade + deltaScale);
            if (chunk.residency === 'active' && chunk.dataStatus === 'missing') {
                this.generator.requestNewChunk(chunk.cx, chunk.cy, chunk.cz);
            }
        }
    }

    pruneUnneededGeneration(playerChunkPositions) {
        const renderDistance = this.world.renderDistance;
        this.generator.pruneOutsideRenderDistance(playerChunkPositions, renderDistance);

        // A queued or in-flight chunk without block data has no value outside
        // the render range. Removing it also makes late worker replies stale.
        for (const [key, chunk] of this.chunks) {
            if (chunk.dataStatus === 'ready' || this.isChunkNearAnyPlayer(
                [chunk.cx, chunk.cy, chunk.cz], playerChunkPositions, renderDistance
            )) continue;
            this.chunks.delete(key);
        }
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

    updateQueue(playerChunkPositions, renderer, timeBudgetMs = 4) {
        this.sortQueue(playerChunkPositions);
        let count = 0;
        const startTime = performance.now();
        while (this.dirtyChunkQueue.length && (count === 0 || performance.now() - startTime < timeBudgetMs)) {
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

    sortQueue(playerChunkPositions) {
        // A chunk's priority is its distance to the nearest connected player.
        const distanceToNearestPlayer = chunk => {
            let nearestDistance = Infinity;
            for (const [px, py, pz] of playerChunkPositions) {
                nearestDistance = Math.min(nearestDistance,
                    Math.hypot(chunk.cx - px, chunk.cy - py, chunk.cz - pz));
            }
            return nearestDistance;
        };
        this.dirtyChunkQueue.sort((a, b) => distanceToNearestPlayer(a) - distanceToNearestPlayer(b));
    }

    evaluateChunks(playerChunkPositions, renderer) {
        const threshold = this.world.renderDistance;
        this.generateNewChunks(playerChunkPositions, threshold);
        this.updateResidency(playerChunkPositions, threshold, renderer);
    }

    generateNewChunks(playerChunkPositions, threshold) {
        for (const pos of playerChunkPositions) {
            const [px, py, pz] = pos;
            for (let cx = px - threshold; cx <= px + threshold; cx++) {
                for (let cy = py - threshold; cy <= py + threshold; cy++) {
                    for (let cz = pz - threshold; cz <= pz + threshold; cz++) {
                        if (!this.isChunkInThreshold([cx, cy, cz], pos, threshold)) continue;
                        const chunk = this.createChunk(cx, cy, cz);
                        if (chunk.dataStatus === 'missing') this.generator.requestNewChunk(cx, cy, cz);
                    }
                }
            }
        }
    }

    updateResidency(playerChunkPositions, threshold, renderer) {
        // Residency controls GPU allocation; CPU block data remains available
        // while cached so a nearby chunk can be restored without regeneration.
        for (const [key, chunk] of this.chunks) {
            const active = this.isChunkNearAnyPlayer(
                [chunk.cx, chunk.cy, chunk.cz], playerChunkPositions, threshold
            );
            if (active) {
                chunk.residency = 'active';
                if (chunk.meshStatus === 'ready' && chunk.geometry && !renderer.hasChunk(key)) renderer.uploadChunk(chunk, false);
            } else if (chunk.residency === 'active') {
                chunk.residency = 'cached';
                renderer.deleteChunk(key);
            }
        }
    }

    isChunkInThreshold([cx, cy, cz], [px, py, pz], threshold) {
        const dx = cx - px, dy = cy - py, dz = cz - pz;
        return dx * dx + dy * dy + dz * dz <= threshold * threshold;
    }

    isChunkNearAnyPlayer(chunkPosition, playerChunkPositions, threshold) {
        return playerChunkPositions.some(position => this.isChunkInThreshold(chunkPosition, position, threshold));
    }

    clear(renderer) {
        for (const key of this.chunks.keys()) renderer.deleteChunk(key);
        this.chunks.clear();
        this.dirtyChunkQueue.length = 0;
        this.queuedChunks.clear();
        this.generator.requestQueue.clear();
    }
}
