import ChunkMesher from './chunk-mesher.js';

const CHUNK_SIZE = 16;
const UNKNOWN_VOXEL = 2;

// Tracks the local view radius, requests server voxel data, and builds/uploads
// meshes without sending render geometry over the network.
export default class ClientChunkManager {
    constructor(world, socket, renderer, {
        workerCount = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 4) - 1)),
    } = {}) {
        this.world = world;
        this.socket = socket;
        this.renderer = renderer;
        this.mesher = new ChunkMesher();
        this.desired = new Set();
        this.dirty = [];
        this.queued = new Set();
        this.lastCenter = null;
        this.lastDistance = null;
        this.pendingRequest = [];
        this.pendingRelease = [];
        this.requested = new Set();
        // Meshing runs off the render thread so large chunks cannot stall input.
        this.meshWorkers = Array.from({ length: workerCount }, () => {
            const slot = { worker: new Worker(new URL('./chunk-mesher-worker.js', import.meta.url), { type: 'module' }), busy: false, chunk: null };
            slot.worker.onmessage = ({ data }) => this.handleMeshResult(slot, data);
            slot.worker.onerror = error => this.handleMeshError(slot, error);
            return slot;
        });
        this.socket.on('chunk:reject', key => this.handleRejectedRequest(key));
    }

    receive(data) {
        const key = this.world.getChunkKey(...data.chunkPos);
        this.requested.delete(key);
        if (!this.desired.has(key)) {
            this.pendingRelease.push(key);
            return;
        }
        // Socket.IO may reconstruct a typed-array attachment as an ArrayBuffer
        // or byte view. Restore the registry's 16-bit voxel IDs before meshing.
        data.voxels = normalizeVoxelData(data.voxels);
        this.world.receiveChunk(data);
        const chunk = this.world.getChunk(...data.chunkPos);
        if (chunk.empty) {
            chunk.geometry = { vertices: new Float32Array(), indices: new Uint32Array() };
            chunk.meshStatus = 'ready';
        } else this.queue(chunk);
        const [cx, cy, cz] = data.chunkPos;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            if (!dx && !dy && !dz) continue;
            const neighbor = this.world.getChunk(cx + dx, cy + dy, cz + dz);
            if (neighbor?.dataStatus === 'ready' && !neighbor.empty) this.queue(neighbor);
        }
    }

    handleRejectedRequest(key) {
        this.requested.delete(key);
        // A stale position may put a boundary request just outside the server's
        // radius. Retry after snapshots have had time to update the local center.
        setTimeout(() => {
            if (!this.desired.has(key) || this.world.chunks.has(key) || this.requested.has(key)) return;
            this.requested.add(key);
            this.pendingRequest.push(key);
        }, 250);
    }

    update(player) {
        if (!player?.pos) return;
        const center = this.world.getChunkCoords(...player.pos);
        if (!this.lastCenter || center.some((value, i) => value !== this.lastCenter[i]) || this.lastDistance !== this.world.renderDistance) {
            this.refreshDesired(center);
        }
        this.sendPending();
        this.meshBudget();
        for (const chunk of this.world.chunks.values()) chunk.fade = Math.min(chunk.maxFade, chunk.fade + 1);
    }

    refreshDesired(center) {
        const next = new Set(), distance = this.world.renderDistance;
        for (let cx = center[0] - distance; cx <= center[0] + distance; cx++)
            for (let cy = center[1] - distance; cy <= center[1] + distance; cy++)
                for (let cz = center[2] - distance; cz <= center[2] + distance; cz++) {
                    const dx = cx - center[0], dy = cy - center[1], dz = cz - center[2];
                    if (dx * dx + dy * dy + dz * dz <= distance * distance) next.add(this.world.getChunkKey(cx, cy, cz));
                }
        for (const key of next) {
            if (!this.requested.has(key) && !this.world.chunks.has(key)) {
                this.pendingRequest.push(key);
                this.requested.add(key);
            }
        }
        const released = [...this.desired].filter(key => !next.has(key));
        this.pendingRelease.push(...released);
        for (const key of released) this.requested.delete(key);
        this.pendingRequest = this.pendingRequest.filter(key => next.has(key));
        for (const key of next) {
            const chunk = this.world.chunks.get(key);
            if (chunk) chunk.residency = 'active';
        }
        const removedPositions = [];
        for (const key of this.desired) if (!next.has(key)) {
            this.renderer.deleteChunk(key);
            this.world.chunks.delete(key);
            removedPositions.push(key.split(',').map(Number));
        }
        // Remaining edge chunks now have unknown neighbors where removed data
        // used to be. Rebuild those meshes so they stop drawing stale border faces.
        for (const [cx, cy, cz] of removedPositions) {
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                if (!dx && !dy && !dz) continue;
                const neighborKey = this.world.getChunkKey(cx + dx, cy + dy, cz + dz);
                const neighbor = next.has(neighborKey) ? this.world.chunks.get(neighborKey) : null;
                if (neighbor?.dataStatus === 'ready' && !neighbor.empty) {
                    neighbor.invalidateMesh();
                    this.queue(neighbor);
                }
            }
        }
        this.desired = next;
        this.lastCenter = center;
        this.lastDistance = distance;
    }

    sendPending() {
        const MAX_BATCH = 256;
        this.pendingRelease = this.pendingRelease.filter(key => !this.desired.has(key));
        if (this.pendingRequest.length) {
            const batch = this.pendingRequest.splice(0, MAX_BATCH).map(key => key.split(',').map(Number));
            this.socket.emit('chunks:request', batch);
        }
        if (this.pendingRelease.length) this.socket.emit('chunks:release', this.pendingRelease.splice(0, MAX_BATCH));
    }

    queue(chunk) {
        if (this.queued.has(chunk)) return;
        chunk.meshStatus = 'dirty';
        this.dirty.push(chunk);
        this.queued.add(chunk);
    }

    meshBudget() {
        for (const slot of this.meshWorkers) {
            if (slot.busy) continue;
            let chunk = null;
            while (this.dirty.length && !chunk) {
                const candidate = this.dirty.shift();
                this.queued.delete(candidate);
                if (this.world.getChunk(candidate.cx, candidate.cy, candidate.cz) === candidate &&
                    candidate.residency === 'active' && candidate.dataStatus === 'ready') chunk = candidate;
            }
            if (!chunk) break;

            const key = this.world.getChunkKey(chunk.cx, chunk.cy, chunk.cz);
            const revision = chunk.meshRevision;
            const blocks = chunk.blocks.slice();
            const borderOccupancy = this.createBorderOccupancy(chunk);
            slot.busy = true;
            slot.chunk = chunk;
            chunk.meshStatus = 'building';
            slot.worker.postMessage({ key, cx: chunk.cx, cy: chunk.cy, cz: chunk.cz, revision, blocks, borderOccupancy },
                [blocks.buffer, borderOccupancy.buffer]);
        }
    }

    createBorderOccupancy(chunk) {
        const paddedSize = CHUNK_SIZE + 2;
        const paddedPlane = paddedSize * paddedSize;
        const occupancy = new Uint8Array(paddedPlane * paddedSize);
        const baseX = chunk.cx * CHUNK_SIZE, baseY = chunk.cy * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
        for (let z = -1; z <= CHUNK_SIZE; z++) for (let y = -1; y <= CHUNK_SIZE; y++) for (let x = -1; x <= CHUNK_SIZE; x++) {
            if (x >= 0 && x < CHUNK_SIZE && y >= 0 && y < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) continue;
            const state = this.world.getVoxelState(baseX + x, baseY + y, baseZ + z);
            occupancy[(x + 1) + (y + 1) * paddedSize + (z + 1) * paddedPlane] =
                state === null ? UNKNOWN_VOXEL : state ? 1 : 0;
        }
        return occupancy;
    }

    handleMeshResult(slot, { key, revision, geometry }) {
        const chunk = slot.chunk;
        slot.busy = false;
        slot.chunk = null;
        if (chunk && this.world.getChunk(chunk.cx, chunk.cy, chunk.cz) === chunk &&
            this.desired.has(key) && chunk.meshRevision === revision) {
            chunk.geometry = geometry;
            chunk.meshStatus = 'ready';
            this.renderer.uploadChunk(chunk, !this.renderer.hasChunk(key));
        } else if (chunk && this.world.getChunk(chunk.cx, chunk.cy, chunk.cz) === chunk &&
            this.desired.has(this.world.getChunkKey(chunk.cx, chunk.cy, chunk.cz))) {
            this.queue(chunk);
        }
        this.meshBudget();
    }

    handleMeshError(slot, error) {
        console.error('Chunk meshing worker failed; using main-thread fallback.', error);
        const chunk = slot.chunk;
        slot.busy = false;
        slot.chunk = null;
        if (chunk && this.world.getChunk(chunk.cx, chunk.cy, chunk.cz) === chunk && chunk.dataStatus === 'ready') {
            const key = this.world.getChunkKey(chunk.cx, chunk.cy, chunk.cz);
            chunk.geometry = this.mesher.buildMesh(chunk, this.world);
            chunk.meshStatus = 'ready';
            this.renderer.uploadChunk(chunk, !this.renderer.hasChunk(key));
        }
        this.meshBudget();
    }

    onBlockChanged(change) {
        this.world.setBlock(...change.blockPos, change.block);
        const [cx, cy, cz] = change.chunkPos;
        const [lx, ly, lz] = change.blockPos.map(value => modulo(value, CHUNK_SIZE));
        const axisOffsets = [
            lx === 0 ? [-1, 0] : lx === CHUNK_SIZE - 1 ? [0, 1] : [0],
            ly === 0 ? [-1, 0] : ly === CHUNK_SIZE - 1 ? [0, 1] : [0],
            lz === 0 ? [-1, 0] : lz === CHUNK_SIZE - 1 ? [0, 1] : [0],
        ];
        for (const dx of axisOffsets[0]) for (const dy of axisOffsets[1]) for (const dz of axisOffsets[2]) {
            const chunk = this.world.getChunk(cx + dx, cy + dy, cz + dz);
            if (chunk?.dataStatus === 'ready') this.queue(chunk);
        }
    }

    getActiveChunkCount() { return [...this.desired].filter(key => this.world.chunks.has(key)).length; }
    getPendingCount() { return this.requested.size + this.dirty.length + this.meshWorkers.filter(slot => slot.busy).length; }
    clear() {
        const releases = [...new Set([...this.desired, ...this.pendingRelease])];
        if (this.socket.connected) {
            for (let i = 0; i < releases.length; i += 512) this.socket.emit('chunks:release', releases.slice(i, i + 512));
        }
        for (const key of this.world.chunks.keys()) this.renderer.deleteChunk(key);
        this.world.chunks.clear(); this.desired.clear(); this.dirty.length = 0; this.queued.clear();
        this.lastCenter = null; this.pendingRequest.length = 0; this.pendingRelease.length = 0; this.requested.clear();
    }
}

const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

function normalizeVoxelData(voxels) {
    if (voxels instanceof Uint16Array) return voxels;
    if (voxels instanceof ArrayBuffer) return new Uint16Array(voxels);
    if (Array.isArray(voxels)) return Uint16Array.from(voxels);
    if (ArrayBuffer.isView(voxels)) {
        return new Uint16Array(voxels.buffer.slice(voxels.byteOffset, voxels.byteOffset + voxels.byteLength));
    }
    if (voxels?.type === 'Buffer' && Array.isArray(voxels.data)) {
        return new Uint16Array(new Uint8Array(voxels.data).buffer);
    }
    throw new TypeError('Chunk data did not contain a valid voxel buffer.');
}
