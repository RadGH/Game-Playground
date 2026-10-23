# Knockabout

A floppy physics brawler for the couch: grab, punch, wobble, and toss your friends out of the arena or into its traps.
Up to 8 fighters on one screen (each controller and each half of the keyboard is its own player, plus CPU players),
three modes (Versus, Teams, Waves) and seven arenas, each with its own trick. Chibi 2.5 characters (the same avatars as
Tumblefair) worn over a cannon-es physics puppet.

The rules, the sim contract, the ports and who owns which file are in **`docs/PLAN.md`**; read that first.
This README covers the client: screens, controls, the builder, how the puppet is drawn, and how to run and test it.

## How to play

Land a few punches in a row on someone and they are **knocked down** for a moment; every knockdown lasts longer than
the one before. While they are down you can grab them, lift them over your head and throw them. Fall off the arena,
land on spikes, walk into fire or under a crusher and you are out (a poof of smoke, nothing worse).

| | Controller | Keys (left half) | Keys (right half) | Phone |
|---|---|---|---|---|
| Move | left stick / d-pad | W A S D | arrow keys | left stick (appears under your thumb) |
| Jump | A | Space | Right Ctrl / Numpad 0 / Enter | JUMP |
| Left hand: **tap = punch, hold = grab** | L1 (or L2) | Q | Numpad 7 / , | L |
| Right hand: tap = punch, hold = grab | R1 (or R2) | E | Numpad 9 / . | R |
| Raise left arm (hold) | X | Z | Numpad 4 / K | ▲L |
| Raise right arm (hold) | Y | C | Numpad 6 / L | ▲R |
| Duck | B | Left Shift | Right Shift | — |
| Pause | Start | Esc | Backspace | ☰ |

Lift: hold both grabs on someone, raise both arms, let go while moving or jumping to throw. Tap versus hold is decided
by the sim (`tuning.rules.punchTapMs`), not the client.

**Menus** work with any controller (d-pad / stick moves a bright focus ring, A picks, B goes back), the keyboard
(WASD / arrows, Space / Enter, Shift / Esc) and mouse or touch.

## Screens

1. **Title** — a CPU-only brawl on a random arena plays behind it (the real sim). Any button on a controller or
   keyboard half goes to the lobby AND joins that device.
2. **Lobby — "Who's playing?"** — 8 slots. Pressing anything on a device that has not joined, joins it. Per player:
   A = ready, Y = edit look, B = leave (or un-ready), X = add a CPU. Buttons on each card do the same with a mouse /
   finger: Ready, Look, Leave; CPU cards have Level (easy / normal / hard), Look, Remove. "Tap to join" adds the touch
   screen as a player. When every joined person is ready the game moves on by itself; "Next" also moves on.
3. **Builder** (opened from a lobby card, driven by that player's own controller, or the mouse) — see below.
4. **Pick a game** — mode cards (from `data/modes.json`), arena cards each with a **picture drawn from its own data**
   (the same arena builder the match uses, rendered off screen once and cached), a "Surprise me" arena, rounds to win
   (1/2/3/5), CPU / goon difficulty, and team assignment for Teams (click / press a player to move them).
5. **Match** — the HUD shows round or wave, the round clock, a score chip per player (or team), big banners ("Round 2",
   "Fight!", "Pip wins the round!"), toasts for each knock-out ("Bonk landed on the spikes thanks to Pip"), and a
   one-line control hint for a lone player. Start / Esc / ☰ pauses: keep playing, restart, how to play, back to players.
6. **Results** — standings with portraits and scores, then **rate the arena**: 👍 / 👎 and reasons
   (👍 Fun, Funny, Again!, But buggy, But unfair; 👎 Boring, Confusing, Too hard, Laggy, Unplayable, Buggy, Unfair —
   Buggy and Unfair are on both thumbs, like Tumblefair). Then "Next arena ›", "Change game" or "Players".
7. **Vote** — three arenas (two others plus "the same again"). Every local player moves their OWN coloured marker with
   left / right on their own device and locks it with A (B unlocks); a tap on a card votes for the next person who has
   not voted. When everyone has locked in (or after 20 s) the most votes wins, ties are picked at random, and the next
   match starts with the same players and settings.

The **!** button (top right, every screen) opens the report form: suggestion or bug, text, an optional picture of the
3D view, and debug details (screen, players, settings, which sim, recent errors, device).

## The builder: a costume picked piece by piece

Tab **Costume**:
* **Whole costume** stepper — every costume from `prototypes/tumblefair/data/cosmetics.json` (Tumblefair's class
  outfits and written-out costumes, holiday ones included). Stepping to one FILLS EVERY SLOT below.
* Then each piece on its own, with ‹ › to step through that slot's Chibi 2 parts (`avatar-2d/js/parts/index.js`
  `partIds(slot)`, which includes `chibi2-parts.js`) and a row of 12 colour swatches: **Hat, Top, Bottom, Shoes,
  Cape / back, Accessory, Face marks (extras), Ears, Extra gear (decor)**. A few ids are left out on purpose
  (`WEAR_SLOTS[].skip` in `js/client/look.js`: parts Chibi 2 draws as nothing, tier-2 armour kits, and face marks that
  are not kid-friendly such as blood / dirt).

Tab **Face & body**: people (human, elf, dwarf, halfling), skin, every face part Thousandvale's / Tumblefair's editor
offers (`appearance-core.js` FACE_SLOTS: head, hair + colour, eyes + colour, brows, nose, mouth, beard), body type,
posture and the body sliders. "Surprise me" rolls a friendly random look (Tumblefair's `tidyFace`).

The character stands in the 3D view in the space the panel leaves (left side in landscape, top part held upright),
turning slowly, rebuilt 140 ms after each change. The name is editable at the top. **Looks are saved per local player
slot** (P1..P8) in localStorage (`knockabout.slot.<n>`, wrapped in try/catch), so whoever joins as player 2 gets player
2's look back.

A look is `{ race, seed, v, custom?, wear?, preset? }` — `avatarOf(look)` in `js/client/look.js` builds the full
avatar: the seed's face (tidied), the editor's face/body choices on top, then every `wear` slot on top of that.

## Rendering

* **Arena** (`js/client/render.js` `buildArena`): every static shape from `data/arenas.json` (`box` / `cyl`, colours
  are theme keys like `floor`, `rope`, `lava`), checkered toy floors, a sky gradient and fog from the theme, spike beds
  in the spike kill volumes, a flame pit in fire kill volumes, loose props (crates, barrels, balls) moved from
  `snapshot.props`.
* **Hazards** are drawn from their definitions and moved from `snapshot.hazards[i].s`, whose first number is the
  phase (0 calm, 1 **warning**, 2 dangerous). Every kind shows its warning plainly: saw blades spin up with sparks
  and a red stripe along their slot; pop-up spikes show a flashing red plate and peek out; drop floors shiver with a
  pulsing stripe; flame jets sputter sparks before they roar; crushers shake at the top over a red target; pistons
  pull back glowing and throw sparks; conveyors' arrows pulse; movers' lamps blink before they set off; sweeper arms
  glow when they speed up.
* **Camera** frames every fighter still in, smoothly, pulling back as they spread out (never closer than ~70% of the
  arena's own camera hint). The title demo uses the arena's whole-view camera.
* **Fighters** (`js/client/puppet.js`): a Chibi 2.5 body (`createTvBody`, the same builder Tumblefair uses) placed on
  the sim's TORSO transform (position + rotation — so a knocked-down fighter lies the way the sim's torso lies). The
  body is scaled once to the sim puppet's standing height (measured from the first upright snapshots). **Arms**: a
  two-bone solve per arm toward the sim's hand point — law of cosines for the elbow bend, the elbow pointed back and
  down, the two bones' world rotations turned into local ones after the animation mixer runs. Chibi arms are shorter
  than the sim's, so an arm whose hand is out of reach STRETCHES up to 1.5× (rubber arms; it is nearly straight
  whenever it stretches, so it does not shear, and the fist is scaled back round). The sim's hand 0 (left, L1) is on
  the torso's +x side, which is Chibi's `R` bone. **Legs**: walk / run clips by ground speed while standing; when down
  or in the air each leg is solved toward the sim's foot. **Head** leans toward the sim's head point. **Dazed** (daze
  ≥ 2/3) and down: stars circle the head. The name tag above each fighter carries a little daze bar (yellow, orange
  when close, red and wobbling when down).
* **Effects**: punch = a star burst and a ring in the puncher's colour (a miss is a small white ring); grab = a spark
  at the hand; throw = a whoosh; out = a poof of white cloud and confetti (fire: a puff of soot). **Sounds** go through
  the playground's `sfx/js/sfx.js` (cue names in `js/client/sounds.js`), unlocked on the first press.

## Phone

A touch screen can join as ONE local player ("Tap to join" in the lobby). During the match it gets a thumb stick on the
left (appears under your thumb) and JUMP, L, R, ▲L, ▲R on the right, plus ☰ for the menu; held either way up. No
duck button on the phone. The builder becomes a bottom sheet held upright, with the character above it.

Gotcha found and fixed while building it: an absolutely placed scroller inside a fixed layer **blanked a rectangle of
the WebGL canvas** in Chromium on phones. The builder's scroller is now the fixed `.builder` box itself (like
Tumblefair's sheet), and the lobby behind it is emptied, not just hidden, while it is open. Never put a scrolling box
inside a panel over the canvas.

## Files (client)

| File | What |
|---|---|
| `index.html`, `css/knockabout.css` | the page (three.js r186 through an importmap to `vendor/three/`), every screen's look |
| `js/client/main.js` | the screens and the frame loop; `window.knockabout` (state, for tests) and `window.gameEye` |
| `js/client/input.js` | devices -> held states the sim wants + per-device menu presses |
| `js/client/nav.js` | the controller focus ring for menus |
| `js/client/touch.js` | the phone stick and buttons |
| `js/client/render.js` | renderer, arena, hazards, props, effects, camera, arena pictures |
| `js/client/puppet.js` | Chibi 2.5 body fitted to the sim's puppet (arm / leg solves) |
| `js/client/look.js` | look -> avatar, the costume slots and part lists, presets, per-slot storage |
| `js/client/builder.js` | the character builder |
| `js/client/local.js` | runs a match in the page at a fixed 1/60 step; the **match source** shape (the online seam) |
| `js/client/sim.js` | loads `js/sim/match.js` (falls back to `sim-stub.js` only if it fails; `?sim=stub` forces it) |
| `js/client/sim-stub.js` | the stand-in sim used while the real one was being written; not used when the real one loads |
| `js/client/hud.js`, `sounds.js`, `feedback.js`, `report.js` | HUD; sound cues; the ! form; everything posted to the server |

### Hooks for the server / online agent

* **Online matches**: `local.js` documents the "match source" every screen talks to — `setInput`, `tick`,
  `frame() -> { a, b, k }` (two snapshots + blend), `drain()` events, `over`, `result()`. An `online.js` that builds the
  same object from the server's snapshots slots in where `createLocalSession` is called in `main.js` `startMatch`.
* **Endpoints** (`js/client/report.js`, all fail softly offline): `POST <root>/feedback` (JSON, Tumblefair's shape plus
  `game: 'knockabout'`), `POST <root>/tally` (batched `{ g, e, p }` events: `page_view`, `match_start`, `rate`
  `{ arena, mode, v, why, players }`, `vote` `{ choices, votes, picked }`). `<root>` is the site root (like Tumblefair),
  or `window.KNOCKABOUT_API` if set. Automated browsers do not count unless the URL has `?tally=1`.

### game-eye (Claude's headless player)

`window.gameEye.state()` returns a small JSON summary: screen, which sim, builder open / paused, the local players
(slot, pid, device, name, cpu, ready, team), mode / arena / rounds / difficulty, the focused menu button, and during a
match the phase, round, wave, clock, score, every fighter (pid, name, team, alive, position rounded, down seconds,
daze, grip refs, raise, out reason) and the last 10 events. The virtual gamepads game-eye injects work as-is:
`input.js` reads `navigator.getGamepads()` every frame and uses the standard mapping.

## Running it

* Dev: `http://<LAN-IP>:8471/prototypes/knockabout/` (the `knockabout-dev` user unit, always on; stable 8470 once published).
  **Gamepads only work on a secure page** — from another machine use the https ports (**8472 stable / 8473 dev**) and
  accept the self-signed certificate once. `localhost` counts as secure, so a browser on this VM can use plain http.
* Before a server exists: `python3 -m http.server 8474` from `~/claude/playground`, open
  `http://localhost:8474/prototypes/knockabout/index.html` (`?screen=lobby` skips the title).
* `?quality=low|medium|high` overrides the graphics level; `?sim=stub` forces the stand-in sim.

## Tests

* `tests/knockabout.spec.js` (Playwright, 4 tests, real sim, fake gamepads through `navigator.getGamepads`):
  two pads + both keyboard halves join, B leaves, A readies, the d-pad moves the focus ring, every arena card has a
  picture; the builder (a preset fills every slot, one piece changes alone, its colour changes, the body is in the
  scene, the look is saved); a full match (pad stick moves the fighter, Start pauses / B resumes, a ring-out ends it,
  results, both thumbs' reasons incl. Buggy / Unfair, the rating is sent, the pad votes and the next match starts);
  the phone (touch join, bottom-sheet builder, touch controls shown, a held ▲L reaches the sim).
  Run: `npx playwright test prototypes/knockabout/tests/knockabout.spec.js` (dev server 8401), or with
  `KA_BASE=http://127.0.0.1:8474/` against another server.
* `tests/look-client.mjs` (every screen, desktop / phone / `land`scape phone; `ARENA=<id>` picks the arena) and
  `tests/look-pose.mjs` (close-ups of one fighter: standing, arms up, reach, punch, dazed, down) save pictures to read.

## Online play

Rooms on a small Node server (one process serves the page and runs every room), modelled on Tumblefair's.

**For players.** The title shows **Host online**, **Join with code** and **Find a game** — but only when the page came
from a Knockabout server (GitHub Pages and plain file servers never show them). The host gets a room with a
four-letter code, an invite link (`…/prototypes/knockabout/?code=ABCD`) and a QR code. Everyone else joins by code,
by the link, by scanning, or from "Find a game" (rooms the host ticked "Listed in Find a game"). **Every device may
bring several players**: on the room screen any controller or keyboard half that presses a button joins as its own
player (up to 4 per device), and a phone that opens the link joins as one touch player at once. Up to **8 fighters per
room**, CPUs included. Only the host changes the mode, arena, rounds and difficulty, adds / removes CPUs, and presses
Fight!; anyone can switch their own team. After a match each device rates the arena (👍/👎 + reasons, Buggy / Unfair
on both thumbs), and the **next-arena vote is room-wide**: every player votes with their own controller (or a tap),
everyone sees everyone's markers and the count, the most votes win (ties at random), and the next match starts for
everybody — when all have voted, after 30 s, or when the host presses Go!. The pause button opens a menu but an online
match does not stop; the host can end the match for everyone (back to the room), anyone can leave. A device whose line
drops (phone asleep, wifi hiccup, page reloaded) gets its players back if it returns within **60 seconds**.

**How it works.**
* The **server runs the real match** (`js/sim/match.js` `createMatch`) at 60 steps a second and sends a snapshot every
  2nd step (30 a second) to every device in the room. Devices send only their players' **held** buttons
  (`{ t: 'in', p: [[local, mx, mz, bits]] }`) when they change and at least every 100 ms; the server ORs any button that
  went down between two steps into that step, so a quick punch tap is never lost. Input older than a second counts as
  nothing (a frozen page's fighter stands still).
* **Snapshots are binary** (`js/net/pack.js`): ~0.6–0.9 KB with 8 fighters instead of ~3 KB of JSON, keeping the sim's own
  rounding, so the renderer sees exactly the numbers couch play would. One-off events (punch, out, round…) ride in the
  same frame. Anything the sim adds later still arrives through a small JSON tail; `tests/net-pack.test.js` packs every
  arena × mode and checks the round trip is exact, so a sim change shows up there.
* The page **predicts nothing**: `js/client/online.js` keeps a short list of snapshots, maps its clock onto the server's
  step count from the earliest arrivals, and draws everyone ~50–60 ms in the past (one snapshot gap + the measured
  jitter), blending between the two snapshots around that moment. Floppy physics hides that delay well; a predicted
  ragdoll snapping back would look far worse. Events are released when the screen reaches their snapshot.
* The online session has the same shape as `local.js`'s, so the renderer, HUD, results and builder are unchanged;
  `js/client/online-ui.js` adds the room screen, the title buttons and the room-wide vote, through one
  `installOnline(…)` call in `main.js` plus a few `S.online` branches (pause menu, results buttons, rating target).
* **Ratings, plays and votes** go to the insights log (Tumblefair's `server/insights.mjs`, imported): `match` (mode,
  arena, people, CPUs, devices), `played` (arena, mode, players, seconds, each round's length, how people went out:
  ring / spikes / fire / crush, ended early), `rate` (arena, 👍/👎, reasons, one per device per match — a change of mind
  replaces it), `vote` (the three offered with their votes, the pick), `final`. Never a name, token or address.
  **Reports** (the ! button) go through Tumblefair's `server/feedback.mjs`.

**Reading what players said.**
* `node tools/insights-report.mjs [--env stable|dev] [--days 30] [--json] [--dir /var/lib/knockabout]` — per arena:
  plays, 👍 / 👎, a 0–100 score (lower edge of a 90% Wilson interval, so 3-of-3 does not outrank 40-of-50), Buggy /
  Unfair counts, top reasons, offered / won-the-vote, average round and match length, share ended early, and how people
  went out; then the cookie-free page counts.
* `node tools/feedback-report.mjs [--env stable|dev] [--state new|all] [--html out.html] [--mark 3,4 --state done --note "…"] [--dir …]`
  — same flags as Tumblefair's; its own copy because it prints Knockabout's debug fields.

**Servers and units** (`ops/`, user units like Tumblefair's, symlinked into `~/.config/systemd/user/` by `ops/install.sh`):

| | http | https (gamepads) | what | data |
|---|---|---|---|---|
| `knockabout-dev` | 8471 | 8473 | the working tree (restart after changing `server/`, `js/net/`, `js/sim/`, `data/`) | `~/.local/share/knockabout/dev` |
| `knockabout` | 8470 | 8472 | the published copy (`tools/publish-knockabout.sh [<ref>]`) | `~/.local/share/knockabout/stable` |

`server/main.mjs --port --host --public --data --build [--https-port --certs]` — the same flags as Tumblefair's, plus
https with the playground's self-signed cert (`tools/certs/`) for LAN gamepads. `GET /healthz`, `GET /status` (build,
rooms, players, average step time, CPU %, memory), `POST /feedback`, `POST /tally`, WebSocket `/ws`. Static files only
from the allow-list in `server/static.js` (the client's real imports: this game, Tumblefair's `look-tidy.js`, `qr.js` and
`cosmetics.json`, Thousandvale's client js, shared, avatar-2d / 3d, vendor three / cannon-es / qrcode-generator, sfx,
assets); the server side of every game is refused. A page from a Knockabout server carries a `Server-Timing: knockabout`
mark, which is how the title knows online play is there without a request that would fail elsewhere.
`ws` is the only runtime dependency (`package.json`; `npm ci --omit=dev` on the droplet). The publish script is
Tumblefair's: `git archive` of a commit, `node --check` + unit-test gates, a public copy without server files, one-rename
switch, `/status` check, rollback. The public site (https://knockabout.games.radgh.com/) is deployed by the RGS repo.

**Measured** (this VM, `spike-floor`, the busiest arena, 8 fighters: 2 people on 2 devices + 6 CPUs):
* **~27 KB/s down per device** (30 snapshots a second; about 220 kbit/s), ~1 KB/s up per device.
* **Server CPU: ~17% of one core for one room, ~46% for four rooms** (so ~11% per extra room). The sim step costs
  ~1.4–1.8 ms of the 16.7 ms budget. A 1 vCPU droplet should hold about six busy 8-fighter rooms.
* In the browser test: 30 snapshots/s, jitter ~13 ms, drawn ~55 ms behind the server, 0 late frames on the LAN.

Tests: `tests/net-room.test.js` (rooms in memory with fake sockets: several players per device, the 8-seat limit,
host-only settings, CPUs, a match to its result through the server loop, the input tap latch, reconnecting, the vote,
ratings reaching the insights log with no tokens / names, the public list, the static allow-list),
`tests/net-pack.test.js` (binary snapshots), and two cases in `tests/knockabout.spec.js`: **online** (host + a phone
joining by the link, a CPU, a match, both screens agree where everyone is; needs a Knockabout server, `KA_ONLINE`,
default the dev unit on 8471, skipped when none answers) and **offline** (a plain file server shows no online buttons
and logs no errors).

Files: `server/{main.mjs,hub.js,room.js,static.js}`, `js/net/{protocol.js,pack.js}` (pure, shared by both sides),
`js/client/{net.js,online.js,online-ui.js}`, `css/online.css`, `ops/`, `tools/{publish-knockabout.sh,insights-report.mjs,feedback-report.mjs}`.

## Accounts (2026-10-23)

Optional games.radgh.com sign-in (Thousandvale accounts work as they are). Guests play exactly as before.

- **For players.** "Sign in" is under the title buttons and at the bottom of the builder (for this device's first
  player). It opens the shared sign-in box (`shared/rgs-signin.js`: QR code to approve from a phone, username +
  password, or a new account). Only shown when the page came from a Knockabout server (`net.js` `serverAvailable`) —
  GitHub Pages has nowhere to keep the save.
- **What is saved on the account:** this device's FIRST player's fighter (slot 0: name + look), so the same fighter turns
  up on any phone or PC you sign in on. Other local players, CPUs and everyone when signed out keep their looks in this
  browser (`look.js` `loadSlot`/`saveSlot`; `setAccountSlot` switches slot 0 to the account). Online rooms need nothing
  new: the page already sends its players' looks.
- **How** (`js/client/account.js` + `server/accounts.js`): every call is `POST <root>/account` with a fresh one-time
  ticket from `account.ticket('knockabout')` — `{ ticket, guest? }` to sign in, `{ ticket, save: { name, look } }` to
  save (the builder's changes, 1.2 s after the last one). The server swaps the ticket for the user with
  `POST <RGS_API>/auth/redeem` (Tumblefair's `server/rgs.mjs` `createRedeemer`) and never uses an id from the browser;
  a bad ticket is a 401 and the page carries on as a guest with a small message.
- **Profile key:** `acct:<user id>` in `<data>/profiles.json` (written every 5 s and on shutdown). First sign-in: if the
  account has no fighter, the guest fighter becomes the account's (note `moved`); if it has one, that one is used and
  the guest fighter is left alone (note `kept`). The guest copy stays in the browser (it is only a look, nothing that
  could be counted twice), so signing out brings it back; a browser with no guest fighter gets a fresh random one.
- **The admin feed** (Tumblefair's `server/rgs.mjs` `createAdminFeed`, `ratingKey: 'arena'`): `GET /internal/admin/feed`
  and `POST /internal/admin/action { action: 'report', ids, state, note }`, the same shapes as Tumblefair's (see its
  README); ratings are per arena. Off (404) unless `RGS_ADMIN_SECRET` is set; header `x-rgs-admin` must match (403).
  `tools/feedback-report.mjs --mark` now uses the same `markReports`.
- **Env vars:** `RGS_API` (default `https://games.radgh.com/api`; droplet and VM dev unit `http://127.0.0.1:8600/api`)
  and `RGS_ADMIN_SECRET`. Dev unit: `~/.config/systemd/user/knockabout-dev.service.d/rgs.conf` (local, not in git);
  droplet: `EnvironmentFile=-/etc/knockabout/env`. The publish script copies `prototypes/tumblefair/server/rgs.mjs` too.
- Tests: `tests/accounts.test.js` (save rules with a pretend redeem; a real server process for the admin feed's lock,
  the report action and `/account` against a pretend rgs-api) and `tests/accounts.spec.js` (Playwright against the dev
  server + the VM's real rgs-api: the title button, a guest reaching the lobby, a second browser getting the same
  fighter, signing out).

## Not done yet (client)

* Grabbing is shown by the hand being where the sim puts it and a spark, but there is no special "held" hand pose or
  outline on the grabbed thing.
* No per-player split rating: one rating per screen after a match (the vote IS per player).
