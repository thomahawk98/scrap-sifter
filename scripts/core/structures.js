class StructureTemplate {
    constructor(name, blocks, entities) {
        this.name = name;
        this.blocks = blocks;
        this.entities = entities;

        this.chunkSpanMap = new Map();
        this.initChunkMap();
    }

    initChunkMap() {
        for (const block of this.blocks) {

            //get the key of the chunk each block is in
            const [cx, cy, cz] = [block.x, block.y, block.z].map(a => Math.floor(a / 16));
            const key = `${cx},${cy},${cz}`;

            //check if map already has this chunk listed (not really neccessary)
            if (this.chunkSpanMap.has(key)) continue;
            this.chunkSpanMap.set(key, true);
        }

        //flag to prevent regeneration
        this.chunksHaveBeenMapped = true;
    }
}

const structures = {
    templates: {
        TEST_STRUCTURE_01: new StructureTemplate('TEST_STRUCTURE_01', [
            { type: 'scrap metal', x: 0, y: 0, z: 0 },
            { type: 'scrap metal', x: -1, y: 0, z: 0 },
            { type: 'scrap metal', x: -1, y: 0, z: -1 },
            { type: 'scrap metal', x: 0, y: 0, z: -1 },
        ], []),
        TEST_STRUCTURE_02: new StructureTemplate('TEST_STRUCTURE_02', [
            { type: 'scrap metal', x: 0, y: 0, z: 0 },
            { type: 'scrap metal', x: 1, y: -1, z: 1 },
            { type: 'scrap metal', x: 2, y: -2, z: 2 },
            { type: 'scrap metal', x: 3, y: -3, z: 3 },
        ], []),
        SENTINAL_TOWER: new StructureTemplate('SENTINAL_TOWER', [
            { type: 'scrap metal', x: 0, y: 9, z: 0 },
            { type: 'scrap metal', x: -1, y: 9, z: 0 },
            { type: 'scrap metal', x: -1, y: 9, z: -1 },
            { type: 'scrap metal', x: 0, y: 9, z: -1 },
            { type: 'scrap metal', x: 0, y: 8, z: 0 },
            { type: 'scrap metal', x: -1, y: 8, z: 0 },
            { type: 'scrap metal', x: -1, y: 8, z: -1 },
            { type: 'scrap metal', x: 0, y: 8, z: -1 },
            { type: 'scrap metal', x: 0, y: 7, z: 0 },
            { type: 'scrap metal', x: -1, y: 7, z: 0 },
            { type: 'scrap metal', x: -1, y: 7, z: -1 },
            { type: 'scrap metal', x: 0, y: 7, z: -1 },
            { type: 'scrap metal', x: 0, y: 6, z: 0 },
            { type: 'scrap metal', x: -1, y: 6, z: 0 },
            { type: 'scrap metal', x: -1, y: 6, z: -1 },
            { type: 'scrap metal', x: 0, y: 6, z: -1 },
            { type: 'scrap metal', x: 0, y: 5, z: 0 },
            { type: 'scrap metal', x: -1, y: 5, z: 0 },
            { type: 'scrap metal', x: -1, y: 5, z: -1 },
            { type: 'scrap metal', x: 0, y: 5, z: -1 },
            { type: 'scrap metal', x: 0, y: 4, z: 0 },
            { type: 'scrap metal', x: -1, y: 4, z: 0 },
            { type: 'scrap metal', x: -1, y: 4, z: -1 },
            { type: 'scrap metal', x: 0, y: 4, z: -1 },
            { type: 'scrap metal', x: 0, y: 3, z: 0 },
            { type: 'scrap metal', x: -1, y: 3, z: 0 },
            { type: 'scrap metal', x: -1, y: 3, z: -1 },
            { type: 'scrap metal', x: 0, y: 3, z: -1 },
            { type: 'scrap metal', x: 0, y: 2, z: 0 },
            { type: 'scrap metal', x: -1, y: 2, z: 0 },
            { type: 'scrap metal', x: -1, y: 2, z: -1 },
            { type: 'scrap metal', x: 0, y: 2, z: -1 },
            { type: 'scrap metal', x: 0, y: 1, z: 0 },
            { type: 'scrap metal', x: -1, y: 1, z: 0 },
            { type: 'scrap metal', x: -1, y: 1, z: -1 },
            { type: 'scrap metal', x: 0, y: 1, z: -1 },
            { type: 'scrap metal', x: 0, y: 0, z: 0 },
            { type: 'scrap metal', x: -1, y: 0, z: 0 },
            { type: 'scrap metal', x: -1, y: 0, z: -1 },
            { type: 'scrap metal', x: 0, y: 0, z: -1 },
        ], [])
    },
    getStructuresForChunk: function (cx, cy, cz, world) {
        const structuresInWorld = [
            {
                name: 'SENTINAL_TOWER',
                x: 5, y: 120, z: 0,
            },
        ];

        const structuresInChunk = [];
        for (const o of structuresInWorld) {
            const data = this.templates[o.name];
            if (!data) {
                console.log(`structure ${o.name} not recognized:`, o);
                continue;
            }

            //initialize chunk span map
            if (!data.chunksHaveBeenMapped) data.initChunkMap(world);

            //get chunk key
            const [scx, scy, scz] = world.getChunkCoords(o.x, o.y, o.z); //strcuture chunk coords
            const lcx = cx - scx, lcy = cy - scy, lcz = cz - scz; //chunk relative coords to structure
            const key = world.getChunkKey(lcx, lcy, lcz);

            //check if chunk is included in chunks
            const includes = data.chunkSpanMap.has(key);
            if (includes) structuresInChunk.push(o); //structure is in chunk
        }

        return structuresInChunk;
    }
}
export default structures;