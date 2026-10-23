// THIN ICE — a frozen pond made of hexagon tiles. Ice is slippery (you build speed slowly and slide when you stop).
// Every tile you stand on takes strain; once it has taken enough it CRACKS (hairlines, then big cracks, then it
// wobbles) and a moment later it falls into the water — so you can never stand still. Fall in and you are out. After a
// while the pond starts cracking on its own, faster and faster. B (or A) = slide dash: a burst of speed that knocks
// anyone you hit. Last one standing wins. Solo: survive as long as you can; snowflakes on the ice are +3 points each.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'thin-ice', title: 'Thin Ice', blurb: 'The ice cracks under your feet — keep moving and be the last one standing!',
  how: ['Ice cracks where you stand, then falls away.', 'Keep moving! It is slippery.', 'B slides fast and knocks others.', 'Last one on the ice wins.'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'survival', unit: 's', tags: ['action'],
  controls: { stick: true, b: 'Slide' }, move: { speed: 5.6, accel: 4.2, stunDrag: 0.9 },
  arena: { shape: 'circle', r: 7.4, wall: false }, pitch: 60, card: 'card-thin-ice', css: true,
};

export const HEX = 0.95;
const SQ3 = Math.sqrt(3);
/** The pond for `rings` rings of tiles round the middle one: tiles [q, r, x, z] (flat-topped hexagons, axial
 *  coordinates) in a fixed order, and at(x, z) = the index of the tile under a point, or -1 off the pond.
 *  4 rings = 61 tiles (1-2 players), 5 rings = 91 tiles (3-4 players). */
export function pond(rings) {
  const tiles = [];
  for (let q = -rings; q <= rings; q++) for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) tiles.push([q, r, Math.round(HEX * 1.5 * q * 1000) / 1000, Math.round(HEX * SQ3 * (r + q / 2) * 1000) / 1000]);
  const index = new Map(tiles.map((t, i) => [t[0] + ',' + t[1], i]));
  const at = (x, z) => {
    const fq = (2 / 3 * x) / HEX, fr = (-1 / 3 * x + SQ3 / 3 * z) / HEX, fs = -fq - fr;
    let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs);
    const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
    if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
    return index.get(q + ',' + r) ?? -1;
  };
  return { rings, tiles, at, radius: HEX * 1.5 * rings + HEX };
}
export const ringsFor = n => (n >= 3 ? 5 : 4);
export const RULES = {
  strain: { easy: 0.75, normal: 0.55, hard: 0.45 },      // seconds of standing before a tile starts to crack
  fall: { easy: 1.6, normal: 1.25, hard: 1.05 },         // seconds from the first crack to the splash
  heal: 0.7,                                            // strain a tile loses each second nobody stands on it (skating across is safe; stopping is not)
  quake: { easy: 22, normal: 16, hard: 12 },            // after this many seconds the pond cracks on its own...
  quakeEvery: [1.6, 0.35], quakeRamp: 40,               // ...one tile every 1.6 s, down to every 0.35 s over 40 s
  slideCool: 1.5, slideSpeed: 10.5, slideTime: 0.3, bumpR: 1.0, bumpPush: 8, bumpStun: 0.45,
  grace: 2.5,                                           // the first seconds: the ice takes no strain (read the card, find your feet)
  sink: 18, outY: -3.2,
  flake: 3, flakeR: 0.85,                               // solo: a snowflake is 3 points
};
const r2 = v => Math.round(v * 100) / 100;
const SOLID = 0, CRACK = 1, GONE = 2;

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.strain[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map(), spawns = spawnRing(n, solo ? 0 : n >= 3 ? 4.4 : 3.3);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, cool: 0, slide: 0, hit: new Set(), stun: 0, falling: false, vy: 0, outAt: -1, flakes: 0 }]));
  const PD = pond(ringsFor(n)), TILES = PD.tiles, tileAt = PD.at, arena = { shape: 'circle', r: Math.round((PD.radius + 0.6) * 10) / 10, wall: false };
  const T = TILES.map(() => ({ st: SOLID, strain: 0, c: 0 }));
  const strainMax = RULES.strain[D], fallT = RULES.fall[D];
  let time = meta.seconds, el = 0, over = false, quakeIn = RULES.quake[D], flake = null, flakeIn = 1.2, endIn = -1;
  const events = [];
  const live = pid => { const s = P.get(pid); return !s.falling; };
  function crack(i) { const t = T[i]; if (t.st !== SOLID) return; t.st = CRACK; t.c = 0; events.push({ e: 'crack', i }); }
  function startFall(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.falling = true; s.vy = 0.5; s.outAt = el; b.flags |= F.STUN; s.slide = 0;
    events.push({ e: 'fall', pid, x: r2(b.x), z: r2(b.z) });
  }
  const standing = () => players.filter(p => live(p.pid));
  const secs = pid => { const s = P.get(pid); return Math.floor((s.falling ? s.outAt : el) + 1e-6); };
  const score = pid => secs(pid) + (solo ? P.get(pid).flakes * RULES.flake : 0);
  return {
    bodies, events,
    init: () => ({ solo, rings: PD.rings, arena, fall: fallT, grace: RULES.grace, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, press = (bits & (IN.A | IN.B)) && !(s.prevB & (IN.A | IN.B)); s.prevB = bits;
      if (press && !s.falling && !(b.flags & F.STUN) && s.cool <= 0) {
        // slide the way the stick points (or the way you face)
        let mx = +inp?.mx || 0, mz = +inp?.mz || 0; const m = Math.hypot(mx, mz);
        if (m > 0.2) { mx /= m; mz /= m; b.yaw = Math.atan2(mx, mz); } else { mx = Math.sin(b.yaw); mz = Math.cos(b.yaw); }
        s.cool = RULES.slideCool; s.slide = RULES.slideTime; s.hit.clear(); b.vx = mx * RULES.slideSpeed; b.vz = mz * RULES.slideSpeed;
        events.push({ e: 'slide', pid });
      }
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) {          // the result is settled: only let a splash finish, then stop
        endIn -= dt; if (endIn <= 0) over = true;
        for (const [pid, b] of bodies) { const s = P.get(pid); if (s.falling && !(b.flags & F.OUT)) { s.vy -= RULES.sink * dt; b.y = r2(b.y + s.vy * dt); if (b.y < RULES.outY) { b.flags = F.OUT; b.vx = b.vz = 0; } } }
        return;
      }
      el += dt; time -= dt;
      separate([...bodies].filter(([pid]) => live(pid)).map(([, b]) => b));
      // strain: each standing player loads the tile under them
      const loaded = new Set();
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0 && !s.falling) b.flags &= ~F.STUN; }
        if (s.falling) {
          if (!(b.flags & F.OUT)) { s.vy -= RULES.sink * dt; b.y = r2(b.y + s.vy * dt); if (b.y < RULES.outY) { b.flags = F.OUT; b.vx = b.vz = 0; } }
          continue;
        }
        if (s.slide > 0) {
          s.slide -= dt;
          for (const [qid, c] of bodies) {
            if (qid === pid || s.hit.has(qid) || !live(qid) || Math.hypot(c.x - b.x, c.z - b.z) > RULES.bumpR) continue;
            s.hit.add(qid); const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz) || 1, q = P.get(qid);
            c.vx = dx / d * RULES.bumpPush; c.vz = dz / d * RULES.bumpPush; c.flags |= F.STUN; q.stun = RULES.bumpStun; b.vx *= 0.35; b.vz *= 0.35;
            events.push({ e: 'bump', pid: qid, by: pid, x: r2(c.x), z: r2(c.z) });
          }
        }
        const i = tileAt(b.x, b.z);
        if (i < 0 || T[i].st === GONE) { startFall(pid); continue; }
        if (!loaded.has(i) && el > RULES.grace) { loaded.add(i); const t = T[i]; if (t.st === SOLID) { t.strain += dt; if (t.strain >= strainMax) crack(i); } }
        if (solo && flake && Math.hypot(b.x - flake.x, b.z - flake.z) < RULES.flakeR) { s.flakes++; events.push({ e: 'flake', pid, x: flake.x, z: flake.z }); flake = null; flakeIn = 0.8; }
      }
      for (let i = 0; i < T.length; i++) {
        const t = T[i];
        if (t.st === SOLID && !loaded.has(i) && t.strain > 0) t.strain = Math.max(0, t.strain - RULES.heal * dt);
        if (t.st === CRACK) { t.c += dt; if (t.c >= fallT) { t.st = GONE; events.push({ e: 'drop', i }); } }
      }
      // the pond cracks on its own after a while, faster and faster
      quakeIn -= dt;
      if (quakeIn <= 0) {
        const solid = T.map((t, i) => t.st === SOLID ? i : -1).filter(i => i >= 0);
        if (solid.length) crack(rng.pick(solid));
        const k = Math.min(1, (el - RULES.quake[D]) / RULES.quakeRamp);
        quakeIn = RULES.quakeEvery[0] + (RULES.quakeEvery[1] - RULES.quakeEvery[0]) * k;
      }
      // solo: a snowflake to grab, on a tile that is still whole
      if (solo && !flake) {
        flakeIn -= dt;
        if (flakeIn <= 0) {
          const b = bodies.get(players[0].pid), ok = T.map((t, i) => t.st === SOLID && Math.hypot(TILES[i][2] - b.x, TILES[i][3] - b.z) > 2 ? i : -1).filter(i => i >= 0);
          if (ok.length) { const i = rng.pick(ok); flake = { x: TILES[i][2], z: TILES[i][3] }; } else flakeIn = 0.5;
        }
      }
      if (solo && flake) { const i = tileAt(flake.x, flake.z); if (i < 0 || T[i].st === GONE) { flake = null; flakeIn = 0.6; } }
      // the end: last one standing (once the faller has splashed), everybody in, or the bell
      const left = standing().length, splashing = players.some(p => P.get(p.pid).falling && !(bodies.get(p.pid).flags & F.OUT));
      if (((((!solo && left <= 1) || left === 0) && !splashing) || time <= 0)) {
        time = Math.max(0, time); endIn = time <= 0 ? 0.0001 : 0.8;
        for (const [pid, b] of bodies) if (live(pid)) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
        events.push({ e: 'end', win: !solo && left === 1 ? standing()[0].pid : null });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = score(p.pid);
      let t = '';
      for (const x of T) t += x.st === GONE ? 'x' : x.st === CRACK ? String(1 + Math.min(2, Math.floor(x.c / fallT * 3))) : x.strain >= strainMax * 0.5 ? 's' : '0';
      const g = { sc, t, o: players.filter(p => P.get(p.pid).falling).map(p => p.pid), left: Math.ceil(Math.max(0, time)) };
      if (solo) g.f = flake ? [flake.x, flake.z] : null;
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const s = P.get(p.pid); scores[p.pid] = score(p.pid);
        const k = solo ? scores[p.pid] : (s.falling ? Math.round(s.outAt * 20) : 1e6);      // still standing first, then who lasted longer
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: solo ? 'pts' : meta.unit };
    },
    tiles: T, pond: PD,
  };
}
