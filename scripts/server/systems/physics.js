const Physics = {
    moveEntity(entity, world, deltaScale = 1) {
        entity.collidedBlock = null;
        let impactSpeed = 0;
        // move the entity
        for (let a = 0; a < 3; a++) {
            const collision = this.tryToMove(entity, a, world, deltaScale);
            if (collision) impactSpeed = Math.max(impactSpeed, Math.abs(collision.speed));
        }

        // damp velocity
        const fluidFriction = this.getFluidFriction(entity);

        const fluidDamping = 1 - fluidFriction;
        const damping = Math.pow(fluidDamping, deltaScale);

        entity.velocity = entity.velocity.map(a => a * damping);

        // Use the strongest axis impact once per frame to avoid multiplying
        // damage when a corner touches multiple blocks at the same time.
        if (impactSpeed > entity.impactDamageThreshold) {
            const damage = (impactSpeed - entity.impactDamageThreshold) * entity.impactDamageMultiplier;
            entity.takeDamage(damage, entity.collidedBlock);
        }
    },
    tryToMove(entity, axis, world, deltaScale = 1) {
        const speed = entity.velocity[axis] * deltaScale;
        if (speed == 0) return;

        // Test one axis at a time to keep the cube from tunneling through
        // corners. Its position is the center, so every axis uses half-extents.
        const newPos = [...entity.pos];
        newPos[axis] += speed;

        const collided = this.getBlockingBlock(world, entity, axis, speed);
        if (!collided) entity.pos = newPos; // move allowed
        else {
            entity.collidedBlock ||= collided;
            entity.velocity[axis] = 0;

            // Stop flush against the first block face crossed by this motion.
            const halfExtent = entity.size[['x', 'y', 'z'][axis]] * 0.5;
            entity.pos[axis] = speed > 0
                ? collided.pos[axis] - halfExtent
                : collided.pos[axis] + 1 + halfExtent;
        }

        return collided ? { block: collided, speed } : null;
    },
    getBlockingBlock(world, entity, axis, speed) {
        const half = [entity.size.x, entity.size.y, entity.size.z].map(value => value * 0.5);
        const axisStart = entity.pos[axis] + (speed > 0 ? half[axis] : -half[axis]);
        const axisEnd = axisStart + speed;
        const min = entity.pos.map((value, i) => Math.floor(value - half[i] + 1e-8));
        const max = entity.pos.map((value, i) => Math.floor(value + half[i] - 1e-8));
        // Expand only the movement axis to include every cell the entity
        // crosses, preventing high-speed movement from tunneling through blocks.
        min[axis] = speed > 0 ? Math.floor(axisStart + 1e-8) : Math.floor(axisEnd - 1e-8);
        max[axis] = speed > 0 ? Math.floor(axisEnd + 1e-8) : Math.floor(axisStart - 1e-8);
        let closestBlock = null;
        let closestDistance = Infinity;

        for (let x = min[0]; x <= max[0]; x++) {
            for (let y = min[1]; y <= max[1]; y++) {
                for (let z = min[2]; z <= max[2]; z++) {
                    const block = world.getBlock(x, y, z);
                    if (!block || block.type === 'air') continue;

                    const coords = [x, y, z];
                    const plane = coords[axis] + (speed < 0 ? 1 : 0);
                    const distance = speed > 0 ? plane - axisStart : axisStart - plane;
                    if (distance < -1e-8 || distance > Math.abs(speed) + 1e-8 || distance >= closestDistance) continue;

                    // The entity must overlap the block on both stationary axes.
                    let overlapsOtherAxes = true;
                    for (let otherAxis = 0; otherAxis < 3; otherAxis++) {
                        if (otherAxis === axis) continue;
                        const entityMin = entity.pos[otherAxis] - half[otherAxis];
                        const entityMax = entity.pos[otherAxis] + half[otherAxis];
                        if (entityMax <= coords[otherAxis] + 1e-8 || entityMin >= coords[otherAxis] + 1 - 1e-8) {
                            overlapsOtherAxes = false;
                            break;
                        }
                    }
                    if (!overlapsOtherAxes) continue;
                    closestBlock = block;
                    closestDistance = distance;
                }
            }
        }
        return closestBlock;
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
