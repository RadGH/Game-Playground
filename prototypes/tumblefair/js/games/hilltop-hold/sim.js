// HILLTOP HOLD — a round meadow with six grassy little hills (one in the middle, five round it). One hill at a time
// wears a glowing crown of light: the ZONE. Stand in it ALONE and you score 2 points a second; if anyone else is in it
// too, it turns red and nobody scores. Every ~10 s the zone hops to another hill — a dashed ring on the next hill
// warns you a few seconds before. A = shove: a short push on whoever is right in front of you (cooldown), so you can
// clear the hill. Solo: the zone hops every few seconds to a hill far from you — chase it and beat the medal scores.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'hilltop-hold', title: 'Hilltop Hold', blurb: 'Stand alone in the glowing zone to score — shove everyone else off the hill!',
  how: ['Stand in the glowing zone ALONE to score.', 'Two in the zone? It turns red: nobody scores.', 'A shoves whoever is in front of you.', 'The zone hops to a new hill — watch for the dashed ring!'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Shove' }, move: { speed: 6, accel: 24, stunDrag: 3 },
  arena: { shape: 'circle', r: 8, wall: true }, pitch: 58, card: 'card-hilltop-hold', css: true,
};

/** The hills: one in the middle, five round it. Each is a smooth mound `HILL_H` high and `HILL_R` across (radius). */
export const HILLS = [[0, 0], ...Array.from({ length: 5 }, (_, i) => { const a = i * Math.PI * 2 / 5 + 0.3; return [Math.round(Math.sin(a) * 3.9 * 100) / 100, Math.round(Math.cos(a) * 3.9 * 100) / 100]; })];
export const HILL_H = 0.8, HILL_R = 2.5;
/** Ground height at (x, z): the hills are cosine bumps. Same function in the sim (body.y) and the view (the mesh). */
export function groundAt(x, z) {
  let y = 0;
  for (const [hx, hz] of HILLS) { const d = Math.hypot(x - hx, z - hz); if (d < HILL_R) y = Math.max(y, HILL_H * 0.5 * (1 + Math.cos(Math.PI * d / HILL_R))); }
  return y;
}
export const RULES = {
  zoneR: { easy: 2.2, normal: 1.9, hard: 1.6 },
  every: { easy: 11, normal: 10, hard: 8.5 },          // seconds between hops (several players)
  soloEvery: { easy: 6.5, normal: 5, hard: 4 },        // alone: it hops faster
  warn: 2.5, soloWarn: 1.4,                            // the dashed ring shows this long before a hop
  rate: 2,                                             // points a second, alone in the zone
  shoveCool: 1.0, shoveR: 1.7, shoveCone: 1.05, shoveAim: 1.5, shovePush: 8.5, shoveStun: 0.4,   // cone / aim: half-angles, radians
  medals: { easy: [45, 65, 80], normal: [55, 75, 90], hard: [50, 68, 82] },
  firstHop: 0.6,                                       // the first zone lights up this soon after the start
};
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.zoneR[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map(), spawns = spawnRing(n, solo ? 6.4 : 6.6, Math.PI / 5);
  players.forEach((p, i) => { const b = makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw); b.y = r2(groundAt(b.x, b.z)); bodies.set(p.pid, b); });
  const P = new Map(players.map(p => [p.pid, { prevB: 0, cool: 0, stun: 0, held: 0 }]));
  const zoneR = RULES.zoneR[D], every = solo ? RULES.soloEvery[D] : RULES.every[D], warn = solo ? RULES.soloWarn : RULES.warn;
  let zone = -1, next = -1, hopIn = RULES.firstHop, time = meta.seconds, over = false, owner = -1, hops = 0;
  const events = [];
  const pts = pid => Math.floor(P.get(pid).held * RULES.rate + 1e-6);
  function pickNext() {
    // never the same hill twice; alone, a hill well away from you (so you always have to run)
    let options = HILLS.map((_, i) => i).filter(i => i !== zone);
    if (solo) { const b = bodies.get(players[0].pid), far = options.filter(i => Math.hypot(HILLS[i][0] - b.x, HILLS[i][1] - b.z) > 3.5); if (far.length) options = far; }
    return rng.pick(options);
  }
  const inZone = b => zone >= 0 && Math.hypot(b.x - HILLS[zone][0], b.z - HILLS[zone][1]) <= zoneR;
  return {
    bodies, events,
    init: () => ({ solo, hills: HILLS, hillH: HILL_H, hillR: HILL_R, zoneR, medals: solo ? RULES.medals[D] : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && !(b.flags & F.STUN) && s.cool <= 0) {
        s.cool = RULES.shoveCool;
        // the nearest player in front (a wide cone, plus aim help a little wider) gets pushed straight away from you
        let best = null, bd = 99;
        for (const [qid, c] of bodies) {
          if (qid === pid) continue;
          const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz); if (d > RULES.shoveR || d >= bd) continue;
          let da = Math.atan2(dx, dz) - b.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
          if (da <= RULES.shoveAim) { best = qid; bd = d; }
        }
        if (best != null) {
          const c = bodies.get(best), q = P.get(best), dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz) || 1;
          b.yaw = Math.atan2(dx, dz);
          c.vx = dx / d * RULES.shovePush; c.vz = dz / d * RULES.shovePush; c.flags |= F.STUN; q.stun = RULES.shoveStun;
          events.push({ e: 'shove', pid, to: best, x: r2(c.x), z: r2(c.z) });
        } else events.push({ e: 'whiff', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
      b.y = r2(groundAt(b.x, b.z));
    },
    step(dt) {
      if (over) return;
      time -= dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        b.y = r2(groundAt(b.x, b.z));
      }
      // the zone: warn, then hop
      hopIn -= dt;
      if (next < 0 && hopIn <= warn) { next = pickNext(); events.push({ e: 'warn', hill: next }); }
      if (hopIn <= 0) {
        if (next < 0) next = pickNext();
        zone = next; next = -1; hopIn = every; hops++;
        events.push({ e: 'hop', hill: zone });
      }
      // who is in it?
      const inside = zone < 0 ? [] : players.filter(p => inZone(bodies.get(p.pid))).map(p => p.pid);
      const was = owner;
      owner = inside.length === 1 ? inside[0] : inside.length > 1 ? -2 : -1;
      if (owner >= 0) { const before = pts(owner); P.get(owner).held += dt; if (pts(owner) > before && pts(owner) % 10 === 0) events.push({ e: 'ten', pid: owner, pts: pts(owner) }); }
      if (owner !== was && owner === -2) events.push({ e: 'contest' });
      if (time <= 0) {
        time = 0; over = true;
        for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = pts(p.pid);
      return { sc, z: zone, nx: next, w: Math.max(0, Math.round(hopIn * 10) / 10), o: owner, left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = pts(p.pid); scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get zone() { return zone; }, get hops() { return hops; },
  };
}
