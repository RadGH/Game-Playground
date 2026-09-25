# Farhold round 27 — the plan (10 milestones)

The ask: *"Continue by adding detail, refining the terrain/road/bridge/gate system, add the enemy
factions with bosses and etc. … They should EXTEND current features rather than add new ones. Break it
into 10 milestones and implement them all."*

Sources: `research/round27-brainstorm.md` (ideas) and `research/round27-roast.md` (verdicts, and the
corrections to the brainstorm's diagnosis — read §0 of the roast before starting any milestone). Idea
ids (A1, E13 …) refer to the brainstorm.

Every milestone below is an **extension of an existing module**. Nothing here adds a new system.
Line numbers are as of commit `5276f58` and will drift; search for the named function.

---

## Rules for every milestone

1. **Measure the real thing.** Build worlds with `createWorld` + `makeTerrain` (see
   `tests/round22-roads.test.js` `eachWorld`), build features with
   `createFeatures({add(){},remove(){}}, terrain, {seed, radius: 2600})` (see
   `tests/round23-bridge-gate.test.js:26-32`), and spawn on the real `EnemyField`. Read the drawn
   mesh's own buffers for geometry. Do not assert a sentence or a tuning constant. To prove a knob
   is read, move it to an odd value and ask the module (the dead-data rule).
2. **Standard seeds:** 25392 (the user's world, scale 0.1 = Super tiny), 7, 4477, 101, 1337, and 47
   (round 23's gate world). Use scale 0.1 and scale 1 wherever planet size matters.
3. **Shared files are read-only on disk:** `data/items.json`, `avatar-3d/*`, `avatar-2d/*`,
   `worldgen/*` and `data/enemies.json`. Inject at load, as `uniques.js` / `foci.js` /
   `warbands.js` do. `proctown/` is ours but has its own tests: `node --test proctown/tests/`
   must stay green.
4. **main.js discipline.** It is 10.5k lines and touched by nearly every milestone.
   - Put the logic in the module. main.js gets **call sites only**, ideally ≤ 30 changed lines per
     milestone, each tagged `// R27 Mn`.
   - Add hooks next to the existing call site they extend, never in a new block at the top.
   - **TDZ:** never reference a `const` above its declaration (`hud`, `field`, `folk`, `sites` …).
     Four boot crashes in this project came from that, and `node --check` sees none of them.
     After any main.js edit, run the boot spec (`npx playwright test tests/farhold.spec.js -g
     "boots"` or the closest existing boot test) before committing.
   - **`window.farhold`:** new keys must not duplicate existing ones. A duplicate key silently wins,
     which was round 11's `board` bug. Grep before adding.
5. **Playwright:** never run two Playwright suites at the same time on this machine. Parallel agents
   take turns: run node tests freely, and run specs one file at a time with a lock
   (`flock /tmp/farhold-pw.lock npx playwright test <file>`). Specs run against the dev server
   `http://<LAN-IP>:8401/`.
6. **Saves:** every new saved field must load from an old save with a sensible default. Add a case to
   `tests/save.test.js`.
7. **Docs, at the end of each milestone:**
   - Append a short subsection to `prototypes/farhold/RPG.md` under `## Round 27` (append only, so
     parallel agents don't conflict; if the heading doesn't exist yet, the first milestone creates
     it).
   - The CLAUDE.md Farhold row is updated once, after M10.
   - Also update `README.md:226-231` (bridges source) in M5.
8. **Commit per milestone** on master (sandbox). Stage by file name. Run the milestone's own tests
   plus the tests listed as "must stay green".

---

## M1 — Strongholds pay once, and keep their promises

**Goal:** take a stronghold once and get paid once. What the camp promised (a stair down, a real
boss at any level) actually happens. This goes first because the war camps (M10) are built on it.

**Features**

1. **One payer per stronghold** (E13). Today `freePrisonersOf` (`main.js` ~4784-4830) pays
   `site.gives` again on every revisit: `sites.relax()` un-populates at 420 m, `due()` hands the
   site back, and `populateSite` (~4757-4767) refills `heldFolk` and respawns the boss.
   - Add a `taken` flag to the `sites.js` site record, set on the first payout.
   - Route both payout paths through one `payStronghold(site)` in `js/sites.js` (or
     `js/questrewards.js`, the round-16 "one payer"), guarded by `taken`.
   - `populateSite` / `due()` never refill a taken site (bodies may return as ordinary spawns, but
     no boss, no prisoners and no `gives`).
   - Call the existing `sites.clear()` (`sites.js:1427`), which `main.js` never calls.
2. **Taken means the boss is down.** `creditKill` (`main.js` ~2460-2518) stays as the territory
   *deed* counter (standing, `clearSite`). It must **not** pay a `sites.js` site's `gives`, and in
   particular it must never pay a landmark's: `sites.nearest(x, z, 40)` has no kind filter. The
   stronghold payout happens when the site's `bossUnit` dies (the honest hook the code comments
   ask for), whether or not it holds prisoners.
3. **Read or delete `gives.clears`** (`data/strongholds.json`). Read it if it means "taking this
   clears the territory record"; otherwise remove it from the data.
4. **`opensDungeon` opens a dungeon** (`main.js` ~2511, 4820, 5772 are log lines today). On take,
   file an instance mouth within 40 m of the keep through the same path round 26 used for beast-den
   mouths (`ObstacleField.coverAt`, the dungeon-mouth interact). `createDungeon` takes
   `{ shape, nodeId, holds }` (round 16). The mouth persists via the site's `taken` save.
5. **Instance bosses read `holds.boss.rank` / `.modifiers`** (`main.js` ~5080-5088 reads only `id` and
   `family`; `actors.js` `placeBoss` forces `boss: true` with no modifiers). Pass them through
   `placeBoss` using the same `applyModifier` path as champions, never a second multiplier.
6. **`bossFor` never falls back to the Warden.** `actors.js` `bossFor` (~478) returns null above
   level 30, and callers use `bosses[0]` (`main.js` ~4701, ~5087) or `enemies[0]` (~5802). Make
   `bossFor` return the boss whose band is nearest the level (biome first, then any biome), and
   delete the three fallbacks. M10 adds the high-level warlords; this change makes them reachable.
7. **Small promised-but-broken fixes on the faction side:**
   - **`beast_moved_in`** (E9): in `jobgen.js` (~550-557), rank candidates from *live* champion
     units, or from defs that can roll champion (the `addRanked` rules in `actors.js` ~372-381),
     so the champion frame binds.
   - **Encounter leader pick** (E5): in `encounters.js` `spawnBodies` (~336-337), pick the leader
     from the full `defsFor` pool, not the role-narrowed one.
   - **`raidersFor` leak** (E12, leak only): in `raid.js` (~111-119), warband members raid only a
     base inside a zone their warband holds. Use `field.warbands.of(zone)`.

**Player sees:**
- Clearing a castle pays its chest, xp and perk point once.
- A stair really opens behind the keep.
- A level-40 lair holds a level-40 boss.
- "A beast has moved in" jobs appear on the board.
- A warband encounter is led by a real leader.

**Acceptance (measured)**
- **Scripted take.** Take a prisoner castle (a `strongholds.json` kind with `prisoners`) on the real
  field. Kill the boss, walk 500 m away (triggering `relax`) and back (`due`).
  - The chest placement count, xp gained and perk points gained equal the data's `gives` exactly
    once.
  - A second boss kill is impossible, because no boss respawns at a taken site.
- **Landmarks.** Across 6 seeds, with `creditKill` driven to clear every territory camp, zero
  landmark `gives` are paid by it.
- **Stair down.** After taking a site with `opensDungeon`, a mouth exists within 40 m, and the
  interact at it enters an instance whose boss family equals `holds.boss.family` whenever one is
  set.
- **Boss levels.** For every level 1-50 and every biome family, `bossFor` returns non-null. A static
  grep finds no `bosses[0]` or `enemies[0]` boss fallback in main.js.
- **Jobs.** Generating 500 jobs over 6 seeds offers `beast_moved_in` at least once.
- **Encounters.** Rolling the `warband` encounter 200 times in a held zone puts a `role === 'leader'`
  body at the head in ≥ 95 % of rolls.
- **Raids.** `raidersFor` in an unheld zone returns 0 warband members. In a zone held by X, it
  returns only X's members plus non-warband defs.
- **Saves.** A save taken after a take reloads with `taken` set and the mouth present. An old save
  without `taken` loads with every site untaken.

**Tests:**
- New `tests/round27-strongholds.test.js` (node): pay-once, landmarks, `bossFor` sweep, jobgen,
  raids, encounters.
- Extend `tests/prisoners.spec.js`: a revisit pays nothing.
- Extend `tests/save.test.js`.
- **Must stay green:** `prisoners.spec.js`, `landmark-gives.test.js`, `round16-instances.test.js`,
  `round26-dungeon.test.js`, `worldbosses.test.js`, `round16-quests.test.js`, `expansion.test.js`,
  `orphans-c.test.js`.

**Risks:**
- **Double payment through a third path.** Grep every reader of `.gives` before starting.
- **The two site lists don't share coordinates.** Don't try to join them in this milestone, only stop
  the cross-payment.
- **Old saves with a half-taken camp** load as untaken. That is fine.

**Files:**
- `js/main.js` (creditKill, freePrisonersOf, populateSite call, the three `opensDungeon` sites, the
  boss fallbacks at ~4701 / 5087 / 5802)
- `js/sites.js`, `js/questrewards.js`, `js/actors.js` (`bossFor`, `placeBoss` only), `js/jobgen.js`,
  `js/encounters.js` (`spawnBodies` only), `js/raid.js`, `js/save.js` (if the site snapshot lives
  there), `js/dungeon.js` (only if the mouth path needs it)
- `data/strongholds.json`
- tests

---

## M2 — One town size, and the planner's own gates

**Goal:** every system agrees where a town ends, and every main street meets a gate.

**Features**

1. **One town extent** (D1). Add `townExtent(node, plan)` to `js/town-plan.js`, returning
   `{ ring, wall, walled, tier }`.
   - It reads the planner's real `plan.ring` / `plan.wallRadius` when the town has been planned. The
     planner may grow the ring ×1.3 or ×1.65 (`proctown/js/townplan.js` ~524, 548).
   - Otherwise it falls back to `footprintOf` as a **floor**.
   - Cache the plan per node id so early callers can ask later.
   - **Callers switch to it:**
     - `town.js` `safeZones` (~707-708)
     - `features.js` `settlementAt` (~1476-1479)
     - `waypoints.js` `boundaryOf` (~52-56)
     - `townhall.js` (~179, the walled/open label)
     - `features.js:1122` (`size >= 4`)
   - `sites.js` `townGap` (~454) keeps its keep-clear `190 + 120·size` but is floored at
     `extent.wall + 60`.
   - `footprintOf` stays (the planner needs it) but is defined once. Farhold's
     `town-plan.js:85-89` re-exports proctown's instead of copying it.
2. **One wall tier function.** Collapse the six `size >= 4` wall checks into
   `wallTier(size) → 'none' | 'low' | 'wall'` in `town-plan.js`. M3 fills in `'low'`; here it maps
   size ≥ 4 to `'wall'` and everything else to `'none'`, so behaviour is unchanged.
3. **The muster reads the town** (`main.js` ~3502-3506).
   - `walled` comes from `townExtent(...).walled`.
   - `guards` counts the *town's* guard bodies (`folk`), not `colony.guards()`.
   - `plots` is the plan's plot count.
   - Fix `tests/civilization.test.js:682` to build its town through the real path instead of
     hard-coding `walled: true`.
4. **The planner's gates are used** (D4).
   - `features.js`'s gate cut (~1146-1316) merges proctown's `plan.wall.gates` (main-street ends,
     2-4 of them) with the `ringCrossings` road gates, by bearing, on the final `wallR`: within
     0.12 rad, keep one (the road one, sized to the road).
   - A walled town with no road no longer gets `rng() * TAU` (~1148). It gets the planner's gates.
   - Fix proctown's `buildWall` returning `kind: radius`.
5. **Gate guards don't depend on load order.** `town.js` (~352) reads `features.gatesOf` once in
   `populate`. If a town was populated before its gates were filed, re-post when `gatesOf` first
   returns records.
   - Clear `gateRecords` for a town when its features are rebuilt (`features.js` ~471: a `Map`
     never cleared).
   - Don't post guards at a gate over water.

**Player sees:**
- No enemy spawns or wanders inside a grown city's wall.
- "You are in town" agrees with the wall.
- No main street runs into solid masonry.
- The town hall's "walled" is true for walled towns.
- The muster's walled bonus finally applies.

**Acceptance (measured)**
- **Safe zones.** For every settlement on 6 seeds (scale 0.1 and 1): `safeZones` r ≥
  `plan.wallRadius + 10`; `settlementAt` is true at `wallRadius − 1` on 16 bearings; `boundaryOf` ≥
  `wallRadius`.
- **Spawns.** Spawn 500 enemies with the live `spawnNear` around each walled town on 3 seeds: 0
  inside `wallRadius`.
- **Gates.** For every walled town on 6 seeds:
  - every `main` street end within 3 m of the wall has a drawn gate gap within 4 m
  - gate count ≥ 2
  - the walled-town-with-no-road case (find one, or force one) has ≥ 2 gates, each within 4 m of a
    street end
- **Reachability.** A flood fill over the collider field from each gate reaches the town square
  (round 23's wall walk extended).
- **Muster.** `muster` reports `walled: true` for every size ≥ 4 town, and `false` below.
- **Unchanged.** `wallTier` gives exactly today's walled set: the round-8 `footprintOf(5).walled`
  test and the round-16 walled-town counts are unchanged.

**Tests:**
- New `tests/round27-towns.test.js` (node, real worlds + `createFeatures` + the proctown planner).
- **Must stay green:** `round22-roads.test.js`, `round23-bridge-gate.test.js` + `.spec.js`,
  `round16-roads.test.js`, `round17-worldgen.test.js`, `round8.test.js`, `round21-town.test.js`,
  `civilization.test.js`, `proctown/tests/townplan.test.js`, `round4.spec.js` (reads `safeZones`),
  `waypoints.test.js`.

**Risks:**
- **Plan not yet available when `sites.js` places.** That is why `footprintOf` is a floor and the
  plan is cached.
- **Merging gate lists.** Round 22 found the high street 7° off its gate because two radii were
  asked. Always use the final `wallR`.
- **Gatehouse cap.** The per-town gatehouse cap is 4 (`gate.n < 4`) and the mesh cap 80; a town with
  4 planner gates and 2 road gates has 6 gaps. Keep gatehouses on the first 4 (road gates first),
  and let the rest be plain gaps.

**Files:**
- `js/town-plan.js`, `js/town.js`, `js/features.js` (wall/gate block ~1122-1340 and `settlementAt`
  only), `js/waypoints.js`, `js/townhall.js`, `js/sites.js` (`townGap` only)
- `js/main.js` (muster lines only)
- `proctown/js/townplan.js` (`buildWall` typo, exports)
- `tests/civilization.test.js`, new test

---

## M3 — Walls by culture, fences by size, and a banner at the gate

**Depends on M2** (`townExtent`, `wallTier`, merged gates).

**Goal:** you can tell an orc town from an elf town from the road, every settlement has an edge, and
you are told where you've arrived.

**Features**

1. **Culture walls** (D2). Read `CULTURES[*].wall` (`proctown/js/townplan.js` ~84-114) through the
   town's culture. Build five wall/tower/gatehouse mesh variants:
   - stone / cutstone: today's masonry, and cutstone gets a crisper cap
   - palisade: sharpened log posts
   - hedge: a green rounded mass
   - bone: posts with rib arches
   - mudbrick: a thick rendered wall

   The geometry goes in `proctown/js/buildkit.js` (the kit page shows it). Farhold picks the variant.
   - **The collider does not change:** it stays the round-23 straight `addSegment` pieces on exactly
     the drawn line, for every variant.
   - Variants share one InstancedMesh per *kind*, and caps come from `town-plan.js` `BUILDING_INFO`.
2. **Villages get a fence, hamlets get boundary stones** (D3).
   - `wallTier` returns `'low'` for size 2-3: a low fence or hedge ring at `extent.ring + 4`, with
     gaps where streets and roads cross it.
   - Size 1 gets 2 boundary stones either side of each road entrance.
   - **Decoration only, with no collider.** Say so in a code comment and in RPG.md.
3. **Towers by spacing, not fixed angles.** `features.js` ~1339-1341 places gate ±0.26 rad plus four
   quarter angles and `.slice(0, 10)`. Place a tower at each gate flank, then fill the arcs between
   gates at a target spacing (for example 45 m of wall per tower). Skip spots on water or a kerb and
   *slide* to the nearest dry spot within 6 m, rather than dropping the tower.
4. **A banner at every gate and an arrival card** (D8).
   - Hang the `sites.js` `banner` model (~273) at each gatehouse, or each boundary stone for small
     towns, in the town culture's colours.
   - On crossing `townExtent(...).wall` (or `ring` for unwalled towns) inwards, call
     `hud.announceZone`'s banner path with the town name, size word, holder faction and services
     (`town.js` roles).
   - Fire once per entry, with hysteresis (re-arm at `wall + 30`).

**Player sees:**
- An orc town behind a palisade, an elf town behind a hedge.
- A village with a fence, a hamlet with stones at the road.
- Towers spread evenly along the wall.
- "Dearbigate — town — held by the Cutwater — smith, inn, healer" as you walk through the gate.

**Acceptance (measured)**
- **Wall kinds.** For 7 cultures × 3 seeds, the drawn wall mesh kind equals `CULTURES[culture].wall`
  (read from which InstancedMesh holds the town's wall instances).
- **Wall ring.** Round 23's walk of the ring (every 0.5 m of dry wall line is solid except the
  gates) passes for every culture.
- **Fences.** Every size 2-3 town has a fence. Every street end reaching the fence ring has a gap
  within 2 m. A walker along every street passes (there is no collider, but assert that no collider
  was filed).
- **Towers.** On the wall ring, no two towers are closer than 25 m or farther than 70 m along the
  wall, except across a gate. Zero towers stand in water.
- **Arrival card.** Walking in along a real road on 3 towns, it fires exactly once per entry, within
  ±2 m of the radius. It does not fire again walking around the market.
- **Budget.** `phase2.spec.js`'s scene draw calls stay < 95 at a town with the new wall kind. Record
  the before and after numbers in RPG.md.

**Tests:**
- New `tests/round27-walls.test.js` (node).
- One focused Playwright spec, `tests/round27-walls.spec.js`: land at a walled town of each of 2
  cultures, screenshot, read the draw calls, walk the gate and see the banner.
- **Must stay green:** `round23-bridge-gate.*`, `round22-roads.test.js`, `phase2.spec.js`,
  `proctown/tests/*`.

**Risks:**
- **Instance caps** (wall 1400, gatehouse 80). Five kinds is five meshes; count them.
- **The kit page** (`proctown/kit.html`) must still render.
- **Banners fired on the wrong radius** would be round 21's three-origins bug again. Use
  `townExtent` only.

**Files:**
- `js/features.js` (wall/tower block only), `js/town-plan.js` (`BUILDING_INFO` caps, `wallTier`),
  `js/hud.js` (arrival card, a variant of `announceZone`), `js/sites.js` (export the banner model
  only)
- `proctown/js/buildkit.js`, `proctown/js/drawkit.js`, `proctown/data/cultures.json` (if a kind
  needs params)
- `js/main.js` (≤ 10 lines: the arrival check next to the existing zone-banner call ~7425)

---

## M4 — Gates that open and shut, and guards who notice you

**Depends on M3** (gatehouses and banners) and **M1** (stronghold records for siege camps).

**Goal:** a gate is a door. It shuts when a siege camp stands nearby, and it bars you when the town
hunts you. Guards speak to you by your standing. There is always a way in.

**Features**

1. **Toggleable colliders.** Add `collide.addSegment(..., { id })` returning a handle, plus
   `setEnabled(id, bool)` (an `enabled` flag checked in the query loop) to `js/collide.js`.
   - `clear()` keeps working.
   - This is the one small plumbing addition the round needs: the field has no delete today.
2. **Gate state** (D5, trimmed: **no night closing**).
   - `gateRecords` gains `open` (derived, never saved). A gate is shut when either:
     - a stronghold of kind `siege_camp` that is **not taken** (M1's flag) lies within its `radius`
       of the town, which makes `strongholds.json:410` true; or
     - the player is **Hunted** by the zone holder (`factions.js` `bandOf`, band `hunted`).
   - When shut, the door leaves (`features.js` ~1288-1307, static today) swing closed, and the door
     segment is enabled. When open, the segment is disabled.
   - Leaves animate over 0.8 s. The mesh is instanced, so update the two instance matrices.
3. **Always a way in.**
   - E at a shut gate talks to the gate guard. Standing Known or better, or a fee of
     `balance.json` `gates.knockFee` (new knob), opens it for 60 s. Hunted refuses.
   - Never shut the gates of the town that holds the player's respawn point or active quest giver.
     In that case the siege blurb shows, but the gate stays open.
4. **Guards who notice you** (D6, trimmed).
   - Gate guards greet or challenge by standing band, with one line each from the faction's
     vocabulary, through `speech.js`. Use `WORDING.md` rules.
   - A guard at an open gate plays the `salute` emote for Trusted+. Play it once, never per frame
     (the round-25 clip rule), using `CHIBI2_EMOTE_ANIMS`.
   - When Hunted, gate guards attack the player **only outside the wall line**. Extend `town.js`
     guard targeting (~536-546, `field.enemies` only today) with a player target gated on standing
     and position.
   - Watchposts get a guard body at the post, which gives `BUILDING_INFO.role === 'guard'` its first
     reader. Barracks guards stay inside.
5. **`nightSpawn` is read** (dead data, roast §0). While a zone's incident effects carry
   `nightSpawn` (`restless_dead` → `'undead'`), night spawns in that zone within 400 m of a town draw
   from that family at 50 %.
   - Read it in the spawner next to `spawnMult` (`main.js` ~7625-7647 is where `zoneEffects` is read).
   - Pass it to `EnemyField` as an option, not as a second multiplier on spawn rate.

**Player sees:**
- A besieged town with its gates shut.
- Clearing the siege camp opens them.
- A town that hunts you bars its gate, and the guards come out for you.
- Friendly guards salute.
- Watchtowers are manned.
- Restless dead walk near a town at night when the rumour says so.

**Acceptance (measured)**
- **Collide.** A unit test adds a segment, disables it (a walker passes), then re-enables it (the
  walker stops).
- **Siege.** On a seed where a `siege_camp` sits near a town (find one, or place one through the
  sites API):
  - the gate is shut, and a walker on the real `player.js` along the street stops at the gate line
  - after M1's take of the camp, the same walker passes
- **Hunted.** With standing forced to Hunted:
  - the gate is shut, and a guard's target becomes the player only while the player is outside
    `wallRadius`
  - forced back to Known, the gate opens after a knock
- **Respawn exemption.** With the respawn town forced under siege, its gate stays open.
- **Watchposts.** Every watchpost in a town has a guard body within 2 m.
- **`nightSpawn`.** With `restless_dead` active at night, ≥ 40 % of 500 spawns within 400 m of the
  town are undead; with it inactive, the rate is the baseline. Move the family to an odd one to
  prove it's read.
- **Saves.** Nothing new is saved. Save and load under siege gives the same gate state.

**Tests:**
- New `tests/round27-gates.test.js` (node: collide, gate state derivation, guard targeting,
  `nightSpawn`).
- Extend `tests/round23-bridge-gate.spec.js` with a shut-gate walk.
- **Must stay green:** `round23-bridge-gate.*`, `town.spec.js`, `expansion.test.js`,
  `round22-threat.test.js`.

**Risks:**
- **Softlock.** The knock and the respawn exemption are mandatory, not optional.
- **Hostile guards inside a town** would make the respawn point a death loop. Guards attack only
  outside the wall.
- **Collider query cost.** The `enabled` check is one boolean per candidate. Keep it inside the
  existing loop.

**Files:**
- `js/collide.js`, `js/features.js` (gate door block only), `js/town.js` (guard targeting, watchpost
  posts, greet), `js/speech.js` or the faction vocabulary data, `js/actors.js` (spawn option only,
  in `spawnNear`'s family choice), `data/balance.json` (`gates` block)
- `js/main.js` (≤ 25 lines: the gate-state tick next to the town tick, the E interact at a gate, and
  `nightSpawn` passed where `spawnMult` is)

---

## M5 — Roads that fit the land

**Goal:** roads wind up mountains instead of charging straight up them, crossing roads meet at a real
junction, highways are wider than trails, and the last rounded-height bug goes.

**Features**

1. **Measure first.** Write the probe as a test helper: every segment's grade from
   `terrain.roadPaths[*].surface` over `points`. Classify each segment over 20 % as:
   - (a) natural ground slope
   - (b) a river/lake lift ramp
   - (c) a junction fade or floor-restore step

   Record the classification for seed 25392 at scales 0.1 and 1 in RPG.md. **Fix (b) and (c) as
   bugs** (ramp over metres, not points; see item 5). Only (a) gets switchbacks.
2. **Switchbacks** (A1).
   - **Where:** in `planet.js`'s road pipeline **before** `connectRoadNetwork` (after
     `mergeRoadNetwork`).
   - **Trigger:** resample each road to ~6 m, find climbs where the natural height rises more than
     12 % sustained over ≥ 40 m, and replace the stretch with a zig-zag inside a corridor of ±0.35
     cell.
   - **Legs:** each leg holds ≤ 10 % natural grade, with at most 6 legs per climb.
   - **Legs must avoid:**
     - water (`wetAt`)
     - the cliff mask (M7 uses the same predicate; define it here as `cliffAt(x, z)` in `planet.js`)
     - town rings: M2's `townExtent` runs in the same wave, so use `footprintOf(size).wall × 1.65`
       (the planner's largest growth) as a conservative ring, and leave a `// R27: switch to
       townExtent` note
   - **When a climb can't be folded:** leave it and mark those points `steep: true`. Never force.
   - **Endpoints:** `from` / `to` / `head` / `tail` are unchanged.
3. **A real crossroads** (B3).
   - After `connectRoadNetwork`, find every intersection between segments of two *different* paths
     that isn't already a filed junction.
   - Split both paths there, and add the point as a junction in `roadJunctions` with one height (the
     mean of the two graded heights).
   - Run the junction fade on all four arms.
   - The floor-restore pass must not move the node: it's pinned, as round 22's 3.49 m fix pinned
     junctions.
4. **Road class widths, one owner** (B1, width part). Add `ROAD_CLASS = { highway: { width: 9 },
   road: { width: 7 }, trail: { width: 4 } }` in `planet.js`. `path.half` is set from it and every
   reader already goes through `path.half` (roast §0 lists them).
   - Re-measure the waystone offset (`half + footing + 1`) and `padOk` at 9 m.
   - Gates are sized from `half` already (`roadplan.js:692` → `features.js:1213`).
5. **Scale the absolute knobs.**
   - `rampPerPoint` (0.5 m per point) becomes a grade (m per metre), derived from the current value
     at the default cell size so the default world is unchanged.
   - `JOIN_REACH = 16` scales with `M_PER_CELL / 640`, floored at 8.
6. **Lakes use the exact conversion** (A5, lake half). `planet.js` ~663, 689: `elevationToMetres` →
   `elevationToMetresExact`. Update tests that pin old lake heights to assert the rule instead (the
   "tests that pin wording" rule).
7. **Delete dead crossing work** (C6, delete half): `meshHalfLength` / `meshHalf()` (~1682, 1843,
   1863), `path.bridgeCells` (~759), and fix `README.md:226-231` (bridges come from
   `findCrossings`). `klass` / `roadHalf` / `river` get readers in M6. Leave them.

**Player sees:**
- Mountain highways on seed 25392 wind up the hill.
- No two roads pass through each other.
- A highway is visibly wider than a trail (colour comes in M8).
- No stepped lake rims.

**Acceptance (measured).** Baseline from the roast's probe: seed 25392 has 62 segments > 20 % and 36
over 30 % at scale 0.1 (max 117 %), and 97 / 55 at scale 1 (max 167 %).
- **Grade on seed 25392.** At both scales, on the resampled drawn lane (`planLane`, 10 m windows):
  - windows over 30 % make up ≤ 0.5 % of road length
  - windows over 20 %, excluding points marked `steep`, make up ≤ 2 %
  - `steep`-marked length ≤ 3 % of the total
  - max grade outside `steep` ≤ 30 %
- **Subset rule.** On seeds 7 and 4477 at scale 0.1, every road that had no climb over the trigger has
  **identical** points to before (compare against a snapshot taken at the start of the milestone and
  checked into the test as a hash).
- **Crossroads.** Across 5 seeds, the count of segment intersections between different paths that are
  not filed junctions is **0**. At every filed junction, the drawn deck heights of all arms agree
  within 0.1 m (read from `laneRibbon`).
- **Round 22 bars still hold.**
  - ribbon-under-terrain across the full drawn width is 0.000 m for every class, including the 9 m
    highway
  - deck error `worst < 0.75`
  - no dead ends, and `from` / `to` are still reachable
- **Lakes.** At every lake rim cell on 5 seeds, the lake surface is within 0.05 m of the exact
  conversion.
- **Dead data.** The orphan test "every field on a crossing record has a reader outside planet.js"
  passes after M6. Add it here marked `todo` for `klass` / `roadHalf` / `river`, and M6 turns it on.
- **Slots.** A `strongholds.json` slot with `on: 'junction'` can now land on a B3 junction on at least
  one seed (F3 as an assertion).

**Tests:**
- New `tests/round27-roads.test.js` (node).
- Extend `tests/round22-roads.test.js` only where it pins a number that this milestone deliberately
  changes; change it to assert the rule.
- **Must stay green:** `planet.test.js`, `water.test.js`, `roadgap.test.js`, `round16-roads.test.js`,
  `round17-worldgen.test.js`, `round22-roads.test.js`, `round23-bridge-gate.test.js`,
  `round21-town.test.js`, `planet-lod.spec.js`.

**Risks:**
- **Road-anchored placements move a few metres:** set pieces, waystones, `linkRoads`. Nothing is
  saved per road, so saves are fine, but *saved markers* on a road may sit a few metres off it.
  That's acceptable; note it.
- **Switchback legs must not re-trigger** the merge weave (round 22). Fold after the merge, before the
  connect.
- **Worldgen time.** Log `makeTerrain` time before and after for 25392 at scale 1. The budget is
  +15 %.

**Files:**
- `js/planet.js` (road pipeline ~750-1290 and lake surface ~660-690 **only**; do not touch `colorAt`
  or `normalAt`, which M7 owns, or `findCrossings` / the deck clamp, which M6 owns)
- `js/roadplan.js` (only if `planLane` needs a class width)
- `README.md`, new test, `tests/round22-roads.test.js`

---

## M6 — Bridges by kind, solid piers, fords and lake spans

**Depends on M5** (final road polylines and class widths).

**Goal:** bridges look like what they carry and what they cross, piers are solid, small streams are
forded, and roads over lakes stop being dams.

**Features**

1. **Three bridge styles** (C1, trimmed), chosen from fields the crossing already carries
   (`crossing.klass`, span, `roadHalf`):
   - **stone arch** for highways with a span ≤ 40 m: an arched underside, stone parapet rails
   - **timber trestle** for a span > 60 m: trestle bents instead of box piers
   - **plank** for everything else (today's)

   Build them in `js/bridge-plan.js` `bridgeGeometry`. **Every style's deck top comes from
   `planBridge`'s one height list** (`deckTopAlong`). Only the underside and the rails vary. Colliders
   are filed from the same list as today.
2. **Solid piers sized to the span** (C2).
   - Piers get banded `addSegment` colliders from riverbed to deck underside (the round-23 rail
     pattern, with `band`), so a swimmer or boat is stopped and a walker on the deck is not.
   - Pier width follows the deck width.
   - The pier bottom is sampled at the 4 footprint corners, taking the lowest.
3. **Fords** (B7).
   - Read World Forge's crossing `kind` (`worldgen/js/roads.js` ~191-196: `'ford'` when river width
     < 2), matched to the Farhold crossing by position.
   - Trails and roads over a ford get no bridge: they get a flagstone causeway whose stones sit at a
     height giving 0.2-0.4 m of water over them.
   - The road surface at a ford is not lifted.
   - `js/ground.js` / `player.js`: water depth < 0.5 m is wading (a slower walk), never swimming.
     Mounts and vehicles follow the same rule.
4. **Lake spans** (C5, trimmed).
   - Where a road's `wet` span over **lake** water (not sea) is longer than 25 m, emit a crossing
     record of style trestle over the lake, instead of letting the deck clamp (`planet.js`
     ~1611-1614) raise an earth plug.
   - Shorter lake spans keep the causeway (documented as intended) and gain two culvert mouths
     (dressing only).
5. `klass` / `roadHalf` / `river` on crossings now have readers, so turn on M5's orphan test.

**Player sees:**
- Stone arches on highways.
- Long trestles over wide rivers and lake narrows.
- Stepping stones where trails cross brooks.
- Piers you bump into when swimming.

**Acceptance (measured)**
- **One deck, every style.** For every crossing on 5 seeds, the drawn deck top (read from the merged
  bridge mesh's own vertex buffer, as `round23-bridge-gate.test.js` does) equals the collider deck
  height within 0.05 m.
- **Walkers.** A walker on the real `player.js` crosses each style end to end without falling.
- **Style counts.** Across 5 seeds there is ≥ 1 of each style, and every highway crossing ≤ 40 m is
  an arch.
- **Piers.** A swimmer driven along the river under 5 bridges is stopped at each pier line and
  passes between piers. Every pier bottom is within 0.2 m of `heightAt` at its lowest corner.
- **Fords.**
  - For every ford, water depth over the stones is 0.2-0.5 m at 1 m steps across the causeway.
  - A walker crossing never enters `swimming`.
  - No ford is on a highway.
- **Lakes.** No road point lies over lake water on an earth plug longer than 25 m. Every such span is
  a crossing in `terrain.crossings`.
- **Orphans.** The crossing-record orphan test passes.

**Tests:**
- New `tests/round27-bridges.test.js` (node).
- Extend `tests/round23-bridge-gate.test.js`'s mesh-buffer loop over styles.
- **Must stay green:** `round16-roads.test.js`, `round17-worldgen.test.js`, `water.test.js`,
  `round23-bridge-gate.*`, `vehicles.test.js`, `ground-vehicles.test.js`.

**Risks:**
- **An arch formula creeping into the deck.** Forbidden; only the underside may curve.
- **Ford depth** is drawn vs measured on water. The stones' height must come from `heightAt` after
  the ford edit, and the swim test must use the same `surfaceOfHit` the player uses.
- **Pier colliders vs the raft.** Boats use the same field; test a boat too.

**Files:**
- `js/bridge-plan.js`
- `js/planet.js` (`findCrossings` ~1790-1880, the deck clamp ~1600-1620 and the ford surface **only**)
- `js/features.js` (bridge filing / `fileDeck` / `fileRails` block only)
- `js/ground.js`, `js/player.js` (wade branch only; M7 also edits player.js, so keep to the swim
  test)
- tests

---

## M7 — Cliffs are rock, and roads are faster

**Goal:** a cliff looks like rock and acts like a wall, a road is the quick way through, and snow and
sand sit where they should on any planet size.

**Features**

1. **Cliffs you can't walk up** (A3, trimmed).
   - Above the round-21 cliff band (slope ≥ `tan 63°`, from the shared `cliffAt` / `slopeAt` predicate
     M5 defines), the player slides back along `normalAt` (the terraform-aware one,
     `terraform.js:351`) instead of walking up at a fifth of the speed.
   - Mounts use the same rule, with `mountSlope` raising the threshold (capped at 70°).
   - **Escape:** after 3 s pinned, allow the climb.
   - **Enemies:** they get **the same rule through one shared helper** in `js/ground.js`
     (`climbable(x, z, fromX, fromZ, sure)`). Today they have no slope term at all
     (`actors.js` ~846-858).
2. **Roads are faster on feet and hooves** (B4).
   - In `player.js`'s legs/hooves branch only: walking ×`balance.json` `roads.walk` (1.15), mounted
     ×`roads.mount` (1.25), highway ×1.1 on top.
   - Reads `terrain.roadAt > 0.45`.
   - Vehicles are unchanged: they already have `spec.road` (`vehicles.js:289`) and replace the
     speed. Add a comment saying why.
3. **Scree and boulders at the foot of cliffs** (A2).
   - In `js/props.js`, for each cell with cliff points, scatter rocks on the downhill fan within 12 m
     of the cliff foot, plus a few boulders.
   - **Own rng stream** (`seed ^ 0x5c1e`, the megaflora pattern); the cell's shared stream is
     untouched.
   - **Reuse the existing `rock` and `boulder` InstancedMeshes** (caps 900 / 400), so there are no
     new draw calls. Boulders are solid via `solids.add` (the props field, *not* `collide.add`).
   - The radial density falloff applies, so a thinned cell is a subset.
   - Never on a road (`roadAt < 0.35`) or in water.
4. **Rock band holds at distance** (A4, rock half). `terrain.js` ~143 uses
   `max(ringSteep, terrain.slopeAt(x, z, 4))`, so a cliff stays grey from the far rings.
5. **Snow and sand follow relief** (A5, colour half). In `planet.js` `colorAt` (~2152-2158), scale
   the snow line's metres and the 9 m sand band by the same factor as `reliefScale` (`M_PER_CELL /
   640`), relative to sea level.

**Player sees:**
- Cliffs are grey from any distance, with rubble at their feet.
- You can't run up a cliff, and nor can the wolf chasing you.
- The road is noticeably quicker.
- Peaks on a Tiny world have snow.

**Acceptance (measured)**
- **Cliffs stop walkers.** On seed 7 and seed 25392, pick 20 measured cliff points (slope ≥ tan 63°):
  - a scripted walker on the real `player.js`, pushing uphill for 5 s, ends lower than the lip every
    time
  - walking along the foot keeps speed within 5 % of flat ground
  - an enemy chasing up the same face on the real `EnemyField` also fails to climb it
- **Roads stay climbable.** Every drawn road lane point on 5 seeds (after M5) is under the
  threshold, so a road is always a way up.
- **Escape.** A walker spawned in a 3-sided gully gets out within 8 s.
- **Share of land lost.** Report the share of land cells above the threshold per seed in RPG.md. It
  must be ≤ 3 % (round 21 measured 2.5 %).
- **Road speed.**
  - With a fixed input, a walker on a road is exactly ×1.15 faster than off it; set to 1.37, it's
    ×1.37 (the knob is read).
  - A driver's speed is unchanged to 3 decimals.
- **Scree.** Every scree instance is within 12 m (horizontally, downhill) of a cliff point, has
  `roadAt < 0.35`, and is not wet. Toggling scree off leaves every other prop instance matrix
  byte-identical.
- **Budget.** `props.stats().drawCalls` is unchanged, and `phase2.spec.js` draw calls stay < 25 /
  < 95.
- **Colour.** For 20 cliff points, `colorAt`'s rock weight evaluated with each ring's steepness input
  differs by ≤ 0.15 between ring 0 and ring 4.
- **Snow.** The snow-cover share of the top 5 % of land height is within ±10 points between scale 0.1
  and scale 1 on 3 seeds.

**Tests:**
- New `tests/round27-cliffs.test.js` (node: player, enemy, speed, scree, colour).
- Extend `tests/density.spec.js` with the scree subset check if the node test can't reach the
  instance buffers.
- **Must stay green:** `stride.test.js`, `planet.test.js`, `density.spec.js`, `megaflora.spec.js`,
  `phase2.spec.js`, `round23-graphics.test.js`, `vehicles.test.js`, `round22-threat.test.js`.

**Risks:**
- **Trapping players.** The escape rule plus "every road is climbable" is the guarantee.
- **Terraform.** Read edited heights (`heightAt`, the terraform `normalAt`), never
  `naturalHeightAt`.
- **Multiplier twice on vehicles.** The road factor lives in the legs/hooves branch only.

**Files:**
- `js/player.js` (slope, slide and road-speed branch; the M6 wade edit is a separate branch)
- `js/ground.js` (`climbable` helper), `js/actors.js` (movement step ~846-858 only), `js/props.js`
  (scree block + own stream), `js/terrain.js` (~143)
- `js/planet.js` (`colorAt` ~2140-2160 and `normalAt` ~2074 **only**)
- `data/balance.json` (`roads` block)

---

## M8 — Roads you can read

**Depends on M5** (classes, junctions) and **M7** (road speed reads `roadAt`).

**Goal:** you can tell a highway from a goat track at a glance, forks tell you where they go, towns
light their approaches at dusk, and a road you build is a real road.

**Features**

1. **Class looks** (B1, look part). `features.js` road material (~441, one `#6b5c49`) becomes a
   colour per class in `laneRibbon` vertex colours:
   - highway: pale paved, with a darker kerb strip on the outer 0.4 m
   - road: gravel
   - trail: dark dirt with a lighter grass crown

   Still one mesh and one draw call: the colour comes from vertex colours, not materials. The kerb is
   in the ribbon, never a separate mesh.
2. **Signposts at junctions, milestones along roads** (B2).
   - At every filed junction (M5's crossroads included) and every town link, place a signpost with
     one arm per branch.
   - Each arm names the settlement reached by **walking the road graph** along that branch (BFS over
     `roadJunctions` / path `from` / `to`), plus the distance in km.
   - An unrevealed place reads "?" (the round-10 reveal rule, the same one the map uses).
   - A milestone every 2 km on highways and roads.
   - Place signs at `half + footing + 1` beside the carriageway (the waystone rule).
   - **Implementation:** a new small module `js/roadside.js` (pure placement, no Three.js) called
     from `features.js`, drawn with two new instanced building kinds (`signpost`, `milestone`) with
     caps. Geometry is ported from `highdef-3d/js/kit/rocks.js` `signpost` / `stone_marker`
     (copied, as round 23 copied the grass).
   - E on a signpost prints the arms to the log.
3. **Lamps on the approach to towns** (B6, lamps only).
   - Lamp posts every 30 m along each road within 400 m outside a size ≥ 3 town's wall, on the
     verge.
   - They light at night through `js/nightlights.js` and the `js/light.js` pool, sorted **below**
     spells, torches and the player's lamp. The count of active point lights never exceeds the pool
     size.
4. **Player roads are roads** (B5, trimmed).
   - `terrain.roadAt` consults the player's lane book (`roadplan.js` `createRoadBook`) as a second
     index and takes the `max`. Do **not** add lanes to `roadPaths`.
   - Consequences:
     - Road speed (M7) and the vehicle surface (`main.js` ~8645) see player roads.
     - Grass: `grassAt` reads `road`. Refresh the grass bake region on lane edits.
     - Props already skip `roadAt > 0.35`.
   - `logistics.js` (~127): the road fraction is per point `max(worldRoad, playerRoad)`, never a
     sum.
   - The index is rebuilt on load before props scatter.
   - Rewrite `data/structures.json` `road_dirt` / `road_cobble` copy to say exactly what is true now.

**Player sees:**
- Three kinds of road.
- "Dearbigate 4 km →" at a fork.
- Milestones.
- Lit approaches at dusk.
- The horse is faster and the grass stays off the road you built.

**Acceptance (measured)**
- **Class colours.** Ribbon vertex colours per class are distinct: highway vs trail ΔE > 20. The road
  mesh is still one draw call.
- **Signposts.**
  - For every arm on 5 seeds, BFS from the post along that branch reaches the named settlement.
  - Every post has `roadAt(post) < 0.3` and is within 8 m of its junction.
  - No sign names a settlement the reveal rule hides (driven with a fresh save: all "?" except the
    start region).
- **Milestones.** On highways and roads, milestones are spaced 2 km ± 50 m along the lane.
- **Lamps.**
  - No lamp within `half + 1` of a road centre line, and none inside a wall ring.
  - At night near a town, `light.js` active lights ≤ pool size, and the player's lamp and an active
    spell light are never the ones evicted.
- **Player roads.**
  - A lane laid in a node test gives `roadAt > 0.45` on it.
  - `grassAt` there returns 0.
  - A walker there is ×1.15.
  - A haul quote over it equals one over a world road of the same length (to 1 %). A lane on top of a
    world road does not boost twice.
  - Save/load round-trips it (the `roadAt` value is the same after load).
- **Budget.** Scene draw calls stay < 95 at a town approach at night.

**Tests:**
- New `tests/round27-roadside.test.js` (node).
- A focused spec, `tests/round27-roadside.spec.js`: dusk at a town approach, count lights, read a
  signpost via E.
- **Must stay green:** `round14.test.js` (player lanes), `industry.test.js`, `round22-roads.test.js`,
  `round23-graphics.test.js`, `phase2.spec.js`, `build-mode.spec.js`.

**Risks:**
- **A sign naming the wrong place.** The BFS test is the guard.
- **Light-pool starvation.** The sort order is mandatory.
- **The `roadAt` overlay must be cheap.** It is on the grass/props hot path. Use the book's spatial
  index, and return early when the player has no lanes.

**Files:**
- `js/features.js` (road ribbon material + one call into roadside), new `js/roadside.js`,
  `js/roadplan.js` (`laneRibbon` colours, book index access), `js/nightlights.js`, `js/light.js`
  (sort only), `js/logistics.js`, `js/build.js` (index refresh on edit)
- `js/planet.js` (`roadAt` ~2130-2140 **only**)
- `js/grass-gpu.js` (bake refresh only), `data/structures.json` (copy only)
- `js/main.js` (≤ 10 lines: the E interact on a signpost)

---

## M9 — Warbands hold ground

**Depends on M1** (encounter leader pick, raid leak and `bossFor` done there).

**Goal:** a warband's hold on a zone is visible, persistent and changeable. It shows on the map, it
marches the roads, and pushing it back sticks.

**Features**

1. **One holder per zone** (E1, trimmed). In `js/territory.js`, when `field.warbands.of(zone)` holds
   a zone, that warband is the zone's hostile holder, and no human hostile faction claims the same
   zone. Write the rule once, where the territory record picks its holder.
   - **No new standing rows:** the 12-faction screen is unchanged.
   - Deeds against a warband move its `rivals` (the human factions whose ground it sits on) through
     the existing deed path by the documented third.
2. **Saved grip** (E7).
   - Each held zone has `grip` 0..1. It defaults to 1 (the seeded claim) and is stored as a **delta**
     in the territory snapshot (`territory.js` ~595-610, saved by `save.js` ~305-309).
   - Grip drops for:
     - warband kills in the zone (small)
     - patrols wiped (medium)
     - the camp taken (large, M10)
     - the warlord slain (large, M10)
   - Grip creeps back at `balance.json` `warbands.gripRegen` per game day.
   - At grip 0 the zone is free: no member spawns, and the claim reads "driven out".
3. **One spawn-share helper.**
   - `warbandShare(zone) = spawnShare × grip`, in `js/warbands.js`, read by `actors.js` `spawnNear`
     (~333-334) **and** by `encounters.js` `poolFor` (~303-319, which ignores `spawnShare` today).
   - Nothing else multiplies by `spawnShare`.
4. **The map and the zone card show who holds what** (E15).
   - A warband layer in `js/map.js` (legend + tint in the warband's `colour`, unread today), fed by
     `createWarbandMap().held()` (its first game caller).
   - It shows only zones revealed under the round-10 rule, or named by a rumour.
   - The zone-border banner (`hud.js` `announceZone` ~704-726) names the holder and grip ("held by
     the Ashtusk Horde — firm / shaken / broken"), replacing the log line at `main.js` ~7425.
5. **Patrols with bodies** (E6).
   - `js/patrols.js` moves patrols along road nodes with a clock; give them bodies.
   - When a patrol's clock position is within 150 m of the player, spawn its composition on the real
     field:
     - in a held zone, from that warband's members (leader + 3-5)
     - otherwise, from the faction's `patrol` composition
   - Despawn with the `keepRadius` leash (round 21's lesson).
   - Wire `near()`, `killed()`, `reaction()` and `loseOne()`. Today all four have no game caller.
   - `patrol_killed` is credited once, and a wiped warband patrol lowers grip.
6. **Jobs and rumours about the warband's ground** (E8, part).
   - One job frame, "Thin their patrols", binding to a live warband patrol in a held zone.
   - One rumour kind naming the holder of a nearby zone (this also reveals it on the map layer).
   - Frames bind only to what exists (the round-10 rule).

**Player sees:**
- The map shows the Ashtusk Horde's valleys in rust red.
- Crossing into one says who holds it and how firmly.
- Orc patrols march the road.
- After you thin them, the valley stays quieter until they creep back.

**Acceptance (measured)**
- **One holder.** On 6 seeds, every warband-held zone reports that warband as its hostile holder, and
  no zone reports two hostile holders.
- **Grip.**
  - With grip set to 0.3 on the real field, over 1,000 spawns the member share is 0.65 × 0.3 ± 0.05.
  - At grip 0 the member share is 0.
  - `encounters` `poolFor` over 500 rolls follows the same share ± 0.07.
  - Grep: `spawnShare` is read only inside `warbandShare`.
- **Regen.** Advancing the clock 1 day restores grip by exactly `gripRegen`. Set it to 0.037 to prove
  it's read.
- **Saves.** Save/load keeps grip. An old save (no grip) loads at grip 1 everywhere.
- **Map.** The map layer lists exactly the held ∩ revealed zones, and the tint equals the warband's
  `colour` (set one to an odd value).
- **Patrols.**
  - Walking the player to within 150 m of a patrol's clock position spawns bodies. All are warband
    members in a held zone, all within 30 m of a road lane point.
  - Killing all of them credits `patrol_killed` once.
  - Walking 500 m away and back does not duplicate the patrol.
- **Jobs.** Over 500 jobs on 6 seeds, "Thin their patrols" is offered ≥ 1 time, and every one binds
  to a live patrol of that zone's warband.

**Tests:**
- New `tests/round27-warbands.test.js` (node).
- Extend `tests/round26-races.spec.js` to assert the live map layer.
- Extend `tests/save.test.js`.
- **Must stay green:** `round26-races.*`, `expansion.test.js`, `round16-quests.test.js`,
  `round4.spec.js`, `events.test.js`, `ambient-bindings.test.js`.

**Risks:**
- **Multiplier twice on spawn share.** It is read in one helper, and the grep test guards it.
- **Patrol bodies near towns.** Don't spawn inside `townExtent` (M2), since `safeZones` already
  excludes it.
- **Rumour reveals must go through the same reveal store the map uses,** not a second list.

**Files:**
- `js/warbands.js`, `js/territory.js`, `js/actors.js` (`spawnNear` share line only),
  `js/encounters.js` (`poolFor` only), `js/patrols.js`, `js/map.js` (layer + legend), `js/hud.js`
  (`announceZone` holder line), `js/jobgen.js`, `data/job-frames.json`, `js/rumours.js`,
  `data/balance.json` (`warbands` block), `js/save.js` (only if the territory snapshot needs a
  version bump)
- `js/main.js` (≤ 30 lines: patrol body spawn/despawn next to the patrols tick ~7674, replace the
  ~7425 log with the banner call, and pass grip to the field)

---

## M10 — War camps, warlords and leaders that lead

**Depends on M1** (single payer, `taken`, `bossFor`) and **M9** (grip, the holder rule).

**Goal:** each warband has a place, a face and a pecking order. There is a camp you can see from the
road, a named warlord with phases, a standard-bearer, a leader whose death breaks the pack, and loot
with their name on it.

**Features**

1. **A war camp per held zone** (E2).
   - In a held zone, one stronghold slot (`js/sites.js` ~629-733) becomes that warband's camp. Add
     one `strongholds.json` row per warband, whose `faction` is the warband id:
     - Sootwick: junk wall
     - Ashtusk: palisade + bone totems
     - Thornmane: thorn ring + hide tents
     - Unburied: barrow-fort
     - Stonehide: standing-slab ring
   - Layouts use `data/setpieces.json` + `proctown/js/buildkit.js` parts, reusing M3's palisade and
     bone wall pieces where they fit.
   - **Garrison is pure:** `defsFor` filtered to `d.warband === held.id`. Fall back to the full pool
     only if the level band leaves none.
   - Banners use the `sites.js` `banner` model in the warband's `colour`.
   - The chest is sealed until the last guard falls (the round-25 rule).
   - The payout goes through M1's single payer. Taking the camp drops grip by
     `warbands.campGrip` (M9).
   - **Don't starve world-boss slots:** camps take a slot only after world bosses are placed.
2. **Warlords** (E3).
   - Five boss rows, one per warband, injected at load by `installWarbands` (**`enemies.json` is not
     edited**), built in `tools/build-warbands.py` → `data/warbands.json` `warlords`:
     - humanoid, of the warband's race, scale 1.6-2.2
     - 2-3 phases in the existing `{ at, modifier, say }` shape
     - `spawns` of their own members
     - a Name Forge name in `nameRace`
   - The Unburied Deathmarshal (up to 36) and Stonehide Mountainlord (up to 50) fill the empty boss
     band above 30. With M1's `bossFor`, they become the high-band bosses.
   - The camp's boss is the warlord. Slaying it drops grip by `warbands.warlordGrip`.
   - XP follows the round-22 zone rule.
   - A warlord never spawns as an instance boss unless its scale fits the instance door
     (`dungeon-plan.js` sizes): check this once in a test.
3. **Leaders that lead** (E4, trimmed).
   - `spawnNear`'s `leads` escort (~352-363) links each escort to `unit.leader`.
   - **Escort wakes with its leader:** the pack wake (~751-755, same `defId` only today) also wakes
     every unit with the same `leader`.
   - **Leader aura:** while the leader lives, escorts carry a `leader` modifier through the
     **existing `applyModifier` path** (the same one champions use), so the enemies.json `_doc`
     claim finally holds. It is never a new multiplier in `strike`.
   - **Rout:** on the leader's death, each escort rolls morale. ~50 % flee, using the town-line flee
     rule (~729-737) as a timed rout (6 s), then resume.
   - A fleeing unit keeps its drop and still counts for "clear the camp".
   - The leader plays `point` once on aggro (F1, once, never per frame).
4. **A standard-bearer and real helms** (E10, trimmed).
   - One standard-bearer per warband (a sixth member def, champion-capable, carries a banner prop).
   - Killing it ends the leader aura early.
   - Leaders and elites wear the round-26 helms: `war_helm`, `bone_headdress`, `wolf_helm` and
     `rune_helm` (already registered in `avatar-2d/js/parts/chibi2-parts.js`). The Thornmane Packlord
     gets one (it has none today).
   - Changes are data only, in `data/warbands.json` / `tools/build-warbands.py`.
5. **Jobs and rumours naming camp and warlord** (E8, rest).
   - Two frames: "Break the <camp>" (binds to an untaken camp in a held zone) and "Bring down
     <warlord>" (binds to a living warlord).
   - One rumour kind: "<warlord> was seen at <place>".
   - They bind only to what exists.
6. **Loot with their name on it** (E11, trimmed).
   - One unique per warband (5), injected by the `uniques.js` pattern (`installUniques`), using
     **existing** powers only (no new powers this round; round 23 found every unique's power ran
     twice).
   - The camp chest and the warlord roll from the warband's drop list, with the warband unique at a
     documented chance.

**Player sees:**
- Banners of the Ashtusk Horde over a palisade on the hill.
- A named Warchief who roars at half health and calls his brutes.
- Kill the standard-bearer and the Warchief's pack falters; kill the Warchief and they scatter.
- The camp's chest can drop the Horde's own axe.
- The valley loosens its grip after.

**Acceptance (measured)**
- **Camps.**
  - Over 6 seeds, every held zone with a free slot has exactly one camp of its warband, and no
    unheld zone has one.
  - Every garrison body's `defId` is in that warband's members (or is the warlord).
  - World-boss slot counts are unchanged against a snapshot.
- **Sealed chest.** The chest is sealed while ≥ 1 guard lives and opens after the last one.
- **Payout.** The payout happens once through M1's payer, and grip drops by exactly `campGrip` (set
  to an odd value).
- **Warlords.**
  - For levels 31-50, `bossFor` returns a warlord or another banded boss, never null.
  - In a scripted fight on the real `EnemyField`, every phase fires once, in order, and its `spawns`
    are that warband's members.
- **Leader aura.**
  - An escort's outgoing damage with the leader alive equals base × the aura factor, applied once.
    Set the factor to 1.37: the ratio is 1.37 ± 0.001, not 1.37².
  - After the standard-bearer dies, the ratio is 1.
- **Wake and rout.**
  - Hitting one escort wakes every unit sharing its leader within 1 frame.
  - Killing the leader puts ≥ 1 escort into flee within 2 s, and every fleeing escort resumes within
    8 s.
- **Looks.**
  - Every new def's look survives the shared normaliser (the round-26 test pattern).
  - Every leader and elite builds with its named helm.
  - No hat id is missing from `chibi2-parts.js`.
- **Jobs.** Over 500 jobs on 6 seeds, both new frames are offered ≥ 1 time, and every one binds to an
  existing untaken camp or a living warlord.
- **Uniques.**
  - The 5 uniques are present after install and absent from `items.json` on disk.
  - Each power resolves exactly once per hit (the round-23 double-run test, extended).
  - The camp chest can drop the warband unique (a forced roll).
- **Saves.** A taken camp and a slain warlord survive save/load: the camp stays taken, and the
  warlord doesn't respawn.

**Tests:**
- New `tests/round27-warcamps.test.js` (node).
- Extend `tests/round26-races.test.js` (data shape: 6 members + warlord per warband, helms) and
  `tests/round23-uniques.test.js` (the 5 new rows).
- A focused spec, `tests/round27-warcamps.spec.js`: teleport to a camp, see banners and bodies,
  kill the leader and watch the rout.
- **Must stay green:** `round26-races.*`, `prisoners.spec.js`, `worldbosses.test.js`,
  `round23-uniques.test.js`, `round22-threat.test.js`, `combat-feel.test.js`,
  `round14-combat.test.js`.

**Risks:**
- **Garrison purity vs level bands.** The fallback must be logged in a test, not silent.
- **Multiplier twice** in the aura and in unique powers. Both are guarded by the odd-value ratio
  tests.
- **Boss scale in tight spaces.** Keep warlords out of instances whose doors are too small.
- **`tools/build-warbands.py` regenerates `warbands.json`.** Edit the generator, not the JSON by hand,
  or the next regen erases the change.

**Files:**
- `js/warbands.js`, `tools/build-warbands.py`, `data/warbands.json` (generated)
- `data/strongholds.json` (5 rows), `js/sites.js` (camp dressing + garrison filter), `data/setpieces.json`
- `js/actors.js` (`leads` linking ~352-363, wake ~751-755, kill/rout ~1291-1316 and ~729-737, leader
  modifier)
- `js/jobgen.js`, `data/job-frames.json`, `js/rumours.js`, `js/uniques.js` (install call only),
  `data/uniques.json` / `tools/build-uniques.mjs` (append warband rows), `data/balance.json`
  (`warbands` keys)
- `js/main.js` (≤ 20 lines: grip drops on camp take / warlord death, next to M1's payer call)

---

## File ownership matrix

`●` = edits; `(r)` = region-restricted edit (see the milestone's Files line).

| File | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 |
|---|---|---|---|---|---|---|---|---|---|---|
| js/main.js | ● stronghold / boss sites | (r) muster | (r) arrival | (r) gate tick, E, nightSpawn | | | | (r) signpost E | (r) patrols, banner | (r) grip drops |
| js/planet.js | | | | | (r) roads, lakes | (r) crossings, clamp | (r) colorAt, normalAt | (r) roadAt | | |
| js/features.js | | (r) gates, settlementAt | (r) wall kinds, towers | (r) gate doors | | (r) bridge filing | | (r) road ribbon | | |
| js/actors.js | (r) bossFor, placeBoss | | | (r) spawn family | | | (r) movement | | (r) spawnNear share | (r) leads, wake, rout |
| js/sites.js | ● taken, payer | (r) townGap | (r) banner export | | | | | | | (r) camps |
| js/player.js | | | | | | (r) wade | (r) slope, road | | | |
| js/town.js | | ● | | ● guards | | | | | | |
| js/town-plan.js | | ● | ● | | | | | | | |
| js/encounters.js | (r) leader | | | | | | | | (r) poolFor | |
| js/jobgen.js + job-frames.json | ● | | | | | | | | ● | ● |
| js/warbands.js / data | | | | | | | | | ● | ● |
| js/hud.js | | | ● arrival | | | | | | (r) zone holder | |
| js/collide.js | | | | ● | | | | | | |
| js/props.js, js/terrain.js | | | | | | | ● | | | |
| js/bridge-plan.js, js/ground.js | | | | | | ● | (r) climbable | | | |
| js/roadplan.js, logistics, nightlights, light, roadside | | | | | | | | ● | | |
| proctown/js/* | | (r) buildWall | ● kit | | | | | | | (r) kit parts |
| data/balance.json | | | | gates | | | roads | | warbands | warbands |

---

## Parallel grouping

Four waves. Inside a wave, milestones touch disjoint files, or disjoint **named regions** of the same
file (planet.js, features.js, actors.js, main.js). Every agent re-reads a region right before editing
it, edits with exact-string `Edit` (never a whole-file rewrite, never a reformat), and commits only
its own files by name.

| Wave | Milestones | Why they don't collide |
|---|---|---|
| 1 | **M1**, **M2**, **M5** | M1 = strongholds, factions, boss (main.js stronghold functions, sites, actors `bossFor`). M2 = towns (town.js, features wall/gate, main.js muster). M5 = planet.js road pipeline + lakes only. |
| 2 | **M3**, **M6**, **M9** | M3 = features wall/tower + proctown kit + hud arrival. M6 = bridge-plan + planet `findCrossings` / clamp + features bridge filing + player wade. M9 = warbands / territory / patrols / map + actors `spawnNear` + hud zone line. The hud.js edits are different functions (a new arrival function vs `announceZone`); M3 adds a function and M9 edits one line inside `announceZone`. |
| 3 | **M4**, **M7**, **M10** | M4 = collide + features gate doors + town guards. M7 = player slope / road + actors movement + props + terrain + planet `colorAt`. M10 = sites camps + actors `leads` / wake / kill + warbands. The actors.js regions are disjoint (movement step vs spawn/wake/kill). The player.js wade branch from M6 is already committed. |
| 4 | **M8** | Needs M5 (classes, junctions) and M7 (road speed). Touches features road ribbon, planet `roadAt` and a new `roadside.js`. |

**Serial order if running one at a time:** M1 → M2 → M5 → M3 → M6 → M9 → M4 → M7 → M10 → M8.

**Coordination rules for parallel waves**
- **Playwright takes turns** (`flock /tmp/farhold-pw.lock …`). Node tests run freely.
- **main.js:**
  - Each milestone's edits stay inside its tagged region (`// R27 Mn`), next to the call site named
    in its Files line.
  - Don't move, rename or reformat anything else.
  - If two milestones need the same function, the later wave does it.
  - After a wave, one agent runs the boot spec plus `node --check` on main.js before the next wave
    starts.
- **RPG.md:** append-only under `## Round 27`, one `### M<n>` subsection each.
- **CLAUDE.md:** the Farhold row is updated once after M10, by the last agent.
- **At the end of each wave:** run the full node unit suite for Farhold (`node --test
  prototypes/farhold/tests/*.test.js`) once. Red tests are A/B-checked against the previous commit
  first (the "A/B test failures first" memory: most red is older than your change).
- **Publish:** after M10 and M8 are green, `tools/publish-stable.sh` moves 8400.

---

## What this plan deliberately does not do (parked — see the roast)

A6 triplanar rock shader, A7 waterfalls, A8 ground decals, C3 the single `townOrigin()` refactor (with
the `markers.js:490` / `main.js:2014` half-cell offset), C4 toll bridges, night-closing gates, D7
outskirts, warband sets / plantable banners / trophies, warband counter-raids, E14 warband-vs-warband
wars, F2 enemy weapon patterns, F5 warband codex, roadside waystations and shrines, wall walkers.
Write these into RPG.md's Round 27 "parked" list at the end, so they are brought up when this round is
done.
