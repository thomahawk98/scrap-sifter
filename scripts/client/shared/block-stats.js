// Select the rendered base color for a block type and face direction.
export function getBlockFaceColor(type, normal = [0, 1, 0]) {
    // Normal directions: [x, y, z]
    const isTop = normal[1] == 1;
    const isBottom = normal[1] == -1;

    switch (type) {
        case "grass":
            if (isTop) return [0.1, 0.5, 0.1];
            return [0.4, 0.2, 0];
        case "withered grass":
            if (isTop) return [0.2, 0.475, 0.1];
            return [0.4, 0.25, 0];
        case "dead grass":
            if (isTop) return [0.3, 0.45, 0.1];
            return [0.35, 0.25, 0];
        case "snowy grass":
            if (isTop) return [0.8, 0.8, 0.8];
            return [0.4, 0.2, 0];
        case "frozen grass":
            if (isTop) return [0.6, 0.7, 0.8];
            return [0.4, 0.3, 0.2];
        case "dirt":
            return [0.35, 0.2, 0];
        case 'red dirt':
            return [0.35, 0.1, 0];

        case "stone":
            return [0.5, 0.5, 0.5];
        case "rock":
            return [0.35, 0.35, 0.35];

        case "wood":
            if (isTop || isBottom) return [0.55, 0.4, 0.225];
            return [0.3, 0.15, 0];
        case "leaves":
            return [0.1, 0.4, 0.1];

        case "red wool":
            return [0.8, 0, 0];

        case "concrete":
            return [0.5, 0.6, 0.4];

        case "trash":
            return [0.35, 0.3, 0.25];
        case "sludge":
            return [0.3, 0.25, 0.15];
        case "scrap metal":
            return [0.3, 0.25, 0.3];

        case "sand":
            return [0.9, 0.85, 0.7];
        case "fertile sand":
            return [0.8, 0.8, 0.6];
        case "sandstone":
            return [0.8, 0.75, 0.6];
        case 'red sand':
            return [0.5, 0.1, 0];

        case "snow":
            return [0.9, 0.9, 0.95];
        case "dirty snow":
            return [0.85, 0.85, 0.9];
        case "ice":
            return [0.5, 0.6, 0.8];

        case "white salt":
            return [0.9, 0.9, 0.9];
        case "pink salt":
            return [1, 0.85, 0.85];

        case 'magma':
            return [1, 0.5, 0];

        case "gold":
            return [1.0, 0.84, 0];
        case "diamonds":
            return [0, 0.8, 1.0];

        case "glass":
            return [1.0, 1.0, 1.0];

        //placeholders
        case "coal":
        case 'charcoal':
        case 'ash':
        case 'cinder':
        case 'basalt':
        case 'obsidian':
            return [0.1, 0.1, 0.1];

        case 'clay':
        case 'red clay':
            return [0.4, 0.2, 0];
        case 'mud':
            return [0.4, 0.25, 0.15];

        default:
            return [1.0, 0, 1.0];
    }
}

// Resolve the inventory drop type for special terrain blocks.
export function getBlockDropType(type) {
    switch (type) {
        case 'grass':
        case 'withered grass':
        case 'dead grass':
        case 'snowy grass':
        case 'frozen grass':
            return "dirt";
        case 'dirty snow':
            return 'snow';
        default:
            return type; // default drop is the block itself
    }
}
