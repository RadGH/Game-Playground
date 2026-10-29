# Kestrel — attempt "fable" (hand-coded by Claude Fable 5.1)

A hand-coded Three.js character built to `../CONTRACT.md`: ~7 heads tall, athletic, stylised-realistic, one draw
call, no textures, no downloaded models, no build step, and the same actor shape as `createChibi2Character` so a
game swaps the factory and nothing else. Preview: `index.html` (dev server: `http://localhost:8401/avatar-3d/kestrel/fable/index.html`).
Numbers: `stats.json`. Pictures: `shots/`. Test: `node --test avatar-3d/kestrel/fable/tests/kestrel.test.js`.

```js
import { createKestrelCharacter, KESTREL_ANIMS, KESTREL_INFO } from './avatar-3d/kestrel/fable/js/kestrel.js';
const actor = await createKestrelCharacter(look, { height: 1.4 });   // opts.height for a Chibi-2-scaled game
scene.add(actor.group);  actor.setAnim('walk');  actor.setExpression('happy');  /* each frame */ actor.update(dt);
```

## The numbers (headless node build on the VM, `stats.json`)

| | triangles | draw calls | bones | textures | cold build | warm build |
|---|---|---|---|---|---|---|
| male, underwear | 11,904 | 1 | 55 | 0 | ~120–140 ms | ~35–60 ms |
| female, underwear | 11,908 | 1 | 55 | 0 | ~60 ms | ~35–60 ms |
| male + shirt/pants/boots | 12,276 (+372) | 1 | 55 | 0 | ~59 ms | |
| female + outfit | 11,904 (−4) | 1 | 55 | 0 | ~44 ms | |
| far version (LOD 1) | 3,776 / 3,780 | 1 | 55 | 0 | ~39–50 ms | |

The outfit adds so little because the skin under a garment is **not built** (see "Modular"). The cold male build is
the first thing the module does (JIT cold); every build after it is 35–60 ms. Same look again is a cache hit (< 1 ms).

## How it is built

Everything is procedural geometry in bind space, merged by `geometry.js`'s `Builder` into ONE indexed geometry with
position / normal / colour / skinIndex / skinWeight, one `MeshStandardMaterial` (vertex colours, double-sided).

| file | what |
|---|---|
| `js/geometry.js` | the primitives: `loft` (a stack of **superellipse rings** — exponent 2 is round, 3 is squarish — each in its own frame, each carrying its bone weights, with **sculpt bumps**: 2-D Gaussians in ring-angle × height that are a biceps, a pec, a calf, a glute), `blob` (a lat/long sphere with a radial function: the skull), `disc` / `band` / `sheet` (eyes, lash lines, mouth interior, teeth), `spike` (a bent flat-shaded pyramid: hair clumps), `mirrorX`, the `Builder` |
| `js/rig.js` | `dims(look)` — every landmark in metres for a form (male 1.78 m, female 1.68 m at `height` 0.5; `height`/`width` nudge ±10 %) — and `createRig`: 55 bones |
| `js/body.js` | torso, neck, arms, hands, legs, feet as **key profiles** (height → half-width, half-depth, squareness, offset) interpolated with Catmull-Rom into rings. One loft spans a whole limb (shoulder→wrist, hip→ankle) with weights blended at the joint, so there is no seam to hide |
| `js/head.js` | the skull (ellipsoid × a direction-based radial: jaw narrowing, flat chin, jaw corners, brow ridge, eye sockets, cheekbones, occiput, temples), eyes (white / iris with a dark rim / pupil / two highlights / lash line / lower line, on the `eye` + `pupil` bones; a skin-coloured **lid** on its own bone pivoting at the top edge), brows (lofts on `brow` bones), nose, lips (lofts on `head` + `jaw` + `mouth` corner bones), a dark mouth interior and a teeth strip behind the lips, ears; `EXPRESSIONS` |
| `js/hair.js` | a **cap** (the skull pushed out above a hairline that varies round the head) + flat-shaded **clump spikes** placed on a golden-angle spiral, each pointing along the skull (tangent + a little normal) and **curved toward the skull centre** so a long lock follows the forehead; the ponytail is a tube swept along a curve on `hairTail1/2`. Styles: `spiky`, `high_ponytail`, `bald`, `short`, `long`; every other Chibi 2 id maps to the nearest |
| `js/garments.js` | underwear (always: shorts for both; a sports top with straps routed over the torso's own surface for `fem`), `shirt`, `pants`, `boots`. A garment is **the body's own key profile grown outward a few mm** with the same sculpt and the same bone weights, so it fits and bends exactly as the skin does |
| `js/motion.js` | 16 clips as whole-body pose functions of u, sampled to Three.js tracks; a follow-through pass lags each child behind its parent; fingers keyed from a per-hand curl / point / spread value |
| `js/face.js` | blink (2–5.5 s, one in six doubled), idle glances, `lookAt` with a head share, `setGaze`, expressions blended on the face bones (position + rotation offsets, lid squint, eye scale, jaw, head tilt), jaw flap in `talk`, eyes shut when `dead` |
| `js/kestrel.js` | the contract: normalised look → template cache (reference-counted, `prepareKestrel` bakes ahead) → actor. Vertex-colour **skin paint**: the grooves a painter would put in (sternum, under-pec line, linea alba, ab rows, V-lines, spine, shoulder blades, lower-back dimples, armpits) |

### Rig (55 bones)

Chibi 2's eighteen names (`root hips chest head arm/elbow/hand/grip L/R leg/knee/foot L/R`) with the same meaning, plus
`spine`, `neck`, `jaw`, `toesL/R`, two bones per finger (`idx1L idx2L mid… rng… pnk… thm1 thm2`), `eyeL/R` →
`pupilL/R` + `lidL/R`, `browL/R`, `mouthL/R` (the mouth corners), `hairTail1/2`. Arms are bound 20° out from the body
(an A-pose) so the shoulder is sculpted where it is mostly seen; a clip's `[0,0,0]` on an arm bone is still straight
down. Grip bones sit in the palm.

### Modular

Body, underwear, hair and the outfit pieces are separate pieces assembled per look, then merged. A garment declares
what it hides — ranges of the torso height, the arm length, the leg length and the foot — and the body lofts skip
every band whose BOTH rings are under it (so the skin reaches one ring under the hem and never shows below it).
Pants also hide the shorts, a shirt hides the sports top. Nothing can poke through in any clip because the garment
is the same profile with the same weights, 6–11 mm further out.

### Expressions

Six faces as bone offsets (`head.js` `EXPRESSIONS`), blended by weight with a fade: happy (corners up and out,
lids a little shut, jaw open enough to show the teeth), sad (inner brows up, corners down, a small nod), angry (inner
brows down and in, lids narrowed, corners down, chin forward), surprised (brows up, eyes 1.22× tall, jaw open, mouth
narrowed), confused (one brow up, one down, a crooked mouth, head tilted). `shots/*-expressions.png`.

### LOD

`setLod(1)` or `{ lod: 1 }` builds the same character with fewer sides and rings, mitten hands, no toes, fewer
clumps, no eye trims: 3.7–3.8k triangles. `{ lod: 'auto', camera }` switches at `lodDistance` (14 m) with hysteresis.

## Decisions (and why)

* **One draw call, vertex colour, no textures.** A 1024² atlas painted in code would have given skin gradients but
  costs build time on a phone and a texture per look; painted grooves in the vertex colour give most of the muscle
  read for nothing (`skinPaint` in `kestrel.js`). The eye detail the mockup wants (iris rim, two highlights, a lash
  line that thickens at the outer corner) is geometry, so it is sharp at any distance.
* **Lofts over key profiles, not a hand-placed mesh.** Every body part is ~10 rows of numbers; the female is the same
  code with different numbers; `height`/`width` sliders scale the table. The garments reuse the same tables, which is
  what makes "nothing pokes through" a property of the construction rather than a thing to test for.
* **A whole limb is one loft.** The elbow and knee are weight blends inside one tube; Chibi 2's separate upper/lower
  pieces leave a crease at the joint that reads at this proportion.
* **Hair is clumps lying along the skull**, curved toward its centre, not standing spikes (round 2 looked like a
  hedgehog; the mockup's hair is leaf-shaped clumps). Flat shading on purpose: the crisp facets read as painted hair.
* **The lid is a skin-coloured disc on a bone**, not a squash of the eye (Chibi 2.5 squashes the eye): at this eye
  size a squash looked like the eye being swallowed.
* **Expressions on bones, not morph targets.** The brows, mouth corners, lids and jaw are separate pieces anyway;
  bone offsets blend for free, cost nothing per frame and need no extra attributes.
* Shots are taken at the review page's cameras (`compare.js` `placeCamera`) so they line up with the Codex pictures.

## The look-compare-fix rounds (nine)

1. First render: body unpainted; shoulders a flat box with "epaulettes"; nose a wedge; hedgehog hair. Painted the
   body, lowered the deltoid cap, shortened the hair, shrank the nose.
2. Against `ref/*-head.png`: face too narrow and egg-shaped, brows 1.4 cm too high, iris too small, lips too fat, hands
   4.6 cm wide (!). Widened the skull, moved the brows, iris to 70 % of the eye height, palm to 8.8 cm.
   Found the garment hide rule dropped one band too many (the straps showed through the chest) — fixed in `loft`.
3. Torso had no V-taper; clumps still stood up; female bangs a curtain over the eyes; chin pointed; the ankle "cuff"
   showed. Tangential clump direction, waist to 68 % of the chest, flat chin, no ankle collar.
4. Muscles did not read — painted the grooves; straps routed over the torso surface (`torsoPoint`); nose bridge
   started lower; skull 5 % shorter; happy/angry stronger; trimmed to budget; hand/foot close-up views added.
5. Wrist/ankle end caps z-fought with the palm/foot (dropped), fingers get a resting curl, toes closer together, a
   trapezius shelf wrapping onto the deltoid (the step is gone), female side locks shorter and thicker.
6. The male was slimmer than the reference's 3/4 view: thicker arms, thighs, neck, deeper chest, stronger bumps.
   Female lower face shorter, nose smaller. Toes had been swallowed by a longer foot — fixed.
7. Walk strip showed the knee bending most with the leg under the body (`sin` instead of `-sin` for the swing phase)
   — the figure floated at mid-stride. Fixed; arm swing doubled.
8. Female bangs stood off the forehead like a visor: added `curve` (a clump bends toward the skull centre).
9. The lead's contract test and this attempt's own test green; LOD 1 trimmed under 4,000 for the female.

## Honest self-score (1–5, against the Codex references)

| | score | why |
|---|---|---|
| Looks like the reference | 3 | the silhouette, proportions, hair mass, underwear and the painted muscle lines are right; the surface is still smooth low-poly, the reference is a sculpted render |
| Face | 3 | big eyes with lash lines and highlights, brows, a flat chin and jaw corners read as the mockup's style; the nose is still a wedge and the cheeks are flatter than the reference |
| Body and proportions | 4 | measured off the reference (7.1 heads, shoulders 0.46 m, waist 68 % of chest); male/female differ in the right places (shoulders, waist, hips, bust) |
| Hands and feet | 3 | real fingers with two bones each, thumb on its own axis, toes; the palm is a flat slab and the knuckles are only a bump |
| Hair | 3 | clumps lying along the skull with a fringe, and a swinging ponytail; still faceted, and the reference's leaf shapes are rounder |
| Animation | 3.5 | all 16 clips read (`shots/*-poses.png`), follow-through, fingers curl/point/fist, ponytail sways; no foot IK, the attack is hands-free |
| Expressions | 4 | all six recognisable at a glance on both faces, with teeth and a mouth interior |
| Modular (outfit swap) | 4 | garments are separate pieces, hidden skin, one draw call before and after, +372 triangles for three garments |
| Phone cost | 4 | 11.8k / 1 draw call / 55 bones / no texture, LOD 1 at 3.7k, 35–60 ms a new look |

## What did not work / what I would do next

* **Smooth-only shading is the ceiling of this approach.** The next real step up is a code-painted 512² atlas (skin
  gradient, lip line, nostrils, nails) with UVs from the loft parameters — the ring angle and height ARE a UV — kept
  off in node. That would also let the brows and lash line be paint instead of geometry (−600 triangles).
* The nose wants a sculpted bump in the skull's own radial function (alae, nostrils) rather than a separate loft.
* Hands: a knuckle row and a palm crease as sculpt bumps; a finger spread table per clip.
* Hair: round the clump tips (5–6 sides with smooth normals on the tip rows only) and add a second, shorter layer.
* Foot IK for the walk on slopes; an `attack` that can carry a held thing on `gripR` (the grip bones exist, `hold` is
  null in test 1).
* `talk` is a jaw flap; a lip-shape table keyed to the voice engine's phonemes would fit the same bones.

## Contract notes

Nothing in CONTRACT.md seemed wrong. Two small things worth saying: the §5 build-time budget (≤ 150 ms) is met warm
and on the cold first build only just (125–140 ms on this VM for the male — `prepareKestrel` exists for a loading
screen); and `stats().buildMs` reports the template's own build, which a cache hit does not repeat.
