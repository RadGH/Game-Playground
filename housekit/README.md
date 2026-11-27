# House Kit — Oathwild's modular houses on their own page

**Status:** prototype, in the game — Oathwild's towns are drawn by this kit (2026-11-26).
**Play:** http://192.168.1.34:8401/housekit/ (dev) · stable: http://192.168.1.34:8400/housekit/ once published.
**Next:** owner review of the look on the page; move bridges (`prototypes/oathwild/js/client/render/bridge-draw.js`) onto
the same atlas; use the landmark bases for Larkford's inn / tower / smithy / chapel if the owner likes them.
**Parked:** see "Parked / not done" at the bottom.

Owner, 2026-11-26: *"Can the modular building system be created and synced to an experiment page so that we can review
and extend it there? It's a good start but could use more decorations and textures."* Textures: *"Codex painted in a
world of warcraft type of style. Big wood regions, borders, panels."*

## One copy, two users

The house builder used to live inside Oathwild (`render/town-draw.js`). It now lives here, in two steps:

| Step | File | What it does |
|---|---|---|
| Describe | `js/describe.js` | Pure (no DOM, no three.js). A house record — the same one Oathwild's planner `js/world/town.js` makes — plus `data/styles.json` → a flat list of **parts**: Kenney wall pieces, boxes, triangles, cylinders, quads, each with a place in the house's own frame, a **look** (which painted texture) and a **tint**. Also fences, yard/street props, terrace walls. |
| Build | `js/build.js` | three.js. Parts → painted triangles in one growable list → one `BufferGeometry` → one mesh, ONE material for everything. |

Oathwild's `render/town-draw.js` is now a thin walk over the town plan that calls `houseInput()` → `describeHouse()` →
`kit.addParts()` per house and merges each 48 m chunk into one mesh. The review page calls the very same functions.
`tests/same-house.test.mjs` walks every Larkford house through the game's path (the live planner) and the page's path
(the snapshot file the page opens, `data/larkford.json`) at all three qualities and compares every part; it also fails
if `town-draw.js` or `js/page.js` grows its own copy of the kit. Like Farhold importing proctown's planner, there is no
second copy to drift.

```js
import { loadHouseKit } from '.../housekit/js/build.js';
import { describeHouse, houseInput } from '.../housekit/js/describe.js';
const kit = await loadHouseKit({ quality });                    // styles + atlas + Kenney pieces, once
const sink = kit.sink();
const { house, ctx } = houseInput(planHouse, { yards: plan.yards, heightAt: T.heightAt, quality });
const d = describeHouse(house, kit.S, ctx);                     // d.parts, d.look (what was rolled), d.smoke (chimney tops)
kit.addParts(sink, d.parts, { at: house.at, facing: house.facing, y0: house.floorY });
scene.add(new THREE.Mesh(sink.geometry(), kit.material));
```

A **house record**: `{ at:[x,z], w, d, facing, cells:[wide,deep], storeys, floorY, baseY, style, roof (0-3), plaster (0-3),
door:{cell, at}, shop, jetty, chimney, seed }` + optional `trade`, `kind` (inn / tower / smithy / chapel), `roofKind`,
`ridge`, `pitch`. Front = local −z; one kit cell = 3 m wide and one storey tall.

## Styles as data (`data/styles.json`)

Every knob has a reader: `tests/describe.test.mjs` moves each one to an odd value and checks the houses change (rule 32)
— it found and removed six dead knobs while this was built.

- **families** — the Kenney Fantasy Town wall pieces per storey (picked by seed) and which palette square of a piece is
  which **role**: `wall` (the panel), `frame` (the beams round it), `door`, `quoin` (stone dressings), `trim`
  (anything standing out of the wall: shutters, sills).
- **styles** — Half-timbered, Stone, Plastered, Wooden cabin: the look of each role, wall colours (a plan house's
  `plaster` 0-3 picks one), door and shutter paints, base course, its roof kinds (a plan house's `roof` 0-3), and the
  chance of every decoration.
- **roofs** — clay tiles, slate, wood shingles, thatch: thickness, eaves, overhang, pitch range, ridge (roll / board /
  thick thatch roll), finials.
- **decoSizes**, **jetty**, **trades** (the sign each shop shows), **signCells** (which emblem sits where on the atlas),
  **quality** (Low halves decorations and swaps fancy windows, High adds more side windows and flowers),
  **kitCells** (palette square → look for props), **props**, **fences**, **landmarks** (inn, watch tower, smithy with an
  open forge front, chapel with a bell cote and a rose window).
- **looks** — atlas texture per look and how it is laid on: `wrap` (repeats both ways, in metres), `band` (one beam
  across the face: its painted borders run along the beam's edges, the grain along its length — posts too), `fit`
  (a whole picture, the shop signs). Read by `js/build.js`.

## Decorations (1d)

Window boxes with flowers · shutters in the house's own paint · hanging shop signs on iron arms showing the trade
(anvil, bottle, loaf, bed, bow, sword, boot, mug) · recessed porches with posts (inside the footprint, so the house's
collider still matches) · balconies with brackets and railings · dormer windows in long front roofs · jettied upper
floors with a bressumer beam and corbels · corner beams (timber; stone quoins on stone houses) and floor beams · gable
tie beam, king post and braces on timber gables · ivy climbing stone walls on the cell seams (never over a window) ·
lanterns on brackets by the door · rain barrels with down pipes and gutters, woodpiles under a lean-to (only where the
house has a back yard) · chimney stacks with caps and clay pots · ridge rolls / boards, iron finials · door frames, door
canopies on brackets, door steps · a stone base course round the walls · thatch as a roof kind · leaded glass in every
window · landmark bases. Yards: wood fences, hedges, low stone walls, gardens, washing lines, hen coops, woodpiles,
barrels, crates, carts, stalls, benches, the fountain, street lamps. Every one is laid on the painted atlas (rule 77).

**Nothing stands in the street:** below 2 m, nothing but steps, the base course, door frames and window boxes reaches more
than 0.45 m past a house front (`tests/describe.test.mjs`); porches are cut INTO the house; signs, lanterns, balconies
and jetties hang above head height. The server's colliders (town.js `boxes`) are unchanged.

## Textures (1e)

`tools/textures.json` lists 17 textures. **Codex paints every one** (art only — Codex writes no code here):

```
node housekit/tools/codex-textures.mjs [id…] [--again]      # → ref/<id>/painted.png (kept in git as painted.webp) (+ prompt, log); at most ~3 batches at once
python3 housekit/tools/build-atlas.py                       # → textures/atlas.webp (2048), atlas-1024.webp, data/atlas.json
```

`build-atlas.py` crops each painting square, makes it repeat without a seam (a half-offset blend only where its own
edges don't already meet), evens out plaster and cloth so a tint reads as one colour, and wraps a 32 px gutter of its own
pixels round each square so mipmaps never bleed. `paintwood` is made from the planks painting (greyed, lightened) so
shutters and window boxes take their own paint colour. A texture Codex has not painted yet gets a flat stand-in and is
listed as MISSING (never shipped as art).

| Square | Painted | Square | Painted |
|---|---|---|---|
| plaster | Codex | thatch | Codex |
| timber (beam band) | Codex | cobbles | Codex |
| planks | Codex | door planks | Codex |
| stone blocks | Codex | leaded window | Codex |
| field stone | Codex | ivy | Codex |
| shingles | Codex | flowers | Codex |
| slate | Codex | shop signs (8 emblems) | Codex |
| clay tiles | Codex | iron, cloth | Codex |

**One material, one draw call a chunk.** The atlas squares can't repeat on their own with normal texture coordinates,
so `atlasMaterial()` adds a few lines to three's Lambert shader: each vertex carries its square (`tile` attribute) and
the fragment wraps the coordinates inside that square, picking the mip level from the unwrapped coordinates (no seams).
Texture coordinates are laid in metres from the house's floor line, so plaster and stone courses run on across
neighbouring pieces. Per-house colour = texture × vertex tint; the lowest 1.6 m of a house is painted a touch darker.

## The review page (1c)

- **One house** — Building (house / inn / tower / smithy / chapel), or any of Larkford's 43 houses straight from the
  game; style, wall colour, roof kind, wide / deep / storeys, slope of the ground, seed, shop trade, jetty, chimney.
  "This house rolled" lists every decoration and each chip switches it on or off.
- **Gallery** — every style with three seeds, plus the landmarks; step the seeds.
- **Street** — a short street on a hill strung the way a town does it (terraces with alleys, fenced yards with clutter
  behind, shop barrels, lamps along cobbles).
- **Pieces** — every wall piece of every style and every decoration and prop, one by one, labelled (labels are drawn over
  the 3D view; no browser tooltips).
- Quality Low / Medium / High, draw calls and triangles on screen and in the panel. Phone: 3D view on top, the panel below,
  the page is the one scroller (360 × 640 checked by `tests/shots.mjs`).

## Cost (1f)

Measured with `prototypes/oathwild/tests/ui/town-shots.mjs` (Larkford + Thornwatch, all 76 planned houses, their
yards, props and terrace walls; the town's own meshes only — trees, ground and people are not in these numbers):

| | Draw calls | Triangles | Materials | Texture memory |
|---|---|---|---|---|
| Before (Kenney palette, 2026-11-25 town round) | 41 (2 per 48 m chunk: town kit + clutter kit) | 217,430 | 2 | two 512² palettes |
| After, Medium | **23** (1 per chunk) | 264,968 (+22%: decorations, glass, roof undersides) | 1 | one 2048² atlas (~21 MB on the GPU with mips) |
| After, Low (phones on Low) | **23** | 205,822 (−5% on before) | 1 | the 1024² atlas (~5 MB) |

Draw calls nearly halve because every surface — walls, roofs, decorations, yard clutter, fences, lamps — is on one
material. The extra triangles are mostly window glass, roof undersides and the decorations; Low rolls half as many
decorations and uses the small atlas. On the page, every mode shows its own draw calls and triangles live.

## Files

| Path | What |
|---|---|
| `js/describe.js` | pure: houseLook, describeHouse, describeFence, describeProp, describeTerraceWall, houseFromKnobs, houseInput, familyCells |
| `js/build.js` | three.js: loadHouseKit, atlasMaterial, kitPiece, the triangle sink, houseMesh |
| `js/kenney-palette.js` | the old repainted Kenney palette + loader, kept for Oathwild's bridge posts |
| `js/page.js`, `index.html`, `housekit.css` | the review page |
| `data/styles.json` | every knob |
| `data/atlas.json`, `textures/atlas*.webp` | written by `tools/build-atlas.py` |
| `data/larkford.json` | Larkford's houses as the game hands them to the kit (`tools/snap-town.mjs`) |
| `tools/` | `textures.json` + `codex-textures.mjs` (Codex), `build-atlas.py`, `snap-town.mjs` |
| `ref/<id>/` | Codex's paintings, prompts and logs |
| `tests/` | `describe.test.mjs`, `same-house.test.mjs` (node), `shots.mjs` (page pictures, desktop + phone) |

Tests: `node --test housekit/tests/*.test.mjs` · pictures: `flock /tmp/oathwild-browser.lock node housekit/tests/shots.mjs`
· the game: `prototypes/oathwild/tests/ui/town-shots.mjs`.

Credits: Kenney Fantasy Town Kit and Survival Kit (CC0, already in `shared/credits.json`). The textures are Codex's.

## Parked / not done

- **Landmark bases are on the page, not yet in the game.** Larkford's inn, smithy, tower and chapel are still the
  hand-placed art models from `data/placements.json` (they have their own colliders and NPC spots). The kit's inn /
  tower / smithy / chapel are ready (`kind` on a house record); swapping them in is the owner's call after he has seen
  them on the page.
- **Bridges** still use the old repainted Kenney palette (`js/kenney-palette.js`, kept for them); moving bridge posts and
  newels onto this atlas belongs with the map-editor round's bridge work.
- Kenney's wall pieces stay the base shapes (windows, doors, frames). If the owner wants chunkier WoW-style shapes
  (thicker beams, bigger overhangs) the next step is our own wall pieces from data, replacing the `families` lists.
