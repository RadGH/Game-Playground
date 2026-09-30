# WILDMARCH — Design Bible, page 00: overview and canon

> *"Everyone starts with a torch and a stick. The Wildmarch decides the rest."*

**Status:** v0.1 draft for review — 2026-09-29. **Nothing is built.** This bible is written first so the
AI that builds version 2 has one place to read every name, number, screen and key before writing a line.
**Wildmarch is a working title** (see `QUESTIONS.md`).

This page is the **canon**. Every other page expands one part of it and must use the names, ids and numbers
fixed here. If another page disagrees with this page, **this page wins** until it is changed on purpose and
the change is logged in `CHANGELOG.md`.

---

## 1. The pitch

**Wildmarch** is an online third-person **action RPG** set on one hand-shaped continent, *the Wildmarch*.
You start in a farming valley with a torch, a starter weapon and one spell. You leave it on foot. Every
region past it is harder than the last, and almost everything that makes a character feel powerful —
the second spell, the dodge roll, the mount, the class's signature trick, the talent choices, the fast
travel network, the raid door — is **earned**, by reaching a level or by finishing an important quest.

It is a sibling of **Farhold** (`prototypes/farhold/`), not a sequel. It keeps Farhold's best parts —
Chibi 2 characters, the item/affix/unique system, the perk forest, per-spell talents, the level ladder,
the inventory and paper doll, formant voices, Lingo speech, the combat feel — and drops the parts that
made Farhold a planet sandbox (space flight, base building, industry, colonies, terraforming).
What it adds is **other players**, **thirty classes with bespoke kits**, and **boss fights you learn**:
telegraphed attacks, void zones, danger zones you must leave now, adds, phases and bosses that talk.

## 2. Pillars

1. **Earn every verb.** A new character is simple on purpose. The game gets bigger as you do.
   Every unlock is announced, explained once and shown on the Unlocks screen (page 07 §Feature ladder).
2. **Thirty classes, thirty kits.** No two classes share a spell. Each class has one signature mechanic
   that changes how it plays (the druid shapeshifts and its bar changes; the necromancer spends corpses).
3. **Readable danger.** Every attack that can kill you is telegraphed on the ground or on the body before
   it lands. Colour, shape and sound mean the same thing everywhere (page 11). A death should feel fair.
4. **Bosses are the normal game.** Not only raids: world bosses, dungeon bosses, rare elites in the open
   world and event bosses all use the same mechanic vocabulary, scaled to the group that is fighting them.
5. **Loot you want to talk about.** Rarity tiers, affixes, class sets that change a spell, legendaries
   with powers that change how you play, secret-boss drops.
6. **Together or alone.** Every open-world zone and every 5-player dungeon (Normal) is finishable solo with
   followers (hired or class companions filling party slots). Heroic dungeons and raids expect people.
7. **Same data, new game.** Reuse the playground's modules and JSON wherever they already work
   (page 16 §Reuse map). Do not write a second copy of anything that exists.

## 3. Page list and owners

When two pages touch the same fact, the **owner's** text is the fact; other pages link to it.

| Page | Covers | Owns |
|---|---|---|
| `00-OVERVIEW.md` | this page | names, ids, level bands, class list + roles + resources, region/dungeon/raid ids, the spell ladder, templates |
| `01-WORLD-LORE.md` | the continent, regions in detail, towns, factions, history, main story, NPC cast | region content, town ids, NPC ids, story beats |
| `02-CONTROLS.md` | every key, mouse action, gamepad button, context, rebinding rules | the binding table |
| `03-UI-SCREENS.md` | every screen, panel, tab, window, tooltip, dropdown and HUD element | screen ids, HUD layout |
| `04-SETTINGS.md` | every settings tab, every option, its control, values, default | settings keys and defaults |
| `05-COMBAT.md` | basic attacks, weapon patterns, damage maths, statuses, threat, roles, death, revive, PvP rules | formulas, status list |
| `06-CLASSES.md` + `classes/*.md` | the class system; one file per class with its 6 spells, mechanic, talents, sets, legendaries | every spell, every class mechanic |
| `07-PROGRESSION.md` | XP, levels, the feature-unlock ladder, perks, talents, attributes, reputation, renown, retraining | XP table, unlock ladder |
| `08-ITEMS.md` | slots, rarities, bases, affixes, uniques, legendary powers model, crafting, salvage, consumables, economy | item rules |
| `09-SETS-LEGENDARIES.md` | the catalogue: every generic set, every legendary, an index of every class set | catalogue |
| `10-BESTIARY.md` | enemy families, every monster, AI, champions, rares, warbands | monster ids |
| `11-BOSS-MECHANICS.md` | the telegraph language, void zones, danger zones, boss dialog, phases, enrage, UI warnings | mechanic vocabulary |
| `12-DUNGEONS.md` | every 5-player dungeon: trash, sub-bosses, bosses, secret bosses, loot | dungeon content |
| `13-RAIDS-WORLD-BOSSES.md` | every raid and world boss | raid content |
| `14-QUESTS-EVENTS.md` | quest kinds, main story chain, class quests, unlock quests, dynamic events, daily/weekly | quest ids |
| `15-SOCIAL-ONLINE.md` | parties, group finder, guilds, chat, trade, auction, mail, friends, PvP, moderation | online rules |
| `16-TECH.md` | architecture, server, data files, save, netcode, reuse map of playground modules, tests | file names, JSON shapes |
| `17-ART-AUDIO.md` | Chibi 2 usage, effects, environment art, graphics budget, voices, Lingo, sound, music | art/audio rules |
| `18-ROADMAP.md` | milestones to build v2 in order | the build order |
| `QUESTIONS.md` | open decisions for the owner | — |
| `CHANGELOG.md` | every change to canon | — |

## 4. Canon numbers

| Fact | Value |
|---|---|
| Level cap | **60** (a smooth curve replaces Farhold's stretched `setLevelCap` curve; page 07) |
| Attributes | **STR, DEX, INT, CON** (Farhold's four; page 07) |
| Classes | **30** (Farhold/Emberveil's thirty; §6). The custom class of Farhold is **not** in v2 (see `QUESTIONS.md`) |
| Playable races | **Human, Elf, Dwarf, Halfling** (Farhold's body presets). Orc, Goblin, Giant, Undead, Beastkin are enemy warbands |
| Spells per class | **6 bespoke** + a class mechanic. Forms/stances may swap in alternate spells (druid etc.) |
| Spell ladder | spell slots open at levels **1, 4, 10, 18, 28, 40** |
| Class calling quests | levels **6, 20, 40** — each grants or upgrades the class mechanic |
| Talent tiers (per spell) | levels **12, 22, 32, 45** |
| Perk points | one per level from 2 (59 total) into the perk forest |
| Group sizes | party 5 · dungeon 5 · raid 10 (Normal, flex 8–10) or 20 (Mythic; r05 Normal is 15–20 flex) · world boss open (any number) |
| Roles | **Tank**, **Healer**, **Damage**, **Support** (Support counts as a Damage slot in the group finder) |
| Difficulties | Dungeons: Normal, Heroic (60), Mythic+ (60, timed, keyed levels). Raids: Normal, Mythic |
| Rarities | Common, Uncommon (blue), Rare, Epic, Unique, Set (`#2fc4b2`), **Legendary (violet `#c86bff`, new top tier)**. Farhold's "legendary" tier becomes Wildmarch's Epic (page 08) |
| Day | 60 real minutes (45 day / 15 night). Night is darker and more dangerous (page 05) |
| XP curve | `600 × 1.107^(L−1)` XP for level L → L+1, about 103 hours to 60 (page 07 owns the table) |
| Global cooldown | **1.0 s** (page 06). Basic attacks, dodge and the class keys are off it |
| Equipment slots | **15** (page 08 §2): head, shoulders, chest, back, hands, waist, legs, feet, neck, ring ×2, main hand, off hand, light, mount |
| Legendaries worn | at most **2** at once (page 08) |
| Item level | 1–88: an item's level is its drop level up to 60, then heroic 60–66, ascendant 70–76, veiled 80–88 (page 08) |
| Loot | personal loot everywhere; a 2-hour window to trade an item to someone who was eligible for the same kill |
| Weekly reset | Wednesday 07:00 server time |
| Pausing | **nothing pauses** — menus, dialogs and the map never stop the world (online game) |

## 5. The spell ladder and the class template

Every class file (`classes/<id>.md`) follows this template, in this order:

1. **Identity** — fantasy, role(s), armour, weapons, resource, companion, playstyle in three sentences.
2. **Class mechanic** — the signature system, its gauge/UI, and how the three calling quests grow it.
3. **The six spells** — for each: `id` · name · slot level · cost · cooldown · cast (instant / cast time / channel / charge) · range · shape (target, cone, line, circle, ring, self, ally, ground) · effect in numbers (% of weapon damage or % of spell power) · statuses · what it looks like (spellfx element + shape) · sound.
4. **Alternate spells** — forms, stances, stacks or pets that swap the bar (if the class has them).
5. **Talents** — 4 tiers × 6 spells, 2–3 choices each, each changing *what the spell does*, not only a number.
6. **Class sets (≥2)** — pieces, bonuses at 2/4/6, which spells they change.
7. **Class legendaries and uniques** — items with powers that only make sense for this class.
8. **Voice and barks** — voice timbre, lines on cast/crit/low health.
9. **Reuse notes** — which Farhold skill ids, pets, looks and effects this class borrows (visuals only; spells are new).

**No spell is shared between two classes.** Two classes may both have "a fire thing" but never the same
id, name, shape and numbers. Basic weapon attacks, the dodge roll, potions and mount skills are shared by
everyone and are not "spells".

## 6. The thirty classes

Resource key: **Mana** (regenerates slowly, big pool) · **Fury** (builds by hitting and being hit, decays
out of combat) · **Focus** (regenerates fast, small pool) · plus each class's own mechanic gauge.

| # | id | Class | Role | Can also | Armour | Resource | Signature mechanic (working name) |
|---|---|---|---|---|---|---|---|
| 1 | `warrior` | Warrior | Tank | Damage | heavy | Fury | **Bulwark** — block charges from Shield Bash; Unbreakable when outnumbered |
| 2 | `fighter` | Fighter | Damage | Tank | heavy | Fury | **Stances** — Offense/Defense/Precision swap spell effects |
| 3 | `paladin` | Paladin | Tank | Healer | medium | Mana | **Oaths** — sworn vow per fight changes auras and spell riders |
| 4 | `ranger` | Ranger | Damage | — | light | Focus | **Hunting cat + marks** — commands the cat, marked prey |
| 5 | `rogue` | Rogue | Damage | — | light | Focus | **Combo points + stealth** — openers, finishers |
| 6 | `cleric` | Cleric | Healer | — | light | Mana | **Devotion** — overhealing banks into a shield / mass resurrection |
| 7 | `bard` | Bard | Support | Healer | light | Mana | **Songs** — one song playing at a time, verses build to a finale |
| 8 | `mage` | Mage | Damage | — | cloth | Mana | **Arcane Charge** — spells build charges spent by the big hitters |
| 9 | `necromancer` | Necromancer | Damage | — | cloth | Mana | **Corpses + thralls** — raise, detonate, command the dead |
| 10 | `warlock` | Warlock | Damage | — | cloth | Mana | **Soul shards + pact** — DoTs spread, life paid for power |
| 11 | `demon_hunter` | Demon Hunter | Damage | Tank | light | Fury | **Vengeance + Demon Form** — fallen allies and kills fuel a transformation |
| 12 | `scavenger` | Scavenger | Damage | — | light | Focus | **The Pack (junk)** — collects scrap mid-fight, throws / builds with it |
| 13 | `swashbuckler` | Swashbuckler | Damage | — | light | Focus | **Flair** — stacks from flourishes, released by Grandeur |
| 14 | `dragon_knight` | Dragon Knight | Damage | Tank | heavy | Fury | **Draconic Aspect** — fire/ice/storm aspect; Dragon Form at 40 |
| 15 | `pyromancer` | Pyromancer | Damage | — | cloth | Mana | **Heat** — gauge that rises; overheat = empowered then vent |
| 16 | `stormcaller` | Stormcaller | Damage | — | cloth | Mana | **Static** — charges that chain; storm totems zone the field |
| 17 | `druid` | Druid | Healer | Tank, Damage | medium | Mana (forms use Fury/Focus) | **Shapeshift** — Bear, Cat, Owl, Stag forms, each with its own spell bar |
| 18 | `oracle` | Oracle | Healer | Support | cloth | Mana | **Foresight** — sees boss telegraphs early; pre-shields |
| 19 | `tactician` | Tactician | Support | — | medium | Focus | **Orders** — commands allies and followers; battle plans |
| 20 | `chronomancer` | Chronomancer | Support | Damage | cloth | Mana | **Timeline** — rewind, echo, haste; a recorded 5 s ghost |
| 21 | `monk` | Monk | Damage | Healer | cloth | Focus | **Chi** — built by strikes, spent on techniques; flow combos |
| 22 | `shaman` | Shaman | Healer | Damage | medium | Mana | **Totems + spirits** — four totem slots (earth, fire, water, air) |
| 23 | `witch_hunter` | Witch Hunter | Damage | — | medium | Focus | **Silver + Verdict** — marks, purges, anti-magic |
| 24 | `knight` | Knight | Tank | Support | heavy | Fury | **Banner + Vow of Protection** — plants a banner, guards an ally |
| 25 | `sorcerer` | Sorcerer | Damage | — | cloth | Mana | **Wild Magic** — random element rolls, surges, chaos table |
| 26 | `runesmith` | Runesmith | Tank | Damage | heavy | Fury | **Runes** — inscribes runes on ground/weapon/allies, detonates |
| 27 | `shadow_dancer` | Shadow Dancer | Damage | — | light | Focus | **Shadows** — leaves a shadow clone, swaps places, dances |
| 28 | `tinker` | Tinker | Damage | Support | medium | Focus | **Gadgets + sentry** — deployables, overclock, scrap |
| 29 | `priest` | Priest | Healer | Damage | light | Mana | **Light/Shadow balance** — a slider; heals push light, harm pushes shadow |
| 30 | `enchanter` | Enchanter | Support | — | light | Mana | **Charm** — dominates an enemy for a time; sleep/control |

The class agents own the details; the mechanics above are the brief. Class files: `classes/<id>.md`.

## 7. The Wildmarch — regions and level bands

The continent runs south (safe, green) to north (burnt, broken). Bands overlap by 1–2 levels so the next
region is always reachable. `hub` is the region's main quest town (page 01 owns towns).

| # | id | Region | Levels | Land | Hub town | Held by |
|---|---|---|---|---|---|---|
| 1 | `hearthvale` | Hearthvale | 1–6 | farm valley, orchards, a river | Brightwater | the Vale Wardens |
| 2 | `mossfen` | Mossfen | 5–12 | marsh, peat, stilt villages | Reedhollow | the Fenfolk |
| 3 | `greyridge` | Greyridge Highlands | 10–18 | hills, dwarf mines, quarries | Anvilgate | the Deepforge Clans |
| — | `highcourt` | **Highcourt** (capital city) | any | walled city between 2 and 3 | — | the Crown Assembly |
| 4 | `sunscar` | Sunscar Barrens | 16–24 | desert, mesas, glass tombs | Oasis of Tamar | the Sandsworn |
| 5 | `whisperwood` | Whisperwood | 22–30 | old elven forest, moonwells | Silverbough | the Moonwell Circle |
| 6 | `cinder_steppe` | Cinder Steppe | 28–36 | ash grassland, orc war camps | Fort Ashfall | contested (Orc warbands) |
| 7 | `frostmantle` | Frostmantle | 34–42 | tundra, glaciers, peaks | Rimehold | the Frost Wardens |
| 8 | `drowned_coast` | The Drowned Coast | 40–48 | sunken city, cliffs, undead | Saltmarch | contested (the Drowned) |
| 9 | `riftmarch` | The Riftmarch | 46–54 | magic-torn land, floating stone | Waystone Camp | the Riftwatch |
| 10 | `emberthrone` | The Emberthrone | 52–60 | volcanic, the Ember King's lands | Last Light | contested (Ember Legion) |
| 11 | `veilspire` | Veilspire Isle | 60 | endgame island, the Veil | the Spire Landing | — |

## 8. Dungeons (5 players) — ids and bands

Every dungeon has Normal (its band), Heroic (60) and Mythic+ (60). Page 12 owns content.

| id | Dungeon | Region | Levels |
|---|---|---|---|
| `d01_hollow_barrow` | The Hollow Barrow | Hearthvale | 5–7 |
| `d02_drowned_mill` | The Drowned Mill | Mossfen | 9–12 |
| `d03_deepdelve` | Deepdelve Mines | Greyridge | 13–16 |
| `d04_bellows_keep` | Bellows Keep | Greyridge | 16–18 |
| `d05_glass_tombs` | The Glass Tombs | Sunscar | 19–22 |
| `d06_sandsworn_vault` | Vault of the Sandsworn | Sunscar | 22–24 |
| `d07_thornheart` | Thornheart Hollow | Whisperwood | 25–28 |
| `d08_moonwell_ruins` | Ruins of the Moonwell | Whisperwood | 28–30 |
| `d09_warmasters_pit` | The Warmaster's Pit | Cinder Steppe | 31–34 |
| `d10_rimefang_caverns` | Rimefang Caverns | Frostmantle | 36–39 |
| `d11_saltdeep_cathedral` | Saltdeep Cathedral | Drowned Coast | 42–45 |
| `d12_unmade_workshop` | The Unmade Workshop | Riftmarch | 48–51 |
| `d13_cindergate` | Cindergate Bastion | Emberthrone | 54–57 |
| `d14_ashen_reliquary` | The Ashen Reliquary | Emberthrone | 58–60 |

## 9. Raids and world bosses

| id | Raid | Region | Level | Size | Bosses |
|---|---|---|---|---|---|
| `r01_barrowking` | Crypt of the Barrowking | Greyridge (entrance in Highcourt catacombs) | 30 | 10 | 5 + 1 secret |
| `r02_glacier_throne` | The Glacier Throne | Frostmantle | 42 | 10 | 6 + 1 secret |
| `r03_sunken_choir` | The Sunken Choir | Drowned Coast | 50 | 10/20 | 7 + 1 secret |
| `r04_ember_court` | The Ember Court | Emberthrone | 60 | 10/20 | 8 + 1 secret |
| `r05_veilspire` | Veilspire | Veilspire Isle | 60 | 20 | 10 + 1 secret |

World bosses: one per region from 3 upward (8), plus seasonal ones. Page 13 owns them.

## 10. Decisions from the first reconciliation pass (2026-09-29)

The first drafts of pages 01–18 were written in parallel and disagreed in places. These rulings settle them;
the owner page's table is the fact, and the other pages were corrected to match.

| Topic | Ruling | Owner |
|---|---|---|
| **Keys** | page 02's table. Headline: `WASD` move · `Space` jump · `F` dodge roll · `E` interact · `1`–`6` spells · **`Q` class key** · **`G` second class key** · **`Shift+1`–`4` form/stance/borrowed bar** (max 4 forms or stances per class) · `Tab` target · `H` mount · `L` light · `M` map · `I` bags · `K` spellbook (talents tab) · `N` perks · `J` quest journal · `Shift+J` dungeon journal · `P` social · `O` settings · `Alt+1`–`4` boss-dialog replies | 02 |
| **Aim model** | Hybrid by default (reticle aims, nearest enemy to it is soft-targeted, `Tab` hard-locks). Action and Classic are options. Every spell shape must work in all three | 02 |
| **Feature unlocks** | page 07's ladder. Headline: sprint 2 · potion belt 3 · spell 2 at 4 · **dodge roll 5** · calling I + group finder 6 · homeward stone 7 · first follower 8 · crafting 9 · spell 3 + **first mount 10** + Challenge 10 · bank/mail/market 11 · talents tier 1 + waystones 12 · guild 15 · calling II + faster mount 20 · wardrobe 25 · dual spec + first raid 30 · calling III + swim/leap mount 40 · Heroic, Mythic+, Renown and the **flying mount chain** at 60 | 07 |
| **Talent tiers on late spells** | a spell's tier opens at **the later of** the tier's level and the spell's slot level (spell 6 at 40 opens tiers 1–3 at once) | 07 |
| **Flying mounts** | **in**, at 60, through the `q_sky_1..5` chain. Before that, winged mounts run and glide | 07/08 |
| **Calling quest ids** | `q_calling_<class>_1`, `_2`, `_3` (levels 6/20/40) | 14 |
| **Currencies** | `cur_gold`; `cur_delve` **Delver's Marks** (dungeons); `cur_oathstone` **Oathstones** (raids, world bosses); `cur_glory`, `cur_laurels` (PvP); `cur_veil_sigil` Veil Sigils (Veilspire); `cur_festival`; `cur_rep_*`. Coins: 100 copper = 1 silver, 100 silver = 1 gold | 08 |
| **Warband level bands** | page 10's: Sootwick 2–18, Unburied 12–24, Thornmane 20–32, Ashtusk 26–40, Stonehide 34–50, Ember Legion 50–60 | 10 |
| **Pets and summons vs mechanics** | class pets take no party slot, leave danger zones 0.6 s after they appear and void zones after 0.5 s in one, never count toward soaks, and take 25% damage from room-wide hits. Followers are different: they take a party slot and do count | 11 |
| **Boss crowd control** | bosses ignore stun, knockdown, root and disarm; control fills a **break bar** instead | 05/11 |
| **Oracle colour** | dashed pale cyan `#7fe8ff` is reserved for the Oracle's early warnings; no real telegraph uses it | 11 |
| **Boss cast pauses** | one shared 90 s lockout per boss for every class tool that pauses a boss cast | 11 |
| **Companions, summons, followers** | a **class companion** (ranger's cat, necromancer's thralls…) and a **summon** (temporary) take no party slot; a **follower** (hired or recruited NPC) **takes one of the 5 party slots**. Follower slots unlock at 8/15/25/35 (page 07) | 06/07 |
| **PvP scope** | duels from 10, battlegrounds and the open-world war-mode flag from 20, rated arenas at 60. PvP-only scaling lives on page 05 | 05/15 |
| **Offline solo** | the game must be fully playable offline, solo, with followers (the build starts this way — page 18) | 16/18 |
| **Lore** | page 01 owns history and motives. The Ember King is **Maelor Varn**, the Ember Warden who lost his daughter and crowned himself **Kaedros** (`b_ember_king_kaedros`); the Everflame pins the Veil to the Spire, and Saelith guards it. Raid/dungeon pages adapt their backstories to 01. The cult formerly `fac_unwoven` is renamed **the Threadcutters** (`fac_threadcutters`) so it does not clash with the boss `b_unwoven` | 01 |
| **Quest ownership** | page 14 owns every quest id, including dungeon story quests and raid attunement chains; pages 12/13 cite 14's ids. Page 01 owns NPC ids; page 07 uses 01's givers | 14/01 |
| **Economy amounts** | page 08 owns every currency payout and price; pages 12/13 cite 08's numbers | 08 |
| **Dungeon loot** | Normal dungeon bosses roll loot every run (no daily loot lock); Heroic/Mythic+ follow page 12's lockouts | 08/12 |
| **Potion belt** | slots come from level (2 at 3, 4 at 16, page 07); the waist item adds charges, not slots | 07/08 |
| **Dungeon journal** | every boss ability is visible from the start (readable danger beats discovery); secrets stay hidden | 03/12 |
| **Raid dialog** | page 11's rule: in raids a chosen **Speaker** answers boss dialog; parties vote; solo picks | 11 |
| **Status names** | one name, one meaning: witch hunter's mark is **Silver-Branded**, shadow dancer's debuff is **Unveiled** (generic `branded` and the tactician's Exposed keep theirs) | 05 |
| **Extra id prefixes** | `mech_` mechanic · `mod_` monster modifier · `a_` monster ability · `bl_` boss line · `dlg_` dialog choice · `ach_` achievement · `unl_` unlock · `cur_` currency · `sz_` sub-zone · `town_` · `lm_` landmark · `fac_` faction · `ev_` event · `fest_` festival · `si_` story instance · `hm_` hard mode · `ft_` feat | all |

## 11. Rules every page obeys

1. **No third-party IP in player-facing text.** Other games (WoW, Diablo, etc.) may be named only in
   design notes marked *(reference)*. All names in the game are original.
2. **Numbers, not feelings.** Write "deals 140% weapon damage in a 6 m cone", never "deals heavy damage".
   Farhold's `WORDING.md` is the standard for player-facing text.
3. **Every telegraph gives time.** Minimum warning times are owned by page 11.
4. **Every item has a way to get it.** A drop source, a vendor, a quest or a recipe. No orphan loot.
5. **Every unlock is announced** with a card, a sound and an entry on the Unlocks screen.
6. **Every screen is listed on page 03**, every key on page 02, every option on page 04. If you add one
   elsewhere, add it there too.
7. **Mark what is reused** from Farhold/the playground with `(reuse: path)` and what is new with `(new)`.
8. **Plain language.** The owner reads this. Define a technical term the first time it is used.
