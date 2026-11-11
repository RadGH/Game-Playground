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

## 2026-11-11 — Rogue fix, Windmill Fields

The bot found a solo Rogue dying 114 times an hour at level 3. Three causes:
1. **Back Cut needed you behind the target**, and a monster fighting you alone always faces you. Now it lands from any side: full power from behind, 60% from the front. (The Twinning Spine legendary now makes front cuts full power.)
2. **Agility did nothing for melee damage.** Daggers and swords now use whichever is higher, Strength or Agility.
3. Energy regen 10 → 13 a second, Notch 20 → 15 Energy, Back Cut 2.2x → 2.6x.

The bot also now skips a mark or damage-over-time that is already on the target (a player keeps them up rather than spamming them).

Windmill Fields from level 5 (where a player arrives), 20 minutes:
```
fighter  deaths/h 6  kills/h 78    rogue  deaths/h 0  kills/h 156
mage     deaths/h 3  kills/h 75    healer deaths/h 3  kills/h 303   <- the Healer is strongest; look again in the full pass (M33)
```
From level 3 with only starter gear the zone is too hard for anyone (a 3-raider pack beats every Path in a bare duel), as it should be.

## 2026-11-11 — casters' mana, melee health

The Mage bot spent 17 of every 20 minutes resting for Mana: regen came only from Spirit (the Healer's attribute).
- Mana regen = 1 + 0.2 x level + 0.25 x Spirit + **0.12 x Intellect** (above 12); out of combat it is now **x3** (was x2).
- Cinder Bolt 14 -> 10 Mana; Sunlash 8+4.5/level -> 7+3.6/level, refund 5 -> 3 Mana.
- Melee Paths are built sturdier (`PATH_BONUS` in js/rules/sheet.js, shown on the Path cards): Fighter +25% health
  +15% armour, Rogue +15% health +4 dodge.

Windmill Fields from level 5, 20 min, 2 seeds:
```
            before                         after
fighter     27 deaths/h   99 kills/h       12 deaths/h   93 kills/h
rogue       42 deaths/h   90 kills/h       36 deaths/h  104 kills/h   <- still dies most: look again in M33
mage        4.5           89 -> 222 (mana fix)
healer      0             198
```

## 2026-11-11 — mid act (the bot now arrives with gear for its level, picks a spec at 10, and avoids a pack that killed it)

Earlier mid-act runs gave the bot only its starter sword at levels 6-10, which made every weapon Path look hopeless
(spells grow with level; weapon hits only grow with better weapons). With magic gear of its level:
```
                 Thornwood L6          King's Road L8 (packs 3->2 raiders)   Elderglade L10
                 deaths/h  kills/h     deaths/h  kills/h                     deaths/h  kills/h
fighter           13.5     167          28.5     125                            9      120
rogue             12       174          40.5      63                           15       83
mage              33       152          60       114                            9      131
healer             4.5     195           4.5     113                            3      152
```
- Fixed on the way: daggers/one-hand swords never used Agility (the base field is `kind`, not `type`).
- Rogue: +25% health, +8 dodge; Back Cut from the front 75%.
- King's Road is the act's first warband country and still the spike; the Mage bot stands and casts while a warband
  charges it (a player steps back) — look at mage kiting in the bot before blaming the numbers.

## 2026-11-11 — late act (L14-19), bot with a full bar

The bot never put learned skills on its bar, so at level 16 it still fought with two starter skills (Mage 20 kills/h).
Fixed in the bot AND in the game: a newly learned skill now goes on the bar over a Wanderer skill (a new hero's bar is
never empty, so the old "fill an empty slot" rule never fired). The bot's Rogue picks the Assassin (not the bow Ranger).
```
                 Highcairn L14       Redcliff L16        Gravewatch L19 (+10% melee damage reduction, bot dodges telegraphs)
                 deaths/h kills/h    deaths/h kills/h    deaths/h kills/h
fighter            18      36          38      118         76      102
rogue              16      64          42      140        116       64
mage               32     148          50      172          6      158
healer              6      70          18      138          8      118
```
- Melee Paths now take 10% less damage (`PATH_BONUS.dr`, shown on the Path cards).
- OPEN: late-act melee still dies far more than casters in the bot. Causes seen: Barrow Husks' grab (root 2 s + damage)
  and Rattlebone Rain. Before touching numbers, teach the bot to use defensive skills (Vanguard's armour buffs, wards)
  when hunted — its bar is sorted by skill level, so it plays melee as pure offence. Kiting casters made things WORSE
  (they back into the next camp) — reverted.
