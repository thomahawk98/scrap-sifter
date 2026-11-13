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
import { raycast } from './shared/raycast.js';

const INPUT_SEND_MILLISECONDS = 50;
const ENTITY_POSITION_INTERPOLATION = 0.15;

export default class User {
    constructor({ socket, renderer, glCanvas, hudCanvas, assetLoader = null, keyBindings = {}, mouseBindings = {} }) {
        this.socket = socket;
        this.renderer = renderer;

        // client side world
        this.world = new ClientWorld();
        this.chunkManager = new ClientChunkManager(this.world, socket, renderer);
        this.particles = new ParticleSystem();

        // player and inputs
        this.playerId = null;
        this.player = this.world.createLocalPlayer();
        this.input = new InputController({
            canvas: glCanvas, player: this.player, camera: this.camera, keyBindings, mouseBindings,
            onClearChunks: () => this.chunkManager.clear(),
            onToggleMap: () => this.toggleWorldMap(),
            onToggleMenu: () => this.toggleMenu(),
            isMapPointerOver: event => this.hud?.worldMap.open &&
                this.hud.worldMap.contains(event.clientX, event.clientY),
            changeRenderDistance: delta => {
                this.world.renderDistance += delta;
                this.world.renderDistance = Math.clamp(
                    this.world.renderDistance, 2, this.world.maxRenderDistance ?? 12,
                );
                this.socket.emit('render-distance:set', this.world.renderDistance);
                this.chunkManager.lastCenter = null;
            },
            clampRenderDistance: () => {
                this.world.renderDistance = Math.clamp(this.world.renderDistance, 2, this.world.maxRenderDistance ?? 12);
            },
            inspectChunk: position => console.log(this.world.getChunk(...this.world.getChunkCoords(...position))),
            inspectChunks: () => console.log(this.world.chunks),
        });
        this.player.inputs = this.input;

        // hud canvas
        this.hud = new Hud(hudCanvas);
        this.inventoryView = new InventoryView(
            this.player,
            slot => socket.emit('inventory:click', slot),
            renderer.textureAtlas,
        );

        // camera
        this.camera = new Camera(this.player, 90, 0.1, 200, { getViewBasis, reverseView });

        // audio processor
        this.audio = new AudioProcessor({
            world: this.world,
            assetLoader,
            getListener: () => ({
                position: this.player.pos,
                right: getViewBasis(this.player.orientation).right,
            }),
        });

        this.lastInputSent = 0;
        this.previousUpdateTime = null;

        this.updateInventory = deltaScale => this.inventoryView.update(this.hud.canvas, deltaScale);
        this.bindSocketEvents();
    }

    bindSocketEvents() {

        // ready session replaces old local state before the new snapshots arrive.
        this.socket.on('session:ready', session => {
            // Clear previous requests and entity state before installing the new world.
            this.chunkManager.clear();
            this.world.entities.clear();
            this.world.mapPlayers.clear();

            // update the world with the session data
            this.world.seed = session.world.seed;
            this.world.renderDistance = session.world.renderDistance;
            this.world.maxRenderDistance = session.world.maxRenderDistance ?? 12;
            this.world.borderDistance = session.world.borderDistance ?? null;

            // add player from session
            this.playerId = session.playerId;
            this.player.id = this.playerId;
            this.world.entities.set(this.playerId, this.player);
            for (const player of session.players ?? []) this.world.upsertMapPlayer(player);

            // add other entities from the session
            for (const entity of session.entities)
                this.world.upsertEntity(entity, this.playerId);

            // Keep the server's per-player request limit aligned with this view.
            this.socket.emit('render-distance:set', this.world.renderDistance);
        });


        // update these later to work for all entities idk
        this.socket.on('player:joined', player => {
            this.world.upsertEntity(player, this.playerId);
            this.world.upsertMapPlayer(player);
        });
        this.socket.on('player:left', ({ id }) => {
            this.world.removeEntity(id);
            this.world.mapPlayers.delete(id);
        });


        // receive info about world events / updates
        this.socket.on('chunk:data', data => this.chunkManager.receive(data));
        this.socket.on('lobby:settings', settings => {
            this.world.borderDistance = settings.borderDistance;
            this.world.maxRenderDistance = settings.maxRenderDistance;
            this.world.renderDistance = settings.renderDistance;
            this.chunkManager.clear();
            this.chunkManager.lastCenter = null;
        });
        this.socket.on('lobby:closed', () => window.location.reload());
        this.socket.on('block:update', change => {
            if (change.block?.type && change.block.type !== 'air') this.renderer.ensureBlockTexture(change.block.type);
            if (change.previousBlock && change.block?.type === 'air' && change.previousBlock.type !== 'air') {
                const position = change.blockPos.map(value => value + 0.5);
                this.particles.spawnBlockBreak(position, getBlockFaceColor(change.previousBlock.type));
            }
            this.chunkManager.onBlockChanged(change);
        });
        this.socket.on('world:snapshot', snapshot => {
            this.world.daylight = snapshot.daylight;
            const visibleIds = new Set();
            for (const entity of snapshot.entities) {
                visibleIds.add(entity.id);
                this.world.upsertEntity(entity, this.playerId);
            }

            // remove entities that aren't visible anymore
            for (const id of this.world.entities.keys()) if (!visibleIds.has(id)) this.world.removeEntity(id);

            // Keep the map's all-player feed independent from nearby render snapshots.
            const mapPlayerIds = new Set();
            for (const player of snapshot.players ?? []) {
                mapPlayerIds.add(player.id);
                this.world.upsertMapPlayer(player);
            }
            for (const id of this.world.mapPlayers.keys()) {
                if (!mapPlayerIds.has(id)) this.world.mapPlayers.delete(id);
            }
        });
        this.socket.on('particle:spawn', event => this.particles.handleEvent(event));
        this.socket.on('audio:play', event => this.audio.play(event));


        // bye bye!
        this.socket.on('disconnect', () => {
            this.playerId = null;
            this.chunkManager.clear();
            this.world.entities.clear();
            this.world.mapPlayers.clear();
            this.player.id = -1;
            this.world.entities.set(-1, this.player);
        });
    }


    // Open the map without leaving gameplay controls active behind its panel.
    toggleWorldMap() {
        const map = this.hud.worldMap;
        map.setOpen(!map.open);
        if (map.open) {
            this.player.menuOpen = true;
            this.player.inventory.open = false;
            document.exitPointerLock();
            return;
        }
        this.player.closeMenu();
        this.input.canvas.requestPointerLock();
    }

    // Let the shared menu key close the map before toggling the inventory panel.
    toggleMenu() {
        if (this.hud.worldMap.open) {
            this.toggleWorldMap();
            return;
        }
        this.input.toggleMenu();
    }

    // Advance local effects, request chunks, send input, and ease snapshot positions.
    update(timestamp) {
        // determine the dt
        const deltaScale = this.previousUpdateTime === null
            ? 1
            : Math.min(0.1, (timestamp - this.previousUpdateTime) / 1000) * 60;
        this.previousUpdateTime = timestamp;

        // send input to the server if enough time has passed
        if (timestamp - this.lastInputSent >= INPUT_SEND_MILLISECONDS && this.playerId !== null) {
            this.socket.emit('player:input', this.input.snapshot());
            this.lastInputSent = timestamp;
        }

        // ease movement of all client-side entities toward their actual positions
        for (const entity of this.world.entities.values()) {
            if (!entity.targetPos) continue;
            for (let axis = 0; axis < 3; axis++) {
                entity.pos[axis] += (entity.targetPos[axis] - entity.pos[axis]) * ENTITY_POSITION_INTERPOLATION;
            }
        }
        for (const player of this.world.mapPlayers.values()) {
            for (let axis = 0; axis < 3; axis++) {
                player.pos[axis] += (player.targetPos[axis] - player.pos[axis]) * ENTITY_POSITION_INTERPOLATION;
            }
        }

        // set local outlined block
        const { forward } = getViewBasis(this.player.orientation);
        const hit = raycast(this.player.pos, forward, this.world, this.player.reach ?? 5);
        this.player.outlinedBlock = hit ? { pos: hit.position, type: hit.block.type } : null;

        // update dependent systems
        this.particles.update(deltaScale);
        this.updateInventory(deltaScale);
        if (this.playerId !== null) this.chunkManager.update(this.player);
        this.camera.update();
        this.hud.worldMap.update(timestamp);
    }

    draw(fps) {
        // render the 3d world, then draw HUD on top
        this.renderer.render(this.world, this.camera, this.player, this.particles);
        this.hud.draw(this.getDebugTexts(fps), this.player, this.input, this.inventoryView, this.world);
    }

    getDebugTexts(fps) {
        const player = this.player, world = this.world, chunkManager = this.chunkManager;
        const debugTexts = [
            `${Math.round(player.pos[0])}, ${Math.round(player.pos[1])}, ${Math.round(player.pos[2])}`,
            `FPS: ${fps}`, `Health: ${player.health}/${player.maxHealth}`, '',
            `FOV: ${this.camera.fov}`, `View: ${this.camera.orientation.map(value => Math.round(value * 100) / 100).join(', ')}`, '',
            `Seed: ${world.seed}`, `Render Distance: ${world.renderDistance}`, '',
            `Resident Chunks: ${world.chunks.size}`, `Active Chunks: ${chunkManager.getActiveChunkCount()}`,
            `Unmeshed Chunks: ${chunkManager.dirty.length}`, `Requested Chunks: ${chunkManager.getPendingCount()}`,
        ];
        return debugTexts;
    }
}
