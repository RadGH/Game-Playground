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
| `cast` | `id, slot, skill, shape, x, z, face, radius, arc, reach, range, delay, line` | a hero cast a skill. `shape` per PLAN §6.3. For `ground`, `x,z` is the landing point (already clamped to range); `delay` > 0 = it lands that many ticks later (draw a warning marker); `line` > 0 = a line that long across the aim (`face` + 90°), half-width `radius` |
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
| `dash` | `id, fromX, fromZ, toX, toZ, skill` | a hero leapt (Tracker's Leap); `px/pz` already equal the new spot, tween it yourself |
| `trap` | `zone, x, z, radius` | a snare sprang (zone kind `'trap'`) |
| `form` | `player, form, id` | a hero took (`form: 'briarback'` or `'wolf'`) or left (`null`) a shape: swap the body to the `form.body` of the skill that grants it (`briarback_shape`, `wolf_shape` in heroes.json). In a shape the other skills are replaced (heroInfo skills show the new names) |
| `spawn` (kind `turret`) / `remove` (why `expired`) | — | an Engineer's Bolt Turret was built / ran out (or was taken down by a new one past the 1/2/3 limit) |
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
    keep:  { x, z, w, d },         // Keep footprint centre + size
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

// stream B's actors.js:
const bodies = createBodyFactory(looks, { scale: 1.3, fallback: capsuleBody });
await bodies.preload();                           // one of each body: warms Chibi 2 templates, learns heights
createActors({ scene, data, makeBody: bodies.makeBody, localTeam });
```

- `makeBody(ent, look, data)` returns `{ object, height, play(act, t), dispose() }` synchronously; the
  model drops into `object` when its async build lands. Heroes are `ent.kind === 'hero'` (ent.type = hero
  id), units `kind === 'unit'`; anything else (tides) goes to `fallback`.
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

- Kinds and ids: `unit/<unit id>` (24), `hero/<hero id>` (4), `skill/<skill id>` (every skill in
  data/heroes.json), `item/<base>` (generic bases: sword, longsword, greatsword, axe, greataxe, mace,
  warhammer, spear, bow, staff, druid_staff, quarterstaff, wand, heater/kite/tower_shield, tome, quiver,
  plate_helm, leather_cap, hood, wizard_hat, plate_armour, chainmail, leather_armour, robe, boots,
  bracers, potion, oil, amulet, ring, scroll — `assets/icons/catalog.json`).
- 128×128 PNG, background and frame baked in (race tint for units, gold for heroes, element tint for
  skills). Scale down freely in CSS.
- Rebake after changing a look, a creature or the catalog: `flock /tmp/claude-1000/farhold-pw.lock node
  prototypes/bannerline/tools/bake-icons.mjs` (writes the PNGs + index.json). `icons.html` is the gallery
  and re-render tool for people.

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

