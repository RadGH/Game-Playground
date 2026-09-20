# Farhold — the Civilization Expansion

*Houses, workers, vendors, trade goods, guards and the muster.*

Design: `research/civilization-expansion.md` (1 748 lines, 13 sections). This file is what was
actually built, where it lives, and the handful of places the code disagreed with the design and
won. The wiring into `js/main.js`, `js/hud.js` and `js/town.js` is written out as a copy-pasteable
patch in **`research/round14-civ-handoff.md`** and has not been applied — three agents were in those
files at once.

---

## 0. The pitch, in one sentence

**Ore goes to a town, a person who lives there smelts it, what comes out is worth more somewhere
else, and a cart takes it there while you are asleep.**

Farhold already had both halves of that and they had never been introduced. `INDUSTRY.md` built a
materials chain from a seam to a control board; `COLONY.md` built people who turn hours into work
units. A furnace ran on a timer and did not care that anybody lived here, and nothing a citizen had
ever done made a single ingot. This round makes the citizen the reason the furnace runs, gives what
the furnace makes somewhere to go, and gives the player two honest ways to get a trade good — **make
it slowly and cheaply, or buy it instantly and dearly.**

---

## 1. Work runs the machines — `js/refine.js`, `data/refining.json`

> *"The goal being that you can have ore sent to a town and have an NPC run the furnace to smelt it
> automatically, consuming work."*

**One work unit buys thirty seconds of a tended machine's running time.** That number lives in
`data/colony.json` `labour` and nowhere else. `js/work.js` deliberately says nothing about what a
unit buys — that is the caller's business, and it is why the unit is interchangeable between your
arm, a citizen's shift and a machine — so this round is the first time anything has fixed the
exchange rate.

The arithmetic that makes thirty the right number, in the game's own clock (`dayLengthSeconds: 900`,
so a game hour is 37.5 real seconds and the 7-to-18 shift is 412 real seconds):

| | |
|---|---|
| A smelter, content, mood 0.7, skill 1.0 | `1.1 × 0.88 × 11 h` = **10.6 units a day** |
| …which is | `10.6 × 30` = **319 seconds** of machine time |
| …out of a 412-second working day | the furnace is lit for **77% of the shift**, dark all night |
| A `smelt_iron` batch is `time: 16` | **about 20 iron ingots a day, per person** |

**One worker is one furnace.** Two furnaces and one smelter is two half-lit furnaces, and the Work
tab says so in those words.

### Which machines want a person

`data/refining.json` gains a `labour` block per machine. No block at all means "needs nobody".

| Machines | `secondsPerUnit` | `auto` | Why |
|---|---|---|---|
| campfire, furnace, kiln | 30 | false | tier 0 — somebody stands at it. **This is the user's furnace.** |
| sawmill, stonecutter, tannery, loom, chemical_bench, **workshop** | 45 | **true** | tier 1 — a pair of hands turns it, and power turns it for you |
| smelter, alloy_forge, crusher, washer, refinery, assembler, crystal_cutter, fuel_synthesiser, **manufactory** | — | — | power is the whole cost and always was |

`auto: true` means the machine pays its own labour **whenever the grid is actually carrying it**
(`grid.poweredOf(id) >= 0.05`). A sawmill that has never seen a wire runs at `unpoweredSpeed: 0.35`
*and* wants a person; wire it up and it wants neither. That is precisely the promotion
`INDUSTRY.md` §1 makes of the drill, applied to a bench.

### How it is enforced, and the ordering that matters

`js/refine.js` gains `m.workBank` (seconds, capped at `bankSeconds: 120`), and inside `step()` the
check sits **above the input take**, for the same reason the coolant check does:

> a machine that has already eaten two iron ore cannot then be told nobody was there to do it.

A machine that runs out mid-batch keeps its progress *and* its inputs and stops. When somebody turns
up it carries on. The badge reads **"Standing cold — nobody is working this."**

### How units get in: the board, and not a new path

`works.postLabour(board)` puts at most **one** open order per machine on the ordinary work board —
`{ tag: 'refine', stationId: <machine>, units: 4 }`, which is two minutes of furnace and about eight
ingots — and takes it off again when the machine stops wanting tending.
`works.collectLabour(board)` sweeps finished orders and pays each into the machine it was for.
Nothing in `js/work.js` changed. All three sources already worked:

| Source | How | Already existed |
|---|---|---|
| **You** | stand at it, press `E`, `board.swing(id)` | `work.js:260` |
| **A citizen** | bound to `stationId`; the board hands them their own machine first | `colony._doWork` |
| **A machine** | `board.runMachines([tender])` — the Tender Arm | `work.js:284`, **never called** |

The smelter job's tags in `data/colony.json` are already `["refine", "craft"]` and the labour
order's tag is `refine`. **They already matched.** That is how close this join has been all along.

### `tendMax`, and the Tender Arm

A smelter may mind three machines, a carpenter three, a labourer two, everybody else one, a guard
none. `tendMax` does **not** multiply their output: a smelter bound to three furnaces still produces
about 10.6 units a day and the board hands them out oldest-first, so three furnaces each run about a
quarter of a shift. `colony.bind` refuses a fourth by name: *"Marwen Thorn already minds three.
Somebody else will have to take it."*

The night answer is not a second shift — that would mean a second schedule, a second set of states
and a roster you have to read rather than glance at. The night answer is the **Tender Arm**
(`structures.json`, tier 3, `{ steel 8, parts 4, wire 6 }`, 8 kW): a jointed arm on a post that
works whatever bench it can reach, at 12 units an hour, which is 9.6× a machine hour. One arm keeps
about ten benches lit round the clock, it is built out of the metal your people smelted by day, and
it dies with the grid — `machineUnits` already returns 0 for `powered: false`, which is the whole
hook and it was already written.

### The switch

`createWorks({ …, labour })` only enforces any of this when it is handed the knobs. That is not
squeamishness: a machine which refuses to run without a worker is only fair in a game that HAS
workers, a work board and a screen saying so. A caller that has not wired the colony — an old save
path, a node test about smelting, the balance harness — gets the module it has always had.

---

## 2. Housing — `js/housing.js`, `data/structures.json`

Housing used to be four lines: a number of beds, handed out in list order, and a walk to work that
was the constant `0.25 h` for everybody whether their station was next door or four hundred metres
up the hill. `data/colony.json` has carried `walkSpeedMetresPerHour: 3000` and `maxTravelHours: 2`
since the colony landed with nothing reading either.

**A house is a structure with a `home` block. A utility is a structure with a `utility` block.**

| id | beds | comfort | cost |
|---|---|---|---|
| `bedroll` | 1 | 0.00 | cloth 3, fibre 4 |
| `bunkhouse` | 4 | 0.15 | timber 28, plank 12, cloth 8 |
| `cottage` | 2 | 0.35 | timber 20, plank 14, block 8, glass 2 |
| `longhouse` | 5 | 0.30 | plank 30, beam 8, block 16, glass 4 |
| `row_house` | 3 | 0.45 | brick 26, plank 16, glass 6 |
| `manor` | 6 | 0.60 | brick 48, beam 14, glass 12, iron 8 |

Eight utilities: **Well Head** (water, 24 m, +0.20 — the existing decor piece, promoted), **Common
Hearth** (warmth, 16 m, +0.15), **Larder** (food, 20 m, +0.12), **Wash House** (wash, 18 m, +0.14,
and it needs a water utility within its own radius or it is a shed), **Privy** (sanitation, 14 m,
+0.10 — the cheapest point of comfort in the game), **Oven House** (bread, +0.16), **Shrine Post**
(quiet, +0.12), **Meeting Hall** (gather, 30 m, +0.22).

```
comfort(house) = clamp01( house.comfort + Σ over DISTINCT utility KINDS in range of u.comfort )
```

Distinct **kinds**, so four privies is one privy. A cottage with a well, a hearth and a privy in
range reads 0.80. A bedroll on open ground reads 0.00.

**Comfort does exactly two things.** It scales the mood a housed citizen recovers overnight
(`base × (0.4 + 1.2 × comfort)`, so 0.048 to 0.19), and it decides whether a vendor will live here.
It deliberately does **not** scale work output: a second hidden multiplier would make "why is my
furnace slow" unanswerable, which is the exact failure this expansion is trying not to add.

### The walk is real now

```js
travelHoursOf(c) = clamp( hypot(station − bed) / 3000, 0.02, 2 )
```

A station 90 m from the bed costs two minutes each way. One 1.2 km away costs 24 minutes each way —
**0.8 h out of an 11 h shift, 7% of their output, gone into walking** — and the roster says so:
*"Marwen Thorn — smelter, walking to work, fed, 24 minutes each way."* At the two-hour cap they
spend a third of the day on the road.

**This is the housing lesson and it is the only one: build the bunkhouse next to the furnaces.**

A citizen bound to a station takes the **nearest free bed to it**; one with no station takes the
most comfortable free bed instead. Binding somebody to a machine frees their bed so they can be
re-seated — without that the rule would never have fired once, because in the live game a citizen is
welcomed (and takes the nicest bed) and only then bound.

Everything old still works: `setBase({ beds: n })` hands out anonymous beds in list order exactly as
it did, `spareBeds()` falls back to the same arithmetic, and all 42 existing `colony.test.js` tests
pass untouched.

---

## 3. Production does not stop when you leave — `js/civics.js` `away()`

`js/logistics.js`'s `createAwayClock` already ran the grid, the machines and the shipments forward,
correctly and in slices. What it had never run was the **people**: nobody woke, nobody walked to
work, nobody ate, nobody filled a labour order and no tax was collected. Before this round that did
not matter, because a citizen's work never made an ingot. It matters now.

So `civics.away({ seconds })` is **not a second away clock**. It takes the window that one already
decided on, cap included, and runs the colony, the fields and the trade routes across the same
seconds, in the same order the live loop uses: fields, labour orders, people, machines, carts.

- **`capSeconds: 28800`** — eight real hours of simulation, which at 900 s a day is **32 game days**.
  The card says *"capped at 32 days"* rather than pretending.
- **The real cap is the crate.** The catch-up runs the actual machines against the actual pool, so a
  furnace with forty iron ore in reach makes twenty ingots and then says it is waiting for ore.
  **There is no branch anywhere in this design that invents an input**, which is why a week away
  cannot print infinite iron however the numbers are tuned.
- **The mercy.** Nobody walks out while you are off-world. Hunger may climb as far as downing tools,
  which is visible and painful; past `mercyDays: 3` it eases back to grumbling. Anybody who was
  *already* packing when you left is still gone — that one you were warned about. Losing your
  village because you took a flight is a punishment for playing.

The card (`js/civics-ui.js` `showAway`) is a panel, not a modal: every line on it is a real diff
collected as the window ran, which is why it can honestly say *"the furnace has been cold since day
six."*

---

## 4. Vendors — `js/vendors.js`, `data/colony.json` `vendors`

> *"The town system should be similar to other games like Terraria with various vendors available."*

The rule worth borrowing is not the shop — Farhold has had one since `js/town.js` landed. It is that
**a vendor is a person who decides to live at your place because of something you did.**

Twelve of them: Quartermaster, Forge-Warden, Stonewright, Apothecary, Victualler, Carter, Chandler,
Armiger, Wright, Factor, Drover, Gambler. All original names; nothing here belongs to anybody else.

Three gates, all three required, and the panel always says **which one is short**:

1. the condition — a machine standing, a count met, gold turned over;
2. a **free bed** whose comfort clears what they want;
3. no offer pending for them, and none accepted.

Gate 2 is the housing system paying for itself in one sentence:

> *"A Forge-Warden would set up here, but the best free bed is a bedroll in the open. Put a well and
> a hearth within reach of it."*

A vendor is **not** a worker. They take a bed, they eat, they pay **rent** (14 gold a day × your
prosperity) instead of tax, and they put exactly zero units on the work board. Six vendors is about
113 gold a day against six citizens' tax of roughly 36 — **traders are the better gold and they cost
you beds that could have held workers**, which is the trade the Houses tab shows.

**The vendor job is not in `jobs`, and the design wanted it to be.** It must not be: `rollMigration`
picks a migrant's trade with `pick(rng, jobs)`, so a vendor in that array would let a Forge-Warden
walk in off the road — the exact thing the move-in ritual exists to prevent — and every existing test
that walks `jobs` asserts a positive `unitsPerHour` and a non-empty tag list, which a vendor has
neither of. It lives in its own `vendorJob` key. `colony._doWork` also carries a one-line guard,
because an empty tag list means "will do anything" everywhere else in the game and a trader who
quietly started smelting would be a very confusing bug to be handed.

---

## 5. Trade goods and the hold — `data/tradegoods.json`, `js/trade.js`, `js/hold.js`

Twenty-two goods, from a 26-gold sack of charcoal to a 420-gold case of control boards. Each carries
a weight in kilograms, a base price, one or more of **eight tags** (`food`, `cloth`, `metal`,
`building`, `tools`, `light`, `chemical`, `fine`), and the machine and inputs that make it.

**Fourteen of the twenty-two are made on the `workshop`** — tier 1, `{ plank 16, iron 6, rope 4 }`
— which is the point: one cheap bench is the whole trade tier. The rest are on the kiln, loom,
sawmill, tannery, chemical bench, crystal cutter, or the tier-3 `manufactory`.

`installTradeGoods(resources, refining, goods)` copies each good into the live
`resources.materials` map and pushes one recipe each into the live `refining.recipes` array, **at
boot, in memory, never into the files.** That is the rule `data/items.json` taught when it turned
out to be shared with Emberveil, and it applies here for the same reason: `data/resources.json` is
read by the scanner, the seam generator and the store-share caps, and twenty-two manufactured goods
have no business in any of them. `kind: 'trade'` keeps them out of the raw-share caps and out of a
silo. It is safe to run twice.

### The hold

`js/hold.js` is the **only capped container in the game**, and the weight limit is the entire reason
trade is interesting. Forty kilograms on your back (the same number `resources.json`'s haul block
already uses), 160 in a hand cart, 260 on a mule, 620 in a covered wagon, 2 000 in a Trade Post.

**There is no encumbrance.** Going over is impossible rather than slow: `put` returns what fitted and
the panel says *"The cart is full. 3 of 7 went in."* A speed penalty here would fight
`walkSpeedFor`, which already slows you for the **materials** you carry — a different and older
lesson, and teaching it twice in two currencies would just be confusing.

The **Trade Post** (`{ plank 30, beam 8, brick 18, iron 6 }`) is a store that takes trade goods only,
holds two tonnes of them, is the only place a route can start or end, and is what the Factor and the
Carter move in for.

---

## 6. Trade routes — `js/trade.js`

```
priceAt(good, place) = base × clamp(1 + 0.45·need − 0.35·makes + 0.18·drift, 0.55, 1.85)
```

`need` and `makes` are the **share of the good's tags** this place wants or produces, so a two-tag
good is not worth more than a one-tag good for a reason nobody could see. `drift` is a slow wobble on
a **six-day step**, so a price board is worth re-reading about once a week and never mid-run. The
whole spread a player can ever see on one good is about **3.4×** — enough to be worth a cart, never
enough to be a slot machine.

**No authored data per settlement anywhere.** What a place makes comes from the `want` list its own
town plan gave its plots; what it needs comes from its biome, its size, its culture and whether the
faction layer says the zone is short. Two lines of policy carry the whole economy: **a place never
both needs and makes the same tag** (`makes` wins), and **`need` is capped at two tags** so no town
wants everything.

```
hours = metres / (speed × (1 + 0.6 × roadShare)) / 3600
```

**This is the road payoff.** `roadShare` applies to a road *you* laid with the Road tool exactly as
it applies to a world road, because `terrain.roadAt` does not care who painted it. A fully made road
cuts a trip by up to **37%**, for a few cut stone a metre.

Five carriers (porter, hand cart, pack mule, covered wagon, hauler drone) — three of them are already
`data/power.json`'s hauler rows with these exact capacities and speeds, and `data/colony.json`
`carriers` adds only the trade fields. There is no second haulage table.

**Trouble is a roll now, not a certainty.** `js/caravans.js` ambushed every unescorted caravan,
unconditionally, at about two-thirds of the way along — right for flavour, wrong as a rule a player
is betting money on, and it also meant a road with a caravan on it was really a road with a wreck on
it. Now:

```
0.34 × danger × (1 − 0.18 × guards) × (1 − 0.25 × escorted), floored at 3%, capped at 70%
```

A hand cart with two guards through a quiet zone is **7.6%**. A wagon through a contested one with
none is **31%**. If it does fire, the guards roll once: `survive = guards / (guards + 2)`, so two
guards save a cart half the time and four save a wagon two-thirds of the time. A guard is never a
guarantee.

A **standing route** re-dispatches on arrival while the manifest still clears at a profit, and stops
itself and says why when it does not. **It never spends gold you do not have and never reports a
loss silently.**

---

## 7. Guards — `js/colony.js`, `js/defence.js`

Three posts: **Watch Post** (2 slots), **Guard Tower** (3, and four metres more reach for whoever
stands on it), **Gate House** (2, and it is a gate). All three are `cat: 'defence'` with **no
`defence` block**, so `defence.tick` — which gates on the block, not the category, for exactly this
reason — correctly refuses to let them snipe. A watch post is a place to stand, not a turret.

`colony.station(citizenId, postId)` refuses in sentences: *"Every slot in that watch post is
taken."* / *"Marwen minds the furnace. Somebody has to."* / *"They have downed tools. Feed them and
ask again."*

**The ninth join.** `colony.guards()` has counted citizens standing a watch since the colony landed,
and `defence.baseOf()` hard-coded `citizens: 0` right next to it. Both are wired now, through getters
(the field and the build ledger are getters for the same reason: both are rebuilt on every landing).
The consequence is immediate in both directions: `data/raids.json` gates the Warband at
`minDefence: 5`, so **four guards and a bolt turret now qualify** where before you needed five
turrets; and `notoriety.perCitizen: 1.2` and `perRefineryThroughput: 0.6` finally get real numbers
instead of zeroes, so a village of twelve with a watch is noticed by the world — which is the correct
reading of `notorietyOf` and has never once fired.

Wages (8 gold a day a posted guard) and rent are paid in the same pass as tax, and the line is
honest: *"318 in tax, 154 in rent, 96 out in wages. 376 gold."* An outpost that cannot pay does not
lose its guards that evening — they sulk after three unpaid days and walk off the posts on the
seventh, with a warning each time.

`defence.rally()` puts a body at each posted, fed guard's post, using the **one** stat block in
`data/colony.json` `guard` — the same table a town's watch reads, so your guard and a town guard can
never quietly become different things. **A guard that falls is knocked down, not killed**, and is
back at their post next morning at half mood. Killing your own citizens by ringing a bell is the
punishment-for-playing shape again.

---

## 8. The muster — `js/muster.js`, four edits to `js/raid.js`

> *"Allow the town center to initiate wave defense minigames that reward loot or resources for
> victory, or just nothing if defeated besides death penalty if the player dies. No need to penalize
> for a minigame."*

`js/raid.js` is already this: four tiers, night and early scaling, a guaranteed rare crate, a
journal, and one gate nothing can spawn through. A second wave system would drift within a round. So
**a drill is an ordinary raid with a flag on it**, and the flag changes exactly two ends:

- `raidOffer({ forceTier, drill })` — you pick the rank off a board instead of earning it with
  turrets;
- `loseRaid` returns **`structuresBroken: 0, materialsTaken: 0, citizensLeave: 0`** and the line
  *"They got through. Nothing is broken and nothing is missing — it was a drill."*
- `raidRewards` scales gold by 0.6, sets `standing: 0`, and rolls the tier's new `spoils` block —
  materials into the nearest store pool. **The crates and the rare floor are unchanged**, which is
  the "reward loot" half of the request; the spoils are the "or resources" half. You get both.

The zeros are returned **from `loseRaid`** rather than left to the call site, and that is the one
thing to be careful of when wiring it: a call site that re-derived the loss from `raids.json` would
bypass the flag and a minigame would quietly start eating walls.

Everything between — `canFire`, `acceptRaid`, `beginRaid`, `currentWave`, `waveSpawns`,
`onRaiderKilled`, `clearWave`, `RaidBook` — is untouched, so every rule the raid already keeps keeps
itself for free.

Two places you start one, both things that already stand on the ground: a town's **notice board**,
and a **Muster Stone** (`{ block 14, iron 4 }`) at your own outpost. The existing **Alarm Bell stays
exactly what it is** — that is the real raid, the one that pays standing and can cost you a wall.
Two objects, two meanings.

**Cooldown is per rank and per place**, so clearing rank 4 does not lock out rank 1 and a muster at
Ironmoor does not lock out one at your own holding. A **leash** of 300 m for 45 continuous seconds
ends a drill you walked away from — and it ends it the same way dying does, which is to say with
nothing taken.

A walled city musters a harder rank 3 than a hamlet does, using arithmetic that was already written:
`waveSpawns` scales off `base.defences` and your level, and `muster.baseForTown` only has to describe
a settlement in the same four numbers a base is described in.

---

## 9. Where it all lives

| File | What |
|---|---|
| `js/civics.js` | **the one thing `main.js` constructs and ticks.** Owns the five modules below, injects the goods at boot, runs the away half |
| `js/housing.js` | houses, utilities, comfort, which bed a citizen sleeps in |
| `js/vendors.js` | the twelve, their conditions, their rent, their shelf |
| `js/hold.js` | the one weight-capped container |
| `js/trade.js` | `installTradeGoods`, town prices, the route planner |
| `js/muster.js` | the drill board over `js/raid.js` |
| `js/civics-ui.js` + `civics.css` | the Holding screen (People · Houses · Work · Traders · Trade), the away card, the HUD hold readout |
| `js/colony.js` | extended: housing, `travelHoursOf`, `bind`/`station`, wages, rent, `tendMax`, two new appeal terms |
| `js/refine.js` | extended: `labour`, `workBank`, `postLabour`, `credit`, `collectLabour`, the `unworked` state |
| `js/defence.js` | `baseOf` reads the colony through getters; `rally()`; `watch()` |
| `js/raid.js` | four edits: `forceTier`, `drill`, the zeroed loss, `rollSpoils` |
| `js/caravans.js` | trouble is a roll; a caravan can carry a manifest of yours |
| `js/hire.js` | `guardContract()` — guards for a trip, at ten gold each |
| `data/colony.json` | `labour`, `comfort`, `vendors`, `vendorJob`, `guard`, `away`, `muster`, `trade`, `carriers`, `hold`; `tendMax`/`wagePerDay` on the jobs; rebalanced appeal weights |
| `data/tradegoods.json` | the twenty-two goods |
| `data/structures.json` | 6 houses, 8 utilities, a stable, 3 posts, the Muster Stone, the workshop, the manufactory, the Trade Post, the Tender Arm; two new catalogue categories |
| `data/refining.json` | `labour` blocks; the workshop and the manufactory |
| `data/raids.json` | `spoils` per tier, and the `muster` block |
| `tests/civilization.test.js` | 43 tests, all of the above |

---

## 10. Where the code disagreed with the design, and won

- **`credit(10)` does not buy eighteen batches.** §3.8 asked for it and §3.1 sets `bankSeconds: 120`
  in the same breath — the cap would have thrown six of those units away. The cap is the point (a
  furnace cannot be wound up for a week and left), so the test pays in fours, which is the grain the
  board actually delivers in.
- **The vendor job is not in `jobs`.** §5.2 put it there; `rollMigration` picks from that array, so a
  Forge-Warden would have walked in off the road.
- **The mercy was inert as written.** §4.4 said hunger "climbs normally for the first three game days
  and then holds at grumbling" — at `hungerPerDay: 0.5` an unfed citizen reaches the leaving rung on
  day two, so everybody would be gone before it applied. Implemented to the stated outcome instead:
  during an away window hunger may reach downing tools and no further, and eases to grumbling past
  `mercyDays`.
- **`js/buildplan.js` needed no edit.** §10.4 wanted `place()` to copy five more blocks on to the
  entry. Every module here reads them through `build.defOf(entry.key)` instead — the same
  information from the same file, and no edit to a file another agent was in.
- **`js/build-ui.js` needed no edit either.** It already filters `catalogue.categories` to the ones
  with pieces in them, so `home` and `trade` appear on their own.
- **`data/civics.json` was not created.** Every knob went into `data/colony.json`, which the game
  already loads — one fewer file for `main.js` to fetch and one fewer chance of the two drifting.

## 11. Not built

- **§5.3's town half** — the eleven new vendor roles mapped into `js/town.js`'s `ROLES` and
  `BUILDING_INFO`, and `tradepost`/`countinghouse` plots in `proctown/js/townplan.js`. Both files
  were off limits and `proctown` is shared with other pages. The vendors work at your own holding,
  and `trade.profileFor` reads a settlement's plots when it is given them and falls back to biome,
  size and culture when it is not — so town prices work today and get sharper the day those two data
  lines land. Written up as part F of the handoff.
- **The Oven House is a utility, not a machine.** §2.2 wanted it to bake rations as a kiln-class
  machine. It gives its comfort and nothing else.
- **`tests/civilization.spec.js`** (the Playwright end-to-end walk to a notice board) — it would drive
  wiring that is still in the handoff file.
