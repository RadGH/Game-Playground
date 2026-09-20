# Building a game from this playground — guide for Claude (and humans)

Every experiment here is standalone. A game can take one piece or all of them. This page says what each piece gives you, how to import it, what data it expects, and what it costs at runtime. Read the experiment's own README for details; this is the map.

## 0. Ground rules
- Everything is plain ES modules, no build step. Serve the game from a folder that also contains (or symlinks) the pieces you use, and keep relative imports; or copy the folder(s) you need into the game.
- Third-party code and licenses: `vendor/README.md`. **Commercial-safe by default**: our own code (MIT-style), Three.js (MIT), vits-web (MIT), CMUdict (BSD), Quaternius assets (CC0). **Not commercial-safe**: espeak/meSpeak (GPL-3) unless the game is GPL-compatible. Do not ship the espeak engine in a closed-source commercial game; use the formant engine or babble.
- The shared character JSON (`shared/character-schema.md`) ties pieces together: `{ schema, name, avatar, voice, speech }` (+ optional `entry`, `race`, `pronouns`). Every section is optional.
- Tests: `npm test` (Playwright) and `npm run test:unit` (Node). Copy the relevant spec when you copy a piece.

## 1. Pieces and what they give you

| Piece | Import | Gives you | Data it needs | Runtime cost |
|---|---|---|---|---|
| **Voice** (`voice-lab/js/voice.js`) | `say, synthesize, play, stopAll, DEFAULT_VOICE` | Character voices from the `voice` JSON: engines `formant` (ours, default), `babble` (gibberish), `espeak` (GPL), `piper` (neural, online first use), `webspeech` (OS voices); effects chain; caching | `voice-lab/data/cmudict/` (3.3 MB, formant), `vendor/mespeak` (espeak), `vendor/vits-web` + `vendor/onnxruntime-web` (piper) | formant/babble: 10–80 ms per line, hundreds at once. espeak ~300 ms. piper: seconds per line, pre-render only |
| **Lingo** (`lingo/js/lingo.js`) | `Lingo, Speaker, Entity, parseTemplate` | Dialogue lines by intent from templates + a game dictionary; personality (traits, sliders, catchphrases, tics); pronunciation text for the voice | `lingo/data/{lexicon,grammar,traits}.json` (+ your own entries) | microseconds per line |
| **Memories** (`lingo/js/memory.js`) | `MemoryBank, generateEvent, memoryBindings` | Per-character memories with trait-weighted importance, half-life decay, merging, relevance-based recall; lines about them | `lingo/data/events.json` | trivial |
| **Scenes** (`lingo/js/context.js`) | `Scene, scenePools` | Surroundings-aware lines (dark, damp, threats, comfort) and planner bias | `lingo/data/scenes.json` as examples | trivial |
| **Relationships** (`lingo/js/relations.js`) | `RelationGraph, Relationship` | Multi-factor feelings (warmth, respect, trust, appreciation, fear, attraction, familiarity, knowledge), events scaled by traits, memory hook, tone tags | `lingo/data/relations.json` | trivial |
| **Names** (`namegen/js/namegen.js`) | `NameGen` | People/faction/place/artifact/motto names per race with meanings, forms and pronunciations; Lingo lexicon export | `namegen/data/{languages,concepts,patterns}.json` | trivial |
| **Items** (`items/js/items.js`) | `ItemCatalog` | 379 tagged items with race affinity; loot roller (material, quality, enchant, artifact name, value, lore); Lingo export | `items/data/{items,materials}.json` (+ namegen for artifact names) | trivial |
| **Assets** (`assets/js/assets.js`) | `Assets, svgInner` | Scenery backdrops (32 full-bleed SVG scenes, tagged, day/night) and map node icons as files, not code; tag lookup, caching, gradient fallback when art is missing | `assets/data/manifest.json` + `data/scenery/*.svg`, `data/icons/*.svg` | one fetch per file, then cached |
| **Sound** (`sfx/js/sfx.js`) | `Sfx` | Sound effects by logical id (`spell.fire.impact`, `melee.crit`, `ui.click`, `ambience.cave`) with four interchangeable makers — `synth` (ours), `library` (Kenney CC0 samples), `hybrid` (default), `retro` (chiptune) — every clip measured and gain-matched to its category target, sfx/ui/ambience buses, panning, loops | `sfx/data/catalog.json`; `sfx/assets/kenney/` (~3.2 MB) only for the sample methods | ~5–40 ms to build a sound the first time, then cached; playback is one buffer source |
| **Avatar 2D** (`avatar-2d/js/render.js`, `random.js`) | `renderSVG, renderInto, normalizeAvatar, randomAvatar` | SVG portraits/paper-dolls from the `avatar` JSON; race-rule random | `avatar-2d/data/presets.json` | microseconds; DOM-free string |
| **Avatar 3D** (`avatar-3d/js/mii.js`, `quaternius.js`, `scene.js`) | `createMiiCharacter, createQuaterniusCharacter, createScene` | Three.js characters from the same `avatar` JSON; procedural (Mii) or CC0 meshes with 43 animation clips | importmap for `three`; `avatar-3d/assets/quaternius/` (~32 MB) for the mesh mode | Mii ~60 draw calls/character; Quaternius ~6 skinned meshes |

- **`worldgen/`** — a whole world map in one call: continents, climate, rivers, biomes, named regions, towns, dungeons, roads, plus region and local-tile zoom. Pure data, seeded, exports JSON/PNG. See its README.
- **`universe/`** — a whole galaxy in one call: stars by class, systems of planets with moons, rings, belts and comets, resources and hazards per planet, and a planet's surface handed straight to `worldgen/`. Pure data, seeded. 3D models for all of it in `assets/js/space-models.js`. See its README.

## 2. Recipes

**A talking NPC (text + voice + memory + feelings)**
```js
import { Lingo, Speaker } from '/lingo/js/lingo.js';
import { MemoryBank } from '/lingo/js/memory.js';
import { RelationGraph } from '/lingo/js/relations.js';
import { Scene } from '/lingo/js/context.js';
import { say } from '/voice-lab/js/voice.js';
const data = Object.fromEntries(await Promise.all(['lexicon', 'grammar', 'traits', 'events', 'relations'].map(async f => [f, await (await fetch(`/lingo/data/${f}.json`)).json()])));
const lingo = new Lingo({ lexicon: data.lexicon, grammar: data.grammar, traits: data.traits });
const relations = new RelationGraph(data.relations);
const mara = new Speaker({ id: 'mara', name: 'Mara', entry: lingo.lexicon.get('mara'), lexicon: lingo.lexicon, speech: character.speech });
const bank = new MemoryBank({ ownerId: 'mara', traits: mara.traits, eventTypes: data.events.types, lexicon: lingo.lexicon });
// the simulation reports what happened
const ev = { type: 'combat', time: now, bindings: { foe: { id: 'goblin', count: 10 }, place: { id: 'cave' }, ally: { id: 'thalen' } }, details: { outcome: 'won' }, participants: ['mara', 'thalen'] };
bank.remember(ev, now); relations.applyMemoryEvent(ev, { traitsOf: id => party[id].traits, now });
// later, at camp
const scene = new Scene({ place: 'camp', tags: ['dark', 'warm'], danger: 0.1, comfort: 0.7, timeOfDay: 'night' }, lingo.lexicon);
const line = lingo.speakMemory(bank, now, { speaker: mara, listener: thalen, relation: relations.get('mara', 'thalen'), scene })
        || lingo.speak('smalltalk', { speaker: mara, listener: thalen, relation: relations.get('mara', 'thalen'), scene });
await say(line.speech, character.voice);       // formant engine reads the [[phonemes]] for invented names
```

**Whole conversation**: `lingo.converse(a, b, { turns, banks, relations, scene, now })` returns lines with intents, tags and memories; play each with `say()` and animate the speaker (`body.setAnim('talk')`).

**Fight chatter that doesn't get old**: openers come from `enemy_opener` / `boss_opener` / `named_first|named_rematch|named_avenge|named_beaten`, wordless monsters from `beast_snarl`, camp raids from `night_attack` and road traps from `ambush_opener`. Tag the speaker's `speech.tagWeights` with its family (goblin/bandit/cultist/undead/demon/void/dragon/knight) or the hero's role (tank/healer/caster/rogue/ranger) and set the others to 0 — `prototypes/emberveil/js/talk.js` (`enemyKind`, `heroRole`, `enemyOpener`, `namedOpener`) is the drop-in version. Lingo keeps a session-wide anti-repeat for every symbol in `grammar.json` → `meta.noRepeat`, and `ctx.exclude` bans lines already used in this fight.

**Generating a world**: `NameGen` for the roster (people with race/gender/pronouns/pronunciation), factions and places → `gen.toLexiconEntry()` → `lingo.lexicon.add()`; `ItemCatalog.roll({ race, rarity, namegen })` for loot → `cat.toLexiconEntry()`; then every line can mention them with correct plurals, articles and pronunciation.

**Portraits and bodies**: `renderSVG(character.avatar)` for the UI; `createMiiCharacter(character.avatar)` in the 3D scene; `randomAvatar(presets, { race, seed })` for crowds. The same `avatar` object drives both.

**Spell effects on a stage** (`avatar-3d/js/spellfx.js` — projectiles, impacts, cast flashes, status auras; built from shaped geometry + the `assets/data/fx/` sprites, never a glowing ball)
```js
import * as THREE from 'three';
import { SpellFx, elementName } from '/avatar-3d/js/spellfx.js';
const fx = new SpellFx(scene.scene, { textures: await assets.fxTextures(THREE), camera: scene.camera, scale: 1.4 });
// scale 1 suits a close-up viewer; a fight camera that is further back wants ~1.4 or the effects vanish
scene.addTicker(dt => fx.update(dt));                       // one call per frame drives everything

// a caster throws something at a target and it lands
const from = chestOf(caster), to = chestOf(target);         // world Vector3s: group position + height * 0.62
fx.cast({ at: feetOf(caster), element: 'fire' });           // rune flash while the spell is spoken
await fx.projectile({ from, to, element: 'fire' });         // resolves on arrival (flight capped at 450 ms)
fx.impact({ at: to, element: 'fire', crit: true });         // the burst

fx.status(targetBody, 'burn', true);                        // looping aura, parented to the body
fx.pulseStatus(targetBody, 'burn');                         // one swell, for a damage-over-time tick
fx.clearStatuses(targetBody);                               // on death, or when the fight ends
fx.heal({ at: feetOf(x) }); fx.revive({ at: feetOf(x) }); fx.aoe({ points, element: 'arcane' });
```
Both prototype stages already wrap this: `stage.cast(srcId, tgtId, { element, kind })` (a `melee` kind keeps the
old thrust and skips the projectile), `stage.impact(id, element, crit)`, `stage.status(id, type, on)`,
`stage.clearStatuses(id)`, `stage.heal(id)`, `stage.reviveFx(id)`, `stage.pointOf(id)` / `stage.footOf(id)`.
Map your combat log onto it with `elementName(ev.dtype)` (handles `cold`→ice, `magic`→arcane, `melee`→physical…),
remember the caster's element on a `skill` event and throw it on that caster's first `damage` event, and keep the
auras in step with the unit's real status list after every event so expiries clear themselves. Set
`group.userData.fxHeight` from `ctrl.metrics()` and auras size themselves to the body — a rat and a dragon both
look right. Cost: a projectile is one small group plus ~20 pooled-free billboards; an aura is 3–8 sprites.

**Crowds of talking NPCs**: pre-render lines with `synthesize()` (formant/babble/espeak) and `play()` them with pan/volume; never call Piper in a hot loop. Babble plus subtitles is the cheapest option for dozens of simultaneous talkers.

### Recipe: generate a world and pick a starting region

```js
import { generateWorld, cellInfo } from '/worldgen/js/world.js';
import { generateLocalDetail } from '/worldgen/js/local.js';
import { renderWorld } from '/worldgen/js/render.js';
import { roadGraph } from '/worldgen/js/roads.js';
import { NameGen } from '/namegen/js/namegen.js';

const namegen = await NameGen.load('/namegen/data/');
const world = generateWorld({ seed: 20260912, method: 'plates', width: 256, height: 128, namegen });

// a sensible home: coastal, mild, not cursed, and it already has a town
const start = world.regions
  .filter(r => r.coastal && r.danger < 0.4 && r.temperature > 0.35 && r.seat != null)
  .sort((a, b) => b.cells - a.cells)[0];
const home = world.nodes[start.seat];

renderWorld(canvas.getContext('2d'), world, { layers: { biomes: true, rivers: true, roads: true, nodes: true, labels: true } });
const tile = generateLocalDetail(world, home.x, home.y, { node: home });   // the map a fight happens on
```

`start.descriptor` is a ready-made plain-language line for the intro ("a wide stretch of mild, green
mixed woodland, open to the sea, well watered"), `start.history` is three or four dated events you can
feed straight into Lingo memories, and `roadGraph(world)` gives you the travel graph between every
town and port. `region.danger`, `node.tags` and `BIOMES[id].move` are the hooks for encounter tables,
quest matching and travel time. Generation takes about half a second at 256×128 — run it in
`worldgen/js/worker.js` if you want the UI to stay live. Full details in `worldgen/README.md`.

### Recipe: from galaxy to a landing site

Star Forge and World Forge are the same idea at two scales, and they join at the planet: a planet
record is a set of World Forge knobs, so a star you picked off a chart becomes ground you can walk on.

```js
import { generateGalaxy, route } from '/universe/js/galaxy.js';
import { generateSystem } from '/universe/js/system.js';
import { generatePlanetMap } from '/universe/js/planetmap.js';
import { generateLocalDetail } from '/worldgen/js/local.js';
import { NameGen } from '/namegen/js/namegen.js';

const namegen = await NameGen.load('/namegen/data/');
const galaxy = generateGalaxy({ seed: 20260913, stars: 300, layout: 'spiral', arms: 4, namegen });

// somewhere worth flying to: a living world that also has something rare under it
let target = null;
for (const star of galaxy.stars) {
  const system = generateSystem(star, { seed: star.seed, namegen });
  const planet = system.planets.find(p => p.archetype === 'living' && p.rareElements.length);
  if (planet) { target = { star, system, planet }; break; }
}

const jumps = route(galaxy, 0, target.star.id);              // the flight plan, star by star
const world = generatePlanetMap(target.planet);              // a full World Forge world, ~0.5 s
const port  = world.nodes.find(n => n.type === 'port') || world.nodes[0];
const tile  = generateLocalDetail(world, port.x, port.y, { node: port });   // the 64×64 tile you land on
```

From there everything is the World Forge recipe above — regions, roads, danger, local tiles. What the
universe layer adds on top:

- `planet.gravity`, `planet.atmosphere.breathable`, `planet.dayLengthHours`, `planet.temperature.C` —
  rules the player feels the moment they step out.
- `planet.hazards[]` (`heat` · `cold` · `toxic` · `radiation` · `storms`) and `planet.difficulty`
  (0…1) — straight into an encounter or survival table.
- `planet.resources[]` (the baseline four, always there) and `planet.rareElements[]` (one or two,
  with a `value` each) — mining and trade. The full table is `universe/data/elements.json`.
- `planet.biomeMode` — `'single'` worlds are one kind of ground all the way round (an ice world is
  ice), `'multi'` worlds have a real climate with ice caps. That is the difference between a mining
  stop and a place worth settling.
- `star.habitable` and `star.frostLine` — what a scanner would report before you commit to the jump.

To draw any of it, `assets/js/space-models.js` has `createSpaceScene`, `createPlanet` (hand it
`planetTexture(planet, world)` and it wears its own map), `createStar`, `createAsteroidBelt`,
`createShip`, `createStation` and `createSpaceBackdrop`.

**Sound for a whole game, without touching the game**

```js
import { Sfx } from './sfx/js/sfx.js';
const sfx = await Sfx.create({ method: 'hybrid', volume: 0.8 });   // 'synth' if you ship no samples

sfx.play('melee.crit', { pan: 0.4 });      // pan from the attacker's x position on screen
sfx.play('spell.fire.impact');
sfx.ambience('ambience.cave');             // cross-fades the background bed
sfx.setBusVolume('ui', 0.5);               // three buses: sfx, ui, ambience
```

Ask for meaning, never for a filename, and the whole sound set swaps with one `setMethod()` call.
Loudness is not your problem: each clip is measured (K-weighted) when it is built and levelled to its
category's target, with a soft ceiling at −1 dBFS and a limiter on the master bus — a recorded punch
and a synthesized fireball come out the same volume.

To hook an existing game with no edits to it, wrap its methods at runtime the way
`prototypes/emberveil/js/sfx-bridge.js` does: one `installSfx({ stage, game })` call gives you
swings, impacts, dot ticks, statuses, heals, deaths by body type, ambience following the backdrop,
footsteps, interface clicks, and loot/level-up/quest stings read off the narrative text. Add a sound
by editing `sfx/tools/build-catalog.py` and re-running it — `data/catalog.json` is generated.

## 3. Data conventions to keep
- Lexicon entries: `{ id, type, forms: { sg, pl, adj, people, lang, short }, proper, mass, pronouns, race, tags, pron: { respell } }`. Explicit forms always win over rules.
- Templates: `{binding.modifier}`, `{#symbol}`, `{$type}`, `{~a|b}`, `{n, plural, one{} other{}}`; conditions are JS expressions over the context helpers (mood, opinion, warmth, respect, trust, fear, danger, sceneHas, knows, memory.*).
- Tags everywhere: phrase tags ↔ trait weights ↔ relationship tags ↔ scene tags; item tags ↔ race affinity; concept tags ↔ name patterns. Games filter and weight on tags rather than hard-coding.
- Time is game hours (number) for memories and relationships.
- Seeds: every random thing accepts a seed for reproducibility.

## 4. Where the docs are
`CLAUDE.md` (conventions + table), each experiment's `README.md`, `voice-lab/FORMANT.md` (the TTS engine), `lingo/MEMORY.md`, `lingo/RELATIONS.md`, `shared/character-schema.md`, `vendor/README.md` (licenses), `sfx/README.md` (the sound catalog, methods and loudness normalization) + `sfx/assets/kenney/README.md` (the CC0 packs), `docs/research-*.md` (why these choices), `tools/build-items.py` (regenerate the item catalog).


## Conversations and meters

`conversations/js/conversations.js` turns memories, gear (with kill counts from `meters/js/meter.js`), loot deltas and party facts into structured back-and-forth talk: build `factsFrom({...})` from your game state and call `talk(speakers, facts)`. `meters/` records every hit from any combat system and renders a Skada-style drill-down. Our voice: import `voice-lab/js/formant-voice.js` (versioned; see its CHANGELOG); give characters a voice with `shared/voices.js` `voiceFor({ role, gender, seed })` so a class sounds like itself and each member differs. Random NPCs: `library/js/make.js` `makeNpc()` (generic parts, a decal, a role voice, a Name Forge name).

## Debugging language

`shared/langdebug.js`: mount the toggle in your HUD and call `decorate(paragraph)` on every spoken line; players/devs can click words, see the pronunciation and lexicon entry, and override respellings or words on the fly (stored locally, exportable, submittable to the dev server inbox).

## Animals and monsters

`avatar-3d/js/creatures.js` gives you wolves, boars, bears, rats, horses, deer, bats, spiders, snakes, drakes and dragons as procedural 3D bodies with the same `{ group, update, setAnim }` interface as people. Store the spec under `character.creature`; creatures have no `speech`, so give them narrated actions ("the wolf snarls") instead of lines. See `avatar-3d/README.md` (Creatures).

## Carts, wagons and mounts

`avatar-3d/js/vehicles.js` builds the thing the party travels with: `await createVehicle('wagon')` gives
you a group facing +x with the same `{ setAnim, update, metrics, dispose }` interface as a creature, and
the animal in the shafts is a real `createCreature` body that walks when you `setAnim('roll')`. Seven
types (hand cart, pack mule, covered wagon, ox cart, war wagon, coach, drake sled); `vehicleModelFor(id)`
maps your own vehicle ids onto them. `metrics()` hands back `hitch` (where the animal stands) and `seat`
(where a driver would sit) so a scene can place things against the model instead of guessing.

Two things worth copying from Emberveil 2 (`prototypes/emberveil/js/stage.js`): **frame the camera from
the panel's shape** rather than fixing a position — `Stage.frame(mode)` takes a world width, a tallest
head and a headroom share and works out the distance for whatever aspect the box is, re-running on
resize, which is what stops a party of four plus four enemies falling off the sides; and **measure a
speech bubble after the browser has drawn it**, then clamp it inside the stage box and flip it under the
head when there is no room above.

## A world map that reads as a road

A node graph that grows by insertion turns into a fan: one Emberveil zone ended up opening seven
branches at once, with a trail that jumped from the entrance most of the way to the boss.
`tools/expand-emberveil-map.mjs` `normalizeZones()` is the fix, and it is generic — it only rewrites
`exits` (and the row/column hints), never the nodes themselves, so ids that quests and save files point
at survive. The invariants are worth copying whole: the entrance alone in the first column and the boss
alone in the last, a width cap so only three or four branches are ever open, every trail joining one
column to the very next one (which is what kills shortcuts and makes every route the same length), and
every node with a way in and a way out. `prototypes/emberveil/tests/zone-graph.test.js` is the test that
states those rules in one place.

Two rules that go with it. **Walk one node at a time**: let the party move to the neighbours of where
they stand, in *both* directions, and charge a move for the walk back — "fast travel to anywhere you
have visited" quietly deletes the map. And then **put a settlement in every zone**, one move from the
entrance, or the party has nowhere to buy food or heal.

## Travel hazards between places

`prototypes/emberveil/js/explore.js` + `data/crossings.json` are a small, copyable pattern for a world
with a road in it: a node type whose whole content is "something is in the way, here are four ways past".
Each way is a stat check (best party value + d20 against a difficulty that rises with the act), an item
or supply you might be carrying, gold, a quest flag or fame, or a fight — and each pays out in the same
`{ xp, gold, fame, drops }` shape a won fight does, so the reward popup needs no special case. Keep the
resolution pure (no DOM, no 3D) and the scene separate: `stage.travelAcross()` walks the party across and
`stage.walkIn()` brings an NPC on to meet them.

## Scenery and icons

`assets/` holds the art both prototypes share. `const assets = await Assets.open('../assets/')`, then
`container.replaceChildren(await assets.sceneryElement(placeId, { night }))` for a backdrop, or
`await assets.icons()` for the map node markers. Scenes are tagged (`outdoor`, `forest`, `settlement`,
`act3`…) so `listByTag()` can pick one for a place you have no art for, and a missing id falls back to a
plain gradient instead of throwing — you can build the game before the art exists. `Stage` in both
prototypes takes `{ assets }` so a game shares one loader. See `assets/README.md` for the file rules
(viewBox `0 0 100 100`, `preserveAspectRatio="none"`, keep the bottom third simple).

## Themed UI (making it look like a game)

A prototype stops looking like a form when three cheap things land together: **art**, **type** and
**tooltips**. `assets/data/ui/` holds the reusable interface art (frames, ornaments, HUD/tab/slot/stat
icons, rarity gems — see the `ui` section of the manifest); a display serif for headings plus a body
serif from Google Fonts does the rest of the mood; and `shared/tooltip.js`
(`installTooltips()`, then `data-tip="…"` or `data-tip-html="…"` on anything) explains every number
without a manual. `prototypes/emberveil/style.css` + `js/ui.js` are the worked example: leather panel
tiles, gold corner flourishes dropped into any `.framed` box, divider rules under headings, ember
accents, a menu overlay for settings, and plain-language text for stats and map nodes. Copy `ui.js`'s
shape — presentation helpers in their own module, no game rules — when theming the next one.

## Standing on a generated world (planet surface you can walk)

`prototypes/farhold/` turns a `universe/` planet into ground you walk on. Two ideas carry it, and both
are reusable on their own:

**1. Sample the map, do not re-invent it.** `js/planet.js` is pure JavaScript (no Three.js, no DOM):
it samples the world map's elevation smoothly between cells, converts to metres with the planet's own
relief scale, and adds the same two noise octaves `worldgen/js/local.js` uses for local tiles. So the
hill you climb is the hill the map drew, and the same seed always gives the same hill.

```js
import { createWorld, makeTerrain } from '/prototypes/farhold/js/planet.js';
const { star, system, planet, world } = createWorld({ seed: 7 });
const terrain = makeTerrain(world, planet);
terrain.heightAt(x, z);    // metres; one map cell is 640 m, so 256x128 = 163 km x 82 km
terrain.colorAt(x, z);     // [r,g,b] 0..1: biome, rock on slopes, snow up high, sand at the shore
terrain.spawnPoint();      // dry, flat-ish, habitable
```

**2. Draw it as rings, not chunks.** `js/terrain.js` keeps concentric square rings centred on the
player, each with the same vertex count over three times the area, each with a hole where the finer
ring covers it. Five rings = 7.8 km of view in five draw calls. A ring only rebuilds when the player
crosses one of its own cells, so the outer ones almost never rebuild.

**The sky is a separate scene** (`js/sky.js`): a camera at the origin copying only the main camera's
rotation, drawn first, then `renderer.clearDepth()` and the world over it. Everything in it is
infinitely far away for free. Sibling planets are placed by real orbital angle and drawn oversized on
purpose - `balance.json` `sky.siblingScale`.

## A real-time skill bar over turn-based skill data

`prototypes/farhold/js/skills.js` is the small piece that lets a real-time game use skills written
for a turn-based one. Emberveil's `data/skills.json` describes shapes like `adjacent2`, `row` and
`per_source` — party positions, which mean nothing to one person standing in a field. Farhold's
`data/skills.json` keeps the same ideas but describes each skill by **shape** (`melee`, `around`,
`bolt`, `self`), **radius**, **cooldown** and **mana**, and `js/skills.js` turns a key press into a
plan the caller carries out:

```js
import { createSkillBar, applyStatus, tickStatuses, slowOf, buffsOf } from '/prototypes/farhold/js/skills.js';
const skills = createSkillBar({ data, player, rpg });
const plan = skills.use(0);          // { ok, kind, element, damage, radius, status, heal, ... }
skills.update(dt);                   // cooldowns
skills.state();                      // what the HUD draws
```

The model is pure — it never touches Three.js — so node tests drive the whole fight with no
renderer. Statuses are plain objects on the target (`{ type, remaining, power }`): `tickStatuses`
returns the damage that tick, `slowOf` how much it is slowed, `buffsOf` the damage and resistance a
unit's buffs are worth. Two things learned wiring it to `avatar-3d/js/spellfx.js`: give a projectile
an explicit `ms` (the module clamps its own flight to 0.16-0.45 s, which is an age in a real-time
fight), and make a bolt burst on **where its target is now**, not where it stood when you fired —
anything charging you moves several metres while the bolt is in the air.

## A world with people in it: factions, territory, and jobs made of what is there

`prototypes/farhold/js/{factions,territory,jobgen}.js` are three small pure modules that solve the
problem every big open world has: **the interesting content is always somewhere else.** If travel is
slow — and on a real planet it is — then a quest that pins a marker twenty minutes away is a
punishment, not an invitation.

```js
import { createStandings, ranked } from '/prototypes/farhold/js/factions.js';
import { createTerritory } from '/prototypes/farhold/js/territory.js';
import { createJobGen, candidatesFrom } from '/prototypes/farhold/js/jobgen.js';

const standings = createStandings(factionData);              // -100..100 a faction
const holdings = createTerritory({ zones, seed, factions: factionData, standings });
const jobs = createJobGen({ frames: frameData, territory: holdings, factions: factionData, standings });

const candidates = candidatesFrom({ zone, territory: holdings, bestiary, nodes, level });
const board = jobs.offer({ zone, level, candidates, want: 5 });
```

Three ideas worth stealing whole:

**Standing spreads to rivals.** A deed for one faction is a third of a deed against everyone they are
at odds with, so there is no state where everybody likes you. Twelve factions stop being a checklist
and become a question — "who do I work for round here" — that you answer differently on different
worlds.

**A place is generated, not stored.** A territory record (who holds a zone, how firmly, its real
camps, its open trouble) is derived from `(worldSeed, zoneId)`, so a zone you have never entered
already has a holder — walking in *reveals* it. Only the deltas — grip, cleared camps, open incidents
— are saved, so a hundred-zone world costs a few hundred bytes rather than a world of furniture.

**A quest is a fact about the world, phrased.** `jobgen` is a template engine with *typed slots*: a
frame declares what it needs (`{ slot: 'site', type: 'site', hostile: true }`) and is only offered
when every slot binds to something that exists right now — a camp still standing, a caravan really
late, a named enemy that really did beat you. If a slot cannot be filled the frame is skipped in
silence. Nothing is invented, which is the whole reason a generated job can never send you to an
empty field. Keep four bread-and-butter frames that bind to almost anything, or a quiet zone offers
nothing at all.

The same folder has `patrols.js`, `caravans.js`, `wanderers.js`, `incidents.js` and `rumours.js` on
top of that base — all pure, all a position and a clock until you are near them, so a world that is
moving costs one line of arithmetic per body per frame. `prototypes/farhold/EXPANSION.md` is the
design; `tests/expansion.test.js` is what it promises.

## Gathering that costs a walk, and routes that lay themselves

`prototypes/farhold/js/{resources,haulpath,mining}.js` are three pure modules that answer one
question — **how much of this stuff actually arrives at my base per minute** — and make every way of
moving it agree on the answer.

```js
import { createNodeWorld, haulReport, kindsForBiome } from '/prototypes/farhold/js/resources.js';
import { findHaulPath, bestStoreFor } from '/prototypes/farhold/js/haulpath.js';
import { createMining } from '/prototypes/farhold/js/mining.js';

const ore = createNodeWorld({ data, seed, terrain, planet, band });   // a 512 m tile at a time
const mining = createMining({ data, ore, stores, terrain });
mining.bindDrill(entry, ore.at(entry.x, entry.z, 6));
mining.autoRoute(entry.id);           // it finds its own store
```

Four ideas worth stealing whole:

**One number decides everything.** Richness and distance fold into `deliveredPerMinute`, so a Mother
Lode four hundred metres out and a Lean seam behind the workshop are genuinely comparable, and the
player can read the trade-off *before* committing rather than regretting it after.

**The distance is the WALK, not the line.** `haulpath.js` is A\* over an 8 m grid where water is a
wall and a step costs its length times a slope penalty. That one change is the difference between
"the nearest store" and "the store that delivers most", which are different stores surprisingly
often — and it gives you the path, so you can *draw* the route. A track that visibly doubles back
round a lake explains its own throughput.

**Three kinds of node, not one.** Surface / `indoors` / `placedOnly`. Farhold shipped with a
hardness-2 dungeon seam scattered across open grassland because `kindsForBiome` read the biome list
and nothing else — and the only tool that could work it was a steel weapon the player could not have
yet. State the rule as a test: *whatever the surface offers, a brand new player must be able to work
it.* It will catch the second offender you did not know about.

**A refusal has to say what to do.** "You need a Steel Tool" is true and useless if nothing in the
game says where a tool tier comes from. Put the answer in the data (`tools[].from`) so every screen
that prints a refusal gets it for free.

**One vocabulary, joined at the boundary.** Farhold's build catalogue priced things in `timber` and
`iron`; its refining chain produced `log` and `iron_ingot`; the catalogue's own header said "§1 and
§2 will decide where `iron` actually comes from" and nobody ever went back. A palisade cost six
units of a thing that has never existed. If you have two files that name the same concept
differently, **write the alias table the day you notice**, apply it once where the data is loaded,
and put a test on it — a cost you cannot obtain is not a price, it is a wall, and it produces no
crash and no wrong number to find it by.

## Scenery you can knock down, when the scatter is a pure function

`prototypes/farhold/js/props.js` scatters trees, rocks and grass from a cell seed — the same cell
always produces the same trees, and nothing is stored. Which is exactly why **you cannot delete one**
without a plan.

The plan is a **ledger of exceptions** beside the generator, and it is two lists because there are
two questions: `felled` names one prop by its position rounded to a tenth of a metre (far inside the
gap between neighbouring scatter points, exact enough to hash the same every rebuild) and carries
its regrow clock; `cleared` is a list of circles, which keeps working on cells that have not been
generated yet. Both are tiny and both go in the save — a whole base is a couple of dozen circles.

Two rules that make it safe:

- **Skip the placement, not the draw.** When you thin or suppress an item in a scatter loop, draw
  all its random numbers anyway and skip only the write to the mesh. The cell's rng is shared with
  everything after it, so stopping early makes the ruins, the giants and the grass all move.
- **Gathering is the verb you already have.** Give each prop an hp, a tool tier and a drop list and
  let the ordinary attack land on it when the swing hits nothing alive. No gathering key, no
  gathering mode, and the tool ladder is the same one the ore uses so there is one rule to learn.

## Making a star do something to the picture

`prototypes/farhold/js/sunfx.js` is a small, self-contained screen-space sun layer: god rays, a lens
flare, a corona ring during an eclipse, and the warm wash as the star drops behind a ridge. It does
not touch WebGL at all — it projects the sun's direction to a screen position, asks the terrain
whether anything is in the way, and moves a handful of gradient-filled divs.

```js
import { createSunFx } from '/prototypes/farhold/js/sunfx.js';
const sunfx = createSunFx({ terrain: { heightAt } });
sunfx.update({ camera, sunDirection, cloud, eclipse, day, dt });
```

Three things worth copying:

- **The occlusion is a march, not a ray test.** Step along the sun's direction from the eye and count
  how many samples are under the ground. One ray/plane test cannot tell a ridge from a valley;
  twenty-two steps give you "fully behind a mountain" (1), "a ridge across the disc" (~0.5) and
  "clear sky" (0) — which is exactly the number the shafts and the horizon wash want.
- **An eclipse should not kill the flare.** It is the one time a flare is worth having. The shafts
  die with the light, but the ghosts brighten and a ring appears on the covered star.
- **Don't multiply the effect by daylight.** A low sun flares hardest and a low sun is dim, so
  multiplying by "how bright is it" cancels the very thing you built. Gate on the sun being above
  the horizon instead, and let a separate low-sun term do the work.

The companion trick lives in `js/sky.js`: things drawn "infinitely far away" on one shell cut through
each other. Put each on its own shell in real distance order and scale it by the shell it lands on —
the apparent size is unchanged, and the depth buffer does the occluding for nothing.

## Weather over a generated world

`worldgen/js/weather.js` turns a cell's climate into what the sky above it is doing. Pure data, no
renderer, shared by World Forge's viewer and Farhold.

```js
import { weatherWeights, rollWeather, WeatherClock, atmospherePalette, weatherMap } from '/worldgen/js/weather.js';
const weights = weatherWeights({ temperature, moisture, elevation, biome, water, aura, magic, volcanic, liquid, archetype });
const clock = new WeatherClock({ weights, seed: 7 });   // holds a state for minutes, then crossfades
clock.update(dt);
clock.blend();   // { cloud, rain, snow, dust, fog, wind, lightning, gloom, key, name } — all 0..1
```

14 states. The climate decides which are possible: a hot dry plain blows sand but never snows, a
freezing peak blizzards but never blows sand, a storm needs heat *and* water, volcanic ground throws
ash and embers, raw magic throws ion storms, and a world with `liquid: 'none'` gets no precipitation
at all. `weatherMap(world)` gives the dominant state per cell (cached) — that is the viewer's weather
layer, and a game can read it as a climate map.

`atmospherePalette(body)` gives a world its `sky`, `skyHorizon`, `sea`, `cloud`, `cloudShadow` and
`fog`, varied by the body's own seed as far as its `extremity` allows — a temperate world barely
shifts, a lava or void-touched one can come out any colour. Use it for the sky, the water and the
cloud decks, including the ones on planets seen from another planet's surface.

`prototypes/farhold/js/weather.js` is the matching renderer, if you want a reference: two scrolling
cloud decks on a sky dome, rain as recycled line segments in a box that follows the camera, snow and
dust as points, lightning that flashes the scene, and fog that closes the view to 90 m in a blizzard.

## Worked example: Emberveil (a full RPG on the pieces)

`prototypes/emberveil/` rebuilds the user's Emberveil RPG: its own data (copied by `tools/build-emberveil-data.mjs`), a loot engine with affixes/uniques/sets, a stat + talent system, an auto-battle simulator and a branching world map, all presented with Mii bodies (30 class looks with new gear parts), creature bodies and Lingo barks. Read its README for what maps to what.

## Worked example: Party Quest

`prototypes/party-quest/` is a complete small game made only from the pieces above: party from the library, Lingo talk with memories and relationships for combat barks, town gossip and camp conversations, Name Forge NPCs, Item Vault loot and shops, Mii bodies on a cinematic stage, Formant voices. Its `README.md` maps each feature to the experiment it came from. Read `js/main.js` top to bottom for the glue.
