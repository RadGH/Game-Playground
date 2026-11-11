# Rogueloot

A co-op action RPG for 1–4 players: Thousandvale's items and mechanics under a Diablo-style angled camera, with combat
paced like vanilla WoW (1.5 s global cooldown, cast bars). Act 1 covers levels 1–20. Chibi 2.6 characters, no voices.

**Read `docs/PLAN.md` first.** §0 holds the owner's ~50 rulings from the 2026-11-10 question rounds, and they override
everything else. §3 lists the 33 milestones. Checklist: `~/claude/agent/rogueloot-checklist.md`.

## Run it

| What | Where |
|---|---|
| Dev server (working tree) | `node server/main.mjs --port 8581 --https-port 8583` → `http://<LAN IP>:8581/` |
| Stable LAN copy | 8580 / https 8582 (publish script comes in M2) |
| Live | https://rogueloot.games.radgh.com/ (`cd ~/claude/rads-game-server && tools/deploy.sh update playground rogueloot`, after `tools/publish-stable.sh` + `tools/publish-pages.sh` in the playground) |
| Unit tests | `node --test tests/sim/*.test.js` |

`npm install` once in this folder for `ws` (or copy Knockabout's `node_modules`).

## How it fits together

- `js/sim/`: the PURE world sim (seeded rng, fixed 20 Hz step, no clocks/DOM). `world.js` (players, step, snapshot),
  `move.js` (the ONE walking rule, used by the sim *and* by the client's own prediction), `area.js` (M1's test meadow;
  M10 swaps in hand-made zone JSON with the same shape), `rng.js`.
- `js/net/`: `protocol.js` (frames, rate limits, room codes) and `hub.js` (rooms: create/join by code, roster, inputs,
  snapshots every 2nd step). The hub is pure, so the **solo game runs the same hub inside a Worker**
  (`js/client/solo-worker.js`): solo and online take exactly the same code path.
- `server/main.mjs`: http + ws (Knockabout's layout), static files from the allow-list in `server/static.js`,
  `/feedback` + `/tally` + admin feed reused from Tumblefair's server modules.
- `js/client/`: `main.js` (title → game, prediction + reconcile against `seq`), `scene.js` (flat-shaded low-poly,
  camera looking north at a 48° tilt: **W = screen north**), `actors.js` (Chibi 2.6 through Thousandvale's
  `createTvBody`, a stand-in while it builds, others interpolated ~110 ms behind), `input.js` (keys, pad, stick),
  `touch.js`, `menu.js` (☰, What's new, Credits, Report a bug), `link.js` (solo Worker or WebSocket).
- `window.gameEye.state()` reports the screen, link, room code, your position and the players.

## Messages

Browser → server: `hello {v, token}`, `create {character}`, `join {code, character}`, `input {mx, mz, seq}` (world-space
move vector, ≤ 1), `leave`, `ping`. Server → browser: `welcome {token}`, `joined {code, you, host, seed, area}`,
`roster {host, players:[{id,name,look}]}` (on every join/leave; looks never ride in snapshots), `snap {tick, players:[{id,
x, z, yaw, moving, seq}]}` at 10 Hz, `left {id, host}`, `err {code, msg}`.

## Credits

Third-party things this game uses are listed in `shared/credits.json` (`games` includes `rogueloot`) and shown by the
Credits button. Add a row whenever something made by someone else comes in (ruling 49).
- **Codex art (2026-11-10):** `assets/art/key-art.webp` (title backdrop) and the games.radgh.com card are one Codex image (prompt in the M1 commit notes; original design).
