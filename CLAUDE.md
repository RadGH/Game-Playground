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
| `voice-lab/` | Synthetic character voices: engine comparison (Web Speech, espeak via meSpeak, SAM, syllable babble, Piper neural), Tomodachi-style knobs, Web Audio effects chain, presets, crowd stress test, voice JSON | in progress | `voice-lab/README.md`, `voice-lab/js/engines/*.js`, `voice-lab/js/fx.js`, `voice-lab/data/presets.json` |
| `lingo/` | Text language system: `{placeholder.modifier}` templates, weighted/tagged grammar, game-defined lexicon with singular/plural/possessive/adjective forms, pronoun sets, personality sliders + trait tags + custom slots, conversation simulator, pronunciation field | in progress | `lingo/README.md`, `lingo/js/lingo.js` (engine), `lingo/data/*.json` |
| `avatar-2d/` | SVG paper-doll builder, chibi proportions, part catalog, body height/width via group transforms, presets/random/save/export | in progress | `avatar-2d/README.md`, `avatar-2d/js/parts/*.js` |
| `avatar-3d/` | Three.js builder: procedural Mii-style mode and Quaternius CC0 modular-mesh mode, idle/walk animation | in progress | `avatar-3d/README.md`, `avatar-3d/assets/quaternius/` |
| `combined/` | Character sheet tying avatar + voice + lingo together | in progress | `combined/README.md` |

## Shared character JSON

All experiments read and write sections of one character document (see `shared/character-schema.md`). Each section is independent: a game may use only `avatar`, only `voice`, or only `speech`.

```json
{ "schema": 1, "name": "…", "avatar": { … }, "voice": { … }, "speech": { … } }
```

## Research notes

`docs/research-*.md` hold the research done before building (voice engines, language systems, avatar assets) including licenses and rejected options. Read them before changing an engine or asset source.
