// The bot's defence planner (PLAN M4: "a raid bot match"). Plays through the SAME commands the console sends (§3.3)
// and reads only what the console could see (the raid warnings with their target and predicted path, its own
// buildings). Plan, re-checked every bot step:
//   * a watch post beside the HQ and beside each loud worksite that has no tower near (they light and see the ground);
//   * when Fortification arrives, a bolt thrower by the HQ and by each worksite a raid has gone for;
//   * gun nests by the HQ once Gunnery arrives, a mortar pit once Mortars do;
//   * when a raid forms, a short wall across its predicted path in front of the target (a raid that has to chew or
//     walk round under the towers' fire), and a tower by the target if it has none.
//   import { createDefenceBot } from './bot-defence.mjs'    bot.step(events)

import { SUB } from '../js/sim/entities.js';

const TAU = 6.283185307179586;

export function createDefenceBot(sim, { say = () => {} } = {}) {
  const D = sim.data;
  const send = (cmd) => sim.send({ base: 'home', ...cmd });
  const mine = (type) => sim.ents.list('building').filter((b) => b.type === type);
  const towers = () => sim.ents.list('building').filter((b) => D.B[b.type]?.tower);
  const hq = () => sim.ents.list('building').find((b) => b.type === 'hq');
  const failed = new Map();
  const walled = new Set();
  const hotTargets = new Map(); // building id → times a raid went for it
  const stats = { towers: 0, walls: 0, raidsSeen: 0 };

  function spot(type, cx, cy, rMin, rMax) {
    for (let r = rMin; r <= rMax; r += 3) {
      const n = Math.max(8, Math.round((TAU * r) / 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
        if (sim.buildings.canPlace(type, x, y).ok) return [x, y];
      }
    }
    return null;
  }
  function towerNear(b, r) { return towers().some((t) => Math.hypot(t.fp.cx - b.fp.cx, t.fp.cy - b.fp.cy) < r); }
  function build(type, near, rMin = 10, rMax = 26, why = '') {
    const key = type + ':' + near.id;
    if (sim.tick - (failed.get(key) ?? -1e9) < 2000) return null;
    if (!sim.unlocked.has(type) || sim.shortOf(D.B[type].cost)) return null;
    const at = spot(type, near.fp.cx, near.fp.cy, rMin, rMax);
    if (!at) { failed.set(key, sim.tick); return null; }
    const r = send({ t: 'build', type, x: at[0], y: at[1] });
    if (r.ok) { stats.towers++; say(`defence: ${type} by the ${near.type} (${why})`); } else failed.set(key, sim.tick);
    return r.ok ? r.id : null;
  }

  /** A short wall across a raid's predicted path, ~24 cells in front of its target. */
  function wallAcross(ev) {
    if (!ev.path || ev.path.length < 4 || walled.has(ev.target)) return;
    const t = sim.ents.get(ev.target); if (!t) return;
    // the path point about 24 cells out from the target
    let pick = null;
    for (let i = ev.path.length - 1; i >= 0; i--) { const [x, y] = ev.path[i]; if (Math.hypot(x - t.fp.cx, y - t.fp.cy) > Math.max(t.fp.w, t.fp.h) / 2 + 22) { pick = i; break; } }
    if (pick === null || pick + 1 >= ev.path.length) return;
    const [x, y] = ev.path[pick], [nx, ny] = ev.path[Math.min(ev.path.length - 1, pick + 1)];
    let dx = nx - x, dy = ny - y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const half = 22;
    const pts = [[Math.round(x - dy * half), Math.round(y + dx * half)], [Math.round(x + dy * half), Math.round(y - dx * half)]];
    const r = send({ t: 'drawWall', pts, straight: true });
    if (r.ok) { walled.add(ev.target); stats.walls++; say(`defence: wall across the raid's path to the ${t.type}`); }
  }

  function step(events = []) {
    const h = hq(); if (!h || sim.defence.over) return;
    for (const ev of events) {
      if (ev.e !== 'raidForming' || ev.guards) continue;
      stats.raidsSeen++;
      hotTargets.set(ev.target, (hotTargets.get(ev.target) || 0) + 1);
      wallAcross(ev);
      const t = sim.ents.get(ev.target);
      if (t && !towerNear(t, 30)) build(sim.unlocked.has('bolt_thrower') ? 'bolt_thrower' : 'watch_post', t, 8, 24, 'raid target');
    }
    if (sim.hud().sites > 4) return;
    // eyes and a crossbow by the HQ and every loud worksite
    if (!towerNear(h, 40)) build('watch_post', h, 28, 40, 'HQ');
    const loud = sim.ents.list('building').filter((b) => b.built >= 1 && (sim.defence.DD.bal.noise.byType[b.type] || 0) >= 55 && b.type !== 'hq');
    for (const b of loud) if (!towerNear(b, 28)) { build('watch_post', b, 8, 22, 'worksite'); break; }
    if (sim.unlocked.has('bolt_thrower')) {
      if (mine('bolt_thrower').filter((t) => Math.hypot(t.fp.cx - h.fp.cx, t.fp.cy - h.fp.cy) < 60).length < 2) build('bolt_thrower', h, 30, 50, 'HQ');
      for (const [id, n] of hotTargets) { const b = sim.ents.get(id); if (b && n > 0 && mine('bolt_thrower').filter((t) => Math.hypot(t.fp.cx - b.fp.cx, t.fp.cy - b.fp.cy) < 30).length < Math.min(2, n)) { build('bolt_thrower', b, 8, 24, 'raided'); break; } }
    }
    if (sim.unlocked.has('gun_nest') && mine('gun_nest').length < 2) build('gun_nest', h, 30, 52, 'HQ');
    if (sim.unlocked.has('mortar_pit') && mine('mortar_pit').length < 1) build('mortar_pit', h, 30, 56, 'HQ');
    void SUB;
  }
  return { step, stats };
}
