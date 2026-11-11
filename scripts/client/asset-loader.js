const MANIFEST_URL = '/asset-manifest';
const AUDIO_EXTENSIONS = /\.(ogg|mp3|wav|webm|m4a)$/i;

// Preloads browser assets before the game connects to the world server. Loaded
// resources are passed directly to renderers/processors so they are not fetched twice.
export default class AssetLoader {
    // Prepare the progress surface and resource maps before preloading begins.
    constructor(canvas) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.images = new Map();
        this.audios = new Map();
        this.fonts = new Map();
        this.audioContext = null;
        this.errors = [];
        this.loadedAssets = 0;
        this.totalAssets = 0;
        this.startedAt = performance.now();
    }

    // Fetch the asset manifest, load each media group, and report completion.
    async load() {
        this.fitCanvas();
        this.drawProgress('Finding assets');

        const response = await fetch(MANIFEST_URL);
        if (!response.ok) throw new Error(`Asset manifest request failed (${response.status}).`);
        const manifest = await response.json();
        const groups = [
            ['images', manifest.images ?? []],
            ['audios', manifest.audios ?? []],
            ['fonts', manifest.fonts ?? []],
        ];
        this.totalAssets = groups.reduce((count, [, assets]) => count + assets.length, 0);
        this.drawProgress('Loading assets');

        const tasks = [];
        for (const [kind, assets] of groups) {
            for (const asset of assets) tasks.push(this.loadOne(kind, asset));
        }
        await Promise.all(tasks);
        this.drawProgress(this.errors.length ? 'Loaded with some unavailable assets' : 'Loading complete');
        return this;
    }

    // Load one image, decoded audio buffer, or registered browser font.
    async loadOne(kind, asset) {
        try {
            if (kind === 'images') {
                const bitmap = await createImageBitmap(await this.fetchBlob(asset.url));
                this.storeAsset(this.images, asset, bitmap);
            } else if (kind === 'audios') {
                const context = this.getAudioContext();
                if (!context) throw new Error('Web Audio is unavailable.');
                const data = await this.fetchBlob(asset.url).then(blob => blob.arrayBuffer());
                const buffer = await context.decodeAudioData(data);
                this.storeAsset(this.audios, asset, buffer);
            } else if (kind === 'fonts') {
                const fontName = asset.name.replace(/\.[^.]+$/, '');
                const face = await new FontFace(fontName, `url("${asset.url}")`).load();
                document.fonts.add(face);
                this.storeAsset(this.fonts, asset, face);
            }
        } catch (error) {
            this.errors.push({ asset, error });
            console.warn(`Could not preload asset ${asset.name}: ${error.message}`);
        } finally {
            this.loadedAssets++;
            this.drawProgress('Loading assets');
        }
    }

    // Fetch a successful asset response as a blob for media decoders.
    async fetchBlob(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Request failed (${response.status}).`);
        return response.blob();
    }

    // Index each resource by filename, basename, and manifest URL.
    storeAsset(map, asset, value) {
        const filename = asset.name;
        const basename = filename.replace(/\.[^.]+$/, '');
        map.set(filename, value);
        map.set(basename, value);
        map.set(asset.url, value);
    }

    // Resolve a preloaded image through the asset loader's async interface.
    getImage(name) {
        return Promise.resolve(this.images.get(name) ?? null);
    }

    // Resolve audio by either extensionless key or its known filename.
    getAudio(name) {
        const filename = AUDIO_EXTENSIONS.test(name) ? name : `${name}.mp3`;
        return this.audios.get(name) ?? this.audios.get(filename) ?? null;
    }

    // Lazily construct one Web Audio context for preload and playback.
    getAudioContext() {
        if (this.audioContext) return this.audioContext;
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (AudioContextClass) this.audioContext = new AudioContextClass();
        return this.audioContext;
    }

    // Match the progress canvas drawing buffer to its on-screen dimensions.
    fitCanvas() {
        const bounds = this.canvas.getBoundingClientRect();
        this.canvas.width = Math.max(1, Math.round(bounds.width));
        this.canvas.height = Math.max(1, Math.round(bounds.height));
    }

    // Draw the current preload message and proportional completion bar.
    drawProgress(message) {
        const { context: ctx, canvas } = this;
        const progress = this.totalAssets ? this.loadedAssets / this.totalAssets : 0;
        const centerX = canvas.width * 0.5;
        const centerY = canvas.height * 0.5;
        const lineWidth = Math.min(420, canvas.width * 0.7);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px Tahoma';
        ctx.fillText(message, centerX, centerY - 28);
        ctx.font = '16px Tahoma';
        ctx.fillText(`${this.loadedAssets} / ${this.totalAssets}`, centerX, centerY + 34);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(centerX - lineWidth * 0.5, centerY + 4);
        ctx.lineTo(centerX + lineWidth * 0.5, centerY + 4);
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(centerX - lineWidth * 0.5, centerY + 4);
        ctx.lineTo(centerX - lineWidth * 0.5 + lineWidth * progress, centerY + 4);
        ctx.stroke();
    }
}
