# Writing a Tumblefair minigame

A minigame is one folder, `js/games/<id>/`, with two files and one line in `js/games/index.js`. The room does
everything else: it seats the players, shows the vote card and the intro card, starts and stops the clock, turns
your result into tickets or points, and handles phones that drop and come back. **A game never touches scores,
coins, the board or the network directly.**

```
js/games/<id>/sim.js     the rules. Pure (no DOM, no timers, no Math.random): the SERVER runs it, node tests run it.
js/games/<id>/view.js    what a browser draws and which buttons it shows. Loaded only when the game is played.
js/games/<id>/style.css  optional; set meta.css = true and it is linked when the game loads.
assets/art/card-<id>.webp  the vote/intro card picture (3:2). Missing = the card shows without a picture.
```

## sim.js

```js
export const meta = {
  id: 'meteor-dash', title: 'Meteor Dash', blurb: 'One sentence, the objective, ends with !',
  how: ['2 to 4 short lines', 'shown on the intro card'],
  kind: 'arena' | 'ui',          // arena: characters run round a 3D arena with the stick; ui: taps on a screen
  min: 1, max: 4,                // players it works for (the vote never offers a game outside this)
  seconds: 60,                   // the room ends the game this long after it starts, whatever happens (+3 s grace)
  scoring: 'points'|'survival'|'vote'|'coop', unit: 'tiles',   // unit is shown next to each score on the results card
  tags: ['action'|'puzzle'|'social'|'chance'|'coop'], card: 'card-<id>', css: false,
  // arena games only:
  controls: { stick: true, a: 'Throw', b: 'Dash' },     // a / b = button labels; leave out the ones you do not use
  move: { speed: 6, accel: 26, carryMul: 0.8, stunDrag: 1.2 },   // read by shared/arena.js stepBody (accel low = ice)
  arena: { shape: 'rect', hw: 9, hd: 7, wall: true } | { shape: 'circle', r: 8, wall: false },
  pitch: 54,                     // optional camera angle in degrees (more = more top-down)
};
export function create({ seed, rng, players, difficulty }) { ... return game; }
//   rng: seeded (shared/rng.js: rng(), rng.int(a,b), rng.range, rng.pick, rng.shuffle, rng.chance). Use ONLY this.
//   players: [{ pid, seat, name }]   seat 0-3 = colour (shared/protocol.js SEATS)
//   difficulty: 'easy' | 'normal' | 'hard'
```

The object `create` returns:

| member | when | what |
|---|---|---|
| `init()` | game start, and again for any phone that joins or reconnects mid-game | everything static a browser needs to draw the game from nothing **right now** (layouts, current grid…). Sent to everyone. |
| `bodies` | arena only | `Map(pid -> body)` from `shared/arena.js makeBody`. The room packs them into every update. Flags in `F` (OUT, STUN, CARRY, FROZEN, AIR, GHOST). Set `body.y` for jumps/falls. |
| `input(pid, inp)` | arena only, once per player per 50 ms step | move that player: normally `stepBody(bodies.get(pid), inp, meta.move, meta.arena)`, plus button presses (`inp.b & IN.A`). `inp` may be `null` (player gone): treat as no input. **Movement must go through stepBody with meta.move/meta.arena** — the player's own browser runs exactly that to predict itself. If you change speed on the fly (carrying, slowed), do it through a body flag that stepBody already knows (F.CARRY uses move.carryMul; F.STUN = no control, slides to a stop; F.FROZEN/F.OUT = no movement). Knock-backs: set body.vx/vz and F.STUN for a moment. |
| `act(pid, a, d)` | ui games (arena games may use it too) | a tap from a player: `a` a short string, `d` a small value (≤400 chars or a small object). Validate everything. |
| `step(dt)` | every 50 ms (dt = 0.05) | the game's clock: spawn things, resolve hits, count down. |
| `state()` | after every step | the public, changing state, as small as you can (it is sent 20×/s for arena games; for ui games only when it changes). Include `left` (whole seconds) if you show a clock. |
| `priv(pid)` | optional | what only that player may see (their own drawing prompt, their own pick). Sent to that player when it changes. |
| `events` | optional array | push one-off things (`{ e: 'splat', x, z }`); the room sends and empties it each step. `{ to: pid, ... }` = just that player. |
| `over` | getter | true when the game has finished early (last one standing, all chests opened…). |
| `result()` | at the end | `{ order: [[pid, pid], [pid], …], scores: { pid: number }, unit }` — groups best first, ties share a group. Co-op games return `{ coop: { success: true|false }, order: [[all pids]], scores }`. Every playing pid must appear exactly once in `order`. |

A game must work for **every** player count from `meta.min` to `meta.max`, including one (solo practice), and must
end by itself within `meta.seconds`.

## view.js

```js
export function createView(ctx) { ... return { state(g), event(ev), priv(d), frame(dt, t), pose(pid, flags, body), start(), dispose() }; }
```

`ctx`:
- `THREE`, `stage` (`stage.tag(obj, {text, seat})`, `stage.toScreen(x,y,z)`), `group` (a THREE.Group: put every 3D thing of the game here — it is emptied and freed for you)
- `ui` (a DOM element over the canvas, removed for you; `pointer-events` are off on `.game` — set `pointer-events: auto` on what should be tappable)
- `init`, `meta`, `players` (`[{ pid, seat, name, color, dark, shape, portrait }]` — `portrait` is an `<img src>` of the player's face from the avatar system: use it for every flat screen such as drawing, voting and results), `me` (your pid, or null when this device is only watching), `watching`
- `actor(pid)` (arena: the player's 3D character: `.group`, `.body.group` to attach props to, `.play(clip, ms)`; the room positions and animates it from the body; `pose()` may return a held clip name such as 'hit', 'dead', 'cheer', 'sitGround', 'ready', 'jump')
- `send(a, d)` (= `act` on the server), `sfx(name)` ('tap', 'good', 'bad', 'win', 'hit', 'throw', 'splat', 'out', 'pick', 'coins', 'trap')

Shared DOM bits: `js/client/gamehud.js` — `scoreBar(ctx, {unit})` (chips + clock; call `.set(scores, left)`), `chip(p)`, `h()`, `esc()`, `floatText(stage, x, y, z, text, cls)`.

Rules that matter on phones: never read pixels back from the WebGL canvas; never toggle a light on/off (dim it); keep
triangle counts small (instanced meshes for anything repeated); no scrolling box inside a panel (it blanks the 3D
view behind it in Chromium — let the whole `ui` scroll instead); every tap target ≥ 44 px; colour is never the only
cue (seat shapes, labels).

## Testing

- `tests/room.test.js` plays whole matches with bots for every game in the registry — a UI game needs a bot entry
  in `tests/helpers.js` `UI_BOTS` (what a player would tap) or its matches only end by the clock.
- Add `tests/<id>.test.js` for the rules: create the game with a seeded rng and 1-4 players, drive `input`/`act`/`step`
  directly, and assert outcomes (who wins, ties, ends early, never out of bounds, result shape).
- Look at it: `flock /tmp/claude-1000/farhold-pw.lock node prototypes/tumblefair/tools/look.mjs --players 3 --mode marathon --pool <id> --until game --wait 6000 --tag <id>` (from the playground root, dev server on 8480) and READ the screenshots in tests/shots/.
