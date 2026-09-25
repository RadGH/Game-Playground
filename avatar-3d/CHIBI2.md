# Chibi 2

**Chibi 2 is the flagship Avatar 3D model** (2026-09-24). The original procedural Chibi (`mii.js`)
and the Quaternius mesh mode (`quaternius.js`) are **deprecated**: they stay on the avatar page,
labelled as such, only so the three can be compared. Nothing new is built for them.

## The 2026-09-24 overhaul (races, bodies, faces, animation)

A play-test list against the Avatar 3D page, all of it done in the model so every game gets it:

| File | What it owns now |
|---|---|
| `js/chibi2-races.js` | **Nine races** as parameter sets on the one body (no Three.js; node tests read it): `human`, `elf`, `dwarf`, `orc`, `giant`, `goblin`, `halfling`, `undead`, `beast` (Beastkin). Each has body multipliers (leg, torso, width, shoulders, arm, hand, head, neck, default roundness), face shaping (jaw, brow, ear size, cheek hollow, muzzle), a posture folded into every clip, body-slider ranges, a skin/hair palette and **weights** per part slot. `randomChibi2()` rolls a look with the 2D generator and then re-picks the slots the race has an opinion about by weight — so a random dwarf is bearded in heavy boots 60/60 times, and a human still rolls pointed ears, just rarely. Labels read "Chibi 2 Human", "Chibi 2 Dwarf"... |
| `js/chibi2-body.js` | The torso, neck, arms, hands, legs, feet and **every garment**. Tops, bottoms and shoes are tables (`TOP_STYLES`, `BOTTOM_STYLES`, `SHOE_STYLES`): a top says its sleeve, collar, front, hem, belt, armour and cuffs and nothing else is drawn. (The first body wore one jacket — collar, buttons, cross strap, belt, pouch, leather cuffs, knee-high boots — on EVERY character, and each top piled its own pieces on top of it.) The torso has a waist and sloping shoulders, and **roundness** (`body.round`, 0..1, default from the race) adds a belly, hips and thicker limbs; limbs also thicken with body width (`LW`). Everything laid on the body asks `chestZ(x, y)` / `hipsZ(x, y)` for the surface under it. |
| `js/chibi2-face.js` | The head shell, ears, eyes, lids, brows, nose, mouth, beards, face marks and things worn on the face. One surface, `faceZ(x, y)`, read off the head's own rings; every feature is placed ON it and relative to the one above it (brow above the eye TOP, moustache under the nose, mouth under the moustache, beard under the mouth). Lids are curved sheets on the eye's dome, so a sleepy or narrow eye has a real arched lid rather than a bar. **Closed eyes are gone**: `happy`/`wink` are open smiling eyes (the cheek pushes up), and the blink is replaced by a **glance** — the iris and pupil ride their own `pupilL`/`pupilR` bones and drift to a new spot every couple of seconds. Cheek circles are an option (`body.cheeks`), not on every face. Glasses, monocle, eyepatch, goggles, masks, blindfold, earrings and nose ring are modelled. |
| `js/chibi2-hats.js` | Eleven hats the first milestone left unmodelled: crown, circlet, headband, feather band, flower, cap, leather cap, bandana, straw hat, top hat, mail coif. A brimmed hat shows the hair flattened under its brim (`HAT_BRIM` in chibi2.js), and a back-of-head shell now reaches the nape for every hairstyle (the crown cap used to stop at the skull's equator). |
| `js/chibi2-motion.js` | Rewritten. See **Animation** below. |
| `js/chibi2-weapon-ids.js` | Adds `holdFor(avatar)` — what each hand carries (`right`, `left`, `twoHand`, `dualTwo`, edge axes) — which the clips read. |

New parts (registered in `avatar-2d/js/parts/chibi2-parts.js` so the shared normaliser keeps them —
Farhold normalises every look before building it): tops `travel_shirt`, `gambeson`; bottoms
`breeches`, `leggings`; shoes `shoes`, `wraps`; capes `travel_cloak` (hood rolled at the neck,
brooch), `tattered_cape`; decorations `belt_pouches`, `bedroll_pack`, `waterskin`, `trophy_belt`;
facial hair `braided_beard`; accessory `bandolier` (existing 2D id, now modelled); the off-hand
`book` is a real tome. **Any held weapon id may go in the off hand** (a second sword, an axe, a
two-hander) and is built in the left hand.

### Rig

22 bones: root, hips, chest, head, `eyeL`/`eyeR` with `pupilL`/`pupilR`, three per arm and leg, and
one **grip bone per hand** (`gripR`, `gripL`, in the palm). Everything held is skinned to a grip
bone (`SkinBuilder.add(..., { skinTo })` places a piece in one bone's space and skins it to another),
so a clip can point the weapon, roll the wrist through a cut, or scale the grip to nothing.

### Animation

* **Grip solve.** A clip says where the weapon's business end should face — `pitch` (0 down, -PI/2
  forward, -PI up, in the chest's frame), `yaw`, `roll` — and `aim()` solves the grip rotation from
  the arm chain, so a sword points FORWARD at rest instead of at the floor, and a slash rolls the
  edge over as it crosses. Each item has an edge axis (a sword's edges are ±x, an axe head faces -z,
  a hammer face -x, a crossbow muzzle +z).
* **Follow-through.** After sampling, each child joint trails its parent by a few frames (head behind
  chest, chest behind hips, forearm behind upper arm, hand behind forearm) — one pass over every clip,
  including clips written later. This is the main fix for "stiff".
* **Hold-aware clips.** `idle`, `walk`, `run`, `ready`, `guard` and `attack` carry whatever is in the
  hands: a two-hander rests on the shoulder, a polearm stands upright, a staff is planted, a bow is in
  the LEFT hand and stands upright, a strapped shield hangs FACE OUT at the side. `guard` with a shield
  brings the forearm across the chest with the shield face square to the front (a real block);
  without one it parries with the blade, or raises the fists. `attack` plays the strike the hands
  suggest (`attackFor`), so a game that only ever asks for `attack` still gets a chop, a stab, a
  shot or a cast.
* **New opt-in lists.** `CHIBI2_MELEE_ANIMS` (chop, hack, smash, uppercut, stab, flurry, bash, block,
  parry, offSlash, offThrust, crossSlash, twinCleave, twinSlam, spinSweep, thrust2h, punch, kick,
  throw, castBook) and `CHIBI2_EMOTE_ANIMS` (cheer, bowGreet, point, shrug, nod, headShake, laugh,
  clap, salute, kneel, sitGround, pray, dance, lookAround, crossArms, stretch, drink, sleep).
  `CHIBI2_EVERY_ANIMS` is all of them; `CHIBI2_ANIM_GROUPS` groups them for a menu. The original
  lists (`CHIBI2_ANIMS`, `CHIBI2_SWIM_ANIMS`, `CHIBI2_COMBAT_ANIMS`, `CHIBI2_RIDE_ANIMS`,
  `CHIBI2_WORK_ANIMS`) are unchanged; `CHIBI2_COMBAT_RIDE` (Farhold's) now includes the new two.
* **Hands free — answered at the MODEL level.** "Should Wave unequip the items in the hand — model
  or game?" The model: clips in `HANDS_FREE` (wave, talk, every emote, swimming, punch, kick) shrink
  the grip bones to nothing for their length, so the weapon and the off-hand item are put away and
  come back as the clip fades out. Every game gets it for free. `actor.setHandsFree(true)` is there
  for a game that wants empty hands for its own reasons (a cutscene, carrying something). A future
  step would sheathe the weapon on the back/hip instead of vanishing it; that is a game-side choice.

### Fixes the overhaul makes to the old catalogue

* The four original hafted weapons (`greataxe`, `hammer`, `warhammer`, `mace`) had their heads at +y,
  behind the fist; they are turned head-first about the grip (a rotation, not a mirror).
* Every shield is strapped to the forearm face out (`strapShield` in `chibi2-weapons.js`), including
  the original `heater_shield`/`kite_shield`/`round_shield`/`tower_shield`/`buckler`.
* `daggers`/`fh_daggers` drop their left knife when the off hand holds something else.

### Verify

`avatar-3d/tests/chibi2-races.test.js` (node: races, weights against the catalogue, normaliser
survival, race-weighted random, holdFor) and `avatar-3d/tests/chibi2-overhaul.spec.js` (browser:
race heights and budgets, roundness depth, sword direction at rest, shield out at rest and forward
in guard, a wave hides the weapon, every clip in eight holds is finite, the avatar page leads with
Chibi 2 and the race picker changes the body).

---

## First milestone (2026-09-15)

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
rig had 18 bones at this milestone (22 since the overhaul, see Rig above), and the blink that scaled
the eye bones is now a glance. Conservative mesh bounds avoid recomputing skinned bounds every frame.

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
or wizard hat, sword and staff families, and a shield, plus every part id the Emberveil classes use (see Part coverage). The flagship includes sculpted bangs,
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

### Head space and hoods

Head pieces are authored in head-bone space before the `head()` helper scales them by
`rig.headScale`: +z is forward, the head spans y 0 to 0.60 (centre about 0.30), half-width 0.335,
half-depth 0.271, and the face plane (nose and cheeks) sits at about z 0.27. Eyes are at y 0.25,
brows at about 0.38, ears at x 0.325.

`hat.id: "hood"` (`buildHood`, shape from the exported `hoodGrid(HOOD_SHAPE)`) is one cowl grid:
columns run around the face opening from the left jaw over the brow to the right jaw, rows run from
the face rim back over a soft crown peak to a point at the nape. The rim is pulled forward past the
face, and rows below the jaw hang onto the neck. It is an outer shell, a darker inner lining shell
(the hood colour at 55%), one piped edge (`hat.color2`, or the hood colour lightened) along rim and
hem, and a short mantle on the chest bone whose top tucks inside the hood. The cowl's lower rows
blend to the chest bone, so the hem follows the body while the head nods. About 1,150 triangles,
cloth bucket only.

The back of that cowl is the only part of it a third-person camera ever sees, and until 2026-09-18
it was one unbroken sheet of one colour running into the nape: Farhold's hooded mage read as a solid
dark dome with no head in it, and as a black blob at night. It is now built the way a real hood is —
two panels stitched up the middle and gathered at the neck. The rows behind the ears are a shade
darker (cloth in the hood's own shadow), a piped seam runs the centre column from the brow over the
crown to the nape, and two darker gathers fan into the nape beside it. The piping's lift off the
cloth now scales with how dark that cloth is, because a flat 14% did nothing on a near-black hood.
`HOOD_SHAPE.radii` came down from 0.44/0.42/0.40 to 0.42/0.405/0.385, which was the other half of
"engulfing": the old cowl stood wider than the character's own shoulders. The rim pipe dropped from
36 steps to 30 to pay for the seam inside the 8,500-triangle class budget (the druid, the heaviest
look, sits at 8,428).

A raised hood hides ears and all hair outside the face opening (crown cap, side
locks, long/bob/braid backs, ponytail, buns, spikes, mohawk, tonsure, pixie and `hood_hair` locks);
short/long/wavy hair keeps its five middle fringe locks under the brow.

`hat.id: "hood_down"` (`buildHoodDown`) is a rolled collar behind the neck plus the empty hood lying
flat on the upper back, all on the chest bone. It does not hide hair. `tests/chibi2.spec.js`
measures the cowl (forward reach past the face, depth to width ratio, rim in front of the face,
lining clear of the head) and the triangle cost of both variants.

Any hat that covers the crown must stay outside the skull dome at every height, not only at the
brim: the skull is half-width 0.30 at y 0.44, 0.265 at 0.50, 0.15 at 0.57 and closes at 0.60.
A cone or short cylinder narrows or ends too early and the scalp shows through. Keep brims at
y 0.41 or higher so they clear the brows (top edge about 0.405). The Bard `feather_cap` crown is a
domed `profile()` up to 0.75, with the band on its surface and the feather rooted under the band.
`wide_brim` has a crown cylinder from 0.40 to 0.65. `goggles_up` rests the lenses back on the
hairline above the fringe with a strap circling just outside the hair cap, and does not hide hair.
A flat torus rotated by x = pi/2 is squashed in depth with scale `[1, k, 1]`, not `[1, 1, k]`.
The spec's headwear sweep casts rays at every Emberveil class head from above and around and fails
if the first surface hit carries the skin colour.

### Part coverage: 2D id to Chibi 2

Generated by building every 2D catalog id on a plain hatless base and comparing geometry fingerprints
(2026-09-15). "Shares a shape" means two ids build identical geometry; "ignored" means the id builds the
same body as the slot's default. Every id used by the 30 Emberveil classes has its own shape, which
`tests/chibi2.spec.js` enforces. Hats that cover the crown hide hair, so hair ids differ only hatless.

| Slot | Own shape (base first) | Shares a shape (generic) | Ignored (same as base) |
|---|---|---|---|
| headShape | round, oval, square, heart, long, wide, chiseled | - | - |
| hair | short, bald, buzz, side_part, bangs, bob, long, wavy, ponytail, bun, buns, mohawk, spiky, curly, afro, braids, pixie, slicked, hood_hair, tonsure, horns_hair | - | - |
| eyes | round, almond, narrow, sleepy, angry, dot, anime, happy, wink, hollow, slit, tired, glow, glow_tear | wide (= anime) | - |
| brows | straight, angry, worried, thick, thin, none, raised | - | arched |
| nose | small, dot, button, wide, hook, none, snout | long (= hook) | upturned |
| mouth | smile, neutral, frown, grin, smirk, o, fangs, sad_open, tusks | open (= sad_open) | tongue, stitched |
| ears | normal, pointed, none | - | big, fins |
| facialHair | none, stubble, goatee, mustache, full, long, chinstrap, soul_patch | - | - |
| top | tshirt, tunic, hoodie, plate, robe, dress, coat, chainmail, surcoat, scale_plate, fur_tunic, strapped_leather, wraps, doublet, open_coat, trench, smith_apron, sash_robe, silks, trim_robe, high_collar_robe | vest (= leather/strapped_leather), leather (= strapped_leather), apron (= smith_apron) | tank, rags, harness |
| bottom | pants, skirt, ragged, greaves, baggy | - | shorts, kilt, loincloth |
| shoes | sneakers, boots, heavy, sandals, barefoot, slippers | - | pointed, hooves |
| accessory | none, glasses, round_glasses, scarf, pendant, crescent, pocketwatch, prayer_beads | - | monocle, eyepatch, mask, scarf_mask, goggles, earrings, nose_ring, blindfold, sunglasses, bandolier |
| hat | none, wizard, hood, horned_helm, plate_helm, dragon_helm, wide_brim, feather_cap, goggles_up, hood_down | helmet (= great_helm/plate_helm), great_helm (= plate_helm) | crown, cap, bandana, headband, straw, circlet, top_hat, flower, chain_coif, leather_cap, feather_band |
| extras | none, freckles, blush, scar, scar_cheek, third_eye, soot, war_stripe, lightning_arcs, chest_glow | - | warpaint, tattoo, dirt, undead_skin, wrinkles, burn_scar, nose_scar, mud, paint_dots, blood, brand, pale, cheek_stripes, eye_black, freckles_heavy, face_glyphs |
| cape | none, cape, shoulder_cape, half_cape, fur_mantle, feather_mantle, shawl | - | - |
| held | none, sword, greatsword, greataxe, hammer, warhammer, mace, rapier, saber, daggers, cleaver, bow, crossbow, quarterstaff, staff_orb, staff_skull, staff_crook, staff_crystal, staff_totem, lute, book, hourglass, orb, flame, lightning, ring_rune | - | - |
| offhand | none, heater_shield, kite_shield, round_shield, tower_shield, buckler, dagger, map, orb, book, quiver, torch | - | - |
| decor | none, pauldrons, tabard, knife_rig, scroll_case, belt_lantern, **belt_torch**, **wisp_lamp**, bone_charms, rune_bracers, chained_tome, herb_satchel, rune_halo, prayer_ribbons, ember_censer, storm_rods, gear_pack, bead_necklace | - | - |

### Gear and decorations

`js/chibi2-gear.js` builds held items, off-hand items, neck/wrist accessories, face marks, capes,
greaves, boot cuffs and the `decor` slot, all on the shared cloth/metal buckets. The top of the file
documents each bone's space (where the chest surface, belt, hands and shins are). Decorations are
shared with the 2D catalog (`avatar-2d/js/parts/decor.js`) and indexed in `data/chibi2-assets.json`:
pauldrons (arm bones; replace the plate top's own shoulder caps), tabard, knife_rig (right thigh),
scroll_case, belt_lantern, bone_charms, rune_bracers (forearms), chained_tome, herb_satchel, rune_halo
(head, behind the hood), prayer_ribbons, ember_censer, storm_rods, gear_pack and bead_necklace. Belt
items hang front-left, clear of both hands. Neck items move out and down over capelets
(`CAPELETS`), and a raised hood skips its own mantle when the character wears one. Every class in
`prototypes/emberveil/data/class-looks.json` wears one decoration and stays under 8,500 triangles.

**Chibi 2-only parts.** `belt_torch` and `wisp_lamp` (round 11, for Farhold's "a light needs a model
on the player") exist here and NOT in `avatar-2d/js/parts/decor.js`. `normalizeAvatar` is the 2D
catalogue's normaliser, and it throws any id it has never heard of back to the slot's default — which
is right for the 2D renderer and wrong here — so `js/chibi2.js` lists them in `CHIBI2_ONLY_PARTS` and
puts them back after normalising. **Add a part to `chibi2-gear.js` with no 2D twin and its id belongs
in that list**, or it will silently come out as `none`.

## Verification

`tests/chibi2.spec.js` checks finite geometry and normalized weights, independent joint animation,
one-shot/death transitions, caller-owned placement, shared-asset lifetime, preset ids, draw/triangle
budgets, sprite pixel equivalence, parent visibility, paused-camera billboards, cleanup, rendering
controls, benchmark state restoration, rapid renderer switching, mobile framing/canvas pixels, and
eight new humanoids with live effects in the opt-in Emberveil stage. Screenshots go to
`test-results/chibi2-*.png`. The original avatar, geometry and spell tests cover default paths.
