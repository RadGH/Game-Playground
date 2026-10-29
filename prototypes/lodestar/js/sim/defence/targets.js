// THE damage rule (PLAN §0.7) — the only place it is decided. PURE. Every attacker (enemies, towers, blasts, fire,
// spells) asks `canDamage` before it hurts anything, and every hit goes through `hurt`.
//
// Enemies attack and can damage only:
//   * PRODUCTION buildings (buildings.json tag `production`)
//   * MILITARY buildings (tag `military`: towers, posts, sensor masts, the HQ) and the walls and gates
//   * FIGHTING units (kind `squad`, M5)
//   * DELIVERY VEHICLES WHILE THEY TRAVEL (kind `vehicle` with a route — porters and carts on the move). A vehicle row
//     with `protected: 'moving'` (trains, M10) is the other way round: it can be hit only while it is standing.
// Never: roads, bridges, rails (vectors), depots, porters' huts, cart sheds (tag `infra`), houses and town services
// (tag `town`), builders and settlers (kind `worker`, vehicle rows tagged `town`), salvage piles, unfinished sites.
// Fire and our own spells and shells follow the physics: they may hurt the same things (our own production and
// military buildings, walls, units, moving carriers) plus enemies and nests — but never infrastructure.
//
// A target is an entity (building, vehicle, worker, squad, pile, nest, enemy) or a wall piece { kind: 'section',
// wall, i } (a 4 m wall section or a gate), or a vector ({ kind: 'road'|'rail'|'cliff' }).

/** The class the rule reads for a target. */
export function classOf(sim, t) {
  if (!t) return null;
  if (t.kind === 'section') return 'military';
  if (t.kind === 'road' || t.kind === 'rail' || t.kind === 'cliff' || t.kind === 'wall-vector') return 'infra';
  if (t.kind === 'building') {
    if (t.built < 1) return 'site';
    return sim.data.B[t.type]?.tag || 'infra';
  }
  if (t.kind === 'depot' || t.kind === 'station') return 'infra';
  if (t.kind === 'squad') return 'unit';
  if (t.kind === 'vehicle') {
    const row = sim.data.V[t.type];
    if (row && row.tag === 'town') return 'town';
    const moving = !!t.route || t.state === 'moving';
    if (row?.protected === 'moving') return moving ? 'vehicle-shielded' : 'vehicle';
    return moving ? 'vehicle' : 'vehicle-standing';
  }
  if (t.kind === 'worker') return 'worker';
  if (t.kind === 'pile') return 'pile';
  if (t.kind === 'nest') return 'nest';
  if (t.kind === 'enemy') return 'enemy';
  return null;
}

/** Which classes each side may damage. Read by the tests as THE table. */
export const RULE = {
  enemy: new Set(['production', 'military', 'unit', 'vehicle']),
  own: new Set(['production', 'military', 'unit', 'vehicle', 'enemy', 'nest']),
};

/** Can `source` damage `t`? source.team 1 = an enemy; anything else is ours (a tower, a blast, fire, a spell). */
export function canDamage(sim, t, source = { team: 1 }) {
  if (!t || t.removed) return false;
  const cls = classOf(sim, t);
  if (!cls) return false;
  if (t.kind === 'section') {
    const s = t.wall?.sections?.[t.i];
    if (!s || s.state !== 'up') return false;
  }
  if (t.kind === 'building' && t.type === 'hq' && sim.defence?.crippledUntil > sim.tick) return false; // already down
  if (t.kind === 'building' && t.type === 'hq' && sim.defence?.over) return false;
  return (source.team === 1 ? RULE.enemy : RULE.own).has(cls);
}

/**
 * Hurt `t` by `amount` hit points from `source` ({ team, kind: 'bite'|'acid'|'bolt'|'round'|'shell'|'blast'|'fire'|'spell',
 * x?, y?, by? }). Checks the rule, then hands the hit to whoever owns that kind of thing. Returns the damage done.
 */
export function hurt(sim, t, amount, source = { team: 1 }) {
  if (!(amount > 0) || !canDamage(sim, t, source)) return 0;
  const D = sim.defence;
  if (t.kind === 'section') return D.walls.damage(t.wall, t.i, amount, source);
  if (t.kind === 'building') return D.damageBuilding(t, amount, source);
  if (t.kind === 'vehicle') return D.damageCarrier(t, amount, source);
  if (t.kind === 'enemy') return D.enemies.damage(t, amount, source);
  if (t.kind === 'nest') return D.nests.damage(t, amount, source);
  if (t.kind === 'squad') {
    // M5 owns squads: it registers sim.hooks.unitHurt(squad, amount, source) → damage done
    for (const f of sim.hooks.unitHurt || []) return f(t, amount, source);
    t.hp = Math.max(0, t.hp - amount);
    return amount;
  }
  return 0;
}
