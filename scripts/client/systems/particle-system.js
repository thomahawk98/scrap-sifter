const MAX_PARTICLES = 1800;

// Client simulation for short-lived visual effects; particles are never networked individually.
export default class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    update(deltaScale = 1) {
        for (let index = this.particles.length - 1; index >= 0; index--) {
            const particle = this.particles[index];
            particle.life -= deltaScale;
            if (particle.life <= 0) {
                this.particles.splice(index, 1);
                continue;
            }
            particle.velocity[1] -= 0.002 * deltaScale;
            for (let axis = 0; axis < 3; axis++) {
                particle.pos[axis] += particle.velocity[axis] * deltaScale;
                particle.velocity[axis] *= Math.pow(0.985, deltaScale);
            }
            particle.color[3] = Math.min(1, particle.life / particle.maxLife);
        }
    }

    spawnExplosion(position) {
        this.emit(position, [1, 0.38, 0.06], 100, 0.7, 30, 0.28, 0.56);
        this.emit(position, [1, 0.82, 0.2], 36, 0.35, 15, 0.18, 0.36);
    }

    spawnBlockBreak(position, color) {
        this.emit(position, color, 12, 0.125, 22, 0.08, 0.16);
    }

    spawnEntityDeath(position, color) {
        this.emit(position, color, 44, 0.225, 32, 0.1, 0.2);
    }

    handleEvent(event) {
        if (!event?.position) return;
        if (event.type === 'explosion') this.spawnExplosion(event.position);
        else if (event.type === 'entity-death') this.spawnEntityDeath(event.position, event.color ?? [1, 1, 1]);
    }

    emit(position, color, count, speed, life, minSize, maxSize) {
        for (let index = 0; index < count && this.particles.length < MAX_PARTICLES; index++) {
            const direction = randomDirection();
            const velocityScale = speed * (0.35 + Math.random() * 0.65);
            const particleLife = life * (0.65 + Math.random() * 0.7);
            const tint = 0.75 + Math.random() * 0.25;
            this.particles.push({
                pos: [...position],
                velocity: direction.map(value => value * velocityScale),
                color: [color[0] * tint, color[1] * tint, color[2] * tint, 1],
                size: minSize + Math.random() * (maxSize - minSize),
                life: particleLife,
                maxLife: particleLife,
            });
        }
    }
}

function randomDirection() {
    const y = Math.random() * 2 - 1;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(1 - y * y);
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
}
