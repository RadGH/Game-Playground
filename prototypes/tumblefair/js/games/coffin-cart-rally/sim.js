// COFFIN CART RALLY (Halloween only) — a top-down race on coffin-shaped go-carts round a candle-lit crypt. It takes
// Wobblewheel Rally's kart racing (shared/arena.js `move.mode: 'car'`: the stick is the heading you want) and swaps the
// item boxes for the crypt itself:
//   skeleton hands   cracks in the floor glow purple, then a (friendly, bony) hand pops up for a moment and grabs any
//                    cart rolling over it and holds it there for a moment. Every crack keeps its own steady beat, so you can learn it.
//   A = hop          your cart bounces over a hand (and over anything else on the floor).
//   candle gates     two arches of candles across the track. Their candles flicker on and off on a steady beat of
//                    their own; roll through while they are LIT and you get a burst of speed. (Not "first cart only":
//                    that handed the leader every boost and the race was over on the first lap.)
//   B = lid slam     your coffin lid flips open with a BOO that spins out every cart right beside you (a cool-down).
// Progress counts only along the track (a cart's place on the loop is looked for only near where it was), so no
// corner can be cut. Placings: finish order, then distance. When the first cart is in, the rest have FINISH_WINDOW s.
// Solo: two CPU carts, quicker at harder settings. Difficulty also changes how many cracks there are and their beat.
import { makeBody, stepBody, separate, F, BODY_R } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'coffin-cart-rally', title: 'Coffin Cart Rally', blurb: 'Race coffin carts round the crypt — hop the skeleton hands!',
  how: ['Point the stick where you want to go — your cart turns that way.', 'A purple crack = a hand is coming. Press A to HOP over it!', 'Roll through a candle gate while it is lit for a burst of speed.', 'B = lid slam: BOO the carts right beside you.'],
  kind: 'arena', min: 1, max: 4, seconds: 75, scoring: 'points', unit: 'laps', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Hop', b: 'Lid slam' },
  move: { mode: 'car', speed: 7.0, accel: 3.2, turn: 3.7, grip: 7, boostMul: 1.5, slowMul: 0.55, stunDrag: 2.4 },
  arena: { shape: 'rect', hw: 11, hd: 10, wall: true }, pitch: 70, card: 'card-coffin-cart-rally', css: true,
};

/** The crypt layouts: a polygon whose corners are rounded off by `r` (metres, before SCALE). Start = middle of the longest side. */
export const TRACKS = [
  { id: 'tomb', name: 'Tomb Loop', pts: [[-7, -7], [7, -7], [8.5, 7], [-8.5, 7]], r: 4.5 },
  { id: 'keyhole', name: 'Keyhole Crypt', pts: [[-4, -8], [4, -8], [9, 0], [4, 8], [-4, 8], [-9, 0]], r: 3.4 },
  { id: 'gravestone', name: 'Gravestone Bend', pts: [[-9, -8], [9, -8], [9, 8], [3, 8], [3, 0], [-3, 0], [-3, 8], [-9, 8]], r: 2.6 },
  { id: 'crossbones', name: 'Crossbones Curve', pts: [[-9, -6], [-1, -8.5], [9, -6], [9, 6], [1, 8.5], [-9, 6]], r: 3.2 },
];
export const VARIANTS = TRACKS.length * 4;
export const RULES = {
  SCALE: 0.85, stretch: 1.12, W: 1.9, ds: 1.0,
  lapDist: 380, minLaps: 5, maxLaps: 8,
  countdown: 3, finishWindow: 12, endPause: 1.5,
  // skeleton hands: where (fraction of the lap, sideways offset in metres), how big, and their beat by difficulty
  spots: [[0.13, -0.95], [0.3, 0.95], [0.45, 0], [0.6, -0.95], [0.79, 0.95], [0.92, 0]],
  spotsFor: { easy: 4, normal: 5, hard: 6 },
  handR: 0.85, warn: 0.9, up: 0.75, period: { easy: 3.4, normal: 2.8, hard: 2.3 }, grabSpin: 1.0, grabSafe: 1.3,
  hopTime: 0.45, hopH: 0.7, hopCool: 0.9,
  gates: [0.22, 0.7], gateBoost: 1.1, gatePeriod: 2.6, gateLit: 1.3,
  slamR: 1.8, slamSpin: 0.7, slamPush: 4, slamCool: 3.0, slamSelf: 0.3,
  cpuPace: { easy: 0.84, normal: 0.92, hard: 0.99 },
};
const r2 = v => Math.round(v * 100) / 100;

/** Round the corners of a polygon and sample the loop every `ds` metres (the same rounding Wobblewheel Rally uses). */
function buildLoop(pts, r, ds) {
  const n = pts.length, path = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = v => Math.hypot(v[0], v[1]), nrm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };
  let start = 0, best = -1;
  for (let i = 0; i < n; i++) { const l = len(sub(pts[(i + 1) % n], pts[i])); if (l > best + 1e-6) { best = l; start = i; } }
  const P = i => pts[((start + i) % n + n) % n];
  path.push([(P(0)[0] + P(1)[0]) / 2, (P(0)[1] + P(1)[1]) / 2]);
  for (let k = 1; k <= n; k++) {
    const a = P(k - 1), p = P(k), b = P(k + 1), d1 = nrm(sub(p, a)), d2 = nrm(sub(b, p));
    const th = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]), ht = Math.tan(Math.abs(th) / 2);
    if (ht < 1e-4) { path.push(p); continue; }
    const t = Math.min(r * ht, len(sub(p, a)) / 2 * 0.98, len(sub(b, p)) / 2 * 0.98), re = t / ht;
    const A = [p[0] - d1[0] * t, p[1] - d1[1] * t], nC = th > 0 ? [-d1[1], d1[0]] : [d1[1], -d1[0]], C = [A[0] + nC[0] * re, A[1] + nC[1] * re];
    const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), steps = Math.max(3, Math.ceil(Math.abs(th) * re / 0.25));
    for (let s = 0; s <= steps; s++) { const ang = a0 + th * s / steps; path.push([C[0] + Math.cos(ang) * re, C[1] + Math.sin(ang) * re]); }
  }
  path.push(path[0]);
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + len(sub(path[i], path[i - 1])));
  const L = cum[cum.length - 1], N = Math.round(L / ds), cx = new Float64Array(N), cz = new Float64Array(N), tx = new Float64Array(N), tz = new Float64Array(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const s = k * L / N; while (cum[j + 1] < s) j++;
    const f = (s - cum[j]) / ((cum[j + 1] - cum[j]) || 1); cx[k] = path[j][0] + (path[j + 1][0] - path[j][0]) * f; cz[k] = path[j][1] + (path[j + 1][1] - path[j][1]) * f;
  }
  for (let k = 0; k < N; k++) { const a = (k + N - 1) % N, b = (k + 1) % N, d = nrm([cx[b] - cx[a], cz[b] - cz[a]]); tx[k] = d[0]; tz[k] = d[1]; }
  return { cx, cz, tx, tz, N, L };
}

/** A crypt, ready to race: the loop, its walls, the cracks (hands) and the candle gates. */
export function makeTrack(variant, difficulty = 'normal') {
  const nT = TRACKS.length, T = TRACKS[variant % nT], mirror = Math.floor(variant / nT) & 1, rev = Math.floor(variant / (nT * 2)) & 1, S = RULES.SCALE, W = RULES.W;
  let pts = T.pts.map(([a, b]) => [(mirror ? -b : b) * S, a * S * RULES.stretch]);      // laid out tall (phones are tall)
  if (mirror !== rev) pts = pts.reverse();
  const loop = buildLoop(pts, T.r * S, RULES.ds), { cx, cz, tx, tz, N, L } = loop;
  const at = (k, lat) => { k = ((k % N) + N) % N; return [cx[k] - tz[k] * lat, cz[k] + tx[k] * lat]; };
  const segs = [];
  for (const side of [-W, W]) for (let k = 0; k < N; k++) { const a = at(k, side), b = at(k + 1, side); segs.push({ ax: r2(a[0]), az: r2(a[1]), bx: r2(b[0]), bz: r2(b[1]) }); }
  let hw = 0, hd = 0; for (const s of segs) { hw = Math.max(hw, Math.abs(s.ax)); hd = Math.max(hd, Math.abs(s.az)); }
  const frac = f => Math.round(f * N) % N;
  const nSpots = RULES.spotsFor[difficulty] ?? RULES.spotsFor.normal;
  // easy keeps every other crack first (so the ones left are spread round the lap)
  const order = [0, 2, 4, 1, 3, 5].slice(0, nSpots).sort((a, b) => a - b);
  const spots = order.map(i => { const [f, lat] = RULES.spots[i], k = frac(f), [x, z] = at(k, lat); return { k, lat, x: r2(x), z: r2(z) }; });
  const gates = RULES.gates.map(f => { const k = frac(f), [ax, az] = at(k, -W), [bx, bz] = at(k, W); return { k, ax: r2(ax), az: r2(az), bx: r2(bx), bz: r2(bz), yaw: r2(Math.atan2(tx[k], tz[k])) }; });
  const laps = Math.max(RULES.minLaps, Math.min(RULES.maxLaps, Math.round(RULES.lapDist / L)));
  return { id: T.id, name: T.name, variant, loop, at, segs, spots, gates, laps, hw: Math.round((hw + 0.4) * 10) / 10, hd: Math.round((hd + 0.4) * 10) / 10 };
}

/** Are a gate's candles lit at race time t? (each gate has its own phase) */
export const gateLit = (ph, t) => ((t + ph) % RULES.gatePeriod + RULES.gatePeriod) % RULES.gatePeriod < RULES.gateLit;
/** A crack's state at race time t (seconds since GO): 0 quiet, 1 glowing (a hand is coming), 2 hand up (it grabs). */
export function handAt(ph, period, t) {
  if (t < 0) return 0;
  const u = ((t + ph) % period + period) % period;
  return u < RULES.warn ? 1 : u < RULES.warn + RULES.up ? 2 : 0;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const track = makeTrack(rng.int(0, VARIANTS - 1), difficulty), { loop, at } = track, { N } = loop, LAPS = track.laps, W = RULES.W;
  const arena = { shape: 'rect', hw: track.hw, hd: track.hd, wall: true, segs: track.segs };
  const period = RULES.period[difficulty] ?? RULES.period.normal;
  // every crack's beat: its own phase, so the hands never all come up at once
  const spots = track.spots.map((s, i) => ({ ...s, ph: r2(rng.range(0, period) + i * 0.37) }));
  const gates = track.gates.map((g, i) => ({ ...g, ph: r2(rng.range(0, RULES.gatePeriod) + i * 0.9) }));
  const solo = players.length === 1;
  const racers = players.map(p => ({ id: p.pid, pid: p.pid, cpu: false }));
  if (solo) racers.push({ id: -1, cpu: true, name: 'Rattles', lane: 0.7 }, { id: -2, cpu: true, name: 'Mossy', lane: -0.7 });
  const bodies = new Map(), R = new Map();
  const yaw0 = Math.atan2(loop.tx[0], loop.tz[0]);
  racers.forEach((r, i) => {
    const row = Math.floor(i / 2), lat = (i % 2 ? -0.85 : 0.85), k = N - 2 - row * 2, [x, z] = at(k, lat);
    const b = makeBody(r2(x), r2(z), r2(yaw0)); b.flags = F.FROZEN;
    if (!r.cpu) bodies.set(r.pid, b);
    R.set(r.id, { ...r, b, k, prog: k - N, prevB: 0, boost: 0, slow: 0, spin: 0, safe: 0, hop: 0, hopCool: 0, slamCool: 0, fin: -1, finAt: 0, lapShown: 0, stuck: 0, hops: 0, grabs: 0, gates: 0, slams: 0, think: rng.range(0.3, 1) });
  });
  const cpuMove = { ...meta.move, speed: meta.move.speed * (RULES.cpuPace[difficulty] ?? RULES.cpuPace.normal) };
  let time = meta.seconds, countdown = RULES.countdown, race = 0, finishLeft = -1, endIn = -1, over = false, finCount = 0;
  const events = [];
  const racing = () => countdown <= 0 && !over;

  function track1(r) {
    const b = r.b; let bestK = r.k, bestD = Infinity;
    for (let d = -6; d <= 6; d++) { const k = ((r.k + d) % N + N) % N, dd = (b.x - loop.cx[k]) ** 2 + (b.z - loop.cz[k]) ** 2; if (dd < bestD) { bestD = dd; bestK = k; } }
    let delta = bestK - r.k; if (delta > N / 2) delta -= N; if (delta < -N / 2) delta += N;
    const before = r.prog; r.prog += delta; r.k = bestK;
    // candle gates: crossing one (going forward) while its candles are lit gives a burst of speed
    if (delta > 0 && racing() && r.fin < 0) for (const g of gates) {
      const gk = g.k, crossed = Math.floor((r.prog - gk) / N) > Math.floor((before - gk) / N);
      if (!crossed || !gateLit(g.ph, race)) continue;
      r.boost = Math.max(r.boost, RULES.gateBoost); r.gates++;
      events.push({ e: 'gate', id: r.id, g: gates.indexOf(g) });
    }
    const k = bestK, lat = (b.x - loop.cx[k]) * -loop.tz[k] + (b.z - loop.cz[k]) * loop.tx[k], lim = W - BODY_R + 0.12;
    if (Math.abs(lat) > lim) {
      const nx = -loop.tz[k] * Math.sign(lat), nz = loop.tx[k] * Math.sign(lat), o = Math.abs(lat) - lim;
      b.x -= nx * o; b.z -= nz * o; const vn = b.vx * nx + b.vz * nz; if (vn > 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
    }
  }
  const along = r => r.prog + ((r.b.x - loop.cx[r.k]) * loop.tx[r.k] + (r.b.z - loop.cz[r.k]) * loop.tz[r.k]) / (loop.L / N);
  function places() {
    const list = [...R.values()].sort((a, c) => (a.fin >= 0 && c.fin >= 0) ? a.finAt - c.finAt : (a.fin >= 0 ? -1 : c.fin >= 0 ? 1 : along(c) - along(a)));
    const out = new Map(); list.forEach((r, i) => out.set(r.id, i + 1)); return out;
  }
  function spinOut(r, t, why, by = null) {
    if (r.spin > 0 || r.fin >= 0) return false;
    const k = why === 'hand' ? 0 : 0.4;                 // a hand HOLDS the cart where it is; a BOO just knocks it about
    r.spin = t; r.b.flags |= F.STUN; r.b.vx *= k; r.b.vz *= k;
    events.push({ e: 'spin', id: r.id, why, by, x: r2(r.b.x), z: r2(r.b.z) });
    return true;
  }
  function press(r, bits) {
    const pa = (bits & IN.A) && !(r.prevB & IN.A), pb = (bits & IN.B) && !(r.prevB & IN.B); r.prevB = bits;
    if (!racing() || r.fin >= 0 || r.spin > 0) return;
    if (pa && r.hop <= 0 && r.hopCool <= 0) { r.hop = RULES.hopTime; r.hopCool = RULES.hopCool; r.b.flags |= F.AIR; r.hops++; events.push({ e: 'hop', id: r.id }); }
    if (pb && r.slamCool <= 0) {
      r.slamCool = RULES.slamCool; r.slow = Math.max(r.slow, RULES.slamSelf); r.slams++;
      const hit = [];
      for (const q of R.values()) {
        if (q === r || q.fin >= 0 || q.b.flags & F.AIR) continue;
        const dx = q.b.x - r.b.x, dz = q.b.z - r.b.z, d = Math.hypot(dx, dz);
        if (d > RULES.slamR) continue;
        if (spinOut(q, RULES.slamSpin, 'slam', r.id)) { const k = d > 1e-3 ? 1 / d : 0; q.b.vx += dx * k * RULES.slamPush; q.b.vz += dz * k * RULES.slamPush; hit.push(q.id); }
      }
      events.push({ e: 'slam', id: r.id, hit, x: r2(r.b.x), z: r2(r.b.z) });
    }
  }
  /** Is a crack in this cart's path a few metres ahead, glowing or up? (the CPU's and the test bots' eyes) */
  const handAhead = (r, look = 2.6) => spots.some(s => {
    let d = s.k - r.k; if (d < 0) d += N; if (d > look || d < 0.5) return false;
    const [x, z] = at(r.k, 0), lat = (r.b.x - x) * -loop.tz[r.k] + (r.b.z - z) * loop.tx[r.k];
    return Math.abs(lat - s.lat) < 1.3 && handAt(s.ph, period, race + d * 0.13) > 0;
  });
  function cpuInput(r) {
    const b = r.b, [x, z] = at(r.k + 4, r.lane * (Math.abs(Math.sin(race * 0.4 + r.id)) * 0.8 + 0.2));
    let mx = x - b.x, mz = z - b.z; const m = Math.hypot(mx, mz) || 1; mx /= m; mz /= m;
    if (Math.hypot(b.vx, b.vz) < 0.6 && racing()) r.stuck += 0.05; else r.stuck = Math.max(0, r.stuck - 0.1);
    if (r.stuck > 1.2) { const [x2, z2] = at(r.k + 1, 0); mx = x2 - b.x; mz = z2 - b.z; const m2 = Math.hypot(mx, mz) || 1; mx /= m2; mz /= m2; if (r.stuck > 2.2) r.stuck = 0; }
    let bits = 0;
    r.think -= 0.05;
    if (r.think <= 0 && handAhead(r)) { bits |= IN.A; r.think = 0.4; }
    if (r.slamCool <= 0 && [...R.values()].some(q => q !== r && q.fin < 0 && Math.hypot(q.b.x - b.x, q.b.z - b.z) < 1.4) && rng.chance(0.08)) bits |= IN.B;
    return { mx, mz, b: bits };
  }
  function moveRacer(r, inp) { press(r, inp?.b | 0); stepBody(r.b, inp, r.cpu ? cpuMove : meta.move, arena); track1(r); }

  return {
    bodies, events,
    init: () => ({ arena, track: { variant: track.variant, name: track.name, laps: LAPS, N, spots: spots.map(s => ({ k: s.k, x: s.x, z: s.z, ph: s.ph })), gates: track.gates, period, warn: RULES.warn, up: RULES.up, cpu: racers.filter(r => r.cpu).map(r => ({ id: r.id, name: r.name })) }, left: Math.ceil(time) }),
    input(pid, inp) { const r = R.get(pid); if (!r || over) return; moveRacer(r, r.fin >= 0 ? null : inp); },
    step(dt) {
      if (over) return;
      time -= dt;
      if (countdown > 0) {
        const was = Math.ceil(countdown); countdown -= dt;
        if (Math.ceil(countdown) !== was) events.push({ e: countdown <= 0 ? 'go' : 'count', n: Math.max(0, Math.ceil(countdown)) });
        if (countdown <= 0) for (const r of R.values()) r.b.flags &= ~F.FROZEN;
      } else race += dt;
      for (const r of R.values()) if (r.cpu) moveRacer(r, r.fin >= 0 || !racing() ? null : cpuInput(r));
      separate([...R.values()].filter(r => !(r.b.flags & F.AIR)).map(r => r.b));
      const hands = spots.map(s => handAt(s.ph, period, race));
      for (const r of R.values()) {
        const b = r.b;
        if (r.hopCool > 0) r.hopCool -= dt;
        if (r.slamCool > 0) r.slamCool -= dt;
        if (r.safe > 0) r.safe -= dt;
        if (r.hop > 0) { r.hop -= dt; const u = 1 - Math.max(0, r.hop) / RULES.hopTime; b.y = r2(Math.sin(u * Math.PI) * RULES.hopH); if (r.hop <= 0) { b.y = 0; b.flags &= ~F.AIR; } }
        if (r.spin > 0) { r.spin -= dt; b.yaw += 13 * dt; if (r.spin <= 0) { b.flags &= ~F.STUN; b.yaw = Math.atan2(Math.sin(b.yaw), Math.cos(b.yaw)); } }
        const live = racing() && r.fin < 0;
        // a hand that is UP grabs any cart on the ground over its crack
        if (live && !(b.flags & F.AIR) && r.safe <= 0) for (let i = 0; i < spots.length; i++) {
          if (hands[i] !== 2) continue; const s = spots[i];
          if (Math.hypot(s.x - b.x, s.z - b.z) < RULES.handR + BODY_R * 0.5 && spinOut(r, RULES.grabSpin, 'hand')) { r.safe = RULES.grabSafe; r.grabs++; events.push({ e: 'grab', id: r.id, s: i }); break; }
        }
        if (r.boost > 0) { r.boost -= dt; b.flags |= F.BOOST; } else b.flags &= ~F.BOOST;
        if (r.slow > 0) { r.slow -= dt; b.flags |= F.SLOW; } else b.flags &= ~F.SLOW;
        if (r.fin < 0) {
          const lap = Math.floor(r.prog / N) + 1;
          if (lap > r.lapShown && lap >= 2 && lap <= LAPS) events.push({ e: 'lap', id: r.id, lap });
          r.lapShown = Math.max(r.lapShown, lap);
          if (r.prog >= LAPS * N) { r.fin = ++finCount; r.finAt = race; r.boost = 0; events.push({ e: 'fin', id: r.id, place: r.fin }); if (finishLeft < 0) finishLeft = RULES.finishWindow; }
        } else { const k = Math.max(0, 1 - 1.6 * dt); b.vx *= k; b.vz *= k; }
      }
      if (finishLeft > 0) finishLeft = Math.max(0, finishLeft - dt);
      const humansIn = players.every(p => R.get(p.pid).fin >= 0);
      if (endIn < 0 && (humansIn || finishLeft === 0)) endIn = RULES.endPause;
      if (endIn > 0) endIn = Math.max(0, endIn - dt);
      if (endIn === 0 || time <= 0) {
        over = true; time = Math.max(0, time);
        for (const r of R.values()) { r.b.flags = (r.b.flags & ~(F.AIR | F.STUN)) | F.FROZEN; r.b.vx = r.b.vz = 0; r.b.y = 0; }
      }
    },
    state() {
      const pl = places(), rs = {};
      for (const r of R.values()) rs[r.id] = [Math.max(1, Math.min(LAPS, Math.floor(r.prog / N) + 1)), pl.get(r.id), r.fin, r.slamCool > 0 ? 1 : 0];
      const g = { rs, h: spots.map(s => handAt(s.ph, period, race)).join(''), gl: gates.map(x => (gateLit(x.ph, race) ? 1 : 0)).join(''), t: r2(race), left: Math.ceil(time) };
      if (countdown > 0) g.cd = Math.ceil(countdown);
      if (finishLeft > 0) g.fw = Math.ceil(finishLeft);
      const cpus = [...R.values()].filter(r => r.cpu);
      if (cpus.length) g.cpu = cpus.map(r => [r.id, r2(r.b.x), r2(r.b.z), r2(r.b.yaw), r.b.flags, r2(r.b.y)]);
      return g;
    },
    get over() { return over; },
    get race() { return race; },
    handAhead: id => handAhead(R.get(id)),
    track, racers: R, spots, gates, period,
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const r = R.get(p.pid); scores[p.pid] = r.fin >= 0 ? LAPS : Math.max(0, Math.floor(along(r) / N * 10) / 10);
        const key = r.fin >= 0 ? 1e6 - Math.round(r.finAt * 20) : Math.round(along(r) * 10) / 10;
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
