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

**Crowds of talking NPCs**: pre-render lines with `synthesize()` (formant/babble/espeak) and `play()` them with pan/volume; never call Piper in a hot loop. Babble plus subtitles is the cheapest option for dozens of simultaneous talkers.

## 3. Data conventions to keep
- Lexicon entries: `{ id, type, forms: { sg, pl, adj, people, lang, short }, proper, mass, pronouns, race, tags, pron: { respell } }`. Explicit forms always win over rules.
- Templates: `{binding.modifier}`, `{#symbol}`, `{$type}`, `{~a|b}`, `{n, plural, one{} other{}}`; conditions are JS expressions over the context helpers (mood, opinion, warmth, respect, trust, fear, danger, sceneHas, knows, memory.*).
- Tags everywhere: phrase tags ↔ trait weights ↔ relationship tags ↔ scene tags; item tags ↔ race affinity; concept tags ↔ name patterns. Games filter and weight on tags rather than hard-coding.
- Time is game hours (number) for memories and relationships.
- Seeds: every random thing accepts a seed for reproducibility.

## 4. Where the docs are
`CLAUDE.md` (conventions + table), each experiment's `README.md`, `voice-lab/FORMANT.md` (the TTS engine), `lingo/MEMORY.md`, `lingo/RELATIONS.md`, `shared/character-schema.md`, `vendor/README.md` (licenses), `docs/research-*.md` (why these choices), `tools/build-items.py` (regenerate the item catalog).
