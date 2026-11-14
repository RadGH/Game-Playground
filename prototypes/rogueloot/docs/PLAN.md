# Rogueloot — plan

Owner: Radley Sustaire (independent). Started 2026-11-10. Sandbox code in `~/claude/playground`; the public copy is
production (games.radgh.com), and the owner asked for it to be **live from day one**.

A co-op action RPG for 1–4 players. It combines Thousandvale's items and game mechanics with a Diablo-style angled
top-down camera, Act 1 at the scope of Diablo 2's first act (mostly outdoors, plus dungeons, caves and catacombs), and
combat at the slower pace of vanilla WoW. Characters are Chibi 2.6, and there are no voices.

Concept art: `docs/concept-art.png` (made by ChatGPT; it sets the mood only). **We do not copy any graphics or level
design from the existing "Roguelike" game** (RSG-Demos game2). Everything here is drawn and laid out fresh for this game.

## §0 Owner rulings (2026-11-10 question rounds — these override anything below)

| # | Topic | Ruling |
|---|---|---|
| 1 | Co-op | Online rooms on our own Node server, 1–4 players, invite link + QR, drop-in/out. **Characters stay on the player's device**, so a solo character can join a friend's game. |
| 2 | Classes | Everyone starts as a **Wanderer**. Pick a **Path** at **level 3**: Fighter, Rogue, Mage or Healer. Pick a **Specialization** at **level 10**. Carry over as many of Thousandvale's 32 classes as fit (drop Tactician and other turn-based ideas). **Hybrid specs** bridge Paths (e.g. Paladin from Fighter *or* Healer). Fighter gets mail, and plate at the spec choice. (Branch levels moved from 5/15 to 3/10, ruling 29.) |
| 3 | Combat | WASD / phone stick (**W = screen north**), click / Tab / tap to target, **1.5 s global cooldown**, cast bars, melee auto-attack, a resource per Path (rage / energy / mana). Controllers everywhere, menus included. |
| 4 | Act 1 size | Levels **1–20**, a town hub, **8–10 outdoor zones**, **6–8 dungeons / caves / catacombs** (some with several floors), an act boss, ~12 main quest steps plus side quests. |
| 5 | Loot | **Personal loot** (each player has their own drops and chest rolls). **Trading anywhere.** Monsters get tougher and drop more for each added player. |
| 6 | Setting | A mix of bright frontier and classic high fantasy. The owner doesn't care about the theme: Claude picks the story (default: a hill warband raids the frontier while digging up a sealed catacomb lord). Ask **abstract system** questions, not thematic ones. |
| 7 | Death | Soft death: respawn at a waypoint or be revived by a friend; durability loss, no item drops. **Three difficulty tiers** (Normal → Veteran → Legend) unlocked by beating the act. |
| 8 | Saves | Trust plus light checks: browser saves with optional cloud backup. The server refuses impossible items (above the cap, unknown affixes, out-of-range rolls) when a character joins or trades. |
| 9 | Crafting | No gathering. **Currency shards** in PoE style: each one does one thing (reroll, add an affix, upgrade a rarity, reroll values, imbue…). Shards drop by area level, and salvage gives shards tiered by **item level**, so low-level materials only touch low-tier affixes. Careful gating: you can't upgrade at low level and be set for life. Crafting gets PoE-level attention to detail. |
| 10 | Skills | D2-style trees: 1 point a level plus quest points; each tree mixes actives, passives and synergies, gated by level and earlier picks; ranks 1–10; **8–10 nodes a tree, 3 trees a spec**. **Spec skills replace Path skills** (base skills become filler/utility). **Spec can be changed in town** for a large gold cost (points reset); points can be refunded for gold. |
| 11 | Inventory | **D2 grid** (items have shapes: 1×1 ring, 2×3 armour, 1×4 polearm…), a shared stash, belt potion slots. |
| 12 | Level gaps | **Fixed zone levels, no help**: low players get carried, with XP split by level. |
| 13 | Quests | Everyone progresses: the game uses the host's world state, and an objective done in the party counts for every member who has that quest. Waypoints you touch are yours to keep. |
| 14 | Graphics | **Phone first, stylised**: flat-shaded low-poly that holds 60 fps on a phone with 4 players and packs on screen. |
| 15 | Zones | **Hand-made** zones stored as JSON, plus an **in-browser editor** (terrain, paint, props, spawns, markers). Reachability and spawn checks run in tests. |
| 16 | Monsters | Packs of 3–6, patrols, D2-style **champions / elites with random modifiers**, a unique boss per dungeon, rare named monsters. Fights last ~10–30 s. Hordes use **flocking** (no stacking in a pile). |
| 17 | Name | **Rogueloot**. |
| 18 | Loot chase | **Legendary powers** (no sockets/gems/runes). |
| 19 | Extras | **Mercenaries, companions and pets** with intelligent AI: they defend the player proactively, never get stuck, never ignore combat, never stack. Hordes flock. No mounts, no world events or bounties in Act 1. |
| 20 | Hosting | **Live from day one** on games.radgh.com, with its own room server. |
| 21 | Phone UI | Stick on the left; on the right a big attack button with **6 skills in an arc** and a potion button; tap an enemy to target, plus a next-target button; cast bars and cooldown sweeps on the buttons. |
| 22 | Story | **Minimal**: quest log + short quest text (D2 style). |
| 23 | Potions | **D2 style**: refill over a few seconds, can be chugged back to back, belt slots, slow natural regen. |
| 24 | Monster art | **All new for Rogueloot**: a fresh monster set built for this game only. |
| 25 | Respawns | **Fresh each game session**: monsters, elites and chests come back with every new game; quest progress and waypoints stay. |
| 26 | PvP | None. |
| 27 | Attributes | **5 points a level** across **Strength, Agility, Intellect, Vitality, Spirit**; gear needs a level plus minimum attributes plus proficiency. |
| 28 | Gear slots | **D2 core**: head, chest, hands, belt, feet, neck, ring ×2, main hand, off hand + weapon swap. |
| 29 | Branching | Path at 3, Spec at 10, cap 20; 1 point a level + 1 per main-quest step (~32 by 20). |
| 30 | Spec rollout | **Waves**: 4 Paths + 1 spec per Path + 2 hybrids first, then batches of ~5. |
| 31 | Mercenary | 3 types (shield-bearer, archer, hedge-mage); levels with you, wears weapon/chest/head, 3–4 skills, revive in town for gold. |
| 32 | Dungeons | Separately loaded areas with 1–3 floors and a boss at the bottom; party members can be in different areas. |
| 33 | World map | **Hub + portals**: story-gated portals, waypoints inside zones, and a **PoE-style world map** of zone nodes (doesn't need to be geographically accurate). |
| 34 | Recall | A **reusable recall portal**: one per player, infinite use, no cooldown, comes back to the same spot. |
| 35 | Pets | Spec-dependent caps: summoners ~6–8 minions, pet specs 1 strong pet, plus 1 mercenary each. |
| 36 | Netcode | **The server runs the world** (monsters, loot rolls, combat results); browsers send inputs and predict their own movement; host migration. Solo runs the same sim in the browser. |
| 37 | Length | **8–12 hours** for a first solo Normal clear (~30 min a level). |
| 38 | Drops | **D2-stingy**, with care given to every base item and affix. **Multiple affix tiers**, the strong ones only at high **item level**. **Item level ≠ character level.** Characters show a **gear score** from item levels. Rares and uniques are scarce at low level but never zero, and get more common higher up. |
| 39 | Gold | Gold everywhere: vendors **and** trading. |
| 40 | Identify | Rares and above drop **unidentified**; **right-click identifies for free**. |
| 41 | Defences | Armour (diminishing against attacker level) + **5 resists** (fire, frost, storm, poison, shadow; cap 75%, difficulty penalty) + block, dodge, and a vanilla-WoW level-gap hit chance. |
| 42 | Threat | Light threat table (damage, healing, taunts); tanks and pets can taunt; nobody *needs* a trinity. |
| 43 | Balance | **Headless bot sim** plays every spec through Act 1; every milestone keeps its report inside the target bands. |
| 44 | Accounts | Optional games.radgh.com sign-in = cloud backup of characters + stash. |
| 45 | Enemy AI | **A role per monster**: brute, skirmisher (kites/flanks), archer (keeps range, finds line of sight), caster (interruptible telegraphed casts), shaman (buffs the pack), leader (rallies, flees to call help). |
| 47 | Helpers | (Mid-session add) Use **Fable subagents** wherever they fit, until the usage limit is reached. **Enemy design goes to Fable** (the owner wants to see if it beats Opus at it). |
| 48 | Free assets | Premade **free** assets (CC0 / CC-BY models, textures, sounds) are allowed, and so are the playground's shared sfx. This refines ruling 24: monsters are new *to Rogueloot*, built or sourced fresh, not lifted from other playground games. |
| 49 | Credits | Every third-party author goes in `data/credits.json` and the Credits screen (title + ☰), with licence and link, even when CC0 doesn't require it. |
| 50 | Codex art | Codex may be used for **graphic design** (icons, UI art, card art) as needed, but sparingly: it has about 1/5 of Claude's usage limit. One job at a time, one folder per job. Never for code. |
| 46 | Bosses | Mechanics-light WoW: 2–3 phases with 2–4 readable mechanics (ground telegraphs, adds, interruptible big cast, enrage); the act boss has 3 phases and an arena change; scales by player count. |
| 51 | Class at creation | (2026-11-13) **The class (Path) is picked when the hero is made** — no Wanderer stage; heroes saved without one choose before they play. Each class starts with a weapon it can hold. Shove is gone. Overrides ruling 2's "Path at 3". |
| 52 | Skills vs talents | (2026-11-13) **Skills unlock by level** (class skills 1–8, spec skills from 10) and grow a rank every 2 levels; **talent points (1 a level from 2) buy talents only**, in WoW/D2/Titan Quest-style trees: one class tree + three per specialization, rows opened by level, arrows, capstones, lots of class↔subclass synergies. `docs/TALENTS.md`. |
| 53 | Bag | (2026-11-13) **Every item takes one square** (10 × 4); the shaped "tetris" bag is gone. |
| 54 | Menus | (2026-11-13) The skill and talent screens and the character screen were rebuilt from scratch (Skills K, Talents N, Character C). |
| 55 | Early game | (2026-11-13) **Early zones are mostly 1v1**; pairs from level 2, groups of 3–4 from 4–5, swarms from 5 (`balance.json groups`). |
