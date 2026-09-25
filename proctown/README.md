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
