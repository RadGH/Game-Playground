# Voice Lab

Browser-only synthetic character voices, inspired by Tomodachi Life's voice editor. Compare five engines (including our own bespoke formant synthesizer, see `FORMANT.md`), tune generic knobs, add effects, save presets, and stress-test crowds. Everything a game needs is in `js/voice.js`; `js/app.js` is only the demo UI.

Open: `http://<LAN-IP>:8400/voice-lab/` (start `./serve.sh --bg` in the playground root).

## Quick use from a game

```js
import { say, synthesize, play, stopAll, DEFAULT_VOICE } from '/voice-lab/js/voice.js';

const voice = { ...DEFAULT_VOICE, engine: 'espeak', pitch: 0.8, depth: 0.2, gender: 'f' };  // or a preset's .voice
await say('Hi there, how are you doing today?', voice);          // synthesize (cached) + play

// crowd: render first, then schedule many at once
const line = await synthesize('Get off my turnips!', voice);      // { samples, sampleRate, duration, info }
play(line, { when: 0.5, pan: -0.6, volume: 0.7 });
stopAll();
```

`synthesize` caches by (text, voice) so repeated lines are free. Engines that cannot produce audio buffers (Web Speech) only work through `say`.

## The voice JSON (the `voice` section of the shared character JSON)

```json
{
  "engine": "formant",         // formant (ours) | kokoro | espeak | babble | piper | webspeech
  "pitch": 0.5,   "speed": 0.3, "depth": 0.5, "tone": 0.5,   // 0..1 generic knobs (see table)
  "breath": 0.1,  "rough": 0.1, "flutter": 0.1, "intonation": 2, "wordgap": 0,
  "gender": "m",               // m | f | n  (espeak base pitch range)
  "accent": "en-us",           // espeak: en-us | en | en-rp | en-sc | en-n | en-wm
  "variant": "custom",         // espeak: custom (use knobs) or built-in m1..m7 f1..f5 croak whisper whisperf klatt*; piper: voice id; kokoro: voice id (af_heart, bm_george…); webspeech: OS voice name
  "kokoroMix": "am_onyx", "kokoroMixAmt": 0.45,   // kokoro only: blend a second voice in (0 = none, 1 = only the second)
  "babbleMode": "letters",     // babble: letters | syllables | simlish
  "fx": { "pitchShift": 0, "formant": 0, "robot": 0.8, "robotHz": 55 }   // see Effects
}
```

Unknown fields are ignored; missing fields take `DEFAULT_VOICE`. `normalizeVoice()` clamps ranges.

### Generic knobs and how each engine maps them

| Knob | Meaning | formant (ours) | espeak | babble | piper | Web Speech |
|---|---|---|---|---|---|---|
| `pitch` 0..1 | low → high | f0 = gender base × 2.6^(pitch−0.5) | `-p 0..99` | f0 90→405 Hz | fx pitchShift −8..+8 st | pitch 0..2 |
| `speed` 0..1 | slow → fast | duration ÷ 0.55..2.05 | 80→400 wpm | 130→35 ms per letter | fx speed 0.6→1.5 | rate 0.5→2.2 |
| `depth` 0..1 | tiny vocal tract → giant | vocal-tract scale 1.28→0.72 (all formants) | all formant freqs 125%→75% | formant scale 1.3→0.7 | fx formant +4→−4 st | – |
| `tone` 0..1 | dull → bright | spectral tilt | upper formant strength 40%→160%, consonant strength | filter brightness | – | – |
| `breath` 0..1 | breathiness | aspiration + open quotient | `breath` per formant 0→10 | noise mix | – | – |
| `rough` 0..1 | gravel | jitter + shimmer | `roughness` 0→7 | per-syllable pitch jitter | – | – |
| `flutter` 0..1 | wobble (elderly) | slow f0 wobble | `flutter` 0→20 | – | – | – |
| `intonation` 1..4 | flat → sing-song | contour strength | espeak intonation 1–4 | contour amount | – | – |
| `wordgap` 0..1 | pause between words | up to 220 ms | `-g 0..20` | 40→240 ms | – | – |

Tomodachi Life mapping: Pitch→`pitch`, Speed→`speed`, Quality→`depth`+`breath`, Tone→`tone`, Accent→`accent` (espeak only), Intonation→`intonation`.

### Effects (`fx`) — applied to PCM after synthesis, any engine with a buffer

`pitchShift` (semitones, pitch only, WSOLA), `formant` (semitones, vocal-tract size only), `speed` (duration only), `chipmunk` (raw resample: pitch+size+duration, cheapest), `bright` (−1..1 tilt), `highpass`/`lowpass` (Hz, 0 = off), `robot` + `robotHz` (ring mod), `vibrato` + `vibratoHz`, `tremolo` + `tremoloHz`, `lofi` (bitcrush), `chorus`, `echo` + `echoSec`, `reverb` + `reverbSize`, `gain`. Defaults in `js/fx.js` `FX_DEFAULTS`. Order: size/pitch → colour → modulation → space.

The DSP is pure JS on `Float32Array` (`js/dsp.js`) so it can run in a worker: `resample`, `timeStretch` (WSOLA), `pitchShift`, `formantShift`, `ringMod`, `bitcrush`, `vibrato`, `tremolo`, `echo`, `chorus`, `reverb` (Schroeder), `tilt`, `Biquad`, `decodeWav`, `encodeWav`.

## Engines (`js/engines/*.js`)

| id | What | License | Commercial | Buffer | Phonemes | Crowd cost |
|---|---|---|---|---|---|---|
| `formant` | **Ours**: rule-based formant synthesizer (CMUdict + letter-to-sound rules → Klatt-style resonators). See `FORMANT.md`. | ours (MIT-style) + CMUdict BSD | **yes** | yes | ARPAbet `[[HH AH0 L OW1]]` or espeak `[[h@l'oU]]` | very cheap |
| `espeak` | meSpeak.js (espeak 1.47, asm.js). Custom voice-variant file generated from knobs. | **GPL-3.0** | yes | `[[h@l'oU]]` espeak ASCII | very cheap |
| `babble` | Our own Animalese/Simlish gibberish synth (formant filters on a pulse) | ours | yes | n/a (letters) | near zero; hundreds at once |
| `piper` | Piper VITS neural via ONNX Runtime Web (vits-web; `onnxruntime-web` resolved through an importmap to `vendor/onnxruntime-web/ort.min.mjs`; model cache patched to IndexedDB because the original OPFS cache only works on https/localhost, so over LAN http it re-downloaded every time) | MIT + per-voice | yes | no | seconds per line; not real-time |
| `kokoro` | Kokoro-82M neural via kokoro-js 1.2.1 (transformers.js + ONNX Runtime Web) in a Web Worker (`js/engines/kokoro-worker.js`). Model, voices and runtime wasm load from `vendor/kokoro/models/` (git-ignored, `tools/fetch-kokoro.sh`), falling back to Hugging Face / jsDelivr. 28 English voices, blend any two. Speed is native; pitch/depth are gentle post-effects. CPU (wasm) or WebGPU (https only, falls back to CPU if no adapter) | Apache-2.0 model+code, **eSpeak NG phonemizer is GPL-3.0** | conditional | no | 5–10 s per 4 s line on the dev VM's CPU (single thread), ~5.5 s with threads; native fp32 ~1.5 s |
| `webspeech` | Browser/OS voices | built-in | **no** | no | one at a time, no mixing |

Each module exports `meta` (license, pros/cons, knob support), `load()`, and `synth(text, voice) → { samples, sampleRate, info }` (or `speakDirect` for Web Speech). Add an engine by dropping a module in `engines/` and registering it in `engines/index.js`.

### espeak variant file
`buildVariant(voice)` writes an espeak voice-variant text (`formant N freq strength width`, `breath`, `roughness`, `flutter`, `intonation`, `consonants`). It is registered under a content-hashed name because meSpeak's in-memory filesystem cannot overwrite files. The demo prints the generated file under the waveform so you can see exactly what the knobs did.

### Babble details
`tokenize(text, mode)` turns text into vowel/consonant/gap/pause units. Vowels → sawtooth pulse through three band-pass formant filters (a/e/i/o/u tables); plosives → silence + noise burst; fricatives → filtered noise; nasals/liquids → voiced with their own formants. Pitch contour: declination across the sentence, rise before `?`, bump before `!`, stress on the first vowel of each word, jitter from `rough`. `simlish` mode hashes each word to 1–4 fixed nonsense syllables so a word always sounds the same. Output is deterministic per (text, knobs) except for the noise source.

## Presets (`data/presets.json`)

31 presets in groups Human / Age / Fantasy / Machine / Babble (child, teen, adult, elder × gender, announcer, nasal, gruff, drunk, giant, fairy, creature, ghost, alien, undead, robot, megaphone, SAM manual presets, Animalese, Simlish, monster/fairy babble, Piper natural voices). Each has `voice` knobs + optional `fx` + a recommended `engine`. "Preset also switches engine" can be turned off in the UI to hear the same knobs on another engine.

## Demo features
- Engine list with license badges (green = commercial OK, orange = GPL, red = not usable commercially) and pros/cons.
- Knobs, gender/accent/variant, babble mode, Piper voice download with progress.
- Waveform, synthesis time, effect summary, generated espeak variant file.
- **Compare engines**: same line on every engine with synthesis time.
- **Crowd stress test**: N random NPC lines with random presets (or a chosen engine: formant, espeak, babble, piper), CPU time per line, all played overlapping with random pan. Playback cost is the same for every engine; synthesis cost differs: formant/babble ≈ 10–80 ms per line, espeak ≈ 300 ms, piper ≈ 2–8 s. So formant and babble are fine for live crowds, espeak for a few, and Piper only if lines are pre-rendered ahead of time.
- Phoneme cheat sheet; comparison table.
- Voice JSON panel: apply / copy / export / import / save to browser (localStorage, namespace `playground:voice-lab:v1`).

## Findings so far (2026-09)
- Our own formant engine (2026-09-10) removes the license question: it is the default engine now. Quality is espeak-class; tune tables in `js/engines/formant/phonemes.js` and rules in `rules.js` (see `FORMANT.md`).
- espeak is the only engine with real timbre knobs; it is also GPL. Decide before shipping: accept GPL, or use it only to prototype and switch to babble/pre-rendered audio.
- SAM (the 1982 C64 synth) was tried and removed on 2026-09-10: unlicensed and unintelligible at the knob ranges we need.
- Babble is the practical answer for crowds and invented languages; pair it with subtitles from lingo.
- Neural TTS (Piper) is for cutscenes or a single hero line, never for simulation crowds on CPU.
- Web Speech is convenient but not portable (voices differ per machine) and cannot be mixed or processed.

## Tests
`npm test -- voice-lab` (Playwright): page loads clean, each engine synthesizes, effects produce finite non-silent audio, child preset pitch > giant pitch per engine, babble modes, phoneme input, preset application.

## Files
- `index.html`, `voice-lab.css`, `js/app.js` — demo UI
- `js/voice.js` — public API (synthesize/play/say/cache)
- `js/fx.js`, `js/dsp.js` — effects + DSP
- `js/engines/{espeak,babble,piper,kokoro,kokoro-worker,webspeech,index}.js`
- `data/presets.json`
- `tests/voice-lab.spec.js`

## Kokoro (neural, added 2026-11-04)

**Default: the Kokoro voice service.** Running the model inside the browser turned out to be 10–35 s per line on plain-http pages and does not start at all on an iPhone (tested 2026-11-04, Radley's phone over the tailnet). So by default the page sends the text to a small service on the VM and plays back the WAV:

- `voice-lab/server/kokoro-server.mjs` — Node + kokoro-js (native ONNX Runtime, fp32), listens on `127.0.0.1:8402`. `POST /tts {text, voice, mix, mixAmt, speed}` → 24 kHz WAV with `X-Synth-Ms` / `X-Cache` / `X-Phonemes` headers; `GET /health`. One request at a time; every clip is cached on disk in `voice-lab/server/cache/` (git-ignored, 5,000 files max), so a repeated line costs ~10 ms. Request checking lives in `server/request.mjs` (unit tests: `tests/kokoro-request.test.js`). `server/kokoro-node.js` is kokoro-js's node build with one extra export line (phonemize + voice cache, for blending).
- `tools/serve.py` forwards `/api/kokoro/*` to it, so the page uses its own address and port (works over LAN, tailnet, http and https).
- Runs as the user service `kokoro-tts` (`tools/kokoro-tts.service`; install steps at the top of that file). Setup on a fresh machine: `(cd voice-lab/server && npm install)`, `tools/fetch-kokoro.sh fp32`, then enable the service.
- Speed measured 2026-11-04 on the busy dev VM: ~0.7–3 s for a new line (2.7 s for 8.9 s of speech), ~10 ms for a cached one; 0.7 s round trip from an emulated iPhone.
- "Runs on" in Engine options switches back to in-browser (CPU / WebGPU) for comparison.

In-browser mode (the original version, still available):

The first engine in the lab that sounds like a real person rather than a synthesizer. Pick it in the engine list or use the **Kokoro** preset group (stock voices plus blends: Innkeeper, Old wizard, Sly merchant, Queen, Young scout, Child, Giant).

- **Setup:** `tools/fetch-kokoro.sh` downloads the q8 model (~92 MB), the 28 English voices and the ONNX runtime wasm into `vendor/kokoro/models/` (`fp32` argument adds the 326 MB full model). Safe to run more than once. Without it the engine downloads the same files from Hugging Face on first use. The stable worktree gets a symlink to the dev copy.
- **Speed (measured 2026-11-04 on the dev VM, 4 s line):** single-threaded wasm (any plain-http LAN page) ~7–10 s; multi-threaded wasm ~5.5 s; native node fp32 ~1.5 s. q8 and fp32 cost the same in the browser. Threads need a *cross-origin isolated* page: `tools/serve.py` sends `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless` for `/voice-lab/` and `/vendor/kokoro/` only, and the browser also requires a secure page (https ports 8441/8442, or localhost). WebGPU has the same https requirement.
- **Voice blending:** a Kokoro voice is a table of style vectors; mixing two tables (`kokoroMix` + `kokoroMixAmt`) gives a new, stable voice, so every NPC can have its own without new model files. The vendored `vendor/kokoro/kokoro.web.js` is patched to export `transformersEnv`, `phonemize` and `voiceCache` for this.
- **License:** model weights and kokoro-js are Apache-2.0. The text → phoneme step is eSpeak NG compiled to WebAssembly (GPL-3.0), so a closed-source commercial game should replace it (our CMU dictionary in `data/cmudict/` mapped to Kokoro's IPA is the obvious swap).
- **Limits:** ~510 phoneme tokens per call (long text is split by sentence automatically); invented fantasy words are guessed by eSpeak's spelling rules.


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

Synthetic character voices: 5 engines (**our own formant synthesizer** `js/engines/formant/`, packaged as a versioned module: `js/formant-voice.js` + `engines/formant/module.json` + CHANGELOG, v1.1.0 with CMUdict + letter-to-sound rules, see `voice-lab/FORMANT.md`; espeak via meSpeak; our babble gibberish synth; Piper neural; Web Speech; SAM removed 2026-09-10) with license badges + pros/cons, Tomodachi-style generic knobs (pitch/speed/depth/tone/breath/rough/flutter/intonation/wordgap), pure-JS effects chain, 31 presets, engine compare, crowd stress test, phoneme input, voice JSON

**Status / key files:** done 2026-09-09

**Status / key files:** `voice-lab/README.md`, `voice-lab/FORMANT.md`, `js/voice.js` (API), `js/engines/*.js`, `js/engines/formant/{g2p,rules,phonemes,tracks,synth,index}.js`, `js/fx.js`, `js/dsp.js`, `data/presets.json`, `data/cmudict/`
