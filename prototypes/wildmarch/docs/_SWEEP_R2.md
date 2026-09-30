# Round 2 consistency sweep (Claude-facing)

The round-2 pass was written by 14 agents in parallel; their reports disagree in places. This page is the
**final word** on every conflict found. Apply it to your assigned files only, then run the grep in §3.

## 1. Owner rules — which page wins an id

| Kind of id | Owner (wins) |
|---|---|
| dungeon items, dungeon bosses, dungeon souls (old trinkets) | page 12 (its §21.7 rename table) |
| class spells, class sets, class legendaries/uniques, class souls | the class file |
| world-boss ids and their drops | page 13 (`13-WORLD-BOSSES.md`) |
| monster ids, `mod_`, `grr_`, families | page 10 (its §14 rename table) |
| quest ids | page 14 · NPC ids and faction/town/landmark ids: page 01 |
| generic items, bases, affixes, gems, jewels, special rarities, mounts | page 08 · generic sets/legendaries/souls: page 09 |
| travel spells' numbers, Travel Methods, Recall Stone, stations `tms_` | page 20 · professions, tools, recipes, gadgets: page 19 |

When your page names an id someone else owns, **copy the owner's current spelling** (open the owner page and
check — do not guess).

## 2. Decisions on the reported conflicts

| Conflict | Decision |
|---|---|
| `d03_deepdelve` "Deepdelve Mines" ("delve" is banned) | **`d03_shaft_seven` "Shaft Seven Mines"** everywhere |
| Page 12 vs page 08/09 renames of dungeon items (`it_first_ember_lantern`, `leg_the_first_ember`, `uq_pells_hooded_lantern`, `set_emberbane_plate`, `set_deepdelver`, trinkets → souls) | **page 12's names win**: `it_ashmothers_coal_cage`, `leg_the_oldest_coal`, `uq_pells_quiet_hood`, `set_firebreaker_plate`, `set_deepshaft_harness`, and page 12 §21.7 for every trinket → `soul_` |
| Class file vs page 09 renames of class items | **class file wins** (e.g. `set_runesmith_anvilborn_aegis`, `set_tinker_forgefire_rig`, `set_priest_mantle_of_the_twin_lamps`, `set_enchanter_gossamer_vestments`, `set_shadow_dancer_duskwoven_garb`, `leg_mantle_of_the_other_road`, `uq_ash_censer`, `uq_rattle_of_storm_teeth`, `uq_blaze_rime_signet`, Oakhide Wraps). Open the class file to copy the id |
| Page 13 vs page 09 world-boss items | **page 13 wins** (`uq_tearstorm_lens`, `uq_stags_lantern` as a necklace, `b_midwinter_stag`, `b_tearstorm_herald`, `it_mount_drowned_horse`) |
| Fennec: Ash Fennec (01/14) vs Dune Fennec (10) | **`m_sand_dune_fennec` "Dune Fennec"** |
| Keywarden NPC: `npc_el_deepwarden_orrin` (14) / `npc_kf_depthwarden_orrin` (07) | **`npc_kf_depthwarden_orrin`** (no `_el_` ids may remain; `q_el_*`→`q_kf_*`, `q_vs_*`→`q_si_*`, `q_et_*`→`q_kf_*`) |
| Unlock quest ids on page 07 vs page 14 | **page 14 wins**: `q_hv_a_bed_by_the_fire` (Recall Stone), `q_mf_the_right_tool` (Harvesting), `q_mf_what_the_fen_gives_back` (choose a profession), `q_hc_the_waywardens_oath` (Travel Methods + waystone teleports), `q_kf_the_harder_road` (Challenge mode), `q_kf_the_deep_road` (Depth past 60). No `q_unlock_travel_methods`, `q_kf_the_hard_road`, `q_kf_the_deep_count` |
| `soul_second_self` used by mage and chronomancer | chronomancer keeps it; **mage's becomes `soul_mirrored_self`** |
| Shaman's Rain Heron vs druid's Heron form | shaman's beast is the **Rain Crane** (all heron words in the shaman file become crane; `shaman_herons_rain` → `shaman_cranes_rain`, `soul_heron_who_stayed` → `soul_crane_who_stayed`). The druid keeps Heron |
| Shadow dancer swap: Veilswap → "Shadeswap" (02/03) vs "Shadowswap" (class) | **Shadowswap** |
| Shadow dancer's old Veiled state | **Shrouded** (page 05). "Unseen" is only the rogue's hit type |
| Generic −50% healing status "Wounded" vs rogue "Wounded" | generic one is **Festering** (page 05); rogue keeps Wounded / Wounds |
| Cleric `self_cast_fallback` default On vs page 04 Off | **Off by default** everywhere (W8: no silent self-cast) |
| Travel spell numbers in class files vs page 20 | **page 20 wins**; class files state the numbers page 20 gives (or just cite page 20) |
| "Magic" as the name of the blue rarity tier | **Uncommon** (the owner's "magic items") |
| The tank taunt | **Provoke** |
| Tinker combat deployables | **Devices** (Engineering's socketables are **Gadgets**) |
| Oakhollow starters' Recall Stone | starts bound at **Oakhollow**'s waystone (Brightwater starters: the First Waystone) |
| Wand and staff basic attacks | carry `tag_spell` as well as `tag_basic_attack` (page 05 confirms) |
| Personal loot | no Need/Greed option anywhere (the owner said personal loot only) |
| Link `13-RAIDS-WORLD-BOSSES.md` | → `13-WORLD-BOSSES.md` (raid content → `WISHLIST.md`) |

## 3. Final grep (case-insensitive) — fix every hit that is not a legitimate use

`mythic`, `heroic`, `keystone` (Farhold perk-forest "keystone" nodes may stay in reuse notes only), `hearthstone`,
`horde`, `alliance`, `soulbound`, `bind on`, `renown`, `legacy`, `rested`, `honored`, `revered`, `exalted`,
`fury`, `rage` (as a resource), `combo point`, `stealth` (as a rogue ability; the `hidden` status is fine),
`garrote`, `cheap shot`, `prowl`, `maul`, `rake`, `swipe`, `barkskin`, `totem` (enemy totem objects may stay),
`soul shard`, `corruption`, `arcane charge`, `blink`, `counterspell`, `lay on hands`, `consecrat`,
`mass res`, `healing wave`, `last stand`, `mirror image`, `leap of faith`, `hellfire`, `starfall`, `chi`
(the word), `attune`, `daily`, `dailies`, `weekly` (only the Monday loot limit), `skyway`, `flight path`,
`roost`, `delve`, `oathstone`, `sigil`, `glory`, `laurel`, `battleground`, `arena` (a boss arena is fine),
`war mode`, `copper`, `silver` (coin), `night`, `torch`, `lantern` (as a light item), `light slot`,
`emberthrone`, `veilspire`, `ember` and `veil` in any name (not "member", "remember", "December", the
prototype name "Emberveil" in reuse paths, or the old names inside a rename table / "was …" note),
`rain heron`, `shadeswap`, `deepdelve`, `npc_el_`, `q_el_`, `q_vs_`, `q_et_`, `raid` (only WISHLIST pointers,
"raider" monsters, and history notes), `r01`–`r05` (only WISHLIST pointers / "was r04" notes).

## 4. Report

Per file: what you changed; anything you could not resolve (with the two spellings); leftover grep hits kept
on purpose. Under 50 lines.
