const BLOCK_TYPE_BITS = 12;
const BLOCK_STATE_BITS = 4;
//total = 16 bits

export function encodeBlock(block) {
    if (!block || block.type === 'air') return 0;
    const type = BlockRegistry.getNumberFromBlockType(block.type) & 0xFFF;
    const state = BlockRegistry.getNumberFromBlockState(block.type, block.state) & 0xF;

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

// Meshing needs only the type name; skip allocating the `{ type, state }`
// record that the block interaction APIs use.
export function getBlockTypeFromId(value) {
    return BlockRegistry.getBlockTypeFromNumber(value & 0xFFF);
}

// these are valid blocks
const BlockRegistry = {
    registry: [
        'air', 'stone', 'rock', 'concrete',
        'grass', 'withered grass', 'dead grass', 'frozen grass', 'snowy grass',
        'dirt', 'red dirt', 'clay', 'red clay', 'mud',
        'wood', 'leaves',
        'glass',
        'red wool',
        'trash', 'scrap metal', 'sludge',
        'sand', 'sandstone', 'red sand', 'fertile sand',
        'snow', 'dirty snow', 'ice',
        'white salt', 'pink salt',
        'gold', 'diamonds',
        'coal', 'iron', 'copper', 'tin',
        'lead', 'silver', 'platinum', 'uranium',
        'ash', 'cinder', 'basalt',
        'limestone', 'granite', 'marble', 'slate', 'quartzite', 'shale',
        'magma',
        'unknown'
    ],
    states: [],
    getNumberFromBlockType(type) {
        return this.registry.indexOf(type);
    },
    getBlockTypeFromNumber(num) {
        return this.registry[num] || 'unknown';
    },
    getNumberFromBlockState(type, state) {
        return 0;
    },
    getBlockStateFromNumber(type, num) {
        return null;
    },
}
