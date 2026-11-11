# Rogueloot balance log

The bot (`node tools/sim.mjs --minutes 45 --seeds 2`) plays the real sim. Knobs live in `data/balance.json` (monster
health/damage multipliers + an early-level ease), the bestiary's `baseline` formulas, the item ladders and the skill
numbers. Targets (PLAN §0): ~30 min a level overall (faster early), deaths rare but real, Act 1 ≈ 18-22 rares in 10 h
(`data/rarity.json` `expected`), gear score ≈ zone level − 2.

## 2026-11-10 — first runs (M12), Proving Meadow only (levels 1-3)

```
fighter  level 3.0  deaths/h 18.7  kills/h 119  rare+/h 0.67  potions/h 7.3  gold 83  gear score 2.0
         reached level at (minutes): 2:5  3:15  4:21
rogue    level 3.0  deaths/h 18.7  kills/h 110  rare+/h 0.00  potions/h 7.3  gold 99  gear score 1.5
mage     level 2.5  deaths/h 19.3  kills/h 68   rare+/h 0.00  potions/h 8.0  gold 50  gear score 1.5
healer   level 2.5  deaths/h 18.7  kills/h 64   rare+/h 0.00  potions/h 9.3  gold 46  gear score 1.0
```

What it says, and what is queued (M13 town, M33 full pass):
- **Pace is about right early** (level 2 at 5 min, 3 at 15, 4 at ~22); it will slow as intended once zones get bigger.
- **Deaths are far too high past level 3** (a death every ~3 minutes). Causes seen: the bot pulls everything (a
  person would not), starter gear only (gear score 1-2 against level-3 packs; no vendors yet), Fighters start a fight
  at 0 Temper. Next: vendors in town (M13), Temper start at 20 in a fight, then re-tune `balance.json`.
- **Rares are stingy as designed** (0-0.7 an hour at levels 1-3 vs the data's 0.9 target): fine at this sample size.
- Fixed by this run: new heroes had an empty skill bar in the data (the screen hid it); casters before level 3 now
  fight up close like any Wanderer.

## 2026-11-10 (evening) — Saltgrass Shore, bot fixed (it spent mana walking up and then rested forever)

```
fighter  level 4.0  deaths/h 0.0  kills/h 155  potions/h 19.5  reached 2:2  3:6  4:13 (minutes)
rogue    level 3.0  deaths/h 0.0  kills/h 95   reached 2:2  3:6
mage     level 3.0  deaths/h 0.0  kills/h 146  reached 2:2  3:6
healer   level 4.0  deaths/h 0.0  kills/h 173  reached 2:2  3:6  4:18
```
Early levels are quick (fine, D2-like); no deaths in the first zone at monster damage 0.6 — likely a touch easy now.
Re-tune when Thornwood / King's Road exist (the act's pace shows past level 6). Fighters now open a fight with 15 Temper.
