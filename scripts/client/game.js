import ServerRuntime from '../server/runtime.js';
import Player from './entities/player.js';
import { createTestEntity } from './entities/test-entity.js';
import GameLoop from './game-loop.js';
import User from './user.js';
import Renderer from './render/renderer.js';

export default class Game {
    constructor({ keyBindings = {}, mouseBindings = {} } = {}) {
        this.glCanvas = document.getElementById('glcanvas');
        this.hudCanvas = document.getElementById('hudcanvas');
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());

        this.server = new ServerRuntime();
        // Keep the existing moving test entity and its startup behavior.
        this.server.addEntity(createTestEntity());

        const player = this.server.addEntity(new Player(this.server.world));
        this.renderer = new Renderer(this.glCanvas);
        this.user = new User({
            server: this.server,
            renderer: this.renderer,
            glCanvas: this.glCanvas,
            hudCanvas: this.hudCanvas,
            controlledEntityId: player.id,
            keyBindings,
            mouseBindings,
        });
        this.loop = new GameLoop(this.user);
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
