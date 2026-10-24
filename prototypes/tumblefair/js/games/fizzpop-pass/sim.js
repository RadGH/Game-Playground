// FIZZPOP PASS — hot potato on a picnic lawn. One player holds a fizzing cream pie with a fuse nobody can see. Bump
// into someone (or press A when they are close) to hand it over; whoever is holding it when it goes off is SPLATTED
// and loses a life. The pie fizzes harder as it gets close (the sparks grow and the ticking speeds up), but the warning
// is never exact. Whoever just handed it to you cannot take it straight back (a short no-pass-back), and a fresh
// holder must hold it for a moment before passing. The holder runs a little faster. Everyone still standing scores a
// point each time someone else is splatted; out of lives = out, cheering from the picnic blanket. Last one standing
// wins (+2). Alone: two CPU picnickers to play pass with — splat them for points, three lives for you.
// Round 12 (1/1, "confusing"): the rules were fine but invisible — a fresh holder could not pass for 0.45 s and the
// giver could not take it back for 1.6 s, and nothing on screen said either. Now the hold is 0.25 s, bumping reaches a
// little further (touchR 1.25, PASS 2.2 m), the view puts a 🚫 over whoever you cannot pass back to, shows the fizz as
// a 4-step meter in the status pill, and pops a +1 over everyone who scores from a splat.
import { makeBody, stepBody, separate, clampToArena, collideObstacles, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'fizzpop-pass', title: 'Fizzpop Pass', blurb: 'Pass the fizzing pie before it pops — don’t be holding it when it goes SPLAT!',
  how: ['Got the pie? Bump into someone (or press PASS near them) to hand it over.', 'It fizzes faster near the end — nobody knows exactly when it pops.', 'No passing straight back: the giver wears a 🚫 for a moment.', 'Holding it at SPLAT = lose a life; everyone else gets +1.'],
  kind: 'arena', min: 1, max: 4, seconds: 100, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Pass' }, move: { speed: 5.0, accel: 20, stunDrag: 2.5, boostMul: 1.17 },
  arena: { shape: 'circle', r: 6.6, wall: true, posts: [{ x: 0, z: 0.3, r: 0.65 }], blocks: [{ x: -3.2, z: -2.1, hw: 1.0, hd: 0.55 }, { x: 3.2, z: 2.3, hw: 1.0, hd: 0.55 }] },
  pitch: 58, card: 'card-fizzpop-pass', css: true,
};

export const RULES = {
  ready: 2.4, fuse: [6, 11], pause: 2.2, endPause: 2.4,
  touchR: 1.25, passR: 2.2, holdMin: 0.25, noBack: 1.6,
  lives: n => (n === 2 ? 3 : 2), soloLives: 3, winBonus: 2,
  heatJitter: 0.35,
  bench: { z: -5.3, xs: [-1.2, 0, 1.2, 2.4] },
  cpu: { speedMul: 0.86, names: ['Dot', 'Pip'], chaseOther: 0.25, juggle: 0.7 },
};
const READY = 0, LIVE = 1, POP = 2, DONE = 3;
export const PHASES = ['ready', 'live', 'pop', 'done'];
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, spawns = spawnRing(solo ? 3 : n, 3.9);
  const bodies = new Map();
  // everyone who can hold the pie: the players, plus two CPU picnickers when alone (negative ids)
  const R = new Map();
  players.forEach((p, i) => { const b = makeBody(r2(spawns[i].x), r2(spawns[i].z), r2(spawns[i].yaw)); b.flags = F.FROZEN; bodies.set(p.pid, b); R.set(p.pid, { id: p.pid, cpu: false, b, lives: solo ? RULES.soloLives : RULES.lives(n), pts: 0, out: false, outAt: -1, prevB: 0, held: 0 }); });
  if (solo) RULES.cpu.names.forEach((name, j) => { const s = spawns[j + 1], b = makeBody(r2(s.x), r2(s.z), r2(s.yaw)); b.flags = F.FROZEN; R.set(-1 - j, { id: -1 - j, cpu: true, name, b, lives: 99, pts: 0, out: false, outAt: -1, prevB: 0, held: 0, wander: rng.range(0, 6.28), think: 0 }); });
  const cpuMove = { ...meta.move, speed: meta.move.speed * RULES.cpu.speedMul, boostMul: 1 };      // a CPU holding the pie gets no speed-up
  let phase = READY, pt = RULES.ready, holder = null, from = null, since = 0, fuse = 0, burnt = 0, jitter = 0, time = meta.seconds, elapsed = 0, over = false, endIn = -1, pops = 0;
  const events = [];
  const standing = () => [...R.values()].filter(r => !r.out);
  const canTake = (r, giver) => !r.out && r.id !== giver.id && !(r.id === from && since < RULES.noBack);
  function give(id, by = null) {
    if (holder != null) R.get(holder).b.flags &= ~F.BOOST;
    from = by; holder = id; since = 0;
    R.get(id).b.flags |= F.BOOST;
    events.push({ e: 'pass', to: id, from: by });
  }
  function light() { fuse = rng.range(RULES.fuse[0], RULES.fuse[1]); burnt = 0; jitter = rng.range(-RULES.heatJitter, RULES.heatJitter); }
  function pop() {
    const h = R.get(holder);
    h.lives--; pops++; h.b.flags = (h.b.flags & ~F.BOOST) | F.STUN;
    for (const r of standing()) if (r !== h && !r.cpu) r.pts++;
    if (!h.cpu && h.lives <= 0) { h.out = true; h.outAt = elapsed; }
    events.push({ e: 'pop', id: h.id, lives: h.lives, x: r2(h.b.x), z: r2(h.b.z) });
    holder = null; from = null; phase = POP; pt = RULES.pause;
    for (const r of R.values()) { r.b.flags |= F.FROZEN; r.b.vx = r.b.vz = 0; }
    return h;
  }
  let lastPopped = null;
  function toBench() {
    let j = 0;
    for (const r of R.values()) if (r.out) { const b = r.b; b.x = RULES.bench.xs[j++ % 4]; b.z = RULES.bench.z; b.y = 0; b.yaw = 0; b.vx = b.vz = 0; b.flags = F.FROZEN | F.GHOST; }
  }
  function resume() {
    toBench();
    const st = standing(), me = solo ? R.get(players[0].pid) : null;
    if ((solo && me.out) || (!solo && st.length <= 1)) return finish();
    for (const r of st) r.b.flags &= ~(F.FROZEN | F.STUN);
    const pool = st.filter(r => r.id !== lastPopped);
    give(rng.pick(pool.length ? pool : st).id); light(); phase = LIVE;
  }
  function finish() {
    phase = DONE; endIn = RULES.endPause;
    const st = standing().filter(r => !r.cpu);
    if (!solo && st.length === 1) st[0].pts += RULES.winBonus;
    for (const r of R.values()) { r.b.flags |= F.FROZEN; r.b.flags &= ~F.BOOST; r.b.vx = r.b.vz = 0; }
    if (holder != null) holder = null;
    events.push({ e: 'done', win: !solo && st.length === 1 ? st[0].id : null });
  }
  function tryPass(r, wantA) {
    if (holder !== r.id || since < RULES.holdMin) return;
    let best = null, bd = wantA ? RULES.passR : RULES.touchR;
    for (const o of R.values()) { if (!canTake(o, r)) continue; const d = Math.hypot(o.b.x - r.b.x, o.b.z - r.b.z); if (d < bd) { bd = d; best = o; } }
    if (best) give(best.id, r.id);
    else if (wantA && !r.cpu) events.push({ e: 'nopass', to: r.id, back: [...R.values()].some(o => o.id === from && since < RULES.noBack && Math.hypot(o.b.x - r.b.x, o.b.z - r.b.z) < RULES.passR) });
  }
  function cpuThink(r, dt) {
    const b = r.b; if (b.flags & (F.FROZEN | F.STUN)) return;
    const me = R.get(players[0].pid).b;
    let mx = 0, mz = 0;
    if (holder === r.id && since < RULES.cpu.juggle) { b.vx *= 0.5; b.vz *= 0.5; return; }     // a fresh CPU holder juggles the hot pie for a moment
    if (holder === r.id) {
      // chase: usually the player, sometimes the other picnicker (if it can take it)
      r.think -= dt; if (r.think <= 0) { r.think = rng.range(1.5, 3); r.target = rng.chance(RULES.cpu.chaseOther) ? 'cpu' : 'me'; }
      let t = me; if (r.target === 'cpu') { const o = [...R.values()].find(o => o.cpu && o !== r); if (o && canTake(o, r)) t = o.b; }
      mx = t.x - b.x; mz = t.z - b.z;
    } else if (holder != null) {
      const h = R.get(holder).b; const dx = b.x - h.x, dz = b.z - h.z, d = Math.hypot(dx, dz) || 1;
      r.wander += dt * 0.9;
      if (d < 4.5) { mx = dx / d; mz = dz / d; mx += -b.x * 0.09; mz += -b.z * 0.09; mx += Math.sin(r.wander) * 0.5; mz += Math.cos(r.wander) * 0.5; }
      else { mx = Math.sin(r.wander) * 0.4; mz = Math.cos(r.wander) * 0.4; }
    }
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    stepBody(b, { mx, mz, b: 0 }, cpuMove, meta.arena);
    if (holder === r.id) tryPass(r, false);
  }
  return {
    bodies, events,
    init: () => ({ solo, cpus: solo ? RULES.cpu.names.map((name, j) => ({ id: -1 - j, name })) : [], bench: RULES.bench, left: Math.ceil(time) }),
    input(pid, inp) {
      const r = R.get(pid); if (!r || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(r.prevB & IN.A); r.prevB = bits;
      if (r.out || phase !== LIVE) return;
      stepBody(r.b, inp, meta.move, meta.arena);
      if (pa) tryPass(r, true);
    },
    step(dt) {
      if (over) return;
      elapsed += dt;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      time -= dt;
      if (phase === READY) {
        pt -= dt;
        if (pt <= 0) { phase = LIVE; for (const r of R.values()) r.b.flags &= ~F.FROZEN; const pool = solo ? [...R.values()].filter(r => r.cpu) : standing(); give(rng.pick(pool).id); light(); }
      } else if (phase === LIVE) {
        since += dt; burnt += dt;
        for (const r of R.values()) if (r.cpu) cpuThink(r, dt);
        { const list = standing().map(r => r.b); separate(list); for (const b of list) { clampToArena(b, meta.arena); collideObstacles(b, meta.arena); } }
        if (holder != null) { const h = R.get(holder); h.held += dt; if (!h.cpu) tryPass(h, false); }
        if (burnt >= fuse) { lastPopped = pop().id; }
      } else if (phase === POP) {
        pt -= dt; if (pt <= 0) resume();
      }
      if (time <= 0 && phase !== DONE) { time = 0; toBench(); finish(); }
    },
    state() {
      const sc = {}, lv = {};
      for (const p of players) { const r = R.get(p.pid); sc[p.pid] = r.pts; lv[p.pid] = r.lives; }
      const heat = phase === LIVE ? Math.max(0, Math.min(3, Math.floor(burnt / fuse * 4 + jitter))) : 0;
      const g = { ph: PHASES[phase], hold: holder, from: since < RULES.noBack ? from : null, h: heat, sc, lv, left: Math.ceil(Math.max(0, time)) };
      if (solo) g.cpu = [...R.values()].filter(r => r.cpu).map(r => [r.id, r2(r.b.x), r2(r.b.z), r2(r.b.yaw), r.b.flags, r2(Math.hypot(r.b.vx, r.b.vz))]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const r = R.get(p.pid); scores[p.pid] = r.pts;
        const key = r.pts * 100 + Math.max(0, r.lives);
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get holder() { return holder; }, get phase() { return PHASES[phase]; }, get fuse() { return fuse; }, racer: id => R.get(id),
    _burn(t) { burnt = Math.max(burnt, fuse - t); },
  };
}
