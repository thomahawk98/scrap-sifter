// Inventory items keep their gameplay action and icon description together.
// The icon describes the same simple model used by its in-world counterpart.
export default class Item {
    // Store the common stack data and action parameters shared by item types.
    constructor({ type, kind = 'usable', name = type, amount = 1, slot = null, maxStack = 64, cooldown = 18, icon = null }) {
        this.type = type;
        this.kind = kind;
        this.name = name;
        this.amount = amount;
        this.slot = slot;
        this.maxStack = maxStack;
        this.cooldown = cooldown;
        this.icon = icon;
    }

    // Base items have no action; usable subclasses provide their own behavior.
    use() {
        return false;
    }

    // Socket snapshots serialize only item data; behavior remains server-side.
    toJSON() {
        return {
            type: this.type,
            kind: this.kind,
            name: this.name,
            amount: this.amount,
            slot: this.slot,
            maxStack: this.maxStack,
            cooldown: this.cooldown,
            icon: this.icon,
        };
    }
}
