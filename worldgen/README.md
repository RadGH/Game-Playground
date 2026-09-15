# World Forge (`worldgen/`)

A procedural world map generator with three zoom levels — **world → region → local tile** — and a lot
of knobs. Built for games: the library is pure data (no DOM), everything is seeded, and the viewer is
just one consumer of it.

Open `/worldgen/` on the dev server (`./serve.sh --bg`, then `http://<LAN-IP>:8400/worldgen/`).

Inspiration: the world generators in colony/fortress sims. Nothing is borrowed from them — every
name, biome and mechanic here is invented (see rule 9 in `../CLAUDE.md`).

---

## What you get

One call returns a whole world:

```js
import { generateWorld } from '/worldgen/js/world.js';
const world = generateWorld({ seed: 7, method: 'plates', width: 256, height: 128 });
```

```
world = {
  seed, width, height, method, opts, stats, era,

  // grid layers — typed arrays, one value per cell, index = y * width + x
  elevation    Float32  0..1, 0.5 is exactly sea level (below = under water)
  temperature  Float32  0..1  (cellInfo turns it into °C)
  moisture     Float32  0..1
  flow         Float32  how much water passes through the cell (drainage accumulation)
  slope        Float32  0..1
  aura         Float32  -1 blessed … +1 cursed
  magic        Float32  0..1 raw magic
  water        Uint8    0 land, 1 ocean, 2 lake / inland sea
  river        Uint8    0 none, 1 stream, 2 river, 3 great river
  biome        Uint8    index into BIOMES (biomes.js)
  volcanic     Uint8    1 where the ground is volcanic
  region       Int16    region id, -1 for water
  roadCells    Uint8    0 none, 1 trail, 2 road, 3 highway
  passCells    Uint8    1 on a mountain pass
  continentOf  Int16    which landmass a cell belongs to
  habitability Float32  the settlement score (see nodes.js)
  filled, down          the drainage working layers (dropped when the world crosses a worker)

  // lists
  regions   [ { id, name, adjective, people, race, cells, center, label, bbox, biome, biomeName,
                mix[], temperature, moisture, elevation, aura, magic, coastal, riverCells,
                neighbours[], descriptor, danger, nodes[], seat, population, history[] } ]
  nodes     [ { id, type, kind, name, x, y, index, region, race, size, tags[], … } ]
  roads     [ { id, class, from, to, cells[], length, bridges[] } ]
  seaLanes  [ { id, from, to, cells[] } ]
  rivers    [ { id, name, cells[], length, width, source, mouth:{x,y,type}, navigable } ]
  lakes, seas, ranges, forests, continents, history, plates
}
```

`type` is one of `settlement` · `port` · `landmark` · `dungeon` · `pass` · `crossing`, and `kind`
narrows it (`capital/city/town/village/hamlet`, `ruin/shrine/cave/tower/monolith/volcano/waterfall/
ancientwood/battlefield`, `dungeon/lair`, `bridge/ford`).

---

## The files

| File | What it does |
|---|---|
| `js/noise.js` | Our own simplex 2D/3D, fBm, ridged, billow, domain warp, seeded rng, normalise/quantile/blur helpers. No libraries. |
| `js/biomes.js` | The biome table (26 entries: the aura ones, plus Sea Ice for frozen water) and `classify()` — temperature × moisture × elevation → biome id. Also the debug colour ramps, the `BIOME_FAMILIES` table with `familiesOf`/`inFamily`/`lockBiome` (the `biomeLock` knob), and `PALETTES`/`palettedColors` for whole-map colour swaps. |
| `js/names.js` | `Namer`: wraps Name Forge (`/namegen/`) when a game has it, falls back to a built-in syllable namer so `worldgen/` also works alone. Names regions, settlements, ranges, rivers, lakes, seas, forests, landmarks and people. |
| `js/world.js` | `generateWorld(opts)` — the whole macro pipeline. Also `DEFAULTS`, `METHODS`, `PRESETS`, `cellInfo`, `nearestNode`, `elevationToMetres`, `DEFAULT_RELIEF`. |
| `js/regions.js` | Cuts the land into named provinces, then names the big natural features. |
| `js/nodes.js` | Places settlements, ports, landmarks, dungeons/lairs and mountain passes. |
| `js/roads.js` | `aStar`, road cost fields, MST + extra links, bridges and fords, sea lanes, `roadGraph()`. |
| `js/local.js` | `generateRegionDetail(world, regionId)` and `generateLocalDetail(world, x, y)` — the two zoom-ins. |
| `js/render.js` | `worldPixels()` (pure RGBA, works in node), `renderWorld/renderRegion/renderLocal` on a canvas, `cellAt()`, `legend()`, `nodeStyle()`. |
| `js/relief.js` | Heights in metres: `DEFAULT_RELIEF`, `elevationToMetres(e, relief)`, `formatMetres()`, `hasSea(world)`. No DOM and no generator, so the renderer and `cellInfo()` share it. |
| `js/layers-panel.js` | `layersPanel({ layer, layers, onLayer, onToggle, unavailable })` — the Layers panel (a chip per map layer, a checkbox per overlay) as DOM only, plus `LAYER_NAMES` / `LAYER_TOGGLES`. World Forge and Star Forge both use it; `unavailable(key, kind)` greys out a layer with a reason. |
| `js/export.js` | `toJSON` / `fromJSON` (typed arrays as base64), `toPNG`, `download`, `jsonSizeKB`. |
| `js/history.js` | A few dated events per region from a small template table, plus `worldSummary()`. |
| `js/worker.js` | Runs generation off the UI thread; the page falls back to inline generation if module workers are unavailable. |
| `js/app.js` | The viewer: knobs, presets, three zoom levels, layer toggles, lists, export. Exposes `window.worldgenDemo`. |

---

## How a world is built (the pipeline)

1. **Base shape** — one of seven methods (below) produces a raw height field.
2. **Edge mask** — a noisy falloff so the map is framed by ocean rather than clipped land.
3. **Mountains** — ridged noise laid over the high ground (`mountainScale`, `mountainSharpness`).
4. **Erosion** — thermal slumping (anything steeper than the talus angle slides downhill), then
   droplet-based hydraulic erosion, which is what carves branching valleys instead of smooth domes.
5. **Sea level** — expressed as *the share of the world that should be ocean*. The generator finds
   the height at that percentile and rescales so 0.5 is exactly the shore. That means the knob
   behaves the same for every method, which is also why the land fraction is predictable.
6. **Coast roughness + mountain sharpness** — high-frequency wobble applied only near the shoreline,
   then a power curve on the land so peaks can be rounded or spiky.
7. **Ocean vs inland water** — flood fill from the map edge; anything below sea level that the fill
   never reached is an inland sea or lake.
8. **Climate** — temperature from latitude bands, the world temperature knob and a lapse rate for
   height; moisture from a prevailing-wind sweep (air picks up water over sea, rains it out climbing
   land → rain shadow behind mountains) blended with a latitude rainfall profile so continental
   interiors are not one flat desert.
9. **Drainage** — depression filling (priority flood) so every cell drains somewhere, D8 flow
   directions, flow accumulation weighted by rainfall, then rivers above a threshold and lakes
   wherever the filled surface sits above the real ground. River courses are traced into polylines
   that end at the sea, a lake, or a confluence with a bigger river.
10. **Aura and magic** — two low-frequency fields; they push biomes into blighted forest, ash plain,
    veiled hills, hallowed glade and glimmer waste, and they mark volcanic ground.
11. **Biomes** — `classify()` per cell with the `biomeVariety` knob.
12. **Regions** — cheapest-path growth from scattered seeds where crossing mountains, wide rivers and
    biome changes is expensive, then small regions merge into the neighbour they border most.
13. **Names** — regions, seas, ranges, lakes, forests, major rivers, continents (Name Forge).
14. **Places** — habitability scoring, then settlements by tier with minimum spacing, ports,
    landmarks, dungeons, passes.
15. **Roads** — a minimum spanning tree per landmass routed with A* over a travel-cost field, extra
    links for loops, bridges and fords where a route crosses a river, sea lanes between landmasses.
16. **History** — a few dated events per region.

### Continent methods

| `method` | How it works | Looks like |
|---|---|---|
| `noise` | Domain-warped fBm plus a low-frequency blob field. | Irregular continents with ragged coasts. |
| `plates` | N tectonic plates (Voronoi with jittered boundaries), each continental or oceanic with a drift vector. Convergent boundaries raise mountains or trenches, divergent ones open rifts. | Real-looking mountain chains along one edge of a continent. **Default.** |
| `voronoi` | Voronoi cells flagged land or sea, lifted by distance from the cell border, with warped lookup coordinates. | Chunky landmasses with straightish inland boundaries. |
| `diamond` | Classic diamond-square midpoint displacement resampled onto the grid. | Fractal, fairly uniform, few big landmasses. |
| `archipelago` | Many rotated elliptical island bumps with noise-wobbled radii. | Scatter of islands, some large. |
| `pangea` | One lobed supercontinent (angular noise on the radius) plus a few offshore islands. | A single great land. |
| `mixed` | Blends `plates`, `noise` and `archipelago` with a noise field. | Continents on one side, island chains on the other. |

---

## Knobs

All of them live in `DEFAULTS` (`js/world.js`) and every one is on the viewer's left panel.

| Knob | Range | Default | What it does |
|---|---|---|---|
| `seed` | any integer | 1 | Same seed + same knobs = same world, always. |
| `width` / `height` | 64…512 / 32…256 | 256 × 128 | Grid size. 512×256 is roughly 4× the work. |
| `method` | see table | `plates` | Which continent generator to use. |
| `landmasses` | 1…14 | 5 | Plate / blob / island seed count. |
| `continentScale` | 0.4…2.5 | 1.0 | Low = few huge shapes, high = many small ones. |
| `seaLevel` | 0.15…0.9 | 0.58 | Share of the world that ends up as ocean. |
| `coastRoughness` | 0…1 | 0.55 | Wobble applied to the shoreline only. |
| `mountainScale` | 0…1.2 | 0.55 | How much ridged relief is laid over the base shape. |
| `mountainSharpness` | 0…1 | 0.5 | Rounded highlands ↔ isolated spiky peaks. |
| `thermalErosion` | 0…12 | 3 | Passes of slope slumping. Smooths cliffs. |
| `hydraulicErosion` | 0…1 | 0.35 | Rain droplets per cell — carves valleys. The most expensive knob. |
| `riverDensity` | 0…1 | 0.5 | Lower flow threshold = more, smaller rivers. **0 = no rivers at all** (it used to leave the biggest drainage lines as rivers). |
| `lakeAmount` | 0…1 | 0.5 | How shallow a depression can be and still hold water. |
| `temperature` | 0…1 | 0.5 | World-wide warm/cold shift. |
| `latitudeBands` | 0…1 | 0.85 | Strength of the equator→pole gradient (0 = one climate everywhere). |
| `lapseRate` | 0…1 | 0.5 | How much height cools a cell. |
| `windDirection` | west/east/north/south/bands | `west` | Which way the rain-bearing wind blows. `bands` gives trades near the equator and westerlies in the middle latitudes. |
| `rainfall` | 0…1 | 0.5 | Overall wetness. |
| `rainShadow` | 0…1 | 0.6 | How hard mountains wring the air out. |
| `biomeVariety` | 0…1 | 0.6 | 0 = a handful of coarse biomes, 1 = every band shows up. |
| `biomeLock` | family key or null | null | Forces every land cell into one `BIOME_FAMILIES` family (`ice`, `lava`, `desert`, `rock`, `jungle`, `tundra`, `ocean`, `toxic`, `crystal`, `void`, `grass`), picked by height and slope. This is how `universe/` makes a single-biome planet. |
| `polarCaps` | 0…1 | 0 | How far ice reaches down from the top and bottom rows. Land becomes Ice Sheet, water becomes Sea Ice (biome 25). |
| `atmosphereTint` | hex or `{color, strength}` | null | A colour wash laid over the drawn map — a yellow sky yellows its own map. Read by `worldPixels`. |
| `palette` | `PALETTES` key or null | null | Swaps the biome colours without touching the biome table: `lava`, `crystal`, `toxic`, `void`, `ember`, `rust`, `dust` (grey-brown dead rock). |
| `liquid` | `water` · `lava` · `none` | `water` | `none` makes a dry world: no ocean, no lakes, no rivers at any zoom — low ground is dry basin. `lava` generates like water (the palette and a name theme make it molten). |
| `frame` | `ocean` · `land` · `rim` | `ocean` | What the map edge fades into: under the sea (the classic island framing), the map's own average ground, or a raised crater rim. |
| `inhabited` | bool | true | `false` skips settlements, ports, roads, bridges/fords, sea lanes, history and the drawn region borders. Landmarks keep only natural kinds and old remains (ruin, cave, monolith, volcano, plus **crater** and **vent**), dungeons stay, lairs do not. |
| `nameTheme` | `NAME_THEMES` key or null | null | A vocabulary for the world's names — see *Dry, empty and themed worlds* below. |
| `auraStrength` | 0…1 | 0.35 | Size of the good/evil influence field. |
| `auraBalance` | 0…1 | 0.55 | 0 = all blessed, 1 = all cursed. |
| `magicStrength` | 0…1 | 0.3 | Raw magic — glimmer waste, towers, volcanoes. |
| `regionCount` | 4…90 | 22 | How many provinces to aim for. |
| `minRegionCells` | 2…120 | 16 | Anything smaller is merged into a neighbour. |
| `settlementDensity` | 0…1 | 0.5 | Towns per unit of land. |
| `landmarkDensity` | 0…1 | 0.5 | Ruins, shrines, caves, towers, volcanoes… |
| `dungeonDensity` | 0…1 | 0.5 | Dungeons and lairs in harsh country. |
| `roadExtras` | 0…1 | 0.3 | Extra links beyond the spanning tree (loops). |
| `seaLanes` | bool | true | Shipping routes between landmasses. |
| `history` | bool | true | Generate the notable-events table. |
| `namegen` | NameGen or null | null | Pass a Name Forge instance for proper per-race names. |
| `raceTable` | object | null | Override which race names which biome (`DEFAULT_RACE_TABLE` in `names.js`). |
| `onProgress` | `(0..1, label)` | null | Progress callback. |

**Presets** (`PRESETS` in `world.js`): *Temperate continents*, *Shattered isles*, *Frozen north*,
*Ashen world*, *One great land*. A preset is a partial knob set — it overrides only what it names.

---

## Dry, empty and themed worlds

Four knobs, all off by default, so a World Forge world is unchanged (a node test pins four presets to
fingerprints taken before they existed). `universe/` uses them to make a dead moon look dead.

- **`liquid: 'none'`** — the sea-flood pass, the lake pass and river tracing are skipped, so
  `world.water` and `world.river` are all zero and `seas`, `lakes` and `rivers` are empty. Elevation
  below 0.5 is kept as low basin ground. The region view and the local tile read it and stay dry too
  (no streams, a bare rock-and-boulder prop set on the tile).
- **`frame: 'land' | 'rim'`** — the edge mask eases towards the map's average ground, or lifts into
  a ring of high ground, instead of dropping below sea level. A dry world should use one of these,
  or its edge becomes a ring of low basin.
- **`inhabited: false`** — `placeNodes` places no settlements or ports, `buildRoads` returns before
  building roads, bridges or sea lanes, history is not written, `renderWorld` draws no borders, and
  the region view grows no camps, shrines or paths. Regions stay: they are named ground and the way
  into the region zoom.
- **`nameTheme`** — `NAME_THEMES` in `names.js`: `dead`, `ice`, `lava`, `crystal`, `void`, `desert`,
  `toxic`, `twilight`. A theme has its own landform words, the Name Forge concept tags its plain
  words are picked by (`pickConcept`), and the word lists it forbids: `WATER_WORDS` (fen, mere, lake,
  river, isle, shore…), `LIFE_WORDS` (wood, grove, meadow, fox…), `WETLAND_WORDS` and `WILD_WORDS`
  (kingdom, holdfast, gate, town…). Themed region names are built only from that vocabulary, and every
  feature, landmark and pass name is re-rolled until `forbiddenWordIn(name, theme)` is null — a
  forbidden word counts on its own or at either end of a compound (*Silvermere*, *Mistwood*). The
  lava theme allows sea, lake and river words, because its seas are molten (*the Tralnit Lava Ocean*).

### Heights and the elevation legend

`legend(world, 'elevation')` (also `elevationLegend(world)`) returns real height bands on the world's
relief scale — `world.relief` if it carries one, else ±4200 m: two depth bands below sea level
(*0–2,100 m deep*) and four land bands (*0–1,050 m* … *3,150–4,200 m*), each with the actual share
of cells in it and empty bands dropped. A world with no sea (`liquid: 'none'`, or a relief whose
datum is not the sea) gets no depth bands — its basins read as *−2,100 to 0 m* — and its elevation
layer is drawn with `RAMPS.elevationDry`, so low ground is dark rock rather than ocean blue.

## Zooming in

```js
import { generateRegionDetail, generateLocalDetail } from '/worldgen/js/local.js';

const detail = generateRegionDetail(world, regionId, { factor: 6 });   // 6× finer than the world grid
const tile   = generateLocalDetail(world, node.x, node.y, { size: 64, node });
```

Both sample the world layers smoothly and add higher-octave noise seeded from the world seed plus the
cell position, so **what you see up close always agrees with the world map** and is the same every
time you open it.

- **Region detail** returns the same shape as a world (so `renderRegion`, `worldPixels` and
  `cellInfo` all work on it) plus `streams`, `paths`, `nodes` (the world's places mapped onto the
  fine grid, plus a few camps/shrines/caves that only exist at this zoom), `parentCell` (fine cell →
  world cell) and `factor`. It runs the full drainage model again at the finer scale, so streams
  branch properly and join the world's rivers.
- **Local detail** returns a 64×64 tile (≈10 m per cell, so ~640 m across) with `features` — trees,
  pines, dead trees, rocks, boulders, bushes, reeds, ponds, ruin blocks, campfires, crystals, bones —
  chosen by biome and aura, a `clearing` a game can drop a camp or an encounter into, and a footprint
  for whatever node is standing on the cell.

---

## Using it in a game

```js
import { generateWorld } from '/worldgen/js/world.js';
import { generateLocalDetail } from '/worldgen/js/local.js';
import { renderWorld } from '/worldgen/js/render.js';
import { toJSON, fromJSON } from '/worldgen/js/export.js';
import { NameGen } from '/namegen/js/namegen.js';

const namegen = await NameGen.load('/namegen/data/');
const world = generateWorld({ seed: 20260912, namegen, width: 256, height: 128 });

// draw it
renderWorld(canvas.getContext('2d'), world, { layers: { biomes: true, rivers: true, roads: true, nodes: true, labels: true } });

// pick a starting region: coastal, mild, not cursed, with a town
const start = world.regions
  .filter(r => r.coastal && r.danger < 0.4 && r.seat != null)
  .sort((a, b) => b.cells - a.cells)[0];
const home = world.nodes[start.seat];

// the map a fight happens on
const tile = generateLocalDetail(world, home.x, home.y, { node: home });

// save / load
localStorage.setItem('world', JSON.stringify(toJSON(world)));
const again = fromJSON(JSON.parse(localStorage.getItem('world')));
```

Useful bits for game code:

- `cellInfo(world, x, y)` — readable values for a cell (biome name, metres, °C, region, river class).
  Heights: `heightMetres` (signed, above/below the datum), `depthMetres` (water depth when there is a
  sea), `datum` and `datumLabel`; `elevationMetres` is the same number, kept for old callers.
  Elevation 0.5 is always the shoreline. By default the scale is ±4200 m (`DEFAULT_RELIEF`); a world
  may carry its own as `world.relief = { landMetres, seaMetres, datum: 'sea' | 'datum', label }`, and
  the region and local grids copy it, so zooming in keeps the same metres. `elevationToMetres(e,
  relief)` is the conversion on its own.
- `nearestNode(world, x, y, filter)` — closest place, optionally filtered by a predicate.
- `roadGraph(world)` — adjacency map over node ids (roads + sea lanes) for travel and pathfinding.
- `aStar(world, startIndex, goalIndex, costField)` with `roadCostField(world)` / `seaCostField(world)`
  — route a party anywhere, not just between towns.
- `BIOMES[id].move` is a travel-cost multiplier and `.habit` a habitability weight; `region.danger`
  is a 0..1 hint for encounter tables; `node.tags` is what a quest generator should match on.
- `world.history` / `region.history` are short dated lines — good raw material for Lingo memories.

### Cost

Rough numbers on this machine (node, one thread), default knobs:

| Size | Cells | Time |
|---|---|---|
| 128 × 64 | 8k | ~120 ms |
| 256 × 128 | 33k | ~500–750 ms |
| 512 × 256 | 131k | ~3–5 s |

`hydraulicErosion` and `archipelago` are the expensive parts; `regionCount` and the node densities
barely matter. `generateRegionDetail` at factor 6 is ~150–250 ms, a local tile is ~5 ms. A saved
256×128 world is roughly 600 KB of JSON (base64 layers) — about 2 MB with `arrays: 'plain'`.

Everything except `render.js`'s canvas functions and `export.js`'s `toPNG`/`download` runs fine in a
worker or in node.

---

## Viewer

`index.html` + `worldgen.css` + `js/app.js`. Left: seed, size, presets and every knob. Middle:
breadcrumb, map, hover readout, legend. Right: layer switches, world stats and export, a filterable
region list, a filterable place list, and the history.

- Click a region on the world map to open it; click anywhere in a region to open the local tile.
  The breadcrumb (or Escape) walks back out.
- Layers: biomes, elevation, temperature, moisture, drainage, aura, magic, regions (political), plus
  toggles for hillshade, rivers, roads, nodes, labels, borders and the aura wash. The panel is
  `js/layers-panel.js`, shared with Star Forge. The elevation legend reads in metres.
- **Export JSON** saves the world; **Export PNG** saves the map as it is currently drawn.
- **Copy link** puts the whole knob set in the URL hash, so a world can be shared as a link.
- `window.worldgenDemo` exposes `{ state, generate, openRegion, openLocal, back, setOpt, toJSON, ready }`
  for the tests and for poking at a world from the console.

## Tests

```
node --test worldgen/tests/worldgen.test.js     # 21 tests (also part of npm run test:unit)
npx playwright test worldgen/tests/worldgen.spec.js
```

The node tests cover determinism, the land fraction of every method, rivers running downhill into the
sea or a lake, region naming and cell accounting, node spacing and habitability, road connectivity
per landmass, biome sanity, the aura knob, the JSON round trip, region/local detail agreeing with the
world, and the renderer's pixel output. The Playwright spec generates in the page, checks the canvas
is not blank, zooms both levels, walks the breadcrumb back, switches every layer and preset, and
screenshots each level into `test-results/`.

## Known rough edges

- The world does not wrap horizontally — it is a framed island world, not a globe. A wrapping mode
  would need the noise sampled on a cylinder (`makeNoise3D` is already there for it).
- Region labels are placed by a clearance map and skipped when they would collide, so a crowded map
  quietly drops some labels rather than moving them.
- Rivers are drawn cell to cell, so at small scales they look slightly stepped.
- The local tile is schematic (scattered shapes), not art. It is meant to hand a game a layout.
