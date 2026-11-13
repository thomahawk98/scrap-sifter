// Server-owned item stacks and slot operations. Screen layout and pointer
// handling live in the client InventoryView, which operates on this data.
import BulletItem from '../items/bullet-item.js';
import BombItem from '../items/bomb-item.js';

export default class Inventory {
    // Initialize a server-owned inventory and optionally seed a named preset.
    constructor(presetName = null) {
        this.items = presetName ? this.getPreset(presetName) : [];
        this.selectedSlot = 0;
        this.WIDTH = 4;
        this.HEIGHT = 3;
        this.open = false;
        this.cursorItem = null;
    }

    // Resolve the active usable stack while ignoring exhausted or deleted items.
    getSelectedItem() {
        return this.items.find(item => item.slot == this.selectedSlot && !item.delete && item.amount > 0);
    }

    // Apply an item's action and consume one unit only when it succeeds.
    useSelectedItem(user, world) {
        const item = this.getSelectedItem();
        if (!item || typeof item.use !== 'function' || !item.use(user, world)) return null;

        item.amount--;
        if (item.amount <= 0) item.delete = true;
        return item;
    }

    // Construct the existing named inventory preset or return an empty inventory.
    getPreset(preset) {
        switch (preset) {
            case 'default': return [
                new BulletItem({ amount: 999, slot: 0 }),
                new BombItem({ amount: 999, slot: 1 }),
            ];
            default:
                console.log('unrecognized preset: ', preset);
                return [];
        }
    }

    // Remove exhausted stacks after the current inventory operation.
    cleanupDeletedItems() {
        this.items = this.items.filter(item => !item.delete && item.amount > 0);
    }

    // Add a world drop to a compatible stack, then the first open slot.
    // Merge compatible stacks before occupying the first free slot.
    addItem(item) {
        if (!item || item.amount <= 0) return false;
        item.maxStack ??= 64;
        for (const stack of this.items) {
            if (!this.canBeCombined(stack, item)) continue;
            this.combineItems(stack, item);
            if (item.amount <= 0) return true;
        }

        const occupiedSlots = new Set(this.items.filter(stack => !stack.delete).map(stack => stack.slot));
        const freeSlot = Array.from({ length: this.WIDTH * this.HEIGHT }, (_, slot) => slot)
            .find(slot => !occupiedSlots.has(slot));
        if (freeSlot === undefined) return false;
        item.slot = freeSlot;
        this.items.push(item);
        return true;
    }

    // Check whether two stacks have compatible serialized item values and capacity.
    canBeCombined(stationaryItem, movingItem) {
        if (!stationaryItem || !movingItem) return false;
        if (JSON.stringify(stationaryItem) === JSON.stringify(movingItem)) return false;
        if (typeof stationaryItem !== 'object' || typeof movingItem !== 'object') return false;
        if (stationaryItem.type !== movingItem.type) return false;
        if (stationaryItem.amount >= (stationaryItem.maxStack || 64)) return false;
        return true;
    }

    // Move as many units as possible into the stationary stack.
    combineItems(stationaryItem, movingItem) {
        if (!this.canBeCombined(stationaryItem, movingItem)) return null;
        const spaceLeft = (stationaryItem.maxStack || 64) - stationaryItem.amount;
        const amountToMove = Math.min(spaceLeft, movingItem.amount);
        stationaryItem.amount += amountToMove;
        movingItem.amount -= amountToMove;

        if (movingItem.amount <= 0) {
            movingItem.delete = true;
            return true;
        }
        return false;
    }

    // Exchange two slot assignments, combining stacks when their types match.
    swapItemsBySlot(slot1, slot2) {
        if (slot1 == null || slot2 == null) return false;
        const item1 = this.items.find(item => item.slot == slot1 && !item.delete);
        const item2 = this.items.find(item => item.slot == slot2 && !item.delete);
        if (this.canBeCombined(item1, item2)) return this.combineItems(item1, item2);

        if (item1) item1.slot = slot2;
        if (item2) item2.slot = slot1;
    }

    // A click picks up a stack, places it, merges compatible stacks, or swaps.
    // Handle the server-authoritative pickup, placement, merge, or swap action.
    clickSlot(slot) {
        if (!Number.isInteger(slot) || slot < 0 || slot >= this.WIDTH * this.HEIGHT) return false;
        this.cleanupDeletedItems();
        const slotIndex = this.items.findIndex(item => item.slot === slot && !item.delete);
        const slotItem = slotIndex === -1 ? null : this.items[slotIndex];

        if (!this.cursorItem) {
            if (!slotItem) return false;
            this.items.splice(slotIndex, 1);
            this.cursorItem = slotItem;
            this.cursorItem.slot = null;
            return true;
        }

        if (!slotItem) {
            this.cursorItem.slot = slot;
            this.items.push(this.cursorItem);
            this.cursorItem = null;
            return true;
        }

        if (this.canBeCombined(slotItem, this.cursorItem)) {
            const fullyCombined = this.combineItems(slotItem, this.cursorItem);
            if (fullyCombined) this.cursorItem = null;
            return true;
        }

        const heldItem = this.cursorItem;
        heldItem.slot = slot;
        this.items[slotIndex] = heldItem;
        slotItem.slot = null;
        this.cursorItem = slotItem;
        return true;
    }
}
