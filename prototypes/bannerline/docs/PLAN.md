# Bannerline — Final plan (refined after the roast)

Status: **final for build**, 2026-10-03. Supersedes `docs/plan-v1.md` wherever they differ.
Inputs: `docs/research.md` (the genre, with sources), `docs/plan-v1.md` (first design),
`docs/roast.md` (the critique, 20 changes + 5 risks). Every roast change is answered in §2.
Third-party game names appear only in `docs/research.md` and `docs/roast.md`; this page refers to
"the old lane-war maps" (playground convention 9).

The economy in this plan is **not asserted — it is simulated**: `tools/econ-sim.mjs` reads the same
data files the game will read and checks 12 pass/fail rules. Current result: **12/12 pass** at 30 and
at 45 seeds per cell. Run it again after any change to `data/econ.json`, `data/units.json`,
`data/races.json` or `data/damage.json`.

---

## 1. The game in one paragraph

Each team guards a **Keep** flying **banners** at the bottom of its own walled field. You fight with
your hero to stop whatever comes down your field, and you **muster**: spend gold to send units into
the *enemy's* field. Every send raises your **income**, paid every 10 s, but each unit has a limited
**stock** that refills over time, so income grows steadily rather than snowballing. Sends you buy
march out **together on the next Pay**, so the defender sees them coming. A unit that reaches the
enemy Keep tears down banners. Spare gold goes into a real equipment screen (8 slots, bag, rarities,
affixes, a set and uniques). Last team with banners wins, and the **Rising Tide** clock guarantees
the match ends. Heroes: Warrior, Ranger, Pyromancer, Druid (from Farhold). Races: The Freeholds,
Ashtusk, The Unburied, Thornmane. Modes: 1v1, 2v2, 3v3, two players on one screen, online by room
code (co-op vs AI or PvP), AI at three difficulties, and a three-mission campaign.

---

## 2. Roast responses

| # | Roast change | Response | Where |
|---|---|---|---|
| 1 | Stock-limited sends, spawn on next Pay, cut tax + repeat falloff, prove a linear income curve | **Accepted.** Built into the econ sim and the data. Income gain m20–30 ÷ m5–15 is ≤ 1.74 for every race × strategy (exponential growth would be ≫ 2). Tax and falloff are gone | §3 |
| 2 | Pressure per gold rises with tier; leak per purchase | **Accepted.** T6 effective HP/gold is 2.25–2.72× the T1 average; leak is per purchase (packs split it). Both are econ-sim checks and become unit tests | §3.2, §3.4 |
| 3 | Hero armour class from the chest item; damage-swap item; make unit damage types matter | **Accepted, extended.** Chest sets the hero's armour class; units' damage types hit it through the same table. A Latin-square table (each type has exactly one strong and one weak armour, ±15%), **champions are `fortified`** (no weakness) so the match-ending unit is never decided on the pick screen, and a shop **Oil** turns half the hero's damage into a chosen type. Measured spread after removing race strength: 2–9 points per hero | §5.2 |
| 4 | Per-gate lanes for the first ~60%, merge near the Keep; team bounty pool | **Accepted.** 1v1 unchanged | §4.2 |
| 5 | Vertical slices; ugly playable 1v1 first | **Accepted.** M1 is a browser-playable 1v1 vs a dumb AI with one race and one hero, capsules, KB+M. Split screen + gamepad + lobby is M2 | §20 |
| 6 | Doubles + banned functions, own trig, tie-broken sorts, no object-as-map, data hashed into the start packet, rng required on imported rollers | **Accepted** as written | §11.2 |
| 7 | Sim state is plain data; timed effects as `{atTick,…}`; don't import `uniques.js` | **Accepted.** Uniques are re-expressed as data rows run by the same effect handlers as skills | §6.3, §7.4 |
| 8 | Lockstep in a Worker; hidden tabs; offline delay 1 tick; stick commands with redundancy | **Accepted** | §11.3–11.5 |
| 9 | Cut content for v1 | **Accepted with two changes:** the race tech is replaced by the race's visible economy trait (#20), and the shop sells rare/legendary **rolls** at the top end (seeded, no reroll) because the sim showed items need a late gold sink to stay competitive | §5, §7 |
| 10 | Gamepad muster as a 4-send deck + auto-send; two-press rule; every screen pad-only | **Accepted.** The AI uses the same deck | §9.2 |
| 11 | One parametric AI; decisions-only win-rate bar; visible counter-send toasts | **Accepted.** Difficulty names changed to Recruit / Veteran / **Commander** ("Warlord" sits too close to a Farhold talent and to third-party titles) | §8 |
| 12 | Bake icons with a tool; main renderer + render target at runtime; portrait as a scissored viewport | **Accepted** | §16 |
| 13 | `bench.html` first; move `compactCreature` into avatar-3d; pre-warm; team rings; contact shadows | **Accepted.** The bench is an M1 task and decides the impostor question with a written rule | §15 |
| 14 | One keyboard seat; mouse acts only in its half; pad mapping fallback + remap; duplicate-pad guard; join keys ignored while typing; https for gamepads | **Accepted.** Verified: Chrome *and* Firefox return no gamepads on plain `http://` LAN URLs. Dev https plan in §9.5 | §9 |
| 15 | BroadcastChannel first; PeerJS with timeout, plain error, "ID taken" recovery; fixed delay from lobby ping; snapshot resync; no host migration | **Accepted** | §11 |
| 16 | Names: short warband names, Tuskchief, Bombard Crew, Hardened, cut the portal scroll; banned-terms test; flag Farhold's "Horde" | **Accepted.** Bombard Crew is cut with the roster trim; also renamed Shieldwall → **Shieldbearer**. Farhold's `warbands.json` "The Ashtusk Horde" is flagged to the owner in the report (not edited here) | §5, §22 |
| 17 | T2 at 1:30, Rising Tide 20:00, hard cap 32:00 | **Accepted with sim-tuned numbers:** T2 1:30, Rising Tide **21:00** (every 2 min after), hard cap 32:00. Median match 19.1 min, p90 28.1, 0% reach the cap | §3.5 |
| 18 | Add the 15 tests in §8 of the roast | **Accepted**, all 15 listed | §19 |
| 19 | Rival strip in the HUD | **Accepted** | §17 |
| 20 | One visible, rule-bending economy trait per race | **Accepted**: Drilled Muster, Cheap Steel, Grave Tithe, Running Packs (numbers sim-tuned) | §5.1 |

Roast risks are revisited in §21.

---

## 3. Economy — proven by simulation

### 3.1 Rules (what the game does)

- **Pay** every 10 s: gold += income. Start: 120 gold, income 20.
- **Stocks:** every unit has `stock` charges and regains one every `restock` s. You can only buy a
  unit with a charge left. This caps how fast anyone can add income, which is what keeps income
  roughly linear (max ≈ 46 income per minute once every tier is open).
- **Send on Pay:** a purchase is queued and spawns at your gate on the **next Pay**, together with
  everything else you bought that interval, as one wave. The defender sees the wave as icons over
  the gate in the 10 s before it arrives (the **gate preview**).
- **Income per gold falls with tier, pressure per gold rises** (§3.2). Champions add no income.
- **Bounty** goes to the defending team's **pool**, split evenly: 15% of cost for T1–T3, 20% T4,
  30% champions (expensive units feed the defender, the genre's natural brake). Tide kills pay a
  flat amount by level.
- **Rally** (catch-up, shown on the HUD): +10% bounty and XP per full 20% of banners behind, cap +30%.
- **Muster** ranks I–III per player: +10% HP and damage to all your sends each (250 / 600 / 1,200 g).
- **Items** are the other gold sink (§7). Equipment is bought from anywhere via **Requisition**
  (arrives after 4 s; cancelled if you die).
- **Rising Tide** (the end clock): from 21:00, every 2 min, Tides jump 5 levels, leaks count
  ×1.5 then ×2.0, ×2.5…, and tier-4+ stocks refill 50% faster per step (pressure only, income stays
  linear). Hard cap 32:00: more banners wins; equal banners → more total damage dealt to the enemy
  Keep (the sim counts this as a draw).
- **Cut from v1:** income tax, repeat-buy falloff, Keep bolt, shrine, Last Muster.

### 3.2 Tier templates (`data/units.json` is built from these)

| Tier | Cost | Income / gold | +Income | Payback | HP / gold | DPS / gold | Leak / purchase | Stock | Restock | Unlocks | Bounty |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | 12 | 0.15 | 1.8 | 67 s (6.7 pays) | 10 | 0.70 | 1 | 3 | 30 s | 0:00 | 15% |
| T2 | 40 | 0.12 | 4.8 | 83 s | 13 | 0.65 | 2 | 2 | 40 s | 1:30 | 15% |
| T3 | 100 | 0.08 | 8.0 | 125 s | 16 | 0.60 | 4 | 3 | 45 s | 5:00 | 15% |
| T4 | 240 | 0.05 | 12.0 | 200 s | 20 | 0.55 | 5 | 3 | 35 s | 9:00 | 20% |
| T6 champion | 700 | 0 | 0 | — | 23 | 0.50 | 10 | 1 | 50 s | 15:00 | 30% |

Per unit, HP is then scaled by: a per-unit tweak (role), `(3.0 / speed)^0.35` (time on the road is
defence time, so fast units carry less), and **÷ the trait's toughness factor** (a trait that makes
a unit tougher is paid for in base HP — traits are flavour, not free value). Each race then has a
runtime `hpMult` (races.json, 0.95–1.09) set by balancing. (T5 is reserved for later rosters.)

### 3.3 The 24 units (v1: 6 per race)

HP and DPS are **per body**, before the race `hpMult`. Costs/income shown before race traits.

| Race | Unit | T | Cost | +Inc | HP | DPS | Bodies | Armour | Dmg | Speed | Range | Leak | Traits |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Freeholds | Levy | 1 | 12 | 1.8 | 120 | 8.4 | 1 | light | blade | 3.0 | 1.5 | 1 | — |
| | Hill Slinger | 1 | 12 | 1.8 | 88 | 10.9 | 1 | light | pierce | 3.2 | 9 | 1 | — |
| | Shieldbearer | 2 | 40 | 4.8 | 588 | 20.8 | 1 | heavy | blade | 2.4 | 1.5 | 2 | guard |
| | Hedge Priest | 3 | 100 | 8.0 | 1,093 | 36 | 1 | light | nature | 2.8 | 10 | 4 | heal |
| | Iron Golem | 4 | 240 | 12 | 4,954 | 132 | 1 | heavy | blade | 2.2 | 2 | 5 | hardened |
| | Banner Marshal | 6 | 700 | 0 | 14,342 | 350 | 1 | fortified | blade | 2.8 | 2 | 10 | champion |
| Ashtusk | Ashtusk Raiders | 1 | 12 | 1.8 | 51 | 4.6 | 2 | light | blade | 3.6 | 1.5 | 1 | pack |
| | Spearthrower | 1 | 12 | 1.8 | 88 | 10.9 | 1 | light | pierce | 3.2 | 8 | 1 | — |
| | Ashtusk Brute | 2 | 40 | 4.8 | 572 | 26 | 1 | hide | blade | 3.0 | 1.6 | 2 | enrage |
| | Bonecaller | 3 | 100 | 8.0 | 1,067 | 48 | 1 | light | fire | 3.0 | 10 | 4 | heal |
| | Tuskback | 4 | 240 | 12 | 4,800 | 145 | 1 | hide | blade | 3.0 | 2.2 | 5 | enrage |
| | Tuskchief | 6 | 700 | 0 | 13,003 | 385 | 1 | fortified | blade | 3.2 | 2 | 10 | champion |
| Unburied | Shambler | 1 | 12 | 1.8 | 154 | 6.7 | 1 | spectral | blade | 2.2 | 1.5 | 1 | — |
| | Crow Murder | 1 | 12 | 1.8 | 25 | 3.1 | 3 | light | pierce | 4.4 | 5 | 1 | pack, flying |
| | Gravecreeper | 2 | 40 | 4.8 | 297 | 26 | 1 | spectral | blade | 3.0 | 1.5 | 2 | rise |
| | Ghoul | 3 | 100 | 8.0 | 1,430 | 69 | 1 | hide | blade | 3.6 | 1.5 | 4 | feast |
| | Bone Colossus | 4 | 240 | 12 | 5,378 | 119 | 1 | heavy | blade | 2.0 | 2.4 | 5 | hardened |
| | Deathmarshal | 6 | 700 | 0 | 11,186 | 350 | 1 | fortified | fire | 2.6 | 2 | 10 | champion, raise |
| Thornmane | Wolf Pair | 1 | 12 | 1.8 | 51 | 4.2 | 2 | hide | blade | 4.2 | 1.4 | 1 | pack |
| | Thornmane Tracker | 1 | 12 | 1.8 | 86 | 10.9 | 1 | light | pierce | 3.4 | 10 | 1 | — |
| | Thornmane Mauler | 2 | 40 | 4.8 | 508 | 27 | 1 | hide | blade | 3.2 | 1.6 | 2 | bleed |
| | Saber Cat | 3 | 100 | 8.0 | 1,188 | 72 | 1 | hide | blade | 5.2 | 1.6 | 4 | pounce |
| | Thornback | 4 | 240 | 12 | 4,444 | 125 | 1 | heavy | blade | 3.0 | 2 | 5 | hardened |
| | Packlord | 6 | 700 | 0 | 9,851 | 385 | 1 | fortified | blade | 3.6 | 2 | 10 | champion, pack_call |

**Traits (12 + pack_call):** pack, flying, guard, heal, hardened, enrage, rise, feast, bleed,
pounce, raise, champion (+ pack_call on the Packlord). Definitions in `data/units.json` `traits`.

### 3.4 What the simulation shows

`node tools/econ-sim.mjs` (30 seeds per cell, about 45 s). Four strategies, each a different answer
to "send or equip?": **income** (only the best income-per-gold sends, leftovers to items),
**pressure** (best pressure-per-gold sends, leftovers to items), **balanced** (70% of each Pay to
sends scored half income/half pressure, rest to items, Muster from 6:00), **items** (from 3:00,
spend 30% of each Pay on equipment *first*). Plus one-unit spam, a no-top-tier variant and a
no-equipment variant for the checks.

**Income per Pay (balanced, mean, endless mode so every curve runs 30 min):**

| Race | m0 | m5 | m10 | m15 | m20 | m25 | m30 |
|---|---|---|---|---|---|---|---|
| Freeholds | 20 | 105 | 286 | 524 | 746 | 1,037 | 1,462 |
| Ashtusk | 20 | 106 | 285 | 500 | 699 | 961 | 1,344 |
| Unburied | 20 | 104 | 286 | 524 | 746 | 1,037 | 1,462 |
| Thornmane | 20 | 107 | 294 | 533 | 758 | 1,052 | 1,482 |

Roughly linear (≈ +45–50 income per minute), with a mild upturn after 21:00 from the Rising Tide's
faster tier-4 restocks. The old v1 model reached 60,000 per Pay by minute 15.

**Other measures (balanced player):** peak bodies it puts on an enemy field **26–31** (cap 60);
average 10–12; equipment bought by 20:00 ≈ **22,400 g**; hero level at 20:00 ≈ 16.7; banners lost per
5 min while defending ≈ 83–91 *in endless mode* (the match is over long before; this is the leak
pressure the end clock creates).

**Race vs race (both balanced, random heroes):** overall 50 / 49 / 50 / 51 %, every pairing 47–53 %.

**Strategy vs strategy (row wins %):**

| | income | pressure | balanced | items |
|---|---|---|---|---|
| income | — | 1 | 1 | 39 |
| pressure | 99 | — | 52 | 87 |
| balanced | 99 | 48 | — | 86 |
| items | 61 | 13 | 14 | — |

Pure greed (income only, never pressure) and over-equipping both lose, and pressure ≈ balanced.
No strategy beats every other by ≥ 60%.

**Hero vs enemy race (row hero's win rate when facing that race):** warrior 47–55, ranger 49–53,
pyromancer 42–51, druid 48–54 %. Overall 50 / 52 / 46 / 51 %.

**Match length:** median **19.1 min**, p10 17.0, p90 28.1, **0%** reach the 32-min cap.

**Verdict (all 12 pass):**

| Check | Rule | Result |
|---|---|---|
| No runaway income | gain m20–30 ÷ gain m5–15 ≤ 2.0, every race × strategy | worst 1.74 |
| Bodies bounded | peak bodies on a field < cap 60 | 31 |
| No dominant race | every race 45–55% overall, every pairing 35–65% | 49–51%, 47–53% |
| No dominant strategy | none wins ≥ 60% against every other | see table |
| No dominant unit | one-unit spam wins ≤ 45% vs balanced | 0% (see limits) |
| Gold spread | no unit > 45% of a balanced player's send gold; every unit ≥ 2% | max 41% (Tuskchief), min 3% |
| Top tiers worth buying | T4+T6 ≥ 20% of send gold, and balanced beats no-T4/T6 ≥ 55% | 73–75%; 100% |
| Pressure rises with tier | T6 effective HP/gold ≥ 2× the T1 average | 2.25–2.72× |
| Items compete | balanced spends 30–65% on equipment; beats a no-equipment player ≥ 70%; items-first ≥ 25% | 58%; 99–100%; 29% |
| Heroes balanced | each hero 42–58% overall | 46–52% |
| No hard counter | after removing race strength, per-hero spread ≤ 25 pts; cells 30–70% | 2–9 pts; 42–55% |
| Match length | median 18–28 min, cap ≤ 10% | 19.1 min, 0% |

**How we got here (iterations worth remembering):** v1 rules compounded; stocks alone left gold
piling up with nothing to buy (every game hit the cap); champions at 2 stock ended every match in a
cliff at their unlock; the counter table at ±25% plus spectral-heavy Unburied made two heroes lose
that matchup 70%+; trait toughness given for free made Unburied win 90%; Cheap Steel as "cheaper but
same stock" made Ashtusk *weaker* because stocks, not gold, are the limit. Each fix is in the data.

**Limits of the model (be honest about these):** it has no positions, no skills and no AI micro;
traits are an HP factor; the hero is a DPS/HP curve with an AoE factor. The one-unit-spam check
passes trivially (one unit alone cannot do anything), so the real "dominant unit" guard is the gold
spread check plus playtests. The median sits near the low end of the target (19 of 18–28 min):
expect real matches to run longer because real defence is imperfect *and* real attackers misplay.
The real sim gets `tests/economy-bounds.test.js` asserting the same 12 verdicts on the real code with
the Commander AI, and the numbers are re-tuned there.

### 3.5 Clock (`data/econ.json`)

| | Value |
|---|---|
| Sim tick | 20 Hz |
| Pay | 10 s |
| Tide | every 40 s, 4 bodies, level = Tide number |
| Tier unlocks | T1 0:00, T2 1:30, T3 5:00, T4 9:00, T6 15:00 |
| Hero respawn | 5 + level s, cap 25 s |
| Rising Tide | 21:00, every 2:00 |
| Hard cap | 32:00 |
| Banners | 1v1 70, 2v2 90, 3v3 110 |

---

## 4. Map

### 4.1 One map in v1: `vale`, sized per mode

Each team owns a walled field 140 m long, units walking top → bottom to the Keep. Width grows by
one road per extra enemy player (1v1 48 m, 2v2 64 m, 3v3 80 m). One ford (slows 25%), the
**Armory** (shop + muster post + respawn) beside the Keep, the Keep with physical banners that drop
as they are lost. Both fields sit side by side in one world, 40 m apart.

### 4.2 Per-gate lanes

One gate per enemy player. For the first ~60% of the field each gate has its **own lane**, separated
by a low wall that heroes cross at two gaps; the lanes merge for the last 40% before the Keep. In
team games "your" lane is the one your direct rival sends down; you can rotate to help. In 1v1 there
is one lane. Bounty goes to the team pool, split evenly, so nobody steals kills.

### 4.3 Team spell: Toll of Iron

Cast from the Keep by any teammate: stuns every enemy unit in the field for 3 s; 150 s shared
cooldown. Covers a death or a spike.

Maps are data (`data/maps.json`: field size per mode, lane polylines, merge point, ford polygon,
Armory/Keep positions, decoration seed). `switchback` is added only if campaign mission 1 needs it.

---

## 5. Races, counters, units

### 5.1 Races (`data/races.json`)

| Race | Built from | Look | Identity (what the units do) | Economy trait (visible on the HUD) |
|---|---|---|---|---|
| **The Freeholds** | Chibi 2 human / dwarf / halfling + class outfits; golem recolour | blue and steel, tabards | guard, heal, hardened | **Drilled Muster** — Muster upgrades cost 30% less |
| **Ashtusk** | Farhold warband `ashtusk` (Chibi 2 orc) + new Tuskback | red-black, bone, war paint | packs, enrage, cheap and many | **Cheap Steel** — tier 1–4 units cost 15% less, add 10% less income, and hold one more in stock |
| **The Unburied** | Farhold warband `unburied` (Chibi 2 undead) + new Ghoul, Bone Colossus, Crow | pale cyan glow, rags | rise, raise, feast, flying crows | **Grave Tithe** — a unit that reaches the enemy Keep refunds a quarter of its cost |
| **Thornmane** | Farhold warband `thornmane` (Chibi 2 beastkin) + wolf, saber cat, Thornback | green-brown fur | fast, packs, bleed, pounce | **Running Packs** — pack units restock 15% faster |

Always show the warband `short` name (never its `name` field). Sootwick goblins and Stonehide giants
are the obvious races 5–6 later.

### 5.2 Damage, armour and the hero's armour class (`data/damage.json`)

Damage types: **blade** (Warrior), **pierce** (Ranger), **fire** (Pyromancer), **nature** (Druid);
units deal blade (melee), pierce (ranged) or fire/nature (casters).

| dmg \ armour | light | heavy | spectral | hide | fortified |
|---|---|---|---|---|---|
| blade | **115** | 90 | 100 | 100 | 100 |
| pierce | 100 | 100 | 90 | **115** | 100 |
| fire | 100 | 100 | **115** | 90 | 100 |
| nature | 90 | **115** | 100 | 100 | 100 |

- A Latin square: every type has one strong and one weak armour, every armour one of each.
- **Champions are fortified** (100% from everything).
- **The hero's armour class is its chest item:** cloth → spectral (warded robes), light → light,
  medium → hide, heavy → heavy. Units hit the hero through the same table, so a Warrior in plate
  invites nature casters, and swapping chests is a visible counter-move.
- **Oil** (shop, 80 g, from 0:00): coats the weapon so half the hero's damage becomes the chosen
  type. A bad matchup costs gold, not the game.
- The muster panel shows each unit's armour vs each enemy hero's current damage mix as a
  green / amber / red pip, so counter-sending needs no wiki.

### 5.3 Upgrades

Muster I–III (§3.1). The race's economy trait replaces v1's race techs.

---

## 6. Heroes

### 6.1 Common rules

- Level 1–20 per match, XP from kills in your field shared by teammates within 20 m (`xpTable` in
  `data/econ.json`; level ≈ 10 at 12:00, ≈ 17 at 20:00).
- Skills: **Q W E** basic (3 ranks) + **R** ultimate (unlocks at 6). One skill point per level.
  (Warrior, Ranger and Pyromancer also have **D**; the Druid's D is its shape toggle.)
- **One talent pick at level 6** (two choices, both lifted from that hero's Farhold talent tier 1).
  Tiers at 12/18 come after v1.
- Damage = weapon hit × skill `mult` (Farhold's multipliers kept, weapon numbers are Bannerline's
  own; Farhold item stats are not imported raw). Ranges from Farhold are halved for the top-down
  camera; radii kept. Elements map: physical → blade (Warrior) or pierce (Ranger), fire → fire,
  nature → nature.
- Econ-model class curve (`data/econ.json hero.classes`, balanced by the sim): Warrior dps ×1.06 /
  HP ×1.25 / AoE 0.9; Ranger 1.32 / 0.90 / 0.5; Pyromancer 1.00 / 0.80 / 1.3; Druid 1.08 / 1.05 /
  0.8 + 1%/s self-heal. Base 24 dps + 9/level, 560 HP + 60/level.

### 6.2 Kits (Farhold source id → Bannerline)

| Hero | Q | W | E | D | R (ult) | Talent at 6 (pick one) |
|---|---|---|---|---|---|---|
| **Warrior** (melee, blade) | Cleave `cleave` | Breaching Shove `breaching_shove` | War Cry `warcry` (taunt pulls lane units onto you) | Iron Resolve `iron_resolve` | Iron Gyre `whirlwind` | Reaping Arc / Hooked Edge (Cleave) |
| **Ranger** (ranged, pierce) | Long Draw `aimed_shot` | Hunter's Snare `hunters_snare` | Broadhead Fan `multi_shot` | Tracker's Leap `trackers_leap` | Arrow Storm `rain_of_arrows` | Wide Fan / Tight Fan (Broadhead Fan) |
| **Pyromancer** (ranged, fire) | Firebolt `firebolt` | Burning Line `fire_wall` | Flashover `flashover` | Cinder Stride `ember_stride` (id only; never shown) | Fallstone `meteor` | Cinder Spray / Slow Burner (Firebolt) |
| **Druid** (hybrid, nature) | Thornlash `thornlash` (Bramble Gore in Briarback) | Greensap `renew` (Thornswell in Briarback) | — | Briarback Shape `briarback_shape` (toggle; boar body) | Call the Pack `call_wolf` (2 Grove Wolves + howl) | Thorn Fan / Barbed (Thornlash) |

Ranger passive **Quarry**: every 4th basic attack marks the target (+20% damage taken, 6 s).
Groundbreaker, Fenrunner and Sporecap are after v1.

### 6.3 The skill runtime (new, small, built for lockstep)

Farhold's executor lives inside its 11,000-line `main.js`, so Bannerline writes its own. Only the
**data** is reused, copied by `tools/build-hero-skills.mjs` from Farhold's `data/skills.json` into
`data/heroes.json`, which **fails loudly** if a kept skill uses a key outside this vocabulary. Plan
folding (talent mods into a cast plan) may reuse Farhold's pure `applyMod()` from
`js/skillmech.js` via an adapter (it imports only `shared/format.js`).

**Shapes (9):** `melee` (arc + reach), `around` (radius), `bolt` (range, projectiles, spread,
splash, pierce), `ground` (point + radius; `repeats {count, every, scatter}`; `line {length, width}`),
`dash` (range, direction, path splash), `self`, `summon` (pet, count), `form` (toggle: stat block,
basic-attack override, per-skill overrides), `place` (trap: arm, trigger radius, max, life).

**Effects (14):** `damage` (mult × weapon, element), `status` (id, seconds; `stack {add, max}`;
lockout), `knock {push, stagger}`, `pullIn`, `taunt {radius, seconds}`, `selfBuff` (stat mods,
seconds, per-foe scaling), `pool` (ground zone: seconds, radius, power, slow), `detonate` (consume
statuses for a share of their remaining damage), `empowerNext`, `bonusIf` (crowd / distance),
`pen` (armour pierce), `trail` (pools along your path), `everyNthHit` (shockwave), `heal`
(regen status or burst).

**Statuses (9):** burn (stacks), bleed (stacks), root, stun, slow, quarry (+damage taken), might,
regen, haste.

**Talent mod keys (8):** `set`, `add`, `mul`, `knock`, `pullIn`, `pool`, `statuses`, `forms`.

Every timed thing is data in sim state: `{ atTick, kind, args }`. A test moves every vocabulary key
to an odd value and checks the sim responds (dead-data guard).

---

## 7. Inventory and equipment

### 7.1 Slots and screens

- **8 equipment slots:** weapon, off-hand, head, chest, hands, feet, neck, ring. Two-handers take
  the off-hand. **Bag 12. Belt 2** (potions; 1/2 keys, d-pad left/right).
- **Auto-loot:** drops show a rarity beacon for a beat, then fly to the hero. Pickup prompts
  "**Equip** (better by +X)" — one button.
- Shop top row: **Buy recommended** (one button). The rule: **any upgrade is at most two presses
  away**, by mouse or pad.
- Character panel takes the bottom 60% of *that player's* half; the field stays visible above.
  Tested at 1366×768 split in two.

### 7.2 What the shop sells (the econ model's item steps)

Each slot upgrades through seven steps; a step replaces the last. The first five are base tiers;
steps 6–7 are a **rare** and a **legendary roll** of the top base (seeded affixes, no reroll).

| Step | Cost | Unlocks | +damage | +HP | +armour |
|---|---|---|---|---|---|
| 1 Plain | 60 | 0:00 | 3% | 30 | 1 |
| 2 Fine | 160 | 2:00 | 4% | 45 | 1 |
| 3 Superior | 380 | 5:00 | 5% | 60 | 1 |
| 4 Masterwork | 850 | 9:00 | 6% | 80 | 2 |
| 5 Exquisite | 1,600 | 13:00 | 7% | 100 | 2 |
| 6 Rare roll | 2,800 | 17:00 | 8% | 120 | 2 |
| 7 Legendary roll | 4,500 | 21:00 | 9% | 150 | 3 |

Plus potions (25 g, heal 40%), Oil (80 g), and Requisition delivery from anywhere. Drops from Tides,
sends and the champion 3-card pick (`shared/rewards.js` `showRewards({…, choose: true})`) are extra
value the econ model does not count.

### 7.3 Affixes and rarity

- Bases from the shared `prototypes/emberveil/data/items.json` (the file Farhold reads), filtered by
  `data/items-bl.json` to bases the four heroes use.
- **16 affix stats**, each with a sim handler and a test: damage %, attack speed, crit chance, crit
  damage, max HP, armour, HP regen, life steal (physical basics only), cooldown reduction, mana, mana
  regen, move speed, area %, bounty %, damage vs champions, resist all.
- Rarity counts asserted once: magic 2, rare 3, legendary **5** (items.json says [5, 6]; Bannerline
  pins 5).
- Rolling uses Farhold's pure `js/affixes.js` (`rollAffixValue`, `affixAllowed`, `capValue`,
  `roundFor`, `tierFor`) **only through `js/sim/adapters/affixes.js`**, which requires the sim's rng
  argument (the originals default to `Math.random`). Item levels 1–30; Farhold's top two tiers are
  never advertised.

### 7.4 Uniques and a set

- **2 uniques per hero (8):** rows copied by `tools/build-uniques-bl.mjs` from Farhold's
  `data/uniques.json` (name, flavour, numbers) and re-expressed with the §6.3 effect vocabulary
  (`onHit`, `onKill`, `everyNthHit` …). Farhold's `uniques.js` is never imported (it queues
  closures and pulls in Farhold world code).
- **1 generic 3-piece set**, *Keepwarden's Kit* (2: +1 Toll of Iron charge; 3: +15% damage within
  15 m of your Keep).

---

## 8. AI — one AI, three settings

The AI runs inside the sim (identical on every peer), reads only sim state, draws from its own rng
stream and acts through the same commands and the same **deck** as a human.

| Knob | Recruit | Veteran | Commander |
|---|---|---|---|
| Reaction (ticks) | 32 | 16 | 7 |
| Greed (send share of each Pay) | random 0.3–1.0 | 0.7 (the econ sim's *balanced*) | adaptive: banner lead, time to Rising Tide, payback horizon |
| Counter-pick chance | 0 | 0.5 | 1.0 (+ flying/fortified when the defender has no answer) |
| Send estimator | off | batch when ≥ 1 Pay of gold | "cheapest wave that leaks" against the defender's estimated DPS and armour class |
| Hero micro tier | 0: nearest target, random skills | 1: lowest HP, AoE at ≥ 3, retreat at 30% | 2: target priority (healers, champions), kite if ranged, potions, Toll of Iron timing |
| Shopping | potions + Plain steps | best-scoring item (`scoreWeights` in items.json) | target build per hero, chest swaps vs the enemy race, Oil |

- **Decisions bar:** Commander with *Veteran's hero micro* must still beat Veteran ≥ 60% over 50 seeds
  (otherwise "hard" only means better clicking). Plain bars: Commander ≥ 70% vs Veteran, Veteran
  ≥ 80% vs Recruit.
- **Visible:** a toast when the AI counter-sends ("Commander switches to nature casters against your
  plate").
- **Budget:** three Commanders fit in the 2 ms tick (sim benchmark includes AI).
- The leaver replacement is Veteran.
- Skill combos (Shove a unit back into a Burning Line) are after v1.

---

## 9. Input and devices

### 9.1 Devices

- **Keyboard + mouse = one seat per machine** (browsers cannot tell two keyboards apart; the lobby
  says "One keyboard player per screen"). Right-click move/attack, Q/W/E/D/R cast at cursor, 1/2
  belt, A attack-move, S stop, Space centre camera, B shop, I character, Tab scoreboard, Z X C V the
  four deck sends (+Shift for auto-send).
- **Gamepad** (standard mapping, index-keyed): left stick moves, right stick aims (centred =
  auto-target), A attack/interact, X Y B RB skills, RT ult, LB + d-pad = deck sends (LB + d-pad
  held = toggle auto-send), d-pad alone = belt, View = character, Menu = pause/scoreboard, R3 cycles
  selection.
- Both devices emit the same commands. Stick movement is `moveDir` quantised to 16 directions × 3
  speeds, sent only on change.

### 9.2 The deck

Before the match (and at any Pay) each player pins **4 sends** to the deck; **auto-send toggles** fire a
send whenever its stock and your gold allow. The full roster is still clickable on the muster panel
with the mouse. The AI's send logic chooses from the same deck structure.

### 9.3 Ready-up claims a device

Lobby: "Press **Enter**/**Space** (keyboard) or **A**/**Start** (controller) to join." The press assigns
that device to the first open local slot and shows its icon; press again = ready; Esc/B = unready,
again = leave. Edge cases built in: join keys ignored while a text input has focus; pads polled every
frame (they are invisible until a button is pressed); a second pad index whose button pattern matches
a pad that joined in the same frame is ignored (Steam duplicate devices); identical pads keyed by
index and re-claimed by "Player 2, press A" after a disconnect; a pad that disconnects mid-match
sends idle commands so lockstep never waits on a local device.

### 9.4 Mapping

Chrome usually reports `mapping: "standard"`; Firefox on Linux often reports `""`. Ship a fallback
table for common ids (Xbox, DualShock/DualSense, 8BitDo) and a "press each button" remap screen when
the mapping is empty. Bindings in `data/bindings.json`, overrides saved per device type.

### 9.5 Gamepads need https (verified)

Chrome and Firefox both restrict the Gamepad API to **secure contexts**: on `http://192.168.x.x:8400`
`navigator.getGamepads()` returns an empty list (`localhost` is exempt, but the owner cannot use
localhost). **Without https the LAN user sees keyboard + mouse only;** the lobby detects
`!window.isSecureContext` and says so in one line, with the https link.

Plan:
1. **Dev https server:** add `--https` to `tools/serve.py` (Python `ssl` wrapping the existing
   handler) with a self-signed certificate generated once by `tools/make-dev-cert.sh` (openssl, SAN =
   the VM's LAN IP) into a git-ignored `tools/certs/`. Serve **8441** (https dev) next to 8401.
   First visit shows a browser warning; accept once per browser.
2. **GitHub Pages** (https already) for the stable build — gamepads work there with no setup.
3. Fallback guidance if the certificate is a nuisance: Firefox `about:config` →
   `dom.securecontext.allowlist` = the LAN IP; Chrome →
   `chrome://flags/#unsafely-treat-insecure-origin-as-secure` with `http://<LAN IP>:8401`.
Checked on day 1 of M2.

---

## 10. Split screen

- Two local humans → side-by-side vertical halves. One `WebGLRenderer`, two cameras, scissor +
  viewport per half, one scene (both fields are in the one world). Contact shadows only (no shadow
  map pass per camera).
- Each half has its own control bar, minimap, toasts and open panels; scoreboard shared at the top.
- **No pointer lock:** the mouse acts only inside the keyboard player's half; over the other half its
  cursor is drawn dimmed and clicks do nothing.
- Every screen (lobby, shop, character, results) is **fully usable by pad alone** (a pad+pad couch
  game has no mouse player) — a hard requirement for every UI stream.
- Local players can be teammates (both views on one field) or opponents.

---

## 11. Online

### 11.1 Model

Deterministic lockstep: every peer runs the whole sim; only commands cross the network. 20 Hz tick.
Commands for tick T are issued at T − D. **D is fixed per match**, chosen in the lobby from measured
ping (2–8 ticks); **offline and split-screen D = 1**. A tick runs when every human slot's packet for
it has arrived (empty packets are heartbeats). AI slots need no packets. Star topology through the
host (room creator). Up to 6 players.

### 11.2 Determinism rules (enforced by `tests/sim-purity.test.js`)

- Doubles are fine (+ − × ÷ and `Math.sqrt` are exactly specified). **Banned in `js/sim/**` and in
  anything it imports:** `Math.random`, `Date`, `performance.now`, `Math.sin/cos/tan/asin/acos/atan/
  atan2/sinh/cosh/tanh/exp/expm1/log/log1p/log2/log10/pow/hypot/cbrt`, and the `**` operator. The
  sim has its own polynomial `sin/cos/atan2` in `js/sim/mathx.js` using only basic arithmetic.
- **Sorts:** only through `sortBy(arr, key, tieKey='id')` in `js/sim/order.js`; the purity test fails
  on any bare `.sort(` in the sim (V8 and SpiderMonkey use different sort algorithms).
- **No object-as-map in state** (integer-like keys iterate numerically first): arrays in id order,
  or `Map`.
- **Seeded rng everywhere:** `sfc32` with separate streams (combat, loot, AI, shop). Any roller
  imported from outside `js/sim/` goes through an adapter in `js/sim/adapters/` that *requires* the
  rng argument; the purity scan follows imports.
- **State is plain serialisable data**: no closures, no class instances with methods, no Three.js
  references. Timed effects are `{ atTick, kind, args }`.
- **Frozen data, hashed:** all `data/*.json` are deep-frozen at load and hashed; the hash rides in the
  start packet, and a mismatch stops the lobby with "Version mismatch: update and rejoin".
- **State hash** every 20 ticks (FNV-1a over a canonical field list, positions quantised with
  `Math.round(x * 1000)`); hashes ride on command packets.

### 11.3 Worker clock and hidden tabs

The sim and the lockstep clock run in a **dedicated Worker** (not frame-throttled like
`requestAnimationFrame`); the view stays on rAF and interpolates. A peer whose tab is hidden
broadcasts it (`visibilitychange`); the others show "Waiting for <name> (tab hidden)" and after 20 s
offer "Replace with AI". If M5 measurement shows workers throttled too, the same banner covers it.

### 11.4 Transport layer (swappable)

```
js/net/transport.js   createTransport(kind, opts) -> { host(), join(code), send(to|'*', msg),
                      onMessage(fn), onPeer(fn), rtt(peer), close() }
js/net/loopback.js    in-process bus with injectable latency/jitter/drop (node tests)
js/net/channel.js     BroadcastChannel between tabs (Playwright two-page test, no internet)
js/net/peerjs.js      PeerJS data channels (vendor/peerjs, MIT)
js/net/lockstep.js    the protocol, transport-agnostic
```

PeerJS specifics: room code = 5 letters (no I/O/0/1) → peer id `bannerline-<code>`; **10 s connect
timeout** with a plain error ("Your networks can't reach each other directly. Try another network,
or host from the other machine."); on "ID is taken" generate a new code; stick commands are repeated
for the last 3 ticks in every packet and sent on an **unordered, unreliable** channel
(`{ reliable: false }`) so one lost packet never stalls the stream; lobby/control messages use a
reliable channel. **No host migration:** "Host left — match ended, results saved."

### 11.5 Desync, disconnect, rejoin

- Desync: host sends a state snapshot, the peer replaces its state (a 1-second hiccup); the command
  log + both states are kept for `tools/desync-diff.mjs` (`?desyncdump=1`).
- Disconnect: host announces "slot X → Veteran AI from tick T" with T in the future.
- Rejoin is after v1 but free once snapshots exist.
- Lockstep means every client knows everything; accepted for friends' games.

### 11.6 Seats: couch + online + AI in one lobby

Slot kinds: Open, Local (0–2 per machine), Remote, AI (Recruit/Veteran/Commander), Closed. Any mix,
e.g. 3v3 with two couch players + one online friend vs three Commanders (**online co-op vs AI**), or
PvP across three machines. Each machine sends one packet per tick holding all its local players'
commands.

### 11.7 Upgrade path off the public broker

Unchanged from `plan-v1.md` §9.4 (verified 2026-10-03): **Cloudflare Workers + Durable Objects**
(one room per object, holds sockets for the whole match, can relay lockstep packets through any NAT)
**plus Cloudflare Realtime TURN** (1,000 GB/month free). Vercel's WebSocket functions (public beta
since 2026-06-22) cap connections at 300 s on Hobby; Cloudways means a server to keep alive. Not
built in v1; `js/net/cfrelay.js` + `server/cloudflare/` when PeerJS failures show up in testing.

---

## 12. Lobby and the match loop

1. **Title:** Play Local · Host Online · Join (code) · Campaign · Settings.
2. **Lobby:** mode, slots per team (kind + device icon + ping), race + hero + deck per human (own
   device), AI difficulty per AI slot. Host sets mode/slots and starts; everyone readies.
3. **Countdown 3-2-1:** host sends `{ seed, roster, rules, dataHash }`; every peer builds the same
   state; **all unit types of every roster are pre-built (Chibi 2 templates are async) during the
   countdown.**
4. **Match.**
5. **Results:** win/lose, banners left, per player income curve, sends by unit, gold on sends vs
   items, kills, deaths, the damage meter (`meters/`) → **Back to lobby** with slots, devices and peers
   kept.

---

## 13. Campaign — "The Long Muster" (3 missions)

A campaign is a list of chapters, one per hero later; v1 ships a **Prologue** playable with any hero
(plain-text dialogue with the hero's name swapped in). Mission file: map, player race/hero, enemy
slots (AI difficulty + a script of timed sends/Tides), modifiers, objectives, dialogue triggers, an
unlock reward. No stash in v1.

1. *First Banner* — vs Recruit, prompts teach move, kill, Pay, send, buy.
2. *Two Gates* — 2v2 with an AI ally vs two Veterans; teaches lanes, the team pool, Toll of Iron.
   Local co-op: the second couch player takes the ally slot.
3. *The Tuskchief Comes* — vs Commander; at 15:00 a scripted Tuskchief wave; kill it to win.

Progress in localStorage (`shared/store.js`, namespace `bannerline`).

---

## 14. New creatures and art

| Creature | Plan | Work | Used by |
|---|---|---|---|
| `tuskback` | quad | new `trunk` + `howdah` features (tusks exist) | Ashtusk T4 |
| `ghoul` | biped | new `hunch` posture, long arms (claws exist) | Unburied T3 |
| `bone_colossus` | biped | new `ribs`/bone surface on the titan frame | Unburied T4 |
| `crow` | bat | feathered-wing variant (beak exists) | Unburied Crow Murder (3 per send) |
| `thornback` | quad | **variant** of boar/turtle: `horns` + `plates` (both exist) | Thornmane T4 |
| `bl_iron_golem` | biped | **recolour** of golem in `creature-variants.json` | Freeholds T4 |

Each new type goes into `avatar-3d/js/creature-types.js` (+ a gallery row), a designed look in
`avatar-3d/data/creature-variants.json`, and a library entry (`library/data/defaults.json`, kind
`enemy`, id `bl_<id>`) so Farhold can use them later. Humanoid units are Chibi 2 looks from
`class-outfits.js` + the warband `defs`. No riders in v1 (no reusable mount helper exists).
**Move `compactCreature()`** from `prototypes/farhold/js/mesh-merge.js` to
`avatar-3d/js/mesh-merge.js` (Farhold's file re-exports it) and run every creature through it.
Team identity = a ground ring + banner sprite, never a recolour (colour changes rebuild Chibi 2
templates).

---

## 15. Performance

### 15.1 Budget

| Item | Budget |
|---|---|
| Live bodies per field | cap 60 (econ sim peak 31) |
| Actors drawn per viewport | ≤ 40 full actors (the number is confirmed by the M1 bench) |
| Draw calls | ≤ 300 per viewport, ≤ 600 split screen |
| Triangles | ≤ 600k per viewport |
| Spell FX | `BatchedSpellFx` |
| Sim | ≤ 2 ms per tick at 6 players × 60 bodies incl. 3 Commander AIs (node benchmark) |
| Frame | 60 fps on the owner's desktop; 30 fps floor split screen on integrated graphics; dynamic resolution 0.6–1.0 |

### 15.2 M1 crowd benchmark (decides the impostor question)

`prototypes/bannerline/bench.html` (+ `tools/bench-bannerline.mjs` modelled on
`tools/bench-chibi2.mjs`): 20 / 40 / 60 / 80 actors — a realistic mix of Chibi 2 humanoids and
merged creatures, walking and attacking with `BatchedSpellFx` — in 1 and 2 viewports. The owner runs
it on his machine (headless Playwright uses software rendering, so its frame times only catch
draw-call/triangle regressions), and the numbers go in the README.

**Decision rule:** let N be the largest actor count per viewport at which 2 viewports hold ≥ 55 fps on
the owner's machine. If N ≥ 40, no impostors. If 25 ≤ N < 40, actors beyond the nearest N per viewport
switch to a **cheap stand-in** (the unit's baked icon on a billboard + a capsule silhouette, one
`InstancedMesh` per type). If N < 25, add the stand-in *and* lower the per-field cap to 2N. The full
8-direction impostor atlas from v1 stays cut (~290 MB).

#### 15.2 results (stream C, 2026-10-03)

Built: `bench.html` + `js/bench/bench.js` (the real unit looks through `js/view/unit-looks.js`, the
game's `js/view/renderer.js` and `camera.js` at the middle zoom, BatchedSpellFx casts at N/12 a
second per field, contact-shadow quads, the live portrait drawing too) and
`tools/bench-bannerline.mjs` (headless run → table + JSON). Run in this VM (SwiftShader, i.e. a CPU
rasteriser — frame times are meaningless here, draw calls / triangles / CPU are not):
`docs/bench/headless-swiftshader.json`.

| Case | Bodies | Draw calls | Triangles | Anim CPU ms | Render CPU ms |
|---|---|---|---|---|---|
| 20 × 1 | 21 | 66 | 154k | 2.7 | 3.8 |
| 40 × 1 | 41 | 112 | 303k | 3.1 | 3.4 |
| 60 × 1 | 61 | 198 | 445k | 3.5 | 5.2 |
| 80 × 1 | 81 | 240 | 600k | 3.8 | 4.8 |
| 20 × 2 | 42 | 178 | 342k | 3.0 | 5.5 |
| 40 × 2 | 82 | 295 | 692k | 3.9 | 7.1 |
| 60 × 2 | 122 | 407 | 1.00M | 4.6 | 8.6 |
| 80 × 2 | 162 | 539 | 1.37M | 5.4 | 10.6 |
| 80 × 2, stand-ins past 25 | 162 | 380 | 520k | 4.2 | 8.8 |

- A body costs about **3 draw calls and 7.4k triangles** (Chibi 2: 2 skinned meshes ~8k tris;
  creatures after the mesh merge: 1–3 calls, 3–9k tris). Animation CPU is small (5 ms for 162 bodies on
  this VM's CPU); **triangles are the first budget to break**: 80 per viewport hits the 600k line.
- The stand-in (one InstancedMesh per unit type, capsule + head) cuts 80 × 2 to 380 calls and 520k
  triangles (−30% calls, −62% triangles) and halved the software frame time.

**Decision (provisional until the owner's numbers): no impostors and no stand-ins in v1.** The econ
sim's peak is 31 live bodies per field and the field cap is 60; 60 × 2 sits inside both budgets
(407 ≤ 600 calls, 1.00M ≤ 1.2M triangles). The stand-in path is built and measured in the bench, so if
the owner's run gives N < 40 it is a small port into `js/view/standins.js` (stream B) and the rule
above applies unchanged. If only triangles are tight, the cheaper lever is a Chibi 2 low-detail body
past ~45 m, not stand-ins.

**Owner action:** open `bench.html` on the desktop (dev server 8401), press **Run all cases**, then
**Copy results** and paste into `docs/bench/owner.json`; the page prints N and the rule it implies.

---

## 16. Icons and the 3D portrait

- **Baked icons:** `tools/bake-icons.mjs` drives Playwright over `icons.html` (render each unit, hero,
  item base and skill with the main renderer into a `WebGLRenderTarget`, frame from the head bone for
  Chibi 2 / bounding box for creatures, read pixels) and writes committed PNGs to `assets/icons/`
  plus `assets/icons/index.json`. Skill icons are a 2D composite: element frame + `assets/data/fx/*.svg`
  sprite + the hero's silhouette.
- `icons.html` is also the user-facing "generate icons from the 3D models" tool (gallery, re-render,
  download). Runtime generation (main renderer + render target, never a second WebGL context) only for
  previews.
- **Live portrait:** a scissored viewport of the main renderer showing a clone of the selected unit in
  a tiny side scene (idle; `talk` on a line; `hit` when damaged). Split screen = two small extra
  passes. No unit voice barks in v1.

Control bar (per viewport):

```
| 3D portrait | name, level, HP/MP, damage/armour class/speed, buffs, XP | 4×3 command card: skills, deck sends, Muster | belt + minimap |
```

---

## 17. HUD and camera

- **Top bar:** gold, income, Pay ring, Tide timer + level, both teams' banners, clock, Rising Tide
  step, Rally icon.
- **Rival strip** (per local player): the direct rival's hero portrait, level, HP, damage type,
  armour class, what they are fighting, and their deck stocks.
- **Gate preview** above each gate; alerts ("Leak! −5 banners", "Champion at Gate 2").
- Floating numbers via `shared/format.js` (`hp`).
- **Camera:** perspective, pitch ~56°, FOV 38°, follows the hero with a soft lead toward cursor /
  right stick; edge-pan / middle-drag; 3 zoom steps; clamped to your field. In the view, the hero's
  facing and walk-start react to the stick immediately (look only), so input feels connected while
  position waits for the tick.

---

## 18. File layout

```
prototypes/bannerline/
  index.html  icons.html  bench.html  README.md
  css/{style,lobby,hud,controlbar,inventory}.css
  js/main.js
  js/sim/            PURE + deterministic (no DOM, no three)
    rng.js mathx.js order.js hash.js state.js commands.js sim.js worker.js
    map.js flow.js movement.js combat.js traits.js statuses.js
    heroes.js skills.js talents.js economy.js tides.js
    items.js loot.js shop.js snapshot.js replay.js
    adapters/{affixes,skillmods}.js
    ai/{index,estimate,micro,shop}.js
    campaign.js
  js/net/{transport,loopback,channel,peerjs,lockstep,lobbysync}.js
  js/input/{devices,keyboard,gamepad,padmap,bindings,commands}.js
  js/view/{renderer,viewports,camera,terrain,actors,standins,fx,portrait,minimap,numbers,icons}.js
  js/ui/{title,lobby,hud,controlbar,deck,muster,inventory,shop,scoreboard,rival,results,campaign}.js
  data/{econ,units,races,damage,maps,heroes,items-bl,shop,ai,bindings}.json   (econ/units/races/damage exist now)
  data/campaign/prologue.json
  assets/icons/
  tools/{econ-sim,build-hero-skills,build-uniques-bl,bake-icons,bench-bannerline,desync-diff}.mjs
  tests/*.test.js (node)  tests/*.spec.js (Playwright)
  docs/{research,plan-v1,roast,PLAN,interfaces}.md
tools/serve.py --https, tools/make-dev-cert.sh   (playground-level, M2)
vendor/peerjs/   (MIT, listed in vendor/README.md)
avatar-3d/js/mesh-merge.js   (moved from Farhold)
```

---

## 19. Tests

**Node (`node --test`)**
1. `determinism.test.js` — two sims, same seed + command log → same hash every tick for 20 sim
   minutes, every mode, 6 AI slots.
2. `firefox-determinism.spec.js` (Playwright, Firefox) — replays a recorded command log in
   SpiderMonkey and compares hashes with node's (**cross-engine**; node and Chrome are both V8).
3. `sim-purity.test.js` — banned APIs, bare `.sort(`, object-as-map patterns; follows imports out of
   `js/sim/`.
4. `economy-bounds.test.js` — the 12 econ-sim verdicts on the *real* sim with the AI: income band at
   minute 10, bodies under cap, T6 HP/gold ≥ 2× T1, leak per purchase, match-length distribution
   (median 18–28, cap ≤ 10%) over 50 AI-vs-AI seeds.
5. `matchups.test.js` — race × hero matrix at Veteran vs Veteran, every cell 40–60%.
6. `snapshot.test.js` — serialise at tick N → restore → same hash at N+1000.
7. `fuzz.test.js` — random and illegal commands from every slot for 5 minutes: no throw, no NaN, equal
   hashes across two sims.
8. `datahash.test.js` — a peer with a modified `units.json` fails with "Version mismatch".
9. `lockstep.test.js` — loopback with 0–300 ms latency, jitter, reordering and drops; disconnect →
   AI at the announced tick.
10. `dead-data.test.js` — every trait, affix stat, talent mod key, skill shape/effect and status used in
    data has a handler; each moved to an odd value changes the sim.
11. `banned-terms.test.js` — scans player-facing fields (`name`, `desc`, `text`, UI string tables) in
    every Bannerline `data/*.json` and `js/ui/*` against convention 9's list + Warchief, Town Portal,
    Mortar Team, Horde, Shield Wall. (Model-reference ids like a Farhold def id are not player-facing.)
12. `soak.test.js` — a 40-minute 3v3 AI match within the 2 ms tick budget, no growth in state size.
13. `skills.test.js`, `items.test.js`, `ai.test.js` (decisions-only bar), `campaign.test.js`.

**Playwright (dev 8401; https 8441 for gamepad specs)**
14. Keyboard lobby → match vs AI (×8 debug speed) → surrender → results → lobby with slots kept.
15. **Hidden tab** — `visibilitychange` on one of two pages: the other shows "waiting", catch-up on
    return.
16. **Gamepad mocks** — a standard pad, an **empty-mapping** pad (Firefox Linux layout) and the
    duplicate-pad case; join, ready, move.
17. **Pad-only walk** — player 2 in split screen completes lobby → match → buy → equip → results →
    lobby with **no mouse or keyboard events**.
18. Split screen — two non-blank viewports, two control bars, panels per half.
19. Online two-page loopback over BroadcastChannel — host/join by code, same hash at tick 1200,
    guest closes → AI takeover. Opt-in spec over real PeerJS.
20. Icons + portrait non-blank; draw-call probe under budget.
21. **Real hardware** — `bench.html` numbers recorded by the owner in the README.

---

## 20. Milestones (vertical slices — each ends playable and tested)

| # | Slice | Playable result | Tests that must be green |
|---|---|---|---|
| **M0** | Interfaces + economy on paper | — (done here: econ sim 12/12) | `econ-sim.mjs` exit 0 |
| **M1** | **Ugly playable 1v1** | In the browser: Freeholds vs Freeholds, Warrior vs a Recruit-ish AI, capsules on a flat `vale`, KB+M, Pay ring, stocks, deck of 4 + auto-send, Tides, banners, win/lose screen. **Plus `bench.html`** and the impostor decision | determinism, purity, snapshot, economy-bounds (lite), keyboard Playwright smoke |
| **M2** | Couch: lobby + gamepad + split screen | Title → lobby (local slots only) → match → results → lobby; two players on one screen, pad joins with A; https dev server | gamepad mocks (3 cases), split screen, pad-only walk, lobby loop |
| **M3** | Second race + second hero | Ashtusk and Pyromancer; matchup matrix in node; chest armour class + Oil | matchups (2×2), dead-data, skills |
| **M4** | Items | 8 slots / bag 12 / belt 2, shop steps + rolls, auto-loot, Requisition, 16 affixes, champion 3-card pick | items, two-press rule check in the pad walk |
| **M5** | Online | BroadcastChannel → PeerJS lockstep, Worker clock, hidden-tab banner, snapshot resync, data hash, AI takeover, co-op vs AI | lockstep, datahash, hidden tab, two-page loopback, **Firefox determinism** |
| **M6** | Full roster + AI | Unburied, Thornmane, Ranger, Druid; Veteran + Commander; counter toasts; 2v2/3v3 lanes + Toll of Iron | full matchup matrix, AI bars, fuzz, soak |
| **M7** | Art | Chibi 2 + creatures replace capsules; 4 new creatures + variants in avatar-3d + library; baked icons; live portrait; control bar; rival strip; sound | icon/portrait specs, draw-call probe, avatar-3d creature tests |
| **M8** | Campaign | 3 Prologue missions | campaign |
| **M9** | Ship | README, CLAUDE.md row, index card, `~/claude/docs/playground.md`, code review, publish-stable, publish-pages | everything, banned terms |

## 21. Workstreams and file ownership (ordered by slice)

**Before M2, at most three streams** (the roast's "ten modules that don't fit" warning):

| Stream | Owns | Slices |
|---|---|---|
| **A Sim + content** | `js/sim/**`, `data/{econ,units,races,damage,maps,heroes,items-bl,shop,ai}.json`, `tools/{econ-sim,build-hero-skills,build-uniques-bl,desync-diff}.mjs`, node tests | M1, M3, M4 (sim side), M6 |
| **B View + input + UI** | `index.html`, `js/main.js`, `js/view/**` (except icons/portrait), `js/input/**`, `js/ui/**`, `css/**`, `data/bindings.json`, Playwright specs | M1, M2, M4 (screens), M7 (integration) |
| **C Art + creatures + bench** | `bench.html`, `tools/bench-bannerline.mjs`, `avatar-3d/js/{creature-types,creatures,mesh-merge}.js` additions, `avatar-3d/data/creature-variants.json`, `library/data/defaults.json`, avatar-3d tests, `icons.html`, `js/view/{icons,portrait}.js`, `tools/bake-icons.mjs`, `assets/icons/` | M1 (bench), then M7 work in parallel from M1 (touches no sim files) |

**From M5, add:**

| Stream | Owns | Slices |
|---|---|---|
| **D Net** | `js/net/**`, `js/sim/worker.js`, `vendor/peerjs/`, `tools/serve.py --https` + `tools/make-dev-cert.sh` (with B for the lobby UI hook) | M2 (https only), M5 |
| **E AI** | `js/sim/ai/**`, `data/ai.json`, AI tests | M6 |
| **F Campaign** | `js/sim/campaign.js`, `data/campaign/**`, `js/ui/campaign.js` | M8 |

Shared entry points (`index.html`, `main.js`) belong to B; other streams ask B for a hook instead of
editing them. Interfaces (state shape, command schema, event schema, data schemas) are written first
in `docs/interfaces.md` by A and B together at the start of M1.

---

## 22. Risks (after the refinement)

| # | Risk | Status |
|---|---|---|
| 1 | Economy runaway | **Retired on paper**: stocks + send-on-Pay + tier-rising pressure, 12/12 checks. Remains a test in the real sim (economy-bounds) because the model is simple |
| 2 | Nothing playable until late | M1 is a playable 1v1; at most 3 streams before M2 |
| 3 | Lockstep desync/stall | Purity scan following imports, tie-broken sorts, data hash, Worker clock, snapshot resync, Firefox replay test, 10 s connect timeout |
| 4 | Split screen + gamepad + inventory don't fit | Built in M2 before the UI grows; pad-only walk test; https dev server; deck muster; two-press rule |
| 5 | Reuse that is really rewriting | Budgeted as new code: the skill runtime (9 shapes, 14 effects), uniques as data, affixes through an adapter; build tools copy data rows and never import Farhold game code |
| 6 (new) | Matches end near the low edge of the target (sim median 19 min) | Real defence and real sends are imperfect; re-tune banners / Rising Tide in M6 against AI-vs-AI lengths |
| 7 (new) | Chibi 2 crowd cost unknown | Measured in M1 with a written decision rule (§15.2) |

**For the owner:** Farhold's `data/warbands.json` names the Ashtusk warband "The Ashtusk **Horde**",
a banned term; worth a rename in Farhold (not changed here).

## 23. Name scan

This plan and the data files were scanned against convention 9's banned list plus Warchief, Town
Portal, Mortar Team, Stoneskin, Shield Wall, ember/veil: player-facing names are clean (Tuskchief,
Hardened, Shieldbearer, Commander; no portal item; Bombard Crew cut). The only hits are the
explanatory mentions in §2 and §22 and the Farhold source id `ember_stride` (never shown).
