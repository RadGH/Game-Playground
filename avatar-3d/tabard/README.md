# Tabard — hand-painted low-poly characters with swappable armour

> **Status:** round 3 (2026-11-23) gear variety: 16 new painted props from a variant table (winged / horned greathelms,
> visored helm, nasal + kettle helms, leather cap, hood, mail coif, circlet, wizard hat; round / kite / tower shields;
> spiked + leather pauldrons; a crimson cape), two new outfit paintings (Ironlink mail, Mossgrove robe), 10 more
> outfit sets, and **every fal.ai weapon wearable** (`equip('mainhand', 'fal:axe')`). Wyrmroad's high-detail mode maps
> its items onto these. Earlier: round 2 (2026-11-22) self-QA pass: checks built (mesh health, proportions vs the owner's reference,
> poke-through while animating, 9-angle turntables — `tools/qa.sh`) and their findings fixed: hands shrunk, robe follows
> the legs, slimmer boot cuffs, helm nose/plume, sword grip, head level, cape hangs. Owner direction: Tabard for main
> characters, fal.ai for monsters. **How to make the next model: `WORKFLOW.md`.**
> **Play:** LAN `http://<LAN IP>:8400/avatar-3d/tabard/` (stable) · dev 8401 · tabs: Dressing room / Comparison / Crowd test
> **Next:** owner look at the new gear (Dressing room sets: mail, Mossgrove, Starweaver, scout, warlord, herald,
> knight, footman, pilgrim, raider, Tower banneret, Stag herald); Wyrmroad high-detail mode wires items to these; then: feedback button on the page (owner to pick: unlisted on games.radgh.com, or home only); known limits in
> `WORKFLOW.md`; then a fal.ai version is being tried in parallel (`avatar-3d/fal/`); then more outfits,
> the goblin and other races, and a Chibi 2.6 drop-in adapter for the games — only if the owner picks this path.
> **Parked:** a body Claude builds from scratch (not asked for; offered as an option); merging swap-in pieces into one
> draw call; compressing the animation file.

The owner's brief (2026-11-22): "I especially emphatically do require models be able to equip armor and weapons. I
would prefer World of Warcraft style, extremely low poly with rich textures and transparency and projected textures."
Then: "Let's regrettably try quaternius again. I just don't like those models or animations, they are too muscular.
Give it a shot and see what you can do for free. Create it as a new model page with comparisons."

Everything here is free: Quaternius CC0 base bodies, the CC0 Universal Animation Library, headless Blender on the VM,
and Codex pictures (the owner's ChatGPT plan). No paid 3D service.

## How it works — three layers, like the classic MMOs

1. **Painted-on armour.** Each body has ONE 1024² texture split into fixed boxes (`data/regions.json`): upper torso,
   lower torso, head, upper/lower arm, hand, upper/lower leg and foot per side. Each box is the body part unrolled like
   a tube with one cut on the back or underside, and the part borders are clean rings at the joints (the mesh is
   sliced there), so a plate chest next to cloth trousers meets in a straight line. An armour slot owns boxes:
   chest = torso upper + upper arms, legs = torso lower + upper legs, hands = forearms + hands, feet = shins + feet.
   `js/tabard.js` paints the texture on a canvas: the bare skin, then each worn item's boxes copied from its outfit
   painting. Swapping gloves re-copies four boxes; the mesh never changes.
2. **Swap-in pieces** (WoW calls them geosets) inside the body file: a robe skirt, fold-down boot cuffs, flared
   gauntlet cuffs. Items turn them on (`geosets`) or force them off (`hides`: a robe hides boot cuffs). They have
   their own boxes in the same texture and borrow their paint from the nearest painted body point (cuffs from a
   little further down the limb, where the painted boot top or glove is; the robe hem from higher up the shin).
3. **Props on bones** (built from a variant table — `WORKFLOW.md` §2b): greathelm (plain / winged / horned), visored
   bascinet, nasal helm, kettle helm, leather cap, hood, mail coif, circlet, wizard hat, pauldrons (plate / spiked /
   leather), capes, round / kite / tower / heater shields, tabards (slot `tabard`: a front flap only — the footman's
   "bottom tabard" over pure mail legs —, front + back flaps, or a full WoW-style tabard: chest + back panels on the
   chest bone plus the belt flaps; Tower (blue, white tower) and Stag (crimson, golden stag) designs; the flaps swing
   out of the legs' way), plus every fal.ai weapon (`fal:<id>`, §2c; staffs / spears / two-handers held at a right
   angle to the forearm with the elbow bent to carry them, oversized heads shrunk above the fist). The first ones:
   greathelm, pauldrons (one model, mirrored), a cape with a torn see-through hem, a braided
   ponytail of crossed cards (round 1; replaced in round 4 by the hair layer, 4. below), arming sword, oak spellstaff,
   heater shield. Weapons lean back up the arm by `place.tilt` so they stand up when the arm hangs. `models/props/sockets.json` holds each prop's place in its bone's own frame, per
   body, computed in Blender from the rest pose (bone frames are identical in Blender and three.js; the prop file is
   turned +90° about X inside its holder to undo the file's Y-up conversion).

4. **Hair layer** (`js/hair.js`, round 4): its own mesh on the Head bone, separate from the face layer so each can be
   tuned alone. All 25 Chibi 2.6 hair ids (`data/hair.json`, one line of knobs per piece), any colour. Built for THIS
   body's head: rays from inside the skull measure the scalp, so every strand hugs the man's and the woman's head.
   Pieces: a scalp shell with a ragged or fuzzy hairline (it covers the bald scalp itself), painted strand cards,
   spikes, buns, curl fins, and SWINGING tails (ponytails, braids, locs, twin tails) and curtains (long hair) — small
   point-and-stick simulations that collide with the head, neck, shoulders and back. One shared 1024² strand picture
   painted in code (`js/hair-paint.js`, see-through tips, light/shade only — the material turns it into any colour).
   Cost: 0–1,420 triangles and one draw call per hairdo. Under headwear each head item's `hair` rule applies
   (`hide` | `under` | `keep`): `under` tucks the hair 4 mm inside the hat's real inner surface, drops buns and
   spikes, moves tails and curtains to start below the rim. The old Hair-slot `ponytail` item now picks the ponytail
   style (`hairStyle`). `createTabard` shows the look's hair (`js/face.js defaultLook` until a look is given).
5. **Cloth** (`js/cloth.js`): any prop with `place.cloth` in props.json (both capes today; the tabard flaps use
   `place.hang` with leg clearing — see WORKFLOW §2d) hangs as cloth —
   a coarse grid of points over the sheet, the top edge sewn to its bone, sliding over capsules fitted to the body
   (torso, hips, thighs, shins, arms) so legs never push through. Options in `WORKFLOW.md` §2d.

Body + swap-in pieces share one material; each prop adds one draw call; the hair adds one.

## Painting: Codex paints the 3D body's own picture ("projected textures")

1. `tools/blender/tb_sheet.py` renders the body in an A-pose as light clay from front, left, back and right
   (orthographic, same scale); `tools/sheet.py` lays them into one 1536×1024 sheet (`ref/<body>/base.png`) and keeps
   the outline mask.
2. `tools/paint.mjs <body> <outfit>` asks Codex to paint over it. The bare **skin** is painted over the clay; every
   other outfit **edits the painted skin sheet** (one picture in). With two pictures in, Codex drew a new figure 17%
   bigger that no longer lined up (2026-11-22). If Codex draws but does not save the picture, the runner takes it from
   `~/.codex/generated_images/<session id>/`. After each painting `tools/align.py` measures every figure; more than 3%
   off the clay size and the job runs again (up to 3 tries). Codex sometimes returns no picture; the retry covers it.
3. `tools/align.py` undoes small shifts/scale (`--fit-width` measures by width when the painter added something on
   top that the model lacks, e.g. the helm's plume) and cuts each view out, with the clay outline (pulled in 3 px) as alpha.
4. `tools/blender/tb_bake.py` poses the body exactly as in the sheet and projects: per vertex, each view's weight is how
   squarely the surface faces it (to the 4th power), zero when something is in front (five spread rays, so the painted
   hand never lands on the thigh beside it) or outside the outline; spots no view sees take their neighbours' colour.
   The shared projection lives in `tools/blender/tb_project.py` (also used for props).
5. `tools/publish.py` writes `models/<body>/<outfit>.webp`.

Props go the same way (`tools/blender/tb_prop.py build|bake|sockets`, `node tools/paint.mjs prop <id>`): a low-poly
model built in code, four clay views, Codex paint-over, projection. A prop marked `seeThrough` (the cape) takes its
transparency from the painting: inside the outline, wherever Codex left background (the torn hem), becomes
see-through (alpha-cut, two-sided).

## The bodies

`tools/blender/tb_body.py` (knobs in `data/shapes.json`): weld the glTF's split seams → drop the modelled eyes and
brows (faces are painted) → push each vertex toward or away from its bone line per bone (blended by its bone weights)
→ grow hands, feet and head → smooth the torso and limbs (Taubin passes, no shrinking) to iron out the six-pack → cut
down to 3,000 triangles; the joint cuts bring it to ~3,870 (man) / ~3,790 (woman). The first try slimmed too far
(a skinny mannequin); the kept version keeps the volume and only removes the muscle detail. Codex was told "soft,
ordinary everyday build, NOT muscular" for the skin paintings after it painted a six-pack on the first one.

## Animation

The CC0 Universal Animation Library (43 clips, `models/anims.glb`) uses the same 65-bone skeleton, so clips play
directly (rotations only, plus the pelvis height re-based to the body). The library's posture is athletic (clenched
fists, shoulders up, arms held out); `calm` (0–1, the page's "Calmer posture" slider) eases the spine and neck toward
neutral, opens the hands, and brings the upper arms in.

## Files

| Path | What |
|---|---|
| `index.html`, `tabard.css`, `js/page.js` | review page (`?tab=dress|compare|crowd&body=&set=&clip=`; `window.__tabard` for tests) |
| `js/tabard.js` | the runtime: `createTabard({ body, items, clip, calm })` → `{ group, equip, wearSet, play, update, stats }`; `falItems()` lists the `fal:<id>` items |
| `data/regions.json` | texture boxes, slots, swap-in pieces |
| `data/items.json` | slots, items (paint / geosets / hides / attach), outfit sets |
| `data/outfits.json` | what Codex paints per outfit (original designs) |
| `data/props.json` | props: look, how they attach |
| `data/shapes.json` | body reshaping knobs |
| `models/` | `male.glb`, `female.glb` (+ `_asis` originals for the comparison), `anims.glb`, `<body>/<outfit>.webp`, `props/` |
| `models/<body>_face.json`, `models/<body>/face.webp` | face layer data (round 4, `tools/blender/tb_face.py`): eyeballs (centre, radius, forward, lid lines, socket opening) in the Head bone's frame + face landmarks in the face texture (u right = character's left, v DOWN) and in the Head frame; the clean painted face (no brows/beard/eyes) in the `face_layer` mesh's own layout |
| `tools/blender/tb_face.py` | builds `face_layer` (copy of the face, ear to ear, eye openings left open, same bone weights, 0.4 mm out, own longitude/latitude layout) into `build/<body>_fit.blend`, measures the eyes + landmarks; `TB_FACE_SHOTS=1` renders them as balls → `shots/<body>_face_*.png` |
| `tools/head_clean.py` | bald, clean-shaven, browless head box in every body painting (from the Codex bald repaint `paint.mjs <body> head`, eyes and leftovers filled), and `models/<body>/face.webp`; `--debug` shows what it replaced |
| `ref/` | clay sheets and Codex paintings (`job-*` folders are ignored by git) |
| `tools/` | the pipeline (below) |
| `assets/quaternius/` | the CC0 Universal Base Characters (free Standard pack: Superhero male + female) |
| `js/hair.js`, `data/hair.json` | the hair layer: `createHair(ctx)` → `{ set({id, color} \| null), setHead(headItemId \| null), update(dt), settle(), stats(), dispose(), id, styles, ready }`; the 25 styles (+ aliases for the other Chibi ids) |
| `js/hair-paint.js` | the shared hair picture, painted in code (cap strands, locks, wavy lock, tuft, braid, loc, curls, stubble, curl fringe, leather tie) |
| `js/cloth.js` | `Verlet` (fixed 1/120 s steps, teleport reset), `bodyColliders()` (capsules fitted per body), `createCloth({ holder, bodyMesh, bones, opts })` → `{ update(dt), reset(), dispose() }` |
| `tests/qa-hair.mjs` | hair sheets (`shots/qa/hair_<body>.png`), hair through headwear (`build/qa_hair_hats.json`), hair + cloth stability (`build/qa_hair_physics.json`) — part of `tools/qa.sh` |
| `tests/qa-props.mjs` | close-ups of every attached item per slot per body (part of `tools/qa.sh`) |
| `tests/data.test.js`, `tests/tabard.spec.js` | data rules; page tests (slot repaints only its boxes, robe/cuffs, props, tabs, phone) |

## Rebuild

```
B=~/opt/blender/blender; cd avatar-3d/tabard/tools/blender
for b in male female; do $B -b --python tb_body.py -- $b; $B -b --python tb_uv.py -- $b; $B -b --python tb_geo.py -- $b; $B -b --python tb_sheet.py -- $b; (cd ../.. && python3 tools/sheet.py $b); done
node ../paint.mjs male skin; node ../paint.mjs male cloth   # … each body × skin, cloth, leather, plate (skin first)
node ../paint.mjs male head; node ../paint.mjs female head   # the skin painting made bald + clean-shaven (head_clean.py)
for b in male female; do $B -b --python tb_face.py -- $b; for o in skin cloth leather plate mail sage head clay; do $B -b --python tb_bake.py -- $b $o; done; (cd ../.. && python3 tools/head_clean.py $b); $B -b --python tb_export.py -- $b; done
$B -b --python tb_export.py -- anims; (cd ../.. && python3 tools/publish.py)
for p in $(python3 -c "import json; print(' '.join(json.load(open('../../data/props.json'))['props']))"); do $B -b --python tb_prop.py -- build $p; (cd ../.. && python3 tools/sheet.py prop_$p); node ../paint.mjs prop $p; $B -b --python tb_prop.py -- bake $p; done
$B -b --python tb_prop.py -- sockets
```
Day to day after the paintings exist: `tools/rebuild-body.sh male female` (`UV=1` after a texture layout change)
does geo → fit → face layer → align + bake every painting (+ `head`, `clay`) → head_clean → export → sockets → publish.
Check renders: `tb_regions_look.py <body>` (boxes coloured on the body), `tb_look.py <body> <outfit>` (TB_GEO=robe,…),
`python3 tools/uv_picture.py <body>` (texture layout). Page shots: `node tests/shoot.mjs "<query>" out.png [w h wait]`.

## Licences

Quaternius Universal Base Characters (Standard) and Universal Animation Library: CC0. Codex pictures: generated for
this project. Blender runs only at build time.
