export default class PlayerMovementTracker {
    constructor(player, world) {
        this.player = player;
        this.world = world;

        this.prevChunkPos = world.getChunkCoords(...player.pos);
        this.playerCrossedChunkBorder = false;
    }

    update() {
        const chunkPos = this.world.getChunkCoords(...this.player.pos);
        if (chunkPos.some((coordinate, axis) => coordinate !== this.prevChunkPos[axis])) {
            this.playerCrossedChunkBorder = true;
            this.prevChunkPos = chunkPos;
        }
    }

    consumeChunkBorderCrossing() {
        const crossed = this.playerCrossedChunkBorder;
        this.playerCrossedChunkBorder = false;
        return crossed;
    }
}
