import ServerRuntime from './server/runtime.js';
import User from './client/user.js';
import Renderer from './client/render/renderer.js';

export default class Game {
    constructor({ keyBindings = {}, mouseBindings = {} } = {}) {
        this.glCanvas = document.getElementById('glcanvas');
        this.hudCanvas = document.getElementById('hudcanvas');
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());

        this.server = new ServerRuntime();
        this.renderer = new Renderer(this.glCanvas);
        this.user = new User({
            server: this.server,
            renderer: this.renderer,
            glCanvas: this.glCanvas,
            hudCanvas: this.hudCanvas,
            keyBindings,
            mouseBindings,
        });
        this.users = [this.user];
    }

    resizeCanvases() {
        for (const canvas of [this.glCanvas, this.hudCanvas]) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
    }

}
