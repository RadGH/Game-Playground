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

## Round 10 additions
| System | Where |
|---|---|
| Named enemies: 14 static named enemies with original names (Vekkash the Ember-Tongued, Grulnak the Warlord's Voice, Cinderjaw, Harrow Ashmouth, The Smouldering Bride, Brother Calx, Morrgath the Gate, Ysgrith, Oth the Choir, The Grieving Star, Saltmother, The First Knight, Scald Firetongue, The Dragon King's Shadow) on challenge nodes, plus random named leaders (syllable names + titles + 1–2 modifiers: tough/fast/regen/thorns/fiery/vampiric/cursed/summoner/colossal; +50% HP, +25% damage, double xp, triple gold, a named drop) on ~8% of fights and 25% of night raids | `data/named-enemies.json`, `js/game.js` `namedEnemy/namedEncounter` |
| Nemesis: a named enemy that beats the party escapes, gains a title (the Twice-Victorious, the Unkillable) and returns in the same or next act with a grudge line; killing it clears the grudge and counts for the bounty | `addNemesis/nemesisEncounter/resolveNamed`, memory type `nemesis` + `recall_nemesis` lines |
| Side quests (bounty board in town Quests tab): 10 bounties from the original plus "Heads on Pikes" (3 named kills); done when the target node is cleared / encounter beaten | `data/side-quests.json`, `sideQuests/acceptSideQuest/checkSideQuests` |
| Journal tab: each hero's strongest memories spoken in their own voice (Lingo recall lines), the day log, quests | `journal()`, `renderJournal()` |
| Companion memories: companions share combat/travel/meal/join memories and get kill memories; camp topics about the dog's kills, its wounds, new arrivals | `partyIds()`, topics `companion_*` |
| Callback conversations: what was said at camp is remembered (`rememberConversation`) and `callback_*` topics quote it later | `restScene()` |
| Party voice system: every hero/hire/NPC/enemy voice comes from `shared/voices.js` (a timbre per class/role, varied by seed) | `voiceFor`, `roleForEnemy` |
| Random NPCs with generic looks and decals (`makeNpc`), class-specific parts flagged `bespoke` and kept out of random rolls | `library/js/make.js`, `avatar-2d/js/parts/gear.js` |
| Map: depth-column layout (no overlaps), curved edges, SVG icons per node type (named enemies get a star), talent/upgrade descriptions in the Skills tab | `layoutZone`, `NODE_ICONS`, `describeEffect` |

## Round 11 additions
| System | Where |
|---|---|
| Original names only: the 14 static named enemies were renamed (no third-party names anywhere player-facing) | `data/named-enemies.json` |
| Sayings variety: every catchphrase/prefix/suffix has 5–6 variations via Lingo `{~a|b}`; each class has five catchphrases | `tools/build-emberveil-classes.mjs` `CATCH`, library/speakers data |
| Long-running conversation threads at rest (gear promise, grudge hunt, scholar's reading, homesick letter, watch debt, wager) with day/node/objective gaps and rewards | `conversations/data/threads.json`, `restScene()` |
| Hero errands (class quests): 60 personal quests (two per class) built from the class's skills and play style; a hero asks at camp, a violet star node is added to the zone, progress shows in Quests, rewards (talent point, xp, gold, an item) and party reactions by relationship on completion | `data/class-quests.json`, `game.js` `startHeroQuest/trackFight/trackEvent/reactionsTo`, `heroQuestDone()` |
| Rare camp dialogs with rewards (coin, star, bard, pup, dream talent, merchant ring, Veil whisper, map, arm wrestle, lesson, contest) | `applyTopicReward()` |
| Variety generator triples conversation lines with personality openers/closers | `expandVariants` |
| Language debug mode (HUD toggle): click any word in a spoken line → pronunciation (phonemes from our engine), lexicon entry + forms, type a respelling or a replacement word applied on the fly, export/import JSON, submit to the dev server inbox (`library/synced/inbox/lang-overrides-*.json`) | `shared/langdebug.js` |

## Enemy looks

Every enemy, boss, class pet, kennel companion and named hire has a **designed** look in `data/enemy-looks.json` — nothing is guessed from the id any more. Built by `tools/build-emberveil-enemies.mjs` (edit the tables there, then re-run it); the same looks are filed in the character library as `enemy_<id>` (kind `enemy`) and `companion_<id>` (kind `npc`), so any page on the origin can stamp one.

```json
{ "enemies": { "goblin_warrior": { "name": "Goblin Warrior", "desc": "…", "voiceRole": "goblin",
    "traits": ["abrasive","bloodlust"], "voice": { … }, "speech": { … }, "race": "goblin", "avatar": { … } } },
  "bosses": { … }, "pets": { … }, "companions": { … }, "hires": { … } }
```

- **Humanoids** (goblins, bandits, cultists, knights, sorcerers, prophets, heralds, the Architect, the Void Scholar, the named hires) carry a full `avatar` built from the 2D part catalog including the gear parts (`hood`, `great_helm`, `scale_plate`, `harness`, `trim_robe`, `high_collar_robe`, glow eyes, decals). Goblins are green with big ears and hooked noses, the undead are pale with hollow eyes and `undead_skin`, demons are red with `horns_hair`, Veil things are violet with `face_glyphs`. The same JSON drives the 2D portrait and the Mii body on the stage.
- **Beasts, constructs and spirits** carry a `creature` spec (type + size + colour/feature overrides) built by `avatar-3d/js/creature-types.js`: wolves, bears, hounds, spiders, drakes and dragons, plus golems, elementals, wraiths, imps, horrors, worms, shards and titans.
- **Sizes**: the stage does not rescale bodies, so ordinary creatures land around 1–2 m tall and bosses around 2.5–3.5 m. Type base heights are listed in `avatar-3d/README.md`.
- `main.js` `enemyLook()` reads the designed look first and only falls back to the old regex guess for an id with no entry; named (super-unique) enemies start from the designed look and paint their fixed overrides and scars on top. `bodyOf()` does the same for companions and pets, and the tavern gives each named hire their own face instead of the class default.
- Coverage is enforced: `tests/looks.test.js` fails if a roster id has no look, if an avatar uses a part id that does not exist (which would silently fall back to the default part), or if a creature type is unknown.

## Not rebuilt (on purpose, listed so nothing is silently missing)
- Tap weapons/utilities (the real-time layer), achievements, codex, telemetry, cloud saves, NG+ UI (scaling constants are in `rules.js`), hardcore mode, infinite dungeon, guild hall/black market stock (formulas noted in `research/`), champion modifiers beyond hp/dmg, recruitable story heroes from dialog (`recruitHero` outcomes show text only), fame rewards beyond shop tier bumps, class unlock gating (all thirty classes are open; the original rule is shown on each card).

## Spell effects

Fights are drawn with `avatar-3d/js/spellfx.js` (see its README). The stage owns a `SpellFx` and steps it in
the frame loop; the playback loop in `js/main.js` maps combat events onto it:

- a `skill` event flashes a rune at the caster and remembers the element — from the enemy spell's `fxKind`
  (`data/enemy-spells.json`), or from the hero skill's `damageType` via `skillType()` in `js/combat.js`,
  falling back to arcane for magic and physical otherwise;
- the caster's **first** `damage` event throws the projectile (later hits of the same skill only burst, so a
  multi-target skill stays quick);
- an `attack` from a magic-weapon hero throws a bolt and from a bow/crossbow/javelin hero an arrow; everyone
  else keeps the old thrust animation;
- `damage` bursts with `ev.dtype` (`crit` makes it bigger and adds a second shockwave);
- `status` turns a looping aura on, and after every event the auras are re-synced against the unit's real
  `statuses` list, so an expiry clears itself; `dot` ticks pulse the aura and add a small burst;
- `heal` and `revive` play their own effects; `down`, `kill` and the end of the fight clear every aura.

Flight time is capped at 450 ms so the round loop is no slower than the sleeps that were already there.

## Themed interface (round 12)

The prototype used to look like a form. It now reads as a game: near-black leather panels, burnished
gold trim, ember accents, parchment lore text, **Cinzel** for headings and **Spectral** for body copy
(Google Fonts, with system serif fallbacks).

- **Art** — every ornament and icon comes from `assets/data/ui/` (listed in `assets/data/manifest.json`
  under `ui`): `emblem`, `frame_corner` (rotated into four corners by `ui.js`), `divider` (section rules),
  `button_end` (bracket ends on ornate buttons), `title_banner`, `panel_tile` (leather texture),
  `ember_particle`, HUD icons (gold, fame, day/night, ration, torch, tent, boot, wagon, hp, mp, xp),
  tab icons, equipment-slot icons, attribute icons and rarity gems. The `tab_*`, `slot_*` and `stat_*`
  files are drawn in `currentColor` and are used as CSS masks, so they take the colour of the text
  around them. No emoji are left in the interface.
- **Title screen** — banner skyline, glowing sigil, gold-gradient wordmark, drifting embers (a dozen
  CSS-animated sprites) and a collapsible **How to play** panel that explains the loop in plain words.
- **Hire screen** — class cards are framed portraits with a role-coloured ribbon; hovering lifts the card
  and shows a tooltip with the class blurb, its starting kit and its first skill; picked classes glow.
  The party is four framed sockets that fill as you hire.
- **World screen** — the top bar is a status bar of icon chips (gold, fame, day + moves left with a
  sun/moon icon, rations that turn warning-red at one day left, vehicle), each with a tooltip; the zone
  and act sit under it as a breadcrumb that never repeats itself (the act label usually already carries
  the zone name). On a phone the chips become one horizontally scrolling row with Save and Menu pinned,
  and the "← Playground" link folds into the menu. Every panel gets corner flourishes, headings get the divider
  rule. Log lines fade in; lore is serif italic, speakers get a coloured left rule (hero / npc / enemy),
  system lines are muted. Action buttons carry an icon and a tooltip that says what will happen (rest:
  night-attack chance and what heals; travel: moves left). Tabs are icon + label with an ember underline
  that flickers on the active one.
- **Tabs** — party cards have portrait frames, hp/mp/xp bars (red / blue / violet) with the numbers in
  the tooltip, stat chips that explain STR/DEX/INT/CON, armor, hit, dodge and crit, and an equipment grid
  of slot icons + rarity gems where hovering a piece shows its full card. Bag rows show a rarity gem and,
  on hover, the item card with the compare-to-equipped difference. Skill rows show type / mana / cooldown
  chips and explain every talent and upgrade.
- **Map** — drawn as an aged chart: warm parchment ground over the leather tile, a faint survey grid,
  dashed `#c8a870` trails (the one you can walk today glows ember and its dashes march), visited nodes
  as wax-seal discs with a pressed inner ring, the current node pulsing, nodes you know nothing about
  dimmed, and a small compass (the `tab_map` icon) in the corner. The svg viewBox is rebuilt to match
  the panel's shape on every render (and on window resize), so circles stay round and labels are not
  smeared sideways. Nodes have a hover halo and a tooltip naming the node type with a plain-language
  line (`js/ui.js` → `NODE_INFO`); labels alternate above and below the trail and are truncated to the
  space between columns, with the full name in the tooltip.
- **Quests / Meter / Journal** — the same treatment as Party and Bag: `sectionHead()` headings with the
  divider rule (The story, Hero errands, Bounty board, Finished; The party, Companions, Grudges, Days on
  the road; Damage meter), rows with an icon and a body, finished work struck through, and empty states
  written in the serif italic instead of a blank panel. The damage-meter library keeps its own markup —
  only its colours are restated warm, per damage type, under `#tab-meter`.
- **Menu** — `Menu` (or the button in the top bar) opens an overlay: Resume, Save, Load last save,
  New game (asks first), How to play, Back to playground, plus Settings — voice engine, mute, text speed
  and the language-debug controls, which used to clutter the top bar. Escape or a click on the backdrop
  closes it.
- **Feedback** — buttons press down, cards lift, focus rings are gold, disabled controls are greyed and
  say why (a disabled button gets no hover events, so those use the browser's own `title`), and the toast
  is a parchment strip.

Files: `style.css` (all of the theme), `js/ui.js` (icon helpers, rarity gems, slot icons, stat and node
text, frame flourishes, embers, how-to-play, the menu overlay, tooltip cards) and
`shared/tooltip.js` + `shared/tooltip.css` (the tooltip engine, shared with the rest of the playground).

## Files
- `index.html`, `style.css` (dark-fantasy theme), `js/main.js` (screens + flows), `js/ui.js` (themed interface helpers), `js/game.js`, `js/rules.js`, `js/combat.js`, `js/loot.js`, `js/stage.js` (3D stage from Party Quest + zone backdrops), `js/talk.js`, `js/rng.js`.
- `data/`: everything the game reads; `data/class-looks.json` = the 30 class blueprints (also in `library/data/defaults.json` as `ev_<class>` and in the 2D presets); `data/enemy-looks.json` = the 80 enemy/boss/pet/companion/hire looks (also in the library as `enemy_<id>` / `companion_<id>`).
- `research/`: condensed notes from the original code (`rules-notes.md`, `world-notes.md`).
- `tests/`: `loot.test.js`, `rules-combat.test.js`, `game.test.js`, `looks.test.js` (node), `emberveil.spec.js` (Playwright).
- Builders: `tools/build-emberveil-data.mjs`, `tools/build-emberveil-classes.mjs` (edit `LOOKS` there to change a class's look), `tools/build-emberveil-enemies.mjs` (edit `ENEMIES`/`BOSSES`/`PETS`/`COMPANIONS`/`HIRES` there to change a monster's look).

## Debug handle
`window.emberveil` → `game`, `stage`, `talk`, `library`, `lingo`, `DATA`, `LOOKS` (classes), `ELOOKS` (enemy looks), `enemyLook(e)`, `bodyOf(h)`, `companionLook(id)`, `fight(encounter, {node, boss})`, `enterNode()`.
