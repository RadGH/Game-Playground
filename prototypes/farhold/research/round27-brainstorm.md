# Farhold round 27 — brainstorm: detail, terrain / roads / bridges / gates, and enemy factions

> The ask: *"Continue by adding detail, refining the terrain/road/bridge/gate system, add the enemy
> factions with bosses and etc. … They should EXTEND current features rather than add new ones."*

This is a list of ideas, not a plan. Nothing in the game was changed to write it. Every idea names the
module(s) it grows out of. The handful that would be a **new system** rather than an extension are
marked **[NEW]**, and there are few of them on purpose.

How it was researched: RPG.md rounds 21–26, `FUTURE_SYSTEM_BRAINSTORM.md` §7b, a read of the owning
code (three survey passes over terrain/roads/bridges, walls/gates/towns and the enemy/faction
systems), and two read-only node probes that build real worlds with `js/planet.js` (the same code the
game runs) and measure the roads and bridges. The probe numbers are quoted where they matter.

**Sizes:** S = an afternoon, one or two files. M = a day or so, a few files plus a test. L = several
days, touches many files or needs its own design pass.

**The three faults this project keeps making** (every idea's risk line checks against these):

1. **A finished module with no way in** — built, tested, and called by nothing.
2. **A multiplier written twice** — the same factor applied on both sides of an interface.
3. **Drawn vs measured geometry** — the mesh and the collider/height query work the thing out
   separately, and disagree.

Testing rule for every idea: measure the real thing (build the world, walk it, read the mesh's own
buffer, count what spawns). Don't pin a sentence or a tuning number.

---

## 0. What the survey found that is already wrong or half-built

These are weaknesses in the current code, found while reading it. Several ideas below are really
"finish this". File:line references are as of commit `073a0ab`.

### Terrain
- **Roads run straight up mountains.** On the user's own world (seed 25392) at full planet size,
  **97 of 780 road segments are steeper than 20%** and 55 are steeper than 30%, including the only
  highway: stretches of 37% grade 130–160 m long, and one segment at 167%. On seed 4477 it's 3
  segments over 30%. World Forge's A* works on 640 m map cells, so it can't make a switchback inside
  a cell, and Farhold never adds one.
- **Cliffs are only a colour.** Round 21 put real cliff faces in the height (2.5% of land now steeper
  than 63°), but they are drawn as grey vertex colour on the same Lambert material as everything else
  (`js/terrain.js:70`). There's no rock texture, no scree at the foot, and no boulders.
- **Props avoid cliffs instead of dressing them.** `js/props.js:873` drops every prop, rocks included,
  where slope > 0.75.
- **GPU grass ignores slope** (`js/grass-gpu.js:283-288`), so grass can grow on a rock-coloured cliff
  face while the CPU props next to it correctly refuse to. Two systems, two answers.
- **You can walk up a cliff.** `js/player.js:405-420` only divides your speed by the slope. There is
  no top slope and no sliding. `normalAt` says it exists "for sliding down a cliff" and nothing calls it.
- **Far rings under-report steepness.** `colorAt`'s rock band is measured over the ring's own quad
  size (`terrain.js:143`), so a cliff turns green as you walk away from it.
- The snow line (`700 + temp*5200`, `planet.js:2152`) and the 9 m sand band are absolute numbers
  that don't follow `reliefScale`, so on a Super tiny world they sit in the wrong place.
- **Two elevation conversions are still live.** The lake surface uses rounded `elevationToMetres`
  (`planet.js:663, 689`), while the land uses `elevationToMetresExact`. This is the round-21 rounding
  bug, left behind in one place.

### Roads
- **Every world road looks the same.** Highway and road are both 7 m wide and trail is 4.5 m
  (`planet.js:755`). All three share one colour, `#6b5c49` (`features.js:441`). There are no kerbs,
  no verge and no wear.
- **Nothing stands beside a road.** No signposts, milestones, lamps or waystations anywhere in
  `features.js`. highdef-3d already has `signpost`, `torch_post` and `stone_marker` builders
  (`highdef-3d/js/kit/rocks.js`).
- **Crossroads are unsolved.** Two A* routes that cross never become a junction, so their decks pass
  through each other: 1.26 m worst on 640 m-a-cell worlds, 2.29 m on seed 4477
  (`tests/round22-roads.test.js:141-150`). Only the ribbon crown hides it.
- **Walking or riding on a road is no faster** (`player.js:383-420` never reads `roadAt`). Vehicles do
  get a road bonus, and so do logistics carts, but only on roads the player built.
- **The build catalogue promises more than the code does.** `road_dirt` "joins the world's own road
  graph" and `road_cobble` says "Traffic from the real road will use it" (`data/structures.json`
  ~2630-2700). No code does either. Player lanes aren't in `roadPaths`, so `roadAt`, grass, props and
  bridges all ignore them.
- **Fields nobody reads:**
  - `path.bridgeCells` (README.md:228 still calls it "the list to trust")
  - worldgen's `bridge` vs `ford` crossing kind
  - `world.seaLanes`
  - `river.navigable`
- `JOIN_REACH` 16 m is absolute while the other reaches scale with the cell. `rampPerPoint` 0.5 per
  point means a different grade on every planet size, because points are 12.8–128 m apart.

### Bridges
- **One style.** Plank deck, plank rails, and grey box piers every 9 m (`bridge-plan.js:316-332`).
  `crossing.klass`, `roadHalf` and `river` are carried on every crossing and never read. There is no
  stone arch, no ford, and nothing changes with culture or span.
- **Piers:**
  - no collision
  - don't scale with the span
  - sampled at their centre only
- **Dead work:** `meshHalfLength` / `meshHalf()` are still computed for every crossing
  (`planet.js:1682, 1843, 1863`) and have had no reader since round 23.
- **Ends still land in water.** In the probe, 53 of 164 bridge ends on seeds 25392+4477 test
  `underwater` 3 m past the deck. That overcounts: the river rim and the bank count as wet. The
  documented residual is still 1–4 per world, the roads routed to a town node that sits in a river.
  `settlementAnchor` exists to move those towns and is "NOT WIRED, DELIBERATELY"
  (`features.js:417-430`).

### Gates, walls and town edges
- **Enemies can spawn inside a big town's wall.** `safeZones` (`town.js:707-708`) recomputes the ring
  as `16 + size*13 (+14)` instead of reading the planner's real `plan.wallRadius`. This is exactly the
  bug round 22 fixed for the houses. A size-4 town that the planner grew by 1.65x has its wall near
  135 m and its safe circle at 100 m.
- **Five different answers to "how big is this town":**
  - `footprintOf`, which lives in two files
  - `plan.wallRadius`
  - `safeZones`
  - `settlementAt` (`30 + 15*size`, `features.js:1478`)
  - `sites.js` (`190 + 120*size`)
- **The muster reads the wrong things** (`main.js:3502-3506`):
  - `walled: !!town.walled` is always false, because nothing sets `walled`, so the +6 defence for a
    walled town never applies
  - `guards` counts *your colony's* guards, not the town's
  - `plots` is the town's size number
- **The planner's own gates are thrown away.** proctown's `buildWall` picks at least 2 and at most 4
  gates where the main streets meet the wall. Farhold ignores them and cuts gates only where a world
  road crosses. So a main street can dead-end on solid wall, and a walled town with no road gets one
  gate at a random bearing that no street leads to.
- **Culture walls exist in data and nowhere else.** `CULTURES[*].wall` (stone / hedge / cutstone /
  bone / palisade / mudbrick) and `cultures.json` `townWall.kind` are read by nothing in the game.
  Only the colour changes. Every culture gets the same masonry, towers and gatehouse.
- **No wall at all below size 4**, and that rule is hard-coded in five places.
- **The gatehouse never closes.** The doors are static. `gateRecords` has no open/closed flag.
- **The siege camp's blurb promises something that isn't there.** It says the town "has stopped
  opening its gate" (`data/strongholds.json:410`). No gate ever closes.
- **Towers are placed by fixed angles:**
  - gate ±0.26 rad, quarters +0.4
  - `slice(0,10)`, so a town with five road crossings gets no quarter towers
  - dropped silently on a kerb or a bank
- **A gate over water still opens the wall.** No gatehouse is built there, but guards are still posted.
- **Gate guards depend on load order.** They are placed only if `features.gatesOf` already has records
  when `populate` runs (`town.js:352`), and `gateRecords` is never cleared.
- **Guards fight monsters and nothing else.** No challenge, no reaction to standing.
  `BUILDING_INFO.role` (`'guard'` on the watchpost and the barracks) is read by nothing, and wall
  towers are empty.
- **Nothing lives outside the wall.** No farms, graveyard or shanties. Nothing at a town entrance
  tells you its name.

### Enemy factions
- **Two enemy-faction systems that have never been introduced.**
  - The **territory** layer (`js/territory.js`, `data/factions.json`) has hostile factions with
    sites, patrols and standing: the Ashen Pact with its Burn Camps and Raider Holds, the Hollowed,
    and others.
  - Round 26's **warbands** (`js/warbands.js`) hold zones by a seeded roll.
  - They don't know about each other. A zone can be "held" by the Ashen Pact in the territory record
    and by the Ashtusk Horde in the warband map at the same time, and nothing reconciles them.
- **Warbands are spawn weights and nothing else.** There's one log line on your first visit to a
  held zone (`main.js:7425`). The map never shows who holds what: `createWarbandMap().held()` says
  it's "for the map legend", and its only caller is a test.
  - no warband boss
  - no camp
  - no banner
  - no standing
  - no job that names the warband
  - no loot of their own
  - leaders wear the old `horned_helm`/`crown`/`top_hat`, not round 26's new `war_helm`,
    `bone_headdress`, `wolf_helm` or `rune_helm`
- **The warband claim can't change.** It is pure seed + zone id and nothing is saved. That is fine
  today, but any "take their ground back" loop needs a saved delta, the way `territory` saves only its
  deltas.
- **`opensDungeon` is a log line.** Taking a castle prints "Behind the keep, a stair goes down. It was
  not there before." and opens nothing (`main.js:2511, 4820, 5772`). That's the promise-the-world-
  can't-keep fault from round 22.
- **One stronghold, two payers.** `gives` is paid in `creditKill` (four kills inside a territory
  camp's footprint, `main.js:2490-2517`) *and* in `freePrisonersOf` (the boss dies,
  `main.js:4805-4825`). There is no shared "already paid" flag between them. A castle that holds
  prisoners probably pays its legendary chest, xp and perk point **twice**. Verify before building
  anything on top of it. It's the multiplier fault in the shape of a payout.
- **A stronghold is "taken" when four things die near a territory record,** not when its boss falls.
  The two site lists don't share coordinates (`main.js:4776-4780` says so), so clearing counts against
  whichever list the kill happened to land near.

---
## How each idea is written

Every idea has the same seven lines:

- **Pitch:** the idea in one line.
- **Extends:** the existing module or data it grows out of.
- **Player notices:** what the player would see.
- **Size:** S, M or L.
- **Risks:** what could go wrong (perf budget, save compatibility, shared files, the three faults).
- **Test:** how to check it against the real thing.
- **Tag:** only if it's a new system: **[NEW]**.

Shared files to be careful with:
- `data/items.json` and `avatar-3d/*` are shared with Emberveil. Inject into them at load, never edit
  them on disk.
- `proctown/` is shared with its own tuning page.
- `worldgen/` is shared with World Forge.

---

## A. Terrain detail

### A1. Switchbacks where a road meets a slope it can't climb
- **Pitch:** When a stretch of road climbs more than about 12% for more than 40 m, fold it into a
  zig-zag inside the same corridor instead of running straight up.
- **Extends:** Road grading in `js/planet.js` (the `smoothPath` → `mergeRoadNetwork` → grading pass,
  ~:993-1162). The fold is a polyline rewrite *before* `findCrossings` and the junction fade, so
  everything downstream sees the final line.
- **Player notices:** Mountain highways that wind up a hillside instead of a 37% ramp. The fix for the
  single worst road on the user's own world (seed 25392: 97 of 780 segments over 20%).
- **Size:** M
- **Risks:**
  - Changes road polylines, so any road-anchored placement shifts: set pieces on road cells, waystone
    avenues, town `linkRoads`. It's seeded and nothing is saved per road, so saves are fine, but
    markers on a road move by a few metres.
  - Must run before `connectRoadNetwork`, or junctions are re-broken (round 22's 3.49 m bug).
  - Can't cross a cliff mask: if the corridor itself is a cliff, re-route or accept.
- **Test:** A node test on seeds 25392/7/4477 at scales 0.1 and 1. For the resampled 3 m lane
  (`planLane`), the share of 10 m windows steeper than 15% drops below 1%. The road still ends where
  it started (`from`/`to` kept). The round-22 ribbon-over-terrain test stays at 0.000 m.

### A2. Scree and boulders at the foot of every cliff
- **Pitch:** Where `naturalHeightAt`'s cliff term is active, scatter talus: small rocks on the fan
  below the face, a few boulders, a lighter "broken stone" colour.
- **Extends:**
  - `js/props.js` scatter, which today *skips* slope > 0.75 (`:873`)
  - the cliff mask in `planet.js` (~:524-558)
  - `highdef-3d/js/kit/rocks.js` `scree_slope` / `mossy_boulder` / `slab`, copied the way round 23
    copied the grass
- **Player notices:** Cliffs read as rock that has been falling for a thousand years, not as a grey
  stripe.
- **Size:** M
- **Risks:**
  - Instance budget. Keep it inside the existing 64 m cell hash and the round-12 radial falloff, so a
    thinned cell is a subset of the dense one.
  - **The rng rule:** round 12's density test caught a `break` that changed how many rng calls a cell
    used. Scree must draw from its own seeded stream, not the cell's shared one.
  - A boulder must be solid through the same `collide.add` path as rocks, or you walk through it
    (drawn vs measured).
- **Test:**
  - Every scree instance stands within N m downhill of a cell whose slope > 1.2.
  - None stands on a road (`roadAt < 0.35`) or in water.
  - Toggling scree off leaves every other prop's position byte-identical (the subset rule).

### A3. Cliffs you can't walk up
- **Pitch:** Above a top slope (about 50°), the player slides back along `normalAt` instead of walking
  up at a fifth of the speed. Mounts have a lower limit, and a Dray Elk's `mountSlope` raises it.
- **Extends:** `js/player.js:405-420` (the slope divisor), `planet.js` `normalAt`, whose comment
  already says it is "for sliding down a cliff".
- **Player notices:** A cliff is a wall. Getting up one means finding the road or the pass, which is
  what switchbacks (A1) and the cliff country are for.
- **Size:** S
- **Risks:**
  - Could trap a player who spawned or teleported into a gully. Needs an escape rule: if you've been
    pinned for 3 s, allow the climb.
  - Terraform edits change slope: read `heightAt` (edited), not `naturalHeightAt`.
  - Enemies must use the same rule, or they chase you up a face you can't climb.
- **Test:** A node test walks a scripted player into a measured 63°+ face on seed 7 and asserts they
  end lower than the lip after 5 s. Walking along the foot is unaffected. An enemy chase path gives
  the same answer.

### A4. Slope-aware grass and a rock band that doesn't fade with distance
- **Pitch:**
  - The GPU grass texture carries slope, so grass thins past 0.6 and stops past 0.9, the same rule the
    CPU props use.
  - `colorAt`'s rock band measures slope over a fixed 4 m, not over the ring's own quad size.
- **Extends:** `js/grass-gpu.js:283-288` and `js/grass-plan.js` (density), `planet.js` `colorAt`
  (`:2142`), `terrain.js:143`.
- **Player notices:** No lawn on cliff faces. Cliffs stay grey from far away instead of greening over.
- **Size:** S
- **Risks:**
  - The grass bake is one texture: adding a channel must keep the round-23 "grass stands on the exact
    drawn triangles" guarantee.
  - Measuring slope over 4 m on a 162 m far quad is aliasing, so take the max of the two, not just the
    small one.
- **Test:**
  - Sample 10,000 points. Wherever `slopeAt(…, 4) > 0.9`, grass density is 0 (the same predicate as
    `props.js`, so one rule has one answer).
  - For a fixed cliff point, `colorAt` from each ring stays inside a small tolerance of the others.

### A5. Height-true snow and sand, one elevation conversion
- **Pitch:**
  - Scale the snow line and the 9 m beach band with `reliefScale` and the sea level.
  - Move the lake surface onto `elevationToMetresExact` like the land.
- **Extends:** `planet.js:2152-2155` (`colorAt`), `:663, :689` (lakes).
- **Player notices:** On Tiny and Super tiny worlds, peaks get snow and beaches get sand where they
  should. No stepped lake rims.
- **Size:** S
- **Risks:** Lake rims move by up to 0.5 m, so lake-related tests (`water.test.js`) may pin old numbers
  (the "tests that pin wording" memory: fix the test to assert the rule).
- **Test:** At every lake cell, the lake surface is within 0.05 m of the land's own exact conversion at
  the shoreline. Snow-cover share at the top 5% of land height is similar at scales 0.1 and 1.

### A6. Rock strata and a texture on steep ground
- **Pitch:** Give the terrain material a cheap triplanar rock detail and horizontal banding on faces
  steeper than the rock band. Colour only: no extra geometry.
- **Extends:** `js/terrain.js` (one `MeshLambertMaterial`, vertex colours only, `:70`),
  `js/graphics.js` quality tiers, `highdef-3d/js/terrain.js` (5-layer splat, triplanar rock, detail
  fade) and `highdef-3d/js/kit/textures.js`.
- **Player notices:** A cliff has layers and grain up close. Hillsides stop looking like painted
  plastic.
- **Size:** M
- **Risks:**
  - Shader cost on the software renderer the tests run under: gate it behind Graphics effects Low/High
    like round 23 did.
  - A material change can reintroduce NaN (round 26's black square): guard normals of zero length.
  - Mustn't change `colorAt`, which the minimap and tests read.
- **Test:**
  - A Playwright screenshot at a known cliff, at quality Off and High: Off is pixel-identical to
    before.
  - A node check that the material compiles with every define combination.
  - A frame-time budget line in the round-23 graphics spec.

### A7. Waterfalls where a river goes over a cliff
- **Pitch:** Where a river's forced-downhill surface drops more than X m across a cliff band, draw a
  falling sheet with spray and a plunge pool, instead of a river ribbon tilted at 60°.
- **Extends:**
  - `planet.js` river surface (`:605-618`, `surfaceOfHit`)
  - `js/water-plan.js` (`waterRibbon`)
  - the round-21 cliff term
  - `avatar-3d/js/spellfx.js`'s mist sprites for spray
  - `js/sound.js` ambience
- **Player notices:** A landmark you can hear. Rivers in cliff country feel like they belong there.
- **Size:** M
- **Risks:**
  - **Drawn vs measured, round 18's staircase again:** the swimmable surface (`riverTopAt` →
    `surfaceOfHit`) must agree with the drawn sheet, or you fall through water that's drawn under you.
    Treat a fall as not-swimmable (you drop), and assert the rule.
  - Road crossings near a fall need bridges that clear the plunge pool.
- **Test:**
  - For every fall on three seeds, the drawn sheet's top and bottom heights equal `surfaceOfHit` just
    upstream and just downstream, within 0.1 m.
  - A walker above the fall is swimming, and one mid-fall is not.

### A8. Ground details: ruts, puddles, root mats, ash and snow drifts by biome
- **Pitch:** Add a thin decal layer of small flat details from highdef's ground-detail list, scattered
  by biome and weather.
- **Extends:**
  - `highdef-3d/js/kit/rocks.js` ground details (`root_mat`, `lichen_patch`, `puddle_ring`,
    `snow_drift`, `sand_ripple`, `ash_patch`, `:1275+`)
  - `js/props.js` biome `KITS` (`:497`)
  - `js/graphics.js` wet-ground state (so puddles show after rain)
- **Player notices:** Ground has texture between the trees. Puddles after rain, ash on volcanic worlds.
- **Size:** M
- **Risks:** Draw calls. Decals must batch into the existing instanced meshes per kit, and z-fight
  with the terrain unless lifted.
- **Test:**
  - The draw count at a fixed camera stays under budget (round-12 density spec style).
  - No decal lies more than 0.1 m off `heightAt` at its corners (read from the instance matrix).

---

## B. Roads

### B1. Three road classes you can tell apart
- **Pitch:**
  - **Highway:** 8–9 m, paved, with kerbstones.
  - **Road:** 7 m packed gravel with a verge.
  - **Trail:** 3.5–4.5 m dirt with a grass crown.
  - Each is tinted into `colorAt` for a metre past the edge so the join isn't a hard line.
- **Extends:** `planet.js:755` `roadWidth`, `features.js:441` (one colour for all), `roadplan.js`
  `laneRibbon` (already takes `color`), proctown culture `street` kinds for in-town continuity.
- **Player notices:** You know a highway from a goat track at a glance, and which one leads somewhere
  that matters.
- **Size:** S–M
- **Risks:**
  - Changing `roadWidth` changes `half`, which is read by `heightAt`'s road blend, `findCrossings`,
    `ringCrossings` gate sizing, the waystone offset (round 21 `half + footing + 1`) and `padOk`.
    All of those already read `half`, but it needs a sweep. Width must have **one owner**.
  - The kerb must be in the ribbon, not a separate mesh, or it floats.
- **Test:**
  - The round-22 "ribbon never under terrain across its full drawn width" test runs per class.
  - Gates are still sized to the road they cut (`tests/round23-bridge-gate.test.js`).

### B2. Signposts at every junction, milestones along the road
- **Pitch:**
  - A signpost at each merge junction and each town link, with an arm per branch naming the
    settlement at the end of it (`from`/`to` are carried since round 22).
  - A milestone every N km on highways and roads.
- **Extends:**
  - `planet.js` `roadJunctions` / `from` / `to`
  - `highdef-3d/js/kit/rocks.js` `signpost`, `stone_marker`
  - `js/features.js` instanced props
  - `js/nearby.js` / the interact prompt for reading a sign
- **Player notices:** "Dearbigate 4 km →" at a fork. Getting lost stops being the default, and roads
  finally explain themselves.
- **Size:** M
- **Risks:**
  - An arm must name the *right* place along the branch. Walk the network graph, don't take the
    nearest town.
  - A sign in the carriageway is round 21's pillars-in-the-road bug: place it at
    `half + footing + 1` like the waystones.
  - Reading a sign is a promise, so it must never name a place the map hides (round 10 rule: only
    regions you've entered or heard of). Show "?" otherwise.
- **Test:**
  - For every signpost arm, following the road graph from that junction along that branch reaches the
    named settlement.
  - Every post satisfies `roadAt(post) < 0.3` and is within 6 m of the junction.

### B3. A real crossroads where two roads cross
- **Pitch:** When two graded roads cross without sharing a corridor, make a junction node at the
  crossing: split both, pin all four ends to one height, and let the junction fade do its job.
- **Extends:** `planet.js` `mergeRoadNetwork` / `connectRoadNetwork` (`:797`, `:903`), the junction
  fade (`:1174`), `tests/round22-roads.test.js`'s `crossroads` counter, and TOWN_EXPANSION item 4.6.
- **Player notices:** No more decks passing through each other (1.26–2.29 m today). A crossroads can
  carry a signpost (B2) and an event slot (F3).
- **Size:** M
- **Risks:**
  - Round 22's lesson: a spur that doesn't *file a join* rebuilds the junction-height bug. The new
    node must be a real junction in `roadJunctions`.
  - The later floor-restore pass must not drag the node up (the 3.49 m bug).
- **Test:** The `crossroads` count in the round-22 test drops to 0 for transverse crossings, and the
  worst deck-vs-deck gap at any shared point is under 0.1 m. That test already exists, so tighten its
  bar instead of adding a new one.

### B4. Roads are faster for feet and hooves
- **Pitch:** On a road, walking and riding get a speed bonus (for example 1.15 walking, 1.25 mounted,
  more on highways). Off-road the slope divisor stays as it is.
- **Extends:** `js/player.js:383-420` and main.js `ground()`, the only place a mount speed is computed
  (round 22 made it the one owner). Vehicles already do this through `speedOn` / `surface: 'road'`.
- **Player notices:** A reason to follow the road instead of cutting across country. Combined with A3,
  cliffs and roads become route choices.
- **Size:** S
- **Risks:** **Multiplier twice:** vehicles already get a road factor in `vehicles.js`, and
  `player.js` *replaces* speed when driving. The new factor must sit in the legs/hooves branch only,
  like the slope divisor, with a comment saying why.
- **Test:** A node test on the real `player.js` update, with a fixed input: a walker is exactly
  1.15x faster on a road, and a driver's speed is unchanged. The test sets the factor to an odd value
  (1.37) and checks that the module reads it (the dead-data rule).

### B5. Player roads join the world's road network
- **Pitch:** Make the build catalogue's promise true.
  - A player-laid lane registers in `roadIndex`, so `roadAt`, the road speed (B4), grass, props and
    the vehicle surface all see it.
  - Where it touches a world road, file a junction.
- **Extends:**
  - `roadplan.js` `createRoadBook`
  - `planet.js` `roadIndex` / `roadAt`
  - `data/structures.json` `road_dirt` / `road_cobble` copy
  - `js/logistics.js` `roadFactor`, which today counts only player lanes; world roads should count too
- **Player notices:** A road built to your base is a road: carts use it, grass doesn't grow on it, the
  horse is faster on it.
- **Size:** M
- **Risks:**
  - `roadIndex` is built once at `makeTerrain`. It needs an add path, and a save load must rebuild it
    before props scatter.
  - Logistics would double-count a lane that's in both lists (multiplier twice).
- **Test:**
  - Lay a lane in a node test: `roadAt` on it is > 0.45, and a grass density query there returns 0.
  - A haul quote over it matches one over a world road of the same length.
  - Save/load round-trips it.

### B6. Road-side life: waystations, shrines and lamps near towns
- **Pitch:** Within about 1 km of a settlement:
  - lamp posts that light at night, running through the round-25 light pool
  - a waystation (well + bench + notice board) at the midpoint of long roads
  - roadside shrines as `sites.js` slots on road cells, using `roadNear` for the bearing
- **Extends:** `js/sites.js` road slots (`:494-525`), `js/nightlights.js`, `js/light.js` (12-light
  pool), `highdef-3d` `torch_post`, `data/setpieces.json` layouts.
- **Player notices:** Walking into a town at dusk, the lamps come on before the walls do.
- **Size:** M
- **Risks:**
  - The light pool is 12 lights, so lamps must be sorted below spells, torches and the player's lamp.
  - Round 21's "everything piled on the town centre" came from three systems computing the same
    origin. Roadside slots must ask `townGap` like everything else.
- **Test:**
  - No lamp or waystation within `half + 1` of a road centre line.
  - The count of active point lights never exceeds the pool.
  - A placement run over 3 seeds finds none inside a town ring.

### B7. Fords where a crossing is shallow
- **Pitch:** worldgen already labels river crossings `bridge` or `ford` by width. Honour it: a ford is
  a flagstone causeway just under the surface that the player wades across, with no bridge.
- **Extends:** `worldgen/js/roads.js:193-203` (crossing kinds, read by nobody in Farhold),
  `planet.js` `findCrossings`, `js/ground.js` `wetAt`, `water-plan.js`.
- **Player notices:** Small streams stop getting identical plank bridges. Trails cross by wading.
- **Size:** M
- **Risks:**
  - Drawn vs measured: the stones must be at the height `heightAt` returns, and swimming must not
    trigger in 0.4 m of water.
  - Mounts and vehicles need the same wade rule.
- **Test:** For every ford, a walker crossing it on the real `player.js` never enters `swimming`, and
  the water depth over the stones is 0.2–0.5 m everywhere on the causeway.

---

## C. Bridges

### C1. Bridges by kind: stone arch, timber trestle, rope span
- **Pitch:** Choose the bridge style from data the crossing already carries and nobody reads:
  - `crossing.klass`: a highway gets stone
  - span length: over 60 m gets a trestle with piers
  - culture of the nearest town: dwarf cut stone, elf living-wood, orc lashed timber
  - trails over narrow gorges: rope bridges
- **Extends:** `js/bridge-plan.js` (`bridgeGeometry`, one style at `:316-332`), `crossing.klass`,
  `roadHalf` and `river` (carried, unread), proctown culture kits.
- **Player notices:** Bridges become landmarks. You remember "the stone bridge on the highway".
- **Size:** M–L
- **Risks:**
  - **Drawn vs measured is the whole game here.** Round 23 made *one* height list build both the mesh
    and the colliders. Every style must be built from `planBridge`'s list and `deckTopAlong`, never
    from its own arch formula.
  - An arch's *underside* can be curved, but the deck top can't.
- **Test:** Extend `tests/round23-bridge-gate.test.js`, which reads the drawn deck out of the mesh's
  own vertex buffer, to loop over every style, with a walker on every style of deck.

### C2. Piers that are solid and sized to the span
- **Pitch:**
  - Piers get colliders (banded, like the rails) and cutwaters on the upstream face.
  - Width follows the span and the deck width.
  - Piers are sampled at their footprint corners, not their centre.
- **Extends:** `bridge-plan.js` pier loop, `collide.addSegment` / `band` (`collide.js:133`), the
  round-23 "rails are walls only at deck height" pattern.
- **Player notices:** A swimmer bumps into a pier instead of swimming through it. Piers stand on the
  riverbed, not floating over a bank slope.
- **Size:** S
- **Risks:** The band must cover riverbed to deck underside, not the deck top, or piers block the
  deck. Boat collision: the raft uses the same field.
- **Test:**
  - Swim a walker along the river under 5 bridges: it's stopped at each pier line and passes between
    them.
  - The pier bottom is within 0.2 m of `heightAt` at all four footprint corners.

### C3. Wire the settlement anchor, and end the last bridges over water
- **Pitch:** Turn on `settlementAnchor` so a town node sitting in a river is moved to the nearest dry
  shelf. Every system reads the moved position through one function, not `node.x * M_PER_CELL`.
- **Extends:** `town-plan.js:290` `settlementAnchor` (written, "NOT WIRED, DELIBERATELY",
  `features.js:417-430`), the round-21 finding that three systems compute a town position the same way,
  map, markers, waypoints and quests.
- **Player notices:** No bridge that stops in mid-river, and no town wall pieces standing in water.
- **Size:** M
- **Risks:**
  - This is the classic "several owners of one number". It needs a single `townOrigin(node)` and a
    grep-based test that no other file computes `node.x * M_PER_CELL` for a settlement.
  - Saved markers and waypoints at old town coordinates need a migration: snap to the new origin if
    within the ring.
- **Test:**
  - On 5 seeds, bridge ends that `drop` over water go from 1–4 to 0.
  - Every town origin is dry.
  - A grep test finds exactly one settlement-origin function.

### C4. Toll bridges and guarded crossings
- **Pitch:**
  - Big bridges on highways near a faction's ground get a toll house and a guard pair (reusing
    `sentryPosts`).
  - Pay, talk your way through with standing, or fight.
  - `faction-rewards.json` `freeTolls` (one of only two built rewards) finally has tolls to be free of.
- **Extends:** `data/factions.json` `toll_gate` site kind, `js/territory.js` sites, `sentryPosts`
  (`town-plan.js:337`), `faction-rewards.json` `freeTolls`, events.json's toll events (round 20 gave
  them humanoid fights).
- **Player notices:** Crossings mean something. Your standing with the Cutwater saves you gold.
- **Size:** M
- **Risks:**
  - A toll that blocks the only way to your quest is a wall: make it avoidable (fords, B7) or cheap.
  - Guards must be real bodies (round 22's "wanderer with no body").
- **Test:**
  - A toll site exists only where a territory `toll_gate` sits within 200 m of a bridge.
  - With `freeTolls` standing the charge is 0, and without it the charge equals the data value (moved
    to an odd number to prove it's read).

### C5. Bridges over sea inlets and lake narrows
- **Pitch:** A road that crosses a lake narrows or a sea inlet gets a long low bridge or a causeway
  with culverts, instead of the deck clamp's earth plug.
- **Extends:** `planet.js` deck clamp (`:1611-1615`), `findCrossings` (rivers only), `roadRide`,
  `bridge-plan.js`.
- **Player notices:** No more earth dams across lakes.
- **Size:** M
- **Risks:** Lake surface vs deck clearance; the round-17 "a lake is a hole" rules; wave/sea surface
  is flat, so that part is simple.
- **Test:** No road point lies over lake or sea water with a surface lower than the terrain under it
  (a plug). Every such span is either a bridge in `crossings` or a marked causeway.

### C6. Delete the dead bridge work
- **Pitch:** Remove `meshHalfLength` / `meshHalf()` (`planet.js:1682, 1843, 1863`, unread since
  round 23) and `path.bridgeCells`, or give them a reader. Fix README.md:228, which still calls
  `bridgeCells` "the list to trust".
- **Extends:** `planet.js`, README.
- **Player notices:** Nothing. It's cleanup that keeps the next agent from trusting a dead list.
- **Size:** S
- **Risks:** None, if the round-19 orphan tests (`orphans-*.test.js`) are extended to catch
  "computed and never read" on crossing records.
- **Test:** An orphan test that every field on a crossing record has at least one reader outside
  planet.js.

---

## D. Gates, walls and town edges

### D1. One town size, read by everybody
- **Pitch:**
  - Every consumer reads `plan.ring` / `plan.wallRadius` through one function: `safeZones`,
    `settlementAt`, `sites.js` keep-clear, the muster and the town hall.
  - Delete the five local formulas.
- **Extends:** `town.js:707-708`, `features.js:1478`, `sites.js:454`, `town-plan.js:85`, proctown
  `footprintOf` (duplicated at `townplan.js:162`).
- **Player notices:** Enemies never spawn inside a grown city's wall (today they can: a 135 m wall
  with a 100 m safe circle), and "you are in town" agrees with the wall you just walked through.
- **Size:** S–M
- **Risks:**
  - The planner's radius is only known after `planTown`, and `sites.js` keep-clear runs earlier. It
    needs the plan cached per node, or the footprint used as a *floor*.
  - The houses-through-the-wall bug from round 22 came from exactly this, so it's high value.
- **Test:**
  - For every town on 5 seeds: `safeZones` r ≥ `plan.wallRadius` + margin, and `settlementAt` is true
    at wallRadius − 1.
  - Spawn 500 enemies with the live spawner around each town: none inside the wall.

### D2. Culture walls: palisade, hedge, bone, mudbrick, cut stone
- **Pitch:** Read `CULTURES[*].wall` / `cultures.json` `townWall.kind` and build the matching wall,
  tower and gatehouse from the building kit.
- **Extends:**
  - proctown `CULTURES` (`townplan.js:81-114`), `cultures.json` `townWall`
  - `proctown/js/buildkit.js` / `drawkit.js`
  - `features.js` wall block (`:1122+`)
  - `collide.addSegment`
- **Player notices:** An orc town behind a palisade of sharpened logs, an elf town behind a hedge, a
  dwarf town behind cut stone.
- **Size:** M
- **Risks:**
  - The colliders must stay the round-23 straight segments on exactly the drawn line, whatever the
    mesh. The mesh varies and the segment doesn't.
  - Wall instance caps: the cap is per mesh type, so five types means five caps. Check the 1400.
  - proctown is shared: the kit parts go there, and Farhold picks them.
- **Test:** Round 23's walk of the wall ring (every half metre of dry wall line is solid except the
  gates) runs for each culture. The mesh-kind test asserts the drawn wall kind equals the culture's
  `wall` for 7 cultures.

### D3. Villages get a fence, hamlets get a boundary
- **Pitch:**
  - Size 2–3 settlements get a low palisade or hedge ring with gaps where the roads and streets
    cross, and no gatehouse.
  - Size 1 gets boundary stones at the road entrances.
- **Extends:** The same wall block with a `low` tier. `footprintOf`'s `walled = size >= 4`, which
  becomes a tier, and is hard-coded in five places that D1 reduces to one.
- **Player notices:** Every settlement has an edge. You know when you've arrived.
- **Size:** S–M
- **Risks:**
  - A fence with gaps must not block a street. Use the planner's street ends, not road crossings
    (see D4).
  - Low fences are jumpable: decide whether the collider is there at all. Maybe it's decoration only,
    stated plainly.
- **Test:** Every drawn street's end that reaches the fence ring has a gap within 2 m. A walker can
  enter along every street.

### D4. Use the planner's gates, and ensure at least two
- **Pitch:**
  - Merge proctown's own gates (at least 2, where main streets reach the wall) with Farhold's
    road-crossing gates.
  - Every main street that reaches the wall gets a gate.
  - A walled town with no road still gets two gates that line up with streets.
- **Extends:** proctown `buildWall` (`townplan.js:734-775`, whose gates only the 2D preview draws),
  `features.js` gate cut (`:1146-1316`), `ringCrossings`.
- **Player notices:** No main street running into solid masonry, and no gate that no street leads to.
- **Size:** M
- **Risks:**
  - Two gate lists must merge by bearing. Round 22 found the high street and the gate 7° apart because
    `roadLinksFor` asked at a different radius. Measure both on the final `wallR`.
  - Only 4 gatehouses per town (`n < 4`), plus the mesh cap of 80.
- **Test:**
  - For every walled town: every `main` street end within 3 m of the wall has a gate within 4 m.
  - The gate count is ≥ 2.
  - A walker can reach the square from every gate along streets (a flood fill over the collider
    field).

### D5. Gates close at night, open when you knock
- **Pitch:**
  - After dusk the gate leaves swing shut.
  - The guard opens them if your standing with the town's holder faction is Neutral or better, or for
    a small fee. Otherwise you wait until dawn or go round.
  - This makes the siege camp's "stopped opening its gate" true: while a siege camp stands near a
    town, the gate stays shut to everyone.
- **Extends:**
  - `features.js` door leaves (static, `:1288-1307`)
  - `gateRecords` (no state today)
  - the round-23 door colliders
  - `sky.isNight`
  - `js/territory.js` standing
  - `data/strongholds.json` siege_camp blurb (`:410`)
  - `town.js` gate guards (the `post.gate` / `post.side` fields, stored and never read)
- **Player notices:** Towns feel defended. Night travel has a cost, and clearing a siege camp opens the
  gate.
- **Size:** M
- **Risks:**
  - **Can trap the player inside or outside with a quest target behind the gate.** It needs an always-
    available way in (knock → guard opens), and to never block if the player's respawn point is inside.
  - The collider has to be *removable*, but the obstacle field has no delete (`collide.add` can't be
    taken back, round 16). Door leaves are `addSegment` pieces, so this needs a toggleable segment,
    which is a small addition to `collide.js`.
  - Night lasts minutes on some worlds: keep it short.
- **Test:**
  - At night with low standing, a walker is stopped at the gate line.
  - After a knock with enough standing, it passes.
  - Clearing the siege camp flips the state.
  - Save/load at night keeps it consistent.

### D6. Guards who notice you
- **Pitch:**
  - Gate guards speak to you based on standing (a line from the faction's `greeting` vocabulary).
  - They turn hostile if you're Hunted by the holder.
  - Guards on the wall walk the wall between towers.
- **Extends:** `town.js` guard AI (`:536-603`, which fights `field.enemies` only), `GUARD` (`:170`),
  `territory.js` standing bands (Hunted → Sworn), `BUILDING_INFO.role` (`'guard'` on watchpost and
  barracks, read by nobody), the round-25 night torches.
- **Player notices:** Towns react to what you've done. Watchtowers have somebody in them.
- **Size:** M
- **Risks:**
  - Hostile town guards can softlock a player at the respawn point. Make Hunted guards bar the gate
    (D5) rather than attack inside the walls.
  - Wall walkers need a walkable wall top: collision `band` for the walkway, or keep them on towers
    only.
- **Test:**
  - With standing forced to Hunted, the gate guards' `target` becomes the player within `guardReach`.
  - Each watchpost in a town has a guard body whose post is within 2 m of it.

### D7. Outskirts: fields, orchards, a graveyard and a gallows outside the wall
- **Pitch:** A ring of culture-flavoured land use outside the wall along the approach roads:
  - fenced fields (using `js/farm.js` crop models)
  - an orchard
  - a graveyard (undead incidents can rise from it at night)
  - shanties for size 4–5
- **Extends:** proctown district tags (`townplan.js:668`), `js/farm.js` / `data/crops.json`,
  `js/props.js` clearing, `data/incidents.json` `restless_dead` (`nightSpawn: undead`), and sites.js
  `townGap`.
- **Player notices:** Towns don't start at the wall: the land around them is worked. "The dead are
  restless" has a place it comes from.
- **Size:** M
- **Risks:**
  - The keep-clear ring (`sites.js` `190 + 120*size`) must include outskirts, or a stronghold slot
    lands in the orchard.
  - Props must be cleared under fields: the round-13 `cleared` circles already do this.
- **Test:**
  - Outskirt plots lie between wallRadius and wallRadius + 120 m, off roads, off water.
  - With `restless_dead` active, night undead spawn within the graveyard's radius.

### D8. Town name banners and an arrival card
- **Pitch:** At each gate (or boundary stone, D3), hang the town's banner in its culture colours. On
  crossing the wall line, show the same banner the zone border shows: town name, size, holder
  faction, services.
- **Extends:** `hud.js` `zone-banner` (`:705`, zones only), `sites.js` `banner` model (`:273`, not
  used by towns), `town.js` roles for services, `features.js` `gatesOf`.
- **Player notices:** You know where you are and what's there before you walk in.
- **Size:** S
- **Risks:** The banner fires on crossing the *wall* radius. Use D1's single radius or it fires in the
  market (round 21's three-origins problem again).
- **Test:** The banner fires once per entry, at the wall radius ±2 m, walking in along a real road on
  3 towns.

---
## E. Enemy factions: bosses, elites, leaders, camps

The shape of this section: round 26's warbands are **spawn weights with good looks**. Everything a
faction needs already exists somewhere else in the game, attached to the wrong thing:

- `data/strongholds.json` + `js/sites.js` build a camp with a garrison, a named boss and a sealed
  chest.
- `js/territory.js` has standing, grip, patrols, rumours and incidents.
- Bosses have phases and adds (`actors.js:695-717`).
- The job generator binds to anything that exists.

So nearly every idea here is a **join**: point one of those at a warband.

### E1. Join the two enemy-faction systems: a warband is a territory holder
- **Pitch:**
  - When a warband holds a zone, it's the zone's hostile holder in the territory record.
  - Its grip is what spawn share, patrols and incidents read.
  - The five warbands get rows in the faction table (always hostile, standing reads as *Fear* instead
    of friendship) with `rivals` set to the human factions whose ground they sit on.
- **Extends:** `js/warbands.js` `claimFor`, `js/territory.js` (zone holder, grip, claim, sites),
  `data/factions.json` (`rivals`, `hostileAtStart`, `sites`, `patrol`), `js/rumours.js`,
  `js/incidents.js`.
- **Player notices:** "The Ashtusk Horde hold this valley" means something every time you come back:
  their grip shows on the zone card, the Wardens thank you for pushing them out, rumours name them.
- **Size:** M (the foundation most of E builds on)
- **Risks:**
  - **Two holders of one zone today.** Pick one rule: a warband claim *overrides* the territory
    holder's hostile slot, or a warband zone has no hostile human faction. Write it once.
  - Adding faction rows changes the standings UI (12 → 17). Warbands should show as their own group.
  - Save: territory already saves only deltas, so warband grip deltas ride the same path.
- **Test:**
  - On 6 seeds, every warband-held zone reports that warband as its hostile holder, and none reports
    two.
  - A deed against a warband moves its rivals' standing by the documented third (the round-10 rule).
  - Save/load keeps the grip delta.

### E2. A war camp per held zone: strongholds dressed by the warband
- **Pitch:**
  - §7b, built from what exists. In a held zone, one stronghold slot becomes that warband's camp:
    - Sootwick: `bandit_camp` with a junk wall
    - Ashtusk: `raider_stockade` with bone totems
    - Thornmane: `beast_lair` with a thorn ring and hide tents
    - Unburied: `boss_barrow` barrow-fort
    - Stonehide: a standing-slab ring
  - The garrison is drawn *only* from the warband's five members, and the boss is its leader at rare
    rank with a Name Forge name in `nameRace`.
- **Extends:** `data/strongholds.json` (8 kinds with a hard-coded territory `faction`),
  `js/sites.js` (garrison from `field.defsFor` filtered by `prefer`, boss =
  `role==='leader'`, `:1094-1103`), `data/setpieces.json` layouts, `proctown/js/buildkit.js`,
  `sites.js` `banner` model in the warband's `colour` (unread today).
- **Player notices:** The warband has a place. You can see its banners from the road and go and take
  it.
- **Size:** M–L
- **Risks:**
  - Garrison purity: `defsFor` today mixes wildlife into a held zone. The camp must filter to
    `d.warband === held.id`, with a fallback if the level band leaves none.
  - Placement slots are shared with world bosses (`sites.js:629-733`): don't let a camp starve them.
  - **Fix the two-payers bug first** (section 0), or every new camp pays twice.
- **Test:**
  - Over 6 seeds, every held zone with a free slot has exactly one camp of its warband, and no unheld
    zone has one.
  - Every garrison body's `defId` is in that warband's `members`.
  - The chest stays sealed until the last guard falls (round-25 rule).

### E3. Warband warlords: a real boss per warband, with phases
- **Pitch:**
  - Five named warlords, one per warband, as `bosses` rows (humanoid, the warband's race, 2–3x scale
    like world bosses), each with 2–3 phases in the existing `{at, modifier, say}` shape and `spawns`
    of their own members.
  - The Stonehide Mountainlord and the Unburied Deathmarshal fill the **empty boss band above level
    30**.
- **Extends:**
  - `data/enemies.json` `bosses` (6, all beasts, all ≤ 30)
  - `actors.js` phases/spawns (`:695-717`), `bossFor` (`:478`)
  - `main.js:4701` / `:5087` fallback to `bosses[0]`
  - `js/warbands.js` `installWarbands` (inject at load: don't edit enemies.json, Emberveil reads the
    item file and the same rule applies to shared data)
- **Player notices:**
  - Each warband has a face and a name you'll hear in rumours.
  - A level-40 lair no longer holds the level 4–12 Warden of the First Hollow, which is today's
    silent fallback.
- **Size:** M
- **Risks:**
  - `bossFor` returns null above 30, and every caller falls back to `bosses[0]`. Fix the fallback to
    "the nearest band" in the same change, or the new bosses only half-help.
  - Scale vs doorways: a 2.5x giant in a dungeon room (`dungeon-plan.js` sizes).
  - The round-22 XP rules apply: a boss pays by zone, not by player level.
- **Test:**
  - For every level 1–50 and every biome family, `bossFor` returns a boss whose band contains that
    level.
  - No caller reaches the `bosses[0]` fallback in a sweep.
  - Every phase fires once, in order, in a scripted fight on the real `EnemyField`.

### E4. Leaders that lead: morale, rally and a rout
- **Pitch:**
  - A leader links its escort (`unit.leader = leaderUnit`).
  - While the leader stands, the escort gets the leader's aura (the `_doc` in enemies.json already
    claims "leader buffs its pack", which is not true today).
  - When the leader dies, the escort rolls morale: some flee, some go berserk.
  - Mixed escorts wake together.
- **Extends:**
  - `actors.js` `spawnNear` `leads` (`:353-362`, the only place `leads` is honoured)
  - pack waking (`:749-755`, same `defId` only)
  - `kill()` (`:1291-1316`)
  - the town-line flee rule (`:729-737`) reused as a rout
  - `combat-feel.js` stagger
- **Player notices:** Kill the Warchief first and the brutes scatter. A tactic, not just a bigger HP
  bar.
- **Size:** M
- **Risks:**
  - **Multiplier twice:** the leader aura must go through the same modifier path as champion
    modifiers, not a second damage multiplier in `strike`.
  - A fleeing enemy that despawns shouldn't lose its drop or break "clear the camp" counts.
- **Test:**
  - Spawn a leader pack on the real field: every escort has `leader` set.
  - Hitting one escort wakes all of them.
  - Killing the leader puts ≥ 1 escort into flee within 2 s.
  - Toggling the aura to an odd value changes escort damage by exactly that factor, once.

### E5. Encounters that use the warband properly
- **Pitch:**
  - The "warband" set piece picks a real leader: it filters leaders from the full pool, not the
    role-narrowed one (`encounters.js:338`).
  - `spawnShare` applies to set pieces too.
  - The "— out of <fort>" line names the warband's camp (E2).
- **Extends:** `js/encounters.js` `poolFor` (`:303-319`), `spawnBodies` (`:338`), `ownerOf` (`:243`),
  `data/encounters.json` `warband` entry.
- **Player notices:** "A warband on the road — Ashtusk, out of Gorrak's Stockade" with an actual
  Warchief at the front.
- **Size:** S
- **Risks:** The change is small but touches the shared pool code, so round-19 tests that pin old
  headline counts may need updating to the rule.
- **Test:**
  - Roll the `warband` encounter 200 times in a held zone: the head body is a `leader` in ≥ 95%, and
    ≥ 60% of bodies are warband members.
  - In an unheld zone, members are 0%.

### E6. Warband patrols with bodies, on real roads
- **Pitch:**
  - `js/patrols.js` already moves 10 patrol compositions along road nodes with a clock, and nothing
    ever gives them bodies.
  - Spawn the patrol near the player from the warband's members (or from the faction's `patrol`
    composition for human factions).
  - Wire `patrols.killed` so `patrol_killed` is finally credited.
- **Extends:** `js/patrols.js` (`killed()`, `reaction()` and `near()` have no callers), the `folk`
  body spawn/despawn pattern round 22 used for wanderers, `territory` deeds.
- **Player notices:** Orcs marching the road between their camp and the next valley. Killing them
  counts.
- **Size:** M
- **Risks:**
  - The classic **finished module with no way in**. Wire all three functions, not one.
  - Despawn radius vs record lifetime: round 21's event lesson (bodies despawned at 300 m while
    records lived to 420 m). Use the same `keepRadius` leash.
- **Test:**
  - Walk a player to within 90 m of a patrol's clock position: bodies appear, all on or near the road.
  - Kill them: `patrol_killed` is credited once.
  - Walk away and back: the same patrol isn't duplicated.

### E7. Taking their ground back: a saved warband grip
- **Pitch:**
  - Each held zone gets a grip (0–1, a saved delta).
  - Taking the camp (E2), killing the warlord (E3), wiping patrols (E6) and warband jobs (E8) push it
    down, and it creeps back over days.
  - Grip scales `spawnShare` for that zone.
  - At 0 the zone is free: the warband's spawns stop and the human holder returns.
- **Extends:** `js/warbands.js` (`createWarbandMap` is pure seed today, with a WeakMap cache),
  `territory.js` `press` / grip machinery (and E1), `actors.js:333-334` (`spawnShare`), `js/save.js`
  (territory deltas).
- **Player notices:** You can change the map. A valley you cleared stays quieter, until they try to
  come back.
- **Size:** M
- **Risks:**
  - **Save compatibility:** old saves have no grip, so default to the seeded claim at full grip.
  - **Multiplier twice:** `spawnShare × grip` must be applied in *one* place. Today `spawnShare` is
    read in `spawnNear`. Keep it there and have `encounters` read the same helper (E5).
- **Test:**
  - Set a zone's grip to 0.3 on the real field and spawn 1,000: the member share ≈ 0.65 × 0.3
    (tolerance).
  - At grip 0 there are no members.
  - Save/load keeps the grip.
  - Time passing restores it by the documented rate, moved to an odd value to prove it's read.

### E8. Jobs, rumours and incidents that name the warband
- **Pitch:**
  - Add `warband`, `leader` and `camp` candidate types to the job generator, with frames such as
    "Break the Sootwick camp", "Bring down the Ashtusk Warchief" and "Thin their patrols".
  - Add rumour kinds ("the Horde's warchief was seen at the ford").
  - Add a `warband_push` incident (they grow their grip in a neighbour zone).
- **Extends:** `js/jobgen.js` candidate types (`:537-575`, no warband type), `data/job-frames.json`
  (22 frames), `js/rumours.js` (12 kinds), `data/incidents.json` (12, none about warbands),
  `huntableIn` (`main.js:2767`).
- **Player notices:** The quest board and the tavern talk about the thing that's actually in the next
  valley.
- **Size:** M
- **Risks:**
  - The round-10 job rule: a frame is offered only when every slot binds to something that exists
    now. A camp job needs a real camp (E2).
  - **Fix the `beast_moved_in` bug on the way** (below).
- **Test:**
  - Generate 500 jobs across seeds: every warband job's bound camp, leader or zone exists and is held
    by that warband.
  - Each new frame is offered at least once (no dead frames, the round-19 orphan rule).

### E9. Fix `beast_moved_in`, so champion jobs can bind
- **Pitch:** The job candidate rank comes from `e.boss` / `e.champion`, which no bestiary def carries
  (`jobgen.js:556`), so the `champion` slot (`job-frames.json:51`) never matches and the frame can
  never be offered. Bind champions from *live* champion units, or from defs that can roll champion.
- **Extends:** `js/jobgen.js`, `data/job-frames.json`.
- **Player notices:** "A beast has moved in" jobs start appearing.
- **Size:** S
- **Risks:** None beyond the job rule above.
- **Test:** The frame-coverage test from E8 catches it. That test is the real deliverable.

### E10. Elite members and a warband champion ladder
- **Pitch:**
  - Each warband gets 2 elite variants (a shield-bearer and a standard-bearer, for example) using the
    same template, a champion-rank modifier chosen from the warband's theme, and the round-26 helms
    enemies don't use yet (`war_helm`, `bone_headdress`, `wolf_helm`, `rune_helm`).
  - The standard-bearer carries the banner, and killing him ends the leader aura (E4) early.
- **Extends:** `data/warbands.json` + `tools/build-warbands.py` (TPL table, `leads`), the 22 modifiers
  in `enemies.json`, `avatar-3d/js/chibi2-hats.js` class helms, `avatar-3d/data/class-outfits.json`
  (25 kits to re-colour).
- **Player notices:** More variety inside a faction, and a visual pecking order you can read.
- **Size:** S–M
- **Risks:**
  - New Chibi 2 part ids must also be registered in `avatar-2d/js/parts/chibi2-parts.js`, or the
    shared normaliser drops them (the CLAUDE.md rule).
  - `enemies.json` stays untouched (inject at load).
- **Test:**
  - Every new def's look survives the normaliser (round-26 test pattern).
  - Every elite builds as its race with the named hat.
  - Elites spawn only in their warband's held zones.

### E11. Warband war-chests and trophies: loot with their name on it
- **Pitch:**
  - Each warband gets a small loot identity: 2 uniques and a 3-piece set injected at load (the
    round-23 `uniques.js` pattern), a trophy from the warlord for the Holding (a monument/decor build
    piece), and a plantable war banner that lowers that warband's grip nearby.
  - The camp's sealed chest (E2) rolls from it.
- **Extends:** `js/uniques.js` injection, `data/uniques.json` / `tools/build-uniques.mjs`, the `foci.js`
  set pattern (the Archivist's Regalia), `data/structures.json` decor, round-25 sealed chests.
- **Player notices:** A reason to hunt a particular warband. "The Ashtusk set" is a goal.
- **Size:** M
- **Risks:**
  - **items.json is shared with Emberveil**: inject in memory only, as uniques and foci do.
  - Round 23 found every unique's power ran twice. New powers go through the one `resolveAttack` path,
    and the U23-style table pins the numbers the card prints.
- **Test:**
  - Every new unique's power is resolved exactly once per hit (the round-23 double-run test,
    extended).
  - The camp chest can drop the set.
  - A save with a set piece round-trips.

### E12. Counter-raids: the warband comes for your Holding
- **Pitch:**
  - When you push a warband's grip down (E7), it may answer with a raid on your base.
  - The raid is composed from **that** warband's members, with its warlord at the reckoning tier.
  - It also fixes today's leak, where *any* warband's members can raid a base in a zone they don't
    hold.
- **Extends:** `js/raid.js` `raidersFor` (`:111-119`, uses the full bestiary), `js/defence.js:214`,
  `js/muster.js:129`, `data/raids.json` (the "warband" tier named for nothing).
- **Player notices:** Actions have a response. The base's defences have an enemy with a name.
- **Size:** M
- **Risks:**
  - Raid frequency: round 14 had "they happen too often". A counter-raid must be offered like other
    raids (ring the bell), not forced, or be clearly telegraphed with a timer.
  - Offline progress: a raid while away must not wipe a base.
- **Test:**
  - `raidersFor` in a zone held by X returns only X's members (or no warband members if unheld).
  - After a grip push, a counter-raid offer appears within N days, and its bodies are all X.

### E13. Fix what the strongholds promise
- **Pitch:**
  - One payer per stronghold. `creditKill` and `freePrisonersOf` both pay `gives`, with no shared
    flag.
  - "Taken" means the boss is down, not "four kills near a territory record".
  - `opensDungeon` really opens a dungeon mouth: an instance door at the keep, using round 16's
    `createDungeon({shape, nodeId, holds})`.
  - Instance bosses read `holds.boss.rank` / `modifiers` / `family` (all unread today). A humanoid or
    undead instance gets a warband warlord (E3) instead of a random beast.
- **Extends:** `main.js:2490-2517` and `:4805-4825` (two payers), `:2511/:4820/:5772` (log-only
  `opensDungeon`), `data/instances.json` `holds.boss`, `js/dungeon.js`, `js/questrewards.js`
  (round 16's "one payer for every turn-in path").
- **Player notices:** Taking a castle is a proper finish: the boss falls, the spoils drop once, and a
  stair really goes down.
- **Size:** M
- **Risks:**
  - The two site lists (territory record vs sites.js geometry) don't share coordinates. Joining them
    by the boss unit (the honest hook, per the code's own comment) is the right direction, and the
    `claimLandmarks` join from round 16 is the pattern.
  - Old saves may hold a half-taken camp: tolerate it.
- **Test:**
  - Take a prisoner castle in a scripted fight: xp, perk point and chest are paid **exactly once**
    (count chest placements).
  - After `opensDungeon`, a dungeon mouth exists within 40 m, and E at it enters an instance.
  - Every instance's boss family matches `holds.boss.family` when one exists.

### E14. Warbands fight each other and the wildlife at their borders
- **Pitch:**
  - Where two warband-held zones touch, or a warband zone touches a human faction's, border patrols
    (E6) sometimes meet and fight.
  - The player finds the aftermath (bodies, a looted cart) or joins in, and grip shifts to whoever
    wins.
- **Extends:** E6 patrols, `actors.js` targeting (enemies only target the player and pets today),
  `territory.js` `press`, and the events.json "find" events for the aftermath.
- **Player notices:** The world moves without you, and you can pick a side.
- **Size:** L
- **Risks:**
  - Enemy-vs-enemy targeting is new AI ground (the threat work in round 22 was player/pet only), and
    fights off-screen must be simulated, not run.
  - Performance: two packs fighting doubles the bodies near the player.
- **Test:**
  - Put two opposed patrols in range on the real field: they target each other, not the player.
  - An off-screen resolution moves grip by the documented amount.
- **Tag:** **[NEW]**, a new behaviour layer. The rest of E doesn't depend on it, so it can wait.

### E15. The map and the zone card show who holds what
- **Pitch:**
  - A warband layer on the map, tinted with the warband's `colour` (unread today). It uses
    `createWarbandMap().held()`, which was written "for the map legend" and has no caller.
  - The zone-border banner and the zone card name the holder and its grip (E7).
  - The first-visit log line becomes a banner.
- **Extends:** `js/warbands.js` `held()`, `js/map.js` layers/legend, `hud.js` zone banner (`:705`),
  `js/zones.js` overlay.
- **Player notices:** You can plan: "Stonehide hold the whole northern range, not yet".
- **Size:** S
- **Risks:** The map only names regions you've entered or heard of (round 10). The warband layer
  should follow the same reveal rule, filled by rumours (E8) or visiting.
- **Test:**
  - The map's layer lists exactly the held zones that are revealed.
  - Each tint equals the warband's `colour`, moved to an odd value to prove it's read.

---

## F. Cross-cutting detail that extends what's there

### F1. Emotes in the world
- **Pitch:** Use the 17 unused `CHIBI2_EMOTE_ANIMS`:
  - townsfolk idle `drink` / `cross arms` / `look around`
  - gate guards `salute` if your standing is high (D6)
  - freed prisoners `kneel`
  - a warband leader `point`s at you when it aggros
  - camp idles `sit` / `sleep`
- **Extends:** `avatar-3d/js/chibi2-motion.js` `CHIBI2_EMOTE_ANIMS`, `actor.setHandsFree`, `js/town.js`
  idles, `encounters.js` aggro (Round 24 follow-up 2).
- **Player notices:** People look alive, and enemies telegraph.
- **Size:** S–M
- **Risks:** Clip routing: round 25 found strike clips restarting every frame. Emotes must play once,
  not per frame. Chibi 2 is shared, so no model changes are needed, only Farhold calls.
- **Test:** Every emote Farhold asks for is a clip the body builds, with a length (the
  `round24-chibi2.test.js` pattern). A town has ≥ 1 emoting body over 30 s.

### F2. Enemy humanoids use the player's weapon patterns
- **Pitch:** Route enemy humanoid attacks through `clipFor` with a step counter, so an Ashtusk Raider
  alternates cuts and finishes with an overhead, and a Deathmarshal's greatsword swings like one
  (Round 24 follow-up 5).
- **Extends:** `js/weapons.js` `swingPlanFor` / `clipFor` / `animFamilyOf`, `actors.js` attack.
- **Player notices:** Fights with warband members read as swordplay, not the same swing on a loop.
- **Size:** S
- **Risks:** Visual only: damage must not start following the pattern's multipliers by accident
  (multiplier twice with the enemy's own `dmg`).
- **Test:** An enemy with an axe posts `chop`, then a different clip, then a finisher over 3 attacks.
  Its damage per hit is unchanged against the old code for the same seed.

### F3. Crossroads and bridges as event slots
- **Pitch:**
  - Once B3 makes real crossroads and C1 makes named bridges, give `sites.js` / `encounters.js` those
    as slot types.
  - A toll troll at a stone bridge, a gibbet at a crossroads, a warband checkpoint on the road into
    their valley (E2).
- **Extends:** `sites.js` slot kinds (`landmark`, `pass`, `road`, `junction`, `crossing` already in
  `strongholds.json` `on`), `data/events.json`.
- **Player notices:** Events stand where they make sense.
- **Size:** S
- **Risks:** Round 21's pillars-in-the-road: anything at a crossing uses `roadNear`'s bearing and half
  width.
- **Test:** Every slot at a crossroads or bridge has its footprint off the carriageway and off the
  deck (`bridgedAt(x, z, pad)`).

### F4. Body size is real for enemies
- **Pitch:** A giant (1.35x) and a goblin read the right size to the world: collision radius, reach,
  hit height of arrows, and doorway fit in instances all scale by `actor.metrics().height / 1.73`
  (Round 24 follow-up 1, applied to enemies first because warbands made them common).
- **Extends:** `actors.js` add (radius, reach), `combat-feel.js` knockback rank resistance,
  `dungeon-plan.js` door sizes.
- **Player notices:** A Stonehide Smasher can't squeeze down a 1 m corridor, and its maul reaches
  further.
- **Size:** S–M
- **Risks:** Multiplier twice: `reach` in warbands.json may already account for size (build-warbands
  `mods`). Scale one of them, not both.
- **Test:**
  - For each race, the collision radius equals the base × the height ratio.
  - A giant's reach is from the data, with no second scale applied: set the data to an odd value and
    read it back.

### F5. A codex page per warband and per road kind
- **Pitch:** The journal's bestiary pane gets a warband page: members met, leader name, camp location
  once found, grip, uniques seen. It uses the same data the game reads, so it can't drift.
- **Extends:** The round-10 nine-pane journal, `js/warbands.js`, and FUTURE_SYSTEM_BRAINSTORM §7's
  "one what-does-this-do surface".
- **Player notices:** The faction has a story you're collecting.
- **Size:** S
- **Risks:** Wording standard (`WORDING.md`): numbers as digits, no vague prose.
- **Test:** The page lists exactly the members whose `defId` is in the player's kill ledger, and the
  grip shown equals E7's saved value.

---

## Recommended order

If this becomes the round-27 list, this order keeps every step useful on its own and puts the
fixes first:

1. **Fix what's already promised:**
   - D1 (one town size)
   - E13 (one stronghold payer, a real `opensDungeon`)
   - E9 (`beast_moved_in`)
   - E5 (the encounter leader pick)
   - C6 (dead bridge fields)
   - the `bossFor` fallback (part of E3)

   All S–M, all bugs, and all of them undermine the bigger ideas if left.
2. **The faction spine:** E1 (join warbands to territory) → E2 (war camps) → E3 (warlords) → E7 (saved
   grip) → E15 (map layer) → E8 (jobs and rumours). After these, a warband is a place, a face and a
   goal.
3. **Terrain and roads that fit together:** A1 (switchbacks), A3 (cliffs are walls), B4 (road speed),
   B1 (road classes), B2 (signposts), B3 (crossroads). The first three make terrain and roads a route
   choice.
4. **Towns with edges:** D2 (culture walls), D4 (planner gates), D3 (village fences), D8 (arrival
   banner), then D5/D6 (night gates, guards who notice).
5. **Detail passes:** A2, A4, A6, C1, C2, B6, D7, E4, E6, E10, E11, F1–F4.
6. **Later:** E12 (counter-raids), C3 (settlement anchor: big, touches markers and saves), E14
   (warband wars, the only real new system here).

**Count:** 49 ideas: A 8, B 7, C 6, D 8, E 15, F 5. Only E14 is a new system; everything else
extends a named module or wires something that's already written.
