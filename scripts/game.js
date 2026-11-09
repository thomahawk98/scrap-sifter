import World from './core/world.js';
import ChunkManager from './chunks/chunk-manager.js';
import Player from './entities/player.js';
import { createTestEntity } from './entities/test-entity.js';
import PlayerMovementTracker from './systems/player-movement-tracker.js';
import InputController from './systems/input.js';
import GameLoop from './systems/game-loop.js';
import Camera from './render/camera.js';
import Renderer from './render/renderer.js';
import Hud from './render/hud.js';

export default class Game {
    constructor({ keyBindings = {}, mouseBindings = {} } = {}) {
        this.glCanvas = document.getElementById('glcanvas');
        this.hudCanvas = document.getElementById('hudcanvas');
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());

        this.world = new World();
        // Keep the existing moving test entity and its startup behavior.
        this.world.entities.add(createTestEntity());

        this.player = new Player(this.world);
        this.world.entities.add(this.player);
        this.playerTracker = new PlayerMovementTracker(this.player, this.world);
        this.camera = new Camera(this.player, 90, 0.1, 200);
        this.renderer = new Renderer(this.glCanvas);
        this.hud = new Hud(this.hudCanvas);
        this.chunkManager = new ChunkManager(this.world);
        this.input = new InputController({
            canvas: this.glCanvas,
            player: this.player,
            camera: this.camera,
            world: this.world,
            chunkManager: this.chunkManager,
            renderer: this.renderer,
            keyBindings,
            mouseBindings,
        });
        this.loop = new GameLoop({
            world: this.world,
            player: this.player,
            playerTracker: this.playerTracker,
            camera: this.camera,
            renderer: this.renderer,
            hud: this.hud,
            chunkManager: this.chunkManager,
            input: this.input,
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
