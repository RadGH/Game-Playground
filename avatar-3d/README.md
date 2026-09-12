# Avatar 3D — Three.js character builder

Two renderers for the **same avatar JSON** that Avatar 2D produces:

1. **Mii-style (procedural)** — `js/mii.js`. Body from primitives (capsules, rounded boxes, spheres), the face drawn from the 2D face parts onto a curved patch in front of the head (the Mii technique), procedural hair/hat/ear/clothing meshes mapped from the 2D ids, body height/width/headSize as group scaling, and procedural animations (idle, walk, run, wave, talk, dead). Zero downloads, everything authored in code, so Claude can extend it.
2. **Quaternius (CC0 meshes)** — `js/quaternius.js`. Universal Base Characters body (male/female), 6 hairstyles + beard, Modular Outfits – Fantasy (Peasant, Ranger sets) and the Universal Animation Library (43 clips), all on one skeleton. Real modelled characters with real animation; the 2D ids are mapped onto the nearest mesh; face sliders do not apply.

Open: `http://<LAN-IP>:8400/avatar-3d/`. Presets, random generation and the slot catalog are shared with `../avatar-2d/`.

## Creatures (non-humanoids) — `js/creatures.js`, demo `creatures.html`

Mii-style procedural bodies for things that are not people — **26 types over six body plans**, parameterised in `CREATURE_TYPES` (lengths/radii in metres, ear style, default colours, feature flags). The table itself lives in `js/creature-types.js`, which is free of Three.js so data tools and node tests can read it; `js/creatures.js` re-exports it and does the building.

| Plan | Types |
|---|---|
| `quad` | wolf, dire wolf, boar, bear, rat, horse, deer, hound, cat, frog, mire drake, dragon |
| `spider` | giant spider |
| `bat` (fliers) | bat, owl, moth |
| `snake` (serpents) | snake, worm (thick, segmented, head reared off the ground) |
| `biped` | golem, titan, imp (`body.blocky` swaps capsules for boxes; `features.core` adds a glowing chest heart) |
| `float` (no legs, hovers) | elemental, wisp, shard, wraith, horror — `body.shape` picks `sphere` (glowing ball + flame licks), `crystal` (octahedron cluster), `hood` (robe with an empty face and trailing rags) or `mass` (lumpy body covered in eyes, with tentacles) |

Same interface as the humanoid builder:

```js
import { createCreature, randomCreature, CREATURE_TYPES, CREATURE_ANIMS } from './avatar-3d/js/creatures.js';
const wolf = await createCreature({ type: 'wolf', size: 1.2, colors: { body: '#444' } });   // { group, update(dt,t), setAnim(name), setSpec(spec), metrics(), dispose() }
scene.add(wolf.group); wolf.setAnim('walk');            // idle · walk · run · attack (lunge + open jaw) · talk (jaw only, for growls) · dead · fly (bat/dragon)
const spec = randomCreature('dragon', seed);             // colour variation inside the type's family; a creature JSON you can store under character.creature
```

Features can be toggled on any plan (`features: { wings: true }` on a wolf works): fangs, tusks, horns, antlers, wings, spikes, mane, whiskers, claws, hooves, tail, core, glow, bulgeEyes, beak, antennae, maw, plates. Bodies face +z like the humanoids, so the same side/facing code places them. Heights before the size multiplier: wisp/moth ≈ 0.5 m, wolf ≈ 0.9 m, golem ≈ 1.4 m, horror ≈ 1.6 m, dragon ≈ 1.9 m, titan ≈ 2.6 m. Party Quest uses them for beast enemies (`prototypes/party-quest/js/main.js` `BEAST_BODY`); Emberveil uses them for its whole bestiary (`prototypes/emberveil/data/enemy-looks.json`).

## Quick use from a game

```html
<script type="importmap">{ "imports": { "three": "/vendor/three/three.module.js", "three/addons/": "/vendor/three/addons/" } }</script>
```
```js
import { createScene } from '/avatar-3d/js/scene.js';           // optional boilerplate (renderer, lights, orbit, ground, loop)
import { createMiiCharacter } from '/avatar-3d/js/mii.js';
import { createQuaterniusCharacter, CLIPS } from '/avatar-3d/js/quaternius.js';

const scene = createScene(document.querySelector('#stage'));
const npc = await createMiiCharacter(character.avatar);          // { group, update(dt,t), setAnim, setAvatar, metrics, dispose }
scene.scene.add(npc.group); npc.setAnim('walk');
scene.addTicker((dt, t) => npc.update(dt, t));

const hero = await createQuaterniusCharacter(character.avatar);  // { group, update(dt), setAnim(idle|walk|run|talk|wave|dead | any clip name), play, clips, mixers }
hero.play('Sword_Attack');
```
Both return a `group` with `userData.character = true`; put several in one scene for crowds (Mii characters are ~60 draw calls each; Quaternius ones ~6 skinned meshes with 1K textures).

## JSON → 3D mapping

| JSON field | Mii mode | Quaternius mode |
|---|---|---|
| `body.height/width/headSize` | legs group scaled about the feet, torso about the hip, head by headSize only (`metrics()` gives hipY/neckY/totalHeight) | bone scale: `thigh_l/r` Y (0.8–1.25), `spine_01` XZ (0.8–1.25, undone at `neck_01`), `Head` uniform; root lifted so feet stay on the ground |
| `body.skin` | material colour | light or dark base texture chosen by brightness, then tinted toward the colour |
| `body.frame` (`m`/`f`, optional) | ignored | picks the male/female body and outfit meshes |
| `headShape` | sphere scale variants; `square`/`chiseled` = rounded box | ignored |
| `eyes/brows/nose/mouth/extras/facialHair` + sliders | rasterized from the 2D parts to a 512² transparent canvas → `CanvasTexture` on the face patch | ignored (modelled face); `facialHair` ≠ none adds the beard mesh; eyes tinted |
| `hair.id/color` | 20 procedural styles (caps, back masses, ponytail, buns, mohawk, spikes, curls, afro, braids, horns) | nearest of Buzzed / SimpleParted / Long / Buns / BuzzedFemale, tinted; hidden under hood/helmets |
| `ears` | spheres / cones (pointed) / fins | ignored |
| `top.id/color/color2` | torso colour, sleeve length, pauldrons (plate), belt, hood ring, robe/dress/coat skirts in the legs group | outfit set: Peasant (tshirt, tunic, hoodie, vest, tank, rags, apron, dress, robe) or Ranger (plate, leather, chainmail, coat); pauldrons for plate/chainmail; tinted |
| `bottom` | leg colours, shorts (skin lower leg), skirt/kilt cones, loincloth, greave knees | outfit Legs piece, tinted |
| `shoes` | foot boxes by style (boots, heavy, sandals, pointed, hooves, barefoot) | outfit Feet piece, tinted |
| `hat` | 12 procedural hats (wizard cone+brim, helmet, crown, cap, hood, bandana, headband, straw, horned helm, circlet, top hat, flower) | Ranger hood when `hat = hood` and outfit is Ranger |
| `accessory` | not yet (face patch only) | ignored |

Mapping table: `MAP` in `quaternius.js`. Animation names for `setAnim`: `idle walk run talk wave dead` (both modes) or any raw clip name in Quaternius mode (`CLIPS`).

## Assets (`assets/quaternius/`, CC0)
`base/` Superhero_Male/Female_FullBody.gltf + light/dark skin, hair, eye textures · `hair/` Eyebrows_*, Hair_Beard, Hair_Buns, Hair_Buzzed, Hair_BuzzedFemale, Hair_Long, Hair_SimpleParted · `outfits/` Male/Female × Peasant/Ranger × Arms/Body/Legs/Feet (+ Ranger hood, pauldrons) with 1K textures · `anim/UAL1_Standard.glb` (43 clips, no root motion). Textures were downscaled from 2K/4K to 1K/512 for the repo. Licenses in `LICENSE-quaternius*.txt`. Free tier only; the paid "Source" packs add 6 bodies × 3 proportions, 20 hairstyles, 12 outfits — same loader would work.

Skeleton bone names (shared by every file): root, pelvis, spine_01..03, neck_01, Head, clavicle/upperarm/lowerarm/hand_l/r + fingers, thigh/calf/foot/ball_l/r.

## Implementation notes
- **Face patch**: `SphereGeometry` segment (±57° around the front, ±54° vertically) at 1.012× the skull radius with polygon offset, transparent `MeshStandardMaterial`; the texture is the 2D face SVG cropped to `viewBox 84 69 132 132` (head centre 150,135). Change `faceSVG()` in `face-texture.js` to include/exclude layers.
- **Animation clips** have their `.scale` tracks stripped so bone-scaling for proportions is not overwritten each frame.
- **Several skeletons**: each glTF part keeps its own skeleton; every part gets an `AnimationMixer` playing the same clip, which stays in sync because they are updated with the same `dt`. Hair/beard are attached to the body's `Head` bone with `attach()` so they follow it.
- Body under clothes is not removed (free tier has no separate head mesh); heavy outfits may clip slightly at extreme width.
- Procedural Mii animations are sine-based on the leg/arm pivots (`parts.legL/legR/armL/armR/head`); games can drive those pivots directly.

## Demo features
Mode switch, orbit camera, animation chips (procedural or clip list), turntable, PNG snapshot, random (with race rules) / random face / random outfit, presets (shared), slot editor + body sliders + Mii face sliders, body frame select, side-by-side 2D render of the same JSON, JSON copy/export/import.

## Tests
`npm test -- avatar-3d` (Playwright, headless WebGL): Mii mode draws skin-coloured pixels, walk animation moves the leg pivots, all 15 presets build; Quaternius mode loads skinned meshes, plays `Walk_Loop`, bone scaling raises the root; screenshots saved in `test-results/avatar-3d-*.png`.

## Ideas / limits
- Accessories (glasses, eyepatch) are not built in 3D yet; `mask`/`scarf` etc. would be simple meshes.
- Mii mode has no mouth animation; a cheap approach is swapping the face texture between two mouth states while talking.
- Quaternius face could take the 2D face texture as a decal on the head mesh if the UV island were known.
