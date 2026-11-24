# Oathwild

**Status:** round 1 playable on the LAN: world server (shared saved worlds, ≤ 10 players, create/join by code) + the 3D client (title, character select, Tabard creator, world list, the world with over-the-shoulder aim, spells with ground indicators, loot windows, inventory, sheet, level-up, class trees, talents, spellbook, quests, map, people, shops, shrines, menus). Live on games.radgh.com since 2026-11-24 (world server on the droplet, saves in /var/lib/oathwild, archived hourly). Not yet played by a person.
**Play:** https://games.radgh.com/oathwild/ · LAN dev http://192.168.1.34:8401/prototypes/oathwild/ (start the world server first: `tools/game-servers.sh start oathwild-dev`; https for controllers: https://192.168.1.34:8441/prototypes/oathwild/). Stable 8400/8442 pairs with the `oathwild` unit (8660/8662) after publish-stable.
**Next:** a person plays it; tune feel (`?tune`); item pictures drawn from the worn models (rule 20); buff/debuff visuals on bodies with the Spell Kit's aura phase; real horse/boss models as the art budget allows.
**Parked:** Smithing / Alchemy benches and the Tinker class (later round); Chronomancer, Oracle, Dragon Knight, Starcaller; charm/turn spells; Farhold's resource / afterimage / "consumes" spell rules; playing offline without the world server; chat box (the server relays chat, no UI yet).

A third-person open-world fantasy RPG for 1–10 players in one shared, saved world. The heart of it is levelling:
every level you pick a class (27 to choose from, unlimited per character), each class is a mastery tree of spells,
ranks, modifiers, passives and training, plus attributes, talents and non-combat skills. Independent project by
Radley Sustaire.

- Owner rulings and the plan: `docs/PLAN.md` (§0 first). Code map and contracts: `docs/ARCH.md`.
- The rules in plain words: `docs/RULES.md`. Every class, where it came from, and its tree: `docs/CLASSES.md`.

## The rules core (`js/rules/`, pure — runs in Node, the server and the browser)

| Module | What it does |
|---|---|
| `farhold.js` | The one door to Farhold / Emberveil / Thousandvale code and `shared/format.js` (by path; never edited). |
| `data.js`, `boot.js`, `engine.js` | Load the data, build one `rules` object (Farhold's `Rpg` on Oathwild's balance, statuses, spell catalogue). |
| `attributes.js` | Point buy, level points, per-point values. |
| `sheet.js` | The character sheet: every number from attributes, classes, passives, talents, background, gear. |
| `classes.js` | Classes as masteries: unlocks, class points, ranks, paths, modifiers, capstones, `castRow`. |
| `spells.js` | The spell catalogue: reused rows + Oathwild's own, ranks, modifiers, targeting kind, power source. |
| `talents.js` | Talent points and rows. |
| `skills-use.js` | Non-combat use-skills (Sneak, Lockpicking, Pickpocket, Speech, Enchanting) and their effects. |
| `proficiency.js` | `canWear` / `canWield` with reasons in plain words; training enchantments. |
| `inventory.js` | Carry weight, durability, enchanting, the horse. |
| `levels.js` | The character record, XP, `levelUp`, respec. |
| `auras.js` | Buffs and debuffs on Farhold's statuses: stacking, ticks, cures, control, display data. |
| `combat.js` | The world sim for ≤ 10 players: weapons, spells, auras, monsters, pets, death, XP, loot, camps. |
| `loot.js` | Individual loot per player, gold that must be taken, chests that refill per player. |
| `describe.js` | The one tooltip text model for spells, items, auras, talents, class nodes, classes, skills. |
| `world-state.js` | The shared saved world: flags, quests (per-player rewards), camps, chests, shrines. |

## The world (`js/world/`, pure) — details in `docs/WORLD.md`

| Module | What it does |
|---|---|
| `terrain.js` | The ground from `data/map.json`: heights (mesh = walked surface), rivers, marsh, graded roads, bridges and fords, biomes, forest, regions, level bands, walkable, reach on foot. |
| `scatter.js` | Trees and small decor, the same everywhere, clear of roads, water and footprints. |
| `encounters.js` | Camps and roam zones on top of the combat sim; bosses sized to the number of heroes (Guessed). |
| `quests.js` | Quests (shared progress, per-player rewards), NPC talk with choices, escorts, services, the quest log model. |
| `boot.js` | Loads map, placements, quests and NPCs; builds the terrain and the quest book. |

Data lives in `data/*.json` (each file's `_doc` says who reads it). `data/art.json` and `data/spell-visuals.json`
belong to the art and spell-visual helpers.

## Server and client (round 1, 2026-11-23)

| Part | What it is |
|---|---|
| `server/main.mjs` | Node + ws world server: dev 8661 (wss 8663), stable 8660 (wss 8662), `/status`, admin feed; saves in `saves/<dev|stable>/` (JSON, gitignored) |
| `server/hub.js` | Hello (device id or games.radgh.com account ticket → profile), characters, world list, create/join by code, reconnect keeps your hero 90 s, empty worlds saved and put away |
| `server/world.js` | One world: the 20 Hz combat sim, the ground check, camps + roam packs, quests, loot per player, talk, level-up, gear, shops, shrines, travel, respawn; per-player snapshots (units within 95 m) |
| `js/net/protocol.js` | The wire: message checks, rate limits, button bits |
| `js/game/ground.js`, `gear.js` | Shared by server and browser: where a body may stand (prediction uses the same check); equip rules, prices, gear → Tabard pieces |
| `js/client/` | `main.js` (the app contract), `screens/` (title, chars, creator, worlds, play), `play/` (camera + aim, prediction, HUD, minimap, touch), `render/` (view, world, actors, fx + Spell Kit), `ui/` (window kit, the ONE tooltip renderer `tip.js`, every window), `input/` (one binding table, keyboard/mouse/pad/touch, padnav) |
| `ops/` | `oathwild` / `oathwild-dev` user units (linked, never enabled: `tools/game-servers.sh start oathwild-dev`) |

Controls (rebind in Settings → Controls): WASD move, mouse look (click the world), left click attack, right click block, F power attack, Space dodge, Shift sprint, X sneak, R horse, E talk/loot/use/revive (hold), 1–8 spells (ground spells: hold to aim, release to cast), Tab target, B bag, C character, N level up, L classes, T talents, P spellbook, J quests, M map, Esc menu. Controller: left stick move, right stick look, RT attack, LT block, A dodge, X use, Y power, B sneak, LB/RB + A/B/X/Y spells, Start menu, d-pad up horse. Phone: stick + drag to look, Attack/Dodge/Block/Use/Run buttons, tap a ground spell then tap the ground.

## Tests and tools

- `node --test prototypes/oathwild/tests/rules/*.test.mjs` — 145 tests: purity, drift guard (pins every borrowed
  number), class trees, level 1→10 for every round-1 class and several mixes, plate rules, ranks, tooltips (no NaN,
  no long decimals), individual loot, auras, use-skills, world state, combat bots (every class wins a level-matched
  fight), co-op camp clear, death/revive, forms, summons, taunt, sneak, leash, horse, same seed = same fight.
- `node --test prototypes/oathwild/tests/world/*.test.mjs` — 35 tests: the map, placements, the quest engine and a
  campaign bot that plays all 23 quests from level 1 to 10 alone (warrior, cleric) and as a group of three.
- `node --test prototypes/oathwild/tests/net/*.test.mjs` — the server: join, move, water stops you, sprint, fights, individual loot, spells, quest sharing, a whole quest with per-player rewards, level-up, gear, save/load, reconnect, protocol; and a 3-player co-op test through the real server process.
- Browser (one at a time, needs oathwild-dev): `node prototypes/oathwild/tests/ui/smoke.mjs [--phone]` (title → hero → world → walk), `tests/ui/controls.mjs` (keys, mouse, mocked controller change the game), `node tools/walk-screens.mjs oathwild` (every screen, desktop + phone, `tests/walk.mjs`).
- `node prototypes/oathwild/tools/map-preview.mjs [--text]` — draws `docs/map-overview.png`; `tools/place-world.mjs
  --write` rebuilds `data/placements.json` from its layout.
- `node prototypes/oathwild/tools/sim-levels.mjs [--fight] [--class paladin | --plan warrior,cleric,… | --all]` —
  every number per level for tuning.
- `node prototypes/oathwild/tools/pin-drift.mjs` — re-pin the borrowed numbers after reviewing a change in
  Farhold / Emberveil / Thousandvale.
- `node prototypes/oathwild/tools/classes-md.mjs --write` — regenerate the trees in `docs/CLASSES.md`.

## History

- 2026-11-23 — round 1, rules core: 27 classes consolidated from Farhold / Thousandvale / Emberveil (8 base, 13
  advanced, 6 specialty), mastery trees with ranks and modifiers, attributes, talents, non-combat skills, plate and
  other training, auras, the world sim, individual loot, tooltips, world state; 145 tests.
- 2026-11-23 — round 1, world content: a hand-shaped map of Brightwater Vale and Thornmere Wilds (rivers, marsh,
  roads, four crossings, level bands), Larkford and Thornwatch, 11 camps, 17 roam zones, 7 shrines, 10 chests, 34
  people with trainers for every round-1 class, the main thread (8 quests, a boss in each region, a hook north) and
  15 side quests; 35 world tests including a level 1-10 campaign bot.
