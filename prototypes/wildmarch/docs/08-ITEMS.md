# WILDMARCH — Design Bible, page 08: items

> *"A bad rare is not rubbish. It is four Bound Essence."* — the rule Farhold's bench was built to.

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only; nothing here is built.
**Owns:** equipment slots (including the **tool** slot), item levels, rarities, **special rarities**, bases,
affixes, **tags on items**, the unique / set / legendary model, **sockets** (gems, jewels, souls, gadgets),
**magic find**, personal loot and trade, drop tables, salvage, the bench, glyphs, durability, consumables,
gold and reputation rewards, vendors, prices, the economy, **quivers**, **tools**, **mounts** as loot, and
appearance.
**Does not own:** the catalogue of generic sets, legendaries, uniques and **souls** ([page 09](09-SETS-LEGENDARIES.md));
class sets, class legendaries and class souls (`classes/<id>.md`); the tag list and damage maths
([page 05](05-COMBAT.md)); riding ranks and unlock levels ([page 07](07-PROGRESSION.md)); Harvesting, crafting
professions and gadget recipes ([page 19](19-PROFESSIONS.md)); Travel Methods and the Recall Stone's rules
([page 20](20-TRAVEL.md)); monster rarities ([page 10](10-BESTIARY.md)); screen layouts ([page 03](03-UI-SCREENS.md));
keys ([page 02](02-CONTROLS.md)); settings ([page 04](04-SETTINGS.md)); trade, the Trading Post and mail
([page 15](15-SOCIAL-ONLINE.md)); file layout ([page 16](16-TECH.md)); art ([page 17](17-ART-AUDIO.md)).

Every section says what Farhold does today `(reuse: path)` and what changes in Wildmarch `(new)` /
`(changed)`. Paths are relative to `~/claude/playground/`.

---

## Contents

1. [What is reused, in one table](#1-what-is-reused-in-one-table)
2. [Equipment slots and the paper doll](#2-equipment-slots-and-the-paper-doll)
3. [Item level and level requirement](#3-item-level-and-level-requirement)
4. [Rarities](#4-rarities)
5. [Special rarities](#5-special-rarities)
6. [Stats and units](#6-stats-and-units)
7. [Tags on items](#7-tags-on-items)
8. [Bases: weapons, off hands, armour, jewellery](#8-bases-weapons-off-hands-armour-jewellery)
9. [Quivers](#9-quivers)
10. [Tools and the tool slot](#10-tools-and-the-tool-slot)
11. [The affix table](#11-the-affix-table)
12. [Uniques, sets and legendaries — the three named kinds](#12-uniques-sets-and-legendaries--the-three-named-kinds)
13. [Sockets: gems, jewels, souls and gadgets](#13-sockets-gems-jewels-souls-and-gadgets)
14. [Magic find](#14-magic-find)
15. [Loot and trade](#15-loot-and-trade)
16. [Drop tables by source](#16-drop-tables-by-source)
17. [Salvage and the bench](#17-salvage-and-the-bench)
18. [Glyphs](#18-glyphs)
19. [Durability and repair](#19-durability-and-repair)
20. [Consumables](#20-consumables)
21. [Gold and reputation rewards](#21-gold-and-reputation-rewards)
22. [Vendors and prices](#22-vendors-and-prices)
23. [The economy: sources and sinks](#23-the-economy-sources-and-sinks)
24. [Mounts](#24-mounts)
25. [Appearance: the wardrobe and dyes](#25-appearance-the-wardrobe-and-dyes)
26. [The item card](#26-the-item-card)
27. [Data shapes](#27-data-shapes)
28. [Farhold affix bugs](#28-farhold-affix-bugs)
29. [Notes for other pages](#29-notes-for-other-pages)
30. [Removed in round 2](#30-removed-in-round-2)

---

## 1. What is reused, in one table

| Piece | Farhold / playground source | In Wildmarch |
|---|---|---|
| Item bases (57 weapons, 47 armour) | `prototypes/emberveil/data/items.json` `weaponBases`, `armorBases` (shared with Emberveil) | reused; named bases folded into one dice row per type (§8) |
| Loot generator | `prototypes/emberveil/js/loot.js` (`generate`, `generateUnique`, `generateSetItem`, `price`, `salvage`) | reused as the server's roller, with the magic-find reader of §14 in front of it |
| Affix units, caps, tiers, slot rules | `prototypes/farhold/js/affixes.js` (`ENGINE_UNIT`, `AFFIX_CAP`, `AFFIX_TUNING`, `SLOT_RULES`, `AFFIX_TIERS`) | reused; tiers end at item level 54 (§3.3); tag, magic-find and tool affixes added (§11) |
| Effect registry (every affix and power's code + sentence) | `prototypes/farhold/js/effects.js` | reused; unique powers, legendary powers and **soul** powers all register here (page 09) |
| 189 uniques + power handlers | `prototypes/farhold/data/uniques.json`, `js/uniques.js`, `tools/build-uniques.mjs` | reused as the world unique pool (page 09 §4) |
| Mounts and quivers | `prototypes/farhold/js/gear.js` (`GEAR_BASES`, `SLOT_AFFIXES`) | mounts and quivers reused and widened (§9, §24); **lights dropped** (always daylight, canon §4); boats and ships dropped |
| Caster foci | `prototypes/farhold/js/foci.js` | reused (§8.3); quivers are tuned to match them (§9.4) |
| Tools | `prototypes/farhold/js/tools.js`, `data/tools.json` (the round-16 Tool slot: tiers, speed, yield) | reused as the **tool slot** for Harvesting (§10; page 19 §6 owns the tools); Farhold's ore industry and colony vendors are **not** in Wildmarch |
| Materials + bench | `prototypes/farhold/js/craft.js`, `data/crafting.json` | reused; one new material (Tear-glass), one new action (§17) |
| Chests + loot beacons | `prototypes/farhold/js/chests.js`, `data/balance.json` `chests` | reused (§16.8) |
| Rarity roll | `prototypes/farhold/js/rpg.js` `rarityFor`, `balance.json` `rarity` | reused with seven tiers (§4) and the magic-find reader (§14) |
| Gambler crates | `prototypes/farhold/js/town.js` `CRATE_TIERS`, `gamble()` | reused (§16.7) |
| Shop buyback, `price()` honouring `basePrice` | `js/town.js` buy/sell, `js/rpg.js` `price()` | reused (§22) |
| Unbinder prices | `data/balance.json` `retrain` | page 07 owns; listed as a gold sink here (§23) |
| Item vault catalogue (340 flavour items) | `items/data/items.json`, `items/js/items.js` | reused for **junk and quest items** only: vendor trash, trophies, lore items (§16.9) |
| Tooltip | `shared/tooltip.js`, Farhold `hud.itemCard` | reused; the card gains a 3D portrait, rarity frames, socket rows and a tags line (§26) |

---

## 2. Equipment slots and the paper doll

Farhold has 13 slots (`js/rpg.js` `SLOTS`): weapon, offhand, head, chest, legs, hands, feet, ring, ring2,
necklace, mount, light, tool. Wildmarch **drops the light slot** (always daylight, canon §4 and §12.3),
**keeps the tool slot** for Harvesting (canon §12.3, page 19), and **adds three armour slots** that Chibi 2
can already draw: shoulders (`pauldrons` / `mantle` / `capelet` in `avatar-3d/js/chibi2-gear.js`), back
(`cape` / `cloak`) and waist (`belt` / `belt_pouches`). **(changed)**

### 2.1 The fifteen slots

| # | Slot id | Name on the doll | Holds | Armour type applies? | Sockets it can have (§13) | Chibi 2 part | Origin |
|---|---|---|---|---|---|---|---|
| 1 | `head` | Head | helms, hoods, caps, crowns | yes | gem, jewel, soul, gadget | hat / helm | reuse |
| 2 | `shoulders` | Shoulders | pauldrons, mantles, spaulders | yes | gem, jewel, soul, gadget | `pauldrons`, `mantle` | new |
| 3 | `chest` | Chest | robes, jerkins, hauberks, plate | yes | gem, jewel, soul, gadget | body outfit | reuse |
| 4 | `back` | Back | cloaks and capes (one weight: "any") | no | gem, jewel, soul, gadget | `cape`, `cloak` | new |
| 5 | `hands` | Hands | gloves, gauntlets, bracers | yes | gem, jewel, soul, gadget | hands | reuse |
| 6 | `waist` | Waist | sashes, belts, girdles — adds potion belt charges, not slots (§20.1) | yes | gem, jewel, soul, gadget | `belt`, `belt_pouches` | new |
| 7 | `legs` | Legs | leggings, greaves | yes | gem, jewel, soul, gadget | legs | reuse |
| 8 | `feet` | Feet | slippers, boots, sabatons | yes | gem, jewel, soul, gadget | feet | reuse |
| 9 | `necklace` | Neck | amulets, pendants, torcs | no | gem, jewel, soul | — (not drawn) | reuse |
| 10 | `ring` | Ring I | rings | no | gem, jewel, soul | — | reuse |
| 11 | `ring2` | Ring II | rings (a unique ring may not be worn twice) | no | gem, jewel, soul | — | reuse |
| 12 | `weapon` | Main hand | any weapon | — | gem, jewel, soul, gadget | held part | reuse |
| 13 | `offhand` | Off hand | shield, ward, focus (incl. hourglass, field map, war standard), instrument (lute, warhorn, hand drum), **quiver** (§9), a one-handed weapon (dual wield) | — | gem, jewel, soul, gadget | held part | reuse |
| 14 | `tool` | Tool | one harvesting tool: pick, sickle, hatchet, skinning knife, rod or pry bar (§10; page 19 §6 owns them) | no | gadget only | held part while gathering; hangs on the belt otherwise | reuse (Farhold R16 tool slot), narrowed to Harvesting |
| 15 | `mount` | Mount | a mount (§24) | no | none | creature body | reuse |

**Two-handed weapons** empty the off hand, except a **quiver**, which a bow or crossbow may wear
(Farhold R22 fixed `offhandRefusal` for exactly this). **Dual wielding**: any one-handed weapon in each
hand if the class file allows it; the off-hand weapon swings on its own clock (page 05).

**Armour type rule:** a class may wear its own armour type (canon §6) **and any lighter one**
(heavy > medium > light > cloth). Personal loot (§15) only rolls your own type. Wearing all seven
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
 │  Waist   │                      │  Tool    │
 ├──────────┤                      ├──────────┤
 │  Legs    │                      │  Mount   │
 ├──────────┤                      └──────────┘
 │  Feet    │
 └──────────┘
        ┌────────────┐  ┌────────────┐
        │ Main hand  │  │  Off hand  │
        └────────────┘  └────────────┘
   Item level 58.4 · Armour 4,210 · Set: Journeyman's 4/6 · Legendaries 2/2 · Souls 2/3
```

Each doll slot shows the item icon in its rarity colour, the special-rarity glyph in its corner (§5), a
thin durability bar (red under 20%), one small pip per socket in the socket kind's colour (hollow when
empty, §13.1), and a `2H` badge on the off hand when a two-hander locks it. The footer line shows
**average equipped item level** (the 13 combat slots; tool and mount excluded; a two-hander counted twice),
total armour, each active set as `Name n/6`, legendaries worn as `n/2` and souls active as `n/3` (§13.6).
Page 03 owns the screen (`scr_character`, Equipment tab).

### 2.3 Slot words other pages used (rulings)

Round-1 dungeon loot (page 12) used four slot words that are not among the 15. Page 08 owns slots, so:

| Word used | Ruling |
|---|---|
| **trinket** / "trinket (use)" | there is no trinket slot. Page 12 turned every dungeon trinket into a **dungeon soul** (`soul_<snake>`, §13.6), and its "use:" button into an **automatic trigger** with the same cooldown (there is no use key). Page 09 §7 indexes them |
| **wrists** | read as **hands** (bracers are a hands base), unless page 12 moved the item to another slot |
| **light slot** / "off-hand light" | the light slot is gone. Each light-slot item moves to another slot — usually an **off-hand focus** (reliquary base) or a necklace — with a new name if it was a lamp, torch or lantern (page 09 lists old → new) |
| **banner** (off hand) | a new off-hand focus base, the **War Standard** (§8.3) |

---

## 3. Item level and level requirement

`(reuse: prototypes/farhold/js/affixes.js itemLevelFor, requirementFor, AFFIX_TIERS)`

Every piece of gear carries an **item level** (`ilvl`) from **1 to 60**, and **the item level is the level
you need to wear it** (canon §4, W17). There are no item levels above 60, no upgrade tracks and no
"touched" tier. Item level decides the base numbers (§8), which affixes may roll (each has a minimum ilvl)
and how big they roll (the tier, §3.3).

### 3.1 Item level of a drop

| Source | Item level |
|---|---|
| Open-world kill | the enemy's level + a wobble of −1…+1; Rare or better +1; never above 60 |
| Chest in the world | the zone's level + the same wobble |
| Quest reward | the quest's level (story, side); + 1 for dungeon and calling quests; never above 60 |
| Normal dungeon | the top of the dungeon's band (e.g. `d05_glass_tombs` 19–22 → ilvl 22); final and secret boss + 1, never above 60 |
| **Challenge** dungeon | **60** |
| **Depth** | the level page 12 gives that depth (the dungeon's level rises by 3 a depth until it reaches 60); 60 from then on |
| World boss | `min(your level, boss level)` on a normal week; `min(your level, 60)` when the boss is **Ascendant** (page 13 §4: two of the eight are raised to 60 each week) |
| Spire Isle open world | 60 |
| Faction quartermaster | your level, up to 60 (canon §12.2) |
| Crafted (bench or profession) | any level up to the crafter's own |
| Gambler crate | your level |

### 3.2 Level requirement

`required level = ilvl`. (Farhold's `requirementFor` used `ilvl − 1`; Wildmarch uses the item level itself,
so the two numbers on the card are always the same and only one is shown.) `of Early Promise` (§11) lowers
the requirement by 2–4 per roll, capped at 12 total, **on its own item while in the bag** and on everything
else once worn (reuse, Farhold round 6).

### 3.3 Affix tiers by item level

Farhold's six tiers stop at 44 because its cap was 50. Wildmarch keeps them, renames Farhold's `mythic` tier
(a banned word) to **masterful**, and adds one tier for the last stretch to 60. **(changed)**

| Tier | From ilvl | Multiplier on the level-1 range (`mult`) | Origin |
|---|---|---|---|
| crude | 1 | 1.00 | reuse |
| plain | 8 | 1.35 | reuse |
| fine | 16 | 1.75 | reuse |
| superior | 24 | 2.20 | reuse |
| exquisite | 34 | 2.70 | reuse |
| masterful | 44 | 3.30 | reuse (Farhold `mythic`, renamed) |
| peerless | 54 | 3.80 | **new** |

An affix rolls `(min + rng × (max − min)) × (1 + (mult − 1) × growth / 3)`, never below `min`, then is
clipped to the stat's per-roll cap and rounded (fractions to 2 decimals, the rest to 1). `growth` is 3
by default, **1.7 for multiplier stats** (they compound with every other share you wear) and per-row
overrides (attributes 4.5, weapon damage 6, flags 1). This is exactly `rollAffixValue` in
`js/affixes.js`, with `peerless` added to `AFFIX_TIERS`.

### 3.4 What still gets better at level 60

Item level stops at 60, so the endgame ladder is everything **except** item level. In order of how often a
player meets it:

| Step | What improves | Where it comes from |
|---|---|---|
| 1 | **Rarity**: Rare → Epic → Unique / Set / Legendary | Challenge bosses have an Epic floor; Depth raises floors (§16.3) |
| 2 | **Where in the range** each affix rolled (every ilvl 54–60 item is peerless tier) | rerolls at the bench (§17), Twinned items (§5) |
| 3 | **Sockets**: how many, and which kinds (§13.1) | Challenge and Depth items roll more; professions add them (§13.2) |
| 4 | **What goes in the sockets**: the right jewel, a soul | jewels and souls are the chase (§13.5, §13.6) |
| 5 | **Special rarity** (§5) | rare on everything, likelier from greater-rarity monsters and deep Depths |
| 6 | **Living growth**, Ancient values | play time with the item; Ancient drops |

---

## 4. Rarities

Canon lists seven rarities. Farhold has six colours for six display states (`items.json`
`rarityColors` + `rarityDoc`: normal, magic, rare, legendary, unique, set). Farhold's "legendary" is a
random item with 5–6 properties — **that is Wildmarch's Epic**. Wildmarch's **Legendary** is a new,
top tier (a named item with a major power) and has a colour of its own. **(changed)**

**Uncommon is the owner's "magic" tier** (Farhold's key is `magic`). This page, like canon, always writes
**Uncommon**; "magic or better" in the owner's notes means Uncommon or better.

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
  has a `setId`, else Legendary if `isLegendary`, else Unique if `isUnique`, else its rolled rarity. A special
  rarity (§5) never changes the display rarity or the name colour; it adds a glyph and a card look.
- **Jewellery bonus** `(reuse: items.json accessoryAffixBonus = 1)`: rings and the necklace roll one
  extra affix at Uncommon, Rare and Epic. Wildmarch extends the bonus to the back slot at Epic only.
- **Rarity gems** on item icons: `assets/data/ui/rarity_<gem>.svg` (reuse); Legendary needs a new
  `rarity_legendary.svg` gem (art request, page 17).

### 4.1 The rarity roll

`(reuse: js/rpg.js rarityFor + balance.json rarity)`. Farhold's table is normal 60.5 / magic 29 /
rare 9 / legendary 1.5, with legendary reaching full weight at level 16 and rare at level 10. Wildmarch gives
each rarity a **chance** and rolls them **from the top down** — Legendary first, then Unique, Epic, Rare,
Uncommon; the first success wins, and Common is what is left **(changed:** Farhold rolls weights; the top-down roll
is what lets item rarity raise every higher tier, §14.4):

| Rarity | Base chance | Ramp | Item rarity weight `k` (§14.4) |
|---|---|---|---|
| Legendary | 0.05% | 0 below level 20, full at level 30 | 0.25 |
| Unique | 0.45% | 0 below level 5, full at level 12 | 0.5 |
| Epic | 2.0% | from 10% at level 1 to full at level 16 | 1 |
| Rare | 9.0% | from 25% at level 1 to full at level 10 | 1 |
| Uncommon | 28.5% | — | 1 |
| Common | what is left (≈ 60%) | — | — |

The **source** multiplies each chance by its `rarityBoost` S (champions 1.5, rares 2.2 — reuse
`balance.json ranks`), the looter's **item rarity** multiplies it again by `1 + k × R`, and a **floor** turns any
result below it into the floor rarity. The full order, with a worked example, is §14.4.

---

## 5. Special rarities

**(new)** Five **special rarities** sit on top of an item's normal rarity. Each one changes what the item
does, gives the card its own look, and puts a bespoke glyph in front of the item's name wherever the item is
written (canon §12.3). They are the rarest thing an ordinary item can be.

### 5.1 Rules for all five

| Rule | Value |
|---|---|
| Ids | `sr_electrified`, `sr_starwoven`, `sr_twinned`, `sr_ancient`, `sr_living` |
| How many per item | **one** at most |
| Which rarities | **Uncommon or better**: Uncommon, Rare, Epic, Unique, Set, Legendary. Never Common |
| Which slots | every gear slot except **tool** and **mount** |
| Item level | Ancient only on ilvl **40+**; the others on any ilvl |
| On named items (Unique / Set / Legendary) | the effect applies to the random-range lines and the base; fixed lines are changed only where the table below says so |
| Name | the special word goes first and replaces the prefix affix's word; the suffix stays: an Epic "Deadly Longsword of Execution" that rolls Electrified is **"Electrified Longsword of Execution"**; a unique keeps its name: **"Electrified Oathcutter"** |
| Name colour | the item's rarity colour, unchanged; the **glyph** is drawn in the special rarity's colour |
| Chat and text | the glyph, then the name: `[bolt glyph] Electrified Longsword of Execution`. The chat renderer inlines the SVG glyph at the text's height. Where only plain text is possible (mail subjects, logs, exports) the name is written with **no symbol at all** — never an emoji stand-in |
| Crafting | cannot be added, removed or changed by the bench or a profession; salvaging gives +2 Resonant Dust (+5 for a Living item at Growth 10) |
| Trade | trades like any item; the Trading Post can filter by special rarity |

### 5.2 The five

| id | Name | Colour | What it does (full numbers) | Card look (page 17 owns the art) | Glyph (`assets/data/ui/sr_<name>.svg`) |
|---|---|---|---|---|---|
| `sr_electrified` | **Electrified** | `#6fd3ff` | **On a weapon:** 15% of your hits (basic attacks and damaging skills) arc lightning: **40% of the hit's damage** to the target as Lightning, then jumps to up to 2 more enemies within 8 m for 70% of that. Once per 1.0 s per item. **On anything else:** when a hit lands on you, 12% chance to discharge in 5 m for **60% of your weapon damage** as Lightning (casters: 60% of spell power, page 05) and **Shock** the enemies hit (+10% damage taken, 3 s). Once per 3 s per item. **Every Electrified item** also adds +3% damage with Lightning (max +15% from 5 items) and gives its arcs the Lightning tag. All Electrified arcs together fire at most **4 times a second** | the frame's edges crackle with thin blue arcs that run corner to corner every 1.8 s; a faint static grain over the background; the 3D portrait is lit by short blue flickers | a jagged three-segment bolt, thick at the top and thin at the bottom, with a small round spark at the lower tip; filled `#6fd3ff` with a 1 px white line down its centre |
| `sr_starwoven` | **Starwoven** | `#9fb4ff` | **One extra affix beyond the rarity's maximum**, drawn from the **Starwoven pool** (§5.3), which exists only on Starwoven items. An Epic ring therefore has 5 + 1 = 6 affixes, the sixth from the pool. On a named item, the extra affix is added below its random-range lines | the card background is a slow deep-space field (dark blue-violet, three layers of star dots drifting at different speeds) with a holographic sheen that slides across as the pointer moves; the Starwoven affix line is drawn in star-blue with the glyph in front | an eight-pointed star — four long points and four short points, alternating — with a hollow circle at its centre |
| `sr_twinned` | **Twinned** | `#e4e6f2` | **Every random affix is rolled twice and the higher kept** (the average roll moves from the middle of the range to two-thirds of the way up). The number of sockets is also rolled twice, keeping the higher. The bench's **Sharpen** and **Recast** on a Twinned item roll twice as well. On a named item: its random-range lines roll twice | the portrait shows the item twice, mirrored about a thin silver seam; two shimmers cross the card at once, one left-to-right, one right-to-left | two interlocked rings tilted 20°, the left one solid, the right one an outline, overlapping like two chain links |
| `sr_ancient` | **Ancient** | `#d8b36a` | The item rolls one **Ancient factor between 110% and 120%**, shown on the card ("Ancient 114%"). **Every affix value, random-range line and fixed line** is multiplied by it, and may pass the per-roll cap by the same factor; **base dice, armour, block power and barrier +15%**. The character-total ceilings of §6.3 still apply. ilvl 40+ only | a weathered stone frame with gold inlay in the corners; the background is old parchment; values that the factor pushed past their normal maximum are underlined in gold | a carved stave: one vertical stroke with two short branches angled down from its right side and one crossbar near the foot, cut with a bevelled edge (our own shape, not a letter from any real alphabet) |
| `sr_living` | **Living** | `#7fd86a` | The item **grows**. It has **Growth 0–10**, earned by kills while it is equipped: an ordinary enemy 1 point, a champion 3, a rare 10, a boss 25, a world boss 50. Growth step *k* needs 60 × *k* points (3,300 in total). **Each step adds +2% to every number on the item** (base, affixes, fixed lines; +20% at 10). **Step 5** adds one empty socket of a kind the slot allows, if the rarity maximum is not already reached (§13.1). **Step 10 "In Bloom"** adds one extra affix from the slot's normal pool, rolled at the top of its tier. Growth is saved on the item and goes with it when traded | vines grow in from the card's corners as Growth rises (bare at 0, the full frame covered and flowering at 10); a thin green Growth bar with 10 notches sits under the name | a short curved stem with two leaves, the left leaf larger, and a small seed at the foot of the stem |

### 5.3 The Starwoven pool

Values are at ilvl 60; below 60 each range is multiplied by `0.4 + 0.6 × ilvl / 60`. All count toward the
character-total ceilings of §6.3 and the magic-find caps of §14.3.

| id | Line | Range (ilvl 60) | Slots |
|---|---|---|---|
| `sw_cooldowns` | +x% cooldown recovery | 6–10% | any |
| `sw_free_cast` | x% chance that a skill costs no resource | 8–12% | W, O, N, R, H |
| `sw_repeat` | x% chance a damaging skill goes off again at 50% | 4–6% | W, O, N, R |
| `sw_socket` | +1 socket of a kind the slot allows, past the rarity maximum | 1 | any |
| `sw_main_attr` | +x% to your class's main attribute | 4–6% | any |
| `sw_pair` | +x% damage with a two-tag pair (as `of Mastery`, §7.3, but stronger) | 12–20% | W, O, N, R |
| `sw_falling_star` | 6% chance on hit to drop a falling star: 3 m circle, 100% weapon damage as Arcane (once per 2 s) | fixed | W, O, H |
| `sw_orbit` | a small star circles you at 1.5 m and hits what it touches for 20% weapon damage as Arcane every 0.5 s | fixed | C, Sh, B |
| `sw_barrier` | after 10 s without taking damage, gain a barrier of x% of maximum health | 5–8% | C, L, Sh, B |
| `sw_fortune` | +x% item rarity and +y% item quantity | 10–15% / 4–6% | N, R, H, B |
| `sw_dodge` | +1 dodge charge (one extra charge from all sources at most) | 1 | F, L, Wa |
| `sw_stride` | +x% move speed | 5–8% | F, L, Wa, B |

### 5.4 Drop chance

A special rarity is rolled **after** the item's rarity, on every eligible drop (Uncommon or better, not tool
or mount). Chance per eligible item:

| Source | Chance an eligible item is special |
|---|---|
| Open-world ordinary enemy | 0.4% |
| Champion pack member | 1.0% |
| Rare (yellow) | 2.5% |
| Gilded / Warded chest | 1.5% / 3% |
| Normal dungeon boss (sub-boss, boss, end) | 1.5% |
| Challenge boss | 4% |
| Depth boss drops | the boss rows above |
| **Depth Cache** item | page 12 §2.4.6's column: 0.2% at reward depth 0, rising in a straight line to 4% at reward depth 40 |
| World boss chest | 3%; the boss's **favoured** special rarity ×3 (9%) and the other four ×1.5 (page 13 §5) |
| Secret boss | 8% |
| Gambler crate | 0.5% |
| Quest rewards, vendors, crafting | never |

**Which one:** Electrified 24 · Twinned 24 · Living 20 · Starwoven 16 · Ancient 16 (Ancient's weight is 0
below ilvl 40 and the others share it). **Item rarity** (§14) raises the chance at half effect:
`chance × (1 + itemRarity / 2)`.

### 5.5 Greater-rarity monsters drop their match

Monster rarities are page 10's. A monster carrying a **greater rarity** that page 10 **maps** to a special
rarity drops **that** special rarity at **×5 its base chance** (the other four roll normally). Page 10's
mapping:

| Special rarity | Greater rarities mapped to it (page 10 owns the list and ids) |
|---|---|
| `sr_electrified` | Electrified, Stormborn |
| `sr_starwoven` | Tear-touched, Spectral, Warded |
| `sr_twinned` | Twin, Splitting, Echoing |
| `sr_ancient` | Giant, Colossal, Ironclad, Ancient, Frozen |
| `sr_living` | Venomous, Plagued, Vampiric, Undying, Enraged |

A monster with two greater rarities (a Giant Electrified ogre) gets both boosts. World bosses name a
**favoured** special rarity instead (page 13 §5, §5.4 above).

*Worked example:* an **Electrified champion** drops an eligible Rare. Its special chance is 1.0% (§5.4), of
which Electrified's share is 24% → 0.24%, ×5 = **1.2% Electrified**; Twinned 0.24%, Living 0.20%, Starwoven
0.16% and Ancient 0.16% roll as normal — **1.96%** special in total, 61% of it Electrified.

---

## 6. Stats and units

### 6.1 The unit rule

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

### 6.2 Primary stats on items

| Stat | Unit | What it does (page 05 owns the maths) | Origin |
|---|---|---|---|
| `str`, `dex`, `int`, `con` | flat | canon attributes; weapon scaling and health (page 07) | reuse |
| `dmg` | flat | added to weapon dice after the level term | reuse |
| `armor` | flat | physical mitigation | reuse |
| `resistAll` | flat | mitigation against fire, ice, lightning, poison, shadow, arcane, holy, nature | reuse (`magicResist`, renamed) |
| `hp` | flat | maximum health | reuse |
| `resource` | flat | maximum resource; see §6.4 | reuse (`mp`, renamed) |
| `hpRegen` / `resourceRegen` | flat | per second | reuse |
| `spellPower` | frac | multiplies spell damage (applied once — page 05 owns where) | reuse |
| `healPower` | frac | multiplies healing done | new |
| `critChance` / `critDamage` | pct | chance / bonus on a critical hit | reuse |
| `attackSpeed` | pct | weapon swing rate | reuse |
| `castSpeed` | pct | shortens cast bars and channels | new |
| `cooldownReduction` | pct | spells come back sooner | reuse |
| `moveSpeed` | frac | run speed (not mounted) | new as an affix |
| `dodge` | pct | chance to evade a hit that is not telegraphed | reuse |
| `blockChance` / `blockPower` | pct / flat | shields | reuse |
| `barrier` / `barrierRegen` | flat | ward and focus off hands | reuse |
| `lifeSteal` / `resourceSteal` | pct | share of damage returned | reuse |
| `tagDmg.<tag>` / `tagEff.<tag>` / `tagCdr.<tag>` | frac / frac / pct | damage, effect or cooldown recovery for anything carrying that tag (§7) | new |
| `mf_*` | pct / flat | the seven magic-find stats (§14) | reuse (`goldFind`, `xpFind`, `magicFind`) + new |
| gather speed, bonus units, rare finds, reach | — | tool stats — page 19 §6.3 owns them | reuse (Farhold `data/tools.json`) |
| `deflectChance` | pct | adds to a deflect chance you already have (page 05; the mage's Wardweaving) | new |
| `cond_*` | varies | conditional properties (the "extended" affixes) | reuse |

Farhold's `hit` (accuracy) is **not** a Wildmarch stat (dropped in Farhold R21: enemies have no dodge).

### 6.3 Gear-side totals

Per-roll caps are in §11. These are the ceilings on the **character's total** from all gear, sockets,
glyphs, sets and special rarities together (perks, talents and buffs stack above them only where page 05
says so). Magic-find caps are §14.3.

| Stat | Total from gear | | Stat | Total from gear |
|---|---|---|---|---|
| critChance | 50% | | cooldownReduction | 30% |
| critDamage | 250% | | attackSpeed | 60% |
| dodge | 35% | | castSpeed | 40% |
| blockChance | 60% | | moveSpeed | 15% |
| lifeSteal | 20% | | cond_zoneDmgReduce | 25% |
| every `…DmgReducePct` together | 40% | | every `tagDmg` bonus on one hit, summed | 150% |

### 6.4 Resource affixes for Momentum and Tempo classes

Canon §6 has three resources. `of Reserves` (+resource) and `of Replenishing` (+resource regen) read in the
wearer's own resource, so one item suits every class that can wear it:

| Class resource | 1 point of `resource` = | 1 point of `resourceRegen` = |
|---|---|---|
| Mana | 1 maximum mana | 1 mana a second |
| Momentum (builds as you hit and are hit, drains out of combat) | 0.2 maximum Momentum | +2% Momentum generated |
| Tempo (small pool that refills fast) | 0.2 maximum Tempo | +1.5% Tempo refill rate |

The card shows the line in the **viewer's** resource ("+12 maximum mana" to a mage, "+2.4 maximum Tempo" to a
rogue looking at the same item).

---

## 7. Tags on items

**(new)** Canon §12.3: every skill, basic attack, item and affix carries **tags**, and bonuses target tags.
**Page 05 owns the tag list and the rule for where a tag bonus is multiplied into a hit.** This section is
the item side: which items carry tags, which affixes grant tag bonuses, and how the card shows them.

### 7.1 The tags

The 25 tags this page uses (page 05 may add more; ids are `tag_<snake>`):

| Kind | Tags |
|---|---|
| Damage type (element) | `tag_fire`, `tag_ice`, `tag_lightning`, `tag_poison`, `tag_holy`, `tag_shadow`, `tag_arcane`, `tag_nature`, `tag_physical` |
| What it is | `tag_attack` (weapon-driven), `tag_spell` (spell-power-driven), `tag_basic_attack` (the weapon's own swing or shot, and skills that count as one) |
| How it reaches | `tag_melee`, `tag_ranged`, `tag_projectile`, `tag_area`, `tag_channel` |
| What it leaves | `tag_duration` (anything with a timer: damage over time, buffs, zones), `tag_trap`, `tag_minion` (pets, bound and controlled bodies), `tag_aura`, `tag_curse` |
| What it does for allies | `tag_heal`, `tag_shield` (barriers), `tag_movement` |

### 7.2 The rule, from the item side

- **"+x% damage with Ice"** applies to any hit that carries `tag_ice` — a skill tagged Ice, a basic attack
  whose weapon is branded ice, a quiver's Frost Arrows, a Starwoven star (Arcane) does not.
- **"+x% damage with Area Spells"** needs **both** tags on the hit (`tag_area` **and** `tag_spell`).
- A hit **inherits** the tags of what caused it: a skill's own tags, plus the element of any damage added to it
  (a Fire Arrows quiver adds `tag_fire` to the basic attack), plus `tag_duration` for the damage-over-time
  part of anything.
- Every "+x% damage with …" line on your gear that the hit qualifies for is **added together** into one tag
  bonus for that hit (ceiling 150%, §6.3); page 05 multiplies that one sum into the hit **once**. No item ever
  multiplies a tag bonus on its own — one multiplier, one owner (the Farhold lesson).
- **Basic attacks** carry `tag_attack` + `tag_basic_attack` + `tag_melee` or `tag_ranged` (+ `tag_projectile`
  for bows, crossbows, thrown weapons) + `tag_physical` or the weapon's element. **Wand bolts and staff
  charged casts** carry `tag_basic_attack` + `tag_spell` + `tag_ranged` + `tag_projectile` + their element
  (page 05 confirms; flagged there).

### 7.3 Affixes that grant tag bonuses

The full rows and ranges are in §11. In short:

| Affix family | Lines | Where it rolls |
|---|---|---|
| Element prefixes (9) | Searing (Fire), Frigid (Ice), Crackling (Lightning), Toxic (Poison), Blessed (Holy), Umbral (Shadow), Runed (Arcane), Verdant (Nature), Honed (Physical): **+4–8% damage with <element>** at ilvl 1, 10.3–20.7% at peerless (ilvl 54+) | weapons, off hands, hands, necklace, rings |
| Form suffixes (15) | of Arms (Attack), of Sorcery (Spell), of the Rhythm (Basic Attack), of Close Quarters (Melee), of the Long Shot (Ranged), of Flight (Projectile), of Breadth (Area), of the Held Note (Channel), of Lingering (Duration damage), of Snares (Trap), of the Retinue (Minion), of Presence (Aura effect), of Malice (Curse effect), of the Aegis (Shield strength), of the Road (Movement cooldowns) | weapons, off hands, head, shoulders, necklace, rings (Movement: feet, waist, back, jewellery) |
| **of Mastery** (pair) | **+10–20% damage with <tag> + <tag>** from ilvl 16, 18.1–36.2% at peerless; the pair is rolled with the affix from the list below | weapons, off hands, necklace, rings |

**The pairs `of Mastery` (and Starwoven's `sw_pair`) can roll**, each equally likely unless the base narrows
them (a bow never rolls a Spell pair):

| | | | |
|---|---|---|---|
| Area Spells | Projectile Spells | Channel Spells | Duration Spells |
| Fire Spells | Ice Spells | Lightning Spells | Shadow Spells |
| Arcane Spells | Nature Spells | Holy Spells | Poison Spells |
| Projectile Attacks | Melee Attacks | Area Attacks | Basic Attacks with Melee |
| Basic Attacks with Ranged | Physical Melee | Poison Attacks | Shadow Curses |
| Minion Area | Trap Area | Fire Duration | Lightning Area |

### 7.4 Bases that carry a tag bonus of their own

These are **implicit** lines (part of the base, always present, shown above the affixes):

| Base | Implicit tag line (ilvl 1 → 60, linear) | Why |
|---|---|---|
| every quiver (§9) | its own line in §9.2 (Projectile, Basic Attack, an element…) | quivers are damage stat-sticks |
| Grimoire | +6% → +12% damage with Spells | the book of spells |
| Seer's Orb | +6% → +12% damage with Projectile Spells | its motes are projectiles |
| Reliquary | +6% → +12% damage and healing with Holy | holy relic |
| Psalter | +6% → +12% healing with Heal | the healer's book |
| Effigy | +6% → +12% effect of Curse and Duration | statuses last longer |
| Hourglass | +4% → +8% cooldown recovery of Movement | time |
| Field Map | +6% → +12% damage with Minion (followers count, page 05) | orders |
| War Standard (new) | +3% → +6% effect of Aura | a banner |
| Lute / Warhorn / Hand Drum | +4% → +8% effect of Aura | songs are auras |
| Elemental wand (fire, ice, lightning, poison, shadow, arcane, holy, nature) | +6% → +12% damage with that element | the wand's element |
| Staff | +6% → +12% damage with Area Spells | charged casts fill an area |
| Longbow | +5% → +10% damage with Projectile Attacks | the archer's weapon |
| Halberd | +5% → +10% damage with Area Attacks | the 7.4 m pierce line |
| Light crossbow | +8% → +15% damage with Basic Attacks | one-handed shots |
| Throwing Satchel (new, §8.3) | its own line in §9.2 | the thrower's quiver |
| Pistol / Long Gun (new, §8.2) | +5% → +10% damage with Projectile Attacks | loud, heavy shots |

**Uniques** can carry stronger tag lines than any affix, for example a staff with **"+20% damage with Area
Spells"** (the owner's example). Page 09 §4.4 lists the new tag uniques.

### 7.5 On the card

A **Tags** line under the item level (§26) lists, in grey chips:
- on a **weapon**: the tags its own basic attacks carry ("Attack · Basic Attack · Ranged · Projectile · Physical");
- on anything with tag bonuses: the tags those bonuses target, each chip lit if **one of your equipped
  skills** carries it and dimmed if none does (so "+18% damage with Channel" on a class with no channel
  spell is visibly useless to you).

---

## 8. Bases: weapons, off hands, armour, jewellery

### 8.1 Scaling with item level

Farhold puts the level term on the **player**: `player.damagePerLevel` 0.11 multiplies the weapon's own
dice by the character's level (`js/rpg.js derive`, round 14). Wildmarch moves that term **onto the item**:

- **Weapon dice at ilvl L = base dice × (1 + 0.11 × (L − 1))**
- **Armour, block power, barrier and quiver arrow damage at ilvl L = base × (1 + 0.11 × (L − 1))**

Same curve, one owner. **Page 05 must not also apply `damagePerLevel`** — that would be the "one
multiplier, two owners" bug Farhold keeps finding.

Multiplier at key item levels: ilvl 1 → ×1.00 · 10 → ×1.99 · 20 → ×3.09 · 30 → ×4.19 · 40 → ×5.29 ·
50 → ×6.39 · **60 → ×7.49** (the top).

**Quality is removed.** Emberveil items carry a quality (low 0.7 / medium 1.0 / high 1.2 / elite 1.4 /
exotic 1.6). With item level doing that job, a third axis only confuses the card. Every Wildmarch item is
`quality: "medium"` internally (×1.0) so `loot.js` works unchanged; the bench's Temper becomes **Refine** (§17.3).

**Named bases.** Emberveil has several bases per weapon type (sword, longsword, forager_blade,
hunters_edge, dragonfang_sword…). In Wildmarch each **weapon type has one dice row**; the other bases
become **named variants**: +10% dice, one intrinsic line, their own Chibi 2 look, and a first-drop
level. "A better sword" means "a higher item level", not "a different spreadsheet row".

### 8.2 Weapon types

Swing numbers are Farhold's `js/weapons.js WEAPON_PATTERNS` (reuse); dice are `items.json` (reuse).
Page 05 owns what a pattern does; class files own which classes may use which type. "Tags" are the tags
the weapon's **basic attacks** carry (§7.2).

| Type | Base key | Hands | Category | Scales on | Dice ilvl 1 | Dice ilvl 60 | Swing every (s) | Reach (m) | Pattern | Trait (reuse) | Basic-attack tags | First drops at level |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dagger | `dagger` | 1 | light | DEX | 3–7 | 22–52 | 0.34 | 2.0 | jab, jab, slash | 10% armour pen | Attack, Basic Attack, Melee, Physical | 1 |
| Sword | `sword` | 1 | heavy | STR+DEX | 6–14 | 45–105 | 0.58 | 2.8 | slash, slash, arc | — | Attack, Basic Attack, Melee, Physical | 1 |
| Longsword | `longsword` | 1 | heavy | STR+DEX | 8–16 | 60–120 | 0.64 | 3.0 | slash, slash, overhead | — | same | 12 |
| Rapier | `rapier` | 1 | light | DEX | 5–11 | 37–82 | 0.52 | 3.3 | thrust, thrust, lunge | +8% crit | same | 6 |
| Sabre | `obsidian_scimitar` | 1 | light | DEX | 7–15 | 52–112 | 0.46 | 2.7 | slash, slash, arc | +6% crit | same | 12 |
| Axe | `battleaxe` | 1 | heavy | STR | 9–17 | 67–127 | 0.82 | 2.8 | cleave, slash, cleave | 10% bleed | same | 12 |
| Mace | `iron_mace` | 1 | heavy | STR | 9–17 | 67–127 | 0.62 | 2.4 | overhead, slash, slam | 8% stun | same | 6 |
| Hammer | `hammer` | 1 | heavy | STR | 8–16 | 60–120 | 0.66 | 2.5 | overhead, sweep, slam | 10% stun | same | 6 |
| Warhammer | `warhammer` | 1 | heavy | STR | 10–18 | 75–135 | 0.76 | 2.6 | overhead, overhead, slam | 12% stun | same | 12 |
| Sceptre | `scepter` | 1 | magic | INT | 5–12 | 37–90 | 0.64 | 2.5 | overhead, slash | off-hand OK | same | 6 |
| Wand | `wand` | 1 | magic | INT | 4–10 | 30–75 | bolt | 46 (bolt) | bolt + wand behaviour | off-hand OK, element | Basic Attack, Spell, Ranged, Projectile, its element | 1 |
| Greatsword | `greatsword` | 2 | heavy | STR | 15–29 | 112–217 | 0.96 | 4.2 | sweep, overhead, arc | STR ×1.5 | Attack, Basic Attack, Melee, Physical | 19 |
| Greataxe | `axe2h` | 2 | heavy | STR | 16–30 | 120–225 | 0.94 | 3.6 | cleave, cleave, slam | 15% bleed | same | 19 |
| Halberd | `halberd` | 2 | heavy | STR+DEX | 13–24 | 97–180 | 1.00 | 4.8 | thrust, sweep, overhead | 7.4 m pierce line | same + Area on the pierce | 19 |
| Spear | `spear` | 1 | light | STR+DEX | 8–15 | 60–112 | 0.66 | 4.0 | thrust, thrust, sweep | reach | Attack, Basic Attack, Melee, Physical | 6 |
| Quarterstaff | `quarterstaff` | 2 | light (swings) | STR+DEX | 7–14 | 52–105 | 0.48 | 3.5 | jab, sweep, jab, sweep | flow | same | 12 |
| Staff | `staff` | 2 | magic | INT | 8–20 | 60–150 | charge | 46 | charged cast (0.35–2.6 s) | INT ×1.5 | Basic Attack, Spell, Ranged, Projectile, Area (charged), its element | 6 |
| Bow | `bow` | 2 | light | DEX | 8–16 | 60–120 | 1.05 | 46 | draw 0.35–0.95 s | DEX ×1.3 | Attack, Basic Attack, Ranged, Projectile, Physical | 6 |
| Shortbow | `shortbow` | 2 | light | DEX | 6–12 | 45–90 | 0.85 | 46 | quick draw | — | same | 1 |
| Longbow | `longbow` | 2 | light | DEX | 10–19 | 75–142 | 1.15 | 55 | slow draw, ×1.1 range | implicit (§7.4) | same | 19 |
| Crossbow | `crossbow` | 2 | light | DEX+STR | 12–22 | 90–165 | 1.25 | 46 | reload 1.25 s, ×1.8 power | — | same | 12 |
| Light crossbow | `light_crossbow` | 1 | light | DEX | 7–13 | 52–97 | 0.90 reload | 40 | reload, ×1.4 power | the one-handed "hand crossbow" (Rogue, Demon Hunter, Tinker, Witch Hunter); off hand may hold a dagger or a quiver | same | 1 |
| Javelin | `javelin` | 1 | light | STR+DEX | 9–18 | 67–135 | 0.75 | 40 | thrown | returns on hit | same | 12 |
| Throwing Axe | `throwing_axe` | 1 | light | STR | 8–16 | 60–120 | 0.70 | 30 | thrown, arcing | 10% bleed; returns on hit | same | 6 · **new base (scavenger)** |
| Throwing Knives | `throwing_knives` | 1 | light | DEX | 3–7 | 22–52 | 0.36 | 28 | thrown, flat, fast | 10% armour pen | same | 1 · **new base (scavenger, rogue)** |
| Sling | `sling` | 1 | light | DEX | 5–11 | 37–82 | 0.60 | 36 | thrown stone, arcing | 6% stun on a non-boss | same | 1 · **new base (scavenger)** |
| Pistol | `pistol` | 1 | light | DEX | 8–16 | 60–120 | 1.10 reload | 32 | shot (the light-crossbow pattern, a louder report) | +15% crit damage | same | 12 · **new base (tinker)** |
| Long Gun | `long_gun` | 2 | light | DEX+STR | 14–26 | 105–195 | 1.40 reload | 50 | shot (the crossbow pattern) | ×1.8 power, like a crossbow | same | 19 · **new base (tinker)** |
| Orb (weapon) | `orb` | 1 | magic | INT | 3–8 | 22–60 | bolt | 46 | bolt | off-hand OK, INT ×1.15 | as wand | 12 |
| Tome (weapon) | `tome` | 1 | magic | INT | 2–6 | 15–45 | bolt | 46 | bolt | off-hand OK, +10 resource | as wand | 12 |
| Hand wraps | `wraps` (`it_hand_wraps`) | 2 | light | DEX+STR | 5–10 | 37–75 | 0.34 | 1.9 | jab, jab, jab (Farhold's bare-fist row) | Monk only; every 3rd jab gives +1 Breath ([classes/monk.md](classes/monk.md)) | Attack, Basic Attack, Melee, Physical | 1 |

**Named variants** (each +10% dice, keeps its Emberveil intrinsic unless noted, first drop level in
brackets): Forager's Blade (sword, 6) · Lantern Mace (mace, 6) · Pathfinder Javelin (12) · Tithe Dagger (6) ·
Roadwarden Bow (12) · Pilgrim's Staff (12) · **Cinderbrand Wand** (fire, 12; was Emberbrand Wand) · Rimecut
Sabre (ice, 12) · Bramble Staff (poison, 12) · **Hornhead Hammer** (hammer, 19; was Warhorn Maul — "Maul" is banned) · Breaker's Pick (greataxe, 19) ·
Hunter's Edge (sword, 19) · Stormpin Crossbow (lightning, 19) · Gravebound Sceptre (shadow, 28) ·
Dawnwarden Hammer (holy, 28) · Blood Ledger (greatsword, 28) · Covenant Hammer (28) · Grudgebrand (28) ·
Starwake Bow (36) · Watchfire Glaive (javelin, 36) · the Engineering guns and crossbows of page 19 §17 —
Blunderbuss (long gun, fires a 6 m cone at 70% instead of one shot, 19) · Heavy Crossbow (28) · Long Rifle (long
gun, ×1.15 range, 28) · Repeating Crossbow (every 4th shot fires twice, 36) · Tidebrass Rifle (long gun, 44) ·
Firegold Hand Cannon (pistol, 52) · Voidsteel Greatsword (40) · **Farshot Bow** (40; was
Starfall Bow, a banned name) · Abyssal Rod (staff, 40) · **Kindlewood Wand** (fire, 40; was Ember Focus) · the
six Dragonfang / Wyrmscale / Dragonbone / Drakehammer / Dragontooth bases (52).

Emberveil intrinsics that described its travel game are **replaced** on the named variants:
`cond_forageRation` → +1–3 health a second out of combat · `cond_nightWard` → +10–20% armour against the first
hit of each fight (there is no night) · `cond_extraLeg` → +4% move speed · `cond_easeExhaustion` → +1–2 health
a second · `cond_watch` → +2–4 health a second standing still · `cond_vehicleDmg` → +15–25% damage while
mounted · `cond_guardBond` → town guards near you deal +20% damage · `cond_companionExtra` → +20% follower
damage · `cond_nemesisMark` → +18% damage to whatever killed you last · `cond_killMemory` / `cond_killGrowth` →
kept (they read the weapon's own kill count). This matches what Farhold already did in `js/effects.js`.

### 8.3 Off hands

Quivers have their own section (§9). Implicit tag lines of foci and instruments are in §7.4.

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
| Seer's Orb | `seer_orb` | cloth focus | 1 | — | — | — | a mote strikes the nearest enemy within 9 m every 1.4 s for 30% of your basic-attack damage | reuse |
| Reliquary | `reliquary` | cloth focus | 3 | — | — | 10 | 25% of blows taken answer with a holy burst (60%) and heal you 4% | reuse |
| Psalter | `psalter` | cloth focus | 2 | — | — | — | +12% spell power, +8 resource | reuse |
| Effigy | `effigy` | cloth focus | 1 | — | — | — | statuses you lay last 2 s longer and do 25% more | reuse |
| Hourglass | `hourglass` (`it_hourglass`) | cloth focus | 1 | — | — | — | no base power; rolls focus affixes; Chronomancer only | new base ([classes/chronomancer.md](classes/chronomancer.md)) |
| Field Map | `field_map` (`it_field_map`) | medium focus | 2 | — | — | — | no base power; rolls focus affixes; never swings; Tactician only | new base ([classes/tactician.md](classes/tactician.md)) |
| War Standard | `war_standard` (`it_war_standard`) | medium focus | 3 | — | — | — | no base power; rolls focus affixes; drawn as a short banner pole held upright (page 17: new held part `standard`) | **new base (round 2)** — for page 12's "banner" off hands |
| Lute | `lute` (`it_lute`) | light instrument | 1 | — | — | — | **beat 0.75 s**; song radius 20 m; +8% spell healing; Bard only | new base ([classes/bard.md](classes/bard.md) §2.2) |
| Warhorn | `warhorn` (`it_warhorn`) | light instrument | 1 | — | — | — | **beat 0.9 s**; song radius 26 m; songs cost +0.1% of maximum Tempo a second more; Bard only | new base |
| Hand Drum | `hand_drum` (`it_hand_drum`) | light instrument | 1 | — | — | — | **beat 0.6 s**; song radius 16 m; verse timer 3.0 → 2.6 s; Bard only | new base |
| Quivers | see §9 | light | — | — | — | — | arrow damage + an implicit tag line; some carry a basic-attack effect | reuse (`js/gear.js`), widened |
| Throwing Satchel | see §9.5 | light | — | — | — | — | the thrown-weapon quiver: throw damage + an implicit tag line; some carry a basic-attack effect | **new base (round 2)** ([classes/scavenger.md](classes/scavenger.md)) |

The **Buckler** is the Swashbuckler's parrying off hand ([classes/swashbuckler.md](classes/swashbuckler.md)); it
also suits any light-armour class that may hold a shield.

### 8.4 Armour bases

Armour numbers at ilvl 1 are `items.json` (reuse); ilvl 60 is ×7.49 (rounded). `dodgeBonus` (reuse)
is the dodge penalty heavy armour carries. New rows fill the three new slots and the cloth hands/feet
Emberveil never had.

| Slot | Cloth | Light | Medium | Heavy |
|---|---|---|---|---|
| Head | Hood `cloth_helm` 1 → 7 | Leather Cap `light_helm` 3 → 22 | Chain Coif `medium_helm` 5 → 37 (−1 dodge) | War Helm `heavy_helm` 8 → 60 (−2) · Plate Helm `plate_helm` 10 → 75 (−3, from 19) |
| Shoulders (new) | Mantle `cloth_shoulders` 1 → 7 | Spaulders `light_shoulders` 2 → 15 | Chain Pauldrons `medium_shoulders` 4 → 30 (−1) | Plate Pauldrons `heavy_shoulders` 6 → 45 (−1) |
| Chest | Robes `cloth_chest` 2 → 15 | Leather Armor `light_chest` 6 → 45 | Chain Shirt `medium_chest` 10 → 75 (−2) · Scaled Hauberk `scaled_chest` 13 → 97 (−2, from 19) | Plate Armor `heavy_chest` 16 → 120 (−4) · Runed Cuirass `runed_chest` 20 → 150 (−4, from 28) |
| Hands | Wraps `cloth_hands` (new) 1 → 7 | Leather Gauntlets `light_gauntlets` 3 → 22 · Bracers `light_bracers` (new) 2 → 15 | Chain Gauntlets `medium_gauntlets` 5 → 37 (−1) · Vambraces `medium_bracers` (new) 4 → 30 | Plate Gauntlets `heavy_gauntlets` 6 → 45 (−1) · Runed `runed_gauntlets` 8 → 60 (from 28) · Plate Vambraces `heavy_bracers` (new) 5 → 37 |
| Waist (new) | Rope Sash `cloth_waist` 1 → 7 | Leather Belt `light_waist` 2 → 15 | Studded Belt `medium_waist` 3 → 22 | Iron Girdle `heavy_waist` 5 → 37 (−1) |
| Legs | Linen Leggings `cloth_legs` 1 → 7 | Leather Legs `light_legs` 4 → 30 | Chain Legs `medium_legs` 7 → 52 (−1) · Scaled Greaves `scaled_legs` 9 → 67 (from 19) | Plate Legs `heavy_legs` 11 → 82 (−3) · Runed Greaves `runed_legs` 14 → 105 (from 28) |
| Feet | Slippers `cloth_feet` (new) 1 → 7 | Leather Boots `light_boots` 3 → 22 | Chain Boots `medium_boots` 5 → 37 (−1) | Plate Boots `heavy_boots` 7 → 52 (−2) · Runed Sabatons `runed_boots` 9 → 67 (from 28) |
| Back (new, one weight) | Travel Cloak `cloak` 2 → 15, any class · Warden's Cape `cape` 3 → 22 (from 12) · **Spire Mantle** `spire_cloak` 4 → 30 (from 58; was "Mantle of the Veil" `veil_cloak`) | | | |

The bracer bases (new) are the hands slot's second look, so the **wrists** items page 12 wrote have a base
(§2.3). The dragon armour bases (`dragonscale_cloth`, `wyrmscale_helm`, `wyrmscale_chest`, `dragonsteel_chest`,
`dragonhide_legs`, `dragonclaw_gauntlets`) become named variants from level 52, +10% armour.

### 8.5 Jewellery bases

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

## 9. Quivers

`(reuse: prototypes/farhold/js/gear.js GEAR_BASES quiver_* — "quivers add damage, not armour")` Canon §12.3:
a quiver is a **damage stat-stick** for bows and crossbows, worn in the off hand, on par with a caster's focus.
Some quivers add an **effect to basic attacks only**. **(changed and widened)**

### 9.1 Rules

| Rule | Value |
|---|---|
| Who can wear one | anyone holding a **bow, shortbow, longbow, crossbow, light crossbow, pistol or long gun** (the two-hander rule makes an exception for quivers, Farhold R22; with a gun the quiver is drawn as a **shot pouch**). With any other weapon it gives nothing. Thrown weapons use the **Throwing Satchel** (§9.5) |
| What every quiver gives | **arrow damage** (a flat number added to each basic-attack arrow or bolt, scaled by item level like weapon dice, §8.1) **and one implicit tag line** (§9.2) |
| Basic-attack effect | **at most one** per quiver. Some bases have one built in; a quiver whose base has none may roll one at Rare (25%) or Epic (50%); Uniques and Legendaries carry their own |
| Where the effect works | **only** on basic attacks and on skills tagged **Basic Attack** (`tag_basic_attack`, page 05). A skill that is not tagged Basic Attack never gets it, however many arrows it fires |
| Random affixes | the off-hand pool (`O` in §11) plus the tag affixes; **never** barrier, block or spell power |
| Sockets | as any off hand (§13.1) |
| Sources | `npc_fletcher` (Common/Uncommon, bases up to your level), world drops (off-hand weight), dungeon tables, the bench's `forge_quiver`, Leatherworking (page 19) |
| Engineering fittings | an Engineer's **quiver fitting** (page 19 §17.6) adds a **weaker** effect to a quiver that has none (Flaming, Barbed, Frost-tipped, Splitting, Bursting, at page 19's numbers). A dropped effect (§9.3) is always the stronger version, and a fitting cannot replace one |

### 9.2 Quiver bases

| Base | id | Arrow damage ilvl 1 → 60 | Implicit line (ilvl 1 → 60) | Built-in effect | First drop | Origin |
|---|---|---|---|---|---|---|
| Hide Quiver | `quiver` | +3 → +22 | +4% → +8% damage with Projectile Attacks | — | 1 | reuse |
| Hunter's Quiver | `quiver_hunter` | +4 → +30 | +3% → +6% critical chance with Basic Attacks | — | 12 | new |
| Broadhead Quiver | `quiver_broadhead` | +5 → +37 | +4% → +8% damage with Physical | Barbed Heads | 12 | new |
| Pitch Quiver | `quiver_pitch` | +4 → +30 | +4% → +8% damage with Fire | Fire Arrows | 12 | reuse (was `quiver_ember` "Ember Quiver", renamed) |
| Rime Quiver | `quiver_rime` | +4 → +30 | +4% → +8% damage with Ice | Frost Arrows | 12 | reuse |
| Bolt Case | `quiver_bolt_case` | +6 → +45 | +5% → +10% damage with Basic Attacks (crossbows only) | Heavy Heads | 12 | new |
| Splitshaft Quiver | `quiver_split` | +2 → +15 | +4% → +8% damage with Area Attacks | Multi-shot | 20 | reuse |
| Seeker Quiver | `quiver_seeker` | +3 → +22 | +4% → +8% damage with Projectile Attacks | Seeking | 20 | reuse |
| Stormfletch Quiver | `quiver_storm` | +4 → +30 | +4% → +8% damage with Lightning | Storm Arrows | 28 | new |
| Burstshot Quiver | `quiver_burst` | +3 → +22 | +4% → +8% damage with Area | Exploding Arrows | 28 | reuse |
| Bodkin Quiver | `quiver_bodkin` | +5 → +37 | +5% → +10% armour penetration with Basic Attacks | Piercing | 36 | new |
| Gravewood Quiver | `quiver_grave` | +4 → +30 | +4% → +8% damage with Shadow | Shadowed Shafts | 36 | new |
| Sunfletch Quiver | `quiver_sun` | +4 → +30 | +4% → +8% damage with Holy | Blessed Arrows | 44 | new |

### 9.3 Basic-attack effects

Every number is a share of **the basic attack's own hit** unless it says otherwise. Each effect adds the tags
shown to the hits it touches (§7.2), so a Fire Arrows quiver makes a bow's basic attacks count as Fire.

| id | Effect | What it does | Tags it adds |
|---|---|---|---|
| `qv_fire_arrows` | Fire Arrows | +25% of the hit added as Fire damage; the target **Burns** for 40% of the hit over 4 s (a new arrow refreshes it) | Fire, Duration |
| `qv_frost_arrows` | Frost Arrows | +20% of the hit added as Ice damage; the target is **Chilled** (−25% move speed for 3 s; bosses −10%) | Ice |
| `qv_storm_arrows` | Storm Arrows | 20% of arrows release lightning that jumps to up to 2 more enemies within 8 m for 50% each | Lightning |
| `qv_venom_arrows` | Venom Arrows | **Poison** for 45% of the hit over 6 s, stacking up to 3 | Poison, Duration |
| `qv_barbed` | Barbed Heads | **Bleed** for 50% of the hit over 5 s; +20% if the target moved in that time | Physical, Duration |
| `qv_exploding` | Exploding Arrows | every **3rd** basic attack bursts on impact: 60% of the hit to every **other** enemy within 3 m | Area, Fire |
| `qv_multishot` | Multi-shot | each basic attack fires **2 extra arrows** at 35% each in a 20° fan; one enemy is never hit twice by one shot | — |
| `qv_piercing` | Piercing | arrows pass through up to **2** enemies, −20% damage for each enemy already passed | — |
| `qv_seeking` | Seeking | arrows turn up to 25° toward your hard target (Tab target, page 02); +10% critical chance against a moving target | — |
| `qv_ricochet` | Ricochet | an arrow that hits bounces once to another enemy within 10 m for 50% | — |
| `qv_heavy` | Heavy Heads | +20% damage; knocks a non-boss back 1 m; basic attacks 10% slower | Physical |
| `qv_rapid` | Rapid Nock | basic attacks 12% faster; −5% damage | — |
| `qv_blessed` | Blessed Arrows | +20% of the hit added as Holy damage; +25% damage against undead and demons | Holy |
| `qv_shadow` | Shadowed Shafts | +20% of the hit added as Shadow damage; the target is **Weakened** (−5% damage dealt, 4 s) | Shadow |
| `qv_volley` | Volley | every **6th** basic attack also looses 5 arrows at 40% each in a 30° fan (legendary and unique quivers only) | Area |

### 9.4 How a quiver compares with a focus

At item level 60, against the same character's basic attacks (page 05 owns the maths; these are the targets
the numbers were chosen for):

| Off hand | What it adds to basic-attack output | What else |
|---|---|---|
| Grimoire (wand) | every 3rd bolt a page at 60% ≈ **+20%** | spells cost 15% less, +12 resource |
| Seer's Orb (wand) | a 30% mote every 1.4 s ≈ **+18%** at a 0.7 s bolt rhythm | — |
| Hide Quiver (longbow, 75–142 dice, avg 108) | +22 per arrow ≈ **+20%** | +8% Projectile Attacks |
| Pitch Quiver (longbow) | +30 per arrow ≈ +28%, plus Fire Arrows (+25% as Fire, 40% burn) | Fire tag on every arrow |
| Splitshaft Quiver (shortbow) | +15 per arrow and two 35% side arrows ≈ **+20%** on one target, far more on packs | +8% Area Attacks |

A quiver and a focus both land around **+20% of basic-attack output** before affixes, with the effect or the
focus power on top — that is the parity canon asks for.

### 9.5 Throwing Satchels

A **Throwing Satchel** is the quiver of thrown weapons (javelin, throwing axe, throwing knives, sling) and follows
every rule of §9.1: **throw damage** (flat, added to each thrown basic attack), one implicit tag line, at most one
basic-attack effect from §9.3 (Multi-shot throws extra knives or stones, Exploding makes the axe burst, and so on),
working **only** on basic attacks and skills tagged Basic Attack. The Scavenger's thrown junk spells are tagged
Basic Attack ([classes/scavenger.md](classes/scavenger.md)), so a satchel's effect reaches them.

| Base | id | Throw damage ilvl 1 → 60 | Implicit line (ilvl 1 → 60) | Built-in effect | First drop |
|---|---|---|---|---|---|
| Canvas Satchel | `satchel` | +3 → +22 | +4% → +8% damage with Projectile Attacks | — | 1 |
| Tinker's Satchel | `satchel_tinker` | +2 → +15 | +4% → +8% damage with Area Attacks | Exploding Arrows (reads "Exploding Throws") | 20 |
| Bandolier Satchel | `satchel_bandolier` | +2 → +15 | +5% → +10% attack speed with Basic Attacks | Multi-shot (reads "Fan of Blades") | 20 |
| Barbed Satchel | `satchel_barbed` | +4 → +30 | +4% → +8% damage with Physical | Barbed Heads | 28 |
| Pitch Satchel | `satchel_pitch` | +4 → +30 | +4% → +8% damage with Fire | Fire Arrows (reads "Fire Pots") | 36 |

Sources: `npc_fletcher`, world drops at the off-hand weight, dungeon tables, Leatherworking.

---

## 10. Tools and the tool slot

`(reuse: prototypes/farhold/js/tools.js + data/tools.json — Farhold R16's Tool slot)` Canon §12.3: **anyone can
Harvest** with the **right tool in the tool slot**, on one shared **Harvesting** skill. **Page 19 §6 owns the tools**
— six kinds (pick, sickle, hatchet, skinning knife, rod, pry bar), six tiers (**Flint** 9, **Iron** 12, **Redsteel**
20, **Blacksteel** 30, **Lodestone** 42, **Firegold** 52), the **tool roll** pouch, automatic swapping on `E`, tool
rarity and the tool-only affixes. This page owns only what a tool is **as an item**:

| Rule | Value |
|---|---|
| Slot | the **tool** slot (§2.1): one tool at a time; the rest live in the tool roll (page 19 §6.2) |
| Item level | a tool's required level is its tier's level (above); it is its item level |
| Rarity | Common → Epic from vendors, Engineering and drops; **Unique** tools from world bosses and secret bosses (page 09 §4.5 lists them) |
| Combat | **no combat stats, no combat affixes** — nobody's fighting numbers depend on a tool |
| Sockets | **gadget sockets only**: Uncommon 0–1, Rare 1, Epic and above 2 (§13.1); gadgets with an Artisan core (page 19 §17.2) are made for them |
| Special rarities | never on a tool (§5.1) |
| Average item level | tools are not counted |
| Price | vendor tools at page 19's prices; dropped and crafted tools by the §22.1 formula with `base` 20 |
| Trade | tradeable (§15) |
| Tool uniques from Farhold | `uq_prospectors_pick` (power `prospector`) and `uq_quick_hands` (power `quick_hands`) return — they were dropped in round 1 with the tool slot (page 09 §4.5) |

---

## 11. The affix table

`(reuse: prototypes/emberveil/data/items.json affixes, restated by prototypes/farhold/js/affixes.js)`

Emberveil files affixes in four groups (11 prefixes, 8 suffixes, 5 shield, 40 extended). Farhold
retunes every one (`AFFIX_TUNING`), caps them (`AFFIX_CAP`), restricts the odd ones to certain slots
(`SLOT_RULES`), and adds `of Early Promise` plus the slot-only mount affixes (`js/gear.js SLOT_AFFIXES`).
Wildmarch takes all of that, drops `of Accuracy` and the three light affixes, retunes a few caps for group play,
renames the clashing and banned names, and adds the round-2 families: **4 magic-find**, **9 element tag**,
**15 form tag**, **1 tag pair** and **1 deflect** affix. **Tool affixes are page 19's** (§6.3 there: Prospector's,
Swift, Bountiful, Keen-eyed, Diligent, Steady, Long-hafted) and roll only on tools. **109 affixes** here. (The generated table below is the data; the tier ranges are computed from it with the
§3.3 formula, never typed by hand.)

**How to read it.**
- **Name** is what the item's title uses: a prefix goes before the base ("Deadly Longsword"), an
  `of …` suffix after it ("… of Vitality"). With several affixes the title uses the highest-rolled
  prefix and suffix only (reuse: Emberveil naming). A special rarity's word replaces the prefix (§5.1).
- **Level-1 roll** is the crude-tier range. **Min ilvl** is the lowest item level it can appear on.
- **Growth** 3 is the default; 1.7 for `frac` stats; other values are per-row overrides.
- **Allowed slots**: `all` = every weapon, off-hand, armour and jewellery slot (never tool or mount).
  W = main hand (and an off-hand weapon), O = off hand, H head, Sh shoulders, C chest, B back, Ha hands,
  Wa waist, L legs, F feet, N necklace, R either ring, **M mount**. "physical/magic weapons" use
  Emberveil's `physicalOnly` / `magicOnly` flags.
- **Cap** is the ceiling on **one roll**, applied again after any crafting (reuse). The character-total
  ceilings are §6.3; the magic-find caps are §14.3.
- An affix may appear **once per item**. Two different affixes on the same stat may both appear.
- **Mount** rolls only its four mount affixes plus `of_str/dex/int/con`, `of_hp` and `of_magic_resist`.
  **Tool** rolls only page 19's tool affixes.

### 11.1 Every affix

| # | id | Name | Stat | Unit | Level-1 roll | Min ilvl | Growth | Allowed slots | Cap (one roll) | Origin / note |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `of_str` | Sturdy | `str` | flat | 2–5 | 1 | 4.5 | all | — | reuse |
| 2 | `of_dex` | Swift | `dex` | flat | 2–5 | 1 | 4.5 | all | — | reuse |
| 3 | `of_int` | Wise | `int` | flat | 2–5 | 1 | 4.5 | all | — | reuse |
| 4 | `of_con` | Hardy | `con` | flat | 2–5 | 1 | 4.5 | all | — | reuse |
| 5 | `sharp` | Sharp | `dmg` | flat | 2–5 | 1 | 6 | W (physical weapons only) | — | reuse |
| 6 | `sturdy` | Reinforced | `armor` | flat | 2–5 | 1 | 5 | all | — | reuse |
| 7 | `of_hp` | of Vitality | `hp` | flat | 8–22 | 1 | 5 | all | — | reuse |
| 8 | `of_mp` | of Reserves | `resource` | flat | 6–16 | 1 | 3 | all | — | reuse; renamed from "of Focus" (Focus is a banned resource name); reads in your resource (§6.4) |
| 9 | `of_magic_resist` | of Warding | `resistAll` | flat | 3–9 | 1 | 3 | all | — | reuse |
| 10 | `of_mana_regen` | of Replenishing | `resourceRegen` | flat | 0.6–1.6 | 2 | 3 | all | — | reuse |
| 11 | `hp_regen` | of Mending | `hpRegen` | flat | 2–8 | 2 | 3 | all | — | reuse |
| 12 | `potency` | Potent | `spellPower` | frac | 5%–18% | 3 | 1.7 | W (magic), O (focus/ward), N | 150% | reuse |
| 13 | `crit_chance` | Deadly | `critChance` | pct | 4%–9% | 3 | 3 | W, Ha, N | 60% | reuse |
| 14 | `crit_damage` | Savage | `critDamage` | pct | 12%–25% | 3 | 3 | W, Ha, N | 250% | reuse |
| 15 | `of_dodge` | of Evasion | `dodge` | pct | 3%–7% | 2 | 3 | all | 45% | reuse |
| 16 | `of_speed` | of Haste | `attackSpeed` | pct | 6%–14% | 2 | 2 | W, Ha, N, R | 60% | reuse; stored as % directly |
| 17 | `lifeSteal` | Leeching | `lifeSteal` | pct | 3%–8% | 5 | 3 | W, N, R | 25% | reuse |
| 18 | `manaSteal` | Siphoning | `resourceSteal` | pct | 3%–8% | 5 | 3 | W, N, R | 25% | reuse |
| 19 | `of_gold` | of Fortune | `mf_gold` | pct | 10%–25% | 1 | 3 | H, B, Wa, N, R | 100% | reuse; now a magic-find stat (§14) |
| 20 | `xp_gain` | of Learning | `mf_xp` | pct | 5%–12% | 4 | 3 | H, B, N, R | 25% | reuse; magic-find stat; does nothing at level 60 |
| 21 | `magic_find_adv` | of Discovery | `mf_rarity` | pct | 6%–12% | 4 | 3 | H, B, N, R | 45% | reuse; magic-find stat; per-roll cap 150 -> 45 (the character cap is §14.3) |
| 22 | `cdr` | of Swiftcasting | `cooldownReduction` | pct | 5%–12% | 6 | 3 | N, R, H, Sh | 30% | reuse |
| 23 | `block_chance` | Bulwark | `blockChance` | pct | 6%–15% | 1 | 3 | O (shield) | 65% | reuse |
| 24 | `block_power` | Bracing | `blockPower` | flat | 12–50 | 1 | 3 | O (shield) | — | reuse |
| 25 | `shield_magic_resist` | Spellguard | `resistAll` | flat | 6–16 | 1 | 3 | O (shield), C, L - medium/heavy only | — | reuse |
| 26 | `barrier_size` | Wardstone | `barrier` | flat | 8–32 | 3 | 3 | O (ward/focus) | — | reuse |
| 27 | `barrier_regen` | Conduit | `barrierRegen` | flat | 2–8 | 3 | 3 | O (ward/focus) | — | reuse |
| 28 | `dmg_vs_undead` | of Banishing | `cond_dmgVsUndead` | frac | 15%–35% | 6 | 1.7 | N, R, W | 75% | reuse |
| 29 | `dmg_vs_demons` | of Exorcism | `cond_dmgVsDemon` | frac | 15%–35% | 6 | 1.7 | N, R, W | 75% | reuse |
| 30 | `kill_rally` | of the Reaper | `cond_killInitBonus` | frac | 8%–16% | 8 | 1.7 | N, R, F | 60% | reuse |
| 31 | `speed_on_hit` | of Alacrity | `cond_speedOnFirstHit` | frac | 8%–18% | 8 | 1.7 | N, R, F | 50% | reuse |
| 32 | `poison_stack` | of Necrosis | `cond_poisonStackPower` | frac | 20%–40% | 8 | 1.7 | N, R, W | 150% | reuse |
| 33 | `fire_vs_poison` | of Ignition | `cond_fireDmgVsPoisoned` | frac | 15%–30% | 8 | 1.7 | N, R, W | 100% | reuse |
| 34 | `cold_vs_burn` | of Rime | `cond_coldDmgVsBurning` | frac | 15%–30% | 8 | 1.7 | N, R, W | 100% | reuse |
| 35 | `lightning_vs_slow` | of the Storm | `cond_lightningVsSlowed` | frac | 15%–30% | 8 | 1.7 | N, R, W | 100% | reuse |
| 36 | `poison_vs_burn` | Venomous | `cond_poisonDmgVsBurning` | frac | 15%–30% | 8 | 1.7 | N, R, W | 100% | reuse |
| 37 | `magic_vs_status` | of the Void Shard | `cond_magicDmgVsAnyStatus` | frac | 12%–26% | 8 | 1.7 | N, R, W | 100% | reuse |
| 38 | `low_hp_dmg` | of Desperation | `cond_dmgBelowHpThresh` | frac | 15%–30% | 6 | 1.7 | N, R, C, W | 100% | reuse |
| 39 | `focus_dmg` | of Persistence | `cond_consecutiveHitDmg` | frac | 8%–16% | 8 | 1.7 | N, R, W | 50% | reuse |
| 40 | `crit_armorpen` | of Rending | `cond_critArmorPen` | frac | 25%–45% | 8 | 1.7 | N, R, W | 75% | reuse |
| 41 | `dot_resist` | of the Sealed Skin | `cond_dotDmgReduce` | frac | 15%–30% | 6 | 1.7 | N, R, C, H | 60% | reuse |
| 42 | `phys_dmg_reduce` | of the Bulwark | `cond_physDmgReducePct` | frac | 8%–15% | 6 | 1.7 | N, R, C, L | 30% | reuse |
| 43 | `magic_dmg_reduce` | of the Hearthward | `cond_magicDmgReducePct` | frac | 8%–15% | 6 | 1.7 | N, R, C, L | 30% | reuse |
| 44 | `execute` | of Execution | `cond_executeDmgPct` | frac | 20%–40% | 8 | 1.7 | N, R, W | 100% | reuse |
| 45 | `sustained_dmg` | of Endurance | `cond_sustainedDmgBonus` | frac | 10%–22% | 8 | 1.7 | N, R, W | 100% | reuse |
| 46 | `mana_shield` | of the Mana Ward | `cond_manaShieldOnHit` | frac | 12%–25% | 8 | 1.7 | N, R, C, O | 30% | reuse |
| 47 | `gold_on_elite` | of the Plunderer | `cond_goldOnEliteKill` | frac | 15%–40% | 4 | 1.7 | N, R, H | 100% | reuse; adds to gold find on champions, rares and bosses only |
| 48 | `first_hit_crit` | of Opening | `cond_firstHitCritBonus` | pct | 12%–22% | 8 | 3 | N, R, W, O | 40% | reuse |
| 49 | `ambush_bonus` | of the Waylayer | `cond_ambushDmgFlat` | flat | 8–20 | 6 | 3 | N, R, W | — | reuse; renamed from "of Ambush" (Ambush is a banned ability name); extra damage on your first hit against an enemy that has not noticed you |
| 50 | `combat_barrier` | of the Vanguard | `cond_combatStartBarrier` | flat | 12–32 | 8 | 3 | N, R, C, O | — | reuse |
| 51 | `hp_on_kill` | of the Glutton | `cond_hpOnKill` | flat | 5–15 | 4 | 3 | N, R, Ha, W | — | reuse |
| 52 | `party_hp_on_kill` | of the Benefactor | `cond_partyHpOnKill` | flat | 3–8 | 8 | 3 | N, R | — | reuse; heals party members and followers within 30 m |
| 53 | `thorns_flat` | Spiked | `cond_thornsFlat` | flat | 4–12 | 4 | 3 | N, R, C, Ha, O | — | reuse |
| 54 | `mana_on_attack` | of the Tap | `cond_manaOnAttack` | flat | 1–3 | 4 | 3 | N, R, W | — | reuse |
| 55 | `mana_on_crit` | of Brilliance | `cond_manaOnCrit` | flat | 2–6 | 6 | 3 | N, R, W | — | reuse |
| 56 | `low_mana_regen` | of the Wellspring | `cond_lowManaRegenBonus` | flat | 0.5–1.5 | 6 | 3 | N, R | — | reuse |
| 57 | `skill_cost_reduce` | of Efficiency | `cond_skillMpCostReduce` | flat | 1–4 | 6 | 3 | N, R, H | — | reuse |
| 58 | `burn_extend` | of Conflagration | `cond_burnExtend` | flat | 1–2.5 | 8 | 3 | N, R, W | — | reuse (seconds) |
| 59 | `bleed_on_crit` | of Laceration | `cond_bleedOnCrit` | frac | 30%–60% | 8 | 1.7 | N, R, W | 120% | share of the crit as bleed over 6 s (Farhold fixed in round 28) |
| 60 | `after_skill_sp` | of Resonance | `cond_afterSkillSpellPow` | frac | 5%–12% | 8 | 1.7 | N, R, W, O | 40% | a share, not points (Farhold fixed in round 28) |
| 61 | `early_promise` | of Early Promise | `cond_levelReqReduce` | flat | 2–4 | 4 | 2.5 | N, R | 12 | reuse (Farhold-only affix) |
| 62 | `set_piece_bonus` | of the Covenant | `cond_extraSetPiece` | flag | yes | 10 | 1 | N, R | — | reuse; not on set pieces |
| 63 | `set_threshold_low` | of Kinship | `cond_setThresholdReduce` | flag | yes | 10 | 1 | N, R | — | reuse; renamed from "of Attunement" (attunement is a banned word); not on set pieces |
| 64 | `cheat_death` | of Second Wind | `cond_cheatDeath` | frac | 20% | 12 | 1 | N, R | 20% | survive at 20% health, every 90 s (Farhold fixed in round 28) |
| 65 | `heal_power` | Merciful | `healPower` | frac | 5%–15% | 3 | 1.7 | W, O, N, C, H | 150% | new - the healer's "Potent" |
| 66 | `cast_speed` | Fluent | `castSpeed` | pct | 3%–6% | 6 | 2 | W, Ha, N, R | 40% | new |
| 67 | `swiftfoot` | Fleet | `moveSpeed` | frac | 3%–6% | 5 | 1.2 | F | 15% | new - feet only; not while mounted |
| 68 | `threat` | Provoking | `cond_threatMult` | frac | 10%–20% | 5 | 1.7 | O (shield), H, C, N, R - heavy/medium only | 100% | new - tanks |
| 69 | `groundward` | of Sure Footing | `cond_zoneDmgReduce` | frac | 5%–10% | 20 | 1.7 | F, N, R | 25% | new - less from void and danger zones; never from a one-shot |
| 70 | `named_slayer` | of the Headsman | `cond_dmgVsNamed` | frac | 4%–8% | 10 | 1.7 | W, N, R | 40% | new - champions, rares, bosses |
| 71 | `heal_received` | of Succour | `cond_healReceived` | frac | 5%–10% | 6 | 1.7 | C, Wa, N, R | 40% | new |
| 72 | `dodge_recover` | of the Tumbler | `cond_dodgeCooldown` | flat | 0.1–0.3 | 15 | 1.5 | F, Wa | 1 | new - seconds off the dodge cooldown |
| 73 | `potion_power` | of the Apothecary | `cond_potionPower` | frac | 10%–20% | 4 | 1.7 | Wa | 60% | new |
| 74 | `follower_might` | of the Pack | `cond_companionMight` | frac | 10%–20% | 6 | 1.7 | N, R, B | 100% | new; stat renamed from cond_companionFury (Fury is banned) - pets, bound/controlled bodies, followers |
| 75 | `interrupt_cd` | of the Silencer | `cond_interruptCooldown` | frac | 8%–15% | 20 | 1.7 | Ha, N, R | 30% | new |
| 76 | `deflect` | of Deflection | `deflectChance` | pct | 1%–3% | 10 | 3 | O (ward/focus), H, Sh, C | 12% | new (round 2) - adds to a deflect chance you already have (the mage's Wardweaving, page 05); does nothing alone |
| 77 | `mf_quantity` | of Plenty | `mf_quantity` | pct | 2%–5% | 6 | 3 | B, Wa, N, R | 20% | new (round 2) - item quantity (§14) |
| 78 | `mf_rep` | of Good Standing | `mf_rep` | pct | 3%–6% | 6 | 3 | B, N, R | 25% | new (round 2) - reputation gain |
| 79 | `mf_prof_skill` | of the Artisan | `mf_prof_skill` | flat | 1–3 | 9 | 3 | N, R | 12 | new (round 2) - +N effective profession skill (page 19 §4) |
| 80 | `mf_prof_xp` | of Diligence | `mf_prof_xp` | pct | 2%–5% | 9 | 3 | N, R | 20% | new (round 2) - profession XP gain (page 19 §4) |
| 81 | `tag_fire_dmg` | Searing | `tagDmg.tag_fire` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - +% damage with Fire |
| 82 | `tag_ice_dmg` | Frigid | `tagDmg.tag_ice` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - Ice |
| 83 | `tag_lightning_dmg` | Crackling | `tagDmg.tag_lightning` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - Lightning |
| 84 | `tag_poison_dmg` | Toxic | `tagDmg.tag_poison` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - Poison |
| 85 | `tag_holy_dmg` | Blessed | `tagDmg.tag_holy` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - Holy |
| 86 | `tag_shadow_dmg` | Umbral | `tagDmg.tag_shadow` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - Shadow |
| 87 | `tag_arcane_dmg` | Runed | `tagDmg.tag_arcane` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - Arcane |
| 88 | `tag_nature_dmg` | Verdant | `tagDmg.tag_nature` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - Nature |
| 89 | `tag_physical_dmg` | Honed | `tagDmg.tag_physical` | frac | 4%–8% | 4 | 1.7 | W, O, Ha, N, R | 40% | new - Physical |
| 90 | `tag_attack_dmg` | of Arms | `tagDmg.tag_attack` | frac | 5%–10% | 6 | 1.7 | W, O, H, Sh, N, R | 45% | new - Attack |
| 91 | `tag_spell_dmg` | of Sorcery | `tagDmg.tag_spell` | frac | 5%–10% | 6 | 1.7 | W, O, H, Sh, N, R | 45% | new - Spell |
| 92 | `tag_basic_dmg` | of the Rhythm | `tagDmg.tag_basic_attack` | frac | 6%–12% | 6 | 1.7 | W, O, H, Sh, N, R | 55% | new - Basic Attack |
| 93 | `tag_melee_dmg` | of Close Quarters | `tagDmg.tag_melee` | frac | 5%–10% | 6 | 1.7 | W, O, H, Sh, N, R | 45% | new - Melee |
| 94 | `tag_ranged_dmg` | of the Long Shot | `tagDmg.tag_ranged` | frac | 5%–10% | 6 | 1.7 | W, O, H, Sh, N, R | 45% | new - Ranged |
| 95 | `tag_projectile_dmg` | of Flight | `tagDmg.tag_projectile` | frac | 5%–10% | 6 | 1.7 | W, O, H, Sh, N, R | 45% | new - Projectile |
| 96 | `tag_area_dmg` | of Breadth | `tagDmg.tag_area` | frac | 5%–10% | 6 | 1.7 | W, O, H, Sh, N, R | 45% | new - Area |
| 97 | `tag_channel_dmg` | of the Held Note | `tagDmg.tag_channel` | frac | 6%–12% | 10 | 1.7 | W, O, H, Sh, N, R | 55% | new - Channel |
| 98 | `tag_duration_dmg` | of Lingering | `tagDmg.tag_duration` | frac | 5%–10% | 6 | 1.7 | W, O, H, Sh, N, R | 45% | new - damage over time from Duration skills |
| 99 | `tag_trap_dmg` | of Snares | `tagDmg.tag_trap` | frac | 6%–12% | 10 | 1.7 | W, O, H, Sh, N, R | 55% | new - Trap |
| 100 | `tag_minion_dmg` | of the Retinue | `tagDmg.tag_minion` | frac | 6%–12% | 10 | 1.7 | W, O, H, Sh, N, R | 55% | new - Minion (pets, bound/controlled bodies) |
| 101 | `tag_aura_eff` | of Presence | `tagEff.tag_aura` | frac | 3%–6% | 12 | 1.7 | O, H, Sh, N, R | 25% | new - +% effect of Aura skills |
| 102 | `tag_curse_eff` | of Malice | `tagEff.tag_curse` | frac | 3%–6% | 12 | 1.7 | W, O, H, N, R | 25% | new - +% effect of Curse skills |
| 103 | `tag_shield_eff` | of the Aegis | `tagEff.tag_shield` | frac | 4%–8% | 8 | 1.7 | W, O, C, H, N, R | 40% | new - +% strength of Shield skills (barriers you cast) |
| 104 | `tag_movement_cdr` | of the Road | `tagCdr.tag_movement` | pct | 5%–10% | 8 | 2 | F, Wa, B, N, R | 30% | new - Movement skills come back sooner |
| 105 | `tag_combo_dmg` | of Mastery | `tagDmg.<pair>` | frac | 7%–14% | 16 | 1.7 | W, O, N, R | 60% | new - +% damage with a two-tag pair (§7.3); the pair is rolled with the affix |
| 106 | `surefoot` | Surefooted | `cond_mountSlope` | frac | 15%–35% | 1 | 1.7 | M | 70% | reuse |
| 107 | `longwind` | Long-winded | `cond_mountStamina` | flat | 6–18 | 1 | 3 | M | 60 | reuse (seconds of gallop) |
| 108 | `trample` | Trampling | `cond_mountTrample` | flat | 4–14 | 4 | 3 | M | 60 | reuse |
| 109 | `calm` | Calm | `cond_mountCalm` | frac | 15%–40% | 3 | 1.7 | M | 80% | reuse |

### 11.2 Ranges by tier

The roll for each tier (item level where the tier starts in brackets). "—" = the affix cannot roll on an item
that low (its min ilvl is above the whole tier). Per-roll caps already applied. `frac` values are shown as
percentages.

| id | crude (1) | plain (8) | fine (16) | superior (24) | exquisite (34) | masterful (44) | peerless (54) |
|---|---|---|---|---|---|---|---|
| `of_str` | 2–5 | 3.1–7.6 | 4.2–10.6 | 5.6–14 | 7.1–17.8 | 8.9–22.2 | 10.4–26 |
| `of_dex` | 2–5 | 3.1–7.6 | 4.2–10.6 | 5.6–14 | 7.1–17.8 | 8.9–22.2 | 10.4–26 |
| `of_int` | 2–5 | 3.1–7.6 | 4.2–10.6 | 5.6–14 | 7.1–17.8 | 8.9–22.2 | 10.4–26 |
| `of_con` | 2–5 | 3.1–7.6 | 4.2–10.6 | 5.6–14 | 7.1–17.8 | 8.9–22.2 | 10.4–26 |
| `sharp` | 2–5 | 3.4–8.5 | 5–12.5 | 6.8–17 | 8.8–22 | 11.2–28 | 13.2–33 |
| `sturdy` | 2–5 | 3.2–7.9 | 4.5–11.2 | 6–15 | 7.7–19.2 | 9.7–24.2 | 11.3–28.3 |
| `of_hp` | 8–22 | 12.7–34.8 | 18–49.5 | 24–66 | 30.7–84.3 | 38.7–106.3 | 45.3–124.7 |
| `of_mp` | 6–16 | 8.1–21.6 | 10.5–28 | 13.2–35.2 | 16.2–43.2 | 19.8–52.8 | 22.8–60.8 |
| `of_magic_resist` | 3–9 | 4.1–12.2 | 5.2–15.8 | 6.6–19.8 | 8.1–24.3 | 9.9–29.7 | 11.4–34.2 |
| `of_mana_regen` | 0.6–1.6 | 0.8–2.2 | 1.1–2.8 | 1.3–3.5 | 1.6–4.3 | 2–5.3 | 2.3–6.1 |
| `hp_regen` | 2–8 | 2.7–10.8 | 3.5–14 | 4.4–17.6 | 5.4–21.6 | 6.6–26.4 | 7.6–30.4 |
| `potency` | 5%–18% | 6%–21.6% | 7.1%–25.7% | 8.4%–30.2% | 9.8%–35.3% | 11.5%–41.5% | 12.9%–46.6% |
| `crit_chance` | 4%–9% | 5.4%–12.2% | 7%–15.8% | 8.8%–19.8% | 10.8%–24.3% | 13.2%–29.7% | 15.2%–34.2% |
| `crit_damage` | 12%–25% | 16.2%–33.8% | 21%–43.8% | 26.4%–55% | 32.4%–67.5% | 39.6%–82.5% | 45.6%–95% |
| `of_dodge` | 3%–7% | 4.1%–9.5% | 5.2%–12.2% | 6.6%–15.4% | 8.1%–18.9% | 9.9%–23.1% | 11.4%–26.6% |
| `of_speed` | 6%–14% | 7.4%–17.3% | 9%–21% | 10.8%–25.2% | 12.8%–29.9% | 15.2%–35.5% | 17.2%–40.1% |
| `lifeSteal` | 3%–8% | 4.1%–10.8% | 5.2%–14% | 6.6%–17.6% | 8.1%–21.6% | 9.9%–25% | 11.4%–25% |
| `manaSteal` | 3%–8% | 4.1%–10.8% | 5.2%–14% | 6.6%–17.6% | 8.1%–21.6% | 9.9%–25% | 11.4%–25% |
| `of_gold` | 10%–25% | 13.5%–33.8% | 17.5%–43.8% | 22%–55% | 27%–67.5% | 33%–82.5% | 38%–95% |
| `xp_gain` | 5%–12% | 6.8%–16.2% | 8.8%–21% | 11%–25% | 13.5%–25% | 16.5%–25% | 19%–25% |
| `magic_find_adv` | 6%–12% | 8.1%–16.2% | 10.5%–21% | 13.2%–26.4% | 16.2%–32.4% | 19.8%–39.6% | 22.8%–45% |
| `cdr` | 5%–12% | 6.8%–16.2% | 8.8%–21% | 11%–26.4% | 13.5%–30% | 16.5%–30% | 19%–30% |
| `block_chance` | 6%–15% | 8.1%–20.2% | 10.5%–26.2% | 13.2%–33% | 16.2%–40.5% | 19.8%–49.5% | 22.8%–57% |
| `block_power` | 12–50 | 16.2–67.5 | 21–87.5 | 26.4–110 | 32.4–135 | 39.6–165 | 45.6–190 |
| `shield_magic_resist` | 6–16 | 8.1–21.6 | 10.5–28 | 13.2–35.2 | 16.2–43.2 | 19.8–52.8 | 22.8–60.8 |
| `barrier_size` | 8–32 | 10.8–43.2 | 14–56 | 17.6–70.4 | 21.6–86.4 | 26.4–105.6 | 30.4–121.6 |
| `barrier_regen` | 2–8 | 2.7–10.8 | 3.5–14 | 4.4–17.6 | 5.4–21.6 | 6.6–26.4 | 7.6–30.4 |
| `dmg_vs_undead` | 15%–35% | 18%–41.9% | 21.4%–49.9% | 25.2%–58.8% | 29.4%–68.7% | 34.5%–75% | 38.8%–75% |
| `dmg_vs_demons` | 15%–35% | 18%–41.9% | 21.4%–49.9% | 25.2%–58.8% | 29.4%–68.7% | 34.5%–75% | 38.8%–75% |
| `kill_rally` | — | 9.6%–19.2% | 11.4%–22.8% | 13.4%–26.9% | 15.7%–31.4% | 18.4%–36.9% | 20.7%–41.4% |
| `speed_on_hit` | — | 9.6%–21.6% | 11.4%–25.7% | 13.4%–30.2% | 15.7%–35.3% | 18.4%–41.5% | 20.7%–46.6% |
| `poison_stack` | — | 24%–47.9% | 28.5%–57% | 33.6%–67.2% | 39.3%–78.5% | 46.1%–92.1% | 51.7%–103.5% |
| `fire_vs_poison` | — | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% |
| `cold_vs_burn` | — | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% |
| `lightning_vs_slow` | — | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% |
| `poison_vs_burn` | — | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% |
| `magic_vs_status` | — | 14.4%–31.2% | 17.1%–37.1% | 20.2%–43.7% | 23.6%–51% | 27.6%–59.9% | 31%–67.3% |
| `low_hp_dmg` | 15%–30% | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–69.1% | 38.8%–77.6% |
| `focus_dmg` | — | 9.6%–19.2% | 11.4%–22.8% | 13.4%–26.9% | 15.7%–31.4% | 18.4%–36.9% | 20.7%–41.4% |
| `crit_armorpen` | — | 30%–53.9% | 35.6%–64.1% | 42%–75% | 49.1%–75% | 57.6%–75% | 64.7%–75% |
| `dot_resist` | 15%–30% | 18%–35.9% | 21.4%–42.8% | 25.2%–50.4% | 29.4%–58.9% | 34.5%–60% | 38.8%–60% |
| `phys_dmg_reduce` | 8%–15% | 9.6%–18% | 11.4%–21.4% | 13.4%–25.2% | 15.7%–29.4% | 18.4%–30% | 20.7%–30% |
| `magic_dmg_reduce` | 8%–15% | 9.6%–18% | 11.4%–21.4% | 13.4%–25.2% | 15.7%–29.4% | 18.4%–30% | 20.7%–30% |
| `execute` | — | 24%–47.9% | 28.5%–57% | 33.6%–67.2% | 39.3%–78.5% | 46.1%–92.1% | 51.7%–100% |
| `sustained_dmg` | — | 12%–26.4% | 14.3%–31.4% | 16.8%–37% | 19.6%–43.2% | 23%–50.7% | 25.9%–56.9% |
| `mana_shield` | — | 14.4%–30% | 17.1%–30% | 20.2%–30% | 23.6%–30% | 27.6%–30% | 30% |
| `gold_on_elite` | 15%–40% | 18%–47.9% | 21.4%–57% | 25.2%–67.2% | 29.4%–78.5% | 34.5%–92.1% | 38.8%–100% |
| `first_hit_crit` | — | 16.2%–29.7% | 21%–38.5% | 26.4%–40% | 32.4%–40% | 39.6%–40% | 40% |
| `ambush_bonus` | 8–20 | 10.8–27 | 14–35 | 17.6–44 | 21.6–54 | 26.4–66 | 30.4–76 |
| `combat_barrier` | — | 16.2–43.2 | 21–56 | 26.4–70.4 | 32.4–86.4 | 39.6–105.6 | 45.6–121.6 |
| `hp_on_kill` | 5–15 | 6.8–20.2 | 8.8–26.2 | 11–33 | 13.5–40.5 | 16.5–49.5 | 19–57 |
| `party_hp_on_kill` | — | 4.1–10.8 | 5.2–14 | 6.6–17.6 | 8.1–21.6 | 9.9–26.4 | 11.4–30.4 |
| `thorns_flat` | 4–12 | 5.4–16.2 | 7–21 | 8.8–26.4 | 10.8–32.4 | 13.2–39.6 | 15.2–45.6 |
| `mana_on_attack` | 1–3 | 1.4–4.1 | 1.8–5.2 | 2.2–6.6 | 2.7–8.1 | 3.3–9.9 | 3.8–11.4 |
| `mana_on_crit` | 2–6 | 2.7–8.1 | 3.5–10.5 | 4.4–13.2 | 5.4–16.2 | 6.6–19.8 | 7.6–22.8 |
| `low_mana_regen` | 0.5–1.5 | 0.7–2 | 0.9–2.6 | 1.1–3.3 | 1.4–4.1 | 1.6–4.9 | 1.9–5.7 |
| `skill_cost_reduce` | 1–4 | 1.4–5.4 | 1.8–7 | 2.2–8.8 | 2.7–10.8 | 3.3–13.2 | 3.8–15.2 |
| `burn_extend` | — | 1.4–3.4 | 1.8–4.4 | 2.2–5.5 | 2.7–6.8 | 3.3–8.2 | 3.8–9.5 |
| `bleed_on_crit` | — | 35.9%–71.9% | 42.8%–85.5% | 50.4%–100.8% | 58.9%–117.8% | 69.1%–120% | 77.6%–120% |
| `after_skill_sp` | — | 6%–14.4% | 7.1%–17.1% | 8.4%–20.2% | 9.8%–23.6% | 11.5%–27.6% | 12.9%–31% |
| `early_promise` | 2–4 | 2.6–5.2 | 3.2–6.5 | 4–8 | 4.8–9.7 | 5.8–11.7 | 6.7–12 |
| `set_piece_bonus` | — | yes | yes | yes | yes | yes | yes |
| `set_threshold_low` | — | yes | yes | yes | yes | yes | yes |
| `cheat_death` | — | 20% | 20% | 20% | 20% | 20% | 20% |
| `heal_power` | 5%–15% | 6%–18% | 7.1%–21.4% | 8.4%–25.2% | 9.8%–29.4% | 11.5%–34.5% | 12.9%–38.8% |
| `cast_speed` | 3%–6% | 3.7%–7.4% | 4.5%–9% | 5.4%–10.8% | 6.4%–12.8% | 7.6%–15.2% | 8.6%–17.2% |
| `swiftfoot` | 3%–6% | 3.4%–6.8% | 3.9%–7.8% | 4.4%–8.9% | 5%–10.1% | 5.8%–11.5% | 6.4%–12.7% |
| `threat` | 10%–20% | 12%–24% | 14.3%–28.5% | 16.8%–33.6% | 19.6%–39.3% | 23%–46.1% | 25.9%–51.7% |
| `groundward` | — | — | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25% |
| `named_slayer` | — | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `heal_received` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% |
| `dodge_recover` | — | 0.1–0.4 | 0.1–0.4 | 0.2–0.5 | 0.2–0.6 | 0.2–0.6 | 0.2–0.7 |
| `potion_power` | 10%–20% | 12%–24% | 14.3%–28.5% | 16.8%–33.6% | 19.6%–39.3% | 23%–46.1% | 25.9%–51.7% |
| `follower_might` | 10%–20% | 12%–24% | 14.3%–28.5% | 16.8%–33.6% | 19.6%–39.3% | 23%–46.1% | 25.9%–51.7% |
| `interrupt_cd` | — | — | 11.4%–21.4% | 13.4%–25.2% | 15.7%–29.4% | 18.4%–30% | 20.7%–30% |
| `deflect` | — | 1.4%–4.1% | 1.8%–5.2% | 2.2%–6.6% | 2.7%–8.1% | 3.3%–9.9% | 3.8%–11.4% |
| `mf_quantity` | 2%–5% | 2.7%–6.8% | 3.5%–8.8% | 4.4%–11% | 5.4%–13.5% | 6.6%–16.5% | 7.6%–19% |
| `mf_rep` | 3%–6% | 4.1%–8.1% | 5.2%–10.5% | 6.6%–13.2% | 8.1%–16.2% | 9.9%–19.8% | 11.4%–22.8% |
| `mf_prof_skill` | — | 1.4–4.1 | 1.8–5.2 | 2.2–6.6 | 2.7–8.1 | 3.3–9.9 | 3.8–11.4 |
| `mf_prof_xp` | — | 2.7%–6.8% | 3.5%–8.8% | 4.4%–11% | 5.4%–13.5% | 6.6%–16.5% | 7.6%–19% |
| `tag_fire_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_ice_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_lightning_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_poison_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_holy_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_shadow_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_arcane_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_nature_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_physical_dmg` | 4%–8% | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_attack_dmg` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% |
| `tag_spell_dmg` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% |
| `tag_basic_dmg` | 6%–12% | 7.2%–14.4% | 8.5%–17.1% | 10.1%–20.2% | 11.8%–23.6% | 13.8%–27.6% | 15.5%–31% |
| `tag_melee_dmg` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% |
| `tag_ranged_dmg` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% |
| `tag_projectile_dmg` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% |
| `tag_area_dmg` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% |
| `tag_channel_dmg` | — | 7.2%–14.4% | 8.5%–17.1% | 10.1%–20.2% | 11.8%–23.6% | 13.8%–27.6% | 15.5%–31% |
| `tag_duration_dmg` | 5%–10% | 6%–12% | 7.1%–14.3% | 8.4%–16.8% | 9.8%–19.6% | 11.5%–23% | 12.9%–25.9% |
| `tag_trap_dmg` | — | 7.2%–14.4% | 8.5%–17.1% | 10.1%–20.2% | 11.8%–23.6% | 13.8%–27.6% | 15.5%–31% |
| `tag_minion_dmg` | — | 7.2%–14.4% | 8.5%–17.1% | 10.1%–20.2% | 11.8%–23.6% | 13.8%–27.6% | 15.5%–31% |
| `tag_aura_eff` | — | 3.6%–7.2% | 4.3%–8.5% | 5%–10.1% | 5.9%–11.8% | 6.9%–13.8% | 7.8%–15.5% |
| `tag_curse_eff` | — | 3.6%–7.2% | 4.3%–8.5% | 5%–10.1% | 5.9%–11.8% | 6.9%–13.8% | 7.8%–15.5% |
| `tag_shield_eff` | — | 4.8%–9.6% | 5.7%–11.4% | 6.7%–13.4% | 7.9%–15.7% | 9.2%–18.4% | 10.3%–20.7% |
| `tag_movement_cdr` | — | 6.2%–12.3% | 7.5%–15% | 9%–18% | 10.7%–21.3% | 12.7%–25.3% | 14.3%–28.7% |
| `tag_combo_dmg` | — | — | 10%–20% | 11.8%–23.5% | 13.7%–27.5% | 16.1%–32.2% | 18.1%–36.2% |
| `surefoot` | 15%–35% | 18%–41.9% | 21.4%–49.9% | 25.2%–58.8% | 29.4%–68.7% | 34.5%–70% | 38.8%–70% |
| `longwind` | 6–18 | 8.1–24.3 | 10.5–31.5 | 13.2–39.6 | 16.2–48.6 | 19.8–59.4 | 22.8–60 |
| `trample` | 4–14 | 5.4–18.9 | 7–24.5 | 8.8–30.8 | 10.8–37.8 | 13.2–46.2 | 15.2–53.2 |
| `calm` | 15%–40% | 18%–47.9% | 21.4%–57% | 25.2%–67.2% | 29.4%–78.5% | 34.5%–80% | 38.8%–80% |

### 11.3 Affix counts by slot and a worked example

| Rarity | Weapon / armour / off hand | Rings, necklace | Back | Tool (page 19 §6.3) | Mount |
|---|---|---|---|---|---|
| Common | 0 | 0 | 0 | 0 | 0 |
| Uncommon | 1–2 (50/50) | 2–3 | 1–2 | 1 | 1 |
| Rare | 3 | 4 | 3 | 2 | 2 |
| Epic | 4 | 5 | 5 | 3 | 3 |
| Starwoven (any) | +1 from the Starwoven pool (§5.3) | +1 | +1 | — | — |

The roller picks affixes by weight: attributes, damage, armour, health and resistance weigh **5**; tag
affixes **2**; every conditional and every magic-find affix weighs **1** (reuse: `balance.json
loot.plainWeight 5 / exoticWeight 1` — without this, a weapon almost never rolled plain damage because most of
the pool is conditionals). Personal loot then **leans toward your loot focus** (§15.1): an affix whose stat is
your class's main attribute, or whose tag appears on one of your equipped skills, weighs ×2.

*Example — an Epic longsword, ilvl 44 (masterful tier, `mult` 3.3):* **"Deadly Longsword of Execution"**
- dice 8–16 × 5.73 (§8.1) = **46–92 damage**
- `sharp`: 2–5 × (1 + 2.3 × 6/3 = 5.6) = 11–28 → rolled **+23 damage**
- `crit_chance`: 4–9 × 3.3 = 13.2–29.7 → rolled **+21% critical chance**
- `of_str`: 2–5 × (1 + 2.3 × 4.5/3 = 4.45) = 8.9–22.3 → rolled **+17 STR**
- `execute` (frac, growth 1.7): 0.2–0.4 × (1 + 2.3 × 1.7/3 = 2.30) = 46–92%, per-roll cap 100% → rolled
  **+43% damage to targets below 25% health**

If the same longsword had rolled **Twinned**, each of the four values would have been the higher of two rolls
(for example `crit_chance` 18.4% and 26.0% → **26.0%**). If it had rolled **Ancient 114%**, the dice would be
53–106 (+15%) and every value ×1.14 (`crit_chance` 21% → **23.9%**).

---

## 12. Uniques, sets and legendaries — the three named kinds

All three are **named items with a fixed identity**, written in data (page 09 or a class file), never
invented by the roller. The table is the definition every other page uses.

| | Unique | Set piece | Legendary |
|---|---|---|---|
| **What it is** | A named item with fixed lines and one **minor power** — a proc or a rider that makes the item interesting without changing how you play | A named piece belonging to a set of 4 or 6; wearing 2/4/6 pieces of one set turns on **set bonuses** | A named item with a **major power** that changes how you play: moves you, rewrites a spell, interacts with a boss telegraph, cheats death |
| **Colour** | `#ff5a3c` | `#2fc4b2` | `#c86bff` + shimmer |
| **Lines** | 2–3 fixed + 1 random-range + power | 2 fixed + 1 random-range | 3 fixed + 1–2 random-range + power |
| **Power size** | a Farhold round-23 power (`js/effects.js U23`): chains, stacking damage over time, auras, "every 3rd swing" | 2-piece: stats · 4-piece: a mechanic · 6-piece: a bigger mechanic or a spell rewrite (class sets) | bigger than any unique; often has a cooldown and a visible effect |
| **Where they come from** | the world pool (any kill of the right level, 0.45% of drops) **and** listed sources | only the set's listed sources (dungeon, Challenge boss, Depth Cache, world boss, vendor, crafting) | listed sources, plus a small world pool from level 20 (0.05% of drops) |
| **Limit worn** | any number (a unique ring cannot be worn twice) | any number of sets at once | **two at a time**; a third will not equip and the card says why |
| **Trade** | tradeable (§15) | tradeable | tradeable |
| **Scales?** | yes — a unique drops at the level of what dropped it (its item level scales its lines); its listed level is the lowest it can drop at | fixed item level by source | fixed item level by source; world-pool ones scale like uniques |
| **Salvage** | always leaves Resonant Dust | always leaves Resonant Dust | Dust + 1 Tear-glass at ilvl 58+ |
| **Farhold reuse** | `data/uniques.json` (189) + `js/uniques.js` | `items.json sets` (54: 24 generic + 30 class) + `FOCUS_SETS` | new tier; Farhold's 24 original "legendary effects" + 48 round-23 powers are the base vocabulary |

### 12.1 Set bonus rules

- Bonuses switch on at **2, 4 and 6 pieces** (4-piece sets: 2 and 4). Each bonus includes the ones below it.
- Pieces of one set may be any mix of slots the set lists; a set lists exactly as many pieces as its
  top bonus (a set never has "spare" pieces). Two rings of one set may both be worn.
- `of the Covenant` (`cond_extraSetPiece`): the ring counts as 2 pieces of every set you wear (reuse).
  `of Kinship` (`cond_setThresholdReduce`, was "of Attunement"): every set bonus comes on 1 piece early (reuse).
  Neither can roll on a set piece. Both together cannot take a 6-piece bonus below 4 real pieces.
- **Class set tokens** (`it_token_<slot>`, page 12 §2.7): a token from a Challenge end boss or a Depth Cache
  turns into the looter's own class set piece for that slot (page 09 §3). A token is an item, tradeable like any
  other; it turns into the piece for whoever uses it.
- Farhold's `activationPieces` + `legendaryEffect` on a set (the set's power at full count) becomes the
  **top bonus** in Wildmarch's format.
- The card lists every bonus, greys the inactive ones, and names the missing pieces.

### 12.2 Legendary rules

- **Two legendaries equipped at most.** A legendary weapon in each hand counts as two.
- A legendary's power is **always on the card in full numbers** (Farhold `describe()` sentence, generated
  from the same constant the code uses — never typed twice).
- No extraction: a legendary's power cannot be moved to another item. (Souls, §13.6, are the one way to add a
  power of your own choosing to an item.)
- The first time a character loots each legendary, the whole party sees a centre-screen banner
  "Name looted **Legendary Name**" and hears `loot_legendary` (page 17).
- **Bad-luck protection** (no currency): every boss kill that gives you **no legendary** adds +2% (relative)
  to your legendary chance on the next boss of the same difficulty, up to +100%; a legendary resets it. World
  bosses use +10% per chest with no legendary.

---

## 13. Sockets: gems, jewels, souls and gadgets

**(new)** Not in Farhold. Canon §12.3: an item can have **sockets** of four kinds, and what you put in them is
most of the endgame (§3.4).

| Kind | What goes in | In one line | Pip on the doll and card |
|---|---|---|---|
| **Gem** | a gem (`gem_`) | a small fixed stat; **what it gives depends on the slot** (armour / weapon / jewellery) | a diamond, white `#e8e8e8` |
| **Jewel** | a jewel (`jwl_`) | rolls **its own affixes and rarity**; the strongest thing you can add, and hard to find right | a hexagon, gold `#ffcf5a` |
| **Soul** | a soul (`soul_`) | adds **a new behaviour**, like a legendary power; may need a class, role or build | a teardrop, rose `#e07aa0` |
| **Gadget** | a gadget (`gdg_`) | made by an Engineer; **the crafter chooses its stats** from a menu | a cog, brass `#c8a24a` |

### 13.1 Which items get sockets

**Count by rarity** (a dropped item; crafting can add one more, §13.2):

| Rarity | Most sockets | Chance of at least 1 | Chance of a 2nd (if the most is 2+) |
|---|---|---|---|
| Common | 0 | — | — |
| Uncommon | 1 | 10% | — |
| Rare | 1 | 20% | — |
| Epic | 2 | 30% | 25% |
| Unique | 2 | 40% | 25% |
| Set | 1 | 35% | — |
| Legendary | 2 | 50% | 35% |

- **Two-handed weapons** may hold **one more** than the table.
- **Source multipliers** on the chances: Challenge boss ×1.5 · world-boss chest ×1.25 · Depth Cache ×(1 + 0.02 × reward depth).
- **Twinned** rolls the count twice and keeps the higher; **Starwoven's** `sw_socket` and **Living** Growth 5
  can add one past the table (§5).
- **Tool**: gadget sockets only (§10). **Mount**: none.

**Kind by rarity** — a socket can only be a kind the item's rarity allows:

| Kind | Allowed from | Other limits |
|---|---|---|
| Gem | Uncommon | — |
| Jewel | Rare | — |
| Soul | Epic (and Unique, Set, Legendary) | item level 30+; **at most one soul socket per item**; only the slots marked in §2.1 |
| Gadget | Uncommon | never on necklace or rings |

**Kind by slot** — when a socket is rolled, its kind is picked by these weights (kinds the rarity or slot does not
allow drop out and the rest share their weight):

| Slot | Gem | Jewel | Soul | Gadget |
|---|---|---|---|---|
| Main hand, off hand | 45 | 30 | 12 | 13 |
| Head, chest, legs | 50 | 28 | 10 | 12 |
| Hands, feet | 55 | 25 | 8 | 12 |
| Shoulders, back, waist | 57 | 26 | 5 | 12 |
| Necklace, rings | 45 | 40 | 15 | 0 |
| Tool | 0 | 0 | 0 | 100 |

**Active limits per character:** **3 souls** active at once (a fourth socketed soul is greyed, "Inactive — 3 souls
already active"); each **unique jewel** once. Gems, ordinary jewels and gadgets have no limit beyond the sockets
you have.

### 13.2 Adding sockets (a crafting action)

Page 19 owns the professions and their recipes (these five actions are requested for its Jewelcrafting,
Engineering and Enchanting ladders); this is the item side. **Each item may have one socket added in its
whole life** (the card marks it "added"), and never past the rarity's "most sockets" (§13.1). Anyone can bring an
item to a crafter of the right profession (the trade window has a "Commission" tab, page 15).

| Action | Profession and skill | What it does | Allowed on | Materials (× band cost, §17.3) | Gold (× band cost) |
|---|---|---|---|---|---|
| Bore a Gem Socket | Jewelcrafting 75 | +1 gem socket | Uncommon+, any socketable slot | 1 Resonant Dust | 50 |
| Set a Jewel Mount | Jewelcrafting 175 | +1 jewel socket | Rare+ | 3 Resonant Dust | 250 |
| Fit a Gadget Port | Engineering 100 | +1 gadget socket | Uncommon+, not jewellery | 4 Scrap Iron, 1 Bound Essence | 80 |
| Open a Soul Socket | Enchanting 225 | +1 soul socket | Epic+, ilvl 30+, a soul-capable slot with no soul socket yet | 5 Resonant Dust, 2 Tear-glass | 1,000 |
| Recut a Socket | Jewelcrafting 250 | change one **empty** socket to another kind the item allows | any socketed item; once per item | 2 Resonant Dust | 300 |

### 13.3 Removing what is in a socket

| Socketable | What happens when you take it out | Cost | Where |
|---|---|---|---|
| **Gem** | comes back **whole** | free | any Jeweller (`npc_jeweller`) or a Jewelcrafter; a Jewelcrafter can also do it on their own items anywhere |
| **Jewel** | comes back **whole** | 10% of the jewel's own price (§22.1), at least 50 gold | Jeweller or Jewelcrafter |
| **Soul** | comes back **whole** | 500 gold + 25 gold × your level (2,000 at 60) | Enchanter (`npc_enchanter`) or an Enchanter by profession; page 19's **Soul transfer** moves a soul straight from one item to another for the same price |
| **Gadget** | **destroyed** (1–3 Scrap Iron come back) | free | anyone, anywhere, out of combat |

- Socketing into a **full** socket is refused ("Take the gem out first"). Nothing is ever destroyed by accident.
- **Salvaging** an item returns its gems, jewels and souls to your bag; gadgets are destroyed.
- **Selling** an item with socketables asks first ("This sells 2 socketed items with it"); buyback returns them.
- **Trading** or mailing an item sends its socketables with it.

*Why gadgets are the one that breaks:* they are cheap, made to order, and the Engineer is supposed to have repeat
customers; every other socketable is a find you should never lose.

### 13.4 Gems

Ten gems × five grades. **A gem's effect depends on the slot it is in.** Armour values are round 1's table,
unchanged; weapon values are damage or spell-damage; jewellery values are secondary effects and magic find.
"Armour" = head, shoulders, chest, back, hands, waist, legs, feet and a shield or focus off hand; "weapon" = main
hand and an off-hand weapon or quiver; "jewellery" = necklace and rings.

Ids: `gem_<name>_<grade>`, grade 1–5 (so `gem_onyx_3` = Plain Onyx; round 1's `it_gem_onyx_3` — page 19 still
writes `it_gem_…` and should switch to the canon `gem_` prefix). Round 2 adds **Amber** and **Peridot**, so page 19's
rough gems (`mat_rough_<gem>_<grade>`) become 10 × 5 = 50. Level to socket:
**Chipped 1 · Flawed 15 · Plain 30 · Flawless 45 · Radiant 60**. Values below are Chipped / Flawed / Plain /
Flawless / Radiant.

| Gem | Armour | Weapon | Jewellery |
|---|---|---|---|
| **Bloodstone** | +STR 4 / 7 / 10 / 14 / 20 | +3 / 5 / 7 / 9 / 12% damage with Physical | +0.5 / 1 / 1.5 / 2 / 3% life steal |
| **Tigereye** | +DEX 4 / 7 / 10 / 14 / 20 | +6 / 10 / 15 / 20 / 25% critical damage | +4 / 7 / 10 / 14 / 20% **item rarity** |
| **Lapis** | +INT 4 / 7 / 10 / 14 / 20 | +3 / 5 / 7 / 9 / 12% damage with Spells | +2 / 3 / 5 / 7 / 10% **XP gain** |
| **Jade** | +CON 4 / 7 / 10 / 14 / 20 | +4 / 6 / 9 / 12 / 15% damage over time with Duration | +2 / 3 / 5 / 7 / 10% **reputation gain** |
| **Onyx** | +1 / 1.5 / 2 / 2.5 / 3% critical chance | +1.5 / 2 / 3 / 4 / 5% critical chance | +4 / 7 / 10 / 14 / 20% critical damage |
| **Moonstone** | +1 / 1.5 / 2 / 2.5 / 3% haste (attack and cast speed) | +1.5 / 2.5 / 3.5 / 4.5 / 6% haste | +1 / 1.5 / 2 / 2.5 / 3% cooldown recovery |
| **Garnet** | +6 / 10 / 15 / 21 / 30 resistance to all elements | +3 / 5 / 7 / 10 / 14% of each hit added as Fire | +5 / 8 / 12 / 17 / 25% **gold find** |
| **Pearl** | +1.5 / 2 / 3 / 4 / 5% healing done | +2 / 3 / 4.5 / 6 / 8% healing done | +1 / 2 / 3 / 4 / 5% **item quantity** |
| **Amber** (new) | +20 / 45 / 80 / 130 / 200 health | +3 / 5 / 7 / 9 / 12% damage with Nature and Poison | +3 / 5 / 8 / 11 / 15% **profession XP gain** |
| **Peridot** (new) | +1 / 1.5 / 2 / 2.5 / 3% dodge | +3 / 5 / 7 / 9 / 12% damage with Area | +1 / 2 / 3 / 4 / 5 **profession skill** (`mf_prof_skill`) |

**Combining:** three gems of one kind and grade + gold → one of the next grade, at a Jeweller: **50 / 200 / 800 /
3,000** gold (Chipped→Flawed … Flawless→Radiant). A Jewelcrafter combines for no gold.

**Gem sources:** rares 4% · champions 1% · Normal dungeon bosses 10% · Challenge bosses 20% · world-boss chests
25% · Gilded / Warded chests 8% / 15% · **Jewelcrafters** cut rough gems from Mining (page 19 §15) · the Jeweller
sells Chipped and Flawed.
The grade is the highest one at or below the source's level, with a 20% chance of one grade lower.

### 13.5 Jewels

A jewel is a **small item of its own**: it has a **cut**, a **level** (1–60, the level needed to socket it), a
**rarity** and **affixes**. It is the strongest thing you can add to gear, and finding one with the right affixes
at good values is the endgame chase.

**Cuts** — the cut decides which affixes it can roll:

| Cut | id | Affix groups (§ pool below) | Drop weight |
|---|---|---|---|
| Crimson Jewel | `jwl_crimson` | attack, physical, fire, poison, shadow, melee, ranged, projectile, basic attack, critical, execute | 30 |
| Azure Jewel | `jwl_azure` | spell, ice, lightning, holy, arcane, nature, area, channel, duration, aura, curse | 30 |
| Viridian Jewel | `jwl_viridian` | defence, healing, shield, movement, minion, trap, magic find | 30 |
| Prismatic Jewel | `jwl_prismatic` | **any** | 10 |

**Rarity:**

| Rarity | Affixes | Weight | Notes |
|---|---|---|---|
| Uncommon | 1–2 | 70 | — |
| Rare | 3–4 (50/50) | 27 | — |
| Unique | fixed power + 1–2 fixed lines | 3 (0 below jewel level 30) | one of each per character (§13.1) |

Item rarity (§14) applies to this roll as it does to items. **Values** below are at jewel level 60; a lower jewel
multiplies each range by `0.25 + 0.75 × level / 60` (level 30: ×0.625). Jewel affixes follow the tag rule of §7.2.

**The jewel affix pool (36):**

| # | id | Line (range at jewel level 60) | Cut |
|---|---|---|---|
| 1 | `ja_fire` | +12–18% damage with Fire | Crimson |
| 2 | `ja_ice` | +12–18% damage with Ice | Azure |
| 3 | `ja_lightning` | +12–18% damage with Lightning | Azure |
| 4 | `ja_poison` | +12–18% damage with Poison | Crimson |
| 5 | `ja_holy` | +12–18% damage with Holy | Azure |
| 6 | `ja_shadow` | +12–18% damage with Shadow | Crimson |
| 7 | `ja_arcane` | +12–18% damage with Arcane | Azure |
| 8 | `ja_nature` | +12–18% damage with Nature | Azure |
| 9 | `ja_physical` | +10–15% damage with Physical | Crimson |
| 10 | `ja_area_spell` | +15–22% damage with Area Spells | Azure |
| 11 | `ja_projectile_attack` | +15–22% damage with Projectile Attacks | Crimson |
| 12 | `ja_melee_attack` | +15–22% damage with Melee Attacks | Crimson |
| 13 | `ja_basic_attack` | +18–26% damage with Basic Attacks | Crimson |
| 14 | `ja_channel` | +15–25% damage with Channel | Azure |
| 15 | `ja_duration` | +12–20% damage over time with Duration | Azure |
| 16 | `ja_trap` | +18–26% damage with Trap | Viridian |
| 17 | `ja_minion` | +15–25% damage with Minion | Viridian |
| 18 | `ja_aura` | +8–12% effect of Aura | Azure |
| 19 | `ja_curse` | +8–12% effect of Curse | Azure |
| 20 | `ja_spell_crit` | +6–10% critical chance with Spells | Azure |
| 21 | `ja_attack_crit_damage` | +25–40% critical damage with Attacks | Crimson |
| 22 | `ja_execute` | +20–30% damage against enemies below 30% health | Crimson |
| 23 | `ja_heal` | +10–15% healing with Heal | Viridian |
| 24 | `ja_shield` | +12–20% strength of Shield skills | Viridian |
| 25 | `ja_movement` | +10–16% cooldown recovery of Movement skills | Viridian |
| 26 | `ja_duration_length` | +6–10% duration of Duration skills | Azure |
| 27 | `ja_channel_cost` | −8–12% resource cost of Channel skills | Azure |
| 28 | `ja_health` | +3–5% maximum health | Viridian |
| 29 | `ja_area_taken` | −4–7% damage taken from Area attacks (never from a one-shot, page 11) | Viridian |
| 30 | `ja_rarity` | +10–20% item rarity | Viridian |
| 31 | `ja_quantity` | +5–8% item quantity | Viridian |
| 32 | `ja_gold` | +15–25% gold find | Viridian |
| 33 | `ja_xp` | +4–6% XP gain | Viridian |
| 34 | `ja_reputation` | +5–8% reputation gain | Viridian |
| 35 | `ja_prof_skill` | +5–15 profession skill (`mf_prof_skill`, page 19 §4) | Viridian |
| 36 | `ja_prof_xp` | +8–25% profession XP gain | Viridian |

**Unique jewels (8)** — fixed powers, one of each per character:

| id | Name | Cut | Power | Fixed lines |
|---|---|---|---|---|
| `jwl_uq_glacial_heart` | Glacial Heart | Azure | Your Ice hits on a **Chilled** enemy Freeze a non-boss for 1 s (once per enemy per 8 s); a boss takes +8% from your Ice for 3 s instead | +10% damage with Ice |
| `jwl_uq_widening_gyre` | The Widening Gyre | Azure | Your **Area** skills cover 20% more radius | −5% damage with Area |
| `jwl_uq_split_tongue` | Split Tongue | Crimson | Your **Projectile** skills fire 1 extra projectile at 50% (not basic attacks already using a Multi-shot quiver) | +8% damage with Projectile |
| `jwl_uq_quiet_hands` | Quiet Hands | Azure | Your **Channel** skills cannot be pushed back or broken by damage (interrupts still break them) | +10% damage with Channel |
| `jwl_uq_slow_candle` | The Slow Candle | Azure | Your **Duration** effects last 30% longer and deal the same total (each tick is smaller) | +6% damage over time with Duration |
| `jwl_uq_pack_heart` | Pack Heart | Viridian | Your **Minions** share 25% of your life steal and move 10% faster | +10% damage with Minion |
| `jwl_uq_open_hand` | The Open Hand | Viridian | Your heals on an ally below 40% health also give them a barrier worth 20% of the heal (5 s) | +6% healing |
| `jwl_uq_lucky_stone` | Lucky Stone | Prismatic | +25% item rarity and +10% gold find | −5% damage |

**Where jewels drop:**

| Source | Chance of a jewel |
|---|---|
| Open-world ordinary enemy, level 10+ | 0.05% |
| Champion pack member | 0.5% |
| Rare (yellow) | 2% |
| Normal dungeon boss / end boss | 3% / 5% |
| Challenge boss / end boss | 8% / 12% |
| Depth Cache | page 12 §2.4.6's column: 5% at reward depth 0, 50% at reward depth 40 (Rare possible from 15, Unique from 25) |
| World-boss chest | 10% |
| Secret boss | 15% |
| Gilded / Warded chest | 2% / 6% |
| Faction quartermasters (§21.2) | Uncommon jewels of the faction's cut at Trusted (1,500 gold × band cost); one **sealed Rare jewel of a cut you pick** at Kindred (20,000 gold) |
| **Rough Jewel** (`it_jewel_rough_t<n>`, tier 1–6 by the source's level: 1–9, 10–19 … 50–60) | rares 3% · Normal bosses 5% · Challenge bosses 8% · the Depth Cache 10%. A Jewelcrafter cuts it into an **Uncommon jewel with 2 affixes** of a cut the crafter picks (page 19 §15). Rare and Unique jewels are **drop-only** |

**Jewelcrafting on jewels** (page 19 §15): **Polish** re-rolls the values and keeps the affixes; **Recut** re-rolls
**one** affix you pick (the new one rolls in the bottom half of its range; one hour between recuts of the same
jewel). Both work on every jewel rarity.

**Why they are the chase, in numbers.** The Crimson cut has 9 lines. A Crimson Rare with 4 affixes has **two
particular lines** you want C(7,2) / C(9,4) = 21 / 126 = **17%** of the time, and **three particular lines**
6 / 126 = **4.8%** (with 3 affixes: 1 / 84 = 1.2%). At level 60 a Challenge end boss gives a jewel 12% of the
time, 27% of those are Rare and 30% of those are Crimson — about **1 in 100 end-boss kills** gives a Crimson Rare,
and about **1 in 3,300** gives one with your three lines. Polishing then chases the values. That is the endgame
loop, and it has no cap.

### 13.6 Souls — summary and rules

A soul is a rare socketable that adds **a new behaviour** — in the spirit of a legendary power. **Page 09 §7 is the
catalogue**: 30 generic souls, the index of class souls (each class file writes its own) and the dungeon souls
(page 12's former trinkets).

| Rule | Value |
|---|---|
| Id | `soul_<snake>` |
| What a soul does | one of three things: **something new happens** (a star falls, a second shadow walks with you), **one of your skills changes** (class souls, written in class files), or **a chance to apply an effect** (on hit, on kill, on block…) |
| Sockets | one soul per soul socket; **one soul socket per item**; a soul socket needs an Epic+ item of ilvl 30+ (§13.1) |
| Requirements | each soul lists a **socket requirement** — *weapon*, *a named armour slot* (e.g. chest or shield), *jewellery*, or *any* — and may add a **wearer requirement**: a **class**, a **role** (Tank / Healer / Damage / Support), a **build** (melee / ranged / caster) or a **tag** ("needs a Fire skill equipped"). A soul whose requirement is not met is greyed on the card and does nothing |
| Active limit | **3 souls** active at once (§13.1) |
| Level | a soul has no level of its own; its numbers are shares of your weapon damage, spell power or health, so it scales with you. You must be level 30 to socket one |
| Power registry | every soul power is a row in the effect registry (`js/effects.js`) and its card sentence is generated from the same constants (Farhold `describe()`), like legendary powers |
| Sources | **certain bosses** (each dungeon lists its souls: 4% per player per kill on Normal, 8% on Challenge, page 12 §2.7; secret bosses; world bosses 4% of chests), **quests** (each class's `q_calling_<class>_3` first completion offers that class's quest soul; two main-story finales offer a pick of generic souls, page 14), **the Depth Cache** (page 12's column: 0.5% at reward depth 5 up to 6% at 40), and **great luck**: any rare level 40+ **1 in 400**, any other open-world kill level 30+ **1 in 50,000** |
| Trade | tradeable like any item (§15) |

### 13.7 Gadgets

A gadget is made by an **Engineer**, and **page 19 §17 owns it**: a **frame** (Tin, Iron, Redsteel, Blacksteel,
Lodestone, Firegold — the level to socket it and a value factor from 0.25 to 1.00), a **core** (Striker, Bulwark,
Mender, Fortune, Artisan, Wayfarer — which menu its lines come from) and up to **3 lines** bought with **12 budget
points** from menus the crafter picks (a Firegold Striker: +16 DEX and +4% Area damage, for example). Gadgets can
be **retuned** by any Engineer without taking them out.

The item side:

| Rule | Value |
|---|---|
| Id | `gdg_<snake>` (page 19 names the built items) |
| Where it goes | a **gadget socket** only (§13.1): weapons, off hands, armour and the **tool**; never necklace or rings |
| Artisan-core gadgets | the ones made for the **tool** socket (gathering and profession lines) |
| How strong | always less than a good jewel, always exactly what you asked for (page 19 §17.3's worked example: a Firegold Striker vs a Radiant gem vs a Rare jewel) |
| Removal | **destroys** it (§13.3); retuning does not need removal |
| Trade | tradeable; Engineers take commissions through craft orders (page 19 §22) and the trade window |
| Magic find | Fortune-core lines count toward §14's caps like any other source |

---

## 14. Magic find

**(new, widened from Farhold's `goldFind` / `xpFind` / `magicFind`)** Canon §12.3: seven stats make loot, gold,
experience, standing and crafting come faster. Page 08 owns the rule; every page that pays anything cites it.

### 14.1 The seven stats

| id | Name on the card | What it multiplies | Unit | Never applies to |
|---|---|---|---|---|
| `mf_gold` | Gold find | gold dropped by kills, bosses and chests | % | quest gold, vendor sales, trades, mail |
| `mf_quantity` | Item quantity | how many items a kill or boss drops (§14.4 step 1) | % | chests with a fixed count (world-boss chests, the Depth Cache, dungeon chests), quest rewards, vendors, crafting |
| `mf_rarity` | Item rarity | the rarity roll of every dropped item, the jewel rarity roll, and the special-rarity chance at half effect (§14.4) | % | named-item lists (set pieces, dungeon-exclusive uniques and legendaries, souls, mounts), quest rewards, vendors, gambler crates, crafting |
| `mf_xp` | XP gain | experience from kills and quests (page 07). Does nothing at level 60 | % | — |
| `mf_rep` | Reputation gain | every **gain** in faction standing (page 07); never a loss | % | enemy factions (standing there only goes down) |
| `mf_prof_skill` | +Profession skill | adds **+N** to your **effective** skill in Harvesting and your crafting profession; page 19 §4 owns what effective skill does (reach a tier early inside your tool's and rank's limit, faster and richer gathering, better craft rolls) | flat | the skill you have earned; skill-ups read your real skill |
| `mf_prof_xp` | +Profession XP | multiplies profession XP (page 19 §4) | % | — |

Magic find is **per player** (personal loot). It is **not** limited to the open world any more: round 1's rule
("magic find only on open-world kills") is **removed**. Magic-find lines take affix slots, gem slots and jewel
affixes that would otherwise carry power, so wearing them is already a real cost; there is no reason to also
switch them off at bosses.

### 14.2 Where each stat comes from

| Stat | Affixes (§11) | Gems, jewellery column (§13.4) | Jewels (§13.5) | Gadgets (§13.7) | Other |
|---|---|---|---|---|---|
| Gold find | `of Fortune` (H, B, Wa, N, R) · `of the Plunderer` (champions, rares and bosses only) | Garnet | `ja_gold` | Fortune-core lines (page 19 §17.3) | Elixir of Fortune (§20.3); `leg_merchant_princes_signet` and other page-09 items |
| Item quantity | `of Plenty` (B, Wa, N, R) | Pearl | `ja_quantity` | Fortune-core lines | Draught of Plenty (§20.3); Starwoven `sw_fortune`; Depth run bonus (page 12) |
| Item rarity | `of Discovery` (H, B, N, R) | Tigereye | `ja_rarity`, `jwl_uq_lucky_stone` | Fortune-core lines | Elixir of Fortune; Starwoven `sw_fortune`; Depth run bonus |
| XP gain | `of Learning` (H, B, N, R) | Lapis | `ja_xp` | Fortune-core lines | Scholar's Tea (§20.3); the Wayfarer's Heirlooms set (page 09) |
| Reputation gain | `of Good Standing` (B, N, R) | Jade | `ja_reputation` | Fortune-core lines | faction tabards (§21.2) |
| Profession skill | `of the Artisan` (N, R) | Peridot | `ja_prof_skill` | Artisan-core lines (page 19 §17.3) | page 19 §4.2: tool affix *Prospector's* (harvest only), Elixir of the Artisan, Maker's Supper, profession garb |
| Profession XP | `of Diligence` (N, R) | Amber | `ja_prof_xp` | Artisan-core lines | page 19 §4.2: tool affix *Diligent*, Draught of Diligence, profession garb |

**No magic-find affix ever rolls on** weapons, off hands, chest, shoulders, hands, legs or feet — so a magic-find
kit always costs jewellery, head, back or waist power.

### 14.3 Caps and diminishing returns

All sources of one stat are **added together** ("raw"), then diminishing returns turn raw into **effective**:
full value up to the **knee**, **half value** above it, and never more than the **cap**.

`effective = min(cap, raw ≤ knee ? raw : knee + (raw − knee) / 2)`

| Stat | Knee | Cap (effective) | Raw needed to reach the cap |
|---|---|---|---|
| Gold find | 100% | 200% | 300% |
| Item quantity | 30% | 60% | 90% |
| Item rarity | 100% | 200% | 300% |
| XP gain | 25% | 50% | 75% |
| Reputation gain | 25% | 50% | 75% |
| Profession skill | — (no halving) | **+40** (page 19 §4) | +40 |
| Profession XP gain | — (no halving) | **+100%** (page 19 §4) | +100% |

**Harvesting nodes** read item quantity and item rarity at **a quarter strength** (page 19 §6.4: +20% item quantity
→ +5% bonus units; +20% item rarity → +5% of the base rare-find chance). Gold find, XP gain and reputation gain do
nothing on nodes.

**Run bonuses** that a place gives you — the Depth Cache's run-wide magic find (page 12 §2.4.6) — are added
**after** the cap, so a player already at the cap still gains from going deeper. The character sheet's Magic
Find panel (page 03) shows raw, effective and any run bonus for each stat.

### 14.4 How a drop table reads magic find

For each eligible player, for one kill (or one boss), in this order:

**Step 1 — how many items.** Every source has an **expected item count** `base` (the tables in §16 give it:
0.315 for an ordinary enemy, 1.5 for a champion, 1.25 for an end boss that drops "one item, 25% a second"…).
`n = base × (1 + quantity)`. The source drops `⌊n⌋` items and one more with the chance of the leftover fraction.
Chests with a fixed count are not affected.

**Step 2 — each item's rarity, rolled from the top down.** Each rarity has a **chance** (§4.1, with its level
ramp). The roll tries **Legendary first, then Unique, Epic, Rare, Uncommon**; the first success is the item's
rarity; if none succeeds it is Common. Each chance is multiplied by the source's **rarity boost** `S` and by
item rarity `R` with a per-rarity weight `k`:

`chance = base chance × S × (1 + k × R)`, at most 95%

| Rarity | k |
|---|---|
| Legendary | 0.25 |
| Unique | 0.5 |
| Epic | 1 |
| Rare | 1 |
| Uncommon | 1 |

Rolling top-down means item rarity can **only raise** every higher rarity's share — it never makes a Unique
rarer by making Uncommons more common. If the result is below the source's **floor**, it becomes the floor
rarity.

**Step 3 — special rarity** (§5.4): `chance × (1 + R / 2)`.

**Step 4 — named lists** (set pieces, a dungeon's listed uniques and legendaries, souls, jewels, gems, mounts) are
their own rolls and **ignore** item rarity and quantity — except a dropped jewel's own rarity roll, which reads
item rarity like an item.

**Step 5 — gold:** `gold × (1 + gold find)`.

**Worked example.** A level-40 rogue kills a **champion** (level 40): `base` 1.5 items, `S` 1.5, floor Uncommon.
She carries raw item rarity 130%: two `of Discovery` rings (32% and 30%, the top of the exquisite tier), an
`of Discovery` helm (13%), two Plain Tigereyes in the rings (10% each), a level-40 Viridian jewel with `ja_rarity`
(15%) and an Elixir of Fortune (20%) → effective **115%** (100 + 30 / 2). Raw item quantity 24% (below the knee).

| | No magic find | With her magic find |
|---|---|---|
| Items | 1.5 → 1 item + 50% chance of a 2nd | 1.5 × 1.24 = 1.86 → 1 item + **86%** chance of a 2nd |
| Legendary chance | 0.05% × 1.5 = 0.075% | 0.075% × (1 + 0.25 × 1.15) = **0.097%** |
| Unique | 0.45% × 1.5 = 0.675% | 0.675% × 1.575 = **1.06%** |
| Epic | 2% × 1.5 = 3% | 3% × 2.15 = **6.45%** |
| Rare | 9% × 1.5 = 13.5% | 13.5% × 2.15 = **29.0%** |
| Uncommon | 28.5% × 1.5 = 42.75% | 42.75% × 2.15 = **91.9%** |
| **Share of each item, after the top-down roll and the Uncommon floor** | Legendary 0.075% · Unique 0.67% · Epic 2.98% · Rare 13.0% · Uncommon 83.3% | Legendary 0.097% · Unique 1.06% · Epic 6.32% · Rare 26.6% · Uncommon 65.9% |
| Special-rarity chance per item | 1.0% | 1.0% × 1.575 = **1.6%** |

---

## 15. Loot and trade

### 15.1 Personal loot

**Personal loot everywhere** (canon §4, W18). When an enemy or boss dies, the server rolls loot **separately for
each eligible player**, using that player's class, armour type, magic find and chosen **loot focus** (a dropdown on
the loot panel and the dungeon journal: any role the class can fill, or "any"; default the character's current
role). An item you receive is always one your class can equip, weighted toward your focus (affix weights ×2 for
your main attribute and your equipped skills' tags, §11.3).

- Nobody sees another player's roll except as a line in the loot log ("Ashe received **Rimecrown Mantle**").
- **Eligible** = in the party, alive or dead, inside the instance / within 60 m in the open world, and dealt damage,
  healed or took damage during the fight. Followers never take a roll.
- **Open-world tag**: an enemy is tagged by the first party or player to hit it; everyone in that party who
  qualifies is eligible. **World bosses and dynamic-event bosses are untagged**: page 13's credit rule applies
  (1% of the boss's health dealt, healed or absorbed, or 60 s in combat in the arena).
- **Gold** from a kill is split evenly among eligible party members (rounded up for each).
- A drop you already own an equal-or-better copy of is re-rolled once (page 12's rule, everywhere).

### 15.2 No binding

**Every item can be traded, mailed, sold to a vendor and listed on the Trading Post** — gear, socketables, set
pieces, legendaries, tokens, mounts as items, tools, consumables, materials. **The only exception is a quest
item**, whose card says **"Quest item"**: it cannot be traded, dropped or sold while its quest is active and is
removed when the quest ends. The word "soulbound" is never used. (Round 1's bind-on-pickup, bind-on-equip,
trade windows and refund timers are gone.)

**Learnt by your account.** A few things are **learnt** rather than held: a **mount's look** the first time you
ride it, an **appearance** the first time you equip or loot the item, a **dye** the first time you use it, and
**titles**. Learning adds them to your account's stable, wardrobe or title list for every character; the item
itself stays an ordinary tradeable item. Nothing is "bound".

### 15.3 Why there are no group loot rolls

A shared roll on a drop *(reference: older MMOs' need/greed/pass)* makes a five-player group argue over a drop the
whole group could see, needs somebody's judgement about who deserves what, and is awkward with followers filling
slots. Personal loot plus free trading gives the same "give it to the one who can use it" moment without the
arguments. **There is no group-roll option anywhere** — not as a party-leader setting, not for Normal dungeons
(the owner's ruling: personal loot only).

### 15.4 Loot limits

The weekly reset is **Monday 06:00** server time, and it is used **only** for Challenge-mode bosses and world
bosses (canon §4, W5).

| Content | Loot limit |
|---|---|
| Open world (every enemy, champion, rare, event) | **none**; rares respawn on page 10's timers |
| Normal dungeon, Normal Depth | **none** — every boss rolls every run (the 10-instances-an-hour cap, page 12, is the only brake) |
| Challenge dungeon, Challenge Depth | each boss **once per week** per character; after that it drops gold only |
| Depth Cache | **none** — every run |
| Secret boss | as its difficulty (every run on Normal, once a week on Challenge) |
| World boss | the **personal chest once per week per boss** per character; later kills give XP, 25% of the chest's gold and reputation |
| Quest rewards | once per character |

There are **no bonus rolls** and **no loot master**.

### 15.5 Trading

Page 15 owns the trade window, mail and the **Trading Post** (the player market). This page owns the gold side:
**listing deposit 1%** of the asking price (kept if the item does not sell), **5% cut** on a sale (removed from the
world — the main gold sink on traded goods, §23). Commissioned crafting (a crafter working on your item: sockets,
gadgets, glyphs) goes through the trade window's **Commission** tab, so the item never leaves its owner until the
work is done.

---

## 16. Drop tables by source

`(reuse: balance.json loot.dropRate, ranks, chests; emberveil loot.js zoneDrop / bossLoot)` Percentages are **per
eligible player**. "Items" is the **expected count** step 1 of §14.4 multiplies; "S" is the rarity boost; "floor" is
the lowest rarity. Gems, jewels, souls and special rarities are the chances of §13 and §5, repeated here so each
source reads on one row.

### 16.1 Open world

| Source | Items (base) | Floor | S | Gold | Gem | Jewel | Soul | Special (per item) | Materials | Other |
|---|---|---|---|---|---|---|---|---|---|---|
| Ordinary enemy | 0.315 | Common | 1.0 | 60% chance of `2 × 1.061^(L−1)` ±30% | — | 0.05% (level 10+) | 1 in 50,000 (level 30+) | 0.4% | family table 25% (Farhold `salvageByFamily`) | junk item 15% (§16.9) |
| Champion pack member | 1.5 | Uncommon | 1.5 | ×2.6 | 1% | 0.5% | as ordinary | 1% | Bound Essence 40% | — |
| Rare (yellow) | 2.5 | Rare | 2.2 | ×5 | 4% | 2% (+ Rough Jewel 3%) | 1 in 400 (level 40+) | 2.5% | Resonant Dust 50% | trophy (§16.9); a tool 1% (page 19 §6.1) |
| Warband leader / war-camp warlord | 2 | Rare | 2.2 | ×6 | 5% | 3% | 1 in 400 | 2.5% | Dust 1–2 | warband unique 8% (reuse: Farhold R27 M10); camp mount 1% |
| Dynamic event boss (page 14) | 1 | Rare | 2.0 | ×8 | 5% | 2% | 1 in 400 | 2% | Essence 2–3 | the event's own reward (page 14) |
| **Greater-rarity monster** (page 10) — applied on top of its row | +1 | one step higher (max Epic) | ×1.5 | ×2 | ×2 | ×2 | ×2 | the mapped special rarity ×5 (§5.5) | ×2 | — |

Legendary and Unique chances are in the rarity roll (§4.1, §14.4). Rares have **no kill limit** of any kind.

### 16.2 Dungeons (Normal and Challenge)

Page 12 §2.7 wrote the chances of an item; this page adopts them and adds floors, gold and the socketables.

| Source | Normal | Challenge (level 60) |
|---|---|---|
| Trash | 3% an item (band level), floor Common | 3% (level 60), floor Uncommon |
| Sub-boss | 30% an item, floor Rare | 35%, floor Epic |
| Main boss | 50% an item, floor Rare | 55%, floor Epic |
| End boss | 1 item + 25% a second (base 1.25), floor Rare | 1 + 25%, floor Epic; + a **class set token** (`it_token_<slot>`) 20% |
| Secret boss | 1 item, floor Epic; its **[SECRET]** legendary 10% | 1 item, floor Epic; [SECRET] legendary 15% |
| The dungeon's listed uniques / legendaries | a listed unique is 1 in 6 of a boss's drops; a listed legendary 1 in 40 (main and end bosses) | legendary 1 in 25 |
| Generic dungeon set piece (`set_<snake>`, page 09) | 20% of a boss's drops | 25% |
| Listed dungeon soul (the boss that lists it) | 4% per kill | 8% |
| Gem | 10% per boss | 20% |
| Jewel | 3% (end boss 5%); Rough Jewel 5% | 8% (end boss 12%); Rough Jewel 8% |
| Special rarity per item | 1.5% | 4% |
| Gold per boss | 20 × band gold multiplier (§23); end boss ×2 | 200; end boss 400 |
| Materials per boss | Scrap Iron 4–8, Bound Essence 1–2 | + Resonant Dust 1–2; end boss Tear-glass 50% |
| Loot limit | none | once per week per boss (§15.4) |

### 16.3 Depth

Page 12 §2.4.6 owns Depth and wrote the **Depth Cache** table (items, floors, rarity odds, jewel, soul, special
rarity and the run's magic-find bonus by **reward depth R**: `R = Deep k` on Normal, `k + 10` on Challenge). This page
adopts that table as its numbers and adds:

| Rule | Value |
|---|---|
| Item level | the depth's level (`min(60, band top + 3 × depth)`), 60 for every Deep depth |
| Boss drops | as §16.2 for the difficulty, read with the run's magic-find bonus |
| Sockets on Depth Cache items | socket chances × (1 + 0.02 × R) (§13.1) |
| Run magic find | added after the caps (§14.3) |
| Class set token | from R 10, 20% of the cache's Epics (page 12) |
| Tear-glass | 1 per cache item from R 10 |
| Gold | the cache holds `100 × (1 + 0.1 × R)` gold (R 40: 500) |
| Loot limit | none on the cache; Challenge Depth bosses share the Challenge weekly limit |

### 16.4 Secret bosses

Every dungeon has a secret boss (page 12 owns how to find it).

| | Normal | Challenge |
|---|---|---|
| Items | 1, floor Epic, item level end boss + 1 (max 60) | 1, floor Epic, level 60 |
| Exclusive legendary ([SECRET]) | 10% every run | 15%, once a week |
| Also from the Depth Cache | a quarter of the cache's legendary column (page 12) | same |
| Guaranteed on first kill | 1 appearance unique to that boss, and a Feat (achievement) | the same |
| Jewel / soul / special | 15% / the soul it lists at 8% / 8% | same |

### 16.5 World bosses

Page 13 §5 owns the chest; these are its amounts (the two pages agree).

| | Per character, **one personal chest per boss per week** |
|---|---|
| Items | **1**, floor **Epic**, item level `min(your level, boss level)`; **Ascendant** week: **+1 item** (Epic floor), item level `min(your level, 60)` |
| The boss's own unique | 5% |
| Legendary (page 09 world pool) | 3%; Ascendant 5%; bad-luck protection +10% per chest with none |
| `set_trophies_of_the_wild_hunt` | Ascendant weeks only: 30% |
| Special rarity | 3% per item; the boss's favoured one ×3, the rest ×1.5 (§5.4, page 13) |
| Gem / jewel / soul | 25% / 10% / 4% |
| Mount | 1% (the boss's own, §24.3) |
| Gold | `150 × band gold multiplier` (Greyridge 375, Kingsfire 1,800); Ascendant 2,100 |
| Reputation | +150 with the faction that holds the region |
| Magic find | item rarity applies to the chest items' rarity roll; item quantity never adds items to a chest; gold find applies |
| Repeat kills that week | kill XP, 25% of the chest gold, reputation |

### 16.6 Quests

| Quest kind (page 14) | Items | Gold | Reputation (page 07 owns the tiers) |
|---|---|---|---|
| Side quest | pick 1 of 2–3, Uncommon, item level = quest level | `5 × 1.061^(L−1)` | +75 |
| Story quest | pick 1 of 3–4 (one per role), Rare | ×2 | +150 |
| Main-story chapter finale | pick 1 of 3 Epic; two finales (page 14) also offer **a pick of 3 generic souls** (page 09 §7) | ×4 | +500 |
| Dungeon quest | pick 1 of 3–4, Rare, item level + 1 | ×3 | +250 |
| Calling quest (6 / 20 / 40) | pick 1 of 3 **Epic** class items, item level + 1, plus the mechanic upgrade; calling III's first completion also offers the class's **quest soul** (class file) | ×4 | +250 |
| Unlock quest (mount, dodge, Travel Methods) | the thing it unlocks (page 07) | ×1 | +75 |
| Turn-in | always through one payer (reuse: `js/questrewards.js`, five reward kinds incl. pick-one-of-three) | | |

Quest rewards ignore item quantity and item rarity; XP gain and reputation gain apply.

### 16.7 Gambler crates

`(reuse: js/town.js CRATE_TIERS, gamble())` — one sealed item at the buyer's level, never below the floor, with a
`lift` chance of one tier better. Prices scale by level: `price × (1 + 0.1 × (level − 1))`. Crates ignore magic
find; a crate item may be special (0.5%).

| Crate | Floor | Price at level 1 | Price at level 60 | Lift chance |
|---|---|---|---|---|
| Plain Crate | Common | 60 | 414 | 10% |
| Marked Crate | Uncommon | 240 | 1,656 | 14% |
| Sealed Crate | Rare | 900 | 6,210 | 20% |
| Warded Crate | Epic | 3,200 | 22,080 | 28% (to Unique) |

### 16.8 Chests

`(reuse: balance.json chests.kinds, js/chests.js)` Chests are placed from the world seed, remembered once opened
(per character), and stand under a beacon coloured by their guaranteed floor. Each chest is **per character**
(everyone can open their own copy). The item count is fixed (quantity does not add); item rarity applies.

| Chest | Weight | Items | Floor | Gold (× band) | Materials | Gem / jewel / special | Notes |
|---|---|---|---|---|---|---|---|
| Wooden | 52 | 0–2 | Common | 14–40 | 1 roll | — | — |
| Iron-Bound | 30 | 1–2 | Uncommon | 40–110 | 2 rolls | — | — |
| Gilded | 14 | 2–3 | Rare | 120–300 | 3 rolls | 8% / 2% / 1.5% | — |
| Warded | 4 | 2–4 | Epic | 260–700 | 5 rolls | 15% / 6% / 3% | 22% mimic, guarded, zones ≥ level 10 |
| Meteorite | event | 1–3 | Rare | 180–480 | 4 rolls | 10% / 3% / 2% | falls every ~5 min somewhere 220–900 m away (reuse `meteors`) |
| Dungeon cache | 1 per dungeon | 1 | Rare | 100 | 2 rolls | 10% / 3% / 1.5% | hidden room; key from a sub-boss (page 12) |
| Secret cache | 1 per secret-boss route | 1 | Epic | 600 | Dust 3 | 20% / 10% / 4% | the clue trail's reward |

### 16.9 Junk, trophies and flavour items

Ordinary enemies drop a **junk item** 15% of the time: a flavour object from Item Vault (reuse:
`items/js/items.js roll()`, race-weighted, e.g. "a dwarven drinking horn") worth only gold (`value` from the
catalogue × band). Rares drop a **trophy** (Item Vault `trophy` tag) that a hub collector (`npc_collector`) buys for
**3× its value in gold and +250 reputation** with the faction that holds that region (round 1's reputation tokens
are gone — standing is given directly).

---

## 17. Salvage and the bench

`(reuse: prototypes/farhold/js/craft.js, data/crafting.json)`

Farhold's rule is kept: **every bench material comes out of an item you recycled, or off something hard to kill.**
The bench is open to **every** character (no profession needed); the crafting professions of page 19 sit **on top**
of it (sockets, gadgets, glyph rank III, recipes). Materials sit in their own **materials bag with no cap**
(reuse: `Materials` class), not in the inventory. Harvested materials (ore, hides, herbs, timber, fish) are page
19's and live in the same bag.

### 17.1 Bench materials

| id | Name | Tier | Colour | Comes from | Origin |
|---|---|---|---|---|---|
| `mat_scrap` | Scrap Iron | 1 | `#9a9285` | salvaging anything; ordinary enemies | reuse (`scrap`) |
| `mat_essence` | Bound Essence | 2 | `#6ab0e8` | salvaging Uncommon+; champions | reuse (`essence`) |
| `mat_dust` | Resonant Dust | 3 | `#c88ae8` | salvaging Epic+, uniques, sets, special rarities; rares, bosses | reuse (`dust`) |
| `mat_tearglass` | Tear-glass Shard | 4 | `#e0f0ff` | salvaging ilvl 58+ Epic and better; Challenge end bosses (50%); the Depth Cache from reward depth 10; world-boss chests at level 60; Spire Isle rares | new (round 1's "Veilglass", renamed — a shard of the Tear, page 01) |

### 17.2 Salvage yields

Recycle at any bench or with the inventory's Salvage button (confirm for Rare+). Yield = rarity row, plus
armour-weight / weapon-category row (reuse: `salvageByTier`, `salvageByCategory`), times the **item-level band
multiplier** `1 + 0.1 × band` (band = ⌊ilvl / 5⌋) — without it a level-55 player would need eleven times the salvage
of a level-5 one for the same bench action. Socketed gems, jewels and souls come back to the bag; gadgets break (§13.3).

| Rarity | Scrap | Essence | Dust | Tear-glass |
|---|---|---|---|---|
| Common | 2–4 | — | — | — |
| Uncommon | 3–5 | 1–2 | — | — |
| Rare | 4–7 | 2–4 | — | — |
| Epic | 6–10 | 3–6 | 1–3 | 30% for 1 at ilvl 58+ |
| Unique | 4–6 | 4–6 | 2–3 | 1 at ilvl 58+ |
| Set | 4–6 | 4–6 | 2–4 | 1 at ilvl 58+ |
| Legendary | 6–10 | 6–10 | 4–6 | 1–2 at ilvl 58+ |
| any special rarity | + 0 | + 0 | **+ 2** (Living at Growth 10: + 5) | + 0 |

### 17.3 Bench actions

Every button is drawn from a `quote()`: a greyed-out button always says why ("needs 4 more Bound Essence",
"all 4 property slots are full — reweave one instead") (reuse). Costs are multiplied by the item's **band cost**
(below). The **Create** tab makes something; the **Upgrade** tab reworks what you have.

| # | Action id | Tab | What it does | Cost (× band) | Gates | Origin |
|---|---|---|---|---|---|---|
| 1 | `forge_weapon` | Create | a Common weapon of your level; pick the type | 10 Scrap | — | reuse |
| 2 | `forge_armour` | Create | a Common armour piece, your armour type, pick the slot | 8 Scrap | — | reuse |
| 3 | `forge_quiver` | Create | a Common quiver; pick a base you have seen drop (§9.2) | 8 Scrap, 2 Essence | — | reuse |
| 4 | `forge_jewellery` | Create | an Uncommon ring or necklace (Farhold's `forge_trinket`; there is no trinket slot) | 6 Scrap, 2 Essence | — | reuse |
| 5 | `forge_fine` | Create | a Rare of your level, any slot | 14 Scrap, 6 Essence | level 8 | reuse |
| 6 | `forge_masterwork` | Create | an **Epic** of your level, any slot (Farhold: "legendary") | 20 Scrap, 12 Essence, 6 Dust | level 18 | reuse, renamed rarity |
| 7 | `forge_pattern` | Create | a crafted-set piece from a **pattern** (page 09 §2) | per pattern | pattern learnt | new |
| 8 | `refine` | Upgrade | +1 item level, up to +5 over the item's dropped level and never past 60 or your own level (replaces Farhold's Temper, since quality is gone) | 8 Scrap, 1 Essence; ×1.5 each time | — | changed |
| 9 | `reinforce` | Upgrade | +25% base armour, up to 3 times | 12 Scrap | armour | reuse |
| 10 | `hone` | Upgrade | +20% base dice, up to 3 times | 10 Scrap, 2 Essence | weapon, level 12 | reuse |
| 11 | `promote` | Upgrade | one rarity up + a new affix: →Uncommon / →Rare / →Epic | 6 Scrap 3 Essence / 10 Scrap 6 Essence / 10 Essence 4 Dust | never into Unique, Set or Legendary | reuse |
| 12 | `inscribe` | Upgrade | add one affix if a slot is free | 3 Essence | Uncommon+ | reuse |
| 13 | `reweave` | Upgrade | swap one affix for a different one (you pick which goes); each reweave of the same item ×1.4 | 2 Essence, 1 Dust | Uncommon+; on named items only the random-range line; never a Starwoven affix | reuse |
| 14 | `sharpen` | Upgrade | re-roll every affix's number, keep the affixes (rolled at the item's own tier — Farhold R18 fixed this; Twinned rolls twice, Ancient keeps its factor) | 3 Essence | Uncommon+ | reuse |
| 15 | `recast` | Upgrade | re-roll every affix; can come out worse | 6 Essence, 2 Dust | Rare / Epic only | reuse |
| 16–23 | `brand_fire`, `brand_ice`, `brand_void` (reuse) + `brand_lightning`, `brand_poison`, `brand_holy`, `brand_arcane`, `brand_nature` (new) | Upgrade | the weapon's hits deal that element (and carry its tag) and apply its status (Burning 105% of the hit over 5 s; Chilled −45% move 4 s; Shocked +30% damage taken 3 s; Poisoned 60% over 6 s; Cursed −15% damage dealt 5 s; Hallowed +20% vs undead and demons; Unmade −10 resist 5 s; Rooted 1 s, once per 8 s per enemy) | 6 Essence, 2 Dust (void 3 Dust) | Rare+ weapon | reuse + new |
| 24 | `reforge_set` | Upgrade | change a set piece to another slot of the same set | 3 Dust, 2 Tear-glass | a set piece you own | new |

Sockets are **not** a bench action any more — they belong to the professions (§13.2).

**Band cost** (Farhold `bandCost` stretched from 6 bands to 12; a band is 5 item levels):

| ilvl | 1–5 | 6–10 | 11–15 | 16–20 | 21–25 | 26–30 | 31–35 | 36–40 | 41–45 | 46–50 | 51–55 | 56–60 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| × cost | 1 | 1.3 | 1.6 | 2 | 2.4 | 2.9 | 3.4 | 4 | 4.6 | 5.3 | 6 | 7 |

Every action also costs gold: `20 × band cost × (1 + rarity index)` (Common 0 … Legendary 6) — a sink.

---

## 18. Glyphs

Emberveil has an Enchanter who adds, re-rolls and promotes affixes for gold (reuse: `loot.js
enchantAdd/Reroll/Promote`). In Wildmarch those jobs belong to the bench (§17), and the Enchanter NPC
(`npc_enchanter`, every hub) sells **rank I glyphs** so nobody is locked out; **ranks II and III** (and page 19's
half-steps and Paragon glyphs) are made by players with **Enchanting** (page 19 §16) and sold on the Trading Post.

- A **glyph** is a permanent slot enchantment that does **not** use an affix slot. One per item.
- Enchantable slots: main hand, off hand, chest, back, legs, feet, both rings.
- Applying one: use the glyph scroll on the item (scrolls are ordinary tradeable items). A new glyph replaces the old.
- Ranks: **I** (level 20, NPC or Enchanting band 50), **II** (level 40, Enchanting band 150), **III** (level 58,
  Enchanting band 250). The price column is the NPC's rank-I price and the suggested floor for a crafted rank II.

| Glyph | Slot | Rank I | Rank II | Rank III | Price rank I / rank II floor (gold + materials) |
|---|---|---|---|---|---|
| Glyph of Keenness | main hand | +4% critical chance | +6% | +8% | 400 + 4 Essence / 2,000 + 3 Dust |
| Glyph of the Tempest | main hand | 10% chance on hit: lightning for 60% weapon damage | 80% | 100% | same |
| Glyph of Kindling (was "of Embers") | main hand | 15% chance on hit: Burning (40% of the hit over 4 s) | 60% | 80% | same |
| Glyph of Mercy | main hand | +3% healing done | +5% | +7% | same |
| Glyph of the Sage | main hand | +3% spell power | +5% | +7% | same |
| Glyph of the Wall | off hand (shield) | +5% block chance | +8% | +10% | 300 + 3 Essence / 1,500 + 2 Dust |
| Glyph of the Ward (was "of the Lamp") | off hand (focus, ward) | +8% barrier | +12% | +16% | same |
| Glyph of the Quiver | off hand (quiver) | +4% arrow damage | +6% | +8% | same |
| Glyph of Vigour | chest | +3% maximum health | +5% | +7% | 300 + 3 Essence / 1,500 + 2 Dust |
| Glyph of Stillwater | chest | +4% maximum resource | +6% | +8% | same |
| Glyph of Warding | chest | +20 resistance to all | +40 | +70 | same |
| Glyph of the Swift | back | +3% dodge | +4% | +5% | 250 + 2 Essence / 1,200 + 2 Dust |
| Glyph of the Shadowed Road | back | 5% less threat caused | 8% | 10% | same |
| Glyph of Grit | legs | +8 CON | +16 | +28 | 250 + 2 Essence / 1,200 + 2 Dust |
| Glyph of Might / Grace / Mind | legs | +8 STR / DEX / INT | +16 | +28 | same |
| Glyph of the Road | feet | +3% move speed | +4% | +5% | 250 + 2 Essence / 1,200 + 2 Dust |
| Glyph of the Tumbler | feet | dodge roll cooldown −0.2 s | −0.3 s | −0.5 s | same |
| Glyph of Fortune | ring | +5% gold find | +8% | +10% | 200 + 2 Essence / 1,000 + 1 Dust |
| Glyph of the Blade / of Healing | ring | +2% damage / +2% healing | +3% | +4% | same |
| Glyph of Haste | ring | +2% haste | +3% | +4% | same |
| Glyph of the Seeker (new) | ring | +5% item rarity | +8% | +10% | same |

---

## 19. Durability and repair

Not in Farhold. **(new, proposed — flagged for the owner in `QUESTIONS.md` because it is the one system on this
page that only exists to cost gold.)**

| Rule | Value |
|---|---|
| Durability | 100 points on every equipped item except tool and mount (weapons 120) |
| Loss on death | −10% of maximum on every equipped item |
| Loss in play | none from swings or hits (a death is the only cost) |
| Broken (0) | the item gives **no stats, no sockets and no power**; the doll slot turns red; the card says "Broken — repair at any smith" |
| Warning | an anvil icon on the HUD at 25% (yellow) and 10% (red) on any piece |
| Repair at a smith | full repair of one item from 0 costs **40% of its sell price**; partial pro rata. "Repair all" button |
| Repair Kit (consumable) | restores 50% durability on everything worn; 1 per 10 minutes |
| Guild repair | page 15 (the guild bank pays up to a limit the guild leader sets) |
| Wipes | a dungeon wipe counts as one death per player |

---

## 20. Consumables

Emberveil's seven potions (`items.json potions`) were flat numbers for a turn-based game. Wildmarch restates them as
**shares of the maximum**, so they stay useful at every level, and adds elixirs, food and scrolls. **(changed)**

### 20.1 The potion belt

- Potions are used from **belt slots**. **Slots come from level only** (page 07): 2 at level 3 (`7` `8`), 4 at level
  16 (`9` `0`). Keys: page 02 (`belt1` … `belt4`, default 7 8 9 0).
- **Charges:** each belt slot holds up to **5 charges** of one consumable (refilled from your bags out of combat). The
  **waist item adds charges, not slots** — Common/Uncommon belts +1 charge per slot, Rare/Epic +2, Unique/Set/Legendary
  +2 (max 7 per slot).
- **Potion cooldown**: every healing or resource potion shares one 60 s cooldown. Cleansing potions share a separate
  30 s cooldown. Revival items have their own (below).
- `of the Apothecary` (waist affix) makes potions restore up to 60% more.

### 20.2 Potions

| id | Name | Level | Effect | Cooldown group | Price (gold) | Origin |
|---|---|---|---|---|---|---|
| `it_healing_draught_1` | Minor Healing Draught | 1 | heals 25% of maximum health instantly | potion 60 s | 15 | reuse (Healing Potion), restated |
| `it_healing_draught_2` | Lesser Healing Draught | 12 | 30% instantly | potion | 60 | new |
| `it_healing_draught_3` | Healing Draught | 24 | 35% instantly | potion | 150 | new |
| `it_healing_draught_4` | Greater Healing Draught | 36 | 40% instantly + 10% over 6 s | potion | 320 | reuse (Greater Healing), restated |
| `it_healing_draught_5` | Superior Healing Draught | 48 | 45% + 10% over 6 s | potion | 600 | new |
| `it_healing_draught_6` | Supreme Healing Draught | 58 | 50% + 15% over 6 s | potion | 1,000 | new |
| `it_mana_draught_1…6` | Minor … Supreme Mana Draught | 1/12/24/36/48/58 | restores 25/30/35/40/45/50% of maximum mana | potion | as healing | reuse (Mana Potion) |
| `it_momentum_tonic` | Momentum Tonic | 10 | +40% of maximum Momentum at once, and Momentum does not drain for 10 s | potion | 80 × band | new (round 1's "Tonic of Fury") |
| `it_tempo_tincture` | Tempo Tincture | 10 | restores 60% of maximum Tempo | potion | 80 × band | new (round 1's "Focus Tincture") |
| `it_group_tonic` | Group Tonic | 20 | heals every party member within 12 m for 15% of their maximum health | potion | 150 × band | reuse, restated |
| `it_antidote` | Antidote | 1 | removes Poison and Bleed | cleanse 30 s | 25 | reuse |
| `it_burn_salve` | Burn Salve | 8 | removes Burning; 3 s immune to Burning | cleanse | 30 × band | new |
| `it_warming_draught` | Warming Draught | 8 | removes Chilled and Frostbite; 3 s immune | cleanse | 30 × band | new |
| `it_holy_water` | Vial of Holy Water | 16 | removes one Curse; +10% shadow resistance 30 s | cleanse | 50 × band | new |
| `it_revival_flask` | Revival Flask | 10 | revives an ally at 25% health, immune to damage for 2 s; 10 s channel; usable in or out of combat anywhere (there is no revive limit, canon W21) | revive 5 min | 80 × band | reuse, restated |
| `it_heartfire_draught` | Heartfire Draught | 30 | revives an ally at 70% health, immune 3 s; 3 s channel | revive 10 min | 420 × band | reuse (Emberveil's "Emberheart Draught", renamed) |
| `it_repair_kit` | Repair Kit | 5 | +50% durability on all worn items | 10 min | 5% of the band's average item price | new |

### 20.3 Elixirs and flasks

One **battle elixir**, one **guardian elixir** and one **fortune elixir** at a time; a **flask** counts as battle and
guardian. They last through death.

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
| `it_elixir_keen_sight` | Elixir of Keen Sight | guardian | 15 | hidden enemies within 8 m and traps within 12 m show; +20 m minimap range | 60 min | 80 × band |
| `it_elixir_waterbreath` | Elixir of Deep Breath | guardian | 20 | breathe underwater, swim +30% | 30 min | 60 × band |
| `it_elixir_fortune` | Elixir of Fortune | fortune | 15 | +20% item rarity and +20% gold find | 30 min | 200 × band |
| `it_draught_plenty` | Draught of Plenty | fortune | 25 | +8% item quantity | 30 min | 300 × band |
| `it_scholars_tea` | Scholar's Tea | fortune | 5 | +10% XP gain | 60 min | 60 × band |
| `it_elixir_artisan` | Elixir of the Artisan | guardian | 9 | +10 profession skill (page 19 §4.2) | 60 min | page 19 |
| `it_draught_diligence` | Draught of Diligence | battle | 9 | +25% profession XP gain (page 19 §4.2) | 60 min | page 19 |
| `it_flask_champion` | Flask of the Champion | flask | 58 | +8% main attribute and +5% maximum health | 2 h | 2,500 + 1 Dust |
| `it_flask_warden` | Flask of the Warden | flask | 58 | +12% armour, +10% resistance, +5% health | 2 h | 2,500 + 1 Dust |

Alchemists (page 19) make every elixir and flask; the Alchemist NPC sells the battle and guardian ones.

### 20.4 Food

Eaten out of combat: a 10 s channel (sitting animation), then **Well Fed** for 30 minutes; one food buff at a time;
survives death. Sold by innkeepers and cooks; the better ones drop from rares and quests; Fishing and Cooking
(page 19) make the rest.

| id | Name | Level | Well Fed effect | Price |
|---|---|---|---|---|
| `it_food_hearth_bread` | Hearth Bread | 1 | +2% maximum health; +1% health a second out of combat | 5 |
| `it_food_orchard_pie` | Orchard Pie (Hearthvale) | 5 | +3% maximum health | 20 |
| `it_food_eel_stew` | Fenland Eel Stew (Mossfen) | 10 | +3% maximum resource, +5% resource regeneration | 40 |
| `it_food_miners_pasty` | Miner's Pasty (Greyridge) | 15 | +4% armour | 60 |
| `it_food_spiced_dates` | Spiced Dates (Sunscar) | 20 | +2% haste | 90 |
| `it_food_moonwell_greens` | Moonwell Greens (Whisperwood) | 25 | +3% healing done | 120 |
| `it_food_steppe_jerky` | Steppe Jerky (Cinder Steppe) | 30 | +3% damage | 160 |
| `it_food_rime_broth` | Rime Broth (Frostmantle) | 35 | +6% resistance to ice; immune to the cold-weather slow | 200 |
| `it_food_salt_fish` | Salted Kingfish (Drowned Coast) | 40 | +3% critical chance | 260 |
| `it_food_rift_honey` | Rift Honey (Riftmarch) | 48 | +3% spell power and +3% healing | 340 |
| `it_food_kingsfire_roast` | Kingsfire Roast (Kingsfire) | 55 | +4% damage, +3% health | 450 |
| `it_food_makers_supper` | Maker's Supper | 9 | +5 profession skill (page 19 §4.2) | 60 |
| `it_food_feast` | Wayfarer's Feast | 30 | placed on the ground for 3 min; up to 5 players (your party) each take Well Fed: +4% main attribute, +4% health | 1,500 |

### 20.5 Scrolls and the Recall Stone

Page 20 owns the travel rules; this page owns the items and their prices.

| id | Name | Level | Effect | Cooldown | Price |
|---|---|---|---|---|---|
| `it_recall_stone` | Recall Stone | 7 | bound at a waystone or landmark in a **town or other populated, safe place** (never a dungeon or a wild landmark); returns you there (page 20 owns the cast and cooldown). Never used up, cannot be sold | page 20 | free (the level-7 unlock, page 07) |
| `it_scroll_recall` | Scroll of Recall | 7 | the Recall Stone's effect once, when the stone is on cooldown | 30 min | 25 × band |
| `it_scroll_waystone` | Waystone Scroll | 12 | teleports you to one **discovered** town waystone you pick; 10 s cast; arriving counts as discovering nothing new | 15 min | 40 × band |
| `it_scroll_calling` | Scroll of Calling | 20 | an **assisted teleport**: one party member who accepts is pulled to you after a 10 s cast (not into or out of a dungeon); arriving somewhere counts as discovering it (page 12 §2.3) | 30 min | 120 × band |
| `it_scroll_swiftness` | Scroll of Swiftness | 10 | +30% run speed out of combat for 10 min (not with a mount) | — | 40 × band |
| `it_scroll_warding` | Scroll of Warding | 15 | a barrier worth 20% of maximum health for 10 s | 2 min | 60 × band |
| `it_scroll_tongues` | Scroll of Tongues | 20 | read one ancient inscription (secret-boss clue trails, page 12) | — | 150 (quest vendors) |
| `it_scroll_unbinding` | Scroll of Unbinding | 20 | forget one talent choice for free (page 07; the Unbinder's price otherwise) | — | drops from rares (1%); faction quartermasters at Kindred, 2,000 gold |
| `it_scroll_reveal` | Scroll of Revealing | 30 | shows hidden doors and traps within 25 m for 60 s | 5 min | 100 × band |
| `it_scroll_banishing` | Scroll of Banishing | 40 | a non-boss undead or demon within 10 m flees for 8 s | 3 min | 120 × band |

---

## 21. Gold and reputation rewards

**Gold is the only coin** (canon §4, W19). There are no dungeon, Challenge, world-boss, event or festival
currencies and no reputation tokens. Everything that round 1 bought with a token is now bought with **gold**,
gated by **standing** with a faction. **(changed)**

### 21.1 Gold

- Shown as one number with thousands separators ("12,480 gold"), with a small gold coin icon. There are no smaller
  coins.
- Held cap 999,999,999. Mail and trade can move gold; the Trading Post charges §15.5's fees.

### 21.2 Faction quartermasters

The seven player factions (canon §12.2) each have a quartermaster (`npc_quartermaster_<faction>`) in several of their
chapter towns (page 01 says which). **Standing** tiers are page 07's: Hunted, Disliked, Known, Welcome, Trusted,
Kindred, Sworn. Standing comes from quests, trophies (§16.9), world bosses (§16.5), region events (page 14) and
kills of the faction's enemies, all multiplied by **reputation gain** (§14). A quartermaster sells **at your level,
up to 60**, so a faction met at level 5 still matters at 60 (canon W12).

| Standing | What every quartermaster sells (for gold) |
|---|---|
| Welcome | the faction's **tabard** (a back-slot look; while worn, +5% reputation gain with that faction) · Uncommon gear of the faction's theme at your level (×2 the formula price, §22.1) |
| Trusted | Rare gear at your level · **Uncommon jewels** of the faction's cut (1,500 gold × band cost) · the faction's **gadget cores** (Engineers, page 19 §17.2) · Rare tools of the faction's kind |
| Kindred | Epic gear at your level (one piece per slot per week is not a limit — any number, at ×3 the formula price) · a **sealed Rare jewel** of a cut you pick (20,000 gold) · the faction's **mount** (§24) · Epic tools · `it_scroll_unbinding` (2,000) |
| Sworn | the faction's **title** and a unique appearance set (looks only) · the faction's **legendary pattern** for crafters (page 19) |

| Faction | Theme of its gear | Jewel cut | Tools | Mount at Kindred |
|---|---|---|---|---|
| `fac_wardens` | tank and support, CON and armour | Viridian | pry bars | Warden's Destrier (`it_mount_wardens_destrier`) |
| `fac_crown_assembly` | melee damage, STR | Crimson | — | Crown Courser (`it_mount_crown_courser`) |
| `fac_deepforge_clans` | heavy armour, block | Crimson | picks | Crag Ram (`it_mount_crag_ram`) |
| `fac_greenhand` | healing and nature | Viridian | sickles, hatchets and skinning knives | Moonwell Stag (`it_mount_moonwell_stag`) |
| `fac_lantern_house` | casters, INT and spell tags | Azure | — | Scarab Runner (`it_mount_scarab_runner`) |
| `fac_cutwater` | ranged, DEX, quivers | Crimson | fishing rods | Tidewalker Turtle (`it_mount_tidewalker`) |
| `fac_quiet_wake` | shadow and holy, anti-undead affixes | Azure | — | Dune Sabrecat (`it_mount_dune_sabrecat`) |

The heirloom set (`set_wayfarers_heirlooms`, page 09) is sold by the Wardens' quartermaster in Brightwater at
**Welcome**, once any character on the account has reached 60.

---

## 22. Vendors and prices

### 22.1 The price formula

Farhold: `price = basePrice 15 × quality × rarity (1/2/4/10) × (unique ? 2 : 1)`, and an item carrying its own
`basePrice` (mounts, tools) is priced from that (reuse: `js/rpg.js price()`). Wildmarch:

`price = base × rarity × 1.061^(ilvl − 1) × special`

- `base` = 15 for gear, or the item's own `basePrice` (mounts, tools, consumables, jewels 40, gems per §13.4).
- `rarity` = Common 1 · Uncommon 2 · Rare 4 · Epic 10 · Unique 20 · Set 25 · Legendary 40.
- `special` = 1, or **3** for an item with a special rarity.
- `1.061^(ilvl−1)` is the same curve as gold income (§23), so an item costs the same **minutes of play** at every
  level: ×1 at ilvl 1, ×3.2 at 20, ×10.3 at 40, ×33 at 60.
- **Sell price** = 25% of price. Salvage vs sell is a real choice.
- **Buyback**: the last 12 things you sold to that vendor, at the sell price (reuse: `town.js`, 12 slots).

| Example | Common | Uncommon | Rare | Epic | Unique | Legendary |
|---|---|---|---|---|---|---|
| ilvl 10 (×1.70) — buy / sell | 26 / 6 | 51 / 13 | 102 / 25 | 255 / 64 | 510 / 128 | 1,020 / 255 |
| ilvl 30 (×5.56) | 83 / 21 | 167 / 42 | 334 / 83 | 834 / 208 | 1,668 / 417 | 3,336 / 834 |
| ilvl 60 (×32.9) | 494 / 123 | 987 / 247 | 1,974 / 494 | 4,935 / 1,234 | 9,870 / 2,468 | 19,740 / 4,935 |

### 22.2 Vendor roster

Town roles are Farhold's (`js/town.js ROLES`: merchant, elder, villager, smith, innkeeper, guard, gambler, broker,
unbinder) plus Wildmarch's. Hubs have all of them; smaller towns have the reuse set by size.

| NPC role | Sells / does | Where | Origin |
|---|---|---|---|
| `npc_merchant` | general goods: Common/Uncommon gear of the town's band (Farhold `stockFor`, three categories + buyback), potions 1–2, food, Repair Kits | every settlement | reuse |
| `npc_smith` | the bench (§17), repairs, Uncommon/Rare weapons and armour | towns size 3+ | reuse |
| `npc_innkeeper` | food, Scroll of Recall, quests; the inn's waystone is a Recall Stone binding point | towns size 3+ | reuse |
| `npc_toolmonger` | Common harvesting tools and the tool roll (page 19 §6.1 says which town sells which tier), Repair Kits | towns size 2+ | new (Farhold sold tools at the merchant) |
| `npc_alchemist` | potions, battle and guardian elixirs, cleansers | hubs | new |
| `npc_enchanter` | rank I glyphs (§18); removes souls (§13.3) | hubs | new (Emberveil role, new stock) |
| `npc_jeweller` | Chipped and Flawed gems, combining, removing gems and jewels (§13.3) | hubs from `greyridge` north + Highcourt | new |
| `npc_engineer` | Tin and Iron frame gadgets with fixed lines (page 19 §17); posts craft orders to player Engineers | Anvilgate, Highcourt, Waystone Camp | new |
| `npc_gambler` | sealed crates (§16.7) | towns size 3+ | reuse |
| `npc_stablemaster` | the region's mounts (§24), stable (swap mount looks) | hubs and every town with a Travel Method station | new (Farhold sold mounts at every merchant) |
| `npc_fletcher` | Common/Uncommon quivers (§9) | Brightwater, Silverbough, Fort Ashfall, Saltmarch | new |
| `npc_quartermaster_<faction>` | standing rewards (§21.2) | faction chapter towns | new |
| `npc_wardrobe_keeper` | appearance, dyes (§25) | hubs | new |
| `npc_broker` | mercenary followers (page 07) | size 2+ | reuse |
| `npc_unbinder` | retraining (page 07; `balance.json retrain`) | size 2+ | reuse |
| `npc_collector` | buys trophies for 3× + reputation (§16.9) | hubs | new |
| `npc_banker` / `npc_trading_post` | page 15 | hubs | new |

Incidents can move prices (reuse: `data/incidents.json` `shopMult` 0.7–1.5, e.g. a siege raises prices 30%).

### 22.3 Fixed prices (not by formula)

| Thing | Price (gold) |
|---|---|
| Inventory bags | 8-slot 100 · 12-slot 800 · 16-slot 6,000 · 20-slot drops only (Challenge end bosses 1%, Depth Cache from R 20 2%) |
| Bank tabs | 1st free, 2nd 1,000, 3rd 5,000, 4th 25,000, 5th 100,000 |
| **Travel Method** fare (page 20 owns the routes) | routed wagon or trail creature: `2 × band`; scheduled boat, barge or train: `3 × band`; flyer (where page 20 has one): `6 × band` — "band" is the destination region's gold multiplier (§23) |
| Waystone Scroll / Scroll of Calling | §20.5 |
| Unbinder (page 07) | spell 120 + 20/level, perk 80 + 12/level, talent 60 + 8/level (reuse) |
| Removing a jewel / a soul | §13.3 |
| Appearance change | 5% of the source item's sell price, min 10 |
| Dye | 25 (common colours) to 2,500 (metallic) |
| Guild charter | 100 (page 15) |
| Trading Post | 1% listing deposit, 5% cut (§15.5) |

---

## 23. The economy: sources and sinks

Target gold income from ordinary play (kills + quests + selling), used to tune everything above:

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
| 52–60 | Kingsfire | 12 | 6,500 |
| 60 | Spire Isle / endgame | 14 | 8,000 |

An ordinary kill pays `2 × 1.061^(L − 1)` gold 60% of the time (2 at level 1, 11 at 30, 66 at 60); at about 100 kills
an hour that is ≈120 gold an hour at level 1 and ≈4,000 at level 60 — about half the target, with quests, selling
and chests making up the rest. Gold find (§14) raises all of it.

**Sources:** kills (≈45%), quests (≈30%), selling items and junk (≈15%), chests, trophies and events (≈10%).

**Sinks** (targets as a share of a level-60 player's income over a week of play):

| Sink | Share | Notes |
|---|---|---|
| Bench gold costs (§17.3) | 15% | the steadiest sink |
| Sockets: adding, removing jewels and souls (§13.2–13.3) | 10% | the endgame's biggest new sink |
| Repairs (§19) | 10% | deaths only |
| Consumables | 15% | flasks, food, potions, fortune elixirs |
| Glyphs, gems and gadgets | 10% | |
| Faction quartermasters (§21.2) | 10% | jewels, gear, mounts |
| Mounts | 5% (levelling), 2% (60) | |
| Travel Method fares, scrolls | 5% | |
| Gambler | 5% | optional |
| Trading Post cut | 5% of what is traded | removes gold on every sale |
| Appearance, dyes, bags, bank tabs, Unbinder | 5% | |

Gold inflation will be the first economy problem after launch; the Trading Post cut, bench costs and socket costs are
the three dials (all in `data/balance.json`, §27).

---

## 24. Mounts

`(reuse: prototypes/farhold/js/gear.js — mounts are loot: they roll a rarity, carry mount-only affixes and price
like gear)` Page 07 owns the riding ranks and their quests; page 20 §4 owns the travel rules (speeds, swimming,
flying); this page owns the **species** and the **catalogue**. **(widened in round 2:** dinosaurs, giant frogs and
other aquatic hybrids, rams, beetles, lizards, big cats, wolves and more, canon §12.3)

### 24.1 Speed by riding rank (page 20 §4.1, repeated for the catalogue)

**Speed is set by your riding rank, never by the species** (so no species outruns another). Species differ by jump,
gallop, terrain tricks, swimming, seats and look.

| Rank | Level | Ground | Road (×1.25) | Water | Air |
|---|---|---|---|---|---|
| Riding I | 10 | 8.6 m/s | 10.8 m/s | put off in deep water; **aquatic** mounts swim at 6.9 m/s | winged mounts glide |
| Riding II | 20 | 10.8 m/s | 13.5 m/s | aquatic mounts swim at 8.6 m/s | glide |
| Riding III | 40 | 10.8 m/s | 13.5 m/s | **every** mount swims (4.9 m/s; aquatic 8.6 m/s) and leaps 6 m | glide |
| Riding IV | 60 | 10.8 m/s | 13.5 m/s | as III | winged mounts **fly** at 13.5 m/s |

A mount's rarity adds **affixes** (Surefooted, Long-winded, Trampling, Calm, §11), never speed. The first time you
ride a mount its **look is learnt by your account** (§15.2) and appears in the stable for every character; the item
itself stays a tradeable item in the mount slot.

### 24.2 Species

`creature` = the body in `avatar-3d/js/creature-types.js` (reuse) or a **new** body page 17 must add. Tricks are
page 20 §4.2's.

| Species | `creature` | Jump (m) | Gallop (s) | Tricks and perks | Swims before Riding III? |
|---|---|---|---|---|---|
| Horse (trail horse, courser, destrier, pony) | `horse`, `courser`, `pony` (reuse) | 1.3–1.6 | 18–26 | Road-runner: +5% extra on roads (inside the road cap) | no |
| Great Elk | `elk` (reuse) | 2.1 | 40 | Snow-runner | no |
| Stag | `deer` (reuse) | 2.2 | 22 | Long leap | no |
| Boar | `boar` (reuse) | 1.3 | 30 | Surefoot; Trampling 10 built in | no |
| Ram | **new** `ram` (a stocky quad, curled horns) — page 13's Frost Ram uses `deer` until it exists | 2.4 | 26 | Surefoot; climbs slopes up to 50° (others 40°) | no |
| Raptor Runner (dinosaur) | **new** `raptor` (a two-legged runner: long tail, forward-leaning body) | 2.4 | 16 | Long leap; Sand-runner; **Sprint**: double-tap forward for 3 s at the next rank's speed (once per 20 s; Riding II and up: +10% for 3 s) | no |
| Crested Strider (dinosaur) | **new** `strider` (a tall plains dinosaur on two legs, a sail-like crest on its back) | 1.0 | 50 | **Two seats**: one party member can ride behind you (`E` on your mount) | no |
| Horned Grazer (dinosaur) | **new** `grazer` (a heavy quad dinosaur, three horns and a neck frill) | 0.8 | 60 | Trampling 20 built in; cannot be dazed off by a knockback (a hit still dazes you) | no |
| Giant Frog (aquatic hybrid) | `frog` (reuse) | 2.4 (4.0 at Riding III) | 24 | Long leap; dives 8 m for 20 s; leaps 3 m from water onto a bank | **yes** |
| Tidewalker Turtle (aquatic hybrid) | `turtle` (reuse) | 0.8 | 60 | dives; 10% less damage taken while mounted out of combat (falls, traps) | **yes** |
| River Crocodile (aquatic hybrid) | `crocodile` (reuse) | 1.0 | 40 | dives; Sand-runner on mudflats | **yes** |
| Sea Serpent (aquatic hybrid) | `snake` (reuse, long) | 0.5 | 45 | dives; on land it slithers (camera stays level) | **yes** |
| Dune Lizard | `crocodile` (reuse, sand skin, raised legs) | 1.8 | 30 | Sand-runner | no |
| Mossback Beetle / Scarab Runner | `beetle` (reuse) | 1.2 | 40 | Surefoot; no slow from mud, snow or sand | no |
| Sabrecat | `saber_cat` (reuse) | 2.0 | 22 | Quiet: enemies notice you 30% closer (page 05 noticing) | no |
| Snow Cat | `cat` (reuse, large) | 2.2 | 22 | Snow-runner | no |
| Dire Wolf / Warhound | `dire_wolf`, `hound` (reuse) | 1.8–1.9 | 26–28 | Pack: while 2+ party members ride within 20 m, gallop lasts 25% longer | no |
| Great Bear | `bear` (reuse) | 1.2 | 45 | Snow-runner; Trampling 20 built in | no |
| Spider | `spider` (reuse) | 1.0 | 30 | climbs slopes up to 60° | no |
| Salamander | `crocodile` (reuse, lava seams) | 1.2 | 30 | cosmetic fire trail | no |
| Titan (walking throne, land-giant) | `titan` (reuse, biped; page 12's d15/d16 mounts) | 1.0 | 40 | Trampling 15 built in; cosmetic heavy footfalls | no |
| Floating Stone | **new** hover slab (page 13) | 1.5 | ∞ | hovers over water at ground speed (it does not swim or dive) | over water, yes |
| Clockwork Strider | **new** mechanical biped (page 19 §17.6) | 1.2 | ∞ (no stamina) | made by Engineers; tradeable | no |
| Longshank Calf | **new** `longshank` (page 20's Travel Method strider, young) | 1.0 | 40 | wades water up to 3 m deep without swimming | wades |
| Griffin (winged) | `griffin` (reuse) | 3.0 | 30 | Glide; flies at Riding IV | no |
| Drake (winged) | `drake` (reuse) | 2.0 | 30 | Glide; flies at Riding IV | no |
| Dragon (winged) | `dragon` (reuse) | 2.4 | 35 | Glide; flies at Riding IV | no |
| Phoenix (winged) | `phoenix` (reuse) | 2.6 | 30 | Glide; flies at Riding IV | no |
| Great Owl (winged) | `owl` (reuse, large) | 2.8 | 30 | Glide; flies at Riding IV; Quiet | no |

**For page 17:** every mount body needs a **`saddle` attach point** (where the rider sits, plus a second one,
`saddle_2`, on the Crested Strider) and a `bridle` point for the reins; the new bodies (`ram`, `raptor`, `strider`,
`grazer`, `longshank`, the hover slab, the clockwork biped) need them from the start.

### 24.3 The catalogue

"Price" is gold (`basePrice × band gold multiplier`, §22, where it says "× band"). Standing tiers are page 07's.

| id | Mount | Species | Source | Price |
|---|---|---|---|---|
| `it_mount_trail_horse` | Trail Horse | horse | `q_hc_saddle_and_bridle` (Riding I, page 07) | quest |
| `it_mount_dune_strider` | Dune Strider (Uncommon) | horse, desert tack | `q_ss_the_sand_runners` (Riding II) | quest |
| `it_mount_tide_steed` | Tide Steed (Rare) | horse, sea-green and finned — **aquatic** | `q_dc_the_tide_steed` (Riding III) | quest |
| `it_mount_stormwing` | Stormwing (Epic) | griffin, storm-grey — winged | `q_sky_5` (Riding IV) | quest |
| `it_mount_moor_pony` | Moor Pony | pony | Hearthvale stablemaster | 140 × band |
| `it_mount_reedstrider` | Reedstrider | giant frog — **aquatic** | Mossfen stablemaster (Reedhollow) | 300 × band |
| `it_mount_bog_toad` | Bog Toad | giant frog (warty, brown) — **aquatic** | rares in `mossfen`, 1% | drop |
| `it_mount_tusker` | Greyridge Tusker | boar | Greyridge stablemaster | 500 × band |
| `it_mount_courser` | Courser | courser | Highcourt stablemaster, level 20 | 420 × band |
| `it_mount_dune_lizard` | Dune Lizard | dune lizard | Sunscar stablemaster | 600 × band |
| `it_mount_dray_elk` | Dray Elk | great elk | Whisperwood stablemaster | 760 × band |
| `it_mount_steppe_raptor` | Steppe Raptor | raptor runner (dinosaur) | Cinder Steppe stablemaster (Fort Ashfall), level 28 | 900 × band |
| `it_mount_crested_strider` | Crested Strider | crested strider (dinosaur, two seats) | Cinder Steppe stablemaster, level 32 | 1,200 × band |
| `it_mount_snow_cat` | Snow Cat | snow cat | Frostmantle stablemaster | 1,000 × band |
| `it_mount_rimehold_bear` | Rimehold Bear | great bear | Frostmantle stablemaster (Rimehold), level 36 | 1,400 × band |
| `it_mount_river_crocodile` | River Crocodile | crocodile — **aquatic** | Drowned Coast stablemaster (Saltmarch) | 1,200 × band |
| `it_mount_horned_grazer` | Horned Grazer | horned grazer (dinosaur) | Kingsfire stablemaster (Last Light), level 52 | 1,800 × band |
| `it_mount_longshank_calf` | Longshank Calf | longshank calf | keepers at any Longshank station (page 20), once you have ridden 20 Longshank routes | 2,000 × band |
| `it_mount_wardens_destrier` | Warden's Destrier | horse, barded | `fac_wardens` Kindred (§21.2) | 8,000 |
| `it_mount_crown_courser` | Crown Courser | courser, barded | `fac_crown_assembly` Kindred | 8,000 |
| `it_mount_crag_ram` | Crag Ram | ram | `fac_deepforge_clans` Kindred | 8,000 |
| `it_mount_moonwell_stag` | Moonwell Stag | stag, pale and glowing antlers | `fac_greenhand` Kindred | 10,000 |
| `it_mount_scarab_runner` | Scarab Runner | beetle, brass-green | `fac_lantern_house` Kindred | 10,000 |
| `it_mount_tidewalker` | Tidewalker Turtle | turtle — **aquatic** | `fac_cutwater` Kindred (round 1 had it on the Drowned Coast world boss; page 13 gives that boss `it_mount_drowned_horse`) | 10,000 |
| `it_mount_dune_sabrecat` | Dune Sabrecat | sabrecat | `fac_quiet_wake` Kindred; `d05_glass_tombs` secret boss 20% (page 09 §8) | 12,000 |
| `it_mount_clockwork_strider` | Clockwork Strider | mechanical biped | Engineering band 200 (page 19 §17.6) | crafted |
| `it_mount_mine_crawler` | Mine Crawler | beetle | Grief-in-Iron (`greyridge` world boss), 1% of chests (page 13) | drop |
| `it_mount_sand_strider` | Sand Strider | raptor runner, sand-striped | the Glass Wyrm (`sunscar`), 1% | drop |
| `it_mount_silkfall_spider` | Silkfall Spider | spider, white | the Hungering Brood (`whisperwood`), 1% | drop |
| `it_mount_carrion_griffin` | Carrion Griffin | griffin, ragged — winged | the Carrion Crown (`cinder_steppe`), 1% | drop |
| `it_mount_frost_ram` | Frost Ram | ram, white | the Standing Ruin (`frostmantle`), 1% | drop |
| `it_mount_drowned_horse` | Drowned Horse | courser, kelp and bones | the Sallow King (`drowned_coast`), 1% | drop |
| `it_mount_floating_stone` | Floating Stone | hover slab | the Unmoored (`riftmarch`), 1% | drop |
| `it_mount_magma_salamander` | Magma Salamander | salamander | Slagborn (`kingsfire`), 1% | drop |
| `it_mount_haywain_pony` · `it_mount_midwinter_stag` · `it_mount_bloom_toad` · `it_mount_sunwake_serpent` | seasonal (Haywain Pony, Midwinter Stag, Bloom Toad — aquatic, Sunwake Serpent — aquatic) | pony · great elk · giant frog · sea serpent | page 13 §7's seasonal world bosses, 1% | drop |
| `it_mount_ashfang` | Ashfang Dire Wolf | dire wolf | Cinder Steppe war-camp warlords, 1% | drop |
| `it_mount_warhound` | Warmaster's Hound | warhound | `d09_warmasters_pit` Depth Cache, reward depth 10+, 1% | drop |
| `it_mount_ash_hound` | Ash Hound | warhound, coal-red eyes | `d15_fire_court` s1 `b_kennelmaster_varro`, 2% per player (page 12) | drop |
| `it_mount_firewing_whelp` | Firewing Whelp | dragon, young (×1.4) — winged | `d15_fire_court` B4 `b_vaelkyr_firewing`, 1% per player (page 12) | drop (replaces this page's round-1 `it_mount_emberdrake` / `it_mount_cinder_drake`) |
| `it_mount_fire_throne_titan` | Fire Throne Titan | titan, a walking throne | `d15_fire_court` end boss `b_fire_king_kaedros`, 2% per player (page 12) | drop |
| `it_mount_glass_charger` | Glass Charger | courser, glass and fire | `d15_fire_court` secret boss `b_ysa_varn_kindled`, 2% per player (page 12) | drop |
| `it_mount_rifthound` | Rifthound | dire wolf, translucent grey, trails mist | `d16_the_spire` s1 `b_grey_and_greyer`, 2% per player (page 12) | drop (was `it_mount_veilhound`) |
| `it_mount_marchheart_colossus` | Marchheart Colossus | titan, a small land-giant in the continent's colours | `d16_the_spire` secret boss `b_marchheart`, 2% per player (page 12) | drop (replaces this page's `it_mount_spire_dragon`) |
| `leg_ashwind_stallion` | The Ashwind Stallion (Legendary mount) | courser | page 09 §6 (row 81; page 09 owns the id) | drop |

**Flying (canon §10):** winged mounts glide before Riding IV and fly once you have it, where page 20 §4.4 allows.

---

## 25. Appearance: the wardrobe and dyes

Farhold has an appearance editor for the body (`js/bodypresets.js`, `js/appearance.js`) and none for gear. **(new)**

- **Learning a look.** An item's look is **learnt by your account** the first time you **equip** it or **loot** it.
  Quest-reward choices you did not pick are not learnt. Secret bosses give one look guaranteed (§16.4).
- **Applying** (`npc_wardrobe_keeper`, `scr_wardrobe`): replace any equipped item's look with a learnt look of the
  **same slot** and an armour type **you can wear**; weapons within the same **type** (a sword look on a sword).
  Cost: §22.3. Removing a look is free.
- **Hide**: head, shoulders and back can each be hidden (toggle on the doll; page 04 settings `set.appearance.hide_head`,
  `hide_shoulders`, `hide_back`). The tool is drawn only while gathering.
- **Dyes**: Chibi 2 recolours gear through colour channels (reuse: avatar-2d recolour, Chibi 2 part colours). Every
  armour piece has **3 dye channels** (main, trim, metal). A dye is **learnt by your account** after its first use.
  48 dyes: 24 common (25 gold), 16 rare (from rares and quests), 8 metallic (2,500 gold or Challenge end bosses 1%).
- **Outfits**: save up to 10 full looks per character and swap them in one click out of combat.
- **Mount looks**: the stable (§24) swaps between any learnt mount model; the equipped mount item's affixes stay.
- **Special rarities** keep their card look but do not change the item's look on the character (except Living,
  whose item grows faint leaves at Growth 5 and 10, and Electrified, whose weapon throws a spark on each proc).

---

## 26. The item card

`(reuse: Farhold hud.itemCard / the R22 tooltip, shared/tooltip.js)` — every line is generated from the data and the
same constants the code uses; nothing is typed twice (Farhold `WORDING.md`). Page 03 owns the layout; page 17 the art.

### 26.1 Order, top to bottom

1. **3D portrait** (new): a 160 × 120 px panel at the top showing the item's own Chibi 2 model turning slowly on a
   backdrop in the rarity's colour; drag to turn it; a weapon shows its element's glow if it is branded; armour is
   shown in **your** armour weight. The frame around the whole card is decorated by rarity (§26.2) and overridden by
   a special rarity (§5.2).
2. **Name** in the rarity colour (Legendary shimmers), with the special-rarity **glyph** in front of it (§5).
3. `Rarity · Type` — "Epic Longsword", "Set piece · Plate Pauldrons", "Legendary Ring", "Uncommon Jewel · Crimson".
4. `Item level 44` — one number, which is also the level needed; in red if you are below it. `Requires: heavy armour`
   in red if you cannot wear the type.
5. **Tags** line (new): grey chips, lit for tags one of your equipped skills carries (§7.5).
6. **Base**: "46–92 damage · every 0.64 s · 3.0 m reach", "Armour 120 · −2 dodge", "+22 arrow damage".
7. **Implicit** line in pale grey (a quiver's, focus's or staff's tag line, §7.4).
8. **Affixes**, one per line, in Farhold's sentence form ("+21% critical chance", "+43% damage to targets below 25%
   health"); a line the bench changed is marked with a small anvil; a line past the cap shows the capped value;
   an Ancient item shows its factor ("Ancient 114%") and underlines values pushed past their normal top.
9. **Starwoven line** (if any), in star-blue with the Starwoven glyph.
10. **Sockets**, one row per socket (new): the kind's pip (§13), then either the socketed thing's line ("Radiant
    Garnet: +25% gold find") or "Empty Jewel socket"; a greyed row for an inactive soul says why; an added socket
    says "(added)".
11. **Glyph** in pale gold.
12. **Power** block (Unique / Legendary) in the rarity colour, the full sentence with numbers. On a weapon a Druid
    can carry, a grey line under the power says **"Works in forms"** (the power is written "on hit" or "on kill") or
    **"Grove form only"** (it names a staff spell, a wand bolt or a charged attack, so it works only in the druid's
    normal, unshifted form) ([classes/druid.md](classes/druid.md)).
13. **Set block**: set name, pieces owned n/6 with each piece name ticked or grey, then each bonus (inactive greyed).
14. **Special-rarity block**: Living's Growth bar and next step ("Growth 6 · 412 / 420 to 7"); Electrified's arc
    numbers.
15. **Flavour** in italics (Farhold `lore`).
16. Footer: `Durability 88/100`, `Sell 1,234 gold`, **"Quest item"** in place of the sell line for quest items, and
    **compare** (Shift, page 02): green/red deltas against your equipped item in that slot — for rings, against the
    worse of the two; for a jewel, against the jewel in your best matching socket.

### 26.2 The frame by rarity

| Rarity | Border | Corners | Header plate behind the name | Portrait backdrop | Motion |
|---|---|---|---|---|---|
| Common | 1 px grey `#6a655e` | none | none | flat dark grey | none |
| Uncommon | 1 px blue | small round studs | none | blue gradient | none |
| Rare | 2 px yellow, doubled | thin filigree | none | yellow gradient with a faint pattern | none |
| Epic | 2 px orange | ornate filigree | a thin plate | orange gradient, soft inner glow | glow pulses every 4 s |
| Unique | 3 px red-orange | carved corner pieces | a carved plate | red-orange, embossed pattern | slow glint along the border |
| Set | 2 px teal, drawn as linked chain | chain-link corners | a plate with the set's crest | teal | none |
| Legendary | 3 px violet | full filigree across the top and bottom | a raised plate | violet with a halo behind the model | an animated shimmer runs round the border |

A **special rarity** replaces the portrait backdrop and adds its effect on top of the rarity frame (§5.2): the
rarity still shows in the border colour; the special rarity shows in the background and glyph.

---

## 27. Data shapes

Page 16 owns file names; this is the item side. Files: `data/items/bases.json`, `data/items/affixes.json`,
`data/items/uniques.json`, `data/items/sets.json`, `data/items/legendaries.json`, `data/items/souls.json`,
`data/items/jewels.json`, `data/items/gems.json`, `data/items/special-rarities.json`, `data/items/mounts.json`,
`data/items/consumables.json`, and a `loot` + `economy` + `magicFind` block in `data/balance.json`.

A dropped item (server-side, saved on the character):

```json
{
  "uid": "i_8f3k2a",
  "base": "longsword",
  "name": "Electrified Longsword of Execution",
  "rarity": "epic",
  "special": { "id": "sr_electrified" },
  "ilvl": 44,
  "slot": "weapon",
  "armourType": null,
  "dice": [46, 92],
  "tags": ["tag_attack", "tag_basic_attack", "tag_melee", "tag_physical"],
  "affixes": [
    { "id": "sharp", "stat": "dmg", "value": 23 },
    { "id": "crit_chance", "stat": "critChance", "value": 21 },
    { "id": "of_str", "stat": "str", "value": 17 },
    { "id": "execute", "stat": "cond_executeDmgPct", "value": 0.43, "crafted": true }
  ],
  "sockets": [
    { "kind": "gem", "item": "gem_onyx_3" },
    { "kind": "jewel", "item": { "uid": "j_77ab", "base": "jwl_crimson", "rarity": "rare", "level": 44,
      "affixes": [ { "id": "ja_physical", "value": 0.11 }, { "id": "ja_melee_attack", "value": 0.16 },
                   { "id": "ja_execute", "value": 0.22 } ] }, "added": true }
  ],
  "glyph": "it_glyph_keenness_2",
  "brand": null,
  "bench": { "refine": 2, "hone": 1, "reweaves": 1 },
  "durability": 108,
  "look": null,
  "dyes": null,
  "kills": 311,
  "questItem": false,
  "source": { "kind": "dungeon", "id": "d10_rimefang_caverns", "boss": 3, "difficulty": "challenge" }
}
```

A Living item carries `"special": { "id": "sr_living", "growth": 6, "points": 412 }`; an Ancient item
`{ "id": "sr_ancient", "factor": 1.14 }`; a Twinned or Starwoven item only the id (their effect is in the rolled
values and the extra affix).

A named item definition (unique / set piece / legendary) extends Farhold's `uniques.json` row:

```json
{
  "id": "leg_voidwalker_soles",
  "kind": "legendary",
  "name": "Voidwalker Soles",
  "slot": "feet",
  "base": "light_boots",
  "ilvl": 60,
  "fixed": [ { "stat": "dex", "value": 30 }, { "stat": "hp", "value": 300 }, { "stat": "moveSpeed", "value": 0.05 } ],
  "random": [ { "stat": "dodge", "min": 3, "max": 6 } ],
  "tags": [],
  "power": "void_heal",
  "powerNumbers": { "healSeconds": 1.0, "afterReduce": 0.2 },
  "sources": [ { "kind": "dungeon", "id": "d11_saltdeep_cathedral", "difficulty": "challenge", "boss": "secret", "exclusive": true } ],
  "lore": "They step where the dark pools, and the dark forgets to bite."
}
```

A soul definition:

```json
{
  "id": "soul_falling_star",
  "name": "Falling Star",
  "socket": ["weapon"],
  "requires": { "build": "caster" },
  "power": "soul_falling_star",
  "powerNumbers": { "chance": 0.08, "delay": 1.2, "spellPowerPct": 1.2, "radius": 3, "icd": 2 },
  "sources": [ { "kind": "worldboss", "id": "b_glass_wyrm", "chance": 0.04 } ],
  "lore": "It was aimed at something else. It will do."
}
```

---

## 28. Farhold affix bugs

Fixed in Farhold round 28 (see `prototypes/farhold/RPG.md`). Wildmarch's values are the ones in §11:
`of Resonance` is a share (5–12% spell power after a skill, not +300–800%), `of Second Wind` saves you at **20%**
health once per 90 s (not 100%), and `of Laceration` bleeds for **30–60% of the crit** over 6 s (not a flat 0.3–0.6
a second).

---

## 29. Notes for other pages

| Page | What it needs from here |
|---|---|
| 02 Controls | `belt1`…`belt4` potion keys; Shift = compare on the item card; Alt = show ground loot labels; a Salvage key in the bag (suggest `X`); `E` on your mount = let a party member ride your Crested Strider's second seat |
| 03 UI screens | `scr_character` Equipment tab (15 slots incl. **Tool**, socket pips, souls `n/3`, §2.2), the item card's portrait, frames, tags line and socket rows (§26), `scr_bench`, `scr_vendor`, `scr_gambler`, `scr_enchanter`, `scr_jeweller`, `scr_wardrobe`, `scr_stable`, the quartermaster screen (§21.2), the **Magic Find** panel (raw / effective / run bonus, §14.3), the loot panel with the loot-focus dropdown, the legendary loot banner. **Remove** the Currency tab and the weekly vault |
| 04 Settings | `set.gameplay.auto_loot` (on), `set.gameplay.loot_filter` (All / Uncommon+ / Rare+ / Epic+ / Special only, default All), `set.gameplay.confirm_salvage_from` (Rare / Epic / Never, default Rare), `set.interface.show_item_level` (on), `set.interface.compare_on_hover` (off = Shift), `set.interface.card_portrait` (on; off shows a flat icon), `set.appearance.hide_head/shoulders/back` |
| 05 Combat | the item-level term replaces `player.damagePerLevel` (§8.1); gear-side totals (§6.3); the tag list and **where the one summed tag bonus is multiplied** (§7.2); basic-attack tags of wands and staves (§7.2); deflect (§11 `deflect`); statuses used by brands, glyphs and quivers |
| 07 Progression | riding ranks (§24.1 repeats page 20's table), the Unbinder, standing tiers and the amounts in §16.6 / §16.9 |
| 09 Sets / legendaries | the souls catalogue (§13.6 rules), tag uniques (§7.4), tool uniques (§10), class set tokens (§12.1) |
| 10 Bestiary | the special-rarity mapping (§5.5) is page 10's table, repeated; greater-rarity drop modifiers (§16.1) |
| 12 Dungeons | §16.2–16.4 adopt page 12's chances and add floors, gold and socketables; the Depth Cache table is page 12's; §24.3 lists page 12's six d15/d16 mounts and adds two dungeon mounts page 12 does not list yet — `it_mount_dune_sabrecat` (d05 secret boss 20%, page 09 agrees) and `it_mount_warhound` (d09 Depth Cache, reward depth 10+, 1%): adopt or reject them |
| 13 World bosses | §16.5 matches page 13 §5; world-boss mounts in §24.3; `it_mount_tidewalker` moved to the Cutwater quartermaster |
| 15 Social | no binding; Trading Post deposit + cut (§15.5); the trade window's **Commission** tab; guild repairs |
| 16 Tech | the data files in §27; the affix unit test (§6.1); the rarity roll is top-down (§14.4) |
| 17 Art/audio | the card frames (§26.2), the 3D portrait, the five special-rarity glyphs and card effects (§5.2), socket pips (§13), `rarity_legendary.svg`, legendary name shimmer, `loot_legendary`, the **new mount bodies** and their `saddle` / `bridle` attach points (§24.2), the War Standard, satchel, pistol and long-gun held parts, shoulder/back/waist Chibi 2 variants per armour weight |
| 19 Professions | the socket-adding actions (§13.2) for Jewelcrafting, Engineering and Enchanting; gem ids are `gem_…` and there are **10** gems (Amber and Peridot are new, so 50 rough gems); Pearl's jewellery value is item quantity (Amber is the profession-XP gem); tool uniques from Farhold (§10) |
| 20 Travel | Travel Method fares (§22.3), the scrolls and the Recall Stone as items (§20.5), the Longshank Calf mount (§24.3) |

---

## 30. Removed in round 2

Each line is what went, and where it lives now if anywhere.

| Removed | Why | Now |
|---|---|---|
| The **light slot**, every light item (`it_light_guttering_brand`, `it_light_pitch_torch`, `it_light_shuttered_lantern`, `it_light_wisp_lamp`, `it_light_mirror_lamp`, `it_light_arc_lamp`), the light affixes (`light_dmg` "Emberwick", `wide_beam`, `seeking_light`), `npc_lampwright` | always daylight (canon §4) | gone; light-slot uniques and legendaries moved slots (page 09) |
| Item levels above 60, the `heroic` / `ascendant` / `veiled` affix tiers, Ascend, the Veil-touched tier | W17 | gone; §3.4 is the endgame ladder |
| Binding (bind on pickup / equip, account-bound, the 2-hour trade window, refunds) | W18 | every item tradeable except quest items (§15.2) |
| Currencies: Delver's Marks, Oathstones, Glory, Laurels, Veil Sigils, Festival Tokens, reputation tokens, silver and copper coins | W19 / W26 | gold and standing only (§21); dungeon currencies → `WISHLIST.md` |
| Bonus rolls, the weekly vault, daily and weekly quest rewards, the daily limit on rares | W5 / W20 | gone |
| Raid drop tables (§12.4 of round 1), raid item levels, the raid quartermaster, raid-only mounts | W6 | raids → `WISHLIST.md`; d15/d16 carry the story finales' loot |
| The PvP quartermaster and PvP gear | W1 | → `WISHLIST.md` |
| "Magic find only on open-world kills" | owner's magic-find system | removed (§14.1) |
| Fury and Focus resource affixes | W28 | Momentum and Tempo (§6.4) |
| Bench `bore_socket` | sockets are professions now | §13.2 |
| Farhold bug write-up | fixed in Farhold round 28 | §28 |
| Page 08's own d15/d16 mount proposals (`it_mount_cinder_drake`, `it_mount_rift_griffin`, `it_mount_spire_dragon`) | page 12 owns dungeon items (sweep R2) | page 12's six: `it_mount_ash_hound`, `it_mount_firewing_whelp`, `it_mount_fire_throne_titan`, `it_mount_glass_charger`, `it_mount_rifthound`, `it_mount_marchheart_colossus` (§24.3) |
| The party-leader "Need / Greed" option for Normal dungeons | personal loot only, no group rolls anywhere (sweep R2) | gone (§15.3) |
| `it_mount_ashwind_stallion` | page 09 owns generic legendaries | `leg_ashwind_stallion` (§24.3) |
| "Warhorn Maul" (named hammer), bench `forge_trinket` | banned word / no trinket slot | Hornhead Hammer (§8.2), `forge_jewellery` (§17.3) |
