// Hide & Peek CPU. Hider: runs to a free-looking spot away from the middle and climbs in (tries another if it is
// taken), then peeks for +1 only when the lantern is far off and facing away. Seeker: chases anyone it can SEE in the
// open (or peeking), otherwise sweeps the spots, looking inside each. It never uses who is hidden where — only what the
// screen shows (peekers, people in the open, someone ducking into a spot near it). Family hides near and peeks
// rashly, and sweeps in a muddle; Tricky hides far, peeks only when it is safe and sweeps spot by spot, nearest first.
// Its own spot comes from its private state (v.priv.spot), like a phone's; nobody else's spot is ever sent.
import { stickTo, by, gauss, reacted, A, B } from '../cpu-kit.js';
import { edgeDist, inBeam, RULES } from './sim.js';

const FROZEN = 8;
export function createCpu(c) {
  const sk = c.skill, spots = c.init?.spots || [], beam = c.init?.beam || [5, 0.5], mem = {};
  let round = -1, phase = '', press = 0, nextAt = 0;
  const newRound = r => { round = r; Object.assign(mem, { spot: null, bad: new Set(), looked: new Set(), clue: null, target: null }); };
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me) return null;
      if (g.r !== round) newRound(g.r);
      phase = g.ph;
      for (const ev of v.events) if (ev.e === 'nospot' && ev.pid === c.pid && mem.spot != null) { mem.bad.add(mem.spot); mem.spot = null; }
      if (press > 0) { press--; return { mx: 0, mz: 0, b: 0 }; }               // let go between presses
      const seeking = g.sk === c.pid;
      if (seeking ? phase !== 'seek' : (phase !== 'hide' && phase !== 'seek') || g.fd.includes(c.pid)) return null;
      if (v.t < nextAt) return mem.hold || null;
      nextAt = v.t + sk.think * (0.8 + c.rng() * 0.4);
      const out = seeking ? seek(v, g, me) : hide(v, g, me);
      mem.hold = out ? { mx: out.mx, mz: out.mz, b: 0 } : null;
      if (out?.b) press = 1;
      return out;
    },
  };
  function seekerBody(v, g) {
    if (g.sk != null) return v.bodies.get(g.sk);
    const lou = (g.np || []).find(n => n[4] === 0); return lou ? { x: lou[1], z: lou[2], yaw: lou[3] } : null;
  }
  function hide(v, g, me) {
    const mine = v.priv?.spot ?? -1;
    if (mine >= 0 || g.hid?.includes(c.pid)) {                               // in a spot: peek when it is safe-ish
      if (phase !== 'seek' || !spots[mine]) return null;
      const s = seekerBody(v, g); if (!s) return null;
      const at = spots[mine];                                                // a hidden body is parked: measure from the spot
      const d = Math.hypot(s.x - at.x, s.z - at.z), facing = inBeam(s.x, s.z, s.yaw, at.x, at.z, beam[0] + 3, beam[1] + 0.5);
      // a peek shows a '!' to everyone: only worth it when the seeker could not get here before the bell
      const reach = (d - RULES.enter) / 4.5 + 0.6, late = g.left < reach * by(sk, [3, 1.3, 1.1]);
      const rash = c.rng() < by(sk, [0.06, 0.015, 0.005]);
      if ((late && !facing) || rash) return { mx: 0, mz: 0, b: B };
      return null;
    }
    if (mem.spot == null) {                                                  // choose: free-looking, reachable, away from the middle
      const others = [...v.bodies].filter(([p, b]) => p !== c.pid && p !== g.sk && !(b.flags & FROZEN));
      let best = null, bs = -1e9;
      for (const sp of spots) {
        if (mem.bad.has(sp.i)) continue;
        const d = Math.hypot(sp.x - me.x, sp.z - me.z);
        if (others.some(([, b]) => Math.hypot(sp.x - b.x, sp.z - b.z) < d - 0.5)) continue;   // someone will beat me to it
        if (d > (g.left - 1) * 4 && phase === 'hide') continue;                // too far to make it before the count ends
        const s = Math.hypot(sp.x, sp.z) * by(sk, [0.3, 0.8, 1.1]) - d * by(sk, [0.6, 0.3, 0.2]) + gauss(c.rng) * 2   // people hide all over
          + Math.min(...spots.filter(o => o !== sp).map(o => Math.hypot(o.x - sp.x, o.z - sp.z))) * by(sk, [0, 0.3, 0.6]);   // a lonely spot is swept last
        if (s > bs) { bs = s; best = sp; }
      }
      mem.spot = best ? best.i : null;
    }
    if (mem.spot == null) return null;
    const sp = spots[mem.spot];
    if (edgeDist(sp, me.x, me.z) < RULES.enter * 0.8) return { mx: 0, mz: 0, b: A };
    return stickTo(me, sp.x, sp.z, sk, { arrive: 0 });
  }
  function seek(v, g, me) {
    const hidden = new Set(g.hid), found = new Set(g.fd);
    // someone I can see: in the open, or peeking out ('!')
    const seen = [];
    for (const [p, b] of v.bodies) { if (p === c.pid || found.has(p)) continue; if (!hidden.has(p) || g.pk.includes(p)) seen.push({ x: b.x, z: b.z, spot: hidden.has(p) ? g.ps?.[p] ?? null : null }); }
    for (const n of g.np || []) if (n[4] === 1 && !n[7] && (n[5] === -1 || n[6])) seen.push({ x: n[1], z: n[2], spot: n[5] >= 0 ? n[5] : null });
    // someone ducking into a spot near me (I saw them go in)
    for (const ev of v.events) if (ev.e === 'in' && ev.i >= 0 && Math.hypot(spots[ev.i].x - me.x, spots[ev.i].z - me.z) < beam[0] + 2) mem.clue = ev.i;
    let near = null, nd = 99;
    for (const s of seen) { const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < nd) { nd = d; near = s; } }
    if (near && reacted(mem, 'see' + Math.round(near.x) + ',' + Math.round(near.z), v.t, sk, c.rng, 0.5)) {
      if (near.spot != null) mem.clue = near.spot;
      else return stickTo(me, near.x, near.z, sk, { arrive: 0 });              // walk at them: the lantern points the same way
    }
    if (mem.clue != null && mem.looked.has(mem.clue) && !seen.some(s => s.spot === mem.clue)) mem.clue = null;
    let target = mem.clue != null ? mem.clue : mem.target;
    if (target == null || (mem.looked.has(target) && target !== mem.clue)) {
      const left = spots.filter(sp => !mem.looked.has(sp.i));
      if (!left.length) { mem.looked.clear(); return null; }
      const score = sp => -Math.hypot(sp.x - me.x, sp.z - me.z) * by(sk, [0.5, 1, 1]) + gauss(c.rng) * (1 - sk.q) * 4;
      target = mem.target = left.map(sp => [sp, score(sp)]).sort((a, b) => b[1] - a[1])[0][0].i;
    }
    const sp = spots[target];
    if (edgeDist(sp, me.x, me.z) < RULES.enter * 0.7) {
      mem.looked.add(sp.i); if (mem.clue === sp.i) mem.clue = null;
      const dx = sp.x - me.x, dz = sp.z - me.z, d = Math.hypot(dx, dz) || 1;
      return { mx: dx / d * 0.2, mz: dz / d * 0.2, b: A };
    }
    return stickTo(me, sp.x, sp.z, sk, { arrive: 0 });
  }
}
