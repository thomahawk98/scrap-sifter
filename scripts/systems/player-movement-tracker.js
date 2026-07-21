export default class PlayerMovementTracker {
    constructor(player, world) {
        this.player = player;
        this.world = world;

        this.prevPlayerPos = player.pos;
        this.playerCrossedChunkBorder = false;
    }

    update() {
        const chunkPos = this.world.getChunkCoords(...this.player.pos);
        const prevChunkPos = this.world.getChunkCoords(...this.prevPlayerPos);

        this.playerCrossedChunkBorder = JSON.stringify(chunkPos) !== JSON.stringify(prevChunkPos);
        this.prevPlayerPos = this.player.pos;
    }
}