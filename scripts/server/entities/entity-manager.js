// Central owner for entity lifetime and fixed-step updates. Rendering reads the
// same collection, while each entity keeps its own movement and behavior.
export default class EntityManager {
    constructor() {
        this.entities = new Map();
        this.updateSnapshot = [];
    }

    add(entity) {
        this.entities.set(entity.id, entity);
        return entity;
    }

    remove(entityOrId) {
        const id = typeof entityOrId === 'object' ? entityOrId.id : entityOrId;
        return this.entities.delete(id);
    }

    getById(id) {
        return this.entities.get(id) || null;
    }

    findFirst(predicate) {
        for (const entity of this.entities.values()) {
            if (predicate(entity)) return entity;
        }
        return null;
    }

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

    values() {
        return this.entities.values();
    }
}
