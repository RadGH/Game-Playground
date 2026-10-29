// The one place a spell (or a spell's fire) hurts something (PLAN §0.7, M6). PURE.
//
// M4 owns THE damage rule (js/sim/defence/targets.js). This file is the thin call point every spell goes through, so
// when M4's rule is wired the spells obey it with no other change:
//   * once M4's rule is installed — `sim.defence.hurt(target, amount, source)` (a bound call of targets.js `hurt`) or
//     `sim.hooks.damage(target, amount, source)` — it decides and applies; this file only asks, with
//     source = { team: 0, kind: 'spell', spell, x, y };
//   * until then the rule here is the §0.7 table for OUR OWN magic: spells follow the physics and may hurt wild
//     creatures, fighting units and your own PRODUCTION and MILITARY buildings — never infrastructure (roads, bridges,
//     rails, depots, stations), houses or town services, and never the carriers (porters, carts, builders).
//   * a building only loses hit points once it has real ones (M4 gives buildings `hpMax` > 1); until then a hit on
//     one is counted (`sim.mana.stats.buildingHits`) and nothing else happens.
// `how` = { spell, x, y } — M4's rule and M11's juice read it.

export const SPELL_HURTS_TAGS = new Set(['production', 'military']);

/** May our own magic hurt this entity at all? (§0.7 for spells.) */
export function canSpellHurt(sim, t) {
  if (!t || t.removed) return false;
  if (t.kind === 'enemy' || t.kind === 'nest' || t.team === 1) return true;
  if (t.kind === 'squad') return true;
  if (t.kind === 'building') return SPELL_HURTS_TAGS.has(sim.data.B[t.type]?.tag);
  return false; // vehicles, workers, piles, deposits, crystals, satellites, stations…
}

/** Hit `target` for `amount` hit points. Returns the damage done. */
export function harm(sim, target, amount, how = {}) {
  if (!target || !(amount > 0)) return 0;
  const by = { team: 0, kind: 'spell', by: 'spell', ...how };
  if (typeof sim.defence?.hurt === 'function') return sim.defence.hurt(target, amount, by) || 0;
  if (typeof sim.hooks.damage === 'function') return sim.hooks.damage(target, amount, by) || 0;
  if (!canSpellHurt(sim, target)) return 0;
  if (target.kind === 'building') {
    sim.mana.stats.buildingHits++;
    if (!(target.hpMax > 1)) return 0;
  }
  const was = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  const done = was - target.hp;
  if (target.kind === 'squad' && target.str !== undefined && target.hpMax > 0) target.str = target.hp / target.hpMax;
  sim.dirty.add(target.id);
  if (target.hp <= 0 && target.kind === 'enemy') {
    sim.ents.remove(target.id);
    sim.events.push({ e: 'destroyed', tick: sim.tick, base: sim.base, id: target.id, type: target.type, name: target.type, x: Math.round(target.x / 256), y: Math.round(target.y / 256), by: 'spell', spell: by.spell });
  }
  sim.mana.stats.damage += done;
  return done;
}

/** Wild things (team 1) with hit points, in id order. Enemies arrive with M4; tests use dummies of kind `enemy`. */
export function wildOnes(sim) {
  return sim.ents.list('enemy').filter((e) => e.team === 1 && e.hp > 0 && !e.removed);
}
