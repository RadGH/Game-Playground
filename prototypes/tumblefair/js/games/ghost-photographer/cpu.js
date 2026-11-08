// Ghost Photographer CPU (co-op): with the lantern it walks toward its own clues (and the camera crowd) and flashes
// when a clue says a ghost is close; with the camera it runs at any lit ghost and snaps it, otherwise hunts its own
// clues (room -> that room, trail -> ahead of the newest footprint, cold -> keeps moving while it warms up) and snaps
// blind when it should be close. Skill: how often it reads its clues right, how well it leads a ghost, how fast it reacts.
import { thinker, stickTo, by, noisy, slip, nearest, wander, A, B } from '../cpu-kit.js';
import { roomCentre, RULES, meta } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = {}, solo = c.players.length === 1;
  const facing = (me, x, z) => { const d = Math.hypot(x - me.x, z - me.z) || 1; return { mx: (x - me.x) / d * 0.3, mz: (z - me.z) / d * 0.3 }; };
  /** Where my best clue says to go (null when I have none). */
  function clueSpot(v) {
    const clues = v.priv?.clues || []; if (!clues.length) return null;
    const cl = clues.find(k => k.id === mem.cid) || clues.slice().sort((a, b) => a.life - b.life)[0];
    mem.cid = cl.id;
    if (cl.t === 'room' && cl.room != null) { const r = roomCentre(cl.room); return { x: r.x, z: r.z, near: by(sk, [1.4, 2, 2.6]), cl }; }
    if (cl.t === 'trail' && cl.steps?.length) {
      const s = cl.steps, a = s[s.length - 1], b = s[0];             // steps: 1 s ago first, then older
      const k = by(sk, [0, 0.4, 0.8]);
      return { x: b[0] + (b[0] - a[0]) * k * 0.4, z: b[1] + (b[1] - a[1]) * k * 0.4, near: 1.8, cl };
    }
    if (cl.t === 'cold') {                                           // warmer / colder: keep heading while it warms up
      if (mem.cold == null || cl.cold > mem.cold || !mem.cdir) mem.cdir = { x: noisy(0, 7, sk, c.rng), z: noisy(0, 4, sk, c.rng) };
      mem.cold = cl.cold;
      return { x: mem.cdir.x, z: mem.cdir.z, near: cl.cold === 0 ? 99 : 0, cl };
    }
    return null;
  }
  return {
    tick(v) {
      const me = v.me, g = v.g; if (!me || !g) return null;
      return think(v, () => {
        const lamp = g.lt === c.pid, lit = (g.gh || []).map(x => ({ x: x[2], z: x[3] }));
        if (slip(sk, c.rng, 1)) return stickTo(me, ...Object.values(wander(mem, v, meta.arena, c.rng)), sk);
        if (lamp && !solo) {
          const spot = clueSpot(v);
          const flash = (v.priv?.fc ?? 1) <= 0 && (lit.length > 0 || spot?.cl?.cold === 0 || (spot && Math.hypot(spot.x - me.x, spot.z - me.z) < spot.near)) && c.rng() < by(sk, [0.3, 0.6, 0.8]);
          // a lit ghost is slowed: hold still near it so the cameras can catch up
          if (lit.length) { const n = nearest(me, lit); return { ...stickTo(me, n.item.x, n.item.z, sk, { arrive: 1.2, mag: 0.5 }), b: flash ? B : 0 }; }
          const to = spot || wander(mem, v, meta.arena, c.rng);
          return { ...stickTo(me, to.x, to.z, sk), b: flash ? B : 0 };
        }
        const ready = mem.snapAt == null || v.t >= mem.snapAt;
        const press = () => { mem.snapAt = v.t + RULES.snapCool + sk.react * 0.5; return A; };
        if (lit.length) {
          const n = nearest(me, lit), d = n.d;
          if (d < RULES.snapAhead + RULES.snapR * by(sk, [0.6, 0.8, 0.9]) && d > 0.4 && ready && c.rng() < by(sk, [0.5, 0.75, 0.9])) return { ...facing(me, n.item.x, n.item.z), b: press() };
          return stickTo(me, noisy(n.item.x, 0.6, sk, c.rng), noisy(n.item.z, 0.6, sk, c.rng), sk, { arrive: 1.2 });
        }
        const spot = clueSpot(v);
        if (spot) {
          const d = Math.hypot(spot.x - me.x, spot.z - me.z);
          if (d < spot.near && ready && c.rng() < by(sk, [0.1, 0.2, 0.35])) { const a = c.rng() * Math.PI * 2; return { mx: Math.sin(a) * 0.3, mz: Math.cos(a) * 0.3, b: press() }; }   // snap blind
          return stickTo(me, spot.x, spot.z, sk, { arrive: 0.8 });
        }
        if (solo) { const to = wander(mem, v, meta.arena, c.rng); return stickTo(me, to.x, to.z, sk); }
        const L = v.bodies.get(g.lt);                                       // nothing to go on: stay by the lantern
        return L ? stickTo(me, L.x + noisy(0, 1.5, sk, c.rng), L.z + noisy(0, 1.5, sk, c.rng), sk, { arrive: 1 }) : null;
      });
    },
  };
}
