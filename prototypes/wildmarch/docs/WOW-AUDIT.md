# WoW audit — what to remove, reshape or keep

**Status:** waiting on the owner's answers · 2026-09-30

The first drafts leaned hard on World of Warcraft. Some of that you asked for (telegraphed boss fights, void
zones, danger zones, dungeons and raids). A lot of it you did not (PvP, war mode, timed keystones, WoW's
resource names). This page lists every WoW-shaped thing found in the docs so you can rule on each one.

**How to answer.** Each item has a number, a recommendation and a blank answer line. Copy the page (or just the
numbers you care about) back into chat with **Remove**, **Reshape**, **Keep**, or your own words. Anything you
skip stays on the recommendation. Nothing in the docs changes until you answer.

**Risk column** — a plain guide, not legal advice:
- **High** — a name or phrase that is WoW's own (or another Blizzard game's). Change it even if we keep the idea.
- **Medium** — the idea is common in the genre, but our version copies WoW's exact shape or wording.
- **Low** — a genre convention used by many games (health bars, dungeons, guilds). Keeping it is fine.

Game rules and mechanics on their own are generally not owned by anyone; names, logos, trademarks and a
game's specific wording and presentation are. So the usual fix is **rename and reshape**, not delete.

---

## Part 1 — Systems you never asked for

| # | Thing | Where it is now | Risk | Options | Recommendation |
|---|---|---|---|---|---|
| **W1** | **PvP as a whole**: duels, battlegrounds, rated arenas, Glory and Laurels currencies, a PvP gear set | 00 §10, 05 §21, 07 ladder (duels 10, battlegrounds 20, arenas 60), 08 currencies, 09 PvP set, 15, 18 M18 | Medium | Remove all · keep duels only · keep all | **Keep duels only** (friendly one-on-one, no rewards). Cut battlegrounds, arenas, Glory, Laurels and the PvP set; park them in a "future ideas" list |
| **W2** | **War Mode** — an open-world PvP flag, by that exact name | 00 §10, 07, 15 | **High** (WoW's term) | Remove · rename | **Remove** (goes with W1) |
| **W3** | **Mythic+** — timed dungeon runs on numbered keystones with rotating weekly "affixes" | 00 §4, 08, 12 (whole section), 07, 14, 18 | **High** (name and shape) | Remove · reshape into our own system · keep | **Reshape**: "Deeper runs" — replay any dungeon at a chosen **depth** (1–20) where the Veil leaks in (our own modifiers tied to the lore), **no timer**, rewards by depth. Different name, different rules |
| **W4** | **Difficulty names** Normal / Heroic / Mythic | 00, 03, 07, 08, 12, 13, everywhere | **High** as a set | Rename · keep | **Rename** to **Standard / Veteran / Veilbound** (or your pick) |
| **W5** | **Weekly raid lockout** on **Wednesday** (WoW's own European reset day), bonus rolls, a "loot master" | 00 §4, 03, 08, 13 | Medium | Keep lockout, drop extras · remove lockout | **Keep a weekly loot limit per boss**, move reset to **Monday 06:00**, drop bonus rolls and the loot master (personal loot only) |
| **W6** | **Raid sizes** 10 / 20 with Mythic fixed at 20, flex sizes | 00, 13 | Low | Keep · change | **Keep** (you asked for raids); sizes are ours to tune |
| **W7** | **Holy trinity** — tank / healer / damage roles, a threat table, taunts, tank swaps | 00 §6, 05, 06, 11, 12, 13, every class | Low–Medium | Keep · soften (any class can survive, roles are a bonus) · remove | **Keep** — WoW-style bosses need it. But make "Support" a real fourth role (already in canon) so it isn't a straight copy |
| **W8** | **Tab targeting** and a **1.0 s global cooldown** (the short lockout after each spell) | 00 §4/§10, 02, 05, 06 | Medium | Keep · action-first (aim with the reticle, GCD 0.5 s) | **Action-first**: the reticle aim is the default and only mode, Tab just cycles a soft lock; GCD 0.5 s. This is an action RPG, not a tab-target MMO |
| **W9** | **Attunement quests** before each raid | 13, 14 | Low | Keep · remove | **Keep** — fits "earn every verb" |
| **W10** | **Dual spec** (two saved builds) | 07 at 30, 03 | Low | Keep, rename · remove | **Keep**, call it **Second Loadout** |
| **W11** | **Rested XP** (bonus XP after logging off in an inn) | 07 | Low | Keep · remove | **Keep**, call it **Well-Rested** |
| **W12** | **Reputation** with factions, quartermasters, tabards | 01, 07, 08 | Low | Keep · remove | **Keep** (Farhold already has factions). See W22 for names |
| **W13** | **Renown** — a post-60 progression board | 07 | **Medium** (WoW's own later term for faction levels) | Rename · remove | **Rename to "Legacy"**, cosmetic and convenience only (matches QUESTIONS B8) |
| **W14** | **Auction house / trading post, mail, guild bank** | 03, 08, 15 | Low | Keep · cut the market | **Keep mail and guild bank; keep the market as the "Trading Post"** (already our name) |
| **W15** | **Flight paths** (fixed bird routes) and **flying mount after a long "sky" quest chain at 60** | 07, 08, 14 | Low–Medium (the chain mirrors WoW's "Pathfinder" gate) | Keep · reshape · remove flying | **Reshape**: keep skyways; flying unlocks by a story chain in the Emberthrone (not by grinding reputations and dungeon ranks) |
| **W16** | **Addon-style tools built in**: damage meter, boss ability timers, ready check, pull timer, world markers, raid frames | 03, 04, 11, 13 | Low (these are fan tools, and the damage meter already exists in the playground) | Keep · trim | **Keep** — they help people learn fights. Rename markers (W23) |
| **W17** | **Item "tracks"** above level 60 (heroic 60–66, ascendant 70–76, veiled 80–88) and a cap of 2 legendaries worn | 00 §4, 08 | Medium | Keep · simplify | **Simplify**: item level 1–60 plus one "Veil-touched" upgrade tier at endgame. Keep the 2-legendary cap |
| **W18** | **Need / Greed / Pass** loot rolls | 03, 08, 15 (mostly removed already) | Medium (WoW's exact words) | Remove · rename | **Remove** — personal loot only |
| **W19** | **Gold / silver / copper at 100 : 100** | 00 §10, 03, 08, 15 | Medium (WoW's exact split) | Keep · single currency | **Single coin: gold**, as in Farhold |
| **W20** | **Daily and weekly quests**, world bosses on timers, world quests | 07, 13, 14 | Low | Keep · trim | **Keep world bosses and weeklies; cut dailies** (they turn play into chores) |
| **W21** | **Battle-revive limit** (a set number of in-fight revives per raid) | 05, cleric, priest, tinker | Low | Keep · remove | **Keep** — it makes death matter in bosses |

## Part 2 — Names that are WoW's (or another Blizzard game's)

| # | Name | Where | Risk | Recommendation |
|---|---|---|---|---|
| **W22** | Reputation tiers **Honored / Revered / Exalted** | 08 (quartermaster table, mount rows) — page 07 already uses its own tiers ("Welcome"…) | **High** | Use page 07's own tier names everywhere |
| **W23** | Raid target icons that overlap WoW's set (**Moon, Star, Skull**) | 02, 03, 13 | Low–Medium | Swap to world icons: **Lamp, Anvil, Bell, Crown, Leaf, Wave, Ember, Key** |
| **W24** | **The Hearthstone** — Brightwater's first waystone landmark (`lm_hearthstone`) and quest objectives | 01, 14 | **High** (a WoW item and a separate Blizzard game's trademark) | Rename to **the Wakestone** (or **the First Waystone**) |
| **W25** | **Ashtusk Horde** — the orc warband | 01, 10, 12, 13 | **High** ("the Horde" is a WoW faction) | Rename to **the Ashtusk Warhost** |
| **W26** | **Delve / Delver's Marks** — dungeon currency and quartermaster | 00 §10, 08, 12 | **Medium–High** (WoW added "Delves" in 2024 as a named feature) | Rename to **Barrow Marks** or **Depth Marks** |
| **W27** | Class name **Demon Hunter**, its **Vengeance** gauge and **Demon Form** | 00 §6, classes/demon_hunter, 03, 06 | **High** (a WoW class with a "Vengeance" spec and a demon transformation; also a Blizzard Diablo class) | Rename the class to **Fiendslayer**, the gauge to **Grudge**, the form to **Hellborn Aspect**. Class came from your Emberveil, so the kit stays; only names change |
| **W28** | Resources **Fury** and **Focus** (and the text "Rage-style") | 00 §6, 05, 06, and ~20 class files | **High** (Fury is WoW's demon hunter resource, Focus its hunter resource, Rage its warrior resource) | Rename (you suggested this). Options: **Momentum** (builds from hitting and being hit) + **Tempo** (refills fast, small pool) · or **Grit** + **Breath**. Mana stays Mana (it predates WoW by decades) |
| **W29** | Rogue **combo points**, **Stealth**, **Garrote**, **Cheap Shot**, **Ambush**, **Backstab** | classes/rogue, druid | Medium | Keep the idea, rename: combo points → **Edge**; Stealth → **Shadowed**; Garrote → **Wire Choke**; Cheap Shot → **Dirty Trick**; Ambush → **Unseen Strike**; Backstab stays (it predates WoW) |
| **W30** | Druid **Bear/Cat/Owl/Stag forms** with **Maul, Swipe, Rake, Prowl, Barkskin** | classes/druid | Medium (you asked for forms; the spell names are WoW's druid kit word for word) | Keep the four animals, rename every spell: Maul → **Crushing Paw**, Rending Swipe → **Rending Sweep**, Rake → **Raking Claw**, Prowl → **Low Stalk**, Barkskin Wraps → **Oakhide Wraps**. Consider making Owl a **Moth** or **Heron** so the caster form doesn't echo WoW's owl-caster |
| **W31** | Shaman **four element totems** (earth, fire, water, air) and **Totemic Recall**, **Ancestral** spirits | classes/shaman | **Medium–High** (WoW's shaman shape, and "Totemic Recall" is a WoW spell) | Reshape: totems become **Spirit Posts** carved for four **animal spirits** (bear, crane, wolf, serpent), not elements; Totemic Recall → **Pull Up the Posts** |
| **W32** | Warlock **soul shards**, bound **imp**, spreading **Corruption** | classes/warlock | **Medium–High** | Reshape: shards → **Tithes** (paid in your own health, which is already the class's idea); Corruption → **Blight**; imp → **bound cinder-sprite** |
| **W33** | Monk **Chi** | classes/monk | Medium | Rename to **Breath** |
| **W34** | Mage **Arcane Charge** / **Arcane Surge**; **Blink**, **Counterspell**, **Fireball** mentions | classes/mage, sorcerer | Medium | Arcane Charge → **Resonance**; Surge → **Overflow**; Blink → **Skip**; Counterspell → **Unweave**; drop the Fireball mention |
| **W35** | Cleric **Mass Resurrection**; paladin **Lay on Hands** and **Consecration** | classes/cleric, paladin | Medium (all three are WoW spell names; Lay on Hands and Consecrate predate WoW in tabletop games) | Mass Resurrection → **Dawn Call**; Lay on Hands → **Mending Palm**; Consecration → **Hallowed Ground** |
| **W36** | Other ability names found in talents: **Last Stand** (4 classes), **Evasion**, **Mirror Image**, **Leap of Faith**, **Hellfire**, **Starfall**, **Execute**, **Whirlwind**, **Shield Bash**, **Hex**, **Fear**, **Charge** | several class files | Low–Medium | Rename the WoW-distinctive ones (Last Stand, Mirror Image, Leap of Faith, Hellfire, Starfall); keep plain English words (Execute, Whirlwind, Shield Bash, Hex, Fear, Charge) |
| **W37** | **Hunter's pet with commands** (ranger's cat), **necromancer thralls**, **warlock imp** | several classes | Low | Keep — pets are universal |
| **W38** | Level cap **60** and **5-player** dungeons | 00 | Low | Keep (any cap works; 60 matches the ladder) |

## Part 3 — Shape of the whole game

| # | Question | Recommendation |
|---|---|---|
| **W39** | Should Wildmarch read as "an MMO" at all, or as **an online action RPG** where groups are small (1–5) and raids are the rare big event? The docs currently describe WoW's full endgame loop (dailies, weeklies, keys, raids, reputations, PvP). | **Online action RPG.** Keep dungeons, raids, world bosses and bosses-you-learn; drop the chore loops (dailies, PvP ladders, timed keys) |
| **W40** | After your answers, run one **rename pass** across every page (plus a check that no WoW name remains) and add the list of banned names to the playground's IP rule so later pages can't bring them back. | **Yes** |

---

## Your answers

Copy this block, fill in what you want to change, and paste it back. A blank line means "use the
recommendation".

```
W1:   W2:   W3:   W4:   W5:   W6:   W7:   W8:   W9:   W10:
W11:  W12:  W13:  W14:  W15:  W16:  W17:  W18:  W19:  W20:
W21:  W22:  W23:  W24:  W25:  W26:  W27:  W28:  W29:  W30:
W31:  W32:  W33:  W34:  W35:  W36:  W37:  W38:  W39:  W40:
Resource names (W28):
Difficulty names (W4):
Other notes:
```
