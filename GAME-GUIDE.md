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
| **Avatar 2D** (`avatar-2d/js/render.js`, `random.js`) | `renderSVG, renderInto, normalizeAvatar, randomAvatar` | SVG portraits/paper-dolls from the `avatar` JSON; race-rule random | `avatar-2d/data/presets.json` | microseconds; DOM-free string |
| **Avatar 3D** (`avatar-3d/js/mii.js`, `quaternius.js`, `scene.js`) | `createMiiCharacter, createQuaterniusCharacter, createScene` | Three.js characters from the same `avatar` JSON; procedural (Mii) or CC0 meshes with 43 animation clips | importmap for `three`; `avatar-3d/assets/quaternius/` (~32 MB) for the mesh mode | Mii ~60 draw calls/character; Quaternius ~6 skinned meshes |

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

## 3. Data conventions to keep
- Lexicon entries: `{ id, type, forms: { sg, pl, adj, people, lang, short }, proper, mass, pronouns, race, tags, pron: { respell } }`. Explicit forms always win over rules.
- Templates: `{binding.modifier}`, `{#symbol}`, `{$type}`, `{~a|b}`, `{n, plural, one{} other{}}`; conditions are JS expressions over the context helpers (mood, opinion, warmth, respect, trust, fear, danger, sceneHas, knows, memory.*).
- Tags everywhere: phrase tags ↔ trait weights ↔ relationship tags ↔ scene tags; item tags ↔ race affinity; concept tags ↔ name patterns. Games filter and weight on tags rather than hard-coding.
- Time is game hours (number) for memories and relationships.
- Seeds: every random thing accepts a seed for reproducibility.

## 4. Where the docs are
`CLAUDE.md` (conventions + table), each experiment's `README.md`, `voice-lab/FORMANT.md` (the TTS engine), `lingo/MEMORY.md`, `lingo/RELATIONS.md`, `shared/character-schema.md`, `vendor/README.md` (licenses), `docs/research-*.md` (why these choices), `tools/build-items.py` (regenerate the item catalog).


## Conversations and meters

`conversations/js/conversations.js` turns memories, gear (with kill counts from `meters/js/meter.js`), loot deltas and party facts into structured back-and-forth talk: build `factsFrom({...})` from your game state and call `talk(speakers, facts)`. `meters/` records every hit from any combat system and renders a Skada-style drill-down. Our voice: import `voice-lab/js/formant-voice.js` (versioned; see its CHANGELOG); give characters a voice with `shared/voices.js` `voiceFor({ role, gender, seed })` so a class sounds like itself and each member differs. Random NPCs: `library/js/make.js` `makeNpc()` (generic parts, a decal, a role voice, a Name Forge name).

## Debugging language

`shared/langdebug.js`: mount the toggle in your HUD and call `decorate(paragraph)` on every spoken line; players/devs can click words, see the pronunciation and lexicon entry, and override respellings or words on the fly (stored locally, exportable, submittable to the dev server inbox).

## Animals and monsters

`avatar-3d/js/creatures.js` gives you wolves, boars, bears, rats, horses, deer, bats, spiders, snakes, drakes and dragons as procedural 3D bodies with the same `{ group, update, setAnim }` interface as people. Store the spec under `character.creature`; creatures have no `speech`, so give them narrated actions ("the wolf snarls") instead of lines. See `avatar-3d/README.md` (Creatures).

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

## Worked example: Emberveil (a full RPG on the pieces)

`prototypes/emberveil/` rebuilds the user's Emberveil RPG: its own data (copied by `tools/build-emberveil-data.mjs`), a loot engine with affixes/uniques/sets, a stat + talent system, an auto-battle simulator and a branching world map, all presented with Mii bodies (30 class looks with new gear parts), creature bodies and Lingo barks. Read its README for what maps to what.

## Worked example: Party Quest

`prototypes/party-quest/` is a complete small game made only from the pieces above: party from the library, Lingo talk with memories and relationships for combat barks, town gossip and camp conversations, Name Forge NPCs, Item Vault loot and shops, Mii bodies on a cinematic stage, Formant voices. Its `README.md` maps each feature to the experiment it came from. Read `js/main.js` top to bottom for the glue.
