# fal.ai characters — a paid picture-to-3D test

**Status:** Oathwild art 2026-11-23 — **fal balance ran out twice**: round 1 after US$3.40 (of a planned US$25), round 2 after US$0.40 (of the owner's new US$8.80: only the two rigs went through, the horse was refused). Made: brown bear, bristleback boar, mountain lion (four legs, all six clips), bandit chief + field scarecrow (rigged), 7 scenery props, the scenery pipeline + Scenery tab. **Everything else is placeholder art** in `prototypes/oathwild/data/art.json` (`tools/oathwild-art.mjs`): monsters + the horse draw an existing fal body tinted (`fallback`), props draw a coloured shape (`placeholder`). All drawings are ready; `tools/oathwild-resume.sh` makes them in the owner's priority order when there is credit. Before that: test 3 creature roster (35 enemies, US$32.80).
**Play:** `avatar-3d/fal/index.html` on the dev server (8401) or stable (8400): Enemies (group Oathwild), Scenery, Dressing room, Makers, Costs.
**Next:** when fal has credit: `tools/oathwild-resume.sh --dry`, then without (horse, three bosses + their weapons, 12 scenery sheets, hill ogre ≈ US$7.60 under the US$8.50 cap); watch the clips of bandit chief + scarecrow on the page (checked only in Blender so far: the browser was busy); redraw the crate as a solid box. Older: imp wings, bell maul, bounty hunter knees.
**Parked:** dragon (owner: not yet); goblin-shaped armour; capes; finger bones; the remaining Chibi 2.6 catalog.

## Who uses these files

**Wyrmroad imports `js/fal.js` (+ `js/beast.js`) and `data/catalog.json` directly** (no copies), so improvements here
flow into the game. Never rename a body or item id, or change `createFalCharacter(id)` → `{ group, play(clip),
update(dt), equip(slot, id), stats(), def }` or the clip keys (`idle walk run ready attack cast punch dance hit death`)
without updating Wyrmroad in the same change. Catalog body fields a game can read: `role`, `group`, `height` (real
metres; every model file is 1 m tall, scale the group by it), `weapon`, `offhand`, `skeleton` (`biped`|`quadruped`),
`triangles`, `stage` (false = kept for history only), and for Oathwild bodies `regions` (`brightwater`|`thornmere`),
`druidForm` (a real animal the druid can turn into) and `mount` (`{ bone, seat }`). Catalog `scenery` = static props
(see "Oathwild" below); Oathwild reads them through `prototypes/oathwild/data/art.json`.

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

## Oathwild (owner 2026-11-23): animals, region monsters, scenery props

Budget: US$25 for this job (~$12 props / ~$13 enemies). Every paid call carries a tag (`oathwild-props` /
`oathwild-enemies`) in `data/spend.json`, and `tools/fal-job.mjs --tag/--cap` (or `FAL_TAG` / `FAL_CAPS`) refuses to
submit a job that would pass the cap, counting jobs already submitted but not logged (parallel runs). **The fal balance
ran out after US$3.40** (US$0.90 props, US$2.50 enemies; the account had far less than the US$25 the plan expected) —
two jobs were refused at upload, one was refused after submit (not charged, its job file removed).

| Spent | What | US$ |
|---|---|---|
| props | `scn-sc-cottages`, `scn-sc-clutter` (Trellis-2 1024, 4 props each), `scn-sc-clutter-d5000` (Trellis' own low-poly test) | 0.90 |
| enemies | Tripo P1 bodies: brown bear, bristleback boar, mountain lion, bandit chief, field scarecrow | 2.50 |
| **This job** | | **3.40** (total 36.20) |

**Made and checked by eye** (`shots/oathwild-beast-clips.png`: idle, walk, run, attack, hit, death from the side;
`shots/scenery/closeups.png`: every prop front and back beside a 1.8 m post; `shots/page-scenery-desktop.png`,
`shots/page-oathwild-desktop.png`):

| id | What | Triangles | Notes |
|---|---|---|---|
| brown-bear | Brown bear, 1.35 m, Thornmere | 4,498 | real bear (owner: druid bear form) — `druidForm` |
| mountain-lion | Mountain lion, 0.85 m, Thornmere | 2,869 | real big cat, druid cat-form candidate — `druidForm`; came back turned ~20°, straightened |
| bristleback | Bristleback boar, 1.0 m, Brightwater | 2,999 | |
| cottage-thatch / cottage-stone / cottage-log / inn | houses 6–9 m | ~2,950 each | 1024 texture each, 0.5 MB |
| barrel / sacks / weapon-rack | clutter | 278 / 604 / 1,205 | 256–512 texture |

Paid but not finished: **bandit-chief** and **field-scarecrow** bodies (`shots/check/*-tripo.png`, both clean) wait for
their US$0.20 rigs. **Redo:** `crate` — Trellis built an open lattice (no plank panels); `stage: false`, redraw it as a
solid closed box. Drawn and waiting for credit: riding-horse (saddled; mount seat on `spine_2`), goblin-warchief,
marsh-hag, barrow-king (bosses), shrine-cultist, bog-lurker, barrow-ghoul, hill-ogre, fen-harpy; 8 weapons
(`rusty-pitchfork`, `chief-axe`, `warchief-cleaver`, `cultist-knife`, `hag-staff`, `barrow-blade`, `ogre-club`,
`chief-buckler`, already in gear.json); 24 scenery sheets (96 props). The two Codex beasts `thornback-bear` and
`mire-toad` were replaced by real animals (owner: druid forms are real animals) and are not used.

### Round 2 (owner 2026-11-23: "The new budget is 8.80 for fal … use placeholder art for the rest")
Priority: horse → rig bandit chief + scarecrow → 3 bosses → 12 scenery sheets → one monster. Tags `oathwild2-*`,
cap `oathwild2:8.50` (US$0.30 margin). The two rigs (US$0.40) went through; the horse was refused at submit
("Exhausted balance") and work stopped there. **Round 2 spent: US$0.40** (total US$36.60).

| id | What | Notes |
|---|---|---|
| bandit-chief | Bandit chief, boss, 1.95 m, 4,371 triangles | holds the existing `orc-axe` + `shield` until his drawn `chief-axe` / `chief-buckler` are made |
| field-scarecrow | Field scarecrow, 1.9 m, 2,943 triangles | holds `zealot-sickle` until his drawn `rusty-pitchfork` is made |

**Placeholders** (`tools/oathwild-art.mjs` → `prototypes/oathwild/data/art.json`, re-run after every new model; a
made model replaces its placeholder by itself). Monsters: `fallback: { body, height, tint }` — horse → wolf (1.75 m,
chestnut; seat `[0, 0.875, 0.5]` m on `spine_2`, measured on the wolf), goblin-warchief → gobw-tripo, marsh-hag →
root-caller, barrow-king → wraith-knight, shrine-cultist → zealot, bog-lurker → drowned-brute, barrow-ghoul →
hollowborn, hill-ogre → bruiser, fen-harpy → winged-imp; summons `imp` → winged-imp (ready), `shade-double` →
hollowborn dark, `turret` → a cylinder. Props (97): `placeholder: { shape: box|cylinder|cone|house|rock|tree, size:
[wide, tall, deep] m, colour }`, colour = the drawing's mean colour, size from the planned height/length and the
drawing's proportions. Every `art` id in `prototypes/oathwild/data/*.json` resolves to a model or a placeholder.

### Four-legged animals (free rig)
`quad_rig.py` as for the wolf, plus `--straighten`: a three-quarter drawing can come back turned (the lion ~20°, both
front feet on one side of the middle line, so the feet were paired wrongly); the body is turned so its long axis runs
along Y first. `--tail-floor` ignores ground points in the last 20 % (a tail tip resting on the ground off the middle).

### Scenery pipeline (`tools/scenery.sh <sheet>`; data in `data/scenery.json`)
1. `refdraw.mjs <sheet>` — Codex draws FOUR objects on a 2×2 sheet (kind `scenery4`): three-quarter view from the
   front-left and a little above, chunky low-poly painted style, no ground (free).
2. `tools/scenery-sheet.py <sheet>` — finds the gutters, trims and re-centres each object in its quarter, flattens the
   background, records each object's mean colour (`ref/sheet-<sheet>.colors.json`); refuses a sheet whose objects cross.
3. Trellis-2 1024, `decimation_target` 20000 (5000 is its minimum), texture 2048 → `models/scn-<sheet>/` (US$0.30).
4. `split_sheet.py --tex 2048` → `models/scenery-raw/<id>.glb` (git-ignored).
5. `tools/blender/scenery.py <ids>`: drop loose specks; square the footprint to the axes (`align`, `yaw`); real size
   (`h` tall or `w` long, metres); origin = middle of the footprint on the ground; **outside skin only → thicken →
   voxel remesh → collapse to `tris`** (see lessons); its **own texture**: new UVs, colour baked from the full-detail
   original (selected to active), lifted toward the drawing's colour; matte; WebP → `models/final/scenery/<id>.glb`.
   Per-object options: `vox` (remesh voxel size share, default 0.006), `remesh: false` (thin poles), `src` (another raw
   file), `job` (which paid job made it), `stage: false` (not used).
6. Look: `tools/blender/scenery_look.py <dir> [--back] <glbs>` (three-quarter close-ups with a 1.8 m post) +
   `tools/scenery-contact.py <dir> <out.png>` (labelled sheet: name, triangles, size).
7. `build-catalog.mjs` → catalog `scenery: [{ id, name, kind, regions, file, triangles, size: [wide, tall, deep] m, tex,
   kb, job, cost }]`; the page's **Scenery** tab (`js/scenery-page.js`) shows them one at a time or as a real-size
   line-up beside the 1.8 m man, with kinds/regions filters and a table.

### Lessons (what failed → the rule now)
- **Trellis makes hollow double walls** (a barrel = outside and inside wall a few mm apart): a straight cut-down folded
  them through each other (black flaps, holes, a lumpy barrel at 400 triangles). → cut down a rebuilt closed surface,
  never the raw shell; bake the colour from the untouched original.
- **UV seams stop the collapse** (crate stuck at 1,071 of 200). → throw the UVs away before cutting down; make new ones
  after and bake.
- **Thin poles vanish in a remesh** (weapon rack). → `remesh: false` for slatted/poled things; use the maker's own lower
  count (Trellis `decimation_target` ≥ 5000 per sheet) instead.
- **Trellis paints darker than the drawing** (about 70 %). → lift each baked texture toward the drawing's mean colour.
- **Open lattice objects come back as lattices** (crate). → draw boxes as solid panels with painted planks.
- **A turned animal pairs its feet wrongly** (lion). → `quad_rig.py --straighten`.
- **One exported env var tags every child job** (the first scenery sheet ran with the enemies tag). → set `FAL_TAG` per
  command, never `export` it for a mixed batch.
- **The budget you are given is not the balance you have** (twice: US$3.40 of 25, then US$0.40 of 8.80). → stop at the
  first "Exhausted balance" and report; draw everything before paying so nothing free waits on money; ship placeholders
  for the rest so the game never waits on art.

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
Oathwild: `data/scenery.json`, `tools/scenery.sh`, `tools/scenery-sheet.py`, `tools/blender/scenery.py`, `tools/blender/scenery_look.py`, `tools/scenery-contact.py`, `tools/oathwild-resume.sh`, `js/scenery-page.js`, `models/final/scenery/`, `shots/scenery/`. Test 3 tools: `tools/run-body.sh` (whole body pipeline), `tools/blender/lowpoly.py`, `quad_rig.py`, `look.py` (quick renders).
