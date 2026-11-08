// SLED BASH (Winter only) — everyone rides a round saucer sled on a frozen pond ringed with soft snowdrifts. The ice is
// slippery (meta.move.accel is low, so you build speed slowly and keep sliding when you let go). A = BOOST: a lunge the
// way you are pushing (or facing) that slides you a few metres — aim it at someone and they go spinning. Sleds bounce
// off each other like rubber balls; the one that was hit harder spins for a moment with no grip at all.
// Slide past the edge of the ice and you go head-first into a snowdrift (F.OUT, half buried) until the next round.
// Points: knock someone into the snow = +2 for whoever touched them last (within RULES.creditTime); the last sled
// still on the ice = +3. Every round the snowdrifts creep in (the ice shrinks), so a round always ends. Rounds repeat
// until the clock runs out; most points wins.
// Alone: three CPU sledders (Pip, Mittens, Bumble) to bump off. They wobble about, keep off the edge and lunge at you
// when they have a good line, so standing still gets you dumped in the snow. Two players get one CPU sledder too.
import { makeBody, stepBody, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const R = 7.4;
export const meta = {
  id: 'sled-bash', title: 'Sled Bash', blurb: 'Slide your sled across the frozen pond and bump everyone into the snowdrifts!',
  how: ['The ice is slippery — you slide!', 'A = BOOST: lunge into someone to send them spinning.', 'Knock a sled into the snow +2. Last on the ice +3.', 'The snowdrifts creep in every round.'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'pts', tags: ['action', 'holiday'], season: 'winter', rival: true,
  controls: { stick: true, a: 'Boost' },
  move: { speed: 5.2, accel: 2.6, stunDrag: 0.75 },
  arena: { shape: 'circle', r: R, wall: false }, pitch: 62, card: 'card-sled-bash', css: true,
};

export const RULES = {
  countdown: 3, play: 70, endPause: 1.6, between: 2.4, startR: 4.6, grace: 1.0,
  rMin: 3.0, shrinkAfter: 3, shrinkTime: 14,       // the ice: full size for 3 s, then shrinks to rMin over 14 s
  sledR: 0.62, bounce: 0.55, minHit: 1.2, hitPush: 1.2, spin: 0.5, pairCool: 0.3,
  dashSpeed: 7.4, dashTime: 0.3, dashCool: 1.3, dashPush: 1.6,
  edge: 0.15, drift: 0.9, buried: -0.32,           // out once past the edge by `edge`; you land `drift` m into the snow
  creditTime: 3, knockPts: 2, lastPts: 3,
  cpu: {
    names: ['Pip', 'Mittens', 'Bumble'],
    speed: { easy: 0.55, normal: 0.72, hard: 0.9 },  // of meta.move.speed
    dashCool: { easy: 3.8, normal: 2.8, hard: 2.0 },
    lunge: { easy: 2.4, normal: 2.9, hard: 3.4 },     // how close they must be to lunge
  },
};
const r2 = v => Math.round(v * 100) / 100;
const PLAY = 'play', BETWEEN = 'between', COUNT = 'count', DONE = 'done';

export function create({ rng, players, difficulty = 'normal', rivals }) {
  const n = players.length, solo = n === 1, bodies = new Map(), sleds = new Map();   // id -> sled; players by pid, CPUs by negative id
  const D = RULES.cpu.speed[difficulty] ? difficulty : 'normal';
  for (const p of players) { const b = makeBody(0, 0, 0); b.flags = F.FROZEN; bodies.set(p.pid, b); sleds.set(p.pid, { id: p.pid, b, cpu: false, pts: 0, knocks: 0, lasts: 0, dashCool: 0, dash: 0, spin: 0, lastBy: null, lastAt: -99, prevB: 0 }); }
  const nCpu = rivals === false ? 0 : solo ? 3 : n === 2 ? 1 : 0;      // "Rival when alone" off: no CPU sledders at all
  for (let j = 0; j < nCpu; j++) { const b = makeBody(0, 0, 0); b.flags = F.FROZEN; sleds.set(-1 - j, { id: -1 - j, b, cpu: true, name: RULES.cpu.names[j], pts: 0, knocks: 0, lasts: 0, dashCool: rng.range(0.5, 1.5), dash: 0, spin: 0, lastBy: null, lastAt: -99, think: 0, wob: rng.range(0, 6.28) }); }
  const cpuMove = { ...meta.move, speed: meta.move.speed * RULES.cpu.speed[D] };
  const pairCool = new Map(), events = [];
  let phase = COUNT, pt = RULES.countdown, lastCount = 4, time = RULES.play, over = false, endIn = -1, round = 0, rt = 0, rr = R, clock = 0;

  const onIce = () => [...sleds.values()].filter(s => !(s.b.flags & F.OUT));
  const iceR = () => rt <= RULES.shrinkAfter ? R : Math.max(RULES.rMin, R - (R - RULES.rMin) * Math.min(1, (rt - RULES.shrinkAfter) / RULES.shrinkTime));

  function startRound() {
    round++; phase = PLAY; rt = 0; rr = R; pairCool.clear();
    const list = [...sleds.values()], ring = spawnRing(list.length, list.length === 1 ? 0 : RULES.startR, rng.range(0, Math.PI * 2));
    list.forEach((s, i) => { const b = s.b; b.x = r2(ring[i].x); b.z = r2(ring[i].z); b.yaw = r2(ring[i].yaw); b.y = 0; b.vx = b.vz = 0; b.flags = 0; s.dash = 0; s.spin = 0; s.lastBy = null; s.lastAt = -99; s.dashCool = s.cpu ? RULES.grace + rng.range(0.6, 1.6) : RULES.grace; });      // nobody boosts in the first second
    events.push({ e: 'round', round });
  }
  function endRound(why) {
    const left = onIce();
    if (left.length === 1) { const s = left[0]; s.lasts++; if (!s.cpu) s.pts += RULES.lastPts; events.push({ e: 'last', id: s.id, x: r2(s.b.x), z: r2(s.b.z) }); }
    for (const s of sleds.values()) { s.b.vx = s.b.vz = 0; if (!(s.b.flags & F.OUT)) s.b.flags = F.FROZEN; }
    events.push({ e: 'roundEnd', round, why, last: left.length === 1 ? left[0].id : null });
    if (time <= RULES.between + 2) { finish(); return; }
    phase = BETWEEN; pt = RULES.between;
  }
  function finish() {
    phase = DONE; endIn = RULES.endPause;
    for (const s of sleds.values()) { s.b.vx = s.b.vz = 0; if (!(s.b.flags & F.OUT)) s.b.flags = F.FROZEN; }
    events.push({ e: 'end' });
  }
  function dash(s, mx, mz) {
    const b = s.b; let dx = mx, dz = mz; const m = Math.hypot(dx, dz);
    if (m > 0.2) { dx /= m; dz /= m; } else { dx = Math.sin(b.yaw); dz = Math.cos(b.yaw); }
    b.vx = b.vx * 0.25 + dx * RULES.dashSpeed; b.vz = b.vz * 0.25 + dz * RULES.dashSpeed; b.yaw = Math.atan2(dx, dz);
    b.flags |= F.STUN; s.dash = RULES.dashTime; s.dashCool = s.cpu ? RULES.cpu.dashCool[D] : RULES.dashCool;
    events.push({ e: 'boost', id: s.id });
  }
  function plop(s) {
    const b = s.b, d = Math.hypot(b.x, b.z) || 1, at = rr + RULES.drift;
    b.x = r2(b.x / d * at); b.z = r2(b.z / d * at); b.y = RULES.buried; b.vx = b.vz = 0; b.flags = F.OUT; s.dash = 0; s.spin = 0;
    let by = null;
    if (s.lastBy != null && clock - s.lastAt <= RULES.creditTime) { const k = sleds.get(s.lastBy); if (k && k.id !== s.id) { by = k.id; k.knocks++; if (!k.cpu) k.pts += RULES.knockPts; } }
    events.push({ e: 'plop', id: s.id, by, x: b.x, z: b.z });
  }
  function bump(a, c) {
    const dx = c.b.x - a.b.x, dz = c.b.z - a.b.z, d = Math.hypot(dx, dz), min = RULES.sledR * 2;
    if (d >= min) return;
    const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
    const push = (min - d) / 2; a.b.x -= nx * push; a.b.z -= nz * push; c.b.x += nx * push; c.b.z += nz * push;
    const sa = a.b.vx * nx + a.b.vz * nz, sc = -(c.b.vx * nx + c.b.vz * nz), close = sa + sc;   // how hard each drove at the other
    const key = a.id + ':' + c.id;
    if (close < RULES.minHit || pairCool.has(key)) return;
    pairCool.set(key, RULES.pairCool);
    const att = sa >= sc ? a : c, vic = att === a ? c : a, ux = att === a ? nx : -nx, uz = att === a ? nz : -nz;   // u: attacker -> victim
    // a bouncy exchange of the closing speed, plus a shove for the one that was hit (more when the hit was a boost)
    const j = close * (1 + RULES.bounce) / 2, extra = RULES.hitPush + (att.dash > 0 ? RULES.dashPush : 0);
    a.b.vx -= j * nx; a.b.vz -= j * nz; c.b.vx += j * nx; c.b.vz += j * nz;
    vic.b.vx += ux * extra; vic.b.vz += uz * extra;
    vic.b.flags |= F.STUN; vic.spin = RULES.spin; vic.dash = 0;
    vic.lastBy = att.id; vic.lastAt = clock; att.lastBy = vic.id; att.lastAt = clock;    // whoever you touched gets the credit if you then slide off
    events.push({ e: 'bonk', by: att.id, id: vic.id, boost: att.dash > 0 ? 1 : 0, x: r2((a.b.x + c.b.x) / 2), z: r2((a.b.z + c.b.z) / 2) });
  }
  function cpuThink(s, dt) {
    const b = s.b; s.wob += dt * 1.3;
    if (b.flags & (F.OUT | F.FROZEN)) return;
    if (s.spin > 0 || s.dash > 0) { stepBody(b, null, cpuMove, meta.arena); return; }
    // pick the nearest other sled still on the ice (players first when it is close)
    let tgt = null, bd = 1e9;
    for (const o of sleds.values()) { if (o === s || (o.b.flags & F.OUT)) continue; const d = Math.hypot(o.b.x - b.x, o.b.z - b.z) - (o.cpu ? 0 : 1.2); if (d < bd) { bd = d; tgt = o; } }
    const dc = Math.hypot(b.x, b.z);
    let mx = 0, mz = 0;
    if (tgt) {
      // come at the target from the middle's side so the hit sends it outward
      const tx = tgt.b.x, tz = tgt.b.z, td = Math.hypot(tx, tz) || 1, ox = tx / td, oz = tz / td;
      const ax = tx - ox * 1.3, az = tz - oz * 1.3;
      const dx = ax - b.x, dz = az - b.z, dd = Math.hypot(dx, dz) || 1;
      mx = dx / dd; mz = dz / dd;
      const lx = tx - b.x, lz = tz - b.z, ld = Math.hypot(lx, lz) || 1;
      const lined = (lx / ld) * ox + (lz / ld) * oz;     // 1 = the target is straight outward from me
      if (s.dashCool <= 0 && ld < RULES.cpu.lunge[D] && lined > 0.35 && dc < rr - 1.2) { dash(s, lx / ld, lz / ld); return; }
    }
    mx += Math.sin(s.wob) * 0.35; mz += Math.cos(s.wob * 1.27) * 0.35;           // a wobble, so they are not perfect
    if (dc > rr - 2.2) { const k = Math.min(2.5, (dc - (rr - 2.2)) * 1.6); mx -= b.x / (dc || 1) * k; mz -= b.z / (dc || 1) * k; }   // keep off the edge
    const m = Math.hypot(mx, mz) || 1;
    stepBody(b, { mx: mx / m, mz: mz / m, b: 0 }, cpuMove, meta.arena);
  }
  return {
    bodies, events,
    init: () => ({ solo, R, rMin: RULES.rMin, cpus: [...sleds.values()].filter(s => s.cpu).map(s => ({ id: s.id, name: s.name })), left: Math.ceil(time) }),
    input(pid, inp) {
      const s = sleds.get(pid); if (!s || over) return;
      const b = s.b, bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (phase !== PLAY) { stepBody(b, null, meta.move, meta.arena); return; }
      if (pa && s.dashCool <= 0 && s.spin <= 0 && !(b.flags & (F.OUT | F.FROZEN))) dash(s, +inp?.mx || 0, +inp?.mz || 0);
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (phase === COUNT) {
        pt -= dt; const c = Math.ceil(pt);
        if (c < lastCount && c > 0) { lastCount = c; events.push({ e: 'count', n: c }); }
        if (pt <= 0) { events.push({ e: 'go' }); startRound(); }
        return;
      }
      clock += dt; time -= dt;
      if (phase === BETWEEN) { pt -= dt; if (pt <= 0) startRound(); if (time <= 0) finish(); return; }
      rt += dt; rr = iceR();
      for (const s of sleds.values()) {
        if (s.dashCool > 0) s.dashCool -= dt;
        if (s.dash > 0) { s.dash -= dt; if (s.dash <= 0 && s.spin <= 0) s.b.flags &= ~F.STUN; }
        if (s.spin > 0) { s.spin -= dt; if (s.spin <= 0 && s.dash <= 0) s.b.flags &= ~F.STUN; }
        if (s.cpu) cpuThink(s, dt);
      }
      for (const [k, t] of pairCool) { if (t - dt <= 0) pairCool.delete(k); else pairCool.set(k, t - dt); }
      const list = onIce();
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) bump(list[i], list[j]);
      for (const s of list) if (Math.hypot(s.b.x, s.b.z) > rr + RULES.edge) plop(s);
      const left = onIce().length, total = sleds.size;
      if ((total > 1 && left <= 1) || (total === 1 && left === 0)) endRound('out');
      else if (solo && (sleds.get(players[0].pid).b.flags & F.OUT)) endRound('you');          // alone: you fell in, next round
      else if (solo && nCpu && onIce().every(s => !s.cpu)) endRound('clear');
      else if (!nCpu && total === 1 && rt >= RULES.shrinkAfter + RULES.shrinkTime) endRound('thaw');   // alone with no rivals: a round is staying on while the ice shrinks
      if (phase === PLAY && time <= 0) { time = 0; endRound('time'); if (phase !== DONE) finish(); }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = sleds.get(p.pid).pts;
      const g = { sc, ph: phase, rd: round, rr: r2(phase === PLAY ? rr : R), cd: phase === COUNT ? Math.ceil(pt) : 0, left: Math.ceil(Math.max(0, time)) };
      const ds = []; for (const s of sleds.values()) if (s.dash > 0) ds.push(s.id); if (ds.length) g.ds = ds;
      if (nCpu) g.cpu = [...sleds.values()].filter(s => s.cpu).map(s => [s.id, r2(s.b.x), r2(s.b.z), r2(s.b.y), r2(s.b.yaw), s.b.flags]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const v = sleds.get(p.pid).pts; scores[p.pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    sled: id => sleds.get(id), get phase() { return phase; }, get round() { return round; }, get iceR() { return rr; },
  };
}
