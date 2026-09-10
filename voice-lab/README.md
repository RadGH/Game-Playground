# Voice Lab

Browser-only synthetic character voices, inspired by Tomodachi Life's voice editor. Compare five engines, tune generic knobs, add effects, save presets, and stress-test crowds. Everything a game needs is in `js/voice.js`; `js/app.js` is only the demo UI.

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
  "engine": "espeak",          // espeak | sam | babble | piper | webspeech
  "pitch": 0.5,   "speed": 0.3, "depth": 0.5, "tone": 0.5,   // 0..1 generic knobs (see table)
  "breath": 0.1,  "rough": 0.1, "flutter": 0.1, "intonation": 2, "wordgap": 0,
  "gender": "m",               // m | f | n  (espeak base pitch range)
  "accent": "en-us",           // espeak: en-us | en | en-rp | en-sc | en-n | en-wm
  "variant": "custom",         // espeak: custom (use knobs) or built-in m1..m7 f1..f5 croak whisper whisperf klatt*; piper: voice id; webspeech: OS voice name
  "sing": false,               // sam only
  "babbleMode": "letters",     // babble: letters | syllables | simlish
  "fx": { "pitchShift": 0, "formant": 0, "robot": 0.8, "robotHz": 55 }   // see Effects
}
```

Unknown fields are ignored; missing fields take `DEFAULT_VOICE`. `normalizeVoice()` clamps ranges.

### Generic knobs and how each engine maps them

| Knob | Meaning | espeak | SAM | babble | piper | Web Speech |
|---|---|---|---|---|---|---|
| `pitch` 0..1 | low → high | `-p 0..99` | pitch 200→20 (inverted scale) | f0 90→405 Hz | fx pitchShift −8..+8 st | pitch 0..2 |
| `speed` 0..1 | slow → fast | 80→400 wpm | speed 180→20 | 130→35 ms per letter | fx speed 0.6→1.5 | rate 0.5→2.2 |
| `depth` 0..1 | tiny vocal tract → giant | all formant freqs 125%→75% | throat 0→255 | formant scale 1.3→0.7 | fx formant +4→−4 st | – |
| `tone` 0..1 | dull → bright | upper formant strength 40%→160%, consonant strength | mouth 0→255 | filter brightness | – | – |
| `breath` 0..1 | breathiness | `breath` per formant 0→10 | – | noise mix | – | – |
| `rough` 0..1 | gravel | `roughness` 0→7 | – | per-syllable pitch jitter | – | – |
| `flutter` 0..1 | wobble (elderly) | `flutter` 0→20 | – | – | – | – |
| `intonation` 1..4 | flat → sing-song | espeak intonation 1–4 | – | contour amount | – | – |
| `wordgap` 0..1 | pause between words | `-g 0..20` | – | 40→240 ms | – | – |

Tomodachi Life mapping: Pitch→`pitch`, Speed→`speed`, Quality→`depth`+`breath`, Tone→`tone`, Accent→`accent` (espeak only), Intonation→`intonation`.

### Effects (`fx`) — applied to PCM after synthesis, any engine with a buffer

`pitchShift` (semitones, pitch only, WSOLA), `formant` (semitones, vocal-tract size only), `speed` (duration only), `chipmunk` (raw resample: pitch+size+duration, cheapest), `bright` (−1..1 tilt), `highpass`/`lowpass` (Hz, 0 = off), `robot` + `robotHz` (ring mod), `vibrato` + `vibratoHz`, `tremolo` + `tremoloHz`, `lofi` (bitcrush), `chorus`, `echo` + `echoSec`, `reverb` + `reverbSize`, `gain`. Defaults in `js/fx.js` `FX_DEFAULTS`. Order: size/pitch → colour → modulation → space.

The DSP is pure JS on `Float32Array` (`js/dsp.js`) so it can run in a worker: `resample`, `timeStretch` (WSOLA), `pitchShift`, `formantShift`, `ringMod`, `bitcrush`, `vibrato`, `tremolo`, `echo`, `chorus`, `reverb` (Schroeder), `tilt`, `Biquad`, `decodeWav`, `encodeWav`.

## Engines (`js/engines/*.js`)

| id | What | License | Commercial | Buffer | Phonemes | Crowd cost |
|---|---|---|---|---|---|---|
| `espeak` | meSpeak.js (espeak 1.47, asm.js). Custom voice-variant file generated from knobs. | **GPL-3.0** | conditional | yes | `[[h@l'oU]]` espeak ASCII | very cheap |
| `sam` | Software Automatic Mouth (1982 C64) JS port | **none / abandonware** | **no** | yes | `[[...]]` SAM phonemes | near zero |
| `babble` | Our own Animalese/Simlish gibberish synth (formant filters on a pulse) | ours | yes | yes | n/a (letters) | near zero; hundreds at once |
| `piper` | Piper VITS neural via ONNX Runtime Web (vits-web) | MIT + per-voice | yes | yes | no | seconds per line; not real-time |
| `webspeech` | Browser/OS voices | built-in | yes | **no** | no | one at a time, no mixing |

Each module exports `meta` (license, pros/cons, knob support), `load()`, and `synth(text, voice) → { samples, sampleRate, info }` (or `speakDirect` for Web Speech). Add an engine by dropping a module in `engines/` and registering it in `engines/index.js`.

### espeak variant file
`buildVariant(voice)` writes an espeak voice-variant text (`formant N freq strength width`, `breath`, `roughness`, `flutter`, `intonation`, `consonants`). It is registered under a content-hashed name because meSpeak's in-memory filesystem cannot overwrite files. The demo prints the generated file under the waveform so you can see exactly what the knobs did.

### Babble details
`tokenize(text, mode)` turns text into vowel/consonant/gap/pause units. Vowels → sawtooth pulse through three band-pass formant filters (a/e/i/o/u tables); plosives → silence + noise burst; fricatives → filtered noise; nasals/liquids → voiced with their own formants. Pitch contour: declination across the sentence, rise before `?`, bump before `!`, stress on the first vowel of each word, jitter from `rough`. `simlish` mode hashes each word to 1–4 fixed nonsense syllables so a word always sounds the same. Output is deterministic per (text, knobs) except for the noise source.

## Presets (`data/presets.json`)

31 presets in groups Human / Age / Fantasy / Machine / Babble (child, teen, adult, elder × gender, announcer, nasal, gruff, drunk, giant, fairy, creature, ghost, alien, undead, robot, megaphone, SAM manual presets, Animalese, Simlish, monster/fairy babble, Piper natural voices). Each has `voice` knobs + optional `fx` + a recommended `engine`. "Preset also switches engine" can be turned off in the UI to hear the same knobs on another engine.

## Demo features
- Engine list with license badges (green = commercial OK, orange = GPL, red = not usable commercially) and pros/cons.
- Knobs, gender/accent/variant, babble mode, SAM sing mode, Piper voice download with progress.
- Waveform, synthesis time, effect summary, generated espeak variant file.
- **Compare engines**: same line on every engine with synthesis time.
- **Crowd stress test**: N random NPC lines with random presets, CPU time per line, all played overlapping with random pan. This answers "how many characters can talk at once": espeak/SAM/babble handle dozens; Piper cannot.
- Phoneme cheat sheet; comparison table.
- Voice JSON panel: apply / copy / export / import / save to browser (localStorage, namespace `playground:voice-lab:v1`).

## Findings so far (2026-09)
- espeak is the only engine with real timbre knobs; it is also GPL. Decide before shipping: accept GPL, or use it only to prototype and switch to babble/pre-rendered audio.
- SAM is fun but unlicensed. Prototype only. Its `pitch` value maps to f0 roughly as 30 → 380 Hz, 64 → 130 Hz, and above ~120 it degrades into a buzz; `throat` raises formant 1 (so deep voices need a LOW throat), `mouth` raises formant 2. Automated pitch measurement on SAM output is unreliable, trust your ears.
- Babble is the practical answer for crowds and invented languages; pair it with subtitles from lingo.
- Neural TTS (Piper) is for cutscenes or a single hero line, never for simulation crowds on CPU.
- Web Speech is convenient but not portable (voices differ per machine) and cannot be mixed or processed.

## Tests
`npm test -- voice-lab` (Playwright): page loads clean, each engine synthesizes, effects produce finite non-silent audio, child preset pitch > giant pitch per engine, babble modes, phoneme input, preset application.

## Files
- `index.html`, `voice-lab.css`, `js/app.js` — demo UI
- `js/voice.js` — public API (synthesize/play/say/cache)
- `js/fx.js`, `js/dsp.js` — effects + DSP
- `js/engines/{espeak,sam,babble,piper,webspeech,index}.js`
- `data/presets.json`
- `tests/voice-lab.spec.js`
