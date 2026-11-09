const Physics = {
    GRAVITY: 0.0125,
    moveEntity(entity, world, deltaScale = 1) {
        // accelerate entity due to gravity
        if (entity.type !== 'player' || entity.mode !== 'creative') {
            entity.velocity[1] -= this.GRAVITY * deltaScale;
        }

        // move the entity
        for (let a = 0; a < 3; a++) {
            this.tryToMove(entity, a, world, deltaScale);
        }

        // damp velocity
        const surfaceFriction = this.getSurfaceFriction(entity);
        const fluidFriction = this.getFluidFriction(entity);

        const surfaceDamping = 1 - surfaceFriction;
        const fluidDamping = 1 - fluidFriction;
        const damping = Math.pow(surfaceDamping * fluidDamping, deltaScale);

        entity.velocity = entity.velocity.map(a => a * damping);
    },
    tryToMove(entity, axis, world, deltaScale = 1) {
        const speed = entity.velocity[axis] * deltaScale;
        if (speed == 0) return;

        // Test one axis at a time to keep the cube from tunneling through
        // corners. Its position is the center, so every axis uses half-extents.
        const newPos = [...entity.pos];
        newPos[axis] += speed;

        const entityShell = { size: entity.size, pos: newPos };
        const collided = this.getBlockingBlock(world, entityShell, axis, speed, entity.pos);
        if (!collided) entity.pos = newPos; // move allowed
        else {
            // take damage from colliding with blocks at high velocities
            this.damageEntityFromSpeed(entity, speed);

            entity.velocity[axis] = 0;

            // move the entity to the edge of the colliding block
            if (axis === 0) {
                entity.pos[0] = speed > 0
                    ? collided.pos[0] - entity.size.x / 2
                    : collided.pos[0] + 1 + entity.size.x / 2;
            }
            else if (axis === 1) {
                if (speed > 0) {
                    // Ceiling
                    entity.pos[1] = collided.pos[1] - entity.size.y / 2;
                } else {
                    // Floor
                    entity.pos[1] = collided.pos[1] + 1 + entity.size.y / 2;
                }
            }
            else {
                entity.pos[2] = speed > 0
                    ? collided.pos[2] - entity.size.z / 2
                    : collided.pos[2] + 1 + entity.size.z / 2;
            }
        }

        // set the entity onBlock value
        if (axis == 1) entity.onBlock = speed < 0 && collided;
    },
    getBlockingBlock(world, entityShell, axis, speed, previousPos) {
        const half = [entityShell.size.x, entityShell.size.y, entityShell.size.z].map(value => value * 0.5);
        const min = entityShell.pos.map((value, i) => Math.floor(value - half[i] + 1e-8));
        const max = entityShell.pos.map((value, i) => Math.floor(value + half[i] - 1e-8));
        let closestBlock = null;
        const previousEdge = previousPos[axis] + (speed > 0 ? half[axis] : -half[axis]);
        let closestDistance = Infinity;

        for (let x = min[0]; x <= max[0]; x++) {
            for (let y = min[1]; y <= max[1]; y++) {
                for (let z = min[2]; z <= max[2]; z++) {
                    const block = world.getBlock(x, y, z);
                    if (!block || block.type === 'air') continue;

                    const blockCoords = [x, y, z];
                    const plane = blockCoords[axis] + (speed < 0 ? 1 : 0);
                    const distance = speed > 0 ? plane - previousEdge : previousEdge - plane;
                    // Ignore solid cells the cube was already embedded in; only
                    // clamp to a face crossed by this axis movement.
                    if (distance < -1e-8 || distance >= closestDistance) continue;
                    closestBlock = block;
                    closestDistance = distance;
                }
            }
        }
        return closestBlock;
    },
    damageEntityFromSpeed(entity, speed) {
        if (entity.vitals == undefined || entity.vitals.health == undefined) return console.log(entity, 'is missing vitals');
        if (entity.type == 'player' && entity.mode == 'creative') return;

        speed = Math.abs(speed);
        const DAMAGE_THRESHOLD = 0.3;
        if (speed < DAMAGE_THRESHOLD) return;

        const excess = speed - DAMAGE_THRESHOLD;
        const damage = (excess * 100);
        entity.vitals.health -= damage;
    },
    anyBlockCollidesWithEntity(world, entityShell, all = false) {
        // all means we need to get all the blocks that collide with the entity, if not, we just need to know if one does

        const hits = [];

        // Determine bounds of the entity hitbox
        const minX = Math.floor(entityShell.pos[0] - entityShell.size.x * 0.5 + 1e-8);
        const maxX = Math.floor(entityShell.pos[0] + entityShell.size.x * 0.5 - 1e-8);
        const minY = Math.floor(entityShell.pos[1] - entityShell.size.y * 0.5 + 1e-8);
        const maxY = Math.floor(entityShell.pos[1] + entityShell.size.y * 0.5 - 1e-8);
        const minZ = Math.floor(entityShell.pos[2] - entityShell.size.z * 0.5 + 1e-8);
        const maxZ = Math.floor(entityShell.pos[2] + entityShell.size.z * 0.5 - 1e-8);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const block = world.getBlock(x, y, z);
                    if (block && block.type !== 'air') {
                        if (all) hits.push(block);
                        else return block;
                    }
                }
            }
        }

        return all ? hits : false;
    },
    anyEntityCollidesWithBlock(blockShell, entities, all = false) {
        const hits = all ? [] : false;

        const blockMin = [
            blockShell.pos[0],
            blockShell.pos[1],
            blockShell.pos[2],
        ];
        const blockMax = [
            blockShell.pos[0] + 1,
            blockShell.pos[1] + 1,
            blockShell.pos[2] + 1
        ];

        for (const entity of entities) {
            // Compute entity bounds
            const entMin = [
                entity.pos[0] - entity.size.x / 2,
                entity.pos[1] - entity.size.y / 2,
                entity.pos[2] - entity.size.z / 2
            ];
            const entMax = [
                entity.pos[0] + entity.size.x / 2,
                entity.pos[1] + entity.size.y / 2,
                entity.pos[2] + entity.size.z / 2
            ];

            // AABB overlap test
            const overlap =
                blockMin[0] <= entMax[0] && blockMax[0] >= entMin[0] &&
                blockMin[1] <= entMax[1] && blockMax[1] >= entMin[1] &&
                blockMin[2] <= entMax[2] && blockMax[2] >= entMin[2];

            if (overlap) {
                if (all) hits.push(entity);
                else return entity;
            }
        }

        return hits;
    },
    getSurfaceFriction(entity) {
        if (!entity.onBlock) return 0;
        switch (entity.onBlock.type) {
            case 'ice': return 0.02;
            default: return 0.2;
        }
    },
    getSurfaceTraction(entity) {
        if (!entity.onBlock) return 0;
        switch (entity.onBlock.type) {
            case 'ice': return 0.25;
            default: return 1;
        }
    },
    getFluidFriction(entity) {
        if (!entity.inFluid) return 0.01; // air resistance
        switch (entity.inFluid.type) {
            case 'water': return 0.05;
        }
    },
    getFluidTraction(entity) {
        if (!entity.inFluid) return 0.1; // allow a tiny bit of movement in the air
        switch (entity.inFluid.type) {
            case 'water': return 0.25;
        }
    }
}

export default Physics;
