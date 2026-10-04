# Thousandvale — world data and the terrain reader (stream B)

**Status:** M0, 2026-10-04. Owner: stream B (`tools/bake-*.mjs`, `data/world/**`, `data/zones/**`,
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
