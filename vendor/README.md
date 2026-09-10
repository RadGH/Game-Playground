# Vendored third-party libraries

| Folder | Library | Version | License | Commercial use | Notes |
|---|---|---|---|---|---|
| `three/` | Three.js (+ addons GLTFLoader, OrbitControls, SkeletonUtils, BufferGeometryUtils, GLTFExporter) | see `three.module.js` header | MIT | yes | Import via importmap `"three": "/vendor/three/three.module.js"`, addons import `three` so the importmap is required. |
| `mespeak/` | meSpeak.js (espeak 1.47 compiled to asm.js) — bundled from npm `mespeak` with a small patch adding `addVariant(name, text)` + `listVariants()` | 2.0.2 / meSpeak 1.9.6 | **GPL-3.0** | only if the game is GPL-compatible, or replace engine before shipping | Global `meSpeak`. Config `mespeak_config.json`, voices in `voices/`. Synthesizes to WAV bytes (`rawdata`). |
| `espeak-ng/` | espeak-ng CLI compiled to WASM (npm `espeak-ng` 1.0.2) | 1.0.2 | **GPL-3.0** | same as above | 18 MB. Used only to turn text into IPA phonemes (`--ipa`). Lazy-loaded. |
| `vits-web/` | @diffusionstudio/vits-web (Piper VITS TTS via ONNX Runtime Web) | 1.0.3 | MIT (voices: mostly permissive, check each model card) | yes | Loads onnxruntime from cdnjs and voice models from Hugging Face at runtime; needs internet on first use, then caches in the browser. |
| `onnxruntime-web/` | ONNX Runtime Web ESM bundle (needed by vits-web; the `.wasm` backends are still fetched from cdnjs at runtime) | 1.18.0 | MIT | yes | Mapped via importmap `onnxruntime-web` in `voice-lab/index.html`. |
| `pluralize/` | pluralize | 8.x | MIT | yes | English plural/singular rules, used by lingo as a fallback when a lexicon entry has no explicit plural. |

Asset packs (models/textures) are documented next to the assets, e.g. `avatar-3d/assets/quaternius/` (CC0).
