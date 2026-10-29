# Kestrel — the hand-coded attempt by Opus

`avatar-3d/kestrel/opus/` · `KESTREL_INFO = { attempt: 'opus', by: 'Claude Opus 5.5', version: '0.1.0' }`

A character system built the "Chibi 2.5 way" (every vertex written by code, a rig built in code, clips sampled in code,
no downloaded models, no build step) aimed at the owner's mockup: about 7 heads tall, athletic, stylised-realistic. It
follows `../CONTRACT.md` and returns the same actor `createChibi2Character` returns, so a game swaps the factory.

```js
import { createKestrelCharacter } from './avatar-3d/kestrel/opus/js/kestrel.js';
const actor = await createKestrelCharacter(look, { lod: 'auto', height: 1.45 });   // height optional (Chibi 2 scale)
scene.add(actor.group); actor.setAnim('walk'); actor.setExpression('happy'); // … every frame: actor.update(dt)
```

Preview page: `opus/index.html` (both bodies, every clip, every expression, outfit on/off, LOD 1, wireframe, drag to
turn). Query string: `?body=female&anim=run&expr=angry&outfit=1&view=three&lod=1&t=0.4` (`t` freezes the clip, `shot=1`
hides the UI). Extra camera views for close looks: `head headL headB head3 torso torsoB legs legsB hand handB foot`.

## Numbers (`stats.json`; node on this VM)

| | male | female | male + outfit | female + outfit |
|---|---|---|---|---|
| triangles, LOD 0 (budget 12,000; +outfit ≤ 15,000) | 11,649 | 11,373 | 10,006 | 9,886 |
| triangles, LOD 1 (budget 4,000) | 3,214 | 3,474 | 3,259 | 3,327 |
| draw calls (budget 2) | 1 | 1 | 1 | 1 |
| bones (budget 70) | 64 | 64 | 64 | 64 |
| textures | 0 | 0 | 0 | 0 |
| new look, warm, quiet VM | ~140 ms | ~90 ms | ~100 ms | ~70 ms |
| same look again (cache hit) | 1–3 ms | 1–3 ms | 1–3 ms | 1–3 ms |

The outfit makes a character *cheaper*: the shirt, pants and boots hide more skin (and underwear) than they add.
Build times: the very first build in a process pays JIT warm-up (~250 ms node, ~430 ms in the review page under
swiftshader); after that a new look is 70–145 ms on a quiet VM. `stats.json` (written with the VM shared with another agent, load ~11) says male 141 ms, female 68, outfits 93 / 69, cold 217. Only `idle` is sampled when a
look is built; every other clip is sampled the first time it is asked for (2–5 ms, cached per body), and
`prepareKestrel` samples them all ahead of time.

## How it is built

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
