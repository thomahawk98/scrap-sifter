const MAX_PENDING_AUDIO_EVENTS = 512;
// Positional sounds fade to silence at this distance; individual sounds can
// opt into a shorter or longer range through playWorld options.
export const AUDIO_HEARING_DISTANCE_UNITS = 192;

// The server records sound events without making playback or acoustic decisions.
// The network layer drains this queue and filters positional events per player.
export default class WorldAudioSystem {
    constructor() {
        this.nextEventId = 1;
        this.pendingEvents = [];
    }

    playWorld(audioType, position, { volume = 1, maxDistance = AUDIO_HEARING_DISTANCE_UNITS, muffle = 0, pitch = 1 } = {}) {
        if (!isValidAudioType(audioType) || !isValidPosition(position)) return null;
        return this.enqueue({
            scope: 'world', audioType, position: [...position], volume,
            maxDistance, muffle, pitch,
        });
    }

    playGlobal(audioType, { volume = 1 } = {}) {
        if (!isValidAudioType(audioType)) return null;
        return this.enqueue({
            scope: 'global', audioType, position: null, volume,
            maxDistance: null, distance: 0, muffle: 0, pitch: 1,
        });
    }

    playForPlayer(playerId, audioType, { volume = 1, position = null, maxDistance = null, muffle = 0, pitch = 1 } = {}) {
        if (!Number.isInteger(playerId) || !isValidAudioType(audioType)) return null;
        if (position !== null && !isValidPosition(position)) return null;
        return this.enqueue({
            scope: 'player', playerId, audioType,
            position: position ? [...position] : null,
            volume, maxDistance, muffle, pitch,
        });
    }

    enqueue(event) {
        if (this.pendingEvents.length >= MAX_PENDING_AUDIO_EVENTS) this.pendingEvents.shift();
        const normalized = {
            id: this.nextEventId++,
            ...event,
            volume: clamp(event.volume, 0, 1),
            muffle: clamp(event.muffle, 0, 1),
            pitch: clamp(event.pitch, 0.25, 4),
        };
        if (normalized.maxDistance !== null) normalized.maxDistance = Math.max(0, normalized.maxDistance);
        this.pendingEvents.push(normalized);
        return normalized.id;
    }

    drainEvents() {
        const events = this.pendingEvents;
        this.pendingEvents = [];
        return events;
    }
}

function isValidAudioType(value) {
    return typeof value === 'string' &&
        /^[a-z0-9][a-z0-9 _-]{0,63}(?:\.(?:ogg|mp3|wav|webm|m4a))?$/i.test(value);
}

function isValidPosition(position) {
    return Array.isArray(position) && position.length === 3 && position.every(Number.isFinite);
}

function clamp(value, min, max) {
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}
