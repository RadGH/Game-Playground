# Bannerline — Interfaces (sim <-> view/input/net)

Owner: stream A (sim). Status: **M1 contract**, 2026-10-03. Stream B builds the view, input and UI
against this page; anything B needs that is not here goes in `docs/requests.md` addressed to A.
Fields marked *(M3+)*, *(M4)* etc. are reserved now so nobody invents a clashing name.

Rule of thumb: **the sim owns the truth, the view only reads it.** The view never writes into
`sim.state`; every change a player makes is a **command**. Everything the view needs to draw a
one-off effect (a swing, a number, a death) comes from the **event** queue.

---

## 1. Coordinates and time

- Units are **metres** and **ticks**. `TICK_HZ = 20` (one tick = 50 ms). Seconds in data files are
  converted to ticks by the sim; the view converts back with `ticks / TICK_HZ`.
- World axes: **+x** right, **+z** "down the field" (from the gate toward the Keep), **y** up. The
  ground is flat at y = 0 in M1.
- Each team owns one **field**. Inside a field the **gate** is at small z (top of the screen) and the
  **Keep** at large z (bottom of the screen): units walk +z. Fields sit side by side along x.
  A camera that puts the gate at the top of the screen sits at high z looking toward −z.
- **Facing** `face` is an angle in radians with direction vector `(sin face, cos face)`: `0` faces
  +z (down the screen, toward the Keep), `π` faces −z. This equals three.js `rotation.y` for a model
  whose front is +z.
- Stick directions (`moveDir`, §3) use 16 steps: `dir` d means angle `d * 2π / 16` in the same
  convention (d = 0 → +z/down, d = 8 → −z/up, d = 4 → +x/right, d = 12 → −x/left).

## 2. The sim API (`js/sim/sim.js`)

```js
import { createSim, restoreSim, TICK_HZ, TICK_MS } from './js/sim/sim.js';
import { loadData, DATA_FILES } from './js/sim/data.js';
import * as Q from './js/sim/query.js';          // read-only helpers for the UI (§7)

const data = await loadData(name => fetch(`data/${name}`).then(r => r.text()));   // browser
// node: loadData(name => readFileSync(join(dir, 'data', name), 'utf8'))
const sim  = createSim(config, data);   // config: §2.1

sim.step(commands);         // advance ONE tick. commands = array of §3 objects for THIS tick (any players).
                            //   AI slots generate their own commands inside step(); never send for them.
const evs = sim.drainEvents();   // events emitted since the last drain (§4), oldest first
sim.state                   // plain data, read-only for the view (§5)
sim.map                     // static geometry for this match (§6), derived from data + mode; never changes
sim.data                    // the frozen data bundle (names, costs, looks)
sim.tick                    // === sim.state.tick
sim.over                    // true once state.result is set
sim.hash()                  // uint32 FNV-1a over the canonical state (positions quantised to mm)
const snap = sim.snapshot() // plain JSON-safe object: { v, dataHash, state }
const sim2 = restoreSim(snap, data)   // same hash, same future given the same commands
```

`loadData(fetchText)` takes a function `name -> Promise<string> | string`, reads every file in
`DATA_FILES`, deep-freezes the bundle and computes `data.hash` (FNV-1a over canonical JSON, keys
sorted). Online peers compare `data.hash` before starting (§11.2 of PLAN). It returns a Promise when
the fetcher does; `loadDataSync(readText)` is the node twin.

### 2.1 Match config

```js
{
  seed: 12345,                  // uint32; every rng stream is derived from it
  mode: '1v1',                  // '1v1' | '2v2' | '3v3'  (M1 builds 1v1; the shape is the same)
  map: 'vale',
  players: [                    // player id = index in this array
    { team: 0, name: 'Radley', kind: 'human', race: 'freeholds', hero: 'warrior',
      deck: ['levy', 'hill_slinger', 'shieldbearer', 'hedge_priest'] },
    { team: 1, name: 'Recruit', kind: 'ai', ai: { difficulty: 'recruit' },
      race: 'freeholds', hero: 'warrior' }          // deck optional; defaults to the race's first 4 units
  ],
  rules: {                      // all optional; tests and debug only
    endless: false,             // no banner loss / no end (econ curves)
    banners: null,              // override banners per team
    startGold: null
  }
}
```

The config is validated: unknown race/hero/unit or a bad deck throws an `Error` whose message the
lobby can show.

### 2.2 Driving the clock (view side, M1)

The view owns a fixed-step accumulator on rAF (stream D moves it into a Worker in M5):

```js
acc += dtMs * speed;                         // speed = 1, or 8 for debug
while (acc >= TICK_MS) { sim.step(takeCommandsForTick()); acc -= TICK_MS; handle(sim.drainEvents()); }
const alpha = acc / TICK_MS;                 // 0..1 for interpolation (§5.3)
```

Offline input delay is 1 tick: commands built during a frame go into the next `step()`.

## 3. Commands

A command is a plain object `{ p, type, ...args }`. `p` is the issuing player id. Numbers may be
any finite JSON numbers; the sim quantises positions to 0.01 m on receipt. Illegal commands are
ignored and produce a `reject` event (§4) with a reason the UI can show. Several commands per player
per tick are fine; they apply in array order.

| type | args | effect |
|---|---|---|
| `move` | `x, z` | hero walks to the point (clamped to its field) and ignores enemies on the way |
| `amove` | `x, z` | attack-move: walk, but fight anything that comes within aggro range |
| `attack` | `target` (entity id) | chase and attack that entity |
| `stop` | — | stop moving, keep attacking whatever is in reach (hold position) |
| `moveDir` | `dir` 0..15, `speed` 0..3 | stick movement, sent only when it changes; `speed 0` = release (hero idles / auto-attacks nearby). §1 for `dir` |
| `cast` | `slot` `'Q'|'W'|'E'|'D'|'R'`, `x, z` (aim point), `target?` | cast the skill in that slot. `x,z` aims shaped skills (arc direction / ground point). Omit `x,z` to cast toward the current facing |
| `learn` | `slot` | spend one skill point on that slot (rank + 1) |
| `talent` | `choice` 0 or 1 | the level-6 talent pick (once) |
| `send` | `unit` (unit id) | buy one send: queues it for the next Pay (must be in your race roster, unlocked, in stock, affordable) |
| `deck` | `units` [4 unit ids] | set the 4 deck sends (any time) |
| `auto` | `index` 0..3, `on` bool | auto-send toggle for a deck slot: buys that send whenever its stock and your gold allow |
| `muster` | — | buy the next Muster rank (I–III) |
| `upgrade` | `slot?` 0..7 | buy the next **gear step** for that equipment slot (PLAN §7.2 steps, `econ.json items.tiers`); omit `slot` for the cheapest unlocked step. M1's gold sink; M4's shop replaces the abstract steps with real items but keeps the step prices |
| `potion` | — | buy one belt potion (25 g) if the belt has room |
| `drink` | — | drink a belt potion (heals 40% max HP) |
| `surrender` | — | your team loses at once |
| `toll` | — | *(M6)* Toll of Iron |
| `buy`, `equip`, `unequip`, `sell`, `oil`, `requisition` | — | *(M4)* items; shapes defined in M4 |

`reject.reason` values: `'gold'` (not enough gold), `'stock'`, `'maxGear'`, `'stunned'`, `'locked'` (tier not unlocked yet),
`'roster'` (unit not in your race), `'dead'` (hero is dead), `'cooldown'`, `'mana'`, `'rank'` (skill
not learned), `'points'` (no skill point), `'maxRank'`, `'level'` (R before 6), `'belt'` (belt full /
empty), `'maxMuster'`, `'over'` (match over), `'bad'` (malformed).

## 4. Events

`sim.drainEvents()` returns `[{ tick, type, ... }]`. Events are **not** part of the state (not
hashed, not snapshotted): they are hints for drawing and sound. Never derive game truth from them.

| type | fields | when |
|---|---|---|
| `spawn` | `id, kind, unit, team, field` | an entity entered the world (sends, tides, heroes at match start) |
| `remove` | `id, why` (`'killed'|'leaked'|'expired'`) | entity left `state.ents` (heroes are never removed) |
| `attack` | `src, dst, ranged` | a basic attack starts (play the swing/shoot clip) |
| `shot` | `src, dst, dmgType, ticks` | a projectile leaves `src`; damage lands `ticks` later (draw it flying) |
| `hit` | `src, dst, amount, dmgType, crit, skill?` | damage applied (floating number; `amount` already rounded to 0.1) |
| `heal` | `src, dst, amount` | healing applied |
| `death` | `id, killer, x, z` | something died (heroes too) |
| `cast` | `id, slot, skill, shape, x, z, face, radius, arc, reach` | a hero cast a skill (draw the ring/arc). `shape` per PLAN §6.3 |
| `pulse` | `id, skill, x, z, radius` | a repeat of a multi-hit skill (Iron Gyre spin, shockwave) |
| `knock` | `id, fromX, fromZ, toX, toZ` | an entity was shoved/pulled (view may tween) |
| `status` | `id, status, on` | a status started (`on: true`) or ended |
| `taunt` | `id, by, ticks` | a unit was taunted onto `by` |
| `levelUp` | `player, level` | hero levelled (a skill point is now available) |
| `heroDown` | `player, respawnTick` | hero died; respawns at `respawnTick` |
| `respawn` | `player, id` | hero is back at the Armory |
| `queued` | `player, unit` | a send was bought (goes out on the next Pay) |
| `wave` | `player, field, units` | a Pay released that player's queued sends into `field` |
| `pay` | `player, amount, income` | gold paid on the Pay |
| `bounty` | `player, amount, src` | bounty share paid to a player for a kill |
| `tide` | `level, field` | a Tide wave entered a field |
| `leak` | `team, banners, src, unit` | `banners` (may be fractional) torn from `team` by entity `src` |
| `refund` | `player, amount` | Grave Tithe refund *(M6, Unburied)* |
| `unlock` | `tier` | a send tier unlocked for everyone |
| `rising` | `step` | Rising Tide step began (alert) |
| `muster` | `player, rank` | Muster rank bought |
| `gear` | `player, slot, step` | a gear step was bought |
| `champion` | `player, unit, field` | a champion send is leaving through a gate ("Champion at the gate!") |
| `revive` | `id` | a `rise` unit came back at half HP |
| `talentReady` | `player` | level 6 reached, talent pick open |
| `reject` | `player, cmd, reason` | a command was refused (§3) |
| `result` | `winner, reason` | match over. `winner` = team id, or −1 for a draw. `reason`: `'banners'|'cap'|'surrender'` |

## 5. State (read-only for the view)

Plain serialisable data: no class instances, no closures, no Maps in M1 (arrays in id order).
Every field below is stable for M1; new fields may be added, none renamed without a request.

```js
state = {
  v: 1, tick, seed, mode, map,
  rng: { combat: [a,b,c,d], loot: [...], ai: [...], shop: [...] },   // sfc32 streams (do not touch)
  nextId,                        // next entity id
  unlocked: 1,                   // highest send tier unlocked (1, 2, 3, 4, 6)
  rising: 0,                     // Rising Tide step (0 = not yet)
  tideLevel: 0,                  // level of the last Tide wave
  result: null,                  // { winner, reason, tick } once the match ends
  teams:   [Team],
  players: [Player],
  fields:  [Field],
  ents:    [Ent],                // ascending id
  timers:  [{ id, atTick, kind, args }]   // delayed effects (projectile hits, skill repeats, respawns)
}
```

### 5.1 Team, Player, Field

```js
Team   = { id, banners, bannersMax, field, players: [ids], dealt }   // dealt = banners torn from enemies (hard-cap tie-break)
Field  = { id, team, waiting: [WaitingSend], bodies }               // live bodies now (cap: econ.field.cap)
Player = {
  id, team, name, kind: 'human'|'ai', ai: null | { difficulty },
  race, hero,                    // ids
  heroEnt,                       // entity id of this player's hero
  rival,                         // player id of the direct rival (whose field you send into)
  gold, income,
  deck: [4 unit ids], auto: [4 bools],
  stock: [{ unit, n, max, t, every }],    // race roster order; t = ticks toward the next charge, every = restock ticks
  queued: [unit ids],            // bought this Pay interval, released on the next Pay
  muster,                        // 0..3
  gear: [8 step indices],        // -1 = nothing, 0..6 = econ.items.tiers index (M1 abstract gear; M4 adds items)
  level, xp, skillPts,
  skills: [{ slot, id, rank, readyAt }],  // slots Q W E D R; readyAt = tick the cooldown ends
  talent: -1 | 0 | 1,
  belt,                          // potions carried (0..2)
  surrendered,
  stats: { sendGold, sends, itemGold, potionGold, musterGold, kills, deaths, leaked, dealt, bounty,
           incomeAt: [income at each whole minute], goldAt: [...] }
}
WaitingSend = { owner, unit, group, body, bodies }   // held at the gate because the field is at its cap
```

### 5.2 Entities

```js
Ent = {
  id, kind: 'hero'|'unit'|'tide',
  type,                    // hero id ('warrior'), unit id ('levy') or 'tide'
  team,                    // the team it fights FOR (sends: the sender's team; tides: -1)
  owner,                   // player id (hero's player / sender), -1 for tides
  field,                   // field index it stands in
  x, z, px, pz,            // position now and at the start of this tick (interpolation, §5.3)
  face, pface,
  r,                       // body radius (m)
  hp, hpMax, mp, mpMax,    // mp/mpMax are 0 for non-heroes
  alive,                   // heroes stay in ents while dead (alive=false, respawnAt set)
  respawnAt,               // tick, heroes only (-1 otherwise)
  act, actTick,            // 'idle'|'walk'|'attack'|'cast'|'stun'|'dead' and the tick it began (animation hint)
  target,                  // entity id it is fighting / chasing, -1 if none
  level,                   // heroes: hero level; tides: tide level; units: 0
  armour, dmgType,         // 'light'|'heavy'|'spectral'|'hide'|'fortified', 'blade'|'pierce'|'fire'|'nature'
  statuses: [{ id, until, stacks, power, src, buff? }],   // 'burn','bleed','root','stun','slow','quarry','might','regen','haste','taunt', plus hero self-buffs by skill id (buff = the skill's selfBuff block)
  group,                   // purchase id (bodies bought together share it), -1 for heroes
  // internal fields (prefixed _) may exist; the view must not depend on them
}
```

### 5.3 Interpolation

At the start of every `step()` the sim copies `x,z,face` into `px,pz,pface` for every entity, then
moves things. To draw between ticks:

```js
const ix = e.px + (e.x - e.px) * alpha, iz = e.pz + (e.z - e.pz) * alpha;
const f  = lerpAngle(e.pface, e.face, alpha);      // shortest arc
```

A freshly spawned entity has `px = x`. A teleport (respawn, knock longer than 3 m) also sets
`px = x` — the view should not tween it (watch `knock` events if you want a tween).

Entity lifetime: keep an `id -> mesh` map; each frame create meshes for ids you have not seen and
drop meshes whose id is no longer in `state.ents` (or listen for `spawn`/`remove`).

## 6. Static map (`sim.map`)

Built once by `js/sim/map.js` from `data/maps.json` + the mode. World coordinates.

```js
sim.map = {
  id: 'vale', name, length: 140, width, gap,
  fields: [{
    id, team, cx,                  // field centre x
    x0, x1, z0, z1,                // bounds (z0 = gate end, z1 = Keep end)
    gates: [{ x, z }],             // spawn points (1 in 1v1)
    keep:  { x, z, w, d },         // Keep footprint centre + size
    leakZ,                         // a unit that reaches z >= leakZ is a leak
    armory: { x, z, r },           // shop + respawn
    spawn: { x, z },               // hero (re)spawn point
    ford:  { x0, x1, z0, z1, slow },
    walls: [{ x0, z0, x1, z1 }]    // axis-aligned blockers (none on M1 vale)
  }],
  grid: { cell: 1 }                // flow-field resolution (internal)
}
```

## 7. Read-only helpers (`js/sim/query.js`)

All pure, `(state, data, ...) -> value`; safe to call every frame.

| function | returns |
|---|---|
| `clock(state, data)` | `{ seconds, payIn, payEvery, payProgress, tideIn, tideLevel, rising, risingIn, capIn, unlocked, nextUnlock: {tier, inTicks} | null }` (all `...In` in ticks) |
| `sendInfo(state, data, pid, unitId)` | `{ unit, cost, income, stock, max, restockIn, restockEvery, tier, unlocked, unlockIn, canBuy, reason }` — reason as in §3 or null; race traits already applied |
| `deckInfo(state, data, pid)` | `sendInfo` for each of the 4 deck slots + `auto` flag |
| `roster(state, data, pid)` | `sendInfo` for every unit of the player's race |
| `heroInfo(state, data, pid)` | `{ ent, level, xp, xpNext, xpPrev, skillPts, dps, armor, armourClass, dmgType, respawnIn, skills: [{slot, id, name, rank, maxRank, readyIn, cooldown, mp, canCast, canLearn, desc}] , talent: {open, choices:[{id,name,desc}], picked} }` |
| `teamInfo(state, data, teamId)` | `{ banners, bannersMax, rally }` |
| `rivalInfo(state, data, pid)` | rival's `{ player, hero, level, hpPct, dmgType, armourClass, deck: deckInfo }` |
| `gatePreview(state, data, fieldId)` | queued sends of every enemy player heading into that field: `[{ player, unit, count }]` |
| `gearInfo(state, data, pid)` | `{ slots: [{ slot, step, next: {cost, unlocked, unlockIn} | null }], cheapest: {slot, cost} | null, spent }` |
| `musterInfo(state, data, pid)` | `{ rank, next: {cost, canBuy, reason} | null }` |
| `entName(state, data, ent)` | display name |

## 8. Data files (schemas)

All files carry a `_doc` string. The sim reads them only through `sim.data` (frozen).

- `data/econ.json` — clock, start, banners, bounty, rally, field (cap, length), tide stats, muster,
  item steps, hero curve + `xpTable` + class multipliers. See the file's `_doc`.
- `data/units.json` — `traits{id:{desc, ehp}}`, `units{id:{race, name, tier, cost, income, hp, dps,
  bodies, armour, dmg, range, speed, leak, stock, restock, unlock, bounty, traits[], model}}`.
  `hp`/`dps` per body; `leak` per purchase (split over bodies). `model` is a look hint for the view.
- `data/races.json` — `traits{id:{name, desc, ...knobs}}`, `races{id:{name, armour[], trait, hpMult,
  units[]}}`.
- `data/damage.json` — `types[]`, `armours[]`, `pct[dmg][armour]` (percent), `heroDefault`,
  `chestArmour`.
- `data/maps.json` — `maps{id:{name, length, gap, modes{mode:{width, gates}}, gateZ, leakZ,
  keep{z,w,d}, armory{x,z,r}, spawn{x,z}, ford{z0,z1,slow}, walls[]}}` (field-local x: 0 = field centre).
- `data/heroes.json` — built by `tools/build-hero-skills.mjs` from Farhold rows + Bannerline numbers:
  `heroes{id:{name, dmgType, melee, range, attackEvery, moveSpeed, radius, hp/hpPerLevel, mp/mpPerLevel,
  mpRegen, armor, slots{Q,W,E,D,R: skill id}, talents[{skill, choices:[{id,name,desc,mod}]}]}}`,
  `skills{id:{name, desc, shape, element, mult, radius|reach|arc, cooldown, mp, ...effects}}`,
  `statuses{id:{...}}`, `ranks{max, ult, multPerRank, cdPerRank}`.

## 9. What the view may and may not do

- May: read `sim.state`, `sim.map`, `sim.data`, call `query.js`, drain events, build commands.
- May not: write into state, call internal sim modules, use `Math.random` to change game outcomes.
- Player-facing names for gear slots: `GEAR_SLOTS` exported by `query.js` (weapon, off-hand, head,
  chest, hands, feet, neck, ring) and step names `GEAR_STEPS` (Plain … Legendary roll).
- Display rounding: `shared/format.js` (`hp`, `fmt`). Banners are fractional internally — show
  `Math.ceil(banners)`.
