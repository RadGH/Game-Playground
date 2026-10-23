// DRAGON'S WEAK SPOT — co-op boss fight. A big goofy fairground dragon (painted plywood scales, a bow on its tail)
// lies across the back of the arena. It takes turns:
//   ATTACK (9 s): it telegraphs moves and the team dodges. FIRE RINGS: a ring on the ground marks where a fireball
//   will land (1.4 s warning, shorter later) — be out of it. FIRE SWEEP: its head swings across the whole yard; the
//   swept arc glows first, then a flame sweeps through it — HOP (B) as it reaches you. Getting burnt costs the team a
//   heart (team hearts: 3 + one per player).
//   WINDOW (up to 7 s): it gets dizzy and four glowing scales open on its chest — SUN, MOON, STAR, LEAF, each with a
//   strike pad in front of it. The scales must be hit IN A SECRET ORDER (2-4 long). Each phone privately shows only
//   SOME steps ("Step 2: MOON"), from 2.5 s before the window opens, so the team has to call them out. Stand on the
//   right pad and STRIKE (A): 10 damage, and finishing the whole order adds a bonus. The wrong scale makes it flinch
//   (you are knocked back and the window loses 1.5 s).
// Success = the dragon's health reaches 0 before the bell, with at least one heart left. Scores = damage each player
// dealt. Solo: the phone shows the order one step at a time (the step you are on), so you never have to remember it.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'dragons-weak-spot', title: "Dragon's Weak Spot", blurb: 'Dodge the dragon, share the secret order, and strike its glowing scales!',
  how: ['Fire rings: get out of the ring. Fire sweep: HOP as the flame reaches you.', 'When it gets dizzy, its scales glow: your phone shows PART of the secret order.', 'Call out your steps, stand on the right pad and STRIKE in order!', 'Wrong scale = it flinches. Beat it before the bell!'],
  kind: 'arena', min: 1, max: 4, seconds: 86, scoring: 'coop', unit: 'damage', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Strike', b: 'Hop' }, move: { speed: 6.2, accel: 30, stunDrag: 3 },
  arena: { shape: 'rect', hw: 8, hd: 5.5, wall: true }, pitch: 52, card: 'card-dragons-weak-spot', css: true,
};

/** The four scales: id = index. Shape and name always go with the colour, so colour is never the only cue. */
export const SCALES = [
  { name: 'Sun', shape: 'circle', color: '#ffd23f' },
  { name: 'Moon', shape: 'moon', color: '#5aa9ff' },
  { name: 'Star', shape: 'star', color: '#ff6fb5' },
  { name: 'Leaf', shape: 'leaf', color: '#58d26b' },
];
export const RULES = {
  start: 2.5, attack: 9, prep: 2.5, window: 8,         // seconds; the order shows on phones `prep` s before the window
  pads: [-5.4, -1.8, 1.8, 5.4], padZ: -4.2, reach: 1.45,
  stepDmg: 10, comboPer: 5,                            // a finished order adds comboPer x its length
  wrongCost: 0.8, strikeCool: 0.45,
  chip: 2,                                             // a strike on a pad outside the window still chips it (owner 2026-10-22: "he kept blocking my attacks")
  lengths: [2, 3, 3, 4, 4, 4, 4, 4],                   // order length per window
  hp: { easy: 115, normal: 150, hard: 190 },   // round 5: eased from the bot-tuned numbers
  hearts: 3, heartsPer: 1,
  ringR: 1.35, ringWarn: [1.45, 1.45, 1.25, 1.1], aimed: 0.75,
  slots: [0.5, 3.2, 6.1],                              // attack starts inside the attack phase
  sweepWarn: 1.3, sweepDur: 1.5, sweepArc: 1.32, origin: { x: 0, z: -8.6 },
  hop: 0.62, hopH: 0.95, hopCool: 0.85,
  hurtStun: 0.8, invuln: 1.6, knock: 6,
};
export const heartsFor = n => RULES.hearts + RULES.heartsPer * n;
export const padAt = i => ({ x: RULES.pads[i], z: RULES.padZ });
/** The sweep's beam angle (radians, 0 = straight down the yard) `t` seconds after its warning ended. */
export const sweepAngle = (dir, t) => dir * (-RULES.sweepArc + 2 * RULES.sweepArc * Math.max(0, Math.min(1, t / RULES.sweepDur)));
export const angleOf = (x, z) => Math.atan2(x, z - RULES.origin.z);
/** Who sees step i of window `cyc`: rotates every window so with 4 players and a short order everyone gets turns. */
export const holderOf = (i, cyc, n) => (i + cyc) % n;
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.4, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z * 0.6 + 2.5, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { prevB: 0, hop: 0, hopCool: 0, stun: 0, inv: 0, cool: 0, dmg: 0, hits: 0 }]));
  const hpMax = RULES.hp[difficulty] || RULES.hp.normal;
  let hp = hpMax, hearts = heartsFor(n), time = meta.seconds, phase = 'ready', left = RULES.start, cyc = -1, over = false, success = false;
  let attacks = [], at = 0, rings = [], rid = 0, sweep = null, pattern = [], step = 0;
  const events = [];

  function plan() {           // the attack phase: three slots, at least one of each kind
    const kinds = rng.shuffle(['rings', 'sweep', rng.pick(['rings', 'sweep'])]);
    attacks = RULES.slots.map((t, i) => ({ t: t + rng.range(-0.15, 0.15), kind: kinds[i], done: false }));
  }
  function newPattern() {
    const len = RULES.lengths[Math.min(cyc, RULES.lengths.length - 1)], out = [];
    for (let i = 0; i < len; i++) { let s; do s = rng.int(0, 3); while (i && s === out[i - 1]); out.push(s); }
    pattern = out; step = 0;
  }
  function beginAttack() { cyc++; phase = 'attack'; left = RULES.attack; at = 0; plan(); newPattern(); events.push({ e: 'attack', cyc }); }
  function fireRings() {
    const k = n + 1, warn = RULES.ringWarn[Math.min(cyc, RULES.ringWarn.length - 1)] * (difficulty === 'easy' ? 1.15 : difficulty === 'hard' ? 0.9 : 1);
    const lx = A.hw - 0.8, lz = A.hd - 0.8;
    for (let j = 0; j < k; j++) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 12; tries++) {
        if (rng.chance(RULES.aimed)) { const b = bodies.get(rng.pick(pids)); x = b.x + rng.range(-1.2, 1.2); z = b.z + rng.range(-1.2, 1.2); }
        else { x = rng.range(-lx, lx); z = rng.range(-lz, lz); }
        x = Math.max(-lx, Math.min(lx, x)); z = Math.max(-lz, Math.min(lz, z));
        if (!rings.some(r => Math.hypot(r.x - x, r.z - z) < RULES.ringR * 1.6)) break;
      }
      rings.push({ id: ++rid, x: r2(x), z: r2(z), left: warn + j * 0.12, total: warn + j * 0.12 });
    }
    events.push({ e: 'roar', kind: 'rings' });
  }
  function hurt(pid, fx, fz) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || over) return;
    s.inv = RULES.invuln; s.stun = RULES.hurtStun; hearts = Math.max(0, hearts - 1);
    const dx = b.x - fx, dz = b.z - fz, d = Math.hypot(dx, dz) || 1;
    b.vx = dx / d * RULES.knock; b.vz = dz / d * RULES.knock; b.flags |= F.STUN;
    events.push({ e: 'hurt', pid, hearts });
  }
  function strike(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    let pad = -1;
    for (let i = 0; i < 4; i++) { const p = padAt(i); if (Math.hypot(b.x - p.x, b.z - p.z) <= RULES.reach) pad = i; }
    if (pad < 0) { events.push({ e: 'swing', pid }); return; }
    if (phase !== 'window') {
      if (phase !== 'attack') { events.push({ e: 'clang', pid, pad }); return; }
      const dmg = Math.min(RULES.chip, hp - 1); if (dmg <= 0) { events.push({ e: 'clang', pid, pad }); return; }
      hp -= dmg; s.dmg += dmg; events.push({ e: 'chip', pid, pad, dmg, hp }); return;
    }
    if (pad === pattern[step]) {
      step++; let dmg = RULES.stepDmg; const done = step >= pattern.length;
      if (done) dmg += RULES.comboPer * pattern.length;
      dmg = Math.min(dmg, hp); hp -= dmg; s.dmg += dmg; s.hits++;
      events.push({ e: 'hit', pid, pad, dmg, step, done: done ? 1 : 0, hp });
      if (hp <= 0) finish(true);
      else if (done) { events.push({ e: 'recover', combo: 1 }); beginAttack(); }
    } else {
      left -= RULES.wrongCost; s.stun = 0.3; b.flags |= F.STUN; b.vx = 0; b.vz = 2.5;
      events.push({ e: 'wrong', pid, pad });
    }
  }
  function finish(ok) {
    over = true; success = ok; phase = 'end'; rings = []; sweep = null;
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.AIR); b.y = 0; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, hearts: heartsFor(n), solo: n === 1 }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevA), pb = (bits & IN.B) && !(s.prevBB);
      s.prevA = bits & IN.A; s.prevBB = bits & IN.B;
      const free = !(b.flags & F.STUN);
      if (pb && free && s.hop <= 0 && s.hopCool <= 0) { s.hop = RULES.hop; s.hopCool = RULES.hopCool; b.flags |= F.AIR; events.push({ e: 'hop', pid }); }
      if (pa && free && s.cool <= 0) { s.cool = RULES.strikeCool; strike(pid); }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      time -= dt; left -= dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        s.cool = Math.max(0, s.cool - dt); s.hopCool = Math.max(0, s.hopCool - dt); s.inv = Math.max(0, s.inv - dt);
        if (s.hop > 0) { s.hop -= dt; const t = 1 - Math.max(0, s.hop) / RULES.hop; b.y = r2(4 * RULES.hopH * t * (1 - t)); if (s.hop <= 0) { b.y = 0; b.flags &= ~F.AIR; } }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
      }
      // the moves
      if (phase === 'attack') {
        at += dt;
        for (const a of attacks) if (!a.done && at >= a.t) {
          a.done = true;
          if (a.kind === 'rings') fireRings();
          else { sweep = { id: ++rid, dir: rng.chance(0.5) ? 1 : -1, t: -RULES.sweepWarn }; events.push({ e: 'roar', kind: 'sweep', dir: sweep.dir }); }
        }
      }
      for (const r of rings) {
        r.left -= dt;
        if (r.left <= 0) { events.push({ e: 'boom', x: r.x, z: r.z }); for (const [pid, b] of bodies) if (Math.hypot(b.x - r.x, b.z - r.z) <= RULES.ringR) hurt(pid, r.x, r.z); }
      }
      rings = rings.filter(r => r.left > 0);
      if (sweep) {
        const t0 = sweep.t; sweep.t += dt;
        if (sweep.t > 0) {
          const a0 = sweepAngle(sweep.dir, Math.max(0, t0)), a1 = sweepAngle(sweep.dir, sweep.t);
          const lo = Math.min(a0, a1) - 0.03, hi = Math.max(a0, a1) + 0.03;
          for (const [pid, b] of bodies) { const a = angleOf(b.x, b.z); if (a >= lo && a <= hi && b.y < 0.3) hurt(pid, b.x - Math.sin(a) * 2, b.z - Math.cos(a) * 2); }
        }
        if (sweep.t >= RULES.sweepDur) sweep = null;
      }
      if (hearts <= 0) return finish(false);
      // the phases
      if (left <= 0) {
        if (phase === 'ready') beginAttack();
        else if (phase === 'attack') { phase = 'window'; left = RULES.window * (difficulty === 'easy' ? 1.15 : difficulty === 'hard' ? 0.85 : 1); rings = []; sweep = null; events.push({ e: 'dizzy', len: pattern.length }); }
        else if (phase === 'window') { events.push({ e: 'recover', combo: 0 }); beginAttack(); }
      }
      if (time <= 0) finish(hp <= 0);
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).dmg;
      const g = { ph: phase, hp, hearts, sc, left: Math.max(0, Math.ceil(time)), cyc };
      g.rg = rings.map(r => [r.id, r.x, r.z, r2(r.left), r2(r.total)]);
      if (sweep) g.sw = [sweep.id, sweep.dir, r2(sweep.t)];
      if (phase === 'window') { g.st = step; g.len = pattern.length; g.wl = r2(Math.max(0, left)); }
      if (phase === 'attack') { g.al = r2(left); g.len = pattern.length; }
      return g;
    },
    /** The steps of the order this player may see (solo: only the step the team is on). */
    priv(pid) {
      const show = phase === 'window' || (phase === 'attack' && left <= RULES.prep);
      if (!show) return { pat: null };
      const k = pids.indexOf(pid), mine = [];
      pattern.forEach((s, i) => { if (n === 1 ? i === step : holderOf(i, cyc, n) === k) mine.push([i, s]); });
      return { pat: mine, len: pattern.length, step, cyc };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).dmg;
      return { coop: { success: over ? success : hp <= 0 }, order: [pids.slice()], scores, unit: meta.unit };
    },
  };
}
