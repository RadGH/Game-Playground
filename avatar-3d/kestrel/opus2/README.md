# Kestrel — the hand-coded attempt by Opus, version 2 (refined against the Meshy model)

`avatar-3d/kestrel/opus2/` · `KESTREL_INFO = { attempt: 'opus2', by: 'Claude Opus 5.5', version: '0.2.0' }`

Version 1 is kept untouched in `../opus/` for reference. v2 is the same system (every vertex written by code, one
skinned mesh, one draw call, the same 64 bones, 16 clips, face rig + 6 expressions, blinking, fingers, modular
underwear/hair/outfit that hides the skin under it, LOD 1) with the **body refitted** to the Meshy model's measurements
(`../opus2-kit/meshy-*.json`) and, where the two disagree, to the Codex pictures in `../ref/` (the owner: Meshy's
shoulders sit too far forward — so front-to-back placement follows Codex).

```js
import { createKestrelCharacter } from './avatar-3d/kestrel/opus2/js/kestrel.js';
const actor = await createKestrelCharacter(look, { lod: 'auto', height: 1.45 });   // same call and actor as v1 / Chibi 2
```

## What changed from v1, and why

| | v1 | v2 | why |
|---|---|---|---|
| shoulders, chest, neck | shoulder joint 1.40 m, flat shoulder shelf | joint 1.33 m (male) / 1.22 m (female), the trapezius slopes from the neck to the deltoid | Meshy joint 1.328 / 1.25; Codex shoulder top 1.39 / 1.27 m |
| torso heights | as written | every v1 torso height goes through `P.yMap` (rig.js): chest, nipples, bust, bra and collar all sit 3–7 cm lower | keeps v1's relief and garment edges, moved to where Codex has them |
| waist, hips | waist half-width 15.8 cm, hips 20.5 (male) | 12.9 / 18.7; female waist 13.0 → 9.8 | Codex 13.8 / 18.1, female waist 9.1 |
| legs | straight, ankle under the hip, thin calves | ankle 8.5 cm behind the hip, knee 3 cm (a standing plumb line), thigh section forward of the bone, calves 2–3 cm wider and higher | Codex side view and Meshy both lean the leg; calf 14.6 / 12.1 cm wide in Codex |
| arms | 29 + 26.6 cm, 12 sides | 26.2 + 23.9 cm (male), 23 + 21.7 (female), 14 sides, tapered elbows and wrists | Meshy 23.9 + 25.5; Codex wrist 0.89 m |
| **the shoulder join** | an arm tube stuck into the torso: a step and a crease, opening up when the arm moves | **a shoulder patch**: the top of the arm is a patch whose first row lies on the torso skin (an ellipse round the joint, up onto the trapezius, down to the armpit) and sweeps out into the arm along a Bézier, with a deltoid dome; it carries the torso's skin weights at the ring, blending to the arm's, and the torso skin and shirt inside the ring are not drawn (`COVER.PATCH`). Normals at the ring are the torso's | owner review: "the shoulders and arms do not connect smoothly" |
| neck, hips, ankles | tubes intersecting tubes (jagged rings) | the neck base, the top of the thigh and the bottom of the leg are smooth-unioned into the torso / foot (only a band near the crossing is lifted, deep points stay inside) | jagged rings at every join |
| head | 0.27–0.28 m, face long, eyes small | 0.24 m head; male face measured off `ref/male-head.png` (eye line 1.63 face half-widths above the chin, mouth 0.43 and nose 0.62 of the way to the eyes); bigger eyes and irises, thicker lashes and brows, softer male jaw, heart-shaped female face, a darker lip line | Codex head sheet |
| hair | thin three-sided petals | fatter, fuller male petals, fewer tall spikes; female: fuller face-framing locks below the jaw on both sides, a lock over the part, a lower spray | Codex head sheets |
| hands, feet | straight fingers, lighter hands and feet than the limbs (a band at wrist and ankle) | relaxed fingers curl more (0.42/0.62 rad, more toward the pinky), forearm tucks into the palm, hands and feet shaded like the limbs, bigger toes, the leg blended into the foot | Codex hands hang half-closed |
| relief and shading | relief ×1.8 (torso) / ×2.0 (limbs) | ×2.3 / ×2.5 (male), stronger baked occlusion, painted form shading on every skin piece; knee cap + the dip above it, hamstring tendons, a diamond calf, a quad groove; the female's lower buttock over the thigh | muscles read more like the Meshy and Codex bodies |
| bra | the straps floated (a v1 height used as a v2 one) | strap heights pass `P.yInv`; scoop higher and bridged over the cleavage | bug found while refitting |

## Numbers against Meshy and Codex (v1 → v2)

Measured by `tools/fit.py`: both models in bind pose, sliced through every triangle edge (not sampled at vertices,
so coarse rows do not fool it), trunk = everything but the arms, aligned on the middle of the shin (the two rigs put
the hip joint at different depths). Codex columns come off `ref/<body>-front.png` (`tools/codexsil.py`); a blank
Codex cell is a height where the arms touch the body in the picture. "off" is against Codex where there is a Codex
number, else against Meshy. **Joint heights are each rig's own bone placement** (Meshy's auto-rig puts the hip
joint 5–8 cm low and the wrist 4–6 cm high for the mesh it skins), so the silhouette rows matter more than joint rows.


### male

| measure | Codex | Meshy | v1 | v2 | v1 off (cm) | v2 off (cm) |
|---|---|---|---|---|---|---|
| shoulder joint height (m) | | 1.328 | 1.398 | 1.330 | +7.0 | +0.2 |
| elbow joint height (m) | | 1.109 | 1.133 | 1.091 | +2.4 | -1.8 |
| wrist joint height (m) | | 0.932 | 0.886 | 0.874 | -4.6 | -5.8 |
| hip joint height (m) | | 0.859 | 0.915 | 0.905 | +5.6 | +4.6 |
| knee joint height (m) | | 0.510 | 0.510 | 0.510 | +0.0 | +0.0 |
| neck joint height (m) | | 1.379 | 1.450 | 1.400 | +7.1 | +2.1 |
| head joint height (m) | | 1.481 | 1.545 | 1.515 | +6.4 | +3.4 |
| upper arm length | | 0.239 | 0.290 | 0.262 | | |
| forearm length | | 0.255 | 0.266 | 0.239 | | |
| hips half-width at 0.88 m (cm) | 18.1 | 16.8 | 20.5 | 18.7 | +2.4 | +0.7 |
| waist half-width at 1.06 m (cm) | 13.8 | 12.6 | 15.8 | 12.9 | +2.0 | -0.8 |
| lower chest half-width at 1.16 m (cm) | 15.7 | 14.7 | 17.4 | 16.6 | +1.7 | +0.9 |
| chest half-width at 1.26 m (cm) |  | 18.0 | 20.7 | 20.1 | +2.6 | +2.1 |
| thigh width at 0.72 m (cm) | 18.5 | 17.9 | 18.4 | 19.1 | -0.1 | +0.6 |
| above knee width at 0.57 m (cm) | 11.7 | 12.4 | 13.8 | 13.1 | +2.0 | +1.3 |
| knee width at 0.50 m (cm) | 11.0 | 11.0 | 11.5 | 11.1 | +0.5 | +0.2 |
| calf width at 0.39 m (cm) | 14.6 | 14.0 | 12.2 | 13.7 | -2.4 | -0.9 |
| ankle width at 0.18 m (cm) | 6.8 | 7.3 | 6.8 | 7.0 | +0.0 | +0.2 |
| thigh depth at 0.69 m (cm) | | 19.2 | 17.4 | 20.3 | -1.9 | +1.1 |
| calf depth at 0.39 m (cm) | | 13.4 | 16.3 | 16.4 | +2.9 | +3.0 |
| mean trunk half-width diff vs Meshy, crotch→crown (cm) | | | | | 3.5 | 1.8 |
| mean leg width diff vs Meshy (cm) | | | | | 1.2 | 0.9 |
| mean leg depth diff vs Meshy (cm) | | | | | 1.1 | 1.2 |

Landmarks off the Codex picture (by eye, 10 cm grid): shoulder top 1.39 m, chin 1.48 m, elbow 1.10 m, wrist 0.89 m, crotch 0.81 m

### female

| measure | Codex | Meshy | v1 | v2 | v1 off (cm) | v2 off (cm) |
|---|---|---|---|---|---|---|
| shoulder joint height (m) | | 1.250 | 1.308 | 1.222 | +5.8 | -2.8 |
| elbow joint height (m) | | 1.047 | 1.057 | 1.011 | +1.0 | -3.6 |
| wrist joint height (m) | | 0.873 | 0.831 | 0.814 | -4.2 | -5.9 |
| hip joint height (m) | | 0.799 | 0.875 | 0.875 | +7.6 | +7.6 |
| knee joint height (m) | | 0.467 | 0.490 | 0.490 | +2.3 | +2.3 |
| neck joint height (m) | | 1.288 | 1.370 | 1.297 | +8.2 | +0.9 |
| head joint height (m) | | 1.371 | 1.455 | 1.400 | +8.4 | +2.9 |
| upper arm length | | 0.226 | 0.270 | 0.230 | | |
| forearm length | | 0.227 | 0.241 | 0.217 | | |
| hips half-width at 0.86 m (cm) | 15.0 | 15.9 | 19.8 | 17.1 | +4.8 | +2.1 |
| waist half-width at 1.02 m (cm) | 9.1 | 9.6 | 13.0 | 9.8 | +3.9 | +0.7 |
| ribs half-width at 1.10 m (cm) | 11.5 | 12.2 | 12.0 | 11.8 | +0.4 | +0.3 |
| bust half-width at 1.14 m (cm) | 13.1 | 12.5 | 13.5 | 12.8 | +0.3 | -0.3 |
| thigh width at 0.70 m (cm) | 17.0 | 17.8 | 17.4 | 16.7 | +0.4 | -0.3 |
| above knee width at 0.56 m (cm) | 11.0 | 13.6 | 13.1 | 11.9 | +2.1 | +0.9 |
| knee width at 0.48 m (cm) | 9.7 | 10.6 | 10.0 | 9.9 | +0.2 | +0.2 |
| calf width at 0.33 m (cm) | 12.1 | 12.2 | 9.2 | 11.8 | -2.9 | -0.3 |
| ankle width at 0.15 m (cm) | 5.6 | 6.2 | 5.8 | 5.7 | +0.2 | +0.1 |
| thigh depth at 0.69 m (cm) | | 17.9 | 17.1 | 18.2 | -0.9 | +0.2 |
| calf depth at 0.36 m (cm) | | 12.0 | 13.4 | 14.4 | +1.4 | +2.4 |
| mean trunk half-width diff vs Meshy, crotch→crown (cm) | | | | | 3.1 | 1.5 |
| mean leg width diff vs Meshy (cm) | | | | | 1.1 | 1.1 |
| mean leg depth diff vs Meshy (cm) | | | | | 1.2 | 1.1 |

Landmarks off the Codex picture (by eye, 10 cm grid): shoulder top 1.27 m, chin 1.35 m, elbow 1.03 m, wrist 0.83 m, crotch 0.80 m


In short: **trunk silhouette within 1.5–1.8 cm of Meshy on average from crotch to crown (v1: 3.1–3.5 cm)**, waist and
hips within 1 cm of Codex for the male (female hips still 2 cm wide), knee/ankle/calf/thigh widths within 1 cm of
Codex except the male just above the knee (+1.3); calves are still 2–3 cm deeper front-to-back than Meshy's (Codex's
are deep too: 17 cm at 0.40 m — they agree with Codex better than with Meshy).

Budgets (`stats.json`, node, this VM): male 11,896 / female 11,629 triangles (≤ 12,000), with the outfit 10,335 /
10,276, LOD 1 3,296 / 3,561 (≤ 4,000), 1 draw call, 64 bones, no textures, a new look 78–140 ms warm (≤ 150; the first
build in a process pays ~235 ms of JIT warm-up), the same look again ~1 ms.

## Rounds (shoot → put beside Meshy and Codex at one height → list → fix)

Tools: `tools/fit.sh <dir> [attempt]` dumps both looks (`dump.mjs`) and runs `fit.py` against both Meshy GLBs and
the Codex pictures (tables + `ov-<body>.png`, an orthographic overlay: Meshy red, ours blue, overlap pink);
`tools/summary.py v1dir v2dir` writes the table above; `tools/compare4.sh <shots> <out>` makes
`compare-<body>-<view>.png` (Codex | Meshy | v1 | v2); `tools/tris.mjs` the triangle count per piece.

1. **Proportions by numbers.** First table: v2 shoulders/neck/head 5–8 cm high, waist +4 cm, hips +4 cm, chest front
   +10 cm (it was the alignment: the rigs differ, so everything is aligned on the shin since). Added `P.yMap` /
   `P.yInv` so the torso keeps v1's parameter heights; rewrote the torso rows in real heights; leaned the legs
   (Codex and Meshy both put the knee and thigh 5–7 cm forward of the shin); thigh section forward of the bone; calves.
2. **Shoulders, head, face.** The deltoid was a pad on a flat shelf: started the arm inboard on the trapezius, sloped
   the torso top, slimmed the neck, narrowed the female shoulders (Meshy 0.149 m). Head 0.24 m. Bigger eyes, irises,
   brows; lip colour and the line between the lips; softer male jaw; heart-shaped female face. Found the bra straps
   floating (a v1 height passed back as a v2 one).
3. **Relief, arms, hands, hair.** Relief and occlusion up, painted shading on every skin piece; arm taper (Meshy
   elbow/forearm numbers); relaxed fingers curl; male hair fuller, fewer spikes; female face-framing locks.
4. **Legs, knees, feet, joins.** Diamond calf, knee cap, tendons; the band at the wrist and ankle was the hands and
   feet having no painted shading (fixed); bigger toes; the neck, hip and ankle joins smooth-unioned. A layer laid on
   the torso showed its own edge as scallops across the upper back — only points near the crossing are lifted now.
5. **Owner review (mid-pass): "male face too short", "shoulder and arm do not connect, in the clips too".** The male
   face was re-measured on the head sheet (I had read the chin 2 cm high on the body picture): lower face stretched
   back by the warp in `face.js headWarp`, mouth back to v1's height, cranium +2 cm. The shoulder was rebuilt as the
   patch (above) and checked at the shoulder close-up in bind, walk, attack, cast, wave and with the outfit, both bodies
   (`?view=shoulder` / `shoulderB`). Female hair kept as it was, as asked.

## Self-score (1–5, honest)

| | v1 | v2 | Meshy | why |
|---|---|---|---|---|
| Looks like the reference | 2.5 | 3 | 3.5 | right proportions and silhouette now; still flat shading next to Codex/Meshy, no painted detail |
| Body and proportions | 3 | 3.5 | 3.5 | numbers within 1–2 cm of Meshy/Codex; Meshy's carved muscle and lean still read better at a glance |
| Shoulder / joins | 2 | 3 | 4 | one continuous form in the bind pose and most clips; a faint crease at the front of the ring, and the armpit folds when the arm is raised above the head (wave, from close up) |
| Face | 2.5 | 3 | 2.5 | readable, both characters, measured proportions, six expressions on bones; plainer than Codex |
| Hands and feet | 2.5 | 2.5 | 3 | curl, nails, toes; palms still boxy |
| Hair | 2.5 | 3 | 3.5 | fuller; still faceted petals |
| Animation + expressions | 3 | 3 | 2.5 | 16 clips with IK and finger poses, 6 expressions, blinking — Meshy has library clips but no face |
| Modular / flexible | 4 | 4 | 1.5 | the reason v2 exists: Meshy is one fused mesh (no outfit swap, no face rig, no body dials) |
| Phone cost | 4.5 | 4.5 | 4 | 1 draw call, no textures, < 12k / < 3.6k triangles |

## What I could not get right

* **The armpit with the arm above the head** (wave): the patch's underside folds and a few torso triangles at the ring
  show from close up. Fine from the front and at game distance. A corrective bone (or a shape driven by the arm's
  elevation) under the arm is the fix.
* A faint shading crease along the front edge of the shoulder ring in the bind pose.
* Calves deeper than Meshy's (they follow Codex there), male "above the knee" 1.3 cm wide, female hips 2 cm wide.
* Shading: both references are painted with strong, soft light; this is geometry + vertex colour under the review
  page's flat light. A canvas-painted atlas (muscle lines, lids, lips, hair strands) is still the biggest step left.
* Joint heights differ from Meshy's bones by design (its auto-rig places them for its mesh, e.g. the hip 5 cm low);
  the silhouette is what was fitted.

## The surface API (for whoever refits hair, hats, faces and clothes next — e.g. Thousandvale)

Every piece is a **parametric surface spec** handed to `MeshBuilder.surface(spec)` (`js/geo.js`):
`{ name, us, segs, at(u, θ) → { p, w }, color?, mask?, offset?, rough?, glow?, ao?, aoScale?, shade?, capStart?, capEnd?,
theta?, wrap?, out?, normal? }` — `p` is a bind-space point (metres, feet at y = 0, +z forward), `w` a list of
`[boneName, weight]`. A garment is **the body part's own `at` sampled again** over part of its range, smoothed
(`at(u, θ, { bump: 0.6 })`: cloth bridges the muscle grooves), with `offset` pushing it out along the normal; so it
carries the body's skin weights and moves with it in every clip. The skin a garment covers is tagged with a
`COVER` bit by `garments.js coverOf` and dropped at `finish(hide)` when that garment is worn.

| part (body.js) | parameters | extras |
|---|---|---|
| `torsoPart(P)` | `u` = **v1 parameter height** (map to a real height with `P.yMap(u)`, back with `P.yInv(y)`), `θ` round the body (0 = front, +π/2 = the character's +x side) | `radiusAt(yReal, θ)`, `project(p, offset)` (the skin point at p's height and direction), `centreZ(y)`, `weightsAt(y, x, z)`, `yTop`/`yBot` |
| `neckPart(P, torso)` | `u` = real height, `θ` | base smooth-unioned into the torso |
| `armPart(P, sg, torso)` | `u` = distance along the arm from the top of the shoulder patch (`sR` = where the patch meets the tube, `sJ` shoulder, `sE` elbow, `sW` wrist), `θ` round the arm (mirrored for L) | `patchHit(p)` (is this torso/shirt point under the shoulder patch? → `COVER.PATCH`), `out`/`normal` (pass them on to a sleeve so its patch winds and lights the same), `frame(s)` |
| `legPart(P, sg, foot, torso)` | `u` = distance down the leg from above the hip (`sH` hip, `sK` knee, `sA` ankle), `θ` | top blended into the torso, bottom into the foot |
| `footParts(P, sg)`, `handParts(P, s, layout)` | per piece | `footParts(...).radiusAt(p)` |
| `headPart` / `makeHeadSurface(P)` (face.js) | head space: metres for a 0.24 m head, y up from the chin; `headToWorld(P, p)` (applies `headWarp`) | `at(y, θ, { noFeatures })` = the bare skull (hair caps and hats fit to it), `atXY(x, y)`, `normalAt` |

Rules that keep it working: a new garment is ~20 lines in `garments.js` (sample a part, pick an offset, a colour, a
cover bit); anything that sits on the torso uses **v1 parameter heights** (or converts with `P.yInv`); anything that
covers the shoulder must mask `COVER.PATCH` the way the shirt does and reuse `arm.out`/`arm.normal` on its
sleeve; hair and hats are built in head space on `makeHeadSurface(P).at(..., { noFeatures: true })` and the scalp
under them is hidden with `COVER.SCALP`.

---

# Version 1 notes (still true unless the table above says otherwise)

## How it is built (v1; v2 changes above)

**One idea runs through all of it: every piece is a parametric surface** `at(u, θ) → point + skin weights`, sampled on a
grid of rows (u) and columns (θ) by `geo.js`. A body part, a garment and a lock of hair are the same kind of thing.

| file | what it does |
|---|---|
| `js/rig.js` | proportions (masc / fem; `body.height` / `body.width` nudge them) and the 64-bone skeleton. Every bone rests with no rotation at its joint in a relaxed A-pose, so clips are plain rotations and the mesh is written in bind space directly. Sides follow Chibi 2: `L` bones at −x, `R` at +x. |
| `js/body.js` | torso, neck, arms, legs, hands, feet. Each is a loft whose cross-section is a superellipse (front and back depth separate) plus **muscle relief**: gaussian bumps and grooves in (height, angle) — pecs with a crisp lower edge, a six-pack grid, obliques and the groin "V", serratus, lats, shoulder blades, spine groove, trapezius, deltoid heads, biceps/triceps, forearm masses, quads with the teardrop, knee cap, two-headed calves, ankle bones. Hands: a palm box with a thumb ball, knuckles and tendons, four two-bone fingers and a thumb with rounded tips and nails; feet with an arch, a ball and five toes. |
| `js/face.js` | the head is ONE surface: skull + face from a row table (half-width, front and back depth, squareness per height) smooth-unioned with the neck, plus features (nose ridge, tip and wings, eye sockets, brow ridge, cheekbones, temples, lips with the line between them, philtrum, chin, jaw edge). A smooth vertical warp (a sine, so no crease) sets the eye line where the references have it. On top: almond eye whites, irises clipped to the almond (pupil + limbal ring + catchlight), a thick upper lash line (winged on the female), a lower lid line, a closed-lid line, tapered brows, a mouth opening + teeth that ride the lips, and ears with a rolled rim. |
| `js/hair.js` | a cap fitted to the skull plus **locks**: tapered three-sided blades (a ridge on top, flat underneath) grown along a path that bends with gravity and is pushed out of the head at every step. `spiky` is shingled rows of petals from the crown out, a fringe that stops above the brows, sides, sideburns and a nape; `high_ponytail` is combed-back sheets to a tie, a fountain of locks that arcs back and falls down the back on three swaying bones, a side-swept fringe and face-framing wisps. `short`, `long`, `bald` too; every other Chibi 2 id maps to the nearest (`hairStyleFor`). |
| `js/garments.js` | underwear (always on: boxer briefs / sports bra + shorts, charcoal with light bands and seams) and the test outfit (shirt, pants, boots). **A garment is the body's own surface sampled again over part of its range and pushed out along the normal**, so it carries the same skin weights as the skin under it and deforms with it in every clip. The skin a garment covers is tagged with that garment's bit and is not drawn while it is worn (`geo.js finish`): nothing can poke through, and hidden skin costs no triangles. Ids map to the nearest: any top → shirt, any bottom → pants, any shoes → boots. |
| `js/geo.js` | the mesh builder: samples a surface, computes its normals from the grid, winds every quad outward, and bakes two things into the vertex colours: **concavity occlusion** (second derivative of the grid along the normal, spacing-aware, smoothed once — grooves between muscles go darker, ridges a touch lighter) and optional **painted form shading** (a soft key from the upper front, so forms read under flat light). `finish()` drops covered triangles, computes smooth normals before dropping (so a tucked edge stays smooth), compacts, and returns one geometry. |
| `js/material.js` | ONE `MeshStandardMaterial` for everything, vertex colours, with a per-vertex roughness and glow read from a `kestrelSurf` attribute (skin, hair, eyes and cloth differ inside one draw call; eye whites and catchlights glow a little so they never go grey). Built once, never toggled (no shader recompiles). |
| `js/clips.js` | 16 clips sampled at 30 fps from small pose functions: rotations relative to the A-pose, a hips offset, **two-bone IK** for the feet (so they plant) and for hands where a pose needs a target (cast, guard, crouch, aim, interact), finger presets (relaxed, open, fist, grip, point, bow, draw). Walk / run / sprint are one gait function with different numbers (stance share, stride, lift, lean, arm swing, heel kick). Every body bone is keyed in every clip so a cross-fade never leaves a bone where another clip put it. |
| `js/expressions.js` | the face at runtime: the six expressions as bone offsets (brows, mouth corners, lips, cheeks, jaw, upper/lower lid, head tilt, gaze) blended with fades; blinking (2–5.5 s, sometimes double) by squashing each eye between its lid lines; idle glances, `lookAt`, `setGaze`; a talking jaw; ponytail sway as a damped spring on the head's motion. Only bone transforms change. |
| `js/kestrel.js` | the factory and the actor (Chibi 2's shape + `setExpression`, `setLod`), template cache keyed by the look (reference counted), clip cache per body, LOD `0 | 1 | 'auto'` (auto picks by how tall the character is on screen, measured at the last render). |
| `js/page.js`, `index.html`, `css/opus.css` | the preview page. |
| `tools/` | `shot.mjs` (Playwright screenshots against 8401), `shots.sh` (every hand-in picture), `sheet.py` (labelled sheets), `compare.py` (crop to the figure and put pictures side by side at one height), `stats.mjs` (writes `stats.json`), `review-check.mjs` (loads the shared review page and prints what it reports). |
| `tests/kestrel.test.js` | node test: both looks with and without the outfit build headlessly, budgets, the actor shape, clips (one-shots return, `dead` holds, unknown → idle, rate clamps, feet near the ground), expressions/blink/gaze limits, cache hit + reference counting, `opts.height`, `setAvatar` keeps the transform, odd looks never throw. |

Bones (64): root, hips, spine, chest, neck, head; jaw, lipU, lipD, mouthCL/R, eyeL/R, pupilL/R, lidL/R, browInL/R,
browOutL/R, cheekL/R; per side clav, arm, elbow, hand, grip, thumb1/2, index1/2, middle1/2, ring1/2, pinky1/2; leg,
knee, foot, toe; hairA/B/C. All of Chibi 2's names are real bones (`gripL/R` sit in the palm).

## Decisions (made without asking, as the brief says)

* **Proportions follow the Codex pictures more than the mockup's head count.** The single-view references are ~6.2
  heads; the brief says ~7. The heads are 0.272 m (male, 6.5 heads) and 0.26 m (female, 6.5 heads): between the two.
  Shoulders, arms, calves and thighs were measured off `male-front.png` / `female-front.png` (pixels → metres at the
  stated heights) and are heroic, as drawn.
* **Colours are graded.** The review page's lights are bright and wash pale skin out, so skin is pushed toward
  saturation and hair is brightened ~1.8× (the look's `#3a2417` would render near-black; the references show a
  reddish mid-brown). A game passing other colours gets the same treatment.
* **`aim` kneels**, as both mockup poses do. A game that wants a standing draw can ask for `ready`/`cast` today; a
  standing `aimStand` would be a cheap addition.
* **Sides follow Chibi 2, not anatomy.** `armL`, `handL`, `eyeL`… are at −x, which is the character's own RIGHT when
  it faces +z. Kept on purpose so a game that parents a sword to `gripR` today still gets the same hand.
* **`wave` and `interact` are one-shots** (they return to idle), with `attack`, `cast`, `hit`, `jump`, `dead`.
* **Hands-free clips**: nothing is held in test 1; `hold` is `null`, the grips scale to nothing under `setHandsFree`.
* **One draw call, no textures.** Detail is geometry + vertex colour (baked occlusion and form shading). A painted
  atlas would add muscle lines and skin detail, but it would not exist under node (CONTRACT §5) and the page would differ
  from the test; I spent the effort on geometry instead.
* **LOD 1** is the same surfaces sampled at about half the rows and columns, lower face detail dropped (catchlight,
  teeth, lower lash), toes but the big one dropped. Every finger stays (mittens read badly even far away).

## Look–compare–fix rounds (against `ref/`)

Each round: shoot the model at the reference angles, crop both to the figure at one height (`tools/compare.py`), list
what is off, fix.

1. **First build.** Black stripes down the face (a NaN in the lip colour for `|x| > mouth width`), banding across the
   face (non-uniform rows made the laplacian occlusion lie), mannequin body, tiny eyes, a comb of hair.
   Fixed the NaN; replaced the occlusion with grid second derivatives; first proportion pass.
2. **Proportions and colour, measured off the references.** Shoulders out to 0.25 m, bigger arms/calves/thighs,
   shorter neck, bigger head, wider A-pose, saturated skin, denser torso rows where the abs and pecs are (a groove
   needs rows closer than it is wide; the rows under the always-on underwear were thinned to pay for it).
3. **Face and symmetry.** A step in the head at eye level (the smooth-union with the neck added a constant bump below
   y = 0.12) — fixed; eyes up, nose longer and narrower, wider cheekbones, square male jaw, rounder chin, ears flared.
   One pec had a dark crease the other lacked: shapes were written for θ in −π..π but sampled 0..2π, so the −x side got
   different relief — every shape now wraps θ. A duplicated head row made a lighting band under the female eyes.
4. **Hands, hair, shading.** The forearm's wrist was 90° off (wide side to side; it must be wide front to back like the
   hand) — swapped; rounder finger tips, thicker palm. Hair: shingled petal rows, a fringe that stops above the brows,
   more rows down the back, three-sided locks (a ridge on top) to pay for them. Painted form shading on skin. Female:
   smaller nose and mouth, straighter thicker brows.

5. **Female body.** The bra was a bandeau with strings: rebuilt as a sports bra — a scoop between the cups, armpit
   height at the sides, ~3 cm straps over the shoulders (each strap point is projected back onto the body so the band
   lies flat on it), a racerback rising up the middle of the back. Stronger arm and leg relief, a bigger head.
6. **Female hair.** A side-swept swoop from a part on her left across the forehead and down past her right cheek, wisps
   in front of the ears, combed-back sheets over the whole cap (no bare band at the hairline), a spray above the tie,
   a narrower ponytail column that falls instead of fanning.
7. **Poses against the mockup's nine.** Longer strides and deeper leans for run/sprint, jump with bent arms and a
   tucked knee, a wider attack lunge, the aim targets taken from where the shoulder and head actually are in the
   kneel (the bow arm was pointing at the sky), the interact arm reaching far enough to straighten.
8. **Expressions against the mockup's six.** Brows were hidden by the fringe (fringe raised), smiles wider, all
   offsets pushed 35 %. The iris vanished behind the eye white on inward glances (the gaze range was 1.3 cm on a
   curved face): range cut in half and the iris lifted off the white. Skin warmer, forearms thicker, longer male feet.
   LOD 1 garments keep their rows (bands are rows) and sit a little further out so coarse skin cannot show through.

## Self-score against the references (1–5, honest)

| | score | why |
|---|---|---|
| Looks like the reference | 2.5 | the right characters, colours, cut and build; far from the Codex render quality (no painted detail, faceted hair) |
| Face | 2.5 | readable, both forms distinct, big eyes with lashes and catchlights; flatter and plainer than the references, ears a touch pointed |
| Body and proportions | 3 | measured off the references: broad shoulders, V-taper, six-pack, calves; muscles soft, deltoid seam |
| Hands and feet | 2.5 | five fingers each with two joints, nails, thumb ball, poses (fist, point, grip); palm boxy, toes small |
| Hair | 2.5 | both styles recognisable from every side; chunky three-sided petals instead of soft locks |
| Animation | 3 | 16 clips, planted feet (IK), finger poses, the mockup's nine poses matched in spirit |
| Expressions | 3 | all six read at a glance; weaker than the mockup's drawn faces |
| Modular (outfit swap) | 4 | body + underwear + hair + three garments as separate pieces, skin under clothes removed, one draw call, holds in every clip |
| Phone cost | 4.5 | 1 draw call, 64 bones, no textures, <12k / <3.5k triangles, cached templates |

## What I would do next

1. **A painted atlas for skin and hair** (canvas, browser only, plain colours under node): muscle separation lines,
   eyelid folds, lip edges and strand lines in the hair would close most of the gap to the references for free in
   triangles. Needs UVs from the (u, θ) grid, which every surface already has.
2. **Merge the arm into the torso** (one loft that branches at the shoulder) to remove the deltoid seam.
3. **Hair as curved ribbons with alpha-free notched tips** and more, thinner locks at the edges.
4. **Per-pose corrective shapes** (elbow/knee volume, glute under the hip flex) as bone-driven offsets.
5. **More outfits** on the same garment system (the system is the hard part; a garment is ~20 lines).



## What worked

* The surface-as-function idea: garments, body and hair share one builder; a garment fits and deforms with zero
  extra code, and covered skin disappears. The outfit makes the character CHEAPER (it hides more skin than it adds).
* IK in the clip sampler: feet plant in every standing clip; crouch, aim and guard put hands where they belong.
* Face bones on a skin mesh: smiles, frowns, an opening mouth with teeth and blinking all run on bone offsets.

## What did not (honest)

* The body reads as athletic but not as the references' carved, painted look: their muscles are drawn with sharp
  shadows that 30 columns of vertices cannot hold. The deltoid meets the torso with a visible seam (two lofts
  intersecting, not one surface).
* Faces are recognisably the two characters' types but simpler than the Codex heads: no eyelid folds, no nostril
  holes, lips are colour and a small bump.
* Hair is chunky faceted petals; the references' hair has many more, softer locks.
* Build time: ~70–150 ms warm in node for a new look; the very first build in a process pays JIT warm-up (~250 ms).
