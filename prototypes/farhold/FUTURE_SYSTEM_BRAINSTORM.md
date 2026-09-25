# Farhold — future system brainstorm

Written 2026-09-21, at the end of round 17, at the user's request:

> "In addition to the changes requested here, there is clearly potential to expand these systems in
> the future. Create a FUTURE_SYSTEM_BRAINSTORM.md and set a memory note to remind me of that later
> so we can refine it and eventually incorporate it, once we fine-tune the current systems. Do a
> brainstorming session based on this message and current systems and brainstorm some of the future
> expansions of the game (expanding research system, adding other land vehicles, scanning updates
> and material discovery, materials/scan gated behind research, etc)."

**Nothing in this file is built.** It is a parking lot, kept deliberately opinionated so that when
we come back to it we are choosing between designs rather than starting a conversation. Everything
here is sized, and every entry says what it depends on — because half the ideas below are cheap
once the thing above them exists and expensive before.

**Rule of the house that applies to every line of this file:** this project's signature fault is a
finished module that nothing calls. Anything promoted out of this file has to land with a way in,
and the way in is part of the estimate, not an afterthought.

---

## 0. Where round 17 leaves us

Round 17 built the first versions of four systems that are all obviously bigger than what shipped:

| System | What round 17 shipped | The shape it wants to grow into |
|---|---|---|
| Research | Four ages, a small tree, points from quests/exploring/bosses | A real tech web with several routes through it, and things to spend points on other than structures |
| Scanning | A scanner in the tool ring, right-click to pick what to scan for | Discovery: materials you do not know exist until something tells you |
| Stations | A per-building screen with that station's recipes | Machines that talk to each other, and a reason to lay a base out well |
| Followers | Slots, mercenaries, summon caps | People with opinions, who leave |

The through-line for all four is the same: **round 17 gave each of them a noun. The expansion gives
each of them a verb.**

---

## 1. Research — from a gate into a decision

### 1.1 The problem with what we have
Four ages in a line is a *schedule*, not a choice. You will unlock every node eventually, in
roughly the same order, in every run. The tree tells you what is coming; it never asks you anything.

### 1.2 Branches that cost each other
Make the ages wide instead of deep. Inside an age, two or three nodes that do the same job by
different means, and taking one raises the price of its rivals (not forbids — raises). Examples
that fit Farhold as it already is:

- **Smelting**: a *bloomery* line (cheap, slow, no power, works anywhere) against a *blast* line
  (fast, wants fuel and a power grid, wants a base you have planned).
- **Hauling**: *pack animals* (works from day one, scales badly) against *routes and depots*
  (`js/haulpath.js` already does the A\*) against *powered conveyance* (needs the grid).
- **Prospecting**: *deep scanning* (find more) against *assay* (get more out of what you find).

The interesting part is that the branches are **not balanced against each other in the abstract** —
they are balanced against *the planet you are standing on*. A world with no fuel makes the blast
line a trap. That makes research a read of the world rather than a shopping list, which is exactly
what a game with a procedural galaxy should be doing with it.

### 1.3 Where points come from, beyond round 17's three
Round 17 pays for quests, exploration and bosses. Additions, roughly in order of how much they'd
change behaviour:

- **Analysing a sample.** Carry an unknown material to a bench, spend time, get points *and* the
  material's data sheet. This is the join between research and scanning (§2) and is the single
  best idea in this file.
- **Dissection / field notes** on a creature family you have killed enough of — feeds the bestiary
  and pays for creature-facing tech (traps, lures, taming).
- **Ruins and wrecks.** `js/sites.js` and the caravan-wreck event already put lost technology on
  the map. Reading one should be worth a chunk of points and possibly a node you could not have
  reached otherwise.
- **A researcher in your holding.** `js/population.js` and `js/work.js` already have citizens doing
  jobs; a lab is another job. This turns research into something your base produces, which is the
  reason to have a base at all.
- **Failed experiments.** Spend points to *try* something; sometimes you get a worse version and a
  discount on the real one. Cheap to build, and it is the only thing on this list that makes a
  research screen worth looking at twice.

### 1.4 Things to spend points on that are not structures
- **Recipe efficiency** (same inputs, more output) — the classic, and it makes an old base better
  instead of obsolete.
- **Tool tiers** — currently a material gate. Making the *tier* researched and the *material*
  gathered gives two independent axes.
- **Blueprints for things you cannot build yet**, which then tell the scanner what to look for.
  A node that changes what the world shows you is worth three that change a number.
- **Quality of life**: a second build-ghost, a bigger clear radius, route auto-repair. Boring to
  write down, the most-used nodes in every game that has them.

### 1.5 Cost / size
Branching tree + new point sources: **medium**. Analysis-driven discovery (§2) is the expensive
half and should be costed with §2, not here.

---

## 2. Scanning, discovery, and materials you do not know about yet

This is the one I would build first after the current round settles, because it makes the **planet**
the content rather than the quest list.

### 2.1 The core idea
Right now every material exists from the first second and the only question is whether you have
walked past a node. Instead: a planet's `data/resources.json` rows are split into **known** and
**latent**. A latent material does not appear in the scanner, in the build catalogue, or in a
recipe's cost — it is not hidden behind a grey row, it is *not there* — until something introduces
it to you:

1. Your scanner returns an **unidentified return** — "something dense, 40 m, not on file".
2. You dig it and get **an unknown sample** with no name and no uses.
3. You **analyse** it at a bench (§1.3). Now it has a name, a data sheet, research points, and
   every recipe that uses it appears at once.

That last beat — a dozen recipes lighting up together because you finally worked out what the blue
sand was — is the payoff, and it is the reason to do this properly rather than as a grey row with
a padlock.

### 2.2 What it needs that does not exist
- A **known-materials ledger** on the save (per character, not per planet — knowledge travels).
- The scanner returning **unidentified** hits (it currently returns typed ones).
- An **analysis** recipe kind at a bench, which is a `js/work.js` job with a different payout.
- Every screen that lists materials filtering by the ledger. This is the risky part: the build
  catalogue, the station screens, the Find tab, tooltips, and the sim harness all read the material
  table directly today. One filtered accessor, applied everywhere, with a test that nothing reads
  the raw table — or this will leak a name somewhere and spoil the reveal.

### 2.3 Scanner tiers (round 17 left room for this deliberately)
| Tier | What it adds |
|---|---|
| 1 Handheld | What round 17 ships: a sweep, a radius, one filter |
| 2 Surveyor | Depth — tells you a seam is *under* something; reads hardness so you know if your tool will do |
| 3 Assay rig | Richness and purity; makes "which of these four iron seams" a real question |
| 4 Orbital | Placed, or mounted on the ship: a whole-region pass that fills the map's Find tab, at a cost |
| 5 Anomaly | Finds the latent/unidentified things specifically. This is the tier that opens §2.1 |

A scanner should also be **wrong sometimes** at low tiers — a ghost return that turns out to be a
buried ruin or nothing at all. A perfect instrument is a checklist.

### 2.4 Research-gated materials
Straightforward once §2.1 exists: some materials are latent until a research node *tells you they
are possible*, rather than until you trip over one. That is the difference between "you found
something" and "you went looking" and the game should have both.

### 2.5 Cost / size
**Large.** §2.1 alone is a round. The filtered accessor is the part that will actually eat the time.

---

## 3. Land vehicles, and travel as a system

Round 11-12 landed motorcycle / car / truck on `G` and round 15 folded them into one "what do I
ride" dropdown with the horse. That is a vehicle *list*. A vehicle *system* looks like:

### 3.1 More of them, but each with a reason
- **Crawler / half-track** — slow, ignores slope. The vehicle for a mountain world, where the car
  is useless and the horse is the only answer today.
- **Hauler / flatbed** — carries cargo *and tows*. The join to logistics: drive a full crate home
  instead of a route.
- **Rover with a bed** — a mobile respawn/rest point. Changes how far from home you are willing to go.
- **Drill rig** — a vehicle that is a machine: park it on a seam, it works the seam.
- **Skimmer / hover** — crosses water and marsh at a fuel cost. Retires the boat problem on worlds
  with no wood.
- **Sled / travois** for the low-tech start — because the first five hours have no vehicle at all
  and hauling is exactly when you want one.

### 3.2 The systems underneath them
- **Fuel and range.** `refuel()` already exists for the ship (BUILD-MODE §9). Ground vehicles
  taking fuel makes a depot worth building and makes the horse permanently relevant.
- **Damage and repair.** A vehicle that can be broken is a vehicle you think about.
- **Terrain as a real constraint** — `maxSlope` exists; mud, snow depth, and water crossings do not.
- **Garage** (round 17 makes it a building) as the place all of this is managed: fuel, repair,
  upgrade modules (bigger tank, cargo rack, lights, a mounted turret for §5).
- **Passengers.** Followers riding with you (§4) is the difference between a vehicle and a horse.

### 3.3 Cost / size
Each vehicle body: **small**. Fuel/damage/terrain: **medium**, and it touches `js/player.js`'s
movement, which is load-bearing — do it with the sim harness running.

---

## 4. Followers, and people who are people

Round 17 gives slots, mercenaries, level scaling and summon caps. What it does not give is any
reason to care which follower you take.

- **Traits and opinions.** They already exist elsewhere in the playground — `lingo/` has 25 traits,
  relationships and memory, and Emberveil's camp conversations use them. Farhold has the imports
  available and does not use them for followers. This is the cheapest big win in the file.
- **Loyalty, and leaving.** A mercenary on a contract; a companion who stays for what you do. A
  follower who can walk away makes every other follower system matter.
- **Gear on followers**, with the same item system. Round 17 scales them automatically, which is
  right for the default; letting you hand one your old sword is the upgrade path for that sword.
- **Orders and stances.** `js/command.js` (the Command Rod) already gives orders to citizens.
  Pointing the same verb at a follower — hold, follow, gather, guard that — is mostly wiring.
- **Followers at the holding vs followers on the road.** These are two different rosters today
  (`colony.recruitOffer` vs the follower slots) and a player will absolutely try to move somebody
  between them. Decide whether that is allowed before somebody asks.
- **Death.** Permanent, or a revive rule like Emberveil's (round 20 made the fallen stay down and
  it is the best rule in that game). Farhold should copy it.

**Cost:** traits/opinions **small-medium** (the libraries exist); loyalty and leaving **medium**;
gear on followers **medium** and it touches the item pipeline.

---

## 5. The base, past a pile of machines

- **Machines that feed machines.** Frontier Foundry already solved this with storage *pools*
  ("stores that reach each other share everything") and it is the single best idea in that
  prototype. Farhold has `js/stores.js` and `js/haulpath.js` and stops short of it.
- **Power as a real constraint** — `data/power.json` and `js/power.js` exist; the grid is barely
  load-bearing. Duty cycles and load shedding are already written in the other prototype.
- **Layout mattering.** Right now a base is a set of objects on grass. Adjacency bonuses, indoor
  vs outdoor, heat, and a roof that means something would make the build screen a design problem.
- **Automation as the top of the research tree**, so ages 3-4 have a destination that is not a rocket.
- **A second base.** `js/homes.js` already files every base you ever raised by system and planet,
  with `routeTo` naming three legs. Nothing makes a second one *useful* yet — a supply line between
  two holdings on two worlds is the endgame this game is shaped like.

---

## 6. The world, and what is in it

- **Seasons and long weather.** `worldgen/js/weather.js` has 14 states and a clock. Farhold reads
  the short version. A winter that closes a pass or freezes a lake is world-scale content for
  almost no new code.
- **Ruins with a history** — `namegen/` and the Territory's zone record can already generate who
  was here and what happened to them. Reading a ruin should tell you something true.
- **Creatures with ecology.** `BESTIARY-IDEAS.md` has ~40 written up Dwarf-Fortress-style and
  untagged for work. Herds that migrate, predators that follow them, a nest that repopulates if you
  do not clear it — this is what makes a planet feel inhabited rather than spawned.
- **Terraforming past cosmetics.** `js/terraform.js` moves dirt. Changing a *biome* — irrigation,
  drainage, planting a wood that spreads — is the late-game verb that pairs with the research tree.
- **The other planets actually mattering.** Rare elements are already per-planet (`universe/`).
  Making a mid-game recipe need something that only exists two worlds over is what turns the ship
  from a set piece into infrastructure.

---

## 7. Interface and information

- **One "what does this do" surface.** The codex/journal is spread over the Journal, the build
  catalogue's detail pane, and tooltips. A single searchable reference that reads the same data the
  game does would stop the recurring "a finished system nobody found" problem at the source.
- **A build-order / production overview** — what is being made, where, and what is starved.
- **Blueprints**: save a base layout, stamp it on another world. Enormous quality of life once
  there is a second base worth having.
- **Notifications with a history you can act on**, rather than a log you scroll. Round 17 makes the
  log a tab; the next step is that every line knows what it is about and can take you there.

## 7b. Raidable warband bases (wishlist, 2026-09-25 — asked for, NOT built)

Round 26 put five enemy **warbands** in the world (`js/warbands.js`, `data/warbands.json`): the
Sootwick Gang (goblin), the Ashtusk Horde (orc), the Thornmane Packs (beastkin), the Unburied Legion
(undead) and the Stonehide Clans (giant). Each holds whole zones and fields melee, rogue, ranged,
caster and leader bodies. The user wants a next step: **a base per warband you can raid**. What it
would need, building on what exists:

- **Placement.** One base per held zone (or per two), put on a real World Forge node the way
  `js/sites.js` places strongholds — a `dungeon`/`landmark` cell away from roads and towns, never in
  the starting zone. The claim is already seeded per zone (`claimFor`), so the base can be too, and
  nothing new needs saving until it is taken.
- **The camp itself.** A race-themed layout from the building kit (`proctown/js/buildkit.js`): goblin
  scrap huts and a junk wall, orc palisade and bone totems, beastkin hide tents in a thorn ring, an
  undead barrow-fort, a giant's stone ring of standing slabs. `data/strongholds.json` + `sites.js`
  already build a stronghold with guards, a boss and a paid "taken" state — the base is that, dressed
  per warband, with its garrison drawn from the warband's own five members.
- **The raid.** Guards on posts and patrols (`js/patrols.js`), a leader-rank boss (a rare
  Warchief / Packlord / Deathmarshal / Mountainlord with a Name Forge name in `nameRace`), an alarm
  that pulls the patrols in, and a sealed war-chest that opens only when the garrison is down (the
  rule round 25 gave event chests).
- **Consequences.** Taking a base should LOOSEN the warband's hold: `spawnShare` for that zone drops
  (fewer of them on the road), the zone's claim can flip to nobody after every base in it falls, and a
  warband can retake it after N days with a counter-raid on your Holding (`js/raid.js` /
  `js/defence.js` already run raids — a warband-themed wave is a data change). Territory standings
  could pay for it: the factions whose ground a warband sits on (`data/factions.json` rivals) are
  grateful.
- **Loot.** Warband-flavoured rewards: a race-specific unique or set per warband (`js/uniques.js`
  injects at load, like the 184), trophies for the Holding, and a "war banner" you can plant.
- **Tests.** A base spawns in a held zone and never in an unheld one; its garrison is that warband's
  members; the chest stays sealed until the last guard falls; taking it lowers the zone's warband
  share; a save round-trips the taken state.
- **Size.** Medium. Placement, garrison and the sealed chest reuse sites/strongholds almost whole; the
  five layouts and the "hold loosens / counter-raid" loop are the new work.

---

## 8. If I had to pick an order

1. **§2 Scanning and discovery** — it is the one that makes the existing world into content.
2. **§1.2 Research branches** — small once §2 gives it something to gate.
3. **§4 Follower traits and loyalty** — cheapest large gain, libraries already in the repo.
4. **§5 Pools and power** — the base stops being scenery; the code exists in the sibling prototype.
5. **§3 Vehicle fuel/terrain + the crawler and the hauler** — travel becomes a decision.
6. **§6 Ecology and seasons** — the long tail, best done once there is a reason to be outside.

---

## 9. Things deliberately NOT on this list

- **Multiplayer.** Every system above assumes one save and one authority. Adding it later is a
  rewrite; it is not a feature.
- **A second art style.** Visual polish is not a goal of the playground (house rule 8).
- **Anything that names another game in player-facing text** (house rule 9). Several ideas above are
  openly borrowed; the names stay in this file and in chat.
