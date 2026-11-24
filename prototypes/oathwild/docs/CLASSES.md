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
*Paths (choose one at level 3):* **Bulwark** — Shield first: taunts, stuns and blocks that hold the line. **Reaver** — Two hands on the hilt: spinning cuts and huge single blows.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Cleave *(farhold)* | spell, free | 3 |  |
| 1 | Arms Drill (leather, mail, shield, martial) | training, free | 1 |  |
| 1 | Hardy | passive | 3 |  |
| 2 | War Cry *(farhold)* | spell | 3 |  |
| 2 | Breaching Shove *(farhold)* | spell | 3 |  |
| 3 | Rim Strike *(farhold)* | spell | 3 | Bulwark |
| 3 | Shield Wall | passive | 3 | Bulwark |
| 3 | Iron Gyre *(farhold)* | spell | 3 | Reaver |
| 3 | Heavy Hands | passive | 3 | Reaver |
| 4 | Wide Arc | modifier of Cleave | 1 |  |
| 5 | Challenge *(farhold)* | spell | 3 | Bulwark |
| 5 | Precise Strike *(farhold)* | spell | 3 | Reaver |
| 6 | Iron Resolve *(farhold)* | spell | 3 |  |
| 6 | Plate Drill (plate) | training | 1 |  |
| 7 | Ringing Rim | modifier of Rim Strike | 1 | Bulwark |
| 7 | Red Gyre | modifier of Iron Gyre | 1 | Reaver |
| 7 | Battle-Hardened | passive | 2 |  |
| 10 | Groundbreaker *(farhold)* | spell | 3 | capstone (pick one) |
| 10 | Unyielding | passive | 1 | capstone (pick one) |

### Ranger — Base
Long shots, quick feet and traps laid where the enemy will walk. *Requires:* open at creation. *Growth a level:* +8 health, +4 mana. Fights with two weapons.
*Paths (choose one at level 3):* **Marksman** — One arrow, one body: long draws, piercing shots, deadly criticals. **Trapper** — Snares, caltrops and arrow storms that own the ground.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Long Draw *(farhold)* | spell, free | 3 |  |
| 1 | Woodcraft (leather, bows, martial) | training, free | 1 |  |
| 1 | Keen Eye | passive | 3 |  |
| 2 | Broadhead Fan *(farhold)* | spell | 3 |  |
| 2 | Tracker's Leap *(farhold)* | spell | 3 |  |
| 3 | Deadeye Shot *(new)* | spell | 3 | Marksman |
| 3 | Steady Aim | passive | 3 | Marksman |
| 3 | Hunter's Snare *(farhold)* | spell | 3 | Trapper |
| 5 | Heartseeker | modifier of Long Draw | 1 | Marksman |
| 5 | Caltrop Scatter *(farhold)* | spell | 3 | Trapper |
| 6 | Arrow Storm *(farhold)* | spell | 3 |  |
| 6 | Fleet | passive | 2 |  |
| 7 | Sprung Steel | modifier of Hunter's Snare | 1 | Trapper |
| 10 | Endless Quiver | modifier of Arrow Storm | 1 | capstone (pick one) |
| 10 | Wind Reader | passive | 1 | capstone (pick one) |

### Rogue — Base
Strikes from where you aren't looking, poison on every edge. *Requires:* open at creation. *Growth a level:* +9 health, +3 mana. Fights with two weapons.
*Paths (choose one at level 3):* **Cutthroat** — Gutting strikes and sudden stuns for one target at a time. **Poisoner** — Darts and clouds that keep killing after you leave.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Gutting Strike *(farhold)* | spell, free | 3 |  |
| 1 | Light Step (leather, martial) | training, free | 1 |  |
| 1 | Exploit Weakness | passive, free | 1 |  |
| 1 | Quick Fingers | passive | 3 |  |
| 2 | Nimble Feet | passive, free | 1 |  |
| 2 | Sucker Punch *(farhold)* | spell | 3 |  |
| 2 | Shroud *(farhold)* | spell | 3 |  |
| 3 | Grave Mark *(farhold)* | spell | 3 | Cutthroat |
| 3 | Killer's Eye | passive | 3 | Cutthroat |
| 3 | Poison Dart *(farhold)* | spell | 3 | Poisoner |
| 3 | Black Vials | passive | 3 | Poisoner |
| 4 | Slip Free | passive | 2 |  |
| 5 | Open Vein | modifier of Gutting Strike | 1 | Cutthroat |
| 5 | Plague Cloud *(farhold)* | spell | 3 | Poisoner |
| 6 | Knife Storm *(farhold)* | spell | 3 |  |
| 10 | Thousand Cuts | modifier of Knife Storm | 1 | capstone (pick one) |
| 10 | Shadowed Heart | passive | 1 | capstone (pick one) |

### Mage — Base
Shards of ice and raw arcane force. Fragile, and terrifying from range. *Requires:* open at creation. *Growth a level:* +5 health, +9 mana.
*Paths (choose one at level 3):* **Frost** — Slow, freeze and shatter: control the fight from afar. **Arcane** — Wild force and mana-rending blasts: the biggest raw numbers.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Frost Shard *(farhold)* | spell, free | 3 |  |
| 1 | Arcane Study (arcane) | training, free | 1 |  |
| 1 | Mana Font | passive | 3 |  |
| 2 | Mana Shield *(new)* | spell | 3 |  |
| 3 | Rime Burst *(farhold)* | spell | 3 | Frost |
| 3 | Deep Cold | passive | 3 | Frost |
| 3 | Wild Bolt *(farhold)* | spell | 3 | Arcane |
| 3 | Raw Force | passive | 3 | Arcane |
| 4 | Splinter | modifier of Frost Shard | 1 |  |
| 5 | Rime Spear *(farhold)* | spell | 3 | Frost |
| 5 | Arcane Burst *(farhold)* | spell | 3 | Arcane |
| 6 | Overchannel *(farhold)* | spell | 3 |  |
| 7 | Whiteout *(farhold)* | spell | 3 | Frost |
| 7 | Mana Rend *(farhold)* | spell | 3 | Arcane |
| 10 | Stillfrost *(farhold)* | spell | 3 | capstone (pick one) |
| 10 | Archmage | passive | 1 | capstone (pick one) |

### Cleric — Base
Keeps the party standing, and burns what threatens it with light or shadow. *Requires:* open at creation. *Growth a level:* +8 health, +7 mana.
*Paths (choose one at level 3):* **Dawn** — The healer: hallowed ground, mending light, the fallen raised. **Dusk** — The shadow priest: lances of shadow that heal you as they hurt.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Sunlance *(farhold)* | spell, free | 3 |  |
| 1 | Kindly Light *(new)* | spell | 3 |  |
| 1 | Vestments (leather, mail, shield, arcane) | training, free | 1 |  |
| 1 | Devotion | passive | 3 |  |
| 2 | Prayer of Dawn *(farhold)* | spell | 3 |  |
| 3 | Ring of Dawn *(new)* | spell | 3 | Dawn |
| 3 | Mercy | passive | 3 | Dawn |
| 3 | Shadow Lance *(farhold)* | spell | 3 | Dusk |
| 3 | Dusk Hymn | passive | 3 | Dusk |
| 4 | Lift the Fallen *(new)* | spell | 3 |  |
| 5 | Bright Reach | modifier of Kindly Light | 1 | Dawn |
| 5 | Mark the Killer *(farhold)* | spell | 3 | Dusk |
| 6 | Falling Light *(farhold)* | spell | 3 |  |
| 7 | Sanctuary *(farhold)* | spell | 3 | Dawn |
| 7 | Twinlight *(farhold)* | spell | 3 | Dusk |
| 10 | Dawnfall *(new)* | spell | 3 | capstone (pick one) |
| 10 | Lightbearer | passive | 1 | capstone (pick one) |

### Druid — Base
Becomes the wolf and the bear, calls the pack, or speaks with root and storm — choose one way and go deep. *Requires:* open at creation. *Growth a level:* +8 health, +6 mana.
*Paths (choose one at level 3):* **Shapeshifter** — Become a real wolf, then a real bear; your attacks become theirs. **Summoner** — Call wolves and a great bear to fight beside you. **Caster** — Roots, thorns and moonlight from a distance.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Thornlash *(farhold)* | spell, free | 3 |  |
| 1 | Grove Garb (leather, arcane) | training, free | 1 |  |
| 1 | Oakhide | passive | 3 |  |
| 2 | Greensap *(farhold)* | spell | 3 |  |
| 3 | Wolf Shape *(thousandvale)* | spell | 3 | Shapeshifter |
| 3 | Wild Heart | passive | 3 | Shapeshifter |
| 3 | Call the Pack *(farhold)* | spell | 3 | Summoner |
| 3 | Pack Bond | passive | 3 | Summoner |
| 3 | Rootgrasp *(new)* | spell | 3 | Caster |
| 3 | Green Lore | passive | 3 | Caster |
| 5 | Bear Shape *(farhold)* | spell | 3 | Shapeshifter |
| 5 | Call the Great Bear *(new)* | spell | 3 | Summoner |
| 5 | Silver Moonlight *(new)* | spell | 3 | Caster |
| 6 | Cat Shape *(new)* | spell | 3 | Shapeshifter |
| 6 | Mending Rain *(new)* | spell | 3 |  |
| 7 | Pack Leader | modifier of Wolf Shape | 1 | Shapeshifter |
| 7 | Alpha Howl | modifier of Call the Pack | 1 | Summoner |
| 7 | Wrathful Grove | modifier of Thornlash | 1 | Caster |
| 10 | Elder Grove *(new)* | spell | 3 | capstone (pick one) |
| 10 | Old Growth | passive | 1 | capstone (pick one) |

### Bard — Base
Lifts the party with songs, breaks the enemy with discord, or lulls them to sleep. *Requires:* open at creation. *Growth a level:* +7 health, +6 mana.
*Paths (choose one at level 3):* **Valour** — Battle songs and a charge that carries the party with you. **Ruin** — Discord that curses and shatters. **Glamour** — Sleep, slow and bewilder.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Discord Note *(farhold)* | spell, free | 3 |  |
| 1 | Traveller's Kit (leather, martial) | training, free | 1 |  |
| 1 | Stage Presence | passive | 3 |  |
| 2 | Mending Verse *(thousandvale)* | spell | 3 |  |
| 3 | Ballad of Valour *(farhold)* | spell | 3 | Valour |
| 3 | Song of Ruin *(farhold)* | spell | 3 | Ruin |
| 3 | Drowse *(farhold)* | spell | 3 | Glamour |
| 3 | Silver Tongue | passive | 3 | Glamour |
| 5 | Lead the Charge *(farhold)* | spell | 3 | Valour |
| 5 | Shatter Chord | modifier of Discord Note | 1 | Ruin |
| 5 | Lethargy *(farhold)* | spell | 3 | Glamour |
| 6 | Encore | passive | 2 |  |
| 7 | Rally *(farhold)* | spell | 3 | Valour |
| 7 | Grand Finale *(farhold)* | spell | 3 | Ruin |
| 10 | Anthem of Heroes *(new)* | spell | 3 | capstone (pick one) |
| 10 | Living Legend | passive | 1 | capstone (pick one) |

### Shaman — Base
Plants spirit posts that heal, calls a spirit bear, or brings the storm down. *Requires:* open at creation. *Growth a level:* +9 health, +6 mana.
*Paths (choose one at level 3):* **Spirit** — Spirit posts and a spirit bear that guard the party. **Storm** — Thunder rings and storm beams.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Spirit Bolt *(farhold)* | spell, free | 3 |  |
| 1 | Hide and Mail (leather, mail, shield) | training, free | 1 |  |
| 1 | Ancestral Vigour | passive | 3 |  |
| 2 | Mending Post *(farhold)* | spell | 3 |  |
| 3 | Call a Spirit *(farhold)* | spell | 3 | Spirit |
| 3 | Spirit Kin | passive | 3 | Spirit |
| 3 | Thunder Ring *(farhold)* | spell | 3 | Storm |
| 3 | Charged Air | passive | 3 | Storm |
| 4 | Forked Spirit | modifier of Spirit Bolt | 1 |  |
| 5 | Ancestors' Ward *(new)* | spell | 3 | Spirit |
| 5 | Storm Beam *(farhold)* | spell | 3 | Storm |
| 6 | Earthbound | passive | 2 |  |
| 7 | The Great Post *(farhold)* | spell | 3 |  |
| 10 | Spirit Walker | passive | 1 | capstone (pick one) |
| 10 | Greater Post | modifier of The Great Post | 1 | capstone (pick one) |

### Paladin — Advanced
Sworn steel and holy light. The class that opens plate armour. *Requires:* Warrior 3, Cleric 1, Strength 14, Wisdom 12. *Growth a level:* +11 health, +4 mana.
*Paths (choose one at level 3):* **Sentinel** — Guards the party: barriers, taunts and blessed earth. **Zealot** — Hunts the dark: holy blows and a descent from the sky.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Sanctified Blade *(farhold)* | spell, free | 3 |  |
| 1 | Oath Arms (mail, shield, martial) | training, free | 1 |  |
| 1 | Aura of Resolve | passive | 3 |  |
| 2 | Plate Training (plate) | training, free | 1 |  |
| 2 | Mercy's Touch *(thousandvale)* | spell | 3 |  |
| 3 | Blessed Earth *(farhold)* | spell | 3 | Sentinel |
| 3 | Bulwark of Faith | passive | 3 | Sentinel |
| 3 | Holy Vengeance | passive | 3 | Zealot |
| 4 | Searing Edge | modifier of Sanctified Blade | 1 |  |
| 5 | Martyr's Vow *(farhold)* | spell | 3 | Sentinel |
| 5 | Daybreak Descent *(farhold)* | spell | 3 | Zealot |
| 6 | Falling Light *(farhold)* | spell | 3 |  |
| 7 | Shield of Dawn *(new)* | spell | 3 |  |
| 10 | Avatar of Dawn *(new)* | spell | 3 | capstone (pick one) |
| 10 | Unbroken Oath | passive | 1 | capstone (pick one) |

### Spellblade — Advanced
A blade in one hand and a spell in the other — every strike carries magic. *Requires:* Warrior 2, Mage 2, Intelligence 13. *Growth a level:* +9 health, +6 mana.
*Paths (choose one at level 3):* **Runeblade** — Runes that stack on the enemy and an anvil that falls on them. **Riftblade** — Steps through the air and strikes from range with an arcane edge.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Arc Edge *(new)* | spell, free | 3 |  |
| 1 | Battle-Mage Drill (mail, martial, arcane) | training, free | 1 |  |
| 1 | Spellward | passive | 3 |  |
| 2 | Runeskin *(farhold)* | spell | 3 |  |
| 3 | Rune Hammer *(farhold)* | spell | 3 | Runeblade |
| 3 | Rune Lore | passive | 3 | Runeblade |
| 3 | Riftstep *(new)* | spell | 3 | Riftblade |
| 3 | Rift Sense | passive | 3 | Riftblade |
| 4 | Twin Edge | modifier of Arc Edge | 1 |  |
| 5 | Flung Edge *(new)* | spell | 3 | Riftblade |
| 5 | Rend Plate *(farhold)* | spell | 3 |  |
| 6 | Flame-Bound Blade *(new)* | spell | 3 |  |
| 7 | The Great Anvil *(farhold)* | spell | 3 | Runeblade |
| 10 | Spellstorm Blade *(new)* | spell | 3 | capstone (pick one) |
| 10 | Perfect Union | passive | 1 | capstone (pick one) |

### Warlock — Advanced
Bargained power: hexes that rot, a bound fiend, and gates you pay for in blood. *Requires:* Mage 3, something found in the world. *Growth a level:* +7 health, +7 mana.
*Paths (choose one at level 3):* **Fiendbound** — A bound fiend at your side, growing stronger. **Hexer** — Hexes and rifts that spread ruin.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Gnawing Dark *(farhold)* | spell, free | 3 |  |
| 1 | Pact Focus (arcane, leather) | training, free | 1 |  |
| 1 | Dark Bargain | passive | 3 |  |
| 2 | Grave Draught *(farhold)* | spell | 3 |  |
| 3 | Bind a Fiend *(farhold)* | spell | 3 | Fiendbound |
| 3 | Fiend Pact | passive | 3 | Fiendbound |
| 3 | Hex of Ruin *(farhold)* | spell | 3 | Hexer |
| 3 | Malice | passive | 3 | Hexer |
| 5 | Void Rift *(farhold)* | spell | 3 | Hexer |
| 5 | Blood Price *(new)* | spell | 3 |  |
| 6 | A Second Fiend | modifier of Bind a Fiend | 1 | Fiendbound |
| 7 | Abyss Gate *(farhold)* | spell | 3 |  |
| 10 | Pact Fulfilled | passive | 1 | capstone (pick one) |
| 10 | Endless Gate | modifier of Abyss Gate | 1 | capstone (pick one) |

### Wayfarer — Advanced
Bare hands, a staff and a still mind. Fast, hard to hit, no armour needed. *Requires:* Rogue 2, Druid 2, Dexterity 14. *Growth a level:* +13 health, +3 mana. Fights with two weapons.
*Paths (choose one at level 3):* **Open Hand** — Palm strikes that knock down and a fist that shakes the ground. **Still Mind** — Breathe, heal, and spin the staff nine times.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Open Palm *(farhold)* | spell, free | 3 |  |
| 1 | Road Staff (martial) | training, free | 1 |  |
| 1 | Trained Hands | passive, free | 1 |  |
| 1 | Unburdened | passive | 3 |  |
| 2 | Wind Step *(farhold)* | spell | 3 |  |
| 3 | Sweeping Heel *(farhold)* | spell | 3 | Open Hand |
| 3 | Iron Body | passive | 3 | Open Hand |
| 3 | Inner Stillness *(farhold)* | spell | 3 | Still Mind |
| 3 | Calm Breath | passive | 3 | Still Mind |
| 4 | Flowing Palm | modifier of Open Palm | 1 |  |
| 5 | Mountain Fist *(farhold)* | spell | 3 | Open Hand |
| 5 | Ninefold Staff *(farhold)* | spell | 3 | Still Mind |
| 6 | The Far Road | passive | 2 |  |
| 10 | Hundred Steps *(new)* | spell | 3 | capstone (pick one) |
| 10 | Empty Hand | passive | 1 | capstone (pick one) |

### Pyromancer — Advanced
Everything burns. Lines of fire, falling stones and flashovers. *Requires:* Mage 3, Intelligence 14. *Growth a level:* +6 health, +8 mana.
*Paths (choose one at level 3):* **Inferno** — Wide fires and falling stones. **Cinder** — Close and fast: breath of fire and a burning stride.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Firebolt *(farhold)* | spell, free | 3 |  |
| 1 | Flame Study (arcane) | training, free | 1 |  |
| 1 | Kindling | passive | 3 |  |
| 2 | Burning Line *(farhold)* | spell | 3 |  |
| 3 | Flashover *(farhold)* | spell | 3 | Inferno |
| 3 | Wildfire | passive | 3 | Inferno |
| 3 | Wyrm's Breath *(farhold)* | spell | 3 | Cinder |
| 3 | Hot Blood | passive | 3 | Cinder |
| 4 | Twin Bolt | modifier of Firebolt | 1 |  |
| 5 | Cinder Stride *(farhold)* | spell | 3 | Cinder |
| 6 | Scorch *(new)* | spell | 3 |  |
| 7 | Fallstone *(farhold)* | spell | 3 | Inferno |
| 10 | Heart of Fire | passive | 1 | capstone (pick one) |
| 10 | Rain of Stone | modifier of Fallstone | 1 | capstone (pick one) |

### Stormcaller — Advanced
Bolts that fork from foe to foe and a storm you walk inside. *Requires:* Mage 2, Shaman 2. *Growth a level:* +6 health, +8 mana.
*Paths (choose one at level 3):* **Tempest** — The eye of the storm over a whole field. **Conduit** — Step as lightning and chain it further.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Forked Bolt *(farhold)* | spell, free | 3 |  |
| 1 | Storm Garb (arcane, leather) | training, free | 1 |  |
| 1 | Static Skin | passive | 3 |  |
| 2 | Static Lash *(new)* | spell | 3 |  |
| 3 | Eye of the Tempest *(farhold)* | spell | 3 | Tempest |
| 3 | Squall | passive | 3 | Tempest |
| 3 | Bolt Step *(farhold)* | spell | 3 | Conduit |
| 3 | Conductor | passive | 3 | Conduit |
| 5 | Long Fork | modifier of Forked Bolt | 1 | Conduit |
| 5 | Storm Beam *(farhold)* | spell | 3 |  |
| 6 | Thunder Ring *(farhold)* | spell | 3 |  |
| 7 | Wide Eye | modifier of Eye of the Tempest | 1 | Tempest |
| 10 | Living Storm | passive | 1 | capstone (pick one) |
| 10 | Skybreaker *(new)* | spell | 3 | capstone (pick one) |

### Necromancer — Advanced
Raises the dead to fight for you, or rots the living where they stand. *Requires:* Mage 2, something found in the world. *Growth a level:* +6 health, +8 mana.
*Paths (choose one at level 3):* **Bonecaller** — Thralls from every corpse. **Blight** — Plague clouds and burning corpses.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Marrow Lance *(farhold)* | spell, free | 3 |  |
| 1 | Grave Robes (arcane) | training, free | 1 |  |
| 1 | Cold Hands | passive | 3 |  |
| 2 | Grave Draught *(farhold)* | spell | 3 |  |
| 3 | Raise Thrall *(farhold)* | spell | 3 | Bonecaller |
| 3 | Bone Lord | passive | 3 | Bonecaller |
| 3 | Plague Cloud *(farhold)* | spell | 3 | Blight |
| 3 | Rot | passive | 3 | Blight |
| 4 | Splintered Lance | modifier of Marrow Lance | 1 |  |
| 5 | Corpse Pyre *(farhold)* | spell | 3 | Blight |
| 6 | Bone Armour *(new)* | spell | 3 |  |
| 7 | March of the Buried *(farhold)* | spell | 3 | Bonecaller |
| 10 | Deathless | passive | 1 | capstone (pick one) |
| 10 | Grave Tide *(new)* | spell | 3 | capstone (pick one) |

### Witch Hunter — Advanced
Silver, iron nets and holy writs for the things that cast and the things that crawl out of rifts. *Requires:* Ranger 2, Cleric 1. *Growth a level:* +9 health, +4 mana.
*Paths (choose one at level 3):* **Inquisitor** — Nets, silence and circles where no spell can be cast. **Slayer** — Brand bolts and chain hooks that drag the prey in.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Silvered Pin *(farhold)* | spell, free | 3 |  |
| 1 | Hunter's Mail (leather, mail, bows, martial) | training, free | 1 |  |
| 1 | Iron Will | passive | 3 |  |
| 2 | Silver Edge *(farhold)* | spell | 3 |  |
| 3 | Iron Net *(farhold)* | spell | 3 | Inquisitor |
| 3 | Cold Iron | passive | 3 | Inquisitor |
| 3 | Brand Bolt *(farhold)* | spell | 3 | Slayer |
| 3 | Grudge | passive | 3 | Slayer |
| 4 | Silver Volley | modifier of Silvered Pin | 1 |  |
| 5 | Null Circle *(farhold)* | spell | 3 | Inquisitor |
| 5 | Chain Hook *(farhold)* | spell | 3 | Slayer |
| 6 | Writ of Guilt *(farhold)* | spell | 3 |  |
| 10 | Rite of Purging *(farhold)* | spell | 3 | capstone (pick one) |
| 10 | Relentless | passive | 1 | capstone (pick one) |

### Duelist — Specialty
A specialty class: flourishes, lunges and a showman's flurry for a light blade. *Requires:* Warrior 2, Rogue 2, Dexterity 13. *Growth a level:* +9 health, +3 mana. Fights with two weapons.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Flourish *(farhold)* | spell, free | 3 |  |
| 1 | Fencing School (leather, martial) | training, free | 1 |  |
| 1 | Footwork | passive | 3 |  |
| 2 | Lunge *(farhold)* | spell | 3 |  |
| 3 | Pinning Thrust *(farhold)* | spell | 3 |  |
| 3 | Double Flourish | modifier of Flourish | 1 |  |
| 4 | Master's Flurry *(farhold)* | spell | 3 |  |
| 5 | Grand Duellist | passive | 1 | capstone (pick one) |
| 5 | Matador's Turn *(farhold)* | spell | 3 | capstone (pick one) |

### Shadowdancer — Specialty
A specialty class: steps through shadow and leaves shades of itself behind. *Requires:* Rogue 4, Sneak 30. *Growth a level:* +7 health, +5 mana. Fights with two weapons.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Shade Cut *(farhold)* | spell, free | 3 |  |
| 1 | Umbral Skin | passive | 3 |  |
| 2 | Umbral Step *(farhold)* | spell | 3 |  |
| 3 | Cutting Waltz *(farhold)* | spell | 3 |  |
| 3 | Deeper Cut | modifier of Shade Cut | 1 |  |
| 4 | Assassinate *(farhold)* | spell | 3 |  |
| 5 | Host of Shades *(farhold)* | spell | 3 | capstone (pick one) |
| 5 | Night Incarnate | passive | 1 | capstone (pick one) |

### Spellfletcher — Specialty
A specialty class: every arrow carries a spell — frost, flame or raw force. *Requires:* Ranger 3, Mage 2, Dexterity 14. *Growth a level:* +7 health, +5 mana.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Charged Arrow *(new)* | spell, free | 3 |  |
| 1 | Fletcher's Eye | passive | 3 |  |
| 2 | Frost Fletching *(new)* | spell | 3 |  |
| 3 | Seeking Volley *(new)* | spell | 3 |  |
| 3 | Split Charge | modifier of Charged Arrow | 1 |  |
| 4 | Skyshard Arrow *(new)* | spell | 3 |  |
| 5 | Arrow of Ruin *(new)* | spell | 3 | capstone (pick one) |
| 5 | Living Bow | passive | 1 | capstone (pick one) |

### Bladesworn — Specialty
A specialty class: years with one weapon — its every swing perfected. *Requires:* Warrior 4, the Weapon Focus talent. *Growth a level:* +10 health, +2 mana. Fights with two weapons.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Measured Cut *(new)* | spell, free | 3 |  |
| 1 | Weapon Mastery | passive | 3 |  |
| 2 | Riposte Stance *(new)* | spell | 3 |  |
| 3 | Perfect Form | passive | 2 |  |
| 3 | Sweeping Guard *(farhold)* | spell | 3 |  |
| 4 | Through the Guard | modifier of Measured Cut | 1 |  |
| 5 | Hundred Cuts *(new)* | spell | 3 | capstone (pick one) |
| 5 | One True Blade | passive | 1 | capstone (pick one) |

### Wrathborn — Specialty
A specialty class: fury that shrugs off wounds and swings wider the more it bleeds. *Requires:* Warrior 3, Constitution 14, Strength 14. *Growth a level:* +13 health, +1 mana. Fights with two weapons.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Red Haze *(new)* | spell, free | 3 |  |
| 1 | Thick Skull | passive | 3 |  |
| 2 | Savage Leap *(new)* | spell | 3 |  |
| 3 | Blood for Blood | passive | 2 |  |
| 3 | Rampage *(new)* | spell | 3 |  |
| 4 | Longer Haze | modifier of Red Haze | 1 |  |
| 5 | Unstoppable | passive | 1 | capstone (pick one) |
| 5 | World Breaker *(new)* | spell | 3 | capstone (pick one) |

### Gravecutter — Specialty
A specialty class: contracts, marks and the one cut that ends it. Found through a contract in the wilds. *Requires:* Rogue 3, Sneak 25, something found in the world. *Growth a level:* +7 health, +4 mana. Fights with two weapons.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Death Mark *(new)* | spell, free | 3 |  |
| 1 | Patient Killer | passive | 3 |  |
| 2 | Venom Edge *(new)* | spell | 3 |  |
| 3 | Unseen | passive | 2 |  |
| 3 | Assassinate *(farhold)* | spell | 3 |  |
| 4 | Marked for Death | modifier of Death Mark | 1 |  |
| 5 | Contract Closed | passive | 1 | capstone (pick one) |
| 5 | Final Word *(new)* | spell | 3 | capstone (pick one) |

### Dragon Knight — Advanced (later round)
Fire-tempered steel, scales and a wyrm's breath. (Opens after the level cap rises.) *Requires:* Warrior 5, Pyromancer 3, Strength 15, character level 12. *Growth a level:* +11 health, +4 mana.
*Paths (choose one at level 3):* **Scaled** — Scales and temper: the dragon's hide. **Wyrmfire** — Rend and dive in fire.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Scale Rend *(farhold)* | spell, free | 3 |  |
| 1 | Dragon Plate (mail, plate, martial, shield) | training, free | 1 |  |
| 1 | Wyrm Blood | passive | 3 |  |
| 2 | Dragonscale *(farhold)* | spell | 3 |  |
| 3 | Scale Hide | passive | 3 | Scaled |
| 3 | Wyrmfall *(farhold)* | spell | 3 | Wyrmfire |
| 3 | Fire Temper | passive | 3 | Wyrmfire |
| 4 | Rending Fire | modifier of Scale Rend | 1 |  |
| 5 | Wyrm's Breath *(farhold)* | spell | 3 |  |
| 10 | Wyrm Ascendant | passive | 1 | capstone (pick one) |
| 10 | Elder Scales | passive | 1 | capstone (pick one) |

### Chronomancer — Advanced (later round)
Hurries friends, slows foes, and stops the clock. (Opens after the level cap rises.) *Requires:* Mage 5, Enchanting 50, something found in the world. *Growth a level:* +5 health, +9 mana.
*Paths (choose one at level 3):* **Hastener** — Quicken the party. **Stopper** — Stop enemies in time.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Second Hand *(farhold)* | spell, free | 3 |  |
| 1 | Time Robes (arcane) | training, free | 1 |  |
| 1 | Borrowed Time | passive | 3 |  |
| 3 | Quicken *(farhold)* | spell | 3 | Hastener |
| 3 | Stasis Lock *(farhold)* | spell | 3 | Stopper |
| 4 | Tick Tock | modifier of Second Hand | 1 |  |
| 5 | Entropy Field *(farhold)* | spell | 3 |  |
| 10 | Master of Hours | passive | 1 | capstone (pick one) |
| 10 | Endless Moment | passive | 1 | capstone (pick one) |

### Oracle — Advanced (later round)
Sees the blow before it lands. (Opens after the level cap rises.) *Requires:* Cleric 5, Wisdom 16, something found in the world. *Growth a level:* +7 health, +8 mana.
*Paths (choose one at level 3):* **Foreseer** — Wards before the hit. **Doom** — Prophecies that fall on the enemy.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Omen Bolt *(farhold)* | spell, free | 3 |  |
| 1 | Seer Robes (arcane, leather) | training, free | 1 |  |
| 1 | Second Sight | passive | 3 |  |
| 3 | Kind Omen *(thousandvale)* | spell | 3 | Foreseer |
| 3 | Prophecy *(farhold)* | spell | 3 | Doom |
| 4 | Fated Bolt | modifier of Omen Bolt | 1 |  |
| 10 | All-Seeing | passive | 1 | capstone (pick one) |
| 10 | Last Word | passive | 1 | capstone (pick one) |

### Tinker — Advanced (later round)
Sentries, grenades and lucky finds from every pocket. (Opens with the Smithing bench.) *Requires:* Rogue 3, Smithing 40. *Growth a level:* +8 health, +4 mana.
*Paths (choose one at level 3):* **Engineer** — Sentries and springs. **Scrounger** — Junk, bombs and luck.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Clockwork Bolt *(farhold)* | spell, free | 3 |  |
| 1 | Work Leathers (leather, bows, martial) | training, free | 1 |  |
| 1 | Handy | passive | 3 |  |
| 2 | Flask Grenade *(farhold)* | spell | 3 |  |
| 3 | Deploy Sentry *(farhold)* | spell | 3 | Engineer |
| 3 | Junk Toss *(farhold)* | spell | 3 | Scrounger |
| 4 | Big Flask | modifier of Flask Grenade | 1 |  |
| 10 | Grand Inventor | passive | 1 | capstone (pick one) |
| 10 | Pockets Full | passive | 1 | capstone (pick one) |

### Starcaller — Advanced (later round)
Star darts, falling stars and a blade of starlight. (Opens after the level cap rises.) *Requires:* Mage 5, something found in the world, character level 14. *Growth a level:* +6 health, +8 mana.
*Paths (choose one at level 3):* **Skyward** — Stars that fall where you point. **Starblade** — A blade of starlight up close.

| Lv | Node | Kind | Ranks | Path / choice |
|---|---|---|---|---|
| 1 | Star Dart *(thousandvale)* | spell, free | 3 |  |
| 1 | Star Robes (arcane, martial) | training, free | 1 |  |
| 1 | Starlit | passive | 3 |  |
| 3 | Called Star *(thousandvale)* | spell | 3 | Skyward |
| 3 | Starcut *(thousandvale)* | spell | 3 | Starblade |
| 4 | Bright Dart | modifier of Star Dart | 1 |  |
| 5 | Comet Rush *(thousandvale)* | spell | 3 |  |
| 10 | Heaven's Herald | passive | 1 | capstone (pick one) |
| 10 | Starforged | passive | 1 | capstone (pick one) |

<!-- /trees -->
