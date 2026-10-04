# Thousandvale — network protocol and room interface (stream A)

**Status:** v1 for M0, 2026-10-04. Owner: stream A (`js/net/**` ★, `js/sim/**`, `server/**`).
The machine-readable copy of every table on this page is `js/net/protocol.js`; if this page and that file
disagree, the file wins and this page is a bug. Changes go through stream A (`docs/requests.md`).

Readers:
- **Stream D (client)**: §1–§6 and §9 (`js/net/client.js` does the whole connection for you).
- **Stream C (combat core)**: §7 (the room ↔ rules interface) and §6 (events you emit).
- **Stream G (tests/bots)**: §1–§6, §8 (loopback harness, `/status`).

---

## 0. Versions

| Constant | Value | Where |
|---|---|---|
| `PROTOCOL_VERSION` | `1` | `js/net/protocol.js`. Bumped on any wire change. A client with another value is refused with `refuse {code:'version'}` → the client shows "A new version is out — reload". |
| `BUILD` | string | The server's build id (dev: `dev`; published copies: the git hash). A client whose `build` differs is refused with `code:'build'` → "reload". The client is always served by the same server as its socket (PLAN §10.1). |
| `SNAP_VERSION` | `1` | First byte after the type byte of every binary snapshot. |
| `TICK_MS` | `50` | Simulation 20 Hz (PLAN §8.3). |

---

## 1. Sockets and paths

Two sockets per player, the stage-2 shape from day one (PLAN §8.1), even while one process does both:

| Path | What | Lifetime |
|---|---|---|
| `/gw` | **Gateway**: hello, guest/login, character list/create, `play` → a signed ticket. Later: party, guild, chat channels, Callboard, mail. | Whole session. |
| `/p/<n>` | **Province process n** (M0: only `/p/0`): `enter {ticket}`, then inputs, casts, snapshots, events. | Until the player changes process or logs out. |

The same three socket shims carry both (`js/net/sockets.js`):

| Mode | How | Used by |
|---|---|---|
| `ws` | real `WebSocket` to `ws(s)://<page host>/gw` and `/p/0` | the browser against `server/main.mjs` (port **8491** dev) |
| `worker` | the whole server sim in a Web Worker (`js/sim/worker.js`), sockets multiplexed over `postMessage` | the browser with no server (`?offline=1`), devtools-debuggable (PLAN §8.6) |
| `loopback` | in-process, optional latency/jitter, real or virtual clock | node tests, bots |

**Frames.** JSON messages are text frames: one object `{t:'<type>', ...fields}`. Snapshots are binary
frames (`Uint8Array`). All three shims carry exactly these strings and byte arrays, so the server code path
is identical everywhere (and the fuzz tests exercise the real parser). Max frame **16 KB** (`MAX_FRAME`);
bigger is dropped and counted as abuse.

---

## 2. Connection flow

```
client                                  gateway /gw
  hello {v, build}            ──►
                              ◄──  welcome {v, build, server:'thousandvale', tickMs, time}
                                   | refuse {code, msg}            (socket closes)
  guest {name?}               ──►   (new account; returns its token ONCE)
  | auth {token}              ──►   (existing account)
                              ◄──  authed {account, token?, claimed}   | err {code:'auth'}
  chars {}                    ──►
                              ◄──  charList {chars:[{id, name, cls, level, room}]}
  create {name, cls, look?}   ──►
                              ◄──  created {char:{id, name, cls, level, room}} | err {code:'name'|'cls'|'full'}
  play {char}                 ──►
                              ◄──  ticket {path:'/p/0', ticket, room}
client                                  province /p/0
  hello {v, build}            ──►
                              ◄──  welcome {...}
  enter {ticket}              ──►
                              ◄──  joined {room, you, tickMs, tick, time}
                              ◄──  info {...}, binary snapshots, ev {...}, ...
```

- The **token** is 32 random bytes as 64 hex chars. The server stores only its SHA-256. The client keeps it
  (localStorage) and sends `auth {token}` on every connect. Guests never expire (PLAN §5.5).
- A **ticket** is single-use, valid 30 s, names one character and one process. Signed with HMAC-SHA256 under
  a per-boot key in stage 1 (the gateway and the process are the same process).
- **Reconnect**: when either socket drops, `js/net/client.js` retries with backoff (0.5 s, 1, 2, 4, max 5 s,
  forever), redoes `hello` + `auth` + `play <same char>` + `enter`, and fires `joined` again — the client
  clears its mirrors and starts fresh. Works across a server `kill -9` + restart (§8.4).
- **Taking over**: a second `enter` for a character already in the world kicks the old socket
  (`kick {code:'elsewhere'}`) and the new one takes over the same entity.

---

## 3. Message table (JSON)

Types: `int` (safe integer), `num` (finite number), `str:N` (string, max N UTF-16 units), `bool`, `id`
(int 0..65535), `vec2` (`{x:num, z:num}`), `obj` (plain object, size-limited by the frame). `?` = optional.
Anything not in the table, a wrong type, NaN/Infinity, an unknown field or a string over its limit is
**dropped** and counted (`/status` → `bad`); 20 bad messages in 10 s closes the socket (`kick {code:'abuse'}`).
**Rate**: each type has a token bucket (`rate` per second, `burst`); over it, the message is dropped.

### 3.1 Client → server

| `t` | Socket | Fields | Rate / burst | Meaning |
|---|---|---|---|---|
| `hello` | both | `v:int, build:str:64` | 2 / 2 | Must be first. |
| `guest` | gw | `name?:str:24` | 1 / 3 | Make a guest account. |
| `auth` | gw | `token:str:64` | 1 / 3 | Log into an account. |
| `chars` | gw | — | 2 / 4 | List my characters. |
| `create` | gw | `name:str:24, cls:str:32, look?:obj` | 1 / 3 | New character (`cls` = a Farhold class id; `look` = Chibi 2 avatar JSON, ≤ 4 KB). Names: 2–16 letters/spaces/'-, unique per realm, banned-name filter. |
| `play` | gw | `char:int` | 1 / 3 | Ask for a ticket. |
| `ping` | both | `c:num` | 2 / 4 | Clock sync, every 2 s. |
| `enter` | p | `ticket:str:256` | 1 / 3 | Join the world. |
| `in` | p | `s:int, dt:num, mx:num, mz:num, yaw:num, b:int` | 40 / 60 | One movement input. `s` = sequence (client counts up from 1), `dt` = ms of movement this input covers (0–100, clamped), `mx,mz` = world-space move direction, length ≤ 1 (longer is normalised), `yaw` = facing in radians, `b` = button bits (`IN_SPRINT` 1, `IN_JUMP` 2). Send one per client sim step (20 Hz). |
| `cast` | p | `slot:int, aim?:vec2, target?:id, ct?:num` | 10 / 15 | Use skill `slot` (0 = basic attack). `aim` = ground point, `target` = local entity id (Tab target), `ct` = client clock ms (dodge windows, PLAN §7). Answered by `castR` only on refusal; success shows up as `ev` `cast`/`hit`. |
| `target` | p | `id?:id` | 10 / 20 | Set (or clear) my current target; others see it in the snapshot `target` field. |
| `say` | p | `text:str:200` | 1 / 5 | Say chat, heard within 40 m. |
| `respawn` | p | — | 1 / 2 | Get up at the room's respawn point after dying. |
| `leave` | both | — | 1 / 2 | Log out cleanly (save now). |

### 3.2 Server → client

| `t` | Fields | Meaning |
|---|---|---|
| `welcome` | `v, build, server, tickMs, time` | Handshake OK. |
| `refuse` | `code, msg` | Handshake refused (`version`, `build`, `full`, `banned`); socket closes. |
| `authed` | `account:int, token?:str, claimed:bool` | `token` only on `guest` (store it). |
| `charList` | `chars:[{id, name, cls, level, room}]` | |
| `created` | `char:{id, name, cls, level, room}` | |
| `ticket` | `path, ticket, room` | Open `path` and send `enter {ticket}`. |
| `pong` | `c, s, k` | `c` echoed, `s` = server room clock ms, `k` = tick. |
| `joined` | `room:{id, name, size, q, origin:{x,z}, terrain, spawn:{x,z}}, you:{id, char, name, cls, level, xp, xpNext, gold, x, y, z, yaw, hp, hpMax, mp, mpMax}, tickMs, tick, time` | In the world. `you.id` = my local entity id. `q` = metres per snapshot position unit (§4). `terrain` = the zone key for `data/zones/<terrain>/terrain.bin` (stream B), or `null` for the stand-in field (`js/sim/terrain.js` `standInTerrain(seed)`). |
| `info` | `ents:[{id, kind, name, level, hpMax, team, cls?, look?, type?}]` | Descriptions for ids that are about to appear (sent before the first snapshot that mentions them) or whose description changed (level-up, gear look). `kind`: `player`/`monster`/`npc`/`object`. Players carry `cls` + `look`; monsters carry `type` (monster type id, e.g. `wolf`). |
| `ev` | `k:int, e:[event…]` | This tick's events near me (§6). |
| `you` | any subset of `joined.you` | My own sheet changed (xp, level, gold, maxima). |
| `chat` | `ch, from, name, text` | `ch`: `say` (M0), later `party`, `zone`, … `from` = local id (say) or char id. |
| `castR` | `slot, ok:false, why` | A cast was refused: `cooldown`, `range`, `mana`, `dead`, `target`, `unknown`. |
| `err` | `code, msg` | Request failed (`auth`, `name`, `cls`, `full`, `ticket`, `state`). |
| `kick` | `code, msg` | About to close: `elsewhere` (logged in from another tab), `abuse`, `restart`, `idle`. |

---

## 4. Binary snapshot (`SNAP_VERSION 1`)

Little-endian. One binary frame per client per send tick (PLAN §8.3–8.4). Encoder and decoder are
`js/net/snapshot.js` (`encodeClientSnap`, `decodeSnap`); the client never parses bytes itself.

```
u8   type            1 = snapshot
u8   version         SNAP_VERSION
u32  tick
u32  ack             last input seq applied for me (0 = none yet)
u8   selfMask        bit0 pos, bit1 vitals, bit2 dead
  [pos]    f32 x, f32 y, f32 z, f32 vy        my exact position (for reconciliation) and vertical speed
  [vitals] u32 hp, u32 hpMax, u32 mp, u32 mpMax
u16  leftCount
u16  left[leftCount] local ids that left my view (or died and despawned) — forget them
...  records until the end of the frame
```

**Record** (one entity):

```
u16  id
u8   mask            bit0 POS, bit1 Y, bit2 YAW, bit3 HP, bit4 ANIM, bit5 STATE, bit6 TARGET, bit7 FULL
[FULL]   u8 kind (1 player, 2 monster, 3 npc, 4 object), then EVERY field below
[POS]    u16 x, u16 z            metres = value * q   (q = joined.room.q, 0.125 → an 8,192 m room)
[Y]      i16 y                   metres = value / 16  (sent when airborne/swimming or on FULL; else the
                                 client puts a grounded entity on the terrain: heightAt(x,z))
[YAW]    u8 yaw                  radians = value / 256 * 2π
[HP]     u16 hp                  fraction of hpMax: hp = round(value / 65535 * hpMax)
[ANIM]   u8 anim, u8 seq         anim id from ANIMS (§5); seq counts up when a one-shot replays
[STATE]  u8 state                bits from STATE (§5)
[TARGET] u16 target              local id, 0xFFFF = none
```

- A record with FULL means "here is everything; if you did not know this id, you do now". FULL is sent when
  an id enters my view, when it crosses an AOI cell boundary, and when my distance band to its cell changes.
- Without FULL, only the changed fields are present. An idle entity costs nothing; a walker ~8 bytes.
- My own entity also appears in records (others need it); the client may ignore its own id and use the
  self block instead.
- Ids are **local to the room** (u16). After `joined` (a new room or a reconnect) all old ids are void.
- **Rates** by distance from me to the entity's cell centre: ≤ 40 m every tick but every 4th (15 Hz),
  40–90 m 7.5 Hz, 90–150 m 3 Hz; nothing beyond 150 m (monsters' own aggro range is 110 m, rules-side).
  At most 150 entities per client, nearest cells first. Snapshot `tick` is the server tick it describes;
  its time is `tick * tickMs` on the server room clock (`pong.s`, `joined.time`).

Decoded shape (`decodeSnap(bytes)`):

```js
{ tick, ack, self: { x, y, z, vy } | null, vitals: { hp, hpMax, mp, mpMax } | null, dead: bool,
  left: [id, …],
  ents: [ { id, full: bool, kind?, x?, z?, y?, yaw?, hp?(fraction 0..1), anim?, animSeq?, state?, target? } ] }
```

---

## 5. Shared enums (`js/net/protocol.js`)

```js
KIND  = { player: 1, monster: 2, npc: 3, object: 4 }
ANIMS = ['idle', 'walk', 'run', 'sprint', 'jump', 'fall', 'swim',
         'attack', 'attack2', 'cast', 'channel', 'hit', 'die', 'dead',
         'bite', 'howl', 'emote', 'interact']          // index = wire id; append only
STATE = { dead: 1, combat: 2, casting: 4, airborne: 8, swimming: 16, sprinting: 32, elite: 64, friendly: 128 }
IN    = { SPRINT: 1, JUMP: 2 }
```

Animation names on the wire are intent, not clip names — the client maps `bite` to a wolf clip and `attack`
to a Chibi 2 swing for the held weapon. Append new names at the end; never reorder.

---

## 6. Events (`ev`)

`ev {k, e:[…]}` carries one tick's events near me. Every event is an object with `type` plus fields; the
room routes it to clients whose view covers `(x, z)`, or only to `to` (a local id) when set. The room fills
`x,z` from `d`/`s` if the emitter leaves them out. Stream C emits these through `host.event()` (§7).

| `type` | Fields | Meaning |
|---|---|---|
| `cast` | `s, slot, skill, aim?, target?` | `s` started a skill (client plays the wind-up for others; my own already played). |
| `hit` | `s, d, n, crit?, el?, kind:'dmg'|'heal'|'absorb', skill?` | `n` = amount (whole number). `el` = element. |
| `miss` | `s, d, why:'dodge'|'block'|'immune'|'evade'` | |
| `die` | `d, by?` | `d` died (corpse stays until it leaves the view). |
| `xp` | `n, total` | To the earner only. |
| `level` | `d, level` | Everyone near sees the flash. |
| `loot` | `d, items:[…], gold` | M1 (personal: to the looter only). |
| `aggro` | `s, d` | A monster picked a target (red flash on the nameplate). |
| `fx` | `id, x, z, …` | Any one-off visual (telegraphs: `shape`, `r`, `ms`). |

---

## 7. Room ↔ rules interface (for stream C)

The room (`js/sim/room.js`) owns entities, the AOI grid, movement, snapshots and persistence. The combat
core (`js/rules/**`, stream C) owns every number: stats, casts, damage, statuses, monster brains, threat,
XP curve. The room calls the rules module through **one factory**:

```js
// js/rules/index.js (stream C) — the room imports exactly this
export function createRules(host, opts) {
  return {
    addEntity(e),            // a player or monster entered the room: set e.hp/hpMax/mp/mpMax/level from
                             // your tables (players: e.char.cls + e.char.level; monsters: e.type + e.level)
    removeEntity(e),         // left / despawned: drop threat entries, statuses, pending swings
    intent(e, msg) -> { ok: true } | { ok: false, why },   // a validated `cast` or `target` message
    step(dtMs),              // once per tick, AFTER movement: AI, swings resolving, statuses, regen
    respawn(e),              // optional: a dead player pressed respawn (room already moved them)
    levelFor(xp) -> level,   // optional: XP curve; xpFor(level) -> xp needed for that level
    dispose(),
  };
}
```

`opts` = `{ seed, roomId }`. Until stream C's module lands, the room uses the stand-in
`js/sim/rules-v0.js` (same shape: a basic melee swing and a wolf brain with a threat stub).

### 7.1 `host` — what the room gives the rules

| Member | Meaning |
|---|---|
| `host.roomId`, `host.tickMs` | |
| `host.tick` | Current tick (getter). |
| `host.now()` | Room clock, ms (`tick * tickMs`). Never use `Date.now()`/`performance.now()` in rules. |
| `host.rng(name)` | A named seeded stream for this room (`[a,b,c,d]` sfc32 state, `js/sim/rng.js`): `next(s)`, `int(s,n)`, `range(s,a,b)`, `chance(s,p)`. Never `Math.random()`. |
| `host.random(name)` | Shortcut: next float in `[0,1)` from stream `name`. |
| `host.entities` | `Map<id, Entity>` of everything in the room. Read freely; mutate only through Entity methods. |
| `host.near(x, z, r, filter?)` | Entities within `r` metres (AOI grid query), optional `filter(e)`. |
| `host.players()` | Iterator of player entities. |
| `host.groundAt(x, z)`, `host.walkable(x, z)` | The one heightmap (stream B's reader, or the stand-in). |
| `host.isAwake(x, z)` | True when a player is within 200 m (PLAN §8.5) — skip brains when false. |
| `host.event(ev)` | Emit an event (§6). |
| `host.spawn(spec)` | `{kind:'monster', type, level, x, z, yaw?, team?, name?, data?}` → Entity (calls `addEntity`). |
| `host.despawn(e, delayMs = 0)` | Remove (corpses: call with a delay). |
| `host.award(e, {xp, gold})` | Credit a player; the room saves it, applies `levelFor`, sends `you` + `xp`/`level` events. |
| `host.log(...args)` | Debug log (dropped in production). |

### 7.2 `Entity` (`js/sim/entity.js`)

Read: `id, kind ('player'|'monster'|'npc'|'object'), type, name, x, y, z, yaw, vy, hp, hpMax, mp, mpMax,
level, team, state, target, dead, char (players: the saved character — cls, level, xp, gold, …),
r (an object the rules own: put cooldowns, threat tables, brain state here)`.

Mutate only through these (they mark the snapshot dirty bits):

| Method | |
|---|---|
| `e.moveTo(x, z, y?)` | Position (y defaults to the ground). Updates the AOI cell. |
| `e.face(yaw)` | Facing, radians. |
| `e.setHp(hp)`, `e.setMp(mp)`, `e.setMax(hpMax, mpMax)` | Clamped; `setHp(0)` does NOT kill — call `e.kill(by)`. |
| `e.kill(byEntityOrNull)` | Sets `dead`, anim `die`, emits `die`. Players wait for `respawn`. |
| `e.anim(name)` | Play an animation by name (§5); replays bump `seq`. |
| `e.setState(bit, on)` | `STATE` bits (combat, casting, elite…). |
| `e.setTarget(idOr0)` | Current target. |
| `e.setLevel(level)` | Updates `info` for everyone who knows this id. |

Teams: players `team = 1`, hostile monsters `team = 2`, friendly NPCs `team = 1` with `STATE.friendly`.

### 7.3 Rules the room enforces (so you don't have to)

- Inputs are applied (movement budget, slope/water) **before** `step()`; casts arrive through `intent()`
  only after the protocol validated them, rate-limited, from a living entity.
- Dead players don't move; `intent()` is not called for dead entities.
- `step()` runs inside a context swap: before calling, the room sets the active room for any module-level
  state (your skillmech `world` lists / `setMechEnv` adapter does that inside `step`/`intent` — rooms step
  one after another, never concurrently).
- Exceptions thrown from rules are caught per call, logged once per message, counted in `/status`
  (`rulesErrors`), and the tick goes on.

---

## 8. Server, tick, persistence

### 8.1 Processes and ports
`node server/main.mjs` (dev, port **8491**, LAN): static client (allow-listed directories only, §8.5), `/gw`,
`/p/0`, `/status`. Options: `--port`, `--db` (`pg` | `json` | `memory`), `--host`. Stage 1 = one process.

### 8.2 Tick
Fixed 20 Hz loop with drift correction (each tick is scheduled for `start + k*50 ms`; late ticks run
immediately, more than 5 behind are skipped and counted). Per tick: apply inputs → `rules.step()` →
spawns/despawns → AOI refresh → snapshots and events → flush sockets.

### 8.3 `/status`
`GET /status` → JSON (and `/status.html` a small page): `ccu`, `rooms:[{id, players, monsters, entities}]`,
`tick:{p50, p95, p99, max, worst10m, overruns, skipped}` (ms, last minute), `msgsIn/s`, `bytesOut/s`,
`bad`, `rulesErrors`, `saves:{queue, lastMs, failed}`, `heap`, `uptime`, `build`, `db`. Read-only numbers.

### 8.4 Saves and crashes (M0)
Characters live in Postgres (`thousandvale_dev`, schema `server/db/schema.sql`), or a JSON file / memory in
tests and the Worker. A character is saved every 10 s while it changed, on level-up and on logout. Position,
level, XP, gold and HP are columns + a JSON blob (`SAVE_FIELDS`, `js/sim/save-fields.js`). Each save is
`UPDATE … WHERE version=$v AND lease_fence=$f`. At boot the process clears leases held by its own name
(`p0:*`), so after a `kill -9` + restart clients reconnect straight away and resume from the last save
(≤ 10 s of walking lost; the journal of M1.5 cuts this to ≤ 2 s).

### 8.5 Static files (dev)
Served from the playground root so the client's relative imports into Farhold/avatar-3d/shared resolve:
only the allow-listed top folders (`server/static.js` `ALLOW`), never dotfiles, `.git`, `node_modules`,
`server/`, `tools/`, `docs/` of Thousandvale. `/` redirects to `/prototypes/thousandvale/`.
The public copy (M1.5+, stream H) serves a published folder instead.

---

## 9. Client library (for stream D) — `js/net/client.js`

```js
import { connect } from '../net/client.js';
const net = connect({
  mode: 'ws',                  // 'ws' (default) | 'worker' | 'loopback' (tests: pass {hub})
  url: undefined,              // ws base; default `ws(s)://${location.host}`
  tokenStore: { get: () => localStorage.getItem('tv.token'), set: t => localStorage.setItem('tv.token', t) },
  build: 'dev',
});
net.on('status', s => {});     // 'connecting' 'select' 'entering' 'online' 'reconnecting' 'refused'
net.on('chars', list => {});   // after auth (also after create)
const ch = await net.createChar({ name, cls, look });
const joined = await net.play(ch.id);   // resolves with the `joined` payload
net.on('joined', j => {});     // also fires after every reconnect: clear your mirrors
net.on('snap', snap => {});    // decoded snapshot (§4)
net.on('info', ents => {});
net.on('ev', ({ k, e }) => {});
net.on('you', patch => {}); net.on('chat', m => {}); net.on('castR', r => {}); net.on('kick', k => {});
net.input({ s, dt, mx, mz, yaw, b });   // 20 Hz
net.cast({ slot: 0, aim: { x, z }, target });
net.target(id); net.say(text); net.respawn(); net.leave();
net.clock.serverNow();         // estimated server room clock ms (ping/pong every 2 s); net.clock.rtt
net.close();
```

Also for the client:
- `js/net/mirror.js` `createMirror()` — applies `info` + decoded snapshots into an entity table with the last
  few timestamped samples per entity (`{t, x, z, y, yaw}`), ready for interpolation 130 ms behind.
- `js/sim/movement.js` `stepMove(state, input, dtMs, terrain)` + `MOVE` constants — the exact function the
  server runs, for prediction. `state = {x, y, z, vy, airborne}`; `input = {mx, mz, b}`; `terrain = {heightAt, walkable?}`.
- `js/sim/terrain.js` `standInTerrain(seed)` — the stand-in field the server uses when `joined.room.terrain`
  is `null`; `loadZoneTerrain(key, fetchBytes)` for a baked zone.
