import InputController from './input.js';
import Camera from './render/camera.js';
import Hud from './render/hud.js';
import InventoryView from './ui/inventory-view.js';
import ClientWorld from './world.js';
import ClientChunkManager from './chunk-manager.js';
import AudioProcessor from './audio/audio-processor.js';
import ParticleSystem from './systems/particle-system.js';
import { getViewBasis, reverseView } from './shared/view-basis.js';
import { getBlockFaceColor } from './shared/block-stats.js';

const CHUNK_MAP_REFRESH_MILLISECONDS = 100;
const INPUT_SEND_MILLISECONDS = 50;
const ENTITY_POSITION_INTERPOLATION = 0.15;

// A User owns one local view and its socket connection; authoritative gameplay
// and shared world mutations are received from the server as snapshots/events.
export default class User {
    constructor({ socket, renderer, glCanvas, hudCanvas, keyBindings = {}, mouseBindings = {} }) {
        this.socket = socket;
        this.renderer = renderer;
        this.world = new ClientWorld();
        this.playerId = null;
        this.player = this.world.createLocalPlayer();
        this.particles = new ParticleSystem();
        this.inventoryView = new InventoryView(
            this.player,
            slot => socket.emit('inventory:click', slot),
            renderer.textureAtlas,
        );
        this.camera = new Camera(this.player, 90, 0.1, 200, { getViewBasis, reverseView });
        this.hud = new Hud(hudCanvas, { getViewBasis });
        this.audio = new AudioProcessor({
            world: this.world,
            getListener: () => ({
                position: this.player.head?.pos ?? this.player.pos,
                right: getViewBasis(this.player.orientation).right,
            }),
        });
        this.chunkManager = new ClientChunkManager(this.world, socket, renderer);
        this.lastChunkMapRefresh = 0;
        this.lastInputSent = 0;
        this.previousUpdateTime = null;
        this.updateInventory = deltaScale => this.inventoryView.update(this.hud.canvas, deltaScale);
        this.input = new InputController({
            canvas: glCanvas, player: this.player, camera: this.camera, keyBindings, mouseBindings,
            onClearChunks: () => this.chunkManager.clear(),
            changeRenderDistance: delta => {
                this.world.renderDistance += delta;
                this.world.renderDistance = Math.clamp(this.world.renderDistance, 2, 12);
                this.socket.emit('render-distance:set', this.world.renderDistance);
                this.chunkManager.lastCenter = null;
            },
            clampRenderDistance: () => { this.world.renderDistance = Math.clamp(this.world.renderDistance, 2, 12); },
            inspectChunk: position => console.log(this.world.getChunk(...this.world.getChunkCoords(...position))),
            inspectChunks: () => console.log(this.world.chunks),
        });
        this.player.inputs = this.input;
        this.bindSocketEvents();
    }

    bindSocketEvents() {
        // start of a new game session
        this.socket.on('session:ready', session => {
            // clear the previous session data
            this.chunkManager.clear();
            this.world.entities.clear();

            // update the world with the session data
            this.world.seed = session.world.seed;
            this.world.renderDistance = session.world.renderDistance;

            // add player from session
            this.playerId = session.playerId;
            this.player.id = this.playerId;
            this.world.entities.set(this.playerId, this.player);

            // add other entities from the session
            for (const entity of session.entities)
                this.world.upsertEntity(entity, this.playerId);

            // Keep the server's per-player request limit aligned with this view.
            this.socket.emit('render-distance:set', this.world.renderDistance);
        });
        this.socket.on('player:joined', player => this.world.upsertEntity(player, this.playerId));
        this.socket.on('player:left', ({ id }) => this.world.removeEntity(id));
        this.socket.on('chunk:data', data => this.chunkManager.receive(data));
        this.socket.on('block:update', change => {
            if (change.block?.type && change.block.type !== 'air') this.renderer.ensureBlockTexture(change.block.type);
            if (change.previousBlock && change.block?.type === 'air' && change.previousBlock.type !== 'air') {
                const position = change.blockPos.map(value => value + 0.5);
                this.particles.spawnBlockBreak(position, getBlockFaceColor(change.previousBlock.type));
            }
            this.chunkManager.onBlockChanged(change);
        });
        this.socket.on('particle:spawn', event => this.particles.handleEvent(event));
        this.socket.on('audio:play', event => this.audio.play(event));
        this.socket.on('world:snapshot', snapshot => {
            this.world.daylight = snapshot.daylight;
            const visibleIds = new Set();
            for (const entity of snapshot.entities) {
                visibleIds.add(entity.id);
                this.world.upsertEntity(entity, this.playerId);
            }

            // Remove entities omitted from this client's visibility snapshot.
            for (const id of this.world.entities.keys()) if (!visibleIds.has(id)) this.world.removeEntity(id);
        });
        this.socket.on('disconnect', () => {
            this.playerId = null;
            this.chunkManager.clear();
            this.world.entities.clear();
            this.player.id = -1;
            this.world.entities.set(-1, this.player);
        });
    }

    get paused() { return this.input.paused; }

    update(timestamp) {
        const deltaScale = this.previousUpdateTime === null
            ? 1
            : Math.min(0.1, (timestamp - this.previousUpdateTime) / 1000) * 60;
        this.previousUpdateTime = timestamp;
        this.particles.update(deltaScale);
        this.updateInventory(deltaScale);
        if (this.playerId !== null) this.chunkManager.update(this.player);
        if (timestamp - this.lastInputSent >= INPUT_SEND_MILLISECONDS && this.playerId !== null) {
            this.socket.emit('player:input', this.input.snapshot());
            this.lastInputSent = timestamp;
        }
        // Ease every replica, including the local player, toward authoritative
        // server positions instead of snapping backward on each snapshot.
        // This smooths the network snapshots while keeping movement responsive.
        for (const entity of this.world.entities.values()) {
            if (!entity.targetPos) continue;
            for (let axis = 0; axis < 3; axis++) {
                entity.pos[axis] += (entity.targetPos[axis] - entity.pos[axis]) * ENTITY_POSITION_INTERPOLATION;
            }
        }
        this.player.head.pos = this.player.pos;
        this.camera.update();
    }

    updateMaps(timestamp) {
        if (timestamp - this.lastChunkMapRefresh < CHUNK_MAP_REFRESH_MILLISECONDS) return;
        for (const map of this.hud.maps) map.uploadData(this.player.pos, this.world);
        this.lastChunkMapRefresh = timestamp;
    }

    render() { this.renderer.render(this.world, this.camera, this.player, this.particles); }

    draw(fps) {
        const player = this.player, world = this.world, chunkManager = this.chunkManager;
        const debugTexts = [
            `${Math.round(player.pos[0])}, ${Math.round(player.pos[1])}, ${Math.round(player.pos[2])}`,
            `FPS: ${fps}`, `Health: ${player.health}/${player.maxHealth}`, '',
            `FOV: ${this.camera.fov}`, `View: ${this.camera.orientation.map(value => Math.round(value * 100) / 100).join(', ')}`, '',
            `Seed: ${world.seed}`, `Render Distance: ${world.renderDistance}`, '',
            `Resident Chunks: ${world.chunks.size}`, `Active Chunks: ${chunkManager.getActiveChunkCount()}`,
            `Unmeshed Chunks: ${chunkManager.dirty.length}`, `Requested Chunks: ${chunkManager.getPendingCount()}`,
        ];
        this.hud.draw(this.paused, debugTexts, player, this.input, this.inventoryView);
    }
}
