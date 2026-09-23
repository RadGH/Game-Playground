# 3D High Def

A high-detail, atmospheric 3D world in a browser — terrain, forest, weather, water and a character
you can walk around in — built to find out how close plain three.js can get to the look of a
modern outdoor game without a build step, a game engine or a downloaded world.

**Open it:** `highdef-3d/index.html`. Press **V** to swap between the strategy camera and third
person; **/** lists every key.

Everything you see is generated in code. There is exactly one downloaded asset in the whole
experiment — the character body, which is CC0 and already lived in `avatar-3d/assets/quaternius/`.
Every tree, rock, leaf, blade of grass, ground texture and bark texture is drawn or built at load
time from a seed.

---

## What is in here

| File | What it does |
|---|---|
| `js/noise.js` | Value / fractal / ridged / billow / cellular noise, domain warping. Pure maths, no browser. |
| `js/world.js` | The world field: one heightmap, one moisture map, one biome map, plus `heightAt`, `normalAt`, `slopeAt`, `raycast` and `findSpawn`. |
| `js/scatter.js` | Where every plant, rock and log goes. Pure; the node tests check it with no browser. |
| `js/quality.js` | Four presets and the auto-detect. Nothing else hard-codes a view distance. |
| `js/materials.js` | `enhance()` — the one place cascaded shadows, wind sway and our height fog get bolted onto a material. |
| `js/renderer.js` | The renderer and the post-processing chain. |
| `js/postfx.js` | The two passes we wrote ourselves: light shafts and the final colour grade. |
| `js/sky.js` | Sky dome, sun, moon, stars, clouds, six weather presets, the day/night colour table, the shadow rig and the reflection probes. |
| `js/terrain.js` | Chunked ground with four detail levels and a five-surface blended shader. |
| `js/water.js` | Lakes and sea: depth colour, shoreline foam, sky reflection. |
| `js/grass.js` | A quarter of a million blades, all positioned in the vertex shader. |
| `js/vegetation.js` | Turns the scatter into instanced draws, with detail levels and a baked far ring. |
| `js/character.js` | The rigged character and its animation blend tree. |
| `js/controller.js` | Walking, running, jumping, swimming, click-to-move. |
| `js/cameras.js` | The strategy camera and the third-person camera, and the blend between them. |
| `js/input.js` | Keys and mouse. Nothing here knows what a key means. |
| `js/hud.js` | The control panel. |
| `js/app.js` | Boot order and the frame loop. |
| `js/kit/trees.js` | 14 tree species plus bushes, ferns, flowers, grass tufts and forest-floor debris. |
| `js/kit/rocks.js` | 12 rocks, 7 cliff forms, 23 props and 9 ground details. |
| `js/kit/textures.js` | 19 tileable surfaces with matching normal / roughness / occlusion maps, and the sprite atlases. |
| `assets/foliage/*.svg` | 26 hand-drawn leaf, needle, frond, blade and flower sprites, rasterised into atlases at load. |
| `data/vegetation.json` | What grows where. Change this, not the code, to change the planting. |

---

## The ideas that make it look the way it does

None of this is exotic. It is a small number of well-known techniques, each of which is worth more
than any amount of polish on the others.

**One heightmap, read by everything.** The terrain mesh, the grass, the scatter, the water depth
and the character's feet all read the same `Float32Array`. The most common way for a world like
this to feel wrong is for two of those to disagree by a few centimetres, which shows up as a
character who sinks into hills — so there is only one answer to "how tall is the ground here", and
`js/world.js` owns it. A node test asserts that `heightAt` at a grid node returns exactly what the
array holds, and that a downward ray lands within 5 cm of it.

**Physically-based lighting with a real sky.** Three's atmospheric sky shader is rendered into a
pre-filtered environment map every time the sun moves, so a wet rock at dusk reflects an actual
dusk sky rather than a grey ball. That single step does more for "this looks lit" than any number
of extra lights.

**Cascaded shadow maps.** One shadow map stretched over 250 metres gives you shadows made of
staircases. Four maps, each covering a slice of the view and each at full resolution, give crisp
shadows at your feet and usable ones at the tree line. The cost is that every shadow-casting object
is drawn once per cascade, which is why only the two nearest detail levels cast at all.

**Height fog that glows toward the sun.** `js/materials.js` replaces three's fog shader chunk with
one that integrates an exponential height falloff along the view ray (there is a closed-form answer,
so no marching and no banding) and mixes a warm colour in where you are looking toward the sun. This
is what makes distance read as distance.

**Triplanar rock.** A cliff face textured with flat top-down coordinates smears into vertical
streaks. The rock layer is sampled from three directions and blended by the surface normal. It costs
three samples instead of one and it is applied only to the layer that needs it.

**Leaves are curved cards, not spheres.** Every leaf card is a 3×3 grid bowed slightly along one
axis, so light catches it differently across its face. Flat quads read as cardboard; this is the
cheapest thing that stops them.

**Baked ambient occlusion in the vertex colours.** Every geometry the kits produce carries a
`color` attribute holding baked shading — darker at the base of a trunk, inside a canopy, in a rock
crevice, in a hollow in the ground. It is free at run time and it is most of what the expensive
screen-space version would have given us.

**Bloom before tone mapping, grade after.** Bloom on values that have already been squashed into
0..1 is a blur filter. Bloom on the raw high-dynamic-range frame is light spilling around an edge.
The vignette, contrast, saturation, split tone and grain all happen after tone mapping, where they
behave the way your eye expects.

**Light shafts without a second render.** The textbook version needs an occlusion buffer, which is
a whole extra pass over the geometry. This one smears the frame that has already been drawn toward
the sun's position on screen, keeping only the brightest parts. It works because the sky around the
sun is the brightest thing in the frame and the trees in front of it are the darkest, so the shafts
break up on the branches for free.

**Water that knows how deep it is.** The terrain height under every water vertex is known on the
processor, so depth goes into the mesh as a number. Shallow water goes green over sand, deep water
goes near-black, and the foam line hugs the real shore — with no depth buffer and no second camera.

---

## The camera

There is one perspective camera. Each mode decides where it *wants* to be and what it wants to look
at; a damper chases both. Switching mode changes which mode produces the target, and the same
damper flies the camera across — which is why the move from the strategy view down to the
character's shoulder reads as a move rather than a cut.

- **Strategy** — free movement over the map at a fixed pitch. W/A/S/D pans, the wheel zooms,
  right-drag spins and tilts, Q/E raise and lower. Clicking the ground sends the character walking
  there. There is a **true isometric** switch, which swaps in an orthographic camera and snaps to
  45° around and 35.264° down — that is what "isometric" actually means, and it is why two
  buildings the same size draw the same size.
- **Third person** — over the left shoulder, mouse to look, wheel to pull in or out, and a march
  along the view ray so the camera rides up over a hill rather than burrowing into it.

---

## The character

Body, clothes and hair are separate glTF files sharing one skeleton, with a 43-clip animation
library on the same rig. Five presets (ranger, hooded, scout, villager, herbalist) and every clip
in the library is playable from the panel.

Two things this loader does that a straight one would not:

1. **It keeps the maps the files ship with.** The glTF materials already point at colour, normal and
   packed occlusion/roughness/metalness textures. Replacing them with a fresh material built from
   guessed filenames is how you end up with flat plastic skin.
2. **It runs a blend tree.** Walk, jog and sprint are cross-faded by how fast the character is
   actually moving, with their playback phases kept in step through the change and their rates
   nudged so stride length matches ground speed. The clips were animated at 1.55, 3.4 and 6.1 m/s
   and `js/controller.js` uses exactly those numbers — matching them is what stops the feet sliding.

Each part carries its own copy of the skeleton, so each gets its own mixer; driving all of them
with identical weights every frame is the whole trick.

---

## Performance, and what was actually slow

The presets are in `js/quality.js`. On **High** at 1280×720 the frame is roughly 500 draws and
5M triangles in the main pass.

Two measurements from building this are worth keeping, because both were surprises:

**Detail levels measured to the middle of a cell instead of its nearest edge.** Subtracting half a
cell's diagonal from the distance sounded like "measure to the near corner" and was actually
"pretend everything is 90 m closer", so full-detail trees were being drawn out to 190 m. 6,776 draw
calls and 40M triangles. Measuring to the nearest point of the cell's box fixed it.

**Grouping was too fine.** At 64 m cells the forest came out as four hundred separate draws holding
three trees each — the worst of both worlds, since every group costs a draw whatever is in it. At
128 m it is a couple of hundred draws holding twenty each. The only cost is that a cell whose near
edge is close keeps its far trees at full detail too, which is one cell's worth and cheap.

And one thing that is deliberately **off** by default even on High: screen-space ambient occlusion.
It means rendering the whole scene twice more, once for depth and once for normals, and the model
kits already bake occlusion into every vertex. The panel switch turns it on.

The far ring of trees is **baked, not instanced** — at 22 triangles a tree, stamping two hundred of
them into one geometry costs nothing to build and turns two hundred draws into one.

---

## Reusing this in a game

Every module takes its dependencies as arguments and none of them reach for a global. The rough
shape:

```js
import { generateWorldSync } from './highdef-3d/js/world.js';
import { scatterWorld }       from './highdef-3d/js/scatter.js';
import { createRenderer }     from './highdef-3d/js/renderer.js';
import { createSky }          from './highdef-3d/js/sky.js';
import { createTerrain }      from './highdef-3d/js/terrain.js';
import { createVegetation }   from './highdef-3d/js/vegetation.js';
import { resolveQuality }     from './highdef-3d/js/quality.js';

const world   = generateWorldSync({ seed: 1234 });
const scatter = scatterWorld(world, rulesJson, { seed: 1234 });
const view    = createRenderer(container, resolveQuality('high'));
const sky     = createSky(scene, view.renderer, camera, { quality });   // owns the shadow rig
const terrain = createTerrain(world, quality, { csm: sky.csm });
const veg     = await createVegetation({ world, scatter, quality, csm: sky.csm });
```

**Boot order matters and is not obvious.** The world field first, because everything reads it. The
renderer next, because the sky renders itself into a reflection probe at build time and needs a live
graphics context. The sky third, because it owns the cascaded shadow rig and every material has to
be handed that rig as it is made. Everything else after.

**Every material goes through `enhance()`.** The cascaded-shadow addon replaces
`material.onBeforeCompile` outright, so anything else wanting that hook has to chain onto it rather
than assign over it. `enhance()` is where that chaining lives, along with the wind sway and the fog.
A material that skips it will not receive cascaded shadows and will use three's plain fog.

**The geometry contract.** Every geometry the kits produce carries exactly `position`, `normal`,
`uv`, `color` and `aWind`, in that order. `color` is baked shading and tint; `aWind` is
`(sway strength 0..1, phase 0..1)`. The order matters because geometries get merged, and
`mergeGeometries` refuses inputs whose attributes differ. `tests/kit.test.js` checks all 130-odd
builder/level combinations against it.

**Data first.** `data/vegetation.json` is the planting. Nothing about what grows where is in the
code.

---

## Tests

```bash
node --test highdef-3d/tests/*.test.js     # world field, scatter rules, model kit contract
npx playwright test highdef-3d             # the page in a real browser
```

The node tests cover the maths. The browser test covers the things only a browser can tell you —
and the main one is **shader compile failures**, which do not throw. Three logs them and carries on
drawing nothing, so a page with a broken shader looks like a page with a bug somewhere else
entirely. The spec collects console errors and fails on them, and it also asserts the frame is not
one flat colour and that the draw count has not silently run away.

The kit test resolves the bare `three` specifier to the vendored copy through a small loader hook
(`tests/three-loader.mjs`), so it needs no package install.

---

## Known limits

- **One world size.** 1024 m square, generated up front in about 1.6 seconds. There is no streaming
  of new land; a bigger world wants the generation moved to a worker and done in tiles.
- **Water does not reflect the world, only the sky.** Real reflections mean rendering the scene a
  second time into a mirrored camera. The sky probe plus fresnel gets most of the way there and
  costs nothing.
- **Grass casts no shadow.** A quarter of a million blades in the shadow pass is not worth it.
- **Nothing collides but trees and rocks.** Bushes, ferns and flowers are walked straight through
  on purpose.
- **The character's outfit pieces are the free-tier Quaternius set**, so the wardrobe is two
  outfits deep. The loader logs and skips a missing piece rather than failing.
- **No sound.** `sfx/js/sfx.js` is the place to get it from if this grows into something.

## Licences

The character body, clothes, hair and animation library are **CC0** (Quaternius); the licence files
sit beside the assets in `avatar-3d/assets/quaternius/`. Three.js and its addons are MIT. Everything
else in this folder — every model, texture and SVG — was generated or drawn for this experiment.
