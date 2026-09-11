# Emberveil 2 (prototype 2) — the user's RPG rebuilt on the playground pieces

Source: `~/claude/emberveil/` (the production repo, treated as **read-only**; `~/claude/emberveil-storymode` is ignored on the user's
instruction). Open `http://<lan-ip>:8400/prototypes/emberveil/`.

## What was rebuilt

| System | Original | Here |
|---|---|---|
| Data | `data/*.json` + hand-authored map modules | `tools/build-emberveil-data.mjs` copies the JSON and dumps the map/event ES modules to `data/*.json` (classes, 124 skills with talents + upgrades, build presets, 30 enemies + 12 bosses, 49 encounters, enemy spells, boss death lines, 13 zones with node graphs, 76 dialog events, 166 random events, 6 dungeons, companions/hires, balance) |
| Items | `src/game/items.js` etc. | `data/items.json` (35 weapon + 47 armour bases, 19 base affixes + 5 shield + 40 extended, 24 uniques with legendary effects, 24 sets, potions, salvage, prices, zone + boss drop tables) built from the research brief; `js/loot.js` generates, names, scores, prices, salvages, adds affixes, promotes rarity, rolls shops/boss loot/zone drops. Dead base keys in the original drop tables were fixed; the dormant 40 extended affixes and the never-called set drops are wired in. |
| Stats / progression | `formulas.js`, `xp.js`, `passives.js`, `skills.js` | `js/rules.js`: derived stats (HP/MP/hit/dodge/crit/initiative/spell power…), basic damage range, level 30 xp curve, 2 attribute points per level, talent points at 3/8/13/18/23/28, passive points every 5 levels, 5-node passive trees per class, talent (additive) + upgrade (replace) merging, hero creation from build presets with the class kit, equip rules (two-handers clear the off-hand, rings, off-hand-ok weapons), enemy scaling (global × act × party-size × NG+), champions |
| Combat | `simulator.js`, `CombatScreen.js` | `js/combat.js`: initiative each round (+d10, slow halves), stun/freeze/sleep/confused gates, hero AI (revive → heal thresholds → shield → best expected-damage skill → buff → attack), enemy AI (healer role, spell chance, taunt/taunting/companion-first targeting), pipeline hit → block → armour curve `a/(a+100)` → resistAll → dmgReduct → marked ×1.3 → barrier → HP, crits, DoTs, sunder/curse/silence, attack-speed extra actions, legendary effects (cheat death, crit bleed, dragon breath, echo cast…), flee check |
| World | `mapData.js`, node screens | `js/game.js`: zone graph with fast travel to visited nodes, node memory (cleared fights, one-shot shrines/treasure/checks), dialog + random events with `requires`, skill checks (best attribute + d20), rewards (gold/xp/heal/damage/items/companions/flags), boss kills unlock the next zone + main quests, dungeons (stages, skill check stun/damage, reward), towns per act (merchant seeded stock, tavern hires named + walk-ins + companion kennel + bench, cleric rest, blacksmith salvage/affix, enchanter promote, trainer respec), defeat (wake in town, lose 15% gold), save/load |
| Presentation | pixel sprites, canvas | Mii bodies for every class with new gear parts (`avatar-2d/js/parts/gear.js`, `avatar-3d/js/mii-gear.js`), creature bodies for beasts, act-themed SVG backdrops on the 3D stage, Lingo barks (taunts, hurt, ally down, kills, event NPC lines spoken aloud with the Formant voice) |

## Added on top of the original (round 9)
| System | Where |
|---|---|
| Memory + feelings: every hero has a memory bank and relationships (combat, kills, wounds and knock-downs, loot found with equipped/replaced/score-delta, travel, meals, level-ups); the Party tab's **Feelings** button shows them | `js/game.js` `remember()`, `logLoot()` |
| Voices: every hero and NPC speaks with **our** formant engine (`voice-lab/js/formant-voice.js`, module 1.1.0); barks in fights, NPC lines in events, camp talk | `js/talk.js`, `js/main.js` `sayLine` |
| Travel days: 3 node moves per day (vehicle changes it), then the party must rest. HUD shows moves left, rations, exhaustion, vehicle | `js/game.js` `spendLeg/legsLeft/rest` |
| Supplies: rations (1 per day, or every 2–3 days with a mule/wagon/ox cart), bandages (30% HP out of combat), torches (−10% night attack), tent (15% HP on rest). Out of food → exhaustion stacks (−10% hit/dodge/damage each), cleared by fed rests. **Rest does not heal**; eat an extra ration for 30% HP | `SUPPLY_KINDS`, `exhaustionMult()`, Bag tab "Party supplies", merchant "Supplies" |
| Vehicles: on foot, pack mule, wagon, ox cart, war wagon (night fights start behind a barrier), fast coach, dragon sled (act 6); each sets moves per day, ration efficiency, night-attack chance and raid size | `VEHICLES`, merchant "Stable" |
| Night attacks: the chance is shown before resting (base by act + vehicle + torch); a raid is an ambush from the zone's pool, sized by the vehicle's difficulty | `nightAttack()`, `nightEncounter()`, `restScene()` |
| Rest conversations: two structured exchanges per night from the Conversations experiment, cast from real memories, gear kill counts (meter), gear deltas, rations, the next boss, companions and relations; campfire on the stage | `conversations/`, `restScene()` |
| Damage meter: every hit/heal/DoT is recorded (source, via, type, crit, overkill, absorbed, killing blow, item); Meter tab drills hero → source → hit, per fight or whole run; weapons keep kill counts | `meters/`, `js/combat.js` records, `renderMeterTab()` |
| Map: every zone ~50% longer (mostly combat, some ambush/treasure/shrine) inserted along existing branches | `tools/expand-emberveil-map.mjs` |
| Emberveil vocabulary for Lingo (151 entries) | `lingo/data/packs/emberveil.json` |

## Not rebuilt (on purpose, listed so nothing is silently missing)
- Tap weapons/utilities (the real-time layer), achievements, codex, telemetry, cloud saves, NG+ UI (scaling constants are in `rules.js`), hardcore mode, infinite dungeon, guild hall/black market stock (formulas noted in `research/`), champion modifiers beyond hp/dmg, recruitable story heroes from dialog (`recruitHero` outcomes show text only), fame rewards beyond shop tier bumps, class unlock gating (all thirty classes are open; the original rule is shown on each card).

## Files
- `index.html`, `style.css`, `js/main.js` (screens + flows), `js/game.js`, `js/rules.js`, `js/combat.js`, `js/loot.js`, `js/stage.js` (3D stage from Party Quest + zone backdrops), `js/talk.js`, `js/rng.js`.
- `data/`: everything the game reads; `data/class-looks.json` = the 30 class blueprints (also in `library/data/defaults.json` as `ev_<class>` and in the 2D presets).
- `research/`: condensed notes from the original code (`rules-notes.md`, `world-notes.md`).
- `tests/`: `loot.test.js`, `rules-combat.test.js`, `game.test.js` (node), `emberveil.spec.js` (Playwright).
- Builders: `tools/build-emberveil-data.mjs`, `tools/build-emberveil-classes.mjs` (edit `LOOKS` there to change a class's look).

## Debug handle
`window.emberveil` → `game`, `stage`, `talk`, `library`, `lingo`, `DATA`, `LOOKS`, `fight(encounter, {node, boss})`, `enterNode()`.
