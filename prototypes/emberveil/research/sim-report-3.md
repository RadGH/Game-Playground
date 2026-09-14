# Emberveil 2 — simulation and the round-20 difficulty pass

Round 20 gave every zone a **settlement** (merchant + cleric who picks the fallen back up) and took
fast travel away, so the party walks the map one node at a time and can always get back to a healer.
It also turned night attacks up to ~35–44% and made a raid worth ×1.25 XP and ×1.7 gold.

All of that made the game much easier. The 300-run measurement taken right after those changes
(`research/sim-round20.md`) found **38.3% of runs clearing all six acts** against the user's stated
target of **10–15%**, with only 2.1 wipes per run and an ordinary act-4 fight costing 1.8% of the
party's health bar.

This pass is the difficulty correction. It touches **`data/balance.json` only** — no game logic, no
`.js` file. Result over five seeds of 300 runs: **12.8% full clears on average (10.3–14.3%)**, act 1
at **86–88%**, and a funnel that loses a bigger share of the field in every act than the one before it.

Target feel, unchanged from round 19 and restated by the user for this pass:

- act 1 clears reliably — 85–90%
- a full six-act clear is uncommon — 10–15%
- every act takes a sensible bite; no single act is a wall
- wipes spread over acts 3–6, not one cliff
- starting heroes stay exactly as they are

Raw generated reports: **before** `research/sim-round20.md`, **after** `research/sim-latest.md`
(both 300 runs, seed 1, day cap 140, `node tools/sim-emberveil.mjs --runs 300 --seed 1`).

> Note on where this started. The working tree already carried an **unmeasured** first stab at the
> act table (act 2 HP ×1.42, act 6 HP ×5.6) when this pass began. Measured, it gave 9.2% clears but
> put a wall in the middle: 66% of runs cleared act 2 and 56% cleared act 3, while act 5 and act 6
> waved most survivors through. It was thrown away and the table rebuilt from the round-20 baseline.

---

## Headline, before and after

| number | before (R20) | after (R20 difficulty) |
|---|---|---|
| full clears (all six acts) | **38.3%** | **12.0%** (seed 1) · 12.8% mean of 5 seeds |
| act reached on average | 4.5 | 3.5 |
| fights per run | 88.0 | 64.1 |
| party wipes per run | 2.1 | 2.8 |
| days survived | 52.7 | 40.1 |
| hero level at the end | 23.5 | 19.5 |
| gold in hand at the end | 21,913 | 8,045 |
| night raids that wiped the party | 4.2% | 9.3% |
| crossings passed | 94.3% | 95.4% |

A run ends on the third wipe or at the day cap. Before the pass a run had wipes to spare (2.1 of 3
used); now it spends nearly all of them (2.8 of 3), which is what makes each act's loss meaningful.

## The funnel

"Cleared" is the share of **all 300 runs**; "of those that got there" is the conditional rate — the
share of the runs still standing at the head of that act that walked out of it. The conditional
column is the one to read for "is any act a wall".

| act | before: reached | before: cleared | before: of those that got there | after: reached | after: cleared | after: of those that got there |
|---|---|---|---|---|---|---|
| 1 | 300 | 254 (84.7%) | **84.7%** | 300 | 260 (86.7%) | **86.7%** |
| 2 | 254 | 243 (81.0%) | **95.7%** | 260 | 207 (69.0%) | **79.6%** |
| 3 | 243 | 203 (67.7%) | **83.5%** | 207 | 139 (46.3%) | **67.1%** |
| 4 | 203 | 177 (59.0%) | **87.2%** | 139 | 99 (33.0%) | **71.2%** |
| 5 | 177 | 159 (53.0%) | **89.8%** | 99 | 56 (18.7%) | **56.6%** |
| 6 | 159 | 115 (38.3%) | **72.3%** | 56 | 36 (12.0%) | **64.3%** |

Before, acts 2, 4 and 5 barely charged anything (96%, 87%, 90% pass) and the whole loss happened in
act 1, act 3 and the final boss. After, every act takes 13–43% of what is left. Averaged over the
five confirmation seeds the conditional curve is a clean slope: **87 / 80 / 74 / 69 / 63 / 57%**.

Seed to seed (300 runs each, the same balance file):

| seed | full clears | act 1 | act 2 | act 3 | act 4 | act 5 | act 6 |
|---|---|---|---|---|---|---|---|
| 1 | 12.0% | 87% | 80% | 67% | 71% | 57% | 64% |
| 2 | 14.0% | 87% | 82% | 79% | 68% | 70% | 52% |
| 3 | 13.3% | 87% | 82% | 75% | 70% | 61% | 58% |
| 4 | 14.3% | 86% | 81% | 72% | 71% | 70% | 57% |
| 5 | 10.3% | 88% | 76% | 75% | 67% | 57% | 53% |
| **mean** | **12.8%** | **87%** | **80%** | **74%** | **69%** | **63%** | **57%** |

Every seed lands inside 10–15% and every seed puts act 1 inside 85–90%. Acts 5 and 6 swing ±7 points
between seeds because only 56–120 runs reach them; the act-by-act shape is therefore read off the
mean, not off seed 1 alone.

## Is any act a wall?

Per-fight lethality, which is what a player actually feels, is flat across the whole game:

| act | wipes per 100 fights (before) | wipes per 100 fights (after) | wipes per run that reached the act |
|---|---|---|---|
| 1 | 4.6 | 4.5 | 0.92 |
| 2 | 1.1 | 4.2 | 0.61 |
| 3 | 2.2 | 4.2 | 0.78 |
| 4 | 1.4 | 3.4 | 0.66 |
| 5 | 1.2 | 5.6 | 1.02 |
| 6 | 3.3 | 3.8 | 0.64 |

Before, acts 2–5 were a stroll at 1–2 wipes per 100 fights and the only two dangerous places were
act 1 and the last boss. Now every act sits in the 3.4–5.6 band, so the funnel narrows because each
act is **long and consistently risky**, not because one gate eats the field. Act 5 is the sharpest
(5.6) — that is deliberate: it is where the party is fully levelled and gear is the only thing left
to earn, so the enemies have to carry it.

## The difficulty curve

| act | rounds per fight (before → after) | party HP lost per fight (before → after) | enemy HP per fight (before → after) | enemy damage/round (before → after) | avg equipped item score |
|---|---|---|---|---|---|
| 1 | 7.4 → 7.4 | 13.7% → 13.8% | 364 → 364 | 63 → 63 | 45 |
| 2 | 8.0 → 9.9 | 6.4% → 11.4% | 1,022 → 1,310 | 57 → 75 | 58 |
| 3 | 11.3 → 12.1 | 3.9% → 7.0% | 3,041 → 3,558 | 101 → 151 | 70 |
| 4 | 13.6 → 16.0 | 1.8% → 6.7% | 6,024 → 8,208 | 187 → 345 | 86 |
| 5 | 14.0 → 17.7 | 2.7% → 13.6% | 8,797 → 14,125 | 240 → 572 | 101 |
| 6 | 15.7 → 17.6 | 2.1% → 11.0% | 13,350 → 21,949 | 251 → 631 | 111 |

The headline shape change is that **enemy damage climbs faster than enemy HP** from act 3 up. That
was a deliberate trade: an earlier candidate that put the same pressure into HP alone hit the same
clear rate but stretched act 6 to 19.6 rounds a fight. This table gets the lethality in 17.6.

Acts 3 and 4 still cost less of the health bar per fight (7.0% / 6.7%) than acts 2, 5 and 6. That is
not a knob that would move: three separate candidates traded HP for damage in the middle acts and the
figure stayed at 6–7%, because by act 3 the party's healers, regen and status uptime out-sustain
ordinary damage. What kills runs in acts 3–4 is not attrition, it is the spikes — named leaders,
champions, the act boss and night raids — and those are landing (see below).

## Where the party stands at each act boundary

`xp table` is the XP the party holds against the XP its current level costs. Over 100% means it is
banking progress it cannot spend.

| act | day | level (before → after) | xp held (before → after) | xp the level costs (before → after) | % of the table (before → after) | gold (before → after) | gear score (before → after) |
|---|---|---|---|---|---|---|---|
| 1 | 1.0 | 1.0 → 1.0 | 0 → 0 | 0 | — | 150 → 150 | 32 → 32 |
| 2 | 15.7 | 9.0 → 9.0 | 3,876 → 3,917 | 3,420 | 113% → 115% | 936 → 880 | 50 → 51 |
| 3 | 25.9 | 15.6 → 15.8 | 13,128 → 13,576 | 12,700 | 103% → 107% | 1,767 → 1,619 | 62 → 63 |
| 4 | 38.8 | 23.2 → 23.2 | 41,032 → 41,376 | 36,400 | 113% → 114% | 4,286 → 4,062 | 75 → 77 |
| 5 | 50.9 | 28.6 → **27.4** | 96,837 → 93,438 | 94,000 → **74,000** | 103% → 126% | 9,968 → 8,073 | 93 → 91 |
| 6 | 64.4 | **30.0 → 29.8** | 190,184 → 181,503 | 110,000 → **150,000** | **173% → 121%** | 25,482 → 20,483 | 105 → 104 |

The thing worth fixing here was the tail. Before, the party **hit the level cap during act 5** and
played the last two acts holding 173% of the XP the cap costs — every fight in act 6 paid nothing,
and the full heal that comes with a level-up had stopped arriving. Stretching the last five steps of
`progression.xpTable` (26–30 now cost 60k/74k/92k/118k/150k instead of 58k/68k/80k/94k/110k) means
the party enters act 5 at 27.4 and act 6 at 29.8, so levelling is still a live reward at the end.
Measured on its own, the stretch cost nothing in clear rate — it moved pressure from act 5 into act 6
and left the total where it was.

Gold and gear at the boundaries still roughly **double per act** (880 → 1,619 → 4,062 → 8,073 →
20,483) while shop prices do not, so by act 6 the purse is far bigger than anything a merchant sells.
Cutting the gold multiplier 1.1 → 1.0 takes ~15% off it at zero cost in difficulty (see the knob
table), but the bulk of the surplus comes from **selling loot**, not from fight rewards. Properly
fixing it means a pass over `economy.dropRate` and `loot.sellPrice`, and both of those are also the
party's gearing curve — every trial that touched them dropped act 1 out of its 85–90% band. Left for
a dedicated economy round; flagged here so it is not lost.

## What kills the party

| kind of fight | wipes before | share before | wipes after | share after |
|---|---|---|---|---|
| named | 247 | 38.5% | 357 | **43.2%** |
| ordinary | 109 | 17.0% | 164 | **19.9%** |
| boss | 207 | 32.2% | 162 | **19.6%** |
| night raid | 79 | 12.3% | 143 | **17.3%** |

Bosses have gone from a third of all wipes to a fifth — that is the funnel spreading out. Runs no
longer pile up against six act bosses; they are ground down by named leaders, ordinary road fights
and the road at night.

**Night raids are now 17.3% of wipes** (143 of 826), up from 12.3%, and 9.3% of all rests that turned
into a raid ended the party. Nothing in the `world.nightRaid` block was touched — the raid modifiers
(+1 body from act 2, ×1.1 HP, ×1.05 damage, 35% chance of a named leader, ×1.25 XP / ×1.7 gold) are
exactly as round 20 set them. Their share went up because the acts around them got harder, which is
the right way round: the raid is a risk you take to save a day, not a coin flip on the run.

The enemies actually holding the field when a party falls, after the pass: goblin_warrior (146),
hell_knight (59), bandit (50), primordial_elemental (49), molten_golem (48), goblin_scout (38),
star_horror (38), archfiend_malgrath (31), emberveil_sovereign (31), lava_titan (31) — early
goblins, mid-game knights and golems, late-game horrors and two bosses. Spread, not a single gate.

## Every knob that changed

| knob | before | after | why |
|---|---|---|---|
| `enemies.actMultipliers.2.hp` | 1.02 | **1.34** | Act 2 was the free act: 95.7% of the runs that reached it walked out, at 1.1 wipes per 100 fights. It is the first act with a settlement behind it, so it should start charging. Now 79.6%. |
| `enemies.actMultipliers.2.damage` | 0.98 | **1.27** | Same. Act-2 fights cost 6.4% of the health bar; now 11.4%, in line with act 1. |
| `enemies.actMultipliers.3.hp` | 1.50 | **1.75** | Act 3 was already one of the two acts doing work. Raised only a little in HP so fights stay short. |
| `enemies.actMultipliers.3.damage` | 1.21 | **1.78** | The bite in act 3 comes from damage, not from length: +47% damage against +17% HP. Fights are 12.1 rounds, barely up from 11.3, but cost 7.0% of the bar instead of 3.9%. |
| `enemies.actMultipliers.4.hp` | 2.42 | **3.30** | Act 4 passed 87% of the field at 1.8% of the health bar per fight — the softest act in the game. |
| `enemies.actMultipliers.4.damage` | 1.84 | **3.35** | Damage lifted past HP again. Act 4 now clears 71.2%. |
| `enemies.actMultipliers.5.hp` | 2.60 | **4.20** | Act 5 is where the party is at or near the level cap, so only enemy scaling can hold it. It passed 89.8%; now 56.6%, the sharpest act in the game and the intended one. |
| `enemies.actMultipliers.5.damage` | 1.62 | **3.80** | Enemy damage per round in act 5 goes 240 → 572 against a party whose gear score only moves 93 → 91. |
| `enemies.actMultipliers.6.hp` | 2.95 | **5.00** | The last act was carrying the whole loss (72.3% pass but every survivor got there fat). Raised, but deliberately less than damage so the final act does not turn into a 20-round slog. |
| `enemies.actMultipliers.6.damage` | 1.78 | **4.45** | Act 6 is 17.6 rounds a fight (was heading for 19.6 in an HP-only version of this table) and costs 11.0% of the health bar instead of 2.1%. |
| `progression.xpTable` (levels 26–30) | 58k/68k/80k/94k/110k | **60k/74k/92k/118k/150k** | The party hit the level cap in act 5 and finished holding 173% of the XP the cap costs, so the last two acts paid nothing and the level-up full heal stopped arriving. Now 27.4 entering act 5, 29.8 entering act 6, 121% of the table at the end. Neutral on clear rate, measured on its own. |
| `economy.globalMultipliers.gold` | 1.1 | **1.0** | Gold inflates ~2× an act and the party reaches act 6 with 20–25k it cannot spend. Measured on three seeds with and without: 12.0/14.0/13.3% against 11.7/13.0/13.7% — indistinguishable, so it is a free trim. Act-6 purse 25,482 → 20,483. |

**Deliberately not changed**, with the reason:

| knob | left at | why |
|---|---|---|
| `enemies.actMultipliers.0` / `.1` | 0.50/0.75, 1.08/1.12 | Act 1 measured 86–88% across five seeds — inside the 85–90% target. The prologue and act 1 are where the user asked for nothing to move. |
| `enemies.actMultipliers.*.armor` / `.magicResist` | the R19 ramp | Armour and magic resist make fights **longer** rather than more dangerous, and length was already the thing being fought. |
| `enemies.boss.*`, `enemies.champion.*`, `enemies.named.*` | R19 values | Bosses were 32% of all wipes before this pass and are 19.6% after it *without being touched* — the act multipliers alone spread the load. Raising boss numbers on top would rebuild the act-boss wall that round 14 removed. A trial that lifted boss damage to 1.2 and `hpShare` to 0.7 scored 8.5% clears with a worse funnel. |
| `world.nightAttack`, `world.nightRaid` | round 20 values | Raids already grew from 12.3% to 17.3% of wipes as a side effect. A trial that trimmed raid rewards and raider HP scored 9.7% with no shape improvement. |
| `economy.xp` | 2.2 | Round 20 already cut it 2.85 → 2.2 when the settlements went in; the XP-table stretch handles the remaining overrun at the top without making acts 2–3 (which needed *less* pressure, not more) grind. |
| `economy.dropRate` / `shopPrice`, `loot.*` | 0.97 / 1.15 | Every trial that squeezed these dropped act 1 to 82–84.5%, out of band. Gearing early and gold surplus late are the same knob; they need an economy pass of their own. |
| `world.defeat`, cleric revive cost | unchanged | The revive economy is round 20's new safety net and the funnel landed in band without touching it. The cleric's price is not in `balance.json` anyway — it lives in `js/game.js`, which this pass was not allowed to edit. Worth exposing as a balance knob in a later round. |

## What was tried and rejected

Eighteen candidate tables were measured, six at a time, at 200–300 runs each (each variant ran in its
own hard-linked copy of the tree so six sims could run at once without fighting over `balance.json`).

- **HP-only scaling** (act 6 HP ×6.05, damage ×4.30): 10.0% clears with the right funnel, but 19.6
  rounds per act-6 fight. Rejected in favour of the HP-for-damage trade, which hit 11.7% at 17.7 rounds.
- **Economy squeeze** (gold 1.0 + shop 1.20 + drop 0.92 together): 8.3–9.0% clears and act 1 down to
  82%. Rejected; the drop-rate cut is what breaks act 1.
- **Boss/champion emphasis** (boss damage 1.2, `hpShare` 0.7, champion `perAct` 0.025): 8.5%, and it
  rebuilt the act-boss wall. Rejected.
- **Night-raid trim** (raid XP 1.2, gold 1.5, HP 1.05, named 0.30): 9.7%, no shape gain. Rejected.
- **Softer act 3 / harder act 6** (act 3 HP 1.85, act 6 HP 6.40): 8.3% — act 6 went to 43% pass,
  which is a cliff. Rejected.
- **Even harder mid-game damage trade** (act 3 HP 1.60 / damage 1.90): 11.0% and act 3 passing 76%,
  but it did not raise the per-fight health cost in act 3 at all. Rejected as churn.

## Reproducing this

```bash
cd ~/claude/playground
node tools/sim-emberveil.mjs --runs 300 --seed 1 --quiet \
  --report prototypes/emberveil/research/sim-latest.md     # ~4 min, the "after" report above
node tools/sim-emberveil.mjs --runs 300 --seed 5           # the least forgiving of the five seeds
node --test prototypes/emberveil/tests/*.test.js           # 554/554 green after this pass
```

`ACT_LEVEL` in `tools/sim-emberveil.mjs` (the party level a `--act N` start is given) is stale — it
says level 20 at act 5 where a real run arrives at 27.4 — so mid-act starts under-state the party and
were **not** used for any of the numbers here. Everything above is full runs from day 1. Fixing that
table would make per-act searching a lot cheaper next round, but it is a `.js` change and out of
scope for a balance pass.
