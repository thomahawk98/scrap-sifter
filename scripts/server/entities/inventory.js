// Server-owned item stacks and slot operations. Screen layout and pointer
// handling live in the client InventoryView, which operates on this data.
export default class Inventory {
    constructor(presetName = null) {
        this.items = presetName ? this.getPreset(presetName) : [];
        this.selectedSlot = 0;
        this.WIDTH = 8;
        this.HEIGHT = 4;
        this.open = false;
    }

    getSelectedItem() {
        return this.items.find(item => item.slot == this.selectedSlot);
    }

    getPreset(preset) {
        switch (preset) {
            case 'default': return [];
            default:
                console.log('unrecognized preset: ', preset);
                return [];
        }
    }

    cleanupDeletedItems() {
        this.items = this.items.filter(item => !item.delete && item.amount > 0);
    }

    moveToBestIndex(item, combiningAllowed = true) {
        if (!this.items.includes(item)) {
            console.log('item is not in inventory, could not complete "Move to best index"', item);
            return false;
        }

        if (combiningAllowed) {
            const combinableItems = this.items.filter(candidate => this.canBeCombined(candidate, item));
            if (combinableItems.length > 0) {
                const itemsNotInTheSameRow = combinableItems.filter(candidate =>
                    Math.floor(candidate.slot / this.WIDTH) !== Math.floor(item.slot / this.WIDTH)
                );
                const items = itemsNotInTheSameRow.length > 0 && item.slot != null
                    ? itemsNotInTheSameRow
                    : combinableItems;
                items.sort((a, b) => a.slot - b.slot);
                const combinedFully = this.combineItems(items[0], item);
                if (!combinedFully) this.moveToBestIndex(item, false);
            }
        }

        const emptySlotIndexes = [];
        for (let slot = 0; slot < this.WIDTH * this.HEIGHT; slot++) {
            const occupied = this.items.find(candidate => candidate.slot == slot && !candidate.delete);
            if (!occupied) emptySlotIndexes.push(slot);
        }

        if (emptySlotIndexes.length === 0) {
            item.delete = true;
            return false;
        }

        const slotsNotInTheSameRow = emptySlotIndexes.filter(slot =>
            Math.floor(slot / this.WIDTH) !== Math.floor(item.slot / this.WIDTH)
        );
        const indexes = slotsNotInTheSameRow.length > 0 && item.slot != null
            ? slotsNotInTheSameRow
            : emptySlotIndexes;
        item.slot = indexes[0];
        return true;
    }

    canBeCombined(stationaryItem, movingItem) {
        if (!stationaryItem || !movingItem) return false;
        if (JSON.stringify(stationaryItem) === JSON.stringify(movingItem)) return false;
        if (typeof stationaryItem !== 'object' || typeof movingItem !== 'object') return false;
        if (stationaryItem.type !== movingItem.type) return false;
        if (stationaryItem.amount >= (stationaryItem.maxStack || 64)) return false;
        return true;
    }

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

    swapItemsBySlot(slot1, slot2) {
        if (slot1 == null || slot2 == null) return false;
        const item1 = this.items.find(item => item.slot == slot1 && !item.delete);
        const item2 = this.items.find(item => item.slot == slot2 && !item.delete);
        if (this.canBeCombined(item1, item2)) return this.combineItems(item1, item2);

        if (item1) item1.slot = slot2;
        if (item2) item2.slot = slot1;
    }
}
