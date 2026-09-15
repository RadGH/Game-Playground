# Frontier Foundry — design

*Claude-facing design note. The UI agent codes against the API at the bottom; everything above it is
why the API looks the way it does.*

Inspirations (named here only, never in the game's own text or data — rule 9 in `../../CLAUDE.md`):
Project 5 Sightseer for the scan → mine → refine → drive loop, Factorio/Space Age for automation
pressure, occasional attacks and per-planet resources and structure variants, and Warcraft 3 for
"place an outline, units walk over and build it" plus tower-defence waves.

---

## 1. The loop

One planet is one run of this loop. The whole game is that loop, four or five times, on worlds that
each break one of your habits.

```
land ──▶ scan ──▶ mine ──▶ haul ──▶ refine ──▶ build ──▶ research ──▶ explore
  ▲                                                          │            │
  │                                                          ▼            ▼
  └──────── next planet ◀── launch ◀── defend waves ◀── expand the base ◀─┘
```

1. **Land.** The pod comes down on one local tile of the planet's world map. It is the headquarters,
   the first store, 120 kW of power, a workbench that can make plate, gears and wire, and four
   builders. Lose it and the run is over.
2. **Scan.** Every resource patch starts invisible. The pod's landing scan reveals a ring around
   itself; after that a **scanner tower** (cheap, sees only what is underground) or a **radar**
   (sees the surface too) sweeps for more. This is the thing that makes the first twenty minutes a
   decision rather than a queue: you are choosing where to look.
3. **Mine.** A drill must sit on a scanned patch and claims it. Patches are finite, so a base that
   stands still dies; a **deep bore** follows the seam and never empties, but it is slow and late.
   A bore can also be sunk on a patch the drills have already emptied, which is what stops a world's
   chains ending when its last seam of something does.
4. **Haul.** Machines and stores form **store networks** (see §3). Inside one network everything is
   shared for free; outside it you need a **delivery route** — source store, destination store, a
   resource and a truck, which then drives the cheapest path forever. Roads make the trip shorter,
   a bigger truck makes it fatter, a loading dock makes the stops quicker.
5. **Refine.** Ore → ingot → plate/gear/wire → circuits → logic cores → alloy → rocket sections.
   Fluids and gases branch off the same tree and need their own vehicles and tanks.
6. **Build.** You place an **outline**; builders walk to it and work on it; it goes up over seconds
   or minutes. Materials leave the stores when the outline is placed, so a cancelled build refunds.
7. **Research.** Labs eat science packs. Packs are made from what your factory already makes, so the
   research rate *is* the factory's throughput — there is no separate currency.
8. **Explore.** Scouts and skimmers survey neighbouring regions of the world map: intel on what is
   out there, plus a supply cache. (Scope line: one buildable local map per planet — see §11.)
9. **Defend.** Threat rises with smoke and noise. The first attack comes after about twelve minutes
   or when threat crosses a line, whichever is first; after that on a shrinking clock. Walls, gates,
   six kinds of turret, slow fields, shields and repair bays. Every fifth wave comes from two sides.
10. **Launch.** Satellites open the map, probes tell you what the next world is made of, and six
    rocket sections plus fuel and oxidizer make a rocket. Whatever is in the hold lands with you.
11. **Next planet.** New archetype, new resources, new hazards, new enemies — and only the research
    an **archive** was holding comes with you.

### What makes it fun

- **The map is the puzzle.** Nothing is where you want it. The pod lands with iron, coal, copper and
  stone in arm's reach and everything else scattered, so the first hour is comfortable and the
  second hour is a logistics problem you built for yourself.
- **Every jam is legible.** A machine is starved, or its output is full, or its grid browned out.
  Those three states are on the entity and in the notifications, so the player always knows which.
- **The clock is your own smoke.** Threat is earned by the things you chose to build. A quiet solar
  base is attacked far less than a coal one. That is a real decision with a real cost.
- **Planets rewrite the recipe book.** A frozen world has no liquid water and gives you cryonite,
  which makes alloy plate for a third of the titanium. A volcanic world hands you a furnace that
  smelts at twice the speed. You never build the same base twice.
- **The rocket is a goodbye.** Loading the hold means choosing what a hundred hours of factory was
  actually for. The archive question — carry research or carry cargo — is the best decision in the
  game.

---

## 2. Numbers that matter

| Thing | Value | Why |
|---|---|---|
| Tick | 1 game second, fixed | `tick(dt)` breaks any dt into one-second steps, so the sim is repeatable |
| Local map | a `chunks × chunks` block of 96-tile worldgen cells | the interface runs 5 (480 × 480), the balance sim 3, the engine tests 1 |
| Buildable ground | slope averaged over a tile and its four neighbours ≤ 0.82, no cliff over 1.15 | judging each tile alone left 190 legal 4 × 4 spots on a whole 96-tile chunk |
| Landing pod | 8000 hp, 120 kW, 1500 store, link radius 34, 22 dps | the hub; it can defend itself a little but not survive a wave alone |
| Drill mk1 / mk2 / mk3 | 1.3 / 2.9 / 5.4 per second, 20 / 95 / 210 kW | each tier roughly doubles output and more than doubles the power bill |
| Deep bore | 2.6 per second, 320 kW, never empties | the answer to a seam running dry, which on a six-hour run it will |
| Ore patch | ~40 000 × richness (0.6–1.5) | a mk1 drill empties an average patch in about 8 hours |
| Starter patches | iron, coal, copper, stone at 5–10 tiles | placed by `ensureStarterNodes`, which will never take the last patch of anything else to make one |
| Smelter | 1 ingot per 2.4 s from 2 ore + 1 coal | one drill feeds roughly one smelter |
| Grace period | easy 1500 s · normal 900 s · hard 540 s | or the threat threshold (900 / 620 / 400), whichever comes first |
| Wave interval | 600 s, −6 s per wave, floor 450 s | every 5th is a surge (×1.35 budget, two fronts); every 10th can carry a boss |
| Wave budget | `5 × 1.075^(n−1) + threat × 0.003`, capped at 520 | a swarmer costs 1 threat point, a hull breaker 14, a rift maw 45 |
| Boss waves | every 10th, and the rift maw only enters the tables at wave 30 | a 26-armour boss at wave 20 is unanswerable with the guns a base has by then |
| Armour | flat: damage per second minus armour, floor 10 % | a watchtower is nearly useless against a hull breaker, which is the point — but it *can* shoot at something flying, and so can a gun turret |
| Store share | one resource ≤ 25 % of a store, raw materials ≤ 50 % together | stops three drills silting the whole base up |
| Rocket | 6 sections + 40 rocket fuel + 30 oxidizer | a section is 10 alloy plate, 4 superalloy, 2 control units, a heat shield and 10 fuel |
| Victory | beacons on 3 planets **and** a 6-module orbital station | `beaconsToWin` is a constructor option |

Difficulty multiplies wave budget, enemy hp and dps, build speed, extraction and research
(`DIFFICULTY` in `js/rules.js`).

---

## 3. Systems

### Storage pools — the rule the whole base is shaped by

Two stores whose link ranges overlap relay to each other, exactly the way two power poles form one
grid. A machine joins the pool of any store that reaches it and can then draw from and deliver to
**every** store in that pool with no truck at all. The pod's own radius is 34 tiles, so a compact
starting base is one pool; an outpost across the map is its own pool and needs a route.

Two guards on top of it, both learned the hard way in the sim:

- **A store keeps room for everything.** One resource may fill at most 25 % of a store, and raw
  materials at most 50 % together. Silos, fluid tanks and gas tanks hold one class of thing anyway,
  so they are exempt. Without this, three drills fill every crate with ore, the smelters have
  nowhere to put ingots, and the factory deadlocks on the eight plate it can no longer make.
- **A machine will take from a neighbour's output hopper.** A machine that finished a craft with
  nowhere to put it holds the goods in its own buffer; anything else in the same pool may take them.
  Otherwise a generator sits dark next to a drill that is holding all the coal.

### Power

Poles, substations, generators and the pod each cover a radius; overlapping coverage makes one
network (union-find, recomputed when anything is built or destroyed). A consumer joins the network
of any supplier that covers it; a consumer covered by nothing draws nothing and does nothing.

Per network, per second: generators declare what they *could* make (weather, daylight, and whether
they can see fuel and coolant), the network's demand is the consumers plus whatever the batteries
can absorb, and every generator runs at that **duty cycle** — so a base with spare capacity does not
burn its coal overnight. Batteries take the surplus and give it back.

**Load shedding.** When supply falls short, extraction, defence, scanning, power and base buildings
keep their power and the factory is shed first. Without this a brownout is a death spiral: the coal
drill slows, the generator starves, the grid falls further.

### Production

A machine has a recipe, a small input/output buffer and a speed multiplier. Each tick it pulls the
whole input set at once (from its own buffer, then its pool), counts down, then pushes the outputs.
If the outputs do not fit it sets `blocked` and holds — it never destroys goods. Idle machines
record `starvedFor` so the UI can say *why*.

Extraction is separate: drills, pumps, harvesters and the quarry take from a map node (or, for the
quarry and the biomass harvester, from the ground itself) straight into the pool.

### Fog and scanning

Two bits per tile: ever seen, and visible now. Vision comes from the pod, any structure with a
vision radius, units and vehicles. **Nodes are separate** — they are revealed only by a scan, from
the pod's landing sweep, a scanner tower (underground only, cheap), a radar, or a satellite (all of
it, at once). This is why a scanner tower is the highest-value early building in the game.

### Logistics

A route is `{ from, to, resource, vehicle }`. On creation it A*s the cheapest path over the terrain
(roads cheap, water impassable unless bridged, walls impassable) and stores the path and its time.
The truck then loops: drive, load, drive, unload. Trucks burn fuel from the pool at either end; air
vehicles ignore terrain, water and roads entirely; hover trucks draw grid power instead of fuel.
Changing roads or walls marks every route for replanning. `estimateTrip` returns trip time, cycle
time and throughput so the UI can show what a route is worth before it is built.

### Combat

**Threat** is earned per second from pollution (crafting), noise (drills, turret fire) and every
nest left standing, and decays when you are quiet. The first wave comes at the grace timer or the
threat threshold, whichever is first.

A wave picks a target structure (weighted by the attackers' preferences and distance, with a bias
towards the pod), then one Dijkstra **flow field** is computed to that target and shared by every
enemy in the wave — far cheaper than an A* each. Walls are expensive to walk through rather than
impossible, so enemies head for gaps and only chew through a wall when it is genuinely in the way.
Flyers ignore all of it and go straight for whatever they prefer; void motes phase through walls.

Flyers are the one thing a gun line cannot ignore, so the two ballistic turrets — the watchtower and
the gun turret — can be pointed upwards; flame turrets and tesla coils are ground-only, and the
missile battery stays the specialist with 28 tiles of reach. Before this, nothing below a missile
battery could touch a pyre moth, and pyre moths arrive at wave 8.

Turrets pick the nearest target in range (respecting minimum range for artillery, and `hitsAir`),
apply dps × dt × power satisfaction, chain or splash where the definition says so, and add noise.
Shield generators soak damage for everything under the bubble and refill between waves; repair bays
patch walls and turrets using iron plate from the pool; artillery shells nests before they hatch.

### Planet hazards

Each archetype carries hazard tags that fire as timed weather: storms damage everything outdoors
(and double wind output, and may bring a wave in with them), deep cold damages unpowered machines,
radiation hurts crew, ash fall halves solar. All of them are notifications with a start and an end.

### Space

- **Satellite** — build one, put it up from a launcher or the pad: the whole map and every node is
  revealed, and the satellite uplink can start making orbital packs.
- **Probe** — fired at another planet, arrives 900 s later and reports its archetype, resources,
  rare elements and hazards. An observatory does a weaker version of this for free.
- **Rocket** — 6 sections, 40 rocket fuel, 30 oxidizer on a launch pad. `assembleRocket()` stacks
  it, `launchRocket({ to, cargo, crew })` returns a **transfer**: the hold, the crew, the beacons and
  station modules so far, and the research — *all* of it if an archive is standing, otherwise only
  the landing kit. `Game.land(transfer)` starts the next planet from it.
- **Orbital station** — six modules lifted by an orbital lift.
- **Beacon** — a finished beacon claims the planet. Claims on `beaconsToWin` planets plus a complete
  station wins the run.

---

## 4. Planet progression

The engine does not own planets. It takes a provider (`{ list(), get(id), generateMap(planet) }`) so
the universe project can supply real ones. `js/planets.js` is a working stand-in and documents the
contract:

```js
planet = { id, name, archetype, biomeMode, resources: [resourceId], rareElements: [resourceId],
           hazards: [tag], gravity, dayLength, seed, tier }
generatePlanetMap(planet) -> a worldgen World
```

**Using the real universe project.** `js/planets.js` also ships an adapter, because the universe
project describes a planet slightly differently: its resources and rare elements are objects with
camelCase keys, its day length is in hours, and it has fourteen archetypes to our ten.
`fromUniversePlanet(up, resourceTable)` maps one onto the other and `universePlanets(systems,
resourceTable, { generateMap })` builds a provider from universe systems — the universe decides the
archetype, the rare elements, the hazards, the gravity and the day, and we roll what is actually in
the ground. All twelve of its rare elements map onto ours: the last four — helion gas, nullstone,
emberlace and brinepearl — got their own resource, building, recipe and research node in the
2026-09-14 pass, so nothing is dropped any more.

Ten archetypes, each with its own worldgen knobs, hazards, enemies and rare element:

| Archetype | Feels like | Rare element | Its building |
|---|---|---|---|
| Temperate | the tutorial | ferrovine | Ferrovine Loom — ten wire from two vine, no copper |
| Arid | water and growth are the problem | glimmer salt, voltaic ore, emberlace | Glimmer Still — three lenses a pass |
| Frozen | no liquid water at all; ice harvesters | cryonite, nullstone, brinepearl | Cryo Forge — alloy plate for a third of the titanium |
| Volcanic | heat, ash fall, magma power | pyrocrystal, emberlace, helion gas | Plasma Refinery — smelts at twice the speed |
| Toxic | corrosion, spores, things that hurt after the fight | xenoplasm, helion gas | Bio Vat — grows plate, heals itself |
| Verdant | everything grows back, including the enemies | ferrovine, xenoplasm, brinepearl | both of the above |
| Barren | almost nothing in the ground; atmosphere instead | umbral shale, aetherite, nullstone, emberlace | Void Condenser — helium-3 from nothing |
| Shattered | storms, flyers, broken terrain | aetherite, voltaic ore, umbral shale, nullstone | Resonance Mill — four logic cores a pass |
| Oceanic | islands, bridges, things coming out of the water | glimmer salt, brinepearl | Glimmer Still |
| Gas-shrouded | low light, high pressure, sky leeches | voltaic ore, helion gas | Storm Anchor — 260 kW, ×2.5 in a storm |

The four late elements each carry a building of their own: a **Helion Still** burns helion gas
straight into rocket fuel, a **Null Forge** cold-works alloys inside the dead field nullstone makes,
an **Emberlace Loom** weaves heat shielding, and a **Pearl Press** turns brinepearl into a tonic that
shelters the crew from radiation and filters spores. A **Voltaic Coil Works** does the same job for
voltaic ore. Each is gated behind a research node that only appears on a world carrying the element.

Every planet is guaranteed iron, copper, stone and coal, so no landing is a dead run. Everything
else is rolled from the resource table's `found.archetypes` and `found.rarity`.

A run is meant to go: temperate (learn it) → a harsh one (arid or frozen: one input goes away) →
a rich one (volcanic or shattered: the rare element changes your build) → endgame (station and
beacons). Enemies get harder per planet because wave budget scales with wave number, and you start
each planet at wave 0 with whatever defence you could afford to bring.

---

## 5. Endgame

1. **Rocketry** unlocks the pad and the assembly gantry. A section costs 10 alloy plate, 4
   superalloy, 2 control units, a heat shield and 10 rocket fuel — which pulls in titanium,
   tungsten, platinum, gold, electrolysis and re-entry shielding. Six of them is a launch.
2. **Satellites** open the map and the last research tier. **Probes** tell you where to go.
3. **Crewed rocket** — the same launch with crew in the hold; the crew are the builders on the next
   world.
4. **Orbital station** — an orbital lift plus six station modules. Once it turns, cargo goes up
   without a rocket, which is what makes claiming several worlds affordable.
5. **Beacon victory** — a Frontier Beacon on `beaconsToWin` planets (3 by default) with the station
   complete ends the run. `checkVictory` fires the `victory` event.

Defeat is one thing only: the landing pod is destroyed.

---

## 6. Data files

All original names. `data/*.json`, loaded and indexed by `js/data.js`.

| File | Holds | Count |
|---|---|---|
| `resources.json` | every material: kind, phase, colour, tags, value, stack, transport, where it is found | 81 |
| `structures.json` | everything buildable: size, cost, build time, hp, power, recipes, ranges, storage, unlock, variant gating | 105 |
| `recipes.json` | inputs, outputs, time, power, which machines can run it | 71 |
| `vehicles.json` | capacity, speed, off-road penalty, fuel, garages, upgrade tiers, per-element upgrades | 10 |
| `units.json` | crew and enemies, plus `waveTables` and `nestTables` for all ten archetypes | 25 |
| `tech.json` | the research tree: work, pack cost, requirements, unlocks, effects | 86 |
| `quests.json` | a 9-step tutorial chain, a 4-step side chain and 31 standalone objectives, with rewards and text | 44 |
| `waves.json` | grace, threat rates, intervals, budget, escalation, spawning, targeting | — |
| `balance.json` | every number a designer changes: patch sizes, costs, build and craft times, research work, the wave clock, the hazard table, the bot's knobs | — |
| `notifications.json` | every message the engine can raise, with importance and template | 70 |

Ids match the icon set (`assets/data/icons/foundry/`); where a data id has no icon of its own it
carries an `icon` field naming the one to use.

---

## 7. Engine files

| File | What it owns |
|---|---|
| `js/game.js` | `Game`: state, the tick order, notifications, events, quests, hazards, region surveys, save/load |
| `js/data.js` | loads and indexes the JSON (works in node and the browser) |
| `js/rules.js` | every formula and constant: difficulty, speeds, craft time, damage, threat, wave budget, daylight |
| `js/map.js` | the local grid from worldgen, node placement, scanning, cost fields, A*, flow fields, landing sites |
| `js/fog.js` | explored/visible layers, vision sources, run-length packing for saves |
| `js/build.js` | placement rules, cost payment, ghosts, builders, demolition |
| `js/production.js` | storage pools, push/pull, the power grid with duty cycling and load shedding, extraction, crafting, repair |
| `js/logistics.js` | routes, vehicles, trip estimates, replanning |
| `js/research.js` | labs, pack draw, unlocks |
| `js/combat.js` | threat, wave composition and spawning, flow-field movement, turrets, guards, nests |
| `js/space.js` | satellites, probes, the rocket, the station, beacons, victory |
| `js/planets.js` | the planet contract and a local stand-in (10 archetypes, system generation) |
| `js/ai.js` | the sim bot: an ordered build programme plus upkeep |

Tick order, once a second: builders → power → extraction → production → logistics → research →
repair → shields → threat → combat → artillery → space; scanners every 4 s, vision and quests every
5 s, regrowth, hazards and surveys every 10 s, a stats snapshot every minute.

---

## 8. The API the UI codes against

Every method is on the `Game` instance unless it says otherwise. Nothing here touches the DOM.

### Making a game

| Call | What it does |
|---|---|
| `await Game.create({ seed, difficulty, planet, planets, world, data, size, site, nests, crew, cargo, research, beaconsToWin })` | loads the data if needed and starts a run |
| `Game.createSync(opts)` | same, when you already have the data bundle |
| `Game.land(transfer, { data, planets, world, size })` | starts the next planet from a rocket's transfer descriptor |
| `Game.fromJSON(json, { data, planets, world })` | reloads a save |
| `await loadData(baseUrl?)` | the data bundle (`js/data.js`) |
| `localPlanets(resources, seed, count)` | the stand-in planet provider |

### Running it

| Call | What it does |
|---|---|
| `tick(dt)` | advances the world; dt is game seconds, broken into fixed one-second steps |
| `step(1)` | one fixed second (call `tick` instead unless you know why) |
| `time`, `ticks`, `daylight`, `isNight` | the clock |
| `stats` | `{ built, lost, crafted, hauled, kills, crewLost, wavesCleared, nestsKilled, damageDealt, damageTaken, produced{}, power{gen,use,satisfaction}, history[] }` |

### Looking at the world

| Call | What it does |
|---|---|
| `map` | the local grid: `width/height`, `elevation`, `biome`, `water`, `buildable`, `moveCost`, `road`, `occupied`, `forest`, `nodes[]`, `nodeAt` |
| `fog` | `{ explored, visible }`, one byte per tile |
| `world`, `worldCell`, `planet` | the worldgen world, which cell you landed on, and the planet record |
| `structures`, `units`, `vehicles`, `enemies`, `nests`, `routes`, `waves`, `networks` | the live entity lists |
| `byId(id)`, `hq()`, `nodeById(id)` | lookups |
| `inventory()` | everything in every store, added up |
| `available(resource)` | how much of one resource the base can pay with |
| `buildable()` | the structures the build screen should offer right now |
| `isUnlocked(id)` | is this structure / recipe / vehicle / unit researched |
| `planetHas(elementId)` | does this world have that element |
| `crewCap()`, `crewUsed()` | head count and how much of it is spent |
| `knownRegions()` | regions of the world map you could send scouts to |

### Doing things

| Call | What it does |
|---|---|
| `scan(x, y, r)` | sweep for hidden nodes; returns the ones it found |
| `canPlace(type, x, y, opts)` | `{ ok }` or `{ ok: false, reason }` — use it for the placement ghost |
| `place(type, x, y, opts)` | pay for it and drop an outline; `{ ok, structure }` |
| `cancelBuild(id)` | cancel an outline and get everything back |
| `removeStructure(id, { refund })` | demolish |
| `setRecipe(id, recipeId)` | point a machine at a recipe |
| `toggle(id, on?)` | switch a machine on or off |
| `addRoute({ from, to, resource, vehicle })` | start a delivery run; `{ ok, route }` or a reason |
| `removeRoute(id)` | stop one and scrap the truck |
| `estimateTrip(routeOrId)` | `{ tripTime, cycleTime, throughput, capacity, vehicle }` |
| `startResearch(id)` / `canResearch(id)` / `availableTechs()` | the research screen |
| `spawnUnit(type, x, y)` | put a builder, scout, guard or sentinel on the map |
| `exploreRegion(regionId)` | send scouts; `{ ok, eta }` |
| `launchSatellite()` | put a satellite up |
| `launchProbe(planetId)` | fire a probe at another world |
| `rocketStatus()` | `{ parts, needed, fuel, oxidizer, hasPad, ready }` |
| `assembleRocket()` | stack the sections on the pad |
| `launchRocket({ to, cargo, crew })` | leave; `{ ok, transfer }` |
| `stationStatus()` / `liftStationModule()` | the orbital station |
| `toJSON()` | a plain, serialisable save |

### Messages and events

| Call | What it does |
|---|---|
| `notifications` | every message so far: `{ id, type, text, at:{x,y}, importance 1–5, icon, jumpTo, time, seen }` |
| `unread(minImportance)` | the unseen ones, most important first |
| `markSeen(id?)` | mark one, or all of them |
| `notify(type, payload)` | raise one yourself (templates live in `notifications.json`) |
| `on(event, fn)` / `off(event, fn)` | subscribe; `on('*', fn)` gets `{ type, payload }` for everything |

Events: `landed` · `structure:done` · `structure:removed` · `craft` · `scan` · `route:created` ·
`research:started` · `research:done` · `quest:done` · `wave:started` · `wave:cleared` ·
`enemy:killed` · `nest:cleared` · `hazard` · `hazard:over` · `region:explored` · `space:satellite` ·
`space:probe` · `space:probe-arrived` · `space:rocket-ready` · `space:launched` · `space:station` ·
`space:beacon` · `victory` · `defeat` · `notify`.

### Entity shapes the UI will read

```js
structure = { id, type, def, x, y, w, h, state: 'ghost'|'building'|'done', progress, hp, maxHp,
              inv: { resource: n }, cap, recipe, craft, crafted, powered: 0..1, enabled,
              net, pool, links: [storeId], nodeId, blocked, starvedFor, busy, shield, charge }
node      = { id, resource, kind, x, y, radius, amount, initial, richness, scanned, depleted, claimedBy }
route     = { id, from, to, resource, vehicle, path: [tileIndex], tripTime, state, progress,
              enabled, delivered, trips, waiting }
vehicle   = { id, type, def, x, y, hp, alive, route, cargo, cargoRes, tier, fuel }
enemy     = { id, type, def, wave, x, y, hp, maxHp, armor, dps, speed, air, target, slow }
network   = { id, members: [id], gen, use, satisfaction, store, charge }
```

### Rendering hints

- `map.occupied[i]` is the structure id on a tile, or −1.
- `map.road[i]` is the road tier (0–4); `ROAD_SPEED` in `js/map.js` is the multiplier per tier.
- `structure.state === 'ghost'` should draw as an outline, `'building'` with a progress bar from
  `progress / def.buildTime`.
- `structure.blocked` means its output has nowhere to go; `starvedFor` names the missing input;
  `powered < 1` means the grid is short. Those three cover almost every "why has it stopped".
- `notification.jumpTo` is a tile the camera should offer to jump to.

---

## 9. The sim

`tools/sim-foundry.mjs` plays the real engine with the bot and prints resources over time, first
wave timing, structure count, deaths and rocket progress.

```
node prototypes/frontier-foundry/tools/sim-foundry.mjs --hours 8
node prototypes/frontier-foundry/tools/sim-foundry.mjs --seed 12 --hours 12 --planet volcanic --difficulty hard --why
```

`--why` is the useful one: it prints what every machine is waiting for, **supply against demand for
every resource in the bot's plan** (worst ratio first — that row is nearly always the thing the whole
run is stuck behind), which programme step the bot is stuck on, how full each patch is, and the last
important notifications. Nearly every balance bug in this prototype was found by reading those two
tables.

`--chunks N` sets how much map there is (default 3, so 288 × 288). It matters: on a single 96-tile
chunk a four-hundred-building base fills every legal 4 × 4 by hour three and the run simply stops,
which is a property of the sim's map size and not of the game.

---

## 10. Balance knobs

- `data/waves.json` — the whole attack clock in one file.
- `DIFFICULTY` in `js/rules.js` — five multipliers per level.
- `SHARE_PER_RESOURCE` / `RAW_SHARE_TOTAL` in `js/production.js` — how mixed a store stays.
- `PRIORITY` in `js/production.js` — which categories survive a brownout.
- `PLAN`, `DEMANDS`, `RESEARCH_ORDER` and `STOCK_TARGET` in `js/ai.js` — what the bot builds, the
  throughput it aims at, the line it researches, and how much it stockpiles.
- `data/balance.json -> bot` — how far it spreads (`compactRadius`, `maxReach`, `latticeStride`), how
  many stores, scanners, generators, harvesters and turrets it is allowed, `maxPerRecipe`,
  `maxPackRate`, `fuelHeadroom` and `turretsPerWave`. Several of those caps are no longer flat
  numbers, because a cap that is right for a 300-building base is a lost run at 900: turrets grow by
  one per `structuresPerTurret` standing, generators by one per `structuresPerGenerator` past
  `generatorCapFrom`, the store budget scales with the map, and the scanner budget doubles from
  `maxScanners` to `maxScannersHunting` while something the bot has planned for has no scanned patch
  anywhere. `wantBuilders` is how much building crew it keeps alive — nothing used to replace a dead
  builder, and on a hazardous world that is what stops a base — and `maxRoutes` the ceiling on truck
  runs.
- `data/balance.json -> map` — node sizes and how scarce a "scarce" patch is.
- `data/balance.json -> hazards` — what every weather tag does while it runs.

## 11. Balance and the bot

`research/sim-report.md` is the standing record: what the balance sim found, what moved in
`data/balance.json` because of it, and — set out plainly — what the bot still cannot do. Read it
before changing a number in `balance.json`, because most of those numbers are there to fix something
the sim caught.

`tools/sim-matrix.mjs` regenerates it: three worlds crossed with three difficulties, each a real
headless game in its own process.

## 12. Known scope lines

- **One buildable local map per planet.** Regions are explored for intel and a supply cache rather
  than becoming second build sites. A UI that wants two bases can create a second `Game` on another
  world cell; nothing in the engine assumes there is only one.
- **The bot is a test harness, not an opponent.** It plays the opening well and stalls in the
  mid-game; see `research/sim-report.md` §4 for exactly where it gets to and what it still does not
  do.
- **No pipes or belts.** Short-range transfer is the storage pool and long-range is trucks. That was
  deliberate: it keeps the interesting decision (where to put things) and drops the fiddly one.
