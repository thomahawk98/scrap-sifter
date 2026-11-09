let nextEntityId = 1;

// Shared entity contract: position and orientation are updated on the CPU;
// immutable mesh data stays with the geometry and is uploaded once by Renderer.
export default class Entity {
    constructor({ pos = [0, 0, 0], orientation = [1, 0, 0, 0], scale = [1, 1, 1], geometry = null, material = {} } = {}) {
        this.id = nextEntityId++;
        this.pos = [...pos];
        this.orientation = [...orientation];
        this.scale = [...scale];
        this.geometry = geometry;
        // Keep appearance separate from geometry so a texture can be attached
        // later without changing entity storage or update code.
        this.material = { texture: null, ...material };
        this.velocity = [0, 0, 0];
        this.visible = true;
    }

    update() { }
}
