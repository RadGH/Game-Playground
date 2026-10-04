# Thousandvale — network protocol and room interface (stream A)

**Status:** v2 for M1.5 (rooms, parties, loot, encounter events, journal, trade, human check), 2026-10-04 (v1 = M0). Owner: stream A (`js/net/**` ★, `js/sim/**`, `server/**`).
The machine-readable copy of every table on this page is `js/net/protocol.js`; if this page and that file
disagree, the file wins and this page is a bug. Changes go through stream A (`docs/requests.md`).

Readers:
- **Stream D (client)**: §1–§6 and §9 (`js/net/client.js` does the whole connection for you).
- **Stream C (combat core)**: §7 (the room ↔ rules interface), §6 (events you emit), §12 (loot + gear).
- **Stream E (content)**: §10.3 (the dungeon plan shape `dungeon-tiers.js` must return).
- **Stream G (tests/bots)**: §1–§6, §8 (loopback harness, `/status`).

---

## 0. Versions

| Constant | Value | Where |
|---|---|---|
| `PROTOCOL_VERSION` | `2` | `js/net/protocol.js`. Bumped on any wire change. A client with another value is refused with `refuse {code:'version'}` → the client shows "A new version is out — reload". |
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
**Rate**: each type has a token bucket (`rate` per second, `burst`); over it, the message is dropped quietly
(`/status` → `rateDrops`) — mashing a key is not abuse; only a flood (300 over-rate messages in 10 s) is kicked.

### 3.1 Client → server

| `t` | Socket | Fields | Rate / burst | Meaning |
|---|---|---|---|---|
| `hello` | both | `v:int, build:str:64` | 2 / 2 | Must be first. |
| `guest` | gw | `name?:str:24, human?:str:2048` | 1 / 3 | Make a guest account. `human` = the Turnstile token when `welcome.human` asked for one (§14); 20 new accounts per network per hour. |
| `auth` | gw | `token:str:64` | 1 / 3 | Log into an account. |
| `chars` | gw | — | 2 / 4 | List my characters. |
| `create` | gw | `name:str:24, cls:str:32, look?:obj` | 1 / 3 | New character (`cls` = a Farhold class id; `look` = Chibi 2 avatar JSON, ≤ 4 KB). Names: 2–16 letters/spaces/'-, unique per realm, banned-name filter. |
| `play` | gw | `char:int, join?:str:8` | 1 / 3 | Ask for a ticket. `join` = a party code from a "join my party" link: you join that party and appear next to its leader (§11). A bad code answers `err {code:'noCode'}` and you enter normally. |
| `party` | gw | `op:str:8, name?:str:24, code?:str:8, char?:int` | 2 / 10 | Party op (§11): `invite {name}`, `accept {char: partyId}`, `decline {char: partyId}`, `join {code}`, `code` (make a party if you have none; the answer `partyState` carries the code), `leave`, `kick {char}`, `lead {char}`. |
| `chat` | gw | `ch:str:8, text:str:200` | 1 / 5 | Channel chat. M1: `ch:'party'`. Later `zone`, `guild`, … |
| `ignore` | gw | `name:str:24, on:bool` | 1 / 5 | Ignore (on) / unignore (off) an online character by name; you stop seeing their say and party chat. Answer: `ignored`. Saved. |
| `ping` | both | `c:num` | 2 / 4 | Clock sync, every 2 s. |
| `enter` | p | `ticket:str:256` | 1 / 3 | Join the world. |
| `in` | p | `s:int, dt:num, mx:num, mz:num, yaw:num, b:int` | 40 / 60 | One movement input. `s` = sequence (client counts up from 1), `dt` = ms of movement this input covers (0–100, clamped), `mx,mz` = world-space move direction, length ≤ 1 (longer is normalised), `yaw` = facing in radians, `b` = button bits (`IN_SPRINT` 1, `IN_JUMP` 2). Send one per client sim step (20 Hz). |
| `cast` | p | `slot:int, aim?:vec2, target?:id, ct?:num, held?:num` | 10 / 15 | Use skill `slot` (0 = basic attack, 1..6 = the skill bar). `held` = seconds a slot-0 attack was held (bow draw / staff charge), clamped to 0..5. `aim` = ground point, `target` = local entity id (Tab target), `ct` = client clock ms (dodge windows, PLAN §7). Answered by `castR` only on refusal; success shows up as `ev` `cast`/`hit`. |
| `target` | p | `id?:id` | 10 / 20 | Set (or clear) my current target (Tab target); others see it in the snapshot `target` field. Refused with `targetR` if the id is gone, an object, or more than 60 m away. Tab ORDER is the client's (`js/net/tab.js` `tabNext`). |
| `say` | p | `text:str:200` | 1 / 5 | Say chat, heard within 40 m. |
| `respawn` | p | — | 1 / 2 | Get up after dying: in the wilds or town you wake in the town (a `joined` handoff, `via:'respawn'`); in a dungeon, at its entrance. |
| `use` | p | `id:id` | 4 / 8 | Use an object within 4 m: a portal/door (dungeon entrance), stairs, an exit, a chest. Answer `used {id, ok, why?, kind?}`; a move arrives as a `joined` handoff. |
| `item` | p | `op:str:8, uid:str:40, slot?:str:16` | 5 / 10 | `equip {uid, slot?}` (slot defaults to the item's own), `unequip {uid, slot?}`, `destroy {uid}`. The uid must be in YOUR bag (or worn, for unequip). Answers `bag` + `equip`, or `err {code:'item'|'bagFull'}`. |
| `travel` | p | `to:str:48` | 1 / 3 | Travel: a waystone `key` you have discovered (stand at any waystone; a gold fare by distance; not in combat or a dungeon), or `'event'` = free travel to the live realm event (§16). Answer `travelR`; the move is a `joined` handoff (or a `relocate` to another process). |
| `trace` | p | `kind:str:16` | 1 / 2 | Leave a trace: `campfire` (10 min, one per player, wilds only). Graves appear by themselves where a player dies (1 h). |
| `trade` | p | `op:str:8, id?:int, items?:uids, gold?:int` | 5 / 10 | The trade window (§13): `ask {id: entity}` (within 10 m) → they get `tradeAsk`; `accept {id: trade}`; `offer {id, items:[≤12 uids], gold}` (unlocks both); `lock {id}`; `confirm {id}` (both locked); `cancel`. Both confirmed → one all-or-nothing store write; `tradeState` throughout, `trade:null` + `done` at the end. |
| `leave` | both | — | 1 / 2 | Log out cleanly (save now). |

### 3.2 Server → client

| `t` | Fields | Meaning |
|---|---|---|
| `welcome` | `v, build, server, tickMs, time, human?:{provider:'turnstile', siteKey}` | Handshake OK. With `human`, show the Turnstile widget (that site key) and send its token in `guest {human}`. |
| `refuse` | `code, msg` | Handshake refused (`version`, `build`, `full`, `banned`); socket closes. |
| `authed` | `account:int, token?:str, claimed:bool` | `token` only on `guest` (store it). |
| `charList` | `chars:[{id, name, cls, level, room}]` | |
| `created` | `char:{id, name, cls, level, room}` | |
| `ticket` | `path, ticket, room` | Open `path` and send `enter {ticket}`. |
| `pong` | `c, s, k` | `c` echoed, `s` = server room clock ms, `k` = tick. |
| `joined` | `room:{id, name, kind, size, q, origin:{x,z}, terrain, spawn:{x,z}, area?, town?, dungeon?}, you:{id, char, name, cls, level, xp, xpNext, gold, x, y, z, yaw, hp, hpMax, mp, mpMax, bag, equipment, ignore, opened}, tickMs, tick, time, handoff?:{from, via}` | In the world — and again on every room change (`handoff` set; same socket; clear the entity mirror, keep the ground mesh when `terrain` is unchanged; §10). `kind`: `town` / `wilds` / `instance`. `area` (town) and `town` (wilds) = the town circle `{x, z, r, name}`. `dungeon` = the layout to draw (§10.3). `opened` = chest keys this character already emptied. `you.id` = my local entity id. `q` = metres per snapshot position unit (§4). `terrain` = the zone key for `data/zones/<terrain>/terrain.bin` (stream B), or `null` for the stand-in field (`js/sim/terrain.js` `standInTerrain(seed)`). |
| `info` | `ents:[{id, kind, name, level, hpMax, team, cls?, look?, type?}]` | Descriptions for ids that are about to appear (sent before the first snapshot that mentions them) or whose description changed (level-up, gear look). `kind`: `player`/`monster`/`npc`/`object`. Players carry `cls` + `look`; monsters carry `type` (monster type id, e.g. `wolf`). |
| `ev` | `k:int, e:[event…]` | This tick's events near me (§6). |
| `you` | any subset of `joined.you` | My own sheet changed (xp, level, gold, maxima). |
| `chat` | `ch, from, name, text` | `ch`: `say` (province socket; `from` = local entity id) or `party` (gateway socket; `from` = char id). |
| `castR` | `slot, ok:false, why, text?` | A cast was refused: `cooldown`, `range`, `mana`, `dead`, `target`, `unknown`; `text` = the rules' sentence to show ("Slot 6 opens at level 18"). |
| `targetR` | `id, ok:false, why` | A `target` was refused (`target`: gone or not targetable; `range`). |
| `used` | `id, ok, why?, msg?, kind?` | Answer to `use` (`why`: `far`, `unknown`, `opened`, `dead`). |
| `bag` | `add:[item…], remove:[uid…], gold` | My bag changed (loot, chest, equip swap, destroy); `gold` = new total. |
| `equip` | `slot, item\|null, equipment` | Worn gear changed; `equipment` = the whole worn set. |
| `partyState` | `party:{id, leader, code, members:[{char, name, cls, level, online}]}\|null` | (gateway) My party changed; `null` = no party. `code` → the join link `?join=CODE`. |
| `partyInvite` | `from, name, party` | (gateway) Someone invited me; answer `party {op:'accept'\|'decline', char: party}`. |
| `partyFrames` | `m:[[char, hp, hpMax, room, x, z, dead, online, id]…]` | (gateway) Party frames, 2 Hz, every member (`id` = local entity id in `room`). |
| `ignored` | `list:[{id, name}]` | (gateway) My ignore list. |
| `relocate` | `path, ticket` | (game socket) You are moving to a province another process holds: open `path`, send `enter {ticket}`; the old socket closes. client.js does it (`joined` follows with `handoff.via:'relocate'`). |
| `groupHint` | `key, with:[{char, name}]` | (gateway) You and others are fighting the same monster: "Group up?" — `party {op:'group', code: key}` (the first click makes the party, the rest join it). |
| `realm` | `kind:'eventSoon'\|'eventStart'\|'eventEnd', ev:{id, uid, name, province, x, z, r, level, kind}, at?, won?` | (gateway, everyone) The realm event: announced ahead (`at` = wall ms it starts), started (free travel: `travel {to:'event'}`), ended. |
| `eventFrame` | `uid, name, boss, hp, players` | (game socket, 1 Hz) You are in the realm event's arena: the temporary event group's frame (no invite needed). |
| `zone` | `zone, name, band, deeds:{rares, bosses, elites, deaths, visitors}, heat:[[x, z, n]…]` | You walked into a zone: what happened here this hour, and where people walk (footprints). |
| `travelR` | `ok, why?, msg?, cost?, to?` | Answer to `travel` (`why`: `undiscovered`, `far`, `gold`, `combat`, `instance`, `noEvent`, `dead`, `unknown`). |
| `tradeAsk` | `trade, from, name` | Someone (entity `from`) wants to trade: answer `trade {op:'accept', id: trade}` or `cancel`. |
| `tradeState` | `trade:{id, state, you:{char, name, id, items, gold, locked, confirmed}, them:{…}}\|null, done?, why?` | The trade window; `trade:null` = closed (`done:true` = it went through, else `why`: `cancelled`, `tradeFar`, `tradeFailed`, `bagFull`, `gone`). |
| `err` | `code, msg` | Request failed (`auth`, `name`, `cls`, `full`, `ticket`, `state`, `party`, `partyFull`, `noCode`, `notFound`, `muted`, `item`, `bagFull`). `msg` is plain language. |
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
{ tick, ack, bytes, self: { x, y, z, vy } | null, vitals: { hp, hpMax, mp, mpMax } | null, dead: bool,
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
| `loot` | `d, items:[{uid, name, rarity}], gold?` | Personal: to the looter only (the items themselves arrive in `bag`). |
| `open` | `d` | I opened chest `d` (to me only). |
| `tele` | `id, s, ab, k, ms, shape, x, z, yaw?, r?, r2?, arc?, len?, w?, el?, follow?` | A telegraph (encounters.md §7): `id` = telegraph id, `s` = caster entity, `ab` = ability, `k` = kind (harm/safe/stack/soak), lands at `k_batch * tickMs + ms` on the room clock; shapes `circle ring donut cone line cross` (`yaw` 0 = +z); `follow` = the entity id it rides. |
| `teleR` | `id, hits?:[entity ids], x?` | The telegraph resolved (flash + remove); `x:1` = cancelled (fade, no burst). |
| `castbar` | `id, ab, name, ms, int?` | Monster `id` started a cast (`int:1` = interruptible). |
| `castX` | `id, ab, why` | The cast broke (`interrupt`, `stun`, `phase`, `reset`). |
| `phase` | `id, n, name?, bar, hpMax?, reset?` | A boss phase turned; `hpMax` = a new health bar. |
| `enrage` | `id, soft?, hard?` | Soft enrage stack count, or the hard enrage. |
| `say` | `id, text, style` | A monster call-out (`yell`, `emote`, `warn` = centre screen). Not chat. |
| `obj` | `id, state?, otype?, r?, key?, hp?, gone?` | An object changed: `state` from `OBJ_STATES` (`idle lit used broken open closed`); `gone:1` = removed. The object's current state is also in its `info.state`, so late arrivals see it. |
| `boss` | `id, name?, title?, bars?, phases?:[{n, name, at}], enrageMs?, arena?:{x, z, r}` / `id, end:1, won?` | A scripted fight engaged (draw the boss bar with its phase ticks; `at` = hp fraction a phase starts at; `enrageMs` from now to hard enrage), or ended (`won` = it died). Sent by the rules (stream C); until then the client shows a bar for any `rank:'boss'` monster. |

Encounter events ride the normal batch (key `type`, local entity ids). The field lists are machine-readable
in `js/net/protocol.js` `EVENT_FIELDS`. Monster `info` carries `rank` (`elite`, `boss`; later `champion`, `rare`).

**Room objects** (`kind:'object'`, `info.type`): `portal stairs exit chest gate lever` are the server's own
(handled by `use`); `pillar rock brazier pool cracked_floor sarcophagus support_beam ore_cart` are arena
props the encounter scripts own (`info.rules:1`; `use` on them goes to `rules.useObject`). Every object's
`info` may carry `key` (a stable id from the plan or script, e.g. `f1-pillar-3`), `r` (radius) and `state`.
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
    onLevel(e),              // optional: a player levelled up (room already set e.level): refresh stats
    rollLoot(e, {level, tier}) -> [items],   // optional (M1): a chest e opened (personal loot)
    equip(e, item, slot) -> { ok, why?, text?, removed: [items] },   // optional (M1): wear an item from the bag
    unequip(e, slot) -> { ok, item },        // optional (M1)
    gear(e) -> { slot: item },               // optional (M1): what e wears now (sent to the client)
    saveGear(e) -> blob,                     // optional (M1): saved as char.equipment; restore it in addEntity
    onParty(e, partyId|null),                // optional (M1): e's party changed (also on e.data.partyId)
    dispose(),
  };
}
```

`opts` = `{ seed, roomId }`. The server and the Worker load `js/rules/index.js` (stream C — Farhold's real
combat) and fall back to the stand-in `js/sim/rules-v0.js` (same shape) only if that import fails; the node
tests in tests/A use the stand-in unless they say otherwise (`tests/A/m1-crules.test.js`,
`tests/A/bots50.test.js` run the real one).

**M1 notes for the rules:**
- `addEntity(e)` is also called for `kind:'object'` (portals, stairs, chests): ignore them.
- **Handoffs**: when a player changes room, the new entity arrives with `e.r` = the OLD entity's `r`
  (your unit, cooldowns, statuses). Reuse what is there instead of building a fresh sheet — it keeps the
  state, and building a Farhold unit is the most expensive thing a tick does.
- Monsters carry `e.rank` (`normal` / `elite` / `boss`; elite and boss also have `STATE.elite`).
- A camp or dungeon pack with `encounter: '<script id>'` gives its monsters `e.data.encounter` (E's plans name a script per mini-boss / boss room).
- Arena objects are spawned by the encounter engine itself when a fight starts (`host.spawn({kind:'object', …, data:{rules:true, key}})`); the dungeon plan's `props` are NOT spawned by the room (they are for E's viewer and the client's dressing). Levers and gates are the server's (a lever opens its floor's gate: `obj` `used` + `open`).
- Players carry `e.data.partyId` (null when alone), updated on every party change (+ `onParty`).
- **Loot**: pass items in `host.award(e, {xp, gold, items, from})` (or emit `{type:'loot', to, items}` —
  the room turns that into the same grant and swallows the event). Every item gets a server-wide `uid`
  (`<process>-<boot nonce>-<n>`, unique across restarts); a uid the rules set is kept as `ruid`. The room
  emits the `loot` event and the `bag` message itself. `host.newUid()` gives you one if you need it.
- Items are plain JSON objects (whatever Farhold's loot makes); the server reads only `uid`, `name`,
  `rarity` (rare+ forces an immediate save), `slot` (default for `equip`) and `value` (gold when the bag is
  full, BAG_MAX 120).

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
| `host.award(e, {xp, gold, items?, from?, reason?})` | Credit a player; the room saves it, applies `levelFor`, sends `you` + `xp`/`level` events, puts items in the bag (§12) and logs the faucets. |
| `host.newUid()` | A server-wide unique item id. |
| `host.kind` | Room kind: `town` / `wilds` / `instance`. |
| `host.terrain` | The room's terrain; `host.terrain.reader` = stream B's reader for a baked zone (use `groundAdapter(host.terrain.reader)`); dungeon instances have no reader (flat floors, `walkable` honours closed gates). |
| `host.objState(e, state, extra?)` | Set an object's state (`OBJ_STATES`): updates its `info.state` for late arrivals and emits `obj {id, state, …extra}`. |
| `host.spawn({kind:'object', type, name, x, z, data:{rules:true, key, r, state}})` | An arena object the rules own; `use` on it calls `rules.useObject(e, obj) -> {ok, why?, text?}`. |
| `host.safeZones`, `host.inSafeZone(x, z)` | Circles monsters must not chase into (the town, seen from the wilds). |
| `host.log(...args)` | Debug log (dropped in production). |

### 7.2 `Entity` (`js/sim/entity.js`)

Read: `id, kind ('player'|'monster'|'npc'|'object'), type, name, x, y, z, yaw, vy, hp, hpMax, mp, mpMax,
level, team, state, target, dead, rank, data, char (players: the saved character — cls, level, xp, gold, bag, equipment, …),
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
`/p/0`, `/status`, `/status.html`, `/healthz`. Options (header of main.mjs): `--port`, `--host`, `--db pg|json|memory`,
`--db-file`, `--env dev|stable` (a pg database must end in `_<env>`: dev and stable never share one), `--public <dir>`
(serve only a published copy, stream H), `--process <name>` (lease owner prefix), `--save-every`, `--journal-ms`,
`--linger`, `--terrain <zone>`, `--rules auto|v0`, `--build`. Environment (an env file outside the repo,
`server/env.example`): `PG*`/`DATABASE_URL`, `TV_TURNSTILE_SECRET`, `TV_TURNSTILE_SITEKEY`, `TV_ENV`. Stage 1 = one process.

### 8.2 Tick
Fixed 20 Hz loop with drift correction (each tick is scheduled for `start + k*50 ms`; late ticks run
immediately, more than 5 behind are skipped and counted). Per tick: apply inputs → `rules.step()` →
spawns/despawns → AOI refresh → snapshots and events → flush sockets.

### 8.3 `/status`
`GET /status` → JSON (and `/status.html` a small page): `ccu`, `rooms:[{id, players, monsters, entities}]`,
`tick:{p50, p95, p99, max, worst10m, overruns, skipped}` (ms, last minute), `msgsIn/s`, `bytesOut/s`,
`bad`, `rulesErrors`, `saves:{queue, lastMs, failed}`, `heap`, `uptime`, `build`, `db`. Read-only numbers.

### 8.4 Saves, the journal and crashes (M1.5, PLAN §9.2)
- Every change that matters becomes a **journal row** (`js/sim/journal.js`: `gold {d}`, `xp {d, level}`, `bagAdd {item}`,
  `bagDel {uid}`, `equip {equipment}`, `opened`, `pos`, `set`) — deltas and add/removes, so they stay right on top of
  any later blob. Rows are **group-committed every 2 s** (`--journal-ms`) in one statement that keeps only rows whose
  character still holds the writer's lease fence (`char_journal`, schema v2).
- The full **blob** is saved every 60 s if anything changed (`--save-every`), on logout, on a rare-or-better drop and
  on a level-up; it records the last journal seq it contains (`journal_seq`) and the rows up to it are pruned in the
  same statement. Every write sends a snapshot copy (the live character keeps changing while the write is in flight).
- **Load** = blob + the journal rows after its seq, in order. **Worst-case loss on a crash: ≤ 2 s.**
- **One writer**: lease + fence (`lease_fence` bumps on every take); blob saves are `… WHERE version=$v AND
  lease_fence=$f`; a frozen old process that wakes cannot write a blob or a journal row. At boot a process clears
  leases under its own name (`--process`, default `p0`), so after a `kill -9` + restart clients come straight back.
- **Trades** write both blobs in ONE transaction (`store.tradeChars`, versions + fences checked): everything moves or
  nothing does. Proven by tests/A/chaos.test.js: 500 crashes at random moments (writes landing 5–60 ms late, so crashes
  cut through saves, journal commits and trades) with four players trading/equipping/walking — every item held exactly
  once and the gold total unchanged after every restart.

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
net.use(objectId);                       // portals, stairs, exits, chests -> 'used'
net.item('equip' | 'unequip' | 'destroy', uid, slot?);   // -> 'bag', 'equip'
net.play(charId, { join: 'ABCDE' });     // from a ?join= link: into the party, next to the leader
net.partyOp('invite', { name }); net.partyOp('accept', { party }); net.partyOp('code'); net.partyOp('leave');
net.partyOp('kick', { char }); net.partyOp('lead', { char }); net.partyOp('join', { code });
net.party;                               // last partyState (or null); net.joinLink() -> 'https://…/?join=ABCDE'
net.partyChat(text); net.ignore(name, true|false);
net.on('party' | 'partyInvite' | 'partyFrames' | 'bag' | 'equip' | 'used' | 'targetR' | 'ignored', fn);
net.joined.you.bag / .equipment / .gold are kept current by client.js
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
- `js/sim/dungeon.js` `unrleTiles(rle, w*h)` — unpack `joined.room.dungeon.floors[i].tiles` (1 = floor).
- `js/net/tab.js` `tabNext(mirror, me, current, opts)` — the Tab-target order (nearest in front first,
  hostiles only by default, cycling).

---

## 10. Rooms and handoffs (M1, PLAN §8.2)

### 10.1 One zone as rooms
| Room | id | Rule |
|---|---|---|
| **Town** (hub) | `town` | A circle on the zone terrain (`room.area`; centre and radius from the bake's best settlement site, `sites[].radius` when B provides it, else by kind: village 65 m), shared by every wilds copy, **never copied**. No monsters; wilds monsters stop at its edge (`safeZones`). New characters and respawns start here. |
| **Wilds** | `wilds:<n>` | The open zone. One copy at first; a new copy opens when every copy holds `copyCap` (300) players; empty extra copies close after 5 min. You go to your party leader's copy, else the copy you were in, else the fullest under the cap. |
| **Dungeon instance** | `i:<n>` | Private per party (or per solo player): made when the first member uses the door, joined by any member while it lives, closed 30 min after the last one leaves (`instanceIdleMs`). 2 floors (stairs both ways), mini-bosses, a boss, a reward chest (once per character per run), an exit at the entrance and a loop-back exit after the reward room, both to the door outside. |

### 10.2 Handoffs
- Walking into the town circle (more than 2 m inside) moves you to the town room; walking out (more than
  2 m outside) moves you to your wilds copy. Same coordinates, same terrain. Edge crossings are queued and done
  3 a tick, so a crowd walking out together is spread over a few ticks (it may take up to ~0.3 s longer).
- `use` on a portal/stairs/exit moves you (stairs stay in the room: just a teleport, no handoff).
- A handoff keeps hp, mana, the rules' state (`e.r`), bag and party; the client gets a fresh `joined` with
  `handoff: {from, via}` (`via`: `gate`, `portal`, `exit`, `respawn`, `stairs`) on the same game socket,
  then `info` and FULL snapshot records for the new room. Old entity ids are void.
- Logging in: next to the party leader (join link); else your saved room — the town, your wilds spot, or the
  instance you left if it still lives and you may enter; a gone instance puts you at the door outside.

### 10.3 Dungeon plan shape (stream E's `js/rules/dungeon-tiers.js` must return this)
The world uses stream E's `js/rules/dungeon-tiers.js` `planDungeon` (families `crypt_spiral`, `mine_descent`); `js/sim/dungeon.js` keeps a stand-in with the same shape. Extra fields the server honours: `gate` (tiles shut until the floor's `lever` is used), `lever`, `shortcutUp` (stairs to floor 0), `packs[].type` / `.encounter`, `name` (`props` are ignored: C spawns arena objects). Shape:
```js
{ family, level, seed, cell: 2,
  floors: [ { index, origin: {x, z}, w, h,             // w×h tiles of `cell` metres; floors laid side by side
              tiles: Uint8Array(w*h),                  // 1 floor, 0 wall; index j*w + i
              rooms: [ { i, j, w, h, kind } ],          // entry|fight|key|miniboss|boss|reward|arrival
              entry: {x, z}, stairsDown?, stairsUp?, exit?, chest?,      // metres
              packs: [ { x, z, count, rank, level, radius } ] } ] }
```
Sent to the client as `joined.room.dungeon` = `{ family, name, look, level, cell, standIn, floors: [{ index, origin, w, h,
tiles: <run lengths: 0s, 1s, 0s, …>, rooms, gate?: {i, j, w, h, open} }] }` (gate tiles are 1 in `tiles`; draw them as a closed gate until `open`). Objects (stairs, exits, the chest) are ordinary
`kind:'object'` entities with `info.type` = `stairs` / `exit` / `chest` / `portal`.

## 11. Parties (M1, PLAN §5.3, §5.5)
- Up to 5. Parties live on the gateway; they survive logouts and reconnects (offline members show
  `online:false`), are disbanded 15 min after nobody is online, and do not survive a server restart (M1).
- Every party has a 5-letter **code** (Bannerline's alphabet, no I/O). The **join link** is
  `<page URL>?join=CODE`; the client passes it to `net.play(charId, {join})`. A friend who opens it lands in
  the party, in the leader's room (an instance too, if the party owns it), 1.5 m from the leader.
- `partyState` on every change, `partyFrames` at 2 Hz (health + position of every member, any room).
- Party members share a dungeon instance; the rules see allies through `e.data.partyId`.
- Party chat: `chat {ch:'party'}`. Ignore lists apply to say and party chat. Admin mute hook:
  `world.mute(charId, untilWallMs)` (chat answers `err {code:'muted'}`); `filterText` option = a text filter hook.

## 12. Loot, bag, equipment, the faucet/sink log (M1)
- **Personal loot**: kills and chests put items straight into the bag (`bag` message + `loot` event). Every
  item has a server `uid`. Bag holds 120; past that an item is turned into its `value` in gold (logged).
- Saved fields (SAVE_FIELDS): `bag`, `equipment` (the rules' gear blob), `opened` (chests: key → reopen
  time), `ignore`, `exit` (where a lost instance puts you), `mutedUntil`, plus `gold`, `xp`, `level`.
  A rare-or-better item saves at once; everything else within `saveEvery` (10 s). Logout keeps loot.
- **Faucet/sink log** (PLAN §13): every gold/item gain or loss is logged with a reason (`kill`, `chest`,
  `overflow`; sinks `destroy`) and the level band (`floor((level-1)/5)`); hourly rows are upserted into
  `economy_log` (schema v1) every minute; `/status.economy` shows the last hour.

## 13. Trades (M1.5)
`trade {op}` on the province socket (§3.1): ask (within 10 m, both alive, not ignoring) → accept → offers (≤ 12 uids
from the bag + gold; any change unlocks both) → both lock → both confirm → one all-or-nothing store write. While a trade
is open its offered items cannot be equipped/destroyed or offered elsewhere; a character is in one trade at a time;
walking apart, dying, leaving or logging out cancels. While the write is in flight both characters' new loot waits
(a couple of ticks). `tradeState` keeps both windows current; `trade:null` closes them (`done` or `why`).
Options: `tradeMinLevel` (PLAN §5.5 wants claimed accounts at level 5+ for trades from M3; default 1 until claims exist).

## 14. Human check on new guests (M1.5, PLAN §9.4)
When `TV_TURNSTILE_SECRET` is set, `welcome.human = {provider:'turnstile', siteKey}` and `guest` must carry
`human: <Turnstile token>`; the server checks it with Cloudflare (`server/turnstile.js`) and answers `err {code:'human'}`
if it fails. New accounts are limited to 20 per network per hour (`err {code:'tooMany'}`; loopback/worker exempt).
`js/net/client.js` takes `connect({ human })` = a token or `async ({siteKey}) => token` (the client renders the widget).
Cloudflare's public test keys are in `server/env.example` (site key `1x00000000000000000000AA` passes, token
`XXXX.DUMMY.TOKEN.XXXX`); the real pair lives only in the env file outside the repo.
