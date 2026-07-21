const biomes = {
    getBiome: function (temperature, humidity, vitality) {
        const [t, h, v] = [temperature, humidity, vitality]
            .map(a => Math.clamp(Math.floor(a * 4), 0, 3));

        const biomeName = this.types[t][h][v];
        const biome = this.getBiomeStats(biomeName);
        return biome;
    },
    getBiomeStats: function (biome) {
        switch (biome) {
            case 'Grass plains':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        {
                            type: 'grass', depth: 1, random: [
                                { type: 'withered grass', chance: 0.1 },
                                { type: 'dead grass', chance: 0.05 }
                            ]
                        },
                        { type: 'dirt', depth: 3 },
                        { type: 'stone', depth: 10 },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Temperate rainforest':
            case 'Temperate forest':
            case 'Seasonal forest':
            case 'Pine forest':
            case 'Oak woodland':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        {
                            type: 'dirt', depth: 1, random: [
                                { type: 'withered grass', chance: 0.05 },
                                { type: 'dead grass', chance: 0.2 }
                            ]
                        },
                        { type: 'dirt', depth: 3 },
                        { type: 'stone', depth: 10 },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Sandy desert':
            case 'Parched desert':
            case 'Humid desert':
            case 'Barren desert':
                return {
                    name: biome, steepness: [0.01, 0.02], variation: [16, 64], layers: [
                        { type: 'sand', depth: 3 },
                        { type: 'sandstone', depth: 10 },
                        { type: 'stone', depth: 20 },
                        { type: 'rock', depth: Infinity },
                    ]
                };
            case 'Lush desert':
                return {
                    name: biome, steepness: [0.01, 0.02], variation: [16, 64], layers: [
                        { type: 'fertile sand', depth: 1 },
                        { type: 'sand', depth: 3 },
                        { type: 'sandstone', depth: 10 },
                        { type: 'stone', depth: 20 },
                        { type: 'rock', depth: Infinity },
                    ]
                };
            case 'Salt flats':
                return {
                    name: biome, steepness: [0.00, 0.01], variation: [8, 16], layers: [
                        {
                            type: 'white salt', depth: Infinity, random: [
                                { type: 'pink salt', chance: 0.4 }
                            ]
                        },
                    ]
                };
            case 'Salt pools':
                return {
                    name: biome, steepness: [0.04, 0.06], variation: [8, 16], layers: [
                        {
                            type: 'white salt', depth: Infinity, random: [
                                { type: 'pink salt', chance: 0.6 }
                            ]
                        },
                    ]
                };
            case 'Salt spikes':
                return {
                    name: biome, steepness: [0.15, 0.2], variation: [32, 48], layers: [
                        {
                            type: 'white salt', depth: Infinity, random: [
                                { type: 'pink salt', chance: 0.3 }
                            ]
                        },
                    ]
                };
            case 'Badlands':
            case 'Wooded badlands':
                return {
                    name: biome, steepness: [0.03, 0.05], variation: [32, 48], layers: [
                        { type: 'red sand', depth: 5 },
                        { type: 'sandstone', depth: Infinity }
                    ]
                }
            case 'Rocky wastes':
            case 'Rocky pools':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        { type: 'rock', depth: Infinity }
                    ]
                };
            case 'Rocky canyon':
            case 'Floodland':
            case 'Stormy lake':
                return {
                    name: biome, steepness: [0.03, 0.05], variation: [-16, -32], layers: [
                        { type: 'rock', depth: Infinity }
                    ]
                };
            case 'Scrap wastes':
                return {
                    name: biome, steepness: [0.2, 0.3], variation: [8, 16], layers: [
                        { type: 'trash', depth: 5, random: [{ type: 'scrap metal', chance: 0.005 }] },
                        { type: 'sludge', depth: 8, random: [{ type: 'scrap metal', chance: 0.02 }] },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Scrap heaps':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [16, 32], layers: [
                        { type: 'trash', depth: 3 },
                        { type: 'sludge', depth: 5, random: [{ type: 'scrap metal', chance: 0.01 }] },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Scrap spikes':
                return {
                    name: biome, steepness: [0.15, 0.2], variation: [32, 48], layers: [
                        { type: 'trash', depth: 2, random: [{ type: 'scrap metal', chance: 0.001 }] },
                        { type: 'sludge', depth: 3, random: [{ type: 'scrap metal', chance: 0.01 }] },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Mud plains':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        { type: 'mud', depth: 5 },
                        { type: 'sludge', depth: 10 },
                        { type: 'rock', depth: Infinity }
                    ]
                }
            case 'Muddy mangrove':
            case 'Flooded marsh':
                return {
                    name: biome, steepness: [0.03, 0.05], variation: [-16, -32], layers: [
                        { type: 'mud', depth: 5, random: [{ type: 'clay', chance: 0.1 }] },
                        { type: 'sludge', depth: 10 },
                        { type: 'rock', depth: Infinity }
                    ]
                };
            case 'Volcanic shrubland':
            case 'Volcanic forest':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        { type: 'ash', depth: 1, random: [{ type: 'dead grass', chance: 0.1 }] },
                        { type: 'ash', depth: 4, random: [{ type: 'clay', chance: 0.1 }] },
                        { type: 'rock', depth: Infinity }
                    ]
                }
            case 'Scorched ash plains':
                return {
                    name: biome, steepness: [0.01, 0.05], variation: [8, 16], layers: [
                        { type: 'ash', depth: 5 },
                        { type: 'rock', depth: Infinity }
                    ]
                }
            case 'Windswept tundra':
            case 'Ice flats':
                return {
                    name: biome, steepness: [0.01, 0.02], variation: [8, 16], layers: [
                        { type: 'ice', depth: 3 },
                        { type: 'stone', depth: 10 },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Sparse ice grasslands':
            case 'Windy grasslands':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        {
                            type: 'frozen grass', depth: 1, random: [
                                { type: 'snowy grass', chance: 0.1 }
                            ]
                        },
                        { type: 'dirt', depth: 3 },
                        { type: 'stone', depth: 10 },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Brittle taiga':
            case 'Sere jungle':
            case 'Frozen woods':
            case 'Frost-bitten jungle':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        {
                            type: 'dirt', depth: 1, random: [
                                { type: 'snowy grass', chance: 0.05 },
                                { type: 'frozen grass', chance: 0.2 }
                            ]
                        },
                        { type: 'dirt', depth: 3 },
                        { type: 'stone', depth: 10 },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Snowy savannah':
            case 'Stormy taiga':
            case 'Frozen boreal forest':
            case 'Polar mangrove':
            case 'Typhoon taiga':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        {
                            type: 'snowy grass', depth: 1, random: [
                                { type: 'frozen grass', chance: 0.1 }
                            ]
                        },
                        { type: 'dirt', depth: 3 },
                        { type: 'stone', depth: 10 },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            case 'Barren delta':
            case 'Snowy tundra':
            case 'Frozen marsh':
                return {
                    name: biome, steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        { type: 'snow', depth: 1, random: [{ type: 'dirty snow', chance: 0.4 }] },
                        { type: 'snow', depth: 3, random: [{ type: 'ice', chance: 0.2 }] },
                        { type: 'stone', depth: 10 },
                        { type: 'rock', depth: Infinity },
                    ]
                }
            default:
                return {
                    name: biome + '[]', steepness: [0.02, 0.05], variation: [8, 16], layers: [
                        { type: 'rock', depth: Infinity },
                    ]
                }
        }
    },
    types: [
        //FROZEN
        [
            ['Windswept tundra', 'Windy grasslands', 'Brittle taiga', 'Sere jungle'], //arid
            ['Ice flats', 'Sparse ice grasslands', 'Frozen woods', 'Frost-bitten jungle'], //dry
            ['Snowy tundra', 'Snowy savannah', 'Stormy taiga', 'Frozen boreal forest'], //humid
            ['Barren delta', 'Frozen marsh', 'Polar mangrove', 'Typhoon taiga'] //wet
        ],

        //COLD
        [
            ['Dust flats', 'Dusty grasslands', 'Dusty shrublands', 'Brittle woods'], //arid
            ['Rocky wastes', 'Scrap spikes', 'Pine forest', 'Needle forest'], //dry
            ['Rocky pools', 'Rocky canyon', 'Seasonal forest', 'Sharpstorm forest'], //humid
            ['Floodland', 'Stormy lake', 'Flooded marsh', 'Thunder forest'] //wet
        ],
        //WARM
        [
            ['Salt flats', 'Badlands', 'Wooded badlands', 'Nuclear forest'], //arid
            ['Salt spikes', 'Scrap wastes', 'Scrap heaps', 'Redwood forest'], //dry
            ['Salt pools', 'Grass plains', 'Temperate forest', 'Oak woodland'], //humid
            ['Sludge mounds', 'Mud plains', 'Muddy mangrove', 'Temperate rainforest'] //wet
        ],
        //HOT
        [
            ['Parched desert', 'Basalt flats', 'Scorched ash plains', 'Seared volcanic forest'], //arid
            ['Sandy desert', 'Barren desert', 'Volcanic shrubland', 'Volcanic forest'], //dry
            ['Humid desert', 'Lush desert', 'Festering marsh', 'Volcanic jungle'], //humid
            ['Sludge fields', 'Marsh', 'Swamp', 'Tropical rainforest'] //wet
        ]
    ]
}


export default biomes;
