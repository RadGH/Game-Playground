// FROST GIANT'S WEAK SPOT (Winter Fair, Expansion 1 M6, 2026-11-07) — co-op boss fight, the winter cousin of Dragon's
// Weak Spot (the owner's favourite). A huge goofy giant made of snowballs and icicles sits across the back of a snowy
// yard. It takes turns:
//   ATTACK (8.5 s): it telegraphs moves and the team dodges. ICICLES: a ring on the ground marks where an icicle will
//   drop (1.4 s warning, shorter later) — be out of it. FREEZE WAVE: it stamps, and a frosty ring rolls out from its
//   feet across the whole yard (it glows first) — HOP (B) as it reaches you. Getting hit costs the team a heart
//   (team hearts: 3 + one per player).
//   SNOWBALLS: you throw snowballs, and you have to fetch them. Stand in one of the two snow piles at the front of the
//   yard to scoop them up (one every 0.35 s, three at most) — so the team keeps moving between the piles and the pads.
//   WINDOW (up to 7.5 s): it gets dizzy and four ice crystals open on its chest — FLAKE, STAR, HEART, BELL, each with a
//   throw pad in front of it. The crystals must be hit IN A SECRET ORDER (2-4 long). Each phone privately shows only
//   SOME steps, from 2.5 s before the window opens, so the team has to call them out. Stand on the right pad and THROW
//   (A, costs a snowball): 10 damage, and finishing the whole order adds a bonus. The wrong crystal makes it flinch
//   (you are knocked back and the window loses 0.8 s). No snowball = nothing happens ("Grab snowballs!").
// Success = the giant's health reaches 0 before the bell, with at least one heart left. Scores = damage each player
// dealt. Solo: the phone shows the order one step at a time, and a CPU helper — Pip the snow sprite — tosses a
// snowball at the right crystal now and then during a window (often on Family, rarely on Tricky).
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'frost-giant', title: "Frost Giant's Weak Spot", blurb: 'Grab snowballs, dodge the giant, and hit its crystals in the secret order!',
  how: ['Stand in a snow pile to scoop up snowballs (3 at most).', 'Icicles: get out of the ring. Freeze wave: HOP as it reaches you.', 'When it gets dizzy, your phone shows PART of the secret order. Call it out!', 'Stand on the right pad and THROW. Beat it before the bell!'],
  kind: 'arena', min: 1, max: 4, seconds: 90, scoring: 'coop', unit: 'damage', tags: ['coop', 'action', 'holiday'], season: 'winter', rival: true,
  controls: { stick: true, a: 'Throw', b: 'Hop' }, move: { speed: 6.2, accel: 24, stunDrag: 3 },
  arena: { shape: 'rect', hw: 8, hd: 5.5, wall: true }, pitch: 52, card: 'card-frost-giant', css: true,
};

/** The four crystals: id = index. Shape and name always go with the colour, so colour is never the only cue. */
export const GEMS = [
  { name: 'Flake', shape: 'flake', color: '#7fd0ff' },
  { name: 'Star', shape: 'star', color: '#ffd23f' },
  { name: 'Heart', shape: 'heart', color: '#ff6fb5' },
  { name: 'Bell', shape: 'bell', color: '#58d26b' },
];
export const RULES = {
  start: 2.5, attack: 8.5, prep: 2.5, window: 7.5,
  pads: [-5.4, -1.8, 1.8, 5.4], padZ: -4.2, reach: 1.45,
  piles: [{ x: -6.3, z: 3.6 }, { x: 6.3, z: 3.6 }], pileR: 1.5, scoop: 0.35, ammoMax: 3, ammoStart: 2,
  stepDmg: 10, comboPer: 5, chip: 2,
  wrongCost: 0.8, throwCool: 0.4,
  lengths: [2, 3, 3, 4, 4, 4, 4, 4],
  hp: { easy: 100, normal: 130, hard: 165 },
  hearts: 3, heartsPer: 1,
  ringR: 1.35, ringWarn: [1.45, 1.45, 1.25, 1.1], aimed: 0.75,
  slots: [0.5, 3.1, 5.9],
  waveWarn: 1.2, waveDur: 1.7, waveFrom: 2.6, waveTo: 17, waveBand: 0.55, origin: { x: 0, z: -8.6 },
  hop: 0.62, hopH: 0.95, hopCool: 0.85,
  hurtStun: 0.8, invuln: 1.6, knock: 6,
  pip: { easy: 2.2, normal: 3.2, hard: 4.6 },          // solo helper: seconds between Pip's throws in a window
  pipDmg: 6,
};
export const heartsFor = n => RULES.hearts + RULES.heartsPer * n;
export const padAt = i => ({ x: RULES.pads[i], z: RULES.padZ });
/** The freeze wave's radius `t` seconds after its warning ended. */
export const waveRadius = t => RULES.waveFrom + (RULES.waveTo - RULES.waveFrom) * Math.max(0, Math.min(1, t / RULES.waveDur));
export const distFromGiant = (x, z) => Math.hypot(x - RULES.origin.x, z - RULES.origin.z);
/** Who sees step i of window `cyc`: rotates every window so with 4 players and a short order everyone gets turns. */
export const holderOf = (i, cyc, n) => (i + cyc) % n;
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal', rivals }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.4, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z * 0.6 + 2.5, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { hop: 0, hopCool: 0, stun: 0, inv: 0, cool: 0, dmg: 0, hits: 0, ammo: RULES.ammoStart, scoop: 0 }]));
  const hpMax = RULES.hp[difficulty] || RULES.hp.normal, solo = n === 1, pipOn = solo && rivals !== false;   // rivals === false: no Pip ("every computer player is optional")
  let hp = hpMax, hearts = heartsFor(n), time = meta.seconds, phase = 'ready', left = RULES.start, cyc = -1, over = false, success = false;
  let attacks = [], at = 0, rings = [], rid = 0, wave = null, pattern = [], step = 0, pipT = 0, pipDmg = 0;
  const events = [];

  function plan() {           // the attack phase: three slots, at least one of each kind
    const kinds = rng.shuffle(['rings', 'wave', rng.pick(['rings', 'wave'])]);
    attacks = RULES.slots.map((t, i) => ({ t: t + rng.range(-0.15, 0.15), kind: kinds[i], done: false }));
  }
  function newPattern() {
    const len = RULES.lengths[Math.min(cyc, RULES.lengths.length - 1)], out = [];
    for (let i = 0; i < len; i++) { let s; do s = rng.int(0, 3); while (i && s === out[i - 1]); out.push(s); }
    pattern = out; step = 0;
  }
  function beginAttack() { cyc++; phase = 'attack'; left = RULES.attack; at = 0; plan(); newPattern(); events.push({ e: 'attack', cyc }); }
  function dropIcicles() {
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
  /** Damage the current step (a player's throw or Pip's). Returns the damage dealt. */
  function hitStep(pad, base) {
    step++; let dmg = base; const done = step >= pattern.length;
    if (done) dmg += RULES.comboPer * pattern.length;
    dmg = Math.min(dmg, hp); hp -= dmg;
    return { dmg, done };
  }
  function afterHit(done) {
    if (hp <= 0) finish(true);
    else if (done) { events.push({ e: 'recover', combo: 1 }); beginAttack(); }
  }
  function toss(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    let pad = -1;
    for (let i = 0; i < 4; i++) { const p = padAt(i); if (Math.hypot(b.x - p.x, b.z - p.z) <= RULES.reach) pad = i; }
    if (s.ammo <= 0) { events.push({ e: 'empty', pid, to: pid }); return; }
    s.ammo--;
    if (pad < 0) { events.push({ e: 'miss', pid, x: r2(b.x), z: r2(b.z), yaw: r2(b.yaw) }); return; }
    if (phase !== 'window') {
      if (phase !== 'attack') { events.push({ e: 'clang', pid, pad }); return; }
      const dmg = Math.min(RULES.chip, hp - 1); if (dmg <= 0) { events.push({ e: 'clang', pid, pad }); return; }
      hp -= dmg; s.dmg += dmg; events.push({ e: 'chip', pid, pad, dmg, hp }); return;
    }
    if (pad === pattern[step]) {
      const { dmg, done } = hitStep(pad, RULES.stepDmg); s.dmg += dmg; s.hits++;
      events.push({ e: 'hit', pid, pad, dmg, step, done: done ? 1 : 0, hp });
      afterHit(done);
    } else {
      left -= RULES.wrongCost; s.stun = 0.3; b.flags |= F.STUN; b.vx = 0; b.vz = 2.5;
      events.push({ e: 'wrong', pid, pad });
    }
  }
  function finish(ok) {
    over = true; success = ok; phase = 'end'; rings = []; wave = null;
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.AIR); b.y = 0; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, hearts: heartsFor(n), solo, ...(pipOn ? {} : { nopip: 1 }) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !s.prevA, pb = (bits & IN.B) && !s.prevB;
      s.prevA = bits & IN.A; s.prevB = bits & IN.B;
      const free = !(b.flags & F.STUN);
      if (pb && free && s.hop <= 0 && s.hopCool <= 0) { s.hop = RULES.hop; s.hopCool = RULES.hopCool; b.flags |= F.AIR; events.push({ e: 'hop', pid }); }
      if (pa && free && s.cool <= 0) { s.cool = RULES.throwCool; toss(pid); }
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
        // scooping snowballs in a pile
        if (s.ammo < RULES.ammoMax && RULES.piles.some(p => Math.hypot(b.x - p.x, b.z - p.z) <= RULES.pileR)) {
          s.scoop += dt; if (s.scoop >= RULES.scoop) { s.scoop = 0; s.ammo++; events.push({ e: 'scoop', pid, ammo: s.ammo, to: pid }); }
        } else s.scoop = 0;
      }
      if (phase === 'attack') {
        at += dt;
        for (const a of attacks) if (!a.done && at >= a.t) {
          a.done = true;
          if (a.kind === 'rings') dropIcicles();
          else { wave = { id: ++rid, t: -RULES.waveWarn }; events.push({ e: 'roar', kind: 'wave' }); }
        }
      }
      for (const r of rings) {
        r.left -= dt;
        if (r.left <= 0) { events.push({ e: 'boom', x: r.x, z: r.z }); for (const [pid, b] of bodies) if (Math.hypot(b.x - r.x, b.z - r.z) <= RULES.ringR) hurt(pid, r.x, r.z); }
      }
      rings = rings.filter(r => r.left > 0);
      if (wave) {
        const t0 = wave.t; wave.t += dt;
        if (wave.t > 0) {
          const r0 = waveRadius(Math.max(0, t0)), r1 = waveRadius(wave.t), lo = r0 - RULES.waveBand, hi = r1 + RULES.waveBand;
          for (const [pid, b] of bodies) { const d = distFromGiant(b.x, b.z); if (d >= lo && d <= hi && b.y < 0.3) hurt(pid, RULES.origin.x, RULES.origin.z); }
        }
        if (wave.t >= RULES.waveDur) wave = null;
      }
      if (hearts <= 0) return finish(false);
      // Pip, the solo helper: a snowball at the right crystal every so often during a window
      if (pipOn && phase === 'window') {
        pipT += dt;
        if (pipT >= (RULES.pip[difficulty] ?? RULES.pip.normal)) {
          pipT = 0; const pad = pattern[step], { dmg, done } = hitStep(pad, RULES.pipDmg); pipDmg += dmg;
          events.push({ e: 'pip', pad, dmg, step, done: done ? 1 : 0, hp });
          afterHit(done); if (over) return;
        }
      }
      if (left <= 0) {
        if (phase === 'ready') beginAttack();
        else if (phase === 'attack') { phase = 'window'; pipT = 0; left = RULES.window * (difficulty === 'easy' ? 1.15 : difficulty === 'hard' ? 0.85 : 1); rings = []; wave = null; events.push({ e: 'dizzy', len: pattern.length }); }
        else if (phase === 'window') { events.push({ e: 'recover', combo: 0 }); beginAttack(); }
      }
      if (time <= 0) finish(hp <= 0);
    },
    state() {
      const sc = {}, am = {}; for (const pid of pids) { sc[pid] = P.get(pid).dmg; am[pid] = P.get(pid).ammo; }
      const g = { ph: phase, hp, hearts, sc, am, left: Math.max(0, Math.ceil(time)), cyc };
      g.rg = rings.map(r => [r.id, r.x, r.z, r2(r.left), r2(r.total)]);
      if (wave) g.wv = [wave.id, r2(wave.t)];
      if (phase === 'window') { g.st = step; g.len = pattern.length; g.wl = r2(Math.max(0, left)); }
      if (phase === 'attack') { g.al = r2(left); g.len = pattern.length; }
      return g;
    },
    /** The steps of the order this player may see (solo: only the step the team is on). */
    priv(pid) {
      const show = phase === 'window' || (phase === 'attack' && left <= RULES.prep);
      if (!show) return { pat: null };
      const k = pids.indexOf(pid), mine = [];
      pattern.forEach((s, i) => { if (solo ? i === step : holderOf(i, cyc, n) === k) mine.push([i, s]); });
      return { pat: mine, len: pattern.length, step, cyc };
    },
    get over() { return over; },
    get pipDamage() { return pipDmg; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).dmg;
      return { coop: { success: over ? success : hp <= 0 }, order: [pids.slice()], scores, unit: meta.unit };
    },
  };
}
