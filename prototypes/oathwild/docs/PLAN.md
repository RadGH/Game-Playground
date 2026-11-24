# Oathwild — plan

A third-person open-world fantasy RPG for 1–10 players sharing one persistent world. The heart of it is **levelling**:
every level you choose a class to advance (multiclass, D&D-style), each class is a horizontal tree of unlocks by class
level (Pathfinder-style) including higher **ranks** of spells you already know, plus attributes, skills and talents
that other systems unlock. Thousandvale's weapon and spell systems, aimed from over the shoulder.
Independent project by Radley Sustaire. Working name "Oathwild" (Guessed — owner may rename).

## §0 Rulings (owner 2026-11-23 unless marked Guessed)

### Owner's brief (verbatim points)
- Skyrim-type game, a lot like Thousandvale but **not an MMO**. Big focus on **levelling up**: attributes, skills,
  talents, and other things unlocked by other systems.
- Thousandvale's **weapon system** and **spell system**. Player **aims in third person**; **indicators when targeting
  zones** for spells.
- **Buffs and debuffs** like WoW/Skyrim, with **real damage and percentage values** on spell and item tooltips.
  Tooltips for descriptions and calculations are very useful and **must be standardized**.
- **Co-op up to 10 players.** **Open world map with leveled regions.**
- **Items never drop on the ground**: exchanged in interfaces with corpses, chests or other loot bags. **Gold must be
  looted.**
- **Every level up you pick a class** (level an existing one or unlock a new one). A certain level of Paladin unlocks
  **plate armour**, which requires **high Strength**. A Mage can't wear plate unless an item affix or talent allows it.
- Enemies through the fal.ai workflow (avatar-3d/fal). **$25 credit added.** fal.ai should also make **low-poly props**
  to replace Thousandvale's programmer-art props.

### Answers to the kick-off questions
| Question | Ruling |
|---|---|
| Devices | **PC + controller first.** Phones can join with a simpler control set (aim assist, tap-to-place zones), not the design target. |
| Co-op | **Shared persistent world**: one saved world a group owns together (≤ 10 players); quest/map progress belongs to the world, characters keep their own gear/levels. Own Node server on games.radgh.com. |
| Setting | **New original world and map** (World Forge tools), Thousandvale stays separate. |
| Classes | **Up to 30, consolidated from Farhold/Thousandvale/Emberveil** (owner 2026-11-23: "Review the spells in Thousandvale and Emberveil and reuse a lot of what we already had. We could probably go up to 30 classes in total … consolidate them down and keep what's most interesting"; replaces the first '6 open + 4 unlockable'). Settled at **27**: 8 base (Warrior, Ranger, Rogue, Mage, Cleric, Druid, Bard, Shaman), 13 advanced (8 in round 1: Paladin, Spellblade, Warlock, Wayfarer, Pyromancer, Stormcaller, Necromancer, Witch Hunter; 5 after the cap rises: Dragon Knight, Chronomancer, Oracle, Tinker, Starcaller) and 6 specialty classes (Duelist, Shadowdancer, Spellfletcher, Bladesworn, Wrathborn, Gravecutter). Titan Quest-style mastery trees + Pathfinder choices; 127 of the 171 tree spells are reused rows. Table + trees: `docs/CLASSES.md`; rules: `docs/RULES.md`. |
| fal budget | **Props first: ~$12 props / ~$13 enemies.** Props via Trellis-2 (4 per picture ≈ $0.08 each → ~100+), enemies via Tripo P1 + Meshy rig (≈ $0.95 each → ~13). Every call logged in avatar-3d/fal/data/spend.json; hard cap $25. |
| Loot | **Individual loot** (owner changed 2026-11-23, need/greed scrapped): every player who helped gets their OWN contents in a corpse / chest / bag window, rolled for them, including their own gold. No rolls, nothing to fight over. World chests refill per player on a timer. |
| Death | **Revive or respawn, light cost**: downed players can be revived for a short window; else respawn at the last shrine with a small durability + gold cost. Regions have **fixed level ranges**. |
| Round 1 scope | **Two regions** (starting valley L1–5, a wilder region L5–10), **deep systems** (everything above), a few quests, shrines. More regions in later rounds. |

### Refinements (owner 2026-11-23, second round of questions)
| Topic | Ruling |
|---|---|
| Classes per character | **Unlimited** (Pathfinder freedom), **no spreading guard at all**. Plus **subclasses / specialty (prestige) classes** like Neverwinter Nights 2's, unlocked by requirements (original names/designs). Up to ~30 classes total, consolidated from Farhold/Thousandvale/Emberveil, reusing their spells. |
| Skill trees | Titan Quest-style ranked spells + modifiers bought with class points, gated by class level; Pathfinder choices at class levels. |
| Druid | Shapeshifts into **real animals** (wolf, bear, …), never made-up creatures; can choose **summoner** or **caster** directions instead. |
| Use-skills | **Non-combat only** (Sneak, Lockpicking, Pickpocket, Speech, Smithing, Alchemy, Enchanting…). Combat power comes from classes, attributes, gear, talents. |
| Resources | **Health, mana, stamina** (stamina: sprint, dodge roll, power attacks, blocking hits). |
| Inventory | **Carry-weight limit** (Strength/Constitution), over it you walk slowly; no bag slots. |
| Races | **Humans in round 1** (cultures/backgrounds as looks + small bonuses); races (elf, dwarf, orc…) later as new Tabard bodies. |
| Story | **Main story thread** (Brightwater Vale → Thornmere Wilds, a boss, a hook onward) + **6–8 side quests per region**; quest progress belongs to the world, rewards to each player. |
| Tone | **Warm high fantasy, WoW-like**: colourful, hand-painted, readable; dark places exist but not grim. |
| Respec | **Paid at shrines** (gold rising with level): points + talents cheaper, classes + attributes dearer. |
| Round 1 extras | **Enchanting** (break magic items to learn affixes, put them on your gear) and **mounts** (a rideable horse). Smithing, Alchemy, cooking/gathering: later rounds. |
| Specialty classes (rules core, 2026-11-23) | Settled as 6 specialty classes with 5-level trees and original names (Duelist, Shadowdancer, Spellfletcher = arrows that carry spells, Bladesworn = weapon master, Wrathborn = berserker, Gravecutter = assassin found by a contract); Paladin and the other unlocked full classes are "advanced". No limit and no spreading penalty — the combat test only reports how builds compare. |

### Spell visuals (owner 2026-11-23: "more elaborate spell effects like in WoW")
Every spell is a **layered, phased visual**, not one projectile. Owner's three points:
1. **Wind-up**: a targeting mode while aiming, and the caster's **hands light up** in the element (fire licking round
   the hands, gathering motes, a glow on the hand bones) — attached to the Tabard hand bones, held while aiming/casting.
2. **Ground effects** (e.g. a holy ground spell, the owner's example being WoW's hallowed-ground spell): a
   **projected texture** on the ground (rune circle decal that conforms to the terrain, slowly turning, pulsing),
   an **expanding cylinder** (a shell of scrolling, see-through painted texture rising from the edge), and **many
   particle emitters, each with its own custom texture** (motes rising, sparks, flame licks, smoke) — not one projectile.
3. **Impact effects**: burst flipbook, shockwave ring, sparks/debris, a scorch/frost decal that fades, a light flash,
   small camera shake for big hits.
How (Guessed): a data-driven **spell visual kit** — reusable experiment `avatar-3d/spellkit/` (Wyrmroad and others can
use it later), building on avatar-3d/js/spellfx.js. Phases `windup → aim (indicator) → release → travel → impact →
linger (ground)`, each a list of layers: `decal` (projected onto the ground), `shell` (cylinder/cone/sphere with a
scrolling alpha texture), `emitter` (GPU particles: rate, life, size/colour curves, texture or flipbook, attach to a
bone or a point), `flipbook`, `ribbon` (trails), `mesh`, `light` (pooled, never toggled — shader-recompile rule),
`shake`. Data in `data/spell-visuals.json` per spell; custom textures painted by Codex (flame/smoke flipbooks, rune
circles, cylinder bands, sparks) plus shader noise. A review page (Spell Lab) plays each spell's phases on a Tabard
caster vs. a target dummy with slow motion. Budget: a group of 10 players casting must hold frame rate (instanced
particles, pooled materials, a cap per effect + a global particle budget, lower tiers on phones).

### Guessed (Claude's calls — owner may overrule)
- **Heroes**: Tabard characters (avatar-3d/tabard: swappable armour, the new face/hair layers, Chibi 2.6 look fields)
  — the owner's direction is "Tabard for main characters, fal for monsters". Enemies: avatar-3d/fal roster + new ones.
- **Classes**: 27, owner 2026-11-23: up to 30, consolidated from Farhold/Thousandvale/Emberveil (`docs/CLASSES.md`
  has every source class → kept / merged / new, and the trees). Guessed within that: which 8 are base; requirements
  (Paladin Warrior 3 + Cleric 1 + Str 14 + Wis 12; Spellblade Warrior 2 + Mage 2 + Int 13; Warlock Mage 3 + a pact
  found in the Wilds; Wayfarer Rogue 2 + Druid 2 + Dex 14; Pyromancer Mage 3 + Int 14; Stormcaller Mage 2 + Shaman 2;
  Necromancer Mage 2 + the barrow tome; Witch Hunter Ranger 2 + Cleric 1; specialty classes in CLASSES.md); 2 class
  points a class level; rank r needs class level + 2 × (r − 1); +5% spell power per level of the spell's class;
  paths at class level 3; capstone choice at the last level; a third druid shape (Mountain Cat — the art helper made
  the body). Character level cap round 1: 10 (game cap later 30).
- **Attributes**: Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma (D&D six). +1 point at every even
  character level; class levels give their own bonuses. Armour needs: plate Strength 15, mail Strength 12, etc.
- **Proficiencies**: armour/weapon kinds come from class tree nodes (Paladin 2 → Plate), item affixes ("of the
  Bulwark: can wear plate"), or talents.
- **Skills** (use-based, 0–100, NON-COMBAT only — owner refinement): Sneak, Lockpicking, Pickpocket, Speech,
  Enchanting in round 1; Smithing, Alchemy in data for later. Milestones 25/50/75/100 give a talent point and a perk.
- **Numbers (rules core, Guessed, all in data/)**: point buy 27 (8–15); stamina 80 + Con + Dex; carry 70 kg + Str +
  Con; XP 150 → 5,800 for levels 2–10; monsters 3× Farhold health, 1.7× damage, +30% health / +10% damage a level;
  dual wielding for Warrior, Ranger, Rogue and the light-blade classes; respec 6 × level² gold (points) / 30 × level²
  (everything); horse 120 gold. Tuning tool: `tools/sim-levels.mjs`.
- **Talents**: a point every 3 character levels + skill milestones; talent rows gated by attributes/skills.
- **Combat**: action combat, over-the-shoulder camera, crosshair aim; melee swings hit what's in the arc; spells:
  projectile (aimed), ground zone (circle/cone/line indicator, placed at the crosshair, colour by friend/foe),
  self/aura, targeted beam. Server-authoritative sim at 20 Hz (like Wyrmroad/Thousandvale), client prediction for
  the local hero.
- **Tooltips**: one shared tooltip module (in-page panel, never browser `title`): name, kind line, cost/cast/cooldown
  line, the description with **live numbers** from the player's stats ("Deals 42–51 Fire damage (120% of spell
  power)"), a "How it's worked out" expandable line showing the formula with the hero's numbers, and green/red
  comparisons for items. Same component for spells, items, buffs, talents, class nodes.
- **World**: hand-shaped map from World Forge; region 1 "Brightwater Vale" (farms, river, starting village, bandit
  camp, goblin warren, old shrine), region 2 "Thornmere Wilds" (forest + marsh, ruins, undead barrow, troll bridge,
  druid circle). Fast travel between discovered shrines (not "flight path" — banned word).
- **Save/persistence**: the world server keeps a world file per world (JSON on disk; Postgres later if needed);
  characters on the RGS account (signed in) or a local profile + cloud save.

## Rounds
1. **Round 1 (this)**: core sim + server + client, two regions, all levelling systems, combat, spells with indicators,
  auras, tooltips, loot windows (individual loot per player), gold, death/shrines, a few quests, fal props + enemies, Tabard heroes.
2. Later: more regions (6–8 total, levels to 30), dungeons, crafting (Smithing/Alchemy benches), more unlockable
   classes, housing?, world events.
