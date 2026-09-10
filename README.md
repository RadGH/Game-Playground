# Playground

Experiments and prototypes that future games will reuse. Each folder is standalone; `CLAUDE.md` holds the conventions and the experiment table (read that first if you are Claude).

| Experiment | What | Open |
|---|---|---|
| `voice-lab/` | Browser synthetic character voices (Tomodachi-style knobs), 5 engines with license flags, effects, presets, crowd test | `/voice-lab/` |
| `lingo/` | Phrase-template language system with a game dictionary, personality traits/sliders/catchphrases, conversation simulator | `/lingo/` |
| `avatar-2d/` | SVG paper-doll character builder (148 parts, Mii-style face sliders, race-rule random, presets) | `/avatar-2d/` |
| `avatar-3d/` | Three.js builder: procedural Mii-style body + Quaternius CC0 modular meshes with animations | `/avatar-3d/` |
| `combined/` | Character sheet: avatar + voice + speech together, two characters talking | `/combined/` |

## Run
```
./serve.sh --bg          # static server on port 8400 → http://<LAN-IP>:8400/
npm install              # once, for Playwright
npm test                 # all Playwright specs (each experiment has tests/)
npm run test:unit        # node unit tests (lingo engine + data, avatar-2d renderer)
```

## Shared pieces
- `shared/style.css`, `shared/ui.js`, `shared/store.js` — tiny UI kit and localStorage wrapper used by every demo.
- `shared/character-schema.md` + `shared/character.example.json` — the character JSON: `{ schema, name, avatar, voice, speech }`; each section is optional and owned by one experiment.
- `vendor/` — third-party libraries with licenses listed in `vendor/README.md` (Three.js MIT, meSpeak/espeak GPL-3, sam-js unlicensed, vits-web MIT, pluralize MIT).
- `docs/research-*.md` — the research that shaped the design (engines, language systems, asset licenses).

Owner: Radley Sustaire. Sandbox project; local git only for now.
