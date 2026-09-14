# Frontier Foundry — balance pass 2 (2026-09-14)

*Written from `tools/sim-matrix.mjs`: three worlds × three difficulties, six in-game hours each,
288 × 288 map (3 × 3 chunks), seed 7, played headless by the bot in `js/ai.js`. Round 1's report was
the `--why` dumps in the commit that built the engine; this is the first proper funnel.*

Run it again with:

```
node prototypes/frontier-foundry/tools/sim-matrix.mjs --hours 6 --jobs 3 \
     --out prototypes/frontier-foundry/research/sim-report.md
```

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

<!--MATRIX-->

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
| `bot.*` | — | see below | the harness knobs |

New bot knobs, all in `data/balance.json -> bot`: `maxReach`, `latticeStride`, `maxCrates`,
`maxWarehouses`, `maxHarvesters`, `maxPerRecipe`, `maxPackRate`, `fuelHeadroom`, `poleSpacing`,
`tilesPerScanner`.

---

## 4. What the bot still does not do

Named here rather than left for someone to find:

- **It does not launch a rocket inside six hours.** It reaches the launch pad and the research behind
  it, and then the top of the chain — alloy plate, superalloy, control units, heat shields, rocket
  fuel — is fed by single scarce patches of titanium, tungsten, platinum and gold and never gets
  ahead. The funnel table shows where each run actually stops.
- **It does not use trucks well.** It runs three routes and then forgets about them; everything else
  is crate chains and one storage pool.
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
