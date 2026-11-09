import InputController from './input.js';
import Camera from './render/camera.js';
import Hud from './render/hud.js';
import InventoryView from './ui/inventory-view.js';
import ClientWorld from './world.js';
import ClientChunkManager from './chunk-manager.js';
import { getViewBasis, reverseView } from './shared/view-basis.js';

const CHUNK_MAP_REFRESH_MILLISECONDS = 100;
const INPUT_SEND_MILLISECONDS = 50;
const ENTITY_POSITION_INTERPOLATION = 0.1;

// A User owns one local view and its socket connection; authoritative gameplay
// and shared world mutations are received from the server as snapshots/events.
export default class User {
    constructor({ socket, renderer, glCanvas, hudCanvas, keyBindings = {}, mouseBindings = {} }) {
        this.socket = socket;
        this.renderer = renderer;
        this.world = new ClientWorld();
        this.playerId = null;
        this.player = this.world.createLocalPlayer();
        this.inventoryView = new InventoryView(this.player);
        this.camera = new Camera(this.player, 90, 0.1, 200, { getViewBasis, reverseView });
        this.hud = new Hud(hudCanvas, { getViewBasis });
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
        this.socket.on('session:ready', session => {
            this.chunkManager.clear();
            this.world.entities.clear();
            this.world.entities.set(-1, this.player);
            this.playerId = session.playerId;
            this.world.seed = session.world.seed;
            this.world.renderDistance = session.world.renderDistance;
            this.player.id = this.playerId;
            this.world.entities.delete(-1);
            this.world.entities.set(this.playerId, this.player);
            for (const entity of session.entities) this.world.upsertEntity(entity, this.playerId);
            this.socket.emit('render-distance:set', this.world.renderDistance);
        });
        this.socket.on('player:joined', player => this.world.upsertEntity(player, this.playerId));
        this.socket.on('player:left', ({ id }) => this.world.removeEntity(id));
        this.socket.on('chunk:data', data => this.chunkManager.receive(data));
        this.socket.on('block:update', change => this.chunkManager.onBlockChanged(change));
        this.socket.on('world:snapshot', snapshot => {
            this.world.daylight = snapshot.daylight;
            const visibleIds = new Set();
            for (const entity of snapshot.entities) {
                visibleIds.add(entity.id);
                this.world.upsertEntity(entity, this.playerId);
            }
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
        this.updateInventory(deltaScale);
        if (this.playerId !== null) this.chunkManager.update(this.player);
        if (timestamp - this.lastInputSent >= INPUT_SEND_MILLISECONDS && this.playerId !== null) {
            this.socket.emit('player:input', this.input.snapshot());
            this.lastInputSent = timestamp;
        }
        // Ease every replica, including the local player, toward authoritative
        // server positions instead of snapping backward on each snapshot.
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

    render() { this.renderer.render(this.world, this.camera, this.player); }

    draw(fps) {
        const player = this.player, world = this.world, chunkManager = this.chunkManager;
        const debugTexts = [
            `${Math.round(player.pos[0])}, ${Math.round(player.pos[1])}, ${Math.round(player.pos[2])}`,
            `FPS: ${fps}`, `On block: ${player.onBlock}`, '',
            `FOV: ${this.camera.fov}`, `View: ${this.camera.orientation.map(value => Math.round(value * 100) / 100).join(', ')}`, '',
            `Seed: ${world.seed}`, `Render Distance: ${world.renderDistance}`, '',
            `Resident Chunks: ${world.chunks.size}`, `Active Chunks: ${chunkManager.getActiveChunkCount()}`,
            `Unmeshed Chunks: ${chunkManager.dirty.length}`, `Requested Chunks: ${chunkManager.getPendingCount()}`,
        ];
        this.hud.draw(this.paused, debugTexts, player, this.input, this.inventoryView);
    }
}
