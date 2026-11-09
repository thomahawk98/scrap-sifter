import { getBlockFaceColor } from '../core/block-stats.js';
export default class Inventory {
    constructor(player, presetName = null) {
        this.player = player;
        if (presetName) this.items = this.getPreset(presetName);
        else this.items = [];
        this.selectedSlot = 0;

        // 8 slots by 4 slots
        this.WIDTH = 8;
        this.HEIGHT = 4;

        this.SLOT_SIZE = 70;
        this.SLOT_SPACING = 85;

        this.open = false;
        this.openAnimation = 0; //0 = closed, 100 = open
    }

    getSelectedItem() {
        const item = this.items.find(a => a.slot == this.selectedSlot);
        return item;
    }

    getPreset(preset) {
        switch (preset) {
            case 'default':
                return [];
            default:
                console.log('unrecognized preset: ', preset);
                return [];
        }
    }

    draw(ctx, canvas) {
        for (let i = 0; i < this.WIDTH * this.HEIGHT; i++) {
            const { x, y } = this.getDrawPosition(i, canvas);

            const alpha = i < this.WIDTH ? 1 : Math.max(0, this.openAnimation / 50 - 0.5);
            ctx.globalAlpha = alpha;

            //draw slot
            const s = this.SLOT_SIZE;
            const inBox = this.player.inputs.mouse.inBox(x - s * 0.5, y - s * 0.5, s, s);
            const selected = this.selectedSlot == i;
            this.drawSlot(ctx, x, y, selected, inBox);

            //draw item
            const item = this.items.find(a => a.slot == i && !a.delete);
            if (!item) continue;
            this.drawItem(ctx, item, x, y);

            ctx.globalAlpha = 1;
        }

    }

    drawSlot(ctx, x, y, selected, inBox) {
        ctx.fillStyle = inBox ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.15)';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = selected ? 4 : inBox ? 3 : 2;

        //draw empty slot
        ctx.beginPath();
        ctx.roundRect(x - this.SLOT_SIZE * 0.5, y - this.SLOT_SIZE * 0.5, this.SLOT_SIZE, this.SLOT_SIZE, 10);
        ctx.fill();
        ctx.stroke();
    }

    drawItem(ctx, item, x, y) {
        // draw item icon
        var rgbs = getBlockFaceColor(item.type, [0, 1, 0]);
        ctx.fillStyle = `rgb(${rgbs[0] * 255}, ${rgbs[1] * 255}, ${rgbs[2] * 255})`;
        ctx.fillRect(x - this.SLOT_SIZE * 0.4, y - this.SLOT_SIZE * 0.4, this.SLOT_SIZE * 0.8, this.SLOT_SIZE * 0.8);

        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.roundRect(x - this.SLOT_SIZE * 0.5, y - this.SLOT_SIZE * 0.5, this.SLOT_SIZE, 30, 10);
        ctx.fill();

        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';

        // draw item name
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "bold 16px Tahoma";
        ctx.fillText(`${item.type}`, x, y - this.SLOT_SIZE * 0.4 + 10);

        //draw item amount
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.font = "bold 20px Tahoma";
        ctx.fillText(item.amount, x + this.SLOT_SIZE * 0.4 - 5, y + this.SLOT_SIZE * 0.4);
    }

    update(canvas, deltaScale = 1) {
        //swap with keys
        for (let i = 0; i < this.WIDTH; i++) {
            const key = (i + 1).toString();
            const wasPressed = this.player.inputs.consumePress
                ? this.player.inputs.consumePress(`hotbar${i + 1}`)
                : this.player.inputs.keys[key];
            if (wasPressed) {
                const slot1 = i;
                const slot2 = this.getMouseHoveredSlot(canvas);
                this.swapItemsBySlot(slot1, slot2);

                if (this.player.inputs.keys) this.player.inputs.keys[key] = false;
            }
        }

        const inventoryClick = this.player.inputs.isMouseDown
            ? this.player.inputs.isMouseDown('inventoryClick')
            : this.player.inputs.mouse.buttons[0];
        if (inventoryClick) {
            const slot = this.getMouseHoveredSlot(canvas);
            const item = this.items.find(a => a.slot == slot && !a.delete);
            const quickMove = this.player.inputs.isDown
                ? this.player.inputs.isDown('quickMove')
                : this.player.inputs.keys['shift'];
            if (quickMove) {
                if (item) this.moveToBestIndex(item);
            }
        }

        //remove deleted items
        this.items = this.items.filter(a => !a.delete && a.amount > 0);

        //update animation
        const animationStep = 5 * deltaScale;
        if (this.open) this.openAnimation = Math.min(this.openAnimation + animationStep, 100);
        else this.openAnimation = Math.max(this.openAnimation - animationStep, 0);
    }

    getMouseHoveredSlot(canvas) {
        for (let i = 0; i < this.WIDTH * this.HEIGHT; i++) {
            const { x, y } = this.getDrawPosition(i, canvas);
            const inBox = this.player.inputs.mouse.inBox(
                x - this.SLOT_SIZE * 0.5,
                y - this.SLOT_SIZE * 0.5,
                this.SLOT_SIZE,
                this.SLOT_SIZE
            );
            if (!inBox) continue;
            return i;
        }
        return null;
    }

    moveToBestIndex(item, combiningAllowed = true) {

        //check to ensure item is in inventory
        if (!this.items.includes(item)) {
            console.log('item is not in inventory, could not complete "Move to best index"', item);
            return false;
        }

        //attempt to combine with other items
        if (combiningAllowed) {
            const combinableItems = this.items
                .filter(a => this.canBeCombined(a, item));

            if (combinableItems.length > 0) {
                let items = [];
                const itemsNotInTheSameRow = combinableItems
                    .filter(a => Math.floor(a.slot / this.WIDTH) !== Math.floor(item.slot / this.WIDTH));

                //only filter for items not in the same row if there are any
                items = itemsNotInTheSameRow.length > 0 && (item.slot !== undefined && item.slot !== null) ?
                    itemsNotInTheSameRow : combinableItems;
                items.sort((a, b) => a.slot - b.slot);

                //combine the item (run it thorugh again if it was not combined fully)
                const combinedFully = this.combineItems(items[0], item);
                if (!combinedFully) this.moveToBestIndex(item, false);
            }
        }

        //move item to an empty slot
        const emptySlotIndexes = [];
        for (let i = 0; i < this.WIDTH * this.HEIGHT; i++) {
            const occupied = this.items.find(a => a.slot == i && !a.delete);
            if (!occupied) emptySlotIndexes.push(i);
        }

        if (emptySlotIndexes.length > 0) {

            //get a list of empty slots not in the same row as the item
            const slotsNotInTheSameRow = emptySlotIndexes
                .filter(i => Math.floor(i / this.WIDTH) !== Math.floor(item.slot / this.WIDTH));
            const indexes = slotsNotInTheSameRow.length > 0 && (item.slot !== undefined && item.slot !== null) ?
                slotsNotInTheSameRow : emptySlotIndexes;

            //move the item to the first available empty slot
            const targetIndex = indexes[0];
            item.slot = targetIndex;
            //console.log(`moved item ${item} to slot ${targetIndex}`);
        } else {
            //no empty slots, drop the item
            item.delete = true;
            return false;
        }

        //item successfully moved
        return true;
    }

    //stationary item, moving item
    canBeCombined(sItem, mItem) {
        if (!sItem || !mItem) return false; //one of the items is null
        if (JSON.stringify(sItem) === JSON.stringify(mItem)) return false; //same item 
        if (typeof sItem !== 'object' || typeof mItem !== 'object') return false;
        if (sItem.type !== mItem.type) return false;
        if (sItem.amount >= (sItem.maxStack || 64)) return false;
        return true;
    }

    combineItems(sItem, mItem) {
        if (!this.canBeCombined(sItem, mItem)) return null; //item could not be combined
        const spaceLeftInTargetItemStack = (sItem.maxStack || 64) - sItem.amount;
        const amountToMove = Math.min(spaceLeftInTargetItemStack, mItem.amount);

        sItem.amount += amountToMove;
        mItem.amount -= amountToMove;

        if (mItem.amount <= 0) {
            mItem.delete = true;
            return true; //item combined fully
        } else {
            return false; //item still has some amount left
        }
    }

    swapItemsBySlot(slot1, slot2) {
        if (slot1 == null || slot2 == null) return false;
        const item1 = this.items.find(a => a.slot == slot1 && !a.delete);
        const item2 = this.items.find(a => a.slot == slot2 && !a.delete);

        //check if items can be combined
        const canBeCombined = this.canBeCombined(item1, item2);
        if (canBeCombined) return this.combineItems(item1, item2);

        //swap the items
        if (item1) item1.slot = slot2;
        if (item2) item2.slot = slot1;
    }

    getDrawPosition(slot, canvas) {
        const row = Math.floor(slot / this.WIDTH);
        const col = slot % this.WIDTH;
        const gap = this.SLOT_SPACING - this.SLOT_SIZE;

        const openStartX = canvas.width * 0.5 - ((this.WIDTH - 1) * this.SLOT_SPACING) * 0.5;
        const openStartY = canvas.height * 0.5 - ((this.HEIGHT - 1) * this.SLOT_SPACING) * 0.5;
        const openX = openStartX + col * this.SLOT_SPACING;
        const openY = openStartY + Math.modulo(row - 1, this.HEIGHT) * this.SLOT_SPACING;

        const closedStartX = canvas.width * 0.5 - ((this.WIDTH - 1) * this.SLOT_SPACING) * 0.5;
        const closedStartY = canvas.height - (gap + this.SLOT_SIZE * 0.5);
        const closedX = closedStartX + col * this.SLOT_SPACING;
        const closedY = closedStartY + row * this.SLOT_SPACING;

        const t = Math.easeInOut(this.openAnimation / 100);
        const x = Math.lerp(closedX, openX, t);
        const y = Math.lerp(closedY, openY, t);
        return { x, y };
    }
}
