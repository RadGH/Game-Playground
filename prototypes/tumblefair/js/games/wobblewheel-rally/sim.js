// WOBBLEWHEEL RALLY — a top-down kart race on one screen. The whole track is in view; every kart steers like a car
// (shared/arena.js `move.mode: 'car'`: the stick is the heading you want and the kart turns toward it). A few laps
// round one of four hand-made layouts (mirrored and/or run backwards by the seed, so 16 variations). The track's
// edges are thin walls (`arena.segs`) sent in init() so a phone predicts its own bumps.
//
//   ? boxes          drive through one with empty hands: Zoom Jar (a burst of speed), Slick (a puddle dropped behind
//                    you that spins out whoever drives over it) or Bonk Ball (rolls ahead, bounces off the walls,
//                    spins out the kart it hits). The further back you are, the more likely a Zoom Jar.
//   arrow pads       a speed burst (F.BOOST)            mud patches   slow you while you are in them (F.SLOW)
//   A                use your item (everybody starts holding a Zoom Jar, for the getaway)
//   B                hop: over mud and slicks and bonk balls; land beside a kart and you bump it aside
//
// No cutting: progress is counted only along the track, one short step at a time (a kart's place on the track is
// looked for only near where it was), so a lap counts when you have driven all of it. Placings: finish order, then
// how far along the track. When the first kart finishes, the rest have FINISH_WINDOW seconds. Solo: two CPU karts.
import { makeBody, stepBody, separate, F, BODY_R } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'wobblewheel-rally', title: 'Wobblewheel Rally', blurb: 'Race your kart round the fair track — first past the flag wins!',
  how: ['Point the stick where you want to go — the kart turns that way.', 'Drive through ? boxes for an item, A to use it.', 'B hops over mud, slicks and bonk balls.', 'Arrow pads speed you up. No cutting corners!'],
  kind: 'arena', min: 1, max: 4, seconds: 90, scoring: 'points', unit: 'laps', tags: ['action'],
  controls: { stick: true, a: 'Item', b: 'Hop' },
  move: { mode: 'car', speed: 7.2, accel: 3.2, turn: 3.7, grip: 7, boostMul: 1.55, slowMul: 0.5, stunDrag: 2.4 },
  arena: { shape: 'rect', hw: 11, hd: 10, wall: true }, pitch: 70, card: 'card-wobblewheel-rally', css: true,
};

/** The layouts: a polygon whose corners are rounded off by `r` (metres, before SCALE). Start line = middle of the longest side. */
export const TRACKS = [
  { id: 'teacup', name: 'Teacup Loop', pts: [[-8, -7], [8, -7], [8, 7], [-8, 7]], r: 5 },
  { id: 'elbow', name: 'Crooked Elbow', pts: [[-9, -8], [9, -8], [9, 0], [1, 0], [1, 8], [-9, 8]], r: 3.2 },
  { id: 'hairpin', name: 'Hairpin Hollow', pts: [[-9, -8], [9, -8], [9, 8], [3, 8], [3, -1], [-3, -1], [-3, 8], [-9, 8]], r: 2.6 },
  { id: 'pinch', name: 'Pinch Point', pts: [[-9, -8], [9, -8], [9, 8], [4, 8], [0, 1.5], [-4, 8], [-9, 8]], r: 2.6 },
];
export const RULES = {
  SCALE: 0.85, stretch: 1.12, W: 1.9, ds: 1.0,                    // track half-width; centre-line sample spacing
  lapDist: 250, minLaps: 3, maxLaps: 5,            // laps = this many metres of racing, rounded
  countdown: 3, finishWindow: 15, endPause: 1.5,
  boxEvery: 3, boxR: 0.9, zoomTime: 1.3, padTime: 0.9, padLen: 1.1, padHalfW: 0.8,
  mudLen: 1.4, mudHalfW: 0.85, mudLat: 0.85, slowAfter: 0.25,
  slickR: 0.8, slickLife: 10, slickMax: 6, spinTime: 0.8, slickArm: 0.8,
  ballSpeed: 12, ballLife: 2.6, ballR: 0.75, ballArm: 0.35, ballSpin: 0.9,
  hopCool: 1.0, hopTime: 0.42, hopH: 0.6, bumpR: 1.25, bumpPush: 4.5, bumpStun: 0.35,
  cpuPace: { easy: 0.84, normal: 0.92, hard: 0.99 },
};
export const ITEMS = ['', 'zoom', 'slick', 'bonk'];
const ZOOM = 1, SLICK = 2, BONK = 3;
const r2 = v => Math.round(v * 100) / 100;

/** Round the corners of a polygon and sample the loop every `ds` metres. -> { cx, cz, tx, tz, N, L } (closed loop) */
function buildLoop(pts, r, ds) {
  const n = pts.length, path = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = v => Math.hypot(v[0], v[1]), nrm = v => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };
  let start = 0, best = -1;                         // the longest side holds the start line
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

/** A track, ready to race: the loop, its walls, pads, mud, boxes and the grid. `variant` 0-15 picks layout + mirror + direction. */
export function makeTrack(variant) {
  const T = TRACKS[variant % TRACKS.length], mirror = (variant >> 2) & 1, rev = (variant >> 3) & 1, S = RULES.SCALE, W = RULES.W;
  let pts = T.pts.map(([a, b]) => [(mirror ? -b : b) * S, a * S * RULES.stretch]);      // drawn wide, laid out tall (phones are tall)
  if (mirror !== rev) pts = pts.reverse();          // mirroring flips the direction; undo that unless we also want it reversed
  const loop = buildLoop(pts, T.r * S, RULES.ds), { cx, cz, tx, tz, N, L } = loop;
  // left of travel = (tz, -tx) rotated... in x/z: the normal n = (-tz, tx)
  const at = (k, lat) => { k = ((k % N) + N) % N; return [cx[k] - tz[k] * lat, cz[k] + tx[k] * lat]; };
  const segs = [];
  for (const side of [-W, W]) for (let k = 0; k < N; k++) { const a = at(k, side), b = at(k + 1, side); segs.push({ ax: r2(a[0]), az: r2(a[1]), bx: r2(b[0]), bz: r2(b[1]) }); }
  let hw = 0, hd = 0; for (const s of segs) { hw = Math.max(hw, Math.abs(s.ax)); hd = Math.max(hd, Math.abs(s.az)); }
  const frac = f => Math.round(f * N) % N, oriented = (k, lat, hl, hwid) => { const [x, z] = at(k, lat); return { k, x: r2(x), z: r2(z), yaw: r2(Math.atan2(tx[k], tz[k])), hl, hw: hwid }; };
  const pads = [oriented(frac(0.42), 0, RULES.padLen, RULES.padHalfW), oriented(frac(0.86), 0, RULES.padLen, RULES.padHalfW)];
  const muds = [oriented(frac(0.2), RULES.mudLat, RULES.mudLen, RULES.mudHalfW), oriented(frac(0.64), -RULES.mudLat, RULES.mudLen, RULES.mudHalfW)];
  const boxes = [];
  for (const f of [0.3, 0.75]) for (const lat of [-1.05, 0, 1.05]) { const [x, z] = at(frac(f), lat); boxes.push({ x: r2(x), z: r2(z) }); }
  const laps = Math.max(RULES.minLaps, Math.min(RULES.maxLaps, Math.round(RULES.lapDist / L)));
  return { id: T.id, name: T.name, variant, loop, at, segs, pads, muds, boxes, laps, hw: Math.round((hw + 0.4) * 10) / 10, hd: Math.round((hd + 0.4) * 10) / 10 };
}

const inRect = (o, x, z, pad = 0) => { const dx = x - o.x, dz = z - o.z, s = Math.sin(o.yaw), c = Math.cos(o.yaw); return Math.abs(dx * s + dz * c) <= o.hl + pad && Math.abs(dx * c - dz * s) <= o.hw + pad; };

export function create({ rng, players, difficulty = 'normal' }) {
  const track = makeTrack(rng.int(0, 15)), { loop, at } = track, { N } = loop, LAPS = track.laps, W = RULES.W;
  const arena = { shape: 'rect', hw: track.hw, hd: track.hd, wall: true, segs: track.segs };
  const solo = players.length === 1;
  // racers: every player, plus two CPU karts when alone (negative ids)
  const racers = players.map(p => ({ id: p.pid, pid: p.pid, cpu: false }));
  if (solo) racers.push({ id: -1, cpu: true, name: 'Dot', lane: 0.7 }, { id: -2, cpu: true, name: 'Pip', lane: -0.7 });
  const bodies = new Map(), R = new Map();
  const yaw0 = Math.atan2(loop.tx[0], loop.tz[0]);
  racers.forEach((r, i) => {
    const row = Math.floor(i / 2), lat = (i % 2 ? -0.85 : 0.85), k = N - 2 - row * 2, [x, z] = at(k, lat);
    const b = makeBody(r2(x), r2(z), r2(yaw0)); b.flags = F.FROZEN;
    if (!r.cpu) bodies.set(r.pid, b);
    R.set(r.id, { ...r, b, k, prog: k - N, item: ZOOM, prevB: 0, boost: 0, slow: 0, spin: 0, hop: 0, hopCool: 0, fin: -1, finAt: 0, lapShown: 0, stuck: 0, think: rng.range(0.5, 1.5) });
  });
  const cpuMove = { ...meta.move, speed: meta.move.speed * (RULES.cpuPace[difficulty] ?? RULES.cpuPace.normal) };
  const boxes = track.boxes.map(b => ({ ...b, wait: 0 }));
  let slicks = [], balls = [], nid = 0, time = meta.seconds, countdown = RULES.countdown, finishLeft = -1, endIn = -1, over = false, finCount = 0, elapsed = 0;
  const events = [];
  const racing = () => countdown <= 0 && !over;

  /** Where is this racer on the track: nearest centre sample close to the last one; progress moves only by that step. */
  function track1(r) {
    const b = r.b; let bestK = r.k, bestD = Infinity;
    for (let d = -6; d <= 6; d++) { const k = ((r.k + d) % N + N) % N, dd = (b.x - loop.cx[k]) ** 2 + (b.z - loop.cz[k]) ** 2; if (dd < bestD) { bestD = dd; bestK = k; } }
    let delta = bestK - r.k; if (delta > N / 2) delta -= N; if (delta < -N / 2) delta += N;
    r.prog += delta; r.k = bestK;
    // the walls are thin: a kart that slipped through one is put back on the track
    const k = bestK, lat = (b.x - loop.cx[k]) * -loop.tz[k] + (b.z - loop.cz[k]) * loop.tx[k], lim = W - BODY_R + 0.12;
    if (Math.abs(lat) > lim) {
      const nx = -loop.tz[k] * Math.sign(lat), nz = loop.tx[k] * Math.sign(lat), over2 = Math.abs(lat) - lim;
      b.x -= nx * over2; b.z -= nz * over2; const vn = b.vx * nx + b.vz * nz; if (vn > 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
    }
  }
  const along = r => r.prog + ((r.b.x - loop.cx[r.k]) * loop.tx[r.k] + (r.b.z - loop.cz[r.k]) * loop.tz[r.k]) / (loop.L / N);
  function places() {
    const list = [...R.values()].sort((a, c) => (a.fin >= 0 && c.fin >= 0) ? a.finAt - c.finAt : (a.fin >= 0 ? -1 : c.fin >= 0 ? 1 : along(c) - along(a)));
    const out = new Map(); list.forEach((r, i) => out.set(r.id, i + 1)); return out;
  }
  function spinOut(r, t, by = null) {
    if (r.spin > 0 || r.fin >= 0) return;
    r.spin = t; r.b.flags |= F.STUN; r.b.vx *= 0.45; r.b.vz *= 0.45;
    events.push({ e: 'spin', id: r.id, by, x: r2(r.b.x), z: r2(r.b.z) });
  }
  function useItem(r) {
    const it = r.item, b = r.b; if (!it) return;
    r.item = 0; const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    if (it === ZOOM) { r.boost = Math.max(r.boost, RULES.zoomTime); const v = meta.move.speed * meta.move.boostMul; b.vx = fx * v; b.vz = fz * v; }
    else if (it === SLICK) { slicks.push({ id: ++nid, x: r2(b.x - fx * 1.3), z: r2(b.z - fz * 1.3), life: RULES.slickLife, by: r.id, arm: RULES.slickArm }); if (slicks.length > RULES.slickMax) slicks.shift(); }
    else if (it === BONK) balls.push({ id: ++nid, x: b.x + fx * 1.0, z: b.z + fz * 1.0, vx: fx * RULES.ballSpeed, vz: fz * RULES.ballSpeed, k: r.k, life: RULES.ballLife, by: r.id, arm: RULES.ballArm });
    events.push({ e: 'use', id: r.id, it });
  }
  function rollItem(r) {
    const pl = places().get(r.id), n = R.size, back = n > 1 ? (pl - 1) / (n - 1) : 0.5;        // 0 = leading, 1 = last
    const wZoom = 0.15 + 0.5 * back, wSlick = 0.5 - 0.4 * back, wBonk = 0.35;
    const x = rng() * (wZoom + wSlick + wBonk);
    return x < wZoom ? ZOOM : x < wZoom + wSlick ? SLICK : BONK;
  }
  function press(r, bits) {
    const pa = (bits & IN.A) && !(r.prevB & IN.A), pb = (bits & IN.B) && !(r.prevB & IN.B); r.prevB = bits;
    if (!racing() || r.fin >= 0 || r.spin > 0) return;
    if (pa) useItem(r);
    if (pb && r.hop <= 0 && r.hopCool <= 0) { r.hop = RULES.hopTime; r.hopCool = RULES.hopCool; r.b.flags |= F.AIR; events.push({ e: 'hop', id: r.id }); }
  }
  /** A CPU kart: aim a few samples ahead in its own lane; use items when it has had them a moment. */
  function cpuInput(r) {
    const b = r.b, look = 4, [x, z] = at(r.k + look, r.lane * (Math.abs(Math.sin(elapsed * 0.4 + r.id)) * 0.8 + 0.2));
    let mx = x - b.x, mz = z - b.z; const m = Math.hypot(mx, mz) || 1; mx /= m; mz /= m;
    if (Math.hypot(b.vx, b.vz) < 0.6 && racing()) r.stuck += 0.05; else r.stuck = Math.max(0, r.stuck - 0.1);
    if (r.stuck > 1.2) { const [x2, z2] = at(r.k + 1, 0); mx = x2 - b.x; mz = z2 - b.z; const m2 = Math.hypot(mx, mz) || 1; mx /= m2; mz /= m2; if (r.stuck > 2.2) r.stuck = 0; }
    let bits = 0;
    if (r.item) { r.think -= 0.05; if (r.think <= 0) { bits |= IN.A; r.think = rng.range(1, 3); } }
    return { mx, mz, b: bits };
  }
  function moveRacer(r, inp) {
    press(r, inp?.b | 0);
    stepBody(r.b, inp, r.cpu ? cpuMove : meta.move, arena);
    track1(r);
  }

  return {
    bodies, events,
    init: () => ({ arena, track: { variant: track.variant, name: track.name, laps: LAPS, pads: track.pads, muds: track.muds, boxes: track.boxes, N, cpu: racers.filter(r => r.cpu).map(r => ({ id: r.id, name: r.name })) }, left: Math.ceil(time) }),
    input(pid, inp) {
      const r = R.get(pid); if (!r || over) return;
      moveRacer(r, r.fin >= 0 ? null : inp);
    },
    step(dt) {
      if (over) return;
      elapsed += dt; time -= dt;
      if (countdown > 0) {
        const was = Math.ceil(countdown); countdown -= dt;
        if (Math.ceil(countdown) !== was) events.push({ e: countdown <= 0 ? 'go' : 'count', n: Math.max(0, Math.ceil(countdown)) });
        if (countdown <= 0) for (const r of R.values()) r.b.flags &= ~F.FROZEN;
      }
      for (const r of R.values()) if (r.cpu) moveRacer(r, r.fin >= 0 || !racing() ? null : cpuInput(r));
      separate([...R.values()].filter(r => !(r.b.flags & F.AIR)).map(r => r.b));
      for (const r of R.values()) {
        const b = r.b;
        // timers -> flags (stepBody reads BOOST / SLOW / STUN)
        if (r.hopCool > 0) r.hopCool -= dt;
        if (r.hop > 0) {
          r.hop -= dt; const u = 1 - Math.max(0, r.hop) / RULES.hopTime; b.y = r2(Math.sin(u * Math.PI) * RULES.hopH);
          if (r.hop <= 0) {
            b.y = 0; b.flags &= ~F.AIR;
            for (const q of R.values()) {                                  // landing beside someone bumps them aside
              if (q === r || q.b.flags & F.AIR || q.fin >= 0) continue;
              const dx = q.b.x - b.x, dz = q.b.z - b.z, d = Math.hypot(dx, dz);
              if (d > RULES.bumpR || d < 1e-3) continue;
              q.b.vx += dx / d * RULES.bumpPush; q.b.vz += dz / d * RULES.bumpPush;
              if (q.spin <= 0) { q.spin = RULES.bumpStun; q.b.flags |= F.STUN; }
              events.push({ e: 'bump', id: q.id, by: r.id, x: r2(q.b.x), z: r2(q.b.z) });
            }
          }
        }
        if (r.spin > 0) { r.spin -= dt; b.yaw += 13 * dt; if (r.spin <= 0) { b.flags &= ~F.STUN; b.yaw = Math.atan2(Math.sin(b.yaw), Math.cos(b.yaw)); } }
        const air = b.flags & F.AIR, live = racing() && r.fin < 0;
        if (live && !air) {
          for (const p of track.pads) if (inRect(p, b.x, b.z)) { if (r.boost < 0.2) events.push({ e: 'pad', id: r.id }); r.boost = Math.max(r.boost, RULES.padTime); }
          for (const m of track.muds) if (inRect(m, b.x, b.z)) r.slow = RULES.slowAfter;
          for (const s of slicks) if (s.life > 0 && (s.by !== r.id || s.arm <= 0) && Math.hypot(s.x - b.x, s.z - b.z) < RULES.slickR + BODY_R * 0.5) { s.life = 0; spinOut(r, RULES.spinTime, s.by); }
        }
        if (live && !r.item) for (const bx of boxes) if (bx.wait <= 0 && Math.hypot(bx.x - b.x, bx.z - b.z) < RULES.boxR) { bx.wait = RULES.boxEvery; r.item = rollItem(r); events.push({ e: 'item', id: r.id, it: r.item, x: bx.x, z: bx.z }); break; }
        if (r.boost > 0) { r.boost -= dt; b.flags |= F.BOOST; } else b.flags &= ~F.BOOST;
        if (r.slow > 0) { r.slow -= dt; b.flags |= F.SLOW; } else b.flags &= ~F.SLOW;
        // laps
        if (r.fin < 0) {
          const lap = Math.floor(r.prog / N) + 1;
          if (lap > r.lapShown && lap >= 2 && lap <= LAPS) events.push({ e: 'lap', id: r.id, lap });
          r.lapShown = Math.max(r.lapShown, lap);
          if (r.prog >= LAPS * N) {
            r.fin = ++finCount; r.finAt = elapsed; r.item = 0; r.boost = 0;
            events.push({ e: 'fin', id: r.id, place: r.fin });
            if (finishLeft < 0) finishLeft = RULES.finishWindow;
          }
        } else { const k = Math.max(0, 1 - 1.6 * dt); b.vx *= k; b.vz *= k; }    // finished: coast to a stop
      }
      for (const bx of boxes) if (bx.wait > 0) bx.wait -= dt;
      for (const s of slicks) { s.life -= dt; s.arm -= dt; }
      slicks = slicks.filter(s => s.life > 0);
      // bonk balls roll along, bounce off the track's edges, spin out the first kart they touch
      for (const ball of balls) {
        ball.life -= dt; ball.arm -= dt; ball.x += ball.vx * dt; ball.z += ball.vz * dt;
        let bk = ball.k, bd = Infinity; for (let d = -4; d <= 4; d++) { const k = ((ball.k + d) % N + N) % N, dd = (ball.x - loop.cx[k]) ** 2 + (ball.z - loop.cz[k]) ** 2; if (dd < bd) { bd = dd; bk = k; } }
        ball.k = bk;
        const nx = -loop.tz[bk], nz = loop.tx[bk], lat = (ball.x - loop.cx[bk]) * nx + (ball.z - loop.cz[bk]) * nz, lim = W - 0.3;
        if (Math.abs(lat) > lim) { const s = Math.sign(lat), vn = ball.vx * nx + ball.vz * nz; if (vn * s > 0) { ball.vx -= 2 * vn * nx; ball.vz -= 2 * vn * nz; } ball.x -= nx * s * (Math.abs(lat) - lim); ball.z -= nz * s * (Math.abs(lat) - lim); }
        for (const r of R.values()) {
          if ((r.id === ball.by && ball.arm > 0) || r.b.flags & F.AIR || r.fin >= 0) continue;
          if (Math.hypot(r.b.x - ball.x, r.b.z - ball.z) < RULES.ballR) { ball.life = 0; spinOut(r, RULES.ballSpin, ball.by); break; }
        }
      }
      balls = balls.filter(b => b.life > 0);
      // the end: everyone (human) in, the window after the first finish, or the clock
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
      for (const r of R.values()) rs[r.id] = [Math.max(1, Math.min(LAPS, Math.floor(r.prog / N) + 1)), pl.get(r.id), r.item, r.fin];
      const g = { rs, bx: boxes.map(b => (b.wait > 0 ? 0 : 1)).join(''), sl: slicks.map(s => [s.id, s.x, s.z]), bo: balls.map(b => [b.id, r2(b.x), r2(b.z)]), left: Math.ceil(time) };
      if (countdown > 0) g.cd = Math.ceil(countdown);
      if (finishLeft > 0) g.fw = Math.ceil(finishLeft);
      const cpus = [...R.values()].filter(r => r.cpu);
      if (cpus.length) g.cpu = cpus.map(r => [r.id, r2(r.b.x), r2(r.b.z), r2(r.b.yaw), r.b.flags, r2(r.b.y), r2(Math.hypot(r.b.vx, r.b.vz))]);
      return g;
    },
    get over() { return over; },
    /** For tests: how far along the race (in laps, 0.1) a racer is. */
    lapsOf(id) { const r = R.get(id); return r.fin >= 0 ? LAPS : Math.max(0, Math.floor(along(r) / N * 10) / 10); },
    track, racers: R,
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const r = R.get(p.pid); scores[p.pid] = r.fin >= 0 ? LAPS : Math.max(0, Math.floor(along(r) / N * 10) / 10);
        const key = r.fin >= 0 ? 1e6 - Math.round(r.finAt * 20) : Math.round(along(r) * 10) / 10;   // finish step, then distance
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
