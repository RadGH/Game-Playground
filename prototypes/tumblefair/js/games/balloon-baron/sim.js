// BALLOON BARON (Expansion 1 M5, 2026-11-07) — co-op boss fight. A huge inflatable fairground balloon man in a top
// hat and a curly moustache BOUNCES round the yard, with a ring of little CROWN BALLOONS tied round his middle.
//   DARTS: two dart buckets stand at the front corners. Walk into one and it hands you darts (three at most). A throws
//   one (it snaps toward the nearest balloon in front of you). Every crown balloon popped is a little damage.
//   FLAT: pop ALL the crown balloons and the Baron goes PFFFT and sags flat on the ground for a few seconds. Everyone
//   run onto him and press B to JUMP on him: every landing on the Baron is a big stomp (and you boing back up).
//   Then he puffs himself back up with MORE crown balloons (one more each time).
// His attacks: BOUNCE (a ring shows where he will land — be out of it, or be in the air), a big PUFF of air (a wedge
// glows in front of him, then everyone in it is blown away), and from the third bounce CONFETTI CANNONS (small rings
// round the yard). Getting hit costs the team a heart (team hearts: 3 + one per player).
// Success = his health reaches 0 before the bell, with at least one heart left. Scores = damage each player dealt.
// Solo: the same fight; the balloons are few at first and he goes flat for longer on easy.
import { makeBody, stepBody, separate, spawnRing, clampToArena, F, BODY_R } from '../../shared/arena.js';
import { r2, clamp, byDiff, angDiff, knock, presses, coopResult, aimHelp } from '../boss-kit.js';

export const meta = {
  id: 'balloon-baron', title: 'Balloon Baron', blurb: 'Pop the Balloon Baron’s crown balloons, then jump on him while he’s flat!',
  how: ['Walk into a dart bucket for darts. A throws a dart at his crown balloons.', 'Pop them ALL and he goes flat: run onto him and press B to jump on him!', 'Rings = he lands there. Glowing wedge = a big puff of air. Get out!'],
  kind: 'arena', min: 1, max: 4, seconds: 88, scoring: 'coop', unit: 'damage', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Throw', b: 'Jump' }, move: { speed: 6.2, accel: 30, stunDrag: 2.6 },
  arena: { shape: 'rect', hw: 8.5, hd: 6, wall: true }, pitch: 56, card: 'card-balloon-baron', css: true,
};

export const RULES = {
  start: 2.4, baronR: 1.35, flatR: 2.5,
  // crown balloons: how many each time he puffs up, how far out, how fast they circle, how big a target
  crowns: (cyc, n) => Math.min(8, 3 + cyc + (n >= 3 ? 1 : 0)), orbit: 2.25, spin: 0.55, popR: 0.62, popDmg: 2,
  // darts
  buckets: [{ x: -6.7, z: 4.3 }, { x: 6.7, z: 4.3 }], bucketR: 1.3, refill: 0.3, dartsMax: 3, dartsStart: 2,
  dartSpeed: 15, dartLife: 0.8, cool: 0.32, aimCone: 0.5,
  // the bounce: squat (the ring shows), air, rest
  squat: { easy: 1.15, normal: 0.95, hard: 0.8 }, air: 0.7, rest: { easy: 0.8, normal: 0.6, hard: 0.45 }, landR: 2.1, hopH: 2.6,
  puffEvery: 3, puffWarn: { easy: 1.8, normal: 1.5, hard: 1.25 }, puffR: 7.5, puffHalf: 0.5, puffKnock: 9,
  confettiFrom: 3, confettiR: 1.15, confettiWarn: { easy: 1.6, normal: 1.4, hard: 1.2 },
  // flat
  flat: { easy: 5.2, normal: 4.4, hard: 3.6 }, inflate: 1.3, stompDmg: 3,
  jump: 0.55, jumpH: 1.05, boing: 0.6, boingH: 1.6, jumpCool: 0.1,
  hp: { easy: 110, normal: 150, hard: 185 }, hpMul: [1.17, 1.8, 2.8, 3.8],
  hearts: 3, heartsPer: 1,
  hurtStun: 0.8, invuln: 1.5, knock: 6.5,
};
export const heartsFor = n => RULES.hearts + RULES.heartsPer * n;
export const hpFor = (difficulty, n) => Math.round(byDiff(difficulty, RULES.hp) * RULES.hpMul[clamp(n, 1, 4) - 1]);
/** Where crown balloon `a` (its angle round him) is, for a Baron at (x, z) at time `spinT`. */
export const crownAt = (x, z, a, spinT) => ({ x: x + Math.sin(a + spinT * RULES.spin) * RULES.orbit, z: z + Math.cos(a + spinT * RULES.spin) * RULES.orbit });
/** Is (px, pz) in the puff wedge of a Baron at (x, z) blowing toward yaw? */
export function inPuff(px, pz, x, z, yaw) {
  const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
  return d <= RULES.puffR && d > 0.2 && Math.abs(angDiff(Math.atan2(dx, dz), yaw)) <= RULES.puffHalf;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.4, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z * 0.5 + 3.3, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, inv: 0, cool: 0, hop: 0, hopT: 0, hopH: 0, jumpCool: 0, darts: RULES.dartsStart, refill: 0, dmg: 0, pops: 0, stomps: 0 }]));
  const hpMax = hpFor(difficulty, n);
  const Bn = { x: 0, z: -2.2, y: 0, fx: 0, fz: -2.2, tx: 0, tz: -2.2 };     // the Baron (fx/fz = hop from, tx/tz = hop to)
  let hp = hpMax, hearts = heartsFor(n), time = meta.seconds, phase = 'ready', sub = '', left = RULES.start, cyc = 0, hops = 0, over = false, success = false;
  let crowns = [], cid = 0, spinT = 0, rings = [], rid = 0, puff = null, darts = [], did = 0, landRing = null, flats = 0;
  const events = [];

  function inflate() {
    const k = RULES.crowns(cyc, n), off = rng.range(0, Math.PI * 2);
    crowns = Array.from({ length: k }, (_, i) => ({ id: ++cid, a: off + i * Math.PI * 2 / k }));
  }
  const targetOf = () => bodies.get(pids[hops % n]);
  function beginSquat() {
    phase = 'bounce'; hops++;
    if (hops % RULES.puffEvery === 0) {            // a big puff of air instead of a bounce
      const t = targetOf(), w = byDiff(difficulty, RULES.puffWarn);
      sub = 'puff'; left = w; puff = { id: ++rid, yaw: Math.atan2(t.x - Bn.x, t.z - Bn.z), total: w };
      events.push({ e: 'puffWarn' }); return;
    }
    const t = targetOf(), w = byDiff(difficulty, RULES.squat);
    const tx = clamp(t.x + rng.range(-1, 1), -A.hw + 2.6, A.hw - 2.6), tz = clamp(t.z + rng.range(-1, 1), -A.hd + 2.6, A.hd - 2.6);   // never right in a corner: there is always a way out of the ring
    sub = 'squat'; left = w; Bn.fx = Bn.x; Bn.fz = Bn.z; Bn.tx = r2(tx); Bn.tz = r2(tz);
    landRing = { id: ++rid, x: Bn.tx, z: Bn.tz, r: RULES.landR, left: w + RULES.air, total: w + RULES.air };
    if (hops >= RULES.confettiFrom && hops % 2 === 1) {      // confetti cannons: small rings round the yard
      const cw = byDiff(difficulty, RULES.confettiWarn);
      for (let j = 0; j < n + 1; j++) {
        const b = j < n ? bodies.get(pids[j]) : null;
        const x = clamp(b ? b.x + rng.range(-1, 1) : rng.range(-A.hw + 1, A.hw - 1), -A.hw + 0.8, A.hw - 0.8), z = clamp(b ? b.z + rng.range(-1, 1) : rng.range(-A.hd + 1, A.hd - 1), -A.hd + 0.8, A.hd - 0.8);
        rings.push({ id: ++rid, x: r2(x), z: r2(z), r: RULES.confettiR, left: cw + j * 0.1, total: cw + j * 0.1 });
      }
      events.push({ e: 'confetti' });
    }
    events.push({ e: 'squat' });
  }
  function hurt(pid, fx, fz, why, power = RULES.knock) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || over) return false;
    s.inv = RULES.invuln; s.stun = RULES.hurtStun; s.hop = 0; b.y = 0; b.flags &= ~F.AIR; knock(b, fx, fz, power);
    hearts = Math.max(0, hearts - 1); events.push({ e: 'hurt', pid, hearts, why });
    return true;
  }
  function deal(pid, dmg) { const s = P.get(pid); dmg = Math.min(dmg, hp); hp -= dmg; s.dmg += dmg; if (hp <= 0) finish(true); return dmg; }
  function goFlat() {
    phase = 'flat'; sub = ''; left = byDiff(difficulty, RULES.flat); puff = null; landRing = null; Bn.y = 0; flats++;
    events.push({ e: 'flat', x: r2(Bn.x), z: r2(Bn.z) });
  }
  function throwDart(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    if (s.darts <= 0) { events.push({ e: 'empty', pid, to: pid }); return; }
    s.darts--;
    const targets = crowns.map(c => crownAt(Bn.x, Bn.z, c.a, spinT));
    const { yaw } = aimHelp(b.x, b.z, b.yaw, targets, RULES.aimCone, RULES.dartSpeed * RULES.dartLife);
    b.yaw = yaw;
    darts.push({ id: ++did, pid, x: b.x, z: b.z, yaw, life: RULES.dartLife });
    events.push({ e: 'throw', pid });
  }
  function land(pid) {          // a jump comes down: on a flat Baron it is a stomp, and you boing back up
    const b = bodies.get(pid), s = P.get(pid);
    if (phase === 'flat' && Math.hypot(b.x - Bn.x, b.z - Bn.z) <= RULES.flatR) {
      const dmg = deal(pid, RULES.stompDmg); s.stomps++;
      events.push({ e: 'stomp', pid, dmg, hp, x: r2(b.x), z: r2(b.z) });
      if (!over) { s.hop = s.hopT = RULES.boing; s.hopH = RULES.boingH; b.flags |= F.AIR; }
    }
  }
  function finish(ok) {
    over = true; success = ok; phase = 'end'; sub = ''; rings = []; puff = null; landRing = null; darts = [];
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.AIR); b.y = 0; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  inflate();
  return {
    bodies, events,
    init: () => ({ hpMax, hearts: heartsFor(n), solo: n === 1, buckets: RULES.buckets }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp), free = !(b.flags & F.STUN);
      if (pr.b && free && s.hop <= 0 && s.jumpCool <= 0) { s.hop = s.hopT = RULES.jump; s.hopH = RULES.jumpH; b.flags |= F.AIR; events.push({ e: 'jump', pid }); }
      if (pr.a && free && s.cool <= 0 && phase !== 'ready') { s.cool = RULES.cool; throwDart(pid); }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      time -= dt; left -= dt; spinT += dt;
      separate(bodies.values());
      const solid = phase !== 'flat' && !(phase === 'bounce' && sub === 'air' && Bn.y > 1.2);
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        s.cool = Math.max(0, s.cool - dt); s.inv = Math.max(0, s.inv - dt); s.jumpCool = Math.max(0, s.jumpCool - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.hop > 0) {
          s.hop -= dt; const k = 1 - Math.max(0, s.hop) / s.hopT; b.y = r2(4 * s.hopH * k * (1 - k));
          if (s.hop <= 0) { s.hop = 0; b.y = 0; b.flags &= ~F.AIR; s.jumpCool = RULES.jumpCool; land(pid); if (over) return; }
        }
        // the dart buckets hand out darts
        if (s.darts < RULES.dartsMax && RULES.buckets.some(k => Math.hypot(b.x - k.x, b.z - k.z) <= RULES.bucketR)) {
          s.refill += dt; if (s.refill >= RULES.refill) { s.refill = 0; s.darts++; events.push({ e: 'grab', pid, darts: s.darts, to: pid }); }
        } else s.refill = 0;
        // the Baron is solid (a flat Baron you can walk on)
        if (solid) { const dx = b.x - Bn.x, dz = b.z - Bn.z, d = Math.hypot(dx, dz), min = RULES.baronR + BODY_R; if (d < min) { if (d < 1e-3) b.x += min; else { b.x += dx / d * (min - d); b.z += dz / d * (min - d); } clampToArena(b, A); } }
      }
      // darts in flight: pop a crown balloon, or bounce off the Baron
      for (const d of darts) {
        const steps = 3, ds = RULES.dartSpeed * dt / steps;
        for (let k = 0; k < steps && d.life > 0; k++) {
          d.x += Math.sin(d.yaw) * ds; d.z += Math.cos(d.yaw) * ds;
          const hit = crowns.find(c => { const p = crownAt(Bn.x, Bn.z, c.a, spinT); return Math.hypot(p.x - d.x, p.z - d.z) <= RULES.popR; });
          if (hit) {
            const p = crownAt(Bn.x, Bn.z, hit.a, spinT); crowns = crowns.filter(c => c !== hit); d.life = 0;
            const dmg = deal(d.pid, RULES.popDmg); P.get(d.pid).pops++;
            events.push({ e: 'pop', pid: d.pid, id: hit.id, x: r2(p.x), z: r2(p.z), dmg, hp, left: crowns.length });
            if (over) return;
          } else if (phase !== 'flat' && Math.hypot(d.x - Bn.x, d.z - Bn.z) <= RULES.baronR) { d.life = 0; events.push({ e: 'boing', x: r2(d.x), z: r2(d.z) }); }
          else if (Math.abs(d.x) > A.hw + 1 || Math.abs(d.z) > A.hd + 1) d.life = 0;
        }
        d.life -= dt;
      }
      darts = darts.filter(d => d.life > 0);
      // the rings land
      for (const r of rings) {
        r.left -= dt;
        if (r.left <= 0) { events.push({ e: 'bang', x: r.x, z: r.z }); for (const [pid, b] of bodies) if (b.y < 0.3 && Math.hypot(b.x - r.x, b.z - r.z) <= r.r + 0.2) hurt(pid, r.x, r.z, 'confetti'); }
      }
      rings = rings.filter(r => r.left > 0);
      if (landRing) landRing.left -= dt;
      // the Baron's turn
      if (phase === 'bounce' && sub === 'air') {
        const k = clamp(1 - left / RULES.air, 0, 1);
        Bn.x = Bn.fx + (Bn.tx - Bn.fx) * k; Bn.z = Bn.fz + (Bn.tz - Bn.fz) * k; Bn.y = 4 * RULES.hopH * k * (1 - k);
      }
      if (left <= 0) {
        if (phase === 'ready') { phase = 'bounce'; sub = 'rest'; left = 0.3; }
        else if (phase === 'bounce') {
          if (sub === 'squat') { sub = 'air'; left = RULES.air; events.push({ e: 'hop' }); }
          else if (sub === 'air') {
            Bn.x = Bn.tx; Bn.z = Bn.tz; Bn.y = 0; landRing = null;
            events.push({ e: 'land', x: Bn.x, z: Bn.z });
            for (const [pid, b] of bodies) if (b.y < 0.3 && Math.hypot(b.x - Bn.x, b.z - Bn.z) <= RULES.landR + 0.2) hurt(pid, Bn.x, Bn.z, 'land');
            if (!crowns.length && !over) goFlat(); else { sub = 'rest'; left = byDiff(difficulty, RULES.rest); }
          } else if (sub === 'puff') {
            for (const [pid, b] of bodies) if (inPuff(b.x, b.z, Bn.x, Bn.z, puff.yaw)) hurt(pid, Bn.x, Bn.z, 'puff', RULES.puffKnock);
            events.push({ e: 'puff', yaw: r2(puff.yaw) }); puff = null;
            if (!crowns.length && !over) goFlat(); else { sub = 'rest'; left = byDiff(difficulty, RULES.rest); }
          } else if (sub === 'rest') { if (!crowns.length) goFlat(); else beginSquat(); }
        } else if (phase === 'flat') { phase = 'inflate'; left = RULES.inflate; cyc++; inflate(); events.push({ e: 'inflate', k: crowns.length }); }
        else if (phase === 'inflate') { phase = 'bounce'; sub = 'rest'; left = 0.2; }
      }
      // all balloons popped while he rests or squats: down he goes at once
      if (!over && phase === 'bounce' && !crowns.length && (sub === 'rest' || sub === 'squat')) goFlat();
      if (hearts <= 0 && !over) return finish(false);
      if (time <= 0 && !over) finish(hp <= 0);
    },
    state() {
      const sc = {}, am = {}; for (const pid of pids) { sc[pid] = P.get(pid).dmg; am[pid] = P.get(pid).darts; }
      const g = { ph: phase, sub, bx: r2(Bn.x), bz: r2(Bn.z), by: r2(Bn.y), hp, hearts, sc, am, left: Math.max(0, Math.ceil(time)), pl: r2(Math.max(0, left)), cyc };
      g.cr = crowns.map(c => { const p = crownAt(Bn.x, Bn.z, c.a, spinT); return [c.id, r2(p.x), r2(p.z)]; });
      g.rg = rings.map(r => [r.id, r.x, r.z, r.r, r2(r.left), r2(r.total)]);
      if (landRing) g.rg.push([landRing.id, landRing.x, landRing.z, landRing.r, r2(Math.max(0, landRing.left)), r2(landRing.total)]);
      if (puff) g.pf = [puff.id, r2(puff.yaw), r2(Math.max(0, left)), r2(puff.total)];
      g.dt = darts.map(d => [d.id, r2(d.x), r2(d.z), r2(d.yaw)]);
      return g;
    },
    get over() { return over; },
    get flats() { return flats; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).dmg;
      return coopResult(pids, scores, over ? success : hp <= 0, meta.unit);
    },
  };
}
