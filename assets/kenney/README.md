# Kenney kits (CC0)

Low-poly model kits by Kenney (www.kenney.nl), CC0 1.0 — free for any use, credit appreciated (shared/credits.json
has the rows). Downloaded 2026-11-25 for Oathwild's town round. Only the GLB files, the palette picture and the licence
are kept.

| Folder | Kit | Used by |
|---|---|---|
| `fantasy-town/` | Fantasy Town Kit 2.0 (160 pieces: walls, timber walls, windows, doors, roofs, stairs, fences, hedges, stalls, lanterns, fountains, carts) | Oathwild `js/client/render/town-draw.js` |
| `survival/` | Survival Kit (barrels, crates, buckets, tools, workbenches, grass tufts) | Oathwild `js/client/render/town-draw.js` (yard clutter) |

Pieces sit on a 1-unit grid: a wall is a thin panel on the +x edge of its cell, one storey is one unit tall. Every piece
samples ONE small palette picture (`Textures/colormap.png`, 16 swatch columns × 4 rows; the top row is empty), so a
game can paint its own swatches into the empty row and move a piece's texture coordinates onto them — Oathwild does
this to give every house its own plaster and roof colour while keeping one material.
