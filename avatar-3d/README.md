# Avatar 3D — Three.js character builder

Three renderers for the **same avatar JSON** that Avatar 2D produces. **Chibi 2 is the flagship** and
the page opens on it; the other two are **deprecated** (kept, labelled, for comparison only).

0. **Chibi 2 (flagship)** — see item 3 and [CHIBI2.md](CHIBI2.md). Since the 2026-09-24 overhaul: nine
   races (`body.race`: human, elf, dwarf, orc, giant, goblin, halfling, undead, beast) that change the
   body's proportions and roll race-weighted looks, a roundness slider (`body.round`), optional round
   cheeks (`body.cheeks`), self-contained outfits, a face rebuilt on the face's own surface, weapons
   aimed through grip bones, and ~90 animations including weapon-family attacks and emotes.

1. **Mii-style (procedural) — DEPRECATED** — `js/mii.js`. Body from primitives (capsules, rounded boxes, spheres), the face drawn from the 2D face parts onto a curved patch in front of the head (the Mii technique), procedural hair/hat/ear/clothing meshes mapped from the 2D ids, body height/width/headSize as group scaling, and procedural animations (idle, walk, run, wave, talk, dead). Zero downloads, everything authored in code, so Claude can extend it.
2. **Quaternius (CC0 meshes) — DEPRECATED** — `js/quaternius.js`. Universal Base Characters body (male/female), 6 hairstyles + beard, Modular Outfits – Fantasy (Peasant, Ranger sets) and the Universal Animation Library (43 clips), all on one skeleton. Real modelled characters with real animation; the 2D ids are mapped onto the nearest mesh; face sliders do not apply.
3. **Chibi 2** — `js/chibi2.js` (+ `chibi2-body.js`, `chibi2-face.js`, `chibi2-hats.js`, `chibi2-races.js`, `chibi2-motion.js`, `chibi2-gear.js`, `chibi2-weapons.js`). Profiled procedural surfaces compiled into two skinned meshes, a 22-bone rig (18 at milestone 1), modelled facial features (eyes, brows, noses, mouths, facial hair and marks), layered equipment and 12 animation states. The Vanguard preset is about 8,000 triangles. This is a focused humanoid foundation; existing part ids are accepted but not all have distinct models. [Architecture, supported mappings, integration and benchmark](CHIBI2.md).

Open: `http://<LAN-IP>:8400/avatar-3d/`. Presets, random generation and the slot catalog are shared with `../avatar-2d/`.

**Chibi 2 comparison:** `http://<LAN-IP>:8400/avatar-3d/chibi2.html`. Character, side-by-side and eight-fighter views, original/batched spell sprites, equal-settings sequential benchmarks and JSON results. Emberveil now uses Chibi 2 by default; `/prototypes/emberveil/?renderer=chibi1` selects the original renderer.

## Creatures (non-humanoids) — `js/creatures.js`, demo `creatures.html`

Mii-style procedural bodies for things that are not people — **37 types over six body plans**, parameterised in `CREATURE_TYPES` (lengths/radii in metres, ear style, default colours, feature flags). The newest set adds hyena, saber cat, crocodile, turtle, griffin, phoenix, beetle, centipede, slime, mushroom and mimic silhouettes. Ten ready-made designs built on those new types (colours, size, voice and traits) live in `data/creature-variants.json`; they are not wired into any game, so a game copies the ones it wants into its own looks table. The table itself lives in `js/creature-types.js`, which is free of Three.js so data tools and node tests can read it; `js/creatures.js` re-exports it and does the building. Round 11 added three **mounts** — `pony` (short legs, deep barrel), `courser` (long legs, lean, streaming tail) and `elk` (a deer's frame scaled up, antlers on by default) — because Farhold's three mount bases were all being drawn as the same horse, and `normalizeCreature` carries only type/size/colours/features: the proportions that make one mount look different from another have to be a type.

| Plan | Types |
|---|---|
| `quad` | wolf, dire wolf, boar, bear, rat, horse, deer, hound, cat, frog, mire drake, dragon, hyena, saber cat, crocodile, turtle, griffin |
| `spider` | giant spider, beetle |
| `bat` (fliers) | bat, owl, moth, phoenix |
| `snake` (serpents) | snake, worm, centipede (thick, segmented, head reared off the ground) |
| `biped` | golem, titan, imp (`body.blocky` swaps capsules for boxes; `features.core` adds a glowing chest heart) |
| `float` (no legs, hovers) | elemental, wisp, shard, wraith, horror, slime, mushroom, mimic — `body.shape` picks `sphere` (glowing ball + flame licks), `crystal` (octahedron cluster), `hood` (robe with an empty face and trailing rags) or `mass` (lumpy body covered in eyes, with tentacles) |

Same interface as the humanoid builder:

```js
import { createCreature, randomCreature, CREATURE_TYPES, CREATURE_ANIMS } from './avatar-3d/js/creatures.js';
const wolf = await createCreature({ type: 'wolf', size: 1.2, colors: { body: '#444' } });   // { group, update(dt,t), setAnim(name), setSpec(spec), metrics(), dispose() }
scene.add(wolf.group); wolf.setAnim('walk');            // idle · walk · run · attack (lunge + open jaw) · talk (jaw only, for growls) · dead · fly (bat/dragon)
const spec = randomCreature('dragon', seed);             // colour variation inside the type's family; a creature JSON you can store under character.creature
```

Features can be toggled on any plan (`features: { wings: true }` on a wolf works): fangs, tusks, horns, antlers, wings, spikes, mane, whiskers, claws, hooves, tail, core, glow, bulgeEyes, beak, antennae, maw, plates. Bodies face +z like the humanoids, so the same side/facing code places them. Heights before the size multiplier: wisp/moth ≈ 0.5 m, wolf ≈ 0.9 m, golem ≈ 1.4 m, horror ≈ 1.6 m, dragon ≈ 1.9 m, titan ≈ 2.6 m. Party Quest uses them for beast enemies (`prototypes/party-quest/js/main.js` `BEAST_BODY`); Emberveil uses them for its whole bestiary (`prototypes/emberveil/data/enemy-looks.json`).

The current creature visual pass gives frogs a squat, long-legged silhouette with throat, mouth and toe detail, and gives drakes/dragons a broader chest, crest, nostrils, slit pupils and back scales. These remain lightweight primitives behind the same `createCreature` JSON contract, so existing enemy definitions and animation calls continue to work.

Bespoke Chibi 2 accessories are tracked in `data/chibi2-assets.json`; Emberveil's 30 class-facing records are listed in `data/emberveil-class-assets.json`. The Bard cap (`hat.id: "feather_cap"`) is a modeled red cap with brim, band and green feather, and headwear now suppresses the covered crown/fringe hair layer so it does not clip. The hood (`hat.id: "hood"`) is a modeled cowl that wraps the head, frames the face with a piped rim and settles onto a small mantle; `hood_down` is a rolled collar with the hood lying on the back (see `CHIBI2.md`, Head space and hoods). Clothing ids now change silhouette as well as color: coats and robes have tails, doublets have panels, wraps have bands, skirts/baggy/ragged bottoms are distinct, and sandals/heavy/slipper/barefoot footwear read differently.

## Vehicles — `js/vehicles.js`, demo `vehicles.html`

Procedural travel vehicles in the same chunky primitive style, for games with a road in them. Seven
types in `VEHICLE_TYPES`, over five build plans:

| Type | Plan | What it is |
|---|---|---|
| `hand_cart` | `cart` | two spoked wheels, an open bed and shafts — somebody in the party pulls it |
| `pack_mule` | `pack` | no cart at all: panniers, crates and a bedroll roped over a mule's back |
| `wagon` | `wagon` | four wheels, canvas over four hoops, one horse in the shafts |
| `ox_cart` | `cart` | heavy solid wheels, a deep bed, an ox (a scaled boar with horns and hooves) |
| `war_wagon` | `wagon` | iron plates bolted over the sides, rivets, spiked hubs, a rack of shields, two horses |
| `coach` | `coach` | a closed cabin with windows, gold trim, lanterns that glow, two horses |
| `dragon_sled` | `sled` | steel runners instead of wheels, glowing runes, harnessed to a drake |

Draft animals are **real creature bodies** (`createCreature`), so the horse pulling a wagon is the same
horse the bestiary uses, and it walks when the vehicle rolls.

```js
import { createVehicle, VEHICLE_TYPES, vehicleModelFor } from './avatar-3d/js/vehicles.js';
const v = await createVehicle('wagon');          // or a spec: { type, size, colors: { wood, trim, metal, cloth }, animal }
scene.add(v.group); v.setAnim('roll');            // idle · roll (wheels turn, the animal walks) · dead (parked)
v.metrics();                                      // { length, width, height, center, wheelR, hitch, seat, animals }
```

Everything is built **facing +x** (the cart rolls forward along +x, the animal is at the front, the
axles run along z), so a scene rotates the group to aim it. `metrics().hitch` is where the animal
stands and `.seat` is where a driver would sit, if a game wants to put a hero on the bench.
`vehicleModelFor(id)` maps a game's own vehicle ids onto the catalog — Emberveil's `VEHICLES` keys
(`none` → nothing drawn, `mule` → `pack_mule`, and the rest one to one).

Emberveil 2 parks the party's vehicle behind them on the world stage, stands it at the edge of the camp
circle in the firelight, and rolls it across the stage during a crossing
(`prototypes/emberveil/js/stage.js`: `setVehicle`, `parkVehicle`, `camp`, `travelAcross`).

## Spell effects — `js/spellfx.js`, demo `spellfx.html`

Combat effects for a 3D stage: **projectiles** that fly between two points, **impacts** that burst where they land, **cast** flashes, **heal**/**revive**, and looping **status auras** stuck to a body. Everything is built from shaped geometry (cones, spinning shard clusters, expanding torus rings, ground rune discs, tumbling planes, jagged lines) and the 49 particle sprites in `assets/data/fx/` drawn as billboards — deliberately **no glowing spheres**. Bright parts are additive with tone mapping off so they stay vivid; smoke, shadow and toxic cloud use normal blending so they read as dark against a bright sky.

The module knows nothing about any game. It needs a `THREE.Scene`, a way to fetch a sprite texture, and one `update(dt)` call per frame.

```js
import * as THREE from 'three';
import { SpellFx, ELEMENTS, STATUS_FX, elementName } from '/avatar-3d/js/spellfx.js';
import { Assets } from '/assets/js/assets.js';

const assets = await Assets.open('/assets/');
const textures = await assets.fxTextures(THREE);        // { flame: CanvasTexture, ember: …, 49 of them }
const fx = new SpellFx(scene.scene, { textures, camera: scene.camera });
scene.addTicker(dt => fx.update(dt));                   // drive it from the frame loop

await fx.projectile({ from: casterChest, to: targetChest, element: 'fire' });   // resolves on arrival
fx.impact({ at: targetChest, element: 'fire', crit: true });
fx.status(targetGroup, 'burn', true);                   // aura parented to the body, follows it
fx.clearStatus(targetGroup);                            // or clearStatuses(target)
fx.heal({ at: feet }); fx.revive({ at: feet }); fx.cast({ at: feet, element: 'holy' });
fx.aoe({ points: [a, b, c], element: 'arcane' });
fx.breath({ from: mouth, dir: facing, length: 7, arc: 0.9, element: 'fire' });   // call ~4x a second while channelling
const orb = fx.orbitOrb({ element: 'lightning', size: 0.25 });                     // move it yourself every frame
orb.setPosition(p); orb.pulse(); orb.dispose();
fx.pillar({ at: feet, radius: 3, element: 'holy' });
fx.vortex({ at: feet, radius: 4, element: 'shadow' });
fx.storm({ at: feet, radius: 5, element: 'ice' });                                 // 'poison' = a rolling toxic cloud
fx.footfall({ at: step, element: 'fire', dir: walkDir });
fx.dispose();
```

**`scale`** is a global size multiplier: `1` is tuned for the effects gallery, where the camera is close. Both prototype stages pass **`scale: 1.4`** because the fight camera sits further back and the bodies fill about a third of the frame — at `1` the effects vanish against the backdrop. It multiplies sprite and geometry sizes, ring radii and burst spread, but never the world positions an effect is given. `impact()` also takes `height` (the target body's height, which the stages pass from `heightOf(id)`) so a physical slash is drawn at body scale rather than a fixed size.

`textures` may be a plain object, a `Map`, or a function `(id) => THREE.Texture|null`; a missing sprite is skipped, so an effect degrades to its geometry instead of throwing. `new SpellFx(scene, { textures: null })` is legal — call `fx.setTextures(t)` when an async load finishes (that is what the stages do). `createSpellFx(scene, { assets, camera })` does the load for you.

### Elements (`ELEMENTS`)

`elementName(x)` maps a game's damage type or skill type onto one of these (`cold`/`frost` → ice, `magic` → arcane, `melee`/`ranged` → physical, and so on — see `ELEMENT_ALIASES`); unknown names fall back to arcane.

Every element has a look no other element shares (the 2026-09-25 overhaul). Colours come from `ELEMENT_PALETTE` (`hot` → `mid` → `deep`, plus `smoke` for dark normal-blended parts).

| Element | In flight | Impact | Zone (`aoe` with 3+ points) |
|---|---|---|---|
| `fire` | flame cone with a white-hot core, rising embers, dark smoke | white-yellow flash, fireball, embers, a column of dark smoke, a scorch mark that stays ~2.5 s | a ring of flame round the edge over a scorch |
| `ice` | tumbling shards, frost mist, falling flakes, glints | white flash, a crystal shard burst, snow drifting down, mist settling, a frost ring with ice spikes that stays ~2 s | a frost field with a ring of spikes |
| `lightning` | instant thick zigzag (white core in a yellow glow) with forks, crackles along it, flashes at both ends | white flash, forks from the hit into the floor and across it, spark streaks, crackles, a crack mark | arcs chained point to point round the ring |
| `poison` | a big bubble dripping globules, a green haze trail | splash of globules, a haze that hangs ~2 s, a puddle that keeps bubbling | a thick rolling haze and a stain |
| `shadow` | a dark void core with a violet rim, claws, dark tendrils (normal blending) | implosion (tendrils and a ring close in, a dark core swells) then a burst of dark smoke and wisps, a skull, a shadow pool | a dark swirl collapsing, tendrils spiralling in |
| `holy` | a spinning sigil with motes orbiting it, golden sparkles, feathers | a beam of light drops onto the spot, rune on the floor, motes climbing, feathers | a rune disc and golden halos rising |
| `arcane` | shards round a rune, glyphs orbiting and shed as a trail | an expanding rune ring standing up plus one on the floor, glyphs thrown out that circle the hit | a big spinning rune ring, glyphs circling |
| `nature` | a drilling helix of leaves and thorns, leaves shed, pollen | leaves spiralling up, thorns, pollen, vines on the floor | a spiral of leaves round the edge |
| `physical` | an arrow (or `shape: 'axe'`), a faint wake | slashes, spark streaks, dust at the feet | dust ring |
| `bleed` | a heavy drop trailing drops | falling drops, red mist, two red slashes, a blood splat | dust ring and a stain |
| `true` | white shard cluster | the arcane burst in white | white rune ring |

A zone thins each point's burst (roughly `2.2 / √points`) and skips the heavy pieces (beams, standing rings, spikes) because the zone signature carries them, so a 12-point ring costs about what four single hits do.

**Floor height.** Decals (scorch, frost ring, rune ring…) lie on the floor. On a stage the floor is y = 0; if a point is far from 0 (an open world), the floor is taken as ~0.9 m under an impact point (0.4 m under a `cast` point). Pass `ground: y` to `impact`, `aoe` or `cast` to be exact. The new methods below put their ground pieces at `at.y` + a few cm.

`projectile()` takes `{ from, to, element, shape?, speed?, arc?, ms?, crit? }`. Flight is clamped to **160–450 ms** so a fight stays readable (pass `ms` to override, e.g. for screenshots). `shape` overrides the element's default: `cone`, `shards`, `ribbon`, `rune`, `spiral`, `helix`, `bolt`, `arrow`, `axe`, `bubbles`, `drops`.

### Status auras (`STATUS_FX`)

`fx.status(bodyGroup, type, on)` parents an aura to the body so it follows it around the stage. Sizes and orbit radii scale with the body's height (`userData.fxHeight`, else a `Box3`), so a rat and a dragon both look right; orbits at chest height sit wider than ones at the head so a robe or a thick body does not swallow them. Colours follow Emberveil's `data/status-effects.json` where one exists. Unknown names get a plain circling mote rather than nothing.

| Aura | What it looks like |
|---|---|
| `burn` | flames licking upward around the body |
| `poison` | bubbles rising out of it |
| `bleed` | drops running down |
| `freeze` | a shell of ice shards plus a frost ring at the feet |
| `stun` | stars orbiting the head |
| `sleep` | zzz drifting up and away |
| `confused` | question marks orbiting the head |
| `dazed` | a tilted halo (hoop + disc) above the head with motes riding it |
| `blind` | a dark blindfold band across the eyes plus a closed-eye glyph |
| `slow` | arrows sliding down beside the body |
| `marked` | a reticle bobbing overhead |
| `barrier` / `block` | a shield plate facing the viewer and a torus sliding up and down |
| `regen` | motes and leaves rising |
| `sunder` | crack sprites stuck on the body, flickering |
| `curse` | skulls and a wisp circling the feet over a dark ring |
| `silence` | a muted-speaker glyph overhead |
| `disarm` | a chain across the chest |
| `root` | vines and a ring gripping the feet |
| `rally` | arrows shooting up out of the body |
| `haste` | speed lines streaming off both flanks plus sparks kicked up at the feet |
| `enchant` | three shards orbiting the chest inside a faint hoop |
| `deflect` | a tilted halo above the head with motes riding it |

### Channelled and area spells

All positions are world-space `THREE.Vector3`; sizes are in metres. Each returns nothing unless stated.

| Call | What it draws |
|---|---|
| `breath({ from, dir, length = 7, arc = 0.9, element = 'fire', ms = 300 })` | one pulse of a cone stream along `dir` (flattened to horizontal), `length` m long and `arc` radians wide. Call it ~4 times a second while a skill channels; pulses overlap into a continuous stream. Fire: flame and embers with smoke at the far end. Ice: frost mist, flakes, shards. Poison: a heavy green gas that sinks, bubbles. Shadow: dark tendrils with violet wisps. Arcane: glyphs and shards in a violet haze. Lightning: forked arcs re-rolled every few frames plus crackles. Others carry their own motes. |
| `orbitOrb({ element = 'lightning', size = 0.25 })` → `{ group, setPosition(v), pulse(), dispose() }` | a glowing orb (core + halo + crackles/flames/glyphs/wisps by element, and a short wake of motes when it moves). You move it every frame; `pulse()` flashes it when it strikes. It reports a light through `lights()` for as long as it exists and is never retired by the `maxLive` cap, so its owner must call `dispose()`. |
| `pillar({ at, radius = 3, element = 'holy', ms = 700 })` | a column that slams down out of the sky in the first ~12% of `ms`, a flash and ground rings out to `radius`, a floor mark by element, motes thrown out then climbing the column while it narrows and fades. Lightning adds bolts down the column; ice adds spikes. |
| `vortex({ at, radius = 4, element = 'shadow', ms = 1500 })` | a swirling rift: two counter-spinning swirl discs and a rim, particles born on the rim that spiral in and vanish in the middle, a throbbing core, a collapse flash at the end. Shadow (and arcane) draw a real dark hole. |
| `storm({ at, radius = 5, element = 'ice', ms = 3000 })` | weather over the circle. Ice: a cloud, hail streaks that splash on the ground, snow, a frost field. Poison: a rolling toxic cloud at knee-to-head height, bubbling ground. Lightning: strikes from a dark cloud. Fire: falling cinders that flare where they land. Others: the element's motes raining down. Spawn rates follow the area. |
| `footfall({ at, element = 'fire', yaw?, dir?, size = 0.45 })` | a footprint patch that lasts ~2.5 s: a charred/stained print under a glowing one, with a few small flames (fire), mist (ice), bubbles (poison) or motes. `yaw` or `dir` turns it to the walking direction. |

### Budget and lights

Every new particle comes from the sprite pool and counts against `maxParticles`; `budgetScale()` thins emission to half at 60% of the cap, a quarter at 85% and none at the cap, so a big fight thins out instead of stalling. Each impact, zone or new-method call is **one** live entry however many pieces it has (so `maxLive` is not eaten by one burst), and `lights()` hands out **one** light per call — the call's main entry, found by serial number so the `maxLive` cap retiring old entries mid-call cannot hide it. Ground decals and beams share their geometry.

Other helpers: `statusesOn(target)`, `pulseStatus(target, type)` (one swell, for a damage-over-time tick), `liveCount` (running effects, handy in tests).

### Adding an element

1. Add a row to `ELEMENTS` in `js/spellfx.js`: `color`, `accent`, `shape` (one of the shapes above or a new one), `impact` (a branch name in `impact()`), `trail` (sprite ids), `speed`, `arc`, `label`.
2. If it needs a new projectile body, add a branch to `_head(kind, E, crit)` — build it pointing along **+Y**; the caller rotates +Y onto the flight path.
3. If it needs a new burst, add a branch to `impact()` out of the building blocks: `_expandRing`, `_burst`, `_converge`, `_riser`, `_discFlash`, `_crossSlashes`, `_puff`, `_shardSpray`. Rings and discs at the hit point should use `axis: 'camera'` / `ground: false`; only floor decals lie flat at `y ≈ 0.02`.
4. Add any new sprite to `assets/data/fx/` and to the `fx` section of `assets/data/manifest.json`.
5. Add a row to the table above and to the gallery's element chips (they read `ELEMENTS`, so they update themselves).

### Gallery — `spellfx.html`

Two chibi bodies on a stage, element chips, cast/projectile/impact/heal/revive/zone buttons, a **Channelled & area** panel (breath for 2 s, an orbiting orb that zaps the other body, pillar, vortex, storm, a line of footprints — all with the selected element), a status checkbox per body, and **Play everything** which fires all 11 elements then all 23 auras in order. `window.spellfxDemo` exposes the same API for tests, plus `breath(id, sec)`, `breathPulse(id)`, `orb(id)` (toggle), `pillar(id)`, `vortex(id)`, `storm(id)`, `footsteps(id)`, `footfall(id, x, z)`, `stats()`, `lights()`, and `freeze()` / `unfreeze()` / `step(sec, n)` — the effects layer stops advancing while the scene keeps rendering, which is how the screenshot tools catch a burst at its peak.

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
`npm test -- avatar-3d` (Playwright, headless WebGL): Mii mode draws skin-coloured pixels, walk animation moves the leg pivots, all 15 presets build; Quaternius mode loads skinned meshes, plays `Walk_Loop`, bone scaling raises the root; screenshots saved in `test-results/avatar-3d-*.png`. `creatures.spec.js` builds every creature type. `vehicles.spec.js` builds every vehicle type, checks the measurements and the draft-animal counts, rolls them and reads pixels back off the canvas. `spellfx.spec.js` loads the gallery, throws and bursts every element (checking a projectile resolves under the flight cap), runs every status aura at once and checks the effects layer returns to zero children afterwards, and drives the page's buttons; screenshots in `test-results/spellfx-*.png`.

## Ideas / limits
- Accessories (glasses, eyepatch) are not built in 3D yet; `mask`/`scarf` etc. would be simple meshes.
- Mii mode has no mouth animation; a cheap approach is swapping the face texture between two mouth states while talking.
- Quaternius face could take the 2D face texture as a decal on the head mesh if the UV island were known.
