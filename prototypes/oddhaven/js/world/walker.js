// A person on foot, for whoever is being played: stick to a direction, buildings and the river in the way, the height of the
// ground, the lanes under their feet. Pure: no three, no clock, no Math.random, so node tests walk the real map.
//
//   const feet = createFeet(world, net);
//   feet.step(w, dirX, dirZ, speed, dt)     w = { x, z, yaw, speed }
//   feet.ground(x, z)                       height to stand at, the bridge deck included
//   feet.lane(x, z, reach)                  { edge, fwd, at, d } the lane under this point, or null
//   feet.kerb(x, z, { min, max, seen })     a spot at the kerb for a car
// With `plans`, buildings stop being solid boxes: their walls have door gaps, and w.lv says which floor a body is on.
//   feet.inside(x, z)                       the building a point is inside, or null
import { solids } from '../sim/interior-nav.js';
import { FLOOR_H } from '../sim/interior.js';

export const PACE = { run: 5.2, walk: 2.6, radius: 0.4, catchUpRun: 6.4 };
export const FLOOR_LIFT = 0.12;

/** W and up are the top of the screen. yaw = the camera's turn round the player; 0 looks north. */
export function moveFromInput(mx, my, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: mx * c - my * s, z: -mx * s - my * c };
}

const CELL = 24, key = (i, j) => (i + 4096) * 8192 + (j + 4096);

export function createFeet(world, net, { plans = null, shut = null } = {}) {
  const half = world.size / 2 - 6, B = world.bridge, roadLen = new Map();
  for (const r of world.roads) { let l = 0; for (let i = 1; i < r.pts.length; i++) l += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); roadLen.set(r.id, l); }
  // buildings by square, so a step looks at a handful
  const boxes = new Map();
  for (const b of world.buildings) {
    const R = Math.hypot(b.w, b.d) / 2 + 2, i0 = Math.floor((b.x - R) / CELL), i1 = Math.floor((b.x + R) / CELL), j0 = Math.floor((b.z - R) / CELL), j1 = Math.floor((b.z + R) / CELL);
    const box = { b, x: b.x, z: b.z, c: Math.cos(b.yaw), s: Math.sin(b.yaw), hw: b.w / 2, hd: b.d / 2, cx: b.x, cz: b.z, yaw: b.yaw, plan: plans ? plans(b.id) : null };
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!boxes.has(k)) boxes.set(k, []); boxes.get(k).push(box); }
  }
  // lane points by square
  const cells = new Map(), LC = 12;
  for (const L of net.lanes) for (let i = 0; i < L.n; i += 2) { const k = key(Math.floor(L.x[i] / LC), Math.floor(L.z[i] / LC)); if (!cells.has(k)) cells.set(k, []); cells.get(k).push([L, i]); }
  const onBridge = (x, z, slack = 0) => {
    if (!B) return false;
    const dx = x - B.cx, dz = z - B.cz, a = dx * Math.sin(B.yaw) + dz * Math.cos(B.yaw), b = dx * Math.cos(B.yaw) - dz * Math.sin(B.yaw);
    return Math.abs(a) < B.len / 2 + 1 + slack && Math.abs(b) < B.halfW + slack;
  };
  /** A circle against a building's walls and furniture, on the floor the body is on. */
  function pushOut(w, b, lx, lz, r) {
    const list = solids(b.plan, w.lv ?? 0, shut ? d => shut(b, d) : null);
    let x = lx, z = lz, moved = false;
    for (let pass = 0; pass < 2; pass++) for (const q of list) {
      const nx = Math.max(q.x0, Math.min(q.x1, x)), nz = Math.max(q.z0, Math.min(q.z1, z)), ex = x - nx, ez = z - nz, d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      moved = true;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; x += ex * k; z += ez * k; } else {
        // the centre is inside the rectangle: out by the nearest edge
        const a = x - q.x0, c = q.x1 - x, e = z - q.z0, f = q.z1 - z, m = Math.min(a, c, e, f);
        if (m === a) x = q.x0 - r; else if (m === c) x = q.x1 + r; else if (m === e) z = q.z0 - r; else z = q.z1 + r;
      }
    }
    if (moved) { w.x = b.x + x * b.c + z * b.s; w.z = b.z - x * b.s + z * b.c; }
  }
  const self = {
    ground(x, z, lv = 0) { if (plans) { const box = self.inside(x, z); if (box) return box.b.y + FLOOR_LIFT + lv * FLOOR_H; } return onBridge(x, z, 3) ? B.deck : world.heightAt(x, z) + 0.06; },
    inside(x, z, slack = 0) {
      const list = boxes.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (list) for (const b of list) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; if (Math.abs(lx) < b.hw + slack && Math.abs(lz) < b.hd + slack) return b; }
      return null;
    },
    blocked(x, z) { return Math.abs(x) > half || Math.abs(z) > half || (world.riverDistance(x, z) < world.river.halfW - 2 && !onBridge(x, z)); },
    /** Parked cars near the player: [{ x, z, yaw }]. Set by the page; each is a box a walker goes round. */
    parked: [],
    /** Push a point out of any building: along the shortest way out of the box. */
    out(w) {
      for (const p of self.parked) {
        if (p.inside) continue;
        const dx = w.x - p.x, dz = w.z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c, r = w.r ?? PACE.radius, ex = 0.95 + r, ez = 2.3 + r;
        if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
        if (ex - Math.abs(lx) < ez - Math.abs(lz)) { const n = Math.sign(lx || 1) * ex; w.x = p.x + n * c + lz * s; w.z = p.z - n * s + lz * c; } else { const n = Math.sign(lz || 1) * ez; w.x = p.x + lx * c + n * s; w.z = p.z - lx * s + n * c; }
      }
      const list = boxes.get(key(Math.floor(w.x / CELL), Math.floor(w.z / CELL)));
      if (!list) return;
      const r = w.r ?? PACE.radius;
      for (const b of list) {
        const dx = w.x - b.x, dz = w.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c, ex = b.hw + r, ez = b.hd + r;
        if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
        if (b.plan) { pushOut(w, b, lx, lz, r); continue; }
        let nx = lx, nz = lz;
        if (ex - Math.abs(lx) < ez - Math.abs(lz)) nx = Math.sign(lx || 1) * ex; else nz = Math.sign(lz || 1) * ez;
        w.x = b.x + nx * b.c + nz * b.s; w.z = b.z - nx * b.s + nz * b.c;
      }
    },
    step(w, dx, dz, speed, dt) {
      const m = Math.hypot(dx, dz);
      if (m < 0.02) { w.speed = 0; return; }
      const x0 = w.x, z0 = w.z, k = Math.min(1, m) / m * speed * dt, bits = Math.max(1, Math.ceil(speed * dt / 0.3));
      for (let i = 0; i < bits; i++) {     // short hops, so a slow frame cannot step through a wall
        const px = w.x, pz = w.z;
        w.x += dx * k / bits; w.z += dz * k / bits;
        if (self.blocked(w.x, w.z)) { w.x = px; w.z = pz; if (i === 0) { w.speed = 0; return; } break; }
        self.out(w);
      }
      w.speed = Math.hypot(w.x - x0, w.z - z0) / Math.max(dt, 1e-3);
      w.yaw = Math.atan2(dx, dz);
    },
    /** The lane under a point. A junction's link counts as the road it leads onto. Rail cars read this. */
    lane(x, z, reach = 2.6) {
      const r = Math.ceil(reach / LC), i0 = Math.floor(x / LC), j0 = Math.floor(z / LC);
      let best = null, d = reach * reach;
      for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) for (const [L, n] of cells.get(key(i, j)) || []) {
        const e = (L.x[n] - x) ** 2 + (L.z[n] - z) ** 2;
        if (e < d) { d = e; best = [L, n]; }
      }
      if (!best) return null;
      const [L, n] = best;
      if (L.kind === 'road') return { edge: L.road, fwd: L.id.endsWith(':f'), at: +((roadLen.get(L.road) - L.len) / 2 + L.cum[n]).toFixed(1), d: Math.sqrt(d), lane: L.index, i: n };
      const N = net.lanes[L.next[0]];
      return { edge: N.road, fwd: N.id.endsWith(':f'), at: +((roadLen.get(N.road) - N.len) / 2).toFixed(1), d: Math.sqrt(d), lane: L.index, i: n };
    },
    /** A place at the kerb, between min and max metres away; out of sight if there is one (seen(x, z) says what the camera sees). */
    kerb(x, z, { min = 16, max = 90, seen = () => false, hiddenWorth = 200 } = {}) {
      let best = null, score = Infinity;
      for (const L of net.roads) for (let i = 2; i + 2 < L.n; i += 3) {
        const d = Math.hypot(L.x[i] - x, L.z[i] - z);
        if (d < min || d > max) continue;
        const dx = L.x[i + 2] - L.x[i - 2], dz = L.z[i + 2] - L.z[i - 2], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
        const px = L.x[i] - uz * 1.7, pz = L.z[i] + ux * 1.7, hidden = !seen(px, pz), s = d + (hidden ? 0 : hiddenWorth);
        if (s < score) { score = s; best = { x: px, z: pz, y: L.y[i], yaw: Math.atan2(ux, uz), hidden, d }; }
      }
      return best;
    },
  };
  return self;
}

/** Where the leader has been, so followers go round what the leader went round. */
export function createTrail({ spacing = 0.8, max = 400 } = {}) {
  const pts = [];
  return {
    get length() { return pts.length * spacing; },
    clear() { pts.length = 0; },
    push(x, z) { const p = pts[pts.length - 1]; if (!p || Math.hypot(p[0] - x, p[1] - z) >= spacing) { pts.push([x, z]); if (pts.length > max) pts.shift(); } },
    /** The point this many metres back along where the leader walked. */
    behind(metres) { const n = pts.length; if (!n) return null; const i = Math.max(0, n - 1 - Math.round(metres / spacing)); return { x: pts[i][0], z: pts[i][1] }; },
  };
}

/** Walk a pavement path (pavement.js) waypoint by waypoint. w.leg = which point is next. Returns the direction, or null when there. */
export function pathStep(w, path) {
  const P = path.pts;
  w.leg ??= 1;
  while (w.leg < P.length && Math.hypot(P[w.leg][0] - w.x, P[w.leg][1] - w.z) < 0.9) w.leg++;
  if (w.leg >= P.length) return null;
  return { x: P[w.leg][0] - w.x, z: P[w.leg][1] - w.z };
}

/** A follower has fallen behind for good: far back and the leader has stopped outrunning them, or walled in. */
export const needsCatchUp = (gap, leaderSpeed, stuckFor) => (gap > 34 && leaderSpeed < 4) || (gap > 6 && stuckFor > 3);
