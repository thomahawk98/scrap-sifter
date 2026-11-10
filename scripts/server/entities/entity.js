import physics from '../systems/physics.js';

let nextEntityId = 1;

// Shared entity contract: position and orientation are updated on the CPU;
// immutable mesh data stays with the geometry and is uploaded once by Renderer.
export default class Entity {
    constructor({ pos = [0, 0, 0], orientation = [1, 0, 0, 0], scale = [1, 1, 1], size = null, geometry = null, material = {} } = {}) {
        this.id = nextEntityId++;
        this.pos = [...pos];
        this.orientation = [...orientation];
        this.scale = [...scale];
        this.size = size || { x: scale[0], y: scale[1], z: scale[2] };
        this.geometry = geometry;
        // Appearance is separate from geometry, leaving room for future textures.
        this.material = { color: [1, 1, 1], texture: null, ...material };
        this.velocity = [0, 0, 0];
        this.visible = true;
        this.onBlock = false;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        // Tune these per entity type to control which impacts cause damage.
        this.impactDamageThreshold = 0.15;
        this.impactDamageMultiplier = 150;
    }

    // Shared acceleration, velocity integration, collision, and damping path.
    applyAcceleration(acceleration, deltaScale = 1) {
        this.velocity = this.velocity.map((value, axis) => value + acceleration[axis] * deltaScale);
    }

    getMovementTraction() {
        return Math.max(physics.getSurfaceTraction(this), physics.getFluidTraction(this));
    }

    takeDamage(amount, source = null) {
        const damage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
        if (damage === 0 || this.health <= 0) return false;

        this.health = Math.max(0, this.health - damage);
        if (this.health === 0) this.die(source);
        return true;
    }

    // Specialized entities can override this to choose their own death behavior.
    die() {
        this.visible = false;
    }

    update(deltaScale = 1, { world } = {}) {
        if (world) physics.moveEntity(this, world, deltaScale);
    }
}
