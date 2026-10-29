# Lodestar — build plan

Written 2026-10-28. **This file overrides `BRAINSTORM.md` wherever they differ.** The reasons for every cut and
change are in `ROAST.md`. The owner's words are in `OWNER-BRIEF.md`; the last table here maps each of his sentences to
the milestone that delivers it.

Solo browser game, independent project (Radley Sustaire), sandbox. Lives in
`~/claude/playground/prototypes/lodestar/` and follows the playground conventions: no build step, plain ES modules,
standalone `.css`, vendored libraries only (`playground/vendor/`), every number in `data/*.json`, original names only
(playground CLAUDE.md rule 9 and `docs/banned-names.md`).

---

## §0 Rules it never breaks

From the owner's words. A change that breaks one of these is a bug, whatever the reason.

1. **You are the commander in a bunker, not a god above the planet.** The world is only ever seen through the
   Tactical Scope (a sensor screen: pan and zoom, never a free camera). Every menu is a physical machine — screens,
   knobs, switches, buttons, gauges.
2. **Every machine is also a fast control.** A knob turns by drag, mouse wheel, key, gamepad and a tap on its
   labelled detent. A machine is never slower than a plain menu would be.
3. **No unit micromanagement.** You never select a unit and click to move it. Units get standing orders: **Post**,
   **Patrol** or **Response**.
4. **The world is flat.** No terrain height in any rule. Water (shallow/deep) and lava are fixed areas that never flow;
   cliffs are edge lines. Any raised look is lighting only.
5. **One wall, one road.** No wall tiers, no road tiers, no per-piece upgrades. **Upgrades are global levels on a kind
   of thing** — Wall level III makes every wall on the planet stronger at once (and every future wall). The same rule
   covers roads, bridges, rails, each tower kind, each production kind, housing, batteries and vehicles. A level shows
   as one subtle look change on every piece of that kind (trim colour, edge paint).
6. **A road is just a path.** A road drawn over shallow water is a bridge. Later global Bridge levels reach deep water
   and lava; a late Road level climbs cliffs as stairs.
7. **The damage rule (the only place it is decided).** Enemies attack and can damage only: **production buildings**,
   **military buildings** (walls, gates, towers, posts, the HQ), **fighting units**, and **delivery vehicles while they
   travel**. Never roads, bridges, rails, depots, stations, docks, houses or town services. **Trains** are protected:
   indestructible rails, faster than every home-world enemy, plow through small and medium enemies; a train can be
   attacked only while it is standing at a station. Fire and your own spells follow the physics and can hurt your own
   buildings, but never infrastructure.
8. **Walls are easy to draw.** Drag a line, it joins anything within 3 m, snaps to cliffs and deep water, and the
   blueprint is placed at once. Drawing walls and roads is never slow or expensive — they are the core verbs.
9. **Nothing teleports.** Every resource travels on a person or a vehicle that has to cross the map (inside one depot's
   yard ring, buildings share a store).
10. **Fog of war is sensor range.** At the start only surface outcrops are known, each with a limited amount.
11. **Mana is planet-specific**, regenerates slowly up to a small part of the cap, and really comes from mana crystal
    that must be harvested and refined.
12. **The first star system always has 6–10 planets.** One space station per planet.
13. **Everything is pixels with light**: emitters light nearby pixels; walls, rails and roads are smooth lines.
14. **Phone first.** Every screen works at ~402×780 portrait, with touch, keyboard and gamepad (menus included).
15. **Same seed + same orders = same game.** The sim is deterministic and runs in node.

---

## §1 Architecture

### 1.1 Folder layout

```
prototypes/lodestar/
  index.html                 title + game (one page; the bunker is the game screen)
  bench.html                 M1 cell-world benchmark / paint toy (kept forever as a perf check)
  README.md                  what it is, how to run, how each system works
  css/
    bunker.css               the desk, bays, drawers, lamps (shared tokens)
    machines/*.css           one file per machine
    phone.css                portrait + landscape phone rules
  js/
    main.js                  boot: load data, start worker, mount console, wire input
    sim/                     PURE. No DOM, no clock, no Math.random, no fetch. Runs in node and in the worker.
      index.js               createSim(data, seed) → { step(commands), snapshot(), save(), load() }
      rng.js                 seeded generator (split per system so adding one never shifts another)
      systems.js             the ordered list of systems step() runs (append-only; see §4.3)
      entities.js            entity store (ids, kinds, typed fields)
      economy/  defence/  units/  town/  mana/  research/  logistics/  space/  summary/
    world/                   PURE. The cell grid and its rules (also run inside the sim)
      grid.js  chunks.js  materials.js  fire.js  blast.js  debris.js  gas.js  fog.js  mapgen.js  edges.js
      vectors.js             polylines (walls, roads, rails) → rasterised cell flags
      flow.js                flow fields per target, rebuilt per changed chunk
    worker/
      sim-worker.js          owns the sim; receives commands, posts frames (§1.2)
    render/                  WebGL2 (raw, no three.js — this is a 2D pixel renderer)
      scope.js  cells.glsl.js  light.js  bloom.js  crt.js  vectors.js  sprites.js  chart.js  orbital.js
    console/                 the physical-machine UI (HTML/CSS/SVG)
      desk.js  drawers.js  knob.js  switch.js  lamp.js  pen.js  padnav.js
      machines/  scope-bezel.js  range.js  filter.js  toolbank.js  ledger.js  teletype.js  radio.js
                 garrison.js  dispatch.js  gauge.js  spellboard.js  calculator.js  orrery.js
                 orbital-scope.js  alarms.js  dayclock.js  timedial.js  channel.js  menu.js
    audio/
      room.js                synthesized room sounds (knobs, relays, teletype, klaxon, hum)
      battle.js              bridge to sfx/js/sfx.js with the scope-speaker filter
      radio.js               shared/voices.js through a radio filter
    save/
      store.js  cloud.js
    eye.js                   window.gameEye.state() / actions for Claude's game-eye
  data/                      every number (see 1.6)
  tests/                     node --test units (*.test.js) + Playwright (*.spec.js)
  tools/
    bot.mjs                  headless bot that plays whole games in node
    balance.mjs              runs N seeds through the bot, writes research/balance-*.md
    bench.mjs                headless tick-time benchmark of the world rules
```

### 1.2 Worker vs main thread

- **Worker (`js/worker/sim-worker.js`)** owns the whole sim: cells, entities, economy, all bases. Fixed **20 ticks per
  second** at 1× (the time dial runs 0 / 20 / 40 / 80 ticks a second; pause = 0).
- **Main thread** owns rendering, the console and audio. It never changes game state: it sends **commands** (§3.3).
- **Each worker frame** posts: `{ tick, base, chunks: [{ cx, cy, cells: ArrayBuffer }], ents: Float32Array,
  entMeta: [...changed only], vectors: [...changed only], fields: { gas, fog, noise, glow } (quarter-res, only when
  changed), hud: {...needles}, events: [...] }`. Buffers are **transferred**, not copied. No SharedArrayBuffer (GitHub
  Pages cannot send the headers it needs).
- Only chunks that are inside or near the scope's view **and** changed since the last frame are sent. The render
  keeps its own copy of every chunk it has seen.
- Entities are drawn interpolated between the last two snapshots so 20 ticks a second still looks smooth at 60 fps.
- The node tests and the bot import `js/sim/index.js` directly — no worker.

### 1.3 Simulation rates

| Thing | Rate |
|---|---|
| Fire, heat, burning, explosions, debris landing | every tick, awake chunks only |
| Gas (smoke/steam/ash) and wetness (quarter-res) | every 2nd tick |
| Entities (units, enemies, vehicles) | every tick |
| Flow fields | rebuilt only for chunks whose blocking changed, budget 2 chunks a tick |
| Economy (production, dispatcher) | every 5th tick |
| Noise/Glow fields, nest growth, regrowth, cooling | every 20th tick |
| Unwatched bases (summary sim) | once a second (§1.5) |
| Satellites | every tick (cheap: one angle each) |

### 1.4 Phone performance targets (mid-range phone, e.g. a 2022 Android or iPhone 12)

| Budget | Target |
|---|---|
| World rules per tick (watched base) | ≤ 4 ms with 80 awake chunks |
| Entities per tick | ≤ 2 ms with 800 enemies + 300 units + 100 vehicles |
| Render | 30 fps phone, 60 fps desktop, at "Standard" quality |
| Quality knob | Low = light buffer at quarter res, no bloom, no afterglow; Standard; High = half-res light, bloom, CRT |
| Memory | page under 250 MB |
| First load | under 3 MB over the wire (no big assets; machines are CSS/SVG) |
| Debris | ≤ 300 particles alive, ≤ 80 landings a second |
| Save | under 2 MB per base compressed |

`bench.html` and `tools/bench.mjs` measure these from M1 onward, and the numbers are written into the README each
milestone.

### 1.5 Bases you are not watching

Only the base on the scope runs the full cell sim. Every other base runs a **summary sim** (`js/sim/summary/`):
production as rates from its buildings and levels; vehicles as timers along their lines; raids resolved by comparing
raid strength with the **defence rating** of the walls, towers and posts on the raid's path (data: `balance.json`
`summary`). Fires are paused. When you tune in, the full sim takes over from the summary state, losses already
applied. Raids at an unwatched base light its BASE lamp and give **60 s warning** before they resolve, so you can tune
in and fight it yourself.

### 1.6 Data files (every number)

`materials.json` · `resources.json` (raws, refineds, exotics) · `recipes.json` · `buildings.json` (every building kind:
size, cost, jobs, power, kind tags `production|military|infra|town`) · `upgrades.json` (global level ladders per kind)
· `towers.json` · `units.json` · `enemies.json` (families, kinds, rule breakers) · `nests.json` · `spells.json` ·
`mana.json` · `vehicles.json` · `research.json` · `planets.json` (archetypes: map size, edges mix, weather, family,
exotics, mana colour) · `console.json` (machines, bays, which unlock delivers each) · `directives.json` (High Command
objective chain) · `radio.json` (radio/teletype line pools) · `balance.json` (difficulty, raid scaling, summary sim,
regen, early-game tuning) · `changelog.json` (What's new).

### 1.7 Map sizes

| Planet | Map (cells, 0.5 m each) |
|---|---|
| Home world | Small 1,024² · **Normal 1,536²** (default) · Large 2,048² — chosen at New game |
| Other planets | 1,024² (small moons) to 2,048² (large worlds), from `planets.json` × planet size |
| Chunks | 64×64 cells; quarter-res fields are one value per 4×4 cells |

One base and one landing site per planet. One station per planet.

### 1.8 Save format

- **IndexedDB**, database `lodestar`, store `saves`, key `slot1..slot3` + `auto`. Value: the save document (§3.5) with
  each base's changed chunks as one gzip blob (built-in `CompressionStream`).
- Autosave at the end of each planet day and when the tab hides. Export/import as a `.lodestar` file (the same
  document, gzipped).
- **Cloud save** (optional, signed in to games.radgh.com): see §5 and M8 / M14.

---

## §2 The game, as built (summary of what PLAN keeps)

Short version for builders; details live in the milestones and the data.

- **Console**: Tactical Scope, light pen, Range knob (¼ ½ 1 2 4 8 px per cell; ¼ and ½ are a downsampled chart),
  Filter selector (SIGHT / ORE / FLOW / THREAT), Tool bank (BUILD / WALL / ROAD / RAIL / ORDER / CLEAR), Time dial
  (pause 1× 2× 4×), Teletype, Radio speaker, Alarm lamps (RAID / FIRE / CONVOY / HQ / BASE) + klaxon + mute, Day
  clock, Degauss, ☰ menu. Drawer machines: Build Ledger, Garrison Board, Dispatch Board, Mana Gauge + Spell Board,
  Calculator, Orrery, Orbital Scope, Channel selector. **The console grows**: you start with five and the rest arrive
  as crates when unlocked (`console.json`). Drawers are grouped under FRONT / LOGISTICS / ARCANE / SPACE labels.
- **World**: flat; edges are shallow water (wade 35%, bridge), deep water (boats, later bridges), lava (burns, later
  bridges), cliffs (impassable, later road stairs). Fire, smoke, steam, explosions, rubble, debris, frost-ice, rain-mud,
  lightning through water. Light: derived relief, sun angle, emitters, dark nights, bloom, CRT.
- **Sight**: blocked by smoke/steam/ash and by darkness outside lit areas. Radar mast shows enemy blips through both.
  Fog has three states: never seen (static), seen before (last picture, greyed), live.
- **Economy**: 8 raws → 9 refineds + mana + 1–2 exotics per planet. Outcrops (visible) → shallow deposits (thumper) →
  deep deposits (thumper level III / orbital deep radar). Hand camps → drills. Depots with yard rings, automatic
  dispatcher, keep-in-stock on every producer, jam lamps (POWER / INPUT / OUTPUT). Power is one number per base.
- **Transport**: porters, cart (I) → truck (II) → train, barge (III) → rocket, ferry, lander (space). Lines on the
  Dispatch Board, one "if the route is hot" setting per line.
- **Town**: one house kind, farm field, fishery, well, Commons. Population fills jobs automatically; morale needle with
  five input lamps; smoke over homes; migrants walk in.
- **Defence**: one wall (levels I timber → V runed), gates, 8 towers + ward pylon + shield emitter, nests (stages 1–5,
  bud at 4, cores are samples), Noise and Glow, raids on flow fields that chew the most damaged wall section.
- **Units**: 7 kinds, orders Post / Patrol / Response.
- **Mana**: crystal cluster → harvester → shards → Mana refinery → HQ store. Cap 100 start, regen 0.5/s to 25% of cap,
  batteries raise cap and unlock spell tiers (100 / 400 / 1,500 / 5,000). 11 spells: Lightning, Shield bubble, Line of
  fire, Sensor flare (tier 1); Meteor, Frost snap, Call rain, Stone ridge, Mend (tier 2); Chain storm (tier 3); Comet
  (tier 4). Cast = tap cartridge (arms) → aim → FIRE; needs live sight.
- **Research**: Calculator, punch cards, 7 eras, ~60 unlocks + global upgrade levels + repeatables; samples gate eras.
- **Space**: rocket + launch interlock; satellites with an inclination knob and 5 probe kinds painting the stripe
  map; Orrery; stations (core + dock, warehouse, yard); ferries; landers; landing kit (pod, builders, materials, food,
  small full battery); channel selector; summary sim; warp drive; second system; trade routes; the Lodestar beacon;
  endless repeatables.
- **Enemy families**: Skitterkin (home), Slagborn (volcanic, walk through lava, weak to water), Rime stalkers (ice,
  freeze water into bridges, weak to fire), Glowfeeders (crystal, hunt Glow only, drain batteries), Driftborn (attack
  stations). Other planets reuse a family at a harder tier with a new colour.

---

## §3 Data contracts

These let several agents build at once. A contract changes only by editing this section in the same commit, with a
test.

### 3.1 The cell (one `Uint32` per cell, `Uint32Array` per chunk, 64×64)

| Bits | Field | Meaning |
|---|---|---|
| 0–7 | `mat` | index into `materials.json` `list` (order fixed; new materials append) |
| 8–15 | `temp` | 0–255 on the curve in `materials.json` `tempCurve` (≈ −60 °C … 1,400 °C); ambient per planet |
| 16–23 | `amt` | ore units ÷ 8 for ore cells, fuel left for burnables, hit points ÷ 4 for wall cells (sections, below) |
| 24 | `burning` | |
| 25 | `owned` | player-built cell |
| 26 | `scorched` | |
| 27 | `road` | walk/drive bonus, firebreak (set by vectors.js) |
| 28 | `bridge` | walkable deck on water/lava (set by vectors.js) |
| 29 | `rail` | rail bed (trains run on the vector, not the cell) |
| 30 | `edge` | cliff line cell (blocks walking; rasterised from the cliff polylines) |
| 31 | `wet` | cell is in a wet area this tick (copied down from the quarter-res wet field for fast fire checks) |

Rules:
- **Relief is not stored.** The renderer derives it from `materials.json` `relief` + a position hash.
- Walking cost and "vehicles can cross" come from the material row plus flags (`road`, `bridge`).
- **Fog** is not in the cell; it is the quarter-res `fog` field: 0 never seen, 1 seen before, 2 live.
- Quarter-res fields (`Uint8Array`, one per 4×4 cells): `gasDensity`, `gasKind` (smoke / steam / ash), `wet`, `fog`,
  `noise`, `glow`, `light` (sim's coarse "is this lit at night" for the sight rule).
- **Deposits under the ground are not cells**: they are records `{ id, res, layer: 'shallow'|'deep', cx, cy, r, amt,
  known: bool }` revealed by a thumper or a probe.
- **Walls** are vectors (3.2) rasterised into cells of material `wall`; a wall's hit points live on its **4 m
  sections** in the vector record; damage to a wall cell goes to its section.

### 3.2 Entities and vectors

All entities are plain JSON-safe objects in `entities.js`, keyed by integer `id` (never reused in a game). Positions
are **integers in 1/256 of a cell** (`x`, `y`). Common fields: `{ id, kind, type, base, x, y, hp, hpMax, team }`
(`team`: 0 player, 1 wild). `kind` is one of:

| kind | extra fields |
|---|---|
| `building` | `w, h, rot, built (0–1), jobs, workers, recipe, keep: {res: n}, lamps: {power, input, output}, store?` |
| `depot` | `ring` (cells), `keep: {res: n}` (optional override) |
| `squad` | `unit` (type), `count`, `order` (order id), `str` (0–1) |
| `enemy` | `family`, `raid` (raid id or null), `target` (entity id) |
| `vehicle` | `line`, `cargo: {res: n}`, `pathPos`, `state: 'moving'|'loading'|'waiting'` — M3 adds `home` (building id), `job: {from, to, res, n} \| null`, `phase` |
| `worker` | **(M3)** builders: `type: 'builder'`, `home`, `task \| null`, `cargo`, `state`, `phase`. Not delivery vehicles (they carry only for their own sites); the damage rule (M4) decides whether they can be hurt |
| `pile` | **(M3)** salvage left on the ground (a demolish refund outside a yard ring, a load nobody could take): `store`, `door`; porters bring it home; never attacked |
| `migrant` | **(M7)** a group of settlers walking in from the map edge to a free bed (or out again): `n` (people), `dir: 'in'\|'out'`, `house` (building id \| null); moves like a porter on the same route search; never attacked (no class in the damage rule). Homes (`house` rows and the HQ) carry `residents`; every building with `jobs` carries `workers` (filled by the town, js/sim/town/jobs.js) |
| `nest` | `stage` (1–5), `fed`, `budTimer` |
| `deposit` | as 3.1 |
| `crystal` | `amt`, `regrow` |
| `particle` | debris (sim-only, never saved) |
| `satellite` | `planet`, `probe`, `incl`, `phase` |
| `station` | `planet`, `modules: []`, `store` |

**Vectors** (`vectors.js`): `{ id, kind: 'wall'|'road'|'rail'|'cliff', base, pts: [[x,y],...] (cells, integers),
closed, sections?: [{ hp }] (walls only, one per 4 m), gates?: [{ at (distance along), id }] }`.
**(M3) Roads** also carry `len`, `bridge` (cells of span), `spans: [{ a, b, done, builder, need, delivered }]` (the
blueprint builders lay, 24 cells each) and `laid: [[a, b]]` (distance ranges that are cells now). Only the laid part is
road; the scope draws exactly `laid` (js/render/roads.js). A road is laid through `vectors.applyPart(v, a, b, { reach })`
where `reach` is the set of water/lava materials the global Bridge level spans.

**Orders**: `{ id, type: 'post'|'patrol'|'response', base, at?: [x,y], r?, path?: [[x,y]...], loop?, range? }`.
A post whose circle contains a nest attacks it, then holds the ground. A patrol whose path follows a road or rail
counts as an escort for vehicles on it.

**Lines**: `{ id, mode: 'road'|'rail'|'water'|'ferry', stops: [depotId|stationId...], leave: 'full'|'timer', every?,
hot: 'go'|'wait'|'turn back', vehicles: [ids] }`.

**Global levels**: `levels: { wall: 1, road: 1, bridge: 1, rail: 1, tower.bolt: 1, producer.smelter: 1, house: 1,
battery: 1, truck: 1, train: 1, ... }` — levels belong to the **whole game**, not to a base (they are research), so a
new base on another planet starts with every level already earned.

### 3.3 Commands (console → sim)

Every command: `{ t: 'name', base, ...args }`. The worker stamps the tick it applies on. The sim validates every
command and answers a refused one with a `refused` event that says why in plain words.

| Command | Args |
|---|---|
| `build` | `type, x, y, rot` |
| `demolish` | `id` |
| `drawWall` / `drawRoad` / `drawRail` | `pts, closed` (rail refuses curves under the minimum radius) |
| `eraseVector` | `id, from, to` (distance along) |
| `addGate` | `wallId, at` |
| `undo` | — (undoes this player's last build/draw command within 30 s, full refund) |
| `setRecipe` | `id, recipe` |
| `setKeep` | `id, res, n` (keep-in-stock on producers, "keep here" on depots) |
| `makeLine` / `editLine` / `deleteLine` | line fields (3.2) |
| `buyVehicle` | `line, type` |
| `trainSquad` | `unit, at (barracks id)` |
| `setOrder` | `squad, order` (order object) · `clearOrder` `squad` |
| `queueResearch` / `unqueueResearch` | `node` |
| `cast` | `spell, x, y, x2?, y2?` (line spells) |
| `arm` / `disarm` | **(M6)** `spell` — pull a Spell Board cartridge (the key turns itself in `mana.json arm.ticks`) / put it back. `cast` is refused unless that spell is armed and its key has turned: a fire mission is two separate actions |
| `launch` | `pad, payload: 'cargo'|'satellite'|'station-part'|'lander', probe?, incl?, cargo?` |
| `buildModule` | `station, module` |
| `land` | `planet, x, y` (landing kit) |
| `warp` | `station, system` |
| `tradeRoute` | line fields with `mode: 'ferry'` across systems |
| `setSetting` | sim-relevant settings only (difficulty is fixed at New game) |
| `setTown` | **(M7)** `settlers: bool` — the Town Board's SETTLERS switch (the only town order; nobody assigns a worker) |
| `dev.*` | **(M3)** dev / test only, never from a machine: `dev.paint/ignite/blast/frost/lightning/rain/rainAll/wind` (the bench), `dev.hour {hour}`, `dev.smoke {x, y, r}`, `dev.give {res, n}` |

M3 notes: `build` takes the type id from `data/buildings.json` (`type: null` is refused with "pick a building");
`demolish` takes `id` or `x, y` (a building there, else the road within 4 cells — a 10-cell piece of it is cleared);
`setKeep` on a producer is keep-in-stock (`n: null` = no limit, `0` = off), on a depot it is "keep here". Every
command returns `{ ok, why?, id? }` to node callers (the bot, tests) as well as answering with events.

Not commands (main thread only): pan, zoom, filter, open drawer, time dial (the worker is told the rate, it is not
saved as an action), channel selector (tells the worker which base is watched).

### 3.4 Events (sim → console)

`{ e: 'name', tick, base, ...args }`. Events drive the teletype, radio, lamps, sounds and juice. Throttled events say
so.

| Event | Args | Usual output |
|---|---|---|
| `refused` | `cmd, why` | teletype |
| `built` / `destroyed` | `id, type, x, y, by` | teletype; destroyed → radio |
| `damaged` | `id, frac` (throttled, 1 a second per id) | lamp flicker |
| `ringClosed` | `wallId` | green sweep + teletype |
| `jam` | `id, lamp, why` | lamps, teletype |
| `depleted` | `id, res` | teletype |
| `deposit` | `id, res, layer` | survey ring + teletype |
| `raidForming` | `raid, nest, target, path` | THREAT arrow, RAID lamp blink |
| `raidSpotted` / `raidAtWall` / `wallBreached` / `raidBeaten` | `raid, x, y, n` | radio story, klaxon |
| `nestGrew` / `nestBudded` / `nestCleared` | `id, stage, sample?` | teletype |
| `convoyHit` / `vehicleLost` | `vehicle, line, x, y` | CONVOY lamp, radio |
| `trainPlowed` | `x, y, n` | hit-stop, crunch |
| `fire` | `x, y, size` (throttled) | FIRE lamp |
| `explosion` | `x, y, r, power, chain` | flash, shake, thump, CHAIN counter |
| `spellCast` / `spellLanded` | `spell, x, y` | gauge ghost needle, juice |
| `combo` | `name` | teletype commendation (first time each) |
| `researchDone` | `node, unlocks` | tube capsule, ledger card |
| `levelUp` | `kind, level` | teletype + global look change |
| `machineUnlocked` | `machine` | freight-lift crate |
| `directive` | `id, text, done?` | tube envelope |
| `pop` / `morale` | `n` / `v, lamps` | needles |
| `dayEnded` | `report: {...}` | Commander's daily report on the teletype |
| `orbitPass` / `scanProgress` | `sat, planet, frac` | Orbital Scope |
| `launch` | `pad, ok` | interlock, countdown, shake |
| `baseAlarm` | `base, raid, eta` | BASE lamp, radio |
| `landed` / `warped` | `planet` / `system` | channel selector gains a position |
| `beaconLit` | — | ending |
| `placed` | **(M3)** `id, type, x, y` | teletype ("staked out") |
| `roadPlanned` | **(M3)** `id, len, bridge, cost, joins` | teletype |
| `pulse` | **(M3)** `id, x, y, r` (a thumper's survey ring) | expanding ring on the scope |
| `undone` | **(M3)** `kind, id` | teletype |
| `pools` | **(M3)** `n` (yard rings were rebuilt) | — |
| `teletype` | **(M7)** `who, text, red?` — a plain line for the teletype (settlers moved in, someone left hungry, Housing level) | teletype |
| `spellArmed` / `spellDisarmed` / `spellEnded` | **(M6)** `spell, ready?` / `spell` / `spell, id` | Spell Board key and lamps |
| `batteryBurst` | **(M6)** `id, x, y, r, power, charge` | teletype, bunker shake |
| `clusterStripped` | **(M6)** `id, x, y` (a crystal cluster with no crystal left: it will not grow back) | teletype |

M3 also uses `built` / `destroyed` for roads (`type: 'road'`), `deposit` with `layer: 'surface'` when an outcrop is
first seen (and `amt`), `depleted` with `what: 'outcrop'|'deposit'|'reach'`, and `refused` with `gaps: [[x0,y0,x1,y1]]`
and `unlock` for a road.
| `gameOver` | `why` | ending screen |

**M4 contract notes** (walls, raids). Commands: `drawWall { pts, straight? }` answers `{ ok, id }`; `addGate { wallId, at }
| { x, y }`; `demolish {x, y}` on a gate seals it, on a wall clears one section; `undo` takes a whole wall back; dev /
tests only: `dev.raid { x, y, stage, warn, atHq? | nest, target }`, `dev.build`, `dev.wallNow`, `dev.level { kind, level }`.
A hook in `sim.hooks.commands` may answer a string (refused), null (done) or `{ ok, id }` / `{ why }`. Wall vector
(§3.2): `{ kind: 'wall', pts, closed, len, sections: [{ i, a, b, state: 'plan'|'up'|'broken'|'gone', hp, gate, need,
delivered, builder, patch }] }`; frames send `[a, b, state 0-3, hpShare, gate, patch, builder]` per section. Enemy entity:
`{ type, family, raid, nest, state: 'guard'|'march'|'attack', hp, team: 1 }`; nest entity: `{ stage, fed, grow,
budTimer, raidTimer, r, hp, seen }`. Raids live in `sim.defence.raids.list()` (JSON-safe, their fields kept apart).
Events added: `wallPlanned`, `gateSet` / `gateSealed`, `wallRepair`, `raidWithdrew`, `raidCancelled`, `raidOver`,
`hqHit`, `crippled`, `hqPatched`, `nestSeen`, `enemyDied`, `shot { k: bolt|round|shell, x, y, x2, y2, ticks }`, `hit`,
`spit`; `damaged` also for wall sections (`section`) and nests; `destroyed.by` = 'raid' | the damage kind;
`explosion.by` = 'shell' | 'ruin' | 'enemy' | 'blast'. Hooks: `sim.hooks.noise` / `sim.hooks.glow` ([fn() → [{x, y,
level}]]), `sim.defence.pulse(kind, x, y, level, ticks)`, `sim.hooks.unitHurt` (M5), `sim.hooks.placeOn` (fn(def, cell)
→ may this building stand on this cell anyway). Vehicle rows may carry `protected: 'moving'` (M10 trains). Building
entities carry real `hp` / `hpMax` from M4 (towers.json, `balance.defence.hp`). Frames add `foes` (Float32Array [id, x, y,
type, hpShare, state], live sight only), `defence` (seen nests, raids with predicted paths, towers) and `threat`
(quarter-res Noise and Glow).

**M6 contract notes** (mana and spells). `spellCast { spell, id, x, y, x2?, y2?, landAt, eta, cost }`; `spellLanded`
adds what happened (`chain` [[x, y]…] and `hits`, `water` for lightning; `r`; `shake: 1` for a meteor); `combo { id, name,
text }` once per combo (spells.json `combos`). The hud carries `mana: { store, cap, regenTo, tier, tiers, batteries,
refinery, refining, jars, armed: { spell, ready } | null, cooling: { spell: ticks }, combos, active: [{ id, spell, x, y,
x2?, y2?, castAt, landAt, landed, until?, r?, prog?, phase?, len? }] }`. Dev / tests only: `dev.mana { n }`,
`dev.raise { type, x, y }` (placed and built at once), `dev.wild { x, y, hp, type? }` (a creature that stands still),
`dev.hp { id, hp }`. Hooks M6 offers: `sim.mana.spend(n)` / `canSpend(n)` (empowered units, M12), `sim.mana.inShield(x,
y)` and `sim.mana.shotBlocked(x0, y0, x1, y1)` (M4's walking and shots should respect shield bubbles), enemy fields
`slowUntil` / `slowBy` (frost snap: walk at × (1 − slowBy) until then). M6 hurts things only through
`sim.defence.hurt` (js/sim/mana/harm.js), feeds Glow only through `sim.hooks.glow` + `sim.defence.pulse('glow', …)`, and
passes its meteor's damage on the blast (`world.blast(…, { by: 'spell', damage, splash })`). A destroyed battery (hp 0)
bursts; one pulled down does not. Materials appended: `ridge_stone`, `mana_glass`. Console hooks added for every later
milestone: `C.penTools[tool] = { click, stroke }`, `C.overlays` (fn(ctx, { view, toS, ppc, … }) on the scope glass),
`C.eventHooks` (fn(ev) for every frame event), and `scope.addPainter(fn)` in js/render/scope.js (lit points in the
WebGL scope each frame).

### 3.5 Save document

```json
{
  "schema": 1, "game": "lodestar", "build": "<git short hash>", "savedAt": "<ISO, informational only>",
  "seed": 123456, "difficulty": "standard", "mapSize": "normal",
  "tick": 0, "rng": { "<system>": [u32, u32, u32, u32] },
  "levels": { "wall": 1 }, "research": { "done": [], "queue": [], "progress": {} },
  "console": { "machines": [] }, "directives": { "done": [], "current": "id" },
  "stats": { "days": [] }, "medals": [],
  "universe": { "seed": 1, "systems": [ { "id": "s0", "planets": [ "...from universe/" ] } ], "current": "s0" },
  "bases": {
    "<planetId>": {
      "planet": "<planetId>", "mapSeed": 1, "size": [1536, 1536],
      "chunks": "<gzip+base64 of changed chunks: [cx, cy, Uint32 cells] list>",
      "fields": "<gzip+base64 of quarter-res fields>",
      "entities": [], "vectors": [], "orders": [], "lines": [], "deposits": [],
      "mana": { "store": 0, "cap": 100 }, "power": {}, "summary": null
    }
  },
  "stations": {}, "satellites": [], "ferries": []
}
```

Rules: unchanged chunks are rebuilt from `mapSeed`; particles are never saved; a load runs a check that `build`
matches the data's schema and migrates older `schema` numbers forward (a test per migration).

---

## §4 How agents work in parallel

### 4.1 Ownership

Each milestone lists the files it owns. An agent edits only its milestone's files plus **append-only registries**:

- `js/sim/systems.js` — one line per system, in tick order. Append only; reordering needs this PLAN updated.
- `js/console/machines/index.js` — one line per machine.
- `data/console.json`, `data/research.json` — add rows; never edit another milestone's rows.
- `data/changelog.json` — one entry per publish (M8 onward).

### 4.2 At most three at once

Parallel groups are marked on each milestone and summarised in §6.

### 4.3 Determinism rules every agent follows

No `Math.random`, `Date`, `performance.now`, DOM or `fetch` under `js/sim/` or `js/world/` (a test scans for them).
Integer maths for cells; trig from lookup tables in `js/sim/rng.js` / `tables.js`. Iterate entities in id order. Each
system gets its own rng stream from `rng.split('<name>')`.

---

## §5 Game standards that apply (and which do not)

| Standard (`~/claude/docs/game-standards.md`) | Applies? | Milestone |
|---|---|---|
| Phone first, 402×780 checked, tap targets ≥ 44 px, nothing overlapping | yes | every milestone from M2; Playwright phone spec in each |
| Never nest a scrolling panel (drawers page with buttons) | yes | M2 |
| Touch + keyboard + gamepad everywhere, including menus (pad moves a highlight; A presses; B backs) | yes | M2 (`js/console/padnav.js`, modelled on Tumblefair's) |
| Gamepads need https — use playground 8441 (dev) / 8442 (stable) | yes | M2 |
| Top-down: W = screen north | yes (scope pan) | M2 |
| Browser list (iPhone, Android, Steam Deck, desktop); no `import … with {type:'json'}`; no ad-blocker file names | yes | M2 + every Playwright run |
| Plain language, no third-party IP, banned words | yes | every milestone; `tests/names.test.js` scans `data/` and `radio.json` |
| ☰ menu on every screen (back, What's new, report, sign in/out, settings, quit to title) | yes | M2 |
| "!" report button on every screen | yes | M8 — check `~/claude/docs/rgs.md` for a browser-game feedback path; if there is none, the report is saved locally and copied to the clipboard, and adding an endpoint to the RGS repo (production) is asked of Radley first |
| What's new (`shared/whats-new.js`, `data/changelog.json`, unread dot, entry at every publish) | yes | button M2; first entry M8; every publish after |
| Settings persist per device in localStorage with try/catch (sound, quality, CRT, controls, voice) | yes | M2 |
| Optional account sign-in pill (`shared/rgs-account.js`, `rgs-signin.js`) | yes | M8 |
| Cloud saves (`shared/rgs-cloudsave.js`) | yes | M8 (mirror key), M14 (opt-in adapter) — see below |
| Solo works (bots) | yes — it is solo; the bot is a test tool | M3 onward |
| `window.gameEye.state()` | yes | M2 (grows each milestone) |
| Unit tests per rule, determinism, assert rules not wording, drawn == measured, odd-knob tests | yes | every milestone |
| Playwright desktop + phone, zero console errors, screenshots looked at | yes | every milestone |
| STABLE vs DEV servers (8400/8401), `publish-stable.sh`, then `publish-pages.sh` | yes | M8 onward |
| games.radgh.com listing | **ask Radley** when M8 is playable | M8 |
| Ratings 👍/👎 with reasons | light: one prompt after a planet day 3 and after each new planet's first day, stored locally (and sent with reports) | M16 |
| Insights log | **skipped** — no server; the daily report covers player-facing stats | — |
| Lobbies, rooms, QR join, invite links, host tools, vote-kick, spectate, mid-match join | **skipped** — solo game | — |
| Multiplayer engineering (authoritative server, interpolation of others) | **skipped**; the pure deterministic sim rule is kept | — |
| Party minigame rules (§6), seasons | **skipped** — not a party game | — |

**Cloud save plan.** `rgs-cloudsave.js` only copies **localStorage keys** today. M8: the game keeps a compact cloud copy
of its newest save in localStorage key `lodestar.cloud` (gzip + base64), refreshed at every autosave **when it is under
1.5 MB**, and passes `keys: { save: 'lodestar.cloud' }` to the existing module — no shared change. `onRestore` writes
the downloaded copy into IndexedDB `auto` and offers to load it; `canRestore` is false while a game is running. When a
multi-planet save outgrows the limit (expected in M14), M14 adds an **opt-in storage adapter** to
`shared/rgs-cloudsave.js`: `cloudSave({ game, slots: { save: { read: async () => string, write: async (s) => void } } })`
— a slot whose value comes from async functions instead of a localStorage key. Default behaviour is byte-identical for
every other game; a node test proves Farhold's and Emberveil's key-based config is untouched. Check the rgs-api row
size limit first; if it is under the save size, the adapter splits a slot into numbered parts.

---

## §6 Milestones

Each one is a shippable, tested step. "Owns" = the files this milestone creates or is the only writer of. Tests assert
rules, not sentences or tuning numbers; knob tests move a data value to an odd number and check the module obeys.

**Parallel groups** (never more than three agents):

| Wave | Milestones in parallel |
|---|---|
| A | **M1 ∥ M2** |
| B | **M3** alone (fixes the building/entity contract everything else uses) |
| C | **M4 ∥ M6 ∥ M7** |
| D | **M5**, then **M8** |
| E | **M9 ∥ M10 ∥ M11** |
| F | **M12** alone |
| G | **M13**, then **M14a ∥ M14b**, then **M15** |
| H | **M16** |

---

### M1 — The cell world

**Goal:** prove the flat pixel world looks right and runs on a phone, before anything else is built.

Features:
- `Uint32` cell grid in 64×64 chunks with sleeping chunks; quarter-res fields.
- Map generator for the home archetype: grass, dry grass, forest, sand, rock outcrops (copper, iron, coal, stone,
  sand, crystal), rivers (deep channel with shallow edges and 2–4 fords), lakes, a lava field, cliff polylines around
  1–2 plateaus. Always one long river/lake chain. Every area reachable by walking (fords) from the HQ spot.
- Fire (ignition, fuel, downwind spread, wet slows it, water and roads stop it), smoke/steam/ash in the gas layer with
  wind, scorched ground and regrowth.
- Explosions (broken ground ring, rubble, flatten trees into burning logs, heat), debris particles on a fake arc that
  land as rubble or burning patches, with the caps. Hot debris into water → steam.
- Frost (water → ice → thaw), lightning flood through connected water (limited radius), rain → wet + mud.
- Renderer: cell textures per chunk, palette, derived relief normals, sun angle, light buffer + blur, emitters (fire,
  lava, lamps), lava glow animated in the shader, water shimmer, night, bloom, CRT (switchable), quality knob.
- Sim in the worker with transferred chunk buffers; render keeps its own copies.
- `bench.html`: paint any material, drop fire / explosions / frost / lightning, time of day slider, quality knob, live
  tick ms and fps readout.

Owns: `js/world/*`, `js/render/scope.js cells.glsl.js light.js bloom.js crt.js`, `js/worker/sim-worker.js`,
`js/sim/rng.js`, `data/materials.json`, `bench.html`, `tools/bench.mjs`.

Tests: fire spreads downwind faster than upwind; never crosses water, road or a stone cell; wet cells ignite later
(odd-knob: set dry grass ignite time to 7 ticks, assert 7). Explosion leaves no height (no field exists) and turns
centre cells to rubble/scorched; debris cap holds under 50 simultaneous blasts. Frost then heat round-trips. Lightning
reaches only connected water. Mapgen: 50 seeds, every land area reachable from the HQ spot, river has ≥ 2 fords, no
`Math.random`/`Date` under sim/world (scan). Same seed twice → same hash after 2,000 ticks. **Drawn == measured:** read
back the rendered scope pixels over a cliff and a ford and assert the drawn edge sits on the cells the sim blocks.
Bench: ≤ 4 ms/tick with 80 awake chunks in node (headless proxy for the phone target), Playwright phone-size run of
`bench.html` with zero console errors.

Owner can now: open `bench.html` on his phone, paint grass, set it on fire, drop explosions into a river at night and
judge the look and speed.

---

### M2 — The bunker

**Goal:** the physical console on desktop, phone and gamepad, wrapped around M1's scope.

Features:
- Title screen as a bunker hatch: New game (difficulty, map size, seed), Continue, What's new, Settings.
- Desk layout (desktop) and stacked phone layout (portrait + landscape) with fixed-height drawers that page, never
  scroll. Drawers grouped FRONT / LOGISTICS / ARCANE / SPACE.
- Machines: scope bezel with grid reference, Range knob (6 detents, chart view at ¼ and ½), Filter selector (SIGHT
  works; ORE/FLOW/THREAT show their empty layers), Tool bank (switches slap; one up at a time), Time dial, Teletype
  (pin a line), Radio speaker (subtitles), Alarm lamps + klaxon + mute, Day clock, Degauss, ☰ menu.
- Knob/switch/lamp components: drag, wheel, key, pad, tap-a-detent; amber focus lamp for the pad.
- Light pen: mouse, touch (reticle drawn 40 px above the finger), left stick with snapping.
- Fog of war: three states (static, last-seen greyed, live) from HQ sensor radius; sight blocked by smoke and by dark.
- Console grows: empty bays with RESERVED plates; `console.json` lists each machine and its unlock; crate animation.
- Room sounds: knob detents, switch slap, teletype, klaxon, hum (`js/audio/room.js`).
- Settings (sound, voice, quality, CRT, controls) in localStorage with try/catch. What's new button (empty changelog).
- `window.gameEye.state()` returns screen, open drawer, tool, range, filter, pen position, tick, needles.

Owns: `index.html`, `css/*`, `js/main.js`, `js/console/*`, `js/render/chart.js sprites.js`, `js/audio/room.js`,
`js/eye.js`, `data/console.json`, `data/changelog.json`.

Tests: every knob reaches every detent by drag, wheel, key, pad and tap (Playwright, rule asserted per input).
Gamepad: from the title, A/B/d-pad alone reach New game → game → every machine → ☰ → back (Playwright with a fake
pad). Phone 402×780 and landscape: no element overlaps another (bounding-box check), every tap target ≥ 44 px, no
element scrolls. Fog: a cell outside the sensor radius is never drawn live; smoke over a lit cell hides it (drawn ==
measured: read the fog field and the scope pixel together). W/up pans screen north. Zero console errors on desktop
and phone.

Owner can now: start a game, sit at the desk, turn the knobs, flick switches, pan the scope through fog on desktop,
phone and controller.

---

### M3 — The economy core

**Goal:** build the HQ, mine, haul, refine — the first real loop, with the bot playing it.

Features:
- HQ (48×48, sensor mast, HQ depot), placing buildings from the **Build Ledger** (rolodex cards with costs stamped).
- Outcrops with limited amounts; **hand camp** (era I) and **drill** (unlocked by the simple unlock list); outcrop
  scars when worked out.
- **Survey thumper**: pulse ring every 30 s, reveals shallow deposits in its radius.
- Depots with yard rings and shared pools; overlapping rings join. Automatic **dispatcher**: HQ wants everything,
  outposts offer everything, producers pull their recipe, optional "keep here" per depot.
- **Porters** and **mule cart**; carts crawl off road.
- **Roads** (one kind) and **bridges over shallow water**: drawn with the ROAD switch, auto-join, junctions, gate offer
  where a road meets a wall (gate itself lands in M4), price stamped on the pen, red gap with the unlock that would
  bridge it. Blueprint placed at once, builders lay it fast.
- Refining: sawmill (planks), stonecutter (block), smelter (copper bar, iron bar), with recipes and **keep-in-stock**
  default on every producer.
- **Power** as one number per base (a generator burning coal or timber); machines slow evenly when short.
- **Jam lamps** POWER / INPUT / OUTPUT with the reason on the teletype.
- FLOW and ORE filters work. Builders as entities that walk to sites.
- A simple **unlock list** (`research.json` era I–II rows unlocked by producing totals) until M9's Calculator.
- **Bot v1** (`tools/bot.mjs`): places HQ, camps, depots, roads, a smelter; reaches 500 copper bars.

Owns: `js/sim/index.js systems.js entities.js economy/* logistics/dispatcher.js`, `js/world/vectors.js` road part,
`js/console/machines/ledger.js`, FLOW/ORE in `filter.js`, `data/resources.json recipes.json buildings.json`,
`tools/bot.mjs balance.mjs`.

Tests: nothing moves between two depots without a vehicle or porter travelling the distance (time ≥ distance ÷
speed). Yard ring sharing: a building inside a ring uses its store; outside, it doesn't. Outcrop totals fall to zero
and stay there. Keep-in-stock switches a smelter off at the target and on below it (odd-knob test). Jam lamps: remove
coal → INPUT lamp names coal. Cart on road vs off road speed ratio equals the data's ratio. Road over shallow water
sets `bridge`; over deep water is refused with the unlock's name. Thumper reveals only inside its radius. Bot reaches
500 copper bars on 20 seeds. Determinism hash after 20 bot minutes.

Owner can now: build an HQ, find copper, send porters, lay roads and a bridge over a ford, and watch bars stack up.

---

### M4 — Walls, towers and raids

**Goal:** the defence half of the game. The home world is now a survival game.

Features:
- **Walls**: WALL switch; polyline with curves (Shift / CURVE), auto-join within 3 m, snap to cliffs and deep water,
  RING CLOSED sweep. 4 m sections with hit points. **Gates** on walls (own side passes, enemies don't). Blueprint
  remembers broken sections and rebuilds after the raid. Undo.
- **Global Wall levels** I–V (`upgrades.json`): I timber (burns), II stone (fireproof), III steel-banded (towers can
  stand on walls), IV concrete (resists acid), V runed (slow self-repair, adds Glow). One look change per level on
  every wall. Bought on the unlock list for now (Calculator in M9).
- **Towers** (first four): watch post, bolt thrower, gun nest, mortar pit; own shots pass over own walls; global level
  per tower kind.
- **Nests**: 6–10 on the home map, stages 1–5, growth over time and from Noise/Glow, bud at stage 4, destroyed → core
  sample.
- **Noise** field (machines, drills, explosions, gunfire, town size; soaked by forest) and the **Glow** field (wired
  now, fed by M6). THREAT filter with contours and raid arrows.
- **Raids**: form from fed nests, target the loudest thing in range, predicted path drawn 60–120 s ahead; flow fields
  (wade shallow, avoid deep and lava, round cliffs, use roads ×1.2); chew the most damaged wall section if blocked.
- **The damage rule** in one module (`js/sim/defence/targets.js`) that every attacker asks.
- Alarm lamps (RAID, HQ), klaxon, radio story lines (`radio.json`).
- **Home HQ destroyed = game over** (Calm: crippled for a day instead).

Owns: `js/sim/defence/*`, `js/world/flow.js`, wall part of `js/world/vectors.js`, `js/render/vectors.js`,
`js/console/machines/alarms.js radio.js`, THREAT in `filter.js`, `data/towers.json enemies.json nests.json
upgrades.json radio.json` (Skitterkin only).

Tests: **damage rule table test** — for every building kind tag and entity kind, an enemy adjacent to it either can or
cannot damage it, matching §0.7 (roads, bridges, rails, depots, houses: zero damage after 60 s of a raid standing on
them). Raising Wall level raises the hit points of a wall drawn **before** the level-up (global, not per piece), and
Wall I burns while Wall II does not. Walls drawn ending 2.9 m from another join; 3.1 m don't (odd-knob: set join
distance to 5 m). A wall from cliff to deep water closes a ring; flow field then routes round or chews; enemies never
get stuck (100 raids, every enemy reaches a target or dies within a time cap). Raid targets the highest-Noise building
in range. Nest buds only at stage ≥ 4. Gates let own units through and block enemies. Drawn == measured: wall vector
on screen sits on the cells the flow field treats as blocked.

Owner can now: wall in his town, put towers on it, watch Skitters come out of the woods because his camps are loud,
and lose if the HQ falls.

---

### M5 — Squads and standing orders

**Goal:** units that are stationed, never steered.

Features:
- Barracks; units militia (I), riflemen (II), scouts (II, wide sight on the move).
- **Garrison Board** machine: squads as tags; hooks for orders; drag a tag to a hook.
- Orders: **Post** (spot + radius; on a nest = attack it then hold), **Patrol** (drawn loop or there-and-back with the
  ORDER switch; along a road/rail = escort), **Response** (wait at HQ, go to alarms within range, come home).
- One behaviour: fight inside the area, chase to 1.5×, return, fall back to HQ under 30% strength, reinforce from
  barracks automatically.
- Squads come from population (a placeholder count until M7) and eat food from the base pool.
- **Floodlight** and **Radar mast** (enemy blips through smoke and dark).

Owns: `js/sim/units/*`, `js/console/machines/garrison.js`, `data/units.json`.

Tests: no command exists that moves a unit to a point (command list scan); a squad on a post never ends more than
1.5× radius from it; a patrol visits every waypoint in order, forever (1,000 ticks); a response squad returns home
after the alarm clears; a post on a nest attacks the nest. Radar blips show inside smoke where SIGHT shows nothing
(drawn == measured).

Owner can now: hang squads on posts, draw patrol loops along his walls, and set a response team at the HQ.

---

### M6 — Mana and spells

**Goal:** the commander's magic, as fire missions with physics.

Features:
- Crystal clusters (regrow if not stripped), **harvester**, shards hauled like ore, **Mana refinery** inside the HQ ring.
- **Mana Gauge** machine: needle, red reserve, cap needle, engraved tier marks; regen 0.5/s up to 25% of cap.
- **Batteries** (one kind, global level), raise cap; explode when destroyed (radius by charge).
- **Spell Board**: cartridges; tap = arm (key turns itself), aim with the pen, FIRE; ghost needle; travel times.
- Spells tier 1: **Lightning** (chain, through water), **Shield bubble** (blocks enemies, shots and fire), **Line of
  fire**, **Sensor flare**. Tier 2: **Meteor** (crater, rubble ring, burning blobs, debris, bunker shake), **Frost
  snap**, **Call rain**, **Stone ridge** (temporary rock line that crumbles), **Mend**.
- Spells land only on **live sight** cells. Tier unlocks by cap.
- **Glow** fed by spells, refinery and batteries.
- Combo detection (first-time teletype commendation).

Owns: `js/sim/mana/*`, `js/console/machines/gauge.js spellboard.js`, `data/mana.json spells.json`.

Tests: regen stops at 25% of cap (odd-knob 0.37); a crystal-fed store passes it. A spell aimed at a fogged or smoked
cell is refused with the reason. Tier 2 spell refused below cap 400, allowed at 400 (raise cap with a battery).
Shield bubble stops a fire front at its edge. Lightning on a ford hits every enemy standing in connected water within
range and none on dry land. Meteor leaves rubble that slows walkers by the data's factor. Battery destruction makes an
explosion whose radius grows with stored charge. Spells add Glow. Casting needs two separate actions (arm, fire).

Owner can now: harvest crystals, watch the needle climb, and drop lightning on Skitters wading a ford and a meteor on a
nest.

---

### M7 — The town

**Goal:** a city that grows around the HQ and powers the industry.

Features:
- **House** (one kind, global Housing level raises capacity), **farm field** (burns), **fishery** (on water),
  **well**, **Commons** (radius service).
- Population grows with housing + food + water + safety; migrants walk in from the map edge (never attacked).
- Jobs filled automatically (nearest first); "no workers" on the INPUT lamp.
- **Morale** needle (×0.6–×1.2 work speed) with five input lamps: food, water, Commons in reach, light at night, raids
  inside the walls. Smoke over houses lowers it.
- Town size feeds Noise. Squads draw from population.

Owns: `js/sim/town/*`, town part of `buildings.json` (rows tagged `town`), morale needle machine.

Tests: population never exceeds housing; no food → population stops growing and then falls; raising Housing level
raises the capacity of existing houses. Houses take zero damage from enemies (damage-rule table already covers it —
add the town rows). Smoke over a house lowers morale; moving the smelter downwind raises it. Work speed equals the
morale factor from the data (odd-knob).

Owner can now: grow a walled town of a hundred people whose mood depends on food, light and how safe it is.

---

### M8 — Saves and the first publish

**Goal:** the home world is a whole game, saved, and in front of the owner on stable.

Features:
- IndexedDB saves (3 slots + auto), autosave each planet day and on tab hide, export/import file, load migration.
- Cloud save via the existing `rgs-cloudsave.js` with the `lodestar.cloud` mirror key (§5); account pill
  (`rgs-account.js`, `rgs-signin.js`) on the title and in ☰.
- **High Command directives** (`directives.json`) through era II: the objective list and tutorial.
- **Commander's daily report** at each planet day's end.
- "!" report button (§5 for where it goes).
- What's new: first changelog entry. README, `~/claude/docs/lodestar.md`, `docs/docs.md` line, `docs/projects.md`
  row (sandbox), playground CLAUDE.md table row, `data/experiments.json` row, Thousandvale static `ALLOW`.
- Publish to stable (8400/8442) with `tools/publish-stable.sh`. **Ask Radley** whether to list it on games.radgh.com.

Owns: `js/save/*`, `data/directives.json`, report printer in `teletype.js`, docs.

Tests: save → load → 2,000 more ticks gives the same hash as never saving. Save of a 2-hour bot game is under 2 MB.
Export then import round-trips. A save with an older `schema` loads through its migration. Cloud mirror key is written
only when under the size limit. Directives: the bot completes the era I–II chain on 10 seeds. Full Playwright pass,
desktop and phone, zero console errors.

Owner can now: play the home world from an empty field to a walled town with spells and squads, save, come back on
another device.

---

### M9 — Research

**Goal:** the Calculator and the progression spine.

Features:
- **Calculator** machine: punch-card rack, hopper (queue 4), tape reels, lamps; results by tube capsule into the
  Build Ledger; big unlocks as freight-lift crates (console grows).
- `research.json` eras I–IV (~35 unlock nodes) + **global upgrade levels** for every kind in `upgrades.json`, bought
  on the same machine; repeatable ranks after level V.
- **Samples** gate eras: II needs a stage-2 nest core; III three cores + a deep deposit sample; IV crystal from two
  clusters + a stage-4 core.
- Wall chart: read-only tree page with pins in done nodes.
- More labs = faster research.
- Replaces M3's unlock list (its rows move into the tree).

Owns: `js/sim/research/*`, `js/console/machines/calculator.js`, `data/research.json` (all eras I–IV rows).

Tests: an era cannot start without its sample; every unlock in `research.json` names something that exists in another
data file and every building/unit/spell is unlocked by exactly one node (or is a starting item). Every repeatable rank
costs more than the last. Two labs research faster than one by the data's factor. Every era I–IV node is reachable on
the home world (bot reaches era IV on 10 seeds).

Owner can now: queue punch cards, watch the reels spin, and feel his whole desk fill up.

---

### M10 — Vehicles, trains and boats

**Goal:** the owner's delivery ladder — cars, trains, boats — all of which really travel and can be ambushed.

Features:
- **Truck** (era II), with the global Truck level (level III shoots back).
- **Rails**: RAIL switch, smooth curves, refuses tight curves and says why, rail bridges by the same Bridge levels,
  level crossings with roads (cars wait). **Train** (engine + up to 8 cars), stations; plows small/medium enemies with
  hit-stop; outruns every home enemy; attackable only while standing; optional gun car.
- **Barge** and **docks** on water; barge lines.
- **Dispatch Board** machine (split-flap): every line, next departure, status ("DELAYED — UNDER ATTACK"); route turns
  hot when an enemy is within 40 cells; one hot setting per line.
- Global **Bridge** levels: Long Spans (deep water, era III), Heat-proof Spans (lava, era IV). Global **Road** levels
  (speed), and **Road stairs** over cliffs (era IV).
- Patrol along a road or rail = escort for that line's vehicles.

Owns: `js/sim/logistics/*` (except dispatcher core from M3), rail part of `vectors.js`, `js/console/machines/
dispatch.js`, `data/vehicles.json`.

Tests: a moving train takes zero damage from every home enemy (100 raids along a line); a standing train can be hit;
a train crossing a swarm kills/knocks back every small and medium enemy on the track; rails and rail bridges take zero
damage. Trucks off road move at the data's factor. A road crossing deep water is refused until Long Spans, then built.
Global Road level raises the speed on roads drawn before the upgrade. Rail curve under the minimum is refused.
Drawn == measured: the train sprite stays on the drawn rail curve within one cell everywhere along a 50-curve test.

Owner can now: run a train line that plows through Skitters, barges down the river, trucks with escorts, and watch
the station board flap.

---

### M11 — Juice and sound

**Goal:** the satisfying part — explosions, chain reactions, a bunker that reacts.

Features:
- Explosion pass: flash frame, light pulse, chain reactions (powder stores, fuel stores, batteries, some enemies),
  **CHAIN ×n** counter on the bezel, hit-stop on big impacts.
- Bunker reacts: console bounce and dust on close blasts, swinging ceiling lamp, scope roll + static + colour fringe
  + crack overlay when the HQ is hit (no machine is ever disabled), **Degauss** clears the fringe, red light when HQ
  power is short.
- Battle sound through the scope speaker (`sfx/js/sfx.js`, louder when zoomed in), room sounds complete, train horn,
  meteor whistle, rain on the hatch, loudness rules.
- Radio voices on `shared/voices.js` with the radio filter (Signals, Quartermaster, High Command).
- **Weather** on the home world: rain (wet, mud, fires out, lightning stronger), barometer warning on the day clock.
- Little delights: phosphor afterglow trails, lightning lighting the scope, ring-closed sweep, Calculator lamp chase.

Owns: `js/audio/battle.js radio.js`, juice parts of `js/render/*` (new files `juice.js`, `bunker-fx.js`),
`js/console/machines/dayclock.js` barometer, weather in `js/world/weather.js`.

Tests: chain reactions terminate (no infinite loop on a 200-store grid); counter equals the number of explosions in
the chain. No HQ damage state removes or disables any control (every machine still answers its input while damaged).
Rain puts out a fire and turns bare soil to mud at the data's rate. Loudness of every new sound within the category
target (`sfx/js/loudness.js`). Hit-stop never exceeds the data's cap.

Owner can now: drop a meteor into a fuel store a raid has just reached and watch the chain counter climb while dust
falls on his desk.

---

### M12 — The home world, complete and balanced

**Goal:** every home-world system at full size, tuned, before space.

Features:
- Remaining towers: flame projector, arc mast (chain doubles through water), rail cannon; mana towers ward pylon,
  shield emitter.
- Remaining units: mortar crew, steam walker; empowered **battlemage** and **crystal golem** (crystal lenses).
- Crystal crafting: **crystal lens**, **mana cell** (a power source for buildings).
- Tier 3 spell **Chain storm**.
- Remaining refineds: steel, glass, concrete, powder, circuits; sulphur.
- Difficulty presets (Calm / Standard / Grim) + **Peaceful** (no raids).
- **Balance**: `tools/balance.mjs` over 100 seeds per difficulty; bot reaches "rocket ready" (era V entry) on Standard;
  raids beaten/lost curve per hour; Noise vs Glow split. Report in `research/balance-1.md`.
- **Summary sim prototype** (`js/sim/summary/*`): run the home base in summary mode for 2 planet days and compare
  production and raid outcomes with the full sim.

Owns: rows in `towers.json units.json spells.json recipes.json`, `js/sim/summary/*`, `data/balance.json`.

Tests: every tower and unit kind fires and kills in a node scenario; arc mast damage to targets in water vs dry is the
data's ratio. Bot time-to-rocket-ready within the target band on Standard, never on Peaceful raids. **Summary vs full:**
production within 15% and raid outcome (held/lost) matching in ≥ 90% of 50 seeded cases. Peaceful spawns no raid in
10 hours of bot play.

Owner can now: play the whole home world at three difficulties and a peaceful mode, with every tower, unit and spell.

---

### M13 — Space I: rockets and the stripe mapper

**Goal:** get off the planet and map the system.

Features:
- Star system from `universe/` (first system always **6–10 planets**, home is the gentlest habitable one; further out =
  harder enemies, richer exotics). `planets.json` archetypes: temperate, volcanic, ice, crystal, + reused families.
- **Orrery** machine: brass model turning with game time; planet cards; travel time from live positions; "best
  departure" lamp.
- **Rocket** building (fills with parts and fuel), **two-key launch interlock**, nixie countdown, room shake; a launch
  is loud (Noise).
- **Satellites** with an **inclination knob** (covered band drawn as you turn it) and 5 probes: Surface, Metal,
  Crystal, Deep radar, Life.
- **Orbital Scope**: planet map filling stripe by stripe; planet turns under the orbit; polar orbit covers the planet
  in ~3 planet days, equatorial only a band.
- A home-world deep-radar satellite reveals deep deposits on the home map.

Owns: `js/sim/space/orbit.js rocket.js system.js`, `js/render/orbital.js`, `js/console/machines/orrery.js
orbital-scope.js`, `data/planets.json`.

Tests: 200 system seeds each have 6–10 planets. Coverage after N days matches the geometric formula for the
inclination (drawn == measured: the Orbital Scope's painted pixels equal the sim's coverage mask). A probe reveals
only its material kinds. Equatorial orbit never covers the poles. Launch needs both keys within the window (or in
order on one device). Launch adds Noise.

Owner can now: launch a satellite, turn the inclination knob, and watch the next planet paint in stripe by stripe.

---

### M14a — Space II (stations and ferries)

**Goal:** the reliable, reusable transport chain between planets.

Features:
- **Stations**, one per planet, built from rocket deliveries: core + dock, warehouse, yard.
- **Ferries**: automated reusable ships between stations as Dispatch Board lines (departures, cargo, status).
- **Landers** between a station and its planet's base.
- Cargo chain: base → rocket → station → ferry → station → lander → base, every leg a real trip.
- Cloud save **opt-in adapter** in `shared/rgs-cloudsave.js` (§5), if the save is over the mirror limit.

Owns: `js/sim/space/station.js ferry.js lander.js`, `shared/rgs-cloudsave.js` (opt-in addition only),
`js/save/cloud.js`.

Tests: no cargo reaches another planet without every leg's travel time elapsing; a ferry line runs unattended for 10
planet days. Cloud adapter: the existing key-based configs behave byte-identically (Farhold/Emberveil config test);
the async slot round-trips a 5 MB save.

### M14b — Space II (other planets and bases) — parallel with M14a

**Goal:** land a second base on a different, more dangerous world.

Features:
- Map generator archetypes for volcanic, ice and crystal worlds (edges mix, materials, exotics: one or two per planet,
  each feeding 1–3 buildings or units).
- **Landing kit**: command pod (mini HQ), 4 builders, a materials crate, a food crate, a **small full mana battery**
  (cap 150) that regenerates slowly.
- **Channel selector** to switch the watched base (CRT channel roll); BASE lamp + 60 s warning for unwatched raids.
- Summary sim live for every unwatched base.
- Enemy families: **Slagborn** (walk through lava, weak to water), **Rime stalkers** (freeze water into bridges, weak
  to fire; cold snaps on ice worlds), **Glowfeeders** (hunt Glow only, drain batteries, burst when killed); harder
  tiers of a family on reused worlds.
- Per-planet mana: own gauge, colour and one cheaper spell school; mana never moves between planets.
- Weather per planet type (volcanic ash fall blinds sight).
- Era VI research: exotic buildings, shield emitter levels.

Owns: `js/world/mapgen-*.js` (new archetypes), `js/sim/space/landing.js`, `js/console/machines/channel.js`, rows in
`enemies.json planets.json mana.json research.json`.

Tests: each planet's mana store is independent (spending on one never changes another). Landing gives exactly the kit
in the data. Slagborn take zero lava damage and the data's water damage; Glowfeeders ignore Noise. Rime stalkers'
frost turns water to walkable ice. Every planet archetype map: all land reachable from the pod spot or by bridge
unlock. Switching bases hands over summary ⇄ full state with production within 15%.

Owner can now: scan a volcanic world, pick a landing site, drop a pod, and run two bases with a ferry line between
them.

---

### M15 — Space III: warp, trade and the Lodestar

**Goal:** the long game and its ending.

Features:
- **Warp drive** at a station's yard (exotics + a full big battery of mana per jump) to a nearby star system on a star
  chart (from `universe/` galaxy).
- New systems (4–12 planets; star type changes day length and light colour).
- **Trade routes** between systems as ferry lines.
- **Driftborn**: pods from orbit that attack stations and ferries near stations; station point-defence module.
- Era VII: warp, trade, the **Lodestar beacon** at a station in a third system → ending (bases shown on the Orrery,
  beacon flare, radio fills with voices) → endless play.
- **Comet** (tier 4 spell).
- The incremental tail: repeatable ranks on every global level, nest tiers that keep climbing, daily report records.

Owns: `js/sim/space/warp.js trade.js`, era VII rows, `enemies.json` Driftborn rows, ending screen.

Tests: a warp jump spends exactly the data's cost and is refused short of it. Ships in transit take damage only within
range of a station. Bot reaches the beacon on Standard in under the target hours (headless, summary-heavy). Endless:
1,000 repeatable ranks without numbers overflowing (`shared/format.js` formatting never shows "e+").

Owner can now: warp to a new star, set up trade routes, light the Lodestar, and keep going.

---

### M16 — Polish

**Goal:** the last good things.

Features: **photo mode** (print the scope with a caption and grid stamp), **medals** (cosmetic, on a wall board),
light ratings prompt (§5), performance pass on real phones, a full brief audit against the table in §8, parked-list
review with the owner.

Owns: `js/console/machines/photo.js medals.js`, `research/audit.md`.

Tests: photo saves a PNG whose pixels equal the scope's; medals give no stat bonus (scan). Full Playwright pass.

Owner can now: take recon photos of his best explosions and see his medals on the wall.

---

## §7 Parked (good ideas, not now — nothing silently lost)

| Idea | From | Why parked |
|---|---|---|
| HEAT filter / thermal sensors | BRAINSTORM 1.4 | one sight rule + radar covers the decision |
| Mana spills (raw mana stains, wild effects, SPILL lamp) | 6.6 | a second hazard system |
| Glass streaks from lightning on sand | 2.4 | delight, later |
| Dust storms, mana storms | 2.11 | one weather per planet first |
| Strip mines / quarries | 3.4 | drills cover mining |
| Greenhouse / hydroponics | 4.3 | farm + fishery first |
| Festivals | 4.2 | morale has five lamps already |
| Airship + mooring masts | 3.6 | owner named cars, trains, boats |
| Pneumatic freight tube | 3.6 | dodges the "must be in danger" rule; another network |
| Mass driver | 3.6 | rockets cover launch |
| Crystal-engine trains | 6.4 | Glow on rails is a neat twist, later |
| Relay obelisks / spell projection range | 6.2 | home map is small enough without |
| Gust, Gravity well spells | 6.3 | 11 spells first |
| Hover tank | 5.7 | |
| Tide crawlers, dune serpents (without derailing), gale wisps | 5.8 | five families first |
| Neutral trader guild + credits | 8.6 | a currency is its own balance problem |
| Weather probe | 8.2 | |
| Four bunker walls with chair swivel and repeater scopes | 1.5 | grouped drawers first; revisit for desktop only |

Cut outright (see ROAST for reasons): wall tiers, road tiers, per-building Mk upgrades, fence vs full wall, ward wall,
cliff breaches, ramps (→ road stairs), chasms (→ cliffs), frost lance, molten pool, lava taps, pumps and oil, recall
the line, shelters, worker classes and schools, stances, ammo, radio unit-selection, train-derailing and train-stopping
beasts, machines knocked out by HQ damage, sand drifting over roads, power wires, mana pipes.

---

## §8 Every sentence of the brief → where it is delivered

| # | Owner's words (clause) | Delivered by |
|---|---|---|
| 1 | pixel physics RTS | M1 (cells, fire, blasts), M4 (RTS defence) |
| 2 | build a city | M3 (HQ, industry), M7 (town) |
| 3 | while also building walls and towers to defend against enemies | M4, M12 |
| 4 | similar to Factorio: spawners that send raiding parties | M4 (nests, Noise/Glow, raids) |
| 5 | walls should be easy to draw and connect contiguous lines | M4 (polyline, auto-join, snap, ring closed) — §0.8 |
| 6 | with multiple tiers starting with wooden walls and reinforcing to be stronger | M4 as **global Wall levels** I timber → V runed (owner's later change) — §0.5 |
| 7 | produce units that can be set on patrol | M5 (Patrol order) |
| 8 | the map must be discovered to reveal the fog of war | M2 (three-state fog), M5 (scouts), M13 (satellites) |
| 9 | at the start only surface level resources are detected with a limited quantity | M1 (outcrops), M3 (limited amounts, thumper for the rest) — §0.10 |
| 10 | mine each resource and have materials shipped back to base to refine into bars or other materials | M3 |
| 11 | which should all be automatable | M3 (dispatcher, keep-in-stock), M10 (lines) |
| 12 | as you progress through research you unlock better defenses and travel mechanisms | M3 unlock list → M9 Calculator; M10 |
| 13 | eventually new delivery methods like cars, trains, or boats | M10 (truck, train, barge) |
| 14 | all delivery methods actually have to travel and are in danger of enemy attack, so you have to defend them | M3 (no teleport, §0.9), M4 damage rule, M5 escorts, M10 hot routes |
| 15 | trains should have certain protection: rails can't be hurt as they aren't offensive | M10 — §0.7 |
| 16 | the train car is fast enough to outrun enemies or even plow through them | M10 |
| 17 | spells to interact with the world: tossing meteors, shield bubbles, a line of fire, zapping with lightning | M6 |
| 18 | these draw mana from HQ that is harvested by crystals and has to be processed before it can be used | M6 (harvester → refinery → HQ store) |
| 19 | mana batteries let you increase storage and unlock better spells | M6 (cap + tier marks) |
| 20 | from there the game becomes incremental in terms of economy, combat, etc. | M8 (daily report), M9 (global levels + repeatables), M15 (incremental tail) |
| 21 | through research you eventually can launch into space and send satellites to nearby planets and scan them | M13 |
| 22 | scanning is like KSP mods: scans at the orbit line, planet spinning reveals everything over several planetary days | M13 (stripe mapper) |
| 23 | different probes can detect different material | M13 (5 probes) |
| 24 | rockets deliver material to space and it has to be relayed back to HQ using a reliable, reusable automated transport system between space stations, one per planet, supplied by delivery vehicles | M14a (stations, ferries, landers, rockets) — §0.12 |
| 25 | the first system should always have 6–10 planets | M13 — §0.12 |
| 26 | eventually a warp drive built at a space station allows travel to a nearby star system | M15 |
| 27 | eventually trade routes between star systems | M15 |
| 28 | resources including mana are planet specific | M14b — §0.11 |
| 29 | a base on another planet comes with starting materials and a small mana battery | M14b (landing kit) |
| 30 | mana should slowly regenerate but ultimately requires mana crystal | M6 (regen to 25% of cap) — §0.11 |
| 31 | mana crystal also used to craft magical energy sources and empowered units | M12 (mana cell, crystal lens, battlemage, golem) |
| 32 | different planets have different and more dangerous enemies, but also useful high-tier resources | M13 (further = harder/richer), M14b (families, exotics), M15 (Driftborn) |
| 33 | everything represented in pixels with lighting: a spark emits light into nearby pixels | M1 (light buffer, emitters) — §0.13 |
| 34 | maybe a bump map system so tall pixels light up more | M1 (derived relief normals, visual only) |
| 35 | trains and walls may be seamless lines and curves rather than pixels | M4 (wall vectors), M10 (rail curves), M3 (roads) |
| 36 | the goal is not to micro manage units but to station them at permanent locations or on patrol paths | M5 (Post / Patrol / Response) — §0.3 |
| 37 | do a brainstorming session to expand these ideas | done: BRAINSTORM.md → ROAST.md → this PLAN |
| 38 | feel like I'm sitting at command HQ acting as commander, not a floating god | M2 (bunker, sensor scope) — §0.1 |
| 39 | interface with actual screens, knobs and buttons to interact with menus | M2 and every machine after — §0.1–0.2 |
| 40 | the interface should appear as physical machines used to view and interact with the world in an abstract way | M2 (scope as sensor), console grows through M16 |
| 41 | bonus points for satisfying explosions | M1 (blasts), M6 (meteor), M11 (chain reactions, hit-stop, bunker shake) |
| 42 | lava and water physics | replaced by the owner's change: fixed water/lava areas that react (steam, ice, lightning, burning) — M1 |
| 43 | making good use of the pixel physics system | M1 fire/smoke/debris; M4 rubble slows raids; M6 spells; M11 chains |
| 44 | it's OK to stray beyond my doc if it makes a better game; this is your game, built for me | additions in ROAST §3, delivered across M2–M16 |
| 45 | **Change:** forget lava and water physics … world flat, water/lava and cliffs as edges | §0.4; M1 (flat grid, fixed areas, cliff lines) |
| 46 | **Addition:** roads and potentially bridges to cross at least shallow water | M3 (roads, shallow bridges); M10 (deep and lava bridge levels, stairs) |
| 47 | **Change:** simplify roads to just a path; no upgrade; tedious detail | §0.6; M3 (one road kind) |
| 48 | **Change:** enemies only attack production or military buildings and offensive units, like Factorio | §0.7; M4 (`targets.js` + damage-rule table test) |
| 49 | **Change:** walls as a single thing; upgrades affect all walls (and roads etc.) everywhere | §0.5; M4 (global Wall levels), M9 (every kind's global levels), M10 (Road, Bridge, Rail levels) |
| 50 | (brief note) name chosen by Claude: Lodestar | title (M2), story goal beacon (M15) |

Note on 47 vs 49: the owner first said roads have "no upgrade", then that roads can be upgraded "which affect all …
roads everywhere". Read together: no road *tiers* or per-piece upgrades (47), and global road levels (49). That is
what M3 and M10 build.
