# Oathwild — placeholder art to replace later

Owner 2026-11-24: "OK to use old placeholder art as long as we eventually replace it, make a checklist so we can revise
them later." This is that list. Tick a row when its real model is in the game (art.json `status: ready`).

**How things are drawn today:** the 97 scenery stand-ins (plain boxes / cylinders / cones) are being swapped for
**free procedural models** from the playground's kits (ProcTown set pieces + building kit, Thousandvale props) —
they look finished, but they are not bespoke art. Everything below is "good enough now, real model later".

**Prices** are what fal.ai actually charged on this project (`avatar-3d/fal/data/spend.json`):
Tripo P1 textured model **$0.50** · Meshy rigging **$0.20** · Tripo quadruped rig **$0.30** · Trellis-2 sheet of
four small items in one picture **$0.30** (≈ $0.08 an item). Reference pictures come from Codex (free).
Estimates add **30 % for retries** (a model that comes out wrong is made again).

## Round 3 (2026-11-24) — what got made
Owner added US$50: "NO REDOS. Send them to me to review instead if there are problems." Spent **US$12.10**, **US$37.90
left** for feedback. Every model was made once. A model with a problem is **flagged for review** on the asset page
(`avatar-3d/fal/index.html?review=1` — Enemies, Scenery, Weapons) and stays OUT of the game: its id keeps the kit model /
fallback body (art.json rows carry `review: 'problem'` + `reviewNote`). Ticked rows below are real models in the game now.

**Waiting for the owner's review (not in the game):** palisade-wall, palisade-corner, woodpile, stone-wall-low,
tent-small, crate-stack, ruin-tower, goblin-hut, haystack, signpost, trough, boardwalk, barrow-entrance (scenery);
ow-shortbow (no string); hill-ogre (skin strip dragged by his arm) and fen-harpy (wings joined to the arms) — both still drawn on their stand-in bodies.

## Budget summary (the plan before round 3)

| Group | Count | How | Cost | + retries |
|---|---|---|---|---|
| Buildings | 6 | one Tripo model each | $3.00 | $3.90 |
| Props, camps, shrines, ruins, graves, walls, loot, bridges | 62 | Trellis sheets of 4 (16 sheets) | $4.80 | $6.25 |
| Monsters still on stand-in bodies | 8 | Tripo + rig | $5.60 | $7.30 |
| Horse | 1 | Tripo + quadruped rig | $0.80 | $1.05 |
| Summons (turret) | 1 | Tripo | $0.50 | $0.65 |
| Weapons with no own model (after reusing 7 we already paid for, below) | 9 | Trellis sheets (3) | $0.90 | $1.15 |
| Second armour look per tier | 20 | **free**: Tabard outfit paints | $0 | $0 |
| **Must-have total** | | | **$15.60** | **≈ $20.30** |
| Nature (rocks, trees, plants) — optional, the procedural ones are fine | 29 | Trellis sheets (8) | $2.40 | $3.10 |
| **Everything** | | | **$18.00** | **≈ $23.40** |

Item **icons** need no money: they are rendered from the worn 3D models (lessons rule 20).

## 1. Buildings (6) — Tripo, $0.50 each
- [x] smithy · [x] watermill · [x] watchtower · [x] lookout · [ ] goblin-hut (made, flagged: open shell) · [x] hag-hut
(Real already: cottage-thatch, cottage-stone, cottage-log, inn.)

## 2. Props (62) — Trellis sheets of four
Real now (round 3) unless named under "still waiting":
- [x] Town (11): well, market-stall, cart, lamp-post, anvil, wheelbarrow, scarecrow-post, wanted-board — still waiting: haystack, signpost, trough (flagged)
- [x] Walls (6): palisade-gate, fence-rail, spike-barricade — still waiting: palisade-wall, palisade-corner, stone-wall-low (flagged)
- [x] Clutter (5): barrel-open, junk-pile — still waiting: woodpile, crate-stack (flagged), crate (round 1 lattice)
- [x] Camps (9): bedroll, campfire, tent-large, banner-bandit, banner-village, goblin-totem, fish-rack, cage — still waiting: tent-small (flagged)
- [x] Loot (5): chest-common, chest-rare, chest-epic, loot-sack, stolen-goods
- [x] Travel (5): bridge-wood, bridge-stone, road-marker, rowboat — still waiting: boardwalk (flagged)
- [x] Shrines (9): all nine
- [x] Ruins (6): ruin-wall, ruin-arch, ruin-pillar, statue-broken, rubble — still waiting: ruin-tower (flagged)
- [x] Barrow (6): sarcophagus, gravestone-a, gravestone-b, gravestone-c, grave-fence — still waiting: barrow-entrance (flagged)

## 3. Monsters on stand-in bodies (8) — Tripo + rig, $0.70 each
Today each borrows another monster's body, tinted (`data/art.json` regions, `status: placeholder`).
- [x] goblin-warchief · [x] shrine-cultist · [x] marsh-hag · [x] barrow-king (boss) · [x] bog-lurker · [x] barrow-ghoul · [ ] hill-ogre (made, flagged) · [ ] fen-harpy (made, flagged)
(Real already, 24: bristleback, bandit-chief, field-scarecrow, wolf, thug, knifer, crossbowman, bounty-hunter, three goblins, brown-bear, mountain-lion … from the fal roster.)

## 4. Horse and summons
- [x] riding-horse — real saddled horse (round 3), seat measured on spine_2; the quest mare uses it too
- [ ] turret summon — Tripo $0.50
- [ ] shade-double summon — no money needed: the caster's own Tabard body, darkened

## 5. Items
Worn models today (`js/game/gear.js` WEAPON / SHIELD / PIECE): **15 weapon kinds share 5 models**, 6 shields share 4,
four armour looks (one per tier: cloth / leather / mail / plate).
- [ ] **Free first** — already paid for, not used by any game yet (`avatar-3d/fal/data/gear.json`, see
      `~/claude/docs/model-catalogue.md`): dagger, rapier, longsword, two-handed sword, two-handed axe, spear,
      crossbow and the tower shield. No money, but real work: they are fal models in the fal body's format, so each must
      be fitted to a Tabard hand socket first (the `avatar-3d/tabard` item pipeline), then mapped in `js/game/gear.js`.
- [x] Made round 3 and mapped in `js/game/gear.js` (Tabard `fal:<id>`): warhammer, halberd, quarterstaff, **wand, sceptre,
      orb, tome**; boss weapons warchief-cleaver, hag-staff, barrow-blade, chief-axe (held by their monsters)
- [ ] Still waiting: shortbow (made, flagged: no string — bows keep the horn bow), javelin, buckler, rusty-pitchfork,
      cultist-knife, ogre-club, chief-buckler
- [ ] A second look per armour tier — free: Tabard outfit paints (colour sets), no new models
- [ ] Item icons rendered from the models (free) — today one sword or shield glyph for every item

## 6. Nature (optional, 29) — procedural ones are fine
- [ ] Rocks (8): rock-small, rock-medium, rock-large, boulder, rock-cluster, rock-slab, cliff-chunk, boulder-mossy
- [ ] Trees (8): oak-a, oak-b, pine-a, pine-b, birch, willow, marsh-tree, dead-tree
- [ ] Plants (13): stump-a, stump-b, log, log-hollow, mushrooms, mushroom-giant, reeds, bog-plant, bush-a, bush-b, bush-c, fern, pumpkins

## How to run it when there is budget
`avatar-3d/fal/tools/oathwild-art.mjs` (jobs + spend record, hard cap per run) and `oathwild-resume.sh`; every paid
job is written to `avatar-3d/fal/data/spend.json` with its price, so the spend is always checkable.
