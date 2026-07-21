const Physics = {
    moveEntity(entity, world) {
        //move the entity
        this.tryToMove(entity, entity.velocity[0], 0, 0, world);
        this.tryToMove(entity, 0, entity.velocity[1], 0, world);
        this.tryToMove(entity, 0, 0, entity.velocity[2], world);

        const friction = entity.onBlock ? 0.2 : 0.01;

        //damp velocity
        entity.velocity[0] *= (1 - friction);
        entity.velocity[1] *= (1 - friction * 0.5);
        entity.velocity[2] *= (1 - friction);
    },
    tryToMove(entity, dx, dy, dz, world) {
        const newPos = [entity.pos[0] + dx, entity.pos[1] + dy, entity.pos[2] + dz];

        const shellEntity = { size: entity.size, pos: newPos };
        const collides = this.anyBlockCollidesWithEntity(world, shellEntity);
        if (!collides) {
            if (dy !== 0) entity.onBlock = false;

            entity.pos = newPos; // move allowed
        } else {
            if (dy < 0) entity.onBlock = true;

            if (dx !== 0) entity.velocity[0] = 0;
            if (dy !== 0) entity.velocity[1] = 0;
            if (dz !== 0) entity.velocity[2] = 0;
        }
    },
    anyBlockCollidesWithEntity(world, entityShell, all = false) {
        const hits = all ? [] : false;

        // Determine bounds of the entity hitbox
        const minX = Math.floor(entityShell.pos[0] - entityShell.size.x / 2);
        const maxX = Math.floor(entityShell.pos[0] + entityShell.size.x / 2);
        const minY = Math.floor(entityShell.pos[1]);
        const maxY = Math.floor(entityShell.pos[1] + entityShell.size.y);
        const minZ = Math.floor(entityShell.pos[2] - entityShell.size.z / 2);
        const maxZ = Math.floor(entityShell.pos[2] + entityShell.size.z / 2);

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

        return hits;
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
                entity.pos[1],
                entity.pos[2] - entity.size.z / 2
            ];
            const entMax = [
                entity.pos[0] + entity.size.x / 2,
                entity.pos[1] + entity.size.y,
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
    }
}

export default Physics;