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

//these are valid blocks
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
        'leaves': 9,
        'gold': 10,
        'diamonds': 11,
        'glass': 12,
        'red wool': 13,
        'trash': 14,
        'scrap metal': 15,
        'sludge': 16,
        'sand': 17,
        'sandstone': 18,
        'snow': 19,
        'dirty snow': 20,
        'ice': 21,
        'white salt': 22,
        'pink salt': 23,
        'red sand': 24,
        'fertile sand': 25,
        'red dirt': 26,
        'clay': 27,
        'red clay': 28,
        'mud': 29,
        'peat': 30,
        'charcoal': 31,

        'coal': 32,
        'iron': 33,
        'copper': 34,
        'tin': 35,
        'aluminum': 36,
        'lead': 37,
        'silver': 38,
        'platinum': 39,
        'uranium': 40,

        'ash': 41,
        'cinder': 42,
        'basalt': 43,
        'limestone': 44,
        'granite': 45,
        'marble': 46,
        'slate': 47,
        'quartzite': 48,
        'shale': 49,

        'frozen grass': 50,
        'snowy grass': 51,

        'magma': 52
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