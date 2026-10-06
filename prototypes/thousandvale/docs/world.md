# Thousandvale — world data and the terrain reader (stream B)

**Status:** M1 bake v1, 2026-10-04 (M0 test zone kept). Owner: stream B (`tools/bake-*.mjs`, `data/world/**`, `data/zones/**`,
`js/rules/terrain-read.js` ★, the viewers). Changes to the reader go through stream B (`docs/requests.md`).

## 1. What exists at M0

| File | What |
|---|---|
| `data/zones/test/terrain.bin` | **The one test zone**: 2,048 × 2,048 m, 1,025 × 1,025 samples at 2 m, from World Forge seed 1000 (macro window 52,38 of a 288 × 224 world). Grassland + temperate forest + marsh, three rivers, heights 126–452 m, median slope 6.7°. 6 MB. |
| `data/zones/test/zone.json` | The same meta in readable form + a summary (biome shares, slope stats, sites, spawn). Not needed at runtime — `terrain.bin` carries its own meta. |
| `js/rules/terrain-read.js` ★ | The pure reader. Server, client, bots and tests all read heights through it. |
| `tools/bake-test-zone.mjs` | The M0 one-off bake (World Forge → refine → rivers → biomes → file). ~5 s. `--check` fails if the checked-in file is stale. The full bake tools are M1 (PLAN §3.2) and keep this format. |
| `tools/terrain-viewer.html` | Tiny viewer: biome/height/slope/water layers, sites, spawn, and a hover readout that calls the reader. Dev server: `http://<LAN-IP>:8401/prototypes/thousandvale/tools/terrain-viewer.html` (or 8491 once stream A serves `tools/` — it does not by design, so use the playground dev server). |
| `tests/B/terrain-read.test.js` | 11 node tests: purity, round trip, refused bad files, known-plane maths, clamping, **drawn = measured** (the reader against `gridIndices()` triangles), water depth, the baked zone is sane, bake determinism. |

## 2. Coordinates

- Metres. **+x east, +z south, +y up** (three.js default axes).
- Zone-local: sample `(i, j)` at `x = origin.x + i * step`, `z = origin.z + j * step`. The test zone has
  `origin (0, 0)` and `step 2`, so it covers **x, z ∈ [0, 2048]** — the corner is the origin, not the centre.
  (Stream D's stand-in field is centred on 0,0; when switching, offset by `terrain.origin` / `extent`.)
- Every query outside the bounds clamps to the edge; `heightAt` never returns NaN (NaN input → the corner).
- `meta.source.worldOrigin` is where the zone sits in World Forge metres (128 m per macro sample) — M1 zones
  will tile edge to edge in those coordinates.

## 3. API (`js/rules/terrain-read.js`)

```js
import { parseTerrain, gridIndices, MAX_WALK_SLOPE, WADE_DEPTH } from '<rel>/js/rules/terrain-read.js';

// load the bytes yourself — the module is pure (no fetch / fs):
const buf = await (await fetch('data/zones/test/terrain.bin')).arrayBuffer();         // browser
const buf = fs.readFileSync(new URL('../data/zones/test/terrain.bin', import.meta.url)); // node
const t = parseTerrain(buf);   // throws on a bad magic / version / short file — never misreads

t.heightAt(x, z)     // ground metres (exact plane of the drawn triangle)
t.normalAt(x, z)     // [nx, ny, nz] unit, flat per triangle
t.slopeAt(x, z)      // degrees
t.waterAt(x, z)      // { kind: 'none'|'sea'|'lake'|'river', surface, depth }
t.biomeAt(x, z)      // biome id; t.biomes[id] = { id, key, name, color } (World Forge's table)
t.sample(x, z)       // { height, slope, normal, water, biome, biomeKey }
t.walkable(x, z)     // ON FOOT: in bounds && slope ≤ MAX_WALK_SLOPE (46°) && water depth ≤ WADE_DEPTH (1.1 m)
t.moveAt(x, z)       // 'out' | 'steep' | 'walk' | 'wade' | 'swim'  (P25 depth/swim layer; a bridge deck is 'walk')
t.passable(x, z)     // walk, wade OR swim — the movement check for a body that can swim
t.groundAt(x, z)     // the bare ground (heightAt is the surface you stand on: a bridge deck where one spans)
t.deckAt(x, z)       // bridge deck height, NaN off a deck;  t.bridges = meta.bridges [{a:[x,z], b:[x,z], h, w}]
t.inBounds(x, z); t.clamp(x, z) -> [x, z]
t.bounds             // { minX, minZ, maxX, maxZ }; t.extent = 2048; t.size = 1025; t.step = 2
t.meta.spawn         // { x, z } a flat dry spot next to the zone's village — use as the respawn point
t.meta.sites         // World Forge nodes in the zone: [{ type, kind, name, x, z }] (village, hamlets, a ford)

// mesh building (client):
t.heightGrid()       // Float32Array(size*size) metres, index j*size+i (cached)
t.waterGrid()        // Float32Array water surface, NaN = dry (cached)
gridIndices(size, stride = 1)   // Uint32Array triangle indices, CCW from above, SAME diagonal as heightAt
t.heightOfSample(i, j), t.waterOfSample(i, j)

// combat core / walkers (Farhold ground.js shape, same as js/rules/terrain-flat.js):
groundAdapter(t) -> { heightAt, slopeAt(x,z,s) /* rise/run */, normalAt(x,z,s,out), waterAt /* depth */, underwater, roadAt, clampToWorld, biomeIdAt, walkable }
```

**Drawn = measured.** Each grid square is cut along the diagonal from `(i+1, j)` to `(i, j+1)` — the same
split stream D's `js/client/heightfield.js` uses. Build the mesh from `heightGrid()` + `gridIndices()` and
`heightAt` is exactly the drawn surface, so feet never float or sink. For a coarse LOD mesh use
`gridIndices(size, stride)` over every `stride`-th sample (1024 divides by 2, 4, 8, 16, 32, 64…).

**Water** is its own grid layer (`waterGrid()`), and `waterAt()` interpolates that same layer over the same
triangles, so the drawn water sheet and the measured surface agree (Farhold's water-staircase lesson). A
triangle is wet only when all three corners carry water; one ring of samples just outside every wet edge
carries the surface too, so a sheet built from wet triangles reaches the bank. Draw the water mesh from
triangles whose three corners are all non-NaN.

**Server use (stream A):** `host.groundAt = t.heightAt`, `host.walkable = t.walkable`; clamp positions with
`t.clamp`. Speed checks over slopes can use `t.slopeAt`. Swimming = `t.moveAt(x, z) === 'swim'` (depth > WADE_DEPTH);
to let people swim, move with `t.passable` instead of `t.walkable` and float a swimmer at `waterAt().surface` (§9).

## 4. File format (`terrain.bin`, version 1, little-endian)

```
'TVZN' | u32 version | u32 jsonBytes | JSON meta | pad to 4 |
u16[size²] height | u16[size²] waterTop (0 = dry) | u8[size²] waterKind (0 none 1 sea 2 lake 3 river) | u8[size²] biome
```
Heights are `heightMin + v / 65535 * (heightMax - heightMin)` (2.4 cm steps on the test zone). Meta:
`name, size, step, origin, heightMin, heightMax, bakeVersion, inputHash, biomes[[key,name,color]], waterKinds,
source{tool, world, macroWindow, worldOrigin, landMetres, seaMetres}, rivers, sites, spawn`.
A file with the wrong magic or version throws (PLAN §3.2.5).

**File version 2 (the bake writes it since 2026-10-04; readers open 1 and 2, nothing to change on your side).**
Same header and meta, then `u32 packedBytes` + raw DEFLATE of the same layers, with the heights stored as
residuals of a planar guess (left + up − up-left, mod 65536) so a smooth slope becomes a run of near-zero
numbers. `nav.bin` v2 is the same idea (deflated bits). Decoded synchronously by `js/rules/inflate.js` (pure,
~40 ms for a zone; no `node:zlib`, no DecompressionStream, no library). `FORMAT_VERSION` stays 1 — it names the
layers and feeds the bake hashes, which did not change; `FILE_VERSIONS = [1, 2]` lists the containers. A zone went
from 7.5 MB to ~0.85 MB (terrain.bin 6.3 MB → 0.6 MB, nav.bin 1 MB → 38 KB); all 17 checked-in zones 122 MB → 14 MB.
The bake tests compare checked-in files DECODED (`sameLayerFile` in `tools/lib/zone-layers.mjs`), so a zlib
upgrade that changes the compressed bytes but not the layers is not "stale".

## 5. How the test zone was made (the recipe M1 generalises)

1. World Forge 288 × 224, seed 1000, `plates` (≈1 s). 16 macro samples per zone edge = 128 m each.
2. The best 16 × 16 window scored for a first zone: < 4 % water, ≥ 6 river cells, a settlement away from
   the edges, 2–4 biomes, ~0.12 elevation relief.
3. Refine to 2 m: bicubic macro height (elevation 0.5 → 0 m, 1.0 → 1,400 m) + three noise layers at
   **world** coordinates, scaled by the macro slope (flat land stays gentle, hills get ridges).
4. Rivers: World Forge's river cells → Chaikin-smoothed, noise-meandered polylines; the water surface is a
   running minimum of the ground along the river (never runs uphill); channels 7/14/24 m wide by class with
   eased banks.
5. Biomes: macro biome at a noise-warped position (borders wander), water → Shallows/Lake, slopes over ~42°
   → Mountains (rock).
6. Spawn: the flattest dry walkable point within 120 m of the first settlement.

Known M0 limits (M1 bake fixes): no roads, town footprint or placements yet; the river sources start
abruptly where World Forge's river begins; no zone-edge test yet (one zone).


## 6. The world and the zone bake (M1, world re-chosen 2026-10-04)

**The world (coordinator ruling: fix the land count now).** World Forge **pangea, seed 1001, sea level
0.20, 12 regions**, 288 × 224 macro samples → an **18 × 14 grid of 2,048 m zones, 202 of them more than
half land, in 12 provinces of 10–30 zones** (chosen from a 54-combination scan; the closest to 200 with
the most relief variety: hills 25 %, grassland 25 %, savanna 11 %, mountains 10 %, forests 15 %). The M0
test zone (`data/zones/test`, seed 1000) is unchanged and stays as a fixture; the old `z03_02` (seed 1000) and a short-lived `z15_02` starter are deleted.

| Province (World Forge region) | id | biome | danger | zones |
|---|---|---|---|---|
| **Petbeck Basin — the starter province** | 10 | grassland | 0.167 | 30 |
| Feafeast Highlands | 0 | grassland | 0.164 | 23 |
| The Hollow Expanse | 6 | grassland | 0.164 | 15 |
| The North Vale | 4 | grassland | 0.214 | 16 |
| The Cinder Vale | 9 | savanna | 0.221 | 11 |
| Wepar Highlands | 3 | grassland | 0.242 | 14 |
| The Quill Reach | 5 | savanna | 0.255 | 21 |
| The Briar Expanse | 11 | hills | 0.272 | 11 |
| Bandot Vale | 2 | hills | 0.341 | 12 |
| Ferpin March | 7 | hills | 0.350 | 20 |
| Rerur March | 1 | hills | 0.384 | 16 |
| Sidad Hollow | 8 | hills | 0.406 | 13 |

(Names are World Forge's, for stream E to keep or replace in `data/provinces/`. Banned words are swapped at
bake time — `cleanName` in bake-world.mjs: ember→Cinder, veil→Shroud, muster→Gather, … — and a test fails
on any that slips through.) `world.json` lists each province's zones (`provinces[].zones`) and each zone's
`province`.

**Torbor Downs = 16 zones of Petbeck Basin.** Stream E's province sheet (`data/provinces/torbor_downs.json`, a 4×4
design grid) sits on world zones **x 11–14, y 1–4** (`data/world/province-map.json`, E zone id → world zone id). All 16 are
baked and checked in (122 MB — see the size note below). Every zone has a dungeon door and an event arena (`event_<E zone
id>`, r 40); `blackthorn_scar` (`z11_04`) also has `world_grimtallow` (r 100); every settlement in them is planned.

| E zone | world | E zone | world | E zone | world | E zone | world |
|---|---|---|---|---|---|---|---|
| hollin_pass | z11_01 | ashcombe | z12_01 | brackwater | z13_01 | saltmouth | z14_01 |
| delvers_hill | z11_02 | **test → start** | **z12_02** | torbor_cross | z13_02 | gullwick | z14_02 |
| wychwood | z11_03 | saint_orrins_rise | z12_03 | millbrook | z13_03 | redcliff | z14_03 |
| blackthorn_scar | z11_04 | coldwater | z12_04 | gorse_march | z13_04 | sunken_wolds | z14_04 |

Row 4 is mountains/badlands/savanna with no World Forge settlement (a fit for E's blight/frontier row); `z13_01` has no
settlement either. `meta.sheet` in each terrain.bin names the E zone.

**Starter zone `z12_02`** (E's `test` cell). World Forge's town there (Briarwatch) is renamed **Torborhold**
(`STARTER` in bake-world.mjs) and is the hub (`hub: true`).

| Site | Where (zone metres) | Notes |
|---|---|---|
| **Torborhold** — town, hub | (592, 1264), r 90 | proctown halfling culture (the province's people), 28 buildings, high streets joined to the roads; spawn (588, 1264) |
| Pohelrow — hamlet | (256, 1920), r 40 | 8 buildings |
| Ashford — hamlet | (1344, 1568), r 46 | 9 buildings (circle grown to hold its plan) |
| Mipider Ford, Milhot Ford — crossings | (64, 1984), (1344, 1472) | |
| `door_1` Barrow entrance | (354, 1292), yaw 1.185 | 240 m west of Torborhold |
| `event_grandmother_skein` | (357, 1944), r 40 | by Pohelrow |
| `elite_hobb_gallowsby` | (75, 1973), r 25 | at Mipider Ford |

**Files per zone** (`data/zones/<id>/`, ~7.5 MB): `terrain.bin` (format v1; `meta.biomes` gained a last entry
`road` for painted roads and streets), **`nav.bin`** (per 2 m sample: `NAV` bits WALK/ROAD/SHALLOW/DEEP/STEEP/
SOLID/TOWN/BUILDING; `parseNav(bytes)` → `at(x,z)`, `passable(x,z)`), **`scatter.bin`** (trees/bushes/rocks/reeds,
8 bytes each, ~5,000–20,000 a zone; `parseScatter(bytes)` → typed arrays + `SCATTER_KINDS` with `solid` and trunk
radius), `placements.json`, `zone.json`.

**placements.json kinds:** `settlement` (radius, hub, planned) · `town_square` (r, culture) · `street` (pts,
width, cls) · `building` (proctown plot: centre, `w` along `angle` (local +x = (cos angle, sin angle)), `d`
across, `want`; **yaw faces the nearest drawn street**, `streetGap` ≤ 0) · `town_wall` (size 4+) · **`road`**
(pts `[[x, z, h]]` with the graded height, width 3.5/6/8 by class, `spur` for a link to a moved town; a road
**stops at a town's rim**, where the town's high streets carry on) · **`bridge`** (where a road crosses a river:
yaw along the road, span, deck height) · `dungeon_door` · `event_site` · `camp_site` · World Forge `landmark`/
`crossing`/`pass`.

**How a zone is baked** (`tools/bake-zone.mjs`, ~3 s): base ground at world coordinates → sea/lakes →
settlements placed (moved off water/edges; hub ≥ r + 200 m from every edge, others ≥ r + 70 m) → roads graded
into the ground (world polylines; spurs only ≥ 120 m from edges) → every settlement levelled and planned with
proctown (culture from the province's people, links where the roads cross its ring) → rivers carved → wet
ring → surface (macro biome warped, water/rock, roads and streets painted) → world-fixed quantisation →
door/event/camp sites (clear of towns and of E's vignettes in `data/vignettes/placements/<zone>.json` if
present) → scatter (a world-aligned 6 m jittered grid hashed on world cell coordinates, half-open per zone, so
no tree is doubled or lost at an edge; density by biome with grove clumping; clear of towns, sites, vignettes,
water and a 2 m road verge) → nav.

**Tests (`tests/B/zone-bake.test.js`):** world/zone bakes deterministic and checked in; **edges bit-exact**
(height, water, kind, surface) with the east and south neighbours; road surface agrees on all four edges
(the starter zone's roads cross its edges); a test compares every shared edge among all checked-in zones (24 edges across the 16); ~200 land zones in 12 provinces, starter among the
safest, no banned words; every settlement planned, buildings inside their circle on dry level ground facing a
street, none on a road; scatter plausible and clear; sites open.

**Order with stream E:** E places vignettes against a baked zone → B re-bakes that zone so scatter and new sites
keep off them (the terrain heights do not change when only scatter/sites move, but `terrainHash` is per bake —
match on zone id).

**Size:** a baked zone is ~0.85 MB (file version 2, §4), so the 16 Torbor Downs zones are ~13 MB and the whole
world (~200 land zones) would be ~170 MB. Keeping only the provinces in play in git and baking the rest on demand
(3–4 s a zone, deterministic) is still the plan for later provinces. (Git history still holds the 122 MB of v1 files
if they were ever committed.)

**nav.bin and bridges (fixed 2026-10-04).** Every bridge used to read as DEEP water in `nav.bin`, so a river cut the
province in two for anything that walks by nav (the reachability test found the whole east column of Torbor Downs —
gullwick, redcliff, sunken_wolds — 28–55 % reachable). The bake now stamps each deck as a road-wide WALK|ROAD strip
along the road, long enough to land on both banks at a slant (`span × 1.6 + 20 m`), in every zone the deck reaches.

Known gaps: no scatter/nav for the M0 test zone (fixture only); buildings are footprints (the client builds
them with proctown's buildkit); roads have no lamps/signposts yet; only zones that are baked have files —
`node tools/bake-zone.mjs <id>` for any of the 252.


**E's names, asks and theme terrain (2026-10-04, lead ruling).** `data/provinces/torbor_downs-places.json` is read at bake
time: `rename` (keyed by the slug of World Forge's name) is imposed on settlements and fords (`wfName` keeps the old one,
and seeds the town plan so a rename never reshuffles a town); `asks` are placed exactly where E put them (radius at least
the kind's); the hub is the settlement named like the sheet's `town`, grown to a town if World Forge made it smaller.
Fords snap onto the nearest river point. `data/world/zone-themes.json` gives three zones the water their archetype needs
(`tools/lib/zone-theme.mjs`, carved after the roads, off towns and roads, ≥ reach + 120 m inside the edges so neighbours
still match bit for bit): **marsh** = a fen painted `marsh` with one deeper mere and wadeable pools (≤ 0.85 m);
**shore** = a big lake with a sand band by the hub; **mere** = two lakes in the lowest-rimmed valleys. Each lake's level is
just under the lowest point of its outline and the bank eases down to it. `meta.theme` and placements `lake` / `fen` carry them.

## 7. The far horizon (`data/world/horizon.bin`, M2)

The whole world at **32 m** (1,153 × 897 samples), made by `node tools/bake-horizon.mjs` (2–3 s; re-run after any
zone bake — `tests/B/horizon.test.js` fails when it is stale). **In a baked zone each sample IS the zone's own
sample** (every 16th of its 2 m grid: height, water surface, biome), so a far mesh meets the loaded zone exactly on
its rim; elsewhere it is the zone bake's own first steps (base ground + sea + lake levels + warped macro biome), which
the test measures at a median 0.01 m from what an actual bake makes away from towns and rivers. 4× finer than
`macro.bin` (128 m). 1.5 MB (deflated like terrain.bin v2).

```js
import { parseHorizon, horizonRef } from './js/rules/horizon-read.js';   // pure, sync
const h = parseHorizon(await (await fetch('data/world/horizon.bin')).arrayBuffer());
h.heightAt(wx, wz)          // WORLD metres, same triangle split as terrain-read.js; never NaN (clamps)
h.waterAt(wx, wz)           // { surface, depth } | null      h.biomeAt(wx, wz) -> index into h.biomes
h.heightGrid(), h.waterGrid()   // Float32Array width*height for a mesh (gridIndices(width, …) needs a square — build rows yourself)
h.baked                     // Set of zone ids where the horizon is exact
horizonRef(manifest, 'z12_02')  // -> { file, hash, step, zone: { id, origin: {x, z} } }  — for the server's `joined`
```
`data/world/horizon.json` is the manifest (`file, bytes, hash, step, width, height, baked`); `hash` is over the
decoded layers, so a client can cache on it.

## 8. The M2 world gate: reachability + sameness (`tests/B/zone-reach.test.js`)

PLAN §15 M2: "variety + reachability + sameness tests green for every zone". Content variety (≥ 40 distinct vignettes
in any 5 neighbouring zones) is stream E's (`tests/E/province.test.js`); these are the bake's:

- **Reachability** (`tools/lib/province-reach.mjs`, also a CLI: `node tools/lib/province-reach.mjs torbor_downs`):
  the 16 zones' `nav.bin` stitched into one 4,097² walk grid (edges share samples), flooded 4-connected from
  Torborhold. Every settlement, the front of every dungeon door, every event/camp arena, ford, spawn and placed
  vignette must be reached (103 targets today, all reached); ≥ 95 % of all walkable ground is one piece (98.6 %), and
  ≥ 85 % of each zone's (lowest: sunken_wolds 88 % — its far bank of the big river has no bridge); every bridge deck walkable.
- **Sameness** (`tools/lib/zone-fingerprint.mjs`, CLI prints the table): a fingerprint per zone — biome shares,
  relief (p5–p95), median slope, steep and wet shares, rivers, scatter per km² by kind, settlements, buildings, roads,
  plus E's archetype / hook / dungeon family. Every pair of neighbours must differ in ≥ 3 noticeable ways and by a
  measured distance ≥ 1 (closest today: brackwater / saltmouth, d 1.26, differing in water, settlements, archetype,
  hook, dungeon); no two zones share a fingerprint; **no 128 m patch of ground shape repeats** anywhere in the
  province (hashed on height differences, flat patches skipped); no two settlements share a town plan.
- Not yet: PLAN §16's "longest boring walk ≤ 250 m" needs the vignette placements for all 16 zones (stream E has
  placed only the `test` zone so far); `zoneTargets()` already picks up `data/vignettes/placements/<zone>.json`.


## 9. Play-test 1 fixes (2026-10-05): rivers, bridges, wading/swimming, map, paths

Owner play-test 1 (`~/claude/agent/mmo/round-playtest1.md`), stream B items. All 16 Torbor Downs zones re-baked
(`ZONE_BAKE_VERSION` 3, `WORLD_BAKE_VERSION` 2), horizon and map re-baked.

**P21 — rivers meet their banks, no square edges.** Three causes, all fixed in `tools/bake-zone.mjs`:
1. *The bank was often LOWER than the water.* The channel was carved per segment with `min()`, which only lowers, so a
   river running above its floodplain (the surface is a running minimum along the centreline) had dry ground beside it
   below its own water line, and the sheet hung over it. Now one continuous cross-section of the distance to the NEAREST
   river line is applied once: channel `surface − (depth + 0.3)·(1 − (d/half)²)` (exactly the surface at the edge), a
   bank rising to `surface + 0.4` over 3 m (raised where the land was low, cut where it was high), then easing back to the
   land by the old reach. The river owns its bed (a town levelled below a stream no longer leaves a 1.7 m hole).
2. *The sheet stopped in 2 m steps short of the bank.* The one-sample wet ring was 4-connected, so corner triangles were
   missing. Now an 8-connected skirt ring carries the surface, and the ground under every skirt sample is raised to at
   least `surface + 0.15` (`SKIRT_BURY`): the sheet's edge is always under the ground, the visible shoreline is the bank
   meeting the flat water (the smooth curve d = half), and the skirt never makes new visible water. `waterAt()` still
   reads the same layer, so drawn = measured. **D needs no change** — the existing "draw triangles whose 3 corners are
   wet" mesh now ends inside the bank everywhere. (Optional for D: a shoreline foam could follow `depth → 0`.)
3. *World lakes were their macro cells* — a one-cell lake was a 128 m square pit with vertical sides. Now a lake is the
   0.5 contour of a bicubic lake-ness field over its cells with a noise wobble, carved as a bowl.

The zone apron grew from 1 to 6 samples (`AP`) so neighbour work stays bit-exact across edges.
Tests: `tests/B/water-edge.test.js` — every sheet-edge vertex in all 16 zones is buried; across every river the
waterline is within 1.6 m of the channel edge.

**P2 / P25 — wading and swimming.** `RIVER_DEPTH` (world-core) is now `[0, 0.5, 1.3, 2.6]`: a stream (class 1) is
0.8 m at its centre — under `WADE_DEPTH` (1.1) — so the invisible wall down the middle of every small stream is gone
(it was 1.5 m, past the wade limit, and `walkable()` refused it). Rivers (class 2, 1.6 m) and big rivers (2.9 m) are
swum in the middle. The reader has the depth/swim layer: `moveAt(x, z)` → `'walk' | 'wade' | 'swim' | 'steep' | 'out'`
(wade = deeper than `DRY_FOOT_DEPTH` 0.25 m), `passable()` = anything but steep/out; `groundAdapter` carries `moveAt`,
`passable`, `surfaceAt`. nav.bin keeps SHALLOW (≤ 1.1 m) / DEEP bits. Stream A owns the swimming state and speed.

**P24 — bridges.** The old world bake found bridges by segment intersection, missed slanted and tangential crossings and
spurs, and set the deck at `max(road graded height, surface + 1.6)` — while the river carve had cut the road down into the
valley, so decks floated up to 12 m over the road. Now:
- `crossingsOf(roadPts, rivers)` (world-core) walks a road at 1 m against every river's half-width: a crossing is a run
  within half-width + 2.5 m (dry bank under the abutments) that touches water. Every world road, every zone spur, every
  link trail and every town street crossing a river gets one (`bridgeFor`); a street that runs INTO the water and stops gets
  none (class-1 water is wadeable).
- A deck is flat at `surface + clearance` (1.0 / 1.5 / 2.2 m by class, raised ≤ 2 m toward a high road), straight from
  abutment `a` to abutment `b`; a road that bends through a long crossing gets a chain of straight `pieces` (each bending
  ≤ 1.2 m), placements `data.part [i, n]` + `data.bridge`. Bridges whose approaches overlap share one deck height.
- The zone bake grades the road to EXACTLY the deck height at both abutments (an abutment block runs 2.5 m in under the
  deck, 5 cm below it) and eases back to the road over `ramp` metres (14–40). World-pure, so edges still agree.
- `terrain.bin` meta carries the decks (`meta.bridges [{a, b, h, w}]`) and the reader stands walkers on them:
  `heightAt` = max(ground, deck), flat normal, `walkable`/`moveAt` 'walk'. So the server, client prediction, pets and
  monsters cross a bridge without knowing bridges exist, even over swim-deep water. nav.bin stamps the exact deck.
- Placement `bridge`: `x, z` (middle), `yaw` (a→b), `data { span, deck, width, a:[x,z,h], b:[x,z,h], road, river, cls,
  surface, ramp, part?, bridge?, street? }`. **D**: draw the deck from `a` to `b` (length `span`, width `data.width`), top at
  `deck` — the current town-view adds 6 m and puts the top 15 cm under `deck`; piers should use `T.groundAt`.
Tests: `tests/B/bridges.test.js` — world: every road crossing has a bridge; all 16 zones: no road point is deeper than
a puddle off a deck, every road/street point walkable (never swum), and for every bridge the road height equals the deck
at both ends (±0.15 m), the deck surface is the deck, the approach is ≤ 1 in 3, the deck clears the water by 0.9–6.5 m,
the whole span is walkable deck; streams wadeable all the way across.

**P3 — map data** (`tools/bake-map.mjs` → `data/world/map/`, ~2 MB; `tests/B/map.test.js`):
- `world.png` 1153 × 897, 1 px = 32 m: the whole world in shaded relief + biome colours, water, rivers and roads as lines.
- `zones/<id>.png` 512 × 512, 1 px = 4 m, per baked zone: relief, water by depth, roads/streets/paths, bridges, plots.
  Four across = Torbor Downs at 4 m (2048 px); halve for 8 m.
- `map.json` (world metres): `world`, `zoneImage`, `grid`, `zones[]` (origin, image, province, E's `sheetZone`, `name`,
  level `band`, archetype, town, dungeon name), `provinces[]` (name, band, zones, bounds), `labels[]` (`kind` province |
  zone | town | village | hamlet | dungeon | event | camp | ford | bridge | lake | river, `minZoom` 0 world / 1 province /
  2 zone, `band` on zone labels, `id` on dungeon/event/camp), `roads[]`, `rivers[]` (simplified to ~2 m).
- No text in the images: the client draws labels crisp at any zoom. Re-run after any zone bake (`--check` for CI).

**P19 — fuller country and paths.**
- Scatter: open country carries about twice the cover (grassland/savanna/shrubland/hills/tundra/badlands/desert/beach
  tables; forests unchanged): copses (still grove-clumped), bushes, stones, the odd big rock. ~13k → ~17k items a zone.
- Footpaths (`tools/lib/zone-paths.mjs`): every dungeon door, event arena, camp arena and every stream E fort / farm /
  cave / waystone gets a trail to the nearest road, street, town or earlier trail — Dijkstra over a 4 m grid (slope cost,
  wading ×4, swim water / >42° / E's discs / plots / the 16 m by an edge are walls), Chaikin-smoothed, painted as road
  surface 2.2 m wide, ground NOT reshaped (E's placements stay valid). Placement kind `path` `{from, to, width,
  pts [[x, z, h]]}` — routes for walkers (A) and something to follow on the map (D).
- Link trails (world bake, `linkTrails`): every stream E settlement (`*-places.json` asks) the World Forge net does not
  reach gets a graded trail road to the nearest road, across zone edges (`link_<name>`, class trail, `link: true`) —
  Brackwater, Eelwick, Gull Steps, Last Lantern, Gorsehold, Burnt Barns, Lowmoor, Deepdene. The world bake now reads
  `data/provinces/<sheet>-places.json`, so a change to E's asks makes `world.json` stale (re-run bake-world, then the zones).


## 10. Play-test 2 (2026-10-05): bespoke areas (Q18) and town offices (Q10)

`ZONE_BAKE_VERSION` 4. All 16 Torbor Downs zones, horizon and map re-baked. Tests: `tests/B/setpieces.test.js` (8).

**Set pieces** — `tools/lib/zone-setpieces.mjs`, authored in `data/world/set-pieces.json` (B) and overridable per zone by
stream E's `setPieces` / `lanes` in `data/provinces/<sheet>-places.json` (same id: E's wins — E renames six of B's z12_02
pieces to the places its quests use). Bake order: **lanes** (step 4a, graded like spurs; a lane that `joins` a town becomes
one of its high streets; heights pulled to exactly the road they meet, so a crossroads is one level) → towns planned →
**pieces fitted** (step 5b: a deterministic search round each `near` hint, keeping ≥ 130 m off zone edges, off water, rivers,
roads, towns, site pins and each other; then the ground is prepared — fields smoothed to their best plane, graveyards and
the inn yard levelled flat, levelling fading out within 6 m of any road so a road keeps its grade) → **stream E's own set
pieces** levelled (`ground.flat`) or eased, `ground.surface` painted (dirt → yard, farmland → field, gravel, graveyard;
grass unpainted), the recipe's `fields` painted (its `buildings` are E's, not stamped in nav; a disc on one of B's pieces is skipped) →
rivers → bridges → **mill ponds** dug (small lakes, level just under the rim, banks raised so they hold; before the wet
skirt so their edge is buried like every lake) → paint → scatter → nav.

| kind | what is baked |
|---|---|
| `farm` | flat farmyard (`yard`) + house + barn (`set_building` house / granary), up to `fields` strips on a 3×3 grid round it (corner cells sometimes split); each `field` / `crop` / `pasture`, hedge (or fence round a pasture) with a gate toward the yard; a footpath from the yard to the road net |
| `graveyard` | levelled flat, `graveyard` surface, drystone `wall` with a lych-gate gap facing the nearest road (or town), a gravel path from it, grave rows (`data.graves` [[x, z, yaw, style]], style headstone / cross / slab / mound / tomb), yews in two corners, a chapel (`set_building` chapel) at the far end of a town's yard |
| `orchard` | a gentle plane, `orchard` surface, fruit trees in rows (scatter `tree_fruit`), a hedge with a gate, a shed |
| `mill_pond` | an oval pond (`lake` water), a mill on the low bank (`set_building` mill), the wheel at the water (`data.wheel`), reeds |
| `clearing` | a gap in the trees, eased ground, a trampled `yard` middle, slot `camp` |
| `inn` | at the crossing of two named roads (`at`): a flat yard in the flattest corner, inn facing road A, a stable, a well, a `signpost` at the crossing (arms `{to, yaw}` from the lanes' `to`) |
| `stone_circle` | a ring of boulders (`data.stones` [[x, z, angle, standing/fallen]]) round a flat rock, slot `ritual` |
| `sheepfold` | a round drystone `wall` with a gap, `pasture` inside, slots `shepherd`, `flock` |
| `copse` | a dense round wood (broadleaf or conifer) with a bushy rim, in open country |
| `belt` *(auto)* | 5–10 field strips round every planned settlement, outside its ring |
| `graveyard` *(auto)* | one per planned settlement with no authored one, near it, by a road |

z12_02 (the start): Barrow Lane (N–S out of Torborhold) and Wether Lane (E–W, to the Wamonhold road), The Wheel and Wether at
their crossing, Torborhold Graveyard, Saint Hulda's Yard, Brannock Fields / Bracken End / Stonegate / Fallowmead farms,
Torbor and Wether Pear orchards, Turnwater Mill, Ashby's Lumber Camp and Greyfletch Camp clearings, The Nine Maidens, two folds,
two copses, belts round all three settlements (~70 fields). The four edge neighbours carry 7–10 authored pieces each, the four
diagonals 4–5 (Ashcombe's Home Farm Lane in z12_01).

**Placements** (all in zone metres, `data.setPiece` = the piece id): `set_piece` {piece, name, town, r, poly/w/d/angle (rect
pieces), gate {x, z, width, yaw into the piece}, slots [{kind, x, z, r, yaw}], plus graves / stones / pond / wheel / crossing /
fruit / fields count}, `field` {crop, grows (wheat, barley, oats, turnips, cabbages, flax | sheep, cattle | tilled), poly,
furrowAngle, boundary, gate}, `hedge` / `fence` / `wall` {pts [[x, z, h]], h, material} (open polylines, the gap is the
gate), `set_building` {want, w, d, angle, front, culture, label, lit, ground}, `signpost` {arms}. Roads gain `lane: true,
name, to` on lanes. **Surfaces** appended before `road` (road stays the LAST biome entry): field, crop, pasture, yard,
graveyard, orchard, gravel. **Scatter kinds** appended: 9 `tree_fruit` (solid), 10 `hedge` (not solid). **nav.bin**:
set buildings BUILDING, stone walls SOLID (one sample wide, gate posts left open); hedges and fences are walk-through.

**Town offices (Q10)** — `data/world/town-offices.json`: per settlement kind an office list handed to proctown's new opt-in
`trades` option (`planTown({trades: {list, share, pick: 'square'}})`; without it proctown is byte-identical, so Farhold is
untouched). Each office is one plot nearest the square, never shared. `building` placements carry `data.office` (want),
`data.role` (smith, merchant, elder, innkeeper, healer, unbinder, broker, stablehand, barber, armourer, apothecary, bowyer,
tailor, provisioner, trader, jeweller, miller, farmer), `data.lit` (a shop or service that should look open and lit) and
`data.label` (sign text). A town gets 16 offices (Torborhold: hall, forge, inn, shop, temple, stable, barber, counting house,
study, armoury, apothecary, bowyer, tailor, provisioner, market, jeweller); a hamlet inn, shop, mill, granary (+ shrine).
Stream E's `offices.json` and A's schedules.js take the plot whose `data.role` is the NPC's role.

Bake time is ~4–10 s a zone (was ~3 s); the whole province ~2 min. Zone files 16 MB total.

## 11. Play-test 4 (2026-10-06): town walls and gates (S7)

`tools/lib/zone-walls.mjs`, styles in `data/world/town-walls.json`, run by `tools/bake-zone.mjs` after the footpaths (so every way
into a town is known) and before nav. All 16 zones, horizon and map re-baked; `inputHash` unchanged.

| settlement | heartland | frontier / blight / ruinfield |
|---|---|---|
| city, capital | stone curtain (`curtain_city`), towers every ~38 m, gatehouses | same |
| town | stone curtain, towers every ~46 m, gatehouses | stockade (palisade + watchtowers) |
| village | palisade, gatehouses with flanking towers | barricade |
| hamlet | rail fence (elf: hedge), gate posts + field gates | barricade |

Stone becomes cutstone / mudbrick / bone / palisade for dwarf / desert / undead / orc cultures.

**The ring** stands outside every building by the style's margin (a proctown-walled city keeps proctown's wall radius); a street
that ends inside the town pushes the ring clear of its end instead of holing it. **Gates**: every exact crossing of a road, lane,
street or path with the ring; crossings within 26 m of each other share one gate (the widest road owns it; others side by side
widen its passage, others further off are LED round to it with painted approaches outside and inside); gates whose openings
collide merge; a ring no road reaches gets one gate facing the nearest way. `yaw` = atan2(dx, dz) of the way OUT along the main
road (never the wall's normal — Farhold's rotation bug), `pass` = clear passage, `kind` gatehouse | posts | gap (passage > 12 m).
The opening grows along the ring while a bundled way runs on beside the wall. **Openings**: water where a river runs through the
ring (a grate if ≤ 16 m), keep where one of stream E's discs stands on the line. Roads are painted only outside a town circle, so
each gate's `approaches` are painted from the rim to the gate and on to the high street.

**placements `town_wall`** (zone metres): `data.{town, name, settlement, style, material, tier, h, thick, tint, radius, solid,
runs [[[x,z,h]…]…] (ordered by increasing angle, so local +X of a piece is OUTSIDE), towers [{x,z,h,yaw}], gates [{id,x,z,h,yaw,
out,width,pass,slant,kind,way,wayKind,ways,led,ends,approaches[{way,width,led,inside,pts}]}], openings [{kind,a0,a1,metres,ends,
grate,h}]}`. **nav.bin**: runs (≥ 1.5 m half-width, so no diagonal step slips through), towers (r 2.6), gate jambs (run end to
passage edge) and grates SOLID. Players are not yet stopped by nav (A's movement.js — asked in requests.md).

**Tests** `tests/B/walls.test.js` via `tools/lib/wall-checks.mjs` on the checked-in files: every settlement walled with ≥ 1 gate;
no road placement / street or path centreline / painted road sample under a run or tower; every gate faces away from the town and
within 20° of its road; no wall across a plot or E disc; nav passable along the road through every gate and SOLID mid-run; every
gate's outside reaches the town square by flood fill. Drawn by `js/client/walls-view.js` with proctown's kit (barricade, gate
leaves, posts and grates are opt-in additions there).
