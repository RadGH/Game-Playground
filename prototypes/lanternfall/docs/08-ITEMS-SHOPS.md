# LANTERNFALL — page 08: Items, Loot, Currencies and Shops

> Everything you can carry, find, buy, sell, craft or pay with: the bag, the eight gear slots, 66 base items, 32 affixes, 18 unique relics, 3 sets, 26 consumables, strands, materials, keys, the three currencies, every loot table, the price formula, all 8 canon shops plus 4 roaming/secret merchants, Scrapwright crafting, and the economy targets per act.

## Contents

1. [Rules this page follows](#1-rules-this-page-follows)
2. [Inventory model](#2-inventory-model)
3. [Gear slots](#3-gear-slots)
4. [Rarities and item level](#4-rarities-and-item-level)
5. [Base items (66)](#5-base-items)
6. [Affix pool (32)](#6-affix-pool)
7. [Unique relics (18)](#7-unique-relics)
8. [Sets (3)](#8-sets)
9. [Consumables (26)](#9-consumables)
10. [Strands as items](#10-strands-as-items)
11. [Materials, scrap and build parts](#11-materials-scrap-and-build-parts)
12. [Keys and quest items](#12-keys-and-quest-items)
13. [Currencies](#13-currencies)
14. [Loot tables](#14-loot-tables)
15. [Pricing formula](#15-pricing-formula)
16. [The eight shops](#16-the-eight-shops)
17. [Roaming and secret merchants](#17-roaming-and-secret-merchants)
18. [Scrapwright crafting and upgrading](#18-scrapwright-crafting-and-upgrading)
19. [Economy balance targets](#19-economy-balance-targets)
20. [Data files and JSON shapes](#20-data-files-and-json-shapes)
21. [Tests this page needs](#21-tests-this-page-needs)
22. [Proposed canon changes](#22-proposed-canon-changes)

---

## 1. Rules this page follows

- Names and ids from `00-OVERVIEW.md` are used exactly (flames, shapes, charms, shops, keepers, currencies).
- Monster drops reference the loot table ids defined in §14; which monster uses which table is in
  `05-BESTIARY-BOSSES.md` (each monster row has a `loot` column).
- Spell numbers (oil cost, damage per strand) live in `03-SPELLS.md`; this page only prices the strands.
- Attribute formulas live in `04-CLASSES-PROGRESSION.md`; gear here adds flat or percent bonuses on top.
- HUD/inventory screen layout is in `02-CONTROLS-UI.md` §inventory; this page gives the model and the
  shop-screen extras.
- All numbers below are starting values. They live in `data/items.json`, `data/affixes.json`,
  `data/loot.json`, `data/shops.json` and `data/economy.json` and are tuned by the headless economy sim (§19).
- Every player-facing name is original (playground rule 9).

**Reference scale used for numbers on this page** (kept in step with page 04):

| Thing | Value at level 1 | Value at level 30 |
|---|---|---|
| Player base health (Nerve 5) | 100 | ~420 |
| Base oil pool (Draught 5) | 100 | ~220 |
| Pole swing damage (Might 5) | 12 | ~70 with act-6 weapon |
| A Bolt of Ember wick, burn-in 1 | 14 | ~85 with gear |
| Standard enemy HP (act 1 / act 6) | 40 | 900 |

---

## 2. Inventory model

### 2.1 The satchel

| Property | Value |
|---|---|
| Satchel grid | **5 columns × 4 rows = 20 slots** at start |
| Satchel upgrades | +5 slots (a row) at Scrapwright's: 400 pennies (row 5), 1,500 (row 6), 4,000 + 2 marks (row 7). Max 35 slots |
| Item footprint | every item takes **1 slot** (no Tetris shapes; a pixel game with a small screen needs fast reads) |
| Stacking | consumables stack to **10**, materials/scrap to **99**, strands to **5** (same id), keys never stack (each key unique) |
| Currencies | not in the satchel; shown in the purse row (pennies, pearls, marks) |
| Key ring | separate list, unlimited, cannot be dropped or sold |
| Strand case | separate list for strands you have *learned* (see §10); unlearned strand items sit in the satchel |
| Belt | **4 quick slots** for consumables, keys `1`–`4` (bindings in page 02). The belt points at a satchel stack; it holds no items of its own |
| Oil flask slot | a gear slot (§3), refilled from `lamp_oil` stacks automatically |
| Weight | none. No encumbrance |

### 2.2 Full satchel

- Picking up with a full satchel: the item stays on the ground as a glowing drop (it never despawns inside
  the room; it despawns when the act ends).
- Materials and currencies always auto-pick (materials overflow into the **Scrap Sack**, below).
- **Scrap Sack**: a free hidden overflow for `scrap` and monster-part materials only, 500 per id cap, emptied
  into the satchel's stacks whenever there is room. It exists so the player never juggles scrap.

### 2.3 Drops on the ground

| Rarity | Ground glow | Beam height | Pickup sound id |
|---|---|---|---|
| common | none, grey outline 1 cell | 0 | `loot.common` |
| fine | pale blue outline | 8 cells | `loot.uncommon` |
| rare | amber outline + slow pulse | 24 cells | `loot.rare` |
| relic | violet outline + motes | 48 cells | `loot.epic` |
| lamp_blessed | gold-white, lights 16-cell radius (a real light in the light buffer) | 96 cells, reaches through darkness | `loot.legendary` |

Drops **float** on water (they are light, like the lamp-oil they smell of) and bob to the surface; drops that
fall into a void zone are pushed to its lit rim. Drops never fall through the world: if a drop's cell is
destroyed it rests on the next solid cell down, and if there is none within 200 cells it teleports to the
room's `lootSafe` marker (page 10).

### 2.4 Auto-sort and junk

- `Sort` button orders by: gear (slot order) → consumables → strands → materials → quest.
- Any item can be flagged **junk** (key `X` on the inventory screen). Every shop has "Sell junk" which sells
  all flagged items in one click.
- Commons you never equipped can be auto-flagged junk (setting `autoJunkCommon`, default off).

---

## 3. Gear slots

| Slot id | Name | Count | What the base item gives | Class limits |
|---|---|---|---|---|
| `lantern` | Lantern | 1 | light radius (cells), oil burn per second in darkness (act 4+), a flat **Wick power %** | all; Moth Oracle's moth-lamp is a lantern type |
| `weapon` | Weapon | 1 | melee damage, swing time, reach (cells), knockback | each class has a weapon family (§5.2); can equip any family at −20% damage when off-class |
| `hood` | Hood | 1 | armour, one small stat | all |
| `coat` | Coat | 1 | armour (biggest), health | all |
| `boots` | Boots | 1 | armour, move/jump/swim stats | all |
| `trinket` | Trinket | 2 (`trinket1`, `trinket2`) | no base stat except its implicit; mostly affixes | all; the same unique cannot sit in both |
| `oil_flask` | Oil flask | 1 | reserve oil capacity (auto-refills lantern oil when it drops under 25%), refill speed | all |

**Armour** reduces incoming non-Shade damage: `taken = dmg × 100 / (100 + armour)`. Shade ignores armour
(canon). Armour totals: a common act-1 full set ≈ 18 armour (15% reduction); a rare act-6 set ≈ 240 (70%).

**Implicit** = the fixed stat every copy of a base item has. **Affixes** = the rolled extras (§6).

---

## 4. Rarities and item level

### 4.1 Rarities

| Id | Name | Affix count | Colour | Drop weight (base) | Value mult | Notes |
|---|---|---|---|---|---|---|
| `common` | Common | 0 | grey `#9aa3ad` | 600 | ×1 | plain base item |
| `fine` | Fine | 1 | pale blue `#8fc7ff` | 300 | ×2.5 | |
| `rare` | Rare | 2–3 | amber `#ffb347` | 85 | ×6 | generated name "Adjective Noun" from namegen |
| `relic` | Relic | fixed | violet `#c58cff` | 12 | ×20 | the uniques of §7 and set pieces of §8 |
| `lamp_blessed` | Lamp-blessed | 3 + a **blessing** | gold-white `#fff4d6` | 3 | ×40 | a rare with its three affixes rolled in the top 25% and one blessing (§4.3); drops only after that act's Lamp is relit, or from bosses |

**Rarity step**: elite and champion kills give **+1 rarity step on one roll** (common→fine, fine→rare,
rare→relic *only if* the table has a relic entry, otherwise stays rare with +1 affix). Miniboss and boss
rolls are listed in their own tables.

**Knack** raises the chance of rarer items: each point of Knack above 5 multiplies the fine/rare/relic/
lamp_blessed weights by `1 + 0.02 × (Knack − 5)` (capped at ×1.6). Loot find affixes add to the same multiplier.

### 4.2 Item level (`ilvl`)

- `ilvl` = the level of the monster or chest that made it, clamped `1..30` (Endless goes to 60).
- Act bands: act 1 = 1–5, act 2 = 6–10, act 3 = 11–15, act 4 = 16–20, act 5 = 21–25, act 6 = 26–30.
- **Base stat scaling**: `stat = base × (1 + 0.11 × (ilvl − 1))` (so ilvl 30 = ×4.19).
- **Affix tiers**: each affix has 5 tiers (T1–T5). Tier allowed: T1 at ilvl 1, T2 at 6, T3 at 12, T4 at 18,
  T5 at 24. Rolled tier = random among allowed tiers weighted `[1, 2, 3, 4, 5]` toward the highest allowed.
- Shop items have `ilvl` = the player's level, clamped to the shop's act band max.

### 4.3 Blessings (lamp_blessed only)

A blessing is named after the Great Lamp whose district dropped it. One per item.

| Id | From | Effect |
|---|---|---|
| `bless_crown` | act 1 | +10% Wick power while standing in any light ≥ 50% |
| `bless_gutter` | act 2 | grapple pull speed +25%, rope climb speed +25% |
| `bless_sluice` | act 3 | breath underwater +50%, no slow when swimming |
| `bless_deep` | act 4 | lantern oil burn in darkness −30% |
| `bless_bell` | act 5 | gravity-lantern flips cost no oil |
| `bless_sky` | act 6 | overcharge past the safe line has half the gutter chance |

---

## 5. Base items

Numbers are at `ilvl 1` before scaling (§4.2). "Req" is the act it first appears in drops/shops.
Weapon damage is a range; swing time in ms; reach in cells from the player's centre.

### 5.1 Lanterns (10)

| Id | Name | Req | Light radius | Wick power | Dark burn oil/s | Implicit | Notes |
|---|---|---|---|---|---|---|---|
| `lantern_tin` | Tin Pole-Lantern | 1 | 64 | +0% | 1.0 | — | starting lantern (Lamplighter gets `lantern_guild`) |
| `lantern_guild` | Guild Pole-Lantern | 1 | 72 | +5% | 0.9 | +20% max oil | Lamplighter start (canon +20% oil) |
| `lantern_hook` | Hook-Staff Lamp | 1 | 60 | +3% | 1.0 | +10 armour | Sluicewarden start |
| `lantern_wrench` | Wrenchlight | 1 | 56 | +3% | 1.0 | +15% build speed | Tinker start |
| `lantern_bottle` | Bottle Lamp | 2 | 80 | +4% | 0.8 | light passes through water without dimming | |
| `lantern_moth` | Moth-Lamp | 1 | 48 | +6% | 0.6 | see in darkness 40 cells beyond light | Moth Oracle start; drops act 4 |
| `lantern_ship` | Ship's Storm-Lamp | 3 | 88 | +6% | 0.8 | cannot be put out by water or wind | |
| `lantern_censer` | Bell Censer | 5 | 70 | +8% | 0.9 | light radius pulses +20% on every toll you cause | |
| `lantern_cage` | Caged Wisp | 4 | 96 | +8% | 0.5 | Unlit take +15% damage inside your light | |
| `lantern_sky` | Cloudglass Lantern | 6 | 110 | +12% | 0.4 | light colour is the last TWO flames cast (split glow) | |

### 5.2 Weapons (16; two per class family)

| Id | Name | Family (class) | Req | Damage | Swing ms | Reach | Knockback | Implicit |
|---|---|---|---|---|---|---|---|---|
| `wpn_pole` | Lamplighter's Pole | pole (`lamplighter`) | 1 | 10–14 | 420 | 18 | 60 | — |
| `wpn_pole_brass` | Brass-Shod Pole | pole | 3 | 14–20 | 440 | 20 | 80 | +5% Wick power |
| `wpn_hookstaff` | Hook-Staff | hookstaff (`sluicewarden`) | 1 | 11–15 | 480 | 20 | 90 | pulls small enemies 12 cells toward you |
| `wpn_hookstaff_tide` | Tidegate Hook | hookstaff | 3 | 15–22 | 500 | 22 | 110 | +20% damage to wet targets |
| `wpn_wrench` | Tinker's Wrench | wrench (`tinker`) | 1 | 9–13 | 360 | 14 | 50 | hitting your own construct repairs 8 HP |
| `wpn_wrench_arc` | Sparking Wrench | wrench | 3 | 12–18 | 360 | 14 | 50 | 10% chance to chain a 6-damage spark |
| `wpn_oarstaff` | Oar-Staff | oarstaff (`ferrywitch`) | 2 | 10–15 | 470 | 22 | 70 | kills in water leave a corpse for Oarsmen even if tiny |
| `wpn_oarstaff_black` | Blackwater Oar | oarstaff | 4 | 16–24 | 480 | 24 | 80 | Oarsmen +15% damage |
| `wpn_handbell` | Hand-Bell and Maul | maul (`bellringer`) | 2 | 13–19 | 560 | 16 | 120 | 15% stagger on hit |
| `wpn_maul_tower` | Tower Maul | maul | 5 | 22–32 | 620 | 18 | 150 | toll spells +10% radius |
| `wpn_anchor` | Anchor-Blade | anchor (`drowned_knight`) | 2 | 14–21 | 540 | 20 | 100 | 3% life steal |
| `wpn_anchor_deep` | Deepchain Anchor | anchor | 4 | 20–30 | 560 | 26 | 130 | 5% life steal, pulls on hit |
| `wpn_mothlamp_rod` | Moth-Rod | rod (`moth_oracle`) | 4 | 9–14 | 380 | 16 | 40 | +10% crit on marked targets |
| `wpn_mothlamp_silk` | Silkbound Rod | rod | 5 | 13–20 | 380 | 18 | 40 | marks last 2 s longer |
| `wpn_brushspear` | Brush-Spear | spear (`chimneysweep`) | 2 | 10–15 | 340 | 24 | 50 | +10% damage while on a rope |
| `wpn_flue_spear` | Flue Lance | spear | 5 | 15–23 | 340 | 28 | 60 | wall-run lasts 0.3 s longer |

### 5.3 Hoods (8)

| Id | Name | Req | Armour | Implicit |
|---|---|---|---|---|
| `hood_oilcloth` | Oilcloth Hood | 1 | 3 | — |
| `hood_guild` | Guild Cowl | 1 | 4 | +2 Draught |
| `hood_rat` | Ratskin Cap | 2 | 5 | +10% poison resistance |
| `hood_diver` | Brass Diving Helm | 3 | 8 | +4 s breath underwater |
| `hood_veil` | Mourning Veil | 4 | 5 | +8% crit in darkness |
| `hood_bellcap` | Ringer's Cap | 5 | 7 | stagger resistance +15% |
| `hood_miner` | Candle-Crown | 1 | 3 | +16 light radius (a candle on the hood; separate from lantern light) |
| `hood_cloud` | Cloudspun Hood | 6 | 9 | +10% rain-flame (`tide`, `spark`) damage |

### 5.4 Coats (8)

| Id | Name | Req | Armour | Health | Implicit |
|---|---|---|---|---|---|
| `coat_oilskin` | Oilskin Coat | 1 | 8 | +10 | — |
| `coat_guild` | Guild Longcoat | 1 | 9 | +12 | +5% oil regen |
| `coat_leather_apron` | Tinker's Apron | 1 | 7 | +8 | +1 build part per scrap pickup of 10+ |
| `coat_bulwark` | Bulwark Mantle | 1 | 12 | +15 | block 20% of frontal damage (Sluicewarden's shield visual) |
| `coat_gutter` | Gutterman's Slicker | 2 | 10 | +14 | immune to plague puddle slow |
| `coat_wader` | Wader's Chest-Suit | 3 | 11 | +16 | swim speed +15% |
| `coat_widow` | Silk Duster | 4 | 9 | +12 | +15% dodge vs Unlit |
| `coat_bronze` | Bronze-Scale Coat | 5 | 18 | +22 | −5% move speed |

### 5.5 Boots (8)

| Id | Name | Req | Armour | Implicit |
|---|---|---|---|---|
| `boots_clogs` | Wooden Clogs | 1 | 2 | — |
| `boots_guild` | Guild Boots | 1 | 3 | +3% move speed |
| `boots_hobnail` | Hobnail Boots | 1 | 4 | no slip on ice or wax |
| `boots_rope` | Rope-Soled Shoes | 2 | 2 | +15% rope climb speed |
| `boots_fins` | Webbed Galoshes | 3 | 3 | +20% swim speed |
| `boots_silent` | Felt Soles | 4 | 2 | footsteps don't alert the Unlit beyond 24 cells (normal 64) |
| `boots_spring` | Spring-Heel Boots | 5 | 3 | jump apex +4 cells |
| `boots_cloud` | Cloudstep Boots | 6 | 4 | fall damage −50%, 0.15 s hover at apex |

### 5.6 Trinkets (10)

| Id | Name | Req | Implicit |
|---|---|---|---|
| `trk_penny_charm` | Lucky Penny | 1 | +10% pennies found |
| `trk_wax_seal` | Wax Seal | 1 | +5 max health |
| `trk_rat_bell` | Rat's Bell | 2 | rats (tagged `rat`) aggro 20% slower |
| `trk_lever_key` | Lever Charm | 2 | levers, buttons, valves 30% faster |
| `trk_pearl_drop` | Pearl Drop | 3 | +8% pearls found |
| `trk_moth_pin` | Moth Pin | 4 | +10% light radius |
| `trk_bell_shard` | Cracked Bell Shard | 5 | +5% stagger on all hits |
| `trk_cloud_bead` | Cloud Bead | 6 | +5% Wick power |
| `trk_guild_badge` | Apprentice's Badge | 1 | +5% experience |
| `trk_compass` | Drowned Compass | 3 | minimap shows chests within 1 screen |

### 5.7 Oil flasks (6)

| Id | Name | Req | Reserve oil | Refill rate oil/s into lantern | Implicit |
|---|---|---|---|---|---|
| `flask_tin` | Tin Flask | 1 | 60 | 10 | — |
| `flask_guild` | Guild Flask | 1 | 80 | 12 | — |
| `flask_copper` | Copper Hip-Flask | 2 | 100 | 14 | refill is silent |
| `flask_pressure` | Pressure Flask | 3 | 90 | 30 | refill costs 5% more oil (leaks) |
| `flask_deep` | Deepwell Flask | 4 | 160 | 10 | refills from standing in oil pools, 4 oil/s |
| `flask_cloud` | Cloudglass Flask | 6 | 200 | 16 | +10% overcharge oil efficiency |

**Total base items: 10 + 16 + 8 + 8 + 8 + 10 + 6 = 66.**

---

## 6. Affix pool

32 affixes. `slots` = where they may roll. Prefixes and suffixes: max 2 prefixes and 2 suffixes on a lamp_blessed/rare; a
fine gets one of either. Ranges are per tier T1→T5 (min–max inside each tier; the item rolls inside its tier).
Units: `%` = percent, `flat` = added number.

| # | Id | Kind | Name part | Slots | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `wick_power_pct` | prefix | Bright | lantern, trinket | 3–5% | 6–8% | 9–12% | 13–16% | 17–22% |
| 2 | `melee_dmg_flat` | prefix | Heavy | weapon | 2–3 | 4–6 | 7–10 | 11–15 | 16–22 |
| 3 | `melee_dmg_pct` | prefix | Cruel | weapon | 8–12% | 13–18% | 19–25% | 26–33% | 34–42% |
| 4 | `flame_ember_pct` | prefix | Smouldering | lantern, weapon, trinket | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 5 | `flame_rime_pct` | prefix | Frosted | lantern, weapon, trinket | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 6 | `flame_spark_pct` | prefix | Crackling | lantern, weapon, trinket | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 7 | `flame_bile_pct` | prefix | Festering | lantern, weapon, trinket | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 8 | `flame_gleam_pct` | prefix | Hallowed | lantern, weapon, trinket | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 9 | `flame_tide_pct` | prefix | Surging | lantern, weapon, trinket | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 10 | `flame_shade_pct` | prefix | Hollow | lantern, weapon, trinket | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 11 | `max_health_flat` | prefix | Stout | hood, coat, boots, trinket | 6–10 | 11–18 | 19–30 | 31–45 | 46–65 |
| 12 | `armour_pct` | prefix | Plated | hood, coat, boots | 10–15% | 16–22% | 23–30% | 31–40% | 41–52% |
| 13 | `max_oil_flat` | prefix | Brimming | lantern, oil_flask, coat | 5–8 | 9–14 | 15–22 | 23–32 | 33–45 |
| 14 | `oil_regen_pct` | prefix | Seeping | lantern, oil_flask, hood | 5–8% | 9–13% | 14–19% | 20–26% | 27–35% |
| 15 | `oil_cost_pct` | prefix | Thrifty | lantern, trinket | −2–3% | −4–5% | −6–7% | −8–9% | −10–12% |
| 16 | `light_radius_pct` | prefix | Beaming | lantern, hood | 5–8% | 9–13% | 14–19% | 20–26% | 27–35% |
| 17 | `crit_chance` | suffix | of the Keen | weapon, trinket, hood | 1–2% | 3% | 4% | 5–6% | 7–8% |
| 18 | `crit_damage` | suffix | of Ruin | weapon, trinket | 8–12% | 13–18% | 19–25% | 26–33% | 34–42% |
| 19 | `cast_speed` | suffix | of Quickwicks | lantern, trinket, hood | 3–4% | 5–6% | 7–8% | 9–11% | 12–15% |
| 20 | `move_speed` | suffix | of the Gutter-Runner | boots | 3–4% | 5–6% | 7–8% | 9–10% | 11–12% |
| 21 | `jump_height` | suffix | of the Rooftops | boots | +1 cell | +2 | +3 | +4 | +5 |
| 22 | `breath` | suffix | of Gills | hood, coat | +2 s | +3 s | +4 s | +6 s | +8 s |
| 23 | `resist_<flame>` (7 ids, one family) | suffix | of <Flame>-Warding | hood, coat, boots, trinket | 5–8% | 9–13% | 14–19% | 20–26% | 27–35% |
| 24 | `life_on_hit` | suffix | of Leeching | weapon | 1 | 2 | 3 | 4–5 | 6–8 |
| 25 | `life_on_kill` | suffix | of the Feast | weapon, trinket | 2–3 | 4–6 | 7–10 | 11–15 | 16–22 |
| 26 | `oil_on_kill` | suffix | of the Wick-Thief | weapon, lantern, trinket | 1–2 | 3 | 4–5 | 6–7 | 8–10 |
| 27 | `pennies_find` | suffix | of Pockets | trinket, boots | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 28 | `loot_find` | suffix | of the Scavenger | trinket, hood | 3–5% | 6–8% | 9–12% | 13–16% | 17–20% |
| 29 | `burn_in_rate` (wick burn-in XP) | suffix | of Practice | lantern | 5–8% | 9–12% | 13–17% | 18–23% | 24–30% |
| 30 | `build_speed` | suffix | of the Carpenter | weapon, coat, trinket | 8–12% | 13–18% | 19–25% | 26–33% | 34–42% |
| 31 | `stagger_resist` | suffix | of Nerve | coat, boots | 5–8% | 9–13% | 14–19% | 20–26% | 27–35% |
| 32 | `rope_speed` | suffix | of the Rigger | boots, hood, trinket | 5–8% | 9–13% | 14–19% | 20–26% | 27–35% |

**Affix rules**
- No duplicate affix family on one item (the 7 `flame_*_pct` count as 7 families; the 7 `resist_*` count as one).
- Act gates: `flame_bile_pct` and `resist_bile` roll from act 2, `flame_tide_pct`/`breath` from act 3,
  `flame_shade_pct`/`resist_shade` from act 4 (matching 00 §8 unlocks). Before that they have weight 0.
- Weight: every affix weight 100 except `crit_chance` 60, `oil_cost_pct` 60, `loot_find` 50, `life_on_hit` 70.
- Rare names: prefix name-part + base short noun ("Crackling Pole"), or with two affixes, namegen `artifact`
  pattern with the `lamp` concept tags (see `namegen/README.md`), e.g. "Vessel of the Keen".
- Tooltip: each affix line shows its tier as `I`–`V` in small pips, and the range on hover with `Alt`.

---
## 7. Unique relics

Relics have fixed stats (small ranges are rolled once at drop) and one **power** that changes how you play.
Relic power numbers do not scale with ilvl; their stat lines do (§4.2). One relic of each id may be equipped.
"Source" names the enemy or place; drop chance is per kill/opening. First kill of a boss always drops its
boss relic; later kills (Boss Rush, Endless) drop it at 15%.

### 7.1 Boss relics (6)

| Id | Name | Slot | Stats | Power (exact) | Source |
|---|---|---|---|---|---|
| `relic_tallow_heart` | Tallow Heart | trinket | +20–30 max health, +10% `flame_ember_pct` | Every Ember wick hit spawns 6×2 cells of **molten wax** at the impact point (max 1 spawn per 0.4 s). Molten wax hardens to solid `wax` in 1.5 s and is walkable. Up to 40 wax patches exist; the oldest melts away first. Molten wax does 4 dmg/s to enemies standing in it | `boss_tallow` |
| `relic_choir_bone` | Choir Bone | trinket | +8% cast speed, +5% crit | Every 5th hit (any source, counter shown as 5 pips on the HUD) calls **3 choir rats** (6×4 cells, 30 HP scaled by level, bite 6 dmg every 0.6 s, move 80 cells/s) for **6 s**. Max 6 rats at once. Rats are allies: they don't block you and they chase the nearest enemy | `boss_gnaw` |
| `relic_maw_tooth` | Sluicemaw's Tooth | trinket | +15% `flame_tide_pct`, +4 s breath | While **swimming** (head under water): +30% all damage. Your `bolt`-shaped wicks keep **full speed underwater** (normally −60%) and do not fizzle in water | `boss_sluicemaw` |
| `relic_widow_veil` | Widow's Veil | hood | armour 10, +15% light radius | When your lantern **goes out** (oil 0 or snuffed): for the rest of the dark spell +40% crit chance; and for the first **4 s** the Unlit cannot see you (their `alert` state won't trigger from sight, only from touch). 20 s internal cooldown on the 4 s part | `boss_widow` |
| `relic_bell_clapper` | Bell Clapper | weapon | maul-class base 20–30 dmg, 600 ms, reach 18 (usable by all at no off-class penalty) | 1 in 4 melee hits (25%, rolled) **tolls**: every enemy within **40 cells** is staggered for 0.5 s (bosses: 0.15 s and only once per 6 s). Toll sound `status.stun.apply` with a low pitch; draws a 40-cell brass ring | `boss_bellfather` |
| `relic_vane_quill` | Vane's Quill | trinket | +12% Wick power, +10% `resist_spark` | Every **10 s** your next wick also calls a **cloudburst** on its first target: a 24-cell-wide rain column for 3 s that does 8 dmg/s ×(1 + 0.1×level) and **wets** everything (wet = Spark hits +50%, Ember −30%, puts out burn). HUD shows a small cloud icon when charged | `boss_ossery` |

### 7.2 Miniboss relics (6)

Minibosses are named in `05-BESTIARY-BOSSES.md` (one per act). Drop: 60% first kill, 10% after.

| Id | Name | Slot | Stats | Power | Act |
|---|---|---|---|---|---|
| `relic_mb_act1` | The Wickwright's Snuffer | weapon (any family, pole base) | 12–17 dmg, 420 ms, reach 20 | Hitting a burning enemy **snuffs** the burn and deals all its remaining burn damage at once +25% | 1 |
| `relic_mb_act2` | Sewer-King's Signet | trinket | +10% pennies, +5% loot find | Grapple onto an enemy to **steal** 1–5 pennies ×act from it (once per enemy) | 2 |
| `relic_mb_act3` | Floodgate Seal | trinket | +20 max oil | Pulling any lever/sluice gives **1.5 s of invulnerability** and refills 15 oil (8 s cooldown) | 3 |
| `relic_mb_act4` | Lamp-Eater's Lung | coat | armour 14, health +20 | You may burn **health instead of oil** at 1 HP per 2 oil when oil runs out (never below 10% health) | 4 |
| `relic_mb_act5` | Upturned Chime | boots | armour 4, +3 jump | While under flipped gravity: +20% move speed and your wicks fall "up" with you (lobs keep their arc relative to you) | 5 |
| `relic_mb_act6` | Rootwoven Band | trinket | +8% all flame damage | Each different flame you cast within 8 s adds a stack (max 7): +3% damage per stack. At 7 stacks your lantern flashes white and the next wick costs 0 oil | 6 |

### 7.3 World relics (6; found, not dropped by a fixed monster)

| Id | Name | Slot | Stats | Power | Where |
|---|---|---|---|---|---|
| `relic_first_lamp` | The First Lamplighter's Lantern | lantern | radius 90, +10% Wick power, burn 0.7 | Relighting a Great Lamp or any lamp post heals you fully and refills oil | Secret room behind the Crown Lamp (act 1, `09-MODES-MAP.md`) |
| `relic_rain_gauge` | Rain Gauge | trinket | +10 max oil | Standing in rain restores 1 oil/s (acts 1–5; useless in act 6 after the Rain stops, becomes +10% Wick power instead) | `lt_act2_elite` rare roll (0.4%) or Drowned Market |
| `relic_pennywax_thimble` | Pennywax's Thimble | trinket | +5% cast speed | Odile's shop names **your** wick; a named wick (one she has tasted) gets +8% power | Gift from Odile after buying 20 strands |
| `relic_drowned_crown` | Crown of the Drowned | hood | armour 9 | You breathe underwater for 30 s; Drowned-tag enemies are neutral unless hit | Drowned Market, 18 pearls |
| `relic_debt_ledger` | Crane's Ledger | trinket | — | +25% sell prices; −10% max health | Crane's Pawn after selling 100 items |
| `relic_clockheart` | Clockwork Heart | trinket | +15 max health | On death, revive at 30% health once per room (visible "tick" on the HUD) | Scrapwright gadget recipe (§18.3) |

**Total uniques: 18.**

---

## 8. Sets

A set bonus counts distinct pieces equipped. Set pieces are `relic` rarity with fixed stats; they drop from
the listed tables at the listed chance, and the Mothwife's sealed lanterns can hold them (§16.5).

### 8.1 The Lamplighter's Regalia (`set_regalia`, 4 pieces)

| Piece id | Name | Slot | Stats | Drops from |
|---|---|---|---|---|
| `set_regalia_lantern` | Regalia Pole-Lamp | lantern | radius 84, +8% Wick power | `lt_act1_boss` 8%, `lt_act2_boss` 8% |
| `set_regalia_hood` | Regalia Cowl | hood | armour 6, +3 Draught | any act 1–3 elite 0.6% |
| `set_regalia_coat` | Regalia Longcoat | coat | armour 12, +18 health | any act 1–3 elite 0.6% |
| `set_regalia_flask` | Regalia Flask | oil_flask | 110 reserve, 14/s | `lt_act3_boss` 10% |

| Pieces | Bonus |
|---|---|
| 2 | +15% max oil |
| 3 | relit lamps (any light fixture you ignite) heal 2 HP/s within 48 cells |
| 4 | your lantern's light **burns Unlit** for 6 dmg/s at the edge of its radius; Gleam wicks cost 20% less |

### 8.2 The Sluice-Diver's Brass (`set_brass`, 3 pieces)

| Piece id | Name | Slot | Stats | Drops from |
|---|---|---|---|---|
| `set_brass_helm` | Diver's Brass Helm | hood | armour 10, +6 s breath | `lt_act3_heavy` 0.8% |
| `set_brass_suit` | Diver's Brass Suit | coat | armour 16, +20 health | `lt_act3_miniboss` 12% |
| `set_brass_boots` | Diver's Lead Boots | boots | armour 6 | `lt_act3_elite` 1% |

| Pieces | Bonus |
|---|---|
| 2 | walk on the bottom underwater at 70% land speed (no floating), infinite breath while wearing the helm |
| 3 | Spark in water no longer hurts you; Tide wicks +25% knockback |

### 8.3 Vestments of the Bell (`set_bell`, 3 pieces)

| Piece id | Name | Slot | Stats | Drops from |
|---|---|---|---|---|
| `set_bell_cap` | Tolling Cap | hood | armour 8, +10% stagger resist | `lt_cult` 0.5% |
| `set_bell_robe` | Cantor's Robe | coat | armour 13, +16 health | `lt_act5_miniboss` 12% |
| `set_bell_charm` | Bell-Tongue Charm | trinket | +6% Wick power | `lt_act5_elite` 1% |

| Pieces | Bonus |
|---|---|
| 2 | every 6 s your next hit tolls (as `relic_bell_clapper`, 32 cells) |
| 3 | gravity flips (yours or the world's) release a ring shockwave: 20 dmg ×(1+0.1×level), 36 cells |

Deacon Marl (Bell Tithe) refuses to serve you while you wear 2+ Bell pieces unless your cult-kill count is 0 (§16.7).

---

## 9. Consumables

Stack 10. Belt-usable unless marked. "Use" is instant unless a cast time is given; drinking/eating locks
movement for the cast time and can be interrupted by a hit (the item is **not** used up when interrupted).

### 9.1 Oils (5)

| Id | Name | Price | Effect | Cast | Notes |
|---|---|---|---|---|---|
| `lamp_oil` | Lamp Oil | 6 | +40 oil (lantern first, overflow to flask) | 0 | stacks to **99**; auto-used by the flask (§2.1). Dropped as a pickup blob too |
| `oil_fine` | Clarified Oil | 20 | +100 oil and oil regen +20% for 30 s | 0.4 s | |
| `oil_whale` | Deep Oil | 45 | +60 oil; the lantern burns 50% slower for 90 s | 0.4 s | act 4+ |
| `oil_ember` | Ember-Scented Oil | 30 | next 5 wicks gain the Ember flame's burn on hit (3 dmg/s ×3 s) in addition to their own | 0.4 s | |
| `oil_gleam` | Chapel Oil | 40 | light radius +50% for 60 s; Unlit won't enter the inner half of your light | 0.4 s | act 4+ |

### 9.2 Tonics (6)

| Id | Name | Price | Effect | Cast |
|---|---|---|---|---|
| `tonic_small` | Small Mending Tonic | 15 | heal 35% max health over 2 s | 0.3 s |
| `tonic_large` | Mending Tonic | 40 | heal 70% max health over 2 s | 0.4 s |
| `tonic_breath` | Gillwater | 25 | +20 s breath, swim +20% for 60 s | 0.3 s |
| `tonic_nerve` | Nerve Draught | 35 | stagger immune + 20% armour for 20 s | 0.3 s |
| `tonic_clear` | Clearwater | 18 | removes burn, poison, chill, wet, curse | 0 |
| `tonic_quick` | Chimney Tonic | 30 | +20% move and cast speed for 15 s | 0.3 s |

### 9.3 Bombs (5; thrown with the `lob` arc, 1.5 s fuse or on hit)

| Id | Name | Price | Damage | Radius (cells) | Physics |
|---|---|---|---|---|---|
| `bomb_powder` | Powder Pot | 25 | 40 ×act | 18 | destroys stone/brick/wood cells in radius (not bedrock) |
| `bomb_oil` | Oil Pot | 20 | 10 ×act + burn | 14 | spills 120 cells of oil that ignites if any fire touches it |
| `bomb_frost` | Frost Pot | 30 | 15 ×act | 20 | freezes every water cell in radius to ice for 12 s |
| `bomb_bile` | Bile Jar | 30 | 8/s ×act for 5 s | 16 | acid pool; dissolves metal/brick cells 1 cell per 0.5 s |
| `bomb_flare` | Flare | 12 | 0 | light 120 cells for 30 s | sticks to the surface it hits; Unlit flee it; act 4 essential |

### 9.4 Meals (5; only from Brisket's Soup Barge, one meal active at a time, lasts until you die or 10 minutes)

The full rotating menu is in §16.4. The five fixed shelf items:

| Id | Name | Price | Buff |
|---|---|---|---|
| `meal_eel_pie` | Eel Pie | 30 | +15% max health |
| `meal_barley_broth` | Barley Broth | 20 | +20% health regen out of combat, +10 max oil |
| `meal_ember_stew` | Pepperpot | 35 | +10% Ember and Spark damage |
| `meal_fish_head` | Fish-Head Chowder | 30 | breath +50% |
| `meal_tallow_toast` | Tallow Toast | 15 | +5% everything, −5% move speed |

### 9.5 Scrolls (5; Guild paper, read in 1 s)

| Id | Name | Price | Effect |
|---|---|---|---|
| `scroll_recall` | Guild Recall | 60 | return to the act's last lit lamp (hub); a return portal stays for 5 min |
| `scroll_reveal` | Surveyor's Sheet | 40 | reveals the current act map's rooms (not secrets) |
| `scroll_identify_seal` | Wax Unsealing | 25 | opens a sealed lantern from the Mothwife anywhere |
| `scroll_rebraid` | Rebraiding Note | 80 | free wick rebuild at any lamp post (normally only at hubs, page 03) |
| `scroll_ward` | Lamp Ward | 50 | place a 64-cell safe circle for 30 s: no Unlit spawns, enemies inside take 5 dmg/s ×act |

**Total consumables: 5 + 6 + 5 + 5 + 5 = 26** (plus the rotating soup menu and the Mothwife's sealed lanterns).

---

## 10. Strands as items

A **strand** is the item form of a spell part. Picking up a strand item does nothing until you **learn** it
(use it from the satchel: 1 s, lamp flash in that flame's colour). Once learned it lives in the Strand Case
permanently for that save and the item is consumed. Duplicate strands of an already-learned id become
**Strand Dust** automatically on pickup (`strand_dust`, material, 1 per duplicate), spent on burn-in (§18.4).

| Kind | Ids | Price at Wick & Tallow | Drop sources |
|---|---|---|---|
| Flame | `strand_flame_ember`, `_rime`, `_spark`, `_bile`, `_gleam`, `_tide`, `_shade` | 120 / 150 / 150 / 220 / 180 / 300 / 450 | story unlocks per 00 §8 give them free; buying early is allowed only one act ahead |
| Shape | `strand_shape_bolt`, `_arc`, `_lob`, `_beam`, `_ring`, `_rune`, `_wave`, `_tether` | bolt free, arc 80, lob 100, ring 140, wave 160, rune 200, beam 260, tether 320 | chests 2%, elites 0.5% |
| Charm | `strand_charm_split`, `_bounce`, `_pierce`, `_linger`, `_heavy`, `_swift`, `_seek`, `_vast`, `_siphon`, `_echo`, `_volatile`, `_steady` | 180–600, see table below | enemies (rare), chests, Drowned Market |

Charm prices and act gates:

| Charm | Price (pennies) | First sold | Enemy drop tables (chance) |
|---|---|---|---|
| `split` | 180 | act 2 | `lt_act2_standard` 0.3% |
| `bounce` | 180 | act 2 | `lt_act2_standard` 0.3% |
| `swift` | 200 | act 2 | `lt_act2_heavy` 1% |
| `heavy` | 220 | act 2 | `lt_act2_heavy` 1% |
| `pierce` | 260 | act 3 | `lt_act3_heavy` 1% |
| `linger` | 260 | act 3 | `lt_act3_standard` 0.3% |
| `seek` | 320 | act 3 | `lt_act3_elite` 2% |
| `steady` | 320 | act 4 | `lt_unlit` 0.5% |
| `vast` | 400 | act 4 | `lt_act4_elite` 2% |
| `siphon` | 420 | act 4 | `lt_act4_heavy` 1% |
| `echo` | 500 | act 5 | `lt_cult` 0.8% |
| `volatile` | 600 | act 5 | `lt_act5_elite` 2% |

Knots (`knot_on_hit`, `knot_on_kill`, `knot_on_timer`, `knot_on_land`) are story unlocks in act 4 and are
never items (page 03 §Knots).

---

## 11. Materials, scrap and build parts

### 11.1 Materials

All stack to 99, overflow into the Scrap Sack (§2.2). "Sell" = what Crane pays (§15); Tobiah Clink pays 10% more
for anything in the `parts` column. "Uses" link to §18 recipes and page 07's plank kit.

| Id | Name | Sell | Dropped by (05 tags) | Uses |
|---|---|---|---|---|
| `scrap` | Scrap | 1 | everything mechanical, crates, rubble | plank kit (page 07), all recipes, satchel upgrades |
| `wax_lump` | Wax Lump | 2 | act 1 wax creatures, candles | `wax_brace`, candle-crown upgrade, bomb fillers |
| `rat_tail` | Rat Tail | 2 | rats (act 2) | Rat's Bell, Choir Bone upgrade, Soup Barge mystery |
| `gutter_fat` | Gutter Fat | 3 | gutter swine, fatbacks (act 2) | makes `lamp_oil` ×3 at the Scrapwright's oil press; Oil Pot |
| `pike_scale` | Pike Scale | 4 | pike-things (act 3) | Wader's gear, `scale_plate` part |
| `sluice_eel_skin` | Sluice-Eel Skin | 5 | eels (act 3) | `rope_eelskin` (grapple rope +20% length) |
| `moth_dust` | Moth Dust | 5 | moths (act 4) | light radius upgrades, Chapel Oil, flares |
| `widow_silk` | Widow Silk | 8 | spiders, widow brood (act 4) | `rope_silk`, Silk Duster, `silk_net` gadget |
| `unlit_ash` | Unlit Ash | 8 | the Unlit (any act ≥ 4) | Gleam infusions, Lamp Ward scrolls, Ferry offerings |
| `bell_bronze` | Bell Bronze | 10 | bell constructs (act 5) | Bronze-Scale Coat, `gear_bronze` part, maul upgrades |
| `cult_ribbon` | Cult Ribbon | 6 | bell-cult humans | Bell Tithe trade-in (curses), Vestments upgrade |
| `cloud_wisp` | Cloud Wisp | 14 | cloud-things (act 6) | Cloudglass items, `wisp_cell` part |
| `drowned_bone` | Drowned Bone | 4 | drowned dead (acts 3–6) | Ferrywitch Oarsman upgrades, Ferry offerings, `bone_hinge` part |
| `spark_coil` | Spark Coil | 7 | clockwork, electric eels, lamp-machines | `coil_cell` part, Sparking Wrench, turrets (Tinker) |
| `strand_dust` | Strand Dust | 10 | duplicate strands (§10) | wick burn-in at Odile's (§18.4) |
| `pearl_grit` | Pearl Grit | — | breaks from a pearl (Drowned Market exchange) | 5 grit = 1 pearl; used in `relic` rerolls |

### 11.2 Build parts (made at the Scrapwright or found)

Parts are what the plank kit and gadgets consume (page 07 covers placing them).

| Id | Name | Recipe (Scrapwright bench) | Buy | Used for |
|---|---|---|---|---|
| `plank` | Plank | 3 scrap | 4 | a 12×2-cell walkable plank (page 07) |
| `brace` | Brace | 2 scrap + 1 plank | 8 | a diagonal support; lets planks span 24 cells |
| `wax_brace` | Wax Brace | 2 wax_lump | 6 | a brace that you can melt away with Ember |
| `scale_plate` | Scale Plate | 3 pike_scale + 2 scrap | 20 | a small shield-wall 4×10 cells, blocks bolts |
| `rope_coil` | Rope Coil | 4 scrap | 10 | a fixed rope anchor (hangs 60 cells) |
| `rope_eelskin` | Eelskin Rope | 3 sluice_eel_skin | 30 | permanent grapple upgrade (one-time) |
| `rope_silk` | Silk Line | 3 widow_silk | 45 | permanent grapple upgrade: +30% pull speed (one-time) |
| `gear_bronze` | Bronze Gear | 2 bell_bronze + 3 scrap | 30 | gadgets, lever repair |
| `coil_cell` | Coil Cell | 2 spark_coil + 2 scrap | 25 | powers a dead machine for 60 s without casting Spark |
| `bone_hinge` | Bone Hinge | 2 drowned_bone + 1 scrap | 12 | gadget part; trapdoors |
| `wisp_cell` | Wisp Cell | 2 cloud_wisp | 40 | gadget part (float, act 6) |
| `lamp_post_kit` | Lamp-Post Kit | 5 scrap + 1 coil_cell + 10 lamp_oil | 90 | place a small lamp: a 48-cell light that burns 3 minutes (act 4 survival) |

### 11.3 Monster-specific drops (from 05-BESTIARY-BOSSES.md)

| Id | Name | Kind | Sell | Dropped by | Use |
|---|---|---|---|---|---|
| `soot_feather` | Soot Feather | material (stack 99) | 1 | `soot_pigeon` 5% | dye: turns a hood or coat's cosmetic colour charcoal at the Scrapwright (5 feathers, free) |
| `lure_bulb` | Angler's Lure | trinket (fine, fixed) | 40 | `blackwater_angler` 20% (cut the lure) | +18% light radius; your lantern light counts as 30% brighter for the Unlit's reverse-sight rule (they see you at 24 cells in a wider area of your light) |
| `tumbler_core` | Tumbler Core | consumable (belt, stack 3) | 25 | `tumbler` 30% | throw (lob arc): a 40×40 box where gravity is inverted for 4 s (07's gravity volume rules). Acts 5–6 and Endless only |

---

## 12. Keys and quest items

Keys and quest items live on the **Key Ring** (§2.1): unlimited, can't be sold or dropped, removed when used up.

### 12.1 Great Wicks (boss quest drops)

| Id | Name | From | Use |
|---|---|---|---|
| `great_wick_act1` | the Crown Wick | `boss_tallow` | relights the Crown Lamp (act 1 end) |
| `great_wick_act2` | the Gutter Wick | `boss_gnaw` | relights the Gutter Lamp |
| `great_wick_act3` | the Sluice Wick | `boss_sluicemaw` | relights the Sluice Lamp |
| `great_wick_act4` | the Deep Wick | `boss_widow` | relights the Deep Lamp |
| `great_wick_act5` | the Bell Wick | `boss_bellfather` | relights the Bell Lamp |
| `great_wick_act6` | the Sky Wick | `boss_ossery` | relights the Sky Lamp (ending) |

Relighting a Lamp pays **marks** (§13) and triggers Wick & Tallow's price drop in that district (§16.1).

### 12.2 Keys

| Id | Name | Act | Opens | Source |
|---|---|---|---|---|
| `key_chapel` | Chapel Key | 1 | Wax Stair chapel (boss door) | act 1 miniboss |
| `key_vestry` | Vestry Key | 1 | secret vestry (`relic_first_lamp` route) | behind a breakable wax wall |
| `key_grate` | Grate Crank | 2 | sewer grates that are locked (reusable crank) | act 2 miniboss |
| `key_cathedral` | Choir Loft Key | 2 | Gutter Cathedral | puzzle room reward |
| `key_sluice_wheel` | Sluice Wheel | 3 | lets you turn any **locked** sluice valve (reusable) | Sluicewarden gift / act 3 room 2 |
| `key_reservoir` | Reservoir Pass | 3 | Great Reservoir | act 3 miniboss |
| `key_lockhouse` | Lockhouse Key | 3 | the lock-house door of the room it was found in (single use) | the room's lock-holder `drowned_lockkeeper` (05 §11.6) |
| `key_moth_nave` | Moth-Nave Seal | 4 | Moth Nave | collect 3 `seal_shard` (below) |
| `seal_shard` | Seal Shard | 4 | 3 combine into `key_moth_nave` | three dark rooms, one each |
| `key_bellwell` | Bell-Rope Token | 5 | Bellwell shaft lift | act 5 miniboss |
| `key_cloudroot` | Rootgate Key | 6 | the final climb gate | act 6 miniboss |
| `key_silent_bell` | Silent Bell Clapper | 1–4 | rings one Silent Bell (the Bellringer unlock, 00 §7); 12 exist | one per hidden bell room |
| `key_trial_<id>` | Trial Seal | any | opens that Trial room (page 09) | challenge rewards |
| `key_ferry_token` | Ferry Token | any | one free Ferry trip | Old Wenna gift, secret rooms |

### 12.3 Quest items

| Id | Name | For | Notes |
|---|---|---|---|
| `letter_pennywax` | Odile's Letter | Odile Pennywax side quest (01) | deliver to Hollis Crane |
| `brisket_ladle` | Brisket's Lost Ladle | Mother Brisket | returning it unlocks the 5th mystery bowl outcome table |
| `clink_blueprint_<n>` | Torn Blueprint (1–6) | Tobiah Clink | each unlocks a gadget recipe (§18.3) |
| `mothwife_moth` | A Pale Moth in a Jar | the Mothwife | unlocks the "lamp_blessed" sealed lantern shelf |
| `wenna_coin` | Wenna's Old Coin | Old Wenna | returns 50 max health she took (§16.8) once |
| `choir_score` | The Choir's Score | Saint Gnaw lore | read to reveal Gnaw's phase-3 weak point (05) |
| `vane_journal_<n>` | Vane's Journal, page 1–6 | main story | one per act; the ending changes with all 6 |

---

## 13. Currencies

| Id | Name | Icon colour | Cap | Kept on death? | Kept between runs? |
|---|---|---|---|---|---|
| `pennies` | Pennies | copper `#c7803d` | 999,999 | **lose 25%** on death, dropped as a "purse" at the death spot that you can pick back up (one purse at a time; dying again destroys the old one) | campaign: yes; Endless/Daily: no |
| `pearls` | Pearls | pearl `#e8f0f2` | 999 | yes | yes |
| `marks` | Guild Marks | gold `#ffd36b` | 9,999 | yes | yes (meta currency) |

### 13.1 Pennies

| Source | Amount |
|---|---|
| Enemy drops | per loot table (§14): fodder 1–3 ×act, standard 3–7 ×act, heavy 8–15 ×act, elite 25–40 ×act |
| Pots, crates, chests | 2–6 ×act (pots), 10–30 ×act (chests) |
| Selling | §15 |
| Room clear bonus | 10 ×act for a combat room cleared without taking damage |
| Soup Barge "mystery bowl" | sometimes coins (§16.4) |
| Curses at the Bell Tithe | pay you (§16.7) |

Sinks: shops (all), satchel rows, Scrapwright recipes and upgrades, Ferry trips, rebraids, respec, Crane's
buyback, gambling.

### 13.2 Pearls

| Source | Amount |
|---|---|
| Underwater clams (flooded rooms, acts 3–6) | 1 each; ~6 per act 3 run, ~4 per later act |
| Pike/eel enemies (`lt_act3_*`) | 2% per kill |
| Sluicemaw | 5 guaranteed |
| Drowned Market exchange | 1 pearl = 150 pennies to buy; sells back at 90 pennies |
| Endless/Daily | 1 per 5 floors |

Sinks: Drowned Market only (rare charms, relics), plus the Mothwife's lamp_blessed shelf (pearls + pennies)
and `relic` rerolls at the Scrapwright (§18.2).

### 13.3 Guild marks

| Source | Amount |
|---|---|
| Relight a Great Lamp | act 1: 5, act 2: 8, act 3: 10, act 4: 12, act 5: 14, act 6: 20 |
| First-time boss kill | +3 (per boss) |
| Trials | 2–6 each, first clear |
| Daily Wick | 1 for trying, +2 for top-10 local score |
| Class unlock challenges | 5 |
| Floodgate (waves) | 1 per 5 waves held |
| Endless | 1 per 10 floors |

Sinks (the Guild Hall at Lanterncrown, page 09): permanent unlocks — starting satchel row (10), start with a
`flask_guild` (6), +5% starting oil (8, ×3), Mothwife rerolls (1 each), class cosmetics (3–12), Endless
starting-wick choices (5), Trials unlocks (4), satchel upgrade row 7 (2, with pennies).

---
## 14. Loot tables

### 14.1 How a table rolls

A loot table is a list of **rolls**. Each roll picks one entry by weight (an entry may be `nothing`). Money,
oil blobs and materials are separate always-rolled lines so the player sees something from almost every kill.

```
drop(table, killer):
  pennies  = randInt(table.pennies) × actMult × (1 + penniesFind)
  oil      = chance(table.oilChance) ? randInt(table.oil) : 0          // oil blobs, auto-pick
  materials: for each m in table.materials: chance(m.p) → randInt(m.n)
  for r in 1..table.gearRolls:
     if chance(table.gearChance): item = rollGear(table.act, ilvl, table.rarityWeights × knackMult)
  if chance(table.consumableChance): consumable from act pool (§14.4)
  if chance(table.strandChance): strand from table.strands
  table.guaranteed[] always drop
  elite/champion kill: +1 rarity step on the FIRST gear roll (§4.1); champion also gets gearRolls +1
```

`actMult` for pennies: act 1 = 1, 2 = 2, 3 = 3, 4 = 4, 5 = 5, 6 = 6. Endless: `1 + floor/5`.

### 14.2 Tier templates (shared by all acts)

| Tier | Pennies (×act) | Oil blob chance / amount | Gear rolls × chance | Rarity weights c/f/r/relic/lb | Consumable chance | Strand chance |
|---|---|---|---|---|---|---|
| `fodder` | 1–3 | 15% / 5–10 | 1 × 3% | 700/250/50/0/0 | 3% | 0 |
| `standard` | 3–7 | 25% / 8–15 | 1 × 8% | 600/300/95/5/0 | 6% | per §10 |
| `heavy` | 8–15 | 40% / 12–20 | 1 × 20% | 450/380/150/18/2 | 12% | per §10 |
| `elite` | 25–40 | 100% / 20–30 | 2 × 45% | 250/420/280/40/10 | 30% | per §10 |
| `miniboss` | 80–120 | 100% / 40 | 3 × 100% | 0/300/600/80/20 | 100% (2 items) | 25% any charm of the act |
| `boss` | 250–350 | 100% / full refill | 4 × 100% | 0/0/700/250/50 | 100% (3 items) | 40% any charm of the act |

`lamp_blessed` weight is 0 in any table until that act's Lamp is relit (§4.1), **except** boss tables.

### 14.3 The 38 table ids

Each id = the tier template + that act's materials + guaranteed items. Materials: `p` chance, `n` count.

| Table id | Materials | Guaranteed / special |
|---|---|---|
| `lt_act1_fodder` | scrap 40% 1–2, wax_lump 30% 1 | — |
| `lt_act1_standard` | scrap 50% 1–3, wax_lump 40% 1–2 | — |
| `lt_act1_heavy` | scrap 70% 2–4, wax_lump 60% 2–3 | — |
| `lt_act1_elite` | scrap 100% 3–6, wax_lump 100% 2–4 | `set_regalia_hood`/`coat` 0.6% each |
| `lt_act1_miniboss` | wax_lump 6 | `relic_mb_act1` (60% / 10%), `key_chapel` (first kill) |
| `lt_act1_boss` | wax_lump 12, scrap 10 | `great_wick_act1`, `relic_tallow_heart`, `set_regalia_lantern` 8%, `vane_journal_1` |
| `lt_act2_fodder` | rat_tail 40% 1, scrap 30% 1 | — |
| `lt_act2_standard` | rat_tail 45% 1–2, gutter_fat 25% 1 | `strand_charm_split`/`bounce` 0.3% |
| `lt_act2_heavy` | gutter_fat 60% 1–3, scrap 50% 2–3 | `strand_charm_swift`/`heavy` 1% |
| `lt_act2_elite` | gutter_fat 100% 2–4, rat_tail 100% 2–3 | `relic_rain_gauge` 0.4% |
| `lt_act2_miniboss` | gutter_fat 6, rat_tail 6 | `relic_mb_act2`, `key_grate` |
| `lt_act2_boss` | rat_tail 15 | `great_wick_act2`, `relic_choir_bone`, `set_regalia_lantern` 8%, `choir_score` if missed, `vane_journal_2` |
| `lt_act3_fodder` | pike_scale 30% 1, drowned_bone 20% 1 | pearls 2% |
| `lt_act3_standard` | pike_scale 40% 1–2, sluice_eel_skin 25% 1 | pearls 2%, `strand_charm_linger` 0.3% |
| `lt_act3_heavy` | pike_scale 60% 2–3, drowned_bone 40% 1–2 | `set_brass_helm` 0.8%, `strand_charm_pierce` 1% |
| `lt_act3_elite` | sluice_eel_skin 100% 2–3, spark_coil 40% 1 | `set_brass_boots` 1%, `strand_charm_seek` 2%, pearls 1–2 |
| `lt_act3_miniboss` | pike_scale 8 | `relic_mb_act3`, `key_reservoir`, `set_brass_suit` 12%, pearls 2 |
| `lt_act3_boss` | pike_scale 15, sluice_eel_skin 6 | `great_wick_act3`, `relic_maw_tooth`, pearls 5, `set_regalia_flask` 10%, `vane_journal_3` |
| `lt_act4_fodder` | moth_dust 40% 1 | — |
| `lt_act4_standard` | moth_dust 45% 1–2, widow_silk 20% 1 | — |
| `lt_act4_heavy` | widow_silk 50% 1–2, drowned_bone 40% 1–2 | `strand_charm_siphon` 1% |
| `lt_act4_elite` | widow_silk 100% 2–3, moth_dust 100% 2–3 | `strand_charm_vast` 2% |
| `lt_act4_miniboss` | widow_silk 6 | `relic_mb_act4`, one `seal_shard` |
| `lt_act4_boss` | widow_silk 12, moth_dust 10 | `great_wick_act4`, `relic_widow_veil`, `vane_journal_4` |
| `lt_act5_fodder` | bell_bronze 25% 1, scrap 40% 1–2 | — |
| `lt_act5_standard` | bell_bronze 35% 1–2, spark_coil 20% 1 | — |
| `lt_act5_heavy` | bell_bronze 60% 2–3, spark_coil 40% 1–2 | — |
| `lt_act5_elite` | bell_bronze 100% 3–4 | `set_bell_charm` 1%, `strand_charm_volatile` 2% |
| `lt_act5_miniboss` | bell_bronze 8 | `relic_mb_act5`, `key_bellwell`, `set_bell_robe` 12% |
| `lt_act5_boss` | bell_bronze 15 | `great_wick_act5`, `relic_bell_clapper`, `vane_journal_5` |
| `lt_act6_fodder` | cloud_wisp 25% 1 | — |
| `lt_act6_standard` | cloud_wisp 35% 1, drowned_bone 30% 1–2 | — |
| `lt_act6_heavy` | cloud_wisp 50% 1–2, spark_coil 40% 1–2 | — |
| `lt_act6_elite` | cloud_wisp 100% 2–3 | — |
| `lt_act6_miniboss` | cloud_wisp 6 | `relic_mb_act6`, `key_cloudroot` |
| `lt_act6_boss` | cloud_wisp 12 | `great_wick_act6`, `relic_vane_quill`, `vane_journal_6` |
| `lt_unlit` | unlit_ash 70% 1–2 | tier = `standard` of the current act, oil blob chance 60% (the Unlit are made of stolen light), `strand_charm_steady` 0.5% |
| `lt_cult` | cult_ribbon 60% 1–2, bell_bronze 20% 1 | tier = `standard` of the current act, pennies ×1.5, `set_bell_cap` 0.5%, `strand_charm_echo` 0.8%; each kill increments the **cult-kill count** used by the Bell Tithe (§16.7) |

### 14.4 Consumable pools per act (for `consumableChance`)

| Act | Pool (weight) |
|---|---|
| 1 | lamp_oil 50, tonic_small 30, bomb_powder 10, bomb_oil 10 |
| 2 | lamp_oil 40, tonic_small 30, tonic_clear 10, bomb_oil 10, bomb_bile 10 |
| 3 | lamp_oil 35, tonic_small 20, tonic_large 10, tonic_breath 20, bomb_frost 15 |
| 4 | lamp_oil 30, oil_fine 15, bomb_flare 25, tonic_large 15, oil_gleam 10, scroll_ward 5 |
| 5 | lamp_oil 30, tonic_large 20, tonic_nerve 20, bomb_powder 15, oil_fine 15 |
| 6 | oil_fine 25, tonic_large 25, tonic_quick 20, bomb_frost 15, scroll_rebraid 5, oil_whale 10 |

### 14.5 Chests and pots

| Container | Rolls as | Notes |
|---|---|---|
| Pot / crate | `fodder` of the act, pennies only + 20% material | breakable by any damage or falling cells |
| Wooden chest | `heavy` with gear chance 100% | 1–2 per act-map room chain |
| Iron chest (locked, needs a key or a Powder Pot / Bile) | `elite` | Bile dissolves the lock in 2 s |
| Drowned chest (underwater, acts 3+) | `elite` + pearls 1–3 | floats up when the room drains |
| Lamp chest (appears when a Great Lamp relights) | `miniboss` with guaranteed `lamp_blessed` | once per act |

---

## 15. Pricing formula

One function prices everything; shops multiply on top.

```
baseValue(item) =
    gear:        slotBase[slot] × (1 + 0.11 × (ilvl − 1)) × rarityMult[rarity] × (1 + 0.15 × sumAffixTiers)
    consumable:  its listed price (§9)
    strand:      its listed price (§10)
    material:    its listed sell × 2
slotBase = { lantern: 30, weapon: 28, hood: 14, coat: 20, boots: 14, trinket: 18, oil_flask: 16 }
rarityMult = { common: 1, fine: 2.5, rare: 6, relic: 20, lamp_blessed: 40 }
sumAffixTiers = sum of the tier numbers (T1 = 1 … T5 = 5) of every affix on the item

buyPrice  = round(baseValue × shop.buyMult × districtMult × questMult)      // shop.buyMult default 1.0
sellPrice = round(baseValue × 0.25 × shop.sellMult)                        // 25% of value; Crane haggles 15–40%
```

`districtMult` is the Wick & Tallow Lamp drop (§16.1) and applies only in shops that say so. Prices shown
with `shared/format.js` `fmt` (whole pennies, thousands separators). Examples:

| Item | ilvl | Value | Buy (×1.0) | Sell (25%) |
|---|---|---|---|---|
| `wpn_pole` common | 1 | 28 | 28 | 7 |
| `hood_diver` fine, one T2 affix | 12 | 14 × 2.21 × 2.5 × 1.3 = 101 | 101 | 25 |
| `lantern_cage` rare, T4+T4+T3 | 18 | 30 × 2.87 × 6 × 2.65 = 1,369 | 1,369 | 342 |
| `relic_bell_clapper` | 25 | 28 × 3.64 × 20 = 2,038 | (not sold new) | 510 |

---

## 16. The eight shops

Every shop is a `data/shops.json` entry. Common rules:

- **Opening a shop** = walk up to the keeper and press `E` (page 02). The keeper speaks `greet` (Lingo) or a
  shop-specific intent; the shop screen opens after the line (or at once on a second press).
- **Keepers talk through Lingo** using the canon intents: `trade_offer` (showing an item or quoting a price),
  `trade_haggle` (counter-offer), `trade_accept` (deal done), `trade_refuse` (no deal / can't afford). Each
  keeper is a Lingo `Speaker` with traits and custom slots listed below; bespoke lines go into the pack
  `lingo/data/packs/lanternfall.json` under intents prefixed with the shop id (e.g. `shop_wick_taste`).
  Voices from `shared/voices.js` `voiceFor({ role, gender, seed })`.
- **Stock refresh**: "restock" means re-rolling the random rows. Fixed rows never change. A restock happens
  when the listed trigger fires; the shop seed is `runSeed ^ hash(shopId) ^ restockCount` so it is the same
  every time you reload a save (no save-scumming a shop).
- **Buyback**: every shop keeps the last 10 things you sold there this act at the sell price (Crane: forever, §16.2).
- **Screen** (all shops share it; extras per shop below):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [portrait]  WICK & TALLOW — Odile Pennywax             pennies 1,240  pearls 3│
│  "Ah, you smell of smoke. Good." (last Lingo line, typed out)               │
├───────────────[Buy]──[Sell]──[Buyback]──[<shop extra tab>]──────────────────┤
│ ▸ Flames                 │  ITEM CARD (hover/selected)                       │
│   Rime strand     150    │  name, rarity colour, stats, compare vs equipped  │
│   Spark strand    150    │  ▲ green / ▼ red deltas                           │
│ ▸ Charms                 │                                                   │
│   Split strand    180    │  [ Buy  (Enter) ]   [ Haggle (H) ] (Crane only)   │
│ ▸ Oil                    │                                                   │
│   Lamp Oil ×10     60    │                                                   │
├──────────────────────────┴───────────────────────────────────────────────────┤
│ Satchel 14/20   Esc close · Tab switch tab · X sell junk · Shift+click buy 5 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 16.1 Wick & Tallow (`shop_wick`) — Odile Pennywax

| Field | Value |
|---|---|
| Locations | Lanterncrown hub (act 1), and a stall at each act's hub room once that act is reached (the same shop: stock is per district) |
| Sells | flame, shape and charm strands; oil; oil consumables; lanterns; oil flasks |
| Buys | strands (at 25%), lanterns, flasks; nothing else ("Take your boots to Crane.") |
| Keeper | Lingo traits `['gourmand', 'kind']`, formality 0.5, catchphrase "Every flame has a flavour." Voice `voiceFor({ role: 'merchant', gender: 'f', seed: 2101 })` |

**Stock table (per district)**

| Row | Type | Contents | Qty |
|---|---|---|---|
| fixed | oil | `lamp_oil` | ∞ |
| fixed | oil | `oil_fine` (act 2+), `oil_whale` (act 4+), `oil_gleam` (act 4+), `oil_ember` | 5 each |
| fixed | strands | every flame and shape strand unlocked so far or one act ahead (§10) | 1 each |
| random ×3 | strands | charms gated to this act (§10 table) | 1 |
| random ×2 | lantern | a lantern base of this act band, rarity fine 70% / rare 30% | 1 |
| random ×1 | flask | an oil flask of this act band, fine | 1 |

**Restock:** when you enter the district's hub after clearing a boss-path room (≈ 3–4 times per act).

**Quirk 1 — prices drop as the Lamp is relit.** `districtMult` for strands, oils and lanterns:

| District Lamp state | Mult |
|---|---|
| unlit (before the boss) | 1.00 |
| relit (after `great_wick_actN` is used) | 0.75 |
| every earlier district's Lamp also relit | extra −3% per earlier lit Lamp (act 6 relit: 0.75 − 0.15 = 0.60) |

Old districts' stalls stay open with the reduced price (a reason to recall back).

**Quirk 2 — she tastes your spells and names them.** Extra tab **"Tasting"**: pick one of your wicks; Odile
"tastes" it (animation: she holds a spoon over your lantern; the wick's flame colour lights her face).

- Cost: free once per wick build (a changed build can be tasted again).
- She gives the wick a **name** generated by rules, shown in the wick HUD and in the Ledger (meters source
  name). Name = `{flavour adjective from Flame} {dish noun from Shape}{ with charm garnish}`:

| Flame → adjective | Shape → dish | Charm → garnish (first charm only) |
|---|---|---|
| ember "Smoky", rime "Chilled", spark "Fizzing", bile "Sour", gleam "Honeyed", tide "Salted", shade "Bitter" | bolt "Skewer", arc "Slice", lob "Dumpling", beam "Drizzle", ring "Tart", rune "Preserve", wave "Broth", tether "Noodle" | split "…for Two", bounce "…Twice-Baked", pierce "…on a Pin", linger "…Slow-Cooked", heavy "…Stuffed", swift "…to Go", seek "…Hunter-Style", vast "…Family-Size", siphon "…Rendered", echo "…Leftovers", volatile "…Flambé", steady "…Plain" |

  Example: Ember + Bolt + split = "Smoky Skewer for Two".
- Her verdict line uses intent `shop_wick_taste` with binding `{wick.name}` and a score tag (`bland`, `good`,
  `superb`) from the wick's damage per oil vs the balance-sim median (page 03 §balance): < 0.9 → bland,
  0.9–1.2 → good, > 1.2 → superb. A superb verdict gives that wick **+1 burn-in XP level progress of 10%** once.
- With `relic_pennywax_thimble` equipped, tasted wicks get +8% power (§7.3).

**Dialogue plan:** `greet` on open; `trade_offer` when you hover a strand for 1 s; `trade_accept` on buy;
`trade_refuse` when you can't afford ("Save a few more pennies, love."). Bespoke: `shop_wick_taste` (18 lines,
6 per tag), `shop_wick_lamplit` (8 lines, first visit after a relight: "It's cheaper when the street can see.").

### 16.2 Crane's Pawn (`shop_pawn`) — Hollis Crane

| Field | Value |
|---|---|
| Locations | every act hub (a cart that follows you down), plus one hidden back-room branch in act 4 |
| Sells | anything he has bought from you, plus a small random stock |
| Buys | **anything** except keys and quest items, including materials |
| Keeper | Lingo traits `['greedy', 'sentimental']`, catchphrase "Everything's worth something to somebody." Voice `voiceFor({ role: 'merchant', gender: 'm', seed: 2203 })` |

**Stock:** random ×6 rows (any slot, rarity common 40 / fine 45 / rare 15, ilvl = player level) + consumables
(`tonic_small` ×5, `bomb_powder` ×3, `lamp_oil` ×20) + **everything you ever sold him** (the Ledger tab).
Restock of random rows on each new act.

**Quirk — he remembers every item you sold and haggles by mood.**

1. **Memory.** Every sale is stored `{ itemSnapshot, soldFor, act, day }` in the save (cap 200, oldest out).
   He resells a remembered item at `soldFor × 3`. He comments on it through Lingo memory
   (`lingo/js/memory.js`, event type `trade`): selling an item then buying it back gives intent
   `shop_pawn_remember` ("Back for the Brass Pole already? It missed you.").
2. **Mood** is a number −1..+1, starts 0.2, saved. It moves:

| Event | Mood change |
|---|---|
| you sell him a rare or better | +0.10 |
| you sell junk (common) ×5 in a row | −0.05 |
| a haggle he wins | +0.05 |
| a haggle he loses | −0.10 |
| you walk away mid-haggle | −0.15 |
| you relight a Lamp | +0.20 (everyone's happier) |
| you killed a bell-cultist in the hub | −0.30 |
| each new act (decays toward 0.2) | halves the distance to 0.2 |

3. **Sell price** = `baseValue × (0.25 + 0.10 × mood)` → 15%–35%. **Buy price** = `baseValue × (1.15 − 0.15 × mood)`.
4. **Haggle** (key `H` on a selected row, sell or buy): a three-step exchange.
   - He opens with `trade_offer` at the price above.
   - You pick **Push (+10%)**, **Push hard (+25%)** or **Take it**.
   - Accept chance for a push: `p = 0.6 + 0.3 × mood − (0.25 if hard) − 0.05 × pushesThisVisit`. Knack adds +1%
     per point above 5. On success he says `trade_accept` and the deal moves; on failure `trade_haggle` with a
     counter at +5% and mood −0.05; two failures in a row → `trade_refuse` and the item is locked for this
     visit.
   - Max 3 pushes per item.
5. The mood shows as a small face on his portrait (5 states, from scowl to grin), so the system is readable.

**UI extra:** tab **"Ledger"** listing every remembered sale (icon, date, what he paid, his price now).
**Dialogue:** traits make the choice: greedy weights `trade_haggle` lines up; `sentimental` enables
`shop_pawn_remember` (12 lines). `crane_mood_<state>` greeting pools (5 × 4 lines).

### 16.3 The Drowned Market (`shop_drowned`) — the Pale Congregation

| Field | Value |
|---|---|
| Locations | one per act 3–6 map, in a room that **only opens when that room is flooded** (a door below the dry waterline; page 07 sluice puzzles). The Congregation's shell-stalls stand on the room floor; you must swim to them |
| Currency | **pearls** only, both ways |
| Sells | rare charms, relics, pearl-only consumables |
| Buys | relics and rares (in pearls), and pearl_grit |
| Keepers | three Pale Congregation members (drowned folk, lit by pale green bioluminescent eyes); they speak **babble** through the formant engine with a gurgle effect (`voice-lab` fx `underwater`), subtitled by Lingo |

**Stock**

| Row | Item | Price (pearls) | Qty |
|---|---|---|---|
| fixed | `strand_charm_seek`, `strand_charm_siphon`, `strand_charm_echo` (the act gate is waived here) | 3 / 4 / 5 | 1 each |
| random ×2 | any charm not yet learned | 2 + price/150 | 1 |
| fixed | `relic_drowned_crown` | 18 | 1 |
| fixed | `relic_rain_gauge` | 12 | 1 |
| random ×1 | a rare item with one T5 affix | 6 | 1 |
| fixed | `tonic_breath` | 1 for 3 | 10 |
| fixed | `oil_whale` | 1 | 5 |
| fixed | pearls ↔ pennies | buy pearl 150 pennies, sell pearl 90 | ∞ (the only place pennies are accepted) |

**Sell to them:** rare = 1 pearl, relic = 4 pearls, lamp_blessed = 8 pearls, `pearl_grit` ×5 = 1 pearl.

**Quirk — reachable only when flooded.** While you shop you are underwater: your breath timer keeps running
(the shop screen pauses **enemies** but not breath, clamped so breath never drops below 3 s while the screen is
open: when it reaches 3 s the screen closes with the keeper line `shop_drowned_breath` "Up, little lamp. Breathe."). A
Drowned Knight (breathes water) or someone wearing `relic_drowned_crown` shops without the timer.
If you drain the room, the stalls sink into the floor and the door seals until it floods again.

**Restock:** each time the room is flooded again after being drained (max once per act visit).
**Dialogue:** `trade_offer`/`trade_accept`/`trade_refuse` with a `drowned` tag weighting (slow, formal,
"we"), plus `shop_drowned_greet` (8 lines).

### 16.4 Brisket's Soup Barge (`shop_soup`) — Mother Brisket

| Field | Value |
|---|---|
| Locations | moored at a canal room in acts 2, 3 and 4 (floats on real water: if you drain its canal the barge sits on the mud and she refuses to cook — "Can't boil a pot on a slope."); act 1 hub has her cart; acts 5–6 she's on a raft on the rising flood |
| Sells | meals (§9.4) and the day's menu; one meal active at a time |
| Buys | nothing; accepts ingredient **donations** (below) |
| Keeper | traits `['kind', 'loud']`, catchphrase "Eat, you're see-through." Voice `voiceFor({ role: 'cook', gender: 'f', seed: 2407 })` |

**Menu rule — changes each visit.** Each visit (each time you open the shop after leaving the room) rolls
**3 menu dishes** from a pool of 14 (seeded) + the 5 fixed shelf meals (§9.4) + the mystery bowl.

| Pool dish id | Name | Price | Buff (until death / 10 min) |
|---|---|---|---|
| `menu_rime_sorbet` | Frost Sorbet | 30 | +12% Rime damage, chill lasts +1 s |
| `menu_spark_fritters` | Crackle Fritters | 30 | Spark chains +1 target |
| `menu_bile_pickle` | Pickle Plate | 28 | poison resistance +40% |
| `menu_gleam_bun` | Saint's Bun | 35 | +2 HP/s while in light |
| `menu_tide_chowder` | Low-Tide Chowder | 30 | Tide knockback +20% |
| `menu_shade_pudding` | Black Pudding | 40 | +8% Shade damage, +5% life on kill |
| `menu_rat_kebab` | Gutter Skewer | 12 | +10% melee damage, 10% chance of a 5 s poison on eating |
| `menu_eel_jelly` | Jellied Eel | 25 | swim speed +25% |
| `menu_moth_cake` | Dustcake | 30 | light radius +20% |
| `menu_bell_bread` | Ringing Loaf | 30 | stagger resist +25% |
| `menu_cloud_souffle` | Cloud Soufflé | 45 | jump +5 cells, fall damage −50% |
| `menu_miners_pasty` | Scrapper's Pasty | 25 | build speed +25% |
| `menu_lamp_porridge` | Lamp Porridge | 20 | oil regen +25% |
| `menu_brisket_special` | Brisket's Special | 50 | +8% all damage, +8% max health |

**The mystery bowl** (`meal_mystery`, 25 pennies): rolls one outcome:

| Weight | Outcome |
|---|---|
| 30 | a random pool dish's buff at +50% strength |
| 20 | a random pool dish's buff, normal strength |
| 10 | pennies: 50 ×act ("Found that in the pot, keep it.") |
| 10 | a random consumable from the act pool ×2 |
| 8 | nausea: −10% move speed for 60 s, then +10% all damage for the rest of the meal |
| 8 | a strand the player hasn't learned (any charm allowed in the act) |
| 6 | a rat: a `choir rat` ally follows you for 3 minutes (as `relic_choir_bone` rats) |
| 5 | "the bottom of the pot": a random rare trinket |
| 2 | **Brisket's Secret**: permanent +5 max health (once per save; after that re-rolls) |
| 1 | only with `brisket_ladle` returned: the whole menu's buffs at once for 3 minutes |

**Donations:** giving her 5 of a monster-part material adds a themed dish to the next visit's menu
(`rat_tail` → Gutter Skewer, `sluice_eel_skin` → Jellied Eel, `moth_dust` → Dustcake, `bell_bronze` → Ringing
Loaf, `cloud_wisp` → Cloud Soufflé) and makes it 50% off.

**UI extra:** the Buy tab is a menu card ("Today's Pot") with the buff on hover; the active meal shows as a
bowl icon on the HUD with the remaining time. **Dialogue:** `shop_soup_menu` (reads the three dishes aloud,
Lingo with `{dish1}` `{dish2}` `{dish3}` bindings), `shop_soup_mystery` (10 lines, one per outcome).

### 16.5 The Mothwife's Gamble (`shop_gamble`) — the Mothwife

| Field | Value |
|---|---|
| Locations | a moth-lit alcove in every act from act 2; in act 4 she is the only merchant in the dark districts (her light is the moths) |
| Sells | **sealed lanterns** (random gear) and nothing else |
| Buys | nothing |
| Keeper | traits `['cryptic', 'playful']`, speaks half **babble** (moths) and half Lingo; voice `voiceFor({ role: 'mystic', gender: 'f', seed: 2509 })` |

**Sealed lantern** (`sealed_lantern_<slot>`): you pick a **slot** to gamble on (lantern, weapon, hood, coat,
boots, trinket, oil_flask, or "any" at −20% price). The item is rolled when the seal is broken, not when bought.

| Slot | Price (× act) |
|---|---|
| weapon, lantern | 90 |
| coat | 70 |
| hood, boots, oil_flask | 55 |
| trinket | 65 |
| any | 50 |

Rarity weights inside a sealed lantern: common 35 / fine 40 / rare 20 / relic 4 / lamp_blessed 1 (lamp_blessed
only with `mothwife_moth` returned, and then 2). ilvl = player level + 0–2.

**Quirk — the glow hints the rarity.** Each shelf shows **5 sealed lanterns** per slot. Each one glows. The glow
is a hint, not a promise:

| True rarity | Glow shown (weights) |
|---|---|
| common | grey 60, pale blue 30, amber 10 |
| fine | pale blue 60, grey 20, amber 20 |
| rare | amber 60, pale blue 25, violet 15 |
| relic | violet 65, amber 25, gold-white 10 |
| lamp_blessed | gold-white 80, violet 20 |

- The glow **flickers** at a speed tied to the ilvl (fast = high ilvl).
- A Moth Oracle, or anyone with **Knack ≥ 15**, sees a second hint: a moth sits on lanterns of rare or better
  (true rarity; 100% accurate).
- Buying breaks the seal on the spot (a moth flies out in the item's rarity colour). You can instead **keep it
  sealed** (a satchel item) and open it later with `scroll_identify_seal` or at any shop: sealed lanterns
  opened in act 4's darkness roll rarity weights ×1.25 on rare+ (reward for carrying them).
- Guild marks: 1 mark rerolls a shelf's 5 lanterns (Guild Hall unlock, §13.3).

**Restock:** each time you enter the act hub, and after each purchase the bought lantern is replaced.
**Dialogue:** `shop_gamble_pick` (on hover: "That one hums. Or it's the moths."), `trade_accept`, and
`shop_gamble_reveal_<rarity>` (5 pools × 4 lines).

### 16.6 Scrapwright's (`shop_scrap`) — Tobiah Clink

| Field | Value |
|---|---|
| Locations | act 1 hub (after the plank kit unlocks), act 2, act 3, act 5 hubs; a workshop room in act 6 |
| Sells | build parts (§11.2), blueprints, gadgets, satchel upgrades, grapple upgrades, bombs |
| Buys | materials and parts at +10% over Crane; takes **trade-ins** |
| Keeper | traits `['tinkerer', 'blunt']`, catchphrase "If it rattles, it's working." Voice `voiceFor({ role: 'smith', gender: 'm', seed: 2611 })` |

**Stock:** all parts of §11.2 whose materials exist by this act (fixed, ∞); `bomb_powder`, `bomb_oil`,
`bomb_frost` (act 3+), `bomb_bile` (act 2+) ×5 each; satchel rows (§2.1); 2 random gadgets (§18.3) already built,
at 1.5× recipe cost.

**Quirk 1 — trade-ins.** Any gear item can be traded for scrap and one material instead of pennies:
`scrap = 5 × rarityMult × act`, plus 1 `gear_bronze` for relic/lamp_blessed. Trade-ins count as "sold" for
Crane's memory (Clink sends them up to Crane).

**Quirk 2 — the custom gadget.** Tab **"Build me something"**: drop **3 parts** into three slots; Clink builds a
gadget from them (§18.3 lists every recipe). Unknown combinations make a **Rattletrap** (a toy that plays a
sound and gives 10 scrap back) — Clink never refuses, he just makes something silly. Build takes one room
cleared (you pick it up on return) or 100 × act pennies to rush.

**Restock:** random gadgets on each act. **Dialogue:** `shop_scrap_build` (lines naming the 3 parts), 
`trade_haggle` disabled (he doesn't haggle: `trade_refuse` "Price is the price."), `shop_scrap_rattletrap` (8 lines).

### 16.7 The Bell Tithe (`shop_tithe`) — Deacon Marl

| Field | Value |
|---|---|
| Locations | the Bellwell outskirts (act 5) and a shrine in act 4 and act 6 |
| Sells | **blessings** (timed or permanent-for-the-run buffs) |
| Buys | `cult_ribbon`; takes **curses** (pays you) |
| Keeper | traits `['zealous', 'mercenary']`, voice `voiceFor({ role: 'priest', gender: 'm', seed: 2713 })` with a reverb fx |

**Blessings** (one of each active at a time; last until the act ends unless noted)

| Id | Name | Base price | Effect |
|---|---|---|---|
| `bless_toll_ward` | Toll Ward | 200 | stagger immunity for the first hit of every fight |
| `bless_bronze_skin` | Bronze Skin | 250 | +20% armour |
| `bless_quiet_bell` | Quiet Bell | 180 | bell-cultists don't alert on sight for 3 s |
| `bless_long_toll` | Long Toll | 300 | toll/stagger effects +30% duration |
| `bless_true_ring` | True Ring | 400 | +10% Wick power |
| `bless_rung_twice` | Rung Twice | 600 | on death: revive once at 50% health (this act) |

**Curses** (take one: he **pays** you; they last until the act ends or you pay to lift them at 2× what he paid)

| Id | Name | He pays (× act) | Effect |
|---|---|---|---|
| `curse_leaky_lamp` | Leaky Lamp | 60 | oil regen −30% |
| `curse_glass_bones` | Glass Bones | 80 | −20% max health |
| `curse_loud_step` | Loud Step | 50 | enemies alert from 2× distance |
| `curse_heavy_hood` | Heavy Hood | 70 | jump −4 cells |
| `curse_toll_debt` | Toll Debt | 100 | every 30 s a bell tolls: you're staggered 0.3 s |
| `curse_dim` | The Dimming | 120 | light radius −35% (act 4+: a real risk) |

Curses also raise loot: each active curse gives +10% `loot_find` (the reward for playing harder).

**Quirk — prices climb for each bell-cultist you have killed.** Blessing price
`= basePrice × act/5 × (1 + 0.08 × cultKills)`, where `cultKills` = the save-wide count of `lt_cult` kills
(capped at ×4). He **pays** less for curses the same way: `payout / (1 + 0.04 × cultKills)`.
Handing in `cult_ribbon` ×5 "absolves" 1 kill (he burns the ribbons: they are your proof you ended a cultist;
he'd rather not know how). At 0 kills he adds a free blessing roll once per act (`shop_tithe_faithful`).
At 25+ kills he refuses service (`trade_refuse`, `shop_tithe_banished`) until ribbons bring you back under 25.

**UI extra:** a "Tally" counter shows your cult-kill count as notches on a bell. **Dialogue:**
`shop_tithe_price` (lines that name the tally: "{n} of the flock, lamp-child. The toll rises."), `trade_offer`
with `zealous` weighting.

### 16.8 The Ferry (`shop_ferry`) — Old Wenna ("Charon-that-isn't")

| Field | Value |
|---|---|
| Locations | a landing in every act from act 2 (always on water; in act 6 after the Rain stops, the landing is a mud-bank and she poles the boat through the air on the falling flood — same services) |
| Sells | map reveals, fast travel, respec |
| Currency | pennies **or max health** (the quirk) |
| Keeper | traits `['weary', 'wry']`, catchphrase "Everyone pays the river." Voice `voiceFor({ role: 'elder', gender: 'f', seed: 2819 })` |

**Services**

| Service id | What | Pennies | or Max health |
|---|---|---|---|
| `ferry_reveal` | reveals the current act map (rooms + secrets markers, not contents) | 150 × act | 10 |
| `ferry_reveal_secret` | reveals secret rooms only | 300 × act | 20 |
| `ferry_travel` | travel to any visited Ferry landing or hub (any act) | 40 × act-distance (min 40) | 5 |
| `ferry_respec_points` | reset attribute points | 200 × level/5 | 15 |
| `ferry_respec_skills` | reset the skill board | 250 × level/5 | 20 |
| `ferry_respec_full` | both | 400 × level/5 | 30 |
| `ferry_burn_in_move` | move one wick's burn-in to another wick (page 03) | 300 | 15 |

**Quirk — payment in max health.** Health paid is **permanent max health loss** for this save (shown as a
greyed segment at the end of the health bar with a small boat mark). Floor: you can't go under 50% of your
natural max health. Getting it back:
- `wenna_coin` returns up to 50 once.
- Each relit Great Lamp returns 10 of it.
- Each `unlit_ash` ×10 offered at her landing returns 5 ("ash for breath").

**UI extra:** a "Toll" toggle on every row (Pennies / Life). **Dialogue:** `shop_ferry_toll` when paying in
life ("The river keeps it warm for you."), `trade_offer`, `trade_accept`, and a `weary` tag weighting.

---
## 17. Roaming and secret merchants

Four merchants that are not in canon §11 (invented here; see §22 for adding them to canon).

### 17.1 The Lamp-Moth Peddler (`shop_peddler`) — Fennick Tallowby (roaming)

| Field | Value |
|---|---|
| Where | appears in **one random non-combat room per act** (seeded), 60% chance per act; a small figure under an umbrella of lit candles |
| Sells | 4 random consumables at −20%, 1 random fine/rare item, and **one strand one act ahead** of the gate (at 1.5× price) |
| Quirk | **He leaves.** Once you enter his room a 90 s timer starts (candles burn down visibly on his umbrella); when it runs out he packs up (`shop_peddler_leave`). Rain puts his candles out faster: +50% burn speed if he's standing in open rain. Shelter him (build a plank roof over him, page 07) and the timer pauses |
| Keeper | traits `['nervous', 'chatty']`, voice `voiceFor({ role: 'villager', gender: 'm', seed: 3001 })` |
| Dialogue | `trade_offer`, `trade_accept`, `shop_peddler_hurry` (at 30 s left), `shop_peddler_thanks` (if roofed) |

### 17.2 The Undertow Fence (`shop_fence`) — "Silt" (secret)

| Field | Value |
|---|---|
| Where | behind a breakable brick wall in one room of acts 2, 4 and 6 (Bile or a Powder Pot opens it; a faint green lamp leaks through cracks as a hint) |
| Sells | stolen goods: 3 rare items at 0.7× price, 1 relic at 2× price (random from uniques you don't own, excluding boss relics), `key_ferry_token` ×1 (100 × act), `bomb_bile` ×10 |
| Buys | anything at 40% (better than Crane) but **Crane's mood −0.1** per item sold here if Crane hears (each item has 30% chance to "turn up" in Crane's Ledger) |
| Quirk | **Heat**: every purchase adds 1 heat; at 3+ heat, the next act's rooms spawn one extra "Guild Warden" fight (a standard-tier human patrol, `lt_cult`-like drops without the cult-kill count). Heat −1 per act |
| Keeper | traits `['sly', 'terse']`, voice `voiceFor({ role: 'rogue', gender: 'n', seed: 3103 })` |
| Dialogue | `trade_offer` (`sly` tag), `shop_fence_heat` |

### 17.3 The Salvage Diver (`shop_salvage`) — Marrow Pell (flooded rooms)

| Field | Value |
|---|---|
| Where | acts 3–5, on a floating platform in any room with a body of water ≥ 2,000 cells |
| Service | **Dive for it**: pay 60 × act pennies; she dives and returns after you clear the next room with one item rolled from `lt_actN_heavy` gear rolls (100% gear) + 1–3 pearls. Up to 3 dives waiting at once |
| Quirk | **Deeper is better**: the dive's rarity weights scale with the water depth at her platform (depth in cells ÷ 100, capped ×2 on rare+). Draining the room with a sluice while a dive is out strands her: the dive fails, she keeps the fee and says `shop_salvage_stranded` |
| Keeper | traits `['brave', 'gruff']`, voice `voiceFor({ role: 'sailor', gender: 'f', seed: 3207 })` |

### 17.4 The Hollow Lamp Auction (`shop_auction`) — the Candle-Headed Auctioneer (secret, once per run)

| Field | Value |
|---|---|
| Where | a secret room in act 5 reached only with gravity flipped (a door on the ceiling) |
| What | one auction of **3 lots**: a lamp_blessed item, a relic, and a set piece. Two rival bidders (NPC Lingo speakers: "the Widow's Clerk" and "a Man with Wet Gloves") |
| Quirk | **Bidding**: each lot starts at its buy price × 0.5; bidders raise by 10% each 3 s; each bidder has a hidden cap = value × random(0.8–1.6). You bid with `Space` (+10%). Whoever holds the bid when 5 s pass without a raise wins. Pay in pennies; pearls count as 150 each. Losing all three lots gives a consolation `oil_fine` ×3 |
| Keeper | babble voice with a fast-speech preset; lines `shop_auction_call`, `shop_auction_sold` |
| UI | a bid bar with the current price, the three portraits and a 5 s ring timer |

---

## 18. Scrapwright crafting and upgrading

All crafting happens at `shop_scrap` (Tobiah Clink) except burn-in (Odile, §18.4). No crafting in the field.

### 18.1 Upgrading gear ("Tempering")

Each gear item has an **upgrade level** +0 to +5. Each level: +8% of its base stats (not affixes).

| Upgrade | Cost (pennies × act of the item's ilvl band) | Materials | Chance |
|---|---|---|---|
| +1 | 40 | 5 scrap | 100% |
| +2 | 80 | 10 scrap + 2 of the act material | 100% |
| +3 | 150 | 15 scrap + 4 act material | 100% |
| +4 | 260 | 20 scrap + 6 act material + 1 part (`gear_bronze` or `coil_cell`) | 100% |
| +5 | 420 | 25 scrap + 8 act material + 1 `strand_dust` | 100% |

No failure chance: the cost is the whole price, so the outcome is always readable. "Act material" = the
first material listed for that act in §14.3 (act 1 wax_lump, act 2 gutter_fat, act 3 pike_scale, act 4
widow_silk, act 5 bell_bronze, act 6 cloud_wisp).

### 18.2 Rerolling and adding affixes

| Service | Cost | Rule |
|---|---|---|
| **Reforge** one affix | 30 × act × tier of that affix + 3 scrap | rerolls that affix's value inside its tier (not its tier or kind) |
| **Recast** one affix | 100 × act + 1 `strand_dust` | replaces the affix with a new random one from the slot pool at the item's ilvl |
| **Add affix** (fine → rare) | 250 × act + 5 act material | adds 1 affix; fine becomes rare. Max one per item |
| **Relic reroll** | 5 pearls or 25 `pearl_grit` | rerolls a relic's stat lines (not its power) |
| **Salvage** | free | breaks any gear into scrap (as §16.6 trade-in) + 30% chance of 1 act material |

### 18.3 Gadgets (the 3-part custom build)

A gadget is a belt-usable tool with charges (refilled at any hub for free) or a trinket. Order of parts
doesn't matter. `clink_blueprint_<n>` items reveal the recipe in the "Build me something" tab (without it, the
combination still works — the blueprint is a hint, not a lock).

| Gadget id | Name | Parts | Kind | Effect |
|---|---|---|---|---|
| `gad_pulley` | Pocket Pulley | rope_coil + gear_bronze + plank | belt, 3 charges | fixes a pulley that lifts you 80 cells at 60 cells/s |
| `gad_bellows` | Hand Bellows | bone_hinge + plank + scale_plate | belt, 5 charges | a gust 40 cells long: pushes water/steam/gas cells, knocks small enemies back, fans fires |
| `gad_zapper` | Coil Zapper | coil_cell + coil_cell + gear_bronze | belt, 4 charges | powers a machine for 60 s or stuns a construct for 2 s |
| `gad_pump` | Bilge Pump | gear_bronze + rope_coil + bone_hinge | belt, 3 charges | moves 400 water cells from where you stand to where you aim (range 60 cells) over 2 s |
| `gad_float` | Wisp Float | wisp_cell + rope_coil + plank | belt, 3 charges | a floating 16-cell platform for 8 s |
| `gad_net` | Silk Net | rope_silk-part (3 widow_silk as one slot) + bone_hinge + rope_coil | belt, 5 charges | roots a standard-size enemy 3 s |
| `gad_lamp_post` | Folding Lamp | lamp_post_kit + gear_bronze + plank | belt, 2 charges | as `lamp_post_kit` but 5 minutes |
| `relic_clockheart` | Clockwork Heart | gear_bronze + coil_cell + wisp_cell | trinket (relic) | see §7.3; blueprint 6 required (the one exception to "hint, not lock") |
| `gad_turret_ember` | Brazier Turret | coil_cell + scale_plate + gear_bronze | belt, 2 charges | places an Ember turret (Tinker's turret stats, page 04) for 30 s; Tinkers get 3 charges |
| `gad_rattletrap` | Rattletrap | any other combination | belt, 1 charge | a wind-up toy that walks and plays `ui.click` rhythms; enemies with `curious` AI (page 05) follow it for 4 s. Returns 10 scrap |

### 18.4 Burn-in with Strand Dust (at Odile's)

Odile will "season" a wick: 1 `strand_dust` + 50 × wick burn-in level pennies = +25% of the XP to the wick's
next burn-in level (page 03 §burn-in). Max 2 per wick per act.

---

## 19. Economy balance targets

These are the numbers the headless economy sim (`tools/sim-lanternfall-economy.mjs`, page 10) must hit
with a bot that kills everything in the act's rooms on the main path (not secrets), sells all junk and buys
sensibly. Pennies are before death losses.

| Act | Kills (main path) | Pennies earned (kills + containers + sales) | Target spend | What the spend buys |
|---|---|---|---|---|
| 1 | ~70 | 1,000 ± 15% | 800 | 2 strands (rime, spark), oil, 1 satchel row wanted (400) by act 2 |
| 2 | ~90 | 2,400 ± 15% | 2,100 | bile strand, 2 charms, a rare lantern OR 3 sealed lanterns, grapple nothing (story) |
| 3 | ~100 | 4,200 ± 15% | 3,600 | tide strand, 2 charms, tempering +2/+3 on 3 items, breath tonics; ~10 pearls earned |
| 4 | ~100 | 6,000 ± 15% | 5,400 | oil/flares (≈1,200 on light alone: a real pressure), shade strand, curses tempt |
| 5 | ~110 | 8,500 ± 15% | 7,500 | blessings (≈1,500), rare gear, satchel row 7 (4,000) |
| 6 | ~110 | 11,000 ± 15% | 9,000 | tempering +4/+5, auction, gadgets |

| Check | Target |
|---|---|
| Money at each act start (bot) | never more than 1.2× that act's biggest single shop item |
| Oil spend share in act 4 | 20–30% of act 4 spending (light is the act's economy) |
| Sealed lantern EV | expected sell value of a sealed lantern ≈ 60% of its price (a gamble should lose on average but pay out 1 in 8 with a rare+) |
| Crane haggle | average haggle gain for a bot pushing once: +6% (worth doing, not a must) |
| Ferry life-payments | a player paying only in health can afford at most 6 services before hitting the 50% floor |
| Lamp price drop | buying everything after relighting saves 20–25% per act; the sim checks the "shop before or after the boss" choice is close (neither is always right) |
| Relic count | a normal campaign clear finds 8–11 relics (6 boss + 3–5 others) |
| Rare+ gear | about 1 rare per 2 rooms by act 3; 1 lamp_blessed per act after the Lamp is relit (lamp chest) + ~0.5 from drops |
| Guild marks per campaign | ~69 from Lamps (5+8+10+12+14+20) + 18 from bosses = 87; Guild Hall unlock list costs ~140 total so a second run or Trials is needed for all |

If a sim run lands outside ±15% the sim fails and prints which source (drops, containers, sales) is off.

---

## 20. Data files and JSON shapes

All under `prototypes/lanternfall/data/` (page 10 lists the full layout).

`items.json` — bases, uniques, set pieces, consumables, materials, parts, keys:

```json
{
  "schema": 1,
  "bases": [
    { "id": "lantern_cage", "name": "Caged Wisp", "slot": "lantern", "req": 4,
      "stats": { "lightRadius": 96, "wickPowerPct": 8, "darkBurn": 0.5 },
      "implicit": { "unlitVulnPct": 15 }, "art": "items/lantern_cage" }
  ],
  "uniques": [
    { "id": "relic_tallow_heart", "name": "Tallow Heart", "slot": "trinket", "rarity": "relic",
      "stats": { "maxHealthFlat": [20, 30], "flame_ember_pct": 10 },
      "power": { "id": "wax_ledges", "patch": [6, 2], "hardenMs": 1500, "maxPatches": 40, "icdMs": 400, "moltenDps": 4 },
      "source": { "table": "lt_act1_boss", "first": 1.0, "repeat": 0.15 } }
  ],
  "sets": [ { "id": "set_brass", "pieces": ["set_brass_helm", "set_brass_suit", "set_brass_boots"],
              "bonuses": { "2": ["bottom_walk", "helm_breath"], "3": ["spark_water_immune", "tide_knock_25"] } } ],
  "consumables": [ { "id": "bomb_frost", "name": "Frost Pot", "price": 30, "stack": 10,
                     "use": { "kind": "throw", "fuseMs": 1500, "radius": 20, "damagePerAct": 15, "freezeWaterMs": 12000 } } ],
  "materials": [ { "id": "widow_silk", "name": "Widow Silk", "sell": 8, "stack": 99 } ],
  "parts": [ { "id": "rope_silk", "recipe": { "widow_silk": 3 }, "buy": 45, "oneTime": true } ],
  "keys": [ { "id": "key_reservoir", "name": "Reservoir Pass", "act": 3 } ]
}
```

`affixes.json`:

```json
{ "id": "crit_chance", "kind": "suffix", "namePart": "of the Keen", "slots": ["weapon", "trinket", "hood"],
  "stat": "critChance", "unit": "pct", "weight": 60, "minAct": 1,
  "tiers": [[1, 2], [3, 3], [4, 4], [5, 6], [7, 8]] }
```

`loot.json`:

```json
{
  "tiers": { "elite": { "pennies": [25, 40], "oil": { "p": 1.0, "n": [20, 30] }, "gearRolls": 2, "gearChance": 0.45,
                        "rarity": { "common": 250, "fine": 420, "rare": 280, "relic": 40, "lamp_blessed": 10 },
                        "consumableChance": 0.3 } },
  "tables": { "lt_act3_elite": { "act": 3, "tier": "elite",
      "materials": [ { "id": "sluice_eel_skin", "p": 1.0, "n": [2, 3] }, { "id": "spark_coil", "p": 0.4, "n": [1, 1] } ],
      "extra": [ { "id": "set_brass_boots", "p": 0.01 }, { "id": "strand_charm_seek", "p": 0.02 }, { "id": "pearls", "p": 1.0, "n": [1, 2] } ] } }
}
```

`shops.json` (one entry per shop; quirks are code modules named by `quirk`):

```json
{ "id": "shop_pawn", "name": "Crane's Pawn", "keeper": "hollis_crane", "quirk": "pawn_memory_mood",
  "currency": "pennies", "buyMult": 1.0, "sellMult": 1.0,
  "locations": [ { "act": "*", "room": "hub" }, { "act": 4, "room": "a4_backroom" } ],
  "rows": [ { "kind": "random", "count": 6, "pool": "gear_any", "rarity": { "common": 40, "fine": 45, "rare": 15 } },
            { "kind": "fixed", "item": "tonic_small", "qty": 5 } ],
  "restock": "on_act_enter",
  "speaker": { "traits": ["greedy", "sentimental"], "catchphrase": "Everything's worth something to somebody.",
               "voice": { "role": "merchant", "gender": "m", "seed": 2203 } },
  "intents": { "offer": "trade_offer", "haggle": "trade_haggle", "accept": "trade_accept", "refuse": "trade_refuse",
               "extra": ["shop_pawn_remember", "crane_mood_scowl", "crane_mood_grin"] } }
```

`economy.json`: `actMult`, `slotBase`, `rarityMult`, satchel row prices, Guild Hall unlock costs, the §19 targets.

Save fields added by this page (page 10 owns the save format): `purse {pennies, pearls, marks}`, `deathPurse`,
`satchel[]`, `keyRing[]`, `strandCase[]`, `crane {mood, ledger[]}`, `cultKills`, `ferryHealthPaid`,
`shopRestock {shopId: count}`, `brisketSecret`, `fenceHeat`, `peddlerSeen {act: bool}`.

---

## 21. Tests this page needs

| Test (node unit unless noted) | Checks |
|---|---|
| `items.data.test.js` | every id unique; every base has a valid slot; 66 bases, ≥ 32 affixes, ≥ 18 uniques, 3 sets, ≥ 26 consumables |
| `loot.tables.test.js` | all 38 table ids from §14.3 exist; every item/material an entry names exists; every table id that `data/enemies.json` references exists (05's `loot` column) |
| `loot.gates.test.js` | move `minAct` of `flame_shade_pct` to an odd value (e.g. 2) and ask the roller: shade affixes appear in act 2 rolls (the "dead data" check from the playground memory) |
| `pricing.test.js` | the four §15 examples round to the listed numbers |
| `crane.test.js` | mood moves by the §16.2 table; sell percent stays in 15–35%; ledger caps at 200 |
| `tithe.test.js` | price formula, ribbon absolution, refusal at 25 kills |
| `ferry.test.js` | health floor at 50%; relight refund |
| `mothwife.test.js` | 10,000 seeded sealed lanterns: glow/rarity confusion matches the table ±2%; EV ≈ 60% |
| `soup.test.js` | menu has 3 pool dishes + 5 fixed + mystery; same seed + restock count → same menu |
| `economy.sim` (headless, `tools/sim-lanternfall-economy.mjs`) | §19 targets ±15% over 50 seeds |
| Playwright `shops.spec.js` | open each shop in a test room, buy, sell, haggle once (Crane), close; screenshot desktop + mobile |

---

## 22. Proposed canon changes

1. **Add four merchants to 00 §11** as a "roaming/secret" sub-table: `shop_peddler` (Fennick Tallowby),
   `shop_fence` (Silt), `shop_salvage` (Marrow Pell), `shop_auction` (the Candle-Headed Auctioneer).
2. **Add rarity ids** to canon: `common`, `fine`, `rare`, `relic`, `lamp_blessed`, since pages 05, 09 and 10
   use them.
3. **Pennies death rule** (lose 25%, recoverable purse) should be stated in 00 or page 09 as a campaign rule.
4. **Gear slots** (`lantern`, `weapon`, `hood`, `coat`, `boots`, `trinket` ×2, `oil_flask`) should be listed in
   00 so page 02's inventory screen and page 04's class kits agree.
