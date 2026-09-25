# Farhold — the Civilization Expansion: houses, workers, vendors, trade goods and the muster

**Design spec. Implementable as written. No game code was changed to produce this document.**

A bare `§x.y` in this file means **this** file. The master brief is cited in full as
`BUILDING_EXPANSION.md` §7.1, the colony write-up as `COLONY.md` §4, and so on.

Line numbers are as read on 2026-09-20, with the round-13 working tree in place. The claim-stone
removal and other parallel rounds will move some of them; every citation below also names the
function, so a `grep` for the name is the fallback.

Read alongside, with the lines that matter:

- `js/work.js` — the whole file. `createOrder` 65, `addWork` 103, `machineUnits` 185,
  `WorkBoard.nextFor` 243, `swing` 260, `work` 269, `runMachines` 284. **The unit already exists and
  already has three interchangeable sources. This round does not invent a second one.**
- `js/colony.js` — `createColony` 110, `newCitizen` 161, `assign` 196, `setBeds` 208,
  `_assignBeds` 210, `guards` 224, `_advance` 292, `_doWork` 353, `collectTax` 403, `appeal` 437,
  `recruitOffer` 515, `toJSON` 594. `data/colony.json` is the whole balance of it.
- `js/refine.js` — `place` 47, `speedOf` 166, **`step` 185**, `catchUp` 296, `snapshot` 311,
  `stateText` 331. The labour gate in §3 goes into `step` at line 194, above the input take at 202.
- `js/stores.js` — `createStoreNetwork` 62, `poolAt` 138, `accepts` 172, `roomFor` 192,
  `haulThroughput` 304, `linkAdvice` 316.
- `js/power.js` — `createGrid` 27, `add` 46. `data/power.json` `storage` / `poles` / `haulers`.
- `js/buildplan.js` — `MATERIAL_ALIASES` 40, `realCost` 54, **`alignCatalogue` 77**, `check` 319,
  the claim refusal at 358, `place` 373, the entry blocks at 412, `lights` 517, `inClaim` 533.
- `js/build-ui.js` — `TOOLS` 33, `FIRST_STEPS` 65, `createBuildUI` 87.
- `js/haulpath.js` — `CELL` 35, `MAX_SLOPE` 38, `findHaulPath` 61, `bestStoreFor` 157.
- `js/homes.js` — `normalise` 34, **`sameWorld` 58** (a world is two numbers), `forWorld` 130,
  `routeTo` 154.
- `js/raid.js` — `raidOffer` 125, `canFire` 209, `beginRaid` 242, `waveSpawns` 266,
  **`loseRaid` 307**, **`raidRewards` 330**. Four small edits in §9 and nothing else.
- `js/defence.js` — `gunOf` 34, `baseSpot` 82, **`baseOf` 92**, `ring` 155, `spawnWave` 169,
  `tick` 221.
- `js/caravans.js` — `CARGO` 34, `dispatch` 57, `update` 91 (**the ambush at 119 is unconditional**),
  `escort` 136, `arrive` 145, `rob` 157.
- `js/town.js` — `ROLES` 66, `CRATE_TIERS` 90, `HEADCOUNT` 98, `STOCK_BY_ROLE` 116, `GUARD` 133,
  `rosterFor` 141, `spawnOne` (used from `main.js` 2661 and 3542).
- `js/town-plan.js` — `BUILDING_INFO` 21. `proctown/js/townplan.js` — `WANT_ORDER` 150,
  `WANT_FROM` 156, the plot record at 461, the trade allocation at 640.
- `js/main.js` — the industry wiring at **1666–1740**, the colony at **1832–1840**, the build-panel
  sections at **2425–2500** (`workboard` 2434, `holding` 2462), `currentSnapshot` at **4655**. `js/save.js` `snapshot()` at 93.
- `COLONY.md` "Wiring left for the game layer", `INDUSTRY.md` §7, `BUILD-MODE.md` §18 and §20,
  `BUILDING_EXPANSION.md` §4e, §7 and §8.

---

## 0. What this round assumes about the build system, because it is changing underneath it

The claim stone is being removed in the same round. The user's words:

> "Can we remove the need to build claim stones and instead encourage random outposts? I would like
> to slap down a drill at a remote deposit, connect it to the power grid and storage, and send the
> output back to my base using a travel route."

> "I don't really want to have claim stones and would rather just allow building arbitrarily
> anywhere, making all the machines simple and calculable without any physics or rendering.
> Production and manufacturing should continue even if you leave a planet."

Six systems in this expansion key off a claim today, so the two rounds have to agree on one thing.
**They agree on `js/outposts.js` (§4.1): a cluster of your own structures, worked out from where
they stand rather than declared by a stone.** That is the whole contract:

```js
import { createOutposts } from './outposts.js';
const outposts = createOutposts({ link: 48, world: { systemSeed, planetId } });
outposts.rebuild(build.entries);        // whenever a piece goes up or comes down
outposts.at(x, z);                      // the outpost a point belongs to, or null
outposts.of(entryId);                   // the outpost a structure belongs to
outposts.all();                         // [{ id, name, x, z, entries, beds, stations, founded }]
```

Single-link clustering at **48 m**: two structures within 48 m of each other are the same outpost,
transitively. 48 because a logistics pole reaches 22 m and a relay mast 34 m, so anything that
already shares a storage pool is certainly one outpost and a pair of sheds across a yard still is.
It is the same union-find `js/stores.js:99` already runs on pools, on a different radius, and it
should be lifted out of `stores.js` rather than written twice.

Everything downstream reads an outpost where it used to read a claim:

| Today | After |
|---|---|
| `buildplan.check` refuses "outside your claim" (`buildplan.js:358`) | deleted — build anywhere |
| `plan.inClaim(claimId)` (`buildplan.js:533`) | `outposts.of(id).entries` |
| `defence.baseSpot()` finds the claim stone (`defence.js:82`) | the **nearest outpost to the player**, or the largest if none is near |
| `homes.add({ claim })`, one waypoint per claim (`homes.js:94`) | one waypoint per **outpost** |
| `terraform` brushes filed against `claim.id` (`buildplan.js:394`) | filed against the outpost id |
| `terraformBudget: 60000` per claim | per outpost, unchanged number |

Three consequences this expansion depends on and should be built to:

- **§0.1 — A house is a house wherever it stands.** Housing (§2) counts beds per outpost, so an
  outpost with beds and no machines is a hamlet and one with machines and no beds is a works. Both
  are legal and they behave differently, which is the point.
- **§0.2 — An outpost can be a single drill.** `outposts.all()` must be happy returning a
  one-entry record with `beds: 0, stations: 1`. The Trade tab (§7) lists it as an origin anyway,
  because a lone drill with a store next to it is exactly the thing the user wants to send home.
- **§0.3 — Delivery is a timed route between pools, and it already exists.** `js/mining.js`
  `autoRoute` + `js/haulpath.js` `bestStoreFor` is the drill half; §7 is the same idea between
  settlements, at a bigger scale, and it must not become a second haulage system. One sum:
  `metres → rate`, in `js/stores.js:304 haulThroughput`.

> The one thing that must not be lost with the claim stone: **`rules.terraformBudget`
> (`data/structures.json`) is the only brake on reshaping the planet.** Attach it to the outpost or
> a player with a shovel flattens a continent.

---

## 1. The pitch, and where everything joins

**Ore goes to a town, a person who lives there smelts it, what comes out is worth more somewhere
else, and a cart takes it there while you are asleep.**

That is the whole round. Farhold already has the two halves — a materials chain that goes from a
seam to a control board (`INDUSTRY.md`), and a colony of people who turn hours into work units
(`COLONY.md`) — and they have never been introduced. A furnace runs on a timer and does not care
that anybody lives here; a citizen fills a work order and nothing the citizen does has ever made a
single ingot. This round makes the citizen the reason the furnace runs, gives what the furnace
makes somewhere to go, and gives the player two honest ways to get a trade good — **make it slowly
and cheaply, or buy it instantly and dearly.**

```
  THE GROUND                        YOUR OUTPOST                            THE ROAD
  ──────────                        ────────────                            ────────

 seam ─┬─ E, by hand ──────┐
       └─ drill ──┐        │
                  │        │                        ┌── house + utilities in reach (§2)
 tree ── strike ──┤        │                        │        │ sleeps in
                  ▼        ▼                        │        ▼
             ┌─────────────────┐              ┌─────┴──────────────┐
             │   STORE POOL    │              │     CITIZEN        │
             │  (js/stores.js) │              │  bed + station     │
             └────────┬────────┘              │  (js/colony.js)    │
        inputs ↓      ↑ outputs               └─────────┬──────────┘
             ┌────────┴────────┐    work units          │ 1 unit = 30 s of running
             │    MACHINE      │◀──────────────┐        │
             │ furnace /       │               │        ▼
             │ workshop (§6.3) │        ┌──────┴────────────────┐
             └────────┬────────┘        │     WORK BOARD        │◀── you, swinging (E)
                      │                 │     (js/work.js)      │◀── a Tender Arm (§3.6)
                      │ ingots, planks  └───────────────────────┘
                      │ and TRADE GOODS (§6)
                      ▼
             ┌─────────────────┐  weight-capped
             │   TRADE POST    │──────────────────▶ THE HOLD (§6.5) ──▶ you carry it
             │   2000 kg       │                          │
             └────────┬────────┘                          │
                      │ a route you set (§7)              │
                      ▼                                   ▼
             ┌─────────────────────────────────────────────────────┐
             │   CARAVAN  (js/caravans.js — already travels,       │
             │   already gets ambushed, already can be escorted)   │
             │   carrier + manifest + guards (§8.6)                │
             └────────────────────────┬────────────────────────────┘
                     ambush ↙         │          ↘ arrives
                  raiders (§7.6)      │       ┌──────────────────┐
                        ↕             │       │  ANOTHER TOWN    │
                   you, escorting ────┘       │  FACTOR (§5)     │
                                              │  price = base ×  │
                                              │  town multiplier │
                                              └────────┬─────────┘
                                                       ▼
                                                     GOLD ──▶ wages (§8.3), rent (§5.6),
                                                              recruiting (colony.js:540)

  AND, SIDEWAYS:   the MUSTER STONE / the town's notice board ──▶ js/raid.js, with drill: true (§9)
                   waves ──▶ crates + spoils on a win, nothing at all on a loss
```

Four things make the loop close rather than dangle:

- **§1.1 — Gold has somewhere to come from that is not a corpse.** Tax already exists
  (`colony.js:403`) and pays about 6 gold a citizen a day. A trade run pays hundreds (§7.4). The
  colony stops being a curiosity the moment one cart pays for a recruit.
- **§1.2 — Work becomes scarce.** Today a citizen fills whatever order is on the board and there
  are usually none. After §3 every tier-0 and tier-1 machine wants tending, so **people are the
  bottleneck**, housing is how you get more of them, and food is how you keep them.
- **§1.3 — Distance stays the decision.** `INDUSTRY.md` §1's whole argument is that a rich seam far
  away loses to a poor one near. §7 is that argument at the scale of a continent: a good price two
  zones away loses to a fair one next door once the cart is on the road for forty minutes.
- **§1.4 — Nothing here needs a frame.** Every module in §10 is pure data and a `tick`. The user
  asked for machines that are "simple and calculable without any physics or rendering", and the
  existing files already honour that — `js/refine.js` has no Three.js in it and `js/colony.js` has
  no DOM. Keep it. Rendering is `js/actors.js` putting a body where the data says somebody is.

---

## 2. Housing is a building, not a bed count

Today housing is four lines. `colony.setBeds(n)` (`colony.js:208`) stores a number,
`_assignBeds()` (210) hands out `bed_1 … bed_n` in list order, and `main.js:2427` counts
`build.entries.filter(e => e.key === 'bed')`. A citizen's `travelHours` is the constant
`schedule.travelHoursDefault` — **0.25 h for everybody, whether their station is next door or four
hundred metres up the hill.** `data/colony.json` already carries `walkSpeedMetresPerHour: 3000` and
`maxTravelHours: 2` and nothing has ever used either.

### 2.1 A house is a structure with a `home` block

`data/structures.json` gains a `home` block on the pieces that are dwellings, and
`js/buildplan.js:412` copies it on to the entry exactly as it already copies `waypoint`, `run` and
`gate`:

| id | name | w × d | beds | cost (catalogue words) | comfort |
|---|---|---|---|---|---|
| `bedroll` | Bedroll | 2.0 × 1.0 | 1 | `{ cloth: 3, fibre: 4 }` | 0.00 |
| `bunkhouse` | Bunkhouse | 6.0 × 4.0 | 4 | `{ timber: 28, plank: 12, cloth: 8 }` | 0.15 |
| `cottage` | Cottage | 5.0 × 4.5 | 2 | `{ timber: 20, plank: 14, block: 8, glass: 2 }` | 0.35 |
| `longhouse` | Longhouse | 9.0 × 5.0 | 5 | `{ plank: 30, beam: 8, block: 16, glass: 4 }` | 0.30 |
| `row_house` | Row House | 5.0 × 6.0 | 3 | `{ brick: 26, plank: 16, glass: 6 }` | 0.45 |
| `manor` | Manor | 11.0 × 8.0 | 6 | `{ brick: 48, beam: 14, glass: 12, iron: 8 }` | 0.60 |

The existing `bed` row (`cat: decor`, `{ plank: 4, cloth: 3 }`) stays and gains `home: { beds: 1,
comfort: 0.10 }`, so every save already in flight keeps its beds. Every cost above goes through
`MATERIAL_ALIASES` (`buildplan.js:40`) untouched — `timber`, `block`, `iron` and `glass` are all
already in the table or already real, and `alignCatalogue` translates them once at boot. **Nothing
in this round may price a building in a material the game does not produce**
(`tests/round13.test.js`, "a cost you cannot obtain is not a price, it is a wall").

### 2.2 A utility is a structure with a `utility` block

A utility serves every house whose centre is within `radius` metres of it. It does nothing else. No
pipes, no plumbing graph, no per-citizen need tracking — the argument is `COLONY.md` §3's: this is
rudimentary on purpose and the interest is in where you put things.

| id | name | kind | radius | comfort | cost | note |
|---|---|---|---|---|---|---|
| `well_head` | Well Head | `water` | 24 m | 0.20 | `{ block: 14, rope: 4 }` | must not stand on a slope over 0.2 |
| `hearth` | Common Hearth | `warmth` | 16 m | 0.15 | `{ block: 10, timber: 6 }` | lights, like the campfire |
| `larder` | Larder | `food` | 20 m | 0.12 | `{ plank: 14, block: 6 }` | a store, accepts `organic` only |
| `wash_house` | Wash House | `wash` | 18 m | 0.14 | `{ brick: 16, plank: 8, copper: 4 }` | needs a `water` utility in range |
| `privy` | Privy | `sanitation` | 14 m | 0.10 | `{ plank: 8 }` | the cheapest point of comfort in the game |
| `oven_house` | Oven House | `bread` | 18 m | 0.16 | `{ brick: 18, iron: 4 }` | a `kiln`-class machine; bakes `ration` |
| `shrine_post` | Shrine Post | `quiet` | 22 m | 0.12 | `{ block: 8, crystal: 1 }` | |
| `meeting_hall` | Meeting Hall | `gather` | 30 m | 0.22 | `{ beam: 12, plank: 30, glass: 6 }` | also the vendor board (§5.7) |

### 2.3 Comfort, and the one number it moves

```js
comfort(house) = clamp01( house.comfort + Σ over distinct utility KINDS in range of (u.comfort) )
```

Distinct **kinds**, so four privies is one privy. A cottage (0.35) with a well, a hearth and a privy
in range reads 0.35 + 0.20 + 0.15 + 0.10 = **0.80**. A bedroll on open ground reads **0.00**.

Comfort replaces the flat `housing.moodGainPerNightHoused: 0.12` with a scaled one:

```js
moodGainPerNight = housing.moodGainPerNightHoused × (0.4 + 1.2 × comfort)      // 0.048 … 0.19
```

and it is the **only** thing comfort does to a citizen. It also feeds two things outside the
citizen: the appeal term (§2.7) and whether a vendor will move in at all (§5.4). That is deliberate
— a second stat that secretly scaled work output would make "why is my furnace slow" unanswerable.

### 2.4 A citizen is bound to a bed and to a station, and the walk between them is real

`colony.setBeds(n)` and `_assignBeds()` are replaced. New shape, in `js/housing.js` (pure):

```js
import { createHousing } from './housing.js';
const housing = createHousing({ data: civics });          // data/civics.json
housing.rebuild(build.entries, build.defOf);              // reads `home` and `utility` blocks
housing.beds();                                           // [{ id, entryId, x, z, comfort, taken }]
housing.comfortOf(entryId);
housing.assign(citizens);                                 // nearest free bed to their station
housing.report();                                         // { beds, taken, spare, meanComfort, utilities }
```

`colony._assignBeds` becomes a two-line call into it, and a citizen's `home` stops being the
string `bed_3` and becomes `{ bedId, entryId, x, z, comfort }`. Then:

```js
// js/colony.js — replaces the constant at _advance (colony.js:308, 321)
travelHoursOf(c) {
  if (!c.home || c.stationId == null) return sched.travelHoursDefault;   // 0.25 h, unchanged
  const st = colony.stationAt(c.stationId);                              // { x, z } from the caller
  if (!st) return sched.travelHoursDefault;
  const m = Math.hypot(st.x - c.home.x, st.z - c.home.z);
  return clamp(m / sched.walkSpeedMetresPerHour, 0.02, sched.maxTravelHours);
}
```

At 3000 m an in-game hour, a station **90 m** from the bed costs 0.03 h each way and a station
**1.2 km** away costs 0.4 h each way — **0.8 h out of an 11 h shift, 7% of their output, gone into
walking.** At the `maxTravelHours: 2` cap (6 km) they spend a third of the day on the road and the
roster says so in words: *"Marwen Thorn — smelter, walking to work, fed. 40 minutes each way."*

**This is the housing lesson, and it is the only one.** Build the bunkhouse next to the furnaces.

`colony.stationAt(id)` is a callback the game layer supplies (`main.js`, one line: look the id up in
`works` then in `build.entries`), because `js/colony.js` must not learn what a machine is.

### 2.5 Exactly which functions in `js/colony.js` change

Extend, never replace. The file is 625 lines and 42 tests point at it.

| Function | Line | Change |
|---|---|---|
| `createColony` | 110 | takes `housing` and `stationAt`; both optional, and without them the module behaves exactly as it does today |
| `setBeds` | 208 | **kept as a shim** — `setBeds(n)` still works for `tests/colony.test.js`; it makes `n` anonymous beds at comfort 0 |
| `_assignBeds` | 210 | delegates to `housing.assign(colony.citizens)` when housing is present |
| `spareBeds` | 215 | `housing.report().spare` when present |
| `_advance` | 292 | `c.travelLeft = colony.travelHoursOf(c)` at 308 and 321, in place of the two constants |
| `_advance` | 303 | the housed mood gain is scaled by `c.home.comfort` (§2.3) |
| `appeal` | 437 | a fifth term, `trade` (§5.8), and the four existing weights rescaled |
| `collectTax` | 403 | **wages out** (§8.3) and **rent in** (§5.6) before the gold is banked |
| `assign` | 196 | refuses a binding past `job.tendMax` (§3.5) with a sentence |
| `report` / `roster` | 556 / 582 | carry `comfort`, `walkMinutes`, `tending` |
| `toJSON` / `load` | 594 / 602 | the citizen's `home` is now an object; a loaded string is upgraded in place |

New on the colony object: `travelHoursOf`, `stationAt`, `bind(citizenId, stationId)` (a named
alias for `assign({ stationId })` that also checks `tendMax`), `unbind`, `stationed()` and
`wages()`.

### 2.6 What a house does not do

No interiors, no furniture requirements, no room-quality scoring, no ownership disputes, no
upgrading a cottage into a manor in place. A house is a footprint, a bed count and a comfort number.
`COLONY.md` §2 settled this argument once — *"Rudimentary is the brief and it is also the right
call"* — and a housing system that needs a floor-plan validator would make building a village a
chore rather than a decision.

### 2.7 Appeal, rebalanced

`colony.appeal()` (`colony.js:437`) weights spare beds 0.30, days of food 0.30, defences 0.20, mood
0.20. Housing quality and a market have to appear in it or neither pays for itself. New weights in
`data/colony.json`:

```json
"weights": { "spareBeds": 0.24, "foodDays": 0.24, "safety": 0.16, "mood": 0.16, "comfort": 0.10, "trade": 0.10 }
```

`comfort` is the mean comfort of the **free** beds — nobody is drawn by a full manor — and `trade`
is `clamp01(vendors / 4)`. A tidy village with a well, a hearth, two spare cottage beds and a
quartermaster in residence reaches appeal ~0.72 and rolls a migrant at
`0.08 + (0.55 − 0.08) × 0.72 = 0.42` a day. The same village with the beds in the mud reaches ~0.46
and rolls at 0.30. **A day and a half against two and a half days per arrival — noticeable, and
never the difference between a colony and no colony.**

---

## 3. Work runs the machines

The user's sentence, and it is the centre of the round:

> "The goal being that you can have ore sent to a town and have an NPC run the furnace to smelt it
> automatically, consuming work."

`COLONY.md`'s own wiring table has been asking for this since the colony landed:

> *"Machines as the third work source — `js/refine.js` still runs machines on fuel-seconds timers
> and should post `createOrder({ tag: 'refine', stationId, units })` + `board.runMachines()`
> instead."*

So this is not a new system. It is the eighth join of the kind `BUILD-MODE.md` §20 catalogues: two
finished modules that were never introduced.

### 3.1 One unit is thirty seconds of a machine running

`js/work.js` deliberately says nothing about what a unit *buys* — that is the caller's business, and
it is why the unit is interchangeable. This round fixes the exchange rate once, in
`data/refining.json`:

```json
"labour": { "secondsPerUnit": 30, "bankSeconds": 120 }
```

**One work unit buys thirty seconds of a tended machine's running time.** The arithmetic that makes
this the right number, in the game's own clock (`balance.json` `sky.dayLengthSeconds: 900`, so one
game hour is 37.5 real seconds and the 7-to-18 shift is 412 real seconds):

| | |
|---|---|
| A smelter citizen, content, mood 0.7, skill 1.0 | `1.1 × 0.88 × 11 h` = **10.6 units a day** |
| …which is | `10.6 × 30` = **319 seconds** of machine time |
| …out of a 412-second working day | the furnace is lit for **77% of the shift**, dark all night |
| A `smelt_iron` batch is `time: 16` | **20 iron ingots a day, per person** |

That is a readable, teachable number: **one worker is one furnace.** Two furnaces and one smelter
means two half-lit furnaces, and the panel says so.

### 3.2 The rule, and exactly where it goes in `js/refine.js`

Each machine in `data/refining.json` gains a `labour` block:

```json
"furnace": { … "labour": { "secondsPerUnit": 30, "auto": false } }
```

| Machines | `secondsPerUnit` | `auto` | Why |
|---|---|---|---|
| campfire, furnace, kiln, oven_house | 30 | false | tier 0 — somebody stands at it. **This is the user's furnace.** |
| sawmill, stonecutter, tannery, loom, chemical_bench, workshop | 45 | **true** | tier 1 — a pair of hands turns it, and power turns it for you |
| smelter, alloy_forge, crusher | 0 | — | needs power; power is the whole cost |
| washer, refinery, assembler, crystal_cutter, fuel_synthesiser, manufactory | 0 | — | tier 2, automatic by design (`INDUSTRY.md` §3) |

`auto: true` means **the machine pays its own labour whenever the grid is actually carrying it**
(`grid.poweredOf(m.id) >= 0.05`). So a sawmill that has never seen a wire runs at
`unpoweredSpeed: 0.35` **and** needs a person; wire it up and it needs neither. That is precisely
the promotion `INDUSTRY.md` §1 makes of the drill, applied to a bench.

The machine gains one field, `m.workBank` (seconds), capped at `labour.bankSeconds` so a furnace
cannot be charged for a week in advance. Inside `step` (`refine.js:185`), **above** the input take
at line 202:

```js
// refine.js — new, between the speedOf check (193) and the budget loop (195-197)
const need = labourNeed(m);                       // 0 when secondsPerUnit is 0, or auto && powered
if (need > 0 && m.workBank <= 1e-6) {
  if (m.state !== 'unworked') log?.(`${m.name} is standing cold. Nobody is working it.`);
  m.state = 'unworked'; m.starvedFor = null;
  grid?.setBusy(m.id, false);
  return;
}
```

and inside the loop, after `m.progress += slice * speed` (243):

```js
if (need > 0) m.workBank = Math.max(0, m.workBank - slice);
```

The ordering matters and is the same ordering `refine.js` already uses for coolant (226): **labour
is checked before the inputs are consumed, because a machine that has already eaten two iron ore
cannot then be told nobody was there to do it.** A machine that runs out mid-batch keeps its
progress and its inputs and simply stops; when somebody turns up it carries on.

`stateText` (`refine.js:331`) gains one case:

```js
case 'unworked': return 'Standing cold — nobody is working this';
```

### 3.3 How units get into the bank: the board, not a new path

`js/refine.js` posts ordinary work orders and nothing else. Once a tick:

```js
// js/refine.js, new export
function postLabour(board, { at = 0 } = {}) {
  for (const m of machines.values()) {
    if (!labourNeed(m) || !m.queue.length) { board.cancel(`lab_${m.id}`); continue; }
    if (m.workBank >= (m.def.labour.bankSeconds ?? 120) - 1e-6) continue;
    if (board.get(`lab_${m.id}`)?.complete === false) continue;          // one open order per machine
    board.postJob({
      id: `lab_${m.id}`, tag: 'refine', stationId: m.id,
      name: `Work the ${m.name}`, units: 4, priority: 1, postedAt: at,
      meta: { machine: m.id, seconds: 4 * (m.def.labour.secondsPerUnit || 30) },
    });
  }
}
```

and the game layer, which already sweeps completed orders, credits it:

```js
for (const o of finished) if (o.meta?.machine) works.credit(o.meta.machine, o.units);
```

`works.credit(machineId, units)` adds `units × secondsPerUnit` to the bank, clamped.

Four units is **two minutes of furnace** per order, which is about **eight iron ingots** — a small
enough grain that a citizen's shift is a stream of completions rather than one, and large enough
that the board is not a thousand rows. Nothing else in `js/work.js` changes. All three sources
already work:

| Source | How | Already exists |
|---|---|---|
| **You** | stand at the machine, press `E`, `board.swing(id)` | `work.js:260`, wired at `main.js:2450` |
| **A citizen** | bound to `stationId`, `board.nextFor({ tags, stationId })` picks their own machine first | `colony.js:353`, `work.js:243` |
| **A machine** | `board.runMachines([tender])` — the Tender Arm, §3.6 | `work.js:284`, never called |

The `smelter` job's tags are already `["refine", "craft"]` (`data/colony.json`). The labour order's
tag is `refine`. **They already match.** That is how close this join has been all along.

### 3.4 What it feels like, end to end

A drill on an iron seam, a crate, a route (`mining.js autoRoute`), a furnace beside the crate, a
bunkhouse and a well thirty metres away, and Marwen Thorn recruited out of a village for 138 gold.
Bind her to the furnace. At seven she walks out of the bunkhouse, at 07:02 she reaches the furnace,
and from then until six she fills `lab_furnace1` over and over. **Twenty ingots by dusk, and you
were four kilometres away killing something.** At six the furnace goes cold and the panel says
*"Standing cold — nobody is working this."* Build a second bunkhouse, recruit a second smelter, and
run a night shift — which is the natural next question and §3.7 answers it.

### 3.5 How many machines one person can tend

`data/colony.json`'s jobs gain `tendMax`:

| job | `tendMax` | why |
|---|---|---|
| smelter | 3 | the furnace-minder is the archetype |
| carpenter | 3 | |
| labourer | 2 | |
| miner, cook, hauler, farmer | 1 | their work is elsewhere |
| guard | 0 | a guard stands a post (§8) |

`tendMax` does **not** multiply their output. A smelter bound to three furnaces still produces
10.6 units a day; the board hands them out oldest-first (`work.js:243`), so three furnaces each run
about a quarter of a shift. The panel states it in the only way that is honest:

> Marwen Thorn — smelter. 3 stations. **She keeps about 0.77 of a furnace lit; you have asked her to
> keep three.**

`colony.assign` refuses a fourth: *"Marwen already minds three. Somebody else will have to take
it."* The cap exists because a citizen bound to nine machines is a spreadsheet, not a person.

### 3.6 The Tender Arm — automation, through the third source that already exists

A new `refine`-category structure, and the answer to "I do not want to house forty people".

```json
{ "id": "tender_arm", "name": "Tender Arm", "cat": "refine", "tier": 2,
  "w": 1.2, "d": 1.2, "h": 2.6, "snap": "grid",
  "power": { "use": 8 },
  "tender": { "range": 6, "unitsPerHour": 12 },
  "cost": { "steel": 8, "parts": 4, "wire": 6 },
  "desc": "A jointed arm on a post. It works whatever bench it can reach, as long as the grid holds." }
```

The game layer builds one machine record per arm and hands them straight to `board.runMachines`:

```js
board.runMachines(build.entries
  .filter(e => build.defOf(e.key)?.tender && e.powered !== false)
  .map(e => ({ id: e.id, name: 'Tender Arm', stationId: nearestStationTo(e, 6), tags: ['refine'], unitsPerHour: 12 })),
  hoursThisTick);
```

12 units an hour is **360 seconds of machine per game hour**, which is 9.6× a machine hour — an arm
keeps ten benches lit around the clock for 8 kW. It is meant to be a big, expensive, late
convenience: steel, machine parts and wire, and it dies with the grid. `work.js:185 machineUnits`
already returns 0 for `powered: false`, which is the whole hook and it is already written.

### 3.7 Shifts, and why there is no night shift

There is not one, and there should not be. `data/colony.json`'s schedule is one shift, 7 to 18, and
`COLONY.md` §2 defends that as rudimentary-on-purpose. A second shift means a second schedule, a
second set of states and a roster that has to be read rather than glanced at. **The night answer is
the Tender Arm**, which is a thing you build with the metal your people smelted during the day, and
that is a better progression than a rota.

### 3.8 The tests this rule needs

`tests/labour.test.js`, node, no browser:

- a `furnace` with a queue, full inputs, fuel, and **no** worker completes **zero** batches in 600 s
  and ends in state `unworked`;
- …and its inputs are untouched — `stores.count(pool, 'iron_ore')` is exactly what it was;
- the same furnace, credited 10 units, completes **18 or 19** batches and then stops
  (`300 s / 16 s`, with the part-batch held);
- a citizen bound to it over one `colony.tick(24)` puts between 9.5 and 11.5 units in, and
  `order.ledger.citizen` carries all of them while `ledger.player` and `ledger.machine` are 0;
- a `sawmill` with `auto: true` and `grid.poweredOf() = 1` needs no worker; the same sawmill at
  `poweredOf() = 0` does;
- a `refinery` (`secondsPerUnit: 0`) is unaffected by any of this;
- `colony.assign` refuses a fourth station for a smelter, and the refusal names her.

---

## 4. Production does not stop when you leave

> "Production and manufacturing should continue even if you leave a planet."

`works.catchUp(seconds)` already exists (`refine.js:296`) and already slices correctly so a machine
can go running → starved → blocked inside the window in the right order. `colony.tick(hours)`
already steps in quarter-hours. `farm.tick`, `props.tickHarvest` and `tickNodes` all have their own
entry points. **What is missing is anything that remembers when a place was last simulated, and
anything that does it for a world you are not standing on.** `INDUSTRY.md` §7.3 asked for the call
and it is made today only for the world under your feet.

### 4.1 `js/outposts.js` — the register, and the clock attached to it

One module, the §0 contract plus a frozen industry record per outpost per world:

```js
const outposts = createOutposts({ saved: save?.outposts, data: civics });
outposts.rebuild(build.entries, build.defOf, { systemSeed, planetId, elapsed });
outposts.freeze(worldKey, { stores, grid, works, colony, board, farm, mining, at: state.elapsed });
outposts.thaw(worldKey);                  // -> the JSON blobs, or null for a world never settled
outposts.catchUp(worldKey, seconds, modules);   // -> a report (§4.4)
outposts.pending(nowElapsed, nowWallClock);     // -> [{ worldKey, seconds, why }]
```

`worldKey` is `` `${systemSeed}:${planetId}` `` — **two numbers, not one**, for the reason
`js/homes.js:58` gives in full: every system has a planet 2, and matching on `planetId` alone folds
you to the right coordinates on the wrong planet.

### 4.2 Where the timestamps live, and there are two of them

| Clock | Where | Written | Read |
|---|---|---|---|
| **In-session** | `outposts.record(worldKey).tickedAt`, in `state.elapsed` seconds | on `freeze`, and every 60 s while you are on that world | on landing, and on `M` → Your bases |
| **Wall clock** | `save.updated`, `Date.now()` ms | already, by `saves.write` (`save.js:65`) | once, at load |

Both go in the save. `save.js snapshot()` (line 93) gains **`outposts`** in its destructured
parameter list and in the returned object, **together, in the same edit** — the file's own comment
at line 96 records what happened the last time something was added to one and not the other
(`world`, `quests` and `campaign` were silently dropped, and every load emptied the quest log).

### 4.3 The sum, and the caps

```js
seconds = inSession + closed
inSession = max(0, state.elapsed − record.tickedAt)                  × rate.away        (1.00)
closed    = max(0, (Date.now() − save.updated) / 1000)               × rate.closed      (0.55)
seconds   = min(seconds, away.capSeconds)                                               (28800)
```

In `data/civics.json`:

```json
"away": {
  "rate": { "away": 1.0, "closed": 0.55 },
  "capSeconds": 28800,
  "mercyDays": 3,
  "sliceSeconds": 20
}
```

- **`rate.closed: 0.55`** so leaving the game running is not straightforwardly better than closing
  it, and closing it is not straightforwardly better than playing. It is a fudge and it is an honest
  one; state it in the away card.
- **`capSeconds: 28800`** is eight real hours of simulation, which at `dayLengthSeconds: 900` is
  **32 game days**. A wall-clock absence of 14.5 real hours reaches the cap. A week away and a day
  away come back to the same place, and the card says *"capped at 32 days"* rather than pretending.
- **The real cap is the crate.** `works.catchUp` runs the actual machines against the actual pool,
  so a furnace with 40 iron ore in reach makes 20 ingots and then says *"Waiting for Iron Ore"*.
  **There is no branch anywhere in this design that invents an input**, which is why a week away
  cannot print infinite iron however the numbers are tuned. This is the argument for running the
  real modules forward rather than computing a rate × time, and it is the same argument
  `INDUSTRY.md` §3 makes for slicing `catchUp` in the first place.
- **`sliceSeconds: 20`** rather than `refine.js`'s default 5, because 28 800 s at a 5 s slice is
  5 760 iterations against the function's own `guard < 20000` — fine, but 20 s is 1 440 iterations
  and a machine still cannot skip a state transition at that grain. Pass it:
  `works.catchUp(seconds, { slice: civics.away.sliceSeconds })`.

### 4.4 What is caught up, in what order, and the one mercy

Order matters because each stage feeds the next. `outposts.catchUp` runs, in slices of
`sliceSeconds`:

1. `mining.tick(dt)` — drills dig, routes deliver. Ore arrives before anything wants it.
2. `grid.tick(dt)` — generators burn, batteries charge, the shedding ladder runs.
3. `farm.tick(dt / 3600)` — crops ripen and post `harvest` orders.
4. `colony.tick(dt / 3600)` — people wake, walk, fill orders (including `lab_*`), eat, sleep, pay.
5. `works.tick(dt)` — machines spend the bank the citizens just filled.
6. `props.tickHarvest(dt)` — trees grow back.

**The mercy, `away.mercyDays: 3`.** Hunger climbs normally for the first three game days of a
catch-up and then **holds at the `grumbling` rung (0.55)** for the rest of it. Nobody walks out
while you are off-world. The reason is exactly the reason `BUILDING_EXPANSION.md` §7.1 gives for
gating raids on defences: **losing your colony because you took a flight is a punishment for
playing.** You come back to a village that has downed tools, is paying you nothing and is furious,
which is a problem you can fix in an afternoon, and you are told about it in the first line of the
card. Citizens who were *already* at `leaving` when you left still leave — that one you were
warned about before you went.

### 4.5 "While you were away" — the card

`js/civics-ui.js` `showAwayCard(report)`, its own panel, **not** a modal that blocks the world. One
card, dismissed with `Esc` or a click, and repeated on demand from the Holding screen. Never shown
for an absence under one game day.

```
  GREENHOLLOW WORKS · 11 days and 4 hours    (capped at 32 days)

  Made            38 iron ingot · 22 plank · 9 keg of nails
  Ran out of      Iron Ore, on day 6. The furnace has been cold since.
  Delivered       410 iron ore along the Deep Cut route
  Your folk       6 here, 2 grumbling — the granary emptied on day 8
                  Marwen Thorn kept the furnace 71% lit
  Tax             318 gold                Wages  −96 gold   Rent  +154 gold
  Trade           the Ironmoor run arrived. 1,815 gold, less 12 upkeep.
  Nobody left.    Feed them and the grumbling stops.

  [ Go to the Holding ]   [ Dismiss ]
```

Every line is a diff `outposts.catchUp` collects as it runs — a before/after on the pool totals, the
colony's own `events` array (`colony.tick` already returns one), `works.completed`, the caravan
arrivals. **"Ran out of, and when"** is the most useful line on the card and costs one extra field:
record the elapsed at which any machine first entered `starved` or `unworked` during the window.

### 4.6 When it fires

| Moment | What runs |
|---|---|
| Landing on a world where you have an outpost | that world's catch-up, then the card |
| Loading a save | the wall-clock half for **every** world, then a card per outpost with anything to say (at most three; the rest fold into one line) |
| Opening the star chart's Your bases list | nothing — the list shows *estimated* production, marked as an estimate |
| `waypoints` travel within a world | nothing; you never left |

Deliberately **not** on a dungeon, a rest or a fast travel *on the same world* — those already call
`works.catchUp` for the live world (`INDUSTRY.md` §7.3) and doing it twice would double the output.
`outposts.pending()` returns only worlds whose `tickedAt` is behind, so the live world is never in
the list.

### 4.7 Tests

`tests/offline.test.js`, node:

- 8 game hours of `outposts.catchUp` and 8 game hours of frame ticks produce the same pool totals
  within **2%** (the slice grain is the whole difference);
- the cap holds: `catchUp(200000)` simulates exactly `capSeconds`;
- a furnace with 40 iron ore in the pool makes **20** ingots over 32 days and not 21;
- a colony with 6 citizens and 4 rations ends the window at `grumbling`, with **0 departed**, and
  `report.rungs.leaving` is 0;
- a citizen who was already `leaving` at freeze **is** gone at thaw;
- round trip: `freeze → toJSON → JSON.parse(JSON.stringify()) → load → thaw` gives an identical
  `works.snapshot()` for every machine.

---

## 5. Vendors move in

> "The town system should be similar to other games like Terraria with various vendors available."

The rule worth borrowing is not the shop; it is **the vendor is a person who decides to live at
your place because of something you did.** Farhold already has the two halves: `js/town.js` has
`ROLES`, `STOCK_BY_ROLE`, a shop with three categories and buyback, and `folk.spawnOne()` puts a
named body with a face at a coordinate (`main.js:3542`). What is missing is a reason for any of them
to be standing at *your* outpost.

No third-party names anywhere in the data or on screen. The list below is original.

### 5.1 The twelve

`data/civics.json` `vendors`. **Move-in** is checked once a game day and produces an **offer**,
never an arrival — the same rule `colony.rollMigration` (`colony.js:452`) already follows, for the
same reason: a mouth you did not agree to is a mouth you did not budget for.

| id | Name | Sells | Buys | Moves in when | Wants | Stands |
|---|---|---|---|---|---|---|
| `quartermaster` | Quartermaster | rations, rope, torches, bedrolls, seed | anything, at 40% | **2 citizens** and a free bed | comfort ≥ 0.15 | nearest free plot to the outpost centre |
| `forge_warden` | Forge-Warden | `STOCK_BY_ROLE.smith` — weapons, heavy armour | weapons, armour, scrap | a **furnace or smelter** standing, and 20 ingots smelted | comfort ≥ 0.30 | beside the hottest machine |
| `stonewright` | Stonewright | cut stone, brick, concrete, the groundwork pieces at −15% | rubble, stone, gravel | a **stonecutter**, and 40 cut stone made | comfort ≥ 0.20 | by the stonecutter |
| `apothecary` | Apothecary | reagents, salves, antidotes, coolant | sulphur, saltpetre, ash, reagent | a **chemical bench** | comfort ≥ 0.35 | a quiet plot, ≥ 12 m from any machine |
| `victualler` | Victualler | grain, cooked rations, seed, salt | crops, game meat, hide | **2 field plots** and a larder | comfort ≥ 0.25 | by the larder or the granary |
| `carter` | Carter | hand carts, pack mules, wagons, route upkeep | — | a **Trade Post** | comfort ≥ 0.20 | at the Trade Post door |
| `chandler` | Chandler | lamps, lanterns, lamp oil, candles, the five street lights | resin, tallow, wax | **4 citizens** and a lamp post lit | comfort ≥ 0.30 | on a lit street |
| `armiger` | Armiger | guard contracts (§8), turret parts, ammunition | broken gear | a **Watch Post** with a guard in it | comfort ≥ 0.25 | at the Watch Post; **this is who runs the muster (§9)** |
| `wright` | Wright | machine parts, wire, control boards, the Tender Arm | salvage, scrap plate | an **assembler** | comfort ≥ 0.40 | by the assembler |
| `factor` | Factor | **trade goods, at this place's price (§7.2)** | **trade goods** | a Trade Post **and** 400 gold of trade turned over | comfort ≥ 0.35 | at the Trade Post; keeps the price board |
| `drover` | Drover | mounts, pack mules, feed | — | a **stable** | comfort ≥ 0.20 | at the stable, outside the ring |
| `gambler` | Gambler | sealed crates (`town.js:90 CRATE_TIERS`) — **already built** | — | **6 citizens** and 1,000 gold spent here | comfort ≥ 0.30 | at the meeting hall |

Eleven new, one already in the game. `gambler` is listed because its move-in condition should be
brought under the same rule rather than staying a size check in `town.js:141 rosterFor`.

### 5.2 A vendor is not a worker

They occupy a bed, they eat, they pay **rent** instead of tax, and they put **zero** units on the
work board. `colony.newCitizen({ job: 'vendor' })` with a `vendor` job in `data/colony.json`:

```json
{ "key": "vendor", "name": "Trader", "tags": [], "unitsPerHour": 0, "mayBreakGround": false,
  "tendMax": 0, "rentPerDay": 14,
  "blurb": "Keeps a stall. Pays you rent, works for nobody." }
```

`tags: []` would mean "anything" to `work.js:193 tagsMatch`, so `colony._doWork` needs a one-line
guard: `if (!(job.unitsPerHour > 0)) { c.idleHours += dt; return; }`. **This is a real trap** — an
empty tag list is the "will do anything" signal everywhere else in the file, and a vendor who
quietly started smelting would be a very confusing bug.

### 5.3 Where they stand

Two cases, and they are not the same problem.

**In a generated town**, the plot already knows what it is for. `proctown/js/townplan.js:640`
assigns `want` from `WANT_ORDER` to the biggest third of the plots, and `js/town-plan.js:21
BUILDING_INFO` maps a building to a `role`. Two shared edits, flagged in §10 because
`proctown/` is imported by other pages:

```js
// proctown/js/townplan.js
WANT_ORDER = ['hall','forge','inn','market','tradepost','granary','chapel','stable',
              'warehouse','countinghouse','barracks','mill','watchpost','shrine'];
WANT_FROM  = { …, tradepost: 2, countinghouse: 4 };
```

```js
// js/town-plan.js BUILDING_INFO
tradepost:    { cap: 120, solid: [4.6, 5], from: 2, role: 'factor' },
countinghouse:{ cap: 80,  solid: [3.8, 7], from: 4, role: 'carter' },
market:       { …, role: 'quartermaster' },     // was 'merchant'
forge:        { …, role: 'forge_warden' },      // was 'smith'
barracks:     { …, role: 'armiger' },           // was 'guard'
```

`js/town.js rosterFor` then places a vendor **in** their building rather than in a ring, because
`features.js` already knows where every plot landed. The existing `merchant`/`smith`/`guard` roles
stay as aliases so no save and no test breaks.

**At your outpost** there is no plan. The vendor takes the free plot nearest the outpost centre, on
a ring of `12 + 3n` metres, exactly as `main.js:3542` already places a recruit around
`defence.spot()`. `folk.spawnOne({ groupId: 'vendors', role, roleName, name, x, z, greeting, seed })`
— the primitive is written, has a body and a face, and is used twice already.

### 5.4 The move-in check

```js
// js/vendors.js — pure
const vendors = createVendors({ data: civics, saved: save?.vendors });
vendors.check({ outpost, colony, housing, works, build, stores, gold, turnover, day, rng });
// -> { offer } | { blocked: [{ id, name, why }] } | null
vendors.accept(offerId, { colony, housing });
vendors.turnAway(offerId);
vendors.stock(vendorId, { level, day });     // restocks every `restockDays` (3)
```

Three gates, all three required, and the panel says **which one is short** — the same courtesy
`raid.js:96 tierFor` extends and for the same reason:

1. the condition (a machine standing, a count met, gold turned over);
2. **a free bed** whose `comfort` clears the vendor's `wants`;
3. no offer pending for that vendor, and none accepted.

*"A Forge-Warden would set up here, but the only free bed is a bedroll in the open. Put a roof and a
well over it."* That sentence is the whole housing system paying for itself.

### 5.5 What they sell, and why you would buy it

Their stock comes from `js/town.js`'s existing shop machinery — `STOCK_BY_ROLE`, `STOCK_COUNT`,
`createGearShop`, `folk.buy`/`folk.sell` — with one addition per vendor: a **materials shelf**
priced off `resources.json`'s own `value` field, at **2.2× value to buy from them** and **0.45×
value to sell to them**. Iron ore is `value: 2`, so a Quartermaster sells it at 4 and buys at 1.
That is `BUILDING_EXPANSION.md` §1.18's rule — *"buying raw stock from towns: always possible,
always the expensive route"* — as one multiplier pair rather than a table.

The Factor is the exception and §6/§7 are entirely about it.

### 5.6 Rent

In `collectTax` (`colony.js:403`), after the tax loop and before the gold is banked:

```js
for (const v of colony.citizens.filter(c => c.job === 'vendor')) {
  if (!v.home) continue;                                      // a vendor with no bed pays nothing
  gold += (jobBy('vendor').rentPerDay || 14) * prosperity;
}
```

14 gold a day × prosperity (1.00–1.50). Six vendors in a 30-structure outpost is **113 gold a day**,
against six citizens' tax of roughly 36. **Vendors are the better gold, and they cost you beds that
could have held workers.** That is the trade the housing screen has to show, and it does: beds
taken, split by workers and traders.

### 5.7 Where the player reads all this

The **Holding screen** (`js/civics-ui.js`, §10), opened with `K` or from the build panel's existing
Holding section (`main.js:2462`). Five tabs, one purpose each:

| Tab | Shows |
|---|---|
| **People** | the roster, with comfort, walk time, what they are tending, and their hunger rung |
| **Houses** | every house, its beds, its comfort and which utilities reach it; the free bed with the best comfort is marked |
| **Work** | the board — the existing section from `main.js:2434`, moved and given room, with the credit line |
| **Traders** | the twelve, in-residence first, each blocked one showing exactly what is short |
| **Trade** | the price board, the hold, and the routes (§7.3) |

`js/hud.js` is 3 026 lines and shared with nine other screens. **This screen must not go in it.**

### 5.8 Tests

`tests/vendors.test.js`, node: every vendor's move-in condition names a real structure id in
`data/structures.json` or a real recipe id in `data/refining.json` (the `tests/round13.test.js`
rule, applied sideways); a vendor never moves in without a free bed; a vendor with `comfort` below
their `wants` is blocked and the refusal names the comfort; rent is paid only by a housed vendor; a
vendor contributes exactly 0 to `board.summary().unitsLeft` over a simulated day.

---

## 6. Trade goods, and a hold that has a weight in it

> "I also picture some intermediate items that are stored in a weight-based inventory system to be
> used as trade goods, that can be bought or sold at different towns."

### 6.1 Why these are a third thing and not a fourth bag

Farhold already has three places to put something, each with one job, and the split is right:

| | Holds | Capped by | Where |
|---|---|---|---|
| `player.bag` | **items** — swords, rings, quivers | nothing | `js/rpg.js:472` |
| `craft.materials` | **materials** — ingots, planks, ore | **nothing, deliberately** | `js/craft.js:39` — *"materials are a currency, not luggage"* |
| `stores` pools | everything, at an outpost | `cap` per store, plus raw-share caps | `js/stores.js` |

A trade good is none of those. It is a **product**: made once, moved far, sold whole. It gets the
fourth container and the fourth container is the only one in the game with a **weight limit**,
because the weight limit is the entire reason trade is interesting. *How much can this cart carry*
is the question a trade run is made of.

### 6.2 The twenty-two goods — `data/tradegoods.json`

`weight` is kilograms on the same scale `data/resources.json` already uses (iron ore 1.0, stone
1.6). `base` is gold at a town with no opinion either way. `makes` is the machine and the inputs —
**every input id below is a material `data/resources.json` already produces**, which the test in
§6.8 asserts rather than trusts.

| id | Name | kg | base | Machine | From |
|---|---|---|---|---|---|
| `charcoal_sack` | Sack of Charcoal | 7 | 26 | workshop | `charcoal 20` |
| `salt_block` | Block of Salt | 8 | 22 | kiln | `salt 10` |
| `rope_coil` | Coil of Rope | 5 | 38 | loom | `rope 10` |
| `nail_keg` | Keg of Nails | 6 | 34 | workshop | `iron_ingot 4` |
| `brick_pallet` | Pallet of Brick | 18 | 40 | workshop | `brick 20` |
| `beam_bundle` | Bundle of Beams | 16 | 44 | sawmill | `beam 8` |
| `bolt_cloth` | Bolt of Cloth | 3 | 46 | loom | `cloth 8` |
| `soap_crate` | Crate of Soap | 6 | 48 | chemical_bench | `lye 4, resin 3` |
| `cured_hide` | Bale of Cured Hide | 5 | 52 | tannery | `leather 6, salt 2` |
| `cask_oil` | Cask of Lamp Oil | 9 | 58 | chemical_bench | `resin 6, water 4` |
| `ink_flask` | Flask of Ink | 2 | 64 | chemical_bench | `ash 4, resin 2, water 2` |
| `pressed_ration` | Crate of Pressed Rations | 10 | 70 | workshop | `ration 12, salt 2` |
| `wire_coil` | Coil of Wire | 4 | 88 | workshop | `wire 10` |
| `glass_ware` | Crate of Glassware | 7 | 96 | workshop | `glass 8, plank 2` |
| `ingot_bundle` | Bundle of Ingots | 14 | 120 | workshop | `iron_ingot 10` |
| `tool_chest` | Tool Chest | 11 | 140 | workshop | `iron_ingot 6, plank 6, leather 2` |
| `bearing_case` | Case of Bearings | 6 | 170 | manufactory | `machine_part 4, steel_ingot 2` |
| `silverware` | Case of Silverware | 4 | 240 | workshop | `silver_ingot 4, cloth 2` |
| `powder_keg` | Keg of Blasting Powder | 9 | 260 | chemical_bench | `blast_charge 2, saltpetre 6` |
| `medicine_chest` | Medicine Chest | 5 | 300 | workshop | `reagent 6, cloth 4, glass 2` |
| `lens_set` | Set of Ground Lenses | 3 | 320 | crystal_cutter | `lens 3` |
| `board_case` | Case of Control Boards | 4 | 420 | manufactory | `control_board 3` |

Each row also carries:

```json
{ "id": "ingot_bundle", "name": "Bundle of Ingots", "weight": 14, "base": 120, "stack": 12,
  "tags": ["metal", "building"], "kind": "trade", "tier": 1,
  "time": 20, "machine": "workshop", "inputs": { "iron_ingot": 10 },
  "desc": "Ten ingots strapped with wire. Half the world's building starts as one of these." }
```

`tags` is what a town wants or makes (§7.2). Eight tags, and no more, because a demand model with
twenty axes is unreadable: **`food`, `cloth`, `metal`, `building`, `tools`, `light`, `chemical`,
`fine`**.

### 6.3 Two new machines, and how the goods reach the existing engine

- **`workshop`** — tier 1. `speed 1.0`, `powerUse 4`, `unpoweredSpeed 0.5`, `labour.secondsPerUnit
  45`, `auto: true`. Build `{ plank 16, iron_ingot 6, rope 4 }`; the catalogue row is
  `{ plank: 16, iron: 6, rope: 4 }`, and `alignCatalogue` turns `iron` into `iron_ingot`.
  **Fourteen of the twenty-two goods are made here, which is the point: one cheap bench is the
  whole trade tier.**
- **`manufactory`** — tier 2. `speed 1.5`, `powerUse 26`, `needsPower: true`, no labour. Build
  `{ steel_ingot 18, machine_part 8, brick 16 }`; catalogue `{ steel: 18, parts: 8, brick: 16 }`.

The 22 recipes go into **`data/refining.json`'s existing `recipes` array**, not into
`tradegoods.json`. `js/refine.js` already queues, unlocks-by-doing, starves, slices and catches up;
a second recipe engine for trade goods would be the fourteenth join nobody made. `tradegoods.json`
carries what a *good* is — weight, price, tags — and a loader stitches the two:

```js
// js/trade.js, at boot
export function installTradeGoods(resources, refining, goods) {
  for (const g of goods.goods) {
    resources.materials[g.id] = { name: g.name, kind: 'trade', tier: g.tier,
                                  weight: g.weight, value: g.base, stack: g.stack, desc: g.desc };
    refining.recipes.push({ id: `make_${g.id}`, machine: g.machine, name: g.name,
                            time: g.time, inputs: g.inputs, outputs: { [g.id]: 1 },
                            unlock: g.unlock || null, desc: g.desc });
  }
}
```

**Injected at load, never written into the file.** That is the rule `RPG.md` established when
`items.json` turned out to be shared with Emberveil, and it applies here for the same reason:
`data/resources.json` is read by the scanner, the seam generator and the store-share caps, and
twenty-two manufactured goods have no business in any of them. `kind: 'trade'` keeps them out —
`stores.js` `RAW` (66) does not list it, so the raw-share caps skip them, and `accepts` (172) takes
them in a plain crate and refuses them in a silo.

### 6.4 One new store: the Trade Post

```json
{ "id": "trade_post", "name": "Trade Post", "cat": "store", "tier": 2,
  "w": 6, "d": 5, "h": 4.2, "snap": "grid", "flatten": "slab",
  "store": { "cap": 900, "linkRadius": 10, "accepts": ["trade"] },
  "hold": 2000,
  "cost": { "plank": 30, "beam": 8, "brick": 18, "iron": 6 },
  "desc": "Somewhere to keep what you have made until a cart comes for it. Trade goods only." }
```

`data/power.json` `storage` gains the matching `trade_vault` entry so `stores.js:76 defFor` finds
it. It is a store (so the workshop beside it delivers into it for free, like any pool), **and** it
is the only place a route can start or end (§7.3), **and** it is what the Factor and the Carter
move in for (§5.1).

### 6.5 The hold — `js/hold.js`

```js
import { createHold } from './hold.js';
const hold = createHold({ goods: tradeGoods, capacity: 40 });
hold.capacity;                   // kg; recomputed when you mount or garage something
hold.load();                     // kg used
hold.room(goodId);               // how many more fit
hold.put(goodId, n);             // -> how many actually fitted; never over
hold.take(goodId, n);            // -> how many it found
hold.rows();                     // [{ id, name, n, kg, each, value }] for the panel
hold.toJSON() / hold.load(json)
```

Pure, no DOM, thirty lines of arithmetic, and it is the **only** capped container in the game.

**Capacity**, from `data/routes.json`:

| Carrying it | kg |
|---|---|
| On your back | **40** — the same number `resources.json haul.carry` already uses |
| …with a pack on a mount | 40 + **120** |
| Hand Cart, led | **160** |
| Pack Mule, led | **260** |
| Covered Wagon, driven | **620** |
| Motorcycle / Car / Truck | +30 / +140 / **+900** |
| A Trade Post | **2 000**, and it is not carried anywhere |

There is **no encumbrance**. Going over the limit is impossible rather than slow: `hold.put`
returns what fitted and the panel says *"The cart is full. 3 of 7 went in."* The user's own note on
this kind of thing stands — *"no need to penalize"* — and a speed penalty here would fight
`INDUSTRY.md` §1's `walkSpeedFor`, which already slows you by the **materials** you carry and is a
different, older lesson.

### 6.6 Where the hold sits in the interface

- A **Hold** row on the Trade tab of the Holding screen: a weight bar, the rows, and a
  *Move to the Trade Post* / *Take from the Trade Post* pair when you are standing at one.
- One **compact readout on the HUD**, and only when the hold is not empty: `▮▮▮▮▯ 118 / 160 kg`,
  bottom-left above the material tally. This is the one edit to `js/hud.js` in this round
  (§10) and it should be four lines.
- Trade goods **never** appear in the item bag or in the materials panel. If they do, the split in
  §6.1 has failed and the bug will be "I sold my bundle of ingots to the smith by accident".

### 6.7 Make it or buy it — both, and the numbers say which

This is the sentence the user asked for:

> "This would also allow the player to manufacture items and sell them via trade routes, or buy
> intermediate products from existing towns instead of setting up a supply route."

Both routes must be live. Eleven `ingot_bundle` (base 120), which is one hand-cart load:

| | Cost | Time | Needs |
|---|---|---|---|
| **Buy** at a metal town | 11 × 82 = **902 gold** | as long as it takes to walk in | gold |
| **Make** | 220 iron ore + 33 minutes of furnace + 4 minutes of workshop | **37 real minutes of machine**, unattended | a drill, a route, a furnace, a workshop, and somebody to work them |

The ore is worth 440 gold at a vendor's buy price, so making is roughly **half the gold and all of
the time**. That is the right shape: **buying is the shortcut you take when you have gold and no
infrastructure, and making is what the infrastructure is for.** Neither is a trap, and a player who
never builds a workshop can still run a profitable cart — which matters, because the trade loop
should be reachable on the first afternoon.

### 6.8 Tests

`tests/tradegoods.test.js`, node:

- **every input of every good is a material the game produces** — it appears as an output of some
  recipe in `data/refining.json`, or as a `nodeKinds` yield in `data/resources.json`. This is
  `tests/industry.test.js` §3.20's "no recipe is a dead end" rule from the other side, and it is the
  rule `BUILD-MODE.md`'s round 13 was entirely about;
- every good has a positive `weight`, `base`, `time` and at least one tag, and every tag is one of
  the eight;
- every `machine` names a machine that exists in `data/refining.json` **and** has a structure with
  the same id in `data/structures.json` (the `BUILD-MODE.md` §14 rule);
- `installTradeGoods` is safe to run twice — the second call adds no duplicate recipe;
- `hold.put` past capacity returns the shortfall and leaves the load at or under capacity; `take`
  never goes negative; `put(id, 0)` is a no-op;
- weights and prices are monotone enough to be readable: no good under 30 gold weighs more than
  20 kg, and no good over 200 gold weighs more than 12 kg.

---

## 7. Trade routes: buy low a long way away

The inspiration named in the brief is the long-distance production-and-haulage loop — you dig and
make in one place, the value is somewhere else, and the road between them is the game. Farhold
already has most of the machinery and has never pointed it at a price.

`js/caravans.js` is **already** a caravan: a vehicle, some guards and a manifest, travelling a real
polyline between real settlements, with four states you can meet it in (trade, escort, rob, find the
wreck). `dispatch` (57), `update` (91), `escort` (136), `arrive` (145), `rob` (157). It has never
carried anything of the player's.

### 7.1 The shape of a route

A route is five decisions and then it goes away and does it.

```js
// js/trade.js
const trade = createTrade({ goods, routes: routesData, caravans, territory, standings, seed });
trade.markets(settlements, day);                  // price board for everywhere you have been
trade.quote({ good, fromId, toId, n });           // -> { buy, sell, gross, perKg, perHour }
trade.plan({ fromId, toId, carrier, manifest, guards });  // -> { ok, hours, metres, roadShare, upkeep, risk, why }
trade.open(plan);                                 // -> a caravan id; takes the goods and the gold
trade.list();                                     // every route of yours, with where it is
trade.collect(caravanId);                         // arrived: gold in, or the goods back
trade.close(caravanId);
```

`from` and `to` are each a **Trade Post you own** (§6.4) or a **settlement you have entered** — the
same discovery rule `js/waypoints.js` already uses, so a route can never be set to a town you have
only seen on the map.

### 7.2 What a thing is worth here — the price model

```
priceAt(good, place) = good.base × clamp(1 + 0.45·need − 0.35·makes + 0.18·drift, 0.55, 1.85)
```

| Term | 0..1 | From |
|---|---|---|
| `need` | does this place want this tag? | its size, biome and culture — §7.3 |
| `makes` | does this place produce this tag? | the `want` plots its own plan gave it (`townplan.js:640`) |
| `drift` | −1..1, a slow wobble | `hash(placeId, goodId, floor(day / 6))` |

Clamped to **0.55×–1.85×**, so the whole spread a player can ever see on one good is about
**3.4×** — enough to be worth a cart, never enough to be a slot machine. `drift` moves on a
**six-day** step, so a price board is worth re-reading about once a week and never mid-run.

The Factor's cut is **5% each way** (`routes.json spread: 0.05`) and standing moves it **±8%**:

```
youPay  = priceAt(g, from) × 1.05 × (1 − 0.08 × standing01)
youGet  = priceAt(g, to)   × 0.95 × (1 + 0.08 × standing01)
```

A place with no Factor and no market — a hamlet, your own outpost — trades at **base flat, with a
12% cut**, which is the "wandering merchant will take it off your hands" price and is deliberately
poor.

### 7.3 What a town wants, worked out from what it already is

No new authored data per settlement. Every input already exists on the node.

| Signal | Already on | Gives |
|---|---|---|
| the `want` list of its plots | `plan.plots[].want` (`townplan.js:640`) | `makes`: a `forge` makes `metal` and `tools`; a `mill` and a `granary` make `food`; a `tannery`/`loom` plot makes `cloth` |
| `node.biome` | `features.js:394` | `need`: a desert needs `food`; tundra needs `light` and `cloth`; a volcanic or crystal world needs `food` and `building` |
| `node.size` | same | a city (4–5) needs `fine` and `chemical`; a hamlet (0–1) needs `tools` and never `fine` |
| the holding faction | `territory.of(zoneId).holder` | a besieged or short zone needs `food` at +0.3, from the existing `hunger` incident (`caravans.js:165`) |
| `node.race` → culture | `cultureFor` (`townplan.js:141`) | dwarf makes `metal` and `building`; elf makes `fine` and `cloth`; orc needs `metal` and makes nothing |

Two lines of policy, and they carry the whole economy: **a place never both needs and makes the
same tag** (`makes` wins), and **`need` is capped at two tags** so no town wants everything.

### 7.4 A worked round trip, because a trade design with no numbers in it is a wish

Ironmoor, a dwarf town of size 3 with a forge and a mill — `makes: metal, building, food`,
`needs: cloth, chemical`. Greenhollow, a human village of size 2 with a granary and a loom —
`makes: food, cloth`, `needs: metal, tools`. **4.2 km apart on a road you have walked.**

| Leg | Good | kg | At the seller | At the buyer | Units in a hand cart |
|---|---|---|---|---|---|
| out | `ingot_bundle` (base 120) | 14 | Ironmoor `makes metal` → ×0.65 → 78, **you pay 82** | Greenhollow `needs metal` → ×1.45 → 174, **you get 165** | 160 / 14 = **11** |
| back | `bolt_cloth` (base 46) | 3 | Greenhollow `makes cloth` → ×0.65 → 30, **you pay 31** | Ironmoor `needs cloth` → ×1.45 → 67, **you get 63** | 160 / 3 = **53** |

```
out:   11 × (165 − 82)  =  913 gold
back:  53 × (63  − 31)  = 1696 gold
                  less 2 × 12 gold cart upkeep = −24
                                      ────────────────
                                      2 585 gold a round trip
```

A hand cart does 3.4 m/s; this road gives `roadShare 0.86`, so `3.4 × (1 + 0.6 × 0.86) = 5.15 m/s`,
and **4 200 / 5.15 = 816 seconds a leg, 27 real minutes for the round trip plus loading.**

**About 90 gold a real minute, unattended, once.** For scale: a recruit out of a village costs
`120 + 18 × citizens` (`colony.js:521`), so **one round trip pays for eight or nine people.** That
is the number that makes a colony possible, and it is why this section exists at all.

It is also deliberately better than a fight and deliberately worse than a dungeon, and it has a cost
a fight does not: you had to walk to Greenhollow once, you had to build a Trade Post, and the cart
can be taken off you.

### 7.5 The carriers — `data/routes.json`

| key | hold kg | m/s | upkeep a trip | guards | got by |
|---|---|---|---|---|---|
| `porter` | 40 | 2.6 | 6 gold | 0 | hired at any Trade Post, no build |
| `hand_cart` | 160 | 3.4 | 12 gold | 2 | built: `{ plank 12, iron_ingot 4, rope 2 }` — already in `power.json haulers` |
| `pack_mule` | 260 | 4.0 | 20 gold + `grain 4` | 2 | bought from a Drover, 240 gold |
| `covered_wagon` | 620 | 3.0 | 34 gold | 4 | built: `{ beam 10, plank 24, iron_ingot 8, cloth 6 }` |
| `hauler_drone` | 200 | 7.5 | 0 gold, **12 kW at the origin** | 0 | built: `{ machine_part 6, control_board 1, composite_plate 2 }` — already in `power.json` |

Three of the five are already in `data/power.json haulers` with these exact capacities and speeds.
**Do not invent a second haulage table.** `routes.json` adds `upkeep`, `guardsMax` and `hold` to the
rows that exist and adds the two that do not.

```
hours  = metres / (speed × (1 + 0.6 × roadShare)) / 3600
```

`roadShare` is `terrain.roadAt()` sampled every 40 m along the polyline and averaged, computed once
at dispatch and stored on the caravan. **This is the road payoff the user asked for** — *"should be
able to greatly improve that time by building roads"* — and it applies to a road you built with the
Road tool exactly as it applies to a world road, because `terrain.roadAt` does not care who painted
it. A player who lays road between their outpost and the nearest town cuts the trip by up to
**37%**, for `road_dirt` at a few cut stone a metre.

### 7.6 Risk, and a change `js/caravans.js` needs anyway

Today `caravans.js:119` ambushes **every** unescorted caravan, unconditionally, at
`0.6 + rng × 0.25` of the way along. That is right for flavour and wrong as a rule the player is
betting money on. Replace the certainty with a roll, made once at dispatch:

```js
ambushChance = clamp(0.34 × danger × (1 − 0.18 × guards) × (1 − 0.25 × escorted), 0.03, 0.70)
```

- `danger` 0..1 from the zone's level band and `territory.of(zone).claim` — a contested zone is
  worse, which gives the faction layer something to do with trade;
- each guard is **−18%**, up to the carrier's `guardsMax`, at **10 gold a guard a trip** (§8.6);
- a route you walk beside is **−25%**, and if you are within 400 m when it fires it is a fight
  rather than a wreck. That branch is already written (`caravans.js:123`).

A hand cart with 2 guards through a quiet zone: `0.34 × 0.35 × 0.64 = 7.6%`. Through a contested
one with none: `0.34 × 0.9 = 31%`. **Losing a full wagon is 620 kg of goods and it should hurt**,
which is why the wagon takes four guards and why the drone, which is faster than anything that
wants to rob it, takes none.

This change applies to the world's own caravans too, and improves them: a road with a caravan on it
stops being a road with a wreck on it.

### 7.7 Standing routes

A route with `repeat: true` re-dispatches on arrival, buying at the far end with the gold it just
made, as long as the manifest still clears at a profit. It stops itself and says why when:

- the good's price at the destination falls under the cost at the origin plus upkeep;
- the origin Trade Post is empty of the manifest and no workshop is making more;
- the carrier was robbed or wrecked;
- the grid at the origin cannot carry a drone.

**A standing route never spends gold you do not have and never reports a loss silently.** Each
completed trip appends a line to the Trade tab's ledger, and the away card (§4.5) folds them into
one sentence.

### 7.8 Tests

`tests/routes.test.js`, node:

- `hours` matches `metres / (speed × (1 + 0.6 × roadShare)) / 3600` for four carriers and three
  road shares;
- the Ironmoor/Greenhollow round trip in §7.4 comes out between 2 400 and 2 750 gold with the stated
  towns, goods and seed — **the worked example is a test**, so tuning either the model or the goods
  is visible;
- `priceAt` never leaves `[0.55, 1.85] × base` over 10 000 (place, good, day) triples;
- a place never both needs and makes the same tag;
- a robbed caravan pays nothing and the manifest is gone; an arrived one pays exactly `trade.quote`
  said it would;
- guards reduce the ambush roll monotonically and `guardsMax` is respected;
- a standing route with a destination price under cost stops after one trip and the reason names the
  good.

---

## 8. Guards

> "Station guards for defense and to help against the attack system."

`BUILDING_EXPANSION.md` §4e asked for "hired guards — spend gold instead of materials" and it was
never built. `colony.guards()` (`colony.js:224`) has counted citizens standing a watch since the
colony landed and **`COLONY.md`'s own wiring table still lists handing that number to the defence
count as owed.** `defence.baseOf()` (`defence.js:92`) hard-codes `citizens: 0`. This is the ninth
join.

### 8.1 A post is a structure; a guard is a person in it

| id | Name | slots | cost | note |
|---|---|---|---|---|
| `watch_post` | Watch Post | 2 | `{ timber: 12, iron: 4 }` | the cheapest defence in the game that thinks |
| `guard_tower` | Guard Tower | 3 | `{ block: 18, timber: 10, iron: 6 }` | 8 m tall; the guard on it has 4 m more reach |
| `gate_house` | Gate House | 2 | `{ block: 24, timber: 12, iron: 8 }` | a gate that is manned; raiders stop at it |

All three get a `post: { slots: n }` block, copied on to the entry by `buildplan.js:412` like every
other block. They are `cat: 'defence'` but **have no `defence` block**, so `defence.js:228` — which
gates on *the block, not the category*, for exactly this reason — correctly refuses to let them
snipe. A watch post is a place to stand, not a turret.

```js
colony.station(citizenId, postEntryId);   // -> { ok } | { ok: false, why }
colony.unstation(citizenId);
colony.stationed();                        // the count defence.js wants
```

Refusals, as sentences: *"Every slot in that tower is taken."* / *"Marwen minds the furnace. Somebody
has to."* / *"They have downed tools. Feed them and ask again."*

### 8.2 Two kinds of guard, and the difference is who they answer to

| | A **citizen** on `guard` duty | A **hired sword** posted (`js/hire.js`) |
|---|---|---|
| Gets there by | migration or recruiting (`colony.js:515`) | 180 gold up front at an Armiger or on the road |
| Costs | a bed, 2 rations a day, **8 gold a day** wages | **14 gold a day** retainer, no bed, no food |
| Pays tax | **no** — they are on the payroll | no |
| In a raid | a body at their post, `data/civics.json guard` block | the same body, at the `pet` stats `hire.js:63` already computes |
| Between raids | `watch` and `repair` orders (§8.4) | nothing. They stand there. |
| Can be | reassigned to any job | dismissed, and that is all |

A citizen guard is cheaper and wants a village around them; a hired sword is instant and never gets
hungry. That is the choice, and it is the same choice `BUILDING_EXPANSION.md` §4e set out.

### 8.3 Wages, in `collectTax`

`colony.js:403`, in the same pass as rent (§5.6):

```js
const wage = (jobBy('guard').wagePerDay || 8);
for (const c of colony.citizens) if (c.job === 'guard' && c.posted) gold -= wage;
```

Gold can go negative on the day and the return already carries the detail, so the log line is
honest: *"318 in tax, 154 in rent, 96 out in wages. 376 gold."* An outpost that cannot pay its
guards does not lose them immediately — they drop to `grumbling` mood after three unpaid days and
walk out on the seventh, with a warning on each.

### 8.4 What they do when nothing is attacking

The `guard` job's tags are already `["watch", "repair"]` in `data/colony.json` and **nothing in the
game has ever posted an order with either tag.** Two posters close that:

- **`repair`** — one order per damaged entry (`e.hp < e.maxHp`), `units = ceil(missing / 40)`,
  `out: { repair: entryId }`. This is what makes losing a raid recoverable without you: you come
  back to a fixed palisade. `raid.js:315 loseRaid` already returns `structuresBroken`.
- **`watch`** — one standing order per post, `units: Infinity` in effect (re-posted at 8 units).
  Filling it does nothing mechanical; it is what makes a guard's shift show in the ledger and the
  roster rather than reading as idle. **A standing order with no output is honest here and would be
  a lie anywhere else**, so it is marked `meta: { decorative: true }` and the Work tab does not list
  it.

While at least one guard is posted and fed, the outpost gets a **`watchBonus`**: wandering packs
(`js/actors.js` field spawns) do not spawn within `civics.guard.wardRadius` (90 m) of a post. Not a
combat effect — a spawn rule, so an unattended outpost stops being nibbled.

### 8.5 The raid join, which is three lines

```js
// js/defence.js baseOf(), line 92 — was `citizens: 0`
const posted = getColony?.()?.stationed?.() || 0;
return {
  structures: entries.length,
  defences: defences.length + posted,          // a guard is worth a turret
  citizens: getColony?.()?.citizens?.length || 0,
  throughput: getWorks?.()?.throughputPerMinute?.() || 0,
  waypoint: entries.some(e => e.waypoint),
  gold: 0,
};
```

`getColony` and `getWorks` come in as **getters**, not objects, for the reason the file states in
full at line 48: both are rebuilt when the player lands somewhere else, and capturing either by
value means holding a pointer to the last planet's colony.

The consequence is immediate and correct in both directions. `data/raids.json` gates the Warband at
`minDefence: 5`; **four guards and a bolt turret now qualify**, where before you needed five
turrets. And `notoriety.perCitizen: 1.2` and `perDefence: 1.5` finally get real numbers instead of
zeroes, so a village of twelve with a watch is noticed by the world — which is the correct reading
of `notorietyOf` and has never once fired.

During a raid, `defence.spawnWave` gains a companion, `defence.rally()`: every posted, fed guard
gets a body at their post via `folk.spawnOne`, with the stat block lifted out of `js/town.js:133`
into `data/civics.json` so a town guard and your guard are one table:

```json
"guard": { "hp": 260, "dmg": [14, 22], "armor": 22, "speed": 5.2, "reach": 3,
           "attackEvery": 1.2, "perLevel": 1.17, "towerReach": 7 }
```

A guard that falls is **knocked down, not killed** — they are back at their post the next morning at
half mood. Killing your own citizens by ringing a bell is the punishment-for-playing shape again,
and `COLONY.md` §4's rule already stands: *"Nobody ever starves to death: a dead citizen makes you
reload, a departed one makes you build a granary."*

### 8.6 Guards on a route

`route.guards` (§7.6), 0 to the carrier's `guardsMax`, **10 gold a guard a trip**. They are not
citizens and not hires — they are hired for the trip out of the Armiger's contract list, which is
why the Armiger is the vendor who unlocks them. Each is −18% ambush chance. A guard on a route that
is ambushed while you are not there rolls once against the raiders: `survive = guards / (guards +
2)`, so two guards save a cart 50% of the time and four save a wagon 67%.

### 8.7 Tests

`tests/guards.test.js`, node: `baseOf().defences` includes posted guards and excludes ones at
`downsTools` or `leaving`; wages leave the purse and a run of unpaid days produces a warning then a
departure; `station` refuses a full post, a bound tender and a downed-tools citizen, each with its
own sentence; a `repair` order exists for every damaged entry and for none of the whole ones; one
posted guard raises `notorietyOf` by exactly `perDefence + perCitizen`; a knocked-down guard is back
the next day.

---

## 9. The muster — the wave defence you ask for

> "Allow the town center to initiate wave defense minigames that reward loot or resources for
> victory, or just nothing if defeated besides death penalty if the player dies. No need to penalize
> for a minigame."

**`js/raid.js` is already this.** It is pure, it is 396 lines, it has four tiers, night and early
scaling, a guaranteed rare crate, a journal, and a single gate (`canFire`, line 209) that nothing
can spawn through. `BUILD-MODE.md` §16 wired it to an alarm bell at your own base. A second wave
system would be the fifteenth join nobody made and it would immediately drift.

So the muster is **four small edits to `js/raid.js`** and a board.

### 9.1 The four edits, in full

```js
// 1. raidOffer (raid.js:125) — take a tier by name instead of earning it
export function raidOffer({ …, forceTier = null, drill = false } = {}) {
  const tiers = (data || FALLBACK).tiers;
  let tier, notoriety, why;
  if (forceTier) {
    tier = tiers.find(t => t.key === forceTier) || null;
    notoriety = notorietyOf(base, D);
    why = tier ? null : 'No such muster.';
  } else ({ tier, notoriety, why } = tierFor({ base, data: D }));
  …
  return { …, drill: !!drill };            // 2. carried on the quest
}

// 3. loseRaid (raid.js:307) — a drill costs nothing at all
export function loseRaid(quest, { base = {}, materials = 0, data = null } = {}) {
  if (!quest) return { ok: false };
  quest.state = 'lost'; quest.done = true;
  if (quest.drill) return {
    ok: true, quest, structuresBroken: 0, materialsTaken: 0, citizensLeave: 0,
    line: 'They got through. Nothing is broken and nothing is missing — it was a drill.',
  };
  … the existing loss, unchanged …
}

// 4. raidRewards (raid.js:330) — a drill pays goods, not reputation
//    the rare-crate floor at line 338 is UNCHANGED and still asserted
return {
  gold: Math.round(base * nightGold * earlyGold * (quest.drill ? 0.6 : 1)),
  xp: …,
  standing: quest.drill ? 0 : (quest.reward?.standing || 0),
  spoils: quest.drill ? rollSpoils(quest, rng, D) : null,
  crates, blueprints, night, early, line,
};
```

`canFire`, `acceptRaid`, `beginRaid`, `currentWave`, `waveSpawns`, `onRaiderKilled`, `clearWave`,
`RaidBook`, `defence.spawnWave` and `defence.tick` are **untouched**. A drill is an ordinary raid
with a flag, which means every rule the raid already keeps — nothing spawns before the bell, night
is harder and pays more, the rare crate is a floor and not a roll — keeps itself for free.

### 9.2 Where you start one

Two places, and both are things that already exist on the ground.

- **A town's notice board.** `BUILDING_INFO.noticeboard` is already in `js/town-plan.js:56` — *"the
  town's notice board, a real object you walk up to"* — and every settlement of size 1 and up has
  one. `E` on it opens the muster board. Flavour: the town is paying you to help them run a drill,
  which is why the spoils are materials out of their stores rather than standing.
- **A Muster Stone** at your own outpost:

```json
{ "id": "muster_stone", "name": "Muster Stone", "cat": "defence", "tier": 1,
  "w": 1.6, "d": 1.6, "h": 2.0, "snap": "grid", "hp": 600,
  "muster": true,
  "cost": { "block": 14, "iron": 4 },
  "desc": "A stone you strike to call a drill. Nothing comes until you strike it." }
```

The existing `alarm_bell` stays what it is — that is the **real** raid, the one that pays standing
and can cost you a wall. The stone is the drill. Two objects, two meanings, and the panel says which
is which every time.

### 9.3 The board

Four ranks, the same four `data/raids.json` already describes, always listed, each greyed with its
reason if it is on cooldown or out of your depth.

| Rank | Tier | Waves | Level | Cooldown | Gold | Spoils |
|---|---|---|---|---|---|---|
| 1 | Prowlers at the Fence | 3 | −1 | 12 h | 48–96 | `iron_ingot 4–8`, `plank 6–12` |
| 2 | The Warband | 4 | 0 | 18 h | 108–204 | `steel_ingot 4–7`, `brick 10–18`, `machine_part 1–2` |
| 3 | The Siege | 5 | +1 | 24 h | 228–420 | `steel_ingot 10–16`, `machine_part 4–7`, `wire 8–14` |
| 4 | The Reckoning | 7 | +2 | 36 h | 480–900 | `steel_ingot 20–34`, `machine_part 8–14`, `control_board 1–3` |

Gold is the tier's existing range × 0.6. **Spoils are a new `spoils` block per tier in
`data/raids.json`** and are delivered into the nearest store pool, or into `craft.materials` if
there is none within 60 m. Crates keep the tier's existing `crates` list and the rare floor holds
(`raid.js:338`), which is the whole "reward loot **or** resources" of the request: you get both, and
the crate is the loot.

**Cooldown is per rank, per place**, in `data/civics.json muster.cooldownHours`. It exists so the
muster is a thing you do when you want a fight, not a gold tap you farm; and it is per-rank so
clearing rank 4 does not lock out rank 1.

### 9.4 Scaling, which needs no new code

`waveSpawns` (`raid.js:266`) already scales off `base.defences` and the player's level:

```
hp  = (1 + (level − 1) × 0.06) × clamp(1 + defences × 0.02, 1, 1.6) × (night ? 1.2 : 1)
dmg = (1 + (level − 1) × 0.05) × (night ? 1.15 : 1)
```

For a muster **at your outpost**, `base` is `defence.baseOf()` — including the guards §8.5 just
added. For a muster **at a town**, the board builds the same shape out of the town:

```js
base = { structures: plan.plots.length,
         defences: townGuards.length + (plan.wall ? 6 : 0),
         citizens: HEADCOUNT[node.size], waypoint: true, gold: 0 };
```

So a walled city of size 5 musters a harder rank 3 than a hamlet does, using arithmetic that is
already written and already tested. And the town's **own guards fight** — `js/town.js` spawns them
with the `GUARD` block and `js/actors.js` already knows how to make them swing at something — which
is what makes a city muster feel different rather than just bigger.

### 9.5 Losing, and the exact shape of "no penalty"

A drill ends in defeat when **either**:

- the player dies — the ordinary death penalty applies, whatever `js/rpg.js` does, and **nothing is
  added on top**; or
- the player is more than `muster.leashMetres` (300 m) from the muster point for 45 continuous
  seconds — you walked away, so it ends.

Then: raiders on the field despawn over 6 seconds, `loseRaid` returns its zeros, the `RaidBook`
records it as a drill that did not hold, the cooldown for that rank starts anyway, and the log says
one sentence. **No structures broken. No materials taken. No citizen leaves. No standing lost. No
gold lost. No repair bill.** The only thing you are out is the time and the cooldown, which is what
the user asked for and which is also the only version of this that people will actually press.

> The thing to be careful of in implementation: `main.js` currently routes a wave loss through
> `defence.lost({ materials })` and then applies the result. That call site must read
> `outcome.structuresBroken` and friends rather than re-deriving the loss from `raidData.loss` — if
> any of it is computed at the call site instead of in `loseRaid`, the drill flag will be bypassed
> and a minigame will start eating walls.

### 9.6 Tests

`tests/muster.test.js`, node:

- a lost drill returns `structuresBroken: 0, materialsTaken: 0, citizensLeave: 0` at every one of the
  four tiers, and a lost **raid** at the same tier returns the ordinary non-zero loss;
- a won drill pays crates with the rare floor intact, `standing: 0`, and spoils inside the tier's
  stated ranges over 500 rolls;
- `canFire` still refuses a drill that was offered and not accepted, and `beginRaid` still refuses
  before acceptance — **the gate that makes raids not a burden must survive this round**;
- `forceTier` with an unknown key returns `{ tier: null }` and a sentence, and never falls through to
  `tierFor`;
- the cooldown is per rank and per place: clearing rank 1 at Ironmoor leaves rank 2 at Ironmoor and
  rank 1 at your outpost both available;
- a town-shaped `base` at size 5 produces a strictly higher `hpMultiplier` than the same rank at
  size 1.

`tests/civilization.spec.js` (Playwright) drives one end to end: walk to a notice board, open the
board, take rank 1, ring it, kill the wave with `farhold` helpers, and assert the spoils landed in
the materials bag and `farhold.build.entries.length` is unchanged.

---

## 10. Every file, new and changed

### 10.1 New modules — all pure, none imports Three.js or touches the DOM

| File | Why it exists |
|---|---|
| `js/outposts.js` | the register of every cluster of your structures on every world, and the catch-up clock attached to each (§0, §4) |
| `js/housing.js` | houses, utilities, comfort, and which bed a citizen sleeps in (§2) |
| `js/vendors.js` | the twelve, their move-in conditions, their rent, their stock cycle (§5) |
| `js/hold.js` | the one weight-capped container in the game (§6.5) |
| `js/trade.js` | town prices, `installTradeGoods`, the route planner, and the bridge into `js/caravans.js` (§6.3, §7) |
| `js/muster.js` | the drill board — a thin wrapper over `js/raid.js`, not a second wave system (§9) |

### 10.2 New interface — deliberately its own file

| File | Why |
|---|---|
| `js/civics-ui.js` | the Holding screen: People, Houses, Work, Traders, Trade. Plus `showAwayCard()`. **`js/hud.js` is 3 026 lines and shared with nine screens; this must not go in it.** |
| `civics.css` | standalone stylesheet, per the house rule on inline CSS |

### 10.3 New data

| File | Why |
|---|---|
| `data/civics.json` | one knob file: housing comfort, utility radii, the `away` block, vendors, guard wages and stats, muster cooldowns and leash. The `guard` stat block moves here out of `js/town.js:133` so towns and your outpost read one table. |
| `data/tradegoods.json` | the 22 goods — weight, base price, tags, and the recipe that makes each (§6.2) |
| `data/routes.json` | carriers (hold, speed, upkeep, guard slots), the road bonus, the ambush table, the Factor's cut (§7.5) |

### 10.4 Changed files, one line of reason each

| File | Change |
|---|---|
| `js/colony.js` | housing, station binding, `travelHoursOf`, wages, rent, `tendMax`, the `trade`/`comfort` appeal terms — §2.5 lists the eleven functions exactly |
| `data/colony.json` | `wagePerDay`, `tendMax` and `rentPerDay` on the jobs; the `vendor` job; the rebalanced appeal weights |
| `js/refine.js` | the labour gate in `step` (194), `m.workBank`, `credit()`, `postLabour()`, the `unworked` state and its sentence, `slice` from `civics.away` (§3.2) |
| `data/refining.json` | a `labour` block on every machine; the `workshop` and `manufactory` machines; 22 trade-good recipes appended (§6.3) |
| `data/structures.json` | six houses, eight utilities, three posts, the Trade Post, the Tender Arm, the Muster Stone, the workshop and the manufactory — **every cost in words the game already produces** |
| `data/power.json` | the `trade_vault` storage row, so `stores.js defFor` finds the Trade Post's cap |
| `data/raids.json` | a `spoils` block per tier, and a `muster` block (§9.3) |
| `js/buildplan.js` | `home`, `utility`, `post`, `tender`, `muster` and `store` blocks copied on to the entry in `place()` (412), beside `waypoint`/`run`/`gate`; the claim refusal at 358 is the other round's |
| `js/build-ui.js` | a **Housing** and a **Trade** category in the catalogue; the Holding section (`main.js:2462`) becomes a button that opens the new screen |
| `js/stores.js` | `kind: 'trade'` passes `accepts`; the union-find at 99 lifted into a shared helper `js/outposts.js` can reuse |
| `js/defence.js` | `baseOf()` reads `colony.stationed()` and `colony.citizens.length` through getters (§8.5); `rally()`; `muster()` |
| `js/raid.js` | `forceTier`, `drill`, the zeroed loss, the spoils roll — **four edits, quoted in full in §9.1, and nothing else** |
| `js/caravans.js` | `dispatch({ owner, manifest, carrier, guards })`; the unconditional ambush at 119 becomes a roll (§7.6); `arrive` pays a player manifest out |
| `js/town.js` | the eleven new vendor roles and their stock; the materials shelf at 2.2×/0.45× value; the `GUARD` block moves to `data/civics.json`; `rosterFor` places a vendor in their building |
| `js/town-plan.js` | `BUILDING_INFO` gains `tradepost` and `countinghouse` and the new `role` names, with the old ones kept as aliases |
| **`proctown/js/townplan.js`** | **SHARED** — `WANT_ORDER` and `WANT_FROM` gain `tradepost` and `countinghouse`. `proctown/tests/townplan.test.js` runs 7 cultures × 11 seeds × 6 sizes and `overlaps()` must still read zero. Two data lines, no logic. |
| `js/save.js` | `outposts`, `hold`, `vendors`, `routes`, `housing` added to `snapshot()`'s parameter list **and** its returned object, in the same edit — the file's own comment at line 96 explains why |
| **`js/main.js`** | **6 308 lines, shared.** Wiring only: construct the six modules beside the existing block at 1666–1840; `outposts.rebuild` on every build change; `works.postLabour(board)` and the credit sweep in the tick; the catch-up and away card on landing and load; `K` opens the Holding screen; `E` on a notice board or muster stone; five new getters on `window.farhold` for the specs |
| **`js/hud.js`** | **3 026 lines, shared.** One change: the hold weight readout (§6.6), four lines, shown only when the hold is not empty |
| `js/actors.js` | a citizen's body stands at their station while `working` and at their house while `asleep` — `COLONY.md`'s wiring table has asked for this since the colony landed, and §2.4 finally gives both coordinates |

### 10.5 What is deliberately not touched

`js/work.js` (the unit is right; this round only uses it), `js/craft.js` (materials stay uncapped
and separate), `js/haulpath.js` and `js/mining.js` (drill routes are a solved problem; §7 must not
become a second one), `js/homes.js` (the per-world filing already works and §0 reuses its
`sameWorld`), `data/items.json` (**shared with Emberveil, which has its own affix registry and a
test that every affix in it resolves**), and `prototypes/emberveil/js/loot.js` (shared; `rpg.price`
already honours `item.basePrice` locally and the shared file is left alone).

---

## 11. The work, in eight phases

Each phase ships on its own, is playable on its own, and has its own tests. Anything touching
`js/main.js` or `js/hud.js` is marked **[shared]** — those two files are 6 308 and 3 026 lines and
carry every other screen in the game.

### Phase 1 — Housing and utilities
`js/housing.js`, the six houses and eight utilities in `data/structures.json`, comfort, the bed
binding, the real walk time, the appeal rebalance. `js/colony.js` extended per §2.5.
**[shared]** `js/main.js`: `housing.rebuild` on build change; `colony.stationAt`.
Tests: `tests/housing.test.js` — every house def has `home.beds` and a producible cost; comfort is
the sum of distinct kinds; a citizen takes the nearest free bed; walk hours match
`metres / 3000` clamped to `[0.02, 2]`; `setBeds(n)` still behaves for `tests/colony.test.js`.
**Playable after this phase:** you build a village and it visibly matters where you put the well.

### Phase 2 — Work runs the machines
The `labour` block, `m.workBank`, `postLabour`, `credit`, the `unworked` state, `tendMax`, the
Tender Arm. **This is the phase the user actually asked for and it should ship second, not eighth.**
**[shared]** `js/main.js`: `works.postLabour(board)` in the tick and the credit sweep.
Tests: `tests/labour.test.js`, the seven cases in §3.8.
**Playable after this phase:** ore comes in on a route, Marwen smelts it while you are away for the
afternoon, and the furnace goes cold at six.

### Phase 3 — Outposts and offline production
`js/outposts.js`, the freeze/thaw, the catch-up, the caps, the mercy, the away card.
**[shared]** `js/main.js`: the register, the landing hook, the load hook. `js/save.js`.
Tests: `tests/offline.test.js`, the six cases in §4.7, plus a round trip through `JSON.stringify`.
**Depends on:** Phase 2, or there is nothing interesting to catch up.
**Coordinate with:** the claim-stone removal. §0 is the shared contract and this phase is where it
lands.

### Phase 4 — Trade goods and the hold
`data/tradegoods.json`, `installTradeGoods`, the workshop and manufactory, the Trade Post,
`js/hold.js`.
**[shared]** `js/hud.js`: the weight readout, four lines.
Tests: `tests/tradegoods.test.js`, the six cases in §6.8 — the first of which is the one that
matters, and it is the same rule round 13 was about.
**Playable after this phase:** you can make a keg of nails and carry sixteen of them.

### Phase 5 — Vendors
`js/vendors.js`, `js/civics-ui.js` + `civics.css` (all five tabs, since the screen has to exist
anyway), the town-side role mapping, the two shared `proctown` data lines, rent.
**[shared]** `js/main.js`: `K`, the daily check, `folk.spawnOne` for an accepted offer.
Tests: `tests/vendors.test.js` (§5.8) plus `proctown/tests/townplan.test.js` still at zero overlaps.
**Depends on:** Phase 1 — a vendor needs a comfortable bed to want.

### Phase 6 — Trade routes
`js/trade.js`, `data/routes.json`, the price model, the route board on the Trade tab, the
`js/caravans.js` changes, standing routes.
**[shared]** `js/main.js`: `trade` construction, the arrival sweep, the route markers on the map
(`js/markers.js` already files a pin per world and needs no change).
Tests: `tests/routes.test.js` (§7.8). **The §7.4 worked example is one of them.**
**Depends on:** Phase 4.
**Playable after this phase:** the loop closes. A cart pays for a recruit, who works a furnace, whose
output fills the next cart.

### Phase 7 — Guards
The three posts, `colony.station`, wages, the `watch`/`repair` posters, the ward radius, the
`defence.baseOf` join, `rally()`, route guards.
**[shared]** `js/main.js`: `defence` gets its two getters; the Armiger's contract list.
Tests: `tests/guards.test.js` (§8.7).
**Depends on:** Phase 1 (a guard is a housed citizen) and Phase 6 for the route half.

### Phase 8 — The muster
The four `js/raid.js` edits, `js/muster.js`, the spoils tables, the Muster Stone, the notice-board
entry point, the leash, the cooldowns.
**[shared]** `js/main.js`: `E` on a notice board or a muster stone; **and the loss call site must be
audited per the warning in §9.5.**
Tests: `tests/muster.test.js` (§9.6) and `tests/civilization.spec.js` end to end.
**Depends on:** Phase 7, so a town's guards and yours fight with one stat block.

### 11.1 What must still pass at the end of every phase

`npm run test:unit` — **1 117 node tests** — and `npx playwright test prototypes/farhold/tests/` —
**108 page tests**. Two in particular are load-bearing for this round and must not be weakened to
make it fit:

- `tests/industry.test.js` §3.20, "no recipe is a dead end". §6.2's goods are new outputs and every
  one of them has to be consumed by a build cost, a recipe, a stated goal — **or be a trade good,
  which is a new legitimate terminus and the test needs one new clause, not a suppression.**
- `tests/round13.test.js`, "every build cost must be something the game actually produces". Forty
  new catalogue rows go in this round. **Every single one of them goes through `MATERIAL_ALIASES`,
  and none invents a word.**

---

## 12. What this round deliberately does not do

Each of these was considered and left out, with the reason, so re-opening one needs an argument
rather than an oversight.

- **No second shift and no rota.** §3.7. The night answer is the Tender Arm, which is something you
  build out of what your people made by day.
- **No encumbrance.** §6.5. The hold is a hard cap, not a slow-down. `walkSpeedFor` already teaches
  weight, once, in `INDUSTRY.md` §1.
- **No house interiors, no room quality, no furniture requirements.** §2.6.
- **No belts, no pipes, no logistics graph.** `INDUSTRY.md` §6 chose pools over belts on purpose and
  §7 is pools at continental scale, not a second network.
- **No stock market, no per-good supply curve you can crash.** §7.2's drift moves on a six-day step
  inside a fixed clamp. A price board you can break by selling into it is a different game.
- **No citizens who can die.** §8.5. A knocked-down guard is back the next morning.
- **No raid that fires on its own.** `raid.js:209 canFire` survives this round unchanged, and §9's
  muster is an additional thing you choose, never a thing that happens to you.
- **No new vehicle physics.** The carriers in §7.5 are rows in a table; a caravan is a position and
  a clock (`caravans.js:16`) until you are near it, and it stays that way.
- **Not wired to Emberveil.** `data/items.json` and `prototypes/emberveil/js/loot.js` are shared and
  are not touched. Trade goods are a Farhold concept and live in a Farhold file.

### 12.1 Two things this round makes newly possible that it does not build

Written down so they are not lost:

- **A town that runs out.** `need` and `makes` (§7.3) are computed from what a settlement is, and a
  settlement's stores are not modelled. A place you sell forty bundles of ingots to keeps paying the
  same price for the forty-first. Giving a town a real stock would make routes wear out, which is
  interesting and is a round of its own.
- **An outpost that trades with your other outpost.** §7.1 allows it — both ends can be Trade Posts
  you own — but there is no price difference between two places you own, so it is a haulage route
  with no profit in it. That is correct today, and the moment a good is hard to make on one world
  and easy on another (`universe/`'s rare elements already work exactly like that) it becomes the
  most interesting route in the game.
