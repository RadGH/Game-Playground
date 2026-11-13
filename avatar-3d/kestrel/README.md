# Kestrel — the next character system (trial)

> **Not for games (owner 2026-11-11):** the Meshy male/female bodies made here are a trial only and must not be used in any game. Enemy models made the same way live in `model-library/`.

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

## Owner notes

- **2026-11-13:** the review page shows `opus`, `fable` and the three Meshy columns only; "Opus, refined from Meshy"
  (`opus2/`) and the "game kit" (`kit/`) were taken off it as unneeded. Their folders stay (`?chars=kestrel-opus2` /
  `?chars=kestrel-kit` still load them).
- **Rebuild when newer models come out (owner 2026-11-13):** he asked for a fresh hand-coded pair "using the latest
  version of those models". Opus 5.5 and Fable 5.1 built the current ones and were still the newest, so he chose to
  wait. When a newer Opus or Fable comes out, build new attempts from `BRIEF.md` (new folders, e.g. `opus3/`,
  `fable2/`), add them to `data/attempts.json`, and compare them with the old ones on the review page.

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


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

**Kestrel** (2026-10-27 →): the next character system as a trial — realistic ~7-head proportions, more detail than Chibi 2.5, phone budget (≤ 12k triangles, ≤ 2 draw calls), modular (body + hair + garments, a garment hides the skin under it), and a drop-in for Chibi 2 games: every attempt implements `CONTRACT.md` (`createKestrelCharacter(look, opts)` returns `createChibi2Character`'s actor + `setExpression`/`setLod`; new look field `body.form: 'masc'\|'fem'`). Attempts in `data/attempts.json`: `opus/` and `fable/` (test 1: hand-coded procedural Three.js by each model, from the same `BRIEF.md`), AI services later (Tripo, Meshy, Rodin, Hunyuan3D, TRELLIS). Review page `index.html` (Codex reference beside every attempt per view, clips, expressions, outfit, numbers, crowd test, score sheet with Copy scores). Codex pictures in `ref/` (turnarounds, crops, single hi-res views, head sheets — `ref/README.md`). Old-game switch `js/swap.js` (`kestrelFactory`, `kestrelFromUrl`); Emberveil 2 takes `?chars=kestrel[-fable]`. Test `tests/contract.test.js`

**Status / key files:** trial 2026-10-27

**Status / key files:** `avatar-3d/kestrel/README.md`, `CONTRACT.md`, `js/swap.js`, `js/compare.js`
