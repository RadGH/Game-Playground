// Wobblewheel Rally CPU: drives the racing line of the (public) track a few metres ahead, keeps off the mud side and
// through the arrow pads, grabs ? boxes and uses items sensibly (Zoom on a straight, Bonk at a kart ahead, Slick with
// one behind). Family steers late with a shaky line and a lighter foot; Tricky looks further ahead and wastes less.
import { thinker, by, noisy, slip, A, B } from '../cpu-kit.js';
import { makeTrack } from './sim.js';

const STUN = 2, AIR = 16, FROZEN = 8;
export function createCpu(c) {
  const sk = c.skill, rng = c.rng, think = thinker(c), mem = { k: -1, stuck: 0, itemAt: 0 };
  const T = makeTrack(c.init.track.variant), L = T.loop, N = L.N;
  const look = by(sk, [3, 4, 4.5]), push = by(sk, [0.925, 0.94, 0.97]), wob = by(sk, [0.55, 0.3, 0.15]);
  const wrap = k => ((k % N) + N) % N;
  function findK(me) {                                  // my place on the loop: the nearest sample near the last one
    let best = mem.k, bd = Infinity;
    const span = mem.k < 0 ? N : 8, from = mem.k < 0 ? 0 : mem.k - 8;
    for (let i = 0; i <= span * (mem.k < 0 ? 1 : 2); i++) { const k = wrap(from + i), d = (me.x - L.cx[k]) ** 2 + (me.z - L.cz[k]) ** 2; if (d < bd) { bd = d; best = k; } }
    return (mem.k = best);
  }
  const boxes = T.boxes.map(p => { const k = nearK(p); return { k, lat: latAt(k, p) }; });
  const bend = k => { const a = wrap(k), b = wrap(k + 5); return 1 - (L.tx[a] * L.tx[b] + L.tz[a] * L.tz[b]); };   // 0 straight .. 2 hairpin
  return {
    tick(v) {
      const me = v.me, g = v.g;
      if (!me || !g || g.cd || (me.flags & (STUN | FROZEN))) return null;
      const k = findK(me);
      return think(v, () => {
        const sp = Math.hypot(me.vx, me.vz);
        mem.stuck = sp < 0.8 ? mem.stuck + sk.think : Math.max(0, mem.stuck - sk.think * 2);
        const ahead = Math.round(look + Math.min(2, sp * 0.15));
        // the line: middle of the track, off the mud side, onto a pad, through a box when empty-handed
        const mine = g.rs?.[c.pid] || [], item = mine[2] || 0;
        let lat = 0;
        for (const m of T.muds) { const d = wrap(m.k - k); if (d < 7) lat = -Math.sign(latOf(m)) * 0.9 * (rng() < by(sk, [0.4, 0.75, 0.9]) ? 1 : 0); }
        if (!item) for (let i = 0; i < boxes.length; i++) if (g.bx?.[i] === '1' && wrap(boxes[i].k - k) < 8) { lat = boxes[i].lat; break; }
        if (mem.stuck > 1) { lat = 0; if (mem.stuck > 2.2) mem.stuck = 0; }
        const [tx, tz] = T.at(k + (mem.stuck > 1 ? 1 : ahead), noisy(lat, wob, sk, rng));
        let mx = tx - me.x, mz = tz - me.z; const m = Math.hypot(mx, mz) || 1;
        const brake = bend(k + ahead) > 0.6 && sp > 5.5 ? 0.8 : 1;
        mx = mx / m * push * brake; mz = mz / m * push * brake;
        // items and hops
        let b = 0;
        if (item && v.t >= mem.itemAt && !slip(sk, rng, 0.5)) {
          const me2 = mine[1] || 1, others = [...v.bodies].filter(([p]) => p !== c.pid).map(([, o]) => o).concat((g.cpu || []).map(r => ({ x: r[1], z: r[2] })));
          const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
          const front = others.some(o => { const dx = o.x - me.x, dz = o.z - me.z, d = Math.hypot(dx, dz); return d < 7 && (dx * fx + dz * fz) / (d || 1) > 0.9; });
          const behind = others.some(o => { const dx = o.x - me.x, dz = o.z - me.z, d = Math.hypot(dx, dz); return d < 4 && (dx * fx + dz * fz) / (d || 1) < -0.6; });
          if ((item === 1 && bend(k) < 0.15 && bend(k + 6) < 0.25) || (item === 3 && front) || (item === 2 && (behind || me2 === 1)) || rng() < 0.02) { b |= A; mem.itemAt = v.t + 0.8; }
        }
        // a slick or bonk ball right in front: hop it (when sharp enough to see it)
        const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
        for (const s of (g.sl || []).concat(g.bo || [])) { const dx = s[1] - me.x, dz = s[2] - me.z, d = Math.hypot(dx, dz); if (d < 2.4 && d > 0.6 && (dx * fx + dz * fz) / d > 0.85 && rng() < by(sk, [0.2, 0.5, 0.7])) { b |= B; break; } }
        return { mx, mz, b };
      });
    },
  };
  function nearK(p) { let best = 0, bd = Infinity; for (let k = 0; k < N; k++) { const d = (p.x - L.cx[k]) ** 2 + (p.z - L.cz[k]) ** 2; if (d < bd) { bd = d; best = k; } } return best; }
  function latAt(k, p) { return (p.x - L.cx[k]) * -L.tz[k] + (p.z - L.cz[k]) * L.tx[k]; }
  function latOf(m) { return latAt(m.k, m); }
}
