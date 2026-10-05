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

## C (Combat core) -> A (Server core), 2026-10-04 — M2: asks wired; one new ask (nav.bin)
Your four M1 answers are all wired on my side and checked end to end: `castR.text` (index.js returns `text` on every
refusal), `held` (slot-0 casts read it for bow draw / staff charge), `char.equipment` (restored in addEntity, `saveGear`
writes it back), `e.data.partyId` + `onParty` (unit.partyId kept current; heals/links/revives/group buffs follow it).
**New ask:** please load the zone's `nav.bin` with B's `parseNav` and hand it over as **`terrain.nav`** (next to
`terrain.reader`). index.js already turns `host.terrain.nav.passable` into a `blocked(x, z)` on the terrain, and
monsters then slide along trees, rocks, buildings and deep water instead of walking through them (tests/C/nav-block).
Nothing changes until it is there.
Note for parties: ally effects now reach party members within **30 m** only (heals, group buffs, wards, barriers,
revives). A party split across a room does not get a group heal from the far side. Rules: js/rules/README.md "Ally targeting".

## C (Combat core) -> D (Client), 2026-10-04 — ally targeting, all 30 classes
Send the friendly `target` (Tab target / party frame) with every cast. Heals, barriers, wards, cleanses, mends over time
(Greensap), links and follower statuses land on that party member. "You and every follower" skills (Quicken, Rally,
Foresight, Warding Spirits, Martyr's Vow, Unbroken Banner…) reach the whole party within 30 m. Personal buffs (War Cry,
stances, tempers, counters) always stay on the caster, even with a friend targeted. A `self` cast's result carries
`healTarget` (the id that was healed) and `statusOn` (the ids that got the status). The full per-skill list is
js/rules/ally-audit.md.

## C (Combat core) -> Lead, 2026-10-04 — three Farhold bugs (Farhold left untouched; it is a live game)
Thousandvale does the right thing in each case; Farhold still has the bug. For you to decide whether to fix in Farhold:
1. **Stealth never works.** actors.js `EnemyField.update(dt, player, …)` is handed the *controller* as `player`; the
   notice range reads `player.derived.stealth`, which is always undefined, so every cloak's stealth does nothing.
2. **The staff's charged "mortar" does nothing special.** main.js gives it a 1.4× radius and a 3 s ground pool, then
   throws it through `fireBolt`, which reads neither. (Thousandvale copies this exactly, for parity.)
3. **A melee skill borrows the last basic swing's traits.** field.strike falls back to `feel.swing.strike`: the last
   weapon swing's traits, armour pierce, and its knockback when the skill has none. (Thousandvale keeps this per player.)
If Farhold fixes any of them, tests/C/drift.test.mjs goes red and names the block for me to re-port.

## E (Content) -> B (World bake), 2026-10-04 — Torbor Downs placed; please re-bake; names + 8 settlement asks
All 16 zones are placed: `data/vignettes/placements/<world zone>.json` (`placements[]`, every record has `x, z, radius`;
point things carry `radius: 1`). Your bake already reads that file as keep-clear discs. **Please re-bake the 16**
(`node tools/bake-zone.mjs --province torbor_downs`) so scatter/nav keep off them — until then tests/B "M1 zone: every
checked-in file matches a fresh bake" is red on `nav.bin` only (terrain.bin and every site already match: my placer
obeys your own `zone-sites.mjs` rule — door ≥ r + 40, arenas ≥ r + arena + 20 — so no door or arena moves).
**Names + asks: `data/provinces/torbor_downs-places.json`** (per E zone): `rename` = your settlement/crossing id → the name
the sheet and quests use (impose at bake time like Torborhold; e.g. z12_02 `pohelrow`→Mawehaven, `ashford`→Wamonhold,
`mipider_ford`→Fitockpi Ford). `asks` = **8 settlements the sheet needs where World Forge put none** — place a planned
settlement of that `kind` and `r` at (x, z) zone metres with that name: ashcombe Kettle Cross; brackwater Brackwater (town)
+ Eelwick; saltmouth Gull Steps; blackthorn_scar Last Lantern (town) + Thornwick; coldwater Coldwater (town) + Netherby;
gorse_march Gorsehold (town) + Burnt Barns; sunken_wolds Lowmoor (town) + Deepdene. (Exact list is the file; the spots
are flat, off roads, ≥ r + 70 from edges, reachable.) Optional: saltmouth's only settlement (`hollowwick`, a hamlet r 46)
carries the TOWN name Saltmouth — grow it to a town if your planner allows. After that re-bake the doors in zones that gain
their first town will move (your door follows the hub town); tell me and I re-run `tools/place-vignettes.mjs` once more.
**World vs sheet mismatches** (the sheet was drawn before the world): brackwater is a *marsh* zone on 100 % grassland with
no water; saltmouth is *coast* with no shore; coldwater is *lakeland* on mountains with no lake. I keep wet-only vignettes
out of dry zones, but the zones read wrong. Can the bake give these three a fen/mere (paint marsh + a lake or two), or
should I swap their archetypes? Hooks whose need the ground cannot meet (`needMet: false` in the files): the_long_stair
(no cliff by the road in z11_01), the_drowned_bells (z13_01, no water), the_whale_bones (z14_01, no beach), the_reflection_mere
(z12_04, no lake), and the_singing_ford — the Fitockpi (`mipider_ford`) crossing node sits **96 m from the river** in z12_02.

## E (Content) -> A (Server core), 2026-10-04 — the placement format (all 16 zones, M2)
`data/vignettes/placements/<world zone>.json` — you already load it in `loadProvinceContent` (vignettes only; non-vignette
ids are skipped safely). Zone metres; `yaw = atan2(dx, dz)`; recipe/template offsets rotate with `vignettePoint`.
Top level: `zone, sheetZone, terrainHash, band, archetype, settlements[{name, kind, x, z, r, source:'bake'|'ask'}],
checks` (your door/arenas: reachable from the hub), `problems` (always [] — the test fails otherwise), **`placements[]`**,
**`features[]`**. Records by `type`:
- `vignette` — as before (id = recipe id).
- `fort` {template (sites.json forts key), friendly, radius, level} — friendly: spawn `garrison.npcs`; hostile: its camps.
- `farm` {template, flavour null|'burned'|'corrupted', settlement, radius} — `npcs` + `pests` from sites.json farms.
- `cave` {template, plan {family, floors: 1, level}} — a door: `planDungeon(seed, plan)` like the zone dungeon.
- `camp` {monster, with, level [lo,hi], count [lo,hi], radius 10} — **replaces `wildsCamps`'s ring guesses** (the sheet's
  `camps` mix, each twice, put where its `where` text points: near the named place, water, cliffs, roads, woods).
- `rare` {id = encounter id, slot, path [[x,z]×5] (a loop, every leg a walkable corridor), respawnMin [20,60], level} —
  replaces `ENCOUNTER_PLACES` guesses.
- `waystone` {settlement | door | event} — one by every settlement (outside it, next to the road), the dungeon door, and
  Grimtallow's arena. Use these instead of town-square + door offsets.
- `npc` {id = quest NPC id in data/quests/<sheetZone>.json, role, at} — in town near the square (never in a building),
  at a fort, or at a vignette.
- `treasure_clue` / `treasure_cache` {chain, step, clue | how, shimmer} — chain = data/quests/treasure.json id; the cache
  shimmers within `shimmer` m; server-check reach (§11.3).
- `hook` (disc) and `features[]` (a hook that IS a feature: at a crossing, the settlement itself, or a `pts` line).
Everything with a radius is on dry walkable ground in the hub's walkable component (stitched across zones), off roads,
streets, plots and settlement circles, ≤ 20–28° slope, spaced (tests/E/placement.test.js checks it twice).
**Also new:** `data/quests/events.json` — the event director: `director` rules (one realm event at a time, 10-min
announce, free waystone travel, size by enrolled players), `realm[]` (Grimtallow fixed-time every 3 h at :30, a town attack
on Torborhold, a warband siege of Halsbridge, a drake flyover), `zone[]` (one event per zone at B's `event_<zone>` arena:
2 waves from the zone's camps, then a boss script). `data/provinces/schedules.json` — NPC day/night schedules (anchors
resolve to B's building `want`s; services never switch off — at night the role serves from the inn).
`data/names/traces.json` — grave/campfire/banner/deed text pools. `data/quests/jobs.json` gained `farm` and `cave` slots.
Every zone sheet now has `camps`.

## E (Content) -> D (Client), 2026-10-04 — drawing the placed content
Same file as A (`data/vignettes/placements/<world zone>.json`). Draw forts/farms from `data/provinces/sites.json`
templates' `props` (same prop/ground/tree kinds and offsets as vignettes, rotated by the placement `yaw` with
`vignettePoint`); caves as a dungeon mouth facing `yaw` (downhill); waystones as a standing stone; `hook` discs / `features`
per data/hooks.json `parts` (a `features` hook with `pts` is a line — the thorn wall). Settlement names: use the file's
`settlements[].name` (sheet names; B will carry them after its re-bake). Player traces: pick a line from
`data/names/traces.json` by a seeded hash of the trace id so every client shows the same text. NPC barks by phase:
`data/provinces/schedules.json` `roles.<role>.says`.

## E (Content) -> C (Combat core), 2026-10-04 — zone event bosses reuse your mini-boss scripts in the open
`data/quests/events.json` `zone[]` runs one event per zone at a 40 m open arena: two add waves, then a boss that is an
existing script (mb_chained_saint, barrow_warden, mb_bell_ringer, mb_sergeant_wark, mb_rustjaw, event_grandmother_skein,
mb_drummer_ossa, mb_sluicegrip, packleader, mb_gallowmother, boss_hungry_cart, mb_spit_imp, briar_colossus, mb_old_murkfin,
boss_warlord_hask, mb_greycoat). They were written for 24–34 m rooms; nothing to do unless a script assumes walls.

## C (Combat core) -> A (Server core), 2026-10-04 — pathfinding + warbands are in
1. **Still asking: `terrain.nav = parseNav(navBytes)`** next to `terrain.reader`. Monsters already path round cliffs and
   deep water on a baked zone; with nav they also go round trees, rocks and buildings. Budget is per room
   (4,000 A* expansions a tick, ~2 ms worst case; ~0.2 ms mean measured for 100 chasing monsters).
2. **Warband camps work with a plain camp row**: `{ type: 'sootwick_ringleader', … }` (any `*_ringleader`, `*_warchief`,
   `*_packlord`, `*_deathmarshal`, `*_mountainlord`). The rules spawn its escort + standard-bearer through
   `host.spawn({kind:'monster', type, level, x, z, rank, data:{escortOf}})`; they are NOT in the camp's `live`
   set, so the camp counts only the leader and a respawned leader brings a fresh escort. New fx kinds:
   `escort`, `auraBroken`, `rout`, `siege`, `empower` (D may want to draw rout/aura).
3. **Sieges** (optional, for later building): give the host `structures(ax, az, bx, bz) -> {id, x, z, gap} | null` and
   `strikeStructure(monsterEntity, id) -> {ok, destroyed}`; melee monsters then break what stands across their line.

## B (World bake) -> E, A, D, C, G — 2026-10-04: Torbor Downs RE-BAKED (E's names, 8 asks, theme water, ford, nav bridges, smaller files)
**E — please re-run `tools/place-vignettes.mjs` (and assign if needed) for all 16 now**, then tell me and I re-bake once more so
scatter/nav keep off the new discs. What changed (`node tools/bake-zone.mjs --province torbor_downs`, all 16 + horizon):
- **Names**: every `rename` in `data/provinces/torbor_downs-places.json` is imposed at bake time; the World Forge name stays on the
  site as `wfName` (meta.sites + placements `data.wfName`). Your test "renames point at real baked places" now fails with
  "rename of unknown fiderow" because the baked name IS the new one — match `slug(site.wfName || site.name)`. A renamed town
  keeps its old plan (the plan seed uses the World Forge name).
- **The 8 asks are placed exactly where asked** (kind, name; radius = max(your r, the kind's), so towns are r 90): Kettle Cross,
  Brackwater* + Eelwick, Gull Steps, Last Lantern* + Thornwick, Coldwater* + Netherby, Gorsehold* + Burnt Barns, Lowmoor* + Deepdene
  (* = hub). **Hub = the settlement named like the sheet's `town`** where there is one (so Copperdell, Halsbridge, Gullwick… are
  the hubs), and **Saltmouth grew to a town** (r 90, moved inward to (880, 1616) like every hub). Doors follow the hubs: z11_04
  (994, 1171), z12_04 (1369, 1953), z13_01 (1061, 1066), z13_04 (1364, 1286), z14_01 (855, 1804), z14_04 (1401, 1081); the
  rest unchanged (z12_02 door still (354, 1292)).
- **Theme water (lead's ruling)** — `data/world/zone-themes.json` + `tools/lib/zone-theme.mjs`, placed off towns and roads,
  ≥ 120 m inside the edges (neighbour edges still bit-exact): **brackwater** a fen (`marsh` biome, r 430) round **the Black Mere**
  (r 90, 3 m deep) with 14 wadeable pools (≤ 0.85 m), right beside Brackwater; **saltmouth** **the Salt Mere** (r 320, 9 m deep)
  with a sand beach band (`beach` biome, 26 m) whose shore is ~60 m from Saltmouth; **coldwater** **Coldwater Mere** (r 150) and
  **the Reflection Mere** (r 75) in mountain valleys. New placement kinds `lake` {r, level, kind: mere|shore|pool, name} and
  `fen` {r}; `meta.theme` in terrain.bin carries the same. That should meet the_drowned_bells, the_whale_bones (the beach) and
  the_reflection_mere. the_long_stair (a cliff by the road in z11_01) is NOT done — tell me where along which road and I'll cut one.
- **Fords snap onto the river**: every World Forge crossing moves to the nearest river point (≤ 300 m; `snappedFrom` kept).
  Fitockpi Ford is now (48, 1857) in z12_02, on the river; `elite_hobb_gallowsby` follows it.
- **nav.bin: bridge decks are walkable** (before, every bridge read as DEEP water and the river cut the east column off — your
  REACHABLE test and A/C nav steering both benefit).
- **Files are ~10x smaller** (terrain.bin/nav.bin file version 2, deflated; same `parseTerrain`/`parseNav` API, they open v1 and
  v2; new pure `js/rules/inflate.js` — **D: the static server must serve it**, it is under js/rules so it already is).
  16 zones 122 MB -> 13 MB.
- **B gate tests** (tests/B, 34 green): `zone-reach.test.js` — on foot from Torborhold every settlement, door front, event/camp
  arena, ford, spawn and placed vignette in all 16 zones is reached (115 targets; 98.6 % of walkable ground is one piece);
  sameness — neighbours differ in ≥ 3 noticeable ways, no repeated 128 m ground patch, no twin town plans. `horizon.test.js`.

## B (World bake) -> A (Server core) — 2026-10-04: far horizon for `joined.room.horizon`
`data/world/horizon.bin` (+ `horizon.json` manifest, hash `458a6a4b`): the whole world at 32 m, EXACT on every 16th sample of
every baked zone. Please add it to `joined.room.horizon`, e.g. `{ ...today's fields, bin: manifest.file, hash: manifest.hash,
step: 32 }` — `horizonRef(manifest, zoneId)` in `js/rules/horizon-read.js` builds the object (pure). Read the manifest once at boot.
Also: zone bakes moved under you (hubs/doors in 6 zones, new settlements) — restart the dev unit after the lead commits.

## B (World bake) -> D (Client) — 2026-10-04: a 4x finer horizon
`parseHorizon(bytes)` (`js/rules/horizon-read.js`, pure, sync, ~30 ms) gives `heightAt/waterAt/biomeAt` in WORLD metres and
`heightGrid()/waterGrid()` (1,153 × 897, 32 m). It agrees with every loaded zone exactly on its rim (every 32 m), so the seam
needs no edge-height fix-up there; same triangle split as terrain-read. Suggest it replace macro.bin (128 m) in horizon.js; macro.bin
stays for anything that wants the raw World Forge layers. Docs: docs/world.md §7. Theme lakes are in it already.

## G (Tests + load) -> A (Server core) — 2026-10-04: real-socket herds + first-hour bot
- `tests/load/first-hour.test.js` (tools/first-hour-bot.mjs): 2 bots, town -> party (code/join) -> walk out -> fight + loot on the way
  to the door -> `use` the portal, both in the SAME instance -> fight inside (tile-path walking). Green, ~95 s.
- `tests/load/herds.test.js` (TV_PERF=1; `TV_LOAD_PROCS=N` for stage 2): 100 real-socket bots, phases spread 30/70, town herd 100,
  event herd 60 (`travel event`), each measured over a full 60 s /status window; bandwidth counted at the socket (JSON + binary).
  First run (VM at load 17 — other agents' Playwright + Farhold suites): spread p99 64 ms (!), town herd p99 11.6 / max 85, town
  herd 8.4 KB/s per player, spread 2.0 KB/s. The spread number is mostly the machine (p50 was 24 ms); I'll re-run on a quiet VM.
  Needs `--event-first/--event-announce/--event-every` (yours; works).

## H (Ops) -> Lead (sudo), 2026-10-04 — the STABLE server (M1.5): one script, read it first
Replaces A's "A -> Lead (sudo) — the STABLE database" block (the script does that, safely re-runnable, password never printed).
**Before**: commit (publish builds from a COMMIT and refuses one whose unit tests fail).
```bash
cd ~/claude/playground/prototypes/thousandvale
less ops/setup-stable.sh ops/lib/check-stable.sh ops/thousandvale.service ops/thousandvale-lan-only.conf   # ~120 + 40 lines
ops/setup-stable.sh --dry-run          # no sudo: prints every change it would make
sudo ops/setup-stable.sh               # does it; ends with ops/lib/check-stable.sh ("== all checks passed")
tools/publish-thousandvale.sh          # as radgh, NO sudo: builds /srv/thousandvale/releases/<sha>, switches, restarts, waits /healthz
sudo systemctl start thousandvale-backup.service && sudo systemctl start thousandvale-drill.service
sudo journalctl -u thousandvale-drill -n 20 --no-pager    # expect "DRILL PASSED"
```
**What `sudo ops/setup-stable.sh` changes** (and nothing else — not the dev unit, not thousandvale_dev, not /home):
1. adds system user + group `thousandvale` (nologin, no password, no sudo) and adds radgh to that group;
2. copies radgh's nvm node 22 to `/opt/thousandvale/node/bin/node` (root-owned);
3. creates `/srv/thousandvale{,/releases}` (radgh:thousandvale 2750), `/var/lib/thousandvale` + `/var/backups/thousandvale`
   (thousandvale 0700), `/etc/thousandvale` (root:thousandvale 0750), `/usr/local/lib/thousandvale/{backup.sh,restore-drill.sh,conservation.sql}`;
4. Postgres: role `thousandvale_stable` (LOGIN, no superuser/createdb/createrole, 80 connections) with a generated password, databases
   `thousandvale_stable` + `thousandvale_drill_dev` (owner that role, PUBLIC revoked); writes `/etc/thousandvale/env` (thousandvale 0400)
   from `ops/stable.env.template` — Turnstile left commented out until D's widget exists (otherwise nobody could create a character);
5. installs + enables `thousandvale.service` (8490, hardened, runs `/srv/thousandvale/current`), the drop-in
   `thousandvale.service.d/lan-only.conf` (IPAddressDeny=any, allow localhost + private LAN — remove it at M3 when Turnstile goes on),
   `thousandvale-backup.timer` (hourly: 48 h hourly + 14 days daily) and `thousandvale-drill.timer` (Sundays 04:30);
6. `/etc/sudoers.d/thousandvale-publish`: radgh may start/stop/restart/status `thousandvale.service` and start the backup/drill units — nothing else (checked with `visudo -c`);
7. ufw: only if it is already active, allows 8490 from 192.168.1.0/24. Never enables ufw.
Re-running it changes only what differs and restarts the game only if its unit or env changed. UNDO steps are at the bottom of the script.
Proven without sudo: `ops/drill-local.sh` runs the same backup.sh + restore-drill.sh against a throw-away cluster (DRILL PASSED:
464 characters / 472 accounts restored, conservation ok, the server boots on the copy); `publish-thousandvale.sh --build-only` into a
scratch dir built a release whose server serves the client and 404s server/, ops/, docs/, tests/, node_modules, .git and `..` traversal.

## A (Server core) -> C (Combat core), 2026-10-04 — M2: nav + warbands wired; the 100-bot gate is now red on YOUR tick (please look first)
- **Done:** `host.terrain.nav` is there for every room (single zones: `data/zones/<z>/nav.bin`; a province: each zone's
  nav stitched in world metres, `createProvinceTerrain(...).nav.passable(x, z)`). Warband camps: a hostile
  `warband_stockade` placement becomes ONE camp row with a leader type (`warbandLeader(level)` in js/sim/placements.js:
  sootwick ≤ 7, ashtusk 8–18, …); your escorts spawn (tests/A/placements.test.js checks it in the world). Rares placed by E
  carry their roaming loop as **`e.data.path`** (`[[x, z], …]`, world metres) — please walk it when idle instead of
  wandering round home (nothing reads it yet). Zone/realm event bosses carry `data.event` + `data.scale` (health ×).
- **Perf (blocking the M2 gate):** a Torbor Downs copy holds **~1,300 monsters** (16 zones of E's camps + escorts).
  tests/A/bots100 (70 players spread over the province, 30 in town) went from **p50 5 / p99 9 ms before 378fbbb to
  p50 14 / p99 23–25 ms after** (gate p99 ≤ 20). Profile of that phase (self time, 20 s): `nearestFriend` 12.3%
  (O(monsters × players) every tick for every monster, even asleep ones), `tickMonsters` 9.7%, `combat.tickMonsters`
  6.3%, index.js:245 (anon) 5.8%, `syncOut` 4.4% (walks every monster every tick), `followers.js F.tick` 4.0%,
  `spread` 2.3%, `fmt` 1.6%. Asks: (1) skip monsters whose cell is asleep **before** `nearestFriend` —
  `host.isAwake(x, z)` is O(1) (cells within 200 m of a player, refreshed every 5 ticks); (2) `syncOut`/`syncIn` only
  for units that think or changed this tick; (3) nearest player via `host.near(x, z, r, filter)` (grid query) rather
  than a scan of all players. Empty-world tick is 1.4 ms already, so most of this is awake-but-idle work.

## A (Server core) -> D (Client), 2026-10-04 — protocol v3 (M2): the dev server now runs the whole province
The dev unit (8491) serves **Torbor Downs as ONE room in world metres** (`--province torbor_downs`, the default now).
Everything is in docs/protocol.md **§15**; the short list of what the client needs:
1. **Province ground** — `joined.room.terrain` is `null` and `room.zones = [{key, bounds}]` is set: load every
   `data/zones/<key>/terrain.bin` and draw it at `(bounds.minX, bounds.minZ)` (zone-local metres + offset). For
   prediction use the server's own stitcher: `createProvinceTerrain({ key, zones: [{ key, zx, zy, reader }] })`
   (js/sim/province-terrain.js; zx/zy from the key `zXX_YY`). `room.province`, `room.towns` (every hub town circle),
   `room.horizon` (B's world.json + macro.bin for the far view). Need it single-zone for a while? start a server with
   `--province z12_02` (zone metres, `terrain:'z12_02'`).
2. **Waystones** — objects `type:'waystone'` (`info.waystone` = key): `use` = discover (`used.kind:'waystone'`,
   `known`), `travel {to:key}` from any waystone (fare in `travelR.cost`), `you.waystones` = known list.
3. **Realm events** — `realm {kind, ev, at?, text?}` on the gateway (show `text`; `eventSoon` repeats at 5 and 1 min),
   a "Travel there (free)" button = `net.travel('event')`, `joined.event`; `eventFrame` (1 Hz) now carries
   `phase/wave/waves/boss/hp/players`. **Zone events** — `zoneEvent {kind:'soon'|'start'|'end', ev, text?, won?}`.
4. **Open groups** — `groupHint {key, with}` → toast "Group up?" → `party {op:'group', code:key}`.
5. **Traces** — objects `grave` / `campfire` (`info.trace = {who, level, by, at, until}`; text pools in
   data/names/traces.json, pick by a hash of the id), dungeon doors with `info.banner = {by, party, at, until, place}`,
   `zone {deeds, heat:[[x, z, steps]]}` (heat = 8 m cells, draw a worn path above 400 steps/hour), `net.campfire()`.
6. **Day/night** — `welcome.clock` / `room.clock`, `net.timeOfDay()` (0 = midnight; 2 real hours a day).
   **NPC schedules** — town folk (`info.role`) walk between B's plots by E's schedules.json; barks arrive as
   `ev say {id, text, style:'bark'}`.
7. **E's placed content** — markers `fort` / `farm` / `hook` (`info.site {kind, template, friendly, blurb}`, `info.r`,
   draw from data/provinces/sites.json + the placement files), caves = door objects `type:'cave'`, treasure `clue` /
   `cache` (`info.treasure`, cache `hidden` + `hint` + `info.shimmer` m; `you.treasure` = progress), quest NPCs.
8. **Quests + jobs** — `use` an NPC → `used.offers` (quest views) + `used.ready`; `net.quest('accept'|'turnin', id, npcEntityId)`,
   `net.quest('abandon', id)`; the log arrives as `quests {active, done}` (also `joined.you.quests`); `questR`.
js/net/client.js now emits every unknown message type under its own name, so new messages never get lost.

## A (Server core) -> G (Tests + load), 2026-10-04 — M2 gate over your bot client
`tests/A/bots100-real.test.js` (TV_PERF=1) runs 100 of YOUR bots against a real server on Torbor Downs in three
phases (30 town / 70 fighting; 100 in Torborhold; 60 at the realm event via `net.travel('event')` + 40 in town), each
measured over a full /status minute; `TV_TEST_DB=pg` = stage 2 (`--procs 1`). Numbers in CHANGELOG. Two notes:
(1) two bot-client CLI processes against one pg DB clash on names (`botCounter` names repeat per process) — a
`--prefix` option would help; (2) protocol v3 (your bots need nothing new). New server flags for tests:
`--event-first <ms>` (demo director: first event after N ms, any event), `--event-announce`, `--event-every`.
`tests/A/stage2.test.js` = real gateway + 2 province processes (relocate + kill -9 of a child), skipped without PG*.

## A (Server core) -> E (Content), 2026-10-04 — your M2 data is live on the server
All 11 placement kinds, events.json (director rules, realm + zone events), schedules.json, traces.json limits, quests
(every zone file + the province chain via `next` + jobs.json frames, js/sim/quests.js) and rares.json are read.
Choices I made where the data left room: a hostile fort's garrison uses its `monsters` list (not the `blight`/`undead`
variants — tell me the rule if you want them by archetype); a `warband_stockade` is one warband-leader camp row;
quest steps run in order; a quest that is the `next` of several unlocks when ANY of them is done; job boards = NPCs
with role elder/sergeant/captain/quartermaster/tollkeeper/broker/innkeeper; jobs' `standing` reward is ignored (no
factions yet); `escort` = walk to the destination. One site name did not resolve as a bake site and now matches your
fort placement by name: "the Antler Stockade". tests/A/quests.test.js fails if any story step stops resolving.

## A (Server core) -> H (Ops), 2026-10-04 — dev unit
Restarted on M2: it now loads Torbor Downs (16 zones, ~260 MB RSS, idle tick ~1.5 ms). When you want the stage-2
shape on dev, add `--procs 1` to ops/start-dev.sh (needs `--db pg`, which dev already uses); /status then reports the
children under `procs[]` and `/healthz` waits for them.

## A (Server core) -> Lead, 2026-10-04 — M2 server notes
- I built the **quest runtime** (js/sim/quests.js) — no stream owned it and E's 90 quests + jobs had nothing running them.
- The 100-bot gate passed in-process (p99 7.7–10 ms) and over real sockets (p99 5–11.6 ms) before C's 378fbbb; with C's
  pathfinding/warbands/followers the in-process spread phase reads p99 ~23 ms. Cause and asks are in "A -> C" above.

## D (Client) -> A (Server core), 2026-10-04 — M2 client is in; what it reads, and five small asks
The client now draws the province in WORLD metres from `joined.room.zones` (streams the zone you stand in + neighbours within
450 m), the far horizon from `data/world/macro.bin`, towns/bridges/doors from each zone's `placements.json`, trees from
`scatter.bin`, day/night from `net.timeOfDay()`, town folk (kind `npc`, `info.role`) with E-to-talk, waystones
(`used {kind:'waystone', fresh, known}` -> travel panel with fares, `travel`/`travelR`), `realm` announcements + "Travel there
free", `eventFrame`, `groupHint` -> one-click `party {op:'group', code}`, `zone` deeds + `heat` footprints, graves/campfires
(`used {kind:'grave'|'campfire', ...}`), `C` = `trace {kind:'campfire'}`, vignette objects (`vignette` lore on walk-in, `note`,
`use`, hidden `chest` shimmering within 15 m). Asks (the client already handles each when it appears):
1. **Door banner in `info`**: `bannerDoor()` sets `obj.data.banner = {by, party, at}` but `Entity.info()` drops it — please add
   `if (d.banner) o.banner = d.banner;` so the "Cleared by Aldra's party, 4 minutes ago" label shows on the door.
2. **Trace details in `info`** (optional, saves a round trip): `if (d.trace) o.trace = { kind, who, level, by, at }` for graves/campfires.
3. **`joined.room.dungeon.floors[i].river`**: pass E's `floor.river` polyline through `describeDungeon` (cave_river draws it as water).
4. **Realm event zone name**: `ev.zoneName` (the zone's sheet name) in `realm`/`joined.event` views, for "Grimtallow stirs in Blackthorn Scar".
5. **`you.bar`** (with C): the skill bar on `joined` and in a `you` patch on level-up: `[{slot 1..6, id, name, desc, cd (ms), mp,
   level, locked, ally}]`. Until then the client builds the same bar from Farhold's skills.json (class list + unlockAt), so
   keys 1–6 already cast `cast {slot}`; ally skills send `target` = the friendly target or yourself.
Also: the dev unit on 8491 is still the old build on the `test` zone (uptime 4 h at 00:50 UTC) — a restart picks up
torbor_downs. D tested against its own instance on 8493 (memory DB).

## D (Client) -> C (Combat core), 2026-10-04
`you.bar` as above (ask 5) — the real bar from `buildSkillBar`, so talents/forms/stances that change a slot show. Please also mark
skills that target friends (`ally: true`) — the client's fallback guesses from shape/desc (`js/client/skillbar.js isAllySkill`).

## D (Client) -> E (Content), 2026-10-04
- Dungeon looks: all 8 `plan.look` keys are drawn (`js/client/dungeon-view.js LOOKS`: surfaces, light colour, fog, props hugging
  the walls, tombs for crypts, beams for mines, pools for cisterns, glowing growths for caves); `floor.river` is drawn when A passes it.
- Vignette placements for the 16 Torbor Downs zones: the client draws a recipe's `props` from `data/vignettes/placements/<world
  zone>.json` or `<E zone>.json` (province-map), skipping a file whose `terrainHash` is for another bake (as the server does).
- Town folk lines: the client has a fallback line set per role (`js/client/world-ui.js ROLE_LINES`); an `npc.says` from you wins.

## D (Client) -> F (Models), 2026-10-04
Town folk wear a class outfit picked by role (`ROLE_CLASS` in js/client/main.js: smith -> warrior, merchant -> bard, …). When
`avatar-3d/data/npc-outfits.json` lands, tell me its loader and I switch folk to it.

## A (Server core) -> C, Lead, 2026-10-04 — addendum: the gate is green again (dormant camps)
Province copies now park camps nobody is near (room.js `dormantCamps`: only camps within 200 m of a player exist; a calm
camp left alone 30 s is removed with its escort and comes back whole). 100-bot gate: in-process p50 3.6 / p99 9.2 /
worst 18.6 ms, real sockets p99 ≤ 13 ms. C's asks above are no longer blocking, but still worth doing (a crowd spread over
the province wakes hundreds of camps). Note for C: a parked leader's escort is removed by `data.escortOf === leader id`;
a monster can now disappear without dying (room.remove) — your units must not assume every removal is a death.

## G (Tests + load) -> A (Server core), 2026-10-04 — herds re-run on a quieter VM (real sockets, 60 s windows)
| run | spread 30/70 p50 / p99 / max | town herd 100 | event herd 60 (Raiders at Torborhold) | KB/s per player spread / town / event |
|---|---|---|---|---|
| stage 1 (`--procs 0`), load 3.6–12 | 13.8 / **27.5** / 31.7 | 7.2 / 18.9 / 34.1 | 7.5 / **20.5** / 37.7 | 1.9 / 9.9 / 12.0 |
| stage 2 (`--procs 2`, scratch pg), load 11–12 | 5.2 / 18.2 / 27.9 | 5.7 / 14.3 / 35.7 | 5.5 / **20.4** / 34.8 | 1.8 / 10.0 / 10.8 |
Worst tick < 50 ms everywhere; bandwidth well inside the budgets. **The red one is stage 1's province room with ~65 players
spread over the wilds: p50 14 ms** (stage 2 cuts it to 5 ms — I have not profiled why). Stage 2 is within 0.4 ms of
the event-herd gate on a busy machine. Notes: your stage-2 `/status` has no `rooms`/`bytesOutPerSec` per proc (I count bytes at the
bots' sockets anyway); with one province the second process idles — the gain is towns vs wilds, not provinces. Run:
`TV_PERF=1 [TV_LOAD_PROCS=2] node --test tests/load/herds.test.js` (~6 min; stage 2 brings its own throw-away Postgres).
- **D update (later 2026-10-04):** A's v3 already covers asks 1–2 (`info.banner`, `info.trace`) — thanks, the client reads both. Still open: 3 (`floor.river`), 4 (`ev.zoneName`), 5 (`you.bar`). The client now also handles `quests`/`questR`/`used.offers|ready` and `zoneEvent`. Dev unit restarted by D (now v3, torbor_downs). **G**: two-players spec is green again; note it walks toward world point (1024,1024) — with province world metres that is far NW, it still works but a direction toward `room.zones` middle or the nearest camp would be sturdier.

## H/G -> A (Server core), Lead — 2026-10-04: kill -9 x500 against Postgres PASSED
`tools/chaos-kill9.mjs --kills 500 --db pg --scratch` (own throw-away cluster, `--process chaos`, run from a frozen release of HEAD):
0 failures — 177,840 settled-item checks, 0 lost / 0 duplicated, gold never fell, 20 DB conservation checks green, worst rejoin
1.55 s, 727 items and 1,881 kills by the end. One unexplained miss in an earlier run (a bot not back within 30 s after kill 267,
no diagnostics then) did not recur; the tool now dumps the bot status + server log tail if it does. M1.5 "persistence chaos" box: green.

## A (Server core) -> G, D, Lead, 2026-10-04 — herds re-run (quiet VM) + D's asks 3/4 + horizon
- **G**: your tests/load/herds.test.js after dormant camps + shared event frames, load 0.6–1.1: stage 1 spread/town/event
  p99 **5.6 / 6.1 / 5.8 ms** (worst 29), stage 2 `--procs 2` p99 **5.2 / 6.5 / 6.4 ms** (worst 30). Your 27.5 ms run was at
  load 3.6–12 (other projects' suites) and/or before dormant camps (18:49). Stage-2 `/status` now has `rooms` (every
  child's) and `bytesOutPerSec`.
- **D**: ask 3 done (`room.dungeon.floors[i].river`), ask 4 done (`ev.zoneName` in `realm`, `joined.event`, `eventFrame`,
  `zoneEvent`). `joined.room.horizon` now also carries B's `{bin:'data/world/horizon.bin', hash, step:32}` (parseHorizon,
  world metres) next to macro.bin. Ask 5 (`you.bar`) needs C's bar first — I will pass it straight through once
  `rules.bar(entity)` (or similar) exists; C, please say the name.

## E (Content) -> B (World bake), 2026-10-04 — re-placed on your re-bake; the_long_stair; the boring-walk gate
**Re-placed all 16** (`node tools/assign-vignettes.mjs && node tools/place-vignettes.mjs`, same inputs → same files). Please
re-bake once more for scatter/nav (tests/B "fresh bake" is red on `nav.bin` only; terrain.bin and every site still match —
nothing of mine touches your door/arena rule). After that **you do not need to wait for me**: my files stay valid as long
as `terrainHash` (your inputHash) is unchanged, and clearing scatter only opens ground, so tests/E stays green — no ping-pong.
- **Names**: `torbor_downs-places.json` `rename` keys are now the slug of `wfName` (e.g. `fiderow` → Hollin Toll); my test
  matches `slug(site.wfName || site.name)` (and a renamed crossing with no wfName, Fitockpi Ford, by its target name).
  The 8 asks STAY in the list (same name/kind/spot/r as you baked them) so your next bake keeps them.
- **the_long_stair → `road_138`** in z11_01 (cls road, 6 m: the pass road leaving Hollin Toll's junction at (1856, 448) and
  climbing out NE through (1944, 446), (1992, 428) to the edge at (2040, 392)). Please cut the cliff on its **north (uphill)
  side** from about (1890, 440) to (2030, 395): foot ~8 m off the road edge, rising 18–25 m over ~30 m (past 63°, your
  cliff rule), road kept as is. Leave the face un-notched; the stair is props. My hook disc (r 15) already sits at the foot,
  **(1929, 426)** (`needMet: false` until the cliff exists; the test only requires it to be placed).
- **Longest boring walk ≤ 250 m** is now implemented and GREEN: `tools/boring-walk.mjs` `boringWalk(zones, { reachable })`
  (pure over parsed nav + your placements + my file). POIs = every E placement/feature + your settlements, doors, arenas,
  crossings, landmarks, lairs, bridges, named lakes; you "see" a POI within 60 m of its edge. **road**: along every road
  polyline, the longest run with nothing in sight (now 235 m); **open**: the emptiest reachable walkable sample is D m from
  any POI, a straight line through it is out of sight for 2·(D − 60) (now D 180 → 240 m). The province's outer 40 m rim is
  skipped (it borders zones outside the province). My placer fills pockets with `wayside` dressing (new
  `data/vignettes/wayside.json`, no encounter) and extra `camp`s (`filler: true`) until both measures pass.
  tests/E/placement.test.js gates it; if you want it in tests/B too, call `boringWalk` from province-reach with your
  stitched label as `reachable`.
- `tools/lib/province-reach.mjs zoneTargets()` reads `data/vignettes/placements/${sheetZone}.json` — my files are keyed by
  **world** zone (`z12_02.json` …); `test.json` is only the M0 fixture. Please read `${id}.json` (world id) — it then also
  counts every vignette, fort, camp, NPC… as a target (all are reachable by tests/E).

## E (Content) -> A (Server core), D (Client), 2026-10-04 — placement format: unchanged + one additive type
Same file, same records. **New type `wayside`** {kind = id in `data/vignettes/wayside.json`, name, radius 3–5, `filler: true`}:
props only (draw like a vignette's props, rotated by yaw), optional `lore` when walked into; A can ignore it (your default
branch already does). Some `camp`s carry `filler: true` (same fields; count [2,3]). Hooks that ARE a feature stay in
`features[]` (z12_02 the_singing_ford at the ford, z13_02 the_bridge_city = Halsbridge, z11_04 the_thorn_wall with `pts`) —
A: `js/sim/placements.js` reads `placements[]` only, so those three hooks have no marker yet; add `features[]` if you want them.

## A (Server core) -> E, D, 2026-10-04 — features[], wayside, filler camps are live
- **E**: `features[]` hooks, `wayside` (lore from wayside.json) and `filler` camps are read; a hostile fort's garrison now
  picks `blight` in blight zones and `undead` in ruinfield / holy_ground (else `monsters`) — say if you want another rule.
- **D**: new object type `wayside` (`info.lore`, `info.site.template` = wayside.json kind → draw its props at the object,
  rotated by the placement yaw from the file); feature hooks carry `info.site.feature` and, for the Thorn Wall, `info.site.pts`.

## C (Combat core) -> A (Server core), D (Client), 2026-10-04 — your M2 asks are done
1. **`rules.bar(e)`** → `[{slot 1..6, id, name, desc, cd (ms), mp, level, locked, empty, shape, element, ally, group, charges, form}]`.
   `ally: true` = send a friendly `target` (heal, barrier, ward, cleanse, link, mend); `group: true` = reaches the party by
   itself (no target needed). It is Farhold's live bar, so call it again after a level-up, a talent pick or a form change.
   It formats text — call it on `joined` / level-up, never per tick.
2. **Rares walk `data.path`** when not fighting (waypoint to waypoint at a stroll, round walls); the leash measures from
   where it was pulled. **`data.scale`** multiplies an event boss's health in the rules (your stand-in fallback still works).
3. **Perf**: asleep monsters skip the push-apart and `syncOut`; nearest player via a bucket grid; a per-tick monster index
   for players' fighting flags and followers. Your bots100 (TV_PERF=1): spread p99 6.97 ms, town herd p99 6.82, event herd
   p99 8.04, worst 11.42 ms, rulesErrors 0. I did not need `host.isAwake`/`host.near` (the rules' own grids are cheaper
   than a query per monster); they stay unused.
4. **Removal without death** is clean: no death event, no award, followers and links drop it (tests/C/province-rules).

## B (World bake) -> E, Lead — 2026-10-04: final re-bake — the_long_stair cut, sites pinned, unit gate green
- **the_long_stair**: a cliff on the north side of road_138 in Hollin Pass (z11_01), x 1890 -> 2030, foot 8 m off the road centre,
  18-25 m tall (highest mid-way, ~80° face — nav marks it STEEP), tapering at both ends and stopping 6 m short of the zone edge;
  your hook disc (1929, 426, r 15) is left as an alcove at its foot (open ground, slope < 8°). `meta.cliff` in terrain.bin;
  spec in `data/world/zone-themes.json` (`cutCliff` in tools/lib/zone-theme.mjs). Mark it `needMet: true`.
- **Sites are pinned** (`data/world/site-pins.json`, taken from the bake you placed against): a re-bake now keeps every door /
  event / camp exactly where it was (it had moved `event_coldwater` because your new discs freed a spot nearer its anchor).
  Terrain hashes unchanged, so your files stay valid; the re-bake only moved scatter/nav off your discs (+ the cliff).
- `tools/lib/province-reach.mjs` reads your world-zone files (`data/vignettes/placements/z12_01.json`…): 1,603 targets, all reached.
- `ops/start-dev.sh` runs `--procs 1` with Postgres (PROCS=0 for one process); the dev unit is restarted and up in stage 2.
- Unit gate (tests/A, B, C .mjs, D, E): **393 tests, 390 pass, 0 fail, 3 skipped** (the perf gates, TV_PERF). tests/B 43 green.

## D (Client) -> A (Server core), G — 2026-10-04 (later): placed content drawn; two small notes
- **A**: the client now draws every fort/farm/cave/hook/vignette from E's placements and renders your `clue`, `cache`, `fort`, `farm`,
  `hook` objects. Please add `if (d.shimmer) o.shimmer = d.shimmer;` to `Entity.info()` so a cache's own shimmer radius reaches the
  client (it uses 15 m until then). Also still open: `floor.river`, `ev.zoneName`, `you.bar`.
- **G**: two-players passes (1.9 min) but is now tight: since E's camps replaced the ring, the nearest wolves are ~140 m from the
  town edge, the players arrive at ~30 % health, and at ~4 fps headless the 75 s fight loop has little slack (one run of three failed
  "both players hit wolves"). Suggest a longer fight budget or picking a pack nearer the gate.
