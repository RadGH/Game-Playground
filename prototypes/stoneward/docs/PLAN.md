# Stoneward — PLAN (design + milestones)

Owner: Radley Sustaire (independent). Sandbox. Planned 2026-11-03; verbatim brief in `OWNER-BRIEF.md`. Other games are named only in Claude-facing docs like this one, never in the game.

## Context

Radley wants a new game, **Stoneward**. It is a medieval, castle-era **city sim** (not an RTS) on a whole generated planet. The planet wraps around, and you can zoom out until it becomes a globe. The world runs on Kindlewild-style pixel physics, but with tall buildings drawn in a 3/4 view. The city grows mostly on its own. The player's job is to **expand, connect and defend**:
- reach newly scanned resource nodes;
- build mines and outposts on them;
- let automatic routes haul the goods home, since nothing counts until it arrives (the Project 5: Sightseer model);
- redraw walls as the city outgrows them;
- post guards and patrols;
- answer attacks and disasters with ruler powers.

Everything below comes from the owner's answers in this planning session. The first build step copies this section into `docs/OWNER-BRIEF.md` and `docs/PLAN.md`. Other games are named only here, never in the game.

---

## 1. Design (owner decisions)

### World
- **Planet:** a map that wraps east–west. North and south end in ice caps nobody can cross. At far zoom the map turns smoothly into a spinning globe.
- **Globe filters** (each can be turned on or off): kingdom borders, towns sized by population, night lights on the dark side, routes, train lines, armies, and data layers.
- **Size and scale:** 1 cell ≈ 1 m. Distance around the planet:
  - X-tiny 1 km
  - Tiny 2 km
  - Small 4 km
  - Medium 8 km
  - Large 16 km
  - X-large 32 km
- **Biomes:**
  - Temperate: grassland, forest, river valleys, hills.
  - Strange: volcanic wastes (vents, occasional eruptions), haunted moors (undead), crystal fields, ancient ruins.
  - Ice caps only at the poles.
- **Time:** day and night only, no seasons. A day is about 10 minutes at 1x.
  - Speeds: pause, 1x, 2x, 4x, 8x.
  - The game drops back to 1x when a big attack starts (this can be turned off).
- **Look:**
  - Kindlewild's chunky pixel size, bloom and glow.
  - Colour that shifts with the time of day: warm dusk, cool night, bright noon.
  - At night: amber windows, street lamps, wall torches, glowing forges, coloured magic towers. Outside the walls is deep dark.
- **Buildings:** made of real material cells (stone, timber, thatch, glass), built from hand-designed templates with random variation. All of them can burn, crack and fall.
  - Sprites only for UI icons, people and monsters.
  - The player's kingdom has one fixed style. Rival kingdoms each have their own.
- **Tallest structures:** keep → castle towers (about 30 m), cathedral spire and bell tower, wall towers and gatehouses, magic tower spires.
- **Simulation detail by distance:**
  - Full cell physics near the camera, near your towns and outposts, and wherever something is happening.
  - Far land sleeps and catches up when you come back to it.
  - Far towns and rivals run as plain numbers ("ledgers").
- **Fog:** land is visible from the start. Ores, lairs, bandit camps and rival towns stay hidden until **scanned**.
  - There is an automatic scan radius around your towns.
  - Outposts scan a fixed radius.
  - Scouts wander toward unscanned land on their own, or you tap to send one somewhere. Scouts can be killed.

### People and growth
- **Townsfolk:** a walking crowd (carrying, working, fleeing) that is **never clickable**. Information is shown per house, building and town.
  - Migrants only: no births, no aging. People arrive and leave depending on mood.
  - Jobs are fully automatic.
- **Tappable:** military units, scouts, carts and trains.
- **Growth:** organic and steered by roads. Migrants claim plots along roads near work, water and safety.
  - The player can paint **keep clear** and **build here** areas, and nothing more.
  - When the walls fill up, poorer, less safe **outskirts** grow outside along the roads.
- **Houses:** six levels: tent → hut → cottage → house → townhouse → manor.
  - Each level adds needs: water → food → church and market → bread, ale and cloth → furniture and safety → luxury.
  - Losing a need slowly drops the level.
  - **Merges:** neighbouring houses at the same level are rebuilt, a bit at a time, as one bigger and taller template (terrace → townhouse → manor with a yard, 2–4 storeys).
- **Mood:** needs met for the house level, safety and recent attacks, a tax slider, and beauty (gardens, statues, fountains, cathedral).
- **Auto-building:** the town builds almost everything itself: homes, services, industry and repairs. The player mostly lays roads, walls and military, and can place anything deliberately from the Build tab, which skips the town's queue.
- **New towns:**
  - An outpost with a road and safety grows into a hamlet, then a town.
  - Or place a Town Hall on purpose, which costs a settler wagon.
- **Demolish and move:** demolish anything for a partial refund. Erase walls with an erase tool. **Move** a building instantly for a gold fee.

### Economy
- **Resources:**
  - Core: wood, stone, food, water.
  - Metal: iron ore, coal, iron, tools and weapons.
  - Comfort: cloth, ale, bread, furniture.
  - Mana crystals, used only to build magic structures.
- **Food chains:**
  - Berries, fish, game and vegetables as basic food.
  - Grain → mill → flour → bakery → bread.
  - Barley → brewery → ale.
  - Sheep → wool → weaver → cloth.
  - Higher houses want 2–4 kinds of food.
- **Harvesting (Sightseer model):**
  - Find a node by scanning (ore shows in mountains and rocky land).
  - Build an extraction building on it.
  - It is served **automatically once a road connects it** to a town.
  - Nodes never run out; a richer node produces faster.
- **Global stock:** a good joins the kingdom-wide stock only once it reaches **any town's warehouse**.
  - Goods still sitting at an outpost don't count yet, and can be raided.
  - Build sites still need their materials carted to them.
  - Nothing ever teleports.
- **Carriers:** porters on foot → handcarts, ox carts and wagons (need roads) → river barges and boats (docks) → trains.
- **Roads:** dirt path → gravel → paved stone.
  - A bridge builds itself where a road crosses water; deep water needs stone bridges.
  - Paths form on their own where people walk a lot.
  - No traffic congestion.
- **Road danger:** each stretch of road has a danger level. Carts can be ambushed and lose their load. Patrols turn a road green. Escorts can be added on the Routes screen.
- **Gold:**
  - Comes in from taxes (by house level) and from selling surplus to **allies only**, through the Market screen and caravans.
  - Pays for guards (gold only: hire and wages), upkeep, and moving buildings.
- **Trains:** the fastest transport.
  - You draw the track and place stations. Track **can't be destroyed**.
  - Freight runs automatically, carrying whatever is short.
  - Passenger trains run on any line with 2 or more town stations. Connected towns share part of their appeal, and commuters fill job gaps.
  - No signals: trains pass through each other.
  - Enemies can only hit a train that has stopped or slowed down.
  - A Lines screen lets you add trains.

### Defense
- **Walls:**
  - Drag a line to place a wall at your best tier.
  - Towers are added automatically at corners and about every 30 m.
  - A gate is added automatically wherever a road crosses.
  - Walls can be upgraded in place: wood → stone → thick stone. Archers standing on walls get extra range.
- **Damage:**
  - Every wall cell has its own HP and shows cracks as it weakens.
  - At 0 HP the cell drops as debris and the column above it **falls straight down**.
  - A breach is a real gap that enemies walk through.
  - Debris fades after a few minutes.
  - Repair is **automatic and free**, slow, and only once no enemy is near.
- **Guards:**
  - Ordinary: watchmen, spearmen, archers, crossbowmen.
  - Siege towers: ballista, catapult.
  - Magic: mages; Lightning Tower (chains, good against swarms); Arcane Missile Tower (long-range homing, good against dragons and brutes); Shield Tower (a dome that absorbs damage and recharges); Flamethrower Tower (short cone, good against undead and siege).
  - Magic structures cost crystals to build, then have **unlimited ammo** and no upkeep.
- **Control:** select a guard or squad to set a post, draw a patrol loop, hold, or return to barracks.
  - Guards pick their own targets. You never click an enemy to attack it.
  - **Enemies near a patrol route call the guards automatically.**
- **Safety:** a coverage layer from patrol visits over time, red → green.
- **Outposts:** a small palisade fort with a scan radius. It holds goods from nearby mines until they are collected, has a garrison you set, and can grow into a hamlet.
- **Fire:**
  - Fire stations send firefighters who carry real water from wells and rivers.
  - Townsfolk near a fire join bucket lines.
  - Later: water wagons and cisterns.
  - Stone buildings and firebreaks stop the spread, so a town can survive a forest fire.
  - Your own towers never set fire to your town; your powers can.
- **Threats:**
  - Beasts: wolves, bears, boars, giant spiders.
  - Brutes: trolls, ogres, which smash walls.
  - Undead: rise at night from graveyards and ruins, and burn easily.
  - Dragons and drakes: rare flyers that ignore walls.
  - Bandit camps and raids.
  - Rival armies, which bring catapults and trebuchets (real blasts) and sappers with fire (they dig and burn wooden walls, and use fire arrows).
  - Enemies **scout and hit the weakest point**.
  - Threat grows with wealth, population and world difficulty. Lairs attack on their own timer. A Threat meter tells you what is coming.
- **Rivals:** a fixed small number (2–4).
  - Each starts with a rolled stance, split across a few allies, neutrals and enemies.
  - Each has an opinion of you from −100 to +100. Gifts and trade raise it; pressing on their borders, refusing their demands, or using powers on their land lowers it.
  - When opinion crosses a threshold the stance changes (with a warning first).
  - Allies trade and share roads and rails.
  - Rivals grow by the same rules you do.
- **Defeat:** a town is lost when its keep or town hall is razed **and** everyone has fled or died. Its ruins stay. If that was your last town, you pick a new landing spot with a fresh settler wagon. Achievements carry over.

### Ruler powers and disasters
- **Powers:** Call Rain, Smite, Meteor, Tornado, Black Hole, Earthquake, Firestorm.
  - Each has a **size choice (small / medium / large)**; cost and cooldown grow with the size.
  - Powers are paid in **faith**. Faith comes from churches, multiplied by the content people living within their reach, and has a cap (cathedrals raise it).
  - Powers can be used in combat. Meteor and Firestorm leave lava; Earthquake opens cracks in the ground.
- **World disasters:** Off / Rare / Normal / Frequent.

### Progress
- Endless play. **Milestones are population thresholds**, and each one pays a gold-and-goods chest plus a unique landmark to place.
- Special firsts (second town, first castle, first siege survived…) are achievements.
- **For now everything is unlocked.** The tier and research data and a single `unlocked()` check are built now, so gating can be switched on later.

### Screens and controls
- **HUD:** a top bar (population, gold, faith, time and speed, alerts) and a strip of alerts under it (tap one to fly the camera there).
  - A 30–60 s banner warns before a big attack.
  - A bottom dock with tabs: Build, Lines (roads, walls, track, patrols), Guards, Layers, Powers, Info.
  - Tapping something opens a bottom sheet about it.
  - A small "!" button in a corner reports a bug.
- **Build tab:** sections Homes & Services, Food, Industry, Extraction, Military, Magic, Transport, Beauty. Each item shows its cost, what it needs, and a "town wants this" badge. Tap → ghost → tap to place.
- **Info:**
  - Kingdom overview: one card per town (name, population and trend, mood, safety, top shortage, alerts) plus the Threat bar.
  - Economy & stock.
  - Routes & transport: each route with travel time, carts, load, danger, and buttons for +cart, priority, and steering it through a waypoint; plus train lines.
  - People & military: census, guard roster, patrols, outposts, attacks, known threats.
  - Market (allies).
- **Data layers:** safety and threat; water, food, faith and market coverage; fire risk and fire cover; land value; resources and nodes.
- **☰ menu:** save, load, world slots, new world, this world's settings, and Settings (graphics Low/Med/High, bloom, how dark night is, sound, controls, slow down on attack, UI size).
- **Title screen:** Play / Continue, What's new, Credits, account sign-in. No tutorial. No spectate mode.
- **Start:**
  - World settings: size, seed, how much land vs water, continents vs islands, rival count, monster density, raid strength, disaster frequency, powers on or off, faith rate.
  - Kingdom name (a random one is pre-filled).
  - Spin the globe; good landing spots are highlighted. Tap to land with a settler wagon and starting stock.
- **Camera:** phone is first and must work fully.
  - Touch: one finger acts, two fingers pan and pinch.
  - Keyboard: WASD (W = screen north), mouse wheel or Q/E to zoom.
  - Controller: sticks, triggers to zoom, A/B, d-pad through menus.
  - No camera rotation.
- **Sound:** ambience and effects through the shared `sfx/` library. The town hum grows with the city. Generated music beds change at night and during attacks.
- **Saves:** several world slots, autosave, and cloud backup when signed in. Only changed chunks are stored.
- **Players:** solo. The sim is kept pure and seeded so co-op can be added later.
- **Performance target:** a phone about 3 years old and mid-range: 60 fps in a medium city, never below 30 fps in a huge battle. A Low detail setting for older phones.

---

## 2. Technical approach

New folder `~/claude/playground/prototypes/stoneward/`:
- Sandbox project: auto-commit, no build step.
- ES modules, standalone CSS, data in JSON.
- A pure sim that gives the same result for the same seed and orders, running in a Worker (the Lodestar pattern, `lodestar/js/worker/sim-worker.js`).
- **Kindlewild and Lodestar code is copied and adapted, not imported.** Both assume a fixed map with hard edges, and both are live games.

1. **Planet on two levels.**
   - **Macro map:** about 1 macro cell per 32 m, seamless.
     - Built by adapting `worldgen/js/world.js`: sample `makeNoise3D` (`worldgen/js/noise.js`) on a cylinder, skip `applyEdgeMask`, wrap the x neighbour in drainage, regions and A*, keep `polarCaps`, and lift the 512×256 cap.
     - Result: height, biome, rivers, ore/lair/rival sites, and names (`namegen/`).
   - **Cell chunks:** 64×64, generated from seed + macro layers whenever they are needed. Only edited chunks are saved, as differences. An X-large world (32768×16384 cells) only ever holds about 1–2k chunks in memory, at roughly 32 KB each.
2. **Wrap:** one `wrap.js` handles all x wrapping and the neighbour tables, so no rule writes its own bounds check. Kindlewild repeats those checks in every file.
3. **Columns for the 3/4 view.**
   - Every cell keeps Kindlewild's arrays (`mat`, `ground`, `height`, `temp`, `life`, `flag`) plus three new ones: `tall` (0–31), `hp`, and `part` (which building or wall it belongs to).
   - The renderer draws front faces and tops shifted up by `tall`, back row to front row.
   - A cell at 0 HP turns its column into debris particles (from Kindlewild `blast.js` / `particles.js`). They fall straight down and become rubble that fades over time.
4. **Active set:**
   - Hot chunks: full physics.
   - Warm: your towns. Cells sleep until disturbed, and walkers get full detail only in the town you are looking at.
   - Cold: ledgers, which catch up on elapsed time when the chunk wakes.
5. **Logistics** (from Lodestar `economy/stores.js`, `logistics/dispatcher.js`, `paths.js`, `movers.js`):
   - The cost of a path is its travel time.
   - Warehouse pools form the global stock.
   - Long trips use a coarse region graph on the macro grid, to avoid Lodestar's 38 ms long-A* spikes.
6. **Rendering:**
   - Adapted from Kindlewild `js/render/gl.js`: glow bloom, sun shading, day/night, point lights.
   - Zoom steps crossfade into each other:
     - cell view;
     - town view, with a cached texture per chunk;
     - region view, from a macro texture;
     - globe, using `assets/js/space-models.js` `createPlanet` and `universe/js/texture.js` `planetTexture` (the pattern in `frontier-foundry/js/ui/orbit-screen.js`).
   - Data layers are quarter-resolution fields drawn by one shared overlay shader.
7. **Lot cutting:** plots are cut along each new road edge (the idea behind proctown `plotsInBlock`), so a house never sits on a road.
8. **Line tool:** one gesture for walls, roads, track, patrols and erasing (Kindlewild `js/ui/play.js` `lineTool`).
9. **`unlocked(id)`:** reads `data/research.json` and `data/tiers.json`, and returns true while everything is unlocked. A test checks that every build and power goes through it.

### §0 rules (breaking one is a bug)
1. It plays itself: growth, hauling, guard responses and repairs need no clicks.
2. Nothing teleports. A good counts only once it is in a warehouse.
3. Roads and track are never damaged. Walls and buildings have HP and fall as real debris.
4. Phone first. W is screen north. Touch, keyboard and gamepad work everywhere.
5. The same seed and the same orders always give the same game. The sim runs in node.
6. Every rule reads its data. Plain words and original names only (no "ember", "veil" or "muster"; see `docs/banned-names.md`).

## 3. Milestones

Each milestone follows Lodestar's format: Goal / Features / Owns / Tests / Owner can now. At most 3 helper agents run at once. All milestones are built in order, without stopping between them.

| # | Name | Owner can now |
|---|---|---|
| M0 | Planet | Pick a size and seed, pan a wrapping world, zoom from cells out to a filtered globe |
| M1 | Cells in 3/4 | See terrain, trees, rivers, lava vents and fire in 3/4 view, with day/night, colour grading and lights. Worker sim, streaming chunks |
| M2 | Settlers | Title screen, world settings, globe landing, keep. Migrants claim road plots and build houses; walking crowds; roads (3 tiers, bridges); warehouses and global stock; scanning; saves |
| M3 | Harvest & routes | Nodes, extraction buildings, outposts, automatic routes and the Routes screen, porters/carts/barges, scouts |
| M4 | Industry & homes | All industry chains, 6 house levels, needs, merges, mood and taxes, outskirts, Build tab with "wants", the Info screens, all data layers, move/demolish |
| M5 | Walls & ruin | Wall line tool with automatic towers and gates and in-place upgrades; per-cell HP, cracks, collapse, fading debris; free automatic repair; fire stations, bucket lines, firebreaks |
| M6 | Guards & magic | All guard types and towers, magic towers, posts, patrols, safety layer, automatic call to threats, outpost garrisons, road danger and escorts |
| M7 | Threats | Beasts, brutes, undead, dragons, bandits, raids, siege with catapults and sappers, weakest-point targeting, Threat meter, defeat and relocation |
| M8 | Rivals | 2–4 kingdoms with rolled stances, opinion, growth (full detail nearby, ledger far away), armies, ally trade and Market, shared roads |
| M9 | Powers & disasters | 7 powers × 3 sizes, faith, world disasters |
| M10 | Trains | Track, stations, freight and passenger lines, shared appeal, commuters, vulnerable trains |
| M11 | Big cities & perf | Many towns, ledgers, catch-up, mid-zoom detail levels, X-large on a mid-range phone, the night city at scale |
| M12 | Progress & publish | Population milestones with chests and landmarks, achievements, tier/research data wired up but off, sound pass, What's new, Credits, ! reports, cloud saves; then ask about listing on games.radgh.com |

Parked: co-op, research gating switched on, seasons, cultures for the player.

## 4. Files

- `prototypes/stoneward/`:
  - `index.html`, `README.md`
  - `docs/OWNER-BRIEF.md` (the owner's messages word for word, plus §1), `docs/PLAN.md`
  - `data/changelog.json`, `css/`
- `js/planet/`: `macro.js`, `chunkgen.js`, `wrap.js`, `globe.js`
- `js/sim/`: `world.js`, `cells.js`, `materials.js`, `blast.js`, `particles.js`, `columns.js`, `active.js`, `town/`, `logistics/`, `defense/`, `threats/`, `rivals/`, `powers.js`, `trains.js`, `unlock.js`
- `js/worker/sim-worker.js`, `js/render/`, `js/ui/`
- `data/`: `materials.json`, `buildings.json`, `goods.json`, `houses.json`, `guards.json`, `towers.json`, `monsters.json`, `powers.json`, `milestones.json`, `research.json`, `tiers.json`, `worldsettings.json`
- Registration:
  - a row in `data/experiments.json`
  - the `ALLOW` list in `prototypes/thousandvale/server/static.js`
  - the playground `CLAUDE.md` table
  - `~/claude/docs/stoneward.md`, plus entries in `docs.md`, `projects.md` (sandbox) and `docs/playground.md`
- Checklists: `~/claude/agent/stoneward-checklist.md` and one per milestone.
- Memory: Stoneward project pointer.

## 5. Verification

- **Node tests:**
  - the seam: a rule across the wrap gives the same result as mid-map;
  - the same chunk always generates the same cells;
  - an edited chunk survives save and load;
  - a column collapses and its rubble fades;
  - every haul takes at least distance ÷ speed;
  - goods count only once in a warehouse;
  - patrols raise safety;
  - enemies near a route draw guards;
  - trains take no damage while moving fast, and neither does track;
  - every build path calls `unlocked()`;
  - the same seed gives the same hash.
- **`tools/bot.mjs`:** a town left alone for N days on several sizes and seeds must reach a target population, survive a raid, and never run any stock down to zero.
- **`tools/perf.mjs`:** tick and frame time at X-large with a big city, with a phone budget.
- **Playwright** on dev :8401, desktop and a 402×780 phone, with zero console errors:
  - zoom from cells to the globe;
  - draw a wall, breach it, watch it repair;
  - open every layer and screen;
  - look at the screenshots.
- After each milestone: run `tools/publish-stable.sh`, then send the LAN link `http://<LAN IP>:8400/prototypes/stoneward/` (https :8442 for a controller).

## 6. Build status (2026-11-04)

All milestones M0–M12 are built on the `chibi26` branch of the playground repo. 73 node tests pass. README.md
documents each system.

M9 (powers) and M10 (trains) were built by helper agents in worktrees and then merged.

**Not done, or done more simply than the plan said:**

| Item | Where it stands |
|---|---|
| Listing on games.radgh.com | Ask Radley (game standards: new games are never listed automatically). |
| Stable server publish | `tools/publish-stable.sh` refuses: 3 avatar-3d unit tests from another session's chibi26 work fail. Not Stoneward. Not forced. |
| Data layers on the globe | The globe shows towns, borders, night lights, routes and armies. Safety, water and the other coverage layers show on the flat map only. |
| Rival towns | Ledgers drawn as real cells, not full cell-level towns running the town system. That system's stock is kingdom-wide, so rivals need their own stock first. |
| Route priority | Stored and shown, but has no effect: routes don't share a cart pool. |
| Commuters | Commuters fill open jobs in linked towns. Riding the train itself is not simulated: they walk. |
| Research and tiers | Wired and tested, but OFF (owner). There is no research screen until gating is switched on. |
| Ally help in battle | Allies trade and share roads; "send help" was not chosen by the owner. |

**Parked (§7):** co-op, gating switched on, seasons, player cultures.

## 7. Play-test 1 (2026-11-04) — owner's 12 items, all done

| # | Report | Cause → fix |
|---|---|---|
| 1 | Can't scroll the building list | Panels never scroll (a scrolling panel blanks the map on phones). The lists now turn pages: `pager()` / `pagerOf()` in js/main.js for Build, Lines, Routes, towns, Kingdoms, Market and Views. |
| 2 | Fireball-like sound loops every couple of seconds | Every cell catching fire anywhere on the planet played `fire.whoosh`, and `underAttack` (any enemy within 120 m of a town, every 2 s) played the horn. World sounds now carry a position, play only on screen and are rate-limited per kind; the horn plays once when an attack starts (js/features/sound.js, the worker's `sounds`/`fighting`). |
| 2b | Speed keeps resetting to 1x | Same `underAttack` flag. Only a real raid or army (`attack`) slows the game now. |
| 3 | Globe shadow on the side; bright cross-fade | The sun sits behind the camera (`sunDir()`). The whole globe dims at night (`uDark`). `globeAmount()` snaps between 0 and 1, with a gap between the two thresholds so it can't flicker. |
| 4 | Dotted-circle nodes unclear | Tapping a seam opens a card (what it is, its stars, how mining works) with a "Build a … here" button. The Views tab has a key for the map marks. |
| 5 | ! button off screen on iPhone | Moved into the ☰ menu. Opening the menu pauses the game. |
| 6 | Build panel blocks the view on phones | While placing or drawing, the panel becomes one strip (name, cost, hint, Change, Done). |
| 7, 10 | "Vegetable plant / Market was lost" | `intact()` counted EVERY footprint cell, so a market's open ground, a field's empty rows or a paddock's grass made it "lost" at once. It now counts only the cells the blueprint builds (not fields or crops). A loss says why: fire, enemies, or knocked down. |
| 8 | Great fountain is a grey slab | The `fountain` blueprint is now a stone basin (`basin`) with still water (`pool`, data/materials-beauty.json: shiny, faint glow, NOT a liquid, so it never floods). Its south lip is flat so the water shows in the 3/4 view. Fountains built before this keep their old cells. |
| 9 | Black and red squares | These are monster lairs. They can be tapped (what lives there, how often they come out) and turned off with "Monster lairs & camps" in Views. |
| 11 | Raid: where did they come from? | The spawn point is picked at the warning. The banner and toasts name the direction and fly to the spot, and a pulsing red ring marks it. Enemies near towns get a ⚔ counter in the top bar (tap to look at the next one), red markers when zoomed out, and arrows at the screen edge (`hooks.screen`). |
| 12 | Far wildfires out of control, fps | js/sim/wildfire.js: a fire with no town, building or rival town within 220 m spreads at 0.55× heat and burns out 2× faster. If more than 120 wild cells burn on average, natural rain falls on the fire's middle and nearby chunks go out a little at a time for a minute. |

Tests: town.test (open-plan buildings are not lost; fountain water), powers.test (a wildfire stays small and goes out). Screens: tools/shots-pt1.mjs, shots-pt1b.mjs.
