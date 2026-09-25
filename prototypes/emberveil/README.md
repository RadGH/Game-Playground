# Emberveil 2 (prototype 2) — the user's RPG rebuilt on the playground pieces

Source: `~/claude/emberveil/` (the production repo, treated as **read-only**; `~/claude/emberveil-storymode` is ignored on the user's
instruction). Open `http://<lan-ip>:8400/prototypes/emberveil/`.

## Chibi 2 preview

Emberveil now uses Chibi 2 humanoids and batched spell sprites by default. Use `?renderer=chibi1`
to compare against the original renderer. This only changes presentation: saves, combat rules and
creature bodies are unchanged. The stage accepts optional `characterFactory` and `effectsClass`
constructor options. The new parts catalog is broader but still approximates some existing gear.
See [Chibi 2 milestone](../../avatar-3d/CHIBI2.md) and `/avatar-3d/chibi2.html` for the controlled
eight-fighter comparison.

## What was rebuilt

| System | Original | Here |
|---|---|---|
| Data | `data/*.json` + hand-authored map modules | `tools/build-emberveil-data.mjs` copies the JSON and dumps the map/event ES modules to `data/*.json` (classes, 124 skills with talents + upgrades, build presets, 30 enemies + 12 bosses, 49 encounters, enemy spells, boss death lines, 13 zones with node graphs, 76 dialog events, 166 random events, 6 dungeons, companions/hires, balance) |
| Items | `src/game/items.js` etc. | `data/items.json` (35 weapon + 47 armour bases, 19 base affixes + 5 shield + 40 extended, 24 uniques with legendary effects, 24 sets, potions, salvage, prices, zone + boss drop tables) built from the research brief; `js/loot.js` generates, names, scores, prices, salvages, adds affixes, promotes rarity, rolls shops/boss loot/zone drops. Dead base keys in the original drop tables were fixed; the dormant 40 extended affixes and the never-called set drops are wired in. |
| Stats / progression | `formulas.js`, `xp.js`, `passives.js`, `skills.js` | `js/rules.js`: derived stats (HP/MP/hit/dodge/crit/initiative/spell power…), basic damage range, level 30 xp curve, 2 attribute points per level, talent points at 3/8/13/18/23/28, passive points every 5 levels, 5-node passive trees per class, talent (additive) + upgrade (replace) merging, hero creation from build presets with the class kit, equip rules (two-handers clear the off-hand, rings, off-hand-ok weapons), enemy scaling (global × act × party-size × NG+), champions |
| Combat | `simulator.js`, `CombatScreen.js` | `js/combat.js`: initiative each round (+d10, slow halves), stun/freeze/sleep/confused gates, hero AI (revive → heal thresholds → shield → best expected-damage skill → buff → attack), enemy AI (healer role, spell chance, taunt/taunting/companion-first targeting), pipeline hit → block → armour curve `a/(a+100)` → resistAll → dmgReduct → marked ×1.3 → barrier → HP, crits, DoTs, sunder/curse/silence, attack-speed extra actions, legendary effects (cheat death, crit bleed, dragon breath, echo cast…), flee check |
| World | `mapData.js`, node screens | `js/game.js`: zone graph walked one node at a time (round 20 — no fast travel), node memory (cleared fights, one-shot shrines/treasure/checks), dialog + random events with `requires`, skill checks (best attribute + d20), rewards (gold/xp/heal/damage/items/companions/flags), boss kills unlock the next zone + main quests, dungeons (stages, skill check stun/damage, reward), towns per act (merchant seeded stock, tavern hires named + walk-ins + companion kennel + bench, cleric rest, blacksmith salvage/affix, enchanter promote, trainer respec), defeat (wake in town, lose 15% gold), save/load |
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
| Hero pools grew and got role flavour: `combat_taunt` 33, `combat_bark` 48, `combat_kill` 26, `combat_hurt` 23, `ally_down` 20, `brag` 24, `relief` 20, `warning` 15 (round 19 added the weapon-aware barks — see below) | `lingo/data/grammar.json` |

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

The current write-up is **`research/sim-report-3.md`** (round 20); `research/sim-report-2.md` is the
round-19 pass and `research/sim-report.md` the round-14 one. `research/sim-round20.md` is the raw
report taken before this pass and `research/sim-latest.md` the one taken after — point `--report` at
`sim-latest.md` so none of the write-ups is overwritten.

The **round-20 pass** was a difficulty pass. Round 20 put a settlement (merchant + cleric who picks
the fallen back up) in every zone and took fast travel away, so a party can always walk back to a
healer: fights per run went from ~55 to ~88 and **38.3% of runs cleared all six acts** against the
10–15% the game is aimed at. The fix was `data/balance.json` alone — acts 2–6 rebuilt with enemy
damage climbing faster than enemy HP (the same lethality in a shorter fight: act 6 is 17.6 rounds
instead of a projected 19.6), the last five steps of the XP table stretched so the level cap is not
reached until act 6 (the party used to finish holding 173% of the XP the cap costs, so the last two
acts paid nothing), and the gold multiplier trimmed 1.1 → 1.0. That gives **12.8% full clears
averaged over five seeds of 300 runs (10.3–14.3%), act 1 at 86–88%**, and a funnel where each act
passes a smaller share of the survivors than the one before it (87 / 80 / 74 / 69 / 63 / 57%). Wipes
per 100 fights sit in a 3.4–5.6 band in every act, so no act is a wall; bosses fell from 32% of all
wipes to 20% as the load spread out over named leaders, road fights and night raids. Starting heroes,
boss/champion/named multipliers and the night-raid block were not touched.

The round-19 pass before it fixed the same drift from the other end: the party used to hit the level
cap in act 5 holding three times the XP the table asked for, so it outgrew every enemy multiplier.
Stretching the XP table, trimming the XP and gold multipliers, lifting acts 1/4/6, giving enemies a
per-act armour ramp and some magic resist, making bosses scale closer to the trash beside them and
handing spell lists to nine silent late-game enemies and three silent bosses brought it to 11.3%
full clears with act 1 at 91.3%.

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
- The original's real-time weapon layer (removed outright in round 20 — see `research/rules-notes.md`), achievements, codex, telemetry, cloud saves, NG+ UI (scaling constants are in `rules.js`), hardcore mode, infinite dungeon, guild hall/black market stock (formulas noted in `research/`), recruitable story heroes from dialog (`recruitHero` outcomes show text only), crafting recipes and fame cosmetic unlocks (both explained in `EFFECTS.md`), class unlock gating (all thirty classes are open; the original rule is shown on each card).

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
- `index.html`, `style.css` (dark-fantasy theme), `js/main.js` (screens + flows), `js/ui.js` (themed interface helpers), `js/game.js`, `js/rules.js`, `js/combat.js`, `js/ai.js` (every combat decision, heroes and enemies — knobs in `data/ai.json`, rules in `research/ai-rules.md`), `js/effects.js` (the effect registry — see `EFFECTS.md`), `js/loot.js`, `js/stage.js` (3D stage from Party Quest + zone backdrops), `js/bars.js` (health bar maths and snapshots), `js/talk.js`, `js/sfx-bridge.js` (sound, wraps the stage from outside), `js/rng.js`, `skillcheck.css` (the skill-check popup).
- `data/`: everything the game reads; `data/class-looks.json` = the 30 class blueprints (also in `library/data/defaults.json` as `ev_<class>` and in the 2D presets); `data/enemy-looks.json` = the 80 enemy/boss/pet/companion/hire looks (also in the library as `enemy_<id>` / `companion_<id>`).
- `research/`: condensed notes from the original code (`rules-notes.md`, `world-notes.md`).
- `tests/`: `loot.test.js`, `rules-combat.test.js`, `game.test.js`, `looks.test.js`, `effects.test.js`, `weapon-lines.test.js`, `bindings.test.js`, `narrator.test.js`, `revive-thanks.test.js` (node), `emberveil.spec.js`, `crossings.spec.js`, `journal-checks.spec.js` (Playwright).
- `EFFECTS.md`: the effect audit — every id, what it does, where it lives, and what the original did or didn't do.
- Builders: `tools/build-emberveil-data.mjs`, `tools/build-emberveil-classes.mjs` (edit `LOOKS` there to change a class's look), `tools/build-emberveil-enemies.mjs` (edit `ENEMIES`/`BOSSES`/`PETS`/`COMPANIONS`/`HIRES` there to change a monster's look).

## Debug handle
`window.emberveil` → `game`, `stage`, `talk`, `library`, `lingo`, `DATA`, `LOOKS` (classes), `ELOOKS` (enemy looks), `enemyLook(e)`, `bodyOf(h)`, `companionLook(id)`, `fight(encounter, {node, boss})`, `afterCombat(node, enc, boss)`, `enterNode()`, `renderMeterTab()`, `renderPartyTab()`, `renderMap()`, `waitForChoice(list, opts)`, `showRewardsFor(spec)`, `rewardPopups` (set false to silence the rewards **and** skill-check popups), `speakCount`, `sayScene(text)` (say something as the Narrator), `showCheck(result, opts)` (the d20 popup + the log line), `recordNamedKill(named, enc)` (write a name on the Named Foes board), `renderJournal()`, `isSceneText(text)`.

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

## Round 19: the Narrator, the board, and one wording for a roll

Six small things the player actually noticed, each fixed at the source rather than at the place it showed up.

### The Act 1 wind was deafening (E1)

Ambience was levelled like a one-off sound effect. An impact is over in 200 ms; a wind bed plays for a whole act,
and anything comfortable for two seconds is exhausting after ten minutes.

| Change | Where |
|---|---|
| Per-category loudness targets moved into a table that owns them — `CATEGORY_TARGETS`. Ambience dropped from −30 to **−40 LUFS**; every other category is unchanged. `data/catalog.json` carries the same numbers and a node test fails if the two ever disagree | `sfx/js/loudness.js`, `sfx/data/catalog.json`, `sfx/tools/build-catalog.py` |
| A **loop is never boosted** (`LOOP_MAX_BOOST_DB = 0`): measuring a quiet bed and multiplying it up only raises its hiss, which the player then hears for ten minutes. It may cut a long way (`LOOP_MAX_CUT_DB = −44`) so a loud bed really does come down to the target | `sfx/js/loudness.js` `optionsFor()`, `sfx/js/sfx.js` `load()` |
| The **ambience bus is capped** at 0.6 linear however hard the slider is dragged, and the slider's top end moves down to the cap so it never offers a level it cannot give | `sfx/js/sfx.js` `busCap()`, `prototypes/emberveil/js/sfx-bridge.js` |

All of it sits above the method layer, so synth, library, hybrid and retro get it identically.
Tests: `sfx/tests/sfx.test.js` (the target table, the loop caps, a quiet loop left quiet and a loud one brought down)
and `sfx/tests/sfx.spec.js` ("ambience is held down" — every bed on target through every method, and the bus gain
under the cap).

### "I'm out of bows!" (E6)

The ammunition bark was `I'm out of {$item.pl}!` — `$item` picks a random word out of the lexicon, so archers
shouted about bows and swordsmen about potions. Weapons are a real binding now: every line a character speaks
carries `weapon` (the item as an Entity), `weaponType` (bow / crossbow / thrown / sling / caster / blade / blunt /
polearm) and `ammo` (`arrows`, `bolts`, `javelins`, `throwing knives` — or nothing at all).

- `js/talk.js`: `WEAPON_KINDS`, `WEAPON_AMMO`, `weaponKind()`, `ammoFor()`, `gearBindings()`, folded into `ctx()`.
- `lingo/data/grammar.json`: the ammunition lines carry `cond: "ammo"`, so a sword, a staff or an empty hand is
  never offered one; "Nock and loose!" is `cond: "weaponType==='bow'"`, and crossbows, thrown weapons and a ranger
  caught with a blade got their own barks.
- Test: `tests/weapon-lines.test.js` runs **every weapon in `data/items.json`** past the pools.

### "The name goes on the board" — so there is a board (E10)

The Journal has a **Named Foes** section: one row per named enemy and nemesis the party has killed, with where,
which day, whether it was a nemesis and how many times it had beaten them, and **who landed the killing blow** —
read straight out of the damage meter's record for that fight, so the board and the meter can never disagree.
It lives on `game.namedBoard`, so it goes into the save with everything else.
`js/main.js`: `killingBlowOn()`, `recordNamedKill()`, the `Named Foes` block in `renderJournal()`.

### The Narrator (E13)

Scene text is not something a person says. The event data labels its scene-setting paragraphs `speaker: "hero"`
("A massive wolf is caught in a rusted trap, too exhausted to snarl") and a member of the party used to read them
out. `js/talk.js` now has:

- `isSceneText(text)` — a line with no first-person words outside its quotation marks is the scene talking. It gets
  102 of the 104 hero-labelled lines in `data/random-events.json` right.
- `talk.narrator()` / `talk.narrate(text)` — the Narrator, one object for the whole run, with its own voice
  (`shared/voices.js` role `narrator`: low, slow, almost no seed jitter).
- `js/main.js` `sayScene(text)` routes event lines, lore stones, beast openers, ambush and night-raid openers and a
  boss's closing narration through it. In the log it is italic with no portrait (`.say.narration` in `style.css`),
  and nothing draws a bubble over anybody's head.

### "{weapon?}" leaked into a line (E14)

Lingo writes `{name?}` when a template asks for a binding nobody supplied. `tests/bindings.test.js` now renders a
large sample of everything the game can say — every grammar pool with the bindings a spoken line really gets, every
memory type the game records with the exact bindings `game.js`/`effects.js` write, every conversation topic and
thread line with the full binding set, and 400 live camp conversations — and fails on a single brace. It found five
real holes, all fixed in the data: a body part in `recall_wounded` and a figure in `recall_lore`/`recall_lineage`
(now rolled the way `rally` rolls a foe), a foe in `recall_revive` and the weapon-naming shape of `recall_deed`
(now guarded by `cond`), and `{foe}`/`{place}` in two camp topics with no memory requirement.

### One skill check, one wording, one popup (E15, E28)

Every roll in the game — node tests, dialog choices, dungeon stages, crossings — reads the same:

```
CON 18 + d20 (rolled 2) = 20 vs 20: pass
```

`js/ui.js` `checkText()` / `checkHtml()` build it (with `STR 18 (+6)` when the rules convert the attribute into a
smaller bonus, and `+4 (the right words)` for a trait bonus). `js/main.js` `showCheck()` is the one path: a d20
tumbles in a popup for about 0.8 s, lands on the number, and the sum appears under a PASS/FAIL stamp — then exactly
one line goes in the log. A click, Enter, Space or Escape during the tumble skips to the result; the same keys then
close it. `skillCheckPopup(result, opts)` in `js/ui.js` is the reusable component (`skillcheck.css`), and passing
`{ enabled: false }` turns it off without losing the log line.

### The reward text was written twice (E16)

"a scholar's reading: +50 xp each and the next fight starts with a blessing — +50 xp, the next fight starts blessed".
The topic's own `text` spelled the reward out **and** `applyTopicReward()` generated it from the reward object. The
generated half is the one that is always right, so it is the only half that carries numbers now; every `text` in
`conversations/data/topics.json` and `conversations/data/threads.json` is flavour and nothing else.

### Saying thank you for a revive (with E3)

`game.revive()` writes `hero.revivedBy` and files a `revive` memory with a `by` binding. Three camp topics read it:
`revive_thanks` (the next day or two), `revive_thanks_awkward` (the same, for a hero too proud to say it straight)
and `revive_callback` (days later, unprompted). Getting the thanks to the right person needed two small options on
a conversation requirement, both in `conversations/js/conversations.js`: `bindingIs: { by: 'answerer' }` casts the
person named in the memory, and `minAgeHours` is the other half of `maxAgeHours` so the callback can wait.
Test: `tests/revive-thanks.test.js`.

### Tests added this round

`tests/weapon-lines.test.js`, `tests/bindings.test.js`, `tests/narrator.test.js`, `tests/revive-thanks.test.js`
(node) and `tests/journal-checks.spec.js` (the popup, the board and the Narrator in the page).

## Round 20: the road, the fallen, and who is actually collecting the toll

### The map is a road again

Every zone is now a layered road instead of a fan. `tools/expand-emberveil-map.mjs` gained
`normalizeZones()`, which rewires the trails (nothing is added or removed — only `exits`, `x` and `y`
change) so that:

- the entrance is alone in the first column and the boss alone in the last;
- **no more than four branches are ever open at once**, and no node offers more than three ways on;
- **every trail joins one column to the very next one** — there is no longer an edge that jumps from
  the first node most of the way to the boss, which is how the Ashen Wastes let a party skip half of
  act 2;
- every route from the entrance to the boss is the same number of moves, so the branches are real
  choices rather than one short cut and one long slog.

The prologue is left exactly as authored (a single lonely line already satisfies all of that).
`tests/zone-graph.test.js` checks all thirteen zones against those rules, plus the drawn length of
every trail on the map.

`dust_roads` before and after: 26 nodes, columns `1,7,5,5,4,2,2` with four backward edges and a
three-column shortcut → 27 nodes, columns `1,3,4,4,4,4,3,2,1`, every trail exactly one column long.

### Travel is one node at a time

`game.reachable()` used to return "every exit **plus every node you have already visited**", which
was a free teleport to anywhere behind you. It now returns exactly the neighbours of the node you are
standing on, **in both directions**: you can turn round and walk back, and doing so costs a move (and
therefore food and a share of the day) exactly like walking on. The map only accepts clicks on those
lit neighbours.

That made settlements a problem: only the Border Roads had a `town` node, so from act 2 on there was
nowhere to buy food or see a cleric without the teleport. `addTowns()` in the map tool now gives every
act zone its settlement (the names come from `TOWNS` in `js/game.js`), placed one move from the
entrance. The prologue keeps none — the Lonely Road has nobody on it.

### Revives — the rules, written down

A hero who is knocked out **stays down after the fight**. The four ways back up (all of them in the
`REVIVE` block at the top of `js/game.js`, and quoted to the player by `game.reviveHelp()` in the
Party tab and the camp tooltip):

| way | who | how much health |
|---|---|---|
| a living healer in the party — a class whose role heals, or anyone who knows a heal or revive skill — picks the fallen up after every fight **and** at camp | `victory()`, `rest()` | 50% |
| a revive item from a merchant: the Revival Flask (80g) or the **Emberheart Draught** (420g, new) | Bag tab | 25% / 70% |
| a shrine node on the map | `enter()` | full |
| a settlement cleric (free) | `clericRest()` | full |

Losing a fight is still not a dead end: `defeat()` wakes the whole party in the nearest settlement at
half health, minus 15% of the purse.

Every revive is written on the hero as `hero.revivedBy = { by, byName, how, source, day, where }` and
filed as a **`revive` memory** — a new Lingo event type with importance 0.95 and a 150-day half-life,
so it is never forgotten, with `recall_revive` lines in `lingo/data/grammar.json` and a `saved_life`
relationship swing in `lingo/data/relations.json`. That is what camp conversations read when somebody
thanks the person who pulled them off the ground. `game.revives` keeps the last 40 for the journal.

### Night on the road is dangerous now

`balance.json` `world.nightAttack` went from a 15% base (about 6% once a torch was lit in the
prologue) to **40%** — roughly a one-in-three chance of being woken up with a torch burning, rising
two points an act. A raid is deliberately worse than the same fight by daylight and pays for it, all
from `world.nightRaid`:

| knob | value | what it does |
|---|---|---|
| `extra` / `extraFromAct` | 1, from act 2 | an extra body on top of the vehicle's own modifier (the prologue and act 1 are left alone) |
| `hp` / `damage` | ×1.1 / ×1.05 | tougher raiders |
| `namedChance` | 0.35 | how often a named leader is at the head of it |
| `xp` / `gold` | ×1.25 / ×1.7 | what winning one is worth |
| `dropChance` | 0.5 | an extra roll on the zone drop table |

A war wagon still cancels most of it, a fast coach still makes it worse, and a torch still helps.

### Quests

- **Markers on the map.** `game.questMarkers()` lists every accepted job that names a place — the main
  story, a town-board bounty, a job taken from somebody on the road, or a hero's own errand — and the
  map draws a coloured pin over the node with the title in the hover card.
- **Strangers on the road.** A `dialog` node has a 22% chance of turning up somebody with paying work
  instead of the usual scene (`data/road-quests.json`, six offers gated by act). The job points at a
  real uncleared node in an open zone and pays `90 + 130 × act` times the offer's multiplier — better
  than the board, because you have to be out there to be offered one. Taking it files it as an
  ordinary side quest: it shows in the Quests tab, it gets a map pin, and `checkSideQuests()` pays it
  out when the node is cleared. At most two open at a time.
- **Two bounties per act.** `sq_throne_trial` fills the act-6 gap, and `sq_core_fortress` pointed at
  `shard_fortress`, which is not a node in the Cosmic Rift — it now points at `cosmic_bastion`.
  `tests/world-rules.test.js` checks both rules for every act.

### A toll is collected by somebody with hands

Refusing to pay the toll on the Dust Roads used to produce four cinder hounds, because the fight came
straight from the zone's encounter pool. `data/enemy-families.json` (ours — the build tool never
touches it) files every enemy as humanoid / beast / undead / construct / horror, lists the road bands
to fall back on when a zone's own pool has nobody suitable, and names the events whose fight has to be
against people. Then:

- a crossing can declare `enemyFamily: "humanoid"` (the Toll Stone and the Warden's Gate do) and
  `pickCrossingFight()` honours it;
- `game.combatFor()` turns the original data's `startCombat: true` — which used to resolve to no
  encounter at all, so the fight simply never happened — into a real encounter, humanoid for anything
  about a toll, a bandit, a robber or a warden.

Six new road bands cover acts 0–6 (`road_toll_band`, `veil_toll_watch`, `hell_toll_gate`,
`void_toll_choir`, `abyssal_toll_watch`, `dragon_toll_watch`).

### Interface

- **Skills tab hero switcher**: back arrow, a tab per hero, forward arrow, and a ⚙ button.
- **Item card**: pick the hero *first*. A row of hero tabs across the card, greyed out and struck
  through for anyone whose class cannot use the weapon, with the reason on hover. Everything below is
  about the hero you picked — the slot it would actually fill, what it would replace, and the
  damage / armour / offense / defense / utility / score deltas against *that* hero's gear. The weapon
  type and the list of classes that can use it are on the card, above the Equip button, so nobody has
  to press Equip to find out it will not work.
- **Per-hero settings** (⚙ next to Gear, on companions too): rename the hero or the pet, roll them a
  new voice, hear it. Names are saved with the game and flow into speech, memories and the journal —
  the cached Lingo speaker is dropped so the new name is used from the next line on.
- **"Move" is spelled out.** The road affixes now read "each map node you travel to" instead of "each
  move", which nobody could tell from a travel day or a combat turn.

### Gone: the original's real-time weapon layer

Removed outright — the balance knobs, the `m3Preview` block, and the four road events that handed one
out (their ids lost the `tap_` prefix and their rewards became real loot rolls,
`{ buildLoot, buildLootRarity }`). `tools/build-emberveil-data.mjs` strips it again on every rebuild,
and the same build step now keeps the blocks this rebuild added by hand (the `world` block in
`balance.json`), which a rebuild used to wipe.

### Balance

300 seeded runs, `node tools/sim-emberveil.mjs --runs 300`. The travel layer's own report is
`research/sim-round20.md`; the difficulty pass that followed it is `research/sim-report-3.md`.

| reading | round 19 | round 20: travel layer | round 20: after the difficulty pass | target |
|---|---|---|---|---|
| act 1 cleared | 91.3% | **84.7%** | 86.7% (86–88% over 5 seeds) | 85–90% |
| act 2 cleared (of those that got there) | — | 95.7% | 79.6% | pressure starts here |
| act 3 cleared (of those that got there) | — | 83.5% | 67.1% | |
| full clears (all six acts) | 11.3% | **38.3%** | **12.0%** (12.8% over 5 seeds) | 10–15% |
| fights per run | ~55 | 88 | 64 | |
| wipes per run | — | 2.1 | 2.8 (of 3 allowed) | |
| night raids that wiped the party | 4.2% | 4.2% (12.3% of all wipes) | 9.3% (17.3% of all wipes) | |
| XP held at act 6 vs the table | — | 173% | 121% | near 100% |
| rounds per act-6 fight | — | 15.7 | 17.6 | |

Act 1 landed where round 19 wanted it. **The full-clear rate did not**, and the cause was this round's
own doing rather than the night raids: a settlement in every zone (which travelling one node at a time
made necessary) keeps runs alive far longer, so fights per run went from about 55 to 88 and the party
got 60% more chances to level and loot.

The difficulty pass that followed put it back, through `balance.json` alone: acts 2–6 rebuilt with
enemy **damage climbing faster than enemy HP** (the same lethality in a shorter fight), the last five
steps of the XP table stretched so the level cap is not reached until act 6, and gold trimmed
1.1 → 1.0. Each act now passes a smaller share of the survivors than the one before it
(87 / 80 / 74 / 69 / 63 / 57% over five seeds) at 3.4–5.6 wipes per 100 fights in every act, so no act
is a wall, and bosses fell from 32% of all wipes to 20% as the load spread over named leaders, road
fights and night raids. Full working: `research/sim-report-3.md`.

### Tests added this round

`tests/zone-graph.test.js` (the shape of all thirteen maps) and `tests/world-rules.test.js`
(travel, revives, quests, humanoid fights, night raids, and that the real-time weapon layer is gone).

## Round 20: what the numbers say, what the stage shows, and one honest die roll

Eleven fixes from a play session, all in one place.

### Numbers on screen (E5, E7)

Every number the player reads now goes through **`shared/format.js`** — one module, re-exported from
`js/rules.js` as `fmt` / `fmtHp` / `fmtPct` / `fmtSign` so any file in the game can import it:

| Call | Gives |
|---|---|
| `fmt(25.02000000000001)` | `25.02` — at most two decimals, trailing zeros trimmed, thousands grouped |
| `fmtHp(14.68)` | `15` — health, mana and damage are always whole |
| `fmtPct(0.1234)` | `12%` |
| `fmtSign(9)` | `+9` (and a real minus sign for negatives) |

The decimals were not only a formatting problem. Affixes roll fractional values (`+2.37 HP regen`),
so health itself drifted off the integers and `dealt − hpBefore` produced `5.84999999964 overkill`.
Health is now kept whole at the source: `rules.derive` rounds `maxHp`/`maxMp`/`armor`/`magicResist`
and the attributes, `combat.healUnit` rounds before and after, per-turn regen rounds, and the new
`combat.gainMana()` does the same for mana.

Recover lines say what came back and why: **"Corvin recovers 15 health (on kill)"**, not
"Corvin recovers 14.68 (kill)". Mana and shields got the same treatment — `gainMana()` emits a `mana`
event so the log can say "Corvin recovers 8 mana (on kill)", and a barrier landing writes
"Corvin gains a 40 shield (Mirelle)".

`tests/format.test.js` proves it: it rolls every item base at every rarity, runs a seeded fight with
deliberately messy gear, and fails if any rendered string matches `/\d+\.\d{3,}/`. The Playwright
spec does the same over the real page after a real fight — log, party tab, meter, bag and every
tooltip.

### Skill checks are a roll again (E22)

`9 + 28 vs 15` is not a check. **One point of bonus per three attribute points** —
`rules.checkBonus(28) === 9` — and every check in the game reads it:

| Where | Function |
|---|---|
| Map nodes | `game.resolveSkillCheck` → `bestCheckBonus` |
| Dialog events | `game.choose` → `bestCheckBonus` |
| Crossings | `explore.choiceState` / `resolveCrossing` → `checkBonus` |
| Dungeon stages | `main.js` dungeon loop → `bestCheckBonus` |
| Fleeing a fight | `combat.fleeCheck` → `checkBonus` |

Each of those returns the raw attribute as `best` **and** the converted `statBonus`, so the round 19
check popup can show "STR 28 (+9) + d20 (rolled 6) = 15 vs 15: pass" — the sheet number the player
recognises and the number that actually rolled.

### Multi-shot skills fire what they say (E23)

"5 bolts instead of 3" fired three bolts. `combat.skillTargets` read `effect.targets` for a
`random3` skill and never looked at `bolts`. Now one function, `combat.shotCount(skill, fallback)`,
reads `bolts → targets → chainTargets/chainCount/glaiveCount → the shape's own default`, and every
multi-target shape (`random3/4`, `multi3/4`, `chain`, `adjacent`, `adjacent2`, `group2`) goes through
it. Two more habits in `skills.json` had to be reconciled: a talent usually says "adds one more"
while a level upgrade states the new total, so `effects.js` `countUp()` treats a value as a total
when it is bigger than the skill already does and as an addition when it is not — a talent can never
make a skill hit *fewer* things. `mergeSkill` seeds `effect.hits` so "adds one extra strike" has
something to add to, and `combat.hitCount()` is the single reader.

`tests/multishot.test.js` counts the shots that actually resolve, and walks **every** talent in
`skills.json` that changes a count: casting with it must land more shots than casting without.
(Talents on shapes that already sweep every enemy — one exists, `chain_lightning_spirit`'s Forked
Spirit on an `aoe: row` skill — are skipped: the shape, not the talent, decides there.)

### The familiar is real (E19)

`unlocksCompanion` was a tooltip. `effects.syncCompanions(game)` turns every bought talent that
grants a pet into a companion in the party — it is safe to call as often as you like, so `main.js`
calls it when a talent is learned and when a save is loaded. The pet uses the designed look in
`data/enemy-looks.json` (`pets.pet_familiar`…), so it stands on the stage and appears in the Party
tab like any kennel companion, and its owner is recorded on `companion.ownerId`.

### The stage (E9, E17, E18, E25, E30, E32)

| Item | What changed |
|---|---|
| E9 | `Stage.marchIn(side)` walks a whole side on from off screen before the first round; `fight()` awaits it, so a fight opens with something arriving (~1 s) |
| E25 | `Stage.syncBars(units)` floats a health bar over every fighter, read straight off the live unit objects each frame; `Stage.shieldOf()` adds a pale blue **shield segment** for barrier / temporary hit points |
| E32 | The party tab's hp bar draws the same segment (`bar(v, max, cls, tip, shield)` in `main.js`) and its tooltip says "… + 40 shield" |
| E30 | `Stage.contentBounds()` measures what is actually standing there, so `frame()` widens for six bodies (four heroes + two summoned pets) instead of pushing the last one off screen; `lineUp()` keeps tightening past four |
| E17 | The spider was built knee-down/foot-up with legs too short to reach the floor, so it sat in the dirt looking upside down. `SPIDER_LEG` in `avatar-3d/js/creatures.js` now puts the knee **above** the body and the shin straight down to y≈0, with a longer leg (`legLen` 0.55 → 0.62) and a proper foot |
| E18 | Held weapons were drawn 0.21 world units in front of the **chest** (an offset measured for the torso) while hanging off the **arm**, so every sword floated in mid-air beside the hand. `HELD_Z` in `avatar-3d/js/mii-gear.js` is 0.03 — just clear of the knuckles — and `mii.js` gained an `attack` animation so the weapon swings with the arm |

`avatar-3d/tests/geometry.spec.js` measures both in world space: the spider's feet on the floor with
its knees above its body, and every held weapon within arm's reach of the hand, pointing up, moving
when the arm swings.

### The victory dialog skips (E24)

Clicking the popup did nothing — only the small "skip ▸" label in the corner worked, because the
overlay's click handler ignored anything that was not the dark surround. A click **anywhere** now
skips straight to the finished result (chest open, counters at their final values, every item and
extra visible, Continue focused); a second click closes. Enter/Space do the same, Escape closes
outright. The hint under the button says so.

### Item sets (E29)

Four new sets on top of the 24 ported from the original, each built around a system this rebuild
added — and each with a `cond_*` property on a piece, so the world hooks fire:

| Set | Tier | Pieces | Power |
|---|---|---|---|
| Roadwarden's Vigil | low | 3 | `no_night_raids` — night ward and a standing watch |
| Forager's Covenant | low | 4 | `forage_feast` — rations off the field, an extra move, exhaustion eased |
| Grudgekeeper's Ledger | mid | 4 | `nemesis_hunter` — the meter's kill counts, bonus against named foes |
| Pilgrim's Choir | endgame | 5 | `echo_cast` — and the necklace carries `cond_extraSetPiece`, so it counts as six |

`tests/sets.test.js` checks every set in the game (real bases, real slots, thresholds turning on one
at a time, bonuses reaching `derive()`) and runs 20 000 kills per tier to prove the new ones drop.

### Combat lag: where it actually goes (E31)

Profiling a 4 v 6 fight with everything casting, the particles were **not** the main cost:

| | draw calls | triangles | live trail sprites |
|---|---|---|---|
| 4 heroes, 6 enemies, idle | ~545 | ~269 000 | 0 |
| the same, 12 casts a second | ~890 | ~283 000 | 37–55 |

The bodies dominate: ten Mii/creature bodies are hundreds of separate meshes, and the shadow pass
draws all of them a second time. What the effects *were* costing was allocation churn — a new
`SpriteMaterial` per trail particle, sixty a second per projectile, thrown away on death. Three fixes
in `avatar-3d/js/spellfx.js`:

- **Pooling.** Trail sprites come from a pool keyed by texture + blend mode (`_sprite({ pooled: true })`,
  `_freeSprite()`), so a long fight reuses a few dozen materials instead of creating thousands.
- **Caps.** `maxParticles` (320) and `maxLive` (48). Over the particle cap `budgetScale()` thins the
  streams to a half, then a quarter, then nothing; over the effect cap the oldest one-shot is retired
  early (its `onDone` still runs, so nothing awaiting it hangs).
- **Quality drop.** `Stage.setQuality('low')` turns off shadow mapping, pins the pixel ratio to 1 and
  tightens the particle budget — worth about 45% of the draw calls. `Stage.autoQuality()` switches to
  it on its own after ~1.5 s below 24 fps and climbs back when the frame rate recovers.

### How to capture a perf log

If a fight feels slow, there are two ways to see why.

**On the page.** Add `?perf=1` to the game's address (`…/prototypes/emberveil/?perf=1`) or press
**shift+P** at any time. A small readout appears in the corner of the stage:

```
fps 58  draw 612  tris 271004  [high]
fx sprites 41 (pool 88, x1)
effects 6  auras 9  dropped 0
bodies 10  float text 3  bubbles 1
```

`fps` is the frame rate, `draw`/`tris` how much the card is being asked to do, `fx sprites` the live
particles (with how many are waiting in the pool and the current budget multiplier), `dropped` the
effects retired early because the stage was full, and `[high]`/`[low]` the quality the stage picked
for itself. Copy that block into a bug report along with what was happening at the time. You can
force the quality with `?quality=low` or `?quality=high`.

**As numbers.** With the dev server running (`./serve.sh --bg`):

```
node tools/bench-emberveil-stage.mjs                    # 6 s, 8 casts a second
node tools/bench-emberveil-stage.mjs --ms 12000 --rate 14
node tools/bench-emberveil-stage.mjs --compare          # with the particle cap, then without
```

It drives `tests/bench-stage.html` (a 4 v 6 line-up casting, bursting, healing and wearing status
auras) in a real browser and prints average / p50 / p95 / worst frame times, the share of frames that
missed 60fps, and the sprite, effect and draw-call counts. Run it before and after a change to see
what the change cost. The same page opens by hand — `…/prototypes/emberveil/tests/bench-stage.html?perf=1`
— if you would rather watch it.

### Tests added this round

`tests/format.test.js`, `tests/multishot.test.js`, `tests/sets.test.js`, `tests/skillcheck.test.js`,
`tests/companions.test.js` (node) and `tests/round20.spec.js` + `avatar-3d/tests/geometry.spec.js`
(Playwright).

## Round 21: combat speed, a log that holds still, town screens, the bench

### Combat speed: 1x, 2x, 4x (E34)

Three buttons in the top bar, between the vehicle and Save. **4x is the original pace and the
default**; 2x takes twice as long and 1x four times as long, so a fight can be followed turn by turn.
The choice is kept in this browser (`playground:emberveil:ui:v1` → `combatSpeed`), shared by every
run, and a change in the middle of a fight applies from the next thing that happens.

One factor paces everything (`js/pace.js`), instead of a patch per number:

| What | How it slows |
|---|---|
| Body animation, the enemies' walk-in, the attack thrust, hit shake, projectiles, impacts, auras | `stage.setTimeScale(s)` multiplies every frame's `dt` in the stage ticker, so anything on frame time slows by the same amount |
| The attack pose timer, the rune flash before a shot, waits after a hit / skill / boss phase, floating damage numbers | `paceMs(base, speed)` over the base numbers in `PACE` (the numbers the game used before) |
| Pause between rounds, and after misses, heals, mana, damage over time, statuses, downs, kills | `extraGap(ms, speed)`: 0 at 4x, `ms` at 2x, 3× at 1x — slower speeds get beats that did not exist, 4x stays identical |
| Float-up animation, stage health bars, party tab bars | the CSS variable `--pace` (1 / 2 / 4) set on the root while a fight runs |

Outside a fight the time scale is always 1, so camp, travel scenes and crossings are unaffected.
Spoken lines keep following the Text speed setting in the menu.

### The log holds its place (E35)

New lines only pull the log down when you are already at the bottom (within 8 px). Scroll up and it
stays exactly where you left it while lines keep arriving; a **"N new lines ↓"** button appears, and
clicking it (or scrolling back down yourself) follows again. `js/scroll.js` (`StickyScroll`) measures
just before each line is added, so a scroll that lands a moment earlier is never overridden. The
journal and the other tabs never auto-scrolled; camp talk goes through the same log, so it gets the rule.

### Themed scrollbars (E36)

At the end of `style.css`: 6 px rounded bars, a dark leather track (`--scroll-track #231a14`) with a
gold edge, a gold thumb that brightens on hover and when held, the same height for horizontal bars,
and a matching corner. Firefox gets `scrollbar-width: thin` + `scrollbar-color`, fenced behind
`@supports not selector(::-webkit-scrollbar)` because Chrome 121+ would otherwise drop the rounded look.

### Town screens in their own panel (E37)

Merchant, Tavern, Blacksmith and Enchanter open in a panel that covers the log (`#town-panel`) with
its own scroll, so scrolling the shop can never run into old log lines. **← Back to the log** closes
it; so do leaving town, the Cleric (its result is written in the log), a fight and loading a game.
The log keeps receiving lines underneath. Each service redraws only the town buttons now, not the
town heading, so the log no longer repeats "Emberglen" every time you open a shop.

### The bench and Manage Party (E38)

A fifth hire waits on the bench. **Manage party** is a town button (so changing the party means going
back to a settlement). The dialog shows the active party and the bench with portrait, name, class,
level and health, and moves people between them. Rules (`js/bench.js`, used through `game.benchHero`
/ `game.joinParty`):

- only in a settlement; the party size limit is `data/balance.json` → `partySize.max` (4);
- a full party takes a bench hero by swapping somebody out, into the same place in the line-up;
- the party never drops to nobody, and never to only the fallen while somebody could still stand;
- gear stays on whoever wears it; **Take their gear** moves a benched hero's kit into the bag;
- a pet summoned by a hero's talent goes to the bench with them (`game.benchCompanions`) and comes
  back with them; bought companions stay with the party.

Every change saves the game, restages the party and redraws the side tabs.

### "We should take a rest, Corvin is wounded." (E39)

Arriving at a settlement with anyone under 60% health, or down, one healthy member says so — a
healer if one is standing, otherwise the healthiest. The line goes through Lingo (`wounded_rest`,
phrases in `data/town-talk.json`, registered by `registerTownTalk()`), so it gets that hero's voice and
personality, with separate wording for one or several wounded, one or several fallen (pointing at the
cleric), both at once, and a party where nobody is healthy. It is said once per arrival: opening shops
and coming back to the town buttons does not repeat it. `woundedReport()` / `woundedLine()` in `js/talk.js`.

### Tests added this round

`tests/pace.test.js`, `tests/scroll-lock.test.js`, `tests/bench.test.js`, `tests/wounded.test.js`
(node; the wounded test checks every situation over 25 seeds for braces, names and verb agreement)
and `tests/round21.spec.js` (Playwright).

## Round 22: the merchant tells the truth, one rarity colour, a working smith and enchanter, a set for every class

### The merchant stayed out of date (E43)

**Cause, plainly:** the merchant screen was drawn once, when you clicked Merchant, and only its own
Buy/Sell buttons redrew it. Equipping happens in the item card, which redrew the side tabs and closed —
nobody told the open merchant screen, so it kept the rows it was drawn with, and a card opened from
one of those old rows read old state. Clicking Merchant again drew everything fresh, which is why
that "fixed" it. A second bug sat next to it: pressing Equip on an item still on the merchant's
table said "Corvin equips …" without buying or equipping anything.

**Fix, at the source:** `openTownPanel(title, …nodes, redraw)` keeps the open screen's redraw and
`renderSide()` calls it, so a buy, an equip, a sale or an upgrade anywhere redraws the merchant,
blacksmith or enchanter screen too. Rows and cards find items where they really are each time
(`whereIs(it)` → worn by a hero / in the bag / on the merchant's table / gone; `findItem(id)`), the
item card shows that state, **Buy & equip** pays first when the item is still for sale, **Move to X**
takes it off another hero, and equipping restages the party so a new held weapon shows on the stage.

### The page scrollbar (E45)

`.world-layout` was `height: calc(100vh - 92px)`, but the chrome around it is 105px (44px top bar,
16px screen padding top and bottom, 29px breadcrumb): the page was always 13px taller than the
window. Now, above 1000px wide, the body is exactly one window tall and each box is a flex child that
takes what is left (end of `style.css`); the log, shop, tabs and map keep their own scrollbars. Checked
at 1280×720, 1366×768 and 1920×1080 on the world screen, in town with a panel open and mid-fight. Under
1000px the layout stacks into one column and scrolls on purpose (never sideways).

### Compare cards on every item (E46)

Hover any item — bag, merchant (for sale and sell lists), blacksmith, enchanter, the party tab's gear
slots, loot names in the log, and the cards in the loot popup — and the card shows the item next to
what the **selected hero** wears in that slot: both rings for a ring, main and off hand for a
one-hander that fits there. A table marks every stat better (green) or worse (red), with the score;
it says whether that hero's class can use it; and a set piece shows its set block (below). Switching
the hero (Skills tab, Party tab, item card tabs) changes every card.

One comparison serves both the hover card and the item dialog: `compareItem(it, hero, { loot, canUse,
slotFor })` in `js/ui.js` (E4's rows moved there), rendered by `compareTipHtml()` for the tooltip and
by `itemDialog()` for the card. The tooltip is the shared engine's `data-tip-render="item"` with
`data-item-id`, so it is built when you hover and never shows a stale item. The loot popup
(`shared/rewards.js`) takes an optional `tipRender` / `itemId` per card for this. There is no stash in
this game, so there was no stash screen to add it to.

### Blacksmith and enchanter (E47)

In the original the blacksmith salvaged and crafted from materials and the enchanter added a property
(three steps: item, property, material tier) or raised rarity. Here both are gold services with a
preview; the numbers are in `data/balance.json` → `services`; the rules are in `js/loot.js`.

| Service | What it does | Cost | Limit |
|---|---|---|---|
| Blacksmith · upgrade | quality one step (low → medium → high → elite → exotic); damage, armour, block power, barrier and an orb's spell power are recomputed from the base × `qualityMult` | `upgradeGold[to]` × `rarityCostMult[rarity]` (30/70/160/360 × 1/1.5/2.5/4) | `maxQualityByAct`: high in acts 1–2, elite in 3–4, exotic in 5–6 |
| Blacksmith · salvage | breaks a bag item into materials (unchanged) | free | bag items only |
| Enchanter · add property | one property from the item's affix pool into a free slot (no stat twice) | `addGold` × (1 + `addPerAffix` × slots used) × rarity | slots: normal 0, magic 2, rare 4, legendary 6 |
| Enchanter · reroll | one property becomes a different one | `rerollGold` × `rerollGrowth`^(times this item was rerolled) × rarity | `maxRerolls` (10) per item; a unique's or set piece's fixed powers and the base item's own block/barrier cannot be rerolled |
| Enchanter · raise rarity | normal → magic → rare → legendary, more slots | `promoteGold` (90/260/700) + 1 rare dust (to rare) or 1 legendary core (to legendary) | uniques and set pieces are already at the top |

Every quote (`upgradeQuote`, `addQuote`, `rerollQuote`, `promoteQuote`) returns the cost, the item as
it will be (`preview`) or why it cannot be done; the apply re-quotes, spends and changes the item **in
place**, so the bag, the party tab, the stage and every card show the new one. Add and reroll roll from
a seed made of the item id and how often it was worked on (`enchantRng`), so the preview is exactly the
result and reopening the screen cannot fish for a better roll. Generated names follow the work
("Sharp Longsword" → "Sharp Longsword of Vitality"); uniques, set pieces and named items keep theirs.
The screens: pick an item from the list (the bag, then what the party wears) → the preview shows
before → after (damage, armour, quality, rarity, name, score, sell price) → confirm. Each action is
written in the log, refreshes the wearer's stats and saves the game.

### One rarity colour (E48)

**Cause, plainly:** there were two rules for "what colour is this item". The loot popup and every gem
icon asked "is it a set piece?" first and used the teal set colour; the bag, merchant, tooltips, item
card and log coloured the name by `it.rarity` — and a set piece's rarity is `legendary`, so its name
came out orange next to a teal gem. Uniques had the same split (gold gem in the bag, orange gem in the
popup, orange name, red-orange in the popup). On top of that the set colour in `style.css` was green
(`#45d07a`) while the set gem is teal.

**Fix:** one table, `data/items.json` → `rarityColors` + `rarityGems`, applied to the page at start
(`setRarityTable()` in `js/ui.js` writes `--normal … --set`; `style.css` holds the same values as
fallbacks). One key per item: `set` if it has a set, else `unique`, else its rarity — the same
`rarityClass()` the loot popup uses. Every name goes through `itemNameHtml(it)` and every gem through
`gemHtml(it)`. A set piece shows the teal set colour for its name, with "set piece · legendary" as its
label.

| key | colour | gem |
|---|---|---|
| normal | `#c9c2b6` grey | common |
| magic | `#7f95ff` blue | rare (blue) |
| rare | `#e8d020` yellow | unique (gold) |
| legendary | `#ff8020` orange | legendary |
| unique | `#ff5a3c` red-orange | legendary |
| set | `#2fc4b2` teal | set (teal) |

### A set for every class (E49)

54 sets now (28 before). 26 new class sets, built by `tools/build-emberveil-sets.py` (safe to run more
than once; it replaces the sets marked `classSet` and keeps the rest), plus the four ported sets that
already fitted a class tagged with it (Paladin's Oath, Cleric's Vigil, Apprentice's Initiation, Shadow
Adept). Every set has `classes`; every weapon piece is one its class can use; every class-set piece has
its own name ("Longwatch Hood").

| Class | Set | Tier | Pieces | Full-set power (+ earlier power) |
|---|---|---|---|---|
| Warrior | Bloodforged Vanguard | mid | 4 | rally_on_kill |
| Fighter | Drillmaster's Discipline | low | 3 | speed_combat_init |
| Ranger | Longwatch Stalker | mid | 4 | critical_armorpen |
| Bard | Tavern Choir | low | 2 | rally_on_kill |
| Necromancer | Gravewright's Shroud | mid | 5 | curse_spreads (4: kill_party_heal) |
| Warlock | Pactbinder's Regalia | mid | 3 | low_mana_shockwave |
| Demon Hunter | Hellwarden's Mark | mid | 4 | strip_modifier |
| Scavenger | Ragpicker's Fortune | low | 3 | road_cache |
| Swashbuckler | Corsair's Flourish | low | 3 | crit_bleed_5 |
| Dragon Knight | Wyrmsworn Panoply | endgame | 6 | dragon_fury_breath (4: burn_extend) |
| Pyromancer | Cinderheart Vestments | mid | 4 | burn_extend |
| Stormcaller | Tempest Crown | endgame | 5 | echo_cast (4: mage_missile_aoe) |
| Druid | Grovekeeper's Bark | mid | 3 | camp_mend |
| Oracle | Seer's Veiled Sight | low | 4 | cheat_death_once |
| Tactician | Marshal's Campaign | mid | 5 | rally_on_kill (4: speed_combat_init) |
| Chronomancer | Hourglass Reliquary | endgame | 4 | echo_cast |
| Monk | Stillwater Wraps | low | 3 | speed_combat_init |
| Shaman | Spiritcaller's Totems | mid | 4 | kill_party_heal |
| Witch Hunter | Inquisitor's Brand | mid | 3 | strip_modifier |
| Knight | Oathbound Bulwark | endgame | 6 | cheat_death_once (4: kill_party_heal) |
| Sorcerer | Wildblood Mantle | low | 2 | low_mana_shockwave |
| Runesmith | Anvilsong Runes | mid | 5 | critical_armorpen (4: rally_on_kill) |
| Shadow Dancer | Duskveil Silks | mid | 4 | crit_bleed_5 |
| Tinker | Cogwright's Harness | low | 4 | companion_might |
| Priest | Lightbearer's Cassock | endgame | 5 | cheat_death_once (4: kill_party_heal) |
| Enchanter | Mesmer's Silkwork | low | 3 | mana_on_attack |

**Bonuses that actually work.** Thresholds are 2/3/4/6 pieces (a 5-piece set tops out at 5). A set
bonus reaches the hero through `loot.equipmentBonuses()` → `rules.derive()`, which handles plain stats
and only those `cond_*` / barrier keys that have a `derive` hook in `js/effects.js` (barrier,
barrierRegen, cond_dotDmgReduce, cond_thornsFlat, cond_skillMpCostReduce). Combat hooks such as
`cond_hpOnKill` are only read from item properties, so the new sets put those on a piece's fixed
properties instead. A mid-set power is `thresholdPowers: { "4": "<legendary id>" }`, switched on by
`loot.legendaryEffects()`; the full-set power is `legendaryEffect` as before. `tests/sets.test.js`
checks all of that for every class set.

**They drop now.** The per-drop set chance was 0.025, but it is only rolled after a kill already
dropped something (`loot.zoneDrop`), so it was about 0.4% per kill: in 100 simulated runs, 0.18 set
pieces in the whole of act 1. `data/balance.json` → `loot.setChance` is now **0.18** of zone drops.
`loot.classSetShare` (0.6) of set drops come from the sets made for a class in the party, from this
act's tier or an easier one (`loot.partyClasses`, set by `startWorld()`); the rest are any set of the
act's tier (low: acts 1–2, mid: 3–4, endgame: 5–6). Set pieces per run, per act (kills per act from
the simulator, rolled 400 times in `tests/sets.test.js`): **act 1 ≈ 1.9, act 2 ≈ 1.6, act 3 ≈ 2.6,
act 4 ≈ 2.3, act 5 ≈ 2.5, act 6 ≈ 2.2.**

**Where you see them.** Loot lines say "(set piece — Longwatch Stalker, 4 pieces)"; item rows show
"◆ Longwatch Stalker 1/4" (pieces the selected hero wears); every card has the set block — pieces
(ticked when worn), each threshold with its bonus and power, lit when on and marked "with this" when
this item would switch it on; the Party tab has a chip per worn set with the same block on hover.

### Tests added this round

Node: `tests/services.test.js` (every service: preview = result, gold, caps, fixed powers, names),
`tests/rarity.test.js` (items.json, style.css, ui.js and the loot popup agree; set colour matches the
set gem; one key per item; compareItem rows, rings and set progress) and new cases in
`tests/sets.test.js` (a set per class and wearable, thresholds and working bonuses, threshold powers
in derive, class-weighted drops, drops per act). Playwright: `tests/round22.spec.js` (E43 buy + equip
+ reopen + Buy & equip + sell; E45 page height at three sizes in world / town / fight; E46 compare
cards in bag, loot popup, merchant and blacksmith, both rings, set block, class use, hero switch; E47
blacksmith upgrade + enchanter add / reroll / raise rarity with exact costs and previews; E48 the same
colour and gem for a set piece, a unique and a rare in bag, tooltip, card, log, shop, loot popup and
party tab).

## Round 22: the party fights like it means it (E42), and the health bars stop running ahead (E44)

### Combat AI (E42)

The user: a cleric left a dying ally alone and swung a mace. The old picker was a short chain of ifs
with two dice rolls in it (80% "use the best damage skill", 50% "use any skill"), a random target for
every hero swing, and random spells for enemies. The original game had far more rules — every one of
them, with its source line and where it lives now, is in **`research/ai-rules.md`**.

Every decision now goes through **`js/ai.js`**, with its knobs in **`data/ai.json`**. Each option a
unit has (every usable skill at every sensible target, and a basic attack at every foe) is scored in
health points, and the highest score wins:

- **Damage** is what would really land: the game's own skill formula, hit chance, armour or magic
  resist, block, the 1 / 0.8 / 0.6 spread across targets, execute and "vs undead" bonuses, skill hooks —
  capped at what the target has left, so overkill is thrown away.
- **Finishing** a target is worth its output for `focus.killRounds` rounds; healers, casters, a
  channelling enemy, champions and named enemies are worth more; a boss is worth less while its adds
  stand; a sleeping enemy is left alone while anything else is awake; a hit that would interrupt a
  channelled spell gets a bonus.
- **Healing** only counts what lands. Healers heal under `heal.threshold` (65%), anyone with a heal
  under `heal.emergency` (35%), nobody at `heal.never` (85%) or above. Lower health is more urgent;
  tanks and healers are worth protecting more, companions less; the heal that fits the missing amount
  wins; a heal that would mostly overheal is skipped; a party heal gets a bonus once three allies are
  under 60%. Revives come first, weighted by who is down. Cleanses are priced by what the statuses cost.
- **Healers keep mana** for their cheapest heal and never spend below it on anything else.
- **Area skills** that cost mana must reach at least two enemies and beat the best single-target
  option by 10%; the group or row that scores highest is the one aimed at.
- **Tanks taunt** when a healer, caster or hurt ally was attacked last round.
- **Buffs** are priced by the damage they add or prevent over three rounds, worth more in the first two
  rounds and against bosses, champions and named enemies, worth little when the fight is nearly won,
  and never recast while they run. Shields are worth more while an enemy channels.
- **Statuses** are priced by the share of the target's output they take away, so crowd control goes to
  the biggest threat; nothing is reapplied to a target that already has it.
- **Enemies** roll their spell chance as before, but then pick the spell and target worth most, and
  swing instead of casting a spell that would do nothing. Their basic attacks keep the original
  formation (taunts, then companions, then the front of the party); `enemy.focusAttacks` turns on
  scored targeting for them too.

Every decision carries a short reason. It is written onto the event (`ev.why`, `ev.whyRule`), kept in
`combat.decisions`, and shown in the log after the skill name — "Mirelle uses Heal — heals Corvin (32%
health)." Add `?aiwhy=1` to the address (or set `localStorage['ev2.aiwhy'] = '1'`) to see the reason
behind every basic attack as well.

`decideHero(C, unit)` / `decideEnemy(C, unit, { spells })` are pure: they read the fight and return a
plan (`{ kind, skill, target, ally, value, rule, reason, skipped }`); `combat.js` carries it out
(`cast(caster, skill, foes, allies, plan)` and `resolveSpell(..., plan)` aim where the plan says).
Skill hooks that roll dice are read at their average through a copy of the fight whose dice always
land on 0.5, so asking for a decision never changes how a fight turns out.

### Health bars (E44)

**The cause.** `Combat.round()` works out a whole round in one go, and `main.js` then spends a few
seconds replaying its events: walking, swinging, projectiles, floating numbers. The floating bars read
the live unit every frame, and the live unit was already at the *end* of the round. So an enemy that
was going to die at the end of the round showed an empty bar while the two or three hits before its
death were still being played. Nothing was actually protecting it — the bar was just ahead of the
animation. Every health multiplier (act, party size, boss, champion, named, night raid, NG+) scales
health and max health together, so that was not it.

**The fix.** Every combat event now carries a snapshot of the bars it touches (`ev.snap` =
`{ unitId: { hp, maxHp, shield } }`, taken the moment the event happens); a new `sync` event carries
every unit after each turn and after the start-of-round ticks, for health that moves without an event
of its own (hero regeneration, temporary health). `main.js` hands each snapshot to
`stage.showSnap()` as it shows the event — a damage number's snapshot only when its projectile lands —
and `stage.updateBars()` draws that instead of the live number. The bar maths live in **`js/bars.js`**
(no three.js, so node tests use it).

Smaller things fixed along the way:
- A shield on a full-health unit was clipped to nothing on the floating bar; it now slides back over the
  end of the health fill. Health above max (a battle cry's temporary health) shows as shield instead of
  hiding behind a full bar.
- The Party tab's health bar also read the live unit mid-replay; it now shows the stage's snapshot
  during a fight. Its shield segment never showed at all (`.bar i` is a block, so the segment sat on a
  second line inside an 8px bar); it is positioned over the bar now.
- A living unit's bar keeps a 2px sliver, so 1 health out of 1520 never looks empty.
- The bar slides over a fixed 0.15s instead of 0.18s × the combat-speed factor (up to 0.72s at 1x,
  long enough to still be moving when the next hit landed).
- **Soul Link never shared anything:** the status writes `share: 0.5` as a number, and `statusSum()` only
  adds hook functions, so the share was always 0. `applyDamage()` now reads the number. Nothing in the
  current data applies Soul Link, so balance is unaffected.

### Simulator before and after

Old AI (`js/combat.js` as committed) and new AI on **the same current tree** — same data, including
round 22's `loot.setChance` 0.18 and the 26 class sets — 100 runs per seed, run side by side:

| | old AI, seed 1 | new AI, seed 1 | old AI, seed 2 | new AI, seed 2 |
|---|---|---|---|---|
| act 1 cleared | 88% | **98%** | 86% | **98%** |
| act 2 cleared | 71% | **94%** | 71% | **90%** |
| act 3 cleared | 53% | **75%** | 56% | **70%** |
| act 4 cleared | 39% | **53%** | 47% | **54%** |
| act 5 cleared | 22% | **36%** | 31% | **44%** |
| full clears (all six acts) | 12% | **19%** | 18% | **29%** |
| party wipes per run | 2.8 | 2.6 | 2.5 | 2.3 |
| night raids that wiped the party | 7.6% | 4.9% | 6.8% | 3.7% |
| rounds per fight | 11.8 | 11.4 | 12.0 | 10.9 |

The better AI makes the party clearly stronger: full clears roughly 1.6× (19% and 29% against a
10–15% target) and act 1 at 98% against an 85–90% target. **balance.json was not retuned in this
task** — that is the next balance pass. Note the old-AI numbers on seed 2 already sit above the target
with the round 22 set drops, before the AI change. The simulator is also slower with the new AI
(~160s against ~80s for 100 runs): every option is scored every turn. Passing `snapshots: false` in
the Combat context skips the health-bar snapshots, which is about a quarter of the extra time.

Two bugs found while testing this round, both in code added for E42/E44 and fixed before the numbers
above: hit memory (`_lastHit` / `_lastTarget`) made a hero and an enemy point at each other, so
`Game.save()` hit a circle and the save silently failed (the fields are now hidden from JSON); and a
trailing comment had swallowed `round()`'s end-of-fight check after the start-of-round ticks, so a
party wiped by poison would have sat through empty rounds to the 50-round timeout.

### Tests added this round (E42, E44)

`tests/ai.test.js` (18 tests): data/ai.json matches the fallback; a cleric heals a 25% ally instead of
attacking, with the reason on the event; the lowest ally first and a tank before a companion; a party
heal with three allies under 60% (a single heal with one); no heal on a full or 90% party; an area skill
on four clumped enemies but not on one; no mana spent finishing a dying lone enemy; finishing, focusing
an enemy healer, interrupting a channelled spell; leaving a sleeping enemy alone; a tank taunting when
the healer is attacked (and the enemy then attacking the tank); a healer keeping heal mana; revive
first; cleanse the stunned ally; a party buff early and not recast; enemies not recasting a curse,
healing only the hurt, respecting a taunt, silencing the caster; a real fight where every hero skill
has a reason. `tests/hp-bars.test.js` (5 tests): the bar maths; an enemy scaled through every
multiplier starts on an exactly full bar; every damage path (attack, skill, damage over time, thorns,
chain, Soul Link, barrier, heal, regeneration, enemy spell, kill, temporary health) moves the bar by
exactly the number the event reports at the moment it reports it; replaying real rounds shows the start
of the round before the replay and the true end after it. `tests/effects.test.js`: the
`legendary:critical_armorpen` probe casts four times instead of three — heroes no longer swing at a
random target, so the probe's own casts have to land on an armour-stripped enemy.
