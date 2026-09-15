# Chibi 2: First Milestone

A performance-budgeted procedural humanoid for game use. Geometry is authored in code, compiled
once when an avatar is built, and animated with Three.js skeletal animation at runtime. Blender
is not required. This milestone does not implement a creature editor or Blender import/export.

## Compare

Open `http://<LAN-IP>:8400/avatar-3d/chibi2.html` using the playground server (`./serve.sh --bg`).
The first screen is eight fighters with spells. Character and Side by side show the same avatar
JSON with the original and new body builders. Presets: Vanguard, Wayfarer and Spellkeeper.
The original avatar builder also has a separate Chibi 2 mode.

Run comparison measures three configurations sequentially: original bodies/original sprites,
new bodies/original sprites, and new bodies/batched sprites. Every run uses eight actors, the
same avatar, camera framing, resolution, shadows and cast rate. Rendering is measured using
wall-clock frame intervals, not the simulation's clamped `dt`. Simulation advances at a fixed
1/60 second per measured or warmup frame, so slower rendering does not reduce the workload.
Particles still use the existing effect system's stochastic variation. Keep the tab visible.

The default is contact shadows and 1x resolution. Dynamic shadows and higher resolutions are
available to compare the cost explicitly. All three cases use the chosen settings; these savings
are not a comparison between a high-quality original and a lower-resolution new renderer.

Reproduce the longer automated run:

```sh
node tools/bench-chibi2.mjs --frames 180 --warmup 90 --output avatar-3d/research/chibi2-benchmark.json
npx playwright test avatar-3d/tests/chibi2.spec.js
```

### Recorded Baseline

[Raw measurements](research/chibi2-benchmark.json), 2026-09-15 UTC. Chromium/ANGLE SwiftShader
(software rendering), 1028 x 594 drawing buffer, contact shadows, 1x resolution, four casts/second,
90 warmup and 180 measured frames per case. Values below are averages except p95.

| Characters / spells | Draw calls | Triangles | Frame time | Frame p95 |
|---|---:|---:|---:|---:|
| Original / original | 328.0 | 172,630 | 138.0 ms | 155.3 ms |
| Chibi 2 / original | 127.8 | 67,106 | 100.1 ms | 118.5 ms |
| Chibi 2 / batched | 43.7 | 67,102 | 96.7 ms | 106.7 ms |

The complete new path uses about **87% fewer draw calls and 61% fewer triangles** in this scene.
The flagship body alone goes from 27 meshes / 21,168 triangles to 2 meshes / 7,948 triangles.
Frame times are machine-specific, not a prediction for a hardware GPU. Batching substantially
reduces submissions but changes SwiftShader frame time much less here; it does not remove transparent
pixel fill, skinning, scene traversal or particle simulation. No 60 fps guarantee is inferred.
This controlled scene is not a benchmark of every Emberveil encounter, UI or audio workload.

## Reuse

Use the same vendored Three.js import map as the other Avatar 3D pages.

```js
import { createChibi2Character, CHIBI2_ANIMS } from '/avatar-3d/js/chibi2.js';
import { BatchedSpellFx } from '/avatar-3d/js/spellfx-batched.js';

const actor = await createChibi2Character(character.avatar);
scene.add(actor.group);
actor.setAnim('ready');
// Each frame:
actor.update(dt);
// The existing SpellFx API; textures and camera are supplied by the host.
const fx = new BatchedSpellFx(scene, { camera, textures, maxParticles: 160, maxLive: 24 });
fx.update(dt); // Call even with dt = 0 when pausing simulation but orbiting the camera.

actor.stats(); // { meshes, bones, triangles }
actor.metrics(); // { totalHeight, height }
await actor.setAvatar(updatedAvatar); // Preserves the caller-owned group transform.
actor.dispose(); // The host also removes actor.group from its scene.
fx.dispose(); // Does not dispose caller-owned textures.
```

`setAnim(name, fadeSeconds = 0.12)` accepts idle, ready, walk, run, attack, cast, hit, guard,
wave, talk, jump and dead. Attack, cast, hit and jump return to idle. Dead holds the last pose
until another animation is selected. Unsupported animation names fall back to idle. Walk and
run are in-place clips; a game owns locomotion. Talk has head/arm motion, not lip sync.

`group.userData.character` identifies the character. `group.userData.fxHeight` supplies spell
height without an expensive animated bounding-box scan. `parts` exposes named bones;
`skeleton` exposes the independent Three.js skeleton for this actor.

Emberveil's `Stage` accepts `{ characterFactory, effectsClass }`. The game injects the new
implementations by default without changing combat rules, saves or non-humanoid builders.
Use `?renderer=chibi1` to select the original renderer for a direct gameplay comparison.

## Implementation

| File | Responsibility |
|---|---|
| `js/chibi2-geometry.js` | Profiled surfaces, tapered curves, rig creation, bind-space transforms, normalized skin weights and material-bucket merging |
| `js/chibi2.js` | Modelled face, hair, clothes/equipment, avatar mapping, template cache and controller |
| `js/chibi2-motion.js` | Sampled quaternion/translation clips, played with the standard Three.js AnimationMixer |
| `js/spellfx-batched.js` | Optional instanced sprite rendering for the existing SpellFx vocabulary |
| `data/chibi2-presets.json` | Starting looks, using the shared avatar schema |
| `js/chibi2-app.js` | Comparison scene, controls, frame sampling and result export |

Body pieces are not independent runtime meshes. `SkinBuilder` transforms them into bind space,
adds vertex color and skin data, then merges them by opaque cloth or metallic material. The
limbs blend weights across the knees/elbows; rigid features and equipment use one bone. The
rig has 18 bones: root, hips, chest, head, two blink bones, and three per arm/leg. Blinks scale
the eye bones. Conservative mesh bounds avoid recomputing skinned bounds every frame.

Identical normalized avatar JSON shares geometry, materials and animation clips in a
reference-counted template cache. Skeletons and animation mixers remain independent.
`chibi2CacheStats()` reports live templates/references. Templates are released when their last
actor is disposed; cache residency is bounded by live variants. Color changes currently rebuild
a variant because colors live in its vertex data. Distinct appearances do not yet share a base
geometry/atlas. The eight-fighter test deliberately uses color variants, not eight identical
instances, and the bodies are not GPU-instanced across characters.

The spell subclass keeps the original effect lifetimes, emitters, particles and shaped meshes.
Sprites retain their transforms but are hidden on layer 31, then drawn with InstancedMesh
billboards grouped by texture/blending, with per-instance tint and opacity. Each texture/blend
batch has 512 slots. `stats()` adds `batchedSprites`, active `batches`, and `overflow`; production
budgets should leave overflow at zero. Do not enable layer 31 on the game camera. Normals,
lighting and the character's two materials are unrelated to these unlit particle batches.

Normal-blended sprites are depth-sorted inside each batch. Transparent sorting between different
textures and shaped transparent effects remains approximate. The effect geometry itself is
not batched. `maxParticles` and `maxLive` retain their existing SpellFx meanings; they are not
a new global hard cap on every visible sprite. Textures are caller-owned. The batch class and
the base renderer remain separately selectable for visual/performance comparison.

## Coverage And Limits

Supported now: body height/width/head-size and skin, seven head silhouettes, eye shape/color/
size/offset/tilt, modeled brows, nose and mouth variants, short/long/curly/afro/bald hair families, round/pointed ears,
tunic/armored/long outfits, colored pants and boots, a cape, full-beard approximation, a helmet
or wizard hat, sword and staff families, and a shield. The flagship includes sculpted bangs,
eye highlights, brows/nose/smile, seams, fasteners, straps, pouch, finger creases and boot laces.

This is **not full parity with the original catalog**. Hair families now have distinct silhouettes,
but some rare ids still approximate the nearest family. Swords, greatswords, axes, hammers, bows,
daggers, maces, staves and several off-hand shapes are modeled; rare weapons still fall back to a
nearby silhouette. Many hats, face-part ids, accessories and footwear styles are
not individually modelled. The full avatar editor still shows the shared catalog, so an
accepted JSON field does not imply a distinct Chibi 2 mesh. New motion is humanoid-only;
the separate creature engine keeps its lightweight procedural contract; its frog and dragon
silhouettes now have a first detail pass, while a full creature-specific rig remains future work.

There is no LOD system, foot IK, facial morph rig, cloth simulation, GPU crowd animation,
interactive part sculpting or Blender round-trip in this milestone. It establishes the body,
animation and measurement foundation before expanding to additional body plans.

For new parts, add offline construction to `buildTemplate`, assign bones through `SkinBuilder`,
and keep the two material buckets unless a genuinely different surface requires another draw.
Use the flagship's current budget (under 8,500 triangles, two body meshes) as a regression guard.
Prefer silhouette and joint deformation improvements over extra segments on tiny details.
Future imported scenery/props can use a separate glTF loader without changing this character
contract. A later creature editor should edit a serializable recipe and rebuild/bake on edits,
not regenerate geometry in the combat frame loop.

Authored character pieces are indexed separately in `data/chibi2-assets.json`, with Emberveil's
30 class-facing records in `data/emberveil-class-assets.json`. This keeps bespoke equipment
discoverable without turning the shared avatar catalog into renderer-specific code. Headwear also
declares a crown-occlusion policy so hats and hoods do not share the hair volume beneath them.

## Verification

`tests/chibi2.spec.js` checks finite geometry and normalized weights, independent joint animation,
one-shot/death transitions, caller-owned placement, shared-asset lifetime, preset ids, draw/triangle
budgets, sprite pixel equivalence, parent visibility, paused-camera billboards, cleanup, rendering
controls, benchmark state restoration, rapid renderer switching, mobile framing/canvas pixels, and
eight new humanoids with live effects in the opt-in Emberveil stage. Screenshots go to
`test-results/chibi2-*.png`. The original avatar, geometry and spell tests cover default paths.
