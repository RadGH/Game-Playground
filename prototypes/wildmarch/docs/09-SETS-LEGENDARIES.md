# WILDMARCH — Design Bible, page 09: sets, legendaries, uniques and souls

> *"Whoever holds it is expected to do something about it."* — Item Vault lore line

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only.
**Owns:** the catalogue — every **generic** set, every **generic** legendary, the headline **generic** uniques
(including the new tag and tool uniques), the minor-power glossary, **every generic soul**, the index of class
sets, class legendaries and **class souls**, the index of page 12's and page 13's dungeon and world-boss items
(§3.31), and the **class set token**.
**Rules live on [page 08](08-ITEMS.md)**: what a unique, a set and a legendary are (§12), sockets and souls (§13),
magic find (§14), trade (§15), drop rates (§16), item levels (§3). This page only lists things. Class sets, class
legendaries and class souls are written in `classes/<id>.md`; §3 and §7.3 below are their index.

**Round 2 in one paragraph.** Raids and PvP are out of v2 (canon W1, W6), so the five generic raid sets, the five
page-13 raid sets, the PvP set and the raid-only legendaries and uniques left this catalogue (their ids are listed
in §10.2 for `WISHLIST.md`). Items with "ember" or "veil" in the name were renamed, light-slot items moved to other
slots, every item is tradeable (no binding), every price is gold, sources that named a raid now name a
**Challenge**-mode dungeon boss, a world boss or the **Depth Cache**, and a **souls** catalogue (§7) was added.

---

## Contents

1. [How to read this page](#1-how-to-read-this-page)
2. [Generic sets (14)](#2-generic-sets-14)
3. [Class sets index](#3-class-sets-index) — plus the dungeon and world-boss index (§3.31), duplicates to settle (§3.32) and id collisions (§3.33)
4. [Uniques](#4-uniques)
5. [Unique power glossary](#5-unique-power-glossary)
6. [Legendaries (84)](#6-legendaries-84)
7. [Souls](#7-souls)
8. [Secret-boss exclusive drops](#8-secret-boss-exclusive-drops)
9. [Where Emberveil's and Farhold's sets went](#9-where-emberveils-and-farholds-sets-went)
10. [Counts, checks and what left](#10-counts-checks-and-what-left)

---

## 1. How to read this page

- **Source notation.** `d05_glass_tombs` · boss 2 = the second main boss of that dungeon in page 12's order;
  "end" = its last boss; "secret" = its secret boss; "on Challenge" = only in Challenge mode (level 60, page 12).
  "World boss of `frostmantle`" = that region's world boss (page 13 owns its id). "World pool 20+" = can drop from
  any open-world kill of level 20 or more at the page 08 §4.1 rate. "Depth Cache R 15+" = the chest after a Depth
  run's end boss at reward depth 15 or deeper (page 12 §2.4.6).
- **Drop chance** of a named item from a listed boss is page 08 §16's rate for its kind (legendary / set / unique /
  soul) divided evenly among the named items on that boss's table, unless a number is given here.
- **Item level (ilvl)** is the level needed to wear it, 1–60 (canon §4). Dungeon sources give two: Normal (the
  dungeon's band) / **60** (Challenge and every Deep depth). "Scales" = drops at the level of what dropped it.
- **Stat package.** To keep 200+ rows readable, named items follow one rule unless a row says otherwise:

| Kind | Fixed lines at its ilvl | Random-range line |
|---|---|---|
| Set piece | main attribute of the set `round(0.4 × ilvl)` · CON `round(0.3 × ilvl)` · the base's armour | one line from the set's list, rolled at its ilvl tier |
| Legendary | main attribute `round(0.5 × ilvl)` · CON `round(0.4 × ilvl)` · one slot line (weapon: `sharp` damage at the top of its tier; armour: +health `round(5 × ilvl)`; jewellery: +crit 1% per 10 ilvl, or +healing 1.5% per 10 ilvl for healer powers) | 1–2 lines from the slot's affix pool |
| Unique | as written in its row (Farhold's numbers, at its first level), then scaled with ilvl like any affix | as written |

  "Main attribute" of an **adaptive** piece (see below) is the looter's class main attribute.
- **Adaptive armour**: the piece drops in the looter's own armour type (cloth / light / medium / heavy) with that
  type's base armour; its look is the set's look drawn for that weight.
- **Names** are original (canon rule 1) and never contain "ember" or "veil" (canon rule 10). Flavour lines are
  player-facing and follow `WORDING.md`.
- **Rarity colours** (canon §4): **Legendary** is violet `#c86bff`, **Set** is `#2fc4b2`; Farhold's old
  "legendary" tier is Wildmarch's Epic. Every `leg_` item on this page is drawn in violet.
- **Prices are gold** (`cur_gold` is the only coin, page 08 §21). Things round 1 bought with tokens are bought
  with gold at a **faction standing** (page 07's tiers: Welcome, Trusted, Kindred, Sworn).
- **Tags.** A named item's tag lines use page 05's tag ids (page 08 §7).

---

## 2. Generic sets (14)

### 2.1 Index

| # | Set id | Name | Kind | Armour | Role | Pieces | Where | ilvl |
|---|---|---|---|---|---|---|---|---|
| 1 | `set_wayfarers_heirlooms` | The Wayfarer's Heirlooms | levelling / heirloom | adaptive | any | 6 | `fac_wardens` quartermaster, Brightwater (Welcome) | = your level (1–59) |
| 2 | `set_barrowwarden` | Barrowwarden's Charge | dungeon | slot-agnostic | any | 4 | `d01_hollow_barrow` | 8 / 60 |
| 3 | `set_millrace` | The Millrace | dungeon | light | damage | 4 | `d02_drowned_mill` | 13 / 60 |
| 4 | `set_glasswrights_regalia` | Glasswright's Regalia | dungeon | cloth | caster damage | 6 | `d05_glass_tombs` | 23 / 60 |
| 5 | `set_thornstalker` | The Thornstalker | dungeon | light | melee / ranged damage | 6 | `d07_thornheart` | 29 / 60 |
| 6 | `set_moonwell_vestments` | Moonwell Vestments | dungeon | adaptive | healer | 6 | `d08_moonwell_ruins` | 31 / 60 |
| 7 | `set_pitfighters_harness` | Pitfighter's Harness | dungeon | heavy | melee damage / tank | 6 | `d09_warmasters_pit` | 35 / 60 |
| 8 | `set_saltchoir_raiment` | Saltchoir Raiment | dungeon | adaptive | healer / support | 6 | `d11_saltdeep_cathedral` | 46 / 60 |
| 9 | `set_cindergate_bulwark` | Cindergate Bulwark | dungeon | heavy | tank | 6 | `d13_cindergate` | 58 / 60 |
| 10 | `set_reliquary_keepers` | The Reliquary Keeper's Tokens | Depth | slot-agnostic | any (bonus by role) | 6 | the Depth Cache of **any** dungeon, reward depth 10+ | 60 |
| 11 | `set_trophies_of_the_wild_hunt` | Trophies of the Wild Hunt | world bosses | slot-agnostic | any | 6 | the eight world bosses, **Ascendant** weeks (page 13 §4) | 60 |
| 12 | `set_journeymans_harness` | The Journeyman's Harness | crafted | medium | any medium wearer | 6 | patterns from `fac_deepforge_clans` + the bench | 30 / 60 |
| 13 | `set_tearglass_artifice` | Tear-glass Artifice (was Veilglass Artifice) | crafted | adaptive | caster / healer | 6 | patterns from `fac_lantern_house` + the bench | 60 |
| 14 | `set_mercenary_captains_kit` | The Mercenary Captain's Kit | faction vendor | medium | tank / damage hybrid | 6 | `fac_wardens` quartermaster, Spire Landing (Kindred) | 60 |

Every **dungeon set** also drops on **Challenge** (ilvl 60) and from that dungeon's **Depth Cache**, so a levelling
set has a level-60 version with the same bonuses.

**Removed in round 2** (raids and PvP are out of v2; ids kept for `WISHLIST.md`, §10.2): `set_barrowkings_tithe`,
`set_rimecrown_regalia`, `set_choir_of_the_deep`, `set_court_of_embers`, `set_veilborn_ascendance` (the five
generic raid sets) and `set_open_field_vanguard` (PvP).

**Duplicates to settle (§3.32).** Rows 2–10 were drafted in parallel with page 12's own sets for the same dungeons.
§3.32 recommends keeping page 12's sets (it owns the instances) and retiring rows 2–9 from the drop tables; row 10
no longer competes, since it now drops from any dungeon's Depth Cache. Nothing below is deleted until the owner
decides. Row 2's id `set_barrowwarden` is also used by page 12 for a different set (§3.33 #1).

### 2.2 `set_wayfarers_heirlooms` — The Wayfarer's Heirlooms

*Levelling set (an heirloom). "Somebody walked all of this before you. They left their coat."*

| Piece id | Name | Slot | Cost at `npc_quartermaster_wardens` (Brightwater), **Welcome** with the Wardens |
|---|---|---|---|
| `it_wayfarers_hood` | Wayfarer's Hood | head | 2,500 gold |
| `it_wayfarers_shoulderguards` | Wayfarer's Shoulderguards | shoulders | 2,500 |
| `it_wayfarers_coat` | Wayfarer's Coat | chest | 2,500 |
| `it_wayfarers_travelling_cloak` | Wayfarer's Travelling Cloak | back | 2,500 |
| `it_wayfarers_breeches` | Wayfarer's Breeches | legs | 2,500 |
| `it_wayfarers_signet` | Wayfarer's Signet | ring | 5,000 |

On sale once **any character on the account** has reached level 60. Like every item, the pieces can be traded and
mailed (page 08 §15); the quartermaster sells them to anyone whose account qualifies. Every piece is adaptive and its item
level is the wearer's level (1–59), so it never needs replacing while levelling. Random line: none (fixed
package only). **At 60 the stats switch off**; the looks stay in the wardrobe.

| Pieces | Bonus |
|---|---|
| 2 | +10% XP gain (counts toward the XP-gain cap, page 08 §14.3) |
| 4 | +20% XP gain in total; +10% run speed out of combat |
| 6 | +30% XP gain in total; the **Recall Stone** (`it_recall_stone`, page 20) cooldown is halved; dying costs no durability |

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

*The **Depth Cache** of any dungeon at reward depth 10+ (page 12 §2.4.6), ilvl 60. Any class. "Carry the ash. Do not ask whose."*

| Piece id | Name | Slot |
|---|---|---|
| `it_reliquary_keeper_mantle` | Keeper's Mantle (adaptive) | shoulders |
| `it_reliquary_keeper_shroud` | Keeper's Shroud | back |
| `it_reliquary_keeper_cord` | Keeper's Cord (adaptive) | waist |
| `it_reliquary_keeper_urn_chain` | Keeper's Urn-Chain | necklace |
| `it_reliquary_keeper_band_of_ash` | Band of Ash | ring |
| `it_reliquary_keeper_band_of_cinders` | Band of Cinders (was "Band of Ember", `it_reliquary_keeper_band_of_ember`) | ring |

Each Depth Cache item has a 4% chance to be a piece of this set. Random line from: main attribute, crit chance,
cooldown reduction.

| Pieces | Bonus |
|---|---|
| 2 | +4% main attribute |
| 4 | By role — **Tank**: 10% damage reduction for 4 s after a dodge or a block (once per 10 s) · **Healer**: +10% healing on the lowest-health ally within 30 m · **Damage / Support**: +10% damage for 6 s after you interrupt or dispel |
| 6 | **Keeper's Oath**: every 60 s your party gains +10% to all stats for 10 s inside a Depth run (+5% anywhere else). Oaths from two wearers do not stack |

---

### 2.12 `set_trophies_of_the_wild_hunt` — Trophies of the Wild Hunt

*World bosses, **Ascendant** weeks only (two of the eight are raised to level 60 each week, page 13 §4): 30% of
Ascendant chests hold a piece. ilvl 60. Any class.
"Every hunter keeps one tooth. Nobody keeps the rest."*

| Piece id | Name | Slot | Source |
|---|---|---|---|
| `it_wildhunt_pelt_cloak` | Pelt Cloak of the Wild Hunt | back | world boss of `whisperwood` |
| `it_wildhunt_tusk_pauldrons` | Tusk Pauldrons (adaptive) | shoulders | world boss of `cinder_steppe` |
| `it_wildhunt_hide_belt` | Hide Belt of the Hunt (adaptive) | waist | world boss of `frostmantle` |
| `it_wildhunt_fang_necklace` | Fang Necklace | necklace | world boss of `drowned_coast` |
| `it_wildhunt_hunters_band` | Hunter's Band | ring | world boss of `riftmarch` |
| `it_wildhunt_huntmasters_band` | Huntmaster's Band | ring | world boss of `kingsfire` |

The world bosses of `greyridge` and `sunscar` drop any piece. Random line from: main attribute, `named_slayer`, health.

| Pieces | Bonus |
|---|---|
| 2 | +5% damage and +5% healing against champions, rares and bosses |
| 4 | Killing a champion, rare or world boss starts **the Hunt** for 10 min: +8% run speed out of combat and +5% main attribute |
| 6 | During the Hunt your first hit on a boss marks it: your group deals +5% to it for 20 s (once per 60 s) |

---

### 2.13 `set_journeymans_harness` — The Journeyman's Harness (crafted)

*Medium armour. Main attribute chosen when forged (STR, DEX or INT). "Honest work, honestly riveted."*

Patterns from `npc_quartermaster_deepforge_clans` (Anvilgate), for gold: **rank I** at **Trusted** (ilvl 30, 2,000
gold), **rank II** at **Kindred** (ilvl 60, 12,000 gold). Forged with the bench action `forge_pattern` (page 08 §17.3)
by anyone who knows the pattern; Leatherworkers and Blacksmiths (page 19) forge it one affix tier higher.

| Piece id | Name | Slot | Rank I cost | Rank II cost |
|---|---|---|---|---|
| `it_journeyman_coif` | Journeyman's Coif | head | 30 Scrap, 10 Essence, 2 Dust, 500 gold | 60 Scrap, 20 Essence, 6 Dust, 2 Tear-glass, 5,000 gold |
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

### 2.14 `set_tearglass_artifice` — Tear-glass Artifice (crafted; was `set_veilglass_artifice`)

*Adaptive, INT, caster or healer. ilvl 60. "Glass that has seen the other side keeps looking."*

Patterns from `npc_quartermaster_lantern_house` (Waystone Camp, the Riftwatch chapter), for gold: shoulders, hands,
feet at **Trusted** (4,000 gold each); head, chest, legs at **Kindred** (8,000 gold each). Each piece: 40 Essence,
12 Dust, 4 Tear-glass Shards, 8,000 gold.

| Piece id | Name | Slot |
|---|---|---|
| `it_tearglass_diadem` | Tear-glass Diadem | head |
| `it_tearglass_pauldrons` | Tear-glass Pauldrons | shoulders |
| `it_tearglass_mantle` | Tear-glass Mantle | chest |
| `it_tearglass_gloves` | Tear-glass Gloves | hands |
| `it_tearglass_skirt` | Tear-glass Skirt | legs |
| `it_tearglass_slippers` | Tear-glass Slippers | feet |

Random line: crafter's pick from spell power, healing done, cast speed.

| Pieces | Bonus |
|---|---|
| 2 | +6% spell power and +6% healing done |
| 4 | Every 15 s your next spell costs no resource |
| 6 | Free spells are always critical |

---

### 2.15 `set_mercenary_captains_kit` — The Mercenary Captain's Kit

*Medium, STR or DEX (vendor dropdown), tank or damage. `npc_quartermaster_wardens` at the Spire Landing,
**Kindred** with the Wardens, for gold. ilvl 60. "Paid in advance. Refunds in blood."*

| Piece id | Name | Slot | Gold |
|---|---|---|---|
| `it_captains_tricorn` | Captain's Tricorn | head | 24,000 |
| `it_captains_epaulets` | Captain's Epaulets | shoulders | 18,000 |
| `it_captains_greatcoat` | Captain's Greatcoat | chest | 24,000 |
| `it_captains_gauntlets` | Captain's Gauntlets | hands | 18,000 |
| `it_captains_belt` | Captain's Belt | waist | 18,000 |
| `it_captains_boots` | Captain's Boots | feet | 18,000 |

Random line from: health, crit chance, `follower_might`.

| Pieces | Bonus |
|---|---|
| 2 | +5% damage and +5% maximum health |
| 4 | Your followers and pets take 30% less damage and deal +15% |
| 6 | Two dodge rolls within 1 s swap your **Order**: *Guard* (+15% damage reduction, +50% threat) or *Charge* (+10% damage). 10 s cooldown |

---
## 3. Class sets index

**Re-synced with the 30 class files on 2026-09-30 (round 2).** The class file is the owner: its text is the fact
for every id, number and source below, and this index only summarises. Each class has 2–3 class sets
(`set_<class>_<snake>`), 4–6 class legendaries (`leg_`), 3–5 class uniques (`uq_`) and 2 class souls (`soul_`, indexed
in §7.3). Legendaries are **Legendary** rarity (violet `#c86bff`), sets are **Set** rarity (`#2fc4b2`), uniques
**Unique**. Every item is class-locked (`classes: ["<id>"]`) and tradeable (page 08 §15). **Where a row here and the
class file disagree, the class file wins.**

Sources follow canon W6: no raids, so the old raid sets and raid drops now come from **Challenge**-mode bosses of
`d15_fire_court` / `d16_the_spire` (and other Challenge dungeons), a world boss, or the **Depth** end chest. The
class files dropped the kits that left in round 2 (totems, combo points, stealth, the demon form, summoned imps,
the old cat pet, Cat/Owl/Stag forms), and the items tied to them were rewritten or renamed there; "(was …)" in a
Name cell gives the old id.

**How to read the tables.**
- **Pieces · slots**: the slots the class file names. `6*` = the class file does not list slots, so the
  default applies: head, shoulders, chest, hands, legs, feet (rules paragraph at the end of this section).
- **Band**: the level the set drops at. "31–60 (levelling to 60)" = drops at the dungeon's level on Normal, so it
  follows you up; "25–30 / 60" = the Normal band, and **60** on Challenge; "60" = level-60 only (page 08 §3).
- **2 / 4 / 6**: one short line per bonus. The spell ids and exact numbers are in the class file.
- **Source**: "end" / "final" = the dungeon's last boss; "secret" = its secret boss; "Depth N+ end chest" = the
  chest after a Depth run's end boss at depth N or deeper (page 12); "world boss of X" = that region's world boss
  (page 13); "rares" = that region's rare monsters (page 10). Percentages are the class file's chance where it gave
  one. Challenge sets and Challenge-mode bosses follow the Monday 06:00 weekly loot limit (canon W5).

### 3.0 Totals

| Kind | Count | Notes |
|---|---|---|
| Class sets | **74** | 16 classes have 2, 14 classes have 3 |
| Class legendaries | **142** | 4–6 per class |
| Class uniques | **109** | 3–5 per class |
| Class souls | **60** | 2 per class (§7.3) |
| **All class items** | **385** | |

| Catalogue-wide totals (if every duplicate in §3.32 is kept as written) | Sets | Legendaries | Uniques | Souls |
|---|---|---|---|---|
| Generic, this page (§2, §4, §6, §7) | 14 + Archivist's Regalia = 15 | 84 | 225 in the world pool (94 headline) | 30 |
| Dungeon-exclusive, page 12 (§3.31) | 16 | 36 | 84 | 15 (§7.4) |
| World boss and seasonal, page 13 (§3.31.3) | — (the Wild Hunt set is in §2) | — | 13 | — |
| Class files (§3.1–§3.30, §7.3) | 74 | 142 | 109 | 60 |
| **Grand total** | **105** | **262** | **431** | **105** |

If the "Keep" column of §3.32 is followed, the 8 generic dungeon sets of §2 that page 12 replaced leave the drop
tables (they are not deleted from this page until the owner decides), and the grand total of sets becomes **97**.

### 3.1 [Warrior](classes/warrior.md) — Tank (Damage) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_warrior_ironbrow` | The Ironbrow Bulwark | 31–60 (levelling to 60) | 6 · head, chest, legs, hands, feet, shield `it_ironbrow_wall` | final bosses of `d09`–`d14`, one slot each (head `d09` … shield `d14`); Normal at the dungeon's level, Challenge at 60 | 2: Bulwark Bash gives 3 charges · 4: each charge spent −1 s on Iron Call · 6: Faultline keeps its charges, +40% WD per charge held |
| `set_warrior_last_rampart` | Raiment of the Last Rampart | 60 | 6 · as above | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (warrior roll, 8%) | 2: Unbroken Stand cooldown 110 s · 4: an Iron Gale hit on 2+ enemies gives +1 charge · 6: at full charges Iron Gale is 7 hits; blocks during it heal 2% |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_unfallen_wall` | The Unfallen Wall | shield | **Wall That Remembers** — Last Rampart cooldown 90 s; 1.2 s immunity per charge spent | `d15_fire_court` final boss, Challenge only |
| Legendary | `leg_greyridge_anvil` | Greyridge Anvil | 1H hammer | **Anvilstrike** — every 3rd Bulwark Bash: 300% WD in 5 m and +5 charges | `d04_bellows_keep` final boss on Challenge, or its end chest at Depth 5+ |
| Legendary | `leg_gale_eater` | Gale-Eater | 2H axe | **Endless Gale** — Iron Gale keeps spinning while you have Momentum, 55% WD a hit | world boss of `cinder_steppe` |
| Legendary | `leg_oath_of_the_breach` | Oath of the Breach | heavy chest | **Breach Holder** — Unbreakable needs 2 enemies; a boss counts as 5 | world boss of `frostmantle` |
| Legendary | `leg_faultborn_greatsword` | Faultborn | 2H sword | **Second Seam** — Faultline fires a 2nd line at 60%, 90° off; spent charges return over 4 s | Depth 15+ end chest, any dungeon (warrior roll) |
| Unique | `uq_visor_of_many_blows` | Visor of Many Blows | heavy head | block charges last 30 s; +4% armour per charge | `d03_shaft_seven` boss 2 |
| Unique | `uq_callers_bell` | Caller's Bell (was `uq_challengers_bell`) | necklace | Iron Call taunts 6 s, reaches 14 m | `d06_sandsworn_vault` final boss |
| Unique | `uq_faultmaker` | Faultmaker | 2H axe | Faultline 24 m long, leaves a 3 s 50% snare | `d13_cindergate` boss 2 on Challenge |
| Unique | `uq_returning_rim` | Returning Rim | shield | Hurled Bulwark's return heals 4% per enemy hit | `d08_moonwell_ruins` boss 2 |

### 3.2 [Fighter](classes/fighter.md) — Damage (Tank) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_fighter_three_answers` | The Three Answers | 31–60 (levelling to 60) | 6 · head, hands, feet, legs, chest, necklace `it_three_answers_torc` | `d09`–`d12` boss 2, `d13` boss 3, `d14` boss 2 (one slot each); Normal at the dungeon's level, Challenge at 60; Depth runs of these dungeons | 2: stance swap cooldown 0.5 s · 4: Stance Dance 5 s, covers the next 2 spells · 6: an Answering Blade parry fires all three riders |
| `set_fighter_drillmaster` | Harness of the Drillmaster | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Duellist's Decree cooldown 40 s · 4: max Split Plate on the duel target refreshes the decree to 12 s · 6: in Threefold Form every parry hits the duel target for 150% WD |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_drillmasters_word` | The Drillmaster's Word | 2H sword | **Fourth Answer** — double-tap your stance: the next basic attack fires its rider, every 6 s | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| Legendary | `leg_counterweight` | Counterweight | 1H hammer | **Answer in Kind** — Answering Blade's counter = 300% of the parried hit (if above 220% WD) | `d10_rimefang_caverns` final boss on Challenge, and its Depth end chest |
| Legendary | `leg_honours_edge` | Honour's Edge | 1H sword | **Unending Duel** — Duellist's Decree lasts until the target dies or you swap stance twice | Depth 15+ end chest, any dungeon (1.5%) |
| Legendary | `leg_bracers_of_the_dial` | Bracers of the Dial | heavy hands | **Turning Wheel** — every stance swap: +8 Momentum and resets Measured Cut | world boss of `frostmantle` |
| Unique | `uq_splitmark_gauntlets` | Splitmark Gauntlets | heavy hands | Plate Splitter stacks last 20 s | `d04_bellows_keep` boss 2 |
| Unique | `uq_sergeants_whistle` | Sergeant's Whistle | necklace | Closing Step 2 charges; the second costs no Momentum | `d02_drowned_mill` final boss |
| Unique | `uq_breathing_plate` | Breathing Plate | heavy chest | Veteran's Breath removes a stun or fear, usable while stunned | `d07_thornheart` boss 3 |

### 3.3 [Paladin](classes/paladin.md) — Tank (Healer) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_paladin_oathkeeper` | Oathkeeper's Harness | 19–60 (levelling to 60) | 6 · head, chest, legs, hands, feet, tome `it_oathkeeper_psalter` | `d05`–`d08`, `d11`, `d14` (one slot each); Normal at the dungeon's level, Challenge at 60 | 2: Sanctity builds 25% faster · 4: a Fulfilled spell also fires your other oath's rider at 50% · 6: Hallowed Ground carries both Keeping and Mercy riders |
| `set_paladin_dawnwarden` | Regalia of the Dawnwarden | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Aegis of the Vow 2 charges · 4: Dawnspear instant under Covenant, fires from every ally inside at 30% · 6: Covenant −10 s per finished vow |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_kept_promise` | The Kept Promise | 1H sword | **Promise Kept** — Sanctity drops to 50 on Fulfilled instead of resetting | `d15_fire_court` final boss, Challenge |
| Legendary | `leg_sceptre_of_first_light` | Sceptre of First Light | sceptre | **First Light** — Hallowed Ground's first tick heals 15% and hits for 150% WD | `d08_moonwell_ruins` final boss, Challenge or Depth 5+ |
| Legendary | `leg_the_martyrs_tabard` | The Martyr's Tabard | medium chest | **Willing Martyr** — Keeping Covenant moves 60% onto you; you heal 10% of it | world boss of `drowned_coast` |
| Legendary | `leg_vowbreaker_hymnal` | Hymnal of the Broken Vow | off hand (tome) | **Penance** — breaking a vow fires a holy nova, 100% WD per 10 Sanctity | Depth 15+ end chest, any dungeon (paladin roll) |
| Unique | `uq_seal_of_the_first_vow` | Seal of the First Vow | ring | one free oath change in combat before calling 20 | `d01_hollow_barrow` final boss |
| Unique | `uq_dawnspear_greaves` | Dawnward Greaves | medium legs | Dawnspear 0.5 s cast, 26 m long | `d05_glass_tombs` boss 2 |
| Unique | `uq_consoling_gauntlets` | Consoling Gauntlets | medium hands | Wave of Mending on an Aegis target refreshes the Aegis | `d09_warmasters_pit` boss 3 |

### 3.4 [Ranger](classes/ranger.md) — Damage (Support) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_ranger_wildstalker` | The Wildstalker's Garb (Damage) | 19–60 (levelling to 60) | 6 · head, chest, legs, hands, feet, quiver `it_wildstalker_quiver` | `d05`, `d07`–`d10`, `d12` (one slot each); Normal at the dungeon's level, Challenge at 60 | 2: Quarry Arrow +3 stacks · 4: every trap gives the beast a free ambush (250% BD) · 6: Command Strike spends up to 10 stacks at +20% each |
| `set_ranger_apex_hunt` | Trappings of the Apex Hunt (Damage) | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon | 2: Barbed Fan fires 2 Quarry arrows, +1 stack each · 4: Bounding Retreat empowers the next 2 arrows, +2 stacks each · 6: Skyfall Volley keeps half its stacks; the beast attacks twice as fast inside |
| `set_ranger_trailwarden` | The Trailwarden's Kit (Support; crafted) | 20 / 40 / 60 | 6* | **Leatherworking** (page 19); recipes from the `fac_greenhand` quartermaster at Trusted | 2: Hunter's Brand +13%, lasts 5 s after the mark moves · 4: Pack Howl 30 m, 8 s; Tracker trick −15% cooldown · 6: a trap going off or Skyfall ending gives party within 10 m a 6% barrier |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_long_patience` | The Long Patience | longbow | **Patience** — +25% to the next Quarry Arrow per 2 s without firing (max +150%) | `d14_ashen_reliquary` final boss, Challenge |
| Legendary | `leg_collar_of_the_twin_trail` | Collar of the Twin Trail (was `leg_greatcats_collar`) | necklace | **Two of Them** — a pale echo of your beast at 50% BD; Command Strike sends both | world boss of `whisperwood` |
| Legendary | `leg_wirewalkers_boots` | Wirewalker's Boots | light feet | **Walk the Wire** — stepping on your trap launches a free 12 m Bounding Retreat | `d12_unmade_workshop` final boss on Challenge, or any Depth 15+ end chest |
| Legendary | `leg_skyfall_string` | Skyfall String | bow | **Falling Star** — Skyfall Volley follows the Quarry | `d16_the_spire` final boss, Challenge |
| Unique | `uq_brightwater_snare_kit` | Brightwater Snare Kit | light hands | Hunter's Snare 3 charges, lasts 120 s | `d02_drowned_mill` boss 2 |
| Unique | `uq_marking_quiver` | Marking Quiver | quiver | first arrow after a Quarry dies marks the nearest enemy with 3 stacks | `d06_sandsworn_vault` boss 2 |
| Unique | `uq_beastbond_charm` | Beastbond Charm (was `uq_whisker_charm`) | ring | beast +30% health; Heel / Guard taunt every 4 s | `d03_shaft_seven` final boss |
| Unique | `uq_tamers_lure` | Tamer's Lure | necklace | Tame Beast channels in 3 s; ignores the 60% health gate on beasts 5+ levels below you | `fac_greenhand` quest reward at Welcome (page 14 owns the id) |

### 3.5 [Rogue](classes/rogue.md) — Damage (Support) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_rogue_ledgerkeeper` | The Ledgerkeeper's Leathers | 22–60 (levelling to 60) | 6 · head, chest, legs, hands, feet, necklace `it_ledgerkeeper_seal` | `d06`, `d09`–`d13` (one slot each); Normal at the dungeon's level, Challenge at 60 | 2: an Unseen Twin Needles opens +1 Wound · 4: Open the Ledger's bleed: +5% from Twin Needles per Wound · 6: each Wound a finisher spends: 10% to reset Slip Away |
| `set_rogue_long_count` | The Long Count (replaces `set_rogue_nightfall`) | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (rogue roll, 8%) | 2: Blindside cooldown 10 s · 4: Coatings +1 stack per Unseen hit; Knife Tumble lose-track +1 s · 6: Deathwarrant's bill is paid twice |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_debt_collector` | The Debt Collector | dagger | **Collected** — finishers store 10% of their damage; Deathwarrant's bill adds the store | `d15_fire_court` boss 3, Challenge |
| Legendary | `leg_twinfang` | Twinfang | dagger pair (one drop, both halves) | **Mirrored** — Twin Needles' off-hand stab 100%; an Unseen cast opens both Wounds even on a boss | `d11_saltdeep_cathedral` final boss on Challenge, or its end chest at Depth 5+ |
| Legendary | `leg_cloak_of_the_unwatched` | Cloak of the Unwatched (was `leg_cloak_of_no_moon`) | light chest | **Unwatched** — enemy view cones 30° narrower against you; Slip Away cooldown 45 s | world boss of `drowned_coast` |
| Legendary | `leg_ashen_tallybag` | The Ashen Tally-Bag | light legs | **Ash Ledger** — every enemy blinded by Ashpowder gets 1 Wound | world boss of `frostmantle` |
| Legendary | `leg_high_perch` | The High Perch | hand crossbow | **Perched** — Elevated needs 1.5 m of height; an Elevated spell hit opens 2 Wounds (1 on a boss) | Depth 15+ end chest, any dungeon (rogue roll) |
| Unique | `uq_mill_rats_knuckles` | Mill-Rat Knuckles | light hands | Twin Needles on a snared or rooted target opens +1 Wound | `d02_drowned_mill` final boss |
| Unique | `uq_tumblers_anklets` | Tumbler's Anklets | light feet | Knife Tumble immunity 0.6 s, 10 m | `d05_glass_tombs` boss 2 |
| Unique | `uq_sealed_writ` | The Sealed Writ | ring | Deathwarrant lasts 10 s; everyone else's share +4% per Wound | `d14_ashen_reliquary` boss 2 |
| Unique | `uq_longshot_string` | Longshot String | short bow | Unnoticed first shots reach 45 m and open 4 Wounds (with calling 1) | `d07_thornheart` final boss |

### 3.6 [Cleric](classes/cleric.md) — Healer (Support) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_cleric_vigil` | Vestments of the Long Vigil | 19–60 (levelling to 60) | 6 · head, chest, legs, hands, feet, reliquary focus `it_vigil_reliquary` | `d05`, `d07`, `d08`, `d11`, `d13`, `d14` (one slot each); Normal at the dungeon's level, Challenge at 60 | 2: Devotion Wards up to 25% health · 4: Raise costs 35 Devotion, 2 s cast · 6: Wreath of Dawn overheal refreshes the Devotion Ward |
| `set_cleric_sunward` | Raiment of the Sunward Choir (Support) | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (cleric roll, 8%) | 2: Brand raises all damage taken by 6% (without Brand: Kindled Prayer +20% on a warded ally) · 4: Outpouring cooldown 20 s, casts a free Wreath · 6: Dawn's Absolution sets every Ward to 15%, +40 Devotion |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_brimming_chalice` | The Brimming Chalice | off hand (reliquary) | **Never Empty** — Devotion cap 150; above 100 heals +25% | `d16_the_spire` final boss, Challenge only |
| Legendary | `leg_staff_of_the_last_vigil` | Staff of the Last Vigil | staff | **Vigil Unbroken** — Keeping Vigil costs 15 Devotion, reaches 60 m, 30 s per-ally lockout | `d15_fire_court` final boss, Challenge only |
| Legendary | `leg_sealbearers_mantle` | The Sealbearer's Mantle | light chest | **Twin Sanctuary** — Sanctuary Seal also seals you, 60 s cooldown; Keeping Vigil can catch you | `d11_saltdeep_cathedral` final boss on Challenge, or its end chest at Depth 5+ |
| Legendary | `leg_tamars_wellspring` | Tamar's Wellspring | sceptre | **Wellspring** — Outpouring leaves a 10 m pool: 2%/s heal, +2 Devotion/s | world boss of `sunscar` |
| Unique | `uq_mill_fire_censer` | Mill-Fire Censer | necklace | first Kindled Prayer on a target below 35% is instant | `d02_drowned_mill` boss 2 |
| Unique | `uq_gilded_tether` | The Gilded Tether | light hands | Lifeline reaches 35 m, breaks at 45 m | `d04_bellows_keep` boss 2 |
| Unique | `uq_barrow_candle` | Barrow Candle | wand | Scourging Light heals the two lowest allies at 50% each | `d01_hollow_barrow` final boss |

### 3.7 [Bard](classes/bard.md) — Support (Healer) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_bard_road_troupe` | Regalia of the Road Troupe | 30 (levelling) | 6 · head, shoulders, chest, hands, legs, feet | every boss of `d07_thornheart` and `d08_moonwell_ruins` (Normal); chest only from `d08` final boss | 2: Marching Cadence starts with 2 verses · 4: Forced March also +25% damage 5 s · 6: Sharp Note in Forced March fires 3 at once |
| `set_bard_mourners_choir` | Vestments of the Mourners' Choir (Support) | 60 | 6 · as above | bosses of `d15_fire_court` on Challenge (one piece per boss, weekly limit) | 2: Dirge strips a buff every 4 s · 4: Last Verse resets Discordant Chord (12 m cone) · 6: Standing Ovation's target gets the Dirge bonus |
| `set_bard_hearthkeeper` | The Hearthkeeper's Motley (Healer) | 60 | 6 · as above | Depth 10+ end chest, any dungeon (one piece per chest) | 2: Hearthsong ticks every 1.5 s · 4: Homecoming at 5+ verses revives one ally at 20% (120 s) · 6: Grace Note gives the playing song's effect doubled 6 s |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_last_string` | The Last String | off hand (lute) | **One String Left** — under 20 Tempo every start is on the beat; verses every 2 s | `d11_saltdeep_cathedral` final boss (Challenge), 6% |
| Legendary | `leg_horn_of_the_gathering` | Horn of the Gathering | off hand (warhorn) | **Call to the Road** — Forced March pulls every ally within 40 m to you | world boss of `cinder_steppe`, 4% |
| Legendary | `leg_crown_of_nine_encores` | Crown of Nine Encores | head | **Nine Encores** — Standing Ovation on 2 targets; cooldown 60 s | `d15_fire_court` secret boss (Challenge), 10% |
| Legendary | `leg_tamsins_metronome` | Tamsin's Metronome | necklace | **Perfect Time** — an on-beat Finale within 1 s of a boss cast ending: +50%, refunds 2 verses | Depth 15+ end chest, any dungeon, 1.5% |
| Legendary | `leg_requiem_for_a_king` | Requiem for a King | dagger | **Royal Dirge** — Dirge bonus doubled on bosses; Last Verse +100% to bosses | world boss of `frostmantle`, 4% |
| Unique | `uq_pipers_reed` | The Piper's Reed | wand | Sharp Note pierces one enemy | `d01_hollow_barrow` final boss, 12% |
| Unique | `uq_tavern_brawlers_lute` | Tavern Brawler's Lute | off hand (lute) | Discordant Chord heals allies in its cone for 100% | `d04_bellows_keep` `b_the_great_bellows`, 8% |
| Unique | `uq_mothers_lullaby` | Mother's Lullaby | ring | the first Sleep each fight lasts 10 s | `d08_moonwell_ruins` final boss, 7% |
| Unique | `uq_drum_of_the_fen_dance` | Drum of the Fen-Dance | off hand (hand drum) | Cadence: +20% jump height, no fall damage in range | rares in `mossfen`, 3% |

### 3.8 [Mage](classes/mage.md) — Damage (Tank) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_mage_sumwrights_robes` | Sumwright's Robes | 34 (levelling) | 6* | bosses of `d09_warmasters_pit` (Normal); chest from the world boss of `cinder_steppe` | 2: Fireball 20% to build 2 Resonance · 4: Prism Lance at 4 Resonance also fires backwards at 50% · 6: Skip resets on spending 4+ Resonance |
| `set_mage_starwright` | Vestments of the Starwright (Damage) | 60 | 6* | bosses of `d16_the_spire` on Challenge (one piece per boss, weekly limit) | 2: Orrery +1 Resonance per 2 hits · 4: Collapsing Star drops a free Orrery · 6: 5-Resonance Collapsing Star lands twice |
| `set_mage_warded_scholar` | Garb of the Warded Scholar (Tank) | 60 | 6* | Depth 10+ end chest, any dungeon (one piece per chest) | 2: Runic Ward and Bastion Ward +10% max health · 4: a deflected hit refreshes Bastion Ward by 3% · 6: Gravity Well leaves Stand-ins (up to 3) and resets Prism Wall |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_unfinished_proof` | The Unfinished Proof | off hand (grimoire) | **Q.E.D.** — max Resonance +2; each above 4 gives +12% | `d16_the_spire` secret boss (Challenge), 8% |
| Legendary | `leg_orbit_of_edric_vane` | Orbit of Edric Vane | staff | **Perpetual Motion** — the Orrery never ends while you stand in it | `d12_unmade_workshop` final boss at Depth 10+, 2% |
| Legendary | `leg_foldspace_slippers` | Foldspace Slippers | feet | **Here and There** — Skip has 3 uses; each fold deals 200% | world boss of `riftmarch`, 4% |
| Legendary | `leg_heart_of_a_dead_star` | Heart of a Dead Star | necklace | **Stellar Core** — Collapsing Star 30 s cooldown; the pull also pulls elites | `d15_fire_court` final boss (Challenge), 6% |
| Legendary | `leg_prism_of_the_first_sum` | Prism of the First Sum | off hand (Seer's Orb) | **Full Spectrum** — Prism Lance splits to up to 5 enemies at 4+ Resonance | world boss of `drowned_coast`, 5% |
| Legendary | `leg_the_understudys_mask` | The Understudy's Mask | head | **Full Cast** — in Wardweaving one Stand-in stays at your side; it copies your Fireball at 30% | `d14_ashen_reliquary` final boss (Challenge), 6% |
| Unique | `uq_apprentices_abacus` | Apprentice's Abacus | off hand | Resonance fades after 20 s | `d02_drowned_mill` final boss, 10% |
| Unique | `uq_glassblowers_rod` | Glassblower's Rod | wand | Prism Lance pierces walls (not doors) | `d05_glass_tombs` boss 2, 7% |
| Unique | `uq_ward_ring_of_anvilgate` | Ward-Ring of Anvilgate | ring | Runic Ward's break pulse +3 m, stuns non-elites 1 s | `d03_shaft_seven` final boss, 8% |
| Unique | `uq_star_chart_cloak` | Star-Chart Cloak | shoulders | Skip costs no mana while an Orrery exists | rares in `whisperwood`, 3% |
| Unique | `uq_tutors_patience` | Tutor's Patience | chest | Wardweaving deflect +5%; a deflected projectile returns for 100% | `d10_rimefang_caverns` final boss, 7% |

### 3.9 [Necromancer](classes/necromancer.md) — Damage (Healer) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_necromancer_sextons_weeds` | The Sexton's Weeds | 30 (levelling) | 6* | bosses of `d08_moonwell_ruins` and `d09_warmasters_pit` (Normal); chest from the world boss of `whisperwood` | 2: corpses last 45 s · 4: Corpse Bloom on a Ripe corpse raises a Bone Thrall · 6: Control Undead on a large corpse also raises a Bone Archer |
| `set_necromancer_choir_of_bones` | Regalia of the Choir of Bones (Damage) | 60 | 6* | bosses of `d11_saltdeep_cathedral` on Challenge (one piece per boss, weekly limit) | 2: Bone Splinter pierces 2 more · 4: a raised body explodes for 120% when its time runs out · 6: Bone Colossus has no cooldown at 5 bodies + 5 corpses (once per 60 s) |
| `set_necromancer_marrowlord` | The Marrowlord's Mantle (Healer) | 60 | 6* | Depth 10+ end chest, any dungeon | 2: Mending Bloom radius 11 m · 4: Life Thread transfer 45% · 6: Bone Splints also raises a taunting Bone Thrall beside the ally |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_barrowkings_rod` | The Barrowking's Rod | sceptre | **Crown of the Barrow** — cap +2; each body past 5 is a Bone Brute | `d14_ashen_reliquary` final boss (Challenge), 5% |
| Legendary | `leg_osric_mournes_ledger` | Osric Mourne's Ledger | off hand (effigy) | **Every Name Written** — bosses leave a corpse that can only be bloomed (350% cap ×3) | `d15_fire_court` secret boss (Challenge), 8% |
| Legendary | `leg_shroud_of_the_drowned_host` | Shroud of the Drowned Host | chest | **Tide of Dead** — seizing a living Undead also seizes every Undead within 6 m | world boss of `drowned_coast`, 4% |
| Legendary | `leg_the_hundred_hands` | The Hundred Hands | hands | **Many Fists** — Crushing Fist has no cooldown; each use costs the Colossus 3 s | `d16_the_spire` boss 4 (Challenge), 5% |
| Legendary | `leg_gravewind_censer` | Gravewind Censer | necklace | **Wind of Graves** — every 8 s a corpse within 20 m blooms by itself at 60% | Depth 15+ end chest, 1.5% |
| Unique | `uq_sextons_spade` | Sexton's Spade | staff | Control Undead on a corpse costs no mana | `d01_hollow_barrow` `b_sexton_morrow`, 12% |
| Unique | `uq_ring_of_the_quiet_field` | Ring of the Quiet Field | ring | Marrow Armour and Bone Splints eat corpses from 20 m | `d06_sandsworn_vault` final boss, 7% |
| Unique | `uq_bone_archers_charm` | Bone Archer's Charm | necklace | Bone Archers pierce and fire every 1.5 s | `d11_saltdeep_cathedral` boss 2, 6% |
| Unique | `uq_marsh_mummers_wrap` | Marsh-Mummer's Wrap | legs | Rot Tide's Ripe corpses raise +100% longer | rares in `mossfen`, 3% |

### 3.10 [Warlock](classes/warlock.md) — Damage (Tank) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_warlock_debtors_raiment` | The Debtor's Raiment | 36 (levelling) | 6* | bosses of `d10_rimefang_caverns` (Normal); hands from the world boss of `frostmantle` | 2: Blight spreads on death to +1 · 4: Soul Leech heals 75% of damage · 6: Pay Tithe costs 6% max health |
| `set_warlock_ashen_covenant` | Vestments of the Ashen Covenant (Damage) | 60 | 6* | bosses of `d15_fire_court` on Challenge (one piece per boss, weekly limit) | 2: Brimstone with a Tithe leaves a 6 m pit · 4: Harrowing at 5 Tithes resets Blood Pact · 6: in Blood Pact one Harrowing costs no Tithes (counts as 5) |
| `set_warlock_gatekeeper` | The Gatekeeper's Garb (Tank) | 60 | 6* | Depth 10+ end chest, any dungeon | 2: Void Gate and Gate of Grudges cooldown 20 s · 4: taking a gate gives a 15% shield 6 s · 6: in Iron Covenant each Tithe held gives +5% damage reduction |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_first_contract` | The First Contract | off hand (grimoire) | **Binding Terms** — max Tithes 7; Harrowing +120% per Tithe | `d16_the_spire` secret boss (Challenge), 8% |
| Legendary | `leg_vesna_duskwells_quill` | Vesna Duskwell's Quill | wand | **Signed in Red** — Blood Price costs 1% health per 10 mana; each health-paid cast +1 Tithe | world boss of `riftmarch`, 4% |
| Legendary | `leg_crown_of_the_hollow_host` | Crown of the Hollow Host | head | **Hollow Host** — Crowned lasts 20 s; each DoT spreads to 2 | `d15_fire_court` final boss (Challenge), 6% |
| Legendary | `leg_kinship_of_debt` | Kinship of Debt | necklace | **Shared Blood** — paying a Tithe heals your bound demon 15%; its next attack +200% | `d09_warmasters_pit` final boss at Depth 10+, 2% |
| Legendary | `leg_gate_of_the_nine_doors` | Gate of the Nine Doors | feet | **Nine Doors** — Void Gate has no cooldown while a gate stands; keep 3 gates | world boss of `kingsfire`, 5% |
| Legendary | `leg_the_debt_collar` | The Debt Collar | necklace | **Collateral** — in Iron Covenant Blood Ward is 200% of the health paid, 15 s | `d13_cindergate` final boss (Challenge), 6% |
| Unique | `uq_marsh_hermits_contract` | Marsh-Hermit's Contract | off hand | Bind Demon channel 1.5 s, cooldown 30 s | `d02_drowned_mill` final boss, 10% |
| Unique | `uq_blight_iron_of_tamar` | Blight-Iron of Tamar | staff | Blight's hit +200% | `d06_sandsworn_vault` boss 2, 7% |
| Unique | `uq_leechbone_ring` | Leechbone Ring | ring | Soul Leech castable while moving at full speed | `d07_thornheart` final boss, 7% |
| Unique | `uq_ashen_ledger_page` | Ashen Ledger Page | necklace | the first Harrowing after a Void Gate return costs no Tithes (counts as 3) | rares in `cinder_steppe`, 3% |

### 3.11 [Demon Hunter](classes/demon_hunter.md) — Damage · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_demon_hunter_riftwatch_leathers` | Riftwatch Leathers | 38 (levelling) | 6* | bosses of `d10_rimefang_caverns` and `d11_saltdeep_cathedral` (Normal) | 2: Hunter's Bolt on a Rooted target +6 Momentum · 4: Vault's bolts pierce · 6: traps last 45 s, +1 trap |
| `set_demon_hunter_banishers_coat` | The Banisher's Coat | 60 | 6* | bosses of `d15_fire_court` on Challenge (one piece per boss, weekly limit) | 2: Weak Points +0.5 s · 4: Banishing Shot resets on a Demon banish (once per 15 s) · 6: Unmask opens a Weak Point on every Demon in range |
| `set_demon_hunter_trapwrights_harness` | The Trapwright's Harness (crafted) | 60 | 6* | **Leatherworking** 275 (page 19); recipe from `d13_cindergate` bosses | 2: Spring cooldown 6 s · 4: a triggered trap re-arms once · 6: Grinder Trap triggers every armed Snare within 10 m |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_lens_of_kael_sorrowend` | The Lens of Kael Sorrowend | head | **Never Looks Away** — Weak Points open every 3 s on Demons, 5 s on others | `d16_the_spire` secret boss (Challenge), 8% |
| Legendary | `leg_mercy_and_doubt` | Mercy and Doubt | off hand (hand crossbow) | **A Pair** — with two hand crossbows Hunter's Bolt fires both at full damage | world boss of `kingsfire`, 4% |
| Legendary | `leg_jaw_of_the_pit` | Jaw of the Pit | waist | **Never Lets Go** — the Grinder Trap attaches to the first enemy and follows it | `d13_cindergate` final boss (Challenge), 6% |
| Legendary | `leg_banishers_writ` | The Banisher's Writ | necklace | **By Right** — Banishing Shot banishes non-boss Demons under 35%; each banish +30 Momentum | `d15_fire_court` final boss (Challenge), 6% |
| Legendary | `leg_snarewright_gloves` | Snarewright Gloves | hands | **Chain Reaction** — a triggered trap triggers every other armed trap within 8 m | Depth 10+ end chest, any dungeon, 2% |
| Unique | `uq_imp_catchers_charm` | Imp-Catcher's Charm | ring | Hunter's Oath +35% vs small Demons | `d01_hollow_barrow` final boss, 12% |
| Unique | `uq_scarred_hand_crossbow` | The Scarred Hand Crossbow | hand crossbow | Hunter's Bolt builds +6 more | `d05_glass_tombs` final boss, 7% |
| Unique | `uq_watchers_scarf` | Watcher's Scarf | shoulders | Demonsight +10 m; revealed enemies stay revealed 3 s | `d08_moonwell_ruins` boss 2, 7% |
| Unique | `uq_ash_walker_boots` | Ash-Walker Boots | feet | after Vault lands, void zones do not hurt you for 1 s | rares in `kingsfire`, 3% |

### 3.12 [Scavenger](classes/scavenger.md) — Damage (Support) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_scavenger_ragpickers_rig` | The Rag-Picker's Rig | 32 (levelling) | 6* | bosses of `d08_moonwell_ruins` and `d09_warmasters_pit` (Normal) | 2: pickups from 6 m · 4: Junk Toss free 30% of the time · 6: Pack Bomb refunds 1 junk per enemy hit (max 3) |
| `set_scavenger_magpie_crown` | Regalia of the Magpie King (Damage) | 60 | 6* | bosses of `d16_the_spire` on Challenge (one piece per boss, weekly limit) | 2: Shiny chance +3% · 4: Big Score's top 20% of rolls crit · 6: a Shiny on Big Score hits twice |
| `set_scavenger_wreckers_harness` | The Wrecker's Harness (Support) | 60 | 6* | Depth 10+ end chest, any dungeon | 2: Barricade +20% max health · 4: Rummage 14–16 drops a free Barricade · 6: Rattled +10%; a destroyed Barricade explodes for 250% |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_bottomless_sack` | The Bottomless Sack | off hand (satchel) | **No Bottom** — the pack holds 40; junk spells cost 1 less | `d15_fire_court` secret boss (Challenge), 8% |
| Legendary | `leg_grits_lucky_penny` | Grit's Lucky Penny | necklace | **Heads I Win** — hold 3 Shinies; spend one on any spell to crit, no junk | world boss of `sunscar`, 4% |
| Legendary | `leg_the_jackpot_javelin` | The Jackpot Javelin | javelin | **Three of a Kind** — Big Score rolls three times, keeps the best | `d16_the_spire` final boss (Challenge), 6% |
| Legendary | `leg_door_of_the_last_inn` | Door of the Last Inn | shoulders | **Last Orders** — Rigged Barricade heals allies behind it 2%/s, lasts 40 s | world boss of `drowned_coast`, 5% |
| Legendary | `leg_magpies_eye` | The Magpie's Eye | ring | **Something Glinting** — every 10th pickup is a Shiny | Depth 15+ end chest, any dungeon, 1.5% |
| Unique | `uq_rusty_horseshoe` | The Rusty Horseshoe | ring | Lucky Throw status chance 40% | `d01_hollow_barrow` `b_warren_queen_skritch`, 12% |
| Unique | `uq_mudlarks_gloves` | Mudlark's Gloves | hands | pickups in water worth double; pick up from 5 m | `d02_drowned_mill` `b_old_croak`, 8% |
| Unique | `uq_bellows_apron` | Bellows-Keep Apron | chest | Pack Bomb fuse 0.3 s | `d04_bellows_keep` `b_forgemaster_ghorza`, 7% |
| Unique | `uq_cracked_dice` | Cracked Dice | necklace | Rummage rolls of 1 become 20 | rares in `cinder_steppe`, 3% |

### 3.13 [Swashbuckler](classes/swashbuckler.md) — Damage (Tank) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_swashbuckler_crimson_regalia` | Crimson Regalia | 25–34 / 60 | 6 · head, chest, hands, legs, feet, off-hand dagger `it_crimson_main_gauche` | bosses of `d07_thornheart` (head, hands, dagger) and `d09_warmasters_pit` (chest, legs, feet); Normal at the dungeon's level, Challenge at 60; Depth runs | 2: Needle Flurry crit +1 Flair · 4: En Garde! refunds its whole cooldown on a parry · 6: Curtain Cut at 10 Flair leaves 5 Flair |
| `set_swashbuckler_tidecaptains_finery` | Tidecaptain's Finery | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Showstopper dodges +3 Flair, +20 Tempo · 4: Chandelier Vault costs no Tempo, its landing is a Showstopper · 6: Grand Finale at any Flair; each Flair above 10 adds a strike (up to 11) |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_gallants_last_word` | The Gallant's Last Word | rapier | every Grandeur leaves an echo duellist 6 s that repeats Needle Flurry at 50% | `b_choir_of_brine` (`d11_saltdeep_cathedral`) on Challenge |
| Legendary | `leg_captains_plumed_hat` | Captain's Plumed Hat | light head | Flair does not decay out of combat; keep 5 Flair after a stun | `b_sallow_king` (world boss of `drowned_coast`) |
| Legendary | `leg_quicksilver_main_gauche` | Quicksilver Main Gauche | off-hand dagger | En Garde! becomes passive: auto-parry the next frontal hit every 8 s | `b_bishop_aldwine` (`d11_saltdeep_cathedral` end boss) on Challenge, and its Depth end chest |
| Legendary | `leg_boots_of_the_last_dance` | Boots of the Last Dance | light feet | dodge roll 2 charges; a Showstopper refunds one | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| Legendary | `leg_encore_signet` | Encore Signet | ring | Grand Finale resets once if it kills 3+ (once per 180 s) | Depth 15+ end chest, any dungeon (1.5%) |
| Unique | `uq_duellists_ribbon` | The Duellist's Ribbon | necklace | each Flair also +1% attack speed | `b_hollow_thane` (`d01_hollow_barrow` end boss) |
| Unique | `uq_saltstained_sabre` | Salt-stained Sabre | sabre | Needle Flurry becomes a 90° slash arc, 40% to all in it | `b_the_grindwheel` (`d02_drowned_mill` end boss) |
| Unique | `uq_parade_gloves` | Parade Gloves | light hands | Mocking Bow gives +2 Flair | quest reward, `q_calling_swashbuckler_2` |
| Unique | `uq_red_sash` | Red Sash of the Harbour | light legs | at 10+ Flair move +15% | `b_hobb_the_bellringer` (`d11_saltdeep_cathedral` sub-boss) |
| Unique | `uq_harbour_buckler` | Harbour Buckler | off hand (buckler) | in Riposte Guard a parry staggers the attacker 0.4 s | `b_saltshell_matron` (`d11_saltdeep_cathedral` sub-boss) |

### 3.14 [Dragon Knight](classes/dragon_knight.md) — Damage (Tank) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_dragon_knight_brood_scale` | Brood-Scale Harness | 31–39 / 60 | 6 · head, chest, hands, legs, feet, shield `it_broodscale_kite` | bosses of `d09_warmasters_pit` (head, hands, feet) and `d10_rimefang_caverns` (chest, legs, shield); Normal at the dungeon's level, Challenge at 60; Depth runs | 2: Wyrmfang Strike's rider on every enemy hit · 4: Drakeleap landing +15 Momentum per enemy (max 45) · 6: Breath of the Elders fires twice (second 60%) |
| `set_dragon_knight_wyrmlord_plate` | Wyrmlord Plate | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: aspect swap cooldown 10 s, Shedding Scales 300% WD · 4: Wyrmfall +60 Wyrmblood · 6: Dragon Form is the winged dragon; Deluge becomes a 20 m sweeping line |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_heart_of_the_fire_wyrm` | Heart of the Fire Wyrm | heavy chest | Dragon Form +8 s as the winged dragon; Firescale Deluge leaves molten ground | `b_slagborn` (world boss of `kingsfire`) |
| Legendary | `leg_rimefang_greathelm` | Rimefang Greathelm | heavy head | Rimescale: Frozen enemies shatter for 200% WD when struck | `b_rimefang` (`d10_rimefang_caverns` end boss) on Challenge, and its Depth end chest |
| Legendary | `leg_stormcrest_gauntlets` | Stormcrest Gauntlets | heavy hands | Thunderscale: Static Scale chains up to 4 times, +1 Wyrmblood each | `b_unmoored` (world boss of `riftmarch`) |
| Legendary | `leg_triune_scale` | The Triune Scale | necklace | after an aspect swap the old rider stays 8 s | Depth 15+ end chest, any dungeon (1.5%) |
| Legendary | `leg_old_kings_tooth` | The Old King's Tooth | greataxe | every 5th weapon hit is a free Breath of the Elders | `b_castellan_vorhane` (`d13_cindergate` end boss) on Challenge |
| Unique | `uq_whelpscale_buckler` | Whelpscale Buckler | shield | Scalebound's taunt applies your aspect rider | `b_grumvak_kilnbreaker` (`d04_bellows_keep` end boss) |
| Unique | `uq_cinderhorn_greataxe` | Cinderhorn | greataxe | Wyrmcoil Sweep leaves a 3 s ring of fire | `b_ogra_beastmaster` (`d09_warmasters_pit` sub-boss) |
| Unique | `uq_drakeleap_sabatons` | Leaping Sabatons | heavy feet | Drakeleap 20 m, 1 s Scalebound on landing | `b_grief_in_iron` (world boss of `greyridge`) |
| Unique | `uq_gilded_wyrmtooth` | Gilded Wyrmtooth | 2H sword | killing blows +10 Wyrmblood | `b_warmaster_drogath` (`d09_warmasters_pit` end boss) |

### 3.15 [Pyromancer](classes/pyromancer.md) — Damage (Healer) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_pyromancer_kilnwarden_robes` | Kilnwarden Robes | 19–24 / 60 | 6 · head, chest, hands, legs, feet, wand `it_kilnwarden_wand` | bosses of `d05_glass_tombs` (head, hands, wand) and `d06_sandsworn_vault` (chest, legs, feet); Normal at the dungeon's level, Challenge at 60; Depth runs | 2: Cinder Dart in the Searing band always crits · 4: Slagpool heals 50% more, first second +10 Heat · 6: Vent leaves a 6 m Slagpool |
| `set_pyromancer_sunforged_raiment` | Sunforged Raiment | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: full-charge Pyre Lance +1 s Overheat · 4: Backdraft +5 Heat per enemy or ally · 6: Overheat 14 s; Crown of Suns in Overheat drops 7 suns |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_bellows_heart` | Bellows Heart | necklace | Vent sets Heat to 50; Banked Coals 8 s | `b_grumvak_kilnbreaker` (`d04_bellows_keep` end boss) on Challenge, and its Depth end chest |
| Legendary | `leg_coldflame_circlet` | Coldflame Circlet | cloth head | fire ignores 50% fire resistance; 60% vs fire-immune | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| Legendary | `leg_phoenix_quill` | Phoenix Quill | wand | once per 180 s rise from death at 40% in Overheat | `b_slagborn` (world boss of `kingsfire`) |
| Legendary | `leg_kiln_of_the_first_forge` | Kiln of the First Forge | off-hand focus (orb) | overhealing becomes Heat; Overheat Cautery spreads Cauterized | `b_castellan_vorhane` (`d13_cindergate` end boss) on Challenge |
| Legendary | `leg_ashen_sun_staff` | Staff of the Ashen Sun | staff | Crown of Suns +1 sun per 25 Heat (up to +4) | Depth 15+ end chest, any dungeon (1.5%) |
| Unique | `uq_tinderbox_wand` | Tinderbox | wand | wand bolts +3 Heat | `b_the_grindwheel` (`d02_drowned_mill` end boss) |
| Unique | `uq_smouldering_slippers` | Smouldering Slippers | cloth feet | a burning trail while Kindled or hotter | `b_saffa_knifewind` (`d05_glass_tombs` sub-boss) |
| Unique | `uq_ash_censer` | The Ash Censer | off-hand focus | Overheat's self-burn heals you for its first 4 s | `b_glass_wyrm` (world boss of `sunscar`) |
| Unique | `uq_slagglass_bangle` | Slagglass Bangle | ring | Slagpool under yourself, harmless to you; melee attackers in it take double | `b_warmaster_drogath` (`d09_warmasters_pit` end boss) |

### 3.16 [Stormcaller](classes/stormcaller.md) — Damage (Support) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_stormcaller_galewrights_robes` | Galewright's Robes | 42–51 / 60 | 6 · head, chest, hands, legs, feet, staff `it_galewright_staff` | bosses of `d11_saltdeep_cathedral` (head, hands, feet) and `d12_unmade_workshop` (chest, legs, staff); Normal at the dungeon's level, Challenge at 60; Depth runs | 2: Forked Spark can hit the same enemy twice if alone · 4: rods last 45 s, fences reach 20 m · 6: Galvanic Tether's snap resets Squall Step, +1 rod charge |
| `set_stormcaller_eye_of_the_tempest` | Eye of the Tempest | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Skybreak also strikes every rod (5 m, 150% SP) · 4: Thunderhead strikes twice a second inside your Eye of the Storm · 6: Stormcrowned makes fences walls to non-bosses, double fence damage |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_conductors_spire` | The Conductor's Spire | staff | rods max +1; fences join every pair of rods | `b_the_gravity_engine` (`d12_unmade_workshop`) on Challenge |
| Legendary | `leg_crown_of_a_hundred_bolts` | Crown of a Hundred Bolts | cloth head | Forked Spark jumps without limit among enemies with 3+ Static | `b_unmoored` (world boss of `riftmarch`) |
| Legendary | `leg_skyanchor_boots` | Sky-Anchor Boots | cloth feet | Squall Step 2 charges, plants a free rod on arrival | `b_oddrin_the_unmaker` (`d12_unmade_workshop` end boss) on Challenge, and its Depth end chest |
| Legendary | `leg_thunderwell_orb` | Thunderwell | off-hand focus (orb) | Overcharge discharges add 1 Static to every enemy within 8 m | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| Legendary | `leg_stormglass_heart` | Stormglass Heart | necklace | inside your Eye of the Storm every 5th spell is free and instant | Depth 15+ end chest, any dungeon (1.5%) |
| Unique | `uq_coilwire_wand` | Coilwire | wand | wand bolts add 1 Static | `b_stonegullet` (`d03_shaft_seven` end boss) |
| Unique | `uq_rainslick_cowl` | Rainslick Cowl | cloth head | +15% move in rain; Thunderhead 16 s in rain | a `mossfen` rare elite (page 10 names it) |
| Unique | `uq_thunderjar` | The Thunderjar | off-hand focus | planting a rod releases a 4 m burst of 100% SP | `b_gloamwing` (`d08_moonwell_ruins` sub-boss) |
| Unique | `uq_lodestone_ring` | Lodestone Ring | ring | non-bosses at 5 Static are pulled toward your nearest rod | `b_rimefang` (`d10_rimefang_caverns` end boss) |

### 3.17 [Druid](classes/druid.md) — Healer (Tank, Damage) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_druid_grovekeepers_vestments` | Grovekeeper's Vestments (healer) | 25–30 / 60 | 6 · head, chest, hands, legs, feet, staff `it_grovekeepers_crook` | bosses of `d07_thornheart` (head, hands, staff) and `d08_moonwell_ruins` (chest, legs, feet); Normal at the dungeon's level, Challenge at 60; Depth runs | 2: a bloom plants a new seed at 50% · 4: Greenswell and Wingwash leave 3 m healing patches · 6: Circle of the Elder Grove and Mirror Pool are instant; shifting inside the Circle blooms every Seedbloom |
| `set_druid_hide_of_many` | Hide of Many (forms) | 36–45 / 60 | 6 · head, chest, hands, legs, feet, sceptre `it_many_hides_sceptre` | bosses of `d10_rimefang_caverns` (head, hands, feet) and `d11_saltdeep_cathedral` (chest, legs, sceptre); Normal, Challenge at 60 | 2: Bear — Heavy Paw 25% to reset slot 2 · 4: Wolf — Killing Bite on 3+ Torn refunds half of slot 6 · 6: Heron — entering Heron from Bear or Wolf gives 4 s Skybound |
| `set_druid_elderhorn_regalia` | Elderhorn Regalia | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Wild Heart 10 s · 4: Everbloom −5 s per shift · 6: Elder Shape — the first shift after Everbloom makes you an Elderhorn for 15 s (Heron slots 1–3, Bear slots 4–6) |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_pelt_of_the_first_winter` | Pelt of the First Winter | medium chest | Bear: Heavy Paw crits give a 10% shield (max 30%) | `b_rimefang` (`d10_rimefang_caverns` end boss) on Challenge; `b_standing_ruin` (world boss of `frostmantle`) |
| Legendary | `leg_the_ninth_life` | The Ninth Life | necklace | once per 120 s a killing blow in Bear or Wolf drops you to Grove at 30%, roots 6 m | `b_choir_of_brine` (`d11_saltdeep_cathedral`) on Challenge |
| Legendary | `leg_seedkeepers_crook` | Seedkeeper's Crook | staff | Seedbloom lands on 3 allies; a bloom jumps its remaining heal | `b_oruvel_moon_drinker` (`d08_moonwell_ruins` end boss) on Challenge, and its Depth end chest |
| Legendary | `leg_heronfeather_mantle` | Heronfeather Mantle | medium head | Heron: every 5th Stillwater Touch is instant + free Wingwash; Springflood while walking | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| Legendary | `leg_fang_of_the_long_hunt` | Fang of the Long Hunt | ring | Wolf: a killing Killing Bite resets slot 6, 3 Torn on the nearest enemy | `b_hungering_brood` (world boss of `whisperwood`) |
| Legendary | `leg_heart_of_the_wildwood` | Heart of the Wildwood | ring | +6% damage and healing per different form in the last 20 s (max +24%) | Depth 15+ end chest, any dungeon (1.5%) |
| Unique | `uq_thornheart_splinter` | Thornheart Splinter | sceptre | Bramblegrip's roots deal 30% SP a second | `b_rakka_bloodbriar` (`d07_thornheart` sub-boss) |
| Unique | `uq_oakhide_wraps` | Oakhide Wraps | medium hands | slot 4 −10 s when its Grove or Bear version is cast on yourself | `b_foreman_grubnik` (`d03_shaft_seven` sub-boss) |
| Unique | `uq_hollow_horn` | Hollow Horn | off-hand focus | Wolf: Howl of the Hunt 40 m, Dazes non-bosses within 8 m | a `sunscar` rare elite (page 10 names it) |
| Unique | `uq_mossback_greaves` | Mossback Greaves | medium legs | Bear: standing still 2 s gives 10% damage reduction | `b_king_sethar_unshattered` (`d05_glass_tombs` end boss) |

### 3.18 [Oracle](classes/oracle.md) — Healer (Support) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_oracle_seers_vestments` | Seer's Vestments | 19–24 / 60 | 6 · head, chest, hands, legs, feet, orb `it_seers_glass_orb` | bosses of `d05_glass_tombs` (head, chest, orb) and `d06_sandsworn_vault` (hands, legs, feet); Normal at the dungeon's level, Challenge at 60; Depth runs | 2: Foretold Ward foreseen-hit bonus ×2.5 · 4: Thread-Cut heals 100% of its damage · 6: an Omen on Mended Thread also casts Foretold Ward |
| `set_oracle_threadwoven_raiment` | Threadwoven Raiment | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Foresight lead +0.5 s · 4: Fate's Tug can pull the ally back within 6 s · 6: Circle of Prophecy casts The Unwritten Hour's save on allies inside |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_eye_of_the_ninth_morning` | Eye of the Ninth Morning | cloth head | **Forecast** — party frames show foreseen damage; lead +0.5 s | Depth 15+ end chest, any dungeon (1.5%) |
| Legendary | `leg_spindle_of_fates` | Spindle of Fates | sceptre | Thread-Cut jumps to 2 more enemies, each jump heals a different ally | `b_bishop_aldwine` (`d11_saltdeep_cathedral` end boss) on Challenge, and its Depth end chest |
| Legendary | `leg_hourglass_of_ashes` | Hourglass of Ashes | off-hand focus (orb) | The Unwritten Hour −3 s per Omen gained | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| Legendary | `leg_mantle_of_the_other_road` | Mantle of the Other Road | cloth chest | once per 60 s an unforeseen hit over 40% on an ally is undone | `b_sallow_king` (world boss of `drowned_coast`) |
| Legendary | `leg_prophets_bell` | The Prophet's Bell | necklace | Share the Vision gives the full lead, lasts 18 s | `b_old_mother_rime` (`d10_rimefang_caverns` secret boss) on Challenge |
| Unique | `uq_farsight_lens` | Farsight Lens | off-hand focus | intent glyphs shown 60 m away, include elites | `b_old_pike_sluicewarden` (`d02_drowned_mill` sub-boss) |
| Unique | `uq_threadbare_slippers` | Threadbare Slippers | cloth feet | after Fate's Tug you move +40% for 3 s | `b_wyllow_blighted_heart` (`d07_thornheart` end boss) |
| Unique | `uq_omen_bell` | Omen Bell | necklace | every Omen gained heals allies within 10 m for 40% SP | `b_oruvel_moon_drinker` (`d08_moonwell_ruins` end boss) |
| Unique | `uq_glasswalker_sceptre` | Glasswalker's Sceptre | sceptre | Foretold Ward can be cast on a ghost telegraph at half strength | `b_glass_wyrm` (world boss of `sunscar`) |

### 3.19 [Tactician](classes/tactician.md) — Support (Tank) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_tactician_field_marshal` | Field Marshal's Regalia | 32–45 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_field_marshal_*`) | bosses of `d09_warmasters_pit`, `d10_rimefang_caverns`, `d11_saltdeep_cathedral` on Normal (one piece per boss); level-60 copies on Challenge | 2: Probing Bolt's Exposed used by up to 2 hits, +25% each · 4: once per 10 s an Order costs 1 pip less · 6: Decisive Hour cooldown 120 s; Orders during it refund their pips |
| `set_tactician_war_table` | Regalia of the War Table | 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_war_table_*`) | Challenge bosses of `d13_cindergate`–`d16_the_spire`; Depth 10+ end chests; the coat only from `b_fire_king_kaedros` (`d15_fire_court`, Challenge) | 2: Double-Time Drill +8% move · 4: Outflank resets when an Outflanked target dies; Tank focus: Field Standard +6 s · 6: at full Initiative the Battle Plan aura is +50% |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_last_command` | The Last Command | crossbow | **Leads From the Front** — every Order also applies to you at 50% | `b_grief_in_iron` (world boss of `greyridge`) |
| Legendary | `leg_ever_unfolding_map` | The Ever-Unfolding Map | off hand (field map) | **Two Camps, One Road** — Rally Point 2 charges; allies may jump between them | `b_oddrin_the_unmaker` (`d12_unmade_workshop` end boss) |
| Legendary | `leg_forced_march_sabatons` | Sabatons of the Forced March | feet | **Forced March** — Outflank leaves a +30% move trail; Forward! 12 s | `b_carrion_crown` (world boss of `cinder_steppe`) |
| Legendary | `leg_signet_of_seven_armies` | Signet of Seven Armies | ring | **Seven Banners** — +1 follower slot; followers take 25% less area damage; On My Mark makes their next hit crit | `b_castellan_vorhane` (`d13_cindergate` end boss; Normal and Challenge) |
| Unique | `uq_quartermasters_coat` | The Quartermaster's Coat | chest | **Stores Opened** — +10 Tempo a second inside your Rally Point or Field Standard | `b_razorback_rider_krunn` (`d09_warmasters_pit`) |
| Unique | `uq_drillmasters_whistle` | Drillmaster's Whistle | necklace | **Sharp Blast** — Initiative fills every 5 s | `b_oruvel_moon_drinker` (`d08_moonwell_ruins` end boss) |
| Unique | `uq_turncoat_spur` | The Turncoat's Spur | feet | **Wrong Side of the Line** — Redeploy can swap with a non-boss enemy (45 s) | `d06_sandsworn_vault`, a rare elite in the side hall |

### 3.20 [Chronomancer](classes/chronomancer.md) — Support (Healer) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_chronomancer_hourwright` | Vestments of the Hourwright | 42–57 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_hourwright_*`) | Normal bosses of `d11_saltdeep_cathedral`, `d12_unmade_workshop`, `d13_cindergate` (one piece per boss); level-60 copies on Challenge | 2: Second Hand and Hand Back +12 Sand · 4: Recall leaves a Sandfall / Stillwater for 4 s · 6: Unwind costs 25 Sand, 2 charges |
| `set_chronomancer_last_second` | Robes of the Last Second | 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_last_second_*`) | Challenge bosses of `d13_cindergate`–`d16_the_spire`; Depth 10+ end chests; the robe only from `d16_the_spire` final boss (Challenge) or a Tailoring recipe (page 19) | 2: Echoing Hour and Hour of Return repeat after 2 s · 4: Borrowed Minutes also +10% damage · 6: Stilled Moment 120 s; Paradox Echo 50% |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_ferrymans_hourglass` | The Ferryman's Hourglass | off hand (hourglass focus) | **Two Crossings** — Recall 2 charges, costs 20 Sand | `b_sallow_king` (world boss of `drowned_coast`) |
| Legendary | `leg_the_unwound_spring` | The Unwound Spring | staff | **Twelve Strikes** — in Stilled Moment, Second Hand and Hand Back are instant and free | `d16_the_spire` final boss, Challenge |
| Legendary | `leg_band_of_the_long_afternoon` | Band of the Long Afternoon | ring | **Long Afternoon** — Borrowed Minutes 12 s, split on 2 allies at 15% | world boss of `riftmarch` |
| Legendary | `leg_mantle_of_yesterday` | Mantle of Yesterday | shoulders | **Yesterday's Road** — your Ghost runs 8 s behind | `d14_ashen_reliquary` final boss |
| Unique | `uq_sundial_wand` | The Sundial Wand | wand | **Noon Shadow** — Lagging stacks to 5 | `d07_thornheart` boss 2 |
| Unique | `uq_waterclock_slippers` | Waterclock Slippers | feet | **Running Water** — after Recall +40% move 3 s | `d10_rimefang_caverns` final boss |
| Unique | `uq_pendulum_amulet` | The Pendulum | necklace | **Swing Back** — every 30 Sand spent heals you 5% (Backward: the lowest ally) | `d05_glass_tombs` final boss |

### 3.21 [Monk](classes/monk.md) — Damage (Healer) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_monk_storm_fist` | Wraps of the Storm Fist (Damage) | 25–34 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_storm_fist_*`) | bosses of `d07_thornheart`, `d08_moonwell_ruins`, `d09_warmasters_pit` on Normal; level-60 copies on Challenge | 2: Rising Palm +1 Breath on its first cast after River Step · 4: full-Breath Mountain Palm hits all within 5 m at 50% · 6: Seven Stars Kata cooldown 60 s, full Breath when it ends |
| `set_monk_still_water` | Robes of the Still Water (Healer) | 36–45 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_still_water_*`) | bosses of `d10_rimefang_caverns`, `d11_saltdeep_cathedral` on Normal; level 60: Challenge bosses of `d13_cindergate`–`d16_the_spire` and Depth 10+ end chests; the robe is also a Tailoring recipe (page 19) | 2: Wellspring heals two allies per hit · 4: Lotus Rest always reaches 5 allies · 6: at 5 Flow Hundred Petals heals double |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_lotus_of_unbroken_flow` | Lotus of Unbroken Flow | necklace | **Unbroken** — Flow max 8; the first repeated spell in 10 s does not break it | `b_three_petitioners` (`d15_fire_court`) |
| Legendary | `leg_mountains_own_wraps` | The Mountain's Own Wraps | wraps | **The Mountain Answers** — 6-Breath Mountain Palm sends a 6 m shockwave, 150% WD | `b_grief_in_iron` (world boss of `greyridge`) |
| Legendary | `leg_sandals_of_the_eighth_star` | Sandals of the Eighth Star | feet | **Eighth Star** — Seven Stars Kata strikes 9 times; kills during it +1 Breath | `d16_the_spire` end chest, Challenge; Depth 15+ end chests |
| Legendary | `leg_ring_of_the_quiet_tide` | Ring of the Quiet Tide | ring | **Quiet Tide** — Lotus Rest lands at once; overheal becomes a 6 s barrier | `b_castellan_vorhane` (`d13_cindergate` end boss) |
| Unique | `uq_iron_knuckle_wraps` | Iron-Knuckle Wraps | wraps | **Knuckle Down** — a critical Rising Palm +1 Breath | `b_warden_seven` (`d03_shaft_seven` boss 2) |
| Unique | `uq_crane_stance_sash` | Crane-Stance Sash | legs | **One Leg** — River Step 2 charges | `b_orrun_the_glassblower` (`d05_glass_tombs` boss 1) |
| Unique | `uq_bell_of_the_temple` | Bell of the Mountain Temple | necklace | **Bell Note** — at full Breath Tempo refills 50% faster | `b_grumvak_kilnbreaker` (`d04_bellows_keep` end boss) |

### 3.22 [Shaman](classes/shaman.md) — Healer (Damage) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_shaman_storyteller` | The Storyteller's Oilskins | 19–28 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_storyteller_*`) | bosses of `d05_glass_tombs`, `d06_sandsworn_vault`, `d07_thornheart` on Normal; level-60 copies on Challenge | 2: riders last 1 spell longer · 4: a tale that completes a cycle refunds 60 mana, −5 s on the other two tales · 6: Crane's Rain always carries the Crane rider at 50% |
| `set_shaman_great_storm` | Regalia of the Great Storm | 36–45 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_great_storm_*`) | bosses of `d10_rimefang_caverns`, `d11_saltdeep_cathedral` on Normal; level 60: Challenge bosses of `d13_cindergate`–`d16_the_spire` and Depth 10+ end chests; the hauberk is also a Leatherworking recipe from `b_rimefang` | 2: the Great Storm lasts 4 s longer · 4: Great Storm lockout 60 s; Damage focus: its bolts Stagger · 6: in the Great Storm each spell calls a small storm-beast that repeats its rider at 50% |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_staff_of_the_long_telling` | Staff of the Long Telling | staff | **Long Telling** — riders last 5 spells and 20 s | `d16_the_spire` end boss, Challenge; Depth 15+ end chests |
| Legendary | `leg_headdress_of_three_skies` | Headdress of Three Skies | head | **Three Skies** — Great Storm lockout 60 s; thunder strikes twice a second | `b_fire_king_kaedros` (`d15_fire_court` end boss, Challenge) |
| Legendary | `leg_riverstone_torc` | The Riverstone Torc | necklace | **River Never Ends** — while the Crane rides, Rainsong jumps to 3 more allies at 50% | `b_hungering_brood` (world boss of `whisperwood`) |
| Legendary | `leg_ox_hide_mantle` | The Ox-Hide Mantle | shoulders | **The Ox Stands Over You** — Yoke of the Ox on two allies; its break stamp doubled | `b_rimefang` (`d10_rimefang_caverns` end boss) |
| Unique | `uq_rattle_of_storm_teeth` | Rattle of Storm Teeth | sceptre | **Loud Teeth** — the Thunder Ox's entrance stamp is 8 m, Staggers 1 s | `b_warmaster_drogath` (`d09_warmasters_pit` end boss) |
| Unique | `uq_tide_mothers_bracers` | Tide-Mother's Bracers | hands | **Wide Rain** — Crane's Rain circle 11 m | `b_the_grindwheel` (`d02_drowned_mill` end boss) |
| Unique | `uq_windborne_moccasins` | Windborne Moccasins | feet | **Light Foot** — the Wind Hare tale's cooldown is 6 s | `b_the_sand_sovereign` (`d06_sandsworn_vault` end boss) |

### 3.23 [Witch Hunter](classes/witch_hunter.md) — Damage (Support) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_witch_hunter_inquisitor` | The Inquisitor's Coat | 28–39 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_inquisitor_*`) | bosses of `d08_moonwell_ruins`, `d09_warmasters_pit`, `d10_rimefang_caverns` on Normal; level-60 copies on Challenge | 2: Hexbreak cooldown 8 s · 4: Inquest Bolt +50 Evidence on an interrupt · 6: Verdict refunds 2 Silver if it kills |
| `set_witch_hunter_silver_writ` | Garb of the Silver Writ | 48–51 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_silver_writ_*`) | bosses of `d12_unmade_workshop` on Normal; level 60: Challenge bosses of `d13_cindergate`–`d16_the_spire` and Depth 10+ end chests; the coat only from the `d15`/`d16` end bosses (Challenge) or a Leatherworking recipe learned from them | 2: Silver refills every 3 s · 4: Brand of Guilt Condemns a target below 30% at once (not bosses); Support focus: Silver Ward 12 s · 6: Verdict needs 70 Evidence on bosses and rares |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_last_confession` | The Last Confession | crossbow | **Last Words** — Verdict's bolt pierces a 45 m line, full 900% to each Condemned | `b_hungering_brood` (world boss of `whisperwood`) |
| Legendary | `leg_saltwrit_longcoat` | The Saltwrit Longcoat | chest | **Walking Circle** — Salt Circle moves with you, 10 m, 12 s | `d11_saltdeep_cathedral` final boss |
| Legendary | `leg_brim_of_the_long_hunt` | Brim of the Long Hunt | head | **Always Watching** — Witchsight always on within 15 m | world boss of `drowned_coast` |
| Legendary | `leg_nine_silver_nails` | The Nine Silver Nails | ring | **Nine Nails** — Silver max 9; each Silver spent −2 s on Verdict | `d16_the_spire`, Challenge; Depth 15+ end chests |
| Unique | `uq_tribunal_hand_crossbow` | Hand Crossbow of the Tribunal | hand crossbow | **Double Writ** — Silver Quarrel fires 2 quarrels at 70% for 1 Silver | `d06_sandsworn_vault` boss 2 |
| Unique | `uq_cold_iron_manacles` | Cold-Iron Manacles | hands | **Shackled** — Hexbreak's Silence lasts 3 s | `d08_moonwell_ruins` boss 1 |
| Unique | `uq_gallows_oath` | The Gallows Oath | necklace | **Witnessed** — Condemned targets take +10% from your whole group (Support focus +15%) | `d11_saltdeep_cathedral` boss 2 |

### 3.24 [Knight](classes/knight.md) — Tank (Support) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_knight_vowkeeper` | Plate of the Vowkeeper | 13–22 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_vowkeeper_*`) | bosses of `d03_shaft_seven`, `d04_bellows_keep`, `d05_glass_tombs` on Normal; level-60 copies on Challenge | 2: Vow of Protection moves 30% · 4: each hit moved +2 Momentum · 6: Valiant Charge on your Vowed ally free of cooldown once per 30 s |
| `set_knight_bannerlord` | Bannerlord's Harness | 42–45 / 60 | 6 · head, shoulders, chest, hands, legs, feet (`it_bannerlord_*`) | bosses of `d11_saltdeep_cathedral` on Normal; level 60: Challenge bosses of `d13_cindergate`–`d16_the_spire` and Depth 10+ end chests; the hauberk only from `b_fire_king_kaedros` (`d15_fire_court`) or a Blacksmithing recipe learned from it | 2: the banner lasts 45 s · 4: Line of Shields gives your banner's aura to everyone behind you · 6: Unyielding Oath plants your banner; 120 s cooldown at the banner |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_aegis_of_the_unbroken_vow` | Aegis of the Unbroken Vow | shield | **Unbroken Vow** — the Vow moves 35%; +1 Momentum per 2% health moved | `b_slagborn` (world boss of `kingsfire`) |
| Legendary | `leg_hammer_of_the_marching_banner` | Hammer of the Marching Banner | hammer | **Marching Standard** — the banner rides on your back (8 m aura) | `b_kennelmaster_varro` (`d15_fire_court`) |
| Legendary | `leg_helm_of_the_sworn_sentinel` | Helm of the Sworn Sentinel | head | **Sentinel's Call** — Gauntlet taunts every enemy within 8 m of its target; cooldown 6 s | `b_standing_ruin` (world boss of `frostmantle`) |
| Legendary | `leg_gauntlets_of_the_intercessor` | Gauntlets of the Intercessor | hands | **Intercessor** — Intercept takes the next 2 hits; the ally takes 20% less for 4 s | `b_castellan_vorhane` (`d13_cindergate` end boss) |
| Unique | `uq_squires_first_shield` | The Squire's First Shield | shield | **Keen Squire** — Reproach builds 18 Momentum | `b_hollow_thane` (`d01_hollow_barrow` end boss) |
| Unique | `uq_pennant_of_brightwater` | Pennant of Brightwater | necklace | **Long Watch** — your banner lasts 45 s | `b_wren_grist` (`d02_drowned_mill` boss 2) |
| Unique | `uq_oathbreakers_greaves` | The Oathbreaker's Greaves | legs | **Broken Promise** — Unyielding Oath 150 s cooldown, lasts 8 s | `b_warmaster_drogath` (`d09_warmasters_pit` end boss) |

### 3.25 [Sorcerer](classes/sorcerer.md) — Damage (Support) · cloth

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_sorcerer_gamblers_regalia` | The Gambler's Regalia | 25–30 / 60 | 6 · head, shoulders, chest, hands, legs, feet | bosses of `d07_thornheart` and `d08_moonwell_ruins` (Normal 15% per kill; Challenge at 60); Depth runs of both | 2: Chaos 1–2 rerolled; each Flux release +4% Mana · 4: same-element Prism Spray bands merge, +60% · 6: the Sixfold Die never rolls below 3 |
| `set_sorcerer_broken_wheel` | Vestments of the Broken Wheel | 60 | 6 · as above | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Flux Bolt −0.3 s cast; every 4th carries two riders · 4: Unstable Orb pulses +3 Flux; the pop releases at 60+ Flux · 6: Wild Crown on 18–20; crowned, Chance Maelstrom has no cooldown |
| `set_sorcerer_wild_pact` | The Wild Pact (Support; crafted) | 60 | 6 · as above | **Tailoring** (page 19); recipe from the `fac_lantern_house` quartermaster at Trusted; each piece needs a Tear-glass shard (Depth 5+ end chests, world bosses of `riftmarch` and `kingsfire`) | 2: Nudge 3rd charge; boons 8 s · 4: Fortune's Shell always heads at 3 Nudges; on an ally also the Blaze boon · 6: each Nudge spent makes the next Wild boon reach two party members, +8% |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_crooked_die` | The Crooked Die | off hand (effigy) | the Sixfold Die rolls twice and adds both faces | `b_fire_king_kaedros` (`d15_fire_court` end boss), Challenge 6%, Normal 2% |
| Legendary | `leg_wheelwrights_staff` | Wheelwright's Staff | staff | the Wheel shows the next two elements; Nudge moves either | `b_oddrin_the_unmaker` (`d12_unmade_workshop` end boss), Challenge 4%, its Depth end chest 2% |
| Legendary | `leg_crown_of_the_mad_magister` | Crown of the Mad Magister | head | Flux threshold 60, the table uses a d12 | `b_marchheart` (`d16_the_spire` secret boss) |
| Legendary | `leg_quadrant_bracers` | Quadrant Bracers | hands | four Wild spells of four elements in a row: Quadrant, 8 s, +40% | `b_unmoored` (world boss of `riftmarch`), 6% |
| Legendary | `leg_orb_of_second_chances` | Orb of Second Chances | off hand (Seer's Orb) | Unstable Orb can be caught and thrown again once | world boss of `drowned_coast`, 6% |
| Unique | `uq_spinners_wand` | The Spinner's Wand | wand | +12% cast speed; Hollow rolls +1% each 10 s (stacks 10) | `b_king_sethar_unshattered` (`d05_glass_tombs` end boss) |
| Unique | `uq_patchwork_hood` | Patchwork Hood | head | Chaos "Wrong Hat" also +20% damage 10 s | `b_the_grindwheel` (`d02_drowned_mill` end boss), 12% |
| Unique | `uq_coinmaster_sash` | Coinmaster's Sash | legs | Fortune's Shell's coin shows early; tails heals +50% | `b_grief_in_iron` (world boss of `greyridge`) |
| Unique | `uq_blaze_rime_signet` | Blaze-and-Rime Signet (was `uq_ember_rime_signet`) | ring | Blaze then Rime (or back) shatters for 100% SP | `b_rimeweaver_seidra` (`d10_rimefang_caverns` boss 2) |

### 3.26 [Runesmith](classes/runesmith.md) — Tank (Damage) · heavy

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_runesmith_forgewardens_plate` | Forgewarden's Plate | 14–18 / 60 | 6* | bosses of `d03_shaft_seven` and `d04_bellows_keep` (Normal 15%; Challenge at 60); their Depth end chests | 2: Etching Blow restores 4% Mana · 4: Speak the Runes with 3+ runes gives a 10% barrier · 6: Calling Stone's Holding rune 20 s, 8 m |
| `set_runesmith_rimefang_runes` | Runes of the Rimefang (was `set_runesmith_glacier_runes`) | 36–39 / 60 | 6* | bosses of `d10_rimefang_caverns` (Normal 15%; Challenge at 60); world boss of `frostmantle` (one piece, 10%) | 2: your ground runes slow +10% · 4: Stoneblood Rune also carves a Rune of Warding · 6: a Spoken Ward Stone freezes non-bosses 2 s |
| `set_runesmith_anvilborn_aegis` | The Anvilborn Aegis | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: +1 Rune Slate socket (max 6) · 4: Grand Inscription −30 s; rim runes taunt · 6: every Runeforged gives the party 8% less damage taken |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_first_hammer_of_anvilgate` | First Hammer of Anvilgate | 1H hammer | Etching Blow brands every enemy in the arc for one socket | `b_grumvak_kilnbreaker` (`d04_bellows_keep` end boss) on Challenge, 4%; its Depth end chest 2% |
| Legendary | `leg_slate_of_unwritten_names` | Slate of Unwritten Names | off hand (shield) | 7 sockets; runes past 5 cost no Mana on Speak; blocks +2 s to all runes | a Challenge-mode `d16_the_spire` boss (page 12 names which), 5% |
| Legendary | `leg_ironroot_greaves` | Ironroot Greaves | legs | in your own ground rune: 12% less damage, +0.5% Mana a second | world boss of `frostmantle`, 6% |
| Legendary | `leg_mountains_patience` | The Mountain's Patience | chest | Stoneblood Rune +1 s per rune Spoken (cap +8 s) | `b_rimefang` (`d10_rimefang_caverns` end boss) on Challenge, 4% |
| Legendary | `leg_the_last_word` | The Last Word | 2H hammer | Speak the Runes with 5+ runes: +25% WD per rune to the highest-health enemy | `b_sarn_veydrec_herald` (`d14_ashen_reliquary` end boss) on Challenge, 4%; Depth 15+ end chest, 1% |
| Unique | `uq_chisel_of_the_deep` | Chisel of the Deep | 1H hammer | +10% Mana regeneration; brands last 20 s | `b_stonegullet` (`d03_shaft_seven` end boss) |
| Unique | `uq_runecarvers_bracers` | Runecarver's Bracers | hands | fade-pops at 75% | `d06_sandsworn_vault` boss 2 |
| Unique | `uq_stone_of_the_clan_hall` | Stone of the Clan Hall | off hand (shield) | Calling Stone's taunt 5 s; +5% block | `b_grief_in_iron` (world boss of `greyridge`) |
| Unique | `uq_wardwell_girdle` | Wardwell Girdle | waist | Ward Stone's barrier also reaches you outside it | `b_deacon_mourne` (`d11_saltdeep_cathedral` boss 1) |

### 3.27 [Shadow Dancer](classes/shadow_dancer.md) — Damage (Tank) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_shadow_dancer_masquerade_silks` | Masquerade Silks | 22–30 / 60 | 6* | bosses of `d06_sandsworn_vault`, `d07_thornheart`, `d08_moonwell_ruins` (Normal 12%; Challenge at 60); their Depth end chests | 2: echoes 40% · 4: Backstep Fade leaves 2 Shadows · 6: Silhouette Strike from Shrouded resets Dusk Curtain (once per 90 s) |
| `set_shadow_dancer_choir_of_the_unlit` | Choir of the Unlit | 42–45 / 60 | 6* | bosses of `d11_saltdeep_cathedral` (Normal 15%; Challenge at 60); `b_sallow_king` (world boss of `drowned_coast`, one piece, 10%) | 2: Pirouette Cut costs 30 Tempo · 4: Mirror Waltz leaves a Shadow at every hit spot · 6: Dance stacks go to 8 |
| `set_shadow_dancer_duskwoven_garb` | Duskwoven Garb (was `set_shadow_dancer_veilwoven_garb`) | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Shadowswap cooldown 2 s · 4: Last Bow's Shadow strikes leave 3 m shadow pools · 6: hold 4 Shadows |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_twin_of_the_moonwell` | Twin of the Moonwell | dagger (main hand) | your newest Shadow attacks with your basic attacks at 35% | `b_oruvel_moon_drinker` (`d08_moonwell_ruins` end boss) on Challenge, 4%; its Depth end chest 2% |
| Legendary | `leg_curtainfall_slippers` | Curtainfall Slippers | feet | every Shadowswap leaves a 3 m patch of dusk for 3 s | `b_the_tidewife` (`d11_saltdeep_cathedral` secret boss) on Challenge, 3% |
| Legendary | `leg_the_understudy` | The Understudy | dagger (off hand) | if you would die you swap with your newest Shadow and it dies instead (180 s) | a Challenge-mode `d15_fire_court` boss (page 12 names which), 5% |
| Legendary | `leg_lantern_eaters_mask` | Lantern-Eater's Mask | head | while Shrouded and 4 s after, Shadows echo at 60% | `b_hungering_brood` (world boss of `whisperwood`), 6% |
| Unique | `uq_nettle_waltz` | Nettle Waltz | dagger | Pirouette Cut applies Poisoned (50% WD over 6 s) | `b_wren_grist` (`d02_drowned_mill` boss 2) |
| Unique | `uq_dusk_silk_sash` | Dusk-Silk Sash | waist | Dusk Curtain +2 s; Shrouded 12 s | `b_king_sethar_unshattered` (`d05_glass_tombs` end boss) |
| Unique | `uq_pinwheel_blades` | Pinwheel Blades | dagger pair (one item, both hands) | Mirror Waltz hits +2 targets per hop | `b_warmaster_drogath` (`d09_warmasters_pit` end boss) |

### 3.28 [Tinker](classes/tinker.md) — Damage (Healer) · medium

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_tinker_workshop_harness` | The Workshop Harness | 13–18 / 60 | 6* | bosses of `d03_shaft_seven` and `d04_bellows_keep` (Normal 15%; Challenge at 60); their Depth end chests | 2: Devices last +20% · 4: Cog Sentry shots 10% to drop 1 Scrap · 6: Springtrap Mine throws 4 mines |
| `set_tinker_unmade_blueprints` | The Unmade Blueprints | 48–51 / 60 | 6* | bosses of `d12_unmade_workshop` (Normal 15%; Challenge at 60) | 2: Overclock costs 2 Scrap · 4: every overload heals allies within 5 m for 60% WD · 6: Iron Walker builds a free Cog Sentry on its shoulder |
| `set_tinker_forgefire_rig` | The Forgefire Rig (was `set_tinker_emberforge_rig`) | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%); hands and feet also Engineering 280 (page 19) | 2: Aether Battery 18 s · 4: Patchwork Drone pops at 40%, can pop twice · 6: Contraption fires every 6 s, needs 4 linked Devices |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_perpetual_spring` | The Perpetual Spring | necklace | Device cap +1 (max 6) | `b_oddrin_the_unmaker` (`d12_unmade_workshop` end boss) on Challenge, 4%; its Depth end chest 2% |
| Legendary | `leg_masterwright_goggles` | Masterwright's Goggles | head | Overclocked Devices no longer overload; Overclock costs 4 Scrap | a Challenge-mode `d16_the_spire` boss (page 12 names which), 5% |
| Legendary | `leg_scrapheart_crossbow` | Scrapheart Crossbow | crossbow | Rivet Shot at 5+ Scrap spends 1 for 300% WD and a 5 m splash | `b_unmoored` (world boss of `riftmarch`), 6% |
| Legendary | `leg_pocketwatch_of_the_first_cog` | Pocketwatch of the First Cog | necklace | every 30 s the next Device is built at double effect | `b_the_finished_thing` (`d12_unmade_workshop` secret boss) on Challenge, 3% |
| Legendary | `leg_the_walking_forge` | The Walking Forge | chest | Iron Walker −5 s per Scrap spent while it cools down | `b_fire_king_kaedros` (`d15_fire_court` end boss) on Challenge, 5% |
| Unique | `uq_brass_knuckle_crossbow` | Brass-Knuckle Crossbow | hand crossbow | Rivet Shot staggers non-bosses 0.5 s | `b_hollow_thane` (`d01_hollow_barrow` end boss), 12% |
| Unique | `uq_clicking_satchel` | The Clicking Satchel | waist | Scrap cap 15 | `b_the_great_bellows` (`d04_bellows_keep` boss 2) |
| Unique | `uq_mothwing_gloves` | Mothwing Gloves | hands | Patchwork Drone moves at double speed, heals +20% | `b_wyllow_blighted_heart` (`d07_thornheart` end boss) |

### 3.29 [Priest](classes/priest.md) — Healer (Damage) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_priest_lampkeepers_vestments` | The Lampkeeper's Vestments | 19–24 / 60 | 6* | bosses of `d05_glass_tombs` and `d06_sandsworn_vault` (Normal 15%; Challenge at 60); their Depth end chests | 2: every 3rd Wickflame heal is instant · 4: Candle Ward on a full-health ally heals the lowest ally for 100% SP · 6: entering Dawn +10% Mana regeneration |
| `set_priest_regalia_of_the_salt_choir` | Regalia of the Salt Choir (was `set_priest_regalia_of_the_sunken_choir`) | 42–45 / 60 | 6* | bosses of `d11_saltdeep_cathedral` (Normal 15%; Challenge at 60); `b_sallow_king` (world boss of `drowned_coast`, one piece, 10%) | 2: Choir of Lamps +15% on its main target · 4: Penumbra's halves alternate every 2 s at 70% · 6: Equinox resets Choir of Lamps |
| `set_priest_mantle_of_the_twin_lamps` | Mantle of the Twin Lamps (was `set_priest_veil_of_the_twin_lamps`) | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Hold the Flame's Deathward also leaves a Candle Ward · 4: Twilight after Eclipse Hymn halves Mana costs · 6: Anchor 2 charges |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_the_first_lamp` | The First Lamp | off hand (reliquary) | Dawn starts at +30 instead of +50 | `b_bishop_aldwine` (`d11_saltdeep_cathedral` end boss) on Challenge, 4%; its Depth end chest 2% |
| Legendary | `leg_censer_of_two_smokes` | Censer of Two Smokes | mace | in Grey (−49 … +49) healing and damage +12% | Depth 15+ end chest, any dungeon, 1.5% |
| Legendary | `leg_bell_of_the_last_hour` | Bell of the Last Hour | necklace | Hold the Flame resets when Deathward triggers (once per 3 min) | `b_old_mother_rime` (`d10_rimefang_caverns` secret boss) on Challenge, 3% |
| Legendary | `leg_mourners_shroud` | Mourner's Shroud (was `leg_mourners_veil`) | head | in Dusk Gloamrot's healing hits 3 allies | `b_sallow_king` (world boss of `drowned_coast`), 6% |
| Legendary | `leg_scepter_of_noon_and_gloam` | Scepter of Noon and Gloam (was `leg_scepter_of_noon_and_midnight`) | sceptre | Twilight lasts until you reach Grey | `b_marchheart` (`d16_the_spire` secret boss) |
| Unique | `uq_wax_saints_hands` | Wax Saint's Hands | hands | Candle Ward absorbs +25% | `b_hollow_thane` (`d01_hollow_barrow` end boss), 12% |
| Unique | `uq_tallow_psalter` | Tallow Psalter | off hand (psalter) | Call Back in combat costs no Mana, 1.5 s cast | `d08_moonwell_ruins` boss 2 |
| Unique | `uq_thornlamp_staff` | Thornlamp Staff | staff | Penumbra roots non-bosses 1 s on its first tick | `b_wyllow_blighted_heart` (`d07_thornheart` end boss) |

### 3.30 [Enchanter](classes/enchanter.md) — Support (Tank) · light

| Set id | Name | Band | Pieces · slots | Source | 2 / 4 / 6 |
|---|---|---|---|---|---|
| `set_enchanter_dreamweavers_raiment` | Dreamweaver's Raiment | 25–30 / 60 | 6* | bosses of `d07_thornheart` and `d08_moonwell_ruins` (Normal 15%; Challenge at 60); their Depth end chests | 2: Hush 30 s on normal enemies · 4: Somnolent Tide 9 m wide · 6: waking enemies are Unsettled at 3 stacks |
| `set_enchanter_marionettists_finery` | The Marionettist's Finery | 60 | 6* | one piece per Challenge boss of `d15_fire_court` / `d16_the_spire`; Depth 10+ end chest, any dungeon (8%) | 2: Will drains 25% slower · 4: borrowed abilities −30% cooldown · 6: Crown of Strings charms one Enthralled enemy free when it ends |
| `set_enchanter_gossamer_vestments` | Gossamer Vestments (Many Faces; was `set_enchanter_veilsilk_vestments`) | 60 | 6* | world bosses of `cinder_steppe`, `frostmantle`, `drowned_coast` (one piece, 8%); Depth 5+ end chest, any dungeon (4%) | 2: Bright Glamour +25% speed; a Double every 1.5 s in Many Faces · 4: Seed of Discord −5 s per boss interrupt (Hush) or taunt (Beckon) · 6: Hall of Mirrors 12 s; Crown of Strings (Support) Enthralls 8 s |

| Kind | id | Name | Slot | Power | Source |
|---|---|---|---|---|---|
| Legendary | `leg_puppeteers_crossbar` | The Puppeteer's Crossbar | off hand (effigy) | 2 charms from calling 20 (3 at calling 40) | `b_ysa_varn_kindled` (`d15_fire_court` secret boss) on Challenge, 4% |
| Legendary | `leg_music_box_of_the_drowned_queen` | Music Box of the Drowned Queen | necklace | Hush hits 3 targets within 6 m (Beckon taunts 3) | `b_choir_of_brine` (`d11_saltdeep_cathedral` boss 2) on Challenge, 4% |
| Legendary | `leg_circlet_of_quiet_hours` | Circlet of Quiet Hours | head | sleepers do not wake from area damage | `b_oruvel_moon_drinker` (`d08_moonwell_ruins` end boss) on Challenge, 4%; its Depth end chest 2% |
| Legendary | `leg_stringcutter_staff` | Stringcutter Staff | staff | Snap needs no calling; deals Will × 6% SP | `b_unmoored` (world boss of `riftmarch`), 6% |
| Legendary | `leg_borrowed_crown` | The Borrowed Crown | head | charmed champion-pack members keep all affixes; aura doubled | a Challenge-mode `d16_the_spire` boss (page 12 names which), 5% |
| Unique | `uq_lullaby_wand` | Lullaby Wand | wand | Needling Whisper sleeps a 3-stack non-boss for 4 s | `b_the_grindwheel` (`d02_drowned_mill` end boss), 12% |
| Unique | `uq_fen_dog_collar` | Fen-Dog Collar | waist | charmed beasts drain Will 40% slower | `b_old_croak` (`d02_drowned_mill` boss 1) |
| Unique | `uq_courtiers_gloves` | Courtier's Gloves | hands | Bright Glamour also +8% crit | `d06_sandsworn_vault` end boss |

**Rules the class files follow** (page 08 owns the rules; kept here as the default the `6*` rows use):
class sets are 6 pieces (head, shoulders, chest, hands, legs, feet) in the class's armour type, or five
armour pieces plus a weapon, off hand or necklace where the class file says so. One set is a
levelling/dungeon set, one an **endgame** set (the d15/d16 Challenge set-token set, above); the 4- and 6-piece
bonuses change a named spell of that class. Emberveil's 30 class sets (`items.json sets` with `classes: [...]`)
were the starting themes.

**Class set tokens.** `it_token_<slot>` (`it_token_head`, `it_token_shoulders`, `it_token_chest`, `it_token_hands`,
`it_token_legs`, `it_token_feet`, and `it_token_offhand` / `it_token_necklace` for sets that use them) drop from
Challenge end bosses (20% per player, page 08 §16.2) and the Depth Cache from reward depth 10 (page 12). Using a
token turns it into **your** class's piece for that slot from the endgame set; if your class has two sets that use
the slot, a dropdown picks which. A token is an ordinary tradeable item (page 08 §15): it turns into a piece for
whoever uses it.

### 3.31 Dungeon and world-boss items (from pages 12 and 13)

Pages 12 and 13 own these items: their text is the fact, this is the index (re-synced with page 12 §21.4, §21.5
and each dungeon's loot lines on 2026-09-30). Names are this page's, written out from the id where page 12 gives
none. Every row of 3.31.1 is **[D-EXCL]** (drops only in that dungeon); `SECRET` = the secret boss's exclusive
legendary (page 08 §16.4). Page 12 turned its 15 *trinkets* into **dungeon souls** (one of them, The Finished Thing,
became a hands legendary instead, and d15 added The King's Offer) and moved its *wrists* and *light-slot* items to
other slots (page 12 §21.7).

#### 3.31.1 Dungeon-exclusive uniques, legendaries and souls — 135 (84 uniques, 36 legendaries of which 17 SECRET, 15 souls)

| Dungeon | Kind | id | Name | Slot | Power (page 12's words) | Drops from |
|---|---|---|---|---|---|---|
| d01 | Unique | `uq_crown_of_teeth` | Crown of Teeth | head, light | +6% attack speed; each kill within 10 s grants +2% movement speed, stacking to 10%. | `b_warren_queen_skritch` |
| d01 | Unique | `uq_pells_quiet_hood` | Pell's Quiet Hood | head, light | hits from outside an enemy's view (behind or on its flank) have +5% critical hit chance; +10% movement speed for 3 s after you open a chest. | `b_pell_lantern_thief` |
| d01 | Unique | `uq_morrows_ledger` | Morrow's Ledger | off-hand focus | each enemy you kill adds a **Plot** (max 5); your next area spell deals +6% damage per Plot and spends them. | `b_sexton_morrow` |
| d01 | Unique | `uq_ossels_thimble` | Ossel's Thimble | ring | +4% maximum health; when an ally within 20 m falls below 30% health, your next heal on them is +25% (10 s cooldown). | `b_mother_ossel` |
| d01 | Unique | `uq_thanes_ring_of_rest` | Thane's Ring of Rest | ring | +5% all damage; killing an enemy heals you 2% of your maximum health. | `b_hollow_thane` |
| d01 | Legendary | `leg_hollow_crown` | Hollow Crown | head | every 25 s your next damaging spell raises a **Hearth-man** (a barrow shambler ally with 30% of your health, 10 s) at the target. | `b_hollow_thane` |
| d01 | Unique | `uq_peat_black_shroud` | Peat-Black Shroud | back | +8% maximum health; standing still for 2 s gives a barrier of 5% maximum health (refreshes every 6 s). | `b_first_sleeper` |
| d01 | Legendary · SECRET | `leg_first_sleepers_shroud` | **12** | chest (any armour type, takes the wearer's) | when you would die, you instead fall asleep for 3 s at 1 health, immune to damage, then wake with 25% health (once every 3 minutes). | `b_first_sleeper` |
| d02 | Unique | `uq_bloodgorged_band` | Bloodgorged Band | ring | 2% of your damage heals you; doubled while you are below 40% health. | `b_bloatleech_matron` |
| d02 | Unique | `uq_sluicewardens_key` | Sluicewarden's Key | necklace | after you dodge roll, your next attack within 2 s deals +25% damage and knocks back 3 m. | `b_old_pike_sluicewarden` |
| d02 | Unique | `uq_wider_than_running` | Wider Than Running | waist | +8% movement speed; after you break a tether or leave a danger zone, +15% more for 3 s. | `b_old_croak` |
| d02 | Unique | `uq_wrens_wedding_ring` | Wren's Wedding Ring | ring | when an ally within 20 m drops below 35% health, you both gain a barrier of 8% of your maximum health (30 s cooldown). | `b_wren_grist` |
| d02 | Unique | `uq_grist_ledger_of_debts` | Grist Ledger of Debts | off-hand focus | enemies you damage owe a **Debt** (max 10 stacks per enemy); when that enemy dies, you heal 1% of your maximum health per stack. | `b_the_grindwheel` |
| d02 | Legendary | `leg_millwrights_bargain` | Millwright's Bargain | hands | every 3rd spell cast costs no resource but deals 20% of its damage to you as a debt paid over 3 s. | `b_the_grindwheel` |
| d02 | Unique | `uq_silt_lords_tithe` | Silt Lord's Tithe | ring | 5% of gold you pick up is kept as **Tithe** (max 500); spend it with a click to heal to full out of combat. | `b_the_tithe_below` |
| d02 | Legendary · SECRET | `leg_ledger_of_the_deep` | **12** | necklace | each time an enemy hits you, it gains a **Debt**; at 5 Debts your next hit on it deals +200% damage and clears them. | `b_the_tithe_below` |
| d03 | Unique | `uq_grubniks_ledger` | Grubnik's Ledger | off-hand focus | each time an ally you buffed lands a critical hit, you gain 1% haste (max 10%, 8 s). | `b_foreman_grubnik` |
| d03 | Unique | `uq_rattlejaws_shell` | Rattlejaw's Shell | off-hand shield | when you take a hit from the front, 10% chance to gain **Shell** (−30% damage taken, 3 s). | `b_rattlejaw` |
| d03 | Unique | `uq_ringleaders_candles` | Ringleader's Candles | head | your area spells leave a 2 m burning patch for 3 s (6% of the spell's damage per second). | `b_nix_candlejaw` |
| d03 | Unique | `uq_seventh_shift_rune` | Seventh Shift Rune | necklace | when you break line of sight to an enemy casting at you, you gain a barrier of 6% of your maximum health (10 s cooldown). | `b_warden_seven` |
| d03 | Soul | `soul_stonegullets_gizzard` | Stonegullet's Gizzard | armour socket: chest | when a hit takes you below 35% health you swallow the stone: −40% damage taken and immune to knockback for 4 s (90 s cooldown). | `b_stonegullet` |
| d03 | Legendary | `leg_worm_king_mandible` | Worm King Mandible | weapon (two-handed axe or mace, takes the looter's preferred type) | your heavy attacks bore into the ground and erupt under the target 1 s later for 60% weapon damage in a 3 m circle. | `b_stonegullet` |
| d03 | Unique | `uq_goldvein_signet` | Goldvein Signet | ring | +10% gold found; your critical hits have a 5% chance to drop a shard worth 5–30 gold. | `b_the_unmined` |
| d03 | Legendary · SECRET | `leg_heart_of_the_unmined` | **12** | chest | every 10 s standing still in combat grows a stone skin: −5% damage taken per stack (max 4); moving 5 m clears it. | `b_the_unmined` |
| d04 | Unique | `uq_matched_tongs` | Matched Tongs | hands | when you and a party member hit the same target within 1 s, both hits deal +8%. | `b_grukk_and_zagga` |
| d04 | Soul | `soul_slag_heart` | Slag Heart | weapon socket | your hits tagged Fire have a 10% chance to leave a 2 m slag pool for 4 s (8% of the hit per second). | `b_slagmaw` |
| d04 | Unique | `uq_orc_steel_pauldrons` | Orc-Steel Pauldrons | heavy shoulders | taunting an enemy gives you −15% damage taken from it for 6 s. | `b_forgemaster_ghorza` |
| d04 | Unique | `uq_chained_flame_link` | Chained Flame Link | ring | fire spells cost 8% less; if you are hit by a room-wide attack, your next fire spell deals +30%. | `b_the_great_bellows` |
| d04 | Unique | `uq_throne_of_the_keep_signet` | Throne of the Keep Signet | ring | +6% damage to enemies stronger than you (elite, boss). | `b_grumvak_kilnbreaker` |
| d04 | Legendary | `leg_kilnbreakers_oath` | Kilnbreaker's Oath | two-handed axe | every 4th hit on the same target applies **Cleft** (−5% armour, max 5); at 5, your next hit deals +150% and clears it. | `b_grumvak_kilnbreaker` |
| d04 | Unique | `uq_bellamund_hammerhand` | Bellamund's Hammerhand | hands | your every 5th hit on an enemy applies **Brittle** (+4% physical damage taken, max 5). | `b_bellamund_the_cold_smith` |
| d04 | Legendary · SECRET | `leg_the_cold_anvil` | **12** | off-hand (shield) | blocking an attack stores 30% of it; your next attack within 5 s releases the stored amount as frost damage in a 4 m circle. | `b_bellamund_the_cold_smith` |
| d05 | Soul | `soul_brood_mothers_gilt` | Brood-Mother's Gilt | any armour socket | +8% damage against enemies with a damage-reflect aura; you take no reflected damage for 3 s after a dodge roll. | `b_gilded_brood_mother` |
| d05 | Unique | `uq_saffas_bandolier` | Saffa's Bandolier | waist | after you dodge roll, drop a smoke pot: allies inside (4 m, 3 s) are 30% harder to hit. | `b_saffa_knifewind` |
| d05 | Unique | `uq_orruns_first_pane` | Orrun's First Pane | off-hand | 20% of beam and line damage you take is reflected at the nearest enemy. | `b_orrun_the_glassblower` |
| d05 | Unique | `uq_second_glass_crown` | Second Glass Crown | head | +6% movement speed; while you stand still for 1 s, +6% damage (lost when you move). | `b_queen_ammarel` |
| d05 | Unique | `uq_unshattered_gauntlets` | Unshattered Gauntlets | heavy hands | when an enemy hit would take more than 30% of your health, it takes 10% less (5 s cooldown). | `b_king_sethar_unshattered` |
| d05 | Legendary | `leg_the_eleventh_century` | The Eleventh Century | off-hand (focus or shield) | every 12 s your next beam-, line- or cone-shaped spell bounces once off an invisible mirror at the end of its range and travels back. | `b_king_sethar_unshattered` |
| d05 | Unique | `uq_seventh_kings_signet` | Seventh King's Signet | ring | +8% damage while you stand in a beneficial zone, a sun-shaft or a sun-patch; +8% dodge chance while you do not. | `b_ithar_the_unseen` |
| d05 | Legendary · SECRET | `leg_the_unseen_prince` | **12** | cloak | after 3 s without taking damage you become **unseen** (enemies further than 8 m lose you); your first attack from unseen deals +60%. | `b_ithar_the_unseen` |
| d06 | Unique | `uq_the_coffers_tongue` | The Coffer's Tongue | necklace | +12% gold found; enemies that die within 3 s of your hit drop 10% more gold. | `b_coffer_that_counts` |
| d06 | Unique | `uq_hasks_lucky_shovel` | Hask's Lucky Shovel | off-hand | dodge roll distance +2 m; rolling through a wave or wall gives +10% haste 3 s. | `b_hask_the_tunneler` |
| d06 | Unique | `uq_true_weight` | True Weight | waist | while at least one ally stands within 10 m on each side of you (left and right), you deal +8% damage and take 5% less. | `b_scales_of_tamar` |
| d06 | Soul | `soul_the_stolen_oath` | The Stolen Oath | jewellery socket | once every 60 s, the first curse placed on you or on an ally within 20 m is removed the moment it lands; +5% healing received. | `b_qassar_silver_tongued` |
| d06 | Unique | `uq_sovereigns_binding` | Sovereign's Binding | waist | dispelling a curse from an ally gives both of you +10% damage for 6 s. | `b_the_sand_sovereign` |
| d06 | Legendary | `leg_the_unbound_dune` | The Unbound Dune | feet | every 10 s your next dodge roll leaves a 6 m-long **sand wall** behind you for 4 s that blocks enemy projectiles and pushes enemies 3 m. | `b_the_sand_sovereign` |
| d06 | Unique | `uq_first_oath_signet` | First Oath Signet | ring | +6% healing done; your heals remove one curse. | `b_tamar_the_first` |
| d06 | Legendary · SECRET | `leg_water_of_tamar` | **12** | necklace | every 20 s, the next ally you heal below 40% health gets a 4 m **beneficial** pool under them for 5 s: +10% healing received and curse immunity. | `b_tamar_the_first` |
| d07 | Unique | `uq_web_of_the_matriarch` | Web of the Matriarch | back | your damage-over-time effects jump to 1 more enemy within 5 m when the target dies. | `b_silkrot_matriarch` |
| d07 | Unique | `uq_scent_of_blood` | Scent of Blood | hands | +10% damage against **marked** enemies; your critical hits mark the target for 4 s. | `b_rakka_bloodbriar` |
| d07 | Unique | `uq_mycelial_ring` | Mycelial Ring | ring | your damage-over-time effects tick 10% faster; when one of them jumps, it heals you 1% of max health. | `b_the_sporefather` |
| d07 | Unique | `uq_thornlink_band` | Thornlink Band | ring | when an ally within 8 m takes a hit over 20% of their health, you take 10% of it instead and they take 10% less. | `b_orenn_thornbound` |
| d07 | Unique | `uq_wyllows_last_leaf` | Wyllow's Last Leaf | necklace | +8% healing done; your heals on an ally with a damage-over-time effect heal +20% more. | `b_wyllow_blighted_heart` |
| d07 | Legendary | `leg_blightbreaker` | Blightbreaker | hands | dispelling or cleansing a damage-over-time effect from an ally turns it around: it ticks on the nearest enemy instead, at 200%. | `b_wyllow_blighted_heart` |
| d07 | Soul | `soul_seed_of_the_sovereign` | Seed of the Sovereign | weapon socket (casters) | every 60 s your next damaging spell also plants a seed on its target; 3 s later it bursts into a 5 m spreading damage-over-time (40% spell power a second, 8 s). | `b_gall_sovereign` |
| d07 | Legendary · SECRET | `leg_wyllows_gratitude` | **12** | off-hand focus | every 15 s, the next ally you heal gets a 3 m **beneficial** root-pool under them for 6 s that cleanses one damage-over-time effect a second. | `b_gall_sovereign` |
| d08 | Unique | `uq_dusk_scale_cloak` | Dusk-Scale Cloak | back | +10% dodge chance while you have not cast a spell in the last 3 s. | `b_gloamwing` |
| d08 | Unique | `uq_caeliths_last_arrow` | Caelith's Last Arrow | quiver | every 20 s, your next ranged attack pierces through every enemy in a 30 m line. | `b_caelith_pale_huntress` |
| d08 | Unique | `uq_twin_bond_band` | Twin-Bond Band | ring | +6% damage while an ally is within 5 m of you; if that ally also wears this ring, both of you gain +6% more. | `b_twin_wardens` |
| d08 | Unique | `uq_ilvandors_constant` | Ilvandor's Constant | necklace | your spells cost 5% less; every 5th spell costs nothing. | `b_archmage_ilvandor` |
| d08 | Unique | `uq_moon_drinkers_tooth` | Moon-Drinker's Tooth | dagger | your hits on an enemy that stands in a void zone deal +10% and heal you for 1% of the damage dealt. | `b_oruvel_moon_drinker` |
| d08 | Legendary | `leg_the_thirst` | The Thirst | necklace | killing an enemy drinks its glow: +3% damage for 10 s (max 10 stacks); at 10 stacks your next spell is a 10 m **donut** around you for 150% spell power. | `b_oruvel_moon_drinker` |
| d08 | Unique | `uq_crescent_of_lirath` | Crescent of Lirath | off-hand | your cone and donut spells deal +12% damage. | `b_the_drowned_moon` |
| d08 | Legendary · SECRET | `leg_the_moon_returned` | **12** | ring | you carry a personal Moon Clock (45 s / 45 s): Moonlit +12% healing done, Moonless +12% damage done; the ring glows to show which. | `b_the_drowned_moon` |
| d09 | Soul | `soul_ogras_whistle` | Ogra's Whistle | jewellery socket | the first time each fight an enemy tagged Beast hits you, every enemy beast within 15 m attacks the nearest other enemy for 5 s (90 s cooldown). | `b_ogra_beastmaster` |
| d09 | Unique | `uq_death_roll_girdle` | Death-Roll Girdle | waist | when you are held or stunned, gain a barrier of 10% max health (20 s cooldown). | `b_the_moatmother` |
| d09 | Unique | `uq_broken_chain` | Broken Chain | necklace | when a movement-stopping effect ends on you, gain +25% move speed and +10% damage for 3 s. | `b_brannoc_the_chained` |
| d09 | Unique | `uq_bait_and_stake` | Bait and Stake | feet | an enemy that is fixated on you or chasing you takes +10% damage from your allies. | `b_razorback_rider_krunn` |
| d09 | Unique | `uq_favour_of_the_crowd` | Favour of the Crowd | necklace | each dodge roll through a danger zone gives **Favour** (+2% damage per stack, 10 s, max 5). | `b_warmaster_drogath` |
| d09 | Legendary | `leg_ashmanes_twin_cleavers` | Ashmane's Twin Cleavers | 1H axe pair (counts as one legendary) | every 3rd hit with the off-hand cleaver throws it: a 12 m line, 80% weapon damage, returns to your hand. | `b_warmaster_drogath` |
| d09 | Unique | `uq_tallows_collar` | Tallow's Collar | necklace | your companion or pet takes 20% less damage and deals +10%. | `b_old_gnash_undefeated` |
| d09 | Legendary · SECRET | `leg_the_undefeated` | **12** | waist | the first time each fight you would drop below 20% health, you instead heal to 50% and gain +20% damage for 8 s. | `b_old_gnash_undefeated` |
| d10 | Soul | `soul_hibernation` | Hibernation | armour socket: chest or legs | when a hit takes you below 30% health, you curl up and heal 30% of your maximum health over 6 s, unable to move (a dodge roll cancels it; 120 s cooldown). | `b_old_whitemaw` |
| d10 | Unique | `uq_yrsas_bell` | Yrsa's Bell | off-hand | your interrupts also remove 2 stacks of any stacking debuff from allies within 10 m. | `b_frostsayer_yrsa` |
| d10 | Unique | `uq_icebreakers_cleats` | Icebreaker's Cleats | feet | immune to slipping on ice; +10% move speed on snow and ice. | `b_skarr_icebreaker` |
| d10 | Unique | `uq_song_of_the_rime` | Song of the Rime | necklace | you are immune to the first Chill-type slow each fight; your frost spells add −10% move speed to enemies (stacking 3). | `b_rimeweaver_seidra` |
| d10 | Unique | `uq_rimefang_heartscale` | Rimefang Heartscale | heavy chest | +20% cold resistance; 10% of cold damage you take is added to your next hit. | `b_rimefang` |
| d10 | Legendary | `leg_breath_of_the_glacier` | Breath of the Glacier | staff/wand | your frost spells leave a 3 m ice floor patch for 6 s: enemies on it are slowed 30% and take +10% damage from you. | `b_rimefang` |
| d10 | Unique | `uq_the_quiet_step` | The Quiet Step | feet | enemies more than 15 m away do not notice you unless you attack. | `b_old_mother_rime` |
| d10 | Legendary · SECRET | `leg_mothers_last_winter` | **12** | chest | you carry a 4 m **warmth** aura (allies inside lose 1 Chill-type stack a second and heal 1% a second); every 30 s it flares, healing allies inside 10% of their max health. | `b_old_mother_rime` |
| d11 | Unique | `uq_ringers_earplugs` | Ringer's Earplugs | head | immune to silence; +10% resistance to room-wide damage. | `b_hobb_the_bellringer` |
| d11 | Unique | `uq_matrons_pearl` | Matron's Pearl | necklace | while swimming you move 40% faster and take no Drowning for 20 s. | `b_saltshell_matron` |
| d11 | Unique | `uq_deacons_litany` | Deacon's Litany | necklace | your interrupt's cooldown is reduced by 3 s each time you interrupt successfully. | `b_deacon_mourne` |
| d11 | Unique | `uq_the_missing_part` | The Missing Part | ring | when an ally near you dies, you gain their role's bonus for 10 s (+15% damage, or +15% healing, or −15% damage taken). | `b_choir_of_brine` |
| d11 | Soul | `soul_the_full_church` | The Full Church | jewellery socket (Support, Healer) | when a boss fight starts and again at each boss phase change, every ally within 15 m gains +10% damage for 10 s, +2% more for each ally beyond 2 (90 s cooldown). | `b_bishop_aldwine` |
| d11 | Legendary | `leg_bell_of_saltdeep` | Bell of Saltdeep | off-hand | every 20 s you ring a bell: allies within 10 m gain a barrier of 8% max health and enemies within 10 m are silenced 2 s. | `b_bishop_aldwine` |
| d11 | Unique | `uq_what_the_sea_keeps` | What the Sea Keeps | ring | when you would take a hit over 40% of your health, 20% of it is taken over 4 s instead (30 s cooldown). | `b_the_tidewife` |
| d11 | Legendary · SECRET | `leg_heart_of_the_tidewife` | **12** | chest | you breathe water (no Drowning), swim at full speed, and your spells cast while swimming deal +15%. | `b_the_tidewife` |
| d12 | Soul | `soul_perpetual_cog` | Perpetual Cog | weapon socket | every 10 s in combat, +2% attack speed (max 10%); lost after 5 s out of combat. | `b_cogheart_warden` |
| d12 | Unique | `uq_through_the_lens` | Through the Lens | off-hand | your line-shaped spells go 50% further. | `b_mira_lensgrinder` |
| d12 | Unique | `uq_upside_down_charm` | Upside-Down Charm | necklace | fall damage is ignored; after a fall or a knock-up, +20% damage for 4 s. | `b_the_gravity_engine` |
| d12 | Unique | `uq_look_at_yourself` | Look at Yourself | ring | your first damaging spell each fight is cast twice (the second at 40%). | `b_mirror_apprentices` |
| d12 | Soul | `soul_oddrins_last_letter` | Oddrin's Last Letter | armour socket: feet | once every 45 s your dodge roll becomes a step through a portal to a point 20 m ahead, leaving a return portal for 6 s. | `b_oddrin_the_unmaker` |
| d12 | Legendary | `leg_the_unmaking` | The Unmaking | two-handed (staff or weapon, looter's type) | every 30 s your next hit **unmakes** the target's defences: −30% armour and resistances for 8 s (bosses: −15%). | `b_oddrin_the_unmaker` |
| d12 | Unique | `uq_cogheart` | Cogheart | necklace | +4% haste; every 20th hit you land winds you up: +20% haste for 4 s. | `b_the_finished_thing` |
| d12 | Legendary · SECRET | `leg_the_finished_thing` | The Finished Thing | hands | every 120 s, the first time you use your slot-6 spell a **brass double** of you steps out for 12 s and copies your abilities at 40% power. | `b_the_finished_thing` |
| d13 | Unique | `uq_torvens_sighting_lens` | Torven's Sighting Lens | necklace | +15% damage with line-shaped attacks against targets more than 20 m away. | `b_torven_ballista_master` |
| d13 | Unique | `uq_ilsabets_doubt` | Ilsabet's Doubt | ring | −10% fire damage taken; your dispels also give the target a barrier of 5% max health. | `b_pyre_priestess_ilsabet` |
| d13 | Soul | `soul_varrows_key` | Varrow's Key | any armour socket | while you stand in a soak, allies in the same soak take 10% less from it. | `b_gatekeeper_varrow` |
| d13 | Unique | `uq_quench_seal` | Quench Seal | waist | when a stacking debuff on you would reach its maximum, remove it and gain −20% damage taken for 4 s (60 s cooldown). | `b_slag_colossus` |
| d13 | Unique | `uq_never_cold` | Never Cold | heavy hands | immune to Chill and freeze; +15% fire damage taken (a real trade, marked in red on the tooltip). | `b_commander_kaelis` |
| d13 | Soul | `soul_gate_key` | The Gate Key | armour socket: shield or chest | when a single hit takes more than 30% of your health, you and the 4 nearest allies take −20% damage for 6 s (120 s cooldown). | `b_castellan_vorhane` |
| d13 | Legendary | `leg_the_cindergate` | The Cindergate | shield | every block builds **Heat** (max 10); at 10 your next hit releases the Furnace Heart: a 60° cone 12 m for 300% weapon damage. | `b_castellan_vorhane` |
| d13 | Unique | `uq_banner_of_last_light` | Banner of Last Light | back | allies within 10 m take 5% less damage; you take 5% more. | `b_first_flame_of_the_gate` |
| d13 | Legendary · SECRET | `leg_the_first_flame` | **12** | two-handed (the looter's type) | your attacks set a **Kindling** mark; at 5 marks the enemy bursts into a 6 m white fire for 200% weapon damage and the fire spreads the marks to everything it hits. | `b_first_flame_of_the_gate` |
| d14 | Unique | `uq_unwritten` | Unwritten | necklace | once every 60 s, a hit that would kill you is written off: you take none of it and gain 2 s of immunity to that attacker. | `b_the_ash_scribe` |
| d14 | Unique | `uq_twice_born` | Twice-Born | chest (any type) | once per fight, when you would die, become an egg for 3 s (immune), then hatch at 30% health. | `b_cinderbrood` |
| d14 | Soul | `soul_four_doors` | Four Doors | weapon socket (casters) | every 15 s your next spell gets a random one of: +30% damage, −50% cost, instant cast, +50% area. | `b_relic_custodian` |
| d14 | Unique | `uq_eyes_sewn_shut` | Eyes Sewn Shut | head | immune to blind; +10% damage for 5 s after you interrupt. | `b_high_ashpriest_morvaine` |
| d14 | Unique | `uq_first_burned_feather` | First Burned Feather | necklace | +10% fire damage; 5% of fire damage you deal heals the lowest-health ally within 20 m. | `b_ashwing` |
| d14 | Soul | `soul_the_kings_decree` | The King's Decree | jewellery socket | once every 120 s, your interrupt also stuns every enemy within 20 m for 1.5 s (bosses: interrupted only). | `b_sarn_veydrec_herald` |
| d14 | Legendary | `leg_herald_of_ashes` | Herald of Ashes | off-hand (banner/focus) | carry a banner that plants itself when you stand still 2 s: allies within 8 m deal +8% damage and take 8% less; it moves with you when you walk away. | `b_sarn_veydrec_herald` |
| d14 | Legendary | `leg_reliquary_heart` | Reliquary Heart | necklace | each relic-type buff you receive (dungeon seals, the Fire Court's Favour help, world-boss buffs) is 50% stronger. | `b_sarn_veydrec_herald` |
| d14 | Unique | `uq_remember_the_roads` | Remember the Roads | necklace | +2% damage for each different d01–d16 dungeon you have finished on Challenge (max +32%). | `b_ashmother_veyra` |
| d14 | Legendary · SECRET | `leg_the_oldest_coal` | The Oldest Coal | necklace | you carry a 10 m ring of coal-warmth (a faint gold ring on the floor round you): allies inside it take 10% less damage from room-wide attacks, and once every 3 minutes a room-wide attack that would kill an ally inside it leaves them at 1 health. | `b_ashmother_veyra` |
| d15 | Unique | `uq_varros_leash` | Varro's Leash | hands | your tamed beast, bound demon or controlled undead moves and attacks 15% faster and fixates your target for 4 s after you hit it. | `b_kennelmaster_varro` |
| d15 | Unique | `uq_ivrettes_gift` | Ivrette's Gift | ring | enemies with one of your damage-over-time effects on them receive 20% less healing. | `b_lady_ivrette` |
| d15 | Unique | `uq_cinderjaw_grille` | Cinderjaw Grille | shield | blocking a hit pushes the attacker back 1.5 m (bosses: 0.5 m, 5 s cooldown). | `b_cinderjaw` |
| d15 | Unique | `uq_petition_of_the_three_houses` | Petition of the Three Houses | necklace | when a fight starts you receive one of Ash (a 10% shield), Iron (+10% armour) or Flame (+8% damage) at random for that fight. | `b_three_petitioners` |
| d15 | Unique | `uq_hestas_apprentice_hammer` | Tobbin's Hammer | 1H mace | every 4th hit inscribes a rune on the target; the 5th hit detonates it for 150% weapon damage in 4 m. | `b_forgequeen_hesta` |
| d15 | Legendary | `leg_firewing_pinion` | Firewing Pinion | two-handed staff or bow | every 3rd cast sends a Deep Breath line 25 m × 4 m for 350% weapon or spell damage. | `b_vaelkyr_firewing` |
| d15 | Soul | `soul_the_kings_offer` | The King's Offer | jewellery socket | once per fight, when an ally within 20 m would die, they are left at 1 health instead and you lose 20% of your maximum health. | `b_fire_king_kaedros` |
| d15 | Legendary | `leg_crown_of_kaedros` | Crown of Kaedros | head | your hits tagged Fire leave a burning 4 m tile under the target for 6 s (30% of the hit a second to enemies on it). | `b_fire_king_kaedros` |
| d15 | Unique | `uq_ysas_ribbon_band` | Ysa's Ribbon Band | ring | when an ally within 20 m drops below 30% health, your next heal or shield on them is +30% (10 s cooldown). | `b_ysa_varn_kindled` |
| d15 | Legendary · SECRET | `leg_kiln_heart` | Kiln Heart | off-hand focus or shield | every 15 s your next heal or damaging spell is doubled and turns the target to glass for 2 s (enemies take +30% damage; allies are immune to damage). | `b_ysa_varn_kindled` |
| d16 | Unique | `uq_grey_collar` | The Grey Collar | necklace | your tamed beast, bound demon or controlled undead can cross rifts with you and deals +15% damage. | `b_grey_and_greyer` |
| d16 | Unique | `uq_mouth_that_speaks_true` | The Mouth That Speaks True | head | warning lines that lie are marked for you (✕) even on Challenge. | `b_many_mouthed` |
| d16 | Unique | `uq_threshold_lodestone` | Threshold Lodestone | ring | crossing a rift, or a dodge roll, gives +8% damage for 4 s. | `b_threshold` |
| d16 | Legendary | `leg_horologe_mainspring` | Horologe Mainspring | ring | once every 60 s, press dodge twice quickly to rewind yourself to where you were 4 s ago, with the health you had. | `b_horologe` |
| d16 | Unique | `uq_horologe_pocketwatch` | Horologe Pocketwatch | necklace | your cooldowns tick 5% faster; every 12th second your next ability that second is +20%. | `b_horologe` |
| d16 | Unique | `uq_mirror_of_the_court` | Mirror of the Court | off-hand focus | once every 45 s your next spell is cast a second time by a mirror of you at 40%. | `b_mirror_court` |
| d16 | Unique | `uq_saelith_spindle` | Saelith's Spindle | staff | your area spells draw white threads between allies inside them; linked allies share 10% of damage taken, evenly. | `b_saelith_spirewarden` |
| d16 | Legendary | `leg_unwoven_spindle` | The Unwoven Spindle | off-hand focus or shield | every 10 s your next hit ties the target to up to 3 nearby enemies with threads for 6 s; 40% of damage dealt to any of them is dealt to all. | `b_unwoven` |
| d16 | Legendary · SECRET | `leg_heart_of_the_march` | Heart of the March | necklace (guaranteed once per account) | every ability you use is 2% stronger for each region of the Wildmarch you have fully explored (max +22% for all eleven). | `b_marchheart` |
| d16 | Legendary · SECRET | `leg_dream_of_the_march` | Dream of the March | any weapon type | every 30 s you gain a region's blessing in turn — Hearthvale (heal 10%), Mossfen (your hits poison), Greyridge (+20% armour), Sunscar (+15% haste), Whisperwood (regeneration), Cinder Steppe (+15% damage), Frostmantle (your hits freeze 0.5 s), Drowned Coast (5% life steal), Riftmarch (your dodge roll teleports), Kingsfire (+30% critical damage), Spire Isle (+10% to all of the above) — each lasts 30 s. | `b_marchheart` |

**Slot notes (round 2).** Canon has no trinket, wrist or light slot (page 08 §2.3). Page 12 §21.7 lists every
move: trinkets → souls, wrists → hands / waist / neck, light-slot items → head, neck or off-hand focus
(`uq_pells_hooded_lantern` → `uq_pells_quiet_hood`, `leg_the_first_ember` → `leg_the_oldest_coal`,
`it_first_ember_lantern` → `it_ashmothers_coal_cage`, `leg_first_torch` → `leg_heart_of_the_march`).

#### 3.31.2 Dungeon sets (page 12 §21.5) — 16

Page 12 gives each set's intent (its "Set dropped here" line); the brief below is page 12's and is the bonus text
until this page writes final wording (§3.32).

| Set id | Name | Dungeon | Armour | Pieces · slots | Brief (page 12) |
|---|---|---|---|---|---|
| `set_barrowwarden` | Barrowwarden's Rest | `d01_hollow_barrow` | medium | 4 · chest, hands, head, legs | 2: +10% damage to undead · 4: a killing blow on undead heals 4% |
| `set_fenwader` | Fenwader's Tack | `d02_drowned_mill` | light | 4 · legs, chest, head, feet | 2: +20% move in water and mud · 4: breaking a tether / leaving a void zone +10% damage 5 s |
| `set_deepshaft_harness` | Deepshaft Harness (was `set_deepdelver`) | `d03_shaft_seven` | heavy | 4 · chest, shoulders, head, legs | 2: +15% knockback resistance · 4: −20% damage from a soak you stand in |
| `set_kilnbreaker_iron` | Kilnbreaker's Iron | `d04_bellows_keep` | heavy | 4 · hands, chest, head, legs | 2: +10% fire resist · 4: cleared debuff stacks give a 3% barrier each |
| `set_sunglass_regalia` | Sunglass Regalia | `d05_glass_tombs` | cloth | 4 · hands, head, chest, legs | 2: +5% holy and fire damage · 4: beneficial zones double on you |
| `set_oathkeeper_bronze` | Oathkeeper's Bronze | `d06_sandsworn_vault` | medium | 4 · chest, hands, head, legs | 2: +10% curse resist · 4: being dispelled gives +15% haste 5 s |
| `set_thornwarden_bark` | Thornwarden's Bark | `d07_thornheart` | medium | 4 · legs, chest, head, hands | 2: +15% poison/bleed resist · 4: in a beneficial zone +10% damage |
| `set_moonsilver_vigil` | Moonsilver Vigil | `d08_moonwell_ruins` | cloth | 4 · legs, head, chest, hands | 2: +8% damage in Moonless, +8% healing in Moonlit (outside d08: +4% damage in a beneficial zone) · 4: in a donut's safe hole, 10% barrier |
| `set_pitchampion_leathers` | Pit Champion's Leathers | `d09_warmasters_pit` | light | 4 · legs, chest, head, hands | 2: +10% damage while fixated on · 4: dodging through an attack refunds 50% of the roll's cooldown |
| `set_rimewarden_furs` | Rimewarden's Furs | `d10_rimefang_caverns` | medium | 4 · legs, chest, head, hands | 2: +20% Chill/slow resist · 4: in warmth or a beneficial zone +10% damage and healing |
| `set_tidebound_vestments` | Tidebound Vestments | `d11_saltdeep_cathedral` | cloth | 4 · legs, hands, chest, head | 2: interrupts −2 s · 4: an interrupt gives the party +5% damage 6 s |
| `set_unmakers_apron` | The Unmaker's Apron | `d12_unmade_workshop` | medium | 4 · legs, chest, head, hands | 2: +10% damage 4 s after a portal or knock · 4: pass one telegraph unhurt every 20 s |
| `set_firebreaker_plate` | Firebreaker Plate (was `set_emberbane_plate`) | `d13_cindergate` | heavy | 5 · legs, shoulders, hands, head, chest | 2: +15% fire resist · 4: tank-swap stacks give a 2% barrier each · 5: 2+ soakers take −15% |
| `set_reliquary_ash` | Reliquary Ash | `d14_ashen_reliquary` | adaptive | 6 · legs, hands, head, chest, shoulders, waist (Challenge only) | 2: +5% damage and healing in dungeons · 4: allies you revive come back at 60% health · 6: survive the first one-shot each boss fight at 1 health ⚠ |
| `set_kingsfire_regalia` | Kingsfire Regalia (was `set_emberlord_regalia`) | `d15_fire_court` | adaptive | 6 · hands, chest, legs, feet, head, necklace | 2: +8% damage to enemies above 80% health · 4: killing an add refunds 15% of your longest cooldown · 6: every 20 s your next hit brands the target: +10% damage from the party 6 s |
| `set_spirewoven` | Spirewoven Raiment (was `set_veilwoven`) | `d16_the_spire` | adaptive | 6 · hands, shoulders, legs, chest, head, feet | 2: +5% damage and healing, +10% to enemies in the other realm while in the Underside · 4: first ability after crossing a rift +40% · 6: once per 90 s a killing blow slips you into the Underside for 4 s (untargetable, healing 25% a second) |

⚠ `set_reliquary_ash`'s 6-piece conflicts with this page's check 5 (§10.1: nothing may reduce a one-shot
mechanic). Flagged for the owner; page 12's text is not changed here.

#### 3.31.3 World-boss and seasonal uniques (page 13) — 13

Each is 5% of that boss's weekly personal chest (page 13 §5; page 08 §16.5). Page 13 owns the ids, bosses and
powers; names are written out from the id.

| Source | id | Name | Slot | Power | Drops from |
|---|---|---|---|---|---|
| World boss | `uq_griefplate_gauntlets` | Griefplate Gauntlets | heavy hands | blocking gives a 5% armour stack (max 5) | Grief-in-Iron `b_grief_in_iron` (`greyridge`) |
| World boss | `uq_glasswyrm_scale_ring` | Glasswyrm Scale Ring | ring | 5% of damage taken is thrown back as glass shards | the Glass Wyrm `b_glass_wyrm` (`sunscar`) |
| World boss | `uq_brood_silk_wraps` | Brood-Silk Wraps | light hands | your roots last 1 s longer | the Hungering Brood `b_hungering_brood` (`whisperwood`) |
| World boss | `uq_carrion_crown_talons` | Carrion Crown Talons | medium hands | +10% damage to enemies below 30% health | the Carrion Crown `b_carrion_crown` (`cinder_steppe`) |
| World boss | `uq_ruinstone_helm` | Ruinstone Helm | heavy head | standing still 2 s gives 15% damage reduction until you move | the Standing Ruin `b_standing_ruin` (`frostmantle`) |
| World boss | `uq_sallow_crown` | Sallow Crown | head | your curses last 20% longer and heal you for 1% of their damage | the Sallow King `b_sallow_king` (`drowned_coast`) |
| World boss | `uq_unmoored_anchor` | Unmoored Anchor | off hand | immune to knockback and pull for 3 s after taking one (20 s) | the Unmoored `b_unmoored` (`riftmarch`) |
| World boss | `uq_slagborn_core` | Slagborn Core | necklace | −10% fire taken; 10% of it added to your next Fire-tagged hit | Slagborn `b_slagborn` (`kingsfire`) |
| Seasonal | `uq_effigys_candle_eyes` | Effigy's Candle Eyes | head | +5% damage with Fire-tagged skills | the Harvest Effigy `b_harvest_effigy` |
| Seasonal | `uq_stags_lantern` | The Stag's Lantern | necklace (was a light-slot item; same id) | allies within 10 m take 5% less cold damage | the Midwinter Stag `b_midwinter_stag` |
| Seasonal | `uq_tyrants_seed` | Tyrant's Seed | necklace | heals leave a 3 m healing flower | the Bloomtyrant `b_bloomtyrant` |
| Seasonal | `uq_sunwake_scale` | Sunwake Scale | ring | +8% move; +20% in water | the Sunwake Serpent `b_sunwake_serpent` |
| Seasonal | `uq_tearstorm_lens` | Tearstorm Lens (was `uq_veilstorm_lens`) | head | telegraphs that only the other side can see show faintly for you | the Tearstorm Herald `b_tearstorm_herald` |

World-boss **mounts** (1% per chest) are page 13's: `it_mount_mine_crawler`, `it_mount_sand_strider`,
`it_mount_silkfall_spider`, `it_mount_carrion_griffin`, `it_mount_frost_ram`, `it_mount_drowned_horse`,
`it_mount_floating_stone`, `it_mount_magma_salamander`; seasonal `it_mount_haywain_pony`, `it_mount_midwinter_stag`,
`it_mount_bloom_toad`, `it_mount_sunwake_serpent`. Page 13 defines no world-boss-exclusive legendary; its chests
roll this page's world pool (3%, 5% on Ascendant weeks) and `set_trophies_of_the_wild_hunt` (§2.12).

Round 1's **raid sets** (page 13 §9.1), **raid legendaries** (§9.2) and **raid uniques** (§9.3) left this index with
raids; their ids are listed in §10.2 for `WISHLIST.md`.

### 3.32 Duplicates to settle

Pages 09 and 12 were drafted in parallel, and several dungeons got a set (and a secret-boss exclusive) from both.
**Nothing is deleted here.** The "Keep" column follows canon §3: the page that owns the instance owns its loot table.

#### Sets

| Dungeon | This page (§2) | Page 12 | Keep | What happens to this page's set |
|---|---|---|---|---|
| `d01_hollow_barrow` | `set_barrowwarden` "Barrowwarden's Charge" (4, slot-agnostic) | `set_barrowwarden` "Barrowwarden's Rest" (4, medium) | **12** | same id, different set (§3.33 #1); this page's bonus text can become page 12's, since the theme is the same |
| `d02_drowned_mill` | `set_millrace` | `set_fenwader` | **12** | retire from the drop table |
| `d05_glass_tombs` | `set_glasswrights_regalia` (6, cloth) | `set_sunglass_regalia` (4, cloth) | **12** | retire; this page writes 2/4 bonus text for page 12's set |
| `d07_thornheart` | `set_thornstalker` (6, light) | `set_thornwarden_bark` (4, medium) | **12** | retire |
| `d08_moonwell_ruins` | `set_moonwell_vestments` (6, adaptive healer) | `set_moonsilver_vigil` (4, cloth) | **12** | retire; its piece `it_moonwell_circlet` also collides (§3.33 #2) |
| `d09_warmasters_pit` | `set_pitfighters_harness` (6, heavy) | `set_pitchampion_leathers` (4, light) | **12** | retire |
| `d11_saltdeep_cathedral` | `set_saltchoir_raiment` (6, adaptive) | `set_tidebound_vestments` (4, cloth) | **12** | retire |
| `d13_cindergate` | `set_cindergate_bulwark` (6, heavy tank) | `set_firebreaker_plate` (5, heavy) | **12** | retire |

`set_reliquary_keepers` no longer competes with page 12's `set_reliquary_ash`: round 2 moved it to the Depth Cache
of any dungeon (§2.11). After this, the generic catalogue of §2 keeps **6** sets that no other page competes with:
`set_wayfarers_heirlooms`, `set_reliquary_keepers`, `set_trophies_of_the_wild_hunt`, `set_journeymans_harness`,
`set_tearglass_artifice`, `set_mercenary_captains_kit` (+ the Archivist's Regalia). **Follow-up:** write full bonus
text for page 12's 16 sets from their briefs.

#### Secret-boss exclusives (one exclusive legendary per secret boss, page 08 §16.4)

**Settled (round 2): page 12's exclusive is kept for every secret boss**, and this page's round-1 secret-boss
legendaries moved to a normal boss of the same dungeon. §8 has the full table (including `d15`, `d16` and the two
extra rows, `leg_barrowkings_second_crown` and `leg_heart_of_the_glacier`); §6 carries the new sources.

Titles and guaranteed appearances in §8 are not duplicated by page 12 and stay as written.

### 3.33 Collisions

Checked with a grep of every `` `leg_…` ``, `` `uq_…` ``, `` `set_…` `` and `` `soul_…` `` id across `docs/` and
`docs/classes/`. **Exact id collisions** (one id, two different items):

| # | id | Defined in | What differs | Recommended rename |
|---|---|---|---|---|
| 1 | `set_barrowwarden` | 09 §2.3 "Barrowwarden's Charge" · 12 d01 "Barrowwarden's Rest" | name, armour, slots, bonuses | 12 keeps the id; if 09's version survives, `set_barrowwarden_charge` |
| 2 | `it_moonwell_circlet` | 09 §2.7 set piece · page 13 round 1's raid drop (now in the wishlist) | two different items | moot while the raid is parked; if both return, 09's → `it_moonwell_vestments_circlet` |
| 3 | `soul_second_self` **(round 2, settled)** | `classes/chronomancer.md` (jewellery soul) · `classes/mage.md` (chest soul) | two different souls | **applied**: the mage's is `soul_mirrored_self` "Soul of the Mirrored Self"; the chronomancer keeps `soul_second_self` |

**Near-collisions** (different ids, names close enough to confuse a player or a search). Renames are
recommendations; the owner of each item decides. Renames that were forced by the round-2 name rule (ember / veil /
light slot) are already applied and listed in §10.3.

| # | Items | Problem | Recommended rename |
|---|---|---|---|
| 4 | `uq_sextons_spade` (necromancer) · `it_sextons_spade` (12, same boss) | same name, same boss, different items | 12's plain item → `it_sextons_mattock` "Sexton's Mattock" |
| 5 | `leg_counterweight` (fighter) · `leg_counterweight_gauntlets` (09) | same word, both legendaries | 09's → `leg_rebound_gauntlets` "Rebound Gauntlets" |
| 6 | `leg_ironroot_sabatons` (09) · `leg_ironroot_greaves` (runesmith) | both "Ironroot" | 09's → `leg_rootfast_sabatons` "Rootfast Sabatons" |
| 7 | `leg_crown_of_the_hollow_court` (09) · `leg_crown_of_the_hollow_host` (warlock) | one word apart | 09's → `leg_crown_of_the_barrow_court` "Crown of the Barrow Court" |
| 8 | `leg_thunderhead_crown` (09) · `uq_thunderhead` (09) · stormcaller spell "Thunderhead" | three things called Thunderhead | legendary → `leg_brewing_storm_crown` "Crown of the Brewing Storm" |
| 9 | `leg_glasswalkers_robe` (09) · `uq_glasswalker_sceptre` (oracle) | "Glasswalker" twice | oracle's → `uq_glassreader_sceptre` |
| 10 | `leg_sunforged_gauntlets` (09) · `set_pyromancer_sunforged_raiment` | "Sunforged" twice | **applied**: 09's → `leg_noonforged_gauntlets` "Noonforged Gauntlets" |
| 11 | `leg_herald_of_ashes` (12) · `uq_ashen_herald_feather` (round 1, now parked) | moot while the raid is parked | — |
| 12 | `set_fighter_drillmaster`, `leg_the_drillmasters_word` (fighter) · `uq_drillmasters_whistle` (tactician) | "Drillmaster" in two classes | tactician's → `uq_field_marshals_whistle` |
| 13 | `leg_phoenix_feather` (09) · `leg_phoenix_quill` (pyromancer) | both "Phoenix", both cheat death | 09's → `leg_ashborn_feather` "Ashborn Feather" |
| 14 | `set_priest_regalia_of_the_sunken_choir` (priest) | named after a parked raid | **applied by the priest file**: → `set_priest_regalia_of_the_salt_choir` "Regalia of the Salt Choir" |
| 15 | `leg_the_first_flame` (12, d13) · `soul_last_cinder` (pyromancer) · `leg_the_oldest_coal` (12, d14) | three "last fire" items in Kingsfire | none needed; flagged only |
| 16 | `leg_kiln_heart` (12, d15 secret) · `soul_banked_furnace` "Soul of the Banked Furnace" (pyromancer) | same two words, a legendary and a soul | page 12 or the pyromancer file picks; suggested: the soul → `soul_banked_kiln` "Soul of the Banked Kiln" |

---

## 4. Uniques

### 4.1 The world pool (reuse)

`(reuse: prototypes/farhold/data/uniques.json + js/uniques.js + js/foci.js)` — Farhold's 189 uniques
(round 23: 4 per plain weapon type, 2 per element per caster, 2 per armour slot and weight, shield, ward,
quiver, ring, necklace, mount, light, tool; plus five warband uniques from round 27) and the 8 focus uniques
all come to Wildmarch as the **world unique pool** — including the 2 **tool** uniques (the tool slot is back for
Harvesting, page 19) and the 2 **light** uniques, which moved to the necklace (§4.2 rows 61–62). Each drops from
the world pool at the Wildmarch level of its Farhold act:

| Farhold `act` | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| First drops at level | 5 | 14 | 24 | 34 | 44 | 54 |

A unique drops at the level of what dropped it (never below that first level), and its lines scale with
that item level. The five **warband uniques** (`fh_gutterkings_shiv`, `fh_ashtusk_headtaker`, `fh_moonhook`,
`fh_gravemarshals_oath`, `fh_peakbreaker`) drop only from their warband's war camp and warlord (page 10).
In Wildmarch ids the `fh_` prefix becomes `uq_`.

**Pool size:** 189 (Farhold) + 8 (foci) + 12 new slot uniques (§4.2) + 3 more new (round 1) + 9 tag uniques (§4.4) + 4 new tool uniques (§4.5) = **225 uniques**.

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
| 4 | `uq_pyrewright` | Pyrewright | Main hand · sword | 54 | +18 STR, +14 damage | +56–100 health | `fire_trail` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `kingsfire` 3% | *Every stroke leaves the grass alight behind it.* |
| 5 | `uq_stormwake` | Stormwake | Main hand · longsword | 24 | +11 STR, +4.4% life steal | +4–10 damage | `chain_lightning` | world pool from 24; `d05_glass_tombs` bosses 6%; rares in `sunscar` 3% | *Thunder follows it out of the scabbard and finds everyone standing near.* |
| 6 | `uq_tyrants_end` | Tyrant's End | Main hand · longsword | 54 | +18 STR, +96 health | +5–10% crit | `nemesis_hunter` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `kingsfire` 3% | *Forged to end one crowned butcher. It never stopped looking for the next.* |
| 7 | `uq_needle_of_vess` | Needle of Vess | Main hand · rapier | 5 | +6 DEX, +4% crit | +9–17% crit dmg | `stillness` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A duellist's needle. Plant your feet, breathe once, and it finds the gap.* |
| 8 | `uq_riposte_of_glass` | Riposte of Glass | Main hand · rapier | 34 | +14 DEX, +32% crit dmg | +4–8% crit | `glass_heart` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *Thin as a vow and as easily broken. It strikes like a hammer and leaves you nothing to hide behind.* |
| 9 | `uq_winterbite` | Winterbite | Main hand · sabre | 14 | +9 DEX, +8% attack speed | +13–24% crit dmg | `frostbite` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *It numbs before it cuts. Stand against it long enough and you stop moving at all.* |
| 10 | `uq_prism_dancer` | Prism Dancer | Main hand · sabre | 24 | +11 DEX, +54 health | +3.5–7% crit | `alternate_elements` | world pool from 24; `d06_sandsworn_vault` bosses 6%; rares in `sunscar` 3% | *Three flames were quenched in the glass: one red, one pale, and one that crackled.* |
| 11 | `uq_reavers_due` | Reaver's Due | Main hand · axe | 24 | +11 STR, +4.4% life steal | +4–10 damage | `blood_price` | world pool from 24; `d05_glass_tombs` bosses 6%; rares in `sunscar` 3% | *It drinks from both ends of the haft.* |
| 12 | `uq_gorewind` | Gorewind | Main hand · axe | 54 | +18 STR, +96 health | +5–10% crit | `vampire_kill` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `kingsfire` 3% | *Every life it ends pours a little back into the arm that swung it.* |
| 13 | `uq_rendmaw` | Rendmaw | Main hand · greataxe | 14 | +9 STR, +5% crit | +13–24% crit dmg | `quake_slam` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *Heavy enough that every third swing ends in the dirt, and the dirt ends up everywhere.* |
| 14 | `uq_greymarch_headsman` | Greymarch Headsman | Main hand · greataxe | 44 | +16 STR, +38% crit dmg | +4.5–9% crit | `cull` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *The headsman of Greymarch never needed a second stroke.* |
| 15 | `uq_candlemace` | Candlemace | Main hand · mace | 5 | +6 STR, +8% attack speed | +9–17% crit dmg | `pyre_aura` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *Its head still holds the coals of the shrine it was stolen from.* |
| 16 | `uq_bellbreaker` | Bellbreaker | Main hand · mace | 34 | +14 STR, +7% crit | +21–38% crit dmg | `resonance` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *It rings like a struck bell, and louder for every hurt already on its target.* |
| 17 | `uq_anvilheart` | Anvilheart | Main hand · hammer | 14 | +9 STR, +20% crit dmg | +3–6% crit | `quake_slam` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *A smith's hammer that forgot what it was for. The ground remembers.* |
| 18 | `uq_thunderhead` | Thunderhead | Main hand · warhammer | 44 | +16 STR, +38% crit dmg, +30% lightning brand | +4.5–9% crit | `static_charge` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *The storm it was forged in never finished. Strike one thing and the rest of the sky comes down.* |
| 19 | `uq_the_long_scythe` | The Long Scythe | Main hand · greatsword | 14 | +9 STR, +8% attack speed | +13–24% crit dmg | `third_cleave` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *Too long to swing any way but around.* |
| 20 | `uq_grave_harvest` | Grave Harvest | Main hand · greatsword | 24 | +11 STR, +54 health | +3.5–7% crit | `curse_spreads` | world pool from 24; `d06_sandsworn_vault` bosses 6%; rares in `sunscar` 3% | *The blade of the plague-reapers. What it cuts down, it passes on.* |
| 21 | `uq_longwatch_pike` | Longwatch Pike | Main hand · halberd | 14 | +9 STR, +20% crit dmg | +3–6% crit | `frost_skin` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *Northern sentries set it in the snow and let the cold do the rest.* |
| 22 | `uq_the_sentinels_arc` | The Sentinel's Arc | Main hand · halberd | 44 | +16 STR, +16% attack speed | +25–45% crit dmg | `crescendo` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *A gate-guard's polearm. The longer the siege, the harder it answers.* |
| 23 | `uq_boarsplitter` | Boarsplitter | Main hand · spear | 5 | +6 DEX, +4% crit | +9–17% crit dmg | `hemorrhage` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A hunting spear. Anything that runs from it bleeds harder.* |
| 24 | `uq_pilgrim_oak` | Pilgrim Oak | Main hand · quarterstaff | 5 | +6 STR, +8% attack speed | +9–17% crit dmg | `crit_heal` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *Cut from the tree at the crossroads shrine. Travellers swear it mends the walker.* |
| 25 | `uq_the_unbent_reed` | The Unbent Reed | Main hand · quarterstaff | 54 | +18 STR, +14 damage | +56–100 health | `retaliate_nova` | world pool from 54; `d13_cindergate` bosses 6%; rares in `kingsfire` 3% | *Strike its bearer and the winter it was cut in strikes back.* |
| 26 | `uq_hawkfeather` | Hawkfeather | Main hand · bow | 5 | +6 DEX, +14% crit dmg | +2.5–5% crit | `ricochet` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *Its arrows never seem to stop where they should.* |
| 27 | `uq_comets_wake` | Comet's Wake | Main hand · bow | 44 | +16 DEX, +16% attack speed | +25–45% crit dmg | `resonance` | world pool from 44; `d11_saltdeep_cathedral` bosses 6%; rares in `drowned_coast` 3% | *Strung with a thread of cold light, it hits hardest where the hurt is already deep.* |
| 28 | `uq_wasps_nest` | Wasp's Nest | Main hand · shortbow | 14 | +9 DEX, +6 damage | +24–44 health | `venom_stack` | world pool from 14; `d04_bellows_keep` bosses 6%; rares in `greyridge` 3% | *Every shaft is fletched with the wings of something that stings.* |
| 29 | `uq_frostlatch` | Frostlatch | Main hand · crossbow | 24 | +11 DEX, +54 health | +3.5–7% crit | `frostbite` | world pool from 24; `d05_glass_tombs` bosses 6%; rares in `sunscar` 3% | *The mechanism is packed with glacier ice that never melts.* |
| 30 | `uq_ironhail` | Ironhail | Main hand · crossbow | 54 | +18 DEX, +14 damage | +56–100 health | `fourth_volley` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `kingsfire` 3% | *A siege crossbow with four grooves where one should be.* |
| 31 | `uq_longstrider` | Longstrider | Main hand · javelin | 24 | +11 DEX, +4.4% life steal | +4–10 damage | `ricochet` | world pool from 24; `d05_glass_tombs` bosses 6%; rares in `sunscar` 3% | *A scout's javelin that goes where it likes and comes to no harm.* |
| 32 | `uq_cinderquill` | Cinderquill | Main hand · wand (fire) | 5 | +6 INT, +9% spell power | +2.5–5% crit | `kindling` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *A burnt feather set in a tin ferrule. It writes in fire, and the words keep burning.* |
| 33 | `uq_tempest_needle` | Tempest Needle | Main hand · wand (lightning) | 34 | +14 INT, +16% spell power | +4–8% crit | `chain_lightning` | world pool from 34; `d09_warmasters_pit` bosses 6%; rares in `cinder_steppe` 3% | *Thin as a sewing needle. The storm it carries is not.* |
| 34 | `uq_hailcaller` | Hailcaller | Main hand · wand (ice) | 44 | +16 INT, +2.8 resource/s | +11–21% spell power | `twin_bolt` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *Where one hailstone falls, another follows.* |
| 35 | `uq_sootcrown` | Sootcrown | Main hand · staff (fire) | 14 | +9 INT, +11% spell power | +24–44 health | `overload` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *A charred crook topped with a crown of cinders. Every fourth spell it casts comes out enormous.* |
| 36 | `uq_glaciers_spine` | Glacier's Spine | Main hand · staff (ice) | 24 | +11 INT, +6% crit | +8–15% spell power | `shatter` | world pool from 24; `d06_sandsworn_vault` bosses 6%; rares in `sunscar` 3% | *A length of blue ice from the heart of a glacier. What it chills, it breaks.* |
| 37 | `uq_graveshroud_staff` | Graveshroud Staff | Main hand · staff (shadow) | 54 | +18 INT, +58 resource | +29–52% crit dmg | `curse_spreads` | world pool from 54; `d13_cindergate` bosses 6%; rares in `kingsfire` 3% | *Wrapped in burial linen that never rots. Whatever it curses, the curse remembers.* |
| 38 | `uq_marsh_kings_sceptre` | Marsh King's Sceptre | Main hand · scepter (poison) | 5 | +6 INT, +9% spell power | +2.5–5% crit | `venom_stack` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *The mire-king's rod of office. His subjects died slowly, and in order.* |
| 39 | `uq_pale_monarch` | Pale Monarch | Main hand · scepter (ice) | 54 | +18 INT, +21% spell power | +56–100 health | `shatter` | world pool from 54; `d13_cindergate` bosses 6%; rares in `kingsfire` 3% | *A crown of frost on a rod of bone. It rules over what has stopped moving.* |
| 40 | `uq_mirrorsphere` | Mirrorsphere | Main hand · orb (arcane) | 5 | +6 INT, +18 resource | +9–17% crit dmg | `barrier_burst` | world pool from 5; `d02_drowned_mill` bosses 6%; rares in `hearthvale` 3% | *A sphere of mirrors that reflects the world a moment late. Break its guard and it breaks you back.* |
| 41 | `uq_primer_of_echoes` | Primer of Echoes | Main hand · tome (arcane) | 5 | +6 INT, +1.2 resource/s | +5–9% spell power | `echo_cast` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A child's spell primer. Every lesson in it repeats itself.* |
| 42 | `uq_seers_shroud` (was `uq_seers_veil`) | Seer's Shroud | Head · head:cloth | 14 | +4 armour, +7 INT, +5 CON | +7–14 resist all | `overflow` | world pool from 14; `d04_bellows_keep` bosses 6%; rares in `greyridge` 3% | *A shroud of spider-silk worn by the oracles, who never ran out of words.* |
| 43 | `uq_mask_of_the_fox` | Mask of the Fox | Head · head:light | 34 | +9 armour, +11 DEX, +58 health | +2.6–5.2% crit | `kill_frenzy` | world pool from 34; `d09_warmasters_pit` bosses 6%; rares in `cinder_steppe` 3% | *A red-leather mask. Its wearer grows quicker with every kill, and harder to follow.* |
| 44 | `uq_bellhelm` | Bellhelm | Head · head:heavy | 24 | +13 armour, +9 STR, +7 CON | +1.4–2.8 health/s | `retaliate_nova` | world pool from 24; `d06_sandsworn_vault` bosses 6%; rares in `sunscar` 3% | *Strike it and it rings with the cold of the mountain it was forged under.* |
| 45 | `uq_robe_of_the_last_lamp` | Robe of the Last Lamp | Chest · chest:cloth | 5 | +3 armour, +5 INT, +4 CON | +5–10 resist all | `barrier_burst` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *The lamplighters of the old city wore it on the evening the lamps went out.* |
| 46 | `uq_hydra_scale` | Hydra Scale | Chest · chest:medium | 54 | +16 armour, +15 CON, +82 health | +2.3–4.6 health/s | `thornmail` | world pool from 54; `d12_unmade_workshop` bosses 6%; rares in `kingsfire` 3% | *Every scale was cut from a head that grew back. Strike one and it strikes you.* |
| 47 | `uq_bastion_of_kharr` | Bastion of Kharr | Chest · chest:heavy | 44 | +18 armour, +13 STR, +70 health | +2–4 health/s | `second_wind` | world pool from 44; `d11_saltdeep_cathedral` bosses 6%; rares in `drowned_coast` 3% | *The last wall of Kharr, beaten into a breastplate when the city fell.* |
| 48 | `uq_mooncloth_wraps` | Mooncloth Wraps | Legs · legs:cloth | 34 | +6 armour, +11 INT, +58 health | +11–22 resist all | `free_move` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *Cloth woven by moonlight. It never tires, and neither does its wearer.* |
| 49 | `uq_cutpurse_gloves` | Cutpurse Gloves | Hands · hands:light | 5 | +5 armour, +5 DEX, +4 CON | +1.4–2.8% crit | `battle_trance` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *The fingers were worn smooth by a thousand patient thefts.* |
| 50 | `uq_stormgrip` | Stormgrip | Hands · hands:medium | 44 | +14 armour, +13 CON, +70 health | +2–4 health/s | `chain_lightning` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *Copper wire is woven through the mail. Every blow arcs.* |
| 51 | `uq_ashstep_boots` | Ashstep Boots | Feet · feet:light | 34 | +9 armour, +11 DEX, +58 health | +2.6–5.2% crit | `fire_trail` | world pool from 34; `d09_warmasters_pit` bosses 6%; rares in `cinder_steppe` 3% | *Wherever they walk into a fight, the ground catches.* |
| 52 | `uq_marchwarden_boots` | Marchwarden Boots | Feet · feet:medium | 14 | +8 armour, +7 CON, +34 health | +1.1–2.2 health/s | `second_wind` | world pool from 14; `d04_bellows_keep` bosses 6%; rares in `greyridge` 3% | *The boots of a marchwarden who walked home from a massacre.* |
| 53 | `uq_parrys_promise` | Parry's Promise | Off hand · shield | 5 | +6 CON, +11 block power, +5% block | +5–9 armour | `bulwark` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A duellist's buckler, dented in the centre from ten thousand turned blades.* |
| 54 | `uq_aegis_of_last_light` | Aegis of Last Light | Off hand · shield | 44 | +14 CON, +31 block power, +9% block | +13–21 armour | `thornmail` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *The shield of the last paladin of the dawn order. It still punishes the wicked.* |
| 55 | `uq_glimmerward` | Glimmerward | Off hand · ward | 14 | +8 INT, +22 barrier, +3 barrier/s | +8–16 resist all | `barrier_burst` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *A disc of polished crystal. When its ward shatters, so does everything near it.* |
| 56 | `uq_cinderwing_quiver` (was `uq_emberwing_quiver`) | Cinderwing Quiver | Off hand · quiver | 14 | +9 DEX, +5 arrow damage, +8% damage with Projectile Attacks | +3–6% crit | `kindling` (basic attacks only) | world pool from 14; `d04_bellows_keep` bosses 6%; rares in `greyridge` 3% | *The fletchings are phoenix down, or so the seller swore. They do not stop burning.* |
| 57 | `uq_band_of_echoes` | Band of Echoes | Ring · ring | 5 | +5 INT, +5 CON | +1.5–3% crit | `echo_strike` | world pool from 5; `d01_hollow_barrow` bosses 6%; rares in `hearthvale` 3% | *A plain iron band that hums a moment after every blow.* |
| 58 | `uq_signet_of_the_glass_throne` | Signet of the Glass Throne | Ring · ring | 34 | +11 STR, +11 DEX | +3–6% crit | `glass_heart` | world pool from 34; `d08_moonwell_ruins` bosses 6%; rares in `cinder_steppe` 3% | *The seal of a queen who ruled by fear and died by it.* |
| 59 | `uq_pendant_of_wounds` | Pendant of Wounds | Neck · necklace | 14 | +7 CON, +34 health | +6–12% spell power | `resonance` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *A string of old arrowheads, one for every wound its owner survived.* |
| 60 | `uq_veinstone_of_vael` | Veinstone of Vael | Neck · necklace | 44 | +13 CON, +70 health | +11–21% spell power | `crit_ward` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *A red stone that beats. It shields the heart it hangs over.* |
| 61 | `uq_bell_of_morrow` (was `uq_lantern_of_morrow`, light slot) | Bell of Morrow | Neck · necklace | 14 | +7 CON, +28 health | +7–14 resist all | `dread_lantern` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *The bell from a haunted lighthouse. Its toll makes brave things falter.* |
| 62 | `uq_noonstone` (was `uq_sunjar`, light slot) | Noonstone | Neck · necklace | 44 | +13 CON, +58 health | +13–26 resist all | `searing_light` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *A stone that holds noon. Nothing that hates the day can stand near it.* |
| 63 | `uq_brambleback` | Brambleback | Mount · mount | 14 | +7 CON, +8 s gallop | +14–26% less slowing on slopes | `mounted_frenzy` | world pool from 14; `d03_shaft_seven` bosses 6%; rares in `greyridge` 3% | *A bad-tempered moor pony with a scar for every fight it enjoyed.* |
| 64 | `uq_thunderhoof` | Thunderhoof | Mount · mount | 44 | +13 CON, +14 s gallop | +20–35% less slowing on slopes | `stormrider` | world pool from 44; `d10_rimefang_caverns` bosses 6%; rares in `drowned_coast` 3% | *A storm-elk from the high plains. Lightning follows it like a herd.* |
| 65 | `uq_codex_of_tides` | Codex of Tides | Off hand · grimoire focus | 14 | +8 INT, +8% spell power | +15–30 resource | `page_storm` | world pool from 14; `d03_shaft_seven` bosses 6% | *Every page is a sea someone drowned in. Read one aloud and it comes out of the book with you.* |
| 66 | `uq_pilgrims_last_bone` | Pilgrim's Last Bone | Off hand · reliquary focus | 14 | +8 CON, +30 health | +6–12 armour | `sanctuary` | world pool from 14; `d04_bellows_keep` bosses 6% | *The saint walked until only this was left. It is still walking, in a way.* |
| 67 | `uq_knot_of_nine_grudges` | Knot of Nine Grudges | Off hand · effigy focus | 24 | +10 INT, +6 DEX | +6–12% spell power | `hexbound` | world pool from 24; `d06_sandsworn_vault` bosses 6% | *Nine names are tied into the straw. Eight of them have stopped answering.* |
| 68 | `uq_wayworn_cloak` | Wayworn Cloak | Back · cloak | 5 | +4 CON, +20 health | +3–5% dodge | `free_move` | world pool from 5; `d01_hollow_barrow` bosses 6% | *Patched so many times that none of the first cloak is left. It still knows the way home.* |
| 69 | `uq_mantle_of_quiet_ash` | Mantle of Quiet Ash | Shoulders · cloth | 14 | +9 INT, +34 health | +6–12 resist all | `overflow` | world pool from 14; `d04_bellows_keep` bosses 6% | *It smells of a fire that went out politely.* |
| 70 | `uq_ropemakers_knot` | Ropemaker's Knot | Waist · cloth | 14 | +9 INT, +34 health | +10–20% potion power | `second_wind` | world pool from 14; `d03_shaft_seven` bosses 6% | *Tied by someone who expected to be hanging from it.* |
| 71 | `uq_hornbacked_spaulders` | Hornbacked Spaulders | Shoulders · light | 24 | +11 DEX, +46 health | +3–6% crit | `stride` | world pool from 24; `d05_glass_tombs` bosses 6% | *Cut from a beast that never once stood still, and neither will you.* |
| 72 | `uq_cloak_of_the_hunted_stag` | Cloak of the Hunted Stag | Back · cloak | 24 | +11 DEX, +46 health | +3–6% dodge | `kill_frenzy` | world pool from 24; `d06_sandsworn_vault` bosses 6% | *The stag got away. The cloak did not.* |
| 73 | `uq_belt_of_many_pouches` | Belt of Many Pouches | Waist · light | 24 | +11 DEX, +46 health, +1 potion belt charge per slot | +10–20% potion power | `vampire_kill` | world pool from 24; `d05_glass_tombs` bosses 6% | *Eleven pouches. Nine of them are empty. Nobody remembers what was in the tenth.* |
| 74 | `uq_ashfall_standard_cape` | Ashfall Standard Cape | Back · cape | 34 | +14 STR, +58 health | +7–14 resist all | `rally_on_kill` | world pool from 34; `d09_warmasters_pit` bosses 6%; Cinder Steppe war camps 4% | *Cut from a banner that was carried out of Fort Ashfall and never carried back in.* |
| 75 | `uq_girdle_of_the_pit` | Girdle of the Pit | Waist · heavy | 34 | +14 STR, +58 health, +10 armour | +10–20% potion power | `thornmail` | world pool from 34; `d09_warmasters_pit` bosses 6% | *Every notch was a champion. The buckle was the last one.* |
| 76 | `uq_pauldrons_of_the_gatewarden` | Pauldrons of the Gatewarden | Shoulders · heavy | 44 | +16 STR, +70 health, +14 armour | +2–4 health/s | `bulwark` | world pool from 44; `d11_saltdeep_cathedral` bosses 6% | *The gate was stone. The warden was the part that held.* |
| 77 | `uq_shawl_of_the_moonwell` (was `uq_veil_of_the_moonwell`) | Shawl of the Moonwell | Back · cloak | 44 | +16 INT, +70 health | +5–10% healing done | `crit_heal` | world pool from 44; `d10_rimefang_caverns` bosses 6% | *Woven from light that fell into the well and could not climb out.* |
| 78 | `uq_chainmantle_of_the_drowned` | Chainmantle of the Drowned | Shoulders · medium | 54 | +18 CON, +82 health | +2.3–4.6 health/s | `retaliate_nova` | world pool from 54; `d13_cindergate` bosses 6% | *Salt has eaten every link but one. That one is angry about it.* |
| 79 | `uq_studded_belt_of_the_long_watch` | Studded Belt of the Long Watch | Waist · medium | 54 | +18 CON, +82 health | +2.3–4.6 health/s | `crit_ward` | world pool from 54; `d12_unmade_workshop` bosses 6% | *One stud for every day the watch was kept. There are a great many studs.* |

Rows 1–64 are Farhold uniques (reuse); rows 65–67 are Farhold's focus uniques (reuse: `js/foci.js`); rows
68–79 are **new** — uniques for the three new slots (shoulders, back, waist), which Farhold does not have. Every
unique is tradeable (page 08 §15) and may roll sockets and a special rarity (page 08 §5, §13).

### 4.3 Unique changes from Farhold

| Farhold power | Farhold number | Wildmarch | Why |
|---|---|---|---|
| `nemesis_hunter` | +100% damage to rares **and bosses** | +100% to rares and champions, **+25% to bosses** | a five-player boss is the normal game (canon pillar 4), and +100% on the one weapon would make it compulsory |
| `free_move` | +18% move speed | +10% | gear-side move-speed total is 15% (page 08 §5.3) |
| `mounted_frenzy` (Farhold id `rider_fury`, renamed: "Fury" is a banned word), `stormrider` | fight while mounted | kept; only live if page 05 allows mounted fighting (page 20: a hit dazes you off your mount, so in practice they fire on the first hit only) | page 05 |
| `frostbite`, `alternate_elements`, `gravity_bolt` | freeze / pull anything | **bosses cannot be Frozen or pulled**; a boss at 5 Frostbite stacks takes +10% from you for 3 s instead | boss rules (page 11) |
| `cull` | kills ordinary enemies and champions below 10% | unchanged; rares and bosses immune (as in Farhold) | — |
| every power | "ran twice" in Farhold round 23 (the Ingrate's +25% was +56%) | the Wildmarch registry must run each power **once**; a unit test counts calls | lesson kept |

---

### 4.4 Tag uniques (new, round 2)

Uniques whose fixed lines are **tag bonuses** stronger than any affix can roll (page 08 §7.4). Sources are a
dungeon's bosses (6%, shared with that dungeon's other listed uniques) and the world pool from their level.

| # | id | Name | Slot · type | Level | Fixed lines | Random line | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|---|---|
| 80 | `uq_the_wide_hand` | The Wide Hand | Main hand · staff | 30 | +12 INT, **+20% damage with Area Spells** | +8–15% spell power | `wide_hand`: your Area spells cover 15% more radius | world pool from 30; `d08_moonwell_ruins` bosses 6% | *Spread your fingers. Now spread them further.* |
| 81 | `uq_fletchers_last_quiver` | The Fletcher's Last Quiver | Off hand · quiver | 28 | +11 DEX, +6 arrow damage, **+18% damage with Projectile Attacks** | +3–6% crit | `qv_volley` (page 08 §9.3) | world pool from 28; `d07_thornheart` bosses 6% | *He made one more quiver than he had arrows for.* |
| 82 | `uq_bell_of_the_held_note` | Bell of the Held Note | Off hand · grimoire focus | 36 | +14 INT, **+25% damage with Channel** | +15–30 resource | `held_note`: your channels tick 20% faster | world pool from 36; `d09_warmasters_pit` bosses 6% | *Strike it once and it will not stop until you let it.* |
| 83 | `uq_trappers_tally` | The Trapper's Tally | Hands · light | 24 | +11 DEX, +46 health, **+20% damage with Trap** | +3–6% crit | `quick_trap`: your traps arm 50% faster | world pool from 24; `d06_sandsworn_vault` bosses 6% | *Forty notches. The forty-first is always the one that got away.* |
| 84 | `uq_the_long_cold` | The Long Cold | Main hand · wand (ice) | 20 | +10 INT, **+20% damage with Ice Spells** | +6–12% spell power | `long_cold`: your Chills last 2 s longer | world pool from 20; `d05_glass_tombs` bosses 6% | *It was found in a glacier, pointing north.* |
| 85 | `uq_thunder_in_the_bones` | Thunder in the Bones | Ring · ring | 40 | +15 INT, **+15% damage with Lightning Area** | +3–6% crit | `static_charge` (§5) | world pool from 40; `d10_rimefang_caverns` bosses 6% | *Wear it through a storm once. After that, you are the storm's.* |
| 86 | `uq_hymn_of_the_pack` | Hymn of the Pack | Neck · necklace | 32 | +12 CON, +50 health, **+25% damage with Minion** | +10–20% follower might | `pack_hymn`: your minions heal 1% of their health on every hit | world pool from 32; `d09_warmasters_pit` bosses 6% | *Sung under the breath, and only the dogs hear it.* |
| 87 | `uq_the_steady_hand` | The Steady Hand | Main hand · bow | 16 | +9 DEX, **+20% damage with Basic Attacks** | +13–24% crit dmg | `battle_trance` (§5) | world pool from 16; `d04_bellows_keep` bosses 6% | *Draw. Breathe. There is always time for one more breath.* |
| 88 | `uq_marrow_curse` | The Marrow Curse | Off hand · effigy focus | 44 | +16 INT, **+20% effect of Curse** | +6–12% spell power | `shared_curse`: enemies you curse take +5% from your whole party | world pool from 44; `d11_saltdeep_cathedral` bosses 6% | *It is made of something that used to hold someone up.* |

### 4.5 Tool uniques (round 2)

Harvesting tools (page 19 §6). No combat stats; tool affixes only. Sources are world-boss chests (2%) and secret
bosses (2%, Normal and Challenge). Tier = the tool tier it counts as (page 19 §6.1).

| id | Name | Tool · tier | Level | Fixed lines (page 19 tool affixes) | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| `uq_prospectors_pick` | The Prospector's Pick | pick · Blacksteel (T4) | 30 | Prospector's +8, Swift −10% | `prospector` (Farhold): rare-find chance ×2 on mining nodes, and every node you mine shows the nearest node of the same kind on the minimap for 60 s | Grief-in-Iron (`greyridge` world boss); `d03_shaft_seven` secret boss | *It has struck more gold than any man alive, and kept none.* |
| `uq_quick_hands` | Quick Hands | skinning knife · Redsteel (T3) | 20 | Swift −12%, Bountiful +6% | `quick_hands` (Farhold): gathering bars fill 30% faster | the Hungering Brood (`whisperwood` world boss); `d07_thornheart` secret boss | *In and out before the carcass knows it is one.* |
| `uq_greenthumb_sickle` | The Greenthumb Sickle | sickle · Lodestone (T5) | 42 | Keen-eyed +1.5%, Diligent +12% | `greenthumb`: herb nodes you gather respawn for you 50% sooner | the Standing Ruin (`frostmantle`); `d08_moonwell_ruins` secret boss | *Things grow back where it cuts. Faster, and a little annoyed.* |
| `uq_heartwood_hatchet` | Heartwood Hatchet | hatchet · Blacksteel (T4) | 30 | Bountiful +7%, Long-hafted +1 m | `heartwood`: 10% of logging pulls also give a rare heartwood of the node's tier | the Carrion Crown (`cinder_steppe`); `d07_thornheart` secret boss | *Cut from the first tree, to cut the rest.* |
| `uq_anglers_luck` | Angler's Luck | rod · Lodestone (T5) | 42 | Swift −12%, Keen-eyed +1.5% | `anglers_luck`: fish bite 25% sooner; 5% of catches also hold a pearl (a rough gem, page 19) | the Sallow King (`drowned_coast`); `d11_saltdeep_cathedral` secret boss | *Every fish in the Pale Sea knows this line. They bite it anyway.* |
| `uq_salvagers_crowbar` | The Salvager's Crowbar | pry bar · Firegold (T6) | 52 | Bountiful +10%, Steady | `salvager`: salvage piles give +1 engineering part of their tier | Slagborn (`kingsfire`); `d12_unmade_workshop` secret boss | *There is always one more bolt. There is always one more.* |

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
| `overflow` | +2 resource a second (Mana) or +2% regeneration (Momentum / Tempo), and +20% damage while your resource is full |
| `kill_frenzy` | Every kill adds Frenzy for 6 s, up to 5: +8% attack speed and +4% move speed a stack |
| `thornmail` | 40% of the damage you take from each hit is dealt back to the attacker |
| `second_wind` | When a hit leaves you below 30% health, gain a barrier of 35% of maximum health; once every 45 s |
| `free_move` | +10% move speed (changed from +18%) |
| `bulwark` | Every hit you block gives +20% damage for 4 s |
| `crit_ward` | Critical hits give you a barrier worth 20% of the damage dealt, up to 25% of maximum health |
| `dread_lantern` | Every enemy within 8 m of you in a fight is Unnerved and deals 15% less damage |
| `searing_light` | Every 2 s in a fight, enemies within 10 m take 12% of your damage as holy |
| `mounted_frenzy` | +30% damage while mounted; a kill while mounted makes your mount 15% faster for 5 s (inside the riding cap) |
| `stormrider` | While mounted in a fight, every 2 s lightning strikes the nearest enemy within 12 m for 60% of your damage |
| `stride` | +25% damage while you are moving |
| `rally_on_kill` | Every kill rallies you: +20% damage and +15% resistance for 8 s |
| `page_storm` | Every other wand bolt throws a page worth as much as the bolt it follows |
| `sanctuary` | Every blow you take has a 40% chance to be answered by a wide holy burst that leaves the enemies it touches Weakened |
| `hexbound` | Every status you lay lasts twice as long; an enemy carrying 2+ of your statuses takes 30% more from you |
| `wide_hand` | Your Area spells cover 15% more radius (new, §4.4) |
| `held_note` | Your channels tick 20% faster (the same total over a shorter time) (new) |
| `quick_trap` | Your traps arm 50% faster (new) |
| `long_cold` | Your Chills last 2 s longer (new) |
| `pack_hymn` | Your minions heal 1% of their maximum health on every hit they land (new) |
| `shared_curse` | Enemies you curse take +5% damage from your whole party (new; one curse-bearer's bonus at a time) |
| `prospector` | Rare-find chance ×2 on mining nodes; every node you mine shows the nearest node of its kind on the minimap for 60 s (reuse, Farhold tools) |
| `quick_hands` | Gathering bars fill 30% faster (reuse, Farhold tools) |
| `greenthumb` / `heartwood` / `anglers_luck` / `salvager` | the tool powers of §4.5 (new) |

The other round-23 powers used by the rest of the pool (`rot_spread`, `doom`, `mana_burn`, `split_bolt`,
`gravity_bolt`, `opportunist`, `twin_motes`, `archivist`, the 24 Emberveil originals…) come across with
their Farhold sentences unchanged except as §4.3 says. `prospector` and `quick_hands` return on tool uniques (§4.5).

---
## 6. Legendaries (84)

Every legendary: tradeable (page 08 §15), **at most two worn** (page 08 §12.2), stat package per §1. "N / 60" =
Normal item level / the Challenge and Depth copy. Every legendary on a dungeon boss also drops on that dungeon's
Challenge mode and from its Depth Cache (page 12 §2.4.6), so levelling legendaries have a level-60 copy. Round 1's
raid sources became Challenge-mode dungeon sources (was r01 → `d01`, r02 → `d10`, r03 → `d11`, r04 → `d15`, r05 →
`d16`, all item level 60); round 1's raid boss numbers became "any boss" or "end boss" (never the secret boss, §8).

Every legendary is **Legendary** rarity, drawn in violet `#c86bff`. **Secret bosses (§3.32):** page 12 owns every
secret boss's exclusive legendary, so the rows below that used to claim a secret boss now drop from the boss §3.32
names ("moved off the secret boss").

### 6.1 Movement (9)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 1 | `leg_galewalker_treads` | Galewalker Treads | Feet · light | 29 / 60 | Your dodge roll becomes a 7 m jump (from 4 m) with no travel time and 0.4 s untargetable; dodge cooldown −1 s | `d07_thornheart` final | *The wind does not step around things.* |
| 2 | `leg_momentum_greaves` | Momentum Greaves | Legs · heavy | 35 / 60 | Every 5 m you move in a fight adds Momentum (max 10; lost after 1.5 s standing still): +2% damage and +2% move speed each. At 10, your next melee hit knocks a non-boss down for 1 s and spends them | `d09_warmasters_pit` final | *A body in motion tends to end up in someone else's.* |
| 3 | `leg_wayfarers_last_mile` | The Last Mile | Back · cloak | scales, 20+ | +25% run speed out of combat (not with a mount); entering a fight gives +40% move speed for 4 s, once per 20 s | world pool 20+ | *Every road has a last mile. This cloak has walked all of them.* |
| 4 | `leg_ropewalkers_sash` | Ropewalker's Sash | Waist · light | 60 | Your dodge roll has 2 charges; the second recharges in 8 s | `d10_rimefang_caverns` any boss on Challenge | *One step to fall. One step to not.* |
| 5 | `leg_skyhook_grips` | Skyhook Grips | Hands · medium | 60 | Dodging toward an enemy within 12 m of your aim grapples you to it (a 12 m dash that stops in melee range); your next hit within 2 s deals +50%. 6 s cooldown | `d11_saltdeep_cathedral` any boss on Challenge | *Distance is a suggestion.* |
| 6 | `leg_hollowstep_boots` | Hollowstep Boots | Feet · light | 60 | After a dodge you are **Unseen** for 2 s: non-bosses lose track of you unless you are the only one in reach; your next attack from Unseen has +80% critical chance. 12 s cooldown | `d11_saltdeep_cathedral` any boss on Challenge | *Where you were is the loudest place in the room.* |
| 7 | `leg_riverborn_greaves` | Riverborn Greaves | Legs · medium | 44 / 60 | You move at full speed through water, deep snow and ground slows (not boss snares); immune to Root once every 20 s | world boss of `frostmantle` (Ascendant weeks: 60) | *The river never asks the rock for permission.* |
| 8 | `leg_windmill_mantle` | Windmill Mantle | Shoulders · adaptive | 38 / 60 | Sprinting for 3 s in a fight charges a gust: your next dodge pushes enemies within 5 m back 4 m (bosses unmoved) and deals 60% weapon damage | world boss of `cinder_steppe` | *It turns in any weather, and in some weather it turns you.* |
| 9 | `leg_spireclimbers_boots` | Spireclimber's Boots | Feet · adaptive | 60 | Leaving a ledge or dodging off one lets you glide (fall speed −70%, +20% move speed in the air); landing within 3 m of an enemy deals 100% weapon damage within 3 m | `d16_the_spire` any boss on Challenge | *The top of the spire is only a matter of how you come down.* |

### 6.2 Telegraph interaction (11)

These are the legendaries that talk to page 11's vocabulary. None of them may make a **one-shot**
mechanic survivable, and none work on the boss's enrage.

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 10 | `leg_voidwalker_soles` | Voidwalker Soles | Feet · adaptive | 60 | For the first 1.0 s you stand in each **void zone**, it heals you for what it would have dealt; after that it hurts you 20% less | world pool 50+; Depth Cache R 15+, any dungeon (was the `d11` secret boss; page 12's `leg_heart_of_the_tidewife` is that exclusive) | *They step where the dark pools, and the dark forgets to bite.* |
| 11 | `leg_near_miss_band` | Band of the Near Miss | Ring | 60 | When a **danger zone** finishes filling while you stand outside it within 2 m of its edge: **Near Miss**, +30% damage for 5 s (once per 8 s) | `d11_saltdeep_cathedral` any boss on Challenge | *Close only counts in one game, and this is it.* |
| 12 | `leg_soakers_oath` | The Soaker's Oath | Chest · adaptive heavy/medium | 60 | Inside a **soak** circle you count as 2 players; you take 20% more from that soak. 30 s cooldown | `d15_fire_court` any boss on Challenge | *Somebody has to stand in it. Might as well be twice.* |
| 13 | `leg_tetherbreak_torc` | Tetherbreak Torc | Necklace | 60 | **Tethers** on you break at 70% of their normal distance; breaking one gives you a barrier worth 15% of maximum health for 6 s | `d16_the_spire` any boss on Challenge | *Nothing holds what does not want holding.* |
| 14 | `leg_ringwardens_seal` | Ringwarden's Seal | Ring | 60 | If you are inside a **safe zone** when its cast ends, you and every ally inside gain +15% damage for 8 s | `d10_rimefang_caverns` any boss on Challenge | *The ring is small. The promise is not.* |
| 15 | `leg_greenmantle` | Greenmantle | Back · cloak | 31 / 60 | **Beneficial** (green) zones give you 50% more, and stay on you for 3 s after you leave | `d08_moonwell_ruins` final | *Moss grows on the side of you that faces the light.* |
| 16 | `leg_targets_grace` | Target's Grace | Shoulders · adaptive | 60 | While you are **Targeted** (yellow circle), +30% move speed and your circle is 25% smaller | `d15_fire_court` any boss on Challenge | *If it must find you, make it look hard.* |
| 17 | `leg_edge_of_ruin` | The Edge of Ruin | Main hand · greatsword | 60 | Each 0.5 s tick of a **void zone** you take gives +8% damage for 6 s (max 5 stacks, +40%); you take 10% more from void zones | `d16_the_spire` any boss on Challenge | *Every edge is closer to the ruin than the handle.* |
| 18 | `leg_wavebreaker` | Wavebreaker | Off hand · tower shield | 50 / 60 | Blocking a **moving wave** stops it for you and allies within a 3 m cone behind you. 30 s cooldown | world boss of `drowned_coast` | *The sea has one answer. This is the other.* |
| 19 | `leg_silencers_signet` | Silencer's Signet | Ring | 60 | Interrupting a **gold-bordered** cast refunds 50% of your interrupt's cooldown and gives 10% of maximum resource | `d14_ashen_reliquary` final | *The last word is the one never spoken.* |
| 20 | `leg_mirror_of_the_mend` (was `leg_mirror_of_the_veil`) | Mirror of the Mend | Off hand · ward | 60 | Once every 45 s, the first **single-target** spell a boss or rare casts at you is reflected back at it (area spells and ground zones are not) | `d16_the_spire` any boss on Challenge | *Look into it and something else looks out.* |

### 6.3 Pets and followers (6)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 21 | `leg_kennelmasters_whistle` | Kennelmaster's Whistle | Necklace | scales, 20+ | A spectral war hound fights beside you without taking a follower slot: a bite every 1.5 s for 35% weapon damage, 30% of your maximum health, back 20 s after it falls. If you already have a pet, that pet deals +25% instead | world pool 20+ | *Two notes. The dog knows which one means "now".* |
| 22 | `leg_crown_of_the_hollow_court` | Crown of the Hollow Court | Head · adaptive | 60 | Enemies you kill have a 20% chance to rise as a Hollow Courtier for 12 s (max 3): a hit every 1.2 s for 40% weapon damage | `d01_hollow_barrow` end boss on Challenge | *The court still sits. It has simply stopped breathing.* |
| 23 | `leg_brass_familiar` | The Brass Familiar | Shoulders · adaptive | 56 / 60 | A clockwork owl rides your shoulder: every 4 s it marks the lowest-health enemy within 20 m; marked enemies take +10% from your whole group for 4 s | `d12_unmade_workshop` boss 2 (moved off the secret boss, §3.32) | *It was built to watch. Nobody told it what to stop watching.* |
| 24 | `leg_mercenarys_contract` | The Mercenary's Contract | Ring | scales, 20+ | Your followers gain +40% health and +30% damage; while one is within 8 m of you, you take 10% less damage | world pool 20+ | *Terms: everything. Signed: in something darker than ink.* |
| 25 | `leg_bramblemothers_seed` | Bramblemother's Seed | Back · cloak | 33 / 60 | Every 15 s in a fight, a thornling sprouts where you stand for 10 s: it cannot move, taunts non-bosses within 6 m and has 25% of your maximum health | `d07_thornheart` boss 2 (moved off the secret boss, §3.32) | *Plant it anywhere. It will make that anywhere a problem.* |
| 26 | `leg_twin_moth_brooch` (was `leg_twin_moth_lantern`, light slot) | Twin Moth Brooch | Necklace | 32 / 60 | Two moths circle you in a fight, each striking the nearest enemy within 9 m every 2 s for 30% weapon damage as Arcane | world boss of `whisperwood` | *They were drawn to a flame once. Now they are drawn to whatever you are fighting.* |

### 6.4 Procs (12)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 27 | `leg_thunderhead_crown` | Thunderhead Crown | Head · adaptive | 60 | Critical hits have a 20% chance to call lightning on the target: 150% weapon damage to it and 60% to others within 3 m. Once per 3 s | `d10_rimefang_caverns` any boss on Challenge | *It hums before the storm, and the storm is you.* |
| 28 | `leg_cinderwheel` (was `leg_emberwheel`) | The Cinderwheel | Ring | 20 / 60 | Every 8th attack or spell releases 6 fire motes that spiral out to 8 m; each deals 40% of your damage to the first enemy it touches | world boss of `greyridge` | *It turns in the dark and lights nothing but its own path.* |
| 29 | `leg_frostlocke_seal` (was `leg_frostlocke_sigil`) | Frostlocke Seal | Ring | 60 | Slowing an enemy has a 25% chance to Freeze a non-boss for 1.5 s (once per enemy per 10 s); a boss you slow takes +15% from you for 3 s instead | `d10_rimefang_caverns` any boss on Challenge | *Every lock has a key. This one is the cold.* |
| 30 | `leg_harbingers_cowl` | Harbinger's Cowl | Head · cloth | 46 / 60 | Each tick of your damage-over-time effects has a 10% chance to copy that effect onto one enemy within 8 m | `d11_saltdeep_cathedral` final | *It does not bring the plague. It just gets there first.* |
| 31 | `leg_bell_of_nine_echoes` | Bell of Nine Echoes | Necklace | 60 | Every 9th spell you cast goes off again at 100%, free | `d16_the_spire` any boss on Challenge | *Ring it once. It rings nine times. Nobody knows who rings the other eight.* |
| 32 | `leg_storm_anvil` | Storm Anvil | Main hand · hammer | 60 | Every 4th hit discharges chain lightning to 4 enemies within 8 m for 50% | `d01_hollow_barrow` any boss on Challenge | *Struck once, it answers everyone.* |
| 33 | `leg_ravenous_edge` | The Ravenous Edge | Main hand · axe | 60 | Hits on bleeding enemies heal you for 4% of the damage; bleeds you apply last 50% longer | `d01_hollow_barrow` any boss on Challenge | *It has never been fed enough. It has never stopped trying.* |
| 34 | `leg_thousand_needles` | A Thousand Needles | Off hand · quiver | 60 | Every 5th arrow splits into 5 arrows in a 30° fan, 50% damage each | `d15_fire_court` any boss on Challenge | *Count them if you like. They will not wait for you to finish.* |
| 35 | `leg_orrery_of_tides` | Orrery of Tides | Off hand · Seer's Orb focus | 60 | Three stones circle you; a hit on you uses one to absorb 15% of your maximum health. One regrows every 6 s | `d11_saltdeep_cathedral` any boss on Challenge | *The tide goes out. The tide comes in. The stones do not mind which.* |
| 36 | `leg_spark_of_unmaking` | Spark of Unmaking | Main hand · wand | 60 | Wand bolts pierce up to 3 enemies, +20% damage for each enemy already pierced | `d15_fire_court` any boss on Challenge | *It was the first light. It has been undoing things ever since.* |
| 37 | `leg_sunscar_sandglass` | Sunscar Sandglass | Necklace | 26 / 60 | Every 30 s in a fight, time slips: your cooldowns run 100% faster for 3 s | world boss of `sunscar` | *The sand runs up as often as it runs down. It is waiting for you to notice.* |
| 38 | `leg_sovereigns_brand` (was `leg_sovereigns_ember`) | The Sovereign's Brand | Necklace | 60 | Every 20 s your next hit crowns the target with a burning brand: it takes +15% damage from your whole group for 8 s | `d15_fire_court` end boss on Challenge | *Kneel, and it warms you. Stand, and it crowns you.* |

### 6.5 Conditional (9)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 39 | `leg_girdle_of_the_final_notch` (was `leg_last_stand_girdle`, a banned name) | Girdle of the Final Notch | Waist · heavy | 60 | Falling below 35% health gives 6 s of 30% damage reduction and +20% healing received; once per 60 s | `d01_hollow_barrow` any boss on Challenge | *Tighten it one more notch. Then one more.* |
| 40 | `leg_duelists_vow` | The Duelist's Vow | Ring | 25 / 60 | While only one enemy is within 10 m of you: +20% damage and +10% critical chance | `d06_sandsworn_vault` final | *One opponent. One outcome.* |
| 41 | `leg_outnumbered_cloak` | Cloak of the Outnumbered | Back · cloak | 40 / 60 | +4% damage reduction for each enemy within 8 m, up to 5 (20%) | `d10_rimefang_caverns` final | *The more of them there are, the less of them gets through.* |
| 42 | `leg_high_noon_brooch` | High Noon Brooch | Necklace | scales, 20+ | Above 50% health: +12% damage. At or below 50%: +12% damage reduction | world pool 20+ | *It keeps the sun's hours, and the sun is always up.* |
| 43 | `leg_crown_of_first_blood` | Crown of First Blood | Head · adaptive | 60 | Your first hit on each enemy deals +100%; against a boss, the first hit after each phase change | `d11_saltdeep_cathedral` any boss on Challenge | *Everything worth ending starts somewhere.* |
| 44 | `leg_executioners_ledger` | The Executioner's Ledger | Main hand · greatsword or greataxe | 58 / 60 | Against enemies below 20% health your attacks deal +60% and cleave everything within 3 m of the target | `d13_cindergate` final | *Every name in it is crossed out but the next one.* |
| 45 | `leg_opening_gambit` | Opening Gambit | Hands · adaptive | 60 | For the first 4 s of every fight: +50% attack and cast speed | `d10_rimefang_caverns` any boss on Challenge | *The first move is the only one you get to choose.* |
| 46 | `leg_glasswalkers_robe` | Glasswalker's Robe | Chest · cloth | 23 / 60 | While a barrier or shield is on you: +25% spell damage; with none, you take 10% more damage | `d05_glass_tombs` final | *Walk carefully. Everything here is glass, including you.* |
| 47 | `leg_pit_champions_belt` | The Pit Champion's Belt | Waist · heavy | 39 / 60 | Every enemy you hit in the last 5 s adds Crowd (max 10): +3% damage and +2% damage reduction each. At 10 you roar: non-bosses within 8 m flee for 2 s (once per 30 s) | `d09_warmasters_pit` boss 2 (moved off the secret boss, §3.32) | *The crowd chants a name. Today it is yours.* |

### 6.6 On kill (6)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 48 | `leg_carrion_crown` | Carrion Crown | Head · adaptive | 60 | Kills explode: 80% weapon damage as shadow within 5 m, laying **Doom** on everything hit (after 4 s it takes 40% of what you dealt it in those 4 s again) | `d15_fire_court` any boss on Challenge | *What falls under it does not fall alone.* |
| 49 | `leg_reapers_due` | The Reaper's Due | Main hand · halberd | 60 | Each kill gives a Soul for 20 s (max 10): +3% damage each. At 10, your next attack is a full circle for 300% weapon damage and spends them | `d11_saltdeep_cathedral` end boss on Challenge | *Paid in full. Always in full.* |
| 50 | `leg_coal_of_the_pyre_king` (was `leg_ember_of_the_pyre_king`) | Coal of the Pyre King | Ring | 60 | Kills leave a 3 m pyre for 5 s: allies inside +10% haste; enemies inside take 30% of your damage a second as fire | `d16_the_spire` any boss on Challenge | *Every fire is a throne for something.* |
| 51 | `leg_bloodhound_boots` | Bloodhound Boots | Feet · adaptive | scales, 20+ | Kills give 2 s of +50% move speed and reset your dodge cooldown; once per 6 s | world pool 20+ | *They have the scent. You just have to keep up.* |
| 52 | `leg_tithe_collector` | The Tithe Collector | Waist · adaptive | scales, 20+ | Kills restore 3% of maximum health and 5% of maximum resource | world pool 20+ | *A tenth of everything. Every time.* |
| 53 | `leg_skullspire_pauldrons` | Skullspire Pauldrons | Shoulders · adaptive heavy/medium | 60 | Killing a champion, rare or boss gives a Trophy for 5 min: +5% damage, up to 3 | world boss of `kingsfire` | *Room for three more. Always room for three more.* |

### 6.7 On dodge (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 54 | `leg_mirage_silks` | Mirage Silks | Chest · light | 52 / 60 | Dodging leaves a mirage for 3 s that taunts non-bosses within 6 m, then bursts for 100% weapon damage within 4 m | `d12_unmade_workshop` final | *You were never there. It was never you.* |
| 55 | `leg_sidestep_bangle` | Sidestep Bangle | Ring | scales, 20+ | A **perfect dodge** (started within 0.25 s before a hit would land) gives +40% critical chance for 3 s | world pool 20+ | *The blow arrives exactly where you used to be.* |
| 56 | `leg_quickfeather_cloak` | Quickfeather Cloak | Back · cloak | 44 / 60 | Dodge distance +50%; dodge cooldown −25% | `d10_rimefang_caverns` boss 2 (moved off the secret boss, §3.32) | *Plucked from a bird that was never caught.* |
| 57 | `leg_razorwind_greaves` | Razorwind Greaves | Legs · light | 60 | Dodging through an enemy deals 120% weapon damage to it and makes it bleed for 60% over 4 s | `d15_fire_court` any boss on Challenge | *The shortest way past is through.* |
| 58 | `leg_counterweight_gauntlets` | Counterweight Gauntlets | Hands · heavy | 60 | Within 2 s after a dodge, your next melee hit deals +70% and knocks a non-boss down for 1.5 s | `d01_hollow_barrow` any boss on Challenge | *Everything that goes one way comes back the other.* |

### 6.8 Element conversion (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 59 | `leg_heart_of_the_glacier` | Heart of the Glacier | Necklace | 60 | All your damage becomes ice; +10% ice damage; Chilled enemies take a further 10% from you | `d10_rimefang_caverns` boss 3 on Challenge (moved off the secret boss, §3.32) | *It beats once a century. It is beating now.* |
| 60 | `leg_noonforged_gauntlets` (was `leg_sunforged_gauntlets`, §3.33 #10) | Noonforged Gauntlets | Hands · adaptive | 50 / 60 | The physical damage of your weapon attacks becomes holy: +20% against undead and fiends, and it heals you for 2% of the damage | `d11_saltdeep_cathedral` boss 2 (moved off the secret boss, §3.32) | *Hammered at noon on the longest day. They still keep that hour.* |
| 61 | `leg_prism_of_the_seventh_hue` | Prism of the Seventh Hue | Off hand · orb (weapon) | 56 / 60 | Your spells cycle fire → ice → lightning → poison → shadow → arcane, each +15% and applying its status; casting all six within 12 s gives **Prismatic**: +30% damage for 6 s | world boss of `riftmarch` | *There are six colours. The seventh is what they make together.* |
| 62 | `leg_venomheart_ring` | Venomheart Ring | Ring | 29 / 60 | Your damage-over-time effects become poison and may stack twice on one target; poison you apply deals +25% | `d06_sandsworn_vault` boss 2 (moved off the secret boss, §3.32) | *A drop of it would kill a city. Luckily it only ever gives one drop at a time.* |
| 63 | `leg_voidtouched_diadem` | Voidtouched Diadem | Head · adaptive | 60 | 20% of all damage you deal becomes shadow that ignores armour and resistance | `d16_the_spire` end boss on Challenge | *It does not sit on the head. It sits on everything behind it.* |

### 6.9 Cheat death and defence (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 64 | `leg_phoenix_feather` | The Phoenix Feather | Necklace | 60 | A killing blow instead makes you burst into flame: 2 s untargetable, healed to 40%, and 400% weapon damage as fire within 6 m. Once per 180 s (in a dungeon: once per boss fight). Never against a one-shot mechanic (page 11) | `d14_ashen_reliquary` boss 2 (moved off the secret boss, §3.32) | *Ash is only what fire wears between fires.* |
| 65 | `leg_barrowkings_second_crown` | The Barrowking's Second Crown | Head · adaptive | 60 | A killing blow leaves you at 1 health in **Shadow Walk** for 3 s: untargetable, 50% slower, unable to attack or cast. Once per 120 s; never against a one-shot mechanic (page 11) | `d01_hollow_barrow` boss 2 on Challenge (moved off the secret boss, §3.32) | *He had two. He wore the second one for his funeral, and then again after.* |
| 66 | `leg_stoneskin_mantle` | Stoneskin Mantle | Shoulders · adaptive | 60 | A single hit worth more than 30% of your maximum health gives you a barrier of 20% of maximum health for 6 s; 30 s cooldown | `d10_rimefang_caverns` end boss on Challenge | *The mountain does not flinch. It just gets a little more mountain.* |
| 67 | `leg_bulwark_of_ages` | Bulwark of Ages | Off hand · tower shield | 60 | Each block gives 2% damage reduction for 6 s (max 10); at 10, your next block reflects 150% of the blocked hit | `d13_cindergate` boss 2 (moved off the secret boss, §3.32) | *Every dent is a year. It is very, very old.* |
| 68 | `leg_undying_bastion` | The Undying Bastion | Chest · heavy | 60 | Every 10 s in a fight, the next hit that would deal more than 20% of your maximum health deals half | `d16_the_spire` any boss on Challenge | *Walls fall. This one has decided not to.* |

### 6.10 Healing (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 69 | `leg_mercy_bell` | The Mercy Bell | Main hand · sceptre | 35 / 60 | Your heals on allies below 35% health are +40% and give them 15% damage reduction for 4 s | `d08_moonwell_ruins` boss 2 (moved off the secret boss, §3.32) | *It rings only when somebody is about to be saved.* |
| 70 | `leg_wellspring_chalice` | Wellspring Chalice | Off hand · reliquary focus | 60 | Every 5th heal also heals the 3 lowest-health allies within 20 m for 40% of its amount | `d11_saltdeep_cathedral` any boss on Challenge | *It is never empty. It is sometimes afraid of being.* |
| 71 | `leg_shepherds_crook` | The Shepherd's Crook | Main hand · staff | 60 | Your heals on an ally standing in a void zone or a danger zone are +50% | `d15_fire_court` any boss on Challenge | *The flock strays. The crook reaches.* |
| 72 | `leg_lifebinder_thread` | Lifebinder Thread | Ring | 17 / 60 | Your heals link you to the ally you heal most: 10% of the damage they take moves to you, and 10% of the healing you receive is copied to them | `d02_drowned_mill` end boss (moved off the secret boss, §3.32) | *Tie it round two fingers, and two people will never quite be apart.* |
| 73 | `leg_verdant_crown` | The Verdant Crown | Head · adaptive | scales, 20+ | Overhealing plants a seed where the target stands (max 5); an ally who walks over one heals 5% of maximum health | world pool 20+ | *Where it has been, something grows.* |

### 6.11 Tanking (4)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 74 | `leg_grudgekeeper_helm` | Grudgekeeper Helm | Head · heavy | 19 / 60 | Each enemy attacking you within 8 m gives +5% threat and 1% damage reduction (max 10) | `d04_bellows_keep` final | *It remembers every face that swung at it.* |
| 75 | `leg_anvil_of_the_last_gate` | Anvil of the Last Gate | Chest · heavy | 60 | While you hold a boss's attention: +10% armour for each phase change you have held it through (max +30%); lost if you lose it for 3 s | `d16_the_spire` any boss on Challenge | *The gate is gone. The anvil stayed.* |
| 76 | `leg_ironroot_sabatons` | Ironroot Sabatons | Feet · heavy | 23 / 60 | You cannot be knocked back or pulled while standing still; after 2 s standing still, +15% block chance | `d04_bellows_keep` boss 2 (moved off the secret boss, §3.32) | *Stand. Stand. Stand.* |
| 77 | `leg_spitefire_bulwark` | Spitefire Bulwark | Off hand · shield | 60 | Blocked damage is stored; every 6 s, 50% of the store bursts as fire in a 6 m cone ahead of you | `d16_the_spire` any boss on Challenge | *Every blow it takes, it keeps. Then it gives them back.* |

### 6.12 Utility and mounts (5)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 78 | `leg_cartographers_monocle` | The Cartographer's Monocle | Head · adaptive | scales, 20+ | The minimap shows rares, chests and hidden doors within 150 m; +25% gold from chests | world pool 20+ | *Every map is wrong. This one is wrong less.* |
| 79 | `leg_trailblazers_compass` (was `leg_trailblazers_lantern`, light slot) | Trailblazer's Compass | Necklace | 21 / 60 | Secret doors, clue marks and hidden levers within 20 m of you glow (secret-boss trails, page 12); the minimap points to the nearest one within 60 m | `d03_shaft_seven` end boss (moved off the secret boss, §3.32) | *It was carried by someone who went first. It still points the way they went.* |
| 80 | `leg_merchant_princes_signet` | The Merchant Prince's Signet | Ring | scales, 20+ | Vendors sell to you 15% cheaper and repairs cost 50% less | world pool 20+ | *Everybody has a price. This ring knows it.* |
| 81 | `leg_ashwind_stallion` | The Ashwind Stallion | Mount · courser | 60 | **Ash Road** — while you ride, you leave a 2 s fire trail that deals 30% weapon damage a second to enemies crossing it, and knockbacks cannot throw you from the saddle; your first hit within 3 s of dismounting deals +50% in a 4 m ring of fire. Speed comes from your riding rank only (page 08 §24.1) | `d14_ashen_reliquary` Depth Cache R 15+, 0.5% | *It was born in the ash and has never agreed to leave it.* |
| 82 | `leg_mantle_of_the_unburied` (was `leg_candle_of_the_unburied`, light slot) | Mantle of the Unburied | Back · cloak | 12 / 60 | Enemies within 10 m of you take +10% from you and cannot stay hidden; undead within 10 m deal 10% less damage | `d01_hollow_barrow` end boss (moved off the secret boss, §3.32) — the first legendary most players will ever see | *It was sewn for the ones nobody buried. It has a great deal of work.* |

### 6.13 Story-finale legendaries (2 more)

| # | id | Name | Slot · base | ilvl | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 83 | `leg_crown_of_the_ashen_heir` (was `leg_crown_of_the_ember_king`) | Crown of the Ashen Heir | Head · adaptive | 60 | Your attacks and spells on a Burning enemy spread Burning to one more enemy within 6 m; while 5 or more enemies within 20 m burn, +20% damage | `d15_fire_court` boss 2 on Challenge (moved off the secret boss, §3.32) | *The heir is not dead. The heir is merely not wearing it.* |
| 84 | `leg_the_unwritten_page` | The Unwritten Page | Off hand · grimoire focus | 60 | Every 30 s your next spell is **Unwritten**: it costs nothing, its cooldown resets, and it casts again at 60% on up to 2 other enemies within 15 m | `d16_the_spire` boss 2 on Challenge (moved off the secret boss, §3.32) | *Whatever you write on it has already happened.* |

---

## 7. Souls

**(new, round 2)** A soul is a rare socketable that adds **a new behaviour** — written like a legendary power. The
rules are page 08 §13.6: one soul per soul socket, one soul socket per item (Epic or better, item level 30+), at most
**3 souls active**, a soul may require a **socket** (weapon, a named armour slot, jewellery) and a **wearer** (class,
role, build or tag). A soul whose requirement is not met is greyed and does nothing. Every soul is tradeable, and
removing one is safe (page 08 §13.3).

Three families:

| Family | Count | Written in | Requirement |
|---|---|---|---|
| **Generic souls** (§7.2) | 30 | this page | socket, and sometimes a role, build or tag |
| **Class souls** (§7.3) | 60 (2 per class) | `classes/<id>.md` | the class, and a socket |
| **Dungeon souls** (§7.4) | 15 | page 12 (its former trinkets) | a socket |

**Sources, in short** (page 08 §13.6): the boss that lists the soul (Normal 3–4%, Challenge 8%), world-boss chests
(4%, one soul per boss), the Depth Cache (page 12's column), two main-story chapter finales (a pick of three, page
14), calling quest III (class souls), and great luck — any rare level 40+ **1 in 400**, any other open-world kill level
30+ **1 in 50,000** (a generic soul marked "world" below, picked at random).

### 7.1 How a soul reads

`id` · **Name** · *socket* · *wearer* — then the power in full numbers. "WD" = weapon damage, "SP" = spell power (page
05's two power numbers). "ICD" = the internal cooldown: the effect cannot happen again sooner. Every soul says
whether it is **tag-aware** (it adds tags to what it makes). No soul makes a **one-shot** mechanic survivable
(page 11; check 5 of §10.1).

### 7.2 Generic souls (30)

| # | id | Name | Socket | Wearer | Power | Source | Flavour |
|---|---|---|---|---|---|---|---|
| 1 | `soul_falling_star` | Falling Star | weapon | caster build | **Shard of Sky** — 8% of your damaging spells call a falling star onto the target 1.2 s later: **120% SP** as Arcane in a 3 m circle (ICD 2 s). Adds `tag_area` `tag_arcane` | the Glass Wyrm (`sunscar` world boss) 4%; world | *It was aimed at something else. It will do.* |
| 2 | `soul_second_shadow` | Second Shadow | chest | melee build | **Walks Behind** — a shadow copy of you follows 1 m behind and repeats your basic attacks at **25%** as Shadow damage (it cannot be hit and does not count as a minion) | `d08_moonwell_ruins` end boss, Challenge 3%; Depth Cache | *It learned to walk by watching you.* |
| 3 | `soul_widening_ring` | The Widening Ring | any armour | a skill tagged Area equipped | **Ripple** — every 4th Area skill you cast releases a ring that expands to 8 m over 1 s, dealing **60%** of that skill's hit to every enemy it passes (once per enemy). Adds `tag_area` | Depth Cache; world | *Throw one stone. Watch the whole pond answer.* |
| 4 | `soul_hungry_blade` | The Hungry Blade | weapon | melee build | **Fed** — each kill makes your next **3** basic attacks within 6 s deal **+15%** and heal you for **5%** of their damage | `d09_warmasters_pit` end boss, Challenge 3%; world | *It was fed once. It remembers.* |
| 5 | `soul_iron_vow` | The Iron Vow | shield (off hand) | Tank role | **Held to Account** — when you taunt, a white tether joins you to that enemy for 6 s: **20%** of the damage it deals to anyone else is dealt to you instead, and you take **15%** less from it | Grief-in-Iron (`greyridge` world boss) 4% | *Promise it once. It will hold you to it.* |
| 6 | `soul_mercy_river` | Mercy River | necklace | Healer role | **Downstream** — your single-target heals flow on to the lowest-health ally within 12 m for **30%** of the amount | main-story finale pick (the level-50 chapter, page 14); Depth Cache | *Every river finds the lowest ground.* |
| 7 | `soul_quickened_pulse` | Quickened Pulse | ring | any | **Heartbeat** — after you dodge, your next skill within 2 s has **no cast time** (ICD 8 s) | main-story finale pick (the level-30 chapter); world | *Your heart skips. Your hands do not.* |
| 8 | `soul_storm_heart` | Storm Heart | chest | any | **Lightning Rod** — each hit you take stores a Charge (max 10). At 10 you discharge: **150% WD** as Lightning to every enemy within 6 m, and +20% move speed for 3 s. Adds `tag_lightning` `tag_area` | the Carrion Crown (`cinder_steppe` world boss) 4% | *Every blow you take, the sky keeps count.* |
| 9 | `soul_patient_hunter` | The Patient Hunter | weapon | ranged build | **Held Breath** — after 1 s standing still, your next basic attack deals **+50%** and passes through every enemy in a 30 m line | `d10_rimefang_caverns` end boss, Challenge 3%; world | *Wait. Wait. Now.* |
| 10 | `soul_twin_cast` | Twin Cast | weapon | caster build | **The Echoing Slot** — the spell in your **first** spell slot goes off twice (the second at **40%**), and its cooldown is 30% longer | Depth Cache R 15+ | *Say it once for them. Say it again for you.* |
| 11 | `soul_open_road` | The Open Road | feet | any | **Wake of Wind** — your Movement skills and dodges leave a 6 m trail for 4 s; allies on it move **20%** faster | main-story finale pick (the level-30 chapter); world | *The road is only open because someone went first.* |
| 12 | `soul_last_coal` | The Last Coal | chest | any | **Not Yet** — once per 120 s, a killing blow instead leaves you at 1 health, wreathed in fire: you take no damage for 2 s, then heal **25%** of maximum health. Never against a one-shot mechanic | Slagborn (`kingsfire` world boss) 4% | *There is always one coal that does not go out.* |
| 13 | `soul_gravewind` | Gravewind | necklace | any | **Restless** — enemies that die within 8 m of you have a **20%** chance to leave a wisp that flies to the nearest enemy for **80% WD** as Shadow. Adds `tag_shadow` `tag_projectile` | the Sallow King (`drowned_coast` world boss) 4% | *The dead do not stay down near you. They go looking.* |
| 14 | `soul_curse_bearer` | The Curse-Bearer | ring | a skill tagged Curse equipped | **Carried Word** — each curse you lay also lands on one more enemy within 6 m | `d06_sandsworn_vault` end boss, Challenge 3%; world | *Words spoken in anger travel.* |
| 15 | `soul_bond_of_the_pack` | Bond of the Pack | necklace | a skill tagged Minion equipped | **Shared Hide** — your minions (tamed, bound or controlled) take **20%** of the damage you would take, and deal **+15%** | the Hungering Brood (`whisperwood` world boss) 4% | *What one of us bears, all of us bear.* |
| 16 | `soul_trapmakers_knot` | The Trapmaker's Knot | hands | a skill tagged Trap equipped | **Twice Sprung** — each of your traps re-arms once after it triggers, at **60%** | `d07_thornheart` end boss, Challenge 3%; world | *A good trap is patient. A great one is patient twice.* |
| 17 | `soul_channel_anchor` | The Anchor | chest | a skill tagged Channel equipped | **Stand Fast** — while you channel you take **15%** less damage and cannot be knocked back or pulled | the Standing Ruin (`frostmantle` world boss) 4% | *The storm moves around it. It does not move.* |
| 18 | `soul_riposte` | Riposte | weapon or shield | melee build | **Answer** — blocking or parrying a hit strikes back at once for **100% WD** (ICD 3 s) | main-story finale pick (the level-50 chapter) | *Every question deserves an answer.* |
| 19 | `soul_bloodied_crown` | The Bloodied Crown | head | any | **Last Reign** — below 50% health: **+15%** damage and healing; below 25%: also **+10%** life steal | main-story finale pick (the level-50 chapter) | *Wear it well. Wear it bleeding.* |
| 20 | `soul_hollow_echo` | Hollow Echo | head | caster build | **The Phantom Choir** — every 5th spell you cast is repeated by a phantom at your side 0.5 s later at **50%** | the Unmoored (`riftmarch` world boss) 4% | *You are not the only one casting. You never were.* |
| 21 | `soul_frost_lattice` | Frost Lattice | weapon | a skill tagged Ice equipped | **Rime Web** — your Ice hits leave a 3 m lattice of frost for 4 s: enemies inside take **+10%** from your Ice and move **30%** slower (bosses 10%). Adds `tag_area` `tag_duration` | `d10_rimefang_caverns` secret boss 4%; world | *Cold, drawn out one thread at a time.* |
| 22 | `soul_flame_tongue` | Flame Tongue | weapon | a skill tagged Fire equipped | **Ablaze** — **15%** of your Fire hits set the target Ablaze: **150%** of the hit over 3 s, spreading to one enemy within 4 m when it ends. Adds `tag_duration` | `d13_cindergate` end boss, Challenge 3%; world | *It speaks one word, and the word is "more".* |
| 23 | `soul_venom_well` | The Venom Well | ring | a skill tagged Poison equipped | **Burst Bladder** — a poisoned enemy that dies bursts into a 3 m cloud: **40% WD** a second as Poison for 3 s. Adds `tag_area` `tag_duration` | `d02_drowned_mill` end boss, Challenge 3%; world | *The well was poisoned. Now the well poisons.* |
| 24 | `soul_holy_resolve` | Holy Resolve | chest | a skill tagged Holy equipped | **Given Back** — your Holy hits heal the lowest-health ally within 15 m for **8%** of the damage dealt. Adds `tag_heal` | `d11_saltdeep_cathedral` end boss, Challenge 3% | *What the light takes from them it gives to you.* |
| 25 | `soul_quiet_step` | Quiet Step | feet | Damage role | **First Strike** — after 3 s without dealing or taking damage, your first hit deals **+60%** and has +25% critical chance | `d05_glass_tombs` end boss, Challenge 3%; world | *Nobody hears the first step. That is the point of it.* |
| 26 | `soul_warding_mark` | The Warding Mark | head | Support role | **Covered** — every 12 s, your next buff on an ally also gives them a barrier worth **10%** of their maximum health for 6 s. Adds `tag_shield` | main-story finale pick (the level-30 chapter) | *A mark on the brow. A promise that someone is watching.* |
| 27 | `soul_long_memory` | Long Memory | necklace | any | **Grudge** — an enemy takes **+5%** from you for each **different** skill of yours that hit it in the last 10 s (max +25%) | `d14_ashen_reliquary` end boss, Challenge 3%; Depth Cache | *It forgets nothing. It forgives less.* |
| 28 | `soul_tidal_step` | Tidal Step | feet | any | **Undertow** — your dodge roll leaves a wave that pushes non-bosses within 3 m back 3 m and Chills them (−25% move, 3 s) (ICD 6 s). Adds `tag_ice` `tag_area` | `d11_saltdeep_cathedral` secret boss 4% | *Step aside, and the sea steps with you.* |
| 29 | `soul_gilded_hand` | The Gilded Hand | hands | any | **Windfall** — +15% gold find; each kill has a **5%** chance to drop an extra purse worth 5× that kill's gold | `d06_sandsworn_vault` secret boss 4%; world | *Everything it touches is worth a little more. Including you.* |
| 30 | `soul_seekers_eye` | The Seeker's Eye | head | any | **Glint** — +20% item rarity; champions and rares within 60 m show on your minimap | `d03_shaft_seven` end boss, Challenge 3%; world | *It sees the gleam before the gleam knows it is seen.* |


### 7.3 Class souls — index (60)

Each class file writes two souls (the class template, canon §5 item 9). The class file is the owner; this is the
index, re-synced from the class files on 2026-09-30. Requirement: **the class** (a class soul does nothing for another
class), plus the socket shown.

| Class | id | Name | Socket | Source (class file) |
|---|---|---|---|---|
| [Bard](classes/bard.md) | `soul_encore` | Soul of the Encore | chest (armour) | the secret boss `b_the_drowned_moon` of `d08_moonwell_ruins` (Normal or Challenge), 4%; or any monster at 0.02% (great luck) |
| [Bard](classes/bard.md) | `soul_steady_hand` | Soul of the Steady Hand | jewellery (ring or amulet) | quest reward: the Whisperwood story chapter's bard version (page 14); or Depth 15+ final chest, 1% |
| [Chronomancer](classes/chronomancer.md) | `soul_backward_hour` | Soul of the Backward Hour | weapon (staff or wand) | `b_oddrin_the_unmaker`, `d12_unmade_workshop` end boss, Challenge mode (about 1 in 40 kills) |
| [Chronomancer](classes/chronomancer.md) | `soul_second_self` | Soul of the Second Self | jewellery (neck or ring) | world boss `b_standing_ruin` (page 13), or a Depth 15+ end chest (rare roll) |
| [Cleric](classes/cleric.md) | `soul_overflowing_font` | The Overflowing Font | weapon | `d11_saltdeep_cathedral` final boss, 3% Normal / 8% Challenge |
| [Cleric](classes/cleric.md) | `soul_sun_at_your_back` | The Sun at Your Back | jewellery (necklace or ring) | quest reward from `q_calling_cleric_3` (first completion), or 1-in-400 from any rare monster level 40+ |
| [Demon Hunter](classes/demon_hunter.md) | `soul_hunters_eye` | Soul of the Hunter's Eye | weapon | the secret boss `b_the_finished_thing` of `d12_unmade_workshop` (Normal or Challenge), 4%; or any Demon at 0.02% (great luck) |
| [Demon Hunter](classes/demon_hunter.md) | `soul_iron_patience` | Soul of Iron Patience | jewellery (ring or amulet) | quest reward: the Riftmarch story chapter's demon-hunter version (page 14); or Depth 15+ final chest, 1% |
| [Dragon Knight](classes/dragon_knight.md) | `soul_old_wyrm` | Soul of the Old Wyrm | weapon | `b_slagborn` world boss (2%); end chest at **Depth 15+** (1%) |
| [Dragon Knight](classes/dragon_knight.md) | `soul_scale_warden` | Soul of the Scale Warden | armour — shield | `b_rimefang` (`d10_rimefang_caverns` end boss) on Challenge (3%); `b_standing_ruin` The Standing Ruin (Frostmantle world boss, 2%) |
| [Druid](classes/druid.md) | `soul_grove_mother` | Soul of the Grove Mother | armour — chest | end chest at **Depth 15+** (1%); `b_standing_ruin` world boss (2%) |
| [Druid](classes/druid.md) | `soul_turning_season` | Soul of the Turning Season | jewellery — ring | `b_oruvel_moon_drinker` (`d08_moonwell_ruins` end boss) on Challenge (3%); `b_hungering_brood` world boss (2%) |
| [Enchanter](classes/enchanter.md) | `soul_hall_of_faces` | Soul of the Hall of Faces | armour — chest | `b_the_sporefather` The Sporefather (`d07_thornheart` boss 1) on Challenge, 3%; end chest at **Depth 10+**, 1% |
| [Enchanter](classes/enchanter.md) | `soul_puppet_master` | Soul of the Puppet Master | weapon | `b_the_tithe_below` (`d02_drowned_mill` secret boss) on Challenge, 3%; the world boss of `whisperwood` (`b_hungering_brood`), 2% |
| [Fighter](classes/fighter.md) | `soul_drill_sergeant` | Soul of the Drill Sergeant | weapon | end chest at **Depth 15+** (1%); world boss of `frostmantle` (page 13, 2%) |
| [Fighter](classes/fighter.md) | `soul_open_guard` | Soul of the Open Guard | armour — chest | `d09_warmasters_pit` final boss on Challenge (3%); world boss of `cinder_steppe` (page 13, 2%) |
| [Knight](classes/knight.md) | `soul_bannerlords_heart` | Soul of the Bannerlord's Heart | chest | `b_carrion_crown` (world boss), 2%; `b_the_great_bellows` (page 12), Challenge mode, 4% |
| [Knight](classes/knight.md) | `soul_oathkeeper` | Soul of the Oathkeeper | shield | `b_castellan_vorhane` (`d13_cindergate`), Challenge mode, 4%; any Depth 15+ end chest, 0.5% |
| [Mage](classes/mage.md) | `soul_mirrored_self` | Soul of the Mirrored Self | chest (armour) | the secret boss `b_the_tidewife` of `d11_saltdeep_cathedral` (Normal or Challenge), 4%; or any monster at 0.02% (great luck) |
| [Mage](classes/mage.md) | `soul_three_suns` | Soul of Three Suns | weapon | quest reward: the Riftmarch story chapter that ends at `d12_unmade_workshop` (page 14), Mage version of the reward; or Depth 15+ final chest, 1% |
| [Monk](classes/monk.md) | `soul_returning_breath` | Soul of the Returning Breath | weapon (quarterstaff or wraps) | `b_the_unmined` (page 12), Challenge mode, 4%; Depth 15+ end chests, 0.5% |
| [Monk](classes/monk.md) | `soul_still_pond` | Soul of the Still Pond | neck or ring | `b_sallow_king` The Sallow King (world boss, page 13), 2% |
| [Necromancer](classes/necromancer.md) | `soul_bone_mender` | Soul of the Bone Mender | jewellery (ring or amulet) | quest reward: the Quiet Wake's Drowned Coast chapter, necromancer version (page 14); or Depth 15+ final chest, 1% |
| [Necromancer](classes/necromancer.md) | `soul_the_unquiet_hand` | Soul of the Unquiet Hand | weapon | the secret boss of `d01_hollow_barrow` (Normal or Challenge), 5%; or any Undead monster at 0.02% (great luck) |
| [Oracle](classes/oracle.md) | `soul_doomsayer` | Soul of the Doomsayer | weapon | end chest at **Depth 15+** (1%); `b_sallow_king` world boss (2%) |
| [Oracle](classes/oracle.md) | `soul_second_sight` | Soul of Second Sight | armour — head | `b_ithar_the_unseen` Prince Ithar, the Unseen (`d05_glass_tombs` secret boss) on Challenge (3%); `b_glass_wyrm` world boss (2%) |
| [Paladin](classes/paladin.md) | `soul_rising_tide` | Soul of the Rising Tide | weapon | `d11_saltdeep_cathedral` final boss (Normal 1%, Challenge 4%) |
| [Paladin](classes/paladin.md) | `soul_sworn_ground` | Soul of Sworn Ground | chest | **Challenge-mode `d13_cindergate` final boss, 3%**, and Depth 10+ end chests, 0.5% |
| [Priest](classes/priest.md) | `soul_lamplighter` | Soul of the Lamplighter | jewellery (neck or ring) | `b_first_sleeper` The First Sleeper (`d01_hollow_barrow` secret boss) on Challenge, 3%; the world boss of `frostmantle` (`b_standing_ruin`), 2% |
| [Priest](classes/priest.md) | `soul_mourning_bell` | Soul of the Mourning Bell | weapon | end chest at **Depth 15+**, 1%; `b_ashmother_veyra` (`d14_ashen_reliquary` secret boss) on Challenge, 3% |
| [Pyromancer](classes/pyromancer.md) | `soul_banked_furnace` | Soul of the Banked Furnace | armour — chest | `b_the_sand_sovereign` The Sand Sovereign (`d06_sandsworn_vault` end boss) on Challenge (3%); `b_glass_wyrm` world boss (2%) |
| [Pyromancer](classes/pyromancer.md) | `soul_last_cinder` | Soul of the Last Cinder | weapon | `b_slagborn` world boss (2%); end chest at **Depth 15+** (1%) |
| [Ranger](classes/ranger.md) | `soul_blood_trail` | Blood Trail | weapon (bow, crossbow, javelin) | `d10_rimefang_caverns` final boss on Challenge (5%), or any beast-family Rare in the open world (1 in 2,000) |
| [Ranger](classes/ranger.md) | `soul_shared_breath` | Shared Breath | jewellery (necklace or ring) | the world boss of `frostmantle` (page 13), 3% per weekly kill; or Depth 20+ end chests |
| [Rogue](classes/rogue.md) | `soul_carried_tally` | The Carried Tally | jewellery (ring or neck) | the world boss of `sunscar` (page 13), 5% per kill once a week |
| [Rogue](classes/rogue.md) | `soul_turned_head` | The Turned Head | weapon | `d12_unmade_workshop` final boss, 3% on Normal / 8% on Challenge |
| [Runesmith](classes/runesmith.md) | `soul_clan_elder` | Soul of the Clan Elder | armour — shield or chest | `b_bellamund_the_cold_smith` (`d04_bellows_keep` secret boss) on Challenge, 3%; the world boss of `greyridge`, 2% |
| [Runesmith](classes/runesmith.md) | `soul_unbroken_anvil` | Soul of the Unbroken Anvil | weapon | end chest at **Depth 15+**, 1%; `b_first_flame_of_the_gate` (`d13_cindergate` secret boss) on Challenge, 3% |
| [Scavenger](classes/scavenger.md) | `soul_ricochet_kettle` | Soul of the Ricochet Kettle | weapon | the secret boss of `d04_bellows_keep` (Normal or Challenge), 5%; or any monster at 0.02% (great luck) |
| [Scavenger](classes/scavenger.md) | `soul_second_pocket` | Soul of the Second Pocket | waist (armour) | quest reward: the Sunscar story chapter's scavenger version (page 14); or Depth 15+ final chest, 1% |
| [Shadow Dancer](classes/shadow_dancer.md) | `soul_final_bow` | Soul of the Final Bow | weapon | end chest at **Depth 15+**, 1%; the world boss of `riftmarch` (`b_unmoored`), 2% |
| [Shadow Dancer](classes/shadow_dancer.md) | `soul_masked_partner` | Soul of the Masked Partner | armour — chest | `b_first_sleeper` The First Sleeper (`d01_hollow_barrow` secret boss) on Challenge, 3%; end chest at **Depth 10+**, 1% |
| [Shaman](classes/shaman.md) | `soul_crane_who_stayed` | Soul of the Crane Who Stayed | neck or ring | `b_sallow_king` The Sallow King (world boss, page 13), 2%; `b_the_tidewife` (page 12), Challenge mode, 4% |
| [Shaman](classes/shaman.md) | `soul_ox_thunder_stride` | Soul of the Ox's Thunder Stride | weapon (staff or sceptre) | `b_standing_ruin` The Standing Ruin (world boss, page 13), 2%; Depth 15+ end chests, 0.5% |
| [Sorcerer](classes/sorcerer.md) | `soul_loaded_bones` | Soul of the Loaded Bones | weapon | `b_the_tithe_below` (`d02_drowned_mill` secret boss) on Challenge, 3%; end chest at **Depth 15+**, 1% |
| [Sorcerer](classes/sorcerer.md) | `soul_lucky_patron` | Soul of the Lucky Patron | jewellery (neck or ring) | the world boss of `whisperwood` (page 13), 2%; end chest at **Depth 10+**, 1% |
| [Stormcaller](classes/stormcaller.md) | `soul_forked_sky` | Soul of the Forked Sky | weapon | end chest at **Depth 15+** (1%); `b_carrion_crown` The Carrion Crown (Cinder Steppe world boss, 2%) |
| [Stormcaller](classes/stormcaller.md) | `soul_grounding_rod` | Soul of the Grounding Rod | armour — legs | `b_the_gravity_engine` (`d12_unmade_workshop` main boss) on Challenge (3%); `b_unmoored` world boss (2%) |
| [Swashbuckler](classes/swashbuckler.md) | `soul_last_bow` | Soul of the Last Bow | armour — chest | `b_warmaster_drogath` (`d09_warmasters_pit` end boss) on Challenge (3%); `b_sallow_king` world boss (2%) |
| [Swashbuckler](classes/swashbuckler.md) | `soul_spotlight` | Soul of the Spotlight | jewellery — necklace | end chest at **Depth 15+** (1%); `b_glass_wyrm` The Glass Wyrm (Sunscar world boss, 2%) |
| [Tactician](classes/tactician.md) | `soul_standing_orders` | Soul of Standing Orders | weapon (crossbow or spear) | `b_warmaster_drogath` (`d09_warmasters_pit`), Challenge mode, 4% chance; any Depth 15+ end chest, 0.5% |
| [Tactician](classes/tactician.md) | `soul_unbroken_standard` | Soul of the Unbroken Standard | off hand (shield) | `b_queen_ammarel` (page 12), Challenge mode, 4%; `b_standing_ruin` (world boss), 2% |
| [Tinker](classes/tinker.md) | `soul_field_surgeon` | Soul of the Field Surgeon | armour — chest | the world boss of `sunscar` (`b_glass_wyrm`, page 13), 2%; end chest at **Depth 15+**, 1% |
| [Tinker](classes/tinker.md) | `soul_spare_parts` | Soul of Spare Parts | weapon | `b_the_unmined` The Unmined (`d03_shaft_seven` secret boss) on Challenge, 3%; end chest at **Depth 10+**, 1% |
| [Warlock](classes/warlock.md) | `soul_creeping_debt` | Soul of Creeping Debt | weapon | quest reward: the Kingsfire story chapter's warlock version (page 14); or Depth 15+ final chest, 1% |
| [Warlock](classes/warlock.md) | `soul_second_signature` | Soul of the Second Signature | chest (armour) | the secret boss of `d13_cindergate` (Normal or Challenge), 4%; or any Demon at 0.02% (great luck) |
| [Warrior](classes/warrior.md) | `soul_stonebound_oath` | Stonebound Oath | armour: chest or shield | `d10_rimefang_caverns` final boss, 3% on Normal / 8% on Challenge |
| [Warrior](classes/warrior.md) | `soul_thrown_gauntlet` | The Thrown Gauntlet | weapon | quest reward from `q_calling_warrior_3` (first completion), or 1-in-400 from any rare monster level 40+ |
| [Witch Hunter](classes/witch_hunter.md) | `soul_quiet_writ` | Soul of the Quiet Writ | neck or ring | `b_sallow_king` The Sallow King (world boss, page 13), 2% |
| [Witch Hunter](classes/witch_hunter.md) | `soul_tribunal_bell` | Soul of the Tribunal Bell | weapon (crossbow) | `b_the_ash_scribe` (page 12), Challenge mode, 4%; Depth 15+ end chests, 0.5% |

The mage's soul is `soul_mirrored_self` and the chronomancer keeps `soul_second_self` (the round-2 collision is
settled, §3.33 #3). The shaman's `soul_heron_who_stayed` is now `soul_crane_who_stayed` (the Rain Crane). Class
souls whose socket is the waist or a shield use the round-2 rule that soul sockets can sit in any armour slot and
the off hand (page 08 §2.1).

### 7.4 Dungeon souls (15)

Page 12 owns these (§21.4): 14 of its former **trinkets** became dungeon souls (the fifteenth, The Finished Thing,
became a hands legendary) and the Fire King gives a new one, The King's Offer. Each drops from the boss that lists
it (4% Normal, 8% Challenge, page 08 §16.2). The rows, with page 12's sockets and wording, are in §3.31.1 (marked
**Soul**):

`soul_stonegullets_gizzard` (d03) · `soul_slag_heart` (d04) · `soul_brood_mothers_gilt` (d05) ·
`soul_the_stolen_oath` (d06) · `soul_seed_of_the_sovereign` (d07) · `soul_ogras_whistle` (d09) ·
`soul_hibernation` (d10) · `soul_the_full_church` (d11) · `soul_perpetual_cog` (d12) ·
`soul_oddrins_last_letter` (d12) · `soul_varrows_key` (d13) · `soul_gate_key` (d13) · `soul_four_doors` (d14) ·
`soul_the_kings_decree` (d14) · `soul_the_kings_offer` (d15).

---

## 8. Secret-boss exclusive drops

Page 08 §16.4: every dungeon secret boss has an exclusive legendary (10% every run on Normal, 15% once a week on
Challenge, and a quarter of the Depth Cache's legendary column), plus one guaranteed appearance on the first kill.
Page 12 owns how each secret boss is found **and names its exclusive** (§3.31.1). This page's round-1 secret-boss
legendaries now drop from the normal boss in the fourth column (§3.32); the mount and appearance columns are this
page's.

| Dungeon | Secret boss | Exclusive legendary (page 12) | This page's legendary, moved to | Mount | Guaranteed appearance (a look for the wardrobe) |
|---|---|---|---|---|---|
| `d01_hollow_barrow` | `b_first_sleeper` | `leg_first_sleepers_shroud` | `leg_mantle_of_the_unburied` → end boss; `leg_barrowkings_second_crown` → boss 2 on Challenge | — | Barrow-Candle Hood |
| `d02_drowned_mill` | `b_the_tithe_below` | `leg_ledger_of_the_deep` | `leg_lifebinder_thread` → end boss | — | Millwheel Buckler look |
| `d03_shaft_seven` | `b_the_unmined` | `leg_heart_of_the_unmined` | `leg_trailblazers_compass` → end boss | — | Shaft Seven Miner's Helm look |
| `d04_bellows_keep` | `b_bellamund_the_cold_smith` | `leg_the_cold_anvil` | `leg_ironroot_sabatons` → boss 2 | — | Bellows-Forged Pauldrons look |
| `d05_glass_tombs` | `b_ithar_the_unseen` | `leg_the_unseen_prince` | — | `it_mount_dune_sabrecat` (20%, page 12 and page 08 §24.3 agree) | Glass Pharaoh's Mask look |
| `d06_sandsworn_vault` | `b_tamar_the_first` | `leg_water_of_tamar` | `leg_venomheart_ring` → boss 2 | — | Sandsworn Shroud look |
| `d07_thornheart` | `b_gall_sovereign` | `leg_wyllows_gratitude` | `leg_bramblemothers_seed` → boss 2 | — | Thornwreath Crown look |
| `d08_moonwell_ruins` | `b_the_drowned_moon` | `leg_the_moon_returned` | `leg_mercy_bell` → boss 2 | — | Moonlit Robe look |
| `d09_warmasters_pit` | `b_old_gnash_undefeated` | `leg_the_undefeated` | `leg_pit_champions_belt` → boss 2 | — | Pit Champion's Helm look |
| `d10_rimefang_caverns` | `b_old_mother_rime` | `leg_mothers_last_winter` | `leg_quickfeather_cloak` → boss 2; `leg_heart_of_the_glacier` → boss 3 on Challenge | — | Rimefang Pelt Cloak look |
| `d11_saltdeep_cathedral` | `b_the_tidewife` | `leg_heart_of_the_tidewife` | `leg_noonforged_gauntlets` → boss 2; `leg_voidwalker_soles` → world pool 50+ and Depth Cache R 15+ | — | Drowned Choirmaster's Stole look |
| `d12_unmade_workshop` | `b_the_finished_thing` | `leg_the_finished_thing` | `leg_brass_familiar` → boss 2 | — | Clockwork Goggles look |
| `d13_cindergate` | `b_first_flame_of_the_gate` | `leg_the_first_flame` | `leg_bulwark_of_ages` → boss 2 | — | Cindergate Tower Shield look |
| `d14_ashen_reliquary` | `b_ashmother_veyra` | `leg_the_oldest_coal` | `leg_phoenix_feather` → boss 2 | — | Ashen Reliquarist's Mantle look |
| `d15_fire_court` | `b_ysa_varn_kindled` | `leg_kiln_heart` | `leg_crown_of_the_ashen_heir` → boss 2 on Challenge | `it_mount_glass_charger` (2%, page 12) | page 12's |
| `d16_the_spire` | `b_marchheart` | `leg_heart_of_the_march` (guaranteed once per account), `leg_dream_of_the_march` | `leg_the_unwritten_page` → boss 2 on Challenge | `it_mount_marchheart_colossus` (2%, page 12) | page 12's |

---

## 9. Where Emberveil's and Farhold's sets went

`prototypes/emberveil/data/items.json` has 54 sets: **24 generic** (Iron Brigade, Order of the Eclipse,
Architect's Vestments, Dragon-Lord's Aspect…) and **30 class sets**, exactly one per class. Farhold adds
The Archivist's Regalia (`js/foci.js`).

| Source set | In Wildmarch |
|---|---|
| The 30 Emberveil class sets | offered to the class agents as starting themes (§3); their names are original and free to reuse |
| The 24 Emberveil generic sets | **retired** — they were 2–5-piece sets tuned for a six-hero auto-battle party with travel powers (`camp_mend`, `road_cache` and a camp ambush ward). Their legendary effects survive as powers (page 08 §1) |
| The Archivist's Regalia (wand + grimoire + robe) | kept as a **class-neutral caster set** for the world pool: 3 pieces, 2-piece +6 INT and +5% spell power, 3-piece "every 4th spell is free and goes off twice for half" (reuse, Farhold numbers). Drops from caster rares from level 24 at the Set rate (not counted in the 14 above) |

---

## 10. Counts, checks and what left

### 10.1 Counts and checks

| Item kind | Required | Written here |
|---|---|---|
| Generic sets | ≥ 12 | **14** (+ The Archivist's Regalia carried over) |
| Generic legendaries | ≥ 60 | **84** |
| Generic uniques | ≥ 40 | **94 headline** (64 Farhold + 3 Farhold foci + 12 new slot uniques + 9 tag + 6 tool) in a **225** pool |
| Generic souls | ~30 | **30** (§7.2) |
| Secret-boss exclusives | every dungeon secret boss | **16 / 16**, all page 12's (§8); this page's old ones moved to normal bosses |
| Class sets / legendaries / uniques / souls | class files | **74 / 142 / 109 / 60** indexed (§3, §7.3) |
| Dungeon-exclusive (page 12) | indexed here | **84 uniques + 36 legendaries + 15 souls + 16 sets** (§3.31) |
| World boss and seasonal (page 13) | indexed here | **13 uniques** + the Wild Hunt set (§2.12) |
| Grand total | — | **105 sets · 262 legendaries · 431 uniques · 105 souls** (97 sets if §3.32 is followed) |
| Duplicates / collisions | none | **8 set pairs** (§3.32; the secret-boss pairs are settled); **2 open exact id collisions + 13 near-collisions** (§3.33) |

Checks for whoever builds `data/items/*.json` from this page (page 16):

1. Every item here has a source (canon rule 4). A test walks sets, legendaries, uniques and souls and fails on an
   empty `sources`.
2. No dungeon boss lists more than one **generic** legendary (it keeps the loot table readable); class legendaries
   from class files may add to it.
3. Every legendary, unique and soul power id resolves in the effect registry and its card sentence is generated
   from the constants (Farhold `describe()`), never typed.
4. Every set has exactly as many pieces as its top bonus, and no two pieces of one set share a slot unless both are
   rings.
5. No legendary, set bonus or soul reduces a **one-shot** mechanic (page 11) — a test marks those mechanics and
   asserts nothing on this page lowers their damage.
6. Every soul's `socket` is a slot that can hold a soul socket (page 08 §2.1) and its `requires` names a real class,
   role, build or tag (page 05).
7. No item name or id contains "ember" or "veil" (canon rule 10), and no item uses the light slot (canon §4).
8. No id is defined twice (§3.33 lists the known ones until they are renamed).

### 10.2 What left in round 2 (for `WISHLIST.md`)

Raids and PvP are parked in `WISHLIST.md` (canon W1, W6). These ids are **kept** there, unchanged, so a later
version can restore them:

| Kind | Ids |
|---|---|
| Generic raid sets (this page, round 1) | `set_barrowkings_tithe`, `set_rimecrown_regalia`, `set_choir_of_the_deep`, `set_court_of_embers`, `set_veilborn_ascendance` — with their pieces `it_barrowking_*`, `it_rimecrown_*`, `it_deepchoir_*`, `it_ember_courtier_*`, `it_veilborn_*` |
| PvP set | `set_open_field_vanguard` (pieces `it_vanguard_*`) |
| Raid sets (page 13, round 1) | `set_ninefold_oath`, `set_rimebound_court`, `set_drowned_choir` |
| Raid legendaries (page 13, round 1) — 10 | `leg_crown_of_the_ninth`, `leg_kingsblade_of_hrodric`, `leg_marrow_reliquary`, `leg_heart_of_the_sleeper`, `leg_ysmeres_long_winter`, `leg_windmothers_last_feather`, `leg_the_unsung_note`, `leg_choirmasters_ninth_eye`, `leg_grimwaters_last_broadside`, `leg_starless_scale` |
| Raid uniques (page 13, round 1) — 19 | `uq_votive_of_the_last_sister`, `uq_sextons_lantern`, `uq_gravewarden_oathband`, `uq_gullet_of_the_rotmaw`, `uq_ossuary_bonewraps`, `uq_hailwrights_tongs`, `uq_councils_three_rings`, `uq_rimefang_collar`, `uq_whiteout_lantern`, `uq_glacier_throne_signet`, `uq_brinecoil_fang`, `uq_abbess_bell_staff`, `uq_pearl_and_nacre`, `uq_cantors_tuning_fork`, `uq_saltbound_knuckles`, `uq_brandts_champion_plume`, `uq_ashen_herald_feather`, `uq_anvarr_heartstone`, `uq_curators_ledger` |

A restored raid version should rename every "ember" / "veil" id above first (canon rule 10). The r04 / r05 items that
page 12 rebuilt for `d15_fire_court` and `d16_the_spire` (`set_kingsfire_regalia`, `set_spirewoven`, `leg_firewing_pinion`,
`leg_crown_of_kaedros`, `leg_kiln_heart`, `leg_heart_of_the_march`, `leg_dream_of_the_march`, `leg_unwoven_spindle`,
`leg_horologe_mainspring` and ten uniques) are live again and indexed in §3.31, not parked.

### 10.3 Renamed in round 2 (old → new)

Forced by the name rule (no "ember" or "veil") or by the light slot leaving. Other pages must use the new ids.

| Old id | New id | New name | Why |
|---|---|---|---|
| `set_veilglass_artifice` (+ pieces `it_veilglass_*`) | `set_tearglass_artifice` (`it_tearglass_diadem`, `_pauldrons`, `_mantle`, `_gloves`, `_skirt`, `_slippers`) | Tear-glass Artifice | veil |
| `it_reliquary_keeper_band_of_ember` | `it_reliquary_keeper_band_of_cinders` | Band of Cinders | ember |
| `leg_emberwheel` | `leg_cinderwheel` | The Cinderwheel | ember |
| `leg_sovereigns_ember` | `leg_sovereigns_brand` | The Sovereign's Brand | ember |
| `leg_ember_of_the_pyre_king` | `leg_coal_of_the_pyre_king` | Coal of the Pyre King | ember |
| `leg_mirror_of_the_veil` | `leg_mirror_of_the_mend` | Mirror of the Mend | veil |
| `leg_crown_of_the_ember_king` | `leg_crown_of_the_ashen_heir` | Crown of the Ashen Heir | ember |
| `leg_sunforged_gauntlets` | `leg_noonforged_gauntlets` | Noonforged Gauntlets | near-collision (§3.33 #10) |
| `leg_twin_moth_lantern` (light) | `leg_twin_moth_brooch` (necklace) | Twin Moth Brooch | light slot |
| `leg_trailblazers_lantern` (light) | `leg_trailblazers_compass` (necklace) | Trailblazer's Compass | light slot |
| `leg_candle_of_the_unburied` (light) | `leg_mantle_of_the_unburied` (back) | Mantle of the Unburied | light slot |
| `uq_lantern_of_morrow` (light) | `uq_bell_of_morrow` (necklace) | Bell of Morrow | light slot |
| `uq_sunjar` (light) | `uq_noonstone` (necklace) | Noonstone | light slot |
| `uq_seers_veil` | `uq_seers_shroud` | Seer's Shroud | veil |
| `uq_emberwing_quiver` | `uq_cinderwing_quiver` | Cinderwing Quiver | ember |
| `uq_veil_of_the_moonwell` | `uq_shawl_of_the_moonwell` | Shawl of the Moonwell | veil |
| `rider_fury` (power id) | `mounted_frenzy` | — | "Fury" is banned |
| **Page 12's items** (page 12 §21.7 is the list; page 12 wins) | | | |
| `leg_the_first_ember` (light, d14 secret) | `leg_the_oldest_coal` (necklace) | The Oldest Coal | ember + light slot |
| `it_first_ember_lantern` (light, d14 secret) | `it_ashmothers_coal_cage` (off-hand focus) | Ashmother's Coal Cage | ember + light slot |
| `uq_pells_hooded_lantern` (light, d01) | `uq_pells_quiet_hood` (head, light armour) | Pell's Quiet Hood | light slot |
| `leg_first_torch` (light, d16 secret) | `leg_heart_of_the_march` (necklace) | Heart of the March | light slot |
| `uq_slag_heart_ember` (trinket, d04) | `soul_slag_heart` | Slag Heart | ember + trinket → soul |
| `uq_gate_key_of_the_ember` (trinket, d13) | `soul_gate_key` | The Gate Key | ember + trinket → soul |
| `uq_stonegullets_gizzard_stone`, `uq_hibernation_charm` (trinkets) | `soul_stonegullets_gizzard`, `soul_hibernation` | Stonegullet's Gizzard, Hibernation | trinket → soul |
| the other 10 trinkets | `soul_<same name>` (§3.31.1) | unchanged names | trinket → soul |
| `leg_the_finished_thing` (trinket legendary, d12 secret) | `leg_the_finished_thing` (hands) | The Finished Thing | no trinket slot |
| `uq_unshattered_vambraces`, `uq_death_roll_bracers` (wrists) | `uq_unshattered_gauntlets` (hands), `uq_death_roll_girdle` (waist) | — | no wrist slot |
| `set_deepdelver` (d03) | `set_deepshaft_harness` | Deepshaft Harness | "Delver" is banned |
| `set_emberbane_plate` (d13) | `set_firebreaker_plate` | Firebreaker Plate | ember |
| `set_emberlord_regalia`, `set_veilwoven` (old raid sets, now d15 / d16) | `set_kingsfire_regalia`, `set_spirewoven` | Kingsfire Regalia, Spirewoven Raiment | ember, veil |
| `leg_emberwing_pinion` (d15) | `leg_firewing_pinion` | Firewing Pinion | ember |
| **Page 13's items** | | | |
| `uq_veilstorm_lens` | `uq_tearstorm_lens` | Tearstorm Lens | veil |
| `uq_stags_lantern` (light) | `uq_stags_lantern` (necklace; same id, page 13 wins) | The Stag's Lantern | light slot |
| **This page's generic items** | | | |
| `leg_frostlocke_sigil` | `leg_frostlocke_seal` | Frostlocke Seal | "sigil" was a round-1 currency word |
| `leg_last_stand_girdle` | `leg_girdle_of_the_final_notch` | Girdle of the Final Notch | "Last Stand" is a banned name |
| **Class files** (done in the class files; the class file wins) | | | |
| `set_runesmith_emberforged_aegis` | `set_runesmith_anvilborn_aegis` | The Anvilborn Aegis | ember |
| `set_runesmith_glacier_runes` | `set_runesmith_rimefang_runes` | Runes of the Rimefang | named after a parked raid |
| `set_shadow_dancer_veilwoven_garb` | `set_shadow_dancer_duskwoven_garb` | Duskwoven Garb | veil |
| `set_tinker_emberforge_rig` | `set_tinker_forgefire_rig` | The Forgefire Rig | ember |
| `set_priest_veil_of_the_twin_lamps` | `set_priest_mantle_of_the_twin_lamps` | Mantle of the Twin Lamps | veil |
| `set_priest_regalia_of_the_sunken_choir` | `set_priest_regalia_of_the_salt_choir` | Regalia of the Salt Choir | named after a parked raid |
| `set_enchanter_veilsilk_vestments` | `set_enchanter_gossamer_vestments` | Gossamer Vestments | veil |
| `set_rogue_nightfall` | `set_rogue_long_count` | The Long Count | its bonuses used removed rogue kit (stealth) |
| `leg_heart_of_the_ember_wyrm` | `leg_heart_of_the_fire_wyrm` | Heart of the Fire Wyrm | ember |
| `leg_veil_of_the_other_road` | `leg_mantle_of_the_other_road` | Mantle of the Other Road | veil |
| `leg_mourners_veil` | `leg_mourners_shroud` | Mourner's Shroud | veil |
| `leg_scepter_of_noon_and_midnight` | `leg_scepter_of_noon_and_gloam` | Scepter of Noon and Gloam | set by the priest file |
| `leg_greatcats_collar` | `leg_collar_of_the_twin_trail` | Collar of the Twin Trail | the ranger's beast is no longer a cat |
| `leg_cloak_of_no_moon` | `leg_cloak_of_the_unwatched` | Cloak of the Unwatched | its power used removed rogue kit (stealth) |
| `uq_ember_censer` | `uq_ash_censer` | The Ash Censer | ember |
| `uq_rattle_of_ember_teeth` | `uq_rattle_of_storm_teeth` | Rattle of Storm Teeth | ember |
| `uq_ember_rime_signet` | `uq_blaze_rime_signet` | Blaze-and-Rime Signet | ember |
| `uq_whisker_charm` | `uq_beastbond_charm` | Beastbond Charm | the ranger's beast is no longer a cat |
| `uq_challengers_bell` | `uq_callers_bell` | Caller's Bell | the warrior's Iron Challenge is now Iron Call |
| `uq_barkskin_wraps` (druid) | `uq_oakhide_wraps` | Oakhide Wraps | "Barkskin" is a banned name |
| `soul_second_self` (mage) | `soul_mirrored_self` | Soul of the Mirrored Self | id collision with the chronomancer |
| `soul_heron_who_stayed` (shaman) | `soul_crane_who_stayed` | Soul of the Crane Who Stayed | the shaman's beast is the Rain Crane |
