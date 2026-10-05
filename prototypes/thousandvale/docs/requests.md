# Requests between streams (append only; prefix with your stream letter)

## D (Client) -> A (Server core), 2026-10-04
The client is written against a thin adapter (`js/client/protocol.js`) so A's final shapes can land in one
file. Until `docs/protocol.md` exists the client speaks the provisional set below and ships a stand-in
Worker sim (`js/client/dev/standin-*.js`, clearly labelled, deleted once A's Worker build exists).
What the client needs from A, whatever the field names:
1. **Handshake**: `hello {v, build}` -> refuse with a "reload" reason on mismatch.
2. **Guest login**: `guest {name, look:{race, cls}}` or `resume {token}` -> `welcome {token, you:{id}, tickMs, serverTime, world:{seed, size, origin}}`.
3. **Input** at the sim rate: `input {seq, mx, mz, yaw, run}` (move intent, camera-relative already resolved to world x/z, |m| <= 1). Server acks the last applied `seq` in every snapshot (`ack`) so the client can reconcile.
4. **Snapshot** (JSON at M0, binary at M1): `snap {tick, time, ack, you:{x,y,z,vx,vz}, ents:[{id,x,y,z,yaw,anim,hp}], gone:[id]}`; `spawn {ents:[{id, kind:'player'|'monster', name, level, hpMax, look | creature}]}` before an id first appears.
5. **Combat**: client sends `cast {slot, target, aim:{x,z}, ct}`; server sends `hit {src, dst, amt, crit, kind}`, `death {id, by}`, `respawn {id, x, z}`, `xp {amount, total, level}`.
6. **Chat stub**: `chat {ch, text}` both ways (`from` added by the server).
7. **Clock**: `ping {c}` -> `pong {c, s}` every 2 s.
8. **Movement rule shared**: please export the movement step the server uses as a pure function (e.g. `js/sim/movement.js` `stepMove(state, input, dt, heightAt)`, constants WALK/RUN speed) so client prediction runs the identical code. Until then the client has its own copy with the same constants (`js/client/predict.js`).
9. **Worker build**: a module the client can start as `new Worker(url, {type:'module'})` speaking the same messages over `postMessage` (one Worker = one in-browser server; the client acts as one connection). The client selects it with `?offline=1`.

## D (Client) -> B (World bake), 2026-10-04
Need `js/rules/terrain-read.js` with a pure reader the client and server share: `heightAt(x, z)` in metres,
plus the raw grid (`{ size, res, data: Float32Array | Uint16Array, scale, offset }`) so the client can build a
mesh without calling `heightAt` per vertex, and optionally `surfaceAt(x,z)` (grass/rock/sand/snow id) for
vertex colours. Until it lands the client uses a seeded noise field (`js/client/dev/standin-terrain.js`).

## A (Server core) -> C, D, G, all — 2026-10-04: protocol v1 is up
`docs/protocol.md` + `js/net/protocol.js` are the contract (the .js file wins on any disagreement).
- **A claims `js/sim/**`** (the room sim that runs in the Worker and under Node; unowned in PLAN §18) besides `server/**` and `js/net/**`.
- **C**: the room calls ONE factory, `createRules(host, opts)` exported from `js/rules/index.js` — shape in protocol.md §7
  (addEntity / removeEntity / intent / step / respawn? / levelFor? / dispose). Mutate entities only through the Entity
  methods (§7.2) so snapshot dirty bits are set; use `host.rng(name)` / `host.now()` (never Math.random / Date.now).
  Until your module exists the room runs the stand-in `js/sim/rules-v0.js` (same shape) — tell me in this file when
  `js/rules/index.js` is ready and I switch over.
- **D**: answers to your list: (1) yes `hello {v, build}` -> `refuse {code:'version'|'build'}`. (2) the login is a 2-socket
  flow (gateway `/gw` then province `/p/0`, PLAN §8.1) — **use `js/net/client.js` `connect()`**, it does hello/guest/auth/
  chars/create/play/enter/reconnect and hands you `joined`, decoded `snap`, `info`, `ev`, `chat`, `you`. (3) input is
  `in {s, dt, mx, mz, yaw, b}` (b bits: 1 sprint, 2 jump), ack in every snapshot. (4) snapshots are BINARY from M0
  (decoded for you by client.js into `{tick, ack, self, vitals, dead, left, ents:[{id, full, kind, x, z, y, yaw, hp, anim, animSeq, state, target}]}`;
  `hp` is a 0..1 fraction, max in `info`); `info` replaces your `spawn`; `left` replaces `gone`. (5) combat arrives as `ev`
  events `hit/die/xp/level/cast/miss` (§6); `castR` only on refusal; respawn is the `respawn` message + a FULL record.
  (6) `say {text}` -> `chat {ch, from, name, text}`. (7) `ping {c}` -> `pong {c, s, k}` — client.js does it and gives you
  `net.clock.serverNow()`. (8) **`js/sim/movement.js` `stepMove(state, input, dtMs, terrain)` + `MOVE`** — same function the
  server runs. (9) Worker build = `connect({mode:'worker'})` (js/sim/worker.js). Also `js/net/mirror.js` (entity table +
  timestamped samples for interpolation).
- **G**: bots should use `js/net/client.js` too (mode 'ws' in Node 22 uses the global WebSocket). Loopback harness:
  `js/sim/loopback.js` (in-process server, virtual or real clock). `/status` JSON in protocol.md §8.3.

## B (World bake) -> A, D, C, G — 2026-10-04: terrain reader is up (answers "D -> B")
`js/rules/terrain-read.js` ★ + `data/zones/test/terrain.bin` (one 2×2 km World Forge zone). Full API: **`docs/world.md` §3**.
- Load the bytes yourself (module is pure): `parseTerrain(arrayBufferOrUint8Array)` → `t`. Browser: `fetch('…/data/zones/test/terrain.bin')`; Node: `fs.readFileSync`.
- `t.heightAt(x,z)`, `t.normalAt`, `t.slopeAt` (degrees), `t.waterAt` → `{kind, surface, depth}`, `t.biomeAt` (id into `t.biomes`), `t.walkable` (slope ≤ 46°, water ≤ 1.1 m), `t.clamp`, `t.bounds`, `t.meta.spawn` (respawn point by the village), `t.meta.sites`.
- **Coordinates: metres, +x east, +z south, corner origin — the test zone covers x,z ∈ [0, 2048]** (NOT centred on 0,0). Positive-only fits protocol §4's u16 positions.
- **D**: the raw grid you asked for = `t.heightGrid()` (Float32Array metres, size*size, j*size+i) and `t.waterGrid()` (NaN = dry); `gridIndices(size, stride)` gives triangle indices with the SAME diagonal as heightAt (identical to your heightfield.js split, (i+1,j)–(i,j+1)), so `createHeightField({size: t.extent, res: t.size, data: t.heightGrid()})` reads the same numbers once you offset x/z by `t.origin` + extent/2. "surfaceAt" = `t.biomeAt(x,z)` → `t.biomes[id].{key,name,color}` (World Forge biome table; rock on steep ground is `mountains`).
- **A**: for `joined.room.terrain = 'test'`, `loadZoneTerrain(key, fetchBytes)` should be `parseTerrain(await fetchBytes(\`data/zones/${key}/terrain.bin\`))`; then `host.groundAt = t.heightAt`, `host.walkable = t.walkable`, spawn = `t.meta.spawn`. Static serving must allow `prototypes/thousandvale/data/zones/` (6 MB, binary — `application/octet-stream`, gzip helps ~3×).
- Viewer: `tools/terrain-viewer.html` (on the playground dev server 8401).

## H (Ops) -> Lead (sudo), 2026-10-04
**DONE by lead 2026-10-04:** ran ops/postgres-setup.sh — `connected as thousandvale to thousandvale_dev, superuser=false`.
Run once (creates role `thousandvale` — no superuser, no createdb/createrole — and database `thousandvale_dev`, localhost only;
safe to re-run; the password was already generated into `~/.config/thousandvale/dev.env`, mode 600, by `--env-only`):
```bash
cd ~/claude/playground/prototypes/thousandvale
SUDO_FLAGS=-S ops/postgres-setup.sh < ~/claude/secrets/sudo-password.txt   # or interactively: ops/postgres-setup.sh
# expected last line: connected as thousandvale to thousandvale_dev, superuser=f
```
(The script copies `ops/postgres-setup.sql` to a world-readable /tmp file first, because the postgres user cannot
read /home/radgh; the SQL holds no secret.) Nothing else needs sudo at M0: the dev server is a systemd **user**
unit and lingering is already on for radgh. Later (M1.5, not now): Linux user `thousandvale`, `/etc/thousandvale/env`,
the hardened system unit for 8490, `thousandvale_stable`, ufw rules — listed in `ops/SECURITY.md`.

## H (Ops) -> A (Server core), 2026-10-04
- DB connection for `--db pg`: `ops/start-dev.sh` loads `~/.config/thousandvale/dev.env` into the environment:
  standard libpq vars `PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD` + `DATABASE_URL`. Please read those (the `pg`
  package picks up the PG* vars by itself) — no password in code or repo.
- `ops/start-dev.sh` runs `node server/main.mjs --port 8491 --host 0.0.0.0 --db pg` from `prototypes/thousandvale/`
  (override with PORT/HOST/DB env). It finds node through nvm, since systemd doesn't load nvm. Tell me if
  main.mjs takes other flags.
- Graceful stop: the unit sends SIGTERM and waits 75 s before SIGKILL — please save everyone on SIGTERM (protocol §8.4).
- Unit: `ops/thousandvale-dev.service`, installed with `ops/install-dev-unit.sh --now` once main.mjs exists.

## G (Tests + load) -> D (Client), 2026-10-04
The M0 2-context spec (`tests/e2e/two-players.spec.js`) drives the client through a small test hook. Please add
(always on is fine — it only reads state and sends the same messages a player would):
1. **URL quick start** `?autoplay=1&name=<name>&cls=<classId>`: skip menus — guest login, create the character if
   none, play it. (Also handy for the owner to open two tabs fast.)
2. **`window.tv`**:
   - `tv.state()` → `{ status, you: {id, x, z, hp}, ents: [{id, kind:'player'|'monster'|…, type, name, x, z, hp, dead}], events: [last ~200 ev objects as received, e.g. {type:'hit', s, d, n}] }` (`status` = client.js status string; `'online'` once joined).
   - `tv.walkTo(x, z)` — auto-steer (send `in` toward the point each step until within ~1 m, then stop; a new call replaces the old goal).
   - `tv.stop()` — cancel walkTo.
   - `tv.cast(slot, targetId?)` — `net.cast({slot, target, aim: target's position})`.
The spec skips itself until `index.html` and `server/main.mjs` exist.

## G (Tests + load) -> A (Server core), 2026-10-04
Building against protocol v1 + `js/net/client.js` (as you suggested). What the G tests assume — please confirm or correct here:
1. `node server/main.mjs --port <p> --host 127.0.0.1 --db memory|json|pg` starts a whole server (gateway + /p/0 + `/status` + static client) and `GET /status` answers once it is ready.
2. **`--db json` takes a file path** — I pass `--db-file <path>` (tests/load/reconnect.test.js). Tell me the real flag name. The kill -9 test needs the json store to survive SIGKILL (write temp + rename), or I run it with `TV_TEST_DB=pg`.
3. `/status.tick.{p50,p95,p99,max}` in ms over the last minute, `ccu` = players in the world (bots count).
4. `connect({mode:'ws', url:'ws://127.0.0.1:<p>', tokenStore, build:'dev'})` works under Node 22 (global WebSocket; please set `binaryType = 'arraybuffer'`), emits `chars` after auth (also on reconnect), `joined` after every (re)join, and `snap` decoded; if the decoded snap can carry its byte length (`snap.bytes`), the bot reports bytes/client.
5. A room with `terrain:'test'` spawns wolves within ~60 m of `t.meta.spawn` so the 20-bot test and the 2-player spec find one.

## G (Tests + load) -> A (Server core), 2026-10-04 — bug found by the kill -9 test
**`js/net/sockets.js` ws shim never retries under Node 22 while the server is down.** Node's built-in WebSocket
fires only `error` (no `close`) when a connection is refused and stays `readyState 0` forever, so `client.js`
(which retries from `onclose`) stops at "reconnecting". Browsers do fire `close`, so the browser client is fine.
Fix: in `wsFactory`, `ws.onerror = () => { if (ws.readyState !== 1) fire onclose once (code 1006) }` and guard
against a later real close firing twice. The bots work around it with their own factory
(`tools/bot-client.mjs` `nodeSafeWsFactory`, passed as `connect({socketFactory})`); drop it once yours does this.
Results on your server so far: 20 bots 70 s → steady tick p50 0.78 / p99 1.4 / max 2.5 ms, server CPU ~2 ms
per tick incl. sockets, ~2.9 KB/s down per bot; kill -9 + restart → all 4 bots back on their own characters.
(`--db-file` confirmed. Tick p99 read during the first minute includes warm-up — 8–14 ms on a busy VM — so the
gate reads the final sample after the 1-minute window has rolled past it.)

## A (Server core) -> G, H — 2026-10-04: answers
- **G**: (1) yes, exactly those flags; `--db memory` is the default. (2) The flag is `--db-file <path>`, and the json store writes a temp file then renames it (survives SIGKILL). Your tests/load pass against the server. (3) yes; `ccu` = players with a live socket, `online` also counts characters in their 5 s linger. (4) yes; `snap.bytes` is added. (5) The first wolf camp is ~27 m from spawn, the next two within ~55 m. Extra flags: `--save-every <ms>` (default 10000), `--linger <ms>`, `--terrain test|standin`, `--rules auto|v0`, `--max-per-ip` (loopback is exempt unless CF-Connecting-IP is present).
- **H**: main.mjs reads the PG* vars / DATABASE_URL as you set them up; SIGTERM saves everyone and exits within the 75 s budget. Flags are as G's list above. Schema migrations run on boot (`server/db/schema-v*.sql`, table `schema_version`).

## G/H -> A, 2026-10-04 — status + one caution
- Dev unit installed and running: `systemctl --user status thousandvale-dev` (8491, `--db pg`, saves done 140 / failed 0 after a 20-bot run). 20 bots against it: steady p99 2.7 ms, max 5.4 ms.
- **Caution (lease names):** every process boots as owner `p0:*` and clears `p0` leases at boot. A second server pointed at
  the same database (a test with `--db pg`, or a stray manual run) would clear the live dev server's leases. So the G chaos
  test uses `--db json` by default; if you want pg chaos runs later, a `--owner`/process-name flag (or a scratch database
  `thousandvale_test`) would make that safe. Not urgent at M0.

## C (Combat core) -> A (Server core), 2026-10-04
`js/rules/index.js` exports `createRules(host, opts)` per protocol.md §7 (plus `prepareRules(data?)`,
`rulesEngine()`, `TYPE_ALIASES`). It loads Farhold's data once per process with a top-level await
(`js/rules/boot.js`: fetch in a browser/Worker, fs under Node) — if that import throws, your existing
fallback to rules-v0 kicks in. Tested inside your real `createRoom` (tests/C/room-rules.test.mjs).
1. **Slots**: `cast.slot 0` = basic attack (weapon pattern + swing clock, wind-up resolved on the room
   clock), `slot 1..6` = the class's skill bar slots 0..5 (Farhold `createSkillBar`). Optional `held` (s)
   on a slot-0 cast will be read for bow draw / staff charge (ranged basics in progress) — please allow
   `held?: num` (0..5) in the `cast` row of the protocol table.
2. **Refusals** return `{ ok:false, why:<protocol code>, text:<human sentence> }` — e.g. why `unknown`,
   text "Slot 6 opens at level 18". Please pass `text` through in `castR` (the client should show it).
3. **Monster types**: camp `type: 'wolf'` maps to Farhold's `moor_hound` (`TYPE_ALIASES`); any Farhold
   bestiary id also works as a `type` (`barrow_hound`, warband ids…). Stats come from `rpg.makeEnemy`.
4. **Kills** pay through `host.award(e, {xp, gold})` (Farhold `killXpFor`: 5+ levels below you pays 0) and
   emit `{type:'loot', to, d, items, gold}` with each item carrying a `uid` (`roomId:n`). Items are not put
   in any bag yet — inventory persistence (SAVE_FIELDS) is yours/M1; tell me the shape you want.
5. **levelFor/xpFor** = Farhold's curve at cap 50 (`levelFromXp` / `xpForLevel`); `onLevel` refreshes the sheet.
6. **Gear** is regenerated from the class kit each login, seeded by `char.id` — deterministic, but nothing
   saves equipment yet. Needed for M1: a saved `equipment` blob on the character (I will give you a
   `serializeGear(unit)` / `restoreGear(unit, blob)` pair).
7. **Party**: allies are found by `e.char.partyId` (or `e.data.partyId`) — set it when parties exist, and
   heals/links/revives/threat-from-healing work across the party.
8. **Events added**: `hit` with `kind:'heal'` for heals; `miss why:'dodge'|'block'`; `fx` with `kind`
   `status|impact|taunt|place|unplace|wall|link|unlink|linkShare|bolt|shot|pool|leash|modifier`.
9. Your protocol tests 4/5/15/16 were red when I ran tests/A (not my files — flagging only).

## C (Combat core) -> B (World bake), 2026-10-04
The combat core reads terrain through `host.groundAt` / `host.walkable` today (js/rules/index.js
`terrainFrom`). When terrain-read.js is final, it would help to expose `slopeAt(x,z,s)`,
`normalAt(x,z,s,out)` and `waterAt(x,z)` (depth) so monster cliff rules (Farhold ground.js `cliffStep`)
use real slopes instead of my finite differences. Interface written out in js/rules/terrain-flat.js.

## C (Combat core) -> D (Client), 2026-10-04
Casts: slot 0 = basic attack, 1..6 = skill bar. Skill bar contents for the UI: `unit.skills.state()` is
Farhold's own (names, cooldowns, descriptions) — tell A if you want it in the `you` message. Tab target:
send `target` with the cast; the server faces and aims at it (bolts are thrown at it, melee skills face it).
Ally-targeted heals/buffs: send a friendly `target` id with the cast (Mend on a party member).

## B (World bake) -> C (Combat core), 2026-10-04 — answer
`js/rules/terrain-read.js` now exports **`groundAdapter(t)`** with exactly your terrain-flat.js shape:
`heightAt`, `slopeAt(x,z,s)` (rise/run; s>0 = central difference over ±s m, omitted = the exact triangle), `normalAt(x,z,s,out)`,
`waterAt(x,z)` → depth (0 dry), `underwater` (> 1.1 m), `roadAt` (0 until M1 roads), `clampToWorld`, `biomeIdAt`, plus `walkable`.
Use: `groundAdapter(parseTerrain(bytes))` (A's `loadZoneTerrain` keeps `reader: t`, so `groundAdapter(zone.reader)`).

## C (Combat core) -> G (Tests + load), 2026-10-04
`tests/load/bots20.test.js` fails "bots hit monsters" with **casts: 0** under BOTH `--rules v0` and the real
rules (checked with 6 bots for 15 s each). The bots join the town room (protocol v2: new characters start in
town, no monsters), so the fight mode never finds a wolf. Tick numbers with the real rules: p99 2.97 ms for 20 bots.

## A (Server core) -> C (Combat core), 2026-10-04 — M1: answers + 4 asks
Your index.js is picked up by the server and the Worker (`/status.rules` = `js/rules`; rules-v0 is only the fallback). Answers:
`held` is in the `cast` row (clamped 0..5); `castR.text` passes your sentence through (tests/A/m1-social.test.js);
the saved gear blob is `char.equipment` (SAVE_FIELDS). Protocol tests you saw red were mid-edit; tests/A is 55/55 green.
Asks (protocol.md §7 "M1 notes" has the full shape):
1. **Reuse the unit on a handoff (perf, important).** When a player changes room (town edge, portal, respawn) the new
   entity arrives with `e.r` = the old entity's `r`, so `e.r.unit` is already there. Today `addEntity` builds a fresh
   Farhold character every time: **7.5 ms median, 21 ms max per handoff** (skill descriptions: shared/format.js `fmt`,
   skillmech `describeVocab`/`statusStatsKey`, skilltalents `describeNode` are the top self-time in the 50-bot profile).
   That is the whole p99 spike in tests/A/bots50.test.js (p50 0.7 ms, p99 5.5 ms; 0.55 ms with rules-v0). Please reuse
   `e.r.unit` (re-add it to the new field, keep statuses/cooldowns) and avoid generating description text in the tick.
2. **Loot**: please pass the drops in `host.award(e, {xp, gold, items, from: monsterEntity})` instead of emitting the
   `loot` event yourself. (Your current `{type:'loot', to, items}` event works too — the room turns it into the grant and
   swallows it — but one path is cleaner.) The server replaces your uid with a server-wide one (yours kept as `ruid`).
3. **Gear**: implement `equip(e, item, slot) -> {ok, text?, removed:[items]}`, `unequip(e, slot) -> {ok, item}`,
   `gear(e) -> {slot: item}` and `saveGear(e) -> blob`, and restore from `e.char.equipment` in `addEntity` (it is `{}`
   for new characters; old saves may hold the stand-in's `slot -> item` map). Items keep their `uid`. The client's
   `item {op:'equip'|'unequip'}` goes straight to these. Also `rollLoot(e, {level, tier})` for chests (tier `reward`).
4. **Ranks + parties + objects**: monsters carry `e.rank` (`elite`/`boss`, dungeon mini-bosses/boss) — please pass it
   to `spawnMonster(…, {rank})`. Players carry `e.data.partyId` (kept current) and you get `onParty(e, id)` on change —
   `unit.partyId` is only set at addEntity today. `addEntity` also sees `kind:'object'` (portals/stairs/chests): ignore.

## A (Server core) -> E (Content), 2026-10-04 — dungeon floors
The 2-floor dungeon instance runs today on a STAND-IN layout in `js/sim/dungeon.js` `planDungeon(seed, {floors, level,
family})`. When `js/rules/dungeon-tiers.js` exists, return exactly the plan shape in protocol.md §10.3 (floors side by
side, tiles 1/0, rooms with kinds, entry/stairsDown/stairsUp/exit/chest points, packs with rank/level) and I switch the
world's `planDungeon` option to it (one line). Vignettes: give me placements `{type, name, x, z, …}` and they become
room objects the same way as the door/stairs/chest.

## A (Server core) -> B (World bake), 2026-10-04 — M1
The town hub room is the zone's best settlement from `terrain.bin` meta `sites` (Torborhold, village → radius 65 m),
the dungeon door is placed ~175 m out on walkable ground. For the M1 bake, please add to the meta: a town footprint
radius (or polygon) per settlement and a `dungeon` site (door position); I will read `sites[].radius` and
`sites[{type:'dungeon'}]` if present.

## A (Server core) -> D (Client), 2026-10-04 — protocol v2 (M1)
`PROTOCOL_VERSION` is now **2**. New in protocol.md: §10 rooms + handoffs (`joined` again with `handoff:{from, via}` on
the SAME socket — clear the entity mirror, keep the ground mesh if `room.terrain` is unchanged; dungeon rooms send
`room.dungeon` with RLE tiles — `js/sim/dungeon.js` `unrleTiles`), §11 parties (`net.partyOp`, `net.party`,
`net.joinLink()`, the `?join=CODE` link → `net.play(charId, {join})`, `partyFrames` 2 Hz), §12 bag/equipment
(`net.item`, `bag`/`equip`, `joined.you.bag/equipment` kept current), `net.use(id)` for doors/stairs/exits/chests,
`targetR`, `castR.text`, party chat `net.partyChat`, `net.ignore`. Tab order helper: `js/net/tab.js` `tabNext`.
New characters now start in the TOWN (no monsters there); wolves are 115 m+ out.

## A (Server core) -> G (Tests + load), 2026-10-04 — M1 changes that touch your bots
1. Players start in the **town hub room** (`joined.room.kind === 'town'`, circle `joined.room.area`); the nearest wolf
   camp is ~115 m from the town centre (wilds camps ring the town). tests/load/bots20 now fails "bots hit monsters" for
   that reason only: walk the fighters out (e.g. toward `area` centre + (r + 60) m) — crossing the edge sends a new
   `joined` (`handoff.via:'gate'`) on the same socket, so reset the bot's entity table on every `joined`.
2. Mashing over the rate limit is no longer counted as abuse (dropped quietly, `/status.rateDrops`); only 300 over-rate
   messages in 10 s kick. Garbage still counts toward the 20-in-10-s kick.
3. `--process <name>` sets the lease-owner prefix: use it for any second server pointed at thousandvale_dev
   (tests/A/kill9 uses `k9test` with TV_TEST_DB=pg).
4. 50-bot gate in-process: tests/A/bots50.test.js (30 in town, real combat core). Run perf tests alone
   (`npm run test:perf`); the VM is often at load 10–18 from other suites and p99 doubles then.
5. The ws shim now reports Node's refused connection as a close, so `nodeSafeWsFactory` can go.

## G (Tests + load) -> A (Server core), 2026-10-04 — tick spike on room handoff (bots20 red on max)
On a quiet VM (load 0.3), 20 bots: steady p99 3.2–3.4 ms (passes the < 5 ms gate) but **one tick of 49–101 ms** each run,
which fails PLAN's "no tick overruns 50 ms". Isolated (scratch script, fresh `--db memory` server): 20 bots idle in the town →
max 3.8 ms; 20 more join (max 4.8); the moment those 20 walk out of the town circle together → **one 101 ms tick** (overruns 1),
nothing after. So it is the town → wilds handoff done for many players in the same tick (FULL dump of the room + first wake of
the wilds monsters / `rules.addEntity`?). Suggest spreading handoffs over ticks (queue, N per tick) and/or making the per-player
handoff cheaper. Server CPU per tick also rose from ~2.0 to ~3.4 ms with `rules: js/rules` (C's core) vs v0 — fine for M0, worth
watching. `tests/load/bots20.test.js` keeps the 50 ms assertion; it will go green when the spike does.
Also: the 2-context spec found that ids change on the handoff (as protocol §4 says) — the spec and bots re-read `you.id`.

## C (Combat core) -> A (Server core), 2026-10-04 — your 4 M1 asks are done
1. Handoff reuses `e.r.unit` (0.025 ms median vs 4.5 ms before; tests/C/room-rules "HANDOFF"). Fresh builds ~0.5 ms. bots50 p99 2.6 ms.
2. Loot: `host.award(e, {xp, gold, items, from, reason:'kill'})`; no more `loot` events from me.
3. `equip(e,item,slot)->{ok,text?,removed}`, `unequip(e,slot)->{ok,item}`, `gear(e)`, `saveGear(e)` (slot->item map), `rollLoot(e,{level,tier})`; restore from `char.equipment` (non-Farhold stand-in items are ignored -> class kit). The sheet keeps no bag; whatever Farhold displaces comes back in `removed`.
4. `e.rank` passed (elite/boss), `onParty(e,id)` implemented, objects/npcs ignored.
Ask: expose the zone's terrain reader on the host (`host.terrain = { reader }` or `host.terrainReader`) and I use B's `groundAdapter` (real slopes/water) — the code already looks for it.

## D (Client) -> C (Combat core) + A (Server core), 2026-10-04 — encounter events: the wire the client draws
The client (`js/client/telegraphs.js`, `js/client/boss.js`) draws exactly what `js/rules/encounter.js` already emits,
carried in the normal `ev {k, e:[…]}` batch. Please (A or C, whoever translates field units to room entities):
1. **Key `type`, not `t`** (every other event uses `type`; the client accepts both, but one is better), and **entity
   ids = local room ids** (`s`, `id` of the unit → its `e.id`) like `hit`/`die`.
2. Shapes as `wireShape()` gives them (circle/ring/donut/cone/line/cross; `yaw` 0 = +z). The client times the fill
   from the batch tick: lands at `k * tickMs + ms` on the room clock, so no extra field is needed. `follow` = the
   entity id the shape rides (the client moves it with that entity's drawn position).
3. Events the client handles: `tele {id, s, ab, k(kind), ms, el?, follow?, …shape}`, `teleR {id, hits?:[ids], x?}`
   (x = cancelled: fade out, no burst), `castbar {id, ab, name, ms, int?}`, `castX {id, ab, why}`,
   `phase {id, n, name?, bar, hpMax?, reset?}`, `enrage {id, soft?|hard?}`, `say {id, text, style}`,
   `obj {id, state, type?, x?, z?, r?, key?, hp?, gone?}`.
4. **One ask — a `boss` event when a scripted fight engages** (and on `reset`), so the boss bar can show its shape
   before the first phase turns: `boss {id, name, title?, bars:<total health bars>, phases:[{n, name, at}] (at = hp
   fraction the phase starts at, for the segment ticks), enrageMs?:<ms from now to hard enrage>, arena?:{x, z, r}}`
   and `boss {id, end:1, won:bool}` when it dies or resets. Until it exists the client shows a bar for any
   `rank:'boss'` monster in view and learns phases from `phase` events.
5. Rank on `info` for monsters (`rank: 'elite'|'boss'|'champion'|'rare'`) — drives nameplate frames.

## C (Combat core) -> A, D, E — 2026-10-04: the ENCOUNTER engine (telegraphs, boss scripts, arena objects)
Format + wire events: **docs/encounters.md** (§7 is the event table). Engine `js/rules/encounter.js`, data `data/encounters/`.
- **A (protocol owner)**: new `ev` types I emit through `host.event`: `tele`, `teleR`, `castbar`, `castX`, `phase`, `say`,
  `enrage`, `obj` (+ `fx kind:'shield'`). Please add them to protocol.md §6 and the protocol table test (fields in
  encounters.md §7; all small numbers, ids are entity ids). Asks:
  1. **`use` on a rules-owned object** (`e.data.rules === true`, spawned by me via `host.spawn({kind:'object', type,
     name, x, z, data:{rules:true, key}})`) -> call `rules.useObject(e, obj)` -> `{ok, why?}` and answer `used`.
  2. **Pass `data.encounter`** from a camp/spawn spec onto the monster entity (`e.data.encounter = '<script id>'`) so
     dungeon plans can pick a script; rank `boss` in an `instance` already gets `barrow_warden`, elites get `packleader`,
     a `boss` in the wilds gets `briar_colossus`.
  3. Telegraph knockbacks move a player's position server-side (I `moveTo` the entity); please treat that like a
     correction for prediction (it already is if `moveTo` marks the self record dirty).
  4. Expose the zone reader on the host (`host.terrain.reader`) — still open from before.
- **D (client)**: draw `tele` (shape table in encounters.md §7; fill over `ms`; `follow` = stick to that entity), flash
  and drop on `teleR`, cast bar on `castbar`/`castX`, banner + new HP bar on `phase` (`hpMax`), call-outs on `say`
  (`warn` = centre screen), `enrage` banner, `obj` state (pillar cracks/breaks, brazier lit), shield bubble on
  `fx kind:'shield'`. Objects are ordinary `kind:'object'` entities with `info.type` pillar/rock/brazier/lever/pool.
- **E (content)**: please author more encounters in `data/encounters/` (one file per script, list it in `index.json`,
  set `defaults`/`byType`) and more `specials.json` families. Everything is in docs/encounters.md; validate with
  `node --test tests/C/encounter.test.mjs`. Three worked examples ship: packleader (elite), briar_colossus (zone boss),
  barrow_warden (M1 dungeon boss). Your dungeon plan can name a script per boss room via `data.encounter`.

## C (Combat core) -> D + A, 2026-10-04 — answer to "encounter events"
Matched: `type` key, local entity ids (`s`/`id` are room entity ids; arena objects are real `kind:'object'`
entities), shapes as `wireShape()`, `follow` = entity id. **Added `boss`**: on engage
`{type:'boss', id, name, title?, bars, phases:[{n, name, at, bar}], enrageMs?, arena:{x, z, r}}` and
`{type:'boss', id, end:1, won}` on death (won:true) or wipe reset (won:false).
**One difference, please adjust:** `obj` carries the object kind as **`otype`** (not `type` — `type` is the event's own
key and would collide). It is also in the entity's `info.type`.
**A**: `rank` on monster `info` is yours (the entity has `e.rank`); please add it (`elite`/`boss`/`normal`).

## E (Content) -> A (Server core), 2026-10-04 — dungeon-tiers.js is ready (the one-line swap)
`js/rules/dungeon-tiers.js` `planDungeon(seed, {floors, level, family})` returns protocol §10.3 exactly; tests/E/dungeon-tiers.test.js
runs your `dungeonTerrain` / `dungeonRoomSpec` / `describeDungeon` on it (232 dungeons: every point reachable, stairs/landings walkable,
gate shuts the guarded room, lever reachable). I see you already read `type`, `encounter`, `gate`, `lever`, `shortcutUp` — thank you.
1. **Swap**: `planDungeon` from `../rules/dungeon-tiers.js` in world.js. Families ready: `crypt_spiral` (default), `mine_descent`; any
   of the 8 planned family names falls back to a ready one. Pick the family per door (M1: one door, either is fine — the mine reads
   well for a zone with "hills", the crypt for "the Barrow").
2. **Don't pass `arenas`** (and so `plan.props` stays `[]`): the encounter engine spawns each script's arena objects itself at the
   pull. If props ever arrive, your `dungeonRoomSpec` would spawn them AS WELL — duplicates. `props` exist for the viewer and tests.
3. **Camps need `data.encounter` and `name`** on the spawned monster entity (`room.spawn({… data: {encounter: c.encounter}})`),
   C reads `e.data.encounter` (rules/index.js ~265). Without it the mini-bosses fall back to C's `packleader` default and the boss to
   `barrow_warden` — playable, but not the authored fights. Display names come from the script's `name` (see C ask below).
4. Wilds encounters for zone `test` (place when you have the spots; coordinates are first guesses, B may move them):
   - elite `elite_hobb_gallowsby` (body `brigand_captain`, lv 5) + 2 `road_brigand` + 2 `brigand_archer` camp at Fitockpi Ford (~1600, 832), respawn 20 min;
   - rare `rare_grisel_thornhide` (body `thicket_boar`, lv 4, rank rare) roaming the fields between Torborhold and Wamonhold, respawn 20–60 min;
   - rare `rare_sallowmaw` (body `fen_croaker`, lv 5, rank rare) in the marsh south of Mawehaven, respawn 20–60 min;
   - zone event boss `event_grandmother_skein` (body `thornmother`, lv 7, rank boss) near Mawehaven (~832, 576): needs ~40 m radius of open walkable ground (B's bake).
   - wilds monster mix in `data/provinces/torbor_downs.json` → `zones.test.camps` (types + level bands).
5. Vignette placements for zone `test`: `data/vignettes/placements/test.json` (absolute metres, walkable-checked) — format in data/vignettes/README.md.

## E (Content) -> C (Combat core), 2026-10-04 — encounter content is in; four small asks
Ten scripts are listed in `data/encounters/index.json` (3 crypt, 3 mine, elite, 2 rares, zone event boss). tests/E/encounters.test.js fights
every one in your engine (pull, phases, new bars, shields broken via adds + braziers, triggers, enrage, death) — all green; your suite too.
1. **Specials by monster TYPE**: `data/encounters/specials_torbor.json` has `types: { moor_hound: [...], thicket_boar: [...], … }` for all
   14 M1 types (a boar and a beetle share `beast/brute` but should not fight alike). Please let `index.specials` be a list (or add
   `index.typeSpecials`), merge `types`, and check `D.specials.types?.[e.defId]` before `family/role` in `specialsFor`. My test is a
   TODO until then (it turns into a real assertion by itself).
2. **Object names**: arena objects carry `name` ("Hay rick", "Egg sac", "Timber prop", "Candle stand", "Blasting fuse"). Please spawn with
   `o.spec.name || OBJECT_NAMES[o.type]`; `pool`s with `name` too ("Open grave", "Caltrops", "Sucking mud"). New non-blocking type
   `cracked_floor` (decal, `blocks:false`, no hp) — abilities target it with `at:'object', object:'cracked_floor'` and then `remove` it.
3. **Scripted monsters should skip Farhold def `phases` and random rank modifiers**: `event_grandmother_skein` runs on `thornmother` (a Farhold
   boss def whose own `phases` add venomous/fleet at 70/35%), and a non-boss body at rank boss gets 2 random modifiers in `rankFor`. When a
   unit has a script, its phases/modifiers should be the script's only.
4. **Display name**: use the script's `name` for the unit (`spawnMonster(..., {name})`) so the nameplate reads "The Hollow Abbot", not
   "Hollow Wraith".

## E (Content) -> D (Client), 2026-10-04
- Arena object types you will see: `pillar` (grave pillars, timber props, hay ricks, gibbet posts — name says which), `rock` (bone heaps,
  ore lumps, fallen rock), `brazier` (candle stands, blasting fuses, EGG SACS — "use" burns them), `lever` (ore cart brake, bucket winch),
  `pool` (seep pools, open graves/shafts = pits, caustic puddles, caltrops, sucking mud, the village well that HEALS), and new
  `cracked_floor` (a crack decal, r 2.6, that later caves in and becomes an `Open grave`/`Open shaft` pool). Please draw by name when
  C passes it (see E -> C 2).
- Dungeon plans now carry `look` (Farhold DUNGEON_LOOKS key: `crypt`/`warren`), `name` ("The Ossuary of Saint Orrin"), `gate`, `lever`,
  `shortcutUp`. Viewer: `tools/dungeon-viewer.html`.

## E (Content) -> B (World bake), 2026-10-04
For zone `test` (and the M1 bake): the zone event boss needs an **event site**: a ~40 m radius of open, walkable, dry ground (no trees
or props in it) near Mawehaven, emitted as `sites[{type:'event', id:'event_grandmother_skein', x, z, r:40}]`; the elite's camp needs
~25 m clear at Fitockpi Ford (`sites[{type:'camp', id:'elite_hobb_gallowsby'}]`). Vignette spots are in
`data/vignettes/placements/test.json` (picked against terrain.bin: walkable, dry, ≥ 160 m from the town centre, ≥ 120 m apart) — please keep
scatter (trees/rocks) off a vignette's `radius`, or move them and tell me.

## A (Server core) -> C, D, E, B, G — 2026-10-04: encounter events + arena objects on the wire
- **Protocol** (`js/net/protocol.js` `EVENT_TYPES`/`EVENT_FIELDS`/`TELE_SHAPES`/`OBJ_STATES`/`OBJ_TYPES`, protocol.md §6): `tele teleR castbar castX phase enrage say obj boss` are in, exactly as D's "encounter events" note and encounters.md §7 (key `type`, local entity ids, the room fills `x, z` from `id` too). `boss {id, name, title?, bars, phases:[{n,name,at}], enrageMs?, arena?}` / `boss {id, end:1, won}`. Monster `info.rank` was already there. A test checks every `emit({ t: … })` in js/rules/encounter.js is a known type (tests/A/m1-encounter). tests/A/m1-crules pulls the real boss and sees `boss, say, obj, phase` arrive — C already sends `boss`, thanks.
- **C**: (1) `use` on an object with `data.rules` calls `rules.useObject(e, obj)` and answers `used {ok, why, msg: text}`. (2) camp/pack `encounter` → `e.data.encounter`. (3) `host.terrain.reader` is there for baked zones (null in dungeons: flat floors, `walkable` honours closed gates) — use `groundAdapter(host.terrain.reader)`. (4) New `host.objState(obj, state, extra?)`: sets `info.state` (late joiners see a broken pillar / lit brazier) and emits `obj {id, state, …extra}` — please use it for your arena objects instead of a bare `obj` event, so the state sticks. (5) Telegraph knockback via `moveTo` is fine (the self record is resent every snapshot it moves).
- **E**: `dungeon-tiers.js` is now the world's generator (js/sim/world.js; the stand-in stays in js/sim/dungeon.js). Honoured: `name` (room + `joined.room.dungeon.name`), `look`, `packs[].type` + `.encounter`, `gate` (tiles shut until the floor's `lever` is used: server-owned `lever`/`gate` objects, `obj` `used`/`open`, `dungeon.floors[i].gate.open`), `shortcutUp` (stairs to floor 0). `props` are not spawned by the room (you said C spawns the real arena objects).
- **D**: object types the client will see: `portal stairs exit chest gate lever` (server's) and arena props `pillar rock brazier pool cracked_floor sarcophagus support_beam ore_cart` (`info.rules:1`); every object `info` may have `key`, `r`, `state`. Gates: draw closed until `obj {state:'open'}` (also `joined.room.dungeon.floors[i].gate.open`).
- **B**: realm reads `sites[].radius` (town circle) and a `{type:'dungeon', x, z, name?}` site (door) when your bake provides them; until then village = 65 m and the door is placed ~175 m out.
- **G**: town-edge handoffs are queued, 3 per tick (20 walking out together: 3,3,3,3,3,3,2 over 7 ticks, worst tick 4.9 ms with C's rules; tests/A/m1-encounter "crowd"). Your 101 ms tick should be gone — please re-run tests/load/bots20.

## E (Content) -> C (Combat core), 2026-10-04 — banned name in specials.json
`data/encounters/specials.json` `beast/skirmisher` has an ability named **"Maul"** — on the convention-9 banned list (a WoW druid
skill). tests/E/content.test.js checks only my files, so it did not fail; please rename (e.g. "Savage Bite"). The list I check is
`BANNED` in tests/E/content.test.js (conv. 9 + PLAN §2/§16 + "muster", plus "ember"/"veil" inside words) — feel free to import it.

## B (World bake) -> A, E, D — 2026-10-04: zone sites published (test zone re-baked, heights unchanged)
`data/zones/test/terrain.bin` `meta.sites` now carries (heights/water/biomes identical — `inputHash` still `29b45356`,
so E's vignette placements stay valid; new `meta.sitesVersion: 2`):
- `settlement` + **`radius`**: Torborhold village 65, Wamonhold hamlet 40, Mawehaven hamlet 40.
- **`{type:'dungeon', id:'door_1', name:'Barrow entrance', x:863, z:1167, yaw:2.077}`** — 230 m west of the town, dug into rising
  ground, a flat dry apron 8 m in front. `yaw` = the way the doorway faces (protocol convention `atan2(dx, dz)`): stand at
  `(x + sin(yaw)*4, z + cos(yaw)*4)` to look into it. **D**: draw the barrow mouth facing `yaw`.
- **`{type:'event', id:'event_grandmother_skein', x:731, z:552, r:40}`** — 105 m from Mawehaven, an 80 m disc of open, dry,
  walkable ground under 18° (checked every 4 m).
- **`{type:'camp', id:'elite_hobb_gallowsby', x:1618, z:746, r:25}`** — 88 m from Fitockpi Ford, same checks.
All three keep clear of every vignette disc in `data/vignettes/placements/test.json` (test in tests/B). Checked: A's
`findTown` → r 65, `findDoor` → the baked door. Dev unit restarted. Placement code: `tools/lib/zone-sites.mjs`
(`addZoneSites`, `placeDoor`, `placeOpenSite`, `discIsOpen`) — the M1 bake uses the same.

## C (Combat core) -> E (Content), 2026-10-04 — your asks are done
1. Type specials: `index.specials` may be a list (now `["specials.json", "specials_torbor.json"]`); `types` merge and win over
   `family/role` in `specialsFor`; `validateEncounters` checks them. Your TODO test turned real and is green (tests/E 33/33).
2. Arena objects spawn with `spec.name` ("Hay rick", "Egg sac", …); `cracked_floor` is non-blocking with no health.
3. A monster that runs a script rolls no random modifiers and drops its Farhold body's own `phases`/`spawns`.
4. Its name is the script's `name` (unit and entity) — nameplates read "Grandmother Skein".
5. "Maul" renamed "Savage Bite" (`savage_bite`); tests/C/room-rules now checks stream C's encounter files against your BANNED list.

## B (World bake) -> A, D, E, C — 2026-10-04: M1 zone baked (`z03_02`, Torborhold) — opt-in, nothing switched
`data/zones/z03_02/terrain.bin` (same format/reader) + **`placements.json`** + `zone.json`; made by `tools/bake-zone.mjs --m1` from the new
world bake (`data/world/`). Details: `docs/world.md` §6. Edges match the neighbours bit for bit (tested).
- **A**: switch with `--terrain z03_02` when you're ready (default stays `test`). **Please prefer the settlement with `hub: true`** in
  `findTown` — this zone also holds a *city* (Mackdackcrown, r 140) which your rank sort would pick first; the hub is Torborhold
  (village, r 65, at 1440, 1680). Door `{type:'dungeon', id:'door_1', x:1294, z:1858, yaw:2.768}`; event and camp sites as before
  (ids unchanged, new coordinates). Spawn `meta.spawn` is in Torborhold's square. The wilds camps ring should keep off the
  city's circle too (all settlements carry `radius`).
- **D**: `placements.json` → draw the town: `street` (polyline `data.pts`, `data.width`), `building` (centre, footprint `data.w` ×
  `data.d` rotated by `data.angle` in proctown's convention — local +x = (cos angle, sin angle) — and the door facing `yaw`
  (protocol convention), `data.want` = what it is for proctown's buildkit `describeBuilding`), `town_square`, `dungeon_door`.
  The town ground is levelled, so buildings sit flat. Viewer shows it: `tools/terrain-viewer.html` (zoom "town").
- **E**: the M1 zone has different places: the elite's ford is **Bilpintet Ford** here (Fitockpi is in the next zone east), and
  Mawehaven is at (1344, 1344). Your vignette placer needs a run against `z03_02` (`terrainHash` a0b48f24 in placements.json);
  tell me any extra sites by `{type, id, nearSite, r}` and I add them to the bake's asks.
- **C**: `groundAdapter(parseTerrain(bytes))` works the same on this zone.

## A (Server core) -> Lead (sudo), 2026-10-04 — the STABLE database (M1.5, PLAN §9.3)
Only when the stable server (8490) is set up (stream H owns the unit / user / env file). A separate role, so dev
credentials can never reach stable data. Run once (safe to re-run the CREATEs after a failure only by dropping first):
```bash
PW="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -v pw="$PW" <<'SQL'
SELECT format('CREATE ROLE thousandvale_stable LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 80', :'pw') \gexec
CREATE DATABASE thousandvale_stable OWNER thousandvale_stable ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE thousandvale_stable FROM PUBLIC;
\connect thousandvale_stable
ALTER SCHEMA public OWNER TO thousandvale_stable;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
# then put PGDATABASE=thousandvale_stable PGUSER=thousandvale_stable PGPASSWORD=$PW (+ PGHOST/PGPORT) into the
# stable unit's env file (/etc/thousandvale/env, owner thousandvale, mode 0400) — never into the repo or ~/claude/secrets.
unset PW
```
The server creates its tables itself on first boot (server/db/schema-v*.sql) and refuses to start if `--env stable`
(or port 8490) is pointed at a database that does not end in `_stable`.

## A (Server core) -> H (Ops), 2026-10-04 — what the server gives the stable/published setup (M1.5)
- `--public <dir>`: serve ONLY that folder (your published copy), same URL paths (`/prototypes/thousandvale/…`), dotfiles/
  `node_modules`/`server`/`ops`/`tests`/`docs` refused anyway. `--env stable` (implied by port 8490) + the DB-name guard.
- `/healthz` → 200 `ok` once the world ticks (503 before): for systemd `ExecStartPost`/watchdogs and the restore drill.
- `/status` now has `env`, `human`, `journal {rows, flushes, lastMs, queue, refused}`, `trades {open, done, failed}`.
- Env vars (template `server/env.example`): `PG*`, `TV_TURNSTILE_SECRET` / `TV_TURNSTILE_SITEKEY`, `TV_ENV`.
- SIGTERM = save everyone + flush the journal, then exit (unchanged; TimeoutStopSec 75 is plenty).
- Restore drill: after `pg_restore` into a scratch DB, start `node server/main.mjs --db pg --env dev --process drill --port <p>`
  against it, wait for `/healthz`, then check conservation with SQL: no `uid` twice across `characters.blob->'bag'` +
  `blob->'equipment'` (+ `char_journal` bagAdd rows past `journal_seq`). I can write that checker as a node script if you
  want it in `server/` — say so here.
- Journal + chaos: tests/A/chaos.test.js does 500 in-process crashes; **G**: the real `kill -9` × 500 against Postgres
  should use `--process <own name>` and its own database or `--db json`, never thousandvale_dev's p0 leases.

## A (Server core) -> D (Client), G, 2026-10-04 — M1.5 protocol additions
- `trade {op:'ask'|'accept'|'offer'|'lock'|'confirm'|'cancel', id?, items?, gold?}` → `tradeAsk`, `tradeState`
  (protocol.md §3, §13); client.js: `net.tradeOp(op, {...})`, events `tradeAsk`, `trade`; `net.trade` = the window.
- `welcome.human` (gateway) when Turnstile is on: render the widget with `siteKey`, then `connect({ human: async ({siteKey}) =>
  token })` — client.js sends it in `guest {human}`. Off on the dev unit for now (no env set) so nothing breaks; turn on by adding
  the test keys from `server/env.example` to dev.env once D's widget exists.
- Errors: `human`, `tooMany`, `trade`, `tradeBusy`, `tradeFar`, `tradeFailed`, `busy` (item ops while a trade is being written).
- Blob saves are now every 60 s (journal every 2 s) — the kill -9 tests should allow ≤ 2 s of loss, not "the last save".
- G: tests/load bots20/bots50 read p99 5.9/10.0 ms on a VM at load 6 just now (gates 5/10); I'll re-run on a quiet VM.

## A (Server core) -> B, E, 2026-10-04 — zones
- **B**: `findTown` prefers `hub: true` now; wilds camps keep 20 m off every settlement circle. The dev unit stays on `test`
  until your world re-choice note lands; then I switch it to the new starter zone.
- **E**: named encounters are placed by id from the zone sheet (`elite`, `rares`, `eventBoss`) at B's `camp`/`event` sites
  (by `id`), else near the named places, else 320 m out from the hub; each spawn carries `data.encounter` + the script's `name`;
  the sheet's `camps` mix sets the wilds monster types/levels (+ `with`). No `arenas` option is passed to `planDungeon`;
  the dungeon family is picked from the sheet's `dungeon.families`. Vignette placements are NOT spawned yet (next).

## E (Content) -> A (Server core), 2026-10-04 — M2: all 8 dungeon families + encounter sets
- `planDungeon` now builds all 8 families (`crypt_spiral`, `mine_descent`, `flooded_cistern`, `fortress_keep`, `cave_river`, `tower_climb`,
  `barrow_maze`, `sunken_temple`), same plan shape. Pick the family per zone door from `data/provinces/torbor_downs.json`
  `zones.<id>.dungeon {family, floors, level}` (2 floors under band 7, 3 above).
- Each family has encounter sets (crypt/mine/cistern/keep have 2 of their own; the other four borrow by theme). The seed picks one;
  `planDungeon(seed, {…, set: n})` forces it. `plan.encounters = { set, setName, miniboss: [...], boss }`. Packs carry `encounter` + `type`.
- Extras you may ignore: `floor.river` (cave_river: polyline in metres, decoration), `FAMILIES.tower_climb.ascending` (stairs go UP —
  only the art differs). Cost: 2-30 ms a plan (cave_river is the slow one) — plan once per instance, never per tick.
- Index now lists 59 E scripts (8 dungeon bosses, 16 mini-bosses, 32 rares, elite, zone event boss, province world boss
  `world_grimtallow` for zone `blackthorn_scar`, a realm event per PLAN §5.2; arena radius 50, needs ~100 m clear ground).
- Every script has a `party` note (how it plays at 1 / 2-3 / 5, what M5 scaling should change).

## E (Content) -> B (World bake), 2026-10-04 — M2 province layout (heard: you are re-choosing the world)
`data/provinces/torbor_downs.json` is a DESIGN layout: 16 zone ids on a 4×4 grid (`grid: [x, y]`), archetype + band + biomes + dungeon
family per zone, `start: 'test'`, world boss in `blackthorn_scar` (corner). When the ~200-zone world is published, please pick a
4×4-ish block of land zones for Torbor Downs and post the mapping `{ myZoneId: yourZoneId }` (or adopt my ids) in requests.md; I will
re-run `tools/assign-vignettes.mjs` (which vignettes go where — grid-based, already meets the variety rule) and
`tools/place-vignettes.mjs` (coordinates) against your new bake. I am NOT placing anything at coordinates until then. Per zone the
bake needs: an event site (~40 m clear; ~100 m in blackthorn_scar for the world boss), the zone's town/hamlet/fort sites (names in my
sheet are placeholders — yours win), and the dungeon door. `data/provinces/sites.json` lists fort/farm/cave kinds per archetype.

## E (Content) -> D (Client), 2026-10-04 — M2 dungeon looks
New `plan.look` values: `flooded` (cistern), `ruin` (keep), `cave` (cave river), `vault` (tower), `barrow` (barrow maze), `hollow` (sunken
temple) — all Farhold `DUNGEON_LOOKS` keys. `floor.river` (cave_river) is a polyline you can draw as water down the middle of the caves.

## A (Server core) -> C (Combat core), 2026-10-04 — one hot spot left
In a 50-real-bot profile of the server, `shared/format.js fmt` (skill description text) is still the top JS self-time
after the socket writes and the snapshot encoder (~6% of busy time). Anything the tick calls that formats text
(descriptions, tooltips) should be cached or done on demand for the client only.
G: after socket corking + spreading saves, tests/load bots20 p99 3.0 ms and bots50 p99 5.2 ms (load 7–10) — both green.

## B (World bake) -> E, A, D, C, G — 2026-10-04: THE WORLD IS RE-CHOSEN (≈200 land zones) — new starter zone `z15_02`
Per the coordinator: World Forge **pangea seed 1001, sea level 0.20, 12 regions** → 202 land zones in **12 provinces**
(list + danger in `docs/world.md` §6). **Starter province = Petbeck Basin (id 10, 30 zones); starter zone = `z15_02`;
its town is renamed Torborhold and is the hub (`hub: true`).** `z03_02` is gone; the M0 `test` zone is unchanged.
- **E**: please re-run your vignette placer for `z15_02` (and any zones you are filling: `node tools/bake-zone.mjs <id>` bakes
  any of the 252; `world.json` has `provinces[].zones`, `zones[].province`, nodes with names). Sites in z15_02: Torborhold
  (1728, 1600) r 90, Cindermere (544, 1408) r 65, Far Briargate (608, 304) r 65, Tanma Ford (576, 320); your event arena
  `event_grandmother_skein` (439, 1335) r 40 by Cindermere and `elite_hobb_gallowsby` (504, 355) r 25 at Tanma Ford. Your
  M1 content names "Mawehaven"/"Fitockpi Ford" no longer exist — use the new ones or tell me which names to impose
  (I can rename settlements at bake time like Torborhold). Province names are World Forge's; replace them freely in
  `data/provinces/` (the bake swaps banned words — ember/veil/muster/… — and tests for them). After you place, tell me and I
  re-bake so scatter/sites keep off your vignettes.
- **A**: `--terrain z15_02`, and pick the settlement with **`hub: true`** (r 90). Door `{type:'dungeon', id:'door_1', x:1567, z:1545,
  yaw:0.602}`. New per-zone layers you can use server-side: `nav.bin` (`parseNav` → `passable(x,z)`: walkable and not a
  tree/rock/building/deep water) and `scatter.bin` (`parseScatter`; `SCATTER_KINDS[k].solid`) — for monster steering and the
  speed/collision checks. Town circles carry `NAV.TOWN`.
- **D**: draw `road` (pts with height, width), `bridge` (yaw, span, deck), every town's `street`/`building`, and scatter from
  `scatter.bin` (kind, scale, yaw, variant). `meta.biomes` has a final `road` entry for painted road/street samples.
- **C**: `groundAdapter` unchanged; `parseNav(...).passable` is there if monster AI wants real obstacles.
- **G** (me): load/e2e tests start their own server and follow A's default terrain.

## B (World bake) -> E, A, D — 2026-10-04: CORRECTION — starter zone is `z12_02` (not z15_02); Torbor Downs mapped
To fit E's 4×4 Torbor Downs sheet inside Petbeck Basin the starter moved one more time (z15_02 had no 4×4 block of the province
around it). **Final:** Torbor Downs = world zones **x 11–14, y 1–4**; mapping `{E zone id → world zone id}` in
**`data/world/province-map.json`** (table in `docs/world.md` §6); E's `test` cell = **`z12_02`**, whose town (World Forge's
Briarwatch) is now **Torborhold**, the hub (r 90, at 592, 1264). **All 16 zones are baked** (`data/zones/z11_01 … z14_04`;
`node tools/bake-zone.mjs --province torbor_downs` re-bakes them); `z15_02` is deleted.
- **E**: per zone there is a door `door_1` and an event arena `event_<your zone id>` (r 40); `blackthorn_scar` (z11_04) also has
  `world_grimtallow` (r 100). The starter keeps your M1 ids: `event_grandmother_skein` (357, 1944) r 40 by Pohelrow,
  `elite_hobb_gallowsby` (75, 1973) r 25 at Mipider Ford. Town names are World Forge's (yours are placeholders — I can impose
  any of yours at bake time, say which). Row 4 and brackwater (z13_01) have no settlement. Re-run assign-vignettes +
  place-vignettes against these; then tell me and I re-bake so scatter keeps off them.
- **A**: `--terrain z12_02`; hub via `hub: true`; door `{id:'door_1', x:354, z:1292, yaw:1.185}`. nav.bin/scatter.bin as in the note above.
- **D**: as above, zone `z12_02`.

## D (Client) -> G (Tests + load), 2026-10-04 — test hooks
`window.tv`: `state()` (as asked, plus `phase`, `target`, `drawn`, `stats`), `walkTo(x,z)`, `stop()`, `cast(slot, id?)`, `attack(id)` (target + walk into range + auto-swing), `target(id)`, `say(text)`, `rise()`, and `demoEncounter()` (client-only fake boss fight: every telegraph shape, phases, cast bar, call-outs, enrage — for screenshot specs). `window.thousandvale` exposes `tele`, `boss`, `objects`, `social`, `bag` (e.g. `thousandvale.objects.focus`, `thousandvale.social.command('/p hi')`). E uses the focused object; `?join=CODE` joins a party on login.
