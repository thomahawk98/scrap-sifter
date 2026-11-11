import { getBlockDropType } from './block-stats.js';
import physics from '../systems/physics.js';
import { getViewBasis } from '../systems/view-basis.js';
import EntityManager from '../entities/entity-manager.js';
import PlayerMovementTracker from '../systems/player-movement-tracker.js';
import WorldAudioSystem from '../systems/world-audio.js';

export default class World {
    constructor() {
        this.seed = Math.round(Math.random() * 10000);
        this.time = 0;
        this.daylight = 1;
        this.renderDistance = 5; // in chunks

        this.CHUNK_SIZE = 16;
        this.DAY_LENGTH_SECONDS = 600; // 10 minutes
        this.BRIGHTNESS_AT_NOON = 2;

        this.chunks = new Map();
        this.entities = new EntityManager();
        this.players = new Map();
        this.playerTrackers = new Map();
        this.audio = new WorldAudioSystem();
        this.onBlockChanged = () => {};

        this.update();
    }

    update(deltaSeconds = 1 / 60) {
        this.time += deltaSeconds;
        this.daylight = 1; // always day

        // update daylight
        /*
        const frequency = this.DAY_LENGTH_SECONDS;
        const amplitude = this.BRIGHTNESS_AT_NOON;
        const light = amplitude * Math.sin(this.time * Math.PI / frequency);
        this.daylight = light;
        */
    }

    getChunkKey(cx, cy, cz) {
        return `${cx},${cy},${cz}`;
    }

    addPlayer(player) {
        this.entities.add(player);
        this.players.set(player.id, player);
        this.playerTrackers.set(player.id, new PlayerMovementTracker(player, this));
        return player;
    }

    removePlayer(playerOrId) {
        const playerId = typeof playerOrId === 'object' ? playerOrId.id : playerOrId;
        this.playerTrackers.delete(playerId);
        this.players.delete(playerId);
        return this.entities.remove(playerId);
    }

    getPlayers() {
        return this.players.values();
    }

    updatePlayerTrackers() {
        for (const tracker of this.playerTrackers.values()) tracker.update();
    }

    consumePlayerChunkBorderCrossings() {
        let crossed = false;
        for (const tracker of this.playerTrackers.values()) {
            crossed = tracker.consumeChunkBorderCrossing() || crossed;
        }
        return crossed;
    }

    getChunkCoords(x, y, z) {
        return [x, y, z].map(a => Math.floor(a / this.CHUNK_SIZE));
    };

    getChunk(cx, cy, cz) {
        const key = this.getChunkKey(cx, cy, cz);

        const chunk = this.chunks.get(key);
        return this.validateChunkData(chunk) ? chunk : null;
    }

    validateChunkData(chunk) {
        return !!chunk && chunk.dataStatus === 'ready' && !!chunk.blocks;
    }

    getBlock(x, y, z) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);

        //get chunk
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return { pos: [x, y, z], type: 'air' };

        //local cors
        const lx = Math.modulo(x, this.CHUNK_SIZE);
        const ly = Math.modulo(y, this.CHUNK_SIZE);
        const lz = Math.modulo(z, this.CHUNK_SIZE);

        //get block
        const block = chunk.getBlock(lx, ly, lz);
        if (!block) return { pos: [x, y, z], type: 'air' };
        return { pos: [x, y, z], ...block };
    }

    setBlock(x, y, z, block) {
        const [cx, cy, cz] = this.getChunkCoords(x, y, z);
        const chunk = this.getChunk(cx, cy, cz);
        if (!chunk) return false;

        //local cors
        const lx = Math.modulo(x, this.CHUNK_SIZE);
        const ly = Math.modulo(y, this.CHUNK_SIZE);
        const lz = Math.modulo(z, this.CHUNK_SIZE);

        //set block
        const success = chunk.setBlock(lx, ly, lz, block);

        if (success) this.onBlockChanged({ chunkPos: [cx, cy, cz], blockPos: [x, y, z], block });

        return success;
    };

    breakBlock(hit, player) {
        const block = this.getBlock(...hit.position);
        if (!block) return console.log('no block found at', hit.position);

        this.setBlock(...hit.position, { type: 'air' });

        player.attackReload = 10;
        player.outlinedBlock = null;

        //add block to player inventory
        const dropType = getBlockDropType(block.type);
        const item = { type: dropType, amount: 1 };
        player.inventory.addItem(item);

        return true;
    }


    placeBlock(hit, player) {
        const item = player.inventory.getSelectedItem();
        if (!item || item.kind === 'usable' || item.amount <= 0) return false;

        //find where the new block will go
        const [x, y, z] = hit.position;
        const [nx, ny, nz] = hit.normal;
        const pos = [x + nx, y + ny, z + nz];

        const block = {
            pos, type: item.type,
        };

        const collidesWithSelf = physics.anyEntityCollidesWithBlock(block, [player]);
        if (collidesWithSelf) {
            const { forward } = getViewBasis(player.orientation);
            const dir = [Math.round(forward[0]), 0, Math.round(forward[2])];
            block.pos = [block.pos[0] + dir[0], block.pos[1] - 1, block.pos[2] + dir[2]];
        }

        const valid = this.validateBlockPlacement(block, player);
        if (valid) {
            player.interactReload = 5;
            item.amount--;

            return true;
        }
    }

    validateBlockPlacement(block, player) {
        const [x, y, z] = block.pos;

        // check to make sure player has the block in their inventory
        const item = player.inventory.getSelectedItem();
        if (!item || item.amount <= 0 || item.type !== block.type) return false;

        // check if a block is already at this position
        const existing = this.getBlock(x, y, z);
        if (existing && existing.type !== 'air') return false;

        // check if block is inside other entities
        const entities = [...this.players.values()];
        if (!entities.includes(player)) entities.push(player);
        const collides = physics.anyEntityCollidesWithBlock(block, entities);
        if (collides) return false;

        //add the block to the world
        this.setBlock(x, y, z, block);

        return true;
    }
}
