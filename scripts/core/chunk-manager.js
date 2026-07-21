export default class ChunkManager {
    constructor() {
        this.dirtyChunkQueue = [];
    }

    updateQueue(world, player, renderer, maxChunksPerFrame = 1) {
        let count = 0;

        const pos = world.getChunkCoords(...player.pos);

        //sort queue by distance to player
        this.dirtyChunkQueue.sort((a, b) => {
            const aDist = Math.hypot(a.cx - pos[0], a.cy - pos[1], a.cz - pos[2]);
            const bDist = Math.hypot(b.cx - pos[0], b.cy - pos[1], b.cz - pos[2]);
            return aDist - bDist;
        });

        //upload n chunks per frame
        while (this.dirtyChunkQueue.length > 0 && count < maxChunksPerFrame) {
            const chunk = this.dirtyChunkQueue.shift();

            chunk.rebuildGeometry(world);
            renderer.uploadChunk(chunk);
            chunk.dirty = false;

            count++;
        }
    }
}