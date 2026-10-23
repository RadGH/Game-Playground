// SNOWBALL SHOWDOWN — a round sheet of ice with nothing round the edge. The floor is slippery (low acceleration), so
// every push carries. A throws a snowball the way you face: a hit shoves the target hard and stuns them for a moment.
// B is a dash: a burst of speed that shoves anyone you run into. Slide off the edge and you lose a life; you come back
// two seconds later somewhere safe, blinking (nothing can hit you) for 1.5 s. Three lives each. Whoever touched you
// last in the three seconds before you fell gets the knock-out. Alone, snowmen pop up to knock off for points.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'snowball-showdown', title: 'Snowball Showdown', blurb: 'Throw snowballs, dodge attacks, and knock players out of the arena!',
  how: ['THROW a snowball where you face. A hit shoves them hard.', 'DASH to barge into someone.', 'Slide off the ice and you lose a life. Three lives each!'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'KOs', tags: ['action'],
  controls: { stick: true, a: 'Throw', b: 'Dash' }, move: { speed: 6.4, accel: 5.5, stunDrag: 0.7 },
  arena: { shape: 'circle', r: 8, wall: false }, pitch: 56, card: 'card-snowball-showdown',
};

export const RULES = {
  lives: 3,
  throwCool: 0.6, ballSpeed: 15, ballLife: 0.75, ballR: 0.8,      // ballR: hit distance, centre to centre
  aimCone: 0.5, aimRange: 11.5,                                    // aim help: a throw turns toward the nearest-to-facing target this close (rad, m) — owner 2026-10-22 "very hard to aim"
  hitPush: 8.5, hitStun: 0.45,
  dashCool: 2.0, dashSpeed: 15, dashTime: 0.3, shovePush: 12, shoveStun: 0.5, shoveR: 1.05,
  edge: 8.15,                                                      // centre further out than this = falling
  respawn: 2.0, ghost: 1.5, credit: 3.0,
  snowmen: 3, snowmanR: 0.55, snowmanEvery: 1.6,                   // solo targets
};
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, bodies = new Map(), spawns = spawnRing(n, solo ? 0 : 4.6);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, throwCool: 0, dashCool: 0, dash: 0, dashHit: new Set(), stun: 0, ghost: 0, falling: false, vy: 0, back: 0, lives: RULES.lives, kos: 0, by: -1, byAt: -99, outAt: -1 }]));
  let balls = [], bid = 0, snowmen = [], sid = 0, nextSnowman = 0.8, time = meta.seconds, elapsed = 0, over = false;
  const events = [];
  const active = pid => { const s = P.get(pid), b = bodies.get(pid); return !s.falling && !(b.flags & F.OUT); };
  const hittable = pid => active(pid) && !(bodies.get(pid).flags & F.GHOST);
  const alive = () => players.filter(p => P.get(p.pid).lives > 0);
  function knock(pid, by, nx, nz, push, stun) {
    const b = bodies.get(pid), s = P.get(pid);
    b.vx = nx * push; b.vz = nz * push; b.flags |= F.STUN; s.stun = stun; s.dash = 0;
    if (by != null && by !== pid) { s.by = by; s.byAt = elapsed; }
  }
  function safeSpot() {
    let best = { x: 0, z: 0 }, bestD = -1;
    for (let k = 0; k < 10; k++) {
      const a = rng.range(0, Math.PI * 2), rr = rng.range(0, 3.8), x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      let d = 99; for (const [pid, b] of bodies) if (active(pid)) d = Math.min(d, Math.hypot(b.x - x, b.z - z));
      if (d > bestD) { bestD = d; best = { x, z }; }
    }
    return best;
  }
  function startFall(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.falling = true; s.vy = 1; s.back = RULES.respawn; s.lives--; b.flags |= F.STUN;
    const credit = s.by >= 0 && elapsed - s.byAt <= RULES.credit ? s.by : -1;
    if (credit >= 0) P.get(credit).kos++;
    if (s.lives <= 0) s.outAt = elapsed;
    events.push({ e: 'fall', pid, by: credit, lives: s.lives, x: r2(b.x), z: r2(b.z) });
  }
  /** Aim help: the direction to throw — toward the target closest to where you face (inside aimCone, leading it a little), else straight ahead. */
  function aimFrom(pid, b, fx, fz) {
    const marks = solo ? snowmen.map(m => ({ x: m.x, z: m.z, vx: 0, vz: 0 })) : players.filter(p => p.pid !== pid && active(p.pid)).map(p => bodies.get(p.pid));
    let best = null, bestA = RULES.aimCone;
    for (const m of marks) {
      const dx = m.x - b.x, dz = m.z - b.z, d = Math.hypot(dx, dz); if (d < 0.3 || d > RULES.aimRange) continue;
      const lead = d / RULES.ballSpeed, tx = dx + (m.vx || 0) * lead, tz = dz + (m.vz || 0) * lead, td = Math.hypot(tx, tz) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, (tx * fx + tz * fz) / td)));
      if (ang < bestA) { bestA = ang; best = [tx / td, tz / td]; }
    }
    return best || [fx, fz];
  }
  return {
    bodies, events,
    init: () => ({ solo, lives: RULES.lives, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const free = active(pid) && !(b.flags & F.STUN);
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      if (pa && free && s.throwCool <= 0) {
        s.throwCool = RULES.throwCool;
        const [ax, az] = aimFrom(pid, b, fx, fz);
        balls.push({ id: ++bid, by: pid, x: b.x + ax * 0.6, z: b.z + az * 0.6, vx: ax * RULES.ballSpeed + b.vx * 0.3, vz: az * RULES.ballSpeed + b.vz * 0.3, life: RULES.ballLife });
        events.push({ e: 'throw', pid });
      }
      if (pb && free && s.dashCool <= 0) {
        s.dashCool = RULES.dashCool; s.dash = RULES.dashTime; s.dashHit.clear();
        b.vx = fx * RULES.dashSpeed; b.vz = fz * RULES.dashSpeed;
        events.push({ e: 'dash', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt;
      separate([...bodies].filter(([pid]) => active(pid)).map(([, b]) => b));
      // snowballs fly, hit the first body (or snowman) they touch
      for (const ball of balls) {
        ball.x += ball.vx * dt; ball.z += ball.vz * dt; ball.life -= dt;
        for (const [pid, b] of bodies) {
          if (pid === ball.by || !hittable(pid) || Math.hypot(b.x - ball.x, b.z - ball.z) > RULES.ballR) continue;
          const sp = Math.hypot(ball.vx, ball.vz) || 1;
          knock(pid, ball.by, ball.vx / sp, ball.vz / sp, RULES.hitPush, RULES.hitStun);
          ball.life = 0; events.push({ e: 'hit', pid, by: ball.by, x: r2(ball.x), z: r2(ball.z) }); break;
        }
        if (ball.life > 0) for (const sm of snowmen) if (!sm.falling && Math.hypot(sm.x - ball.x, sm.z - ball.z) < RULES.snowmanR + 0.3) {
          const sp = Math.hypot(ball.vx, ball.vz) || 1; sm.vx += ball.vx / sp * 7.5; sm.vz += ball.vz / sp * 7.5; sm.by = ball.by;
          ball.life = 0; events.push({ e: 'hit', sm: sm.id, by: ball.by, x: r2(ball.x), z: r2(ball.z) }); break;
        }
      }
      balls = balls.filter(b => b.life > 0 && Math.hypot(b.x, b.z) < 14);
      // dashes shove whoever they run into
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.dash > 0) {
          s.dash -= dt;
          for (const [qid, c] of bodies) {
            if (qid === pid || s.dashHit.has(qid) || !hittable(qid) || Math.hypot(c.x - b.x, c.z - b.z) > RULES.shoveR) continue;
            s.dashHit.add(qid); const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz) || 1;
            knock(qid, pid, dx / d, dz / d, RULES.shovePush, RULES.shoveStun); b.vx *= 0.3; b.vz *= 0.3;
            events.push({ e: 'shove', pid: qid, by: pid, x: r2(c.x), z: r2(c.z) });
          }
          for (const sm of snowmen) if (!sm.falling && Math.hypot(sm.x - b.x, sm.z - b.z) < RULES.snowmanR + 0.5) {
            const dx = sm.x - b.x, dz = sm.z - b.z, d = Math.hypot(dx, dz) || 1; sm.vx = dx / d * 9; sm.vz = dz / d * 9; sm.by = pid;
          }
        }
        if (s.throwCool > 0) s.throwCool -= dt;
        if (s.dashCool > 0) s.dashCool -= dt;
        if (s.ghost > 0) { s.ghost -= dt; if (s.ghost <= 0) b.flags &= ~F.GHOST; }
        if (s.falling) {
          if (!(b.flags & F.OUT)) { s.vy -= 24 * dt; b.y += s.vy * dt; if (b.y < -6.5) { b.flags = F.OUT; b.vx = b.vz = 0; } }
          s.back -= dt;
          if (s.back <= 0 && s.lives > 0) {
            const at = safeSpot(); s.falling = false; s.stun = 0; s.by = -1; s.ghost = RULES.ghost;
            b.x = r2(at.x); b.z = r2(at.z); b.y = 0; b.vx = b.vz = 0; b.yaw = Math.atan2(-b.x, -b.z); b.flags = F.GHOST;
            events.push({ e: 'back', pid });
          }
          continue;
        }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (Math.hypot(b.x, b.z) > RULES.edge) startFall(pid);
      }
      // solo: snowmen to knock off
      if (solo) {
        nextSnowman -= dt;
        if (nextSnowman <= 0 && snowmen.filter(s => !s.falling).length < RULES.snowmen) {
          nextSnowman = RULES.snowmanEvery; const b = bodies.get(players[0].pid);
          for (let k = 0; k < 10; k++) { const a = rng.range(0, Math.PI * 2), rr = rng.range(1.5, 6), x = Math.sin(a) * rr, z = Math.cos(a) * rr; if (Math.hypot(x - b.x, z - b.z) > 2.5 || k === 9) { snowmen.push({ id: ++sid, x, z, vx: 0, vz: 0, y: 0, falling: false, by: -1 }); break; } }
        }
        for (const sm of snowmen) {
          const k = Math.max(0, 1 - 0.9 * dt); sm.vx *= k; sm.vz *= k; sm.x += sm.vx * dt; sm.z += sm.vz * dt;
          if (sm.falling) { sm.y -= 9 * dt; continue; }
          for (const [, b] of bodies) { const dx = sm.x - b.x, dz = sm.z - b.z, d = Math.hypot(dx, dz); if (d < 1 && d > 1e-3) { sm.x += dx / d * (1 - d); sm.z += dz / d * (1 - d); } }
          if (Math.hypot(sm.x, sm.z) > RULES.edge) { sm.falling = true; const by = players[0].pid; P.get(by).kos++; events.push({ e: 'pop', sm: sm.id, by, x: r2(sm.x), z: r2(sm.z) }); }
        }
        snowmen = snowmen.filter(s => s.y > -6);
      }
      time -= dt;
      const standing = alive().length, dropping = players.some(p => P.get(p.pid).falling && !(bodies.get(p.pid).flags & F.OUT));
      if (((!solo && standing <= 1) || standing === 0) && !dropping || time <= 0) {      // let a fall play out before the end
        time = Math.max(0, time); over = true;
        for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
      }
    },
    state() {
      const lv = {}, sc = {}; for (const p of players) { const s = P.get(p.pid); lv[p.pid] = s.lives; sc[p.pid] = s.kos; }
      const g = { sc, lv, s: balls.map(b => [b.id, r2(b.x), r2(b.z)]), left: Math.ceil(time) };
      if (solo) g.sm = snowmen.map(s => [s.id, r2(s.x), r2(s.z), r2(s.y)]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const s = P.get(p.pid); scores[p.pid] = s.kos;
        const k = s.lives * 10000 + s.kos * 100 + (s.lives > 0 ? 99 : Math.min(98, Math.floor(s.outAt)));   // lives, then KOs, then who lasted longer
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
