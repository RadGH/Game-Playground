# Farhold round 27 — roast of the brainstorm

Input: `research/round27-brainstorm.md` (49 ideas, commit `5276f58`). Output: a verdict per idea and
the corrections to its diagnosis. The plan that implementers follow is `research/round27-plan.md`.

How this was checked: three read-only code passes (terrain/roads/bridges, towns/walls/gates, enemy
factions) that re-read every cited line, plus one node probe that builds real worlds with
`js/planet.js` and measures road grade (the script builds worlds the way `tests/round22-roads.test.js`
does). No game file was changed.

Verdicts: **KEEP** (build it, maybe trimmed), **MERGE** (folded into another idea's milestone),
**KILL** (not this round; reason given). The user asked for extensions, not new systems, so "is this a
new system wearing an extension's coat?" is asked of every idea.

---

## 0. The diagnosis: what the brainstorm got right, wrong, and understated

### Confirmed with numbers

- **Roads straight up mountains.** A probe over the real grading pipeline (surface heights along
  `terrain.roadPaths`) gives:

  | scale | seed | segments | > 20 % | > 30 % | max grade | road km | point spacing |
  |---|---|---|---|---|---|---|---|
  | 0.1 | 25392 | 780 | 62 | 36 | 117 % | 11.6 | 8.8 m |
  | 0.1 | 4477 | 4522 | 8 | 0 | 25 % | 68.7 | 9.8 m |
  | 0.1 | 7 | 3799 | 5 | 0 | 22 % | 56.3 | 9.8 m |
  | 1 | 25392 | 780 | 97 | 55 | 167 % | 115.5 | 87.6 m |
  | 1 | 4477 | 4512 | 22 | 3 | 53 % | 681.4 | 97.8 m |
  | 1 | 7 | 3792 | 19 | 2 | 36 % | 559.5 | 97.8 m |

  The brainstorm's 97/780 and 55 figures reproduce exactly. **But the problem is one world, not
  every world.** Seed 25392 (the user's own, 13 road paths only, very mountainous) carries almost
  all of it; the other seeds have 0-3 segments over 30 %. That matters for the fix (see A1): it has
  to be judged on 25392, and it must not rewrite gentle roads on normal worlds.
  Point spacing is `M_PER_CELL / 5` (≈ 88-128 m on a full-size world, ≈ 181 m on a diagonal
  step), so a "40 m stretch at 12 %" (the brainstorm's trigger) is *smaller than one road point*
  on a big world. Any switchback must work on the resampled lane, not on the raw points.
- **No switchback or grade limit anywhere.** The only limit is the 4-pass smoothing and ±3.5 m
  cut/fill (`planet.js:993-1162`). World Forge's A* squares slope (`worldgen/js/roads.js:27`), but
  it cannot fold a road inside a cell.
- **Player walks up anything.** `player.js:405,417` divides speed by `1 + steep·1.6·(1 − sure)`;
  `normalAt` has no runtime caller (only tests). Enemies (`actors.js:846-858`) have **no slope term
  at all**, which is worse than the brainstorm said: today an enemy chases up a face at full speed
  while you crawl up it at a fifth.
- **Far rings lose cliffs.** `terrain.js:142-143` measures steepness across two of the ring's own
  quads: 2, 6, 18, 54, 162 m (`balance.json:254`). Real.
- **Lakes use rounded metres** (`planet.js:663, 689` → `elevationToMetres` = `Math.round`), land
  uses the exact conversion. The round-21 fault in its last hiding place. Real.
- **Snow line and the 9 m sand band are absolute** (`planet.js:2152-2158`) while `reliefScale`
  shrinks relief with `M_PER_CELL / 640`. Real.
- **One road width and one colour** (`planet.js:755`, `features.js:441`). Readers of `half` are
  wider than the brainstorm listed: `planet.js` 1400 / 1573 / 1611 / 1665 / 1799 / 1868 / 2134,
  `features.js` 607 / 609, `roadplan.js:692` → gate width `features.js:1213`, `sites.js` 583 / 965.
- **Dead fields on crossings.** `klass`, `roadHalf` and `river` are written (`planet.js:1868-1869`)
  and read by nobody; `meshHalfLength` / `meshHalf` and `path.bridgeCells` have no readers;
  `README.md:226-231` still says bridges come from World Forge. The `ford` kind and
  `river.navigable` have no readers in Farhold, and `seaLanes` is only drawn on the map.
- **Player roads are not roads.** The copy in `data/structures.json` (~2651, ~2699) promises
  things no code does; player lanes live only in `createRoadBook`'s own index; `logistics.js:127`
  reads only the player book; `vehicles.js` `speedOn` gets its `road` surface from `terrain.roadAt`,
  so a vehicle on your own road gets nothing.
- **Piers have no collision** (only `fileDeck` / `fileRails`, `bridge-plan.js:234, 244`). Real.
- **Lakes get an earth plug** (`planet.js:1611-1614`). This is *documented as intended*
  ("a lake causeway", ~`:1588`), so C5 is a design change, not a bug fix.
- **Town size.** `safeZones` (`town.js:707-708`) ignores `plan.wallRadius`. The planner grows the
  ring ×1.3 / ×1.65 (`proctown/js/townplan.js:524, 548`); a size-5 wall reaches ≈ 157 m while the
  safe circle stops at 113 m. **There are six answers, not five**: add `waypoints.js:52-56`
  `boundaryOf`. `sites.js:454` (`190 + 120·size`) is a keep-clear gap and is *legitimately* larger:
  it should be floored by the real wall, not replaced.
- **The muster's `walled` is always false** (nothing ever sets `settlement.walled`), `guards` counts
  your colony's guards, `plots` is the size. And `tests/civilization.test.js:682` hard-codes
  `walled: true`, which is why no test noticed.
- **Planner gates thrown away.** Farhold reads no `plan.wall`; gates come only from
  `ringCrossings` (`features.js:1146`), and a walled town with no road gets
  `angle: rng() * TAU` (`:1148`). Extra find: proctown's `buildWall` returns `kind: radius` (a
  number), which looks like a typo.
- **Culture walls in data only.** `CULTURES[*].wall` has no reader anywhere; `townWall.kind` is read
  only by proctown's kit viewer; Farhold reads only `townWall.colour`.
- **`size >= 4` for walls is hard-coded in six places**, not five (`town-plan.js:87`,
  `proctown/townplan.js:164`, `features.js:1122`, `town.js:708`, `waypoints.js:55`,
  `townhall.js:179`).
- **The collider field has no delete and no toggle** (`collide.js:52` `clear()` wipes everything;
  `addSegment` returns `this`, not a handle). Anything that opens or shuts needs a small, real
  addition to `collide.js`.
- **`nightSpawn` is dead data.** `restless_dead` carries `nightSpawn: 'undead'`, `incidents.js`
  merges it, `tests/expansion.test.js:368` checks the merge, and `main.js:7625-7647` reads only
  `spawnMult` and `shopMult`. The brainstorm cites it as a hook for D7; it is a bug in its own right.
- **Warband UI is one log line** (`main.js:7425`); `held()`'s only caller is
  `tests/round26-races.spec.js:138`.
- **`opensDungeon` is three log lines** (`main.js:2511, 4820, 5772`).
- **`bossFor` returns null above level 30**; callers fall back to `bosses[0]`
  (`main.js:4701, 5087`) or `enemies[0]` (`main.js:5802`). With the default cap 50, every
  lair above 30 holds the level 4-12 Warden. Real and bad.
- **`beast_moved_in` can never be offered** (`jobgen.js:550-557` ranks from `e.boss` /
  `e.champion`, which no def carries; `:94` requires an exact rank match).
- **`raidersFor` leaks warbands** (`raid.js:111-119` gets the whole bestiary; members have
  `biomes: ['any']`).
- **Encounters ignore `spawnShare`** and pick the leader from the already-narrowed pool
  (`encounters.js:336-337`).
- **Patrols**: created, ticked and listed, but `killed()`, `reaction()`, `near()` and `loseOne()`
  have no game caller. Patrols have no bodies.
- **Instance bosses** read only `holds.boss.id` / `.family` (`main.js:5080-5088`); `placeBoss`
  forces `boss: true` with no modifiers.

### Where the brainstorm is wrong

1. **"GPU grass ignores slope" (A4) is false.** The vertex shader already fades by the ring's own
   triangle slope: `fhGrow *= 1.0 - smoothstep(0.55, 0.95, fhSlope)` (`grass-gpu.js:211-212`).
   Only the CPU mask ignores slope, and the shader covers it. The grass half of A4 is dead.
2. **"Tighten the existing crossroads counter to 0" (B3) misreads the test.**
   `round22-roads.test.js:161-168` counts every road point within `half + half + 8` m of *any*
   other road point, which includes every ordinary merge junction, and asserts `< 1200`. It is an
   exclusion list, not a crossroads count, and can never reach 0. B3 needs its own measure: segment
   intersections between different paths that are not filed junctions.
3. **"Mount speed is computed in main.js `ground()`, the one owner" (B4) is false.** There is no
   `ground()`. Mount speed is `player.js:385` (`sheet().mountSpeed || b.mountSpeed ?? 2.1`, ×1.35
   gallop at `:396`); vehicles replace the speed at `main.js:8645-8649`. The road factor goes in
   `player.js`, which is simpler than the brainstorm thought.
4. **"A boulder must be solid through the same `collide.add` path as rocks" (A2) is wrong.** Props
   use their own `ObstacleField` via `solids.add` (`props.js:767, 900`, `PROP_SOLIDS` in
   `collide.js:371`). Scree boulders must use `solids.add`, the path rocks actually use.
5. **"Four kills near a territory record" (§0, E13) is wrong.** `need = 3 + size`,
   `reach = 60 + 25·size`, and every hostile site kind is size 2 or 3: **5 or 6 kills within
   110-135 m**.
6. **"A castle probably pays twice" understates it.** It is worse, in three ways:
   - **Path B (`freePrisonersOf`, `main.js:4784-4830`) pays the full `gives` every time you come
     back.** Its only guard is emptying `heldFolk`. `sites.relax()` (`sites.js:1383`) sets
     `populated = false` at 420 m, `due()` hands the site back, and `populateSite` refills
     `heldFolk` and respawns the boss (`main.js:4757-4767`). Walk away, walk back, kill the boss,
     get the legendary chest, xp and perk point again. `sites.clear()` exists (`sites.js:1427`) and
     `main.js` never calls it.
   - **Path A (`creditKill`) pays the `gives` of whatever `sites.nearest(x, z, 40)` returns, with
     no kind filter**, so a *landmark's* `gives` (xp, loot, perk point) can be paid by clearing a
     territory camp that happens to sit within 40 m of it. It re-arms when the territory
     `respawnHours` resets `cleared`.
   - `gives.clears: true` in `strongholds.json` is read by nobody.

   This is the top-priority bug of the round: a repeatable perk-point fountain.
7. **"Leaders wear the old hats"** is right, but incomplete: the Thornmane Packlord wears no hat at
   all. The round-26 helms (`war_helm`, `bone_headdress`, `wolf_helm`, `rune_helm`) *do* exist and are
   registered in `avatar-2d/js/parts/chibi2-parts.js`, so using them is a data change only.
8. **Settlement position is computed in ~14 places, not 3** (`features.js:431`, `planet.js:901,
   2262`, `quests.js:199, 224`, `map.js:1250, 1647`, `town.js:499`, `territory.js:94, 212`,
   `jobgen.js:566, 573`, plus `markers.js:490` and `main.js:2014`, which use `(x + 0.5)·M`, half a
   cell off from all the others). That is why C3 is killed (below): it is a 14-site refactor with a
   save migration, for 1-4 bridge ends per world.
9. **"Gate guards depend on load order"** is real, but only on the first frame or after a
   teleport: features build to 2600 m and folk populate at 900 m, so in normal travel the walls
   already exist. The fix is cheap (retry when records arrive), but don't oversell it.

---

## A. Terrain detail

### A1. Switchbacks — **KEEP (reshaped)**
- **Real:** yes, but concentrated on one seed (see the table). The user plays that seed, so it is
  the one to fix.
- **Reshape:**
  1. **Measure first.** Classify every segment over 20 % as natural slope, or as an artefact of lift
     ramps, junction fades or the floor restore. The 167 % segment at scale 1 cannot come from
     natural 88 m spacing without a lift or junction step: a 147 m rise over one point. Some of the
     steepness may be the round-22 class of bug, not missing switchbacks. Fix artefacts as
     artefacts.
  2. **Fold only on the resampled polyline, only where the corridor allows.** Test for water,
     `townGap` and the cliff mask. Cap it at N legs per climb, and mark what cannot be folded as
     `steep` instead of forcing it.
  3. **Must run before `connectRoadNetwork`.** Otherwise junctions are re-broken (the round-22
     3.49 m bug).
- **Risk the brainstorm missed:** folding lengthens a road, and the lift / ramp pass is per *point*
  (`rampPerPoint` 0.5 m per point). Adding points changes the ramp grade. Scale `rampPerPoint` by
  spacing in the same change (brainstorm §0 already flags it).
- **Test:** grade statistics per seed and scale, not "< 1 % of windows". Seed 25392 must drop hard,
  and seeds 7 / 4477 must be **byte-identical where no fold fired** (the subset rule: gentle roads
  don't move).

### A2. Scree and boulders at the foot of cliffs — **KEEP**
- **Real:** yes. `props.js:873` skips slope > 0.75, so cliffs are bare.
- **Visible:** the cheapest way to make round 21's cliffs read as rock.
- **Correction:** solids go through `solids.add`, not `collide.add`.
- **Rng rule:** the cell rng is shared by props → ruins → grass (`props.js:840`), so scree needs its
  own stream (megaflora's `seed ^ 0x4d67` pattern).
- **Budget:** the existing `rock` (900) and `boulder` (400) caps and meshes can hold it, so there are
  **zero new draw calls**. Reuse those meshes; do not import highdef's `scree_slope` as a new mesh.
  `phase2.spec.js` asserts props draw calls < 25 and scene < 95.

### A3. Cliffs you can't walk up — **KEEP (trimmed)**
- **Real:** yes, and enemies have no slope rule at all.
- **Threshold:** don't use 50°. Use the round-21 cliff band (63°+, the 2.5 % of land that is a real
  face), so hills stay walkable.
- **Escape rule:** after 3 s pinned, allow the climb.
- **Enemies:** give them the same rule through one shared helper, not a copy.
- **Terraform:** read `heightAt` (edited), and `normalAt` is overridden in `terraform.js:351`. Use
  that one.
- **Hard requirement:** every drawn road point must be under the threshold, so a road is always a
  way up. That ties A3 to A1 and gives a measurable acceptance.

### A4. Slope-aware grass + distance-stable rock band — **MERGE into the cliffs milestone (rock band only)**
- **Grass half:** KILLED. It already exists in the shader (above).
- **Rock band half:** keep. In `terrain.js:143`, take `max(ringSlope, planet.slopeAt(x, z, 4))`, as
  the brainstorm says. This costs one extra `slopeAt` per ring vertex at rebuild time. Rings are
  96² vertices, so about 9k extra samples per rebuild, which is fine.

### A5. Height-true snow and sand, one elevation conversion — **KEEP, split**
- **Lake conversion:** goes with the roads/planet pipeline milestone. It is `planet.js` water code,
  and the round-21 bug.
- **Snow/sand scaling:** goes with `colorAt` in the cliffs milestone.
- **Tests:** `water.test.js` and the round-17 tests may pin old lake heights. Fix them to assert the
  rule ("the lake surface equals the exact conversion at the rim"), per the "tests that pin wording"
  memory.

### A6. Triplanar rock / strata shader — **KILL**
- **Cost:** a new shader path on `MeshLambertMaterial` for 5 rings, gated by a quality tier.
  Playwright runs the software renderer, and round 26's NaN "black square" came from exactly this
  kind of material change.
- **Payoff:** A2 (scree) and A4 (rock band that holds at distance) deliver most of "a cliff looks
  like rock" with zero shader risk. If the user still wants texture after seeing A2 + A4, it is a
  graphics-round item behind Settings → Graphics effects, like round 23.

### A7. Waterfalls — **KILL**
- **Risk:** the swimmable river surface (`riverTopAt` → `surfaceOfHit`) is the round-18 staircase
  bug's home. A falling sheet is a new drawn-vs-measured pair on the most fragile surface in the
  game, plus spray, sound and plunge-pool bridges. That is a new feature with its own design pass,
  not a refinement.
- **Value:** it is not what was asked for (terrain, roads, bridges, gates, factions).
- **Park it.**

### A8. Ground decals — **KILL**
- **Cost:** new instanced kinds (draw calls against a 95 budget), z-fighting, and a weather hook
  (puddles after rain) that is a second system.
- **Visibility:** the player barely notices it next to scree and road dressing.
- **Park it.**

---

## B. Roads

### B1. Three road classes you can tell apart — **KEEP**
- **Real:** yes, one width and one colour.
- **Structure:**
  - **Width** has one owner: a `ROAD_CLASS` table in `planet.js` that every `half` reader already
    reaches through `path.half`, so the sweep is small.
  - **Look** (colour / kerb / verge tint) goes with the road-dressing milestone.
- **Kerb:** baked into `laneRibbon`'s vertex colours or extra edge vertices, never a separate mesh.
- **Watch:** the round-21 waystone offset (`half + footing + 1`) and `padOk` must be re-measured with
  highway 9 m.

### B2. Signposts and milestones — **KEEP**
- **Value:** the most visible road idea, and it uses round 22's carried `from` / `to`.
- **Route correctness:** name the place by walking the graph, not the nearest town.
- **Reveal rule:** apply the round-10 rule ("?" for unrevealed).
- **Placement:** off the carriageway, the way waystones are placed.
- **Draw calls:** instanced through the features.js building pools, with a cap.

### B3. A real crossroads — **KEEP (with the correct test)**
- **Real:** 1.26-2.29 m deck interpenetration.
- **Test:** needs its own segment-intersection measure (see §0 correction 2).
- **Where it runs:** with the planet road pipeline, after A1's folds.

### B4. Roads are faster for feet and hooves — **KEEP**
- **Size:** S.
- **Where:** in `player.js` only (see correction 3), on the legs/hooves branch only. Vehicles already
  get `spec.road` (`vehicles.js:289`), so don't stack a second factor on them.
- **Test:** move the factor to an odd value and check the module reads it.

### B5. Player roads join the network — **KEEP (trimmed)**
- **Why:** the structures copy is a broken promise, and a Holding road that the horse and the truck
  ignore is exactly the "promise the world can't keep" fault.
- **Trim:**
  - Do **not** make player lanes into `roadPaths`. That would re-run grading, crossings and junction
    fades on live edits.
  - Instead, give `terrain.roadAt` a second, player-lane index consulted with `max()`. `roadplan.js`
    already has `fractionOnRoad` / an index to reuse.
  - Rebuild the index on load before props scatter.
- **Grass:** GPU grass reads `road` through `grassAt`, so it follows automatically once `roadAt`
  does. Check that the bake refreshes after an edit.
- **Logistics:** `logistics.js` should count `max(player, world)` per point, not the sum. That avoids
  the multiplier-twice fault.
- **Copy:** rewrite the structures.json copy to say exactly what it does. That is Farhold-only data,
  so it is safe to edit.

### B6. Roadside life — **MERGE (lamps only) into road dressing; waystations and shrines KILLED**
- **Lamps near towns:** real value at dusk, and `nightlights.js` exists. The 12-light pool rule
  holds: lamps sort below spells, torches and the player.
- **Waystations:** a new placement system that competes with `sites.js` slots, for little value.
- **Shrines:** `sites.js` road slots already exist.

### B7. Fords — **MERGE into the bridges milestone**
- **Why:** worldgen already labels `ford`, so honouring it is a pure extension, and it gives the
  bridge milestone a second style for free.
- **Wade rule:** the one real risk is the drawn-vs-measured wade depth. The stones are
  `heightAt`-true, and depth over them must be under the swim threshold. The test walks the real
  `player.js`.

---

## C. Bridges

### C1. Bridge styles — **KEEP (trimmed to 3 styles)**
- **Styles:**
  - stone arch (highways, span ≤ 40 m)
  - timber trestle (long spans)
  - plank (the current one, everything else)
- **Culture-specific and rope bridges:** killed. "Trails over narrow gorges" requires gorge detection
  that doesn't exist, and a culture variant multiplies the look matrix for no gameplay.
- **Deck rule:** every style builds its deck from `planBridge`'s one height list. Only the underside
  varies.
- **Reads:** `crossing.klass`, `roadHalf` and the span, which kills three dead fields by giving them a
  reader.

### C2. Solid piers sized to the span — **KEEP**
- **Real:** yes, no collider.
- **Collider:** a banded segment (riverbed → deck underside).
- **Footing:** sample the pier at its footprint corners.
- **Cost:** small, and swimmers and boats notice it.

### C3. Wire the settlement anchor — **KILL (this round)**
- **Cost:** ~14 position computations across 10 files, a save migration for markers and waypoints,
  and 1-4 bridge ends per world as the payoff.
- **Worth doing:** the "one `townOrigin(node)`" refactor is, but only as its own refactor round with
  the grep test, and not mixed into a feature round where parallel agents are editing half of those
  files.
- **Record it as parked.** The `markers.js:490` / `main.js:2014` half-cell offset is noted there
  too.

### C4. Toll bridges — **KILL (this round)**
- **Why not:** `toll_gate` sites exist and `freeTolls` is already read (`main.js:5545`, for a
  waypoint toll), so tolls are not dead. A toll *bridge* is a new interaction (pay / talk / fight at
  a structure), which needs guard bodies with a new behaviour. That overlaps the gate-state milestone
  and doubles its risk.
- **Park it**, to follow the gate milestone.

### C5. Bridges over lake narrows — **MERGE into the bridges milestone (trimmed)**
- **Real:** the earth plug is documented as intended, but a road over a lake reads as a dam.
- **Scope:**
  - Only lake spans (not sea) longer than about 25 m become a low trestle crossing record.
  - Shorter ones keep the causeway, now with culvert dressing: the causeway was intended.
- **Test:** the round-17 "a lake is a hole" rule, extended.

### C6. Delete the dead bridge work — **MERGE**
- `meshHalfLength` / `meshHalf` / `bridgeCells` are deleted (and README.md:226-231 fixed) in the
  roads milestone.
- `klass` / `roadHalf` get readers in the bridges milestone.
- **The orphan test:** "every field on a crossing record has a reader outside planet.js" is exactly
  the dead-data rule, so keep it.

---

## D. Gates, walls and town edges

### D1. One town size — **KEEP (top-tier bug)**
- **Real:** enemies can spawn and wander 35-44 m inside a grown wall, and there are six formulas.
- **Fix:**
  - A single `townExtent(node, plan?)` in `town-plan.js`, reading the real `plan.wallRadius` when
    planned.
  - The footprint is the floor when not planned, because `sites.js` keep-clear runs earlier.
  - `sites.js`'s 190 + 120·size stays as a keep-clear gap, floored at extent + margin.
- **Includes:**
  - the muster's `walled` / `guards` / `plots`
  - `civilization.test.js`'s hard-coded `walled: true`
  - the six `size >= 4` sites collapsed to one tier function

### D2. Culture walls — **KEEP**
- **Real:** yes, the data is there and read by nobody.
- **Scope:** keep to wall/tower/gatehouse *mesh variants*. The collider is the round-23 straight
  segment and never varies.
- **Caps:** watch the instance caps (wall 1400, gatehouse 80). Five wall kinds means five meshes, so
  +4 draw calls near a town, against the 95 budget. Measure it.

### D3. Village fences, hamlet boundary stones — **KEEP (decoration only)**
- **Collider:** none. A low fence you can't step over, on a size-2 hamlet, is a softlock generator,
  so say plainly that it is decoration.
- **Placement:** gaps where streets reach it, which needs D4's street-end logic.

### D4. Planner gates, at least two — **KEEP**
- **Real:** yes, streets dead-end on masonry, and the no-road gate is random.
- **Merge rule:** merge by bearing on the final `wallR`.
- **Proctown typo:** fix `kind: radius` in the same change, since proctown is ours. Proctown's own
  tests (`proctown/tests/townplan.test.js:69, 133`) cover its gate count, and they must stay green.

### D5. Gates close at night — **KEEP (trimmed: no night closing)**
- **Night closing:** killed. Night on some worlds is minutes long. A quest target or respawn point
  behind a shut gate is a softlock, and "wait until dawn" is friction the user never asked for.
- **Keep the two cases that make a promise true:**
  - While a siege camp stands within its radius of a town, that town's gates are shut. This fixes the
    `strongholds.json:410` blurb.
  - While you are **Hunted** by the zone's holder, the gate is barred to you.
- **Always a way in:**
  - E at a shut gate talks to the guard: pay, or open with standing.
  - Never shut the gate of the town holding your respawn point.
- **Needs:** a toggleable segment in `collide.js`, which is small and real.
- **State:** derived, not saved.

### D6. Guards who notice you — **MERGE into D5 (trimmed)**
- **Keep:**
  - a greeting / challenge line by standing band
  - Hunted means the gate guards bar the gate and attack *outside* it only
  - watchposts get a guard body, giving `BUILDING_INFO.role` a reader
- **Kill wall walkers:** they need a walkable wall top, which is a collision change for decoration.

### D7. Outskirts: fields, orchard, graveyard, gallows — **KILL (keep one sliver)**
- **Why not:** it is a new land-use planner around every town, with keep-clear, props-clearing and
  budget interactions. That is a new system.
- **The sliver kept:** `nightSpawn` is dead data (§0). Wire it in the gate/town-edge milestone. While
  `restless_dead` is active, night spawns near that town draw undead. It is one read in the spawner
  and needs no graveyard.

### D8. Town banners and an arrival card — **KEEP**
- **Size:** S.
- **Value:** very visible. It reuses `hud.announceZone` and the `sites.js` `banner` model.
- **Radius:** fire it on D1's single radius.

---

## E. Enemy factions

### E1. A warband is a territory holder — **KEEP (trimmed)**
- **The one rule:** in a warband-held zone, the warband takes the zone's hostile slot, so no human
  hostile faction also claims it. The territory record says so, and nothing else reconciles.
- **Killed:** adding five warband rows to the 12-faction standings table (12 → 17, "Fear"
  standing). A warband is not a faction you trade with. That is a new standing mechanic and it
  reshapes a finished screen.
- **Rivals:** keep "deeds against a warband please its rivals". The rivals move by the documented
  third through the existing `deed` path.

### E2. A war camp per held zone — **KEEP**
- **The heart of the user's ask.**
- **Garrison:** it must be pure (`d.warband === held.id`), with a fallback.
- **Slots:** don't starve world-boss slots.
- **Order:** it builds on M1's single payer, so it goes after it.

### E3. Warband warlords with phases — **KEEP**
- **What it is:** five injected boss rows, which also fill the empty boss band above 30.
- **Order:** the `bossFor` fallback fix is in the stronghold milestone, so the fallback is fixed even
  before warlords exist.
- **Scale vs dungeon doors:** check a 2.5x warlord against the dungeon door sizes, only if a warlord
  can be an instance boss. That is **F4 in miniature**, and the only part of F4 kept.

### E4. Leaders that lead — **KEEP (trimmed)**
- **Keep:**
  - the escort wakes with its leader (fix the same-`defId`-only wake)
  - the leader aura through the modifier path, which makes the `_doc` claim true
  - a rout on the leader's death, reusing the town-line flee
- **Kill:** "some go berserk", which is a second outcome table for no visible gain.

### E5. Encounters use the warband properly — **KEEP**
- **Size:** S.
- **What:** the leader comes from the full pool, and `spawnShare` goes through one helper.

### E6. Patrols with bodies — **KEEP**
- **Why:** the purest "module with no way in" on the list.
- **Wire:** all of `near` / `killed` / `reaction`.
- **Despawn:** use the `keepRadius` leash.

### E7. Saved warband grip — **KEEP**
- **Why:** without it, nothing the player does to a warband persists.
- **Where:**
  - The grip rides in the territory snapshot as a delta.
  - Old saves default to full grip.
  - `spawnShare × grip` is applied in one helper used by `spawnNear` *and* encounters (E5).

### E8. Jobs, rumours, incidents naming the warband — **KEEP (trimmed)**
- **Keep:**
  - 3 job frames (camp / warlord / patrols) that bind only to what exists
  - 2 rumour kinds
- **Killed:** the `warband_push` incident. Grip creep over time (E7) already moves the border, and
  an incident that grows grip is a second writer to the same number.

### E9. Fix `beast_moved_in` — **KEEP**
- **Size:** S.
- **The deliverable:** the frame-coverage test.

### E10. Elite members — **KEEP (trimmed)**
- **Scope:**
  - one standard-bearer per warband (killing it ends the leader aura early)
  - the four round-26 helms on leaders and elites, plus a hat for the Packlord
- **Changes:** data in `warbands.json` / `build-warbands.py` (Farhold-owned), injected at load.
- **Normaliser:** the helms are already registered, so there is no normaliser risk.

### E11. War-chests and trophies — **KEEP (trimmed)**
- **Keep:**
  - 1 unique per warband (5), reusing **existing** powers only, injected by the `uniques.js`
    pattern
  - the camp chest rolls from the warband's drop list
- **Killed:**
  - the 3-piece sets: a new set per warband is 15 items plus set bonuses and a balance pass
  - the plantable banner that lowers grip: a new build piece and a second writer to grip
  - trophies: a new decor build piece
- **Why:** round 23 found every unique's power ran twice, so no new powers this round.

### E12. Counter-raids — **MERGE (the leak fix only)**
- **Keep:** the `raidersFor` leak fix, where members raid only where their warband holds.
- **Killed:** the grip-push counter-raid loop. It is a new trigger, round 14 already reported "raids
  too often", and it needs offline-safety design.
- **Park it.**

### E13. Strongholds keep their promises — **KEEP (top priority, larger than written)**
- **Scope:** see §0 correction 6.
  - one payer
  - a saved `taken` flag on the `sites.js` site, so `populateSite` never refills a taken site
  - landmark `gives` never paid through `creditKill`
  - `gives.clears` read or deleted
  - `opensDungeon` places a real instance mouth
  - instance bosses read `rank` / `modifiers`
- **Order:** first, because E2 builds camps on it.

### E14. Warbands fight each other — **KILL**
- **Why:** the brainstorm's own [NEW] tag. It is enemy-vs-enemy targeting (new AI), off-screen
  simulation, and it doubles bodies near the player. Nothing else depends on it.

### E15. Map layer and zone card — **KEEP**
- **Size:** S.
- **Value:** very visible, and it gives `held()` its first game caller.
- **Reveal rule:** apply the round-10 rule.

---

## F. Cross-cutting

### F1. Emotes in the world — **MERGE (two uses only)**
- **Keep:**
  - gate guards salute or challenge (gate milestone)
  - a warband leader `point`s on aggro (leaders milestone)
- **Why so few:** the rest is ambient polish outside the ask.
- **Play-once rule:** round 25 found clips restarting every frame, so each emote plays once.

### F2. Enemy humanoids use weapon patterns — **KILL**
- **Why:** it is visual only, outside the ask, and it carries a multiplier-twice risk against the
  enemy's own `dmg`.
- **Park it.**

### F3. Crossroads and bridges as event slots — **KILL**
- **Why:** `strongholds.json` `on` already has `junction` / `crossing` slot kinds. Once B3 files real
  junctions, those slots see them with no new code, so the only remaining work is data.
- **Note for the roads milestone:** confirm the junction slot now finds B3's junctions. That is one
  assertion, not a feature.

### F4. Body size is real for enemies — **KILL (except the warlord doorway check in E3)**
- **Why:** radius/reach scaling touches combat reach tables that round 14 tuned. Warband `mods`
  already carry reach, so scaling again is the multiplier-twice risk the brainstorm itself flags.

### F5. Codex page per warband — **KILL**
- **Why:** it is a new journal pane. E15's zone card and map layer carry the same information where
  the player looks.

---

## Tally

| Verdict | Ideas |
|---|---|
| KEEP | A1, A2, A3, A5, B1, B2, B3, B4, B5, C1, C2, D1, D2, D3, D4, D5, D8, E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E13, E15 (30, most trimmed) |
| MERGE | A4 (rock band only), B6 (lamps only), B7, C5, C6, D6, E12 (leak fix only), F1 (two uses) (8) |
| KILL | A6, A7, A8, C3, C4, D7 (except `nightSpawn`), E14, F2, F3, F4, F5 (11) |

## Parked (write these into RPG.md's round-27 notes so they are not forgotten)

A6 triplanar rock, A7 waterfalls, A8 ground decals, C3 one `townOrigin()` refactor (and the
`markers.js:490` / `main.js:2014` half-cell offset), C4 toll bridges, D5 night-closing gates, D7
outskirts, E11 warband sets / banners / trophies, E12 counter-raids, E14 warband wars, F2 enemy weapon
patterns, F5 warband codex, the waystation/shrine half of B6, wall walkers from D6.
