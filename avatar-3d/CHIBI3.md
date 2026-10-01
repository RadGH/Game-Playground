# Chibi 3 (prototype)

**Status (2026-10-01): prototype, authored by Claude Opus 5.5.** Supports the Knight, Wizard and Orc
Berserker as presets, plus a full builder over every race and dial. Chibi 2 stays the flagship in
every game; nothing outside `avatar-3d/chibi3.html` uses Chibi 3 yet. The decision on what happens
next is the owner's; the recommendation is at the end of this page.

Page: `http://<LAN-IP>:8400/avatar-3d/chibi3.html`. Views: Character (builder), **Chibi 2 vs 3**
(same avatar JSON, same light), **The three** (the prototype classes), Crowd (10/30/60, either
model), plus a benchmark and a scorecard. `chibi3-dev.html` is the bare dev viewer
(`?preset=knight&view=face34&anim=slash1&t=0.4&bind&nosimplify&nohide&skip=helm,cape`).

## What it is, in one paragraph

Every surface is a **signed distance field** (a function that says how far a point is from the
surface): the body is about 140 shapes — ribcage, pecs, deltoids, a skull with a brow ridge, jaw,
nose, lips and ears, fingers — blended with a *smooth minimum* so muscles melt into each other with
no seams. **Clothes and armour are the body pushed out by a few millimetres (or centimetres, for
plate) inside a region** built from the skeleton's own joints, so every garment fits every race and
every body dial with no per-body numbers. The fields are turned into triangles (surface nets, with
every vertex snapped onto the exact surface and its normal taken from the field), simplified
(quadric-error edge collapse that snaps back onto the field and keeps colour borders), painted per
vertex, and skinned to a **66-bone rig** with weights blended across every joint. The result is ONE
skinned mesh with one physically based material (plus the eyes): two draw calls a character.

## Files (`avatar-3d/js/chibi3/`)

| File | Owns | Three.js? |
|---|---|---|
| `sdf.js` | Primitives (sphere, ellipsoid, round cone, round box, torus, almond), smooth min/sub/intersect, `Shape` (ordered primitives, base field + offset + displacement, paint lookup, two spatial indexes: tight for meshing, wide (6 cm) for garments reading the body), Perlin noise | no |
| `mesher.js` | `Grid` (sampled field + trilinear read), `meshField` (surface nets, Newton projection, gradient normals, flipped-triangle repair), field ambient occlusion and curvature | no |
| `decimate.js` | Quadric-error simplifier with re-projection, pinned borders, `endpointsOnly` (for deriving levels of detail with exact attributes) | no |
| `races.js` | Nine races as parameter sets (stature, muscle, fat, face shaping, posture, palettes), `C3_DIALS`, `dial()` | no |
| `rig.js` | `layoutRig(avatar)`: 66 bones (spine, jaw, eyes, lids, 13 per arm incl. fingers and a grip, 4 per leg, spring chains for hair/hat/beard/cape/skirt), `MASKS`, `ANIMATED` | no |
| `skin.js` | Joint-blended skin weights, chain weights for spring bones | no |
| `paint.js` | Surface kinds (skin, cloth, silk, wool, leather, metal, chain, hair, fur, wood, bone, gem, glow…), colour helpers, skin paints | no |
| `body.js` | The anatomy; face detail regions (eyes 1.9 mm, mouth 1.5 mm, nose/ears 2.4 mm over a 5.2 mm face) | no |
| `face.js` | 11 morph targets generated from the face's own landmarks, 13 `EXPRESSIONS`, 10 `VISEMES`, `visemeTrack(text)` | no |
| `garments.js` | Garment = body offset ∩ region; landmarks, torso/leg regions (with `partAt` so sleeves take arm bones and the torso never does), skirt weights, cloth folds | no |
| `armour.js` | Mail hauberk, cuirass with ridge and rolled rims, faulds, laminated pauldrons (+ spikes), rerebrace/couter/vambrace, gloves with cuffs, cuisses/poleyns/greaves, sabatons | no |
| `clothes.js` | Tunic/gambeson/leather, robe with bell sleeves and pleated skirt, surcoat with heraldry, belts, trousers, boots (+ fur), slippers, fur rings and mantles, harness laid on the skin, wraps, kilt (+ fur hem) | no |
| `hair.js` | Sculpted hair from a hairline mask (grows out of the skin), 12 styles incl. mohawk, ponytail, braids, topknot; beards (stubble, moustache, goatee, short, full, long, braided) | no |
| `headwear.js` | Bascinet with raised visor, plume and mail aventail; great helm; war helm with nasal; horned helm; wizard hat (bent tip on the hat chain); hood; circlet; cap | no |
| `outfit.js` | Reads the shared avatar slots, maps any id to a family (so Chibi 2 ids land somewhere sensible), `CHIBI3_PARTS`, war paint, tusks | via cape/weapons |
| `cape.js` | Two-sided cloth cape on the cape chains, collar and clasps | yes |
| `weapons.js` | (weapons agent) swords, greatsword, axes, greataxe, maces, hammers, daggers, spears, halberd, staves with crystals, wand; heater/kite/round/tower shields and buckler; orb, book, torch. Returns the HOLD record | yes |
| `assemble.js` | Layers → one geometry: meshing, simplifying, hidden-surface removal, occlusion grid, paint, wear, weights; debug switches | yes |
| `material.js` | The character material (MeshPhysicalMaterial + triplanar detail texture array of 8 generated maps), eye material and iris texture | yes |
| `animator.js`, `clips.js`, `ik.js`, `springs.js` | (animation agent) the custom animator — see Animation | yes |
| `bake.js` | Baked template files (`.c3b`, gzipped), IndexedDB cache for live builds | yes |
| `stage.js` | Lighting stage: procedural studio environment (PMREM), key/rim/fill, presets `studio`, `dusk`, `torch` | yes |
| `index.js` | `createChibi3Character`, `registerBaked`, `bakeLook`, `normalizeForChibi3`, LOD derivation, template cache | yes |

Data: `data/chibi3-presets.json` (the three classes), `data/chibi3-baked/*.c3b.gz` (baked by
`tools/bake-chibi3.mjs`), `data/chibi3-verdict.html` (the verdict shown on the page).

## Using it

```js
import { createChibi3Character, registerBaked } from '../avatar-3d/js/chibi3/index.js';
await registerBaked(avatar, ['k.lod0.c3b.gz', 'k.lod1.c3b.gz', 'k.lod2.c3b.gz']);   // optional: instant
const hero = await createChibi3Character(avatar, { lod: 'auto' });   // 'auto' | 0 | 1 | 2; cache: false to skip IndexedDB
scene.add(hero.group);
hero.setSpeed(1.4);            // walk/run blend by metres per second
hero.play('slash1', { mask: 'upper' });   // layered over the legs
hero.setExpression('angry', 0.8); hero.say('Hold the line!'); hero.lookAt(camera.position);
hero.setGround((x, z) => terrainHeight(x, z));   // foot IK
function frame(dt) { hero.update(dt); }
```

The controller keeps Chibi 2's core (`group`, `setAnim`, `update`, `setRate`, `metrics`, `stats`,
`setAvatar`, `setHandsFree`, `dispose`), so a game can swap renderers behind a flag the way Emberveil
did for Chibi 2. `setAnim` accepts every Chibi 2 name (`attack` and `cast` pick the right class clip
from what is in the hands).

### The avatar JSON

It is the same document every game already reads. Chibi 3 does NOT run the 2D normaliser (which
drops ids it has never heard of): `normalizeForChibi3` fills defaults and keeps every id, and
`outfit.js` maps ids to families by name, so `plate`, `breastplate`, `full_plate` all build the
cuirass, and any Chibi 2 class outfit renders (the page's "Dress as class" menu proves it with all
24). New dials live in `avatar.body.c3` (0..1, 0.5 = the race's own value; the 2D normaliser keeps
unknown keys inside `body`, so they survive Farhold and Emberveil). New part ids Chibi 2 does not
know: `harness`, `fur_kilt`, `fur_boots`, `spiked_pauldron`, `fur_mantle`, `wraps`, `war_paint`,
`long_beard`, `braided`, `topknot`.

## Animation (animator.js, clips.js, ik.js, springs.js)

Not `THREE.AnimationMixer`: clips are sampled into per-bone quaternion arrays and blended by the
animator itself, which is what allows per-bone masks.

* **32 clips**: Move (idle, ready, walk, run, turnL, turnR, jump), Knight (slash1, slash2, thrust,
  shieldBash, block), Wizard (castBolt, channel, castAoe, staffStrike), Berserker (heavyCleave,
  sweep, frenzy, twinChop, roar), Reactions (hit, stagger, dead, getUp), Emotes (wave, cheer, bow,
  point, laugh, talk, punch). `CHIBI3_CLIP_GROUPS`.
* **Layers**: base locomotion (walk/run blended on one shared step cycle, stride from leg length so
  feet do not slide), an upper-body or arms action layer, an additive layer (flinch, breathing).
* **Procedural**: foot pinning and foot IK to `setGround`; the off hand placed on a two-handed haft
  (`hold.grips.offhandAlong` from weapons.js); head and eye look-at; blink; eye saccades; visemes
  from `say()`; expressions (morphs + jaw + lids); race posture.
* **Springs**: hair, hat tip and plume, beard, cape (left/right columns), skirt panels, pushed out of
  the legs and pelvis.
* Cost: ~0.1–0.25 ms per character per frame (Chibi 2: ~0.03–0.1 ms).

## Levels of detail

LOD 0 is built; LOD 1 and LOD 2 are **derived from LOD 0** by simplifying with `endpointsOnly`
(every surviving vertex keeps its exact colour, weights and morphs), colour borders pinned at LOD 1,
open edges allowed to collapse at LOD 2. Switched by `THREE.LOD` at 7 m / 16 m (scaled by height).

| | Knight | Wizard | Orc Berserker |
|---|---|---|---|
| Triangles hero / mid / far | 57k / 23k / 13k | 43k / 17k / 7.5k | 74k / 23k / 11k |
| Live build (VM, node) | ~11 s | ~8 s | ~11 s |
| Baked load (page) | ~0.35 s | | |
| Baked file (gzip, 3 levels) | ~2.0 MB | ~1.3 MB | ~2.0 MB |

## Build cost (the honest weak point)

A new look takes seconds to build because it is meshed from fields (≈30 layers for the knight).
What was done about it: two spatial indexes, allocation-free primitives, garments filling their grid
from a sampled body (the exact body only places vertices), LOD derivation instead of rebuilds,
**baking** (`node --import ./avatar-3d/tests/three-register.mjs tools/bake-chibi3.mjs`, re-run after
ANY change in `js/chibi3/` or the baked presets go stale), and an IndexedDB cache so a look built
once in the builder loads instantly next time. Not done: a Web Worker (module workers ignore the
import map, and several Chibi 3 files import `three` by name; the field stages are pure and could
move with a small split of `assemble.js`).

## Known gaps

* Faces are clearly better than Chibi 2 but are procedural sculpts: they read as stylised and
  sometimes stiff; the open mouth (surprised, the A shape) shows a rough inside.
* Expression morphs are a few millimetres; the animator scales them (`MORPH_GAIN`).
* Garment edges and hairlines can show small stair-steps at the grid size; a few inside-out slivers
  remain on sharp creases (hem caps).
* In a hard run a long robe still lets a knee near the hem (the skirt keeps a third of the leg).
* `wave` has a weak elbow bend; `hit` is not directional; turns are in-place clips only.
* Build time, as above. Live-built looks in the builder freeze the page for several seconds.
* Part breadth: Chibi 2 has ~230 parts; Chibi 3 maps every id to a family, but many families are
  one model (all non-plate tops are variations of the tunic, etc.).

## Tests

`avatar-3d/tests/chibi3.test.js` (node: primitives, smooth union, both indexes, closed meshes on the
surface, the simplifier, the skeleton, weight continuity at joints, dials, every Chibi 2 class-outfit
id mapping to a family, visemes, a real build and a bake round trip) and
`avatar-3d/tests/chibi3.spec.js` (Playwright: baked load, every view, a live build of a Chibi 2
style look animated through ten clips). Node tests that need Three.js load
`tests/three-register.mjs` / `three-loader.mjs` (maps the import-map names to `vendor/three`) and
`tests/fake-dom.mjs`. Dev screenshots: `tools/chibi3-shot.mjs`, `tools/chibi3-page-shot.mjs`;
headless benchmark: `tools/chibi3-bench.mjs` (software rendering: compare ratios only).

## Verdict and recommendation

See `data/chibi3-verdict.html` (shown at the bottom of the page). Short version: **keep it**. It is a
clear step up in detail, materials, faces and motion, at about 3× the triangles, ~2–4× the animation
CPU and a real build-time cost that baking hides. Use it for the next new game with a close camera;
do not port Farhold or Emberveil until it has the part breadth and the build worker.
