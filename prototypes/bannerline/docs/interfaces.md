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
  mode: 'linewar',              // the GAME MODE (R2.10, js/sim/modes/): 'linewar' today; 'hvf' etc. later
  format: '1v1',                // the mode's format: line war '1v1' | '2v2' | '3v3'. Old configs with mode: '1v1' still work
  map: 'vale',
  players: [                    // player id = index in this array
    { team: 0, name: 'Radley', kind: 'human', race: 'freeholds', hero: 'warrior',
    },
    { team: 1, name: 'Recruit', kind: 'ai', ai: { difficulty: 'recruit' },
      race: 'freeholds', hero: 'warrior' }
  ],
  rules: {                      // all optional; tests and debug only
    endless: false,             // no banner loss / no end (econ curves)
    banners: null,              // override banners per team
    startGold: null
  }
}
```

The config is validated: an unknown mode/format, race or hero, or too many players for the format, throws an `Error` whose message the
lobby can show.

### 2.2 Driving the clock (view side, M1)

The view owns a fixed-step accumulator on rAF (stream D moves it into a Worker in M5):

```js
acc += dtMs * speed;                         // speed = 1, or 8 for debug
while (acc >= TICK_MS) { sim.step(takeCommandsForTick()); acc -= TICK_MS; handle(sim.drainEvents()); }
const alpha = acc / TICK_MS;                 // 0..1 for interpolation (§5.3)
```

Offline input delay is 1 tick: commands built during a frame go into the next `step()`.

### 2.3 Game modes (R2.10)

`js/sim/modes/index.js` holds the registry: `MODES` (`linewar`), `PLANNED` (hvf, td, moba, empires),
`resolveMode(config)` and `modeList(data)`. A mode supplies its formats, allowed heroes/races, map,
tick phase order, end rule, extra commands and AI (the contract is in that file's header). Line war
is `js/sim/modes/linewar.js`; moving it there changed no outcome (identical match hashes before/after).
`sim.mode` is the mode object; commands a mode adds arrive through `cmd.type` like any other.
Hooks for other modes (stream H): `mode.buildMap(data, format, { seed, rules })` (rebuilt on restore from
`state.seed` / `state.rules`), an optional `mode.createState(config, data, map)` (HvF seats carry `role`), and
per-mode data files (`mode.dataFiles`, listed in data.js `MODE_DATA_FILES`) loaded as `data.<folder>.<file>`
(`data.hvf.rules`) and included in `data.hash`. `modeList(data)` gives the lobby `status: 'ready'|'next'|'planned'`;
Hunters vs Farmers is registered with `playable: false` until stream H finishes the match.

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
| `send` | `unit` (unit id) | buy one send. **Gold is the only limit** (owner, 2026-10-03): no stock, no cooldown, no time lock; any number per tick works (mash or hold the key). It leaves through the rival's gate within 0.5 s (`GROUP_TICKS` = 10). Refused only for `'gold'`, `'roster'` (not your race) or `'over'`. A full field never refuses: extra bodies wait in the gate queue |
| `buy` | `id` (data/items-bl.json item id) | buy one Outfitter item into the first free inventory slot. The hero must be alive and inside the Outfitter's radius (`data/buildings.json`). Refusals: `notAtShop`, `dead`, `full`, `uniqueEquipped`, `gold`, `bad` (stream I, §11) |
| `sell` | `slot` 0..5 | sell a carried item at the Outfitter for `items-bl.rules.sellFactor` of its price (a consumable: of its remaining charges' share). Refusals: `notAtShop`, `dead`, `bad` |
| `swap` | `a`, `b` slots 0..5 | move / swap two inventory slots (anywhere) |
| `use` | `slot` 0..5 | use a consumable (spends one charge; `items-bl.rules.useCooldown` s between uses). Refusals: `notUsable`, `dead`, `cooldown`, `bad` |
| `upgradeUnit` | `id` (data/upgrades.json) | buy the next Drill Yard level (from anywhere). Refusals: `max`, `gold`, `bad` |
| `power` | `id` (data/powers.json), `x`, `z` | buy + cast a Sanctum power at a world point (from anywhere, hero may be dead). Refusals: `ownFieldOnly` (defensive outside your field), `enemyFieldOnly` (offensive in a field of your team), `notInField`, `cooldown`, `gold`, `bad` |
| `surrender` | — | your team loses at once |
| `toll` | — | Toll of Iron: every enemy unit in your team's field is stunned (`items-bl.toll.stun` s). Team charges (`team.toll`), one back every `toll.cooldown` s |

`reject.reason` values: `'gold'` (not enough gold), `'stunned'`, items/town (§11): `'notAtShop'`, `'full'` (no free inventory slot), `'uniqueEquipped'`, `'notUsable'`, `'max'` (upgrade at max level), `'ownFieldOnly'`, `'enemyFieldOnly'`, `'notInField'`,
`'roster'` (unit not in your race), `'dead'` (hero is dead), `'cooldown'`, `'mana'`, `'rank'` (skill
not learned), `'points'` (no skill point), `'maxRank'`, `'level'` (R before 6), `'over'` (match over), `'bad'` (malformed).

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
| `cast` | `id, slot, skill, fx, shape, x, z, face, radius, arc, reach, range, delay, line` | a hero cast a skill. `fx` = the fx/sound key: the form variant's own id while a form changes the skill (Druid wolf: `throat_leap`, `rending_bite`, `pack_run`, `running_howl`), else the skill id. `shape` per PLAN §6.3. For `ground`, `x,z` is the landing point (already clamped to range); `delay` > 0 = it lands that many ticks later (draw a warning marker); `line` > 0 = a line that long across the aim (`face` + 90°), half-width `radius` |
| `bolt` | `id, skill, fromX, fromZ, toX, toZ, ticks, dst` | a skill bolt (Firebolt) flies for `ticks`; `dst` is the entity it will hit or −1 |
| `zone` | `zone, x, z, radius, length, face, ticks, skill, dmgType` | a burning patch appears (`length` > 0: a capsule of that length along `face`, half-width `radius`); lasts `ticks` |
| `zoneEnd` | `zone` | a zone went out |
| `pulse` | `id, skill, x, z, radius` | a repeat of a multi-hit skill (Iron Gyre spin, shockwave) |
| `knock` | `id, vx, vz, metres` | a push started (R2.5): the body now SLIDES over the next ticks (velocity + friction, it shoves bodies it runs into, walls stop it). Positions are real every tick, so plain interpolation draws it; `metres` = how far it will slide. Pounce / dash / Throat Leap / Grapnel are leaps (`dash` event), not pushes |
| `status` | `id, status, on` | a status started (`on: true`) or ended |
| `taunt` | `id, by, ticks` | a unit was taunted onto `by` |
| `levelUp` | `player, level` | hero levelled (a skill point is now available) |
| `heroDown` | `player, respawnTick` | hero died; respawns at `respawnTick` |
| `respawn` | `player, id` | hero is back at the Armory |
| `queued` | `player, unit, auto` | a send was bought (it leaves within 0.5 s) |
| `wave` | `player, field, units` | sends bought in the last 0.5 s left through the gate into `field` |
| `pay` | `player, amount, income` | gold paid on the Pay |
| `bounty` | `player, amount, src` | bounty share paid to a player for a kill |
| `tide` | `level, field` | a Tide wave entered a field |
| `leak` | `team, banners, src, unit` | `banners` (may be fractional) torn from `team` by entity `src` |
| `refund` | `player, amount` | Grave Tithe refund *(M6, Unburied)* |
| `rising` | `step` | Rising Tide step began (alert) |
| `item` | `player, uid, id, slot, how, name` | an item reached an inventory slot (`how`: `'buy'`, `'drop'`, `'champion'`) |
| `drop` | `player, uid, id, x, z` | a kill in this player's field handed them an item (already in a slot): show a beacon at (x, z) flying to the hero |
| `swap` / `use` / `recall` | `player, a, b` / `player, uid, id, slot, left` / `player, id, x, z` | inventory slots swapped / a consumable used (`left` charges) / Scroll of Return teleported the hero home |
| `sell` | `player, uid, id, slot, gold, name` | an item was sold (`slot` -1: a drop that found no free slot was sold for you) |
| `upgrade` | `player, id, level, cost` | a Drill Yard level was bought |
| `power` / `powerHit` | `player, power, kind, field, x, z` / `player, power, x, z, radius` | a Sanctum power was cast (draw its marker; zones also emit `zone`) / a delayed blast (Skyfall) landed |
| `toll` | `team, player, stunned` | Toll of Iron rang |
| `dash` | `id, fromX, fromZ, toX, toZ, skill, fx` | a hero leapt (Tracker's Leap); `px/pz` already equal the new spot, tween it yourself |
| `trap` | `zone, x, z, radius` | a snare sprang (zone kind `'trap'`) |
| `form` | `player, form, id` | a hero took (`form: 'briarback'` or `'wolf'`) or left (`null`) a shape: swap the body to the `form.body` of the skill that grants it (`briarback_shape`, `wolf_shape` in heroes.json). In a shape the other skills are replaced (heroInfo skills show the new names) |
| `spawn` (kind `turret`) / `remove` (why `expired`) | — | an Engineer's Bolt Turret was built / ran out (or was taken down by a new one past the 1/2/3 limit) |
| `champion` | `player, unit, field` | a champion send is leaving through a gate ("Champion at the gate!") |
| `revive` | `id` | a `rise` unit came back at half HP |
| `keepShot` | `field, x, z, radius` | the Keep guard fired (js/sim/keep.js): draw a bolt from the Keep to (x, z) and a blast of `radius`; its `hit` events carry `skill: 'keep'`, `src: -1` |
| `counter` | `player, target, unit, name, count, reason, key` | a wave from `player` counters `target`'s defence (stream E): toast to the TARGET, "**{sender}** sends **{name}** x{count} — {reason}" (`reason` is written to the defender, `key` is the machine word: resists / strong / ward / swarm / stealth / unstoppable / shred / bulk). AI senders: throttled by `ai.json`; human senders: at most one every 10 s |
| `takeover` / `release` | `player` (+ `difficulty`) | online: a seat changed hands at this tick (its machine left / came back) |
| `talentReady` | `player` | level 6 reached, talent pick open |
| `reject` | `player, cmd, reason` | a command was refused (§3) |
| `result` | `winner, reason` | match over. `winner` = team id, or −1 for a draw. `reason`: `'banners'|'cap'|'surrender'` |

## 5. State (read-only for the view)

Plain serialisable data: no class instances, no closures, no Maps in M1 (arrays in id order).
Every field below is stable for M1; new fields may be added, none renamed without a request.

```js
state = {
  v: 1, tick, seed, game ('linewar'), format ('1v1'...), mode (DEPRECATED: = format, kept for older readers), map,
  rng: { combat: [a,b,c,d], loot: [...], ai: [...], shop: [...] },   // sfc32 streams (do not touch)
  nextId,                        // next entity id
  rising: 0,                     // Rising Tide step (0 = not yet)
  tideLevel: 0,                  // level of the last Tide wave
  result: null,                  // { winner, reason, tick } once the match ends
  teams:   [Team],
  players: [Player],
  fields:  [Field],
  ents:    [Ent],                // ascending id
  timers:  [{ id, atTick, kind, args }]   // delayed effects: 'proj' (unit/hero shots), 'pulse' (skill repeats), 'bolt' (skill bolts), 'ground' (delayed ground strikes)
  zones:   [{ id, owner, team, field, x, z, radius, length, face, until, dmgType, skill, ... }]   // lingering ground effects (draw them; `until` is the end tick)
}
```

### 5.1 Team, Player, Field

```js
Team   = { id, banners, bannersMax, field, players: [ids], dealt, toll: { charges, readyAt } }   // dealt = banners torn from enemies (hard-cap tie-break)
Field  = { id, team, waiting: [WaitingSend], bodies }               // bodies = live bodies now (cap: econ.field.cap); waiting = the GATE QUEUE ("+N waiting" on the HUD), entering oldest first as space frees. Only player SENDS queue; trait summons (raise, pack call, split) and Tide bodies that would exceed the cap are simply not created
Player = {
  id, team, name, kind: 'human'|'ai', ai: null | { difficulty },
  race, hero,                    // ids
  heroEnt,                       // entity id of this player's hero
  rival,                         // player id of the direct rival (whose field you send into)
  gold, income,
  queued: [unit ids],            // bought in the current 0.5 s grouping window
  inv: [6 x { uid, id, charges } | null],   // stream I: id = items-bl.json item; charges for consumables
  useAt,                         // tick the next consumable may be used
  upg: { damage, attackSpeed, ... }, upV,   // Drill Yard levels; upV bumps on every purchase
  powerCd: { [powerId]: readyAtTick },
  atArmory,                      // hero is inside the Outfitter's radius now (name kept)
  procs, gearV,                  // internal: unique power counters, gear cache version
  level, xp, skillPts,
  skills: [{ slot, id, rank, readyAt }],  // slots Q W E D R; readyAt = tick the cooldown ends
  talent: -1 | 0 | 1,
  form: null | 'briarback',      // Druid shape (changes stats, basic attack, and the other skills)
  surrendered,
  stats: { sendGold, sends, itemGold, upgradeGold, powerGold, kills, deaths, leaked, dealt, bounty,
           incomeAt: [income at each whole minute], goldAt: [...] }
}
WaitingSend = { owner, unit, group, body, bodies }   // held at the gate because the field is at its cap
```

### 5.2 Entities

```js
Ent = {
  id, kind: 'hero'|'unit'|'tide'|'pet'|'turret',   // turret = an Engineer's Bolt Turret (`type` = skill id; never moves; expires)   // pet = a hero's summon (Druid Grove Wolf; `type` = pet id in heroes.json `pets`)
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
  statuses: [{ id, until, stacks, power, src, buff? }],   // 'burn','bleed','root','stun','slow','quarry','might','regen','haste','taunt','shred' (stacks: armour stripped), 'empower' (next basic hits harder), 'barrier' (power = absorb left), 'howl', 'lock_<status>' (lockout), plus self-buffs by skill id (buff = the skill's selfBuff block)
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

A freshly spawned entity has `px = x`. A teleport (respawn, a leap: `dash`) also sets `px = x` — the
view should not tween it (watch `dash` events if you want an arc). Pushes are not teleports: they slide.

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
    keep:  { x, z, w, d, guard },  // Keep footprint centre + size; guard = { range, every, damage, damagePerMinute, splash, dmgType } (the Keep shoots)
    leakZ,                         // a unit that reaches z >= leakZ is a leak
    armory: { x, z, r },           // shop + respawn
    spawn: { x, z },               // hero (re)spawn point
    ford:  { x0, x1, z0, z1, slow },
    walls: [{ x0, z0, x1, z1 }],   // axis-aligned blockers (none on vale)
    laneWalls: [{ x0, x1, z0, z1, gaps: [{ z0, z1 }] }]   // 2v2/3v3: unit-proof lane walls between gates; heroes and pets cross at the gaps, flyers over them
  }],
  grid: { cell: 1 }                // flow-field resolution (internal)
}
```

## 7. Read-only helpers (`js/sim/query.js`)

All pure, `(state, data, ...) -> value`; safe to call every frame.

| function | returns |
|---|---|
| `clock(state, data)` | `{ seconds, payIn, payEvery, payProgress, tideIn, tideLevel, rising, risingIn, capIn }` (all `...In` in ticks) |
| `sendInfo(state, data, pid, unitId)` | one row of the **hiring hall** (stream I's Barracks): `{ unit, name, tier, role, roleText, cost, income, paybackSeconds (null = adds no income), bodies, armour, dmg, hp, dps, speed, range, leak (banners per purchase), bounty (gold the defender earns), traits, traitsText: [sentences], counters: {strongVs: [armour], weakVs: [dmg], resists: [dmg], lines: ["Hits light armour hard", "Weak to nature", ...]}, vsRival: {dealt, taken} (percent vs the rival hero's current armour class / damage type: the green/amber/red pip), canBuy, reason }` — race traits already applied |
| `roster(state, data, pid)` | `sendInfo` for all 12 units of the player's race, tier order — the hiring hall list |
| `gateQueue(state, fieldId)` | bodies waiting at that field's gate (the HUD's "+N waiting") |
| `heroInfo(state, data, pid)` | `{ ent, level, xp, xpNext, xpPrev, skillPts, dps, armor, armourClass, dmgType, form ('briarback' | 'wolf' | null), passive: {name, desc} | null, pets: [{id, type, name, hpPct}], turrets: [{id, hpPct, expiresIn (ticks)}], respawnIn, skills: [{slot, id, name, rank, maxRank, readyIn, cooldown, mp, canCast, canLearn, desc}] , talent: {open, choices:[{id,name,desc}], picked} }` |
| `teamInfo(state, data, teamId)` | `{ banners, bannersMax, shown, rally, dealt, waiting (gate queue of the team's field), bodies, cap, toll: {charges, readyIn} }` |
| `rivalInfo(state, data, pid)` | rival's `{ player, hero, level, hpPct, dmgType, armourClass }` |
| `gatePreview(state, data, fieldId)` | queued sends of every enemy player heading into that field: `[{ player, unit, count }]` |
| `shopInfo`, `itemCard`, `inventoryInfo`, `itemView`, `upgradesInfo`, `powersInfo`, `powerTargetCheck`, `buildingsInfo`, `statLine` | items, Outfitter, Drill Yard, Sanctum and buildings — see §11 (stream I) |
| `affixLine(data, affix)` | `"+4.5% critical chance"` |
| `modeList(data)` (from `js/sim/modes/index.js`) | the lobby's mode picker: `[{ id, name, desc, formats, defaultFormat, heroes, races, playable }]` (planned modes listed with `playable: false`) |
| `entName(state, data, ent)` | display name |

## 8. Data files (schemas)

All files carry a `_doc` string. The sim reads them only through `sim.data` (frozen).

- `data/econ.json` — clock, start, banners, bounty, rally, field (cap, length), tide stats,
  item steps, hero curve + `xpTable` + class multipliers. See the file's `_doc`.
- `data/units.json` — `traits{id:{desc, ehp}}`, `units{id:{race, name, tier, cost, income, hp, dps,
  bodies, armour, dmg, range, speed, leak, bounty, traits[], splitInto?, role, model}}` (GENERATED by `tools/build-roster.mjs`: 12 units per race, tiers 1-6; also `tiers` templates, `roles` words, `traits` with `desc`).
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
- `data/items-bl.json` + `data/shop.json` — built by `tools/build-items-bl.mjs`; `data/upgrades.json`, `data/powers.json`, `data/buildings.json` hand-written. Schemas in each file's `_doc` and §11.
- Player-facing names for gear slots: `GEAR_SLOTS` exported by `query.js` (weapon, off-hand, head,
  chest, hands, feet, neck, ring) and step names `GEAR_STEPS` (Plain … Legendary roll).
- Display rounding: `shared/format.js` (`hp`, `fmt`). Banners are fractional internally — show
  `Math.ceil(banners)`.

## 10. Portrait + icons (stream C)

Art modules the view and UI use. All take the game's own renderer — none opens a second WebGL context.

### 10.1 Models: `js/view/unit-looks.js` + `data/looks.json`

```js
import { loadLooks, createBodyFactory } from './view/unit-looks.js';
const looks = await loadLooks();                  // data/looks.json + units.json + avatar-3d data + Farhold warbands (read-only)
looks.forUnit('tuskback')  // { kind: 'creature', spec, variant, scale, race, tier, name }
looks.forHero('druid')     // { kind: 'chibi2', avatar, scale, hero: true }
looks.forRef('unit:levy' | 'hero:warrior')
const actor = await looks.build(look)  // { group, height, setAnim(clip, fade?, restart?), update(dt,t), metrics(), dispose(), kind, parts? }

looks.forHero('druid', { color: '#3f86ec' })   // heroes are Chibi 2, a few clothing slots in the player's colour (looks.json heroes.<id>.team)
looks.forForm('druid', 'wolf')                    // the creature a hero becomes in a shape (looks.json forms)
looks.forPet('grove_wolf')                        // a hero's summon (looks.json pets)

// stream B's actors.js:
import { makeTurret } from './view/engineer.js';
const bodies = createBodyFactory(looks, { scale: 1.3, fallback: capsuleBody, makeTurret,
  colorOf: ent => identity.slotColor(slotOf(ent.owner)), turretLevelOf: ent => rankOf(ent.owner, 'bolt_turret') });
await bodies.preload();                           // one of each body: warms Chibi 2 templates, learns heights
createActors({ scene, data, makeBody: bodies.makeBody, localTeam });
// on a `form` event:  actors.get(heroEntId).body.setForm(ev.form)      ('wolf' | 'briarback' | null)
// stealth (trait `stealth`, Briar Stalker): body.setGhost(!seenByAnyHeroOfThatField)
```

- `makeBody(ent, look, data)` returns `{ object, height, play(act, t), dispose(), setForm(id|null), setGhost(bool) }`
  synchronously; the model drops into `object` when its async build lands. Kinds: `hero` (ent.type = hero id),
  `unit`, `pet` (Grove Wolf), `turret` (Engineer's Bolt Turret: js/view/engineer.js at `turretLevelOf(ent)`,
  aims along `ent.face`, recoils on `act === 'attack'`; also `body.turret.setOvercharge(bool)`); tides go to `fallback`.
- Unit size by tier: data/looks.json `tierScale` (T1 1.0 → T6 1.5), times the look's own scale.
- `play(act, t)` maps the sim's `act` → clip: idle → ready, walk, attack, cast, stun → hit, dead.
- Models face +z. Creatures are folded by `avatar-3d/js/mesh-merge.js` (1–3 draw calls); a Chibi 2
  body is 2 draw calls (templates shared per identical look). Team identity stays a ground ring.
- `scale` (default 1.3) × each look's `scale` (T6 champions 1.5, heroes 1.35) gives world size; Chibi 2
  bodies are ~1.0–1.3 m before scale.

### 10.2 Live portrait: `js/view/portrait.js`

```js
import { createPortrait } from './view/portrait.js';
const portrait = createPortrait({ gfx: app.gfx, slot: bar.portraitSlot, looks });   // adds .live to the slot
bar.onSelect(id => portrait.showEnt(state.ents.find(e => e.id === id)));            // { kind, type } or null
portrait.react('hit');        // on damage to the shown entity; 'talk' | 'attack' | 'cast' too
portrait.dispose();           // on match end (removes its pass and canvas)
```

- Registers one `gfx.addPass` pass; renders ≤ 30 fps into the canvas square under the slot and copies it
  into a 2D canvas inside the slot (the bar is opaque, so a bare scissored viewport would be hidden).
- Split screen: one `createPortrait` per control bar. Each has its own little scene and actor.
- `showEnt` of the same `kind:type` again is free (no rebuild).

### 10.3 Icons: `js/view/icons.js`, `assets/icons/`

```js
import { createIconLibrary, createIconStudio } from './view/icons.js';
const icons = await createIconLibrary();          // reads assets/icons/index.json
icons.url('unit', 'levy')    // 'assets/icons/unit/levy.png' or null (synchronous; use in <img>)
icons.url('hero', 'druid'); icons.url('skill', 'firebolt'); icons.url('item', 'greatsword')
// optional runtime generation for anything not baked (previews only):
icons.attach(createIconStudio(app.gfx.renderer, { looks })); await icons.get('unit', 'newthing')
```

- Kinds and ids: `unit/<unit id>` (48), `hero/<hero id>` (5) + `hero/druid.wolf`, `hero/druid.briarback`,
  `skill/<skill id>` (every skill in data/heroes.json), `power/<power id>` (12 Sanctum powers, framed blue /
  red / gold by kind), `building/<race>.<kind>` (`keep`, `shop`, `barracks`, `drillyard`, `sanctum` per race),
  `gadget/turret_1..3`, `gadget/mine`, `item/<base>` (generic bases: sword, longsword, greatsword, axe, greataxe, mace,
  warhammer, spear, bow, staff, druid_staff, quarterstaff, wand, heater/kite/tower_shield, tome, quiver,
  plate_helm, leather_cap, hood, wizard_hat, plate_armour, chainmail, leather_armour, robe, boots,
  bracers, potion, oil, amulet, ring, scroll — `assets/icons/catalog.json`).
- 128×128 PNG, background and frame baked in (race tint for units, gold for heroes, element tint for
  skills). Scale down freely in CSS.
- Rebake after changing a look, a creature or the catalog: `flock /tmp/claude-1000/farhold-pw.lock node
  prototypes/bannerline/tools/bake-icons.mjs` (writes the PNGs + index.json). `icons.html` is the gallery
  and re-render tool for people.

### 10.4 Buildings: `js/view/structures.js` (+ `structures.html` preview)

```js
import { buildStructures } from './view/structures.js';
import { loadIdentity } from './view/identity.js';
const identity = await loadIdentity();
const world = buildStructures(scene, layoutFromMap(sim.map), { identity, buildings: Q.buildingsInfo(state, data),
  teams: [{ team: 0, race: 'freeholds', slot: 0 }, { team: 1, race: 'ashtusk', slot: 3 }] });
world.setBanners(team, fraction)              // same as terrain.js buildWorld: 14 poles, fall one by one (0.28 s apart), stay down
world.towns[team].barracks                    // also .shop (Outfitter), .drillyard, .sanctum
  // each: { id: 't0.barracks', kind, team, group, position (Vector3), radius (ring, m), useRadius (sim radius or null),
  //         setReady(bool), setHover(bool), update(dt) }
world.buildings()                             // all of them, flat (picking: distance to `position` < `radius`)
world.setReady(team, 'barracks', canAffordASend)   // ring pulses + the Barracks raises its tall banner and lights its windows
world.setHover(team, kind, bool)              // ring brightens (hero inside / cursor over)
world.flashPower(team, 'defensive' | 'offensive' | 'neutral')   // the Sanctum's matching orb pulses (on a `power` event)
world.update(dt); world.restyle(teams); world.dispose()
```

- A drop-in for `buildWorld` (same `layout`, `setBanners`, `update`, `dispose`); `world.fields[i]` = `{ team, group, keep, banners, town }`.
- Each race has its own style (data/identity.json `style`): Freeholds stone + slate, Ashtusk log palisade + hides
  + tusks, Unburied pale crypt + cyan lights, Thornmane hedge walls + living-wood towers. Walls, gatehouses (with
  portcullis + gate banners), the Keep (flag in the player's colour), the four buildings, the ford (water,
  stones, reeds) and props outside the walls are all race-themed.
- Every building has an interaction ring in the player's colour; the Outfitter's ring is the sim's 7 m shop radius.
- Single models for other screens: `makeKeep(identity, race, color)`, `makeOutfitter`, `makeBarracks`,
  `makeDrillYard`, `makeSanctum` (same args) and `MAKERS[kind]`.
- Cost: a field is ~10 draw calls (everything static is merged per material by the `Kit`), ~45k triangles.

### 10.5 Identity: `js/view/identity.js` + `data/identity.json`

`identity.slotColor(0..5)` (slots 0-2 = team 0 blues, 3-5 = team 1 reds), `teamColor(t)`, `race(id)` (palette,
emblem, style), `emblemCanvas(emblem)`, `bannerTexture(THREE, { race, color })`, `css()` (`--slot-N`, `--team-N`
for the UI). Rule: units are never recoloured — the slot colour goes on the ground ring, banners and hero
clothing; the team colour on HP bars.

### 10.6 Skill + power effects: `js/view/skillfx.js` + `data/skill-fx.json` (+ `skillfx.html` preview)

```js
const spells = await createSkillFx({ scene, camera: viewports[0].camera, actors, tickHz });  // actors.get(id) -> { x, z, height, group }
for (const ev of sim.drainEvents()) spells.onEvent(ev);   // cast, bolt, zone, zoneEnd, pulse, dash, trap, power, powerHit, status, heal, hit, form, remove/death
spells.update(dt);
```

Every hero skill (incl. the Druid's wolf abilities `throat_leap`, `rending_bite`, `pack_run`, `running_howl` and the
Engineer's kit) and every Sanctum power has a recipe; unknown skills fall back to shape + element. Statuses draw
looping auras on the body (`statuses` map). It draws the spell on top of stream B's gameplay markers (fx.js).

### 10.7 Sound: `js/view/sound.js`

```js
const sound = await createSound({ localPlayers: [myPlayerId], panOf: (x, z) => pan or null (off every view), entOf: id => ent, heroes: data.heroes });
sound.unlock();                       // on the first click / key / pad press
for (const ev of events) sound.onEvent(ev);
sound.ui('click' | 'hover' | 'open' | 'close' | 'error' | 'tab' | 'buy');
sound.result(won);                    // victory / defeat sting
sound.setVolume(v); sound.setMuted(b); sound.setBusVolume('sfx' | 'ui' | 'ambience', v);   // saved in localStorage
```

Sends, Pay, banners lost (leak), level up, casts and hits by damage type, powers, statuses, deaths by body,
items/sell/upgrade, rejects. Other players' sounds are quieter; one id at most every 70 ms, 10 starts a frame.

### 10.8 Engineer gadgets: `js/view/engineer.js`

`makeTurret({ level: 1|2|3, color })` → `{ group, height, aim(yaw), fire(), setOvercharge(bool), update(dt), dispose() }`
(timber ballista → stone-footed twin repeater → steel cannon with a glowing core); `makeMine({ color })` →
`{ group, setArmed(bool), blast(), update(dt) }`. The body factory builds turrets for `ent.kind === 'turret'`;
mines are drawn from `zone` events of skill `shrapnel_mine` (zone kind `trap`) — B places `makeMine()` at the zone.

### 10.9 Hunters vs Farmers art (stream C -> stream H's `js/view/hvf/`; preview `hvf-art.html`)

**Characters and creatures** (`js/view/unit-looks.js`, data `data/looks.json` `hvf`):
```js
looks.forRole('farmer', { color })    // Chibi 2: straw hat (band in the player's colour), apron smock, crook
looks.forRole('hunter', { color })    // Chibi 2: hood, strapped leathers, cloak, spear
const restore = applyGhost(actor.group, looks.ghostStyle());   // a downed farmer: translucent pale blue, glowing; restore() undoes
looks.forHvf('animals', 'sheep' | 'hen' | 'pig' | 'cow')     // creature looks (avatar-3d bl_sheep ...)
looks.forHvf('army', 'scarecrow' | 'crow'); looks.forHvf('pets', 'hound' | 'hawk')
await looks.build(look)               // a live actor: setAnim('idle'|'walk'|'run'|'graze'|'bleat'|'panic'|'attack'|'talk'|'dead')
```
**Animals in crowds** (`avatar-3d/js/creature-poses.js`): `await creaturePoses(looks.forHvf('animals', 'sheep').spec)` →
`{ idle, walkA, walkB, run, graze, bleat, attack, dead }` vertex-coloured BufferGeometries (~0.8-1.7k triangles), for
one InstancedMesh per (species, pose) with `MeshStandardMaterial({ vertexColors: true })` — fogify it. Alternate walkA/walkB
a few times a second while an animal moves; graze when idle at home; run/bleat on `flee` / `noise`.

**Buildings** (`js/view/hvf-structures.js`):
```js
const b = makeHvfBuilding(kind, { color, w, d, mask })   // kind = data/hvf/buildings.json kind, or kennel | lodge | watchstone | snare | grave | mine
// w/d metres = buildings.json size x 2; color = the owner's colour; mask = fence/wall/hedge neighbours (N1 E2 S4 W8, linkMask(cx, cz, same))
b.setProgress(0..1)   // buildStart -> built: scaffold, building rising
b.setDamage(0..1)     // smoke from 0.6, flames from 0.75
b.setReady(bool)      // Harvest Hall can train / a lodge or kennel ring
b.fire(yaw)           // Arrow Tower shot (archer turns, muzzle flash)
b.update(dt); b.radius; b.dispose()
hvfMaterials()        // the four shared materials: world.fogify() each once
linkedPiece('fence' | 'wall' | 'hedge', mask) / hvfBuildingGeometry(kind)   // { std, metal, glow, cloth } geometries for InstancedMeshes
```
Windmill sails turn; the tower has an archer; kennel/lodge carry the hunter's colour; graves carry the farmer's.

**Nature** (`js/view/hvf-nature.js`): `natureGeometries()` → `tree[look]` (0 oak, 1 pine, 2 birch = `map.look`) with
`near` (≤ 200 tris), `far` (≤ 40), `stump`, `log`; `rock[0..2]`, `briar`, `tuft`, `reeds`, `lily`, `fordStone`,
`cliffBoulder`, `rampEdge` — all one vertex-coloured geometry each, matching H's single `vegMat`. Or the whole layer:
```js
const layer = createNatureLayer(scene, map, { KIND, groundY, material: world.fogify(natureMaterial()) });
layer.update(camera, dt)        // 64 m chunks: frustum culled, near/far swap at 70 m (seed 3, 5v2: < 150 draws, < 700k tris)
layer.chop(cell, 0.5)           // being cut: shakes and leans;  layer.chop(cell, 1) -> stump + fallen log
layer.syncChopped(state.hvf.chopped)
```
**Icons**: `hvf-unit/<farmer|hunter|ghost|sheep|hen|pig|cow|scarecrow|crow|hound|hawk>`, `hvf-building/<kind>` (22),
`hvf-item/<data/hvf/hunter-items.json id>` (13) — `icons.url(kind, id)` as in §10.3.

## 11. Items, town buildings, unit upgrades, powers (stream I, owner round 2)

Owner rulings: six inventory slots with **no slot types**; simple stat items in the classic hero-arena
style; **duplicates never merge** — every copy takes a slot and every copy counts; a few items carry
`uniqueEquipped` and refuse a second copy; tiers by price only; no affixes, rolls, procs, uniques or
sets (kept data-driven so effects can return). Sends stay unlimited (the Barracks is the send building).

### 11.1 Buildings (`js/sim/buildings.js`, `data/buildings.json`)
Static geometry, not state (rebuilt from data + map + mode). One set per **team field**:
`{ id: 't<team>.<kind>', kind: 'shop'|'barracks'|'drillyard'|'sanctum', role, name, desc, team, field, x, z (world), radius, size: [w, d], door }`.
Names: **Outfitter** (shop, radius 7 — the hero must stand inside it to buy or sell; the hero spawns inside it),
**Barracks** (sends; `radius: null` = usable from anywhere), **Drill Yard** (unit upgrades, anywhere),
**Sanctum** (powers, anywhere). Positions are field-local per map in `layouts.<map>.default` (optionally
`modes.<mode>`), else `fallback` (relative to the Keep) — A's mode framework can add a layout per mode/map.
`buildingsFor(data, map, mode)`, `buildingOf(ctx, team, kind)`, `inBuildingRange(ctx, team, kind, x, z)`, `fieldAt(map, x, z)`.

### 11.2 Items (`js/sim/items.js`, `data/items-bl.json`, `data/shop.json`)
- `player.inv = [6 x { uid, id, charges } | null]`. Item rows: `{ id, name, category, tier (1-4 by price), price, icon (assets/icons item base), desc, stats: {stat: n}, statLines: [text], uniqueEquipped?, consumable?, charges?, use?: [{effect, ...}] }`.
- Stats (each with a handler, `STAT_HANDLERS`): `damage` (flat per basic attack), `attackSpeed` %, `critChance` %, `critDamage` %, `lifeSteal` % (any damage type), `spellPower` % (hero skill damage), `maxHp`, `armor`, `magicResist` % (fire + nature damage taken), `hpRegen` /s, `mana`, `manaRegen` /s, `moveSpeed` %, `cdr` %, `bountyPct` %. `caps` clamp sums.
- Use effects (`USE_EFFECTS`): `heal {pct}`, `mana {pct}`, `status {status, seconds, power?}`, `barrier {pct, seconds}`, `recall` (home to the field spawn).
- **Core contract** (what the rest of the sim reads): `gearStats(data, p)` -> the stat totals above + legacy zeros (`stepDps, stepHp, stepArmor, dmgPct, areaPct, vsChampion, resistAll, setPieces`) + `powers: []`; `refreshFromGear(ctx, p)`; `itemDamageFactor(ctx, src, dst, dmgType, opts)` (dealDamage); `atShop(ctx, p)` (alias `atArmory`); `armourClassFor` (hero default — items no longer change it); `lootForKill`; `tollMax`; no-op hooks `onBasicHit`, `castPowerMult` (1), `nearKeepFactor` (1).
- Drops (`items-bl.drops`): a kill of tier >= `minTier` in your field may hand the nearest defending hero a consumable from `pool`; a champion kill hands every defender a random item up to `champion.maxPrice` (sold for gold if there is no free slot).

### 11.3 Unit upgrades (`js/sim/upgrades.js`, `data/upgrades.json`)
Eight upgrades (Sharpened Steel damage, Battle Drills attack speed, Field Rations health, Riveted Plates armour,
Blood Oath life steal, Forced March move speed, Field Medics regeneration, Banner Breakers leak damage), each
`perLevel`, `max`, cost `base * grow^(level-1)`. They apply to **every unit the player sends, including the ones
already on the field**: `upgradeTick` (after `admitWaiting`) re-stamps `_spd`, `_dps`, `_atkEvery`, `hpMax`
(current health keeps its share) and `_leak` from the spawn values in `_up0` when `ent._upV !== player.upV`;
armour (`unitTakenFactor`) and life steal (`onUnitHit`) are read live in combat.js. No auto-buy.

### 11.4 Powers (`js/sim/powers.js`, `data/powers.json`)
12 powers, 4 per kind. `defensive` (Frost Field, Binding Roots, Mending Light, Stone Ward) only inside your team's
field; `offensive` (Skyfall, Withering Hex, Loose the Pack, War Banner) only inside an enemy field; `neutral`
(Far Sight, Thunderstorm, Earthshaker, Blessing of Valour) inside any field. Effects (`POWER_EFFECTS`): `zone`,
`status` (who: enemies | enemyHeroes | allyHeroes | ownUnits), `heal`, `barrier`, `blast` (with `delay` -> timer
`power`), `summon` (caster's units, no bounty, no income), `reveal` (status `revealed`; traits.js isHidden honours it).
Damage from powers has no hero source. Per-power cooldown (`player.powerCd`), gold is the main limit.

### 11.5 Query helpers (`js/sim/query.js`) for the UI
| Helper | Returns |
|---|---|
| `buildingsInfo(state, data)` | every building (11.1) for drawing + the minimap |
| `shopInfo(state, data, pid)` | `{ atShop, gold, columns, sellFactor, tabs: [{ id, name, desc, items: [ItemCard + {canBuy, reason}] }] }` |
| `itemCard(data, id)` | `{ id, name, desc, stats: [lines], price, tier, category, icon, uniqueEquipped, consumable, charges, sell }` — the tooltip |
| `inventoryInfo(state, data, pid)` | `{ slots: [ItemView | null] x6, size, free, totals: {stat: n}, totalLines, armourClass, atShop }` |
| `itemView(state, data, pid, slot)` | ItemCard + `{ uid, slot, chargesLeft, sellNow, canSell, sellReason, canUse, useReason }` |
| `upgradesInfo(state, data, pid)` | `{ rows: [{ id, name, desc, icon, stat, level, max, cost (null at max), canBuy, reason, stats: [per level, current], total }], spent }` |
| `powersInfo(state, data, pid)` | `{ kinds, rows: [{ id, name, desc, stats, kind, kindName, icon, cost, cooldown (ticks), readyIn, canBuy, reason, radius }] }` |
| `powerTargetCheck(state, data, pid, id, x, z)` | null or the refusal for a cast cursor (`ownFieldOnly` …) |
| `statLine(data, stat, value)` | "+20 damage" / "+12% attack speed" |

Removed with the old gear: `GEAR_SLOTS`, `GEAR_STEPS`, `SLOTS`, `gearInfo`, `affixLine`, the `upgrade` "buy cheapest" path,
Requisition, champion picks, Oil, the potion belt (`potion`/`drink`; draughts are Outfitter consumables now).


## 12. Online play (stream D, M5) — `js/net/`, full write-up in `docs/online.md`

```js
import { createTransport, cleanRoomCode, NET_MESSAGES } from './net/transport.js';
import { createRoom, joinRoom, beginMatch } from './net/lobbysync.js';
import { createNetClock } from './net/netclock.js';

const t = await createTransport('peerjs');                     // 'channel' between tabs (tests), 'loopback' (node)
const room = await createRoom({ transport: t, name, dataHash: data.hash, format: '2v2' });   // host; room.code
const room = await joinRoom({ transport: t, code: cleanRoomCode(typed), name, dataHash: data.hash });
// errors: e.code 'version' | 'full' | 'no-room' | 'timeout' | 'taken'; show e.message (plain language)
room.on('change', state => render(state));                     // state: interfaces below
room.claim('1-0', { local: 0, name, race, hero, device });     // one call per local (couch) player
room.update(key, { race, hero }); room.ready(key, true); room.release(key);
room.setSlot('1-1', { kind: 'ai', difficulty: 'veteran' });    // host
room.configure({ mode: 'linewar', format: '3v3' });            // host
room.on('start', packet => {                                    // host: room.start() fires it too
  const match = beginMatch(room, packet, { data, createSim, restoreSim, now: () => performance.now(),
                                          onEvent: (type, e) => banner(type, e) });
  const clock = createNetClock({ lockstep: match.lockstep, tickMs: packet.tickMs });
  clock.attachVisibility(document);
  // match.localPlayers: [{ pid, local, device, name }] — which sim players this machine's seats are
});
room.backToLobby();   // host, after results; seats kept, ready cleared
```

`room.state = { code, hostId, phase: 'lobby'|'match', mode, format, map, slots: [{ key, team, index, kind:
'open'|'human'|'ai'|'closed', owner (machine id), local, name, race, hero, device, ready, difficulty }], machines:
[{ id, name, ping, hidden, host }] }`. A `human` slot with `owner === room.me` is one of this machine's seats.

In the match: `clock.frame(dt, takeCommands)` exactly like the local clock; **`clock.sim` is the sim to draw
and read every frame** (a resync / rejoin replaces it). `clock.waitingFor` = `[{ name, hidden }]` → "Waiting
for Radley (tab hidden)". Lockstep events through `onEvent`: `takeover` / `rejoin` (`{ name, players, atTick }`
→ "Radley left — an AI takes over at 1:42"), `hostLeft` ("Host left — match ended"), `desync` / `resync`
(debug), `status`. Speed and pause are fixed online. Sim events `takeover` / `release` (`{ player }`) mark a
seat changing hands. Rejoin: `joinRoom({ ..., rejoinToken })` then `beginMatch(room, room.rejoin.packet,
{ ..., rejoin: room.rejoin })`; keep `{ code, token }` (`packet.machines[].token` of this machine) in
sessionStorage so a reload can rejoin.

## 13. Campaign (stream F, PLAN §13) — "Banners of the Vale"

Missions are data (`data/campaign/index.json` + one file per mission; format in the header of
`js/sim/campaign.js`). The script runs INSIDE the sim: `createSim({ ...mission.config, seed, campaign: mission })`
(use `campaignSession(mission).config` from `js/ui/campaign.js`, players included — a `scripted` seat has no AI
and no player). State: `state.campaign` (progress, plain data) + `state.campaignMission`. Results: the normal
`state.result` (`reason: 'objectives'` or `'time'` for mission endings). Events: `objective { id, text, optional }`,
`say { who, text }`, `mission { outcome: 'won'|'lost', stars }`. Query: `campaignInfo(state, data)` →
`{ name, objectives: [{ id, text, optional, star, done, have, need, counted }], log, outcome, stars, maxStars, timeLimit }`.
UI (`js/ui/campaign.js`, stream F): `loadCampaign()`, `campaignProgress()` (localStorage), `createCampaignScreen`,
`createCampaignOverlay` (call `update(sim)` each frame), `showDebrief`. `campaign.html` is a 2D preview that
plays any mission with the real sim (`?mission=w1_first_banner&speed=8`).

## 12. Hunters vs Farmers (stream H) — sim contract for the view / UI / AI

Design: `docs/hvf-PLAN.md`. Mode entry `js/sim/modes/hvf/index.js` (default export in linewar.js's shape;
`commands`, `phases`, `createState`, `buildMap(data, format, config)`, `queries`). Data: `data/hvf/*.json`
(`data.hvf.<name>`). Until the registry hooks land (requests.md "Stream H"), `tests/hvf-helpers.mjs` runs the
mode exactly like `js/sim/sim.js` does.

- **Map** (`sim.map`, static, from `mapgen.js`): `{ size, cols, rows, cell: 2, cells (KIND), level (0/1), look,
  doors, graph {nodes, edges}, hollows [{id, x, z, r, cells, entry, level, door, mouth, name, slots}], features,
  commons, kennels, metrics }`. `KIND`: grass 0, trail 1, tree 2, briar 3, tallgrass 4, rock 5, water 6, ford 7,
  cliff 8, ramp 9. The live grid (chopped cells + building footprints) is `grid.js liveGrid(ctx)`.
- **State**: teams `[farmers(0), hunters(1)]`; players `{ role, gold, income, ent, ghost, out, copies, upgrades,
  cd, inv (hunters), level, xp }`; ents `kind`: `farmer | hunter | animal | building | army | ward | snare | hawk |
  hound` (plain JSON; `px/pz` for interpolation). `state.hvf = { chopped, vision[2], explored[2] (bitsets, 32
  cells per int), seen[2], tracks, graves, flares, turn, turnWhy, releaseTick, endTick }`.
- **Commands** (`{p, type, ...}`): `move {x,z}` (walks as close as the ground allows), `stop`, `build {kind,x,z}`,
  `chop {cell}`, `attack {target}` (hunter; target must be visible), `revive {target: pid}`, `rally {building,x,z}`,
  `cast {slot}` (farmer Q Scamper / W Lie Low / E Bell; hunter Q Pounce / W Snare / E Hawk / R Horn, with `x,z`),
  `pullup {target}` (ward/snare), `upgrade {id}` (feed/shears/breeding/stuffing), `train {unit, building}`,
  `order {ids, kind: move|amove|attack|stop, x?, z?, target?}`, `buy {id}` / `sell {slot}` / `use {slot, x?, z?}`
  (hunter, at a lodge), `ward {x,z}`, `lodge {x,z}`, `surrender`. Refusals: `bad, role, dead, kennel, reach,
  blocked, gold, onePer, needs, cap, max, cooldown, level, unseen, notAtShop, uniqueEquipped, group, full,
  notUsable, none, over`.
- **Events**: `built, buildStart, lost, animalBorn, animalKilled, flee, noise {x,z,kind,heard:[pid]}, chopped,
  hit, attack, spear, shot, farmerDown {grave}, reviveStart, farmerRevived, respawn, hunterDown, hunterOut,
  released, gold, upgrade, item, sell, use, cast, bell, lyingLow, pounce, snareSet, snared, snarePulled,
  wardPlanted, wardPulled, flare, horn, levelUp, spawn, despawn, turn {value, reason}, reject, result`.
- **Queries** (`js/sim/modes/hvf/query.js`, `q` = a sim or `{state, data, map}`): `clock`, `farmerInfo`,
  `buildMenu` (cost, income, payback s, tell 0-3), `buildCheck` (placement ghost), `farmUpgrades`, `armyInfo`,
  `hunterInfo` (skills + cooldowns, snares, wards, items, tracking), `hunterShop`, `sideInfo`, `turnInfo`,
  `visibleAt / exploredAt / visibleEnt` (the view hides what `visibleEnt` says no to), `fogBits`,
  `visibleTracks`, `seenBuildings`.
