# Lodestar

A pixel-physics city-and-defence game played from a commander's bunker (independent project by Radley Sustaire,
sandbox). The spec is `docs/PLAN.md` (it overrides `docs/BRAINSTORM.md`); the owner's words are `docs/OWNER-BRIEF.md`.
Each milestone appends its own section below.

Run: dev server `tools/serve-both.sh` at the playground root, then `http://<LAN IP>:8401/prototypes/lodestar/`
(8441 over https for a controller).

---

## M6 — Mana and spells

**What it is.** The commander's magic, as fire missions with physics. Mana crystal is cut from crystal clusters,
carried home like any ore, boiled down to mana in a refinery that stands inside the HQ's yard ring, and kept in the
HQ's mana store. From the bunker you pull a cartridge on the Spell Board, mark the target on the Tactical Scope with
the light pen, and press FIRE. Every spell is made of the world's own rules, so it does what the world does.

Play it: build a Crystal harvester beside a mana crystal cluster and a Mana refinery inside the HQ ring (both arrive
with **Crystal lore** — 12 copper bars made). The refinery delivers two crates to the ARCANE bay: the **Mana Gauge**
and the **Spell Board**. Batteries arrive with **Mana storage** (120 mana refined) and open the tier II spells.
Keys: Enter = FIRE, Esc = put the cartridge back.

### The store (`js/sim/mana/index.js`, PURE)

- One store per base (mana never moves between planets), kept in thousandths so the slow regen is exact.
- **Regen** 0.5 a second, but only up to 25% of the cap (`mana.json store`). Past that line the store fills only from
  refined crystal: the refinery's jars of mana land in the HQ's own store (it stands in the HQ ring, so nothing
  teleports) and are poured into the gauge while there is room; when the gauge is full the jars pile up and the
  refinery's keep-in-stock (30) stops it.
- **Cap** = 100 + every battery's `capByLevel[global Battery level]` (one kind, global level, §0.5). Tiers open by cap:
  I 100 · II 400 · III 1,500 · IV 5,000.
- **Batteries burst** when destroyed (hp 0): radius = 4 + 0.9 × √(the charge it held), capped at 30. Pulled down, its crew
  bleeds it safely; the store spills down to the new cap either way.
- **Crystal clusters grow back** (`crystals.js`): every 30 s a cluster with any crystal left grows a crystal or sprouts
  one on worked-out ground beside a living one. Strip it bare and it never comes back.
- **Glow** (`glow.js`): every landed spell leaves a pulse, the refinery and each battery are steady sources — handed to
  M4's field through `sim.hooks.glow` / `sim.defence.pulse` (M4 rebuilds the field; M6 never writes it while M4 is
  there; a bare test sim falls back to writing and fading it itself).
- **Crafting hooks** for M12: `sim.mana.spend(n)` / `canSpend(n)` for empowered units, any recipe may take `crystal`,
  and a building with `power.fuel: { crystal }` is already a crystal-burning power source (`mana.json crafting`).

### The spells (`js/sim/mana/spells.js` casting, `effects.js` what they do, `data/spells.json` every number)

A cast is **two separate actions**: `arm` (the key turns itself, half a second) then `cast` with the pen's target. The
cost leaves the store at once, the key springs back, the cartridge recharges, and the spell **travels**: it lands
`base + perCell × distance from the HQ` ticks later. **The sight rule**: it lands only on a cell the scope sees LIVE
(inside a sensor circle, not hidden by smoke, lit or daylight) — refused in plain words otherwise ("Smoke hides the
target", "Too dark to see the target — light it, or send a sensor flare first"). The flare needs only a sensor circle.

| Spell | Tier | What it does in the world |
|---|---|---|
| Lightning | I | `world.lightning`: in water the charge runs through everything connected (every creature standing in it is hit, none on dry land); on land it jumps from creature to creature, each jump a little weaker, each hop a real dry strike that scorches and lights the spot |
| Shield bubble | I | a dome for 30 s: creatures inside are put back outside the skin, nothing inside may burn or warm toward burning (a fire front stops at the edge), the smoke is kept out, and `shotBlocked()` tells M4's shots it is there |
| Line of fire | I | a streak races along the drawn line lighting everything that burns and scorching bare ground glowing hot; water steams, roads and cliffs never burn; creatures in it keep burning |
| Sensor flare | I | a star on a parachute: a sensor circle that LIGHTS the ground (the night sight rule reads the light) for 45 s |
| Meteor | II | falls in from the north-west for ~3 s (warning ring with a countdown), then a power-2.2 blast: a crater ringed in rubble (rubble slows walkers to its walk %), white-hot core, 26 burning blobs on debris arcs that set fires where they land, the bunker shakes |
| Frost snap | II | `world.frost`: water freezes into walkable ice, fires go out, creatures caught are stiffened (`slowUntil` / `slowBy`) |
| Call rain | II | `world.rain` over 40 cells for 45 s: wet ground, drowned fires, mud |
| Stone ridge | II | a line of `ridge_stone` cells nothing walks through for a minute, then crumbles to rubble; it leaves gaps over roads (your carts still pass), never covers buildings, water or ore |
| Mend | II | heals your buildings, wall sections and squads in a circle, puts their fires out, greens burnt ground |

**The damage rule**: every hit goes through `js/sim/mana/harm.js`, which hands it to M4's `sim.defence.hurt` (THE rule,
§0.7) — spells follow the physics and may hurt our own production and military buildings, never infrastructure,
houses or carriers. The meteor's damage rides on its blast (`world.blast(…, { by: 'spell', damage, splash })`), which
M4's blast hook applies. With no defence module the same table is applied locally.

**Combos** (first time each, a commendation from High Command on the teletype): charged water, chain lightning, steam
bath (meteor into water), hard-light firebreak, doused, ice trap, kindling, night strike (by flare light), chain
reaction (a blast set off a battery).

### Console (`js/console/arcane.js`, `machines/gauge.js`, `machines/spellboard.js`, `js/render/spellfx.js`)

- **Spell Board**: nine bakelite cartridges (colour band, cost stamped, tier plate; tier II behind a striped shutter
  stamped with the cap it needs; a draining amber bar while recharging), the arming key with ARMED / TARGET lamps, a
  repeater of the gauge with its **ghost needle** (where the store drops if you fire), a red FIRE button under a guard
  that flips up only when the key has turned and a target is marked, SAFE. A status strip says what to do next, the
  ETA, or why not. Phone: three-wide rack, FIRE + SAFE column, no repeater.
- **Mana Gauge**: log-scale face (0 … 5,000) with a black store needle, a thin brass cap needle, the red reserve band
  that refills by itself, engraved tier marks, nixie readout, REFINING / REGEN / JARS / BATTERIES lamps and tier lamps.
- **Aiming**: pulling a cartridge turns the light pen into `aim` (tap) or `aimline` (drag) — new pen tools through
  `C.penTools`; the glass shows the area, cost and ETA, red with the reason when the target is not in sight
  (`C.overlays`).
- **Looks**: `spellfx.js` paints into the WebGL scope (`scope.addPainter`) so the light is real: the meteor's head and
  trail and the light it throws on the field before it hits, the shield's shimmering skin and the cool light under it,
  the fire line's racing head, the flare hanging and swaying, rain streaks, ridge dust, chain arcs between hops, frost
  and mend bursts. The world's own renderer draws the rest from the cells (fire, blasts, debris, ice, the flooded
  water). Meteors and battery bursts shake the bunker (`#app.shake-big`) with room sounds.
- `window.gameEye.arcane()` → `{ aim, mana, tool }`; `window.gameEye.fxSlow(k)` stretches every effect for screenshots.

### Shared files M6 touched (appended only)

`data/buildings.json` (harvester, mana_refinery, battery), `resources.json` (mana, `sources.crystal`), `recipes.json`
(harvest_crystal, refine_mana), `research.json` (arcana, mana_storage), `materials.json` (ridge_stone, mana_glass with a
`light` row), `js/sim/systems.js` (the `mana` row), worker FILES + `tools/lib-data.mjs` DATA_FILES (`mana`, `spells`),
`js/console/machines/index.js` (2 rows), `index.html` (2 CSS links), `js/main.js` (installArcane + the event-hook loop),
`js/console/machines/scope-bezel.js` (penTools / overlays hooks), `js/render/scope.js` (`addPainter`), PLAN §3 rows.

### Tests

`node --test prototypes/lodestar/tests/m6-*.test.js`: `m6-mana` (regen stops at an odd 37% share and refined crystal
passes it; regen rate odd knob; refinery only inside the HQ ring; the crates arrive with the first refinery; battery cap
follows the global level for batteries built before the level-up; burst radius grows with charge, a pulled-down
battery does not burst; clusters regrow unless stripped; shards are carried home no faster than the walk and refined;
gauge face; data shape and names), `m6-spells` (two actions; cost, travel and cooldown; tier II refused below 400,
allowed at 400 with a battery, odd tier mark; the sight rule for never seen / outside sensors / smoke / dark, and a
flare making a dark spot live; lightning through a ford hits everything wading and nothing on dry land; the dry chain
weakens; a shield stops a fire front at its edge and puts creatures outside; drawn == measured shield skin; meteor
rubble slows walkers by the rubble walk %; infrastructure untouched by a meteor while production is hurt; fire line
stops at water and never burns a road; frost and rain; ridge blocks then crumbles, gap over a road; mend; Glow;
combos once; meteor pose; same seed + same orders = same hash with spells). Playwright `m6-spells.spec.js` (desktop +
phone touch: refinery → crates → arm → pen target → FIRE → the bolt lands, board and gauge fit the drawer with 44 px
targets and nothing scrolling, tier II shuttered, a target in smoke refused, Esc puts the cartridge back; zero console
errors). Screenshots: `node prototypes/lodestar/tools/shots-m6.mjs [desktop|phone] [scene]` → `shots/m6/`.

### Not in M6 (by plan)

Chain storm (tier 3) and the crystal crafting rows — mana cell, crystal lens, battlemage, crystal golem (M12, hooks in
place); per-planet mana colour and schools (M14b); the ward pylon / shield emitter towers (M12); saves of the store
(M8 — `sim.mana.save()` / `load()` are ready).

---

## M4 — Walls, towers and raids

**What it is.** The defence half: the home world is a survival game. Skitterkin nests in the woods grow, feed on the
noise your camps and machines make, and send raiding parties at the loudest thing in reach. You draw walls (one wall
kind, global levels), put towers behind them, and lose if the headquarters falls.

Play it: NEW GAME, then raise **WALL (2)** and drag a line on the scope. The pen shows the wall the sim will build —
smoothed, its length, its sections and its (small) timber price; amber rings where it joins another wall, blue rings
where it runs on to a cliff or deep water; red with the reason if it cannot stand. Let go and the blueprint is down at
once; builders carry the timber and lay it a few sections a trip. Hold **Shift** for a ruler-straight wall. A **tap**
with WALL up on a wall puts a gate there; CLEAR on a gate seals it, CLEAR on a wall takes that 4 m section away; Z undoes
the whole wall (30 s). Towers are on the Build Ledger (watch post from the start; the others on the unlock list). The
**THREAT** filter shows Noise (amber) and Glow (violet) contours, seen nests with their stage, tower ranges and enemy
blips; every raid's **predicted path** is a red arrow on every filter from the moment it forms, with how long until it
leaves the nest. RAID / HQ / CONVOY lamps blink (the klaxon sounds on RAID and HQ); the radio tells the story.

### The rules, as the owner asked for them

- **One wall, global levels** (`data/upgrades.json`): I timber (burns), II stone (fireproof), III steel-banded
  (towers may stand on walls), IV poured (acid does a quarter), V runed (mends itself, gives off Glow). A level-up
  re-stamps EVERY wall cell with that level's material and scales every section's hit points to the new top — walls
  drawn before it included. One look change per level: Wall I is a palisade of stakes; II and up are coursed blocks,
  with the level's trim paint on both edges.
- **Easy to draw** (§0.8): an end within 3 m of another wall joins it; an end near a cliff, deep water or lava runs on
  to it; a drag that comes back to its start is a ring; a near-straight drag comes out straight (Douglas-Peucker, then
  the road's smoothing); cheap (0.25 timber a cell) and fast.
- **Gates**: a road across a wall gets a gate in that section by itself (the gate offer M3 left a hook for is taken —
  a road walled off would quietly break the porters); our porters and carts walk through, enemies treat a gate as wall.
- **Broken sections** turn to rubble (or back to the ford they stood in); once no enemy has been near for a while
  the blueprint brings the builders back to rebuild them and patch worn ones. **RING CLOSED** when a wall seals a
  pocket with other walls, cliffs and water (a bounded flood of the ground an enemy could walk).
- **THE damage rule** is one module, `js/sim/defence/targets.js` (`canDamage`, `hurt`, the `RULE` table). Enemies hit
  only production and military buildings (towers, masts, the HQ), walls and gates, fighting units (M5) and porters /
  carts **while they travel**; never roads, bridges, rails, depots, huts, sheds, houses, town services, builders,
  settlers or piles. A vehicle row with `protected: 'moving'` (M10's trains) is the other way round. Our own fire and
  blasts follow the physics on the same set, never on infrastructure; our mortar shells are fuzed for our side.
- **Nests** (`data/nests.json`): 6–10 on a Normal map (scaled by area), far from the HQ, in or by the woods; stages
  1–5 grow over time and faster when Noise reaches them; from stage 4 they bud new nests; destroyed, they leave a core
  sample (`sim.samples`, for M9). Their guards come out for a tower that shells them.
- **Noise and Glow** (`js/sim/defence/fields.js`): quarter-res, max-spread from every running machine (idle ones hum at
  a quarter), the HQ, gunfire, blasts and the town (`sim.hooks.noise`, M7); forest soaks it up. Glow comes from
  `sim.hooks.glow` (M6) and Wall V. Nests feed on both by their family's weights.
- **Raids** (`js/sim/defence/raids.js`, `js/world/flow.js`): a fed nest raids often, an unfed one rarely, none before
  the difficulty's grace time. The target is the loudest damageable building in reach (else the nearest; a hungry nest
  sends its party out to 1.8× its reach). The flow field is Dijkstra from the target's footprint over the box round
  nest and target (the whole map if that box cannot reach), built a few thousand cells a tick while the raid forms:
  shallow water is a wade, deep water / lava / cliffs are impassable, roads are ×1.2, and a wall section or a building
  they may attack is a **blocker** whose price is its hit points — so they walk round a short wall and chew through
  the weakest section of a long one. The same field gives the predicted path the scope draws.
- **Towers** (`data/towers.json`): watch post (sight + lamp + crossbow), bolt thrower (big single bolts, shells nests),
  gun nest (bursts with tracers, loud), mortar pit (shells on an arc that land as real blasts: rubble, fire, debris,
  splash). They shoot only what is on LIVE sight — not into the dark, not through smoke — and over our own walls.
  Global level per kind (`tower.<id>` in `sim.levels`).
- **The HQ falls = game over** (Standard, Grim); on **Calm** it is crippled for a day (towers at half rate, it cannot
  fall further) and then patched to half.

### Files

| File | Job |
|---|---|
| `js/sim/defence/index.js` | wires it all; building hit points, ruins (rubble, fire, a blast, half the store as salvage), carriers lost on the road (load dropped as a pile, replaced at home), every `world.blast` → damage by the rule, the commands `drawWall` / `addGate` (+ `dev.raid`, `dev.build`, `dev.wallNow`, `dev.level` for tests), the global levels from the unlock list, the hud block |
| `js/sim/defence/targets.js` | THE damage rule |
| `js/sim/defence/walls.js` | wall records, sections, exact cell ownership, stamping by level, damage and breaches, gates, CLEAR / undo / erase, builders' wall tasks, the ring check, fire on timber walls, Wall V mending, the rebuild after a raid |
| `js/sim/defence/fields.js` | Noise and Glow |
| `js/sim/defence/nests.js` | layout, growth, feeding, budding, guards, raid timers, core samples |
| `js/sim/defence/raids.js` | targets, flow fields, spawning, spotted / at the wall / beaten / withdrawn |
| `js/sim/defence/enemies.js` | walking the field, biting, spitting acid, chasing carriers, dying (husk stains, chitin debris, a burst for the big ones) |
| `js/sim/defence/towers.js` | acquiring on live sight, bolts, bursts, shells |
| `js/world/flow.js` | the incremental flow field (BLOCK = a blocker; diagonals need both sides open) |
| `js/world/vectors.js` | (wall part) `planWall`, `simplifyLine`, `crossings`, `canHoldWall`, walls over shallow water |
| `js/render/vectors.js` | the wall field (distance + section info) the shader draws the smooth band from |
| `js/render/foes.js` | enemies, bolts, tracers, shells on their arc, spit, sparks, splats (a scope painter) |
| `js/console/defence.js` | WALL on the pen, the glass overlay (blueprints, breaches, gates, raid arrows, THREAT), events → radio / teletype / lamps, the last screen |
| `data/towers.json enemies.json nests.json upgrades.json radio.json`, `balance.json defence`, `buildings.json vectors.wall` + tower rows, `research.json` M4 rows, materials (wall levels, gate, tower footing, sandbags, husk, nest) | every number |

Shared files touched (append-only or a line each): `js/sim/index.js` (createDefence), `systems.js` (8 rows),
`commands.js` (CLEAR / undo / erase reach walls; hooks may answer `{ ok, id }`), `economy/construction.js` (wall sites
go to walls.js), `economy/buildings.js` (`ghostCheck allow`, `hooks.placeOn`), `logistics/dispatcher.js` (`release`
exported), `world/blast.js` (wall cells only heat — the section takes the damage), `js/world/vectors.js` (planRoad lets
a road cross a wall), the worker (walls, `foes`, `defence`, `threat`), `world-link.js`, `render/scope.js` +
`cells.glsl.js` (wall texture + `wallLook`), `main.js` (frame hook, walls apart from roads, RAID/HQ/CONVOY lamps left
to M4, `C.keyDown`), `pen.js` (a tap with a line tool), `scope-bezel.js` (THREAT stamp, `tap:` tools).

### Owner feedback fixed in M4 (2026-10-28)

- The THREAT filter's "NO CONTACTS" stamp stayed on after turning back to SIGHT — `setFilter` reset the stamp memory
  to `null`, which is exactly SIGHT's "no stamp", so the clear was skipped. Test: `tests/m4-feedback.spec.js`.
- The KLAXON panel is gone: MUTE sits at the end of the alarm lamp strip; hold it (or right-click) for the lamp test.

### Measured (2026-10-28)

Raid bot match (`node tools/raid-match.mjs`, written to `research/balance-m4.md`): 6 seeds, small map, 60 game
minutes, Standard, the bot defending through ordinary commands (`tools/bot-defence.mjs`: watch posts by the HQ and
loud worksites, bolt throwers by whatever was raided, gun nests and a mortar once unlocked, a wall across each raid's
predicted path): **18 raids, 228 raiders killed, the HQ stood on 6 of 6**; 2–4 raids a game-hour per seed; 18 buildings
lost (camps, lumber camps, watch posts, bolt throwers) and 4 carriers. M3's economy bot still reaches 500 copper bars
on all 20 seeds with raids on. Cost: a bot game of 72,000 ticks with raids takes 30–60 s of wall clock in node (about
0.4–0.8 ms a tick on average, the world and economy included); a raid's flow field is built at up to 60,000 cells a
tick while it forms. The 100-raid stress test runs in ~30 s.

### Tests

```
node --test --test-concurrency=1 prototypes/lodestar/tests/m4-*.test.js
flock /tmp/claude-1000/farhold-pw.lock node_modules/.bin/playwright test prototypes/lodestar/tests/m4-
```

`m4-damage` (the rule table for every buildings.json row by tag and every entity kind; 60 s of enemies beside roads,
a bridge, a depot, a hut, a house and a pile = zero damage, beside a watch post = hit; moving porters bitten, parked
ones not, the load dropped, a replacement sent; our blasts hurt military, never infrastructure; shells are fuzed),
`m4-walls` (join at 2.9 m not 3.1 m, odd knob 5 m; snaps; rings; straightening; builders lay; global level raises the
hit points of earlier walls and re-stamps every cell; the unlock row raises it; Wall I burns, Wall II does not; gates
and the road gate; RING CLOSED; undo / CLEAR; Wall III towers on walls; **drawn == measured**: the wall field the shader
draws is exactly the sim's wall cells and exactly the raid field's blockers), `m4-raids` (loudest target with an odd-knob
swap; no target → no raid; bud only from stage 4 with an odd knob; fed nests grow faster; forest soaks Noise; the field
wades a ford, never deep water, round a cliff; walks round a short wall, chews the weakest section of a long one; the
predicted path is where they walk; **100 raids** on walled and open bases with fords, cliffs, lakes, gates and towers —
every raid over within the time cap, none stuck; HQ loss = game over, Calm = crippled), `m4-towers` (live sight only,
over our wall; level × damage odd knob; mortar = real blast, splash, our wall untouched; nest killed → core sample, the
guards came out), `m4-bot` (the raid bot match, determinism with raids, M4 data names and references). Playwright:
`m4-defence.spec.js` (desktop mouse + phone touch: WALL drawn → laid; drawn == measured on the renderer's own copies
plus a wall pixel differs from grass; a raid with its path and the RAID lamp; THREAT), `m4-showcase.spec.js` (a walled
base takes a raid by day and by night; screenshots), `m4-feedback.spec.js`. Screenshots: `shots/m4/`.

### Not in M4 (by plan, or parked)

Squads, floodlights and the radar mast (M5 — `hooks.unitHurt` is ready); spells feeding Glow (M6 — `hooks.glow` and
`sim.defence.pulse('glow', …)` are ready); the Calculator replacing the unlock rows for levels (M9); trains'
protection (M10 — `protected: 'moving'` is in the rule); a CURVE switch for touch (a touch drag already follows the
finger; only Shift gives a ruler line, so on a phone a wall is as straight as the drag, cleaned up by the simplifier);
summary-sim raids at unwatched bases (M14b). The "gate offer" is taken automatically rather than asked.

---

## M7 — The town

**What it is.** A town grows round the HQ and works the industry. The landing party (20 people) sleeps in the HQ's
bunks; settlers walk in from the edge of the map whenever there is a free bed, food and water in the stores, morale is
not low and no enemy is near the homes. Every building with jobs is staffed by the town itself — food and water first,
then nearest a home — and everything works at the speed the **morale needle** says (×0.6 … ×1.2). Nobody is ever
assigned by hand: the player places houses, farms, wells, a Commons and lamps, and has one town switch (SETTLERS).

Play it: NEW GAME → the **Town Board** crate arrives with the HQ (drawer bay, FRONT; phone: MORE). The Build Ledger
has six new cards: House, Farm field, Fishery, Well, Lamp post and (after the Town charter) Commons.

### How it is built (`js/sim/town/`, PURE)

| File | Job |
|---|---|
| `index.js` | `ensureTown(sim)` — started by the `town` row of `js/sim/systems.js` on the first tick; installs `hooks.workFactor` (workers ÷ jobs × the crop share of a farm × the morale factor; builders and road crews get the morale factor), `hooks.place` (the fishery's bank rule), `hooks.hud` (`hud.town`), `hooks.commands.setTown`, `hooks.noise` (M4's Noise field). Puts the landing party in the HQ and its food and water in the store. Applies global levels from research rows that carry `levels`. API for M5: `town.draft(n)` / `town.release(n)` (squads come out of the labour, keep their beds) |
| `people.js` | homes and beds (House `beds` list indexed by the global Housing level, so a level-up gives EVERY house more beds at once; HQ bunks), meals from each home's own pool, pantries for homes outside a yard ring, settler groups walking in from map-edge gates and people walking out, rehoming when a house comes down |
| `jobs.js` | `assignJobs` — staff-first rows, then nearest a home, ties by id; the INPUT lamp "no workers" |
| `morale.js` | the pure morale rule: five weighted inputs minus smoke, residents' average, needle step, factor |
| `fields.js` | farm crops drawn from the batch (tilled → young → ripe → harvest), burnt crop cuts output, the farm replants; the fishery's bank check; chimney smoke from running smelters and generators and lived-in houses |

### The rules, as the owner asked for them

- **Nothing teleports.** Food and water are resources like ore: a farm or fishery outside the yard ring is its own
  store and porters carry the food to the HQ; a house outside every ring keeps a **pantry** (a few meals) that it asks
  the dispatcher for, so porters walk the food and water out to it. Inside a ring, homes eat from the shared store.
  Settlers are entities that walk the same routes as porters (`migrant` kind, §3.2).
- **No micromanagement.** Jobs fill themselves. The only town order is the SETTLERS switch (close the road when food is
  short). Every staffing and morale reason is on a lamp.
- **Damage rule (§0.7).** Every M7 building is tagged `town` (house, farm, fishery, well, Commons, lamp post) and
  settlers have no class in M4's `targets.js`, so enemies never damage them (tested against `canDamage`). The farm's
  crop BURNS — fire follows the physics.
- **Population** never exceeds the beds. No food or no water → nobody new comes, and a home that misses
  `leaveAfterMeals` meals in a row loses a person (they walk off the map).
- **Morale inputs** (Town Board lamps): FOOD (last meal had food), WATER, COMMONS (within a Commons' 40 m), LIGHT (the
  coarse light field over the home is bright — the HQ yard, a lamp post, a fire), SAFETY (no enemy within 30 m of a
  home: a raid inside the walls). SMOKE: chimney smoke over a home costs `smokePenalty`; it is real gas that drifts
  with the wind, so a smelter upwind of the houses smokes them out and the same smelter downwind does not.
- **Town size feeds Noise**: one source at the middle of the homes, 0.6 a person (M4 spreads it).
- **Housing level**: the Town charter row (150 food made) raises it to II and unlocks the Commons; M9 takes over.

### Data

`buildings.json` 6 rows tagged `town` · `resources.json` food, water · `recipes.json` grow_food, fish, draw_water ·
`vehicles.json` migrant (settlers walk at 1.8 m/s) · `research.json` town_charter · `materials.json` field,
crop_young, crop_ripe, roof_house, chimney, well_water, plaza · `balance.json` `town` block (every number above) ·
`console.json` the Town Board row.

### Console

**Town Board** (`js/console/machines/town.js`, `css/machines/town.css`): a brass-rimmed MORALE gauge whose needle sits on
the work-speed scale (red below ×0.8) with a dashed ghost needle for where it is heading, nixie counters (PEOPLE/BEDS,
JOBS FILLED/JOBS, ON ROAD, days of FOOD and WATER), six input jewels (amber = some people, red = half or more), the
SETTLERS bat switch and a paper strip saying why nobody is coming. The Build Ledger's inspect line reads `CREW 3/4` or
`5/6 LIVE HERE`. Settler groups are drawn on the scope as people with bundles (mover kind 3). `gameEye.state().econ.town`
and `act('movers')`.

Small hooks added to other milestones' files (each one line or a few, marked M7): `buildings.js` canPlace runs
`sim.hooks.place`; `sim-worker.js` sends settlers as movers and `jobs/workers/residents/beds/cropShare` on buildings;
`scope.js` draws kind 3; `eye.js`; `ledger.js` inspect line; `bot.mjs` calls `tools/bot-town.mjs`.

### Bot and balance

`tools/bot-town.mjs` is bot v1's town part (one call from `tools/bot.mjs`): a well, a farm per ~45 people, houses
whenever the jobs outnumber the people (spare beds only once timber is plentiful), a lamp by any dark home, a Commons
when the Town charter arrives. `node tools/balance.mjs --seeds 20 --out research/balance-m7.md`.

Adding workers to M3's buildings means the economy now waits on people, food and water. Measured 2026-10-28, 20 seeds,
small map (with M4's and M6's work in progress in the same tree): **20 / 20 reach 500 copper bars; 15.9 / 18.4 / 46.1
game minutes (min / median / max)** against M3's 15.9 / 17.7 / 40.3. The median barely moves because a staffed,
fed town runs at about ×1.1 to ×1.17 (morale above the middle of the needle) while it waits for hands; the slow seeds
are the timber-starved ones M3 already had (wood across a river), where every house competes with the industry for
timber. A typical bot town at the goal: 15–23 houses, 3 farms, 2 wells, a Commons, ~100 people. Wall clock rose from
~2 s to ~6 s a game (the bot plays more game minutes and M4's raids run in the same tree); the town itself costs
0.025 ms a tick on average (p99 0.18 ms; the worst tick, 11 ms, is one settler group's route search from the map edge),
about 14% of the sim's time with 127 people (seed 209, 20 game minutes).

### Tests

`node --test prototypes/lodestar/tests/m7-town.test.js` — population never over the beds (also when a house comes
down); no food → stops growing then falls, and grows again when fed; Housing level raises beds of houses built before
it (and the Town charter row does it); damage rule (M4's `canDamage`) for every town row and walking settlers; smoke
from an upwind smelter lowers morale, downwind does not; work speed = morale factor with odd knobs 0.37 / 1.43; each
input's weight; jobs: food first, then nearest, draft frees a job and lights "no workers"; settlers start at the map
edge and never arrive sooner than distance ÷ walking speed; a pantry outside the ring is filled by a porter walking
there; fire in the crop cuts the share and the farm replants; fishery bank rule; SETTLERS switch; determinism.
Playwright `m7-town.spec.js` — desktop: the crate, settlers walking on the scope (drawn == sim), the board's counters,
needle angle (drawn == measured) and lamps against the sim, the switch; a showcase town by day, dusk and night; phone:
the board fits its drawer, nothing scrolls, the switch ≥ 44 px. Zero console errors. Screenshots: `shots/m7/`.

### Not in M7 (by plan, or parked)

Squads drawing people (M5 calls `town.draft`), Housing levels III–V (M9's Calculator), a raid that is "inside the
walls" in M4's sense (M7 counts an enemy within 30 m of a home), commuting people drawn walking to work (workers are
counted, not drawn), lit windows (the LIGHT input uses the light field, so windows would light themselves).

---

## M3 — The economy core

**What it is.** The first real loop: the HQ stands where you land, camps dig the outcrops you can see, porters and
mule carts carry everything home, refiners make bars and planks, and a bot plays it to 500 copper bars. The desk now
always runs the REAL sim in its worker (the M2 stand-in world is retired), the fog comes from the sim, and so does the
day clock.

Play it: `http://<LAN IP>:8401/prototypes/lodestar/` → NEW GAME. The Build Ledger crate arrives the moment the HQ is
raised. Open it (drawer bay / phone MORE page), press PLACE on a card, and the BUILD switch goes up with a ghost on the
pen: green where it can stand, red with the reason where it cannot. Raise ROAD (3) and drag a line: the road is
smoothed, joins anything within 3 m, the price and length ride on the pen, and red gaps show what it cannot cross.
Tap a building with no switch up to read its card (lamps, recipe, keep-in-stock knob, PULL DOWN). Z = undo (30 s, all
of it back). CLEAR (6) clicks a building or a stretch of road away.

### How the sim is built (`js/sim/`, PURE — runs the same in node and the worker)

| File | Job |
|---|---|
| `index.js` | `createSim(data, { seed, size, noHq? })` → `send(cmd)`, `step()`, `drainEvents()`, `hud()`, `hash()`. Lands the HQ at the surveyed spot (the bunker you sit in). Lists the **extension points** M4/M6/M7 use: `hooks.workFactor(b)` (M7 staffing × morale), `hooks.built`, `hooks.roadPlanned` (M4 gate offers), `hooks.commands` (drawWall, setOrder…), `hooks.sensors`, `hooks.hud`, `hooks.systems` |
| `systems.js` | the ordered system list (append only): world → events → fog → survey → production → dispatch → vehicles → builders → movers → unlocks → outcrops |
| `entities.js` | the §3.2 store (ids never reused, id order, 1/256-cell integer positions) |
| `commands.js` | every §3.3 command, checked, refused in plain words (not-yet-built ones say what is missing) |
| `clock.js` | the day clock (`balance.json day`); `dev.hour` shifts it for tests |
| `data.js` | compiles the data files and fails at load on any broken cross-reference |
| `economy/buildings.js` | placement (on the map, seen ground, buildable cells, not on a door, beside ground to work, affordable after what sites are waiting for), the SITE stamp, the finished LOOK (cells: floor paving, roofs, crates, furnaces, lamps — pixels with light, roofs really block walking), doors, pull down (half back as a salvage pile, all of it within the undo window) |
| `economy/stores.js` | stores and POOLS: HQ + depot yard rings, overlapping rings join (union-find), a building inside a ring uses the pool, one outside is a pool of its own |
| `economy/production.js` | camps / drills / refiners / generators; keep-in-stock; power as one number (supply ÷ demand slows every powered machine evenly); the POWER / INPUT / OUTPUT jam lamps with the reason |
| `economy/survey.js` | outcrops (cells; known once seen; recounted from cells), shallow deposits (records, laid from the seed), thumper pulses |
| `economy/construction.js` | builders: fetch the cost from the nearest pool, carry it, work the site; roads as 24-cell SPANS laid as the builder walks them; a bridge span needs its timber first |
| `economy/roads.js` | drawRoad → plan → blueprint → laid ranges; erase (CLEAR / undo) |
| `economy/unlocks.js` | the simple unlock list (`research.json`): a row is done once the base has PRODUCED its totals |
| `logistics/paths.js` | A* on the full cell grid; the step cost IS the travel time for that carrier (walk %, road bonus, wheels only on `vehicle` cells or roads); found routes are kept 2 game minutes, failed ones 30 s, anything that blocks a cell clears them |
| `logistics/movers.js` | everything with a route spends one tick of travel time a tick — so nothing can arrive sooner than distance ÷ top speed |
| `logistics/dispatcher.js` | the automatic dispatcher: the HQ wants everything, other pools offer what they don't need, producers pull their inputs, depots "keep here"; jobs go to the nearest idle carrier, a cart when it moves the load faster per unit |

`js/world/vectors.js` gained the road geometry (`smoothLine` — Chaikin, resampled to whole cells; `planRoad` — join,
price, refuse with gaps; `applyPart` — lay a stretch). `js/world/fog.js` is now THE fog rule (M2's, thresholds from
`balance.json sight`), worked out in the worker every 20 ticks.

### The rules, as the owner asked for them

- **Nothing teleports.** Between pools, goods move only on a porter or a cart that walks the route (they are on its
  `cargo` the whole way, ready for M4's raiders). Inside one yard ring, buildings share the store. Builders carry their
  sites' costs too. A refund outside a ring is a pile the porters fetch.
- **Limited outcrops, only the surface ones known.** An outcrop's total is the sum of its cells (`amt` × 8 units);
  worked out, the cells turn to scar that slowly greens. A new game knows the outcrops inside the HQ's sensor circle;
  a sensor mast pushes sight out; a survey thumper's pulse ring finds shallow deposits (4–12 k units) for drills.
- **Automatable, not tedious.** Every producer has a keep-in-stock default; camps pick their ore; the smelter burns
  coal, or timber when there is none; carts are chosen by themselves; lamps say exactly what is wrong. The only
  per-building settings are the recipe, the keep knob and a depot's keep-here.
- **One road, a path.** Roads cost nothing; a road over shallow water is a bridge (timber per cell of span); deep water
  and lava are refused with the global Bridge level that would span them, cliffs with Road stairs. Drawn look: a smooth
  band from a distance field (`js/render/roads.js`) whose edge is exactly the cells the sim walks as road — wheel ruts,
  verges, a plank deck with rails over water and its shadow on the water.
- **The lumber camp costs nothing**, so a base can never run out of wood for good.

### Data (every number)

`data/resources.json` (11 resources, where each raw comes from, deposits) · `recipes.json` (14 recipes, `fuel`
alternatives, default `keep`) · `buildings.json` (13 kinds with size, tag, cost, work, ring, store, sight, power,
crew, jobs, look; `vectors.road`) · `research.json` (6 unlock rows) · `vehicles.json` (porter, mule cart, builders) ·
`balance.json` (day, sight, start stock, economy). `materials.json` gained 14 building/ground materials (appended) and
smaller ore amounts (limited outcrops: ~300–3,000 units each).

### Console additions

Build Ledger (`js/console/machines/ledger.js`, `css/machines/ledger.css`): CARDS (rolodex, cost stamped in ink,
locked cards say which plans and how far along), STORES (nixie tally + power / porters / carts / builders / sites),
INSPECT (lamps with reasons, recipe buttons, KEEP mini knob OFF–∞, a depot's KEEP HERE, PULL DOWN with a second press).
The scope overlay (`scope-bezel.js`, glyphs in `js/render/sprites.js`) draws sites with progress, names and jam lamps,
the ghost with its yard ring / reach / survey circle, unlaid road as a dashed line, the road price, red gaps, survey
pulses; the ORE filter lifts ore out of a grey world and rings every known outcrop and deposit with what is left; FLOW
greys the world, lights the roads and draws the yard rings and what each outlying store holds. Porters, carts and
builders are drawn by the WebGL scope as lit pixels with a dot of their load's colour, interpolated between frames.
`js/console/world-link.js` replaced `m1-bridge.js` and the `stub/` folder.

### The bot and the balance run

`node tools/bot.mjs --seed 7 [--log]` plays one game; `node tools/balance.mjs --seeds 20` writes
`research/balance-m3.md`. Bot v1 plans: lumber camp first (a sensor mast if no wood is in sight), camps on the nearest
copper / coal / stone, porters' huts, roads to every camp outside the yard, the smelter with keep-in-stock off the
limit, sawmill (keeping 50 planks), cart shed, more smelters when ore piles up, a mast when copper runs low, thumper
and drills when they arrive.

Measured 2026-10-28, 20 seeds, small map: **20 / 20 reach 500 copper bars; 15.9 / 17.7 / 40.3 game minutes (min /
median / max)**; carriers busy 79% of the time; ~140 m of road a game; about 2 s of wall clock a game. The lamp that
lights most is a camp's OUTPUT (its 40-unit store fills faster than porters empty it) — the cue to build a depot beside a
far camp or another porters' hut; the slow seeds are the ones whose only wood is across a river.

Same seed + same orders = same game, across engines too: the showcase shots (`shots/m3/desktop-base-*.png`) were made by
replaying the bot's 23 orders for seed 7 into the browser's worker at the same ticks, and after 9,000 ticks the
browser's stores matched node's to the unit (280 timber, 192 copper ore, 216 coal, 116 stone, 39 planks, 42 bars).

Cost of the economy (node, Normal map, the bot playing, 12,000 ticks, fires not burning): **median 0.01 ms a tick,
p95 0.8 ms, worst 38 ms** — the worst ticks are one long route search (A* round a river to a far ford). Route results are
cached, so it is rare; if it ever shows as a stutter the next step is a coarse region graph in front of the search.
Memory: the route search keeps four arrays a cell (16 bytes × 2.4 M cells ≈ 38 MB on a Normal map).

### Tests

```
node --test --test-concurrency=1 prototypes/lodestar/tests/*.test.js        # all node tests (M1 + M2 + M3), ~2 min
flock /tmp/claude-1000/farhold-pw.lock node_modules/.bin/playwright test prototypes/lodestar/tests/   # browser
```

M3 node tests: `m3-transport` (every haul took at least distance ÷ top speed; conservation of units; yard ring sharing
inside vs outside; overlapping rings join with an odd-knob ring of 41; keep-here), `m3-outcrops` (drawn == measured:
an outcrop's total is its cells and they sit inside the drawn ring; only seen outcrops known; worked out = zero for
good, scar; odd-knob units per lump), `m3-production` (keep-in-stock odd knob 37; OFF and ∞; INPUT names coal, OUTPUT
when full; power factor = supply ÷ demand with an odd HQ supply of 7; generators burn only when needed; unlock at an
odd 9), `m3-roads` (smoothing; laying; shallow → bridge, deep refused with the unlock and the red gap where the water is,
then built at Bridge II; bridge timber carried; cliffs; join at joinCells 9; cart on/off road time ratio = the data's;
drawn == measured road field vs cells, junction and bridge included), `m3-survey` (pulse every 137 ticks, radius 51:
inside found, 52 not; drills drill the deposit record), `m3-contracts` (entity fields, every command answers, system
order, every cost is producible, every building unlocked once, no banned names), `m3-bot` (20 seeds reach 500 bars;
same seed = same hash after 20 bot minutes). `m2-fog.test.js` now tests the sim's fog. Playwright `m3-economy.spec.js`
(desktop + phone: ledger → ghost → camp → road by mouse / touch → copper at the HQ, drawn == measured road pixels,
ORE / FLOW, inspect, stores, refusal over deep water, undo; zero console errors). M2's specs run on the real world now
(fog samples moved off the HQ, which is a real building; the ledger crate arrives at tick 0).

Screenshots: `shots/m3/`.

### Not in M3 (by plan, or parked)

Gates where a road meets a wall (M4 — the `roadPlanned` hook is there), the damage rule (M4 reads `tag`), squads (M5),
the mana refinery (M6), houses and workers from the town (M7 — `jobs` / `workers` are on every building, all filled),
saves (M8), the Calculator (M9 — it replaces `research.json`'s rows), trucks / trains / barges / the Dispatch Board
(M10), building rotation (every building is square-on), deep deposits.

---

## M2 — The bunker (the console)

**What it is.** The whole interface is a desk of physical machines round a CRT, and every machine is also a fast
control (PLAN §0.1–0.2). Plain HTML/CSS/SVG machines, synthesized room sounds, no images, no build step.

**Screens.**
- **Title = the bunker hatch** (`js/console/title.js`, `css/title.css`): NEW GAME (difficulty, map size, seed — knobs
  and a nixie seed readout with ROLL), CONTINUE (the last world's seed + settings, from localStorage
  `lodestar.lastGame`; real saves arrive in M8), WHAT'S NEW (`shared/whats-new.js`, `data/changelog.json`, empty until
  the first publish), SETTINGS. Starting spins the wheel and swings the hatch open (under a second; skipped with
  reduced motion).
- **The desk** (`js/console/desk.js`): one DOM, three CSS layouts — desktop grid (`css/bunker.css`), phone portrait
  and phone landscape (`css/phone.css`, breakpoint `max-width: 899px` or `max-height: 559px`). On a phone the scope,
  the lamp strip and a strip of mini knobs stay on screen and everything else lives in ONE fixed-height drawer that
  pages — TOOLS · DIALS · TIME · LOG · MORE — and never scrolls. On a desktop a pulled-out drawer takes the lower part
  of the scope's bay (the scope shrinks above it; nothing is ever covered).

**Machines** (`js/console/machines/`, registry `machines/index.js` — one line per machine, append only):

| Machine | File | Controls |
|---|---|---|
| Tactical Scope | `scope-bezel.js` | the picture; grid-reference stencils round the glass; readout (pen grid square, cell, range, filter); DEGAUSS (colour wobble, thunk); CHART / filter / TIME STOPPED stamps |
| Range knob | `range.js` | 6 detents ¼ ½ 1 2 4 8 px per cell; ¼ and ½ draw the chart (`js/render/chart.js`) |
| Filter selector | `filter.js` | SIGHT works; ORE / FLOW / THREAT show their empty layer ("NO SURVEY DATA"…) — M3/M4 add to this file |
| Tool bank | `toolbank.js` | BUILD WALL ROAD RAIL ORDER CLEAR toggles, one up at a time (slap); RAIL capped until unlocked |
| Time dial | `timedial.js` | PAUSE 1× 2× 4× (0/20/40/80 ticks a second) |
| Teletype | `teletype.js` | typed-out log, red ribbon lines, OLDER / NEWER pages, PIN (cork strip); M8 adds the daily report printer |
| Radio | `radio.js` | speaker grille, signal lamp, subtitles (voices arrive in M11) |
| Alarms + Klaxon | `alarms.js` | RAID FIRE CONVOY HQ BASE jewel lamps (press a lit one = scope jumps there), klaxon on RAID/HQ blink, MUTE, LAMP TEST |
| Day clock | `dayclock.js` | sun/moon disc behind a window + nixie time; M11 adds the barometer |
| ☰ menu + Settings | `menu.js` | Return, What's new, Settings, Quit to title. Settings: SOUND, QUALITY, PAD PEN knobs; ROOM HUM, RADIO VOICE, CRT GLASS, TOUCH PEN ABOVE FINGER toggles |
| Drawer bay | `desk.js` | groups FRONT / LOGISTICS / ARCANE / SPACE as tabs; RESERVED plates for every machine not yet earned |

**Parts** (`js/console/`): `knob.js` (pure `knobModel` + DOM knob: drag, wheel, key, pad, tap a detent; `mini` 44 px
variant where a tap on the left/right half steps it; `bind` gives one value several faces — the phone strip knob and
the drawer knob turn together), `switch.js` (bank of bat-lever toggles, pure `pressSwitch`), `lamp.js`, `pen.js`
(light pen), `padnav.js` (controller), `view.js` (pure: centre + range, grid refs; screen north = smaller y),
`settings.js` (pure load/save with try/catch), `state.js` (tiny observable store), `link.js` (the line to the world).
Sounds: `js/audio/room.js` (detent clicks that climb in pitch, toggle slaps, push-button clunks, teletype hammers +
bell, squelch, klaxon, degauss, freight lift + crate, hatch, 50 Hz hum + fan). Overlay glyphs: `js/render/sprites.js`.

**Inputs.** Every knob: drag (right/up = clockwise, 26 px a detent), wheel (one notch a detent; trackpads accumulate),
arrow keys / Home / End when focused, tap a labelled detent, and the controller. Keyboard: WASD / arrows pan (W =
north), Q E or − = range, F filter, 1–6 tools, Space pause, `,` `.` time, G degauss, Esc = undo pen point / close drawer
/ drop tool / menu. Mouse: drag with no tool or right/middle drag = pan, wheel on the glass = Range at the cursor.
Touch: one finger pans (no tool) or draws (tool up) with the reticle 40 px ABOVE the finger and a dotted cord to it;
two fingers pan + pinch (pinch steps the Range knob a detent at a time). Controller (`padnav.js`, Tumblefair's model):
d-pad walks an amber highlight between controls (spatially, edge to edge), the machine holding it lights its amber
FOCUS lamp; A presses; **A on a knob grabs it** (lamp turns green), d-pad turns it, A/B lets go — so the d-pad can never
get trapped; B backs (undo point → close window → close drawer → drop tool); LB/RB jump machine to machine; left stick
= light pen (snaps to the HQ when you let go near it; pushing past the glass edge pans), right stick = pan (up =
north), LT/RT = Range, Select = Filter, X = Tool bank, Start = ☰. Gamepads need https: port 8441 (dev) / 8442 (stable).

**Fog of war** (rule in `js/console/stub/fog.js`, node-tested): quarter-res field, 0 never seen (crawling static), 1
seen before (the last picture in grey), 2 live (full colour). Live = inside a sensor circle (HQ: 160 cells,
`console.json sight`) AND gas below `smokeBlocks` AND (daylight ≥ `darkBelow` OR light ≥ `litAbove`). Seen stays seen.

**The console grows.** `data/console.json` lists every machine with its group, place (`desk` or `drawer`) and the
unlock that delivers it. A `machineUnlocked` event (§3.4) drops a crate down the freight lift into its RESERVED slot
(lift whine, thud, "THIS SIDE UP"), the teletype prints the delivery, and the slot becomes a live drawer pull. A machine
whose milestone has not landed yet arrives as a placeholder panel.

**Behind the glass (until M1 is wired).** The console talks to the world only through `js/console/link.js`: commands
out (§3.3 shapes), §1.2 frames in (chunks of §3.1 cells, quarter-res `gas`/`fog`/`light` fields, `hud`, `events`).
Today the other end is a STAND-IN world (`js/console/stub/world.js`, pure, seeded, node-tested) with grass/forest/
sand/river with fords/lake/lava/cliff plateau/outcrops, an HQ spot, a forest fire whose smoke blinds the sensor, a
day/night clock and plain-word `refused` answers for every build/draw command. It is drawn by a stand-in 2D renderer
(`js/console/stub/scope2d.js`). **`index.html?world=m1`** runs M1's real world instead, through
`js/console/m1-bridge.js` (M2's file — M1's files are untouched): `createM1Link` starts M1's worker
(`init / view / rate / cmd` in, `ready / frame` out, and sends the visible rectangle every frame), and
`createM1Renderer` wraps M1's WebGL scope (`createScope` → `setWorld / putChunk / putGas / putFog / setDebris /
event / render / readAt`). Until the worker sends a fog field of its own, the bridge works the fog out on the page
with the same rule (`stub/fog.js`) from the gas in the frames and the HQ's sensor circle; when M1/M3 send
`fields.fog`, pass it through and delete that block. Tested by `tests/m2-m1bridge.spec.js`.

**window.gameEye** (`js/eye.js`): `state()` → screen, modal, drawer, page, tool, range {index, ppc, chart}, filter, pen
{x, y, grid, src}, tick, rate, needles {day, hour, daylight}, lamps, view, focus {machine, label, grabbed}, machines.
`act('probe', x, y)` (fog + drawn pixel together), `act('unlock', id)`, `act('hour', h)`, `act('smoke', x, y)`,
`act('centre', x, y)`, `act('hq')`, `act('padMark', selector)`, `act('flush')`.

**Tests.** Node: `node --test prototypes/lodestar/tests/m2-*.test.js` (knob model incl. odd-knob drag threshold, switch
bank, teletype paging, view north + zoom anchor, grid refs, pad spatial pick, settings with a throwing storage, chart
downsample keeps cliffs/lava/ore, frame merge, console.json shape + registry rows, banned names, fog rules incl.
odd-knob thresholds, stand-in world purity + repeatability + refusals). Playwright (run alone, under the lock):
`flock /tmp/claude-1000/farhold-pw.lock node_modules/.bin/playwright test prototypes/lodestar/tests/m2-` from the
playground root — `m2-knobs` (every knob × every input × every detent, desktop + phone), `m2-gamepad` (title → game →
every machine → ☰ → back with A/B/d-pad only; sticks; phone handles), `m2-layout` (5 sizes incl. 402×780 and
780×402: no overlaps, every tap target ≥ 44 px, nothing scrolls, nothing off screen — title, its windows, the desk,
every drawer page, an open drawer, menu, settings), `m2-scope` (drawn == measured fog: outside the radius never live
and drawn grey, inside live and in colour; smoke over a lit cell hides it; night keeps only lit spots live; W/up pan
north; wheel = Range; chart view; crate delivery; tool bank; settings survive a reload). Every spec asserts zero
console errors. Screenshots: `node prototypes/lodestar/tools/shots.mjs` → `shots/m2/` (MORE=1 adds every phone page).

**Not in M2 (by plan):** the "!" report button and account pill (M8), radio voices (M11), FLOW/ORE/THREAT contents
(M3/M4), the barometer (M11), real saves (M8).

---

## M1 — The cell world

**What it is.** The flat pixel world the whole game stands on, and the page that proves it looks right and runs fast
enough before anything else is built: `bench.html` (paint toy + perf readout, kept forever as the perf check).

Open it: `http://<LAN IP>:8401/prototypes/lodestar/bench.html` (options: `?seed=7&size=small|normal|large&crt=0&q=low|standard|high&zoom=2`).
Tools along the bottom: Pan, Paint (pick a material — grass, dry grass, trees, soil, sand, rock, coal, crystal,
shallow/deep water, lava, wall, cliff, road), Fire, Blast, Big blast, Frost, Lightning, Rain, Lamp; `⋯` opens brush
size, time of day, wind direction and strength, quality, CRT, speed, seed + map size, "80 fires", "50 blasts", global
rain, and "Next sight" (jumps between the HQ spot, the fords, the lava field and the plateaus). Wheel / pinch zooms
through the six Range detents (¼ ½ 1 2 4 8 px per cell); WASD / arrows pan (W = screen north); right-drag pans.

### How a cell works (PLAN §3.1)

One `Uint32` per cell: `mat` (8 bits, index into `data/materials.json` `list` — order fixed, new rows append), `temp`
(8 bits on `tempCurve`, ambient 60 ≈ 20 °C), `amt` (8 bits: fuel left, ore left, or wall hit points), and flag bits
`burning owned scorched road bridge rail edge wet`. **There is no height anywhere** — relief is worked out by the
renderer from the material's `relief` and a position hash, and no rule reads it.

The map is ONE buffer laid out chunk by chunk (`js/world/grid.js`): chunk `ci` is cells `[ci·4096, ci·4096+4096)`, so
`grid.chunk(cx, cy)` is a real `Uint32Array` per 64×64 chunk (what frames and saves send) while the rules still walk
across borders with one index function. Quarter-res fields (one byte per 4×4 cells): `gasDensity`, `gasKind`, `wet`,
`fog`, `noise`, `glow`, `light`.

**Sleeping chunks.** Only awake chunks run the fire/heat rules. A chunk wakes when something touches it (paint, a
blast, debris, a spark) and stays awake while anything in it burns or is hotter than ambient; then it sleeps. Gas, wet
and regrowth keep their own per-chunk "awake" flags.

### The rules (all in `js/world/`, all pure and deterministic)

| File | What it does |
|---|---|
| `fire.js` | Every tick. A burning cell (and lava next to something burnable) heats its 8 neighbours — side 4, diagonal 2, times the **wind table** (`fire.windWeights[strength][0 downwind … 4 upwind]`). A flammable cell warms by `gain` per 4 heat and catches at `igniteAt`; `gain` is worked out from the material's `ignite` ticks so one calm side neighbour lights it in **exactly** that many ticks (odd-knob tested). Wet cells take heat only `wetHeat` of the ticks. Road, bridge and cliff cells never burn; heat only goes through a diagonal corner if one of the two side cells can burn, so a one-cell line of stone or a diagonal road is a real firebreak. Burning spends fuel and puffs smoke; at zero the cell becomes its `burnsTo` (scorched ground, ash), glowing and cooling. Water that gets heat steams; ice melts. Only burning cells are visited in the scatter pass (a list kept by the apply pass), and idle cells cost one masked compare. |
| `gas.js` | Every 2nd tick, awake gas chunks only: diffuse, decay, and the wind carries `advect[strength]` of each cell downwind. Kinds: smoke, steam, ash. `gas.blindAt` is where it blocks sight. |
| `blast.js` | Breaks ground instead of digging it: core → the material's `blast` result (ground → rubble, tree → burning log), ring → `blastRing` (grass → scorched); everything inside gets hot (glowing rubble), burnables catch, ice melts, water steams, walls lose hit points. Broken cells throw debris. Emits an `explosion` event. |
| `debris.js` | Particles on a fake arc (a pretend height used only for drawing). Caps: `debris.max` (300) alive, `landingsPerSecond` (80) turning into cells; a spawn over the cap is refused, a landing over budget waits on the ground then vanishes. Landing: hot into water → steam; hot on burnables → fire; on bare ground → rubble. |
| `water.js` | `frost` (water → ice / thick ice, fires out, very cold — thaws back by itself in about 40 s, `frost.warmEvery`; heat melts it at once), `lightning` (floods the charge through CONNECTED water, 4-way, within `floodRadius` and `floodMax`; ice does not conduct; a dry strike scorches and lights), `rain` (a shower over a circle). |
| `slow.js` | Every 20 ticks: thaw, wet field (rain up, drying down; crossing `wetAt` sets the cells' wet bit, `mudAt` turns bare soil to mud), regrowth (scorched → grass over `regrowTicks`, ash → scorched, rubble → gravel), and the coarse `light` field (is this spot lit at night). |
| `fog.js` | The three-state fog field (never seen / seen before / live) from sensor circles, blocked by gas and by darkness. M2's console has its own stand-in (`js/console/stub/fog.js`, used by `js/console/m1-bridge.js` when the desk runs on this world with `index.html?world=m1`); this is the world-side version for when the fog moves into the sim. |
| `vectors.js` | Polylines rasterised into cells (cliffs now; walls, roads, rails later) — so the drawn line and the blocked cells are the same cells. |
| `edges.js` | `walkable()` and the walking flood (8-way, no cutting a blocked corner). |
| `mapgen.js` + `noise.js` | The home world (below). |
| `world.js` | Wires it together: `createWorld(data, { seed, size })`, `step()`, `blast/ignite/frost/lightning/rain/paint`, `hash()`. |

Every number is in `data/materials.json` (`fire`, `gas`, `blast`, `debris`, `frost`, `lightning`, `wet`, `slow`
blocks plus the per-material rows) and `data/mapgen.json` (the home archetype). `js/sim/rng.js` is the seeded
generator: `split(name)` gives each system its own stream keyed by NAME, so adding a system never shifts another;
trig comes from a table built with + × ÷ only.

### The home map (`js/world/mapgen.js`)

One long river edge to edge (deep channel, shallow edges, **2–4 fords** where the channel stops), 1–2 lakes on it and
maybe one more, the HQ spot on open land away from the water, a lava field ringed in basalt far from the HQ
(obsidian where it meets water), 1–2 plateaus whose rims are **cliff polylines with 1–2 gaps**, ground cover from two
noise fields (grass, dry grass, forest with clearings and shrubby edges, soil patches, beaches), and rock outcrops of
copper, iron, coal, building stone, silica sand and mana crystal — one of each of the first four within reach of the
HQ. Last, a walking flood from the HQ: any land it did not reach gets a ford cut to it (islets in deep water become
water). `meta` carries the HQ spot, fords (with their crossing direction), lakes, lava, plateaus, cliff polylines and
outcrops.

### The worker (`js/worker/sim-worker.js`)

Owns the world; the page sends commands (`dev.*` paint-toy commands in M1) and the view rectangle. Each frame posts
only chunks that changed AND are in or next to the view (≤ 96 a frame, centre first), the changed gas chunks, the
debris list and the events. Every buffer is a fresh copy and is **transferred**, never shared. M3 swaps the bare world
for `js/sim/index.js`; the frame shape stays.

### The renderer (`js/render/`, raw WebGL2)

`scope.js` keeps its OWN copy of every chunk it has been sent (same layout as the sim) and one `R32UI` world texture
holding the sim's exact 32 bits (updated a chunk at a time), plus an RG8 gas texture and an R8 fog texture.
Passes:
1. **Emitter pass** (`light.js`) — a world-space light buffer over the view plus a 40-cell margin, one texel per 2/3/4
   cells by quality: fire, lava (animated crust), lamps, crystal, hot ground; then point splats for hot debris,
   blast flashes, lightning through water. A dual-filter blur sums five scales with a gain of 1.35 per scale, so a lamp
   lights ~15 cells, a fire front ~30, and a lava field the whole plain. Because it is in world space, a glow covers the
   same metres at every zoom.
2. **Cell pass** (`cells.glsl.js`) — palette with per-cell variation and big soft patches, **relief normals from the
   four neighbours** (visual only), sun from the time of day with short soft shadows toward the sun, ambient
   occlusion, emitter light that is **brighter on the side of a raised pixel that faces the light** (it reads the
   light buffer's gradient) and stronger on tall pixels, water with slow swell + thin glints + reflected emitter
   light, ice with cracks, patchy rime on frozen ground, flickering flames, ember glow, smoke/steam/ash lit by the
   fire under it, fog (off on the bench).
3. Debris pixels with shadows; additive fireballs, shock rings, splashes and lightning bolts.
4. **Bloom** (`bloom.js`) on the brightest pixels, then **CRT** (`crt.js`: tone curve that bleaches fire cores instead of
   clipping, barrel curve, scan lines, mask, vignette, grain, phosphor afterglow on High). CRT off = a clean picture.

Quality: **Low** = dpr 1, light every 4 cells, 4 blur levels, no bloom, no afterglow · **Standard** = dpr ≤ 1.5, every
3 cells, bloom · **High** = dpr ≤ 2, every 2 cells, bloom, afterglow. 8-bit fallback when the device cannot render to
half-float targets.

### Tests

```
node --test --test-concurrency=1 prototypes/lodestar/tests/m1-*.test.js      # rules, mapgen, determinism, bench
flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/lodestar/tests/m1-bench.spec.js
node prototypes/lodestar/tools/bench.mjs [--seed 7] [--chunks 80] [--ticks 200] [--blasts 4]   # tick timings
```

`--test-concurrency=1` matters only for the timing test (parallel files share the CPU). Node tests: fire runs downwind
faster, spreads evenly in still air, never crosses shallow/deep water, a road or a one-cell line of stone (also
diagonally); the ignite odd knob (dry grass at 7 ticks catches on tick 7, grass at 13 on 13); wet cells catch later;
scorch regrows (odd knob); smoke drifts downwind; chunks go back to sleep; no height field exists and the blast centre
is rubble/scorched; trees become burning logs; the debris cap holds under 50 blasts (and an odd-knob cap of 37); hot
debris into water steams; frost ↔ heat round-trips and thick ice thaws back to deep water; lightning floods only
connected water, stops at ice, stays inside its radius (odd knob); rain makes mud and dries back, and puts fires out;
50 seeds: every walkable cell reachable from the HQ, the river runs edge to edge with ≥ 2 fords that really cross;
every listed feature exists; no `Math.random`/clock/DOM/`fetch`/engine-dependent maths under `js/sim` and
`js/world`; same seed + same orders → same hash after 2,000 ticks; named rng streams; the material table compiles.
Playwright: the bench page at 402×780 (touch, dpr 2) builds the map, ticks, draws fire, blasts, frost, lightning and
rain with **zero console errors**, no horizontal overflow, every button ≥ 44 px; and **drawn == measured** — at a
cliff and at a ford the pixels drawn as cliff / deep water are exactly the cells the sim blocks, and the ford's
crossing is drawn wadeable all the way over.

### Measured (2026-10-28)

This VM has no GPU (software WebGL through SwiftShader) and its CPU was shared with other agents' test runs, so
read the browser frame rates as "it runs and is correct", not as phone numbers. The phone check that matters is the
owner opening the bench on his phone.

| What | Measured |
|---|---|
| World rules, node, Normal map, 80 chunks kept burning (`tools/bench.mjs`) | **2.8–3.0 ms median** a tick (98–107 awake chunks, ~250 gas chunks, ~30 k burning cells), p95 5.3–6.7 ms — target ≤ 4 ms ✔ |
| Same plus a big blast every 4 ticks (stress, far past any raid) | 3.3–4.0 ms median, p95 5.9–7.3 ms |
| Small / Large map, same fire load | 3.9 / 3.9 ms median (measured under load; the cost is per awake chunk, ~0.03–0.04 ms each, not per map size) |
| Map generation (node) | Small ~0.7 s · Normal ~1.1–1.3 s · Large ~1.8 s |
| World rules in the browser's worker, 80 fires, 83 awake chunks, 32 k burning cells | 3.1–3.8 ms median, max 7–11 ms (Chrome headless, CPU shared with software GL) |
| Debris under 50 simultaneous blasts | peak 300 alive, 80 landings a second (both caps hold) |
| Bench page weight (M1 code + data, uncompressed) | 177 KB — no images, no libraries |
| Frame rate, SwiftShader (software GL), 1280×800 | idle 15–25 fps; with 80 fires on screen 1–3 fps (the CPU is drawing the GPU's work and running the sim at once) |
| Frame CPU cost (main thread, outside the GPU) | 0.1–0.7 ms a frame |

How it got there: the fire's scatter pass visits only a list of burning cells, rows of a chunk with nothing going on
are skipped whole (a 64-bit row mask per chunk), the middle of a big fire stops costing anything once a burning cell
has nothing left to heat, smoke is puffed one tick in four per cell, and idle cells cost one masked compare.

### Not in M1 (on purpose)

Walls, roads, rails as drawn vectors with their own look (M3/M4/M10 — the rasteriser is ready), flow fields (M4),
the console around the scope (M2), saves of chunks (M8). Breaching cliffs with blasts is cut by the PLAN.
