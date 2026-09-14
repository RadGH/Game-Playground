# Frontier Foundry (`prototypes/frontier-foundry/`)

A 4X + RTS automation prototype: land on a planet, scan for what is under the ground, mine it, haul
it, refine it, build a factory, research your way up the tree, hold off waves of local wildlife, and
leave on a rocket carrying whatever you can fit in the hold. Then do it again on a world that breaks
one of your habits.

**It is playable.** Open `index.html` (see *Playing it* below) for the full interface: a title screen
that surveys a real star system for landing sites, a 2D surface map you build on, a research tree, the
planet's world map, a 3D orbit screen and a quest board. The engine underneath is headless and runs in
node on its own — the interface never does any game logic, it only draws and takes input.

> Original names throughout. The games this borrows ideas from are named only in `DESIGN.md`, never
> in anything a player would see (rule 9 in `../../CLAUDE.md`).

---

## What it tests

1. **Can one engine carry a whole 4X loop headlessly?** Map → scan → mine → haul → refine → build →
   research → defend → launch → next planet, all deterministic from a seed, all pure data.
2. **Does the "storage pool" idea work instead of belts?** Machines and stores that reach each other
   share everything for free; anything further away needs a truck. It keeps the interesting decision
   (where to put things) and drops the fiddly one (routing items tile by tile).
3. **Can a bot play it well enough to balance it?** `tools/sim-foundry.mjs` plays the real engine and
   prints what jammed and why. Nearly every balance bug below was found by reading that output.
4. **Do planet-specific structures make planets feel different?** Ten archetypes, eight rare
   elements, ten buildings that only exist where their element does.
5. **Can a headless engine carry a real interface without leaking into it?** The whole of `js/ui/`
   only ever calls the public API in `DESIGN.md` §8. Four things had to be added to the engine to make
   that possible (see *What the interface needed* below); nothing else moved.

## Playing it

```bash
./serve.sh --bg            # from the playground root
# then open http://<LAN-IP>:8400/prototypes/frontier-foundry/
```

**Quick start** drops you on the recommended temperate world of a surveyed system. Or roll a galaxy
seed, press *Survey system*, and read the candidate list: archetype, gravity, day length, rare
elements, hazards and a difficulty tier. The lander has fuel for exactly one of them.

The first ten minutes, in order:

1. **Look at the ground.** The pod's landing sweep has already found the patches within 30 tiles.
   Everything outside that ring is invisible until something scans it. Keep panning: the ground
   carries on for a long way past the first screen (see *The map streams* below).
2. **Put a rock drill on an iron patch.** Press <kbd>B</kbd> (or click the build bar), pick *Rock
   Drill I*, and the ghost tints green over any patch it can legally work. Click to drop an outline —
   the four builders walk over and put it up.
3. **Drop a storage crate near it.** Two stores whose link ranges overlap become one pool, and every
   machine inside that pool shares everything in it for free. This is the rule the whole base is
   shaped by: build in tight clusters, and use a truck only between clusters.
4. **Build a smelter and point it at Smelt Iron.** Select it and use the recipe box in the side panel.
5. **Build a scanner tower.** It is cheap and it sees underground; it is the highest-value early
   building in the game because it turns "where do I build" from a guess into a decision.
6. **Watch the threat gauge.** Crafting makes smoke and drills make noise, and both of them are the
   clock the local wildlife runs on. The first attack lands at the grace timer or the threat
   threshold, whichever comes first — twelve minutes on normal.

Three fields explain almost every machine that has stopped, and all three are on the side panel with a
coloured dot: **the grid is short**, **an input is missing**, **the output has nowhere to go**.

### Controls

| | |
|---|---|
| <kbd>B</kbd> | build bar · pick a building, click the map |
| <kbd>R</kbd> | turns the ghost while placing; otherwise starts the route tool |
| <kbd>Esc</kbd> | cancel the tool, then clear the selection, then open the menu |
| <kbd>Space</kbd> | pause / resume |
| <kbd>N</kbd> | jump to the next unread message |
| <kbd>Q</kbd> <kbd>M</kbd> <kbd>1</kbd>–<kbd>5</kbd> | research · planet map · the five screens |
| <kbd>G</kbd> | tile grid |
| <kbd>Del</kbd> | demolish what is selected |
| <kbd>WASD</kbd> / drag / wheel | pan and zoom |
| <kbd>Shift</kbd> + click | place again without re-picking |
| drag with a road or wall | lay a line of them |
| right-click | send the selected crew there, or put them on an outline |
| drag a box | select every builder inside it |
| pan to the edge of the ground | the next block of world generates on its own |

### The six screens

| Screen | What it is for |
|---|---|
| **Title** | galaxy seed → star system → a shortlist of landing sites with their archetype, resources, rare elements, hazards and difficulty. Quick start, continue from the browser save, settings. |
| **Surface** | the game. Tile map with fog of war, resource patches drawn only once scanned, buildings at their real footprint, trucks on their routes, tracers when a turret fires, a fog-aware minimap, and a side panel for whatever is selected. |
| **Research** | the tree as a graph in columns by tier, with costs, unlock previews and a queue that starts the next node on its own. |
| **Planet** | the world map you landed on, the landing cell marked, the regions you can send scouts to, the survey dispatcher and the field objectives. |
| **Orbit** | the planet in 3D with its satellites, the rocket's parts list, probe results, and the launch dialog that loads the hold and takes you to the next world. |
| **Quests** | the objective board and a codex of every material, building, hauler and hostile this run has actually turned up. |

Saving is automatic every in-game hour, into this browser's storage. The menu also exports and
imports a save as a `.json` file.

### The map streams

The playable grid is **a 5 × 5 block of worldgen cells at 96 tiles each — 480 × 480 tiles**, not the
single cell the engine defaults to. It is one flat set of typed arrays, so a tile index is a plain
`y * width + x` for the whole run and nothing in the engine had to learn about chunks. What is lazy
is the *filling in*:

- A chunk is one worldgen local tile. `createLocalMap({ size, chunks })` lays out the grid and
  generates the centre cell and its ring (**288 × 288 tiles, live at landfall**).
- A chunk that has not been generated is blank — not buildable, impassable, no patches — and sits
  under full fog, so nothing can walk into it or build on it by accident.
- `Surface._streamChunks()` asks the engine for the ring of chunks around the camera, **one a frame
  at most**, because generating a worldgen tile costs about twenty milliseconds and two in one frame
  is a visible stutter. Because the ring is a chunk ahead of where you are looking, the ground is
  already there when the camera arrives.
- The terrain layer is re-baked for the chunk that just arrived, not for the whole grid.
- Where two cells with different parent biomes meet, the boundary is dithered over about sixteen
  tiles (`blendEdges` in `js/map.js`), so scrubland gives way to forest instead of stopping dead on a
  straight line.
- Fog, scanning, pathing, building and patches all work on any generated chunk, and the save records
  which chunks a run had streamed in so a base built two cells out comes back standing on real ground.

The engine side is three things: a `chunks` option on `Game.createSync` / `Game.land`, the public
`game.ensureChunks(x, y, ring)`, and a `map:chunks` event. **`chunks` defaults to 1**, so the node
tests and the balance sim still get exactly the one 96-tile cell they always had — only the
interface asks for more.

```js
const game = Game.createSync({ data, planets, size: 96, chunks: 5 });   // 480 x 480, centre 3x3 warm
game.ensureChunks(camX, camY, 1);                                        // fill the ring round here
game.map.chunk;        // { size, cols, rows, centre, ready, bounds, generated, fresh, version }
```

Two engine rules had to become chunk-aware so the bigger grid did not change the game: nests are
seeded per *world cell* in the neighbourhood you landed in rather than per grid (or a 25-cell map
would carry twenty-five times the threat), and a wave walks in from the edge of the **loaded** world
no more than about one cell from your base, rather than from the far corner of a grid that would take
twenty minutes to cross.

## Running the engine on its own

```bash
# the balance sim - this is the main way to exercise the engine
node prototypes/frontier-foundry/tools/sim-foundry.mjs --hours 8
node prototypes/frontier-foundry/tools/sim-foundry.mjs --seed 12 --hours 12 --planet volcanic --difficulty hard --why
node prototypes/frontier-foundry/tools/sim-foundry.mjs --hours 6 --no-waves --why    # the economy on its own

# the tests
node --test prototypes/frontier-foundry/tests/*.test.js
npm run test:unit                                   # includes them
```

`--why` prints what every machine is waiting for, which build step the bot is stuck on, how full
each patch is, and the last important notifications. Use it before touching any number.

Using the engine from code:

```js
import { loadData } from './js/data.js';
import { Game } from './js/game.js';
import { Bot } from './js/ai.js';

const game = await Game.create({ seed: 7, difficulty: 'normal' });
game.scan(game.hq().x, game.hq().y, 30);
game.place('drill_mk1', x, y);
game.addRoute({ from: outpostCrateId, to: game.hq().id, resource: 'iron_ore' });
for (let t = 0; t < 3600; t++) game.tick(1);
console.log(game.inventory(), game.unread(3));
```

## What is in here

| Path | What it is |
|---|---|
| `DESIGN.md` | the design note: the loop, the numbers, every system, planet progression, the endgame, and **the full API the UI codes against** |
| `data/*.json` | 81 resources, 105 structures, 71 recipes, 86 research nodes, 10 vehicles, 25 unit types, 44 quests (a 9-step tutorial chain, a 4-step side chain and 31 standalone), per-archetype wave and nest tables for all ten worlds, the wave pacing, 70 notification templates |
| `index.html` + `style.css` | the page and its theme: a dark operations console, cyan and amber, mono for every number |
| `js/*.js` | the engine: `game` `data` `rules` `map` `fog` `build` `production` `logistics` `research` `combat` `space` `planets` `ai` |
| `js/ui/*.js` | the interface: `main` (clock, screens, keys, saves) `surface` (map + camera) `build-tool` `route-tool` `panel` `hud` `research-screen` `map-screen` `orbit-screen` `codex-screen` `title` `icons` `sound` `save` `dom` |
| `tools/sim-foundry.mjs` | the headless balance run |
| `tests/*.test.js` | node tests: data validation, map and scanning, fog, the build flow, hauling, power, production, waves, walls and gates, research, quests, space, save/load, the bot's milestones, and (`ui-engine.test.js`) the four hooks the interface added |
| `tests/foundry.spec.js` | Playwright, against the real page: land, draw, build, haul, research, jump to a message, force a wave, save and reload, plus one test per bug report below |

## Data formats

Every file is `{ schema: 1, note: "...", <list> }` and every entry carries a plain-language `desc`.
`js/data.js` loads them and builds the indexes (`data.resource[id]`, `data.recipesFor[structureId]`,
`data.unlockedBy[id]`, …). Ids match the shared icon set, and where an id has no icon of its own it
carries an `icon` field naming the one to use.

```jsonc
// resources.json
{ "id": "iron_ore", "name": "Iron Ore", "kind": "ore", "phase": "solid", "color": "#8c7a6b",
  "tags": ["metal", "common"], "value": 2, "stack": 200, "transport": "crate",
  "found": { "biomes": ["hills", "mountains"], "archetypes": ["temperate", "arid"], "rarity": 1.0, "richness": 1.0 },
  "desc": "The backbone metal." }

// structures.json
{ "id": "drill_mk1", "name": "Rock Drill I", "category": "extraction", "size": { "w": 3, "h": 3 },
  "cost": { "iron_plate": 14, "gear": 8 }, "buildTime": 12, "hp": 420, "powerUse": 20,
  "requiresNode": ["ore", "mineral", "rare"], "extractRate": 0.8, "unlock": "t_landfall", "desc": "…" }

// recipes.json
{ "id": "smelt_iron", "category": "smelting", "machines": ["smelter", "arc_furnace"], "time": 2.4,
  "power": 20, "inputs": { "iron_ore": 2, "coal": 1 }, "outputs": { "iron_ingot": 1 }, "unlock": "t_landfall" }

// tech.json
{ "id": "t_steel", "tier": 2, "work": 180, "cost": { "pack_basic": 60 }, "requires": ["t_masonry", "t_alloys"],
  "unlocks": ["arc_furnace", "make_steel", "make_steel_plate", "steel_wall"], "desc": "…" }
```

A structure is planet-gated with `planetRequirement` (the rare element it needs) plus `variantOf`
(the plain building it replaces); its research node carries the same `planetRequirement`.

## Where the sim gets to

On the default seed and planet, one 96 × 96 cell (`chunks: 1`, which is what the sim uses):

- **First attack at 12 minutes** on normal, exactly what `waves.json` promises (20 minutes on easy,
  7 on hard).
- **Economy, attacks off:** about 150 buildings and 22 research nodes in 8 in-game hours, ~2 MW of
  generation, trucks running, seven side quests done.
- **With attacks on, easy:** 14 waves held, 157 kills, 16 research nodes, four regions surveyed, and
  it dies around an hour and a half in.
- **With attacks on, normal:** it holds nine or ten waves and dies about an hour in, because the
  factory cannot get to steel and gun turrets before the waves outgrow watchtowers.
- **It does not reach a rocket on any difficulty.** It stalls in the mid-game — see below.

Eight in-game hours of simulation costs about 17 seconds of real time.

## What the interface needed

The interface is presentation and input only, so anything it could not express had to become a small,
additive piece of engine. There were four, and they are pinned by `tests/ui-engine.test.js`:

| Addition | Why |
|---|---|
| `footprint(def, rot)` and a `rot` option on `canPlace` / `place` | eight buildings are not square (a refinery is 5×4), and a player expects <kbd>R</kbd> to turn one. The facing is saved and restored. |
| `game.selectAt(x, y)` | one click has to resolve to the most interesting thing on a tile: a hostile, then your own crew, then the building, then the nest, then the patch. It never returns null. |
| `tickOrders` + `unit.moveTo` | right-clicking the map had nothing to do before this, because builders picked their own jobs and guards never moved at all. A builder drops its order when it arrives and goes back to the queue. |
| `recordShot` / `game.shots` | turret fire is applied as damage-per-second with no event, so there was nothing to draw. It is off unless `game.recordShots` is set, so the headless sim pays nothing for it. |

## What worked, and what did not

**Worked**

- **The storage-pool rule is legible on screen.** Selecting a building shows its link radius as a
  dashed ring and says how many buildings share its pool. Watching two rings overlap and the pool
  count jump is the moment the rule teaches itself.
- **The three jam fields carry the whole diagnostic load.** `powered`, `starvedFor` and `blocked` are
  three coloured dots on the building and three pips on the map, and between them they explain
  practically every stopped machine without any extra engine work.
- **Notifications with a place on them.** Every message that carries `at` gets a *go* button that
  centres the camera and pulses a ring. It turns a wall of log text into a to-do list.
- **The universe project as the title screen.** Generating a galaxy, picking a star and adapting its
  planets took about thirty lines, and the candidate list writes itself out of the planet records.
- **Baking icons into small canvases.** Drawing SVG-backed images straight onto the map re-rasterizes
  them every frame; caching each icon at eight fixed sizes took the map loop from janky to flat.

**Did not**

- **A single-row top bar.** Four readouts plus navigation plus a clock clip the moment a planet gets a
  long name. It is two rows now and never clips.
- **Rotation as a purely visual facing.** It had to become a real footprint swap in the engine, or a
  turned refinery would have claimed the wrong tiles.
- **Letting the tools cancel each other.** `setMode` used to call the outgoing tool's `cancel()`,
  which called `setMode` again — an infinite loop the first time you pressed Esc in build mode. Tools
  now expose a `reset()` that does not touch the surface.
- **Trucks without fuel.** A rover burns refined fuel and the pod does not land with any, so a
  player's first route sits at the loading bay saying nothing. The route dialog now warns before you
  build it, and the run list says *out of fuel* / *destination full* instead of naming the leg.
- **The pod as a delivery destination.** It starts close to full, so the obvious first route silts up
  immediately. That is an engine balance question rather than an interface one, but it is the first
  thing a new player will do.

## Three bug reports, and what was actually wrong

| | Report | Cause | Fix |
|---|---|---|---|
| **FF1** | Dropdowns would not stay open | The side panel redraws four times a second and rebuilt its children with `fill()` every time. A `<select>` whose element is thrown away closes its open list — nothing was stealing focus, the control simply stopped existing. | `patch()` in `js/ui/dom.js`: a small keyed morph. The recipe control carries `key: 'recipe:<id>'` and is updated in place; the panel keeps a fixed shape (`.sp-pool`, `.sp-hold`, `.sp-recipe` slots are always present) so it cannot shift under the player either. |
| **FF2** | The route tool would not offer *biomass* from a harvester to a kiln; a drill to a smelter said *"smelter does not accept iron ore"* | Two separate things. The picker's candidate list was "whatever the source is holding, plus its current recipe's outputs" — a biomass harvester has no patch and no recipe and pushes what it cuts straight into the store pool, so its own buffer is empty and the list came back with nothing. And `accepts()` is a *store* rule, so no route could ever end at a machine. | `sourceResources()` in `js/ui/route-tool.js` reads the engine: what it holds, its patch, a quarry's `yields`, a harvester's `harvestsTerrain`, the outputs of every recipe it could run, and the contents of its store pool. `acceptsDelivery()` in `js/production.js` lets a run end at a machine that eats the resource in a recipe it runs *or could run*. Loading was fixed to draw from the source's store pool too, otherwise a route out of a drill still never moves a thing. |
| **FF3** | The play area is one tiny square | The local map was one worldgen cell, 96 × 96, and that was the whole world. | The streamed grid above: 5 × 5 cells, generated around the camera. |

## Known rough edges

- **The bot stalls in the mid-game.** It plateaus around 22 research nodes, short of rocketry. It
  keeps running out of one input at a time — usually coal or copper wire — because it never scales a
  chain past the fixed counts in its build programme, and because as it sprawls the base splits into
  several storage pools and some machines end up unable to reach the pool holding their inputs. The
  engine is fine: a player laying a base out sensibly, or running delivery routes between clusters,
  would not hit either. Teaching the bot to widen a chain when its output is short (and to build
  compactly) is the main outstanding job, and is what stands between the sim and a measured "time to
  rocket".
- **On normal difficulty the bot loses, about an hour in.** Same root cause: a stalled economy means
  no steel, and no steel means no gun turrets.
- **One buildable local map per planet, but it is 480 tiles across.** Regions are surveyed for intel
  and a supply cache rather than becoming second build sites. Nothing in the engine assumes there is
  only one map — a UI can create a second `Game` on another world cell.
- **The streamed grid has an outer edge.** Five cells a side is a deliberate stopping point, not a
  technical one: the whole-map algorithms (the enemies' flow field, the trucks' cost field) walk the
  grid, and they only stay cheap because ungenerated ground is impassable and so is never expanded
  into. `CHUNKS` in `js/ui/main.js` is the one constant to change, but a much larger number wants
  those two algorithms bounded to a region first.
- **Streamed chunks get no nests of their own.** They carry terrain and resource patches, so panning
  out is worth doing, but the threat clock is still seeded once at landfall. Seeding a few nests into
  a chunk as it arrives would make exploring properly dangerous.
- **Enemy pathing is one shared flow field per wave.** Cheap and good enough, but every enemy in a
  wave walks the same way in. Per-enemy targeting would look better on screen.
- **No pipes or belts, by design.** See `DESIGN.md` §11.

## Using the real universe

`js/planets.js` carries its own ten-archetype planet generator so the prototype runs alone, plus an
adapter for the universe project:

```js
import { generateGalaxy } from '../../universe/js/galaxy.js';
import { generateSystem } from '../../universe/js/system.js';
import { generatePlanetMap as universeMap } from '../../universe/js/planetmap.js';
import { universePlanets } from './js/planets.js';

const galaxy  = generateGalaxy({ seed: 5, stars: 40 });
const systems = galaxy.stars.slice(0, 4).map(st => generateSystem(st, { seed: 5 }));
const planets = universePlanets(systems, data.resources, { generateMap: universeMap });
const game    = Game.createSync({ data, planets, planet: planets.list()[0] });
```

The universe decides the archetype, the rare elements, the hazards, the gravity and the day length;
this side rolls what is actually in the ground and hands back a playable planet sorted by difficulty.
**Moons come through as landing targets of their own** (a universe moon is a small planet record), so
the moons of a gas giant are in the list even though the giant itself is not: they carry `moon: true`
and `parentId`, and `universe.moonId` says which moon of which planet it is. Pass `{ moons: false }`
to leave them out.
Eight of the universe's twelve rare elements are ones we have buildings for; the other four
(`helionGas`, `nullstone`, `emberlace`, `brinepearl`) are dropped until someone designs structures
for them.

## Notes for anyone extending the interface

- Read `DESIGN.md` §8 first — it lists every public method and event with one line each.
- Three fields explain almost every "why has this stopped": `structure.starvedFor` (missing input),
  `structure.blocked` (output has nowhere to go), `structure.powered` (grid is short).
- `canPlace()` returns a plain-language `reason`; put it straight under the placement ghost.
- Notifications carry `importance` 1–5 and a `jumpTo` tile. Anything at 4 or 5 deserves to interrupt.
- The engine never draws, never sets a timer and never touches the DOM. Call `tick(dt)` from your
  own loop with however much game time has passed.
- `window.foundry` is the handle the tests use: `{ game, app, surface, hud, show(screen), jump(x, y),
  save(), debug }`. `debug` has `run(seconds)`, `forceWave()`, `revealAll()`, `give(res, n)`,
  `instant(type, x, y)`, `finishBuilds()`, `unlock(techId)`, `unlockAll()`, `setSpeed(n)`,
  `pick(structureId)`, `chunks()` and `loadAllChunks()` — every one of them drives the real engine,
  they only skip the wall clock.
- **Do not rebuild DOM that the player is using.** `fill()` is for a screen you have just opened;
  `patch()` in `js/ui/dom.js` is for anything that redraws while it is on screen. `patch` reuses an
  element only when its subtree carries the same set of `key`s, so a keyed control is updated in
  place and everything else is still replaced outright — which matters, because a reused element
  keeps the handlers it was built with and those close over the entities of the render that made
  them. Mark a control with `el('select', { key: 'recipe:' + s.id })` and put the identity in the
  key.
- Icons come from `assets/data/icons/foundry/`. `js/ui/icon-list.js` is generated from that folder by
  `tools/build-icon-list.mjs`; regenerate it after adding art so the page never asks for a file that
  is not there.
