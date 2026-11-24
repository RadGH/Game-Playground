# Oathwild — how the rules work (round 1)

Plain-language guide to the rules core (`js/rules/`). Every number named here lives in a `data/*.json` file and is
printed in game by the one tooltip model (`js/rules/describe.js`). Owner rulings are quoted; anything marked
**Guessed** is Claude's call and can be overruled in one line.

## The owner's rulings this follows (2026-11-23)

- "Every level up you pick a class (level an existing one or unlock a new one). A certain level of Paladin unlocks
  plate armour, which requires high Strength. A Mage can't wear plate unless an item affix or talent allows it."
- "Review the spells in Thousandvale and Emberveil and reuse a lot of what we already had. We could probably go up to
  30 classes in total … consolidate them down and keep what's most interesting." → 27 classes, `docs/CLASSES.md`.
- Unlimited classes per character, "no guard at all" on spreading; specialty (prestige) classes "like Neverwinter
  Nights 2 had" with original names; Titan Quest-style ranked spells and modifiers bought with class points;
  Pathfinder choices at class levels.
- Druid: shapeshifts into **real animals** (wolf, bear), and can go summoner or caster instead (reports #8, #21).
- Use-skills are **non-combat only**; resources are **health, mana, stamina**; **carry weight** from Strength and
  Constitution; **humans** in round 1; **paid respec at shrines**; **enchanting** and a **horse** in round 1.
- **Individual loot**: everyone who helped gets their own contents in a corpse or chest window; **gold must be looted**.
- Tooltips with **real numbers**, standardised.

## Making a character

- **Attributes** (`data/attributes.json`): Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma. Start
  at 8, spend 27 points (D&D point-buy costs, 15 at most). 10 is average; each point above 10 adds the numbers in
  `perPoint` (a point below takes them off):
  - Strength: heavy weapons +3.5% damage, +6 kg carry. Mail needs 12, plate 15.
  - Dexterity: light weapons and bows +3.5%, +0.3% critical chance, +0.3% dodge, +2 stamina.
  - Constitution: +4 health, +1 more per character level, +3 stamina, +2 kg carry.
  - Intelligence: arcane/fire/frost/storm/shadow/poison spells +4%, +3 mana.
  - Wisdom: holy and nature spells +4%, every heal +4% more, mana back faster, +1.5 magic resistance.
  - Charisma: songs +4%, companions +4%, shop prices −1.5%.
- **Background** (`data/backgrounds.json`, Guessed): six human backgrounds, each +1 to one attribute and a small
  head start (Farmhand carries more, Street Kid starts with Lockpicking…).
- **First class**: one of the 8 base classes. You start in its kit (`starter`), with its level-1 spell.

## Levelling up

- **XP** (`data/levels.json`): 150 for level 2 … 5,800 for level 10 (round 1's cap). A kill gives every player who
  helped (and is within 80 m) the monster's XP, more for higher-level monsters, nothing for monsters 5+ levels below
  you. In a group each gets a little less than solo (−10% per extra helper, never below 60%), so a group still levels
  faster in total.
- **Every level, pick a class**: level one you have, or start a new one if you meet its requirements. No limit on how
  many. The first level of a class gives its use-skill head start (once per class, ever).
- **Each class level** gives that class's health and mana growth, attribute growth (e.g. +1 Strength every 2 Warrior
  levels) and **2 class points** that can only be spent in that class.
- **Attribute point** at every even character level; **talent point** at levels 3, 6, 9 and for every 25 points in a
  use-skill.

## Class trees (Titan Quest masteries + Pathfinder levels)

- Nodes open at class levels. Kinds: **spell** (3 ranks), **passive** (ranks, numbers per rank), **training**
  (armour/weapons), **modifier** (changes how one of the class's spells works).
- **Ranks**: rank 1 costs a point when the node opens; rank 2 needs 2 more class levels, rank 3 another 2. A rank
  multiplies the spell's damage/healing/barrier/summon strength (×1.3 at rank 2, ×1.6 at rank 3; buffs grow half as
  much) and its mana (×1.15, ×1.3); some ranks add an effect (Cleave rank 3 makes targets bleed; Frost Shard rank 3
  chills; Aimed Shot rank 3 pierces two).
- **Paths** at class level 3 (base and advanced classes): pick one; path nodes are only for that path. Changeable at
  a shrine respec.
- **Capstone** at the class's last level: two options, pick one.
- **Depth pays**: a spell gets +5% per level of the class it came from (a level-10 Mage's Frost Shard is ×1.45).
- **Specialty classes** (Duelist, Shadowdancer, Spellfletcher, Bladesworn, Wrathborn, Gravecutter): unlocked by
  requirements (class levels, attributes, a use-skill, a talent, or a contract found in the world), 5 levels, a strong
  signature ability at level 1 and a capstone at 5.
- **No spreading guard** (owner). For information, the combat test prints how builds compare at level 10 against
  three level-matched Thornmere monsters (latest run): Warrior 10 won in 10 s with 158/346 health left; Mage 10 won in
  6.7 s untouched; a Paladin build won in 13.1 s (71/335); Warrior 5 / Cleric 5 won in 11.7 s with 3 health left;
  Mage 6 / Rogue 4 won in 7.9 s untouched; Ranger 4 / Druid 3 / Shaman 3 lost; a five-class spread won in 12.6 s
  (131/300). Spread builds work, deep ones are a little stronger — no rule forces it.

## Talents (`data/talents.json`)

Four rows opening at levels 1, 4, 7, 10. Each talent has its own needs (attributes, a use-skill, other training,
levels in two classes) and gives numbers or training: Weapon Focus, Spell Focus, Toughness, Leather / Mail / **Plate
Training** (Plate needs Strength 15 and Mail first), Shield, Bow, Two-Weapon Fighting, Quiet Feet (Sneak 25),
Honeyed Words (Speech 25), Runic Hand (Enchanting 50), the elemental Affinities, and four **cornerstones** at level
10 (Juggernaut, Glass Cannon, Quicksilver, Lifebinder).

## Armour and weapons (`data/proficiency.json`)

- Everyone can wear cloth and use simple weapons (dagger, mace, spear, staff, javelin). Leather, mail, plate,
  shields, martial weapons, bows and arcane implements need **training** from a class node, a talent, or an
  **enchantment** ("of the Bulwark" = plate training, "of the Hauberk" = mail…) on the item itself or anything else worn.
- Training is not Strength: mail needs 12, plate 15, the heaviest shields 14–15, two-handed heavy weapons 13 —
  whatever grants the training.
- A refused item says exactly what is missing, e.g. *"Plate Armor: Plate armour needs training (the Warrior's Plate
  Drill, the Paladin's Plate Training, the Plate Training talent or an item of the Bulwark) and 15 Strength (you
  have 11)."*
- **Dual wielding**: Warrior, Ranger, Rogue, Wayfarer, Duelist, Shadowdancer, Gravecutter, Bladesworn, Wrathborn (or
  the Two-Weapon Fighting talent) may hold a second one-handed weapon; it strikes right after each main-hand swing
  for Farhold's off-hand share (60%) of its own damage.

## Health, mana, stamina, carrying

- **Health**: 46 + each class level's growth + Constitution + gear. **Mana**: 20 + class growth + your best casting
  attribute + gear. Out of a fight both come back at 4% a second.
- **Stamina** (Guessed numbers, `data/combat.json`): 80 + Constitution + Dexterity; sprinting costs 12 a second,
  a dodge roll 25 (4 m, a third of a second where nothing hits you), a power attack 20 (×1.8 damage), each blocked
  hit 10 (a shield takes 60% off, a weapon parry 30%). It comes back 1 second after you last spent it.
- **Carry weight**: 70 kg + Strength + Constitution. Every item has a weight (`data/inventory.json`). Over the limit
  you walk at half speed and cannot sprint. No bag slots.

## Damage, the numbers on a tooltip

- **Weapon power** = Farhold's weapon dice × the level curve (+11% a level) × your attribute share × melee/ranged
  bonuses. **Spell power** = 7–11 at level 1, +11% a level, plus half a magic weapon's dice, × the spell's attribute
  share (Intelligence, Wisdom or Charisma) × spell bonuses. Healing power adds Wisdom's heal share.
- A spell's hit = power × its share (e.g. 140%) × Farhold's long-cooldown bonus (+8% per second of cooldown past 4)
  × class depth × school bonus (e.g. +8% Frost). Then Farhold's own strike: critical hits, armour (100 / (100 +
  armour)), magic resistance, blocks, barriers.
- The tooltip shows exactly this, with your numbers: *"Deals 62–96 Holy damage to everything within 6.5 m of you."*
  and under "How it's worked out": *"Spell power (Wisdom) 18–28 x 140% (Blessed Earth) x 1.96 (its 16s cooldown) x
  1.25 (Paladin level 6) = 62–96 per hit, before armour."*
- Magic weapons attack with spell power in their own style — next section.

## Magic weapons: wands, tomes, staves, sceptres, off-hand foci (2026-11-24)

Owner: *"Did you keep the itemization from Thousandvale? Especially wands and tomes having special attacks or other
effects. I'd like to see those elements in this new game too."* Which style an item has is **Thousandvale's**
(`thousandvale/js/rules/caster-forms.js` + its `caster-forms.json`, borrowed through `js/rules/farhold.js` and pinned
by the drift guard); Oathwild fights it with its own world-sim shapes (`js/rules/casters.js` makes the plan,
`js/rules/caster-attack.js` carries it out) and writes the item card **from the same plan**, so a card never promises
what the attack does not do. Oathwild's own knobs are in `data/casters.json`.

- **Every magic item is made with an element** (Farhold's: Fire, Frost, Lightning, Poison, Shadow, Arcane — the name
  says it, "Flame Wand"), and its hits leave that element's status (Burning, Chilled, Shocked, Poisoned, Cursed;
  Arcane leaves none). Same item id = same element and style, so an old saved item learns them the first time it is
  seen and keeps them.
- **Damage** = spell power (Intelligence) × 80% (a magic weapon's share) × the style's share × the element's school
  bonus. Mana: none. Half the weapon's own dice add to spell power (so does an orb or tome in the off hand).
- **Wands** roll one of 13 styles, weighted like Thousandvale (`w`): True Bolt (3), Bursting Bolt, Fan of Three, Chain
  Bolt, Seeking Bolt, Heavy Bolt, Cone, Beam, Forking Bolt (2 each), Ring, Lobbed Blast, Warding Bolt, Lingering Bolt
  (1.5 each). The first six are Farhold's wand behaviours with Farhold's numbers. A bolt hits the first enemy and half
  that to everything within its splash; a fan throws three bolts (45% each); a chain jumps up to 2 more times to the
  nearest enemy within 8 m at 65% of the hit before; a seeking bolt turns toward the nearest enemy ahead (14 m, 50°,
  5 radians a second — Guessed); a heavy bolt flies at 60% speed and hits for 145%; a cone is 52° × 9 m; a beam is
  18 m × 1.2 m, instant; a ring hits everything within 5 m of you; a lob lands where the crosshair points (clamped to
  16 m, 20 m a second) for everything within 3 m; a fork splits into 2 shards (50%) to other enemies within 8 m; a ward
  adds 2% of maximum health as a shield per attack that hits (up to 10%, 4 s); a lingering bolt leaves ground 4.8 m
  across that strikes every 0.75 s, 4 times, for 20%.
- **Tomes** (one hand, main hand) roll one of four forms on a 1.5× slower clock, hitting harder: **Rune** (a lob
  onto the crosshair, 3.6 m, 130%; the sigil shows on the ground first), **Column** (a lance 22 m × 1.8 m, 115%),
  **Gale** (a 72° cone 11 m long, 120%), **Brand** (a heavy bolt, 105%, leaving burning ground 6 m across for 4 s,
  5 strikes of 25%). **In the off hand** a tome adds **Echo** (Oathwild's choice — Thousandvale made tomes main-hand
  only; Guessed).
- **Staves** (two hands): 22% have one of Thousandvale's styles — **Lance** (a lance 16 m × 1.4 m, 85%) or **Aegis
  Ring** (5 m round you, 60%, and a 3% shield for you and every ally inside it, up to 12%, 5 s); the rest cast
  Farhold's element spell: a cone, a nova round you, a wave (a wide line), a lobbed flask, a chain (13 m, 3 jumps) or
  burning ground (placed up to 14 m away, 3 strikes a second apart — Guessed). A new hero's first staff is always a
  **Lance** (`starter`, Guessed), so a starting Mage has a readable ranged attack.
- **Sceptres** swing in melee (Farhold's two-strike pattern: Overhead 2.9 m then Slash 2.5 m) and deal their element
  instead of physical damage, for 100% × each strike's share (Guessed).
- **Off-hand riders** (only with a wand, tome or sceptre in the main hand): **Echo** — every fourth attack repeats
  0.25 s later at 60%; **Burst** — a hit bursts 2.5 m round the first enemy struck for 35%; **Ward** — a hit adds a
  2% shield (up to 10%, 4 s); **Siphon** — a hit gives 2 mana back. An **orb** is an off-hand implement only (refused
  in the main hand) and rolls Burst (2), Siphon (1) or Echo (1); the foci (Warded Focus, Rune Aegis, Arcane Bulwark)
  give Ward, the Spellguard Orb gives Burst.
- A **quarterstaff** stays Farhold's pole for its element (it keeps the old plain arcane bolt) — Farhold made it a pole
  on purpose and Oathwild's druids start with one.
- **Named casters** (`casters.json named`, a 12% chance on a boss's corpse or chest): Wand of the Ninth Star (arcane
  Fan — Thousandvale's), Hearthkindle Wand (fire Lingering Bolt), Stormcatch Sceptre (lightning), Rimebough Staff
  (frost nova); **The Lost Tome** quest gives the Barrow-Lantern Tome (shadow Column).
- **Where they come from**: the `magic` loot kind (wands most, then tomes and orbs, staves, sceptres and the four
  foci) drops from people, elites, bosses and chests; Pell Dunmore (Larkford) and Quartermaster Bree (Thornwatch)
  sell them.
- **Aiming**: bolts, cones and beams go along the crosshair; a lob or placed style lands on the crosshair's ground
  point (the client sends it with the attack, the server clamps it to the reach) and shows the ground indicator while
  you attack; a ring needs no aim.
- **Timing**: held down, each attack is timed from when the last was due, so the rate over a fight is exactly the
  card's "every 0.48s" (not rounded up to 20 Hz ticks).

## Spells and aiming (ARCH.md "Spell targeting")

Targeting kinds: **bolt** (flies along your aim), **ground** (placed where your aim meets the ground, clamped to
range), **cone** (in front of you), **line** (a beam or a dash ahead), **self** (on you, or round you), **beam** (held:
ticks while you hold the button). Ally spells (Kindly Light, Mercy's Touch) land on the ally nearest your aim within
8°, or on you. Repeats, delays, zones (Ring of Dawn, Blessed Earth), summons, shapes, barriers, revives, taunts,
knockback and pulls all run in the sim.

Farhold rows carry extra rules the round-1 sim does not run yet (resources, afterimages, "consumes", "bonus if",
corpses as fuel…). They are **dropped when Oathwild reads the row**, so no tooltip ever describes a rule that does
nothing; the damage, statuses and shape of the spell stay.

## Buffs and debuffs (`data/auras.json`, Farhold's statuses)

- One of each status per body. A weaker copy from someone else only lengthens the timer; a stronger one replaces
  it. Stacking statuses (a dart's poison, frostbite) add stacks up to their limit.
- Damage over time lands once a second (Farhold), credited to whoever applied it (threat and the kill).
- **Cures**: magic, poison and curse cures each remove their kind; bleeds can't be cured (they run out).
- **Control**: rooted (can't move), asleep (can't act until hit), feared (runs), silenced (can't cast), stunned.
- The buff bar gets each status's icon id, time left, stacks, and a tooltip with its live numbers.

## Monsters

- Farhold's monster rows, scaled to Oathwild's two regions (`data/monsters.json`), at levels from the region and
  camp (`data/regions.json`): Brightwater Vale 1–5, Thornmere Wilds 5–10. Oathwild monsters have 3× Farhold's
  health and 1.7× its damage, and grow 30% health and 10% damage a level (`data/combat.json`; Guessed, tuned so a
  level-matched monster takes a few seconds to ten to kill solo and two at once are a real fight).
- They notice you inside their range (much closer if you **sneak**), fight whoever has the most threat (damage, and
  half of healing; a taunt forces them), and give up past 45 m from home — walking back unhurtable, healed.
- Camp bosses use champion numbers ×1.5 health. No wisps (lessons rule 72): the Guardian Light wisp is not used.

## Death

Downed at 0 health for 30 s: an ally holding Interact for 3 s within 3 m brings you back at 30% health (a cleric's
Lift the Fallen from 8 m). Otherwise respawn at your last shrine for 5% of your gold (at most 15 × level) and 10
durability off each worn piece. A piece at 0 durability is **Broken**: it gives nothing until repaired.

## Loot (owner: individual loot)

- A corpse, chest or bag holds **separate contents for each player** who helped. Your share is rolled the first time
  you open it (the same every time you look); nobody else can see or take it.
- **Gold sits in the window until you take it.**
- Items: Emberveil bases with Farhold affixes, item level within one of the container's level, rarity weighted by
  the table (bosses always magic or better). 5% of magic-or-better armour and jewellery carry a training
  enchantment ("of the Bulwark").
- World chests **refill per player** (20–45 minutes); what you leave in your fill stays until it refills. Locked
  chests need a Lockpicking roll.

## Use-skills (non-combat, `data/skills-use.json`)

Sneak, Lockpicking, Pickpocket, Speech, Enchanting rise 0–100 by doing them (Smithing and Alchemy are in the data,
waiting for their benches in a later round). Each milestone (25, 50, 75, 100) gives a talent point and a named perk
(Soft Soles, Master Hands, Haggler, Second Rune…). Classes and backgrounds give head starts; a few classes need one
(Shadowdancer: Sneak 30).

## Enchanting and the horse (round-1 extras)

- **Break** a magic, rare or legendary item to learn one of its enchantments (two from a rare with Keen Reader).
  **Put** a learned enchantment on your own gear at a shrine for gold: its strength is a fresh roll for the item's
  level × (60% + Enchanting × 0.5%). One per item (two at Enchanting 50, three at 100, +1 with Runic Hand).
- **Horse**: bought at a stable (120 gold, Guessed); call it standing still out of combat; ×1.9 speed; a hit or an
  attack throws you off.

## Respec at a shrine (owner: paid, rising with level)

- **Points** (cheaper, 6 × level² gold): every class point and talent point back; paths cleared; class levels and
  attributes stay.
- **Full** (dearer, 30 × level² gold): also every class level and level-up attribute point — then re-pick a class for
  each level.

## The shared world (`js/rules/world-state.js`)

One saved world per group: world flags and each player's own flags (a pact, a contract), quest steps and counts that
belong to the world with each player collecting a finished quest's reward once (even a player who joined later),
cleared camps and their respawn time, chest fills per player, discovered shrines and each player's home shrine.
Quest content is the world builder's; this is the state it reads and writes.

## Tuning

`node prototypes/oathwild/tools/sim-levels.mjs --fight` prints every base class's numbers per level with damage a
second and a level-matched fight; `--class paladin`, `--plan warrior,warrior,cleric,…` or `--all` for others.
