// WIZARD DUEL — a round floating platform, no railing. Every wizard has the same six spells; B picks the next one,
// A casts it the way you face (a little aim help turns it toward the nearest rival). Each spell has its own cool-down:
//   Zip Spark    a quick little bolt                         Big Ember   a slow fireball that bursts and throws hard
//   Frost Puff   a short cone that slows whoever it touches   Bubble Ward a bubble for a moment: spells bounce back
//   Hop Step     jump a few steps forward (mind the edge!)   Homing Wisp a slow wisp that follows a rival
// A spell that hits ZAPS you (the zap meter fills) and knocks you back — the fuller your meter, the further you fly.
// Fall off the platform, or let your meter fill right up, and you lose a heart (the last wizard to hit you gets it)
// and come back with an empty meter. Three hearts each; at none you are out. Points: +1 for every heart you take, +2 for the
// last one, +3 for still standing at the end. Teams (when the room plays teams): red + green against blue + pink by
// seat, no hitting your own side. Alone: straw practice wizards to knock about.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const R = 8.5;
export const meta = {
  id: 'wizard-duel', title: 'Wizard Duel', blurb: 'Pick your spell, blast your rivals and knock them off the platform!',
  how: ['A casts your spell. B picks the next of six (each has its own cool-down).', 'Hits fill their ZAP meter: the fuller it is, the further they fly.', 'Knock them off the edge (or fill the meter) to take a heart. Three each!'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-wizard-duel', css: true,
  controls: { stick: true, a: 'Cast', b: 'Next spell' }, move: { speed: 5.6, accel: 16, stunDrag: 1.4, slowMul: 0.45 },
  arena: { shape: 'circle', r: R, wall: false }, pitch: 58,
};
export const SPELLS = [
  { id: 'spark', name: 'Zip Spark', cool: 0.7, speed: 16, life: 0.65, r: 0.7, knock: 5, dmg: 9 },
  { id: 'ember', name: 'Big Ember', cool: 2.4, speed: 7.5, life: 1.5, r: 0.85, knock: 9, dmg: 22, blast: 1.9 },
  { id: 'frost', name: 'Frost Puff', cool: 2.0, range: 3.4, cone: 0.65, knock: 3, dmg: 5, slow: 2.2 },
  { id: 'ward', name: 'Bubble Ward', cool: 4.0, time: 1.4 },
  { id: 'hop', name: 'Hop Step', cool: 2.6, dist: 3.4 },
  { id: 'wisp', name: 'Homing Wisp', cool: 3.0, speed: 6.5, life: 2.8, r: 0.75, knock: 6, dmg: 15, turn: 3.2 },
];
export const RULES = { hearts: 3, zapMax: 100, zapKnock: 55, stun: 0.4, ghost: 1.0, respawn: 1.6, back: 1.2, credit: 3, edge: R + 0.1, aimCone: 0.5, aimRange: 12, dummies: 3, dummyEvery: 1.4, endBonus: 3, koBonus: 2 };
export const LEVELS = { easy: { cool: 0.85, knock: 0.85 }, normal: { cool: 1, knock: 1 }, hard: { cool: 1.1, knock: 1.12 } };
const r2 = v => Math.round(v * 100) / 100;
export const spellIndex = id => SPELLS.findIndex(s => s.id === id);

export function create({ rng, players, difficulty = 'normal', teams = false }) {
  const Lv = LEVELS[difficulty] || LEVELS.normal, n = players.length, solo = n === 1;
  const teamOf = new Map(players.map(p => [p.pid, teams && n >= 2 ? p.seat % 2 : p.pid]));
  const bodies = new Map(), spawns = spawnRing(n, solo ? 0 : 4.6);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(r2(spawns[i].x), r2(spawns[i].z), spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, sp: 0, cd: SPELLS.map(() => 0), ward: 0, stun: 0, ghost: 0, slow: 0, hearts: RULES.hearts, zap: 0, pts: 0, falling: false, vy: 0, back: 0, by: -1, byAt: -99, outAt: -1, hits: 0 }]));
  let shots = [], sid = 0, dummies = [], did = 0, nextDummy = 0.6, time = meta.seconds - 3, el = 0, over = false;
  const events = [];
  const foes = (a, b) => teamOf.get(a) !== teamOf.get(b);
  const active = pid => { const s = P.get(pid); return s.hearts > 0 && !s.falling; };
  const hittable = pid => active(pid) && P.get(pid).ghost <= 0;
  const standingTeams = () => new Set(players.filter(p => P.get(p.pid).hearts > 0).map(p => teamOf.get(p.pid)));
  function marksFor(pid) {
    if (solo) return dummies.filter(d => !d.falling).map(d => ({ id: 'd' + d.id, x: d.x, z: d.z }));
    return players.filter(p => p.pid !== pid && foes(pid, p.pid) && hittable(p.pid)).map(p => ({ id: p.pid, ...bodies.get(p.pid) }));
  }
  function aim(pid, b) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw); let best = null, bestA = RULES.aimCone;
    for (const m of marksFor(pid)) { const dx = m.x - b.x, dz = m.z - b.z, d = Math.hypot(dx, dz); if (d < 0.3 || d > RULES.aimRange) continue; const a = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))); if (a < bestA) { bestA = a; best = [dx / d, dz / d]; } }
    return best || [fx, fz];
  }
  /** A spell landed on wizard `pid` (from `by`, pushing along nx, nz). */
  function hurt(pid, by, nx, nz, knock, dmg) {
    const s = P.get(pid), b = bodies.get(pid);
    if (s.ward > 0) return false;
    const k = knock * Lv.knock * (1 + s.zap / RULES.zapKnock);              // a fuller zap meter flies further
    b.vx = nx * k; b.vz = nz * k; b.flags |= F.STUN; s.stun = RULES.stun;
    if (by != null && by !== pid) { s.by = by; s.byAt = el; }
    if (dmg) { s.zap = Math.min(RULES.zapMax, s.zap + dmg); if (s.zap >= RULES.zapMax) { s.zap = 0; loseHeart(pid, by, 'zap'); } }
    return true;
  }
  function loseHeart(pid, by, how) {
    const s = P.get(pid), b = bodies.get(pid); s.hearts--; s.ghost = RULES.ghost; b.flags |= F.GHOST;
    if (by != null && by !== pid && P.has(by)) { const q = P.get(by); q.pts += 1; q.hits++; if (s.hearts <= 0) q.pts += RULES.koBonus; }
    if (s.hearts <= 0) { s.outAt = el; }
    events.push({ e: 'heart', pid, by: by ?? -1, how, hearts: s.hearts, x: r2(b.x), z: r2(b.z) });
  }
  function cast(pid) {
    const s = P.get(pid), b = bodies.get(pid), S = SPELLS[s.sp];
    if (s.cd[s.sp] > 0 || !active(pid) || (b.flags & F.STUN)) return;
    s.cd[s.sp] = S.cool * Lv.cool;
    const [ax, az] = aim(pid, b);
    if (S.speed) { shots.push({ id: ++sid, k: S.id, by: pid, x: b.x + ax * 0.7, z: b.z + az * 0.7, vx: ax * S.speed, vz: az * S.speed, life: S.life }); b.yaw = Math.atan2(ax, az); }
    else if (S.id === 'frost') {
      b.yaw = Math.atan2(ax, az);
      const hit = [];
      const targets = solo ? dummies.filter(d => !d.falling).map(d => ({ o: d, pid: null })) : players.filter(p => p.pid !== pid && foes(pid, p.pid) && hittable(p.pid)).map(p => ({ o: bodies.get(p.pid), pid: p.pid }));
      for (const { o, pid: tp } of targets) {
        const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz); if (d > S.range || d < 0.01) continue;
        if (Math.acos(Math.max(-1, Math.min(1, (dx * ax + dz * az) / d))) > S.cone) continue;
        if (tp != null) { const q = P.get(tp); if (q.ward > 0) continue; q.slow = S.slow; o.flags |= F.SLOW; hurt(tp, pid, dx / d, dz / d, S.knock, S.dmg); hit.push(tp); }
        else { o.vx += dx / d * 4; o.vz += dz / d * 4; o.by = pid; }
      }
      events.push({ e: 'frost', pid, x: r2(b.x), z: r2(b.z), ax: r2(ax), az: r2(az), hit });
    } else if (S.id === 'ward') { s.ward = S.time; events.push({ e: 'ward', pid }); }
    else if (S.id === 'hop') {
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), x0 = b.x, z0 = b.z;
      b.x += fx * S.dist; b.z += fz * S.dist; b.vx = fx * 2; b.vz = fz * 2;
      events.push({ e: 'hop', pid, x0: r2(x0), z0: r2(z0), x: r2(b.x), z: r2(b.z) });
    }
    events.push({ e: 'cast', pid, k: S.id });
  }
  function burst(sh) {
    sh.burst = true; sh.life = 0;
    const S = SPELLS[spellIndex(sh.k)], hit = [];
    for (const p of players) { if (!foes(sh.by, p.pid) || !hittable(p.pid)) continue; const b = bodies.get(p.pid), dx = b.x - sh.x, dz = b.z - sh.z, d = Math.hypot(dx, dz); if (d > S.blast) continue; if (hurt(p.pid, sh.by, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0, S.knock * (1 - d / S.blast * 0.4), S.dmg)) hit.push(p.pid); }
    for (const dm of dummies) { if (dm.falling) continue; const dx = dm.x - sh.x, dz = dm.z - sh.z, d = Math.hypot(dx, dz); if (d > S.blast) continue; dm.vx += (d > 0.01 ? dx / d : 1) * 10; dm.vz += (d > 0.01 ? dz / d : 0) * 10; dm.by = sh.by; dummyHit(dm, sh.by); }
    events.push({ e: 'boom', x: r2(sh.x), z: r2(sh.z), by: sh.by, hit });
  }
  function dummyHit(dm, by) { if (dm.hitT > 0) return; dm.hitT = 0.4; P.get(by).pts += 1; events.push({ e: 'thwack', id: dm.id, by, x: r2(dm.x), z: r2(dm.z) }); }
  function startFall(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.falling = true; s.vy = 1; s.back = RULES.respawn; s.zap = 0; b.flags |= F.STUN;
    const by = s.by >= 0 && el - s.byAt <= RULES.credit ? s.by : null;
    loseHeart(pid, by, 'fall');
  }
  return {
    bodies, events,
    init: () => ({ spells: SPELLS.map(s => ({ id: s.id, name: s.name, cool: r2(s.cool * Lv.cool) })), hearts: RULES.hearts, solo, teams: [...teamOf.values()].length !== new Set(teamOf.values()).size ? Object.fromEntries(teamOf) : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      if (pb && active(pid)) { s.sp = (s.sp + 1) % SPELLS.length; events.push({ e: 'pick', pid, sp: s.sp }); }
      if (pa) cast(pid);
      stepBody(b, s.falling ? null : inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      el += dt;
      separate([...bodies].filter(([pid]) => active(pid)).map(([, b]) => b));
      // spells in flight
      for (const sh of shots) {
        const S = SPELLS[spellIndex(sh.k)];
        if (S.turn) {                                    // the wisp turns toward the nearest rival
          const ms = marksFor(sh.by); let best = null, bd = 9;
          for (const m of ms) { const d = Math.hypot(m.x - sh.x, m.z - sh.z); if (d < bd) { bd = d; best = m; } }
          if (best) { const want = Math.atan2(best.x - sh.x, best.z - sh.z), cur = Math.atan2(sh.vx, sh.vz); let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d)); const a = cur + Math.max(-S.turn * dt, Math.min(S.turn * dt, d)); sh.vx = Math.sin(a) * S.speed; sh.vz = Math.cos(a) * S.speed; }
        }
        sh.x += sh.vx * dt; sh.z += sh.vz * dt; sh.life -= dt;
        for (const p of players) {
          if (sh.life <= 0) break;
          const pid = p.pid, b = bodies.get(pid), s = P.get(pid);
          if (!active(pid) || Math.hypot(b.x - sh.x, b.z - sh.z) > S.r) continue;
          if (s.ward > 0 && sh.by !== pid && foes(sh.by, pid)) { sh.vx = -sh.vx; sh.vz = -sh.vz; sh.by = pid; sh.life = Math.max(sh.life, 0.9); events.push({ e: 'bounce', pid, x: r2(sh.x), z: r2(sh.z) }); continue; }
          if (!foes(sh.by, pid) || !hittable(pid)) continue;
          if (S.blast) { burst(sh); sh.life = 0; break; }
          const sp = Math.hypot(sh.vx, sh.vz) || 1; hurt(pid, sh.by, sh.vx / sp, sh.vz / sp, S.knock, S.dmg);
          events.push({ e: 'zap', k: sh.k, pid, by: sh.by, x: r2(sh.x), z: r2(sh.z) }); sh.life = 0;
        }
        if (sh.life > 0) for (const dm of dummies) if (!dm.falling && Math.hypot(dm.x - sh.x, dm.z - sh.z) < S.r + 0.2) {
          if (S.blast) { burst(sh); sh.life = 0; break; }
          const sp = Math.hypot(sh.vx, sh.vz) || 1; dm.vx += sh.vx / sp * S.knock * 0.9; dm.vz += sh.vz / sp * S.knock * 0.9; dm.by = sh.by; dummyHit(dm, sh.by); sh.life = 0; break;
        }
        if (sh.life <= 0 && S.blast && !sh.burst) burst(sh);                 // an ember that hits nothing bursts where it ends
      }
      shots = shots.filter(sh => sh.life > 0 && Math.hypot(sh.x, sh.z) < R + 6);
      // wizards: timers, falling off, coming back
      for (const p of players) {
        const pid = p.pid, b = bodies.get(pid), s = P.get(pid);
        for (let i = 0; i < s.cd.length; i++) if (s.cd[i] > 0) s.cd[i] = Math.max(0, s.cd[i] - dt);
        if (s.ward > 0) s.ward -= dt;
        if (s.ghost > 0) { s.ghost -= dt; if (s.ghost <= 0 && !s.falling) b.flags &= ~F.GHOST; }
        if (s.slow > 0) { s.slow -= dt; if (s.slow <= 0) b.flags &= ~F.SLOW; }
        if (s.falling) {
          if (!(b.flags & F.OUT)) { s.vy -= 22 * dt; b.y += s.vy * dt; if (b.y < -6) { b.flags = F.OUT; b.vx = b.vz = 0; } }
          s.back -= dt;
          if (s.back <= 0 && s.hearts > 0) { s.falling = false; s.stun = 0; s.by = -1; s.ghost = RULES.back; const a = rng.range(0, Math.PI * 2), rr = rng.range(0, 2.5); b.x = r2(Math.sin(a) * rr); b.z = r2(Math.cos(a) * rr); b.y = 0; b.vx = b.vz = 0; b.flags = F.GHOST; events.push({ e: 'back', pid }); }
          continue;
        }
        if (s.hearts <= 0) { b.flags |= F.OUT; continue; }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (Math.hypot(b.x, b.z) > RULES.edge) startFall(pid);
      }
      // solo: straw wizards
      if (solo) {
        nextDummy -= dt;
        if (nextDummy <= 0 && dummies.filter(d => !d.falling).length < RULES.dummies) {
          nextDummy = RULES.dummyEvery; const b = bodies.get(players[0].pid);
          for (let k = 0; k < 10; k++) { const a = rng.range(0, Math.PI * 2), rr = rng.range(2, 6.5), x = r2(Math.sin(a) * rr), z = r2(Math.cos(a) * rr); if (Math.hypot(x - b.x, z - b.z) > 2.5 || k === 9) { dummies.push({ id: ++did, x, z, vx: 0, vz: 0, y: 0, falling: false, by: -1, hitT: 0, ph: r2(rng.range(0, 6.28)) }); break; } }
        }
        for (const dm of dummies) {
          if (dm.hitT > 0) dm.hitT -= dt;
          const kk = Math.max(0, 1 - 1.6 * dt); dm.vx *= kk; dm.vz *= kk;
          if (!dm.falling) { dm.vx += Math.sin(el * 0.9 + dm.ph) * 1.2 * dt; dm.vz += Math.cos(el * 0.7 + dm.ph) * 1.2 * dt; }
          dm.x += dm.vx * dt; dm.z += dm.vz * dt;
          if (dm.falling) { dm.y -= 9 * dt; continue; }
          if (Math.hypot(dm.x, dm.z) > RULES.edge) { dm.falling = true; P.get(players[0].pid).pts += RULES.koBonus; events.push({ e: 'pop', id: dm.id, by: players[0].pid, x: r2(dm.x), z: r2(dm.z) }); }
        }
        dummies = dummies.filter(d => d.y > -6);
      }
      time -= dt;
      const dropping = players.some(p => P.get(p.pid).falling && !(bodies.get(p.pid).flags & F.OUT) && P.get(p.pid).hearts <= 0);
      if ((!solo && standingTeams().size <= 1 && !dropping) || time <= 0) {
        time = Math.max(0, time); over = true;
        for (const p of players) if (P.get(p.pid).hearts > 0 && !solo) P.get(p.pid).pts += RULES.endBonus;
        for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}, lv = {}, sp = {}, cd = {}, wd = {}, zp = {};
      for (const p of players) { const s = P.get(p.pid); sc[p.pid] = s.pts; lv[p.pid] = s.hearts; zp[p.pid] = Math.round(s.zap); sp[p.pid] = s.sp; cd[p.pid] = s.cd.map(c => Math.round(c * 10) / 10); if (s.ward > 0) wd[p.pid] = 1; }
      const g = { sc, lv, zp, sp, cd, wd, s: shots.map(sh => [sh.id, spellIndex(sh.k), r2(sh.x), r2(sh.z)]), left: Math.ceil(time) };
      if (solo) g.dm = dummies.map(d => [d.id, r2(d.x), r2(d.z), r2(d.y)]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = P.get(p.pid); scores[p.pid] = s.pts; const k = s.pts * 1000 + s.hearts * 10; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    _P: P, get _shots() { return shots; }, get _dummies() { return dummies; }, _teamOf: teamOf, get _el() { return el; },
  };
}
