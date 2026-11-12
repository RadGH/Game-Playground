# Stoneward

> **QA pass pending** (added 2026-11-11): the next time this game is worked on, run `tools/prepublish-check.sh stoneward` from the playground and fix what it finds — game-lint (on 2026-11-11: 11 browser-tooltip, 1 muster), modules nothing loads (`tools/game-reach.mjs`), and a `tests/walk.mjs` that walks every screen on desktop + phone (`tools/walk-screens.mjs`; none yet). Replace this note with the **Status / Play / Next / Parked** block (`~/claude/docs/game-standards.md`) and add `stoneward` to `tools/qa-passed.json`. Publishing this game refuses until the checks pass.

A medieval castle-era **city sim** on a whole generated planet, built on Kindlewild-style pixel physics (independent
project by Radley Sustaire, sandbox). The map wraps east–west and zooms out to a spinning globe. Towns grow on their
own; the player expands, connects and defends. Resources are found as nodes, mined, and hauled home along roads.
Guards patrol, walls are drawn as lines and crack and fall, rivals rise, and ruler powers act like disasters.

- **Read first:** `docs/PLAN.md` (§1 = every owner decision; §0 rules; milestones M0–M12). The verbatim brief is in
  `docs/OWNER-BRIEF.md`. The checklist is `~/claude/agent/stoneward-checklist.md`.
- **Serve:** dev `http://<LAN>:8401/prototypes/stoneward/`, stable `:8400` after `tools/publish-stable.sh`.
- **No build step.** ES modules, standalone CSS, data in `data/*.json`.
- **Tests:** `node --test prototypes/stoneward/tests/*.test.mjs`. Screenshots: `node prototypes/stoneward/tools/shots.mjs <prefix>`
  (needs the dev server).

## Status

| Milestone | State |
|---|---|
| M0 Planet | done 2026-11-03: seamless macro map in 6 sizes, chunks made on demand, 3/4 painter, zoom to globe |
| M1 Cells in 3/4 | done 2026-11-03: fire, heat, water/lava flow, vents that erupt, lava + water → obsidian, sim in the worker at 20 ticks/s × speed, glow light + bloom, day/night colour grade |
| M2 Settlers | done 2026-11-03: land on the globe, keep, migrants, tents → huts → cottages, gatherers, hauling, builders, roads (3 tiers + bridges), worn paths, warehouses + kingdom stock, Build / Roads / Info tabs, saves |
| M3 Harvest & routes | done 2026-11-03: nodes from the macro map, automatic scanning around towns, outposts and scouts, mines on found seams with miners living on site, routes that open by themselves (porters → carts once a road joins up), Routes screen (+cart, vehicle, steer, priority) |
| M4 Industry & homes | done 2026-11-03: 11 workshops (sawmill, charcoal, smelter, smithy, armourer, mill, bakery, brewery, weaver, carpenter, goldsmith), farms/plots/pasture, 6 house levels with needs, merges into wider homes, downgrades, mood + taxes, services (market, tavern, healer, beauty), street lamps, Move for gold, Economy / People screens, data Views |
| M5 Walls & ruin | done 2026-11-03: drawn walls with towers/gates/tiers and in-place upgrade, per-cell hit points + cracks, collapse straight down into rubble that fades, free repair away from enemies, fire stations and bucket lines, firebreaks, keep-clear / build-here areas, outskirts |
| M10 Trains | done 2026-11-03 (built ahead of M4–M9): track that can't be destroyed, stations, lines found by themselves, freight and passenger trains, shared appeal, vulnerable stopped trains, Rails tab + Lines screen |
| M9 Powers & disasters | done 2026-11-03: seven ruler powers in three sizes paid in faith (chapel, church, cathedral), world disasters Off / Rare / Normal / Frequent, shared blast + debris physics with rubble that fades |
| M6 Guards & magic, M7 Threats | done 2026-11-03: five guard kinds paid in gold, posts / patrol loops / hold / barracks, enemies near a route call the guards, safety from patrols, crewed and magic towers (lightning chains, arcane homing, shield dome, flame cone), monsters by group (beasts, brutes that smash walls, undead at night, drakes over walls, bandits for stores and carts), lairs found by scanning, raids that grow with the town and hit the weakest point with a warning, wages, defeat → land again |
| M8 Rivals | done 2026-11-03: 2-4 kingdoms with a rolled split of stances, opinion with warnings and flips, towns drawn as real cells that grow, border pressure, demands and tribute, armies with sappers and catapults, ally caravans that walk in and trade by your Market settings, a shared road on alliance, powers on their land sour them |
| M11 Big cities | done 2026-11-03: town halls found new towns, outposts grow into hamlets, commuters on passenger lines, far towns run cheaper (every 4th tick, 4 steps), tile-cost cache for long paths, globe marks (towns, borders, night lights, routes, armies) with filters and a sun that follows the clock |
| M12 Progress & publish | done 2026-11-03 (except the public listing — ask Radley): population milestones with chests and landmarks, achievements kept across worlds, research + tiers wired behind one unlock check (everything unlocked), sound + music, ! reports with a picture, cloud saves, gamepad menus, account button, What's new |
| Play-test 2 | done 2026-11-04: towns defend themselves (garrison, archers on walls, auto walls/gates/firebreaks/watchtowers), Army tab with attack flags, raiders burn and blast, stone walls only break to explosions, growth no longer stalls, yards + long roads, visible work (felling, boats, tools), Info → Needs, settler wagons, Transport tab with docks, Lightning Strike + Frost Nova, no cooldowns, no random fires, bigger meteor, depth so buildings hide people behind them, sharper globe, pinch fix. See docs/PLAN.md §8 |

## How the planet works (M0)

**Macro map** (`js/planet/macro.js`, PURE). The whole planet at one macro cell per 32 m: X-tiny is 32×16, X-large
is 1024×512, and the largest takes about 1.5 s. Every field is 3D simplex noise sampled on a **cylinder**, with
longitude as an angle. That makes x = 0 and x = mw − 1 neighbours like any other pair, so there is no seam to
hide. The layers are:

- elevation, with sea level set by percentile from the Water setting;
- ridged mountains, added only inland;
- temperature, from latitude and height;
- moisture, from noise plus nearness to the coast (the chamfer distance wraps in x);
- rivers, which run steepest-descent downhill and wrap. Their polylines are stored *unwrapped* so a river crossing
  the seam stays one line;
- biomes from `js/planet/biomes.js`: temperate plus strange (volcanic, haunted moor, crystal, ruins), and ice caps on
  the polar rows;
- `site`, a landing-quality score.

`worldgen/` was not reused. It frames every map in ocean, and its drainage, regions and A* all stop at the map
edges (its README says so).

**Chunks** (`js/planet/chunkgen.js`, PURE). Chunks are 64×64 cells at 1 m each, generated from the seed and the
macro map, and always the same. Each cell holds Kindlewild's layers (`ground mat height temp life flag`) plus
`tall` (column height for the 3/4 view), `hp` and `part` (Uint16). How each part is made:

- Biome edges are a jittered macro lookup.
- Ground mixes come in clumps.
- Trees, bushes, boulders, crystals, graves and vents are scattered by biome rates in `biomes.js`.
- Rivers are the macro polylines rasterised per cell with a noise meander. Only the segments near the chunk are
  checked, using a chunk-keyed bucket.
- Ruins are broken wall rectangles.

Generating a chunk takes about 5 ms.

**Chunk store** (`js/planet/chunks.js`). Chunks are generated on first use, and unedited ones are forgotten when the
store is over budget. Edited chunks are kept and are the only ones a save needs. x wraps; y outside the map gives
`null`.

**Worker** (`js/worker/sim-worker.js`). Owns the macro map and the chunk store. It sends the page copies of chunk
layers as transferred buffers.

**Painter** (`js/render/paint.js`). Turns a chunk into an RGBA image of `(64+8)×(64+32)` cells. There are 4 cells of
side margin for canopies and 32 rows above for columns, which stand **up**. Rows are painted north to south and
chunks are drawn north to south, so whatever is further south is drawn later and covers what is behind it. That is
the whole 3/4 occlusion rule. Trees are drawn as canopy blobs or pine triangles on a trunk. Walls and stones are a
darker front face with a lighter top.

**Depth (play-test 2).** The painter also stores, in each pixel's alpha, the ROW of whatever standing thing
painted it (160 + row; 255 = flat ground). The chunk pass writes that as depth, and sprites that carry a
FOOT (9th value of a quad: the y they stand on) are depth-tested against it, so a building, wall or tree
standing further south hides a person behind it. Quads without a foot draw on top as before. API in the
header of `js/render/gl.js`.

**Renderer** (`js/render/gl.js`, WebGL2). Three passes share one camera:

1. The macro pass is always drawn first. It reads the biome texture through a jitter, so ragged edges show and a
   chunk that hasn't arrived yet looks like its biome instead of a hole.
2. The chunk quads are drawn at the copy nearest the camera.
3. The globe pass is a ray/sphere test sampling the same textures. Its radius is `W·ppc/2π`, so at the moment it
   fades in, its circumference equals the flat map's width.

**Camera** (`js/ui/camera.js`). Zoom is `ppc`, CSS pixels per cell, from 14 down to "the globe fills 38% of the
short side". The globe fades in once the map is about 1.7 screens wide. Controls:

- touch: one finger drags, two fingers pinch. A primary pointer-down (or the browser's own touchend with no
  fingers left) forgets every finger the camera still holds: iPhones sometimes never report a finger lifting,
  and that leftover made every later touch the second finger of a pinch — stuck zooming (Kindlewild had the
  same bug). The finger left on the glass after a pinch does nothing until it lifts;
- mouse wheel;
- keyboard: WASD or arrows (W = screen north = north), Q/E to zoom;
- gamepad: left stick, triggers.

`window.gameEye.state()` reports the screen, world, camera and chunk counts.

## The live world (M1)

**Sim** (`js/sim/sim.js`, PURE). The chunk store, a seeded rng, the clock (a day is 12,000 ticks, 10 minutes
at 1x; tod 0 = dawn), drifting wind, `order()` (every change to the world goes through it), and `systems[]`
(later milestones append `{ id, step(sim) }`). Chunks are stepped only while **awake**. Chunks in the focus
rect (the view) run every tick; awake chunks elsewhere run every 4th tick (`farEvery`).

**Cell rules** (`js/sim/cells.js`). Kindlewild's rules rewritten for chunks. Every neighbour read goes through
`nb()`: the fast path stays inside the chunk, and the slow path asks the store for the next chunk (x wraps). A
neighbour chunk that is not in memory is treated as a wall. The rules:

- Fire spends fuel, heats its neighbours (more downwind) and burns out to `burnsTo` / `burnGround`.
- Heat is shared with the 4 neighbours and drifts back to ambient.
- Liquids flow steepest-first toward lower `height*8 + amount`. Thin lava rolls and leaves crust.
- Crust cools to basalt.
- Lava touching water becomes obsidian.
- Vents erupt on their own clock (`ventCycle`/`ventBurst`).

**Generated sea and river water is STILL** and never flows. Its beds are not flat, so flowing would drain every
sea into its deepest point. A changed chunk is marked edited, so it is the only kind a save keeps.

**Worker loop** (`js/worker/sim-worker.js`). Every 50 ms it runs `speed` ticks (0/1/2/4/8). About 10 times a
second it sends a `tick` message with the clock and the chunks the page holds that changed. The page sends its
view rect, which becomes the focus.

**Light** (`js/render/gl.js` + `js/render/daylight.js`):

1. The scene is drawn into a full-size target.
2. Each chunk's glow image (lava, fire, crystals, lamps; `paintGlow`) is drawn additively at half size, then
   blurred twice at quarter size.
3. The composite gives scene × ambient. The ambient colour comes from an 11-key table: warm dusk, cool night,
   bright noon.
4. Light tints what it falls on toward its own colour, then bloom is added.

**Test tools:** add `?dev` to the URL for a Test tab (drop fire, lava or water; Night/Noon).
`window.gameEye.order(...)` and `.speed(n)` work too.

## The town (M2)

**Town** (`js/sim/town/town.js`, PURE, a sim system). State is kept in `sim.state.town` as plain JSON:

- `towns`
- `buildings`: `{ id, kind, town, x, y, w, h, state: site|up, work, need, got, store, workers }`
- `people`: `{ id, town, x, y, home, job, task, carry }`

How it runs:

- **People** pick their own work (`think`). Job workers gather; everyone else hauls producers' piles home,
  fetches building materials to sites, and builds. A task is a small state machine run by `act`.
- **Paths** come from `js/sim/town/nav.js`: A* over cells where a cell's cost is 100 / walk%. Faster roads
  therefore win, and solid cells and water block.
- **Worn paths:** walking on grass wears it, and enough wear turns the cell into a dirt path (the owner's "paths
  form where people walk a lot").
- **The planner** (`plan`, every 2 s per town) puts up, in order:
  1. tents for the homeless;
  2. food (forager, fisher if water is near, hunter);
  3. a woodcutter or quarry when stock is low;
  4. upgrades: tent → hut → cottage, when stock covers twice the cost;
  5. wells and warehouses.
- **Plots** sit beside road cells (`findPlot`). When nothing fits, the town pushes a new dirt road out
  (`growRoads`). The search radius grows with the town (`searchR`: 40 + 10·√pop, 70..300 m). Before
  play-test 2 it was a fixed 70 m and the tent step RETURNED when no tent fitted, so a town with no room left
  near the keep never planned anything again — the "stopped growing at about 150" stall. A failed tent no
  longer stops the rest of the plan.
- **Spreading out (play-test 2):** homes are placed with a 2-cell margin and more jitter, and a finished
  home gets a **yard** (`makeYard`): a hedge or fence with a bush or two and flowers on the side with the
  most open ground. Yard cells belong to the home (`part`), so a tap on them opens the home, and they go
  when it goes (`clearYard`). Every 3–8 minutes a town of 25+ pushes one **long road** out (`longRoad`,
  30–110 m, toward woods, stone or water), and roads that hit a wall turn that cell into a gate. Streets are
  `town.roadWidth` (3) cells wide, the keep's first cross 4, and plots sit `plotSetback` (2) cells back.
- **Radius** (`radius(town)`): the farthest home, service or workshop from the keep (not woodcutters,
  fields, docks or towers, which sit at the edge on purpose). Walls and the garrison's reach use it.
- **Work you can see:** woodcutting pushes a `fell` event the page draws as a toppling tree (with a chop
  sound); fishers row out over open water in a boat (`boatSpot`, `p.boat`); the people snapshot carries an
  `act` code (chop, dig, field, fish, build, douse, hunt, workshop, flee) that the page animates, and what is
  carried by name.
- **Fleeing:** townsfolk within 12 m of an enemy drop what they carry and run for the keep (`flee`).
- **Settler wagons** (`settler` order, data `settler`): 500 gold, six free folk and a load of logs, stone and
  food from the nearest town, at least 110 m from any town. The wagon follows `nav.findLong` and founds a
  town hall where it stops; its riders become the new town (nothing teleports).
- **Fire duty** (walls.js `fireDuty`): every burning building or yard near a town pulls in up to a dozen of
  the nearest townsfolk (not just those resting at home), plus the fire station's crew. Each fetches water
  from a well or open water (or beats the flames when there is none) and then goes for the NEAREST burning
  cell (`sim.nearestFire`), not a random spot.
- **Kingdom stock** is whatever sits in the keep or warehouses (`kingdom: true` in `data/buildings.json`).
  A producer's pile doesn't count until a hauler carries it home (§0.2).
- **Daily:** each person eats one food from the stock. Hungry people leave. Taxes come in by home level.
  Migrants arrive every `migrantEverySecs` while there is food.
- **Buildings are real cells** (`js/sim/town/blueprints.js`): houses get a gable, keeps get crenels and corner
  towers. While a site is being built its cells are stamped in step by step. A building with less than half its
  cells left is lost.

**Saves** (`js/sim/save.js` + `js/client/saves.js`). A save holds the settings (which regenerate the planet
exactly), the clock, `sim.state`, and only the edited chunks, each run-length encoded and stored as base64. Saves
live in IndexedDB in 6 slots, with an autosave every 2 minutes and when the tab is hidden.

**Page:**

- **Landing:** spin the globe and tap; `camera.toWorld` inverts the globe shader. Then "Found here".
- **Build tab:** a ghost footprint follows the pointer, green or red from the worker's `fits`.
- **Roads tab:** a camera *tool* takes single-finger drags (two fingers still move the map) and lays a road
  2 cells wide. Shallow water becomes a bridge.
- **Info tab:** town cards with their stock.
- **Tapping a building** opens its sheet, with Demolish.
- **People** are drawn as 1×2-cell figures from the worker's 10 Hz snapshot, eased between snapshots.

## Harvest and routes (M3)

**Nodes** (`js/sim/discover.js`). `generateNodes(macro)` puts iron, coal, granite, gold and crystal seams in
rocky biomes. They are generated the same way every time, so only the **found** ids are saved. Scanning runs
every 2 s: towns scan 260 m around them, outposts scan `scan` m, and scouts scan 110 m as they ride. Every town
keeps one scout riding out toward land with few finds. "Send a scout" (Info) costs 20 gold and rides to the
spot you tap. Nodes never run out; `rich` 1–3 multiplies output.

**Mines** (`data/buildings.json`, `node: <kind>`). A mine has to sit on a found seam of its kind (the town's
`build` order checks this, and the ghost snaps to a seam). When it finishes far from every keep (`remoteAt`
90 m), it is **remote**: its miners move in on site, and town haulers ignore it.

**Routes** (`js/sim/logistics/routes.js`):

- Every remote producer and every outpost gets a route automatically. The destination is the nearest
  outpost (for a mine near one) or the nearest town store with room.
- Long paths come from `nav.findLong`: A* on 4×4-cell tiles. A tile with a road costs its road cost; one
  without costs `offroad` times more for carts.
- A route starts with **porters**. Once at least 85% of its tiles are road it switches to **handcarts** by
  itself.
- Carts really drive the path, load at the source and unload at the destination. Goods join the kingdom
  stock only on arrival.
- A full destination sends the route to another store.
- The Routes screen (Info → Routes) can add or remove carts (costs gold), cycle the vehicle (porter, handcart,
  ox cart, wagon from `vehicles`), steer through a tapped waypoint, and set a priority.

## Industry and homes (M4)

**Workshops** (`job.kind: 'craft'` with `in` and `out` in `data/buildings.json`). A worker fetches inputs
from the stores into the workshop's `input` pile, works for `secs`, and puts the output in its own `store`.
Haulers then carry that home. Nothing teleports.

**Farms** (shape `farm`) are a farmhouse plus a field of crop cells that belong to the building. Workers
harvest the crops (`job.kind: 'farm'`), and each crop grows back after `regrow` ticks. A pasture (`herd`)
works the cells inside its fence.

**Homes** (`data/buildings.json` `homes`). The ladder is tent → hut → cottage → house → townhouse → manor.
Each level lists its `needs`:

- `cover`: water, market, faith, tavern, health, filled by a service in reach (faith is any kind with a
  `faith` field);
- `food`: how many different foods are in stock;
- `goods`: eaten daily per household;
- `safety`.

How levels change:

- A home climbs when the NEXT level's needs are met and the stock holds 1.5× the cost.
- A house or townhouse beside another of the same kind **merges** with it into one wider building (`b.w` /
  `b.h` override the kind's size; capacity scales with area).
- A home missing a need for more than `dropDays` drops a level in place.
- Outskirts (once walls exist) stop at cottage.

**Mood** is needs met (80%) + 20% base + the tax effect + beauty − recent attacks. Below 40% no migrants come;
below 35% people leave.

**Planner** (`plan`). It decides food from yesterday's production against consumption, keeps critical food
ahead of everything else, and runs an ordered rule list for workshops and services. The rules are in
`town.wants`, which is the Build tab's "★ wanted" badge. Street lamps go along the roads where people live.

**Economy counters.** `S.econ[town]` keeps today's made/used tally and 20 days of history; the Economy screen
draws sparklines from it.

**Page:** `js/features/city.js` adds Info → Economy (stock, made/used, trend, sparkline, tax buttons) and
Info → People (census, mood, what holds homes back). It also adds the **Views** tab (home level, each service's
coverage, land value, safety, fire cover), which tints buildings in view from the worker's `layer` list.
## Trains (M10)

**System** `js/sim/logistics/trains.js` (PURE, registered in `js/sim/extra-systems.js` as `sim.trains`).
**Page** `js/features/trains.js` (Rails tab, Info → Lines, rails and trains drawn as sprites, tap a train).
**Data** `data/buildings-trains.json` (the `station` kind, `trains`, `rail`) and `data/materials-trains.json`
(`rail`, `rail_bridge`, `platform`), both listed in `extras`. Train kinds live under `trains`, not
`vehicles`, so they never show up in a route's vehicle list.

- **Track** is cells. `{ t: 'rail', x0, y0, x1, y1 }` lays a straight run 2 cells wide: the ground becomes
  `rail`, or a `rail_bridge` cell over water whose bed is at least `rail.shallow` (deeper water, buildings,
  lava or the ice refuse the whole run). Every track cell's `part` is `RAIL_PART` (65535), so roads, building
  plots and site clearing all leave it alone. It costs `rail.cost` (stone + iron ore) per `rail.per` metres
  from the kingdom stock, nearest store first, and refuses with a sentence when the stock is short. Laying
  over track already there is free. The Track tool snaps a drag to the 8 compass directions; a drag that
  starts within 7 cells of a track end carries on from that end.
- **Track can never be destroyed (PLAN §0.3).** Its materials have hard 255 and no `ignite`, `melt` or
  `blastTo`. **Rule for every later fire, blast, melt, flow or wall rule: a cell whose ground or material
  has hard 255 is never changed.** `js/sim/cells.js` asks `fixedGround()` before cooling crust turns the
  ground to basalt and before something burning out leaves scorched ground; the rail bridge `floats`, so
  liquids lap round it instead of replacing it. (Lava can still run over the track bed; when it cools, the
  track is still there.)
- **Stations**: `{ t: 'station', x, y }` (centre of the footprint; `instant: true` is a test tool) must touch
  track and not cover it. It joins the nearest town and is built by that town's builders like anything
  else. It is a **kingdom store**, so what a train unloads there is in that town's stock. Drawn by the
  `station` shape in `js/sim/town/blueprints.js`: stone platforms along both long sides, a slate-roofed hall
  between them with a little clock tower.
- **Lines** are found by themselves: a flood fill over the track cells, and any connected piece with 2 or
  more finished stations is a line, keyed by its lowest station id. Each station stops at the track cell
  beside it nearest its middle. Stations are put in order along the track (start from the station farthest
  from the first one, then by distance along the track); the path between neighbours is a breadth-first walk
  over the track, smoothed over 5 cells. Rebuilt whenever track or the set of stations changes. A train
  whose line changes starts again from a station; a train whose line is gone is laid up for half its price.
- **Trains** are only a place along the line (`leg`, `d`) and a speed: no signals, no collisions, trains pass
  through each other. They run end to end and back, pull away over `accel` seconds, brake in time for each
  platform and wait `dwell` seconds. At a terminus the train just reverses (its old tail is its new front).
  Freight runs at 9× a walker, passengers 10× (wagons are 1.5×).
- **Freight rule** (at every stop, after unloading what fits): load the good that THIS town has the most more
  of than the NEXT stop's town (largest stock gap, at least `rail.minDiff`), up to half that gap and the
  train's `carry`. It loads from the station's own store first, then from that town's other stores within
  `rail.yard` metres (the goods yard: a station built near the keep can send the keep's goods). Goods ride
  the train and reach the other town only when it arrives.
- **Passenger trains**: `appeal(town)` adds `rail.appealShare` extra settlers per person every bigger town on
  the same passenger line has more than this one, capped at `rail.appealCap` per migrant group (town.js's
  `migrants()` already sums `appeal()`). A freight-only line adds nothing. **Commuters**: at each stop a
  passenger train takes min(seats, idle people here, open job slots at the next stop) and counts them when
  they get off (`stats.commuters`, shown on the Lines screen). They are counted only; giving them the job in
  the other town needs town.js (see below).
- **Danger**: a train is `vulnerable` while standing at a station or slower than `safeAbove` of its top speed
  (pulling away, braking). `sim.trains.hit(id, dmg)` (or the order `train.hit`) does nothing to a train at
  speed; a vulnerable one loses hp, and at 0 it is wrecked: removed, its load lost, a `say` event.
- **Orders**: `rail`, `station`, `train.add { line, kind }` (costs `gold` + `cost`), `train.remove { line, kind }`
  (half the gold back), `train.hit { id, dmg }`, and the test tool `dev.give { goods, gold }`. Refusals come
  back as a sentence (a string), because the worker's reply keeps only id/x/y/name of an object.
- **View** (`town.trains` on the page): `segs` (the runs that were drawn, for the steel rails), `lines`
  (stations, length, trip time, train counts, delivered, commuters), `trains` (carriage positions engine
  first, `vul`, hp, load, riders, speed in m/s, wait).
- **Commuters filling jobs (not done, needs town.js):** in `assignJobs(town)`, after the town's own people,
  let idle people from towns sharing a passenger line with it take the remaining open slots
  (`sim.trains.linkedTowns(town.id)` would list them), keeping their `p.town` and home; their walk to work
  is the train ride, so `think()` should send a commuter whose job is in another town to their station
  instead of `goTo` the workplace directly.
- Research: every train row and the station carry `research: 'railways'` for when research gating is
  switched on (M12). Tests: `tests/trains.test.mjs`. Screenshots: `node prototypes/stoneward/tools/shots-m10.mjs
  <prefix> [w h] [base-url]`.
## Powers and disasters (M9)

**Ruler powers** (`js/sim/powers.js`, PURE, a sim system registered in `js/sim/extra-systems.js`). Seven powers,
each Small / Medium / Large: Call Rain, Smite, Meteor, Tornado, Black Hole, Earthquake, Firestorm. Every number
(cost, cooldown, radius, length, strength) is in `data/buildings-faith.json` under `powers`, three values each in
size order. Cost and cooldown grow with size; the cooldown is shared by every size of a power. A cast is the
order `{ t: 'power', id, size, x, y }` and answers `{ ok, id }` or `{ error }`. They hit anything (a fire, a
forest, a camp, your own town):

- **Call Rain**: a cloud over a circle for a while. Puts out burning cells, cools lava to crust, and sets `WET`
  on the ground (wet cells will not catch and pass on less heat). The ground stays wet for `wetSecs` after the
  rain stops, then dries.
- **Smite**: lightning on one spot: heat, fire, sand to glass, and a small blast.
- **Meteor**: falls for `fall` ticks (a streak on the page), then a blast with a crater, burning debris, and a pool
  of lava in the middle.
- **Tornado**: wanders (leaning with the wind), breaks light things (push vs `hard`), flings the pieces round
  itself and scours grass to dirt.
- **Black Hole**: everything in its middle is swallowed and the ground there becomes fissure; around it, cells
  break and are dragged in (it pulls harder the longer it lasts); then it collapses with a blast.
- **Earthquake**: opens cracks at once (ground becomes `fissure`, from `data/materials-powers.json`), then shakes:
  tall columns lose hit points (hardest near the middle). A cracked top falls straight down; at 0 hp the whole
  column comes down. The page shakes the camera while one is in view.
- **Firestorm**: fire balls fall over a circle; each bursts into a small fire blast where it lands, and some leave
  a little lava.

**Faith** is a capped stock in `sim.state.powers.faith`. Chapel / Church / Cathedral (group `services`, shape
`church` in `js/sim/town/blueprints.js`: a gabled nave with a bell tower, plus a spire on the cathedral) carry
`faith: { rate, reach, cap }`. Every second, each town person inside a church's reach adds that church's rate
(faith a minute) times their `mood` (0..1, or 1 when they have none) times the world's `faithRate`. A person
counts once, for the best church that reaches them, so packing chapels together does nothing. The cap is
`faith.baseCap` plus every church's `cap` (the cathedral's is large). The top bar shows ✨ faith (added by the
feature, not main.js).

**World disasters**: the new-world setting `disasters` (Off / Rare / Normal / Frequent) reaches the sim as
`sim.settings` (the worker sets it at init). `disasters.perDay` is how many to expect in a day; none come in the
first `graceDays`, and Off means none, ever. Kinds are weighted: lightning that finds dry forest or grass,
forest fires, earthquakes, tornadoes and meteors, landing `near` a random town. Each one is announced with a
`say` event (`kind: 'bad'`, with x/y), which the page shows as a toast. With no settings (node tests)
disasters are off. `{ t: 'disaster', kind, x, y }` starts one now (tests, dev).

**Blast + debris, shared physics** (`js/sim/blast.js`, `js/sim/particles.js`). Both are copied and adapted from
Kindlewild, not imported. There is one per sim: `blastOf(sim)` and `debrisOf(sim)` make them the first time and
then return the same ones. `debris.step()` is safe to call from several systems because it runs once a tick.
Later milestones (walls, sieges, monsters) use them as they are:

- `blast(x, y, r, power, { fire, crater, debris, heat })`: a cell breaks if `power x closeness x 70 + 10` beats
  its `hard`. Some broken cells fly off on arcs. The floor scorches, a crater digs the height map, and powder
  and mana crystal chain-blast.
- `breakCell(x, y, { push, fling })` breaks one cell. A cell with `tall > 1` that breaks drops its height as
  debris falling **straight down** round its foot (owner: no toppling).
- `lightning(x, y, power, r)`.
- Particles: `spawn`, `burst`, and `pull(x, y, R, strength, { swirl, lift, eat })` (the black hole and tornado
  use it; units later). `landers` are callbacks for special landings (firestorm fire balls).
- Landed debris becomes a real `rubble` cell, or heaps up to 3 high. Burning debris sets fire instead. Its
  fade time goes in `sim.state.debris.rubble` (flat `[x, y, fadeTick, …]`, saved), and after 3–4.5 minutes
  a heap sinks a step at a time and is gone (owner: debris fades, no salvage).

**Page** (`js/features/powers.js` + `css/powers.css`, one import in `js/features/index.js`):

- The Powers tab has a size switch and seven buttons showing cost and rest time, or "ready in N s".
- Picking a power shows its description as a toast and sets a map tool. Press to see the aim ring, release to
  cast. `P` opens the tab.
- In `?dev` a `+✨` button fills faith.
- The world setting `powers: false` hides the tab and the counter, and the sim refuses casts.
- Drawing: the sim's view (`town.powers`) carries the running effects, fresh bolts and flashes, and the
  particles in view. Rain (a darker wash plus falling streaks), the tornado funnel and ordinary debris are
  `hooks.sprites`, lit by day and night. The black hole swirl, the falling meteor, bolts, flashes, glowing
  particles and the aim ring are `hooks.overlay`.

**Gotchas:**

- Roads and bridges are never broken or scorched (§0.3). Debris that lands on a road, in water or inside a
  building's footprint just vanishes.
- Still sea and river water only **splashes**. Thinning it would leave a hole that nothing refills, so blasts
  and the black hole drain only water that is already flowing (and lava).
- Lava that flows onto a road later still cools to basalt *ground* there (`js/sim/cells.js`). The powers never
  put lava on a road themselves.
- Particles in flight are not saved (they live a few seconds). Everything else is: faith, cooldowns, running
  effects and rubble timers.
- A broken building cell gets `part = 0`, so a building with under half its cells left is lost by the town's
  usual check.
- Soaking ground with rain only marks the chunk as edited (for the save), not dirty, so it is not re-sent to
  the page ten times a second.
- The town does not build churches on its own yet. The player places them from Build → Services.
- Tests: `tests/powers.test.mjs`. Smoke check: `node prototypes/stoneward/tools/smoke-powers.mjs`. Screenshots:
  `node prototypes/stoneward/tools/shots-m9.mjs <prefix> [port]`.

## Guards, threats and the fight (M6 + M7)

**`js/sim/military.js`** is one system. Its numbers are in `data/military.json` and `data/buildings-military.json`.

- **Units** (guards and enemies alike): `{ side, kind, x, y, hp, mode, path }`. Guards move with the town's
  nav, so walls block them. Brutes and sappers plan *through* built cells at a cost of 12 and break them when
  next to them (`sim.damage`). Gates hold enemies back until broken. Drakes fly straight.
- **The garrison (play-test 2, owner: "no micromanaging")**: every town raises its OWN guards — no hiring,
  no orders. `stepGarrison` keeps `garrison.base + pop / garrison.per + barracks × garrison.barracks` guards
  (data/military.json `garrison`), recruiting one every `every` ticks at the barracks or keep, about 40%
  archers (crossbows with an armourer, a mage with a mage guild, spearmen once there is a smithy). Modes:
  `garrison` (walks a beat between random street cells from `sim.town.streetPoint`, marking safety, and goes
  for any enemy inside the town's reach = `sim.town.radius(town) + 45`), `wall` (an archer on a wall tower or
  a watchtower — it climbs up, `u.up`, gets 1.5× range and only comes down for an enemy already inside),
  `crew` (manning a crewed tower), `army` (with an attack flag) and `escort`. Old saves' `post`/`patrol`/
  `hold`/`barracks` guards fold into `garrison`. Wages come out of the treasury daily; an empty treasury stops
  new recruits, nobody deserts.
- **Attack flags** (`flag.add` / `flag.move` / `flag.clear`, at most 3): each flag takes the guards its
  nearest town can spare (everyone above max(3, 35%) who is walking the streets), gathers them at the edge
  of town on the flag's side (`gather`), and only when they are all there (or after 45 s) sets off together
  (`march`). In the flag's 34 m circle they fight anything hostile (`fight`); a lair or camp in it burns once
  no defender is left and half the band has stood there ~10 s; a rival town in it is raided
  (`sim.rivals.raided`). A moved flag re-routes them; a cleared one sends them back to the garrison.
- **Raiders raze** (play-test 2: raids "just run up and touch your city"): raiders (bandits, soldiers) pick
  the nearest standing building (homes first, the keep last, spreading out over the town), break a random
  cell of it (`sim.damage`) and set flammable cells alight; bowmen shoot fire arrows. When it burns or is
  gone they move on, and after `raidLeft` ticks they go home. Anyone of the town within reach is cut down
  (townsfolk run for the keep: `flee` in town.js). Catapult stones and sappers' powder kegs are real blasts
  (`S.pending` → `blastOf(sim).blast`), and blasts are the only thing that really hurts a stone wall
  (walls.js `damage(x, y, n, { blast })`, tiers' `melee` factor). The reach test has +0.8 m of slack: the
  path finder stops when the CELL is in reach and a unit stands mid-cell, so without it a soldier could stop
  one step short of the keep forever (the "AFK at the keep door").
- **Planning budget**: at most 3 path searches a tick across all units (`plansLeft`), so a big raid
  arriving at once spreads its planning instead of stalling.
- `strike(x, y, r, dmg, { kind, freeze })` hurts every enemy in a circle (Lightning Strike, Frost Nova);
  a frozen unit (`u.frozen` ticks) skips its turn.
- **Safety**: a patrol marks 8 m tiles as it passes, and the mark fades over `patrolFade` ticks. Posts and
  towers cover a radius, and a known lair nearby lowers safety. Homes get `b.safety` every 10 s; manors need
  it, raids avoid it, and the Views tab shows it.
- **Towers**: crewed towers take a guard from the barracks as crew. Magic towers need no crew and never run
  out. The shield dome wraps `sim.damage` so damage inside it drains the dome first, and it keeps fire out
  through `sim.shielded`.
- **Monsters** go for what their `wants` says: people, carts, stores, roofs, walls or the keep. Undead come
  out of graveyards at night and wear away at dawn.
- **Lairs** are generated from the macro map, found by the same scanning as nodes, and send a group on their
  own clock while a town is within 700 m (scaled by the Monsters setting).
- **Raids**: strength = (population / 20 + gold / 400) × the Raids setting. The raid is announced `warn`
  seconds ahead with the target named, and aimed at `weakestPoint()`: outskirts, a far mine, an outpost, a
  store with little safety.
- **Defeat**: a town is lost only when its keep is not standing AND nobody is left. Ruins stay. With no town
  left the page goes back to the landing step.

**Page** (`js/features/military.js`): the Army tab (garrison per town, plant / move / clear attack flags;
tapping a flag or a lair has the same buttons), Info → Military (threat meter, recent attacks), units with
health bars — every enemy has a red outline and cap, and a red marker zoomed out — guards wear a blue sash,
shots, shield domes, lair markers, flags with their circle and gathering point, a raid banner (tap it to fly
there), and dropping to 1x on attack (a setting).

## Rivals (M8)

**`js/sim/rivals.js`** places rivals once you have landed: good land at least a quarter of the world away,
apart from each other, with stances shuffled from `[enemy, ally, neutral, enemy]`.

- **Rival towns are ledgers** (population, gold, army) **drawn as real cells** in the kingdom's style: a keep,
  then rings of houses stamped as the population grows, and up to 4 towns.
- **Opinion** runs −100..+100: ≥ 40 is an ally, ≤ −40 an enemy. Changes:
  - gifts raise it (gold / 5);
  - each finished caravan raises it by 2;
  - paying tribute raises it by 12, refusing lowers it by 20, ignoring a demand by 15;
  - your towns within 300 m lower it by 3 a day;
  - a power on their land lowers it by 25 (from `powers.js`).
- **Enemies** march every 2.5–4.5 days through `military.addUnit` (soldiers, sappers, a catapult once 8+),
  with a warning banner.
- **Allies** send caravans that really walk the path. A caravan sells what you set above what you keep and
  buys what you ask for, priced from `PRICES`. Allies also get a dirt road laid to your nearest town.
- **Parked:** rivals as full cell-level towns running the player's town system with their own stock. The
  town system's stock is kingdom-wide today.

Page (`js/features/rivals.js`): Info → Kingdoms (stance, opinion bar, Gift, Pay / Refuse, Show), Info →
Market, caravans, and rival town markers when zoomed out.

## Big cities (M11) and progress (M12)

**New towns.** A finished `town_hall` (Build → Services) far from every keep founds a town and moves up to 6
idle settlers there. An outpost that has a road all the way home (≥ 85%), safety ≥ 0.4 and a kingdom of 60+
people grows a town hall beside itself (`hamlets()` in town.js).

**Commuters.** `assignJobs` lets idle people from towns joined by a passenger line (`sim.trains.linkedTowns`)
fill open jobs.

**Far towns.** A town whose chunks are not in focus runs every 4th tick, and its people walk 4 steps and work
4× at once. The results are the same and the cost is a quarter. A test checks a far town still grows.

**Path cost.** `nav.findLong` remembers tile costs for 1200 ticks. Every search is capped, and a person or unit
whose search failed waits before trying the same target again. A brute's fallback straight walk never steps
into a solid cell. A six-day run with fires and raids went from minutes per day to about 1.6 ms a tick at
~200 people.

**Globe marks** (`globeMarks` in main.js) are drawn in screen pixels, projected with the inverse of the globe
shader: towns sized by population, kingdom borders, night lights on the dark side, routes and train stations,
armies. Each has its own toggle in the Views tab. The globe's sun follows the clock, so the middle of the screen
has the sim's time of day.

**Progress** (`js/sim/progress.js`, `data/progress.json`):

- Population milestones (50 … 10,000) put a chest of gold and goods in the keep and earn a landmark. A
  landmark is placed from Build → Landmarks through `landmark.place` and can't be built any other way.
- Achievements are events. The page keeps them in localStorage (`stoneward.achievements`), so they carry over
  to every world and to the cloud.

**Unlocks** (`js/sim/unlock.js`, `data/research.json`, `data/tiers.json`). `sim.unlocked(id)` is the ONE check
every build, hire, wall tier, road tier, power, rail, station, train and vehicle path asks. `unlockEverything`
is on (owner), and `tests/progress.test.mjs` proves both that every path asks and that gating works when it is
turned off.

**Extras** (`js/features/extras.js`, `sound.js`, `progress.js`):

- The ! report with a picture is sent to the LAN inbox or games.radgh.com and retried when unsent.
- Cloud saves cover achievements, settings and worlds under ~900 KB. Worlds go to localStorage
  `stoneward.slot.N` and come back into IndexedDB on restore.
- Gamepad menus: d-pad / A / B / Start.
- The account button on the title.
- Sound comes from `sfx/` ids, with an ambience bed for town, night, attack or wind.
- Generated music beds change for day, night and attack.

## Play-test 3: wards, flags that reinforce, street plan (2026-11-04)

Owner: "the command flag system… was almost useless against a raid, they just died easily and no more troops went
out… bandits were destroying my farms before I had a chance to react… make it so a percentage of townfolk are
staffed as guards who wander around… [the town] started spamming roads… they should follow a sensible hierarchy…
long term cities should be sprawling and interesting." And: "make the guard post summon guards to be stationed nearby".

**Wards** (`js/sim/military.js` `computeWards` / `assignWards` / `wardThreat`). About 1 in 10 people serve as guards
(`garrison.per`). A town's buildings are grouped into wards: clusters `garrison.wardGap` (70) m apart, farms, mines,
docks and outposts included, so the far edge is covered too. Each street guard gets one, busiest wards first. It
walks the streets of its ward (`town.streetPoint(town, rng, area)`) and fights what comes there. It only helps next
door when fewer than two guards are already on that enemy and it is within `wardHelp` (130) m, so nobody walks
across the map. Wards are worked out again every 30 s. **Guard posts** (`kinds.guard_post.post = 3`) add 3 guards to
the town's count and are wards of their own, filled first. Attack flags can still call on those guards.

**At war** (`atWar(town)`: a flag of this town is up, or enemies are in its wards) the town calls up a levy of
`garrison.levy` (8%) of its people on top of its guards and recruits `warRecruit` (4) times faster. **Flags** keep
only `keepHome` (20%) at home. The first band is picked once and gathers before marching. After it marches, anyone
who falls is replaced: up to 4 fresh guards every 3 s go straight to the flag (`u.direct`). The Army tab shows
"N sent as help".

**Bandits further out.** A lair or bandit camp closer than `safety.lairGap` (240) m to a town lies quiet. It can
still be found and burned with a flag. Raids now start `raids.spawnDist` (200) m from their target (was 110), with
60 s of warning (was 45).

**Street plan** (`js/sim/town/town.js`, "the street plan"). Every road run on `S.roads` now records
`[x0, y0, x1, y1, tier, cls, tick, width]`, where `cls` is one of:
- `main`: the keep's cross. These avenues keep growing outward as the town spreads, bending 45° round whatever is
  in the way. `paveMain` paves them with gravel from 60 people, then stone from 160, as stone allows.
- `street`: side streets one `block` (28 m) apart, off an avenue or another street, and streets carrying on from
  their ends.
- `country`: long roads, and roads between kingdoms.
- `player`: roads the player drew.

`growRoads` lays at most one road every `roadEvery` (600) ticks, and only when a small building (≤ 64 cells) found
no room. Big fields no longer push roads out. `roadOk` refuses a road that lies more than 25% on top of another, or
that runs alongside one closer than `streetGap` (11) m. `tidyRoads` (every minute) turns town streets older than 4
minutes, with nothing built beside them, back to grass, 24 at a time. Cells another road still uses are kept.
`main`, `country` and `player` roads are never removed. Old saves: avenues are found by walking out from the keep
(`ensureAvenues`). Their unclassed streets get tidied the same way, which is what cleans up a road-spammed town.
The town looks for room up to 420 m out (was 300), so a big city sprawls along its avenues and country roads.
`tools/road-map.mjs <out.ppm> [days] [seed]` grows a town headless and draws its roads.

**Blocks, not ribbons.** Houses fill every spot along a road first, so with only the rules above a town became a
cross of avenues lined with houses and almost no side streets. `onAvenueWay` now keeps two kinds of space free of
buildings: a strip 3 m either side of every future side street (one `block` apart along every straight avenue and
street, out to 30 m, both sides, from `corridors()`), and the next 30 m in front of each living avenue. A test
town of seed 7 after 4 days: old code 287 people, 149 buildings, 102 overlapping road runs. New code 300 people,
193 buildings, 17 avenue + 13 street + 7 country runs, laid out as radial avenues with blocks between them.

**Two guard bugs found on the way.** (1) A trip over 50 m uses a coarse route of waypoints (`nav.findLong`), and
the straight walk between two waypoints can catch on a building's corner. The guard used to drop the route and
ask again, got the same corner, and stood at the corner of the keep forever. Now it walks a fine path to the
next waypoint (`u.finePi`). (2) A patrol fallback could pick a spot inside a building. `openNear` only picks
walkable ground, and `unstick` moves a guard found inside something solid out to the nearest open cell.

## Info cards (2026-11-04)

Owner: "update all the build and other menus like Outpost to have hover tooltips that explain what it is and does, and any
of its calculable stats listed… on mobile you should be able to click a button to read info about it."

- `data/about.json` — the WORDS: one or two plain sentences per building kind (`kinds`), per Lines/Transport tool
  (`tools`: roads, walls, firebreak, track, settler, flag) and the cover names. `tests/about.test.mjs` fails if a building
  has no row.
- `js/ui/about.js` (pure) — the NUMBERS, worked out from the same data the sim reads: cost, build work, size, people housed,
  home level + tax + needs (from `homes.needs`), workers, makes per trip and per minute, craft in → out, work area, crop
  regrow, storage, service reach, beauty, faith (rate/reach/cap), scan range, guard limit, tower damage/range/dps/chain/
  pierce/splash/shield, wall strength, power cost/radius/damage per size. Move a knob in the data and the card moves.
- `js/ui/infotip.js` — `withInfo(button, 'kind:<id>' | 'tool:<id>' | 'power:<id>:<size>')`. Where the device can hover
  (`(hover: hover) and (pointer: fine)`) the shared tooltip engine (`shared/tooltip.js`) shows the card; every button
  also gets a small "i" (`.info-btn`, inside the button, its press does not choose the item) that opens the card in the
  sheet — at the TOP on a phone, because the open dock covers the bottom. Features call it as `ui.info(el, spec)`.
- Settings: Sound and Music are 0–100 sliders (`prefs.soundVol` / `prefs.musicVol`, 0 = off, 70 = the old level;
  an old `sound: false` reads as 0). `js/features/sound.js` `applyVolumes()` sets the sound library's master volume and
  scales the music beds.

## Files

- `js/planet/`: `noise.js` (a copy of `worldgen/js/noise.js`, made to be copied), `macro.js`, `biomes.js`,
  `chunkgen.js`, `chunks.js`
- `js/sim/`: `materials.js` (Kindlewild's compiler plus `tall`) (seeded random lives in `js/planet/noise.js`)
- `js/render/`: `paint.js`, `gl.js`
- `js/client/`: `link.js` (talks to the worker), `stream.js` (decides which chunks to request and turns them into
  textures)
- `js/ui/`: `camera.js`, `names.js` (Name Forge kingdom and town names; "ember", "veil" and "muster" are rerolled)
- `js/main.js`: title, new-world settings, HUD, dock tabs, menu, loop
- `data/`: `worldsettings.json` (sizes and New World choices), `materials.json` (Kindlewild's table plus Stoneward
  rows and `tall`), `changelog.json`
- `tools/`: `macro-png.mjs`, `chunk-png.mjs`, `shots.mjs`

**Wildfires far from people** (`js/sim/wildfire.js`, PURE, play-test 1): a burning cell in a chunk with no town, building or rival town within 220 m is *wild*. It spreads at 0.55× heat and burns out twice as fast (cells.js `burn()` asks `sim.wildfire.isWild(c)`). A big wild fire (more than 120 burning cells on average over 5 s) brings natural Call Rain over its middle. Fires near towns are untouched.

**Page helpers added in play-test 1**: `ui.pager(items, key, 'grid'|'list', maxRows)` and `ui.pagerOf(cards, key, per)` page any list (panels never scroll); `hooks.screen` draws quads in screen pixels on the flat map (enemy arrows); `ui.report()` opens the report box (from ☰); `ui.closeMenu()` closes the menu and restores the speed it paused. "Lost" buildings count only the cells their blueprint builds (`solidCells()` in town.js). See docs/PLAN.md §7.


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

**Stoneward** (2026-11-03 →): a medieval castle-era city sim on a whole generated planet with Kindlewild-style pixel physics. The map wraps east-west (3D noise on a cylinder, so there is no seam) and zooms smoothly out to a globe; six sizes (1-32 km around, 1 cell = 1 m); ice caps at the poles. Macro map (`js/planet/macro.js`, 32 m cells) + 64x64 chunks generated on demand, same every time (`chunkgen.js`), only edited chunks saved (`chunks.js`); cells carry `tall` for the 3/4 view (columns stand UP; rows and chunks painted north to south = occlusion, `js/render/paint.js`); WebGL2 macro + chunk + globe passes (`js/render/gl.js`); sim in a Worker. Owner design from ~18 question rounds is `docs/PLAN.md` §1 (towns grow themselves, Sightseer-style nodes → road routes → global stock, guards + patrol safety, drawn walls with per-cell HP, rivals with rolled stances, 7 powers x 3 sizes paid in faith, trains). Read README + docs/PLAN.md first

**Status / key files:** M0 2026-11-03
