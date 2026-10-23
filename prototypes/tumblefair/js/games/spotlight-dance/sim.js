// SPOTLIGHT DANCE — a disco dance floor with a few round spotlights gliding over it. A ring around every spotlight
// shrinks onto its edge in time with the music: that is the BEAT. Stand inside a light and press A on the beat to
// dance: on-beat steps score, and a streak of them multiplies (x2 after 4, x3 after 8, x4 after 12). Off the beat,
// twice in one beat, out of the light, or skipping a beat: the streak is gone. Doing nothing scores nothing. Every so
// often two lights glide together and MERGE into one big light (more crowded!), and a little later split apart.
// Solo: the same floor, two lights, medal scores to beat.
//
// Timing is judged on the PHONE'S clock, like Apple Bobbing: the phone counts the song from the first state it gets
// and sends WHEN it pressed (`act('step', { t })`); the server checks t is recent and judges the step at that time, so
// lag never moves the beat. Where you stand is checked by the server at the moment the step arrives.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';

export const meta = {
  id: 'spotlight-dance', title: 'Spotlight Dance', blurb: 'Dance in the spotlight on the beat — keep your streak going!',
  how: ['Stand in a spotlight.', 'Press A on the beat (when the ring meets the light).', 'On-beat streaks multiply your points!', 'Lights merge and split — keep up.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Dance' }, move: { speed: 5.4, accel: 26, stunDrag: 2 },
  arena: { shape: 'rect', hw: 8, hd: 6, wall: true }, pitch: 56, card: 'card-spotlight-dance', css: true,
};

export const BEAT = 60 / 66;                   // one dance step every 2 beats of the 132 bpm fair-organ tune
export const LEAD = 2.0;                       // count-in before the first beat
export const RULES = {
  window: { easy: 0.17, normal: 0.13, hard: 0.1 },       // seconds either side of the beat that count as on it
  speed: { easy: 1.1, normal: 1.5, hard: 2.0 },           // how fast the lights glide (m/s)
  r: { easy: 1.85, normal: 1.65, hard: 1.45 },            // light radius
  slack: 0.25,                                            // a little extra radius for the trip to the server
  bigMul: 1.45, mergeEvery: 12, mergeFirst: 9, mergedFor: 6,
  streakStep: 4, maxMult: 4,
  ahead: 0.35, lag: 1.0,                                  // a step's time may be this far ahead of / behind the server
  medals: { easy: [40, 100, 170], normal: [50, 120, 200], hard: [40, 100, 170] },   // a perfect dancer scores about 300
};
const r2 = v => Math.round(v * 100) / 100;
export const multFor = streak => 1 + Math.min(RULES.maxMult - 1, Math.floor(streak / RULES.streakStep));
/** Which beat a time is nearest to, and how far off it is. */
export function judge(t) { const k = Math.round((t - LEAD) / BEAT); return { k, off: t - (LEAD + k * BEAT) }; }

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.window[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map(), spawns = spawnRing(n, solo ? 0 : 4.2);
  const { hw, hd } = meta.arena, R = RULES.r[D], WIN = RULES.window[D], SP = RULES.speed[D];
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { pts: 0, streak: 0, best: 0, last: -1, lastT: -9, hits: 0 }]));
  const pick = () => ({ x: rng.range(-hw + 2, hw - 2), z: rng.range(-hd + 1.8, hd - 1.8) });
  let lights = [], lid = 0, el = 0, time = meta.seconds, over = false, mergeIn = RULES.mergeFirst, merge = null, splitIn = -1, judged = -1;
  const k0 = solo ? 2 : Math.min(4, n + 1);
  for (let i = 0; i < k0; i++) { const a = i / k0 * Math.PI * 2 + 0.4, x = Math.sin(a) * 3.2, z = Math.cos(a) * 2.4, t = pick(); lights.push({ id: ++lid, x, z, r: R, tr: R, tx: t.x, tz: t.z }); }
  const events = [];
  const lightAt = b => lights.find(l => Math.hypot(b.x - l.x, b.z - l.z) <= l.r + RULES.slack);
  return {
    bodies, events,
    init: () => ({ solo, beat: BEAT, lead: LEAD, window: WIN, medals: solo ? RULES.medals[D] : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid); if (!b || over) return;
      stepBody(b, inp, meta.move, meta.arena);
    },
    act(pid, a, d) {
      if (a !== 'step' || over || !P.has(pid)) return;
      if (!d || typeof d !== 'object' || typeof d.t !== 'number' || !Number.isFinite(d.t)) return;
      const s = P.get(pid), t = d.t;
      if (t > el + RULES.ahead || t < el - RULES.lag || t <= s.lastT || t < LEAD - BEAT / 2) return;
      s.lastT = t;
      const { k, off } = judge(t), b = bodies.get(pid), lit = lightAt(b);
      let res;
      if (!lit) res = 'dark';
      else if (k <= s.last) res = 'double';
      else if (Math.abs(off) <= WIN) res = 'ok';
      else res = off < 0 ? 'early' : 'late';
      if (res === 'ok') {
        s.last = k; s.streak++; s.hits++; s.best = Math.max(s.best, s.streak);
        const perfect = Math.abs(off) <= WIN / 2, mult = multFor(s.streak), add = mult + (perfect ? 1 : 0);
        s.pts += add;
        events.push({ e: 'step', pid, ok: 1, perfect: perfect ? 1 : 0, mult, add, streak: s.streak, light: lit.id });
      } else {
        if (res !== 'double' && lit) s.last = Math.max(s.last, k);
        const lost = s.streak; s.streak = 0;
        events.push({ e: 'step', pid, ok: 0, why: res, lost });
      }
    },
    step(dt) {
      if (over) return;
      el += dt; time -= dt;
      separate(bodies.values());
      // a beat that has fully gone by: anyone with a streak who did not step on it loses the streak
      const done = Math.floor((el - LEAD - WIN - 0.06) / BEAT);
      if (done > judged) {
        for (let k = judged + 1; k <= done; k++) if (k >= 0) for (const [pid, s] of P) if (s.streak > 0 && s.last < k) { const lost = s.streak; s.streak = 0; events.push({ e: 'drop', pid, lost, to: pid }); }
        judged = done;
      }
      // lights glide; merge and split
      for (const l of lights) {
        const dx = l.tx - l.x, dz = l.tz - l.z, d = Math.hypot(dx, dz), sp = merge && (l.id === merge[0] || l.id === merge[1]) ? SP * 1.3 : SP;
        if (d < 0.1) { if (!merge || (l.id !== merge[0] && l.id !== merge[1])) { const t = pick(); l.tx = t.x; l.tz = t.z; } }
        else { const st = Math.min(d, sp * dt); l.x += dx / d * st; l.z += dz / d * st; }
        l.r += (l.tr - l.r) * Math.min(1, 2.5 * dt);
      }
      if (!merge && splitIn < 0) {
        mergeIn -= dt;
        if (mergeIn <= 0 && lights.length >= 2) {
          const [a, c] = rng.shuffle(lights).slice(0, 2), mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
          a.tx = c.tx = mx; a.tz = c.tz = mz; merge = [a.id, c.id];
          events.push({ e: 'merging', a: a.id, b: c.id });
        }
      } else if (merge) {
        const a = lights.find(l => l.id === merge[0]), c = lights.find(l => l.id === merge[1]);
        if (Math.hypot(a.x - c.x, a.z - c.z) < 0.2) {
          lights = lights.filter(l => l !== c); a.tr = R * RULES.bigMul; merge = null; splitIn = RULES.mergedFor;
          events.push({ e: 'merge', id: a.id, x: r2(a.x), z: r2(a.z) });
        }
      } else {
        splitIn -= dt;
        if (splitIn <= 0) {
          const big = lights.reduce((m, l) => (l.tr > m.tr ? l : m), lights[0]); big.tr = R;
          const t1 = pick(), t2 = pick(), nl = { id: ++lid, x: big.x, z: big.z, r: big.r, tr: R, tx: t2.x, tz: t2.z };
          big.tx = t1.x; big.tz = t1.z; lights.push(nl); splitIn = -1; mergeIn = RULES.mergeEvery - RULES.mergedFor;
          events.push({ e: 'split', id: big.id, nid: nl.id, x: r2(big.x), z: r2(big.z) });
        }
      }
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}, st = {}; for (const p of players) { const s = P.get(p.pid); sc[p.pid] = s.pts; st[p.pid] = s.streak; }
      return { sc, st, l: lights.map(l => [l.id, r2(l.x), r2(l.z), r2(l.r)]), el: Math.round(el * 20) / 20, left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = P.get(p.pid).pts; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get lights() { return lights; }, get el() { return el; },
  };
}
