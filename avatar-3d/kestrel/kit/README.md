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

## Thousandvale (batch 1, 2026-10-27) — the body in the game, behind `?chars=kestrel`

**The switch.** `prototypes/thousandvale/js/client/chars-mode.js` reads `?chars=kestrel`; `chibi-version.js createTvBody`
then hands the Chibi avatar to `kestrel-body.js createKestrelTvBody` (a dynamic import: without the flag nothing here
loads and the game is byte-for-byte Chibi 2.5). The shop mannequin for item icons stays Chibi in batch 1.

**Look → body** (`js/from-chibi.js kestrelLookFromChibi`): the normalised Chibi look rides along as `look.chibi`
(`{ look, race, hold }`) and is kept OFF the template cache key (`gearKey`, `hold`, `chibiBody` are on it).
* **form**: an explicit `body.form` (the editor's Body pick, `js/form-pick.js`, wired first in Thousandvale's
  `BODY_PICKS` under the switch; the server's `cleanBody` keeps it) wins; else any facial hair → masc; else long hair
  styles → fem (swap.js's rule); else masc.
* **race** = proportions (`RACE_K`): overall scale on the holder (dwarf 0.77, halfling 0.68, elf 1.03), girth
  (`P.W`), head size (`P.headH`/`P.HS`) and hand size (`P.handK`, in handLayout). Dials: Chibi height/width move
  Kestrel's mildly (±4.5 % height), roundness adds girth; both quantised to eighths so similar bodies share clips.
* **colours** from the look with a light grade (`body.grade`; the review page keeps its strong one).
* **clothes**: batch 4 — every id passes through to `clothes-catalog.js` (README "Clothing (batch 4)").
* face/hair fields pass through whole for batch 2's `faceLook` (eyes, brows, nose, mouth, ears, accessory, extras,
  hair.color2). Under a hat the hair is forced to `short` so the stand-in hat fits over it.

**Clips** (`js/retarget.js`): every clip the game asks for is baked by Chibi 2's own `createClips` for a Chibi rig with
the same hold, race and roundness (`chibiRigFor`, with the dual/angling/rest/prof clip files registered), then converted
pose by pose: `W_kestrel(b) = W_chibi(b) · off(b)`. Arms: `off` turns the A-pose segments onto "straight down, 0.12 rad
out" (`ABDUCT`, so hands clear the hips). Hands: `off(hand) = B⁻¹` where `B` puts Chibi's hand axes (+y up the forearm,
+z thumb side) on the real hand (`handLayout` d/t); the grip gets `B · q · B⁻¹`, so a weapon AIMED by a Chibi clip
points the same way, hilt through the Kestrel fist. Spine/chest and neck/head share Chibi's chest/head turn half and half;
the clavicle rides up as the arm rises; hips/root move by the leg ratio. Fix-ups per frame: **two-handers** — the left
fist is put ON the haft (a sword's at the pommel end, an axe's/halberd's further up), and if the left arm can't reach the
item is brought nearer (right arm IK); the **lute's** left hand keeps Chibi's place on the neck; **feet never below the
ground** (leg IK: Chibi's sitting shins went through the floor); **swimming** lifts the body so its neck is where Chibi's
head is (the game puts the feet a fixed depth under the surface). Fingers: a grip preset round anything held or any game
tool, bow grip, relaxed otherwise. `idle`/`walk`/`run` are hybrids: the kit's own legs, hips and spine (feet planted by
IK; `walkTV` 1.4 m and `runTV` 3.6 m per cycle) with Chibi's arms. The game's rate rule assumes Chibi's strides
(walk 2.0 m / 1.05 s, run 3.4 m / 0.65 s); `kestrel-body.js kestrelRate` converts it with `actor.gaitDistance()`.
Clips are cached by body build + hold (+ the two-hander's id); only idle/walk/run/ready are baked up front (in slices),
the rest the first time they play (~2 ms each). One-shot / hands-free meanings are Chibi's (`isOneShot`, grip-scale
tracks); `setHandsFree` still forces the grips to nothing.

**Gear** (`js/gear-bridge.js`): Chibi 2's builders (`buildCape`, `buildDecor`, `buildHeld`/`buildOffhand` + the fh_/tv_
weapons, the g5_ capes/packs/decor/rings/held/offhand, and `buildChibiHat` — a byte-identical extraction from
chibi2.js) run against a collector whose `add` keeps pieces in Chibi bind space; each vertex then moves by what it hangs
on: **grip** → resized (`js/hold-scale.js`: the fist zone keeps a hand's size, the rest stretches — sword ~0.9 m,
staff ~1.6 m; bows/books/shields scale uniformly) and turned by `B`; **torso** (chest/hips) → by surface: same landmark
height, same angle, same distance out of Chibi's torso put that far out of Kestrel's (plus the shirt), shoulder-ball
pieces (mantles, straps over the top, pauldrons) onto the deltoid; near the skin it takes the skin's weights, a cape's
tail behind the legs follows the thighs a little; **head** (hats) → Chibi's skull box onto Kestrel's (stand-in until
batch 3); **limb** → along the Kestrel segment, thinned. Merged into the body geometry: still ONE draw call; metal is a
negative glow in `kestrelSurf` (material.js reads it as metalness). The accessory slot (glasses, masks, scarves, torcs)
is the face's (`face-acc.js`), not the bridge's; rings stay here.

**The actor** in "Chibi mode" also has: `hold` (Chibi's `{right,left,twoHand,dualTwo,dual}`), `parts.handR/L` and
`parts.gripR/L` as frames with Chibi's hand axes riding the bones (the game hangs tools/rods/fish there and reads gripR's
-Y as the blade; the bones keep their names for `getObjectByName`), `gaitDistance(name)`, `faceFrame()` (portraits),
`freeze(t)` (screenshots/tests).

**In the game (under the switch only)**: `KESTREL_MOUNT_SCALE` 1.12 (actors.js; the 1.38 was for a chibi head), the far
instanced crowd at real proportions, portraits framed by `faceFrame` and cached as their own version (`p2…k`). Name
plates, the click volume, camera focus and carts read the body's own height/bounds and needed nothing.

**Numbers** (node, this VM): with gear 10.3k–11.4k triangles over 128 class×race×seed looks (worst: an elf druid, 11,409
incl. 1,998 of gear — the clothes hide more skin than the gear adds), 1 draw call, 64 bones; a new look 93 ms median /
112 ms p90 (first in a process ~300 ms); a clip ~2 ms. In the game under SwiftShader (no GPU) a 30-body crowd took 108 s
to be all built against Chibi 2.5's 71 s in the same harness, both at the same (SwiftShader-bound) frame rate.

**Stand-ins / later batches**: all done — hats (batch 3), clothes (batch 4), the icon mannequin, two-handed tool swings
and LOD 1 in the game (batch 5).

**Tools**: `tv.html` (+ `js/tv-page.js`, `tools/tv-pose-shots.mjs`): real Thousandvale looks in any game clip, Kestrel
or Chibi side by side, frozen at a time — against 8401. `tools/tv-shots.mjs`: screenshots in the real game (its test
server, `?chars=kestrel`, lined-up client-only characters, `--chibi` to compare); the set is in `shots/tv-batch1/`.
Tests: `tests/tv.test.js` (node), `prototypes/thousandvale/tests/D/kestrel.spec.js` (Playwright).

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

## Faces and hair (batch 2, 2026-10-27)

Every face part and hairstyle a Chibi 2 / 2.5 / Thousandvale look can name is built here at realistic proportions
(not a scaled chibi part). Review sheet: **`faces.html`** (`?slot=hair|headShape|eyes|pupil|iris|brows|nose|mouth|ears|
facialHair|accessory|extras|expressions|combos|clips`, `&body=both|male|female`, `&view=front|three|side|back`,
`&frame=head|face|bust`, `&ids=a,b`, `&views=front,side,back`); screenshots in `shots/batch2/` (19 sheets, incl. `polish-long-hair.png`)
(`tools/faces-shot.mjs`). Test: `tests/faces.test.js`.

### Files

| file | what it does |
|---|---|
| `js/face-catalog.js` | **the catalogue**: `FACE_IDS` (every id per slot), what each id means as numbers (`HEAD_SHAPES`, `EYE_SHAPES`, `BROW_SHAPES`, `NOSE_SHAPES`, `MOUTH_SHAPES`, `EAR_SHAPES`, `RACE_EARS`), and `faceLook(look)` — the one normaliser (ids → valid ids, unknown → nearest by alias table then word rules, numbers clamped, colours checked). Pure data, no Three.js. kestrel.js puts its result on `n.face` (cache key) and `P.face` (what every builder reads). |
| `js/face.js` | the head surface + face pieces, now reading `P.face`: head shapes reshape the row table (width by chin / jaw / cheekbone height, squareness, face length through `headWarp`), noses and mouths reshape the features (tip, ridge, wings, ball, hook, upturn, a snout pad; lip width / fullness, the lip line for cat / wavy mouths), eyes reshape the almond (`eyeOutline`), and `faceParts` builds eyes / pupils / catchlights / lashes / brows / mouth / teeth / fangs / tusks / tongue / stitches / ears. `eyeMetrics(P)` also hands the face driver the wink, never-blink, mouth rest pose and hair swing. |
| `js/face-beard.js` | facial hair: a **shell** = the face sampled again and pushed out by a coverage map, diving under the skin where the beard stops (no rim) and carrying the face's own skin weights (so it opens with the jaw and moves with the lips and cheeks); triangles where nothing grows are dropped (`FACE_COVER.UNUSED`) and the skin under a thick beard is not drawn (`FACE_COVER.JAW`). Moustache strip on the lip / corner bones; handlebar tips; long / forked locks, a van Dyke point and a braid hang from the chin on the jaw bone; stubble is paint only. |
| `js/face-marks.js` | the `extras` slot: soft areas as head **paint** (vertex colour layers under the eyes and brows: blush, burn, dirt, mud, eye black, war mask, rot) and crisp marks as **decals** (strips and discs laid 0.5–1.2 mm on the face with its skin weights: scars, stripes, glyphs, freckles, dots, star, moon, tear, brand, stitches, wrinkles, the third eye). `markSkin` turns the skin colour for `undead_skin` / `pale` (applied in kestrel.js normalize, before the body is built). |
| `js/face-acc.js` | the `accessory` slot: frames 11 mm in front of the eyes (lids, lashes and brows move behind them), temples along the skull; sunglasses / goggle lenses; monocle + chain; eyepatch + strap; blindfold; cloth masks (the face sampled again, draped from the nose, skin under it dropped: `FACE_COVER.LOWFACE`); earrings at the lobes; a nose ring; and the neck pieces laid on body.js's neck / torso surfaces with their weights, outside a shirt when one is worn (torc, scarf, striped / trailing scarf, cowl, neckerchief, pendant, prayer beads). |
| `js/hair-kit.js` | the **hair toolkit**: `cap` (the shell on the skull: hairline → crown; shaved, puffed, bumpy, a tonsure ring), `lock` (the opus2 blade, plus colour-2 tips, round locs, spiral curls, waves, LOD-minor), `tube` (braids with alternating lobes, rolls, ties, horns, cornrows), `blob` (buns, puffs, beads). Every point is asked of the skull; every lock is pushed out of the head, the ears it goes round and the body (neck, torso, deltoids) at every step; hanging hair is skinned head → neck → chest by height (`bodyW`), tails and braids ride `hairA/B/C` (`springW`), loose backs get a spring share at the tips (`looseW`). |
| `js/hair.js` | **44 styles**, one function each in `STYLES` (`spiky` and `high_ponytail` are opus2's approved hair, unchanged), `STYLE_INFO` (ears over / free, swing, where the spring bones sit), `hairChain(P)` (faceLandmarks places hairA/B/C for the style), `hairSwing`, `hairUnderHat`. |
| `js/face-build.js` | builds the head for one look (head skin with paint + cover mask, face parts, hair, beard, marks, accessory) and returns the cover bits to drop. kestrel.js calls this one function. |
| `js/form-pick.js` | the "Body" pick (masc / fem → `avatar.body.form`) for a character editor, shaped like Thousandvale's `BODY_PICKS` entries. **Not wired** (batch 2 does not edit Thousandvale): add `BODY_FORM_PICK` as the first entry of `BODY_PICKS` in `prototypes/thousandvale/js/client/ui/appearance-core.js`. |

### Slots (ids → how each is built)

| slot | ids | built as |
|---|---|---|
| headShape (7) | oval (= opus2) round square heart long wide chiseled | row-table widths at chin / jaw / cheekbone, squareness of the lower face, cheekbone + jaw-edge strength, face length |
| hair (44) | see `hair.js` STYLES; `bald` = none | cap + locks / tubes / blobs; `color2` = tip colour (twin_tails, locs, long_braid) |
| eyes (24) | almond (= opus2) round narrow wide sleepy angry dot anime happy wink hollow slit tired glow cat doe droopy sharp button sparkle hooded lashes heart storybook | the almond's width / top / bottom / tilt / inner drop / lower-lid arch, iris size, lash thickness + flick, lower lashes, catchlights 1–3, lid crease (hooded), bags (tired); wink = left eye held shut by the driver; hollow = dark socket + a faint lit point; glow = the eye colour at full brightness, lit; dot / button / storybook = all-iris |
| pupil (8) / iris (5) | round slit dot star heart cross ring none / normal large small ring none | the pupil is its own outline on top of the iris (polar shapes, the heart curve); iris size and ring colouring; `colorR` = the other eye's colour, `white` = eye white, `height` scales the eye, `blink: false` = never blinks |
| brows (16) | straight arched angry worried thick thin none raised bushy unibrow slanted soft split dots curved bold | one tapered strip between browIn/browOut (arch, slant, lift, thickness, taper, length); bushy = ragged top edge; split = two strips; dots = one oval; unibrow = a bridge strip on both inner bones; `thick` multiplies |
| nose (12) | small (= opus2) dot button long wide hook upturned none snout pointed round flat | head-surface features: tip, ridge width, wings, bridge, tip ball, hook bump, upturn; snout = a flat forward pad with forward nostrils |
| mouth (20) | neutral (= opus2) smile frown open grin smirk o tongue fangs sad_open stitched tusks laugh cat pout gritted wavy buck fang shark | a **resting pose** of the mouth bones under every expression (MOUTH_SHAPES.rest, read by expressions.js) + lip width / fullness + geometry: upper / lower teeth rows behind the lips (shark = sawtooth), fangs / buck teeth from the upper lip, tusks from the jaw, a tongue tip on the lower lip, stitches across the lips |
| ears (11) | normal small big pointed long_pointed swept notched fins none cat_ears wolf_ears | the rim outline with a sharpened tip (length, angle up → back), V notches, a ribbed fin; cat / wolf ears stand on the head (over the hair); `scale` multiplies; no ears named → the people's first (RACE_EARS: elf → pointed, halfling → pointed, orc → notched …). Plain ears under hair that covers them are not drawn; pointed ones poke through |
| facialHair (15) | none stubble goatee mustache full long chinstrap soul_patch braided_beard mutton_chops handlebar van_dyke short_beard forked_beard sideburns | `face-beard.js` BEARDS: zones (full, goatee, point, chops, strap, patch, burns) + thickness + moustache + hanging pieces; `color` (default the hair colour) |
| accessory (20) | none glasses round_glasses monocle eyepatch mask scarf_mask goggles earrings nose_ring blindfold sunglasses g5_torc scarf_trailing scarf_cowl scarf_striped neckerchief scarf pendant prayer_beads | `face-acc.js`; `color` / `color2` |
| extras (31) | none freckles freckles_heavy freckles_nose blush blush_soft scar scar_cheek scar_brow scar_lip burn_scar warpaint war_stripe war_mask cheek_stripes eye_black face_glyphs paint_dots third_eye wrinkles dirt mud blood brand undead_skin pale beauty_mark chin_lines tear_mark star_mark moon_mark | `face-marks.js`; `color` overrides the ink |

### Polish pass (2026-10-28, after the coordinator's review)

| item | before | after |
|---|---|---|
| neck pieces | torc buried in the trapezius (invisible); scarves projected onto the torso, so they sat as a wide ring on the collarbones | `ringAt` lays a ring round the OUTSIDE of the neck and the trapezius at that height: the torc sits mid-neck (visible gold ring), scarves wrap the neck's base and rest on the trapezius, ends hang from it |
| open-mouth teeth | one white band (7 columns), filling the opening | 21 columns per row, a dark gap between each two teeth, gum-edge shadow, darker at the sides, 18% shorter rows; the mouth interior is darker (0.55 → 0.16 of the mouth colour), so it reads between the rows |
| default eye colour | `#4a2a16` rendered near black | a dark iris is lifted to a readable mid tone (hue kept, luminance ≥ ~0.045 linear) |
| default beard colour | the hair colour, then shaded to 0.78 → very dark | 1.45 × the graded hair colour, clump shading 0.8–1.08 |
| glow eye with brown | peach (the hue normalised then mixed toward white) | the hue normalised and pushed away from grey ×1.9 (brown → amber), a hot pale core, a saturated rim |
| long / wavy | flat dark slabs beside the face | `layeredLong`: a parted cap, a 14-lock crown layer standing off the skull, 3 face-framing locks a side swept from the part past the temple to the jaw, layered sides and back with ragged ends; wavy = an off-centre part and real waves (`lock({ wave })`: the path swings side to side, growing to ~1.6 cm at the tips) |
| side_part, feathered, bangs, bob, half_up, wolf_cut, court_cut | wide flat sheet locks | `curtain` locks 14% narrower and 40% thicker (a ridge, the cap showing between them), ragged lengths; bob / court_cut get the crown layer; half_up combs thinner strands to its knot; thicker swept locks on side_part / feathered |
| ponytail hairline | jagged roots at the hairline | the combed strands start 1 cm above the cap's own smooth hairline, which carries combed grooves to the tie |
| beard top edge (full, short_beard, braided_beard, all `full` zone beards) | a hard stepped line on the cheek | a ragged (hair-like) cheek line, a 2 cm fade, more rows through it, the shell thinning to the skin, the edge stubble-toned, and stubble paint ~1 cm above the edge |
| beard mass | a flat dark shell | lock relief: thickness and colour vary in clumps running down the jaw |

Budgets unchanged (re-spent, not raised): worst single id 11,994 at LOD 0, LOD 1 ≤ 3,468, the heaviest hair × beard pairs ≤ 12,000 (the braided beard's braid went 5 → 4 sides to pay for the denser beard rows).

### The hat API (for batch 3)

*(Superseded by "Hats (batch 3)" below: `buildFace({ …, hat: planHat(…) })` carries the cut line, and hair-kit.js re-roots / tucks rather than presses.)*

```js
import { hairUnderHat } from './hair.js';
const { underHat } = hairUnderHat(look.hair.id, hatId | { front, back });   // brim height in head space at the face / nape
buildFace({ P, n, colors, lod, parts, add, hatFit: underHat });            // face-build.js: the hair is cropped to fit
```

Under a hat the cap lies 3 mm off the skull, every lock / tube / blob wholly above the brim is dropped, and the parts
of hanging pieces above it are pressed inside the hat's reach (tails, braids, long backs and side curtains below the
brim stay). Defaults: a cap / hat brim at y 0.178 front, 0.11 nape; helms / hoods / coifs 0.15 / 0.06. A hat should be
built over `makeHeadSurface(P).at(y, θ, { noFeatures: true })` + ~6 mm to clear the cropped hair.

### Rules that keep it working

* Head space is metres for a 0.24 m head, y up from the chin, +z forward, θ = 0 at the nose; `headToWorld(P, p)` maps
  it (with the head shape's length warp). Put anything new on the face with `makeHeadSurface(P).onFace(x, y, off)` and
  skin it with `headWeights(p, S)` — then it moves with the jaw, lips and cheeks for free.
* New cover bits live in the high bits (`FACE_COVER`, 1<<24 up) so garments can keep adding low bits in geo.js COVER.
* A look with nothing set builds the opus2 face and hair exactly (oval, almond, straight / arched, small, neutral,
  normal; spiky / high_ponytail with their original cap).
* `tests/faces.test.js` builds every id of every slot on both bodies at LOD 0 and 1 against the budgets, the heaviest
  hair × beard combinations, dressed characters with everything on, nearest-id mapping, the wink / blink / expressions
  with a beard and glasses, a resting mouth, under-hat cropping and build time.

## Hats (batch 3, 2026-10-28)

Every hat a Chibi 2 / 2.5 / Thousandvale look can name — the 2D catalogue's **37 hats** (`partIds('hat')`), which covers
the **24 Thousandvale's data reaches** (class outfits, tier-2 outfits, `gear-look.js` ARMOUR_LOOK / ARMOUR_BY_BASE, monster
looks) — rebuilt at realistic proportions around the Kestrel head and every hairstyle. Not a scaled Chibi part: the
Chibi builders were only read for what each hat IS. Review sheet **`hats.html`** (`?mode=grid|turn|clips|expr|classes`,
`&body=both|male|female`, `&hairs=short,long,ponytail`, `&ids=`, `&views=front,three`, `&beard=`, `&ears=`, `&emblem=`,
`&quality=`, `&lod=1`); screenshots in `shots/batch3/` (`tools/hats-shot.mjs`). Test: `tests/hats.test.js`.

### Files

| file | what it does |
|---|---|
| `js/hat-catalog.js` | pure data: `HAT_IDS`, `HAT_INFO` (kind, default colours, what the hat does to the head: hair `crop`/`none`/`keep`, ears `show`/`hide`/`tips`, beard, face, accessories, neck), `hatIdOf` (unknown → nearest by its words, then `cap`; never throws), `hatLookOf(look)` (from `look.hat` or the Chibi look a Thousandvale look carries; colours checked, quality 0–3, emblem) |
| `js/hat-kit.js` | the toolkit, head space, every piece a parametric surface (geo.js): `shell` (a dome fitted to the skull from a rim line to the crown, with a rolled, turned-under edge), `plate` (cheek guards, visors, tails — outer face, turned edge, inner face), `lathe`, `brim` (a ring with real thickness and a rolled edge), `tube`, `blob`, `loop`, `drape` (cloth / mail on the head, neck and shoulders carrying THE SKIN'S OWN WEIGHTS — the face's at the jaw, the neck's, the chest's — with the deltoids kept out). Distances are measured along rays from `HAT_C0`; `atY` corrects the ray's slope so "height y, this far off the skin" lands at height y; `keepOff` keeps every hat vertex ≥ 6.2 mm off the skin |
| `js/hats.js` | one entry per id: `fit(θ)` (the lowest edge of what covers the skull on bearing θ — the hair is cut to it), `build(K, h)`, and for bands `band` (where they sit on the hair) / for the war helm `avoid` (the nasal) |
| `js/hat-build.js` | **the one entry point**: `planHat(hat, face)` (what the hat does to the head), `buildHat(plan, ctx)` (the hat into the same mesh, inside the budget), `hatFitFor(look)`, `bandFit` (face-build's helper for bands), `HAT_COVER` bits (SCALP 1<<28, FACE 1<<29, NECK 1<<30, LEAN 1<<23) |
| `hats.html`, `js/hats-page.js`, `tools/hats-shot.mjs` | the review sheet and its screenshot tool |

### Wiring (kestrel.js — done, every line marked `// batch 3:`)

```js
import { hatLookOf, planHat, buildHat } from './hat-build.js';
// normalize(look): a Chibi look under a hat keeps its own hair (from-chibi.js swaps it for 'short' for the stand-in),
out.hat = hatLookOf(L);                                      // and the hat is part of the template cache key
// templateSteps:
const hatP = planHat(n.hat, n.face);
add(parts.neck, { …, mask: hatP ? (y, th) => hatP.neckMask(y, th) : 0 });
const faceB = buildFace({ P, n, colors, lod, parts, add, hat: hatP });
…garments…, hide assembled…
if (hatP) hide |= buildHat(hatP, { P, n, colors, lod, parts, add, MB, hair: faceB.hair, hide }).hide;   // LAST: it counts what is drawn
buildGearGeometry({ chibi: hatP ? { ...n.chibi, look: { ...n.chibi.look, hat: { id: 'none' } } } : n.chibi, … });   // no stand-in hat
```

The gear bridge needs no edit (it is handed the Chibi look with the hat taken off). **For batch 1:** `from-chibi.js`
can drop its "hair under a hat → 'short'" line now (kestrel.js already undoes it), and the hat branch of
`gear-bridge.js collectChibiGear` (`C.phase = 'hat'`) is dead code for Kestrel bodies.

### What a hat does to the head

| | how |
|---|---|
| hair under it | cut at the hat's edge (`fit`, the lowest edge within ±14° — a hair blade is up to 5 cm wide — less 2 mm). hair-kit.js (batch 3 edits, marked): a piece wholly under the hat is not built; one that comes out from under it is **re-rooted** on the skull just under the rim and resampled; one that curls back up under the hat is **tucked** in at the rim; any vertex of a kept piece above the lip is tucked down under it; under a hood, coif, aventail or pelt (`drop`) hair rooted under the cloth is left out and hair in the face opening stops at the jaw (`floor`); a war helm keeps its nasal clear (`avoid`). The hair cap under a hat is pressed to 3 mm and its part more than 1.2 cm above the edge is dropped with the scalp |
| bands (circlet, headband, feather band, flower, crown, headdress) | sit ON the hair: face-build builds the hair once, `bandFit` measures it (the hair cap — the volume — over the band's whole height; locks up to the median round the head), then the hair is rebuilt **cinched** just inside the band over its height, easing off over 3 cm, with extra rows where a lock passes it |
| ears | `hide` (helms with guards, hoods, coifs, closed helms: not built), `tips` (caps, brimmed hats, open helms: shown; the hat's edge lifts over tall ears — a notch sized from the ear shape: pointed, long, big, fins) |
| face | closed helms and whole-head pieces (great helm, dragon helm, armet, pumpkin, ghost sheet): no face pieces, no hair, no beard, no accessories, all head skin dropped — the helm is all there is to see (re-spent on the helm) |
| beard | closed: none; hood / coif: the shell and moustache only (a braid or a long hanging beard would go through the throat); otherwise all |
| accessories | `face` kinds (helms, hoods): neck pieces and earrings go; closed: none |
| neck skin | under a mantle / aventail / pelt / sheet the back half of the neck is dropped |
| skin weights | covering pieces ride the head bone alone (checked); drapes take the weights of the skin under them (the jaw's, the neck's, the chest's, a share of clavicle / arm at the deltoid) |
| fallen hood | hanging hair lies over it (`bodyPad`: hair-kit keeps it 5 cm further off the back and shoulders) |

### Budget

`buildHat` runs last and counts the triangles already in the mesh that will be drawn; if the hat does not fit
under 12,000 (LOD 1: 4,000) it steps down: fewer columns (lean 1, 2), then no emblem, then fewer still (lean 3; small
studs, gems, beads and the headdress's outer feathers go), then the hair's minor locks (the ones LOD 1 never builds:
`HAT_COVER.LEAN`). Under a covering hat most of the hair and scalp is gone, so a helm usually spends what it frees.

### The ids

| kind | ids | built as |
|---|---|---|
| soft caps | cap, leather_cap, bandana, feather_cap (bard_red_feather), goggles_up, bolt_crown, toadstool_cap, g5_cloth_wrap | fitted shells with a rolled edge; a peak, ear flaps + ties, a knot + tails (left off when hair hangs there), a turned band + feather, an aviator cap with goggles on a strap, a flat-top + neck bolts on the NECK's weights (+ a stitched scar when no fringe covers it), a mushroom cap with gills and spots, a wound headwrap with three turns, a jewel and a loose end |
| brimmed | wide_brim, straw, top_hat, tricorn, wizard, witch_hat, candy_corn_hat, g5_leather_slouch | a band ring on the skull (leaning with the head), a crown lathed off it, a brim that stays flat over the hair next to the head and droops beyond; tricorn walls with three points + cockade, bent cones, candy bands, a slouch pinned up on one side with a pin and feather |
| open helms | helmet, horned_helm, rune_helm, war_helm, plate_helm, g5_mail_cap, wolf_helm | steel shells with a rolled rim, ridge, studs; horns; a rolled rim + glowing rune band; a nasal, cheek guards and a mail curtain on one continuous lower edge; a bascinet with a raised visor, a sallet tail and a plume; a conical cap with ribs, finial and a mail aventail drape; a wolf's head (muzzle, eyes, ears) with the pelt down the back and its forelegs knotted on the chest |
| closed | great_helm, dragon_helm, g5_plate_armet, pumpkin_head, ghost_sheet | a barrel of its own shape (nose and jaw room), eye slit, trims, breaths, crest / horns / snout / plume, a dark underside 1.4 cm off the real neck; a ribbed pumpkin with a lit carved face and stem; a sheet over the head with a poncho hem and dark eye holes |
| hoods | chain_coif, hood, hood_down | a shell with a gentle rim + a drape whose front edge is the face opening (down the cheeks, then closing under the chin / a V at the throat), mail rows / a lining and a turned edge; the fallen hood is a cowl round the neck and the empty hood on the back |
| bands | crown, circlet, headband, feather_band, flower, bone_headdress | rings at the measured hair face with points and gems, a gem, ties at the back laid over the hair, two feathers, a five-petal flower with leaves at the temple, a beaded band with a fan of feathers and small horns |

Colours: `color` / `color2` as Chibi (each id's Chibi default when unset); `emblem` / `emblemColor` (tier-2 armour)
put chibi2-armour2.js's picture on the brow on a disc; `quality` lifts the trim and the gems' glow.

### Measured (tests/hats.test.js)

All 11 pass (`node --import ./avatar-3d/tests/three-register.mjs --test avatar-3d/kestrel/kit/tests/hats.test.js`, ~3.5 min):

* every id on both bodies × short / long / ponytail / spiky / bald at LOD 0 and 1: ≤ 12,000 / ≤ 4,000, one draw call
  (sheets: max 11,986 at LOD 0; LOD 1 sheet max 3,216); unknown and odd values never throw;
* the heaviest hair (spiky, braids, long, locs, twin tails, warrior braids) × beard (long, braided) × every hat with an
  emblem and quality 3, both bodies (888 builds): all ≤ 12,000 / 4,000 (the budget steps above did the fitting);
* **no hair vertex outside a covering hat** (every covering hat × 16 hairstyles × both bodies: each hair vertex above
  the cut line is inside the hat's inner face on its ray) and **no hat vertex nearer the skin than 6 mm**;
* **no hair triangle crosses a hat triangle** — exact triangle/triangle intersection, all 37 × 6 hairstyles × both
  bodies (bands included: the cinch keeps the hair inside them);
* covering pieces and the hair under them ride the head bone alone, so the bind-pose checks hold in every clip,
  expression, blink and head turn; drapes carry the skin's weights;
* the most any expression raises a brow (measured in the head bone's frame), on the bushiest brows: never reaches a hat;
* no ear triangle (normal, pointed, long pointed, big, fins) crosses any hat that lets the ears show;
* the plan (closed helms, hoods, bands), colours / emblem / cache keys, the Thousandvale path (Kestrel hat, no stand-in,
  own hair kept), a new hatted look built in < 150 ms warm (40–120 ms seen; ~160 ms for the first build in a process).

Batch 2's `tests/faces.test.js` still runs against the changed hair-kit.js / face-build.js.

### Approximate / not done

* **Clips are checked by argument plus pictures, not by skinning every frame**: the head-rigid check covers hats and the
  hair under them; drapes (hood mantle, coif, aventail, pelt, sheet) follow the skin they lie on but are not
  intersection-tested per pose — `shots/batch3/clips-*.png` show walk / attack / cast / hit / dead; a raised arm can
  still meet a mantle's hem at the deltoid.
* **An afro under a covering hat is pressed flat** (its volume is its hair cap); under a band it wears the band on its
  surface.
* **Bands cinch the hair**: long or spiky hair is drawn in at the band, a visible change in the hair's shape.
* Under hoods / coifs / aventails long hair is tucked in (left out behind, stopped at the jaw in front); a fallen hood
  pushes hanging hair 5 cm off the back.
* A Thousandvale character's totals include batch 1's held gear (staves, capes) merged after this budget is counted:
  the class-look sheet reaches 12,805.
* The notch over tall ears is sized from a table of ear heights (`EAR_TOP`); a new ear shape needs a row there.
* Mail is alternating rows of colour and relief, not modelled rings; the ghost sheet and pumpkin carvings are dark /
  lit shapes laid on the surface, not holes.

## Clothing (batch 4, 2026-10-28)

Every top, bottom, pair of shoes and pair of gloves a Thousandvale look can name is built for the realistic body — the
batch-1 stand-in (any top → the kit shirt, any bottom → trousers, any shoes → boots) is gone. Review sheet:
**`clothes.html`** (`?slot=top|bottom|shoes|gloves|wardrobe|wardrobe2|clips`, `&body=both|male|female`,
`&view=front|three|side|back`, `&views=front,side,back`, `&ids=a,b`, `&race=dwarf`, `&anim=walk&t=0.3`, `&frame=body|legs|bust|hands`,
`&clips=run:0.2,sitGround:1.2` for the `clips` sheet); screenshots in `shots/batch4/` (`tools/clothes-shot.mjs`), in-game ones
in `shots/batch4/game/` (`tools/tv-shots.mjs --out …`). Tests: `tests/clothes.test.js`; no-clip report: `tools/clothes-clip.mjs`.

### Counts

| | catalogue rows | reachable from Thousandvale | where they come from |
|---|---|---|---|
| tops | 41 | 27 | class outfits t1 / t2, `class-outfits-tv` wear, PLAIN (`tshirt`), ARMOUR_LOOK / ARMOUR_BY_BASE, the g5 sets, humanoid monsters; plus every Chibi 2 / 2.5 style id and the kit's own `shirt` |
| bottoms | 17 | 12 | (same) — trousers, leggings, breeches + stockings, baggy (bloused), shorts, ragged (torn), greaves (+ knee cops), skirts, kilt (pleats), loincloth (two flaps), the g5 pleats / chaps / chausses / cuisses, long / pleated skirts, wide trousers |
| shoes | 17 | 12 | boots, heavy, shoes, sneakers, slippers, sandals (sole + straps, the foot stays skin), barefoot / hooves (nothing), pointed, foot wraps, curl-toes, cuff boots, splints, sabatons, knee / ankle / soft boots |
| gloves | 5 | 4 | cloth hand wraps (palm + finger bases), leather gloves, mail mitts, plate gauntlets (flared cuff), plain `gloves` |

`tests/clothes.test.js` fails if any reachable id has no row of its own. An unknown id goes to the nearest row of its kind
(`clothesLook`: Chibi 2's style table first — its sleeve / hem / armour words — then word rules, then tunic / trousers /
boots); `barefoot` / `hooves` are no shoes.

### Files

| file | what it does |
|---|---|
| `js/clothes-catalog.js` | **the catalogue** (pure data): per id the layer (1 shirt · 2 tunic · 3 mail / coat / robe · 4 plate → `LAYER_OFFSET`), material (cloth, linen, silk, leather, fur, quilt, mail, scale, plate, brigandine), sleeve (`to` none / cap / short / elbow / forearm / wrist, `shape` fit / bell / puff / rolled / wide / mail, `under` = the shirt under a vest), neckline, hem (waist / hip / seat / thigh / aboveKnee / knee / calf / floor; `open` = split up the front), flare, front detail, belt, extras (pauldrons, tassets, fauld, flutes, gauntlet cuffs, bracers, cuffs, collar rim, fur trim, hood down, lapels, tabard, peplum, apron, jagged hem, mail skirt, hem trim, stole, yoke, studs, shirt front, wraps). Bottoms: fit, how far down, extras, `skirt` (hem, flare, pleats, `arcs` for flaps). Shoes: shaft height, foot kind, cuff. Gloves: cover, cuff length. `clothesLook(look)` → the rows + colours (color, color2 = trim, quality ≥ 2 = gold trim, emblem); `skirtOf` / `strideOf`. |
| `js/clothes.js` | `planClothes(...)`: the surfaces, the cover bits, what is hidden, the hand masks, the skirt profile and `outer` (for the gear bridge). |
| `js/skirt.js` | skirt bones: weights, the per-clip drive, the leg description. |
| `tests/clothes-check.js`, `tests/clothes-looks.js` | the no-clip measurement and the Thousandvale looks it dresses (class wardrobe, in-world gear looks, one look per long garment, races). |
| `clothes.html`, `js/clothes-page.js`, `tools/clothes-shot.mjs`, `tools/clothes-clip.mjs` | review sheet, its screenshots, the no-clip report (`node --import ./avatar-3d/tests/three-register.mjs avatar-3d/kestrel/kit/tools/clothes-clip.mjs wardrobe|worn|long|races [clips=core|game|a,b] [only=…]`). |

### How a garment is built

* **One shell per top, hem to collar.** Rows run in real height. Above the hip joint (+6 cm) a point is the torso skin
  point (relief smoothed by `bump`) pushed out along the grid's own normal by the layer's thickness (+ a little more over
  the shoulders, where the skin turns with the clavicle and arm, + 6 mm where trousers are under it). Below it the shell
  is a **skirt**: in each direction its radius is the larger of the torso's (plus the layer) and the **support function of
  both legs** (with whatever is on them: trousers, boot shafts, greaves) plus a clearance — so it encloses them — it never
  narrows on the way down, and `flare` bells it toward the hem. One surface from hem to collar: no ledge where a robe's
  body meets its skirt. Split coats (`open`) open from the waist down (the columns' angles close up toward the waist).
* **Sleeves** are the arm re-sampled (with the arm's own shoulder-patch rows, winding and normals, as the shirt did); a
  sleeve to the wrist stops 2 cm short of the wrist's own bend, and a bell sleeve that hangs past it never takes the hand's
  weight (`wristCap`). Elbow sleeves stop above the elbow's bend. Collars (high, gorget, fur, hood down) are the neck
  re-sampled; pauldrons the arm's patch from half way up (over the top and outside only — clear of the front / back folds).
* **Trousers, stockings, greaves, knee cops, cuisses, boot shafts** are the leg re-sampled on its own rows; shafts use the
  trousers' own relief smoothing so the same relief is under both; trousers under a low shoe end just inside its top.
* **Shoes** are a foot shell per kind (boot, heavy, slipper, pointed, curl-toe, sabaton, wrap) on the foot / toe bones;
  sandals are a sole and straps over the bare foot. **Gloves** are every hand piece (palm, four fingers, thumb) sampled
  again a few millimetres out with the finger bones' weights, so a fist curls the glove; a cuff runs up the forearm (a
  gauntlet's flares).
* **Belts, sashes, straps, wraps** are laid on the OUTERMOST garment at their height (`outerAt`), with its weights; a
  sash's tails sit on the garment's own rows and columns (one facet of it pushed out), so they bend exactly where it does.
* **Relief** is vertex colour (seams, quilting, mail grain and courses, scales, plate highlight and lames, rivets, laces,
  buttons, fur, patches) plus pads where the rows are dense enough (breastplate ridge, flutes, lapels, straps, quilting).
  Metal is a negative glow (material.js → metalness). Still ONE draw call, no textures.
* **Tier 2**: colour2 is the trim (hems, cuffs, bands, lapels, collar rims); the class emblem on chest and back and the
  `t2_*` kits (pauldrons, mantle, harness, vestments, wild mantle) are Chibi's own builders (`buildArmour2`) moved by the
  gear bridge onto the outermost layer.

### Layers and what is hidden

skin < underwear < trousers / bottom skirt < boot shaft < shirt / tunic < mail / coat / robe < plate < greaves < collars,
pauldrons, cuffs, bracers < belts, sash tails, apron < gear (capes, packs, belts, quivers). Each is thicker than the one
under it wherever they meet. What a garment fully covers is tagged (`CLOTH_COVER`: TOP, BOT, SHOE, GLOVE, ROBE, TOPOVER,
SHAFT, GREAVE, CUFF; geo.js COVER keeps the underwear's) and dropped at `finish` — the skin under a shirt, the briefs under
trousers, the trousers' waist under a tunic or robe (and under a split coat, all but the slit), the thighs (skin, briefs,
trousers) inside a closed knee-or-longer skirt, the trousers inside a boot, a sleeve's end inside a glove, a boot shaft
under a greave, the neckline under a collar, the hand under a glove. That is what pays for the clothes.

### Long garments: skirt bones

A look that hangs cloth below the crotch (robes, gowns, dresses, long coats, tunics to the seat, tassets, mail skirts,
kilts, skirts, loincloths, aprons) gets **6 skirt bones** (rig.js, appended after every other bone at the hip joint: 70
bones, the ceiling; every other look keeps 64). Skirt weights (`skirtWeights`): a **thigh share** — the cloth just under
the hip on each side follows that thigh, as trousers do (62 %; 85 % on a short skirt; nothing above the hip joint, where
cloth would swing back into the body) — then the two skirt bones nearest its direction, handed over from the hips by
depth, then the hips. On every baked clip (kestrel.js `clipFor`), `driveSkirtClip` reads the clip's own leg quaternions,
puts points on the legs' surfaces (thigh and shin rings, the foot, with what is worn on them) in hips space, and for each
bone finds the smallest tilt for which the cloth — the exact blend skinning will draw — is not crossed by any leg's path
out of the skirt (point → its knee → its hip, in the half-plane at its angle); where no tilt can do it, the bone spreads
the cloth. A leg leaving under the hem is fine; a leg in a coat's split or beside a flap pushes nothing; a static pose
reuses the last frame's answer. The **stride** (`strideOf` → `rig.stride`, read by the kit's gaits and Chibi's
walk / run / jump) is shorter under a floor-length skirt (swing 0.62, kick 0.45, knee lift 0.42) or a calf-length one,
as a person in a robe walks; `gaitDistance` reports the shorter step so the game's rate rule still plants the feet.

### No clipping, measured (`tests/clothes-check.js`)

Built with `globalThis.__kestrelGrid`, so geo.js remembers which surface and grid cell each vertex came from; the mesh is
skinned on the CPU at four points through each clip:

* **Layers**: every drawn vertex of a lower layer of the same body part that lies under a garment in the bind pose (its
  nearest garment triangle within 6 cm, the foot of the perpendicular well inside it, the vertex 1.5 mm or more under it,
  and either tagged as covered or 3 mm deep) must stay on the inner side of that triangle (≤ 2.5 mm) in every frame —
  unless the garment has lifted away from it (the projection has left the triangle: uncovered, not clipped).
* **Skirts**: for every drawn leg / foot vertex below the hip joint, the segment from it to its own bone (bind-height
  chooses thigh / shin / foot) and the bones themselves (toe → ankle → knee → groin) must not cross the skirt's posed
  triangles. Allowed: the groin (the first 0.22 m along the thigh, scaled to the body, where the leg comes out of the body — it
  crosses the torso's own skin there in a seated pose) and crossings at the waist (a knee raised above the
  hip, seated cross-legged, leaves the cloth where no skirt hangs).

Results (all at ≤ 2.5 mm): **the class wardrobe, tiers 1 and 2, both bodies — 128 looks × 14 core clips (idle walk run
attack cast hit jump sitGround ride rideGallop dead cheer profMine dualFlurry): 0 through**; in-world gear looks (PLAIN,
every armour weight, the four g5 sets with gloves) 24 × 14: 0; elves, dwarves and halflings in eight classes, 96 × 14: 0
apart from one allowed case (below); **one look per long garment (34 tops / skirts × 2 bodies) in every one of the game's
62 clips: 0**. Gloves: each glove finger's tip rides its finger bone, and no finger skin is drawn under a full glove.

### Numbers (node, this VM)

* LOD 0: class wardrobe, gear + hats + tier-2 kits on, max **14,884** (≤ 15,000; the outfit allowance); every catalogue id
  on its own ≤ 12,400. LOD 1: max **3,950** (≤ 4,000) — garments thin out like the body there (`lodThin`), the hat leaves
  room for the gear, and the gear is simplified (vertex clustering, `simplifyGear`) only as far as the budget needs (LOD 0
  never in the wardrobe but at 4–20 mm for the heaviest tier-2 plate).
* Bones 64, or 70 with skirt bones. 1 draw call, no textures.
* Build: a new class-wardrobe look (faces, hats, gear, t2 kits and clothes) ~136–140 ms median (p90 ~170) warm; the same
  looks in plain clothes ~109 ms (batch 1's 93 ms was before faces and hats). A skirt's drive adds ~2–10 ms to a clip
  the first time it is baked (static frames reuse the last answer).

### Approximate / not done

* **Six skirt bones** (the 70-bone ceiling) make a long robe a cone that tilts: at a run a floor-length robe's front flies
  forward as a panel rather than draping over the knee, and riding or sitting spreads it like a disc — no leg comes through,
  but it is not cloth. More bones (a second ring at the knee) would bend it.
* A **dwarf sitting cross-legged** tucks a shin up under the thigh inside a seat-length skirt's hem (≤ 3.5 cm, out of sight
  under the thigh): the race test allows exactly that and nothing else.
* ~~Chibi's `sitGround` crosses the Kestrel thighs; Chibi capes go into the ground when seated~~ — fixed in batch 5.
* Relief is paint: mail is a grain + courses, not rings; quilting and scales are colour, plate lames are bands; the fur
  collar is a smooth roll. Hoods (worn up) are the hat slot's (batch 3); `hoodDown` is a roll behind the neck.
* Ragged / torn hems on trousers are mostly inside boots; a bell sleeve is a widening tube (it does not hang).

## Batch 5 (2026-10-28): icon mannequin, two-handed tools, LOD 1 in the game, cross-legged sit, capes off the seat

All behind `?chars=kestrel`; without it Thousandvale is unchanged (Chibi icons keep cache version `v6`; Chibi 2.5 byte
identity test green). Test: **`tests/batch5.test.js`** (8 tests, ~10 s) + `prototypes/thousandvale/tests/D/kestrel.spec.js`
"batch 5" (the real game). Screenshots `shots/batch5/`.

### 1. Gear icons on a Kestrel mannequin
* `look.mannequin` (kestrel.js normalize → template key): `palette` paints everything the skin colour (eyes, lips, brows,
  teeth, hair), `face-build.js` leaves out every face piece but the ears — a carved head, as Chibi's `mannequin` is.
* Thousandvale: `chibi-version.js createTvBody` now sends `{ mannequin: true }` to `kestrel-body.js` under the switch
  (only `idle` is baked for it). `ui/item-icons.js`: the frames come from **`js/icon-frames.js` `KESTREL_ICON_FRAMES`**
  (loaded only under the switch; new `fwd` field = forward offset), the IndexedDB cache key is `v6k1` (`CACHE_V`).
  Held weapons are still drawn on their own (no body), as before.
* Measured (`iconFill`: the item's own vertices — the ones the plain mannequin does not have, by place and colour — CPU
  skinned and projected through the icon camera): 16 items over every frame fill 52–100 % of the icon, centred within
  0.37 of the middle, ≤ 4 % cut off (a hood's mantle and a floor-length robe 25–26 %, by design: they hang out of a head /
  chest frame). Review page **`icons.html`** (`?chars=kestrel` vs Chibi), `tools/icons-shot.mjs`.

### 2. Two-handed pick and hatchet (`profMine`, `profChop`)
`retarget.js` `TOOL_SWING` + `toolSwing`: after the Chibi clip is retargeted (legs, hips, trunk fold and twist kept), both
arms are re-solved. The right fist carries the game's tool (prof-view.js mounts it on the right hand frame) along a swing
path (four keys per clip, Catmull-Rom; the pick's in the chest's frame so the fold carries the blow, the axe's in the
root's heading), rolled so the tool's edge / point leads the down-swing; the LEFT fist goes on the haft at `s` (tool
units up the haft): high at the top of the back-swing and sliding down to the right fist as the blow lands. If the left
arm cannot reach that far up it takes the furthest point it can reach; if it cannot reach the haft at all the tool comes
nearer (both arms checked, a few rounds). Both hands use the grip finger preset. Timing is Chibi's (`PROF_BEAT` unchanged).
Measured on 5 bodies at every baked frame: left fist ≤ 1.5 cm off the haft, slides ≥ 7 cm, tool never under the ground,
edge·velocity > 0.5 on the blow.

### 3. LOD 1 in the game
* `actors.js` (switch only): `KESTREL_LOD = { far: 16, near: 13 }`, pure `kestrelLodFor(cur, d)` (hysteresis: out past 16 m,
  back inside 13 m; a new body starts at LOD 1 past 14.5 m). A body is BUILT at its LOD (`createTvBody(…, { lod })`); every
  LOD pass (4×/s) asks `body.wantLod(l, { slice })`. Your own body is always LOD 0; a big humanoid monster's distance is
  divided by its size. `lodStats.kestrelLow` counts low bodies.
* `kestrel.js`: `wantLod(l, { slice, budget })` builds the missing LOD in slices (`buildLodSliced`, shared with
  `prepareKestrel`) while the body keeps showing the one it has, then swaps; `lodPending`; a template another body already
  built gets its own mesh (`showLod` fixed); new LOD meshes cast shadows.
* LOD 1 builds in about half the time (node, class wardrobe: median 75 ms vs 137 ms).
* Build-time wins looked for: (a) **kept** — the Chibi-space gear pieces are collected once per look (`gear-bridge.js`
  `COLLECTED`), so a look's second LOD skips Chibi's builders (~8 ms of a ~140 ms build); output bit-identical (48 crowd
  looks × 2 LODs hashed). (b) **tried and removed** — remembering the body surfaces' radius + muscle relief per body
  across looks (exact, hash-checked) gained nothing measurable: a 60-body crowd built in 8.6 s either way (only ~8 % of a
  build is that sampling and crowd bodies differ).
* Crowd numbers, honestly: in the real game under SwiftShader (no GPU, this VM; `tools/tv-shots.mjs crowd`, `CROWD_R`
  = the crowd's radius; before = commit aa680aab in a worktree, same harness, one run each, so ±10 % noise): `tv.crowd(30, 10)`
  (everyone near) every body built in 140 s before → 120 s after; `tv.crowd(30, 45)` 171 s → 153 s, the slowest single
  build 85 s → 41 s wall time, 22 of the 30 built at LOD 1. Frame rate 0.6 fps both times — SwiftShader-bound, says nothing
  about a real GPU. In node (CPU only, the same 30 crowd looks): `crowd(30, 45)` 4.7 s → 2.9 s (28 of 30 at LOD 1); a
  crowd within 10 m is unchanged (4.5 s), as it should be.

### 4. Sitting cross-legged (`sitGround`, `sitHold`)
`retarget.js` `CROSS_SIT` / `crossLegs`: Chibi's sit swings the thighs inward (on Kestrel's narrow hips and long thighs
the left knee crossed to the right of centre). The legs are re-solved: knees out to the sides, the shins crossed in
front with the right ankle in front of (and resting a little above) the left one, each foot on its outer edge pointing
across; forward first and across later on the way down, toes never under the floor. `fitCross` picks this body's ankle
targets once (a small search on the clip's seated frame, cached per rig) — the nearest to the nominal sit for which every
pair of leg segments is a limb radius apart (thicker for a dwarf's girth). Measured (`legsThrough`: every leg vertex
against the other leg's posed segments and bind radii) on 8 bodies × trousers / greaves over the whole of both clips:
knees 0.33–0.38 m out on their own side, ≤ 1.3 cm of soft contact (dwarves; 0 elsewhere). The old pose: up to 9.9 cm
through, 8,658 vertices, left knee 8 cm right of centre.

### 5. Capes off the ground and the seat (`sit`, `sitGround`, `sitHold`, `ride`, `rideGallop`, `boat`)
**`js/cape.js`**: a look with a long cape (kestrel.js `longCape`) and no skirt gets two **cape bones** (`capeA` at the
small of the back, `capeB` at the seat; 66 bones); below the waist the cape's torso share hands over to them
(`capeWeights`, back panel only). Over a skirt (robe, tunic to the seat) the cape already rides the skirt bones (now also
below a short skirt's hem), so the skirt bones are what moves (70-bone ceiling). `driveSeatClip` runs on each seated clip
after the skirt drive: per frame it poses a private rig, CPU-skins a sample of the vertices on those bones and turns them
out by the smallest angle for which the sample is above the ground and, behind the body, above the seat (bottom of the
buttocks; only once the hips are down — `seatedness`). Cape bones are keyed at rest in every other clip; the clip cache
key carries the cape. Measured on 6 capes × tshirt / tunic / robe (+ dwarf, halfling): lowest cape vertex ≥ 0.7 cm over the
ground, ≥ −1.8 cm against the seat plane (the cloth on the thigh just under the hip). Before: a travel cloak 26 cm into
the ground on `sitGround`, 45 cm under the seat on `sit`.

### Approximate / not done
* Robes when seated are still a spread cone (batch 4's six skirt bones), now lifted off the ground behind.
* The seated cape lies flat behind as a folded sheet (two bones), not draped cloth; on a horse it lies along the rump at
  saddle height.
* The icon mannequin is always the masc body (bald, no beard — the form rule reads it so).
* Real-GPU performance still not measured (software rendering here).

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
