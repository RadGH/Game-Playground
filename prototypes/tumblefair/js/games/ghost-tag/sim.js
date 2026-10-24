// GHOST TAG (Halloween only) — a moonlit pumpkin patch with little gravestones, a crooked tree and lantern posts. One
// player starts as the friendly GHOST (floats, glows, a little faster); touch a human and they turn into a ghost too
// (the one button is A: a human's quick dash to dodge, a ghost's BOO! that makes nearby humans stumble).
// Every round each player starts as the ghost once (the order is shuffled from the seed), so with 2-4 players it is
// fair: the round's first ghost waits 2 s (counting, eyes covered) while the humans scatter. A round ends when every
// human is a ghost or its clock runs out. Points: a human scores 1 a second survived; a tag is worth 3 to the ghost
// who made it; the LAST HUMAN STANDING (still human at the bell, or the last one tagged) gets +5. A just-tagged ghost
// rises for 0.8 s before it can chase. Alone: CPU ghosts drift in (one more every 9 s, each a bit quicker); a catch
// costs one of three lanterns and shoos the ghosts back to the corners; score = seconds survived.
import { makeBody, stepBody, separate, spawnRing, clampToArena, collideObstacles, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 9, HD = 6;
export const meta = {
  id: 'ghost-tag', title: 'Ghost Tag', blurb: 'One friendly ghost, everyone else runs — get tagged and you turn into a ghost too!',
  how: ['Human? RUN! A = a quick dash. A ghost touch makes you a ghost.', 'Ghost? Float after the humans and tag them (+3 each). A = BOO!', 'Humans score 1 a second. Last human standing +5!', 'Everyone starts as the ghost once.'],
  kind: 'arena', min: 1, max: 4, seconds: 90, scoring: 'points', unit: 'pts', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Dash / Boo' }, move: { speed: 5.2, accel: 30, stunDrag: 3, boostMul: 1.1 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true }, pitch: 58, card: 'card-ghost-tag', css: true,
};

export const RULES = {
  rounds: { 1: 1, 2: 2, 3: 3, 4: 4 }, roundTime: { 1: 75, 2: 30, 3: 23, 4: 18 },
  count: 2.0, rise: 0.8, between: 2.6, tagR: 0.95, tagPts: 3, lastPts: 5, floatY: 0.35,
  booCool: 3.5, booR: 2.2, booStun: 0.35,         // A as a ghost: BOO! makes nearby humans jump (a short stumble)
  dashCool: 2.4, dashTime: 0.25, dashSpeed: 7,   // A as a human: a quick dodge (extra metres a second on top of the run); ghosts cannot dash
  solo: { lives: 3, every: 9, base: 3.6, step: 0.35, max: 5.6, safe: 1.6, cpuR: 0.9 },
};
const r2 = v => Math.round(v * 100) / 100;
const GHOST = 0, HUMAN = 1;

/** Round 12: three kinds of patch, picked from the seed (the rules are the same; how much there is to hide behind changes). */
export const PATCHES = {
  patch: { name: 'Pumpkin Patch', stones: 3, pumpkins: 3, sw: 0.55, pr: [0.45, 0.65], tries: 60 },
  graveyard: { name: 'Old Graveyard', stones: 5, pumpkins: 1, sw: 0.62, pr: [0.5, 0.6], tries: 160 },
  field: { name: 'Pumpkin Field', stones: 1, pumpkins: 6, sw: 0.55, pr: [0.5, 0.75], tries: 160 },
};
export const PATCH_IDS = Object.keys(PATCHES);
export const patchFor = seed => PATCH_IDS[Math.abs(Math.floor(seed || 0)) % PATCH_IDS.length];
/** The patch: gravestones (boxes) and pumpkins (round), mirrored left-right so neither side is easier; the middle stays clear. */
export function makeLayout(rng, style = 'patch') {
  const S = PATCHES[style] || PATCHES.patch, blocks = [], posts = [];
  const free = (x, z, r) => Math.hypot(x, z) > 2.6 && Math.abs(x) < HW - 1.2 && Math.abs(z) < HD - 1.1 &&
    blocks.every(b => Math.abs(b.x - x) > b.hw + r + 1.1 || Math.abs(b.z - z) > b.hd + r + 1.1) && posts.every(p => Math.hypot(p.x - x, p.z - z) > p.r + r + 1.2);
  for (let k = 0, made = 0; k < S.tries && made < S.stones; k++) {          // gravestones, in pairs
    const x = r2(rng.range(1.8, HW - 1.4)), z = r2(rng.range(-HD + 1.3, HD - 1.3));
    if (!free(x, z, 0.6) || !free(-x, z, 0.6)) continue;
    blocks.push({ x, z, hw: S.sw, hd: 0.22 }, { x: -x, z, hw: S.sw, hd: 0.22 }); made++;
  }
  for (let k = 0, made = 0; k < S.tries && made < S.pumpkins; k++) {          // pumpkins, in pairs
    const x = r2(rng.range(1.5, HW - 1.4)), z = r2(rng.range(-HD + 1.3, HD - 1.3)), r = r2(rng.range(S.pr[0], S.pr[1]));
    if (!free(x, z, r) || !free(-x, z, r)) continue;
    posts.push({ x, z, r }, { x: -x, z, r }); made++;
  }
  posts.push({ x: 0, z: -HD + 1.0, r: 0.45 });                   // the crooked tree at the back
  return { ...meta.arena, blocks, posts };
}

export function create({ seed = 0, rng, players }) {
  const style = patchFor(seed), n = players.length, solo = n === 1, bodies = new Map(), arena = makeLayout(rng, style);
  for (const p of players) bodies.set(p.pid, makeBody(0, 0, 0));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, role: HUMAN, pts: 0, tags: 0, survived: 0, rs: 0, wait: 0, booCool: 0, dashCool: 0, dash: 0, stun: 0, lastHuman: 0, caughtAt: -1, lives: RULES.solo.lives, safe: 0 }]));
  const order = rng.shuffle(players.map(p => p.pid));           // who starts as the ghost each round
  const rounds = RULES.rounds[n], roundLen = RULES.roundTime[n];
  let round = 0, phase = 'between', pt = 1.6, rtime = roundLen, time = meta.seconds, over = false, firstGhost = null, lastTagged = null, cpus = [], cid = 0, spawnIn = 0, elapsed = 0;
  const events = [];
  const humans = () => players.filter(p => P.get(p.pid).role === HUMAN);
  function setRole(pid, role) {
    const s = P.get(pid), b = bodies.get(pid); s.role = role;
    if (role === GHOST) { b.flags |= F.BOOST; b.y = RULES.floatY; } else { b.flags &= ~F.BOOST; b.y = 0; }
  }
  function startRound() {
    round++; phase = 'play'; rtime = roundLen; lastTagged = null;
    firstGhost = solo ? null : order[(round - 1) % n];
    const ring = spawnRing(Math.max(1, n - (solo ? 0 : 1)), solo ? 0 : 5.0, Math.PI);
    let i = 0;
    for (const p of players) {
      const b = bodies.get(p.pid), s = P.get(p.pid);
      b.vx = b.vz = 0; b.flags = 0; s.stun = 0; s.booCool = 0; s.dashCool = 0; s.dash = 0; s.wait = 0; s.safe = 0;
      if (p.pid === firstGhost) { b.x = 0; b.z = 0; b.yaw = 0; setRole(p.pid, GHOST); s.wait = RULES.count; b.flags |= F.FROZEN; }
      else { const at = ring[i++]; b.x = r2(Math.max(-HW + 1, Math.min(HW - 1, at.x * 1.5))); b.z = r2(solo ? 1.5 : at.z); b.yaw = r2(at.yaw); setRole(p.pid, HUMAN); }
    }
    if (solo) { cpus = []; spawnIn = 1.2; }
    events.push({ e: 'round', round, rounds, ghost: firstGhost });
  }
  function endRound(why) {
    for (const s of P.values()) { s.pts += Math.floor(s.rs); s.rs = 0; }        // bank this round's whole seconds
    const left = humans();
    if (left.length) for (const p of left) { P.get(p.pid).pts += RULES.lastPts; P.get(p.pid).lastHuman++; }
    else if (lastTagged != null && !solo) { P.get(lastTagged).pts += RULES.lastPts; P.get(lastTagged).lastHuman++; }
    events.push({ e: 'roundEnd', round, why, last: left.length ? left.map(p => p.pid) : (lastTagged != null ? [lastTagged] : []) });
    for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    if (round >= rounds || time <= RULES.between + 1) { over = true; return; }
    phase = 'between'; pt = RULES.between;
  }
  function tag(pid, by) {
    const s = P.get(pid), b = bodies.get(pid);
    setRole(pid, GHOST); s.wait = RULES.rise; b.flags |= F.FROZEN; b.vx = b.vz = 0; s.caughtAt = elapsed; lastTagged = pid;
    if (by != null) { const g = P.get(by); g.pts += RULES.tagPts; g.tags++; }
    events.push({ e: 'tag', pid, by, x: r2(b.x), z: r2(b.z) });
  }
  // solo: CPU ghosts
  function cpuSpeed(c) { return Math.min(RULES.solo.max, RULES.solo.base + RULES.solo.step * c.k); }
  function spawnCpu() {
    const me = bodies.get(players[0].pid), corners = [[-HW + 1, -HD + 1], [HW - 1, -HD + 1], [-HW + 1, HD - 1], [HW - 1, HD - 1]];
    corners.sort((a, b) => Math.hypot(b[0] - me.x, b[1] - me.z) - Math.hypot(a[0] - me.x, a[1] - me.z));
    const [x, z] = corners[rng.int(0, 1)], c = { id: ++cid, k: cpus.length, body: makeBody(x, z, 0), wob: rng.range(0, 6.28) };
    cpus.push(c); events.push({ e: 'cpu', id: c.id, x, z });
  }
  function shoo() {
    const corners = [[-HW + 1, -HD + 1], [HW - 1, -HD + 1], [-HW + 1, HD - 1], [HW - 1, HD - 1]];
    cpus.forEach((c, i) => { const [x, z] = corners[i % 4]; c.body.x = x; c.body.z = z; c.body.vx = c.body.vz = 0; });
  }
  return {
    bodies, events, arena,
    init: () => ({ solo, arena, patch: style, patchName: PATCHES[style].name, rounds, roundLen, order, lives: solo ? RULES.solo.lives : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (phase !== 'play') return;
      if (pa && s.role === GHOST && s.wait <= 0 && s.booCool <= 0) {
        s.booCool = RULES.booCool;
        for (const [qid, c] of bodies) {
          const q = P.get(qid); if (q.role !== HUMAN || Math.hypot(c.x - b.x, c.z - b.z) > RULES.booR) continue;
          q.stun = RULES.booStun; c.flags |= F.STUN;
        }
        events.push({ e: 'boo', pid, x: r2(b.x), z: r2(b.z) });
      }
      if (pa && s.role === HUMAN && s.dashCool <= 0 && !(b.flags & (F.STUN | F.FROZEN))) { s.dashCool = RULES.dashCool; s.dash = RULES.dashTime; events.push({ e: 'dash', pid }); }
      stepBody(b, inp, meta.move, arena);
      if (s.dash > 0 && !(b.flags & (F.STUN | F.FROZEN))) {        // the dodge: extra distance the way you face (the server's correction carries it to the phone)
        b.x += Math.sin(b.yaw) * RULES.dashSpeed * 0.05; b.z += Math.cos(b.yaw) * RULES.dashSpeed * 0.05;
        clampToArena(b, arena); collideObstacles(b, arena);
      }
    },
    step(dt) {
      if (over) return;
      elapsed += dt; time -= dt;
      if (phase === 'between') { pt -= dt; if (pt <= 0) startRound(); if (time <= 0) over = true; return; }
      rtime -= dt;
      separate([...bodies].filter(([pid]) => P.get(pid).role === HUMAN).map(([, b]) => b));
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) b.flags &= ~F.FROZEN; }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.booCool > 0) s.booCool -= dt;
        if (s.dashCool > 0) s.dashCool -= dt;
        if (s.dash > 0) s.dash -= dt;
        if (s.safe > 0) s.safe -= dt;
        if (s.role === HUMAN) { s.survived += dt; s.rs += dt; }
      }
      // ghosts tag humans they touch (a ghost still counting / rising cannot)
      if (!solo) for (const [gid, g] of bodies) {
        const gs = P.get(gid); if (gs.role !== GHOST || gs.wait > 0) continue;
        for (const [hid, h] of bodies) {
          if (P.get(hid).role !== HUMAN || Math.hypot(h.x - g.x, h.z - g.z) > RULES.tagR) continue;
          tag(hid, gid);
        }
      }
      if (solo) {
        const pid = players[0].pid, me = bodies.get(pid), s = P.get(pid), S = RULES.solo;
        spawnIn -= dt; if (spawnIn <= 0) { spawnIn = S.every; spawnCpu(); }
        for (const c of cpus) {
          c.wob += dt * 1.7;
          const dx = me.x - c.body.x, dz = me.z - c.body.z, d = Math.hypot(dx, dz) || 1, sp = cpuSpeed(c) / meta.move.speed;
          const wx = Math.sin(c.wob) * 0.45, wz = Math.cos(c.wob * 1.3) * 0.45;      // a wobbly drift, not a beeline
          let mx = dx / d + wz * (d > 2 ? 1 : 0.2), mz = dz / d - wx * (d > 2 ? 1 : 0.2); const m = Math.hypot(mx, mz) || 1;
          stepBody(c.body, { mx: mx / m * sp, mz: mz / m * sp, b: 0 }, meta.move, arena);
        }
        for (let i = 0; i < cpus.length; i++) for (let j = i + 1; j < cpus.length; j++) {     // ghosts spread out a little
          const a = cpus[i].body, c = cpus[j].body, dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
          if (d < 1.2 && d > 1e-3) { const k = (1.2 - d) / 2; a.x -= dx / d * k; a.z -= dz / d * k; c.x += dx / d * k; c.z += dz / d * k; }
        }
        if (s.safe <= 0 && cpus.some(c => Math.hypot(c.body.x - me.x, c.body.z - me.z) < S.cpuR)) {
          s.lives--; s.safe = S.safe; s.caughtAt = elapsed; events.push({ e: 'caught', pid, lives: s.lives, x: r2(me.x), z: r2(me.z) });
          if (s.lives <= 0) { setRole(pid, GHOST); endRound('caught'); return; }
          shoo();
        }
      }
      if (!solo && !humans().length) { endRound('all'); return; }
      if (rtime <= 0 || time <= 0) { rtime = 0; endRound('time'); }
    },
    state() {
      const sc = {}, ro = {};
      for (const p of players) {
        const s = P.get(p.pid);
        sc[p.pid] = solo ? Math.floor(s.survived) : s.pts + Math.floor(s.rs);
        ro[p.pid] = s.role === GHOST ? (s.wait > 0 ? 2 : 1) : 0;         // 0 human, 1 ghost, 2 ghost still counting / rising
      }
      const g = { sc, ro, ph: phase, rd: round, rl: Math.ceil(Math.max(0, rtime)), left: Math.ceil(Math.max(0, time)) };
      if (solo) { g.cpu = cpus.map(c => [c.id, r2(c.body.x), r2(c.body.z), r2(c.body.yaw)]); g.lv = P.get(players[0].pid).lives; g.safe = P.get(players[0].pid).safe > 0 ? 1 : 0; }
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const s = P.get(p.pid), v = solo ? Math.floor(s.survived) : s.pts + Math.floor(s.rs); scores[p.pid] = v;
        if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: solo ? 's' : meta.unit };
    },
    stats: pid => ({ ...P.get(pid) }),
    get phase() { return phase; }, get round() { return round; }, get cpus() { return cpus; }, firstGhostOf: r => order[(r - 1) % n],
  };
}
