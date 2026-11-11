// Ship brains. Each AI ship produces the same input object the player does ({ mx, my, ax, ay, fire, missile }),
// so the same flight and weapon code runs for everyone.
//
// Roles: swarm (rush and circle close), gunship (hold at range and strafe), brawler (close in, face it),
// capital (slow, broadside), carrier (hang back, launch drones), trader / miner (go about business, flee),
// escort / patrol (guard a point, chase hostiles), boss (capital + enrages).

import { rand, setRand } from './rand.js';
import { hostile, near, launchDrone } from './world.js';
import { angDiff } from '../core/math.js';
import { DRONES } from '../data/drones.js';

export function think(w, s, dt) {
  const ai = s.ai || (s.ai = { t: 0, orbit: rand() < 0.5 ? 1 : -1, home: { x: s.x, y: s.y }, wander: null, target: null, look: 0 });
  ai.t += dt; ai.look -= dt;
  const inp = { mx: 0, my: 0, ax: s.x + Math.cos(s.a) * 100, ay: s.y + Math.sin(s.a) * 100, fire: false, missile: false, boost: false };
  const st = s.stats;
  const hpRatio = st.hp / Math.max(1, st.maxHp);
  // find a target now and then
  if (ai.look <= 0) {
    ai.look = 0.8 + rand() * 0.6;
    if (ai.target && (ai.target.dead || ai.target.cloak > 0 || dist(s, ai.target) > 2600)) ai.target = null;
    if (!ai.target || ai.target.kind !== 'ship') {
      const aggro = s.role === 'trader' || s.role === 'miner' ? 0 : 900 + (s.r || 0) * 2 + (s.boss ? 600 : 0);
      let best = null, bd = aggro;
      for (const o of near(w, s.x, s.y, aggro)) {
        if (o.dead || !hostile(w, s, o) || o.cloak > 0 || o.kind === 'rock') continue;
        const d = dist(s, o) - o.r - (o === w.player ? 250 : 0);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) ai.target = best;
    }
  }
  // a target that is no longer an enemy (made up, or the player is in their undock grace) is dropped at once
  if (ai.target && (ai.target.dead || !hostile(w, s, ai.target))) ai.target = null;
  const T = ai.target;
  // weapon reach
  let reach = 300, lockReach = 0;
  for (const t of s.turrets) { if (!t.b.alive) continue; if (t.w.mode === 'lock') lockReach = Math.max(lockReach, t.w.range); else if (t.w.mode !== 'tool' && t.w.mode !== 'pd') reach = Math.max(reach, t.w.range); }

  // carriers launch drones
  if (st.droneCap > 0 && T) {
    const mine = w.drones.filter(d => !d.dead && d.owner === s).length;
    ai.droneT = (ai.droneT || 0) - dt;
    if (mine < st.droneCap && ai.droneT <= 0) {
      ai.droneT = 2.5;
      const kind = s.faction === 'lattice' ? 'lattice_mite' : s.faction === 'vesh' ? 'vesh_spawn' : 'dart';
      if (DRONES[kind]) launchDrone(w, s, kind, mine);
    }
  }

  if (!T) {
    // business as usual: wander near home, traders hop between waypoints
    if (!ai.wander || Math.hypot(ai.wander.x - s.x, ai.wander.y - s.y) < 120 || ai.t > 25) {
      ai.t = 0;
      const route = s.route && s.route.length ? s.route[(ai.leg = ((ai.leg || 0) + 1) % s.route.length)] : null;
      ai.wander = route || { x: ai.home.x + (rand() - 0.5) * 1400, y: ai.home.y + (rand() - 0.5) * 1400 };
    }
    steer(inp, s, ai.wander.x, ai.wander.y, 0.45);
    if (s.role === 'miner') { inp.fire = true; inp.ax = ai.wander.x; inp.ay = ai.wander.y; }
    avoid(w, s, inp);
    return inp;
  }

  const d = dist(s, T);
  inp.ax = T.x + T.vx * 0.2; inp.ay = T.y + T.vy * 0.2; inp.lock = T;
  inp.fire = d < reach + T.r; inp.missile = lockReach > 0 && d < lockReach;
  const toT = Math.atan2(T.y - s.y, T.x - s.x);
  inp.noseOn = Math.abs(angDiff(s.a, toT)) < 0.18;

  // run away when beaten (non-combat roles and badly hurt raiders)
  if (s.role === 'trader' || s.role === 'miner' || (hpRatio < 0.4 && !s.boss && s.faction === 'redfang' && s.cls === 'skiff' && ai.t % 20 < 4)) {
    inp.mx = -Math.cos(toT); inp.my = -Math.sin(toT); inp.boost = true; inp.fire = d < reach;
    avoid(w, s, inp);
    return inp;
  }
  let keep;
  switch (s.role) {
    case 'swarm': keep = T.r + 90 + s.r; break;
    case 'brawler': keep = T.r + 140 + s.r; break;
    case 'carrier': keep = Math.min(reach * 0.9, 700) + T.r; break;
    case 'capital': case 'boss': keep = reach * 0.6 + T.r; break;
    default: keep = reach * 0.7 + T.r * 0.5;
  }
  const radial = (d - keep) / Math.max(60, keep * 0.4);
  const rx = Math.cos(toT), ry = Math.sin(toT);
  const ox = -ry * ai.orbit, oy = rx * ai.orbit;
  // fixed-gun ships want to point at the target, so they lean in harder
  const hasFixed = s.turrets.some(t => t.b.alive && t.w.mode === 'fixed');
  const orbitW = s.role === 'capital' || s.role === 'boss' ? 0.5 : hasFixed && d < keep * 1.3 ? 0.2 : 0.85;
  inp.mx = rx * clamp1(radial) + ox * orbitW;
  inp.my = ry * clamp1(radial) + oy * orbitW;
  if (s.role === 'swarm' && d > keep * 2) inp.boost = true;
  if (rand() < dt * 0.15) ai.orbit *= -1;
  // bosses enrage below half health
  if (s.boss && hpRatio < 0.5 && !ai.enraged) { ai.enraged = true; w.notes.push({ t: 'enrage', name: s.name }); }
  avoid(w, s, inp);
  return inp;
}

/**
 * Steer around anything on our own side — above all the player. Allies used to fly straight through you
 * and the bump read as an attack. Enemies are left out: swarms are meant to get close.
 */
export function avoid(w, s, inp) {
  let ax = 0, ay = 0;
  for (const o of near(w, s.x, s.y, s.r + 320)) {
    if (o === s || o.dead || (o.kind !== 'ship' && o.kind !== 'station' && o.kind !== 'ground') || hostile(w, s, o)) continue;
    const dx = s.x - o.x, dy = s.y - o.y; const d = Math.hypot(dx, dy) || 1;
    const gap = d - s.r - o.r; const want = o === w.player ? 240 : 110;
    if (gap >= want) continue;
    const k = (1 - Math.max(0, gap) / want) * (o === w.player ? 2 : 0.8);
    ax += dx / d * k; ay += dy / d * k;
  }
  if (ax || ay) { inp.mx += ax; inp.my += ay; }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp1 = v => Math.max(-1, Math.min(1, v));
function steer(inp, s, x, y, power) {
  const dx = x - s.x, dy = y - s.y; const d = Math.hypot(dx, dy) || 1;
  inp.mx = dx / d * power; inp.my = dy / d * power;
}
