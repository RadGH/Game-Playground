// Towers (PLAN M4: watch post, bolt thrower, gun nest, mortar pit). PURE.
//
// A tower is a building (buildings.json row with `tower: true`, tag military) whose fighting numbers are in
// towers.json. Each built tower counts its cooldown down, then shoots the nearest enemy in range that is on LIVE sight
// (fog 2 — a tower cannot shoot what nobody can see: at night only lit ground, never through smoke); a tower with
// `nests: true` shells a nest in range when no enemy is there. Our shots pass over our own walls. Shots:
//   bolt  — a projectile flying at `speed` cells a second; it hits the enemy if it is still near where it was aimed
//   burst — `rounds` instant hits `spacing` ticks apart (tracers on the scope)
//   shell — lands `flight` ticks later where the target was: a real blast (js/world/blast.js: broken ground, rubble,
//           fire, debris) plus splash damage; it is fuzed for our side — it never hurts our own buildings or walls,
//           but the fire it starts follows the physics.
// Global level per kind (sim.levels['tower.<id>']): damage, range and hit points × towers.json perLevel each level.

import { SUB } from '../entities.js';
import { hurt, canDamage } from './targets.js';
import { hyp, dir, powi } from './maths.js';

export function createTowers(sim, DD) {
  const { g } = sim.world;
  const shots = [];      // in flight: { k, x, y, tx, ty, target, at, dmg, splash, blast, from }
  const rng = sim.rng.split('defence.towers');

  const lv = (type) => sim.levels['tower.' + type] || 1;
  const mul = (type, k) => powi(DD.perLevel[k], lv(type) - 1);
  function stats(type) {
    const t = DD.T[type];
    return { ...t, damage: t.damage * mul(type, 'damage'), range: t.range * mul(type, 'range'), hp: Math.round(t.hp * mul(type, 'hp')) };
  }
  const live = (x, y) => g.inside(x | 0, y | 0) && g.fog[g.qIdx(x | 0, y | 0)] === 2;

  function acquire(b, st) {
    const x = b.fp.cx, y = b.fp.cy, r2 = st.range * st.range, m2 = (st.minRange || 0) ** 2;
    let best = null, bd = Infinity;
    for (const e of sim.ents.list('enemy')) {
      const ex = e.x / SUB, ey = e.y / SUB, d = (ex - x) ** 2 + (ey - y) ** 2;
      if (d > r2 || d < m2 || d >= bd || !live(ex, ey)) continue;
      bd = d; best = e;
    }
    if (best || !st.nests) return best;
    for (const n of sim.ents.list('nest')) {
      const nx = n.x / SUB, ny = n.y / SUB, d = (nx - x) ** 2 + (ny - y) ** 2;
      if (d > (st.range + n.r) ** 2 || d < m2 || d >= bd || !live(nx, ny)) continue;
      bd = d; best = n;
    }
    return best;
  }

  function fire(b, st, t) {
    const x = b.fp.cx, y = b.fp.cy, tx = t.x / SUB, ty = t.y / SUB;
    const from = b.id;
    if (st.noise) sim.defence.pulse('noise', x, y, st.noise * 4, 120);
    if (st.shot === 'bolt') {
      const d = hyp(tx - x, ty - y), at = sim.tick + Math.max(1, Math.round((d / st.speed) * 20));
      shots.push({ k: 'bolt', x, y, tx, ty, target: t.id, at, dmg: st.damage, from });
      sim.events.push({ e: 'shot', tick: sim.tick, base: sim.base, k: 'bolt', x: +x.toFixed(1), y: +y.toFixed(1), x2: +tx.toFixed(1), y2: +ty.toFixed(1), ticks: at - sim.tick, tower: b.type });
    } else if (st.shot === 'burst') {
      b.burst = { left: st.rounds, next: sim.tick, target: t.id };
    } else if (st.shot === 'shell') {
      // aim a little ahead of a walker by where it was heading (its last move)
      const lead = t.kind === 'enemy' && t.px !== undefined ? [(t.x - t.px) / SUB, (t.y - t.py) / SUB] : [0, 0];
      const ax = tx + lead[0] * st.flight * 0.6 + (rng.float() - 0.5) * 2, ay = ty + lead[1] * st.flight * 0.6 + (rng.float() - 0.5) * 2;
      shots.push({ k: 'shell', x, y, tx: ax, ty: ay, at: sim.tick + st.flight, dmg: st.damage, splash: st.splash, blast: st.blast, from });
      sim.events.push({ e: 'shot', tick: sim.tick, base: sim.base, k: 'shell', x: +x.toFixed(1), y: +y.toFixed(1), x2: +ax.toFixed(1), y2: +ay.toFixed(1), ticks: st.flight, tower: b.type });
    }
  }

  function burstStep(b, st) {
    const B = b.burst;
    if (!B || sim.tick < B.next) return;
    let t = sim.ents.get(B.target);
    const x = b.fp.cx, y = b.fp.cy;
    if (!t || t.removed || (t.x / SUB - x) ** 2 + (t.y / SUB - y) ** 2 > st.range * st.range) t = acquire(b, st);
    if (!t) { b.burst = null; return; }
    B.target = t.id;
    const tx = t.x / SUB + (rng.float() - 0.5) * 1.5, ty = t.y / SUB + (rng.float() - 0.5) * 1.5;
    hurt(sim, t, st.damage, { team: 0, kind: 'round', from: b.id, x, y });
    sim.events.push({ e: 'shot', tick: sim.tick, base: sim.base, k: 'round', x: +x.toFixed(1), y: +y.toFixed(1), x2: +tx.toFixed(1), y2: +ty.toFixed(1), ticks: 1, tower: b.type });
    B.left--; B.next = sim.tick + st.spacing;
    if (B.left <= 0) b.burst = null;
  }

  function land(s) {
    if (s.k === 'bolt') {
      const t = sim.ents.get(s.target);
      if (t && !t.removed && hyp(t.x / SUB - s.tx, t.y / SUB - s.ty) < (t.kind === 'nest' ? t.r + 2 : 2.5)) {
        hurt(sim, t, s.dmg, { team: 0, kind: 'bolt', from: s.from, x: s.x, y: s.y });
        sim.events.push({ e: 'hit', tick: sim.tick, base: sim.base, k: 'bolt', x: Math.round(s.tx), y: Math.round(s.ty) });
      }
    } else if (s.k === 'shell') {
      sim.world.blast(Math.round(s.tx), Math.round(s.ty), s.blast[0], s.blast[1], { by: 'shell', splash: s.splash, damage: s.dmg, from: s.from });
    }
  }

  function step() {
    const slow = sim.defence.crippledUntil > sim.tick ? 2 : 1;
    for (const b of sim.ents.list('building')) {
      if (b.built < 1 || !DD.T[b.type]) continue;
      const st = stats(b.type);
      if (b.burst) { burstStep(b, st); continue; }
      if ((b.cd || 0) > 0) { b.cd--; continue; }
      const t = acquire(b, st);
      if (!t) continue;
      fire(b, st, t);
      b.cd = st.cooldown * slow;
      if (b.burst) burstStep(b, st);
    }
    for (let i = shots.length - 1; i >= 0; i--) if (sim.tick >= shots[i].at) { const s = shots.splice(i, 1)[0]; land(s); }
  }

  return { step, stats, acquire, shots, canDamage };
}
