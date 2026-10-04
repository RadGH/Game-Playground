# js/rules — Thousandvale's combat core (stream C)

Every number in a Thousandvale fight comes from **Farhold's own code**, imported unchanged. This folder
holds the parts that could not be imported — the orchestration inside Farhold's `main.js` closure and
`actors.js` (Three.js and HUD code mixed in) — forked over plain `{x, z}` positions, plus what an MMO
adds: rooms, a threat table, party targeting, Tab targeting.

Pure and server-safe: no Three.js, DOM, storage, fetch, `Math.random`, `Date.now` or timers. `boot.js` is
the one exception, and it only reads the data files once at load. `tests/C/purity.test.mjs` enforces this.
It runs the same under Node (server), in a Web Worker (offline play) and on the client.

## Files

| File | What it is | Forked from / reads |
|---|---|---|
| `index.js` | **`createRules(host, opts)`**, the room interface (docs/protocol.md §7). It syncs room entities ↔ combat units and turns field events into protocol events. Loads the data with a top-level await. | — |
| `farhold.js` | The **only** import door into Farhold/Emberveil (rpg, skills, skillmech, weapons, effects, uniques, foci, talents, ground, combat-feel, rng). | shared, unchanged |
| `boot.js` / `data.js` | Which data files we read (Farhold + Emberveil JSON, untouched) and how (fetch or fs). | — |
| `engine.js` | `createEngine(data, {seed, levelCap})`: Farhold's `Rpg` booted as `main.js` boots it (uniques + foci added in memory, combat/weapon tuning, an explicit level cap). One engine per process. | main.js ~299, ~439, ~785 |
| `rng.js` | Named seeded streams (`streams.get('combat'|'loot'|'spawn'|'bars')`) and the room clock. | Emberveil mulberry32 |
| `room.js` | The **room context**. `room.run(fn)` swaps the room's own skillmech `world` (traps, posts, walls, corpses), skillmech `ENV` and the skills.js status hooks into Farhold's module slots, then swaps them back out. | skillmech.js / skills.js globals |
| `field.js` | Who stands where and what a strike shape hits: `strike` (cone/line), `strikeArea`, `strikeSegment`, `land` (credit, threat, knockback, stagger), `kill`, `bleed`, `sunder`. Emits events, draws nothing. | actors.js `EnemyField` |
| `monster-ai.js` | `spawnMonster`, `tickMonsters`, `monsterStrike`, ranged shots, `applyModifier`, boss phases, leash. Targets come from the threat table. | actors.js `add`/`update`/`spread`, main.js `onEnemyStrike`/`onEnemyShoot` |
| `threat.js` | Threat from damage and healing, the 110%/130% switch rule, taunt, forget, a threat meter. | new (Farhold has none) |
| `character.js` | `createCharacter` (class kit as Farhold's `begin()` hands it out, plus Farhold's skill bar) and `serializeGear`/`restoreGear`. | main.js ~843 |
| `cast.js` | `createCombat(room)`: **basic attacks** (melee pattern clock + wind-up, bow draw, crossbow/javelin, wand bolt, staff tap/charge + charged forms), status landing, **kill rewards** (shared tagging, xp, gold, loot with `uid`), the tick. | main.js `swingWith`, `onArrowLand`, `landStatus`, `onEnemyKilled` |
| `cast-skills.js` | **Skills**: the plan comes from Farhold's skill bar; this file carries it out (beam/ground/line/repeats/dash/self/melee/around/bolt), plus afterCast (taunt, barrier, heal, revive, cleanse, link, selfBuff, place, pool, burst, wall), placed objects, pools, links, kill rules, and on-hurt events (counter, burst, reflect, link share). | main.js `castSkill`/`fireBolt`/`dropPool`, skillrun.js |
| `targeting.js` | Tab targeting: `tabOrder`, `nextTarget`, `validTarget` (hostile or friendly lists). | new |
| `terrain-flat.js` | The terrain interface every walker reads, as a flat stand-in for tests. | — |

`terrain-read.js` belongs to stream B and `dungeon-tiers.js` to stream E. The purity rule applies to both, but the import rule doesn't.

## Using it outside the room

```js
import { createEngine } from './engine.js';           // data from loadRulesData(readJson)
import { createRoomContext } from './room.js';
import { attachField } from './field.js';
import { createCombat } from './cast.js';
const room = createRoomContext({ id: 'r1', seed: 7, engine });
attachField(room, { terrain });
room.combat = createCombat(room);
room.run(() => room.combat.attack(ch, { yaw }));      // ALWAYS inside room.run
```

## What the MMO changes (PLAN §6.2)

- **Threat**: damage ×`threatMult`. Healing adds 50%, split across the monsters already fighting whoever was healed. A taunt forces the target and lifts the taunter to 110% of the top. A monster only switches targets when someone passes 110% of its current target's threat (melee) or 130% (ranged).
- **Allies** = the caster's party (`partyId`) in the room. A `self` heal/buff/barrier/cleanse with a friendly `target` lands on that ally. `healPets` heals the party. `revive` raises dead party members within 30 m. `link` (Sworn Ward / Sworn Guard) binds to a party member.
- **Leash**: 40 m from home, or 8 s with no damage dealt or taken while out of reach of its target. Either one sends the monster home to heal. It doesn't think at all when nothing friendly is within 200 m.
- **Rewards**: everyone who did damage gets XP, gold and their own loot roll. In a room these go to `host.award` and a `loot` event.

## Parity (tests/C)

`farhold-oracle*.mjs` run Farhold's **real** EnemyField, skill bar and skill runtime under Node, using Farhold's three-loader and mock timers. The `main.js` code they need is copied out line for line. Each fixture runs both sides with the same seeds and checks that hp, statuses, positions, cooldowns, drops, XP and the rng state agree **every frame**:

| Fixture | Covers |
|---|---|
| `parity-attack` | Warrior and rogue basic attacks across 18 seed/level combinations, including crits, splash, drops and XP. |
| `parity-monster` | The moor hound pack's brain over 300 ticks × 4 seeds, plus a fight-back where the pack dies. |
| `parity-skills` | **Knight (tank), cleric (healer), warrior (melee), pyromancer (caster)**: every skill on the bar, each after a basic attack, with monsters, placed objects, pools and delays all running. |
| `parity-ranged` | Staff tap and every charge length (fire/ice/shadow), wand, shortbow draws, crossbow. |

`drift.test.mjs` hashes every Farhold block that is copied out (17 blocks). When Farhold edits one, the test goes red and names the Thousandvale file to update.

## Not ported yet (each is refused or skipped with a reason, never silently)

- **Summons and shape forms** (`summon`, `form`, `howl`, `command`, pet taunts) need the follower system (M2). Casting them is refused with "…arrive with followers (M2)", and a temporary summon such as Guardian Light lists `summon` in `result.pending`.
- **Not ported**: channels, rewind, afterimage, mimic, `again`, `empowerRepeat`, clusters, corpse bursts, imbue, ward, counter (as cast effects), `allyStatus`, bolt `returns`/`ricochet`/`split`. These are listed in `PENDING_KEYS` and reported in `result.pending`.
- **Unique attack powers** (`resolveAttack`: chain, slam, echo, twin…) and `uniquesAfterDamaged` aren't ported. Parity characters don't carry uniques.
- **Building sieges, leader escorts and routs** (warbands), and swinging at placed banners/posts are partly ported: taunting walls and posts work.
- The other 26 classes are M2. Most of their skills already run through the same pipeline; a parity fixture per class is the remaining work.

## Farhold findings (left as they are in Farhold; reported to the lead)

1. **Stealth never worked.** `EnemyField.update(dt, player, …)` is handed the *controller* as `player`, and the notice range reads `player.derived.stealth`, which is always undefined, so every cloak's stealth does nothing. Thousandvale reads the real sheet, so stealth works here.
2. **The staff's charged "mortar" does nothing extra.** main.js gives it a 1.4× radius and a 3 s ground pool, then throws it through `fireBolt`, which reads neither. We copy this exactly for parity.
3. **A melee skill borrows the last basic swing's shape** (`feel.swing.strike`): that weapon's traits, armour pierce, and its knockback when the skill has none of its own. Thousandvale keeps this per player (`ch.lastStrike`).
4. **One shared world for traps, walls and corpses** (skillmech `world`) is what `room.js` exists to split. The parity oracle has to `mech.reset()` between fixtures, because otherwise one fixture's Rampart still stands in the next.
