# Emberveil 2 — simulation and the round-19 difficulty pass

The previous pass (`research/sim-report.md`, round 14) fixed an act-2 wall and made the game a good
deal easier. Since then 359 effects were ported, 34 road weapons went in and 19 crossing nodes
appeared on the map. This pass re-measured the whole game against those additions and found it had
drifted well past "comfortable": **28% of runs cleared all six acts, act 1 never failed once in 300
runs, and by act 4 an ordinary fight cost the party 2% of its health bar.**

Target feel for this pass, set by the user:

- act 1 clears reliably — about 85–90%
- act 2 is where the pressure starts
- a full six-act clear is uncommon — 10–15%
- wipes spread across many enemies and bosses, not one gate
- **starting heroes stay exactly as they are** (level-1 stats, starting kits, class skills)

Everything below is 300 seeded runs at seed 1, day cap 140. The raw generated reports are
`research/sim-before-r19.md` and `research/sim-latest.md`.

---

## Method

`tools/sim-emberveil.mjs` plays whole runs headlessly with the game's own modules — the same `Game`,
`Combat`, `Loot`, `explore` and damage meter. A bot makes the decisions a player would: it spends
level-up points, walks toward the boss, fights what is in the way, bandages between fights, goes
back to town when it is hurt or hungry, buys food, bandages, torches, a tent, a wagon and a dog, and
equips anything that scores better.

```bash
node tools/sim-emberveil.mjs --runs 300 --seed 1                     # ~3.5 min
node tools/sim-emberveil.mjs --runs 300 --seed 1 --matrix --quiet \
     --report prototypes/emberveil/research/sim-latest.md            # + class and weapon matrices (~12 min)
node tools/sim-emberveil.mjs --runs 60 --act 3                       # start every run at the head of act 3
node tools/sim-emberveil.mjs --runs 40 --class stormcaller           # every party carries one
```

### What the simulator gained this round

The old simulator was measuring a game that no longer existed in two ways, and it was blind to most
of what this pass needed to see.

1. **Crossings were invisible.** `DATA` never loaded `data/crossings.json`, so `crossingFor()`
   always returned null and all 19 crossing nodes resolved as empty "quiet" nodes. The bot now
   scores the available ways past a crossing (odds, reward size, days lost, whether it ends in a
   fight), takes the best one through `resolveCrossing()`, runs the fight if the choice falls into
   one, and marks the node crossed.
2. **"Acts cleared" was wrong.** It was read off zone changes, but a zone is not an act — several
   zones sit inside one act, and `victory()` is what advances `game.act` when an act boss dies. It
   is now read from that, so "cleared act 3" means the act-3 boss went down.

New readings in the report:

| section | what it tells you |
|---|---|
| per act: cleared / stalled / wiped | the funnel — how many runs got to each act, cleared it, and died there, plus wipes per 100 fights |
| the difficulty curve | rounds per fight, **share of the party's health bar one fight costs**, enemy HP and damage per round faced, and the average score of the gear on their backs |
| level and purse at each act boundary | the day, party level, XP held against what the XP table asks, gold and gear score the moment the party walks into each act |
| loot per act | gold, XP and drops per fight, and the rarity mix of those drops |
| crossings | attempts, pass rate, failures, fights fallen into, days lost, and a per-hazard breakdown |
| damage by source | weapon / skill / status / proc share of everything the heroes dealt |
| status uptime | rounds of status bought per fight, and per act split between enemies and the party |
| worn gear | affixes, rarity mix, uniques, set pieces and legendary powers actually on the party's backs at the end |

---

## Headline: before and after

| reading | before | after | target |
|---|---|---|---|
| **full clears (all six acts)** | **28.0%** | **11.3%** | 10–15% |
| **act 1 cleared** | **100.0%** | **91.3%** | 85–90% |
| act 2 cleared | 99.7% | **62.7%** | pressure starts here |
| act 3 cleared | 81.3% | **36.3%** | |
| act 4 cleared | 62.7% | **25.7%** | |
| act 5 cleared | 59.0% | **16.3%** | |
| act reached on average | 4.5 | 3.3 | |
| party level walking into act 4 | 24.9 | **20.0** | |
| party level walking into act 6 | 30.0 (capped) | **29.4** | |
| XP held at act 6 vs the table | 117,853 vs 38,160 (**309%**) | 110,638 vs 94,000 (**118%**) | |
| gold in hand at the end | 10,345 | **4,875** | |
| legendary share of worn gear | 35.8% | **19.2%** | |
| night raids that wiped the party | 1.9% | 4.2% | |
| bosses' share of all wipes | 56.4% | 49.2% | |

**The root cause was the XP curve, not the enemies.** `rules.js` carried its own 30-level XP table
(`balance.json` had a stale 20-level copy nothing read), and with a ×3 XP multiplier a party held
three times the XP the table asked for by act 6. It hit the level cap in act 5 and then walked
through two acts of enemies scaled for a party half its size. Every enemy multiplier in the game was
being outrun by the character sheet.

## The difficulty curve, before and after

Party HP lost per fight is the honest number: what one ordinary fight costs out of the party's
health bar.

| act | rounds/fight before → after | HP lost per fight before → after | wipes per 100 fights before → after |
|---|---|---|---|
| 1 | 7.1 → **9.1** | 11.7% → **20.6%** | 1.2 → **6.3** |
| 2 | 11.2 → **11.3** | 19.3% → **20.6%** | 9.9 → **11.9** |
| 3 | 15.3 → **16.8** | 10.4% → **13.3%** | 6.4 → **9.2** |
| 4 | 11.6 → **14.8** | 2.1% → **6.4%** | 0.6 → **4.3** |
| 5 | 16.0 → **14.4** | 6.8% → **10.0%** | 4.1 → **4.3** |
| 6 | 18.0 → **17.9** | 7.1% → **8.1%** | 6.3 → **5.4** |

Act 4 was a rest stop between two hard acts (0.6 wipes per 100 fights, a fight costing 2% of the
health bar). It now sits in line with act 5. Fight length did not blow out: 12.5 rounds across the
whole game before, 12.5 after.

## Where the party stands at each act boundary

| act | day before → after | level before → after | gold before → after | gear score before → after |
|---|---|---|---|---|
| 2 | 7.2 → 7.7 | 7.2 → **6.8** | 656 → 609 | 45 → 46 |
| 3 | 13.0 → 13.6 | 15.8 → **14.1** | 1,783 → 1,709 | 52 → 52 |
| 4 | 17.9 → 18.3 | 24.9 → **20.0** | 4,619 → 4,268 | 65 → 59 |
| 5 | 22.1 → 22.5 | 30.0 → **25.2** | 8,114 → 7,220 | 75 → 69 |
| 6 | 27.7 → 27.7 | 30.0 → **29.4** | 14,444 → 13,172 | 87 → 79 |

Act 1 and act 2 pacing is deliberately almost untouched — the opening is where starting heroes are
judged, and those were off limits. The divergence starts at act 3 and widens.

## What kills the party

| kind of fight | before | after |
|---|---|---|
| boss | 404 (56.4%) | 405 (49.2%) |
| named leader | 196 (27.4%) | 256 (31.1%) |
| ordinary | 92 (12.8%) | 142 (17.2%) |
| night raid | 24 (3.4%) | 21 (2.5%) |

The top-ten list of enemies holding the field is wider than it was. Before, four of the ten were
act-3-or-later bosses; now goblin warlords, goblin warriors, cinder hounds, corrupted bears and veil
wardens are all in it, which is the point — ordinary fights kill people again. The Lava Titan is
still number one at 180 of 823 wipes; see recommendation 2.

---

## Every number that changed

### `data/balance.json`

| key | old → new | why |
|---|---|---|
| `version` | `2026-09-13-road-weapons-R14` → `2026-09-13-R19-difficulty` | |
| `progression.xpTable` | 20 entries ending 22,300 (dead — `rules.js` had its own 30-entry copy ending 38,160) → **30 entries ending 110,000** | the one change that matters most: the party was three times over the curve by act 6 and capped out in act 5 |
| `progression.maxLevel` | 20 → **30** | the stale copy disagreed with the code |
| `economy.globalMultipliers.xp` | 3 → **2.85** | was hardcoded in `game.js victory()`; a small trim on top of the longer table |
| `economy.globalMultipliers.gold` | 1.2 → **1.1** | was hardcoded in `victory()`; purses ended at 10k |
| `economy.globalMultipliers.shopPrice` | 1 → **1.15** | gold had nothing to buy; the merchant now asks more (what he *pays* you is unchanged) |
| `economy.globalMultipliers.dropRate` | 1 → **0.97** | a light thumb on every zone drop |
| `enemies.actMultipliers.1.hp` | 0.85 → **1.08** | act 1 was cleared in 300 of 300 runs |
| `enemies.actMultipliers.1.damage` | 0.92 → **1.14** | same |
| `enemies.actMultipliers.2.hp` | 1.05 → **1.02** | act 2 is the pressure act by design, but it was carrying the whole game; a little came off so acts 3–6 could take some |
| `enemies.actMultipliers.2.damage` | 1.02 → **0.98** | same |
| `enemies.actMultipliers.3.hp` | 1.55 → **1.50** | the act-2→3 step was still the steepest in the table |
| `enemies.actMultipliers.3.damage` | 1.3 → **1.21** | same |
| `enemies.actMultipliers.4.hp` | 1.95 → **2.42** | act 4 was the softest act in the game |
| `enemies.actMultipliers.4.damage` | 1.45 → **1.84** | same |
| `enemies.actMultipliers.5.hp` | 2.45 → **2.60** | keeps the curve rising after act 4 |
| `enemies.actMultipliers.5.damage` | 1.6 → **1.62** | |
| `enemies.actMultipliers.6.hp` | 2.6 → **2.95** | the finale should be the hardest thing in the game |
| `enemies.actMultipliers.6.damage` | 1.65 → **1.78** | |
| `enemies.actMultipliers.*.armor` | *(new)* → **0.9 / 0.95 / 1.0 / 1.05 / 1.1 / 1.15** | armour was one flat global number; it now climbs with the act |
| `enemies.actMultipliers.*.magicResist` | *(new)* → **0 / 0 / +4 / +8 / +12 / +16** | almost every enemy in the game has 0 magic resist, and 65% of hero damage is skills. A flat late-game top-up |
| `enemies.boss.hpShare` | 0.35, **hardcoded in `rules.js makeEnemy`** → **0.5** | a boss's HP multiplier is `1 + (actHpMult − 1) × hpShare`. At 0.35, an act-6 boss scaled ×1.65 while the trash beside it scaled ×2.85 |
| `enemies.boss.damage` | 1 (implicit) → **1.05** | |
| `enemies.champion.chance` | 0.05, hardcoded in `game.js` → **0.05 + 0.01 per act** | 1 in 20 in act 1, 1 in 10 in act 6 |
| `enemies.champion.hp` / `.damage` | 1.5 / 1.3 → **1.55 / 1.35** | |
| `enemies.named.chance` | 0.28, hardcoded → **0.32** | named leaders are the second biggest killer and the most interesting fight in the game |
| `enemies.named.nemesisChance` | 0.2, hardcoded → **0.22** | |
| `enemies.named.hp` / `.damage` | 1.5 / 1.25 → **1.55 / 1.28** | |
| `enemies.named.xp` / `.gold` | 2 / 3 → unchanged, now a knob | |
| `loot.affixMult` | *(new)* → **0.96** | scales every rolled affix value; `items.json` keeps the ranges |
| `loot.setChance` | 0.03, hardcoded in `loot.js` → **0.025** | |
| `loot.uniqueChance` | *(new)* → **0.85** | scales the per-boss unique odds in `items.json` |
| `world.nightAttack.perAct` | 0.06 → **0.055** | night raids were wiping 5.4% of the time against a weaker party |

### `data/items.json`

| key | old → new | why |
|---|---|---|
| `zoneDrops.ember_plateau.drop` | 0.20 → **0.19** | the drop rate climbed to 0.28 in the last zone; the curve is flatter now |
| `zoneDrops.hell_breach.drop` | 0.22 → **0.20** | |
| `zoneDrops.shattered_core.drop` | 0.23 → **0.21** | |
| `zoneDrops.cosmic_rift.drop` | 0.24 → **0.21** | |
| `zoneDrops.eternal_void.drop` | 0.25 → **0.22** | |
| `zoneDrops.abyssal_depths.drop` | 0.26 → **0.22** | |
| `zoneDrops.primordial_nexus.drop` | 0.26 → **0.22** | |
| `zoneDrops.dragons_reach.drop` | 0.27 → **0.23** | |
| `zoneDrops.dragon_throne.drop` | 0.28 → **0.24** | |
| `zoneDrops.*.downshift` | *(new field)* → **0.30–0.55 on ten zones** | six zones dropped a straight **legendary** (5–6 affixes) on every find. `downshift` is the chance a roll drops one rarity step, so a legendary zone hands out mostly rares with legendaries as a real event |
| `bossLoot.{grax_veil_touched, lava_titan, archfiend_malgrath}.rolls` | 3 → **2** | the three rare-tier boss tables; the legendary-tier ones keep 3 rolls |

### `data/enemies.json`

| key | old → new | why |
|---|---|---|
| `cosmic_titan`, `dragon_cultist`, `dragon_whelp`, `frost_wyrm`, `star_horror`, `storm_dragon`, `void_prophet`, `void_wraith`, `wyrm_warrior` | `spellChance` 0, no `spellList` → **0.25–0.35 with 2–3 spells each** | nine act-4-to-6 enemies had nothing but a basic attack. The late game was a stat-check slugfest |
| `goblin_scout` `spellChance` | 0.15 → **0.18** | |
| `goblin_warlord` `spellChance` | 0.2 → **0.25** | |
| `cinder_hound` `spellChance` | 0.2 → **0.22** | |
| `corrupted_wolf` `spellChance` | 0.2 → **0.22** | |
| `veilspawn_herald` `spellChance` | 0.25 → **0.3** | |

### `data/bosses.json`

| key | old → new | why |
|---|---|---|
| `ancient_dragon` | `spellChance` 0 → **0.35**, three spells | three bosses — including the **Dragon King**, the final fight of the game — had no spell list at all |
| `dragon_king` | `spellChance` 0 → **0.4**, four spells | |
| `the_unraveler` | `spellChance` 0 → **0.4**, four spells | |
| `lava_titan.hp` | 3640 → **3400** | held the field in 174 of 715 wipes before the pass — more than any other three enemies together |
| `lava_titan.dmg` | [72, 112] → **[70, 106]** | same |

### `data/boss-phases.json`

| key | old → new | why |
|---|---|---|
| every `hpThreshold` | **+0.08**, capped at 0.75 (first phase) and 0.42 (second) — e.g. Dragon King 0.66/0.33 → **0.74/0.41** | phases fired so late that a boss often died before its second one. More of the fight is now spent in the dangerous half, which makes a boss harder without another point of raw HP |

### `data/crossings.json`

| key | old → new | why |
|---|---|---|
| `difficulty.perAct` | 2 → **3** | |
| `difficulty.cap` | 26 → **30** | |
| `difficulty.rewardPerAct` | 0.45 → **0.32** | a crossing paid out like a real fight for a d20 roll |

This block was **dead data** before the pass: `js/main.js` calls `crossingChoices()` and
`resolveCrossing()` with no tuning argument, so the defaults baked into `explore.js` were what ran.
`explore.js` now reads it off `game.d.crossings.difficulty`, so the JSON is live.

### Code changes (all of them wiring, not new rules)

| file | what |
|---|---|
| `js/rules.js` | `applyBalance()` now also loads `progression.xpTable`, `progression.talentPointLevels`, `enemies.actMultipliers[act].armor` / `.magicResist`, `enemies.boss`, `enemies.champion`, `enemies.named` and `economy.globalMultipliers`. `makeEnemy()` reads the per-act armour multiplier, adds the per-act flat magic resist, and takes its boss multipliers from the JSON instead of the hardcoded `1 + (am[0] − 1) * 0.35` |
| `js/game.js` | `victory()` reads the XP and gold multipliers from `economy` (they were `* 3` and `* 1.2` in the source); the champion roll, champion strength, named-leader strength and named/nemesis encounter chances all read their knobs; `Loot` is constructed with the `loot` + `economy` tuning |
| `js/loot.js` | `Loot(data, tuning)`: `affixMult` on every rolled affix, `dropRate` on every zone drop, `setChance`, `uniqueChance` on boss uniques, `shopPrice` on what a merchant asks (`sellPrice()` deliberately divides it back out, so the markup does not make selling junk more profitable), and the new per-zone `downshift` rarity step |
| `js/explore.js` | `tuningFor(game, tuning)` — the `difficulty` block in `crossings.json` is now what runs |
| `tools/sim-emberveil.mjs` | loads `crossings.json`, plays crossings, fixes the acts-cleared measurement, and reports everything in the table further up |
| `tests/crossings.test.js` | the difficulty assertions read `data/crossings.json`'s `difficulty` block instead of hardcoding 14/24/26, so the next tuning pass does not break them |

**No starting hero was touched** — `classes.json`, `build-presets.json`, `heroes.json`,
`skills.json` and `combat.maxHp` / `maxMp` / `hit` / `dodge` / `crit` / `damage` / `skill` in
`balance.json` are all exactly as they were.

---

## What I tried and reverted

1. **A much steeper XP table** (level 30 at 250,000 XP, ×2.4 XP) plus the enemy lifts. Full clears
   fell to **3.3%** and 18 of 30 runs stalled in act 2 — the act-2 wall the last pass removed came
   straight back, because the party arrived at act 3 at level 12 instead of 14. Backed off to
   110,000 at level 30 and ×2.85.
2. **Cutting gold to ×1.0 with a ×1.3 shop markup and a ×0.92 drop rate.** Purses fell from 10,345
   to 1,924 — the party could not replace gear at all and the loot layer stopped mattering. Settled
   on ×1.1 gold, ×1.15 markup, ×0.97 drops.
3. **Dropping `bossLoot.rolls` from 3 to 2 everywhere.** Beating a late boss should feel like a
   payday; only the three rare-tier tables kept the cut.
4. **Raising the crossing check difficulty further** (`perAct` 4, cap 34). It changed the pass rate
   by under a point, because a late-game hero's best stat is 40+ against a cap of 30 — see
   recommendation 1.

---

## Recommendations I did **not** apply

Ranked by how much they would change the game. These are design decisions, not numbers.

1. **Crossing checks cannot threaten a grown party, and no number fixes that.** 95.2% of 958
   attempts passed, and raising the difficulty from `12 + 2/act` to `12 + 3/act` (cap 30) moved it
   by 0.6 of a point. The check is `best living hero's stat + d20 ≥ dc`, and by act 4 the best stat
   in a party is 40-something against a cap of 30 — the roll is decided before it is made. It needs
   to scale off the party (a target number like `10 + partyLevel`, or the *worst* hero rolling, or
   a stat the party has not invested in), or crossings should stop being rolls and start being
   resource trades: the ford costs rope, a day, or blood, and you pick which. Related: **no crossing
   ever fell into a fight in 300 runs**, because the bot never picks the "force it" option when a
   safer one exists, and the safer one always exists.
2. **The Lava Titan is still a gate.** 180 of 823 wipes (22%) after two rounds of nerfs — it was
   174 of 715 before. It is the act-2 boss, and act 2 is meant to be where the pressure starts, so
   some of this is working as intended. But one enemy holding a fifth of all wipes is a wall, not a
   curve, and the reason is structural: a party arriving at act 2 has almost no answer to 24 armour
   and a magma wave. Either the act-2 zone needs a source of armour penetration the party can
   actually find, or the Titan needs a mechanic that rewards play (a phase you can interrupt)
   instead of a stat block that rewards levels.
3. **Six statuses still never fire — `haste`, `block`, `deflect`, `enchant`, `taunt_totem`,
   `soulbind`** — and `weaken`, `rally`, `root` and `thorns` are rounding errors next to `bleed`
   (42 rounds of uptime per fight) and `burn` (41.5). Carried over from the last report; nothing in
   the game hands them out. This needs new sources — affixes, a skill upgrade, an enemy modifier —
   not a number.
4. **Act 4 is still the flat spot in the curve.** It costs 6.4% of the health bar per fight against
   13.3% in act 3 and 10.0% in act 5, even after a +24% HP and +27% damage lift. The multiplier is
   not the problem: act 4 (the Cosmic Rift) has *fewer enemies per fight* than the acts either side,
   so a big multiplier lands on a small pack. The fix is in `encounters.json` — act-4 rooms need
   more bodies in them — and that is a content change, not a knob.
5. **`statPointsPerLevel` and `passivePointEveryNLevels` are not safe knobs yet.** They are in
   `balance.json` and read by `rules.js`, but `js/main.js gainXpSafe()` hardcodes `pendingAttr += 2`
   and `level % 5`, and the level cap of 30 as well. Changing any of them today would split the live
   game from the simulator. Three lines in `main.js` (a UI file this pass was not allowed to touch)
   would close it, and would make per-level stat gains a real lever for the next pass.
6. **Ice, nature and lightning are still invisible** — 0.4%, 0.0% and 1.5% of all damage dealt,
   unchanged from the last report. The new per-act magic resist makes elemental resistance matter
   for the first time, which makes this worse, not better: the party has no reason to carry a cold
   or nature answer because nothing deals that damage.
7. **Eight classes cannot carry act 5.** Priest (2.5 fights won), stormcaller (2.5), mage (3.0),
   enchanter (3.0), fighter (3.3), tactician (3.3), knight (3.5) and oracle (3.5) against a control
   party's 6.0. The spread at act 1 (15.8–33.1) and act 3 (15.6–36.4) is wide but survivable; act 5
   is where late kits stop keeping up. That is a skill-table problem, and this pass deliberately did
   not touch skills.
8. **Four road weapons are a trap.** Kennelbreaker (−11.2 fights won against control), The Ingrate
   (−11.2), Breaker's Pick (−7.1) and Axle Club (−6.3) all lose fights when a hero is made to carry
   them over an act-appropriate weapon. Their properties are road properties — they pay off between
   fights, not in them — so the matrix is arguably the wrong measure, but a player will never find
   out because they die holding one. Either their damage ranges come up a tier, or the road payoff
   needs to be big enough to see.
9. **The bot still does not use potions, the blacksmith, the enchanter, the trainer or a respec,
   and it never retreats from a fight it is losing.** Every number here is a floor. A real player
   clears more than 11.3%.

---

## Full generated reports

- before this pass: `research/sim-before-r19.md`
- after this pass (with the class and weapon matrices): `research/sim-latest.md`
