# Chibi 4 — trying a more realistic character system, one idea at a time

Owner: Radley Sustaire. Started 2026-10-15. Status: **prototype** — a modular kit (2 bodies, 13 garments, 6 hairs, 67
clips, any colours) assembled at runtime with Chibi 2's call shape, and an opt-in switch in Thousandvale. Not a
replacement for Chibi 2 yet (see the verdict).

**Pages** (dev server 8401, stable 8400):
- `avatar-3d/chibi4/index.html` — the review page: one card per step, same shots, same scorecard (`data/steps.json`)
- `avatar-3d/chibi4/compare.html` — Chibi 2 vs Chibi 4 baked (step 7) vs the Chibi 4 kit (step 9) side by side, every
  Chibi 2 clip name, measured cost, a **dress-up panel** (body, race, skin, hair, garments, colours) and a 20/50/100 crowd test
- `avatar-3d/chibi4/kit.html` — one kit character, timed from page start (`?look=mage|elf`, `?lineup=10`, `?side=1`)
- `avatar-3d/chibi4/baseline.html` — step 0: Chibi 2 dressed as the test characters
- Thousandvale: add `?renderer=chibi4` to the game URL — the PLAYER starts as Chibi 2 at once and becomes a Chibi 4 kit
  body as soon as it has downloaded (everyone else stays Chibi 2)

## Why

Chibi 2 (every game's characters today) looks like dolls: ~2.5 heads tall, ball noses, feet that run through robes,
hair and hats that cut into faces. Chibi 3 (2026-10-01) tried blended-shape bodies and failed on faces. A friend's game
has detailed painted characters (Codex reference picture → model). The owner asked to try every idea, one by one, on
the same two test characters — the robed mage and the elf warrior of `ref/` — and compare.

## The steps

| Step | What | Score (short) | Kept? |
|---|---|---|---|
| 0 | Chibi 2 today | doll face, 2.5 heads, feet through robes | baseline |
| 1 | Blender MCP in the owner's Blender, built by eye from the Codex sheet: outline-lofted body, pictures projected on | face 4/5; doubled face/arms from projection | no — one baked statue |
| 2 | Same as a headless script on the VM; paint only where each picture SEES (ray test), baked to one texture | doubles gone; still a statue (32k faces, nothing swaps) | the **paint method** is reused in step 5 |
| 3 | MakeHuman bodies (MPFB 2, CC0 output) from sliders: real face topology, eyes, 53-bone game rig | the first real SYSTEM; photo-realistic, modern clothes | **yes — the base** |
| 4 | Codex repaints MakeHuman's skin (head) and hair keeping the UV layout; sliders to 6.6–6.8 heads | mage reads like the reference | yes |
| 5 | Our own robe and armour, measured off the body; body under the clothes deleted; projected paint; hat fitted to the head | no skin through cloth, nothing touches the face | yes |
| 6 | Skirt bones driven by both thighs + robe-aware stride; every frame checked for feet through the robe | 0 pokes walk + run (was 25/33 and 23/23 frames) | yes |
| 7 | GLB per character (1 mesh/distance, 1 atlas, LOD 0/1/2, 8 clips), three.js loader with Chibi 2's API, compare page, Thousandvale opt-in | 1 draw call per character | yes |
| 8 | Tripo3D image-to-3D (the friend's tool) | needs the owner's Tripo account | not started |
| 9 | The modular kit: one skeleton per body, every garment / hair / hat its own GLB with a hide mask; assembled, merged to one draw call and recoloured at runtime; 67 clips covering all 96 Chibi 2 names; meshopt-compressed | modular 4/5, 0 feet through the robe on every robe clip, player ready in 1.8 s on 10 Mbps | **yes — the runtime** |

Full scorecards, shots and honest notes per step: the review page.

## How each piece works

### Base bodies (step 3–4) — `tools/blender/c4mh.py`
MPFB 2 (Blender extension; its code is GPL, every character it outputs and the asset packs used here are **CC0**)
builds a human from a dict: phenotype sliders, extra targets, skin, hair, brows, lashes, eyes, the `game_engine` rig.
`STEP3` / `STEP4` hold the two characters. `heads_tall()` measures crown-to-sole ÷ crown-to-chin from the face profile.
Step 4's push: head +1.0 / +0.85 / +0.8 (height/width/depth), eyes +0.6–0.7, broader V torso for the mage, bigger
pointed ears for the elf → **6.8 / 6.6 heads** (step 3: 7.9).

### Painted textures (step 4) — `tools/textures.py`
- Codex's image tool **refuses whole-body skin atlases** (an unrolled body reads as nudity). So `prep` crops only the
  head island and turns it upright; Codex repaints it in edit mode with the reference as style; `merge` pastes it back
  (only the head island, flood-filled from the face on a clean-background layout atlas), grades the whole body to the
  painted head's skin colour, smooths body pores/hair without AI, removes the logo strip.
- Codex kept the layout to the pixel in edit mode, so the result is simply resized back (`--fit` registers by the
  island's bounding box instead; it was fooled by repainted edge patches, so it is off).
- Hair: Codex RGB + the original's alpha (`hair`), or `gradient-hair` — a no-AI auburn colour ramp, used for the elf
  braid because Codex ran out of credit mid-step.
- The painted pictures are committed in `textures/` (Codex's output differs every run).

### Clothes (step 5) — `tools/blender/c4clothes.py`, `step5_clothes.py`
Every garment is measured off the body it is for (rebuild after a slider change and it still fits):
`shell` (the body's own faces pushed out: trousers, undershirt, jerkin, bracers), `hull_loft` + `smooth_rings`
(stacked body outlines, widened: robe, mantle, collar, belt), `axis_loft` (a loft along any axis: boot feet heel→toe so
toes merge, pauldron plates round the upper arm), `tube` (bell sleeves with a cuff that turns in), `panel` (pointed
tabard panels), `box` (pouches). **Body masking**: `covered()` casts 5 rays out of every body vertex; if all hit cloth
the vertex goes in `c4_hidden` and a Mask modifier removes it (~5,000 of 13,400 body vertices per character).
**Paint**: `project_bake()` — per-vertex "which picture sees me" weights (facing + an unblocked ray + not studio grey),
per-pixel sampling of each picture through its own projection with the grey keyed out in the shader, neighbours'
colour where nothing sees, emission-baked into the garments' UVs (2048). **Hat**: `fit_hat()` builds the band from the
head's outline at brow height (+3 cm for hair) and pulls hair inside the band (never into the skull).
Clip checks: `clip_report()` counts garment/hair vertices inside the visible body.

### Animation and the robe (step 6) — `tools/blender/c4anim.py`, `step6_robe_run.py`
- Clips: Quaternius' **Universal Animation Library** (CC0; vendored at `avatar-3d/chibi4/assets/ual/` since 2026-10-21)
  uses the same UE-style bone names as MakeHuman's game rig. `retarget()` gives each bone the source bone's world
  rotation corrected for the two rest poses (T vs A) — measured 0.0° off on every limb.
- `add_skirt_bones()` (8 round the hips, pivot at hip-joint height, to the hem), `skirt_weights()` (robe below the hips
  follows the two nearest by angle), `drive_skirt()` (front bones swing as far forward as the FURTHER-forward thigh,
  back ones as far back as the further-back thigh, sides follow their own leg; baked as keys so glTF carries them).
- `robe_stride()` caps a clip's thigh swing (~22–24°) and knee bend (~50°) — Quaternius' jog swings the thigh 78° and
  kicks the heel 129°, which rips any robe.
- `measure_feet()`: every frame, every boot vertex above the hem that is outside the robe's cloth wall is a
  poke-through (coming out UNDER the hem is allowed); otherwise the smallest foot-to-cloth gap. Step 6 exits non-zero
  if the final set-up has any poke-through.
- Results (mage): copied weights + full stride: 25/33 walk frames and 23/23 run frames poke; skirt bones alone or the
  stride alone still poke; **both: 0 pokes, closest gap 3.2 cm walking / 3.0 cm running.**

### Runtime (step 7) — `tools/blender/step7_export.py`, `js/chibi4.js`
- Export: the step-5 character, mantle re-weighted to the back, skirt bones (robe / tabard), 8 clips (idle, walk, run,
  cast, attack, hit, death, talk; mage walk/run with the robe stride and a straighter spine), the outfit decimated to
  30%, body/eyes/brows/lashes/hair/outfit joined into ONE mesh, their pictures copied into cells of ONE 2048 atlas
  (WebP; alpha kept for hair, brows, lashes), LOD1 = 40% and LOD2 = 15% of LOD0's triangles by decimation, all in one
  GLB with a `<who>.json` of numbers. Teeth and tongue are dropped (no lip animation).
- `createChibi4Character(avatar, opts)` returns `{ group, setAnim(name, fade), play, update(dt), setRate, stats(),
  metrics(), setAvatar, dispose, parts, skeleton, lod }` — the calls Thousandvale and the Chibi 2 pages make.
  Chibi 2 animation names map onto the 8 clips (ready/guard → idle, wave → talk, dead → death; jump → idle).
  `modelFor(avatar)`: elves and women → elf, everyone else → mage (or `avatar.chibi4.model`).
  Instances share geometry and texture (`SkeletonUtils.clone`), the three distances are a `THREE.LOD` (0 / 9 / 22 m).
- Thousandvale: `prototypes/thousandvale/js/client/actors.js` — 7 lines: with `?renderer=chibi4` the self actor's body
  is created by `createChibi4Character` (dynamic import, so nothing loads without the flag); any error falls back to
  Chibi 2. `equip()/dress()` return false — gear and mounts do not show on a Chibi 4 body.

### The modular kit (step 9) — `tools/blender/step9_kit.py`, `c4kit.py`, `c4emotes.py`, `js/chibi4-kit.js`, `js/chibi4-outfit.js`

**What gets built** (`$B -b -P avatar-3d/chibi4/tools/blender/step9_kit.py -- male|female`, ~2.5 min each) into
`models/kit/<body>/`:

| file | what | size (male) |
|---|---|---|
| `body.glb` | the skeleton (53 MakeHuman + 8 skirt bones) + body, eyes, brows, lashes at 3 distances; pointed ears as morph `elf_ears` | 339 KB |
| `g_<id>.glb` x13 | robe, mantle, sleeves, boots_low, undershirt, jerkin, trousers, boots_tall, bracers, pauldrons, tabard, scabbard, hat | 20–130 KB each |
| `h_<id>.glb` x6 | short, braid, ponytail, long, bob, crop (MakeHuman CC0 hair fitted to this body) | 40–160 KB each |
| `atlas.webp` / `mask.webp` | ONE colour picture for every piece (3072x2048) / the tint mask (R main colour, G second colour, B skin) | 651 / 88 KB |
| `anims.glb` / `anims_more.glb` | 14 clips needed at once / the other 53 (fetched when the first character of this body is made) | 248 / 854 KB |
| `kit.json` | bones, garments (hide bit, slots, layer, painted colours), hairs, clips, the robe test, knee and weight checks | |

- **Both outfits on both bodies**: the mage's and the elf's garments are measured off EACH body (step 5's functions),
  so a woman can wear the robe and a man the armour. Each outfit is painted once per body from its reference pictures
  (the elf's back view is now Codex's `ref/warrior-back.png`) and split back into garments.
- **Hide masks**: every vertex of the body, the hair and each garment carries the bits of the garments that cover it
  (step 5's ray test, per garment; an outer layer hides what is under it: jerkin under robe, undershirt under jerkin,
  hair under the hat or the mantle). They travel as COLOR_0 (R = bits 0–7, G = 8–15, exact through 8-bit quantisation)
  because gltfpack drops custom attributes. A floor-length robe also hides every leg vertex between its hem and the hips.
- **Weights**: copied from the WHOLE body (the owner's "right leg bent backwards" was trousers skinned from a body with
  the legs hidden — they took the hip's and foot's weights and never bent at the knee); only the robe copies from the
  hidden body so it follows the spine; low boots ride the foot. `kit.json masks.weight_agreement` checks it per garment.
- **Clips** (`c4emotes.py`): 35 copies of Quaternius' CC0 library, 4 mirrored for the left hand (`retarget_seq(...,
  mirror=True)`: each bone reads its opposite, reflected through the mid-plane), jump = start + air + land, stand-up = a
  fall played backwards, sleep = a fall's last frame; 21 emotes authored on top (`overlay()`: aim a bone at a direction or
  another bone, turn, move — in the rig's space): wave, point, salute, cheer, clap, bow, nod, head shake, shrug, laugh,
  folded arms, look around, stretch, pray, drink, guard, kick, spin, ride, ride at a gallop, sit on the ground. A
  `<clip>_robe` twin with step 6's robe stride for walk, run, sprint and formal walk — and step 6's foot-vs-hem check on
  every one of them, both bodies (the build fails the test if any foot gets through). Knees: any bend past straight is
  taken out at retarget time and reported (`knees` in kit.json).
- **Compression**: every GLB goes through `gltfpack -cc -kn -kv -vpf -vtf -af 30` (meshopt; positions and UVs stay full
  precision so the face and hands do not move; npm devDependency) and loads with `vendor/meshopt/meshopt_decoder.mjs`.
  Step 7's GLBs too: mage.glb 3.17 MB -> 0.92 MB.

**How a character is assembled** (`createChibi4Kit(avatar)`, also the default of `createChibi4Character`):
1. `outfitFor(avatar)` (pure, `chibi4-outfit.js`) turns Chibi 2's avatar JSON into `{ body, race, skin, hair: {id,
   color}, garments: [{ id, color, color2 }] }` — robes/gowns -> robe + mantle + sleeves, anything else -> undershirt +
   jerkin (+ pauldrons/bracers for armour), wizard hats -> hat; `avatar.chibi4` overrides any of it. Slots resolve
   clashes (a later jerkin takes the robe's torso), knee boots become low boots under a robe, nobody is left bare.
2. The body type's shared files load once per page (skeleton, atlas, mask, first clips); each piece's GLB loads once
   and is unpacked to plain arrays with its joints renamed to the skeleton's order by bone name.
3. For the outfit, the worn garments' bits are OR'd and every triangle with a vertex under a worn garment is dropped;
   the kept triangles of all pieces are copied into ONE geometry per distance with a slot number per vertex (0 body,
   1 hair, 2.. garments); elf ears are added from the morph. Cached by outfit, so identical outfits share it.
4. One material per character over the shared atlas: the shader reads the tint mask and the slot's two colours from a
   uniform array (colour x the painted brightness), and the skin ratio. Recolouring (`setColors`) is a uniform write.
5. A cloned skeleton, a THREE.LOD of three SkinnedMeshes (0 / 8 / 18 m), an AnimationMixer; far characters evaluate
   their animation every 2nd / 3rd frame. `setAnim(name)` maps any Chibi 2 name (`clipFor`), playing the robe twin when
   a robe is worn; a clip still downloading plays idle until it lands.

API: `{ group, setAnim(name, fade, restart), play, update(dt), setRate, setTwist, hit, dress(change), setAvatar(a),
setColors({ skin, hair, garments }), attach(object, 'handR'), equip() -> false, stats(), metrics(), dispose(), parts,
skeleton, lod, outfit, clip }`.

## Step 10b — stopped here (2026-10-16)

The owner pulled Chibi 4 out of Thousandvale (too realistic for it); it stays an experiment for a future game. 10b
stopped right after starting, **before anything was wired in**. The step-9 kit, `step9_kit.py`, `js/chibi4-kit.js`
and `js/chibi4-outfit.js` were not changed by 10b, so the kit builds and loads exactly as in step 9.

**Done (building blocks, not yet used by anything):**
- `tools/tiles.py` (run with Blender's Python, it has numpy: `~/opt/blender/5.2/python/bin/python3.13
  avatar-3d/chibi4/tools/tiles.py`) -> `textures/tiles/tiles.png`, `tiles-mask.png`, `tiles.json`: 59 generated
  seamless detail pictures (256 px cells, 16 px wrap border) for garments instead of projected reference paint.
  Tinted grey tiles with one shared average brightness, in main-colour (A) and second-colour (B) versions: cloth,
  lining (darker), leather, plate, mail, silk, fur, quilt; plus knit, scale, feather, beard strands; fixed colours
  (steel, dark steel, gold, brass, bone, rope, wood, black, glass, gems, herb, parchment, straw, white, fur, red cloth,
  four glows); stubble (skin-tinted with beard-tinted hairs); 14 tier-2 emblem discs (icon = A, rim = B). The mask's
  alpha is "shine" (1 = glows).
- `tools/blender/c4wardrobe.py`: the generator core (compiles; never run end to end). `Fit(B, rig, hairs)` measures any
  kit body (landmarks: neck base, chin, brow band, mouth, ears, hips, waist, ribs, knees, ankles) and gives every body
  vertex one of 21 HIDE ZONES (neck, sternum, chest, back, belly, hips, shoulder, upper arm, forearm, wrist, hand,
  thigh, knee, calf, ankle, foot, scalp, head back, ears, face, jaw); mesh primitives (loft, sheet, tube, curve, sphere,
  cone, torus, disc, box, octahedron, solidify, cut, mirror, shell over zones); `Garment` + `finish()` = tile UVs (UV
  v = 4 + 32 x cell + local v; the shader would repeat the cell with fract), weights (nearest body / torso only /
  rigid bone / skirt bones for long hems and capes), per-vertex zone bits, sway weights, and measured coverage per
  zone (a garment hides a zone only if it really covers >= 95% of it).

**Not done (the whole visible part of 10b):**
- Recipes: 0 of the 157 worn catalog rows (92 armour, 5 hats, 60 accessories) and 0 of the 32 class outfits. The
  port spec of every Chibi 2 recipe (shapes, sizes relative to the head/torso, colour roles, what each covers) was
  extracted and is summarised in the 10b agent's report; it was not saved as a file.
- Build integration into `step9_kit.py` (zone masks for body/hair/old garments, tiles band appended to the atlas and
  mask, `kit.json` `zones` / `hides` / `layer`), beards as separate pieces + removing the painted beard from
  `mage-skin.jpg`, robe-vs-feet check for every long garment, the 6-angle face/hat check per headpiece.
- Runtime: layer-aware zone hiding in `mergeOutfit` (24 bits = COLOR_0 R/G/B, sway = 1 - A), the tile shader
  (textureGrad + fract), cape sway uniform, MAX_SLOTS 32, `outfitFor` mapping Chibi 2 ids -> wardrobe pieces,
  tier-2 emblems, facialHair; the lineup / catalog contact sheets and tests.

## Step 10 contracts (two agents at once, 2026-10-16)

Step 10 runs as parallel pieces. Each owns its files; shared files are touched only in the marked blocks below.

**10a — held items, off-hands, seats (owner: the 10a agent)**
- Owns NEW files: `js/chibi4-grip.js` (pure: hold kinds, real-world lengths, grip specs, sockets, seat numbers),
  `js/chibi4-held.js` (three.js: builds each held/off-hand item from the Chibi 2 builders, attaches it, the per-frame
  hold pose — finger curl, wrist lock, the second hand on a two-hander, the bow draw), `held.html` + `js/held-page.js`
  (one character or the whole contact sheet), `tests/held.test.js`, `tests/held.spec.js`, `shots/step10a/`.
- In `js/chibi4-kit.js` it adds, inside blocks marked `// 10a:` only: `equip({ held, offhand })` (was `return false`),
  a hold hook called at the END of `update()` after the mixer, `seatHeight(clip)`, `parts.hips` (= pelvis, for
  avatar-3d/js/mounts.js `seatRider`), and building `avatar.held` / `avatar.offhand` on create / `setAvatar`.
- In `js/chibi4-outfit.js` it owns `avatar.held` / `avatar.offhand` (nothing there yet: the hold logic lives in
  chibi4-grip.js so the two agents never edit the same lines). The kit's `scabbard` GARMENT stays 10b's.
- Shared code: `avatar-3d/js/mounts.js` `riderHipsY` asks `body.seatHeight?.()` first (opt-in; a Chibi 2 body has no
  such method, so nothing changes for Farhold/Emberveil/Thousandvale's Chibi 2). `armory/` gets a Chibi 4 toggle.
- Held items are separate meshes parented to bones (hand_r / hand_l / lowerarm_l / spine_03 / pelvis), one draw call
  per item, NOT merged into the body: the body merge is keyed by outfit, and weapons change far more often than clothes.

**10b — worn garments (owner: the 10b agent)**: `tools/blender/c4kit*.py` garment building and the WORN slots of
`js/chibi4-outfit.js` (`SLOTS`, `outfitFor` garments). 10a does not touch them.

**10b in detail** (2026-10-16; 10b = worn things: armour, hats, accessories, capes, class outfits, beards):
- `tools/blender/c4wardrobe.py` (new: the garment generator — recipes measured off ANY kit body), `c4clothes.py`,
  `c4kit.py` mask helpers, and the garment / hair / beard / atlas / mask sections of `step9_kit.py`.
- In `js/chibi4-outfit.js`: everything about WORN slots — `outfitFor()` for `top`, `bottom`, `shoes`, `hat`, `cape`,
  `decor`, `accessory`, `gloves`, `face` and `facialHair`; `SLOTS`; the hide-zone logic (garment recipes may move to a
  new pure `js/chibi4-wardrobe.js`).
- In `js/chibi4-kit.js`: `mergeOutfit`, `partsOf`, the tint shader (incl. cape sway), `applyColors`, `MAX_SLOTS`.
  10b edits there are small and local (Edit, never a whole-file rewrite) and never inside `// 10a:` blocks.
- `models/kit/<body>/` garment files `g_*.glb`, `h_*.glb`, `f_*.glb` (facial hair), `atlas.webp`, `mask.webp`,
  `body.glb` (its hide mask changes) and the `garments` / `hairs` / `beards` / `zones` parts of `kit.json`.

**Shared rules** (10b proposed; 10a please object here if one does not work for you)
- The SKELETON (bone list of `body.glb` / `anims*.glb`) does not change in step 10 without a note here first: 10b adds
  no bones (capes sway in the shader), 10a uses runtime sockets parented to existing bones.
- One kit build at a time: run `step9_kit.py` under `flock /tmp/claude-1000/chibi4-kit-build.lock ...`. It rebuilds
  everything in `models/kit/<body>/`; never hand-edit the outputs.
- **Hide zones** (10b, replaces step 9's one-bit-per-garment masks, which ran out at 16 garments): every vertex of the
  body, hair, beards and garments carries the bits of the BODY ZONES it lies over (COLOR_0 R/G = 16 bits: neck,
  chest, belly, hips, shoulder, upper arm, elbow, forearm, hand, thigh, knee, shin, foot, scalp, head back/ears, face).
  A garment lists the zones it fully covers (`kit.json garments.<id>.hides`) and a `layer`; at runtime a piece's
  triangle is dropped when one of its vertices lies in a zone hidden by a worn garment of a HIGHER layer. A held item
  never hides anything.
- kit.json additions are additive (new keys); nobody renames or removes a key the other uses.

## Step 10a — stopped here (2026-10-16)

The owner pulled Chibi 4 out of Thousandvale (too realistic for it); it stays an experiment for a future game. 10a was
stopped part-way. What exists, and what does not:

**Built (works, not polished):**
- `js/chibi4-grip.js` (pure, no three.js): real-world lengths per weapon type and per id, how each Chibi 2 hold kind is
  turned into one item frame (+Y the business end, +X the striking side, origin in the fist), which Chibi 4 anchor it
  hangs on (fist, palm, forearm, back, hip, chest), the hold pose per family and clip state (`fist` = the wrist keeps
  one turn so the item rides the fist, the Z63 rule; `steady` = arm IK + aim; `second` = other hand on the handle),
  hands-free clip list, fist curl numbers, seat clearances.
- `js/chibi4-held.js`: lifts an item's triangles out of a throwaway Chibi 2 body (diff against the bare body, per
  carrying bone), canonical frame + real size, one shared material (vertex colours, metal per vertex), hand frames
  measured from the kit's own finger bones, finger flex axes found per bone, two-bone arm IK, wrist lock per clip,
  second hand on the handle, a live bow string with a draw to the cheek, `seatHeight(kit, clip)` (pelvis height in the
  seated clip) and `seatChibi4(body, seat, { clip, feet })` for benches and boats.
- `js/chibi4-kit.js` (`// 10a:` blocks): `actor.equip({ held, offhand })`, `actor.holdRig`, `actor.seatHeight(clip)`,
  `parts.hips` (= pelvis), and the hold hook at the end of `update()`. **Equipping from the avatar is opt-in**
  (`createChibi4Kit(avatar, { held: true })`); off by default so nothing shows broken weapons.
- `held.html` + `js/held-page.js`: one character (`?held=…&off=…&anim=…&cam=…`), the contact sheet
  (`?sheet=1&page=0&per=20`), a rider (`?seat=horse`). All 20 rows of the first sheet page build without an error.

**Not working / not done:**
- **Sizes are wrong for many items** (first sheet: `shots/step10a/sheet-page0-first-try.png`): the crossbow, staves,
  polearms, two-handers and the sceptre came out huge. Likely the lift picks up triangles that are not the item (body
  pieces that change when something is held), so the size box is too big; fix the lift first (keep only triangles on
  grip/forearm/back bones, or compare per bone), then re-check the scale step.
- Grip angles and poses are unchecked by eye; the 106-item contact sheet has not been reviewed; only page 0 was rendered.
- No tests yet (planned: `tests/held.test.js` for the pure table, `tests/held.spec.js` for every row building and the
  grip-to-forearm angle through idle/walk/run/attack).
- Mounts: `avatar-3d/js/mounts.js` `riderHipsY` was NOT changed (it would need `body.seatHeight?.()` first; Chibi 4
  has `parts.hips`, so `seatRider` runs but seats at the standing pelvis height). Boats and benches untested.
- The armory page has no Chibi 4 toggle.

## Measured (step 9)

On this VM (headless Chromium, software renderer, no GPU — compare side by side, not with another machine), from
`tests/chibi4.spec.js` (numbers saved in `shots/step9/measured.json`):

| walking at Thousandvale's camera | Chibi 2 | Chibi 4 baked (step 7) | Chibi 4 kit (step 9) |
|---|---|---|---|
| 20 characters | 11.8 fps, 31 calls, 132k tris | 7.2 fps, 21 calls, 151k tris | 9.9 fps, 21 calls, 68k tris |
| 50 characters | 6.2 fps, 76 calls, 330k tris | 4.6 fps, 51 calls, 268k tris | 5.1 fps, 51 calls, 170k tris |
| 100 characters | 3.4 fps, 151 calls, 660k tris | 2.6 fps, 101 calls, 535k tris | 3.1 fps, 101 calls, 335k tris |

The kit crowd wears random outfits (46 different ones in 50). Full detail at every distance: 1.53M triangles for 50 and
a ~6x slower frame — the distance versions are the big win. Skipping animation frames for far characters made no
measurable difference here (the VM's time goes into skinning vertices, not the mixer).

| player load (kit.html, cache off) | bytes | download | decode | ready | first frame |
|---|---|---|---|---|---|
| mage, 10 Mbps + 40 ms | 1.69 MB, 10 files | 1.75 s | 41 ms | 1.78 s | +0.58 s |
| elf, 10 Mbps + 40 ms | 1.86 MB, 13 files | 1.91 s | 40 ms | 1.94 s | +0.54 s |
| mage, local server | 2.54 MB* | 0.26 s | 48 ms | 0.29 s | +0.56 s |

(*local: the second clip file had landed before the first frame. First frame is mostly shader compiling on the CPU.)
In Thousandvale the wait is hidden anyway: Chibi 2 body first, swap when ready.

## Measured (step 7)

Measured by `tests/chibi4.spec.js` on `compare.html` (this VM: headless Chromium, software renderer, no GPU — the
frame rates are only meaningful side by side; re-measure on a real PC with the page's crowd buttons):

| | Chibi 2 | Chibi 4 |
|---|---|---|
| draw calls per character | 1.5 | **1** |
| triangles per character, near | 6,598 | 35,672 (LOD0) |
| distance versions | — | 34.6k / 13.9k / 5.2k (mage), 36.7k / 14.7k / 5.5k (elf) |
| bones | 22 | 61 (53 MakeHuman + 8 skirt) |
| download | none (built in code) | 3.2 MB (mage) + 3.5 MB (elf) GLB, once per model |
| first build, both characters | 79 ms | 334 ms incl. download |
| 20 characters at game distance | 11.9 fps, 31 calls, 132k tris | 6.9 fps, 21 calls, 151k tris |
| 50 characters at game distance | 6.1 fps, 76 calls, 330k tris | 4.3 fps, 51 calls, 268k tris |

In Thousandvale (`tests/thousandvale-hook.spec.js`, real game server): with `?renderer=chibi4` the player is the
Chibi 4 mage (1 draw call, 1.91 m, walks/runs, no page errors); without the flag the player is Chibi 2 as before
(2 meshes, 8,114 triangles, 1.78 m).

## Verdict

**Step 9: the look, the robe AND runtime modularity are solved; what blocks replacing Chibi 2 is content and gear,
not the system.**

- Modular at runtime: two bodies x two races x any skin, six hairs in any colour, 13 garments with two colours each,
  mixed freely (hide masks, slot rules), one draw call per character, shared downloads and merged outfits.
- All 96 Chibi 2 clip names play something: 53 the action itself, 43 the nearest clip (the weapon families, fishing,
  professions mostly reuse the sword swing / punches / kneel-and-work).
- Cost: draws half Chibi 2's triangles thanks to the distance versions and the hidden-triangle removal; on this VM it
  runs at ~85–90% of Chibi 2's frame rate (step 7 was ~60%). Player loads in ~1.8 s on 10 Mbps, and never waits in game.
- Still missing before a swap: weapons and shields in the hands (Chibi 2 has the grip bones and hold-aware clips), mounts
  and boats (Chibi 2's seat), more garments (only these two outfits' pieces exist; each new outfit is a script + a
  reference picture), more body builds (each is a full kit; a slider body cannot share garments), a real-PC
  measurement, and an owner look at the style next to Thousandvale's world.

Recommendation: use the kit for new games and for Thousandvale's player/hero characters behind the flag; next pieces of
work are weapon sockets with hold-aware clips, a seat pose for mounts, and a garment per Chibi 2 outfit family.

### Step 7's verdict (kept for the record)

**The look and the robe are solved; the system is not yet a Chibi 2 replacement.**

- Looks: the first version that reads as the Codex reference — real faces (MakeHuman topology, painted), 6.6–6.8 heads,
  painted robe/armour. Much better than Chibi 2's dolls and Chibi 3's faces.
- The original complaints: faces are never touched by collar, hat or pauldrons (measured), skin never shows through
  clothes (it is deleted), feet never pass through the robe on walk or run (measured every frame).
- Cost: one draw call per character, and the distance versions make a crowd cheaper in triangles than Chibi 2 — but
  skinning 61 bones over more vertices is slower per character on this GPU-less VM; needs a real-PC measurement.
- The gap: it is two baked characters. Chibi 2's whole value is "any part, any colour, any class" at runtime. Chibi 4
  is modular only at BUILD time (sliders + garments measured off the body + a script).

Recommendation: keep this pipeline (MakeHuman + garments-from-the-body + skirt bones + painted textures) as the
direction for new games and hero characters; the next piece of work is runtime modularity (body + each garment as
separate skinned meshes on one skeleton, a body mask per outfit, weapon sockets, more clips). Do not port Thousandvale
past the opt-in flag yet.

## What is not done

- No weapons, shields or off-hand items in the hands (`attach(obj, 'handR')` parents anything to a hand bone; there is
  no grip pose or hold-aware clip). `equip()` returns false.
- No mounts or boats: Thousandvale's mount code expects Chibi 2's seat; the kit has `ride`/`rideGallop` clips but no
  seat point.
- Only the two test outfits' garments exist (13 pieces) and one hat; Chibi 2's other outfit ids map onto them.
- Two body builds only. A new build (heavier, dwarf, child) is a new kit: garments are measured off the body they are
  for and cannot be shared with a body of different proportions.
- Inner layers (undershirt, trousers) carry a little paint of what covered them in the reference picture when worn alone.
- The male face always has the painted beard (it is in the skin picture).
- Clips cannot be shared between the two bodies (up to 15 degrees apart at the thighs after retargeting); each body has
  its own clip files.
- Quaternius' jog keeps a slight forward hunch; its idle is a ready stance with bent knees.
- Faces keep MakeHuman's glassy realistic eyes; painted eyes would match the reference better.
- Step 8 (Tripo3D) needs the owner's account.

## Rebuild

Blender 5.2.2 at `~/opt/blender/blender`, MPFB 2 + the CC0 packs installed once (see `tools/blender/step3_makehuman.py`
header). From the playground root:

```bash
B=~/opt/blender/blender
$B -b -P avatar-3d/chibi4/tools/blender/step4_painted.py                  # step 4 shots
$B -b -P avatar-3d/chibi4/tools/blender/step5_clothes.py                  # step 5 shots + report.json (2 min)
$B -b --python-exit-code 3 -P avatar-3d/chibi4/tools/blender/step6_robe_run.py   # step 6, fails if a foot gets through
$B -b -P avatar-3d/chibi4/tools/blender/step7_export.py -- mage          # models/mage.glb + mage.json (~30 s)
$B -b -P avatar-3d/chibi4/tools/blender/step7_export.py -- elf
$B -b -P avatar-3d/chibi4/tools/blender/step9_kit.py -- male              # the kit, ~2.5 min per body (fails its robe test loudly)
$B -b -P avatar-3d/chibi4/tools/blender/step9_kit.py -- female
node --test avatar-3d/chibi4/tests/kit.test.js                            # clip coverage, robe test, knees, weights, sizes
python3 avatar-3d/chibi4/tools/sheet.py <out.png> <renders...>            # contact strips for the review page
flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/chibi4/tests/   # compare page, crowd, Thousandvale hook
```

`models/*.glb` (~0.9 MB each, meshopt) and `models/kit/` (~4 MB per body) are committed so the pages work from a fresh checkout; the big working files
(`.blend`, raw renders, full-size Codex PNGs, baked garment PNGs) are git-ignored and rebuilt by the scripts.

## Licences

MakeHuman/MPFB output and the asset packs used (skins incl. the bearded one, hair, brows, lashes, eyes, game rig): CC0
(per the packs' metadata; the "AGPL" line in some .mhclo headers is the MakeClothes tool's boilerplate). Quaternius
Universal Animation Library: CC0. meshoptimizer's decoder (vendored) and gltfpack (build-time devDependency): MIT. Codex
pictures: generated for this project. MPFB's code (GPL) runs only at build
time and is not shipped.
