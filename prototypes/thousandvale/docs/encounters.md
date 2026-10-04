# Encounters — telegraphs, boss scripts and arena objects

How a fight is scripted. The engine is `js/rules/encounter.js` (stream C). It runs on the server and
gives the same result for the same room seed. The data lives in `data/encounters/`; stream E writes the
content and stream C owns the format.

- **Check your data:** `node --test prototypes/thousandvale/tests/C/encounter.test.mjs`. Its last test
  runs `validateEncounters` over every file listed in `index.json`.
- **Worked examples:** `packleader.json` (an elite), `briar_colossus.json` (a zone boss) and
  `barrow_warden.json` (the M1 dungeon boss).

## 1. Files

`data/encounters/index.json`:

```json
{ "files": ["packleader.json", "..."],          // one script per file
  "specials": "specials.json",                    // ordinary monsters' telegraphed attacks
  "defaults": { "boss": { "instance": "barrow_warden", "wilds": "briar_colossus", "any": "barrow_warden" },
                "elite": { "any": "packleader" } },
  "byType": { "kirrath_cinderwyrm": "some_script" } }   // a monster type that always runs a script
```

**Which script a monster runs**, first match wins:
1. the camp or spawn sets `data.encounter: "<id>"` (A passes `e.data` through);
2. `byType[monsterType]`;
3. `defaults.boss[roomKind]` for rank `boss`, or `defaults.elite[roomKind]` for `elite`;
4. no script: the monster uses `specials` for its `family/role`, then its family, then its role, then
   `any`.

Rank scales specials (`RANK_SCALE`): a champion (elite) gets 1.3× damage, 1.2× shape size, a shorter
wind-up, a shorter cooldown, and `extraPerRank` more copies of a telegraph. A rare gets more of all of
that. A script's numbers are used exactly as written.

## 2. A script

```json
{
  "id": "barrow_warden",                   // must match the key used in defaults/byType
  "name": "The Barrow Warden",
  "hpMult": 4,                             // × the monster's normal health (bosses are tanky)
  "arena": { "radius": 26, "objects": [ … ] },   // see §5; coordinates are relative to the boss's home
  "say": { "pull": "…", "death": "…", "reset": "…" },   // a string, or a list (one picked at random)
  "enrage": { "seconds": 360, "damage": 3, "say": "…",
              "soft": { "from": 240, "every": 15, "add": 0.08, "say": "…" } },
  "abilities": { "<id>": { … } },          // see §3
  "phases": [ … ],                         // see §4
  "triggers": [ … ],                       // see §6
  "onDeath": [ actions ]
}
```

- **Enrage:**
  - **Hard:** at `seconds` from the pull, damage is multiplied by `damage`, it attacks faster, and
    cooldowns drop to 60%.
  - **Soft:** from `from`, every `every` seconds, adds `add` to the damage multiplier.
- **Wipe:** if nobody alive is within `arena.radius + 10` m for 4 s, the boss resets. Its health refills,
  it goes back to phase 0, the arena objects and adds go away, and it says its `say.reset` line.

## 3. Abilities

```json
"grave_cross": {
  "id": "grave_cross", "name": "Grave Cross",
  "every": [14, 17],        // cooldown in seconds: a number, or [min, max] rolled each time
  "first": 5,               // seconds after the phase starts before its first use (default: one cooldown)
  "range": 30, "minRange": 0, "below": 0.5,   // use only within range / beyond minRange / below 50% health
  "cast": 0.8,              // a cast bar (seconds); the boss stands still while casting
  "interrupt": true,        // a stagger or an interrupting hit during the cast breaks it
  "onInterrupt": [ actions ],
  "move": false,            // true = it can move while casting
  "say": "Lines of grave-light split the floor!",   // {target} and {boss} are filled in
  "telegraphs": [ … ],      // see below
  "melee": { "damage": 1.3 },                       // a plain hit on the target (no telegraph)
  "stackOn": { "id": "grave_rend", "name": "Grave Rend", "takeMore": 0.12, "max": 6, "seconds": 18,
               "swapAt": 3, "say": "{target} is torn open — swap!" },   // a tank-swap debuff
  "actions": [ actions ]    // run when it goes off
}
```

### Telegraphs

A telegraph is shown on the ground for `wind` seconds, then **resolves against whoever is inside at
that moment**. Leaving before then is a dodge.

| Field | Meaning |
|---|---|
| `shape` | `circle` (r) · `ring`/`donut` (r outer, r2 inner) · `cone` (r, arc in radians) · `line` (len, w) · `cross` (r per arm, w) |
| `at` | `target` (the boss's target) · `self` · `home` + `offset: [dx, dz]` · `point` + `offset` from the boss · `random` (`count` different players) · `each` (one per player) · `farthest` · `scatter` (random points within `spread` m of home) · `object` (on every arena object of type `object`) |
| `wind` | Seconds before it resolves (default 1.5). Specials are scaled by rank. |
| `kind` | `harm` (default: everyone inside is hit) · `stack` (damage shared; fewer than `need` inside makes it hurt more) · `soak` (needs `need` players inside, or everybody in the arena takes `fail` damage) · `safe` (everyone **outside** every safe shape cast together is hit) |
| `damage` | A multiple of the monster's normal hit. Goes through Farhold's own hit roll, so armour, resistances, block and dodge all apply. |
| `element`, `status`, `statusPower` | The damage element, and a status left on whoever is hit (any status id from Farhold's `skills.json`, or `{ "id": …, … }` to override fields). |
| `knock` / `pull` | Shoves victims this many metres away from the centre (`pull: true` pulls them in instead). |
| `taunt` | Victims gain this many seconds of taunt on the boss. |
| `los` | Line of sight: anyone with a blocking object (pillar, rock) between them and the caster is spared, and that object takes a crack. |
| `breaks` | Damages arena objects inside the shape. |
| `leave` | An object left behind where it resolves, e.g. `{ "type": "rock", "hp": 2 }` (falling rocks become cover). |
| `follow` | With `at: "each"` or `"random"`: the shape rides its player until it resolves (spread mechanics). |
| `count`, `delay`, `after` | Number of copies, the stagger between them, and an initial delay (chains, sequences). |
| `rotate`, `grow`, `jitter`, `lead` | Per copy: turn by `rotate` radians, grow by `grow` × r, scatter by ± `jitter` m. `lead` aims ahead of a moving target. |
| `yaw` | `"facing"`, `"random"` or a number. By default it aims from the caster toward the target. |
| `extraPerRank` | Specials only: extra copies per rank step. |
| `failSay`, `missed` | The soak's failure line, and actions when a stack catches nobody. |

## 4. Phases

```json
"phases": [
  { "name": "The Vigil", "abilities": ["rend", "cleave"] },                 // phase 0 starts at the pull
  { "name": "The Ward", "at": 0.7, "say": "…", "abilities": ["rend"],         // below 70% of THIS bar
    "shieldWhileAdds": true, "shieldDown": "…",                               // the shield drops when the adds die
    "onEnter": [ { "shield": true }, { "adds": { "type": "barrow_hound", "count": 3, "radius": 8 } } ] },
  { "name": "Unbound", "newBar": { "hp": 0.6 }, "abilities": [ … ] }          // a NEW health bar
]
```

- `at` phases start when the current bar falls below that share, in order. A huge hit doesn't skip any.
- A `newBar` phase starts when the previous bar would have **died**. Health becomes `hp` × the boss's
  scripted health and statuses are cleared. The client gets `phase` with the new `hpMax`.
- Only the last bar's death is real.

## 5. Arena objects

They spawn at the pull, relative to the boss's home. Each is a room entity (`kind: 'object'`,
`data.rules: true`, `type` as below), so every client sees it. The room routes `use` on one to
`rules.useObject(e, obj)`.

| type | Fields | Behaviour |
|---|---|---|
| `pillar` | `r`, `hp` (default 2) | Blocks line of sight. Loses 1 hp per blast it blocks, and when it breaks `onBreak` runs. |
| `rock` | `r`, `hp` | Like a pillar; usually left by a `leave`. |
| `brazier` | — | `use` lights it, once. Counted by triggers (`lit`). |
| `lever` | `repeat` | `use` pulls it, once unless `repeat`. Runs `onUse`. |
| `pool` | `r`, `every`, `damage` / `heal` / `status`, `seconds`, `boss: [actions]` | Ticks on players inside, and runs `boss` actions when the boss stands in it (lure it out of a sap pool). |

## 6. Triggers and actions

```json
"triggers": [ { "when": { "lit": 3, "addsDead": true, "phase": 1 }, "do": [ actions ], "once": true } ]
```

**`when` conditions** (all must hold):
- `lit: n` — n braziers lit (`of` = another type or key)
- `used: "<key>"`
- `broken: n` — n pillars broken (`of`)
- `addsDead: true`
- `phase: n` — at least phase n

**Actions** (in `onEnter`, `onUse`, `onBreak`, `onInterrupt`, ability `actions`, `do`):

| Action | Effect |
|---|---|
| `{ "say": "…", "style": "yell" \| "emote" \| "warn" }` | A call-out |
| `{ "adds": { "type", "count", "radius", "level", "rank", "at": "home" } }` | Spawn adds |
| `{ "shield": true \| false }` | Turn the shield on or off |
| `{ "vuln": { "takeMore": 0.5, "seconds": 12, "name" } }` | The boss takes more damage |
| `{ "stun": seconds }` | Stun the boss, breaking its cast |
| `{ "hurt": 0.06 }` | The boss loses that share of its health |
| `{ "heal": 0.12 }` | The boss heals that share |
| `{ "modifier": "<Farhold modifier id>" \| { … } }` | Apply a Farhold monster modifier |
| `{ "ability": "<id>" }` | Use an ability now |
| `{ "object": { …spec } }` | Add an arena object |
| `{ "remove": "<key or type>" }` | Remove arena objects |
| `{ "reset": "<key or type>" }` | Unlight braziers / reset levers |
| `{ "phase": n }` | Jump to phase n |
| `{ "taunt": radius }` | Taunt the boss onto players within radius |

## 7. Events (the wire)

Each event is an `ev` entry with `type` set to the name below. The room adds `x, z` where missing, and
routes events to everyone whose view covers that spot.

| `type` | Fields | Client |
|---|---|---|
| `tele` | `id, s` (caster), `ab` (ability id), `k` (kind), `ms` (wind-up), `shape, x, z, yaw?, r?, r2?, arc?, len?, w?`, `el?`, `follow?` (entity id) | Draw the zone (red for harm, gold for safe, blue for stack/soak) and fill it over `ms`. If `follow` is set, keep it under that entity. |
| `teleR` | `id, hits:[ids]`, `x:1` if cancelled | Flash and remove it. |
| `castbar` | `id, ab, name, ms, int?` (1 = interruptible) | A cast bar over the monster's nameplate. |
| `castX` | `id, ab, why` (`interrupt`, `stun`, `phase`, `reset`) | Break the cast bar. |
| `phase` | `id, n, name?, bar, hpMax?` (a new bar), `reset?` | Phase banner, and a new health bar when `hpMax` is present. |
| `say` | `id, text, style` (`yell` \| `emote` \| `warn`) | A call-out on screen and in the chat log. `warn` is a centre-screen warning. |
| `enrage` | `id, soft?` (stack count), `hard?` | An enrage banner. |
| `obj` | `id, state` (`idle` \| `lit` \| `used` \| `broken`), `hp?`; when first spawned also `otype, x, z, r, key?`; `gone: 1` when removed | Update the arena object's look. |
| `fx` | `kind: 'shield'`, `id, on` | The shield bubble. |
| `boss` | On engage: `id, name, title?, bars, phases:[{n, name, at, bar}], enrageMs?, arena:{x, z, r}`; on the end: `id, end:1, won` | The boss bar's shape (D's ask). `at` is the health share a phase starts at within its bar (1 for a phase that starts a new bar). |

**`obj` uses `otype`, not `type`, for the object's kind**, because `type` is the event's own key. On a real room
object the same name is also in `info.type`.

## 8. Writing a good one (rules of thumb)

- Every hit worth dodging has a telegraph of at least 0.8 s. Give anything one-shotting at least 1.5 s
  and a call-out.
- Say what to do, not what it is called: "hide behind a pillar!", "stand close!", "spread out!".
- A phase should change what players *do*: a new kind of mechanic, not just more damage.
- Every phase needs at least one ability the tank can always face, so the fight never stops.
- Test new content with `validateEncounters`. The dodge rule is enforced by tests, so authors don't have
  to check it by hand.
