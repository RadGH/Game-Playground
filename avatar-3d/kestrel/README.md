# Kestrel — the next character system (trial)

**Codename Kestrel** (started 2026-10-27). The owner's brief: a modular character like Chibi 2.5, but with realistic
proportions (~7 heads tall) and more detail, still low-poly enough for phones, and easy to swap into the old games.
The owner's design is `ref/source/owner-mockup.png`: male and female base bodies in charcoal underwear, six
expressions, nine poses, close-ups of the eye, ear, nose, mouth, hands and feet.

It is run as a set of **attempts**, each building the same thing in a different way, all held to one
[contract](CONTRACT.md) and shown side by side on one review page:

| Attempt | How | Folder |
|---|---|---|
| `opus` | hand-coded procedural Three.js (the Chibi 2.5 technique) by Claude Opus 5.5 | `opus/` |
| `opus2` | Opus's second pass: a copy of `opus/` (kept unchanged as v1) refitted to the Meshy model — joint heights, widths and limb sections measured off Meshy's GLB (`tools/measure-glb.py` → `opus2-kit/`), keeping the face rig, fingers and garment slots; Codex wins where the two disagree (Meshy's shoulders sit too far forward) | `opus2/` |
| `fable` | the same brief, independently, by Claude Fable 5.1 | `fable/` |
| `meshy-multi`, `meshy-single`, `meshy-lowpoly` | Meshy API from the same pictures (4 views / 1 view / clean low-poly), auto-rigged, 16 library clips, packed by `tools/pack-glb.py`, run by `js/glb-attempt.js` | `meshy/` |
| later | Tripo (key added; its API account has no credits yet, `tools/tripo.mjs` is ready), Rodin, Hunyuan3D, TRELLIS | `<service>/` |

## Files

| File | What |
|---|---|
| `CONTRACT.md` | the API every attempt implements (same actor as `createChibi2Character`, + `setExpression`, `setLod`), clips, look fields (`body.form: 'masc' \| 'fem'`), budgets (≤ 12k triangles, ≤ 2 draw calls, ≤ 70 bones), deliverables |
| `BRIEF.md` | the brief the hand-coding agents were given |
| `index.html` + `js/compare.js` + `kestrel.css` | **the review page**: Codex reference + every attempt in columns; body, view (front/left/back/right/3/4/face/free), clip, expression, outfit, turntable, wireframe, far version; numbers table, 30-character crowd test, a 1–5 score sheet saved in the browser with "Copy scores" |
| `data/attempts.json` | which attempts the page and the contract test load, and the score rows |
| `js/looks.js` | the two test looks (male, female) + the proof-of-slots outfit (shirt, trousers, boots) |
| `js/swap.js` | **the switch an old game uses**: `kestrelFactory({ attempt, height })` returns a `createChibi2Character`-shaped factory; `kestrelFromUrl()` reads `?chars=kestrel` / `?chars=kestrel-fable`; `formFor()` guesses masc/fem for old looks (look.body.form → look.gender → hair) |
| `js/glb-attempt.js` | runs any rigged GLB (an AI service's output) to the contract; the page passes `files` from attempts.json |
| `tools/measure-glb.py` | measures a rigged GLB in bind pose (joints, trunk width/depth per height, limb sections) so a hand-coded body can be fitted to it; output for Meshy in `opus2-kit/` with pictures of the Meshy column |
| `tools/meshy.mjs`, `tools/tripo.mjs`, `tools/pack-glb.py` | service API helpers (keys read from `~/claude/secrets/.env`, never printed) and the GLB packer |
| `tests/contract.test.js` | builds every attempt headless and checks the contract (in `npm run test:unit`) |
| `ref/` | the Codex pictures — see `ref/README.md` |

## Trying it in an old game

Emberveil 2 takes `?chars=kestrel` (or `?chars=kestrel-opus2`, `?chars=kestrel-fable`, `?chars=kestrel-meshy`) and draws its people with Kestrel at 1.45 m, about Chibi 2's
height, so its camera and health bars still line up. Creatures stay as they are, and so does the game without the
flag. Any other game does the same thing in one place, wherever it calls `createChibi2Character`:

```js
import { kestrelFactory } from '<path>/avatar-3d/kestrel/js/swap.js';
const make = await kestrelFactory({ attempt: 'opus', height: 1.45 });
const actor = await make(look, opts);      // same actor as Chibi 2's
```

Old assets (Chibi 2 hats, weapons, armour, robes) are deliberately not supported in test 1. An unknown part id is
ignored, never an error.

## Results

See each attempt's own `README.md` and the review page. The verdict for test 1 is written up below once both are in.
