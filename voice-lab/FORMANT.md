# The bespoke formant engine ("Ours")

`js/engines/formant/` is a rule-based text-to-speech synthesizer written for this playground, in the family of espeak, DECtalk and MITalk, with no third-party synthesis code. It is deliberately simple enough for Claude to read end to end and tune. License: ours (MIT-style); the pronunciation dictionary is the CMU Pronouncing Dictionary (BSD, notice in `data/cmudict/LICENSE`).

## Pipeline

```
text ──normalize──▶ words ──g2p──▶ ARPAbet phones + stress ──tracks──▶ 5 ms frames ──synth──▶ 22 050 Hz samples
                                  (dictionary | derivations | rules | custom | [[phonemes]])   (durations, f0, formants, amplitudes)   (Klatt-style resonators)
```

### 1. `g2p.js` — text to phonemes
- **normalize**: numbers → words ("42" → "forty two"), `%`, `$`, `&`, a few abbreviations (Mr., Dr., St.), punctuation kept per word (`, ; . ! ?`).
- **dictionary**: `data/cmudict/cmudict.txt` (126 037 words, first pronunciation, ARPAbet with stress digits 0/1/2). Loaded once (3.3 MB).
- **derivations** when a word is missing: `-'s -s -es` (plural rules: S/Z/IH0 Z by the last sound), `-ed` (T/D/IH0 D), `-ing`, `-er`, `-ly`, hyphenated compounds.
- **rules** (`rules.js`) for anything else: ~330 letter-to-sound rules in the style of the 1976 NRL rule set (left context, letters, right context → phones), with a tiny pattern language (`#` vowels, `:` consonants, `^` one consonant, `+` front vowel, `%` suffix, space = word edge). Stress is then assigned: first syllable for 1–2 syllable words, penultimate for longer. "Kaelith" → `K EY1 L IH0 TH`, "Thalen" → `TH EY1 L EH0 N`.
- **custom**: `addPronunciation('thalen', 'TH EY1 L AH0 N')` overrides everything (Lingo can feed these from its lexicon).
- **phoneme blocks**: `[[HH AH0 L OW1]]` (ARPAbet) or espeak-style `[[h@l'oU]]` (converted by `espeakToArpabet`), so Lingo's speech text works unchanged.
- Output per word: `{ text, phones, source: dict | dict+suffix | rules | custom | phonemes, punct }`. The Voice Lab prints this under the waveform.

### 2. `phonemes.js` — the acoustic table
Every ARPAbet phoneme has targets: formants F1–F3 and bandwidths (diphthongs have a start and an end), class (vowel, diph, nasal, liquid, glide, asp, fric, stop, affr), voicing gain, aspiration gain, frication gain with **noise bands** (centre, bandwidth, gain) for fricatives and **burst** bands for stops, a **locus** (the formant values a neighbouring vowel glides toward), closure/burst/aspiration durations for stops, and a base duration. Values are adult-male references from Klatt (1980) and Peterson & Barney; everything is scaled by the voice's vocal-tract size at run time.

### 3. `tracks.js` — prosody and coarticulation
- **Durations**: base per phoneme × stress (unstressed vowels 0.62×) × position (phrase-final lengthening 1.35×) ÷ speed; stops = closure + burst + aspiration (long aspiration only for voiceless stops before a stressed vowel); pauses after `,` `;` `.` `?` `!` (170–380 ms) plus the `wordgap` knob.
- **Pitch**: per phrase (split at punctuation): declination from +18% to −10% of the base, a "hat" accent over every primary-stressed vowel (+16%), and a final movement over the last 35%: fall for statements, rise for questions, slight rise for commas. `intonation` scales all of it.
- **Formant tracks**: anchor points (two per vowel at 30%/70%, one per consonant at its locus) joined with smooth-step interpolation, which gives natural-looking transitions in and out of consonants.
- **Amplitude tracks**: voicing/aspiration/frication per class with 12 ms ramps; stops get a silent (or voice-bar) closure, a burst frame with the stop's noise band, then aspiration blending into the vowel; affricates a burst then a fricative tail; vowels next to nasals are partly nasalized.

### 4. `synth.js` — the Klatt-style synthesizer
- **Voicing source**: one pulse per period, the derivative of a `t²(1−t)` glottal flow (sharp closure, −12 dB/oct spectrum), open quotient adjustable (breathier voices open longer); per-period **jitter** (frequency) and **shimmer** (amplitude) for roughness; slow three-sine **flutter**; a one-pole **tilt** filter for dull/breathy voices.
- **Aspiration**: low-passed white noise into the same cascade as voicing (so /h/ and breathy vowels take the vowel's shape).
- **Cascade branch**: nasal pole/zero pair (the zero sits on the pole and cancels it unless the frame is nasal), then resonators R1–R3 (variable) and R4–R5 (fixed 3300/3850 Hz).
- **Parallel branch**: white noise through up to three bandpass resonators (the phoneme's noise bands) plus a bypass, for fricatives and bursts.
- Resonator: the classic two-pole `y = A x + B y₁ + C y₂` with coefficients from centre frequency and bandwidth; coefficients update every 8 samples, continuous parameters are interpolated per sample.
- Output is peak-normalized and soft-clipped.

### 5. `index.js` — knob mapping (all physical)
| Knob | Parameter |
|---|---|
| `gender` m/f/n | base f0 112 / 205 / 150 Hz, vocal-tract scale 1.0 / 1.17 / 1.08, open quotient 0.58 / 0.68 / 0.62 |
| `pitch` 0..1 | f0 = base × 2.6^(pitch−0.5) (about ±1.35 octaves) |
| `speed` 0..1 | duration divisor 0.55 .. 2.05 (knob 0.3 ≈ normal) |
| `depth` 0..1 | vocal-tract scale 1.28 (tiny) .. 0.72 (huge), multiplies every formant and noise band |
| `tone` 0..1 | spectral tilt: 0 dull, 1 bright |
| `breath` 0..1 | aspiration mixed into vowels, longer open quotient, more tilt |
| `rough` 0..1 | jitter up to 6% and shimmer |
| `flutter` 0..1 | slow pitch wobble (elderly) |
| `intonation` 1..4 | contour strength 0.3 .. 1.5 |
| `wordgap` 0..1 | up to 220 ms extra between words |

## How to improve it
Most intelligibility problems come from (a) a wrong phoneme string (check the readout under the waveform; add a rule in `rules.js` or a custom pronunciation), (b) a consonant that is too weak or too short (edit `phonemes.js` durations and gains), (c) transitions (the locus values in `phonemes.js`, or the anchor placement in `tracks.js`). Change one table value, press Say, listen. Unit tests in `tests/formant.test.js` guard the dictionary, rules, prosody direction (questions rise, statements fall) and the spectra of a few vowels and fricatives so tuning cannot silently break the basics.

## Ideas not done
- Diphone-quality transitions (per consonant-vowel pair loci instead of one locus per consonant).
- A second language: swap dictionary + rules + phoneme table.
- Emotion presets: map anger/sadness to f0 range, speed, tilt and breath.
- Singing mode: give each syllable a note and duration.


## As a module (for other projects)

The engine is versioned separately from the playground so a game can pin it: `voice-lab/js/engines/formant/module.json` (version, knobs, data, licence) and `engines/formant/CHANGELOG.md` (what changed, when a bump breaks old voice JSON). The stable entry is `voice-lab/js/formant-voice.js`:

```js
import { VERSION, load, synthesize, say } from './voice-lab/js/formant-voice.js';
await load(); const { samples, sampleRate } = await synthesize('Stay down.', { pitch: 0.3, gender: 'm' });
```
To copy it into another repo take `voice-lab/js/formant-voice.js`, `voice-lab/js/engines/formant/`, `voice-lab/data/cmudict/` and (for `say`) `voice-lab/js/voice.js` + `js/engines/index.js` + `js/dsp.js` + `js/fx.js`. Bump the version in both `module.json` and `formant-voice.js` when you change the sound.
