# Chibi 2

**Chibi 2 is the flagship Avatar 3D model** (2026-09-24). The original procedural Chibi (`mii.js`)
and the Quaternius mesh mode (`quaternius.js`) are **deprecated**: they stay on the avatar page,
labelled as such, only so the three can be compared. Nothing new is built for them.

## Chibi 2.5 contracts (2026-10-16) — read before touching any chibi2 file

Chibi 2.5 is the improved cartoon Chibi 2 (same low-poly style, same two draw calls). It is built by two agents at once:
**part A = the head** (face, eyes, brows, mouth, nose, ears, facial hair, face marks, hair, hats-vs-hair-vs-face fitting,
blinking + looking, the face/hair builder options) and **part B = the body** (bodies, clothes, robe-vs-feet, outfit/gear
clipping, body builder options). Rules both follow:

1. **The flag is in the look: `avatar.body.v = 2.5`** (a number; `body` keeps unknown keys through the shared 2D
   normaliser, so it survives Farhold's/Emberveil's normalise-then-build path and is part of the template cache key).
   `createChibi2Character(avatar, { v25: true })` is the same thing for a caller that does not want to touch the look.
   `isV25(a)` in `js/chibi25-options.js` (pure, no Three.js) is the one test: `Number(a?.body?.v) >= 2.5`.
   Inside the builders: `const V25 = rig.v25` (set by `acquire()`).
2. **A look without the flag builds byte-for-byte what it built before.** `tools/chibi2-v2-baseline.mjs` hashes 209
   looks (all Emberveil classes, presets, tier-1 outfits, every original face id, six hats x six hairs) into
   `tests/fixtures/chibi2-v2-hashes.json`, written at commit 4c8f8b1f BEFORE any 2.5 edit; `tests/chibi25.test.js`
   fails if one hash moves. Every 2.5 change goes behind `V25`. Never rewrite the fixture to make a test pass
   (`--force` exists for a deliberate v2 change the owner asked for).
3. **New part ids** go in `avatar-2d/js/parts/chibi2-parts.js` with `bespoke: true` (so the seeded 2D random roll —
   and every game's random NPCs — never hands them out and stays the same). `index.js` now merges every face slot
   (hair, eyes, brows, nose, mouth, ears, extras) from `CHIBI2_2D` too. Ids are listed for games, with names and
   groups, in `js/chibi25-options.js` (`CHIBI25_OPTIONS`) — a game exposes them explicitly; nothing is added to an
   existing game's lists.
4. **Rig.** v2 keeps its 22 bones in the same order. A 2.5 rig APPENDS bones at the end (part A: `eyelidL`,
   `eyelidR`; since 2026-10-21 round 2 children of the HEAD, at the line a blink closes to). Names starting `eye`/`pupil` are skipped by the clip builders. Part B
   appends its own after A's if it needs any, and documents them here.
5. **Files.** Part A owns `js/chibi2-face.js` (its v2 path untouched; 2.5 goes to `js/chibi25-face.js`),
   `js/chibi25-hair.js`, `js/chibi25-options.js` (part B adds its own body lists in the same file under
   `CHIBI25_OPTIONS.body`), the hair block and the eye controller (`blink`, `lookAt`) in `js/chibi2.js`. Part B owns
   `js/chibi2-body.js`, `js/chibi2-gear*.js`, `js/chibi2-motion*.js`. In `chibi2.js`'s `buildTemplate`, A edits only
   the face/hair/hat lines, B only the body/gear lines.
6. **Builder page**: `avatar-3d/chibi25.html` + `js/chibi25-app.js` (part A). It shows v2 and v2.5 side by side
   with face/hair options, a blink/look demo and stats. Part B adds its body controls in `<section id="c25-body">`
   from its own module `js/chibi25-body-ui.js`, which the page imports if present
   (`export function mountBodyUi(section, { get, set })` — `get()` returns the current look, `set(look)` rebuilds).
7. **Measuring hook**: `createChibi2Character(look, { trace: [] })` pushes `{ tag, bone, positions }` for every piece
   (bind space, before merging), tagged by the build stage (`body`, `face`, `hair`, `hat`, `gear`, `armour2`,
   `gear5`, and finer tags a builder sets with `c.tag('…')`). The clipping tests read it. No cost when not passed.
8. **Budgets**: still two meshes (cloth + metal); a 2.5 character stays under the same triangle budgets as v2
   (8,500 for a class look). No per-frame geometry rebuilds, no material/light toggles (see the shader-recompile note).

### Who uses 2.5, and building one without a long task

* **Thousandvale draws every person as Chibi 2.5** since 2026-10-16 (owner: "Yes go with the 2.5 for Thousandvale"):
  one switch, `prototypes/thousandvale/js/client/chibi-version.js` (`createTvBody` passes `{ v25: true }`; `?chibi=2`
  in the URL is the debug escape). Farhold, Emberveil and Bannerline are still Chibi 2.
* `prepareChibi2(look, { anims, v25, mannequin, slice, budget })` (opt-in, `js/chibi2.js`) bakes a template a few clips at
  a time, awaiting `slice()` whenever `budget` ms (default 8) of work have passed, and parks it in the template cache
  with no references, so the next `createChibi2Character` with the same look and options is a cache hit. Same rig, same
  clips, same key as a direct build (`rigFor` is shared by both). A 2.5 robed template with Thousandvale's ~90 clips is
  80-150 ms of baking in one go; sliced, the largest single step measured 36-56 ms (the mesh build, `buildTemplate`).

## Chibi 2.5 part A — the head (2026-10-16)

Owner: "audit the hair and facial decorations to be more accurate, fix clipping issues… keeping the low poly cartoon
models" and "add more eyes, blinking, ability for pupils to look around, more character builder options". Everything
here is behind the flag (`body.v = 2.5`); a v2 look is byte-identical (contract 2).

| File | What |
|---|---|
| `js/chibi25-face.js` | the 2.5 face: `EYE25` (24 eye shapes as outlines), `eyeSpec25` (pure numbers the controller shares), `addEyelids` (the two lid bones), `buildFace25` (ears, eyes, brows, nose, mouth, beards, marks, worn-on-face) |
| `js/chibi25-hair.js` | the 2.5 hair (`buildHair25`, one function per style in `STYLES` since hair pass 2 — see below), `HAT_FIT` / `hatFit()` (where each headwear covers), `HAIR_COVERS_EARS`, `HAIR25_STYLES` |
| `js/chibi25-eyes.js` | `EyeDriver25`: blinking, idle glances, `lookAt`, all bone moves |
| `js/chibi25-options.js` | `CHIBI25_OPTIONS` (every id, the new ones, menu names, the extra fields, ears per race), `isV25`, `asV25` |
| `js/chibi25-clip.js` | the clipping measure (direction maps from the head centre; a front-view depth grid) |
| `chibi25.html` + `js/chibi25-app.js` | the builder: Chibi 2 and 2.5 side by side, every face/hair option, blink / look demo |
| `chibi25-sheet.html` + `js/chibi25-sheet.js` | contact sheets: one row per id, 2D picture + front / 3/4 / side (`?slot=hair&v=2`, `&hat=wizard`, `&only=new`, `&blink=1`, `&look=1,-0.5`) |
| `tools/chibi2-v2-baseline.mjs` · `tools/chibi25-clip-report.mjs` · `tools/chibi25-shot.mjs` | v2 hash fixture · hair x headwear / brows report · page screenshots |

### The game API

```js
const actor = await createChibi2Character(look, { v25: true });   // or look.body.v = 2.5
actor.lookAt(enemy.position, { head: 0.35 });   // world point; head 0..1 = how much of the turn the head takes
actor.lookAt(null);                             // back to idle glances
actor.setGaze(0.8, -0.3);  actor.setGaze(null); // pupils pushed to a fraction of their room
actor.blink();  actor.setBlink(0.5);  actor.setBlink(null);
actor.eyes      // { v25, blink, gaze: [x, y], looking, limits: [x, y] }
```

Blinks come on their own every 2–5.5 s (about three in ten seconds; one in six doubled), 0.17 s long; lids drop a
little when the eyes look down; `dead` and `sleep` shut them; `eyes.blink = false` in the look turns blinking off. All
of it is the eyelid bones' y scale and the pupil bones' x/y (plus a smoothed head turn for `lookAt`) — no geometry
rebuild, no material or light change: `tests/chibi25.spec.js` counts `linkProgram` calls over three seconds of blinks
and looks and requires zero. The lid is the eye's own outline drawn shut, domed (in front of the iris, back to the face
at its rim), lit with the head's normals; it hangs from a bone at the top of the outline, so it closes over every
shape — sleepy, narrow, cat and dot eyes too. `happy` (and wink's winking eye) are the 2D picture's closed arcs and do
not blink. Gaze limits come from the white minus the iris, so the iris never leaves the white.

### Fields 2.5 reads (no registration needed — fields survive the normaliser)

`eyes.pupil` (round, slit, dot, star, heart, cross, ring, none), `eyes.iris` (normal, large, small, ring, none),
`eyes.white`, `eyes.colorR` (odd eyes), `eyes.blink`; `brows.thick`, `brows.color` (default now the DARK hair shade,
as the 2D picture draws it); `ears.scale`; `facialHair.color`; `hair.color2` (ties, tips: twin tails, locs, braids).

### New ids (all `bespoke` in `avatar-2d/js/parts/chibi2-parts.js`)

* **eyes (9)**: cat, doe, droopy, sharp, button, sparkle, hooded, lashes, heart
* **hair (10 + 13)**: undercut, topknot, high_ponytail, twin_tails, messy, pompadour, locs, long_braid, mullet, side_swept; hair pass 2: crown_braid, side_shave, wolf_cut, half_up, ribbon_loops, cornrows, warrior_braids, feathered, curly_bob, puff, rolled_tail, bowl, court_cut
* **brows (7)**: bushy, unibrow, slanted, soft, split, dots, curved · **mouth (8)**: laugh, cat, pout, gritted, wavy, buck, fang, shark
* **nose (3)**: pointed, round, flat · **ears (6)**: long_pointed, swept, notched, small, cat_ears, wolf_ears (on top of the head; hidden under crown hats)
* **facial hair (6)**: mutton_chops, handlebar, van_dyke, short_beard, forked_beard, sideburns
* **marks (10)**: freckles_nose, beauty_mark, scar_brow, scar_lip, war_mask, chin_lines, tear_mark, star_mark, moon_mark, blush_soft

### Audit (contact sheets, v2 vs 2.5) — what was wrong and what 2.5 does

* Hair: **bun / buns** were built inside the hair cap (invisible) → on the crown. **afro** sat forward over the eyes →
  back and up. **long** read as short from the front → face-framing curtains to the shoulders. **bangs** splayed out
  like petals → a blunt-cut sheet. **buzz** had a slab over the brow and a bare back → tight cap with a hairline and a
  back. **mohawk** had sideburn locks floating on the shaved scalp → stubble-shade sides. **tonsure** had no bald crown →
  a ring cap. **horns_hair** had no horns → horns. Outer fringe locks curled out like horns → hug the temples.
* Brows/fringe: every fringe ended ON the brows and the cap's front edge sat over their tops → the fringe stops above
  `browTop` (reported by the face), the hairline is raised at the front, and brows are the dark hair shade.
* Eyes: **almond** was a round eye → pointed corners; **narrow** a round eye under a bar → a lens; **hollow** was a pale
  teal disc → a dark socket with a small glowing point; **happy / wink** ("Closed happy") were open eyes → the closed arc.
* Mouth: **sad_open** ("Wail") was a round O → an arch with a flat base; **open** was the same as the wail → a D with
  upper teeth and a tongue; **smirk** was nearly level → one-sided; **tusks** sat on the lip and read as fangs → rise from
  under the lower lip.
* Facial hair: **goatee** carried a moustache the 2D one does not (the moustache + goatee is the new van_dyke);
  **long / braided** beards hung at the chin's depth into the collar → pushed out over the chest (`chestZ`).
* Marks: **scar** ("Scar (eye)") was a cheek slash → brow to cheek, skipping the eye; **warpaint** was the cheek
  stripes → a band across the eyes and a forehead line; **eye_black** ("Blackened eyes") were bars → dark rings;
  **tattoo** was a cheek spiral → a temple line; **face_glyphs** → forehead cross + cheek chevrons; **brand** moved to the
  forehead; **pale** did nothing → the skin is paled; **nose_scar** was too small to see. Forehead marks sit in front of a
  fringe. `soot` stays as chibi2-gear.js draws it.
* Ears: **fins** were one cone (the same as pointed) → a fan of spines with webbing. Normal ears are hidden under hair that
  covers them (long, wavy, bob, shaggy, locs, side swept, twin tails); pointed ears poke out through it.

### Fitting under headwear (`HAT_FIT`)

One rule instead of per-pair patches: a hat says where it covers — a `shell` down to a brim line (front and back
heights), a `band` at a height, `hood`, `noHang` (pelts and mail hoods tuck hanging hair away) — and every hair vertex
in a covered region is pressed inside the hair cap's own surface (which every hat is built to clear). Hair below the
brim still hangs (a ponytail under a wizard hat is kept, not dropped as in v2). Bands pinch the hair under them,
easing out over 0.12. Unlisted `g5_` and future headwear get a generic shell from the id. Measured over 720 hair x
headwear pairs (`tools/chibi25-clip-report.mjs`): mean share of hair vertices outside the hat **7.8% (v2) → 0.8%
(2.5)** (pairs where the hat covers at least 30 hair vertices); brows hidden by any fringe, seen from the front, ≤ 5% for every style. Accepted: a crown or a band sits ON an
afro / pompadour / spikes.

### Cost

Same two draw calls (one if a look has no metal), +2 bones. Emberveil class looks switched to 2.5: mean 6,887 → 6,609
triangles, max 8,180 → 8,355 (budget 8,500, asserted). The eyes cost a few multiplies per character per frame.

### Verify

`node --test avatar-3d/tests/chibi25.test.js` (v2 hashes, flag, every id registered/bespoke/building, blinking,
looking clamps, hair x every headwear, brows under fringes, beards over the chest, class budgets) and
`flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/tests/chibi25.spec.js` (the builder page, no shader
compiles while the eyes move). Not done: the v2 face is not tagged per feature, so the brow-under-fringe number has no
v2 "before" figure; hair under a crown on an afro is left sitting on the hair.

## Chibi 2.5 hair pass 2 (2026-10-16)

Owner: "Continue on improving the existing hairstyles and fix floating parts, see-through edges, and add more original
hair styles (stop reusing the same top front decorations)." Still v2.5 only (a v2 look is byte-identical: the 209
hashes pass); same two draw calls.

**What was wrong with part A's hair** (measured, `tools/chibi25-xray.mjs` + `tools/chibi25-hair-audit.mjs`): the cap and
the back were open sphere segments whose rims stood up to 2 cm off the skin, every lock was a tube with an open root,
and every lock's END CAP was wound inside out — so from the back, the top and below you looked straight through the
hair (the material is front-side only). Seen-through pixels over eight angles, the 30 older styles together:
**15,248 → 525** (bald alone scores 16: the brows and lids are hair-coloured). Six styles shared one seven-lock
fringe, four one combed set, two one blunt sheet.

**How it is built now** (`js/chibi25-hair.js`, one function per style in `STYLES`, helpers in `buildHair25`):

* `shell({ edge, hole, t })` — the hair laid ON the skull, read off the same head rings the face is built from
  (`headRings`), so it fits every head shape and race. `edge(phi)` is the hairline height at each bearing
  (`hairline({ f, t, sb, e, b, n, skew })`: forehead, temple, sideburn, over the ear, behind it, nape); the edge rows
  dive 1.2 cm under the skin, so there is no rim to look past. The pole is one point. `SAG` (9 mm) keeps a stubble shell
  outside the skull's 20-sided rings and ring creases (they poked through as skin flecks at 5 mm). The forehead
  triangles are split off as the style's FRONT (`hair:front`), normals computed first so there is no seam.
* `strand(pts, widths)` — a flattened ribbon lying flat on the head, both ends capped (wound opposite ways), the side
  direction carried from ring to ring where the strand points straight out (spikes, brush tufts twisted inside out
  before), and lifted 0/5/10 mm in turn past its root so neighbouring ribbons never share a surface.
* `slab({ ph, y, lift, thick })` — hanging hair as a closed solid (walls on four sides); `braid()` beads that overlap.
* Points come from `S(phi, y, lift)` (a point on the scalp at height y, bearing phi) and `T3(theta, phi, lift)`, never
  fixed numbers on a round head.
* Fit rules added: `flower` is a `spot` (hair under the flower lies flat); a helm whose back brim is under 0.25 (war
  helm) tucks hair hanging by the cheeks; a lowered hood (`backPad`) tucks hair hanging down the back.

**New styles (13, all `bespoke`, each with its own 2D picture):** crown_braid (Braided crown), side_shave (Side shave),
wolf_cut (Wolf cut), half_up (Half-up knot), ribbon_loops (Ribbon loops), cornrows, warrior_braids (Warrior braids),
feathered (Feathered), curly_bob (Curly bob), puff (Top puff), rolled_tail (Rolled tail), bowl (Bowl cut), court_cut
(Court cut). Part A's ten new styles had 2D pictures that were aliases of older ones; each draws its own now.

**Fronts, one per style:** buzz squared hairline · short tousled locks to the right · side_part deep left part sweeping
right · bangs blunt slab · bob arched fringe with a rolled hem · long curtain bangs from a centre part · wavy off-centre
S-waves · ponytail combed grooves + one loose temple strand · bun swept UP to the bun · buns centre part split to two
buns · mohawk solid fin curling forward · spiky spikes standing up off the hairline · curly a row of curls · afro a
rolled rim · braids zigzag part + wings · pixie feathery wisps to the left · slicked combed straight back · hood_hair
(Shaggy) uneven points · tonsure rolled monk fringe · horns_hair jagged out-curling locks · undercut comb-over lifted at
the front · topknot high hairline, grooves converging on the knot · high_ponytail two face-framing strands · twin_tails
sawtooth · messy upward cowlicks · pompadour quiff · locs short locs at the temples · long_braid French braid from the
forehead · mullet flat-top brush · side_swept one big swoop · crown_braid the braid over the forehead · side_shave long
flop to the right · wolf_cut heavy V-point fringe · half_up strands tucked behind the ears · ribbon_loops split fringe,
forehead clear in the middle · cornrows row starts · warrior_braids widow's peak ridge · feathered wings flicked back ·
curly_bob short corkscrews · puff swirled baby hairs · rolled_tail two rolls either side of a part · bowl thick rim ·
court_cut sparse wisps. The test fingerprints every `hair:front` piece and fails if two styles share one.

**Measured** (all 43 styles + bald): floating pieces 0 (gap to the scalp or a neighbour chained back to it ≤ 5 mm),
inside-out pieces 0, open edges in the air 0, coincident surfaces 0 (> 3% within 0.2 mm facing the same way), shared
front pieces 0; seen-through ≤ 25 px over bald on every style. Hair x headwear: 1,036 pairs, mean poke-through 7.61%
(v2) → **0.42%** (part A: 0.8%). Budget: every style on the heaviest class look (warrior, no hat) is under 8,500
(highest: warrior_braids 8,403, feathered 8,379, cornrows 8,341, locs 8,331); Emberveil class looks max 8,355.

**Tools and pages**: `tools/chibi25-hair-audit.mjs` (per-style floating / flipped / open / z-fight / front
fingerprints), `tools/chibi25-xray.mjs ids [png]` (see-through counts), `chibi25-sheet.html?slot=hair&views=all`
(eight angles: front, three quarters, side, back three quarters, back, other side, top, below) and `&xray=1` (back faces
of the hair painted magenta, hair drawn green); the sheet page has links to these at the top.
**Tests**: `node --test avatar-3d/tests/chibi25-hair.test.js` (~70 s) and
`flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/tests/chibi25-hair.spec.js`.

**Not done / left**: hair is still only skinned to the head (and the chest for hanging pieces) — a hanging curtain can
separate from the cap a little in a big nod, which no test measures in motion; curls and braids are low-poly beads by
design; the bowl and the braided crown read slightly hat-like from the side.

## 2026-10-21 owner review — overview (lead)

The owner reviewed the Avatar 3D page and the Armory and sent ~50 reports. Three agents did the head, the clothes and
straps, and the weapons (the three sections below); the lead did the rest:

* **Two root causes.** The Avatar 3D page built **v2** looks, so every 2.5-only id (eyes cat…heart, brows after Bushy,
  mouths from Laugh on) fell back to a v2 part and looked identical — the page and the Armory now build 2.5. And the
  character material was front-faces-only, so every open shell (hair, a hat's underside, collars, hems) was see-through
  from behind or below: `SkinBuilder.finish()` (chibi2-geometry.js) now makes it `side: THREE.DoubleSide` — same draw
  calls; coplanar inner "lining" copies were removed or pushed inward by the agents so they do not flicker.
* **Pages.** Avatar 3D is Chibi 2.5 only, with a "Chibi 2.5 details" panel drawn from `CHIBI25_OPTIONS.fields`;
  `chibi1.html` (archived Chibi 1) and `chibi2-v2.html` (the old v2 build, for comparison) are showcase pages;
  Quaternius is gone from the repo; Chibi 3/4 are labelled on hold. Armory: "Auto adjust camera", two-handers main hand
  only, a burning flame on a held torch / cresset (`attachHeldFlame`, `js/held-flame.js`).
* **Shoes: the sole ring is gone** (owner, same day: "a ring around the bottom that isn't connected to the shoe … could
  just be outright removed"). Boots / shoes / pointed / heavy had an open dark band a few mm off the foot all the way
  round, sandals a leather one, heavy boots a steel one; all three are deleted in `chibi2-body.js`. The g5 shoes' rings
  are straps and cuffs that touch the boot, and stay.
* **`V2_BODY_FIXES = true`** (chibi2-body.js): the body-wide fixes (arm-top holes, the neck gap, the V-neck, lines laid on
  the chest) reach v2 too, so Farhold / Emberveil / Bannerline lose the holes as well. What keeps `chibi2-v2.html`
  distinct is the v2 face, hair and proportions. Both fixtures (`chibi2-v2-hashes.json`, `gear5-baseline.json`) were
  re-baselined on purpose after all of this.

* **The two-handed rule was scaled back the same day** (owner: "Can the new two handed rule only apply if an off hand
  is actually blank? … side effects for some weapon combinations"). Nothing is dropped or refused any more —
  `offhandAllowed()` is always true and `applyHandsRule()` returns the look unchanged (both kept for callers); the
  two-handed GRIP is taken only when the off hand is empty (`holdFor().twoHand`, and the lute's
  `luteHold(p, strum, fret, leftFree)`: with something in the off hand only the right arm holds the lute). The Farhold
  and Thousandvale equip-rule changes and their tests were reverted; the catalog's `offhandToo` is back as it was
  (`hands: 2` stays accurate for every bow, crossbow, staff and lute). The weapons section below describes the
  withdrawn version under W11.
* **Eyepatch (same day):** the eye under the patch is not built at all — white, iris, pupil, lashes and the blink lid
  (`chibi25-face.js`, the eye loop skips `PATCH_SIDE`) — so nothing can clip through it or blink under it. The patch
  moved to the character's LEFT eye (`PATCH_SIDE = -1`, screen-left in a front view), the eye the 2D picture patches.

## 2026-10-21 owner review — head

The owner reviewed the Avatar 3D page and the Armory. Most of what he saw was the **v2** build (the page built v2 looks,
so every 2.5-only eye/brow/mouth fell back to v2 and the v2 hair showed its old holes); the page now builds 2.5. What
changed (2.5 face/hair unless it says "shared"; shared headwear moves v2 hashes on purpose):

* **Stubble and chinstrap are painted, not sheets** (`chibi25-face.js`, F1). They were sheets lifted 3-5 mm along +z;
  under the jaw the skin faces down, so there was no gap and they z-fought in flecks. A texture would need UVs and a
  texture in a pipeline that is all vertex colour, so the head shell is built finer for these two looks (rings every
  0.028 below the cheekbone, 28 sides) and each vertex takes skin / beard / a blend through the new opt-in
  `SkinBuilder.add(..., { colorAt(x, y, z, i) })` (`chibi2-geometry.js`). Thick beards stay geometry.
* **Hook nose** is one curved piece (the hump was a second ball on top, F2).
* **Eyes are turned to the face** (F3): `addEyelids` turns each eye bone (y) to the face's slope at the eye
  (`rig.eyeYaw`), and `hug()` bends the outer part of every eye piece (rim, white, lashes, lids, lash wings) back onto the
  skin, so the outer corner and the wing no longer stand off a face that has curved away (almond's "floating bit"). The
  white and rim are `domedSheet`s with inner rings (a ShapeGeometry only has outline vertices); lids are only bent
  OUTSIDE the eye's outline so a lid always stays in front of the iris. The outline has 12 points a side (was 14) to keep
  the eye's triangle count level.
* **Distinct eyes** (F4): cat (narrow lens, strong up-tilt, slit pupil, flick), droopy (a resting lid falling to the outer
  corner), sparkle (big star + second twinkle, darker iris rim). Each 2.5-only eye differs at a glance on
  `chibi25-sheet.html?slot=eyes`.
* **`glow_tear` removed** (F5): data files use `glow`; `normalizeAvatar` maps it through `RENAMED_PARTS`
  (`avatar-2d/js/render.js`) and `eyeSpec25` too, so an old saved look keeps glowing eyes.
* **`eyes.height`** (F6): a slider 0.7 (flat) .. 1 (as drawn) .. 1.35 (tall) scaling every eye's height (iris, gaze
  limits, lids, brows follow). Listed in `CHIBI25_OPTIONS.fields.eyes.height`; `EYE_HEIGHT` in chibi25-face.js.
* **Brows** (F7): `curved` is a thin high crescent (it read as arched), the unibrow's bridge overlaps both brows; new
  **`bold`** brow (thick at the inner end, tapering).
* **Tusks** (F8) are cones from a base sunk in the lower lip to a tip in front of the upper lip.
* **`storybook` eye** (F10, the reference picture): iris filling most of the eye with a darker rim, bold upper lash with a
  short wing, a big and a small highlight. Pairs with the `bold` brow, a small nose and `eyes.y` > 0 (eyes lower). Both
  ids are `bespoke` with 2D pictures (`chibi2-parts.js`). A bigger step would be a painted face texture (UVs on the head
  shell + a per-character atlas), which this low-poly vertex-colour pipeline does not have.
* **Hair** (H1, H3, H4): the 2.5 hair (hair pass 2) was audited again from eight angles for every style: see-through
  counts are at the bald baseline (12-43 px of 8 x 170 px views; bald 17), tops closed, nothing floating. Bob, long wavy and
  the human wayfarer's side part are closed from above. The v2 hair is unchanged (Farhold/Emberveil/Bannerline).
* **Headwear, shared** (H2, H5-H8): `wizard` sits 0.06 lower on a crown that clears the skull, with a closed brim and a
  darker underside (`HAT_BRIM.wizard` 0.445, `HAT_FIT.wizard` shell [0.445, 0.4], armour2 `BROW.wizard`); `helmet` joins
  `HATS_COVER_CROWN` and v2 `spiky`/`mohawk` no longer build under a crown-covering hat; `war_helm` cheek guards are curved
  plates hanging from the brim in front of the ear; `wolf_helm` has a dark hide lining, closed paws and a pelt tail that
  ends in a point (a tube is open at its ends); `chain_coif` is mail: a finer lattice whose rows alternate lighter and
  pushed out ~5 mm (a per-vertex checker swirled along the quads' diagonals), mantle the same.
* **Worn on the face, 2.5** (H9-H11): sized from the look's own eyes (`eyes.height` included) and built in the eye's
  turned plane. Eyepatch: domed, edge on the skin, a strap over the ear, round the back and across the forehead.
  Blindfold: covers both eyes and their lash wings, ties above the ears with a knot. Glasses: rectangular frames, arms
  from each frame's outer edge back over the ear; round glasses / sunglasses / monocle share the arms. Goggles: cups sized
  to the eyes reaching back to the skin, a broad strap round the back.
* Material is DoubleSide since this review (`finish()`); the remaining hat linings are 0.6-1% inside their shells and
  showed no z-fighting in the sheets.

Moved fixtures (deliberate, not rewritten): v2 hashes `class:oracle` (glow_tear -> glow in the data), `preset:12`
(wizard), `outfit:warrior` (war_helm), `outfit:druid` (wolf_helm), `hat:wizard:*`, `hat:war_helm:*`, `hat:chain_coif:*`,
`hat:cap:spiky`, `hat:wide_brim:spiky`; `gear5-baseline.json` rows `hat:wizard/helmet/chain_coif/war_helm/wolf_helm` and
the class looks wearing them. Tools: `chibi25-sheet.html` takes `&zoom=`, `&dy=` (camera aim) and
`&set=path:value,...` (any base-look field; write `#` as `%23`).

### Round 2 (owner, 2026-10-21, the page now builds 2.5)

* **Marks removed**: `nose_scar` ("Scar across the nose"), `tattoo` ("Face tattoo"), `soot` ("Soot smudges") — out of the 2D
  parts, `CHIBI25_OPTIONS`, both face builders and `chibi2-gear.js` `buildMarks`, Thousandvale's appearance list and the
  library's NPC decal list. `RENAMED_PARTS.extras` (`avatar-2d/js/render.js`) maps an old saved look to `none`. Data:
  `soot` -> `dirt` (avatar-2d presets, chibi2-presets, farhold classes + mercenaries, emberveil class-looks / enemy-looks /
  named-enemies, library defaults, the two emberveil build tools, chibi2-races weights); `tattoo` -> `none`. The 2D
  `dirt` is now just "Dirt".
* **Every face mark is a DECAL cut out of the head shell** (`decal()` in `js/chibi25-face.js`), not a disc or tube in
  front of the face. A mark is a shape (signed distance in head units: `P2.disc/stroke/poly/union/minus`); the shell's
  own triangles under it are kept, split only where the cut line CURVES (or where a feature smaller than a triangle could
  hide: `minEdge` = the layer's smallest feature), and clipped exactly along the edge; the pieces sit 3 mm out along the
  skin's normals with the skin's normals, so they light as the skin does, follow the face round the jaw and lie UNDER the
  eyes, brows and mouth (war paint and blackened eyes can no longer clip them). Straight edges are exact at any size,
  curves are chains of short cuts, so edges are crisp (M3) for a few hundred triangles a mark. A soft mark (blush, dirt,
  rot, burn, eye black, cheeks) is two crisp steps (45% outside, full inside). Stubble and the chinstrap are decals too
  (round 1's painted shell was "very blurry") and stop at the front of the ear. Painting into the shell's vertex colours
  with an adaptive mesh was tried first: crisp edges needed thousands of triangles a mark. Only the third eye is still a
  shape, laid along the forehead's slope. Forehead marks now lie under a fringe, as skin does. `war_stripe` is painted
  all the way round on a 2.5 face (chibi2-gear.js still builds its band for v2).
* **Blink = the eye closes** (M5): the controller (`chibi25-eyes.js`) squashes the EYE bone toward a line a third of the
  way down the eye (`spec.squashY`), so nothing of a blink can ever show outside the eye's outline, and an open eye has
  no lid sheet on it (the old domed lid pulled down as a circle bigger than the eye, and a glance down left it as a thin
  oval at the top). `eyelidL/R` are now children of the HEAD at that line (contract 4 still holds: appended after the 22
  v2 bones) and carry only the shut eye's lash line, which grows in over the last 40% of the close. Eye bones keep their
  rest position in `userData.rest`.
* **One hug for every eye piece** (M6): round 1 bent the white and rim back onto the face but not the lids, lash lines or
  iris, so from the side the lid and its line hung in front of the eye. `hug()` is now a function of position only and
  every piece takes it (iris, pupil and highlights too), so depths relative to each other never change.
* **Resting lids** (M4, M8: angry, sleepy, tired, hooded, droopy): a grid over the eye's own outline (tilt included — a
  tilted eye's corner used to come out above the half-disc lid) from the lid's edge up, reaching 20% past the outline,
  in the exact skin colour with the skin's normals; high only over the white and iris, down to the rim at the outline and
  to the skin at its outer edge — the face folding over the eye, no disc, no step, no darker rim.
* Budget: Emberveil class looks max 8,306 (warrior); stubble on the tinker costs ~330.

## Chibi 2.5 part B — the body (2026-10-16)

Owner: "fix clipping issues, improve the robe clipping with feet running animation, but keeping the low poly cartoon
models" and "more character builder options". Same flag (`body.v = 2.5`, contract 1); every v2 look is byte-identical
(the 209 hashes pass) and every v2 clip is unchanged (a multiplier that is 1 on a v2 rig is the only touch in the
shared clips).

| File | What |
|---|---|
| `js/chibi25-body.js` | skirt bones: `longGarment` / `needsSkirt`, `addSkirtBones`, `skirtWeigh` (the `weigh` for SkinBuilder), `registerSkirtSurface`, `driveSkirt` (per baked frame), `strideFor` + `capShin` (the robe stride), `race25` + `applyBody25` (body options) |
| `js/chibi25-motion.js` | opt-in clips `CHIBI25_MOVE_ANIMS` = sprint, backpedal, strafeL, strafeR (+ `moveClipFor(forward, right)`) |
| `js/chibi25-outfits.js` | new clothes `TOP25` / `BOTTOM25` / `SHOE25` / `CAPE25` (`OUTFIT25`), and `ROBE_LOOKS` (one look per long garment, for the test and the sheet) |
| `js/chibi25-body-options.js` | `CHIBI25_BODY_OPTIONS` (= `CHIBI25_OPTIONS.body`): `SHAPES`, `POSTURES`, `TAILS`, sliders, race tails, the new clothes |
| `js/chibi25-body-ui.js` | `mountBodyUi(section, { get, set })` — the Body + Outfit controls on `chibi25.html`, and buttons that load the robe strips / outfit sheets / body options into a frame there (its own page, so the blink/look demo is untouched) |
| `chibi25-body-sheet.html` + `js/chibi25-body-sheet.js` | `?mode=robe&garment=robe&clip=run` (side-on stride strip, Chibi 2 row over 2.5 row), `?mode=outfits&set=classes|t1|t2|tv&clips=idle,walk,run,attack` (one row per class look), `?mode=bodies` |
| `tools/chibi25-measure.mjs` | builds a real character, keeps its pieces, skins them on the CPU per frame: `robeCheck` (feet vs cloth) and `clipCheck` (gear vs body) |
| `tests/chibi25-robe.test.js` · `tests/chibi25-clip-body.test.js` | the robe test and the gear-vs-body count (below) |

Edited (behind `rig.v25` / `rig.skirt`): `chibi2-geometry.js` (SkinBuilder `weigh` option, 4 influences),
`chibi2-body.js` (garment weights + tags, waist room, coat tails, plate sides, tails, limb thickness, `rig.armSpread`),
`chibi2-gear.js` (capes on skirt bones, capelets/feathers/fur on the arms, half-cape shoulder, `long_cloak`, `scarf`),
`chibi2-motion.js` (`driveSkirt` + skirt scale tracks in `createClips`, `rig.stride` in walk/run/jump, guard tweaks),
`chibi2.js` `acquire` (race25 + skirt bones + stride, `{ v25: true }`), `chibi25-options.js` (one import),
`avatar-2d/js/parts/chibi2-parts.js` (new ids, `bespoke`), `data/gear-catalog.json` (rebuilt: 14 new rows).

### Robe vs feet

THE LESSON (Chibi 4 step 6) holds here too: weighting cloth to the thighs fails because the two thighs swing opposite
ways (a front vertex on both moves by their average, zero). What works is both of:

1. **Skirt bones** — `skirt0..7`, appended after part A's eyelids (bones 24-31), children of `hips` at the hip
   pivot, built ONLY for a 2.5 look that wears something long (robe family, knee hems, coats/trench, skirt/kilt/
   loincloth, long capes). Cloth below the pivot is shared by the two bones nearest its direction, handed over from its
   own bone between 0.08 m above and 0.16 m below the pivot (capes: 0 to 0.22 m below, from the chest). On every baked
   frame `driveSkirt` works out where both knees, shins, ankles, toes, heels and thighs are (forward kinematics of the
   frame's own pose) and tilts each bone just far enough that the cloth — modelled exactly as linear blend skinning
   will draw it — stays 4 cm outside every leg point above the hem, or lifts its hem over the point (a foot showing
   under a hem is allowed). Where no tilt reaches (a thigh in a saddle, under the belt) the bone SPREADS (x/z scale
   track). Search: steps of 0.1 rad then 0.02, curves cached per 5 degrees x tilt on the surface.
2. **The robe stride** (`strideFor`, read by walk/run/jump/sprint/backpedal/strafe through `rig.stride`): floor
   length keeps 62% of the thigh swing and 55% of the heel kick, knee hems/coats/skirts 78%/72%, long capes 95%/75%;
   `capShin` also caps thigh + knee (1.3-1.7 rad), the forward thigh (0.66-1.2 rad) and keeps the heel at least
   0.17 m under the hip pivot (a goblin's short leg at a sprint kicked it up to the belt, where nothing can cover it).

Plus room: a 2.5 robe/kilt/coat is 2.5 cm deeper at the hip line (more on short legs, wider for thick legs), the long drop has three more
rings, and the coat's left tail exists (Chibi 2 built both tails on the same arc — the left side had none).

**Measured** (`tools/chibi25-measure.mjs`, human; worst gap, minus = through the cloth):

| garment | Chibi 2 walk / run / jump | Chibi 2.5 walk / run / jump / sprint / backpedal / strafe | 2.5 ride / sit |
|---|---|---|---|
| robe, trim robe, cassock | -21 / -33 / -17 cm | +2.8 / +2.7 / +2.8 / +2.6 / +2.7 / +2.2 cm | -1.2 / -1.5 cm (v2: -30 / -33) |
| dress | -3.9 / -33 / -15 | +3.3 / +3.3 / +3.5 / +3.4 / +3.4 / +2.8 | -0.2 / -0.6 |
| surcoat | -8 / -33 / -15 | +3.2 / +3.0 / +3.1 / +3.0 / +3.2 / +2.7 | -1.0 / -1.5 |
| trench | -27 / -35 / -21 | +2.4 / +2.4 / +2.4 / +1.8 / +2.5 / +2.1 | 0 / +3.2 |
| coat | -12 / -34 / -20 | +3.2 / +3.1 / +3.2 / +3.1 / +3.2 / +2.8 | +0.3 / -0.4 |
| skirt, long skirt | -3 to -23 / -33 to -35 | +2.6 to +3.2 everywhere | -1.0 to -1.4 |
| kilt | -12 / -35 / -20 | +1.2 / +1.3 / +1.3 / +1.2 / +1.2 / +0.7 | -2.6 / +0.7 |
| loincloth | -1.4 / -35 / -3 | no leg inside a flap's reach | — |
| capes, travel cloak, long cloak | ok / -13 / ok | +18 to +29 (the hem lifts off the kicked heel) | — |

`tests/chibi25-robe.test.js` (node, ~1 min): all 15 garments x all 9 races x 10 clips, plus 16 body extremes
(height, width, roundness, legs, every shape, both corners) x 3 races x 11 garments on the 7 ground clips — **zero
pokes on any ground locomotion frame**; seated (ride, rideGallop, sit) no vertex more than **3.5 cm** out (the top of a
thigh straddling a saddle sits right under the belt). Mount/dismount clips do not exist in Chibi 2, so there is none
to test.

### Clipping audit (gear vs body)

`clipCheck` stands the body in with solids just inside the skin (85% head / torso / hips, 80% limb radius, limbs
starting 6 cm down from the joint) and counts vertex-frames of held items (vs head, torso, hips, legs, the other arm),
shoulder pieces (vs head), chest gear — capes, capelets, quivers, packs (vs arms), hip gear (vs forearms, hands) and
breastplates (vs upper arms). The contact sheets (`chibi25-body-sheet.html?mode=outfits`, all 30 class looks, the
tier-1/tier-2 tables and Thousandvale's Starcaller/Starblade, read-only) were read at idle/walk/run/attack/guard/cast.
Emberveil class looks over idle, walk, run, attack, ready, guard, cast, jump, hit (frames with a hit):

| pair | Chibi 2 | Chibi 2.5 | fix |
|---|---|---|---|
| capelets / feather mantle / fur mantle / half cape vs upper arms | 1,998 | **0** | wider over the shoulders; the cloth over each shoulder rides that arm (up to 95%); the half cape's shoulder lump is on the arm bone |
| held item vs head | 79 | **2** | guard: a one-hander is held further out and less across (the mace no longer sits in the face); a caster's item (lute, book) at the chest, not the face |
| breastplate vs upper arms in ready/guard with a two-hander (dragon knight) | 5.5 cm | ≤ 3 cm | the hands meet on the haft further forward, the upper arms less across the chest |
| breastplate vs upper arms (deepest) | 3.5-5.5 cm | 2-2.5 cm (= the arm against the chest itself) | the plate shell stands off the FRONT only, and plate/scale wearers hold their arms 0.12 rad wider |
| chest gear vs forearms | 94 | 127 | not fixed: forearms crossing in front of a capelet's hem in attack/guard (≤3 cm) |
| held vs thigh | 9 | 10 | not fixed: the oracle's staff / tinker's gear at the thigh in run/jump (≤4 cm) |

### Body options (2.5 only, all on `avatar.body`)

`shape` (average, slim, athletic, broad, stocky, heavy, petite, lanky — multipliers on the race), `shoulders`, `legs`
(length against the torso), `arms` (thickness) — 0..1 sliders, 0.5 = the race; `posture` (neutral, upright, proud,
relaxed, slouch, hunched — added to the race's lean); `tail` + `tailColor` (wolf, cat, fox, lizard, imp; beastkin
offer the wolf first); `height` maps over a wider range on 2.5 (legs 0.7-1.3 instead of 0.8-1.2; 0.5 is the same).
New clothes (any body; long hems want 2.5): tops cassock, gown, bodice_dress, hauberk, duster, brigandine; bottoms
long_skirt, pleated_skirt, wide_trousers; shoes knee_boots, ankle_boots, soft_boots; capes long_cloak, scarf.

### Cost

Same two draw calls. A 2.5 look with nothing long: +2 bones (part A's lids). With something long: +8 skirt bones
(32), 8 more quaternion + 8 scale tracks per clip, ~36 more triangles for the robe's extra rings. Template build with
Farhold's whole clip list (~90 clips): a plain look 55-70 ms either way; a robed look ~140-270 ms on 2.5 against
~55-80 ms on v2 (the skirt drive runs on every baked frame; templates are cached per look). Triangles: Emberveil
class looks mean 6,887 (v2) / 6,609 (2.5, both parts), max 8,355 (budget 8,500).

### Verify

`node --test avatar-3d/tests/chibi25-robe.test.js avatar-3d/tests/chibi25-clip-body.test.js` (the second holds the table
above: capes vs arms 0, held-in-head ≤ 3 frames and ≤ 1.5 cm, plate ≤ 3 cm, and checks that v2 really had the problems); `node --import ./avatar-3d/tests/three-register.mjs
tools/chibi25-measure.mjs [--races=human,goblin] [--only=robe] [--worst]` (the table above); the v2 hashes
(`tools/chibi2-v2-baseline.mjs --check`). Not done: seated clips keep up to 3.5 cm at the belt line; the two "not
fixed" rows above; there is no mount/dismount clip to check.

## Chibi 2.5 round 2 — the owner's Starcaller redesign (2026-10-17)

The owner painted over an in-game screenshot of his Starcaller (`ref25/r2-starcaller-current.png` -> `ref25/r2-starcaller-reference.jpg`):
"largely the same but the colors look better, the eyes fixed some clipping around the top eyebrows". 2.5 only; the 209 v2
hashes are unchanged.

| change | where |
|---|---|
| **Brows clear the eyes.** The brow started 0.03 above the eye's top, so angry/slanted/thick brows pressed onto the lash line. Its lowest edge (end dip x 0.6, because the ends sit over the eye's curved-down corners, minus 0.6 x thickness) now stays 0.022 above the eye; at least 0.035 for any brow. Kept small on purpose: the fringe ends at `browTop`, and a 0.02 lift on every brow pushed a bowl cut through a circlet (the CLIPPING test caught it) | `js/chibi25-face.js` brows block |
| **Bold lash line.** The plain `line` lash is thicker over the outer half with a small outward flick, in near-black `#221a1a` | eyes block, "lashes" |
| **Softer eye rim** (skin -0.24, was -0.35): the redesign has no dark ring round the eye, the lash is the line | eyes block, the rim |
| **Darker, thinner-looking mouth**: the lip colour is mixed 60% toward `#4a2420` | mouth block |
| **Colour grade** `grade25()`: every vertex colour gets 16% more saturation, done on the display (sRGB) values — in linear light it turned skin yellow — then warmed slightly (r x1.02, b x0.975), with darks lifted (gamma 0.9) so navy reads as blue at dusk | `js/chibi2-geometry.js` `finish()` |
| **Matte cloth**: roughness 0.97 (was 0.82), envMapIntensity 0.55, so the sky stops laying a pale sheen over clothes and skin. Metal unchanged | same |

Not changed: nose and boots are per-character options (the redesign's smaller nose is the owner's own pick), and the
redesign's soft painted shading is beyond a two-draw-call vertex-coloured mesh.

## Tier-2 class armour and emblems (2026-10-05, Thousandvale play-test 4 S18) — opt-in

"A second tier of armour for every class with iconography (flames, lightning bolts, poison drops…)."
`js/chibi2-armour2.js` (called by chibi2.js right after `buildGear`, same context) draws two opt-in things;
a look that names neither builds exactly what it did before (`tests/class-outfits-t2.test.js` runs
`buildArmour2` over every tier-1 outfit and every Emberveil class look and asserts it adds nothing).

* **Emblems** — `top.emblem` (+ `emblemColor`) puts the icon in relief on a backing disc on the chest and on
  the back (on a long cape if one is worn — `cape` / `travel_cloak` / `tattered_cape` — else on the body);
  `hat.emblem` puts it on the helm brow (`BROW` table of brow points per hat). 24 shapes, extruded 2D
  outlines with a lighter/darker detail layer (`EMBLEMS`, `EMBLEM_IDS`): flame, bolt, drop, blood, frost
  (alias snowflake), sun (alias sunburst), skull, leaf, rune, moon, eye, hourglass, fist, note, cog (alias
  gear), arrow, sword, shield, cross, claw, coin, feather, star, crown. The extra fields survive the shared
  normaliser (it `Object.assign`s a slot), so they need no registration.
* **Five tier-2 decor kits** (registered in `avatar-2d/js/parts/chibi2-parts.js`, 2D draws the nearest kin):
  `t2_pauldrons` (layered plate pauldrons with three trimmed lames, a crest fin, a gorget, the emblem on each
  shoulder), `t2_mantle` (a high flared collar behind the head, gem-set shoulder caps with the emblem, a stole
  down the front tipped with it), `t2_harness` (one great leather pauldron, a baldric whose buckle IS the
  chest emblem, bracers), `t2_vestments` (a long trimmed tabard front and back with the emblem on it,
  shoulder caps, a cord belt), `t2_wildmantle` (a fur ring with horns and tufts in the emblem colour).
  `decor.color` is the kit, `decor.color2` its trim. A kit replaces the class's tier-1 decor.

**Data** — `data/class-outfits-t2.json` (built by `node tools/build-class-outfits-t2.mjs`): a complete tier-2
outfit for all 30 classes (the tier-1 table has 24). Emblem, trim and glow follow Thousandvale's
`data/rules/armour-tiers.json` class themes (warrior flame, mage frost, necromancer bone/skull …) so a preview
and a dropped themed piece agree.

```js
import { loadClassOutfits2, dressAs, tier2Dress, isTier2Item } from '../../avatar-3d/js/class-outfits.js';
const t2 = await loadClassOutfits2();
const portrait = dressAs(avatar, t2.pyromancer);                       // the whole tier-2 outfit
const worn = tier2Dress(gearLook, t2.pyromancer, { chest: true, head: true, emblem: 'flame', trim: '#c8461e', emblemColor: '#ffae42' });
isTier2Item(item)   // look.tier, else a theme, else a numeric tier >= 2, else item level >= ITEM_TIER2_LEVEL (15); never rarity alone
```

Gallery: `armour2.html` (`?view=pairs` tier 1 vs tier 2 for every class, `&back=1` the backs, `?view=emblems`,
`?view=kits`). Cost: +1,000–2,800 triangles a character (budget asserted < 16,000). Not done here: the emblem
on a SHIELD face (the off-hand grip was being reworked in the same round — `chibi2-weapons.js`).

## Class outfits and the 2026-09-25 look fixes

**Class outfits** — `data/class-outfits.json` + `js/class-outfits.js` (no Three.js). An outfit is only
clothes, headwear and carried items for one of the 30 classes, so any body can be dressed as any class:

```js
import { loadClassOutfits, dressAs } from '../../avatar-3d/js/class-outfits.js';
const outfits = await loadClassOutfits();
const look = dressAs(avatar, outfits.paladin);               // a copy; the avatar is untouched
const clothesOnly = dressAs(avatar, outfits.mage, { hands: false });
```

The Chibi 2 page has a **Class outfit** picker that dresses whichever preset is showing. Every id in the
file survives the shared 2D normaliser (`tests/class-outfits.test.js`). Farhold draws each class's
starting armour from these (its `js/classwear.js`).

**All 32 classes (2026-10-22).** The two classes that exist only in Thousandvale — the Starcaller and the
Star Blade — have their tier-1 rows in `data/class-outfits.json` and their tier-2 rows in
`data/class-outfits-t2.json` (hand-made, star emblem, kept as `LITERAL` in `tools/build-class-outfits-t2.mjs`).
They used to live only in Thousandvale's `data/class-outfits-tv.json`, so no gallery showed them; that file
now holds only `wear` (how those classes cut the armour they wear — see `armour2.html?view=wear`).
For a page that lists classes, `loadClassRoster()` returns `[{ id, name, game, avatar }]` for all 32
(Emberveil's 30 class looks + Thousandvale's `classes-tv.json` looks dressed in their outfit); the Avatar 3D
page ("Classes (all games)"), the Chibi 2.5 builder and the body sheet use it.

**New headwear** (`js/chibi2-hats.js`, `CLASS_HATS`, dispatched by chibi2.js BEFORE its generic
`/helm/` dome — any id containing "helm" used to become the same grey bowl): `war_helm` (nasal, cheek
guards, mail curtain — warrior), `great_helm` (closed barrel, eye slit, gold cross — paladin),
`plate_helm` (bascinet, raised visor, sallet tail, plume in `color2` — knight), `wolf_helm` (druid),
`bone_headdress` (feather fan + horns; hair stays out — shaman), `rune_helm` (glowing rune band in
`color2` — runesmith), `tricorn` (tactician). The horned helm is the fighter's alone. `gi` is a new top
(the monk's fitted wrap jacket). All are registered in `avatar-2d/js/parts/chibi2-parts.js`.

**Fixes that change every character, in every game:**

* **Inside-out clothing.** `profile()` (chibi2-geometry.js) faced outward only when its rings climbed.
  Legs, upper arms, tunic hems, skirts and robes are written top-to-bottom, so their outer walls were
  culled — skin showed through trousers, a tunic's hem through greaves, and a robe could be seen
  straight through. The winding now follows the direction the rings run. Write rings in whichever
  order reads best.
* **No zero-length normals.** `SkinBuilder.add` gives any vertex with a zero normal (a closed ring, a
  point) the direction out from its piece's centre; a zero normal lights to NaN and a bloom pass will
  smear one NaN pixel over the screen.
* **Bob haircut.** Its lining was cloned after the shell was placed (`add` moves geometry in place), so
  it was placed twice and floated above the head. Clone first, then add.
* **Hair under helms.** `HELM_BRIM` flattens the hair cap under a helm's rim instead of dropping it, so
  no band of scalp shows between the back hair and the helm.
* **Blades.** The two straight edge stripes stuck out past every tapered point; they are gone.
* **Torch** rebuilt down −y past the fingers (it ran up the forearm into the shoulder) and stood up by
  `REST_PITCH.torch`. **Bow** tipped forward at rest so the upper limb clears the forearm.
  **One-handed hafted weapons** (hammer, mace, axe, scepter) carried head-up at rest instead of hung by
  the boot.
* **Overhead** is one backward circle: the blade trails down and behind as the arm rises, goes over the
  head and comes down in front. It used to lift slowly up through the front and chop in 0.05 s, so what
  anyone saw was the lift. Measured by `tests/chibi2-looks.spec.js`.
* **Goblins** are shorter (head 1.18 → 1.02, legs 0.72 → 0.62): the big head cancelled the short legs.

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

## Play-test 4 (2026-10-05, Thousandvale): foci held up, second wands, four new weapons

- **S6 — a focus stands up out of the fist.** The orb, reliquary (`relic`), effigy (`idol`) and the new `tv_ward` /
  `tv_totem` are built up the hand's +y, which is the way to the ELBOW, and their left-hand kind (`orb`) had no grip turn,
  so they lay back along the forearm. `chibi2-motion.js` `base()` now gives `gripL` a quarter turn about x for that kind
  (+y onto the hand's +z) and `carry()` holds the forearm out level, so the focus stands upright on the fist in every clip.
  Global fix (Farhold's R25 foci use the same ids and had the same fault); shields, books and torches are unchanged.
- **S15 — any wand in the off hand.** `HELD_WEAPON_IDS` (chibi2-weapon-ids.js) no longer drops the `wand` kind, so an
  off-hand `fh_wand` is built by the main-hand builder on the left hand instead of falling through to the shield builder.
  `holdFor` already gives it `left: 'wand'` (REST_PITCH.wand). Farhold never puts a wand in the off hand, so nothing moves there.
- **S17 — four more silhouettes**, `avatar-3d/js/chibi2-weapons-tv.js` (new file; chibi2-weapons.js stays `fh_`-only,
  which Farhold's round17 test enforces): `tv_scimitar` (blade), `tv_warpick` (two-handed, pick spike on -z), `tv_club`
  (haft, spiked), `tv_glaive` (one-handed polearm, edge -z). Catalogued in `FARHOLD_WEAPON_INFO` (so the grip-rule test
  covers them) and dispatched by `buildFarholdHeld`, which lends the kit's part helpers in as `K`. Two caster foci in
  chibi2-gear.js `buildOffhand`: `tv_ward` (a rune ring with a hovering crystal) and `tv_totem` (three carved faces).
  All registered in avatar-2d `chibi2-parts.js` (a new `held` slot section; avatar-2d `parts/index.js` merges `held` now).
  Thousandvale's `js/client/gear-look.js` maps every loot-pool base to a model (`HELD_BY_BASE`, `OFFHAND_BY_BASE`; old
  Emberveil `look.held` ids are swapped for their kit model), checked by `prototypes/thousandvale/tests/D/weapon-models.test.js`.

## Play-test 4 (2026-10-05, Thousandvale): mounts (S22)

Riders are unchanged (`ride` / `rideGallop` in `CHIBI2_MOUNT_ANIMS`, `seatRider`). What a Chibi 2 rider sits on changed:
the hoofed mounts (horse, pony, courser, warhorse, stag and the new dray elk) are built by `js/equine.js` — lofted barrel /
neck / head, jointed legs with hooves, mane and tail, tack cut from the body's own surface, and walk / trot / gallop leg
patterns with a crossfade. The seat is still on the hip, counter-scaled, ~0.04 m above the saddle's back, so a rider's hips
land where they did. 2026-10-06: necks thickened (`neckK` 1.12-1.5) and legs a touch heavier after the screenshot pass so
the horses stop reading as pipe-cleaners under a big-headed rider. See README "Mounts" for the details and `node --test avatar-3d/tests/mounts.test.js`.

## Grips and paired weapons (2026-10-06, Thousandvale play-test 5)

**The fault.** "Dual-wielded daggers are held 90 degrees wrong — not by the handle." A held item is modelled running
straight out of the fist along the forearm (`-y` in hand space) and the GRIP bone's rotation is what turns it into
something a fist could hold. Two things left that rotation wrong:

1. `aim()` points a weapon in the CHEST's frame. Whenever the forearm happens to point the same way as the aim, the
   handle lies along the forearm and hides in the wrist, and the blade seems to grow out of the knuckles. Worst case:
   daggers at `ready` (forearm level, blade straight forward — 17 degrees apart).
2. Every strike written for the main hand returns an aim for `R` only. For the length of that clip the second weapon
   had NO grip rotation and lay along the left forearm like a spike strapped to the wrist — every swing a dual
   wielder makes.

**The fix (chibi2-motion.js — shared by every game).**
- `fistGrip(p, side, 'idle' | 'ready')`: a fixed turn of the grip RELATIVE TO THE HAND (46 / 63 degrees), so the
  weapon rides the fist wherever the arm goes. Daggers are carried this way in `idle`, `walk`, `run` and `ready`.
- In `poseAt`, a hand that holds a weapon and was given neither an aim nor a grip gets `fistGrip` (a staff, bow,
  torch or crossbow gets its rest pitch). A clip may return `aims.L = false` to say "I set the grip myself".
- `REST_PITCH.blade.ready` -1.85 -> -2.1 and `wand.ready` -1.5 -> -2.0 (both were nearly in line with the forearm).
- A two-hander in EACH hand: the right one is now shouldered at rest like the left (it hung at the hip pointing back).
- A staff may be an off-hand weapon (`HELD_WEAPON_IDS`): a second staff used to fall through to the shield builder.

**The rule, as a test** (`prototypes/thousandvale/tests/D/grips.test.js`, node, no browser): for every held id in
`FARHOLD_WEAPON_INFO`, the original vocabulary and every `g5_` id, in BOTH hands — the handle crosses the fist on the
grip line (`x = 0, z = 0.055`, y from -0.07 to 0), the weapon runs along y, the head is at -y; and for eleven pairs of
weapons — no clip leaves a weapon hand without an aim or a grip, and in every carrying clip (and in the waiting hand of
every strike) the weapon stands 25-165 degrees off its own forearm. `sampleClip(rig, name, u)` is the hook it uses.

**New clips, opt-in** (`avatar-3d/js/chibi2-motion-dual.js` — importing it registers them through
`registerClips`; a character only builds the ones its `anims` list names; all 14 cost ~2 ms per template):

| List | Clips | For |
|---|---|---|
| `CHIBI2_DUAL_ANIMS` | `dualSlashR`, `dualSlashL`, `dualCross` | two one-handers: main-hand cut, off-hand cut, both |
| | `dualStabR`, `dualStabL`, `dualFlurry` | two daggers: forward-grip thrusts, and three fast ones |
| | `twinChopR`, `twinChopL`, `twinCrash` | a two-hander in each hand: one off its shoulder at a time, then both |
| `CHIBI2_ANGLE_ANIMS` | `fishCast`, `fishWait`, `fishReel`, `fishShow` | angling — HANDS-FREE; the game parents its own rod to `handR` (`ROD_MOUNT`) and its catch to `handL` (`CATCH_MOUNT`) |
| `CHIBI2_REVIVE_ANIMS` | `standUp` | getting up from the `dead` pose: chest off the ground, a knee under, upright |

`dualAttackFor(hold, { hand: 'main' | 'off', step })` names the clip for a swing (every third main swing is the
"both" clip); `dualAttackByCount(hold, n)` alternates main / off / main / off / both for a game that is not told whose
turn it is. Both return `null` when the hands do not hold a pair (play `attack`). `R` is the MAIN hand in this rig —
it sits at +x, which is the character's own left when it faces +z.

Look at them: `prototypes/thousandvale/tests/D/pages/hands.html?cfg=[…]&cam=q` (served by the playground's dev server)
lays out any list of `{ held, offhand, anim, u }` bodies frozen at a point of a clip.

### A gait carries a one-fist weapon IN the fist (2026-10-15, Thousandvale play-test 11, #62/#63)

`aim()` is a chest-frame direction, so in `walk`/`run` the solved wrist cancelled the whole arm swing: the sword hung at
one angle while the fist pumped ("does not rotate with the hand"), and run's point sat 53 degrees below level. **Rule:**
in a gait, a `blade`/`haft`/`wand` (either hand) is aimed once against the arm at the clip's neutral phase (u = 0) and
that grip turn is kept for the whole cycle (`lockToFist`, pitches in `GAIT_LOCK`; the clip's aim becomes `false`, so
the follow-through pass does not re-aim it). Staff, polearm, bow, torch, crossbow and a shouldered two-hander keep a
steady aim. A weapon arm pumps 0.6x in the run. `REST_PITCH.blade` idle/walk is -1.2 (was -0.95). Test:
`node --test avatar-3d/tests/gait-grip.test.js` (angle to the forearm within 10 degrees over a stride, never in line;
the run's point above -35 degrees).

## Gear catalog (2026-10-06, Thousandvale play-test 5: T23 + the models for T15)

**One list of every wearable / holdable Chibi 2 model, old and new**: `avatar-3d/data/gear-catalog.json` (259 rows), read
through the pure `avatar-3d/js/gear-catalog.js` (no Three.js — tools, node tests and games all read it). The `armory/`
experiment lists and previews everything in it. The file is GENERATED — never edit it by hand:

```
node --import ./avatar-3d/tests/three-register.mjs tools/build-gear-catalog.mjs          # rewrite it
node --import ./avatar-3d/tests/three-register.mjs tools/build-gear-catalog.mjs --check  # is it current?
node --test avatar-3d/tests/gear-catalog.test.js                                         # code <-> catalog, both ways
```

### The 66 new models (`g5_` ids)

Every one is a new id; nothing that existed changed (the test builds 276 older looks and compares vertex counts with the
commit before). The design list — id, slot, name, hold — is `js/chibi2-gear5-ids.js` (pure); the models are in three files
reached through one dispatch, `js/chibi2-gear5.js` `buildGear5(a, c)`, which chibi2.js calls after `buildArmour2`.

| File | What | Count |
|---|---|---|
| `js/chibi2-gear5-weapons.js` | one per weapon type in the item data: kris (dagger), leafblade (sword), flamberge (two-handed sword), halfmoon axe, headsman's longaxe (two-handed), morningstar (mace), cooper's mallet (hammer), quarry sledge (two-handed hammer), winged partisan (spear), bardiche (polearm), harpoon (javelin), horn recurve (bow), arbalest (crossbow), ironshod bo (quarterstaff), crownhead sceptre, armillary orb, open codex — plus **six wands and six staves, one silhouette per magic attack form** | 29 |
| `js/chibi2-gear5-armour.js` | head / chest / legs / hands / feet × cloth / leather / mail / plate | 20 |
| `js/chibi2-gear5-offhand.js` | four shields (targe, notched scutcheon, almond kite, pavise), six foci (one per focus kind, each also one attack form), hip quiver, cresset torch; worn: swallowtail cloak, hooded lantern, war girdle, torc, signet ring | 17 |

Attack forms and the silhouette that says them: **projectile** a dart / a spire / a sealed folio · **cone** a bell mouth / a
horn / a thurible · **area** a hoop / a halo / a caged orb · **beam** lenses on prongs / a lens "eye" · **fork** tines /
branches / an antler · **shield** a small escutcheon / a sigil plate.

### Where a part goes in the avatar

| Game slot | Avatar | Note |
|---|---|---|
| weapon | `held.id` | a one-hander also works as `offhand.id` (the row says `offhandToo`). Bows are left-hand items (`BOW_IDS`). |
| shield / focus / quiver / torch | `offhand.id` | a themed shield's `offhand.emblem` is drawn on its face |
| head · chest · legs · feet | `hat.id` · `top.id` · `bottom.id` · `shoes.id` | each `g5_` top/bottom/shoes has a plain garment under it (`style` in the id table) |
| **hands** | **`top.gloves = { id, color, color2 }`** | new: Chibi 2 had no hands model. A field, not a slot — fields survive the 2D normaliser, new top-level keys do not |
| cape | `cape.id` | |
| necklace | `accessory.id` | |
| **ring** | **`accessory.ring` / `accessory.ring2` = `{ id, color, color2 }`** | right / left hand |
| light, belt | `decor.id` | one decor at a time (a tier-2 kit takes the slot) |

### How a game adds an item from a catalog row

```js
import { loadGearCatalog, applyGear } from '../../avatar-3d/js/gear-catalog.js';
const cat = await loadGearCatalog();

// 1. pick the row: by id, by what it is, or straight from an item
const row = cat.byId('g5_wand_bell');
const rows = cat.find({ kind: 'armour', gameSlot: 'chest', archetype: 'plate', isNew: true });
const forThis = cat.forItem(item);   // item: { slot, tier } | { type:'weapon', subtype, twoHanded, form } | { look: { g5: id } }

// 2. make the item: row.base is the suggested base id, row.name a name, row.minLevel a first level,
//    row.gameSlot / row.type / row.archetype / row.hands / row.form what kind of base it is.
//    Carry `look: { g5: row.id }` on the item and step 3 needs nothing else.

// 3. draw it: merge the row's look into the avatar LAST (after tier2Dress, which replaces decor)
const dressed = applyGear(avatar, [row, cat.byId('g5_plate_gauntlets')], { [row.id]: { color: '#ff8a40', quality: 2 } });
```

`lookFor(row, opts)` returns `{ slot, part }` if you would rather merge it yourself (a `field` row's part must be merged
INTO the slot). Item weight → archetype is `ARCHETYPE_OF_TIER` (`light` → leather, `medium`/`scaled` → mail, `heavy` →
plate, `runed` → cloth); subtype → weapon type is `weaponTypeOf(item)`.

### Adding another model later (Farhold, or round 6)

1. One row in `js/chibi2-gear5-ids.js` (or a new id table of your own with its own prefix, added to `G5_TABLES`).
2. One builder under the same id in the matching `chibi2-gear5-*.js` table. Held things: handle through the fist at
   `z = Z`, head at −y, butt at +y, authored on `'handR'` (the dispatch swaps the bone for the off hand); staves alone
   carry the topper at +y. Nothing else needs registering — the 2D stand-in, the hold kind and the body style are read
   from the row.
3. `tools/build-gear-catalog.mjs`, then the test. LOOK at it: `G5_IDS=<id> flock /tmp/claude-1000/farhold-pw.lock npx
   playwright test avatar-3d/tests/gear5-shots.spec.js` writes a two-angle sheet to `/tmp/claude-1000/g5-shots/`
   (`G5_VIEWS`, `G5_EXTRA`, `G5_OFF=1` are documented at the top of the spec; it is skipped unless `G5_IDS` is set).

Known limits: long shields lie along the raised forearm at `ready` like the existing kite/tower shields (the rig's
shield pose); robe panels and the hauberk skirt are rigid on the hips like the existing robes; the signet is a glint at
game distance; old rows' `games` are a text scan of each game's code and data (a heuristic), and `items` lists
Thousandvale's mapping only.

## Backpacks (2026-10-08, Thousandvale owner feedback 8: W19)

Four packs worn on the BACK in place of a cloak: `avatar.cape = { id, color, color2 }` (`color` = the bag, `color2` = buckles and piping).
Models in `js/chibi2-backpacks.js` (`G5_PACK_BUILDERS`), ids in `js/chibi2-gear5-ids.js` (`G5_PACKS`, `type: 'pack'`), reached through
`chibi2-gear5.js` like every other `g5_` part, so they are registered with the shared 2D normaliser and listed in the gear catalog
(`tools/build-gear-catalog.mjs`) with no extra step.

| id | what | about |
|---|---|---|
| `g5_pack_satchel` | a sling bag low behind one hip, one strap across the chest | +596 triangles |
| `g5_pack_rucksack` | a soft sack with a buckled flap, two shoulder straps, a side pocket | +896 |
| `g5_pack_frame` | a tall sack lashed to a wooden pack frame, bedroll across the top, a cook pot hung behind, a hip belt | +1,846 |
| `g5_pack_explorer` | the rare one: tooled flap with a brass plate, a pocket each side, a coil of rope, a map case, the bedroll slung beneath | +1,768 |

Everything hangs off `chest`; the back and chest surfaces are asked of `c.chestZ(x, y, side, lift)`, so a pack sits ON a plate cuirass and
its straps lie over any body's shoulders. Thousandvale maps its item bases in `js/client/gear-look.js` (`PACK_BY_BASE`, `packLookId`):
`sling_satchel`, `trail_rucksack`, `expedition_pack`, and the explorer's for a rare one. Contact sheet:
`G5_IDS=g5_pack_satchel,g5_pack_rucksack,g5_pack_frame,g5_pack_explorer G5_VIEWS=back,left,front,chestBack flock … npx playwright test avatar-3d/tests/gear5-shots.spec.js`.

## Rest clips (opt-in, 2026-10-17, Thousandvale play-test 12)

`js/chibi2-motion-rest.js` registers `swimCrawl` (face-down front crawl), `swimTread` (upright, treading water) and
`sitHold` (the seated pose `sitGround` ends in, held). The shared `swim` lies face UP and travels feet first (a
backstroke), and `sitGround` loops its sit-down every 3.4 s; neither was changed. Use them by name in `anims`
(`CHIBI2_REST_ANIMS`); play `sitGround` for `SIT_DOWN_MS` then `sitHold`. The crawl is floated for a game that holds a
swimmer's feet 1.1 m under the surface (head just out).


## 2026-10-21 owner review — weapons

The owner went through the Avatar 3D page and the Armory. Every item below is shared by v2 and 2.5 (gear is the same
code), so v2 looks holding these items hash differently on purpose.

| # | Report | Cause and fix | Where |
|---|---|---|---|
| W1 | Sword / Greatsword / Twin daggers: blade not joined to the hilt | the old `sword()` started its blade 3 cm under the guard; the blade now starts inside it. The `fh_` blades (`fh_sword`, `fh_longsword`) start 1 cm higher; `fh_greatsword`'s ricasso reaches into the guard and its blade into the ricasso (there were 2 cm and 4 cm gaps) | chibi2-gear.js `buildHeld` `sword`; chibi2-weapons.js |
| W2 | Curved saber curves the wrong way | the blade was turned a quarter turn about y, so its FLAT led every cut. A sword's edges are its x sides and the clips lead with +x (measured: the blade's fastest frame in `attack`/`overhead`/`chop` moves +x). Unturned, the convex side is +x; the guard crosses along x | chibi2-gear.js `saber` |
| W3 | Lute floats in front | new hold kind `lute` (chibi2-weapon-ids.js). The lute is built in PLAYING position in the right hand's space (`LUTE_FRAME`), measured against `LUTE_POSE` (chibi2-motion.js): right forearm across the bowl, left hand on the neck under the pegbox. Every clip that does not put the hands away keeps that hold; `attack` with a lute plays `lutePlay` hard. **New opt-in clip** `lutePlay` in `CHIBI2_MUSIC_ANIMS` (group "Music"): strums with the wrist (the grip counter-turns, so the lute stays put), the left hand walks the neck, the head nods. A lute is two-handed: nothing is drawn in the off hand with it | chibi2-gear.js `lute`; chibi2-motion.js `luteHold`, `lutePlay` |
| W4 | Off-hand Dagger a cylinder; Orb needs a handle; Effigy floats | a real parrying dagger (grip, capped guard, ring pommel, leaf blade with a fuller). The orb, reliquary, effigy, warded focus and totem were built 4.5 cm in front of the palm on nothing: all now sit on the grip line (z 0.055) with a handle through the fist (the effigy's bound legs are its handle) | chibi2-gear.js `buildOffhand` |
| W5 | `fh_axe`: floating wire behind the head; head not joined to the shaft | the edge rod was at +z while the head is extruded toward −z; the head's back stopped 2–3 cm out from the haft. `axeHead` now runs into the haft, `axeEye` wraps a socket round the join, and `axeEdge` follows the head's own rim on the head's side (`fh_halberd` shares `axeHead`, so its head now meets its haft too) | chibi2-weapons.js |
| W6 | `fh_greataxe`: the edge does not line up with the head | same `axeEdge`, once per head, plus one eye | chibi2-weapons.js |
| W7 | `g5_recurve` string clips through the limbs (check every bow) | a straight string ran through limbs that bend back past it. `bowStringPath(limbs)` samples each limb's back edge (centre + radius) and strings the upper hull tip to tip, so the string lies on a recurve's ears and is free across the middle. Applied to `bow` and `g5_recurve`; the crossbow and arbalest strings run back from the prod tips and never cross the prod (checked, unchanged) | chibi2-weapons.js; chibi2-gear.js `bow`; chibi2-gear5-weapons.js `g5_recurve` |
| W8 | Dagger guard edges see-through | `taperedCurve` is an open tube; every cross guard (fh `guard()`, the old `sword()`, the saber, the new off-hand dagger) gets a ball on each end (`endCaps`, 24 tris each). The `daggers` / `fh_daggers` ids STAY: Emberveil's class and enemy looks, items.json dagger bases (`look.held: "daggers"`), Farhold `rpg.js` (every dagger item is drawn as `fh_daggers`, a knife in each hand when the off hand is empty), class outfits, Farhold mercenaries and warbands use them | chibi2-weapons.js `guard`, `endCaps` |
| W9 | `fh_wand` orb off-centre | the shaft is tilted about x but the stone, collar and sparks were placed on the un-tilted line; they now sit on the tilted line (`on(y)`), the stone on the shaft's tip | chibi2-weapons.js `fh_wand` |
| W10 | torch / cresset: rounded rag head, fire in games | no flame cones any more: `KIT.rag` — a rag ball bound with cord, charred at the end; the cresset's basket holds a pitch-rag ball with embers. The fire is `js/held-flame.js` (below) | chibi2-gear.js `torch`; chibi2-gear5-offhand.js `g5_cresset` |
| W11 | Two-handed rule | `isTwoHandedHeld`, `offhandAllowed`, `applyHandsRule` in chibi2-weapon-ids.js: a bow, crossbow, two-handed melee weapon, polearm, staff or lute in the main hand means NOTHING in the off hand except a worn quiver (`quiver`, `g5_hipquiver`); a two-hander in the off hand with something in the main hand likewise. The one pair allowed is two melee two-handers (Farhold's Doubled Grasp). Applied in `rigFor` (chibi2.js), `buildGear` and `buildGear5`, and `holdFor`. Catalog `hands` now also asks `isTwoHandedHeld`, and `offhandToo` is never set on a two-hander | chibi2-weapon-ids.js, chibi2.js, chibi2-gear.js, chibi2-gear5.js, tools/build-gear-catalog.mjs |

**The held flame** (`avatar-3d/js/held-flame.js`, opt-in, any page):

```js
import { attachHeldFlame, createHeldFlame, heldFlameSpot, HELD_FLAME_AT } from '../avatar-3d/js/held-flame.js';
const flame = attachHeldFlame(actor, avatar);   // a Chibi 2 actor + the look it was built from; null if nothing burns
flame?.update(dt);                              // each frame (moves/scales three sprites, keeps the flame upright)
flame?.dispose();                               // when the look changes (setAvatar rebuilds the bones) or the actor goes
```

Three additive sprites parented to the grip bone that carries the torch (`HELD_FLAME_AT`: `torch`, `g5_cresset`), so the
flame follows the hand and vanishes when a clip puts the hands away. One shared texture and one shared material per
colour, created once; no light is added or toggled (that recompiles every lit material — keep one game light and move
it). `createHeldFlame({ color, size })` gives a free-standing flame for anything else. Farhold hangs it on the player in
`applyGearLook`. Thousandvale draws no held torches (light items were removed in play-test 8), so nothing to wire there.

**v2 looks this moved** (chibi25.test.js fixture, NOT rewritten): class:fighter, paladin, ranger, rogue, bard,
demon_hunter, tactician, witch_hunter, knight, shadow_dancer; preset:0, 3, 4, 6, 8, 10, 12, 13; outfit:warrior,
fighter, paladin, ranger, rogue, tactician. `tests/fixtures/gear5-baseline.json`: the 30 `held:` / `offhand:` weapon
rows these items touch were re-measured (the class rows were left: other streams move them too).

## 2026-10-21 owner review — clothes and straps

The owner reviewed the Avatar 3D page and the Armory. Ten items, B1-B10. The character material is double-sided now
(`chibi2-geometry.js` `finish()`, set by the lead), so a reversed copy of a sheet on the SAME surface would flicker:
every such copy in the clothes / capes / g5 armour is either gone (capes, tabard) or drawn a hair inside the sheet
(coat tails, loincloth, `chibi2-gear5-armour.js` `inner()`, the t2 mantle collar).

**Which builds it reaches.** `V2_BODY_FIXES` in `chibi2-body.js` (false): the fixes that touch EVERY look — the arm cap,
the neck closure, the V-neck, the surface-hugging collars and lines (`FX` in `buildBody`) — are 2.5-only, because the v2
hash fixture sweeps faces over one robed base and would move all 209 looks (other streams rely on it). Everything
garment-specific (coat tails, loincloth, harness, strapped leather, apron strap, footwraps, kilt, cuisses, capes,
scarves, every strap) is built the same for v2 and 2.5. Set the constant true and re-baseline with `--force` when the
owner accepts the body-wide fixes for Farhold / Emberveil / Bannerline.

| item | what was wrong | fix |
|---|---|---|
| B1 tops: holes on top of the shoulders | the upper arm profile STARTED with an open ring 2.4 cm across (3.6-6 cm under a puffed or short sleeve, which offset it again); and the torso's top ring stopped 1.5-2 cm short of the neck | FX: the arm closes in a dome (and the sleeve offset leaves the apex closed); one more torso ring closes onto the neck — it is part of `chestRings`, so `chestZ` now answers up to the neck |
| "Longcoat" (`coat`, `trench`, `open_coat`, `duster`) | the tails' lining copy was cloned AFTER `add()` had already moved the tail into hips space, so it was moved TWICE and stood as a flat sheet beside the chest (the "holes" the owner saw at the shoulders). The loincloth had the same bug | clone first, draw a hair inside (v2 + 2.5) |
| B2 V-neck covered at the throat | the V ended at 0.27T and the torso cloth carried on to the neck above it | FX: the opening runs up to where the torso meets the neck and is the neck's width there; edges laid point by point |
| B3 something poking through the upper chest | every `onChest` line ran in straight chords between 3-4 points, sinking into a round chest mid-way and coming out at the points — the apron's neck strap showed as two arcs through its own bib | FX: lines resampled every 3 cm onto the surface; the round collar is a ring ON the torso; the hood roll lies on the shoulders; the apron strap is one loop from the bib round the BACK of the neck (v2 + 2.5) |
| B4 harness straps don't meet over the shoulder | front X and back X were two pieces stopping short of the shoulder | each strap is ONE piece: back hip -> over its shoulder -> other front hip (`chibi2-straps.js`); same for `strapped_leather` |
| B5 kilt / pleated skirt clip at the waist edge | the hands hang exactly where a kilt flares; v2's kilt had no room for the top of the thigh | `rig.armSpread` for kilts/skirts (0.08 v2, 0.14 2.5); v2 kilt 2 cm roomier with the pleats moved out with it. Also found: the 2.5 LOINCLOTH flapped level in idle — `driveSkirt` measured how wide a leg is "seen" from the axis, so a thigh near the axis covered every direction; for an arc surface it is now measured at the cloth's radius (`chibi25-body.js`) |
| B6 fan-kneed cuisses, no groin armour | — | two hooped fauld lames round the hips, a shaped groin plate, and a two-lame tasset on each thigh riding the leg |
| B7 footwraps not lined up | five rings each tipped about the KNEE (not their own centre), so they stood staggered | one even spiral strip up the shin, tied off; the foot turns lie on the foot ellipsoid and slant |
| B8 capes flat at the shoulders | a flat sheet behind the back | `drape(..., { yoke: true })`: the top rows are laid ON the body over the shoulder tops and shoulder balls and round the back of the neck, then hang; the cloth over each shoulder rides that arm up to 92% (cape, travel cloak, long cloak, tattered cape; the half cape keeps its arm-riding lump) |
| B9 scarf see-through at the front | the neck loop was an OPEN tube whose ends met at the front, tails ended in open mouths | closed tubes, tails taper shut (`buildScarf`). New: `scarf_trailing`, `scarf_cowl`, `scarf_striped`, `neckerchief` in BOTH the accessory and the cape (back) slot; `scarf` works in both too |
| B10 strap not over the shoulder | every strap was one curve down the front starting in the air | `crossStrap` (a closed bandolier loop over one shoulder to the other hip: quiver, herb satchel, scroll case, waterskin, bandolier) and `packStrap` (pack top -> over the shoulder -> down the chest -> under the arm -> pack foot: gear pack, bedroll pack, storm rods); the t2 harness baldric continues down the back. The g5 backpacks' straps were already continuous and are unchanged |

**`js/chibi2-straps.js`** (new): `makeWrap(chestRings, { T, grow, spheres })` -> `surface(x, phi, lift)` casts a ray
from a horizontal axis through mid-chest (phi 0 forward, PI/2 up over the shoulder, PI back) and stops where it leaves
the torso (or a shoulder ball); `strap(add, [[x, phi], ...], r, colour, opts)` samples a path on it; `loop()` closes it
round the flank; `side(y, s)`; `armWeigh()`. `buildBody` returns it as `body.wrap` and `chibi2.js` hands it (and
`chestRings`) to the gear builders as `c.wrap`.

New ids (all in `chibi25-outfits.js` `CAPE25` / `ACCESSORY25`, registered `bespoke` through `chibi2-parts.js`, 2D =
the paper doll's scarf recoloured): `scarf_trailing`, `scarf_cowl`, `scarf_striped`, `neckerchief`. Gear catalog
rebuilt (+8 rows; scarves are `type: 'scarf'` in the cape slot too).

**Measured** (2.5 Emberveil class looks, `tests/chibi25-clip-body.test.js`'s survey): capes / packs / straps vs upper
arms 0 frames (a strap's closing run hugs the flank, a pack strap goes under the arm low at the ribs); straps vs
forearms 1-2 frames in `cast` (~1 cm). Costs: a cross strap ~250 triangles, a pack strap pair ~350, footwraps +280, a
cape yoke ~+60, the cowl ~580. Not fixed here: a v2 kilt still has no skirt bones, so a running thigh goes through it
(2.5 is the fix); the g5 hip quiver / girdle straps live in `chibi2-gear5-offhand.js` (the weapons stream's file).

## 2026-10-22 — resume-site bug report (Chibi 2.5 only; every v2 look is unchanged, `chibi25.test.js` holds them to their hashes)

From `~/claude/resume/assets/chibi/BUG-REPORT-PROMPT.md`; tests in `tests/chibi25-site-report.test.js`.

- **Armour follows the top's colour.** `plate`, `scale_plate` and `chainmail` sleeves, the plate high collar and the mail
  rings were a fixed dark steel (`#536a73`). On 2.5 they follow `top.color` (plate/scale arm a shade under the chest, mail
  the shirt itself); a `surcoat`'s mail takes `color2` (the coat colour is the cloth over it). The plate shoulder caps take
  `top.color` with the rivet on `color2`, so a tabard and coloured shoulders can be worn together (`chibi2-body.js`, `mail`/`mailDeep`).
- **Capelets clear any shoulder.** The fur mantle / shoulder cape / feather mantle were cut to the body's width only; the
  2.5 shoulders slider, a broad/heavy shape and the arms slider put the top of the upper arm 10+ cm outside them (the
  "glitchy orc"). `buildCape` widens the capelet by `sw` (shoulder bone + arm radius vs the cut); `sw` is 1 for a body
  whose shoulder already fits (`chibi2-gear.js`).
- **Giants**: `RACE25_TUNE` (chibi25-body.js) raises a giant's head x1.25 and shortens its neck; `LIMB_BULK` thickens
  limbs longer than 1.2x a human's by the square root of the excess — arms (`armThick`), shins (`shinThick`, new) and feet
  (`footK`, new), not thighs (they came through skirts). Only giant-sized frames move.
- **Halflings**: head x0.88. **headSize** on any 2.5 body now spans 0.72x..1.28x (`HEAD25_RANGE`; v2 0.86x..1.14x).
- Changed looks to recheck: anything wearing `plate` / `scale_plate` / `chainmail` / `surcoat` on 2.5; any 2.5 giant or
  halfling; any 2.5 look with a non-default headSize; 2.5 capelets on wide-shouldered bodies (orcs, broad, heavy).

**Cloth gloves** (`g5_cloth_handwraps`, now named "Cloth Gloves", linen `#cfc9b8`): the hand is covered (a mitt) with
wraps over the knuckles; the bare-fingered wraps it was vanished inside a robe's sleeve. `gear-catalog.test.js` checks every
glove model covers the fingers.

**Class outfits**: bard, demon hunter, scavenger, shadow dancer, swashbuckler and witch hunter have tier-1 outfits in
`data/class-outfits.json` (32 now), so they appear in the outfit pickers, the tier-2 gallery's tier-1 column, and Farhold
/ Thousandvale dress those classes in them.
