# WILDMARCH — Design Bible, page 06: the class system

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Owns:** how classes work in general — primary and
**hybrid** roles and the Dungeon Finder role rule, what each resource means for a class, the spell ladder, the
global cooldown, cast types, **targeting kinds and tags on spells**, shapes, the spell power budget, forms,
stances and aspects, **pets (tamed, bound, controlled)**, **utility spells**, how class mechanics are shown,
calling quests, per-spell talents, class sets, proficiencies, and group composition. **Every individual spell,
mechanic, talent and set is owned by its class file** (`classes/<id>.md`), which follows the template in
[page 00 §5](00-OVERVIEW.md#5-the-spell-ladder-and-the-class-template).
**Reads from:** [page 05](05-COMBAT.md) (damage formula, **tags** §22, targeting §2, resource numbers §18.3,
statuses, threat), [page 07](07-PROGRESSION.md) (levels, attributes, unlocks, retraining, Second Loadout),
[page 08](08-ITEMS.md) and [page 09](09-SETS-LEGENDARIES.md) (items, sets), [page 20](20-TRAVEL.md) (travel
spell numbers).

Farhold paths are relative to `prototypes/farhold/`. `(reuse: path)` = exists in Farhold and is kept;
`(new)` = Wildmarch only.

**Round 2 in one paragraph.** Every class has a **primary role** (tuned for everything) and most have a **hybrid
role** (a real second role, tuned to 85–90% of a primary in the open world, Normal dungeons and moderate Depth).
Resources are **Mana, Momentum and Tempo**. Every spell carries **tags** and one **targeting kind**. No class
summons a pet: pets are **tamed** (ranger), **bound** (warlock) or **controlled** for a time (necromancer,
enchanter), and permanent pets come back through an out-of-combat **ritual** — a **utility spell** that uses no
slot, like the four **travel spells**. The druid's forms **transform its six spells** rather than giving it a
second bar. A class shows a gauge only if its mechanic needs one (the demon hunter has none). There is no mass
resurrection.

---

## Contents

1. [What a class is](#1-what-a-class-is)
2. [The thirty classes](#2-the-thirty-classes)
3. [Roles and the group](#3-roles-and-the-group)
4. [Resources](#4-resources)
5. [The spell ladder](#5-the-spell-ladder)
6. [The global cooldown](#6-the-global-cooldown)
7. [Cast types, targeting, shapes and tags](#7-cast-types-targeting-shapes-and-tags)
8. [The spell power budget](#8-the-spell-power-budget)
9. [Forms, stances and aspects](#9-forms-stances-and-aspects)
10. [Pets: tamed, bound and controlled](#10-pets-tamed-bound-and-controlled)
11. [Utility spells](#11-utility-spells)
12. [Class mechanics on screen](#12-class-mechanics-on-screen)
13. [Calling quests](#13-calling-quests)
14. [Talents](#14-talents)
15. [Class sets](#15-class-sets)
16. [Class legendaries and uniques](#16-class-legendaries-and-uniques)
17. [Armour and weapon proficiency](#17-armour-and-weapon-proficiency)
18. [Voices and barks](#18-voices-and-barks)
19. [Choosing a class](#19-choosing-a-class)
20. [Data shapes](#20-data-shapes)
21. [What is reused from Farhold](#21-what-is-reused-from-farhold)
22. [Open questions](#22-open-questions)

---

## 1. What a class is

A class is a **fixed kit** — there is no custom class in Wildmarch (canon; Farhold's R17 custom class is
parked in `QUESTIONS.md`). Every class has exactly these parts:

| Part | What it is | Where it is defined |
|---|---|---|
| Identity | fantasy, voice, look, starting gear | class file §1 |
| **Primary role** and **hybrid role** | the group roles it may queue as ([§3](#3-roles-and-the-group)) | page 00 §6 (canon) |
| **Build** | melee, ranged (a weapon at range) or caster (spells at range) | page 00 §6 |
| Armour tier | cloth, light, medium or heavy ([§17](#17-armour-and-weapon-proficiency)) | page 00 §6 |
| Weapon families | which weapons it is trained in | this page §2 |
| **Resource** | Mana, Momentum or Tempo ([§4](#4-resources)) | page 00 §6 |
| **Class mechanic** | the signature system ([§12](#12-class-mechanics-on-screen)) | class file §2 |
| **Six spells** | one per slot on the ladder 1 / 4 / 10 / 18 / 28 / 40 ([§5](#5-the-spell-ladder)), each with **tags** and a **targeting kind** ([§7](#7-cast-types-targeting-shapes-and-tags)) | class file §3 |
| Alternate versions | forms, stances or aspects that **transform** the six spells ([§9](#9-forms-stances-and-aspects)) | class file §4 |
| **Hybrid role** write-up | how the class fills its second role ([§3.3](#33-hybrid-roles)) | class file §5 |
| **Utility spells** | out-of-combat spells that use no slot: travel, pet rituals ([§11](#11-utility-spells)) | class file §6 |
| **Talents** | 4 tiers × 6 spells, 2–3 choices each ([§14](#14-talents)) | class file §7 |
| **Class sets** | at least 2, bonuses at 2/4/6 pieces ([§15](#15-class-sets)) | class file §8, indexed on page 09 |
| Legendaries, uniques and souls | items only this class wants ([§16](#16-class-legendaries-and-uniques)) | class file §9 |
| Primary and secondary attribute | what levelling raises most ([page 07](07-PROGRESSION.md#attributes)) | this page §2 |
| Calling quests | levels 6, 20, 40 ([§13](#13-calling-quests)) | page 14 (content), class file §2 (what each grants) |

**Shared by every class, and not spells** (canon): basic weapon attacks (the weapon patterns,
[page 05 §4](05-COMBAT.md#4-basic-attacks-the-weapon-patterns)), the dodge roll, sprint, block/parry, potions
and consumables on the belt, mount skills, and two shared verbs — **Provoke** (the tank taunt) and **Tend the
Fallen** (out-of-combat revive), [§3.6](#36-shared-verbs).

---

## 2. The thirty classes

Canon columns (primary, hybrid, build, armour, resource, mechanic) are copied from
[page 00 §6](00-OVERVIEW.md#6-the-thirty-classes). **Attributes, weapons, starting weapon and pet are this
page's** (weapons and starter reuse Farhold's `data/classes.json` where the class did not change; the three
new ranged families — hand crossbow, firelock, throwing knives — are defined on
[page 05 §4.5](05-COMBAT.md#45-ranged-weapons-reuse-jsweaponsjs-ranged-drawpower)).

| # | Class | Primary | Hybrid | Build | Armour | Resource | Signature mechanic | Primary / secondary | Weapon families | Starts with | Pet |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [Warrior](classes/warrior.md) | Tank | Damage | melee | heavy | Momentum | Bulwark | STR / CON | sword, longsword, hammer, greatsword, greataxe, shield | longsword + shield | — |
| 2 | [Fighter](classes/fighter.md) | Damage | Tank | melee | heavy | Momentum | Stances | STR / DEX | sword, hammer, greatsword, halberd, shield | two-handed sword | — |
| 3 | [Paladin](classes/paladin.md) | Tank | Healer | melee | medium | Mana | Oaths | STR / INT | sword, sceptre, mace, shield | sword + shield | — |
| 4 | [Ranger](classes/ranger.md) | Damage | Support | ranged | light | Tempo | Tame Beast + hunter's marks | DEX / CON | bow (all three), crossbow, javelin, quiver | shortbow + quiver | **tamed beast** (permanent) |
| 5 | [Rogue](classes/rogue.md) | Damage | Support | melee **or** ranged | light | Tempo | Blind Spots + Wounds | DEX / STR | dagger (dual), sword, throwing knives, shortbow, hand crossbow | two daggers | — |
| 6 | [Cleric](classes/cleric.md) | Healer | Support | caster | light | Mana | Devotion | INT / CON | staff, sceptre, mace, wand, shield, focus | sceptre + shield | — |
| 7 | [Bard](classes/bard.md) | Support | Healer | caster | light | Tempo | Songs | INT / DEX | dagger, wand, quarterstaff, focus | quarterstaff | — |
| 8 | [Mage](classes/mage.md) | Damage | **Tank** | caster | cloth | Mana | Resonance + Wards | INT / CON | staff, wand, focus | staff | — (decoy images are spell objects, §10.1) |
| 9 | [Necromancer](classes/necromancer.md) | Damage | Healer | caster | cloth | Mana | Corpses + Control Undead | INT / CON | staff, wand, sceptre, focus | staff | **controlled undead** (temporary) |
| 10 | [Warlock](classes/warlock.md) | Damage | **Tank** | caster | cloth | Mana | Tithes + Bind Demon | INT / CON | staff, wand, sceptre, focus | staff | **bound demon** (permanent) |
| 11 | [Demon Hunter](classes/demon_hunter.md) | Damage | — | ranged + melee | light | Momentum | Demonsight + Traps | DEX / INT | hand crossbow (dual), dagger (dual), throwing knives | two hand crossbows | — |
| 12 | [Scavenger](classes/scavenger.md) | Damage | Support | ranged (thrown) | light | Momentum | The Pack (junk) | DEX / CON | javelin, throwing knives, dagger, hammer, quarterstaff | javelins | — |
| 13 | [Swashbuckler](classes/swashbuckler.md) | Damage | **Tank** | melee | light | Tempo | Flair | DEX / CON | sword, sabre, rapier, dagger, hand crossbow | rapier | — |
| 14 | [Dragon Knight](classes/dragon_knight.md) | Damage | Tank | melee | heavy | Momentum | Draconic Aspect (Dragon Form at 40) | STR / CON | greatsword, greataxe, longsword, halberd, shield | longsword | — |
| 15 | [Pyromancer](classes/pyromancer.md) | Damage | **Healer** | caster | cloth | **Momentum (Heat); no mana bar** | Heat (its Momentum) | INT / CON | staff, wand, sceptre, focus | staff | — |
| 16 | [Stormcaller](classes/stormcaller.md) | Damage | Support | caster | cloth | Mana | Static + lightning rods | INT / DEX | staff, wand, focus | wand | — |
| 17 | [Druid](classes/druid.md) | Healer | Tank, Damage | caster / melee | medium | Mana | Shapeshift (Grove, Heron, Bear, Wolf transform the spells) | INT / STR | staff, sceptre, quarterstaff, focus | quarterstaff | — (the druid *is* the beast) |
| 18 | [Oracle](classes/oracle.md) | Healer | Support | caster | cloth | Mana | Foresight | INT / CON | staff, sceptre, focus | sceptre | — |
| 19 | [Tactician](classes/tactician.md) | Support | **Tank** | ranged (crossbow, spear) | medium | Tempo | Orders | DEX / CON | crossbow, javelin, spear, sword, shield | crossbow | — (commands followers) |
| 20 | [Chronomancer](classes/chronomancer.md) | Support | **Healer** | caster | cloth | Mana | Timeline | INT / DEX | staff, wand, focus | staff | — |
| 21 | [Monk](classes/monk.md) | Damage | Healer | melee | cloth | Tempo | Breath | DEX / CON | quarterstaff, fists | quarterstaff | — |
| 22 | [Shaman](classes/shaman.md) | Healer | Damage | caster | medium | Mana | Storm Tales (no totems) | INT / CON | staff, sceptre, quarterstaff, shield, focus | quarterstaff | — (storm-beasts are spells) |
| 23 | [Witch Hunter](classes/witch_hunter.md) | Damage | Support | ranged (crossbow) | medium | **Mana** | Silver + Verdict | DEX / INT | crossbow, hand crossbow, sword, dagger | crossbow | — |
| 24 | [Knight](classes/knight.md) | Tank | Support | melee | heavy | Momentum | Banner + Vow of Protection | STR / CON | sword, hammer, spear, shield | longsword + shield | — |
| 25 | [Sorcerer](classes/sorcerer.md) | Damage | Support | caster | cloth | Mana | Wild Magic | INT / DEX | staff, wand, focus | wand | — |
| 26 | [Runesmith](classes/runesmith.md) | Tank | Damage | melee | heavy | **Mana** | Runes | STR / CON | hammer, greataxe, mace, shield | hammer + shield | — |
| 27 | [Shadow Dancer](classes/shadow_dancer.md) | Damage | **Tank** | melee | light | Tempo | Shadows (clones) | DEX / CON | dagger (dual), rapier | two daggers | — (clones are spell objects) |
| 28 | [Tinker](classes/tinker.md) | Damage | **Healer** | ranged (gun, crossbow) | medium | Tempo | Devices + sentry | DEX / INT | firelock, crossbow, shortbow, dagger, hammer | crossbow | — (the sentry is a deployable) |
| 29 | [Priest](classes/priest.md) | Healer | Damage | caster | light | Mana | Light/Shadow balance | INT / CON | mace, sceptre, staff, shield, focus | sceptre + shield | — |
| 30 | [Enchanter](classes/enchanter.md) | Support | **Tank** | caster | light | Mana | Charm + illusions | INT / CON | staff, wand, focus | staff | **charmed enemy** (temporary) |

Changes from round 1 and from Farhold's `data/classes.json`: every class that gained a **Tank** hybrid role
(mage, warlock, swashbuckler, tactician, shadow dancer, enchanter) now has **CON** as its secondary attribute;
the rogue, demon hunter, scavenger, tactician, witch hunter and tinker gained the ranged families their new
builds need; the tinker's primary is DEX (Farhold: INT) because every tinker weapon is DEX-scaled; the monk may
fight with fists; foci (Farhold R25 `js/foci.js`) are open to every INT caster; the rogue, shadow dancer and
demon hunter start dual-wielding. The old "Farhold companion" column is gone: only four classes have a pet at
all ([§10](#10-pets-tamed-bound-and-controlled)), and Farhold's companions are a **visual** source for them.

**Counts.** By primary role: Tank 4 (warrior, paladin, knight, runesmith), Healer 5 (cleric, druid, oracle,
shaman, priest), Support 4 (bard, tactician, chronomancer, enchanter), Damage 17 — 30. By armour: cloth 9,
light 10, medium 6, heavy 5. Counting hybrid roles, every role has at least twelve classes that can queue as it:

| Role | Primary | Hybrid | Can queue as it |
|---|---|---|---:|
| Tank | warrior, paladin, knight, runesmith | fighter, mage, warlock, swashbuckler, dragon knight, druid, tactician, shadow dancer, enchanter | **13** |
| Healer | cleric, druid, oracle, shaman, priest | paladin, bard, necromancer, pyromancer, chronomancer, monk, tinker | **12** |
| Damage | the 17 Damage classes | warrior, druid, shaman, runesmith, priest | **22** |
| Support | bard, tactician, chronomancer, enchanter | ranger, rogue, cleric, scavenger, stormcaller, oracle, witch hunter, knight, sorcerer | **13** |

The **demon hunter** is the one class with no hybrid role (canon W27: a pure demon-killer).

---

## 3. Roles and the group

### 3.1 The four roles (canon)

| Role | Job in a fight | What the game gives it |
|---|---|---|
| **Tank** | holds the enemies' attention and survives it | the **Guardian** state (×4 threat, [page 05 §13](05-COMBAT.md#13-threat-and-aggro)) while its role focus is Tank; the shared **Provoke**; heavy or medium armour for primary tanks, other defences for hybrid tanks |
| **Healer** | keeps the group alive | heals and shields scale with Spell Power ([page 05 §6.1](05-COMBAT.md#61-the-two-power-numbers-farhold-one-wildmarch-two)); dispels; most have a battle revive (no limit on how many a group uses — canon W21) |
| **Damage** | kills things | the highest damage budget ([§8](#8-the-spell-power-budget)) |
| **Support** | makes everyone else better | buffs, debuffs, control, cooldown and resource tricks; about **80%** of a Damage class's personal damage, plus group effects worth more than the missing 20% in a full group. **Counts as a Damage slot** in the Dungeon Finder (canon) |

### 3.2 Role focus `(new)`

Every class chooses its **role focus** on the Spells tab (`scr_character`, Spells tab — page 03) from a dropdown
listing **only its primary and hybrid roles** (the demon hunter's dropdown has one entry). Changing it is free,
takes a **5 s cast**, and only works out of combat. What it changes:

| Role focus | Passive it turns on (every class) | Also |
|---|---|---|
| Tank | **Stalwart**: +10% max HP, +10% armour; the **Guardian** state (×4 threat) is on | Dungeon Finder role; Provoke usable |
| Healer | **Mender**: +10% healing done, −10% resource cost of heals | Dungeon Finder role |
| Damage | **Striker**: +5% damage | Dungeon Finder role |
| Support | **Herald**: +10% to the strength of buffs and debuffs you apply | Dungeon Finder role |

**Canon 00 §6 — the role focus rule:** role focus is a **spellbook switch** that sets **Primary** or **Hybrid**
(for the druid: primary Healer, or hybrid Tank or Damage), out of combat only, **saved per Loadout**, and the
**Dungeon Finder queues you by it**. A class may also **tie** its role focus to something it already switches —
a stance (fighter Defense), an Oath (paladin), a form (druid Bear or Wolf), or wearing a shield — so that taking
up the stance, Oath, form or shield sets the matching focus by itself; the class file says which. A class file may
give a role focus more (e.g. the paladin's Healer focus swaps an Oath; the mage's Tank focus makes its Wards
deflect). The **Second Loadout** (level 30, [page 07](07-PROGRESSION.md)) saves the role focus with each loadout. Role focus is how a hybrid role is switched on at any level — a level-8 mage can tank the
Hollow Barrow with its Tank focus and its first Ward.

### 3.3 Hybrid roles

`(new — canon W7 and 00 §6: "the owner likes hybrids", including unexpected crossbreeds)`

A **hybrid role** is a real second job, not a gesture. The class can queue as it, its spells already support
it, and three tools make it good:

| Tool | What it does for the hybrid role | Available from |
|---|---|---|
| **Role focus** (§3.2) | turns on the role's passive and, for Tank, the Guardian state; class files may add a role-focus rider to one or two spells (e.g. mage Tank focus: Wards reflect 20% of what they absorb as threat) | level 1 |
| **Talent choices** | every class file offers, on **at least three of its six spells**, one choice in **each** tier that serves the hybrid role (a tank talent on a damage spell, a heal rider on a fire spell). A player building for the hybrid role picks those ([§14](#14-talents)) | tier 1 at 12 |
| **Gear** | the hybrid role wants different stats (tank: CON, armour, block, "−N% damage taken"; healer: INT, "+N% healing" tag bonuses; support: buff duration, cooldown recovery). **At least one of every class's sets** changes a hybrid-role spell at 4 or 6 pieces ([§15](#15-class-sets)) | any level |
| **Second Loadout** | two saved builds — talents, perks, role focus, bar layout and a gear set — so the hybrid build is one 5 s switch away instead of a trip to the Unbinder | level 30 ([page 07](07-PROGRESSION.md)) |

**How each class fills its hybrid role** (the brief from 00 §6; the class file's §5 owns the detail):

| Class | Hybrid | How |
|---|---|---|
| Warrior | Damage | a two-hander and Bulwark charges spent as damage instead of blocks |
| Fighter | Tank | the Defense stance (Guardian while in it) transforms the six spells into guarding versions |
| Paladin | Healer | an Oath of mercy; its holy strikes heal nearby allies |
| Ranger | Support | hunter's marks that raise the group's damage; the beast's buffs and cleanses |
| Rogue | Support | coatings (Sapped, Numbed), Laid Open, Ashpowder blinds for the pack |
| Cleric | Support | Devotion shields spent as group buffs |
| Bard | Healer | songs whose finale heals |
| **Mage** | **Tank** | **Wards** that deflect hits, **decoy images** that pull attention; tanks from range with Resonance |
| Necromancer | Healer | corpses spent to mend allies; controlled undead as a shield wall |
| **Warlock** | **Tank** | the **bound demon** holds threat as a tank pet (×3) while Tithes turn the warlock's own health into shields for it |
| Scavenger | Support | junk barricades and scrap buffs |
| **Swashbuckler** | **Tank** | parry-and-riposte: Flair raised by parried hits |
| Dragon Knight | Tank | a stone-hide aspect; Dragon Form as a defensive cooldown |
| **Pyromancer** | **Healer** | cauterizing flames that heal allies (Heat spent on healing) |
| Stormcaller | Support | lightning rods that speed allies; Static that weakens enemies |
| Druid | Tank, Damage | Bear form (Guardian, from 20) and Wolf form (from 40) transform the spells; before 20 the druid is a healer only in practice |
| Oracle | Support | Foresight's early warnings and pre-shields |
| **Tactician** | **Tank** | shield and spear, Orders that pull attention to the tactician |
| **Chronomancer** | **Healer** | rewinding allies' health; echoes of heals |
| Monk | Healer | Breath spent on mending techniques |
| Shaman | Damage | the Thunder Ox (of the three storm-beasts — Thunder Ox, Rain Crane, Wind Hare) and the Great Storm aimed at enemies |
| Witch Hunter | Support | purges, anti-magic, Silver-Branded for the group |
| Knight | Support | the Banner and the Vow of Protection on an ally |
| Sorcerer | Support | the chaos table's helpful surges aimed at allies |
| Runesmith | Damage | runes detonated for damage instead of wards |
| **Shadow Dancer** | **Tank** | shadow clones that soak attention; swapping places with the clone |
| **Tinker** | **Healer** | repair drones |
| Priest | Damage | the Shadow side of the balance |
| **Enchanter** | **Tank** | illusions that hold attention and Charm on the biggest threat |

**The tuning target.** Measured by the simulator (page 16) against a primary-role class of the same level and
gear quality:

| Content | A hybrid role delivers | Measured as |
|---|---|---|
| Open world, **Normal** dungeons | **85–90%** of a primary | tank: damage taken per second × threat per second held; healer: sustained healing over a 3-minute boss fight **and** the biggest heal in 3 s; damage: sustained damage per second; support: the value of its group buffs and debuffs |
| **Moderate Depth** — any Depth at which the dungeon's level is still 60 or below, plus the **first Depth tier past 60** (page 12) | **85–90%** | the same |
| **Challenge mode** and deeper Depth | **may drop to 75–85%**; the class is **not** tuned upward to close the gap | the same |

Rules that hold the target: a hybrid tank takes **110–118%** of the damage a primary tank takes from the same
boss and has the same ×4 threat (it holds threat; it needs more healing). A hybrid healer's resource lasts about
**80%** as long. A hybrid Damage role runs about 10–15% behind the class's own primary budget. A hybrid role
must still be able to do **every** mechanic of its role — a hybrid tank can taunt, face a boss away, and
survive a tank-buster with its own defensive cooldown. What it lacks is margin, not tools.

**The Dungeon Finder rule** (page 15 owns the screen):

1. When you queue you tick the roles you will fill; the finder offers **only your primary and hybrid roles**.
   Support counts as a Damage slot. A class file may set the level a hybrid role opens when it depends on a
   later piece of the kit (the druid's Tank role opens with Bear form at 20, its Damage role with Wolf form at
   40); every other hybrid role is open from level 1.
2. The finder shows **only dungeons you have discovered** (canon W9) and, for Depth, only dungeons you have
   cleared on Normal.
3. On **Normal** and **moderate Depth**, a hybrid is matched exactly like a primary. Nobody is labelled — the
   party sees your role, not whether it is your hybrid.
4. On **Challenge** and deeper Depth, the finder **prefers** a primary for the tank and healer slots: when a
   primary and a hybrid of the same role are both waiting, the primary is placed first. A hybrid is never
   refused, and the queue window tells a hybrid player once: "Hybrid roles are tuned below primary roles in
   Challenge mode."
5. When a group forms, the **role check** names your role. If your active role focus does not match, you get
   one button: "Switch to Loadout 2 (Tank)" (level 30+) or "Switch role focus to Tank (5 s)". You have **60 s**
   inside the entrance to switch; after that the role focus switches itself.
6. Followers may fill the **tank** and **healer** slots only on Normal and moderate Depth (§3.4).

### 3.4 Group composition

| Group | Recommended | Hard rule in the Dungeon Finder |
|---|---|---|
| Party (open world, up to 5) | anything | none |
| 5-player dungeon, **Normal** | 1 tank, 1 healer, 3 damage/support | the finder builds exactly 1 / 1 / 3. A player-made party may enter with any mix; **followers fill empty slots** (canon pillar 6) and can take the tank or healer role ([§10.6](#106-followers-in-the-group)) |
| **Depth**, moderate (dungeon level ≤ 60, or the first tier past 60) | 1 / 1 / 3 | finder 1 / 1 / 3; followers allowed |
| **Challenge mode**, and Depth past the first tier over 60 | 1 / 1 / 3, at least one Support recommended | finder 1 / 1 / 3; **no followers** (canon pillar 6: they expect people) |
| World boss | any number | none (the one thing designed for more than 5) |

Raid groups are not in v2 ([WISHLIST.md](WISHLIST.md)).

### 3.5 Utility a group needs — targets for the class files

A healthy dungeon group should find each of these in its five slots **most of the time**. The class files own
which spell does what; this table is the **coverage target** each class file is written against. If the
finished class files leave a column covered by fewer than the number shown, a class file changes, not this table.

| Utility | What it is ([page 05](05-COMBAT.md)) | Classes that should bring it (minimum count across the 30) |
|---|---|---|
| Interrupt | a spell tagged **Interrupt** | ≥ 18 classes — every melee and most ranged damage classes |
| Magic dispel (ally) | a spell tagged **Dispel** that removes a Magic debuff | every primary healer (5) + 3 others |
| Curse / Poison / Bleed dispel | one of the three each | ≥ 4 classes each |
| Purge (enemy buff) | removes a Magic buff from an enemy | ≥ 5 classes (witch hunter must have one) |
| Enrage dispel | removes Enrage from an enemy | ≥ 3 classes |
| Battle revive | an in-combat spell tagged **Revive** ([page 05 §16.4](05-COMBAT.md#164-being-revived)) — **no limit on uses** | ≥ 7 classes (every primary healer, + 2 others) |
| Group damage buff | e.g. +5% damage for the group | ≥ 8 classes; **the same buff from two sources does not stack** |
| Group defensive cooldown | e.g. −20% damage taken for 8 s | ≥ 8 classes |
| Group movement speed | e.g. +30% for 6 s | ≥ 5 classes |
| Hard CC for trash | sleep / fear / stun / charm / root (tagged **Control**) | ≥ 15 classes |
| Taunt | the tank-capable classes | all 13 (the shared Provoke, plus any taunt in their kit) |
| Group travel | a travel utility spell ([§11](#11-utility-spells)) | exactly 4 (mage, chronomancer, oracle; druid for itself) |

**Group buffs do not stack with themselves.** Each group buff belongs to a **buff family** (e.g.
`family: "group_damage"`); only the strongest from each family applies to a player. A class file names the
family of every group buff it gives. **Caps (page 05 §10.7):** different group buffs stack with each other
up to **+30% damage** in total, and all haste together is capped at **+30%**.

### 3.6 Shared verbs

| Verb | Who | Unlock | What it does |
|---|---|---|---|
| **Provoke** (was "Challenge"; renamed so it never clashes with Challenge mode) | the 13 classes whose primary or hybrid role is Tank | level 10, quest `q_hc_hold_the_line` ([page 07](07-PROGRESSION.md)) · key `Z` (page 02) | **Needs target**: your hard target within 20 m — your threat becomes 110% of its top and it is Taunted 3 s; 8 s cooldown; off the global cooldown. Tags: Taunt. A class whose own kit has a taunt may use both |
| **Tend the Fallen** | everyone | level 1 | out of combat, hold Interact on a dead ally's body for 8 s: they rise at 35% HP/mana ([page 05 §16.4](05-COMBAT.md#164-being-revived)). Tags: Revive |

---

## 4. Resources

Every class spends **one** of three resources on its spells (canon 00 §6, W28). **Page 05 §18.3 owns the
numbers** ([pools, refill, build and drain](05-COMBAT.md#183-resources-mana-momentum-tempo)); this section owns
what each means for writing a class. Farhold had only mana (`derived.maxMp`, `skills.json mp`); Momentum and
Tempo are `(new)`. The words "Fury", "Focus" and "Rage" are never used for a resource.

| | **Mana** | **Momentum** | **Tempo** |
|---|---|---|---|
| In one line | a big pool that refills slowly — spend it carefully | starts empty, **builds** as you hit and as you are hit, drains away out of combat — spend it on the big moves | a small pool that **refills fast** — spend it constantly |
| Numbers (page 05) | 1,000 + 2 per INT; 1% a second in combat | 0–100; ≈7 a second from basic attacks + up to 15 from one hit taken; drains after 4 s idle | 0–100; refills **25 a second** (empty to full in 4 s) |
| How a class plays | plans a fight; its big spells are gated by cost; a class tool returns mana | opens with builders, then spends; its best moments come late in a fight | never waits: presses something every GCD; its cooldowns, not its bar, set the pace |
| Typical costs | filler 40–80 · big spell 150–250 · heal 60–200 · long cooldown 0–100 | builders **0** (and build 10–20) · spenders 20–60 · finisher 40–100 | filler 20–30 · strong spell 40–60 · nothing above 75 |
| Running dry | a healer at full rate should run out in ~90 s of a boss fight without its class mechanic's mana tools, and last the fight with them | a Momentum class always has its builders; it is never "out" | a Tempo class can spend ~25 a second forever; bursting two strong spells back to back leaves it waiting ~2 s |
| Classes (15 / 7 / 8) | paladin, cleric, mage, necromancer, warlock, stormcaller, druid, oracle, chronomancer, shaman, **witch hunter**, sorcerer, **runesmith**, priest, enchanter | warrior, fighter, **demon hunter**, **scavenger**, dragon knight, **pyromancer**, knight | ranger, rogue, **bard**, swashbuckler, tactician, monk, shadow dancer, tinker |
| Colour on the HUD | blue `#4a8cff` | red-orange `#e0602a` | gold `#f2c94c` |

**Resource × build** (canon 00 §6 — every cell has at least one class):

| | Melee | Ranged | Caster |
|---|---|---|---|
| **Mana** | Paladin, Runesmith | Witch Hunter | Mage, Necromancer, Warlock, Cleric, Stormcaller, Druid, Oracle, Chronomancer, Shaman, Sorcerer, Priest, Enchanter |
| **Momentum** | Warrior, Fighter, Dragon Knight, Knight | Scavenger, Demon Hunter | **Pyromancer** |
| **Tempo** | Rogue, Swashbuckler, Monk, Shadow Dancer | Ranger, Tinker, Tactician, (Rogue) | Bard |

**Rules for class writers:**

- A **Momentum caster** (the pyromancer) builds by **casting**: each of its non-spender spells says "builds N
  Momentum" (typical 8–15). Its **Heat** is its Momentum bar — one bar, not two — with an overheat zone drawn on
  it (the class file owns what high Heat does).
- A **Mana melee or ranged** class (paladin, runesmith, witch hunter) gets nothing from basic attacks by
  default (only wands and staves return mana); its class mechanic must return mana instead — e.g. the witch
  hunter's **Silver Tithe**: +1% of max mana per crossbow basic-attack hit (page 05 §4.7).
- A **Tempo caster** (the bard) keeps the beat: the class file may refund Tempo for casting on the beat. A
  rogue's Unseen spell hits refund 5 Tempo (classes/rogue.md).
- A class mechanic may bank overflow (e.g. Momentum above 100) or raise a pool, never swap to another resource.
- A spell may cost health **instead** of its resource only if the class file says so (the warlock's Tithes).
- A spell you cannot afford greys out with the reason on hover: "Not enough Tempo: 40 needed, 25 held."

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
  names it, shows its numbers, its tags and its targeting kind, and plays a short demonstration clip on a
  training dummy; the slot on the bar lights up. Nobody has to visit a trainer to be allowed to press a button.
- A locked slot shows a padlock and "Slot 4 opens at level 18" (Farhold R20 wording).
- **Class spells cannot be unlearned** (Farhold R20: "a preset class's six are what the class IS").
  Talents and perks can be retrained ([page 07 §Retraining](07-PROGRESSION.md#retraining)).

### 5.3 The bar

- Keys **1–6** fire slots 1–6 (page 02 owns rebinding). **Q** is the class key (the mechanic's main action),
  **G** the second class key, **Shift+1–4** switch form / stance / aspect (max 4 per class), **F** is the
  dodge roll, **H** the mount, **Z** Provoke, **R** Quick Heal, **7 8 9 0** the four belt slots (canon 00 §10,
  page 02's table). Utility spells are not on this bar ([§11](#11-utility-spells)).
- Each slot shows: icon, cooldown sweep, charges (if any), cost, key, and a coloured border for its cast type
  (instant white, cast time blue, channel purple, charge orange, toggle green).
- **Hover** shows the spell card: name, `id` (in debug only), slot level, cost, cooldown, cast type,
  **targeting kind**, range, shape, **tags** (small caps, page 05 §22.1 order), and the generated description
  (Farhold R21 rule: descriptions are **generated from the spell's own numbers**, `js/skills.js describeSkill` —
  reuse the generator, never hand-write a spell sentence). The card also shows the damage **with your current
  tag bonuses** ("with your gear: 564").
- A form, stance or aspect **transforms the spells in place** ([§9](#9-forms-stances-and-aspects)): the six
  icons change, the keys do not.

---

## 6. The global cooldown

`(new — Farhold has per-skill cooldowns only)`

| Rule | Value |
|---|---|
| Global cooldown (GCD) | **1.0 s** after any spell that is on it |
| Haste | GCD = max(0.77 s, 1.0 s ÷ (1 + haste%)) — haste is capped at +30% (page 05 §10.7) |
| Spell queue | a spell pressed in the last **0.4 s** of the GCD or a cast fires the moment it ends |
| Off the GCD | spells marked `offGcd` on the class page: defensives, interrupts, taunts (Provoke included), the class mechanic's "spend" action where the class file says so. At most **one** off-GCD spell every 0.5 s |
| Refused spells | a spell that refuses (no target, out of range, not affordable) does **not** start the GCD |
| Basic attacks | never on the GCD. An **instant** spell does not stop the weapon pattern's clock (it plays as an upper-body cast); a **cast-time or channelled** spell stops basic attacks until it ends, and the pattern resumes where it left off if you swing again within 1.5 s |
| Forms/stances/aspects | swapping triggers a 0.5 s GCD of its own |
| Cooldown reduction | `cooldownReduction` (gear/perks, and "+N% cooldown recovery" tag bonuses for tagged spells) shortens spell cooldowns, cap 50% (Farhold AFFIX_CAP); it never touches the GCD. Minimum cooldown 0.5 s (Farhold `cooldownFor`) |

---

## 7. Cast types, targeting, shapes and tags

Every spell on a class page states, in this order: **cast type** (§7.1), **targeting kind** (§7.3), **range**,
**shape** (§7.2) and **tags** (§7.4). A spell missing any of them is not finished.

### 7.1 Cast types

| Cast type | How it works | Can move? | Interrupted by |
|---|---|---|---|
| **Instant** | fires on press | yes | — |
| **Cast time** | 0.5–3.0 s cast bar, fires at the end; pushback 0.25 s per hit taken, max 2 | no — moving, rolling or jumping cancels (nothing spent) unless the spell or a talent says "castable while moving" | Silence, stun, interrupt spells |
| **Channel** | fires ticks over its duration while you hold still; pressing any other spell or moving ends it early (ticks already paid stay paid). Tagged **Channel** | no, unless stated | as cast time; no pushback |
| **Charge** | hold the key: power builds from a minimum to full to a maximum, like a staff ([page 05 §4.6](05-COMBAT.md#4-basic-attacks-the-weapon-patterns)); release to fire; at maximum it fires itself | at 60% speed | a hit worth 25%+ of max HP breaks the charge |
| **Toggle / stance** | on or off, stays until changed; may reserve part of the resource pool | yes | — |
| **Combo** | pressing the same slot again within a window (default 2 s) fires the next part (e.g. a three-part strike); the slot's icon changes to show the next part | yes | a dodge roll resets it |
| **Reactive** | usable only for 4 s after an event (parry, dodge through a hit, kill, crit); the slot glows | yes | — |
| **Passive** | never pressed; the class mechanic and some talents | — | — |

**Charges**: a spell may hold 2 or 3 charges; each recharges on the spell's cooldown, one at a time.

### 7.2 Shapes (canon list, defined)

Measurements are always given on the class page; these are what the words mean.

| Shape | Meaning | Numbers the class page gives |
|---|---|---|
| **target** | one enemy — your hard target, or the one Auto-target picks | range |
| **cone** | from you, along your facing | length (m) and **full** angle (°) |
| **line** | a rectangle from you along your facing (a beam, a charge, a pierce) | length, width |
| **circle** | everything within R of **you** | radius |
| **ring** | a donut around you or a point: between inner and outer radius | inner radius, outer radius |
| **self** | only you | — |
| **ally** | one friendly unit (you, a party member, a follower, a pet) | range |
| **ground** | a circle at a chosen point | range, radius |
| modifiers | **projectile** (travels at N m/s and can be dodged), **chain** (jumps N times within R), **pierce** (passes through N bodies), **splash** (a projectile's impact radius; the rim takes 50%) | speed, jumps, radius |

**No falloff inside a shape** — what the telegraph shows is what hits, at full value (clearer than Farhold's
0.5/0.6/0.8 rim shares, which the card never printed). The only exception is projectile **splash**.

**Area cap**: an area spell deals full damage to up to **8** targets; with more, each takes `8 ÷ N` of it.
Heals have no cap unless the spell says one. (The cap is about the number of targets; a group is 5.)

### 7.3 Targeting kinds

Canon W8. [Page 05 §2.4](05-COMBAT.md#24-the-spell-targeting-kinds) owns the behaviour; every spell names one:

| Kind | Data id | Use it for | Pairs with shape |
|---|---|---|---|
| **Needs target** | `target` | a single-target finisher, interrupt or debuff that must land on one chosen enemy — refuses without a valid one | target |
| **Needs target (ally)** | `ally` | every single-ally heal, buff, shield, dispel and revive — refuses without a friendly target (`F1` targets yourself) | ally |
| **Auto-target** | `auto` | damage spells, projectiles, chains, dashes to an enemy — casts at your target, or at the valid enemy nearest your aim point if you have none | target, target + projectile/chain |
| **Ground** | `ground` | anything placed on the ground: fields, walls, traps, rods, a placed heal circle | ground, ring at a point |
| **Self** | `self` | cones, lines and circles from your body, stances, auras, self-buffs, group heals around you | self, cone, line, circle, ring |

A spell whose versions differ (a druid form's version, a fighter stance's version) states a targeting kind
**per version**.

### 7.4 Tags on spells

Canon 00 §12.3: **every spell carries tags** from [page 05 §22.1](05-COMBAT.md#221-the-tag-list). Class writers
tag every spell, every form/stance/aspect version, every pet attack and every DoT/HoT that a spell leaves. The
checklist for one spell:

1. **Exactly one** of `tag_attack` (it uses Weapon Damage) or `tag_spell` (it uses Spell Power). Add
   `tag_basic_attack` only if it fires your equipped weapon's own basic attack (page 05 §22.4).
2. **One element tag per damage part** (`tag_fire`, `tag_physical`…); a heal takes an element tag only if it
   heals *as* that element.
3. **Delivery**: `tag_melee` or `tag_ranged`; plus `tag_projectile`, `tag_area` (main shape is an area — not
   splash), `tag_chain`, `tag_channel` as they apply.
4. **Effects**: `tag_over_time` (ticks), `tag_duration` (lasts), `tag_heal`, `tag_shield`, `tag_control`,
   `tag_curse`, `tag_aura`, `tag_movement`, `tag_trap`, `tag_deployable`, `tag_minion` (by or to your pet),
   `tag_finisher` (spends the mechanic's stacks).
5. **Utility**: `tag_interrupt`, `tag_dispel`, `tag_taunt`, `tag_revive`, `tag_travel` as they apply.

Examples (illustrative — the class files own the real spells):

| Spell | Tags | Targeting |
|---|---|---|
| Mage **Fireball** (kept by name, canon W34) | Spell · Ranged · Projectile · Fire | Auto-target |
| A Blizzard-style ice field | Spell · Ranged · Area · Duration · Over Time · Ice · Control (its slow) | Ground |
| A warrior's shield slam that interrupts | Attack · Melee · Physical · Interrupt | Needs target |
| A cleric's single heal | Spell · Heal · Holy | Needs target (ally) |
| A ranger's three-arrow volley that fires the bow | Attack · Basic Attack · Ranged · Projectile · Physical | Auto-target |
| A tinker's sentry | Attack · Ranged · Projectile · Physical · Deployable · Duration | Ground |
| A druid's Bear version of a spell | tagged on its own — e.g. Attack · Melee · Area · Physical | Self |

A tag is not decoration: it decides which gear helps the spell. Writers should check that each class has
**some** spells that a common tag bonus helps (a pure-Spell class with no Area spell cannot use an Area Spells
staff) and note the class's natural tags in its §1 (e.g. "Fire · Spell · Area — gear that raises these helps
most of the kit").

---

## 8. The spell power budget

This is the **design tool** class writers use to set a spell's numbers. It is Farhold's R25 `effectiveMult`
(`js/skills.js`: `unlockPower × cooldownPower`) grown into a full budget. **It is never applied at run time**:
the number written on the class page is the final coefficient ([page 05 §6.3](05-COMBAT.md#63-one-owner-for-every-multiplier)).
Tag bonuses are **not** part of the budget — they come from gear and perks and apply at run time (page 05 §22.3).

### 8.1 Damage budget

```
coefficient (% WD or % SP, per target) =
    ( 1.00 × cooldownValue  +  1.00 × castSeconds )
  × unlockValue(slot)
  × shapeFactor
  × role
  − riders (paid out of the same budget)

cooldownValue = 1 + 0.08 × (cooldown − 4)     for cooldown ≥ 4 s        (Farhold cooldownPower)
              = 0.55 + 0.1125 × cooldown      for cooldown < 4 s        (a spammable spell is 55%)
castSeconds   = cast time or channel length — you give up that long of basic attacks
unlockValue   = 1 + (slotLevel − 1) / 39      slot 1: 1.00 · 4: 1.08 · 10: 1.23 · 18: 1.44 · 28: 1.69 · 40: 2.00
                                                (Farhold: 1.0 at level 1 → 2.0 at 24; stretched to 40)
shapeFactor   = target 1.00 · line 0.75 · cone 0.70 · ring 0.65 · circle 0.60 · ground 0.55 · chain 0.80 on the first target
role          = Damage ×1.00 · Support ×0.80 · Tank ×0.70 · Healer ×0.60 (a healer's damage spells)
                a spell written for the HYBRID role uses that role's factor ×0.90 (the 85–90% target, §3.3)
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
| Resource generated | 0.01 per point of Momentum, 0.004 per point of Tempo (it refills anyway), 0.001 per point of mana |

### 8.2 Healing and shield budget

Same formula in **% SP**, then × **1.5** for heals and × **1.8** for shields (they land before the damage).
A healer's healing is their damage, so its role factor is 1.0 here; a hybrid healer's is 0.90.

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
| Slot 2 cauterize heal on a Damage class (pyromancer hybrid Healer), 10 s | (1 × 1.48) × 1.08 × 1.00 × 1.5 × 0.90 | **216% SP** heal |

### 8.4 Utility (no damage budget)

| Utility | Cooldown range |
|---|---|
| Interrupt | 12–15 s |
| Taunt | 8 s |
| Dispel (ally) | 8 s (or a 2-charge spell at 10 s) |
| Dash / gap closer | 10–20 s |
| Personal defensive (−30% damage taken, 8 s) | 60–90 s |
| Group defensive (−20% for the group, 8 s) | 120–180 s |
| Battle revive | **5 min** (never below 3 min); no group limit on revives (canon W21, [page 05 §16.4](05-COMBAT.md#164-being-revived)) |

---

## 9. Forms, stances and aspects

`(new — Farhold has none)`

**Round 2 rule: a form, stance or aspect never gives the class a second bar.** It **transforms the six spells
in place**: the same six keys fire six different versions. (Canon W30 for the druid; the fighter and dragon
knight follow the same model.)

| Rule | Value |
|---|---|
| Versions | each of the six spells may have one **version per form/stance/aspect**. A version is a real, different spell — its own id (`<class>_<snake>`), name, numbers, shape, **tags** and **targeting kind** — not a number tweak. No version is shared with any other class |
| Keys | `Shift+1`–`4` pick the form/stance/aspect (max 4, including "none"); the keys `1`–`6` stay the same |
| Slot levels | a version unlocks with its slot (the Bear version of slot 4 arrives at 18) |
| Cooldowns | **a slot's cooldown is shared by all its versions**: casting the Bear version puts the slot on cooldown for every version, for the cooldown of the version you cast (so switching forms never doubles a cooldown) |
| Swapping | costs a 0.5 s GCD; allowed in combat |
| Talents | talents belong to the **slot**: one pick per tier per slot, and the talent's card says what it does to **each** version (the class file writes one line per version) — so the druid still has 24 picks at 60 |
| Resource | the class's one resource for every version (canon: the druid is Mana in every form). A version may cost less or more |
| Stats | a form may change armour, move speed, attack pattern (a bear strikes with a claw pattern: page 05 strike shapes), and the character model (Chibi 2 → creature body, `avatar-3d/js/creatures.js`, reuse) |
| Equipment | worn gear keeps giving its stats; weapon dice still set WD unless the form says "claws" (then the form gives WD from the character level: dice 4–8 × item-level growth at your level) |
| Guardian | a form or stance that is the class's tank version (druid Bear, fighter Defense) turns the Guardian state on only while the role focus is Tank |
| Death | dying ends every form, stance and aspect |
| Shown on | the class's state icon and the bar border colour ([§12](#12-class-mechanics-on-screen)) |

**Who has them:**

| Class | Kind | Versions | Notes |
|---|---|---|---|
| **Druid** | forms | **Grove** (the default, healing form), **Heron** (from level 6), **Bear** (from 20), **Wolf** (from 40) — four versions of each of the six spells, and the four versions of a slot **share one cooldown** | Grove is the primary Healer; Bear leans Tank (Guardian with Tank focus), Wolf Damage, Heron speed and healing on the move; no spell name borrowed from any other game (canon W30). A form's versions arrive when the form does (Bear's six at 20, as far as the slots are open) |
| **Fighter** | stances | Offense, Defense, Precision — three versions | Defense is the tank stance |
| **Dragon Knight** | aspects | fire, ice, storm — the class file decides whether each is a full version or a rider on the same spell; **Dragon Form** at 40 is a timed transformation with its own cooldown | canon |
| Priest, shaman, sorcerer, bard | not forms | the balance slider, the last storm-beast called, the wild-magic roll and the current song **change riders** on the spells without new versions | class files |
| **Demon Hunter** | **none** | no form, no gauge (canon W27) | — |

---

## 10. Pets: tamed, bound and controlled

`(new rules on reused parts: js/pets.js, js/followers.js, balance.pets)`

Canon 00 §6 and W32/W37: **no class summons a pet out of thin air.** A pet is a real creature from the world
that the class **tames**, **binds** or **controls**.

### 10.1 The kinds

| Kind | Classes | How you get it | Lasts | At 0 HP | Takes a party slot? |
|---|---|---|---|---|---|
| **Tamed beast** | ranger (**Tame Beast**) | tame a wild monster of the Beast family (§10.2) | **for good** — saved with the character | falls and stays down until the ranger's revive **ritual** (§11) | no |
| **Bound demon** | warlock (**Bind Demon**) | bind a Demon-family enemy you have just beaten (§10.2) | **for good** | falls and stays down until the warlock's **ritual** | no |
| **Controlled undead** | necromancer (**Control Undead**) | raise a fresh corpse that was **not** undead, or take over a living enemy tagged **Undead** | **temporary** (the class file sets it; typical 30–60 s) | control ends; it is dead | no |
| **Charmed enemy** | enchanter (**Charm**) | dominate a non-boss enemy | **temporary** (typical 20–40 s; the class file sets it) | control ends; it is dead | no |
| **Follower** (hired) | anyone, from level 8 | hire at a broker ([page 07](07-PROGRESSION.md)) | until dismissed | falls; rises 14 s after combat | **yes** |

**Not pets** (spell objects, with no pet frame, no commands and no revive): the tinker's sentry and Devices,
the stormcaller's lightning rods, the runesmith's runes, the knight's banner, the scavenger's junk builds, the
mage's decoy images, the enchanter's illusions, the shadow dancer's clones. They are tagged **Deployable**
(page 05 §22) and last as their spell says; threat from decoys is written on the spell.

### 10.2 Taming, binding and control

| Rule | Tame Beast (ranger) | Bind Demon (warlock) | Control Undead (necromancer) | Charm (enchanter) |
|---|---|---|---|---|
| Valid targets | a living monster with the **Beast** family tag (page 10), Normal or Champion rank, level ≤ yours; not a boss, rare, named or greater-rarity monster | a monster with the **Demon** family tag you (or your party) killed **in the last 10 s**, Normal/Champion/Elite, level ≤ yours; not a boss or rare | (a) a corpse that died in the last **30 s** and is **not** tagged Undead → it rises as an undead servant; (b) a **living** enemy tagged **Undead**, not a boss, rare or greater-rarity monster → it fights for you | a living non-boss enemy, not a rare or greater-rarity monster; elites in dungeons for half duration |
| Cast | a **utility** spell (no slot): an 8 s channel on a beast below 50% health; the beast attacks you while you channel; damage to you does not break it, damage to the beast from anyone does | a **utility** spell: a 3 s cast on the body | a class spell (on the bar) or the mechanic's key — the class file decides | a class spell on the bar |
| How many | 1 active; a **stable master** in any hub keeps up to 4 more to swap between (out of combat) | 1 active; the warlock's **binding circle** (any hub) keeps up to 4 more | 1 at a time (2 from calling III if the class file says so) | 1 at a time |
| Its level | follows yours | follows yours | the corpse's or enemy's level | the enemy's level |
| Its kit | the species gives its look and **one family ability** (page 10 families: wolves' bleed, bears' taunt-and-hold, cats' pounce…); the ranger's spells give the rest | the demon's kind gives its look and one ability; a "tank" demon kind can hold threat (the warlock's hybrid Tank role) | as the class file says | the enemy keeps its own attacks |
| Ends | never, until released | never, until released | its time runs out, it drops to 0, or you control another. A controlled **living undead** that runs out of time turns hostile again at its current health | as Control Undead: back to hostile at its current health |
| Breaking free | — | — | bosses and elites fill the break bar instead ([page 05 §11.4](05-COMBAT.md#114-bosses-the-break-bar)) | Charmed breaks after taking 50% of its max HP (page 05 §11.3) |

### 10.3 Pet rules `(reuse: js/pets.js, js/followers.js, balance.pets)`

| Rule | Value | Farhold |
|---|---|---|
| Scaling | a tamed or bound pet's stats follow its **owner's** level with the enemy curves (page 05 §19.2); controlled bodies keep their own | `perLevel 1.13` against enemy 1.13 (R22) |
| Damage cap | a pet or follower never hits for more than **75%** of the top of its owner's weapon swing | `FOLLOWER_SHARE_CAP 0.75` |
| Tags | every pet attack carries **Minion** plus its own kind, delivery and element (page 05 §22.4); "+N% damage with Minion" gear raises it | new |
| Leash | returns to you if more than **26 m** away | `pets.leash 26` |
| Follows at | 4.5 m | `pets.follow` |
| Engages | enemies within 22 m of you | `pets.engage` |
| Threat | ×0.5; a pet set to its tank behaviour (a bear, a tank demon) ×3 ([page 05 §13.2](05-COMBAT.md#132-wildmarch-the-threat-table-new)) | seconds-based attention |
| Enemies attack pets | yes, by the threat table | R22 `aimOf` |
| Revive | tamed/bound: only by the **ritual** (§11) or an ally's revive spell; controlled: never; followers: 14 s after combat, 50% HP | `pets.reviveSeconds 14` (kept for followers only) |
| Healing | pets can be healed (Needs target (ally) works on them) and are included in smart heals **after** players | new |
| Commands | **stance** (Aggressive / Defensive / Passive), **attack my target**, **come back**, **stay here** — on the pet bar above the skill bar (page 03), keys on page 02 §5.17: `,` (comma) tap = attack my target, hold = the order ring | new |
| Max alive per player | 1 permanent pet + 1 controlled body + followers; 6 bodies of every kind together in the open world; instances: §10.6 | `pets.maxAlive 6` |

### 10.4 Stances

| Stance | Behaviour |
|---|---|
| Aggressive | attacks anything that attacks you or that you attack, and anything hostile within 12 m |
| Defensive (default) | attacks what attacks you, or what you attack |
| Passive | never attacks; follows you; still takes hits |

### 10.5 What the class file writes about its pets

For each pet kind: its `id` pattern, the bodies it can take (Chibi 2 or creature type), health as a % of the
owner's max HP, its attack (pattern, % of owner WD or SP, **tags**), its own 1–3 abilities with numbers, what
the class mechanic does to it, how the three calling quests change it, and its revive ritual (§11).

### 10.6 Followers in the group

- **Every follower takes one of the group's 5 body slots** in a dungeon. Tamed, bound and controlled pets do not.
- Followers may queue in the **tank** or **healer** role for a Normal dungeon or moderate Depth when no player
  fills it (Shield Warden mercenary tanks; Field Mender heals — `data/mercenaries.json`, reuse). They play their
  role at the level of a competent but not perfect player: they dodge ground telegraphs **1.0 s** after they appear.
- **Challenge mode and Depth past the first tier over 60 do not allow followers** (canon pillar 6).
- **Pets versus boss mechanics (canon 00 §10, page 11 §12.3):** pets take no party slot, leave a danger zone
  0.6 s after it appears and a void zone after 0.5 s in one, never count toward soaks, and take 25% damage from
  room-wide hits. Followers take a party slot and **do** count toward soaks.

---

## 11. Utility spells

`(new — canon 00 §5 template item 6, 00 §6)`

A **utility spell** is a class spell that **uses no slot** on the bar. Utility spells are for **out of combat**:
travel, pet rituals, taming and binding. They follow every spell rule on this page except the slot — each has
an id (`<class>_<snake>`), a cast, a cooldown, a **targeting kind** and **tags** — and they have **no damage
or healing budget**: a utility spell never deals damage and never heals in combat.

| Rule | Value |
|---|---|
| Where they live | the **Utility** row of the spellbook (page 03), usable from there or from a separate 4-key utility bar (page 02 owns the keys; none bound by default) |
| When | out of combat only, unless the class file says otherwise (none of the four travel spells may be cast in combat) |
| How many | at most **4** per class |
| When learned | the four **travel spells at level 12**, with Travel Methods (page 07's ladder, page 20); pet rituals, Tame Beast and Bind Demon with the pet (Calling I at 6, or as the class file says); anything else as the class file says |
| GCD | off the GCD; cast times are real (they can be interrupted by entering combat) |

### 11.1 The four travel spells (canon 00 §6; page 20 owns the numbers)

These exist so that casters can **carry people to places they have not discovered** (canon W9): a dungeon
appears in the Dungeon Finder only after you have discovered its entrance, and **arriving somewhere by a
teleport counts as discovering it**.

| Spell | Class | What it does | Targeting | Tags |
|---|---|---|---|---|
| **Portal** | mage | opens a gate the party can step through to a **town waystone the mage has discovered**; party members who step through discover it | Self (the gate opens in front of the mage; the destination is picked from a list) | Spell · Travel · Duration |
| **Retrace** | chronomancer | returns the party to a spot **one of them** stood on in the last **10 minutes** | Self (the spot is picked from each member's recent trail) | Spell · Travel |
| **Guiding Call** | oracle | pulls **one party member** to the oracle — an *assisted teleport*; the member must accept; arriving there counts as discovering the place (so an oracle standing at a dungeon door can bring a friend to discover it) | Needs target (ally) — a party member, any distance | Spell · Travel |
| **Heron's Flight** | druid | the druid alone flies to **any waystone it has discovered** | Self | Spell · Travel · Movement |

Everyone else uses **scrolls** and the **Recall Stone** (page 20). No travel spell reaches a dungeon interior
or a place nobody in the party has discovered.

### 11.2 Pet rituals and binds

| Spell | Class | What it does | Targeting | Tags |
|---|---|---|---|---|
| **Tame Beast** | ranger | tames a wild beast (§10.2) | Needs target | Spell · Channel · Minion |
| ranger's revive ritual (the class file names it) | ranger | brings the fallen tamed beast back at full health; a 4 s cast beside its body or anywhere (the beast reappears at your side); no cost, no cooldown | Self | Spell · Revive · Minion |
| **Bind Demon** | warlock | binds a beaten demon (§10.2) | Needs target (its body) | Spell · Minion |
| warlock's rebinding ritual (the class file names it) | warlock | brings the fallen bound demon back at full health; 4 s cast; no cost, no cooldown | Self | Spell · Revive · Minion |

**No mass resurrection** exists (canon W35, parked in [WISHLIST.md](WISHLIST.md)). No utility spell revives a
player.

---

## 12. Class mechanics on screen

`(new — replaces round 1's "every class has a gauge above the bar")`

Round 1 gave every class a gauge. The owner's rulings take that back where it does not fit (the demon hunter
has **no gauge and no form**, W27), so: **a class shows a gauge only when its mechanic has a number the player
must track that is not already shown somewhere else** — the resource bar, the target frame, enemy nameplates or
the pet frame. The class file decides and says which.

### 12.1 Where a mechanic can show

| Place | Looks like | Classes (canon mechanics) |
|---|---|---|
| **Gauge above the bar** (320 × 36 px at 1080p, in the class colour) — pips | 3–8 round pips that fill | warrior Bulwark (block charges), mage Resonance, monk Breath, swashbuckler Flair, witch hunter Verdict, bard verses |
| Gauge — bar 0–100 | a horizontal bar with thresholds | cleric Devotion (banked shield), oracle Foresight |
| Gauge — slider −100…+100 | a bar with a centre notch | priest Light/Shadow balance |
| Gauge — slots | 2–4 icons that fill with a type | shaman Storm Tales (three tales + the last beast called), runesmith runes, tinker Devices, sorcerer's current wild-magic roll |
| Gauge — counter | a number with an icon | necromancer corpses nearby, scavenger junk, tactician Orders, shadow dancer clones |
| Gauge — timeline | a strip of the last 5 s | chronomancer's recorded ghost |
| **State icon** (on the bar's border) | an icon and a name | fighter stance, druid form, dragon knight aspect, paladin Oath, bard song, knight banner |
| **The resource bar itself** | markings drawn on the bar | pyromancer Heat (its Momentum bar, with an overheat zone — the pyromancer has **no mana bar** at all) |
| **Target frame / nameplates** | icons or counts on enemies | rogue Wounds (count + the eye icon), stormcaller Static, witch hunter Silver-Branded, ranger's marks, **demon hunter Demonsight** (marked demons, hidden enemies and weak points drawn on the enemies themselves) |
| **Pet frame** | a small frame under yours | ranger's tamed beast, warlock's bound demon, necromancer's controlled undead, enchanter's charmed enemy |

Every gauge has: a **tooltip** stating its rules in numbers (Farhold `WORDING.md`), an **empty state** that
says how to fill it, and a **sound** when it reaches a threshold (sfx id per class file, `sfx/js/sfx.js` reuse).

### 12.2 Before the first calling

Levels 1–5: a class whose mechanic arrives with Calling I shows its gauge or state **greyed out** with the line
"Your calling awaits at level 6." A class file may give a starter version at level 1 (the rogue's Blind Spots
work from the first swing).

### 12.3 Rules for class writers

- The mechanic must change **how you play**, not add a stat.
- It must be **readable by other players**: a visible effect on the character or the world (aura, form,
  banner, rods, clones, a mark on the enemy) so a group can see what a class is doing.
- It must work **solo** (with or without followers) and in a group.
- Its numbers follow the budget in [§8](#8-the-spell-power-budget): a mechanic's payoff is budgeted as part of
  the spells it empowers.
- Don't add a gauge just because other classes have one.

---

## 13. Calling quests

`(new; page 14 owns the quest text and the steps; class files own what each grants)`

| Calling | Level | Quest id | Giver | Where the trial is | Grants |
|---|---:|---|---|---|---|
| **I — The Calling** | 6 | `q_calling_<class>_1` | `npc_trainer_<class>` in the **Hall of Callings, Highcourt**; the call arrives as a letter by courier (`npc_ollin_courier`) wherever you are | a solo trial instance in Hearthvale or Highcourt | the class mechanic (or its full first form); for pet classes the first pet; an Uncommon class weapon (item level 7); unlock card |
| **II — The Proving** | 20 | `q_calling_<class>_2` | the same trainer (a letter arrives by mail at 20) | a class-specific place in regions 3–5 (class file names it) | the mechanic's second stage; a Rare class weapon or off-hand (item level 21); the title "*<name> the Proven <Class>*" |
| **III — The Mastery** | 40 | `q_calling_<class>_3` | a master of the class, somewhere in regions 6–8 | a class-specific trial with a named boss | the mechanic's third stage (e.g. Dragon Form, canon); an Epic class item with a class power (item level 42); the title "*Master <Class>*"; a class-coloured mount appearance |

Rules for all three:

- A calling is **answered alone**: followers stay outside the trial; group members cannot enter it.
- 3–6 steps: a conversation, a task that **teaches the mechanic by using it** (e.g. "bank 300 overheal
  into Devotion"), a trial fight that cannot be won without the mechanic, and a return.
- A calling may also teach the **hybrid role** (a step done in the hybrid role focus) — recommended for the
  classes whose hybrid is an unexpected crossbreed (mage Tank, pyromancer Healer, enchanter Tank…).
- Scaled to the level it is taken at (no higher than 5 levels above its level).
- Can be abandoned and restarted; the trial can be retried at no cost.
- Pays quest XP as a **calling** quest ([page 07 §Quest XP](07-PROGRESSION.md#quest-xp)).
- The trainer sells nothing and teaches nothing else — spells arrive by level ([§5.2](#52-how-a-spell-arrives)).

---

## 14. Talents

`(reuse idea: js/skilltalents.js — per-spell trees, one pick per tier, rules not numbers, visible changes)`

### 14.1 The tiers (canon)

| Tier | Opens at level | Guideline for what it changes (Farhold's tier meanings, kept) |
|---:|---:|---|
| 1 | **12** | how the spell is thrown: more projectiles, a different shape, a faster version, a charge |
| 2 | **22** | what happens when it lands: bursts, chains, leaves ground, deepens its status, drains |
| 3 | **32** | what it does to the fight: crits that spread, refunds on kill, barriers, marks, echoes |
| 4 | **45** | the plan: a combination that turns the spell into something else |

Farhold opened tiers at 3/8/18/28 (`TIER_LEVELS`, R22).

### 14.2 Rules

- **Four tiers × six spells = 24 picks** at level 60. Each tier offers **2 or 3** choices; you take **one**.
- A tier opens for a spell at **the later of** the tier's level and the spell's slot level: slot 4 (18) gets
  tier 1 at 18 and tier 2 at 22; slot 6 (40) gets tiers 1–3 at once at 40 and tier 4 at 45.
- **Every talent changes what the spell does**, never only a number (Farhold's rule: "a talent that read +10%
  fire damage would be an affix wearing a different hat"). A talent **may** carry a number *with* a rule
  change (Farhold's Fanned: "3 projectiles, each dealing 30% less damage").
- **A talent may add or remove tags** (a tier-1 pick that turns a bolt into a cone adds Area and removes
  Projectile); the card shows the new tags, and gear bonuses follow them.
- **Hybrid picks**: on at least three spells, each tier includes a choice that serves the hybrid role, marked
  with the role's icon on the node (§3.3).
- **No "better but slower" talents** (Farhold R11: Heavy, Overload and Widened were rewritten for that).
- **Every talent changes how the spell looks** (`fx` key), so a player can read another's build.
- Talent descriptions are **generated from the talent's numbers** (Farhold `describeMod`) — class files
  write the numbers and a short rule; the generator writes the card.
- Picking into an **empty** tier is free and instant. Changing a pick needs the **Unbinder**
  ([page 07 §Retraining](07-PROGRESSION.md#retraining); Farhold R20), or keep two builds with the **Second
  Loadout** (level 30).
- Forms, stances and aspects: the talent belongs to the slot and says what it does to each version (§9).
- A talent id is `<spellid>_t<tier><a|b|c>` (canon), e.g. `mage_fireball_t2b`.

### 14.3 Where talents are chosen

The **Talents** tab of the character screen (page 03): one column per spell on the bar, four rows (tiers),
2–3 nodes per cell, a green "Talent available" badge on any cell you may fill (Farhold R20 "Spell available"
card, reused). Hovering a node shows the spell's card **as it would read with that talent** (tags included).

---

## 15. Class sets

`(reuse: Emberveil/Farhold set machinery — rpg.setBonuses, legendaryPowers, loot.activeSets; new: class-only sets)`

### 15.1 The rule

- Every class has **at least two** class sets (canon). Ids `set_<class>_<snake>`.
- A class set has **six pieces**: head, chest, legs, hands, feet, and **one** of necklace or off-hand
  (class file chooses). Bonuses at **2, 4 and 6** pieces.
- A class set's bonuses work only for that class (another class may wear the pieces as plain armour). Pieces
  are **tradeable** like all loot (canon W18 — nothing is bound).
- **At least one of a class's sets supports its hybrid role** (its 4- or 6-piece changes a hybrid-role spell),
  so a hybrid build has a set to chase. The demon hunter's sets both serve its one role.
- What the bonuses do, by count:

| Pieces | Bonus type |
|---:|---|
| 2 | a stat line tied to the class (e.g. "+10% Heat generated") or a **tag bonus** that fits the kit (e.g. "+12% damage with Fire Spells") |
| 4 | **changes one spell** (a rule, like a talent that stacks with talents) |
| 6 | **changes the class mechanic**, or changes two spells together |

- Farhold's `cond_extraSetPiece` / `cond_setThresholdReduce` affixes ("counts as one more piece") keep working,
  capped at +1 (page 08).

### 15.2 The two (or more) sets every class gets

Item level is **1–60, the level needed** (canon W17) — there is no item level above 60.

| Set | Item level | Where it drops | Look |
|---|---:|---|---|
| **Set A — the Calling set** | 45 | Calling III (1 piece); the level 40–48 dungeons `d10_rimefang_caverns` and `d11_saltdeep_cathedral` on Normal (4 pieces, one boss each); a faction quartermaster at **Kindred** standing (1 token, [page 07](07-PROGRESSION.md)) | the class's colour, simple trims |
| **Set B — the Endgame set** | 60 | **Challenge mode** bosses of `d13_cindergate` to `d16_the_spire` (one piece per dungeon, weekly limit — canon W5) and the end chests at **Depth** past level 60 (page 12); the last piece from `d15_fire_court` on Challenge | elaborate, glowing trims |
| Set C (optional) | 60 | the secret boss of `d16_the_spire` on Challenge, or deep Depth only | the class's "final form" |

Page 09 indexes every class set; class files write the pieces and bonuses; pages 12 and 13 place the drops.

---

## 16. Class legendaries and uniques

`(reuse: rpg.legendaryPowers, js/effects.js power registry, js/uniques.js)`

- Every class file lists **2–4 class legendaries** (`leg_<snake>`), **2–4 class uniques** (`uq_<snake>`) and
  may list class **souls** (`soul_<snake>`, page 08 — a soul may require a class or build).
- A class legendary's power **only makes sense for that class** (it names a class spell or the mechanic).
  It can drop for anyone; the card says "Class: <name>" and the power works only for that class. Like all loot
  it is **tradeable**, sellable and salvageable (canon W18 — no binding).
- Every power is a registry entry with the same shape as Farhold's `U23` constants: **the card text and the
  hook read the same numbers** (Farhold R23 rule), and a test fails if a power has no reader.
- A power that raises damage names **tags** ("Fire Spells deal ×1.25") or a spell by name; it is a multiplier
  (page 05 §22.3 point 4).
- Drop weighting: a class legendary drops **3×** more often for a player of that class (smart loot, page 08).

---

## 17. Armour and weapon proficiency

### 17.1 Armour tiers

| Tier | Classes (count) | Armour target at even level ([page 05 §8.2](05-COMBAT.md#82-the-formula-new)) | Other rule |
|---|---|---|---|
| Cloth | 9 | 15% reduction | — |
| Light | 10 | 25% | — |
| Medium | 6 | 35% | — |
| Heavy | 5 | 50% | +15% max HP from the tier; −5% move speed with all four heavy pieces |

- You may wear **your tier and every lighter tier**. You cannot wear a heavier tier.
- **Class set bonuses** only count pieces of your own tier.
- Hybrid tanks in cloth or light armour (mage, warlock, enchanter, swashbuckler, shadow dancer) do not get
  heavier armour; their Tank role focus, their class defences (Wards, clones, parries, illusions, the bound
  demon) and CON carry them, within the 110–118% damage-taken target of §3.3.
- Shields: classes with "shield" in their weapon families (§2).

### 17.2 Weapons

- Trained families are listed in §2. An **untrained weapon cannot be equipped** (the card says "Your class
  is not trained in hammers." — Farhold `equipRefusal` pattern).
- Everyone may **dual wield** one-handers of families they are trained in (Farhold rule, canon); hand crossbows
  and throwing knives are one-handed.
- Everyone has a **tool** slot for the harvesting tool (canon 00 §4; page 19). There is no light slot.

---

## 18. Voices and barks

`(reuse: shared/voices.js voiceFor({ role, gender, seed }), Lingo, the formant engine)`

- Each class file names its **voice timbre** (the `role` passed to `voiceFor` — Farhold's party voices map a
  class/role to a timbre) and writes **barks** in Lingo templates: on cast of slots 4–6, on crit, at low
  health (below 25%), on kill of a rare/boss, on revive, on level up.
- Barks respect a per-player cooldown of **8 s** and the setting `set.audio.classBarks` (On / Own only / Off).
- No bark ever names another game's content.

---

## 19. Choosing a class

`(reuse: Farhold's class preview beside the 30-entry dropdown — R10 review; the figure from js/figure3d.js)`

The character-creation screen (`scr_create_character`, page 03) shows for the highlighted class:

| Field | Source |
|---|---|
| Name, role badges (**Primary** + **Hybrid**), build, armour, resource | §2 |
| Three-sentence identity | class file §1 |
| The mechanic in one sentence and one number | class file §2 |
| The six spells as icons with their slot levels (1/4/10/18/28/40), hover for the card (tags and targeting shown) | class file §3 |
| A difficulty rating (1–3 pips) | class file |
| A **live 3D figure** in the starting gear, playing slot 1 and slot 4 on a dummy | `js/figure3d.js` reuse |
| Filters | Role (primary or hybrid: Tank/Healer/Damage/Support), Build (melee/ranged/caster), Armour, Resource, "Has a pet" |

Race (Human, Elf, Dwarf, Halfling — canon) is a separate choice and **does not change stats** (Farhold R26
`js/bodypresets.js` presets are looks only).

---

## 20. Data shapes

Page 16 owns file names; the shapes the class system needs:

**A class** (`data/classes/<id>.json`):

```json
{
  "id": "mage", "name": "Mage", "role": "damage", "hybrid": ["tank"],
  "build": "caster", "armour": "cloth", "resource": "mana",
  "primary": "int", "secondary": "con",
  "weapons": ["staff", "wand", "focus"], "starter": { "weapon": "it_apprentice_staff" },
  "mechanic": { "id": "mage_resonance", "display": "pips", "max": 4 },
  "spells": ["mage_fireball", "mage_b", "mage_c", "mage_d", "mage_e", "mage_f"],
  "versions": {},
  "utility": ["mage_portal"],
  "pet": null,
  "callings": ["q_calling_mage_1", "q_calling_mage_2", "q_calling_mage_3"],
  "sets": ["set_mage_a", "set_mage_b"],
  "voice": { "role": "mage" }, "colour": "#b090ff", "difficulty": 2
}
```

`mechanic.display` is one of `pips | bar | slider | slots | counter | timeline | state | resource | target |
pet | none` (§12.1). A druid's `versions` maps a form to the six version ids:
`{ "bear": ["druid_a_bear", …], "wolf": […], "heron": […] }`. `pet` is `null`, `"tamed"`, `"bound"` or
`"controlled"`.

**A spell** (`data/spells/<class>.json`, one entry per spell or version; extends Farhold's `data/skills.json` row):

```json
{
  "id": "mage_fireball", "name": "Fireball", "slot": 1, "slotLevel": 1,
  "cost": { "mana": 60 }, "cooldown": 0, "gcd": true,
  "cast": { "type": "cast", "seconds": 1.5 },
  "targeting": "auto",
  "range": 34, "shape": { "kind": "target", "projectile": { "speed": 40 }, "splash": 1.5 },
  "tags": ["tag_spell", "tag_ranged", "tag_projectile", "tag_fire"],
  "parts": [{ "element": "fire", "of": "sp", "coefficient": 2.05 }],
  "statuses": [{ "id": "burn", "total": 0.40, "of": "hit" }],
  "flags": { "offGcd": false, "hybridRole": null },
  "fx": { "element": "fire", "shape": "bolt" }, "sfx": "fire_launch",
  "talents": {
    "1": ["mage_fireball_t1a", "mage_fireball_t1b"],
    "2": ["mage_fireball_t2a", "mage_fireball_t2b", "mage_fireball_t2c"],
    "3": ["..."], "4": ["..."]
  }
}
```

A version row adds `"versionOf": "druid_a", "form": "bear"`. A utility spell has `"slot": null, "utility": true`.
Validation (page 16 tests): every spell has `targeting`; every spell has exactly one of `tag_attack` /
`tag_spell`; every damage part's element has its tag; no spell id appears in two classes.

**A talent**:

```json
{ "id": "mage_fireball_t1a", "spell": "mage_fireball", "tier": 1, "name": "Split Fireball",
  "mod": { "projectiles": 3, "spread": 0.38, "coefficientMult": 0.7 },
  "tagsAdd": [], "tagsRemove": [], "hybridRole": null, "fx": "fan" }
```

**A pet** (tamed beast / bound demon, saved with the character):

```json
{ "kind": "tamed", "species": "m_beast_grey_wolf", "name": "Ash", "ability": "pet_wolf_hamstring",
  "stance": "defensive", "alive": true }
```

---

## 21. What is reused from Farhold

| Farhold file | What Wildmarch keeps | What changes |
|---|---|---|
| `data/classes.json` | the 30 ids, names, looks, weapon lists, starting weapon | primary/hybrid roles, build, armour and resource from canon; attributes; spells replaced by bespoke spells |
| `data/skills.json` + `js/skills.js` | the bar model, cooldowns, cost refusal messages, the **description generator**, the status table (moved to page 05), `effectiveMult` as a design formula | Farhold's 40 shared skills become **visual references only** (canon: "spells are new"); slots 1/4/10/18/28/40; tags and targeting on every spell |
| `js/skilltalents.js` | per-spell trees, one pick per tier, generated text, fx per talent, the refusal to re-pick a spent tier | tiers at 12/22/32/45; bespoke talents per class; talents may change tags |
| `js/pets.js`, `js/followers.js`, `data/mercenaries.json` | companions' bodies and AI, mercenaries, the 75% damage cap, leash, the follower revive timer | no summons; tame / bind / control rules; revive rituals; threat table, stances, group body slots |
| `js/retrain.js` | the Unbinder | prices for 60 levels ([page 07](07-PROGRESSION.md#retraining)); spells not retrainable; the Second Loadout |
| `js/foci.js` | caster off-hand foci | available to every INT caster; quivers work the same way for bows (page 08) |
| `js/classbuild.js` (custom class) | nothing in v2 | parked (canon) |
| `shared/voices.js` | class voice timbres | — |

---

## 22. Open questions

1. **Role focus passives** (+10% HP/armour, +10% healing, +5% damage, +10% buff strength) — is a small role
   passive wanted, or should role be only a Dungeon Finder label? (Recommendation: keep; it is also the switch
   that turns a hybrid tank's Guardian state on.)
2. **Followers in Normal dungeons can queue as tank/healer.** Is it acceptable that a solo player's dungeon is
   tanked by a mercenary?
3. **Hybrid tuning at 85–90%, measured by the simulator.** Recommendation: hold it as a hard test (a class
   outside 80–95% in its hybrid role fails the build), so a hybrid never quietly becomes a trap or the best
   choice.
4. **The Dungeon Finder "prefers" a primary tank/healer in Challenge mode** (it never refuses a hybrid). Would
   you rather it treat them exactly the same everywhere?
5. **Stable of 5 tamed beasts / bound demons** (1 active + 4 kept at a hub). Recommendation: keep — the ranger's
   "a beast of your choice" becomes a collection.
6. **Tinker primary DEX** (Farhold had INT) — confirm.

*(Resolved and removed: Challenge and Tend the Fallen as shared verbs — both on page 07's ladder, the taunt now
named Provoke; class legendaries dropping for other classes — yes, and tradeable, canon W18.)*
