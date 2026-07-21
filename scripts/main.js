//import math functions
import './systems/math-patch.js';

//import other dependencies
import World from './core/world.js';
import ChunkManager from './core/chunk-manager.js';
import Player from './entities/player.js';
import Camera from './render/camera.js';
import Renderer from './render/renderer.js';
import Hud from './render/hud.js';
import terrain from './core/terrain.js';

//init canvases
const glCanvas = document.getElementById("glcanvas");
const hudCanvas = document.getElementById("hudcanvas");
resize();

//define global elements
const world = new World();
const player = new Player(world);
const camera = new Camera(player, 90, 0.1, 200);
const renderer = new Renderer(glCanvas);
const hud = new Hud(hudCanvas);
const chunkManager = new ChunkManager();

//generate terrain
chunkManager.evaluateChunks(world, player, renderer);

//resize function
function resize() {
    glCanvas.width = window.innerWidth;
    glCanvas.height = window.innerHeight;
    hudCanvas.width = window.innerWidth;
    hudCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);

//set game pause state
var paused = true;
glCanvas.onclick = function () {
    if (!player.menuOpen) {
        //capture mouse
        glCanvas.requestPointerLock();
        paused = false;
    }
}

//player head follows mouse movement
document.addEventListener('mousemove', e => {
    if (document.pointerLockElement == glCanvas) {
        //move player head
        player.head.yaw += e.movementX * 0.002;
        player.head.pitch -= e.movementY * 0.002;

        //clamp player neck angle
        player.head.pitch = Math.clamp(player.head.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    } else {
        mouse.x = e.pageX;
        mouse.y = e.pageY;
    }
});
document.addEventListener('wheel', e => {
    const amount = -e.deltaY * 0.1;
    camera.viewDistance += amount;
    camera.viewDistance = Math.clamp(camera.viewDistance, 3, 100);
});

//key presses
var keys = {};
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

//special key presses
document.addEventListener('keydown', e => {

    //adjust fov
    if (keys['z']) camera.fov--;
    if (keys['x']) camera.fov++;

    //adjust render distance
    if (keys['-']) world.renderDistance--;
    if (keys['=']) world.renderDistance++;
    world.renderDistance = Math.clamp(world.renderDistance, 2, 8);

    //reset all chunks
    if (keys['backspace']) {
        document.exitPointerLock();
        paused = true;

        //delete gl buffers
        for (const chunk of world.chunks.values()) {
            chunk.deleteBuffers(renderer.gl, 'player force unloaded all chunks');
        }

        //delete chunks
        world.chunks = new Map();
        world.unloadedChunks = new Map();
        chunkManager.dirtyChunkQueue = [];

        //generate new
        chunkManager.evaluateChunks(world, player, renderer);
    }

    //cycle between maps
    if (keys['m']) {
        const validMapTypes = ['temperature', 'humidity', 'vitality', 'biome'];
        for (const map of hud.maps) {
            const typeIndex = validMapTypes.indexOf(map.type);
            const newIndex = (typeIndex + 1) % (validMapTypes.length);

            //change map type
            map.type = validMapTypes[newIndex];
            map.uploadData(player.pos, world);
        }
        keys['m'] = false;
    }

    //open / close player menu
    if (keys['e']) {
        keys['e'] = false;

        if (player.menuOpen) {
            player.closeMenu();

            //lock mouse
            glCanvas.requestPointerLock();
        } else {
            player.inventory.open = true;
            player.menuOpen = true;

            //release mouse
            document.exitPointerLock();
        }
    }

    //change item selection
    if (!player.menuOpen) {
        for (var n = 0; n < player.inventory.WIDTH; n++) {
            if (keys[(n + 1).toString()]) {
                player.inventory.selectedSlot = n;
            }
        }
    }
});

//mouse buttons
var mouse = {
    x: 0, y: 0,
    buttons: [false, false, false, false, false],
    inBox: function (x, y, w, h) {
        return this.x > x && this.x < x + w && this.y > y && this.y < y + h;
    }
};
document.addEventListener('mousedown', e => {
    mouse.buttons[e.button] = true;
});
document.addEventListener('mouseup', e => {
    mouse.buttons[e.button] = false;
});

var fps = 0;
function updateFPS() {
    const now = performance.now();
    if (!window.lastUpdateTime) window.lastUpdateTime = now;

    const deltaTime = (now - window.lastUpdateTime) / 1000; //  convert to seconds
    window.lastUpdateTime = now;
    fps = Math.round(1 / deltaTime);
    fps = Math.clamp(fps, 0, 60);
}

function main() {
    updateFPS();

    //update player and camera
    if (!paused) {
        player.update({ keys, mouse }, world, hud.canvas);
        camera.update();
    }

    //evaluate chunks if player crossed a chunk boundary
    const crossed = player.updateChunkCoords(world);
    chunkManager.update(world, player, renderer, crossed);

    //rewrite maps
    for (const map of hud.maps) {
        const rewrite = crossed || map.type == 'chunk status';
        if(rewrite) map.uploadData(player.pos, world);
    }
    

    //render the world (from camera POV)
    renderer.render(world, camera, player);

    //draw ui
    const biome = terrain.getBiomeAt(player.pos[0], player.pos[2], world.seed);
    const debugTexts = [
        `${Math.round(player.pos[0])}, ${Math.round(player.pos[1])}, ${Math.round(player.pos[2])}`,
        `FPS: ${fps}`, `Mode: ${player.mode}`, `On block: ${player.onBlock}`, '',
        `FOV: ${camera.fov}`, `Yaw: ${Math.round(camera.yaw * 100) / 100}`, `Pitch: ${Math.round(camera.pitch * 100) / 100}`, '',
        `Biome: ${biome.name}`, `Seed: ${world.seed}`, `Render Distance: ${world.renderDistance}`, '',
        `Loaded Chunks: ${world.chunks.size}`, `Unloaded Chunks: ${world.unloadedChunks.size}`, `Dirty Chunks: ${chunkManager.dirtyChunkQueue.length}`, ''
    ];
    hud.draw(paused, debugTexts, player, { keys, mouse });

    requestAnimationFrame(main);
}
main();