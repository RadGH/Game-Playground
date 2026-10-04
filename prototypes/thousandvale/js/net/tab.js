// Tab targeting order (stream A; for the client, PLAN §7). Pure.
//   tabNext(mirror, me, current, { range = 40, hostile = true, facing = me.yaw, arc = Math.PI })
//     -> the next entity id to target, or 0
// Candidates: living entities in range (monsters when `hostile`, else players), never objects or me.
// Order: things in front (within `arc` of facing) before things behind, nearest first; each press moves
// to the next one after `current`, wrapping round.

const STATE_DEAD = 1;

export function tabOrder(mirror, me, { range = 40, hostile = true, facing = me.yaw ?? 0, arc = Math.PI } = {}) {
  const out = [];
  for (const e of mirror.ents.values()) {
    if (e.id === me.id || e.kind === 'object' || (e.state & STATE_DEAD) || e.hp === 0) continue;
    if (hostile ? e.kind !== 'monster' : e.kind !== 'player') continue;
    const dx = e.x - me.x, dz = e.z - me.z, d = Math.hypot(dx, dz);
    if (!(d <= range)) continue;
    let a = Math.atan2(dx, dz) - facing;
    a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    out.push({ id: e.id, d, front: a <= arc / 2 ? 0 : 1 });
  }
  out.sort((p, q) => p.front - q.front || p.d - q.d || p.id - q.id);
  return out.map(o => o.id);
}

export function tabNext(mirror, me, current = 0, opts = {}) {
  const order = tabOrder(mirror, me, opts);
  if (!order.length) return 0;
  const i = order.indexOf(current);
  return order[(i + 1) % order.length];
}
