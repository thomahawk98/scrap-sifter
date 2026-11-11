import Item from './item.js';

export default class BulletItem extends Item {
    // Configure the bullet stack size, cooldown, and matching inventory icon.
    constructor(options = {}) {
        super({
            type: 'bullet',
            name: 'Bullet',
            amount: 64,
            maxStack: 64,
            cooldown: 8,
            icon: {
                shape: 'cube', color: [0, 0, 0], scale: [0.25, 0.25, 0.25],
                texture: { category: 'entity', name: 'bullet' },
            },
            ...options,
        });
    }

    // Spawn a bullet only when a valid player and world are available.
    use(player, world) {
        if (!player || !world) return false;
        player.shootBullet(world);
        return true;
    }
}
