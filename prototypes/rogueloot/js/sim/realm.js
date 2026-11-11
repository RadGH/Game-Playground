// A game session (ruling 32): one world per AREA (town, zones, dungeon floors), created the first time someone walks
// in, kept for the whole session (monsters and chests stay dead until the next game, ruling 25). Party members can be
// in different areas at once. Pure; the hub (server or solo Worker) owns one realm per room.
//   const R = createRealm({ seed, content });  R.join(pid, character) -> world   R.travel(pid, act) -> { ok } | { err }
//   R.worldOf(pid)   R.step()   R.forEachWorld(fn)
// Travel (ruling 33/34): waypoints you have touched (from a waypoint), portals in town (unlocked zones), zone exits
// and dungeon entrances (by walking into their marker), and each hero's own reusable recall portal.
import { createWorld, addPlayer, removePlayer, rescaleFoes, step as stepWorld, initResource } from './world.js';
import { hashStr } from './rng.js';
import { createTrades } from './trade.js';
import { questReach } from './quests.js';

export const TOWN = 'brightwater', REACH = 4.5;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createRealm({ seed = 1, content, start = null, difficulty = 'normal' }) {
  const worlds = new Map(), where = new Map();
  const startArea = start || (content?.zones?.[TOWN] ? TOWN : Object.keys(content?.zones || {})[0] || null);
  function world(area) {
    if (!worlds.has(area)) worlds.set(area, createWorld({ seed: (seed ^ hashStr(area || 'none')) >>> 0, content, zone: area, difficulty }));
    return worlds.get(area);
  }
  const worldOf = pid => worlds.get(where.get(pid)) || null;
  /** A hero enters the session (in town, or a starting zone in tests). */
  function join(pid, ch, area = startArea) {
    const w = world(area); addPlayer(w, pid, ch); where.set(pid, area);
    touchWaypoint(w, w.players.get(pid));
    return w;
  }
  function leave(pid) { trades.drop(pid); const w = worldOf(pid); if (w) removePlayer(w, pid); where.delete(pid); }
  /** Move a hero object from one area to another, at a point there. */
  function move(pid, area, at) {
    const from = worldOf(pid), p = from?.players.get(pid); if (!p) return { err: 'Not here.' };
    const to = world(area);
    if (from !== to) { from.players.delete(pid); for (const f of from.foes.values()) { f.threat.delete(pid); if (f.target === pid) f.target = null; } rescaleFoes(from, from.players.size); }
    p.x = at.x; p.z = at.z; p.target = null; p.autoOn = false; p.cast = null; p.queue.length = 0; p.moving = false; p.fx = (p.fx || []).filter(f => f.kind === 'hot' || f.kind === 'mot' || f.kind === 'stance');
    if (from !== to) {
      to.players.set(pid, p); rescaleFoes(to, to.players.size); initResource(to, p);
      // companions travel with their hero
      for (const [k, a] of [...(from.allies || [])]) if (a.owner === pid) { from.allies.delete(k); to.allies ||= new Map(); a.x = at.x + 1.5; a.z = at.z + 1.5; a.target = null; to.allies.set(k, a); }
    }
    where.set(pid, area);
    p.travelSeq = (p.travelSeq || 0) + 1;                  // the browser drops its prediction when this changes
    to.events.push({ k: 'arrive', t: pid, area });
    touchWaypoint(to, p);
    return { ok: true, area };
  }
  const markersOf = area => world(area).area.markers || [];
  const arrival = (area, from) => {
    const m = markersOf(area);
    const back = from && m.find(x => (x.kind === 'exit' || x.kind === 'entrance') && x.to === from);
    const pick = back || m.find(x => x.kind === 'start') || m.find(x => x.kind === 'waypoint') || { x: 0, z: 0 };
    // stand a little off the marker so walking in does not bounce you straight back out
    return back ? { x: back.x + (back.ax ?? 0), z: back.z + (back.az ?? 3) } : { x: pick.x, z: pick.z };
  };
  function touchWaypoint(w, p) {
    if (!p) return;
    for (const m of w.area.markers || []) if (m.kind === 'waypoint' && dist(p, m) < REACH) {
      const id = m.id || w.area.id, ch = p.char;
      if (!(ch.waypoints || []).includes(id)) { p.char = { ...ch, waypoints: [...(ch.waypoints || []), id], unlocked: [...new Set([...(ch.unlocked || []), w.area.id])] }; w.charDirty.add(p.id); w.events.push({ k: 'waypoint', to: p.id, id, name: m.label || w.area.name }); }
    }
  }
  /** Is a zone open to this hero? The town, the first zone of the act, waypoints touched, and zones reached on foot. */
  function unlocked(ch, area) {
    if (area === TOWN || area === startArea) return true;
    const order = content.acts?.[0]?.nodes?.filter(n => n.kind === 'zone').map(n => n.id) || Object.keys(content.zones || {});
    if (order[0] === area) return true;
    if ((ch.waypoints || []).includes(area) || (ch.unlocked || []).includes(area)) return true;
    const node = content.acts?.[0]?.nodes?.find(n => n.id === area), after = node?.portalAfter;
    if (!after) return false;
    const steps = (content.acts?.[0]?.mainQuests || []).filter(q => q.node === after || q.node?.startsWith(after));
    return steps.length > 0 && steps.every(q => ch.quests?.[q.id]?.done);
  }
  /** a.via: waypoint | portal | exit | recall. */
  function travel(pid, a) {
    const w = worldOf(pid), p = w?.players.get(pid); if (!p) return { err: 'Not here.' };
    if (p.dead) return { err: 'You are dead.' };
    const here = w.area.id, ch = p.char, near = kind => (w.area.markers || []).find(m => m.kind === kind && dist(p, m) < REACH && (!a.to || m.to === a.to || kind === 'waypoint'));
    if (a.via === 'recall') {
      if (here !== TOWN) {                                          // open your portal here and step through to town
        const back = { area: here, x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
        p.char = { ...ch, recall: back }; w.charDirty.add(pid);
        w.events.push({ k: 'recall', s: pid, x: back.x, z: back.z });
        return move(pid, TOWN, recallSpot());
      }
      if (!ch.recall || !content.zones?.[ch.recall.area]) return { err: 'Your portal is not open.' };
      if (dist(p, recallSpot()) > REACH) return { err: 'Walk to your portal.' };
      const back = ch.recall; p.char = { ...ch, recall: null }; w.charDirty.add(pid);
      return move(pid, back.area, { x: back.x, z: back.z });
    }
    if (a.via === 'waypoint') {
      if (!near('waypoint')) return { err: 'Stand at a waypoint.' };
      const to = String(a.to || ''); if (!content.zones?.[to]) return { err: 'No such place.' };
      if (to !== TOWN && !(ch.waypoints || []).includes(to)) return { err: "You haven't found that waypoint yet." };
      const wp = markersOf(to).find(m => m.kind === 'waypoint') || arrival(to);
      return move(pid, to, { x: wp.x + 2, z: wp.z + 2 });
    }
    if (a.via === 'portal') {
      const m = near('portal'); if (!m) return { err: 'Stand in a portal.' };
      const to = m.to; if (!content.zones?.[to]) return { err: 'That way is not open yet.' };
      if (!unlocked(ch, to)) return { err: 'That way is not open to you yet.' };
      return move(pid, to, arrival(to));
    }
    if (a.via === 'exit') {
      const m = near('exit') || near('entrance'); if (!m) return { err: 'Nothing leads on from here.' };
      const to = m.to; if (!content.zones?.[to]) return { err: 'That way is not open yet.' };
      p.char = { ...ch, unlocked: [...new Set([...(ch.unlocked || []), to])] }; w.charDirty.add(pid);
      questReach(w, p, here, to);
      return move(pid, to, arrival(to, here));
    }
    return { err: 'unknown travel' };
  }
  function recallSpot() { const t = world(TOWN).area, m = (t.markers || []).find(x => x.kind === 'waypoint') || t.spawn; return { x: m.x - 3, z: m.z + 3 }; }
  /** Step every area someone is in (empty areas wait, frozen, until someone comes back). */
  function step() {
    const busy = new Set(where.values());
    for (const [area, w] of worlds) {
      if (!busy.has(area)) continue;
      stepWorld(w);
      // walking onto a waypoint registers it; walking into an exit is travel (the browser asks with 'travel')
      if (w.tick % 10 === 0) for (const p of w.players.values()) touchWaypoint(w, p);
    }
  }
  const forEachWorld = fn => { for (const [area, w] of worlds) fn(w, area); };
  const self = { difficulty, seed, content, worlds, where, world, worldOf, join, leave, travel, move, step, forEachWorld, unlocked, recallSpot, get startArea() { return startArea; } };
  const trades = createTrades(self); self.trades = trades;
  return self;
}
