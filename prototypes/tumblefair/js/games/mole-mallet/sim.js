// MOLE MALLET — a garden lawn with a grid of mole holes. Moles pop up for a moment and duck back down; run up to one
// and press BONK to bonk it with your big squeaky mallet. ONE idea: bonk the moles, not the bombs.
//   brown mole     +1                 golden mole    +3, but it ducks back fast
//   bomb mole      a black ball with a fizzing fuse: bonk it and it goes BOOM — you are dizzy for a moment.
// Most points at the bell wins. Alone you race Gardener Gus (CPU), who runs the same lawn.
// Round 12 (0/1 over 3 plays): the mallet only landed on a spot 0.55 m in front of you; now the swing has aim help
// (`aimAt`, shared with the view): it turns you to the nearest real mole within ASSIST of you, and your ring sits gold
// on that mole's hole before you press. A bomb is only ever hit when it is the one right in front of you.
// Expansion 1, M4 (👎, still the bottom of the table): the game had a second fight on top — your mallet also bonked
// PLAYERS dizzy — so the lawn was a brawl where whoever got bopped stood still while the moles they ran for went back
// down, and brown moles lasted 1.5-2.3 s, about the time it takes to run two holes over. Player bonks are gone, moles
// stay up longer (2.0-2.8 s), there are more of them with more players, and a solo player has a rival on the lawn.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'mole-mallet', title: 'Mole Mallet', blurb: 'Bonk the moles as they pop up — but not the bombs!',
  how: ['Run up to a mole and press BONK! Your ring turns gold when one is in reach.', 'Golden moles are worth 3, but they are quick.', 'Black ball with a fuse = BOMB. Bonk it and you get dizzy.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'points', tags: ['action'], rival: true,
  controls: { stick: true, a: 'BONK!' }, move: { speed: 6.4, accel: 30, stunDrag: 3 },
  arena: { shape: 'rect', hw: 8.5, hd: 6.3, wall: true }, pitch: 60, card: 'card-mole-mallet',
};

export const KIND = Object.freeze({ MOLE: 0, GOLD: 1, BOMB: 2 });
export const RULES = {
  cols: [-6, -3, 0, 3, 6], rows: [-4.4, -1.5, 1.5, 4.4],
  reach: 0.55, hitR: 1.1, playerR: 1.0, assist: 1.9,                // the mallet lands this far in front of you; a mole within hitR of that spot is hit
  cool: 0.38, bombStun: 1.6, bombPush: 6,
  rise: 0.18, sink: 0.22, squash: 0.4,
  life: { [0]: [2.0, 2.8], [1]: [1.2, 1.5], [2]: [2.4, 3.0] },
  pace: { easy: 1.3, normal: 1, hard: 0.82 },
  gold: 0.1, bomb: 0.15, every: 0.22, reuse: 0.5,
  up: [4, 5, 7, 9, 11],                               // moles wanted up at once, by player count (solo counts Gus)
  // Gardener Gus (CPU, solo): runs at `speed` x a player's, notices a mole `react` s after it pops, now and then dawdles
  cpu: { easy: { speed: 0.5, react: 0.75, dawdle: 0.45 }, normal: { speed: 0.62, react: 0.5, dawdle: 0.3 }, hard: { speed: 0.8, react: 0.3, dawdle: 0.12 } },
};
export const CPU_NAME = 'Gardener Gus';
const r2 = v => Math.round(v * 100) / 100;
export const HOLES = RULES.rows.flatMap(z => RULES.cols.map(x => ({ x, z })));
export const points = k => (k === KIND.GOLD ? 3 : k === KIND.MOLE ? 1 : 0);
/** What a swing from (x, z) facing `yaw` would hit, of `list` = [{ hole, kind }] (moles that are up): the nearest brown or
 *  gold mole within RULES.assist of you (you turn to it), else whatever is right under the mallet's spot (a bomb too).
 *  Returns { m, yaw } or null. The sim swings with it; the view draws the ring with it. */
export function aimAt(x, z, yaw, list) {
  let best = null, bd = RULES.assist;
  for (const m of list) { if (m.kind === KIND.BOMB) continue; const H = HOLES[m.hole], d = Math.hypot(H.x - x, H.z - z); if (d < bd) { bd = d; best = m; } }
  if (best) { const H = HOLES[best.hole]; return { m: best, yaw: Math.hypot(H.x - x, H.z - z) > 0.05 ? Math.atan2(H.x - x, H.z - z) : yaw }; }
  const hx = x + Math.sin(yaw) * RULES.reach, hz = z + Math.cos(yaw) * RULES.reach;
  bd = RULES.hitR;
  for (const m of list) { const H = HOLES[m.hole], d = Math.hypot(H.x - hx, H.z - hz); if (d < bd) { bd = d; best = m; } }
  return best ? { m: best, yaw } : null;
}

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const n = players.length, solo = n === 1, gus = solo && rivals !== false;   // "Rival when alone" off: no Gus
  const S = RULES, pace = S.pace[difficulty] ?? 1, CP = S.cpu[difficulty] || S.cpu.normal;
  const bodies = new Map(), spawns = spawnRing(gus ? 2 : n, 1.4, 0);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, cool: 0, stun: 0, score: 0, bonks: 0, booms: 0 }]));
  const cpu = gus ? { b: makeBody(spawns[1].x, spawns[1].z, spawns[1].yaw), s: { cool: 0, stun: 0, score: 0, bonks: 0, booms: 0 }, target: null, wait: 0, move: { ...meta.move, speed: meta.move.speed * CP.speed } } : null;
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
  function swing(pid, b, s) {
    const aim = aimAt(b.x, b.z, b.yaw, moles.filter(up)), best = aim?.m || null;
    if (aim) b.yaw = aim.yaw;
    events.push({ e: 'swing', pid });
    if (!best) return;
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
  }
  /** Gus: run to the nearest mole he has noticed (never a bomb), bonk it when it is in reach. */
  function cpuThink(dt) {
    const { b, s } = cpu;
    if (s.stun > 0) { stepBody(b, null, cpu.move, meta.arena); return; }
    if (cpu.wait > 0) { cpu.wait -= dt; stepBody(b, null, cpu.move, meta.arena); return; }
    const live = moles.filter(m => up(m) && m.kind !== KIND.BOMB && m.age >= CP.react && m.life - m.age > 0.25);
    if (!cpu.target || !live.includes(cpu.target)) {
      let best = null, bd = 1e9;
      for (const m of live) { const H = HOLES[m.hole], d = Math.hypot(H.x - b.x, H.z - b.z) - (m.kind === KIND.GOLD ? 2 : 0); if (d < bd) { bd = d; best = m; } }
      cpu.target = best;
      if (best && rng.chance(CP.dawdle)) { cpu.wait = rng.range(0.3, 0.8); return; }
    }
    const m = cpu.target; if (!m) { stepBody(b, null, cpu.move, meta.arena); return; }
    const H = HOLES[m.hole], dx = H.x - b.x, dz = H.z - b.z, d = Math.hypot(dx, dz);
    if (d < S.assist - 0.4 && s.cool <= 0) { s.cool = S.cool; swing('cpu', b, s); cpu.target = null; stepBody(b, null, cpu.move, meta.arena); return; }
    stepBody(b, d > 0.6 ? { mx: dx / d, mz: dz / d, b: 0 } : null, cpu.move, meta.arena);
  }
  const tickStun = (b, s, dt) => { if (s.cool > 0) s.cool -= dt; if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; } };
  return {
    bodies, events,
    init: () => ({ solo, holes: HOLES, left: Math.ceil(time), cpu: gus ? CPU_NAME : null }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.cool <= 0 && s.stun <= 0) { s.cool = S.cool; swing(pid, b, s); }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt;
      if (cpu) cpuThink(dt);
      separate(cpu ? [...bodies.values(), cpu.b] : bodies.values());
      for (const [pid, b] of bodies) tickStun(b, P.get(pid), dt);
      if (cpu) tickStun(cpu.b, cpu.s, dt);
      for (const m of moles) {
        m.age += dt;
        if (m.st === 'up' && m.age >= m.life) { m.st = 'gone'; lastUsed[m.hole] = elapsed; }
        if (m.st === 'bonked' && m.age >= S.squash) m.st = 'gone';
      }
      for (let i = moles.length - 1; i >= 0; i--) if (moles[i].st === 'gone') moles.splice(i, 1);
      spawnT -= dt;
      const want = S.up[gus ? 2 : n];
      while (spawnT <= 0) { spawnT += S.every * pace; if (moles.filter(m => m.st === 'up').length < want) spawn(); }
      time -= dt;
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).score;
      // a mole: [id, hole, kind, height 0..1 (how far out of its hole), bonked 1/0]
      const ml = moles.map(m => {
        let hgt = 1;
        if (m.st === 'up') hgt = Math.min(1, m.age / S.rise, (m.life - m.age) / S.sink);
        return [m.id, m.hole, m.kind, r2(Math.max(0, hgt)), m.st === 'bonked' ? 1 : 0];
      });
      // Gus: [x, z, yaw, score, speed, dizzy]
      return { sc, ml, left: Math.ceil(time), ...(cpu ? { cpu: [r2(cpu.b.x), r2(cpu.b.z), r2(cpu.b.yaw), cpu.s.score, r2(Math.hypot(cpu.b.vx, cpu.b.vz)), cpu.s.stun > 0 ? 1 : 0] } : {}) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const v = P.get(p.pid).score; scores[p.pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    _moles: moles, _P: P, _cpu: cpu,
  };
}
