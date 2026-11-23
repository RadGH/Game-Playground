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
still fit — `shapes.json <body>.fit`).

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
items.json entry with `fal: '<id>'` names one explicitly. New fal weapons appear with no change here.

## 3. Bake + export
`tools/rebuild-body.sh <body…>` = swap-in pieces → fit → align + bake every painted outfit → export → prop places →
publish textures (≈1 min for both bodies; `SKIP_BAKE=1` for a mesh-only try). Props: `tb_prop.py bake <id>`, then
`tb_prop.py sockets`. The bake treats the pre-fit hands as blockers (the painter drew them bigger).

## 4. QA — `tools/qa.sh` (≈6 min, dev server 8401 must be up). NEVER skip; `npm run test:unit` fails without it.
| Check | Tool | Catches |
|---|---|---|
| Mesh health | `tb_qa.py` | holes, inside-out faces, loose bits, stray objects |
| Proportions | `tb_measure.py` vs `data/proportions.json` | oversized hands, wrong head count, shoulders |
| Poke-through | `tests/qa-poke.mjs` | body through robe/cuffs in every clip; saves `build/qa_poke_*.png` at the worst moment, poking points in red |
| Turntables | `tests/qa-shots.mjs` | 9 angles × idle/walk per body × outfit → `shots/qa/` |
| Item close-ups | `tests/qa-props.mjs` | every helm/hat/pauldron/cape/shield/weapon (fal too), 4 angles → `shots/qa/props_<slot>_<body>.png` |
| Head clearance | `tb_prop.py build` POKE | head points through a helm/hat on either body (`build/prop_<id>_poke.json`) |
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
