# Knockabout — plan and contracts (2026-10-23)

The owner's request (verbatim): "As a new prototype create a [floppy physics brawler] style fighting game where you use L1
and R1 to grasp with your hands, X and Y to raise our your arms, and can jump. Tap grasp buttons to punch. Arenas like
[robot-combat arenas] with ring out toss, spike pits, blades, fire traps, etc. After delivering a few punches you get
knocked down for a sec, longer each time you get knocked down, making it dangerous as you can get thrown out the ring.
Add versus mode or against waves or teams. Use a similar character builder to TF. Allow picking your costume piece by
piece instead of like TF currently. Add several maps to choose from. Co op and feedback and voting system like TF.
Support multiple controllers on one device too. Phone might not work due to the complexity, that's ok but try anyway."

(Other games may be named in Claude-facing docs only. Nothing a player sees names another game: no "Gang Beasts",
"BattleBots", etc. Never use "ember", "veil" or "muster".)

## The shape

* **Name**: Knockabout. Folder `prototypes/knockabout/`. Sandbox, part of the playground repo.
* **Physics**: cannon-es 0.20.0, vendored at `vendor/cannon-es/cannon-es.js` (MIT). Pure JS: the SAME sim runs in the
  browser (local couch play, offline) and in Node (online rooms, tests). Import it by relative path.
* **Local first**: one device + several controllers (gamepads, keyboard halves) is the main way to play, fully offline.
  Online rooms (a Node + ws server like Tumblefair's) add phones and remote friends; every device can bring several
  local players into a room.
* **Look**: Chibi 2.5 characters (the same avatars as Tumblefair) on a physics puppet; bright toy-like arenas.
* **No build step**, plain ES modules, standalone CSS, three.js r186 from `vendor/three/` via an importmap.

## Ports
| | http | https (gamepads need a secure page) |
|---|---|---|
| stable (published copy, user unit `knockabout`) | 8470 | 8472 |
| dev (working tree, user unit `knockabout-dev`) | 8471 | 8473 |
| agents' own test servers | 8474, 8475, 8476 | — (localhost counts as secure for gamepads) |
https uses the playground's self-signed cert in `tools/certs/` (see `tools/make-dev-cert.sh`).

## Files and who owns them
```
prototypes/knockabout/
  index.html, README.md, docs/PLAN.md (this)
  js/sim/        PURE (no DOM, no three.js). Runs in browser + node.          OWNER: sim agent
    physics.js     world setup, materials, step
    fighter.js     the puppet + controller (walk, jump, grab, punch, raise, knockdown)
    arena.js       builds an arena's static bodies + hazards from data
    hazards.js     blades, spikes, fire, crushers, pistons, conveyors, drop floors, moving platforms
    match.js       createMatch(): modes, rounds, scoring, elimination, waves, events, snapshot
    bots.js        AI fighters (wave goons + CPU players)
    tuning.js      reads data/tuning.json, exports defaults
  data/arenas.json, data/modes.json, data/tuning.json                       OWNER: sim agent
  js/client/     browser only.                                              OWNER: client agent
    main.js (screens), input.js (gamepads/keyboard/touch -> per-player input), render.js (three scene),
    puppet.js (Chibi 2.5 body posed from the sim's parts), builder.js (look + piece-by-piece costume),
    local.js (runs a match in the page for couch play), hud.js, sounds
  css/knockabout.css                                                        OWNER: client agent
  server/        Node: main.mjs (http(s), static, ws), hub.js, room.js, static.js  OWNER: server agent
  js/net/        PURE, both sides: protocol.js (messages, limits), pack.js (binary snapshot)  OWNER: server agent
  js/client/net.js, online.js (online match source), online-ui.js (room screen, vote)  OWNER: server agent
  ops/ (user units knockabout + knockabout-dev), package.json (ws)          OWNER: server agent
  tests/         node tests per module (*.test.js) + one Playwright spec
  tools/         publish-knockabout.sh (phase 2), sim-bots.mjs (headless bot matches for balance)
```

## Controls (gamepad = standard mapping; the labels follow the owner: L1/R1, X/Y, jump)
| action | gamepad | keyboard player 1 | keyboard player 2 | phone |
|---|---|---|---|---|
| move | left stick / d-pad | WASD | arrow keys | left stick |
| jump | A / Cross (0) | Space | Right Ctrl / Numpad 0 | JUMP |
| grab LEFT hand (hold) / punch (tap) | L1 (4) | Q | Numpad 7 / , | L |
| grab RIGHT hand (hold) / punch (tap) | R1 (5) | E | Numpad 9 / . | R |
| raise LEFT arm (hold) | X / Square (2) | Z | Numpad 4 / K | ▲L |
| raise RIGHT arm (hold) | Y / Triangle (3) | C | Numpad 6 / L | ▲R |
| duck / crouch | B / Circle (1) | Shift | Right Shift | (none) |
| pause/menu | Start (9) | Esc | — | ☰ |
A tap = press and release within `tuning.punchTapMs` (180 ms) and the hand did not grab anything: it is a punch.
Holding reaches forward (or up, if that arm is raised) and grabs the first thing the hand touches: a fighter, a prop,
or a grabbable edge of the arena. Raising both arms while holding someone lifts them overhead; releasing while moving
or jumping throws them (velocity carries).

## The sim contract (js/sim/match.js) — the client and the server code against exactly this
```js
import { createMatch, ARENAS, MODES } from './js/sim/match.js';
const m = createMatch({
  arena: 'the-ring',                 // id from data/arenas.json
  mode: 'versus' | 'teams' | 'waves',
  players: [{ pid: 1, name: 'Ada', team: 0, look: {...}, cpu: false, level: 'normal' }],   // cpu:true = a bot player
  seed: 123, difficulty: 'easy' | 'normal' | 'hard', rounds: 3,
});
m.input(pid, { mx, mz, jump, grabL, grabR, raiseL, raiseR, duck })   // HELD states (booleans; mx/mz -1..1, world-relative:
                                                                     // +x right, -z away from the camera). Call every step
                                                                     // (missing = no input). The sim finds taps itself.
m.step(dt)            // fixed 1/60 s. Advances physics, hazards, bots, rules.
m.snapshot()          // small, JSON-safe; sent 30x/s online. Everything the renderer needs:
//  { t, phase: 'intro'|'fight'|'roundEnd'|'waveBreak'|'over', round, rounds, wave?, timeLeft?,
//    fighters: [{ pid, team, bot: bool, alive, down: secondsLeft (0 = up), downs, out: 'ring'|'spikes'|'fire'|'crush'|null,
//                 torso: [x,y,z, qx,qy,qz,qw], head: [x,y,z], hands: [[x,y,z],[x,y,z]], feet: [[x,y,z],[x,y,z]],
//                 grip: [ref|null, ref|null] (ref = 'f:<pid>' | 'p:<propId>' | 'w' wall/edge), raise: [0..1, 0..1],
//                 face: yaw radians, daze: 0..1 (how close to a knockdown) }],
//    props: [{ id, kind, p: [x,y,z, qx,qy,qz,qw] }], hazards: [{ id, s: number|array (hazard state: angle, offset, on/off) }],
//    score: { [pid or team]: n }, events: [] }
m.events              // array of one-off events since last drained (the caller empties it):
//  { e: 'punch', pid, hit: pid|null, x,y,z } { e: 'grab', pid, hand, ref } { e: 'release', pid, hand } { e: 'throw', pid, who }
//  { e: 'down', pid, secs } { e: 'up', pid } { e: 'out', pid, how, by: pid|null } { e: 'round', winner } { e: 'wave', n }
//  { e: 'hazard', id, kind } { e: 'over', standings: [[pid...], ...] }
m.over; m.result()    // { order: [[pid...]...] best first, scores, mode, arena }
ARENAS                // the arenas.json list (static geometry + hazard definitions — the client draws the static parts
                      // from this data and moves hazards from snapshot.hazards)
```
Geometry in `data/arenas.json` is plain shapes so both sides can build it: `box {p, size, rot?}`, `cyl {p, r, h}`,
`ramp`, plus `kill` volumes (spikes, fire, below-y), `grab` edges (ropes, ledges), `spawns`, `cam` hints, a `theme`
(palette, sky). Hazards: `{ id, kind: 'blade'|'spikes'|'fire'|'crusher'|'piston'|'conveyor'|'dropfloor'|'mover'|'sweeper', ... }`.

### Contract additions (sim agent, 2026-10-23) — everything above still holds; these only ADD
* **createMatch opts**: `roundTime` (s, default from modes.json = 90), `waves` (waves to clear in Waves mode, default 10),
  `teams` (2-4: used only to auto-split when every player came in on one team), `tuning` (deep-merged over
  data/tuning.json — tests use it). `rounds` = round WINS needed (first to N); a match of draws also ends after
  `rounds x 3` rounds. Player `team` is used in Teams mode only (Versus: everyone alone; Waves: players are team 0).
* **m.step(dt)** accumulates any dt and runs fixed 1/60 s ticks (at most 4 per call). Input sent with `m.input` counts
  for every tick of the NEXT `m.step` call, then is cleared. Input is ignored during `intro` (fighters stand still).
* **Exports**: also `TUNING` (the merged defaults). `MODES` = the whole modes.json: `{ modes: [...], difficulty, botLevels }`.
* **Hanging + climbing**: hold grab while falling past a rope/rim/rail/lift edge and the hand reaches for it and catches it;
  JUMP while hanging hauls you up over the edge. Inside the 180 ms tap window a hand can catch an EDGE, never a fighter.
* **Struggling**: a held fighter who is on their feet breaks free by tapping grab 4 times (`fighter.struggleTaps`);
  the grabber's hand then cannot grab again for 1 s. Bots never grab their own side (people may).
* **Facing**: forward = `(sin face, 0, cos face)`. `hands[0]` / `grip[0]` / `raise[0]` = LEFT (L1); index 1 = RIGHT.
* **snapshot extras**: `sudden: true` in sudden death (time ran out: hazards run x1.6 and ONE punch knocks down; after
  `suddenDeathSecs` the round is a draw). `snapshot.events` = a COPY of the events still waiting in `m.events`.
  Per fighter: `punch: [0|1, 0|1]` (that fist is mid-punch), `held: 0|1` (someone is holding me), `goon: true` on wave
  goons. Out fighters keep their last pose with `alive: false` and `out` set.
* **score keys**: Versus `{ [pid]: roundWins }`; Teams `{ 't0': roundWins, 't1': ... }`; Waves `{ waves: cleared,
  [pid]: goonsTossed }`. `result()` adds `stats: { [pid]: { kos, tossed, wins, downs, punches, hits, throws } }` and,
  in Waves, `waves`. Goons are never in `result().order` (players only, every player exactly once).
* **Goons**: pids 1001+ (team 99), created per wave and dropped in from above the spawn points.
* **Extra events**: `{ e: 'fight', round, wave? }` (control starts), `{ e: 'jump', pid }`, `{ e: 'sudden' }`,
  `{ e: 'bonk', prop, pid, by }` (a thrown prop hit someone), `{ e: 'climb', pid }` (jumped up from hanging),
  `{ e: 'glitch', pid }` (safety net: a body went non-finite and was taken out — should never happen; tell the sim agent).
  `throw.who` is a pid, or `'p:<propId>'` for a thrown prop. Extra fields: `punch` may carry `head: true` and
  `ko: true` (this punch knocked them down); `out` carries `x, y, z` (where to draw the poof); `hazard` carries `pid`
  (who it hit); `round` carries `round`. `wave` fires at the start of EVERY wave, including wave 1.
* **Hazard state** `s` — the first number is ALWAYS the phase: 0 calm, 1 warning, 2 dangerous. Every round starts
  with every hazard calm, and a hazard only bites in phase 2 (the `'spikes'` kind in the list above is spelled
  `popspikes` — a strip that pops out of the floor; spike PITS are `kill` volumes, not hazards) (spinner arms shove in any phase, but only knock down
  when fast). Layouts: `blade [phase, rise 0..1, x, z, spin]` · `popspikes [phase, rise]` · `dropfloor [phase, dy<=0]`
  · `fire [phase, power 0..1]` · `crusher [phase, yBottom]` · `piston [phase, ext]` (ext < 0 = pulled back, the tell;
  world offset = max(0,ext)*reach + min(0,ext)) · `conveyor [phase, speed, scroll]` · `mover [phase, x, y, z]`
  (phase 2 = travelling) · `sweeper [phase, angle]` (rotation about +Y, like three's `rotation.y`; each arm adds its
  own `angle` the SAME way — so draw arms with `rotation.y = +arm.angle`, not minus).
* **Arena data** (data/arenas.json `arenas[]`): `static[]` shapes carry `color` (a key of `theme`), optional
  `grab: true` (hands can hold it: ropes, rims, rails, curbs), `deadly: true` (a spike/lava bed — not floor),
  `mat: 'bouncy'` (ropes). `kill[]` = `{ kind: 'spikes'|'fire', p, size }`. `props[]` = `{ id, kind: 'crate'|'ball'|
  'barrel', p, size | r (+h for barrels), mass }`. `spawns[]` = `[x, y, z, yaw]` (8 each). `size` = [w, d] for
  framing; `cam = { pos, look, fov }`. Hazard fields: blade `{ p, r, axis: 'x'|'z' (the axle), track: [[x,z],[x,z]] }`,
  dropfloor `{ p, size, drop }`, fire `{ p, size, dir }`, crusher `{ p (bottom at rest), size, lift }`, piston
  `{ p, size, dir, reach }`, conveyor `{ p, size, dir, speed, surge }`, mover `{ p, size, path: [[x,y,z]...], grab }`,
  sweeper `{ p, arms: [{ y, len (half-length each side of the hub), thick, height, angle }], slow, fast, knock }`;
  each has `cycle: { period, warn, active, offset }`.
* **Feel knobs** live in data/tuning.json (`fighter`: masses, stand spring, walk, jump, arm length, punch and throw
  strength; `rules`: the owner's knockdown numbers, hazard knock, credit window, phase timers). Bot levels and wave
  sizes live in data/modes.json. `node tools/sim-bots.mjs --mode all --runs 3` reports round lengths, how fighters go
  out, knockdowns and step cost per arena/mode.

## Rules the owner asked for
* **Punch**: tap L1/R1. A punch that lands adds to the target's daze. **After a few punches the target is knocked down**:
  `tuning.punchesToDown` (3) within `tuning.dazeWindow` (4 s). Down for `downBase` (1.0 s) + `downStep` (0.7 s) for each
  earlier knockdown this round, capped at `downMax` (5 s). While down: limp (no balance, no control), others can grab,
  drag, lift and throw them — that is the danger: a long knockdown near the edge means a ring-out.
* **Ring out**: falling below the arena's `outY`. **Spike pits**, **fire**, **crushers**: out (cartoon: a poof and a
  puff of smoke / soot; family friendly, nothing gory). **Blades / sweepers / pistons**: big knockback + a knockdown.
* **Modes**: **Versus** (free-for-all, last one standing wins the round, first to N rounds), **Teams** (2-4 teams, last
  team standing), **Waves** (co-op: everyone vs waves of bot goons; survive and clear waves; downed-out players come
  back at the next wave; score = waves cleared + goons tossed). CPU players can fill any mode.
* **Arenas** (at least 7, each with its own trick): The Ring (classic ropes, ring-out), Saw Pit (floor saws + a centre
  pit), Spike Floor (panels drop to show spikes), Furnace (flame jets + conveyors toward a fire pit), Crusher Yard
  (wall pistons + a crusher), Spinner Dome (a sweeping arm on a round platform), Sky Lift (moving platforms over a drop).
* **Character builder like Tumblefair's, plus a costume picked PIECE BY PIECE**: hat, top, bottom, shoes, cape,
  accessory, extras, ears — each from the Chibi 2 part lists, each with its own colours, plus whole-costume presets.
* **Feedback + voting like Tumblefair**: the ! report form (with picture + debug), rate each arena after playing it
  (👍/👎 + reasons incl. Buggy/Unfair on both thumbs), vote for the next arena between rounds, cookie-free counts.
  Reuse Tumblefair's server modules (`../tumblefair/server/insights.mjs`, `feedback.mjs`) rather than copying them.
* **Multiple controllers on one device**: "press any button to join" on a controller or keyboard half; each joined
  controller is a local player with its own look; up to 8 fighters in a match (local + online + CPU).
* **Phone**: try anyway — a touch layout (stick + JUMP, L, R, ▲L, ▲R) and a phone can join a room by code/QR.

## Going live (owner 2026-10-23: "Include knockabout in the live release. Easier to test multiplayer that way.")
Knockabout ships on **https://knockabout.games.radgh.com/** on the RGS droplet, exactly like Tumblefair (read
`~/claude/docs/rgs.md` and Tumblefair's `server/main.mjs`, `server/static.js`, `tools/publish-tumblefair.sh`):
* `server/main.mjs` takes the SAME flags: `--port 8470 --host 127.0.0.1 --public <dir> --data <dir> --build <id>`
  (+ optional `--https-port` for the LAN self-signed https; the droplet is https through Caddy, so no https there),
  answers `GET /healthz` (200 "ok") and `GET /status` (JSON with `build`), serves static files ONLY from an ALLOW list
  of playground folders (`server/static.js`), and keeps state in `--data` (profiles, feedback/, insights/).
* `package.json` in `prototypes/knockabout/` with `ws` as its only runtime dependency (the droplet runs `npm ci --omit=dev`).
* `tools/publish-knockabout.sh` = Tumblefair's publish script for port 8470 / user unit `knockabout` (LAN stable).
* The page must work from `https://knockabout.games.radgh.com/prototypes/knockabout/` — relative paths only.

## Online contract (server agent, 2026-10-23) — README "Online play" has the whole picture
* The server runs `createMatch` itself and calls `m.input(pid, held)` every step for each human whose device sent
  input in the last second (held state + any button that went down since the last step), then `m.step(1/60)`, drains
  `m.events`, and every 2nd step sends `pack(m.snapshot(), step, events)` (js/net/pack.js). It relies on: `m.snapshot()`
  as documented above (unknown extra fields are fine — they ride in the frame's JSON tail), `m.events` being drainable,
  `m.over`, `m.result()`, `m.time()` (sim seconds; used for round lengths in the insights log), and prop / hazard lists
  keeping their order through a match (if they change, the frame falls back to sending them whole).
* Online player pids are `seat + 1` (seats 0..7, people and CPUs), so seat colours agree on every device. Team: Versus =
  seat, Waves = 0, Teams = the room's choice — the same rule `main.js` uses for couch play.
* The page knows a Knockabout server sent it by the `Server-Timing: knockabout` header (server/static.js).
