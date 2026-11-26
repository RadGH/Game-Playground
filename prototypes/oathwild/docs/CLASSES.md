# Oathwild — classes

Owner 2026-11-23: *"Review the spells in Thousandvale and Emberveil and reuse a lot of what we already had. We could
probably go up to 30 classes in total. I think we should consolidate them down and keep what's most interesting."*
Then: unlimited classes per character with *"no guard at all"*; specialty (prestige) classes like Neverwinter
Nights 2's, with original names; Titan Quest-style ranked spells and modifiers bought with class points; Pathfinder
choices at class levels; the druid shapeshifts into real animals or goes summoner or caster.

**27 classes**: 8 base (open at creation), 13 advanced (unlocked, full 10-level trees; 8 reachable in round 1, 5 wait
for a later round's level cap or content) and 6 specialty (unlocked, 5-level trees with a signature ability).
Every tree is built from the source games' spells wherever one fits (127 of the 171 spells in the trees are
Farhold / Thousandvale rows used by id; 2 more are reworked rows — Wolf Shape and Bear Shape), with ranks and
modifiers added; 42 new Oathwild spells fill gaps (party heals, the Ring of Dawn, the new specialty classes). How the trees work: `docs/RULES.md`. The trees below are generated from
`data/classes.json` by `node tools/classes-md.mjs --write`.

## Consolidation — every source class

Sources: Farhold's 30 classes (`farhold/data/classes.json`; Emberveil's 30 are the same list in turn-based form, its
spells were rebuilt as Farhold's), Thousandvale's 2 extra (`thousandvale/data/rules/classes-tv.json`), and
Thousandvale's healer/revive additions (`skills-tv.json`).

| Source class | Became | Why |
|---|---|---|
| Warrior | **Warrior** (base) | The core fighter. Absorbs Knight's shield kit and Fighter's big single blows as its two paths. |
| Fighter | merged → **Warrior** (Reaver path: Precise Strike), **Duelist** (Lunge, Master's Flurry), **Bladesworn** | Too close to Warrior as its own class; its duelling half is the Duelist, its weapon-mastery half the Bladesworn. |
| Knight | merged → **Warrior** (Bulwark path: Rim Strike, Challenge) and **Paladin** (Sentinel path) | A shield tank is a Warrior path; the sworn-holy side is the Paladin's. |
| Paladin | **Paladin** (advanced) | Owner's example: Paladin 2 opens plate armour (Strength 15). Warrior 3 + Cleric 1 + Str 14 + Wis 12. |
| Ranger | **Ranger** (base) | Kept: bow, traps, mobility. |
| Rogue | **Rogue** (base) | Kept; dual wields. Its assassin side also feeds the Gravecutter specialty. |
| Cleric | **Cleric** (base) | The party healer (new aimed ally heal, Ring of Dawn holy ground, a revive). |
| Priest | merged → **Cleric** (Dusk path: Shadow Lance, Mark the Killer, Twinlight) | Holy/shadow priest is a Cleric path, not a second healer class. |
| Bard | **Bard** (base) | Kept as the Charisma class: songs for the party. |
| Tactician | merged → **Bard** (Valour path: Lead the Charge, Rally) | "Buff the party, lead the charge" is the Bard's Valour path. |
| Enchanter | merged → **Bard** (Glamour path: Drowse, Lethargy) | Sleep and slow fit the Bard. Beguile / Grand Enthrallment (turning enemies) dropped for round 1 — the sim has no charm yet. |
| Mage | **Mage** (base) | Frost and arcane. |
| Sorcerer | merged → **Mage** (Arcane path: Wild Bolt, Arcane Burst, Mana Rend, Overchannel) | A second raw-arcane caster was a near-duplicate. |
| Pyromancer | **Pyromancer** (advanced) | Fire is distinct enough (burning ground, falling stone). Mage 3 + Int 14. |
| Stormcaller | **Stormcaller** (advanced) | Forking lightning. Mage 2 + Shaman 2. |
| Necromancer | **Necromancer** (advanced) | Thralls and blight. Mage 2 + the tome hidden in the barrow. |
| Warlock | **Warlock** (advanced) | Pact caster with a bound fiend (an imp — a real body). Mage 3 + a pact found in the Wilds. |
| Druid | **Druid** (base) | Three real directions (owner): **Shapeshifter** (Wolf Shape from Thousandvale's Moonpelt, a new Bear Shape; Pack Leader: the wolf shape calls wolves — owner report #8), **Summoner** (Call the Pack, Call the Great Bear), **Caster** (Thornlash, Rootgrasp, Silver Moonlight). |
| Shaman | **Shaman** (base) | Spirit posts and storm; a Wisdom/Strength hybrid. |
| Monk | renamed → **Wayfarer** (advanced) | The PLAN's monk-like Wayfarer. Rogue 2 + Druid 2 + Dex 14. |
| Witch Hunter | **Witch Hunter** (advanced) | Anti-magic hunter. Ranger 2 + Cleric 1. |
| Demon Hunter | merged → **Witch Hunter** (Slayer path: Brand Bolt, Chain Hook) | Two "specialist killer" classes became one with two paths. |
| Runesmith | merged → **Spellblade** (Runeblade path: Rune Hammer, The Great Anvil, Runeskin, Rend Plate) | The rune-forged warrior is the Spellblade's first path. |
| Shadow Dancer | **Shadowdancer** (specialty) | Short prestige tree: Shade Cut, Umbral Step, Cutting Waltz, Assassinate. Rogue 4 + Sneak 30. |
| Swashbuckler | merged → **Duelist** (specialty) | Flourish, Pinning Thrust, Matador's Turn. Warrior 2 + Rogue 2 + Dex 13. |
| Dragon Knight | **Dragon Knight** (advanced, later round) | Warrior 5 + Pyromancer 3 + Str 15 + level 12: past round 1's cap. Tree written. |
| Chronomancer | **Chronomancer** (advanced, later round) | Mage 5 + Enchanting 50 + the broken sundial. Several of its rules (rewind, stasis) need sim work first. |
| Oracle | **Oracle** (advanced, later round) | Cleric 5 + Wis 16 + the seer's pool. Its wards need sim work first. |
| Tinker | **Tinker** (advanced, later round) | Rogue 3 + Smithing 40 — Smithing opens with the forge in a later round. |
| Scavenger | merged → **Tinker** (Scrounger path: Junk Toss) | Junk and luck are the Tinker's other half. |
| Starcaller (Thousandvale) | **Starcaller** (advanced, later round) | Mage 5 + a fallen star + level 14. |
| Star Blade (Thousandvale) | merged → **Starcaller** (Starblade path: Starcut, Comet Rush) | Same starlight theme, two paths of one class. |
| *(new)* | **Spellblade** (advanced) | Requested in the PLAN: Warrior 2 + Mage 2 + Int 13. Blade-and-spell blend power (half weapon, half spell). |
| *(new, NWN2-style)* | **Spellfletcher** (specialty) | Arrows that carry spells (an original take on the arcane archer). Ranger 3 + Mage 2 + Dex 14. |
| *(new, NWN2-style)* | **Bladesworn** (specialty) | Weapon master. Warrior 4 + the Weapon Focus talent. |
| *(new, NWN2-style)* | **Wrathborn** (specialty) | Berserker. Warrior 3 + Str 14 + Con 14. |
| *(new, NWN2-style)* | **Gravecutter** (specialty) | Assassin found through a contract in the Wilds. Rogue 3 + Sneak 25 + the contract. |

Spells left out of round 1 (the sim cannot run their core rule yet; they stay in Farhold's data for later): Guardian
Light (a wisp — lessons rule 72), Beguile, Grand Enthrallment, Phantasm, Rewind, Stop the Clock, Transmute, the
Bard's toggled songs as toggles (they became timed party songs), every Farhold `resource` / `afterimage` / `consumes`
/ `bonusIf` rule (rows keep their damage and statuses; the extra rule is dropped and never described).

## How a class is built (plain words — full rules in RULES.md)

- A class level gives the class's health, mana and attribute growth and **2 points for that class only**.
- Nodes open at class levels: spells (ranks 1–3), passives (ranks), training (armour / weapons), and **modifiers**
  that change how one of the class's spells works (Wide Arc, Pack Leader, Splinter…).
- Rank 2 of a node needs 2 more class levels than rank 1, rank 3 another 2 — so depth is what unlocks power.
- At class level 3 a base or advanced class chooses a **path**; path nodes are only for that path.
- The last level holds the **capstone**: two options, pick one.
- A spell gets +5% for every level of the class it came from — a level-10 Mage's Frost Shard hits harder than a
  level-2 dip's.
- No limit on how many classes a character takes, and no spreading penalty (owner: "no guard at all").
  `tests/rules/combat.test.mjs` prints how focused, two-class and five-class builds compare, as information.

## The trees

<!-- trees -->
### Warrior — Base
Steel, nerve and a shield or a great blade. The toughest body in the party. *Requires:* open at creation. *Growth a level:* +12 health, +2 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Cleave *(melee)* | spell, free |  |  |
| 1 | Sword Training (sword) | training, free |  |  |
| 1 | Shield Training (shield) | training, free |  |  |
| 1 | Mail Armour (mail) | training, free |  |  |
| 1 | Axe Training (axe) | training |  |  |
| 1 | Mace Training (mace) | training |  |  |
| 1 | Two-Handed Training (twohand) | training |  |  |
| 2 | Shield Bash *(melee)* | spell |  |  |
| 2 | Charge *(dash)* | spell |  |  |
| 2 | Dual Wielding (dualWield) | training |  |  |
| 2 | Spear Training (spear) | training |  |  |
| 3 | Whirlwind *(around)* | spell |  |  |
| 3 | Sword Mastery | passive | Sword Training |  |
| 3 | Axe Mastery | passive | Axe Training |  |
| 3 | Mace Mastery | passive | Mace Training |  |
| 3 | Two-Handed Mastery | passive | Two-Handed Training |  |
| 4 | Cleave II *(melee)* | spell | Cleave |  |
| 4 | Shield Bash II *(melee)* | spell | Shield Bash |  |
| 4 | Charge II *(dash)* | spell | Charge |  |
| 4 | Plate Armour (plate) | training | Mail Armour |  |
| 4 | Heavy Blows | passive |  |  |
| 5 | Ground Slam *(around)* | spell |  |  |
| 5 | War Cry *(self)* | spell |  |  |
| 5 | Whirlwind II *(around)* | spell | Whirlwind |  |
| 5 | Wide Cleave | modifier of Cleave | Cleave |  |
| 6 | Leap Strike *(leap)* | spell |  |  |
| 6 | Ground Slam II *(around)* | spell | Ground Slam |  |
| 6 | Brute Strength | passive |  |  |
| 6 | Bleeding Spin | modifier of Whirlwind | Whirlwind |  |
| 6 | Toughness | passive |  |  |
| 7 | Cleave III *(melee)* | spell | Cleave II |  |
| 7 | Shield Bash III *(melee)* | spell | Shield Bash II |  |
| 7 | Leap Strike II *(leap)* | spell | Leap Strike |  |
| 7 | War Cry II *(self)* | spell | War Cry |  |
| 7 | Killer Instinct | passive |  |  |
| 8 | Whirlwind III *(around)* | spell | Whirlwind II |  |
| 8 | Charge III *(dash)* | spell | Charge II |  |
| 8 | Shockwave | modifier of Ground Slam | Ground Slam |  |
| 8 | Relentless | passive |  |  |
| 9 | Ground Slam III *(around)* | spell | Ground Slam II |  |
| 9 | Leap Strike III *(leap)* | spell | Leap Strike II |  |
| 9 | Weapon Master | passive |  |  |
| 9 | Crater | modifier of Leap Strike | Leap Strike |  |
| 10 | Earthquake *(beam)* | spell |  | capstone (pick one) |
| 10 | Berserk *(self)* | spell |  | capstone (pick one) |

### Ranger — Base
Long shots, quick feet and traps laid where the enemy will walk. *Requires:* open at creation. *Growth a level:* +8 health, +4 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Multi Shot *(melee)* | spell, free |  |  |
| 1 | Bow Training (bow) | training, free |  |  |
| 1 | Leather Armour (leather) | training, free |  |  |
| 1 | Piercing Shot *(beam)* | spell |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 1 | Axe Training (axe) | training |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 1 | Crossbow Training (crossbow) | training |  |  |
| 2 | Explosive Arrow *(ground)* | spell |  |  |
| 2 | Hunter's Leap *(leap)* | spell |  |  |
| 2 | Dual Wielding (dualWield) | training |  |  |
| 2 | Spear Training (spear) | training |  |  |
| 3 | Snare Trap *(ground)* | spell |  |  |
| 3 | Bow Mastery | passive | Bow Training |  |
| 3 | Crossbow Mastery | passive | Crossbow Training |  |
| 3 | Sword Mastery | passive | Sword Training |  |
| 3 | Sharp Eyes | passive |  |  |
| 4 | Multi Shot II *(melee)* | spell | Multi Shot |  |
| 4 | Piercing Shot II *(beam)* | spell | Piercing Shot |  |
| 4 | Volley *(ground)* | spell |  |  |
| 4 | Mail Armour (mail) | training | Leather Armour |  |
| 5 | Explosive Arrow II *(ground)* | spell | Explosive Arrow |  |
| 5 | Eagle Eye *(self)* | spell |  |  |
| 5 | Marksman | passive |  |  |
| 5 | Wide Spread | modifier of Multi Shot | Multi Shot |  |
| 6 | Volley II *(ground)* | spell | Volley |  |
| 6 | Hunter's Leap II *(leap)* | spell | Hunter's Leap |  |
| 6 | Swift Feet | passive |  |  |
| 6 | Fire Arrows | modifier of Volley | Volley |  |
| 7 | Multi Shot III *(melee)* | spell | Multi Shot II |  |
| 7 | Piercing Shot III *(beam)* | spell | Piercing Shot II |  |
| 7 | Snare Trap II *(ground)* | spell | Snare Trap |  |
| 7 | Deadly Aim | passive |  |  |
| 8 | Explosive Arrow III *(ground)* | spell | Explosive Arrow II |  |
| 8 | Quick Hands | passive |  |  |
| 8 | Quick Draw | passive |  |  |
| 8 | Cluster Arrow | modifier of Explosive Arrow | Explosive Arrow |  |
| 9 | Volley III *(ground)* | spell | Volley II |  |
| 9 | Snare Trap III *(ground)* | spell | Snare Trap II |  |
| 9 | Hunter's Leap III *(leap)* | spell | Hunter's Leap II |  |
| 9 | Dagger Mastery | passive | Dagger Training |  |
| 9 | Killer Shots | passive |  |  |
| 10 | Rain of Arrows *(ground)* | spell |  | capstone (pick one) |
| 10 | Siege Arrow *(ground)* | spell |  | capstone (pick one) |

### Rogue — Base
Strikes from where you aren't looking, poison on every edge. *Requires:* open at creation. *Growth a level:* +9 health, +3 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Fan of Knives *(around)* | spell, free |  |  |
| 1 | Dagger Training (dagger) | training, free |  |  |
| 1 | Leather Armour (leather) | training, free |  |  |
| 1 | Eviscerate *(melee)* | spell |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 1 | Axe Training (axe) | training |  |  |
| 1 | Crossbow Training (crossbow) | training |  |  |
| 2 | Shadow Step *(leap)* | spell |  |  |
| 2 | Poison Cloud *(ground)* | spell |  |  |
| 2 | Dagger Mastery | passive | Dagger Training |  |
| 2 | Mace Training (mace) | training |  |  |
| 3 | Blade Rush *(dash)* | spell |  |  |
| 3 | Sword Mastery | passive | Sword Training |  |
| 3 | Axe Mastery | passive | Axe Training |  |
| 3 | Poisoner | passive |  |  |
| 3 | Cold Blood | passive |  |  |
| 4 | Fan of Knives II *(around)* | spell | Fan of Knives |  |
| 4 | Eviscerate II *(melee)* | spell | Eviscerate |  |
| 4 | Smoke Bomb *(ground)* | spell |  |  |
| 4 | Light Feet | passive |  |  |
| 5 | Shadow Step II *(leap)* | spell | Shadow Step |  |
| 5 | Poison Cloud II *(ground)* | spell | Poison Cloud |  |
| 5 | Backstabber | passive |  |  |
| 5 | Toxic Blades | modifier of Fan of Knives | Fan of Knives |  |
| 6 | Blade Rush II *(dash)* | spell | Blade Rush |  |
| 6 | Smoke Bomb II *(ground)* | spell | Smoke Bomb |  |
| 6 | Vital Spots | passive |  |  |
| 6 | Deep Cuts | modifier of Eviscerate | Eviscerate |  |
| 7 | Fan of Knives III *(around)* | spell | Fan of Knives II |  |
| 7 | Eviscerate III *(melee)* | spell | Eviscerate II |  |
| 7 | Poison Cloud III *(ground)* | spell | Poison Cloud II |  |
| 7 | Quick Blades | passive |  |  |
| 8 | Shadow Step III *(leap)* | spell | Shadow Step II |  |
| 8 | Blade Rush III *(dash)* | spell | Blade Rush II |  |
| 8 | Quick Recovery | passive |  |  |
| 8 | Spreading Cloud | modifier of Poison Cloud | Poison Cloud |  |
| 9 | Smoke Bomb III *(ground)* | spell | Smoke Bomb II |  |
| 9 | Killer Edge | passive |  |  |
| 9 | Hard Landing | modifier of Shadow Step | Shadow Step |  |
| 10 | Knife Storm *(around)* | spell |  | capstone (pick one) |
| 10 | Assassinate *(leap)* | spell |  | capstone (pick one) |

### Mage — Base
Fireballs that blow enemies off their feet, ice that bursts from the ground, lightning from the sky. Fragile, and devastating from range. *Requires:* open at creation. *Growth a level:* +5 health, +9 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Fireball *(bolt)* | spell, free |  |  |
| 1 | Staff Training (staff) | training, free |  |  |
| 1 | Ice Spikes *(beam)* | spell |  |  |
| 1 | Wand Training (wand) | training |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 2 | Frost Nova *(around)* | spell |  |  |
| 2 | Teleport *(leap)* | spell |  |  |
| 2 | Orb Training (orb) | training |  |  |
| 2 | Tome Training (tome) | training |  |  |
| 3 | Arcane Blast *(melee)* | spell |  |  |
| 3 | Fire Study | passive |  |  |
| 3 | Frost Study | passive |  |  |
| 3 | Arcane Study | passive |  |  |
| 3 | Wand Mastery | passive | Wand Training |  |
| 3 | Staff Mastery | passive | Staff Training |  |
| 4 | Fireball II *(bolt)* | spell | Fireball |  |
| 4 | Ice Spikes II *(beam)* | spell | Ice Spikes |  |
| 4 | Blizzard *(ground)* | spell |  |  |
| 4 | Deep Mana | passive |  |  |
| 5 | Lightning Strike *(ground)* | spell |  |  |
| 5 | Frost Nova II *(around)* | spell | Frost Nova |  |
| 5 | Lightning Study | passive |  |  |
| 5 | Big Fireball | modifier of Fireball | Fireball |  |
| 6 | Arcane Blast II *(melee)* | spell | Arcane Blast |  |
| 6 | Blizzard II *(ground)* | spell | Blizzard |  |
| 6 | Spell Power | passive |  |  |
| 6 | Frozen Ground | modifier of Frost Nova | Frost Nova |  |
| 7 | Lightning Strike II *(ground)* | spell | Lightning Strike |  |
| 7 | Ice Spikes III *(beam)* | spell | Ice Spikes II |  |
| 7 | Fireball III *(bolt)* | spell | Fireball II |  |
| 7 | Sharp Mind | passive |  |  |
| 8 | Frost Nova III *(around)* | spell | Frost Nova II |  |
| 8 | Forked Lightning | modifier of Lightning Strike | Lightning Strike |  |
| 8 | Quick Casting | passive |  |  |
| 8 | Glass Cannon | passive |  |  |
| 9 | Arcane Blast III *(melee)* | spell | Arcane Blast II |  |
| 9 | Blizzard III *(ground)* | spell | Blizzard II |  |
| 9 | Lightning Strike III *(ground)* | spell | Lightning Strike II |  |
| 9 | Overload | passive |  |  |
| 10 | Meteor *(ground)* | spell |  | capstone (pick one) |
| 10 | Deep Freeze *(around)* | spell |  | capstone (pick one) |

### Cleric — Base
A mace and the light: lances of sun, pillars that slam down from the sky, a holy blast that flattens what is round you. One heal, one revive. *Requires:* open at creation. *Growth a level:* +8 health, +7 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Sunlance *(beam)* | spell, free |  |  |
| 1 | Mace Training (mace) | training, free |  |  |
| 1 | Shield Training (shield) | training, free |  |  |
| 1 | Leather Armour (leather) | training, free |  |  |
| 1 | Mail Armour (mail) | training, free |  |  |
| 1 | Heal *(bolt)* | spell |  |  |
| 1 | Staff Training (staff) | training |  |  |
| 1 | Sceptre Training (scepter) | training |  |  |
| 2 | Smite *(ground)* | spell |  |  |
| 2 | Revive *(self)* | spell |  |  |
| 2 | Mace Mastery | passive | Mace Training |  |
| 2 | Two-Handed Training (twohand) | training |  |  |
| 3 | Holy Nova *(around)* | spell |  |  |
| 3 | Holy Power | passive |  |  |
| 3 | Sceptre Mastery | passive | Sceptre Training |  |
| 3 | Staff Mastery | passive | Staff Training |  |
| 4 | Sunlance II *(beam)* | spell | Sunlance |  |
| 4 | Smite II *(ground)* | spell | Smite |  |
| 4 | Holy Ground *(ground)* | spell |  |  |
| 4 | Plate Armour (plate) | training | Mail Armour |  |
| 5 | Divine Hammer *(beam)* | spell |  |  |
| 5 | Holy Nova II *(around)* | spell | Holy Nova |  |
| 5 | Heal II *(bolt)* | spell | Heal |  |
| 5 | Zeal | passive |  |  |
| 6 | Holy Ground II *(ground)* | spell | Holy Ground |  |
| 6 | Blinding Light | modifier of Sunlance | Sunlance |  |
| 6 | Faith | passive |  |  |
| 6 | Devotion | passive |  |  |
| 7 | Sunlance III *(beam)* | spell | Sunlance II |  |
| 7 | Smite III *(ground)* | spell | Smite II |  |
| 7 | Divine Hammer II *(beam)* | spell | Divine Hammer |  |
| 7 | Righteous Strikes | passive |  |  |
| 8 | Holy Nova III *(around)* | spell | Holy Nova II |  |
| 8 | Double Smite | modifier of Smite | Smite |  |
| 8 | Quick Prayers | passive |  |  |
| 9 | Holy Ground III *(ground)* | spell | Holy Ground II |  |
| 9 | Divine Hammer III *(beam)* | spell | Divine Hammer II |  |
| 9 | Heal III *(bolt)* | spell | Heal II |  |
| 9 | Light Unbound | passive |  |  |
| 10 | Judgement *(ground)* | spell |  | capstone (pick one) |
| 10 | Wrath of Light *(self)* | spell |  | capstone (pick one) |

### Druid — Base
Becomes the wolf, the bear or the mountain cat, calls wolves to the fight, and throws thorns and tornadoes. *Requires:* open at creation. *Growth a level:* +8 health, +6 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Thorn Blast *(melee)* | spell, free |  |  |
| 1 | Staff Training (staff) | training, free |  |  |
| 1 | Leather Armour (leather) | training, free |  |  |
| 1 | Wolf Shape *(self)* | spell |  |  |
| 1 | Bear Shape *(self)* | spell |  |  |
| 1 | Cat Shape *(self)* | spell |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 1 | Mace Training (mace) | training |  |  |
| 2 | Grasping Roots *(ground)* | spell |  |  |
| 2 | Pounce *(leap)* | spell |  |  |
| 2 | Roar *(around)* | spell |  |  |
| 2 | Spear Training (spear) | training |  |  |
| 3 | Call Wolves *(summon)* | spell |  |  |
| 3 | Tornado *(ground)* | spell |  |  |
| 3 | Staff Mastery | passive | Staff Training |  |
| 3 | Wild Power | passive |  |  |
| 4 | Thorn Blast II *(melee)* | spell | Thorn Blast |  |
| 4 | Pounce II *(leap)* | spell | Pounce |  |
| 4 | Roar II *(around)* | spell | Roar |  |
| 4 | Healing Bloom *(ground)* | spell |  |  |
| 5 | Grasping Roots II *(ground)* | spell | Grasping Roots |  |
| 5 | Tornado II *(ground)* | spell | Tornado |  |
| 5 | Thick Hide | passive |  |  |
| 5 | Pack Leader | modifier of Wolf Shape | Wolf Shape |  |
| 6 | Call Bear *(summon)* | spell |  |  |
| 6 | Call Wolves II *(summon)* | spell | Call Wolves |  |
| 6 | Feral Strength | passive |  |  |
| 6 | Thorn Spray | modifier of Thorn Blast | Thorn Blast |  |
| 7 | Thorn Blast III *(melee)* | spell | Thorn Blast II |  |
| 7 | Pounce III *(leap)* | spell | Pounce II |  |
| 7 | Roar III *(around)* | spell | Roar II |  |
| 7 | Predator | passive |  |  |
| 8 | Tornado III *(ground)* | spell | Tornado II |  |
| 8 | Grasping Roots III *(ground)* | spell | Grasping Roots II |  |
| 8 | Quick Change | passive |  |  |
| 8 | Thunder Roar | modifier of Roar | Roar |  |
| 9 | Call Wolves III *(summon)* | spell | Call Wolves II |  |
| 9 | Alpha | passive |  |  |
| 9 | Nature's Wrath | passive |  |  |
| 9 | Big Cat | modifier of Cat Shape | Cat Shape |  |
| 10 | Stampede *(dash)* | spell |  | capstone (pick one) |
| 10 | Great Storm *(ground)* | spell |  | capstone (pick one) |

### Bard — Base
Blasts of sound that knock crowds flat, a lullaby for the ones left standing, and a song that lifts the party. *Requires:* open at creation. *Growth a level:* +7 health, +6 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Sound Blast *(melee)* | spell, free |  |  |
| 1 | Sword Training (sword) | training, free |  |  |
| 1 | Leather Armour (leather) | training, free |  |  |
| 1 | Sour Note *(ground)* | spell |  |  |
| 1 | Healing Song *(self)* | spell |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 1 | Bow Training (bow) | training |  |  |
| 2 | Power Chord *(around)* | spell |  |  |
| 2 | Dancing Blade *(dash)* | spell |  |  |
| 2 | Sword Mastery | passive | Sword Training |  |
| 2 | Axe Training (axe) | training |  |  |
| 3 | Lullaby *(ground)* | spell |  |  |
| 3 | Battle Hymn *(self)* | spell |  |  |
| 3 | Strong Voice | passive |  |  |
| 3 | Dagger Mastery | passive | Dagger Training |  |
| 4 | Sound Blast II *(melee)* | spell | Sound Blast |  |
| 4 | Power Chord II *(around)* | spell | Power Chord |  |
| 4 | Sour Note II *(ground)* | spell | Sour Note |  |
| 4 | Dual Wielding (dualWield) | training |  |  |
| 5 | Dancing Blade II *(dash)* | spell | Dancing Blade |  |
| 5 | Healing Song II *(self)* | spell | Healing Song |  |
| 5 | Showman | passive |  |  |
| 5 | Wide Blast | modifier of Sound Blast | Sound Blast |  |
| 6 | Lullaby II *(ground)* | spell | Lullaby |  |
| 6 | Battle Hymn II *(self)* | spell | Battle Hymn |  |
| 6 | Fast Fingers | passive |  |  |
| 6 | Echo | modifier of Power Chord | Power Chord |  |
| 7 | Sound Blast III *(melee)* | spell | Sound Blast II |  |
| 7 | Sour Note III *(ground)* | spell | Sour Note II |  |
| 7 | Power Chord III *(around)* | spell | Power Chord II |  |
| 7 | Big Finish | passive |  |  |
| 8 | Dancing Blade III *(dash)* | spell | Dancing Blade II |  |
| 8 | Quick Tempo | passive |  |  |
| 8 | Duelling Song | passive |  |  |
| 8 | Bitter Note | modifier of Sour Note | Sour Note |  |
| 9 | Lullaby III *(ground)* | spell | Lullaby II |  |
| 9 | Healing Song III *(self)* | spell | Healing Song II |  |
| 9 | Perfect Pitch | passive |  |  |
| 10 | Crescendo *(around)* | spell |  | capstone (pick one) |
| 10 | Grand Finale *(beam)* | spell |  | capstone (pick one) |

### Shaman — Base
A hammer that cracks with lightning, thunder that throws crowds off their feet, lava underfoot and a spirit bear. *Requires:* open at creation. *Growth a level:* +9 health, +6 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Shock Strike *(melee)* | spell, free |  |  |
| 1 | Mace Training (mace) | training, free |  |  |
| 1 | Shield Training (shield) | training, free |  |  |
| 1 | Leather Armour (leather) | training, free |  |  |
| 1 | Thunder Clap *(around)* | spell |  |  |
| 1 | Mail Armour (mail) | training |  |  |
| 1 | Axe Training (axe) | training |  |  |
| 1 | Staff Training (staff) | training |  |  |
| 2 | Lava Pool *(ground)* | spell |  |  |
| 2 | Healing Totem *(ground)* | spell |  |  |
| 2 | Mace Mastery | passive | Mace Training |  |
| 2 | Two-Handed Training (twohand) | training |  |  |
| 3 | Rolling Thunder *(beam)* | spell |  |  |
| 3 | Call Spirit Bear *(summon)* | spell |  |  |
| 3 | Storm Power | passive |  |  |
| 3 | Molten Power | passive |  |  |
| 3 | Axe Mastery | passive | Axe Training |  |
| 4 | Shock Strike II *(melee)* | spell | Shock Strike |  |
| 4 | Thunder Clap II *(around)* | spell | Thunder Clap |  |
| 4 | Lava Pool II *(ground)* | spell | Lava Pool |  |
| 4 | Thunder Leap *(leap)* | spell |  |  |
| 5 | Rolling Thunder II *(beam)* | spell | Rolling Thunder |  |
| 5 | Stone Skin *(self)* | spell |  |  |
| 5 | Spirit Bond | passive |  |  |
| 5 | Aftershock | modifier of Thunder Clap | Thunder Clap |  |
| 6 | Thunder Leap II *(leap)* | spell | Thunder Leap |  |
| 6 | Call Spirit Bear II *(summon)* | spell | Call Spirit Bear |  |
| 6 | Elemental Force | passive |  |  |
| 6 | Spreading Lava | modifier of Lava Pool | Lava Pool |  |
| 7 | Shock Strike III *(melee)* | spell | Shock Strike II |  |
| 7 | Thunder Clap III *(around)* | spell | Thunder Clap II |  |
| 7 | Healing Totem II *(ground)* | spell | Healing Totem |  |
| 7 | Charged | passive |  |  |
| 8 | Lava Pool III *(ground)* | spell | Lava Pool II |  |
| 8 | Rolling Thunder III *(beam)* | spell | Rolling Thunder II |  |
| 8 | Quick Spirits | passive |  |  |
| 8 | Wide Shock | modifier of Shock Strike | Shock Strike |  |
| 9 | Thunder Leap III *(leap)* | spell | Thunder Leap II |  |
| 9 | Overcharge | passive |  |  |
| 9 | Staff Mastery | passive | Staff Training |  |
| 9 | Thick Skin | passive |  |  |
| 10 | Lightning Storm *(ground)* | spell |  | capstone (pick one) |
| 10 | Volcano *(ground)* | spell |  | capstone (pick one) |

### Paladin — Advanced
Sworn steel and holy light. The class that opens plate armour. *Requires:* Warrior 3, Cleric 1, Strength 14, Wisdom 12. *Growth a level:* +11 health, +4 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Holy Strike *(melee)* | spell, free |  |  |
| 1 | Plate Armour (plate) | training, free |  |  |
| 1 | Holy Charge *(dash)* | spell |  |  |
| 1 | Healing Light *(bolt)* | spell |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 1 | Mace Training (mace) | training |  |  |
| 1 | Two-Handed Training (twohand) | training |  |  |
| 2 | Divine Storm *(around)* | spell |  |  |
| 2 | Holy Fire *(around)* | spell |  |  |
| 2 | Shield Training (shield) | training |  |  |
| 2 | Axe Training (axe) | training |  |  |
| 3 | Light Hammer *(ground)* | spell |  |  |
| 3 | Sword Mastery | passive | Sword Training |  |
| 3 | Mace Mastery | passive | Mace Training |  |
| 3 | Two-Handed Mastery | passive | Two-Handed Training |  |
| 3 | Holy Might | passive |  |  |
| 4 | Holy Strike II *(melee)* | spell | Holy Strike |  |
| 4 | Holy Charge II *(dash)* | spell | Holy Charge |  |
| 4 | Divine Storm II *(around)* | spell | Divine Storm |  |
| 4 | Shield of Light *(self)* | spell |  |  |
| 5 | Holy Leap *(leap)* | spell |  |  |
| 5 | Holy Fire II *(around)* | spell | Holy Fire |  |
| 5 | Light Hammer II *(ground)* | spell | Light Hammer |  |
| 5 | Armour Expert | passive |  |  |
| 6 | Healing Light II *(bolt)* | spell | Healing Light |  |
| 6 | Crusader | passive |  |  |
| 6 | Axe Mastery | passive | Axe Training |  |
| 6 | Storm of Light | modifier of Divine Storm | Divine Storm |  |
| 7 | Holy Strike III *(melee)* | spell | Holy Strike II |  |
| 7 | Holy Charge III *(dash)* | spell | Holy Charge II |  |
| 7 | Holy Leap II *(leap)* | spell | Holy Leap |  |
| 7 | Zealot | passive |  |  |
| 8 | Divine Storm III *(around)* | spell | Divine Storm II |  |
| 8 | Light Hammer III *(ground)* | spell | Light Hammer II |  |
| 8 | Quick Justice | passive |  |  |
| 8 | Blinding Charge | modifier of Holy Charge | Holy Charge |  |
| 9 | Holy Fire III *(around)* | spell | Holy Fire II |  |
| 9 | Holy Leap III *(leap)* | spell | Holy Leap II |  |
| 9 | Holy Wrath | passive |  |  |
| 9 | Stout Heart | passive |  |  |
| 10 | Holy Avatar *(self)* | spell |  | capstone (pick one) |
| 10 | Heaven's Hammer *(ground)* | spell |  | capstone (pick one) |

### Spellblade — Advanced
A blade in one hand and a spell in the other — every strike carries magic. *Requires:* Warrior 2, Mage 2, Intelligence 13. *Growth a level:* +9 health, +6 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Arcane Slash *(melee)* | spell, free |  |  |
| 1 | Fire Slash *(melee)* | spell |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 1 | Wand Training (wand) | training |  |  |
| 1 | Mail Armour (mail) | training |  |  |
| 1 | Two-Handed Training (twohand) | training |  |  |
| 2 | Lightning Dash *(dash)* | spell |  |  |
| 2 | Arcane Spin *(around)* | spell |  |  |
| 2 | Axe Training (axe) | training |  |  |
| 2 | Dual Wielding (dualWield) | training |  |  |
| 3 | Blade Wave *(beam)* | spell |  |  |
| 3 | Sword Mastery | passive | Sword Training |  |
| 3 | Two-Handed Mastery | passive | Two-Handed Training |  |
| 3 | Arcane Edge | passive |  |  |
| 4 | Arcane Slash II *(melee)* | spell | Arcane Slash |  |
| 4 | Fire Slash II *(melee)* | spell | Fire Slash |  |
| 4 | Rune Blast *(ground)* | spell |  |  |
| 4 | Battle Mage | passive |  |  |
| 5 | Phase Strike *(leap)* | spell |  |  |
| 5 | Lightning Dash II *(dash)* | spell | Lightning Dash |  |
| 5 | Arcane Spin II *(around)* | spell | Arcane Spin |  |
| 5 | Magic Ward *(self)* | spell |  |  |
| 6 | Blade Wave II *(beam)* | spell | Blade Wave |  |
| 6 | Rune Blast II *(ground)* | spell | Rune Blast |  |
| 6 | Fire Edge | passive |  |  |
| 6 | Storm Edge | passive |  |  |
| 6 | Burning Edge | modifier of Arcane Slash | Arcane Slash |  |
| 7 | Arcane Slash III *(melee)* | spell | Arcane Slash II |  |
| 7 | Fire Slash III *(melee)* | spell | Fire Slash II |  |
| 7 | Phase Strike II *(leap)* | spell | Phase Strike |  |
| 7 | Keen Edge | passive |  |  |
| 8 | Lightning Dash III *(dash)* | spell | Lightning Dash II |  |
| 8 | Arcane Spin III *(around)* | spell | Arcane Spin II |  |
| 8 | Quick Spells | passive |  |  |
| 8 | Chain Runes | modifier of Rune Blast | Rune Blast |  |
| 9 | Blade Wave III *(beam)* | spell | Blade Wave II |  |
| 9 | Rune Blast III *(ground)* | spell | Rune Blast II |  |
| 9 | Phase Strike III *(leap)* | spell | Phase Strike II |  |
| 9 | Deadly Edge | passive |  |  |
| 10 | Sword Storm *(around)* | spell |  | capstone (pick one) |
| 10 | Giant Blade *(beam)* | spell |  | capstone (pick one) |

### Warlock — Advanced
Bargained power: hexes that rot, a bound fiend, and gates you pay for in blood. *Requires:* Mage 3, something found in the world. *Growth a level:* +7 health, +7 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Shadow Burst *(ground)* | spell, free |  |  |
| 1 | Wand Training (wand) | training, free |  |  |
| 1 | Drain Life *(beam)* | spell |  |  |
| 1 | Summon Imp *(summon)* | spell |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 1 | Staff Training (staff) | training |  |  |
| 1 | Tome Training (tome) | training |  |  |
| 2 | Curse Cloud *(ground)* | spell |  |  |
| 2 | Dark Wave *(melee)* | spell |  |  |
| 2 | Leather Armour (leather) | training |  |  |
| 2 | Wand Mastery | passive | Wand Training |  |
| 3 | Shadow Nova *(around)* | spell |  |  |
| 3 | Dark Power | passive |  |  |
| 3 | Staff Mastery | passive | Staff Training |  |
| 3 | Dagger Mastery | passive | Dagger Training |  |
| 4 | Shadow Burst II *(ground)* | spell | Shadow Burst |  |
| 4 | Drain Life II *(beam)* | spell | Drain Life |  |
| 4 | Summon Imp II *(summon)* | spell | Summon Imp |  |
| 4 | Terror *(ground)* | spell |  |  |
| 5 | Curse Cloud II *(ground)* | spell | Curse Cloud |  |
| 5 | Dark Wave II *(melee)* | spell | Dark Wave |  |
| 5 | Blood Pact *(self)* | spell |  |  |
| 5 | Demon Bond | passive |  |  |
| 6 | Shadow Nova II *(around)* | spell | Shadow Nova |  |
| 6 | Deep Mana | passive |  |  |
| 6 | Hungry Shadows | modifier of Drain Life | Drain Life |  |
| 6 | Cursed Burst | modifier of Shadow Burst | Shadow Burst |  |
| 7 | Shadow Burst III *(ground)* | spell | Shadow Burst II |  |
| 7 | Drain Life III *(beam)* | spell | Drain Life II |  |
| 7 | Terror II *(ground)* | spell | Terror |  |
| 7 | Cruel Mind | passive |  |  |
| 8 | Curse Cloud III *(ground)* | spell | Curse Cloud II |  |
| 8 | Dark Wave III *(melee)* | spell | Dark Wave II |  |
| 8 | Summon Imp III *(summon)* | spell | Summon Imp II |  |
| 8 | Quick Hexes | passive |  |  |
| 9 | Shadow Nova III *(around)* | spell | Shadow Nova II |  |
| 9 | Dark Hunger | passive |  |  |
| 9 | Cruel Blows | passive |  |  |
| 9 | Big Nova | modifier of Shadow Nova | Shadow Nova |  |
| 10 | Demon Gate *(ground)* | spell |  | capstone (pick one) |
| 10 | Dark Star *(ground)* | spell |  | capstone (pick one) |

### Wayfarer — Advanced
Bare hands, a staff and a still mind. Fast, hard to hit, no armour needed. *Requires:* Rogue 2, Druid 2, Dexterity 14. *Growth a level:* +13 health, +3 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Palm Strike *(melee)* | spell, free |  |  |
| 1 | Spinning Kick *(around)* | spell |  |  |
| 1 | Staff Training (staff) | training |  |  |
| 1 | Spear Training (spear) | training |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 2 | Flying Kick *(leap)* | spell |  |  |
| 2 | Rushing Fist *(dash)* | spell |  |  |
| 2 | Staff Mastery | passive | Staff Training |  |
| 2 | Spear Mastery | passive | Spear Training |  |
| 3 | Staff Sweep *(melee)* | spell |  |  |
| 3 | Wind Palm *(beam)* | spell |  |  |
| 3 | Iron Fist | passive |  |  |
| 3 | Light Step | passive |  |  |
| 4 | Palm Strike II *(melee)* | spell | Palm Strike |  |
| 4 | Spinning Kick II *(around)* | spell | Spinning Kick |  |
| 4 | Flying Kick II *(leap)* | spell | Flying Kick |  |
| 4 | Inner Speed *(self)* | spell |  |  |
| 5 | Earth Stomp *(around)* | spell |  |  |
| 5 | Rushing Fist II *(dash)* | spell | Rushing Fist |  |
| 5 | Wind Palm II *(beam)* | spell | Wind Palm |  |
| 5 | Fast Feet | passive |  |  |
| 6 | Staff Sweep II *(melee)* | spell | Staff Sweep |  |
| 6 | Flowing Strikes | passive |  |  |
| 6 | Dagger Mastery | passive | Dagger Training |  |
| 6 | Whirling Kick | modifier of Spinning Kick | Spinning Kick |  |
| 7 | Palm Strike III *(melee)* | spell | Palm Strike II |  |
| 7 | Spinning Kick III *(around)* | spell | Spinning Kick II |  |
| 7 | Earth Stomp II *(around)* | spell | Earth Stomp |  |
| 7 | Pressure Points | passive |  |  |
| 8 | Flying Kick III *(leap)* | spell | Flying Kick II |  |
| 8 | Rushing Fist III *(dash)* | spell | Rushing Fist II |  |
| 8 | Calm Mind | passive |  |  |
| 8 | Gale Palm | modifier of Wind Palm | Wind Palm |  |
| 9 | Wind Palm III *(beam)* | spell | Wind Palm II |  |
| 9 | Staff Sweep III *(melee)* | spell | Staff Sweep II |  |
| 9 | Earth Stomp III *(around)* | spell | Earth Stomp II |  |
| 9 | Killing Blow | passive |  |  |
| 10 | Hundred Fists *(melee)* | spell |  | capstone (pick one) |
| 10 | Thunder Kick *(leap)* | spell |  | capstone (pick one) |

### Pyromancer — Advanced
Everything burns. Lines of fire, falling stones and flashovers. *Requires:* Mage 3, Intelligence 14. *Growth a level:* +6 health, +8 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Flame Burst *(ground)* | spell, free |  |  |
| 1 | Wand Training (wand) | training, free |  |  |
| 1 | Flame Wave *(melee)* | spell |  |  |
| 1 | Staff Training (staff) | training |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 1 | Orb Training (orb) | training |  |  |
| 2 | Fire Wall *(beam)* | spell |  |  |
| 2 | Fire Nova *(around)* | spell |  |  |
| 2 | Wand Mastery | passive | Wand Training |  |
| 2 | Tome Training (tome) | training |  |  |
| 3 | Fire Bomb *(ground)* | spell |  |  |
| 3 | Fire Power | passive |  |  |
| 3 | Staff Mastery | passive | Staff Training |  |
| 3 | Burning Mind | passive |  |  |
| 4 | Flame Burst II *(ground)* | spell | Flame Burst |  |
| 4 | Flame Wave II *(melee)* | spell | Flame Wave |  |
| 4 | Flame Dash *(dash)* | spell |  |  |
| 4 | Deep Mana | passive |  |  |
| 5 | Flame Pillar *(ground)* | spell |  |  |
| 5 | Fire Wall II *(beam)* | spell | Fire Wall |  |
| 5 | Fire Nova II *(around)* | spell | Fire Nova |  |
| 5 | Big Burst | modifier of Flame Burst | Flame Burst |  |
| 6 | Fire Bomb II *(ground)* | spell | Fire Bomb |  |
| 6 | Flame Dash II *(dash)* | spell | Flame Dash |  |
| 6 | Hot Blood | passive |  |  |
| 6 | Scorching Wave | modifier of Flame Wave | Flame Wave |  |
| 7 | Flame Burst III *(ground)* | spell | Flame Burst II |  |
| 7 | Flame Wave III *(melee)* | spell | Flame Wave II |  |
| 7 | Flame Pillar II *(ground)* | spell | Flame Pillar |  |
| 7 | Wildfire | passive |  |  |
| 8 | Fire Wall III *(beam)* | spell | Fire Wall II |  |
| 8 | Fire Nova III *(around)* | spell | Fire Nova II |  |
| 8 | Quick Fire | passive |  |  |
| 8 | Cluster Bombs | modifier of Fire Bomb | Fire Bomb |  |
| 9 | Fire Bomb III *(ground)* | spell | Fire Bomb II |  |
| 9 | Flame Pillar III *(ground)* | spell | Flame Pillar II |  |
| 9 | Searing Heat | passive |  |  |
| 9 | Fire Heart | passive |  |  |
| 10 | Inferno *(around)* | spell |  | capstone (pick one) |
| 10 | Fire Storm *(ground)* | spell |  | capstone (pick one) |

### Stormcaller — Advanced
Bolts that fork from foe to foe and a storm you walk inside. *Requires:* Mage 2, Shaman 2. *Growth a level:* +6 health, +8 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Chain Lightning *(beam)* | spell, free |  |  |
| 1 | Wand Training (wand) | training, free |  |  |
| 1 | Shock Nova *(around)* | spell |  |  |
| 1 | Staff Training (staff) | training |  |  |
| 1 | Leather Armour (leather) | training |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 2 | Ball Lightning *(ground)* | spell |  |  |
| 2 | Wind Blast *(melee)* | spell |  |  |
| 2 | Wand Mastery | passive | Wand Training |  |
| 2 | Orb Training (orb) | training |  |  |
| 3 | Static Field *(ground)* | spell |  |  |
| 3 | Storm Leap *(leap)* | spell |  |  |
| 3 | Storm Power | passive |  |  |
| 3 | Staff Mastery | passive | Staff Training |  |
| 4 | Chain Lightning II *(beam)* | spell | Chain Lightning |  |
| 4 | Shock Nova II *(around)* | spell | Shock Nova |  |
| 4 | Storm Beam *(beam)* | spell |  |  |
| 4 | Deep Mana | passive |  |  |
| 5 | Ball Lightning II *(ground)* | spell | Ball Lightning |  |
| 5 | Wind Blast II *(melee)* | spell | Wind Blast |  |
| 5 | Spell Power | passive |  |  |
| 5 | Double Chain | modifier of Chain Lightning | Chain Lightning |  |
| 6 | Static Field II *(ground)* | spell | Static Field |  |
| 6 | Storm Leap II *(leap)* | spell | Storm Leap |  |
| 6 | Swift Winds | passive |  |  |
| 6 | Overload | modifier of Shock Nova | Shock Nova |  |
| 7 | Chain Lightning III *(beam)* | spell | Chain Lightning II |  |
| 7 | Shock Nova III *(around)* | spell | Shock Nova II |  |
| 7 | Storm Beam II *(beam)* | spell | Storm Beam |  |
| 7 | Static Charge | passive |  |  |
| 8 | Ball Lightning III *(ground)* | spell | Ball Lightning II |  |
| 8 | Wind Blast III *(melee)* | spell | Wind Blast II |  |
| 8 | Quick Storms | passive |  |  |
| 8 | Double Ball | modifier of Ball Lightning | Ball Lightning |  |
| 9 | Static Field III *(ground)* | spell | Static Field II |  |
| 9 | Storm Beam III *(beam)* | spell | Storm Beam II |  |
| 9 | Storm Leap III *(leap)* | spell | Storm Leap II |  |
| 9 | High Voltage | passive |  |  |
| 10 | Thunderstorm *(ground)* | spell |  | capstone (pick one) |
| 10 | Eye of the Storm *(around)* | spell |  | capstone (pick one) |

### Necromancer — Advanced
Raises the dead to fight for you, or rots the living where they stand. *Requires:* Mage 2, something found in the world. *Growth a level:* +6 health, +8 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Bone Spikes *(ground)* | spell, free |  |  |
| 1 | Wand Training (wand) | training, free |  |  |
| 1 | Raise Skeleton *(summon)* | spell |  |  |
| 1 | Bone Spear *(beam)* | spell |  |  |
| 1 | Staff Training (staff) | training |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 1 | Tome Training (tome) | training |  |  |
| 2 | Corpse Explosion *(ground)* | spell |  |  |
| 2 | Bone Nova *(around)* | spell |  |  |
| 2 | Wand Mastery | passive | Wand Training |  |
| 2 | Sceptre Training (scepter) | training |  |  |
| 3 | Plague Cloud *(ground)* | spell |  |  |
| 3 | Grasping Dead *(ground)* | spell |  |  |
| 3 | Dark Power | passive |  |  |
| 3 | Staff Mastery | passive | Staff Training |  |
| 4 | Bone Spikes II *(ground)* | spell | Bone Spikes |  |
| 4 | Raise Skeleton II *(summon)* | spell | Raise Skeleton |  |
| 4 | Bone Spear II *(beam)* | spell | Bone Spear |  |
| 4 | Bone Armour *(self)* | spell |  |  |
| 5 | Corpse Explosion II *(ground)* | spell | Corpse Explosion |  |
| 5 | Bone Nova II *(around)* | spell | Bone Nova |  |
| 5 | Bone Master | passive |  |  |
| 5 | Plague Lore | passive |  |  |
| 6 | Plague Cloud II *(ground)* | spell | Plague Cloud |  |
| 6 | Grasping Dead II *(ground)* | spell | Grasping Dead |  |
| 6 | Two Skeletons | modifier of Raise Skeleton | Raise Skeleton |  |
| 6 | Chain Explosion | modifier of Corpse Explosion | Corpse Explosion |  |
| 7 | Bone Spikes III *(ground)* | spell | Bone Spikes II |  |
| 7 | Bone Spear III *(beam)* | spell | Bone Spear II |  |
| 7 | Raise Skeleton III *(summon)* | spell | Raise Skeleton II |  |
| 7 | Cold Mind | passive |  |  |
| 8 | Corpse Explosion III *(ground)* | spell | Corpse Explosion II |  |
| 8 | Bone Nova III *(around)* | spell | Bone Nova II |  |
| 8 | Quick Rituals | passive |  |  |
| 8 | Bone Burst | modifier of Bone Nova | Bone Nova |  |
| 9 | Plague Cloud III *(ground)* | spell | Plague Cloud II |  |
| 9 | Grasping Dead III *(ground)* | spell | Grasping Dead II |  |
| 9 | Deep Mana | passive |  |  |
| 9 | Cruel Blows | passive |  |  |
| 10 | Grave Army *(self)* | spell |  | capstone (pick one) |
| 10 | Death Wave *(around)* | spell |  | capstone (pick one) |

### Witch Hunter — Advanced
Silver, iron nets and holy writs for the things that cast and the things that crawl out of rifts. *Requires:* Ranger 2, Cleric 1. *Growth a level:* +9 health, +4 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Scatter Shot *(melee)* | spell, free |  |  |
| 1 | Crossbow Training (crossbow) | training, free |  |  |
| 1 | Holy Arrow *(beam)* | spell |  |  |
| 1 | Silver Slash *(melee)* | spell |  |  |
| 1 | Bow Training (bow) | training |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 1 | Mail Armour (mail) | training |  |  |
| 2 | Iron Net *(ground)* | spell |  |  |
| 2 | Chain Hook *(beam)* | spell |  |  |
| 2 | Crossbow Mastery | passive | Crossbow Training |  |
| 2 | Axe Training (axe) | training |  |  |
| 2 | Leather Armour (leather) | training |  |  |
| 3 | Holy Bomb *(ground)* | spell |  |  |
| 3 | Bow Mastery | passive | Bow Training |  |
| 3 | Sword Mastery | passive | Sword Training |  |
| 3 | Holy Silver | passive |  |  |
| 4 | Scatter Shot II *(melee)* | spell | Scatter Shot |  |
| 4 | Holy Arrow II *(beam)* | spell | Holy Arrow |  |
| 4 | Silver Slash II *(melee)* | spell | Silver Slash |  |
| 4 | Silence Bomb *(ground)* | spell |  |  |
| 5 | Combat Roll *(leap)* | spell |  |  |
| 5 | Iron Net II *(ground)* | spell | Iron Net |  |
| 5 | Chain Hook II *(beam)* | spell | Chain Hook |  |
| 5 | Sharpshooter | passive |  |  |
| 6 | Holy Bomb II *(ground)* | spell | Holy Bomb |  |
| 6 | Spell Breaker | passive |  |  |
| 6 | Iron Will | passive |  |  |
| 6 | Wide Scatter | modifier of Scatter Shot | Scatter Shot |  |
| 7 | Scatter Shot III *(melee)* | spell | Scatter Shot II |  |
| 7 | Holy Arrow III *(beam)* | spell | Holy Arrow II |  |
| 7 | Silver Slash III *(melee)* | spell | Silver Slash II |  |
| 7 | Keen Eye | passive |  |  |
| 8 | Silence Bomb II *(ground)* | spell | Silence Bomb |  |
| 8 | Iron Net III *(ground)* | spell | Iron Net II |  |
| 8 | Quick Reload | passive |  |  |
| 8 | Barbed Hook | modifier of Chain Hook | Chain Hook |  |
| 9 | Holy Bomb III *(ground)* | spell | Holy Bomb II |  |
| 9 | Chain Hook III *(beam)* | spell | Chain Hook II |  |
| 9 | Deadly Bolts | passive |  |  |
| 9 | Blast Bomb | modifier of Holy Bomb | Holy Bomb |  |
| 10 | Purge *(around)* | spell |  | capstone (pick one) |
| 10 | Bolt Storm *(ground)* | spell |  | capstone (pick one) |

### Duelist — Specialty
A specialty class: flourishes, lunges and a showman's flurry for a light blade. *Requires:* Warrior 2, Rogue 2, Dexterity 13. *Growth a level:* +9 health, +3 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Flurry *(melee)* | spell, free |  |  |
| 1 | Lunge *(dash)* | spell |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 2 | Blade Dance *(around)* | spell |  |  |
| 2 | Sword Mastery | passive | Sword Training |  |
| 2 | Dagger Mastery | passive | Dagger Training |  |
| 2 | Footwork | passive |  |  |
| 3 | Disarming Strike *(melee)* | spell |  |  |
| 3 | Flurry II *(melee)* | spell | Flurry |  |
| 3 | Lunge II *(dash)* | spell | Lunge |  |
| 3 | Precision | passive |  |  |
| 4 | Blade Dance II *(around)* | spell | Blade Dance |  |
| 4 | Disarming Strike II *(melee)* | spell | Disarming Strike |  |
| 4 | Showstopper | passive |  |  |
| 4 | Long Lunge | modifier of Lunge | Lunge |  |
| 5 | Grand Flourish *(around)* | spell |  | capstone (pick one) |
| 5 | Deadly Lunge *(dash)* | spell |  | capstone (pick one) |
| 5 | Flurry III *(melee)* | spell | Flurry II |  |

### Shadowdancer — Specialty
A specialty class: steps through shadow and leaves shades of itself behind. *Requires:* Rogue 4, Sneak 30. *Growth a level:* +7 health, +5 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Shadow Slash *(melee)* | spell, free |  |  |
| 1 | Shadow Leap *(leap)* | spell |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 2 | Darkness *(around)* | spell |  |  |
| 2 | Shadow Dash *(dash)* | spell |  |  |
| 2 | Dagger Mastery | passive | Dagger Training |  |
| 2 | Sword Mastery | passive | Sword Training |  |
| 3 | Shadow Clones *(self)* | spell |  |  |
| 3 | Shadow Slash II *(melee)* | spell | Shadow Slash |  |
| 3 | Shadow Leap II *(leap)* | spell | Shadow Leap |  |
| 3 | Dark Arts | passive |  |  |
| 4 | Darkness II *(around)* | spell | Darkness |  |
| 4 | Shadow Dash II *(dash)* | spell | Shadow Dash |  |
| 4 | Night Eyes | passive |  |  |
| 4 | More Clones | modifier of Shadow Clones | Shadow Clones |  |
| 5 | Shadow Army *(around)* | spell |  | capstone (pick one) |
| 5 | Night Strike *(leap)* | spell |  | capstone (pick one) |
| 5 | Shadow Slash III *(melee)* | spell | Shadow Slash II |  |

### Spellfletcher — Specialty
A specialty class: every arrow carries a spell — frost, flame or raw force. *Requires:* Ranger 3, Mage 2, Dexterity 14. *Growth a level:* +7 health, +5 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Frost Arrow *(ground)* | spell, free |  |  |
| 1 | Flame Arrow *(beam)* | spell |  |  |
| 1 | Bow Training (bow) | training |  |  |
| 1 | Crossbow Training (crossbow) | training |  |  |
| 2 | Force Shot *(melee)* | spell |  |  |
| 2 | Bow Mastery | passive | Bow Training |  |
| 2 | Crossbow Mastery | passive | Crossbow Training |  |
| 2 | Spell Arrows | passive |  |  |
| 3 | Storm Volley *(ground)* | spell |  |  |
| 3 | Frost Arrow II *(ground)* | spell | Frost Arrow |  |
| 3 | Flame Arrow II *(beam)* | spell | Flame Arrow |  |
| 3 | Frost Tips | passive |  |  |
| 4 | Force Shot II *(melee)* | spell | Force Shot |  |
| 4 | Storm Volley II *(ground)* | spell | Storm Volley |  |
| 4 | Sharp Eye | passive |  |  |
| 4 | Freezing Arrow | modifier of Frost Arrow | Frost Arrow |  |
| 5 | Comet Arrow *(ground)* | spell |  | capstone (pick one) |
| 5 | Ice Storm *(ground)* | spell |  | capstone (pick one) |
| 5 | Frost Arrow III *(ground)* | spell | Frost Arrow II |  |

### Bladesworn — Specialty
A specialty class: years with one weapon — its every swing perfected. *Requires:* Warrior 4, the Weapon Focus talent. *Growth a level:* +10 health, +2 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Perfect Cut *(melee)* | spell, free |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 1 | Axe Training (axe) | training |  |  |
| 1 | Mace Training (mace) | training |  |  |
| 1 | Two-Handed Training (twohand) | training |  |  |
| 1 | Spear Training (spear) | training |  |  |
| 2 | Sweeping Blow *(around)* | spell |  |  |
| 2 | Rising Slash *(beam)* | spell |  |  |
| 2 | Sword Mastery | passive | Sword Training |  |
| 2 | Axe Mastery | passive | Axe Training |  |
| 2 | Mace Mastery | passive | Mace Training |  |
| 2 | Two-Handed Mastery | passive | Two-Handed Training |  |
| 2 | Spear Mastery | passive | Spear Training |  |
| 3 | Hundred Cuts *(melee)* | spell |  |  |
| 3 | Perfect Cut II *(melee)* | spell | Perfect Cut |  |
| 3 | Sweeping Blow II *(around)* | spell | Sweeping Blow |  |
| 3 | Weapon Expert | passive |  |  |
| 4 | Battle Stance *(self)* | spell |  |  |
| 4 | Rising Slash II *(beam)* | spell | Rising Slash |  |
| 4 | Hundred Cuts II *(melee)* | spell | Hundred Cuts |  |
| 4 | Perfect Aim | passive |  |  |
| 4 | Heavy Hands | passive |  |  |
| 5 | Final Blow *(leap)* | spell |  | capstone (pick one) |
| 5 | Whirling Steel *(around)* | spell |  | capstone (pick one) |
| 5 | Perfect Cut III *(melee)* | spell | Perfect Cut II |  |

### Wrathborn — Specialty
A specialty class: fury that shrugs off wounds and swings wider the more it bleeds. *Requires:* Warrior 3, Constitution 14, Strength 14. *Growth a level:* +13 health, +1 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Wild Swing *(melee)* | spell, free |  |  |
| 1 | Savage Leap *(leap)* | spell |  |  |
| 1 | Axe Training (axe) | training |  |  |
| 1 | Two-Handed Training (twohand) | training |  |  |
| 1 | Mace Training (mace) | training |  |  |
| 2 | Rampage *(around)* | spell |  |  |
| 2 | Bull Rush *(dash)* | spell |  |  |
| 2 | Axe Mastery | passive | Axe Training |  |
| 2 | Two-Handed Mastery | passive | Two-Handed Training |  |
| 2 | Mace Mastery | passive | Mace Training |  |
| 3 | Blood Frenzy *(self)* | spell |  |  |
| 3 | Wild Swing II *(melee)* | spell | Wild Swing |  |
| 3 | Savage Leap II *(leap)* | spell | Savage Leap |  |
| 3 | Thick Skull | passive |  |  |
| 4 | Rampage II *(around)* | spell | Rampage |  |
| 4 | Bull Rush II *(dash)* | spell | Bull Rush |  |
| 4 | Battle Roar *(around)* | spell |  |  |
| 4 | Blood Thirst | passive |  |  |
| 4 | Brutal | passive |  |  |
| 5 | Earth Splitter *(beam)* | spell |  | capstone (pick one) |
| 5 | Blood Storm *(around)* | spell |  | capstone (pick one) |
| 5 | Wild Swing III *(melee)* | spell | Wild Swing II |  |

### Gravecutter — Specialty
A specialty class: contracts, marks and the one cut that ends it. Found through a contract in the wilds. *Requires:* Rogue 3, Sneak 25, something found in the world. *Growth a level:* +7 health, +4 mana. Fights with two weapons.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Venom Slash *(melee)* | spell, free |  |  |
| 1 | Death Mark *(ground)* | spell |  |  |
| 1 | Dagger Training (dagger) | training |  |  |
| 1 | Sword Training (sword) | training |  |  |
| 2 | Finishing Cut *(melee)* | spell |  |  |
| 2 | Silent Leap *(leap)* | spell |  |  |
| 2 | Dagger Mastery | passive | Dagger Training |  |
| 2 | Sword Mastery | passive | Sword Training |  |
| 3 | Poison Bomb *(ground)* | spell |  |  |
| 3 | Venom Slash II *(melee)* | spell | Venom Slash |  |
| 3 | Death Mark II *(ground)* | spell | Death Mark |  |
| 3 | Venom Lore | passive |  |  |
| 4 | Finishing Cut II *(melee)* | spell | Finishing Cut |  |
| 4 | Silent Leap II *(leap)* | spell | Silent Leap |  |
| 4 | Poison Bomb II *(ground)* | spell | Poison Bomb |  |
| 4 | Cold Killer | passive |  |  |
| 4 | Deep Wounds | passive |  |  |
| 5 | Death Sentence *(ground)* | spell |  | capstone (pick one) |
| 5 | Venom Storm *(around)* | spell |  | capstone (pick one) |
| 5 | Venom Slash III *(melee)* | spell | Venom Slash II |  |

### Dragon Knight — Advanced (later round)
Fire-tempered steel, scales and a wyrm's breath. (Opens after the level cap rises.) *Requires:* Warrior 5, Pyromancer 3, Strength 15, character level 12. *Growth a level:* +11 health, +4 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Scale Rend *(melee)* | spell, free |  |  |
| 1 | Mail Armour (mail) | training, free |  |  |
| 1 | Plate Armour (plate) | training, free |  |  |
| 1 | Sword Training (sword) | training, free |  |  |
| 1 | Axe Training (axe) | training, free |  |  |
| 1 | Shield Training (shield) | training, free |  |  |
| 1 | Wyrm Blood | passive |  |  |
| 2 | Dragonscale *(self)* | spell |  |  |
| 3 | Scale Hide | passive |  |  |
| 3 | Wyrmfall *(dash)* | spell |  |  |
| 3 | Fire Temper | passive |  |  |
| 4 | Rending Fire | modifier of Scale Rend | Scale Rend |  |
| 5 | Wyrm's Breath *(melee)* | spell |  |  |
| 10 | Wyrm Ascendant | passive |  | capstone (pick one) |
| 10 | Elder Scales | passive |  | capstone (pick one) |

### Chronomancer — Advanced (later round)
Hurries friends, slows foes, and stops the clock. (Opens after the level cap rises.) *Requires:* Mage 5, Enchanting 50, something found in the world. *Growth a level:* +5 health, +9 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Second Hand *(bolt)* | spell, free |  |  |
| 1 | Wand Training (wand) | training, free |  |  |
| 1 | Borrowed Time | passive |  |  |
| 3 | Quicken *(self)* | spell |  |  |
| 3 | Stasis Lock *(bolt)* | spell |  |  |
| 4 | Tick Tock | modifier of Second Hand | Second Hand |  |
| 5 | Entropy Field *(ground)* | spell |  |  |
| 10 | Master of Hours | passive |  | capstone (pick one) |
| 10 | Endless Moment | passive |  | capstone (pick one) |

### Oracle — Advanced (later round)
Sees the blow before it lands. (Opens after the level cap rises.) *Requires:* Cleric 5, Wisdom 16, something found in the world. *Growth a level:* +7 health, +8 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Omen Bolt *(bolt)* | spell, free |  |  |
| 1 | Wand Training (wand) | training, free |  |  |
| 1 | Leather Armour (leather) | training, free |  |  |
| 1 | Second Sight | passive |  |  |
| 3 | Kind Omen *(self)* | spell |  |  |
| 3 | Prophecy *(ground)* | spell |  |  |
| 4 | Fated Bolt | modifier of Omen Bolt | Omen Bolt |  |
| 10 | All-Seeing | passive |  | capstone (pick one) |
| 10 | Last Word | passive |  | capstone (pick one) |

### Tinker — Advanced (later round)
Sentries, grenades and lucky finds from every pocket. (Opens with the Smithing bench.) *Requires:* Rogue 3, Smithing 40. *Growth a level:* +8 health, +4 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Clockwork Bolt *(bolt)* | spell, free |  |  |
| 1 | Leather Armour (leather) | training, free |  |  |
| 1 | Bow Training (bow) | training, free |  |  |
| 1 | Sword Training (sword) | training, free |  |  |
| 1 | Axe Training (axe) | training, free |  |  |
| 1 | Handy | passive |  |  |
| 2 | Flask Grenade *(ground)* | spell |  |  |
| 3 | Deploy Sentry *(self)* | spell |  |  |
| 3 | Junk Toss *(bolt)* | spell |  |  |
| 4 | Big Flask | modifier of Flask Grenade | Flask Grenade |  |
| 10 | Grand Inventor | passive |  | capstone (pick one) |
| 10 | Pockets Full | passive |  | capstone (pick one) |

### Starcaller — Advanced (later round)
Star darts, falling stars and a blade of starlight. (Opens after the level cap rises.) *Requires:* Mage 5, something found in the world, character level 14. *Growth a level:* +6 health, +8 mana.

| Lv | Node | Kind | Needs | Choice |
|---|---|---|---|---|
| 1 | Star Dart *(bolt)* | spell, free |  |  |
| 1 | Wand Training (wand) | training, free |  |  |
| 1 | Sword Training (sword) | training, free |  |  |
| 1 | Axe Training (axe) | training, free |  |  |
| 1 | Starlit | passive |  |  |
| 3 | Called Star *(ground)* | spell |  |  |
| 3 | Starcut *(melee)* | spell |  |  |
| 4 | Bright Dart | modifier of Star Dart | Star Dart |  |
| 5 | Comet Rush *(dash)* | spell |  |  |
| 10 | Heaven's Herald | passive |  | capstone (pick one) |
| 10 | Starforged | passive |  | capstone (pick one) |

<!-- /trees -->
