# WILDMARCH — Design Bible, page 08: items

> *"A bad rare is not rubbish. It is four Bound Essence."* — the rule Farhold's bench was built to.

**Status:** v0.1 draft — 2026-09-29. Documentation only; nothing here is built.
**Owns:** equipment slots, item levels, rarities, bases, affixes, the unique / set / legendary model,
sockets and gems, binding, group loot, drop tables, salvage, the bench, enchanting, durability,
consumables, currencies, vendors, prices, the economy, mounts and lights as loot, and appearance.
**Does not own:** the catalogue of generic sets, legendaries and uniques ([page 09](09-SETS-LEGENDARIES.md));
class sets and class legendaries (`classes/<id>.md`); damage and mitigation maths ([page 05](05-COMBAT.md));
the unlock levels for mounts, dodge and fast travel ([page 07](07-PROGRESSION.md)); screen layouts
([page 03](03-UI-SCREENS.md)); keys ([page 02](02-CONTROLS.md)); settings ([page 04](04-SETTINGS.md));
trade, auction house and mail ([page 15](15-SOCIAL-ONLINE.md)); file layout ([page 16](16-TECH.md)).

Every section says what Farhold does today `(reuse: path)` and what changes in Wildmarch `(new)` /
`(changed)`. Paths are relative to `~/claude/playground/`.

---

## Contents

1. [What is reused, in one table](#1-what-is-reused-in-one-table)
2. [Equipment slots and the paper doll](#2-equipment-slots-and-the-paper-doll)
3. [Item level and level requirement](#3-item-level-and-level-requirement)
4. [Rarities](#4-rarities)
5. [Stats and units](#5-stats-and-units)
6. [Bases: weapons, off hands, armour, jewellery](#6-bases-weapons-off-hands-armour-jewellery)
7. [The affix table](#7-the-affix-table)
8. [Uniques, sets and legendaries — the three named kinds](#8-uniques-sets-and-legendaries--the-three-named-kinds)
9. [Sockets and gems](#9-sockets-and-gems-proposed)
10. [Binding](#10-binding)
11. [Group loot](#11-group-loot)
12. [Drop tables by source](#12-drop-tables-by-source)
13. [Salvage and the bench](#13-salvage-and-the-bench)
14. [Enchanting (glyphs)](#14-enchanting-glyphs)
15. [Durability and repair](#15-durability-and-repair)
16. [Consumables](#16-consumables)
17. [Currencies](#17-currencies)
18. [Vendors and prices](#18-vendors-and-prices)
19. [The economy: sources and sinks](#19-the-economy-sources-and-sinks)
20. [Mounts, lights and quivers as loot](#20-mounts-lights-and-quivers-as-loot)
21. [Appearance: the wardrobe and dyes](#21-appearance-the-wardrobe-and-dyes)
22. [The item card](#22-the-item-card)
23. [Data shapes](#23-data-shapes)
24. [Farhold bugs found while writing this page](#24-farhold-bugs-found-while-writing-this-page)
25. [Notes for other pages](#25-notes-for-other-pages)

---

## 1. What is reused, in one table

| Piece | Farhold / playground source | In Wildmarch |
|---|---|---|
| Item bases (57 weapons, 47 armour) | `prototypes/emberveil/data/items.json` `weaponBases`, `armorBases` (shared with Emberveil) | reused; named bases folded into one dice row per type (§6) |
| Loot generator | `prototypes/emberveil/js/loot.js` (`generate`, `generateUnique`, `generateSetItem`, `price`, `salvage`) | reused as the server's roller |
| Affix units, caps, tiers, slot rules | `prototypes/farhold/js/affixes.js` (`ENGINE_UNIT`, `AFFIX_CAP`, `AFFIX_TUNING`, `SLOT_RULES`, `AFFIX_TIERS`) | reused and extended to item level 80 (§3, §7) |
| Effect registry (every affix and power's code + sentence) | `prototypes/farhold/js/effects.js` | reused; 40 minor powers become the unique powers (page 09 §5) |
| 189 uniques + power handlers | `prototypes/farhold/data/uniques.json`, `js/uniques.js`, `tools/build-uniques.mjs` | reused as the world unique pool (page 09 §4) |
| Mounts, lights, quivers | `prototypes/farhold/js/gear.js` (`GEAR_BASES`, `SLOT_AFFIXES`) | reused; boats, ships and ground vehicles dropped |
| Caster foci | `prototypes/farhold/js/foci.js` | reused (§6.3) |
| Materials + bench | `prototypes/farhold/js/craft.js`, `data/crafting.json` | reused; one new material, four new actions (§13) |
| Chests + loot beacons | `prototypes/farhold/js/chests.js`, `data/balance.json` `chests` | reused (§12.8) |
| Rarity roll | `prototypes/farhold/js/rpg.js` `rarityFor`, `balance.json` `rarity` | reused with seven tiers (§4) |
| Gambler crates | `prototypes/farhold/js/town.js` `CRATE_TIERS`, `gamble()` | reused (§18.3) |
| Shop buyback, `price()` honouring `basePrice` | `js/town.js` buy/sell, `js/rpg.js` `price()` | reused (§18) |
| Unbinder prices | `data/balance.json` `retrain` | page 07 owns; listed as a gold sink here (§19) |
| Item vault catalogue (340 flavour items) | `items/data/items.json`, `items/js/items.js` | reused for **junk and quest items** only: vendor trash, trophies, lore items (§12.10) |
| Tool slot, scanner, ore, industry, colony vendors | `js/tools.js`, `js/vendors.js`, `data/tools.json` | **not in Wildmarch** — no gathering industry (canon §1) |

---

## 2. Equipment slots and the paper doll

Farhold has 13 slots (`js/rpg.js` `SLOTS`): weapon, offhand, head, chest, legs, hands, feet, ring,
ring2, necklace, mount, light, tool. Wildmarch **drops the tool slot** and **adds three armour slots**
that Chibi 2 can already draw: shoulders (`pauldrons` / `mantle` / `capelet` in `avatar-3d/js/chibi2-gear.js`),
back (`cape` / `cloak`) and waist (`belt` / `belt_pouches`). An MMO needs more pieces to find, and
these three are already modelled. **(changed)**

### 2.1 The fifteen slots

| # | Slot id | Name on the doll | Holds | Armour type applies? | Chibi 2 part | Origin |
|---|---|---|---|---|---|---|
| 1 | `head` | Head | helms, hoods, caps, crowns | yes | hat / helm | reuse |
| 2 | `shoulders` | Shoulders | pauldrons, mantles, spaulders | yes | `pauldrons`, `mantle` | **new** |
| 3 | `chest` | Chest | robes, jerkins, hauberks, plate | yes | body outfit | reuse |
| 4 | `back` | Back | cloaks and capes (one weight: "any") | no | `cape`, `cloak` | **new** |
| 5 | `hands` | Hands | gloves, gauntlets | yes | hands | reuse |
| 6 | `waist` | Waist | sashes, belts, girdles — adds potion belt charges, not slots (§16.1) | yes | `belt`, `belt_pouches` | **new** |
| 7 | `legs` | Legs | leggings, greaves | yes | legs | reuse |
| 8 | `feet` | Feet | slippers, boots, sabatons | yes | feet | reuse |
| 9 | `necklace` | Neck | amulets, pendants | no | — (not drawn) | reuse |
| 10 | `ring` | Ring I | rings | no | — | reuse |
| 11 | `ring2` | Ring II | rings (a unique ring may not be worn twice) | no | — | reuse |
| 12 | `weapon` | Main hand | any weapon | — | held part | reuse |
| 13 | `offhand` | Off hand | shield, ward, focus (incl. hourglass, field map), instrument (lute, warhorn, hand drum), quiver, a one-handed weapon (dual wield), torch-hand when empty | — | held part | reuse |
| 14 | `light` | Light | torch, lantern, lamp (§20.2) | no | `belt_torch` / held | reuse |
| 15 | `mount` | Mount | a mount (§20.1) | no | creature body | reuse |

**Two-handed weapons** empty the off hand, except a **quiver**, which a bow or crossbow may wear
(Farhold R22 fixed `offhandRefusal` for exactly this). **Dual wielding**: any one-handed weapon in each
hand if the class file allows it; the off-hand weapon swings on its own clock (page 05).

**Armour type rule (new):** a class may wear its own armour type (canon §6) **and any lighter one**
(heavy > medium > light > cloth). Personal loot (§11) only rolls your own type. Wearing all seven
armour-typed pieces (`head`, `shoulders`, `chest`, `hands`, `waist`, `legs`, `feet`) in your own type grants
**Proficiency: +5% to your class's main attribute**.

### 2.2 The paper doll

The doll is Farhold's round-10 equip figure (`research/ui-round10-design.md`, the sheet's Equipment
tab) with three more sockets. Layout, left column top to bottom, right column top to bottom, weapons
along the bottom:

```
 ┌──────────┐                      ┌──────────┐
 │  Head    │                      │  Neck    │
 ├──────────┤                      ├──────────┤
 │Shoulders │      ( 3D figure,    │  Back    │
 ├──────────┤        turnable,     ├──────────┤
 │  Chest   │        live Chibi 2) │  Ring I  │
 ├──────────┤                      ├──────────┤
 │  Hands   │                      │  Ring II │
 ├──────────┤                      ├──────────┤
 │  Waist   │                      │  Light   │
 ├──────────┤                      ├──────────┤
 │  Legs    │                      │  Mount   │
 ├──────────┤                      └──────────┘
 │  Feet    │
 └──────────┘
        ┌────────────┐  ┌────────────┐
        │ Main hand  │  │  Off hand  │
        └────────────┘  └────────────┘
   Item level 64.3 · Armour 4,210 · Set: Rimecrown 4/6 · Legendaries 2/2
```

Each socket shows the item icon in its rarity colour, a thin durability bar (red under 20%), a gem
pip per socket, and a small `2H` badge on the off hand when a two-hander locks it. The footer line
shows **average equipped item level** (all 13 combat slots, light and mount excluded, a two-hander
counted twice), total armour, each active set as `Name n/6`, and legendaries worn as `n/2`.
Page 03 owns the screen (`scr_character`, Equipment tab).

---

## 3. Item level and level requirement

`(reuse: prototypes/farhold/js/affixes.js itemLevelFor, requirementFor, AFFIX_TIERS)`

Every piece of gear carries an **item level** (`ilvl`). It decides the base numbers (§6), which affixes
may roll (each has a minimum ilvl) and how big they roll (the tier, §7).

### 3.1 Item level of a drop

| Source | Item level |
|---|---|
| Open-world kill | enemy level + rarity lift (Common +0, Uncommon +1, Rare +2, Epic +3, Unique/Set/Legendary +3) + a wobble of −1…+1 (Farhold `itemLevelFor`) |
| Chest in the world | zone level + the same lift |
| Quest reward | quest level + 1 (story) / + 2 (dungeon and calling quests) |
| Normal dungeon | dungeon's top band level + 1 (e.g. `d05_glass_tombs` 19–22 → ilvl 23) |
| Heroic dungeon (level 60) | 66; final boss 68 |
| Mythic+ (level 60) | end-of-run chest 68 + 1 per keystone level, max 78 at key 10+; weekly vault 80 at key 10+ |
| Raids | `r01` N 34 / M 38 · `r02` N 46 / M 50 · `r03` N 54 / M 58 · `r04` N 70 / M 76 · `r05` N 76 / M 82 |
| Raid final boss | +2 over that raid |
| Secret bosses | +4 over the instance's final boss |
| World bosses | region band top + 2; the two **Ascendant** world bosses each week (raised to level 60, proposed for page 13): 72 |
| Veilspire Isle open world (60) | 62–66 |
| PvP vendor | Glory 66 · Laurels 72 (§17) |
| Crafted at the bench | the crafter's level (≤60); endgame recipes 66 / 70 (§13) |
| Ascend (token upgrade) | +3 per step, 3 steps, never past the source's ceiling (§13.4) |

### 3.2 Level requirement

`required level = min(60, max(1, ilvl − 1))` (Farhold `requirementFor`, capped at the canon level cap).
Every item of ilvl 61+ requires level 60; past 60, item level is the only progression number.
`of Early Promise` (§7) lowers the requirement by 2–4 per roll, capped at 12 total, **on its own item
while in the bag** and on everything else once worn (reuse, Farhold round 6).

### 3.3 Affix tiers by item level

Farhold's six tiers stop at 44 because its cap was 50. Wildmarch adds three for the endgame. **(changed)**

| Tier | From ilvl | Multiplier on the level-1 range (`mult`) | Origin |
|---|---|---|---|
| crude | 1 | 1.00 | reuse |
| plain | 8 | 1.35 | reuse |
| fine | 16 | 1.75 | reuse |
| superior | 24 | 2.20 | reuse |
| exquisite | 34 | 2.70 | reuse |
| mythic | 44 | 3.30 | reuse |
| heroic | 60 | 3.80 | **new** |
| ascendant | 70 | 4.40 | **new** |
| veiled | 80 | 5.00 | **new** |

An affix rolls `(min + rng × (max − min)) × (1 + (mult − 1) × growth / 3)`, never below `min`, then is
clipped to the stat's per-roll cap and rounded (fractions to 2 decimals, the rest to 1). `growth` is 3
by default, **1.7 for multiplier stats** (they compound with every other share you wear) and per-row
overrides (attributes 4.5, weapon damage 6, flags 1). This is exactly `rollAffixValue` in
`js/affixes.js`, with the three new tiers added to `AFFIX_TIERS`.

---

## 4. Rarities

Canon lists seven rarities. Farhold has six colours for six display states (`items.json`
`rarityColors` + `rarityDoc`: normal, magic, rare, legendary, unique, set). Farhold's "legendary" is a
random item with 5–6 properties — **that is Wildmarch's Epic**. Wildmarch's **Legendary** is a new,
top tier (a named item with a major power) and needs a colour of its own. **(changed)**

| # | Rarity | Engine key (Farhold key) | Name colour | Loot beam (`RARITY_BEACON`) | Random affixes | Fixed lines | Power | Share of open-world drops |
|---|---|---|---|---|---|---|---|---|
| 1 | Common | `common` (`normal`) | `#c9c2b6` grey-cream | 1 beam, 1.8 m | 0 | base only | — | 60.0% |
| 2 | Uncommon | `uncommon` (`magic`) | `#7f95ff` blue | 2 beams, 3.0 m | 1–2 (+1 on jewellery) | — | — | 28.5% |
| 3 | Rare | `rare` (`rare`) | `#e8d020` yellow | 3 beams, 4.0 m, 5 motes | 3 (+1 on jewellery) | — | — | 9.0% |
| 4 | Epic | `epic` (`legendary`) | `#ff8020` orange | 4 beams, 5.2 m, 8 motes | 4 (+1 on jewellery and back) | — | — | 2.0% (ramps in, §4.1) |
| 5 | Unique | `unique` | `#ff5a3c` red-orange | 5 beams, 6.0 m, 10 motes | 1 random-range line | 2–3 | **minor power** | 0.45% (from level 5) |
| 6 | Set | `set` | `#2fc4b2` teal | 4 beams, 5.2 m, 8 motes | 1 random-range line | 2 | set bonus (2/4/6) | only from the set's listed sources |
| 7 | Legendary | `legendary` (new) | `#c86bff` violet, animated shimmer on the name | 6 beams, 7.5 m, 14 motes, a low hum (sfx `loot_legendary`) | 1–2 random-range lines | 3 | **major power** | 0.05% (from level 20) |

- An item's **display rarity** is decided the Farhold way (`shared/rewards.js` `rarityClass`): Set if it
  has a `setId`, else Legendary if `isLegendary`, else Unique if `isUnique`, else its rolled rarity.
- **Jewellery bonus** `(reuse: items.json accessoryAffixBonus = 1)`: rings and the necklace roll one
  extra affix at Uncommon, Rare and Epic. Wildmarch extends the bonus to the back slot at Epic only.
- **Rarity gems** on item icons: `assets/data/ui/rarity_<gem>.svg` (reuse); Legendary needs a new
  `rarity_mythic.svg` gem (art request, page 17).

### 4.1 The rarity roll

`(reuse: js/rpg.js rarityFor + balance.json rarity)`. Farhold's table is normal 60.5 / magic 29 /
rare 9 / legendary 1.5, with legendary reaching full weight at level 16 and rare at level 10. Wildmarch:

| Rarity | Base weight | Ramp | Magic find applies? |
|---|---|---|---|
| Common | 60.0 | — (takes the rest) | no |
| Uncommon | 28.5 | — | yes |
| Rare | 9.0 | from 25% of weight at level 1 to full at level 10 | yes |
| Epic | 2.0 | from 10% at level 1 to full at level 16 | yes |
| Unique | 0.45 | 0 below level 5, full at level 12 | yes, at half effect |
| Legendary | 0.05 | 0 below level 20, full at level 30 | no |

**Magic find** multiplies every "yes" weight by `1 + MF/100` (Unique by `1 + MF/200`); Common absorbs
the difference. MF only works on **open-world kills and open-world chests** (never on dungeon, raid,
world-boss or quest loot), so nobody swaps into a magic-find kit before a boss. **(new)**
A source's `rarityBoost` (champions 1.5, rares 2.2 — `balance.json ranks`) multiplies the non-Common
weights the same way, and a **floor** (§12) removes every rarity below it.

---

## 5. Stats and units

### 5.1 The unit rule

`(reuse: js/affixes.js ENGINE_UNIT)` — the single most important lesson Farhold learned about items
(round 6): **every stat has exactly one unit, and every reader and writer agrees on it.** Seven reported
bugs ("0% critical chance", "+1993% damage to the undead") were all the data and the reader disagreeing.

| Unit | Means | Example stored | Card reads |
|---|---|---|---|
| `flat` | a raw number: health, armour, damage, seconds, metres | `hp: 40` | +40 health |
| `pct` | percentage points, added to a percent stat | `critChance: 6` | +6% critical chance |
| `frac` | a share, used as `1 + v` or `1 − v` | `spellPower: 0.12` | +12% spell power |
| `flag` | present or absent; the value is always 1 | `cond_extraSetPiece: 1` | "counts as 2 pieces" |

Wildmarch keeps `convert()` (a `pct` below 1 was written as a fraction and is ×100; a `frac` above 3
was written as a percentage and is ÷100) as a safety net at data load, and a unit test that rolls every
affix 10,000 times and fails on any value a card would print as 0 or above its cap (reuse:
Farhold's `tests/affixes.test.js`).

### 5.2 Primary stats on items

| Stat | Unit | What it does (page 05 owns the maths) | Origin |
|---|---|---|---|
| `str`, `dex`, `int`, `con` | flat | canon attributes; weapon scaling and health (page 07) | reuse |
| `dmg` | flat | added to weapon dice after the level term (Farhold `derive`) | reuse |
| `armor` | flat | physical mitigation | reuse |
| `resistAll` | flat | mitigation against fire, ice, lightning, poison, shadow, arcane, holy | reuse (`magicResist`, renamed) |
| `hp` | flat | maximum health | reuse |
| `resource` | flat | maximum Mana; see §5.4 for Fury/Focus | reuse (`mp`, renamed) |
| `hpRegen` / `resourceRegen` | flat | per second | reuse (`hpRegen`, `mana_regen`) |
| `spellPower` | frac | multiplies spell damage (**applied once**, see §24) | reuse |
| `healPower` | frac | multiplies healing done | **new** |
| `critChance` / `critDamage` | pct | chance / bonus on a critical hit | reuse |
| `attackSpeed` | pct | weapon swing rate | reuse (`initiative` × 4, restated) |
| `castSpeed` | pct | shortens cast bars and channels | **new** |
| `cooldownReduction` | pct | spells come back sooner | reuse |
| `moveSpeed` | frac | run speed (not mounted) | **new** as an affix |
| `dodge` | pct | chance to evade a non-telegraphed hit | reuse |
| `blockChance` / `blockPower` | pct / flat | shields | reuse |
| `barrier` / `barrierRegen` | flat | ward and focus off hands | reuse |
| `lifeSteal` / `resourceSteal` | pct | share of damage returned | reuse |
| `magicFind` / `goldFind` / `xpFind` | pct | loot quality, gold, experience | reuse |
| `cond_*` | varies | conditional properties (the "extended" affixes) | reuse |

Farhold's `hit` (accuracy) is **not** a Wildmarch stat (dropped in Farhold R21: enemies have no dodge).

### 5.3 Gear-side totals (proposed; page 05 may tighten)

Per-roll caps are in §7. These are the ceilings on the **character's total** from all gear, gems,
glyphs and sets together (perks, talents and buffs stack above them only where page 05 says so). **(new)**

| Stat | Total from gear | | Stat | Total from gear |
|---|---|---|---|---|
| critChance | 50% | | cooldownReduction | 30% |
| critDamage | 250% | | attackSpeed | 60% |
| dodge | 35% | | castSpeed | 40% |
| blockChance | 60% | | moveSpeed | 15% |
| lifeSteal | 20% | | cond_zoneDmgReduce | 25% |
| every `…DmgReducePct` together | 40% | | magicFind | 150% |

### 5.4 Resource affixes for Fury and Focus classes (new)

`of Focus` (+resource) and `of Replenishing` (+resource regen) read in the looter's resource:

| Class resource | 1 point of `resource` = | 1 point of `resourceRegen` = |
|---|---|---|
| Mana | 1 maximum mana | 1 mana a second |
| Fury | 0.2 maximum Fury | +2% Fury generated |
| Focus | 0.2 maximum Focus | +1.5% Focus regeneration |

Bind-on-equip items show the line in the viewer's own resource.

---

## 6. Bases: weapons, off hands, armour, jewellery

### 6.1 Scaling with item level (changed)

Farhold puts the level term on the **player**: `player.damagePerLevel` 0.11 multiplies the weapon's own
dice by the character's level (`js/rpg.js derive`, round 14). Wildmarch moves that term **onto the item**:

- **Weapon dice at ilvl L = base dice × (1 + 0.11 × (L − 1))**
- **Armour, block power and barrier at ilvl L = base × (1 + 0.11 × (L − 1))**

Same curve, one owner. **Page 05 must not also apply `damagePerLevel`** — that would be the "one
multiplier, two owners" bug Farhold keeps finding. (Listed in the report as a canon/ownership note.)

Multiplier at key item levels: ilvl 1 → ×1.00 · 10 → ×1.99 · 20 → ×3.09 · 30 → ×4.19 · 40 → ×5.29 ·
50 → ×6.39 · 60 → ×7.49 · 70 → ×8.59 · 80 → ×9.69.

**Quality is removed (changed).** Emberveil items carry a quality (low 0.7 / medium 1.0 / high 1.2 /
elite 1.4 / exotic 1.6). With item level doing that job, a third axis only confuses the card. Every
Wildmarch item is `quality: "medium"` internally (×1.0) so `loot.js` works unchanged; the bench's
Temper becomes **Refine** (§13.3).

**Named bases (changed).** Emberveil has several bases per weapon type (sword, longsword, forager_blade,
hunters_edge, dragonfang_sword…). In Wildmarch each **weapon type has one dice row**; the other bases
become **named variants**: +10% dice, one intrinsic line, their own Chibi 2 look, and a first-drop
level. This keeps "a better sword" meaning "a higher item level", not "a different spreadsheet row".

### 6.2 Weapon types

Swing numbers are Farhold's `js/weapons.js WEAPON_PATTERNS` (reuse); dice are `items.json` (reuse).
Page 05 owns what a pattern does; class files own which classes may use which type.

| Type | Base key | Hands | Category | Scales on | Dice ilvl 1 | Dice ilvl 60 | Swing every (s) | Reach (m) | Pattern | Trait (reuse) | First drops at level |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dagger | `dagger` | 1 | light | DEX | 3–7 | 22–52 | 0.34 | 2.0 | jab, jab, slash | 10% armour pen | 1 |
| Sword | `sword` | 1 | heavy | STR+DEX | 6–14 | 45–105 | 0.58 | 2.8 | slash, slash, arc | — | 1 |
| Longsword | `longsword` | 1 | heavy | STR+DEX | 8–16 | 60–120 | 0.64 | 3.0 | slash, slash, overhead | — | 12 |
| Rapier | `rapier` | 1 | light | DEX | 5–11 | 37–82 | 0.52 | 3.3 | thrust, thrust, lunge | +8% crit | 6 |
| Sabre | `obsidian_scimitar` | 1 | light | DEX | 7–15 | 52–112 | 0.46 | 2.7 | slash, slash, arc | +6% crit | 12 |
| Axe | `battleaxe` | 1 | heavy | STR | 9–17 | 67–127 | 0.82 | 2.8 | cleave, slash, cleave | 10% bleed | 12 |
| Mace | `iron_mace` | 1 | heavy | STR | 9–17 | 67–127 | 0.62 | 2.4 | overhead, slash, slam | 8% stun | 6 |
| Hammer | `hammer` | 1 | heavy | STR | 8–16 | 60–120 | 0.66 | 2.5 | overhead, sweep, slam | 10% stun | 6 |
| Warhammer | `warhammer` | 1 | heavy | STR | 10–18 | 75–135 | 0.76 | 2.6 | overhead, overhead, slam | 12% stun | 12 |
| Sceptre | `scepter` | 1 | magic | INT | 5–12 | 37–90 | 0.64 | 2.5 | overhead, slash | off-hand OK | 6 |
| Wand | `wand` | 1 | magic | INT | 4–10 | 30–75 | bolt | 46 (bolt) | bolt + wand behaviour | off-hand OK, element | 1 |
| Greatsword | `greatsword` | 2 | heavy | STR | 15–29 | 112–217 | 0.96 | 4.2 | sweep, overhead, arc | STR ×1.5 | 19 |
| Greataxe | `axe2h` | 2 | heavy | STR | 16–30 | 120–225 | 0.94 | 3.6 | cleave, cleave, slam | 15% bleed | 19 |
| Halberd | `halberd` | 2 | heavy | STR+DEX | 13–24 | 97–180 | 1.00 | 4.8 | thrust, sweep, overhead | 7.4 m pierce line | 19 |
| Spear | `spear` | 1 | light | STR+DEX | 8–15 | 60–112 | 0.66 | 4.0 | thrust, thrust, sweep | reach | 6 |
| Quarterstaff | `quarterstaff` | 2 | light (swings) | STR+DEX | 7–14 | 52–105 | 0.48 | 3.5 | jab, sweep, jab, sweep | flow | 12 |
| Staff | `staff` | 2 | magic | INT | 8–20 | 60–150 | charge | 46 | charged cast (0.35–2.6 s) | INT ×1.5 | 6 |
| Bow | `bow` | 2 | light | DEX | 8–16 | 60–120 | 1.05 | 46 | draw 0.35–0.95 s | DEX ×1.3 | 6 |
| Shortbow | `shortbow` | 2 | light | DEX | 6–12 | 45–90 | 0.85 | 46 | quick draw | — | 1 |
| Longbow | `longbow` | 2 | light | DEX | 10–19 | 75–142 | 1.15 | 55 | slow draw, ×1.1 range | **new base** | 19 |
| Crossbow | `crossbow` | 2 | light | DEX+STR | 12–22 | 90–165 | 1.25 | 46 | reload 1.25 s, ×1.8 power | — | 12 |
| Javelin | `javelin` | 1 | light | STR+DEX | 9–18 | 67–135 | 0.75 | 40 | thrown | returns on hit | 12 |
| Orb (weapon) | `orb` | 1 | magic | INT | 3–8 | 22–60 | bolt | 46 | bolt | off-hand OK, INT ×1.15 | 12 |
| Tome (weapon) | `tome` | 1 | magic | INT | 2–6 | 15–45 | bolt | 46 | bolt | off-hand OK, +10 resource | 12 |
| Hand wraps | `wraps` (`it_hand_wraps`) | 2 | light | DEX+STR | 5–10 *(proposed)* | 37–75 *(proposed)* | 0.34 | 1.9 | jab, jab, jab (Farhold's bare-fist row) | Monk only; every 3rd jab gives +1 Chi ([classes/monk.md](classes/monk.md)) | 1 · **new base (requested by the Monk file)** |
| Light crossbow | `light_crossbow` (`it_light_crossbow`) | 1 | light | DEX | 7–13 *(proposed)* | 52–97 *(proposed)* | 0.90 reload *(proposed)* | 40 | reload, ×1.4 power *(proposed)* | the one-handed "hand crossbow" of the Tinker and Witch Hunter; off hand may hold a dagger | 1 · **new base (requested by the Tinker / Witch Hunter files)** |

**Named variants** (each +10% dice, keeps its Emberveil intrinsic unless noted, first drop level in
brackets): Forager's Blade (sword, 6) · Lantern Mace (mace, 6) · Pathfinder Javelin (12) · Tithe Dagger (6) ·
Roadwarden Bow (12) · Pilgrim's Staff (12) · Emberbrand Wand (fire, 12) · Rimecut Sabre (ice, 12) ·
Bramble Staff (nature→poison, 12) · Warhorn Maul (hammer, 19) · Breaker's Pick (greataxe, 19) ·
Hunter's Edge (sword, 19) · Stormpin Crossbow (lightning, 19) · Gravebound Sceptre (shadow, 28) ·
Dawnwarden Hammer (holy, 28) · Blood Ledger (greatsword, 28) · Covenant Hammer (28) · Grudgebrand (28) ·
Starwake Bow (36) · Watchfire Glaive (javelin, 36) · Voidsteel Greatsword (40) · Starfall Bow (40) ·
Abyssal Rod (staff, 40) · Ember Focus (wand, 40) · the six Dragonfang/Wyrmscale/Dragonbone/Drakehammer/
Dragontooth bases (52).

Emberveil intrinsics that described its travel game are **replaced** on the named variants (changed):
`cond_forageRation` → +1–3 health a second out of combat · `cond_nightWard` → +10–20% armour at night ·
`cond_extraLeg` → +4% move speed · `cond_easeExhaustion` → +1–2 health a second · `cond_watch` →
+2–4 health a second standing still · `cond_vehicleDmg` → +15–25% damage while mounted ·
`cond_guardBond` → town guards near you deal +20% damage · `cond_companionExtra` → +20% follower damage ·
`cond_nemesisMark` → +18% damage to whatever killed you last · `cond_killMemory` / `cond_killGrowth` →
kept (they read the weapon's own kill count). This matches what Farhold already did in `js/effects.js`.

### 6.3 Off hands

| Kind | Base key | Weight | Armour ilvl 1 | Block chance | Block power ilvl 1 | Barrier ilvl 1 / regen | Property | Origin |
|---|---|---|---|---|---|---|---|---|
| Buckler | `buckler` | light | 3 | 20% | 8 | — | +2 dodge | reuse |
| Shield | `shield` | heavy | 5 | 20% | 10 | — | +5 dodge | reuse |
| Kite Shield | `kite_shield` | medium | 7 | 30% | 18 | — | — | reuse |
| Tower Shield | `tower_shield` | heavy | 12 | 40% | 32 | — | — | reuse |
| Aegis Shield | `aegis_shield` | heavy | 18 | 50% | 55 | — | first drop 40 | reuse |
| Warded Focus | `warded_focus` | cloth | 1 | — | — | 8 / 2 | draws as a relic | reuse |
| Rune Aegis | `rune_aegis` | cloth | 2 | — | — | 18 / 4 | — | reuse |
| Spellguard Orb | `spellguard_orb` | cloth | 3 | — | — | 32 / 7 | draws as an orb | reuse |
| Arcane Bulwark | `arcane_bulwark` | cloth | 4 | — | — | 55 / 11 | first drop 40 | reuse |
| Grimoire | `grimoire` | cloth focus | 1 | — | — | — | every 3rd wand bolt throws a page (2nd bolt at 60%); spells cost 15% less; +12 resource | reuse (`js/foci.js`) |
| Seer's Orb | `seer_orb` | cloth focus | 1 | — | — | — | a mote strikes the nearest enemy within 9 m every 1.4 s for 30% | reuse |
| Reliquary | `reliquary` | cloth focus | 3 | — | — | 10 | 25% of blows taken answer with a holy nova (60%) and heal you 4% | reuse |
| Psalter | `psalter` | cloth focus | 2 | — | — | — | +12% spell power, +8 resource | reuse |
| Effigy | `effigy` | cloth focus | 1 | — | — | — | statuses you lay last 2 s longer and do 25% more | reuse |
| Hourglass | `hourglass` (`it_hourglass`) | cloth focus | 1 | — | — | — | no base power; rolls focus affixes; Chronomancer only (the art exists: Farhold `classes.json` `held: hourglass`) | **new base (requested by [classes/chronomancer.md](classes/chronomancer.md))** |
| Field Map | `field_map` (`it_field_map`) | medium focus | 2 | — | — | — | no base power; rolls focus affixes; never swings; Tactician only | **new base (requested by [classes/tactician.md](classes/tactician.md))** |
| Lute | `lute` (`it_lute`) | light instrument | 1 | — | — | — | song radius 20 m; +8% spell healing; Bard only | **new base (requested by [classes/bard.md](classes/bard.md) §7)** |
| Warhorn | `warhorn` (`it_warhorn`) | light instrument | 1 | — | — | — | song radius 26 m; songs cost +0.1% mana a second more; Bard only | **new base (bard)** |
| Hand Drum | `hand_drum` (`it_hand_drum`) | light instrument | 1 | — | — | — | song radius 16 m; verse timer 3.0 → 2.6 s; Bard only | **new base (bard)** |
| Hide Quiver | `quiver` | light | — | — | — | — | +3 damage per arrow (×ilvl curve) | reuse (`js/gear.js`) |
| Ember / Rime Quiver | `quiver_ember` / `quiver_rime` | light | — | — | — | — | +4 per arrow, fire / ice brand | reuse |
| Splitshaft Quiver | `quiver_split` | light | — | — | — | — | +2 per arrow, 2 arrows a shot, 0.13 rad spread | reuse |
| Seeker Quiver | `quiver_seeker` | light | — | — | — | — | +3 per arrow, arrows home 3.7 m | reuse |
| Burstshot Quiver | `quiver_burst` | light | — | — | — | — | +3 per arrow, 2.2 m burst at 55% | reuse |

### 6.4 Armour bases

Armour numbers at ilvl 1 are `items.json` (reuse); ilvl 60 is ×7.49 (rounded). `dodgeBonus` (reuse)
is the dodge penalty heavy armour carries. **New** rows fill the three new slots and the cloth hands/feet
Emberveil never had.

| Slot | Cloth | Light | Medium | Heavy |
|---|---|---|---|---|
| Head | Hood `cloth_helm` 1 → 7 | Leather Cap `light_helm` 3 → 22 | Chain Coif `medium_helm` 5 → 37 (−1 dodge) | War Helm `heavy_helm` 8 → 60 (−2) · Plate Helm `plate_helm` 10 → 75 (−3, from 19) |
| Shoulders **(new)** | Mantle `cloth_shoulders` 1 → 7 | Spaulders `light_shoulders` 2 → 15 | Chain Pauldrons `medium_shoulders` 4 → 30 (−1) | Plate Pauldrons `heavy_shoulders` 6 → 45 (−1) |
| Chest | Robes `cloth_chest` 2 → 15 | Leather Armor `light_chest` 6 → 45 | Chain Shirt `medium_chest` 10 → 75 (−2) · Scaled Hauberk `scaled_chest` 13 → 97 (−2, from 19) | Plate Armor `heavy_chest` 16 → 120 (−4) · Runed Cuirass `runed_chest` 20 → 150 (−4, from 28) |
| Hands | Wraps `cloth_hands` **(new)** 1 → 7 | Leather Gauntlets `light_gauntlets` 3 → 22 | Chain Gauntlets `medium_gauntlets` 5 → 37 (−1) | Plate Gauntlets `heavy_gauntlets` 6 → 45 (−1) · Runed `runed_gauntlets` 8 → 60 (from 28) |
| Waist **(new)** | Rope Sash `cloth_waist` 1 → 7 | Leather Belt `light_waist` 2 → 15 | Studded Belt `medium_waist` 3 → 22 | Iron Girdle `heavy_waist` 5 → 37 (−1) |
| Legs | Linen Leggings `cloth_legs` 1 → 7 | Leather Legs `light_legs` 4 → 30 | Chain Legs `medium_legs` 7 → 52 (−1) · Scaled Greaves `scaled_legs` 9 → 67 (from 19) | Plate Legs `heavy_legs` 11 → 82 (−3) · Runed Greaves `runed_legs` 14 → 105 (from 28) |
| Feet | Slippers `cloth_feet` **(new)** 1 → 7 | Leather Boots `light_boots` 3 → 22 | Chain Boots `medium_boots` 5 → 37 (−1) | Plate Boots `heavy_boots` 7 → 52 (−2) · Runed Sabatons `runed_boots` 9 → 67 (from 28) |
| Back **(new, one weight)** | Travel Cloak `cloak` 2 → 15, any class · Warden's Cape `cape` 3 → 22 (from 12) · Mantle of the Veil `veil_cloak` 4 → 30 (from 60) | | | |

The dragon armour bases (`dragonscale_cloth`, `wyrmscale_helm`, `wyrmscale_chest`, `dragonsteel_chest`,
`dragonhide_legs`, `dragonclaw_gauntlets`) become named variants from level 52, +10% armour.

### 6.5 Jewellery bases

Jewellery has no base stats; every value is in its affixes (Uncommon+ rolls one extra, §4).

| Base | Slot | First drop | Origin |
|---|---|---|---|
| Ring `ring` | ring | 1 | reuse |
| Gold Signet `gold_signet` | ring | 12 | reuse |
| Dragonheart Ring `dragonheart_ring` | ring | 52 | reuse |
| Necklace `necklace` | necklace | 1 | reuse |
| Silver Amulet `silver_amulet` | necklace | 12 | reuse |
| Dragontooth Amulet `dragontooth_amulet` | necklace | 52 | reuse |

---

## 7. The affix table

`(reuse: prototypes/emberveil/data/items.json affixes, restated by prototypes/farhold/js/affixes.js)`

Emberveil files affixes in four groups (11 prefixes, 8 suffixes, 5 shield, 40 extended). Farhold
retunes every one (`AFFIX_TUNING`), caps them (`AFFIX_CAP`), restricts the odd ones to certain slots
(`SLOT_RULES`), and adds `of Early Promise` plus the slot-only light, mount and tool affixes
(`js/gear.js SLOT_AFFIXES`). Wildmarch takes all of that, drops the tool affixes and `of Accuracy`,
retunes a few caps for group play, renames four clashing names, fixes three rows (§24), and adds twelve
new affixes. **82 affixes.**

**How to read it.**
- **Name** is what the item's title uses: a prefix goes before the base ("Deadly Longsword"), an
  `of …` suffix after it ("… of Vitality"). With several affixes the title uses the highest-rolled
  prefix and suffix only (reuse: Emberveil naming).
- **Level-1 roll** is the crude-tier range. **Min ilvl** is the lowest item level it can appear on.
- **Growth** 3 is the default; 1.7 for `frac` stats; other values are per-row overrides.
- **Allowed slots**: `all` = every slot except light and mount. W = main hand (and an off-hand weapon),
  O = off hand, H head, Sh shoulders, C chest, B back, Ha hands, Wa waist, L legs, F feet, N necklace,
  R either ring. "physical/magic weapons" use Emberveil's `physicalOnly` / `magicOnly` flags.
- **Cap** is the ceiling on **one roll**, applied again after any crafting (reuse). The character-total
  ceilings are §5.3.
- An affix may appear **once per item**. Two different affixes on the same stat may both appear.
- **Light and mount** roll only their own slot affixes plus `of_str/dex/int/con`, `of_hp` and `of_magic_resist`
  **(changed:** in Farhold `JEWELLERY` includes light and mount, so conditionals could roll on a lamp).

### 7.1 Every affix

| # | id | Name | Stat | Unit | Level-1 roll | Min ilvl | Growth | Allowed slots | Cap | Origin / note |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `of_str` | Sturdy | `str` | flat | 2–5 | 1 | 4.5 | all | — | reuse |
| 2 | `of_dex` | Swift | `dex` | flat | 2–5 | 1 | 4.5 | all | — | reuse |
| 3 | `of_int` | Wise | `int` | flat | 2–5 | 1 | 4.5 | all | — | reuse |
| 4 | `of_con` | Hardy | `con` | flat | 2–5 | 1 | 4.5 | all | — | reuse |
| 5 | `sharp` | Sharp | `dmg` | flat | 2–5 | 1 | 6 | W (physical weapons only) | — | reuse |
| 6 | `sturdy` | Reinforced | `armor` | flat | 2–5 | 1 | 5 | all | — | reuse |
| 7 | `of_hp` | of Vitality | `hp` | flat | 8–22 | 1 | 5 | all | — | reuse |
| 8 | `of_mp` | of Focus | `resource` | flat | 6–16 | 1 | 3 | all | — | reuse; reads as your class resource (see §5.4) |
| 9 | `of_magic_resist` | of Warding | `resistAll` | flat | 3–9 | 1 | 3 | all | — | reuse (magicResist renamed resistAll) |
| 10 | `of_mana_regen` | of Replenishing | `resourceRegen` | flat | 0.6–1.6 | 2 | 3 | all | — | reuse, renamed (two affixes were both "of Regeneration") |
| 11 | `hp_regen` | of Mending | `hpRegen` | flat | 2–8 | 2 | 3 | all | — | reuse, renamed |
| 12 | `potency` | Potent | `spellPower` | frac | 5%–18% | 3 | 1.7 | W (magic), O (focus/ward), N | 150% | reuse |
| 13 | `crit_chance` | Deadly | `critChance` | pct | 4%–9% | 3 | 3 | W, Ha, N | 60% | reuse |
| 14 | `crit_damage` | Savage | `critDamage` | pct | 12%–25% | 3 | 3 | W, Ha, N | 250% | reuse |
| 15 | `of_dodge` | of Evasion | `dodge` | pct | 3%–7% | 2 | 3 | all | 45% | reuse |
| 16 | `of_speed` | of Haste | `attackSpeed` | pct | 6%–14% | 2 | 2 | W, Ha, N, R | 60% | reuse; Farhold stored 1.5-3.5 "initiative" shown x4 - Wildmarch stores the % directly; slots narrowed (new) |
| 17 | `lifeSteal` | Leeching | `lifeSteal` | pct | 3%–8% | 5 | 3 | W, N, R | 25% | reuse; slots narrowed (new) |
| 18 | `manaSteal` | Siphoning | `resourceSteal` | pct | 3%–8% | 5 | 3 | W, N, R | 25% | reuse; slots narrowed (new) |
| 19 | `of_gold` | of Fortune | `goldFind` | pct | 10%–25% | 1 | 3 | all | 100% | reuse; cap 300 -> 100 |
| 20 | `xp_gain` | of Learning | `xpFind` | pct | 5%–12% | 4 | 3 | H | 25% | reuse; cap 100 -> 25; inert at level 60 |
| 21 | `magic_find_adv` | of Discovery | `magicFind` | pct | 20%–35% | 4 | 3 | N, R, H | 150% | reuse; cap 300 -> 150; open world only (§9.3) |
| 22 | `cdr` | of Swiftcasting | `cooldownReduction` | pct | 5%–12% | 6 | 3 | N, R, H, Sh | 30% | reuse; cap 50 -> 30; + shoulders |
| 23 | `block_chance` | Bulwark | `blockChance` | pct | 6%–15% | 1 | 3 | O (shield) | 65% | reuse |
| 24 | `block_power` | Bracing | `blockPower` | flat | 12–50 | 1 | 3 | O (shield) | — | reuse |
| 25 | `shield_magic_resist` | Spellguard | `resistAll` | flat | 6–16 | 1 | 3 | O (shield), C, L - medium/heavy only | — | reuse |
| 26 | `barrier_size` | Wardstone | `barrier` | flat | 8–32 | 3 | 3 | O (ward/focus) | — | reuse |
| 27 | `barrier_regen` | Conduit | `barrierRegen` | flat | 2–8 | 3 | 3 | O (ward/focus) | — | reuse |
| 28 | `dmg_vs_undead` | of Banishing | `cond_dmgVsUndead` | frac | 15%–35% | 6 | 1.7 | N, R, W | 75% | reuse; cap 2.5 -> 0.75 |
| 29 | `dmg_vs_demons` | of Exorcism | `cond_dmgVsDemon` | frac | 15%–35% | 6 | 1.7 | N, R, W | 75% | reuse; cap 2.5 -> 0.75 (fiends) |
| 30 | `kill_rally` | of the Reaper | `cond_killInitBonus` | frac | 8%–16% | 8 | 1.7 | N, R, F | 60% | reuse |
| 31 | `speed_on_hit` | of Alacrity | `cond_speedOnFirstHit` | frac | 8%–18% | 8 | 1.7 | N, R, F | 50% | reuse |
| 32 | `poison_stack` | of Necrosis | `cond_poisonStackPower` | frac | 20%–40% | 8 | 1.7 | N, R, W | 150% | reuse |
| 33 | `fire_vs_poison` | of Ignition | `cond_fireDmgVsPoisoned` | frac | 15%–30% | 8 | 1.7 | N, R, W | 100% | reuse; cap 2.5 -> 1.0 |
| 34 | `cold_vs_burn` | of Rime | `cond_coldDmgVsBurning` | frac | 15%–30% | 8 | 1.7 | N, R, W | 100% | reuse; cap 2.5 -> 1.0 |
| 35 | `lightning_vs_slow` | of the Storm | `cond_lightningVsSlowed` | frac | 15%–30% | 8 | 1.7 | N, R, W | 100% | reuse; cap 2.5 -> 1.0 |
| 36 | `poison_vs_burn` | Venomous | `cond_poisonDmgVsBurning` | frac | 15%–30% | 8 | 1.7 | N, R, W | 100% | reuse; cap 2.5 -> 1.0 |
| 37 | `magic_vs_status` | of the Void Shard | `cond_magicDmgVsAnyStatus` | frac | 12%–26% | 8 | 1.7 | N, R, W | 100% | reuse; cap 2.5 -> 1.0 |
| 38 | `low_hp_dmg` | of Desperation | `cond_dmgBelowHpThresh` | frac | 15%–30% | 6 | 1.7 | N, R, C, W | 100% | reuse; cap 2.5 -> 1.0 |
| 39 | `focus_dmg` | of Persistence | `cond_consecutiveHitDmg` | frac | 8%–16% | 8 | 1.7 | N, R, W | 50% | reuse, renamed (clashed with "of Focus") |
| 40 | `crit_armorpen` | of Rending | `cond_critArmorPen` | frac | 25%–45% | 8 | 1.7 | N, R, W | 75% | reuse |
| 41 | `dot_resist` | of the Sealed Skin | `cond_dotDmgReduce` | frac | 15%–30% | 6 | 1.7 | N, R, C, H | 60% | reuse |
| 42 | `phys_dmg_reduce` | of the Bulwark | `cond_physDmgReducePct` | frac | 8%–15% | 6 | 1.7 | N, R, C, L | 30% | reuse; cap 0.5 -> 0.3 |
| 43 | `magic_dmg_reduce` | of the Hearthward | `cond_magicDmgReducePct` | frac | 8%–15% | 6 | 1.7 | N, R, C, L | 30% | reuse, renamed; cap 0.5 -> 0.3 |
| 44 | `execute` | of Execution | `cond_executeDmgPct` | frac | 20%–40% | 8 | 1.7 | N, R, W | 100% | reuse; cap 2.5 -> 1.0 |
| 45 | `sustained_dmg` | of Endurance | `cond_sustainedDmgBonus` | frac | 10%–22% | 8 | 1.7 | N, R, W | 100% | reuse; cap 2.0 -> 1.0 |
| 46 | `mana_shield` | of the Mana Ward | `cond_manaShieldOnHit` | frac | 12%–25% | 8 | 1.7 | N, R, C, O | 30% | reuse; cap 0.5 -> 0.3 |
| 47 | `gold_on_elite` | of the Plunderer | `cond_goldOnEliteKill` | frac | 15%–40% | 4 | 1.7 | N, R, H | 100% | reuse; cap 3 -> 1 |
| 48 | `first_hit_crit` | of Opening | `cond_firstHitCritBonus` | pct | 12%–22% | 8 | 3 | N, R, W, O | 40% | reuse |
| 49 | `ambush_bonus` | of Ambush | `cond_ambushDmgFlat` | flat | 8–20 | 6 | 3 | N, R, W | — | reuse |
| 50 | `combat_barrier` | of the Vanguard | `cond_combatStartBarrier` | flat | 12–32 | 8 | 3 | N, R, C, O | — | reuse |
| 51 | `hp_on_kill` | of the Glutton | `cond_hpOnKill` | flat | 5–15 | 4 | 3 | N, R, Ha, W | — | reuse |
| 52 | `party_hp_on_kill` | of the Benefactor | `cond_partyHpOnKill` | flat | 3–8 | 8 | 3 | N, R | — | reuse; heals group members and followers within 30 m (new) |
| 53 | `thorns_flat` | Spiked | `cond_thornsFlat` | flat | 4–12 | 4 | 3 | N, R, C, Ha, O | — | reuse |
| 54 | `mana_on_attack` | of the Tap | `cond_manaOnAttack` | flat | 1–3 | 4 | 3 | N, R, W | — | reuse, renamed (clashed with "Siphoning") |
| 55 | `mana_on_crit` | of Brilliance | `cond_manaOnCrit` | flat | 2–6 | 6 | 3 | N, R, W | — | reuse |
| 56 | `low_mana_regen` | of the Wellspring | `cond_lowManaRegenBonus` | flat | 0.5–1.5 | 6 | 3 | N, R | — | reuse |
| 57 | `skill_cost_reduce` | of Efficiency | `cond_skillMpCostReduce` | flat | 1–4 | 6 | 3 | N, R, H | — | reuse |
| 58 | `burn_extend` | of Conflagration | `cond_burnExtend` | flat | 1–2.5 | 8 | 3 | N, R, W | — | reuse (seconds) |
| 59 | `bleed_on_crit` | of Laceration | `cond_bleedOnCrit` | frac | 30%–60% | 8 | 1.7 | N, R, W | 120% | CHANGED: share of the crit as bleed over 6 s (Farhold: 0.3-0.6 damage a second, see §5.6) |
| 60 | `after_skill_sp` | of Resonance | `cond_afterSkillSpellPow` | frac | 5%–12% | 8 | 1.7 | N, R, W, O | 40% | CHANGED: share, not points (Farhold bug, see §5.6) |
| 61 | `early_promise` | of Early Promise | `cond_levelReqReduce` | flat | 2–4 | 4 | 2.5 | N, R | 12 | reuse (Farhold-only affix) |
| 62 | `set_piece_bonus` | of the Covenant | `cond_extraSetPiece` | flag | yes | 10 | 1 | N, R | — | reuse; not on set pieces themselves |
| 63 | `set_threshold_low` | of Attunement | `cond_setThresholdReduce` | flag | yes | 10 | 1 | N, R | — | reuse; not on set pieces themselves |
| 64 | `cheat_death` | of Second Wind | `cond_cheatDeath` | frac | 20% | 12 | 1 | N, R | 20% | CHANGED: survive at 20% health, every 90 s (Farhold rolls 1 = full health, see §5.6) |
| 65 | `heal_power` | Merciful | `healPower` | frac | 5%–15% | 3 | 1.7 | W, O, N, C, H | 150% | new - the healer's "Potent" |
| 66 | `cast_speed` | Fluent | `castSpeed` | pct | 3%–6% | 6 | 2 | W, Ha, N, R | 40% | new - shortens cast bars and channels |
| 67 | `swiftfoot` | Fleet | `moveSpeed` | frac | 3%–6% | 5 | 1.2 | F | 15% | new - feet only; does not stack with mount speed |
| 68 | `threat` | Provoking | `cond_threatMult` | frac | 10%–20% | 5 | 1.7 | O (shield), H, C, N, R - heavy/medium armour only | 100% | new - tanks |
| 69 | `groundward` | of Sure Footing | `cond_zoneDmgReduce` | frac | 5%–10% | 20 | 1.7 | F, N, R | 25% | new - less damage from void zones and danger zones; never from a one-shot |
| 70 | `named_slayer` | of the Headsman | `cond_dmgVsNamed` | frac | 4%–8% | 10 | 1.7 | W, N, R | 40% | reuse stat (road weapons) as an affix (new) - champions, rares, bosses |
| 71 | `heal_received` | of Succour | `cond_healReceived` | frac | 5%–10% | 6 | 1.7 | C, Wa, N, R | 40% | new |
| 72 | `dodge_recover` | of the Tumbler | `cond_dodgeCooldown` | flat | 0.1–0.3 | 15 | 1.5 | F, Wa | 1 | new - seconds off the dodge roll cooldown |
| 73 | `potion_power` | of the Apothecary | `cond_potionPower` | frac | 10%–20% | 4 | 1.7 | Wa | 60% | new - potions heal/restore more |
| 74 | `follower_might` | of the Pack | `cond_companionFury` | frac | 10%–20% | 6 | 1.7 | N, R, B | 100% | reuse stat (Houndmaster's Lash) as an affix (new) - pets, thralls, followers |
| 75 | `interrupt_cd` | of the Silencer | `cond_interruptCooldown` | frac | 8%–15% | 20 | 1.7 | Ha, N, R | 30% | new - interrupt spells come back sooner |
| 76 | `light_dmg` | Emberwick | `cond_lightDmg` | frac | 3%–8% | 10 | 1.7 | light only | 25% | new - +damage to enemies inside your light radius, night only |
| 77 | `wide_beam` | Broad | `cond_lightRange` | flat | 8–20 | 1 | 3 | light only | 60 | reuse |
| 78 | `seeking_light` | Finder's | `cond_lightReveal` | frac | 8%–22% | 4 | 1.7 | light only | 35% | reuse |
| 79 | `surefoot` | Surefooted | `cond_mountSlope` | frac | 15%–35% | 1 | 1.7 | mount only | 70% | reuse |
| 80 | `longwind` | Long-winded | `cond_mountStamina` | flat | 6–18 | 1 | 3 | mount only | 60 | reuse (seconds of gallop) |
| 81 | `trample` | Trampling | `cond_mountTrample` | flat | 4–14 | 4 | 3 | mount only | 60 | reuse |
| 82 | `calm` | Calm | `cond_mountCalm` | frac | 15%–40% | 3 | 1.7 | mount only | 80% | reuse |

### 7.2 Ranges by tier

The roll for each tier (item level where the tier starts in brackets). "—" = the affix cannot roll on an item that low (its min ilvl is above the whole tier). Per-roll caps already applied. `frac` values are shown as percentages.

| id | crude (1) | plain (8) | fine (16) | superior (24) | exquisite (34) | mythic (44) | heroic (60) | ascendant (70) | veiled (80) |
|---|---|---|---|---|---|---|---|---|---|
| `of_str` | 2–5 | 3.1–7.6 | 4.2–10.6 | 5.6–14 | 7.1–17.8 | 8.9–22.2 | 10.4–26 | 12.2–30.5 | 14–35 |
| `of_dex` | 2–5 | 3.1–7.6 | 4.2–10.6 | 5.6–14 | 7.1–17.8 | 8.9–22.2 | 10.4–26 | 12.2–30.5 | 14–35 |
| `of_int` | 2–5 | 3.1–7.6 | 4.2–10.6 | 5.6–14 | 7.1–17.8 | 8.9–22.2 | 10.4–26 | 12.2–30.5 | 14–35 |
| `of_con` | 2–5 | 3.1–7.6 | 4.2–10.6 | 5.6–14 | 7.1–17.8 | 8.9–22.2 | 10.4–26 | 12.2–30.5 | 14–35 |
| `sharp` | 2–5 | 3.4–8.5 | 5–12.5 | 6.8–17 | 8.8–22 | 11.2–28 | 13.2–33 | 15.6–39 | 18–45 |
| `sturdy` | 2–5 | 3.2–7.9 | 4.5–11.2 | 6–15 | 7.7–19.2 | 9.7–24.2 | 11.3–28.3 | 13.3–33.3 | 15.3–38.3 |
| `of_hp` | 8–22 | 12.7–34.8 | 18–49.5 | 24–66 | 30.7–84.3 | 38.7–106.3 | 45.3–124.7 | 53.3–146.7 | 61.3–168.7 |
| `of_mp` | 6–16 | 8.1–21.6 | 10.5–28 | 13.2–35.2 | 16.2–43.2 | 19.8–52.8 | 22.8–60.8 | 26.4–70.4 | 30–80 |
| `of_magic_resist` | 3–9 | 4.1–12.2 | 5.2–15.8 | 6.6–19.8 | 8.1–24.3 | 9.9–29.7 | 11.4–34.2 | 13.2–39.6 | 15–45 |
| `of_mana_regen` | 0.6–1.6 | 0.8–2.2 | 1.1–2.8 | 1.3–3.5 | 1.6–4.3 | 2–5.3 | 2.3–6.1 | 2.6–7 | 3–8 |
| `hp_regen` | 2–8 | 2.7–10.8 | 3.5–14 | 4.4–17.6 | 5.4–21.6 | 6.6–26.4 | 7.6–30.4 | 8.8–35.2 | 10–40 |
| `potency` | 5%–18% | 6%–21.6% | 7.1%–25.7% | 8.4%–30.2% | 9.8%–35.3% | 11.5%–41.5% | 12.9%–46.6% | 14.6%–52.7% | 16.3%–58.8% |
| `crit_chance` | 4%–9% | 5.4%–12.2% | 7%–15.8% | 8.8%–19.8% | 10.8%–24.3% | 13.2%–29.7% | 15.2%–34.2% | 17.6%–39.6% | 20%–45% |
| `crit_damage` | 12%–25% | 16.2%–33.8% | 21%–43.8% | 26.4%–55% | 32.4%–67.5% | 39.6%–82.5% | 45.6%–95% | 52.8%–110% | 60%–125% |
| `of_dodge` | 3%–7% | 4.1%–9.5% | 5.2%–12.2% | 6.6%–15.4% | 8.1%–18.9% | 9.9%–23.1% | 11.4%–26.6% | 13.2%–30.8% | 15%–35% |
| `of_speed` | 6%–14% | 7.4%–17.3% | 9%–21% | 10.8%–25.2% | 12.8%–29.9% | 15.2%–35.5% | 17.2%–40.1% | 19.6%–45.7% | 22%–51.3% |
| `lifeSteal` | 3%–8% | 4.1%–10.8% | 5.2%–14% | 6.6%–17.6% | 8.1%–21.6% | 9.9%–25% | 11.4%–25% | 13.2%–25% | 15%–25% |
| `manaSteal` | 3%–8% | 4.1%–10.8% | 5.2%–14% | 6.6%–17.6% | 8.1%–21.6% | 9.9%–25% | 11.4%–25% | 13.2%–25% | 15%–25% |
| `of_gold` | 10%–25% | 13.5%–33.8% | 17.5%–43.8% | 22%–55% | 27%–67.5% | 33%–82.5% | 38%–95% | 44%–100% | 50%–100% |
| `xp_gain` | 5%–12% | 6.8%–16.2% | 8.8%–21% | 11%–25% | 13.5%–25% | 16.5%–25% | 19%–25% | 22%–25% | 25% |
| `magic_find_adv` | 20%–35% | 27%–47.2% | 35%–61.2% | 44%–77% | 54%–94.5% | 66%–115.5% | 76%–133% | 88%–150% | 100%–150% |
| `cdr` | 5%–12% | 6.8%–16.2% | 8.8%–21% | 11%–26.4% | 13.5%–30% | 16.5%–30% | 19%–30% | 22%–30% | 25%–30% |
| `block_chance` | 6%–15% | 8.1%–20.2% | 10.5%–26.2% | 13.2%–33% | 16.2%–40.5% | 19.8%–49.5% | 22.8%–57% | 26.4%–65% | 30%–65% |
| `block_power` | 12–50 | 16.2–67.5 | 21–87.5 | 26.4–110 | 32.4–135 | 39.6–165 | 45.6–190 | 52.8–220 | 60–250 |
| `shield_magic_resist` | 6–16 | 8.1–21.6 | 10.5–28 | 13.2–35.2 | 16.2–43.2 | 19.8–52.8 | 22.8–60.8 | 26.4–70.4 | 30–80 |
| `barrier_size` | 8–32 | 10.8–43.2 | 14–56 | 17.6–70.4 | 21.6–86.4 | 26.4–105.6 | 30.4–121.6 | 35.2–140.8 | 40–160 |
| `barrier_regen` | 2–8 | 2.7–10.8 | 3.5–14 | 4.4–17.6 | 5.4–21.6 | 6.6–26.4 | 7.6–30.4 | 8.8–35.2 | 10–40 |
| `dmg_vs_undead` | 15%–35% | 18%–41.9% | 21.4%–49.9% | 25.2%–58.8% | 29.4%–68.7% | 34.5%–75% | 38.8%–75% | 43.9%–75% | 49%–75% |
| `dmg_vs_demons` | 15%–35% | 18%–41.9% | 21.4%–49.9% | 25.2%–58.8% | 29.4%–68.7% | 34.5%–75% | 38.8%–75% | 43.9%–75% | 49%–75% |
| `kill_rally` | — | 9.6%–19.2% | 11.4%–22.8% | 13.4%–26.9% | 15.7%–31.4% | 18.4%–36.9% | 20.7%–41.4% | 23.4%–46.8% | 26.1%–52.3% |
| `speed_on_hit` | — | 9.6%–21.6% | 11.4%–25.7% | 13.4%–30.2% | 15.7%–35.3% | 18.4%–41.5% | 20.7%–46.6% | 23.4%–50% | 26.1%–50% |
| `poison_stack` | — | 24%–47.9% | 28.5%–57% | 33.6%–67.2% | 39.3%–78.5% | 46.1%–92.1% | 51.7%–103.5% | 58.5%–117.1% | 65.3%–130.7% |
| `fire_vs_poison` | — | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% | 43.9%–87.8% | 49%–98% |
| `cold_vs_burn` | — | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% | 43.9%–87.8% | 49%–98% |
| `lightning_vs_slow` | — | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% | 43.9%–87.8% | 49%–98% |
| `poison_vs_burn` | — | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% | 43.9%–87.8% | 49%–98% |
| `magic_vs_status` | — | 14.4%–31.2% | 17.1%–37.1% | 20.2%–43.7% | 23.6%–51% | 27.6%–59.9% | 31%–67.3% | 35.1%–76.1% | 39.2%–84.9% |
| `low_hp_dmg` | 15%–30% | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% | 43.9%–87.8% | 49%–98% |
| `focus_dmg` | — | 9.6%–19.2% | 11.4%–22.8% | 13.4%–26.9% | 15.7%–31.4% | 18.4%–36.9% | 20.7%–41.4% | 23.4%–46.8% | 26.1%–50% |
| `crit_armorpen` | — | 30%–53.9% | 35.6%–64.1% | 42%–75% | 49.1%–75% | 57.6%–75% | 64.7%–75% | 73.2%–75% | 75% |
| `dot_resist` | 15%–30% | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–60% | 38.8%–60% | 43.9%–60% | 49%–60% |
| `phys_dmg_reduce` | 8%–15% | 9.6%–18% | 11.4%–21.4% | 13.4%–25.2% | 15.7%–29.4% | 18.4%–30% | 20.7%–30% | 23.4%–30% | 26.1%–30% |
| `magic_dmg_reduce` | 8%–15% | 9.6%–18% | 11.4%–21.4% | 13.4%–25.2% | 15.7%–29.4% | 18.4%–30% | 20.7%–30% | 23.4%–30% | 26.1%–30% |
| `execute` | — | 24%–47.9% | 28.5%–57% | 33.6%–67.2% | 39.3%–78.5% | 46.1%–92.1% | 51.7%–100% | 58.5%–100% | 65.3%–100% |
| `sustained_dmg` | — | 12%–26.4% | 14.3%–31.4% | 16.8%–37% | 19.6%–43.2% | 23%–50.7% | 25.9%–56.9% | 29.3%–64.4% | 32.7%–71.9% |
| `mana_shield` | — | 14.4%–30% | 17.1%–30% | 20.2%–30% | 23.6%–30% | 27.6%–30% | 30% | 30% | 30% |
| `gold_on_elite` | 15%–40% | 18%–47.9% | 21.4%–57% | 25.2%–67.2% | 29.4%–78.5% | 34.5%–92.1% | 38.8%–100% | 43.9%–100% | 49%–100% |
| `first_hit_crit` | — | 16.2%–29.7% | 21%–38.5% | 26.4%–40% | 32.4%–40% | 39.6%–40% | 40% | 40% | 40% |
| `ambush_bonus` | 8–20 | 10.8–27 | 14–35 | 17.6–44 | 21.6–54 | 26.4–66 | 30.4–76 | 35.2–88 | 40–100 |
| `combat_barrier` | — | 16.2–43.2 | 21–56 | 26.4–70.4 | 32.4–86.4 | 39.6–105.6 | 45.6–121.6 | 52.8–140.8 | 60–160 |
| `hp_on_kill` | 5–15 | 6.8–20.2 | 8.8–26.2 | 11–33 | 13.5–40.5 | 16.5–49.5 | 19–57 | 22–66 | 25–75 |
| `party_hp_on_kill` | — | 4.1–10.8 | 5.2–14 | 6.6–17.6 | 8.1–21.6 | 9.9–26.4 | 11.4–30.4 | 13.2–35.2 | 15–40 |
| `thorns_flat` | 4–12 | 5.4–16.2 | 7–21 | 8.8–26.4 | 10.8–32.4 | 13.2–39.6 | 15.2–45.6 | 17.6–52.8 | 20–60 |
| `mana_on_attack` | 1–3 | 1.4–4.1 | 1.8–5.2 | 2.2–6.6 | 2.7–8.1 | 3.3–9.9 | 3.8–11.4 | 4.4–13.2 | 5–15 |
| `mana_on_crit` | 2–6 | 2.7–8.1 | 3.5–10.5 | 4.4–13.2 | 5.4–16.2 | 6.6–19.8 | 7.6–22.8 | 8.8–26.4 | 10–30 |
| `low_mana_regen` | 0.5–1.5 | 0.7–2 | 0.9–2.6 | 1.1–3.3 | 1.4–4.1 | 1.6–4.9 | 1.9–5.7 | 2.2–6.6 | 2.5–7.5 |
| `skill_cost_reduce` | 1–4 | 1.4–5.4 | 1.8–7 | 2.2–8.8 | 2.7–10.8 | 3.3–13.2 | 3.8–15.2 | 4.4–17.6 | 5–20 |
| `burn_extend` | — | 1.4–3.4 | 1.8–4.4 | 2.2–5.5 | 2.7–6.8 | 3.3–8.2 | 3.8–9.5 | 4.4–11 | 5–12.5 |
| `bleed_on_crit` | — | 35.9%–71.9% | 42.8%–85.5% | 50.4%–100.8% | 58.9%–117.8% | 69.1%–120% | 77.6%–120% | 87.8%–120% | 98%–120% |
| `after_skill_sp` | — | 6%–14.4% | 7.1%–17.1% | 8.4%–20.2% | 9.8%–23.6% | 11.5%–27.6% | 12.9%–31% | 14.6%–35.1% | 16.3%–39.2% |
| `early_promise` | 2–4 | 2.6–5.2 | 3.2–6.5 | 4–8 | 4.8–9.7 | 5.8–11.7 | 6.7–12 | 7.7–12 | 8.7–12 |
| `set_piece_bonus` | — | yes | yes | yes | yes | yes | yes | yes | yes |
| `set_threshold_low` | — | yes | yes | yes | yes | yes | yes | yes | yes |
| `cheat_death` | — | 20% | 20% | 20% | 20% | 20% | 20% | 20% | 20% |
| `heal_power` | 5%–15% | 6%–18% | 7.1%–21.4% | 8.4%–25.2% | 9.8%–29.4% | 11.5%–34.5% | 12.9%–38.8% | 14.6%–43.9% | 16.3%–49% |
| `cast_speed` | 3%–6% | 3.7%–7.4% | 4.5%–9% | 5.4%–10.8% | 6.4%–12.8% | 7.6%–15.2% | 8.6%–17.2% | 9.8%–19.6% | 11%–22% |
| `swiftfoot` | 3%–6% | 3.4%–6.8% | 3.9%–7.8% | 4.4%–8.9% | 5%–10.1% | 5.8%–11.5% | 6.4%–12.7% | 7.1%–14.2% | 7.8%–15% |
| `threat` | 10%–20% | 12%–24% | 14.3%–28.5% | 16.8%–33.6% | 19.6%–39.3% | 23%–46.1% | 25.9%–51.7% | 29.3%–58.5% | 32.7%–65.3% |
| `groundward` | — | — | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25% | 14.6%–25% | 16.3%–25% |
| `named_slayer` | — | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% | 11.7%–23.4% | 13.1%–26.1% |
| `heal_received` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% | 14.6%–29.3% | 16.3%–32.7% |
| `dodge_recover` | — | 0.1–0.4 | 0.1–0.4 | 0.2–0.5 | 0.2–0.6 | 0.2–0.6 | 0.2–0.7 | 0.3–0.8 | 0.3–0.9 |
| `potion_power` | 10%–20% | 12%–24% | 14.3%–28.5% | 16.8%–33.6% | 19.6%–39.3% | 23%–46.1% | 25.9%–51.7% | 29.3%–58.5% | 32.7%–60% |
| `follower_might` | 10%–20% | 12%–24% | 14.3%–28.5% | 16.8%–33.6% | 19.6%–39.3% | 23%–46.1% | 25.9%–51.7% | 29.3%–58.5% | 32.7%–65.3% |
| `interrupt_cd` | — | — | 11.4%–21.4% | 13.4%–25.2% | 15.7%–29.4% | 18.4%–30% | 20.7%–30% | 23.4%–30% | 26.1%–30% |
| `light_dmg` | — | 3.6%–9.6% | 4.3%–11.4% | 5%–13.4% | 5.9%–15.7% | 6.9%–18.4% | 7.8%–20.7% | 8.8%–23.4% | 9.8%–25% |
| `wide_beam` | 8–20 | 10.8–27 | 14–35 | 17.6–44 | 21.6–54 | 26.4–60 | 30.4–60 | 35.2–60 | 40–60 |
| `seeking_light` | 8%–22% | 9.6%–26.4% | 11.4%–31.4% | 13.4%–35% | 15.7%–35% | 18.4%–35% | 20.7%–35% | 23.4%–35% | 26.1%–35% |
| `surefoot` | 15%–35% | 18%–41.9% | 21.4%–49.9% | 25.2%–58.8% | 29.4%–68.7% | 34.5%–70% | 38.8%–70% | 43.9%–70% | 49%–70% |
| `longwind` | 6–18 | 8.1–24.3 | 10.5–31.5 | 13.2–39.6 | 16.2–48.6 | 19.8–59.4 | 22.8–60 | 26.4–60 | 30–60 |
| `trample` | 4–14 | 5.4–18.9 | 7–24.5 | 8.8–30.8 | 10.8–37.8 | 13.2–46.2 | 15.2–53.2 | 17.6–60 | 20–60 |
| `calm` | 15%–40% | 18%–47.9% | 21.4%–57% | 25.2%–67.2% | 29.4%–78.5% | 34.5%–80% | 38.8%–80% | 43.9%–80% | 49%–80% |

### 7.3 Affix counts by slot and a worked example

| Rarity | Weapon / armour | Rings, necklace | Back |
|---|---|---|---|
| Common | 0 | 0 | 0 |
| Uncommon | 1–2 (50/50) | 2–3 | 1–2 |
| Rare | 3 | 4 | 3 |
| Epic | 4 | 5 | 5 |

The roller picks affixes by weight: attributes, damage, armour, health and resistance weigh **5**,
every conditional weighs **1** (reuse: `balance.json loot.plainWeight 5 / exoticWeight 1` — without this,
a weapon almost never rolled plain damage because 40 of Emberveil's 59 affixes are conditionals).

*Example — an Epic longsword, ilvl 44 (mythic tier, `mult` 3.3):* **"Deadly Longsword of Execution"**
- dice 8–16 × 5.73 (§6.1) = **46–92 damage**
- `sharp`: 2–5 × (1 + 2.3 × 6/3 = 5.6) = 11–28 → rolled **+23 damage**
- `crit_chance`: 4–9 × 3.3 = 13.2–29.7 → rolled **+21% critical chance**
- `of_str`: 2–5 × (1 + 2.3 × 4.5/3 = 4.45) = 8.9–22.3 → rolled **+17 STR**
- `execute` (frac, growth 1.7): 0.2–0.4 × (1 + 2.3 × 1.7/3 = 2.30) = 46–92%, per-roll cap 100% → rolled **+43% damage to targets below 25% health**

---

## 8. Uniques, sets and legendaries — the three named kinds

All three are **named items with a fixed identity**, written in data (page 09 or a class file), never
invented by the roller. The table is the definition every other page uses.

| | Unique | Set piece | Legendary |
|---|---|---|---|
| **What it is** | A named item with fixed lines and one **minor power** — a proc or a rider that makes the item interesting without changing how you play | A named piece belonging to a set of 4 or 6; wearing 2/4/6 pieces of one set turns on **set bonuses** | A named item with a **major power** that changes how you play: moves you, rewrites a spell, interacts with a boss telegraph, cheats death |
| **Colour** | `#ff5a3c` | `#2fc4b2` | `#c86bff` + shimmer |
| **Lines** | 2–3 fixed + 1 random-range + power | 2 fixed + 1 random-range | 3 fixed + 1–2 random-range + power |
| **Power size** | a Farhold round-23 power (`js/effects.js U23`): chains, stacking DoTs, auras, "every 3rd swing" | 2-piece: stats · 4-piece: a mechanic · 6-piece: a bigger mechanic or a spell rewrite (class sets) | bigger than any unique; often has a cooldown and a visible effect |
| **Where they come from** | the world pool (any kill of the right level, 0.45% of drops) **and** listed sources | only the set's listed sources (dungeon, raid, world boss, vendor, bench) | listed sources, plus a small world pool from level 20 (0.05% of drops) |
| **Limit worn** | any number (a unique ring cannot be worn twice) | any number of sets at once | **two at a time** (new); a third will not equip and the card says why |
| **Binding** | world-pool: bind on equip · instance: bind on pickup | bind on pickup (crafted sets: bind on equip) | bind on pickup; world-pool ones bind on equip |
| **Scales?** | yes — a unique drops at the level of what dropped it (its item level scales its lines); its level is the lowest it can drop at | fixed ilvl by source | fixed ilvl by source; world-pool ones scale like uniques |
| **Salvage** | always leaves Resonant Dust | always leaves Resonant Dust | Dust + a Veilglass shard at ilvl 60+ |
| **Farhold reuse** | `data/uniques.json` (189) + `js/uniques.js` | `items.json sets` (54: 24 generic + 30 class) + `FOCUS_SETS` | new tier; Farhold's 24 original "legendary effects" + 48 round-23 powers are the base vocabulary |

### 8.1 Set bonus rules

- Bonuses switch on at **2, 4 and 6 pieces** (4-piece sets: 2 and 4). Each bonus includes the ones below it.
- Pieces of one set may be any mix of slots the set lists; a set lists exactly as many pieces as its
  top bonus (a set never has "spare" pieces). Two rings of one set may both be worn.
- `of the Covenant` (`cond_extraSetPiece`): the ring counts as 2 pieces of every set you wear (reuse).
  `of Attunement` (`cond_setThresholdReduce`): every set bonus comes on 1 piece early (reuse). Neither
  can roll on a set piece. Both together cannot take a 6-piece bonus below 4 real pieces. **(new)**
- Farhold's `activationPieces` + `legendaryEffect` on a set (the set's power at full count) becomes the
  **top bonus** in Wildmarch's format.
- The card lists every bonus, greys the inactive ones, and names the missing pieces.

### 8.2 Legendary rules

- **Two legendaries equipped at most.** A legendary weapon in each hand counts as two.
- A legendary's power is **always on the card in full numbers** (Farhold `describe()` sentence, generated
  from the same constant the code uses — never typed twice).
- No extraction: a legendary's power cannot be moved to another item in v2. (A "power codex" is a
  common endgame idea *(reference)*; left out so a legendary stays a find.)
- The first time a character loots each legendary, the whole group sees a centre-screen banner
  "Name looted **Legendary Name**" and hears `loot_legendary` (page 17).

---

## 9. Sockets and gems (proposed)

Not in Farhold. **(new)** A small, optional layer that gives Epic endgame gear a way to be tuned
without rerolling it, and gives rare enemies one more thing to drop.

### 9.1 Sockets

| Rule | Value |
|---|---|
| Which items can have a socket | Epic, Unique, Set, Legendary of ilvl 40+ |
| Slots that can roll one | head, chest, legs, necklace, rings |
| Chance an eligible drop has one | 15% (Epic) · 25% (Unique, Set) · 100% on legendary jewellery |
| Maximum | 1 socket per item (2 on a two-handed weapon, bench only) |
| Adding one | bench action **Bore a socket** (§13.3) — Epic+ ilvl 40+, the slots above plus weapons |
| Removing a gem | free at any Jeweller; the gem comes back whole |

### 9.2 Gems

Eight kinds × five grades. Gems drop from rares (4%), sub-bosses (6%), bosses (10% per player), gilded and
warded chests (8% / 15%), and salvaging a socketed item returns its gem.

| Gem | id stem | Stat | Chipped (20) | Flawed (30) | Plain (40) | Flawless (50) | Radiant (60) |
|---|---|---|---|---|---|---|---|
| Bloodstone | `it_gem_bloodstone` | +STR | 4 | 7 | 10 | 14 | 20 |
| Tigereye | `it_gem_tigereye` | +DEX | 4 | 7 | 10 | 14 | 20 |
| Lapis | `it_gem_lapis` | +INT | 4 | 7 | 10 | 14 | 20 |
| Jade | `it_gem_jade` | +CON | 4 | 7 | 10 | 14 | 20 |
| Onyx | `it_gem_onyx` | +critical chance | 1% | 1.5% | 2% | 2.5% | 3% |
| Moonstone | `it_gem_moonstone` | +haste (attack + cast speed) | 1% | 1.5% | 2% | 2.5% | 3% |
| Garnet | `it_gem_garnet` | +resistance to all elements | 6 | 10 | 15 | 21 | 30 |
| Pearl | `it_gem_pearl` | +healing done | 1.5% | 2% | 3% | 4% | 5% |

Grade number in the id: `it_gem_onyx_3` = Plain Onyx. **Combining**: 3 of a grade + gold → 1 of the next
at a Jeweller: 50 / 200 / 800 / 3,000 gold. Radiant gems need level 60 to socket.

---

## 10. Binding

Farhold is single-player and has no binding. **(new)** Wildmarch's rules, chosen so that the auction
house has something to sell, raids stay the source of raid gear, and alts are fun.

| Binding | Card line | Rule | Applies to |
|---|---|---|---|
| **Bind on pickup (BoP)** | "Bound to you" | belongs to the looter; cannot be traded, mailed or sold at the auction house | dungeon and raid boss drops, secret-boss drops, set pieces from instances, legendaries from listed sources, quest rewards, world-boss drops, token vendor items |
| **Bind on equip (BoE)** | "Binds when worn" | tradeable until worn once, then BoP | open-world drops of every rarity, world-pool uniques and legendaries, crafted items and crafted sets, chest loot, gambler crates |
| **Account-bound** | "Bound to your account" | moves freely between your own characters by mail or the shared stash; cannot go to another account | the heirloom set (page 09), mounts once learnt, wardrobe appearances, dyes, titles and other cosmetic rewards |
| **Soulbound quest item** | "Quest item" | cannot be dropped while the quest is active; deleted when the quest ends | quest objects (page 14) |
| **No binding** | — | trade freely | consumables, gems, materials (Scrap, Essence, Dust), glyph scrolls, junk |

Clarifications:
- **Gems** of every grade are unbound. **Mythic+ keystones** are page 12's.
- **Trade window**: a BoP item from a group kill may be given to **anyone who was eligible for that
  same kill** (§11) within **2 hours**, if its item level is not higher than the looter's own
  equipped item in that slot. The card shows the countdown ("Tradeable for 1 h 42 m").
- **Refund**: an item bought with gold or tokens can be sold back for the full price within 2 hours
  if not worn and not enchanted.
- **Salvaging** anything is always allowed.

---

## 11. Group loot

Canon §2: together or alone. **Proposal: personal loot everywhere.** **(new)**

### 11.1 Personal loot

- When a boss or enemy dies, the server rolls loot **separately for each eligible player**, using that
  player's class, armour type and chosen **loot focus** (a dropdown on the loot panel: Tank / Healer /
  Damage / Support, defaulting to the character's current role). An item you receive is always one your
  class can equip and weighted to your focus's stats.
- Nobody sees another player's roll except as a line in the loot log ("Ashe received **Rimecrown Mantle**").
- **Eligible** = in the group, alive or dead, inside the instance / within 60 m in the open world, and
  either dealt damage, healed or took damage during the fight. Followers never take a roll.
- **Open-world tag**: an enemy is tagged by the first group or player to hit it; everyone in that group
  who qualifies is eligible. **World bosses and dynamic-event bosses are untagged**: everyone who did
  1% of the boss's health in damage, or healed / shielded 1% of it, or tanked 5 s, is eligible (page 13).
- **Gold** from a kill is split evenly among eligible group members (rounded up for each).
- **Bad-luck protection** (raids and world bosses): every boss that gives you nothing adds +5% to your
  item chance on the next boss of that raid, reset when you win an item; for world bosses +10% per miss.

### 11.2 Why not need/greed

A need/greed/pass roll *(reference: older MMOs)* makes a five-player group argue over a drop the whole
group could see, needs a looter's judgement about who "needs" what, and is awkward with followers
filling slots. Personal loot plus the 2-hour trade window gives the same "give it to the one who needs it"
moment without the arguments. **A group leader option "Group loot: Need / Greed" for Normal dungeons
only** is left as a question for the owner (`QUESTIONS.md`).

### 11.3 Lockouts

| Content | Loot lockout |
|---|---|
| Normal dungeon | none — every run rolls |
| Heroic dungeon | each boss's personal roll once per day per character; later kills give gold, tokens and materials only |
| Mythic+ | end-of-run chest every run; the weekly vault (§12.9) once per week |
| Raid (each difficulty) | each boss once per week per character (reset: Wednesday 07:00 server time, canon 00 §4) |
| Secret boss | its **exclusive** drop roll once per week per character; the rest of its loot as a normal boss |
| World boss | loot once per week per character per boss; a kill after that gives 50% gold and tokens only |
| Rare elites in the open world | each rare's guaranteed item once per day per character |

**Bonus roll:** spend 40 Delver's Marks (dungeons) or 60 Oathstones (raids) right after a boss dies for a
second personal roll on that boss. Two bonus rolls a week per character.

---

## 12. Drop tables by source

`(reuse: balance.json loot.dropRate, ranks, chests; emberveil loot.js zoneDrop / bossLoot)`

Farhold's numbers: an ordinary kill drops an item 31.5% of the time; champions ×1.6 with +1 guaranteed
item and rarity boost 1.5; rares ×2 with +2 items and rarity boost 2.2. Wildmarch keeps them for the open
world and writes the instance tables fresh. "Floor" = the lowest rarity the roll can give. Percentages
are **per player** under personal loot.

### 12.1 Open world

| Source | Item chance | Items | Floor | Rarity boost | Unique | Legendary (lvl 20+) | Gold | Materials | Other |
|---|---|---|---|---|---|---|---|---|---|
| Trash (normal rank) | 31.5% | 1 | Common | ×1.0 | in the rarity roll (0.45%) | 0.05% | 60% chance of `2 × 1.061^(L−1)` ±30% | family table (Farhold `salvageByFamily`), 25% | junk item 15% (§12.10) |
| Champion (elite) | 100% | 1 + 50% a second | Uncommon | ×1.5 | ×1.5 | ×1.5 | ×2.6 | +1 Bound Essence 40% | gem 1% |
| Rare (named elite) | 100% | 2 + 50% a third | Rare | ×2.2 | 3% flat | 0.5% flat | ×5 | +1 Resonant Dust 50% | gem 4%; once a day each (§11.3) |
| Warband leader / war-camp warlord | 100% | 2 | Rare | ×2.2 | warband unique 8% (reuse: R27 M10 `warband` rows) | 1% | ×6 | Dust 1–2 | camp mount 1% (§20.1) |
| Dynamic event boss (page 14) | 100% | 1 | Rare | ×2.0 | 2% | 0.5% | ×8 | Essence 2–3 | event currency |

### 12.2 Dungeons (5 players), per player

| Source | Normal | Heroic (60) | Mythic+ (60) |
|---|---|---|---|
| Trash | 10% item, floor Common | 10%, floor Uncommon | none (the timer is the point) |
| Sub-boss (optional mini-boss) | 1 item, floor Rare; dungeon set piece 10% | 1 item, floor Epic; set 12% | — (loot moves to the end chest) |
| Boss | 1 item, floor Rare; set 20%; the dungeon's uniques 6%; legendary 0.5% | 1 item, floor Epic; set 25%; uniques 8%; legendary 1.5% | — |
| Final boss | 2 items, floor Rare; set 35%; uniques 10%; legendary 1% | 2 items, floor Epic; set 35%; uniques 12%; legendary 2.5% | — |
| **End chest** | — | — | 2 items (+1 if timed with ≥20% to spare), floor Epic, ilvl 68 + key level (max 78); set 30%; uniques 12%; legendary 2% + 0.5% per key level (max 7%) |
| Tokens | final boss 5 Delver's Marks | 5 a boss, 10 the final | 15 + 2 per key level |
| Gold | 20 × band multiplier a boss | 150 a boss | 300 + 30 per key level |
| Materials | Scrap 4–8, Essence 1–2 | + Dust 1 | + Dust 1–3, Veilglass 1 at key 8+ |

### 12.3 Secret bosses (dungeons and raids)

Every dungeon and raid has a secret boss (canon §9; page 12 / 13 own how to find them). **(new)**

| | Dungeon secret boss | Raid secret boss |
|---|---|---|
| Items | 2 per player, floor Epic | 2 per player, floor Epic |
| Item level | final boss + 4 | raid final boss + 4 |
| **Exclusive drop** | the boss's own list (page 09 §6): a legendary, unique, mount or cosmetic — 20% per player per week | 25% per player per week; Mythic 35% |
| Guaranteed | 1 appearance (transmog) unique to that boss; a Feat of Strength (achievement) | the same + a title |
| Tokens | ×2 the final boss | ×2 the final boss |

### 12.4 Raids (10/20 players), per player per boss

| | Normal | Mythic |
|---|---|---|
| Item chance | 25% (+5% a boss of bad luck) | 30% (+5%) |
| Final boss | 40% | 50% |
| Floor | Epic | Epic |
| Raid set piece (if an item drops) | 40% | 45% |
| Class set piece (page 06 files) | the class file says which raid; shares the 40% | same |
| Legendary (if an item drops) | 3% (final boss 6%) | 4% (final 8%) |
| Oathstones | 20 a boss | 35 a boss |
| Gold | 250 a boss | 400 a boss |
| Materials | Dust 2–4, Veilglass 0–1 (`r04`, `r05`) | Dust 3–6, Veilglass 1–2 |
| Mount | final boss 1% (`r04`, `r05`) | 2% |

### 12.5 World bosses (one per region from 3 upward; page 13)

| | Per player, once a week per boss |
|---|---|
| Items | 1 guaranteed, floor Epic, ilvl region band top + 2; **Ascendant** (the two raised to level 60 each week): 72 |
| World-boss set piece | Ascendant only: 30% (`set_trophies_of_the_wild_hunt`, page 09) |
| Legendary | 3% |
| Mount | 1% (that boss's own) |
| Gold / tokens | 500 gold, 30 Oathstones |

### 12.6 Quests

| Quest kind (page 14) | Reward |
|---|---|
| Side quest | pick 1 of 2–3 items, Uncommon, ilvl quest level + 1; gold |
| Story quest | pick 1 of 3–4 items (one per role), Rare; gold |
| Dungeon quest | pick 1 of 3–4, Rare, ilvl + 2 |
| Calling quest (6 / 20 / 40) | pick 1 of 3 **Epic** class items, ilvl + 2, plus the mechanic upgrade |
| Unlock quest (mount, dodge, fast travel) | the thing it unlocks (page 07) |
| Daily / weekly | tokens, reputation tokens, gold; weekly adds 1 Epic at band top |
| Turn-in path | always through one payer (reuse: `js/questrewards.js`, five reward kinds incl. pick-one-of-three) |

### 12.7 Gambler crates

`(reuse: js/town.js CRATE_TIERS, gamble())` — one sealed item at the buyer's level, never below the floor,
with a `lift` chance of one tier better. Prices scaled by level in Wildmarch **(changed)**:
`price × (1 + 0.1 × (level − 1))`.

| Crate | Floor | Price at level 1 | Price at level 60 | Lift chance |
|---|---|---|---|---|
| Plain Crate | Common | 60 | 414 | 10% |
| Marked Crate | Uncommon | 240 | 1,656 | 14% |
| Sealed Crate | Rare | 900 | 6,210 | 20% |
| Warded Crate | Epic | 3,200 | 22,080 | 28% (to Unique) |

### 12.8 Chests

`(reuse: balance.json chests.kinds, js/chests.js)` Chests are placed from the world seed, remembered once
opened (per character), and stand under a beacon coloured by their guaranteed floor. In an online world
each chest is **per character** (everyone can open their own copy). **(changed)**

| Chest | Weight | Items | Floor | Gold (×band) | Materials | Notes |
|---|---|---|---|---|---|---|
| Wooden | 52 | 0–2 | Common | 14–40 | 1 roll | — |
| Iron-Bound | 30 | 1–2 | Uncommon | 40–110 | 2 rolls | — |
| Gilded | 14 | 2–3 | Rare | 120–300 | 3 rolls | gem 8% |
| Warded | 4 | 2–4 | Epic | 260–700 | 5 rolls | 22% mimic, guarded, zones ≥ level 10; gem 15% |
| Meteorite | event | 1–3 | Rare | 180–480 | 4 rolls | falls every ~5 min somewhere 220–900 m away (reuse `meteors`) |
| Dungeon cache (new) | 1 per dungeon | 1 | Rare | 100 | 2 rolls | hidden room; key from a sub-boss |
| Raid vault (new) | 1 per raid wing | gold + 1 Epic | Epic | 400 | Dust 2 | after the wing's last boss |
| Secret cache (new) | 1 per secret-boss route | 1 | Epic | 600 | Dust 3 | the clue trail's reward |

"×band" = the gold multiplier of the region band, 1 in Hearthvale up to 12 in the Emberthrone (§19).

### 12.9 The weekly vault

`scr_vault`, in every hub town. **(new)** Once a week you pick **one** item from up to nine offered, one
per completed threshold:

| Row | 1 slot at | 2 slots at | 3 slots at | Item level |
|---|---|---|---|---|
| Mythic+ | 1 run | 4 runs | 8 runs | best key's chest level + 2 (max 80) |
| Raid | 2 bosses | 4 bosses | 6 bosses | the difficulty's ilvl |
| World | 3 world bosses | 6 rare elites | 10 weekly quests | 70 |

### 12.10 Junk and flavour items

Trash drops a **junk item** 15% of the time: a flavour object from Item Vault (reuse: `items/js/items.js roll()`,
race-weighted, e.g. "a dwarven drinking horn") that is only worth gold (`value` from the catalogue × band).
Rare elites drop a **trophy** (Item Vault `trophy` tag) that a hub collector buys for 3× value and a
reputation token (§17).

---

## 13. Salvage and the bench

`(reuse: prototypes/farhold/js/craft.js, data/crafting.json)`

Farhold's rule is kept word for word: **every crafting material comes out of an item you recycled, or off
something hard to kill.** There is no mining or woodcutting in Wildmarch either (canon drops industry),
so the bench is part of the loot loop. Materials sit in their own **materials bag with no cap**
(reuse: `Materials` class), not in the inventory.

### 13.1 Materials

| id | Name | Tier | Colour | Comes from | Origin |
|---|---|---|---|---|---|
| `mat_scrap` | Scrap Iron | 1 | `#9a9285` | salvaging anything; trash bodies | reuse (`scrap`) |
| `mat_essence` | Bound Essence | 2 | `#6ab0e8` | salvaging Uncommon+; champions | reuse (`essence`) |
| `mat_dust` | Resonant Dust | 3 | `#c88ae8` | salvaging Epic+, uniques, sets; rares, bosses | reuse (`dust`) |
| `mat_veilglass` | Veilglass | 4 | `#e0f0ff` | salvaging ilvl 60+ Epic+ gear; Mythic+ key 8+; `r04`/`r05` bosses | **new** |

### 13.2 Salvage yields

Recycle at any bench or with the inventory's Salvage button (confirm for Rare+). Yield =
rarity row, plus armour-weight / weapon-category row (reuse: `salvageByTier`, `salvageByCategory`),
times the **item-level band multiplier** `1 + 0.1 × band` (band = ⌊ilvl / 5⌋) **(new)** — without it a
level-55 player would need eleven times the salvage of a level-5 one for the same bench action.

| Rarity | Scrap | Essence | Dust | Veilglass |
|---|---|---|---|---|
| Common | 2–4 | — | — | — |
| Uncommon | 3–5 | 1–2 | — | — |
| Rare | 4–7 | 2–4 | — | — |
| Epic | 6–10 | 3–6 | 1–3 | 30% for 1 at ilvl 60+ |
| Unique | 4–6 | 4–6 | 2–3 | 1 at ilvl 60+ |
| Set | 4–6 | 4–6 | 2–4 | 1 at ilvl 60+ |
| Legendary | 6–10 | 6–10 | 4–6 | 1–2 at ilvl 60+ |

### 13.3 Bench actions

Every button is drawn from a `quote()`: a greyed-out button always says why ("needs 4 more Bound Essence",
"all 4 property slots are full — reweave one instead") (reuse). Costs are multiplied by the item's
**band cost** (below). Actions on the **Create** tab make something; the **Upgrade** tab reworks what you have.

| # | Action id | Tab | What it does | Cost (×band) | Gates | Origin |
|---|---|---|---|---|---|---|
| 1 | `forge_weapon` | Create | a Common weapon of your level; pick the type | 10 Scrap | — | reuse |
| 2 | `forge_armour` | Create | a Common armour piece, your armour type, pick the slot | 8 Scrap | — | reuse |
| 3 | `forge_quiver` | Create | a quiver; pick the kind (§6.3) | 8 Scrap, 2 Essence | — | reuse |
| 4 | `forge_trinket` | Create | an Uncommon ring or necklace | 6 Scrap, 2 Essence | — | reuse |
| 5 | `forge_fine` | Create | a Rare of your level, any slot | 14 Scrap, 6 Essence | level 8 | reuse |
| 6 | `forge_masterwork` | Create | an **Epic** of your level, any slot (Farhold: "legendary") | 20 Scrap, 12 Essence, 6 Dust | level 18 | reuse, renamed rarity |
| 7 | `forge_pattern` | Create | a crafted-set piece from a **pattern** (page 09 §2.6) | per pattern | pattern learnt | **new** |
| 8 | `refine` | Upgrade | +1 item level, up to +5 over the item's dropped level (replaces Farhold's Temper, since quality is gone) | 8 Scrap, 1 Essence; ×1.5 each time | not past the source ceiling | changed |
| 9 | `reinforce` | Upgrade | +25% base armour, up to 3 times | 12 Scrap | armour | reuse |
| 10 | `hone` | Upgrade | +20% base dice, up to 3 times | 10 Scrap, 2 Essence | weapon, level 12 | reuse |
| 11 | `promote` | Upgrade | one rarity up + a new affix: →Uncommon / →Rare / →Epic | 6 Scrap 3 Essence / 10 Scrap 6 Essence / 10 Essence 4 Dust | never into Unique, Set or Legendary | reuse |
| 12 | `inscribe` | Upgrade | add one affix if a slot is free | 3 Essence | Uncommon+ | reuse |
| 13 | `reweave` | Upgrade | swap one affix for a different one (you pick which goes); each reweave of the same item ×1.4 | 2 Essence, 1 Dust | Uncommon+; on named items only the random-range line | reuse |
| 14 | `sharpen` | Upgrade | re-roll every affix's number, keep the affixes (rolled at the item's own tier — Farhold R18 fixed this) | 3 Essence | Uncommon+ | reuse |
| 15 | `recast` | Upgrade | re-roll every affix; can come out worse | 6 Essence, 2 Dust | Rare / Epic only | reuse |
| 16–22 | `brand_fire`, `brand_ice`, `brand_void` (reuse) + `brand_lightning`, `brand_poison`, `brand_holy`, `brand_arcane` (new) | Upgrade | the weapon's hits deal that element and apply its status (Burning 105% of the hit over 5 s; Chilled −45% move 4 s; Shocked +30% damage taken 3 s; Poisoned 60% over 6 s; Cursed −15% damage dealt 5 s; Hallowed +20% vs undead/fiends; Unmade −10 resist 5 s) | 6 Essence, 2 Dust (void 3 Dust) | Rare+ weapon | reuse + new |
| 23 | `bore_socket` | Upgrade | add a socket (§9) | 4 Dust (2nd on a 2H: 8 Dust, 1 Veilglass) | Epic+ ilvl 40+ | **new** |
| 24 | `ascend` | Upgrade | +3 item level, up to 3 steps, never past the source's ceiling (Heroic 72, M+ 80, raids per difficulty +6) | Heroic/M+ items: 60 / 90 / 120 Delver's Marks · raid items: 80 / 120 / 160 Oathstones · + Veilglass 1 / 2 / 3 | endgame BoP gear | **new** |
| 25 | `reforge_set` | Upgrade | change a set piece to another slot of the same set | 3 Dust, 2 Veilglass | set piece you own | **new** |

**Band cost** (Farhold `bandCost` stretched from 6 bands to 16; a band is 5 item levels) **(changed)**:

| ilvl | 1–5 | 6–10 | 11–15 | 16–20 | 21–25 | 26–30 | 31–35 | 36–40 | 41–45 | 46–50 | 51–55 | 56–60 | 61–65 | 66–70 | 71–75 | 76–82 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ×cost | 1 | 1.3 | 1.6 | 2 | 2.4 | 2.9 | 3.4 | 4 | 4.6 | 5.3 | 6 | 7 | 8 | 9 | 10 | 11 |

Every action also costs gold: `20 × band cost × (1 + rarity index)` (Common 0 … Legendary 6) — a sink.

---

## 14. Enchanting (glyphs)

Emberveil has an Enchanter who adds, re-rolls and promotes affixes for gold (reuse: `loot.js
enchantAdd/Reroll/Promote`). In Wildmarch those jobs belong to the bench (§13), and the Enchanter NPC
(`npc_enchanter`, in every hub town) sells **glyphs** instead. **(new)**

- A **glyph** is a permanent slot enchantment that does **not** use an affix slot. One per item.
- Enchantable slots: main hand, off hand, chest, back, legs, feet, both rings.
- Applying one: buy the glyph scroll (unbound, tradeable), use it on the item. A new glyph replaces the old.
- Ranks: I (level 20), II (level 40), III (level 60). Enchanting is BoE-safe: the item stays tradeable
  until worn.

| Glyph | Slot | Rank I | Rank II | Rank III | Price I / II / III (gold + materials) |
|---|---|---|---|---|---|
| Glyph of Keenness | main hand | +4% critical chance | +6% | +8% | 400 + 4 Ess / 2,000 + 3 Dust / 8,000 + 1 Veilglass |
| Glyph of the Tempest | main hand | 10% chance on hit: lightning 60% weapon damage | 80% | 100% | same |
| Glyph of Embers | main hand | 15% chance on hit: Burning (40% of the hit over 4 s) | 60% | 80% | same |
| Glyph of Mercy | main hand | +3% healing done | +5% | +7% | same |
| Glyph of the Sage | main hand | +3% spell power | +5% | +7% | same |
| Glyph of the Wall | off hand (shield) | +5% block chance | +8% | +10% | 300 + 3 Ess / 1,500 + 2 Dust / 6,000 + 1 Veilglass |
| Glyph of the Lamp | off hand (focus, ward) | +8% barrier | +12% | +16% | same |
| Glyph of the Quiver | off hand (quiver) | +4% arrow damage | +6% | +8% | same |
| Glyph of Vigour | chest | +3% maximum health | +5% | +7% | 300 + 3 Ess / 1,500 + 2 Dust / 6,000 + 1 Veilglass |
| Glyph of Stillwater | chest | +4% maximum resource | +6% | +8% | same |
| Glyph of Warding | chest | +20 resistance to all | +40 | +70 | same |
| Glyph of the Swift | back | +3% dodge | +4% | +5% | 250 + 2 Ess / 1,200 + 2 Dust / 5,000 + 1 Veilglass |
| Glyph of the Shadowed Road | back | 5% less threat caused | 8% | 10% | same |
| Glyph of Grit | legs | +8 CON | +16 | +28 | 250 + 2 Ess / 1,200 + 2 Dust / 5,000 + 1 Veilglass |
| Glyph of Might / Grace / Mind | legs | +8 STR / DEX / INT | +16 | +28 | same |
| Glyph of the Road | feet | +3% move speed | +4% | +5% | 250 + 2 Ess / 1,200 + 2 Dust / 5,000 + 1 Veilglass |
| Glyph of the Tumbler | feet | dodge roll cooldown −0.2 s | −0.3 s | −0.5 s | same |
| Glyph of Fortune | ring | +5% gold found | +8% | +10% | 200 + 2 Ess / 1,000 + 1 Dust / 4,000 + 1 Veilglass |
| Glyph of the Blade / of Healing | ring | +2% damage / +2% healing | +3% | +4% | same |
| Glyph of Haste | ring | +2% haste | +3% | +4% | same |

---

## 15. Durability and repair

Not in Farhold. **(new, proposed — flagged for the owner in `QUESTIONS.md` because it is the one
system on this page that only exists to cost you gold.)**

| Rule | Value |
|---|---|
| Durability | 100 points on every equipped item except light and mount (weapons 120) |
| Loss on death | −10% of maximum on every equipped item |
| Loss in play | none from swings or hits (a death is the only cost) |
| Broken (0) | the item gives **no stats and no power**; the doll socket turns red; the item card says "Broken — repair at any smith" |
| Warning | an anvil icon on the HUD at 25% (yellow) and 10% (red) on any piece |
| Repair at a smith | full repair of one item from 0 costs **40% of its sell price**; partial pro rata. "Repair all" button |
| Repair Kit (consumable) | restores 50% durability on everything worn; 1 per 10 minutes; sold at 5% of the band's average item price |
| Guild repair | page 15 (guild bank pays up to a daily limit) |
| Wipes | a raid or dungeon wipe counts as one death per player |

---

## 16. Consumables

Emberveil's seven potions (`items.json potions`: Healing 40, Greater Healing 80, Mana 40, Revival Flask,
Emberheart Draught, Group Tonic, Antidote) were flat numbers for a turn-based game. Wildmarch restates them
as **shares of the maximum**, so they stay useful at every level, and adds elixirs, food and scrolls. **(changed)**

### 16.1 The potion belt

- Potions are used from **belt slots**. **Slots come from level only** (page 07): 2 at level 3 (`7` `8`),
  4 at level 16 (`9` `0`). Keys: page 02 (`belt1` … `belt4`, default 7 8 9 0).
- **Charges:** each belt slot holds up to **5 charges** of one consumable (5 uses, refilled from your bags out
  of combat). The **waist item adds charges, not slots** — Common/Uncommon belts +1 charge per slot,
  Rare/Epic +2, Unique/Set/Legendary +2 (max 7 per slot).
  > **Resolved (00 §10):** slots come from level (2 at 3, 4 at 16, page 07); the waist item adds charges, not
  > slots.
- **Potion cooldown**: every healing or resource potion shares one 60 s cooldown. Cleansing potions have a
  separate shared 30 s cooldown. Revival items have their own (below).
- `of the Apothecary` (waist affix) makes potions restore up to 60% more.

### 16.2 Potions

| id | Name | Level | Effect | Cooldown group | Price (gold) | Origin |
|---|---|---|---|---|---|---|
| `it_healing_draught_1` | Minor Healing Draught | 1 | heals 25% of maximum health instantly | potion 60 s | 15 | reuse (Healing Potion), restated |
| `it_healing_draught_2` | Lesser Healing Draught | 12 | 30% instantly | potion | 60 | new |
| `it_healing_draught_3` | Healing Draught | 24 | 35% instantly | potion | 150 | new |
| `it_healing_draught_4` | Greater Healing Draught | 36 | 40% instantly + 10% over 6 s | potion | 320 | reuse (Greater Healing), restated |
| `it_healing_draught_5` | Superior Healing Draught | 48 | 45% + 10% over 6 s | potion | 600 | new |
| `it_healing_draught_6` | Supreme Healing Draught | 58 | 50% + 15% over 6 s | potion | 1,000 | new |
| `it_mana_draught_1…6` | Minor … Supreme Mana Draught | 1/12/24/36/48/58 | restores 25/30/35/40/45/50% of maximum mana | potion | as healing | reuse (Mana Potion) |
| `it_fury_tonic` | Tonic of Fury | 10 | +40 Fury, and Fury does not decay for 10 s | potion | 80 × band | new |
| `it_focus_tincture` | Focus Tincture | 10 | restores 60% of maximum Focus | potion | 80 × band | new |
| `it_group_tonic` | Group Tonic | 20 | heals every group member within 12 m for 15% of their maximum health | potion | 150 × band | reuse, restated |
| `it_antidote` | Antidote | 1 | removes Poison and Bleed | cleanse 30 s | 25 | reuse |
| `it_burn_salve` | Burn Salve | 8 | removes Burning; 3 s immune to Burning | cleanse | 30 × band | new |
| `it_warming_draught` | Warming Draught | 8 | removes Chilled, Frostbite; 3 s immune | cleanse | 30 × band | new |
| `it_holy_water` | Vial of Holy Water | 16 | removes one Curse; +10% shadow resistance 30 s | cleanse | 50 × band | new |
| `it_revival_flask` | Revival Flask | 10 | revives an ally at 25% health, immune to damage for 2 s; 10 s channel; **out of combat anywhere, in combat only in the open world and Normal dungeons** | revive 5 min | 80 × band | reuse, restated |
| `it_emberheart_draught` | Emberheart Draught | 30 | revives an ally at 70% health, immune 3 s; 3 s channel; **not usable in Mythic raids or Mythic+ key 10+** | revive 10 min | 420 × band | reuse, restated |
| `it_repair_kit` | Repair Kit | 5 | +50% durability on all worn items | 10 min | 5% of band item price | new |

### 16.3 Elixirs and flasks

One **battle elixir** and one **guardian elixir** at a time; a **flask** counts as both. Last through death.

| id | Name | Kind | Level | Effect | Duration | Price |
|---|---|---|---|---|---|---|
| `it_elixir_might` | Elixir of Might | battle | 10 | +6% STR | 60 min | 100 × band |
| `it_elixir_grace` | Elixir of Grace | battle | 10 | +6% DEX | 60 min | 100 × band |
| `it_elixir_insight` | Elixir of Insight | battle | 10 | +6% INT | 60 min | 100 × band |
| `it_elixir_keen_eye` | Elixir of the Keen Eye | battle | 20 | +3% critical chance | 60 min | 150 × band |
| `it_elixir_quickening` | Elixir of Quickening | battle | 30 | +3% haste | 60 min | 180 × band |
| `it_elixir_ironhide` | Elixir of Ironhide | guardian | 10 | +10% armour | 60 min | 100 × band |
| `it_elixir_fortitude` | Elixir of Fortitude | guardian | 10 | +6% maximum health | 60 min | 100 × band |
| `it_elixir_warding` | Elixir of Warding | guardian | 20 | +8% resistance to all elements | 60 min | 150 × band |
| `it_elixir_nightsight` | Elixir of Nightsight | guardian | 15 | light radius +40%, see stealthed enemies within 8 m at night | 60 min | 80 × band |
| `it_elixir_waterbreath` | Elixir of Deep Breath | guardian | 20 | breathe underwater, swim +30% | 30 min | 60 × band |
| `it_flask_champion` | Flask of the Champion | flask | 60 | +8% main attribute and +5% maximum health | 2 h | 2,500 + 1 Dust |
| `it_flask_warden` | Flask of the Warden | flask | 60 | +12% armour, +10% resistance, +5% health | 2 h | 2,500 + 1 Dust |

### 16.4 Food

Eaten out of combat: a 10 s channel (sitting animation), then **Well Fed** for 30 minutes; one food buff at a
time; survives death. Sold by innkeepers and cooks; the better ones drop from rares and quests.

| id | Name | Level | Well Fed effect | Price |
|---|---|---|---|---|
| `it_food_hearth_bread` | Hearth Bread | 1 | +2% maximum health; +1% health a second out of combat | 5 |
| `it_food_orchard_pie` | Orchard Pie (Hearthvale) | 5 | +3% maximum health | 20 |
| `it_food_eel_stew` | Fenland Eel Stew (Mossfen) | 10 | +3% maximum resource, +5% resource regen | 40 |
| `it_food_miners_pasty` | Miner's Pasty (Greyridge) | 15 | +4% armour | 60 |
| `it_food_spiced_dates` | Spiced Dates (Sunscar) | 20 | +2% haste | 90 |
| `it_food_moonwell_greens` | Moonwell Greens (Whisperwood) | 25 | +3% healing done | 120 |
| `it_food_steppe_jerky` | Steppe Jerky (Cinder Steppe) | 30 | +3% damage | 160 |
| `it_food_rime_broth` | Rime Broth (Frostmantle) | 35 | +6% resistance to ice; immune to cold weather slow | 200 |
| `it_food_salt_fish` | Salted Kingfish (Drowned Coast) | 40 | +3% critical chance | 260 |
| `it_food_rift_honey` | Rift Honey (Riftmarch) | 48 | +3% spell power and +3% healing | 340 |
| `it_food_emberroast` | Emberroast (Emberthrone) | 55 | +4% damage, +3% health | 450 |
| `it_food_feast` | Wayfarer's Feast | 30 | placed on the ground for 3 min; up to 20 players each take Well Fed: +4% main attribute, +4% health | 1,500 |

### 16.5 Scrolls

| id | Name | Level | Effect | Cooldown | Price |
|---|---|---|---|---|---|
| `it_scroll_recall` | Scroll of Recall | 1 | 10 s cast: return to your bound inn (page 07 owns the free hearth; this is the spare) | 30 min | 25 × band |
| `it_scroll_swiftness` | Scroll of Swiftness | 10 | +30% run speed out of combat for 10 min (does not stack with a mount) | — | 40 × band |
| `it_scroll_warding` | Scroll of Warding | 15 | a barrier worth 20% of maximum health for 10 s | 2 min | 60 × band |
| `it_scroll_tongues` | Scroll of Tongues | 20 | read one ancient inscription (secret-boss clue trails, page 12) | — | 150 (quest vendors) |
| `it_scroll_unbinding` | Scroll of Unbinding | 20 | forget one talent choice for free (page 07; the Unbinder's price otherwise) | — | drop only (rares 1%, weekly quests) |
| `it_scroll_reveal` | Scroll of Revealing | 30 | shows hidden doors and traps within 25 m for 60 s | 5 min | 100 × band |
| `it_scroll_banishing` | Scroll of Banishing | 40 | a non-boss undead or fiend within 10 m flees for 8 s | 3 min | 120 × band |

---

## 17. Currencies

Farhold has **gold** only (plus materials). **(new except gold)** All currencies show on the Currency tab
(page 03) with the weekly cap and progress.

| id | Name | How you earn it | Weekly earn cap | Held cap | Spent on |
|---|---|---|---|---|---|
| `cur_gold` | Gold (shown as gold, silver and copper: 100 copper = 1 silver, 100 silver = 1 gold, canon 00 §10) | kills, quests, selling, chests | — | 999,999,999 | everything (§18) |
| `cur_delve` | Delver's Marks | dungeons (§12.2) | 1,000 | 3,000 | Delve Quartermaster (Heroic-level gear, ilvl 66), `ascend`, bonus rolls |
| `cur_oathstone` | Oathstones | raid bosses, world bosses | 500 | 2,000 | Raid Quartermaster (ilvl 70 off-pieces), `ascend`, bonus rolls |
| `cur_glory` | Glory | any PvP (page 15) | 1,500 | 5,000 | Glory set (ilvl 66, page 09) |
| `cur_laurels` | Laurels | rated PvP wins | 300 | 1,000 | Laurel upgrades (ilvl 72) and titles |
| `cur_veil_sigil` | Veil Sigils | Veilspire Isle world quests, rares | 800 | 2,500 | Spire Landing vendor (ilvl 66 gear, gems, mount) |
| `cur_festival` | Festival Tokens | seasonal events (page 14) | — | 999 | cosmetics, event mounts |
| `cur_rep_*` | reputation tokens | quests, dailies, trophies, rares in that faction's land | — | 999 each | turn in for reputation (+250 each) or spend at that faction's quartermaster |

**Reputation tokens** (one per faction that holds a region, canon §7; page 01 owns factions, page 07 owns
reputation ranks):

| id | Token | Faction | Quartermaster in | Best reward (at Exalted) |
|---|---|---|---|---|
| `cur_rep_vale` | Warden's Seal | the Vale Wardens | Brightwater | the Wayfarer heirloom box (page 09 `set_wayfarers_heirlooms`) |
| `cur_rep_fen` | Reed Token | the Fenfolk | Reedhollow | Reedstrider mount |
| `cur_rep_deepforge` | Forge Chit | the Deepforge Clans | Anvilgate | patterns for `set_journeymans_harness` |
| `cur_rep_crown` | Crown Writ | the Crown Assembly | Highcourt | Highcourt tabard + Crown Courser mount |
| `cur_rep_sandsworn` | Sandsworn Coin | the Sandsworn | Oasis of Tamar | Dune Sabrecat mount |
| `cur_rep_moonwell` | Moonleaf | the Moonwell Circle | Silverbough | Moonwell Stag mount |
| `cur_rep_frost` | Frost Tally | the Frost Wardens | Rimehold | Rimehold Bear mount |
| `cur_rep_riftwatch` | Rift Shard | the Riftwatch | Waystone Camp | patterns for `set_veilglass_artifice` |

The contested regions (Cinder Steppe, Drowned Coast, Emberthrone) use whichever friendly faction page 01
puts in their hub; their tokens will be added there.

---

## 18. Vendors and prices

### 18.1 The price formula

Farhold: `price = basePrice 15 × quality × rarity (1/2/4/10) × (unique ? 2 : 1)`, and an item carrying its
own `basePrice` (mounts, lights) is priced from that (reuse: `js/rpg.js price()`). Wildmarch:
**(changed)**

`price = base × rarity × 1.061^(ilvl − 1)`

- `base` = 15 for gear, or the item's own `basePrice` (mounts, lights, consumables).
- `rarity` = Common 1 · Uncommon 2 · Rare 4 · Epic 10 · Unique 20 · Set 25 · Legendary 40.
- `1.061^(ilvl−1)` is the same curve as gold income (§19), so an item costs the same **minutes of play**
  at every level: ×1 at ilvl 1, ×3.2 at 20, ×10.3 at 40, ×33 at 60, ×60 at 70.
- **Sell price** = 25% of price (Farhold `sellFactor` 0.35–0.4 lowered for an online economy). BoP
  Epic+ sells for 25% as well, so salvage vs sell is a real choice.
- **Buyback**: the last 12 things you sold to that vendor, at the sell price (reuse: `town.js`, 12 slots).

| Example | Common | Uncommon | Rare | Epic | Unique | Legendary |
|---|---|---|---|---|---|---|
| ilvl 10 (×1.70) — buy / sell | 26 / 6 | 51 / 13 | 102 / 25 | 255 / 64 | 510 / 128 | 1,020 / 255 |
| ilvl 30 (×5.56) | 83 / 21 | 167 / 42 | 334 / 83 | 834 / 208 | 1,668 / 417 | 3,336 / 834 |
| ilvl 60 (×32.9) | 494 / 123 | 987 / 247 | 1,974 / 494 | 4,935 / 1,234 | 9,870 / 2,468 | 19,740 / 4,935 |

### 18.2 Vendor roster

Town roles are Farhold's (`js/town.js ROLES`: merchant, elder, villager, smith, innkeeper, guard, gambler,
broker, unbinder) plus Wildmarch's new ones. Hubs have all of them; smaller towns have the reuse set by size.

| NPC role | Sells / does | Where | Origin |
|---|---|---|---|
| `npc_merchant` | general goods: Common/Uncommon gear of the town's band (Farhold `stockFor`, three categories + buyback), potions 1–2, food, Repair Kits | every settlement | reuse |
| `npc_smith` | the bench (§13), repairs, Uncommon/Rare weapons and armour | towns size 3+ | reuse |
| `npc_innkeeper` | food, Scroll of Recall, binds your hearth, quests | towns size 3+ | reuse |
| `npc_alchemist` | all potions, elixirs, flasks, cleansers | hubs | **new** |
| `npc_enchanter` | glyphs (§14) | hubs | **new** (Emberveil role, new stock) |
| `npc_jeweller` | gems, combining, unsocketing | hubs from `greyridge` north + Highcourt | **new** |
| `npc_gambler` | sealed crates (§12.7) | towns size 3+ | reuse |
| `npc_stablemaster` | mounts (§20.1), mount training | hubs | **new** (Farhold sold mounts at every merchant) |
| `npc_lampwright` | lights (§20.2) | hubs | **new** (was every merchant) |
| `npc_fletcher` | quivers | Brightwater, Silverbough, Fort Ashfall | **new** |
| `npc_quartermaster_<faction>` | reputation rewards | each faction hub | **new** |
| `npc_delve_quartermaster` / `npc_raid_quartermaster` / `npc_glory_quartermaster` | token gear | Highcourt + Spire Landing | **new** |
| `npc_wardrobe_keeper` | transmog, dyes (§21) | hubs | **new** |
| `npc_broker` | mercenary followers (page 07) | size 2+ | reuse |
| `npc_unbinder` | retraining (page 07; `balance.json retrain`) | size 2+ | reuse |
| `npc_collector` | buys trophies for 3× + a reputation token | hubs | **new** |
| `npc_banker` / `npc_auctioneer` | page 15 | hubs | new |

Incidents can move prices (reuse: `data/incidents.json` `shopMult` 0.7–1.5, e.g. a siege raises prices 30%).

### 18.3 Fixed prices (not by formula)

| Thing | Price |
|---|---|
| Inventory bags | 8-slot 100 · 12-slot 800 · 16-slot 6,000 · 20-slot drops only (raids 2%, `r05` 5%) |
| Bank tabs | 1st free, 2nd 1,000, 3rd 5,000, 4th 25,000, 5th 100,000 |
| Fast-travel hop (page 07) | 5 × band gold |
| Unbinder (page 07) | spell 120 + 20/level, perk 80 + 12/level, talent 60 + 8/level (reuse) |
| Transmog | 5% of the source item's sell price, min 10 |
| Dye | 25 (common colours) to 2,500 (metallic) |
| Guild charter | 100 (page 15) |
| Auction house | page 15 owns; this page proposes a 1% listing deposit (lost if unsold) and a 5% cut on sale |

---

## 19. The economy: sources and sinks

Target gold income from normal play (kills + quests + selling), used to tune everything above:

| Level band | Region | Band gold multiplier | Target gold / hour |
|---|---|---|---|
| 1–6 | Hearthvale | 1 | 150 |
| 5–12 | Mossfen | 1.5 | 350 |
| 10–18 | Greyridge | 2.5 | 700 |
| 16–24 | Sunscar | 3.5 | 1,100 |
| 22–30 | Whisperwood | 4.5 | 1,600 |
| 28–36 | Cinder Steppe | 5.5 | 2,300 |
| 34–42 | Frostmantle | 7 | 3,100 |
| 40–48 | Drowned Coast | 8.5 | 4,000 |
| 46–54 | Riftmarch | 10 | 5,200 |
| 52–60 | Emberthrone | 12 | 6,500 |
| 60 | Veilspire Isle / endgame | 14 | 8,000 |

A trash kill pays `2 × 1.061^(L − 1)` gold 60% of the time (2 at level 1, 11 at 30, 66 at 60); at about
100 kills an hour that is ≈120 gold an hour at level 1 and ≈4,000 at level 60 — about half the target, with quests, selling and chests making up the rest.

**Sources:** kills (≈45%), quests and dailies (≈35%), selling items and junk (≈15%), chests and
events (≈5%). **Tokens never convert to gold.**

**Sinks** (targets as a share of a level-60 player's weekly income):

| Sink | Share | Notes |
|---|---|---|
| Bench gold costs (§13.3) | 20% | biggest steady sink |
| Repairs (§15) | 10% | deaths only |
| Consumables | 15% | flasks, food, potions |
| Glyphs and gems | 15% | |
| Mounts and lights | 10% (levelling), 2% (60) | |
| Gambler | 5% | optional |
| Auction house cut | 5% of what is traded | removes gold from the world on every sale |
| Transmog, dyes, bags, bank tabs | 5% | |
| Unbinder, fast travel | 5% | |

The owner should expect gold inflation to be the first economy problem after launch; the AH cut and bench
costs are the two dials (both in `data/balance.json`, §23).

---

## 20. Mounts, lights and quivers as loot

`(reuse: prototypes/farhold/js/gear.js)` Farhold's line: **a mount, a light and a quiver are loot**
(they roll a rarity, carry slot-only affixes, upgrade at the bench and price like gear); boats and ships
are unlockables. Wildmarch keeps the first half; boats are a travel **unlock** (page 07 at level 9, page 01 §10.6),
not loot, and there are no ships. **When** you may ride is
page 07's (the mount is an earned verb, canon §1).

### 20.1 Mounts

Speed is a **multiplier on the walk** (5.4 m/s) — Farhold R17 fixed a row that printed it as m/s. Roads add
×1.25 when mounted (reuse: `balance.json roads.mount`). A mount rolls a rarity like any gear; rarity adds
affixes (§7: Surefooted, Long-winded, Trampling, Calm), not speed. **Learning** a mount (first equip) adds
its look to the account's stable; the item then acts as the stable entry (account-bound).

**Riding rank caps speed** (page 07 owns the ranks): a mount's listed Speed is its own top speed, but you ride at
no more than your rank allows — Riding I 8.6 m/s, Riding II–IV 10.8 m/s on the ground, Riding IV 13.5 m/s in the
air. Past the cap, mounts differ by jump, gallop, terrain and look.

| id | Mount | Creature body (`avatar-3d/js/creature-types.js`) | Speed | Jump | Gallop (s) | Source | Price | Origin |
|---|---|---|---|---|---|---|---|---|
| `it_mount_trail_horse` | Trail Horse | horse | ×1.6 | 1.3 | 20 | the mount unlock quest `q_hc_saddle_and_bridle` (page 07, Riding I) | — | reuse |
| `it_mount_dune_strider` | Dune Strider (Uncommon) | horse (desert tack) | ×2.0 | 1.4 | 24 | `q_ss_the_sand_runners` (page 07, Riding II) | — | **new** |
| `it_mount_tide_steed` | Tide Steed (Rare) | horse (sea-green, finned) | ×2.0 | 1.6 | 26; swims at full speed | `q_dc_the_tide_steed` (page 07, Riding III) | — | **new** |
| `it_mount_stormwing` | Stormwing (Epic) | griffin (storm-grey) | ×2.0 ground / 13.5 m/s air | 3.0; winged | 30 | `q_sky_5` (page 07, Riding IV) | — | **new** |
| `it_mount_moor_pony` | Moor Pony | pony | ×1.9 | 1.4 | 26 | Stablemaster | 140 × band | reuse |
| `it_mount_courser` | Courser | courser | ×2.5 | 1.6 | 18 | Stablemaster, level 30 | 420 × band | reuse |
| `it_mount_dray_elk` | Dray Elk | elk | ×2.1 | 2.1 | 40 | Stablemaster, level 20 | 760 × band | reuse |
| `it_mount_reedstrider` | Reedstrider | frog | ×2.0 | 2.4 | 24; swims at full speed | Fenfolk Exalted | 40 Reed Tokens + 2,000 | **new** |
| `it_mount_tusker` | Greyridge Tusker | boar | ×2.2 | 1.3 | 30; +15% slope | Deepforge Revered | 3,500 | **new** |
| `it_mount_crown_courser` | Crown Courser | courser (barded) | ×2.5 | 1.6 | 24 | Crown Assembly Exalted | 8,000 | **new** |
| `it_mount_dune_sabrecat` | Dune Sabrecat | saber cat | ×2.4 | 2.0 | 22 | Sandsworn Exalted; `d05_glass_tombs` secret boss 20% | 12,000 | **new** |
| `it_mount_moonwell_stag` | Moonwell Stag | deer | ×2.5 | 2.2 | 22; glows at night | Moonwell Circle Exalted | 15,000 | **new** |
| `it_mount_ashfang` | Ashfang Dire Wolf | dire wolf | ×2.5 | 1.8 | 26 | Cinder Steppe war-camp warlords 1% | drop | **new** |
| `it_mount_rimehold_bear` | Rimehold Bear | bear | ×2.3 | 1.2 | 45; Trampling 20 built in | Frost Wardens Exalted | 20,000 | **new** |
| `it_mount_tidewalker` | Tidewalker Turtle | turtle | ×1.8 land / ×3.0 water | 0.8 | 60 | Drowned Coast world boss 1% | drop | **new** |
| `it_mount_emberdrake` | Emberdrake | drake | ×2.6 | 2.0 | 30; fire trail at full gallop | `r04_ember_court` final boss 1% / Mythic 2% | drop | **new** |
| `it_mount_rift_griffin` | Riftbound Griffin | griffin | ×2.6 | 3.0; glides from any drop over 4 m | 30 | `r05_veilspire` final boss 1% / 2% | drop | **new** |
| `it_mount_veil_dragon` | Veil Dragon | dragon | ×2.7 | 2.4 | 35 | `r05_veilspire` secret boss (Mythic) 1% | drop | **new** |
| `it_mount_warhound` | Warmaster's Hound | hound | ×2.4 | 1.9 | 28 | `d09_warmasters_pit` Mythic+ key 10 end chest 1% | drop | **new** |

**Flying is in at 60 (canon 00 §10).** Winged mounts — every griffin, drake, dragon and phoenix here and on pages
12/13 — **glide** before Riding IV (from any drop over 4 m, forward at ground speed; they cannot climb) and
**fly** once you have Riding IV (`q_sky_1..5`, page 07), where page 01 allows flight. *(Was: "No flying in v2" —
**Resolved (00 §10)**.)*

### 20.2 Lights

Night is darker in Wildmarch (canon §4), so the light slot matters more than in Farhold. Every character
starts with the Guttering Brand (canon: "a torch and a stick"). `range` is metres of ground lit.

| id | Light | Range (m) | Colour | Source | Price | Origin |
|---|---|---|---|---|---|---|
| `it_light_guttering_brand` | Guttering Brand | 26 | `#ffa050` | starting kit | — | reuse |
| `it_light_pitch_torch` | Pitch Torch | 40 | `#ffb066` | Lampwright, any merchant | 20 | reuse |
| `it_light_shuttered_lantern` | Shuttered Lantern | 90 | `#ffd9a0` | Lampwright, level 12 | 260 × band | reuse |
| `it_light_wisp_lamp` | Wisp Lamp | 160 | `#a8d8ff` | Lampwright, level 30 | 820 × band | reuse |
| `it_light_mirror_lamp` | Mirror Lamp | 210 | `#ffe6b8` | `d10_rimefang_caverns` final boss 10% (Farhold: build-only) | drop | reuse, new source |
| `it_light_arc_lamp` | Arc Lamp (renamed **Stormglass Lamp**) | 300 | `#dcefff` | `r02_glacier_throne` any boss 3% | drop | reuse, new source |

Light affixes: Broad (+8–20 m), Finder's (+8–22% minimap span), **Emberwick** (new: +3–8% damage to enemies
inside your light at night). Two light uniques and three light legendaries are in page 09.

### 20.3 Quivers

Six quivers (§6.3) sold by the Fletcher and made at the bench (`forge_quiver`); they roll rarity and affixes
like any off-hand item; two quiver uniques and one quiver legendary are in page 09.

---

## 21. Appearance: the wardrobe and dyes

Farhold has an appearance editor for the body (`js/bodypresets.js`, `js/appearance.js`) and none for gear.
**(new)**

- **Collecting.** An item's look is added to your **account wardrobe** when you **equip** it, or when you
  loot a BoP item. BoE items you never wear are not collected. Quest-reward choices you did not pick are not
  collected. Secret bosses give one look guaranteed (§12.3).
- **Applying** (`npc_wardrobe_keeper`, `scr_wardrobe`): replace any equipped item's look with a collected look
  of the **same slot** and an armour type **you can wear**; weapons within the same **type** (a sword look on a
  sword, a greatsword on a greatsword). Cost: §18.3. Removing a look is free.
- **Hide**: head, shoulders, back and light can each be hidden (toggle on the doll; page 04 settings
  `set.appearance.hide_head` etc.).
- **Dyes**: Chibi 2 recolours gear through CSS-variable colour channels (reuse: avatar-2d recolour,
  Chibi 2 part colours). Every armour piece has **3 dye channels** (main, trim, metal). Dyes are account-bound
  unlocks after the first use. 48 dyes: 24 common (25 g), 16 rare (from rares and quests), 8 metallic
  (2,500 g or raid drops).
- **Outfits**: save up to 10 full looks per character and swap them in one click out of combat.
- **Mount looks**: the stable (§20.1) swaps between any learnt mount model; the equipped mount item's
  affixes stay.

---

## 22. The item card

`(reuse: Farhold hud.itemCard / the R22 tooltip, shared/tooltip.js)` — every line is generated from the
data and the same constants the code uses; nothing is typed twice (Farhold `WORDING.md`).

Order, top to bottom:

1. **Name** in the rarity colour (Legendary shimmers).
2. `Rarity · Type` — "Epic Longsword", "Set piece · Plate Pauldrons", "Legendary Ring".
3. `Item level 64` and, if you cannot wear it, `Requires level 60` in red / `Requires: heavy armour` in red.
4. **Binding line** (§10), with the trade countdown if any.
5. **Base**: "46–92 damage · every 0.64 s · 3.0 m reach" or "Armour 120 · −2 dodge".
6. **Affixes**, one per line, in the Farhold sentence form ("+21% critical chance", "+43% damage to targets
   below 25% health"); a line the bench changed is marked ✦; a line past the cap shows the capped value.
7. **Gem sockets** (empty socket shown as a hollow diamond).
8. **Glyph** in pale gold.
9. **Power** block (Unique / Legendary) in the rarity colour, the full sentence with numbers. On a weapon a
   shapeshifter can carry, a grey line under the power says **"Works in forms"** (the power is written "on hit"
   or "on kill") or **"Caster form only"** (it names a staff spell, a wand bolt or a charged attack)
   ([classes/druid.md](classes/druid.md)).
10. **Set block**: set name, pieces owned n/6 with each piece name ticked or grey, then each bonus (inactive greyed).
11. **Flavour** in italics (Farhold `lore`).
12. Footer: `Durability 88/100`, `Sell 1,234 gold`, and **compare** (Shift, page 02): green/red deltas against
    your equipped item in that slot — for rings, against the worse of the two.

---

## 23. Data shapes

Page 16 owns file names; this is the item side. Files: `data/items/bases.json`, `data/items/affixes.json`,
`data/items/uniques.json`, `data/items/sets.json`, `data/items/legendaries.json`, `data/items/consumables.json`,
`data/items/currencies.json`, and a `loot` + `economy` block in `data/balance.json`.

A dropped item (server-side, saved on the character):

```json
{
  "uid": "i_8f3k2a",
  "base": "longsword",
  "name": "Deadly Longsword of Execution",
  "rarity": "epic",
  "ilvl": 44,
  "req": 43,
  "slot": "weapon",
  "armourType": null,
  "dice": [46, 92],
  "affixes": [
    { "id": "sharp", "stat": "dmg", "value": 23 },
    { "id": "crit_chance", "stat": "critChance", "value": 21 },
    { "id": "of_str", "stat": "str", "value": 17 },
    { "id": "execute", "stat": "cond_executeDmgPct", "value": 0.43, "crafted": true }
  ],
  "sockets": [ { "gem": "it_gem_onyx_3" } ],
  "glyph": "it_glyph_keenness_2",
  "brand": null,
  "bench": { "refine": 2, "hone": 1, "reweaves": 1, "ascend": 0 },
  "binding": "bop",
  "boundTo": "char_12345",
  "tradeUntil": null,
  "durability": 108,
  "look": null,
  "dyes": null,
  "kills": 311,
  "source": { "kind": "raid", "id": "r02_glacier_throne", "boss": 3, "difficulty": "normal" }
}
```

A named item definition (unique / set piece / legendary) extends Farhold's `uniques.json` row:

```json
{
  "id": "leg_voidwalker_soles",
  "kind": "legendary",
  "name": "Voidwalker Soles",
  "slot": "feet",
  "base": "light_boots",
  "ilvl": 58,
  "fixed": [ { "stat": "dex", "value": 40 }, { "stat": "hp", "value": 310 }, { "stat": "moveSpeed", "value": 0.05 } ],
  "random": [ { "stat": "dodge", "min": 3, "max": 6 } ],
  "power": "void_heal",
  "powerNumbers": { "healSeconds": 1.0, "afterReduce": 0.2 },
  "sources": [ { "kind": "raid", "id": "r03_sunken_choir", "boss": "secret", "chance": 0.25 } ],
  "binding": "bop",
  "lore": "They step where the dark pools and the dark forgets to bite."
}
```

---

## 24. Farhold bugs found while writing this page

Three affix rows in Farhold are wrong **today**. Wildmarch fixes them in its own table (§7); the owner may
want them fixed in Farhold too. (Not fixed here — this page writes no code.)

1. **`of Resonance` gives +300–800% spell power for 6 s.** `AFFIX_TUNING.after_skill_sp` is `{ min: 3, max: 8 }`
   and `ENGINE_UNIT.cond_afterSkillSpellPow` is `flat`, but its handler in `js/effects.js` does
   `d.spellPower += v`, and `spellPower` became a **share** in R18. So a roll of 5 adds 5.0 = +500% spell power
   after every skill. It is the R18 spellPower bug, in the one writer R18 did not move. Wildmarch: `frac` 0.05–0.12.
2. **`of Second Wind` saves you at full health.** `AFFIX_TUNING.cheat_death` is `{ min: 1, max: 1 }` and the stat is
   filed `frac`, and the handler sets `survive = maxHp × v` — so a killing blow leaves you at **100%** health every
   60 s, while the card (`pct(v)`) honestly prints "at 100% of your maximum health". Wildmarch: 20%, every 90 s.
3. **`of Laceration` bleeds for 1.8–3.6 damage in total.** `cond_bleedOnCrit` is `flat` 0.3–0.6 and the handler
   applies `perSecond: v` for 6 s — it does not scale with the hit, the level or (being flat, growth 3) much with
   the tier (≈2 a second at mythic). It is inert past level 5. Wildmarch: a share of the crit, 30–60% over 6 s.

---

## 25. Notes for other pages

| Page | What it needs from here |
|---|---|
| 02 Controls | `belt_1`…`belt_4` potion keys; Shift = compare on the item card; Alt = show ground loot labels; a Salvage key in the bag (suggest `X`) |
| 03 UI screens | `scr_character` Equipment tab (15 sockets, §2.2), `scr_bench`, `scr_vendor`, `scr_gambler`, `scr_enchanter`, `scr_jeweller`, `scr_wardrobe`, `scr_vault`, `scr_stable`, the Currency tab, the loot panel with the loot-focus dropdown, the legendary loot banner |
| 04 Settings | `set.gameplay.auto_loot` (on/off, default on), `set.gameplay.loot_filter` (All / Uncommon+ / Rare+ / Epic+ labels, default All), `set.gameplay.confirm_salvage_from` (Rare/Epic/Never, default Rare), `set.interface.show_item_level` (on), `set.interface.compare_on_hover` (off = Shift), `set.appearance.hide_head/shoulders/back/light` |
| 05 Combat | the item-level term replaces `player.damagePerLevel` (§6.1); gear-side totals (§5.3); statuses used by brands and glyphs |
| 07 Progression | mount unlock level, the Unbinder, reputation ranks and token turn-in value (+250) |
| 12 / 13 | secret-boss exclusive tables are in page 09 §6; drop rates in §12 here |
| 15 Social | binding, trade window, AH deposit + cut, guild repairs |
| 16 Tech | the data files in §23; the affix unit test (§5.1) |
| 17 Art/audio | new `rarity_mythic.svg` gem, legendary name shimmer, `loot_legendary` sound, 6-beam legendary beacon, shoulder/back/waist Chibi 2 part variants per armour weight |
