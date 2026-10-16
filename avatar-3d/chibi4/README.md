# Chibi 4 — trying a more realistic character system, one idea at a time

Owner: Radley Sustaire. Started 2026-10-15. Status: **prototype** — two finished characters, a runtime with Chibi 2's
call shape, and an opt-in switch in Thousandvale. Not a replacement for Chibi 2 yet (see the verdict).

**Pages** (dev server 8401, stable 8400):
- `avatar-3d/chibi4/index.html` — the review page: one card per step, same shots, same scorecard (`data/steps.json`)
- `avatar-3d/chibi4/compare.html` — Chibi 2 vs Chibi 4 side by side, animated, with measured cost and a 20/50 crowd test
- `avatar-3d/chibi4/baseline.html` — step 0: Chibi 2 dressed as the test characters
- Thousandvale: add `?renderer=chibi4` to the game URL — the PLAYER's body becomes Chibi 4 (everyone else stays Chibi 2)

## Why

Chibi 2 (every game's characters today) looks like dolls: ~2.5 heads tall, ball noses, feet that run through robes,
hair and hats that cut into faces. Chibi 3 (2026-10-01) tried blended-shape bodies and failed on faces. A friend's game
has detailed painted characters (Codex reference picture → model). The owner asked to try every idea, one by one, on
the same two test characters — the robed mage and the elf warrior of `ref/` — and compare.

## The steps

| Step | What | Score (short) | Kept? |
|---|---|---|---|
| 0 | Chibi 2 today | doll face, 2.5 heads, feet through robes | baseline |
| 1 | Blender MCP in the owner's Blender, built by eye from the Codex sheet: outline-lofted body, pictures projected on | face 4/5; doubled face/arms from projection | no — one baked statue |
| 2 | Same as a headless script on the VM; paint only where each picture SEES (ray test), baked to one texture | doubles gone; still a statue (32k faces, nothing swaps) | the **paint method** is reused in step 5 |
| 3 | MakeHuman bodies (MPFB 2, CC0 output) from sliders: real face topology, eyes, 53-bone game rig | the first real SYSTEM; photo-realistic, modern clothes | **yes — the base** |
| 4 | Codex repaints MakeHuman's skin (head) and hair keeping the UV layout; sliders to 6.6–6.8 heads | mage reads like the reference | yes |
| 5 | Our own robe and armour, measured off the body; body under the clothes deleted; projected paint; hat fitted to the head | no skin through cloth, nothing touches the face | yes |
| 6 | Skirt bones driven by both thighs + robe-aware stride; every frame checked for feet through the robe | 0 pokes walk + run (was 25/33 and 23/23 frames) | yes |
| 7 | GLB per character (1 mesh/distance, 1 atlas, LOD 0/1/2, 8 clips), three.js loader with Chibi 2's API, compare page, Thousandvale opt-in | 1 draw call per character | yes |
| 8 | Tripo3D image-to-3D (the friend's tool) | needs the owner's Tripo account | not started |

Full scorecards, shots and honest notes per step: the review page.

## How each piece works

### Base bodies (step 3–4) — `tools/blender/c4mh.py`
MPFB 2 (Blender extension; its code is GPL, every character it outputs and the asset packs used here are **CC0**)
builds a human from a dict: phenotype sliders, extra targets, skin, hair, brows, lashes, eyes, the `game_engine` rig.
`STEP3` / `STEP4` hold the two characters. `heads_tall()` measures crown-to-sole ÷ crown-to-chin from the face profile.
Step 4's push: head +1.0 / +0.85 / +0.8 (height/width/depth), eyes +0.6–0.7, broader V torso for the mage, bigger
pointed ears for the elf → **6.8 / 6.6 heads** (step 3: 7.9).

### Painted textures (step 4) — `tools/textures.py`
- Codex's image tool **refuses whole-body skin atlases** (an unrolled body reads as nudity). So `prep` crops only the
  head island and turns it upright; Codex repaints it in edit mode with the reference as style; `merge` pastes it back
  (only the head island, flood-filled from the face on a clean-background layout atlas), grades the whole body to the
  painted head's skin colour, smooths body pores/hair without AI, removes the logo strip.
- Codex kept the layout to the pixel in edit mode, so the result is simply resized back (`--fit` registers by the
  island's bounding box instead; it was fooled by repainted edge patches, so it is off).
- Hair: Codex RGB + the original's alpha (`hair`), or `gradient-hair` — a no-AI auburn colour ramp, used for the elf
  braid because Codex ran out of credit mid-step.
- The painted pictures are committed in `textures/` (Codex's output differs every run).

### Clothes (step 5) — `tools/blender/c4clothes.py`, `step5_clothes.py`
Every garment is measured off the body it is for (rebuild after a slider change and it still fits):
`shell` (the body's own faces pushed out: trousers, undershirt, jerkin, bracers), `hull_loft` + `smooth_rings`
(stacked body outlines, widened: robe, mantle, collar, belt), `axis_loft` (a loft along any axis: boot feet heel→toe so
toes merge, pauldron plates round the upper arm), `tube` (bell sleeves with a cuff that turns in), `panel` (pointed
tabard panels), `box` (pouches). **Body masking**: `covered()` casts 5 rays out of every body vertex; if all hit cloth
the vertex goes in `c4_hidden` and a Mask modifier removes it (~5,000 of 13,400 body vertices per character).
**Paint**: `project_bake()` — per-vertex "which picture sees me" weights (facing + an unblocked ray + not studio grey),
per-pixel sampling of each picture through its own projection with the grey keyed out in the shader, neighbours'
colour where nothing sees, emission-baked into the garments' UVs (2048). **Hat**: `fit_hat()` builds the band from the
head's outline at brow height (+3 cm for hair) and pulls hair inside the band (never into the skull).
Clip checks: `clip_report()` counts garment/hair vertices inside the visible body.

### Animation and the robe (step 6) — `tools/blender/c4anim.py`, `step6_robe_run.py`
- Clips: Quaternius' **Universal Animation Library** (CC0; already vendored at `avatar-3d/assets/quaternius/anim/`)
  uses the same UE-style bone names as MakeHuman's game rig. `retarget()` gives each bone the source bone's world
  rotation corrected for the two rest poses (T vs A) — measured 0.0° off on every limb.
- `add_skirt_bones()` (8 round the hips, pivot at hip-joint height, to the hem), `skirt_weights()` (robe below the hips
  follows the two nearest by angle), `drive_skirt()` (front bones swing as far forward as the FURTHER-forward thigh,
  back ones as far back as the further-back thigh, sides follow their own leg; baked as keys so glTF carries them).
- `robe_stride()` caps a clip's thigh swing (~22–24°) and knee bend (~50°) — Quaternius' jog swings the thigh 78° and
  kicks the heel 129°, which rips any robe.
- `measure_feet()`: every frame, every boot vertex above the hem that is outside the robe's cloth wall is a
  poke-through (coming out UNDER the hem is allowed); otherwise the smallest foot-to-cloth gap. Step 6 exits non-zero
  if the final set-up has any poke-through.
- Results (mage): copied weights + full stride: 25/33 walk frames and 23/23 run frames poke; skirt bones alone or the
  stride alone still poke; **both: 0 pokes, closest gap 3.2 cm walking / 3.0 cm running.**

### Runtime (step 7) — `tools/blender/step7_export.py`, `js/chibi4.js`
- Export: the step-5 character, mantle re-weighted to the back, skirt bones (robe / tabard), 8 clips (idle, walk, run,
  cast, attack, hit, death, talk; mage walk/run with the robe stride and a straighter spine), the outfit decimated to
  30%, body/eyes/brows/lashes/hair/outfit joined into ONE mesh, their pictures copied into cells of ONE 2048 atlas
  (WebP; alpha kept for hair, brows, lashes), LOD1 = 40% and LOD2 = 15% of LOD0's triangles by decimation, all in one
  GLB with a `<who>.json` of numbers. Teeth and tongue are dropped (no lip animation).
- `createChibi4Character(avatar, opts)` returns `{ group, setAnim(name, fade), play, update(dt), setRate, stats(),
  metrics(), setAvatar, dispose, parts, skeleton, lod }` — the calls Thousandvale and the Chibi 2 pages make.
  Chibi 2 animation names map onto the 8 clips (ready/guard → idle, wave → talk, dead → death; jump → idle).
  `modelFor(avatar)`: elves and women → elf, everyone else → mage (or `avatar.chibi4.model`).
  Instances share geometry and texture (`SkeletonUtils.clone`), the three distances are a `THREE.LOD` (0 / 9 / 22 m).
- Thousandvale: `prototypes/thousandvale/js/client/actors.js` — 7 lines: with `?renderer=chibi4` the self actor's body
  is created by `createChibi4Character` (dynamic import, so nothing loads without the flag); any error falls back to
  Chibi 2. `equip()/dress()` return false — gear and mounts do not show on a Chibi 4 body.

## Measured (step 7)

Measured by `tests/chibi4.spec.js` on `compare.html` (this VM: headless Chromium, software renderer, no GPU — the
frame rates are only meaningful side by side; re-measure on a real PC with the page's crowd buttons):

| | Chibi 2 | Chibi 4 |
|---|---|---|
| draw calls per character | 1.5 | **1** |
| triangles per character, near | 6,598 | 35,672 (LOD0) |
| distance versions | — | 34.6k / 13.9k / 5.2k (mage), 36.7k / 14.7k / 5.5k (elf) |
| bones | 22 | 61 (53 MakeHuman + 8 skirt) |
| download | none (built in code) | 3.2 MB (mage) + 3.5 MB (elf) GLB, once per model |
| first build, both characters | 79 ms | 334 ms incl. download |
| 20 characters at game distance | 11.9 fps, 31 calls, 132k tris | 6.9 fps, 21 calls, 151k tris |
| 50 characters at game distance | 6.1 fps, 76 calls, 330k tris | 4.3 fps, 51 calls, 268k tris |

In Thousandvale (`tests/thousandvale-hook.spec.js`, real game server): with `?renderer=chibi4` the player is the
Chibi 4 mage (1 draw call, 1.91 m, walks/runs, no page errors); without the flag the player is Chibi 2 as before
(2 meshes, 8,114 triangles, 1.78 m).

## Verdict

**The look and the robe are solved; the system is not yet a Chibi 2 replacement.**

- Looks: the first version that reads as the Codex reference — real faces (MakeHuman topology, painted), 6.6–6.8 heads,
  painted robe/armour. Much better than Chibi 2's dolls and Chibi 3's faces.
- The original complaints: faces are never touched by collar, hat or pauldrons (measured), skin never shows through
  clothes (it is deleted), feet never pass through the robe on walk or run (measured every frame).
- Cost: one draw call per character, and the distance versions make a crowd cheaper in triangles than Chibi 2 — but
  skinning 61 bones over more vertices is slower per character on this GPU-less VM; needs a real-PC measurement.
- The gap: it is two baked characters. Chibi 2's whole value is "any part, any colour, any class" at runtime. Chibi 4
  is modular only at BUILD time (sliders + garments measured off the body + a script).

Recommendation: keep this pipeline (MakeHuman + garments-from-the-body + skirt bones + painted textures) as the
direction for new games and hero characters; the next piece of work is runtime modularity (body + each garment as
separate skinned meshes on one skeleton, a body mask per outfit, weapon sockets, more clips). Do not port Thousandvale
past the opt-in flag yet.

## What is not done

- **Not modular at runtime yet.** Each GLB is one baked character. The pieces ARE modular at build time (any body
  from sliders, garments measured off it), but swapping a garment in the game needs one GLB per garment set, or
  shipping garments as separate skinned meshes on the shared skeleton (one draw call each) — the next step if this
  direction is kept.
- Only two characters exist; `modelFor()` maps every avatar onto one of them.
- The elf's braid is a no-AI stand-in and her back is painted from the front picture — Codex ran out of credit (resets
  02:38 on 2026-10-16). Re-run: `tools/textures.py` with a Codex braid, and a Codex back view saved as
  `ref/warrior-back.png` (step 5 picks it up automatically).
- Quaternius' clips have no wave, guard or jump; the jog keeps a slight forward hunch.
- Faces keep MakeHuman's glassy realistic eyes; painted eyes would match the reference better.
- No weapons in hand, no mounts (Thousandvale's mount code expects Chibi 2's seat).
- Step 8 (Tripo3D) needs the owner's account.

## Rebuild

Blender 5.2.2 at `~/opt/blender/blender`, MPFB 2 + the CC0 packs installed once (see `tools/blender/step3_makehuman.py`
header). From the playground root:

```bash
B=~/opt/blender/blender
$B -b -P avatar-3d/chibi4/tools/blender/step4_painted.py                  # step 4 shots
$B -b -P avatar-3d/chibi4/tools/blender/step5_clothes.py                  # step 5 shots + report.json (2 min)
$B -b --python-exit-code 3 -P avatar-3d/chibi4/tools/blender/step6_robe_run.py   # step 6, fails if a foot gets through
$B -b -P avatar-3d/chibi4/tools/blender/step7_export.py -- mage          # models/mage.glb + mage.json (~30 s)
$B -b -P avatar-3d/chibi4/tools/blender/step7_export.py -- elf
python3 avatar-3d/chibi4/tools/sheet.py <out.png> <renders...>            # contact strips for the review page
flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/chibi4/tests/   # compare page, crowd, Thousandvale hook
```

`models/*.glb` (~3.2–3.5 MB each) are committed so the pages work from a fresh checkout; the big working files
(`.blend`, raw renders, full-size Codex PNGs, baked garment PNGs) are git-ignored and rebuilt by the scripts.

## Licences

MakeHuman/MPFB output and the asset packs used (skins incl. the bearded one, hair, brows, lashes, eyes, game rig): CC0
(per the packs' metadata; the "AGPL" line in some .mhclo headers is the MakeClothes tool's boilerplate). Quaternius
Universal Animation Library: CC0. Codex pictures: generated for this project. MPFB's code (GPL) runs only at build
time and is not shipped.
