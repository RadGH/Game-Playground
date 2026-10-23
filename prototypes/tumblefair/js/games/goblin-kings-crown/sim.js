// GOBLIN KING'S CROWN — everyone vs one boss, but the score is YOURS (round 8). A pudgy green Goblin King with a
// too-big golden crown and a royal cape waddles round his treasure courtyard. Everyone bonks him (A, standing next
// to him): every bonk is 1 point, and the FINAL bonk that topples him is worth +5 and ends the game. He never blocks.
// What he does back (all telegraphed on the ground first):
//   BARRELS: he lifts a barrel over his head and lobs it at someone — a red ring shows where it lands (1.2 s). Caught =
//     knocked down and dizzy for a moment (no points lost).
//   ROYAL HOP: after a flurry of bonks (or every few seconds) he crouches and leaps to another spot; his landing ring
//     shows where. Caught = knocked back.
//   GOBLIN SNEAKS: he whistles up two little goblins with sacks. They run at whoever has the MOST points; a sneak that
//     touches you steals 2 of your points and runs off. Bonk a sneak first (A) for +1.
// Solo: a score attack — beat him and every second left on the clock is a bonus point.
import { makeBody, stepBody, separate, spawnRing, clampToArena, F, BODY_R } from '../../shared/arena.js';
import { r2, clamp, byDiff, angDiff, knock, presses, rankResult } from '../boss-kit.js';

export const meta = {
  id: 'goblin-kings-crown', title: "Goblin King's Crown", blurb: 'Bonk the Goblin King for points — the final bonk wins the crown bonus!',
  how: ['Bonk the King with A: 1 point a bonk. The final bonk is +5!', 'Red ring = a barrel or his landing. Get out of it!', 'Little goblin sneaks steal 2 points from the leader. Bonk them first (+1).', 'Most points wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Bonk' }, move: { speed: 6.2, accel: 30, stunDrag: 2.6 },
  arena: { shape: 'rect', hw: 9, hd: 6.5, wall: true }, pitch: 56, card: 'card-goblin-kings-crown', css: false,
};
export const RULES = {
  start: 2.2, kingR: 0.95, reach: 1.75, cool: 0.38, finalBonus: 5,
  hp: { easy: 55, normal: 75, hard: 95 }, hpPer: 0.45,           // x (1 + hpPer * (players - 1))
  speed: { easy: 1.5, normal: 1.9, hard: 2.4 },
  barrelEvery: { easy: 3.4, normal: 2.8, hard: 2.2 }, barrelWarn: { easy: 1.4, normal: 1.2, hard: 1.0 }, barrelR: 1.35,
  hopAfter: n => 6 + 2 * n, hopEvery: 6, crouch: 0.6, air: 0.9, landR: 1.9,
  sneakEvery: { easy: 11, normal: 9, hard: 7.5 }, sneakFirst: 7, sneakSpeed: { easy: 3.0, normal: 3.4, hard: 3.9 }, sneakR: 0.8, steal: 2, sneakLife: 9, sneakBonk: 1.4,
  hurtStun: 0.9, invuln: 1.4, knock: 6.5,
};
export const hpFor = (n, d) => Math.round(byDiff(d, RULES.hp) * (1 + RULES.hpPer * (n - 1)));

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.4, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z * 0.5 + 3.6, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, inv: 0, cool: 0, pts: 0, bonks: 0, sneaks: 0, lost: 0, final: 0 }]));
  const hpMax = hpFor(n, difficulty);
  const Kg = { x: 0, z: -2, yaw: 0, y: 0, ph: 'walk', t: 0, tx: 0, tz: 0, sinceHop: 0, hitsSinceHop: 0, flinch: 0 };
  let hp = hpMax, time = meta.seconds, elapsed = 0, over = false, rings = [], rid = 0, sneaks = [], sid = 0;
  let barrelT = 2.5, sneakT = RULES.sneakFirst, winner = null, timeBonus = 0;
  const events = [];

  const scoreOf = pid => P.get(pid).pts;
  function newWander() { Kg.tx = rng.range(-A.hw + 2, A.hw - 2); Kg.tz = rng.range(-A.hd + 2, A.hd - 2); }
  newWander();
  function hurt(pid, fx, fz) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || over) return;
    s.inv = RULES.invuln; s.stun = RULES.hurtStun; knock(b, fx, fz, RULES.knock);
    events.push({ e: 'hurt', pid });
  }
  function startHop() {
    Kg.ph = 'crouch'; Kg.t = RULES.crouch; Kg.hitsSinceHop = 0; Kg.sinceHop = 0;
    // land away from where everyone is crowding, inside the yard
    let best = null, bd = -1;
    for (let k = 0; k < 8; k++) {
      const x = rng.range(-A.hw + 2, A.hw - 2), z = rng.range(-A.hd + 2, A.hd - 2);
      const d = Math.min(...[...bodies.values()].map(b => Math.hypot(b.x - x, b.z - z))) + (Math.hypot(x - Kg.x, z - Kg.z) > 4 ? 1 : 0);
      if (d > bd) { bd = d; best = { x, z }; }
    }
    Kg.lx = r2(best.x); Kg.lz = r2(best.z); Kg.sx = Kg.x; Kg.sz = Kg.z;
    const w = RULES.crouch + RULES.air;
    rings.push({ id: ++rid, x: Kg.lx, z: Kg.lz, r: RULES.landR, left: w, total: w, kind: 'land' });
    events.push({ e: 'hop' });
  }
  function throwBarrel() {
    const pid = rng.pick(pids), b = bodies.get(pid), w = byDiff(difficulty, RULES.barrelWarn);
    const x = clamp(b.x + b.vx * 0.4 + rng.range(-0.6, 0.6), -A.hw + 0.8, A.hw - 0.8), z = clamp(b.z + b.vz * 0.4 + rng.range(-0.6, 0.6), -A.hd + 0.8, A.hd - 0.8);
    rings.push({ id: ++rid, x: r2(x), z: r2(z), r: RULES.barrelR, left: w, total: w, kind: 'barrel' });
    Kg.throwT = 0.45; events.push({ e: 'throw', pid, id: rid });
  }
  function summon() {
    const k = n === 1 ? 1 : 2;
    for (let i = 0; i < k; i++) { const a = rng.range(-Math.PI, Math.PI); sneaks.push({ id: ++sid, x: Kg.x + Math.sin(a) * 1.4, z: Kg.z + Math.cos(a) * 1.4, life: RULES.sneakLife, flee: 0, fx: 0, fz: 0 }); }
    events.push({ e: 'summon', k });
  }
  function bonk(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    // a sneak in reach first (they are the threat), else the King
    let best = null, bd = RULES.sneakBonk;
    for (const m of sneaks) if (!m.flee) { const d = Math.hypot(b.x - m.x, b.z - m.z); if (d <= bd) { bd = d; best = m; } }
    if (best) { best.dead = true; s.pts += 1; s.sneaks++; events.push({ e: 'pop', pid, id: best.id, x: r2(best.x), z: r2(best.z) }); return; }
    const air = Kg.ph === 'air';
    if (!air && Math.hypot(b.x - Kg.x, b.z - Kg.z) <= RULES.reach) {
      hp--; s.bonks++; s.pts++; Kg.hitsSinceHop++; Kg.flinch = 0.25;
      if (hp <= 0) { s.pts += RULES.finalBonus; s.final = 1; winner = pid; events.push({ e: 'bonk', pid, hp: 0, final: 1 }); return finish(); }
      events.push({ e: 'bonk', pid, hp });
      if (Kg.ph === 'walk' && Kg.hitsSinceHop >= RULES.hopAfter(n)) startHop();
      return;
    }
    events.push({ e: 'swing', pid });
  }
  function finish() {
    over = true; rings = []; sneaks = [];
    if (n === 1 && hp <= 0) { timeBonus = Math.max(0, Math.ceil(time)); P.get(pids[0]).pts += timeBonus; }
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~F.STUN; b.vx = b.vz = 0; }
    events.push({ e: 'end', winner, beaten: hp <= 0 ? 1 : 0, bonus: timeBonus });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, solo: n === 1 }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp);
      if (pr.a && !(b.flags & F.STUN) && s.cool <= 0) { s.cool = RULES.cool; bonk(pid); }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      time -= dt; elapsed += dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        s.cool = Math.max(0, s.cool - dt); s.inv = Math.max(0, s.inv - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (Kg.ph !== 'air') { const dx = b.x - Kg.x, dz = b.z - Kg.z, d = Math.hypot(dx, dz), min = RULES.kingR + BODY_R; if (d < min) { if (d < 1e-3) b.x += min; else { b.x += dx / d * (min - d); b.z += dz / d * (min - d); } clampToArena(b, A); } }
      }
      if (elapsed < RULES.start) return;
      Kg.flinch = Math.max(0, Kg.flinch - dt); Kg.throwT = Math.max(0, (Kg.throwT || 0) - dt);
      // the King
      if (Kg.ph === 'walk') {
        Kg.sinceHop += dt;
        const dx = Kg.tx - Kg.x, dz = Kg.tz - Kg.z, d = Math.hypot(dx, dz);
        if (d < 0.5) newWander();
        else { Kg.yaw += clamp(angDiff(Math.atan2(dx, dz), Kg.yaw), -3 * dt, 3 * dt); const v = byDiff(difficulty, RULES.speed) * dt * (Kg.flinch > 0 ? 0.3 : 1); Kg.x += Math.sin(Kg.yaw) * v; Kg.z += Math.cos(Kg.yaw) * v; }
        Kg.x = clamp(Kg.x, -A.hw + 1.2, A.hw - 1.2); Kg.z = clamp(Kg.z, -A.hd + 1.2, A.hd - 1.2);
        if (Kg.sinceHop >= RULES.hopEvery) startHop();
      } else if (Kg.ph === 'crouch') { Kg.t -= dt; if (Kg.t <= 0) { Kg.ph = 'air'; Kg.t = RULES.air; } }
      else if (Kg.ph === 'air') {
        Kg.t -= dt; const k = 1 - Math.max(0, Kg.t) / RULES.air;
        Kg.x = Kg.sx + (Kg.lx - Kg.sx) * k; Kg.z = Kg.sz + (Kg.lz - Kg.sz) * k; Kg.y = 4 * 3.2 * k * (1 - k);
        if (Kg.t <= 0) { Kg.ph = 'walk'; Kg.y = 0; Kg.x = Kg.lx; Kg.z = Kg.lz; newWander(); }
      }
      // barrels and summons on their own clocks (not mid-hop)
      barrelT -= dt; sneakT -= dt;
      if (barrelT <= 0 && Kg.ph === 'walk') { throwBarrel(); barrelT = byDiff(difficulty, RULES.barrelEvery) * (time < 20 ? 0.85 : 1); }
      if (sneakT <= 0 && Kg.ph === 'walk') { summon(); sneakT = byDiff(difficulty, RULES.sneakEvery); }
      for (const r of rings) {
        r.left -= dt;
        if (r.left <= 0) { events.push({ e: r.kind === 'land' ? 'land' : 'crash', x: r.x, z: r.z }); for (const [pid, b] of bodies) if (Math.hypot(b.x - r.x, b.z - r.z) <= r.r + 0.2) hurt(pid, r.x, r.z); }
      }
      rings = rings.filter(r => r.left > 0);
      // sneaks: run at the leader (most points, then nearest); steal on touch, then flee off the yard
      for (const m of sneaks) {
        const best = Math.max(...pids.map(scoreOf));
        m.life -= dt; let tx, tz, sp = byDiff(difficulty, RULES.sneakSpeed);
        if (m.flee) { tx = m.fx; tz = m.fz; sp *= 1.5; }
        else {
          let tgt = null, td = 1e9;
          for (const pid of pids) { if (scoreOf(pid) !== best) continue; const b = bodies.get(pid), d = Math.hypot(b.x - m.x, b.z - m.z); if (d < td) { td = d; tgt = pid; } }
          const b = bodies.get(tgt); tx = b.x; tz = b.z;
          for (const pid of pids) { const bb = bodies.get(pid); if (Math.hypot(bb.x - m.x, bb.z - m.z) <= RULES.sneakR && P.get(pid).pts > 0) {
            const s = P.get(pid), take = Math.min(RULES.steal, s.pts); s.pts -= take; s.lost += take;
            m.flee = 1; const a = Math.atan2(m.x, m.z); m.fx = Math.sin(a) * 14; m.fz = Math.cos(a) * 14;
            events.push({ e: 'steal', pid, id: m.id, n: take }); break;
          } }
        }
        const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz); if (d > 1e-3) { const v = Math.min(d, sp * dt); m.x += dx / d * v; m.z += dz / d * v; m.yaw = Math.atan2(dx, dz); }
        if (m.life <= 0 || (m.flee && (Math.abs(m.x) > A.hw + 1 || Math.abs(m.z) > A.hd + 1))) m.dead = true;
      }
      sneaks = sneaks.filter(m => !m.dead);
      if (time <= 0) finish();
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).pts;
      return { k: [r2(Kg.x), r2(Kg.z), r2(Kg.yaw), r2(Kg.y), Kg.ph, Kg.flinch > 0 ? 1 : 0, Kg.throwT > 0 ? 1 : 0], hp, sc, left: Math.max(0, Math.ceil(time)), end: over ? 1 : 0,
        rg: rings.map(r => [r.id, r.x, r.z, r.r, r2(r.left), r2(r.total), r.kind === 'land' ? 1 : 0]), mn: sneaks.map(m => [m.id, r2(m.x), r2(m.z), r2(m.yaw || 0), m.flee]) };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).pts;
      return rankResult(pids, scores, meta.unit);
    },
  };
}
