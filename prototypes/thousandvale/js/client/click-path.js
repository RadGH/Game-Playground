// Click-to-move that goes ROUND things (play-test 11, Z38 — live #39: "if you click on a point to walk somewhere it
// [should use] pathfinding instead of walking straight there. So many times I get stuck on the corner of a collision").
//
// The planner is the monsters' own (js/rules/pathfind.js: weighted A* on a 2 m grid, no corner cutting, string-pulled to
// a few waypoints) run over the SAME "can I stand here" answer the movement step uses (js/sim/movement.js stepMove):
// nav SOLID / BUILDING — after Z37 that is round trees and rocks — plus ground that is off the map or too steep. Deep
// water is swum, so it is not a wall here either. Pure: no three, no DOM.
//
//   const route = createRouter(terrain)            // terrain = the client's stitched terrain (world-stream.js)
//   route(from, to) -> { pts: [{x, z}…] (ends at `to`), reached }      (straight [to] when nothing is in the way)
//   const walker = createWalker()                  // the waypoint follower controls.js runs each sim step
//   walker.steer(self, goal, route, now) -> { x, z } to walk toward, or null (arrived / gave up)

import { plannerBlocked, findPath, clearLine } from '../rules/pathfind.js';
import { moveKind } from '../sim/movement.js';
import { NAV } from '../rules/terrain-read.js';

const BLOCK = NAV.SOLID | NAV.BUILDING;

/** A "terrain" the planner reads, made fresh for each plan (its cell cache must not outlive a zone load). */
function planTerrain(terrain) {
  return {
    blocked(x, z) {
      if (terrain.nav && (terrain.nav.at(x, z) & BLOCK)) return true;
      const k = moveKind(terrain, x, z);
      return k === 'out' || k === 'steep';
    },
  };
}

export const ROUTE = Object.freeze({ maxNodes: 6000, arrive: 0.6, stuckMs: 1100, stuckGain: 0.35, replans: 4 });

export function createRouter(terrain) {
  return function route(from, to) {
    if (!terrain || !from || !to) return { pts: [{ x: to.x, z: to.z }], reached: true, straight: true };
    const blk = plannerBlocked(planTerrain(terrain));
    if (!blk) return { pts: [{ x: to.x, z: to.z }], reached: true, straight: true };
    if (clearLine(blk, from.x, from.z, to.x, to.z)) return { pts: [{ x: to.x, z: to.z }], reached: true, straight: true };
    const r = findPath(blk, from.x, from.z, to.x, to.z, { maxNodes: ROUTE.maxNodes });
    const pts = (r.pts || []).map(p => ({ x: p.x, z: p.z }));
    const last = pts[pts.length - 1];
    // the planner ends on a cell middle (or as near as it got): finish on the spot that was clicked when it is reachable
    if (r.reached && (!last || Math.hypot(last.x - to.x, last.z - to.z) > 0.05)) pts.push({ x: to.x, z: to.z });
    if (!pts.length) pts.push({ x: to.x, z: to.z });
    return { pts, reached: !!r.reached, straight: false, used: r.used };
  };
}

/**
 * Follows a goal's waypoints. Plans on the first step (it needs to know where you are), drops a waypoint when you are
 * within `arrive` of it, and plans again when you stop getting closer (a body nudged off the line, a gate that shut).
 */
export function createWalker() {
  let goal = null, pts = null, i = 0, best = Infinity, bestAt = 0, replans = 0;
  const stats = { plans: 0, replans: 0, gaveUp: 0, last: null };
  return {
    stats,
    reset() { goal = null; pts = null; },
    get waypoints() { return pts ? pts.slice(i) : null; },
    steer(self, g, route, now = Date.now()) {
      if (!g) { goal = null; pts = null; return null; }
      if (g !== goal) { goal = g; pts = null; replans = 0; }
      const dg = Math.hypot(g.x - self.x, g.z - self.z);
      if (dg < 0.5) { goal = null; pts = null; return null; }
      if (!pts) {
        const r = (route && route(self, g)) || { pts: [{ x: g.x, z: g.z }], straight: true };
        pts = r.pts; i = 0; best = dg; bestAt = now; stats.plans++;
        stats.last = { n: pts.length, reached: r.reached !== false, straight: !!r.straight };
      }
      while (i < pts.length - 1 && Math.hypot(pts[i].x - self.x, pts[i].z - self.z) < ROUTE.arrive) i++;
      // stuck: no ground gained toward the goal for a while -> plan again from here (a few times), then give up
      if (dg < best - ROUTE.stuckGain) { best = dg; bestAt = now; }
      else if (now - bestAt > ROUTE.stuckMs) {
        if (replans >= ROUTE.replans) { stats.gaveUp++; goal = null; pts = null; return null; }
        replans++; stats.replans++; pts = null; best = dg; bestAt = now;
        return this.steer(self, g, route, now);
      }
      return pts[i];
    },
  };
}
