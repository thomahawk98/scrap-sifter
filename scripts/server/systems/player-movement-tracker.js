export default class PlayerMovementTracker {
    // Track one player's chunk coordinate changes for chunk-window updates.
    constructor(player, world) {
        this.player = player;
        this.world = world;

        this.prevChunkPos = world.getChunkCoords(...player.pos);
        this.playerCrossedChunkBorder = false;
    }

    // Latch a crossing until the chunk manager consumes it.
    update() {
        const chunkPos = this.world.getChunkCoords(...this.player.pos);
        if (chunkPos.some((coordinate, axis) => coordinate !== this.prevChunkPos[axis])) {
            this.playerCrossedChunkBorder = true;
            this.prevChunkPos = chunkPos;
        }
    }

    // Read and clear the crossing latch in one operation.
    consumeChunkBorderCrossing() {
        const crossed = this.playerCrossedChunkBorder;
        this.playerCrossedChunkBorder = false;
        return crossed;
    }
}
