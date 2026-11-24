# Oathwild

**Status:** round 1 in progress: rules core (classes, levelling, spells, auras, combat sim, loot, tooltips, world state) built and tested; client, server, world and art are being built by other helpers.
**Play:** nothing to play yet — the rules run in tests and the tuning tool (`node prototypes/oathwild/tools/sim-levels.mjs --fight`).
**Next:** the server wraps `js/rules/combat.js` at 20 Hz; the client draws `describe.js` tooltips, the class tree, loot windows and spell aiming; the world builder fills quests and places camps (`data/regions.json` positions are placeholders).
**Parked:** Smithing / Alchemy benches and the Tinker class (later round); Chronomancer, Oracle, Dragon Knight, Starcaller (trees written, past round 1's cap or waiting on sim rules); charm/turn spells (Beguile, Grand Enthrallment); Farhold's resource / afterimage / "consumes" spell rules (dropped from reused rows until the sim runs them).

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

Data lives in `data/*.json` (each file's `_doc` says who reads it). `data/art.json` and `data/spell-visuals.json`
belong to the art and spell-visual helpers.

## Tests and tools

- `node --test prototypes/oathwild/tests/rules/*.test.mjs` — 145 tests: purity, drift guard (pins every borrowed
  number), class trees, level 1→10 for every round-1 class and several mixes, plate rules, ranks, tooltips (no NaN,
  no long decimals), individual loot, auras, use-skills, world state, combat bots (every class wins a level-matched
  fight), co-op camp clear, death/revive, forms, summons, taunt, sneak, leash, horse, same seed = same fight.
- `node prototypes/oathwild/tools/sim-levels.mjs [--fight] [--class paladin | --plan warrior,cleric,… | --all]` —
  every number per level for tuning.
- `node prototypes/oathwild/tools/pin-drift.mjs` — re-pin the borrowed numbers after reviewing a change in
  Farhold / Emberveil / Thousandvale.
- `node prototypes/oathwild/tools/classes-md.mjs --write` — regenerate the trees in `docs/CLASSES.md`.

## History

- 2026-11-23 — round 1, rules core: 27 classes consolidated from Farhold / Thousandvale / Emberveil (8 base, 13
  advanced, 6 specialty), mastery trees with ranks and modifiers, attributes, talents, non-combat skills, plate and
  other training, auras, the world sim, individual loot, tooltips, world state; 145 tests.
