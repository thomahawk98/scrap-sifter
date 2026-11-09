import InputController from './input.js';

// A User is a client-side identity: it owns local input and presentation, then
// routes those inputs to one world entity. No networking or server authority is
// assumed here, so the same world entities remain usable in a future server loop.
export default class User {
    constructor({ world, camera, renderer, hud, chunkManager, canvas, keyBindings = {}, mouseBindings = {}, controlledEntityId = null }) {
        this.world = world;
        this.controlledEntityId = controlledEntityId
            ?? world.entities.findFirst(entity => entity.type === 'player')?.id;
        if (!world.entities.getById(this.controlledEntityId)) {
            throw new Error('User requires a controlled player entity in the world.');
        }

        this.camera = camera;
        this.hud = hud;
        this.input = new InputController({
            canvas,
            player: this.player,
            camera,
            world,
            chunkManager,
            renderer,
            keyBindings,
            mouseBindings,
        });
    }

    get player() {
        return this.world.entities.getById(this.controlledEntityId);
    }

    get paused() {
        return this.input.paused;
    }

    // Route local controls to the controlled player only; other entities update
    // through their normal entity behavior and receive no user input.
    updateEntities(deltaScale, context) {
        const playerId = this.controlledEntityId;
        this.world.entities.update(deltaScale, context, (entity, scale, sharedContext) => {
            if (entity.id === playerId) {
                entity.update(scale, { ...sharedContext, inputs: this.input });
            } else {
                entity.update(scale, sharedContext);
            }
        });
    }

    draw(debugTexts) {
        this.hud.draw(this.paused, debugTexts, this.player, this.input);
    }
}
