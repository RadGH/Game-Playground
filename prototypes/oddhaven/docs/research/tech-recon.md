# Oddhaven technical recon (2026-10-30)

Read-only survey of the playground code for the Oddhaven plan. No code was changed.

**How to read the numbers.** "Measured" means I ran it on this VM (Ryzen 9 5900X, Node, 2026-10-30; the throwaway
scripts are not in the repo). Nothing here was measured on a real iPhone. "Phone est." is the desktop figure multiplied
by 3-4, which is a guess until a device test replaces it. The first milestone should do that test.

## 0. Decisions in one table

| Question | Decision |
|---|---|
| World size | 3,072 m square (double Roverlands), 4 m height grid, two cities ~2.3 km apart |
| Who runs the town | One pure seeded sim. Solo: Web Worker. Online: Node room on the droplet. Same code, loopback like Roverlands |
| Who runs bodies | The player's own browser (Rapier), Roverlands style. Sim decides what happens; the browser decides how a driven car moves |
| Traffic | Sim owns "how far along my route am I". The car only gets real physics after a crash, and rejoins its route when it is done |
| People LOD | Full body 10, instanced stand-in 60, abstract ~100, schedule-only the rest. 300 residents |
| Vehicles on phone | Roverlands models are 11-30 meshes each. Traffic needs a merged, instanced version (section 1.5) |
| Interiors | Nothing reusable exists. New `interiors/` module driven by the building kit's `desc` |
| Voice | Thin `speak()` interface plus adapters. Saves store engine-neutral voice settings |
| Combat | New small three-button system. Import `combat-feel.js` and `creatures.js`. Do not import Thousandvale's cast pipeline |
| Vehicle tags | `avatar-3d/data/vehicle-catalog.json` with `era` + `domain` + `tags`, shown on the existing `vehicles.html` |

---

## 1. Roverlands

### 1.1 How a vehicle is defined

One entry in `prototypes/roverlands/data/vehicles.json` plus one file `js/client/models/<id>.js` (README "Adding a vehicle").

* Data keys: `id, name, type (car|bike|tank|hover|heli|plane|trailer), enclosed, mass, chassis, parts, wheels, susp, engine, steer, tyre, air, downforce, seats, eject, camera, tow`.
* A seat: `{ role, p, pose, exit, hands: 'wheel'|'bars', wheelAt, stand, gun }`. This already covers everything the party "get in the car" command needs.
* Frame: +z forward, +y up, +x is the LEFT side, driver at +x (`js/phys/vehicle.js:10`).
* Model contract (`js/client/models/index.js:1`): `build(THREE, def, { enhance }) -> { group, wheels, steer?, turret?, update(st) }`. Loaded by dynamic import, one file per id.
* `kit.js` merges static parts into one matte and one shiny vertex-coloured mesh; materials are shared across all vehicles (`kit.js:1-14`). `setDetail(group, near)` hides struts only (`kit.js:221`).
* The file has 28 entries: 23 vehicles and 5 carried props (crate, bag, barrel, ball, jetpack).

Measured, all 23:

| id | tris | meshes | seats | enclosed | | id | tris | meshes | seats | enclosed |
|---|---|---|---|---|---|---|---|---|---|---|
| sedan | 6,964 | 17 | 4 | yes | | semi_truck | 11,764 | 20 | 2 | yes |
| police_car | 6,890 | 19 | 4 | yes | | trailer_box | 8,856 | 19 | 0 | no |
| ambulance | 8,778 | 19 | 4 | yes | | trailer_flatbed | 9,072 | 16 | 0 | no |
| fire_truck | 11,362 | 21 | 3 | yes | | trailer_tanker | 10,118 | 16 | 0 | no |
| army_truck | 11,508 | 23 | 11 | no | | trailer_utility | 3,852 | 7 | 0 | no |
| trail_jeep | 6,572 | 25 | 3 | no | | harvester | 11,596 | 20 | 2 | yes |
| quad | 6,614 | 23 | 2 | no | | forklift | 4,784 | 17 | 1 | no |
| dune_buggy | 6,172 | 30 | 2 | no | | helicopter | 2,696 | 11 | 4 | no |
| dirtbike | 4,008 | 12 | 1 | no | | airplane | 3,662 | 18 | 2 | yes |
| motorcycle | 4,074 | 20 | 1 | no | | tank | 6,616 | 14 | 3 | yes |
| bicycle | 2,956 | 23 | 1 | no | | hover_tank | 2,284 | 14 | 2 | yes |
| rocket_car | 5,854 | 22 | 1 | yes | | | | | | |

Build time 8-49 ms each (no GPU upload). **Meshes is the number that hurts on a phone: a sedan is 17 draw calls.**

### 1.2 Physics: can a phone run it?

* Rapier 0.21 is at `vendor/rapier/rapier.mjs` (playground root, not under roverlands). It is one file with the wasm inside: 4.34 MB raw, 1.66 MB gzipped. Rapier is already in `shared/credits.json:21`; add `oddhaven` to its `games` list.
* `import RAPIER from '../../../vendor/rapier/rapier.mjs'; await RAPIER.init();`
* Measured load: import 31 ms + init 68 ms. Phone est. 300-500 ms once downloaded.
* Fixed 1/60 s (`js/phys/physics.js:34`). Wheels are shape casts (`vehicle.js:13`).

Measured tick cost, sedans driving on a flat 1,024 m heightfield with 400 box colliders:

| Sedans | ms per tick | % of a 60 Hz frame | Phone est. ms | Phone est. % |
|---|---|---|---|---|
| 1 | 0.14 | 1% | 0.5 | 3% |
| 4 | 0.24 | 1% | 1 | 6% |
| 10 | 0.32 | 2% | 1.2 | 7% |
| 16 | 0.44 | 3% | 1.7 | 10% |
| 30 | 0.76 | 5% | 3 | 18% |

**Answer: yes, a phone can run 10+ physics vehicles,** at roughly 7-10% of a frame. Only a real device test can confirm it. The harder limit is draw calls, not physics. Plan for 4-8 live physics cars in normal play, which leaves room for a bad phone.

Rapier stays on the main thread. Session, walker and camera all read it every frame, and a thread hop would add a frame of steering delay.

### 1.3 World and roads

* World contract: `docs/PLAN.md` "World contract". `world.size, cell, dim, heights, surface, heightAt, normalAt, surfaceAt, waterAt, objects, roads, sites`.
* `world.roads = [{ id, cls, from, to, halfW, pts:[[x,z,y]...] every 2 m }]` (`worldgen.js:28`). That is already the polyline traffic needs.
* `js/world/roads.js` is pure and general (route, Chaikin smooth, grade clamp, carve). It imports only `wmath.js` and `ROAD_CLASSES`.
* `js/world/worldgen.js` is not reusable as is. Its layout is hard-coded (`ANCHORS`, `PLACES`, home on the south edge). Write our own generator that fulfils the same contract.
* Measured: `generateWorld` 1,165 ms for 1,536 m at 2 m cell, 5,914 objects, 21 roads, 9.6 km of road.
* The renderer `js/client/world-view/index.js` takes `{ THREE, renderer, scene, camera, world, quality }`. Fallback `js/client/simple-view.js` (183 lines). I did not measure either on a phone.

### 1.4 Server

* `js/net/room-core.js` is the pure referee, `server/hub.js` the front desk, `js/net/loopback.js` runs the same room in the page for solo play (`loopback.js:8`). Oddhaven should copy this shape.
* Every moving body has one owner client (`room-core.js:14`). `own` / `give` at `room-core.js:231,240`. Others see it kinematic, 120 ms in the past (`session.js:27`).
* Limits: 12 players, 96 bodies, 20 Hz (`protocol.js:10-14`). Frames validated by a table with per-type rates (`protocol.js:119`).
* Server imports already shared: `tumblefair/server/feedback.mjs`, `insights.mjs`, `rgs.mjs`, `knockabout/server/accounts.js` (`server/main.mjs:26-29`).

### 1.5 What imports cleanly

| File | Verdict | Why |
|---|---|---|
| `js/phys/physics.js` | Import | Needs only RAPIER + the world contract |
| `js/phys/vehicle.js`, `walker.js`, `props.js`, `vmath.js` | Import | Pure physics |
| `js/client/models/*`, `kit.js` | Import | `build(THREE, def)`. Needs an importmap for `three` (kit.js pulls `BufferGeometryUtils`) |
| `js/client/riders.js` | Import, for near bodies only | Depends on `thousandvale/js/client/chibi-version.js`; asks for every Chibi 2 + ride + mount clip |
| `js/client/sounds.js` | Import | Engine voices + one-shots; siren `sirens` map included |
| `js/world/roads.js` | Import | Pure |
| `js/game/camera.js`, `js/game/input.js` | Read, likely adapt | Tied to Roverlands' driver assumptions |
| `js/game/session.js` (884 lines) | **Do not import** | Mixes flag rules, protocol and seats. Use as a reference and write `drive-session.js` |
| `js/net/room-core.js` | **Do not import** | Flag rules inside. Copy the shape |
| `js/world/worldgen.js` | **Do not import** | Fixed layout |

**Rule: import, do not copy, and keep any change to `js/phys/*` an opt-in option.** Roverlands is live on games.radgh.com and shares these files.

**"Extend the vehicle system":** keep the shared `vehicles.json` untouched and add `prototypes/oddhaven/data/vehicle-extra.json` keyed by id (price, trim colours, job, garage size, civilian yes/no, sim top speed).

**Traffic bake (the phone fix).** Build the real model once at load, flatten every mesh into one vertex-coloured geometry with the wheels in place, and draw it as an `InstancedMesh` per type with per-instance colour. Five traffic types = 5 draw calls for any number of cars. Wheels will not spin; fine past 30 m. Swap to the full model only for the car the player drives, the party's cars, and anything within ~20 m.

**The tank, hover tank, rocket car and helicopter** don't belong in the first modern town's traffic. Keep them in the catalog; let the helicopter and the tank come in with later jobs.

### 1.6 Satisfactory-style traffic: how it works with this code

The sim stores for each car `{ routeId, s (metres along), speed, delay }`. It never stores a position.

1. **On rails (normal):** the view places the instanced body at `route.at(s)`. No Rapier body.
2. **Promoted (player near):** within ~40 m, a kinematic Rapier body follows the rail so the player can hit it.
3. **Knocked:** a hit swaps it to dynamic with `createVehicle(..., { local: true })`. Sim `s` keeps advancing or pauses (a choice, see below).
4. **Recover:** after ~6 s, or when it stops, or when upside down or more than 12 m off the lane, it fades out and reappears on the lane at the current `s`, off-screen if possible. The sim needs no idea this happened.

Decision: pause `s` while knocked, so a crash costs that driver time, like real traffic. Lane offset comes from `halfW`. Cars keep a gap by reading the car ahead on the same route segment. Junctions: a per-junction turn token held in the sim.

### 1.7 Vehicles on an experiment page

Extend `avatar-3d/vehicles.html`, not a new page. It already has a panel fed from another game; copy that pattern.

* `avatar-3d/js/tv-vehicles-gallery.js:28-30` loads a game's model by `new URL()` + dynamic import. Its show object is `{ group, anim, anims, setAnim, update(dt,t), metrics(), dispose(), env }` (line 22).
* New file `avatar-3d/js/rover-vehicles-gallery.js` exports `ROVER_VEHICLES` and `buildRoverVehicle(id)`. It fetches `vehicles.json`, calls `buildModel(THREE, def, {})`, wraps the group in a root with `rotation.y = Math.PI / 2` (page faces +x, Roverlands faces +z, same as the ship at line 56) and `userData.character = true`, and spins wheels in `update()`.
* `vehicles-app.js:6,37,110-111` shows the three edits: import, branch in `rebuild`, chips panel.
* `vehicles.html` already has the importmap that kit.js needs.
* **Public copy check:** `tests/public-copies.test.js` and the exclusions in `tools/publish-pages.sh`. The page will import from `prototypes/roverlands/js/client/models/`; confirm those ship in the snapshot.

### 1.8 Tag scheme

New file `avatar-3d/data/vehicle-catalog.json`, one row per model in the playground. Pure data, read by the page, the game's garage and tests.

```json
{ "id": "rl_sedan", "name": "Meadowlark Sedan", "era": "modern", "domain": "land", "class": "car",
  "tags": ["civilian", "enclosed", "road"], "source": "roverlands", "module": "prototypes/roverlands/js/client/models/sedan.js",
  "seats": 4, "drivable": true, "tris": 6964, "meshes": 17 }
```

* `era`: one of `fantasy | medieval | modern | future`. The owner named three. `future` is a fourth I added, because Farhold's space ships fit none of them. Hover tank stays `modern` with tag `sci-fi`.
* `domain`: `land | water | air | space`.
* `class`: `car, truck, bike, trailer, cart, wagon, boat, ship, mount, tank, aircraft, work`.
* `tags`: free list: `civilian, emergency, military, work, farm, sci-fi, enclosed, open, road, offroad, draft-animal, magic`.
* A test fails if a model id in any source has no row, and `tris`/`meshes` are generated by a tool so they can't go stale.

| Source | Models | era |
|---|---|---|
| `roverlands/data/vehicles.json` | sedan, police_car, ambulance, fire_truck, semi + 4 trailers, forklift, harvester, army_truck, tank, jeep, quad, buggy, 3 bikes, helicopter, airplane, rocket_car | modern |
| same | hover_tank | modern + `sci-fi` |
| `avatar-3d/js/ground-vehicles.js` | motorcycle, car, truck | modern |
| `avatar-3d/js/vehicles.js` | hand_cart, pack_mule, wagon, ox_cart, coach | medieval |
| same | war_wagon | medieval, tag `military` |
| same | dragon_sled | fantasy |
| `avatar-3d/js/mount-types.js` | horse, pony, courser, warhorse, dray | medieval, class `mount` |
| same | stag, ram, drake, ash_strider | fantasy, class `mount` |
| `prototypes/farhold/js/boat.js` | raft, skiff, cutter | medieval, class `boat` |
| same | launch | modern, class `boat` (the only hull with an engine; check the art) |
| `thousandvale/js/client/ship-view.js` + `carts-view.js` | Saltwren ship, ox cart | medieval |
| `prototypes/farhold/js/shipyard.js` | lander and others | future |

Frontier Foundry's `data/vehicles.json` is game rules; I did not find separate 3D models for it. Skip it unless a model turns up.

---

## 2. Chibi 2.5

### 2.1 Cost per character

```js
import { createChibi2Character, prepareChibi2 } from '../../../avatar-3d/js/chibi2.js';
const body = await createChibi2Character(look, { v25: true, anims });   // chibi2.js:540
```

Measured with 20 random looks across 4 races:

| | 12 clips (`CHIBI2_ANIMS`) | 39 clips (+ ride, emotes, work) |
|---|---|---|
| Cold build, median | 40 ms | 55 ms |
| Cold build, mean | 56 ms | 77 ms |
| Cold build, worst | 183 ms | 205 ms |
| Phone est., mean | ~200 ms | ~270 ms |

* Triangles: mean 7,255, max 9,492 (random looks can pass the 8,500 class budget). 32 bones.
* Geometry buffers: mean 417 KB, max 735 KB per distinct look.
* Cached second body of the same look: 0.8 ms (`thousandvale/docs/CHANGELOG.md:1533`).
* Per frame, mixer + bones: 0.015 ms per character on this CPU (no rendering included). Phone est. 0.05 ms. Twelve bodies is ~0.6 ms.
* Two draw calls, doubled if the body casts a real shadow.

**The template key is the entire look JSON** (`chibi2.js:463`) and colour lives in the vertices (`CHIBI2.md:755-760`). So a different shirt colour is a whole new template, and changing into a uniform costs a full rebuild. Two consequences: change clothes only near the camera or while hidden indoors, and keep clip lists identical across all people (the clip count is in the key).

Use `prepareChibi2(look, { anims, v25: true, slice, budget })` (`chibi2.js:478`) or call `createTvBody` from `thousandvale/js/client/chibi-version.js`, which slices for you. Largest single step 36-56 ms (the mesh build, not sliceable), so build at most one body per few frames. Thousandvale does one per frame from a queue (`actors.js:4`).

### 2.2 LOD and instancing

* Chibi 2.5 has no LOD meshes (`CHIBI2.md:792`). Kestrel has LOD; Chibi 2.5 does not.
* There's no GPU body instancing (`CHIBI2.md:760`).
* Thousandvale's working answer (`thousandvale/js/client/actors.js`):
  * `chooseFull(list, { fullMax })` picks who gets a body (line 118).
  * `FULL_MAX` 30, or 12 on low (line 228). Re-ranked 4 times a second (line 593).
  * Beyond that, `farBody` + `farHead` `InstancedMesh`es, `FAR_CAP` 400, tinted per instance (lines 231-234). `farBodyGeometry` is exported at line 144.
  * Bodies past `ANIM_NEAR` 25 m animate at 10 Hz (line 724).
  * Bodies far for 30 s are freed (line 608).
  * `tv.crowd(100)` = ~180 draw calls on low (CHANGELOG line 196).
* Export-and-reuse is possible, though `actors.js` itself is too game-specific to import. Copy the `chooseFull` idea and the stand-in geometry.

**Realistic crowd on a phone (target, not measured):**

| Band | Count | Draws | Tris | Update |
|---|---|---|---|---|
| Full body, < 25 m | 10 (6 on low) | 20 | ~75k | 60 Hz |
| Full body, > 25 m | included above | | | 10 Hz |
| Instanced stand-in, 25-120 m | 60 (30 on low) | 2 | ~10k | Position at sim rate; a small leg wiggle in the vertex shader |
| Beyond 120 m | 0 | 0 | 0 | Nothing drawn |

**So ~70 visible people at once.** A frame target of 180 draw calls and 350k triangles leaves room for world, cars and furniture. Use contact shadows, not sun shadows, on people (`gfx-tiers.js` Low does this).

Stand-ins are a different shape from the real body, so the swap will pop. Fade it. If that is not good enough, the next option is one shared low-poly body with per-instance shirt, trousers, skin and hair colours in place of class tint.

### 2.3 Looks and the character creator

* Races: `avatar-3d/js/chibi2-races.js:22`. Nine: human, elf, dwarf, orc, giant, goblin, halfling, undead, beast. A race is a parameter set on one body, `avatar.body.race`. `randomChibi2(...)` at line 265.
* `avatar.body.v = 2.5` or `{ v25: true }`. Body options: `chibi25-body-options.js` (shape, posture, tail, sliders).
* Editor data: `thousandvale/js/client/ui/appearance-core.js` is pure: `FACE_SLOTS:30`, `BODY_DIALS:48`, `BODY_PICKS:63`, `PALETTES:73`, `applyCustom:111`, `customFrom:125`.
* Tumblefair's editor uses it (`tumblefair/js/client/editor.js:7`, 99 lines) but its DOM is game-specific. Knockabout's is the better model: `knockabout/js/client/look.js` has a full `WEAR_SLOTS` costume editor and a small wire format `{ race, seed, custom, wear, preset }`, `avatarOf(look)` at line 70.
* `tumblefair/js/client/look-tidy.js`: `tidyFace(av, seed)` line 37 stops ugly random looks, `PRESETS` line 57 are quick looks.
* **Premade gallery cards:** `svgPortrait(avatar)` from `thousandvale/js/client/ui/svg-portrait.js` makes a head shot with no GPU. Use it for every list in the game (family, contacts, gallery).
* Note `FACE_SLOTS` ear lists leave out beast ears (`appearance-core.js:27`). All nine races will need a check in the editor.

### 2.4 Modern clothing: exact steps

Already in the catalogue and modern enough: tops `tshirt hoodie tank coat trench vest open_coat apron dress`, bottoms `pants shorts skirt leggings baggy`, shoes `sneakers boots shoes sandals`, hats `cap bandana`, accessories `glasses sunglasses goggles earrings`.

**Top, bottom or shoes using existing shapes (almost everything):**

1. Add a row to `TOP25`, `BOTTOM25` or `SHOE25` in `avatar-3d/js/chibi25-outfits.js`, e.g. `polo: { sleeve: 'short', collar: 'round', front: 'buttons', hem: 'none', name: 'Polo shirt', alias2d: 'tshirt' }`. The vocabulary is at `chibi2-body.js:49-56`.
2. Nothing else. `chibi2-body.js:92` spreads the table in. `chibi2-parts.js:249-261` auto-registers it as `bespoke` with the 2D art from `alias2d`. `chibi25-body-options.js` lists it.
3. Run `node --test avatar-3d/tests/chibi25.test.js`.

**The trap:** `normalizeAvatar` resets any unregistered id to the slot default with no error. A part drawn in 3D but missing from `CHIBI2_2D` works on the page and silently turns into a tunic in the game. And it **must** be `bespoke`, or every game's seeded random NPCs change. The auto-loop handles both only for ids in `OUTFIT25`; a hat does not go through it.

**Hats:** four places.

1. `case 'hard_hat':` in `buildExtraHat`, `chibi2-hats.js:50`.
2. `hard_hat: alias(hat, 'cap', 'Hard hat')` in `CHIBI2_2D.hat`, `chibi2-parts.js`. Add `bespoke: true`; `alias()` doesn't set it.
3. `HATS_COVER_CROWN` at `chibi2-hats.js:25`, plus `HAT_BRIM` at `chibi2.js:24` if hair shows under the brim.
4. `HAT_FIT` at `chibi25-hair.js:41`, or hair pokes through.

Alternative: rows in `chibi2-gear5-ids.js` with `g5_` prefix for table-driven tops, hats and held items. That route needs a builder in `chibi2-gear5-*.js` and `tools/build-gear-catalog.mjs`, and the catalog test (`CHIBI2.md:1064`).

**Badges:** `top.emblem` + `top.emblemColor` already exist (`chibi2-armour2.js:7`). A police badge is a new emblem icon.

**Tools in the hand:** do not make them gear. Parent a mesh to the `handR` bone like angling does (`PROF_TOOL_MOUNT`, `chibi2-motion-prof.js:39`). No template rebuild, works for hose, baton, chainsaw, phone.

**First clothing batch:** `button_shirt polo blazer blouse overalls hi_vis_vest scrubs police_uniform turnout_coat chef_coat` · `jeans cargo_pants joggers pencil_skirt turnout_trousers` · `dress_shoes heels work_boots rubber_boots` · `hard_hat fire_helmet police_cap chef_hat beanie` · `tool_belt badge`. Hi-vis stripes need one new `front` value and a few lines in `chibi2-body.js`, behind that value so nothing else changes.

### 2.5 Clips

* Have: `idle ready walk run attack cast hit guard wave talk jump dead` (`chibi2-motion.js:4`); `boat sit` (37); `pickSwing chopSwing forage` (53); 18 emotes incl. `sitGround drink sleep dance laugh` (77); 7 `prof*` loops incl. `profChop profHammer profStir` (`chibi2-motion-prof.js:27`); fishing (`chibi2-motion-dual.js:35`).
* Missing for a life sim: sit on a chair at a table, eat, lie in bed, type, shower, phone call, push, carry a box, hug, kiss, drag a hose. Add them as a new opt-in file with `registerClips`, as `chibi2-motion-prof.js` does.
* All clips cost every template, so 39 clips is a sensible cap. A bigger list goes straight into build time.

---

## 3. Lingo, conversations and voice

### 3.1 Minimal integration

```js
import { Lingo, Speaker, Entity } from '../../../lingo/js/lingo.js';
import { Conversations, factsFrom } from '../../../conversations/js/conversations.js';
import { RelationGraph } from '../../../lingo/js/relations.js';
import { MemoryBank } from '../../../lingo/js/memory.js';
```

Measured: load + parse 5 ms; `lingo.speak()` 0.076 ms a line. Data 180 KB grammar + 24 KB lexicon + 88 KB topics. Cheap enough to run anywhere.

The clean example to copy is `prototypes/lanternfall/js/talk/lingo-bridge.js`. It loads the core files, merges a pack and a grammar file (lines 100-106), gives game code one `talk.say(id, intent, ctx)` and has a stub if data fails to load.

**Tone:** the grammar is dark fantasy, 80 intents, ~1,080 entries, with `crude / gore / cruel` tags. Zero those for Oddhaven via `speech.tagWeights`, then fill with modern lines.

### 3.2 Adding hundreds of lines

One file per subject under `prototypes/oddhaven/data/lingo/`, all in the formats below. Merge at boot:

```js
for (const [name, list] of Object.entries(extra.symbols)) for (const entry of list) lingo.grammar.add(name, entry);
for (const e of pack.entries) lingo.lexicon.add(e);
lingo.invalidatePronunciations();
```

```json
{ "symbols": {
  "smalltalk": [
    { "t": "Traffic on {place.the} was murder this morning.", "tags": ["commute"], "w": 2 },
    { "t": "{listener.name}, have you tried the new place by {place.the}?", "cond": "opinion > 0.1" } ],
  "job_firefighter_callout": [ { "t": "Engine's rolling. Stay clear, {listener.name}!" } ] } }
```

* Entry fields: `t, w, tags, cond, bind` (README "data/grammar.json"). `cond` sees `mood, opinion, has('trait'), listenerHas('trait'), sameRace, chance(p)` + any binding.
* Symbols starting `_` are private helpers.
* Pack: `{ "version", "entries": [{ id, type, forms: { sg, pl }, tags, pron: { respell } }] }`. Modern words (jobs, shops, vehicles, town names) go here, and magic-modern items too.
* Conversation topic (multi-line scene): `{ id, tags, requires: [{ memory, maxAgeHours, who }], lines: [{ role: 'asker'|'answerer'|'third', variants: [{ t, cond }] }] }`. Called through `conv.talk(speakers, facts, { scene, tags })`, `conversations.js:44`.
* `prototypes/emberveil/tests/bindings.test.js` renders every pool and fails on a stray `{`. Copy it, or a bad line ships silently.

### 3.3 Relations and memory

* `lingo/data/relations.json`: six dimensions `warmth, respect, trust, appreciation, fear, attraction` + familiarity; 30 events (`kindness, gift, compliment, insult, argument, betrayal, flirt_accepted, shared_meal…`). `rel.opinion()` gives one number, `rel.tags()` feeds phrase choice. Already suits Tamagotchi-style social actions. Add life events to a game copy of this file.
* `MemoryBank` (`memory.js:33`): importance, half-life, recall. `lingo/data/events.json` has 20 event types; add `moved_in, promoted, fired, house_fire, new_baby` etc.
* **Two traps for a seeded sim:** `relations.js:36` calls `Math.random()` directly, and `memory.js:103` defaults to it. Also a `Relationship` stores history arrays, and an object per pair is heavy across 300 people.

**Plan:** the sim stores relationships as small numbers (6 dims, Int8) for everyone, and keeps its own seeded changes. `Relationship` objects are built only for on-screen talk. Lingo runs inside the sim only for conversations someone can see, and the text goes over the wire as text. Background people swap numbers and never produce words. This keeps co-op players reading the same line. If the `RelationGraph` logic is used inside the sim itself, add an optional `rng` to `apply()` (safe, additive) and pass the seeded one.

### 3.4 Voice interface

Everything in the game goes through one module. Nothing outside it imports `voice-lab`.

```js
// js/voice/voice.js
const voice = await createVoice({ engine: 'formant', bus, onLevel });
voice.speak({ id, speakerId, text, speech, profile, priority, pan, gain }) -> { done: Promise, cancel() }
voice.level(speakerId)      // 0..1 for mouth movement
voice.speaking(speakerId)
voice.setEngine('babble' | 'formant' | 'webspeech' | 'off' | ...)
voice.stopAll()
```

**The profile is engine-neutral and is what gets saved:**

```js
{ gender: 'f', age: 0.3, pitch: 0.6, warmth: 0.5, rough: 0.1, speed: 0.5, seed: 1234 }
```

Each adapter is `{ id, load(), render(text, speech, profile) -> { samples, sampleRate } | null, speakDirect? }`, with its own mapping from profile to engine settings. Swapping the voice later means one new adapter file and no save change.

* Formant adapter wraps `synthesize()` + `play()` from `voice-lab/js/voice.js:36,56` and `voiceFor()` from `shared/voices.js:20`. `play()` connects straight to `destination`, so route it through a game bus.
* `speech` (with `[[phonemes]]`) is only meaningful for formant/espeak; other adapters take `text`.
* Measured formant: ~11 ms for a ~4 s line, without the dictionary loaded. The engine's docs agree it's far faster than real time. First render pays the dictionary.
* `cmudict.txt` is 3.3 MB, 868 KB gzipped. Lazy-load after the first tap.
* `voice-lab` engines already exist: `formant, espeak, babble, piper, webspeech` (`engines/index.js:8`). **Babble is worth a look as the default for strangers**, since gibberish is a charming fit and hides the robot sound. Piper is the obvious first "less robotic" adapter.
* Copy the rules from `lanternfall/js/audio/voice-bridge.js`: at most 2 voices at once, priority drops the lowest, synthesis never in the frame (idle queue), a line that isn't ready and would cost more than 30 ms is text only.

---

## 4. Thousandvale, proctown, interiors

### 4.1 "Two cities radius + distance" in metres

From `thousandvale/data/world/town-pins.json` (46 Torbor Downs settlements; `tools/lib/zone-sites.mjs:15`):

| Measure | Metres |
|---|---|
| Town hub radius: capital/city / town / village / hamlet | 140 / 90 / 65 / 40 (some small towns 46) |
| Zone | 2,048 × 2,048 |
| City to nearest city, min / median / max | 2,287 / 2,764 / 3,014 |
| Town-or-larger to nearest, median | 1,513 |
| Any settlement to nearest, median | 675 |

So radius + gap + radius = 140 + 2,287 + 140 ≈ **2.6 km** end to end, and about **3 km** with room round the edges.

**Decision: a 3,072 m square** (exactly two Roverlands), two cities ~2.3 km apart, a village or two between. On a straight road that's ~105 s by car at 22 m/s and ~7 min on foot at 5.4 m/s. If the owner meant "radius plus distance" as one city radius plus a gap, ~2.4 km is the same answer within rounding.

**Height grid:** at 2 m, 3,072 m is 2.36 M samples, 9.4 MB, and generation scales to ~4.7 s desktop (phone est. 15+ s). At **4 m** it's the same 769×769 as Roverlands (2.4 MB, same Rapier cost). The physics contract takes `world.size` and `world.dim` separately (`physics.js:57`), so this should work without changes. Use a pre-made world file for the first map (like Thousandvale's `macro.bin`) and take road surface from distance-to-road rather than the 4 m grid. Flat town pads hide the coarseness.

**Later growth:** Thousandvale's zone pattern fits (chunks of 2,048 m). Keep all sim positions as `{ zone?, x, z }`-friendly from the start, and have route and building ids not depend on the world's absolute coordinates.

### 4.2 proctown reuse

```js
import { planTown, overlaps, assignTrades } from '../../../proctown/js/townplan.js';
import { describeBuilding, partsFor } from '../../../proctown/js/buildkit.js';
```

`planTown` is deterministic and fast. Measured with `culture: 'human'`:

| size | wall radius m | plots | streets | ms |
|---|---|---|---|---|
| 3 | 55 | 23 | 92 | 15 |
| 5 | 95 | 37 | 105 | 15 |
| 7 | 121 | 90 | 179 | 42 |
| 8 | 134 | 86 | 155 | 37 |

Used by Farhold and Thousandvale (`bake-zone.mjs:30`). A plot knows its frontage; `overlaps()` guarantees nothing sits on a street. Connect: `linkRoads`, `connectStreets`.

**Work needed for a modern town:**

1. **Streets are too narrow.** `STREET_CLASSES` are 5.0 / 3.2 / 2.2 m (`townplan.js:65`), and that table is a module constant, not per culture. A sedan is 1.84 m wide. Need an opt-in `streets` option (two lanes ≈ 7-8 m, plus pavement), so existing towns stay byte-identical.
2. **Add a `modern` culture** in `CULTURES` (`townplan.js:81`): low `jitter` (a dwarf's 0.04 is already a grid), blocks 40-60 m, plots 12-20 m. Parameters, not code.
3. **Add materials and bases** to `proctown/data/buildkit.json` + `cultures.json`: siding, brick, glass, flat commercial roofs. Today there are 29 bases and 12 roofs, all medieval-or-fantasy (`hovel, long, hall, tomb_row…`). Roof types `gable hip flat` carry over fine.
4. `size` runs well past 8 on the formula (`footprintOf`: ring = 16 + 13 × size). A 140 m city is about size 9-10. Untested at that size.

For render, `partsFor(desc)` gives unit shapes; use the same instancing as `propkit-three.js` `instanceParts`. `propkit.js` is the prop kit for street furniture.

### 4.3 Interiors

**There are no building interiors anywhere in the playground.**

* Buildings are solid part lists. The door is a box stuck on the front (`buildkit.js:691`).
* `prototypes/farhold/js/housing.js:26` says outright: "No interiors, no furniture requirements".
* Thousandvale: dungeons are the only indoors (`room.kind === 'instance'`).
* Farhold: `dungeon-plan.js:50` `layout({ seed, rooms, roomSize, cellSize, corridor })` is pure rooms + corridors, and `insideLayout` tests a point. `dungeon.js:69` is the builder. The plan idea is useful; the look and the separate-instance model aren't.

**Decision: new `js/interiors/`, in the same world space as the building.** No loading screen, no teleport. That's also the only way Sims-style cutaway works in god mode.

* `planInterior(desc, kind) -> { rooms: [{ id, kind, rect, floor }], doors, stairs, slots: [{ id, kind, x, z, yaw, room }] }`. Pure, seeded, node-tested. Starts from `desc.masses` + `desc.door`, so an interior always matches the outside.
* Exterior: the door becomes a real hole (door leaf is a separate moving part).
* Build walls, floors and furniture on demand for the building in view plus a few nearest. Instanced from a small unit kit, using `propkit` shapes.
* Colliders: box walls in Rapier (`shapeDesc`, `physics.js:67`), added on demand, removed when you leave. Keep them few.
* God mode: hide the roof and fade walls facing the camera, per building, by group visibility.
* The world doesn't simulate furniture. The sim knows slots (bed 1, stove, desk), so background households still use "their bed" without any geometry.

---

## 5. Co-op model

| | Roverlands: owner simulates, server relays | Tumblefair/Thousandvale: server authoritative | **Hybrid** |
|---|---|---|---|
| Town runs with host offline | No | Yes | Yes |
| Driving feels good | Yes | Poor at ~100 ms | Yes |
| Droplet CPU (1 vCPU / 2 GB, shared) | Tiny | Physics would be too much | Small |
| Solo play with no server | Loopback | Worker (`thousandvale/js/sim/worker.js`) | Worker |
| Node tests | Rules only | Whole game | Whole game |

**Recommendation: hybrid.** Roverlands' own PLAN explains why physics stays on the client: a one-CPU droplet and 100 ms steering.

* **Sim (authoritative):** time, needs, jobs, money, ownership, parties, permissions, traffic routes, fires, events. Pure and seeded. In a Worker solo, in a server room online.
* **Body (owner client):** the controlled person's walker and the driven vehicle run on Rapier in that player's browser and send `pos` at 20 Hz, as Roverlands does. The sim accepts them with sanity limits (speed, distance), and it's co-op among friends, so light checking is enough.
* **Permission model maps straight onto `room-core`'s ownership:** `{ party: { leader, members, grants: { charId: playerId } } }`. Each `grant` hands that body's ownership to a player (`give`, `room-core.js:240`). A leader's `takeBack` always wins, and "split into a new party" moves members into a new party record.
* **A town that keeps running:** a room with no players does **not** burn CPU. After `EMPTY_ROOM_MS` (5 min) it saves and sleeps, stamping the time. On next load it fast-forwards using the schedule-only level. To the player it never stopped. Cap the catch-up (a week of game time, say) and summarise it ("while you were away…"). Solo saves do the same.
* Rooms, tokens, reconnect, four-letter codes, public list, vote-kick: copy from Roverlands' hub. Interpolation of NPCs: `tumblefair/js/client/interp.js:46`, at the sim's 4 Hz with a ~300 ms delay.
* Ports, none in use per `tools/README-servers.md`: stable 8560, dev 8561, https 8562, 8563.
* Saves: Worlds on disk as JSON per room code online. Solo in IndexedDB. `rgs-cloudsave.js` is built around localStorage keys, so check the save size against that before relying on it; plan for a save under 1 MB compressed.

---

## 6. Sim architecture

```
pure sim (js/sim/, no DOM, no three, no Rapier, no Math.random, no Date.now)
   tick(dt, commands) -> events, snapshot
      ^ Worker (solo): sim-worker.js    ^ Server (online): room per world
      | commands / snapshots (same protocol, loopback)
page: view (three.js), bodies (Rapier), Lingo text display, voice, sfx, UI
```

* Worker: `new Worker(new URL('./sim-worker.js', import.meta.url), { type: 'module' })`. Pattern in `lodestar/js/worker/sim-worker.js` and `thousandvale/js/sim/worker.js`.
* **Trap:** a module Worker has no importmap, so `import 'three'` throws there. The sim must import nothing bare. A purity test (as Bannerline's) enforces it.
* Seeded rng, `now()` passed in, state in plain data so saving is `JSON.stringify` (or typed arrays for the big ones).

**Three levels of people (L0/L1/L2):**

| | L0 On-screen | L1 Nearby abstract | L2 Background |
|---|---|---|---|
| Who | Within ~120 m of any player or camera focus, or in the player's party | Same district, ~120-400 m | Everyone else |
| Count | ≤ 70 | ~100 | ~130+ |
| Position | Path point at 4 Hz, body interpolated | Coarse point along a route, 1 Hz | None: "at work", "in transit, arrives 17:42" |
| Needs + choice | Every tick for actions, re-pick every ~2 game minutes | Same at 1 Hz, in quarter slices | Evaluated only at wake-up times |
| Work | Real actions, or minigame if controlled | Timer with outcome | Payday maths |
| Talk | Lingo text and voice if heard | Numbers only | Numbers only |
| Collision | Soft separation | None | None |

Promotion from L2 to L1 must always produce a sensible place: "in transit" resolves to a point on the route at the right time. That's the trick that makes the world feel continuous.

Thousandvale patterns worth reusing:

* Slices: `travellers.js:29` `SLICES = 4`, a quarter of the groups a tick.
* Materialise only near players: `MATERIAL_R` 260, `PARK_MS` 30 s, `travellers.js:26-27`.
* Schedules: `sim/schedules.js:17` `blockAt(blocks, t, phases)` gives the block for a time of day, and `townFolk` (line 51) assigns offices to plots. It's a good base for jobs. Note `OFFICES` is medieval roles; copy the shape, not the data.
* Paths: `rules/pathfind.js:164` `findPath`; a budgeted grid search for on-foot L0.

**Choosing an action (Sims/RimWorld):** needs 0..1, each object or job advertises what it refills, score = sum of `need urgency × refill` − travel cost + personality + a little noise, pick from the top few. A family in "follow me" mode or a work shift overrides it.

**Budget targets:**

| Item | Target |
|---|---|
| Small world population | 300 residents, ~100 households, ~60 enterable buildings, ~40 cars in motion |
| Sim tick | 4 Hz |
| Sim work per tick, phone | ≤ 5 ms (2% of one core) |
| Snapshot to page | 4 Hz, only L0 + L1, delta encoded, ≤ 8 KB a tick |
| Main-thread frame, phone | ≤ 25 ms (30 fps floor): view 15, Rapier 2, Chibi mixers 1, UI 2, spare 5 |
| GPU, phone | ≤ 180 draws, ≤ 350k triangles, DPR ≤ 1.5, no bloom on Medium |
| Save | < 1 MB compressed |
| Game time | 1 day = 24 real minutes at speed 1; 2×, 3× and pause in solo god mode. Decision for the design round |

Measured floor, not the game: a mock utility pick over 8 needs × 40 actions cost 0.035 ms a tick for 300 people, 0.10 ms for 1,000; a full Dijkstra over a 300-node road graph 0.11 ms. Real logic will cost several times that, and the budget above has room. Cache routes by (from, to) since households repeat them.

**Jobs:** one data row for each job, with two ways of running it. That is how "simulate in god mode, perform when controlled" stays one system:

```js
{ id: 'logger', shift: [8, 17], site: 'lumber_yard', pay: 18, skill: 'forestry',
  abstract: { outputPerHour: 2, risk: 0.002 },            // the sim's result if nobody plays
  physical: { game: 'rhythm', clip: 'profChop', vehicle: 'semi_truck' } }   // what you do when you take control
```

A controlled character's minigame score multiplies pay and output. Thousandvale's `rules/professions-games.js` is exactly the pure core for this: 8 games (`strike rhythm pick trace forge stitch pour gauge`, line 29), `makeGame(type, { seed, ease, base })`, `scoreGame(game, inputs)`, `botInputs` for tests, `qualityOf`. Logging is `rhythm`, mining `strike`. Physical Wobbly-style jobs (carry, stack, deliver) are new, on Rapier props (`js/phys/props.js`).

**Levers, buttons, plates, events:** Lanternfall has things + wires as room data (`lanternfall/js/entities/things.js`, `world/roomload.js`), but in a 2D cell world. Knockabout's `js/sim/hazards.js` calm → warning → active cycle is the cleanest pattern for timed machines. Build a small new `mechanisms.js` in the sim: `{ id, kind, state, wires: [{ to, action }] }` and a `fire(event)` queue, so a plate can start a sawmill or an alarm.

---

## 7. Reusable pieces

| Need | Import | Notes |
|---|---|---|
| Sound effects | `import { Sfx } from '../../../sfx/js/sfx.js'`; `await Sfx.create({ method: 'hybrid' })` | `sfx/data/catalog.json`, 179 ids. Have `lever.pull door.grind water.pour fire.crackle wood.chop ambience.town coin`. No siren, horn, phone or hose yet. Add via `sfx/tools/freesound.py`. Only `ambience.*` may loop |
| Engine sound | `roverlands/js/client/sounds.js` | Live oscillator voices |
| What's new | `import { createWhatsNew } from '../../../shared/whats-new.js'` + css | `shared/whats-new.js:35`, `data/changelog.json` |
| Credits | `import { createCredits } from '../../../shared/credits.js'` + css | `shared/credits.js:59`. Add `oddhaven` to three.js, Rapier and font rows in `shared/credits.json` |
| Account | `import account from '../../../shared/rgs-account.js'`; `{ accountButton, openSignIn } from rgs-signin.js` | Optional sign-in. Read `shared/RGS-ACCOUNT.md` |
| Server accounts | `knockabout/server/accounts.js:19` + `tumblefair/server/rgs.mjs:32,83` | Ticket redeem + admin feed |
| Reports, ratings | `tumblefair/server/feedback.mjs:10`, `insights.mjs:23`; client `roverlands/js/client/ui/report.js`, `rating.js` | Screenshot + debug state |
| Menus on a controller | `import { createPadNav } from '../../tumblefair/js/client/padnav.js'` | `padnav.js:9`, `createPadNav({ busy, back })`. Lodestar has its own |
| Gamepad in play | `roverlands/js/game/input.js`, or `thousandvale/js/client/input/gamepad.js` | Secure page needed; 8562 |
| Touch | `roverlands/js/client/ui/touch.js`, with `TOUCH_MODES` (foot, drive, gunner, passenger); Thousandvale `input/touch.js` (469 lines) for more | Add modes `god`, `job` |
| Tap-to-walk | `thousandvale/js/client/click-path.js` (81 lines) | Good phone input for walking in a house |
| Labels | `tumblefair/js/client/declutter.js:10` | Name tags never overlap |
| Cameras | `highdef-3d/js/cameras.js` | One camera, `overhead` and `follow` with a damper. Fits god view ↔ third person directly. Read `~/claude/docs/game-standards.md`: W = screen north |
| Day/night | `thousandvale/js/client/daynight.js`, Farhold `sky-palette.js` | Not read in depth |
| Tooltips, numbers | `shared/tooltip.js`, `shared/format.js` | |
| Monsters | `avatar-3d/js/creatures.js` (37 types) + `mesh-merge.js` | Merge first: a raw creature is ~30 draw calls (`mesh-merge.js:9`) |
| Spell effects (magic) | `avatar-3d/js/spellfx-batched.js` | Instanced sprites |

**Combat.** Worth borrowing:

* `farhold/js/combat-feel.js`: pure, no imports, 315 lines. Hit-stop, shake, knockback, stagger. `feel.advance(dt)`, `feel.hit(...)`. **Import it.** Note it exports one shared instance (`feel`, line 239), and the sim must not depend on it. Knockback and stagger as rules belong in our sim; use feel as presentation.
* `thousandvale/js/rules/monster-ai.js` (952 lines): the brain, forked from Farhold, threat table, leash. Too tied to the rules set (imports `farhold.js`, `perk-rules.js`, `warband.js`). Read it, don't import it.
* `thousandvale/js/rules/threat.js` `pickTarget`: small; candidates for copying.
* `thousandvale/js/rules/cast.js`: tied to 32 classes and 180 skills. Skip.

**Decision: a small new combat in the sim.** Phone-friendly: stick plus Attack, Dodge, Ability buttons, auto-aim at the nearest target, 8-10 monster types from `creatures.js` with a telegraphed attack, one weapon kit per job (modern + magic). The monster hunter job is one activity; it should not bring an RPG with it.

---

## 8. Risks to raise at the plan stage

1. **The whole list is big,** and most of the expensive parts are new: interiors, modern buildings, life-sim clips, job minigames. Sharing helps with bodies, cars and speech, not those.
2. **Phone draw calls.** Every unmerged model is a trap: vehicles 11-30 meshes, creatures ~30. Budget test in the first milestone, on the real phone.
3. **First-use build stall.** ~270 ms per new look on a phone means fast driving through a town can outrun the body queue. Keep stand-ins until bodies are ready and cap one build per few frames.
4. **Shared code.** Oddhaven touches `chibi25-outfits.js`, `chibi2-hats.js`, `chibi2-parts.js`, `townplan.js`, `buildkit.json`. All must be additive so `chibi25.test.js` stays green, and Roverlands' `js/phys/*` must not change behaviour, since it's live.
5. **`world-view` on a phone** is unproven for a 3 km world. `simple-view.js` is the fallback, and town rendering is new either way.
6. **No body swap for colours.** Vertex colours mean many unique people use many templates. See 2.1.
