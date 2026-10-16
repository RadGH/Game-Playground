// Thousandvale — a BUILT harbour (play-test 11, Z61: "Gullwick … has a real harbor, like the new island"), drawn from the
// zone's `harbour` placement (tools/bake-zone.mjs, from tools/lib/world-core.mjs BAYS `harbour`): the quay's stone face and
// coping, bollards, the planked piers on their posts (the decks themselves are walkable: terrain meta.bridges), lamps,
// and the working clutter of a fishing harbour — crates, barrels, coiled rope, nets drying on a frame, a harbour shed and
// rowboats tied to the jetties.
//
// Pure (no Three.js): harbourParts(rec, opts) -> { parts: [{ mesh, x, y, z, yaw, w, h, d, colour, rx?, rz? }], lamps: [{ x, z, y }] }
// in WORLD metres; town-view.js pushes the parts into its instanced kit meshes (unit shapes: origin at the centre of the
// base) and lights the lamps at night with the town's own. A Port Vharl-style record (no `quay`) draws nothing here.

const STONE = '#7d776c', COPING = '#958e80', PLANK = '#7a6048', POST = '#4e3b2c', RAIL = '#5e4a37', IRON = '#3b3330';
const WOOD = ['#8a6a44', '#7d5f3d', '#94754c'], BARREL = '#6b4a2c', ROPE = '#a08c62', NET = '#5f6e5c', HULL = ['#6d5236', '#5a6b73', '#7a4a36'];

/** A small deterministic rng from a string (the same harbour looks the same on every screen). */
function rngOf(key) {
  let s = 2166136261;
  for (const ch of String(key)) { s ^= ch.charCodeAt(0); s = Math.imul(s, 16777619); }
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/**
 * rec = the zone's harbour placement ({ id, data: { quay {x0,x1,z0,z1,h}, piers [{a,b,deck,width,main}], berth, master, dock } }, zone metres);
 * ox, oz = the zone's world origin; groundAt(x, z) = the bare ground in WORLD metres (the sea bed under a pier).
 */
export function harbourParts(rec, { ox = 0, oz = 0, groundAt = () => -3 } = {}) {
  const d = rec?.data || {}, Q = d.quay;
  const parts = [], lamps = [];
  if (!Q || !Array.isArray(d.piers)) return { parts, lamps };
  const P = (mesh, x, y, z, yaw, w, h, d2, colour, rx = 0, rz = 0) => parts.push({ mesh, x, y, z, yaw, w, h, d: d2, colour, ...(rx ? { rx } : {}), ...(rz ? { rz } : {}) });
  const rnd = rngOf(rec.id || 'harbour');
  const X0 = Q.x0 + ox, X1 = Q.x1 + ox, Z0 = Q.z0 + oz, Z1 = Q.z1 + oz, H = Q.h, cx = (X0 + X1) / 2, len = X1 - X0;
  const piers = d.piers.map(p => ({ ...p, ax: p.a[0] + ox, az: p.a[1] + oz, bx: p.b[0] + ox, bz: p.b[1] + oz }));
  const onPierRoot = (x, pad) => piers.some(p => Math.abs(x - p.ax) < p.width / 2 + pad);

  // ---- the quay: a stone face down into the water, a coping along its lip, bollards
  P('box', cx, -3.2, Z1 + 0.55, 0, len + 1.2, H + 3.2, 1.1, STONE);
  P('box', cx, H - 0.02, Z1 + 0.45, 0, len + 1.4, 0.26, 1.3, COPING);
  for (const ex of [X0 - 0.6, X1 + 0.6]) P('box', ex, -3.2, (Z0 + Z1) / 2 + 0.5, 0, 1.1, H + 3.0, Z1 - Z0 + 1.2, STONE);
  for (let x = X0 + 3; x <= X1 - 3; x += 9) if (!onPierRoot(x, 1.5)) P('cyl', x, H, Z1 - 0.6, 0, 0.42, 0.75, 0.42, IRON);

  // ---- piers: a planked deck on posts down to the bed, a kerb each side, bollards at the end
  for (const p of piers) {
    const L0 = Math.hypot(p.bx - p.ax, p.bz - p.az), yaw = Math.atan2(p.bx - p.ax, p.bz - p.az), ux = (p.bx - p.ax) / L0, uz = (p.bz - p.az) / L0;
    // the planks start at the quay's lip (the deck's root over the paving is the quay itself: no plank lying on the stone)
    let s0 = 0; while (s0 < L0 && p.ax + ux * s0 >= X0 && p.ax + ux * s0 <= X1 && p.az + uz * s0 >= Z0 && p.az + uz * s0 <= Z1 + 0.6) s0 += 0.25;
    const L = L0 - s0, ox0 = p.ax + ux * s0, oz0 = p.az + uz * s0, mx = (ox0 + p.bx) / 2, mz = (oz0 + p.bz) / 2;
    P('box', mx, p.deck - 0.3, mz, yaw, p.width, 0.34, L, PLANK);
    for (const side of [-1, 1]) {
      const sx = mx + uz * side * (p.width / 2 - 0.12), sz = mz - ux * side * (p.width / 2 - 0.12);
      P('box', sx, p.deck, sz, yaw, 0.22, 0.22, L, RAIL);
      for (let s = s0 + 2; s <= L0; s += 4) {
        const x = p.ax + ux * s + uz * side * (p.width / 2 - 0.15), z = p.az + uz * s - ux * side * (p.width / 2 - 0.15);
        const bed = Math.min(groundAt(x, z), p.deck - 1) - 0.8;
        P('cyl', x, bed, z, 0, 0.36, p.deck - 0.3 - bed, 0.36, POST);
      }
    }
    for (const side of [-1, 1]) P('cyl', p.bx - ux * 1.2 + uz * side * (p.width / 2 - 0.6), p.deck, p.bz - uz * 1.2 - ux * side * (p.width / 2 - 0.6), 0, 0.4, 0.7, 0.4, IRON);
    if (p.main) {
      lamps.push({ x: p.bx - ux * 2 + uz * (p.width / 2 - 0.4), z: p.bz - uz * 2 - ux * (p.width / 2 - 0.4), y: p.deck });
      lamps.push({ x: p.ax + ux * L0 * 0.5 - uz * (p.width / 2 - 0.4), z: p.az + uz * L0 * 0.5 + ux * (p.width / 2 - 0.4), y: p.deck });
      // coiled ropes and a few crates waiting for the ship
      P('cyl', p.bx - ux * 4 - uz * 1.2, p.deck, p.bz - uz * 4 + ux * 1.2, 0, 1.1, 0.28, 1.1, ROPE);
      for (let k = 0; k < 3; k++) P('box', p.bx - ux * (7 + k * 1.15) - uz * 1.3, p.deck + (k === 2 ? 1 : 0), p.bz - uz * (7 + k * 1.15) + ux * 1.3, yaw + (rnd() - 0.5) * 0.3, 1, 1, 1, WOOD[k % 3]);
    }
  }
  // lamps at both ends of the quay
  lamps.push({ x: X0 + 1.5, z: Z1 - 1.2, y: H }, { x: X1 - 1.5, z: Z1 - 1.2, y: H });

  // ---- the back of the quay: a harbour shed, stacked crates, barrels, nets on a frame (never on a pier root, the
  // harbourmaster's spot or the dock where travellers come ashore)
  const keep = [[d.master?.x, d.master?.z], [d.dock?.x, d.dock?.z]].filter(([x]) => Number.isFinite(x)).map(([x, z]) => [x + ox, z + oz]);
  const clear = (x, z, r) => !onPierRoot(x, r + 1) && keep.every(([kx, kz]) => Math.hypot(kx - x, kz - z) > r + 2.5);
  const back = Z0 + 2.4;
  // the shed at the west end, door to the quay
  { const sx = X0 + 6, sz = back + 1.2; P('box', sx, H, sz, 0, 7, 2.9, 4.4, '#8a7b66'); P('gable', sx, H + 2.9, sz, Math.PI / 2, 4.8, 1.6, 7.6, '#5b4a3a'); P('box', sx, H, sz + 2.21, 0, 1.2, 2.1, 0.1, '#3a2e24'); }
  for (let x = X0 + 14; x <= X1 - 4; x += 5 + rnd() * 4) {
    if (!clear(x, back, 2)) continue;
    const kind = rnd();
    if (kind < 0.4) { const n = 2 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) P('box', x + (k % 2) * 1.05, H + (k >= 2 ? 1 : 0), back + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.4, 1, 1, 1, WOOD[k % 3]); }
    else if (kind < 0.75) { for (let k = 0; k < 3; k++) P('cyl', x + (k % 2) * 0.8, H, back + (k === 2 ? 0.75 : 0), 0, 0.72, 1.05, 0.72, BARREL); }
    else { P('box', x - 1.4, H, back, 0, 0.12, 1.9, 0.12, POST); P('box', x + 1.4, H, back, 0, 0.12, 1.9, 0.12, POST); P('box', x, H + 0.4, back, 0, 2.8, 1.4, 0.05, NET, 0.12); }
  }

  // ---- rowboats tied up beside the short jetties (and one at the quay), floating at the sea's level
  const boat = (x, z, yaw, colour) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    P('box', x, -0.25, z, yaw, 1.1, 0.35, 3.4, colour);
    for (const side of [-1, 1]) { const [px, pz] = at(side * 0.62, 0); P('box', px, -0.2, pz, yaw, 0.12, 0.6, 3.6, colour, 0, side * 0.32); }
    const [bx, bz] = at(0, 1.95); P('hip', bx, -0.25, bz, yaw, 0.95, 0.6, 0.9, colour);
    const [tx, tz] = at(0, -0.2); P('box', tx, 0.1, tz, yaw, 1.2, 0.08, 0.35, PLANK);
  };
  let b = 0;
  for (const p of piers) {
    if (p.main) continue;
    const L = Math.hypot(p.bx - p.ax, p.bz - p.az), ux = (p.bx - p.ax) / L, uz = (p.bz - p.az) / L, yaw = Math.atan2(ux, uz);
    for (const side of [-1, 1]) { const off = p.width / 2 + 1.1, s = L * (0.45 + rnd() * 0.3); boat(p.ax + ux * s + uz * side * off, p.az + uz * s - ux * side * off, yaw + (rnd() - 0.5) * 0.15, HULL[b++ % 3]); }
  }
  boat(X1 - 8, Z1 + 1.9, Math.PI / 2 + (rnd() - 0.5) * 0.1, HULL[b++ % 3]);
  return { parts, lamps };
}
