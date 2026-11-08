// SEESAW SHOVE — one enormous plank balanced on a barrel over the duck pond. Wherever people stand, it tips: the low
// end drops, and everyone on it starts SLIDING downhill (the plank is waxed). Stay dry! Every 2 seconds on the plank
// = +1. A = SHOVE the one in front of you; shove someone into the pond = +3. B = HOP: in the air you do not slide and
// barrels roll under you. If the plank swings up fast under your feet, it CATAPULTS you toward the middle.
// Barrels roll down from the high end (the pond keeps them), and now and then a fat seagull lands on one end and
// tips everything its way. Fall in and you paddle back to the middle after a moment. Works alone the same way.
// The plank's tilt is the sim's, and so is each body's height on it (b.y), so every screen draws the same slope.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'seesaw-shove', title: 'Seesaw Shove', blurb: 'Stay on the giant tipping seesaw — and shove everyone else in the pond!',
  how: ['Stay on the tipping seesaw: +1 every 2 seconds, +3 for shoving someone in.', 'A = shove, B = hop (hop over barrels; in the air you do not slide).', 'The low end slides you down — run uphill to stay dry!', 'Watch out for barrels and the big seagull.'],
  kind: 'arena', min: 1, max: 4, seconds: 68, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Shove', b: 'Hop' },
  move: { speed: 5.2, accel: 5, stunDrag: 1 },
  arena: { shape: 'rect', hw: 6.5, hd: 1.6, wall: false }, pitch: 34, card: 'card-seesaw-shove', css: true,
};

export const RULES = {
  countdown: 3, play: 60, endPause: 1.8,
  maxTilt: 0.32, fullTorque: 6, stiff: 7, damp: 3.2, slide: 30,
  edge: 0.15, outFor: 2.2, ghost: 1.0, credit: 3, water: -1.3,
  dryEvery: 2, pts: { dry: 1, off: 3 },
  shove: { reach: 1.5, cone: 0.9, power: 7, stun: 0.4, cool: 0.8 },
  hop: 0.6, hopH: 1.0, hopCool: 0.8,
  launchAt: 2.3, launchT: 0.9, launchH: 2.0, launchV: 5.5,
  barrel: { every: [3.2, 5.2], max: 3, r: 0.45, roll: 26, friction: 0.25, hit: 0.85, weight: 0.5 },
  gull: { every: [9, 13], stay: 3.5, weight: 3, x: 5.8 },
};
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Height of the plank at x for tilt th (th > 0 = the right end is down). */
export const plankY = (x, th) => -x * Math.sin(th);

export function create({ rng, players, difficulty = 'normal' }) {
  const AR = meta.arena, n = players.length, pids = players.map(p => p.pid), bodies = new Map(), S = new Map();
  const xs = n === 1 ? [0] : n === 2 ? [-2.4, 2.4] : n === 3 ? [-3, 0, 3] : [-3.6, -1.2, 1.2, 3.6];
  players.forEach((p, i) => { const b = makeBody(xs[i], 0, xs[i] < 0 ? Math.PI / 2 : -Math.PI / 2); b.flags = F.FROZEN; bodies.set(p.pid, b); S.set(p.pid, { pid: p.pid, b, pts: 0, dry: 0, air: 0, airT: 1, airH: 1, cool: 0, hopCool: 0, stun: 0, out: 0, ghost: 0, hitBy: null, hitAt: -99, prevA: 0, prevB: 0, splashes: 0, shoves: 0 }); });
  const gWeight = difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.2 : 1;
  let th = 0, om = 0, countdown = RULES.countdown, lastCount = 4, time = RULES.play, clock = 0, endIn = -1, over = false;
  let barrels = [], bid = 0, nextBarrel = 2.5, gull = 0, gullLeft = 0, nextGull = rng.range(RULES.gull.every[0], RULES.gull.every[1]);
  const events = [];
  const live = () => countdown <= 0 && endIn < 0;
  const onPlank = s => s.out <= 0;

  function push(s, dir, power, by, stun) {
    const b = s.b; b.vx = dir[0] * power; b.vz = dir[1] * power; b.flags |= F.STUN; s.stun = Math.max(s.stun, stun);
    if (by != null && by !== s.pid) { s.hitBy = by; s.hitAt = clock; }
  }
  function shove(s) {
    const b = s.b, R = RULES.shove; let hit = null, bd = R.reach;
    for (const o of S.values()) {
      if (o === s || o.out > 0 || o.ghost > 0 || o.air > 0) continue;
      const dx = o.b.x - b.x, dz = o.b.z - b.z, d = Math.hypot(dx, dz); if (d > bd) continue;
      let a = Math.atan2(dx, dz) - b.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); if (Math.abs(a) > R.cone) continue;
      hit = o; bd = d;
    }
    events.push({ e: 'shove', pid: s.pid, hit: hit ? hit.pid : null });
    if (hit) push(hit, [Math.sin(b.yaw), Math.cos(b.yaw)], R.power, s.pid, R.stun);
  }
  function fall(s) {
    const b = s.b, credit = s.hitBy != null && clock - s.hitAt <= RULES.credit ? s.hitBy : null;
    s.out = RULES.outFor; s.air = 0; s.splashes++; b.flags = (b.flags | F.OUT) & ~(F.STUN | F.AIR); b.vx = b.vz = 0;
    b.x = r2(clamp(b.x, -AR.hw - 0.8, AR.hw + 0.8)); b.z = r2(Math.abs(b.z) > AR.hd ? Math.sign(b.z) * (AR.hd + 0.8) : b.z); b.y = RULES.water;
    if (Math.abs(b.x) > AR.hw) b.x = r2(Math.sign(b.x) * (AR.hw + 0.9));
    if (credit != null) { const c = S.get(credit); c.pts += RULES.pts.off; c.shoves++; }
    s.hitBy = null;
    events.push({ e: 'splash', pid: s.pid, by: credit, x: b.x, z: b.z });
  }
  function respawn(s) {
    const b = s.b, taken = [...S.values()].filter(o => o !== s && o.out <= 0).map(o => o.b.x);
    let x = 0; for (const c of [0, -1.2, 1.2, -2.2, 2.2]) if (!taken.some(t => Math.abs(t - c) < 0.9)) { x = c; break; }
    b.x = x; b.z = r2(rng.range(-0.6, 0.6)); b.y = r3(plankY(x, th)); b.vx = b.vz = 0; b.flags &= ~(F.OUT | F.STUN);
    s.out = 0; s.ghost = RULES.ghost; s.stun = 0; s.dry = 0;
    events.push({ e: 'back', pid: s.pid });
  }

  return {
    bodies, events,
    init: () => ({ solo: n === 1, left: RULES.play }),
    input(pid, inp) {
      const s = S.get(pid); if (!s || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !s.prevA, pb = (bits & IN.B) && !s.prevB;
      s.prevA = bits & IN.A; s.prevB = bits & IN.B;
      if (live() && onPlank(s) && !(s.b.flags & F.STUN)) {
        if (pb && s.air <= 0 && s.hopCool <= 0) { s.air = s.airT = RULES.hop; s.airH = RULES.hopH; s.hopCool = RULES.hopCool; s.b.flags |= F.AIR; events.push({ e: 'hop', pid }); }
        else if (pa && s.cool <= 0) { s.cool = RULES.shove.cool; shove(s); }
      }
      stepBody(s.b, live() ? inp : null, meta.move, AR);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const c = Math.ceil(countdown);
        if (c < lastCount && c > 0) { lastCount = c; events.push({ e: 'count', n: c }); }
        if (countdown <= 0) { for (const s of S.values()) s.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      time -= dt; clock += dt;
      // ---- the plank: torque from everyone standing on it, barrels and the gull
      let torque = 0;
      for (const s of S.values()) if (onPlank(s) && s.air <= 0) torque += s.b.x;
      for (const B of barrels) torque += B.x * RULES.barrel.weight;
      if (gull) torque += gull * RULES.gull.x * RULES.gull.weight * gWeight;
      const target = clamp(torque / RULES.fullTorque, -1, 1) * RULES.maxTilt;
      om += ((target - th) * RULES.stiff - om * RULES.damp) * dt; th = clamp(th + om * dt, -RULES.maxTilt - 0.04, RULES.maxTilt + 0.04);
      const slope = Math.sin(th);
      // ---- everyone on it: slide, hop, catapult, height
      for (const s of S.values()) {
        const b = s.b;
        s.cool = Math.max(0, s.cool - dt); s.hopCool = Math.max(0, s.hopCool - dt); s.ghost = Math.max(0, s.ghost - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.out > 0) { s.out -= dt; b.y = r2(RULES.water + Math.sin(clock * 6 + s.pid) * 0.08); if (s.out <= 0) respawn(s); continue; }
        let lift = 0;
        if (s.air > 0) {
          s.air -= dt; const u = 1 - Math.max(0, s.air) / s.airT; lift = 4 * s.airH * u * (1 - u);
          if (s.air <= 0) { lift = 0; b.flags &= ~F.AIR; }
        } else {
          b.vx += slope * RULES.slide * dt;
          const up = -b.x * om;                                   // how fast the plank under me is rising
          if (up > RULES.launchAt && Math.abs(b.x) > 2 && !(b.flags & F.STUN)) {
            s.air = s.airT = RULES.launchT; s.airH = RULES.launchH; b.flags |= F.AIR; b.vx = -Math.sign(b.x) * RULES.launchV;
            events.push({ e: 'launch', pid: s.pid, x: r2(b.x) });
          }
          s.dry += dt; if (s.dry >= RULES.dryEvery) { s.dry -= RULES.dryEvery; s.pts += RULES.pts.dry; }
        }
        b.y = r3(plankY(b.x, th) + lift);
      }
      separate([...S.values()].filter(s => s.out <= 0 && s.air <= 0).map(s => s.b));
      // ---- barrels
      nextBarrel -= dt;
      if (nextBarrel <= 0) {
        nextBarrel = rng.range(RULES.barrel.every[0], RULES.barrel.every[1]);
        if (barrels.length < RULES.barrel.max) {
          const side = Math.abs(th) > 0.04 ? -Math.sign(th) : rng.chance(0.5) ? 1 : -1;      // from the high end
          barrels.push({ id: ++bid, x: r2(side * (AR.hw - 0.6)), z: r2(rng.range(-1.1, 1.1)), vx: 0, rot: 0 });
          events.push({ e: 'barrel', side });
        }
      }
      for (const B of barrels) {
        B.vx += slope * RULES.barrel.roll * dt; B.vx *= 1 - RULES.barrel.friction * dt; B.x += B.vx * dt; B.rot += B.vx * dt / RULES.barrel.r;
        for (const s of S.values()) {
          if (s.out > 0 || s.air > 0 || s.ghost > 0) continue;
          const dx = s.b.x - B.x, dz = s.b.z - B.z;
          if (Math.hypot(dx, dz) > RULES.barrel.hit || Math.abs(B.vx) < 1 || Math.sign(dx) !== Math.sign(B.vx)) continue;
          push(s, [Math.sign(B.vx), dz * 0.6], Math.max(4.5, Math.abs(B.vx) * 1.3), null, 0.45);
          events.push({ e: 'bonk', pid: s.pid, x: r2(B.x), z: B.z }); B.vx *= -0.3;
        }
      }
      barrels = barrels.filter(B => { if (Math.abs(B.x) <= AR.hw + 0.4) return true; events.push({ e: 'plop', x: r2(B.x), z: B.z }); return false; });
      // ---- the seagull
      if (gull) { gullLeft -= dt; if (gullLeft <= 0) { gull = 0; nextGull = rng.range(RULES.gull.every[0], RULES.gull.every[1]); events.push({ e: 'gullOff' }); } }
      else { nextGull -= dt; if (nextGull <= 0) { gull = rng.chance(0.5) ? 1 : -1; gullLeft = RULES.gull.stay; events.push({ e: 'gull', side: gull }); } }
      // ---- into the pond
      for (const s of S.values()) if (s.out <= 0 && s.air <= 0 && (Math.abs(s.b.x) > AR.hw + RULES.edge || Math.abs(s.b.z) > AR.hd + RULES.edge)) fall(s);
      if (time <= 0) {
        time = 0; endIn = RULES.endPause;
        for (const s of S.values()) { s.b.flags = (s.b.flags & ~(F.STUN | F.AIR)) | F.FROZEN; s.b.vx = s.b.vz = 0; }
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = S.get(pid).pts;
      const g = { sc, cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, time)), th: r3(th) };
      if (barrels.length) g.bl = barrels.map(B => [B.id, r2(B.x), B.z, r2(B.rot)]);
      if (gull) g.gl = gull;
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const pid of pids) { const v = S.get(pid).pts; scores[pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    who: pid => S.get(pid), get tilt() { return th; }, get barrels() { return barrels; },
  };
}
