# Playground — experiments for future games

This directory holds standalone experiments and prototypes. Future games built with Claude Code will read this directory, so every experiment must have a thorough `README.md` explaining its mechanisms, data formats, and how to reuse the code.

Owner: Radley Sustaire (independent project). Sandbox: auto-commit freely, no remote yet.

## Conventions (follow these when adding an experiment)

1. **One folder per experiment**, kebab-case name, with `index.html` as the entry point and a `README.md` for Claude + humans.
2. **No build step.** Plain HTML, standalone `.css` files, ES modules (`type="module"`). Third-party libs are vendored under `vendor/` (see `vendor/README.md` for licenses).
3. **Shared helpers** live in `shared/`: `style.css` (dark minimal UI), `ui.js` (knobs, selects, panels, JSON export/import, seeded rng), `store.js` (namespaced localStorage), `character-schema.md` + `character.example.json` (the shared character JSON that experiments can read/write).
4. **Serve** with `./serve.sh --bg` → `http://<LAN-IP>:8400/` (LAN IP via `hostname -I | awk '{print $1}'`). The user cannot open localhost links; always give the LAN URL.
5. **Tests**: Playwright specs in `tests/` (root) or `<experiment>/tests/`, run with `npm test`. Node unit tests (`node --test`) for pure logic.
6. **When adding an experiment**: create the folder, add a card to `index.html`, add a section to the table below, add a line to `~/claude/docs/playground.md`, and write the README. Keep this file's table current.
7. **Data first**: anything a game would reuse (presets, phrase libraries, part catalogs) goes in JSON or a plain data module, separate from UI code.
8. Visual polish is not a goal. Wide option coverage is.

## Experiments

| Folder | What it is | Status | Key files |
|---|---|---|---|
| `voice-lab/` | Synthetic character voices: 5 engines (espeak via meSpeak, SAM, our babble synth, Piper neural, Web Speech) with license badges + pros/cons, Tomodachi-style generic knobs (pitch/speed/depth/tone/breath/rough/flutter/intonation/wordgap), pure-JS effects chain, 31 presets, engine compare, crowd stress test, phoneme input, voice JSON | done 2026-09-09 | `voice-lab/README.md`, `js/voice.js` (API), `js/engines/*.js`, `js/fx.js`, `js/dsp.js`, `data/presets.json` |
| `lingo/` | Text language system: `{placeholder.modifier}` templates with plural/select/random blocks, lexicon with explicit forms (sg/pl/adj/people/lang), pronoun sets, articles, verb agreement, pronunciation (respell → espeak phonemes), tag-scored grammar (530 phrases / 43 intents, dark tone), 25 RimWorld-style traits, sliders, Tomodachi custom slots, 15 verbal tics, anti-repeat, conversation planner, dictionary editor | done 2026-09-09 | `lingo/README.md`, `js/lingo.js` (engine), `js/morph.js`, `data/{lexicon,grammar,traits,speakers}.json` |
| `avatar-2d/` | SVG paper-doll builder, chibi, 148 hand-authored parts across 14 slots, Mii-style face sliders, body height/width/headSize via group transforms, CSS-variable recolour, seeded random with race rules (7 races), 15 presets, gallery, PNG/SVG/JSON export | done 2026-09-09 | `avatar-2d/README.md`, `js/render.js`, `js/parts/*.js`, `js/random.js`, `data/presets.json` |
| `avatar-3d/` | Three.js builder reading the same JSON: Mii-style procedural body with the 2D face rasterized onto a face patch + procedural hair/hats/clothes + idle/walk/run/wave/talk/dead; Quaternius CC0 mode (2 bodies, 6 hairstyles, 2 outfit sets, 43 animation clips) with bone-scaled proportions | done 2026-09-09 | `avatar-3d/README.md`, `js/mii.js`, `js/quaternius.js`, `js/face-texture.js`, `js/scene.js`, `assets/quaternius/` |
| `combined/` | Character sheet: two full characters (avatar+voice+speech) in one 3D scene, talking with generated lines, their own voices and talk animation; random full characters; JSON round-trip | done 2026-09-09 | `combined/README.md`, `js/app.js`, `data/characters.json` |

## Tests
`npm test` (Playwright, serial, ~40 s: 19 specs across all experiments incl. headless WebGL + audio synthesis) and `npm run test:unit` (25 node tests: lingo engine + data validation, avatar-2d renderer/random). Screenshots land in `test-results/`.

## Shared character JSON

All experiments read and write sections of one character document (see `shared/character-schema.md`). Each section is independent: a game may use only `avatar`, only `voice`, or only `speech`.

```json
{ "schema": 1, "name": "…", "avatar": { … }, "voice": { … }, "speech": { … } }
```

## Research notes

`docs/research-*.md` hold the research done before building (voice engines, language systems, avatar assets) including licenses and rejected options. Read them before changing an engine or asset source.
