const AUDIO_ASSET_ROOT = '/assets/audio/';
const DEFAULT_MAX_DISTANCE = 192;
const MIN_MUFFLE_FREQUENCY = 550;
const MAX_MUFFLE_FREQUENCY = 22000;
const NEAR_FIELD_PAN_DISTANCE = 10;
const DISTANCE_MUFFLE_AMOUNT = 0.95;
const DISTANCE_MUFFLE_CURVE = 0.9;
const DISTANCE_VOLUME_CURVE = 2;
const OCCLUSION_VOLUME_TRANSMISSION = 0.55;
const OCCLUSION_RAY_RADIUS = 2;
const MAX_AUDIO_EVENT_AGE_MS = 2000;

// All sound sources, including local UI sounds and server events, pass through
// this processor so listener-specific effects stay entirely client-side.
export default class AudioProcessor {
    // Bind world queries, listener position, preload assets, and buffer caches.
    constructor({ world, getListener, assetRoot = AUDIO_ASSET_ROOT, assetLoader = null } = {}) {
        this.world = world;
        this.getListener = getListener ?? (() => null);
        this.assetRoot = assetRoot.endsWith('/') ? assetRoot : `${assetRoot}/`;
        this.assetLoader = assetLoader;
        this.context = assetLoader?.audioContext ?? null;
        this.buffers = new Map();
        this.warnedNames = new Set();
    }

    // Play a client-originated sound through the same effects path as network events.
    playLocal(audioType, options = {}) {
        return this.play({
            scope: 'local', audioType, position: null,
            volume: options.volume ?? 1, muffle: 0, pitch: options.pitch ?? 1,
        });
    }

    // Validate and timestamp an incoming event before asynchronous loading begins.
    play(event) {
        if (!event || typeof event.audioType !== 'string') return Promise.resolve(false);
        return this.playAsync(event, performance.now());
    }

    // Resume audio if needed, build the effect chain, and release nodes after playback.
    async playAsync(event, receivedAt) {
        const context = this.getContext();
        if (!context) return false;

        try {
            if (context.state === 'suspended') await context.resume();
            const buffer = await this.getBuffer(event.audioType);
            // A slow asset fetch should not replay an old positional sound late.
            if (!buffer || performance.now() - receivedAt > MAX_AUDIO_EVENT_AGE_MS) return false;

            const effects = this.getEffects(event);
            const source = context.createBufferSource();
            const filter = context.createBiquadFilter();
            const gain = context.createGain();
            let panner = null;
            source.buffer = buffer;
            source.playbackRate.value = effects.pitch;
            filter.type = 'lowpass';
            filter.frequency.value = effects.cutoff;
            gain.gain.value = effects.volume;
            source.connect(filter);
            filter.connect(gain);

            if (typeof context.createStereoPanner === 'function') {
                panner = context.createStereoPanner();
                panner.pan.value = effects.pan;
                gain.connect(panner);
                panner.connect(context.destination);
            } else {
                gain.connect(context.destination);
            }

            // Release the short-lived Web Audio nodes as soon as playback ends.
            source.onended = () => {
                source.disconnect();
                filter.disconnect();
                gain.disconnect();
                panner?.disconnect();
            };
            source.start();
            return true;
        } catch (error) {
            this.warnOnce(event.audioType, `Could not play audio "${event.audioType}": ${error.message}`);
            return false;
        }
    }

    // Reuse the preloaded context or lazily construct browser Web Audio support.
    getContext() {
        if (this.context) return this.context;
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContextClass) {
            this.warnOnce('audio-context', 'Web Audio is not available in this browser.');
            return null;
        }
        this.context = new AudioContextClass();
        return this.context;
    }

    // Reuse, preload, or fetch a decoded sound buffer for the requested asset.
    async getBuffer(audioType) {
        if (this.buffers.has(audioType)) return this.buffers.get(audioType);
        const preloaded = this.assetLoader?.getAudio(audioType);
        if (preloaded) {
            this.buffers.set(audioType, preloaded);
            return preloaded;
        }

        const isBlockBreakSound = audioType.endsWith('-broken') && audioType !== 'block-broken.mp3';
        const loading = this.loadBuffer(audioType, !isBlockBreakSound).then(buffer => {
            if (buffer || !isBlockBreakSound) return buffer;
            return this.getBuffer('block-broken.mp3');
        });
        this.buffers.set(audioType, loading);
        const buffer = await loading;
        this.buffers.set(audioType, buffer);
        return buffer;
    }

    // Fetch and decode one file, optionally keeping missing-asset logs quiet.
    async loadBuffer(audioType, warnOnMissing = true) {
        const filename = /\.(ogg|mp3|wav|webm|m4a)$/i.test(audioType)
            ? audioType
            : `${audioType}.mp3`;
        const response = await fetch(`${this.assetRoot}${encodeURIComponent(filename)}`);
        if (!response.ok) {
            if (warnOnMissing) this.warnOnce(audioType, `Audio asset not found: ${this.assetRoot}${filename}`);
            return null;
        }
        const data = await response.arrayBuffer();
        return this.getContext().decodeAudioData(data);
    }

    // Calculate attenuation, stereo pan, and filtering for this listener and source.
    getEffects(event) {
        const isPositional = event.scope === 'world' || (event.scope === 'player' && event.position);
        const listener = isPositional ? this.getListener() : null;
        if (!isPositional || !listener?.position || !event.position) {
            return {
                volume: clamp(event.volume ?? 1, 0, 1),
                pan: 0,
                cutoff: MAX_MUFFLE_FREQUENCY,
                pitch: event.scope === 'global' ? 1 : clamp(event.pitch ?? 1, 0.25, 4),
            };
        }

        const offset = event.position.map((value, axis) => value - listener.position[axis]);
        const distance = Math.hypot(...offset);
        const maxDistance = Math.max(0.001, event.maxDistance ?? DEFAULT_MAX_DISTANCE);
        const distanceRatio = Math.min(1, distance / maxDistance);
        const direction = distance > 0 ? offset.map(value => value / distance) : [0, 0, 0];
        const right = listener.right ?? [1, 0, 0];
        const rawPan = clamp(direction.reduce((sum, value, axis) => sum + value * right[axis], 0), -1, 1);
        // Keep near-field sounds centered; small network position errors should
        // not make a sound fired beside the listener land in only one ear.
        const panRange = smoothstep(distance / NEAR_FIELD_PAN_DISTANCE);
        const pan = rawPan * panRange;
        const occlusion = this.measureOcclusion(listener.position, event.position);
        const distanceMuffle = DISTANCE_MUFFLE_AMOUNT * distanceRatio ** DISTANCE_MUFFLE_CURVE;
        const baseMuffle = clamp(event.muffle ?? 0, 0, 1);
        // Combine independent filters so distance and walls both contribute.
        const muffle = 1 - (1 - baseMuffle) * (1 - distanceMuffle) * occlusion.transmission;
        const distanceGain = (1 - distanceRatio) ** DISTANCE_VOLUME_CURVE;
        // Obstacles only remove high frequencies; distance alone controls loudness.
        const volume = clamp(event.volume ?? 1, 0, 1) * distanceGain;

        return {
            volume,
            pan,
            // Hearing is logarithmic in frequency, so exponential cutoff
            // interpolation makes distance and wall muffling audible sooner.
            cutoff: MAX_MUFFLE_FREQUENCY * (MIN_MUFFLE_FREQUENCY / MAX_MUFFLE_FREQUENCY) ** muffle,
            pitch: clamp(event.pitch ?? 1, 0.25, 4),
        };
    }

    // Estimate wall transmission across several nearby paths between listener and source.
    measureOcclusion(listenerPosition, sourcePosition) {
        if (!this.world?.getVoxelState) return { transmission: 1 };
        const vector = sourcePosition.map((value, axis) => value - listenerPosition[axis]);
        const distance = Math.hypot(...vector);
        if (distance < 1) return { transmission: 1 };

        // Treat nearby parallel paths as sound diffraction around corners.
        // Averaging transmission avoids the all-or-nothing behavior of a single ray.
        const direction = vector.map(value => value / distance);
        const reference = Math.abs(direction[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const side = normalize(cross(direction, reference));
        const vertical = cross(direction, side);
        const rayOffsets = [
            [0, 0],
            [OCCLUSION_RAY_RADIUS, 0], [-OCCLUSION_RAY_RADIUS, 0],
            [0, OCCLUSION_RAY_RADIUS], [0, -OCCLUSION_RAY_RADIUS],
            [OCCLUSION_RAY_RADIUS, OCCLUSION_RAY_RADIUS],
            [OCCLUSION_RAY_RADIUS, -OCCLUSION_RAY_RADIUS],
            [-OCCLUSION_RAY_RADIUS, OCCLUSION_RAY_RADIUS],
            [-OCCLUSION_RAY_RADIUS, -OCCLUSION_RAY_RADIUS],
        ];

        let totalTransmission = 0;
        for (const [sideOffset, verticalOffset] of rayOffsets) {
            const offset = side.map((value, axis) => value * sideOffset + vertical[axis] * verticalOffset);
            const origin = listenerPosition.map((value, axis) => value + offset[axis]);
            const target = sourcePosition.map((value, axis) => value + offset[axis]);
            totalTransmission += this.traceTransmission(origin, target);
        }
        return { transmission: totalTransmission / rayOffsets.length };
    }

    // Sample solid cells along one source path and attenuate repeated cell hits once.
    traceTransmission(origin, target) {
        const vector = target.map((value, axis) => value - origin[axis]);
        const distance = Math.hypot(...vector);
        const steps = Math.ceil(distance / 0.5);
        const solidCells = new Set();
        for (let step = 1; step < steps; step++) {
            const amount = step / steps;
            const point = origin.map((value, axis) => value + vector[axis] * amount);
            const cell = point.map(Math.floor);
            const state = this.world.getVoxelState(...cell);
            if (state === true) solidCells.add(cell.join(','));
        }
        return OCCLUSION_VOLUME_TRANSMISSION ** solidCells.size;
    }

    // Emit each asset or playback warning at most once per processor instance.
    warnOnce(key, message) {
        if (this.warnedNames.has(key)) return;
        this.warnedNames.add(key);
        console.warn(message);
    }
}

// Bound finite audio values and use the minimum when a payload is invalid.
function clamp(value, min, max) {
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

// Smooth a normalized distance into a near-field stereo pan response.
function smoothstep(value) {
    const amount = clamp(value, 0, 1);
    return amount * amount * (3 - 2 * amount);
}

// Build the perpendicular basis used to sample offset occlusion rays.
function cross(first, second) {
    return [
        first[1] * second[2] - first[2] * second[1],
        first[2] * second[0] - first[0] * second[2],
        first[0] * second[1] - first[1] * second[0],
    ];
}

// Normalize a direction vector while keeping a zero vector finite.
function normalize(vector) {
    const length = Math.hypot(...vector) || 1;
    return vector.map(value => value / length);
}
