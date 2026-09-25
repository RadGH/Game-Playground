# Damage Meter (`meters/`)

A Skada-style combat meter as a library any game can feed: **bars per fighter → click a bar for that fighter's sources
(weapon, skill, damage-over-time, proc, legendary effect) → click a source for every single hit** with crit, overkill,
damage type, target, absorbed amount and notes (blocked, killing blow). Modes: damage done, healing done, damage taken.
Scope: one fight, or every fight of the run merged. Per-item stats (kills, damage, hits, crits) are kept across fights so
a game can say "that sword has 12 kills".

## Use
```js
import { Meter } from './meters/js/meter.js'; import { renderMeter, METER_CSS } from './meters/js/meter-ui.js';
const m = new Meter(); m.startFight('goblin_patrol');
m.record({ t: 1.2, source: 'brannoc', sourceName: 'Brannoc', target: 'goblin_1', targetName: 'Goblin', kind: 'damage',
           amount: 23, overkill: 4, crit: true, dtype: 'physical', via: 'skill:cleave', viaName: 'Cleave', itemId: 'i_ab12', killingBlow: false, tags: ['blocked'] });
m.endFight();
m.report('damage')            // [{ id, name, total, dps, hits, crits, overkill, pct, sources: [{ name, total, hits, avg, max, critPct, dtype, hitsList }] }]
m.report('taken', 'all')      // damage taken, every fight
m.itemStats['i_ab12']         // { kills, damage, hits, crits }
renderMeter(m, containerEl, state)   // state remembers mode / scope / drill level between renders
```
Record fields: `t` (seconds or round number), `source/target` ids + names, `kind` damage|heal|absorb, `amount` (after mitigation),
`overkill`, `crit`, `dtype` (physical, fire, arcane, holy, bleed, poison, shadow, void…), `via` (attack | skill:id | dot:type | proc:id | legendary:id | thorns),
`viaName`, `itemId` (the weapon or implement responsible, for per-item kill counts), `killingBlow`, `absorbed`, `tags`.

Serialises with `JSON.stringify(meter)` / `Meter.fromJSON()` (last 2000 records per fight are kept). `simulateFight(rng)` makes demo data.

## Demo
`index.html`: simulate fights, drill down, see weapon stats. Emberveil 2 (`prototypes/emberveil/`) uses the same component in its Meter tab.

## v2 detail (2026-09-11)
- Record kinds: `damage` (with `blocked`, `mitigated` by armour, `absorbed` by barriers, `overkill`), `heal` (with `overheal`), `absorb` (a barrier soaked a hit), `miss` (dodged/missed, tags say which), `status` (a status applied: `status`, `duration`), `death`.
- Modes: Damage done · Healing · Damage taken (dodged / blocked / absorbed / mitigated split per fighter and per attacker source) · Absorbs · Statuses (who applied what) · Deaths.
- Per-target breakdown under each fighter ("On: Goblin 1 84 (2 kills) · …"), a 20-bucket damage-over-time sparkline per bar, and the summary line (misses, blocked, absorbed, overheal, statuses, deaths) in the header.
- Emberveil 2 feeds all of it from `js/combat.js` (`applyDamage` records blocked/absorbed/mitigated; misses, statuses and downs are recorded by the UI hook).

## Ideas / limits
- No per-round table yet; the sparkline is the only time view.
- "Damage taken" attributes DoT ticks to the status source, so a dead caster's burn still credits them.
