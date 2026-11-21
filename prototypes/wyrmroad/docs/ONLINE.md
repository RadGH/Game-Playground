# Wyrmroad online co-op

Up to four heroes, one per device, play the host's chapters together. The room server runs the real fight rules
(`js/sim/brawl.js`) at 60 steps a second; browsers send their controls and draw what the server sends back.
Solo and same-screen co-op never need the server.

| Where | Page | Room server |
|---|---|---|
| LAN stable | `http://<LAN-IP>:8400/prototypes/wyrmroad/` (https 8442) | `ws://…:8640/ws` (wss 8642) — unit `wyrmroad` |
| LAN dev | `http://<LAN-IP>:8401/prototypes/wyrmroad/` (https 8441) | `ws://…:8641/ws` (wss 8643) — unit `wyrmroad-dev` |
| Live | `https://games.radgh.com/playground/prototypes/wyrmroad/` | `wss://games.radgh.com/ws/wyrmroad` (Caddy → 127.0.0.1:8640) |

`?server=ws://host:port/ws` on the page overrides the address (testing). `?code=ABCD` joins that room at once.

Local servers are **off by default** (owner 2026-11-16): `playground/tools/game-servers.sh start wyrmroad-dev` while
working on it (the hourly reaper stops it after 24 h). `ops/install.sh` links both units (not enabled);
`ops/install.sh --status` shows them. `npm install` in this folder once (the server's one package, `ws`).

## Files

| File | What |
|---|---|
| `server/main.mjs` | http (`/healthz`, `/status`, both also under `/ws/wyrmroad/`), WebSocket at `/ws` + `/ws/wyrmroad`, origin check (games.radgh.com + the same host), 12 sockets per address, compression, the 60 Hz clock, graceful restart (SIGTERM: rooms told, sockets closed with 1012, exit) |
| `server/hub.js` | hello + token, rooms by code, public list, every frame checked against the protocol and rate limits |
| `server/room.js` | seats, host tools, chapter pick, ready check, scenes, the brawl, input queue, snapshots + events, drop out / back / join mid-chapter, lost → retry, results |
| `server/admin.js` | `/internal/admin/feed` + `/internal/admin/action` behind `RGS_ADMIN_SECRET` (same header as Tumblefair's `rgs.mjs`); `reports` is empty — Wyrmroad's reports go to the playground report box |
| `server/data.js` | reads `data/*.json` + the tuning values |
| `js/net/protocol.js` | messages + limits, `cleanHero` (the hero check), input packing, room codes |
| `js/net/snap.js` | changes-only snapshots (server) and applying them (browser) |
| `js/net/mirror.js` | the browser's copy: frames by server step, drawn ~100 ms behind the server clock, events released on that clock |
| `js/net/client.js` | `Net` (connect, token in localStorage, rejoin after a drop, ping) and `serverUrl()` |
| `js/net/session.js` | `createNetSession` — the same shape as the local session |
| `js/ui/online.js` + `css/online.css` | the online screens (online.js loads its own stylesheet) |
| `ops/` | `start.sh stable|dev`, the two user units, `install.sh` |
| `tests/net/` | `protocol.test.mjs`, `room.test.mjs` (real hub, fake sockets, real browser session code), `live-server.test.mjs` (the real server on a random port over real sockets; skipped without `node_modules`) |

## `openOnline(ctx)` — js/ui/online.js

```js
import { openOnline } from './ui/online.js';
openOnline({
  root,            // the element screens draw into (default app.ui / #ui)
  data, T,         // the five JSON files + tuning values
  hero,            // the saved hero you bring (default: save.heroes[0]); "Change hero" picks another from save.heroes
  save,            // the save object (story progress is written to the hero after a won chapter)
  onStart(session, meta),   // run the session with the same play loop + HUD as local; may return a promise (resolved = drawn)
  onBack(),        // left the online screens (title)
  dialog,          // optional { ask } (default shared/dialog.js)
  sfx(name),       // optional; called with 'ui.click'
  renderPortrait(spec, { size }),   // optional; default app.portrait — a seat shows the initial until it is drawn
  onResult(result, mine),           // optional; replaces the built-in story update after a chapter
});
```
The page's own shape is accepted too: `{ app, play(session, meta), back() }` (js/main.js). With `app`, the online screens
take `#ui` the way `app.go` does (`app.screen = 'online'`, the street drawn behind with `view.scenic`), and the pad
navigator works on them (Back = B / Esc on `[data-back]`, the main button = A / Enter on `[data-primary]`).
`meta = { online: true, heroId, chapter, section, code, you, dropIn, roster, retry }`. Returns `{ leave }`.
`onlineState()` (same module) reports screen, connection, code, phase, seats and the session's numbers (game-eye).

Screens: **Online co-op** (your hero, Host a room with Public / Invite only, Join with a code, Find a game) → **Room**
(QR + Big QR + copy link, four seats with 3D portraits, host: chapter list from the host's own story, Who can join,
Make host, Remove; others: Vote to remove; Start / Ready with a 25 s ready check) → **Story scene** (every device; skip
waits for everyone, 60 s at most; the last chapter's choice is the host's) → play → **Lost** (host: again from this
fight / back to the room) or the closing scene → **Results** (each player's experience, gold, foes; back to the room
after 45 s or when the host says).

## `createNetSession({ net, data, T, start })` — js/net/session.js

Same contract as `createLocalSession` (docs/ARCH.md): `s.G`, `s.tick(dt, inputsByPid) → { events, alpha }`,
`s.localPids` (`[your pid]`), `s.pause()` / `s.resume()` (online: you stand still, the fight goes on), `s.leave()`.
Also: `s.online = true`, `s.chapter`, `s.section`, `s.closed` (the server ended play — stop drawing),
`s.waiting` (you joined mid-chapter: your hero walks in at the next fight), `s.connection()` →
`{ state, rtt, code, build, corrections, snaps, behindMs }` for the ☰ menu's detail, `s.netStats` (game-eye/tests).

- `G` is the mirror: every field of the VIEW STATE list, `px/py/pz` already equal to `x/y/z` (alpha is always 1 —
  the mirror is smooth by itself). Heroes also carry `stats` (heroStats from their gear), foes `def`.
- Your hero is drawn now: walking is predicted locally (the steps the server has not used yet are walked here) and
  server corrections fade out over a few frames. Everyone else is drawn ~100 ms behind the server.
- Events: every step's events, released when the drawn clock reaches their step; your own moves, spells, pickups and
  your pid's xp / gold / loot / levelUp are handed out the moment they arrive. Loot only ever reaches its owner.
- The `start` message carries a full snapshot, so `G.heroes` is filled before the first `tick` (the play screen builds
  its party from it).

### What the play screen does with an online session (requests for js/ui/play.js)
1. Apply `loot` / `gold` / `xp` / `levelUp` events for `localPids` exactly as local (it already does).
2. **Don't** open the local results screen or the lost sheet for `session.online`: online.js takes the screen 1.9 s
   after a win (1.3 s after a loss) and shows the closing scene / results / the host's retry choice itself. (Today its
   timers are 2.2 s / 1.6 s, so online.js wins the race — skipping `finish()` when `session.online` makes it certain.)
   online.js also does the story update (`reached`, `done`, `ending`) for a won chapter.
3. Stop ticking once `session.closed` is true. Calling `session.leave()` from cleanup is safe (it does nothing once
   the server has ended play).
4. A player who joined mid-chapter has no hero until the next fight (`session.waiting`): the party is built from
   `G.heroes` at start, so rebuild it (or add the slot) when your pid's hero appears.
5. ☰ menu online: "Leave the room" → confirm, then `session.leave()` (leaves at once); the connection detail from
   `session.connection()`.

## How it works

- **Room flow**: lobby → ready (≤ 25 s) → intro scene (≤ 60 s) → play (waits ≤ 30 s for every device's `loaded`) →
  won: closing scene → results; lost: the host picks retry (same heroes, kept levels, `section` = the lost fight) or
  results → lobby. The host's `end` takes everyone back at any time.
- **Heroes**: each player sends `{ name, cls, level, xp, gear, spells, look, story: { reached } }`; `cleanHero` refuses
  junk with a reason (unknown class, level outside 1–12, an item whose base, slot, class or rarity is wrong, bonus lines
  that are too many, repeated or out of the roller's range, spells of another class or not yet learned). The host may
  pick chapters 1 … their own `reached + 1`.
- **Inputs**: one packed input `[mx, mz, bits]` per step, numbered. The server uses one per step; a late one is stood
  in for by the last held input and counted as used when it arrives; a backlog is used together; a line that stays
  bunched up for a second is caught up a step. Presses are never dropped: any input skipped or merged hands its presses
  to the next one used.
- **Snapshots** 20 a second, changes only (positions in hundredths, timers in tenths); a full one for anyone arriving.
  **Events** every step.
- **Drop out**: the seat is kept 90 s (lobby 5 min) while a bot plays the hero (`ctrl: 'bot'`); back with the same
  browser token → the same seat and hero (a full snapshot first). After that the hero leaves the road (`gone`, `left`).
- **Join mid-chapter**: watch at once; the hero is added with `addHero` when the next fight starts (`joined` message).
- **Host**: first in; leaves → the next person here. Remove (they stay out), Make host; everyone else can vote to
  remove (more than half of the others).

## Numbers (2026-11-20, this VM)

- Server step with 4 heroes + 14 foes: **0.09–0.2 ms** (budget 16.7 ms). Live server under a 2-player chapter:
  0.08–0.12 ms average, worst ~2 ms.
- Traffic: **~5 KB/s per player** before compression (compression on).
- Press → own swing back on screen, real server on this machine: **median 15–21 ms** alone, ~35 ms while the other
  test suites load the CPU (inputs every step; two at a time cost ~20 ms more). On the internet add one round trip.
- Own-hero walk corrections: a few per minute, under 0.1 m (heroes pushed apart), faded out.

## Live (droplet) — done by the lead, not from here

`games.json` entry gets `"server": { "unit": "wyrmroad", "port": 8640, "ws": "/ws/wyrmroad" }` (build-site.mjs makes
the Caddy route). The unit is a copy of `server/units/overdrive-frame.service` with `wyrmroad` names and
`ExecStart=… node server/main.mjs --port 8640 --host 127.0.0.1 --build "$$(cat /srv/wyrmroad/current/BUILD)"`. The
release needs only `prototypes/wyrmroad` + its `node_modules` (`npm ci --omit=dev`; the server imports nothing outside
the game folder). For the admin feed add `EnvironmentFile=` with `RGS_ADMIN_SECRET`.
