# fal.ai characters — a paid picture-to-3D test

**Status:** test 3 done 2026-11-23: **the creature roster** — 35 complete enemies on the Enemies tab (19 Wyrmroad foes, 4 bosses, 3 elementals, 4 extras, wolf + drake on four legs, the 3 Tripo goblins), all low poly (~3,000 triangles, big ones ~4,500; weapons ~500), 20 new weapons, heads no longer stare at the floor, two-sided clothes. US$32.80 spent in all (US$24.60 this round, cap US$33.20). Tests 1–2 (2026-11-22): human bodies + swappable armour, then complete goblins (see below).
**Play:** `avatar-3d/fal/index.html` on the dev server (8401) or stable (8400): Enemies (picker, one at a time or a line-up at real sizes), Dressing room, Makers, Costs.
**Next:** Wyrmroad high-detail mode uses these (Helper C); owner review by eye (hands and shields fixed in Test 3b); remaining weak spots under Test 3 (imp wings follow the arm, bell maul lost its bell, bounty hunter's uneven knees).
**Parked:** dragon (owner: not yet); goblin-shaped armour; capes; finger bones; the remaining Chibi 2.6 catalog.

## Who uses these files

**Wyrmroad imports `js/fal.js` (+ `js/beast.js`) and `data/catalog.json` directly** (no copies), so improvements here
flow into the game. Never rename a body or item id, or change `createFalCharacter(id)` → `{ group, play(clip),
update(dt), equip(slot, id), stats(), def }` or the clip keys (`idle walk run ready attack cast punch dance hit death`)
without updating Wyrmroad in the same change. Catalog body fields a game can read: `role`, `group`, `height` (real
metres; every model file is 1 m tall, scale the group by it), `weapon`, `offhand`, `skeleton` (`biped`|`quadruped`),
`triangles`, `stage` (false = kept for history only).

## What this tests

The owner wants WoW-style characters: very low poly, rich hand-painted textures, and above all **armour and weapons
that can be swapped**. Meshy alone came out too realistic, and per-model prices add up. This folder checks whether
the fal.ai model marketplace can make that look cheaply, end to end:
redrawn reference picture → 3D model → rig → free animation clips → fitted, swappable armour → review page.

## Endpoints and prices (checked on each model's fal page, 2026-11-22)

| Job | fal endpoint | Price | Used for |
|---|---|---|---|
| Picture → 3D | `fal-ai/hyper3d/rodin/v2` | $0.40 per model (`4K Quad`, A-pose flag, up to 5 views) | **all three bodies** (picked) |
| Picture → 3D | `tripo3d/p1/image-to-3d` | $0.50 textured ($0.40 without), `face_limit` 48–20000 | **every enemy since Test 2** (owner's pick) |
| Picture → 3D | `fal-ai/hunyuan3d-v3/image-to-3d` | $0.45 LowPoly + $0.15 multi-view | man, comparison only |
| Picture → 3D | `fal-ai/trellis-2` | $0.25 (512) / $0.30 (1024) / $0.35 (1536) | **all armour and weapons**, 4 items per picture |
| Picture → 3D | `fal-ai/meshy/v6/image-to-3d` | $0.80 | not used (price; Meshy look) |
| Rig | `fal-ai/meshy/rigging` | $0.20 ($0.32 with one animation) | **all three bodies**, `skeleton_template: ue5_mannequin` |
| Rig | `fal-ai/tripo3d/rig` | $0.30 (`rig_type`, model `v2.5-20260210` for animals) | tried on wolf + drake: legs missing, not used |

Every paid call is in `data/spend.json` (endpoint, inputs, price, request id, files, seconds); the page's Costs tab reads it.

| Paid job | Endpoint | Price |
|---|---|---|
| male-rodin / female-rodin / goblin-rodin | rodin v2 | 3 × $0.40 |
| male-tripo | tripo P1 | $0.50 |
| male-hunyuan | hunyuan3d v3 | $0.60 |
| male-rig / female-rig / goblin-rig | meshy rigging | 3 × $0.20 |
| test-trellis-plate4 (4 plate pieces, kept) | trellis-2 512 | $0.25 |
| test-trellis-platechest (one piece alone, test only) | trellis-2 512 | $0.25 |
| sheet-cloth, sheet-mix1/2/3, sheet-weapons1/2 | trellis-2 1024 | 6 × $0.30 |
| **Total** | | **$5.20** |

## Results

| Model | Triangles | File |
|---|---|---|
| Man / woman / goblin (body, rigged, 1 painted 2048 texture) | 7,746 / 7,846 / 7,640 | 460 / 465 / 413 KB |
| Armour pieces (20) | 1,370 – 5,778 (most 2,500 – 4,000) | 230 – 940 KB each, per body |
| Weapons + shield (7) | 1,998 – 4,857 | 330 – 490 KB |
| A fully dressed character with sword and shield | ~20,000 – 23,000 | 9 – 10 draw calls |
| Clips (9 from the CC0 Universal Animation Library) | — | 1.4 MB, shared |

Per-item cost: a 4-item picture is $0.30, so a piece is $0.06 – $0.10. A full set of five pieces costs about $0.38.

## Test 2: complete enemies (owner 2026-11-22)

Owner: Tripo looked best in Makers (Rodin: blurry eyes, flat hair, six fingers, boot-like feet); the armour attachments
"clearly don't work"; make goblin warrior, rogue and mage as complete models; the first goblin was too friendly.

| Step | Tool | Cost per goblin |
|---|---|---|
| Turnaround drawing with clothes, mean face (`fromNote` in refs.json replaces "keep the likeness") | `refdraw.mjs gob-*`, Codex | free |
| Picture → 3D | Tripo P1 (front view only) / Rodin v2 (3 views) | $0.50 / $0.40 |
| Turn to face front (Tripo returns it facing +X) | `tools/blender/face_front.py <in> <out> -90` | free |
| Rig | Meshy rigging, `ue5_mannequin`, height 1 m | $0.20 |
| Onto the free skeleton + clips | `to_ual.py`, `anims.py` (now also `Hit_Chest`) | free |
| Weapon (4 per Trellis-2 picture) | `sheet.py`, `split_sheet.py --flip`, `props.py -- <ids>`, `sockets.py` | ~$0.08 |
| **Enemy with weapon** | | **$0.77 – 0.85** |

Notes: Trellis returned the goblin weapon sheet mirrored (`--flip`; check by rendering, sizes alone fooled me once).
The Tripo rogue's hood has a thin stray strand along its rim (a Tripo glitch). Enemy bodies are `enemy: true` in
`data/gear.json` with their `weapon` / `offhand`; the Dressing room lists only the non-enemy bodies.

## Test 3: the creature roster (owner 2026-11-23)

Owner: Tripo P1 is THE maker for enemies; models were ~4x too many triangles (target ≈3,000 per body, bosses and big
ones ≈4,500, weapons 300–600); goblin heads tilt down while animating; the rogue's hood is see-through from inside;
"NO MORE WISPS — make them elementals"; D&D / WoW-themed creatures for Wyrmroad first, then other games.

**Pipeline per enemy** (`tools/run-body.sh make <id> [triangles]` then `tools/run-body.sh rig <id>`):
Codex front drawing (`refdraw.mjs`, new kind `enemy` = one front view, portrait; free) → Tripo P1 asked for the target
face count directly ($0.50) → `face_front.py -90` → `lowpoly.py` (only trims if over) → a front + side check picture in
`shots/check/` (looked at before paying for the rig) → Meshy rigging ($0.20) → `to_ual.py` → catalog. `run-body.sh`
refuses a paid step that would pass the cap (`FAL_CAP`, default 33.20).

| What | Cost |
|---|---|
| 33 Tripo P1 bodies (30 two-legged + wolf + drake + one face-count test) | $16.50 |
| 30 Meshy rigs | $6.00 |
| 5 Trellis-2 weapon pictures (20 weapons) | $1.50 |
| 2 Tripo quadruped rigs (not used, see below) | $0.60 |
| **This round** | **$24.60** (total $32.80) |

Meshy refused 16 rigs on the first try with "downstream service error" when 4 ran at once; two at a time they all
went through, and failed requests were not charged. It refused the bounty hunter's long coat on the UE skeleton twice
("cannot be rigged with the requested skeleton_template"): he was rigged on Meshy's own default skeleton and
`to_ual.py --meshy-default` maps its names. The winged imp was refused once and rigged on the second try.

### The low-poly choice
Tried both on the thug ($0.50 extra): Tripo asked for 8,000 faces then cut to 3,000 here vs Tripo asked for 3,000.
**Tripo at 3,000 directly wins clearly**: cutting down here smeared the face and tore the texture seams, Tripo's own
3,000 is clean. All new bodies ask Tripo for the target (`face_limit` 3000, or 4500 for bosses and big ones).
For files we must cut down ourselves (the old goblins at ~7,900, all weapons), the points split along texture seams
are welded first (`remove_doubles`), then a collapse cut-down keeps UVs, texture and skin weights: without the weld
the lantern staff turned into spikes. Only the colour texture is kept (the page paints with it alone), which halved
the files. Goblins are now 3,000 (from ~7,900), every weapon 500 (long ones and shields 600). Pictures:
`shots/props-lowpoly-before-after.png`, `shots/props-foes.png`.

### The head fix
The free clips hold the head 13–26° nose-down compared with the library mannequin's rest pose (idle 14°, walk 13°,
weapon ready 26°, run 21° — measured). On the plain mannequin nobody notices; on a big-headed goblin it reads as
staring at the floor. `to_ual.py` now turns the Head bone's rest 15° nose-down (`--head-lift`, default 15), so every
clip lifts the face by that much; the mesh is untouched. Proof: `shots/head-fix-before-after.png` (top: before, middle:
after in idle, bottom: weapon ready). The human man/woman were NOT rebuilt (their fitted armour is bound to the old head).

### Two-sided clothes
`paintedMaterial` in `js/fal.js` is now `DoubleSide`: generated clothes are single shells (hoods, coats, capes), so
the rogue's hood was see-through from inside.

### Four legs: wolf and drake
fal's Tripo rig (`fal-ai/tripo3d/rig`, `rig_type: quadruped`, model `v2.5-20260210`, $0.30) returned a wolf with only
two legs and a drake without back legs — not usable. So the four-legged rig is ours, free:
`tools/blender/quad_rig.py` finds the feet (lowest points away from the middle line, split by side and front/back),
the back's height, snout and tail tip, places a named skeleton (hips, spine_1..3, neck, head, tail_1..4, leg_xx_1..3,
wing_l/r_1..2 with `--wings`) and lets Blender weight the skin (bone heat; if that finds no solution, each point follows
its nearest bones). Seam-split points are welded first so bending opens no cracks. Proof of the joints:
`quad_rig.py ... --shot <png>`.
Motion (`js/beast.js`, used by `createFalCharacter` when the catalog says `skeleton: 'quadruped'`): idle (breathing,
looking about), walk (one foot after another: left hind, left fore, right hind, right fore, lower leg folding as the foot
travels), run (bounding gallop with a flexing spine), attack (crouch, lunge, snap), hit, death (rolls onto its side),
with the tail and wings on a spring that lags behind bounce and turns. Same `play()`/`update()` as the bipeds; clip
keys it lacks fall back (ready → idle, cast/punch → attack). Proof: `shots/beast-wolf-walk-strip.png`,
`shots/beast-drake-walk-strip.png`.

### Weapons
20 new weapons on 5 Trellis-2 pictures of 4 (2×2). Sheet b came back mirrored: `split_sheet.py --flip` now mirrors
each item back too (before it only swapped the order — the sickle's hook pointed the wrong way). Every piece was
rendered with `tools/blender/look.py` and compared with its drawing. Sizes and grips live in `data/gear.json`
(`length`, `grip_at`, `tris`). The royal archer reuses the old bow, the skeleton the old sword + goblin buckler.
The crossbow drawing was blocked by Codex's safety filter once ("violence"); reworded as a game prop it went through.
Codex also often draws but fails to save; `refdraw.mjs` now takes the picture from Codex's own folder.

### Roster (triangles: body / weapon; cost incl. weapon share)

| id | Name | Role | Height | Body | Weapon(s) | Cost |
|---|---|---|---|---|---|---|
| gobw-tripo | Goblin warrior | brawler | 1.0 m | 2,999 | Rusty Cleaver (492), Scrap Buckler (574) | $0.85 |
| gobr-tripo | Goblin rogue | rogue | 1.0 m | 3,000 | Jagged Shiv (494) | $0.77 |
| gobm-tripo | Goblin shaman | caster | 1.0 m | 2,994 | Skull Totem Staff (596) | $0.77 |
| thug | Street thug | brawler | 1.8 m | 2,990 | Spiked club (475) | $0.77 |
| knifer | Cutpurse | rogue | 1.8 m | 2,995 | Cutpurse knife (500) | $0.77 |
| bruiser | Bruiser | brawler | 2.2 m | 4,342 | — | $0.70 |
| lantern-guard | Lantern guard | soldier | 1.9 m | 2,966 | Lantern spear (600), Kite shield (584) | $0.85 |
| crossbowman | Lantern crossbowman | archer | 1.8 m | 3,000 | Crossbow (586) | $0.77 |
| lantern-priest | Lantern priest | caster | 1.8 m | 2,946 | Lantern censer (498) | $0.77 |
| zealot | Zealot | brawler | 1.8 m | 3,000 | Zealot sickle (498) | $0.77 |
| silver-knight | Silver knight | soldier | 1.9 m | 2,969 | Silver longsword (500), Kite shield (584) | $0.85 |
| royal-archer | Royal archer | archer | 1.8 m | 2,906 | Horn Recurve (596) | $0.80 |
| bounty-hunter | Bounty hunter | rogue | 1.9 m | 2,984 | Hunter's hatchet (496) | $0.77 |
| kiln-monk | Kiln monk | caster | 1.8 m | 2,920 | Glassblower's pipe (596) | $0.77 |
| hollowborn | Hollowborn | undead | 1.7 m | 2,980 | — | $0.70 |
| root-caller | Root-caller | caster | 1.9 m | 2,999 | Root staff (587) | $0.77 |
| drowned-brute | Drowned brute | undead | 2.0 m | 3,999 | Bell maul (609) | $0.77 |
| wraith-knight | Wraith knight | undead | 2.0 m | 2,858 | Wraith greatsword (600) | $0.77 |
| stone-golem | Stone golem | construct | 2.4 m | 4,361 | — | $0.70 |
| winged-imp | Winged imp | beast | 0.9 m | 2,999 | — | $0.70 |
| thornling | Thornling | beast | 0.9 m | 3,000 | — | $0.70 |
| fire-elemental | Fire elemental | elemental | 1.9 m | 2,994 | — | $0.70 |
| grell | Grell the gang boss | boss | 1.9 m | 4,442 | Gang hook (487) | $0.77 |
| vessa | Captain Vessa | boss | 1.8 m | 4,481 | Officer sabre (495) | $0.77 |
| aldric | Aldric the Lamplord | boss | 2.3 m | 4,500 | Lamplord staff (595) | $0.77 |
| isolde | Queen Isolde | boss | 1.9 m | 4,432 | Silver rapier (493) | $0.77 |
| water-elemental | Water elemental | elemental | 2.0 m | 2,999 | — | $0.70 |
| earth-elemental | Earth elemental | elemental | 2.3 m | 4,320 | — | $0.70 |
| air-elemental | Air elemental | elemental | 2.0 m | 3,000 | — | $0.70 |
| orc-grunt | Orc grunt | brawler | 2.0 m | 2,902 | Orc axe (487) | $0.77 |
| troll | Troll | brawler | 2.3 m | 4,394 | Bone club (466) | $0.77 |
| skeleton-warrior | Skeleton warrior | undead | 1.8 m | 2,819 | Marsh Leafblade (496), Scrap Buckler (574) | $0.85 |
| minotaur | Minotaur | brawler | 2.4 m | 4,372 | Minotaur greataxe (600) | $0.77 |
| wolf | Dire wolf | beast | 1.1 m | 3,000 | — | $0.80 |
| drake | Drake | beast | 1.3 m | 4,488 | — | $0.80 |

The 8,000-face thug test ($0.50) is in the spend list but unused. Old Rodin warrior: kept for history, not on stage.

### Honest weak spots (look at these first)
- **Winged imp:** Meshy weighted the wings partly to the arms, so a wing bends with the arm in swings.
- **Bounty hunter:** default-skeleton rig put one knee low (the coat hides most of it); his hatchet is small in his hand.
- **Bell maul** lost its bell in the cut to 600 triangles (reads as a dark hammer); **lamplord staff** lantern is rough.
- **Wolf:** Tripo dropped the lighter belly/chest colour (all dark grey).
- Elementals and the golem animate with the human clips (fine for walk/swing; the air elemental's whirlwind legs step).
- Aldric and Isolde wear floor-length robes/skirts weighted to the legs: they split a little when walking.

### Test 3b: hands, grips and shields (owner 2026-11-23, no new spending)
Owner on the goblins: weapons sat in the wrist, not the hand; nobody grasped their weapon; the shaman's staff was too
thick to hold; the warrior's shield was on backwards (spike inward). Fixed in the pipeline, so every armed body
(goblins and the whole roster) got it. Proof: `shots/grip-before.png` / `shots/grip-after.png` (chest and both hands,
idle and weapon ready, front and side), `shots/grip-hand-r-after.png` and `shots/grip-hand-l-after.png` (each hand
close), `shots/props-grips.png` (every weapon with its grip point as a red ball). Tool: `tools/closeups.mjs` (FOCUS=hand_r).
- **Grip in the hand, not the wrist** (`sockets.py`): the hand bone starts at the wrist; the grip point is now measured
  from each body's own hand mesh (along the hand to the knuckles, mid-thickness, a little toward the palm). Weapons
  tilt 18 degrees back up the arm (was 40, which laid maces along the forearm; Tabard uses 18 too).
- **Fingers that close** (`to_ual.py` step 3b + `js/fal.js`): Meshy rigged without fingers, so the whole hand moved
  as one. The library's finger bones are now fitted to each hand (scaled to its measured length, never turned) and the
  finger part of the skin is weighted to the nearest finger bone. A hand holding something closes into a fist round
  the handle (a clip that already curls further keeps its own motion); an empty hand relaxes mostly open (the
  library's idle hand is a loose fist). The human man and woman were not rebuilt (their fitted armour).
- **Hand-sized handles** (`props.py`): the cross-section is measured in 1 cm slices over the surface; the thin run
  round the grip (±8 cm on one-handers, the whole shaft on staffs and poles) is squeezed to 4 cm thick for the 1.8 m
  man (bodies scale it). Length, heads, guards and blades are untouched. Not on the bow (it would pull the string in)
  or the crossbow (a stock). Grip points (`grip_at` in gear.json) were moved by eye to the middle of each handle:
  several sat on the pommel (swords, sabre, rapier) or low (maces, axes, cleaver).
- **Shields face out** (`props.py`): Trellis built the goblin buckler with its spike on the back. A shield whose far
  side bulges more is turned round; the arm point is the middle of the back (not the rim, which left the shield
  floating), pressed onto the forearm (`sockets.py`). Kite shields were already right.

## How it works (all scripts are in `tools/`; Blender runs headless at `~/opt/blender/blender`)

1. **Redraw the references** (`tools/refdraw.mjs <id>`, Codex, free). The owner's three ChatGPT sheets had titles,
   close-ups, fists and several poses, which image-to-3D cannot use. Each was redrawn as a clean front / left / back
   turnaround in an A-pose with open, empty hands on light grey (`ref/<id>.png`, originals kept as
   `ref/*-original.jpg`), the goblin with only a loincloth so armour can go over it. `tools/crop.py` cuts the views.
   The 27 gear pictures (one item each, same style) are drawn the same way from `data/refs.json`.
2. **Paid jobs** (`tools/fal-job.mjs <endpoint> <name> --price <US$> --input <json>`): uploads `@local` files to fal
   storage, submits to the queue **once** (the request id is saved first, so a rerun resumes instead of paying again),
   polls, downloads every output file into `models/<name>/`, logs the row in `data/spend.json` (`tools/spend-repair.mjs`
   puts back a row if ever lost). The key is read from `FALAI_API_KEY` (or `~/claude/secrets/.env`) and never printed.
3. **Several items per paid picture** (`tools/sheet.py`): four redrawn items on one grey picture → one Trellis-2 job
   → `tools/blender/split_sheet.py` cuts the result into one model per item by the empty gaps between them (it
   handles a row the service laid out front-to-back; `--flip` when it came out mirrored).
4. **Bodies onto the free skeleton** (`tools/blender/to_ual.py`): Meshy rigs with UE-style bone names; the script
   turns the arms and legs into the library's T-pose, bakes it, copies the 65-bone UAL skeleton and slides each bone
   onto the matching joint *without turning it*, so every clip's rotations mean the same thing on this body. It also
   splits the body into regions (face, scalp, torso, upper arms, forearms, hands, hips, thighs, shins, feet).
   `tools/blender/anims.py` writes the 9 clips the page uses.
5. **Armour fitting** (`tools/blender/fit.py <body> [items]`): each piece is lined up with a landmark (collar at the
   neck, waistband at the hips with the hem stretched to the ankle, soles on the floor with one size for the pair,
   gloves along the hand, mirrored for the left; hats on the head), then the smallest size and the best turn (±50°,
   the pictures were three-quarter views) are searched at which the body part sits inside the piece's outer shell.
   Weights are copied from the nearest body surface; the piece is exported with the fitting pose as its own bind
   pose. Body parts the piece really covers are recorded per body (`data/fits/`) and hidden while worn.
   Preview pictures: `shots/fits-<body>.png`.
6. **Weapons** (`tools/blender/props.py`, `tools/blender/sockets.py`): long axis up, origin at the grip (shield:
   middle of its back), real lengths; grip sockets on each body's hand / forearm bone (Tabard's method), scaled to
   body height.
7. **Catalog** (`tools/build-catalog.mjs` → `data/catalog.json`): triangles and sizes read from the GLBs, costs from
   `spend.json`, a picture's price shared between the items cut from it.
8. **Page** (`index.html`, `js/fal.js`, `js/page.js`): `createFalCharacter(body)` → `play(clip)`, `equip(slot, id)`.
   A worn piece's bones are swapped for the body's bones by name, so the body's animation drives it.
   `window.__fal = { ready, errors, character, stats() }`. Screenshots: `node avatar-3d/fal/tools/shots.mjs name=query …`.
   Data checks: `node --test avatar-3d/fal/tests/data.test.js`.

## Honest notes

- **Look:** Rodin's bodies are close to the redrawn pictures and read as stylized, painted game characters (big
  hands and feet, painted shading baked into one texture), not photoreal. They are not WoW-low: ~7.7k triangles at
  the lowest useful Rodin setting (`4K Quad`). The armour and weapons (Trellis-2) look clearly hand-painted and chunky,
  close to the Codex pictures; texture detail is soft (each item gets about a quarter of a 1024 texture).
- **Comparison (same picture, man):** Rodin $0.40, 7,746 triangles, clean A-pose, closest to the picture — picked.
  Hunyuan3D LowPoly $0.60, 12,144 triangles, 4096 texture, also good. Tripo P1 $0.50, 8,016 triangles, but arms down
  at the sides and the model turned sideways — worst for rigging.
- **Rigging worked:** Meshy rigging on fal ($0.20) with the `ue5_mannequin` template gives the same bone names as
  the free library; after `to_ual.py` every library clip plays on all three bodies (idle, walk, run, weapon ready,
  swing, cast, punch, dance, fall). No fingers were rigged (cheaper, and the rig fails more often with them), so
  hands stay open around a grip.
- **Swappable armour worked on the two humans:** each piece is its own skinned mesh that follows the body's skeleton
  and hides what it covers; pieces mix freely (plate helm + leather chest + cloth legs …). Weak spots: robe and mail
  skirts are weighted to the thighs, so they split between the legs when walking (WoW used separate skirt meshes);
  sleeves are rigid in the drawn A-pose angle, so arms can poke out of wide sleeves; some gloves sit a little
  crooked; plate legs are bulky.
- **Goblin:** body, rig and clips are good. The armour was drawn for humans: on the goblin chest pieces reach the
  floor and the helms are huge. Goblin gear needs goblin-shaped pictures (one $0.30 sheet per four pieces).
- **Not the WoW texture-paint approach:** this test uses separate meshes for every piece (one draw call each); the
  painted-on-body approach is what the free Tabard trial (`avatar-3d/tabard/`) explores.

## Files

`ref/` owner originals (`*-original.jpg`) + Codex redraws (`<id>.webp` in the repo; the PNGs, view cut-outs and sheets are rebuilt locally) + prompts · `models/<job>/` raw fal downloads (FBX, PBR duplicates and
Meshy's own walk/run files are git-ignored) · `models/final/` bodies, `anims.glb`, `gear/<item>-<body>.glb`,
`props/<item>.glb` · `data/` refs.json (subjects), gear.json (how each item was made + fit settings), spend.json,
jobs/ (request ids), fits/, sockets.json, catalog.json (generated) · `shots/` previews and page screenshots; `shots/check/` the front + side check of every Tripo body before rigging.
Test 3 tools: `tools/run-body.sh` (whole body pipeline), `tools/blender/lowpoly.py`, `quad_rig.py`, `look.py` (quick renders).
