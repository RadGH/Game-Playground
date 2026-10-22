// MOLE MALLET — a garden lawn with a grid of mole holes. Moles keep popping up all over for a moment and ducking back
// down; run onto one and press A to bonk it with your big squeaky mallet.
//   brown mole     +1                 golden mole    +3, but it ducks back fast
//   bomb mole      a mole in a black helmet with a fizzing fuse: bonk it and it goes BOOM — you are dizzy for a
//                  moment (no points lost). Leave it alone and it ducks away harmlessly.
//   other players  a bonk that lands on a person makes them dizzy for a second; they then blink for a moment and
//                  cannot be bonked again (no stun-locking).
// Plenty of moles are up at once (more with more players) so everybody is busy. Most points at the bell wins. Solo:
// the same lawn as a score attack.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'mole-mallet', title: 'Mole Mallet', blurb: 'Bonk the moles as they pop up — but not the bombs!',
  how: ['Moles pop out of the holes: run onto one and press BONK!', 'Golden moles are worth 3, but they are quick.', 'A mole in a black helmet is a BOMB — bonk it and you get dizzy.', 'Bonk a player to make them dizzy too. Most bonks wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'points', tags: ['action'],
  controls: { stick: true, a: 'BONK!' }, move: { speed: 6.4, accel: 30, stunDrag: 3 },
  arena: { shape: 'rect', hw: 8.5, hd: 6.3, wall: true }, pitch: 60, card: 'card-mole-mallet',
};

export const KIND = Object.freeze({ MOLE: 0, GOLD: 1, BOMB: 2 });
export const RULES = {
  cols: [-6, -3, 0, 3, 6], rows: [-4.4, -1.5, 1.5, 4.4],
  reach: 0.55, hitR: 1.1, playerR: 1.0,               // the mallet lands this far in front of you; a mole within hitR of that spot is hit
  cool: 0.38, swingStun: 0, bopStun: 1.1, bopSafe: 2.3, bombStun: 1.6, bombPush: 6,
  rise: 0.18, sink: 0.22, squash: 0.4,
  life: { [0]: [1.5, 2.3], [1]: [1.0, 1.25], [2]: [2.2, 2.8] },
  pace: { easy: 1.3, normal: 1, hard: 0.82 },
  gold: 0.1, bomb: 0.15, every: 0.22, reuse: 0.5,
  up: [4, 4, 6, 8, 10],                               // moles wanted up at once, by player count
};
const r2 = v => Math.round(v * 100) / 100;
export const HOLES = RULES.rows.flatMap(z => RULES.cols.map(x => ({ x, z })));
export const points = k => (k === KIND.GOLD ? 3 : k === KIND.MOLE ? 1 : 0);

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, solo = n === 1, S = RULES, pace = S.pace[difficulty] ?? 1;
  const bodies = new Map(), spawns = spawnRing(n, solo ? 0 : 1.4, 0);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, solo ? 0 : spawns[i].z, solo ? Math.PI : spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, cool: 0, stun: 0, safe: 0, score: 0, bonks: 0, booms: 0, bops: 0 }]));
  const events = [], moles = [], lastUsed = HOLES.map(() => -9);
  let mid = 0, time = meta.seconds, elapsed = 0, over = false, spawnT = 0.6;
  const up = m => m.st === 'up' && m.age > 0.06 && m.age < m.life - 0.05;
  function spawn() {
    const busy = new Set(moles.map(m => m.hole));
    const free = HOLES.map((_, i) => i).filter(i => !busy.has(i) && elapsed - lastUsed[i] > S.reuse);
    if (!free.length) return;
    const hole = rng.pick(free), roll = rng(), kind = roll < S.gold ? KIND.GOLD : roll < S.gold + S.bomb ? KIND.BOMB : KIND.MOLE;
    const [a, b] = S.life[kind];
    moles.push({ id: ++mid, hole, kind, age: 0, life: rng.range(a, b) * pace, st: 'up', by: -1 });
  }
  function swing(pid) {
    const b = bodies.get(pid), s = P.get(pid), fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const hx = b.x + fx * S.reach, hz = b.z + fz * S.reach;
    let best = null, bd = S.hitR;
    for (const m of moles) { if (!up(m)) continue; const H = HOLES[m.hole], d = Math.hypot(H.x - hx, H.z - hz); if (d < bd) { bd = d; best = m; } }
    events.push({ e: 'swing', pid });
    if (best) {
      const H = HOLES[best.hole];
      best.st = 'bonked'; best.age = 0; best.by = pid; lastUsed[best.hole] = elapsed;
      if (best.kind === KIND.BOMB) {
        s.booms++; s.stun = S.bombStun; b.flags |= F.STUN;
        const dx = b.x - H.x, dz = b.z - H.z, d = Math.hypot(dx, dz) || 1; b.vx = dx / d * S.bombPush; b.vz = dz / d * S.bombPush;
        events.push({ e: 'boom', pid, id: best.id, x: H.x, z: H.z });
      } else {
        const d = points(best.kind); s.score += d; s.bonks++;
        events.push({ e: 'bonk', pid, id: best.id, k: best.kind, d, x: H.x, z: H.z });
      }
      return;
    }
    for (const [qid, c] of bodies) {
      if (qid === pid) continue;
      const t = P.get(qid); if (t.safe > 0 || t.stun > 0) continue;
      if (Math.hypot(c.x - hx, c.z - hz) > S.playerR) continue;
      t.stun = S.bopStun; t.safe = S.bopStun + S.bopSafe; c.flags |= F.STUN; s.bops++;
      const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz) || 1; c.vx = dx / d * 3; c.vz = dz / d * 3;
      events.push({ e: 'bop', pid: qid, by: pid, x: r2(c.x), z: r2(c.z) });
      return;
    }
  }
  return {
    bodies, events,
    init: () => ({ solo, holes: HOLES, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.cool <= 0 && s.stun <= 0) { s.cool = S.cool; swing(pid); }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.safe > 0) { s.safe -= dt; if (s.safe > 0 && s.stun <= 0) b.flags |= F.GHOST; if (s.safe <= 0) b.flags &= ~F.GHOST; }
      }
      for (const m of moles) {
        m.age += dt;
        if (m.st === 'up' && m.age >= m.life) { m.st = 'gone'; lastUsed[m.hole] = elapsed; }
        if (m.st === 'bonked' && m.age >= S.squash) m.st = 'gone';
      }
      for (let i = moles.length - 1; i >= 0; i--) if (moles[i].st === 'gone') moles.splice(i, 1);
      spawnT -= dt;
      const want = solo ? S.up[1] : S.up[n];
      while (spawnT <= 0) { spawnT += S.every * pace; if (moles.filter(m => m.st === 'up').length < want) spawn(); }
      time -= dt;
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags = (b.flags & ~F.GHOST) | F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).score;
      // a mole: [id, hole, kind, height 0..1 (how far out of its hole), bonked 1/0]
      const ml = moles.map(m => {
        let hgt = 1;
        if (m.st === 'up') hgt = Math.min(1, m.age / S.rise, (m.life - m.age) / S.sink);
        return [m.id, m.hole, m.kind, r2(Math.max(0, hgt)), m.st === 'bonked' ? 1 : 0];
      });
      return { sc, ml, left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const v = P.get(p.pid).score; scores[p.pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    _moles: moles, _P: P,
  };
}
