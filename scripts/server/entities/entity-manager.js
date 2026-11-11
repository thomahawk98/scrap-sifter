// Central owner for entity lifetime and fixed-step updates. Rendering reads the
// same collection, while each entity keeps its own movement and behavior.
export default class EntityManager {
    // Allocate the authoritative ID map and reusable update snapshot.
    constructor() {
        this.entities = new Map();
        this.updateSnapshot = [];
    }

    // Add or replace an entity by its stable ID.
    add(entity) {
        this.entities.set(entity.id, entity);
        return entity;
    }

    // Remove an entity by its object or stable ID.
    remove(entityOrId) {
        const id = typeof entityOrId === 'object' ? entityOrId.id : entityOrId;
        return this.entities.delete(id);
    }

    // Look up one entity without exposing map mutation.
    getById(id) {
        return this.entities.get(id) || null;
    }

    // Return the first entity matching a caller-supplied predicate.
    findFirst(predicate) {
        for (const entity of this.entities.values()) {
            if (predicate(entity)) return entity;
        }
        return null;
    }

    // Update a stable snapshot so entities created mid-tick wait until next tick.
    update(deltaScale, context, updateEntity = null) {
        // New entities created during an update begin moving on the next step.
        const snapshot = this.updateSnapshot;
        snapshot.length = 0;
        for (const entity of this.entities.values()) snapshot.push(entity);
        for (const entity of snapshot) {
            if (updateEntity) updateEntity(entity, deltaScale, context);
            else entity.update(deltaScale, context);
        }
        snapshot.length = 0;
    }

    // Expose iteration for world and network systems.
    values() {
        return this.entities.values();
    }
}
