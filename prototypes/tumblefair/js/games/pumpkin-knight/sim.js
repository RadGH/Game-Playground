// PUMPKIN KNIGHT — co-op boss fight, Halloween only (round 8). A clanky, friendly-silly suit of armour with no head
// stomps round a moonlit pumpkin patch; its HEAD — a grinning jack-o'-lantern — bounces round the patch on its own.
//   While the head is loose, the knight is protected (A on it just goes CLANG). Kick the head (A next to it) into the
//     bubbling CAULDRON at the back: kicks get gentle aim help toward the cauldron (~30 degrees), and a slow head
//     hops about by itself, so chase it.
//   HEAD IN THE POT: the knight goes wobbly and kneels for a few seconds (6 s; 7 easy, 5 hard) — run over and bonk it
//     (A) for damage. Then the head pops back out and away.
//   The knight walks after its head; if it reaches it, it scoops it up and lobs it somewhere far (you see where).
//   It also swings its big wooden sword at anyone close in FRONT of it: an orange wedge on the ground fills up first.
//     Caught = knocked back and dizzy for a moment. Nothing is ever lost.
// Beat its health before the bell. Scores: 1 a bonk + 3 for kicking the head into the pot.
// Solo: a slower knight and a smaller health bar.
import { makeBody, stepBody, separate, spawnRing, clampToArena, F, BODY_R } from '../../shared/arena.js';
import { r2, clamp, byDiff, angDiff, aimHelp, knock, presses, coopResult } from '../boss-kit.js';

const HW = 9, HD = 6.5;
export const POT = { x: 0, z: -HD + 1.5, r: 0.85 };
export const meta = {
  id: 'pumpkin-knight', title: 'Pumpkin Knight', blurb: 'Kick the knight’s runaway pumpkin head into the cauldron, then bonk the headless knight!',
  how: ['While its head is loose the knight is protected.', 'Kick the bouncing pumpkin head (A) into the bubbling cauldron.', 'Head in the pot = the knight kneels: bonk it with A!', 'Orange wedge = sword swing. Step aside!'],
  kind: 'arena', min: 1, max: 4, seconds: 72, scoring: 'coop', unit: 'pts', tags: ['coop', 'action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Kick / Bonk' }, move: { speed: 6.2, accel: 30, stunDrag: 2.6 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true, posts: [{ x: POT.x, z: POT.z, r: POT.r }] }, pitch: 56, card: 'card-pumpkin-knight', css: false,
};
export const RULES = {
  start: 2.2, knightR: 0.85, reach: 1.7, kickR: 1.25, cool: 0.33,
  hp: { easy: 30, normal: 40, hard: 50 }, hpPer: 0.5, goalPts: 3,
  window: { easy: 7, normal: 6, hard: 5 }, speed: { easy: 1.3, normal: 1.6, hard: 1.95 },
  kick: 10.5, cone: 0.52, friction: 1.25, bounce: 0.85, hopEvery: 1.6, hop: 3.2, headR: 0.42, potR: 1.12,
  grab: 0.9, grabR: 1.15, lob: 1.1,
  swingR: 2.7, swingArc: 0.95, swingWarn: { easy: 1.1, normal: 0.9, hard: 0.75 }, swingCool: 2.6,
  hurtStun: 0.9, invuln: 1.4, knock: 6.5,
};
export const hpFor = (n, d) => Math.round(byDiff(d, RULES.hp) * (1 + RULES.hpPer * (n - 1)));

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.2, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z * 0.5 + 3.6, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, inv: 0, cool: 0, dmg: 0, goals: 0 }]));
  const hpMax = hpFor(n, difficulty);
  const Kn = { x: 0, z: 0, yaw: Math.PI, ph: 'walk', t: 0, swing: null, swingCool: 1.5, flinch: 0 };
  const H = { x: 3, z: 0.5, vx: 0, vz: 0, y: 0, hop: 1, held: false, lastKick: null, air: 0, lob: null };
  let hp = hpMax, time = meta.seconds, elapsed = 0, over = false, success = false;
  const events = [];

  function hurt(pid, fx, fz) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || over) return;
    s.inv = RULES.invuln; s.stun = RULES.hurtStun; knock(b, fx, fz, RULES.knock);
    events.push({ e: 'hurt', pid });
  }
  function launch(x, z) {                                        // the head arcs to (x, z), then bounces on from there
    H.held = false; H.lob = { x0: H.x, z0: H.z, x1: clamp(x, -HW + 1, HW - 1), z1: clamp(z, -HD + 1, HD - 1), t: 0 };
    H.vx = H.vz = 0;
  }
  function act(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    // the knight first if it is kneeling (that is the window), else the head, else a clang on the armour
    const dk = Math.hypot(b.x - Kn.x, b.z - Kn.z);
    if (Kn.ph === 'kneel' && dk <= RULES.reach) {
      hp--; s.dmg++; Kn.flinch = 0.2; events.push({ e: 'bonk', pid, hp });
      if (hp <= 0) finish(true);
      return;
    }
    if (!H.held && !H.lob && Kn.ph !== 'kneel' && Math.hypot(b.x - H.x, b.z - H.z) <= RULES.kickR) {
      const aim = aimHelp(b.x, b.z, b.yaw, [POT], RULES.cone);
      H.vx = Math.sin(aim.yaw) * RULES.kick; H.vz = Math.cos(aim.yaw) * RULES.kick; H.lastKick = pid; H.hop = RULES.hopEvery;
      events.push({ e: 'kick', pid, aimed: aim.target ? 1 : 0 });
      return;
    }
    if (dk <= RULES.reach) { events.push({ e: 'clang', pid }); return; }
    events.push({ e: 'swing', pid });
  }
  function finish(ok) {
    over = true; success = ok; Kn.swing = null;
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~F.STUN; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, pot: POT, solo: n === 1 }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp);
      if (pr.a && !(b.flags & F.STUN) && s.cool <= 0) { s.cool = RULES.cool; act(pid); }
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
        const dx = b.x - Kn.x, dz = b.z - Kn.z, d = Math.hypot(dx, dz), min = RULES.knightR + BODY_R;
        if (d < min) { if (d < 1e-3) b.x += min; else { b.x += dx / d * (min - d); b.z += dz / d * (min - d); } clampToArena(b, A); }
      }
      if (elapsed < RULES.start) return;
      Kn.flinch = Math.max(0, Kn.flinch - dt); Kn.swingCool = Math.max(0, Kn.swingCool - dt);
      // ---- the head
      if (H.lob) {
        H.lob.t += dt; const k = Math.min(1, H.lob.t / RULES.lob);
        H.x = H.lob.x0 + (H.lob.x1 - H.lob.x0) * k; H.z = H.lob.z0 + (H.lob.z1 - H.lob.z0) * k; H.y = 4 * 3.5 * k * (1 - k);
        if (k >= 1) { H.lob = null; H.y = 0; H.hop = RULES.hopEvery; events.push({ e: 'thud', x: r2(H.x), z: r2(H.z) }); }
      } else if (!H.held && Kn.ph !== 'kneel') {
        const f = Math.exp(-RULES.friction * dt); H.vx *= f; H.vz *= f;
        H.x += H.vx * dt; H.z += H.vz * dt;
        const lx = HW - RULES.headR, lz = HD - RULES.headR;
        if (H.x > lx) { H.x = lx; H.vx = -Math.abs(H.vx) * RULES.bounce; } else if (H.x < -lx) { H.x = -lx; H.vx = Math.abs(H.vx) * RULES.bounce; }
        if (H.z > lz) { H.z = lz; H.vz = -Math.abs(H.vz) * RULES.bounce; } else if (H.z < -lz) { H.z = -lz; H.vz = Math.abs(H.vz) * RULES.bounce; }
        // into the pot?
        if (Math.hypot(H.x - POT.x, H.z - POT.z) <= RULES.potR) {
          const k = H.lastKick; if (k != null) { P.get(k).goals++; P.get(k).dmg += RULES.goalPts; }
          H.x = POT.x; H.z = POT.z; H.vx = H.vz = 0;
          Kn.ph = 'kneel'; Kn.t = byDiff(difficulty, RULES.window); Kn.swing = null;
          events.push({ e: 'goal', pid: k ?? -1 });
        } else {
          // a slow head hops about by itself (away from the pot, so it never scores itself)
          const sp = Math.hypot(H.vx, H.vz);
          if (sp < 1.2) { H.hop -= dt; if (H.hop <= 0) { let a = rng.range(-Math.PI, Math.PI); const toPot = Math.atan2(POT.x - H.x, POT.z - H.z); if (Math.abs(angDiff(a, toPot)) < 0.9) a += Math.PI; H.vx = Math.sin(a) * RULES.hop; H.vz = Math.cos(a) * RULES.hop; H.hop = RULES.hopEvery; H.lastKick = null; events.push({ e: 'hophead' }); } }
          // a hop or bounce never leaves it stuck against the pot
          const dp = Math.hypot(H.x - POT.x, H.z - POT.z), minP = POT.r + RULES.headR;
          if (dp < minP && H.lastKick == null) { H.x = POT.x + (H.x - POT.x) / dp * minP; H.z = POT.z + (H.z - POT.z) / dp * minP; }
        }
        H.y = Math.abs(Math.sin(elapsed * 6)) * Math.min(0.5, Math.hypot(H.vx, H.vz) * 0.06);
      }
      // ---- the knight
      if (Kn.ph === 'kneel') {
        Kn.t -= dt;
        if (Kn.t <= 0) { Kn.ph = 'walk'; H.x = POT.x; H.z = POT.z + POT.r + 0.6; const a = rng.range(-1.1, 1.1); launch(Math.sin(a) * 6, POT.z + 4 + Math.cos(a) * 3); events.push({ e: 'popout' }); }
      } else if (Kn.ph === 'grab') {
        Kn.t -= dt; H.x = Kn.x; H.z = Kn.z;
        if (Kn.t <= 0) {
          Kn.ph = 'walk';
          // lob it far from the knight and from the pot
          let best = null, bd = -1;
          for (let k = 0; k < 6; k++) { const x = rng.range(-HW + 1.5, HW - 1.5), z = rng.range(-HD + 2.5, HD - 1.2), d = Math.hypot(x - Kn.x, z - Kn.z) + Math.hypot(x - POT.x, z - POT.z) * 0.5; if (d > bd) { bd = d; best = { x, z }; } }
          launch(best.x, best.z); events.push({ e: 'lob', x: r2(best.x), z: r2(best.z) });
        }
      } else {
        // sword swing at the nearest player in front
        if (Kn.swing) {
          Kn.swing.left -= dt;
          if (Kn.swing.left <= 0) {
            for (const [pid, b] of bodies) { const d = Math.hypot(b.x - Kn.x, b.z - Kn.z), a = Math.atan2(b.x - Kn.x, b.z - Kn.z); if (d <= RULES.swingR + 0.25 && Math.abs(angDiff(a, Kn.swing.yaw)) <= RULES.swingArc + 0.1) hurt(pid, Kn.x, Kn.z); }
            events.push({ e: 'slash' }); Kn.swing = null; Kn.swingCool = RULES.swingCool;
          }
        } else {
          let near = null, nd = RULES.swingR - 0.3;
          for (const b of bodies.values()) { const d = Math.hypot(b.x - Kn.x, b.z - Kn.z); if (d < nd && Math.abs(angDiff(Math.atan2(b.x - Kn.x, b.z - Kn.z), Kn.yaw)) < 1.3) { nd = d; near = b; } }
          if (near && Kn.swingCool <= 0) { const w = byDiff(difficulty, RULES.swingWarn); Kn.swing = { yaw: Math.atan2(near.x - Kn.x, near.z - Kn.z), left: w, total: w }; Kn.yaw = Kn.swing.yaw; events.push({ e: 'raise' }); }
          else if (!H.lob) {
            const dx = H.x - Kn.x, dz = H.z - Kn.z, d = Math.hypot(dx, dz);
            Kn.yaw += clamp(angDiff(Math.atan2(dx, dz), Kn.yaw), -3 * dt, 3 * dt);
            if (d > RULES.grabR) { const v = byDiff(difficulty, RULES.speed) * dt; Kn.x += Math.sin(Kn.yaw) * v; Kn.z += Math.cos(Kn.yaw) * v; }
            else { Kn.ph = 'grab'; Kn.t = RULES.grab; H.held = true; H.vx = H.vz = 0; events.push({ e: 'grab' }); }
          }
        }
        Kn.x = clamp(Kn.x, -HW + 1, HW - 1); Kn.z = clamp(Kn.z, -HD + 1, HD - 1);
        const dp = Math.hypot(Kn.x - POT.x, Kn.z - POT.z), minP = POT.r + RULES.knightR;
        if (dp < minP) { Kn.x = POT.x + (Kn.x - POT.x) / (dp || 1) * minP; Kn.z = POT.z + (Kn.z - POT.z) / (dp || 1) * minP; }
      }
      if (time <= 0) finish(hp <= 0);
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).dmg;
      const g = { kn: [r2(Kn.x), r2(Kn.z), r2(Kn.yaw), Kn.ph, Kn.flinch > 0 ? 1 : 0], hd: [r2(H.x), r2(H.z), r2(H.y), H.held ? 1 : 0, Kn.ph === 'kneel' ? 1 : 0], hp, sc, left: Math.max(0, Math.ceil(time)), end: over ? (success ? 1 : 2) : 0 };
      if (Kn.swing) g.sw = [r2(Kn.swing.yaw), r2(Kn.swing.left), r2(Kn.swing.total)];
      if (Kn.ph === 'kneel') g.kl = r2(Kn.t);
      if (H.lob) g.lob = [r2(H.lob.x1), r2(H.lob.z1)];
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).dmg;
      return coopResult(pids, scores, over ? success : hp <= 0, meta.unit);
    },
  };
}
