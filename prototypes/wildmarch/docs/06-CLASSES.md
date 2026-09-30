# WILDMARCH — Design Bible, page 06: the class system

**Status:** v0.1 draft — 2026-09-29. **Owns:** how classes work in general — roles, resources, the spell
ladder, the global cooldown, cast types and shapes, the spell power budget, forms and stances, pets and
companions, the class mechanic gauge, calling quests, per-spell talents, class sets, proficiencies, and
group composition. **Every individual spell, mechanic, talent and set is owned by its class file**
(`classes/<id>.md`), which follows the template in [page 00 §5](00-OVERVIEW.md#5-the-spell-ladder-and-the-class-template).
**Reads from:** [page 05](05-COMBAT.md) (damage formula, statuses, threat), [page 07](07-PROGRESSION.md)
(levels, attributes, unlocks, retraining), [page 08](08-ITEMS.md) and [page 09](09-SETS-LEGENDARIES.md) (items, sets).

Farhold paths are relative to `prototypes/farhold/`. `(reuse: path)` = exists in Farhold and is kept;
`(new)` = Wildmarch only.

---

## Contents

1. [What a class is](#1-what-a-class-is)
2. [The thirty classes](#2-the-thirty-classes)
3. [Roles and the group](#3-roles-and-the-group)
4. [Resources](#4-resources)
5. [The spell ladder](#5-the-spell-ladder)
6. [The global cooldown](#6-the-global-cooldown)
7. [Cast types and shapes](#7-cast-types-and-shapes)
8. [The spell power budget](#8-the-spell-power-budget)
9. [Forms, stances and alternate bars](#9-forms-stances-and-alternate-bars)
10. [Pets and class companions](#10-pets-and-class-companions)
11. [The class mechanic gauge](#11-the-class-mechanic-gauge)
12. [Calling quests](#12-calling-quests)
13. [Talents](#13-talents)
14. [Class sets](#14-class-sets)
15. [Class legendaries and uniques](#15-class-legendaries-and-uniques)
16. [Armour and weapon proficiency](#16-armour-and-weapon-proficiency)
17. [Voices and barks](#17-voices-and-barks)
18. [Choosing a class](#18-choosing-a-class)
19. [Data shapes](#19-data-shapes)
20. [What is reused from Farhold](#20-what-is-reused-from-farhold)
21. [Open questions](#21-open-questions)

---

## 1. What a class is

A class is a **fixed kit** — there is no custom class in Wildmarch (canon; Farhold's R17 custom class is
parked in `QUESTIONS.md`). Every class has exactly these parts:

| Part | What it is | Where it is defined |
|---|---|---|
| Identity | fantasy, voice, look, starting gear | class file §1 |
| **Role** and **Can also** | the group roles it may queue as ([§3](#3-roles-and-the-group)) | page 00 §6 (canon) |
| Armour tier | cloth, light, medium or heavy ([§16](#16-armour-and-weapon-proficiency)) | page 00 §6 |
| Weapon families | which weapons it is trained in ([§16](#16-armour-and-weapon-proficiency)) | this page §2 |
| **Resource** | Mana, Fury or Focus ([§4](#4-resources)) | page 00 §6 |
| **Class mechanic** | the signature system and its gauge ([§11](#11-the-class-mechanic-gauge)) | class file §2 |
| **Six spells** | one per slot on the ladder 1 / 4 / 10 / 18 / 28 / 40 ([§5](#5-the-spell-ladder)) | class file §3 |
| Alternate spells | forms, stances, stacks or pets that swap the bar ([§9](#9-forms-stances-and-alternate-bars)) | class file §4 |
| **Talents** | 4 tiers × 6 spells, 2–3 choices each ([§13](#13-talents)) | class file §5 |
| **Class sets** | at least 2, bonuses at 2/4/6 pieces ([§14](#14-class-sets)) | class file §6, indexed on page 09 |
| Legendaries and uniques | items only this class wants ([§15](#15-class-legendaries-and-uniques)) | class file §7 |
| Primary and secondary attribute | what levelling raises most ([page 07](07-PROGRESSION.md#attributes)) | this page §2 |
| Calling quests | levels 6, 20, 40 ([§12](#12-calling-quests)) | page 14 (content), class file §2 (what each grants) |

**Shared by every class, and not spells** (canon): basic weapon attacks (the weapon patterns, [page 05 §4](05-COMBAT.md#4-basic-attacks-the-weapon-patterns)),
the dodge roll, sprint, block/parry, potions and consumables on the belt, mount skills. This page proposes
two more shared verbs — **Challenge** (taunt, tank-capable classes only) and **Tend the Fallen**
(out-of-combat revive) — see the canon change requests in the report and [§3.5](#35-shared-verbs-proposed).

---

## 2. The thirty classes

Canon columns (role, can also, armour, resource, mechanic) are copied from [page 00 §6](00-OVERVIEW.md#6-the-thirty-classes).
**Primary / secondary attribute, weapons, starting weapon and the Farhold companion are this page's**
(weapons and starter from `data/classes.json`, companions from `js/pets.js CLASS_PETS` — reuse).

| # | Class | Role | Can also | Armour | Resource | Signature mechanic | Primary / secondary | Weapon families | Starts with | Farhold companion (visual reuse) |
|---:|---|---|---|---|---|---|---|---|---|---|
| 1 | [Warrior](classes/warrior.md) | Tank | Damage | heavy | Fury | Bulwark | STR / CON | sword, hammer, greatsword, greataxe, shield | longsword + shield | — |
| 2 | [Fighter](classes/fighter.md) | Damage | Tank | heavy | Fury | Stances | STR / DEX | sword, hammer, greatsword, shield | two-handed sword | — |
| 3 | [Paladin](classes/paladin.md) | Tank | Healer | medium | Mana | Oaths | STR / INT | sword, sceptre, mace, shield | sword + shield | — |
| 4 | [Ranger](classes/ranger.md) | Damage | — | light | Focus | Hunting cat + marks | DEX / CON | bow (all three), crossbow, javelin, quiver | shortbow | hunting cat |
| 5 | [Rogue](classes/rogue.md) | Damage | — | light | Focus | Combo points + stealth | DEX / STR | dagger (dual), sword | two daggers | — |
| 6 | [Cleric](classes/cleric.md) | Healer | — | light | Mana | Devotion | INT / CON | staff, sceptre, wand, shield, focus | sceptre + shield | — |
| 7 | [Bard](classes/bard.md) | Support | Healer | light | Mana | Songs | INT / DEX | dagger, wand, quarterstaff, focus | quarterstaff | — |
| 8 | [Mage](classes/mage.md) | Damage | — | cloth | Mana | Arcane Charge | INT / DEX | staff, wand, focus | staff | — |
| 9 | [Necromancer](classes/necromancer.md) | Damage | — | cloth | Mana | Corpses + thralls | INT / CON | staff, wand, sceptre, focus | staff | bone thralls, bone archer |
| 10 | [Warlock](classes/warlock.md) | Damage | — | cloth | Mana | Soul shards + pact | INT / CON | staff, wand, focus | staff | bound imp, ember familiar |
| 11 | [Demon Hunter](classes/demon_hunter.md) | Damage | Tank | light | Fury | Vengeance + Demon Form | DEX / STR | crossbow, dagger (dual), sword | crossbow | dire companion |
| 12 | [Scavenger](classes/scavenger.md) | Damage | — | light | Focus | The Pack (junk) | DEX / CON | dagger, sword, hammer, javelin, quarterstaff | quarterstaff | — |
| 13 | [Swashbuckler](classes/swashbuckler.md) | Damage | — | light | Focus | Flair | DEX / STR | sword, sabre, rapier, dagger | rapier | — |
| 14 | [Dragon Knight](classes/dragon_knight.md) | Damage | Tank | heavy | Fury | Draconic Aspect | STR / CON | greatsword, greataxe, longsword, shield | longsword | — |
| 15 | [Pyromancer](classes/pyromancer.md) | Damage | — | cloth | Mana | Heat | INT / CON | staff, wand, sceptre, focus | staff | ember familiar |
| 16 | [Stormcaller](classes/stormcaller.md) | Damage | — | cloth | Mana | Static | INT / DEX | staff, wand, focus | wand | storm familiar |
| 17 | [Druid](classes/druid.md) | Healer | Tank, Damage | medium | Mana (forms use Fury/Focus) | Shapeshift | INT / STR (forms use DEX/STR) | staff, sceptre, quarterstaff | quarterstaff | grove wolves (Farhold) — Wildmarch druid shapeshifts instead |
| 18 | [Oracle](classes/oracle.md) | Healer | Support | cloth | Mana | Foresight | INT / CON | staff, sceptre, focus | sceptre | ember familiar |
| 19 | [Tactician](classes/tactician.md) | Support | — | medium | Focus | Orders | INT / STR | sword, sceptre, spear, shield | sceptre + shield | — |
| 20 | [Chronomancer](classes/chronomancer.md) | Support | Damage | cloth | Mana | Timeline | INT / DEX | staff, wand, focus | staff | — |
| 21 | [Monk](classes/monk.md) | Damage | Healer | cloth | Focus | Chi | DEX / CON | quarterstaff, fists | quarterstaff | — |
| 22 | [Shaman](classes/shaman.md) | Healer | Damage | medium | Mana | Totems + spirits | INT / CON | staff, sceptre, quarterstaff, shield | quarterstaff | spirit bear |
| 23 | [Witch Hunter](classes/witch_hunter.md) | Damage | — | medium | Focus | Silver + Verdict | DEX / INT | crossbow, shortbow, sword, dagger | shortbow | — |
| 24 | [Knight](classes/knight.md) | Tank | Support | heavy | Fury | Banner + Vow of Protection | STR / CON | sword, hammer, spear, shield | longsword + shield | — |
| 25 | [Sorcerer](classes/sorcerer.md) | Damage | — | cloth | Mana | Wild Magic | INT / DEX | staff, wand, focus | wand | storm familiar |
| 26 | [Runesmith](classes/runesmith.md) | Tank | Damage | heavy | Fury | Runes | STR / CON | hammer, greataxe, mace, shield | hammer + shield | — |
| 27 | [Shadow Dancer](classes/shadow_dancer.md) | Damage | — | light | Focus | Shadows | DEX / INT | dagger (dual), rapier | two daggers | — |
| 28 | [Tinker](classes/tinker.md) | Damage | Support | medium | Focus | Gadgets + sentry | DEX / INT | crossbow, shortbow, dagger, hammer | shortbow | clockwork sentry |
| 29 | [Priest](classes/priest.md) | Healer | Damage | light | Mana | Light/Shadow balance | INT / CON | mace, sceptre, staff, shield, focus | sceptre + shield | spirit bear (Farhold) — class file decides |
| 30 | [Enchanter](classes/enchanter.md) | Support | — | light | Mana | Charm | INT / DEX | staff, wand, focus | staff | bound imp |

Changes from Farhold's `data/classes.json`: the tinker's primary is DEX (Farhold: INT) because every tinker
weapon is DEX-scaled; the monk may fight with fists; foci (Farhold R25 `js/foci.js`) are added to every
INT caster; the rogue, shadow dancer and demon hunter start dual-wielding. The Farhold companion column is
a **visual** reuse list — whether a class has a companion at all is its class file's decision.

**Counts by primary role**: Tank 4 (warrior, paladin, knight, runesmith), Healer 5 (cleric, druid, oracle,
shaman, priest), Damage 17, Support 4 (bard, tactician, chronomancer, enchanter) — 30. Counting **Can also**,
every role has at least seven classes that can queue as it:

| Role | Classes that can queue as it |
|---|---|
| Tank (8) | warrior, paladin, knight, runesmith; fighter, demon hunter, dragon knight, druid (Can also) |
| Healer (8) | cleric, druid, oracle, shaman, priest; paladin, bard, monk (Can also) |
| Damage (23) | the 17 Damage classes; warrior, druid, chronomancer, shaman, runesmith, priest (Can also) |
| Support (7) | bard, tactician, chronomancer, enchanter; oracle, knight, tinker (Can also) |

---

## 3. Roles and the group

### 3.1 The four roles (canon)

| Role | Job in a fight | What the game gives it |
|---|---|---|
| **Tank** | holds the enemies' attention and survives it | the **Guardian** state (×4 threat, [page 05 §13](05-COMBAT.md#13-threat-and-aggro)) from its class mechanic or a stance/form; access to Challenge (proposed); heavy or medium armour |
| **Healer** | keeps the group alive | heals and shields scale with Spell Power ([page 05 §6.1](05-COMBAT.md#61-the-two-power-numbers-farhold-one-wildmarch-two)); dispels; most have a battle revive |
| **Damage** | kills things | the highest damage budget ([§8](#8-the-spell-power-budget)) |
| **Support** | makes everyone else better | buffs, debuffs, control, cooldown and resource tricks; about **80%** of a Damage class's personal damage, plus group effects worth more than the missing 20% in a full group. **Counts as a Damage slot** in the group finder (canon) |

### 3.2 Role focus `(new)`

A class with a **Can also** column chooses its **role focus** on the Spells tab (`scr_character`, Spells tab —
page 03), from a dropdown listing only its allowed roles. Changing it is free, takes a **5 s cast**, and only
works out of combat. What it changes:

| Role focus | Passive it turns on (every class) | Also |
|---|---|---|
| Tank | **Stalwart**: +10% max HP, +10% armour; the class's Guardian state becomes available | group finder role |
| Healer | **Mender**: +10% healing done, −10% mana cost of heals | group finder role |
| Damage | **Striker**: +5% damage | group finder role |
| Support | **Herald**: +10% to the strength of buffs and debuffs you apply | group finder role |

A class file may give a role focus more (e.g. the paladin's healer focus swaps an Oath). The role passives
are the **only** thing role focus does unless a class file says otherwise. **Dual spec** (level 30,
[page 07](07-PROGRESSION.md#unlock-dual-spec)) saves the role focus with each spec.

### 3.3 Group composition

| Group | Recommended | Hard rule in the group finder |
|---|---|---|
| Party (open world, 5) | anything | none |
| 5-player dungeon, Normal | 1 tank, 1 healer, 3 damage/support | the finder builds exactly 1 / 1 / 3. A player-made party may enter with any mix; **followers fill empty slots** (canon pillar 6) and can take the tank or healer role ([§10.5](#105-followers-in-the-group)) |
| 5-player dungeon, Heroic / Mythic+ | 1 / 1 / 3, of which **at least one Support** recommended for Mythic+ | finder 1 / 1 / 3; followers **not** allowed in Heroic or Mythic+ |
| Raid, 10 (Normal) | 2 tanks, 2–3 healers, 5–6 damage/support | finder 2 / 2–3 / 5–6 |
| Raid, 20 (Mythic) | 2–3 tanks, 4–5 healers, 12–14 damage/support | player-made groups only (page 15) |
| World boss | any | none |

### 3.4 Utility a group needs — targets for the class files

A healthy dungeon group should find each of these in its five slots **most of the time**. The class files own
which spell does what; this table is the **coverage target** each class file is written against. If the
finished class files leave a column covered by fewer than the number shown, a class file changes, not this table.

| Utility | What it is ([page 05](05-COMBAT.md)) | Classes that should bring it (minimum count across the 30) |
|---|---|---|
| Interrupt | a spell tagged `interrupt` | ≥ 18 classes — every melee and most ranged damage classes |
| Magic dispel (ally) | removes a Magic debuff | every healer (≥ 6) + 2 supports |
| Curse / Poison / Bleed dispel | one of the three each | ≥ 4 classes each |
| Purge (enemy buff) | removes a Magic buff from an enemy | ≥ 5 classes (witch hunter must have one) |
| Enrage dispel | removes Enrage from an enemy | ≥ 3 classes |
| Battle revive | in-combat revive ([page 05 §16.4](05-COMBAT.md#164-being-revived)) | ≥ 6 classes (every primary healer, + 1–2 others) |
| Group damage buff | e.g. +5% damage for the group | ≥ 8 classes; **the same buff from two sources does not stack** |
| Group defensive cooldown | e.g. −20% damage taken for 8 s | ≥ 8 classes |
| Group movement speed | e.g. +30% for 6 s | ≥ 5 classes |
| Hard CC for trash | sleep / fear / stun / charm / root | ≥ 15 classes |
| Taunt | the tank-capable classes | all 8 (via Challenge if their kit has none) |

**Group buffs do not stack with themselves.** Each group buff belongs to a **buff family** (e.g.
`family: "group_damage"`); only the strongest from each family applies to a player. A class file names the
family of every group buff it gives. **Caps (page 05 §10.7):** different group buffs stack with each other
up to **+30% damage** in total, and all haste together is capped at **+30%**.

### 3.5 Shared verbs (proposed)

| Verb | Who | Unlock | What it does |
|---|---|---|---|
| **Challenge** | the eight tank-capable classes | level 10, quest `q_hc_hold_the_line` ([page 07](07-PROGRESSION.md#unlock-challenge)) | taunt one enemy within 20 m: your threat becomes 110% of its top, it is Taunted 3 s; 8 s cooldown; off the global cooldown. A class whose own kit has a taunt may use both. |
| **Tend the Fallen** | everyone | level 1 | out of combat, hold Interact on a dead ally's body for 8 s: they rise at 35% HP/mana ([page 05 §16.4](05-COMBAT.md#164-being-revived)) |

---

## 4. Resources

Every class spends **one** of three resources on its spells (canon), plus its own class gauge
([§11](#11-the-class-mechanic-gauge)). Farhold had only mana (`derived.maxMp`, `skills.json mp`); Fury and Focus are `(new)`.

### 4.1 Mana

| Property | Value | Farhold |
|---|---|---|
| Pool | **1,000** + 2 per INT + gear "+mana" affixes | `24 + 4/level + 2/INT` |
| Why a fixed 1,000 | spell costs are written as flat numbers (e.g. "cost 120") and **do not change with level**; the pool grows only through INT and gear, so a caster's staying power grows as they do | — |
| In-combat regen | 1% of max a second + `mpRegen` (gear, perks) | `mpRegen 1` flat |
| Out of combat | 4% a second; drinking 6% | — |
| Typical costs | filler 40–80 · big nuke 150–250 · heal 60–200 · 60 s cooldown 0–100 | 6–20 |
| Running dry | a healer at full rotation should run out in ~90 s of a boss fight without its class mechanic's mana tools, and last the fight with them | — |
| Classes | paladin, cleric, bard, mage, necromancer, warlock, pyromancer, stormcaller, druid (caster form), oracle, chronomancer, shaman, sorcerer, priest, enchanter | |

### 4.2 Fury

| Property | Value |
|---|---|
| Pool | 0–100, starts at **0** |
| Gains | basic attack hits: +4 main hand, +2 off hand, +8 on a pattern finisher (arc, slam, lunge, a final overhead); damage taken: +1 per 1% of your max HP; spells that say "generates N Fury" |
| Decay | none in combat; out of combat **−5 a second** after 5 s |
| Spends | spells cost 10–60 Fury; "builder" spells cost 0 and generate |
| Rage-style cap tricks | none — a Fury bar that is full wastes gains; class mechanics may bank overflow |
| Classes | warrior, fighter, demon hunter, dragon knight, knight, runesmith, druid (Bear form) |

### 4.3 Focus

| Property | Value |
|---|---|
| Pool | 0–100, starts **full** |
| Regen | **10 a second** always (in or out of combat), × (1 + haste%) |
| Spends | spells cost 15–60 Focus |
| Classes | ranger, rogue, scavenger, swashbuckler, tactician, monk, witch hunter, shadow dancer, tinker, druid (Cat form) |

### 4.4 Showing it

The resource bar sits under the health bar on the player frame (page 03): mana blue `#4a8cff`, Fury red
`#d9463b`, Focus yellow `#f2c94c`. A spell you cannot afford greys out with the reason on hover
("Not enough Fury: 40 needed, 25 held.").

---

## 5. The spell ladder

### 5.1 Slots (canon)

| Slot | Key | Opens at level | Typical job (guideline, class files decide) |
|---:|---|---:|---|
| 1 | 1 | **1** | the class's bread and butter: a builder, a filler or its core heal |
| 2 | 2 | **4** | the second verb: an area spell, a defensive, or a spender |
| 3 | 3 | **10** | the tool: control, a gap closer, a utility (interrupt, dispel) |
| 4 | 4 | **18** | the class's identity spell, usually tied to the mechanic |
| 5 | 5 | **28** | a group spell: a cooldown the group feels (heal, defensive, buff) |
| 6 | 6 | **40** | the capstone: the biggest spell the class has |

Farhold's ladder was 1/3/6/12/18/24 (`data/skills.json unlockAt`, CLASSES.md R20). Wildmarch stretches it to
the 60-level game.

### 5.2 How a spell arrives

`(new — Farhold filled the bar from the class list at creation)`


- At the slot's level the spell is **learned automatically**: an **unlock card** ([page 07 §Unlock cards](07-PROGRESSION.md#unlock-cards))
  names it, shows its numbers and plays a short demonstration clip on a training dummy; the slot on the bar
  lights up. Nobody has to visit a trainer to be allowed to press a button.
- A locked slot shows a padlock and "Slot 4 opens at level 18" (Farhold R20 wording).
- **Preset spells cannot be unlearned** (Farhold R20: "a preset class's six are what the class IS").
  Talents and perks can be retrained ([page 07 §Retraining](07-PROGRESSION.md#retraining)).

### 5.3 The bar

- Keys **1–6** fire slots 1–6 (page 02 owns rebinding). **Q** is the class key (the mechanic's main action),
  **G** the second class key, **Shift+1–4** switch form / stance / borrowed bar (max 4 per class), **F** is the
  dodge roll, **H** the mount, **R** Quick Heal, **7 8 9 0** the four belt slots (canon 00 §10, page 02's table).
  Challenge has no fixed key in page 02's table yet — see page 02.
- Each slot shows: icon, cooldown sweep, charges (if any), cost, key, and a coloured border for its cast type
  (instant white, cast time blue, channel purple, charge orange, toggle green).
- **Hover** shows the spell card: name, `id` (in debug only), slot level, cost, cooldown, cast type, range,
  shape, and the generated description (Farhold R21 rule: descriptions are **generated from the spell's own
  numbers**, `js/skills.js describeSkill` — reuse the generator, never hand-write a spell sentence).
- A form or stance **swaps the bar** ([§9](#9-forms-stances-and-alternate-bars)).

---

## 6. The global cooldown

`(new — Farhold has per-skill cooldowns only)`

| Rule | Value |
|---|---|
| Global cooldown (GCD) | **1.0 s** after any spell that is on it |
| Haste | GCD = max(0.75 s, 1.0 s ÷ (1 + haste%)) |
| Spell queue | a spell pressed in the last **0.4 s** of the GCD or a cast fires the moment it ends |
| Off the GCD | spells marked `offGcd` on the class page: defensives, interrupts, taunts, the class mechanic's "spend" action where the class file says so. At most **one** off-GCD spell every 0.5 s |
| Basic attacks | never on the GCD. An **instant** spell does not stop the weapon pattern's clock (it plays as an upper-body cast); a **cast-time or channelled** spell stops basic attacks until it ends, and the pattern resumes where it left off if you swing again within 1.5 s |
| Forms/stances | swapping triggers a 0.5 s GCD of its own |
| Cooldown reduction | `cooldownReduction` (gear/perks) shortens spell cooldowns, cap 50% (Farhold AFFIX_CAP); it never touches the GCD. Minimum cooldown 0.5 s (Farhold `cooldownFor`) |

---

## 7. Cast types and shapes

### 7.1 Cast types

| Cast type | How it works | Can move? | Interrupted by |
|---|---|---|---|
| **Instant** | fires on press | yes | — |
| **Cast time** | 0.5–3.0 s cast bar, fires at the end; pushback 0.25 s per hit taken, max 2 | no — moving, rolling or jumping cancels (nothing spent) unless the spell or a talent says "castable while moving" | Silence, stun, interrupt spells |
| **Channel** | fires ticks over its duration while you hold still; pressing any other spell or moving ends it early (ticks already paid stay paid) | no, unless stated | as cast time; no pushback |
| **Charge** | hold the key: power builds from a minimum to full to a maximum, like a staff ([page 05 §4.6](05-COMBAT.md#4-basic-attacks-the-weapon-patterns)); release to fire; at maximum it fires itself | at 60% speed | a hit worth 25%+ of max HP breaks the charge |
| **Toggle / stance** | on or off, stays until changed; may reserve part of the resource pool | yes | — |
| **Combo** | pressing the same slot again within a window (default 2 s) fires the next part (e.g. a three-part strike); the slot's icon changes to show the next part | yes | a dodge roll resets it |
| **Reactive** | usable only for 4 s after an event (parry, dodge through a hit, kill, crit); the slot glows | yes | — |
| **Ground** | a reticle follows the crosshair; click to place ([page 05 §2.2](05-COMBAT.md#22-soft-lock-aim-assist-new)) | as its cast | as its cast |
| **Passive** | never pressed; the class mechanic and some talents | — | — |

**Charges**: a spell may hold 2 or 3 charges; each recharges on the spell's cooldown, one at a time.

### 7.2 Shapes (canon list, defined)

Measurements are always given on the class page; these are what the words mean.

| Shape | Meaning | Numbers the class page gives |
|---|---|---|
| **target** | one enemy (hard-locked, or under the crosshair) | range |
| **cone** | from you, along your facing | length (m) and **full** angle (°) |
| **line** | a rectangle from you along your facing (a beam, a charge, a pierce) | length, width |
| **circle** | everything within R of **you** | radius |
| **ring** | a donut around you or a point: between inner and outer radius | inner radius, outer radius |
| **self** | only you | — |
| **ally** | one ally; falls back to you with no ally targeted | range |
| **ground** | a circle at a chosen point | range, radius |
| modifiers | **projectile** (travels at N m/s and can be dodged), **chain** (jumps N times within R), **pierce** (passes through N bodies), **splash** (a projectile's impact radius; the rim takes 50%) | speed, jumps, radius |

**No falloff inside a shape** — what the telegraph shows is what hits, at full value (clearer than Farhold's
0.5/0.6/0.8 rim shares, which the card never printed). The only exception is projectile **splash**.

**Area cap**: an area spell deals full damage to up to **8** targets; with more, each takes `8 ÷ N` of it.
Heals have no cap unless the spell says one.

---

## 8. The spell power budget

This is the **design tool** class writers use to set a spell's numbers. It is Farhold's R25 `effectiveMult`
(`js/skills.js`: `unlockPower × cooldownPower`) grown into a full budget. **It is never applied at run time**:
the number written on the class page is the final coefficient ([page 05 §6.3](05-COMBAT.md#63-one-owner-for-every-multiplier)).

### 8.1 Damage budget

```
coefficient (% WD or % SP, per target) =
    ( 1.00 × cooldownValue  +  1.00 × castSeconds )
  × unlockValue(slot)
  × shapeFactor
  − riders (paid out of the same budget)

cooldownValue = 1 + 0.08 × (cooldown − 4)     for cooldown ≥ 4 s        (Farhold cooldownPower)
              = 0.55 + 0.1125 × cooldown      for cooldown < 4 s        (a spammable spell is 55%)
castSeconds   = cast time or channel length — you give up that long of basic attacks
unlockValue   = 1 + (slotLevel − 1) / 39      slot 1: 1.00 · 4: 1.08 · 10: 1.23 · 18: 1.44 · 28: 1.69 · 40: 2.00
                                                (Farhold: 1.0 at level 1 → 2.0 at 24; stretched to 40)
shapeFactor   = target 1.00 · line 0.75 · cone 0.70 · ring 0.65 · circle 0.60 · ground 0.55 · chain 0.80 on the first target
role          = Damage ×1.00 · Support ×0.80 · Tank ×0.70 · Healer ×0.60 (a healer's damage spells)
```

**Riders** (what a spell also does) are paid out of the coefficient:

| Rider | Cost |
|---|---|
| A DoT worth X% total | 0.8 × X (it arrives later and can be cleansed) |
| Stun / freeze 1 s | 0.25 per second |
| Root 1 s | 0.12 per second |
| Slow 30% for 4 s | 0.10 |
| Knockback 3 m | 0.10 |
| A debuff "+10% damage taken" for 6 s | 0.20 |
| Self-heal worth X% of the damage | 0.5 × X |
| Resource generated | 0.01 per point of Fury / Focus, 0.001 per point of mana |

### 8.2 Healing and shield budget

Same formula in **% SP**, then × **1.5** for heals and × **1.8** for shields (they land before the damage).
A healer's healing is their damage, so its role factor is 1.0 here.

### 8.3 Worked examples

| Spell (illustrative) | Inputs | Coefficient |
|---|---|---|
| Slot 1 instant single-target, 6 s cooldown, Damage class | (1 × 1.16) × 1.00 × 1.00 | **116% WD** |
| Slot 1 cast 2.0 s, no cooldown, Damage class | (0.55 + 2.0) × 1.00 × 1.00 | **255% SP** |
| Slot 2 circle around you, 8 s, Damage class | (1 × 1.32) × 1.08 × 0.60 | **86% WD** per target |
| Slot 4 cone, 12 s, with Burning worth 40% | (1 × 1.64) × 1.44 × 0.70 − 0.8 × 0.40 | **133% WD + Burning 40%** |
| Slot 6 ground, 30 s, Damage class | (1 × 3.08) × 2.00 × 0.55 | **339% SP** per target |
| Slot 1 heal, instant, 0 s cooldown, Healer | (0.55) × 1.00 × 1.00 × 1.5 | **83% SP** heal |
| Slot 5 group heal (circle 20 m), 45 s, Healer | (1 × 4.28) × 1.69 × 0.60 × 1.5 | **651% SP** to each ally |
| Slot 3 shield on an ally, 12 s, Healer | (1 × 1.64) × 1.23 × 1.00 × 1.8 | **363% SP** absorb |

### 8.4 Utility (no damage budget)

| Utility | Cooldown range |
|---|---|
| Interrupt | 12–15 s |
| Taunt | 8 s |
| Dispel (ally) | 8 s (or a 2-charge spell at 10 s) |
| Dash / gap closer | 10–20 s |
| Personal defensive (−30% damage taken, 8 s) | 60–90 s |
| Group defensive (−20% for the group, 8 s) | 120–180 s |
| Battle revive | 10 min (instances: charges, [page 05 §16.4](05-COMBAT.md#164-being-revived)) |

---

## 9. Forms, stances and alternate bars

`(new — Farhold has none)`

| Rule | Value |
|---|---|
| What swaps | a form or stance may replace **any or all** of slots 1–6 with alternate spells. Alternate spells follow every rule on this page, have their own ids (`<class>_<snake>`) and count as that class's spells (not shared with anyone) |
| Slot levels | an alternate spell in slot N unlocks at slot N's level; a form that opens at level 20 fills slots 1–4 at once, and slots 5–6 as the character reaches 28 and 40 |
| Swapping | costs a 0.5 s GCD; allowed in combat; **cooldowns are per spell**, so a form's spell keeps cooling down while you are out of that form |
| Talents | every alternate spell has its own 4 tiers of talents (so a druid has more talent picks than a warrior — the class file lists them) |
| Resource | a form may change the resource (canon: druid forms use Fury or Focus). The caster resource keeps regenerating while you are in a form |
| Stats | a form may change armour, move speed, attack pattern (a bear swipes with a claw pattern: page 05 strike shapes), and the character model (Chibi 2 → creature body, `avatar-3d/js/creatures.js`, reuse) |
| Equipment | worn gear keeps giving its stats in a form; weapon dice still set WD unless the form says "claws" (then the form gives WD from the character level: dice 4–8 × item-level growth at your level) |
| Death | dying ends every form and stance |
| Shown on | the gauge ([§11](#11-the-class-mechanic-gauge)) and the bar border colour |

Canon classes with forms/stances: **druid** (Bear, Cat, Owl, Stag), **fighter** (Offense, Defense, Precision
stances), **demon hunter** (Demon Form), **dragon knight** (aspects; Dragon Form at 40). Others (e.g. the
priest's Light/Shadow balance) may shift spell effects without swapping the bar — the class file says which.

---

## 10. Pets and class companions

### 10.1 The three kinds of follower `(reuse: js/followers.js FOLLOWER_KINDS)`

| Kind | Where it comes from | Takes a follower slot? | Goes away when |
|---|---|---|---|
| **Class companion** | the class mechanic (the ranger's hunting cat, the necromancer's thralls) | **no** (Farhold R18 rule) | it falls — then rises 14 s after combat ([page 05 §16.7](05-COMBAT.md#167-followers-and-pets)) |
| **Summon** | a spell | **no** if the spell is the class's; counted against the spell's own cap | its duration ends or it dies |
| **Mercenary / hired follower** | a broker in town ([page 07](07-PROGRESSION.md#unlock-first-follower-slot)) | **yes** | dismissed, or killed and not revived at a broker |

### 10.2 Pet rules `(reuse: js/pets.js, js/followers.js, balance.pets)`

| Rule | Value | Farhold |
|---|---|---|
| Scaling | a pet's stats follow its **owner's** level with the same curves as enemies (page 05 §19.2) | `perLevel 1.13` against enemy 1.13 (R22) |
| Damage cap | a pet or follower never hits for more than **75%** of the top of its owner's weapon swing | `FOLLOWER_SHARE_CAP 0.75` |
| Leash | returns to you if more than **26 m** away | `pets.leash 26` |
| Follows at | 4.5 m | `pets.follow` |
| Engages | enemies within 22 m of you | `pets.engage` |
| Threat | ×0.5 (a tank pet ×3), [page 05 §13.2](05-COMBAT.md#132-wildmarch-the-threat-table-new) | seconds-based attention |
| Enemies attack pets | yes, by the threat table | R22 `aimOf` |
| Revive | 14 s after combat, 50% HP | `pets.reviveSeconds 14` |
| Healing | pets can be healed and are included in smart heals **after** players | new |
| Commands | **stance** (Aggressive / Defensive / Passive), **attack my target**, **come back**, **stay here** — on the pet bar above the skill bar (page 03), keys on page 02 §5.17: `,` (comma) tap = attack my target, hold = the order ring (Ctrl is never a default) | new |
| Max alive per player | 6 bodies of every kind together (open world); instances: see §10.5 | `pets.maxAlive 6` |

### 10.3 Stances

| Stance | Behaviour |
|---|---|
| Aggressive | attacks anything that attacks you or that you attack, and anything hostile within 12 m |
| Defensive (default) | attacks what attacks you, or what you attack |
| Passive | never attacks; follows you; still takes hits |

### 10.4 What the class file writes about its pets

For each pet: `id`, name, body (Chibi 2 or creature type), health as a % of the owner's max HP, its attack
(pattern, % of owner WD or SP), its own 1–3 abilities with numbers, what the class mechanic does to it, and
how the three calling quests change it.

### 10.5 Followers in the group

- **Every follower and every non-class summon takes one of the group's 5 (or 10/20) body slots** in an
  instance. A class companion that **is** the class mechanic does not (a ranger's cat is part of the ranger).
- Followers may queue in the **tank** or **healer** role for a Normal dungeon when no player fills it
  (Shield Warden mercenary tanks; Field Mender heals — `data/mercenaries.json`, reuse). They play their role
  at the level of a competent but not perfect player: they dodge ground telegraphs **1.0 s** after they appear.
- **Heroic, Mythic+ and raids do not allow followers** (canon pillar 6: they expect people).
- **Pets and summons versus boss mechanics (canon 00 §10, page 11 §12.3):** class pets take no party slot,
  leave a danger zone 0.6 s after it appears and a void zone after 0.5 s in one, never count toward soaks, and
  take 25% damage from room-wide hits. Followers take a party slot and **do** count toward soaks.

---

## 11. The class mechanic gauge

`(new — Farhold's nearest relatives are the charge meter and the staff channel readout)`

### 11.1 Where it sits

Centred **above the skill bar**, 320 × 36 px at 1080p, never covering the bar or the crosshair (page 03 owns
the HUD). It is part of the class's identity, so it is drawn in the class's colour (class file).

### 11.2 Kinds of gauge (a class uses one, or two combined)

| Kind | Looks like | Examples (canon mechanics) |
|---|---|---|
| **Pips** | 3–6 round pips that fill | rogue combo points, warlock soul shards, witch hunter Verdict, monk Chi, swashbuckler Flair |
| **Bar 0–100** | a horizontal bar with thresholds marked | pyromancer Heat (overheat zone), demon hunter Vengeance, oracle Foresight |
| **Slider −100…+100** | a bar with a centre notch | priest Light/Shadow balance |
| **Slots** | 2–4 icons that fill with a type | shaman totems (earth/fire/water/air), runesmith runes, tinker gadgets, sorcerer wild-magic roll |
| **State** | an icon and a name that changes | fighter stances, druid forms, dragon knight aspect, paladin Oath, bard Song + verse count |
| **Counter** | a number with an icon | necromancer corpses nearby, scavenger junk, tactician Orders |
| **Timeline** | a strip of the last 5 s | chronomancer's recorded ghost |

Every gauge has: a **tooltip** stating its rules in numbers (Farhold `WORDING.md`), an **empty state** that
says how to fill it, and a **sound** when it reaches a threshold (sfx id per class file, `sfx/js/sfx.js` reuse).

### 11.3 Before the first calling

Levels 1–5: the gauge is shown **greyed out** with the line "Your calling awaits at level 6." unless the
class file gives a starter version at level 1 (e.g. a rogue may need combo points from the start). The first
calling quest ([§12](#12-calling-quests)) grants the mechanic or its full first form.

### 11.4 Rules for class writers

- The mechanic must change **how you play**, not add a stat.
- It must be **readable by other players**: a visible effect on the character (aura, form, banner, totems) so
  a group can see what a class is doing.
- It must work **solo** (with or without followers) and in a group.
- Its numbers follow the budget in [§8](#8-the-spell-power-budget): a mechanic's payoff is budgeted as part of
  the spells it empowers.

---

## 12. Calling quests

`(new; page 14 owns the quest text and the steps; class files own what each grants)`

| Calling | Level | Quest id (proposed pattern) | Giver | Where the trial is | Grants |
|---|---:|---|---|---|---|
| **I — The Calling** | 6 | `q_calling_<class>_1` | `npc_trainer_<class>` in the **Hall of Callings**, Brightwater | a solo trial instance in Hearthvale | the class mechanic (or its full first form); an Uncommon class weapon (item level 7); unlock card |
| **II — The Proving** | 20 | `q_calling_<class>_2` | the same trainer (a letter arrives by mail at 20) | a class-specific place in regions 3–5 (class file names it) | the mechanic's second stage; a Rare class weapon or off-hand (item level 21); the title "*<name> the Proven <Class>*" |
| **III — The Mastery** | 40 | `q_calling_<class>_3` | a master of the class, somewhere in regions 6–8 | a class-specific trial with a named boss | the mechanic's third stage (e.g. Dragon Form, canon); an Epic class item with a class power (item level 42); the title "*Master <Class>*"; a class-coloured mount appearance |

Rules for all three:

- A calling is **answered alone**: followers stay outside the trial; group members cannot enter it.
- 3–6 steps: a conversation, a task that **teaches the mechanic by using it** (e.g. "bank 300 overheal
  into Devotion"), a trial fight that cannot be won without the mechanic, and a return.
- Scaled to the level it is taken at (no higher than 5 levels above its level).
- Can be abandoned and restarted; the trial can be retried at no cost.
- Pays quest XP as a **calling** quest ([page 07 §Quest XP](07-PROGRESSION.md#quest-xp)).
- The trainer also sells nothing and teaches nothing else — spells arrive by level ([§5.2](#52-how-a-spell-arrives)).

---

## 13. Talents

`(reuse idea: js/skilltalents.js — per-spell trees, one pick per tier, rules not numbers, visible changes)`

### 13.1 The tiers (canon)

| Tier | Opens at level | Guideline for what it changes (Farhold's tier meanings, kept) |
|---:|---:|---|
| 1 | **12** | how the spell is thrown: more projectiles, a different shape, a faster version, a charge |
| 2 | **22** | what happens when it lands: bursts, chains, leaves ground, deepens its status, drains |
| 3 | **32** | what it does to the fight: crits that spread, refunds on kill, barriers, marks, echoes |
| 4 | **45** | the plan: a combination that turns the spell into something else |

Farhold opened tiers at 3/8/18/28 (`TIER_LEVELS`, R22).

### 13.2 Rules

- **Four tiers × six spells = 24 picks** at level 60. Each tier offers **2 or 3** choices; you take **one**.
- A tier opens for a spell at **the later of** the tier's level and the spell's slot level: slot 4 (18) gets
  tier 1 at 18 and tier 2 at 22; slot 6 (40) gets tiers 1–3 at once at 40 and tier 4 at 45.
- **Every talent changes what the spell does**, never only a number (Farhold's rule: "a talent that read +10%
  fire damage would be an affix wearing a different hat"). A talent **may** carry a number *with* a rule
  change (Farhold's Fanned: "3 projectiles, each dealing 30% less damage").
- **No "better but slower" talents** (Farhold R11: Heavy, Overload and Widened were rewritten for that).
- **Every talent changes how the spell looks** (`fx` key), so a player can read another's build.
- Talent descriptions are **generated from the talent's numbers** (Farhold `describeMod`) — class files
  write the numbers and a short rule; the generator writes the card.
- Picking into an **empty** tier is free and instant. Changing a pick needs the **Unbinder**
  ([page 07 §Retraining](07-PROGRESSION.md#retraining); Farhold R20).
- Alternate spells (forms/stances) have their own trees.
- A talent id is `<spellid>_t<tier><a|b|c>` (canon), e.g. `mage_ember_lance_t2b`.

### 13.3 Where talents are chosen

The **Talents** tab of the character screen (page 03): one column per spell on the bar, four rows (tiers),
2–3 nodes per cell, a green "Talent available" badge on any cell you may fill (Farhold R20 "Spell available"
card, reused). Hovering a node shows the spell's card **as it would read with that talent**.

---

## 14. Class sets

`(reuse: Emberveil/Farhold set machinery — rpg.setBonuses, legendaryPowers, loot.activeSets; new: class-only sets)`

### 14.1 The rule

- Every class has **at least two** class sets (canon). Ids `set_<class>_<snake>`.
- A class set has **six pieces**: head, chest, legs, hands, feet, and **one** of necklace or off-hand
  (class file chooses). Bonuses at **2, 4 and 6** pieces.
- A class set can only be **worn with its bonuses** by that class (another class may wear the pieces as
  plain armour).
- What the bonuses do, by count:

| Pieces | Bonus type |
|---:|---|
| 2 | a stat line tied to the class (e.g. "+10% Heat generated") or a small rule change |
| 4 | **changes one spell** (a rule, like a talent that stacks with talents) |
| 6 | **changes the class mechanic**, or changes two spells together |

- Farhold's `cond_extraSetPiece` / `cond_setThresholdReduce` affixes ("counts as one more piece") keep working,
  capped at +1 (page 08).

### 14.2 The two (or more) sets every class gets

| Set | Level | Where it drops | Look |
|---|---:|---|---|
| **Set A — the Calling set** | item level 45 | pieces from the Calling III chain (1 piece), level 40–48 dungeons `d10`–`d11` (4 pieces, one boss each), and the Rimehold / Saltmarch quartermasters for faction standing (1 piece) | the class's colour, simple trims |
| **Set B — the Endgame set** | item level 60 (Heroic) / 64 (Mythic) | Heroic dungeons (2 pieces), raid `r04_ember_court` (4 pieces); Mythic versions from Mythic raid difficulty | elaborate, glowing trims at Mythic |
| Set C (optional) | item level 66 | raid `r05_veilspire` only | the class's "final form" |

Page 09 indexes every class set; class files write the pieces and bonuses; page 12/13 place the drops.

---

## 15. Class legendaries and uniques

`(reuse: rpg.legendaryPowers, js/effects.js power registry, js/uniques.js)`

- Every class file lists **2–4 class legendaries** (`leg_<snake>`) and **2–4 class uniques** (`uq_<snake>`).
- A class legendary's power **only makes sense for that class** (it names a class spell or the mechanic).
  It can drop for anyone but is flagged "Class: <name>" on the card, is **bound to the class** when equipped,
  and is **sold for gold or salvaged** by anyone else.
- Every power is a registry entry with the same shape as Farhold's `U23` constants: **the card text and the
  hook read the same numbers** (Farhold R23 rule), and a test fails if a power has no reader.
- Drop weighting: a class legendary drops **3×** more often for a player of that class (smart loot, page 08).

---

## 16. Armour and weapon proficiency

### 16.1 Armour tiers

| Tier | Classes (count) | Armour target at even level ([page 05 §8.2](05-COMBAT.md#82-the-formula-new)) | Other rule |
|---|---|---|---|
| Cloth | 8 | 15% reduction | — |
| Light | 10 | 25% | — |
| Medium | 6 | 35% | — |
| Heavy | 6 | 50% | +15% max HP from the tier; −5% move speed with all four heavy pieces |

- You may wear **your tier and every lighter tier**. A heavy-armour class may wear light armour (less armour,
  no penalty beyond that). You cannot wear a heavier tier.
- **Class set bonuses** only count pieces of your own tier.
- Shields: classes with "shield" in their weapon families (§2).

### 16.2 Weapons

- Trained families are listed in §2. An **untrained weapon cannot be equipped** (the card says "Your class
  is not trained in hammers." — Farhold `equipRefusal` pattern).
- Everyone may **dual wield** one-handers of families they are trained in (Farhold rule, canon).
- Everyone may use a **light** (torch, lantern) in the light slot and a **tool** where page 08 keeps tools.

---

## 17. Voices and barks

`(reuse: shared/voices.js voiceFor({ role, gender, seed }), Lingo, the formant engine)`

- Each class file names its **voice timbre** (the `role` passed to `voiceFor` — Farhold's party voices map a
  class/role to a timbre) and writes **barks** in Lingo templates: on cast of slots 4–6, on crit, at low
  health (below 25%), on kill of a rare/boss, on revive, on level up.
- Barks respect a per-player cooldown of **8 s** and the setting `set.audio.classBarks` (On / Own only / Off).
- No bark ever names another game's content.

---

## 18. Choosing a class

`(reuse: Farhold's class preview beside the 30-entry dropdown — R10 review; the figure from js/figure3d.js)`

The character-creation screen (`scr_create_character`, page 03) shows for the highlighted class:

| Field | Source |
|---|---|
| Name, role badges (Role + Can also), armour, resource | §2 |
| Three-sentence identity | class file §1 |
| The mechanic in one sentence and one number | class file §2 |
| The six spells as icons with their slot levels (1/4/10/18/28/40), hover for the card | class file §3 |
| A difficulty rating (1–3 pips) | class file |
| A **live 3D figure** in the starting gear, playing slot 1 and slot 4 on a dummy | `js/figure3d.js` reuse |
| Filters | Role (Tank/Healer/Damage/Support), Armour, Resource |

Race (Human, Elf, Dwarf, Halfling — canon) is a separate choice and **does not change stats** (Farhold R26
`js/bodypresets.js` presets are looks only).

---

## 19. Data shapes

Page 16 owns file names; the shapes the class system needs:

**A class** (`data/classes/<id>.json`):

```json
{
  "id": "mage", "name": "Mage", "role": "damage", "canAlso": [],
  "armour": "cloth", "resource": "mana",
  "primary": "int", "secondary": "dex",
  "weapons": ["staff", "wand", "focus"], "starter": { "weapon": "it_apprentice_staff" },
  "mechanic": { "id": "mage_arcane_charge", "gauge": "pips", "max": 4 },
  "spells": ["mage_x", "mage_y", "mage_z", "mage_a", "mage_b", "mage_c"],
  "alternates": {},
  "callings": ["q_calling_mage_1", "q_calling_mage_2", "q_calling_mage_3"],
  "sets": ["set_mage_a", "set_mage_b"],
  "voice": { "role": "mage" }, "colour": "#b090ff", "difficulty": 2
}
```

**A spell** (`data/spells/<class>.json`, one entry per spell; extends Farhold's `data/skills.json` row):

```json
{
  "id": "mage_ember_lance", "name": "Ember Lance", "slot": 1, "slotLevel": 1,
  "cost": { "mana": 60 }, "cooldown": 0, "gcd": true,
  "cast": { "type": "cast", "seconds": 1.5 },
  "range": 34, "shape": { "kind": "target", "projectile": { "speed": 40 } },
  "power": { "of": "sp", "coefficient": 2.05, "element": "fire" },
  "statuses": [{ "id": "burn", "total": 0.40, "of": "hit" }],
  "tags": ["interrupt?", "offGcd?"],
  "fx": { "element": "fire", "shape": "bolt" }, "sfx": "fire_launch",
  "talents": {
    "1": ["mage_ember_lance_t1a", "mage_ember_lance_t1b"],
    "2": ["mage_ember_lance_t2a", "mage_ember_lance_t2b", "mage_ember_lance_t2c"],
    "3": ["..."], "4": ["..."]
  }
}
```

**A talent**:

```json
{ "id": "mage_ember_lance_t1a", "spell": "mage_ember_lance", "tier": 1, "name": "Split Lance",
  "mod": { "projectiles": 3, "spread": 0.38, "coefficientMult": 0.7 }, "fx": "fan" }
```

---

## 20. What is reused from Farhold

| Farhold file | What Wildmarch keeps | What changes |
|---|---|---|
| `data/classes.json` | the 30 ids, names, looks, weapon lists, starting weapon | roles/armour/resource from canon; primary/secondary attributes; skills list replaced by bespoke spells |
| `data/skills.json` + `js/skills.js` | the bar model, cooldowns, cost refusal messages, the **description generator**, the status table (moved to page 05), `effectiveMult` as a design formula | Farhold's 40 shared skills become **visual references only** (canon: "spells are new"); slots 1/4/10/18/28/40 |
| `js/skilltalents.js` | per-spell trees, one pick per tier, generated text, fx per talent, the refusal to re-pick a spent tier | tiers at 12/22/32/45; bespoke talents per class instead of the shared library |
| `js/pets.js`, `js/followers.js`, `data/mercenaries.json` | companions, summons, mercenaries, the 75% damage cap, revive timer, leash | threat table, stances, group body slots |
| `js/retrain.js` | the Unbinder | prices for 60 levels ([page 07](07-PROGRESSION.md#retraining)); spells not retrainable |
| `js/foci.js` | caster off-hand foci | available to every INT caster |
| `js/classbuild.js` (custom class) | nothing in v2 | parked (canon) |
| `shared/voices.js` | class voice timbres | — |

---

## 21. Open questions

1. **Challenge and Tend the Fallen** as shared verbs (not spells) — agree? **Resolved (00 §10):** both are on
   page 07's ladder (Tend the Fallen day one, Challenge at 10). Without Challenge, a tank class
   whose kit has no taunt cannot tank a dungeon.
2. **Role focus passives** (+10% HP/armour, +10% healing, +5% damage, +10% buff strength) — is a small role
   passive wanted, or should role be only a group-finder label?
3. **Followers in Normal dungeons can queue as tank/healer.** Is it acceptable that a solo player's dungeon is
   tanked by a mercenary?
4. **Class legendaries dropping for other classes** (sellable/salvageable) vs never dropping for them.
5. **Tinker primary DEX** (Farhold had INT) — confirm.
