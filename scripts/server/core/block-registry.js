const BLOCK_TYPE_BITS = 12;
const BLOCK_STATE_BITS = 4;
//total = 16 bits

// Pack the registered block type and state into one 16-bit voxel value.
export function encodeBlock(block) {
    if (!block || block.type === 'air') return 0;
    const type = BlockRegistry.getNumberFromBlockType(block.type) & 0xFFF;
    const state = BlockRegistry.getNumberFromBlockState(block.type, block.state) & 0xF;

    const value = (state << BLOCK_TYPE_BITS) | type;
    return value;
}

// Decode the compact voxel value into the public block record.
export function decodeBlock(value) {
    const typeNum = value & 0xFFF;
    const stateNum = (value >> BLOCK_TYPE_BITS) & 0xF;

    const type = BlockRegistry.getBlockTypeFromNumber(typeNum);
    const state = BlockRegistry.getBlockStateFromNumber(type, stateNum);

    return { type, state };
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
    // Resolve a block type's stable slot in this registry.
    getNumberFromBlockType(type) {
        return this.registry.indexOf(type);
    },
    // Convert unknown numeric IDs to the registry's fallback block type.
    getBlockTypeFromNumber(num) {
        return this.registry[num] || 'unknown';
    },
    // Block states currently use the default zero encoding.
    getNumberFromBlockState(type, state) {
        return 0;
    },
    // Block states currently decode to the default null value.
    getBlockStateFromNumber(type, num) {
        return null;
    },
}