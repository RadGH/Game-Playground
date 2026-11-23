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
> knight, footman, pilgrim, raider); Wyrmroad high-detail mode wires items to these; then: feedback button on the page (owner to pick: unlisted on games.radgh.com, or home only); known limits in
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
   leather), capes, round / kite / tower / heater shields, plus every fal.ai weapon (`fal:<id>`, §2c). The first ones:
   greathelm, pauldrons (one model, mirrored), a cape with a torn see-through hem, a braided
   ponytail of crossed see-through cards (Hair slot; a helm with `hidesHair` hides it), arming sword, oak spellstaff,
   heater shield. Weapons lean back up the arm by `place.tilt` so they stand up when the arm hangs. `models/props/sockets.json` holds each prop's place in its bone's own frame, per
   body, computed in Blender from the rest pose (bone frames are identical in Blender and three.js; the prop file is
   turned +90° about X inside its holder to undo the file's Y-up conversion).

Body + swap-in pieces share one material; each prop adds one draw call.

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
| `ref/` | clay sheets and Codex paintings (`job-*` folders are ignored by git) |
| `tools/` | the pipeline (below) |
| `assets/quaternius/` | the CC0 Universal Base Characters (free Standard pack: Superhero male + female) |
| `tests/qa-props.mjs` | close-ups of every attached item per slot per body (part of `tools/qa.sh`) |
| `tests/data.test.js`, `tests/tabard.spec.js` | data rules; page tests (slot repaints only its boxes, robe/cuffs, props, tabs, phone) |

## Rebuild

```
B=~/opt/blender/blender; cd avatar-3d/tabard/tools/blender
for b in male female; do $B -b --python tb_body.py -- $b; $B -b --python tb_uv.py -- $b; $B -b --python tb_geo.py -- $b; $B -b --python tb_sheet.py -- $b; (cd ../.. && python3 tools/sheet.py $b); done
node ../paint.mjs male skin; node ../paint.mjs male cloth   # … each body × skin, cloth, leather, plate (skin first)
for b in male female; do for o in skin cloth leather plate; do $B -b --python tb_bake.py -- $b $o; done; $B -b --python tb_export.py -- $b; done
$B -b --python tb_export.py -- anims; (cd ../.. && python3 tools/publish.py)
for p in $(python3 -c "import json; print(' '.join(json.load(open('../../data/props.json'))['props']))"); do $B -b --python tb_prop.py -- build $p; (cd ../.. && python3 tools/sheet.py prop_$p); node ../paint.mjs prop $p; $B -b --python tb_prop.py -- bake $p; done
$B -b --python tb_prop.py -- sockets
```
Check renders: `tb_regions_look.py <body>` (boxes coloured on the body), `tb_look.py <body> <outfit>` (TB_GEO=robe,…),
`python3 tools/uv_picture.py <body>` (texture layout). Page shots: `node tests/shoot.mjs "<query>" out.png [w h wait]`.

## Licences

Quaternius Universal Base Characters (Standard) and Universal Animation Library: CC0. Codex pictures: generated for
this project. Blender runs only at build time.
