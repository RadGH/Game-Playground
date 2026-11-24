# Tabard model workflow — how a character model is made AND checked

Owner 2026-11-22: "Save this workflow and maintain it for future model generation, we will build on it." Direction:
**Tabard for the main (player) characters** — gear swaps per slot; **fal.ai (`avatar-3d/fal/`) for monsters** — one
model each, no custom gear. Keep this file current whenever a step changes (it is the checklist a new model follows).

## 0. Inputs
- A base body: rigged on the 65-bone UE-style skeleton the CC0 animation library uses (Quaternius Universal Base
  Characters today). A new race (goblin, dwarf…) needs a body on the same skeleton, so every clip plays.
- The owner's reference sheet (ChatGPT): proportions and look. Turn its proportions into `data/proportions.json`
  targets (heads tall, hand length, shoulder width…) BEFORE building — that is what step 5 checks against.

## 1. Body (Blender, headless) — `tools/blender/`
`tb_body.py` (reshape, smooth, decimate; knobs in `data/shapes.json`) → `tb_uv.py` (joint cuts, one texture box per
body part, `data/regions.json`) → `tb_geo.py` (swap-in pieces: robe, cuffs; knobs at the top of the file) →
`tb_fit.py` (size changes AFTER painting: moves points only, keeps triangles and texture layout, so the paintings
still fit — `shapes.json <body>.fit`) → `tb_face.py` (the `face_layer` mesh over the face with its own texture layout,
eyeball places + face landmarks → `models/<body>_face.json`; `TB_FACE_SHOTS=1` draws them as balls to check).

## 2. Paint (Codex)
`tb_sheet.py` + `tools/sheet.py` clay sheet → `node tools/paint.mjs <body> <outfit>` (skin first; outfits edit the
skin painting; alignment gate retries) → `tools/align.py`. Props: `tb_prop.py build`, sheet, `paint.mjs prop <id>`.
Rules learned: a thin part must have points INSIDE its faces (a bare box's corners all sit on the outline and get
trimmed — round 2 helm plume); a part the painter draws (plume, crest) must exist in the model at that size; use
`fitWidth` in props.json when the painter's height varies.

### 2b. Gear variants — the variant table (2026-11-23)
Props are built from `data/props.json` → `build: { shape, parts, outline }`. `shape` picks a base model in
`tools/blender/tb_prop.py` `build_mesh` (default: the prop's own id); `parts` adds pieces to it. A new variant of an
existing shape is **one props.json entry + one items.json entry, no code**:

| Shape | Parts it knows | Props built from it |
|---|---|---|
| `helm_bulwark` (greathelm) | `plume` (default), `wings`, `horns` | helm_bulwark, helm_bulwark_winged, helm_bulwark_horned |
| `helm_open` (bascinet + snouted visor, shut) | — | helm_visor |
| `cap` (dome to the brow, lower at the back) | `point`, `nasal`, `brim`, `earflaps` | helm_nasal, helm_kettle, cap_leather |
| `hood` (open at the face, onto the neck) | `peak` (none = a tighter mail coif) | hood_wanderer, coif_mail |
| `circlet`, `hat_wizard` | — | circlet_moon, hat_wizard |
| `shield` (`outline`: round / kite / tower) | `boss` | shield_round, shield_kite, shield_tower (`shield_heater` is its own shape) |
| `pauldron_bulwark` | `lames` (default), `spikes` | pauldron_bulwark, pauldron_spiked, pauldron_leather |
| `cape_wayfarer` | — | cape_wayfarer, cape_crimson (same cloth, new painting) |
| `tabard_flap` (anchor `belt` = pelvis) | `front`, `back` (one cloth sheet each; options `top`, `length`, `width`) | tabard_flaps_tower, tabard_flaps_stag |
| `tabard_top` (anchor `chest` = spine_03) | — (front + back panel, collar to belt; options `top`, `width`) | tabard_top_tower, tabard_top_stag |

**Tabards (round 4, 2026-11-23).** Slot `tabard` (between chest and hands in the dressing room). Three kinds of item:
front flap only (`only: ["front"]` — the footman's "bottom tabard", a reverse cloak), front + back flaps, and the
full WoW-style tabard (`attach: [<top>, <flaps>]` — chest + back panels on spine_03, flaps on the pelvis, so the chest
panel follows the torso). Shapes come from `torso_fit()` in tb_prop.py: rays from the front and the back of BOTH
bodies (the woman scaled by torso length, as her socket scales the prop) and `drape()` hangs each row straight down
from whatever bulges above it (chest, bust, belly, seat) — cloth never dips back in under a bulge, and each row spans
straight across (the first chest panel dipped between the pecs). The chest panel cinches into the belt over its last
9 cm, where the flaps carry on. The bake splits the flaps into nodes `front` / `back` (an item's `only` keeps some).
A new design = two props.json entries (top + flaps, same `build`, new `look`) + items; no code.
**Flap swing** (`place.hang.clear`, js/tabard.js `flapAll`): each flap hinges at its own top edge, hangs toward the
ground within `hang.min..max` degrees, and swings further out whenever a thigh or shin (spheres along thigh→calf→foot)
would come through it — out fast, back slowly. `place.cloth` (js/cloth.js, §2d) also works on flaps (attach() gives
each flap its own holder and its own `out`), but on 2026-11-23 a running thigh passed through its coarse grid and
the front flap ended up behind the leg; flaps stay on the swing until cloth keeps a sheet in front of a moving leg.

**Head props: seat + eye check (round 4).** `place.turn` (degrees the prop tips back about the side-to-side axis
through the middle of the head — front edge up, a hat pushed back off the eyes) and `place.lift` (metres up) are a
rigid move done in the socket, so the painting still fits: no repaint, no rebuild. `tb_prop.py -- check [id…]`
re-runs both head checks on the built props without rebuilding them (build runs them too): POKE (head through it)
and EYES (`build/prop_<id>_eyes.json`): rays from both eyes of both bodies — straight ahead, 15° to either side, 8° and
15° up (idle/walk hold the head 12–18° down, so a camera at eye level sees the face from above its own forward) —
must miss the prop. Eye centres come from `models/<body>_face.json` (the face layer's landmarks) or, without it, the
pupils found on the painted skin's front view. Closed helms say `place.coversFace: true` (reported, never failed).
Kettle helm: turn 18, lift 0.01; wizard hat: turn 18, lift 0.02 (both were 8/8 rays blocked).

**Add a helm variant:** 1) props.json entry: `name`, `kind`, `texture: 512`, `build`, `look` (what Codex paints — an
original design), `place: {anchor: "head"}` (+ `fitWidth: true` when the painter's height varies, e.g. crests);
2) `tb_prop.py -- build <id>` — prints triangles and **POKE** (head points of BOTH bodies through the prop;
`build/prop_<id>_poke.json`, tests fail above 5 mm); 3) look at the clay on a head before paying for paint (a
Blender preview: put `build/prop_<id>.blend` on the Head bone of each body's `_fit.blend`, scale head half-width/0.098);
4) `tools/sheet.py prop_<id>`, `node tools/paint.mjs prop <id>`, `tb_prop.py -- bake <id>`, `tb_prop.py -- sockets`;
5) items.json entry (`slot: head`, `attach: <prop id>`, `hidesHair: true` if it covers the back of the head);
6) qa.sh → `shots/qa/props_head_<body>.png`. A new *part* = a `part_<name>` function or a branch in its shape, and
the data test learns it automatically (it reads `"<part>" in parts` from tb_prop.py).
Rules learned: tight parts hug the head's real outline (`hug_ring` / `hug_point`, both heads — the woman's forehead
sits further out once scaled); a cap must start above the painted eyebrows (`brow` = 0.55 of the crown height);
flat brims droop ≥ 20° or the side views never see them (the bake skips faces seen at < 0.15); an open shell (hood,
hat, circlet) or a sheet (cape) must face OUT — `unwrap()` turns it outward, and a bake that reports a low "vertices
seen" share (hood 18%, hat 1%) means it faced in; a cape facing the body showed its inside painting on the back and
cut the strap notch out as a hole (2026-11-23, both capes; the cape's bow also curved into the back — now fixed).
fal one-handers come with 10–17 cm of handle below the grip; `js/tabard.js` slides those up so ~6 cm stays below the
fist (or an item's `gripShift`).

### 2c. fal.ai weapons on Tabard bodies
`tb_prop.py -- sockets` also writes `_grips` per body (palm_r, palm_l, forearm_l) with the SAME rule as
`avatar-3d/fal/tools/blender/sockets.py` (scaled by body height / 1.8 m), except the right-hand tilt is Tabard's 18°
(fal's 40° laid maces and axes along the forearm when swinging). `js/tabard.js` reads
`avatar-3d/fal/data/catalog.json`: every `kind: held` item is offered as `fal:<id>` (slot from its grip), and an
items.json entry with `fal: '<id>'` names one explicitly. New fal weapons appear with no change here. An entry KEYED
`fal:<id>` keeps the automatic id (games map to it) and adds options.
Options per item (round 4, 2026-11-23):
- **`hold: "pole"`** — staffs, spears, greatswords, great axes. Held on the `pole_r` grip (`_grips.pole_r`: the shaft
  straight through the fist at a right angle to the forearm — tilt 0; Tabard's own staff_oak has `place.tilt: 0`), and
  in the carrying clips (idle, walk, run, talk, crouch: `HOLD_CLIPS` in tabard.js) the elbow bends 70° forward and the
  wrist turns the shaft upright (8° forward, at most 60°), weighted by how much of the pose those clips make, so
  swings and casts keep the clip's own arm. fal weapons 1.2 m or longer, or held more than 30% up the shaft, get it by
  themselves; the Halfmoon Axe sets it. The pose runs after calm on the clean clip pose (lowerarm_r and hand_r are in
  `calmClean`, §6 rule 1).
- **`shrinkAbove: {k, from}`** — everything more than `from` metres above the fist (shaft + head) shrinks by `k`, the
  handle in the fist keeps its size (a geometry copy, cached). Thornhead Morningstar 0.65; Spiked Club 0.75, Bone
  Club 0.7, Rusty Cleaver 0.8 (the other oversized one-handers in the close-up sheet).
- **`turn`** — degrees about the item's own long axis. fal bows (left-hand grip) default to 180: their file has the
  string on +X and unturned the string faced away from the archer.
- **`only`** — the named parts of a prop (tabard flaps). **`attach`** may be a list of props (the full tabard).

### 2d. Hair + cloth (round 4, 2026-11-23) — code, no Blender
**Hair** (`js/hair.js`, `data/hair.json`): a style is a list of pieces in head angles — θ from straight up (0 crown,
90 ear height), φ round from the face (0) toward the character's left (+90) to the back (±180); lengths in metres on
a 20 cm wide head (scaled to the real one). Tune a style by editing its line in hair.json and looking at
`node tests/qa-hair.mjs <dir> male,female sheet`. Pieces and their main knobs:
| Piece | Knobs |
|---|---|
| `cap` | `line` hairline θ at 6 bearings [front, temple, sideburn, ear, behind ear, nape]; `lift` volume [crown, front, side, back]; `edge` `tips` (ragged strand ends) or `soft` (short fuzz fading out); `flow: back` (combed back); `tex` cap / curl / buzz; `part` φ of a parting; `noise` lumpiness; `wobble`; `outer` (over the ears) |
| `locks` | `at` [[θ, φ]…] or `row` {from, to, count, theta}; `length`, `width`, `lift`, `swing` (° off straight down the scalp, may be [first, last]), `hang` (how fast it falls), `curl`, `tex` lock / wave / tuft, `jitter` |
| `fringe` | a straight-cut curtain over the forehead: `span` [φ from, φ to], `top` θ (or [ends, middle]), `length`, `jag` |
| `spikes` | `at`/`row`, `length`, `width`, `up` (0 = out from the scalp, 1 = straight up), `tilt` (toward the nape) |
| `knot` | bun / top knot: `at`, `size` [w, h, d], leather tie |
| `fins` | curl outline fins on a curly shell: `rings` θ list, `count`, `height`, `lift` (= the shell's), `line` (none below it) |
| `tail` | SWINGS: `at`, `style` tail / braid / loc, `length`, `width`, `segs`, `dir` (start direction), `droop`, `mirror`, `pull` [root, tip] |
| `sheet` | SWINGS: a curtain `span` [φ from, φ to] (through the back when from < to), `top` θ, `length`, `rows`, `cols`, `flare`, `wave`, `taper`, `pinTheta` (held above this θ) |
Every piece may say `hat: 'drop'` (gone under a hat) or `hat: 'only'` (the tucked alternative), and `under: {…}` (its
knobs under a hat). Head items say `hair: 'hide' | 'under' | 'keep'` in items.json, or one per body
(`{ "male": "under", "female": "hide" }` — the kettle helm today: tipped back, its brim rests on the woman's nape). Budget: ≤ ~1.5k
triangles, 1 draw call, one shared picture.

**Cloth** (`js/cloth.js`): props.json `place.cloth` (or `true`) turns a prop's sheet into cloth; it wins over `hang`.
| Option | Default | Meaning |
|---|---|---|
| `pin` | `top` | which edge is sewn on: `top`, `top-front`, `top-back` (the same top edge; the name says where it hangs) |
| `pinRows` | 1 | grid rows held by the holder (2 = a stiff yoke) |
| `cols`, `rows` | 7, 9 | grid points (cost grows with cols × rows) |
| `down`, `out` | [0,0,-1], [0,1,0] | the sheet's top→bottom and away-from-body directions in the holder's frame (the capes' file convention) |
| `stiffness`, `topStiffness` | 0.002, 0.06 | pull back to the modelled shape per 1/120 s step, at the hem / under the seam |
| `damping`, `gravity` | 0.04, 9.8 | speed lost per step; m/s² |
| `colliders` | torso, pelvis, thighs, calves, arms | bone groups it slides over (`COLLIDER_GROUPS` in cloth.js: also shoulders, neck) |
| `margin` | 0.025 | metres kept off a collider (the grid is coarse) |
| `oneSided` | false | the sheet must stay on its `out` side of every collider: a point inside a limb OR in its shadow behind it is pushed back out to the front (for a sheet hanging in front of a leg) |
| `substeps` | 1 | physics steps per 1/120 s (2 for fast limbs) |
The prop's own vertices ride the grid (bilinear + their offset from it), so its modelled bow and see-through hem stay.
**Which pieces use it (2026-11-23):** both capes. The tabard flaps use `place.hang` with `clear` (they swing out of
the legs' way every frame, helper C). Trial of cloth on the front flap with `oneSided: true, substeps: 2, margin: 0.03,
cols 6, rows 9, colliders pelvis/thighs/calves`: no flap point inside or behind a leg in run, attack and walk on both
bodies (150 frames each), but sprint on the woman dipped up to 3.6 cm in 13 of 150 frames (the man 0.1 cm in 1) while
the hang version showed none — so the flaps stay on hang. Without `oneSided` the running thigh went straight through.
To retry: set `place.cloth` on `tabard_flaps_*` with those options and run the flap probe (front flap, run / attack /
walk / sprint, both bodies) before switching.

## 3. Bake + export
`tools/rebuild-body.sh <body…>` = swap-in pieces → fit → face layer → align + bake every painted outfit (+ `head`, the
bald repaint from `paint.mjs <body> head`, and `clay`, the light and shade) → `tools/head_clean.py` (plain-skin head in
every painting + `models/<body>/face.webp`) → export → prop places → publish textures (≈5 min for both bodies;
`SKIP_BAKE=1` for a mesh-only try; `UV=1` re-runs the texture layout first). Props: `tb_prop.py bake <id>`, then
`tb_prop.py sockets`. The bake treats the pre-fit hands as blockers (the painter drew them bigger).

## 4. QA — `tools/qa.sh` (≈6 min, dev server 8401 must be up). NEVER skip; `npm run test:unit` fails without it.
| Check | Tool | Catches |
|---|---|---|
| Mesh health | `tb_qa.py` | holes, inside-out faces, loose bits, stray objects |
| Proportions | `tb_measure.py` vs `data/proportions.json` | oversized hands, wrong head count, shoulders |
| Poke-through | `tests/qa-poke.mjs` | body through robe/cuffs in every clip; saves `build/qa_poke_*.png` at the worst moment, poking points in red |
| Turntables | `tests/qa-shots.mjs` | 9 angles × idle/walk per body × outfit → `shots/qa/` |
| Item close-ups | `tests/qa-props.mjs` | every helm/hat/pauldron/cape/shield/weapon (fal too), 4 angles → `shots/qa/props_<slot>_<body>.png` |
| Head clearance | `tb_prop.py build` / `check` POKE | head points through a helm/hat on either body (`build/prop_<id>_poke.json`) |
| Hair sheets | `tests/qa-hair.mjs` sheet | every hair style × body, front / side / back → `shots/qa/hair_<body>.png` (LOOK) |
| Hair under headwear | `tests/qa-hair.mjs` hats | a hair edge passing THROUGH any `under` head item, every style × body, after the tails settle (`build/qa_hair_hats.json`, ≤ 2 mm; report `hairHats`) |
| Hair + cloth stable | `tests/qa-hair.mjs` physics | 30–144 fps, a hitch, a 40 m teleport, roll / death / spin: nothing broken, tails within reach, capes on the back (`hairPhysics`) |
| Eyes clear | `tb_prop.py build` / `check` EYES | a brim or hat over the eyes seen from the front at eye level (`build/prop_<id>_eyes.json`, data.test.js) |
Then **look at every `shots/qa/*.png`**: numbers can't judge paint smears, props by the face, a cape sticking out.
Write each finding into the round's checklist, fix, rebuild, re-run. Send the owner before/after pictures.

## 5. What Claude can and cannot judge alone
- Alone, with a check: holes, see-through, poke-through, paint on the wrong part, props floating or inside the body,
  proportions against a written target.
- With a hint: whether proportions/posture *look* right — needs the owner's reference turned into numbers.
- Only the owner: taste ("too muscular", "WoW enough"). That is what the page's feedback button is for.

## Known limits (round 2, 2026-11-22)
- One-piece robe: a running heel kick / deep lunge still shows the ankle through the back (ceilings in qa-poke.mjs).
  Fix if wanted: a split skirt (front + back flaps).
- Pale streaks on leg sides and the woman's robe picking up the trouser seams: from the round-1 paintings; needs a
  repaint (robe as its own painting).
- Woman's shoulder joints are narrower than the reference (1.21 vs ~1.35 head-heights); widening means moving the
  skeleton — owner to decide.

## 6. Lessons — what went wrong and the rule that stops it (round 4, 2026-11-23, owner: "note our fixes in the workflow")
Each entry: the symptom the owner saw → the cause → the rule → the check that now catches it.
- **Arms spin in circles while lying down** → the "calm posture" turned the upper arms ON TOP of the bone's value, and
  three.js's mixer skips writing a bone whose blended value did not change (a held last frame), so the turn stacked
  every frame. Rule: any code that adjusts bones after the mixer must restore the clean clip pose first (`calmClean`
  in tabard.js). Check: `tests/qa-anim.mjs` "held death drift" must be none.
- **One frame of T-pose** → three.js fills missing clip weight with the bind pose; its crossFadeFrom only fades the
  last clip from full weight, so a clip change during another fade left the sum under 1. Rule: switch clips only with
  `avatar-3d/js/anim-blend.js blendTo` (every clip fades from the weight it has now) and call `mixer.update(0)` when a
  body is built. Check: qa-anim "lowest weight sum" must stay 1.000, and no jump > 45° on the first frame of a change.
- qa-anim runs inside `tools/qa.sh` (report key `anim`).
- **Skin colour on a painted body** (tabard.js `tintSkin`): only bare-skin pixels change — an outfit pixel that still
  equals the skin painting at the same texel is skin (outfits are edits of the skin painting, keep it that way: a
  repaint that shifts the skin tone breaks this test). Scale relative to the tone the skin was PAINTED in
  (`PAINTED_SKIN` = the games' 'Warm'), never a tone measured from one body part: measuring the torso turned faces a
  pale green, and splitting light from colour blew fair skin to white. Check: look.mjs shots of fair / warm / deep.
- **Streaks on the shoulder tops** (the woman's left shoulder) → two causes. (1) The torso box is unrolled round the
  spine like a tube, so the nearly flat shoulder tops got only a thin band of texture rows: whatever paint landed
  there was stretched outward into streaks. (2) The decimated body is lumpy, so next-door points faced 60° apart and
  the "best view" flipped point to point, interleaving two slightly misaligned paintings. Rule: a wrapped box must
  give a flat top rows for its real width (`tb_uv.py` `LIFT`: going out along the shoulder top moves down the box);
  the bake judges facing on neighbourhood-averaged normals (`smooth_normals=6`) and paints spots every view sees
  edge-on (best facing < 0.4) from their well-seen neighbours (`grazing`). Check: look.mjs close-up from above each
  shoulder; `TB_DEBUG_FILL=1 tb_bake.py` paints the neighbour-filled spots magenta to see where they are.
- **A second eyebrow/eye smeared at the temple; eyes were holes with a picture over them** → the side views painted
  the brow and eye where the side camera saw them, and the bake blended that with the front view at the temple; the
  body has eye sockets but no eyeballs. Rule: the body painting's head is plain skin (bald, clean-shaven, no brows,
  no painted eyes — `tools/head_clean.py`, from the Codex bald repaint `paint.mjs <body> head`); eyes, brows, beards
  are drawn on the separate face layer (`face_layer` mesh, `models/<body>/face.webp`, `js/face.js`) and the eyeballs
  are 3D, placed from `models/<body>_face.json` (measured from the original modelled eyes, grown with the head).
  Check: `TB_FACE_SHOTS=1 tb_face.py <body>` → `shots/<body>_face_*.png` (landmarks as balls; eyeballs white in the
  sockets); `head_clean.py <body> --debug` → `build/<body>_head_clean_debug.png` (replaced = magenta, kept = green).
- **Filling a big area by blurring at a few sizes left rings and smears** → each blur size took over at a different
  distance. Rule: fill holes with a smooth membrane solved coarse to fine (`head_clean.py membrane`), and for large
  areas (a whole scalp) prefer a painter's repaint over any fill. Check: look at the head box picture, not only the 3D.
- **The robe started at the waist as a ledge you could see into** → its top ring stood 1.6 cm off the body and was
  open. Rule: a skirt-like piece starts INSIDE the body (a tuck ring 3.5 cm higher, 8 mm in) and its top takes the
  body's own bone weights (nearest body points), handing over to the leg weights over 3 cm; the cone below keeps its
  1.6 cm room for the legs and only the top ring comes in to 1 cm. Check: look.mjs at the
  hips (front, side, walking) + qa-poke.
- **A new mesh in the body file was taken for the body** (qa-poke's "every skinned mesh that is not `geo_`") → name
  the body explicitly (`o.name === 'Body'`) wherever code picks it; tabard.js gives `face_layer` its own material.
- **Staffs and two-handers lay along the upper arm** (owner 2026-11-23) → one grip rule for every right-hand weapon:
  the prop leans back up the arm by `tilt` (18° fal, 65° for the oak staff) so a hanging arm points it up — fine for
  a 70 cm sword, but a 1.7 m shaft then runs along the arm past the shoulder. Rule: long weapons are held at a right
  angle to the forearm (`pole_r` grip, tilt 0) and the arm is posed to carry them (`hold: "pole"`, elbow forward +
  wrist turned up, only in carrying clips, after calm on the clean pose). Check: look.mjs idle / walk / attack with a
  staff and a spear, both bodies; qa-anim with a staff equipped stays OK.
- **The bow was held backwards** → fal's bow file has its string on +X and the grip turned it away from the archer.
  Rule: a held item's facing is checked from the side (string toward the archer, wood away); fix with `turn` (fal
  bows default to 180). Check: look.mjs side view of bow_horn.
- **Kettle helm and wizard hat covered the eyes** → their brims droop 4–5 cm and start just above the brow, and the
  library's idle holds the head 12–18° down, so a camera at eye level looks at the face from above. Rule: every head
  prop must leave rays from both eyes clear — straight, ±15°, 8° and 15° up — on both bodies; fix a finished prop by
  tipping it back (`place.turn`/`lift`, a rigid move: the painting still fits). Check: `tb_prop.py -- check` (EYES) +
  data.test.js. Also: `Matrix.Rotation(+t, 'X')` tips the FRONT DOWN (-Y toward -Z) — the first try made it worse; the
  check caught it.
- **The mail legs had a tabard painted between them** → the outfit description asked for "a surcoat strip down the
  front", and a painted strip on the leg boxes splits between the legs. Rule: anything that hangs free (tabards,
  loincloths, skirts) is a separate piece (slot `tabard`), never painted onto the leg boxes; outfit descriptions say
  "pure … below the belt, no cloth strip". Check: look at the front view of every legs painting.
- **The mace head was too big** → fal makes weapons at its own scale. Rule: shrink the part above the fist
  (`shrinkAbove`), never the whole weapon (the handle must still fill the fist). Check: qa-props mainhand sheet.
- **Cloth on a flap let the thigh through** (cloth.js trial on the tabard flaps) → a fast thigh crosses a coarse grid
  between steps. Rule: a sheet hanging in front of a leg needs a hard guarantee (the flap swing pushes it out of the
  leg's way every frame); use cloth for sheets that hang behind (capes). Check: look at run frames from the side.
- **Shared head-check eye points came from the painting first** → detecting pupils on the painted sheet one side at
  a time picked the man's brow. Rule: search both eyes as a mirrored pair, dark pupil with light eye-white beside it;
  prefer the face layer's landmarks (`models/<body>_face.json`) when present.
- **Hair lessons (round 4, hair + cloth track):**
  - *A tail and a cape stood out like boards* → each point was pulled back to its modelled shape by 2–12% a step, but
    gravity moves a point only ~0.7 mm per 1/120 s step, so the pull won. Rule: rest pulls on swinging things are tiny
    (tails 0.8% → 0.04%, cloth 6% → 0.2%); shape comes from the sticks and the pinned root. Check: tails hang in the
    hair sheet; capes in the run strip hang off the back.
  - *A curly cap and its nape flared onto the shoulders (a "mullet" point)* → the scalp was measured as the farthest
    skin along each ray; below the skull the rays pass behind the neck and hit the upper back 20 cm out. Rule: farthest
    HEAD skin, else the nearest neck skin, and below the skull the scalp may not grow > 1 cm per 5°. Check:
    `qa-hair` sheet back views; the scalp table (θ 120–150 at the back stays ≤ ~14 cm).
  - *Hair checked "through the hat" that was really hanging below an ear flap* → testing points ("is it past the hat
    seen from the skull?") flags hair that comes out from UNDER a rim. Rule: the check counts hair EDGES that cross a
    hat triangle (a real crossing). Check: `qa-hair` hats.
  - *Tails and curtains went through brims* → pressing each point radially inside the hat leaves triangles spanning
    the hat's edge, and the 5° hat grid smoothed a brim away. Rule: under a hat, tails/curtains/buns START below the
    rim (`K.below`), the hat's grid errs inward (nearest of 4 corners, coverage grown 10°), swinging points collide
    with the hat's inside each step with room for their width, a rim lying on the skin pushes hair under the skin
    (hidden), and a tie is never half-tucked. Check: `qa-hair` hats (both bodies, every under-item × style).
  - *Under a wide brim the tails were pulled up into the head* → seen from inside the skull, hair hanging BELOW a
    brim is also "behind" it. Rule: a tail / curtain / bun under a hat STARTS below the last angle where the hat is
    within 3 cm of the scalp, by its own half-width more (never below the base of the skull, 140°); tucking then
    only has to catch swinging points that wander back up. Check: `qa-hair` hats + LOOK at tails under the kettle.
  - *Tucked tails flew metres away* → `rest.map(press)`: Array.map passes the index as press's second argument (the
    extra room), so point 3 was pressed "3 m inside" the hat and came out on the other side. Rule: never hand a
    function with optional arguments straight to map/forEach; wrap it (`p => press(p)`).
  - *A thick ponytail's tie still reached into the rim* → roots placed at the rim line ignored their width. Rule:
    roots and buns start half their width further down (`K.below(…, half)`).
  - *Tails stretched 40% when spun* → 3 solver passes for a 9-point chain. Rule: 6 passes for hair (cheap: few
    points); collide once per step, not per pass (6× cheaper, same look). Check: `qa-hair` physics reach.
  - *Strand tips looked like a comb* → single strands ending at random lengths. Rule: clumps of strands gather into a
    point at their own length (`hair-paint.js paintStrands`). Check: the long curtain's hem in the hair sheet.
  - *A bob / bangs flared out like a bell* → curtains hung straight down from the widest point of the head. Rule:
    short curtains hug the head (`hang` 0.5, `flare` < 0) and straight-cut bangs are one `fringe` curtain, not
    separate pointed locks (those read as tentacles).
  - *A cloth flap in front of a running thigh ended up behind it* → the leg pushes points out along the SHORTEST way;
    a thigh that moves past a point's middle pushes it out the back. Rule: a sheet in front of a limb collides
    one-sided (`oneSided`: inside or in the shadow behind = back out to the front). Check: the flap probe above; the
    flaps stay on hang until sprint is clean too.
- **A texture-layout change moved the poke-through numbers with no change in shape** → qa-poke counted every copy the
  file makes of a point along texture seams, so a new layout changed the share. Rule: checks count each body point
  once (by position), and a piece's deliberately hidden part (the robe's tucked top) is left out of its shell. The
  robe ceilings were re-based on the new counting (old robe: run 19.7 / attack 16.9 / walk 4.6 %, man). Check: when a
  number moves, measure the previous model file with today's check before calling it better or worse.
- **A skin-coloured patch on the shoulder tops of mail and robes** → the head box (always painted from the bare skin:
  no armour slot owns it) reached down past the neck onto the shoulder slope, because the neck's cut plane tilts
  forward. Rule: below the Head bone only points within the neck's own width are "head" (`tb_uv.py` `NECK_R`, with
  clean upright cuts there), and the lower half of the neck's FRONT belongs to the chest box (collars and coifs paint
  it; a horizontal cut at mid-neck); a box no slot paints must hold only skin that every outfit really shows. Check: `tb_regions_look.py <body>` and a look.mjs
  close-up of the collar in mail and a robe.
- **Faces are a layer, not paint on the body** (js/face.js, round 4). Eyes are real eyeballs in the sockets with lid
  caps (the lid edge height + tilt IS the eye shape; they blink); brows, beards, marks are drawn on the face mesh's
  own texture from `models/<body>_face.json` landmarks. Rule: never paint features into the skin painting (a feature
  baked into the body can't be changed, and side views duplicate it — the doubled brow at the temple). Check: the
  face look sheet (tests/look.mjs with `look`) for every option on both bodies.
- **Cloth that lives in the skin painting** (the bare under-clothes) matched "same as the skin painting" and turned
  brown on deep skin. Rule: `tintSkin` also asks that the pixel be warm (red well above blue) and not near-black.
  Check: a deep-skin look on the Bare set keeps a cream top.
- **Comb-teeth hairline**: a full band of pointed strand tips round the hair cap made a regular comb over the
  forehead. Rule: tips short over the forehead (`tipK` in hair.js buildCap), full length from the temples back, plus
  a soft fuzz band on the front edge; the face layer also paints a fading hairline in the hair colour underneath.
  Check: forehead close-ups of short styles.
- **A partial look wipes the rest**: setting only `{ hair }` dropped the face back to nothing. Rule: start any
  partial change from `api.look || defaultLook(body)`.

