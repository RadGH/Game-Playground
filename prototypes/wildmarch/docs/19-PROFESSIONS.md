# WILDMARCH — Design Bible, page 19: Professions

**Status:** v0.1 draft — 2026-09-30 (new in round 2)

This page owns **Harvesting** (the one gathering skill every character has), the **seven crafting
professions** (each character picks one), recipes, profession materials, the **Gadget** socketable that
Engineers make, and the two profession magic-find stats. It follows canon [00 §4 and §12.3](00-OVERVIEW.md#123-new-systems-the-owners-new-feedback).

Other pages own the neighbouring facts; this page links to them by section name:

| Fact | Owner |
|---|---|
| Socket kinds, which items get which sockets and how many, gem effects per item type, jewel affixes, souls | [page 08](08-ITEMS.md), section "Sockets" |
| The seven magic-find stats as a family, drop tables, item quantity and item rarity | [page 08](08-ITEMS.md), section "Magic find" |
| The salvage bench (Scrap / Essence / Dust), bench actions everyone can use | [page 08](08-ITEMS.md), section "Salvage and the bench" |
| Potions, elixirs, flasks, food, scrolls as items (names, effects, vendor prices) | [page 08](08-ITEMS.md), section "Consumables" |
| The level-9 unlock and its quest | [page 07](07-PROGRESSION.md), section "The feature-unlock ladder" |
| Faction standing tiers (Hunted … Sworn) and quartermasters | [page 07](07-PROGRESSION.md) "Reputation", [page 01](01-WORLD-LORE.md) "Factions" |
| Keys | [page 02](02-CONTROLS.md) · Screens: [page 03](03-UI-SCREENS.md) · Settings: [page 04](04-SETTINGS.md) |
| The Trading Post and mail (how crafted goods are sold) | [page 15](15-SOCIAL-ONLINE.md) |

---

## Contents

1. [What Farhold already has](#1-what-farhold-already-has)
2. [The shape of the system](#2-the-shape-of-the-system)
3. [Skill, profession XP and colours](#3-skill-profession-xp-and-colours)
4. [Profession magic find: +skill and +XP](#4-profession-magic-find-skill-and-xp)
5. [Harvesting](#5-harvesting)
6. [Harvesting tools](#6-harvesting-tools)
7. [Nodes: tiers, timing, yield, respawn](#7-nodes-tiers-timing-yield-respawn)
8. [The six harvesting activities](#8-the-six-harvesting-activities)
9. [Every region's nodes](#9-every-regions-nodes)
10. [Refining (open to everyone)](#10-refining-open-to-everyone)
11. [Crafting professions — shared rules](#11-crafting-professions--shared-rules)
12. [Blacksmithing](#12-blacksmithing)
13. [Leatherworking](#13-leatherworking)
14. [Tailoring](#14-tailoring)
15. [Jewelcrafting](#15-jewelcrafting)
16. [Enchanting](#16-enchanting)
17. [Engineering and Gadgets](#17-engineering-and-gadgets)
18. [Alchemy](#18-alchemy)
19. [Who makes what — the cross-profession map](#19-who-makes-what--the-cross-profession-map)
20. [Materials list](#20-materials-list)
21. [Stations](#21-stations)
22. [Craft orders](#22-craft-orders)
23. [Unlock and teaching](#23-unlock-and-teaching)
24. [UI hooks, keys and settings](#24-ui-hooks-keys-and-settings)
25. [Data shapes](#25-data-shapes)
26. [Reuse map](#26-reuse-map)
27. [Open questions](#27-open-questions)

---

## 1. What Farhold already has

Wildmarch builds on Farhold's gathering and bench code. The mechanics below exist and work; this page
changes what they are *for* (a shared online world, one skill, seven professions) rather than rewriting
them.

| Farhold piece | What it does today | Path | Wildmarch use |
|---|---|---|---|
| Tool slot + tool items | A **Tool** is a built item in `player.equipment.tool` with a `toolKey` and a `tier`. Rarity sets `speed` (Farhold's Normal 1.0 · Magic 1.18 · Rare 1.4 · Legendary 1.75 — Wildmarch calls these Common / Uncommon / Rare / Legendary), `yield` (0 / +10% / +22% / +40%), `reach` and `scan`. One tool is pick **and** axe | `prototypes/farhold/js/tools.js` `makeTool`, `data/tools.json` | **reuse**, split into six tool kinds (§6) |
| Tool tier vs hardness | `canWork()` passes when the tool's tier ≥ the node's `hardness` (0 hands … 3 powered) | `js/tools.js` `canWork`, `data/resources.json` `tools` | **reuse**: node tier vs tool tier (§7) |
| Gathering bar | `createGathering()`: a progress bar over the node; base seconds `soft 1.2 / prop 2.4 / seam 3.2`, divided by tool speed; cancelled if you move more than **3.2 m** (`moveCancel`); `onDone` fires once and you press again to keep going | `js/tools.js` `createGathering` | **reuse** (§7.2), plus "damage cancels" |
| Work clips | `WORK_CLIPS`: `dig` (pickSwing), `chop` (chopSwing), `forage` | `js/tools.js`, `avatar-3d/js/chibi2-motion.js` | **reuse**; new `skin` and `cast` clips (new) |
| Harvest ledger | `felled` (per prop key, with a regrow clock), `cleared` circles, both saved | `js/props.js` | **reuse** as the *personal* node ledger (§7.5) |
| Node kinds and respawn | 17 node kinds with `baseYield`, `amountBand`, `respawnSeconds` (e.g. ore outcrop 5,400 s, tree 21,600 s) and richness decay 0.92 per regrow down to 0.5 | `data/resources.json` `nodeKinds`, `respawn` | **changed**: per-player timers in minutes (§7.5); no richness decay |
| Scanner | A device that sweeps 110 / 210 / 380 m and pins what it finds to the map for good | `js/tools.js` `createScanner`, `data/tools.json` `devices` | **reuse** as the Engineer's Prospector's Lens (§17.6) |
| Bench | Salvage into Scrap / Essence / Dust; forge, promote, reweave, brand, all priced by `quote()` | `js/craft.js`, `data/crafting.json` | **kept** as the everyone-bench (page 08); professions sit beside it |
| Station screens | `E` at a machine opens that machine's own screen, its recipe list drawn from a `station` block in the data | `js/station-ui.js` | **reuse** for every profession station (§21) |
| Work units | Work is a count of units (default 10) filled by the player's swings, a machine or a worker, all through one `addWork` | `js/work.js` | **reuse** for craft time (§11.7); machines and workers are dropped |

Farhold has no skill levels, no professions and no recipes learnt one by one. Those are new.

---

## 2. The shape of the system

- **Harvesting** — one skill, **1–300**, that **every** character has. It covers six activities:
  **Mining**, **Herb gathering**, **Logging**, **Skinning**, **Fishing** and **Salvaging**. Each needs the
  matching **tool** in the tool slot. There is one number for all six, so a character who mined to 180 can
  pick herbs of the same tier. (new)
- **Crafting** — each character picks **one** of seven professions: **Blacksmithing, Leatherworking,
  Tailoring, Jewelcrafting, Enchanting, Engineering, Alchemy**. Each has its own skill **1–300**. You can
  change profession (§11.9), but only one is active. (new)
- **Refining** (ore → bars, hides → leather, fibre → bolts) is **not** a profession. Anyone can refine at a
  town station (§10).
- **The everyone-bench** stays: salvage, forge a Common base, promote, reweave, brand, as page 08 describes.
  Professions make things the bench cannot: chosen-affix gear, consumables, gems, gadgets, tools, enchants.
- **Everything crafted is tradeable** (canon: no binding). A player who picked Alchemy buys a Blacksmith's
  sword on the Trading Post or posts a **craft order** (§22).
- **Unlock: level 9** (canon ladder), one quest in Reedhollow teaches Harvesting, hands you a first tool and
  sends you to pick a crafting profession (§23).

**Why one gathering skill.** The owner asked for it, and it is the right call for a small-group action
game: nobody is locked out of a material because they chose the wrong gathering profession at level 9, and
every character in a party of five can pull from the same vein.

**Why one crafting profession.** It makes crafters worth knowing. Seven professions across five party members
means a group almost always has two or three of them between them, and the rest move through trade.

---

## 3. Skill, profession XP and colours

One rule set covers Harvesting and all seven crafting professions.

### 3.1 Skill and profession XP

| Rule | Value |
|---|---|
| Skill range | **1–300** per profession (Harvesting counts as one) |
| How skill rises | through **profession XP** (pXP). **100 pXP = 1 skill point** |
| pXP per action | set by the action's **colour** against your **real** skill (below) |
| Tiers | six tiers, **50 skill apart**: T1 1 · T2 50 · T3 100 · T4 150 · T5 200 · T6 250 |
| Skill cap by rank (crafting only) | your trainer rank caps your skill (§11.3). Harvesting has no ranks; its caps are tools and node access |
| Character XP | gathering and crafting give **no character XP**, except a **first find**: the first time a character gathers each material, it earns the XP of one normal kill of its own level (page 07 owns the kill XP number). 77 materials → 77 first finds |
| First craft | the first time you craft each recipe gives **double pXP** (an orange first craft = 200 pXP = 2 points) |

### 3.2 Colours

An action's colour is set by how far your **real** skill is above the action's requirement (`req`):

| Colour | Your real skill | pXP per action | Nodes (harvest) | Recipes (craft) |
|---|---|---|---|---|
| **Red** | below `req` (you cannot do it yet, even counting magic find — see §4) | — | shown red, "Needs Harvesting 150" | recipe listed red, "Needs 150" |
| **Orange** | `req` … `req + 24` (nodes) / `req` … `req + 14` (recipes) | **100** (1 point) | orange label | orange name |
| **Yellow** | `req + 25` … `+49` / `req + 15` … `+29` | **60** | yellow | yellow |
| **Green** | `req + 50` … `+74` / `req + 30` … `+44` | **25** | green | green |
| **Grey** | `req + 75` and up / `req + 45` and up | **0** | grey | grey |

Colour always uses your **real** skill, never your effective skill (§4). That way magic find never makes an
action greyer and costs you progress.

**Pace, worked through.** From T2 (50) to T3 (100) on T2 nodes: 50–74 is orange (25 gathers), 75–99 is
yellow (25 ÷ 0.6 = 42 gathers). About **67 gathers per 50 points**, **about 400 gathers from 1 to 300**. At
3 s a gather plus ~20 s walking, that is about 2.5 hours of pure gathering spread over a 103-hour climb.
Crafting is similar: about **400 crafts from 1 to 300** if you stay on orange and yellow recipes. The real
gates are **tools** (which carry a level), **node access** (T4 nodes live in level-28+ regions), and
**trainer ranks** (which carry a level).

---

## 4. Profession magic find: +skill and +XP

Canon lists seven magic-find stats (page 08 owns the family). Two are this page's:

| id | Stat | What it does | Stacking | Cap |
|---|---|---|---|---|
| `mf_prof_skill` | **+Profession skill** | adds a flat **+N** to your **effective skill** in **every** profession you have (Harvesting and your crafting profession) | adds up from all sources | **+40** total |
| `mf_prof_xp` | **+Profession XP** | multiplies every pXP you earn by `1 + N%` | adds up from all sources | **+100%** |

### 4.1 Effective skill

`effective = real skill + mf_prof_skill` (capped as above; the harvest-only tool affix *Prospector's*
counts toward the same +40 cap).

Effective skill is used for **three** things and nothing else:

1. **Access — do a tier early.** A node or recipe is usable when `effective ≥ req`. With +40 you can open
   T3 nodes at real skill 60 instead of 100. The **tool tier** (§6) and the **trainer rank** (§11.3) still
   apply, so magic find moves you up inside the tier your tool and rank already allow, never past them.
   An action you reach only through effective skill counts as **orange** for pXP.
2. **Better harvesting.** `surplus = effective − req` (min 0):
   - gather time **−1% per 5 surplus**, down to **−25%**;
   - bonus-unit chance **+1% per 5 surplus**, up to **+30%** (on top of the tool's own bonus);
   - rare-find chance **+0.1% per 5 surplus**, up to **+3%**.
3. **Better crafting rolls.** `surplus = effective − recipe req` (min 0):
   - **roll floor**: every random affix value on a crafted item rolls in the top part of its range —
     `floor = min(40%, surplus × 0.4%)`. At 100 surplus every value rolls between 40% and 100% of its range;
   - **masterwork chance** `= min(20%, 5% + surplus × 0.1%)`: a consumable recipe makes **double** its output;
     a gear recipe rolls its random affixes one **affix tier** higher (page 08 "Affix tiers by item level");
     a gadget gets **+1 budget point** (§17.3).

### 4.2 Where the two stats come from

| Source | `mf_prof_skill` | `mf_prof_xp` | Notes |
|---|---|---|---|
| Ring / necklace affix *of the Artisan* / *of Diligence* | +3 … +12 (by item level) | +5% … +20% | page 08 affix table owns the ranges |
| Gem in a **jewellery** socket (jewellery gems give secondary stats and magic find, canon §12.3) | **Peridot** (`gem_peridot_1`…`_5`): +1 … +5 | **Amber** (`gem_amber_1`…`_5`): +3% … +15% | page 08 §13.4 owns gem effects |
| Jewel affix | +5 … +15 | +8% … +25% | page 08 |
| Gadget with a **Fortune core** (§17.3) | +1 per point | +3% per point | Engineer-made |
| Harvesting tool affix *Prospector's* | +3 … +15 (harvest only) | — | tool only (§6.3) |
| Harvesting tool affix *Diligent* | — | +5% … +20% (harvest only) | tool only |
| Alchemy: **Elixir of the Artisan** (`it_elixir_artisan`) | +10, 60 min | — | a guardian elixir (page 08 elixir rules) |
| Alchemy: **Draught of Diligence** (`it_draught_diligence`) | — | +25%, 60 min | a battle elixir |
| Food: **Maker's Supper** (`it_food_makers_supper`) | +5, 30 min (Well Fed) | — | innkeepers, 60 gold |
| Profession garb: crafted **Apron**, **Gloves** and **Goggles** (one per profession, back/hands/head, T3+) | +4 / +4 / +4 | +5% each | Tailoring and Leatherworking make them (§13, §14) |

Nothing grants either stat permanently. There is no guild, account or reputation bonus to pXP.

---

## 5. Harvesting

| Fact | Value |
|---|---|
| id | `prof_harvesting` |
| Who | every character, from **level 9** (§23) |
| Skill | 1–300 (§3) |
| Activities | Mining `hv_mining` · Herb gathering `hv_herbs` · Logging `hv_logging` · Skinning `hv_skinning` · Fishing `hv_fishing` · Salvaging `hv_salvage` |
| Tool | the matching tool in the **tool slot** (canon §4: the 15th slot). Swapping is automatic (§6.2) |
| Input | `E` held on a node (`interactHold`, page 02) — or a basic attack on the node while the tool is out, as in Farhold |
| Output | materials into the **materials bag** (no cap, page 08 "Materials") |
| Quest objects | quest herbs, quest crates and the like (e.g. the level-3 herb quest) are quest items, need no tool, give no pXP, and are separate from nodes |
| Mounted | pressing `E` on a node dismounts you first (page 02) |
| In combat | allowed; **any damage cancels** the bar (Farhold only cancelled on moving; new) |
| Danger | nodes sit in the open world among the region's monsters. No node is ever inside a dungeon's instance, except fishing pools and salvage piles placed on purpose (page 12 may list them) |

---

## 6. Harvesting tools

### 6.1 Six kinds, six tiers

Farhold's single "pick and axe" works because Farhold has two activities. Wildmarch has six, and the owner's
rule is "as long as they have the **required tool** equipped", so each activity has its own tool kind.

| Kind | id stem | Activity | Chibi 2 held part | Work clip |
|---|---|---|---|---|
| Pick | `it_tool_pick_t<n>` | Mining | pickaxe (reuse `chibi2-weapons.js` hammer haft + new head) | `dig` (reuse) |
| Sickle | `it_tool_sickle_t<n>` | Herb gathering (herbs, fibre plants) | sickle (new) | `forage` (reuse) |
| Hatchet | `it_tool_hatchet_t<n>` | Logging | axe (reuse) | `chop` (reuse) |
| Skinning knife | `it_tool_knife_t<n>` | Skinning | dagger (reuse) | `skin` (new clip: kneel, three cuts) |
| Rod | `it_tool_rod_t<n>` | Fishing | rod + line (new) | `cast` (new clip: cast, idle, strike) |
| Pry bar | `it_tool_prybar_t<n>` | Salvaging | crowbar (new) | `dig` (reuse) |

| Tier | Name | Level to equip | Opens node tier | Vendor (Common) | Vendor price (gold) |
|---|---|---:|---|---|---:|
| T1 | **Flint** | 9 | T1 | quest gift (all six); tool merchants in every hub | 5 each |
| T2 | **Iron** | 12 | T1–T2 | tool merchants from Highcourt/Anvilgate on | 60 |
| T3 | **Redsteel** | 20 | T1–T3 | Oasis of Tamar, Silverbough | 300 |
| T4 | **Blacksteel** | 30 | T1–T4 | Fort Ashfall, Rimehold | 1,000 |
| T5 | **Lodestone** | 42 | T1–T5 | Saltmarch, Waystone Camp | 2,600 |
| T6 | **Firegold** | 52 | T1–T6 | Last Light | 5,000 |

Common tools are always on a vendor so no one is ever blocked by a profession they did not pick. Uncommon to
Epic tools come from **Engineering** (§17.5) and drops (rares 1%, harvest rare finds 0.5%). Two or three
**Unique** named tools per kind drop from world bosses and secret bosses (page 09 may list them).

### 6.2 The tool slot and automatic swapping

- The tool slot holds **one** tool. The other tools live in a **tool roll** (`it_tool_roll`, a free 6-slot
  pouch given with the level-9 quest that does not use bag space; it takes tools only).
- Pressing `E` on a node **automatically puts the matching tool in the tool slot** from the roll or your bags,
  instantly, out of combat or in it (the same idea as Farhold's boat auto-equipping in deep water, reuse:
  `js/player.js`). Setting `set.gameplay.autoToolSwap` (default **on**) turns this off for players who want to
  swap by hand.
- If you own no tool of that kind and tier, the node says why: "Needs a Redsteel pick or better. Tool
  merchants in Oasis of Tamar and Silverbough sell one."
- A tool gives **no combat stats** and **no combat affixes**, so swapping never changes your fighting numbers.
- The tool shows in the hand only while gathering; otherwise it hangs on the belt (Chibi 2 `belt_pouches`).

### 6.3 Tool rarity and affixes

Farhold's rarity table, restated on Wildmarch's rarity names:

| Rarity | Gather speed | Bonus-unit chance | Reach (m, added to 4) | Tool affixes |
|---|---:|---:|---:|---:|
| Common | ×1.00 | 0% | +0 | 0 |
| Uncommon | ×1.10 | 5% | +0.4 | 1 |
| Rare | ×1.20 | 10% | +0.8 | 2 |
| Epic | ×1.35 | 18% | +1.2 | 3 |
| Unique | ×1.50 | 25% | +1.4 | its named power + 2 |

**Tool-only affixes** (reuse the idea of Farhold's `SLOT_AFFIXES`; values scale with the tool's tier):

| id | Name | Effect (T1 → T6) |
|---|---|---|
| `aff_tool_prospector` | Prospector's | +3 → +15 Harvesting effective skill (counts toward the +40 cap, §4) |
| `aff_tool_swift` | Swift | gather time −5% → −15% |
| `aff_tool_bountiful` | Bountiful | bonus-unit chance +3% → +10% |
| `aff_tool_keen` | Keen-eyed | rare-find chance +0.5% → +2% |
| `aff_tool_diligent` | Diligent | Harvesting pXP +5% → +20% |
| `aff_tool_steady` | Steady | the first hit you take in 10 s does not cancel the bar |
| `aff_tool_reaching` | Long-hafted | reach +0.5 → +1.5 m |

### 6.4 Magic find while harvesting

Two of page 08's general magic-find stats also work on nodes at **a quarter strength** (proposed; page 08
may retune): **item quantity** adds to the bonus-unit chance (+20% item quantity → +5% bonus units), and
**item rarity** adds to the rare-find chance (+20% item rarity → +0.5% rare finds, counted as a percentage of
the base rare-find chance, not flat). Gold find, XP gain and reputation gain do nothing on nodes.

---

## 7. Nodes: tiers, timing, yield, respawn

### 7.1 Node tiers

| Tier | `req` (skill) | Tool tier | Where (canon §7 regions) | Character levels | Crafting item level fed |
|---|---:|---|---|---|---|
| T1 | 1 | Flint+ | Hearthvale, Mossfen, Highcourt crownlands | 1–12 | 6–10 |
| T2 | 50 | Iron+ | Greyridge (and Mossfen's high sub-zones, 20% of its nodes) | 10–18 | 14–18 |
| T3 | 100 | Redsteel+ | Sunscar, Whisperwood | 16–30 | 22–28 |
| T4 | 150 | Blacksteel+ | Cinder Steppe, Frostmantle | 28–42 | 32–38 |
| T5 | 200 | Lodestone+ | Drowned Coast, Riftmarch | 40–54 | 44–50 |
| T6 | 250 | Firegold+ | Kingsfire, Spire Isle | 52–60 | 54–60 |

Each region's highest sub-zone (page 01 "Sub-zones") holds **20%** of its nodes one tier up, so the next tier
starts appearing before you leave. A node's colour is shown on its floating label and on the minimap dot.

### 7.2 Gather time

`time = base × (1 − surplus bonus, max 25%) ÷ tool speed`, minimum **0.6 s** (Farhold's floor was 0.2 s).

| Activity | Base seconds per pull | Farhold equivalent |
|---|---:|---|
| Herb gathering | 1.5 | `softSeconds` 1.2 |
| Skinning | 2.0 | new |
| Logging | 2.4 | `propSeconds` 2.4 |
| Salvaging | 2.8 | new |
| Mining | 3.2 | `seamSeconds` 3.2 |
| Fishing | a bite after **3–12 s** (random), then a **1.2 s** strike window (§8.5) | new |

Holding `E` starts the next pull when one finishes, until the node is empty. Moving more than **3.2 m** from
where you started (reuse `moveCancel`) or taking any damage cancels the pull in progress; finished pulls are
kept.

### 7.3 Pulls and yield

| Activity | Pulls per node | Units per pull | Rich node |
|---|---|---|---|
| Mining (vein) | 3–5 | 1–2 ore | ×2 pulls, 1 guaranteed rough gem |
| Herb gathering (plant) | 1 | 2–4 herbs (fibre plants 3–5 fibre) | 3 pulls, 1 guaranteed rare herb of the tier |
| Logging (marked tree) | 3–4 | 2–3 wood | a **great tree** (Farhold megaflora): 8 pulls, 3–4 wood each, 4.0 s each (reuse `data/megaflora.json` `seconds`) |
| Skinning (a body) | 1 | 1–3 hides (+1 per rarity step: champion +1, rare +2, boss +3) | — |
| Salvaging (wreck pile) | 2–3 | 1–3 parts + page 08's Scrap/Essence (§8.6) | 5 pulls, 1 guaranteed Dust |
| Fishing (pool) | 3–5 catches | 1 fish | 6 catches, 1 guaranteed rare catch |

**Rich nodes** are **5%** of placements (a glint on the node). **Bonus unit**: each pull has the tool's
bonus-unit chance + surplus bonus + magic-find share (§6.4) of giving one extra unit. **Rare finds**: base
**2%** per pull (rough gem from ore, rare herb, heartwood, a pristine hide, a sealed crate from salvage, a
coffer from fishing — the region tables list them).

pXP is earned **per pull** (not per node), at the node's colour.

### 7.4 Nodes are personal — decided

**Every player sees the same nodes in the same places, and each player harvests their own copy.** When you
empty a vein it goes dim **for you**; the player beside you still sees it full and can mine it.

Why:

1. **Five-player focus.** In a party, nobody should lose a node to a friend, and nobody should race a
   stranger to one. Personal nodes make "we all mine this seam" true.
2. **Personal loot is canon** (§12.1 W18). Personal nodes are the same rule applied to the ground.
3. **No camping, no stealing.** A shared node rewards whoever taps it first; the online genre's worst
   gathering stories are exactly that. Personal nodes make it impossible.
4. **The server cost is small.** A node is a fixed world object; the only per-player state is "when does
   this node come back *for me*", which is the Farhold harvest ledger (`felled` map with a regrow clock)
   moved from the save to the server.

What stops infinite supply: gather time, per-player respawn (below), node density, and tool/skill gates. Page
08's economy watches the Trading Post price of each material; the respawn minutes and densities are the dials
(`data/balance.json` `harvest`).

**Skinning** is personal the same way: every player who had **loot rights** on a body (page 08 personal loot)
may skin it once for themselves; the body stays **90 s** for anyone with rights, **+30 s** after the last
skinning started.

### 7.5 Respawn (per player)

| Tier | Vein / plant / tree / pool / wreck comes back for you after | Rich node |
|---|---:|---:|
| T1 | 4 min | 20 min |
| T2 | 5 min | 20 min |
| T3 | 6 min | 25 min |
| T4 | 7 min | 25 min |
| T5 | 8 min | 30 min |
| T6 | 10 min | 30 min |

Real minutes, counted by the server whether you are online or not. A dim node shows a small clock on hover
("Back for you in 3:40"). Farhold's slow richness decay (`richnessDecay 0.92`) is **dropped**: it was there to
push a base-builder out to fresh ground, and Wildmarch has no base.

### 7.6 Density

Nodes per square kilometre of open land (a region's biome mix scales them; page 01 "Region footprint table"
gives the areas):

| Activity | Base per km² | Scaled up in | Scaled down in |
|---|---:|---|---|
| Mining veins | 8 | mountains, mesas, volcanic ×1.4–1.6 | wetland ×0.5, forest ×0.6 |
| Herb and fibre plants | 14 | wetland, forest ×1.4–1.5 | desert, volcanic ×0.5 |
| Marked trees | 10 | forest ×1.6 | desert ×0.3 |
| Salvage piles | 2 | coast, war camps ×1.4–1.8 | forest ×0.6 |
| Fishing pools | 3 per km of shore or river bank | coast | — |

Counts per region are in §9.

---

## 8. The six harvesting activities

### 8.1 Mining (`hv_mining`)

Veins stand out of rock faces and boulders (reuse Farhold `ore_outcrop` / `deep_vein` art, with the R17 "rock
with ore growing out of it" look). Each pull gives ore; every pull has the rare-find chance of a **rough gem**
of the tier (T2+). Rough gems are cut by Jewelcrafters into page 08's gems (§15).

### 8.2 Herb gathering (`hv_herbs`)

Plants in their biome (reuse the playground's foliage sprites, `highdef-3d/js/kit/trees.js` flowers and
ferns). Two herb kinds per region, one **fibre plant** per tier (for Tailoring), and one **rare herb** per
tier that shows up only as a rare find or a rich plant.

### 8.3 Logging (`hv_logging`)

Only **marked trees** are harvestable — a notch and a tie of red cloth on the trunk — so the forest does not
turn into a clear-cut for everyone. A felled tree drops to a stump for you (reuse Farhold's `felled` ledger and
the stump model) and grows back after the respawn time. **Great trees** (Farhold's choppable megaflora) are rare
nodes with 8 pulls (§7.3). Wood is not refined; recipes use it raw.

### 8.4 Skinning (`hv_skinning`)

Any **beast**, **dragonkin** and hide-bearing **aberration** body (page 10 families) can be skinned; a body's
hide tier follows the monster's level (1–12 T1 … 52–60 T6). Spiders give **silk** instead of hide; scaled
things give **scale**; furred northern things give **fur**. The skinning knife's tier must be ≥ the hide tier.

### 8.5 Fishing (`hv_fishing`)

- **Pools** (ripples, a fish jumping every 4–8 s) sit on rivers, lakes and coasts. Fishing open water
  anywhere else is allowed at **half** the catch rate and never gives a rare catch.
- Hold `E` facing water within **14 m** (rod reach): cast. After **3–12 s** the float dips (a splash and a
  sound cue). You have a **1.2 s** window to press `E` again (**Strike**). Hit it: a catch. Miss it: nothing,
  no pXP, the pool is not used up.
- A pool gives 3–5 catches. pXP per catch at the pool's colour.
- **Rare catches** (2%): a sealed coffer (`it_sunken_coffer_t<n>`, opens for gold and a random Uncommon+ item
  of the tier), a rough gem, a message in a bottle (starts a treasure-hunt quest, page 14), and in
  T2+ fresh water a **Mossback Tadpole** (0.2%; see open question on swimming mounts, §27).
- Fish feed **Alchemy** (oils, §18) and can be traded to **innkeepers**, who cook 5 fish of a tier into that
  tier's regional food from page 08 "Food" for a small fee (e.g. 5 Fen Eels → Fenland Eel Stew).

### 8.6 Salvaging (`hv_salvage`)

Wreck piles — broken carts, collapsed mine carts, siege wreckage, shipwreck timbers, broken constructs —
and the bodies of **construct** monsters. A pull gives page 08's **Scrap Iron** (always), a chance of **Bound
Essence** (T3+) and **Resonant Dust** (rich piles, T5+), plus the tier's **engineering part** (§20). This is
the only activity that feeds the everyone-bench as well as a profession.

---

## 9. Every region's nodes

Counts are for the whole region (§7.6 densities × page 01's areas × biome factors), open land only.

| Region | Tier | Veins | Plants | Trees | Wrecks | Ore | Herbs (+ fibre) | Wood | Hides / silk / scale | Fish | Salvage part | Rare finds |
|---|---|---:|---:|---:|---:|---|---|---|---|---|---|---|
| Hearthvale | T1 | 96 | 168 | 144 | 24 | Tin Ore | Farrowbloom, Hedge Nettle (+ Flax) | Oak | Rough Hide (boars, wolves), Cobweb Silk (spiders) | River Perch (the Wend), Hearthsea Sprat (coast) | Bent Bolts (farm carts) | Goldthread (herb), Oak Heartwood |
| Mossfen | T1 (20% T2) | 54 | 265 | 108 | 16 | Bog Iron | Bogbean, Marshcandle (+ Flax) | Willow | Rough Hide, Bogskin (frogs, lizards) | Fen Eel | Bent Bolts (peat barges) | Goldthread, a Mossback Tadpole (pools, 0.2%) |
| Highcourt crownlands | T1–T2 | 22 | 63 | 36 | 5 | Tin, Iron | Farrowbloom, Stonemint | Oak, Pine | Rough Hide | River Perch (Slowwater) | Bent Bolts | — |
| Greyridge | T2 | 256 | 196 | 180 | 40 | Iron Ore, Coal | Stonemint, Kettleroot (+ Hemp) | Pine | Highland Hide, Highland Wool (goats) | Highland Trout | Cog Gears (mine carts) | rough Chipped gems, Kingsbloom (herb) |
| Sunscar | T3 | 240 | 175 | 75 | 60 | Redcap Ore | Sandthistle, Mesa Sage (+ Desert Cotton) | Ironwood | Dune Scale (lizards), Dune Hide | Oasis Carp | Coil Springs (glass-tomb debris, caravans) | rough Flawed gems, Sunpetal |
| Whisperwood | T3 | 108 | 472 | 360 | 27 | Gold Ore | Moonpetal, Oldbark Moss (+ Desert Cotton) | Moonoak | Moonpelt (stags, wolves), Moonsilk (spiders) | Moonfin | Coil Springs | rough Flawed gems, Sunpetal, great trees ×3 |
| Cinder Steppe | T4 | 224 | 392 | 140 | 78 | Blackstone Ore | Ashgrass, Warcap (+ Ashflax) | Ashwood | Steppe Hide, Ashsilk | Ash Pike | Siege Pins (Ashtusk war camps) | rough Plain gems, Bloodroot |
| Frostmantle | T4 | 336 | 252 | 210 | 48 | Rime Iron | Frostbell, Snowvetch (+ Ashflax) | Rimepine | Frost Fur, Steppe Hide | Ice Char (through ice holes) | Siege Pins (frozen longships) | rough Plain gems, Bloodroot |
| Drowned Coast | T5 | 154 | 302 | 144 | 86 | Saltiron Ore | Saltwort, Drowned Lily (+ Sea Silk) | Drownwood | Tideskin (sharks, eels), Reefsilk | Kingfish (sea), Coast Eel | Tidebrass Works (shipwrecks) | rough Flawless gems, Pale Lotus |
| Riftmarch | T5 | 202 | 235 | 126 | 59 | Lodestone | Driftbloom, Loosefern (+ Sea Silk) | Floatwood | Rift Chitin (aberrations), Tideskin | Driftfin (pools that float) | Tidebrass Works (Unmade machinery) | rough Flawless gems, Pale Lotus |
| Kingsfire | T6 | 269 | 147 | 84 | 50 | Firegold Ore | Cinderleaf, Firethorn (+ Fire Cotton) | Charheart | Drake Scale, Firehide | Slagfin (lava-warm lakes) | Rune Cores (Legion war engines) | rough Radiant gems, Spirebloom |
| Spire Isle | T6 | 72 | 126 | 90 | 11 | Firegold Ore, **Starmetal** (rare veins only, 10%) | Mendwort, Spirebloom (+ Fire Cotton) | Paleheart | Drake Scale | Spirefin | Rune Cores | rough Radiant gems, Starmetal |

---

## 10. Refining (open to everyone)

Refining turns a raw material into a working one. It is **not a profession** and gives **no pXP**. Anyone can
refine any tier they could **gather** (effective Harvesting ≥ the tier's `req`), at town stations, using
Farhold's work units (reuse `js/work.js`: an order of N units, **1 unit per second** while you hold `E` or
leave it running while you stand within 6 m).

| Station (reuse: Farhold `data/structures.json` titles) | In | Out | Units per output | Fuel |
|---|---|---|---:|---|
| **Furnace** | 2 ore | 1 bar | 2 | none (town furnaces are kept lit) |
| **Furnace** (steel) | 2 Iron Ore + 1 Coal | 1 Steel Bar | 3 | — |
| **Tannery** | 2 hide / scale / fur | 1 leather | 2 | — |
| **Loom** | 3 fibre, or 2 wool / silk | 1 bolt of cloth | 2 | — |

Every hub has all three; smaller towns with `BN` (bench) have a Furnace (page 01 service codes). Queued work
keeps going while you stand near and stops if you walk off; it is not an idle machine.

---

## 11. Crafting professions — shared rules

### 11.1 The seven

| id | Profession | Makes (headline) | Main inputs | Station |
|---|---|---|---|---|
| `prof_blacksmithing` | **Blacksmithing** | metal weapons, heavy armour, shields, whetstones and weightstones | bars, coal, wood, leather | Anvil + Furnace |
| `prof_leatherworking` | **Leatherworking** | light and medium armour, bows, quivers, mount tack, bags (leather) | leather, scale, fur, wood | Tannery + Leather Bench |
| `prof_tailoring` | **Tailoring** | cloth armour, cloaks, sashes, bags, the tool roll, profession garb | bolts, silk, dyes | Loom + Tailor's Table |
| `prof_jewelcrafting` | **Jewelcrafting** | cut gems, rings, necklaces, circlets, Uncommon jewels, polishing and recutting jewels, **adding gem and jewel sockets** | rough gems, gold, bars | Gem Cutter |
| `prof_enchanting` | **Enchanting** | item enchants (glyphs), staves, wands, caster off-hands, travel scrolls, portal stones, disenchanting, **opening soul sockets** | glimmer/shards/prisms, essence, herbs, wood | Enchanter's Lectern |
| `prof_engineering` | **Engineering** | **gadgets**, **gadget ports**, harvesting tools, guns, crossbows, quiver fittings, contraptions, bombs, a clockwork mount | bars, engineering parts, wood, powder | Workshop |
| `prof_alchemy` | **Alchemy** | potions, elixirs, flasks, weapon oils, transmutes | herbs, fish, vials, essence | Alembic |

### 11.2 Recipe ladder and item level

A new recipe band opens every **25 skill**. Gear from a recipe has a fixed item level:

| Recipe `req` | 1 | 25 | 50 | 75 | 100 | 125 | 150 | 175 | 200 | 225 | 250 | 275 | 300 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tier | T1 | T1 | T2 | T2 | T3 | T3 | T4 | T4 | T5 | T5 | T6 | T6 | T6 |
| Gear item level | 6 | 10 | 14 | 18 | 22 | 28 | 32 | 38 | 44 | 50 | 54 | 58 | 60 |

Each profession has about **6–10 recipes per band** (~100 per profession, ~700 in all). The tables in
§12–§18 list what every band makes; the full recipe list lives in `data/recipes.json` (§25) and is generated
by a build tool from those tables, the way Farhold's `tools/build-uniques.mjs` builds uniques.

### 11.3 Trainer ranks

Your **rank** caps your skill. Ranks are bought from a trainer of your profession.

| Rank | Skill range | Character level | Training cost (gold) | Where |
|---|---|---:|---:|---|
| **Novice** | 1–50 | 9 | 10 | the Makers' Fair, Reedhollow (all seven), and every hub |
| **Apprentice** | 51–100 | 14 | 100 | every hub from Highcourt on |
| **Craftsman** | 101–150 | 22 | 500 | Highcourt, Anvilgate, Oasis of Tamar, Silverbough |
| **Adept** | 151–200 | 32 | 2,000 | Highcourt, Fort Ashfall, Rimehold |
| **Master** | 201–250 | 42 | 6,000 | Highcourt, Saltmarch, Waystone Camp |
| **Paragon** | 251–300 | 52 | 15,000 | Highcourt, Last Light |

The prices sit against page 08's target income (150 gold an hour in Hearthvale, 700 in Greyridge, 1,600 in
Whisperwood, 3,100 in Frostmantle, 5,200 in the Riftmarch, 6,500 in Kingsfire): each rank costs about **2–3
hours** of that band's income, which makes it the profession's main gold sink.

**Specialist trainers.** Highcourt has all seven at every rank. Regional hubs teach the professions of their
people up to Master: Anvilgate (Blacksmithing, Engineering, Jewelcrafting), Oasis of Tamar (Alchemy,
Jewelcrafting, Tailoring), Silverbough (Enchanting, Tailoring, Leatherworking), Rimehold (Leatherworking,
Blacksmithing), Saltmarch (Engineering, Alchemy, Tailoring), Waystone Camp (Enchanting, Engineering), Last
Light (all seven, Paragon). Page 01 owns the NPCs; proposed ids `npc_prof_<profession>_<town>`.

### 11.4 How you learn recipes

| Source | Share of recipes | What they are | How |
|---|---:|---|---|
| **Trainer** | ~60% | every band's standard recipes | bought one by one: `2 × req` gold (orange at 100 → 200 gold). Listed by colour |
| **Drops** | ~15% | better variants, named crafted items | a recipe item (`rcp_<prof>_<snake>`, tradeable) from rares (0.5%), bosses (Normal 2%, Challenge 5%), world bosses (10%), Depth chests (page 12). Right-click to learn; only characters of that profession can learn it |
| **Faction quartermasters** | ~20% | gadget frames and cores, faction-look gear, the best consumables | sold at **Welcome / Trusted / Kindred / Sworn** (page 07 tiers) by the seven factions' quartermasters (canon §12.2) — table below |
| **Quests** | ~5% | one recipe per rank-up quest; region specialities | page 14 owns quest ids |
| **Discovery** | Alchemy and Engineering only | variants of a recipe you already know | 2% per orange/yellow craft of a recipe that has a hidden variant; the variant is learnt on the spot |

**Faction recipes** (every faction sells recipes for at least two professions, at every level band, so a
faction met at level 5 still matters at 60):

| Faction | Professions it sells recipes for | Signature recipes |
|---|---|---|
| `fac_wardens` | Leatherworking, Engineering | Warden's Mail (medium set pieces), the Waywatch Lens contraption, trap kits |
| `fac_crown_assembly` | Blacksmithing, Tailoring | Crown plate, tabards, the Highcourt Greatshield |
| `fac_deepforge_clans` | Blacksmithing, Engineering, Jewelcrafting | **gadget frames** (all six tiers), rune-etched whetstones, deep-cut gems |
| `fac_greenhand` | Alchemy, Leatherworking, Tailoring | harvest elixirs, profession garb, herbal flasks |
| `fac_lantern_house` | Enchanting, Jewelcrafting, Engineering | **gadget cores**, rank III glyphs, Portal Stones |
| `fac_cutwater` | Engineering, Tailoring | fishing rods (Epic), sea-silk robes, tidebrass gadgets |
| `fac_quiet_wake` | Alchemy, Enchanting | holy water, banishing oils, glyphs against undead |

### 11.5 What a crafted item is

| Recipe kind | Rarity | Affixes | Notes |
|---|---|---|---|
| Standard gear (trainer) | **Rare** | **1 chosen** from the recipe's list of 4–6 + the rest random, as a Rare drop of that item level | the chosen affix rolls in the top half of its range |
| Faction / drop gear | **Epic** | **1 chosen** + random | |
| Paragon gear (250+) | **Epic** | **2 chosen** + random | about as strong as a Challenge-mode drop of ilvl 60 without its sockets |
| Crafted set pieces | Set | fixed | page 09 owns crafted sets; patterns come from quartermasters and drops |
| Consumables | — | — | stack of 1–5 per craft; masterwork doubles it (§4.1) |

- **Signed.** Crafted gear shows "Made by <name>" on the item card (page 03 item card).
- **Sockets.** Adding a socket is one of **page 08 §13.2's five actions**, and page 08 owns their rules and
  costs (one added socket per item in its whole life, never past the rarity's maximum, anyone can commission
  one through the trade window's Commission tab):

  | Action | Profession and skill | Adds |
  |---|---|---|
  | **Bore a Gem Socket** | Jewelcrafting 75 | +1 gem socket (Uncommon+) |
  | **Fit a Gadget Port** | Engineering 100 | +1 gadget socket (Uncommon+, not jewellery) |
  | **Set a Jewel Mount** | Jewelcrafting 175 | +1 jewel socket (Rare+) |
  | **Open a Soul Socket** | Enchanting 225 | +1 soul socket (Epic+, ilvl 30+; costs **Tear-glass Shards**, `mat_tearglass`) |
  | **Recut a Socket** | Jewelcrafting 250 | turns one empty socket into another kind the item allows |

  Blacksmiths, Leatherworkers, Tailors and Alchemists have no socket action.
- **No crafted Legendaries or Uniques.** Those stay drops (canon: loot you want to talk about).

### 11.6 Crafting skill-ups

pXP by recipe colour (§3.2): orange 100, yellow 60, green 25, grey 0; first craft ×2; `mf_prof_xp` multiplies
all of it. Refining gives nothing. Disenchanting gives Enchanters pXP at the item's colour (the item's item
level mapped to the nearest recipe band).

### 11.7 Crafting time

Every recipe has a work cost in units (reuse `js/work.js`, **1 unit per second**): consumables **2**, gems
**2**, gear **5**, gadgets **6**, contraptions **8**. Queue up to **20** of one recipe (reuse `station-ui.js`
`BATCHES [1, 5, 20]`; the standing order `0` is dropped). You must stay within **6 m** of the station; moving
away pauses the queue. Nothing crafts while you are away.

### 11.8 Stations anywhere?

Low-tier consumables (T1–T2 potions, whetstones, cut Chipped gems) can be made at a **field kit** — each
profession's T1 recipe list includes `it_field_kit_<prof>`, a placeable that lasts **5 minutes**, usable by
you only. Everything else needs a town station.

### 11.9 Changing profession

| Rule | Value |
|---|---|
| Where | any trainer of the **new** profession |
| Cost | **50 × character level** gold (level 30 → 1,500) |
| What you keep | every recipe you learnt in the old profession, **frozen**; its skill falls to **the start of its current rank** (e.g. 237 → 201 Master; 148 → 101 Craftsman) and stays there |
| What you lose | the skill above the rank start; the old profession cannot be used at all while it is not active |
| Switching back | same cost; you return at the frozen skill with every recipe; you still have the ranks you bought |
| Cooldown | **72 real hours** between switches |
| Harvesting | never affected |
| Items you made | unchanged (they are ordinary items) |

This makes a switch a real decision without wiping years of play: you give up at most 49 points and three
days. The UI (`scr_prof_change`) shows exactly what you will keep and lose before you confirm.

---

## 12. Blacksmithing

`prof_blacksmithing` · station: Anvil + Furnace (reuse Farhold "Anvil", "Furnace", "Alloy Forge").

| Band | Weapons (metal) | Armour | Other |
|---|---|---|---|
| 1 / 25 | Tin shortsword, hatchet-axe, mace, spear | heavy: Rough Iron helm, chest, gauntlets | Rough Whetstone (+4% basic-attack damage, 30 min), Field Kit |
| 50 / 75 | Iron and steel longsword, greatsword, warhammer, halberd, shield | heavy: Steel set (7 slots) | Steel Whetstone (+6%), Weightstone (+6% vs armoured) |
| 100 / 125 | Redsteel weapons (all metal types), tower shield | heavy: Redsteel plate | Redsteel Whetstone (+8%), crafted set `set_redsteel_vanguard` (page 09) |
| 150 / 175 | Blacksteel and Rimesteel weapons | heavy: Blacksteel, Rimesteel (+cold resistance) | Frostbite Whetstone (weapon hits Chill), Blacksteel Whetstone (+10%) |
| 200 / 225 | Saltsteel and Lodestone weapons (Lodestone: +1 m reach on polearms) | heavy: Saltsteel | Lodestone Weight (+10% vs large enemies) |
| 250 / 275 / 300 | Firegold weapons; Paragon: **Starmetal** weapons (2 chosen affixes) | heavy: Firegold, Starmetal | Firegold Whetstone (+12%), Kingsfire set patterns |

Whetstones and weightstones are **weapon coatings**: one coating at a time on a weapon (a coating replaces an
Alchemy oil and vice versa), 30 minutes, survive death, basic attacks and skills tagged *Basic Attack* only
(page 05 tags).

---

## 13. Leatherworking

`prof_leatherworking` · station: Tannery + Leather Bench (reuse Farhold "Tannery", "Workbench").

| Band | Weapons | Armour | Other |
|---|---|---|---|
| 1 / 25 | short bow | light and medium: Rough Leather set | leather bag (8 slots), Field Kit |
| 50 / 75 | longbow, sling | Highland Leather sets, fur-lined boots | **quivers** (the body: Common–Rare), hunting tack |
| 100 / 125 | recurve bow | Dune Scale (medium), Moonpelt (light) | **mount tack** (below), profession gloves and aprons (+4 skill, +5% pXP) |
| 150 / 175 | horn bow | Steppe Hide, Frost Fur (+cold resist) | Epic quivers, 12-slot bag |
| 200 / 225 | reef bow | Tideskin, Rift Chitin | 16-slot bag, tack II |
| 250 / 275 / 300 | drakebone bow | Drake Scale, Firehide; Paragon 2-chosen pieces | tack III, Kingsfire set patterns |

**Mount tack** (new niche): a consumable saddle-and-bridle kit used on a mount item. **Tack I** adds one mount
affix if it has a free slot; **Tack II** rerolls one mount affix (you pick which); **Tack III** rerolls every
mount affix value. Mount affixes and slots are page 08's ("Mounts").

---

## 14. Tailoring

`prof_tailoring` · station: Loom + Tailor's Table (reuse Farhold "Loom").

| Band | Armour | Back / waist | Other |
|---|---|---|---|
| 1 / 25 | cloth: Linen set | linen cloak, sash | 8-slot cloth bag, **tool roll** replacements, Field Kit |
| 50 / 75 | Hemp and Wool sets | wool cloak, wool sash (+1 potion charge, as page 08 waist rules) | 12-slot bag |
| 100 / 125 | Cotton set, Moonsilk set | Moonsilk cloak | **profession garb**: aprons (back), goggles (head) for every profession (+4 skill, +5% pXP each) |
| 150 / 175 | Ashsilk set | Ashsilk cloak | 16-slot bag, dye recipes |
| 200 / 225 | Sea Silk set, Reefsilk robes | | 18-slot bag, spellthread (+ Enchanting input) |
| 250 / 275 / 300 | Fire Cotton set; Paragon 2-chosen robes | | 20-slot bag (Paragon; page 08 sets bag prices) |

---

## 15. Jewelcrafting

`prof_jewelcrafting` · station: Gem Cutter (reuse Farhold "Crystal Cutter").

Page 08 owns gems, jewels and sockets. Jewelcrafting is how gems and some jewels enter the world besides drops.

| Band | Gems | Jewellery | Jewels | Other |
|---|---|---|---|---|
| 1 / 25 | — (no gems at T1) | tin ring, bog-iron pendant | — | Field Kit |
| 50 / 75 | **cut Chipped** gems from rough Chipped (all 10 kinds) | iron rings, steel chains | — | combine 3 Chipped → 1 Flawed (no gold fee; the Jeweller NPC still charges page 08's fee); **Bore a Gem Socket** (75, page 08 §13.2) |
| 100 / 125 | cut **Flawed** | gold rings and necklaces | **cut Uncommon jewels** from Rough Jewels (below) | circlets (head, cloth/light) |
| 150 / 175 | cut **Plain** | Blacksteel and gold settings | **Polish** a jewel (reroll its values, keep its affixes) | **Set a Jewel Mount** (175, page 08 §13.2) |
| 200 / 225 | cut **Flawless** | Saltsteel, Lodestone settings | **Recut** a jewel (reroll **one** affix you pick; the new one rolls in the bottom half) | |
| 250 / 275 / 300 | cut **Radiant**; Paragon: **Prismatic** cut (one gem, page 08 decides if allowed) | Firegold, Starmetal | Recut and Polish work on every jewel rarity; making Rare or Unique jewels is **not** possible — they stay drops | **Recut a Socket** (250, page 08 §13.2) |

- **Rough gems** (`mat_rough_<gem>_<grade>`, grade 1–5) come from mining rare finds and rich veins; cut into
  page 08's `gem_<gem>_<grade>` (1 rough → 1 gem, 2 work units). The ten gems (page 08 §13.4): Bloodstone,
  Tigereye, Lapis, Jade, Onyx, Moonstone, Garnet, Pearl, **Amber** and **Peridot** — so `mat_rough_amber_2` cuts
  into `gem_amber_2` (Flawed Amber). Grades: 1 Chipped · 2 Flawed · 3 Plain · 4 Flawless · 5 Radiant.
- **Rough Jewels** (`it_jewel_rough_t<n>`, a drop from rares and Depth chests, page 08) are cut into an **Uncommon**
  jewel with 2 random jewel affixes. **Rare and Unique jewels are drop-only**, because the owner wants
  finding the right jewel to be the chase.
- **Polish** costs the tier's gem dust (`mat_gem_dust`, from cutting: every cut gives 1) + gold
  (`50 × tier²`). **Recut** costs 3× that and has its own 1 hour per-jewel cooldown so it stays a sink.

---

## 16. Enchanting

`prof_enchanting` · station: Enchanter's Lectern (new model; reuse the Farhold "Chemical Bench" station
screen).

| Band | Enchants (glyphs) | Weapons / off-hands | Travel and other |
|---|---|---|---|
| 1 / 25 | — | apprentice wand, oak staff | **Disenchant** (below), Field Kit |
| 50 / 75 | Glyph rank I (every glyph in page 08 "Enchanting (glyphs)") | willow and pine staves, a focus orb | **Scroll of Passage** (page 20) |
| 100 / 125 | rank I+ (half-step: +50% of the gap to rank II) | Moonoak staves, foci | spellthread (from Tailoring's cloth), **Portal Stone** (page 20) |
| 150 / 175 | **rank II** | Ashwood staves | Scroll of Calling (page 20) |
| 200 / 225 | rank II+ | Floatwood staves and wands | **Open a Soul Socket** (225, page 08 §13.2; needs Tear-glass Shards), **Soul transfer** (below) |
| 250 / 275 / 300 | **rank III**; Paragon glyphs (one new glyph per slot, page 09) | Charheart and Paleheart staves | — |

- **Glyphs** move from the NPC Enchanter to players: page 08's NPC keeps selling **rank I** only (so nobody is
  locked out); ranks II and III, and the half-steps, are player-made and sold on the Trading Post.
- **Disenchant** (Enchanters only): destroys an Uncommon+ item at any Lectern and gives **1.5×** the page-08
  salvage yield of **Essence** and **Dust** (Scrap is not given), plus enchanting materials:
  **Glimmer** (`mat_ench_glimmer`, Uncommon), **Shard** (`mat_ench_shard`, Rare/Epic), **Prism**
  (`mat_ench_prism`, Unique/Set/Legendary). pXP at the item's colour. Everyone else still salvages at the bench.
- **Soul transfer**: moves a **Soul** straight from one item to another in one step, for the same price as page
  08 §13.3's soul removal (500 gold + 25 gold × level). Page 08 already returns a removed soul whole, so this is a
  convenience (one step instead of two, and an Enchanter can do it for a customer through a craft order).

---

## 17. Engineering and Gadgets

`prof_engineering` · station: Workshop (reuse Farhold "Workshop", "Assembler").

| Band | Gadgets | Tools | Weapons | Contraptions and other |
|---|---|---|---|---|
| 1 / 25 | **Tin frame** | Uncommon Flint → Iron tools | — | blasting powder, Field Kit |
| 50 / 75 | **Iron frame** | Uncommon/Rare Iron tools | light crossbow, blunderbuss | **quiver fittings** I, **Prospector's Lens** |
| 100 / 125 | **Redsteel frame**, cores I | Rare Redsteel tools | heavy crossbow, long rifle | **Fit a Gadget Port** (100, page 08 §13.2), fishing rods Rare, target dummy |
| 150 / 175 | **Blacksteel frame** | Epic Blacksteel tools | repeating crossbow | quiver fittings II, bombs |
| 200 / 225 | **Lodestone frame**, cores II | Epic Lodestone tools | tidebrass rifle | **Clockwork Strider** mount |
| 250 / 275 / 300 | **Firegold frame**; Paragon cores III | Epic Firegold tools | Firegold hand cannon | Portable Bench, fireworks |

### 17.1 What a gadget is

A **gadget** is the socketable an Engineer makes (canon §12.3). It sits between a **gem** (one fixed stat
set by the socket's item type) and a **jewel** (random affixes and rarities, the strongest): the gadget's
stats are **chosen by the crafter from a menu**, so it is never the best possible piece but always exactly the
piece you wanted. Gadgets go only into **Gadget sockets** (page 08 decides which items have them).

### 17.2 Frame, core, lines

A gadget is built from:

1. **A frame** — sets the item level, the level to use it, and the **value per point**.
2. **A core** — sets which **menu** the lines come from.
3. **Lines** — up to **3** stat lines; the crafter spends the gadget's **budget points** across them.

| Frame | id | Recipe `req` | Level to socket | Value factor | Frame materials (per gadget) |
|---|---|---:|---:|---:|---|
| Tin | `gdg_frame_tin` | 1 | 10 | 0.25 | 4 Tin Bar, 2 Bent Bolts |
| Iron | `gdg_frame_iron` | 50 | 18 | 0.40 | 4 Steel Bar, 3 Cog Gears |
| Redsteel | `gdg_frame_redsteel` | 100 | 28 | 0.55 | 4 Redsteel Bar, 3 Coil Springs, 1 Essence |
| Blacksteel | `gdg_frame_blacksteel` | 150 | 38 | 0.70 | 4 Blacksteel Bar, 3 Siege Pins, 2 Essence |
| Lodestone | `gdg_frame_lodestone` | 200 | 50 | 0.85 | 4 Lodestone Bar, 3 Tidebrass Works, 1 Dust |
| Firegold | `gdg_frame_firegold` | 250 | 60 | 1.00 | 4 Firegold Bar, 3 Rune Cores, 2 Dust |

**Budget: 12 points** on every frame (+1 on a masterwork, §4.1). A line takes **1–8** points; no two lines
may be the same stat.

| Core | id | Lines 1 and 2 from | Line 3 from | Learnt from |
|---|---|---|---|---|
| **Striker** | `gdg_core_striker` | Offence menu | any menu | trainer (band 100) |
| **Bulwark** | `gdg_core_bulwark` | Defence menu | any menu | trainer (band 100) |
| **Mender** | `gdg_core_mender` | Support menu | any menu | Lantern House, Welcome |
| **Fortune** | `gdg_core_fortune` | Fortune menu | any menu | Lantern House, Trusted |
| **Artisan** | `gdg_core_artisan` | Profession menu | any menu | Deepforge Clans, Welcome |
| **Wayfarer** | `gdg_core_wayfarer` | Travel menu | any menu | Wardens, Trusted |

Before band 100 (Tin and Iron frames) a gadget has **no core** and takes **2 lines** from the Offence or
Defence menus.

### 17.3 The menus (value per point at factor 1.00, i.e. a Firegold frame)

| Menu | Line id | Stat | Per point | 8-point line at Firegold |
|---|---|---|---|---|
| Offence | `gl_attr_main` | +STR / DEX / INT (pick one) | +2 | +16 |
| Offence | `gl_crit` | critical chance | +0.3% | +2.4% |
| Offence | `gl_haste` | haste | +0.3% | +2.4% |
| Offence | `gl_tag` | +damage to **one chosen tag** (page 05 tag list, e.g. Fire, Area, Basic Attack) | +1% | +8% |
| Defence | `gl_con` | +CON | +2 | +16 |
| Defence | `gl_health` | maximum health | +0.5% | +4% |
| Defence | `gl_armour` | armour | +1.5% | +12% |
| Defence | `gl_resist` | resistance to all elements | +3 | +24 |
| Support | `gl_healing` | healing done | +0.5% | +4% |
| Support | `gl_shield` | shields and barriers cast | +0.6% | +4.8% |
| Support | `gl_resource` | maximum resource | +0.5% | +4% |
| Fortune | `gl_mf_gold` | gold find | +2% | +16% |
| Fortune | `gl_mf_quantity` | item quantity | +1% | +8% |
| Fortune | `gl_mf_rarity` | item rarity | +1% | +8% |
| Fortune | `gl_mf_xp` | XP gain | +1% | +8% |
| Fortune | `gl_mf_rep` | reputation gain | +1.5% | +12% |
| Profession | `gl_prof_skill` | `mf_prof_skill` | +1 | +8 |
| Profession | `gl_prof_xp` | `mf_prof_xp` | +3% | +24% |
| Profession | `gl_gather_speed` | gather speed | +1.5% | +12% |
| Travel | `gl_move_ooc` | move speed out of combat | +0.5% (max 4 points) | +2% |
| Travel | `gl_mount_speed` | mounted speed (still capped by riding rank, page 07) | — | used only for glide distance: +3 m per point |
| Travel | `gl_fall` | fall damage taken | −4% | −32% |

Values are multiplied by the frame's factor and rounded to the nearest 0.1 (percent) or whole number
(attributes, resistance).

**Worked example.** A Firegold **Striker**: 8 points of DEX (+16), 4 points of +Area damage (+4%). Compare a
Radiant gem in armour at +20 DEX (page 08): the gadget gives slightly less on the main line but a second stat
you chose. A good Rare jewel can roll +20 DEX, +3% crit and +6% Area — better, but you cannot choose it.

### 17.4 Retuning

Any Engineer with the frame's recipe can **retune** any gadget (yours or a customer's through a craft order):
reassign every point and swap the core for another the Engineer knows. Cost: **half** the frame's materials +
`20 × frame tier²` gold. There is no limit on retunes.

### 17.5 Tools

Engineers make Uncommon, Rare and Epic tools of every kind (§6) from band 1 (Flint Uncommon) to band 250
(Firegold Epic), and the **tool roll** upgrades (8 and 10 slots). Tool affixes roll randomly; one is chosen
from the recipe's list, like crafted gear.

### 17.6 Contraptions

Engineering's utility items are **contraptions**, never "devices": **Device** is the tinker's word for its combat
deployables (`classes/tinker.md`), and **Gadget** is the socketable (§17.1).

| Contraption | id | Band | What it does | Reuse |
|---|---|---|---|---|
| **Prospector's Lens** | `it_prospector_lens` | 50 (I), 150 (II), 250 (III) | out of combat, 2 s sweep: shows every node within **110 / 210 / 380 m** for 60 s, colour-coded for your skill; found nodes stay on your map until harvested | Farhold scanner (`createScanner`, the three `devices` ranges) |
| Target dummy | `it_target_dummy` | 100 | placeable for 10 min; feeds the damage meter | `meters/` |
| Quiver fitting I / II | `it_fitting_<effect>_1/2` | 50 / 150 | adds one **basic-attack effect** to a quiver that has none: Flaming (Burning 20% / 30% over 4 s), Barbed (Bleed), Frost-tipped (Chilled 1 s), Splitting (a second arrow at 35% / 50% to one extra target), Bursting (a 2 m / 3 m burst at 25% / 35%). Basic attacks and skills tagged *Basic Attack* only (canon §12.3) | new |
| Bombs | `it_bomb_<kind>` | 150 | thrown consumable, 30 s shared cooldown, usable by anyone: Blast (60% of a level-appropriate weapon hit in 4 m), Flash (Blind 2 s), Tar (−40% move 4 s) | new |
| **Clockwork Strider** | `it_mount_clockwork_strider` | 200 | a mechanical two-legged mount (page 08 "Mounts" lists it); rides like any mount at your riding rank; tradeable | new model |
| Portable Bench | `it_portable_bench` | 250 | placeable for 5 min; the party can use the everyone-bench (salvage, promote…) in the open world | Farhold bench |
| Fireworks | `it_fireworks` | 250 | cosmetic | — |

---

## 18. Alchemy

`prof_alchemy` · station: Alembic (reuse Farhold "Chemical Bench" as the model and screen).

Page 08 "Consumables" owns every potion, elixir and flask's effect and vendor price. Alchemy is how the
better ones are made; vendors keep selling the **level 1 and level 12** potions so nobody depends on a player.

| Band | Potions | Elixirs / flasks | Oils | Transmutes |
|---|---|---|---|---|
| 1 / 25 | Minor Healing/Mana Draught, Antidote | — | — | — |
| 50 / 75 | Lesser Healing/Mana, Burn Salve, Warming Draught | Might, Grace, Insight, Ironhide, Fortitude | Fire Oil I (+6% Fire-tagged damage, 30 min) | 3 Tin Bar → 2 Rough Iron Bar and back |
| 100 / 125 | Healing Draught, Group Tonic | Keen Eye, Warding, Deep Breath; **Elixir of the Artisan**, **Draught of Diligence** (§4) | Frost, Storm, Venom oils I (+6% to the tag) | ore of one T3 kind → the other (3:2) |
| 150 / 175 | Greater Healing/Mana, Vial of Holy Water, **Revival Flask** | Quickening | oils II (+9%) | essence → dust (10 Essence → 1 Dust, 12 h cooldown) |
| 200 / 225 | Superior Healing/Mana | — | Banishing Oil (+10% vs undead and fiends) | rough gem → rough gem of another kind, same grade |
| 250 / 275 / 300 | Supreme Healing/Mana, **the strong revive draught** (page 08 names it) | **Flask of the Champion**, **Flask of the Warden** (Paragon) | oils III (+12%) | 3 Firegold Bar → 1 Starmetal Bar (24 h cooldown) |

Oils are **weapon coatings** (one at a time, replaces a whetstone, §12). Fish (§8.5) and herbs are the main
inputs; vials (`mat_vial`, 1 gold) and crystal flasks (`mat_flask_crystal`, 20 gold, T4+) are bought.

---

## 19. Who makes what — the cross-profession map

| Needs | From |
|---|---|
| Blacksmith needs leather grips, wood hafts | Leatherworking (or refined leather anyone can make), Harvesting |
| Leatherworker needs bowstrings, dyes | Tailoring (silk thread), Alchemy (dyes) |
| Tailor needs enchanted thread for robes | Enchanting (spellthread from the Tailor's own cloth) |
| Jewelcrafter needs settings | Blacksmithing sells settings at 150+; Jewelcrafting can make its own at a 20% material premium |
| Enchanter needs staves' heads | Jewelcrafting (cut gems), Harvesting (wood) |
| Engineer needs gems for lenses | Jewelcrafting |
| Alchemist needs crystal flasks at T6 | Jewelcrafting (crystal vials) or vendor |
| Everyone needs gems, gadgets, enchants, potions | Jewelcrafting, Engineering, Enchanting, Alchemy |

Every dependency has a **vendor or self-made fallback at a premium**, so a solo player is never stuck; the
cheaper path always goes through another player.

---

## 20. Materials list

All materials live in the **materials bag** (no cap, reuse Farhold `Materials` class, page 08). ids use
`mat_`. Refined outputs are in the same rows.

### 20.1 Metal

| Tier | Ore | Bar | Region |
|---|---|---|---|
| T1 | `mat_ore_tin` Tin Ore | `mat_bar_tin` Tin Bar | Hearthvale, crownlands |
| T1 | `mat_ore_bog_iron` Bog Iron | `mat_bar_rough_iron` Rough Iron Bar | Mossfen |
| T2 | `mat_ore_iron` Iron Ore · `mat_coal` Coal | `mat_bar_iron` Iron Bar · `mat_bar_steel` Steel Bar | Greyridge |
| T3 | `mat_ore_redcap` Redcap Ore | `mat_bar_redsteel` Redsteel Bar | Sunscar |
| T3 | `mat_ore_gold` Gold Ore | `mat_bar_gold` Gold Bar | Whisperwood |
| T4 | `mat_ore_blackstone` Blackstone Ore | `mat_bar_blacksteel` Blacksteel Bar | Cinder Steppe |
| T4 | `mat_ore_rime_iron` Rime Iron | `mat_bar_rimesteel` Rimesteel Bar | Frostmantle |
| T5 | `mat_ore_saltiron` Saltiron Ore | `mat_bar_saltsteel` Saltsteel Bar | Drowned Coast |
| T5 | `mat_ore_lodestone` Lodestone | `mat_bar_lodestone` Lodestone Bar | Riftmarch |
| T6 | `mat_ore_firegold` Firegold Ore | `mat_bar_firegold` Firegold Bar | Kingsfire, Spire Isle |
| T6 | `mat_ore_starmetal` Starmetal Ore | `mat_bar_starmetal` Starmetal Bar | Spire Isle (rare veins), Alchemy transmute |

### 20.2 Herbs and fibre

| Tier | Herbs | Fibre (→ bolt) | Rare herb |
|---|---|---|---|
| T1 | `mat_herb_farrowbloom`, `mat_herb_hedge_nettle`, `mat_herb_bogbean`, `mat_herb_marshcandle` | `mat_fibre_flax` → `mat_bolt_linen` | `mat_herb_goldthread` |
| T2 | `mat_herb_stonemint`, `mat_herb_kettleroot` | `mat_fibre_hemp` → `mat_bolt_hemp`; `mat_wool_highland` → `mat_bolt_wool` | `mat_herb_kingsbloom` |
| T3 | `mat_herb_sandthistle`, `mat_herb_mesa_sage`, `mat_herb_moonpetal`, `mat_herb_oldbark_moss` | `mat_fibre_cotton` → `mat_bolt_cotton`; `mat_silk_moon` → `mat_bolt_moonsilk` | `mat_herb_sunpetal` |
| T4 | `mat_herb_ashgrass`, `mat_herb_warcap`, `mat_herb_frostbell`, `mat_herb_snowvetch` | `mat_fibre_ashflax` → `mat_bolt_ashflax`; `mat_silk_ash` → `mat_bolt_ashsilk` | `mat_herb_bloodroot` |
| T5 | `mat_herb_saltwort`, `mat_herb_drowned_lily`, `mat_herb_driftbloom`, `mat_herb_loosefern` | `mat_fibre_seasilk` → `mat_bolt_seasilk`; `mat_silk_reef` → `mat_bolt_reefsilk` | `mat_herb_pale_lotus` |
| T6 | `mat_herb_cinderleaf`, `mat_herb_firethorn`, `mat_herb_mendwort` | `mat_fibre_firecotton` → `mat_bolt_firecotton` | `mat_herb_spirebloom` |

T1 spider silk (`mat_silk_cobweb`) looms 2:1 into linen.

### 20.3 Wood (used raw)

| Tier | Woods | Rare |
|---|---|---|
| T1 | `mat_wood_oak`, `mat_wood_willow` | `mat_heartwood_oak` |
| T2 | `mat_wood_pine` | `mat_heartwood_pine` |
| T3 | `mat_wood_ironwood`, `mat_wood_moonoak` | `mat_heartwood_moonoak` |
| T4 | `mat_wood_ashwood`, `mat_wood_rimepine` | `mat_heartwood_ashwood` |
| T5 | `mat_wood_drownwood`, `mat_wood_floatwood` | `mat_heartwood_floatwood` |
| T6 | `mat_wood_charheart`, `mat_wood_paleheart` | `mat_heartwood_paleheart` |

### 20.4 Hides, scale, fur

| Tier | Raw | Leather |
|---|---|---|
| T1 | `mat_hide_rough`, `mat_hide_bogskin` | `mat_leather_rough` |
| T2 | `mat_hide_highland` | `mat_leather_highland` |
| T3 | `mat_scale_dune`, `mat_hide_dune`, `mat_pelt_moon` | `mat_leather_dune`, `mat_leather_moonpelt` |
| T4 | `mat_hide_steppe`, `mat_fur_frost` | `mat_leather_steppe`, `mat_leather_frostfur` |
| T5 | `mat_hide_tide`, `mat_chitin_rift` | `mat_leather_tide`, `mat_leather_chitin` |
| T6 | `mat_scale_drake`, `mat_hide_fire` | `mat_leather_drake`, `mat_leather_fire` |

Rare find: `mat_hide_pristine_t<n>` (one per tier; counts as 3 hides and is required by Epic recipes).

### 20.5 Fish

| Tier | Fish |
|---|---|
| T1 | `mat_fish_perch` River Perch, `mat_fish_sprat` Hearthsea Sprat, `mat_fish_eel` Fen Eel |
| T2 | `mat_fish_trout` Highland Trout |
| T3 | `mat_fish_carp` Oasis Carp, `mat_fish_moonfin` Moonfin |
| T4 | `mat_fish_ash_pike` Ash Pike, `mat_fish_ice_char` Ice Char |
| T5 | `mat_fish_kingfish` Kingfish, `mat_fish_coast_eel` Coast Eel, `mat_fish_driftfin` Driftfin |
| T6 | `mat_fish_slagfin` Slagfin, `mat_fish_spirefin` Spirefin |

### 20.6 Salvage and engineering parts

| Tier | Part | Also gives (page 08) |
|---|---|---|
| T1 | `mat_part_bolts` Bent Bolts | Scrap |
| T2 | `mat_part_gears` Cog Gears | Scrap |
| T3 | `mat_part_springs` Coil Springs | Scrap, Essence 30% |
| T4 | `mat_part_pins` Siege Pins | Scrap, Essence 40% |
| T5 | `mat_part_tidebrass` Tidebrass Works | Scrap, Essence 50%, Dust (rich) |
| T6 | `mat_part_rune_core` Rune Cores | Scrap, Essence 60%, Dust (rich) |

### 20.7 Gems, enchanting and bought materials

| id | Name | From |
|---|---|---|
| `mat_rough_<gem>_<grade>` | rough gems (page 08's 10 gems, incl. Amber and Peridot, × grades 1 Chipped … 5 Radiant) → cut into `gem_<gem>_<grade>` | mining rare finds (T2 Chipped, T3 Flawed, T4 Plain, T5 Flawless, T6 Radiant) |
| `mat_gem_dust` | Gem Dust | 1 per gem cut |
| `mat_tearglass` | **Tear-glass Shard** (page 08 owns it) | salvaging ilvl 58+ Epic and better; Challenge end bosses; the Depth Cache; level-60 world-boss chests; Spire Isle rares. Spent on **Open a Soul Socket** and page 08's set reforging |
| `mat_ench_glimmer` · `mat_ench_shard` · `mat_ench_prism` | Glimmer · Shard · Prism | Disenchanting (§16) |
| `mat_scrap` · `mat_essence` · `mat_dust` | page 08's bench materials | salvage (bench and §8.6) |
| `mat_vial` · `mat_flask_crystal` | Vial · Crystal Flask | Alchemy vendors, 1 / 20 gold |
| `mat_powder_blast` | Blasting Powder | Engineering vendors, 4 gold |
| `mat_thread` · `mat_dye_<colour>` | Thread · Dyes | Tailoring vendors, 1 gold; Alchemy makes dyes |

**Count:** 13 ores and coal, 11 bars, 23 herbs, 7 fibres + silks and wool, 13 bolts, 13 woods + 6 heartwoods,
13 raw hides + 6 pristine, 11 leathers, 13 fish, 6 parts, 50 rough gems, 6 enchanting/gem materials (incl. Tear-glass), 6 bought.

---

## 21. Stations

Every station is a **town object** (not player-built) with its own screen (reuse `js/station-ui.js`: `E` at
the station opens *its* screen; the recipe list is data). "BN" towns (page 01 service codes) have the
everyone-bench and a Furnace; **hubs have every station**.

| Station | Farhold structure reused | Used for | Found in |
|---|---|---|---|
| Furnace | "Furnace", "Smelter", "Alloy Forge" | refining ore (§10); Blacksmithing | every hub, every BN town |
| Anvil | "Anvil" | Blacksmithing | hubs; the Hill Forge, Burnt Smithy and Order's Forge landmarks (page 01) |
| Tannery | "Tannery" | refining hides; Leatherworking | hubs |
| Leather Bench | "Workbench" | Leatherworking | hubs |
| Loom | "Loom" | refining fibre; Tailoring | hubs |
| Tailor's Table | "Crafting Table" | Tailoring | hubs |
| Gem Cutter | "Crystal Cutter" | Jewelcrafting | hubs |
| Enchanter's Lectern | (new model; "Chemical Bench" screen) | Enchanting, Disenchanting | hubs |
| Workshop | "Workshop", "Assembler" | Engineering | hubs |
| Alembic | "Chemical Bench" | Alchemy | hubs |
| The everyone-bench | Farhold bench (`js/craft.js`) | page 08's salvage and bench actions | hubs, BN towns |

The wilderness **forge_fire** landmarks (the Hill Forge in Greyridge, the Burnt Smithy in the Steppe, the
Order's Forge in Kingsfire) have an Anvil and a Furnace, and the Order's Forge is the only place outside
Highcourt and Last Light where **Paragon** Blacksmithing recipes can be made (a reason to go there).

---

## 22. Craft orders

Because each character has one profession, there is a way to ask another player to make something.

| Rule | Value |
|---|---|
| Where | the **Crafters' board** (`scr_craft_orders`) at any hub, beside the notice board |
| Posting | pick a recipe (any recipe in the game is listed, by profession and band), attach the materials (or tick "crafter supplies" and a max price), set a **fee** in gold. Personal order (one named player), guild order, or public |
| Filling | any player with the recipe and the rank sees it; filling crafts it at *their* station with *their* skill (so the order-giver gets the crafter's surplus rolls and chosen affix — the order says which affix the giver wants) |
| Delivery | by mail (page 15); the fee is paid on delivery |
| Expiry | 72 hours; materials returned by mail |
| Fee floor | none. The post office takes **2%** of the fee (a sink) |
| pXP | the crafter earns the normal pXP |

Page 15 owns mail and the Trading Post; this is a profession service that uses them.

---

## 23. Unlock and teaching

Canon ladder: **level 9 — harvesting + a crafting profession**. Page 07 owns the ladder row and page 14 the
quest id; this page proposes that the existing level-9 quest in Reedhollow (`q_mf_what_the_fen_gives_back`,
`npc_mf_scrapwright_hesk`) is widened to teach all of it:

1. **Salvage** one unwanted item at the bench (page 08, unchanged from the current quest).
2. Take the **tool roll** with six Flint tools. **Mine** three Bog Iron pulls, **pick** two Marshcandle,
   **skin** one fen boar. (Teaches automatic tool swapping and the bar.)
3. **Refine** the ore at the Furnace (teaches refining is for everyone).
4. Walk to the **Makers' Fair** tent (Reedhollow): seven Novice trainers, one per profession, each with a
   20-second pitch and a "what you would make" list. **Pick one** (`scr_prof_choice`; free the first time;
   the choice can be changed later, §11.9). Learn the profession and its first 3 recipes.
5. Craft one T1 item of your profession.

Unlock card: "Harvesting: gather ore, herbs, wood, hides, fish and salvage with the right tool. Crafting:
you are now a <profession> — train at any <profession> trainer."

Fishing is taught by an optional follow-up at Stillwater Landing (a Cutwater angler) that gives a better rod.

---

## 24. UI hooks, keys and settings

### 24.1 Screens (for page 03)

| Screen id | What it is | Opened by |
|---|---|---|
| `scr_sheet_professions` | character sheet tab: Harvesting skill bar + pXP, crafting profession skill bar + rank + pXP, effective skill and where the bonus comes from, known recipes by band, the tool roll, switch history | sheet rail; proposed key `Shift+C` |
| `scr_prof_choice` | the pick-one screen at the Makers' Fair: seven cards with makes / inputs / stations | the level-9 quest; any trainer of a new profession |
| `scr_prof_change` | switch confirmation: cost, cooldown, "you keep / you lose" lines with numbers | trainer → Change profession |
| `scr_prof_trainer` | trainer window: ranks, recipes to buy by colour, prices | `E` on a profession trainer |
| `scr_station` | one station's own screen: recipes it runs, colour, pXP per craft, materials have/need, batch 1/5/20, queue bar | `E` on a station (reuse `station-ui.js`) |
| `scr_gadget_workshop` | the gadget builder: frame, core, three lines with point sliders and live values, "compare with socketed" panel, retune tab | Workshop → Gadgets |
| `scr_disenchant` | pick an item; shows exact yields before confirm | Lectern → Disenchant |
| `scr_craft_orders` | the Crafters' board: post / browse / fill / my orders | `E` on a Crafters' board |
| `scr_hud_gather_bar` | the world-space progress bar over a node with the node name, colour and a "+1 skill" pop (reuse `hud.workBar`) | gathering |
| `scr_node_label` | floating node label: name, tier, colour; red text says what is missing | looking at a node within 30 m |

### 24.2 Keys (for page 02)

| Action | Key | Notes |
|---|---|---|
| `interactHold` | `E` hold | gather (already on page 02); the matching tool swaps in automatically |
| `strike` (fishing) | `E` tap while a line is out | same key; context only |
| `attack` on a node | left mouse | with the tool out, a basic attack on a node starts a pull (reuse Farhold) |
| `professions` | `Shift+C` (proposed) | opens `scr_sheet_professions` |
| `prospectorLens` | unbound by default | uses the Lens contraption if owned |

### 24.3 Settings (for page 04)

| Key | Control | Default |
|---|---|---|
| `set.gameplay.autoToolSwap` | toggle | on |
| `set.gameplay.gatherHold` | hold / toggle | hold |
| `set.interface.nodeColours` | toggle (colour node labels by your skill) | on |
| `set.interface.nodeLabelRange` | slider 10–60 m | 30 m |
| `set.interface.minimapNodes` | all / my tiers / off | my tiers |
| `set.audio.fishingBiteCue` | toggle (a louder bite sound) | on |

---

## 25. Data shapes

`data/professions.json` (new):

```json
{
  "professions": [
    { "id": "prof_harvesting", "name": "Harvesting", "kind": "gather", "maxSkill": 300,
      "activities": ["hv_mining", "hv_herbs", "hv_logging", "hv_skinning", "hv_fishing", "hv_salvage"] },
    { "id": "prof_blacksmithing", "name": "Blacksmithing", "kind": "craft", "maxSkill": 300,
      "stations": ["st_anvil", "st_furnace"] }
  ],
  "colours": { "node": [25, 50, 75], "recipe": [15, 30, 45], "pxp": { "orange": 100, "yellow": 60, "green": 25, "grey": 0 } },
  "ranks": [
    { "id": "novice", "min": 1, "max": 50, "level": 9, "cost": 10 },
    { "id": "paragon", "min": 251, "max": 300, "level": 52, "cost": 15000 }
  ],
  "switch": { "costPerLevel": 50, "cooldownHours": 72, "dropToRankStart": true },
  "mf": { "profSkillCap": 40, "profXpCap": 1.0,
    "harvestSurplus": { "timePer5": 0.01, "timeCap": 0.25, "bonusPer5": 0.01, "bonusCap": 0.30, "rarePer5": 0.001, "rareCap": 0.03 },
    "craftSurplus": { "floorPerPoint": 0.004, "floorCap": 0.40, "masterworkBase": 0.05, "masterworkPerPoint": 0.001, "masterworkCap": 0.20 } }
}
```

`data/harvest-nodes.json` (new; a node kind, then placements generated per region):

```json
{
  "kinds": [
    { "id": "node_vein_redcap", "activity": "hv_mining", "tier": 3, "req": 100, "toolTier": 3,
      "pulls": [3, 5], "perPull": { "mat_ore_redcap": [1, 2] }, "seconds": 3.2,
      "rare": { "chance": 0.02, "table": [["mat_rough_onyx_2", 1], ["mat_rough_garnet_2", 1]] },
      "respawnMin": 6, "richChance": 0.05, "look": "ore_outcrop" }
  ],
  "density": { "hv_mining": 8, "hv_herbs": 14, "hv_logging": 10, "hv_salvage": 2, "hv_fishing_per_km_shore": 3 },
  "regions": { "sunscar": { "tier": 3, "kinds": ["node_vein_redcap", "node_herb_sandthistle"], "biomeScale": { "hv_mining": 1.2 } } }
}
```

Per-player node state (server; the Farhold `felled` ledger moved server-side):

```json
{ "player": "p_123", "nodes": { "sunscar:node_vein_redcap:4412": { "pullsLeft": 0, "backAt": 1790000000 } } }
```

`data/tools.json` (reuse Farhold's file shape; `kind` new):

```json
{ "bases": [ { "id": "it_tool_pick_t3", "kind": "pick", "name": "Redsteel Pick", "tier": 3, "level": 20, "price": 300 } ],
  "rarity": { "common": { "speed": 1.0, "bonus": 0, "reach": 0, "affixes": 0 },
              "epic": { "speed": 1.35, "bonus": 0.18, "reach": 1.2, "affixes": 3 } } }
```

`data/recipes.json` (new, generated):

```json
{ "id": "rcp_blacksmithing_redsteel_longsword", "prof": "prof_blacksmithing", "req": 100, "band": 100,
  "station": "st_anvil", "units": 5, "learn": { "from": "trainer", "price": 200 },
  "makes": { "base": "longsword", "ilvl": 22, "rarity": "rare",
             "chosen": 1, "choices": ["aff_str", "aff_crit", "aff_attack_speed", "aff_bleed"] },
  "needs": { "mat_bar_redsteel": 6, "mat_leather_dune": 2, "mat_wood_ironwood": 1 },
  "variants": [] }
```

A gadget item:

```json
{ "id": "gdg_8f3a", "type": "gadget", "frame": "gdg_frame_firegold", "core": "gdg_core_striker", "ilvl": 60,
  "budget": 12, "lines": [ { "line": "gl_attr_main", "attr": "dex", "points": 8 },
                           { "line": "gl_tag", "tag": "tag_area", "points": 4 } ],
  "madeBy": "Tamsin", "masterwork": false }
```

Player profession state (in the save):

```json
{ "harvesting": { "skill": 182, "pxp": 40, "firstFinds": ["mat_ore_tin", "mat_herb_bogbean"] },
  "craft": { "active": "prof_engineering", "skill": 164, "pxp": 75, "rank": "adept",
             "known": ["rcp_engineering_iron_frame"], "firstCrafts": ["rcp_engineering_iron_frame"] },
  "frozen": { "prof_alchemy": { "skill": 101, "rank": "craftsman", "known": ["rcp_alchemy_fire_oil_1"] } },
  "lastSwitch": 1789000000 }
```

---

## 26. Reuse map

| Wildmarch piece | Reuse | Change |
|---|---|---|
| Tool items, rarity table, `canWork` | `prototypes/farhold/js/tools.js`, `data/tools.json`, `data/resources.json` `tools` | six kinds, six tiers, Wildmarch rarity names |
| Gathering bar, move-cancel, work clips | `js/tools.js` `createGathering`, `WORK_CLIPS`; `avatar-3d/js/chibi2-motion.js` | damage cancels; two new clips (`skin`, `cast`) |
| Personal node ledger | `js/props.js` harvest ledger (`felled`, regrow clocks) | server-side, per player, minutes |
| Node kinds and art | `data/resources.json` `nodeKinds`, `js/ore-view.js`, `data/megaflora.json` | tiers and ids renamed; richness decay dropped |
| Prospector's Lens | `js/tools.js` `createScanner` + marker book (`js/markers.js`) | a contraption an Engineer makes |
| Station screens, batches | `js/station-ui.js` | one station per profession, no standing orders |
| Craft time | `js/work.js` units | player only (no machines, no workers) |
| Everyone-bench, materials bag, salvage | `js/craft.js`, `data/crafting.json` | unchanged (page 08) |
| Affix rolls on crafted gear | `js/affixes.js` `rollAffixValue`, item levels | chosen affix + roll floor |
| Boat auto-equip (as the idea for tool auto-swap) | `js/player.js` | — |
| Damage meter for the target dummy | `meters/` | — |

New: skill, pXP, colours, ranks, recipes, the seven professions, gadgets, craft orders, fishing, skinning,
salvaging nodes.

---

## 27. Open questions

1. **Swimming mount from fishing.** The Mossback Tadpole (0.2% rare catch in T2+ fresh water) grows into a
   **Mossback Frog** mount after 7 real days in your bags — a fishing reward that is also one of the owner's
   aquatic-hybrid mounts. Page 08 owns the mount catalogue; keep it?
2. ~~**Soul removal.**~~ Settled by page 08 §13.3: a removed soul comes back whole; **Soul transfer** (§16) is
   a one-step convenience at the same price.
3. **Durability.** Page 08's durability system is still proposed. If it stays, Blacksmiths get a **Field Anvil**
   contraption (repair all worn items to 100% once per 30 min). If it goes, nothing here changes.
4. **Cooking.** Food stays a vendor item and a fish trade with innkeepers (§8.5). A Cooking profession would be
   an eighth choice; recommendation: **no** — seven is plenty and food is a minor buff.
5. **Prismatic gems** (Paragon Jewelcrafting): one gem that fits any socket kind's gem slot with a smaller
   effect. Needs page 08's socket rules to allow it.
