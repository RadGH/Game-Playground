// Where to go next (owner, 2026-11-11: "need to give direction to a first time player because I couldn't figure out
// where to go and no portals were active"). Pure. From the current main-quest step, the act map's links (data/acts.json)
// and the markers of the area you stand in, pick ONE place to walk to: the open portal in town, the exit or dungeon
// entrance in a zone, the next floor down. The client draws a gold arrow at the hero's feet toward it and a beam over it.
//   guideTarget(content, ch, area, step) -> { x, z, kind, label, hint } | { hint } | null
export const baseOf = id => String(id || '').replace(/_\d+$/, '');
export const floorOf = id => +(/_(\d+)$/.exec(String(id || ''))?.[1] || 1);
const TOWN = 'brightwater';

/** The same rule the server uses (js/sim/realm.js unlocked), so the arrow never points at a portal that refuses you. */
export function portalOpen(content, ch, id) {
  if (id === TOWN) return true;
  const act = content.acts?.[0], order = act?.nodes?.filter(n => n.kind === 'zone').map(n => n.id) || [];
  if (order[0] === id) return true;
  if ((ch?.waypoints || []).includes(id) || (ch?.unlocked || []).includes(id)) return true;
  const after = act?.nodes?.find(n => n.id === id)?.portalAfter; if (!after) return false;
  const steps = (act?.mainQuests || []).filter(q => q.node === after || q.node?.startsWith(after));
  const Q = ch?.quests || {};
  return steps.length > 0 && steps.every(q => Q[q.id]?.done);
}
/** Shortest walk over the act map's links (node ids), or null. */
function route(content, from, to) {
  const nodes = content.acts?.[0]?.nodes || [], byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const nb = id => { const out = new Set(byId[id]?.links || []); for (const n of nodes) if ((n.links || []).includes(id)) out.add(n.id); return [...out]; };
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) { const c = q.shift(); if (c === to) break; for (const n of nb(c)) if (!prev.has(n)) { prev.set(n, c); q.push(n); } }
  if (!prev.has(to)) return null;
  const path = []; for (let c = to; c != null; c = prev.get(c)) path.unshift(c);
  return path;
}
const nameOf = (content, id) => content.zones?.[id]?.name || content.acts?.[0]?.nodes?.find(n => n.id === id)?.name || id;
const dir = (from, m) => { if (!from) return ''; const dx = m.x - from.x, dz = m.z - from.z, a = Math.atan2(dx, -dz) * 180 / Math.PI;
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((a + 360) % 360) / 45) % 8]; };

export function guideTarget(content, ch, area, step, me = null) {
  if (!area || !step) return null;
  const r = step.rule || {}, cur = area.id, goal = r.node || step.node; if (!goal) return null;
  const markers = area.markers || [];
  const go = (m, label) => ({ x: m.x, z: m.z, kind: m.kind, to: m.to, label, hint: `${label}${dir(me, m) ? ` (${dir(me, m)})` : ''}` });
  // already there
  if (cur === goal) {
    if (r.kind === 'reach') { const m = markers.find(x => (x.kind === 'exit' || x.kind === 'entrance') && x.to === r.to); if (m) return go(m, `Reach the way to ${nameOf(content, r.to)}`); }
    if (r.kind === 'boss') return { hint: `${content.monsters?.[r.boss]?.name || 'The boss'} is somewhere on this floor` };
    if (r.kind === 'kill') return { hint: 'Defeat the monsters here' };
    return null;
  }
  // same dungeon, another floor
  if (baseOf(cur) === baseOf(goal) && cur !== TOWN) {
    const down = floorOf(goal) > floorOf(cur);
    const m = markers.find(x => (x.kind === 'entrance' || x.kind === 'exit') && baseOf(x.to) === baseOf(goal) && (down ? floorOf(x.to) > floorOf(cur) : floorOf(x.to) < floorOf(cur)));
    if (m) return go(m, down ? 'Go deeper' : 'Go back up');
  }
  const path = route(content, baseOf(cur) === baseOf(goal) ? goal : (cur === TOWN ? TOWN : baseOf(cur)), baseOf(goal));
  if (cur === TOWN) {
    // the furthest open portal along the way
    const nodes = path ? path.slice(1) : [baseOf(goal)];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const m = markers.find(x => x.kind === 'portal' && x.to === nodes[i]);
      if (m && portalOpen(content, ch, nodes[i])) return go(m, `Take the portal to ${nameOf(content, nodes[i])}`);
    }
    return null;
  }
  // in a dungeon floor below the first, on the way out: climb first
  if (floorOf(cur) > 1 && baseOf(cur) !== baseOf(goal)) { const m = markers.find(x => (x.kind === 'entrance' || x.kind === 'exit') && floorOf(x.to) < floorOf(cur) && baseOf(x.to) === baseOf(cur)) || markers.find(x => x.kind === 'exit'); if (m) return go(m, 'Head back out'); }
  const next = path?.[1];
  if (next) {
    const m = markers.find(x => (x.kind === 'exit' || x.kind === 'entrance') && (x.to === next || baseOf(x.to) === next));
    if (m) return go(m, `${m.kind === 'entrance' ? 'Enter' : 'Travel to'} ${nameOf(content, next)}`);
  }
  return { hint: 'Open the map (M) or use your recall portal to get back to town' };
}
