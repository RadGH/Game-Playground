# Overdrive Frame

**Status:** rounds 2 + 3 built 2026-11-18. Round 2: walkable hangar (assembly bay, parts dealer, workshop, paint bay, test range, launch pad), rolled loot, firmware chips, crafting (known/locked/secret), saved builds, pilot rank, cloud saves with the conflict kit. Round 3: Larkspur campaign map (9 districts), contracts, maker licences, mission types (convoy raid, sabotage, recovery, escort, hunt, nests, orbital drop), rival ace, the Broodmother boss. Round 1 LIVE 2026-11-18.
**Play:** LAN stable http://192.168.1.34:8400/prototypes/overdrive-frame/ (https for controllers: https://192.168.1.34:8442/prototypes/overdrive-frame/) · dev 8401 · public https://games.radgh.com/overdrive-frame/
**Next:** owner play-test of rounds 2 + 3, then round 4: online co-op (own server, rooms, drop in/out, bots) — docs/PLAN.md.
**Parked:** voice-over (owner: hold; text comms for now), seasons (until the game succeeds), Q/E view turning (owner finds it disorienting). Other sprite-game ideas: `playground/docs/ideas-sprite-games.md`.

Isometric co-op mech action in a neon city. Pick a maker's frame, drop into a district, and blow up swarms by the
hundred with a rival company's army mixed in. Everything on screen is a 3D model baked to pictures (Arcline's City
Kit + the new Mech Kit), so hundreds of enemies cost almost nothing to draw. Independent project by Radley Sustaire.

Read first: `docs/PLAN.md` §0 (owner rulings), `docs/OWNER-BRIEF.md` (every answer), `docs/ARCH.md` (code map,
contracts, scale).

## How it plays (round 1)
- **Move** W A S D (W = straight up the screen), **aim** with the mouse; left/right click fire the arms, Q/E the
  shoulders, Shift boosts, Space quick-boosts, F jumps (hold to hover), R sticks a lock on one target. Controller:
  twin-stick, triggers fire arms, bumpers fire shoulders, B quick boost, A jump, L3 boost, R3 lock.
- **Energy** (left arc) feeds boosting, hovering and energy weapons; run it dry and boosting stalls for a moment.
  **Heat** (right arc) rises with firing and boosting; past the limit the frame slows and takes damage until it cools.
- **Leg types** change movement: reverse joints jump high, quads fire steady, treads can't jump, hover legs slide.
- **Enemies** have one job each: swarmers chase, leapers pounce, spitters lob acid, brutes charge with armoured fronts
  (get behind them), troopers and tanks shoot, rocket trucks mark red circles before shells land, gunships strafe,
  snipers show a red line before firing, nests keep spawning. Burrowers, bloaters and jammers are rare on purpose.
- **The city breaks**: every building takes damage in four stages (whole, damaged, burning, rubble) and crushes what
  stands beside it when it falls. Fuel tanks and refineries blow up.
- **The hangar** (round 2): walk with the same controls; stand in a bay's circle and press G (controller X, touch Use). Contracts and the launch pad open the campaign board.
- **Grades** S–D set the pay; losing keeps what you picked up (no pay, never lose the frame).

## Files
| Path | What |
|---|---|
| `js/sim/` | The rules, pure (no screen): `mission.js` (state + step + events), `mech.js`, `weapons.js`, `enemies.js`, `damage.js` (types, crit tiers past 100%, status), `world.js` (buildings, wreck stages, collapse), `flow.js` (street pathfinding for swarms), `grid.js` (buckets), `citymap.js` (districts), `missiondef.js`, `loadout.js` (parts → numbers, rarity — the ONE stat function), `starters.js`, `grade.js`, `rng.js` |
| `js/hangar.js`, `js/range.js` | The walkable hangar hub (`Hangar`: walk to a bay, Use opens it — `onBay(id)`; bays: terminal, assembly, dealer, workshop, paint, range, pad) and the test range (`Range`: a Play mission that never ends, dummies at 48/112/208 m, meter panel `js/ui/range-panel.js` built on `meters/`). Maps in `js/sim/hangarmap.js` (same shape as a city map + `bays`, `decor`, `interior`); pieces in `citykit/js/kit/hangar.js`; floor drawn by `view.js` `_interior`; styles `css/hangar.css` |
| `js/render/` | `sprites.js` (City Kit bakes, lazy + pre-bake), `mechs.js` (Mech Kit layers), `view.js` (camera leads the aim, depth sort, see-through buildings, damage numbers), `events.js` (every event's look + sound), `props.js` (dropship, command drone, fuel tanks), `title-scene.js` (the workshop) |
| `js/ui/` | `screens.js` (title, contracts, drop, results, pause, settings), `hud.js` (cockpit frame, comms), `speakers.js`, `padnav.js`, `report.js` |
| `js/input/` | `bindings.js` (the one binding table), `controls.js` (keys+mouse, pad, touch → sim input) |
| `data/` | `tuning.json` (every feel number; ` key or `?tune`), `enemies.json`, `missions.json`, `changelog.json` |
| `js/hangar.js`, `js/range.js` | The walkable hangar hub (bays → `js/ui/bays.js` assembly + paint, `js/ui/shop.js` dealer + workshop) and the test range |
| `js/sim/` (round 2–3) | `loot.js` (rarity odds, bonus lines, crates), `chips.js`, `craft.js`, `progress.js` (rank, dealer), `inventory.js` (locker, saved builds), `campaign.js` (districts, contracts, licences), `ops.js` (mission types), `ace.js`, `boss.js` |
| `data/` (round 2–3) | `chips.json`, `recipes.json`, `crafted.json`, `paints.json`, `campaign.json`, `aces.json`, `test-missions.json` |
| `tools/balance.mjs` | Bot runs every maker's starter frame through test missions; read before changing strength |
| `tests/sim/*.test.mjs` | 25 node tests: same-seed replays, movement, energy, heat, crits, wrecks, chain blasts, locks, flanking, districts, missions can be finished and not by idling |

## History
- 2026-11-18 — rounds 2 + 3: hangar hub + bays, loot/chips/crafting/builds/paint, save v2 (round 1 saves upgrade), cloud saves; campaign map, contracts, licences, 7 mission types in `js/sim/ops.js`, story missions 4–9, rival aces (`js/sim/ace.js`, `data/aces.json`), Broodmother (`js/sim/boss.js`).
- 2026-11-18 — round 1 live. Owner report #1: smoke cut (no baked smoke balls), damaged looks bake in the background, loading only bakes the drop area + first waves (61 s → 21 s on the VM), dropship drop-in.
- 2026-11-17 — brainstorm (3 rounds + 11 questions), plan, round 0 kits (City Kit categories, wreck stages, workshop
  props, swarm + army enemies; new Mech Kit experiment), round 1 mission rules and screens.
