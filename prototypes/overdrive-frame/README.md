**Status:** round 7 (Variety) built 2026-11-18: one-maker start, part mods, a dealer with no Commons, repair kit, Frame Tuning + skills (Tuning rig bay), 8 new mechs with set bonuses, 16 new weapons with cryo/void, 7 new city layouts; reputation removed. Rounds 1–6 LIVE.
**Play:** LAN stable http://192.168.1.34:8400/prototypes/overdrive-frame/ (https for controllers: https://192.168.1.34:8442/prototypes/overdrive-frame/) · dev 8401 · public https://games.radgh.com/overdrive-frame/ · co-op server: LAN dev `tools/game-servers.sh start overdrive-frame-dev` (8621 / wss 8623; stable 8620 / 8622), live wss://games.radgh.com/ws/overdrive-frame
**Next:** owner play-test of round 7 (mods, tuning, skills, layouts); megablock raised walkways (need lots you can walk under); the plan's later items (endless + dailies, station hull) — docs/PLAN.md.
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
- **Co-op** (round 4): title or hangar ☰ → Co-op. Host a room (you pick missions from your own city board; empty seats
  can be bots) or join with the 4-letter code / QR / link (`?code=ABCD` joins at once). Up to 4 frames. Drop in or out
  mid-mission; a lost connection keeps your seat for 90 s while a bot flies your frame. Stand next to a downed teammate
  to revive (the ring fills); **C** (controller d-pad up) pings the spot under your aim (an enemy there gets marked).
  Pay is never split; enemies get tougher per frame (tuning: Co-op group); each player's loot rolls at their own rank.
  Solo: the briefing's "Bots with you" brings 0–3 bot teammates.

## Files
| Path | What |
|---|---|
| `js/sim/` | The rules, pure (no screen): `mission.js` (state + step + events), `mech.js`, `weapons.js`, `enemies.js`, `damage.js` (types, crit tiers past 100%, status), `world.js` (buildings, wreck stages, collapse), `flow.js` (street pathfinding for swarms), `grid.js` (buckets), `citymap.js` (districts), `missiondef.js`, `loadout.js` (parts → numbers, rarity — the ONE stat function), `starters.js`, `grade.js`, `rng.js` |
| `js/hangar.js`, `js/range.js` | The walkable hangar hub (`Hangar`: walk to a bay, Use opens it — `onBay(id)`; bays: terminal, assembly, dealer, workshop, paint, range, pad) and the test range (`Range`: a Play mission that never ends, dummies at 48/112/208 m, meter panel `js/ui/range-panel.js` built on `meters/`). Maps in `js/sim/hangarmap.js` (same shape as a city map + `bays`, `decor`, `interior`); pieces in `citykit/js/kit/hangar.js`; floor drawn by `view.js` `_interior`; styles `css/hangar.css` |
| `js/render/` | `sprites.js` (City Kit bakes, lazy + pre-bake), `mechs.js` (Mech Kit layers), `view.js` (camera leads the aim, depth sort, see-through buildings, damage numbers), `events.js` (every event's look + sound), `props.js` (dropship, command drone, fuel tanks), `title-scene.js` (the workshop) |
| `js/ui/` | `screens.js` (title, contracts, drop, results, pause, settings), `hud.js` (cockpit frame, comms), `speakers.js`, `padnav.js`, `report.js` |
| `js/input/` | `bindings.js` (the one binding table), `controls.js` (keys+mouse, pad, touch → sim input) |
| `server/` (round 4) | The co-op room server: `main.mjs` (http + WebSocket, 30 steps/s, `/healthz`, `/status`), `hub.js` (hello, rooms by code, public list, protocol checks), `room.js` (seats, host tools, mission pick — contracts rebuilt from the host's board —, loading, input cushion, snapshots, drop in/out, results), `data.js` (reads the same data as the page). Ops: `ops/start.sh`, units linked not enabled |
| `js/net/` (round 4) | `protocol.js` (messages, limits, input packing, `cleanBuild`), `snap.js` (changes-only snapshots + apply), `mirror.js` (the browser's copy of the mission; `frameFor` shared with the server), `client.js` (`Net`: connect, token, rejoin, `serverUrl`) |
| `js/netplay.js`, `js/ui/coop.js` | `NetPlay` (a `Play` drawing the server's mission: own frame predicted with `stepMech` + corrected, others from buffered snapshots), the Co-op screen + Room. `js/sim/bots.js`: bot teammates |
| `data/` | `tuning.json` (every feel number; ` key or `?tune`), `enemies.json`, `missions.json`, `changelog.json` |
| `js/hangar.js`, `js/range.js` | The walkable hangar hub (bays → `js/ui/bays.js` assembly + paint, `js/ui/shop.js` dealer + workshop) and the test range |
| `js/sim/roles.js`, `js/render/roles-art.js` (round 5) | Enemy roles: flame (Flamer: pilot-light flicker, then a fire cone that burns), shieldgen (Bulwark: a dome that softens hits on army units inside — `shieldMul` in `damageEnemy`), heal (Field medic drone: beams the most hurt army unit, keeps away from frames, runs when shot), drift (Spore drifter: bursts into `S.clouds`, the `slow` status in `damage.js`/`mech.js`). Halden-Voss line frames `hv-light`/`hv-heavy` = `data/aces.json` `grunts` on the ace machinery (several at once, no comms, elite loot). Co-op: `E_FIELDS` shielded/healing, clouds + frame slow/burn in snapshots. Tests `tests/sim/roles.test.mjs`, `tests/net/roles-net.test.mjs` |
| `js/sim/` (round 2–3) | `loot.js` (rarity odds, bonus lines, crates), `chips.js`, `craft.js`, `progress.js` (rank, dealer), `inventory.js` (locker, saved builds), `campaign.js` (districts, contracts, licences), `ops.js` (mission types), `ace.js`, `boss.js` |
| `data/` (round 2–3) | `chips.json`, `recipes.json`, `crafted.json`, `paints.json`, `campaign.json`, `aces.json`, `test-missions.json` |
| `js/sim/` (round 7) | `mods.js` (part mods: weapon mods change the spec — split barrel, wide blast, elements, ricochet, gravity core…; frame mods add rules), `tuning.js` (Frame Tuning: 4 boards × 5 rows, keystone pairs, points = 2 a rank + 1 a story mission, `cleanTuning` for the server), `skills.js` (8 active skills by rank), `kit.js` (repair kit Mk I–V), `perks.js` (THE runtime for kit, skill and every frame rule — from mods, tuning keystones and set bonuses), `frames.js` (frame lines → set bonuses; 3 parts of a line) |
| `js/ui/tuning.js`, `js/render/perks-art.js` (round 7) | The Tuning rig bay (boards, skill picker, frame lines) and every skill / frame-rule look + sound (event-driven, so co-op draws them for free) |
| `tools/balance.mjs` | Bot runs every maker's starter frame through test missions; read before changing strength |
| `js/sim/weapon-fx.js`, `js/sim/weapon-kinds.js`, `js/render/weapons-art.js` (round 7) | Weapons that change what a gun does. **Elements** in `damage.js`: cryo (chill slows; 3 chills within 3 s → frozen 1.5 s, then 2 s immune; bosses/aces only chill) and void (ignores resistances + front armour; rift tugs toward the hit). **Effect fields** on any spec (part mods set them): `ricochet` n, `chainOnHit` { jumps, chance }, `seek` rad/s, `echo` 0..1, `vortex` { r, t, pull, dps }, `cluster` n, `napalm` s, `leech` 0..1, `overkill` 0..1 — `weapon-fx.js` makes them happen (zones `S.zones`, bomblets `S.bomblets`, echoes `S.echoes`; capped per kind). **16 new weapon parts** (mechkit parts.json, kinds in `NEW_KINDS`): sweep lance, prism laser, orbital lance, wave scythe, rift needler (Celerity); cluster mortar, gravity well launcher, cryo projector (Brannoch); arc coil, seeker orbs, storm caller, nanite sprayer (Calyx); firepot lobber, returning saw disc, ricochet gun, spark carbine (Patchwork). `weaponSpec` calls `extraSpec` once at the end. Looks + sounds: `weapons-art.js` (hooked once each from view.js and events.js). Co-op: zones `Z`, bomblets `bl`, enemy status bits `look`, shot `look` in `snap.js`. Bots: `BOT_USE`. Tests `tests/sim/weapons-r7.test.mjs`, `tests/net/weapons-net.test.mjs` |
| `tests/sim/*.test.mjs` | 25 node tests: same-seed replays, movement, energy, heat, crits, wrecks, chain blasts, locks, flanking, districts, missions can be finished and not by idling |

## History
- 2026-11-18 — round 7, Variety (owner, after playing to rank 5): a new pilot picks ONE maker's starter frame (+ its firmware chip); part **mods** that change how parts work (`docs/R7.md` is the contract); the dealer never sells Commons (rarity climbs with rank, a featured Prototype+, firmware chips on the shelf); drops a step rarer; early crates always carry a chip; a **repair kit** (key 1, 30% at Mk I, Mk V at the workshop); **Frame Tuning** (talent boards) + **skills** (key 2) at the new Tuning rig bay; 8 new frame lines (2 per maker, Mech Kit) and set bonuses for 20 lines; reputation + licences removed; save v3. Helpers: frames (merged), weapons, maps.
- 2026-11-18 — round 6, the Outskirts (owner: "outdoor areas … a change of scenery"): regions on the campaign map; forest, desert and snow areas by three helpers in worktrees, merged on `of-r6-lead`. Also live today: owner reports 87–89 (target arrows, minimap + mission map, Hold the Line 4 min).
- 2026-11-18 — round 5: Overload cores, stages + checkpoints, versus, Proving Ground, five enemy roles, the Juggernaut, the moon (3 helpers in worktrees + lead; merged on `of-r5-lead`). 160 sim + net tests. Bot callsigns no longer share the handler's name. Phone boss bar is one row of pips.
- 2026-11-18 — round 4: online co-op. Server runs `js/sim` (0.17 ms a step for 4 frames + 120 enemies); snapshots carry only changes (~21 KB/s a player before compression, deflate on); own frame predicted with `stepMech` and corrected (0 visible corrections under a jittery line in `tests/net`); a 2-input cushion built during the drop; bots (`js/sim/bots.js`); rooms, drop in/out, host tools; live through Caddy at `/ws/overdrive-frame` (RGS games.json `server` field). 11 net tests + 8 bot tests.
- 2026-11-18 — rounds 2 + 3: hangar hub + bays, loot/chips/crafting/builds/paint, save v2 (round 1 saves upgrade), cloud saves; campaign map, contracts, licences, 7 mission types in `js/sim/ops.js`, story missions 4–9, rival aces (`js/sim/ace.js`, `data/aces.json`), Broodmother (`js/sim/boss.js`).
- 2026-11-18 — round 1 live. Owner report #1: smoke cut (no baked smoke balls), damaged looks bake in the background, loading only bakes the drop area + first waves (61 s → 21 s on the VM), dropship drop-in.
- 2026-11-17 — brainstorm (3 rounds + 11 questions), plan, round 0 kits (City Kit categories, wreck stages, workshop
  props, swarm + army enemies; new Mech Kit experiment), round 1 mission rules and screens.
