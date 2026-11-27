# Tree Kit — Oathwild's trees, built from parts, in one wind

**Status:** prototype, in the game — Oathwild's trees are built, coloured and bent in the wind by this kit (2026-11-26).
**Play:** http://192.168.1.34:8401/treekit/ (dev) · with the live channel: start `node treekit/tools/live.mjs`, then
http://192.168.1.34:8670/treekit/ · stable: http://192.168.1.34:8400/treekit/ once published.
**Next:** the owner looks at the trees on the page (phone and desktop), pins notes; Claude answers them live; turn on
roots for the big trees if he likes them (the knob is there, every species ships with 0 roots so the game looks the same).
**Parked:** see "Parked / not done" at the bottom.

Owner, 2026-11-26: *"Can our tree physics bend in the wind. Can we have a modular tree system as another experiment so
we can edit and refine trees it would be cool if you could access it realtime and change what we see instead of checking
in later."* (Oathwild `docs/BRAINSTORM-2026-11-26-world.md` rows 4c / 4d / 4e.)

## One copy, three users

The tree builder used to live inside Oathwild (`js/client/render/story-trees.js` + `story-trees-data.js` + `tufts.js`,
itself copied from Thousandvale). It now lives here; Oathwild imports it by path, like housekit and proctown:

| File | What it does |
|---|---|
| `data/species.json` | **The data.** Every tree as parts: `size`, `trunk`, `roots`, `branches`, `crown`, `leaves`, `bark`, `wind`; the detail levels (`detail`); and Oathwild's tree kinds (`oathwild.trees` / `.understory`: which tree, how tall in metres, and the MEASURED trunk and crown). |
| `js/species.js` | Pure. Loads the file (fetch in a browser, the file system in node), the knob list (`KNOBS`: path, label, range, step), `getKnob` / `setKnob` (clamped, rounded), `rowOf(species)` = the flat row the builder reads, `gameKinds('oathwild')`, `formatSpecies` (one line per part, so a saved change is a one-line diff). |
| `js/build.js` | three.js. A tree is PLANNED from its seed (trunk path, roots, limbs, round leaf clumps), then drawn at a detail level: `buildStoryTree(id, { seed, lod, tufts, species })` → `{ bark, foliage, tufts, height, radius, plan, sway, tris }`. |
| `js/tufts.js` | The fluffy leaf tufts (camera-facing quads per clump, painted big-leaf / needle pictures, the see-through fade near the camera, backlit leaves). |
| `js/materials.js` | `treeMaterials({ cheap, wind })` → bark, leaf cards, tufts and their shadow materials, all bending in `wind`. |
| `js/wind.js` | **The ONE wind** (below). |
| `js/measure.js` | Measures a game's tree kinds from the drawn tree: trunk radius 1 m above the ground, canopy radius. |
| `js/plant.js` | `plantTrees(list, { lod, wind })` — many trees, instanced (the page's gallery and forest). |
| `js/page.js`, `js/live-client.js`, `index.html`, `css/treekit.css` | The page. |
| `tools/live.mjs` | The live channel (port 8670). |
| `tools/tree-edit.mjs` | The command line. |
| `tools/measure.mjs` | Re-measure the game sizes after a hand edit (`--check` only checks). |

Oathwild's side: `js/client/render/story-trees.js`, `story-trees-data.js` and `tufts.js` only forward here (old imports
keep working); `render/trees.js` instances the trees with `treeMaterials`; `js/world/scatter.js` takes `TREE_SPECIES` /
`UNDERSTORY_SPECIES` from `gameKinds('oathwild')` — **so the server's colliders come from the same file the browser
draws from** (lessons rule 22). `render/wind.js` is the game's one wind.

When the builder moved, every tree the game draws came out byte-for-byte the same (all 20 species × 3 detail levels ×
2 seeds with tufts — the geometry was hashed before and after). The only change the game sees is the trunk and crown
sizes, now MEASURED instead of hand-typed (they were within about 10 %): oak-a trunk 0.95 → 0.89 m, willow 0.95 → 0.84,
pines 0.6 → 0.65, giant spruce 1.3 → 1.13, the dead tree's crown 1.5 → 4.24 m (its bare limbs reach that far); 5 of
1841 scattered trees moved or went. One look change: a pine's trunk used to poke up bare above its flat top tiers — needle
tufts now run up the rest of it.

## The parts (every knob)

`node treekit/tools/tree-edit.mjs knobs oak` prints them with the tree's values. A knob only shows for a tree it
means something to (a pine has no hanging strands; a palm's fronds have their own picture, so no tuft knobs).

| Part | Knobs |
|---|---|
| Size | `size.height` (own units — the game scales a tree to its kind's metres), `size.age` (0.3 young and slender … 1.6 old and stocky; 1 = as designed) |
| Trunk | `radius` at the ground, `topRadius`, `crownStart` (share of the height), `flare` (root flare), `flutes` (bark ridges), `twist` (ridge turns), `lean`, `bend` (S-bend) |
| Roots | `count` (0 = none), `reach` / `thickness` / `rise` (× the trunk radius) — buttresses that leave the trunk and dive into the ground; their own random numbers, so adding roots moves nothing else |
| Branches | `count`, `from` / `to` (where they leave the trunk), `rise` (arch), `thickness` / `tip` (× the trunk) |
| Crown | `radius`, `clumps`, `clumpSize`, `squash` (height / width), `tiers` (conifers), `strands` + `strandLength` (willow), `fronds` + `frondLength` (palm, tree fern) |
| Leaves | `picture` (broadleaf / needle tufts), `tint` (three colour multipliers), `tuftSize` (big leaves: rule 74), `tuftCount` |
| Bark | `tint`, `bands` (birch) |
| Wind | `stiffness` (0 whippy … 1 heavy: a full gale bends the top 12 % … 1.5 % of the height), `sway` (sways per second: ancient oak 0.28, birch 1.0), `flutter` (leaves) |

Forms: `round` (broadleaf of leaf clumps), `tall` (birch, beech: clumps stacked up the trunk), `weep` (willow curtain),
`tiers` (fir, spruce), `crown` (pine), `snag` (dead), `palm`, `fern`.

## The page

Three views, one scroller on a phone (the glade on top, the parts below), no browser popups or title tooltips:

- **One tree** — pick a species and the game kind to draw it at (oak-a 21 m, oak-b 24 m, …, or its own size), the
  detail level (Near/High · Middle/Medium · Far/Low, exactly the game's three), the seed. Every knob of every part,
  grouped and folded. Facts: drawn height and how many people tall, crown reach, triangles, each game kind's collider.
  **Save for the game** writes `data/species.json` (and re-measures the colliders); **Back to saved** throws the
  edits away. **Notes for Claude**: write a note, *Pin on the tree* and tap the spot — it sits on the tree as a label;
  *Add without a pin* for a general one. Done notes turn green; Claude's replies show under them.
- **Species** — every game kind (or every species) at its game height, side by side, a 1.8 m person beside each (the
  game's own textured body, `avatar-3d/fal/models/final/male.glb`), names and "×N a person" under them.
- **Forest in the wind** — a patch of 100-200 trees (Mixed wood, Oak wood, Pine wood, Birch grove) on a meadow of grass
  tufts, three people in a clearing. Weather (Clear, Cloudy, Rain, Storm, Fog, Snow: the sky, rain streaks that lean
  with the wind, lightning in a storm), named winds (Calm … Storm), sliders for strength, direction, gusts, gust wave
  spacing and speed, and **Storm now**.

The corner shows triangles, draw calls and the frame rate (plus trees, wind and the push where you look in the forest).
Address options: `?mode=one|gallery|forest`, `?tree=<id>`, `?wind=calm|breeze|windy|gale|storm`, `?live=0`.
Tests reach `window.__tk` (`ready`, `state`, `stats()`, `set(path, v)`, `mode(m)`, `wind`).

## Live with Claude (4e)

```
node treekit/tools/live.mjs                       # the channel: http://<LAN IP>:8670/treekit/ (port 8670, plain http)
node treekit/tools/tree-edit.mjs list             # every tree, its shape, the game kinds using it
node treekit/tools/tree-edit.mjs knobs oak        # every knob with oak's values and ranges
node treekit/tools/tree-edit.mjs get oak trunk    # a part (or one knob: get oak trunk.radius)
node treekit/tools/tree-edit.mjs set oak trunk.radius 1.3
node treekit/tools/tree-edit.mjs set oak leaves.tint 0.9 1.2 0.5
node treekit/tools/tree-edit.mjs save             # writes species.json; prints the re-measured colliders
node treekit/tools/tree-edit.mjs revert [oak]
node treekit/tools/tree-edit.mjs status           # on/off, unsaved trees, the last change and who made it, notes
node treekit/tools/tree-edit.mjs notes [--all]    # the owner's notes; done 3 [reply…] · reply 3 … · reopen 3 · note oak …
```

How it works: the server keeps ONE working copy of the species. The page listens on `GET /events` (Server-Sent Events:
one long HTTP answer the server keeps writing lines into — no WebSocket package needed) and sends small POSTs
(`/api/set`, `/api/save`, `/api/revert`, `/api/notes`, `/api/note`). A change from the command line reaches the page in
well under a second (the test measures it), the page redraws that tree, marks the knob "changed by Claude" in purple and
shows a "Claude changed Oak · trunk.radius → 1.3 · 12 s ago" strip over the view. The page's own slider drags go to the
server as the owner's, so `status` shows them to Claude. Unsaved changes survive a server restart
(`data/live-draft.json`, not committed); notes live in `data/notes.json` (committed — they are the review). The server
also serves the playground's files, so the 8670 address is the page with the channel built in; the 8401 page finds the
channel too. An https page cannot reach a plain-http channel, so on https the page says to use the 8670 address. When
the channel is off the page still works on its own copy and says why Save and notes are off; the command line then
reads and writes `species.json` directly (and says so).

## The ONE wind (4c)

`js/wind.js` — the idea is Farhold's `js/wind.js` (everything that moves in the wind asks one object), rebuilt for
shaders. The wind is two uniforms (`uWind` = direction x/z, strength, gustiness; `uWindWave` = gust wave spacing, wave
speed, clock), and every bend is worked out in the vertex shader — **nothing per tree on the processor, and changing
the wind never rebuilds a shader** (rule 29: only numbers change; the game shot counts the shader programs before and
after a storm).

- **Gusts roll across the land:** wave fronts every `waveLength` m (70) moving downwind at `waveSpeed` (11 m/s), their
  line wobbling — you see a gust come through the far wood, then yours. `wind.pushAt(x, z)` is the same sum as the shader.
- **Trunks bend from the base:** the offset grows with (height share)², downwind, by the species' gale bend × the push
  at its root, and sways about that lean at the species' own speed (heavy oaks slowly, birches quickly). The top swings
  on an arc (it drops a little), it does not stretch.
- **Branches swing, leaves flutter:** by each vertex's own weight (`aWind.x`: trunk 0 … leaf tip 1), faster than the trunk.
- **Grass and crops lean the same way** by the same push (`owGrassLean`). Rain asks `wind.rainVelocity()`.
- Each built tree carries `aSway` = (its height, gale bend, sway speed, flutter) on every vertex, so one material serves
  every species.

```js
import { createWind, applyTreeWind, WIND_GLSL } from '…/treekit/js/wind.js';
const wind = createWind({ seed, strength: 0.3, gust: 0.45 });
wind.update(dt);                                   // once a frame
wind.setFromWeather({ kind: 'storm' });            // or { key, wind: 0..1.5, angle, gust } — safe every frame
wind.hold({ strength: 1.35 }); wind.hold(null);    // pin it (sliders, tests); the weather cannot move it meanwhile
wind.storm(true); wind.storm(false);               // a storm now / back
wind.dirX, wind.dirZ, wind.strength, wind.gust     // as drawn (Farhold's names: Farhold's rain code reads it as is)
wind.rainVelocity(30)                              // { x, y, z } m/s
applyTreeWind(material, wind)                      // a tree material bends (needs aWind + aSway: js/build.js writes both)
// any other shader: Object.assign(shader.uniforms, wind.uniforms); paste WIND_GLSL after #include <common>;
// then owWindPush(xz) (0 calm … ~1 gale … more in a storm gust) or owGrassLean(xz, k) (an x/z offset for a blade tip)
```

Kinds the weather may name: `clear` 0.22, `cloudy` 0.38, `fog` 0.08, `rain` 0.6, `snow` 0.45, `storm` 1.35 (strength;
gusts 0.15-0.95). In Oathwild: `js/client/render/wind.js` exports the game's one `wind` (world.js updates it; trees,
tufts, grass and crop sheaves read it; `window.__owWind` for tests; `?wind=storm` holds a named wind), and the weather
view should be handed it (`createWeatherView(view, { wind })` or `weatherView.setWind(wind)`) — it then calls
`setFromWeather` and its rain leans with it.

## Tests

- `node --test treekit/tests/` (also in the playground's `npm run test:unit`):
  - `species.test.mjs` — every knob of every species changes the built tree (rule 32: an odd value, a different
    geometry); the knob list is complete; setKnob clamps and refuses; the same seed grows the same tree; roots move
    nothing else; the file stays in its tidy form; **colliders = drawn trunks** (the saved sizes are the measured ones,
    within 8 % for every look and detail level, and the mesh's own bark ring 1 m up is at the collider radius);
    Oathwild's scatter reads this file; trees are big with big leaves (rule 74); wind numbers on every vertex.
  - `wind.test.mjs` — the weather hook, hold, storm and back, gusts rolling 10 m downwind in a second at 10 m/s, the
    uniforms, the material hook keeps what was there and shares the uniform objects.
  - `live.test.mjs` — through the REAL server (rule 35): a knob set from the command line reaches a listening page in
    under a second marked as Claude's; the owner's change shows in `status`; save writes the file and re-measures the
    collider; a pinned note shows in `notes`, `done` turns it done for the page; bad requests get readable reasons.
- `node treekit/tests/page-shots.mjs` — every view on desktop and a 360×640 phone, zero console errors, nothing wider
  than the screen, no `title=` (pictures in `test-results/treekit/`).
- `node treekit/tests/game-shots.mjs [--base …] [--tag …]` — Oathwild in the game: hero beside an oak, a giant, a birch,
  a wood from further off; the same wood calm and in a storm; the shader count before and after the storm.
- Oathwild's own tree tests still run on this data (`tests/world/trees.test.mjs`, `tufts.test.mjs`, `textured.test.mjs`).

Run browser checks under `flock /tmp/oathwild-browser.lock` on the VM (one browser at a time).

## Numbers (2026-11-26, software browser — a real GPU is much faster)

Triangles per tree (each drawn as bark + tufts; the game instances them so one draw covers every copy in a 256 m block):

| Tree | High | Medium | Low |
|---|---|---|---|
| Oak | 604 | 302 | 131 |
| Ancient oak | 908 | 460 | 179 |
| Spruce | 1942 | 840 | 491 |

The wind adds no draw calls, no triangles and no processor work per tree (a few dozen extra shader instructions per
vertex). The page's corner shows live triangles, draw calls and frame rate.

## Parked / not done

- **Bark pictures per species**: the kit has `bark_oak`, `bark_birch`, `bark_dead` surfaces but the game draws every
  trunk with `bark_pine` tinted by `bark.tint` (the look the owner approved). A `bark.picture` knob would need one bark
  material per picture (more draw calls); not done this round.
- **Codex-painted leaf / bark textures**: not needed — the game's own textures are reused (the brief allowed it).
- **Thousandvale** still has its own older copy (`prototypes/thousandvale/js/client/tree-style.js`; the game is on hold).
- The leaf-card fallback (no tufts) is kept for older callers but nothing in Oathwild draws it.
