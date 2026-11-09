import World from '../core/world.js';
import ChunkManager from '../chunks/chunk-manager.js';
import Player from '../entities/player.js';
import { createTestEntity } from '../entities/test-entity.js';
import PlayerMovementTracker from '../systems/player-movement-tracker.js';
import GameLoop from './game-loop.js';
import User from './user.js';
import Camera from '../render/camera.js';
import Renderer from '../render/renderer.js';
import Hud from '../render/hud.js';

export default class Game {
    constructor({ keyBindings = {}, mouseBindings = {} } = {}) {
        this.glCanvas = document.getElementById('glcanvas');
        this.hudCanvas = document.getElementById('hudcanvas');
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());

        this.world = new World();
        // Keep the existing moving test entity and its startup behavior.
        this.world.entities.add(createTestEntity());

        const player = this.world.entities.add(new Player(this.world));
        this.playerTracker = new PlayerMovementTracker(player, this.world);
        this.camera = new Camera(player, 90, 0.1, 200);
        this.renderer = new Renderer(this.glCanvas);
        const hud = new Hud(this.hudCanvas);
        this.chunkManager = new ChunkManager(this.world);
        this.user = new User({
            world: this.world,
            camera: this.camera,
            renderer: this.renderer,
            hud,
            chunkManager: this.chunkManager,
            canvas: this.glCanvas,
            keyBindings,
            mouseBindings,
        });
        this.loop = new GameLoop({
            world: this.world,
            user: this.user,
            playerTracker: this.playerTracker,
            camera: this.camera,
            renderer: this.renderer,
            chunkManager: this.chunkManager,
        });
    }

    resizeCanvases() {
        for (const canvas of [this.glCanvas, this.hudCanvas]) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
    }

    start() {
        this.loop.start();
    }
}
