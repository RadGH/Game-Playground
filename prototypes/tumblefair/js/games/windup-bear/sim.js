// WIND-UP BEAR (Expansion 1 M5, 2026-11-07) — co-op boss fight. The giant prize teddy from the claw machine has come
// to life, with a big brass wind-up key turning in its back. It picks a FAVOURITE (whoever is nearest its nose when it
// starts walking — a heart balloon floats over them) and plods after them, turning slowly. Every few seconds it stops
// and telegraphs a move:
//   BELLY-FLOP: a ring on the ground in front of it fills up, then it flops onto it — be out of the ring.
//   PAW SWIPE: a wedge in front of it glows, then the paw sweeps through it — get out of the wedge (or behind it).
//   SPIN (from the third move): a ring all round it — get out, or ROLL (B) through it as it spins.
//   SIT-DOWN (once somebody has cranked it): it feels the key turning and plonks its bottom down behind itself — a
//   ring BEHIND it, right on the key wedge. Crankers have to step away too.
// Getting hit costs the team a heart (team hearts: 3 + one per player). After a swipe or a spin it is DIZZY for a few
// seconds (it neither turns nor walks), after a belly-flop it has to get up.
// Its weak spot is the KEY: stand behind it (inside the gold wedge at its back) and press A to crank the key backwards
// = damage. Crank enough in a short time (the key meter) and the bear goes FLOPPY: it flops over for a few seconds and
// every A anywhere next to it does double damage. So the team splits up: one player lures it, the others crank.
// Solo: you are always its favourite, but it turns slowly and is dizzy after a swipe, so you can run round it.
// Success = its health reaches 0 before the bell, with at least one heart left. Scores = damage each player dealt.
import { makeBody, stepBody, separate, spawnRing, clampToArena, F, BODY_R } from '../../shared/arena.js';
import { r2, clamp, byDiff, angDiff, knock, presses, coopResult } from '../boss-kit.js';

export const meta = {
  id: 'windup-bear', title: 'Wind-Up Bear', blurb: 'Lure the giant prize teddy, sneak behind it and crank its wind-up key!',
  how: ['Stand behind the bear and press A to crank its key. Crank fast and it goes floppy!', 'Rings and glowing wedges = a belly-flop, a paw swipe or a sit-down is coming. Get out!', 'B rolls: roll through its spin. The bear chases its favourite — lure it!'],
  kind: 'arena', min: 1, max: 4, seconds: 85, scoring: 'coop', unit: 'damage', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Crank', b: 'Roll' }, move: { speed: 6.2, accel: 30, stunDrag: 3, boostMul: 1.9 },
  arena: { shape: 'rect', hw: 8.5, hd: 6, wall: true }, pitch: 56, card: 'card-windup-bear', css: true,
};

export const RULES = {
  start: 2.4, bearR: 1.25,
  speed: { easy: 1.7, normal: 2.1, hard: 2.5 }, turn: { easy: 1.3, normal: 1.6, hard: 2.0 },
  chase: { easy: 3.0, normal: 2.6, hard: 2.2 },
  warn: { stomp: { easy: 1.9, normal: 1.6, hard: 1.3 }, swipe: { easy: 1.6, normal: 1.35, hard: 1.1 }, sit: { easy: 1.8, normal: 1.5, hard: 1.2 }, spin: { easy: 1.9, normal: 1.6, hard: 1.3 } },
  after: { stomp: { easy: 1.6, normal: 1.4, hard: 1.2 }, swipe: { easy: 2.8, normal: 2.3, hard: 1.9 }, sit: { easy: 1.5, normal: 1.25, hard: 1.0 }, spin: { easy: 3.0, normal: 2.6, hard: 2.2 } },
  stompAhead: 2.1, stompR: 2.3, sitBehind: 1.9, sitR: 1.8, sitChance: 0.5, swipeR: 3.7, swipeHalf: 0.9, spinR: 3.5, spinFrom: 2,
  // the key: a wedge behind the bear
  keyHalf: 0.9, keyReach: 2.9, crankDmg: 1, cool: 0.28,
  meterDecay: 1.5, need: n => 6 + 3 * n, floppy: { easy: 4.2, normal: 3.6, hard: 3.0 }, floppyDmg: 2, floppyReach: 3.1, getup: 1.0,
  hp: { easy: 110, normal: 140, hard: 175 }, hpMul: [1.1, 1.65, 2.6, 3.4],      // hp = table x hpMul[players - 1] (a lurer does not crank, so 2 is not double)
  hearts: 3, heartsPer: 1,
  roll: 0.38, rollCool: 1.0,
  hurtStun: 0.8, invuln: 1.5, knock: 6.5, bump: 4,
};
export const heartsFor = n => RULES.hearts + RULES.heartsPer * n;
export const hpFor = (difficulty, n) => Math.round(byDiff(difficulty, RULES.hp) * RULES.hpMul[clamp(n, 1, 4) - 1]);
/** Where the belly-flop lands for a bear at (x, z) facing yaw. */
export const stompAt = (x, z, yaw) => ({ x: x + Math.sin(yaw) * RULES.stompAhead, z: z + Math.cos(yaw) * RULES.stompAhead });
/** Where the sit-down lands (behind the bear). */
export const sitAt = (x, z, yaw) => ({ x: x - Math.sin(yaw) * RULES.sitBehind, z: z - Math.cos(yaw) * RULES.sitBehind });
/** Is (px, pz) inside the paw-swipe wedge of a bear at (x, z) facing yaw? */
export function inSwipe(px, pz, x, z, yaw) {
  const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
  return d <= RULES.swipeR + BODY_R && Math.abs(angDiff(Math.atan2(dx, dz), yaw)) <= RULES.swipeHalf;
}
/** Is (px, pz) inside the key wedge behind a bear at (x, z) facing yaw (where A cranks the key)? */
export function atKey(px, pz, x, z, yaw) {
  const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
  return d <= RULES.keyReach && Math.abs(angDiff(Math.atan2(dx, dz), yaw + Math.PI)) <= RULES.keyHalf;
}
/** The nose: the point the bear measures "nearest" from when it picks a favourite. */
export const noseOf = (x, z, yaw) => ({ x: x + Math.sin(yaw) * 1.6, z: z + Math.cos(yaw) * 1.6 });

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.3, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z * 0.5 + 3.2, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, inv: 0, cool: 0, roll: 0, rollCool: 0, dmg: 0, cranks: 0 }]));
  const hpMax = hpFor(difficulty, n), need = RULES.need(n);
  const G = { x: 0, z: -2.4, yaw: 0 };
  let hp = hpMax, hearts = heartsFor(n), time = meta.seconds, phase = 'ready', left = RULES.start, cyc = -1, over = false, success = false;
  let fav = pids[0], move = null, mid = 0, meter = 0, flops = 0, felt = false;     // felt: somebody cranked it since its last move
  const events = [];

  function pickFavourite() {
    const nose = noseOf(G.x, G.z, G.yaw); let best = pids[0], bd = Infinity;
    for (const [pid, b] of bodies) { const d = Math.hypot(b.x - nose.x, b.z - nose.z); if (d < bd) { bd = d; best = pid; } }
    return best;
  }
  function beginChase() { cyc++; phase = 'chase'; left = byDiff(difficulty, RULES.chase); fav = pickFavourite(); events.push({ e: 'chase', fav, cyc }); }
  function beginWind() {
    const kinds = cyc >= RULES.spinFrom ? ['stomp', 'swipe', 'spin'] : ['stomp', 'swipe'];
    const kind = felt && rng.chance(RULES.sitChance) ? 'sit' : rng.pick(kinds), w = byDiff(difficulty, RULES.warn[kind]) * (cyc >= 6 ? 0.9 : 1);
    phase = 'wind'; left = w; move = { id: ++mid, kind, total: w }; felt = false;
    events.push({ e: 'wind', kind });
  }
  function hurt(pid, fx, fz) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || s.roll > 0 || over) return false;
    s.inv = RULES.invuln; s.stun = RULES.hurtStun; knock(b, fx, fz, RULES.knock); hearts = Math.max(0, hearts - 1);
    events.push({ e: 'hurt', pid, hearts });
    return true;
  }
  function land() {             // the telegraphed move happens
    const kind = move.kind;
    if (kind === 'stomp') {
      const p = stompAt(G.x, G.z, G.yaw);
      for (const [pid, b] of bodies) if (Math.hypot(b.x - p.x, b.z - p.z) <= RULES.stompR + 0.2) hurt(pid, p.x, p.z);
      events.push({ e: 'stomp', x: r2(p.x), z: r2(p.z) });
    } else if (kind === 'sit') {
      const p = sitAt(G.x, G.z, G.yaw);
      for (const [pid, b] of bodies) if (Math.hypot(b.x - p.x, b.z - p.z) <= RULES.sitR + 0.2) hurt(pid, p.x, p.z);
      events.push({ e: 'sit', x: r2(p.x), z: r2(p.z) });
    } else if (kind === 'swipe') {
      for (const [pid, b] of bodies) if (inSwipe(b.x, b.z, G.x, G.z, G.yaw)) hurt(pid, G.x, G.z);
      events.push({ e: 'swipe' });
    } else {
      for (const [pid, b] of bodies) if (Math.hypot(b.x - G.x, b.z - G.z) <= RULES.spinR + 0.2) hurt(pid, G.x, G.z);
      events.push({ e: 'spin' });
    }
    phase = kind === 'stomp' || kind === 'sit' ? 'stuck' : 'dizzy'; left = byDiff(difficulty, RULES.after[kind]); move = null;
  }
  function deal(pid, dmg, kind) {
    const s = P.get(pid); dmg = Math.min(dmg, hp); hp -= dmg; s.dmg += dmg; s.cranks++;
    events.push({ e: kind, pid, dmg, hp });
    if (hp <= 0) finish(true);
  }
  function crank(pid) {
    const b = bodies.get(pid);
    if (phase === 'floppy') {
      if (Math.hypot(b.x - G.x, b.z - G.z) <= RULES.floppyReach) return deal(pid, RULES.floppyDmg, 'whack');
      events.push({ e: 'swing', pid }); return;
    }
    if (phase === 'ready' || phase === 'getup' || !atKey(b.x, b.z, G.x, G.z, G.yaw)) { events.push({ e: 'swing', pid }); return; }
    meter += 1; felt = true; deal(pid, RULES.crankDmg, 'crank');
    if (over) return;
    if (meter >= need) { meter = 0; flops++; phase = 'floppy'; left = byDiff(difficulty, RULES.floppy); move = null; events.push({ e: 'flop', by: pid }); }
  }
  function finish(ok) {
    over = true; success = ok; phase = 'end'; move = null;
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.BOOST | F.AIR); b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, hearts: heartsFor(n), need, solo: n === 1 }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp), free = !(b.flags & F.STUN);
      if (pr.b && free && s.rollCool <= 0) { s.roll = RULES.roll; s.rollCool = RULES.rollCool; b.flags |= F.BOOST | F.AIR; events.push({ e: 'roll', pid }); }
      if (pr.a && free && s.cool <= 0) { s.cool = RULES.cool; crank(pid); }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      time -= dt; left -= dt;
      meter = Math.max(0, meter - RULES.meterDecay * dt);
      separate(bodies.values());
      const flat = phase === 'floppy';
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        s.cool = Math.max(0, s.cool - dt); s.inv = Math.max(0, s.inv - dt); s.rollCool = Math.max(0, s.rollCool - dt);
        if (s.roll > 0) { s.roll -= dt; if (s.roll <= 0) b.flags &= ~(F.BOOST | F.AIR); }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        // the bear is solid (a floppy bear is flat: you can stand right next to it, but not in it)
        const dx = b.x - G.x, dz = b.z - G.z, d = Math.hypot(dx, dz), min = (flat ? 0.9 : RULES.bearR) + BODY_R;
        if (d < min) { if (d < 1e-3) b.x += min; else { b.x += dx / d * (min - d); b.z += dz / d * (min - d); } clampToArena(b, A); }
      }
      // the bear plods after its favourite: it turns slowly and only walks the way it faces
      if (phase === 'chase') {
        const t = bodies.get(fav), dx = t.x - G.x, dz = t.z - G.z, d = Math.hypot(dx, dz);
        const tr = byDiff(difficulty, RULES.turn) * dt; G.yaw += clamp(angDiff(Math.atan2(dx, dz), G.yaw), -tr, tr);
        if (d > RULES.bearR + 1.2) { const v = byDiff(difficulty, RULES.speed) * dt; G.x += Math.sin(G.yaw) * v; G.z += Math.cos(G.yaw) * v; }
        G.x = clamp(G.x, -A.hw + 1.6, A.hw - 1.6); G.z = clamp(G.z, -A.hd + 1.6, A.hd - 1.6);
        // walking into someone shoves them aside (no heart lost)
        for (const [pid, b] of bodies) { const s = P.get(pid); if (s.inv <= 0 && s.roll <= 0 && !(b.flags & F.STUN) && Math.hypot(b.x - G.x, b.z - G.z) < RULES.bearR + BODY_R + 0.05 && Math.abs(angDiff(Math.atan2(b.x - G.x, b.z - G.z), G.yaw)) < 0.7) { knock(b, G.x, G.z, RULES.bump); s.stun = 0.3; s.inv = 0.5; events.push({ e: 'bump', pid }); } }
      } else if (phase === 'wind' && move) {
        // the first moment of a telegraph it still turns a little toward its favourite, then the aim is locked
        if (left > move.total - 0.3) { const t = bodies.get(fav), tr = byDiff(difficulty, RULES.turn) * dt; G.yaw += clamp(angDiff(Math.atan2(t.x - G.x, t.z - G.z), G.yaw), -tr, tr); }
      }
      if (left <= 0) {
        if (phase === 'ready' || phase === 'stuck' || phase === 'dizzy') beginChase();
        else if (phase === 'chase') beginWind();
        else if (phase === 'wind') land();
        else if (phase === 'floppy') { phase = 'getup'; left = RULES.getup; events.push({ e: 'getup' }); }
        else if (phase === 'getup') beginChase();
      }
      if (hearts <= 0 && !over) return finish(false);
      if (time <= 0 && !over) finish(hp <= 0);
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).dmg;
      const g = { ph: phase, bx: r2(G.x), bz: r2(G.z), by: r2(G.yaw), hp, hearts, sc, left: Math.max(0, Math.ceil(time)), fv: fav, m: r2(meter), pl: r2(Math.max(0, left)), cyc };
      if (move) g.mv = [move.id, move.kind, r2(Math.max(0, left)), r2(move.total)];
      return g;
    },
    get over() { return over; },
    get flops() { return flops; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).dmg;
      return coopResult(pids, scores, over ? success : hp <= 0, meta.unit);
    },
  };
}
