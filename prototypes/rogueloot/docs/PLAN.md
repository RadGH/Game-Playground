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

Standard defaults from `~/claude/docs/game-standards.md` apply too: ☰ menu everywhere, in-game bug report, What's new,
Credits, ratings + insights + admin feed, phone + desktop + controller, `window.gameEye`, no third-party IP
(`docs/banned-names.md` — never "muster", "Horde", WoW terms…).

## §1 Architecture

```
prototypes/rogueloot/
  index.html, css/            one page: title → character select → game
  js/sim/                     PURE simulation (seeded rng, now passed in) — runs in the browser for solo AND on the server
  js/rules/                   PURE rules: stats, damage, items, affixes, loot, crafting, skills, xp (node-testable)
  js/client/                  three.js renderer, input, HUD, screens, net link, prediction/interpolation
  js/editor/                  in-browser zone editor
  data/                       JSON: items, affixes, uniques, legendaries, skills/trees, paths/specs, monsters, zones, quests…
  server/                     Node + ws room server (static + rooms + feedback + insights + admin feed)
  tools/                      bot sim (balance), zone checker, publish script
  tests/                      node --test (rules/sim) + Playwright (page, phone, two-tab co-op)
```

- **Tick:** sim at 20 Hz fixed step; the server broadcasts snapshot deltas at 10–20 Hz; clients interpolate others on
  the server clock and predict their own movement.
- **Solo:** the same `js/sim` runs in a Worker in the browser, so solo plays offline and a solo character carries into
  co-op unchanged.
- **Characters:** saved in localStorage (+ optional RGS cloud). When joining, the character JSON goes to the server,
  `rules/validate.js` checks it (light checks, ruling 8), the server runs it for the session, and the server's changes
  (XP, loot, gold) go back to the owner's browser, which saves them.
- **Content data:** Thousandvale's `data/rules/*` (affixes, gear, monsters, skills, classes) is the *source material*,
  rewritten into Rogueloot's own files by `tools/import-tv.mjs` so the two games never share a live file.
- **Ports:** stable 8580 (https 8582), dev 8581 (https 8583). Live: `rogueloot.games.radgh.com`.

## §2 Systems summary

- **Stats:** 5 attributes; derived health, mana/rage/energy, attack power, spell power, crit, dodge, block, armour, resists.
- **Damage:** hit check (level gap) → dodge/block → armour or resist → crit → threat.
- **Items:** a base catalogue (every base hand-specified: slot, grid size, proficiency, level req, attribute req,
  implicit), item level from the area, rarity roll (normal / magic / rare / unique / legendary), affix tiers by item
  level, gear score = weighted average item level of what's worn.
- **Crafting:** about 10 currency shards, salvage → shards by item-level tier, a crafting NPC in town.
- **Skills:** Wanderer (2–3 skills) → Path (level 3, a small tree) → Spec (level 10, 3 trees × 8–10 nodes, ranks 1–10,
  synergies). Respec in town.
- **AI:** steering with separation (no piles), flow fields over the walk grid (no getting stuck), unstuck teleport as a
  last resort, threat, roles, telegraphed casts.
- **World:** town hub → portals → zones (hand-made JSON) → dungeon entrances (separate areas with 1–3 floors);
  waypoints; a PoE-style map screen; a recall portal for each player.

## §3 Milestones

Each milestone ends with: unit tests + Playwright green, a bot-sim report inside its bands (from M12), a What's new
entry, and **a live deploy** (ruling 20).

| M | Name | Contents |
|---|---|---|
| M1 | **First steps, live** | Folder, page, title screen, three.js angled camera, W = screen north, a Chibi 2.6 Wanderer walking a test field (keyboard, phone stick, controller), pure sim skeleton (20 Hz), solo in a Worker, ☰ menu, What's new, Credits, bug report, `gameEye`, room server skeleton, **listed and live on games.radgh.com**. |
| M2 | **Rooms** | Online co-op 1–4: create/join, invite link + QR, public/invite-only, drop-in/out, reconnect keeps the seat, host migration, prediction + interpolation, two-tab smoke test. |
| M3 | **Characters** | Character create (look + name), select, delete; local saves + RGS cloud backup; 5 attributes + 5 points/level; XP curve to 20; save carried into co-op with light server checks. |
| M4 | **Combat core** | Targeting (click/Tab/tap/next), auto-attack, 1.5 s GCD, cast bars + interrupts, rage/energy/mana, hit/dodge/block/armour/resists/crit, threat, floating numbers, death + revive + soft-death respawn, the phone skill arc. |
| M5 | **Monster brains** | Walk grid + flow fields, steering with separation (flocking), packs, leash, roles (brute/skirmisher/archer/caster/shaman/leader), unstuck rules, a test that no actor stays stuck or stacked. |
| M6 | **Items** | Base catalogue (D2 core slots + swap), grid shapes, item level vs required level, attribute reqs, proficiency, affix tiers by item level, rarities, free right-click identify, gear score, tooltips with comparisons. |
| M7 | **Bags** | D2 grid inventory, shared stash, belt potion slots, D2-style potions, drag/drop on mouse + touch + controller, pick-up rules, personal loot. |
| M8 | **Loot** | Drop tables by area level (stingy, rarer at low level, never zero), extra drops per player, gold, rarity pillars + sounds, chests, vendor sell/buy, gambler. |
| M9 | **Paths** | Wanderer skills, the 4 Paths at level 3 with Path trees, skill tree screen, action bar + arc assignment, quest points. |
| M10 | **Zone engine** | Zone JSON (heights, paint, paths, props, spawns, markers), stylised low-poly renderer with Low/Med/High, prop kit, reachability + spawn checks. |
| M11 | **Zone editor** | In-browser editor: paint, raise/lower, props, spawns, markers, save/download, Claude-readable format. |
| M12 | **Bot sim** | Headless bot plays the real sim: time per level, deaths, gear score vs zone, drops, shard flow; report + target bands. |
| M13 | **Town + world map** | Hub town (vendors, gambler, stash, crafter, mercenary hall, spec trainer), portal ring, PoE-style map, waypoints, story-gated portals, recall portal, fresh-each-session respawns. |
| M14 | **Bestiary kit** | **Fable designs** the Act 1 bestiary (families, roles, abilities, looks); models are stylised low-poly, procedural or free CC0/CC-BY packs (credited), with rigs + clips; batch 1. |
| M15 | **Zones 1–2 + first cave** | Two outdoor zones + a cave dungeon (separate area, 2 floors) + the first boss; the boss mechanics framework (telegraphs, phases, adds, interruptible cast, enrage). |
| M16 | **Champions** | Elites/champions with random modifiers, rare named monsters, unique dungeon bosses with fixed loot tables. |
| M17 | **Crafting** | ~10 currency shards, salvage, item-level gating, crafting NPC screen, careful material flow (checked by the bot sim). |
| M18 | **Trading + party** | Trade window anywhere, party frames, XP split by level, per-player scaling of monsters and drops. |
| M19 | **Mercenaries + pet AI** | 3 mercenary types with gear and skills; one companion AI shared by mercenaries, pets and summons (defend, peel, never stuck, never stacked, flocking). |
| M20 | **Specs wave 1** | 1 spec per Path + 2 hybrids (Paladin, Spellblade), 3 trees each, armour proficiency at the spec, respec in town. |
| M21 | **Zones 3–4 + catacomb** | Two more zones + a 3-floor catacomb + boss. |
| M22 | **Specs wave 2** | ~5 more specs. |
| M23 | **Zones 5–6 + dungeons** | Two zones + two dungeons + bosses; bestiary batch 2. |
| M24 | **Specs wave 3** | ~5 more specs (summoners/pets included). |
| M25 | **Zones 7–8 + dungeons** | Two zones + two dungeons; uniques and legendary powers for all of Act 1. |
| M26 | **Specs wave 4** | ~5 more specs. |
| M27 | **Zones 9–10 + act boss** | The final zones, the act-boss catacomb (3 phases + arena change), the full main quest chain + side quests. |
| M28 | **Specs wave 5** | The remaining specs (~28 total). |
| M29 | **Difficulty tiers** | Veteran and Legend: higher area levels, resist penalties, top affix tiers, unlocks. |
| M30 | **Phone + performance** | 4 players + packs + minions at 60 fps on a mid phone, Low tier, controller menus everywhere, comfort settings. |
| M31 | **Sound + juice** | sfx library ids for every skill/hit/drop, hit flashes, shake, banners. |
| M32 | **Feedback loop** | Ratings per zone/dungeon, insights log, admin feed, My characters stats. |
| M33 | **Balance + release** | Full bot pass to 8–12 h, drop rates, crafting gating, 4-player Playwright, Act 1 release. |

## §4 Parked / later acts

Act 2+, sockets/gems (ruled out for now), gathering professions, mounts, world events, bounties, PvP.
