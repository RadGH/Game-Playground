// SKY SERPENT — co-op boss fight (round 8). A long, silly, ribbon-tailed sky serpent (paper-lantern scales, a big
// round nose, whiskers) circles a round stone lookout high in the clouds. Four HARPOON CANNONS stand on the rim.
//   CIRCLING: it loops round outside the rim. Stand at a cannon, face the serpent (push the stick toward it — the
//     cannon swivels with you) and press A: the harpoon gets gentle aim help (it snaps to the serpent when it is
//     within ~30 degrees of where you face, and curves after it). 1 damage. A cannon reloads in 0.9 s.
//   DIVE: it picks someone; a dark SHADOW slides after them for 1.2 s, stops and flashes (0.65 s), then the serpent
//     dives through it. Caught = knocked flat and dizzy for a second. B = DASH out of the shadow.
//   DAZED: after a dive it skids across the lookout, low and dizzy, for 2.2 s — harpoons do DOUBLE damage — then
//     climbs back out on the far side.
// Beat its health before the bell. Scores = damage each player dealt. The serpent never blocks a harpoon.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { r2, clamp, byDiff, angDiff, aimHelp, knock, presses, coopResult } from '../boss-kit.js';

const R = 7.5, CANNON_R = 6.75;
export const CANNONS = [0, 1, 2, 3].map(i => { const a = Math.PI / 4 + i * Math.PI / 2; return { x: r2(Math.sin(a) * CANNON_R), z: r2(Math.cos(a) * CANNON_R), r: 0.5, a }; });
export const meta = {
  id: 'sky-serpent', title: 'Sky Serpent', blurb: 'Man the harpoon cannons and dash out of the serpent’s diving shadow!',
  how: ['Stand at a cannon, face the serpent and press A to fire a harpoon.', 'A shadow chasing you = it is about to dive. B = DASH out!', 'After a dive it is dazed and low: harpoons do double damage.', 'Beat it before the bell!'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'coop', unit: 'damage', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Fire', b: 'Dash' }, move: { speed: 6, accel: 30, stunDrag: 2.6, boostMul: 2.1 },
  arena: { shape: 'circle', r: R, wall: true, posts: CANNONS.map(c => ({ x: c.x, z: c.z, r: c.r })) }, pitch: 58, card: 'card-sky-serpent', css: false,
};
export const RULES = {
  start: 2.4, circleR: 9.7, high: 3.2, low: 0.9,
  spin: { easy: 0.42, normal: 0.52, hard: 0.62 },           // rad/s round the rim
  every: { easy: 6.5, normal: 5.5, hard: 4.6 },             // seconds of circling between dives
  hp: { easy: 15, normal: 20, hard: 22 }, hpPer: 0.15,
  mark: 1.2, lock: { easy: 0.8, normal: 0.65, hard: 0.5 }, dive: 0.5, dazed: 2.2, climb: 1.0,
  shadowR: 1.7, follow: 3.6,
  reach: 1.35, reload: 0.9, cone: 0.52, range: 13, speed: 17, life: 0.85, turn: 3.2, hitR: 1.35, segs: [0, 1.3, 2.6, 3.9],
  dash: 0.32, dashCool: 1.3, hurtStun: 1.0, invuln: 1.4, knock: 6.5,
};
export const hpFor = (n, d) => Math.round(byDiff(d, RULES.hp) * (1 + RULES.hpPer * (n - 1)));
/** The cannon a body is standing at (index), or -1. */
export const cannonAt = (x, z) => CANNONS.findIndex(c => Math.hypot(x - c.x, z - c.z) <= RULES.reach);

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 1.8, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z, Math.atan2(s.x, s.z) || 0)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, inv: 0, dash: 0, dashCool: 0, dmg: 0 }]));
  const hpMax = hpFor(n, difficulty), reload = CANNONS.map(() => 0);
  const S = { th: Math.PI, x: 0, z: -RULES.circleR, y: RULES.high, yaw: Math.PI / 2, dir: 1 };
  let hp = hpMax, time = meta.seconds, phase = 'ready', left = RULES.start, over = false, success = false, cyc = 0;
  let shadow = null, path = null, shots = [], sid = 0, target = pids[0];
  const events = [];

  /** Points along the serpent that a harpoon can hit: the head and three body points behind it. */
  const hitPoints = () => RULES.segs.map(d => ({ x: S.x - Math.sin(S.yaw) * d, z: S.z - Math.cos(S.yaw) * d }));
  function setPos(x, z, y) { const dx = x - S.x, dz = z - S.z; if (Math.hypot(dx, dz) > 1e-3) S.yaw = Math.atan2(dx, dz); S.x = x; S.z = z; S.y = y; }
  function hurt(pid, fx, fz) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || over) return;
    s.inv = RULES.invuln; s.stun = RULES.hurtStun; s.dash = 0; b.flags &= ~F.BOOST; knock(b, fx, fz, RULES.knock);
    events.push({ e: 'hurt', pid });
  }
  function fire(pid, ci) {
    const b = bodies.get(pid), c = CANNONS[ci];
    if (reload[ci] > 0) { events.push({ e: 'reload', pid, c: ci }); return; }
    reload[ci] = RULES.reload;
    const aim = aimHelp(c.x, c.z, b.yaw, hitPoints(), RULES.cone, RULES.range);
    shots.push({ id: ++sid, pid, x: c.x, z: c.z, yaw: aim.yaw, life: RULES.life, homing: !!aim.target });
    events.push({ e: 'fire', pid, c: ci, yaw: r2(aim.yaw), aimed: aim.target ? 1 : 0 });
  }
  function startDive() {
    phase = 'mark'; left = RULES.mark; target = pids[cyc++ % n];
    const b = bodies.get(target); shadow = { x: b.x, z: b.z };
    events.push({ e: 'mark', pid: target });
  }
  function finish(ok) {
    over = true; success = ok; phase = 'end'; shadow = null; shots = [];
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~(F.STUN | F.BOOST); b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, solo: n === 1 }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp), free = !(b.flags & F.STUN);
      if (pr.b && free && s.dashCool <= 0) { s.dash = RULES.dash; s.dashCool = RULES.dashCool; b.flags |= F.BOOST; events.push({ e: 'dash', pid }); }
      stepBody(b, s.dash > 0 && Math.hypot(inp?.mx || 0, inp?.mz || 0) < 0.3 ? { mx: Math.sin(b.yaw), mz: Math.cos(b.yaw), b: 0 } : inp, meta.move, A);
      if (pr.a && free) { const ci = cannonAt(b.x, b.z); if (ci >= 0) fire(pid, ci); else events.push({ e: 'nocannon', pid }); }
    },
    step(dt) {
      if (over) return;
      time -= dt; left -= dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        s.inv = Math.max(0, s.inv - dt); s.dashCool = Math.max(0, s.dashCool - dt);
        if (s.dash > 0) { s.dash -= dt; if (s.dash <= 0) b.flags &= ~F.BOOST; }
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
      }
      for (let i = 0; i < reload.length; i++) reload[i] = Math.max(0, reload[i] - dt);
      // the serpent
      const spin = byDiff(difficulty, RULES.spin) * (time < 25 ? 1.15 : 1);
      if (phase === 'ready' || phase === 'circle' || phase === 'mark' || phase === 'lock') {
        S.th += spin * dt * S.dir;
        setPos(Math.sin(S.th) * RULES.circleR, Math.cos(S.th) * RULES.circleR, RULES.high + 0.4 * Math.sin(S.th * 3));
      }
      if (phase === 'mark') { const b = bodies.get(target), dx = b.x - shadow.x, dz = b.z - shadow.z, d = Math.hypot(dx, dz), v = Math.min(d, RULES.follow * dt); if (d > 1e-3) { shadow.x += dx / d * v; shadow.z += dz / d * v; } }
      else if (phase === 'dive' || phase === 'dazed' || phase === 'climb') {
        const k = 1 - left / path.dur;
        if (phase === 'dive') setPos(path.x0 + (shadow.x - path.x0) * k, path.z0 + (shadow.z - path.z0) * k, RULES.high + (0.4 - RULES.high) * k);
        else if (phase === 'dazed') setPos(shadow.x + (path.mx - shadow.x) * k, shadow.z + (path.mz - shadow.z) * k, RULES.low);
        else setPos(path.mx + (path.ex - path.mx) * k, path.mz + (path.ez - path.mz) * k, RULES.low + (RULES.high - RULES.low) * k);
      }
      // harpoons
      for (const h of shots) {
        if (h.homing) { const want = Math.atan2(S.x - h.x, S.z - h.z); h.yaw += clamp(angDiff(want, h.yaw), -RULES.turn * dt, RULES.turn * dt); }
        h.x += Math.sin(h.yaw) * RULES.speed * dt; h.z += Math.cos(h.yaw) * RULES.speed * dt; h.life -= dt;
        if (hitPoints().some(p => Math.hypot(p.x - h.x, p.z - h.z) <= RULES.hitR)) {
          h.life = 0; const dmg = Math.min(hp, phase === 'dazed' ? 2 : 1); hp -= dmg; P.get(h.pid).dmg += dmg;
          events.push({ e: 'hit', pid: h.pid, dmg, x: r2(h.x), z: r2(h.z), hp });
          if (hp <= 0) return finish(true);
        } else if (h.life <= 0) events.push({ e: 'miss', id: h.id, x: r2(h.x), z: r2(h.z) });
      }
      shots = shots.filter(h => h.life > 0);
      // phases
      if (left <= 0) {
        if (phase === 'ready') { phase = 'circle'; left = byDiff(difficulty, RULES.every) * 0.6; }
        else if (phase === 'circle') startDive();
        else if (phase === 'mark') { phase = 'lock'; left = byDiff(difficulty, RULES.lock); events.push({ e: 'lock' }); }
        else if (phase === 'lock') { phase = 'dive'; left = RULES.dive; path = { dur: RULES.dive, x0: S.x, z0: S.z }; events.push({ e: 'dive' }); }
        else if (phase === 'dive') {
          for (const [pid, b] of bodies) if (Math.hypot(b.x - shadow.x, b.z - shadow.z) <= RULES.shadowR + 0.2) hurt(pid, shadow.x, shadow.z);
          events.push({ e: 'crash', x: r2(shadow.x), z: r2(shadow.z) });
          // skid on through the lookout in the dive's direction, then climb out where that line meets the loop
          let dx = shadow.x - path.x0, dz = shadow.z - path.z0; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
          const bq = shadow.x * dx + shadow.z * dz, cq = shadow.x ** 2 + shadow.z ** 2 - RULES.circleR ** 2, t = -bq + Math.sqrt(Math.max(0, bq * bq - cq));
          path = { dur: RULES.dazed, mx: shadow.x + dx * Math.min(3, t * 0.4), mz: shadow.z + dz * Math.min(3, t * 0.4), ex: shadow.x + dx * t, ez: shadow.z + dz * t };
          phase = 'dazed'; left = RULES.dazed; events.push({ e: 'dazed' });
        } else if (phase === 'dazed') { phase = 'climb'; left = RULES.climb; path.dur = RULES.climb; shadow = null; }
        else if (phase === 'climb') { phase = 'circle'; left = byDiff(difficulty, RULES.every); S.th = Math.atan2(path.ex, path.ez); S.dir = rng.chance(0.5) ? 1 : -1; }
      }
      if (time <= 0) finish(hp <= 0);
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).dmg;
      const g = { ph: phase, hp, sc, left: Math.max(0, Math.ceil(time)), s: [r2(S.x), r2(S.z), r2(S.y), r2(S.yaw)], rl: reload.map(r => r2(r)) };
      if (shadow) g.sh = [r2(shadow.x), r2(shadow.z), r2(Math.max(0, left)), phase === 'mark' ? 0 : phase === 'lock' ? 1 : 2];
      if (shots.length) g.hs = shots.map(h => [h.id, r2(h.x), r2(h.z), r2(h.yaw)]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).dmg;
      return coopResult(pids, scores, over ? success : hp <= 0, meta.unit);
    },
  };
}
