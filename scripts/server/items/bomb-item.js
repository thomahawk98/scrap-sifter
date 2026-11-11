import Item from './item.js';

export default class BombItem extends Item {
    // Configure the bomb stack size, cooldown, and matching inventory icon.
    constructor(options = {}) {
        super({
            type: 'bomb',
            name: 'Bomb',
            amount: 16,
            maxStack: 16,
            cooldown: 25,
            icon: {
                shape: 'cube', color: [1, 0.35, 0], scale: [0.35, 0.35, 0.35],
                texture: { category: 'entity', name: 'bomb' },
            },
            ...options,
        });
    }

    // Launch a bomb only when a valid player and world are available.
    use(player, world) {
        if (!player || !world) return false;
        player.shootBomb(world);
        return true;
    }
}
