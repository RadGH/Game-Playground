// Thousandvale — PROJECTILES (owner feedback 8: W14 "Firebolt should have a projectile, not instant damage — it's a
// bolt", W2 "brigand archers hit at range with no projectile"). Pure.
//
// The rules always flew these (Farhold's fireBolt / onArrowLand / onEnemyShoot), but at 48 / 42 / 40 m/s: at fighting
// distance the flight was 4-6 frames, so the number appeared with the cast and a monster's arrow was never seen. This
// module owns the speeds (data/rules/projectiles.json) and what every projectile event carries, for skills, weapon
// attacks and monsters alike:
//
//   fx { kind: 'bolt' | 'arrow' | 'shot', id, from: {x,z}, to: <entity id> | {x,z}, ms, speed, proj, home?: 1, skill }
//
// A player's projectile HOMES (decided simply, as the owner asked): it lands on its target wherever the target stands when it
// arrives, and if the target died on the way it strikes where the target fell — it never picks a new victim.
// A MONSTER's shot does not (play-test 12 #78, `monsterAim`): it flies at a point and can be stepped out of.
// `engine.projectiles` is null on a parity engine: Farhold's own speeds and aimed-at-a-point arrows are kept there.

const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);

/** The table an engine carries (null = Farhold's behaviour). */
export function buildProjectiles(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  return {
    minMs: num(cfg.minMs, 200),
    skill: { default: num(cfg.skill?.default, 21), byElement: { ...(cfg.skill?.byElement || {}) }, byId: { ...(cfg.skill?.byId || {}) } },
    basic: { default: 26, ...(cfg.basic || {}) },
    monster: { default: 19, ...(cfg.monster || {}) },
    special: { ms: num(cfg.special?.ms, 160) },
    // play-test 12 (#78): a monster's shot flies at a point (monster-ai.js shoot); absent = the old homing shot
    monsterAim: cfg.monsterAim && typeof cfg.monsterAim === 'object' ? {
      home: !!cfg.monsterAim.home,
      lead: Math.max(0, Math.min(1, Number.isFinite(+cfg.monsterAim.lead) ? +cfg.monsterAim.lead : 0.3)),
      radius: num(cfg.monsterAim.radius, 1.1),
      leadByRole: Object.fromEntries(Object.entries(cfg.monsterAim.leadByRole || {}).filter(([, v]) => Number.isFinite(+v)).map(([k, v]) => [k, Math.max(0, Math.min(1, +v))])),
    } : null,
    proj: { default: cfg.proj?.default || 'orb', byElement: { ...(cfg.proj?.byElement || {}) }, byId: { ...(cfg.proj?.byId || {}) }, basic: { ...(cfg.proj?.basic || {}) } },
  };
}

/** Metres a second for a SKILL's bolt. */
export function skillSpeed(P, skillId, element) {
  return num(P.skill.byId[skillId], num(P.skill.byElement[element], P.skill.default));
}
/** Metres a second for a WEAPON's own attack (`wt` = items.json subtype: bow, crossbow, wand, staff…). */
export function basicSpeed(P, wt) { return num(P.basic[wt], P.basic.default); }
/** Metres a second for a MONSTER's shot. */
export function monsterSpeed(P, element) { return num(P.monster[element || 'physical'], P.monster.default); }

/** Flight time in SECONDS over `dist` metres at `speed`, never under the floor. */
export function flightOf(P, dist, speed) { return Math.max(P.minMs / 1000, dist / speed); }

/** What the client draws. */
export function projOf(P, { skillId = null, element = 'physical', wt = null } = {}) {
  if (skillId && P.proj.byId[skillId]) return P.proj.byId[skillId];
  if (wt && P.proj.basic[wt]) return P.proj.basic[wt];
  return P.proj.byElement[element] || P.proj.default;
}

/** The extra fields every projectile event carries. `speed` is what `ms` was worked out from. */
export function projFields(P, { speed, proj, home = false, skill = null }) {
  return { speed: Math.round(speed * 10) / 10, ...(proj ? { proj } : {}), ...(home ? { home: 1 } : {}), ...(skill ? { skill } : {}) };
}
