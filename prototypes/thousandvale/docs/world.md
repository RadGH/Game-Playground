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


## 6. M1: world bake + zone bake v1 (2026-10-04)

| File | What |
|---|---|
| `tools/bake-world.mjs` → `data/world/world.json` (301 KB) + `data/world/macro.bin` (441 KB) | World Forge 288 × 224 (seed 1000), an **18 × 14 grid of 2,048 m zones** (`z00_00` … `z17_13`; zone `(zx, zy)` covers world x ∈ [zx·2048, +2048]). Holds everything a zone needs that must not depend on which zone is baked: rivers as smoothed, meandering polylines in world metres **with their water surface per point**, lakes with one level each, settlements/landmarks/dungeons/passes/roads in world metres, a per-zone summary. ~1 s. |
| `tools/bake-zone.mjs <zXX_YY> \| --m1` → `data/zones/<id>/{terrain.bin, placements.json, zone.json}` | Same `terrain.bin` format and reader as M0. ~2 s a zone. `--check` fails if stale. |
| `tools/lib/world-core.mjs` | The shared pure core: macro file format, base ground at world coordinates, biome warp, the **world-fixed** height range (`heightRange`: −240 … 1,660 m, 2.9 cm steps). |
| `tools/lib/zone-sites.mjs` | Site placement: town radius, dungeon door, open discs for event/camp sites. |
| `tests/B/zone-bake.test.js` | World + zone bakes deterministic and checked in; **edges agree bit for bit** with the east and south neighbours (height, water surface, water kind, biome — a river crosses the east edge and rock lies on the south edge, so it is not a vacuous check); hub town sound; sites sound. |

**Edges agree by construction:** every value is a function of world coordinates and the world bake only.
Neighbour-dependent work (rock on steep ground, the wet ring) runs on a grid with a one-sample apron, and
zone-local work (moving and levelling the hub town) stays ≥ 200 m from every edge.

**The M1 zone `z03_02`** (Torborhold's): grassland/forest/marsh, 4 rivers. Sites: hub **Torborhold**
(village, r 65, `hub: true`) — moved 340 m in from where World Forge put it (its macro cell sat 64 m from the
zone's south edge; a hub circle may not cross a zone edge), on the flattest dry spot, then levelled (85 %
toward the disc's mean height, easing out over 40 m); Mackdackcrown (city, r 140, not planned yet),
Tatihold (village), Mawehaven (hamlet), two fords, an ancient wood. Door `door_1` (1294, 1858) yaw 2.77; event
`event_grandmother_skein` (1243, 1320) r 40 near Mawehaven; camp `elite_hobb_gallowsby` (1312, 633) r 25 at
Bilpintet Ford. The hub's spawn is in its square.

**Town placement** (`placements.json`, typed records `{kind, id, x, z, yaw, data}` in zone metres, yaw =
`atan2(dx, dz)` the way the thing faces):
`settlement` (data.radius, data.hub) · `town_square` (data.r) · `street` (data.pts [[x,z]…], cls main/side/alley,
width) · `building` (a proctown plot: centre, `data.w` along `data.angle`, `data.d` across, `data.want`
house/inn/forge/market/…; **yaw faces the nearest drawn street** — proctown's own `facing` points at the nearest
block edge, which after its connectivity pass is a street only about half the time, so the bake picks the side
whose front meets a street; `data.streetGap` ≤ 0 means the front is on it) · `town_wall` (size 4+ only) ·
`dungeon_door` · `event_site` · `camp_site` · World Forge `landmark`/`crossing`/`pass`. The plan comes from
`proctown/js/townplan.js` `planTown` (the one planner Farhold uses too), human culture, size by kind
(village = 2 → 17 plots, 49 streets, 0 overlaps), told the river is unbuildable.

Known gaps (later milestones): only the hub is planned (Mackdackcrown and the others are sites only);
no world roads drawn into the zone yet (`world.json` has them); no scatter/nav layers yet; and **seed 1000 has
only 101 zones that are more than half land** (PLAN wants ~200) — World Forge's default sea level is 0.58; the
M4 world needs a lower sea level, which moves every place, so it waits until the M4 world is chosen.
