# Oathwild — combat + class rebuild brainstorm (2026-11-26)

Everything the owner raised on 2026-11-26 (and the earlier rulings it touches), what each means in practice, where it
stands, and the calls Claude made that he can overrule. Status: **done** · **in progress** (a helper is on it) ·
**planned** · **question**.

## 1. The look of the world

| # | Owner said | What it means | Status |
|---|---|---|---|
| 1 | "Where did these low poly mvp trees come from? … Remove these unless they can be greatly improved. They sit too low and block view of enemies." | The flat dark cone pines were a fallback (yesterday's fix #132 for invisible tree collision drew skipped trees with the old untextured model). Every tree is drawn by the textured storybook renderer on every quality setting; lowest needles/leaves at least 5 m up so the over-the-shoulder camera sees enemies under them. | done |
| 2 | "No longer allow any new models of any type … unless they have textures." | Rule for Oathwild and every 3D game (lessons rule 77) + a test: no untextured model ships, not as a fallback, not on a low setting. Existing flat-colour scenery is listed and may only shrink. | done |

## 2. Screens

| # | Owner said | What it means | Status |
|---|---|---|---|
| 3 | "Why is there a use button … every interaction has its own popup." | Phone Use button removed; the on-screen prompt (tap = use, hold = revive) and tap-to-use stay; E / pad button on PC stay. Phone buttons re-laid: stick left, Dodge beside a big Attack. | done |
| 4 | "the class screen open[s] a tooltip popup as soon as you open the menu" | A window focusing its first button (for the controller) no longer opens a tooltip; only a focus you move does. Fixed in the shared tooltip code, so every window in every game that uses it benefits. | done, checked on phone + desktop |
| 5 | "Redesign class menus" | Class window: one row per class level (phone scrolls down, never sideways), a node's card opens right under its row with Learn. Each weapon/armour training has its own icon. | done |

## 3. Class trees

| # | Owner said | What it means | Status |
|---|---|---|---|
| 6 | "more choices every tier, and remove the subclasses like warrior bulwark and reaver" | No paths. 3–7 choices at every class level, 2 at the capstone. | done (22 trees) |
| 7 | "each icon is a single rank, multiple ranks appear in higher level as separate icons … that require the predecessor" | Cleave (lvl 1) → Cleave II (lvl 4, needs Cleave) → Cleave III (lvl 7, needs II). | done |
| 8 | "armor proficiency (always its own node …)" | Leather Armour, Mail Armour, Plate Armour, Shield Training each a node. | done |
| 9 | "Remove Arms Drill … separate nodes for sword, mace, axe, 2h, wand proficiency. Always as separate options, never grouped." | One training node per kind: dagger, sword, axe, mace, spear, staff, two-handed, bow, crossbow, wand, sceptre, orb, tome, dual wielding. The starting kit's trainings come free at level 1. Weapon Mastery nodes (+25% with that kind) need their training. Talents and item enchantments grant single kinds too. | done |
| 10 | "no small percentage in the skill tree except for crit chance … 25% increased damage on talents, not 2%" | Every percent on a passive or talent is 20+ (25 the norm); crit chance may be a few %. Talents are one rank each. A test enforces it. | done |
| 11 | "Fewer defensive abilities. Fewer heals. Focus on combat for now" | At most one heal and one purely defensive spell per class (test). Cleric keeps Heal + Revive (co-op needs a revive); Holy Nova no longer heals. | done |
| 12 | "Rename everything … allow common terminology like shield bash. No made up names … rim and gyre banned … Ban 'shove'" | Plain names, ≤ 3 words, words players know; rim/gyre/shove banned in every game; generic words (Blink, Ambush, Swipe, Counterspell…) allowed for abilities; coined names from one game stay banned. Test + game-lint. | done |

## 4. Combat

| # | Owner said | What it means | Status |
|---|---|---|---|
| 13 | "every enemy … in a pack of 5 or more … get rid of it" | Encounters: mostly 1 enemy, some 2, rarely 3; bosses alone or with ≤ 2 guards; spaced so pulling one doesn't pull the next. Kill quests keep enough targets. | done |
| 14 | "I can barely fight 1v1 … you haven't balanced yet" | A simulation fights each class at levels 1/3/5/10 against 1, 2, 3 same-level foes. Goal: 1 foe dies in ~6–10 s with ≤ 35% of your health lost; 2 is a real fight you win with abilities and dodges; 3 is dangerous. A test pins the goal. | done |
| 15 | "redesign combat, improve movement and dodging" | Snappier dodge (~5–6 m in ~0.3 s, untouchable through most of it, a roll), 3–4 dodges per fight; attack while moving; enemy attacks have a visible wind-up you can dodge; hit reactions on everything. | done |
| 16 | "I don't want to sit still auto attacking like an npc" | Cheap core abilities on 2.5–3 s cooldowns so you use an ability every few seconds; bigger ones at 7–14 s; capstones 25–60 s. | done in the trees |
| 17 | "smack things in a circle knocking down enemies around me" | Real knock-back (a throw over ~0.4 s, not a teleport) and knock-down (lies flat, gets up). Warrior Ground Slam: 7 m circle, knocks everyone down 2 s. Every class has knock on its big abilities (test). Bosses resist most of it. | done |
| 18 | "No simple projectiles … except for basic wands. Every ability: nova, aoe, cone, line" | Abilities are novas, cones, lines, ground circles, leaps (new: jump to a spot and slam) and charges. Wand basic attacks stay bullets. | done in data (test) |
| 19 | **"Fireball as an exception … massive, twice the size of your head, spinning with trailing embers falling and a huge explosion. Not just a dink on the enemies little toe."** | Fireball is a real aimed projectile from the hand: a ~0.5–0.6 m ball, visibly spinning, bright core + flame shell + halo, a long trail of embers that fall and fade, smoke behind. It bursts on the first enemy or at the end of its 30 m range: everything within 4 m (5 m at rank II, 6.5 m with Big Fireball) takes full damage, burns, is thrown back 2.5 m (rank III also knocks down). Explosion: fireball burst at the real radius, shockwave ring, debris + embers, scorch mark, light flash, strong shake. It is the Mage's starting spell. | done |

## 5. How it looks and moves

| # | Owner said | What it means | Status |
|---|---|---|---|
| 20 | "Do a case study on the paladin from Thousandvale" | `docs/CASE-PALADIN.md`: Thousandvale draws ~230 pieces per paladin swing vs 32 (16 on a phone) in Oathwild; melee spells played no swing; Sunlance drew no beam; phones got half; camera shake did nothing; colours never glowed. | done |
| 21 | "TRIPLE the amount of graphics used EVERYWHERE for ALL spells and attacks" | Every ability: wind-up (glowing hands, gathering sparks, ground rune), release flash + burst, a body + trail in flight, impacts over the ability's real shape and size, a lingering mark, target reaction, shake + a short hit freeze — 3× the old counts, the same on phones. | done |
| 22 | "Sunlance and cleave don't even do an attack animation" | Every ability plays a swing/slam/cast pose on the key press (not after the server answers); spins and slams built where no clip exists. | done |
| 23 | "Stop making boring decisions and update your workflow so this doesn't happen again for other games" | lessons rules 77 (untextured), 78 (skill trees), 79 (names) + combat-balance and spell-look rules; game-standards §13 "Action combat and ability design"; tests that enforce the tree rules. | done |

## 6. Calls Claude made (Guessed — overrule any in one line)

1. **2 class points a level**, 3–7 nodes a level → by class level 10 you own a bit under half of a tree, so two
   characters of one class can differ a lot.
2. **Rank II = +40% power, rank III = +80%** plus an extra effect on III (bleed, knock-down, root…).
3. **Weapon Mastery = +25%** with that kind; elemental Study passives +25%; talents +25–50%; cornerstones bigger
   with a drawback (Glass Cannon +50% spells, −25% health).
4. **The starting kit's trainings are free** (Warrior: Sword, Shield, Mail) so a new hero can wear what they start in.
5. **Cleric keeps one Heal and a Revive**; no other class heals except one ability at most.
6. **Mage covers fire, frost, arcane and lightning**; the Pyromancer/Stormcaller go bigger in one element.
7. **Old characters** are moved onto the new trees when they join (points refunded, old nodes removed).
8. **Bosses** take a quarter of knock-back and a third of knock-down.
9. **Specialty classes** (Duelist, Shadowdancer, Spellfletcher, Bladesworn, Wrathborn, Gravecutter) are KEPT — they
   are separate prestige classes from your 2026-11-23 ruling, not subclasses inside a class. **See question A.**

## 7. Answers (owner 2026-11-26)

- **A. Specialty classes: keep them** (they are their own classes, rebuilt to the new tree rules).
- **B. Base 8 first**: Warrior, Ranger, Rogue, Mage, Cleric, Druid, Bard, Shaman get the full balance run, effects
  and animation check this round; the 14 unlockable classes follow the rules and pass the tests, polished next round.
- **C. Bows and wands**: "Ranger can keep a basic projectile attack, but their spells should be more elaborate. Wands
  should not all be projectile, see Thousandvale. I want those wands, some shoot multiple projectiles, some cone of
  fire, etc. Basic projectile wands are still lame, make them all interesting or else they aren't worth using."
  → The Ranger's basic bow shot stays one arrow; every Ranger ability is an area. Wands never roll the plain
  single-bullet styles (True Bolt, Seeking Bolt, Heavy Bolt) any more: they roll Bursting Bolt, Fan of Three, Chain
  Bolt, Cone, Beam, Ring, Lobbed Blast, Forking Bolt, Warding Bolt or Lingering Bolt; old saved plain wands change once
  to one of those; the starting wand fans three bolts (`data/casters.json` noPlainBolts). Every wand style gets the
  3× look.
