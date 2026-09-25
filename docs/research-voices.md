# Research: browser synthetic character voices (2026-09-09)

Goal: Tomodachi Life-style voice editor in the browser, eventually many NPCs speaking generated dialog cheaply and offline.

## What the reference games actually do
- **Tomodachi Life (3DS)** ships a licensed Nuance text-to-speech engine (concatenative, not formant synthesis). Player knobs: **Pitch, Speed, Quality** (sliders) and **Tone, Accent, Intonation** (numbered pickers). The 2026 Switch sequel *Living the Dream* uses **Pitch, Depth, Delivery, Tone**, accent from console region.
- Web recreations: Talkmodachi runs the real engine in an emulator; miichart.com uses **espeak-ng WASM + a DSP chain** (semitone pitch shift, nasal formant boost, vibrato, chorus, lo-fi) with presets Kid/Baby/Deep/Elder/Robot/Whisper.
- **Animal Crossing "Animalese"** is ~92 short recorded clips (one per letter/kana) played fast with per-character pitch (body size) and mood offsets. Near-zero CPU. JS ports exist (Wexx/animalese.js).

## Engine comparison
| Engine | License | Size | Quality | Knobs | Phoneme in/out | Crowd cost |
|---|---|---|---|---|---|---|
| Web Speech API | free, built in | 0 | good (OS voices) | rate 0.1–10, pitch 0–2, voice | none (SSML phoneme ignored in Chrome) | serialized, no audio buffer → no effects, no overlap |
| espeak (meSpeak.js asm.js / espeak-ng WASM) | **GPL-3** | 2.4 MB / 18 MB | robotic-formant, intelligible | pitch, speed, wordgap, amplitude + variant files: 8 formants, breath, flutter, roughness, voicing, tone, echo, intonation 1–4; presets m1–m7, f1–f5, croak, whisper, klatt | `[[...]]` phoneme input; espeak-ng `--ipa` output | very cheap, pre-render to buffers |
| SAM (sam-js) | **none/abandonware** | 110 KB | 1982 C64 retro | pitch, speed, mouth, throat 0–255, singmode | phonetic input (its own ARPAbet-like) | near zero, Float32 output |
| Piper VITS (vits-web) | MIT code, voices mostly permissive | 60–110 MB per voice + ~20 MB runtime (online first use) | natural | speed, noise, speaker id | internal espeak phoneme IDs (fork needed) | seconds per line on CPU; pre-render only |
| Kokoro-js / KittenTTS | Apache-2 | 90–330 MB / 25–56 MB | best / decent | speed, voice blend | via phonemizer | WebGPU needed for speed |
| Pink Trombone | MIT | 50 KB | vocal-tract toy | tongue/lips/glottis | no text layer | cheap; creature sounds |
| Babble (Animalese-style) | own | ~0 | cartoon | pitch, speed, per-letter map | letter/syllable map (great for invented languages) | hundreds simultaneous |

Windows 11 Chrome `getVoices()` = offline SAPI voices (David, Zira, Mark) + Google online voices; Edge adds Microsoft Natural neural voices.

## Post-processing
Anything giving PCM (espeak, SAM, Piper, babble) can run through Web Audio: playbackRate (chipmunk/giant), pitch shift w/ formant preservation (SoundTouchJS, LGPL), ring modulation (robot), bitcrusher/lowpass, convolver reverb, chorus via delay. Web Speech API is the exception (no buffer access).

## Recommendation applied in voice-lab
Compare espeak (closest to Tomodachi knobs), babble (crowd-safe, license-free), Web Speech (reference), Piper (natural reference, optional). For hundreds of NPCs: babble or pre-rendered espeak/SAM buffers with effects; neural only for one "hero" line at a time.

## Phoneme input
espeak accepts `[[h@l'oU]]` (Kirshenbaum ASCII); SAM accepts its own phoneme alphabet; Piper/Kokoro need a wrapper fork; Web Speech none.

Sources: tlmodding.com Tomodachi TTS docs; Nookipedia Animalese; espeak-ng docs/voices.md; masswerk.at/mespeak; github.com/discordier/sam; github.com/diffusionstudio/vits-web; huggingface onnx-community/Kokoro-82M; github.com/KittenML/KittenTTS; github.com/cutterbl/SoundTouchJS; github.com/yonatanrozin/Modular-Pink-Trombone; miichart.com/tomodachi-life-voice-generator.
