import WorldMap from '../ui/world-map.js';

export default class Hud {
    // Bind the HUD canvas used for inventory, diagnostics, health, and crosshair.
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.worldMap = new WorldMap(canvas);
    }

    // Compose the inventory, diagnostics, health bar, and world map each frame.
    draw(debugTexts, player, inputs, inventoryView, world) {
        const ctx = this.ctx;
        const canvas = this.canvas;
        const cx = this.canvas.width * 0.5;
        const cy = this.canvas.height * 0.5;

        //clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        //draw player inventory
        inventoryView.draw(ctx, canvas, inputs);

        ctx.globalAlpha = 1;
        if (!player.menuOpen) this.drawCrosshair(ctx, cx, cy);

        this.drawDebugTexts(ctx, debugTexts);
        this.drawHealthBar(ctx, player);
        this.worldMap.draw(ctx, world, player);
    }

    // Draw current health and its threshold-colored fill in the upper corner.
    drawHealthBar(ctx, player) {
        const width = Math.min(220, Math.max(0, this.canvas.width - 32));
        const height = 16;
        const x = this.canvas.width - width - 16;
        const y = 24;
        const maxHealth = Math.max(1, player.maxHealth || 100);
        const health = Math.max(0, Math.min(maxHealth, player.health || 0));
        const fraction = health / maxHealth;

        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 4);
        ctx.fill();

        if (fraction > 0) {
            ctx.fillStyle = fraction > 0.5 ? '#45b649' : fraction > 0.25 ? '#e4b83f' : '#d8473f';
            ctx.beginPath();
            ctx.roundRect(x, y, width * fraction, height, 4);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.fillStyle = 'white';
        ctx.font = 'bold 13px Tahoma';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${Math.ceil(health)} / ${maxHealth}`, x + width, y - 4);
        ctx.restore();
    }

    // Draw the centered aim marker while the game has focus.
    drawCrosshair(ctx, cx, cy) {
        const size = 10;
        ctx.save();
        ctx.translate(cx, cy);

        ctx.lineWidth = 2;
        ctx.strokeStyle = 'black';
        ctx.beginPath();
        ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
        ctx.moveTo(0, -size); ctx.lineTo(0, size);
        ctx.stroke();
        ctx.fill();

        ctx.strokeStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
        ctx.moveTo(0, -size); ctx.lineTo(0, size);
        ctx.stroke();
        ctx.fill();

        ctx.restore();
    }

    // Place each diagnostic string at a fixed vertical interval.
    drawDebugTexts(ctx, debugTexts) {
        //debug info
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.font = 'bold 15px Tahoma';
        ctx.fillStyle = 'white';
        for (let i = 0; i < debugTexts.length; i++) {
            const text = debugTexts[i];
            ctx.fillText(text, 10, 10 + i * 20);
        }
    }

}
