// PILLOW FIGHT — everyone on one giant bed, high off the bedroom floor, with nothing round the edge. A = swing your
// pillow: it bops everyone just in front of you (a little aim help turns you to the nearest), and the bop sends them
// sliding. Every bop you take raises your WOBBLE (shown over your head, like a percentage), and the higher it is, the
// further the next bop sends you. Slide off the bed and you are out for 2 s (you land on the rug and climb back up)
// and your wobble goes back to 0; whoever bopped you last gets the knock-off (+1). B = a quick hop to dodge. Most
// points wins. Round 12 ("buggy", 2/1): ONLY A BOP SENDS YOU OVER — walking, hopping or being shoved by a crowd to the
// edge makes you teeter on it instead of falling, and a fall no longer costs a point. Before, most falls were someone
// walking or hopping off by themselves, nobody scored, the -1 floored at 0, and whole games ended 0-0-0. Solo: sleepwalkers in nightcaps climb onto the bed and shuffle at you with their arms out
// — a sleepwalker bump wobbles you too. Bop them off the bed for points.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'pillow-fight', title: 'Pillow Fight', blurb: 'Bop everyone off the giant bed with your pillow — the more they are hit, the further they fly!',
  how: ['A swings your pillow at whoever is in front.', 'Every bop raises their wobble %: they fly further.', 'Bop someone off the bed: +1. Only a bop sends you over.', 'B hops out of the way.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Swing', b: 'Hop' }, move: { speed: 5.6, accel: 18, stunDrag: 1.5 },
  arena: { shape: 'rect', hw: 6.5, hd: 4.6, wall: false }, pitch: 56, card: 'card-pillow-fight', css: true,
};

export const BED_Y = 0, FLOOR_Y = -1.6;
export const RULES = {
  swingCool: 0.42, reach: 1.75, cone: 1.05, aim: 1.5,              // cone / aim: half-angles in radians (aim help turns you)
  push: 4.4, pushPer: 0.055, stun: 0.3, stunPer: 0.0025,            // knock-back speed = push * (1 + pushPer * wobble)
  wobble: { easy: 10, normal: 13, hard: 16 },                       // wobble added per bop
  hopCool: 1.3, hopSpeed: 9.5, hopTime: 0.25,
  edgeX: 6.5, edgeZ: 4.6,                                           // centre further out than this = falling
  out: 2.0, ghost: 1.2, credit: 3.0, teeter: 0.7,                  // credit: a fall this soon after a bop counts as knocked off
  sleep: {                                                          // solo sleepwalkers
    speed: { easy: 1.3, normal: 1.75, hard: 2.2 }, max: { easy: 3, normal: 4, hard: 5 }, every: 2.6, first: 1.2,
    bumpR: 1.05, bumpCool: 1.3, bumpPush: 3.6, bumpWobble: { easy: 6, normal: 9, hard: 12 }, r: 0.5,
  },
};
const r2 = v => Math.round(v * 100) / 100;
const knockSpeed = w => RULES.push * (1 + RULES.pushPer * w);

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.wobble[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map(), spawns = spawnRing(n, solo ? 0 : 2.6);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, cool: 0, hopCool: 0, hop: 0, stun: 0, wob: 0, pts: 0, kos: 0, falls: 0, falling: false, vy: 0, back: 0, ghost: 0, by: -1, byAt: -99, teeter: 0 }]));
  let sleepers = [], sid = 0, sleepIn = RULES.sleep.first, time = meta.seconds, el = 0, over = false;
  const events = [];
  const onBed = (x, z) => Math.abs(x) <= RULES.edgeX && Math.abs(z) <= RULES.edgeZ;
  const free = pid => { const s = P.get(pid); return !s.falling; };
  const hittable = pid => free(pid) && !(bodies.get(pid).flags & F.GHOST);
  function knock(target, fromX, fromZ, addWob, by, isSleeper) {
    // push `target` (a player state + body, or a sleepwalker) straight away from (fromX, fromZ)
    const t = target, dx = t.x - fromX, dz = t.z - fromZ, d = Math.hypot(dx, dz) || 1;
    t.wob = Math.min(300, t.wob + addWob);
    const sp = knockSpeed(t.wob);
    t.vx = dx / d * sp; t.vz = dz / d * sp;
    return RULES.stun + RULES.stunPer * t.wob;
  }
  function safeSpot() {
    let best = { x: 0, z: 0 }, bestD = -1;
    for (let k = 0; k < 10; k++) {
      const x = rng.range(-3.5, 3.5), z = rng.range(-2.4, 2.4);
      let d = 99; for (const [pid, b] of bodies) if (free(pid)) d = Math.min(d, Math.hypot(b.x - x, b.z - z));
      for (const s of sleepers) d = Math.min(d, Math.hypot(s.x - x, s.z - z));
      if (d > bestD) { bestD = d; best = { x, z }; }
    }
    return best;
  }
  function startFall(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.falling = true; s.vy = 1.5; s.back = RULES.out; b.flags |= F.STUN; s.hop = 0;
    const credit = s.by >= 0 && el - s.byAt <= RULES.credit && s.by !== pid ? s.by : -1;
    if (credit >= 0) { const c = P.get(credit); c.pts++; c.kos++; }
    s.falls++;
    events.push({ e: 'fall', pid, by: credit, x: r2(b.x), z: r2(b.z) });
  }
  return {
    bodies, events,
    init: () => ({ solo, bedY: BED_Y, floorY: FLOOR_Y, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const ready = !s.falling && !(b.flags & F.STUN);
      if (pa && ready && s.cool <= 0) {
        s.cool = RULES.swingCool;
        // targets: players and sleepwalkers. Aim help: turn to the nearest one within reach and the wide aim angle.
        const cands = [];
        for (const [qid, c] of bodies) if (qid !== pid && hittable(qid)) cands.push({ kind: 'p', id: qid, x: c.x, z: c.z });
        for (const sl of sleepers) if (!sl.falling) cands.push({ kind: 's', id: sl.id, x: sl.x, z: sl.z, sl });
        const ang = c => { let da = Math.atan2(c.x - b.x, c.z - b.z) - b.yaw; return Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); };
        let near = null, nd = 99;
        for (const c of cands) { const d = Math.hypot(c.x - b.x, c.z - b.z); if (d <= RULES.reach && ang(c) <= RULES.aim && d < nd) { nd = d; near = c; } }
        if (near) b.yaw = Math.atan2(near.x - b.x, near.z - b.z);
        const hits = [];
        for (const c of cands) {
          if (Math.hypot(c.x - b.x, c.z - b.z) > RULES.reach || ang(c) > RULES.cone) continue;
          if (c.kind === 'p') {
            const q = P.get(c.id), cb = bodies.get(c.id), tgt = { x: cb.x, z: cb.z, wob: q.wob, vx: 0, vz: 0 };
            const st = knock(tgt, b.x, b.z, RULES.wobble[D], pid);
            q.wob = tgt.wob; cb.vx = tgt.vx; cb.vz = tgt.vz; cb.flags |= F.STUN; q.stun = st; q.hop = 0; q.by = pid; q.byAt = el;
            hits.push(c.id);
            events.push({ e: 'bop', pid, to: c.id, wob: Math.round(q.wob), x: r2(cb.x), z: r2(cb.z) });
          } else {
            const st = knock(c.sl, b.x, b.z, RULES.wobble[D] + 2, pid, true); c.sl.stun = st;
            events.push({ e: 'bop', pid, sl: c.id, wob: Math.round(c.sl.wob), x: r2(c.sl.x), z: r2(c.sl.z) });
            hits.push('s' + c.id);
          }
        }
        if (!hits.length) events.push({ e: 'swing', pid });
      }
      if (pb && ready && s.hopCool <= 0) {
        let mx = +inp?.mx || 0, mz = +inp?.mz || 0; const m = Math.hypot(mx, mz);
        if (m > 0.2) { mx /= m; mz /= m; } else { mx = Math.sin(b.yaw); mz = Math.cos(b.yaw); }
        // a hop is a short slide with no steering (the STUN flag, which the phone's own prediction also sees)
        s.hopCool = RULES.hopCool; s.hop = RULES.hopTime; s.stun = RULES.hopTime; b.flags |= F.STUN; b.vx = mx * RULES.hopSpeed; b.vz = mz * RULES.hopSpeed; b.yaw = Math.atan2(mx, mz);
        events.push({ e: 'hop', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      el += dt; time -= dt;
      separate([...bodies].filter(([pid]) => free(pid)).map(([, b]) => b));
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.hopCool > 0) s.hopCool -= dt;
        if (s.hop > 0) s.hop -= dt;
        if (s.ghost > 0) { s.ghost -= dt; if (s.ghost <= 0) b.flags &= ~F.GHOST; }
        if (s.falling) {
          // drop to the rug, sit a moment, climb back on somewhere safe
          if (b.y > FLOOR_Y) { s.vy -= 22 * dt; b.y = Math.max(FLOOR_Y, r2(b.y + s.vy * dt)); }
          b.vx *= 0.8; b.vz *= 0.8;
          s.back -= dt;
          if (s.back <= 0) {
            const at = safeSpot(); s.falling = false; s.stun = 0; s.wob = 0; s.by = -1; s.byAt = -99; s.ghost = RULES.ghost;
            b.x = r2(at.x); b.z = r2(at.z); b.y = BED_Y; b.vx = b.vz = 0; b.yaw = Math.atan2(-b.x, -b.z); b.flags = F.GHOST;
            events.push({ e: 'back', pid });
          }
          continue;
        }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.teeter > 0) s.teeter -= dt;
        if (!onBed(b.x, b.z)) {
          // only a bop (or a sleepwalker's bump) sends you over: walk, hop or get crowded to the edge and you teeter on it
          if (el - s.byAt <= RULES.credit) startFall(pid);
          else {
            const ex = RULES.edgeX, ez = RULES.edgeZ;
            if (Math.abs(b.x) > ex) { b.x = Math.sign(b.x) * ex; if (b.vx * Math.sign(b.x) > 0) b.vx = 0; }
            if (Math.abs(b.z) > ez) { b.z = Math.sign(b.z) * ez; if (b.vz * Math.sign(b.z) > 0) b.vz = 0; }
            if (s.teeter <= 0) events.push({ e: 'teeter', pid, x: r2(b.x), z: r2(b.z) });
            s.teeter = RULES.teeter;
          }
        }
      }
      // solo: sleepwalkers climb on and shuffle at you
      if (solo) {
        const me = players[0].pid, b = bodies.get(me), s = P.get(me), S = RULES.sleep;
        sleepIn -= dt;
        if (sleepIn <= 0 && sleepers.filter(x => !x.falling).length < S.max[D]) {
          sleepIn = S.every;
          // climb on at a spot along the bed's edge, away from you
          let at = null;
          for (let k = 0; k < 8; k++) {
            const side = rng.int(0, 3), u = rng.range(-0.8, 0.8);
            const x = side < 2 ? u * (RULES.edgeX - 0.8) : (side === 2 ? -1 : 1) * (RULES.edgeX - 0.8), z = side < 2 ? (side === 0 ? -1 : 1) * (RULES.edgeZ - 0.8) : u * (RULES.edgeZ - 0.8);
            if (Math.hypot(x - b.x, z - b.z) > 3 || k === 7) { at = { x, z }; break; }
          }
          sleepers.push({ id: ++sid, x: r2(at.x), z: r2(at.z), y: BED_Y, vx: 0, vz: 0, yaw: Math.atan2(b.x - at.x, b.z - at.z), wob: 0, stun: 0, bump: 0.6, falling: false, vy: 0 });
          events.push({ e: 'climb', sl: sid });
        }
        for (const sl of sleepers) {
          if (sl.falling) { sl.vy -= 22 * dt; sl.y += sl.vy * dt; sl.x += sl.vx * dt; sl.z += sl.vz * dt; continue; }
          if (sl.bump > 0) sl.bump -= dt;
          if (sl.stun > 0) { sl.stun -= dt; const k = Math.max(0, 1 - meta.move.stunDrag * dt); sl.vx *= k; sl.vz *= k; }
          else {
            // shuffle toward the player, a little wobbly
            const dx = b.x - sl.x, dz = b.z - sl.z, d = Math.hypot(dx, dz) || 1, sp = s.falling ? 0 : S.speed[D];
            const wig = Math.sin(el * 1.7 + sl.id * 2.1) * 0.35;
            const wx = dx / d * Math.cos(wig) - dz / d * Math.sin(wig), wz = dz / d * Math.cos(wig) + dx / d * Math.sin(wig);
            sl.vx += (wx * sp - sl.vx) * Math.min(1, 4 * dt); sl.vz += (wz * sp - sl.vz) * Math.min(1, 4 * dt); sl.yaw = Math.atan2(dx, dz);
            if (!s.falling && !(b.flags & F.GHOST) && d < S.bumpR && sl.bump <= 0) {
              sl.bump = S.bumpCool;
              const tgt = { x: b.x, z: b.z, wob: s.wob, vx: 0, vz: 0 };
              const st = knock(tgt, sl.x, sl.z, S.bumpWobble[D]) * 0.8;
              s.wob = tgt.wob; b.vx = tgt.vx * (S.bumpPush / RULES.push); b.vz = tgt.vz * (S.bumpPush / RULES.push); b.flags |= F.STUN; s.stun = st; s.hop = 0; s.by = -1; s.byAt = el;
              events.push({ e: 'bump', sl: sl.id, to: me, wob: Math.round(s.wob), x: r2(b.x), z: r2(b.z) });
            }
          }
          sl.x += sl.vx * dt; sl.z += sl.vz * dt;
          for (const o of sleepers) if (o !== sl && !o.falling) { const dx = sl.x - o.x, dz = sl.z - o.z, d = Math.hypot(dx, dz); if (d < 0.9 && d > 1e-3) { sl.x += dx / d * (0.9 - d) / 2; sl.z += dz / d * (0.9 - d) / 2; } }
          if (!onBed(sl.x, sl.z)) { sl.falling = true; sl.vy = 1.5; s.pts++; s.kos++; events.push({ e: 'drop', sl: sl.id, by: me, x: r2(sl.x), z: r2(sl.z) }); }
        }
        sleepers = sleepers.filter(sl => !(sl.falling && sl.y <= FLOOR_Y));
      }
      if (time <= 0) {
        time = 0; over = true;
        for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
      }
    },
    state() {
      const sc = {}, wb = {};
      for (const p of players) { const s = P.get(p.pid); sc[p.pid] = s.pts; wb[p.pid] = Math.round(s.wob); }
      const g = { sc, wb, left: Math.ceil(time) };
      if (solo) g.sl = sleepers.map(s => [s.id, r2(s.x), r2(s.z), r2(s.y), r2(s.yaw), Math.round(s.wob), s.stun > 0 ? 1 : 0]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = P.get(p.pid); scores[p.pid] = s.pts; const k = s.pts * 1000 + Math.min(999, s.kos * 10 - s.falls + 500); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get sleepers() { return sleepers; },
  };
}
