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
t.walkable(x, z)     // in bounds && slope ≤ MAX_WALK_SLOPE (46°) && water depth ≤ WADE_DEPTH (1.1 m)
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
`t.clamp`. Speed checks over slopes can use `t.slopeAt`. Swimming = `t.waterAt(x,z).depth > WADE_DEPTH`.

## 4. File format (`terrain.bin`, version 1, little-endian)

```
'TVZN' | u32 version | u32 jsonBytes | JSON meta | pad to 4 |
u16[size²] height | u16[size²] waterTop (0 = dry) | u8[size²] waterKind (0 none 1 sea 2 lake 3 river) | u8[size²] biome
```
Heights are `heightMin + v / 65535 * (heightMax - heightMin)` (2.4 cm steps on the test zone). Meta:
`name, size, step, origin, heightMin, heightMax, bakeVersion, inputHash, biomes[[key,name,color]], waterKinds,
source{tool, world, macroWindow, worldOrigin, landMetres, seaMetres}, rivers, sites, spawn`.
A file with the wrong magic or version throws (PLAN §3.2.5).

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

**Size:** a baked zone is ~7.5 MB (terrain.bin 6.3 MB of it), so the 16 Torbor Downs zones are 122 MB in git and the whole
world would be ~1.5 GB. Options for the lead: keep only the starter province in git and bake the rest at publish/boot
(3–4 s a zone, deterministic), or store `terrain.bin` gzip'd (~3×). Not changed yet.

Known gaps: no scatter/nav for the M0 test zone (fixture only); buildings are footprints (the client builds
them with proctown's buildkit); roads have no lamps/signposts yet; only zones that are baked have files —
`node tools/bake-zone.mjs <id>` for any of the 252.
