const BLOCK_TYPE_BITS = 12;
const BLOCK_STATE_BITS = 4;
//total = 16 bits

export function encodeBlock(block) {
    if (!block || block.type === 'air') return 0;
    const type = BlockRegistry.getBlockTypeNumber(block.type) & 0xFFF;
    const state = BlockRegistry.getBlockStateNumber(block.type, block.state) & 0xF;

    const value = (state << BLOCK_TYPE_BITS) | type;
    return value;
}

export function decodeBlock(value) {
    const typeNum = value & 0xFFF;
    const stateNum = (value >> BLOCK_TYPE_BITS) & 0xF;

    const type = BlockRegistry.getBlockTypeFromNumber(typeNum);
    const state = BlockRegistry.getBlockStateFromNumber(type, stateNum);

    return { type, state };
}

const BlockRegistry = {
    blockTypes: {
        'air': 0,
        'grass': 1,
        'dirt': 2,
        'stone': 3,
        'wood': 4,
        'rock': 5,
        'concrete': 6,
        'withered grass': 7,
        'dead grass': 8,
        
    },
    blockStates: {},
    getBlockTypeNumber(type) {
        return this.blockTypes[type] || 0;
    },
    getBlockTypeFromNumber(num) {
        for (const [type, number] of Object.entries(this.blockTypes)) {
            if (number === num) return type;
        }
        return 'air';
    },
    getBlockStateNumber(type, state) {
        const states = this.blockStates[type];
        if (!states) return 0;
        return states.indexOf(state) || 0;
    },
    getBlockStateFromNumber(type, num) {
        const states = this.blockStates[type];
        if (!states) return null;
        return states[num] || null;
    },
}