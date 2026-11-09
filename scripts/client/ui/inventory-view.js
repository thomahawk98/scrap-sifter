import { getBlockFaceColor } from '../../server/core/block-stats.js';
export default class InventoryView {
    constructor(player) {
        this.player = player;
        this.SLOT_SIZE = 70;
        this.SLOT_SPACING = 85;
        this.openAnimation = 0; //0 = closed, 100 = open
    }

    get inventory() { return this.player.inventory; }
    get items() { return this.inventory.items; }
    get selectedSlot() { return this.inventory.selectedSlot; }
    get WIDTH() { return this.inventory.WIDTH; }
    get HEIGHT() { return this.inventory.HEIGHT; }
    get open() { return this.inventory.open; }

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

        this.inventory.cleanupDeletedItems();

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

    swapItemsBySlot(slot1, slot2) {
        return this.inventory.swapItemsBySlot(slot1, slot2);
    }

    moveToBestIndex(item) {
        return this.inventory.moveToBestIndex(item);
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
