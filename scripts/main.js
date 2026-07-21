//import math functions
import './core/math-patch.js';

//import other dependencies
import World from './core/world.js';
import ChunkManager from './core/chunk-manager.js';
import Player from './entities/player.js';
import Camera from './render/camera.js';
import Renderer from './render/renderer.js';
import Hud from './render/hud.js';

//init canvases
const glCanvas = document.getElementById("glcanvas");
const hudCanvas = document.getElementById("hudcanvas");
resize();

//define global elements
const world = new World();
const player = new Player();
const camera = new Camera(player);
const renderer = new Renderer(glCanvas);
const hud = new Hud(hudCanvas);
const chunkManager = new ChunkManager();

//generate terrain
world.generate();

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
glCanvas.onclick = () => glCanvas.requestPointerLock();
document.addEventListener('pointerlockchange', () => {
    paused = document.pointerLockElement !== glCanvas;
});

//player head follows mouse movement
document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== glCanvas) return;

    player.head.yaw += e.movementX * 0.002;
    player.head.pitch -= e.movementY * 0.002;

    //clamp camera up / down angle to prevent flipping
    player.head.pitch = Math.clamp(player.head.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
});

//key presses
var keys = {};
document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

//adjust fov
document.addEventListener('keydown', e => {
    if (e.key === 'z') camera.fov--;
    if (e.key === 'x') camera.fov++;
});

//mouse buttons
var mouse = [false, false, false, false, false];
document.addEventListener('mousedown', e => {
    mouse[e.button] = true;
});
document.addEventListener('mouseup', e => {
    mouse[e.button] = false;
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
        player.update({ keys, mouse }, world);
        camera.update();
    }
    
    //reupload dirty chunk geometry
    for(const [key, chunk] of world.chunks.entries()) {
        if(!chunk.dirty) continue;

        if(chunkManager.dirtyChunkQueue.includes(chunk)) continue;//the chunk is already in the queue
        chunkManager.dirtyChunkQueue.push(chunk);
    }

    chunkManager.updateQueue(world, player, renderer, 1); // max 2 chunks per frame

    //render the world (from camera POV)
    renderer.render(world, camera, player);

    //draw ui
    hud.draw(player, camera, fps, paused);

    requestAnimationFrame(main);
}
main();