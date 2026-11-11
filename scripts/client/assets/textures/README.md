# Texture sheets

Place PNG files in this folder. A block named `stone` uses `stone-block.png`; an entity named `player` uses `player-entity.png`.

Each image is a **3-column by 2-row sheet** of six square faces. All six cells should be the same size (for example, 96×64 pixels gives 32×32 faces). Face order, reading left to right and then top to bottom:

| First row | | |
| --- | --- | --- |
| +Z | -Z | +Y |

| Second row | | |
| --- | --- | --- |
| -Y | +X | -X |

Each face is textured independently; the cells do not need to form a folded cube net. Missing files leave the existing shaded solid colors in place. The renderer packs loaded faces into one shared atlas. Block and entity textures can be controlled independently with `renderer.setBlockTexturesEnabled(false)` and `renderer.setEntityTexturesEnabled(false)`; `renderer.setTexturesEnabled(enabled)` remains a convenience method for changing both. Textures use crisp pixel filtering by default; call `renderer.setTextureSmoothingEnabled(true)` to enable smoothing, or pass `false` for crisp pixels. Inventory item previews use the matching block or entity sheet when available and fall back to their colored model otherwise.
