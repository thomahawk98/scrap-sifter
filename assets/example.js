// src/main.js
import { World } from "./core/World.js";
import { Renderer } from "./render/Renderer.js";
import { Player } from "./entities/Player.js";
import { Input } from "./systems/Input.js";

const canvas = document.getElementById("gl");

const world = new World();
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const player = new Player(world, input);

function gameLoop() {
  world.update();
  player.update();
  renderer.render(world, player);
  requestAnimationFrame(gameLoop);
}

gameLoop();



//world.js
import { Chunk } from "./Chunk.js";

export class World {
  constructor() {
    this.chunks = new Map();
  }
}



//player.js
import { Entity } from "./Entity.js";
import { Raycast } from "../systems/Raycast.js";

export class Player extends Entity {
  constructor(world, input) {
    super();
    this.world = world;
    this.input = input;
  }
}


/*
project-root/
│
├─ index.html
├─ src/
│   ├─ core/
│   │   ├─ world.js
│   │   |   ├─ weather
│   │   |   ├─ flooding
│   │   |   ├─ generation
│   │   |   ├─ heightmap
│   │   ├─ chunk.js
│   │   └─ block-registry.js
│   ├─ render/
│   │   ├─ camera.js
│   │   ├─ renderer.js
│   │   ├─ shaders.js
│   │   └─ mesh-builder.js
│   ├─ entities/
│   │   ├─ entity.js
│   │   ├─ player.js
│   │   ├─ robot.js
│   │   └─ bullet.js
│   ├─ systems/
│   │   ├─ physics.js
│   │   ├─ input.js
│   │   └─ raycast.js
│   ├─ ui/
│   │   ├─ hud.js
│   │   └─ inventory.js
|   |
│   └─ main.js
│
└─ assets/
   ├─ textures/
   └─ shaders/

*/