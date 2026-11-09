import User from './client/user.js';
import Renderer from './client/render/renderer.js';

// Browser composition contains presentation and transport only. ServerRuntime
// runs in the Node process and is never instantiated in the client.
export default class Game {
    constructor({ keyBindings = {}, mouseBindings = {} } = {}) {
        this.glCanvas = document.getElementById('glcanvas');
        this.hudCanvas = document.getElementById('hudcanvas');
        this.handleResize = () => this.resizeCanvases();
        window.addEventListener('resize', this.handleResize);
        window.visualViewport?.addEventListener('resize', this.handleResize);
        if (window.ResizeObserver) {
            this.resizeObserver = new window.ResizeObserver(this.handleResize);
            this.resizeObserver.observe(document.documentElement);
            this.resizeObserver.observe(this.glCanvas);
        }
        this.resizeCanvases();

        this.socket = window.io();
        this.renderer = new Renderer(this.glCanvas);
        this.renderer.resize();
        this.user = new User({
            socket: this.socket, renderer: this.renderer,
            glCanvas: this.glCanvas, hudCanvas: this.hudCanvas,
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
            // Assigning either attribute clears the canvas, so only do it when
            // the rendered CSS size actually changed.
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                resized = true;
            }
        }
        if (resized) this.renderer?.resize();
    }
}
