// FROSTY FREEZE TAG (Winter only) — a snowy park with snowmen and blocks of ice to dodge round. One player is THE FROST
// (icy blue, a little faster); everyone else runs. A touch from the Frost freezes a runner into an ice statue (F.FROZEN:
// they cannot move). A free runner who stands next to a statue for about a second THAWS it (they are safe from the
// Frost for a moment after); a statue nobody rescues melts by itself after a few seconds (RULES.selfThaw). Each
// round runs its whole clock, so the Frost keeps hunting.
// Every round a different player starts as the Frost (each player once, the order shuffled from the seed); the Frost
// counts for 2 s first while the runners scatter. A = a runner's quick dash, or the Frost's FROST BREATH (runners
// close by are slowed for a moment, F.SLOW).
// Points: a runner scores 1 a second while not frozen; a thaw is +2 for the rescuer; the Frost scores +2 a freeze and
// +4 for a DEEP FREEZE (every runner frozen at once); runners still free at the bell get +3.
// Alone: a CPU Frost chases you (another joins every so often, each a little quicker), and frozen snow pals stand about
// the park — thaw one for +5. A catch freezes you for a moment, costs one of three snowflakes and sends the Frost back
// to a far corner. Score = seconds free + thaws.
import { makeBody, stepBody, separate, spawnRing, clampToArena, collideObstacles, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 9, HD = 6;
export const meta = {
  id: 'frosty-freeze-tag', title: 'Frosty Freeze Tag', blurb: 'Run from the Frost — get tagged and you freeze solid until a friend thaws you!',
  how: ['Runner? Run! A touch from the Frost freezes you.', 'Stand next to a frozen friend to thaw them (+2).', 'The Frost scores for every freeze. A = dash / frost breath.', 'Everyone is the Frost once.'],
  kind: 'arena', min: 1, max: 4, seconds: 90, scoring: 'points', unit: 'pts', tags: ['action', 'holiday'], season: 'winter', rival: true,
  controls: { stick: true, a: 'Dash / Breath' }, move: { speed: 5.2, accel: 26, stunDrag: 3, boostMul: 1.05, slowMul: 0.55 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true }, pitch: 58, card: 'card-frosty-freeze-tag', css: true,
};

export const RULES = {
  rounds: { 1: 1, 2: 2, 3: 3, 4: 4 }, roundTime: { 1: 76, 2: 28, 3: 22, 4: 17 },
  count: 2.0, between: 2.6, tagR: 0.95, thawR: 1.25, thawTime: 1.0, immune: 1.6,
  selfThaw: { 2: 2.5, 3: 5, 4: 5 },               // a statue melts on its own after this long (alone in a 2-player round: sooner)
  freezePts: 2, allPts: 4, thawPts: 2, freePts: 3,
  breathCool: 3.5, breathR: 2.4, breathSlow: 1.2,
  dashCool: 2.4, dashTime: 0.25, dashSpeed: 7,
  solo: {
    lives: 3, catchFreeze: 1.4, safe: 1.6, cpuR: 0.9, pals: 2, palPts: 5, palEvery: 3.5,
    first: 1.5, every: { easy: 30, normal: 24, hard: 18 },
    base: { easy: 3.2, normal: 3.6, hard: 4.1 }, step: 0.35, max: 5.4,
  },
};
const r2 = v => Math.round(v * 100) / 100;
const FROST = 0, RUNNER = 1;

/** The park: ice blocks (boxes) and snowmen (round), mirrored left-right so neither side is easier; the middle clear. */
export function makeLayout(rng) {
  const blocks = [], posts = [];
  const free = (x, z, r) => Math.hypot(x, z) > 2.6 && Math.abs(x) < HW - 1.2 && Math.abs(z) < HD - 1.1 &&
    blocks.every(b => Math.abs(b.x - x) > b.hw + r + 1.1 || Math.abs(b.z - z) > b.hd + r + 1.1) && posts.every(p => Math.hypot(p.x - x, p.z - z) > p.r + r + 1.2);
  for (let k = 0, made = 0; k < 120 && made < 2; k++) {
    const x = r2(rng.range(1.8, HW - 1.4)), z = r2(rng.range(-HD + 1.3, HD - 1.3)), w = r2(rng.range(0.55, 0.85));
    if (!free(x, z, w) || !free(-x, z, w)) continue;
    blocks.push({ x, z, hw: w, hd: 0.4 }, { x: -x, z, hw: w, hd: 0.4 }); made++;
  }
  for (let k = 0, made = 0; k < 120 && made < 2; k++) {
    const x = r2(rng.range(1.5, HW - 1.4)), z = r2(rng.range(-HD + 1.3, HD - 1.3));
    if (!free(x, z, 0.5) || !free(-x, z, 0.5)) continue;
    posts.push({ x, z, r: 0.5 }, { x: -x, z, r: 0.5 }); made++;
  }
  return { ...meta.arena, blocks, posts };
}

export function create({ rng, players, difficulty = 'normal', rivals }) {
  const n = players.length, solo = n === 1, bodies = new Map(), arena = makeLayout(rng), D = RULES.solo.base[difficulty] ? difficulty : 'normal';
  for (const p of players) bodies.set(p.pid, makeBody(0, 0, 0));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, role: RUNNER, frozen: false, thaw: 0, melt: 0, immune: 0, pts: 0, rs: 0, freezes: 0, thaws: 0, survived: 0, wait: 0, breathCool: 0, dashCool: 0, dash: 0, slow: 0, lives: RULES.solo.lives, safe: 0, iceT: 0 }]));
  const order = rng.shuffle(players.map(p => p.pid));
  const rounds = RULES.rounds[n], roundLen = RULES.roundTime[n];
  let round = 0, phase = 'between', pt = 1.6, rtime = roundLen, time = meta.seconds, over = false, firstFrost = null, deep = false, cpus = [], cid = 0, spawnIn = 0, pals = [], palId = 0, palIn = 0;
  const events = [];
  const runners = () => players.filter(p => P.get(p.pid).role === RUNNER);
  const freeRunners = () => runners().filter(p => !P.get(p.pid).frozen);
  function setRole(pid, role) {
    const s = P.get(pid), b = bodies.get(pid); s.role = role;
    if (role === FROST) b.flags |= F.BOOST; else b.flags &= ~F.BOOST;
  }
  function freeze(pid, on) {
    const s = P.get(pid), b = bodies.get(pid); s.frozen = on; s.thaw = 0; s.melt = on ? (RULES.selfThaw[n] || 5) : 0;
    if (on) { b.flags = (b.flags & ~(F.STUN | F.SLOW)) | F.FROZEN; b.vx = b.vz = 0; s.slow = 0; s.dash = 0; } else { b.flags &= ~F.FROZEN; s.immune = RULES.immune; }
  }
  function startRound() {
    round++; phase = 'play'; rtime = roundLen; deep = false;
    firstFrost = solo ? null : order[(round - 1) % n];
    const ring = spawnRing(Math.max(1, n - (solo ? 0 : 1)), solo ? 0 : 5.0, Math.PI);
    let i = 0;
    for (const p of players) {
      const b = bodies.get(p.pid), s = P.get(p.pid);
      b.vx = b.vz = 0; b.flags = 0; s.frozen = false; s.thaw = 0; s.immune = 0; s.breathCool = 0; s.dashCool = 0; s.dash = 0; s.slow = 0; s.wait = 0; s.safe = 0; s.iceT = 0;
      if (p.pid === firstFrost) { b.x = 0; b.z = 0; b.yaw = 0; setRole(p.pid, FROST); s.wait = RULES.count; b.flags |= F.FROZEN; }
      else { const at = ring[i++]; b.x = r2(Math.max(-HW + 1, Math.min(HW - 1, at.x * 1.5))); b.z = r2(solo ? 1.5 : at.z); b.yaw = r2(at.yaw); setRole(p.pid, RUNNER); }
    }
    if (solo) { cpus = []; spawnIn = RULES.solo.first; pals = []; palIn = 0.5; }
    events.push({ e: 'round', round, rounds, frost: firstFrost });
  }
  function endRound(why) {
    for (const s of P.values()) { s.pts += Math.floor(s.rs); s.rs = 0; }
    const left = freeRunners().map(p => p.pid);
    if (!solo) {
      for (const pid of left) P.get(pid).pts += RULES.freePts;
    }
    events.push({ e: 'roundEnd', round, why, free: left, frost: firstFrost });
    for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    if (round >= rounds || time <= RULES.between + 1) { over = true; return; }
    phase = 'between'; pt = RULES.between;
  }
  // ---- solo: CPU Frosts and frozen snow pals
  const corners = [[-HW + 1, -HD + 1], [HW - 1, -HD + 1], [-HW + 1, HD - 1], [HW - 1, HD - 1]];
  const farCorners = me => corners.slice().sort((a, b) => Math.hypot(b[0] - me.x, b[1] - me.z) - Math.hypot(a[0] - me.x, a[1] - me.z));
  function spawnCpu() {
    const me = bodies.get(players[0].pid), [x, z] = farCorners(me)[rng.int(0, 1)];
    const c = { id: ++cid, k: cpus.length, body: makeBody(x, z, 0), wob: rng.range(0, 6.28) }; c.body.flags = F.BOOST;
    cpus.push(c); events.push({ e: 'cpu', id: c.id, x, z });
  }
  const cpuSpeed = c => Math.min(RULES.solo.max, RULES.solo.base[D] + RULES.solo.step * c.k);
  function spawnPal() {
    const me = bodies.get(players[0].pid);
    for (let k = 0; k < 30; k++) {
      const x = r2(rng.range(-HW + 1.2, HW - 1.2)), z = r2(rng.range(-HD + 1.2, HD - 1.2));
      if (Math.hypot(x - me.x, z - me.z) < 3) continue;
      if (arena.blocks.some(o => Math.abs(x - o.x) < o.hw + 0.8 && Math.abs(z - o.z) < o.hd + 0.8) || arena.posts.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 0.8)) continue;
      if (pals.some(p => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
      const p = { id: ++palId, x, z, thaw: 0, seed: rng.int(1, 9999) }; pals.push(p); events.push({ e: 'pal', id: p.id, x, z }); return;
    }
  }
  function soloStep(dt) {
    const pid = players[0].pid, me = bodies.get(pid), s = P.get(pid), S = RULES.solo;
    if (rivals !== false) { spawnIn -= dt; if (spawnIn <= 0) { spawnIn = S.every[D]; spawnCpu(); } }     // "Rival when alone" off: no CPU Frost (the snow pals stay: they are not opponents)
    if (pals.length < S.pals) { palIn -= dt; if (palIn <= 0) { palIn = S.palEvery; spawnPal(); } }
    for (const c of cpus) {
      c.wob += dt * 1.5;
      const dx = me.x - c.body.x, dz = me.z - c.body.z, d = Math.hypot(dx, dz) || 1, sp = cpuSpeed(c) / (meta.move.speed * meta.move.boostMul);
      const wx = Math.sin(c.wob) * 0.4, wz = Math.cos(c.wob * 1.3) * 0.4;
      let mx = dx / d + wz * (d > 2 ? 1 : 0.2), mz = dz / d - wx * (d > 2 ? 1 : 0.2);
      if (s.frozen || s.safe > 0) { mx = -mx * 0.3; mz = -mz * 0.3; }            // backs off while you are frozen / just caught
      const m = Math.hypot(mx, mz) || 1;
      stepBody(c.body, { mx: mx / m * sp, mz: mz / m * sp, b: 0 }, meta.move, arena);
    }
    for (let i = 0; i < cpus.length; i++) for (let j = i + 1; j < cpus.length; j++) {
      const a = cpus[i].body, c = cpus[j].body, dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
      if (d < 1.4 && d > 1e-3) { const k = (1.4 - d) / 2; a.x -= dx / d * k; a.z -= dz / d * k; c.x += dx / d * k; c.z += dz / d * k; clampToArena(a, arena); clampToArena(c, arena); }
    }
    if (s.frozen) { s.iceT -= dt; if (s.iceT <= 0) { freeze(pid, false); s.safe = S.safe; } }
    else if (s.safe <= 0 && cpus.some(c => Math.hypot(c.body.x - me.x, c.body.z - me.z) < S.cpuR)) {
      s.lives--; freeze(pid, true); s.iceT = S.catchFreeze; events.push({ e: 'caught', pid, lives: s.lives, x: r2(me.x), z: r2(me.z) });
      if (s.lives <= 0) { endRound('caught'); return; }
      const far = farCorners(me); cpus.forEach((c, i) => { const [x, z] = far[i % 2]; c.body.x = x; c.body.z = z; c.body.vx = c.body.vz = 0; });
    }
    // thaw a snow pal by standing next to it
    if (!s.frozen) for (const p of pals) {
      if (Math.hypot(p.x - me.x, p.z - me.z) <= RULES.thawR + 0.2) p.thaw += dt; else p.thaw = Math.max(0, p.thaw - dt * 2);
      if (p.thaw >= RULES.thawTime) { s.pts += S.palPts; s.thaws++; p.done = true; events.push({ e: 'thaw', pid: null, by: pid, pal: p.id, x: p.x, z: p.z }); }
    }
    pals = pals.filter(p => !p.done);
  }
  return {
    bodies, events, arena,
    init: () => ({ solo, arena, rounds, roundLen, order, lives: solo ? RULES.solo.lives : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (phase !== 'play') return;
      if (pa && s.role === FROST && s.wait <= 0 && s.breathCool <= 0) {
        s.breathCool = RULES.breathCool;
        for (const [qid, c] of bodies) {
          const q = P.get(qid); if (q.role !== RUNNER || q.frozen || Math.hypot(c.x - b.x, c.z - b.z) > RULES.breathR) continue;
          q.slow = RULES.breathSlow; c.flags |= F.SLOW;
        }
        events.push({ e: 'breath', pid, x: r2(b.x), z: r2(b.z) });
      }
      if (pa && s.role === RUNNER && !s.frozen && s.dashCool <= 0 && !(b.flags & (F.STUN | F.FROZEN))) { s.dashCool = RULES.dashCool; s.dash = RULES.dashTime; events.push({ e: 'dash', pid }); }
      stepBody(b, inp, meta.move, arena);
      if (s.dash > 0 && !(b.flags & (F.STUN | F.FROZEN))) {
        b.x += Math.sin(b.yaw) * RULES.dashSpeed * 0.05; b.z += Math.cos(b.yaw) * RULES.dashSpeed * 0.05;
        clampToArena(b, arena); collideObstacles(b, arena);
      }
    },
    step(dt) {
      if (over) return;
      time -= dt;
      if (phase === 'between') { pt -= dt; if (pt <= 0) startRound(); if (time <= 0) over = true; return; }
      rtime -= dt;
      separate([...bodies].filter(([pid]) => !P.get(pid).frozen && P.get(pid).role === RUNNER).map(([, b]) => b));
      for (const b of bodies.values()) { clampToArena(b, arena); collideObstacles(b, arena); }
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) b.flags &= ~F.FROZEN; }
        if (s.slow > 0) { s.slow -= dt; if (s.slow <= 0) b.flags &= ~F.SLOW; }
        if (s.breathCool > 0) s.breathCool -= dt;
        if (s.dashCool > 0) s.dashCool -= dt;
        if (s.dash > 0) s.dash -= dt;
        if (s.immune > 0) s.immune -= dt;
        if (s.safe > 0) s.safe -= dt;
        if (s.role === RUNNER && !s.frozen) { s.survived += dt; s.rs += dt; }
      }
      if (!solo) {
        // the Frost freezes runners it touches (not while counting, not a runner just thawed)
        for (const [fid, f] of bodies) {
          const fs = P.get(fid); if (fs.role !== FROST || fs.wait > 0) continue;
          for (const [hid, hb] of bodies) {
            const hs = P.get(hid); if (hs.role !== RUNNER || hs.frozen || hs.immune > 0 || Math.hypot(hb.x - f.x, hb.z - f.z) > RULES.tagR) continue;
            freeze(hid, true); fs.pts += RULES.freezePts; fs.freezes++;
            events.push({ e: 'freeze', pid: hid, by: fid, x: r2(hb.x), z: r2(hb.z) });
          }
        }
        // free runners thaw statues they stand next to
        for (const p of runners()) {
          const s = P.get(p.pid); if (!s.frozen) continue;
          const b = bodies.get(p.pid);
          const helper = freeRunners().find(q => Math.hypot(bodies.get(q.pid).x - b.x, bodies.get(q.pid).z - b.z) <= RULES.thawR);
          if (helper) s.thaw += dt; else s.thaw = Math.max(0, s.thaw - dt * 2);
          s.melt -= dt;
          if (s.thaw >= RULES.thawTime) {
            freeze(p.pid, false); const hs = P.get(helper.pid); hs.pts += RULES.thawPts; hs.thaws++;
            events.push({ e: 'thaw', pid: p.pid, by: helper.pid, x: r2(b.x), z: r2(b.z) });
          } else if (s.melt <= 0) { freeze(p.pid, false); events.push({ e: 'thaw', pid: p.pid, by: null, x: r2(b.x), z: r2(b.z) }); }
        }
        // every runner frozen at once: a DEEP FREEZE for the Frost (once, until somebody is free again)
        const free = freeRunners().length;
        if (!free && !deep && firstFrost != null) { deep = true; P.get(firstFrost).pts += RULES.allPts; events.push({ e: 'deep', by: firstFrost }); }
        if (free) deep = false;
      } else { soloStep(dt); if (phase !== 'play') return; }
      if (rtime <= 0 || time <= 0) { rtime = 0; endRound('time'); }
    },
    state() {
      const sc = {}, ro = {}, th = {};
      for (const p of players) {
        const s = P.get(p.pid);
        sc[p.pid] = s.pts + Math.floor(s.rs);
        ro[p.pid] = s.role === FROST ? (s.wait > 0 ? 2 : 1) : s.frozen ? 3 : s.immune > 0 ? 4 : 0;   // 0 runner, 1 Frost, 2 Frost counting, 3 frozen, 4 just thawed
        if (s.frozen) th[p.pid] = Math.round(Math.max(s.thaw / RULES.thawTime, 1 - s.melt / (RULES.selfThaw[n] || 5)) * 100) / 100;     // how far through thawing (a friend or the melt)
      }
      const g = { sc, ro, ph: phase, rd: round, rl: Math.ceil(Math.max(0, rtime)), left: Math.ceil(Math.max(0, time)) };
      if (Object.keys(th).length) g.th = th;
      if (solo) {
        g.cpu = cpus.map(c => [c.id, r2(c.body.x), r2(c.body.z), r2(c.body.yaw)]);
        g.pal = pals.map(p => [p.id, p.x, p.z, Math.round(p.thaw / RULES.thawTime * 100) / 100, p.seed]);
        g.lv = P.get(players[0].pid).lives;
      }
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const s = P.get(p.pid), v = s.pts + Math.floor(s.rs); scores[p.pid] = v;
        if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    stats: pid => ({ ...P.get(pid) }),
    get phase() { return phase; }, get round() { return round; }, get cpus() { return cpus; }, get pals() { return pals; }, firstFrostOf: r => order[(r - 1) % n],
  };
}
