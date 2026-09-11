# Playground — experiments for future games

This directory holds standalone **experiments** (reusable libraries + brainstorm dumps, top-level folders) and **prototypes** (throwaway games that test ideas before branching into their own project, under `prototypes/`). A shared **library** of character/item/party blueprints (`library/`) is readable by every page on this origin. Future games built with Claude Code will read this directory, so every experiment must have a thorough `README.md` explaining its mechanisms, data formats, and how to reuse the code.

Owner: Radley Sustaire (independent project). Sandbox: auto-commit freely, no remote yet.

## Layout
- `<experiment>/` — a library other code imports (voice-lab, lingo, avatar-2d, avatar-3d, namegen, items, combined). Stable APIs, READMEs, tests.
- `prototypes/<name>/` — a small game built from the experiments. Throwaway: it may hard-code things and break when experiments change; when one graduates, copy it out to its own repo. Each has `index.html`, `README.md` (what it tests, what worked, what didn't), `js/`, `data/`, `tests/`.
- `library/` — blueprints (characters, npcs, items, parties) shared across pages via localStorage + defaults JSON; "Sync to Claude" posts them to `tools/serve.py`, which writes `library/synced/library.json` (git-ignored) that Claude reads with the Read tool.

## Conventions (follow these when adding an experiment or prototype)

1. **One folder per experiment**, kebab-case name, with `index.html` as the entry point and a `README.md` for Claude + humans.
2. **No build step.** Plain HTML, standalone `.css` files, ES modules (`type="module"`). Third-party libs are vendored under `vendor/` (see `vendor/README.md` for licenses).
3. **Shared helpers** live in `shared/`: `style.css` (dark minimal UI), `ui.js` (knobs, selects, panels, JSON export/import, seeded rng), `store.js` (namespaced localStorage), `langdebug.js` (language debug mode: click words in spoken lines to see/override pronunciations, export/import/submit), `voices.js` (party voice system: a timbre per class/role on our formant engine, varied by seed — `voiceFor({ role, gender, seed })`), `character-schema.md` + `character.example.json` (the shared character JSON that experiments can read/write).
4. **Serve** with `./serve.sh --bg` (runs `tools/serve.py`: static files + the `/api/library/sync` and `/api/inbox/<name>` JSON endpoints) → `http://<LAN-IP>:8400/` (LAN IP via `hostname -I | awk '{print $1}'`). The user cannot open localhost links; always give the LAN URL.
5. **Tests**: Playwright specs in `tests/` (root) or `<experiment>/tests/`, run with `npm test`. Node unit tests (`node --test`) for pure logic.
6. **When adding an experiment**: create the folder, add a card to `index.html`, add a section to the table below, add a line to `~/claude/docs/playground.md`, and write the README. Keep this file's table current.
7. **Data first**: anything a game would reuse (presets, phrase libraries, part catalogs) goes in JSON or a plain data module, separate from UI code.
8. Visual polish is not a goal. Wide option coverage is.
9. **No third-party IP in player-facing text or data.** Other games (Diablo, WoW/Skada, Mii, Tomodachi Life, RimWorld…) may be named only in chat and in these Claude-facing docs. Invent original names for enemies, places, items and mechanics. Exception: the voice engines named in the voice lab UI (espeak, Piper) are fine.

## Experiments

| Folder | What it is | Status | Key files |
|---|---|---|---|
| `voice-lab/` | Synthetic character voices: 5 engines (**our own formant synthesizer** `js/engines/formant/`, packaged as a versioned module: `js/formant-voice.js` + `engines/formant/module.json` + CHANGELOG, v1.1.0 with CMUdict + letter-to-sound rules, see `voice-lab/FORMANT.md`; espeak via meSpeak; our babble gibberish synth; Piper neural; Web Speech; SAM removed 2026-09-10) with license badges + pros/cons, Tomodachi-style generic knobs (pitch/speed/depth/tone/breath/rough/flutter/intonation/wordgap), pure-JS effects chain, 31 presets, engine compare, crowd stress test, phoneme input, voice JSON | done 2026-09-09 | `voice-lab/README.md`, `voice-lab/FORMANT.md`, `js/voice.js` (API), `js/engines/*.js`, `js/engines/formant/{g2p,rules,phonemes,tracks,synth,index}.js`, `js/fx.js`, `js/dsp.js`, `data/presets.json`, `data/cmudict/` |
| `lingo/` | Text language system: `{placeholder.modifier}` templates with plural/select/random blocks, lexicon with explicit forms (sg/pl/adj/people/lang), pronoun sets, articles, verb agreement, pronunciation (respell → espeak phonemes), tag-scored grammar (530 phrases / 43 intents, dark tone), 25 RimWorld-style traits, sliders, Tomodachi custom slots, 14 verbal tics, anti-repeat, conversation planner, dictionary editor; **memory system** (trait-weighted importance, half-life decay, merging, relevance-based recall, 16 event types), **scene awareness** (place/tags/threats/danger → observe/fear/plan lines, planner bias) and **relationships** (multi-factor feelings + knowledge, trait-scaled events, memory hook, tone tags) | done 2026-09-10 | `lingo/README.md`, `lingo/MEMORY.md`, `lingo/RELATIONS.md`, `js/lingo.js`, `js/memory.js`, `js/context.js`, `js/relations.js`, `data/{lexicon,grammar,traits,speakers,events,scenes,relations}.json` |
| `avatar-2d/` | SVG paper-doll builder, chibi, 148 + ~85 gear parts (`js/parts/gear.js`: helmets, armour, capes, held weapons, off-hand items) across 17 slots, Mii-style face sliders, body height/width/headSize via group transforms, CSS-variable recolour, seeded random with race rules (7 races), 15 presets, gallery, PNG/SVG/JSON export | done 2026-09-09 | `avatar-2d/README.md`, `js/render.js`, `js/parts/*.js`, `js/random.js`, `data/presets.json` |
| `avatar-3d/` | Three.js builder reading the same JSON: Mii-style procedural body with the 2D face rasterized onto a face patch + procedural hair/hats/clothes + idle/walk/run/wave/talk/dead; Quaternius CC0 mode (2 bodies, 6 hairstyles, 2 outfit sets, 43 animation clips) with bone-scaled proportions; **creatures** (`creatures.html`): procedural wolf/boar/bear/rat/horse/deer/bat/spider/snake/drake/dragon bodies with idle/walk/run/attack/dead/fly, `creature` JSON section | done 2026-09-10 | `avatar-3d/README.md`, `js/mii.js`, `js/creatures.js`, `js/quaternius.js`, `js/face-texture.js`, `js/scene.js`, `assets/quaternius/` |
| `namegen/` | Name Forge: per-race languages (phonology + concept dictionary, 12 races, 268 tagged concepts), pattern grammar for people/factions/regions/settlements/landmarks/artifacts/mottos, glosses, forms (member/members/adj/people/short/possessive), respell pronunciation, Lingo lexicon export | done 2026-09-10 | `namegen/README.md`, `js/namegen.js`, `data/{languages,concepts,patterns}.json` |
| `items/` | Item Vault: ~340-item tagged catalog with race affinity weights + exclusives, materials/qualities/enchants, loot roller with Name Forge artifact names and lore, Lingo export | done 2026-09-10 | `items/README.md`, `js/items.js`, `data/{items,materials}.json`, `tools/build-items.py` |
| `library/` | Blueprint library: characters/npcs/items/parties as JSON, defaults seeded from the demos, localStorage for user entries, export/import, sync to Claude via the dev server | done 2026-09-10 | `library/README.md`, `js/library.js`, `data/defaults.json`, `tools/serve.py` |
| `conversations/` | Structured conversations on top of Lingo + memory (75 topics incl. callbacks, nemeses, companions, quests, 12 rare rewarding ones; 6 multi-day threads; variant generator): topics with asker/answerer/third roles, requirements (memories, gear with kill counts from the meter, better/worse than the replaced item, bag items ignored, party facts, traits, relations), variant lines with conditions, spoken through Lingo so personality applies; `factsFrom()` adapts a game's data | done 2026-09-11 | `conversations/README.md`, `js/conversations.js`, `data/topics.json` |
| `meters/` | Skada-style damage meter: record every hit/heal/miss/absorb/status/death (source, target, via, type, crit, overkill, blocked/mitigated/absorbed, overheal, killing blow, item), drill down actor → source → hit with per-target totals and sparklines, damage/healing/taken/absorbs/statuses/deaths modes, per-fight or whole run, per-item kill counts; drop-in UI component | done 2026-09-11 | `meters/README.md`, `js/meter.js`, `js/meter-ui.js` |
| `combined/` | Character sheet: two full characters (avatar+voice+speech) in one 3D scene, talking with generated lines, their own voices and talk animation; scene picker + memory roller/clock feeding the conversation; random full characters; JSON round-trip | done 2026-09-10 | `combined/README.md`, `js/app.js`, `data/characters.json` |

## Prototypes

| Folder | What it tests | Status |
|---|---|---|
| `prototypes/emberveil/` | **Emberveil 2**: rebuild of the user's Emberveil RPG (`~/claude/emberveil`, read-only source): data copied by `tools/build-emberveil-data.mjs` (+ `expand-emberveil-map.mjs`, zones ~50% longer), 30 classes as Mii characters, loot with affixes/uniques/sets (`js/loot.js`), stats/talents/passives (`js/rules.js`), auto-battle simulator with meter records (`js/combat.js`), world map + events + towns + travel days/supplies/vehicles/night attacks/rest (`js/game.js`), memories + relations + our formant voices, camp conversations with callbacks (conversations/), damage meter tab (meters/), named enemies + nemeses (`data/named-enemies.json`, original names only), side quests, hero errands (`data/class-quests.json`), conversation threads + rare rewards, journal, companion memories, party voices (`shared/voices.js`), language debug mode, map layout + icons, Lingo pack `lingo/data/packs/emberveil.json` | done 2026-09-11 |
| `prototypes/party-quest/` | Party of 4 (library/defaults/custom), race + class without stats, auto-battle with reactive dialog (beasts are creature bodies and only snarl), text-adventure travel with events and a minigame, town NPCs with disposition + deeds + quests + shop, day/night with campfire conversations from memories/relations, Mii 3D cinematic stage, save NPCs to the library | done 2026-09-10 |

## Tests
`npm test` (Playwright, serial: specs across all experiments incl. headless WebGL + audio synthesis) and `npm run test:unit` (25 node tests: lingo engine + data validation, avatar-2d renderer/random). Screenshots land in `test-results/`.

## Building a game from this
Read **`GAME-GUIDE.md`**: what each piece gives you, import lines, data it needs, runtime cost, licenses, and recipes (talking NPC with memory + feelings, world generation, crowds).

## Shared character JSON

All experiments read and write sections of one character document (see `shared/character-schema.md`). Each section is independent: a game may use only `avatar`, only `voice`, or only `speech`.

```json
{ "schema": 1, "name": "…", "avatar": { … }, "voice": { … }, "speech": { … } }
```

## Research notes

`docs/research-*.md` hold the research done before building (voice engines, language systems, avatar assets) including licenses and rejected options. Read them before changing an engine or asset source.
