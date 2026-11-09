// Central owner for entity lifetime and fixed-step updates. Rendering reads the
// same collection, while each entity keeps its own movement and behavior.
export default class EntityManager {
    constructor() {
        this.entities = new Map();
    }

    add(entity) {
        this.entities.set(entity.id, entity);
        return entity;
    }

    remove(entityOrId) {
        const id = typeof entityOrId === 'object' ? entityOrId.id : entityOrId;
        return this.entities.delete(id);
    }

    update(deltaScale, context) {
        // New entities created during an update begin moving on the next step.
        for (const entity of [...this.entities.values()]) entity.update(deltaScale, context);
    }

    values() {
        return this.entities.values();
    }
}
