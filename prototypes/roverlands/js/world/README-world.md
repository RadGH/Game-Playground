# Roverlands world

A 1536 m square world generated from a seed, the same on every machine, plus the code that draws it.

* `worldgen.js` — the generator (pure: no DOM, no three.js, no Rapier). `generateWorld({ seed, vehicles })`.
* `roads.js` — routing, smoothing, height profile and carving of the road network.
* `scatter.js` — where every tree, bush, reed bed, rock and log goes, and the ground decor.
* `wmath.js` — maths that agrees bit for bit across browsers (see "Same world everywhere").
* `world-data.js` — every table: SURFACES, biomes, biome anchors, fixed places, road classes, object kinds, scatter rules.
* `../client/world-view/` — the renderer (`index.js` is the entry point; see "The view").
* `../../world.html` — a dev page to fly round a world: `world.html?seed=7&quality=medium&at=canyon`.

Tests: `node --test prototypes/roverlands/tests/world.test.js` (generator) and
`flock /home/radgh/claude/agent/roverlands-pw.lock npx playwright test prototypes/roverlands/tests/world.spec.js`
(the page; screenshots in `tests/shots/world-*.png`).

## The layout

x runs east, z runs south, the origin is the middle of the map. Home is on the **south** edge; everything you go to
is north of the river, so every Flag Run crosses it.

```
 z = -768  north   Saltwind Dunes        Whitecap Heights (summit flag)        Rustgate Canyon
                   (sand, ridges)        snow, frozen Rime Pond                mesas, terraces, the Mesa Crown
                                         Tallpine Ridge (pine, ridged hills)    flag on a mesa with a switchback
                   Brackwater Fen (mud, pools, fallen logs, reeds) — Fen Heart flag in the middle
           ~~~~~~~~~~~~~~~~~~~~~~ Wending River (west -> east, falling ~4.6 m) ~~~~~~~~~~~~~~~~~~~~~~
                   Shingle Ford (x -330)        Old Timber Bridge (x 80)          Otter Ford (x 330)
                   River Bluff flag on the north bank (x ~ -120)
                   Haystead Farms (fields, fences, bales)   Glassmere (lake)   Paleleaf Wood (birch)
 z = +768  south               Long Meadow  —  Home base (garage row, 16 pads)  —  Sandbox lot (8 pads)
```

Biomes come from ~40 anchor points (`ANCHORS`) jittered per seed and seen through a domain warp, so borders wander.
A sample belongs to its nearest anchor's biome; heights blend between the nearest few anchors over 75 m. Each seed
moves the anchors, the river's meanders and every noise field, but keeps this macro layout, so every map has the
same kinds of challenge.

### Biomes

| id | key | shows as | ground | height shape | what grows / stands there |
|---|---|---|---|---|---|
| 0 | meadow | Long Meadow | grass, dirt patches | rolling, 7-16 m | odd oaks, bushes, stones |
| 1 | pine | Pine ridge | grass + forest floor, rock on steep | ridged hills, 16-50 m | dense pine/spruce/fir, logs, boulders |
| 2 | birch | Birch wood | grass, dirt patches | rolling, 9-20 m | birch groves, saplings, bushes |
| 3 | bog | Mudflats | **mud** (soft, sink 0.12), grass hummocks, shallow pools | flat, ~2 m | **fallen logs**, reeds, dead snags, bramble |
| 4 | river | River valley | grass, gravel bars and mud at the water | floodplain + valley walls | willows, bushes, river stones |
| 5 | canyon | Red-rock canyon | dirt, rock on every riser | terraced mesas, 14-50 m; the flag mesa 72 m | rocks, boulders, juniper, kickers |
| 6 | dunes | Dunes | sand | crests across the wind, 8-21 m | a little scrub, kickers |
| 7 | snow | Snowy uplands | snow above ~44-54 m, rock on steep, **ice** pond | a dome peaking ~140 m | frost firs, rocks |
| 8 | farm | Farmland | **farm** soil in 70 x 46 m fields, grass margins | almost flat | **fence lines**, round hay bales, oaks |
| 9 | lot | Sandbox lot | dirt, gravel by the pads, a **mud pit** | flat, with a banked loop track | ramps, jumps, crates, barrels, bales |

### Water

* **The river** is a function of x (one centreline z per column), `PLACES.river` waves + noise, half-width 10-15 m,
  ~2.75 m deep in the middle. Steep banks (4.5 m) where it is deep; you must go round.
* **Two fords** (`PLACES.fords`): the channel widens 1.6x, the bed rises to 0.35-0.45 m under the water, the banks
  ease out over 14 m (about 12 %). Surface `shallows`. The road runs straight through, following the bank exactly
  (a ford road is never smoothed or carved — smoothing put a lip at the water's edge).
* **The bridge** (`PLACES.bridge`, x 80): a straight deck ~56 m, 6.4 m wide, 2.6 m above the higher bank, two rails,
  two stone piers. Objects `bridge_deck` / `bridge_rail` / `bridge_pier`; `sites.bridges[0]`.
* **Glassmere**: a 46 m lake bowl, ~3.4 m deep; the roads go round it. **Fen pools**: shallow (≤ 0.45 m) water in the
  hollows the fen-pool noise digs (only there — an earlier version flooded the low riverbank inside the fen).
* **Rime Pond**: frozen — surface `ice`, no water.
* `world.water` holds the water SURFACE height per sample (NaN = dry); `waterAt(x, z)` interpolates it and returns null
  where the ground is above it.

### Roads

`ROAD_CLASSES`: `road` (7.2 m wide, surface road, grade clamp 18 %), `gravel` (5.4 m, surface gravel, 19 %),
`track` (3.8 m, surface dirt, 34 % — the rough ways). The network (`EDGES` in worldgen.js):

* home → sandbox, both fords, the bridge; each crossing → the junction north of the river → Tallpine Ridge;
* ford W → **Fen Heart** (gravel causeway into the mud), junction → **River Bluff**, ridge → **Whitecap Summit**,
  ford E → canyon base → **the switchback** (gravel) → **Mesa Crown**;
* tracks: home → farm → ford W, fen → dunes → ridge, canyon → ridge, sandbox → ford E.

How a road is made (`roads.js`):

1. **Route** — A* on a 16 m grid. The search state is (cell, heading): a step may not turn more than ~100 degrees from
   the last, so a hairpin takes two steps and its legs end up a cell apart. On an 8 m grid with no heading, A* stacked
   hairpin legs closer than a road is wide and they carved over each other (steps of 2 m). Steps over the class's
   maxGrade are not allowed; deep water is a wall except in a ford; a cell another road already uses is cheaper, so
   roads join.
2. **Smooth** — Chaikin corner cutting, then a point every 2 m. Grid points that crowd the true end are cut (otherwise
   a path ran to the nearest grid cell past the flag and back).
3. **Profile** — the land's height along the road, box-filtered twice, eased into the pinned heights at both ends,
   kept above any water, then clamped to the class's grade with a forward and a backward pass. Where the road runs
   over an earlier road's surface it is pinned to it (and clamped again).
4. **Carve** — roads are carved one at a time in class order, each one read from the land as the earlier ones left it.
   Every sample within halfW of the road takes the profile height (plus up to 3 % banking on bends), the shoulder
   blends back into the land, and the driving surface of an earlier road is never re-carved.

**The switchback** up the Mesa Crown is drawn by hand (`switchbackTrack`): four 110 m legs 18 m apart joined by 9 m
half-circle hairpins, climbing from the canyon floor (20 m) to the top (72 m) at one steady ~9 % grade. The apron under
it takes the height of the nearest bit of track and is then smoothed between the benches, so the slope between legs
is a steep bank you cannot shortcut.

The test holds roads and gravel roads to ≤ 28 % over any 4 m on the finished ground (the clamp is 18-19 %; the rest is
banking and bilinear interpolation). On 12 seeds checked by hand, none went over 25 % after the fixes above.

### Sites

* `home` — the flag ring (r ≈ 14 m) on a 120 x 64 m paved pad; 16 pads in two rows facing north, four open sheds behind.
* `pads` — 16 at home + 8 in the sandbox; `vehicle` cycles through `opts.vehicles` (default `['trail_jeep','dirtbike']`).
* prop pads — after the 24 vehicle pads (the room numbers entities in pad order): crates, bags, barrels, jetpacks at
  home, two balls and four crates in the sandbox, a crate at every flag. `prop: true`.
* `runway` — 300 x 20 m, flat, paved, empty, in the meadow between Glassmere and home (`PLACES.runway`).
* `flags` — river, bog, canyon, summit, each > 400 m from home, each on a small flat spot at the end of its road.
* `ramps` — the sandbox set (small 4 m x 0.7 m, medium 6 x 1.5, big 9 x 2.8, two table-top jumps with landing ramps)
  plus six kickers out in the world (dunes, canyon, meadow), all `wedge` objects.
* `labels` — region, base, water, crossing and flag names for the map. Every name is original.

### Objects

`world.objects[i].id === i`. ~5.9k on seed 7 (`SCATTER.density` is the one knob): ~1.7k pines, 0.9k birches, 170 oaks,
450 saplings, 750 bushes, 210 reed beds, 220 logs, ~950 rocks and boulders, 500 fence panels, ~50 bales, crates,
barrels, signs, ramps, the bridge and sheds. ~13k decor items (ferns, flowers, mushrooms, pebbles, reed tufts, branch
piles) in `world.decor`, drawn only near the camera, never simulated.

| kind | collider (at s = 1) | breakAt (N·s) | fall |
|---|---|---|---|
| tree_birch | cyl r 0.15, h 6 | 9000 (r < 0.12) / 16000 / 26000 | topple |
| tree_pine | cyl r 0.26, h 7 | 16000 typical, null when r ≥ 0.3 | topple |
| tree_oak | cyl r 0.42, h 5 | null (26000 when s < 0.75) | topple |
| sapling | cyl r 0.06, h 1.8 | 3000 | topple |
| bush / reeds | cyl r 0.55 / 0.45 | 800 / 250 | flatten |
| fence | box 1.2 x 0.6 x 0.06 | 4000 | topple |
| log | box (round: 'z') r 0.35, 5-8 m long | null | — |
| rock_s/m/l, boulder | cyl r 0.45 / 0.95 / 1.8 / 2.8 | null | — |
| crate / barrel / hay_bale / sign | box 0.5 / cyl 0.36 / cyl 0.75 / cyl 0.1 | 2500 / 3000 / 6000 / 3500 | shatter / topple |
| ramp, bridge_*, shed | wedge / box | null | — |

Placement rules (scatter.js): dry ground (reeds may stand in ≤ 0.35 m of water), off every road by the kind's own
margin, not too steep for the kind, clear of the home pad, the sandbox, flags, bridge ends and ramps, and not crowding
anything already placed (4 m spatial hash). Logs also need both ends dry, off the road and within 1 m of the same height.

## Same world everywhere

Object ids are indices, so "object 812 broke" must mean the same tree on every player's machine. `+ - * /` and
`Math.sqrt` are correctly rounded everywhere; `Math.sin / cos / exp / pow / atan2 / hypot` are not, and a tree sitting
exactly on a threshold could exist in Chrome and not in Safari. So nothing that decides a height, surface or object
uses them: `wmath.js` has polynomial `dsin` / `dcos`, and the noise is highdef-3d's `noise.js` (integer hashes and
polynomials only). Yaw angles handed to the renderer may use atan2 (a 1e-16 rad difference changes nothing shared).
`worldHash(world)` hashes heights + surfaces + objects; the room can compare it.

## The view (`js/client/world-view/`)

| file | what it does | reuse |
|---|---|---|
| `index.js` | `createWorldView` — boot order, per-frame update, post chain, the contract API | imports highdef `sky.js`, `materials.js`, `postfx.js` |
| `quality.js` | low / medium / high presets | own numbers |
| `ground.js` | 128 m chunks, LOD steps 2/4/8/16 m (the finest IS the physics grid), skirts, 12 surfaces in one texture array, triplanar rock | copy-and-change of highdef `terrain.js` (it is welded to highdef's 5-surface biome table); textures painted by highdef `kit/textures.js` |
| `water.js` | river + lake + pools as one mesh with a per-vertex surface height, two-phase flow map downstream, depth colour, white water at the fords | copy-and-change of highdef `water.js` (that one is a single flat sea level) |
| `grass.js` | world-anchored blade lattice, mask from SURFACES + roads, hand-filtered height lookup (phones often cannot filter float textures), 4 push points | copy-and-change of highdef `grass.js` (it reads highdef's biome table) |
| `things.js` | every object + decor: near ring instanced per model, far cells baked; breaking, flattening, falling pieces | models from highdef `kit/trees.js` + `kit/rocks.js`, materials after highdef `vegetation.js` (copied because highdef lets a model pick its own random size; ours must match the collider) |
| `tracks.js` | tyre ruts: 4-point cross-section (raised light lips, dark pressed trough), depth from `SURFACES[].rut`, fade after 2 min, ring buffer | new |
| `particles.js` | dust in the surface's colour, water spray | new |
| `mapimage.js` | top-down map canvas: biome colours, surfaces, water, hill shade, roads (labels drawn by the HUD) | new |

Sizing: every model is scaled to its collider (tree height = kind h x s, rock footprint and height = its cylinder,
crate = its box), never a size the kit picked.

### Performance (seed 7, measured 2026-10-25)

* Generation: ~1.0-1.1 s in Node 22 and in headless Chromium on this VM (land 280 ms, roads 290, surfaces 215,
  planting 145, river 100). Phones will be 2-3x slower; moving `generateWorld` into a worker is the next step if the
  load screen feels long.
* Draw calls on **medium** (1280 x 720, shadow passes included): 80-190 depending on where you look. Triangles
  0.5-0.8 M. Low (402 x 780): see the spec log line `low {...}`.

## How to add a biome

1. Add a row to `BIOMES` (append — the id is stored per sample) and anchors to `ANCHORS`.
2. Add its height function to the `H` array in worldgen.js (same index).
3. Give it a surface rule in the surfaces switch, scatter rules in `SCATTER.biomes` / `SCATTER.decor`, and a router
   cost in `biomeCost` if roads should avoid it.
4. Ground look: the vertex tint comes from `BIOMES[].tint`; if it needs a new texture, add a `LAYERS` row in ground.js
   and a `SURF_LAYER` entry.

## How to add an object kind

1. A row in `KINDS` (collider size at s = 1, breakAt, mass, fall, h if it is sized by height).
2. Place it: a scatter rule, or by hand in worldgen.js with `addObj` / `propAt`.
3. Draw it: a model in `buildModel` in things.js (kit builder or a `Builder` geometry carrying position, normal, uv,
   color, aWind), and if it is not sized by height, a branch in `matrixFor`.
