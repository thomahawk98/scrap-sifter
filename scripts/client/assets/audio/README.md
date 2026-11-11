# Audio assets

Put one-shot sound files in this folder and play them by filename without the
extension. The client audio processor currently resolves names to `.mp3` files;
it also accepts an explicit `.ogg`, `.mp3`, `.wav`, `.webm`, or `.m4a` filename.

For example, `audio.playLocal('menu-select')` loads
`scripts/client/assets/audio/menu-select.mp3`. The `blaster-shot` world sound
uses `scripts/client/assets/audio/blaster-shot.mp3`.
