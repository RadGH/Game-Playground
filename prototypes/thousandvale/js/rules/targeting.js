// Thousandvale — TAB TARGETING (PLAN §7), pure, so the client's Tab key and the server's check
// agree. Farhold has no Tab target (its target bar follows the crosshair, js/targetpick.js); an MMO
// needs one for spells that want a target.
//
//   nextTarget(list, me, { current, range, arc, hostile })   the next body to cycle to
//   validTarget(me, t, { range, hostile })                   may a cast name this body?
//
// `list` is anything iterable of { id, x, z, dead?, dying?, side?/team? }. Order: everything inside
// the forward arc (nearest first), then everything else in range (nearest first); Tab steps through
// that list from the current target, wrapping, so pressing Tab repeatedly visits every enemy.

export const TAB = { RANGE: 40, ARC: Math.PI * 0.75 };

const alive = t => t && !t.dead && t.dying == null && !t.removed;
/** hostile to `me`: a different `team` (room entities) or `side` (combat units) */
export const isHostile = (me, t) => (me.team != null && t.team != null ? me.team !== t.team : (t.side ?? 'foe') !== (me.side ?? 'friend'));

export function tabOrder(list, me, { range = TAB.RANGE, arc = TAB.ARC, hostile = true } = {}) {
  const front = [], rest = [];
  for (const t of list) {
    if (t === me || t.id === me.id || !alive(t) || t.kind === 'object') continue;
    if (hostile !== isHostile(me, t)) continue;
    const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz);
    if (d > range) continue;
    let off = Math.atan2(dx, dz) - (me.yaw || 0);
    off = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
    (off <= arc / 2 ? front : rest).push({ t, d });
  }
  front.sort((a, b) => a.d - b.d || String(a.t.id).localeCompare(String(b.t.id)));
  rest.sort((a, b) => a.d - b.d || String(a.t.id).localeCompare(String(b.t.id)));
  return [...front, ...rest].map(o => o.t);
}

export function nextTarget(list, me, { current = null, ...opts } = {}) {
  const order = tabOrder(list, me, opts);
  if (!order.length) return null;
  const i = current == null ? -1 : order.findIndex(t => t.id === current);
  return order[(i + 1) % order.length];
}

export function validTarget(me, t, { range = TAB.RANGE, hostile = null } = {}) {
  if (!alive(t)) return false;
  if (hostile != null && hostile !== isHostile(me, t)) return false;
  return Math.hypot(t.x - me.x, t.z - me.z) <= range;
}
