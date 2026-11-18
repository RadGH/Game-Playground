# Overdrive Frame — how the code is laid out

Read `PLAN.md` §0 first (owner rulings). This file is the map: where things live and the contracts between them, so
several helpers can build in parallel. Plain ES modules, no build step, three.js from `vendor/three` via the import map
the playground pages already use (copy `citykit/index.html`'s).

## Genres (docs/genres) and who leads what
- **Twin-stick shooter** leads movement, aim and the arena: move one way, aim another, camera sits between the mech and
  the aim point (`camera-leads-aim`), every shot flashes and kicks (`gun-kick`), enemies flash in before they are real
  and never next to a player (`spawn-warning`), each enemy kind has one readable job (`enemy-jobs`; floor 4 kinds).
- **Action RPG** leads loot, levels, builds, numbers (game-standards §5b loot rules: item cards add stats, compare
  always available, rarity is a real power step from ONE stat function — lessons 53).
- **Co-op** leads rooms, joining, shared pay, revive (game-standards §2, §7).

## Scale (one source: `citykit/js/iso.js`)
1 world unit = 1 tile = 16 m. A storey (`FLOOR`) = 0.22 units ≈ 3.5 m. Height of a **mech ≈ 0.75 units (12 m, ~3.5
storeys)**. Semi truck ≈ 1.0 × 0.16 × 0.25 units (16 m long, 4 m tall). Forklift ≈ 0.2 units tall. A crew figure ≈
0.11 units (1.8 m). Swarm "swarmer" ≈ 0.12 units long; brutes ≈ 0.4; a broodmother boss ≈ 1.5–2 units.
The game draws the city zoomed in (about 3× Arcline's 1×) and bakes at the scale it draws at.

## Experiments this game builds on
- `citykit/` — buildings, wrecks, props, enemies, vehicles. Baker (`js/bake.js`) turns a model into day + lights
  pictures with an anchor. Round 0 adds: a **category** per recipe (`genre`) with a filter on the page; **wreck
  stages** for every building (`js/kit/wreck.js`); swarm + army enemy recipes; workshop props.
- `mechkit/` (NEW, round 0) — mech parts + their stats, the layered bake, the dress-up page.

## Mech Kit contract (`mechkit/`)
- `data/parts.json` — EVERY part's stats and identity (data first; the game reads the same file):
  `{ id, name, slot, maker, tier, weight, …slot stats }`. Slots: `head`, `core`, `arms`, `legs`, `booster`,
  `generator`, `cooling`, `cpu`, `weapon` (with `mount: 'arm' | 'shoulder'`, `hand: 'one' | 'two'`).
  `data/makers.json` — the 4 makers (id, name, look, leaning, colours).
- `js/parts/*.js` — `addParts({ id: { build(p) → THREE.Group, sockets… } })` visuals keyed by the same ids. Internal
  parts (generator, cooling, cpu) also get a model (for their icon and the hangar), never shown on the mech.
- `js/rig.js` — assemble(build) → `{ legs, upper }`: legs face movement, the upper body (core + head + arms +
  shoulder/arm weapons + booster) turns to the aim. Legs give a **hip socket** per animation frame (height + sway),
  the upper body hangs on it.
- `js/bake-mech.js` — layered bake on top of citykit's Baker: each part baked alone in its assembled pose, per screen
  direction (16) × frame, giving `{ day, lights, paint, w, h, ax, ay, hip? }`. `paint` is a mask picture (R = primary,
  G = secondary, B = accent) the game tints at run time. Draw order per direction: far-side arm/shoulder → core/head
  → near-side; legs under all. `composeMech(ctx, layers, legDir, aimDir, frame, paint, t)` draws one mech.
- Animations: legs `idle, walk, boost, jump, hover, land, quickboost (lean), down`; upper `idle, fire-L, fire-R,
  fire-shoulder` (recoil), `down`.
- The dress-up page (`mechkit/index.html`) uses composeMech — what you see there is what the game draws.

## The game (`prototypes/overdrive-frame/`)
```
index.html, css/, data/ (tuning.json, changelog.json, weapons.json, enemies.json, missions.json, loot.json…)
js/sim/      PURE (no DOM): seeded rng, now() passed in. Mission state, mechs, weapons, projectiles, enemies + grid
             buckets, damage/crit/status, destruction, loot rolls, grades. The co-op server (R4) runs these files.
js/render/   sprite cache (bakes lazily in idle time, like arcline/js/render/sprites.js), map + depth sort, fade
             buildings in front of mechs, fx (sparks, explosions — live particles), title workshop scene.
js/ui/       title, ☰ menu, HUD (energy, heat, ammo around the mech), hangar stations, dialogs (shared/dialog.js).
js/input/    one binding table: keyboard+mouse, controller (twin-stick), touch fallback. W = screen north.
server/      (R4) the co-op room server: main.mjs (ws + 30 steps/s), hub.js (rooms by code), room.js (seats, mission,
             snapshots, drop in/out), data.js. js/net/: protocol, snap (changes-only), mirror (browser copy), client.
tests/       node unit tests (sim) + Playwright specs + walk.mjs (strict: true).
```
Memory budget: bake only what a mission uses; wreck stages bake on first hit; lights layer only when it is night.

## Co-op (round 4)
- **Authoritative server** (`server/`) runs `createMission`/`stepMission` for every room — the browser never runs the
  mission's rules in co-op. Rooms in memory; nothing on disk. Live: Caddy routes `wss://games.radgh.com/ws/overdrive-frame`
  to 127.0.0.1:8620 (RGS games.json `server` field); LAN: dev 8621/8623, stable 8620/8622 (`js/net/client.js serverUrl`).
- **Mirror**: each browser builds the same mission (`js/net/mirror.js makeMirror`: same def, same roster → same city, same
  ids), clears its enemies, then applies snapshots (`js/net/snap.js`). The socket is ordered, so a snapshot is the list
  of CHANGES since the last one (enemies by field, damaged buildings, objectives/ops when their JSON changes); shots,
  strikes, mechs are sent whole. A player arriving mid-mission gets one `full` snapshot. Events go with each snapshot
  and drive the same `render/events.js` + HUD as solo.
- **Your own frame** is predicted: `NetPlay` runs `stepMech` on your input at once, numbers each input (`s`), and on each
  snapshot puts the frame where the server says after input `ack`, then runs the newer inputs again. The server uses
  one input per step; a late input is stood in for by the last one and then counted as used (`owed`); during the drop
  it keeps only the newest two (a cushion). Weapons fire on the server only.
- **Contracts in co-op** are rebuilt on the server from the host's `played` + `grades` (`contractsFor`) — a browser
  never sends a mission. Builds are checked part by part (`protocol.js cleanBuild`), and the server works out the
  frame's numbers itself (`mirror.js frameFor`).
- **Results**: everyone gets the full `result` (`perPlayer` has names/bots); each browser applies its own share with its
  own pid, loot tier = `levelTier(own rank)` (`progress.js`). Enemy health/count per extra frame: `partyScale` in
  mission.js (tuning `coopHealth`, `coopCount`).
