import Inventory from './inventory.js';
import { raycast } from '../systems/raycast.js';
import { getViewBasis, rotateLocal } from '../systems/view-basis.js';
import Entity from './entity.js';
import Bullet from './bullet.js';
import Bomb from './bomb.js';
import { createCubeGeometry } from '../core/entity-geometry.js';

const PLAYER_GEOMETRY = createCubeGeometry();

export default class Player extends Entity {
    constructor(world) {
        super({ geometry: PLAYER_GEOMETRY, scale: [0.8, 0.8, 0.8], material: { color: [1, 0, 0] } });
        this.type = 'player';

        this.spawnPos = [0, 0, 0];

        this.head = {
            pos: this.spawnPos,
        };

        this.shootReload = 0;
        this.interactReload = 0;
        this.inputs = {
            keys: {},
            mouse: {
                inBox: function () { return false; },
                buttons: [],
            }
        }

        this.perspectiveMode = 0;

        this.reach = 5;
        this.outlinedBlock = null;

        this.inventory = new Inventory('default');
        this.menuOpen = false;

        this.respawn(world);
    }

    update(deltaScale = 1, { inputs, world, updateInventory } = {}) {
        if (!inputs || !world) return;
        this.inputs = inputs;

        //move player
        if (!this.menuOpen) this.updateAcceleration(deltaScale);
        super.update(deltaScale, { world });

        this.updateBody();
        this.interact(world, deltaScale);

        // User supplies the client view update at the same point in the player
        // tick, while inventory data remains owned by the server entity.
        if (updateInventory) updateInventory(deltaScale);
        else this.inventory.cleanupDeletedItems();

        //change perspective mode
        if (inputs.consumePress ? inputs.consumePress('togglePerspective') : inputs.keys['r']) {
            this.perspectiveMode = (this.perspectiveMode + 1) % 3;
            if (inputs.keys) inputs.keys['r'] = false;
        }

        //respawn player
        if (inputs.isDown ? inputs.isDown('respawn') : inputs.keys['enter']) this.respawn(world);

    };

    respawn(world = null) {
        this.velocity = [0, 0, 0];
        this.health = this.maxHealth;
        this.spawnSearchCooldown = 0;
        const safePosition = this.findSafeSpawn(world, this.spawnPos);
        if (safePosition) {
            this.pos = safePosition;
            this.spawnPos = [...safePosition];
            this.needsSafeSpawn = false;
        } else {
            this.pos = [...this.spawnPos];
            this.needsSafeSpawn = true;
        }
        this.head.pos = [...this.pos];
    };

    // Players return to their spawn immediately for now; a death screen can be
    // added later without changing damage handling.
    die(source = null, world = null) {
        this.respawn(world);
    }

    ensureSafeSpawn(world) {
        if (!this.needsSafeSpawn) return true;
        if (this.spawnSearchCooldown > 0) {
            this.spawnSearchCooldown--;
            return false;
        }
        const safePosition = this.findSafeSpawn(world, this.spawnPos);
        if (!safePosition) {
            this.spawnSearchCooldown = 15;
            return false;
        }
        this.pos = safePosition;
        this.spawnPos = [...safePosition];
        this.head.pos = [...safePosition];
        this.needsSafeSpawn = false;
        return true;
    }

    findSafeSpawn(world, preferredPosition) {
        if (!world || !preferredPosition) return null;
        const [preferredChunkX, preferredChunkY, preferredChunkZ] = world.getChunkCoords(...preferredPosition);
        if (!world.getChunk(preferredChunkX, preferredChunkY, preferredChunkZ)) return null;

        const baseX = Math.floor(preferredPosition[0]);
        const baseY = Math.floor(preferredPosition[1]);
        const baseZ = Math.floor(preferredPosition[2]);
        const columns = [];
        for (let dx = -4; dx <= 4; dx++) {
            for (let dz = -4; dz <= 4; dz++) {
                columns.push([baseX + dx + 0.5, baseZ + dz + 0.5]);
            }
        }
        columns.sort((a, b) => {
            const distanceA = (a[0] - preferredPosition[0]) ** 2 + (a[1] - preferredPosition[2]) ** 2;
            const distanceB = (b[0] - preferredPosition[0]) ** 2 + (b[1] - preferredPosition[2]) ** 2;
            return distanceA - distanceB;
        });

        const heights = [];
        for (let offset = 0; offset <= 32; offset++) heights.push(baseY + offset + 0.5);
        for (let offset = 1; offset <= 16; offset++) heights.push(baseY - offset + 0.5);

        // Prefer a nearby clear column, scanning upward first to avoid spawning
        // inside the terrain when the configured spawn point is obstructed.
        for (const [x, z] of columns) {
            for (const y of heights) {
                const candidate = [x, y, z];
                if (this.isPositionClear(world, candidate)) return candidate;
            }
        }
        return null;
    }

    isPositionClear(world, position) {
        const halfSize = [this.size.x, this.size.y, this.size.z].map(value => value * 0.5);
        const min = position.map((value, axis) => Math.floor(value - halfSize[axis] + 1e-6));
        const max = position.map((value, axis) => Math.floor(value + halfSize[axis] - 1e-6));
        for (let x = min[0]; x <= max[0]; x++) {
            for (let y = min[1]; y <= max[1]; y++) {
                for (let z = min[2]; z <= max[2]; z++) {
                    const [cx, cy, cz] = world.getChunkCoords(x, y, z);
                    if (!world.getChunk(cx, cy, cz)) return false;
                    if (world.getBlock(x, y, z).type !== 'air') return false;
                }
            }
        }
        return true;
    }

    updateBody() {
        // Player position is the center of the cube and the camera origin.
        this.head.pos = [...this.pos];
    };

    rotateView(mouseX, mouseY, roll = false) {
        const sensitivity = 0.002;
        const horizontalAxis = roll ? [0, 0, -1] : [0, 1, 0];
        const horizontalAngle = roll ? mouseX * sensitivity : -mouseX * sensitivity;
        this.orientation = rotateLocal(this.orientation, horizontalAxis, horizontalAngle);
        this.orientation = rotateLocal(this.orientation, [1, 0, 0], -mouseY * sensitivity);
    }

    interact(world, deltaScale = 1) {
        if (this.shootReload > 0) this.shootReload = Math.max(0, this.shootReload - deltaScale);
        if (this.interactReload > 0) this.interactReload = Math.max(0, this.interactReload - deltaScale);

        if (this.inventory.open) return;

        if (this.isMouseDown('shoot') && this.shootReload <= 0) {
            const usedItem = this.inventory.useSelectedItem(this, world);
            if (usedItem) this.shootReload = usedItem.cooldown;
        }

        // get the block the player is looking at
        const { forward } = getViewBasis(this.orientation);
        const hit = raycast(this.head.pos, forward, world, this.reach);
        if (!hit) {
            this.outlinedBlock = null;
            return false
        }

        // update the outlined block to be the block the player is looking at
        const differentBlock = !this.outlinedBlock ? true : JSON.stringify(this.outlinedBlock.pos) == JSON.stringify(hit.position) ? false : true;
        if (differentBlock) this.outlinedBlock = { pos: hit.position, type: hit.block.type };

        // Right-click keeps block placement; left-click is handled as shooting above.
        if (this.isMouseDown('place') && this.interactReload <= 0) {
            world.placeBlock(hit, this);
            this.interactReload = 8;
        }
    };

    shootBullet(world) {
        const { forward } = getViewBasis(this.orientation);
        world.audio?.playWorld('blaster-shot', this.pos, { volume: 0.8 });
        world.entities.add(new Bullet([...this.pos], forward, this));
    }

    shootBomb(world) {
        const { forward } = getViewBasis(this.orientation);
        world.audio?.playWorld('bomb-launch.mp3', this.pos, { volume: 0.8 });
        world.entities.add(new Bomb([...this.pos], forward, this));
    }

    isMouseDown(action) {
        if (this.inputs.isMouseDown) return this.inputs.isMouseDown(action);
        const button = action === 'shoot' ? 0 : 2;
        return this.inputs.mouse.buttons[button];
    }

    closeMenu() {
        this.menuOpen = false;
        if (this.inventory.open) this.inventory.open = false;
    }

    updateAcceleration(deltaScale = 1) {
        const keys = this.inputs.keys;
        const isDown = (action, fallback) => this.inputs.isDown
            ? this.inputs.isDown(action)
            : Boolean(keys[fallback]);
        const movementSpeed = isDown('fastMove', 'q') ? 0.05 : 0.025;

        const speed = movementSpeed * this.getMovementTraction();

        // All movement axes come from the same unrestricted camera frame.
        const { forward, right, up } = getViewBasis(this.orientation);

        let target = [0, 0, 0];
        var accel = [0, 0, 0];

        if (isDown('moveForward', 'w')) target = target.map((v, i) => v + forward[i]);
        if (isDown('moveBackward', 's')) target = target.map((v, i) => v - forward[i]);
        if (isDown('moveLeft', 'a')) target = target.map((v, i) => v - right[i]);
        if (isDown('moveRight', 'd')) target = target.map((v, i) => v + right[i]);
        if (isDown('moveUp', ' ')) {
            target = target.map((v, i) => v + up[i]);
        }
        if (isDown('moveDown', 'shift')) target = target.map((v, i) => v - up[i]);

        // Normalize the complete direction so pitching up or down keeps the
        // same movement speed and works even when looking straight vertically.
        const targetLength = Math.hypot(...target);
        if (targetLength > 0) {
            for (let axis = 0; axis < 3; axis++) {
                accel[axis] += (target[axis] / targetLength) * speed;
            }
        }

        //accelerate player
        this.applyAcceleration(accel, deltaScale);
    };
}
