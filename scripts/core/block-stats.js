export function getBlockFaceColor(type, normal) {
    // Normal directions: [x, y, z]
    const isTop = normal[1] == 1;
    const isBottom = normal[1] == -1;

    if (type === "grass") {
        if (isTop) return [0.1, 0.5, 0.1];    // green top
        return [0.4, 0.2, 0];              // dirt sides
    } else if (type === "withered grass") {
        if (isTop) return [0.2, 0.475, 0.1];    // green top
        return [0.4, 0.25, 0];              // dirt sides
    } else if (type === "dead grass") {
        if (isTop) return [0.3, 0.45, 0.1];    // green top
        return [0.35, 0.25, 0];              // dirt sides
    } else if (type === "dirt") {
        return [0.35, 0.2, 0];              // brown all over
    } else if (type === "stone") {
        return [0.5, 0.5, 0.5];              // gray
    } else if (type === "wood") {
        if (isTop || isBottom) return [0.55, 0.4, 0.225];
        return [0.3, 0.15, 0];
    } else if (type === "red wool") {
        return [0.65, 0, 0];
    } else if (type === "concrete") {
        return [0.7, 0.7, 0.7];              // light gray
    } else if (type === "rock") {
        return [0.35, 0.35, 0.35];              // gray rock
    } else if (type === "gold") {
        return [1.0, 0.84, 0];              // gold
    } else if (type === "diamonds") {
        return [0, 0.8, 1.0];              // cyan diamonds
    } else if (type === "glass") {
        return [1.0, 1.0, 1.0];              // transparent glass
    } else {
        return [1.0, 0, 1.0];// default magenta
    }
}

export function getBlockMaxHealth(type) {
    switch (type) {
        case "grass":
        case "withered grass":
        case "dead grass":
        case "dirt":
        case "red wool":
            return 4;
        case "wood":
            return 10; // wood is moderately easy to break
        case "stone":
            return 15; // stone is moderately easy to break
        case "concrete":
        case "rock":
            return 20; // concrete and rock are harder to break
        case "gold":
            return 50; // gold is harder to break
        case "diamonds":
            return 100; // diamonds are very hard to break
        case "glass":
            return 2; // glass is fragile
        default:
            return 20; // default health for unknown types
    }
}

export function getBlockDropType(type) {
    switch (type) {
        case "grass":
        case "withered grass":
        case "dead grass":
            return "dirt"; // these drop dirt instead
        default:
            return type; // default drop is the block itself
    }
}