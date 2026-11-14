# Hullforge

**Status:** round 2 done 2026-11-14 — on top of round 1 (Shipyard with automatic corners, eight animated turrets, 6-direction flight, mining, stations, star map): Voidwright-style effects (spiral beams, tracers, debris, knockback), trade goods, research, insurance, Workshop crafting, blueprints, turret arc preview, 2×2×2 big blocks, factions + standing, jobs, encounters, planet outposts with raids, drones, harpoon, scanning. Desktop only (owner ruling). Lint clean, every module connected, every screen walked.
**Play:** LAN `http://<LAN IP>:8400/prototypes/hullforge/` (stable; https 8442 for a controller) · dev 8401 · not on games.radgh.com yet (owner decides)
**Next:** the owner's first play-test (he hasn't played yet) — mouse flight feel, corner looks on his builds, effects, then pacing of jobs/outposts/research money
**Parked:** mercenaries/wingmen (owner 2026-11-14) — see `docs/PLAN.md` §3

A 3D space game where you build your ship out of cubes, like stacking blocks, then fly it in every direction, mine,
fight and grow it. The 3D cousin of Voidwright (`../voidwright/`). Owner's request and answers: `docs/PLAN.md` §0.

## How it plays
- **Fly**: W/S forward/back, A/D slide, Space/C rise/sink, Q/E roll, Shift boost (cruise ×3.4 when no enemy is within
  1.5 km). The mouse aims: the ship's nose turns toward the crosshair at its turn rate (a small ring shows where the nose
  points now). Click the view to capture the mouse; Esc frees it and opens the menu.
- **Fire**: hold left mouse — every turret that can reach the crosshair fires at it (a tick per turret on the crosshair
  ring shows how many can). Turrets also aim and fire **on their own** at the nearest enemy (or your locked target),
  as many as your bridge + targeting computers allow; mining lasers only fire when you hold Fire.
- **Lock** (R / right mouse): the enemy nearest the crosshair. A lead marker shows where to aim so shells meet it;
  missile pods fire only at a locked target.
- **Dock** (F) near a station. Station: Launch, **Shipyard** (build), Outfitter (buy/sell parts, stock changes on each
  arrival), Market (sell ore, prices differ per system), Repair, Star map, Hold, Goals.
- **Star map** (M): jump along the lines to linked systems, out of combat. Danger 1-6 rises with distance from home;
  each star shows a suggested ship rating against yours. Danger 4+ systems have a capital ship.
- **Losing**: a ship comes apart when its **bridge** is destroyed or it is down to **30%** of its block health
  (`stats.js BREAK_AT`). You wake at the station with the ship rebuilt; ore is lost, parts never are, the rebuild bill is
  60% of a full repair (only as much as you have).

## Building (the Shipyard, `js/ui/builder.js`)
- Cubes only, one 1 m cell each. Left click a face to place the selected block there, right click to remove (refund).
  Drag / arrow keys turn the camera, wheel zooms, middle click picks a block's type and paint. X = mirror across the
  bridge's column; Ctrl+Z / Ctrl+Y undo/redo (200 steps). Paint any structure block with 12 paints.
- Structure blocks (`data/blocks.js STRUCTURE`): Light frame, Hull, Armor (45% less from kinetic), Window (lit glass,
  looks only) — bought per block. Everything else is a **part item** from the hold (Mk I-IV × 5 rarities).
- **Facing** comes from the face you click: a thruster put on a back face points its nozzle back (pushes forward); a
  turret put on a top face looks up. A turret's gun cell and a thruster's flame cell must stay empty (refused with the
  reason on the cursor).
- **Swapping**: click a fitted part with another part of the same kind selected → they swap (this is how you fit a
  bigger bridge). The bridge can't be removed; nothing may be cut loose from it (refused, with the count).
- **Block limit** comes from the bridge (Mk I 90, II 180, III 360, IV 720; rarity adds a little).
- Live numbers: speed, pushes per direction, turning, hull, shield, power made/used, damage per second, auto-aim count,
  automatic corner count, with plain-language problems (can't launch) and warnings.

## Automatic corners (`js/sim/corners.js`, owner 2026-11-14)
Wherever cubes make a staircase, a cosmetic wedge fills the gap — computed as plain data (`cornerPlan`), drawn by
`render/ship-mesh.js`, tested in `tests/corners.test.mjs`:
- **1×1 gap** (a step one cell high and one cell long) → a 45° wedge in the gap cell.
- **1×2 gap** (one high, two long) → a half slope spread over two cells (`w12a` 1 → ½ high, `w12b` ½ → 0); turned on
  its side it also smooths steep 2-up-1-over steps.
- Treads 3+ long stay square (a flat deck beside a tall wall), one-wide notches stay square, pockets with a ceiling stay
  empty. All 24 orientations are tried (6 floor directions × 4 wall directions). Only structure/rock/station blocks make
  corners; parts never do, and the cell in front of a turret or a nozzle is never filled.
- A 45° wedge takes its colour from one of its two legs (never a window). The Shipyard's "Show automatic corners"
  switch draws the ship without them to compare. Corners have no hit points and no mass; they are rebuilt whenever a
  block is placed or shot off.

## Turrets (`js/render/turrets.js` draws; `js/sim/world.js turrets()` aims)
Each turret is base → yaw ring (turns about its mount face) → pitch cradle → barrels, aimed every step by the sim with a
turn-rate limit (`partStats(...).turn`), with a slow idle sweep when there's nothing to shoot. Arc: anything above the
mount face and a little below it (pitch −17° … 86°); shots pass through your own hull (Voidwright ruling 8). Kinds:

| Kind | Look and motion | Fire |
|---|---|---|
| Autocannon | boxy housing, twin barrels that kick back one after the other | shells |
| Gatling | drum + six barrels that spin up while firing and wind down after | fast shells |
| Pulse laser | hex emitter, three focusing rings that light up, lens at the tip | instant beam pulses |
| Railgun | two long rails, coils fill with blue light while charging, the slide slams back | one piercing slug (up to 3 blocks) |
| Flak cannon | squat armoured box, four short barrels firing in turn, a radar fin always turning | bursting shells, shoots missiles first |
| Missile pod | tube box with hatch doors that open when it has a target, tube caps flash on launch | 2 homing missiles at the lock |
| Plasma lance | glass bulb of green plasma that pulses and swells before a shot, ribbed barrel | slow splashing bolts |
| Mining laser | yellow-striped arm, crystal emitter, rings spinning round the beam | continuous beam, ×5 on rock |

Rarity shows as a coloured band round the base; Mk II-IV turrets are bigger.

## Numbers that matter
- One function makes every part number: `sim/items.js partStats` (Mk lift `TIER_LIFT` 1/1.5/2.2/3.1, rarity lift
  1/1.14/1.32/1.58/1.95). Ship stats from blocks: `sim/stats.js computeStats`.
- Fairness (lessons-from-games rules 39, 54): enemy guns ×0.72 (`world.js ENEMY_DMG`); no enemy missiles before danger 2,
  no railguns/lasers before danger 3 (hive ships excepted), at most one missile pod per enemy ship (`shipgen.js`);
  a blast's damage is **shared** between the blocks it reaches, at most `BLAST_SHARE` (2×) its listed damage in total —
  before that rule one missile did ~13× its damage (found by the duel test, 2026-11-14). 6 s safe launch; no fighting in
  the station's 750 m safe zone; ally bumps never hurt.
- Duel check: `tests/sim.test.mjs` "Wasp vs one danger-1 pirate" — resolves in 4-90 s with both sides shooting.

## Economy and stations (round 2, 2026-11-14 — owner: "implement the other features except for mercenaries")
Plugged in from `js/ui/economy-ext.js` through `app.services` / `app.hooks`; maths in pure `js/sim/` files, tested in
`tests/economy.test.mjs`.
- **Trade** (`sim/economy.js`, `ui/trade.js`): 12 goods; each station runs one of 7 economies that makes some goods
  (55-72% of base price, big stock) and needs others (130-160%, small stock). Price = base × (normal stock ÷ stock)^0.35
  (clamped 0.5-2.6) × event, ±6% buy/sell spread, so a round trip at one station always loses. Buying/selling moves
  stock; stock drifts back (63% in 10 min of play). Events per 15-min window, 35% chance: shortages ×1.5-2.1, gluts
  ×0.55-0.6. Prices are remembered on every dock; the screen shows the best sale seen elsewhere, profit per unit and
  how many fit. Goods share the hold with ore (`state.js cargoUsed`; HUD says "Cargo").
- **Research lab** (`sim/research.js`, `ui/research-ui.js`): 19 nodes in 5 branches × Mk I-IV, costs 500/1,400/3,600/
  8,000 cr plus ore (iron → iridium). Ship bonuses ride on the grid (`g.bonus`, set by `designGrid`/`liveGrid`) and are
  applied ONLY in `stats.js computeStats` (turret turn: `body.js refresh`); repair discount in `repairCost`; Outfitter
  Mk in `shopStock`; mining yield in the ore-pickup hook; trade edge in `prices`; craft luck in `craftOdds`.
  "Heavy frames" sets `researchUnlocked(G, 'blocks2x2')` for the Shipyard's 2×2 blocks.
- **Insurance** (`sim/insurance.js`, `ui/insurance-ui.js`): Basic 50% off the rebuild bill (premium 18% of the bill),
  Full 90% off + cargo kept (40%); one claim per policy; upgrading costs the difference. `death.js` reads `deathBill`.
- **Workshop** (`sim/craft.js`, `ui/workshop.js`, `ui/reel.js`): craft any part Mk I-IV from its Mk's two ores (55% of
  the shop price in ore + 10% fee); up to 3 steps of the next band's ore raise rarity odds (weights 60/26/10/3.4/0.6 ×
  e^(rarity × luck × 0.8)). Every craft rolls one workshop bonus (`item.bonus`, 4-10% at common, +30% per rarity step,
  applied in `items.js partStats`, shown on the card). Improve: re-roll the bonus, or try for a better rarity (never
  goes down). A rarity reel (from Voidwright) spins on the real odds.
- **Shipyard**: Blueprints (save / load / delete; `sim/blueprints.js`, `ui/blueprints-ui.js`) — loading fits the parts
  you own, lists missing ones, charges structure minus a refund of the current hull, one undo step. Turret arc preview
  (`ui/turret-arc.js`): a dome over the mount face, −17° … 86°, while placing a turret or pointing at one.

## Effects (round 2, owner: "graphics updated like we did in voidwright with multiple spiral beams for mining lasers and extra effects for everything else")
- Beams (`js/render/beams.js`): soft glow + coloured mid + white core, emitter glow, hit bloom (blue on shields), helix
  strands round the beam — 1 → 2 → 3 → 4 strands as `vis` = (Mk − 1) + rarity grows; mining lasers always at least 2,
  epic+ parts use their rarity colour; sparkles at vis 3+ (not on Low graphics); pulse lasers shimmer with heat.
- Every line-like effect (beams, strands, tracers, rail lines, muzzle cones, spark streaks, engine trails) is a
  camera-facing ribbon in ONE batched mesh (`js/render/streaks.js`), never thinner than ~1.4 px.
- Per-weapon muzzle flashes, tracers and impacts in the damage colour; railgun line + shock rings; plasma scorch marks
  that ride on the hull; burning/smoking damaged blocks; red-hot tumbling cube debris (pooled InstancedMesh);
  bigger explosions (capital deaths huge); engine trails when boosting; a red screen-edge flash when your ship is hit.
- Knockback (`js/sim/world.js` KNOCK_* constants): hits shove ships by damage over mass, explosions push outward,
  railguns/plasma kick back; stations never move, big rocks barely. All effect pools are warmed at load (rule 29).

## World systems (round 2) — full write-up in `docs/WORLD.md`
- **Factions + standing** (`sim/factions.js`, L): traders, patrol, pirates, the Hive; hurting one pleases its rivals;
  standing changes job pay, ore prices, job count; Hated factions shoot you, Liked pirates leave you alone.
- **Jobs board** (`sim/missions.js`, K): recovery (harpoon it home), delivery, clear a site, escort, survey (scan),
  acquisition; up to 3 at once, HUD markers, abandon with a styled confirm.
- **Encounters** (`sim/encounters.js`): convoys under attack (help or rob), wandering merchants, anomalies, derelicts,
  distress calls, wanted captains, ambushes.
- **Planet outposts** (`sim/outposts.js`): found at the orbit spot (F), modules × 3 levels, output piles up over play
  time, warned raids every 30-55 min (fight them here, or settled on paper by turret level — never destroyed). Their
  R&D lab makes research points that pay part of research (`sim/research.js RP_VALUE`).
- **Drones** (Drone bay part, B), **harpoon** (G fire / let go, T reel in), **scanning** (V; Scanner part for range).

## Big blocks (round 2)
2×2×2 Heavy frame / Heavy hull / Heavy armor (`data/blocks.js`, `size: 2`), unlocked by the Heavy frames research.
One block toward the bridge's limit — the way to build capital ships. The grid keeps two maps: `g.cells` (one entry per
block) and `g.occ` (one per cell; `get`/`has` read it) — add/remove only through `put`/`remove`. Capital enemies are
plated with big armor (`shipgen.js bigify`). Tests: `tests/bigblocks.test.mjs`.

## Code map
- `js/sim/` (pure, node-testable): `grid.js` (block grid, packed keys, save rows), `corners.js`, `stats.js`, `items.js`,
  `body.js` (bodies, turret frames `FACE_BASIS`), `hit.js` (ray walk through the grid), `world.js` (60 Hz step:
  flight, collisions, turrets, shots, blasts, break-off, loot), `ai.js`, `galaxy.js` (14 systems, `populate`),
  `shipgen.js` (starters, enemies, rocks, stations), `state.js` (save, design vs damage, shops, repair), `goals.js`.
- `js/render/`: `ship-mesh.js` (hull geometry + corner wedges, one shared material with tinted glow), `atlas.js`
  (block face textures drawn at load), `turrets.js`, `views.js` (one view per body, flames, shield bubble, `buildModel`),
  `fx.js` (pooled particles, tracers, beams, flashes — no materials made or disposed mid-fight), `sky.js`, `env.js`.
- `js/ui/`: `hud.js`, `title.js`, `menu.js`, `station.js`, `builder.js`, `starmap.js`, `hold.js`, `goals-ui.js`,
  `death.js`, `cards.js`, `dom.js`, `padnav.js` (copied from Voidwright).
- `js/main.js`: modes, smooth drawing between sim steps (`snapPrev` / `pose`), the mouse-aim camera rig, events → effects
  and sound, docking, jumps, death, `window.gameEye`.
- Tests: `node --test prototypes/hullforge/tests/*.test.mjs` (corners, sim, saves, duel); `node tools/walk-screens.mjs
  hullforge` (every screen, desktop only via `views` in `tests/walk.mjs`). `tools/look.html` shows the starters, an
  enemy, a rock and the eight turrets in a turntable view (dev only).

## History
- 2026-11-14 round 2 — owner: implement the parked systems except mercenaries + Voidwright-style graphics. Built by
  three helpers in parallel (effects / economy / world) on plug-in points (`app.hooks`, `app.services`, `app.menuItems`,
  `w.hooks`), merged and joined up by the lead (research points, 2×2 blocks).
- 2026-11-14 — started from the owner's request (3D Voidwright, Minecraft-like blocks, automatic 1×1 and 1×2 corners,
  distinct moving turrets). First build done the same day. Found and fixed during the build: blast damage counted per
  block (13× too strong), danger-1 pirates 4× too big, starter thrust too low.
