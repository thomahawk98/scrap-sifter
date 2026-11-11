import { getBlockFaceColor } from '../shared/block-stats.js';

// Keep a visual fallback for usable items if a server snapshot omits icon data.
const ITEM_ICON_FALLBACKS = {
    bullet: { shape: 'cube', color: [0, 0, 0], scale: [0.25, 0.25, 0.25] },
    bomb: { shape: 'cube', color: [1, 0.35, 0], scale: [0.35, 0.35, 0.35] },
};

export default class InventoryView {
    constructor(player, onSlotClick = () => {}, textureAtlas = null) {
        this.player = player;
        this.onSlotClick = onSlotClick;
        this.textureAtlas = textureAtlas;
        this.textureImages = new Map();
        this.SLOT_SIZE = 70;
        this.SLOT_SPACING = 85;
        this.openAnimation = 0; //0 = closed, 100 = open
        this.wasInventoryClick = false;
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
            if (item) this.drawItem(ctx, item, x, y);

            ctx.globalAlpha = 1;
        }

        // Show the server-owned cursor stack following the pointer while open.
        if (this.open && this.inventory.cursorItem) {
            const { x, y } = this.player.inputs.mouse;
            this.drawItem(ctx, this.inventory.cursorItem, x, y);
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
        const icon = item.icon ?? ITEM_ICON_FALLBACKS[item.type] ?? {
            shape: 'cube',
            color: getBlockFaceColor(item.type, [0, 1, 0]),
            scale: [1, 1, 1],
        };

        const texture = icon.texture ?? {
            category: item.kind === 'block' ? 'block' : 'entity',
            name: item.type,
        };
        const texturesEnabled = texture.category === 'block'
            ? this.textureAtlas?.blockTexturesEnabled
            : this.textureAtlas?.entityTexturesEnabled;
        const textureImage = texturesEnabled ? this.getTextureImage(texture.name, texture.category) : null;

        // Draw the model first so the label strip and text remain in front.
        if (icon.shape === 'cube') this.drawIsometricCube(ctx, icon, x, y + 4, textureImage);

        // Keep a readable label and count around the compact 3D model preview.
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
        ctx.fillText(item.name ?? item.type, x, y - this.SLOT_SIZE * 0.4 + 10);

        //draw item amount
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.font = "bold 20px Tahoma";
        ctx.fillText(item.amount, x + this.SLOT_SIZE * 0.4 - 5, y + this.SLOT_SIZE * 0.4);
    }

    getTextureImage(name, category) {
        const assetName = `${name}-${category}`;
        if (this.textureImages.has(assetName)) return this.textureImages.get(assetName);
        if (!this.textureAtlas) return null;

        // Cache the pending request too, so the HUD only loads each item sheet once.
        this.textureImages.set(assetName, null);
        this.textureAtlas.getObjectImage(assetName).then(image => {
            this.textureImages.set(assetName, image);
        });
        return null;
    }

    drawIsometricCube(ctx, icon, centerX, centerY, textureImage = null) {
        const scale = icon.scale ?? [1, 1, 1];
        // Map world units to pixels so relative projectile sizes stay visible.
        const unit = this.SLOT_SIZE * 0.75;
        const half = scale.map(value => value * unit * 0.5);
        const [hx, hy, hz] = half;
        const project = (x, y, z) => [centerX + x - z, centerY + (x + z) * 0.5 - y];
        const color = icon.color ?? [1, 1, 1];

        const drawFace = (vertices, shade, textureFace) => {
            const projected = vertices.map(([px, py, pz]) => project(px, py, pz));
            ctx.beginPath();
            projected.forEach(([screenX, screenY], index) => {
                if (index === 0) ctx.moveTo(screenX, screenY);
                else ctx.lineTo(screenX, screenY);
            });
            ctx.closePath();

            if (textureImage && textureImage.width % 3 === 0 && textureImage.height % 2 === 0) {
                const sourceSize = textureImage.width / 3;
                if (sourceSize === textureImage.height / 2) {
                    const cells = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];
                    const [column, row] = cells[textureFace];
                    const p0 = projected[0], p1 = projected[1], p3 = projected[3];
                    const sourceX = column * sourceSize, sourceY = row * sourceSize;
                    ctx.save();
                    ctx.clip();
                    ctx.imageSmoothingEnabled = this.textureAtlas.smoothingEnabled;
                    // Map the same face UVs as the 3D mesh; the vertical flip
                    // accounts for WebGL UVs having their origin at bottom-left.
                    ctx.transform(
                        p1[0] - p0[0], p1[1] - p0[1],
                        p3[0] - p0[0], p3[1] - p0[1],
                        p0[0], p0[1],
                    );
                    ctx.translate(0, 1);
                    ctx.scale(1, -1);
                    ctx.drawImage(textureImage, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 1, 1);
                    ctx.restore();
                    return;
                }
            }

            ctx.fillStyle = shadeColor(color, shade);
            ctx.fill();
        };

        // Draw the two visible sides first, then the top face for clean edges.
        drawFace([
            [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
        ], 0.62, 0);
        drawFace([
            [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz],
        ], 0.8, 4);
        drawFace([
            [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz],
        ], 1.15, 2);
    }

    update(canvas, deltaScale = 1) {
        const inventoryClick = this.player.inputs.consumeMousePress
            ? this.player.inputs.consumeMousePress('inventoryClick')
            : this.player.inputs.isMouseDown
                ? this.player.inputs.isMouseDown('inventoryClick')
                : this.player.inputs.mouse.buttons[0];
        if (this.open && inventoryClick) {
            const slot = this.getMouseHoveredSlot(canvas);
            if (slot !== null) this.onSlotClick(slot);
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

function shadeColor(color, brightness) {
    // Keep even black item models readable against the translucent slot fill.
    const channels = color.map(value => Math.max(0.06, Math.min(1, value * brightness)) * 255);
    return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}
