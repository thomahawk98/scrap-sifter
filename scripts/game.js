import User from './client/user.js';
import Renderer from './client/render/renderer.js';

// Browser composition contains presentation and transport only. ServerRuntime
// runs in the Node process and is never instantiated in the client.
export default class Game {
    constructor({ assetLoader = null, keyBindings = {}, mouseBindings = {} } = {}) {
        this.glCanvas = document.getElementById('glcanvas');
        this.hudCanvas = document.getElementById('hudcanvas');

        // Watch viewport and element-size changes so docked tools resize the game.
        this.handleResize = () => this.resizeCanvases();
        window.addEventListener('resize', this.handleResize);
        window.visualViewport?.addEventListener('resize', this.handleResize);
        if (window.ResizeObserver) {
            this.resizeObserver = new window.ResizeObserver(this.handleResize);
            this.resizeObserver.observe(document.documentElement);
            this.resizeObserver.observe(this.glCanvas);
        }
        this.resizeCanvases();

        // Compose the browser-side transport and presentation components.
        this.socket = window.io();
        this.renderer = new Renderer(this.glCanvas, assetLoader);
        this.renderer.resize();
        this.user = new User({
            socket: this.socket, renderer: this.renderer,
            glCanvas: this.glCanvas, hudCanvas: this.hudCanvas,
            assetLoader,
            keyBindings, mouseBindings,
        });
        this.users = [this.user];
    }

    resizeCanvases() {
        let resized = false;
        for (const canvas of [this.glCanvas, this.hudCanvas]) {
            const bounds = canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(bounds.width));
            const height = Math.max(1, Math.round(bounds.height));

            // Attribute changes clear canvases, so update only when CSS size changed.
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                resized = true;
            }
        }

        // WebGL retains its previous viewport until it is explicitly updated.
        if (resized) this.renderer?.resize();
    }
}
