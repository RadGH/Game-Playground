# Bannerline

A couch-and-online **lane war** in the browser. Two teams each guard a **Keep** flying **banners**
at the foot of their own walled field. You fight with a hero to stop whatever comes down your field,
and you spend gold to **send** units into the enemy's field. A unit that reaches the enemy Keep
tears banners down; the last team with banners wins. Three.js, Chibi 2 heroes, a deterministic sim
that runs identically on every machine, split screen, gamepads, and online play by room code.

Owner: Radley Sustaire (independent). Prototype in the playground, built 2026-10-03/04 by streams
A–I (see "For future Claude" below). Play it at `prototypes/bannerline/` on the stable server.

---

## Modes

| Mode | Status | What it is |
|---|---|---|
| **Line War** | playable | The main game. 1v1, 2v2, 3v3, any mix of local players, online players and AI. |
| **Hunters vs Farmers** | playable | Asymmetric hide-and-hunt in a generated forest (2v1 up to 9v3). Farmers can't attack: they hide, build a cookie-clicker farm and, from mid-game, raise an army. Hunters are deadly early and fade. Also standalone at `hvf.html`. Plan: `docs/hvf-PLAN.md`. |
| **Campaign** — *Banners of the Vale* | Warrior chapter playable | "The Iron Oath", 5 missions scripted inside the sim (objectives, waves, stars, briefing/debrief). The other four hero chapters are stubs. Also standalone at `campaign.html`. |
| Tower defense, Lanes and towers (MOBA), Heroes and Empires | planned | Shown greyed on the mode screen. Nothing is built; the mode registry is designed so they can bring their own map, economy and win rule. |

### Line War in one minute

- **Gold** is paid every 10 s. Sending a unit raises your income. Gold is the ONLY limit on sending:
  no stock, no cooldowns, no tier locks (owner rule). Sends leave at once; when your target field is
  full (60 bodies) the extras wait in a **gate queue** and walk in as room frees up.
- **4 races x 12 units** (The Freeholds, Ashtusk, The Unburied, Thornmane), six price tiers from 12 g
  to 2,400 g. Each race has one rule-bending trait (Drilled Ranks, Cheap Steel, Grave Tithe, Running Packs).
- **5 heroes** (Warrior, Ranger, Pyromancer, Druid, Engineer), 5 skills each (Q W E D R), a talent,
  levels to 20. The Druid has Briarback and Wolf forms; the Engineer builds turrets and mines.
- **The town** behind your Keep: **Barracks** (hire units), **Outfitter** (51 stat items, 6 slots),
  **Drill Yard** (8 upgrades for every unit you send), **Sanctum** (12 one-shot powers you aim on the field).
- **The Keep shoots** splash bolts at anything near it, so a swarm of cheap units melts there while
  big units walk through. **Toll of Iron** (team spell from the Keep) stuns a whole field.
- **Rising Tide**: from 21:00 the neutral waves and leaks escalate every 2 minutes; hard cap 32:00.
  A typical Veteran-vs-Veteran match lasts about 15–20 minutes.
- **AI** at three levels: Recruit, Veteran, Commander. Same rules and commands as a human.

---

## How to play

### Getting in
Title -> **mode screen** -> **lobby**. In the lobby every device **readies up by pressing its join
button** (keyboard: Enter/Space; pad: A or Menu), which claims a seat for that device. Two local seats
= **split screen** (each half has its own camera, HUD and, in Hunters vs Farmers, its own fog).
Empty seats can be AI. The match starts 2 s after everyone is ready.

**Online:** "Host" makes a room with a 5-letter code (copy button); the friend picks "Join" and types
the code. Seats, AI slots and format are set by the host. A dropped player is replaced by the AI at an
announced tick and can **rejoin** after a reload ("Rejoin your match" on the title screen).

### Keyboard and mouse (`data/bindings.json`, remappable, saved per device type)
| Action | Keys |
|---|---|
| Move / select | Right click / left click; A = attack-move, S = stop |
| Skills | Q W E D R (Ctrl + key learns a rank) |
| Items | 1–6 |
| Town | B Barracks, O Outfitter, U Drill Yard, P Sanctum (in the Barracks, QWER/ASDF/ZXCV hire the 12 units) |
| Camera | F look at the next field, Space centre on hero, wheel / + - zoom, middle-drag or arrows pan |
| Other | Tab scoreboard, Esc / F10 pause |

### Gamepad (standard mapping; Firefox's empty-mapping pads have a fallback)
Left stick moves, right stick aims (centred = auto-target). **A** attacks / opens a building.
**X Y B RB RT** cast; **LT +** a skill button learns it. D-pad: down Barracks, up Drill Yard,
left/right use your first/second usable item. **View** Outfitter, **LB** Sanctum (aim with the left
stick, A casts, B cancels). **Menu** pause, **R3** next field, **L3** back to your hero. In menus the
d-pad or stick moves, A confirms (hold A in the Barracks to keep hiring), B goes back.

**Gamepads need https.** Chrome and Firefox hide gamepads on plain `http://` LAN pages, so use
**https://<LAN-IP>:8442/prototypes/bannerline/** (stable) or **:8441** (dev) and accept the
self-signed certificate once. `tools/serve-both.sh` starts all four servers (8400/8401 http,
8442/8441 https); the certificate comes from `tools/make-dev-cert.sh`. GitHub Pages is https already.

---

## Architecture

```
index.html ─ js/main.js (B)          title, mode screen, lobby, match loop, split screen
  js/input/*   (B)                   devices, keyboard, gamepad + padmap, bindings -> commands
  js/ui/*      (B, F, H)             HUD, town panels, lobby, net lobby, campaign screens, hvf/*
  js/view/*    (B, C)                three.js renderer, camera, actors, structures, fx, skillfx, sound
  js/net/*     (D)                   lockstep, net clock, lobby sync, transports
  js/sim/*     (A, E, I, H)          THE GAME: pure, deterministic, no DOM
  data/*.json                        every number the sim reads
```

### The deterministic sim (`js/sim/`)
- `createSim(config, data)` -> `{ state, step(commands), hash(), snapshot(), drainEvents(), over }`.
  20 ticks a second. The state is plain JSON-safe data, so a snapshot is `JSON.stringify` and restore
  rebuilds the same sim (`sim.js`, `state.js`, `hash.js` = FNV-1a over the state).
- **Determinism rules** (enforced by `tests/sim-purity.test.js`, which follows imports): no
  `Math.random`, `Date`, `performance`, no `Math.sin/cos/atan2` (use `mathx.js`), sorts only through
  `order.js sortBy` (stable, tie-broken), seeded streams from `rng.js`. Same seed + same commands =
  same hash on every machine and engine (checked node vs Chromium vs Firefox in `tests/net.spec.js`).
- Every input is a **command** `{ p, type, ...args }` (`commands.js`); illegal ones emit `reject`
  with a reason. The view reads state through `query.js` and reacts to events. Full contract:
  **`docs/interfaces.md`** (commands, events, queries, data schemas, online §12, campaign §13).
- Systems: `economy.js` (pay, sends, gate queue, rally), `movement.js` + `flow.js` (flow fields),
  `combat.js` + `damage.json` (types vs armour), `skills.js` + `talents.js` + `statuses.js`,
  `heroes.js`, `pets.js`, `turrets.js`, `tides.js`, `keep.js`, `items.js` / `upgrades.js` /
  `powers.js` / `buildings.js` (town), `campaign.js`, `ai/*` (Recruit/Veteran/Commander, knobs in `data/ai.json`).

### Mode registry (`js/sim/modes/`)
`modes/index.js` lists the modes. A mode module supplies `formats`, `buildMap(data, format, { seed, rules })`,
optional `createState`, its `phases` (the step pipeline), `checkResult`, `ai`, `commands` (checked
BEFORE line war's), `dataFiles` (loaded as `data.<mode>.*` and joined to the data hash) and `playable`.
`linewar.js` is the line war; `hvf/` is Hunters vs Farmers. A new mode never edits `sim.js`.

### Online (`js/net/`, `docs/online.md`)
Star-topology **lockstep**: only commands travel. The host assembles each tick's turn; input delay
comes from the measured ping (2–8 ticks; local play 1). A state-hash check every 20 ticks triggers a
snapshot resync on mismatch (`tools/desync-diff.mjs` finds the field that differed). Disconnect ->
AI takeover; rejoin by token (the host sends the match's age, never its clock). A clock Worker keeps
hidden tabs ticking. **Transports are swappable** (`transport.js` interface): `loopback.js` (tests,
virtual time with latency/jitter/drops), `channel.js` (BroadcastChannel, same browser — `?net=channel`),
`peerjs.js` (WebRTC via the public PeerJS broker, the default), `cfrelay.js` (**stub**: the
Cloudflare Worker + Durable Object relay that is the documented upgrade path, `docs/online.md` §4).

### View and UI
`js/view/renderer.js` owns one WebGL renderer drawn into one or two viewports. Units are Chibi 2 /
avatar-3d creatures from `data/looks.json`; structures, skill effects (`data/skill-fx.json`) and team
identity (`data/identity.json`) are stream C's. Icons are baked PNGs in `assets/icons/`. UI is plain
DOM + standalone CSS (`css/`), every screen pad-navigable (`js/ui/menunav.js`), tooltips via
`shared/tooltip.js`.

### Data files (`data/`)
| File | What |
|---|---|
| `econ.json` | clock (pay, Tide, Rising Tide, hard cap), start gold, banners per format, bounty, rally, field cap, hero curve |
| `units.json`, `races.json` | 48 units + race traits (**generated** by `tools/build-roster.mjs`) |
| `heroes.json` | heroes, skills, talents, statuses, pets (**generated** by `tools/build-hero-skills.mjs` from Farhold's skills + Bannerline rows) |
| `items-bl.json`, `shop.json` | 51 items + Outfitter tabs (**generated** by `tools/build-items-bl.mjs`; stat/price scale constants at its top) |
| `upgrades.json`, `powers.json`, `buildings.json` | Drill Yard, Sanctum, town buildings |
| `damage.json`, `maps.json` | damage-type table; the `vale` map incl. the Keep guard |
| `ai.json` | AI difficulty knobs |
| `campaign/*.json` | chapters and missions |
| `hvf/*.json` | Hunters vs Farmers rules, map generator, units, buildings, animals, hunter kit, AI |
| `bindings.json`, `looks.json`, `identity.json`, `skill-fx.json` | input, unit looks, team colours/banners, spell effects |

Every number is checked by a **dead-data test** (`tests/dead-data.test.js`, `tests/hvf-deaddata.test.js`):
it moves each value to an odd number and asks the sim whether anything changed. A number nothing reads
fails the test unless it is listed with a reason.

---

## Tests

From the playground root (one browser at a time; agents use the shared lock):

```
node --test prototypes/bannerline/tests/*.test.js          # ~270 node tests (sim, AI, net, data)
flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/bannerline/tests/   # browser specs on dev 8401
```

Node tests cover determinism, snapshots, purity, the economy bounds, every system, the AI ladders,
lockstep under latency/drops/rejoin, the campaign and HvF. Specs cover the full UI loop, gamepad
mocks (3 pad layouts), split screen, pad-only walks, online two-page matches (incl. rejoin after a
reload), cross-engine replay, art and the campaign.

## Tools (`tools/`, run with node from this folder unless noted)

| Tool | What |
|---|---|
| `econ-sim.mjs` | The original economy model (advisory since the owner's "balance later"; `--strict` to gate). |
| `feel-report.mjs [seeds]` | Veteran mirrors: match length, send gold per tier, spend split, and how much items / Drill Yard / powers swing a fight (`--buy` = the gear purchase test). |
| `ai-duel.mjs A B N [format]` | Difficulty A vs B over N seeds (e.g. `commander veteran 40`). |
| `sim-match.mjs` | Headless AI matches with traces (`--trace --seed 3`, `--json`, races/heroes per side). |
| `matchups.mjs` | Race x hero win-rate matrix. |
| `desync-diff.mjs dump.json` | First fields where two snapshots disagree. |
| `bake-icons.mjs` | Renders every icon with the game's own models into `assets/icons/` (needs the browser lock). |
| `bench-bannerline.mjs` | Headless crowd benchmark over `bench.html` (frame times here are software-rendered; draw calls and triangles are comparable). |
| `build-roster.mjs`, `build-hero-skills.mjs`, `build-items-bl.mjs` | Generate the data files above (`--check` exits 1 when out of date). |
| `hvf-econ-sim.mjs` | Hunters vs Farmers economy model (advisory). |

Tool pages: `bench.html`, `icons.html`, `structures.html`, `skillfx.html`, `hvf-map.html`, `hvf-art.html`, `campaign.html`.

---

## For future Claude

- **Read first:** `docs/PLAN.md` (the original spec — parts are superseded, see below),
  `docs/interfaces.md` (the live contract), `docs/requests.md` (cross-stream log; the newest decisions are
  at the bottom of each section), `docs/SHELVED.md` (everything parked, with reasons), `docs/hvf-PLAN.md`.
- **Owner rules that override PLAN.md:** gold is the only limit on sending (no stock, restock, cooldown or
  tier locks — PLAN.md's stock system was removed); sends leave at once; no item time locks; the word
  "Muster" is gone from everything player-facing; balance (snowball, race/hero) is "later" — the skipped
  tests in `economy-bounds.test.js` and `matchups.test.js` say so. Feel beats paper balance: the owner's
  systems (items, Drill Yard, powers, the hide-and-hunt) must visibly matter.
- **Never break determinism.** Anything in `js/sim/` must pass `sim-purity.test.js`. After changing sim
  rules, a recorded replay may change: the cross-engine spec records fresh each run, so it does not need a fixture.
- **Generated data:** edit the generator in `tools/`, not the JSON, then run it (or `--check`).
- **Shared code:** heroes' skills come from Farhold's data, units' looks from avatar-3d/Chibi 2. A new
  Chibi 2 part id must also go into `avatar-2d/js/parts/chibi2-parts.js`.
- **Streams who built it** (checklists in `~/claude/agent/bannerline/`): A sim + content + online + campaign,
  B view/input/UI, C art/icons/bench/sound, D online (folded into A), E AI, F campaign (folded into A),
  H Hunters vs Farmers, I items/town.
- **Names:** no third-party game names in anything a player sees (playground convention 9); "the old
  lane-war maps" is how docs refer to the genre's origin. `docs/research.md` / `hvf-research.md` are the
  only pages that name them.
