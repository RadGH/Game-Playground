# WILDMARCH — Design Bible, page 00: overview and canon

> *"Everyone starts with a stick and one spell. The Wildmarch decides the rest."*

**Status:** v0.2 draft for review — 2026-09-30 (round 2: the owner's answers to the WoW audit and his new
feedback are applied; see [§12](#12-round-2-rulings-2026-09-30)). **Nothing is built.** This bible is written
first so the AI that builds version 2 has one place to read every name, number, screen and key before writing
a line. **Wildmarch is a working title** (see `QUESTIONS.md`).

This page is the **canon**. Every other page expands one part of it and must use the names, ids and numbers
fixed here. If another page disagrees with this page, **this page wins** until it is changed on purpose and
the change is logged in `CHANGELOG.md`.

---

## 1. The pitch

**Wildmarch** is an **online action RPG** with a shared, MMO-style world, set on one hand-shaped continent,
*the Wildmarch*. Play is built for **small groups: everything is designed for at most 5 players**, except
world bosses, towns and hubs, and trading. You start in a farming valley with a starter weapon and
one spell. You leave it on foot. Every region past it is harder than the last, and most of what makes a
character feel powerful — the second spell, the dodge roll, the mount, the class's signature trick, talents,
travel routes, deeper dungeons — **unlocks as you level** or when you finish an important quest.

It is a sibling of **Farhold** (`prototypes/farhold/`), not a sequel. It keeps Farhold's best parts —
Chibi 2 characters, the item/affix/unique system, the perk forest, per-spell talents, the level ladder,
the inventory and paper doll, formant voices, Lingo speech, the combat feel — and drops the parts that
made Farhold a planet sandbox (space flight, base building, industry, colonies, terraforming).
What it adds is **other players**, **thirty classes with bespoke kits** (many of them hybrids), and **boss
fights you learn**: telegraphed attacks, void zones, danger zones you must leave now, adds, phases and bosses
that talk — tuned for five people.

## 2. Pillars

1. **Unlock as you go.** A new character is simple on purpose, and new features arrive as you level or finish
   key quests, so the game grows with you instead of starting with thirty buttons. Every unlock is announced,
   explained once and shown on the Unlocks screen (page 07 §Feature ladder).
2. **Thirty classes, thirty kits.** No two classes share a spell. Each class has one signature mechanic
   that changes how it plays, and most can fill a second role (a mage who tanks with wards and decoys, a
   pyromancer who heals by cauterizing).
3. **Readable danger.** Every attack that can kill you is telegraphed on the ground or on the body before
   it lands. Colour, shape and sound mean the same thing everywhere (page 11). A death should feel fair.
4. **Bosses are the normal game.** World bosses, dungeon bosses, rare monsters in the open world and event
   bosses all use the same mechanic vocabulary, scaled to the group that is fighting them (at most 5, except
   world bosses).
5. **Loot you want to talk about.** Rarities, affixes, sockets (gems, jewels, souls, gadgets), tags,
   special rarities, class sets that change a spell, legendaries that change how you play, secret-boss drops.
6. **Together or alone.** Every open-world zone and every dungeon on Normal is finishable solo with
   followers (hired or class companions filling party slots). Challenge mode and deep Depths expect people.
7. **Same data, new game.** Reuse the playground's modules and JSON wherever they already work
   (page 16 §Reuse map). Do not write a second copy of anything that exists.

## 3. Page list and owners

When two pages touch the same fact, the **owner's** text is the fact; other pages link to it.

| Page | Covers | Owns |
|---|---|---|
| `00-OVERVIEW.md` | this page | names, ids, level bands, class list + roles + resources, region/dungeon ids, the spell ladder, templates |
| `01-WORLD-LORE.md` | the continent, regions in detail, towns, factions, history, main story, NPC cast | region content, town ids, NPC ids, faction ids, story beats |
| `02-CONTROLS.md` | every key, mouse action, gamepad button, context, rebinding rules | the binding table, the targeting model |
| `03-UI-SCREENS.md` | every screen, panel, tab, window, tooltip, dropdown and HUD element (incl. the item card) | screen ids, HUD layout |
| `04-SETTINGS.md` | every settings tab, every option, its control, values, default | settings keys and defaults |
| `05-COMBAT.md` | basic attacks, weapon patterns, damage maths, **tags**, statuses, threat, roles, death, revive, duels | formulas, status list, the tag list |
| `06-CLASSES.md` + `classes/*.md` | the class system; one file per class with its 6 spells, mechanic, talents, sets, legendaries | every spell, every class mechanic |
| `07-PROGRESSION.md` | XP, levels, the feature-unlock ladder, perks, talents, attributes, reputation, retraining | XP table, unlock ladder, reputation tiers |
| `08-ITEMS.md` | slots, rarities, **special rarities**, bases, affixes, **sockets** (gems, jewels, souls, gadgets), uniques, legendary powers model, **magic find**, salvage, consumables, economy, mounts as loot | item rules |
| `09-SETS-LEGENDARIES.md` | the catalogue: every generic set, every legendary, every soul, an index of every class set | catalogue |
| `10-BESTIARY.md` | enemy families, every monster, AI, **monster rarities** (champion packs, rares, greater rarities), warbands | monster ids, monster rarity table |
| `11-BOSS-MECHANICS.md` | the telegraph language, void zones, danger zones, boss dialog, phases, enrage, UI warnings | mechanic vocabulary |
| `12-DUNGEONS.md` | every 5-player dungeon: trash, sub-bosses, bosses, secret bosses, loot; **Normal / Challenge**; **Depth**; the Dungeon Finder rules | dungeon content, Depth |
| `13-WORLD-BOSSES.md` | every world boss | world boss content |
| `14-QUESTS-EVENTS.md` | quest kinds, main story chain, class quests, unlock quests, dynamic events | quest ids |
| `15-SOCIAL-ONLINE.md` | parties, dungeon finder queue, guilds, chat, trade, Trading Post, mail, friends, duels, moderation | online rules |
| `16-TECH.md` | architecture, server, data files, save, netcode, reuse map of playground modules, tests | file names, JSON shapes |
| `17-ART-AUDIO.md` | Chibi 2 usage, effects, environment art and lighting, graphics budget, voices, Lingo, sound, music | art/audio rules |
| `18-ROADMAP.md` | milestones to build v2 in order | the build order |
| `19-PROFESSIONS.md` | **(new)** Harvesting (one shared gathering skill), the crafting professions, recipes, gadgets | profession rules |
| `20-TRAVEL.md` | **(new)** walking, mounts, **Travel Methods** (routed wagons, striders, boats, trains, flyers), teleport spells and scrolls, the Recall Stone, waystones | travel rules |
| `WISHLIST.md` | **(new)** ideas parked for later: raids (the old r01–r05 designs), raid frames, mass resurrection, dungeon currencies, attunement, PvP beyond duels, housing… | — |
| `QUESTIONS.md` | open decisions for the owner | — |
| `CHANGELOG.md` | every change to canon | — |

## 4. Canon numbers

| Fact | Value |
|---|---|
| Level cap | **60** (a smooth curve replaces Farhold's stretched `setLevelCap` curve; page 07) |
| Attributes | **STR, DEX, INT, CON** (Farhold's four; page 07) |
| Classes | **30** (§6). The custom class of Farhold is **not** in v2 (see `QUESTIONS.md`) |
| Playable races | **Human, Elf, Dwarf, Halfling** (Farhold's body presets). Orc, Goblin, Giant, Undead, Beastkin are enemy warbands |
| Player factions | **one** — every player is on the same side, whatever their race or starting town. No player-vs-player faction split |
| Starting towns | **Brightwater** or **Oakhollow** (both in Hearthvale), any race (page 01) |
| Spells per class | **6 bespoke** + a class mechanic, plus out-of-combat **utility spells** (travel, rituals) that do not use a slot |
| Spell ladder | spell slots open at levels **1, 4, 10, 18, 28, 40** |
| Class calling quests | levels **6, 20, 40** — each grants or upgrades the class mechanic |
| Talent tiers (per spell) | levels **12, 22, 32, 45** |
| Perk points | one per level from 2 (59 total) into the perk forest |
| Group sizes | party **5** · dungeon **5** (Normal and Challenge) · world boss open (any number). **No raids in v2** (parked in `WISHLIST.md`) |
| Roles | **Tank**, **Healer**, **Damage**, **Support** (Support counts as a Damage slot in the Dungeon Finder). Most classes have a primary role and a **hybrid** role (§6) |
| Difficulties | Dungeons: **Normal** (the dungeon's band) and **Challenge** (level 60, harder mechanics). **Depth** is a separate dial on top of either (page 12) |
| Rarities | Common, Uncommon (blue), Rare, Epic, Unique, Set (`#2fc4b2`), **Legendary (violet `#c86bff`)**. Plus five **special rarities** that sit on top of an Uncommon-or-better item (§12.3, page 08) |
| Monster rarities | Normal · **Champion pack** (blue names, shared affix) · **Rare** (yellow, 2–3 affixes + minions) · Named · Boss — plus **greater rarities** (Giant, Flaming, Electrified…) layered on top (page 10) |
| Day and light | **always daytime.** No day/night cycle, no light slot, no torch key. Dark places (graveyards, caves, crypts) are "film-set dark": they look dark but ambient light keeps everything readable; caves are lit by glowing fungi, lava and plants (page 17) |
| XP curve | `600 × 1.107^(L−1)` XP for level L → L+1, about 103 hours to 60 (page 07 owns the table). **No rested XP** |
| Global cooldown | **1.0 s** (page 06). Basic attacks, dodge and the class keys are off it |
| Targeting | **Tab targeting** (page 02): a hard target shown in one target frame that never changes by itself, plus target-of-target and a **watch target** (`Y`). Spell targeting kinds: **Needs target**, **Ally**, **Auto-target**, **Ground**, **Self** (§12.1 W8). Heals with no friendly target refuse ("No friendly target"); self-cast fallback is an option, **off by default** |
| Recall Stone | key `Home`; bind rules on page 20 |
| Equipment slots | **15** (page 08 §2): head, shoulders, chest, back, hands, waist, legs, feet, neck, ring ×2, main hand, off hand, **tool**, mount. (The light slot is gone; the **tool** slot holds the harvesting tool) |
| Item level | **1–60 = the level needed to wear it.** No item level above 60, no upgrade tracks |
| Legendaries worn | at most **2** at once (page 08) |
| Sockets | four socket kinds: **Gem**, **Jewel**, **Soul**, **Gadget** (page 08) |
| Professions | everyone can **Harvest** (one shared skill, needs the right tool). Each character picks **one** crafting profession (page 19) |
| Loot | **personal loot** everywhere. Items are **tradeable** (no binding) except quest items. The word "soulbound" is never used |
| Currency | **gold only** (plus reputation standing). No dungeon, raid or PvP currencies |
| Weekly reset | **Monday 06:00** server time — used only for the once-a-week loot limit on Challenge-mode bosses and world bosses |
| Pausing | **nothing pauses** — menus, dialogs and the map never stop the world (online game) |

## 5. The spell ladder and the class template

Every class file (`classes/<id>.md`) follows this template, in this order:

1. **Identity** — fantasy, primary role, hybrid role, build (melee / ranged / caster), armour, weapons,
   resource, companion, playstyle in three sentences.
2. **Class mechanic** — the signature system, its UI, and how the three calling quests grow it.
3. **The six spells** — for each: `id` · name · slot level · cost · cooldown · cast (instant / cast time /
   channel / charge) · **targeting (Needs target / Auto-target / Self / Ally / Ground)** · range · shape
   (target, cone, line, circle, ring, self, ally, ground) · **tags** (page 05 §Tags) · effect in numbers
   (% of weapon damage or % of spell power) · statuses · what it looks like (spellfx element + shape) · sound.
4. **Alternate spells** — forms, stances, stacks or pets that change the spells (if the class has them).
5. **The hybrid role** — how the class fills its second role (which spells, talents and gear), and how well
   (hybrid roles are tuned for the open world, Normal and moderate Depth; see §6).
6. **Utility spells** — out-of-combat spells that use no slot (travel, rituals, reviving a bound pet), if any.
7. **Talents** — 4 tiers × 6 spells, 2–3 choices each, each changing *what the spell does*, not only a number.
8. **Class sets (≥2)** — pieces, bonuses at 2/4/6, which spells they change.
9. **Class legendaries, uniques and souls** — items with powers that only make sense for this class.
10. **Voice and barks** — voice timbre, lines on cast/crit/low health.
11. **Reuse notes** — which Farhold skill ids, pets, looks and effects this class borrows (visuals only; spells are new).

**No spell is shared between two classes.** Two classes may both have "a fire thing" but never the same
id, name, shape and numbers. Basic weapon attacks, the dodge roll, potions and mount skills are shared by
everyone and are not "spells".

## 6. The thirty classes

**Resources** (three, one per class):

- **Mana** — a big pool that refills slowly. Spend it carefully.
- **Momentum** — starts empty, **builds** as you hit and as you are hit, drains out of combat. Spend it on the
  big moves. (Replaces the old "Fury".)
- **Tempo** — a small pool that **refills fast** (about a full bar every 4 s). Spend it constantly. (Replaces the
  old "Focus".)

**Build** is how the class mainly fights: **melee**, **ranged** (weapon at range: bow, crossbow, thrown,
gun) or **caster** (spells at range). Every **resource × build** pair has at least one class, including a
**Momentum caster** (the Pyromancer — casting builds heat).

**Primary role** is fully tuned for every piece of content, Challenge mode included. **Hybrid role** is a real
second role — the class can queue as it in the Dungeon Finder — tuned to be effective in the open world,
Normal dungeons and moderate Depth, and allowed to be weaker in Challenge mode. The unexpected crossbreeds
are deliberate (the owner likes hybrids).

| # | id | Class | Primary | Hybrid | Build | Armour | Resource | Signature mechanic (the brief; the class file owns the detail) |
|---|---|---|---|---|---|---|---|---|
| 1 | `warrior` | Warrior | Tank | Damage | melee | heavy | Momentum | **Bulwark** — block charges from Shield Bash; stands firmer the more enemies are on him |
| 2 | `fighter` | Fighter | Damage | Tank | melee | heavy | Momentum | **Stances** — Offense / Defense / Precision change what each of the six spells does |
| 3 | `paladin` | Paladin | Tank | Healer | melee | medium | Mana | **Oaths** — a sworn vow per fight changes auras and spell riders |
| 4 | `ranger` | Ranger | Damage | Support | ranged | light | Tempo | **Tame Beast** — tames a wild beast of your choice that stays for good and can be revived by a ritual; hunter's marks |
| 5 | `rogue` | Rogue | Damage | Support | melee **or** ranged | light | Tempo | **Blind Spots** — hits from outside an enemy's view (behind, flank, or unnoticed at range) open **Wounds** that the rogue's finishers spend; works the same with daggers, thrown knives, short bows and hand crossbows |
| 6 | `cleric` | Cleric | Healer | Support | caster | light | Mana | **Devotion** — overhealing banks into shields |
| 7 | `bard` | Bard | Support | Healer | caster | light | Tempo | **Songs** — one song playing at a time, verses build to a finale; keeping the beat refills Tempo |
| 8 | `mage` | Mage | Damage | **Tank** | caster | cloth | Mana | **Resonance** — spells build Resonance spent by the big hitters; **Wards** (deflecting shields, decoy images that pull attention) let the mage tank |
| 9 | `necromancer` | Necromancer | Damage | Healer | caster | cloth | Mana | **Corpses + Control Undead** — spends corpses; **Control Undead** (temporary) raises a fresh non-undead corpse or takes over a living undead enemy |
| 10 | `warlock` | Warlock | Damage | **Tank** | caster | cloth | Mana | **Tithes + Bind Demon** — pays health for power, Blight spreads; **Bind Demon** binds a demon you have beaten to serve you (revived by an out-of-combat ritual). No summoned pet |
| 11 | `demon_hunter` | Demon Hunter | Damage | — | ranged + melee | light | Momentum | **Demonsight + Traps** — magic that finds hidden and demon-tagged enemies and their weak points; hand crossbows, daggers and traps. No gauge, no form |
| 12 | `scavenger` | Scavenger | Damage | Support | ranged (thrown) | light | Momentum | **The Pack (junk)** — collects scrap mid-fight, throws / builds with it |
| 13 | `swashbuckler` | Swashbuckler | Damage | **Tank** | melee | light | Tempo | **Flair** — stacks from flourishes, released by Grandeur; parry-and-riposte tanking |
| 14 | `dragon_knight` | Dragon Knight | Damage | Tank | melee | heavy | Momentum | **Draconic Aspect** — fire / ice / storm aspect changes the spells; Dragon Form at 40 |
| 15 | `pyromancer` | Pyromancer | Damage | **Healer** | caster | cloth | **Momentum (Heat); no mana bar** | **Heat** — casting builds heat (the class's Momentum); high heat empowers, venting releases it; cauterizing flames heal allies |
| 16 | `stormcaller` | Stormcaller | Damage | Support | caster | cloth | Mana | **Static** — charges that chain between charged enemies; lightning rods driven into the ground (not totems) |
| 17 | `druid` | Druid | Healer | Tank, Damage | caster / melee | medium | Mana | **Shapeshift** — Bear, Wolf and Heron forms **transform each of the six spells into a different spell** (one bar, four versions) |
| 18 | `oracle` | Oracle | Healer | Support | caster | cloth | Mana | **Foresight** — sees boss telegraphs early; pre-shields |
| 19 | `tactician` | Tactician | Support | **Tank** | ranged (crossbow, spear) | medium | Tempo | **Orders** — commands allies and followers; battle plans |
| 20 | `chronomancer` | Chronomancer | Support | **Healer** | caster | cloth | Mana | **Timeline** — rewind, echo, haste; a recorded 5 s ghost; rewinds allies' health |
| 21 | `monk` | Monk | Damage | Healer | melee | cloth | Tempo | **Breath** — built by strikes, spent on techniques; flow combos |
| 22 | `shaman` | Shaman | Healer | Damage | caster | medium | Mana | **Storm Tales** — calls the storm-beasts of old folk tales (Thunder Ox, Rain Crane, Wind Hare — a crane, so it is never confused with the druid's Heron form); the last beast called rides your next spells, and telling all three brings the Great Storm. **No totems** |
| 23 | `witch_hunter` | Witch Hunter | Damage | Support | ranged (crossbow) | medium | **Mana** | **Silver + Verdict** — marks, purges, anti-magic |
| 24 | `knight` | Knight | Tank | Support | melee | heavy | Momentum | **Banner + Vow of Protection** — plants a banner, guards an ally |
| 25 | `sorcerer` | Sorcerer | Damage | Support | caster | cloth | Mana | **Wild Magic** — random element rolls, surges, the chaos table |
| 26 | `runesmith` | Runesmith | Tank | Damage | melee | heavy | **Mana** | **Runes** — inscribes runes on ground/weapon/allies, detonates |
| 27 | `shadow_dancer` | Shadow Dancer | Damage | **Tank** | melee | light | Tempo | **Shadows** — leaves a shadow clone, swaps places; clones soak attention |
| 28 | `tinker` | Tinker | Damage | **Healer** | ranged (gun, crossbow) | medium | Tempo | **Devices + sentry** — deployables (called Devices so they are never confused with Engineering's Gadget socketables), overclock, scrap; repair drones heal |
| 29 | `priest` | Priest | Healer | Damage | caster | light | Mana | **Light/Shadow balance** — a slider; heals push light, harm pushes shadow |
| 30 | `enchanter` | Enchanter | Support | **Tank** | caster | light | Mana | **Charm** — dominates an enemy for a time; illusions distract and hold attention |

**Resource × build coverage** (every cell has at least one class):

| | Melee | Ranged | Caster |
|---|---|---|---|
| **Mana** | Paladin, Runesmith | Witch Hunter | Mage, Necromancer, Warlock, Cleric, Stormcaller, Druid, Oracle, Chronomancer, Shaman, Sorcerer, Priest, Enchanter |
| **Momentum** | Warrior, Fighter, Dragon Knight, Knight | Scavenger, Demon Hunter | **Pyromancer** |
| **Tempo** | Rogue, Swashbuckler, Monk, Shadow Dancer | Ranger, Tinker, Tactician, (Rogue) | Bard |

**Switching to the hybrid role.** Every class has a **Role focus** switch in the spellbook (out of combat only,
saved per Loadout): Primary or Hybrid. The class file says what the switch changes (which spells turn into
their hybrid versions, threat multipliers, healing conversion). A class may additionally tie the switch to
something it already has — a stance, oath, form or a shield in the off hand — and the class file says so.
The Dungeon Finder queues you as the role your Role focus is set to.

**Pets.** A **bound or tamed** companion (ranger's tamed beast, warlock's bound demon) is permanent, takes no
party slot and is revived out of combat by the class's ritual utility spell. A **controlled** body
(necromancer's Control Undead, enchanter's Charm) is temporary. No class summons a pet out of thin air.
Pets follow the pet rules in §10 (they never count toward soaks).

**Travel utility spells** (out of combat, no slot; page 20 owns the numbers): Mage **Portal** (opens a gate
the party can step through to a discovered town waystone), Chronomancer **Retrace** (returns the party to a
spot one of them stood on in the last 10 minutes), Oracle **Guiding Call** (pulls one party member to the
oracle — an *assisted teleport*; arriving somewhere counts as discovering it), Druid **Heron's Flight**
(the druid alone, to any discovered waystone). Everyone else uses scrolls and the Recall Stone (page 20).

The class agents own the details; the mechanics above are the brief. Class files: `classes/<id>.md`.

## 7. The Wildmarch — regions and level bands

The continent runs south (safe, green) to north (burnt, broken). Bands overlap by 1–2 levels so the next
region is always reachable. `hub` is the region's main quest town (page 01 owns towns). "Held by" names
the **chapter** of one of the seven player factions (§12.2 W12) that holds the region.

| # | id | Region | Levels | Land | Hub town | Held by |
|---|---|---|---|---|---|---|
| 1 | `hearthvale` | Hearthvale | 1–6 | farm valley, orchards, a river | Brightwater | the Wardens (Vale watch) |
| 2 | `mossfen` | Mossfen | 5–12 | marsh, peat, stilt villages | Reedhollow | the Greenhand (the Fenfolk) |
| 3 | `greyridge` | Greyridge Highlands | 10–18 | hills, dwarf mines, quarries | Anvilgate | the Deepforge Clans |
| — | `highcourt` | **Highcourt** (capital city) | any | walled city between 2 and 3 | — | the Crown Assembly |
| 4 | `sunscar` | Sunscar Barrens | 16–24 | desert, mesas, glass tombs | Oasis of Tamar | the Quiet Wake (the Sandsworn) |
| 5 | `whisperwood` | Whisperwood | 22–30 | old elven forest, moonwells | Silverbough | the Greenhand (the Moonwell Circle) |
| 6 | `cinder_steppe` | Cinder Steppe | 28–36 | ash grassland, orc war camps | Fort Ashfall | contested (Crown Assembly vs the Ashtusk Warhost) |
| 7 | `frostmantle` | Frostmantle | 34–42 | tundra, glaciers, peaks | Rimehold | the Wardens (Rime watch) |
| 8 | `drowned_coast` | The Drowned Coast | 40–48 | sunken city, cliffs, undead | Saltmarch | contested (the Cutwater vs the Drowned) |
| 9 | `riftmarch` | The Riftmarch | 46–54 | magic-torn land, floating stone | Waystone Camp | the Lantern House (the Riftwatch) |
| 10 | `kingsfire` | **Kingsfire** | 52–60 | volcanic, the Fire King's lands | Last Light | contested (the Kingsfire Legion) |
| 11 | `spire_isle` | **Spire Isle** | 60 | endgame island, the Spire and the Tear | the Spire Landing | — |

(Renamed in round 2: `emberthrone` → `kingsfire`, `veilspire` → `spire_isle`. See §12.4.)

## 8. Dungeons (5 players) — ids and bands

Every dungeon has **Normal** (its band) and **Challenge** (level 60), and a **Depth** dial on top (page 12).
Page 12 owns content. d15 and d16 are the story finales that used to be raids r04 and r05, rebuilt for five.

| id | Dungeon | Region | Levels |
|---|---|---|---|
| `d01_hollow_barrow` | The Hollow Barrow | Hearthvale | 5–7 |
| `d02_drowned_mill` | The Drowned Mill | Mossfen | 9–12 |
| `d03_shaft_seven` | Shaft Seven Mines (was Deepdelve — "delve" is on the banned list) | Greyridge | 13–16 |
| `d04_bellows_keep` | Bellows Keep | Greyridge | 16–18 |
| `d05_glass_tombs` | The Glass Tombs | Sunscar | 19–22 |
| `d06_sandsworn_vault` | Vault of the Sandsworn | Sunscar | 22–24 |
| `d07_thornheart` | Thornheart Hollow | Whisperwood | 25–28 |
| `d08_moonwell_ruins` | Ruins of the Moonwell | Whisperwood | 28–30 |
| `d09_warmasters_pit` | The Warmaster's Pit | Cinder Steppe | 31–34 |
| `d10_rimefang_caverns` | Rimefang Caverns | Frostmantle | 36–39 |
| `d11_saltdeep_cathedral` | Saltdeep Cathedral | Drowned Coast | 42–45 |
| `d12_unmade_workshop` | The Unmade Workshop | Riftmarch | 48–51 |
| `d13_cindergate` | Cindergate Bastion | Kingsfire | 54–57 |
| `d14_ashen_reliquary` | The Ashen Reliquary | Kingsfire | 58–60 |
| `d15_fire_court` | **The Fire Court** (the main story's climax; was raid r04) | Kingsfire | 60 |
| `d16_the_spire` | **The Spire** (the epilogue; was raid r05) | Spire Isle | 60 |

A dungeon appears in the **Dungeon Finder** only after the character has **discovered its entrance** in the
world (walked up to it, or arrived there by a teleport). See §12.1 W9.

## 9. World bosses (no raids)

**Raids are not in v2.** The five raid designs (`r01`–`r05`) are kept, unchanged, in `WISHLIST.md` for a
later version. Their best boss mechanics are reused in 5-player dungeons, re-tuned for five (page 12), and
the two story raids became d15 and d16.

World bosses stay: one per region from region 3 upward (8), plus seasonal ones, open to any number of players.
Page 13 (`13-WORLD-BOSSES.md`) owns them.

## 10. Decisions from the first reconciliation pass (2026-09-29)

The first drafts of pages 01–18 were written in parallel and disagreed in places. These rulings settle them;
the owner page's table is the fact, and the other pages were corrected to match. Rows marked
**(superseded — §12)** were changed by round 2.

| Topic | Ruling | Owner |
|---|---|---|
| **Keys** | page 02's table. Headline: `WASD` move · `Space` jump · `F` dodge roll · `E` interact · `1`–`6` spells · **`Q` class key** · **`G` second class key** · **`Shift+1`–`4` form/stance** (max 4 forms or stances per class) · `Tab` next enemy target · `F1` target yourself · `F2`–`F5` target party members · `H` mount · `M` map · `I` bags · `K` spellbook (talents tab) · `N` perks · `J` quest journal · `Shift+J` dungeon journal · `P` social · `O` settings · `Alt+1`–`4` boss-dialog replies. (`L` light is gone — §12) | 02 |
| **Aim model** | **(superseded — §12 W8)** Tab targeting is the default and the model every spell is written for | 02 |
| **Feature unlocks** | page 07's ladder. Headline: sprint 2 · potion belt 3 · spell 2 at 4 · **dodge roll 5** · calling I + Dungeon Finder 6 · Recall Stone 7 · first follower 8 · harvesting + a crafting profession 9 · spell 3 + **first mount 10** + **Provoke** (the shared taunt for tank-capable classes; was called "Challenge", renamed so it does not clash with Challenge mode) 10 · bank/mail/Trading Post 11 · talents tier 1 + Travel Methods and waystone teleports (page 20: waystones are teleport destinations and Recall Stone binds, not a free travel menu) 12 · guild 15 · calling II + faster mount 20 · wardrobe 25 · Second Loadout 30 · calling III + swim/leap mount 40 · Challenge mode, deep Depths and the flying mount chain at 60. (Raids, Renown and PvP beyond duels are gone — §12) | 07 |
| **Talent tiers on late spells** | a spell's tier opens at **the later of** the tier's level and the spell's slot level (spell 6 at 40 opens tiers 1–3 at once) | 07 |
| **Flying mounts** | in, at 60, through a story chain in Kingsfire (`q_sky_1..5`, page 14) — not by grinding reputations or dungeon ranks. Before that, winged mounts run and glide | 07/08 |
| **Calling quest ids** | `q_calling_<class>_1`, `_2`, `_3` (levels 6/20/40) | 14 |
| **Currencies** | **(superseded — §12 W26/W19)** gold only | 08 |
| **Warband level bands** | page 10's: Sootwick 2–18, Unburied 12–24, Thornmane 20–32, Ashtusk Warhost 26–40, Stonehide 34–50, Kingsfire Legion 50–60 | 10 |
| **Pets and summons vs mechanics** | class pets take no party slot, leave danger zones 0.6 s after they appear and void zones after 0.5 s in one, never count toward soaks, and take 25% damage from room-wide hits. Followers are different: they take a party slot and do count | 11 |
| **Boss crowd control** | bosses ignore stun, knockdown, root and disarm; control fills a **break bar** instead | 05/11 |
| **Oracle colour** | dashed pale cyan `#7fe8ff` is reserved for the Oracle's early warnings; no real telegraph uses it | 11 |
| **Boss cast pauses** | one shared 90 s lockout per boss for every class tool that pauses a boss cast | 11 |
| **Companions, summons, followers** | a **class companion** (tamed beast, bound demon, controlled undead…) takes no party slot; a **follower** (hired or recruited NPC) **takes one of the 5 party slots**. Follower slots unlock at 8/15/25/35 (page 07) | 06/07 |
| **PvP scope** | **(superseded — §12 W1)** friendly duels only | 05/15 |
| **Offline solo** | the game must be fully playable offline, solo, with followers (the build starts this way — page 18) | 16/18 |
| **Lore** | page 01 owns history and motives. The Fire King is **Maelor Varn**, the Flame Warden who lost his daughter and crowned himself **Kaedros** (`b_fire_king_kaedros`); his wife **Lady Sabeth Varn** is Ysa's mother and the secret behind d15; the Everflame pins **the Mend** to the Spire, and Saelith guards it. The cult is **the Threadcutters** (`fac_threadcutters`) | 01 |
| **Quest ownership** | page 14 owns every quest id, including dungeon story quests; pages 12/13 cite 14's ids. Page 01 owns NPC ids; page 07 uses 01's givers | 14/01 |
| **Economy amounts** | page 08 owns every payout and price; pages 12/13 cite 08's numbers | 08 |
| **Dungeon loot** | Normal dungeon bosses roll loot every run (no loot lock); Challenge-mode bosses once per week per boss (Monday 06:00 reset); Depth rules on page 12 | 08/12 |
| **Potion belt** | slots come from level (2 at 3, 4 at 16, page 07); the waist item adds charges, not slots | 07/08 |
| **Dungeon journal** | every boss ability is visible from the start (readable danger beats discovery); secrets stay hidden | 03/12 |
| **Boss dialog** | in a group, the party votes on a boss-dialog reply (a tie goes to the party leader); solo picks | 11 |
| **Status names** | one name, one meaning: witch hunter's mark is **Silver-Branded**, shadow dancer's debuff is **Unveiled** → renamed **Revealed** (§12.4), generic `branded` and the tactician's Exposed keep theirs | 05 |
| **Extra id prefixes** | `mech_` mechanic · `mod_` monster modifier · `grr_` greater monster rarity · `a_` monster ability · `bl_` boss line · `dlg_` dialog choice · `ach_` achievement · `unl_` unlock · `sz_` sub-zone · `town_` · `lm_` landmark · `fac_` faction · `ev_` event · `fest_` festival · `si_` story instance · `hm_` hard mode · `ft_` feat · `tag_` tag · `gem_` / `jwl_` / `soul_` / `gdg_` socketables · `sr_` special rarity · `prof_` profession · `tm_` travel method · `mf_` magic-find stat · `sz_`, `town_`, `hc_` (Highcourt district), `wb_site_` (world-boss site), `chp_` (faction chapter), `ct_` (page 01) · a `discover` quest objective (page 14) · `dmod_` Depth modifier (page 12) · `ja_` jewel affix · `sw_` Starwoven affix (page 08) · `tms_` Travel Method station · `rcp_` recipe · `hv_` harvest activity · `gl_` gadget line · `mat_` material · the Depth monster types and wardens are page 10's | all |

## 11. Rules every page obeys

1. **No third-party IP in player-facing text.** Other games (WoW, Diablo, Path of Exile, etc.) may be named
   only in design notes marked *(reference)*. All names in the game are original. The banned-name list is
   §12.5.
2. **Numbers, not feelings.** Write "deals 140% weapon damage in a 6 m cone", never "deals heavy damage".
   Farhold's `WORDING.md` is the standard for player-facing text.
3. **Every telegraph gives time.** Minimum warning times are owned by page 11.
4. **Every item has a way to get it.** A drop source, a vendor, a quest or a recipe. No orphan loot.
5. **Every unlock is announced** with a card, a sound and an entry on the Unlocks screen.
6. **Every screen is listed on page 03**, every key on page 02, every option on page 04. If you add one
   elsewhere, add it there too.
7. **Mark what is reused** from Farhold/the playground with `(reuse: path)` and what is new with `(new)`.
8. **Plain language.** The owner reads this. Define a technical term the first time it is used. **No
   slogan fragments** ("earn every verb") — write whole sentences that say what happens.
9. **Five players.** Nothing outside world bosses, towns and trading is designed for more than 5 players.
10. **Name words.** Do not use "ember" or "veil" in new names (they were overused into word salad). Write
    names that are plain and memorable.

---

## 12. Round 2 rulings (2026-09-30)

The owner answered the WoW audit (`WOW-AUDIT.md`, items W1–W40) and sent new feedback. **Every
recommendation in the audit was accepted except where the owner wrote his own answer**; the table below
states the final ruling for every item, and §12.3 describes the new systems. Every page must match this
section. Where it conflicts with anything older, this section wins.

### 12.1 The WoW audit — final rulings

| # | Ruling | Pages to change |
|---|---|---|
| **W1** | **PvP: friendly duels only** (from level 10, no rewards, no gear, no ladder). Battlegrounds, arenas, Glory, Laurels, the PvP set → `WISHLIST.md` | 00, 03, 05, 07, 08, 09, 14, 15, 18 |
| **W2** | **War Mode removed** | 00, 07, 15 |
| **W3** | **Depth** replaces Mythic+ (no timer, no keys). Any dungeon can be run at a chosen Depth once you have cleared it on Normal. **Depth raises the dungeon's level** by 3 per depth until it reaches 60; **past 60 each depth gets substantially harder** (health and damage climb, packs grow) and pays **high-tier rewards** (better rarity odds, jewels, souls, special rarities). Every 5 depths is a **Depth tier** that adds more and tougher enemies, **new enemy types** and **new enemy abilities**. Depth modifiers are our own, tied to the Tear (§12.4). Page 12 owns the numbers | 00, 03, 07, 08, 10, 12, 14, 15, 18 |
| **W4** | **Two difficulties: Normal and Challenge.** Challenge = the level-60 harder version with the full boss mechanic set. No third tier. The names Heroic and Mythic are never used | all |
| **W5** | Weekly loot limit per boss **only for Challenge-mode bosses and world bosses**; reset **Monday 06:00**. No bonus rolls, no loot master (personal loot) | 00, 03, 08, 12, 13 |
| **W6** | **Raids → `WISHLIST.md`, not built now.** Raid-style mechanics stay, **in dungeons, tuned for at most 5 players**. **World bosses stay** | 00, 03, 04, 07, 08, 09, 11, 12, 13, 14, 15, 16, 18, classes |
| **W7** | Keep **Tank / Healer / Damage / Support**, threat, taunts. **Hybrids everywhere**, including unexpected crossbreeds (mage tanking with wards and decoys, pyromancer healing, enchanter tanking with illusions). Hybrids are effective in the open world and Normal dungeons, may be weaker in Challenge mode (§6) | 05, 06, classes |
| **W8** | **Tab targeting, closer to the classic MMO model.** One **hard target** at a time, shown in the target frame, which **only changes when the player changes it** (Tab, click, a target key, or the target dying) — never because another enemy got closer or was hit last (Farhold's frame showing the wrong enemy is the bug to avoid). Every spell is one of: **Needs target** (heals, buffs and single-target finishers — won't cast without a valid target), **Auto-target** (if you have no valid target it picks **the valid target closest to where you are aiming** within range and casts on it; it may set that as your target, setting), **Ground**, **Self**. **You can target yourself** (`F1`, or click your own frame) and party members (`F2`–`F5`, or their frames) to cast heals and buffs. Global cooldown stays **1.0 s** | 02, 03, 04, 05, 06, classes |
| **W9** | "Earn every verb" was a slogan meaning *features unlock as you level* — rewritten in plain words (§2). **Attunement is shelved** with raids; **dungeons are open**. A dungeon shows in the **Dungeon Finder only once the character has discovered its entrance**. That gives casters a job: **portals, mass teleport, assisted teleport** (pull a party member to you) and **scrolls** carry people to entrances and waystones so they discover them (§6, page 20). Our own names and rules, not copies | 03, 07, 12, 14, 15, 20, classes |
| **W10** | **Second Loadout** (two saved builds) at 30 | 03, 07 |
| **W11** | **No rested XP** | 07 |
| **W12** | **Fewer factions with further reach** — seven player factions, each present from the starting regions to level 60, each with rewards that stay useful at 60 (§12.2) | 01, 07, 08, 14 |
| **W13** | **No Renown, no Legacy.** Post-60 progression is Depth, Challenge mode, sockets, professions, reputation and collections | 03, 07, 18 |
| **W14** | Keep **mail**, **guild bank** and the **Trading Post** (the player market) | 03, 08, 15 |
| **W15** | No flight paths, no "skyways". **Travel Methods** replace them: wagons, horse and creature trails, giant striders, and flyers where needed — much faster than walking, following **known routes on realistic paths**, **protecting riders** from weather and enemies, and **snapping back onto the route** if something goes wrong (a cart that falls off a bridge reappears on its path). Some leave like a bus (wait up to a set time for more riders); some are **scheduled** (trains, boats, barges) — you wait for it to arrive and a group boards together. Page 20 owns them. The personal flying mount stays at 60 behind a Kingsfire story chain | 01, 03, 07, 08, 14, 15, 16, 17, 20 |
| **W16** | **Keep the damage meter** (reuse `meters/`, as in Emberveil 2), boss ability timers, ready check, pull timer and world markers. **Raid frames → wishlist** (party frames for 5 stay) | 03, 04, 11 |
| **W17** | **No "Veil-touched" tier, no item tracks.** Item level is simply **1–60, the level needed**. More item effects may come later. Keep the 2-legendary cap | 08, 09, 12 |
| **W18** | **Personal loot only.** Loot is **not bound**: every item can be traded, mailed and sold. Only quest items cannot. The word "soulbound" is not used (quest items say "Quest item") | 03, 08, 15 |
| **W19** | **One coin: gold** | 03, 08, 15 |
| **W20** | **No daily or weekly quests.** World bosses stay | 07, 13, 14 |
| **W21** | **No limit on in-combat revives** | 05, classes |
| **W22** | Reputation tiers use page 07's own names everywhere (Hunted, Disliked, Known, Welcome, Trusted, Kindred, Sworn) | 07, 08 |
| **W23** | World marker icons: **Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye** | 02, 03 |
| **W24** | The home stone is the **Recall Stone** (`it_recall_stone`): bind it at any waystone or landmark **in a town or other populated, safe place** (never a dungeon or a wild landmark); use it to return there. `lm_hearthstone` → **the First Waystone** (`lm_first_waystone`) | 01, 02, 03, 07, 14, 20 |
| **W25** | **One player faction.** No split sides; players differ by race and starting town only. The orc warband is **the Ashtusk Warhost** | 01, 10, 12, 14, 15 |
| **W26** | **No dungeon currencies** (and none for raids or PvP). Delver's Marks, Oathstones, Veil Sigils, Glory, Laurels → wishlist | 00, 03, 08, 12, 13 |
| **W27** | **Demon Hunter** kept as a name, rebuilt: a hunter who uses magic to **find and kill demons**, fights with **rogue-style weapons** (daggers, hand crossbows) and **traps**. **No gauge, no demon form.** Momentum | demon_hunter, 06 |
| **W28** | Resources are **Mana, Momentum, Tempo**. Every resource × build (melee / ranged / caster) has a class; the **Pyromancer is the Momentum caster** (§6). "Fury", "Focus" and "Rage-style" are never used | 00, 05, 06, classes |
| **W29** | **Rogue: a new system, not renamed spells** — Blind Spots and Wounds (§6), working with melee **and** ranged weapons. No combo points, no stealth | rogue |
| **W30** | **Druid: the form transforms the spells.** The druid has one bar of six spells; Bear, Wolf or Heron form turns each into a different spell (four versions of each: normal, Bear, Wolf, Heron). No spell names borrowed from any other game | druid, 06 |
| **W31** | **Shaman: no totems at all.** A caster of **storm + folklore + animals** (Storm Tales, §6). Healer / Damage | shaman |
| **W32** | **Warlock: no pet.** Tithes (paid in health) and Blight; **Bind Demon** binds a beaten demon to serve (revived by an out-of-combat ritual). Similar binds elsewhere: Ranger **Tame Beast** (permanent, revivable); Necromancer **Control Undead** (temporary; cast on a corpse that is **not** undead, or on a living enemy tagged Undead) | warlock, ranger, necromancer, 06 |
| **W33** | Monk's Chi → **Breath** | monk |
| **W34** | Mage: Arcane Charge → **Resonance**, Surge → **Overflow**, Blink → **Skip**, Counterspell → **Unweave**; **Fireball stays** | mage |
| **W35** | **No mass resurrection** (wishlist). Paladin's Lay on Hands → **Wave of Mending** (the owner suggested "Healing Wave", which is itself a WoW shaman spell, so we use this instead); Consecration → **Hallowed Ground** | cleric, paladin |
| **W36** | Rename Last Stand, Mirror Image, Leap of Faith, Hellfire, Starfall. Plain English (Execute, Whirlwind, Shield Bash, Hex, Fear, Charge) stays | classes |
| **W37** | Pets stay, under the new bind/tame/control rules (§6) | classes |
| **W38** | Cap 60, 5-player dungeons stay | — |
| **W39b** | Chat channels added for the two open-group places: **Muster** (inside a world-boss area) and **Carriage** (riders of one Travel Method vehicle) — page 15 | 15, 02 |
| **W39** | **An online action RPG with an MMO-style world and a tight small-group focus.** Everything is designed for 5 players except world bosses, towns/hubs and trading | all |
| **W40** | One rename pass across every page, then a check that no banned name remains (§12.5). The list goes into the playground's IP rule too | all |

### 12.2 The seven player factions (W12)

Fewer, wider factions. Each has **chapters** — local groups with their own towns, faces and quests — so a
faction met at level 5 is still there at 55, and its quartermaster sells gear **at your level up to 60**,
jewels, gadget recipes and a mount. The old regional factions became chapters. Page 01 owns the details;
page 07 owns the tiers.

| id | Faction | What they want | Chapters (old factions folded in) | Where (low → high) | Rival |
|---|---|---|---|---|---|
| `fac_wardens` | **The Wardens** | roads safe, borders held | Vale watch (old Vale Wardens), Rime watch (Frost Wardens), the Waystone keepers | Hearthvale → Frostmantle → Spire Isle | — |
| `fac_crown_assembly` | **The Crown Assembly** | the realm kept together | Highcourt, the fort garrisons (Fort Ashfall, Last Light) | Highcourt → Cinder Steppe → Kingsfire | the Greenhand (forts cut the forests) |
| `fac_deepforge_clans` | **The Deepforge Clans** | the deep roads back, steel not sold north | Anvilgate, Hollowpeak, the Stone Count (tolls) | Greyridge → Frostmantle → Kingsfire forges | the Cutwater (tolls) |
| `fac_greenhand` | **The Greenhand** | everyone fed, the wild kept whole | farmers and herders, the Fenfolk, the Moonwell Circle | Hearthvale → Mossfen → Whisperwood → Cinder Steppe herds | the Crown Assembly |
| `fac_lantern_house` | **The Lantern House** | every old thing catalogued, the Tear measured | scholars, the Longsight (mapmakers), the Riftwatch | Highcourt → Sunscar → Riftmarch → Spire Isle | the Quiet Wake (they open what the Wake seals) |
| `fac_cutwater` | **The Cutwater** | free rivers and seas, no tolls | river boatmen, the Saltbound (coast), the barge lines | Mossfen → Highcourt wharf → Drowned Coast | the Deepforge Clans |
| `fac_quiet_wake` | **The Quiet Wake** | the dead kept down, the tombs kept shut | graveyard keepers, the Sandsworn (tomb guardians) | every graveyard → Sunscar → Drowned Coast → Kingsfire | the Lantern House |

**Enemy factions** (standing only goes down): the warbands — Sootwick Gang, Unburied Legion, Thornmane
Packs, **Ashtusk Warhost**, Stonehide Clans, **Kingsfire Legion** (`fac_kingsfire_legion`, was Ember Legion)
— plus the Drowned, the Threadcutters and the Riftborn. The Deepworn stay neutral.

### 12.3 New systems (the owner's new feedback)

| System | Ruling | Owner page |
|---|---|---|
| **Sockets: four kinds** | An item can have sockets of four kinds. **Gem**: a gem's effect **depends on what it is socketed into** — armour gets the defensive/attribute values (the current gem table), **weapons** get damage or spell-damage effects, **jewellery** gets secondary effects and magic find. **Jewel**: rolls **its own affixes and rarity** (Uncommon / Rare / Unique jewels); among the strongest things you can add to gear, and finding the right one is the chase. **Soul**: rare and powerful — from certain bosses, quests, or great luck — each adds **a new behaviour** (a new effect happens, one of your skills changes, or a chance to apply an effect), in the spirit of a legendary power; a soul may require an item type (weapon, a given armour slot, jewellery) or a class / build. **Gadget**: made by Engineers; a configurable baseline (you choose its stats from a menu) sitting between a gem and a jewel. Which items get which sockets and how many: page 08 | 08, 09, 19 |
| **Tags** | Every skill, basic attack, item and affix carries **tags** (like *Ice, Area, Ranged, Spell*). Bonuses target tags: "+10% Ice damage" applies to anything tagged Ice; a unique staff's "+20% damage with Area Spells" needs **both** Area and Spell. Quivers, foci/relics and some special weapons give tag bonuses. Page 05 owns the tag list and the rule; every class file tags every spell | 05, 06, 08, classes |
| **Magic find** | Seven stats: **gold find**, **item quantity**, **item rarity**, **XP gain**, **reputation gain**, **+profession skill level** (a flat +N to your effective profession skill), **profession XP gain**. Drop tables read quantity and rarity; every source page cites page 08's rule | 07, 08, 12, 19 |
| **Harvesting** | Anyone can mine, skin, gather herbs, cut timber, fish… **with the right tool in the tool slot**. One shared **Harvesting** skill (1–300) covers all of them | 19, 08 |
| **Crafting professions** | Each character picks **one**: Blacksmithing, Leatherworking, Tailoring, Jewelcrafting, Enchanting, Engineering, Alchemy. Each has its own skill level (1–300). Common genre professions are fine to use; names and recipes are ours | 19 |
| **Mounts** | More land-mount species: dinosaurs (raptor-like runners, a crested plains-strider), giant frogs (**aquatic hybrids** — they swim), great elk, boars, lizards, beetles, and others. Page 08 owns the catalogue | 08, 17 |
| **Light** | **Always daylight.** The light slot, torches as gear and the `L` key are gone. Dark places are film-set dark: dark-looking, fully readable; caves lit by fungi, lava and glowing plants | 01, 02, 03, 04, 05, 08, 10, 17 |
| **Quivers** | **Damage stat-sticks for bows and crossbows** (the off hand), on par with Farhold's off-hand foci/relics. Some roll an effect on **basic attacks only** (and skills tagged Basic Attack): fire arrows, exploding arrows, multi-shot… | 08, 05 |
| **Item card** | The tooltip has a **3D portrait** of the item at the top. The card's frame gets fancier with rarity: Common plain, then Uncommon, Rare, Epic, Unique and Legendary, each more decorated than the last ("Uncommon" is the blue tier the owner calls magic items) | 03, 08, 17 |
| **Special rarities** | Five special rarities that sit on top of an item's normal rarity, each **enhancing the item in its own way** and giving the card its own look and the item's name a **bespoke icon** (an original SVG, never an emoji) in chat and text: **Electrified** (bolt icon; lightning procs and a crackling card), **Starwoven** (star icon; one extra affix beyond the normal maximum from a special pool; a holographic, deep-space card), **Twinned** (two linked rings; every affix rolled twice and the better kept; a mirrored shimmer), **Ancient** (a carved rune; every value rolls 10–20% above its normal maximum; a stone-and-gold frame), **Living** (a sprout; the item grows stronger as it gets kills, up to a limit; vines creep over the card). Page 08 owns the numbers, page 17 the art | 03, 08, 17 |
| **Monster rarities** | **Champion packs**: a whole group with **blue names** sharing **one extra affix**. **Rares**: yellow name, 2–3 affixes, a pack of minions. **Greater rarities** on top: **Giant, Flaming, Electrified, Frozen**… — big difficulty spikes, usually on **one** especially strong monster (rarely a whole group). Greater rarities combine across groups (a **Giant Flaming** ogre) but not within one (never Flaming + Electrified — one element at a time). In the **open world** rarities are rolled at random and are common; in **dungeons** they are placed on purpose (you know a rare pack will be in that room, not which one). Greater-rarity monsters drop the matching special rarity more often (an Electrified monster → Electrified items). Page 10 owns the lists | 10, 12, 08 |
| **Farhold bugs** | The three affix bugs in 08 §24 are fixed in Farhold by a separate round (see Farhold `RPG.md`) | 08 |

### 12.4 Renames

| Old | New | Why |
|---|---|---|
| the Veil (the woven light over the tear) | **the Mend** | "veil"/"ember" word salad (W17/W23) |
| Veil pressure, Veil-light, Veilstorm, Veilwood | **Tear pressure**, **the tear-light**, **Tearstorm**, **Shiftwood** | same |
| Veil Sea | **the Pale Sea** | same |
| Veilspire Isle (`veilspire`) | **Spire Isle** (`spire_isle`) | same |
| Emberthrone (`emberthrone`) | **Kingsfire** (`kingsfire`) | same |
| the Ember King (`b_ember_king_kaedros`) | **the Fire King** (`b_fire_king_kaedros`) | same |
| Ember Warden | **Flame Warden** | same |
| Ember Legion (`fac_ember_legion`) | **Kingsfire Legion** (`fac_kingsfire_legion`) | same |
| r04 Ember Court / r05 Veilspire | **d15 The Fire Court** / **d16 The Spire** (5-player) | W6 |
| any other item, spell, place or monster with "ember" or "veil" in its name | a new plain name (the page's writer picks it; list it in the page's changes) | W17/W23 |
| Unveiled (shadow dancer status) | **Revealed** | same |
| Ashtusk Horde | **Ashtusk Warhost** | W25 |
| the Hearthstone (`lm_hearthstone`) | **the First Waystone** (`lm_first_waystone`) | W24 |
| homeward stone | **Recall Stone** (`it_recall_stone`) | W24 |
| Heroic / Mythic / Mythic+ | **Challenge** / (none) / **Depth** | W3/W4 |
| Fury / Focus | **Momentum** / **Tempo** | W28 |
| flight paths / skyways / roosts | **Travel Methods** / stations | W15 |
| dual spec | **Second Loadout** | W10 |
| Delve, Delver's Marks | (removed) | W26 |

### 12.5 Banned names

These must not appear in player-facing text or data (they are WoW's or another Blizzard game's own terms, or
the owner vetoed them). A page may mention one only inside a *(reference)* note.

Heroic (as a difficulty), Mythic, Mythic+, keystone, War Mode, Horde, Alliance, Hearthstone, Delve, Delver,
Renown, Rested, Honored, Revered, Exalted, Fury (resource), Focus (resource), Rage, combo points, Stealth
(as the rogue ability), Garrote, Cheap Shot, Ambush (as a rogue ability), Prowl, Maul, Rake, Swipe, Barkskin, Totemic Recall,
soul shards, Corruption (the warlock spell), Arcane Charge, Blink, Counterspell, Lay on Hands, Consecration,
Mass Resurrection, Healing Wave, Last Stand, Mirror Image, Leap of Faith, Hellfire, Starfall, soulbound,
flight path, skyway, attunement, Chi, and the words **ember** and **veil** in any new name.
