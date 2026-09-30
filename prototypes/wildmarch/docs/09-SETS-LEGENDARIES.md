# WILDMARCH — Design Bible, page 09: sets, legendaries and uniques

> *"Whoever holds it is expected to do something about it."* — Item Vault lore line

**Status:** v0.1 draft — 2026-09-29. Documentation only.
**Owns:** the catalogue — every **generic** set, every **generic** legendary, the headline **generic**
uniques, the minor-power glossary, the index of class sets, and the index of page 12's and page 13's
dungeon- and raid-exclusive items (§3.31).
**Rules live on [page 08](08-ITEMS.md)**: what a unique, a set and a legendary are (§8), binding (§10),
drop rates (§12), item levels (§3). This page only lists things. Class sets and class legendaries are
written in `classes/<id>.md`; §3 below is their index.

---

## Contents

1. [How to read this page](#1-how-to-read-this-page)
2. [Generic sets (20)](#2-generic-sets-20)
3. [Class sets index](#3-class-sets-index) — plus the dungeon/raid-exclusive index (§3.31), duplicates to settle (§3.32) and id collisions (§3.33)
4. [Uniques](#4-uniques)
5. [Unique power glossary](#5-unique-power-glossary)
6. [Legendaries (84)](#6-legendaries-84)
7. [Secret-boss exclusive drops](#7-secret-boss-exclusive-drops)
8. [Where Emberveil's and Farhold's sets went](#8-where-emberveils-and-farholds-sets-went)
9. [Counts and checks](#9-counts-and-checks)

---

## 1. How to read this page

- **Source notation.** `d05_glass_tombs` · boss 2 = the second boss of that dungeon in page 12's order;
  "final" = its last boss; "secret" = its secret boss. `r03_sunken_choir` · b4 = the fourth raid boss in
  page 13's order. "World boss of `frostmantle`" = that region's world boss (page 13 owns its id).
  "World pool 20+" = can drop from any open-world kill of level 20 or more at the page 08 §4 rate.
- **Drop chance** of a named item from a listed boss is the page 08 §12 rate for its kind (legendary /
  set / unique) divided evenly among the named items on that boss's table, unless a number is given here.
- **Item level (ilvl).** Dungeon sources give two: Normal (the dungeon's band) / Heroic (66, final boss 68,
  secret 72). Raids give Normal / Mythic. "Scales" = drops at the level of what dropped it.
- **Stat package.** To keep 200+ rows readable, named items follow one rule unless a row says otherwise:

| Kind | Fixed lines at its ilvl | Random-range line |
|---|---|---|
| Set piece | main attribute of the set `round(0.4 × ilvl)` · CON `round(0.3 × ilvl)` · the base's armour | one line from the set's list, rolled at its ilvl tier |
| Legendary | main attribute `round(0.5 × ilvl)` · CON `round(0.4 × ilvl)` · one slot line (weapon: `sharp` damage at the top of its tier; armour: +health `round(5 × ilvl)`; jewellery: +crit 1% per 10 ilvl, or +healing 1.5% per 10 ilvl for healer powers) | 1–2 lines from the slot's affix pool |
| Unique | as written in its row (Farhold's numbers, at its first level), then scaled with ilvl like any affix | as written |

  "Main attribute" of an **adaptive** piece (see below) is the looter's class main attribute.
- **Adaptive armour** (new): the piece drops in the looter's own armour type (cloth / light / medium /
  heavy) with that type's base armour; its look is the set's look drawn for that weight.
- **Names** are original (canon rule 1). Flavour lines are player-facing and follow `WORDING.md`.
- **Rarity colours** (canon 00 §4): **Legendary** is violet `#c86bff` (the new top tier), **Set** is
  `#2fc4b2`; Farhold's old "legendary" tier is Wildmarch's Epic. Every `leg_` item on this page is drawn in violet.
- **Currencies** use page 08's ids and names (00 §10): gold `cur_gold`, Delver's Marks `cur_delve`,
  Oathstones `cur_oathstone`, Glory `cur_glory`, Laurels `cur_laurels`, Veil Sigils `cur_veil_sigil`,
  reputation tokens `cur_rep_*` (e.g. Warden's Seal `cur_rep_vale`).

---

## 2. Generic sets (20)

### 2.1 Index

| # | Set id | Name | Kind | Armour | Role | Pieces | Where | ilvl |
|---|---|---|---|---|---|---|---|---|
| 1 | `set_wayfarers_heirlooms` | The Wayfarer's Heirlooms | levelling / heirloom | adaptive | any | 6 | Brightwater quartermaster | = your level (1–59) |
| 2 | `set_barrowwarden` | Barrowwarden's Charge | dungeon | slot-agnostic | any | 4 | `d01_hollow_barrow` | 8 / 66 |
| 3 | `set_millrace` | The Millrace | dungeon | light | damage | 4 | `d02_drowned_mill` | 13 / 66 |
| 4 | `set_glasswrights_regalia` | Glasswright's Regalia | dungeon | cloth | caster damage | 6 | `d05_glass_tombs` | 23 / 66 |
| 5 | `set_thornstalker` | The Thornstalker | dungeon | light | melee / ranged damage | 6 | `d07_thornheart` | 29 / 66 |
| 6 | `set_moonwell_vestments` | Moonwell Vestments | dungeon | adaptive | healer | 6 | `d08_moonwell_ruins` | 31 / 66 |
| 7 | `set_pitfighters_harness` | Pitfighter's Harness | dungeon | heavy | melee damage / tank | 6 | `d09_warmasters_pit` | 35 / 66 |
| 8 | `set_saltchoir_raiment` | Saltchoir Raiment | dungeon | adaptive | healer / support | 6 | `d11_saltdeep_cathedral` | 46 / 66 |
| 9 | `set_cindergate_bulwark` | Cindergate Bulwark | dungeon | heavy | tank | 6 | `d13_cindergate` | 58 / 66 |
| 10 | `set_reliquary_keepers` | The Reliquary Keeper's Tokens | Mythic+ | slot-agnostic | any (bonus by role) | 6 | `d14_ashen_reliquary` Mythic+ | 68–78 |
| 11 | `set_barrowkings_tithe` | The Barrowking's Tithe | raid | heavy | tank / melee | 6 | `r01_barrowking` | 34 / 38 |
| 12 | `set_rimecrown_regalia` | Rimecrown Regalia | raid | cloth | caster damage | 6 | `r02_glacier_throne` | 46 / 50 |
| 13 | `set_choir_of_the_deep` | Choir of the Deep | raid | adaptive | healer / support | 6 | `r03_sunken_choir` | 54 / 58 |
| 14 | `set_court_of_embers` | Court of Embers | raid | light | damage | 6 | `r04_ember_court` | 70 / 76 |
| 15 | `set_veilborn_ascendance` | Veilborn Ascendance | raid | adaptive | any (bonus by role) | 6 | `r05_veilspire` | 76 / 82 |
| 16 | `set_trophies_of_the_wild_hunt` | Trophies of the Wild Hunt | world bosses | slot-agnostic | any | 6 | the eight world bosses (Ascendant) | 72 |
| 17 | `set_journeymans_harness` | The Journeyman's Harness | crafted | medium | any medium wearer | 6 | bench + Deepforge patterns | 30 / 60 |
| 18 | `set_veilglass_artifice` | Veilglass Artifice | crafted | adaptive | caster / healer | 6 | bench + Riftwatch patterns | 70 |
| 19 | `set_open_field_vanguard` | Open Field Vanguard | PvP | adaptive | any | 6 | Glory (`cur_glory`) quartermaster | 66 / 72 |
| 20 | `set_mercenary_captains_kit` | The Mercenary Captain's Kit | reputation / endgame vendor | medium | tank / damage hybrid | 6 | Spire Landing (Veil Sigils, `cur_veil_sigil`) | 66 |

Every **dungeon set** also drops in that dungeon's Heroic (ilvl 66, final boss 68) and Mythic+ (end chest),
so a levelling set has a 60 version with the same bonuses. **(new)**

**Duplicates to settle (§3.32).** Rows 2–15 (the dungeon, Mythic+ and raid sets) were drafted in parallel
with page 12's and page 13's own sets for the same instances. §3.32 recommends keeping pages 12/13's sets
(they own the instances) and retiring rows 2–15 from the drop tables. Nothing below is deleted until the
owner decides. Row 2's id `set_barrowwarden` is also used by page 12 for a different set (§3.33 #1).

---

### 2.2 `set_wayfarers_heirlooms` — The Wayfarer's Heirlooms

*Levelling set. Account-bound. "Somebody walked all of this before you. They left their coat."*

| Piece id | Name | Slot | Cost at `npc_quartermaster_vale` (Brightwater): gold + Warden's Seals (`cur_rep_vale`) |
|---|---|---|---|
| `it_wayfarers_hood` | Wayfarer's Hood | head | 2,000 gold + 20 Warden's Seals |
| `it_wayfarers_shoulderguards` | Wayfarer's Shoulderguards | shoulders | 2,000 + 20 |
| `it_wayfarers_coat` | Wayfarer's Coat | chest | 2,000 + 20 |
| `it_wayfarers_travelling_cloak` | Wayfarer's Travelling Cloak | back | 2,000 + 20 |
| `it_wayfarers_breeches` | Wayfarer's Breeches | legs | 2,000 + 20 |
| `it_wayfarers_signet` | Wayfarer's Signet | ring | 4,000 + 40 |

Unlocks once **any character on the account** has reached level 60. Every piece is adaptive and its item
level is the wearer's level (1–59), so it never needs replacing while levelling. Random line: none (fixed
package only). **At 60 the stats switch off**; the looks stay in the wardrobe.

| Pieces | Bonus |
|---|---|
| 2 | +10% experience from kills and quests |
| 4 | +20% experience in total; +10% run speed out of combat |
| 6 | +30% experience in total; Homeward Stone (`it_homeward_stone`, page 07) cooldown 30 → 15 min; dying costs no durability |

---

### 2.3 `set_barrowwarden` — Barrowwarden's Charge

*`d01_hollow_barrow`, any boss. Main attribute: the looter's. "The wardens were buried with their oaths. The oaths got up first."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_barrowwarden_cloak` | Barrowwarden's Cloak | back | `d01_hollow_barrow` boss 1 |
| `it_barrowwarden_sash` | Barrowwarden's Sash (adaptive) | waist | boss 2 |
| `it_barrowwarden_lamp_chain` | Barrowwarden's Lamp-Chain | necklace | final |
| `it_barrowwarden_ring` | Barrowwarden's Ring | ring | final |

Random line from: health, resistance, `dmg_vs_undead`.

| Pieces | Bonus |
|---|---|
| 2 | +5% maximum health; +10% damage to the undead |
| 4 | Your hits on undead have a 15% chance to **Banish**: a non-boss is feared for 2 s; any target takes +20% from you for 4 s (once per target per 10 s) |

---

### 2.4 `set_millrace` — The Millrace

*`d02_drowned_mill`. Light armour, DEX. "It turns whether or not there is grain."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_millrace_cap` | Millrace Cap | head | `d02_drowned_mill` boss 1 |
| `it_millrace_jerkin` | Millrace Jerkin | chest | final |
| `it_millrace_grips` | Millrace Grips | hands | boss 2 |
| `it_millrace_waders` | Millrace Waders | feet | final |

Random line from: attack speed, crit chance, dodge.

| Pieces | Bonus |
|---|---|
| 2 | +6% attack speed |
| 4 | Every 4 s in a fight your next attack is a **Millrace strike**: +60% damage and pushes a non-boss 2 m |

---

### 2.5 `set_glasswrights_regalia` — Glasswright's Regalia

*`d05_glass_tombs`. Cloth, INT, caster damage. "Glass remembers the heat that shaped it."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_glasswright_hood` | Glasswright's Hood | head | `d05_glass_tombs` final |
| `it_glasswright_mantle` | Glasswright's Mantle | shoulders | boss 2 |
| `it_glasswright_robe` | Glasswright's Robe | chest | final |
| `it_glasswright_wraps` | Glasswright's Wraps | hands | boss 1 |
| `it_glasswright_leggings` | Glasswright's Leggings | legs | boss 3 |
| `it_glasswright_slippers` | Glasswright's Slippers | feet | boss 1 |

Random line from: crit chance, spell power, cast speed.

| Pieces | Bonus |
|---|---|
| 2 | +8% spell power |
| 4 | Critical spells leave a **Glass Shard** on the target (max 3). At 3 it shatters: 120% spell power to the target and 50% to enemies within 4 m |
| 6 | While any enemy carries 2+ of your shards: +15% cast speed. Each shatter refunds 5% of your maximum mana |

---

### 2.6 `set_thornstalker` — The Thornstalker

*`d07_thornheart`. Light, DEX, melee or ranged. "The hollow grows around whatever it catches."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_thornstalker_mask` | Thornstalker Mask | head | `d07_thornheart` final |
| `it_thornstalker_spaulders` | Thornstalker Spaulders | shoulders | boss 2 |
| `it_thornstalker_jerkin` | Thornstalker Jerkin | chest | final |
| `it_thornstalker_gloves` | Thornstalker Gloves | hands | boss 1 |
| `it_thornstalker_leggings` | Thornstalker Leggings | legs | boss 3 |
| `it_thornstalker_boots` | Thornstalker Boots | feet | boss 2 |

Random line from: crit chance, crit damage, attack speed.

| Pieces | Bonus |
|---|---|
| 2 | +5% critical chance |
| 4 | Critical hits root a non-boss in thorns for 1.5 s (once per target per 8 s) and make any target bleed 40% of the hit over 4 s |
| 6 | +20% damage to rooted or bleeding enemies. A rooted enemy that dies bursts into thorns: 80% weapon damage within 4 m |

---

### 2.7 `set_moonwell_vestments` — Moonwell Vestments

*`d08_moonwell_ruins`. Adaptive, INT, healer. "The well is dry. The light in it is not."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_moonwell_circlet` | Moonwell Circlet | head | `d08_moonwell_ruins` final |
| `it_moonwell_mantle` | Moonwell Mantle | shoulders | boss 2 |
| `it_moonwell_vestment` | Moonwell Vestment | chest | final |
| `it_moonwell_cord` | Moonwell Cord | waist | boss 1 |
| `it_moonwell_leggings` | Moonwell Leggings | legs | boss 3 |
| `it_moonwell_treads` | Moonwell Treads | feet | boss 1 |

Random line from: healing done, resource regen, cast speed.

| Pieces | Bonus |
|---|---|
| 2 | +8% healing done |
| 4 | Every heal on an ally leaves a **Moonwell pool** (green, beneficial) under them for 4 s, max 2 pools: allies inside regain 2% of maximum health a second |
| 6 | Pools also give 10% damage reduction; your heals on an ally inside a pool are +15% |

---

### 2.8 `set_pitfighters_harness` — Pitfighter's Harness

*`d09_warmasters_pit`. Heavy, STR, melee damage or off-tank. "The crowd is the only armour that matters."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_pitfighter_helm` | Pitfighter's Helm | head | `d09_warmasters_pit` final |
| `it_pitfighter_pauldrons` | Pitfighter's Pauldrons | shoulders | boss 2 |
| `it_pitfighter_cuirass` | Pitfighter's Cuirass | chest | final |
| `it_pitfighter_gauntlets` | Pitfighter's Gauntlets | hands | boss 1 |
| `it_pitfighter_girdle` | Pitfighter's Girdle | waist | boss 3 |
| `it_pitfighter_greaves` | Pitfighter's Greaves | legs | boss 1 |

Random line from: STR, health, crit damage.

| Pieces | Bonus |
|---|---|
| 2 | +5% maximum health and +5% damage |
| 4 | **Roar of the Pit**: +2% damage and +2% damage reduction for each enemy within 8 m (max 5) |
| 6 | At 5 stacks your next swing becomes a full-circle slam: 200% weapon damage within 5 m; taunts non-bosses it hits (once per 12 s) |

---

### 2.9 `set_saltchoir_raiment` — Saltchoir Raiment

*`d11_saltdeep_cathedral`. Adaptive, INT, healer or support. "They sang until the sea came in. Then they sang under it."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_saltchoir_cowl` | Saltchoir Cowl | head | `d11_saltdeep_cathedral` final |
| `it_saltchoir_stole` | Saltchoir Stole | shoulders | boss 2 |
| `it_saltchoir_raiment` | Saltchoir Raiment | chest | final |
| `it_saltchoir_gloves` | Saltchoir Gloves | hands | boss 1 |
| `it_saltchoir_leggings` | Saltchoir Leggings | legs | boss 3 |
| `it_saltchoir_sandals` | Saltchoir Sandals | feet | boss 2 |

Random line from: healing done, haste (cast speed), resource.

| Pieces | Bonus |
|---|---|
| 2 | +8% healing done; +5% maximum resource |
| 4 | Every 10th heal is a **Hymn**: it also heals every ally within 15 m for 30% of its amount |
| 6 | Hymns remove one harmful status from each ally they touch and give them +8% haste for 6 s |

---

### 2.10 `set_cindergate_bulwark` — Cindergate Bulwark

*`d13_cindergate`. Heavy, CON/STR, tank. "The gate did not fall. The gate was the last thing to fall."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_cindergate_greathelm` | Cindergate Greathelm | head | `d13_cindergate` final |
| `it_cindergate_pauldrons` | Cindergate Pauldrons | shoulders | boss 2 |
| `it_cindergate_breastplate` | Cindergate Breastplate | chest | final |
| `it_cindergate_gauntlets` | Cindergate Gauntlets | hands | boss 1 |
| `it_cindergate_legplates` | Cindergate Legplates | legs | boss 3 |
| `it_cindergate_sabatons` | Cindergate Sabatons | feet | boss 1 |

Random line from: armour, block chance, threat (`Provoking`).

| Pieces | Bonus |
|---|---|
| 2 | +8% armour; +10% threat |
| 4 | Blocking, or being hit by a boss, stores a **Cinder** (max 10): 1% damage reduction each. At 10, your next attack spends them: 300% weapon damage as fire in a 6 m cone and heals you 5% of maximum health |
| 6 | While you hold 10 Cinders, the first hit worth more than 25% of your maximum health is reduced by 40% and costs 5 Cinders |

---

### 2.11 `set_reliquary_keepers` — The Reliquary Keeper's Tokens

*`d14_ashen_reliquary` Mythic+ end chest only (ilvl 68 + key level, max 78). Any class. "Carry the ash. Do not ask whose."*

| Piece id | Name | Slot |
|---|---|---|
| `it_reliquary_keeper_mantle` | Keeper's Mantle (adaptive) | shoulders |
| `it_reliquary_keeper_shroud` | Keeper's Shroud | back |
| `it_reliquary_keeper_cord` | Keeper's Cord (adaptive) | waist |
| `it_reliquary_keeper_urn_chain` | Keeper's Urn-Chain | necklace |
| `it_reliquary_keeper_band_of_ash` | Band of Ash | ring |
| `it_reliquary_keeper_band_of_ember` | Band of Ember | ring |

Random line from: main attribute, crit chance, cooldown reduction.

| Pieces | Bonus |
|---|---|
| 2 | +4% main attribute |
| 4 | By role — **Tank**: 10% damage reduction for 4 s after a dodge or a block (once per 10 s) · **Healer**: +10% healing on the lowest-health ally within 30 m · **Damage / Support**: +10% damage for 6 s after you interrupt or dispel |
| 6 | **Keystone Oath**: every 60 s your group gains +10% to all stats for 10 s inside a Mythic+ run (+5% anywhere else). Oaths from two wearers do not stack |

---

### 2.12 `set_barrowkings_tithe` — The Barrowking's Tithe

*`r01_barrowking` (5 bosses). Heavy, STR, tank or melee. "He took a tenth of everything. He is still collecting."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_barrowking_gauntlets` | Tithe-Taker's Gauntlets | hands | `r01_barrowking` · b1 |
| `it_barrowking_sabatons` | Tithe-Taker's Sabatons | feet | b2 |
| `it_barrowking_pauldrons` | Tithe-Taker's Pauldrons | shoulders | b3 |
| `it_barrowking_legguards` | Tithe-Taker's Legguards | legs | b4 |
| `it_barrowking_crown_helm` | Tithe-Taker's Crown-Helm | head | b5 (final) |
| `it_barrowking_hauberk` | Tithe-Taker's Hauberk | chest | b5 (final) |

Random line from: health, armour, STR.

| Pieces | Bonus |
|---|---|
| 2 | +8% maximum health |
| 4 | Kills and blocks give a **Tithe** (max 5): +3% armour each. Dropping below 40% health spends all 5 to heal 20% of maximum health (once per 30 s) |
| 6 | Spending Tithes also raises a **Barrow Shield** on allies within 8 m worth 10% of their maximum health for 6 s |

---

### 2.13 `set_rimecrown_regalia` — Rimecrown Regalia

*`r02_glacier_throne` (6 bosses). Cloth, INT, caster damage. "The throne is not cold. The throne is what cold is afraid of."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_rimecrown_slippers` | Rimecrown Slippers | feet | `r02_glacier_throne` · b1 |
| `it_rimecrown_handwraps` | Rimecrown Handwraps | hands | b2 |
| `it_rimecrown_leggings` | Rimecrown Leggings | legs | b3 |
| `it_rimecrown_mantle` | Rimecrown Mantle | shoulders | b4 |
| `it_rimecrown_robe` | Rimecrown Robe | chest | b5 |
| `it_rimecrown_circlet` | Rimecrown Circlet | head | b6 (final) |

Random line from: spell power, crit chance, cast speed.

| Pieces | Bonus |
|---|---|
| 2 | +8% spell power |
| 4 | Your spells Chill (−20% move speed for 3 s); Chilled enemies take +10% from your spells |
| 6 | Every 20 s your next spell is **Rimecrowned**: +100% damage; it Freezes non-bosses it hits for 2 s, and a boss it hits takes +20% from you for 4 s |

---

### 2.14 `set_choir_of_the_deep` — Choir of the Deep

*`r03_sunken_choir` (7 bosses). Adaptive, INT, healer or support. "Down there, every voice is the same voice."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_deepchoir_treads` | Deepchoir Treads | feet | `r03_sunken_choir` · b1 |
| `it_deepchoir_gloves` | Deepchoir Gloves | hands | b2 |
| `it_deepchoir_cincture` | Deepchoir Cincture | waist | b3 |
| `it_deepchoir_mantle` | Deepchoir Mantle | shoulders | b4 |
| `it_deepchoir_leggings` | Deepchoir Leggings | legs | b5 |
| `it_deepchoir_vestment` | Deepchoir Vestment | chest | b6 |

(b7, the final boss, drops any piece.) Random line from: healing done, haste, resource regen.

| Pieces | Bonus |
|---|---|
| 2 | +8% healing done; +5% haste |
| 4 | Your heals and buffs give the ally a **Chorus** stack (max 3, 10 s): +3% damage and +3% damage reduction each |
| 6 | An ally at 3 Chorus has the next void-zone tick or danger-zone hit on them absorbed completely (once per ally per 20 s; never a one-shot mechanic, page 11) |

---

### 2.15 `set_court_of_embers` — Court of Embers

*`r04_ember_court` (8 bosses). Light, DEX, damage. "At court, everyone burns. The question is only how brightly."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_ember_courtier_boots` | Ember Courtier's Boots | feet | `r04_ember_court` · b1 |
| `it_ember_courtier_gloves` | Ember Courtier's Gloves | hands | b2 |
| `it_ember_courtier_sash` | Ember Courtier's Sash | waist | b3 |
| `it_ember_courtier_leggings` | Ember Courtier's Leggings | legs | b4 |
| `it_ember_courtier_epaulets` | Ember Courtier's Epaulets | shoulders | b5 |
| `it_ember_courtier_doublet` | Ember Courtier's Doublet | chest | b6 |

(b7 and b8, the final boss, each drop any piece.) Random line from: crit chance, crit damage, DEX.

| Pieces | Bonus |
|---|---|
| 2 | +5% critical chance; +10% critical damage |
| 4 | Critical hits **Ignite** the target: 30% of the crit as fire over 4 s, stacking to 3 |
| 6 | Enemies at 3 Ignites take +15% from you; when one dies its Ignites jump to 2 enemies within 8 m |

---

### 2.16 `set_veilborn_ascendance` — Veilborn Ascendance

*`r05_veilspire` (10 bosses). Adaptive, any role. "Step through. The Veil is thinner than it looks, and so are you."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_veilborn_sandals` | Veilborn Sandals | feet | `r05_veilspire` · b1 |
| `it_veilborn_grips` | Veilborn Grips | hands | b2 |
| `it_veilborn_girdle` | Veilborn Girdle | waist | b3 |
| `it_veilborn_mantle` | Veilborn Mantle | shoulders | b4 |
| `it_veilborn_legwraps` | Veilborn Legwraps | legs | b5 |
| `it_veilborn_vestment` | Veilborn Vestment | chest | b6 |

(b7–b10 each drop any piece.) Random line from: main attribute, crit chance, haste.

| Pieces | Bonus |
|---|---|
| 2 | +6% main attribute |
| 4 | By role — **Tank**: every 10 s the Veil absorbs 25% of the next hit · **Healer**: every 8th heal also shields its target for 30% of the amount · **Damage / Support**: every 8 s your next damaging spell or attack echoes at 40% on the same target |
| 6 | **Veilborn**: every 60 s you step into the Veil for 4 s — +20% damage and healing, you pass through enemies, and void-zone ticks cannot hurt you |

---

### 2.17 `set_trophies_of_the_wild_hunt` — Trophies of the Wild Hunt

*World bosses, **Ascendant** versions only (two a week are raised to level 60, page 13). ilvl 72. Any class.
"Every hunter keeps one tooth. Nobody keeps the rest."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_wildhunt_pelt_cloak` | Pelt Cloak of the Wild Hunt | back | world boss of `whisperwood` |
| `it_wildhunt_tusk_pauldrons` | Tusk Pauldrons (adaptive) | shoulders | world boss of `cinder_steppe` |
| `it_wildhunt_hide_belt` | Hide Belt of the Hunt (adaptive) | waist | world boss of `frostmantle` |
| `it_wildhunt_fang_necklace` | Fang Necklace | necklace | world boss of `drowned_coast` |
| `it_wildhunt_hunters_band` | Hunter's Band | ring | world boss of `riftmarch` |
| `it_wildhunt_huntmasters_band` | Huntmaster's Band | ring | world boss of `emberthrone` |

The world bosses of `greyridge` and `sunscar` drop any piece. Random line from: main attribute, `named_slayer`, health.

| Pieces | Bonus |
|---|---|
| 2 | +5% damage and +5% healing against champions, rares and bosses |
| 4 | Killing a champion, rare or world boss starts **the Hunt** for 10 min: +8% run speed out of combat and +5% main attribute |
| 6 | During the Hunt your first hit on a boss marks it: your group deals +5% to it for 20 s (once per 60 s) |

---

### 2.18 `set_journeymans_harness` — The Journeyman's Harness (crafted)

*Medium armour. Bind on equip. Main attribute chosen when forged (STR, DEX or INT). "Honest work, honestly riveted."*

Patterns from `npc_quartermaster_deepforge` (Anvilgate): **rank I** at Honored (ilvl 30), **rank II** at Revered (ilvl 60).
Forged with the bench action `forge_pattern` (page 08 §13).

| Piece id | Name | Slot | Rank I cost | Rank II cost |
|---|---|---|---|---|
| `it_journeyman_coif` | Journeyman's Coif | head | 30 Scrap, 10 Essence, 2 Dust, 500 gold | 60 Scrap, 20 Essence, 6 Dust, 2 Veilglass, 5,000 gold |
| `it_journeyman_spaulders` | Journeyman's Spaulders | shoulders | same | same |
| `it_journeyman_brigandine` | Journeyman's Brigandine | chest | same | same |
| `it_journeyman_gloves` | Journeyman's Gloves | hands | same | same |
| `it_journeyman_chausses` | Journeyman's Chausses | legs | same | same |
| `it_journeyman_boots` | Journeyman's Boots | feet | same | same |

Random line: the crafter picks one from health, crit chance, resistance.

| Pieces | Bonus |
|---|---|
| 2 | +6% maximum health |
| 4 | +5% main attribute; the set's pieces never lose durability |
| 6 | After 3 s out of combat you regain 5% of maximum health and resource a second |

---

### 2.19 `set_veilglass_artifice` — Veilglass Artifice (crafted)

*Adaptive, INT, caster or healer. Bind on equip. ilvl 70. "Glass that has seen the other side keeps looking."*

Patterns from `npc_quartermaster_riftwatch` (Waystone Camp): head, chest, legs at Exalted; shoulders, hands, feet at Revered.
Each piece: 40 Essence, 12 Dust, 4 Veilglass, 8,000 gold.

| Piece id | Name | Slot |
|---|---|---|
| `it_veilglass_diadem` | Veilglass Diadem | head |
| `it_veilglass_pauldrons` | Veilglass Pauldrons | shoulders |
| `it_veilglass_mantle` | Veilglass Mantle | chest |
| `it_veilglass_gloves` | Veilglass Gloves | hands |
| `it_veilglass_skirt` | Veilglass Skirt | legs |
| `it_veilglass_slippers` | Veilglass Slippers | feet |

Random line: crafter's pick from spell power, healing done, cast speed.

| Pieces | Bonus |
|---|---|
| 2 | +6% spell power and +6% healing done |
| 4 | Every 15 s your next spell costs no resource |
| 6 | Free spells are always critical |

---

### 2.20 `set_open_field_vanguard` — Open Field Vanguard (PvP)

*Adaptive, any role. Bind on pickup. Glory quartermaster (Highcourt, Spire Landing). ilvl 66; each piece
upgrades to ilvl 72 for 200 Laurels (`cur_laurels`). "Nobody wins an open field. Some people are just still standing."*

| Piece id | Name | Slot | Glory (`cur_glory`) cost |
|---|---|---|---|
| `it_vanguard_helm` | Vanguard Helm | head | 1,400 |
| `it_vanguard_pauldrons` | Vanguard Pauldrons | shoulders | 1,000 |
| `it_vanguard_harness` | Vanguard Harness | chest | 1,400 |
| `it_vanguard_gloves` | Vanguard Gloves | hands | 1,000 |
| `it_vanguard_legguards` | Vanguard Legguards | legs | 1,400 |
| `it_vanguard_boots` | Vanguard Boots | feet | 1,000 |

Random line: none. Bonuses marked PvP work only against players (page 15); in PvE the 2-piece is +4% main attribute and the others do nothing.

| Pieces | Bonus |
|---|---|
| 2 | PvP: **Resilience** — you take 10% less damage from players |
| 4 | PvP: Resilience 15% in total; once per 45 s your dodge roll breaks a stun or root |
| 6 | PvP: your killing blows on players heal your group within 20 m for 10% of maximum health |

---

### 2.21 `set_mercenary_captains_kit` — The Mercenary Captain's Kit

*Medium, STR or DEX (vendor dropdown), tank or damage. Bind on pickup. Spire Landing vendor, Veil Sigils (`cur_veil_sigil`).
ilvl 66. "Paid in advance. Refunds in blood."*

| Piece id | Name | Slot | Veil Sigils (`cur_veil_sigil`) |
|---|---|---|---|
| `it_captains_tricorn` | Captain's Tricorn | head | 600 |
| `it_captains_epaulets` | Captain's Epaulets | shoulders | 450 |
| `it_captains_greatcoat` | Captain's Greatcoat | chest | 600 |
| `it_captains_gauntlets` | Captain's Gauntlets | hands | 450 |
| `it_captains_belt` | Captain's Belt | waist | 450 |
| `it_captains_boots` | Captain's Boots | feet | 450 |

Random line from: health, crit chance, `follower_might`.

| Pieces | Bonus |
|---|---|
| 2 | +5% damage and +5% maximum health |
| 4 | Your followers and pets take 30% less damage and deal +15% |
| 6 | Two dodge rolls within 1 s swap your **Order**: *Guard* (+15% damage reduction, +50% threat) or *Charge* (+10% damage). 10 s cooldown |

---

## 3. Class sets index

**Filled from the 30 class files (2026-09-29 reconciliation pass).** The class file is the owner: its text is
the fact for every number below, and this index only summarises. Each class has 2–3 class sets
(`set_<class>_<snake>`), 4–6 class legendaries (`leg_`) and 3–4 class uniques (`uq_`). Legendaries are
**Legendary** rarity (violet `#c86bff`), sets are **Set** rarity (`#2fc4b2`), uniques **Unique** (page 08 §1).
Every item is class-locked (`classes: ["<id>"]`).

**How to read the tables.**
- **Pieces · slots**: the slots the class file names. `6*` = the class file does not list slots, so the
  default applies: head, shoulders, chest, hands, legs, feet (rules paragraph at the end of this section).
- **Band**: the level the set drops at; "60" = Heroic / Mythic+ / raid level-60 copies (page 08 §3).
- **2 / 4 / 6**: one short line per bonus. The spell ids and exact numbers are in the class file.
- **Source**: "final" = the dungeon's or raid's last boss; "secret" = its secret boss; "M+ chest" = the
  Mythic+ end chest; "world boss of X" = that region's world boss (page 13 §8.5); "rares" = that region's
  rare elites (page 10). Percentages are the class file's chance where it gave one.

### 3.0 Totals

| Kind | Count | Notes |
|---|---|---|
| Class sets | **73** | 17 classes have 2, 13 classes have 3 |
| Class legendaries | **139** | 4–6 per class |
| Class uniques | **105** | 3–4 per class |
| **All class items** | **317** | |

| Catalogue-wide totals (if every duplicate in §3.32 is kept as written) | Sets | Legendaries | Uniques |
|---|---|---|---|
| Generic, this page (§2, §4, §6) | 20 + Archivist's Regalia = 21 | 84 | 210 in the world pool (79 headline) |
| Dungeon-exclusive, page 12 §19 (§3.31) | 14 | 29 (15 boss + 14 secret) | 86 |
| Raid and world boss, page 13 §9 (§3.31) | 5 | 17 | 42 (29 raid + 8 world boss + 5 seasonal) |
| Class files (§3.1–§3.30) | 73 | 139 | 105 |
| **Grand total** | **113** | **269** | **443** |

If the "Keep" column of §3.32 is followed, the 14 generic dungeon/raid sets of §2 that page 12 or 13
replaced leave the drop tables (they are not deleted from this page until the owner decides), and the
grand total of sets becomes **99** (113 − 14). Legendary and unique totals do not change: the §3.32
legendary pairs are *moved*, not removed.

### 3.1 [Warrior](classes/warrior.md) — Tank (Damage) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_warrior_ironbrow` | The Ironbrow Bulwark | 60 (Heroic) | 6 · head, chest, legs, hands, feet, shield `it_ironbrow_wall` | final bosses of Heroic `d09`–`d14`, one slot each | 2: Bulwark Bash gives 3 charges · 4: each charge spent −1 s on Iron Challenge · 6: Faultline keeps charges, +40% WD per charge held |
| `set_warrior_last_rampart` | Raiment of the Last Rampart | 60 (raid) | 6* | `r04_ember_court` bosses 2–7 (Normal/Mythic); token from `r05_veilspire` boss 5 | 2: Unbroken Stand cooldown 110 s · 4: Iron Gale hit on 2+ enemies = +1 charge · 6: at full charges Iron Gale is 7 hits, blocks during it heal 2% |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_unfallen_wall` | The Unfallen Wall | shield | Last Rampart cooldown 90 s; 1.2 s immunity per charge | `r04_ember_court` final (boss 8), Mythic only |
| Legendary | `leg_greyridge_anvil` | Greyridge Anvil | 1H hammer | every 3rd Bulwark Bash: 300% WD in 5 m and +5 charges | `d04_bellows_keep` final, Heroic/Mythic+ |
| Legendary | `leg_gale_eater` | Gale-Eater | 2H axe | Iron Gale spins while you have Fury, 55% WD a hit | world boss of `cinder_steppe` |
| Legendary | `leg_oath_of_the_breach` | Oath of the Breach | heavy chest | Unbreakable needs 2 enemies; a boss counts as 5 | `r02_glacier_throne` boss 6 |
| Legendary | `leg_faultborn_greatsword` | Faultborn | 2H sword | Faultline fires a 2nd line at 60%, 90° off; spent charges return over 4 s | `r03_sunken_choir` secret |
| Unique | `uq_visor_of_many_blows` | Visor of Many Blows | heavy head | block charges last 30 s; +4% armour per charge | `d03_deepdelve` boss 2 |
| Unique | `uq_challengers_bell` | Challenger's Bell | necklace | Iron Challenge taunts 6 s, reaches 14 m | `d06_sandsworn_vault` final |
| Unique | `uq_faultmaker` | Faultmaker | 2H axe | Faultline 24 m long, leaves a 3 s 50% snare | `r01_barrowking` boss 3 |
| Unique | `uq_returning_rim` | Returning Rim | shield | Hurled Bulwark's return heals 4% per enemy hit | `d08_moonwell_ruins` boss 2 |

### 3.2 [Fighter](classes/fighter.md) — Damage (Tank) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_fighter_three_answers` | The Three Answers | 60 (Heroic) | 6 · head, hands, feet, legs, chest, necklace `it_three_answers_torc` | Heroic `d09`–`d14` (one slot each, boss 2/3) | 2: stance swap cooldown 0.5 s · 4: Stance Dance 5 s, covers next 2 spells · 6: Answering Blade parry fires all three riders |
| `set_fighter_drillmaster` | Harness of the Drillmaster | 50–60 (raid) | 6* | `r03_sunken_choir` bosses 1–6 (Normal/Mythic); token from `r05_veilspire` boss 3 | 2: Duellist's Decree cooldown 40 s · 4: max Split Plate refreshes the decree to 12 s · 6: in Threefold Form every parry hits the duel target for 150% WD |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_drillmasters_word` | The Drillmaster's Word | 2H sword | double-tap your stance: next basic attack fires its rider, every 6 s | `r04_ember_court` boss 5 |
| Legendary | `leg_counterweight` | Counterweight | 1H hammer | Answering Blade counter = 300% of the parried hit (if above 220% WD) | `d10_rimefang_caverns` final, Heroic/Mythic+ |
| Legendary | `leg_honours_edge` | Honour's Edge | 1H sword | Duellist's Decree lasts until the target dies or you swap stance twice | `r02_glacier_throne` secret |
| Legendary | `leg_bracers_of_the_dial` | Bracers of the Dial | heavy hands | every stance swap: +8 Fury and resets Measured Cut | world boss of `frostmantle` |
| Unique | `uq_splitmark_gauntlets` | Splitmark Gauntlets | heavy hands | Plate Splitter stacks last 20 s | `d04_bellows_keep` boss 2 |
| Unique | `uq_sergeants_whistle` | Sergeant's Whistle | necklace | Closing Step 2 charges; the second costs no Fury | `d02_drowned_mill` final |
| Unique | `uq_breathing_plate` | Breathing Plate | heavy chest | Veteran's Breath removes a stun/fear, usable while stunned | `d07_thornheart` boss 3 |

### 3.3 [Paladin](classes/paladin.md) — Tank (Healer) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_paladin_oathkeeper` | Oathkeeper's Harness | 60 (Heroic) | 6 · head, chest, legs, hands, feet, tome `it_oathkeeper_psalter` | Heroic `d05`, `d06`, `d07`, `d08`, `d11`, `d14` (one slot each) | 2: Sanctity builds 25% faster · 4: a Fulfilled spell also fires your other oath's rider at 50% · 6: Hallowed Ground carries both Keeping and Mercy riders |
| `set_paladin_dawnwarden` | Regalia of the Dawnwarden | 60 (raid) | 6* | `r04_ember_court` bosses 1, 3, 4, 6, 7 + secret (Normal/Mythic); token from `r05_veilspire` boss 7 | 2: Aegis of the Vow 2 charges · 4: Dawnspear instant under Covenant, fires from every ally inside at 30% · 6: Covenant −10 s per finished vow |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_kept_promise` | The Kept Promise | 1H sword | Sanctity drops to 50 on Fulfilled instead of resetting | `r04_ember_court` final (boss 8) |
| Legendary | `leg_sceptre_of_first_light` | Sceptre of First Light | sceptre | Hallowed Ground's first tick heals 15% and hits for 150% WD | `d08_moonwell_ruins` final, Heroic/Mythic+ |
| Legendary | `leg_the_martyrs_tabard` | The Martyr's Tabard | medium chest | Keeping Covenant moves 60% onto you; you heal 10% of it | `r03_sunken_choir` boss 7 (final) |
| Legendary | `leg_vowbreaker_hymnal` | Hymnal of the Broken Vow | off hand (tome) | breaking a vow fires a holy nova, 100% WD per 10 Sanctity | `r01_barrowking` secret |
| Unique | `uq_seal_of_the_first_vow` | Seal of the First Vow | ring | one free oath change in combat before calling 20 | `d01_hollow_barrow` final |
| Unique | `uq_dawnspear_greaves` | Dawnward Greaves | medium legs | Dawnspear 0.5 s cast, 26 m long | `d05_glass_tombs` boss 2 |
| Unique | `uq_consoling_gauntlets` | Consoling Gauntlets | medium hands | Hands of Mercy on an Aegis target refreshes the Aegis | `d09_warmasters_pit` boss 3 |

### 3.4 [Ranger](classes/ranger.md) — Damage · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_ranger_wildstalker` | The Wildstalker's Garb | 60 (Heroic) | 6 · head, chest, legs, hands, feet, quiver `it_wildstalker_quiver` | Heroic `d05`, `d07`, `d08`, `d09`, `d10`, `d12` (one slot each) | 2: Quarry Arrow +3 stacks · 4: every trap gives the cat a free Stalk · 6: Pounce Order spends up to 10 stacks at +20% each |
| `set_ranger_apex_hunt` | Trappings of the Apex Hunt | 42 / 60 (raid) | 6* | `r02_glacier_throne` bosses 1–6 (Normal); Mythic versions from `r05_veilspire` bosses 1, 2, 4, 6, 8, 9 | 2: Barbed Fan fires 2 Quarry arrows · 4: Bounding Retreat empowers the next 2 arrows · 6: Skyfall Volley keeps half its stacks; cat bites twice as fast inside |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_long_patience` | The Long Patience | longbow | +25% to next Quarry Arrow per 2 s without firing (max +150%) | `r02_glacier_throne` final (boss 6) |
| Legendary | `leg_greatcats_collar` | The Great-Cat's Collar | necklace | a second, spectral cat at 50% bite | world boss of `whisperwood` |
| Legendary | `leg_wirewalkers_boots` | Wirewalker's Boots | light feet | stepping on your trap launches a free 12 m Bounding Retreat | `d12_unmade_workshop` final, Heroic/Mythic+ |
| Legendary | `leg_skyfall_string` | Skyfall String | bow | Skyfall Volley follows the Quarry | `r05_veilspire` boss 9 |
| Unique | `uq_brightwater_snare_kit` | Brightwater Snare Kit | light hands | Hunter's Snare 3 charges, lasts 120 s | `d02_drowned_mill` boss 2 |
| Unique | `uq_marking_quiver` | Marking Quiver | quiver | first arrow after a Quarry dies marks the nearest enemy with 3 stacks | `d06_sandsworn_vault` boss 2 |
| Unique | `uq_whisker_charm` | Whisker Charm | ring | cat +30% health; Heel taunts every 5 s | `d03_deepdelve` final |

### 3.5 [Rogue](classes/rogue.md) — Damage · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_rogue_ledgerkeeper` | The Ledgerkeeper's Leathers | 60 (Heroic) | 6 · head, chest, legs, hands, feet, necklace `it_ledgerkeeper_seal` | Heroic `d06`, `d09`–`d13` (one slot each) | 2: Twin Needles from behind +4 CP · 4: Open the Ledger's bleed: +5% from Twin Needles per CP · 6: finishers 10%/CP to reset Slip Away |
| `set_rogue_nightfall` | Shroud of the Long Night | 50–60 (raid) | 6* | `r03_sunken_choir` bosses 2–7 (Normal/Mythic); token from `r05_veilspire` boss 6 | 2: Nightfall Ambush outside stealth, 12 s cooldown · 4: Knife Tumble through a back gives Unseen · 6: Deathwarrant's bill is paid twice |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_debt_collector` | The Debt Collector | dagger | finishers store 10% of their damage; Deathwarrant adds the store | `r04_ember_court` boss 6 |
| Legendary | `leg_twinfang` | Twinfang | dagger pair (one drop, both hands) | Twin Needles' off-hand stab 100%; both count as backstabs | `d11_saltdeep_cathedral` final, Heroic/Mythic+ |
| Legendary | `leg_cloak_of_no_moon` | Cloak of No Moon | light chest | no stealth speed penalty; Slip Away 45 s | world boss of `drowned_coast` |
| Legendary | `leg_ashen_tallybag` | The Ashen Tally-Bag | light legs | each enemy blinded by Ashpowder gives 1 CP (up to 3 over cap) | `r02_glacier_throne` boss 4 |
| Unique | `uq_mill_rats_knuckles` | Mill-Rat Knuckles | light hands | Twin Needles on a snared/rooted target +1 CP | `d02_drowned_mill` final |
| Unique | `uq_tumblers_anklets` | Tumbler's Anklets | light feet | Knife Tumble immunity 0.6 s, 10 m | `d05_glass_tombs` boss 2 |
| Unique | `uq_sealed_writ` | The Sealed Writ | ring | Deathwarrant 10 s; others' share +4% per CP | `d14_ashen_reliquary` boss 2 |

### 3.6 [Cleric](classes/cleric.md) — Healer · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_cleric_vigil` | Vestments of the Long Vigil | 60 (Heroic) | 6 · head, chest, legs, hands, feet, reliquary focus `it_vigil_reliquary` | Heroic `d05`, `d07`, `d08`, `d11`, `d13`, `d14` (one slot each) | 2: Devotion Wards up to 25% health · 4: Raise costs 35 Devotion, 2 s cast · 6: Wreath of Dawn overheal refills the Devotion Ward |
| `set_cleric_sunward` | Raiment of the Sunward Choir | 50–60 (raid) | 6* | `r03_sunken_choir` bosses 1, 3–6 + secret (Normal/Mythic); token from `r05_veilspire` boss 8 | 2: Kindled Prayer +20% on a warded ally · 4: Outpouring 20 s, casts a free Wreath · 6: Dawn's Absolution sets every Ward to 15%, +40 Devotion |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_brimming_chalice` | The Brimming Chalice | off hand (reliquary) | Devotion cap 150; above 100 heals +25% | `r03_sunken_choir` final (boss 7) |
| Legendary | `leg_staff_of_the_last_vigil` | Staff of the Last Vigil | staff | Mass Resurrection also fires 2 s after you die | `r05_veilspire` final (boss 10) |
| Legendary | `leg_sealbearers_mantle` | The Sealbearer's Mantle | light chest | Sanctuary Seal also seals you; 60 s cooldown | `d11_saltdeep_cathedral` final, Heroic/Mythic+ |
| Legendary | `leg_tamars_wellspring` | Tamar's Wellspring | sceptre | Outpouring leaves a 10 m pool: 2%/s heal, +2 Devotion/s | world boss of `sunscar` |
| Unique | `uq_mill_fire_censer` | Mill-Fire Censer | necklace | first Kindled Prayer on a target below 35% is instant | `d02_drowned_mill` boss 2 |
| Unique | `uq_gilded_tether` | The Gilded Tether | light hands | Lifeline reaches 35 m, breaks at 45 m | `d04_bellows_keep` boss 2 |
| Unique | `uq_barrow_candle` | Barrow Candle | wand | Scourging Light heals the two lowest allies at 50% each | `d01_hollow_barrow` final |

### 3.7 [Bard](classes/bard.md) — Support (Healer) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_bard_road_troupe` | Regalia of the Road Troupe | 30 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | every boss of `d07_thornheart` and `d08_moonwell_ruins` (Normal/Heroic); chest only from `d08` final | 2: Marching Cadence starts with 2 verses · 4: Forced March also +25% damage 5 s · 6: Sharp Note in Forced March fires 3 at once |
| `set_bard_mourners_choir` | Vestments of the Mourners' Choir | 60 (raid) | 6 · as above | `r04_ember_court` bosses 1–6 (Normal/Mythic), tokens | 2: Dirge strips a buff every 4 s · 4: Last Verse resets Discordant Chord (12 m cone) · 6: Standing Ovation's target gets the Dirge bonus |
| `set_bard_hearthkeeper` | The Hearthkeeper's Motley | 60 (Mythic+, healer) | 6 · as above | any M+ chest, key 8+ | 2: Hearthsong ticks every 1.5 s · 4: Homecoming at 5+ verses resurrects one ally at 20% (once a fight) · 6: Grace/Sharp Note on an ally gives a doubled verse 6 s |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_last_string` | The Last String | off hand (lute) | under 20% mana: songs free, verses every 2 s | `r03_sunken_choir` final (Normal 5%, Mythic 8%) |
| Legendary | `leg_horn_of_the_gathering` | Horn of the Gathering | off hand (warhorn) | Forced March pulls every ally within 40 m to you | world boss of `cinder_steppe`, 4% |
| Legendary | `leg_crown_of_nine_encores` | Crown of Nine Encores | head | Standing Ovation on 2 targets; cooldown 60 s | `r04_ember_court` secret, 10% |
| Legendary | `leg_tamsins_metronome` | Tamsin's Metronome | necklace | Finale within 1 s of a boss cast ending: +50%, refunds 2 verses | M+ chest key 12+, any dungeon, 1.5% |
| Legendary | `leg_requiem_for_a_king` | Requiem for a King | dagger | Dirge bonus doubled on bosses; Last Verse +100% to bosses | `r02_glacier_throne` secret, 6% |
| Unique | `uq_pipers_reed` | The Piper's Reed | wand | Sharp Note pierces one enemy | `d01_hollow_barrow` final, 12% |
| Unique | `uq_tavern_brawlers_lute` | Tavern Brawler's Lute | off hand (lute) | Discordant Chord heals allies in its cone for 100% | `d04_bellows_keep` `b_the_great_bellows`, 8% |
| Unique | `uq_mothers_lullaby` | Mother's Lullaby | ring | first Sleep each fight lasts 10 s | `d08_moonwell_ruins` final, 7% |
| Unique | `uq_drum_of_the_fen_dance` | Drum of the Fen-Dance | off hand (hand drum) | Cadence: +20% jump height, no fall damage in range | rares in `mossfen`, 3% |

### 3.8 [Mage](classes/mage.md) — Damage · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_mage_sumwrights_robes` | Sumwright's Robes | 34 (levelling) | 6* | `d09_warmasters_pit` bosses (Normal/Heroic); chest from world boss of `cinder_steppe` | 2: Arcane Dart 20% to build 2 charges · 4: Prism Lance at 4 charges also fires backwards at 50% · 6: Fold Step resets on spending 4+ charges |
| `set_mage_starwright` | Vestments of the Starwright | 60 (raid) | 6* | `r05_veilspire` bosses 1–8, tokens (Normal/Mythic) | 2: Orrery +1 charge per 2 hits · 4: Collapsing Star drops a free Orrery · 6: 5-charge Collapsing Star lands twice |
| `set_mage_warded_scholar` | Garb of the Warded Scholar | 60 (Mythic+) | 6* | M+ chest key 8+ | 2: Runic Ward +10% health · 4: Prism Lance free while Ward holds · 6: Ward break gives 2 charges, resets Prism Lance |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_unfinished_proof` | The Unfinished Proof | off hand (grimoire) | max charges +2; each above 4 gives +12% | `r05_veilspire` secret, 8% |
| Legendary | `leg_orbit_of_edric_vane` | Orbit of Edric Vane | staff | the Orrery never ends while you stand in it | `d12_unmade_workshop` final, M+ 10+, 2% |
| Legendary | `leg_foldspace_slippers` | Foldspace Slippers | feet | Fold Step 3 uses; each fold deals 200% | world boss of `riftmarch`, 4% |
| Legendary | `leg_heart_of_a_dead_star` | Heart of a Dead Star | necklace | Collapsing Star 30 s cooldown; pull also pulls elites | `r04_ember_court` final, Mythic, 6% |
| Legendary | `leg_prism_of_the_first_sum` | Prism of the First Sum | off hand (Seer's Orb) | Prism Lance splits to up to 5 enemies at 4+ charges | `r03_sunken_choir` boss 5, 5% |
| Unique | `uq_apprentices_abacus` | Apprentice's Abacus | off hand | charges fade after 20 s | `d02_drowned_mill` final, 10% |
| Unique | `uq_glassblowers_rod` | Glassblower's Rod | wand | Prism Lance pierces walls (not doors) | `d05_glass_tombs` boss 2, 7% |
| Unique | `uq_ward_ring_of_anvilgate` | Ward-Ring of Anvilgate | ring | Ward break pulse +3 m, stuns non-elites 1 s | `d03_deepdelve` final, 8% |
| Unique | `uq_star_chart_cloak` | Star-Chart Cloak | shoulders | Fold Step free while an Orrery exists | rares in `whisperwood`, 3% |

### 3.9 [Necromancer](classes/necromancer.md) — Damage · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_necromancer_sextons_weeds` | The Sexton's Weeds | 30 (raid, levelling) | 6* | `r01_barrowking` bosses 1–5 + secret `b_ninth_heir` | 2: corpses last 45 s · 4: Corpse Bloom raises a Shambler · 6: Raise Thrall on a large corpse adds a Bone Archer |
| `set_necromancer_choir_of_bones` | Regalia of the Choir of Bones | 50–60 (raid) | 6* | `r03_sunken_choir` bosses, tokens (Normal/Mythic) | 2: Bone Splinter pierces 2 more · 4: Rot Tide Shamblers explode for 120% · 6: Bone Colossus free with 5 thralls + 5 corpses (once per 60 s) |
| `set_necromancer_marrowlord` | The Marrowlord's Mantle | 60 (Mythic+) | 6* | M+ chest key 8+ | 2: Marrow Armour raises 1 free thrall · 4: thralls +3% per corpse within 20 m · 6: Corpse Bloom on a thrall does not kill it |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_barrowkings_rod` | The Barrowking's Rod | sceptre | thrall cap +2; thralls past 5 are Bone Brutes | `r02_glacier_throne` final, 5% |
| Legendary | `leg_osric_mournes_ledger` | Osric Mourne's Ledger | off hand (effigy) | bosses leave a bloom-only corpse, 350% cap ×3 | `r04_ember_court` secret, 8% |
| Legendary | `leg_shroud_of_the_drowned_host` | Shroud of the Drowned Host | chest | Rot Tide raises every corpse in 22 m; Shamblers 30 s | world boss of `drowned_coast`, 4% |
| Legendary | `leg_the_hundred_hands` | The Hundred Hands | hands | Crushing Fist no cooldown; costs the Colossus 3 s each | `r05_veilspire` boss 7, 5% |
| Legendary | `leg_gravewind_censer` | Gravewind Censer | necklace | every 8 s a corpse within 20 m blooms at 60% | M+ chest key 12+, 1.5% |
| Unique | `uq_sextons_spade` | Sexton's Spade | staff | Raise Thrall "from the soil" costs no health | `d01_hollow_barrow` `b_sexton_morrow`, 12% |
| Unique | `uq_ring_of_the_quiet_field` | Ring of the Quiet Field | ring | Marrow Armour eats corpses from 20 m | `d06_sandsworn_vault` final, 7% |
| Unique | `uq_bone_archers_quiver_charm` | Bone Archer's Charm | necklace | Bone Archers pierce and fire every 1.5 s | `d11_saltdeep_cathedral` boss 2, 6% |
| Unique | `uq_marsh_mummers_wrap` | Marsh-Mummer's Wrap | legs | Rot Tide Shamblers are Bone Thralls for 20 s | rares in `mossfen`, 3% |

### 3.10 [Warlock](classes/warlock.md) — Damage · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_warlock_debtors_raiment` | The Debtor's Raiment | 36 (levelling) | 6* | `d10_rimefang_caverns` bosses (Normal/Heroic); hands from world boss of `frostmantle` | 2: Hex Brand spreads to +1 on death · 4: Soul Leech heals 75% · 6: Soul Pact's health cost counts double for Tithe |
| `set_warlock_ashen_covenant` | Vestments of the Ashen Covenant | 60 (raid) | 6* | `r04_ember_court` bosses, tokens (Normal/Mythic) | 2: Hellbloom with a shard leaves a 6 m pit · 4: 5-shard Harrowing resets Soul Pact · 6: one free Harrowing during Soul Pact |
| `set_warlock_gatekeeper` | The Gatekeeper's Garb | 60 (Mythic+) | 6* | M+ chest key 8+ | 2: Void Gate 20 s cooldown · 4: taking the gate gives a 15% barrier · 6: returning through it refunds 1 shard |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_first_contract` | The First Contract | off hand (grimoire) | max shards 7; Harrowing +120% per shard | `r05_veilspire` secret, 8% |
| Legendary | `leg_vesna_duskwells_quill` | Vesna Duskwell's Quill | wand | Blood Price 1% health per 1% mana; Tithe caps at 80 | world boss of `riftmarch`, 4% |
| Legendary | `leg_crown_of_the_hollow_host` | Crown of the Hollow Host | head | Crowned lasts 20 s; each DoT spreads to 2 | `r04_ember_court` final, Mythic, 6% |
| Legendary | `leg_imp_in_a_bottle` | The Imp in a Bottle | necklace | two imps; Devour eats one | `d09_warmasters_pit` final, M+ 10+, 2% |
| Legendary | `leg_gate_of_the_nine_doors` | Gate of the Nine Doors | feet | Void Gate no cooldown while one stands; keep 3 gates | `r03_sunken_choir` boss 6, 5% |
| Unique | `uq_marsh_hermits_contract` | Marsh-Hermit's Contract | off hand | imp's Kindled on every 2nd spit | `d02_drowned_mill` final, 10% |
| Unique | `uq_branding_iron_of_tamar` | Branding Iron of Tamar | staff | Hex Brand's hit +200% | `d06_sandsworn_vault` boss 2, 7% |
| Unique | `uq_leechbone_ring` | Leechbone Ring | ring | Soul Leech castable while moving | `d07_thornheart` final, 7% |
| Unique | `uq_ashen_ledger_page` | Ashen Ledger Page | necklace | first Harrowing after a Void Gate return is free | rares in `cinder_steppe`, 3% |

### 3.11 [Demon Hunter](classes/demon_hunter.md) — Damage (Tank) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_demon_hunter_riftwatch_leathers` | Riftwatch Leathers | 38 (levelling) | 6* | `d10_rimefang_caverns`, `d11_saltdeep_cathedral` bosses (Normal/Heroic) | 2: Glaive Arc brands every enemy hit · 4: Tumbling Shot bolts pierce · 6: Vengeance from kills doubled |
| `set_demon_hunter_hellborne` | Hellborne Harness (Ravager) | 60 (raid) | 6* | `r05_veilspire` bosses, tokens (Normal/Mythic) | 2: Demon Form +4 s · 4: Ashen Leap resets when Devour kills · 6: leaving Demon Form fires a free 50-Vengeance Reckoning |
| `set_demon_hunter_chainwarden` | Mail of the Chainwarden (Bastion) | 60 (raid) | 6* | `r04_ember_court` bosses, tokens (Normal/Mythic) | 2: Chain of Binding 10 s cooldown · 4: −10% damage from the tethered enemy · 6: Iron Wings taunts in 8 m, lasts 8 s |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_kael_sorrowends_debt` | Kael Sorrowend's Debt | necklace | each party death fills Vengeance to 100 | `r03_sunken_choir` secret, 8% |
| Legendary | `leg_the_riftlords_horns` | The Rift-Lord's Horns | head | Demon Form at 70 Vengeance, +6 s | world boss of `riftmarch`, 4% |
| Legendary | `leg_glaive_of_the_long_night` | Glaive of the Long Night | off hand (dagger) | Glaive Arc orbits you 8 s at 6 m, 50% every 0.5 s | `d13_cindergate` final, M+ 10+, 2% |
| Legendary | `leg_heartseeker_arbalest` | Heartseeker Arbalest | crossbow | 100-Vengeance Reckoning always crits, chains to 2 at 60% | `r05_veilspire` final, Mythic, 6% |
| Legendary | `leg_chains_of_the_warden_below` | Chains of the Warden Below | waist | Chain of Binding tethers 2 targets | `r04_ember_court` boss 3, 5% |
| Unique | `uq_imp_catchers_charm` | Imp-Catcher's Charm | ring | Hunter's Oath +35% vs imps and small demons | `d01_hollow_barrow` final, 12% |
| Unique | `uq_scarred_crossbow` | The Scarred Crossbow | crossbow | Brand Bolt +6 Fury | `d05_glass_tombs` final, 7% |
| Unique | `uq_mourning_scarf` | Mourning Scarf | shoulders | allies under 20% give +10 Vengeance | `d08_moonwell_ruins` boss 2, 7% |
| Unique | `uq_ash_walker_boots` | Ash-Walker Boots | feet | void zones do not hurt you for 1 s after Tumbling Shot lands | rares in `emberthrone`, 3% |

### 3.12 [Scavenger](classes/scavenger.md) — Damage · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_scavenger_ragpickers_rig` | The Rag-Picker's Rig | 32 (levelling) | 6* | `d08_moonwell_ruins`, `d09_warmasters_pit` bosses (Normal/Heroic) | 2: pickups from 6 m · 4: Junk Toss free 30% of the time · 6: Pack Bomb refunds 1 junk per enemy hit (max 3) |
| `set_scavenger_magpie_crown` | Regalia of the Magpie King | 60 (raid) | 6* | `r05_veilspire` bosses, tokens (Normal/Mythic) | 2: Shiny chance +3% · 4: top 20% of Big Score rolls crit · 6: a Shiny on Big Score hits twice |
| `set_scavenger_wreckers_harness` | The Wrecker's Harness | 60 (Mythic+) | 6* | M+ chest key 8+ | 2: Barricade +20% health · 4: Rummage 14–16 drops a free Barricade · 6: destroyed Barricade explodes for 250% in 6 m |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_bottomless_sack` | The Bottomless Sack | waist | pack holds 40; junk spells cost 1 less | `r04_ember_court` secret, 8% |
| Legendary | `leg_grits_lucky_penny` | Grit's Lucky Penny | necklace | hold 3 Shinies; spend one on any spell to crit for free | world boss of `sunscar`, 4% |
| Legendary | `leg_the_jackpot_cleaver` | The Jackpot Cleaver | sword (cleaver) | Big Score rolls 3 times, keeps the best | `r05_veilspire` final, Mythic, 6% |
| Legendary | `leg_door_of_the_last_inn` | Door of the Last Inn | shoulders | Barricade heals allies behind it 2%/s, lasts 40 s | `r03_sunken_choir` boss 4, 5% |
| Legendary | `leg_magpies_eye` | The Magpie's Eye | ring | every 10th pickup is a Shiny | M+ chest key 12+, 1.5% |
| Unique | `uq_rusty_horseshoe` | The Rusty Horseshoe | ring | Lucky Swing status chance 40% | `d01_hollow_barrow` sub-boss `b_warren_queen_skritch`, 12% |
| Unique | `uq_mudlarks_gloves` | Mudlark's Gloves | hands | pickups in water worth double; pick up from 5 m | `d02_drowned_mill` `b_old_croak`, 8% |
| Unique | `uq_bellows_apron` | Bellows-Keep Apron | chest | Pack Bomb fuse 0.3 s | `d04_bellows_keep` `b_forgemaster_ghorza`, 7% |
| Unique | `uq_cracked_dice` | Cracked Dice | necklace | Rummage rolls of 1 become 20 | rares in `cinder_steppe`, 3% |

### 3.13 [Swashbuckler](classes/swashbuckler.md) — Damage · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_swashbuckler_crimson_regalia` | Crimson Regalia | 25–34 (levelling) | 6 · head, hands, off-hand dagger `it_crimson_main_gauche`, chest, legs, feet | `d07_thornheart` (head, hands, dagger), `d09_warmasters_pit` (chest, legs, feet); Heroic at 60 | 2: Needle Flurry crit +1 Flair · 4: En Garde! fully refunds on a parry · 6: Curtain Cut at Grandeur leaves 5 Flair |
| `set_swashbuckler_tidecaptains_finery` | Tidecaptain's Finery | 50 / 60 (raid) | 6 · light armour + rapier/sabre or dagger | `r03_sunken_choir`; Mythic `r04_ember_court` | 2: Showstopper +3 Flair, +20 Focus · 4: Chandelier Vault free, landing counts as a Showstopper · 6: Grand Finale at any Flair, extra strikes above 10 |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_gallants_last_word` | The Gallant's Last Word | rapier | Grandeur leaves an echo duellist for 6 s repeating Needle Flurry at 50% | `r03_sunken_choir` boss 3 |
| Legendary | `leg_captains_plumed_hat` | Captain's Plumed Hat | light head | Flair never decays out of combat; keep 5 after a stun | world boss of `drowned_coast` |
| Legendary | `leg_quicksilver_main_gauche` | Quicksilver Main Gauche | off-hand dagger | En Garde! passive: auto-parry a frontal hit every 8 s | `d11_saltdeep_cathedral` final, Heroic/Mythic+ |
| Legendary | `leg_boots_of_the_last_dance` | Boots of the Last Dance | light feet | dodge roll 2 charges; Showstopper refunds one | `r04_ember_court` boss 4 |
| Legendary | `leg_encore_signet` | Encore Signet | ring | Grand Finale resets once if it kills 3+ (once per 180 s) | `r05_veilspire` secret |
| Unique | `uq_duellists_ribbon` | The Duellist's Ribbon | necklace | each Flair +1% attack speed | `d01_hollow_barrow` final |
| Unique | `uq_saltstained_sabre` | Salt-stained Sabre | sabre | Needle Flurry becomes a 90° slash at 40% to all | `d02_drowned_mill` final |
| Unique | `uq_parade_gloves` | Parade Gloves | light hands | Mocking Bow +2 Flair | Highcourt fencing hall ladder (`q_swashbuckler_calling_applause`) |
| Unique | `uq_red_sash` | Red Sash of the Harbour | light legs | at 10+ Flair +15% move, red streak | `d11_saltdeep_cathedral` sub-boss |

### 3.14 [Dragon Knight](classes/dragon_knight.md) — Damage (Tank) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_dragon_knight_brood_scale` | Brood-Scale Harness | 31–39 (levelling) | 6 · head, hands, feet, chest, legs, shield `it_broodscale_kite` | `d09_warmasters_pit` (head, hands, feet), `d10_rimefang_caverns` (chest, legs, shield); Heroic at 60 | 2: Wyrmfang rider on every enemy hit · 4: Drakeleap refunds 15 Fury per hit (max 45) · 6: Breath of the Elders fires twice |
| `set_dragon_knight_wyrmlord_plate` | Wyrmlord Plate | 60 (raid) | 6 · heavy + weapon or shield | `r04_ember_court` bosses 1–6 (Normal/Mythic) | 2: aspect swap 10 s, Shedding Scales 300% WD · 4: Wyrmfall +60 Wyrmblood · 6: winged Dragon Form; Deluge becomes a 20 m sweep |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_heart_of_the_ember_wyrm` | Heart of the Ember Wyrm | heavy chest | Dragon Form +8 s and winged; Emberscale Deluge leaves molten ground | world boss of `emberthrone` |
| Legendary | `leg_rimefang_greathelm` | Rimefang Greathelm | heavy head | breath-Frozen enemies shatter for 200% WD in 4 m | `d10_rimefang_caverns` final, Heroic/Mythic+ |
| Legendary | `leg_stormcrest_gauntlets` | Stormcrest Gauntlets | heavy hands | Static Scale chains 4 times at 70%, +1 Wyrmblood each | `r03_sunken_choir` boss 4 |
| Legendary | `leg_triune_scale` | The Triune Scale | necklace | the old aspect's rider stays 8 s after a swap | `r02_glacier_throne` secret |
| Legendary | `leg_old_kings_tooth` | The Old King's Tooth | greataxe | every 5th weapon hit is a free Breath of the Elders | `d13_cindergate` final, Heroic/Mythic+ |
| Unique | `uq_whelpscale_buckler` | Whelpscale Buckler | shield | Scalebound's taunt also applies the aspect status | `d04_bellows_keep` final |
| Unique | `uq_cinderhorn_greataxe` | Cinderhorn | greataxe | Wyrmcoil Sweep leaves a 3 s fire ring, 30% WD/s | `d09_warmasters_pit` sub-boss |
| Unique | `uq_drakeleap_sabatons` | Leaping Sabatons | heavy feet | Drakeleap 20 m, 1 s Scalebound on landing | world boss of `greyridge` |
| Unique | `uq_gilded_wyrmtooth` | Gilded Wyrmtooth | 2H sword | killing blows +10 Wyrmblood | `r01_barrowking` boss 2 |

### 3.15 [Pyromancer](classes/pyromancer.md) — Damage · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_pyromancer_kilnwarden_robes` | Kilnwarden Robes | 19–24 (levelling) | 6 · head, hands, wand `it_kilnwarden_wand`, chest, legs, feet | `d05_glass_tombs` (head, hands, wand), `d06_sandsworn_vault` (chest, legs, feet); Heroic at 60 | 2: Cinder Dart always crits in the Searing band · 4: Slagpool's first second feeds the Familiar 10 Heat · 6: Vent leaves a 6 m Slagpool |
| `set_pyromancer_sunforged_raiment` | Sunforged Raiment | 60 (raid) | 6 · cloth + staff/wand/focus | `r05_veilspire` bosses 1–6 | 2: full Pyre Lance +1 s Overheat · 4: Backdraft +5 Heat per enemy detonated · 6: Overheat 14 s; Crown of Suns drops 7 suns |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_bellows_heart` | Bellows Heart | necklace | Vent sets Heat to 50; Banked Coals 8 s | `d04_bellows_keep` final, Heroic/Mythic+ |
| Legendary | `leg_coldflame_circlet` | Coldflame Circlet | cloth head | fire ignores 50% fire resistance; 60% vs fire-immune | `r04_ember_court` boss 3 |
| Legendary | `leg_phoenix_quill` | Phoenix Quill | wand | once per 180 s, rise at 40% in Overheat with a 300% Vent | world boss of `emberthrone` |
| Legendary | `leg_kiln_of_the_first_forge` | Kiln of the First Forge | off-hand focus (orb) | Familiar holds 100 Heat; at 60+ throws Cinder Darts | `d13_cindergate` final, Heroic/Mythic+ |
| Legendary | `leg_ashen_sun_staff` | Staff of the Ashen Sun | staff | Crown of Suns +1 sun per 25 Heat (up to +4) | `r05_veilspire` secret |
| Unique | `uq_tinderbox_wand` | Tinderbox | wand | wand bolts +3 Heat | `d02_drowned_mill` final |
| Unique | `uq_smouldering_slippers` | Smouldering Slippers | cloth feet | burning trail 20% SP/s while Kindled or hotter | `d05_glass_tombs` sub-boss |
| Unique | `uq_ember_censer` | The Ember Censer | off-hand focus | Overheat's self-burn heals for its first 4 s | world boss of `sunscar` |
| Unique | `uq_slagglass_bangle` | Slagglass Bangle | ring | Slagpool under yourself; melee attackers take double | `d09_warmasters_pit` final |

### 3.16 [Stormcaller](classes/stormcaller.md) — Damage · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_stormcaller_galewrights_robes` | Galewright's Robes | 42–51 (levelling) | 6 · head, hands, feet, chest, legs, staff `it_galewright_staff` | `d11_saltdeep_cathedral` (head, hands, feet), `d12_unmade_workshop` (chest, legs, staff); Heroic at 60 | 2: Forked Spark may re-hit one enemy · 4: rods 45 s, fences 20 m · 6: Galvanic Tether's snap resets Squall Step, +1 rod charge |
| `set_stormcaller_eye_of_the_tempest` | Eye of the Tempest | 60 (raid) | 6 · cloth + staff/wand/focus | `r05_veilspire` | 2: Skybreak strikes every rod for a 150% burst · 4: Thunderhead strikes twice a second in your Eye · 6: Stormcrowned fences are walls; fence damage doubled |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_conductors_spire` | The Conductor's Spire | staff | rods +1; fences join every pair of rods | `r03_sunken_choir` boss 6 |
| Legendary | `leg_crown_of_a_hundred_bolts` | Crown of a Hundred Bolts | cloth head | Forked Spark jumps without limit among 3+ Static enemies | world boss of `riftmarch` |
| Legendary | `leg_skyanchor_boots` | Sky-Anchor Boots | cloth feet | Squall Step 2 charges, plants a free rod | `d12_unmade_workshop` final, Heroic/Mythic+ |
| Legendary | `leg_thunderwell_orb` | Thunderwell | off-hand focus (orb) | Overcharge discharges add 1 Static within 8 m | `r04_ember_court` boss 5 |
| Legendary | `leg_stormglass_heart` | Stormglass Heart | necklace | inside your Eye, every 5th spell free and instant | `r02_glacier_throne` boss 5 |
| Unique | `uq_copperwire_wand` | Copperwire | wand | wand bolts add 1 Static | `d03_deepdelve` final |
| Unique | `uq_rainslick_cowl` | Rainslick Cowl | cloth head | +15% move in rain; Thunderhead 16 s in rain | rare in `mossfen` |
| Unique | `uq_thunderjar` | The Thunderjar | off-hand focus | planting a rod: 4 m burst, 100% SP | `d08_moonwell_ruins` sub-boss |
| Unique | `uq_lodestone_ring` | Lodestone Ring | ring | 5-Static enemies pulled 1 m/s to your nearest rod | `d10_rimefang_caverns` final |

### 3.17 [Druid](classes/druid.md) — Healer (Tank, Damage) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_druid_grovekeepers_vestments` | Grovekeeper's Vestments | 25–30 (levelling, healer) | 6 · head, hands, staff `it_grovekeepers_crook`, chest, legs, feet | `d07_thornheart` (head, hands, staff), `d08_moonwell_ruins` (chest, legs, feet); Heroic at 60 | 2: Seedbloom's bloom plants a 50% seed · 4: Greenswell leaves heal patches · 6: Elder Circle instant; shifting inside blooms every Seedbloom |
| `set_druid_hide_of_many` | Hide of Many (forms) | 42 / 60 (raid) | 6 · medium + weapon/off hand | `r02_glacier_throne` bosses 1–6 (Normal 42; Mythic 60) | 2: Bear Maul 25% to reset Rending Swipe · 4: Cat 5-combo finishers refund 2 · 6: Owl↔Stag free, 4 s Skybound window |
| `set_druid_elderhorn_regalia` | Elderhorn Regalia | 60 (raid, all roles) | 6 · medium + weapon/off hand | `r04_ember_court` (Normal/Mythic) | 2: Wild Heart 10 s · 4: Everbloom −5 s per shift · 6: first shift after Everbloom becomes a 15 s Elderhorn hybrid bar |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_pelt_of_the_first_winter` | Pelt of the First Winter | medium chest | Bear Maul crits give a 10% shield (max 30%) | `d10_rimefang_caverns` final (Heroic/Mythic+) and world boss of `frostmantle` |
| Legendary | `leg_the_ninth_life` | The Ninth Life | necklace | once per 120 s a killing blow in animal form drops you to caster at 30% and roots 6 m | `r03_sunken_choir` boss 5 |
| Legendary | `leg_seedkeepers_crook` | Seedkeeper's Crook | staff | Seedbloom on 3 allies; blooms jump to the lowest ally | `d08_moonwell_ruins` final, Heroic/Mythic+ |
| Legendary | `leg_moonfeather_mantle` | Moonfeather Mantle | medium head | Owl: Starseed every 40 Moonsong; Moonfall while moving | `r04_ember_court` boss 6 |
| Legendary | `leg_crown_of_the_long_road` | Crown of the Long Road | medium head | Stag carries 2; Bound heals 5%; Trackless Path 90 s | world boss of `whisperwood` |
| Legendary | `leg_heart_of_the_wildwood` | Heart of the Wildwood | ring | +6% damage/healing per form entered in 20 s (max +24%) | `r05_veilspire` secret |
| Unique | `uq_thornheart_splinter` | Thornheart Splinter | sceptre | Bramblegrip roots deal 30% SP/s | `d07_thornheart` sub-boss |
| Unique | `uq_barkskin_wraps` | Barkskin Wraps | medium hands | self-cast Heartwood Ward cooldown 20 s | `d03_deepdelve` boss 1 |
| Unique | `uq_hollow_horn` | Hollow Horn | off-hand focus | Antler Rush pushes enemies in 8 m back 4 m | rare in `sunscar` |
| Unique | `uq_mossback_greaves` | Mossback Greaves | medium legs | Bear: standing still 2 s gives 10% damage reduction | `d05_glass_tombs` final |

### 3.18 [Oracle](classes/oracle.md) — Healer (Support) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_oracle_seers_vestments` | Seer's Vestments | 19–24 (levelling) | 6 · head, chest, orb `it_seers_glass_orb`, hands, legs, feet | `d05_glass_tombs` (head, chest, orb), `d06_sandsworn_vault` (hands, legs, feet); Heroic at 60 | 2: Foretold Ward foreseen bonus ×2.5 · 4: Thread-Cut heals 100% of its damage · 6: an Omen on Mended Thread also casts Foretold Ward |
| `set_oracle_threadwoven_raiment` | Threadwoven Raiment | 50 / 60 (raid) | 6 · cloth + sceptre/focus | `r03_sunken_choir`; Mythic `r05_veilspire` | 2: Foresight lead +0.5 s · 4: Fate's Tug leaves a free return thread 6 s · 6: Circle of Prophecy casts Unwritten Hour's save inside |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_eye_of_the_ninth_morning` | Eye of the Ninth Morning | cloth head | party frames show foreseen damage; lead +0.5 s | `r05_veilspire` secret |
| Legendary | `leg_spindle_of_fates` | Spindle of Fates | sceptre | Thread-Cut jumps to 2 more at 70%, each heals an ally | `d11_saltdeep_cathedral` final, Heroic/Mythic+ |
| Legendary | `leg_hourglass_of_ashes` | Hourglass of Ashes | off-hand focus (orb) | Unwritten Hour −3 s per Omen gained | `r04_ember_court` boss 7 |
| Legendary | `leg_veil_of_the_other_road` | Veil of the Other Road | cloth chest | once per 60 s an unforeseen 40% hit on an ally is healed back | world boss of `drowned_coast` |
| Legendary | `leg_prophets_bell` | The Prophet's Bell | necklace | Share the Vision gives the full lead, lasts 18 s | `r02_glacier_throne` boss 6 |
| Unique | `uq_farsight_lens` | Farsight Lens | off-hand focus | intent glyphs shown at 60 m, include elites | `d02_drowned_mill` sub-boss |
| Unique | `uq_threadbare_slippers` | Threadbare Slippers | cloth feet | after Fate's Tug you move +40% for 3 s | `d07_thornheart` final |
| Unique | `uq_omen_bell` | Omen Bell | necklace | each Omen heals allies in 10 m for 40% SP | `d08_moonwell_ruins` final |
| Unique | `uq_glasswalker_sceptre` | Glasswalker's Sceptre | sceptre | Foretold Ward on a ghost telegraph at half strength | world boss of `sunscar` |

### 3.19 [Tactician](classes/tactician.md) — Support · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_tactician_field_marshal` | Field Marshal's Regalia | 32–45 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | `d09_warmasters_pit`, `d10_rimefang_caverns`, `d11_saltdeep_cathedral` bosses; Heroic/Mythic+ at 60 | 2: Probing Cut's Exposed lasts 2 hits at +25% · 4: an Order costs 1 pip less every 10 s · 6: Decisive Hour 120 s, Orders during it refund pips |
| `set_tactician_war_table` | Regalia of the War Table | 60 (raid) | 6 · as above | `r04_ember_court` all bosses (Normal/Mythic); coat from the final | 2: Double-Time Drill +8% move · 4: Outflank resets when its target dies · 6: Battle Plan aura +50% at full Initiative |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_baton_of_the_last_command` | Baton of the Last Command | sceptre | every Order also applies to you at 50% | `r02_glacier_throne` final |
| Legendary | `leg_ever_unfolding_map` | The Ever-Unfolding Map | off hand (field map) | Muster Point 2 charges; allies blink between them | `d12_unmade_workshop` final |
| Legendary | `leg_forced_march_sabatons` | Sabatons of the Forced March | feet | Outflank leaves a +30% move trail; Forward! 12 s | world boss of `cinder_steppe` |
| Legendary | `leg_signet_of_seven_armies` | Signet of Seven Armies | ring | +1 follower slot; followers −25% area damage | `r04_ember_court` boss 5 |
| Unique | `uq_quartermasters_coat` | The Quartermaster's Coat | chest | +10 Focus/s in your Muster Point | `d09_warmasters_pit` boss 2 |
| Unique | `uq_drillmasters_whistle` | Drillmaster's Whistle | necklace | Initiative fills every 5 s | `d08_moonwell_ruins` final |
| Unique | `uq_turncoat_spur` | The Turncoat's Spur | feet | Redeploy may swap with a non-boss enemy | `d06_sandsworn_vault` side-hall rare |

### 3.20 [Chronomancer](classes/chronomancer.md) — Support (Damage) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_chronomancer_hourwright` | Vestments of the Hourwright | 42–57 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | `d11_saltdeep_cathedral`, `d12_unmade_workshop`, `d13_cindergate` bosses; Heroic/Mythic+ at 60 | 2: Second Hand +12 Sand · 4: Recall leaves a Sandfall 4 s · 6: Unwind costs 25 Sand, 2 charges |
| `set_chronomancer_last_second` | Robes of the Last Second | 50–60 (raid) | 6 · as above | `r03_sunken_choir` (Normal/Mythic); robe from the final | 2: Echoing Hour's 2nd strike after 2 s · 4: Borrowed Minutes +10% damage · 6: Stilled Moment 120 s; Paradox Echo 50% |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_ferrymans_hourglass` | The Ferryman's Hourglass | off-hand focus (hourglass) | Recall 2 charges, 20 Sand | `r03_sunken_choir` boss 4 |
| Legendary | `leg_the_unwound_spring` | The Unwound Spring | staff | during Stilled Moment, Second Hand instant and free | `r05_veilspire` boss 8 |
| Legendary | `leg_band_of_the_long_afternoon` | Band of the Long Afternoon | ring | Borrowed Minutes 12 s, splits to 2 allies at 15% | world boss of `riftmarch` |
| Legendary | `leg_mantle_of_yesterday` | Mantle of Yesterday | shoulders | your Ghost runs 8 s behind | `d14_ashen_reliquary` final |
| Unique | `uq_sundial_wand` | The Sundial Wand | wand | Lagging stacks to 5 | `d07_thornheart` boss 2 |
| Unique | `uq_waterclock_slippers` | Waterclock Slippers | feet | +40% move 3 s after Recall | `d10_rimefang_caverns` final |
| Unique | `uq_pendulum_amulet` | The Pendulum | necklace | every 30 Sand spent heals 5% | `d05_glass_tombs` final |

### 3.21 [Monk](classes/monk.md) — Damage (Healer) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_monk_storm_fist` | Wraps of the Storm Fist | 25–34 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | `d07_thornheart`, `d08_moonwell_ruins`, `d09_warmasters_pit` bosses; Heroic/Mythic+ at 60 | 2: Rising Palm +1 Chi after River Step · 4: full-Chi Mountain Palm splashes 50% in 5 m · 6: Seven Stars Kata 60 s, full Chi at its end |
| `set_monk_still_water` | Robes of the Still Water | 42 / 60 (raid) | 6 · as above | `r02_glacier_throne` all bosses; 60 copies from `r04_ember_court` | 2: Wellspring heals 2 allies · 4: Still Breath always reaches 5 allies · 6: at 5 Flow, Hundred Petals heal double |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_lotus_of_unbroken_flow` | Lotus of Unbroken Flow | necklace | Flow max 8; one free repeat per 10 s | `r04_ember_court` boss 3 |
| Legendary | `leg_mountains_own_wraps` | The Mountain's Own Wraps | weapon (wraps) | 6-Chi Mountain Palm: 6 m shockwave, 150% WD | world boss of `greyridge` (scales; re-rolls at 60 on Heroic kills) |
| Legendary | `leg_sandals_of_the_eighth_star` | Sandals of the Eighth Star | feet | Seven Stars Kata strikes 9 times; kills give Chi | `r05_veilspire` boss 6 |
| Legendary | `leg_ring_of_the_quiet_tide` | Ring of the Quiet Tide | ring | Still Breath instant; overheal becomes a 6 s barrier | `d13_cindergate` final |
| Unique | `uq_iron_knuckle_wraps` | Iron-Knuckle Wraps | weapon (wraps) | critical Rising Palm +1 Chi | `d03_deepdelve` boss 2 |
| Unique | `uq_crane_stance_sash` | Crane-Stance Sash | legs | River Step 2 charges | `d05_glass_tombs` boss 1 |
| Unique | `uq_bell_of_the_temple` | Bell of the Mountain Temple | necklace | at full Chi, Focus refills 50% faster | `d04_bellows_keep` final |

### 3.22 [Shaman](classes/shaman.md) — Healer (Damage) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_shaman_spiritcaller` | Spiritcaller's Hides | 19–28 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | `d05_glass_tombs`, `d06_sandsworn_vault`, `d07_thornheart` bosses; Heroic/Mythic+ at 60 | 2: Riverspirit jumps once more · 4: Totemic Recall resets placing cooldowns · 6: Totemic Surge 12 s, 30 s cooldown |
| `set_shaman_old_bones` | Regalia of the Old Bones | 30 / 42 (raid) | 6 · as above | `r01_barrowking`, `r02_glacier_throne`; chest from each final | 2: totems double health · 4: Stonecall plants a free Tremor Totem 10 s · 6: Ancestral Host adds a Bone Elk (10% barrier every 3 s) |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_bonechant_staff` | Bonechant, the Singing Staff | staff | Ancestor Bolt passes through every totem, +20% each | `r02_glacier_throne` boss 3 |
| Legendary | `leg_headdress_of_four_winds` | Headdress of the Four Winds | head | plant both totems of one slot | `r04_ember_court` final |
| Legendary | `leg_riverstone_torc` | The Riverstone Torc | necklace | Riverspirit jumps 6 times; last overheal becomes a barrier | world boss of `whisperwood` |
| Legendary | `leg_pelt_of_the_great_bear` | Pelt of the Great Bear | chest | Spirit Bear double health, taunts; leaves a Stoneward Totem | `d10_rimefang_caverns` final |
| Unique | `uq_rattle_of_ember_teeth` | Rattle of Ember Teeth | sceptre | Emberbrand bolts apply 2 Burning | `d09_warmasters_pit` boss 3 |
| Unique | `uq_tide_mothers_bracers` | Tide-Mother's Bracers | hands | Springwell heals 3 allies a pulse | `d02_drowned_mill` final |
| Unique | `uq_windborne_moccasins` | Windborne Moccasins | feet | Totemic Recall 10 s cooldown | `d06_sandsworn_vault` final |

### 3.23 [Witch Hunter](classes/witch_hunter.md) — Damage · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_witch_hunter_inquisitor` | The Inquisitor's Coat | 28–39 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | `d08_moonwell_ruins`, `d09_warmasters_pit`, `d10_rimefang_caverns` bosses; Heroic/Mythic+ at 60 | 2: Hexbreak 8 s · 4: Inquest Leap +50 Evidence on interrupt · 6: Verdict refunds 2 Silver on a kill |
| `set_witch_hunter_silver_writ` | Garb of the Silver Writ | 50 / 60 (raid) | 6 · as above | `r03_sunken_choir`, `r05_veilspire`; coat from each final | 2: Silver refills every 3 s · 4: Brand of Guilt Condemns a target below 30% (not bosses) · 6: Verdict needs 70 Evidence on bosses and rares |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_last_confession` | The Last Confession | crossbow | Verdict pierces a 45 m line, full 900% to each Condemned | `r03_sunken_choir` final |
| Legendary | `leg_saltwrit_longcoat` | The Saltwrit Longcoat | chest | Salt Circle moves with you, 10 m, 12 s | `d11_saltdeep_cathedral` final |
| Legendary | `leg_brim_of_the_long_hunt` | Brim of the Long Hunt | head | Witchsight always on within 15 m | world boss of `drowned_coast` |
| Legendary | `leg_nine_silver_nails` | The Nine Silver Nails | ring | Silver max 9; each spent −2 s on Verdict | `r05_veilspire` boss 7 |
| Unique | `uq_tribunal_hand_crossbow` | Hand Crossbow of the Tribunal | 1H crossbow | Silver Quarrel fires 2 at 70% for 1 Silver | `d06_sandsworn_vault` boss 2 |
| Unique | `uq_cold_iron_manacles` | Cold-Iron Manacles | hands | Hexbreak's Silence 3 s | `d08_moonwell_ruins` boss 1 |
| Unique | `uq_gallows_oath` | The Gallows Oath | necklace | Condemned targets take +10% from your whole group | `d11_saltdeep_cathedral` boss 2 |

### 3.24 [Knight](classes/knight.md) — Tank (Support) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_knight_vowkeeper` | Plate of the Vowkeeper | 13–22 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | `d03_deepdelve`, `d04_bellows_keep`, `d05_glass_tombs` bosses; Heroic/Mythic+ at 60 | 2: Vow of Protection moves 30% · 4: each Vow-moved hit +2 Fury · 6: free Valiant Charge on your Sworn ally every 30 s |
| `set_knight_bannerlord` | Bannerlord's Harness | 42 / 60 (raid) | 6 · as above | `r02_glacier_throne`, `r04_ember_court`; chest from each final | 2: banner 45 s · 4: Line of Shields spreads the banner aura behind you · 6: Unyielding Oath plants the banner; 120 s at the banner |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_aegis_of_the_unbroken_vow` | Aegis of the Unbroken Vow | shield | Vow moves 35%; 1 Fury per 2% moved | `r01_barrowking` final |
| Legendary | `leg_hammer_of_the_marching_banner` | Hammer of the Marching Banner | hammer | banner carried on your back (8 m aura) | `r04_ember_court` boss 2 |
| Legendary | `leg_helm_of_the_sworn_sentinel` | Helm of the Sworn Sentinel | head | Gauntlet taunts all within 8 m; 6 s cooldown | world boss of `frostmantle` |
| Legendary | `leg_gauntlets_of_the_intercessor` | Gauntlets of the Intercessor | hands | Intercept takes 2 hits; ally −20% damage 4 s | `d13_cindergate` final |
| Unique | `uq_squires_first_shield` | The Squire's First Shield | shield | Reproach +18 Fury | `d01_hollow_barrow` final |
| Unique | `uq_pennant_of_brightwater` | Pennant of Brightwater | necklace | banner lasts 45 s | `d02_drowned_mill` boss 2 |
| Unique | `uq_oathbreakers_greaves` | The Oathbreaker's Greaves | legs | Unyielding Oath 150 s, lasts 8 s | `d09_warmasters_pit` final |

### 3.25 [Sorcerer](classes/sorcerer.md) — Damage · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_sorcerer_gamblers_regalia` | The Gambler's Regalia | 25–30 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | `d07_thornheart`, `d08_moonwell_ruins` bosses (Normal 15% each); all six on Heroic | 2: Chaos results 1–2 rerolled; Surge +4% Mana · 4: same-element Prism Spray bands merge for +60% · 6: Sixfold Die never below 3 |
| `set_sorcerer_vestments_of_the_broken_wheel` | Vestments of the Broken Wheel | 60 (raid) | 6 · as above | `r04_ember_court` tokens (bosses 2, 4, 6, 8); 6th from a Mythic token | 2: Flux Bolt −0.3 s; every 4th carries 2 riders · 4: Unstable Orb +3 Surge a pulse · 6: Wild Crown on 18–20; Chance Maelstrom no cooldown while crowned |
| `set_sorcerer_stormglass_robes` | Stormglass Robes | 60 (Mythic+) | 6 · as above | `d09`–`d14` M+ chest key 8+ | 2: Nudge 3rd charge · 4: Fortune's Shell lands heads at 3 Nudges · 6: each Nudge +8% to next Wild spell |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_crooked_die` | The Crooked Die | off hand (effigy) | Sixfold Die rolls twice and adds both | `r04_ember_court` final (Mythic 8%, Normal 3%) |
| Legendary | `leg_wheelwrights_staff` | Wheelwright's Staff | staff | Wheel shows the next two elements | `d12_unmade_workshop` final, Heroic/Mythic+ 4% |
| Legendary | `leg_crown_of_the_mad_magister` | Crown of the Mad Magister | head | Surge threshold 60; Chaos Table uses a d12 | `r05_veilspire` secret |
| Legendary | `leg_quadrant_bracers` | Quadrant Bracers | hands | 4 elements in a row: 8 s Quadrant, +40% damage | world boss of `riftmarch`, 6% |
| Legendary | `leg_orb_of_second_chances` | Orb of Second Chances | off hand (Seer's Orb) | Unstable Orb can be caught and re-thrown once | `r03_sunken_choir` boss 5, 8% |
| Unique | `uq_spinners_wand` | The Spinner's Wand | wand | +12% cast speed; Hollow rolls +1% cast speed (10 stacks) | `d05_glass_tombs` final |
| Unique | `uq_patchwork_hood` | Patchwork Hood | head | "Wrong Hat" also gives +20% damage 10 s | `d02_drowned_mill` final, 12% |
| Unique | `uq_coinmaster_sash` | Coinmaster's Sash | legs | Fortune's Shell coin shows early; tails heals +50% | world boss of `greyridge` |
| Unique | `uq_ember_rime_signet` | Ember-Rime Signet | ring | Ember then Rime (or reverse) shatters for 100% SP | `d10_rimefang_caverns` boss 2 |

### 3.26 [Runesmith](classes/runesmith.md) — Tank (Damage) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_runesmith_forgewardens_plate` | Forgewarden's Plate | 14–18 (levelling) | 6* | `d03_deepdelve`, `d04_bellows_keep` bosses (Normal 15%); complete on Heroic | 2: Etching Blow +20 Fury · 4: Speak the Runes at 3+ gives a 10% barrier · 6: Holding rune 20 s, 8 m |
| `set_runesmith_glacier_runes` | Runes of the Glacier Throne | 42 (raid) | 6* | `r02_glacier_throne` bosses 1–6, tokens | 2: ground runes slow an extra 10% · 4: Stoneblood Rune carves a Rune of Warding · 6: Spoken Ward Stone freezes non-bosses 2 s |
| `set_runesmith_emberforged_aegis` | The Emberforged Aegis | 60 (raid) | 6* (6th Mythic only) | `r04_ember_court` (Normal/Mythic) | 2: +1 Rune Slate socket · 4: Grand Inscription −30 s, rim runes taunt · 6: each Runeforged: party −8% damage taken |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_first_hammer_of_anvilgate` | First Hammer of Anvilgate | 1H hammer | Etching Blow brands every enemy in the arc for one socket | `d04_bellows_keep` final, Heroic/Mythic+ 4% |
| Legendary | `leg_slate_of_unwritten_names` | Slate of Unwritten Names | shield | 7 sockets; runes past 5 free; blocks +2 s to runes | `r05_veilspire` boss 7 (Mythic 6%) |
| Legendary | `leg_ironroot_greaves` | Ironroot Greaves | legs | in your own ground rune −12% damage, no Fury decay | world boss of `frostmantle`, 6% |
| Legendary | `leg_mountains_patience` | The Mountain's Patience | chest | Stoneblood Rune +1 s per rune Spoken (cap +8 s) | `r02_glacier_throne` final (3%, 5% on re-clears) |
| Legendary | `leg_the_last_word` | The Last Word | 2H hammer | Speak the Runes at 5+: +25% weapon per rune on the highest-health enemy | `d14_ashen_reliquary` final, M+ 10+, 5% |
| Unique | `uq_chisel_of_the_deep` | Chisel of the Deep | 1H hammer | +10% Fury; brands last 20 s | `d03_deepdelve` final |
| Unique | `uq_runecarvers_bracers` | Runecarver's Bracers | hands | fade-pops at 75% | `d06_sandsworn_vault` boss 2 |
| Unique | `uq_stone_of_the_clan_hall` | Stone of the Clan Hall | shield | Calling Stone taunt 5 s; +5% block | world boss of `greyridge` |
| Unique | `uq_wardwell_girdle` | Wardwell Girdle | waist | Ward Stone's barrier also on you outside it | `d11_saltdeep_cathedral` boss 1 |

### 3.27 [Shadow Dancer](classes/shadow_dancer.md) — Damage · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_shadow_dancer_masquerade_silks` | Masquerade Silks | 22–30 (levelling) | 6* | `d06_sandsworn_vault`, `d07_thornheart`, `d08_moonwell_ruins` bosses (Normal 12%); complete on Heroic | 2: Echoes 40% · 4: Backstep Veil leaves 2 Shadows · 6: Silhouette Strike from Veiled resets Dusk Curtain (once per 90 s) |
| `set_shadow_dancer_choir_of_the_unlit` | Choir of the Unlit | 50 (raid) | 6* | `r03_sunken_choir` bosses, tokens | 2: Pirouette Cut 20 Focus · 4: Mirror Waltz leaves a Shadow at each hit · 6: Dance stacks to 8 |
| `set_shadow_dancer_veilwoven_garb` | Veilwoven Garb | 60 (raid) | 6* (6th Mythic only) | `r05_veilspire` bosses | 2: Veilswap 2 s · 4: Last Bow's strikes leave shadow voids · 6: hold 4 Shadows |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_twin_of_the_moonwell` | Twin of the Moonwell | dagger (main hand) | newest Shadow copies your basic attacks at 35% | `d08_moonwell_ruins` final, Heroic/Mythic+ 4% |
| Legendary | `leg_curtainfall_slippers` | Curtainfall Slippers | feet | every Veilswap leaves a 3 m dusk patch 3 s | `r03_sunken_choir` secret |
| Legendary | `leg_the_understudy` | The Understudy | dagger (off hand) | a killing blow swaps you with your newest Shadow (180 s) | `r04_ember_court` boss 5 (Mythic 6%) |
| Legendary | `leg_lantern_eaters_mask` | Lantern-Eater's Mask | head | at night or in a dark room, Shadows echo at 60% | world boss of `whisperwood`, 6% |
| Unique | `uq_nettle_waltz` | Nettle Waltz | dagger | Pirouette Cut poisons, 50% weapon over 6 s | `d02_drowned_mill` boss 2 |
| Unique | `uq_dusk_silk_sash` | Dusk-Silk Sash | waist | Dusk Curtain +2 s; Veiled 12 s | `d05_glass_tombs` final |
| Unique | `uq_pinwheel_blades` | Pinwheel Blades | dagger pair (one item) | Mirror Waltz +2 targets per hop | `d09_warmasters_pit` final |

### 3.28 [Tinker](classes/tinker.md) — Damage (Support) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_tinker_workshop_harness` | The Workshop Harness | 13–18 (levelling) | 6* | `d03_deepdelve`, `d04_bellows_keep` bosses (Normal 15%); complete on Heroic | 2: gadgets +20% duration · 4: Cog Sentry shots 10% to drop Scrap · 6: Springtrap Mine throws 4 |
| `set_tinker_unmade_blueprints` | The Unmade Blueprints | 48–51 (levelling) | 6* | `d12_unmade_workshop` bosses (Normal 15%); complete on Heroic | 2: Overclock costs 2 Scrap · 4: Overloads heal allies in 5 m for 60% weapon · 6: Iron Walker carries a free Cog Sentry |
| `set_tinker_emberforge_rig` | Emberforge Rig | 60 (raid) | 6* (6th Mythic only) | `r04_ember_court`, tokens | 2: Aether Battery 18 s · 4: Patchwork Drone pops at 40%, twice · 6: Contraption every 6 s, needs 4 gadgets |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_perpetual_spring` | The Perpetual Spring | necklace | gadget cap +1 (max 6) | `d12_unmade_workshop` final, Heroic/Mythic+ 4% |
| Legendary | `leg_masterwright_goggles` | Masterwright's Goggles | head | Overclocked gadgets never overload; Overclock 4 Scrap | `r05_veilspire` boss 4 (Mythic 6%) |
| Legendary | `leg_scrapheart_crossbow` | Scrapheart Crossbow | crossbow | Rivet Shot at 5+ Scrap: 300% weapon, 5 m splash | world boss of `riftmarch`, 6% |
| Legendary | `leg_pocketwatch_of_the_first_cog` | Pocketwatch of the First Cog | necklace | every 30 s the next gadget is built at double effect | `r03_sunken_choir` boss 3, 8% |
| Legendary | `leg_the_walking_forge` | The Walking Forge | chest | Iron Walker −5 s cooldown per Scrap spent | `r04_ember_court` final (Mythic 5%) |
| Unique | `uq_brass_knuckle_crossbow` | Brass-Knuckle Crossbow | hand crossbow | Rivet Shot staggers non-bosses 0.5 s | `d01_hollow_barrow` final, 12% |
| Unique | `uq_clicking_satchel` | The Clicking Satchel | waist | Scrap cap 15 | `d04_bellows_keep` boss 2 |
| Unique | `uq_mothwing_gloves` | Mothwing Gloves | hands | Patchwork Drone moves double speed, heals +20% | `d07_thornheart` final |

### 3.29 [Priest](classes/priest.md) — Healer (Damage) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_priest_lampkeepers_vestments` | The Lampkeeper's Vestments | 19–24 (levelling) | 6* | `d05_glass_tombs`, `d06_sandsworn_vault` bosses (Normal 15%); complete on Heroic | 2: every 3rd Wickflame instant · 4: Candle Ward on a full-health ally heals the lowest for 100% SP · 6: Dawn gives +10% Mana regen |
| `set_priest_regalia_of_the_sunken_choir` | Regalia of the Sunken Choir | 50 (raid) | 6* | `r03_sunken_choir` bosses, tokens | 2: Choir of Lamps heals a 6th ally · 4: Penumbra alternates Dawn/Dusk at 70% · 6: Equinox resets Choir of Lamps |
| `set_priest_veil_of_the_twin_lamps` | Veil of the Twin Lamps | 60 (raid) | 6* (6th Mythic only) | `r05_veilspire` bosses | 2: Deathward also leaves a Candle Ward · 4: Twilight after Eclipse Hymn halves spell costs · 6: Anchor 2 charges |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_first_lamp` | The First Lamp | off hand (reliquary) | Dawn starts at +30 | `d11_saltdeep_cathedral` final, Heroic/Mythic+ 4% |
| Legendary | `leg_censer_of_two_smokes` | Censer of Two Smokes | mace | in Grey: heals and damage +12% | `r03_sunken_choir` final (Mythic 6%) |
| Legendary | `leg_bell_of_the_last_hour` | Bell of the Last Hour | necklace | Hold the Flame resets when Deathward triggers (once per 3 min) | `r02_glacier_throne` boss 4, 8% |
| Legendary | `leg_mourners_veil` | Mourner's Veil | head | in Dusk, Nightgloam heals 3 allies | world boss of `drowned_coast`, 6% |
| Legendary | `leg_scepter_of_noon_and_midnight` | Scepter of Noon and Midnight | sceptre | Twilight lasts until you leave both bands | `r05_veilspire` secret |
| Unique | `uq_wax_saints_hands` | Wax Saint's Hands | hands | Candle Ward absorbs +25% | `d01_hollow_barrow` final, 12% |
| Unique | `uq_tallow_psalter` | Tallow Psalter | off hand (psalter) | Call Back in combat free, 1.5 s cast | `d08_moonwell_ruins` boss 2 |
| Unique | `uq_thornlamp_staff` | Thornlamp Staff | staff | Penumbra roots non-bosses 1 s on its first tick | `d07_thornheart` final |

### 3.30 [Enchanter](classes/enchanter.md) — Support · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_enchanter_dreamweavers_raiment` | Dreamweaver's Raiment | 25–30 (levelling) | 6* | `d07_thornheart`, `d08_moonwell_ruins` bosses (Normal 15%); complete on Heroic | 2: Hush 30 s on normal enemies · 4: Somnolent Tide 9 m wide · 6: waking enemies are Unsettled at 3 stacks |
| `set_enchanter_marionettists_finery` | The Marionettist's Finery | 60 (raid) | 6* (6th Mythic only) | `r04_ember_court`, tokens | 2: Will drains 25% slower · 4: charmed creature's abilities −30% cooldown · 6: Crown of Strings charms one Enthralled enemy free when it ends |
| `set_enchanter_veilsilk_vestments` | Veilsilk Vestments | 60 (Mythic+) | 6* | `d09`–`d14` M+ chest key 8+ | 2: Bright Glamour +25% speed · 4: Seed of Discord −5 s per boss interrupt by Hush · 6: M+ trash no longer drains Will faster |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_puppeteers_crossbar` | The Puppeteer's Crossbar | off hand (effigy) | 2 charms from calling II (3 at calling III) | `r04_ember_court` secret |
| Legendary | `leg_music_box_of_the_drowned_queen` | Music Box of the Drowned Queen | necklace | Hush hits 3 targets within 6 m | `r03_sunken_choir` boss 6 (Mythic 6%) |
| Legendary | `leg_circlet_of_quiet_hours` | Circlet of Quiet Hours | head | sleepers do not wake from area damage | `d08_moonwell_ruins` final, Heroic/Mythic+ 4% |
| Legendary | `leg_stringcutter_staff` | Stringcutter Staff | staff | Snap needs no calling; deals Will × 6% SP | world boss of `riftmarch`, 6% |
| Legendary | `leg_borrowed_crown` | The Borrowed Crown | head | charmed champions keep all modifiers; aura doubled | `r05_veilspire` boss 9 (Mythic 5%) |
| Unique | `uq_lullaby_wand` | Lullaby Wand | wand | Needling Whisper sleeps a 3-stack non-boss for 4 s | `d02_drowned_mill` final, 12% |
| Unique | `uq_fen_dog_collar` | Fen-Dog Collar | waist | charmed beasts drain Will 40% slower | `d02_drowned_mill` boss 1 |
| Unique | `uq_courtiers_gloves` | Courtier's Gloves | hands | Bright Glamour also +8% crit | `d06_sandsworn_vault` final |

**Rules the class files follow** (page 08 owns the rules; kept here as the default the `6*` rows use):
class sets are 6 pieces (head, shoulders, chest, hands, legs, feet) in the class's armour type, or five
armour pieces plus a weapon, off hand or necklace where the class file says so. One set is a
levelling/dungeon set, one a raid set (`r02`–`r05`); raid class pieces share the raid's per-boss item chance
(page 08 §12.4); the 4- and 6-piece bonuses change a named spell of that class. Emberveil's 30 class sets
(`items.json sets` with `classes: [...]`) were the starting themes.

### 3.31 Dungeon- and raid-exclusive items (from pages 12 and 13)

Pages 12 and 13 own these items: their text is the fact, this is the index. Names are taken from the owner
page where it gives one; page 12 §19.4 gives **no display names**, so the names in 3.31.1 are the id
written out and marked *(name from id)* until page 12 names them. Every row is **[D-EXCL]** (drops only in
that dungeon); `SECRET` = the secret boss's weekly legendary (page 08 §12.3).

#### 3.31.1 Dungeon-exclusive uniques and legendaries — 115 (86 uniques, 29 legendaries)

| Dungeon | Kind | id | Name *(name from id)* | Slot | Power | Drops from |
|---|---|---|---|---|---|---|
| d01 | Unique | `uq_crown_of_teeth` | Crown of Teeth | light head | +6% attack speed; kills within 10 s give +2% move (max 10%) | `b_warren_queen_skritch` |
| d01 | Unique | `uq_pells_hooded_lantern` | Pell's Hooded Lantern | off-hand light | +20% light radius; +5% crit while in darkness | `b_pell_lantern_thief` |
| d01 | Unique | `uq_morrows_ledger` | Morrow's Ledger | off-hand focus | kills add a Plot (max 5); next area spell +6% per Plot | `b_sexton_morrow` |
| d01 | Unique | `uq_ossels_thimble` | Ossel's Thimble | ring | +4% health; next heal on an ally below 30% +25% (10 s) | `b_mother_ossel` |
| d01 | Unique | `uq_thanes_ring_of_rest` | Thane's Ring of Rest | ring | +5% damage; kills heal 2% | `b_hollow_thane` |
| d01 | Legendary | `leg_hollow_crown` | Hollow Crown | head | every 25 s your next damaging spell raises a Hearth-man ally (30% health, 10 s) | `b_hollow_thane` |
| d01 | Unique | `uq_peat_black_shroud` | Peat-Black Shroud | back | +8% health; standing still 2 s gives a 5% barrier | `b_first_sleeper` |
| d01 | Legendary · SECRET | `leg_first_sleepers_shroud` | First Sleeper's Shroud | chest (any armour) | a killing blow puts you to sleep 3 s at 1 health, wake at 25% (once per 3 min) | `b_first_sleeper` |
| d02 | Unique | `uq_bloodgorged_band` | Bloodgorged Band | ring | 2% of damage heals you; doubled below 40% | `b_bloatleech_matron` |
| d02 | Unique | `uq_sluicewardens_key` | Sluicewarden's Key | necklace | after a dodge, next attack +25% and knocks back 3 m | `b_old_pike_sluicewarden` |
| d02 | Unique | `uq_wider_than_running` | Wider Than Running | waist | +8% move; +15% more 3 s after breaking a tether or leaving a danger zone | `b_old_croak` |
| d02 | Unique | `uq_wrens_wedding_ring` | Wren's Wedding Ring | ring | ally below 35% nearby: you both get an 8% barrier (30 s) | `b_wren_grist` |
| d02 | Unique | `uq_grist_ledger_of_debts` | Grist Ledger of Debts | off-hand focus | Debt stacks on enemies you hit; heal 1% per stack when they die | `b_the_grindwheel` |
| d02 | Legendary | `leg_millwrights_bargain` | Millwright's Bargain | hands | every 3rd spell free; 20% of its damage paid by you over 3 s | `b_the_grindwheel` |
| d02 | Unique | `uq_silt_lords_tithe` | Silt Lord's Tithe | ring | 5% of gold kept as Tithe (max 500); spend to heal to full out of combat | `b_the_tithe_below` |
| d02 | Legendary · SECRET | `leg_ledger_of_the_deep` | Ledger of the Deep | necklace | enemies that hit you gain Debt; at 5 your next hit on it +200% | `b_the_tithe_below` |
| d03 | Unique | `uq_grubniks_ledger` | Grubnik's Ledger | off-hand focus | buffed ally crits give you +1% haste (max 10%) | `b_foreman_grubnik` |
| d03 | Unique | `uq_rattlejaws_shell` | Rattlejaw's Shell | shield | frontal hits 10% to give Shell (−30% damage, 3 s) | `b_rattlejaw` |
| d03 | Unique | `uq_ringleaders_candles` | Ringleader's Candles | head | area spells leave a 2 m burning patch 3 s | `b_nix_candlejaw` |
| d03 | Unique | `uq_seventh_shift_rune` | Seventh Shift Rune | necklace | breaking line of sight to a caster gives a 6% barrier (10 s) | `b_warden_seven` |
| d03 | Unique | `uq_stonegullets_gizzard_stone` | Stonegullet's Gizzard Stone | trinket (use) | −40% damage taken 4 s, knockback-immune (90 s) | `b_stonegullet` |
| d03 | Legendary | `leg_worm_king_mandible` | Worm King Mandible | 2H axe or mace | heavy attacks erupt under the target 1 s later, 60% WD in 3 m | `b_stonegullet` |
| d03 | Unique | `uq_goldvein_signet` | Goldvein Signet | ring | +10% gold; crits 5% to drop a 5–30 gold shard | `b_the_unmined` |
| d03 | Legendary · SECRET | `leg_heart_of_the_unmined` | Heart of the Unmined | chest | standing still grows stone skin, −5% damage a stack (max 4) | `b_the_unmined` |
| d04 | Unique | `uq_matched_tongs` | Matched Tongs | hands | you and a party member hitting one target within 1 s: +8% each | `b_grukk_and_zagga` |
| d04 | Unique | `uq_slag_heart_ember` | Slag-Heart Ember | trinket | fire hits 10% to leave a 2 m slag pool | `b_slagmaw` |
| d04 | Unique | `uq_orc_steel_pauldrons` | Orc-Steel Pauldrons | heavy shoulders | taunting gives −15% damage from that enemy 6 s | `b_forgemaster_ghorza` |
| d04 | Unique | `uq_chained_flame_link` | Chained Flame Link | ring | fire spells −8% cost; next fire spell +30% after a room-wide hit | `b_the_great_bellows` |
| d04 | Unique | `uq_throne_of_the_keep_signet` | Throne of the Keep Signet | ring | +6% damage to elites and bosses | `b_grumvak_kilnbreaker` |
| d04 | Legendary | `leg_kilnbreakers_oath` | Kilnbreaker's Oath | 2H axe | every 4th hit applies Cleft; at 5 your next hit +150% | `b_grumvak_kilnbreaker` |
| d04 | Unique | `uq_bellamund_hammerhand` | Bellamund's Hammerhand | hands | every 5th hit applies Brittle (+4% physical taken, max 5) | `b_bellamund_the_cold_smith` |
| d04 | Legendary · SECRET | `leg_the_cold_anvil` | The Cold Anvil | shield | blocks store 30%; next attack releases it as frost in 4 m | `b_bellamund_the_cold_smith` |
| d05 | Unique | `uq_brood_mothers_gilt` | Brood-Mother's Gilt | trinket | +8% vs reflect auras; no reflected damage 3 s after a dodge | `b_gilded_brood_mother` |
| d05 | Unique | `uq_saffas_bandolier` | Saffa's Bandolier | waist | dodging drops a smoke pot: allies 30% harder to hit | `b_saffa_knifewind` |
| d05 | Unique | `uq_orruns_first_pane` | Orrun's First Pane | off hand | 20% of beam/line damage taken reflected | `b_orrun_the_glassblower` |
| d05 | Unique | `uq_second_glass_crown` | Second Glass Crown | head | +6% move; +6% damage after standing still 1 s | `b_queen_ammarel` |
| d05 | Unique | `uq_unshattered_vambraces` | Unshattered Vambraces | heavy wrists (hands) | hits over 30% of health take 10% less (5 s) | `b_king_sethar_unshattered` |
| d05 | Legendary | `leg_the_eleventh_century` | The Eleventh Century | off hand (focus or shield) | every 12 s your next beam/line/cone spell bounces back | `b_king_sethar_unshattered` |
| d05 | Unique | `uq_seventh_kings_signet` | Seventh King's Signet | ring | +8% damage inside light; +8% dodge outside | `b_ithar_the_unseen` |
| d05 | Legendary · SECRET | `leg_the_unseen_prince` | The Unseen Prince | back | 3 s unhurt makes you unseen; first attack +60% | `b_ithar_the_unseen` |
| d06 | Unique | `uq_the_coffers_tongue` | The Coffer's Tongue | necklace | +12% gold; +10% gold from enemies you hit | `b_coffer_that_counts` |
| d06 | Unique | `uq_hasks_lucky_shovel` | Hask's Lucky Shovel | off hand | dodge +2 m; rolling through a wave gives +10% haste | `b_hask_the_tunneler` |
| d06 | Unique | `uq_true_weight` | True Weight | waist | ally on each side within 10 m: +8% damage, −5% taken | `b_scales_of_tamar` |
| d06 | Unique | `uq_the_stolen_oath` | The Stolen Oath | trinket (use) | dispel all curses from you and an ally (60 s); +5% healing received | `b_qassar_silver_tongued` |
| d06 | Unique | `uq_sovereigns_binding` | Sovereign's Binding | wrists (hands) | dispelling a curse: both +10% damage 6 s | `b_the_sand_sovereign` |
| d06 | Legendary | `leg_the_unbound_dune` | The Unbound Dune | feet | every 10 s your dodge leaves a 6 m sand wall 4 s | `b_the_sand_sovereign` |
| d06 | Unique | `uq_first_oath_signet` | First Oath Signet | ring | +6% healing; heals remove a curse | `b_tamar_the_first` |
| d06 | Legendary · SECRET | `leg_water_of_tamar` | Water of Tamar | necklace | every 20 s a low ally you heal gets a 4 m beneficial pool | `b_tamar_the_first` |
| d07 | Unique | `uq_web_of_the_matriarch` | Web of the Matriarch | back | your DoTs jump to 1 more enemy when the target dies | `b_silkrot_matriarch` |
| d07 | Unique | `uq_scent_of_blood` | Scent of Blood | hands | +10% vs marked enemies; crits mark 4 s | `b_rakka_bloodbriar` |
| d07 | Unique | `uq_mycelial_ring` | Mycelial Ring | ring | DoTs tick 10% faster; a jump heals you 1% | `b_the_sporefather` |
| d07 | Unique | `uq_thornlink_band` | Thornlink Band | ring | take 10% of a big hit on a nearby ally | `b_orenn_thornbound` |
| d07 | Unique | `uq_wyllows_last_leaf` | Wyllow's Last Leaf | necklace | +8% healing; +20% on allies with a DoT | `b_wyllow_blighted_heart` |
| d07 | Legendary | `leg_blightbreaker` | Blightbreaker | hands | cleansed DoTs tick on the nearest enemy at 200% | `b_wyllow_blighted_heart` |
| d07 | Unique | `uq_seed_of_the_sovereign` | Seed of the Sovereign | trinket (use) | plant a seed: 5 m spreading DoT, 40% SP/s 8 s (60 s) | `b_gall_sovereign` |
| d07 | Legendary · SECRET | `leg_wyllows_gratitude` | Wyllow's Gratitude | off-hand focus | every 15 s a healed ally gets a cleansing root-pool | `b_gall_sovereign` |
| d08 | Unique | `uq_dusk_scale_cloak` | Dusk-Scale Cloak | back | +10% dodge with no light of your own | `b_gloamwing` |
| d08 | Unique | `uq_caeliths_last_arrow` | Caelith's Last Arrow | quiver | every 20 s next ranged attack pierces a 30 m line | `b_caelith_pale_huntress` |
| d08 | Unique | `uq_twin_bond_band` | Twin-Bond Band | ring | +6% damage near an ally; +6% more if they wear one too | `b_twin_wardens` |
| d08 | Unique | `uq_ilvandors_constant` | Ilvandor's Constant | necklace | spells −5% cost; every 5th free | `b_archmage_ilvandor` |
| d08 | Unique | `uq_moon_drinkers_tooth` | Moon-Drinker's Tooth | dagger | +10% in darkness, heals 1% of damage | `b_oruvel_moon_drinker` |
| d08 | Legendary | `leg_the_thirst` | The Thirst | necklace | kills +3% damage (max 10); at 10, next spell is a 10 m donut for 150% SP | `b_oruvel_moon_drinker` |
| d08 | Unique | `uq_crescent_of_lirath` | Crescent of Lirath | off hand | cone and donut spells +12% | `b_the_drowned_moon` |
| d08 | Legendary · SECRET | `leg_the_moon_returned` | The Moon Returned | ring | personal 45 s moon clock: +12% healing / +12% damage | `b_the_drowned_moon` |
| d09 | Unique | `uq_ogras_whistle` | Ogra's Whistle | trinket (use) | enemy beasts in 15 m fight each other 5 s (90 s) | `b_ogra_beastmaster` |
| d09 | Unique | `uq_death_roll_bracers` | Death-Roll Bracers | wrists (hands) | held or stunned: 10% barrier (20 s) | `b_the_moatmother` |
| d09 | Unique | `uq_broken_chain` | Broken Chain | wrists (hands) | when a movement stop ends: +25% move, +10% damage 3 s | `b_brannoc_the_chained` |
| d09 | Unique | `uq_bait_and_stake` | Bait and Stake | feet | enemies fixated on you take +10% from allies | `b_razorback_rider_krunn` |
| d09 | Unique | `uq_favour_of_the_crowd` | Favour of the Crowd | necklace | dodging through a danger zone gives Favour, +2% (max 5) | `b_warmaster_drogath` |
| d09 | Legendary | `leg_ashmanes_twin_cleavers` | Ashmane's Twin Cleavers | 1H axe pair (counts as one legendary) | every 3rd off-hand hit throws it, 12 m line, 80% WD | `b_warmaster_drogath` |
| d09 | Unique | `uq_tallows_collar` | Tallow's Collar | necklace | pet/companion −20% damage taken, +10% damage | `b_old_gnash_undefeated` |
| d09 | Legendary · SECRET | `leg_the_undefeated` | The Undefeated | waist | first drop below 20% each fight: heal to 50%, +20% damage 8 s | `b_old_gnash_undefeated` |
| d10 | Unique | `uq_hibernation_charm` | Hibernation Charm | trinket (use) | heal 30% over 6 s, rooted (120 s) | `b_old_whitemaw` |
| d10 | Unique | `uq_yrsas_bell` | Yrsa's Bell | off hand | interrupts remove 2 stacking-debuff stacks from allies in 10 m | `b_frostsayer_yrsa` |
| d10 | Unique | `uq_icebreakers_cleats` | Icebreaker's Cleats | feet | no slipping on ice; +10% move on snow and ice | `b_skarr_icebreaker` |
| d10 | Unique | `uq_song_of_the_rime` | Song of the Rime | necklace | immune to the first Chill each fight; frost spells slow 10% (×3) | `b_rimeweaver_seidra` |
| d10 | Unique | `uq_rimefang_heartscale` | Rimefang Heartscale | heavy chest | +20% cold resist; 10% of cold taken added to next hit | `b_rimefang` |
| d10 | Legendary | `leg_breath_of_the_glacier` | Breath of the Glacier | staff or wand | frost spells leave a 3 m ice patch: −30% move, +10% from you | `b_rimefang` |
| d10 | Unique | `uq_the_quiet_step` | The Quiet Step | feet | enemies beyond 15 m do not notice you unless you attack | `b_old_mother_rime` |
| d10 | Legendary · SECRET | `leg_mothers_last_winter` | Mother's Last Winter | chest | 4 m warmth aura; every 30 s heals allies inside 10% | `b_old_mother_rime` |
| d11 | Unique | `uq_ringers_earplugs` | Ringer's Earplugs | head | immune to silence; +10% resist to room-wide damage | `b_hobb_the_bellringer` |
| d11 | Unique | `uq_matrons_pearl` | Matron's Pearl | necklace | swim 40% faster; no Drowning for 20 s | `b_saltshell_matron` |
| d11 | Unique | `uq_deacons_litany` | Deacon's Litany | necklace | each successful interrupt −3 s on your interrupt | `b_deacon_mourne` |
| d11 | Unique | `uq_the_missing_part` | The Missing Part | ring | an ally dies nearby: gain their role bonus 10 s | `b_choir_of_brine` |
| d11 | Unique | `uq_the_full_church` | The Full Church | trinket (use) | allies in 15 m +10% damage 10 s, +2% per extra ally (90 s) | `b_bishop_aldwine` |
| d11 | Legendary | `leg_bell_of_saltdeep` | Bell of Saltdeep | off hand | every 20 s: allies in 10 m get 8% barrier, enemies silenced 2 s | `b_bishop_aldwine` |
| d11 | Unique | `uq_what_the_sea_keeps` | What the Sea Keeps | ring | 20% of a 40%+ hit is taken over 4 s instead (30 s) | `b_the_tidewife` |
| d11 | Legendary · SECRET | `leg_heart_of_the_tidewife` | Heart of the Tidewife | chest | breathe water, swim full speed, spells +15% while swimming | `b_the_tidewife` |
| d12 | Unique | `uq_perpetual_cog` | Perpetual Cog | trinket | +2% attack speed every 10 s in combat (max 10%) | `b_cogheart_warden` |
| d12 | Unique | `uq_through_the_lens` | Through the Lens | off hand | line spells 50% longer | `b_mira_lensgrinder` |
| d12 | Unique | `uq_upside_down_charm` | Upside-Down Charm | necklace | no fall damage; +20% damage 4 s after a fall or knock-up | `b_the_gravity_engine` |
| d12 | Unique | `uq_look_at_yourself` | Look at Yourself | ring | first damaging spell each fight cast twice (2nd at 40%) | `b_mirror_apprentices` |
| d12 | Unique | `uq_oddrins_last_letter` | Oddrin's Last Letter | trinket (use) | portal 20 m ahead with a 6 s return portal (45 s) | `b_oddrin_the_unmaker` |
| d12 | Legendary | `leg_the_unmaking` | The Unmaking | 2H (staff or weapon) | every 30 s next hit: −30% armour/resist 8 s (bosses −15%) | `b_oddrin_the_unmaker` |
| d12 | Unique | `uq_cogheart` | Cogheart | necklace | +4% haste; every 20th hit +20% haste 4 s | `b_the_finished_thing` |
| d12 | Legendary · SECRET | `leg_the_finished_thing` | The Finished Thing | trinket (use) | a brass double copies your abilities at 40% for 12 s (120 s) | `b_the_finished_thing` |
| d13 | Unique | `uq_torvens_sighting_lens` | Torven's Sighting Lens | necklace | +15% line damage beyond 20 m | `b_torven_ballista_master` |
| d13 | Unique | `uq_ilsabets_doubt` | Ilsabet's Doubt | ring | −10% fire taken; dispels give a 5% barrier | `b_pyre_priestess_ilsabet` |
| d13 | Unique | `uq_varrows_key` | Varrow's Key | trinket | in a soak, allies in it take 10% less | `b_gatekeeper_varrow` |
| d13 | Unique | `uq_quench_seal` | Quench Seal | waist | a stacking debuff about to max is removed; −20% damage 4 s (60 s) | `b_slag_colossus` |
| d13 | Unique | `uq_never_cold` | Never Cold | heavy wrists (hands) | immune to Chill and freeze; +15% fire damage taken | `b_commander_kaelis` |
| d13 | Unique | `uq_gate_key_of_the_ember` | Gate Key of the Ember | trinket (use) | you and 4 allies −20% damage 6 s (120 s) | `b_castellan_vorhane` |
| d13 | Legendary | `leg_the_cindergate` | The Cindergate | shield | blocks build Heat; at 10 next hit is a 12 m cone for 300% WD | `b_castellan_vorhane` |
| d13 | Unique | `uq_banner_of_last_light` | Banner of Last Light | back | allies in 10 m −5% damage taken; you +5% | `b_first_flame_of_the_gate` |
| d13 | Legendary · SECRET | `leg_the_first_flame` | The First Flame | 2H (looter's type) | 5 Kindling marks burst for 200% WD in 6 m and spread | `b_first_flame_of_the_gate` |
| d14 | Unique | `uq_unwritten` | Unwritten | necklace | once per 60 s a killing hit is written off, 2 s immunity to that attacker | `b_the_ash_scribe` |
| d14 | Unique | `uq_twice_born` | Twice-Born | chest (any armour) | once per fight a killing blow makes you an egg 3 s, hatch at 30% | `b_emberbrood` |
| d14 | Unique | `uq_four_doors` | Four Doors | trinket | every 15 s next spell gets a random bonus | `b_relic_custodian` |
| d14 | Unique | `uq_eyes_sewn_shut` | Eyes Sewn Shut | head | immune to blind; +10% damage 5 s after an interrupt | `b_high_ashpriest_morvaine` |
| d14 | Unique | `uq_first_burned_feather` | First Burned Feather | necklace | +10% fire; 5% of fire damage heals the lowest ally | `b_ashwing` |
| d14 | Unique | `uq_the_kings_decree` | The King's Decree | trinket (use) | stun all enemies in 20 m 1.5 s (bosses interrupted) (120 s) | `b_sarn_veydrec_herald` |
| d14 | Legendary | `leg_herald_of_ashes` | Herald of Ashes | off hand (banner/focus) | a self-planting banner: allies in 8 m +8% damage, −8% taken | `b_sarn_veydrec_herald` |
| d14 | Legendary | `leg_reliquary_heart` | Reliquary Heart | necklace | relic-type buffs 50% stronger | `b_sarn_veydrec_herald` |
| d14 | Unique | `uq_remember_the_roads` | Remember the Roads | necklace | +2% damage per d01–d14 finished on Heroic (max +28%) | `b_ashmother_veyra` |
| d14 | Legendary · SECRET | `leg_the_first_ember` | The First Ember | off-hand light | +50% light; allies in it −10% room-wide damage; one save at 1 health per 3 min | `b_ashmother_veyra` |

**Slot notes for page 08.** Page 12 uses four slot names that are not in canon's 15 slots (00 §4):
**trinket** (15 items), **wrists** (5 items), **"off-hand light"** (2) and a **banner** off hand. Wrists
are read as hands above; trinkets and "off-hand light" have no canon slot. Listed under "Unresolved" in the
page report (page 08 owns slots).

#### 3.31.2 Dungeon sets (page 12 §19.5) — 14

Page 12 gives each set's intent; it asks page 09 to write the final bonus text (not yet done — see §3.32).

| Set id | Name | Dungeon | Armour | Pieces · slots | Brief (page 12) |
|---|---|---|---|---|---|
| `set_barrowwarden` | Barrowwarden's Rest | `d01_hollow_barrow` | medium | 4 · chest, hands, head, legs | 2: +10% damage to undead · 4: killing blow on undead heals 4% |
| `set_fenwader` | Fenwader's Tack | `d02_drowned_mill` | light | 4 · legs, chest, head, feet | 2: +20% move in water and mud · 4: breaking a tether / leaving a void zone +10% damage 5 s |
| `set_deepdelver` | Deepdelver's Harness | `d03_deepdelve` | heavy | 4 · chest, shoulders, head, legs | 2: +15% knockback resistance · 4: −20% damage from a soak you stand in |
| `set_kilnbreaker_iron` | Kilnbreaker's Iron | `d04_bellows_keep` | heavy | 4 · hands, chest, head, legs | 2: +10% fire resist · 4: cleared debuff stacks give 3% barrier each |
| `set_sunglass_regalia` | Sunglass Regalia | `d05_glass_tombs` | cloth | 4 · hands, head, chest, legs | 2: +10% light radius, +5% holy · 4: beneficial zones double on you |
| `set_oathkeeper_bronze` | Oathkeeper's Bronze | `d06_sandsworn_vault` | medium | 4 · chest, hands, head, legs | 2: +10% curse resist · 4: being dispelled gives +15% haste 5 s |
| `set_thornwarden_bark` | Thornwarden's Bark | `d07_thornheart` | medium | 4 · legs, chest, head, hands | 2: +15% poison/bleed resist · 4: in a beneficial zone +10% damage |
| `set_moonsilver_vigil` | Moonsilver Vigil | `d08_moonwell_ruins` | cloth | 4 · legs, head, chest, hands | 2: +8% damage at night / Moonless · 4: in a donut's safe hole, 10% barrier |
| `set_pitchampion_leathers` | Pit Champion's Leathers | `d09_warmasters_pit` | light | 4 · legs, chest, head, hands | 2: +10% damage while fixated on · 4: dodging through an attack refunds 50% of the roll |
| `set_rimewarden_furs` | Rimewarden's Furs | `d10_rimefang_caverns` | medium | 4 · legs, chest, head, hands | 2: +20% Chill/slow resist · 4: in warmth or a beneficial zone +10% damage and healing |
| `set_tidebound_vestments` | Tidebound Vestments | `d11_saltdeep_cathedral` | cloth | 4 · legs, hands, chest, head | 2: interrupts −2 s · 4: an interrupt gives the party +5% damage 6 s |
| `set_unmakers_apron` | The Unmaker's Apron | `d12_unmade_workshop` | medium | 4 · legs, chest, head, hands | 2: +10% damage 4 s after a portal or knock · 4: pass one telegraph unhurt every 20 s |
| `set_emberbane_plate` | Emberbane Plate | `d13_cindergate` | heavy | 5 · legs, shoulders, hands, head, chest | 2: +15% fire resist · 4: tank-swap stacks give 2% barrier each · 5: 2+ soakers take −15% |
| `set_reliquary_ash` | Reliquary Ash | `d14_ashen_reliquary` | adaptive | 6 · legs, hands, head, chest, shoulders, waist (Heroic quartermaster) | 2: +5% damage/healing in dungeons and raids · 4: +1 party combat revive per boss · 6: survive the first one-shot each boss fight at 1 health ⚠ |

⚠ `set_reliquary_ash`'s 6-piece conflicts with this page's check 5 (§9: nothing may reduce a one-shot
mechanic). Flagged for the owner; page 12's text is not changed here.

#### 3.31.3 Raid sets (page 13 §9.1) — 5

All five are **generic, four-weight, role-following** sets: each piece is made in the wearer's armour weight
when a token (`it_token_r0N_<slot>`, Mythic `it_token_r0Nm_<slot>`) is handed in, and the bonus follows your
current role. Pieces: head, chest, legs, hands, feet, necklace. One line per role at 6 pieces below; the 2-
and 4-piece lines are in page 13.

| Set id | Name | Raid | 6-piece by role (Tank · Healer · Damage · Support) |
|---|---|---|---|
| `set_ninefold_oath` | The Ninefold Oath | `r01_barrowking` (§3.12) | Oathkeeper: survive a killing hit at 1 health, 2 s immune (90 s) · every 30 s a single heal also heals 4 allies at 40% · Ninth Oath: every 9th hit +90% as true damage · spending your class mechanic gives the raid +5% for 9 s (60 s) |
| `set_rimebound_court` | The Rimebound Court | `r02_glacier_throne` (§4.14) | Glacier Heart: below 25%, encased 3 s then heal 20% (120 s) · Hearth: a 6 m green zone, 3%/s (45 s) · Shatter: +40% on frozen or stunned · allies immune to knockback 6 s (60 s) |
| `set_drowned_choir` | Vestments of the Drowned Choir | `r03_sunken_choir` (§5.14) | Undertow: pull enemies in 10 m, double threat (20 s) · Chorus: three heals in 3 s copy the next to 2 allies at 60% · Refrain: every 30 s a skill repeats at 60% · 5 allies immune to mind control 10 s (90 s) |
| `set_emberlord_regalia` | The Emberlord Regalia | `r04_ember_court` (§6.15) | Throne Guard: taunting a boss gives the raid −5% damage 8 s · Last Light: heal an ally below 15% for 40% (90 s) · Crownfire: every 20 s brand, raid +10% on it 6 s · Favour: an ally +15% damage or healing 10 s (60 s) |
| `set_veilwoven` | The Veilwoven Raiment | `r05_veilspire` (§7.17) | Two Realms: a killing hit slips you into the Veil 4 s (90 s) · Loom: 15% of a healed target's damage shared to you 10 s · Unravel: threads, +3% per thread (max 10) · Warden's Sight: reveal Veil-only telegraphs 10 s (60 s) |

⚠ The Ninefold Oath Tank 6-piece and the Veilwoven Tank 6-piece both cheat a killing hit; if the killing hit
is a one-shot mechanic, check 5 of §9 applies. Page 13 owns the text.

#### 3.31.4 Raid and world-boss legendaries (page 13 §9.2) — 17

| Raid | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| r01 | `leg_crown_of_the_ninth` | Crown of the Ninth | head (any weight) | once per 60 s, the first ally in 30 m who would die heals 30%, drops threat, 3 s immune | secret (the Ninth Heir), one player guaranteed |
| r01 | `leg_kingsblade_of_hrodric` | Kingsblade of Hrodric | 2H sword | every 9th hit: 120° 8 m cleave, 300% WD, and a 9 s heir-shade | the Barrowking (boss 5), 4% |
| r01 | `leg_marrow_reliquary` | The Marrow Reliquary | off-hand focus (reliquary) | a DoT'd enemy that dies leaves a 3 m pool, 20% SP every 0.5 s for 6 s | the Ossuary Warden (boss 1), 3% |
| r02 | `leg_heart_of_the_sleeper` | Heart of the Sleeper | necklace | every 30 s the next hit is absorbed and released as a 6 m tremor for 250% | secret (Vorm), guaranteed |
| r02 | `leg_ysmeres_long_winter` | Ysmere's Long Winter | 2H sword | 20 Winter: freeze a 10 m cone 3 s, 500% WD | Queen Ysmere (boss 6), 4% |
| r02 | `leg_windmothers_last_feather` | Windmother's Last Feather | off hand / quiver | dodge becomes a 10 m wind dash with knockback, +30% attack speed 3 s | Skathra (boss 4), 3% |
| r03 | `leg_the_unsung_note` | The Unsung Note | ring | every 12 s next spell is silent: instant, free, silences 2 s | secret (the Unsung), guaranteed |
| r03 | `leg_choirmasters_ninth_eye` | The Choirmaster's Ninth Eye | head | see telegraphs 0.5 s sooner; +10% damage 4 s after dodging one | the Choirmaster (boss 7), 4% |
| r03 | `leg_grimwaters_last_broadside` | Grimwater's Last Broadside | off hand (pistol) / any | every 25 s next basic attack fires 6 lines, 200% WD each | Captain Grimwater (boss 4), 4% |
| r04 | `leg_kiln_heart` | The Kiln Heart | off-hand focus / shield | Anneal: every 15 s next heal or damage spell doubled, target turned to glass 2 s | secret (Prince Aurel), guaranteed |
| r04 | `leg_crown_of_kaedros` | Crown of Kaedros | head | fire damage leaves a 4 m burning tile, 30% of the hit a second 6 s | Kaedros, the Ember King (boss 8), 3% |
| r04 | `leg_emberwing_pinion` | Emberwing Pinion | 2H staff or bow | every 3rd cast: Deep Breath line 25 × 4 m, 350% | Vaelkyr (boss 6), 4% |
| r05 | `leg_first_torch` | The First Torch | light | +60% light; every ability +2% per region fully explored (max +20%) | secret (the Marchheart), every player once per account |
| r05 | `leg_dream_of_the_march` | Dream of the March | any weapon (class list) | every 30 s a new region's blessing for 30 s | secret (the Marchheart), one player |
| r05 | `leg_unwoven_spindle` | The Unwoven Spindle | off-hand focus / shield | every 10 s ties the target to 3 enemies: 40% of damage shared | the Unwoven (boss 10), 3% |
| r05 | `leg_starless_scale` | Starless Scale | chest (any weight) | below 50%: telegraphs on you land 0.3 s later, −15% damage | Nhal the Starless (boss 8), 3% |
| r05 | `leg_horologe_mainspring` | The Horologe's Mainspring | ring | double-dodge rewinds you 4 s, with that health (60 s) | the Horologe (boss 3), 3% |

⚠ `leg_starless_scale` slows telegraphs aimed at its wearer by 0.3 s; page 13 notes it never goes below page
11's minimum warning times for others. `leg_first_torch` is the only Legendary granted to every player.

#### 3.31.5 Raid, world-boss and seasonal uniques (page 13 §9.3) — 42

| Source | id | Name | Slot | Power | Drops from |
|---|---|---|---|---|---|
| r01 | `uq_votive_of_the_last_sister` | Votive of the Last Sister | necklace | stand still 2 s: 6 m circle, allies +10% healing received | Sister Candlemourn hard mode, 20% |
| r01 | `uq_sextons_lantern` | The Sexton's Lantern | light | +40% light; undead in it take +8% | quartermaster (15 Oathstones, `cur_oathstone`) or r01 trash 1% |
| r01 | `uq_gravewarden_oathband` | Gravewarden Oathband | ring | two wearers within 10 m both take −8% | the Gravewardens, 8% |
| r01 | `uq_gullet_of_the_rotmaw` | Gullet of the Rotmaw | ring | poisons stack 1 more; poisoned enemies −3% damage a stack | the Rotmaw, 8% |
| r01 | `uq_ossuary_bonewraps` | Ossuary Bonewraps | hands | melee 10% to apply Crushed (+5% from you, 3 stacks) | the Ossuary Warden, 8% |
| r02 | `uq_hailwrights_tongs` | Hailwright's Tongs | hands | fire hits lower your own Cold by 2; +6% fire | Borga hard mode, 20% |
| r02 | `uq_councils_three_rings` | The Council's Three Rings | ring | on interrupt a random +15% haste / +15% damage / −10% taken, 10 s | Council hard mode, 15% |
| r02 | `uq_rimefang_collar` | Rimefang Collar | necklace | pet +20% attack speed, freezes on its 10th hit | Rimefang Matriarch, 8% |
| r02 | `uq_whiteout_lantern` | Lantern of the White Crossing | light | +25 m sight in weather; allies in light −5% cold | the Whiteout, 8% |
| r02 | `uq_glacier_throne_signet` | Signet of the Glacier Throne | ring | +8% damage and healing above 80% health | Queen Ysmere 8% or quartermaster (15 Oathstones) |
| r03 | `uq_brinecoil_fang` | Brinecoil Fang | dagger | poison +12%; double on enemies in water | Mother Brinecoil hard mode, 15% |
| r03 | `uq_abbess_bell_staff` | The Abbess's Bell-Staff | staff | area heals make allies immune to charm 3 s | Abbess Marenne 8% / hard mode 15% |
| r03 | `uq_pearl_and_nacre` | Pearl and Nacre | ring pair | wearing both: alternating hits +2% each (max +10%) | the Pearl Twins, 8% |
| r03 | `uq_cantors_tuning_fork` | The Cantor's Tuning Fork | off-hand focus | interrupting gives +20% cast speed 5 s | the Drowned Cantor, 8% |
| r03 | `uq_saltbound_knuckles` | Saltbound Knuckles | hands | melee hits slow the target 5% a stack (5) | the Saltbound Colossus, 8% |
| r04 | `uq_petition_of_the_three_houses` | Petition of the Three Houses | necklace | on entering combat: random Ash / Iron / Flame blessing | Three Petitioners hard mode, 15% |
| r04 | `uq_brandts_champion_plume` | Brandt's Champion Plume | heavy head | +15% to an enemy when you are the only ally within 12 m | Castellan Brandt hard mode, 15% |
| r04 | `uq_varros_leash` | Varro's Leash | hands | pets/summons +15% faster, fixate your target 4 s | Kennelmaster Varro, 8% |
| r04 | `uq_cinderjaw_grille` | The Cinderjaw Grille | shield | blocks push the attacker 1.5 m (bosses 0.5 m) | Cinderjaw, 8% |
| r04 | `uq_hestas_apprentice_hammer` | Tobbin's Hammer | 1H hammer | every 4th hit inscribes a rune; the 5th detonates for 150% | Forge-Queen Hesta 8% (25% if the apprentice was spared) |
| r04 | `uq_ashen_herald_feather` | Feather of the Ashen Herald | necklace | once per 5 min, revive at 20% after 3 s | the Ashen Herald, 8% |
| r05 | `uq_saelith_spindle` | Saelith's Spindle | staff | area spells thread allies: 10% of damage shared | Saelith 15% / hard mode 35% |
| r05 | `uq_horologe_pocketwatch` | The Horologe's Pocketwatch | necklace | cooldowns 5% faster; every 12th second +20% | the Horologe hard mode, 15% |
| r05 | `uq_grey_collar` | The Grey Collar | necklace | pet crosses realms with you, +15% damage | Grey and Greyer, 8% |
| r05 | `uq_threshold_keystone` | Threshold Keystone | ring | crossing a rift or dodging +8% damage 4 s | the Threshold, 8% |
| r05 | `uq_mirror_of_the_court` | Mirror of the Court | off hand | once per 45 s next spell recast by a mirror at 40% | the Mirror Court, 8% |
| r05 | `uq_anvarr_heartstone` | Anvarr's Heartstone | heavy chest | heartbeat heals 2% every 8 s; 5 unhurt beats halve the next hit | Anvarr, 8% |
| r05 | `uq_curators_ledger` | The Curator's Ledger | off-hand focus | +0.5% vs a boss family per kill (max +5% each) | the Curator, 8% |
| r05 | `uq_mouth_that_speaks_true` | The Mouth That Speaks True | head | lying boss warning lines marked for you on Mythic | the Many-Mouthed, 8% |
| World boss | `uq_griefplate_gauntlets` | Griefplate Gauntlets | heavy hands | blocks give a 5% armour stack (max 5) | Grief-in-Iron (`greyridge`) |
| World boss | `uq_glasswyrm_scale_ring` | Glasswyrm Scale Ring | ring | 5% of damage taken reflected as shards | the Glass Wyrm (`sunscar`) |
| World boss | `uq_brood_silk_wraps` | Brood-Silk Wraps | light hands | roots last 1 s longer | the Hungering Brood (`whisperwood`) |
| World boss | `uq_carrion_crown_talons` | Carrion Crown Talons | medium hands | +10% to enemies below 30% | the Carrion Crown (`cinder_steppe`) |
| World boss | `uq_ruinstone_helm` | Ruinstone Helm | heavy head | stand still 2 s: −15% damage until you move | the Standing Ruin (`frostmantle`) |
| World boss | `uq_sallow_crown` | Sallow Crown | head | curses last 20% longer, heal 1% of damage | the Sallow King (`drowned_coast`) |
| World boss | `uq_unmoored_anchor` | Unmoored Anchor | off hand | immune to knockback/pull 3 s after one (20 s) | the Unmoored (`riftmarch`) |
| World boss | `uq_slagborn_core` | Slagborn Core | necklace | −10% fire taken; 10% of it added to next fire hit | Slagborn (`emberthrone`) |
| Seasonal | `uq_effigys_candle_eyes` | Effigy's Candle Eyes | head | +5% damage in the dark | the Harvest Effigy (`b_harvest_effigy`) |
| Seasonal | `uq_stags_lantern` | Stag's Lantern | light | allies in your light −5% cold damage | the Longnight Stag (`b_longnight_stag`) |
| Seasonal | `uq_tyrants_seed` | Tyrant's Seed | necklace | heals leave a 3 m flower, 1%/s for 5 s | the Bloomtyrant (`b_bloomtyrant`) |
| Seasonal | `uq_sunwake_scale` | Sunwake Scale | ring | +8% move; +20% in water | the Sunwake Serpent (`b_sunwake_serpent`) |
| Seasonal | `uq_veilstorm_lens` | Veilstorm Lens | head | Veil-only telegraphs show faintly in the open world | the Veilstorm Herald (`b_veilstorm_herald`) |

World-boss uniques above have no names in page 13 (only ids); names are *from id*.

### 3.32 Duplicates to settle

Pages 09, 12 and 13 were drafted in parallel, and each dungeon and raid got a set (and a secret-boss
exclusive) from two pages. **Nothing is deleted here.** The "Keep" column follows canon §3: the page that
owns the instance owns its loot table (12 for dungeons, 13 for raids).

#### Sets

| Instance | This page (§2) | Owner page | Keep | What happens to this page's set |
|---|---|---|---|---|
| `d01_hollow_barrow` | `set_barrowwarden` "Barrowwarden's Charge" (4, slot-agnostic: back, waist, necklace, ring) | 12: `set_barrowwarden` "Barrowwarden's Rest" (4, medium: chest, hands, head, legs) | **12** | same id, different set — see Collisions §3.33 #1. 09's bonus text (2: +5% health, +10% vs undead · 4: Banish) can become 12's bonus text, since 12's brief is the same theme |
| `d02_drowned_mill` | `set_millrace` | 12: `set_fenwader` | **12** | retire from the drop table; reuse its bonuses nowhere (different theme) |
| `d05_glass_tombs` | `set_glasswrights_regalia` (6, cloth) | 12: `set_sunglass_regalia` (4, cloth) | **12** | retire; 12's is 4 pieces, so 09 writes 2/4 bonus text for it |
| `d07_thornheart` | `set_thornstalker` (6, light) | 12: `set_thornwarden_bark` (4, medium) | **12** | retire |
| `d08_moonwell_ruins` | `set_moonwell_vestments` (6, adaptive healer) | 12: `set_moonsilver_vigil` (4, cloth) | **12** | retire; its piece `it_moonwell_circlet` also collides (§3.33 #2) |
| `d09_warmasters_pit` | `set_pitfighters_harness` (6, heavy) | 12: `set_pitchampion_leathers` (4, light) | **12** | retire |
| `d11_saltdeep_cathedral` | `set_saltchoir_raiment` (6, adaptive) | 12: `set_tidebound_vestments` (4, cloth) | **12** | retire |
| `d13_cindergate` | `set_cindergate_bulwark` (6, heavy tank) | 12: `set_emberbane_plate` (5, heavy) | **12** | retire |
| `d14_ashen_reliquary` | `set_reliquary_keepers` (6, M+ end chest only) | 12: `set_reliquary_ash` (6, bosses + Heroic quartermaster) | **12** | retire as a d14 set. If the owner wants a Mythic+-only set, re-source it as "any d01–d14 Mythic+ end chest" instead — that no longer competes with page 12 |
| `r01_barrowking` | `set_barrowkings_tithe` (heavy) | 13: `set_ninefold_oath` (4 weights, by role) | **13** | retire |
| `r02_glacier_throne` | `set_rimecrown_regalia` (cloth) | 13: `set_rimebound_court` | **13** | retire |
| `r03_sunken_choir` | `set_choir_of_the_deep` (adaptive) | 13: `set_drowned_choir` | **13** | retire |
| `r04_ember_court` | `set_court_of_embers` (light) | 13: `set_emberlord_regalia` | **13** | retire |
| `r05_veilspire` | `set_veilborn_ascendance` (adaptive) | 13: `set_veilwoven` | **13** | retire |

Dungeons `d03`, `d04`, `d06`, `d10`, `d12` had no set on this page, so their page 12 sets are not duplicates.
After this, the generic catalogue of §2 keeps 6 sets that no other page competes with:
`set_wayfarers_heirlooms`, `set_trophies_of_the_wild_hunt`, `set_journeymans_harness`,
`set_veilglass_artifice`, `set_open_field_vanguard`, `set_mercenary_captains_kit` (+ the Archivist's Regalia).
**Follow-up for this page:** write full 2/4(/5/6) bonus text for the 14 page 12 sets from their briefs (page
12 §19.5 asks for it).

#### Secret-boss exclusives (one exclusive legendary per secret boss, page 08 §12.3)

| Instance | This page (§7) | Owner page | Keep as the exclusive | What happens to this page's legendary |
|---|---|---|---|---|
| d01 | `leg_candle_of_the_unburied` | 12: `leg_first_sleepers_shroud` | **12** | becomes a normal `d01` final-boss legendary (keeps "the first legendary most players see") |
| d02 | `leg_lifebinder_thread` | 12: `leg_ledger_of_the_deep` | **12** | → `d02` final boss |
| d03 | `leg_trailblazers_lantern` | 12: `leg_heart_of_the_unmined` | **12** | → `d03` final boss |
| d04 | `leg_ironroot_sabatons` | 12: `leg_the_cold_anvil` | **12** | → `d04` boss 2 (the final already carries `leg_grudgekeeper_helm`) |
| d05 | — (mount only) | 12: `leg_the_unseen_prince` | **12** | no clash; the mount `it_mount_dune_sabrecat` stays |
| d06 | `leg_venomheart_ring` | 12: `leg_water_of_tamar` | **12** | → `d06` boss 2 |
| d07 | `leg_bramblemothers_seed` | 12: `leg_wyllows_gratitude` | **12** | → `d07` boss 2 |
| d08 | `leg_mercy_bell` | 12: `leg_the_moon_returned` | **12** | → `d08` boss 2 |
| d09 | `leg_pit_champions_belt` | 12: `leg_the_undefeated` | **12** | → `d09` boss 2 |
| d10 | `leg_quickfeather_cloak` | 12: `leg_mothers_last_winter` | **12** | → `d10` boss 2 |
| d11 | `leg_sunforged_gauntlets` | 12: `leg_heart_of_the_tidewife` | **12** | → `d11` boss 2 |
| d12 | `leg_brass_familiar` | 12: `leg_the_finished_thing` | **12** | → `d12` boss 2 |
| d13 | `leg_bulwark_of_ages` | 12: `leg_the_first_flame` | **12** | → `d13` boss 2 |
| d14 | `leg_phoenix_feather` | 12: `leg_the_first_ember` | **12** | → `d14` boss 2 |
| r01 | `leg_barrowkings_second_crown` | 13: `leg_crown_of_the_ninth` | **13** | → world pool 30+ (every r01 boss already has a legendary) |
| r02 | `leg_heart_of_the_glacier` | 13: `leg_heart_of_the_sleeper` | **13** | → world pool 42+ |
| r03 | `leg_voidwalker_soles` | 13: `leg_the_unsung_note` | **13** | → world pool 50+ |
| r04 | `leg_crown_of_the_ember_king` | 13: `leg_kiln_heart` | **13** | → world pool 60; it also duplicates the idea of `leg_crown_of_kaedros` (both are the Ember King's crown) — rename recommended in §3.33 |
| r05 | `leg_the_unwritten_page` | 13: `leg_first_torch` + `leg_dream_of_the_march` | **13** | → Veil Sigil vendor (`cur_veil_sigil`) or world pool 60 |

Titles and guaranteed appearances in §7 are not duplicated by pages 12/13 and stay as written.

#### Raid bosses carrying two generic legendaries

§9 check 2 says no raid boss lists more than one generic legendary. Page 13 added one to eleven bosses
that §6 had already given one:

| Raid · boss | This page (§6) | Page 13 | Recommendation |
|---|---|---|---|
| r01 · 1 Ossuary Warden | `leg_counterweight_gauntlets` | `leg_marrow_reliquary` | keep 13's on the boss; move 09's to the r01 quartermaster (Oathstones) |
| r01 · 5 the Barrowking | `leg_crown_of_the_hollow_court` | `leg_kingsblade_of_hrodric` | same |
| r02 · 4 Skathra | `leg_frostlocke_sigil` | `leg_windmothers_last_feather` | same |
| r02 · 6 Queen Ysmere | `leg_stoneskin_mantle` | `leg_ysmeres_long_winter` | same |
| r03 · 4 Captain Grimwater | `leg_wellspring_chalice` | `leg_grimwaters_last_broadside` | same |
| r03 · 7 the Choirmaster | `leg_reapers_due` | `leg_choirmasters_ninth_eye` | same |
| r04 · 6 Vaelkyr | `leg_carrion_crown` | `leg_emberwing_pinion` | same |
| r04 · 8 Kaedros | `leg_sovereigns_ember` | `leg_crown_of_kaedros` | same |
| r05 · 3 the Horologe | `leg_tetherbreak_torc` | `leg_horologe_mainspring` | same |
| r05 · 8 Nhal | `leg_mirror_of_the_veil` | `leg_starless_scale` | same |
| r05 · 10 the Unwoven | `leg_voidtouched_diadem` | `leg_unwoven_spindle` | same |

The alternative is to relax check 2 to "at most two generic legendaries per raid boss". Moving is
recommended because it keeps the loot table readable, which is what check 2 is for.

### 3.33 Collisions

Checked with a grep of every `` `leg_…` ``, `` `uq_…` `` and `` `set_…` `` id across `docs/` and
`docs/classes/` (734 distinct ids). **Exact id collisions** (one id, two different items):

| # | id | Defined in | What differs | Recommended rename |
|---|---|---|---|---|
| 1 | `set_barrowwarden` | 09 §2.3 "Barrowwarden's Charge" · 12 d01 "Barrowwarden's Rest" | name, armour, slots, bonuses | 12 keeps the id; if 09's version survives, `set_barrowwarden_charge` |
| 2 | `it_moonwell_circlet` (item, found by the same check) | 09 §2.7 set piece (adaptive head) · 13 §7 Saelith drop (light head) | two different items | 13 keeps it; 09's piece → `it_moonwell_vestments_circlet` (moot if the set is retired) |

**Near-collisions** (different ids, names close enough to confuse a player or a search). Renames are
recommendations; the owner of each item decides.

| # | Items | Problem | Recommended rename |
|---|---|---|---|
| 3 | `uq_sextons_spade` (necromancer, staff, from `b_sexton_morrow`) · `it_sextons_spade` (12, two-handed mace, same boss) | same name, same boss, different items | 12's plain item → `it_sextons_mattock` "Sexton's Mattock" |
| 4 | `leg_counterweight` (fighter, "Counterweight") · `leg_counterweight_gauntlets` (09, "Counterweight Gauntlets") | same word, both legendaries | 09's → `leg_rebound_gauntlets` "Rebound Gauntlets" |
| 5 | `leg_ironroot_sabatons` (09) · `leg_ironroot_greaves` (runesmith) | both "Ironroot", both legendary leg/feet armour | 09's → `leg_rootfast_sabatons` "Rootfast Sabatons" |
| 6 | `leg_crown_of_the_hollow_court` (09) · `leg_crown_of_the_hollow_host` (warlock) | one word apart | 09's → `leg_crown_of_the_barrow_court` "Crown of the Barrow Court" |
| 7 | `leg_crown_of_the_ember_king` (09) · `leg_crown_of_kaedros` (13) | both are the Ember King's crown (Kaedros is the Ember King) | 09's → `leg_crown_of_the_ashen_heir` "Crown of the Ashen Heir" |
| 8 | `leg_thunderhead_crown` (09) · `uq_thunderhead` (09) · stormcaller spell "Thunderhead" | three things called Thunderhead | legendary → `leg_brewing_storm_crown` "Crown of the Brewing Storm" |
| 9 | `leg_glasswalkers_robe` (09) · `uq_glasswalker_sceptre` (oracle) | "Glasswalker" twice | oracle's → `uq_glassreader_sceptre` "Glassreader's Sceptre" |
| 10 | `leg_sunforged_gauntlets` (09) · `set_pyromancer_sunforged_raiment` | "Sunforged" twice | 09's → `leg_noonforged_gauntlets` "Noonforged Gauntlets" |
| 11 | `leg_herald_of_ashes` (12) · `uq_ashen_herald_feather` (13, from the Ashen Herald) | "Herald of Ashes" vs "Ashen Herald" | 12's → `leg_veydrecs_standard` "Veydrec's Standard" |
| 12 | `set_fighter_drillmaster`, `leg_the_drillmasters_word` (fighter) · `uq_drillmasters_whistle` (tactician) | "Drillmaster" in two classes | tactician's → `uq_field_marshals_whistle` "Field Marshal's Whistle" |
| 13 | `leg_phoenix_feather` (09) · `leg_phoenix_quill` (pyromancer) | both "Phoenix", both cheat death | 09's → `leg_ashborn_feather` "Ashborn Feather" |
| 14 | `set_priest_regalia_of_the_sunken_choir` (priest) · raid `r03_sunken_choir` · `set_drowned_choir` (13) | a class set named after the raid it drops in, next to the raid's own set | priest's → `set_priest_lamps_of_the_deep` "Lamps of the Deep" |

No `leg_`, `uq_` or `set_` id is defined twice with different content inside the class files, and no class
item id repeats an id from pages 09, 12 or 13.

---

## 4. Uniques

### 4.1 The world pool (reuse)

`(reuse: prototypes/farhold/data/uniques.json + js/uniques.js + js/foci.js)` — Farhold's 189 uniques
(round 23: 4 per plain weapon type, 2 per element per caster, 2 per armour slot and weight, shield, ward,
quiver, ring, necklace, mount, light, tool; plus five warband uniques from round 27) and the 8 focus uniques
all come to Wildmarch as the **world unique pool**, minus the 2 tool uniques (no tool slot). Each drops
from the world pool at the Wildmarch level of its Farhold act:

| Farhold `act` | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| First drops at level | 5 | 14 | 24 | 34 | 44 | 54 |

A unique drops at the level of what dropped it (never below that first level), and its lines scale with
that item level. The five **warband uniques** (`fh_gutterkings_shiv`, `fh_ashtusk_headtaker`, `fh_moonhook`,
`fh_gravemarshals_oath`, `fh_peakbreaker`) drop only from their warband's war camp and warlord (page 10).
In Wildmarch ids the `fh_` prefix becomes `uq_`.

**Pool size:** 187 (Farhold) + 8 (foci) + 15 new below = **210 uniques**.

### 4.2 Headline uniques (79)

These are the ones given a **listed source** on top of the world pool — a dungeon's boss table (6% per
player per boss, shared evenly with that boss's other named uniques) and the region's rare elites (3%).
Lines are Farhold's numbers at the unique's first level ("+4% crit" = +4 percentage points; "attack speed"
is Farhold `initiative` × 4). Powers are in §5.

| # | id | Name | Slot · type | Level | Fixed lines | Random line | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `uq_nettlepin` | Nettlepin | Main hand · dagger | 5 | +6 DEX, +4% crit | +9–17% crit dmg | `venom_stack` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A sliver of green bronze. The wound it leaves never quite closes, and neither does the next one.* |
| 2 | `uq_the_quiet_second` | The Quiet Second | Main hand · dagger | 34 | +14 DEX, +32% crit dmg | +4–8% crit | `echo_strike` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *Every cut is answered by a second one nobody saw coming.* |
| 3 | `uq_oathcutter` | Oathcutter | Main hand · sword | 5 | +6 STR, +8% attack speed | +9–17% crit dmg | `battle_trance` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *Swung the same way five times, it remembers the promise it was forged to keep.* |
| 4 | `uq_pyrewright` | Pyrewright | Main hand · sword | 54 | +18 STR, +14 damage | +56–100 health | `fire_trail` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `emberthrone` 3% | *Every stroke leaves the grass alight behind it.* |
| 5 | `uq_stormwake` | Stormwake | Main hand · longsword | 24 | +11 STR, +4.4% life steal | +4–10 damage | `chain_lightning` | world pool from 24; `d05_glass_tombs` bosses 6%; rares in `sunscar` 3% | *Thunder follows it out of the scabbard and finds everyone standing near.* |
| 6 | `uq_tyrants_end` | Tyrant's End | Main hand · longsword | 54 | +18 STR, +96 health | +5–10% crit | `nemesis_hunter` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `emberthrone` 3% | *Forged to end one crowned butcher. It never stopped looking for the next.* |
| 7 | `uq_needle_of_vess` | Needle of Vess | Main hand · rapier | 5 | +6 DEX, +4% crit | +9–17% crit dmg | `stillness` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A duellist's needle. Plant your feet, breathe once, and it finds the gap.* |
| 8 | `uq_riposte_of_glass` | Riposte of Glass | Main hand · rapier | 34 | +14 DEX, +32% crit dmg | +4–8% crit | `glass_heart` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *Thin as a vow and as easily broken. It strikes like a hammer and leaves you nothing to hide behind.* |
| 9 | `uq_winterbite` | Winterbite | Main hand · sabre | 14 | +9 DEX, +8% attack speed | +13–24% crit dmg | `frostbite` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *It numbs before it cuts. Stand against it long enough and you stop moving at all.* |
| 10 | `uq_prism_dancer` | Prism Dancer | Main hand · sabre | 24 | +11 DEX, +54 health | +3.5–7% crit | `alternate_elements` | world pool from 24; `d06_sandsworn_vault` bosses 6%; rares in `sunscar` 3% | *Three flames were quenched in the glass: one red, one pale, and one that crackled.* |
| 11 | `uq_reavers_due` | Reaver's Due | Main hand · axe | 24 | +11 STR, +4.4% life steal | +4–10 damage | `blood_price` | world pool from 24; `d05_glass_tombs` bosses 6%; rares in `sunscar` 3% | *It drinks from both ends of the haft.* |
| 12 | `uq_gorewind` | Gorewind | Main hand · axe | 54 | +18 STR, +96 health | +5–10% crit | `vampire_kill` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `emberthrone` 3% | *Every life it ends pours a little back into the arm that swung it.* |
| 13 | `uq_rendmaw` | Rendmaw | Main hand · greataxe | 14 | +9 STR, +5% crit | +13–24% crit dmg | `quake_slam` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *Heavy enough that every third swing ends in the dirt, and the dirt ends up everywhere.* |
| 14 | `uq_greymarch_headsman` | Greymarch Headsman | Main hand · greataxe | 44 | +16 STR, +38% crit dmg | +4.5–9% crit | `cull` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *The headsman of Greymarch never needed a second stroke.* |
| 15 | `uq_candlemace` | Candlemace | Main hand · mace | 5 | +6 STR, +8% attack speed | +9–17% crit dmg | `pyre_aura` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *Its head still holds the coals of the shrine it was stolen from.* |
| 16 | `uq_bellbreaker` | Bellbreaker | Main hand · mace | 34 | +14 STR, +7% crit | +21–38% crit dmg | `resonance` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *It rings like a struck bell, and louder for every hurt already on its target.* |
| 17 | `uq_anvilheart` | Anvilheart | Main hand · hammer | 14 | +9 STR, +20% crit dmg | +3–6% crit | `quake_slam` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *A smith's hammer that forgot what it was for. The ground remembers.* |
| 18 | `uq_thunderhead` | Thunderhead | Main hand · warhammer | 44 | +16 STR, +38% crit dmg, +30% lightning brand | +4.5–9% crit | `static_charge` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *The storm it was forged in never finished. Strike one thing and the rest of the sky comes down.* |
| 19 | `uq_the_long_scythe` | The Long Scythe | Main hand · greatsword | 14 | +9 STR, +8% attack speed | +13–24% crit dmg | `third_cleave` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *Too long to swing any way but around.* |
| 20 | `uq_grave_harvest` | Grave Harvest | Main hand · greatsword | 24 | +11 STR, +54 health | +3.5–7% crit | `curse_spreads` | world pool from 24; `d06_sandsworn_vault` bosses 6%; rares in `sunscar` 3% | *The blade of the plague-reapers. What it cuts down, it passes on.* |
| 21 | `uq_longwatch_pike` | Longwatch Pike | Main hand · halberd | 14 | +9 STR, +20% crit dmg | +3–6% crit | `frost_skin` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *Northern sentries set it in the snow and let the cold do the rest.* |
| 22 | `uq_the_sentinels_arc` | The Sentinel's Arc | Main hand · halberd | 44 | +16 STR, +16% attack speed | +25–45% crit dmg | `crescendo` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *A gate-guard's polearm. The longer the siege, the harder it answers.* |
| 23 | `uq_boarsplitter` | Boarsplitter | Main hand · spear | 5 | +6 DEX, +4% crit | +9–17% crit dmg | `hemorrhage` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A hunting spear. Anything that runs from it bleeds harder.* |
| 24 | `uq_pilgrim_oak` | Pilgrim Oak | Main hand · quarterstaff | 5 | +6 STR, +8% attack speed | +9–17% crit dmg | `crit_heal` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *Cut from the tree at the crossroads shrine. Travellers swear it mends the walker.* |
| 25 | `uq_the_unbent_reed` | The Unbent Reed | Main hand · quarterstaff | 54 | +18 STR, +14 damage | +56–100 health | `retaliate_nova` | world pool from 54; `d13_cindergate` bosses 6%; rares in `emberthrone` 3% | *Strike its bearer and the winter it was cut in strikes back.* |
| 26 | `uq_hawkfeather` | Hawkfeather | Main hand · bow | 5 | +6 DEX, +14% crit dmg | +2.5–5% crit | `ricochet` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *Its arrows never seem to stop where they should.* |
| 27 | `uq_comets_wake` | Comet's Wake | Main hand · bow | 44 | +16 DEX, +16% attack speed | +25–45% crit dmg | `resonance` | world pool from 44; `d11_saltdeep_cathedral` bosses 6%; rares in `drowned_coast` 3% | *Strung with a thread of cold light, it hits hardest where the hurt is already deep.* |
| 28 | `uq_wasps_nest` | Wasp's Nest | Main hand · shortbow | 14 | +9 DEX, +6 damage | +24–44 health | `venom_stack` | world pool from 14; `d04_bellows_keep` bosses 6%; rares in `greyridge` 3% | *Every shaft is fletched with the wings of something that stings.* |
| 29 | `uq_frostlatch` | Frostlatch | Main hand · crossbow | 24 | +11 DEX, +54 health | +3.5–7% crit | `frostbite` | world pool from 24; `d05_glass_tombs` bosses 6%; rares in `sunscar` 3% | *The mechanism is packed with glacier ice that never melts.* |
| 30 | `uq_ironhail` | Ironhail | Main hand · crossbow | 54 | +18 DEX, +14 damage | +56–100 health | `fourth_volley` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `emberthrone` 3% | *A siege crossbow with four grooves where one should be.* |
| 31 | `uq_longstrider` | Longstrider | Main hand · javelin | 24 | +11 DEX, +4.4% life steal | +4–10 damage | `ricochet` | world pool from 24; `d05_glass_tombs` bosses 6%; rares in `sunscar` 3% | *A scout's javelin that goes where it likes and comes to no harm.* |
| 32 | `uq_cinderquill` | Cinderquill | Main hand · wand (fire) | 5 | +6 INT, +9% spell power | +2.5–5% crit | `kindling` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *A burnt feather set in a tin ferrule. It writes in fire, and the words keep burning.* |
| 33 | `uq_tempest_needle` | Tempest Needle | Main hand · wand (lightning) | 34 | +14 INT, +16% spell power | +4–8% crit | `chain_lightning` | world pool from 34; `d09_warmasters_pit` bosses 6%; rares in `cinder_steppe` 3% | *Thin as a sewing needle. The storm it carries is not.* |
| 34 | `uq_hailcaller` | Hailcaller | Main hand · wand (ice) | 44 | +16 INT, +2.8 resource/s | +11–21% spell power | `twin_bolt` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *Where one hailstone falls, another follows.* |
| 35 | `uq_sootcrown` | Sootcrown | Main hand · staff (fire) | 14 | +9 INT, +11% spell power | +24–44 health | `overload` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *A charred crook topped with a crown of cinders. Every fourth spell it casts comes out enormous.* |
| 36 | `uq_glaciers_spine` | Glacier's Spine | Main hand · staff (ice) | 24 | +11 INT, +6% crit | +8–15% spell power | `shatter` | world pool from 24; `d06_sandsworn_vault` bosses 6%; rares in `sunscar` 3% | *A length of blue ice from the heart of a glacier. What it chills, it breaks.* |
| 37 | `uq_graveshroud_staff` | Graveshroud Staff | Main hand · staff (shadow) | 54 | +18 INT, +58 resource | +29–52% crit dmg | `curse_spreads` | world pool from 54; `d13_cindergate` bosses 6%; rares in `emberthrone` 3% | *Wrapped in burial linen that never rots. Whatever it curses, the curse remembers.* |
| 38 | `uq_marsh_kings_sceptre` | Marsh King's Sceptre | Main hand · scepter (poison) | 5 | +6 INT, +9% spell power | +2.5–5% crit | `venom_stack` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *The mire-king's rod of office. His subjects died slowly, and in order.* |
| 39 | `uq_pale_monarch` | Pale Monarch | Main hand · scepter (ice) | 54 | +18 INT, +21% spell power | +56–100 health | `shatter` | world pool from 54; `d13_cindergate` bosses 6%; rares in `emberthrone` 3% | *A crown of frost on a rod of bone. It rules over what has stopped moving.* |
| 40 | `uq_mirrorsphere` | Mirrorsphere | Main hand · orb (arcane) | 5 | +6 INT, +18 resource | +9–17% crit dmg | `barrier_burst` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *A sphere of mirrors that reflects the world a moment late. Break its guard and it breaks you back.* |
| 41 | `uq_primer_of_echoes` | Primer of Echoes | Main hand · tome (arcane) | 5 | +6 INT, +1.2 resource/s | +5–9% spell power | `echo_cast` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A child's spell primer. Every lesson in it repeats itself.* |
| 42 | `uq_seers_veil` | Seer's Veil | Head · head:cloth | 14 | +4 armour, +7 INT, +5 CON | +7–14 resist all | `overflow` | world pool from 14; `d04_bellows_keep` bosses 6%; rares in `greyridge` 3% | *A veil of spider-silk worn by the oracles, who never ran out of words.* |
| 43 | `uq_mask_of_the_fox` | Mask of the Fox | Head · head:light | 34 | +9 armour, +11 DEX, +58 health | +2.6–5.2% crit | `kill_frenzy` | world pool from 34; `d09_warmasters_pit` bosses 6%; rares in `cinder_steppe` 3% | *A red-leather mask. Its wearer grows quicker with every kill, and harder to follow.* |
| 44 | `uq_bellhelm` | Bellhelm | Head · head:heavy | 24 | +13 armour, +9 STR, +7 CON | +1.4–2.8 health/s | `retaliate_nova` | world pool from 24; `d06_sandsworn_vault` bosses 6%; rares in `sunscar` 3% | *Strike it and it rings with the cold of the mountain it was forged under.* |
| 45 | `uq_robe_of_the_last_lamp` | Robe of the Last Lamp | Chest · chest:cloth | 5 | +3 armour, +5 INT, +4 CON | +5–10 resist all | `barrier_burst` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *The lamplighters of the old city wore it on the night the lamps went out.* |
| 46 | `uq_hydra_scale` | Hydra Scale | Chest · chest:medium | 54 | +16 armour, +15 CON, +82 health | +2.3–4.6 health/s | `thornmail` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `emberthrone` 3% | *Every scale was cut from a head that grew back. Strike one and it strikes you.* |
| 47 | `uq_bastion_of_kharr` | Bastion of Kharr | Chest · chest:heavy | 44 | +18 armour, +13 STR, +70 health | +2–4 health/s | `second_wind` | world pool from 44; `d11_saltdeep_cathedral` bosses 6%; rares in `drowned_coast` 3% | *The last wall of Kharr, beaten into a breastplate when the city fell.* |
| 48 | `uq_mooncloth_wraps` | Mooncloth Wraps | Legs · legs:cloth | 34 | +6 armour, +11 INT, +58 health | +11–22 resist all | `free_move` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *Cloth woven by moonlight. It never tires, and neither does its wearer.* |
| 49 | `uq_cutpurse_gloves` | Cutpurse Gloves | Hands · hands:light | 5 | +5 armour, +5 DEX, +4 CON | +1.4–2.8% crit | `battle_trance` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *The fingers were worn smooth by a thousand patient thefts.* |
| 50 | `uq_stormgrip` | Stormgrip | Hands · hands:medium | 44 | +14 armour, +13 CON, +70 health | +2–4 health/s | `chain_lightning` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *Copper wire is woven through the mail. Every blow arcs.* |
| 51 | `uq_ashstep_boots` | Ashstep Boots | Feet · feet:light | 34 | +9 armour, +11 DEX, +58 health | +2.6–5.2% crit | `fire_trail` | world pool from 34; `d09_warmasters_pit` bosses 6%; rares in `cinder_steppe` 3% | *Wherever they walk into a fight, the ground catches.* |
| 52 | `uq_marchwarden_boots` | Marchwarden Boots | Feet · feet:medium | 14 | +8 armour, +7 CON, +34 health | +1.1–2.2 health/s | `second_wind` | world pool from 14; `d04_bellows_keep` bosses 6%; rares in `greyridge` 3% | *The boots of a marchwarden who walked home from a massacre.* |
| 53 | `uq_parrys_promise` | Parry's Promise | Off hand · shield | 5 | +6 CON, +11 block power, +5% block | +5–9 armour | `bulwark` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A duellist's buckler, dented in the centre from ten thousand turned blades.* |
| 54 | `uq_aegis_of_last_light` | Aegis of Last Light | Off hand · shield | 44 | +14 CON, +31 block power, +9% block | +13–21 armour | `thornmail` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *The shield of the last paladin of the dawn order. It still punishes the wicked.* |
| 55 | `uq_glimmerward` | Glimmerward | Off hand · ward | 14 | +8 INT, +22 barrier, +3 barrier/s | +8–16 resist all | `barrier_burst` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *A disc of polished crystal. When its ward shatters, so does everything near it.* |
| 56 | `uq_emberwing_quiver` | Emberwing Quiver | Off hand · quiver | 14 | +9 DEX, +5 arrow damage | +3–6% crit | `kindling` | world pool from 14; `d04_bellows_keep` bosses 6%; rares in `greyridge` 3% | *The fletchings are phoenix down, or so the seller swore. They do not stop burning.* |
| 57 | `uq_band_of_echoes` | Band of Echoes | Ring · ring | 5 | +5 INT, +5 CON | +1.5–3% crit | `echo_strike` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A plain iron band that hums a moment after every blow.* |
| 58 | `uq_signet_of_the_glass_throne` | Signet of the Glass Throne | Ring · ring | 34 | +11 STR, +11 DEX | +3–6% crit | `glass_heart` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *The seal of a queen who ruled by fear and died by it.* |
| 59 | `uq_pendant_of_wounds` | Pendant of Wounds | Neck · necklace | 14 | +7 CON, +34 health | +6–12% spell power | `resonance` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *A string of old arrowheads, one for every wound its owner survived.* |
| 60 | `uq_veinstone_of_vael` | Veinstone of Vael | Neck · necklace | 44 | +13 CON, +70 health | +11–21% spell power | `crit_ward` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *A red stone that beats. It shields the heart it hangs over.* |
| 61 | `uq_lantern_of_morrow` | Lantern of Morrow | Light · light | 14 | +18 m light, +28 health | +7–14 resist all | `dread_lantern` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *A lamp from a haunted lighthouse. Its light makes brave things falter.* |
| 62 | `uq_sunjar` | Sunjar | Light · light | 44 | +33 m light, +58 health | +13–26 resist all | `searing_light` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *A jar of noon, sealed with wax. Nothing that hates the day can stand near it.* |
| 63 | `uq_brambleback` | Brambleback | Mount · mount | 14 | +7 CON, +8 s gallop | +14–26% less slowing on slopes | `rider_fury` | world pool from 14; `d03_deepdelve` bosses 6%; rares in `greyridge` 3% | *A bad-tempered moor pony with a scar for every fight it enjoyed.* |
| 64 | `uq_thunderhoof` | Thunderhoof | Mount · mount | 44 | +13 CON, +14 s gallop | +20–35% less slowing on slopes | `stormrider` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *A storm-elk from the high plains. Lightning follows it like a herd.* |
| 65 | `uq_codex_of_tides` | Codex of Tides | Off hand · grimoire focus | 14 | +8 INT, +8% spell power | +15–30 resource | `page_storm` | world pool from 14; `d03_deepdelve` bosses 6% | *Every page is a sea someone drowned in. Read one aloud and it comes out of the book with you.* |
| 66 | `uq_pilgrims_last_bone` | Pilgrim's Last Bone | Off hand · reliquary focus | 14 | +8 CON, +30 health | +6–12 armour | `sanctuary` | world pool from 14; `d04_bellows_keep` bosses 6% | *The saint walked until only this was left. It is still walking, in a way.* |
| 67 | `uq_knot_of_nine_grudges` | Knot of Nine Grudges | Off hand · effigy focus | 24 | +10 INT, +6 DEX | +6–12% spell power | `hexbound` | world pool from 24; `d06_sandsworn_vault` bosses 6% | *Nine names are tied into the straw. Eight of them have stopped answering.* |
| 68 | `uq_wayworn_cloak` | Wayworn Cloak | Back · cloak | 5 | +4 CON, +20 health | +3–5% dodge | `free_move` | world pool from 5; `d01_hollow_barrow` bosses 6% | *Patched so many times that none of the first cloak is left. It still knows the way home.* |
| 69 | `uq_mantle_of_quiet_ash` | Mantle of Quiet Ash | Shoulders · cloth | 14 | +9 INT, +34 health | +6–12 resist all | `overflow` | world pool from 14; `d04_bellows_keep` bosses 6% | *It smells of a fire that went out politely.* |
| 70 | `uq_ropemakers_knot` | Ropemaker's Knot | Waist · cloth | 14 | +9 INT, +34 health | +10–20% potion power | `second_wind` | world pool from 14; `d03_deepdelve` bosses 6% | *Tied by someone who expected to be hanging from it.* |
| 71 | `uq_hornbacked_spaulders` | Hornbacked Spaulders | Shoulders · light | 24 | +11 DEX, +46 health | +3–6% crit | `stride` | world pool from 24; `d05_glass_tombs` bosses 6% | *Cut from a beast that never once stood still, and neither will you.* |
| 72 | `uq_cloak_of_the_hunted_stag` | Cloak of the Hunted Stag | Back · cloak | 24 | +11 DEX, +46 health | +3–6% dodge | `kill_frenzy` | world pool from 24; `d06_sandsworn_vault` bosses 6% | *The stag got away. The cloak did not.* |
| 73 | `uq_belt_of_many_pouches` | Belt of Many Pouches | Waist · light | 24 | +11 DEX, +46 health, +1 potion belt charge per slot | +10–20% potion power | `vampire_kill` | world pool from 24; `d05_glass_tombs` bosses 6% | *Eleven pouches. Nine of them are empty. Nobody remembers what was in the tenth.* |
| 74 | `uq_ashfall_standard_cape` | Ashfall Standard Cape | Back · cape | 34 | +14 STR, +58 health | +7–14 resist all | `rally_on_kill` | world pool from 34; `d09_warmasters_pit` bosses 6%; Cinder Steppe war camps 4% | *Cut from a banner that was carried out of Fort Ashfall and never carried back in.* |
| 75 | `uq_girdle_of_the_pit` | Girdle of the Pit | Waist · heavy | 34 | +14 STR, +58 health, +10 armour | +10–20% potion power | `thornmail` | world pool from 34; `d09_warmasters_pit` bosses 6% | *Every notch was a champion. The buckle was the last one.* |
| 76 | `uq_pauldrons_of_the_gatewarden` | Pauldrons of the Gatewarden | Shoulders · heavy | 44 | +16 STR, +70 health, +14 armour | +2–4 health/s | `bulwark` | world pool from 44; `d11_saltdeep_cathedral` bosses 6% | *The gate was stone. The warden was the part that held.* |
| 77 | `uq_veil_of_the_moonwell` | Veil of the Moonwell | Back · cloak | 44 | +16 INT, +70 health | +5–10% healing done | `crit_heal` | world pool from 44; `d10_rimefang_caverns` bosses 6% | *Woven from light that fell into the well and could not climb out.* |
| 78 | `uq_chainmantle_of_the_drowned` | Chainmantle of the Drowned | Shoulders · medium | 54 | +18 CON, +82 health | +2.3–4.6 health/s | `retaliate_nova` | world pool from 54; `d13_cindergate` bosses 6% | *Salt has eaten every link but one. That one is angry about it.* |
| 79 | `uq_studded_belt_of_the_long_watch` | Studded Belt of the Long Watch | Waist · medium | 54 | +18 CON, +82 health | +2.3–4.6 health/s | `crit_ward` | world pool from 54; `d12_unmade_workshop` bosses 6% | *One stud for every night the watch was kept. There are a great many studs.* |

Rows 1–64 are Farhold uniques (reuse); rows 65–67 are Farhold's focus uniques (reuse: `js/foci.js`); rows
68–79 are **new** — uniques for the three new slots (shoulders, back, waist), which Farhold does not have.

### 4.3 Unique changes from Farhold

| Farhold power | Farhold number | Wildmarch | Why |
|---|---|---|---|
| `nemesis_hunter` | +100% damage to rares **and bosses** | +100% to rares and champions, **+25% to bosses** | a five- or twenty-player boss is the normal game (canon pillar 4), and +100% on the one weapon would make it compulsory |
| `free_move` | +18% move speed | +10% | gear-side move-speed total is 15% (page 08 §5.3) |
| `rider_fury`, `stormrider` | fight while mounted | kept; only live if page 05 allows mounted fighting | page 05 |
| `frostbite`, `alternate_elements`, `gravity_bolt` | freeze / pull anything | **bosses cannot be Frozen or pulled**; a boss at 5 Frostbite stacks takes +10% from you for 3 s instead | boss rules (page 11) |
| `cull` | kills ordinary enemies and champions below 10% | unchanged; rares and bosses immune (as in Farhold) | — |
| every power | "ran twice" in Farhold round 23 (the Ingrate's +25% was +56%) | the Wildmarch registry must run each power **once**; a unit test counts calls | lesson kept |

---

## 5. Unique power glossary

`(reuse: prototypes/farhold/js/effects.js — the round-23 powers, numbers from its U23 table; the focus powers from FOCI)`
Every number here is the constant the code reads; the card sentence is generated from it (never typed twice).

| Power id | What it does (Wildmarch numbers) |
|---|---|
| `venom_stack` | Every hit adds a stack of Venom, up to 5: each stack deals 20% of the hit as poison over 6 s, and each new stack refreshes the rest |
| `echo_strike` | 25% of your melee hits strike the same enemy again 0.3 s later for 60% of your damage |
| `battle_trance` | Every 5th hit in a row on the same enemy is a guaranteed critical hit |
| `fire_trail` | An attack that hits leaves burning ground under the first enemy hit, at most once a second: 5 m across for 3 s, 25% of your damage a second as fire |
| `chain_lightning` | Every attack that hits jumps lightning to up to 3 more enemies within 8 m, 40% of your damage each |
| `nemesis_hunter` | +100% damage to rares and champions, +25% to bosses; killing a rare or boss heals you 30% of maximum health (changed, §4.3) |
| `stillness` | +30% critical chance once you have stood still for 1.5 s |
| `glass_heart` | +50% damage dealt and +25% damage taken |
| `frostbite` | Every hit adds Frostbite for 5 s: −8% move speed a stack; at 5 stacks a non-boss is Frozen for 1.5 s (a boss takes +10% from you for 3 s) |
| `alternate_elements` | Attacks cycle fire, ice, lightning, each applying its status: Burning (105% of the hit over 5 s), Chilled (−45% move, 4 s), Shocked (+30% damage taken, 3 s) |
| `blood_price` | +35% damage; every attack costs 1.5% of your maximum health (never below 1) |
| `vampire_kill` | Every kill heals you 12% of maximum health over 4 s |
| `quake_slam` | Every 3rd melee swing also slams: 70% of your damage within 4 m, knocking non-bosses 2 m back |
| `cull` | A hit that leaves an ordinary enemy or a champion below 10% health kills it; rares and bosses are immune |
| `pyre_aura` | Every 1 s in a fight, enemies within 4 m take 15% of your damage as fire and burn for 105% of that over 5 s |
| `resonance` | +12% damage for each different status on the enemy, up to +60% |
| `static_charge` | Every hit on a Shocked enemy arcs to 1 other enemy within 8 m for 50% of your damage |
| `third_cleave` | Every 3rd melee swing becomes a full circle at the weapon's reach |
| `curse_spreads` | Every kill copies the burning, bleeding, poison and curses the target carried onto every enemy within 9 m |
| `frost_skin` | Every enemy that hits you in melee is Chilled: −45% move speed for 4 s |
| `crescendo` | Each attack in a row +6% damage, up to +30% at 5; the 6th releases a shockwave, 100% of your damage within 5 m; resets after 3 s without attacking |
| `hemorrhage` | Critical hits open a Hemorrhage: 50% of the hit as bleed over 5 s, +10% for every metre the enemy moves while bleeding, up to +150% |
| `crit_heal` | Critical hits heal you 3% of maximum health |
| `retaliate_nova` | Every hit you take has a 20% chance to release a frost nova: 60% of your damage as ice within 5 m, Chilling |
| `ricochet` | Arrows that hit bounce to another enemy within 10 m for 60%, up to 2 bounces |
| `fourth_volley` | Every 4th shot looses 3 arrows in a fan |
| `kindling` | Every hit sets Kindling for 5 s: fire damage starting at 8% of the hit a second and rising by 4% of the hit each second, up to 24% a second |
| `twin_bolt` | Every bolt is followed 0.2 s later by a second bolt for 50% |
| `overload` | Every 4th staff spell deals 2× damage and covers 50% more ground |
| `shatter` | +50% damage to Chilled, Frostbitten or Frozen enemies |
| `barrier_burst` | When your barrier breaks it bursts: 80% of your damage as arcane within 5 m; once every 10 s |
| `echo_cast` | 25% of your spell casts fire a second time for 50%, free |
| `overflow` | +2 resource a second (Mana) or +2% regen (Fury/Focus), and +20% damage while your resource is full |
| `kill_frenzy` | Every kill adds Frenzy for 6 s, up to 5: +8% attack speed and +4% move speed a stack |
| `thornmail` | 40% of the damage you take from each hit is dealt back to the attacker |
| `second_wind` | When a hit leaves you below 30% health, gain a barrier of 35% of maximum health; once every 45 s |
| `free_move` | +10% move speed (changed from +18%) |
| `bulwark` | Every hit you block gives +20% damage for 4 s |
| `crit_ward` | Critical hits give you a barrier worth 20% of the damage dealt, up to 25% of maximum health |
| `dread_lantern` | Every enemy within 8 m of you in a fight is Unnerved and deals 15% less damage |
| `searing_light` | Every 2 s in a fight, enemies within 10 m take 12% of your damage as holy |
| `rider_fury` | +30% damage while mounted; a kill while mounted makes your mount 15% faster for 5 s |
| `stormrider` | While mounted in a fight, every 2 s lightning strikes the nearest enemy within 12 m for 60% of your damage |
| `stride` | +25% damage while you are moving |
| `rally_on_kill` | Every kill rallies you: +20% damage and +15% resistance for 8 s |
| `page_storm` | Every other wand bolt throws a page worth as much as the bolt it follows |
| `sanctuary` | Every blow you take has a 40% chance to be answered by a wide holy burst that leaves the enemies it touches Weakened |
| `hexbound` | Every status you lay lasts twice as long; an enemy carrying 2+ of your statuses takes 30% more from you |

The other round-23 powers used by the rest of the pool (`rot_spread`, `doom`, `mana_burn`, `split_bolt`,
`gravity_bolt`, `opportunist`, `twin_motes`, `archivist`, the 24 Emberveil originals…) come across with
their Farhold sentences unchanged except as §4.3 says. `prospector` and `quick_hands` (tools) are dropped.

---

## 6. Legendaries (84)

Every legendary: bind on pickup (world-pool ones bind on equip), **at most two worn** (page 08 §8.2), stat
package per §1. "N / H" = Normal / Heroic item level for dungeon sources (Mythic+ drops them from the end
chest at the chest's level); "N / M" = Normal / Mythic for raids. Every legendary on a dungeon boss also drops
in that dungeon's Heroic and Mythic+, so levelling legendaries have a level-60 copy.

Every legendary is **Legendary** rarity, drawn in violet `#c86bff`. **Overlaps with pages 12 and 13 (§3.32):**
the 18 secret-boss rows below marked "(exclusive)" compete with the secret-boss legendaries that pages 12
and 13 wrote for the same bosses, and 11 raid-boss rows share a boss with a page 13 legendary. §3.32
recommends where each one moves; the rows are unchanged until the owner decides.

### 6.1 Movement (9)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 1 | `leg_galewalker_treads` | Galewalker Treads | Feet · light | 29 / 68 | Your dodge roll becomes a 7 m blink (from 4 m) with no travel time and 0.4 s untargetable; dodge cooldown −1 s | `d07_thornheart` final | *The wind does not step around things.* |
| 2 | `leg_momentum_greaves` | Momentum Greaves | Legs · heavy | 35 / 68 | Every 5 m you move in a fight adds Momentum (max 10; lost after 1.5 s standing still): +2% damage and +2% move speed each. At 10, your next melee hit knocks a non-boss down for 1 s and spends them | `d09_warmasters_pit` final | *A body in motion tends to end up in someone else's.* |
| 3 | `leg_wayfarers_last_mile` | The Last Mile | Back · cloak | scales, 20+ | +25% run speed out of combat (not with a mount); entering a fight gives +40% move speed for 4 s, once per 20 s | world pool 20+ | *Every road has a last mile. This cloak has walked all of them.* |
| 4 | `leg_ropewalkers_sash` | Ropewalker's Sash | Waist · light | 46 / 50 | Your dodge roll has 2 charges; the second recharges in 8 s | `r02_glacier_throne` · b2 | *One step to fall. One step to not.* |
| 5 | `leg_skyhook_grips` | Skyhook Grips | Hands · medium | 54 / 58 | Dodging toward an enemy within 12 m of your aim grapples you to it (a 12 m dash that stops in melee range); your next hit within 2 s deals +50%. 6 s cooldown | `r03_sunken_choir` · b3 | *Distance is a suggestion.* |
| 6 | `leg_hollowstep_boots` | Hollowstep Boots | Feet · light | 54 / 58 | After a dodge you are **Unseen** for 2 s: non-bosses lose track of you unless you are the only one in reach; your next attack from Unseen has +80% critical chance. 12 s cooldown | `r03_sunken_choir` · b5 | *Where you were is the loudest place in the room.* |
| 7 | `leg_riverborn_greaves` | Riverborn Greaves | Legs · medium | 44 / 72 | You move at full speed through water, deep snow and ground slows (not boss snares); immune to Root once every 20 s | world boss of `frostmantle` (Ascendant: 72) | *The river never asks the rock for permission.* |
| 8 | `leg_windmill_mantle` | Windmill Mantle | Shoulders · adaptive | 38 / 72 | Sprinting for 3 s in a fight charges a gust: your next dodge pushes enemies within 5 m back 4 m (bosses unmoved) and deals 60% weapon damage | world boss of `cinder_steppe` | *It turns in any weather, and in some weather it turns you.* |
| 9 | `leg_spireclimbers_boots` | Spireclimber's Boots | Feet · adaptive | 76 / 82 | Leaving a ledge or dodging off one lets you glide (fall speed −70%, +20% move speed in the air); landing within 3 m of an enemy deals 100% weapon damage within 3 m | `r05_veilspire` · b1 | *The top of the spire is only a matter of how you come down.* |

### 6.2 Telegraph interaction (11)

These are the legendaries that talk to page 11's vocabulary. None of them may make a **one-shot**
mechanic survivable, and none work on the boss's enrage.

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 10 | `leg_voidwalker_soles` | Voidwalker Soles | Feet · adaptive | 60 / 64 | For the first 1.0 s you stand in each **void zone**, it heals you for what it would have dealt; after that it hurts you 20% less | `r03_sunken_choir` · secret (exclusive) | *They step where the dark pools, and the dark forgets to bite.* |
| 11 | `leg_near_miss_band` | Band of the Near Miss | Ring | 54 / 58 | When a **danger zone** finishes filling while you stand outside it within 2 m of its edge: **Near Miss**, +30% damage for 5 s (once per 8 s) | `r03_sunken_choir` · b1 | *Close only counts in one game, and this is it.* |
| 12 | `leg_soakers_oath` | The Soaker's Oath | Chest · adaptive heavy/medium | 70 / 76 | Inside a **soak** circle you count as 2 players; you take 20% more from that soak. 30 s cooldown | `r04_ember_court` · b2 | *Somebody has to stand in it. Might as well be twice.* |
| 13 | `leg_tetherbreak_torc` | Tetherbreak Torc | Necklace | 76 / 82 | **Tethers** on you break at 70% of their normal distance; breaking one gives you a barrier worth 15% of maximum health for 6 s | `r05_veilspire` · b3 | *Nothing holds what does not want holding.* |
| 14 | `leg_ringwardens_seal` | Ringwarden's Seal | Ring | 46 / 50 | If you are inside a **safe zone** when its cast ends, you and every ally inside gain +15% damage for 8 s | `r02_glacier_throne` · b5 | *The ring is small. The promise is not.* |
| 15 | `leg_greenmantle` | Greenmantle | Back · cloak | 31 / 68 | **Beneficial** (green) zones give you 50% more, and stay on you for 3 s after you leave | `d08_moonwell_ruins` final | *Moss grows on the side of you that faces the light.* |
| 16 | `leg_targets_grace` | Target's Grace | Shoulders · adaptive | 70 / 76 | While you are **Targeted** (yellow circle), +30% move speed and your circle is 25% smaller | `r04_ember_court` · b4 | *If it must find you, make it look hard.* |
| 17 | `leg_edge_of_ruin` | The Edge of Ruin | Main hand · greatsword | 76 / 82 | Each 0.5 s tick of a **void zone** you take gives +8% damage for 6 s (max 5 stacks, +40%); you take 10% more from void zones | `r05_veilspire` · b6 | *Every edge is closer to the ruin than the handle.* |
| 18 | `leg_wavebreaker` | Wavebreaker | Off hand · tower shield | 50 / 72 | Blocking a **moving wave** stops it for you and allies within a 3 m cone behind you. 30 s cooldown | world boss of `drowned_coast` | *The sea has one answer. This is the other.* |
| 19 | `leg_silencers_signet` | Silencer's Signet | Ring | 61 / 68 | Interrupting a **gold-bordered** cast refunds 50% of your interrupt's cooldown and gives 10% of maximum resource | `d14_ashen_reliquary` final | *The last word is the one never spoken.* |
| 20 | `leg_mirror_of_the_veil` | Mirror of the Veil | Off hand · ward | 76 / 82 | Once every 45 s, the first **single-target** spell a boss or rare casts at you is reflected back at it (area spells and ground zones are not) | `r05_veilspire` · b8 | *Look into it and something else looks out.* |

### 6.3 Pets and followers (6)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 21 | `leg_kennelmasters_whistle` | Kennelmaster's Whistle | Necklace | scales, 20+ | A spectral war hound fights beside you without taking a follower slot: a bite every 1.5 s for 35% weapon damage, 30% of your maximum health, back 20 s after it falls. If you already have a pet, that pet deals +25% instead | world pool 20+ | *Two notes. The dog knows which one means "now".* |
| 22 | `leg_crown_of_the_hollow_court` | Crown of the Hollow Court | Head · adaptive | 36 / 40 | Enemies you kill have a 20% chance to rise as a Hollow Courtier for 12 s (max 3): a hit every 1.2 s for 40% weapon damage | `r01_barrowking` · b5 (final) | *The court still sits. It has simply stopped breathing.* |
| 23 | `leg_brass_familiar` | The Brass Familiar | Shoulders · adaptive | 56 / 72 | A clockwork owl rides your shoulder: every 4 s it marks the lowest-health enemy within 20 m; marked enemies take +10% from your whole group for 4 s | `d12_unmade_workshop` · secret (exclusive) | *It was built to watch. Nobody told it what to stop watching.* |
| 24 | `leg_mercenarys_contract` | The Mercenary's Contract | Ring | scales, 20+ | Your followers gain +40% health and +30% damage; while one is within 8 m of you, you take 10% less damage | world pool 20+ | *Terms: everything. Signed: in something darker than ink.* |
| 25 | `leg_bramblemothers_seed` | Bramblemother's Seed | Back · cloak | 33 / 72 | Every 15 s in a fight, a thornling sprouts where you stand for 10 s: it cannot move, taunts non-bosses within 6 m and has 25% of your maximum health | `d07_thornheart` · secret (exclusive) | *Plant it anywhere. It will make that anywhere a problem.* |
| 26 | `leg_twin_moth_lantern` | Twin Moth Lantern | Light · lantern | 32 / 72 | Two moths circle you in a fight, each striking the nearest enemy within 9 m every 2 s for 20% weapon damage as arcane; 40% at night | world boss of `whisperwood` | *They are drawn to the flame. The flame is drawn to what they find.* |

### 6.4 Procs (12)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 27 | `leg_thunderhead_crown` | Thunderhead Crown | Head · adaptive | 46 / 50 | Critical hits have a 20% chance to call lightning on the target: 150% weapon damage to it and 60% to others within 3 m. Once per 3 s | `r02_glacier_throne` · b3 | *It hums before the storm, and the storm is you.* |
| 28 | `leg_emberwheel` | The Emberwheel | Ring | 20 / 72 | Every 8th attack or spell releases 6 fire motes that spiral out to 8 m; each deals 40% of your damage to the first enemy it touches | world boss of `greyridge` | *It turns in the dark and lights nothing but its own path.* |
| 29 | `leg_frostlocke_sigil` | Frostlocke Sigil | Ring | 46 / 50 | Slowing an enemy has a 25% chance to Freeze a non-boss for 1.5 s (once per enemy per 10 s); a boss you slow takes +15% from you for 3 s instead | `r02_glacier_throne` · b4 | *Every lock has a key. This one is the cold.* |
| 30 | `leg_harbingers_cowl` | Harbinger's Cowl | Head · cloth | 46 / 68 | Each tick of your damage-over-time effects has a 10% chance to copy that effect onto one enemy within 8 m | `d11_saltdeep_cathedral` final | *It does not bring the plague. It just gets there first.* |
| 31 | `leg_bell_of_nine_echoes` | Bell of Nine Echoes | Necklace | 76 / 82 | Every 9th spell you cast goes off again at 100%, free | `r05_veilspire` · b2 | *Ring it once. It rings nine times. Nobody knows who rings the other eight.* |
| 32 | `leg_storm_anvil` | Storm Anvil | Main hand · hammer | 34 / 38 | Every 4th hit discharges chain lightning to 4 enemies within 8 m for 50% | `r01_barrowking` · b3 | *Struck once, it answers everyone.* |
| 33 | `leg_ravenous_edge` | The Ravenous Edge | Main hand · axe | 34 / 38 | Hits on bleeding enemies heal you for 4% of the damage; bleeds you apply last 50% longer | `r01_barrowking` · b2 | *It has never been fed enough. It has never stopped trying.* |
| 34 | `leg_thousand_needles` | A Thousand Needles | Off hand · quiver | 70 / 76 | Every 5th arrow splits into 5 arrows in a 30° fan, 50% damage each | `r04_ember_court` · b3 | *Count them if you like. They will not wait for you to finish.* |
| 35 | `leg_orrery_of_tides` | Orrery of Tides | Off hand · Seer's Orb focus | 54 / 58 | Three stones circle you; a hit on you uses one to absorb 15% of your maximum health. One regrows every 6 s | `r03_sunken_choir` · b6 | *The tide goes out. The tide comes in. The stones do not mind which.* |
| 36 | `leg_spark_of_unmaking` | Spark of Unmaking | Main hand · wand | 70 / 76 | Wand bolts pierce up to 3 enemies, +20% damage for each enemy already pierced | `r04_ember_court` · b5 | *It was the first light. It has been undoing things ever since.* |
| 37 | `leg_sunscar_sandglass` | Sunscar Sandglass | Necklace | 26 / 72 | Every 30 s in a fight, time slips: your cooldowns run 100% faster for 3 s | world boss of `sunscar` | *The sand runs up as often as it runs down. It is waiting for you to notice.* |
| 38 | `leg_sovereigns_ember` | The Sovereign's Ember | Necklace | 72 / 78 | Every 20 s your next hit crowns the target with Embers: it takes +15% damage from your whole group for 8 s | `r04_ember_court` · b8 (final) | *Kneel, and it warms you. Stand, and it crowns you.* |

### 6.5 Conditional (9)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 39 | `leg_last_stand_girdle` | Last Stand Girdle | Waist · heavy | 34 / 38 | Falling below 35% health gives 6 s of 30% damage reduction and +20% healing received; once per 60 s | `r01_barrowking` · b4 | *Tighten it one more notch. Then one more.* |
| 40 | `leg_duelists_vow` | The Duelist's Vow | Ring | 25 / 68 | While only one enemy is within 10 m of you: +20% damage and +10% critical chance | `d06_sandsworn_vault` final | *One opponent. One outcome.* |
| 41 | `leg_outnumbered_cloak` | Cloak of the Outnumbered | Back · cloak | 40 / 68 | +4% damage reduction for each enemy within 8 m, up to 5 (20%) | `d10_rimefang_caverns` final | *The more of them there are, the less of them gets through.* |
| 42 | `leg_high_noon_brooch` | High Noon Brooch | Necklace | scales, 20+ | By day: +12% damage. By night: +12% damage reduction and your light reaches 50% further | world pool 20+ | *It keeps the sun's hours, whatever the sky says.* |
| 43 | `leg_crown_of_first_blood` | Crown of First Blood | Head · adaptive | 54 / 58 | Your first hit on each enemy deals +100%; against a boss, the first hit after each phase change | `r03_sunken_choir` · b2 | *Everything worth ending starts somewhere.* |
| 44 | `leg_executioners_ledger` | The Executioner's Ledger | Main hand · greatsword or greataxe | 58 / 68 | Against enemies below 20% health your attacks deal +60% and cleave everything within 3 m of the target | `d13_cindergate` final | *Every name in it is crossed out but the next one.* |
| 45 | `leg_opening_gambit` | Opening Gambit | Hands · adaptive | 46 / 50 | For the first 4 s of every fight: +50% attack and cast speed | `r02_glacier_throne` · b1 | *The first move is the only one you get to choose.* |
| 46 | `leg_glasswalkers_robe` | Glasswalker's Robe | Chest · cloth | 23 / 68 | While a barrier or shield is on you: +25% spell damage; with none, you take 10% more damage | `d05_glass_tombs` final | *Walk carefully. Everything here is glass, including you.* |
| 47 | `leg_pit_champions_belt` | The Pit Champion's Belt | Waist · heavy | 39 / 72 | Every enemy you hit in the last 5 s adds Crowd (max 10): +3% damage and +2% damage reduction each. At 10 you roar: non-bosses within 8 m flee for 2 s (once per 30 s) | `d09_warmasters_pit` · secret (exclusive) | *The crowd chants a name. Tonight it is yours.* |

### 6.6 On kill (6)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 48 | `leg_carrion_crown` | Carrion Crown | Head · adaptive | 70 / 76 | Kills explode: 80% weapon damage as shadow within 5 m, laying **Doom** on everything hit (after 4 s it takes 40% of what you dealt it in those 4 s again) | `r04_ember_court` · b6 | *What falls under it does not fall alone.* |
| 49 | `leg_reapers_due` | The Reaper's Due | Main hand · halberd | 56 / 60 | Each kill gives a Soul for 20 s (max 10): +3% damage each. At 10, your next attack is a full circle for 300% weapon damage and spends them | `r03_sunken_choir` · b7 (final) | *Paid in full. Always in full.* |
| 50 | `leg_ember_of_the_pyre_king` | Ember of the Pyre King | Ring | 76 / 82 | Kills leave a 3 m pyre for 5 s: allies inside +10% haste; enemies inside take 30% of your damage a second as fire | `r05_veilspire` · b5 | *Every fire is a throne for something.* |
| 51 | `leg_bloodhound_boots` | Bloodhound Boots | Feet · adaptive | scales, 20+ | Kills give 2 s of +50% move speed and reset your dodge cooldown; once per 6 s | world pool 20+ | *They have the scent. You just have to keep up.* |
| 52 | `leg_tithe_collector` | The Tithe Collector | Waist · adaptive | scales, 20+ | Kills restore 3% of maximum health and 5% of maximum resource | world pool 20+ | *A tenth of everything. Every time.* |
| 53 | `leg_skullspire_pauldrons` | Skullspire Pauldrons | Shoulders · adaptive heavy/medium | 62 / 72 | Killing a champion, rare or boss gives a Trophy for 5 min: +5% damage, up to 3 | world boss of `emberthrone` | *Room for three more. Always room for three more.* |

### 6.7 On dodge (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 54 | `leg_mirage_silks` | Mirage Silks | Chest · light | 52 / 68 | Dodging leaves a mirage for 3 s that taunts non-bosses within 6 m, then bursts for 100% weapon damage within 4 m | `d12_unmade_workshop` final | *You were never there. It was never you.* |
| 55 | `leg_sidestep_bangle` | Sidestep Bangle | Ring | scales, 20+ | A **perfect dodge** (started within 0.25 s before a hit would land) gives +40% critical chance for 3 s | world pool 20+ | *The blow arrives exactly where you used to be.* |
| 56 | `leg_quickfeather_cloak` | Quickfeather Cloak | Back · cloak | 44 / 72 | Dodge distance +50%; dodge cooldown −25% | `d10_rimefang_caverns` · secret (exclusive) | *Plucked from a bird that was never caught.* |
| 57 | `leg_razorwind_greaves` | Razorwind Greaves | Legs · light | 70 / 76 | Dodging through an enemy deals 120% weapon damage to it and makes it bleed for 60% over 4 s | `r04_ember_court` · b1 | *The shortest way past is through.* |
| 58 | `leg_counterweight_gauntlets` | Counterweight Gauntlets | Hands · heavy | 34 / 38 | Within 2 s after a dodge, your next melee hit deals +70% and knocks a non-boss down for 1.5 s | `r01_barrowking` · b1 | *Everything that goes one way comes back the other.* |

### 6.8 Element conversion (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 59 | `leg_heart_of_the_glacier` | Heart of the Glacier | Necklace | 52 / 56 | All your damage becomes ice; +10% ice damage; Chilled enemies take a further 10% from you | `r02_glacier_throne` · secret (exclusive) | *It beats once a century. It is beating now.* |
| 60 | `leg_sunforged_gauntlets` | Sunforged Gauntlets | Hands · adaptive | 50 / 72 | The physical damage of your weapon attacks becomes holy: +20% against undead and fiends, and it heals you for 2% of the damage | `d11_saltdeep_cathedral` · secret (exclusive) | *Hammered at noon on the longest day. They still keep that hour.* |
| 61 | `leg_prism_of_the_seventh_hue` | Prism of the Seventh Hue | Off hand · orb (weapon) | 56 / 72 | Your spells cycle fire → ice → lightning → poison → shadow → arcane, each +15% and applying its status; casting all six within 12 s gives **Prismatic**: +30% damage for 6 s | world boss of `riftmarch` | *There are six colours. The seventh is what they make together.* |
| 62 | `leg_venomheart_ring` | Venomheart Ring | Ring | 29 / 72 | Your damage-over-time effects become poison and may stack twice on one target; poison you apply deals +25% | `d06_sandsworn_vault` · secret (exclusive) | *A drop of it would kill a city. Luckily it only ever gives one drop at a time.* |
| 63 | `leg_voidtouched_diadem` | Voidtouched Diadem | Head · adaptive | 78 / 84 | 20% of all damage you deal becomes shadow that ignores armour and resistance | `r05_veilspire` · b10 (final; Mythic chance ×2) | *It does not sit on the head. It sits on everything behind it.* |

### 6.9 Cheat death and defence (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 64 | `leg_phoenix_feather` | The Phoenix Feather | Necklace | 65 / 72 | A killing blow instead makes you burst into flame: 2 s untargetable, healed to 40%, and 400% weapon damage as fire within 6 m. Once per 180 s (in a raid or Mythic+: once per pull) | `d14_ashen_reliquary` · secret (exclusive) | *Ash is only what fire wears between fires.* |
| 65 | `leg_barrowkings_second_crown` | The Barrowking's Second Crown | Head · adaptive | 40 / 44 | A killing blow leaves you at 1 health in **Shadow Walk** for 3 s: untargetable, 50% slower, unable to attack or cast. Once per 120 s | `r01_barrowking` · secret (exclusive) | *He had two. He wore the second one for his funeral, and then again after.* |
| 66 | `leg_stoneskin_mantle` | Stoneskin Mantle | Shoulders · adaptive | 48 / 52 | A single hit worth more than 30% of your maximum health gives you a barrier of 20% of maximum health for 6 s; 30 s cooldown | `r02_glacier_throne` · b6 (final) | *The mountain does not flinch. It just gets a little more mountain.* |
| 67 | `leg_bulwark_of_ages` | Bulwark of Ages | Off hand · tower shield | 62 / 72 | Each block gives 2% damage reduction for 6 s (max 10); at 10, your next block reflects 150% of the blocked hit | `d13_cindergate` · secret (exclusive) | *Every dent is a year. It is very, very old.* |
| 68 | `leg_undying_bastion` | The Undying Bastion | Chest · heavy | 76 / 82 | Every 10 s in a fight, the next hit that would deal more than 20% of your maximum health deals half | `r05_veilspire` · b7 | *Walls fall. This one has decided not to.* |

### 6.10 Healing (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 69 | `leg_mercy_bell` | The Mercy Bell | Main hand · sceptre | 35 / 72 | Your heals on allies below 35% health are +40% and give them 15% damage reduction for 4 s | `d08_moonwell_ruins` · secret (exclusive) | *It rings only when somebody is about to be saved.* |
| 70 | `leg_wellspring_chalice` | Wellspring Chalice | Off hand · reliquary focus | 54 / 58 | Every 5th heal also heals the 3 lowest-health allies within 20 m for 40% of its amount | `r03_sunken_choir` · b4 | *It is never empty. It is sometimes afraid of being.* |
| 71 | `leg_shepherds_crook` | The Shepherd's Crook | Main hand · staff | 70 / 76 | Your heals on an ally standing in a void zone or a danger zone are +50% | `r04_ember_court` · b7 | *The flock strays. The crook reaches.* |
| 72 | `leg_lifebinder_thread` | Lifebinder Thread | Ring | 17 / 72 | Your heals link you to the ally you heal most: 10% of the damage they take moves to you, and 10% of the healing you receive is copied to them | `d02_drowned_mill` · secret (exclusive) | *Tie it round two fingers, and two people will never quite be apart.* |
| 73 | `leg_verdant_crown` | The Verdant Crown | Head · adaptive | scales, 20+ | Overhealing plants a seed where the target stands (max 5); an ally who walks over one heals 5% of maximum health | world pool 20+ | *Where it has been, something grows.* |

### 6.11 Tanking (4)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 74 | `leg_grudgekeeper_helm` | Grudgekeeper Helm | Head · heavy | 19 / 68 | Each enemy attacking you within 8 m gives +5% threat and 1% damage reduction (max 10) | `d04_bellows_keep` final | *It remembers every face that swung at it.* |
| 75 | `leg_anvil_of_the_last_gate` | Anvil of the Last Gate | Chest · heavy | 76 / 82 | While you hold a boss's attention: +10% armour for each phase change you have held it through (max +30%); lost if you lose it for 3 s | `r05_veilspire` · b9 | *The gate is gone. The anvil stayed.* |
| 76 | `leg_ironroot_sabatons` | Ironroot Sabatons | Feet · heavy | 23 / 72 | You cannot be knocked back or pulled while standing still; after 2 s standing still, +15% block chance | `d04_bellows_keep` · secret (exclusive) | *Stand. Stand. Stand.* |
| 77 | `leg_spitefire_bulwark` | Spitefire Bulwark | Off hand · shield | 76 / 82 | Blocked damage is stored; every 6 s, 50% of the store bursts as fire in a 6 m cone ahead of you | `r05_veilspire` · b4 | *Every blow it takes, it keeps. Then it gives them back.* |

### 6.12 Utility, lights and mounts (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 78 | `leg_cartographers_monocle` | The Cartographer's Monocle | Head · adaptive | scales, 20+ | The minimap shows rares, chests and hidden doors within 150 m; +25% gold from chests | world pool 20+ | *Every map is wrong. This one is wrong less.* |
| 79 | `leg_trailblazers_lantern` | Trailblazer's Lantern | Light · lantern | 21 / 72 | +40% light reach; your light shows secret doors, clue marks and hidden levers within 20 m (secret-boss trails, page 12) | `d03_deepdelve` · secret (exclusive) | *It was carried by someone who went first. The light still goes first.* |
| 80 | `leg_merchant_princes_signet` | The Merchant Prince's Signet | Ring | scales, 20+ | Vendors sell to you 15% cheaper and repairs cost 50% less | world pool 20+ | *Everybody has a price. This ring knows it.* |
| 81 | `leg_ashwind_stallion` | The Ashwind Stallion | Mount · courser | 72 / 78 | ×2.6 speed; gallop lasts 40% longer; at full gallop you leave a 2 s fire trail that deals 30% weapon damage a second to enemies crossing it | `d14_ashen_reliquary` Mythic+ end chest at key 15+, 0.5% | *It was born in the ash and has never agreed to leave it.* |
| 82 | `leg_candle_of_the_unburied` | Candle of the Unburied | Light · torch | 12 / 72 | Enemies inside your light take +10% from you and cannot stay stealthed; undead inside it deal 10% less damage | `d01_hollow_barrow` · secret (exclusive) — the first legendary most players will ever see | *It burns for the ones nobody buried. It has a great deal of work.* |

### 6.13 Raid secret-boss legendaries (2 more)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 83 | `leg_crown_of_the_ember_king` | Crown of the Ember King | Head · adaptive | 76 / 82 | Your attacks and spells on a Burning enemy spread Burning to one more enemy within 6 m; while 5 or more enemies within 20 m burn, +20% damage | `r04_ember_court` · secret (exclusive) | *He is not dead. He is merely not wearing it.* |
| 84 | `leg_the_unwritten_page` | The Unwritten Page | Off hand · grimoire focus | 82 / 88 | Every 30 s your next spell is **Unwritten**: it costs nothing, its cooldown resets, and it casts again at 60% on up to 2 other enemies within 15 m | `r05_veilspire` · secret (exclusive) | *Whatever you write on it has already happened.* |

---

## 7. Secret-boss exclusive drops

Page 08 §12.3: every secret boss has a list only it drops, rolled once per player per week (dungeons 20%,
raids 25%, Mythic 35%), plus one guaranteed appearance. Page 12 / 13 own how each secret boss is found.

**Superseded in part (§3.32):** pages 12 and 13 name their own exclusive legendary for every one of these
secret bosses (`leg_first_sleepers_shroud` … `leg_first_torch`). Keep theirs as the exclusive; the
legendary in the second column below moves to a normal boss or the world pool as §3.32 lists. The mount,
appearance and title columns are unaffected.

| Instance | Exclusive legendary / unique | Mount | Guaranteed appearance (transmog) | Title (raids) |
|---|---|---|---|---|
| `d01_hollow_barrow` | `leg_candle_of_the_unburied` | — | Barrow-Candle Hood | — |
| `d02_drowned_mill` | `leg_lifebinder_thread` | — | Millwheel Buckler look | — |
| `d03_deepdelve` | `leg_trailblazers_lantern` | — | Deepdelve Miner's Helm look | — |
| `d04_bellows_keep` | `leg_ironroot_sabatons` | — | Bellows-Forged Pauldrons look | — |
| `d05_glass_tombs` | — (see mount) | `it_mount_dune_sabrecat` (20%) | Glass Pharaoh's Mask look | — |
| `d06_sandsworn_vault` | `leg_venomheart_ring` | — | Sandsworn Veil look | — |
| `d07_thornheart` | `leg_bramblemothers_seed` | — | Thornwreath Crown look | — |
| `d08_moonwell_ruins` | `leg_mercy_bell` | — | Moonlit Robe look | — |
| `d09_warmasters_pit` | `leg_pit_champions_belt` | — | Pit Champion's Helm look | — |
| `d10_rimefang_caverns` | `leg_quickfeather_cloak` | — | Rimefang Pelt Cloak look | — |
| `d11_saltdeep_cathedral` | `leg_sunforged_gauntlets` | — | Drowned Choirmaster's Stole look | — |
| `d12_unmade_workshop` | `leg_brass_familiar` | — | Clockwork Goggles look | — |
| `d13_cindergate` | `leg_bulwark_of_ages` | — | Cindergate Tower Shield look | — |
| `d14_ashen_reliquary` | `leg_phoenix_feather` | — | Ashen Reliquarist's Mantle look | — |
| `r01_barrowking` | `leg_barrowkings_second_crown` | — | Barrowking's Burial Shroud look | "the Unburied" |
| `r02_glacier_throne` | `leg_heart_of_the_glacier` | — | Glacier Throne Crown look | "of the Long Winter" |
| `r03_sunken_choir` | `leg_voidwalker_soles` | — | Choirless Robe look | "the Unsung" |
| `r04_ember_court` | `leg_crown_of_the_ember_king` | — | Ember King's Regalia look | "Kingsbane" |
| `r05_veilspire` | `leg_the_unwritten_page` | `it_mount_veil_dragon` (Mythic, 1%) | Veilwalker's Wings look (back) | "Beyond the Veil" |

---

## 8. Where Emberveil's and Farhold's sets went

`prototypes/emberveil/data/items.json` has 54 sets: **24 generic** (Iron Brigade, Order of the Eclipse,
Architect's Vestments, Dragon-Lord's Aspect…) and **30 class sets**, exactly one per class. Farhold adds
The Archivist's Regalia (`js/foci.js`).

| Source set | In Wildmarch |
|---|---|
| The 30 Emberveil class sets | offered to the class agents as starting themes (§3); their names are original and free to reuse |
| The 24 Emberveil generic sets | **retired** — they were 2–5-piece sets tuned for a six-hero auto-battle party with travel powers (`camp_mend`, `road_cache`, `no_night_raids`). Their legendary effects survive as powers (page 08 §1) |
| The Archivist's Regalia (wand + grimoire + robe) | kept as a **class-neutral caster set** for the world pool: 3 pieces, 2-piece +6 INT and +5% spell power, 3-piece "every 4th spell is free and goes off twice for half" (reuse, Farhold numbers). Drops from caster rares from level 24 at the Set rate (not counted in the 20 above) |

---

## 9. Counts and checks

| Item kind | Required by the brief | Written here |
|---|---|---|
| Generic sets | ≥ 16 | **20** (+ The Archivist's Regalia carried over) |
| Generic legendaries | ≥ 60 | **84** |
| Generic uniques | ≥ 40 | **79 headline** (64 Farhold + 3 Farhold foci + 12 new) in a **210** pool |
| Secret-boss exclusives | every secret boss | **19 / 19** (14 dungeons + 5 raids) |
| Class sets | ≥ 2 per class, filled by the class files | **73** indexed (§3) |
| Class legendaries | class files | **139** indexed (§3) |
| Class uniques | class files | **105** indexed (§3) |
| Dungeon-exclusive (page 12 §19) | indexed here | **86 uniques + 29 legendaries + 14 sets** (§3.31) |
| Raid / world boss (page 13 §9) | indexed here | **42 uniques + 17 legendaries + 5 sets** (§3.31) |
| Grand total | — | **113 sets · 269 legendaries · 443 uniques** (99 sets if §3.32 is followed) |
| Duplicates / collisions | none | **14 set pairs, 18 secret-boss pairs, 11 raid bosses with two legendaries** (§3.32); **2 exact id collisions + 12 near-collisions** (§3.33) |

Checks for whoever builds `data/items/*.json` from this page (page 16):

1. Every item here has a source (canon rule 4). A test walks sets, legendaries and uniques and fails on an
   empty `sources`.
2. No raid boss lists more than one generic legendary (it keeps the loot table readable); class legendaries
   from class files may add to it.
3. Every legendary power id resolves in the effect registry and its card sentence is generated from the
   constants (Farhold `describe()`), never typed.
4. Every set has exactly as many pieces as its top bonus, and no two pieces of one set share a slot unless
   both are rings.
5. No legendary or set bonus reduces a **one-shot** mechanic (page 11) — a test marks those mechanics and
   asserts nothing on this page lowers their damage.
