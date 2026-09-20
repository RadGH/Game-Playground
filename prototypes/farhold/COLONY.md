# Farhold — the colony: work, citizens, farming, taxes and raids

The people half of `BUILDING_EXPANSION.md`. Four pure modules, three data files, one test file, and
no Three.js or DOM anywhere in them — bodies and screens are somebody else's job, so `node --test`
drives exactly the code the game does.

| File | What it owns |
|---|---|
| `js/work.js` | The work unit, the ledger, and the board everything queues on |
| `js/colony.js` | Citizens, their day, food, housing, tax, migration, recruiting |
| `js/farm.js` | Plots the player lays out and the colony keeps |
| `js/raid.js` | Notoriety, raid offers, waves, rewards, the raid journal |
| `js/quests.js` | Carries a raid in the ordinary quest log (small addition) |
| `data/colony.json` | Jobs, schedule, food, housing, tax, migration, recruiting |
| `data/crops.json` | Crops, soil, harvest/replant work, cooking, spoilage |
| `data/raids.json` | Notoriety weights, tiers and their gates, night, rewards, losses |
| `tests/colony.test.js` | 42 tests over all of it |

---

## 1. Work is a unit, not a timer

> "We should incorporate a 'work' system where you need 10 units of work at a machine, either by the
> player working manually, by automating with a machine, or by assigning an npc."

A station posts an **order** for N units (ten by default). Units come from three sources and they are
the same unit:

```js
const board = new WorkBoard();
board.postJob({ id: 'ingots', tag: 'refine', stationId: 'furnace_1', units: 10 });

board.swing('ingots', { units: 4 });                                   // the player, by hand
board.work('ingots', { source: 'citizen', by: 'c7', byName: 'Marwen' });  // an assigned citizen
board.runMachines([{ id: 'drill', stationId: 'furnace_1', unitsPerHour: 3 }], 1);  // a machine
```

### What makes them interchangeable

1. **One function.** `addWork(order, { units, source, by, byName, at })` is the only way progress
   happens. `swing()`, `work()` and `runMachines()` all funnel into it. There is no player-only or
   machine-only path that could drift.
2. **The order holds no source.** It has `units`, `done`, a `tag` (what KIND of work this is) and a
   `stationId`. It has no preferred source, no per-source multiplier, and no "citizens only" flag.
   A job's `tags` in `data/colony.json` decide which orders a citizen will *pick up*; they never
   decide who is *allowed* to work one.
3. **Nothing is lost.** `addWork` clamps to what is left and returns the rest as `spare`, so a
   citizen with 1.4 units of shift left and an order wanting 0.3 walks the other 1.1 to the next
   order. Effort that evaporated would stop the three sources being equivalent.

The one thing that does remember a source is `order.ledger` (`{ player, machine, citizen }`) plus a
merged `credits` list, and it exists purely so the UI can say where the ten came from:

```js
ledgerRows(order);   // [{ source: 'player', name: 'By hand', units: 4, share: 0.4 }, …]
creditLine(order);   // "4 by hand, 3 by Marwen, 3 by the sawmill"
progressText(order); // "7 / 10"
```

A machine mints nothing when `powered: false` or `enabled: false` — that is the whole hook the power
grid needs, and it lives in `work.js` so units are only ever created in one place.

`board.nextFor({ tags, stationId })` hands out the highest priority, then the oldest. Ripe food is
posted at priority 2 so it beats ordinary building.

---

## 2. Citizens go to work

Colony Survival's loop, five states, deliberately rudimentary (`CITIZEN_STATES`):

```
asleep → home → to_work → working → to_home → home → asleep
```

Boundaries come from `data/colony.json` `schedule` (wake 6, leave for work 7, leave work 18, bed
22). `colony.tick(hours)` steps in quarter-hours so a `tick(24)` contains a whole working day rather
than teleporting past it. `colony.setClock(hourOfDay, day)` syncs it to the game's sky.

An hour of a working citizen becomes `job.unitsPerHour × skill × hungerFactor × moodFactor` units,
spent onto the board through `board.work(…, { source: 'citizen' })` — the same function the player's
swing uses. A citizen at a station with nothing on the board clocks up `idleHours` instead of
inventing work, so "my smelter is standing about" is visible on the roster.

```js
colony.welcome(colony.newCitizen({ job: 'farmer' }));
colony.assign(c.id, { job: 'smelter', stationId: 'furnace_1' });
colony.roster();  // ["Marwen Thorn — farmer, working, fed", …]
```

Eight jobs ship in `data/colony.json`: labourer, farmer, miner, smelter, carpenter, hauler, cook,
guard. Every one has `mayBreakGround: false`, and a test fails if that ever changes.

---

## 3. Farming is maintenance, not creation

> "they don't plant new crops but they will harvest and replant existing crops, this way the player
> still has to set up the crops in the first place but they maintain it after that."

`farm.layPlot({ x, z, crop, by })` is the **only** way a plot comes into existence and it refuses
every source but `'player'`. There is no second door. `canBreakGround(source)` is exported so a
build-mode UI can grey the tool out for the right reason.

After that a plot cycles for ever without the player:

```
growing ──(growHours)──▶ ripe ──(harvest order)──▶ stubble ──(replant order)──▶ growing
```

Harvest and replant are **ordinary work orders on the ordinary board**, tagged `harvest` and
`replant`. So the player can scythe their own field at three in the morning, a farmer can do it on
their shift, or a harvester machine can do it while nobody is home — same unit, three sources.

Soil wears a little per harvest, recovers a little per replant, and recovers faster fallow. A ripe
plot nobody comes for stands for four days and then loses yield down to a floor — a week away costs
you a harvest, not the farm. Seven crops, biome-gated (`cropsFor(data, biome)`); `fibre` and `herb`
are deliberately not food, so the crop table is not just a food table.

A `cook` order turns raw crop into meals at 1.6×, and `takeFood()` eats meals first, then raw crop
cheapest-first so the gourds last.

---

## 4. Food, the degrade ladder, and tax

Citizens eat at 7, 13 and 19. Hunger climbs 0.5 a day and only a meal brings it down. An unfed
colony goes down a ladder the player can watch happening (`hungerRung`):

| Rung | At | What the player sees |
|---|---|---|
| `content` | — | Working properly, paying tax |
| `hungry` | 0.30 | Output drops to 65%, mood falling |
| `grumbling` | 0.55 | Still working. **Pays no tax at all** |
| `downsTools` | 0.78 | **Refuses to work.** Stays at home |
| `leaving` | 1.00 | **Walks out**, with a line in the log |

Nobody ever starves to death. A dead citizen makes you reload; a departed one makes you build a
granary.

**Tax** is collected at each day roll-over and comes only from citizens who are **both fed and
housed**:

```
gold = Σ over citizens (housed && rung ≤ hungry) of  perCitizenPerDay × clamp(mood, 0.25, 1) × prosperity
prosperity = 1 + structures × 0.01, capped at 1.5
```

That is the lever the whole economy hangs on: the answer to "how do I make money" is always "look
after more people". `collectTax()` returns `{ gold, paid, skipped }` with a reason per skipped
citizen (`no bed`, `grumbling`) so the panel can say why the take is down.

A bed is the whole housing model. Housed citizens recover mood overnight and pay tax; unhoused ones
sleep rough, lose mood and pay nothing.

---

## 5. Migration and recruiting

**Migrants** turn up because the place is worth coming to. `colony.appeal()` is a weighted 0..1 of
spare beds, days of food in the store, defences up, and how miserable the people already there are —
every one of those is something the player built on purpose, so migration reads as a reward for a
tidy colony rather than a random event. Nobody comes to a colony with no spare bed, ever.

A roll produces an **offer**, never an arrival:

```js
const offer = colony.rollMigration();   // once a day, or null
colony.accept(offer.id);                // or colony.turnAway(offer.id)
```

**Recruiting** is the other route: walk into a town and pay. A settlement has a small pool that
refills over about eight days, the price climbs with the size of your colony (you are asking them to
leave a working town for a hole in the ground) and good standing knocks up to 35% off. Recruiting
also needs a spare bed — "nobody signs on to sleep in the mud".

```js
const offer = colony.recruitOffer({ settlementId, settlementName, size, standing });
colony.recruit(offer, { gold: player.gold });   // { ok, citizen, spent }
```

---

## 6. Raids are a quest you start

> "[the tower defence] might be better as a quest rather than a random event, so the player can
> decide when to start on it rather than being a burden."

Nothing is ever a surprise. The world offers; the player accepts; the player picks the hour.

```js
const offer = raidOffer({ base, level, biome, enemies, bosses, modifiers, rng, data, enabled });
if (offer?.ok) questLog.add(offer);          // state: 'offered' — nothing is coming
acceptRaid(offer);                            // state: 'accepted' — still nothing is coming
beginRaid(offer, { hour: 21, early: true });  // state: 'running' — NOW it spawns
```

`canFire(quest)` is the single gate and it is false for anything not accepted. `beginRaid()` refuses,
and `waveSpawns()` returns an empty list, so there is exactly one place that would have to be broken
for a raid to be a surprise again.

**Both gates, always** (§7.1). `tierFor({ base })` needs notoriety **and** `minSize` **and**
`minDefence`. A base with 120 structures and no turret is never offered a raid, because being raided
for building a house is the punishment this design exists to remove — and when it refuses, it says
which of the two is short, because "they have not noticed you yet" reads very differently from "you
have nothing to defend with". Every tier asks for a bigger base *and* more defence than the one below.

Four tiers: Prowlers at the Fence, The Warband, The Siege, The Reckoning (3–7 waves, boss on the last
wave of the top two). Composition is filtered to creatures that actually live on this ground, at the
player's level band. Raiders walk at one target — a lit waypoint first, then the refinery — so a wall
in the right place means something.

Rewards guarantee **at least one rare crate**, and the floor is re-asserted in `raidRewards()` rather
than trusted to the JSON, because a typo in a data file should not be able to break the promise the
design makes. Night raids pay 1.4× gold and 1.3× XP; ringing the bell early adds 25% gold. Losing
breaks a fifth of the structures and takes a quarter of the loose materials — and never deletes a
base. `RaidBook` keeps the journal history.

`js/quests.js` gained `STARTED_KINDS = ['raid']`, `isStarted()`, `log.raids()`, `log.onRaidWave()`,
`log.readyRaids()` and a raid branch in `progressText()`. `QUEST_KINDS` is untouched, so no town
crier can ever hand you a raid, and `byGiver`/`readyToTurnIn` filter raids out so one cannot turn up
in a village merchant's finished-jobs list.

---

## Wiring left for the game layer

These modules are pure by design, so the following has to be done by whatever owns the file named:

| What | Where it has to happen |
|---|---|
| Structure and defence counts | `js/build.js` → `colony.setBase({ structures, defences, beds, waypoint, wealth })`. `colony.guards()` returns the citizens standing a watch, to be added to the build system's defence count. |
| Machines contributing work | `js/refine.js` currently runs machines on fuel-seconds timers. To make a machine the third work source, it should post `createOrder({ tag: 'refine', stationId, units })` per recipe and call `board.runMachines(machines, hours)` each tick instead of its own clock. |
| Clock | `js/main.js` → `colony.setClock(hourOfDay, day)` from the sky, then `colony.tick(dt)` and `farm.tick(dt)` each frame or each catch-up. |
| The farm tool | Build mode needs a "lay a plot" tool that calls `farm.layPlot({ x, z, crop, by: 'player', biome })` and shows `res.why` on a refusal. |
| Bodies | `js/actors.js` needs to place a citizen body at their station when `state === 'working'` and at their bed when `asleep`; `roster()` carries the state per citizen. |
| Panels | A base overview from `colony.report()`, a roster from `colony.roster()`, work orders from `board.open()` with `ledgerRows()`/`creditLine()`, and the farm from `farm.report()`. |
| Raid spawning | `waveSpawns(quest, { base, level })` gives groups with `hpMultiplier`/`dmgMultiplier`/`target`; something has to turn those into bodies and call `onRaiderKilled(quest)` or `clearWave(quest)`. |
| The alarm bell | A decorative/defensive structure whose interaction calls `beginRaid(quest, { hour, early: true })`. |
| Raids toggle | A settings switch passed as `enabled` to `raidOffer()` (§7.19). |
| Faction standing | `raidRewards().standing` needs handing to `js/factions.js`. |
| Save | `colony.toJSON()` / `colony.load()`, `farm.toJSON()` / `farm.load()`, `board.toJSON()`, `new RaidBook(saved)` — all round-trip, and a test proves it. |

## Tests

`node --test prototypes/farhold/tests/colony.test.js` — 42 tests, including the six the brief asked
for: ten units from any of the three sources are interchangeable; a citizen's day reaches all five
states and finishes a ten-unit order; a farmer harvests and replants for a month and lays not one
new plot; an unfed colony walks down the ladder a rung at a time and then walks out; tax scales with
a fed and housed population and is zero without beds; and a raid cannot fire until the player accepts
it.
