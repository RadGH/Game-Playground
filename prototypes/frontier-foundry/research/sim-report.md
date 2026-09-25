# Frontier Foundry — balance pass 4 (2026-09-14)

*Written from `tools/sim-foundry.mjs --json` runs and `tools/sim-matrix.mjs`: six in-game hours,
288 × 288 map (3 × 3 chunks), seed 7, played headless by the bot in `js/ai.js`. Round 1's report was
the `--why` dumps in the commit that built the engine; round 2 was the first proper funnel; §0b is
round 3, which got the research tree unstuck; §0 is round 4, the reservation ledger and everything it
uncovered, which is the pass that got a rocket off all three worlds on normal.*

Run it again with:

```
node prototypes/frontier-foundry/tools/sim-matrix.mjs --hours 6 --jobs 9 > /tmp/matrix.md
```

Then paste the table into §2. Do **not** point `--out` at this file: the tool writes only the table,
so it would replace everything written around it. Nine six-hour games take about fifteen minutes.

---

## 0. Round 4: saving up, and everything saving up uncovered

Round 3 ended with `tests/sim.test.js` failing both milestone tests: arid lost the pod at 341
minutes after 40 waves, and no world launched. The diagnosis in §4 was that the bot could not reserve
output for a build it had decided on. That was true, and the ledger below fixes it — but the ledger
on its own did not launch anything. Every time a booking finally held, it exposed the next reason the
materials were not arriving, and most of those were places where the bot quietly gave up.

**Seed 7, normal, six hours, 288 × 288:**

| world | committed code (round 3) | as the stopped ledger work was left | after this pass |
|---|---|---|---|
| temperate | survived 42/42 · 69 nodes · 1424 built · no launch | survived 42/42 · 54 nodes · 1186 built · no launch | survived 42/42 · 74 nodes · 1511 built · **launch 05:05** |
| arid | **pod lost 05:41** after 40 waves · 69 nodes · 1366 built | survived 44/44 · 69 nodes · 1119 built · no launch | survived (43 of 44 cleared, the last still on the map at 06:00) · 74 nodes · 1433 built · **launch 04:26** |
| volcanic | **pod lost 02:44** after 17 waves · 29 nodes · 609 built | survived 42/43 · 69 nodes · 1033 built · no launch | survived 43/43 · 74 nodes · 1230 built · **launch 05:37** |
| wall clock per run | 868 s / 1050 s / 124 s | 112 s / 287 s / 240 s | 183 s / 188 s / 143 s |

Wall clock is one process per world, three at a time on a 12-core VM, often alongside other runs, so
read it as rough. The funnel budgets in the milestone test were not changed and all are met with room:
first drill 31 s (budget 300), first iron bar by 61 s (900), second research node by 1081 s (1800),
first wave held by 991 s (10 800).

> **Say it plainly: the margin is thin.** Volcanic launches 23 minutes inside the budget. Across the
> thirteen rounds of three-world runs in this pass the launch flipped on and off with small bot
> changes — temperate launched in seven of them and not in six — because one seed is one trajectory,
> and a changed build order an hour in moves everything after it. The six-hour bar was not moved;
> §0 records what it took to meet it, not a claim that it is comfortable.

Two more seeds on the final code, normal, six hours, to show how far "green on seed 7" generalises:

| seed | temperate | arid | volcanic |
|---|---|---|---|
| 8 | survived · 74 nodes · launch 03:34 | survived · 75 nodes · launch 03:08 | survived · 74 nodes · launch 02:38 |
| 11 | survived · **29 nodes · no launch** (never made a chemical pack) | survived · 75 nodes · launch 04:01 | survived · 75 nodes · launch 02:55 |

Six of six keep the pod, five of six launch. Seed 11 temperate is a live failure of the same family as
round 3's volcanic — the chemistry line never starts — and has not been looked into.

### The ledger (`Ledger` in `js/ai.js`, rule in `DESIGN.md` §11)

Kept from the stopped work: bookings per owner, free stock through `have()`, priorities, a stall
timer, a time-to-live, a cool-off, `maxReservations`, the `saveFor` rocket steps and the build-queue
cap. Added or changed in this pass, each for a reason the sim showed:

- **The cool-off is per material as well as per owner.** On temperate a crusher, a glassworks and a
  rubble sorter took turns booking the same six gear for two hours; with six gear always spoken for,
  no drill (six gear) and no generator (nine) was ever affordable, the coal ran out under six
  generators, and the gear assemblers ran at 8 % power.
- **The grid books** (priority 65). On arid at one hour the base had made 1800 gear and held none —
  44 assemblers had taken them as they rolled — so 767 kW ran a 3200 kW factory for two hours.
- **Putting a drill on a patch spends at 62**, above the chain planner, so a planner booking cannot
  hold the materials for the drill that would feed it.
- **Defence books the next gun, and breaks bookings only in a real emergency** — the opening six guns
  are missing, the pod was hit in the last 90 seconds, or a wave is close with half the line missing.
  "Pod below 98 %" was the first version, and nothing repairs the pod early, so it was an emergency for
  the rest of the run.
- **A rocket-priority booking holds its materials against recipes too.** The launch pad booked seven
  tungsten bar and sat at 0 % while the superalloy furnaces ate every bar as it was made.
- **A blocked build's missing materials are demand.** Tungsten bar, control units and machine frames
  are only ever a building cost, so nothing in `DEMANDS` asked for them; temperate never built a
  tungsten smelter, so never an alloy foundry, so never alloy plate.

### Places the bot gave up without saying so

- **Pole lines, stray-store rescues and turrets went through the build-queue cap.** The queue is full
  for most of a mid-game run, so each was silently dropped. Arid at 03:20 had seventeen finished
  machines on no grid, the only tungsten drill among them, fourteen tiles from a pole; the turret count
  sat at 28 against 34 wanted with 1400 plate banked, until a double push walked through. All three
  now go past the cap.
- **"The first N" lists.** `upkeep` retried the first three strays and the first four unpowered
  buildings in building order, every pass; three unreachable ones were retried for ever and the lithium
  drill behind them never was. Both lists rotate now, extractors first, and a storeless extractor gets a
  store of its own (`ensureStore(..., { rescue })`) so a truck can be sent.
- **The planner counted machines that cannot run.** A drill on no grid read as capacity, so arid's dead
  tungsten drill was "1.7× what the plan wants" and no second one was built (`cannotRun()`).
- **Stockpile limits counted ore nobody could reach.** Temperate's two platinum drills, hoppers full at
  200 each, read as "400 platinum, stockpile full" and switched themselves off. Limits now count the
  main pool.
- **The route cap was a dead end.** At ten routes `outposts()` returned, and temperate's ten were all
  iron ore, coal and stone the base held full stockpiles of while eleven advanced-circuit printers stood
  "short of gold". At the cap it now retires a route whose resource is fully stocked, for one a machine
  is starving for.
- **The placement search stopped at 90 tiles** while the bot may build out to 121 on this map. Arid's
  launch pad was researched, affordable and had 356 legal spots between 96 and 121 tiles out, and
  `spot()` returned null for two and a half hours.
- **The generator cap bound on a fuelled grid.** Arid at 02:45: 62 generators against a cap of 61,
  every one burning, 28 000 coal in store, 19.4 MW drawn on 8.3 MW. The cap now only binds while the
  grid is actually fuel-limited.
- **Gear had no floor.** Science packs ate all 3100 gear temperate made in its first hour. While gear
  is under `bot.gearFloor`, machines that eat gear without making it stand down — the twin of the plate
  rule that was already there.
- **The opening line was four guns at wave one.** Two nests of ash stalkers is 280 damage a second into
  the pod against 15 per watchtower; volcanic lost the pod at minute 24. Six from wave one, and
  watchtowers are swapped for gun turrets once more than half the line is weak.

### New knobs (`data/balance.json -> bot`)

`maxReservations` 1, `reserveStallFor` 300, `reserveCoolFor` 600, `reserveTtl` 1800, `reserveAfter`
120, `reservePaidFor` 180, `reservePowerAfter` 60, `emergencyWindow` 150, `shortfallHorizon` 600,
`queuePerBuilder` 5, `maxBuilderYards` 8, `gearFloor` 40. No game-balance number (waves, structures,
recipes, map) moved in this pass.

### Test time: where it went and what the default suite runs now

The brief for this pass reported the node suite at about 224 s on the committed code and about
19 minutes once the ledger work made the bases bigger, with the engine tick about 88 % of the cost.
Both halves of the fix were taken:

- **The engine tick got faster without changing results.** Kept from the stopped work: cached cost
  fields, a flat heap for the flow field, cached store sums (`invChanged`), cached `accepts`, link
  references. Added: one shared inventory-totals table for `available()` and `Game.inventory()`
  (28 % of a profile before; a six-hour temperate run went from 699 s to 195 s with a byte-identical
  result), `techEffect()` remembered per research state (20 % of a profile), and the scan bonus lifted
  out of `scanMore()`'s inner loop. The placement search in `spot()` is now the largest single line
  (about a quarter of a run) and was left alone, because every cheap way to trim it changes which spot
  it picks.
- **The three-world milestone moved behind `npm run test:sim`** (`FOUNDRY_SIM=1`). Three six-hour games
  are still three six-hour games; they do not belong in the suite someone runs after every edit.

| what | time |
|---|---|
| `node --test prototypes/frontier-foundry/tests/*.test.js` (the default; milestone skipped) | **42 s** (66 pass, 2 skipped; the slowest test is the in-process six-hour bot run, 26 s) |
| `npm run test:sim` (the full milestone: the same file with the three sim runs) | **3 min 04 s** wall, 9 min 44 s CPU (11 pass) |
| one six-hour world, committed code → now | temperate 868 → 183 s, arid 1050 → 188 s, volcanic 124 → 143 s (volcanic used to die at 02:44) |
| `npx playwright test prototypes/frontier-foundry` | 13/13, 48 s |

### Found and not fixed

- **`tickProduction()` sets `busy = false` on every building without a recipe** — drills, generators,
  scanners — right after `tickExtraction()` set it. So `--why` always reports drills as "running 0",
  and `tickPower()` bills every drill at a quarter of its power. Fixing it is one line, but it would
  quadruple extraction's share of every grid and move every balance number in this file, so it is left
  for a pass that re-runs the matrix.

## 0b. Round 3: the tree could not pay for itself

Round 2 ended with every world, on every difficulty, stopping at the same line in the headline:
**"stalled on packs"** — 47 research nodes on temperate, 43 on volcanic, and no rocket anywhere. That
turned out to be a stack of separate faults, and the top one was not a balance number at all.

Where round 3 lands, from the matrix in §2: **on easy all three worlds survive the six hours with
67-69 research nodes** — round 2 could not finish 47 anywhere. On normal, temperate survives with 69
nodes and 1385 buildings, arid reaches 68 nodes and holds 31 of 33 waves before losing the pod at
04:33, and volcanic stops at 29 nodes and 02:44. (The matrix was taken just before the last change in
this pass — warehouses scale with the square root of the map rather than with it, because a warehouse
is eighteen *steel* plate — which moves arid on normal out to **05:41 and 40 waves held**.) Hard is
lost on all three. Nobody launches a rocket
yet; temperate and arid get the launch pad up and the research behind it, which round 2 never did.
Every remaining loss on normal and hard has the same signature in the last column — `sulfuric_acid
0.00, pack_chem 0.00` — and §4 explains what that is.

### The research order deadlocked on itself

`t_refractory` is the first node in the tree that has to be paid for in **energy packs**. The recipe
that *makes* an energy pack is unlocked by `t_highvoltage`, and `RESEARCH_ORDER` in `js/ai.js` listed
`t_highvoltage` five places **after** `t_refractory`. So the bot could not research the node that
taught it to build the thing the research needed, and the whole rocket half of the tree — refractory,
superalloy, re-entry, precision, rocketry, satellites, probes — sat behind a node it could never pay
for. `t_solar` had the same shape a step lower: an energy pack is two battery cells, one advanced
circuit and one **solar cell**, and `t_solar` was down with the endgame nodes, so the bot arrived
holding two thirds of a pack it could never finish.

`t_highvoltage` requires only `t_batteries` and costs chemical and logistics packs, both of which the
mid-game base makes in quantity. Both nodes moved up to sit directly after `t_batteries`. This was one
line of data and it is the single most valuable change in the pass.

### Every outpost built after hour four was stranded

`bot.maxCrates` and `bot.maxWarehouses` are there to stop the bot paving the base with stores it only
wants for capacity. They are flat numbers written for one 96-tile chunk, and the compact base spent
the last of them at about hour four. From that moment `chainToPool` returned at its first line, and
every drill sunk after it stood in a private pool of one, filling its own hopper.

On temperate that was the lithium: two drills, 85 and 107 tiles out, **200 units mined in six hours**.
No lithium meant no battery cell, which meant no energy pack — the same dead end as above, reached a
different way. The planner never noticed, because `capacityTable()` counts what a drill can *dig*, and
it read 3.45 lithium a second the whole time.

The store budget now scales with the map, connection work gets triple the allowance (an unconnected
outpost is worse than no outpost), a long chain uses warehouses even when the base has had its fill of
them, and `outposts()` books a truck for anything past fourteen hops.

### Nobody replaced a dead builder

The bot spawned guards when it wanted them and left the four builders it landed with to wear out.
That is invisible on a quiet world and fatal on a hazardous one: on volcanic the heat and the ashfall
had killed all four by 01:15, and from that moment the base could not finish another outline. The bot
went on placing them — 234 placements against 135 finished buildings — and the run sat at 135
buildings until the pod came down at wave seven. `crew()` keeps six builders alive; a builder is four
plate.

### The pod's workbench never made a gear

`podWork()` walked a list of three jobs — plate, gear, wire — and took the first one under its floor.
Plate sat just under its floor of 120 because the base kept spending it, so the workbench made plate
and only plate, and gear — which every early generator needs ten of — stayed at one. No gear meant no
generator, which meant a 480 kW grid under a 1890 kW draw, which throttled the smelters to a quarter
speed, which is what kept the plate under its floor.

The obvious fix — serve whichever job is furthest below its floor — is worse, and the sim said so
twice. Copper wire starts at zero, so it is *always* the furthest below its floor; the workbench
parked on it from the first minute with no copper ingot in the base to make it from, and stopped
making the plate everything else is built out of. Temperate and volcanic both died inside half an
hour with three plate in the base. What works is the original order plus one bounded exception: a job
that is genuinely at zero, that the bench has the ingredients for, and that has nothing unstocked
above it, may jump the queue. Temperate's opening came out *ahead* of where it started — six research
nodes at the half hour against five, 160 buildings against 123.

### A desert world could not find iron

The last one, and the biggest single number in the pass. Resource patches are scattered by a weighted
roll per tile: a resource whose `found.biomes` includes this tile's biome gets 3x weight, anything
else got 0.35x. Iron's biomes are hills, mountains, badlands, grassland and shrubland. A desert world
has almost none of those — while copper lists `desert` outright and sand lists `desert` and `beach`.

On the same 288 x 288 map, seed 7: **temperate rolled 43 iron patches, arid rolled 16**, alongside 128
copper and 113 sand. Sixteen patches is sixteen drills and then nothing, so arid sat at 14.5 iron ore
a second against the 37 its own plan wanted, never started a steel line, and therefore met the wave-20
boss with watchtowers — 18 damage a second into 19 armour — and lost the pod. Every earlier attempt to
fix arid was tuning the wrong thing.

`common`-tagged resources — iron, copper, coal, stone, sand, salt, water, ice — now take a floor of
`map.commonOffBiome` (1.2) off their home ground instead of 0.35. They are meant to be *thinner* away
from their biome, not nearly absent. Arid now rolls 40 iron and 33 coal, and the spread across all ten
archetypes is even. Arid went from losing the pod at 03:28 with 585 buildings and 29 research nodes to
**1094 buildings and 51 nodes at four hours with 27 of 28 waves cleared**.

### Flat caps on a base that grows

The same disease in three places. Thirty-six turrets is right for the two-hundred-building base of
hour two and too few for the nine-hundred-building base of hour five — on arid the gun line hit the
cap at wave 15, held fourteen more waves on upgrades alone and lost the pod at wave 30. Generators
were capped at 44 on a base drawing 8 MW. Scanners stopped at a budget that covered two thirds of the
map, which on temperate left both titanium patches — 172 and 188 tiles out — in the dark, so the alloy
chain could not start at all. All three now scale with what is standing, and the scanner budget only
doubles **while** something the bot has planned for has no scanned patch anywhere; once the seams are
found the surplus towers are sold again, because a patch stays scanned once something has looked at
it. Ninety-six towers left standing is 3.4 MW of pure overhead.

### Two smaller ones

- **The opening guns were priced out by a round number.** `defence()` refuses to spend on turrets
  while iron plate is below a floor, so that a base cannot spend its landing kit on watchtowers and
  starve the plate line. For the *opening* six guns — the ones the code's own comment calls "never
  optional" — that floor was fifty plate, and a watchtower costs ten. On a world where the base spends
  plate as fast as it makes it (volcanic sits at about forty) the first six guns were therefore never
  built at all, and the run ended at wave two with a hundred and fifty buildings and nothing shooting.
  The opening floor is twenty-four now: sized to the gun rather than to a round number. The later
  floors, which are the ones actually protecting the steel line, are unchanged.
- **`t_wind` was an endgame node.** It costs one pack, sits behind `t_landfall` alone, and is the only
  power in the game that does not eat something a drill had to dig. On a world with thin coal — volcanic
  digs fourteen small seams — that is the difference between a grid that grows and one that does not.
  It is an opening move now.

---

## 1. What the sim found, in the order it mattered

Every one of these was a run-ending bug rather than a tuning problem, and each one was hiding the
next. The headline number — research nodes finished in six hours with no attacks — went
**7 → 27 → 47 → 69** as they came off.

### The ground was not buildable

`map.buildable` was a per-tile test: `slope > 0.78` and you cannot build there. worldgen's slope is
speckled, so a flat shelf comes out peppered with single steep tiles, and a factory wants 3 × 3 and
4 × 4 blocks. On seed 7 the whole 96 × 96 chunk held **190 legal 4 × 4 spots**. The bot filled them
and stopped.

`refreshBuildable()` now averages the slope over a tile and its four neighbours, with a hard cliff
rule at 1.15 for genuine rock faces. Same seed: **1947 legal spots**. Movement cost still reads the
raw slope, so rough ground is still slow to cross — it is only building that got easier.

### The starter patches ate the only sulfur patch on the map

`ensureStarterNodes` guarantees iron, coal, copper and stone within ten tiles of the pod, and to keep
the node count steady it re-uses a far-away patch of something else. It did not check whether that
patch was the *last* one of its resource. On a temperate world sulfur is `scarce` — one small patch —
and about a third of seeds had it quietly turned into another iron patch before the run began.

No sulfur means no sulfuric acid, which means no chemistry pack, which means the research tree stops
at tier two **for the rest of the run, on every planet**. It now never takes the last patch of
anything, `forceNode` sweeps the map when its random darts miss, and every scarce resource is
guaranteed two patches rather than one.

### Nothing made sulfur, either

Even with a patch, one scarce seam is about ninety minutes of a mk2 drill and then the chemistry pack
is gone for good. Added **Sweeten Crude** (`chemical_plant` / `cracking_tower`, 15 crude + 6 water →
5 sulfur + 3 fuel, under `t_chemistry`): slower than digging it, but oil is everywhere and sulfur is
not. This is the only new recipe in the pass and it exists to remove a single point of failure.

### The bot built over its own future

`spot()` had a last-ditch placement pass that ignored resource patches when nothing else fitted. By
hour three the base had paved its own sulfur, crude oil and titanium. Non-extractors now never build
on a patch, with a tile of margin so a drill can still reach the edge of one.

### Generators ate every scrap of coal

The bot's chain planner costed the factory and ignored the power station. Nine combustion generators
burn 2.25 coal a second between them, which was exactly what the drills could dig; the smelters
starved and the run died with a full power bar. `fuelDemand()` now counts what every generator and
truck will burn. `power()` also compares *installed* capacity rather than live output — a coal
shortage used to read as "not enough generators" and the bot answered it by building another twenty.

### The guns could not see the pod, and could not shoot up

Turrets were aimed at one point worked out from the turret count. When that tile was water the count
never moved, so it asked for the same impossible tile forever — four watchtowers for a whole run.
When it did fit, the spiral search put the gun 15–23 tiles out, outside a watchtower's 13-tile range
of the pod: a burrower could stand on the landing pod and chew through 8000 hp with seventeen turrets
standing and not one able to see it. `turretSpot()` now searches a ring around the pod for the tile
with the thinnest cover.

Separately, nothing below a missile battery could hit a flyer, and pyre moths arrive at wave 8. The
watchtower and the gun turret can now be pointed upwards; flame turrets and tesla coils stay
ground-only and the missile battery keeps its job as the specialist with 28 tiles of reach.

### Forty-two rifles against an armoured target

Armour subtracts flat from damage per second. A hull breaker at wave 20 carries about 19 armour, so a
watchtower's 22 dps does 3. The bot hit its turret cap on watchtowers and stayed there.
`upgradeTurret()` now swaps the weakest gun on the line for the best one the tree allows.

### Sulfur was a single point of failure, and the map hid the ore

Sulfur gates both the chemistry pack and the military pack, and a temperate world carries one small
scarce patch of it. Beyond the starter-node bug above, one seam is about ninety minutes of a mk2
drill and then the middle of the tree closes for good. Three things now stop that: every scarce
resource is guaranteed **two** patches rather than one, a bore can be sunk on a patch the drills have
already emptied (the DESIGN said it followed the seam; the code checked `!node.depleted` and refused),
and **Sweeten Crude** pulls sulfur out of sour crude in a chemical plant.

The bot was also only allowed eight scanner towers — a number that covered one 96-tile chunk and left
two thirds of a 288-tile grid dark, with seven of sixteen iron patches never revealed. The cap now
scales with the map.

### Content nobody could ever see

`makePlanet` took the first one or two entries of an archetype's rare-element pool, in order. Anything
listed third — emberlace on arid, brinepearl on frozen and verdant, nullstone on barren and shattered —
could not turn up on **any** seed. The pool is shuffled now; a sweep of sixty seeds × ten archetypes
finds all twelve rare elements.

### The wave-20 boss was unanswerable

The rift maw (4200 hp, 26 armour, 260 dps, walks straight for the pod) entered the tables at wave 18,
and every tenth wave is a boss wave — so wave 20 was a guaranteed rift maw. Against watchtowers, flat
armour leaves 2 damage a second: sixty of them cannot kill it before it kills the pod, and eight of
nine matrix runs died at almost exactly 03:00. It now enters at wave 30 and carries 20 armour, which
puts it after the point where a gun-turret line is realistic. The archetype signature beasts
(dune lurker, ash stalker, tide crawler, sky leech) moved from wave 1 to wave 3 for the same reason:
wave 1 can only spend five threat points, and a 520 hp beast is not what that budget is for.

### Defence was eating the factory

With the guns finally working the bot bought forty watchtowers and had no plate left for the steel
line — a base that holds wave 20 and has not researched chemistry. It now always buys an opening line
of six, and past that plate is protected until something is actually making steel plate.

### The map was too small for the base

Even with all of the above the bot ran out of ground on one 96-tile chunk at about 400 buildings. The
interface runs a 5 × 5 block of chunks; the sim now runs 3 × 3 by default, the bot's spread scales
with the map instead of a fixed 72 tiles, and its lattice went from a 5-tile to a 4-tile pitch —
a 3 × 3 machine in a 5 × 5 cell wastes 64 % of the ground it stands on.

---

## 2. The funnel

| world | difficulty | first drill | first smelt | steel | refinery | chem packs | 1st wave held | satellite | rocket | tech | waves | built | crew lost | outcome |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| temperate (Thaora Reach) | easy | 00:00 | 00:01 | 01:23 | 01:33 | 02:24 | 00:26 | — | — | 68 | 41/41 | 1638 | 10 | survived |
| temperate (Thaora Reach) | normal | 00:00 | 00:01 | 01:39 | 01:50 | 02:40 | 00:16 | — | — | 69 | 42/42 | 1385 | 24 | survived |
| temperate (Thaora Reach) | hard | 00:00 | 00:01 | 01:19 | 02:24 | 02:26 | 00:10 | — | — | 47 | 32/33 | 1201 | 20 | lost 04:52 |
| arid (Thaora Reach) | easy | 00:00 | 00:00 | 02:15 | 02:23 | 02:27 | 00:26 | — | — | 69 | 46/46 | 1509 | 24 | survived |
| arid (Thaora Reach) | normal | 00:00 | 00:00 | 01:51 | 01:58 | 02:28 | 00:16 | — | — | 68 | 31/33 | 1101 | 22 | lost 04:33 |
| arid (Thaora Reach) | hard | 00:00 | 00:00 | 01:24 | — | — | 00:10 | — | — | 27 | 10/11 | 536 | 4 | lost 01:29 |
| volcanic (Thaora Reach) | easy | 00:00 | 00:00 | 03:00 | 03:49 | 03:52 | 00:26 | — | — | 67 | 41/41 | 1236 | 25 | survived |
| volcanic (Thaora Reach) | normal | 00:00 | 00:00 | 02:01 | — | — | 00:16 | — | — | 29 | 17/18 | 609 | 13 | lost 02:44 |
| volcanic (Thaora Reach) | hard | 00:00 | 00:00 | — | — | — | 00:10 | — | — | 27 | 8/9 | 394 | 11 | lost 01:26 |

What each run was most short of at the end (worst supply-against-demand ratios):

- **temperate / easy** — pack_space 0.06, iron_ingot 0.26, helium3 0.36, advanced_circuit 0.59 *(research stalled on packs)*
- **temperate / normal** — rocket_part 0.00, satellite 0.00, pack_space 0.19, iron_ingot 0.26 *(research stalled on packs)*
- **temperate / hard** — alloy_plate 0.00, copper_ingot 0.73, iron_ingot 0.75, gold_ore 0.82 *(research stalled on packs)*
- **arid / easy** — alloy_plate 0.00, superalloy 0.00, heat_shield 0.00, rocket_fuel 0.00 *(research stalled on packs)*
- **arid / normal** — alloy_plate 0.00, superalloy 0.00, tungsten_ore 0.00, heat_shield 0.00 *(research stalled on packs)*
- **arid / hard** — sulfuric_acid 0.00, pack_chem 0.00, fuel 0.00, lubricant 0.00 *(research stalled on packs)*
- **volcanic / easy** — alloy_plate 0.00, superalloy 0.00, rocket_fuel 0.00, pack_space 0.00
- **volcanic / normal** — sulfuric_acid 0.00, pack_chem 0.00, fuel 0.00, lubricant 0.00 *(research stalled on packs)*
- **volcanic / hard** — sulfuric_acid 0.00, sulfur 0.00, pack_chem 0.00, fuel 0.00 *(research stalled on packs)*

---

## 3. What moved in `data/balance.json`

| Knob | Was | Now | Why |
|---|---|---|---|
| `map.oreNodeSize` | 26 000 | 40 000 | coal ran dry around hour five and took the generators with it |
| `map.fluidNodeSize` | 60 000 | 84 000 | the oil chain feeds fuel, lubricant, polymer and resin at once |
| `map.scarceNodeAmount` | 0.5 | 0.8 | one scarce seam was 90 minutes of drilling |
| `map.scarceNodeWeight` | 0.35 | 0.5 | and there was usually only one of them |
| `map.scarceNodeCount` | — | 2 | every rocket-chain resource is guaranteed two patches |
| `structures.drill_mk1/2/3` | 1.0 / 2.2 / 4.2 | 1.3 / 2.9 / 5.4 | ore throughput, not machine count, was what everything above steel waited on |
| `structures.deep_bore` | 1.8 | 2.6 | it has to be worth 320 kW to stop a seam running out |
| `structures.lab` | 1.2 | 1.6 | research is the factory's throughput; the factory got faster |
| `researchWorkByTier` 2–5 | 0.85–0.95 | 0.8 | the middle of the tree was the longest part of a run by a distance |
| `waves.budget.growth` | 1.14 | 1.075 | wave 40 went through the cap; nothing short of artillery held it |
| `waves.budget.cap` | 700 | 520 | same |
| `waves.escalation.surgeMultiplier` | 1.5 | 1.35 | every fifth wave was the one that killed the run |
| `units rift_maw.from / armor` | 18 / 26 | 30 / 20 | the wave-20 boss wave was a guaranteed run-ender |
| `waves.interval.min` | 420 | 450 | a seven-and-a-half minute floor keeps the middle of a run build-and-explore time |
| `waves.escalation.hpPerWave` | 0.045 | 0.04 | with armour also climbing, the two compounded |
| `waves.threat.waveCleared` | −60 | −90 | clearing a wave should buy real quiet |
| `map.commonOffBiome` | — | 1.2 | 0.35 left a desert world with sixteen iron patches and no steel line |
| `bot.maxCrates` | 36 | 44, x map | the flat cap stranded every outpost built after hour four |
| `bot.maxScanners` | 48 | 48 / 96 hunting | the far seams were never found; the surplus is sold again after |
| `bot.structuresPerTurret` | — | 40 | a flat 36 guns is right at 300 buildings and a lost pod at 900 |
| `bot.structuresPerGenerator` / `generatorCapFrom` | — | 30 / 500 | same, for the grid, and only past the size the flat cap was written for |
| `bot.wantBuilders` | — | 6 | nothing replaced a dead builder; on a hazardous world that ends the run |
| `bot.maxRoutes` | — | 10 | ore too far out for a chain of stores has to come home by truck |
| `defence()` opening plate floor | 50 | 24 | a watchtower costs ten plate; fifty meant the opening guns were never built |
| `bot.*` | — | see below | the harness knobs |

New bot knobs, all in `data/balance.json -> bot`: `maxReach`, `latticeStride`, `maxCrates`,
`maxWarehouses`, `maxHarvesters`, `maxPerRecipe`, `maxPackRate`, `fuelHeadroom`, `poleSpacing`,
`tilesPerScanner`.

---

## 4. What the bot still does not do

Named here rather than left for someone to find. Round 3's list opened with "it does not launch a
rocket" and "it cannot save up for a building"; round 4 (§0) closed both on seed 7, normal — all three
worlds launch inside six hours and keep the pod. What is left:

- **The margin is thin and one seed is one trajectory.** Volcanic launches at 05:37. During the pass
  the launch came and went with small bot changes, so treat a green milestone as "it can", not "it
  always will". Hard is not attempted. Seed 11 temperate still stalls at 29 nodes without a chemical
  pack (§0) and is the first thing to run `--why` on next.
- **It builds far more rocket sections than it needs.** Every world ends with 70–90 rocket parts in
  store: `DEMANDS` keeps asking for 0.02 a second after the launch. Harmless for the milestone, wasteful
  for a run that continues to a station and beacons.
- **Iron ingot is short on every world** (about 0.7 of what the plan wants at six hours): smelting is
  pinned at `maxPerRecipe` smelters and the bot never upgrades a smelter line to arc furnaces.
- **It does not size the top of a chain off the thing it is actually building.** `DEMANDS` asks for a
  fixed 0.2 alloy plate a second whatever is standing; a base with a launch pad up wants several
  times that, and the planner has no notion of "there is a rocket to pay for". That is the next
  thing to try, and it is a bot change rather than a balance number.
- **It uses trucks, but not well.** `outposts()` now books a run for any drill the storage pools
  cannot reach — seven to ten routes and twenty-odd thousand units delivered per run, where round 2
  managed three routes and four thousand — but it never re-points a route when the seam behind it
  runs dry, and it never runs a route between two outposts.
- **It does not retreat, repair between waves on purpose, or rebuild what it loses** except through
  the generic upkeep pass.
- **It never builds a second base**, which is the scope line in `DESIGN.md` §11 rather than a bug.

## 5. Things tried and rejected

- **Reserving part of the build budget for the shallow end of the tree** (finished goods rather than
  ore). It sounds right — the deep ore chains can never catch up, because the demand behind them is
  the sum of everything above — but the sim says the opposite: building an assembler before the plate
  line can feed it just moves the jam up a level. Six-hour research count went from 69 to 28.
- **Sizing the science-pack line off what the labs could eat, uncapped.** Eighteen labs will draw
  about three chemical packs a second; asking the planner for that pulls an ore demand the opening
  base cannot begin to serve, and it spends every build on the deepest starving chain while the plate
  line sits at twelve plate. It is capped at `bot.maxPackRate` and ramped with the research count.
