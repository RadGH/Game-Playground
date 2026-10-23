// REEL RUMBLE — everyone fishes the same lake at once from their own peg on the dock. The stick aims your cast; hold
// A to charge it (the power swings up and back like the golf games) and let go to cast — a ring on the water shows
// where the bobber will land. Fish shadows swim about (a bigger shadow is a bigger fish, and the big ones keep to the
// far water); one that notices your bobber swims over and nibbles, then BITES — the bobber plunges: press A quickly
// to hook it. Then the fight: HOLD A to reel in (the line tightens), LET GO to ease it (the fish swims off a little).
// Tension at the top snaps the line; let it run too far and it gets away. A fish surges now and then (pulls twice as
// hard — let go!) and tires the longer you keep it on a tight line. Bigger fish fight harder and score more; boots and
// weed score nothing. Pressing A while waiting reels the bobber back in to cast again. Most points wins.
// Fish, reel fight and cast arc: js/games/fish-kit.js + fish-species.js. Solo: medal scores.
import { makeBody, stepBody } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { charge, castLanding, castFlight, pickSpecies, rollWeight, startReel, stepReel, lineOf, wander, steerTo, groupBy } from '../fish-kit.js';
import { BY_ID, speciesIn } from '../fish-species.js';

export const meta = {
  id: 'reel-rumble', title: 'Reel Rumble', blurb: 'Cast, hook and reel in the biggest fish in the lake!',
  how: ['Aim with the stick. Hold A and let go to cast.', 'Bobber plunges? Press A to hook it!', 'HOLD A to reel, LET GO before the line snaps.', 'Bigger fish fight harder and score more.'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Cast / Reel' },
  move: { speed: 0.01, accel: 40 },
  arena: { shape: 'rect', hw: 9, hd: 6.6, wall: false }, pitch: 50, card: 'card-reel-rumble', css: true,
};

export const WATER = { x0: -8.6, x1: 8.6, z0: -6.4, z1: 3.4 };
export const DOCK_Z = 5.0;
export const LEVELS = {
  easy:   { window: 1.15, sense: 3.8, nib: [0.5, 1.2], period: 2.2, fish: 2, seek: 0.9 },
  normal: { window: 0.85, sense: 3.2, nib: [0.6, 1.8], period: 1.8, fish: 1, seek: 0.7 },
  hard:   { window: 0.6, sense: 2.7, nib: [0.8, 2.3], period: 1.5, fish: 0, seek: 0.55 },
};
export const MEDALS = [8, 18, 30];
export const CAST = { min: 2.2, max: 9.6 };
const SHOW = { land: 1.5, snap: 1.0, free: 1.0, back: 0.45 };
const r2 = v => Math.round(v * 100) / 100;
const LAKE = speciesIn('lake');
/** The dock pegs for n players. */
export const pegsFor = n => Array.from({ length: n }, (_, i) => ({ x: r2((i - (n - 1) / 2) * 3.6), z: DOCK_Z }));
/** Where a cast from a peg lands (inside the water). */
export function castSpot(peg, yaw, p) {
  const at = castLanding(peg.x, peg.z, yaw, p, CAST);
  return { x: r2(Math.max(WATER.x0, Math.min(WATER.x1, at.x))), z: r2(Math.max(WATER.z0, Math.min(WATER.z1, at.z))) };
}
/** Yaw kept pointing out over the water (yaw π = straight out, -z). */
export const clampYaw = y => { let d = Math.atan2(Math.sin(y - Math.PI), Math.cos(y - Math.PI)); d = Math.max(-1.15, Math.min(1.15, d)); return Math.PI + d; };

export function create({ rng, players, difficulty = 'normal' }) {
  const D = LEVELS[difficulty] ? difficulty : 'normal', L = LEVELS[D], line = lineOf(D);
  const n = players.length, pegs = pegsFor(n), bodies = new Map(), events = [];
  const P = new Map(players.map((p, i) => [p.pid, { i, peg: pegs[i], st: 0, held: 0, prevA: 0, yaw: Math.PI, fly: null, bx: 0, bz: 0, fish: null, bite: 0, R: null, show: 0, pts: 0, n: 0, kg: 0, best: null }]));
  // st: 0 aim, 1 bobber flying, 2 bobber in (waiting), 3 BITE (press A), 4 reeling, 5 a short pause (landed / snapped / reeled in)
  players.forEach((p, i) => bodies.set(p.pid, makeBody(pegs[i].x, pegs[i].z + 0.55, Math.PI)));
  let fishes = [], fid = 0, time = meta.seconds, over = false, respawn = [];
  function spawnFish(far = rng()) {
    const z = r2(WATER.z0 + 0.4 + (1 - far) * (WATER.z1 - WATER.z0 - 1.6)), sp = pickSpecies(rng, LAKE, Math.max(0, far - 0.35));
    const f = { id: ++fid, sp: sp.id, x: r2(rng.range(WATER.x0 + 0.5, WATER.x1 - 0.5)), z, h: rng.range(0, Math.PI * 2), st: 0, who: null, t: 0, shy: 0 };
    fishes.push(f); return f;
  }
  const count = Math.min(11, 4 + 2 * n + L.fish);
  for (let i = 0; i < count; i++) spawnFish(i / Math.max(1, count - 1));
  function release(f, shy = 2) { if (!f) return; f.st = 0; f.who = null; f.shy = shy; f.h = rng.range(0, Math.PI * 2); }
  function cast(pid, s) {
    const p = charge(s.held, L.period); s.held = 0;
    if (p < 0.04) return;
    const at = castSpot(s.peg, s.yaw, p), d = Math.hypot(at.x - s.peg.x, at.z - s.peg.z), f = castFlight(d);
    s.fly = { fx: s.peg.x, fz: s.peg.z - 0.4, tx: at.x, tz: at.z, T: f.T, apex: f.apex, t: 0 }; s.st = 1;
    events.push({ e: 'cast', pid, tx: at.x, tz: at.z, T: f.T, apex: f.apex });
  }
  function pause(s, what, secs) { s.st = 5; s.show = secs; s.R = null; s.fish = null; s.what = what; }
  function landed(pid, s) {
    const f = s.fish, sp = BY_ID[f.sp], kg = rollWeight(rng, sp);
    fishes = fishes.filter(x => x !== f); respawn.push(2 + rng.range(0, 1.5));
    s.pts += sp.pts; if (!sp.junk) { s.n++; s.kg = r2(s.kg + kg); if (!s.best || sp.pts > BY_ID[s.best].pts) s.best = sp.id; }
    events.push({ e: 'land', pid, sp: sp.id, kg, pts: sp.pts, junk: !!sp.junk });
    pause(s, 'land', SHOW.land);
  }
  const fresh = (s, a) => a && !s.prevA;
  return {
    bodies, events,
    init: () => ({ pegs, water: WATER, level: { window: L.window, period: L.period, d: D }, medals: n === 1 ? MEDALS : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || !s) return;
      if (!over && (s.st === 0 || s.st === 2 || s.st === 1)) { stepBody(b, inp, meta.move, meta.arena); s.yaw = clampYaw(b.yaw); }
      b.yaw = s.st === 4 && s.fish ? r2(Math.atan2(s.bx - s.peg.x, s.bz - s.peg.z)) : r2(s.yaw);
      b.vx = b.vz = 0; b.x = r2(s.peg.x - Math.sin(b.yaw) * 0.55); b.z = r2(s.peg.z - Math.cos(b.yaw) * 0.55);
      if (over) return;
      const a = (inp?.b | 0) & IN.A;
      if (s.st === 0) { if (a) s.held += 0.05; else if (s.prevA && s.held > 0) cast(pid, s); }
      else if (s.st === 2 && fresh(s, a)) { release(s.fish, 1); events.push({ e: 'back', pid }); pause(s, 'back', SHOW.back); }
      else if (s.st === 3 && fresh(s, a)) {
        const d = Math.hypot(s.bx - s.peg.x, s.bz - s.peg.z);
        s.R = startReel(rng, s.fish.sp, d, line); s.st = 4; s.fish.st = 3;
        events.push({ e: 'hook', pid, size: BY_ID[s.fish.sp].size });
      }
      s.hold = !!a; s.prevA = a;
    },
    step(dt) {
      if (over) return;
      time -= dt;
      for (const p of players) {
        const pid = p.pid, s = P.get(pid);
        if (s.st === 1) { s.fly.t += dt; if (s.fly.t >= s.fly.T) { s.bx = s.fly.tx; s.bz = s.fly.tz; s.fly = null; s.st = 2; events.push({ e: 'plop', pid, x: s.bx, z: s.bz }); } }
        else if (s.st === 3) { s.bite -= dt; if (s.bite <= 0) { release(s.fish, 2.5); s.fish = null; s.st = 2; events.push({ e: 'miss', pid, to: pid }); } }
        else if (s.st === 4) {
          const r = stepReel(s.R, !!s.hold, dt, rng, line), dx = s.bx - s.peg.x, dz = s.bz - s.peg.z, d = Math.hypot(dx, dz) || 1;
          const want = Math.max(0.3, s.R.dist); s.bx = r2(s.peg.x + dx / d * want); s.bz = r2(Math.min(WATER.z1 + 0.6, s.peg.z + dz / d * want));
          s.fish.x = s.bx; s.fish.z = s.bz;
          if (r === 'land') landed(pid, s);
          else if (r === 'snap' || r === 'free') { release(s.fish, 3); events.push({ e: r, pid, sp: s.fish.sp }); pause(s, r, r === 'snap' ? SHOW.snap : SHOW.free); }
        }
        else if (s.st === 5) { s.show -= dt; if (s.show <= 0) s.st = 0; }
      }
      // fish: swim about; a free one near a resting bobber may swim over, nibble, then bite
      for (const f of fishes) {
        const sp = BY_ID[f.sp];
        if (f.shy > 0) f.shy -= dt;
        if (f.st === 0) {
          wander(f, rng, WATER, sp.speed * 0.45, dt);
          if (f.shy <= 0) for (const p of players) {
            const s = P.get(p.pid); if (s.st !== 2 || s.fish) continue;
            if (Math.hypot(f.x - s.bx, f.z - s.bz) <= L.sense && rng.chance(L.seek * dt * 2)) { f.st = 1; f.who = p.pid; s.fish = f; break; }
          }
        } else if (f.st === 1) {
          const s = P.get(f.who);
          if (!s || s.st !== 2 || s.fish !== f) { release(f, 0.5); continue; }
          if (steerTo(f, s.bx, s.bz, sp.speed * 0.6, dt, 0.35)) { f.st = 2; f.t = rng.range(L.nib[0], L.nib[1]); events.push({ e: 'nib', pid: f.who }); }
        } else if (f.st === 2) {
          const s = P.get(f.who);
          if (!s || s.st !== 2 || s.fish !== f) { release(f, 0.5); continue; }
          f.t -= dt;
          if (f.t <= 0) { s.st = 3; s.bite = L.window; events.push({ e: 'bite', pid: f.who, x: s.bx, z: s.bz }); }
        }
      }
      respawn = respawn.map(t => t - dt); const due = respawn.filter(t => t <= 0).length; respawn = respawn.filter(t => t > 0);
      for (let i = 0; i < due; i++) spawnFish();
      if (time <= 0) { time = 0; over = true; events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).pts;
      const b = players.map(p => {
        const s = P.get(p.pid); let x = s.bx, z = s.bz, y = 0;
        if (s.fly) { const k = Math.min(1, s.fly.t / s.fly.T); x = s.fly.fx + (s.fly.tx - s.fly.fx) * k; z = s.fly.fz + (s.fly.tz - s.fly.fz) * k; y = 0.9 + 4 * s.fly.apex * k * (1 - k); }
        return [p.pid, s.st, r2(x), r2(z), r2(y), s.st === 4 ? Math.round(s.R.ten * 100) : 0, s.st === 4 && s.R.surge > 0 ? 1 : 0, s.st === 0 ? Math.round(charge(s.held, L.period) * 100) : 0, s.st === 4 ? Math.round(s.R.dist / s.R.max * 100) : 0];
      });
      return { b, f: fishes.filter(f => f.st !== 3).map(f => [f.id, r2(f.x), r2(f.z), r2(f.h), BY_ID[f.sp].size, f.sp === 'moonscale' ? 1 : 0]), sc, left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const rows = players.map(p => { const s = P.get(p.pid); return { pid: p.pid, key: s.pts * 1e6 + s.n * 1e3 + Math.round(s.kg * 10) }; });
      return { order: groupBy(rows), scores: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).pts])), unit: meta.unit, best: Object.fromEntries(players.map(p => [p.pid, P.get(p.pid).best])) };
    },
    _debug: { player: pid => P.get(pid), fishes: () => fishes },
  };
}
