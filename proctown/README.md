# Procedural Towns

The town planner, the building kit, and two pages to tune them on.

**This is the one true planner.** `prototypes/farhold/` imports `js/townplan.js` from here, so a town
tuned on this page is the town you walk into in the game. There is no second copy to drift.

Open them at `http://<LAN-IP>:8400/proctown/` (the plan) and
`http://<LAN-IP>:8400/proctown/kit.html` (the building kit gallery).

## Why it exists

Farhold's original planner fired 2–6 straight-ish spokes out of a central square and dropped
buildings along them. A play-test came back with: *"Houses sitting on roads. Some roofs don't line up
with the walls. Alleyway roads clip beneath the surface texture. All the towns look and feel the
same, and they don't feel anything at all natural."*

Every one of those is downstream of the same mistake: **a building was placed at a coordinate, and a
street was drawn at a coordinate, and nothing reconciled the two.**

## The idea: a plot is the unit, not a building

```
footprint → blocks (recursive split — the CUTS become the streets)
          → plots  (each block divided; each plot knows which edge fronts a street)
          → a building fitted INSIDE its plot, facing its frontage
```

A house cannot sit on a road because **a road is not a plot**. That is why `overlaps()` can be a hard
assertion rather than a hopeful one, and why the test *"NOTHING sits on a street, in any culture, at
any size, on any seed"* is allowed to exist.

The street hierarchy falls out of the same recursion: the first cuts run the whole width of the town
and are **main** streets; by the time the blocks are small the cuts are **alleys**. A street is
important because it is long and it came first.

## Cultures are parameters, not code

`CULTURES` in `js/townplan.js` holds seven: human, elf, dwarf, undead, orc, halfling, desert. Each is
a street grammar, a jitter, block and plot sizes, storey range, a wall type and a street surface.

`jitter` is doing most of the work. A dwarf splits at the exact middle, square on (`0.04`) and comes
out as a rigid grid. A halfling wanders (`0.48`) and comes out irregular. **The generator does not
know what an elf is.**

The written design for each culture — aesthetic, materials, palette and cornerstone buildings — is in
`prototypes/farhold/TOWN_EXPANSION.md` §6.

**An eighth, `vharl` (2026-10-14, Thousandvale's Burning Isle — `prototypes/thousandvale/docs/EXPANSION-1.md`).** Island
folk who lift their houses clear of ash and mud: `grown`, jitter 0.40, wide blocks (10–17 m) and big plots (6.5 m), one
or two storeys. Its own bases in `data/buildkit.json` — `stilt_hut`, `stilt_long` (lifted 1.8–2.2 m) and `basalt_hall`
(the ground-floor hall trades use) — its own materials (`basalt`, `ochre_plaster`, a steep `reed_thatch` at pitch
1.15–1.75) and a red-ochre / dark-basalt / straw palette in `data/cultures.json`. Two things are new to the kit, both
opt-in so no other culture's buildings change: a culture may list `alwaysExtras` (the Vharl never leave a stilt house
without its stilts and stair; no random draw, so cultures without the field are byte-identical), and the `stilt_rows`
extra (`js/buildkit-vharl.js`) stands a lifted mass on rows of posts every ~2.8 m, each on a basalt footing, instead of
the four corner posts of `stilts`. No race maps to `vharl`: a game asks for it by name.

## The building kit: a building is a KIT, not a model

`js/buildkit.js` is the second half of the same idea. The planner fixed **where** a building goes;
the kit fixes **what** goes there. Before it, `prototypes/farhold/js/features.js` held twenty fixed
meshes and every town on every world was built out of the same twenty — which is the rest of the
play-test:

> *"Some roofs don't line up with the walls."*
> *"All the towns look and feel the same."*
> *"I'd like houses to have procedural parts and colours, more variety, more bases, more utility
> places like shops and other things which can be mostly like outdoor stalls."*
> *"More variety of houses, roofs, colours, walls, towers, bridges."*

```
plot + culture + seed  ->  describeBuilding()  ->  a building DESCRIPTION
                       ->  partsFor()          ->  a flat list of unit shapes
```

```js
import { describeBuilding, partsFor } from './buildkit.js';

const desc  = describeBuilding({ plot, culture: 'dwarf', seed: 7, townSeed, want: plot.want });
const parts = partsFor(desc);   // [{ mesh, x, y, z, w, h, d, yaw, colour, tag, mass }]
```

`partsFor` returns nothing but numbers and the names of eight unit shapes, so the 3D game instances
them and the 2D gallery draws the same list as polygons. **If the gallery looks right, the game
looks right.**

### The roof is generated from the wall rectangle

This is the permanent fix for *"some roofs don't line up with the walls"*, and it is structural
rather than careful. `roofFor(rect, opts)` takes `rect` — **the rectangle the walls actually
occupy** — and there is no other source of position or size in it. There is no parameter that could
disagree with the walls, because there is no parameter that describes the walls. Everything it
returns is centred on the rect and is `rect.w + 2·eave` by `rect.d + 2·eave`.

`roofsCover(desc)` asserts it across every base, roof, culture and seed (3,745 combinations in the
node test, and live on the gallery page).

### What is in it

| Table | Count | Where |
|---|---|---|
| House bases | 26 | `data/buildkit.json` → `bases` — the twelve from the design (long, square, L, courtyard, tower-house, row, round, stilted, dug-in, terraced, hall, stacked) plus fourteen culture ones |
| Roof types | 12 | gable, hip, half-hip, gambrel, mansard, flat, domed, conical, sawtooth, tiered, turf mound, tent |
| Roof materials | 10 | thatch, slate, clay tile, shingle, turf, lead, canvas, bone plate, leaf scale, verdigris copper |
| Wall materials | 13 | timber frame, wattle, cut stone, rubble, brick, log, plaster, mud brick, carved trunk, chitin, bone, hide, salvaged plate |
| Extras | 29 | porches, lean-tos, fences, gardens, benches, stairs, balconies, stilts, columns, banners, signs, shutters, washing lines, cellar doors, braziers, totems, pit fires, roof terraces… |
| Stall kinds | 7 | `data/buildkit.json` → `stalls` |
| Unit shapes | 8 | box, cylinder, gable prism, shed prism, pyramid, frustum, cone, dome |

Every number that decides how a building looks is in `data/`, not in the code — the inset from the
plot line, the storey height range, the eave overhang, the jetty, the colour jitter, the window
spacing, the chimney chance, and how far each extra reaches into the yard. A test fails if one of
them goes missing.

### Cultures are parameter sets here too

`data/cultures.json` holds the same seven the planner knows, from the kit's side: a palette, weighted
base and roof tables, materials, a street surface, a town-wall kind, a night lamp colour and which
stalls it keeps. Each one has **at least three silhouettes nobody else builds**:

| Culture | Only they build | Reads as |
|---|---|---|
| Human | jettied, cross-wing, hall | timber frame, thatch and clay tile, upper storeys over the lane |
| Elf | canopy house, bower, stilt house | pale timber, leaf-scale cones, a second storey of bridges |
| Dwarf | blockhouse, delve mouth, terraced | cut stone, brass courses, flat lead roofs, squat and on axis |
| Undead | tomb row, spire, stacked | bone and cracked plaster, half-fallen roofs, cages and braziers |
| Orc | war hall, hide tent, pit house | rough timber and hide, soot and blood red, totems |
| Halfling | burrow, roundhouse, L-plan | turf domes, round painted doors, dug into the bank |
| Desert | courtyard, wind-catcher, bazaar block | mud brick, flat roofs lived on, indigo trim, shade |

`the sameness test` in `tests/buildkit.test.js` is the one that matters: it builds five real towns per
culture and fails if any two cultures' base mixes overlap more than 62%.

### Outdoor stalls

The user asked for these by name. A stall is deliberately **not a building**: it needs no plot, it
stands where people already are, and it is four posts, an awning, a trestle and some goods.
`stallsFor(plan, { culture, seed })` places a ring facing into the square and a scatter along the
kerb of the main streets — never in the carriageway, which a test checks.

### The gallery

`kit.html` draws every base × roof, every material pair, a street of one culture, the stalls and the
seven palettes, from the same `partsFor()` list the game instances. The "Checks" box runs
`roofsCover` over the whole matrix live; `Audit every combination` prints the numbers.

### What it costs

One InstancedMesh per unit shape rather than one per building type, so a town is **eight draw
calls** whatever is in it. Measured over eight seeds a culture:

| Town | Buildings | Instances close up | Instances beyond 230 m |
|---|---|---|---|
| Human capital | 45 | ~1,350 | ~750 |
| Desert capital (the worst) | 58 | ~2,750 | ~1,565 |
| Orc village | 11 | ~190 | ~110 |

Plus 80–150 for the stalls. Only the town you are standing in is built at full detail; past 230 m a
building is its walls, roof, eaves, door and chimney and nothing else, which is a little over half
the parts. `features.js` caps the box mesh at 9,000, which covers one capital at full detail and
three more at distance inside the 2.6 km feature radius.

## Set-piece kit (propkit.js)

Play-test 2 (Thousandvale Q18/Q19) asked for bespoke places near a game's start: graveyards, farmland,
orchards, mills, shrines, ruins, a lumber camp, an inn yard. `js/propkit.js` is the model kit for everything
that stands AROUND the buildings in such a place. It works exactly like the building kit: **pure** (no
Three.js, no DOM), every model is a list of the eight unit shapes in `MESHES`, so a game instances a whole
zone's props in at most eight draw calls (plus one small group per turning part). Gallery: `propkit.html`
(group picker, seed, night toggle; `?group=farm`, `?night=1`, `?lite=1` for smaller shadows).

```js
import { propModel, cropField, fenceLine, PROP_MODEL_IDS, PROP_MODEL_INFO, PROP_GROUPS, CROPS, CROP_IDS, FENCE_LINE_KINDS } from './js/propkit.js';
const m = propModel('windmill', { seed: 7 });   // null for an unknown id
// { id, parts, spin, fires, glows, solid, radius }
cropField({ w: 12, d: 20, crop: 'wheat', seed: 3 });            // -> parts
fenceLine([[0, 0], [10, 0], [10, 8]], { kind: 'iron', seed: 2 }); // -> parts (wooden | iron | stone | hedge)
```

**Part format.** `{ mesh, x, y, z, w, h, d, yaw, rx, rz, colour, tag? }` in local metres, +z = the model's
front, `y` = the bottom of the part (unit shapes have their origin at the centre of their base). The part's
matrix is `T(x, y, z) * Ry(yaw) * Rx(rx) * Rz(rz) * S(w, h, d)` — Three.js `new Euler(rx, yaw, rz, 'YXZ')`:
yaw about y first, then the pitch `rx` about the part's own x, then the roll `rz` about its own z, all about
the part's origin. The game then turns the whole model by its placement yaw about the model origin.

- `spin: [{ x, y, z, axis: 'x'|'z', speed, parts }]` — parts relative to a pivot that turns about the model's
  own x or z at `speed` rad/s (the water wheel, the windmill's sails, a cog).
- `fires: [{ x, y, z, s }]` flame points; `glows: [{ x, y, z, color }]` small lights (the inn-sign lantern,
  the sigil slab's violet at night). Hand these to your light pool — the kit never makes a light itself.
- `solid: { r, h } | null` a footprint for the camera / collision on big things; `radius` how far it reaches.
- The same id + seed is the same model (lean, lichen, which headstone shape, size jitter ≤ 10 %).
- `PROP_MODEL_INFO[id] = { label, group, desc }`.

**Crops** (`CROPS`, `cropField`): rows run front to back over furrow ridges. wheat, barley, rye, oats, flax
(strips broken into clumps — a field reads as a mass), corn/maize (stalks with leaves and a tassel), turnip,
beet, cabbage, lettuce (leafy domes, roots showing), pumpkin, squash (vine strip with fruit), potato, carrot,
onion (low tufts), beans, peas (pole tepees), vineyard/grapes (posts, wire, leafy hedge, clusters), hops (tall
poles and twine), fallow/ploughed (furrows only). An unknown crop is a generic green row crop. The planting
step stretches until the field fits `CROP_PART_CAP` (600) parts, so a big field is clumps, not stalks.

**Models by group** (88):
- **graveyard**: `gravestone`, `gravestone_leaning`, `tomb_chest`, `iron_fence`, `iron_gate`, `lychgate`, `crypt_door`, `mausoleum`, `grave_cross`, `celtic_cross`, `grave_obelisk`, `grave_mound`, `open_grave`, `bell_frame`
- **farm**: `scarecrow`, `haystack`, `hay_bale_round`, `hay_bale_square`, `haycart`, `sheaf_stook`, `beehive`, `barn`, `water_trough`, `well`, `chicken_coop`, `pig_sty`, `goat_shed`, `compost_heap`, `pumpkin_pile`, `wooden_fence`, `stone_wall`
- **orchard**: `cider_press`, `apple_tree`, `pear_tree`, `plum_tree`, `cherry_tree`, `orchard_ladder`, `fruit_crate`
- **mill**: `windmill`, `watermill_wheel`, `millstone`, `sluice_gate`, `gear_housing`
- **shrine**: `standing_stone`, `altar_stone`, `shrine_statue`, `offering_bowl`, `prayer_cairn`, `wayside_shrine`, `sigil_slab`
- **ruins**: `broken_tower`, `collapsed_stair`, `ruined_wall`, `ruined_arch`, `fallen_column`, `rubble_heap`
- **lumber**: `saw_pit`, `log_stack`, `tree_stump`, `axe_block`, `felled_log`, `plank_stack`, `timber_sled`, `lumber_tent`, `grindstone`
- **hunt**: `hunters_tent`, `skinning_frame`, `trophy_post`, `smoking_rack`, `bone_heap`, `den_mouth`
- **fishing**: `jetty`, `rowboat`, `fish_trap`, `rod_rack`
- **inn**: `inn_sign`, `hitching_post`, `bench`, `picnic_table`, `notice_post`, `lantern_post`
- **misc**: `campfire`, `cauldron_tripod`, `wagon_wheel_leaning`
- **training**: `training_dummy`, `archery_butt`, `weapon_rack`, `sand_pit`

Every named model in Thousandvale's `data/vignettes/setpieces.json` exists here (a test reads the file).

**Drawing it in Three.js** — `js/propkit-three.js` (imports nothing; pass your `THREE`):

```js
import { unitGeometry, partMatrix, placeModel, instanceParts } from './js/propkit-three.js';
const placed = [];
for (const p of placements) placed.push(...placeModel(THREE, propModel(p.id, { seed: p.seed }).parts, p.x, groundY, p.z, p.yaw));
for (const mesh of instanceParts(THREE, placed, material)) scene.add(mesh);   // one InstancedMesh per kind
// spin groups: a THREE.Group at the pivot holding instanceParts(THREE, s.parts, material); rotate it per frame
```

Tests: `node --test proctown/tests/propkit.test.js` (every model builds from MESHES with finite positive sizes
and hex colours, deterministic per seed, nothing deeper than 0.6 m, E's model ids all exist, crop fields stay in
their plot and under the cap, fence lines follow their points).

## The plan page

| Control | What it is for |
|---|---|
| Seed, ← →, Reroll | Step through seeds. Stepping is how you spot a bad one. |
| Culture, Size | The two knobs that change the most. |
| Plots and districts | Plot outlines, coloured by district (civic / craft / residential). |
| Blocks | The blocks the plots were cut from. |
| Frontage | A line from each building out to the street it faces — the reason a door is never on a blank back wall. |
| Compare four seeds | The sameness test you can do with your eyes. If they look like one town drawn four times, the knobs are wrong. |
| Highlight | Type `inn`, `forge`, `hall`… — matches get a gold ring, the rest fade. |
| Checks | Live overlap verdict. Red boxes mean a building is on a street and the **planner** is wrong. |
| Sameness report | 200 towns, and the spread of streets / plots / gates. Numbers, not vibes. |
| Copy / Paste JSON | Reproduce a reported town exactly. |
| Kit gallery → | `kit.html`, the building-kit page above. |

## API

```js
import { planTown, overlaps, summarise, CULTURES } from './townplan.js';

const plan = planTown({ seed: 7, size: 4, culture: 'human' });
```

`planTown` returns:

| Field | Shape |
|---|---|
| `streets` | `[{ pts:[[x,z],…], cls, width, depth }]` — `cls` is `main` / `lane` / `alley`, clipped to the wall. A `highway: true` street is a road from outside that was brought in; a `spur: true` one was added to join an otherwise orphaned lane |
| `blocks` | `[{ x, z, w, d, depth }]` |
| `plots` | `[{ x, z, w, d, cx, cz, facing, district, want }]` — `facing` is the angle out to the street |
| `square` | `{ cx, cz, r }` — open ground, nothing built on it |
| `wall` | `{ kind, poly, gates:[{ angle, x, z, road }] }` or `null` below size 4 |
| `links` | how many of the `links` you passed became a high street |
| `connect` | `{ groups, spurs, dropped }` — how many pieces the plan was in before the network pass, how many spurs it took to join them, and how much paving was thrown away for having nothing to reach |
| `ring`, `wallRadius`, `culture`, `size`, `seed` | |

`planTown` also takes `links: [[x, z], …]` — **where the world's roads arrive**, in the town's own
coordinates. Farhold works these out by walking the inter-town route's own polyline looking for the
step from outside the ring to inside (`roadLinksFor` in `js/features.js`).

**Opt-in office list (`trades`, added 2026-10-05 for Thousandvale).** `planTown({ …, trades: { list,
share, pick, minArea } })` replaces `WANT_ORDER` with the caller's own list: each entry (`'forge'` or
`{ want, from, minArea }`) gets ONE plot of its own, in priority order, never shared; `share` caps offices
at that fraction of the plots (default 1/3); `pick: 'square'` puts them nearest the square (each at least
`minArea` m², default 24) instead of biggest-first. Assigned plots carry `office: true`. Without `trades`
every town is byte-identical to before (a test holds it), so Farhold and Bannerline are untouched. Thousandvale
uses it to give every NPC role its own building (`prototypes/thousandvale/data/world/town-offices.json`); the
new wants (shop, temple, barber, counting_house, study, armoury, bowyer, tailor, apothecary, provisioner,
jeweller) have shapes in `data/cultures.json` `wantBases`. `assignTrades(out, trades, size)` is exported.

Everything is deterministic from `seed` alone, so a town is the same town every visit and **nothing
has to be stored**. A bug report that names a seed is reproducible.

Helpers: `overlaps(plan)` returns the hit list (must be empty), `summarise(plan)` gives the one-line
shape used by the batch report, `footprintOf(size)` gives `{ ring, wall, walled }`, and `makeRng(seed)`
is the generator everything else draws from. `connectStreets(out)` and `linkRoads(out, links)` run
inside `planTown` and are exported so a test (or the page) can re-measure a plan; `nearestOnStreets`
is the "where would a spur join" primitive both of them use.

## One network, and the road that comes into town

Reported from Farhold, twice: *"There are still random flat rectangles in town I think are supposed
to be roads, can they be interconnected somehow and actually connect to the real roads passing
through towns? They still don't feel quite natural."*

The cuts that make the blocks **are** in principle a connected network — a child street runs from one
edge of its block to the other, and those edges are its parent's streets. Three things break that:

1. a drifting child block *shrinks* to stay inside its slot, so its alleys stop short of the street
   that made them;
2. `clipPolyline` cuts every street to the wall circle, which can leave a stub near the edge with
   both of its junctions outside;
3. the renderer drops any span that lands in water or on a riverbank, which can halve a street.

Any of those leaves **paving with no road attached to it** — a slab in a field, which no player can
read as a road. `connectStreets` groups the streets into connected components, takes the one holding
the square as the town, gives every other component a **spur** to reach it (up to 26 m), and drops
whatever will not join. `linkRoads` takes the points where a world road meets the ring and lays a
main street from each to wherever the plan comes closest — a road reaching a town becomes its high
street, because that is what a road does.

**Both run before a single plot is cut.** A spur is a street, and cutting plots first and laying
spurs through them afterwards would put houses on roads again — the one thing this planner exists to
make impossible. A spur crosses a block rather than bounding it, so plots are trimmed against the
added streets afterwards, and `overlaps()` stays at zero.

## Rules the tests hold

`node --test proctown/tests/townplan.test.js` (the plan):

- the same seed is the same town, and a different seed is a different town
- **nothing sits on a street**, across 7 cultures × 11 seeds × 6 sizes
- every plot is inside the footprint — trimmed on the plot's own corners, not its block's centre
- a bigger settlement really is bigger
- a walled town has **2–4 gates**, spread around the wall, never stacked on one side
- every plot faces a real direction and knows its district
- what a town wants follows its size — a hamlet never raises a barracks
- the trades get the big plots, not an alley
- the culture genuinely changes the shape of the town
- street classes are a real hierarchy
- **every town is one connected network** — 7 cultures × 5 seeds × 6 sizes, no loose paving
- a road arriving from outside becomes a street that starts at the ring and ends on the plan
- a spur is a street, so nothing is ever built on one (`overlaps()` still empty with links passed)
- `linkRoads` does nothing when the road already meets the plan

`node --test proctown/tests/buildkit.test.js` (the kit, 20 tests):

- the same seed is the same building, and a different seed is a different building
- **a roof is generated from the wall rectangle** — the eave board is exactly the walls plus the same
  overhang all round, and every roof covers its own walls across 3,745 combinations
- a roof is never taller than the building can carry
- no combination yields NaN geometry, or a part with no size, or a shape that is not one of the eight
- a building stands inside its plot: its walls are inside the rectangle, its eaves stay within 0.6 m
  of the plot line, and its yard clutter stays in the yard
- the kit frame turns onto the plot frame whichever edge fronts the street
- every culture has at least three silhouettes nobody else builds, and no two build the same town
- wealth changes what a building is made of
- every name in the data points at something that exists, and the knobs are all in the data
- a stall is deterministic and never stands in the carriageway
- a real plan turns into a real town in every culture at every size, inside the part budget

## Still to build

`TOWN_EXPANSION.md` is the full plan. From §2, still open: the 3D preview, a live palette editor that
writes back to `data/cultures.json`, the walkability flood-fill, the on-page performance readout, and
the regression guard that Farhold's import and this page produce identical plans. §1 items not yet
in: terrain-aware streets, and plot-fill (yards, pens, woodpiles —
the kit does the clutter that touches a building, but the empty half of a big plot is still empty).
From §3: level-of-detail past the two tiers `features.js` has, signage glyphs, smoke by day and
window light at night.

## Office dressing (offices.js)

`js/offices.js` dresses a service building so you can find the smith without reading a map (Thousandvale play-test 2,
Q10: "each NPC needs their own office; each NPC structure a distinct look; active lights where they should attract the
player"). Pure, same frame and unit shapes as `partsFor()` (origin at the plot centre, +z = the street/door side,
`y` = the bottom of a part, tilts `rx`/`rz` applied after `yaw`, Euler order 'YXZ').

```js
import { officeDressing, officeKindFor, OFFICE_KINDS } from './js/offices.js';
const desc = describeBuilding({ plot, culture, seed, want: 'forge' });
const d = officeDressing(officeKindFor('smith'), desc, { lit: true, seed });
// d.parts  unit shapes (tag 'lamp' = lantern glass: draw it with a material that glows at night)
// d.lights [{x,y,z,color,strong}] lanterns / the forge hearth — only when lit
// d.fires  [{x,y,z,s}] flames;  d.spin [{x,y,z,axis,speed,parts}] mill sails (parts relative to the hub)
// d.signs  hanging picture signs;  d.fascia {x,y,z,w,h} the name board over the door (a game writes the label on it)
```

23 trades (`OFFICE_KINDS`, each with a label, a sign emblem and whether it is a lit shop): forge (open shed, hearth with
fire, anvil, quench trough, tool rack), shop / provisioner / market (striped awning, goods table, crates, market stalls),
inn (tankard sign, two lanterns, benches, barrels, a hitch), stable (paddock, hay, trough, saddle on the rail), barber
(striped pole), armoury, bowyer, tailor, apothecary, jeweller, temple / chapel / shrine (steps, sun disc, candles,
statue — unlit), hall (banners, steps, flagpole — unlit), counting house, study, mill (turning sails), granary /
warehouse, barracks / watchpost. `officeKindFor()` takes a want, an office name or an NPC role (`smith` -> forge,
`elder` -> hall, `unbinder` -> study; `house`/`hut` -> null: a home is never dressed or lit).
Tests: `node --test proctown/tests/offices.test.js`. Thousandvale draws it in `js/client/town-view.js` (lit glass +
light-pool lanterns on shops only) and writes every label into one canvas atlas (`js/client/sign-text.js`, one draw
call per town).

## Opt-in edge pieces: barricade, gate leaves, posts, grates (Thousandvale play-test 4)

`js/buildkit.js` adds pieces outside `WALL_KINDS` / `FENCE_KINDS` so Farhold's per-kind meshes are unchanged:
`EXTRA_WALL_KINDS = ['barricade']` (`wallKitParts('barricade', 'wall' | 'tower' | 'gatehouse')` — leaning stakes over a log rail,
outside = local +X), `gateLeafParts(kind, thick, len)` (one leaf hinged at its origin along +X: `door` planks + iron bands, `rail`
field gate, `frise` a cheval de frise built at length `len`), `gatePostParts(kind, width)` (posts / stake bundles / hedge piers
outside the passage) and `grateParts(width, h)` (an iron water grate with piers). Parts may carry `rx`/`rz` tilts (Euler 'YXZ').
Thousandvale's `js/client/walls-view.js` shows how to lay them on a baked ring (pieces stretched to fit each straight, gatehouse
widened to the road, leaves swung inward).

## Opt-in: taller buildings (`tune`) and wide gatehouses (Thousandvale play-test 5)

Both are OPT-IN. Without them the kit's output is byte-identical (`tests/buildtune.test.js` compares every part), so
Farhold's towns do not change.

**`describeBuilding({ ..., tune })`** — make the same building taller without moving it. The plot, the door's side and
the yaw are untouched; only heights and the size INSIDE the plot change. No extra random draws.

| knob | what it does |
|---|---|
| `storeyHeight: [lo, hi]` | metres a storey, replacing `knobs.storeyHeight` x the culture's `storeyScale` |
| `doorHeight`, `doorWidth: [lo, hi]` | replace the knobs of the same name |
| `minStoreys: n` | at least n storeys, whatever the base says (a hovel is `[1, 1]`) |
| `sink: k` | multiplies how far a dug-in base sinks; `0` stands it on the ground. A burrow's door otherwise starts 48% of a storey under the grass |
| `fill: 0..1` | the footprint takes at least this share of the plot each way, past the base's own max size and ratio |
| `minPitch: p` | the roof is at least this steep, as far as its roof type allows |
| `roofBias: {type: k}` | multiplies the culture's weight for a roof type |
| `windowScale: k` | multiplies window size |

Why: Thousandvale's character is 1.75 m; a halfling storey is 2.0-2.5 m and its door 1.75-2.2 m, so the owner's verdict
was "too short/squat". `prototypes/thousandvale/js/client/building-tune.js` holds that game's numbers.

**`gatehouseParts(kind, open)`** — a gatehouse whose clear opening is `open` metres instead of 4.2. The jambs keep their
size and move apart; only what spans the passage (lintel, wall walk, rib arch) grows. `open` 4.2 is the kit piece. Use it
when a gate has to stand in the wall's line while a road crosses at a slant: the opening along the wall is
`pass / cos(slant) + 2 x 1.7 x tan(slant)`. Scaling `wallKitParts(kind, 'gatehouse')` along x fattens the jambs instead.

**Office name board** (`offices.js`): on a front of two storeys or more the board sits clear over the door
(`door.h + 0.28`); a one-storey front still tucks it under the eave.

## High streets (opt-in, 2026-10-08)

`planTown({ highStreets: { to: 'square', width, clear, keep, avoid, join, attempt } })` — added for Thousandvale, whose
players reported that a town gate "just leads you right into buildings instead of having a main road". `linkRoads` joins a
road to wherever the network comes closest, which on a plan of alleys is an alley three metres inside the wall. With this
option each link is carried as ONE main street from the edge of town to the edge of the square.

| option | meaning |
|---|---|
| `width` | metres (default the main class's 5) |
| `clear` | kerb kept free of plots either side, on top of the width |
| `keep` | plots `{cx, cz, w, d, angle}` that must survive: the street aims off-centre at the square, or is threaded round them (`threadWay`, a lattice search with the corners cut), or narrows (never under `narrowest`, 3.2 m); only if no way exists does it go through |
| `avoid` | discs `{x, z, r}` already standing that the street passes beside |
| `join` | (default on) a link close beside a street already laid forks off it instead of running parallel |
| `attempt` | 0..6: use exactly that retry attempt of `planTown` (a caller matching a plan it already has) |

Streets carry `high: true`, `highway: true`, `link`, `to: 'square' | 'street'`, `joins`, `clear`. With the option, the
retry floor is judged on `plan.plotsCut` (plots before the high streets took any) so the same attempt wins as without.
**Without the option nothing runs and every plan is byte-identical** (`tests/highstreets.test.js`, and Farhold's town
tests). Thousandvale's use: `prototypes/thousandvale/docs/world.md` §13.
