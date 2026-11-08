//import math functions
import './systems/math-patch.js';

//import other dependencies
import World from './core/world.js';
import ChunkManager from './chunks/chunk-manager.js';

import Player from './entities/player.js';
import PlayerMovementTracker from './systems/player-movement-tracker.js';
import FPSTracker from './systems/fps-tracker.js';

import Camera from './render/camera.js';
import Renderer from './render/renderer.js';

import Hud from './render/hud.js';

import terrain from './core/terrain.js';

//init canvases
const glCanvas = document.getElementById("glcanvas");
const hudCanvas = document.getElementById("hudcanvas");
resize();

//resize function
function resize() {
    glCanvas.width = window.innerWidth;
    glCanvas.height = window.innerHeight;
    hudCanvas.width = window.innerWidth;
    hudCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);

//define global elements
const world = new World();

const player = new Player(world);
const playerTracker = new PlayerMovementTracker(player, world);
const camera = new Camera(player, 90, 0.1, 200);

const renderer = new Renderer(glCanvas);
const hud = new Hud(hudCanvas);
const chunkManager = new ChunkManager(world);

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
    if (player.perspectiveMode == 0) return;

    camera.viewDistance += e.deltaY * 0.075;
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

        chunkManager.clear(renderer);
    }

    if (keys[']']) {
        const chunkCoords = world.getChunkCoords(...player.pos);
        const chunk = world.getChunk(...chunkCoords);
        console.log(chunk);
        keys[']'] = false;
    }
    if (keys['[']) {
        console.log(world.chunks);
        keys['['] = false;
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

const fpsTracker = new FPSTracker();
const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const MAX_SIMULATION_STEPS = 5;
let previousFrameTime = null;
let simulationAccumulator = 0;
let lastChunkMapRefresh = 0;

function main(timestamp) {
    fpsTracker.update(timestamp);
    const elapsedSeconds = previousFrameTime === null ? 0 : (timestamp - previousFrameTime) / 1000;
    previousFrameTime = timestamp;
    // Ignore long stalls and cap catch-up work so a slow frame cannot trigger
    // an unbounded burst of simulation updates on the next frame.
    const frameSeconds = Math.min(elapsedSeconds, MAX_FRAME_SECONDS);

    if (!paused) {
        simulationAccumulator += frameSeconds;
        let steps = 0;
        while (simulationAccumulator >= FIXED_STEP_SECONDS && steps < MAX_SIMULATION_STEPS) {
            world.update(FIXED_STEP_SECONDS);
            player.update({ keys, mouse }, world, hud.canvas, FIXED_STEP_SECONDS * 60);
            playerTracker.update();
            camera.update();
            simulationAccumulator -= FIXED_STEP_SECONDS;
            steps++;
        }
        // Drop excess accumulated time rather than spiraling into more catch-up.
        if (steps === MAX_SIMULATION_STEPS) simulationAccumulator = Math.min(simulationAccumulator, FIXED_STEP_SECONDS);
    } else {
        simulationAccumulator = 0;
    }

    const crossed = playerTracker.consumeChunkBorderCrossing();
    chunkManager.update(player, renderer, crossed, frameSeconds * 60);

    //rewrite maps
    const refreshChunkMap = timestamp - lastChunkMapRefresh >= 100;
    for (const map of hud.maps) {
        const rewrite = crossed || (map.isChunkMap && refreshChunkMap);
        if (rewrite) map.uploadData(player.pos, world);
    }
    if (refreshChunkMap) lastChunkMapRefresh = timestamp;

    //render the world (from camera POV)
    renderer.render(world, camera, player);

    //draw ui
    const biome = terrain.getBiomeAt(player.pos[0], player.pos[2], world.seed);
    const debugTexts = [
        `${Math.round(player.pos[0])}, ${Math.round(player.pos[1])}, ${Math.round(player.pos[2])}`,
        `FPS: ${fpsTracker.fps}`, `Mode: ${player.mode}`, `On block: ${player.onBlock}`, '',
        `FOV: ${camera.fov}`, `Yaw: ${Math.round(camera.yaw * 100) / 100}`, `Pitch: ${Math.round(camera.pitch * 100) / 100}`, '',
        `Biome: ${biome.name}`, `Seed: ${world.seed}`, `Render Distance: ${world.renderDistance}`, '',
        `Resident Chunks: ${world.chunks.size}`, `Active Chunks: ${chunkManager.getActiveChunkCount()}`,
        `Unmeshed Chunks: ${chunkManager.dirtyChunkQueue.length}`, `Ungenerated Chunks: ${chunkManager.generator.requestQueue.size}`,
    ];
    hud.draw(paused, debugTexts, player, { keys, mouse });

    requestAnimationFrame(main);
}
requestAnimationFrame(main);

