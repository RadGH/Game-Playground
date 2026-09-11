# Formant voice module — changelog

Semantic versions. Bump **major** when the voice JSON knobs change meaning or an old voice sounds different; **minor** when new knobs/pronunciation features are added; **patch** for bug fixes and dictionary updates.

## 1.1.0 — 2026-09-11
- Packaged as a module: `voice-lab/js/formant-voice.js` stable entry (`load`, `synthesize`, `say`, `VERSION`, `meta`), `module.json`, this changelog.
- Used as the default voice for every hero and NPC in Emberveil 2 and Party Quest.

## 1.0.0 — 2026-09-10
- First release: g2p (CMUdict + NRL rules + `[[ARPAbet]]` blocks), acoustic tables, prosody/coarticulation frames, Klatt-style cascade/parallel synth, knob mapping, presets `ours_*`.
