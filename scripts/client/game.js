import User from './user.js';
import Renderer from './render/renderer.js';

// this is the client side game replica, actual updates happen server side
export default class Game {
    constructor({ assetLoader = null, lobby, password = '', keyBindings = {}, mouseBindings = {} } = {}) {
        this.glCanvas = document.getElementById('glcanvas');
        this.hudCanvas = document.getElementById('hudcanvas');

        // watch viewport and element-size changes so docked tools resize the game
        this.handleResize = () => this.resizeCanvases();
        window.addEventListener('resize', this.handleResize);
        window.visualViewport?.addEventListener('resize', this.handleResize);
        if (window.ResizeObserver) {
            this.resizeObserver = new window.ResizeObserver(this.handleResize);
            this.resizeObserver.observe(document.documentElement);
            this.resizeObserver.observe(this.glCanvas);
        }
        this.resizeCanvases();

        // compose the browser-side transport and presentation components
        this.socket = window.io(lobby.serverUrl || window.location.origin, {
            autoConnect: false, auth: { lobbyId: lobby.id, password },
        });
        this.renderer = new Renderer(this.glCanvas, assetLoader);
        this.renderer.resize();
        this.user = new User({
            socket: this.socket, renderer: this.renderer,
            glCanvas: this.glCanvas, hudCanvas: this.hudCanvas,
            assetLoader,
            keyBindings, mouseBindings,
        });
    }

    // resize both drawing surfaces and refresh the WebGL viewport when needed
    resizeCanvases() {
        let resized = false;
        for (const canvas of [this.glCanvas, this.hudCanvas]) {
            const bounds = canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(bounds.width));
            const height = Math.max(1, Math.round(bounds.height));

            // attribute changes clear canvases, so update only when CSS size changed
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                resized = true;
            }
        }

        // WebGL retains its previous viewport until it is explicitly updated
        if (resized) this.renderer?.resize();
    }
}
