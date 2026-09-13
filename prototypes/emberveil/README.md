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

## Combat speech variety (round 15)

A prologue playthrough heard "Is that all, \<hero\>?" three times, because that taunt had double weight in
`combat_taunt` and Lingo's anti-repeat only remembered what *each speaker* had just said — four heroes meant four
chances at the same favourite. Fixed on both ends:

| Change | Where |
|---|---|
| Every fight opener now comes from Lingo. Talking enemies use `enemy_opener` (96 lines: 16 generic + 10 each for goblins, bandits, cultists, undead, demons, void things, dragons and knights); bosses use `boss_opener` (14); wordless beasts get narration from `beast_snarl` (16) instead of "The wolf snarls."; camp raids use `night_attack` (14) and ambush nodes `ambush_opener` (14) | `js/talk.js` `enemyOpener/beastOpener/raidOpener`, `lingo/data/grammar.json` |
| Enemy families and hero roles are grammar **tags**, switched on per speaker: `enemyKind()` maps a template id to goblin/bandit/cultist/undead/demon/void/dragon/knight, `heroRole()` maps a class role to tank/healer/caster/rogue/ranger, and `speechFor()` sets every other tag in the family to 0. Each family also gets its own traits and sliders (`KIND_SPEECH`), so a goblin and a dragon read differently out of the same pool | `js/talk.js` |
| Named enemies and nemeses open on their history: `named_first` (12), `named_rematch` (12, with `defeats` and `days` since it got away), `named_avenge` (13, names the hero it put down), `named_beaten` (12, for one the party already beat). The hard-coded "You again. I told you I would come back." is gone | `js/talk.js` `namedOpener()`, `js/main.js` `fight()` |
| Nothing repeats: Lingo keeps a session-wide history per phrase pool (20 deep, `meta.noRepeat`), and `ctx.exclude` stops two enemies in the same fight opening with the same line (`talk.beginFight(enc)` clears it) | `lingo/js/lingo.js` `pick()`, `js/talk.js` `fightLines` |
| Hero pools grew and got role flavour: `combat_taunt` 33, `combat_bark` 42, `combat_kill` 26, `combat_hurt` 23, `ally_down` 20, `brag` 22, `relief` 20, `warning` 15 | `lingo/data/grammar.json` |

Tests: `node --test prototypes/emberveil/tests/talk-variety.test.js` (family/role routing, no repeat in a fight, named
situations, 30-fight run stays wide) and `lingo/tests/combat-variety.test.js`.

Known gap: `combat.js` emits a `phase` event when a boss flips phase, but `main.js`'s event loop has no branch for it,
so neither the hand-written `onEnter` text in `data/boss-phases.json` nor the new `boss_phase` pool (14 lines,
`talk.bossPhaseLine(boss)`) is shown yet. One `else if (ev.type === 'phase')` in the fight loop turns it on.

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

## Every effect works (round 13)

`js/effects.js` is one registry of **359 effect ids** — every legendary power, item affix, skill /
talent / upgrade key, status effect, champion and named-enemy modifier, enemy-spell key and boss-phase
key from the original game. Each entry carries a plain-language description (used by item tooltips and
the skills tab) plus the hook functions the engine calls: `derive`, `combatStart`, `roundStart`,
`dmgOut` / `dmgIn` / `dmgFlat`, `onAttack` / `onHit` / `onCrit` / `onKill` / `onDamaged` / `preLethal`,
and for skills `merge`, `gate`, `pickTargets`, `onCast`, `onBuff`, `dmgMult`, `onHit`, `onEnd`.
`combat.js`, `rules.js`, `loot.js` and `game.js` only dispatch — adding an effect later is one entry.

176 of those ids were **data only in the original**: 99 of the 214 `skills.json` keys were never read,
38 of the 40 `cond_*` affixes did nothing, and 10 of the 26 status types were a glyph with no mechanic.
They all change the game now. Anything a player can see emits a combat event (`via: 'proc:<id>'`,
`'legendary:<id>'`, `'affix:<id>'`, `'champion:<id>'`, with a `label` and a `dtype`), so the damage
meter and the 3D stage pick up the procs.

`tests/effects.test.js` is table-driven with **one row per id** — it runs the same seeded fight twice,
with and without the effect, and fails if nothing changed. It also checks that no id in `items.json`,
`skills.json`, `enemy-spells.json` or `boss-phases.json` is an orphan, and that every `statusMeta` type
has a mechanic rather than just an icon.

Full table, and the two systems deliberately not ported (crafting recipes, fame cosmetic unlocks):
**`EFFECTS.md`**.

## New weapons: the road weapons (round 14)

Twenty-two new weapon bases and twelve new uniques, each with at least one property that touches a
system **Emberveil 2 added on top of the original** — travel legs, rations and exhaustion, the
night-attack roll, rest, the damage meter's per-item kill counts, memories and feelings, named
enemies and nemeses, companions or vehicles.

Everything is a registry entry in `js/effects.js`, so a weapon property is data plus one entry:
the combat ones use the hooks that were already there (`dmgOut`, `onHit`, `onKill`, `combatStart`,
`critBonus`), and the out-of-combat ones use a new set of **world hooks** dispatched from `js/game.js`:

| hook | called from | what it changes |
|---|---|---|
| `legs(v, game, hero)` | `legsPerDay()` | extra node moves today |
| `nightChance(v, game, hero)` | `nightAttack()` | the odds of a raid on the camp |
| `exhaustionEase(v, game, hero)` | `exhaustionMult()` | how much going hungry costs you |
| `nemesisChance(v, game, hero)` | `enter()` | how often a beaten leader comes back |
| `onLeg(v, game, hero)` | `travel()` | after every move (foraged loot, coin) |
| `onRest(v, game, hero, out)` | `rest()` | the night (healing, standing watch, rations) |
| `onWin(v, game, hero, ctx)` | `victory()` | after a won fight (food, memories, feelings) |

`worldFx()` collects them off whatever the living heroes are carrying; `fireWorld` / `worldSum` /
`worldMax` dispatch. New bases carry their property as an `intrinsic` entry in `data/items.json`
(pushed as an affix by `Loot.addIntrinsics`, so tooltips, the score, the meter and the effect
registry all already understand it), a `minAct` gate and a `look` (a held part from
`avatar-2d/js/parts/gear.js` plus a colour, drawn on the hero's body by `withHeldGear` in `main.js`).

Every proc emits a combat event with `via: 'proc:…'` / `'affix:cond_…'` / `'legendary:…'` and a
`dtype` the 3D stage can draw, so the damage meter and the spell effects pick them up for free.

### Bases

| weapon | act | property |
|---|---|---|
| Forager's Blade | 1 | after a won fight, a 25% chance of finding a day's food |
| Lantern Mace | 1 | night attacks are 12% less likely |
| Pathfinder Javelin | 1 | one extra node move every other day |
| Tithe Dagger | 1 | killing blows are remembered by name, and told again at camp |
| Roadwarden Bow | 2 | 12% chance of turning up loot on each move |
| Pilgrim's Staff | 2 | the exhaustion penalty is halved |
| Houndmaster's Lash | 2 | your companion gets a second go every round |
| Emberbrand Wand | 2 | hits strike again as fire and can set the target alight |
| Rimecut Sabre | 2 | hits strike again as ice and can slow |
| Bramble Staff | 2 | hits strike again as nature damage and can poison |
| Warhorn Maul | 3 | your companion starts every fight furious |
| Wagon-Axle Club | 3 | +15% damage while the party is travelling with a vehicle |
| Breaker's Pick | 3 | 30% chance to sunder armour |
| Hunter's Edge | 3 | +25% damage against champions, named enemies and bosses |
| Stormpin Crossbow | 3 | hits strike again as lightning and can daze |
| Gravebound Scepter | 4 | hits strike again as shadow and can curse |
| Dawnwarden Hammer | 4 | hits strike again as holy fire |
| Blood Ledger | 4 | +1% damage for every ten kills the meter has recorded on it (cap +25%) |
| Covenant Hammer | 4 | you take 8% more, and the party thinks better of you for it |
| Grudgebrand | 4 | +18% damage, and survivors come back as nemeses far more often |
| Starwake Bow | 5 | crit chance climbs with the health you have already spent; arcane brand |
| Watchfire Glaive | 5 | stands the night watch (no ambush at all) for one extra ration |

### Uniques

| unique | act | base | power |
|---|---|---|---|
| Emberwatch | 1 | Lantern Mace | a night beside it mends the party 15% |
| Thistlewarden | 1 | Forager's Blade | a won fight yields two days of food, and the party remembers eating well |
| The Namesake | 2 | Tithe Dagger | at fifty kills it earns a name and the party never stops telling the story |
| Roadsong | 2 | Roadwarden Bow | every move turns up a cache of coin |
| Kennelbreaker | 3 | Warhorn Maul | the companion hits 40% harder, carries a quarter more health, starts furious |
| Champion's Bane | 3 | Hunter's Edge | at fight start the biggest champion or named enemy loses one modifier |
| The Ingrate | 3 | Greatsword | +25% damage, and the party resents every swing |
| Ledger of Ash | 4 | Blood Ledger | +1% damage per five kills, up to +60% |
| Veilspiller | 4 | Gravebound Scepter | a kill spills the curse over everything still standing |
| Wayfarer's Pike | 5 | Pathfinder Javelin | one extra move every day |
| Grudge-Crown | 5 | Breaker's Pick | double damage to nemeses and named enemies; a kill mends the party |
| The Long Watch | 6 | Watchfire Glaive | no night attacks at all, even on an empty larder |

Four camp topics ride on them (`conversations/data/topics.json`): `road_weapon_forager`,
`road_weapon_watch`, `road_weapon_named_blade` and `road_weapon_hated`. They use a new gear
requirement key — `requires: [{ gear: { effect: 'cond_forageRation' } }]` matches an affix stat, a
legendary id or a list of either, alongside the existing `baseKey` / `unique` filters.

`tests/weapons.test.js` has one row per weapon proving its property does something (combat rows run
the same seeded fight with and without it; world rows run a real `Game` through travel, rest and
victory), plus a test that every base drops in its act and not before, and that every unique is
reachable from a boss table.

## Simulation and balance

`tools/sim-emberveil.mjs` plays whole runs headlessly with the game's own modules — the same `Game`
(map, travel legs, rations, night attacks, rest, towns, named enemies, nemeses), the same `Combat`,
the same `Loot`, the same damage meter. A small bot does what a player does: spends attribute,
talent and passive points on level-up, walks toward the boss, fights what is in the way, bandages
between fights, goes back to town when it is hurt or hungry, buys food and bandages, and equips
anything with a better score. A run ends when the party has been wiped three times or the day cap
is reached.

```bash
node tools/sim-emberveil.mjs --runs 300 --seed 1              # ~3.5 min, prints a markdown report
node tools/sim-emberveil.mjs --runs 60 --act 3                # start every run at the head of act 3
node tools/sim-emberveil.mjs --runs 40 --class necromancer    # every party carries one
node tools/sim-emberveil.mjs --runs 300 --matrix --quiet \
  --report prototypes/emberveil/research/sim-latest.md        # + class and weapon matrices (~12 min)
```

Flags: `--runs N` `--seed N` `--act N` `--class ID` `--matrix` `--quiet` `--days N` `--report PATH`.
Runs are seeded and repeatable. The report covers the per-act funnel (how many runs reached each
act, cleared it, stalled there and wiped there), a difficulty curve (rounds per fight, the share of
the party's health bar one fight costs, enemy HP and damage faced, gear score), where the party
stands at each act boundary (day, level, XP held against the XP table, gold, gear), loot and gold
per fight per act with the rarity mix, crossings pass/fail per hazard, damage share by source
(weapon/skill/status/proc) and by class, status uptime per act, what kills the party, most and least
used skills, starvation, night-raid deaths, and the affixes, uniques, set pieces and legendary
powers actually worn at the end.

The current write-up is **`research/sim-report-2.md`** (round 19); the round-14 pass before it is
`research/sim-report.md`. Point `--report` at `research/sim-latest.md` so neither is overwritten —
`research/sim-before-r19.md` is the same report taken before the round-19 pass.

The round-19 pass was a difficulty pass: the game had drifted easy (28% of runs cleared all six
acts, act 1 never failed in 300 runs, an act-4 fight cost 2% of the party's health bar). The cause
was the XP curve — the party hit the level cap in act 5 holding three times the XP the table asked
for, so it outgrew every enemy multiplier. Stretching the XP table, trimming the XP and gold
multipliers, lifting acts 1/4/6, giving enemies a per-act armour ramp and some magic resist, making
bosses scale closer to the trash beside them, handing spell lists to nine silent late-game enemies
and three silent bosses (including the Dragon King), and taking the shine off loot and crossings
brought it to **11.3% full clears with act 1 at 91.3%** and a smooth funnel down through the acts.
Starting heroes were not touched.

**`data/balance.json` is the knob file.** `applyBalance(data.balance)` (called from the `Game`
constructor) loads `enemies.globalMultipliers`, `enemies.actMultipliers` (including the per-act
`armor` multiplier and flat `magicResist`), `enemies.boss`, `enemies.champion`, `enemies.named`,
`economy.globalMultipliers`, `progression.xpTable`, `progression.talentPointLevels`,
`partySize.enemyDmgMult` and `combat.skill` over the defaults; `loot.js` takes the `loot` block
(affix magnitude, drop rate, set and unique odds, shop markup) and `combat.js` reads the skill
multipliers. `data/crossings.json`'s `difficulty` block is read by `explore.js`. Edit the JSON,
re-run the sim, read the difference.

Two things in `balance.json` are **not** live yet: `progression.statPointsPerLevel` and
`progression.passivePointEveryNLevels`. `js/main.js` hardcodes +2 attributes and every fifth level,
so changing them would split the live game from the simulator.

## Not rebuilt (on purpose, listed so nothing is silently missing)
- Tap weapons/utilities (the real-time layer), achievements, codex, telemetry, cloud saves, NG+ UI (scaling constants are in `rules.js`), hardcore mode, infinite dungeon, guild hall/black market stock (formulas noted in `research/`), recruitable story heroes from dialog (`recruitHero` outcomes show text only), crafting recipes and fame cosmetic unlocks (both explained in `EFFECTS.md`), class unlock gating (all thirty classes are open; the original rule is shown on each card).

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

## Sound (round 16)

Sound comes from the shared `sfx/` library (`sfx/README.md`) and is bolted on from the outside:
`js/sfx-bridge.js` wraps the stage's own methods at runtime, so **`js/stage.js` is not touched at
all** and `main.js` gains exactly one import and one `installSfx({ stage, game })` call.

- **Fights** — `attack` swings, `cast` fires the element's launch sound, `impact` (and `fx.impact`,
  which is where damage-over-time ticks go) lands it, `status` plays the apply sting the first time a
  status appears and `pulseStatus` its per-round tick, `heal` and `reviveFx` play their own, and
  `down` picks a death sound from the body: construct, beast or humanoid. Everything is panned by the
  character's x position on the stage, so the enemy line is audibly on the right.
- **The world** — `setBackdrop` swaps the ambience bed (forest / cave / town / marsh / mountain /
  void / fire / wind, chosen from the scenery tags in `assets/data/manifest.json`), `camp` starts the
  campfire loop and `clearCamp` stops it, and `game.travel` puts a footstep on the road.
- **Text** — loot by rarity, gold, level-ups, quest and bounty completions, misses and night ambushes
  are picked up by watching what the game writes into the narrative panel (`NARRATIVE_RULES` in the
  bridge), so none of those call sites had to change.
- **Interface** — clicks, hovers and dialog open/close come from delegated listeners.
- **Settings** — the in-game menu has a **Sound effects** dropdown (hybrid / synth / CC0 samples /
  chiptune), effects, interface and ambience volume sliders, and a **Mute sound effects** checkbox
  that is separate from **Mute voices**. All of it is remembered in `localStorage`.

Volume is not per-sound guesswork: every clip is measured when it is built and levelled to its
category's target, so a recorded punch and a synthesized fireball arrive at the same loudness.

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
- **Tabs** — party cards are compact so all four heroes fit in the tab at once: portrait frame, name +
  class + level, hp/mp/xp bars (red / blue / violet) with the numbers in the tooltip, and one line of stat
  chips (damage, armor, crit, STR/DEX/INT/CON). The **Gear** button on a card opens a drawer with hit and
  dodge, the ten equipment slots (slot icons + rarity gems, hover for the full card) and the Feelings /
  Save to library buttons; each card remembers whether its drawer was open. Bag rows show a rarity gem and,
  on hover, the item card with the compare-to-equipped difference. Skill rows show type / mana / cooldown
  chips and explain every talent and upgrade.
- **Map** — drawn as an aged chart: warm parchment ground over the leather tile, a faint survey grid,
  dashed `#c8a870` trails (the one you can walk today glows ember and its dashes march), visited nodes
  as wax-seal discs with a pressed inner ring, the current node pulsing, nodes you know nothing about
  dimmed, and a small compass (the `tab_map` icon) in the corner. The svg viewBox is rebuilt to match
  the panel's shape on every render (and on window resize), so circles stay round and labels are not
  smeared sideways. Nodes have a hover halo and a tooltip naming the node type with a plain-language
  line (`js/ui.js` → `NODE_INFO`). Labels are never cut short: a long name wraps onto two lines, and each
  label is placed in the first free spot out of under / over / beside the node and two tiers further out,
  measured against everything already drawn, so labels never sit on one another or on a node.
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

## Interface round 17

- **The party tab fits.** Four heroes, four cards, no scrollbar at 1400×900 — every health bar is visible
  without hunting for it. Equipment, hit/dodge and the Feelings / Save buttons moved into a per-card
  **Gear** drawer that starts closed and remembers its state in `localStorage`
  (`playground:emberveil:ui:v1` → `gearOpen`). `renderPartyTab()` in `js/main.js`, `.member*` in `style.css`.
- **Map labels read.** The label font is 1.2 map units (was 1.7), long names wrap onto two lines with
  `<tspan>` instead of being cut with "…", and `renderMap()` measures every label and drops it into the
  first spot that is clear — under the node, over it, beside it (what saves a column whose discs almost
  touch), then further tiers. The hover card still carries the full name.
- **Your choices are in the log.** Clicking a choice empties the button row straight away, so the buttons
  can't sit there while the answer is being read, and writes the pick into the narrative as a gold
  `▸ You: …` line. This happens centrally in `waitForChoice()`, so every caller gets it — dialogue events,
  shop and NPC picks, dungeons, rest. Pass `{ silent: true }` (or `silent: true` on one action) to skip the
  log line, and `log: '…'` on an action to log different words than the button's label.
- **The damage meter follows the fight you are in.** `fight()` points the meter tab at the new fight the
  moment it starts (dropping any drill-down left over from the last one), redraws it at most every 250 ms
  while the rounds run, and once more at the end; opening the Meter tab always redraws it too.
- **Every line is spoken.** All spoken lines go through one queue (`enqueueSpeech()`), so a hero's reply
  waits for the enemy's taunt to finish and nothing is dropped. The old `wait: false` path (combat barks)
  showed a bubble and never played it; it now queues the audio and simply doesn't hold up the scene. A
  boss's dying line and a hero's scripted line in a dialogue event are spoken too, instead of being
  printed silently. Proof: `tools/scratch/ev-voice-audit.mjs` stubs the synthesizer and counts lines
  handed to it against bubbles shown.
- **Boss phases show.** The fight loop has an `ev.type === 'phase'` branch: the phase name and its written
  line go into the log, the boss flashes on the stage, and it speaks a `boss_phase` line
  (`talk.bossPhaseLine()`). Beasts get narration instead.
- **Rewards popup.** `shared/rewards.js` is wired into every payout: a won fight (`afterCombat()` via
  `specFromVictory`), chests and caches, crossings, hero errands, dialogue-event rewards and the bigger
  conversation rewards. The narrative log lines stay exactly as they were — the popup is a flourish, never
  the only record. `window.emberveil.rewardPopups = false` turns it off.

## Files
- `index.html`, `style.css` (dark-fantasy theme), `js/main.js` (screens + flows), `js/ui.js` (themed interface helpers), `js/game.js`, `js/rules.js`, `js/combat.js`, `js/effects.js` (the effect registry — see `EFFECTS.md`), `js/loot.js`, `js/stage.js` (3D stage from Party Quest + zone backdrops), `js/talk.js`, `js/sfx-bridge.js` (sound, wraps the stage from outside), `js/rng.js`.
- `data/`: everything the game reads; `data/class-looks.json` = the 30 class blueprints (also in `library/data/defaults.json` as `ev_<class>` and in the 2D presets); `data/enemy-looks.json` = the 80 enemy/boss/pet/companion/hire looks (also in the library as `enemy_<id>` / `companion_<id>`).
- `research/`: condensed notes from the original code (`rules-notes.md`, `world-notes.md`).
- `tests/`: `loot.test.js`, `rules-combat.test.js`, `game.test.js`, `looks.test.js`, `effects.test.js` (node), `emberveil.spec.js` (Playwright).
- `EFFECTS.md`: the effect audit — every id, what it does, where it lives, and what the original did or didn't do.
- Builders: `tools/build-emberveil-data.mjs`, `tools/build-emberveil-classes.mjs` (edit `LOOKS` there to change a class's look), `tools/build-emberveil-enemies.mjs` (edit `ENEMIES`/`BOSSES`/`PETS`/`COMPANIONS`/`HIRES` there to change a monster's look).

## Debug handle
`window.emberveil` → `game`, `stage`, `talk`, `library`, `lingo`, `DATA`, `LOOKS` (classes), `ELOOKS` (enemy looks), `enemyLook(e)`, `bodyOf(h)`, `companionLook(id)`, `fight(encounter, {node, boss})`, `afterCombat(node, enc, boss)`, `enterNode()`, `renderMeterTab()`, `renderPartyTab()`, `renderMap()`, `waitForChoice(list, opts)`, `showRewardsFor(spec)`, `rewardPopups` (set false to silence the rewards popup), `speakCount`.

## Stage framing and speech bubbles (round 18)

The fight camera used to be fixed (`position (0, 1.2, 6.2)`, fov 28), which was too close: a full party
of four against four enemies ran off both sides of the stage panel and the speech bubbles were cut off
by the top of the box.

`Stage.frame(mode)` in `js/stage.js` now works the camera out from the panel's real shape instead.
`FRAMES` says how much world each view has to show:

| mode | width (world units) | tallest head | headroom |
|---|---|---|---|
| `fight` | 7.8 | 2.4 | 25% of the frame |
| `camp` | 7.6 | 2.2 | 25% |
| `travel` | 9.0 | 2.4 | 22% |

The panel is short and wide, so the *width* usually decides how far back the camera sits; on a squarer
window the height does. Either way a quarter of the frame is left empty above the tallest head, which
is where the bubbles go. It runs again on every resize (a `ResizeObserver` on the stage container), and
`camp()`/`clearCamp()` switch modes on their own. Bodies also line up tighter when there are more of
them (`lineUp(count)`: 0.78 apart for four, 0.95 for one or two).

`placeBubble()` in `js/main.js` positions a bubble over `stage.headOf(id)` (the body's real height, not
a hard-coded 1.95), then **measures what the browser drew** and pulls the whole thing back inside the
stage box: it slides sideways near an edge, and if there is no room above the head — a very tall body,
or a short window — it flips underneath (`.bubble.below` in `style.css`). Nothing clips, ever.

## The party's vehicle on the stage (round 18)

The vehicle you bought is now a thing you can see. Models come from **`avatar-3d/js/vehicles.js`**
(see that README): hand cart, pack mule, covered wagon, ox cart, iron-plated war wagon, closed coach
and the dragon sled, each with real creature bodies in the shafts.

- `stage.setVehicle(gameId, { x, z, rot, scale, anim })` — `gameId` is a `VEHICLES` key from `js/game.js`;
  `none` means the party walks and nothing is drawn. The last id is kept on `stage.vehicleId`.
- `stage.parkVehicle(id)` — angled back and to the left, out of the way of a fight. Called from
  `enterNodeInner()`, `startWorld()` and after a rest, so it is there whenever the world stage is up.
- `stage.camp(members, { vehicle })` — the rig stands at the edge of the camp circle with the firelight
  on it; the draft animal comes with it. `restScene()` sets `stage.vehicleId` first so the camp still
  shows it even when `camp()` is reached through a wrapper that only passes `members` along.

Two supplies were added for the crossings below and sold by every merchant: **Rope** (18g) and
**Timber** (26g).

## Crossings — travel hazards (round 18)

A new node type, `crossing`, 1–2 per zone, spliced into the road by `tools/expand-emberveil-map.mjs`
(`addCrossings()`, run by `tools/build-emberveil-data.mjs`). Icon: `assets/data/icons/crossing.svg`
(stepping stones over water), registered in the shared manifest.

Entering one plays a **travel scene**: the party walks from one edge of the stage to the other across
the crossing's own scenery while the camera pans with them, riding the vehicle if they own one
(`stage.travelAcross({ vehicle, ms })`). Then something is in the way.

The table is `data/crossings.json` — eight hazards, each with its own ways past:

| id | what blocks the road | ways past |
|---|---|---|
| `cold_ford` | a river in spate | rope · STR wade · CON swim the deep channel · a day upstream |
| `scree_gate` | a pass still shedding stone | DEX dash · shore it with timber · wait a day |
| `fever_row` | a village full of sickness | spend bandages · INT work out what it is · CON push through |
| `broken_span` | a bridge with the middle gone | build with timber · DEX climb the gorge · detour a day |
| `toll_stone` | six bored people and a price | pay · talk them down (trait) · fight |
| `grey_fen` | causeway into fog | burn a torch · a light-bearing weapon · INT take a bearing |
| `windbite_ridge` | four exposed miles in a blizzard | tent · eat hard and push (CON) · wait a day |
| `wardens_gate` | a gate and a warden who walks out to meet you | a quest flag · 60 fame · bribe · bluff (trait) · force it |

Rules live in **`js/explore.js`**, kept free of DOM and 3D so `node --test` can drive them:

```js
resolveCrossing(game, crossing, choiceId, rng)
// → { ok, blocked, why, roll, best, bonus, dc, stat, text, rewards, costs, fight, days, memory, journal }
```

- **Checks** are the party's best living value for the stat + a d20 against `dc + 2 per act` (capped at
  26). A hero with the right speech trait adds the choice's `traitBonus`; `crossingChoices()` reports
  the odds so the buttons can show them.
- **Rewards** come back in the same shape `victory()` returns — `{ xp, gold, fame, drops }` (plus
  `levelUps`) — so the rewards popup shows a crossing exactly like a won fight. They scale with the act
  and with how hard the choice was; the hard ones can drop something rare.
- **Failure** costs blood, food, exhaustion or a day, and some choices drop you straight into a fight
  with whatever haunts the zone. The node stays on the map: a retry costs a day and a ration
  (`payRetry()`), or you walk away and come back better equipped.
- Every attempt is **remembered** (a `travel` memory, so it turns up in the Journal) and logged in
  `game.crossings`.
- The guarded gate puts a real NPC on the stage: `stage.walkIn(id, from, to)` walks the warden in from
  the right and they talk through the normal Lingo/bubble path.

Tests: `tests/crossings.test.js` (every choice of every crossing in every act, difficulty and reward
scaling, failure costs, blocked choices changing nothing, map placement) and `tests/crossings.spec.js`
(framing + bubbles + the vehicle at camp + a crossing played through in the page).

## Node labels never lie (round 18)

A "Goblin Pair" node fought three goblins. Cause: entering a combat node has a ~28% chance of promoting
the encounter to a **named leader with followers** (`namedEncounter()` prepends the leader to the
existing enemies), which makes the fight bigger while the map label stays as authored.

`js/game.js` now knows what a name promises — `countWordIn()` (lone/pair/trio/four…: an exact number),
`groupWordIn()` (band/patrol/swarm…: three or more) and `labelFits(name, n)`. A node whose name carries
an exact number word is never upgraded to a named or nemesis encounter, night raids that grow or shrink
with the vehicle rename themselves, and `encounterLabel(enc)` builds an honest name from the enemies
actually standing there ("Lone goblin", "Goblin pair", "Goblin trio", "Goblin band (5)", "Goblin Scout
and 2 Goblin Warriors", "Vraak the Patient and followers"). `enter()` returns that label alongside the
encounter. `tests/labels.test.js` audits every encounter and every map node with a number word in it,
and walks every node 25 times with different luck to prove the promise is kept.
