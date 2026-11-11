import Item from './item.js';

export default class BulletItem extends Item {
    constructor(options = {}) {
        super({
            type: 'bullet',
            name: 'Bullet',
            amount: 64,
            maxStack: 64,
            cooldown: 8,
            icon: { shape: 'cube', color: [0, 0, 0], scale: [0.25, 0.25, 0.25] },
            ...options,
        });
    }

    use(player, world) {
        if (!player || !world) return false;
        player.shootBullet(world);
        return true;
    }
}
