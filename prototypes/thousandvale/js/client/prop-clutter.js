// Graphics pass 2026-10-16 (G-PROPS) — the small worn things that make a street look lived in: barrels with iron hoops,
// crate stacks, grain sacks, benches, planters, wood piles, hand carts, fish baskets, rope coils, lobster pots, and the
// trim a building wears (window frames and sills, door jambs and a step, a ridge cap along a roof, timber braces on a
// framed house). Pure (no three): every model is a list of unit-shape parts in its own frame
// ({ mesh, x, y, z, w, h, d, yaw?, rx?, rz?, colour, surf? }, base at y = 0, front +z), and the planners return world
// placements that town-view.js / harbour-view.js push into the instanced kit meshes they already draw — so a street full
// of barrels is the same draw calls as before, a few hundred more instances.
//
//   CLUTTER_MODELS[id](rng) -> parts                      the models (rng only varies tones / tilts / counts)
//   buildingTrim(parts, desc) -> parts                     frames, sills, jambs, step, ridge caps, braces for one building
//   doorClutter(building, rng, density) -> [{ id, lx, lz, yaw }]    beside a building's door, in ITS frame
//   squareClutter(square, spots, rng, density) -> [{ id, x, z, yaw }]  around a town square, world metres
//   placeModel(id, x, y, z, yaw, rng) -> world parts       a model turned and moved (same tilt convention as town-view)

const WOOD = ['#8a6a44', '#7d5f3d', '#94754c', '#6f5536'];
const IRON = '#3b3330', ROPE = '#a08c62', SACK = ['#b9a47e', '#a8946c', '#c2b089'], STONE = '#8d8577';
const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

/** Unit-part models; mesh kinds are town-view's unit shapes plus `barrel` and `sack`. */
export const CLUTTER_MODELS = {
  barrel: r => {
    const h = 0.95 + r() * 0.15, c = pick(WOOD, r);
    return [
      { mesh: 'barrel', x: 0, y: 0, z: 0, w: 0.66, h, d: 0.66, colour: c, surf: 'planks' },
      { mesh: 'cyl', x: 0, y: h * 0.16, z: 0, w: 0.66, h: 0.06, d: 0.66, colour: IRON, surf: 'metal' },
      { mesh: 'cyl', x: 0, y: h * 0.78, z: 0, w: 0.66, h: 0.06, d: 0.66, colour: IRON, surf: 'metal' },
    ];
  },
  barrels: r => [...CLUTTER_MODELS.barrel(r), ...CLUTTER_MODELS.barrel(r).map(p => ({ ...p, x: p.x + 0.72, z: p.z + 0.1 })), ...(r() < 0.5 ? CLUTTER_MODELS.barrel(r).map(p => ({ ...p, x: p.x + 0.36, z: p.z - 0.6 })) : [])],
  crate: r => {
    const s = 0.7 + r() * 0.25, c = pick(WOOD, r);
    return [
      { mesh: 'box', x: 0, y: 0, z: 0, w: s, h: s, d: s, colour: c, surf: 'planks' },
      { mesh: 'box', x: 0, y: s * 0.45, z: 0, w: s + 0.04, h: 0.08, d: s + 0.04, colour: '#5e4a37', surf: 'planks' },
    ];
  },
  crates: r => {
    const out = [...CLUTTER_MODELS.crate(r), ...CLUTTER_MODELS.crate(r).map(p => ({ ...p, x: p.x + 0.85, yaw: 0.2 }))];
    if (r() < 0.6) out.push(...CLUTTER_MODELS.crate(r).map(p => ({ ...p, x: p.x + 0.4, y: p.y + 0.78, yaw: -0.25 })));
    return out;
  },
  sacks: r => {
    const n = 2 + Math.floor(r() * 3), out = [];
    for (let i = 0; i < n; i++) out.push({ mesh: 'sack', x: (i % 3) * 0.5 - 0.5, y: i >= 3 ? 0.5 : 0, z: (i % 2) * 0.3, w: 0.55, h: 0.72 + r() * 0.12, d: 0.45, yaw: r() * 0.8, rz: (r() - 0.5) * 0.2, colour: pick(SACK, r), surf: 'cloth' });
    return out;
  },
  bench: r => {
    const c = pick(WOOD, r);
    return [
      { mesh: 'box', x: 0, y: 0.42, z: 0, w: 1.7, h: 0.08, d: 0.4, colour: c, surf: 'planks' },
      { mesh: 'box', x: -0.7, y: 0, z: 0, w: 0.1, h: 0.42, d: 0.36, colour: '#5e4a37', surf: 'planks' },
      { mesh: 'box', x: 0.7, y: 0, z: 0, w: 0.1, h: 0.42, d: 0.36, colour: '#5e4a37', surf: 'planks' },
      { mesh: 'box', x: 0, y: 0.5, z: -0.2, w: 1.7, h: 0.4, d: 0.07, colour: c, surf: 'planks', rx: -0.18 },
    ];
  },
  planter: r => [
    { mesh: 'box', x: 0, y: 0, z: 0, w: 1.1, h: 0.42, d: 0.45, colour: pick(WOOD, r), surf: 'planks' },
    { mesh: 'dome', x: -0.22, y: 0.36, z: 0, w: 0.55, h: 0.3, d: 0.4, colour: r() < 0.5 ? '#4f6a34' : '#5b7a3a', surf: 'cloth' },
    { mesh: 'dome', x: 0.25, y: 0.36, z: 0, w: 0.5, h: 0.34, d: 0.38, colour: '#56733a', surf: 'cloth' },
    { mesh: 'dome', x: 0.05, y: 0.5, z: 0.02, w: 0.2, h: 0.12, d: 0.2, colour: r() < 0.5 ? '#c9564a' : '#d6b84a', surf: 'cloth' },
  ],
  woodpile: r => {
    const out = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) out.push({ mesh: 'cyl', x: (i - (3 - row) / 2) * 0.27, y: row * 0.23 + 0.12, z: 0, w: 0.24, h: 1.0, d: 0.24, rx: Math.PI / 2, colour: pick(WOOD, r), surf: 'logs' });
    // cyl rotated about x lies along z with its base at the origin: shift each log back half its length
    return out.map(p => ({ ...p, z: -0.5 }));
  },
  cart: r => {
    const c = pick(WOOD, r);
    return [
      { mesh: 'box', x: 0, y: 0.45, z: 0, w: 1.2, h: 0.1, d: 1.8, colour: c, surf: 'planks' },
      { mesh: 'box', x: -0.58, y: 0.55, z: 0, w: 0.06, h: 0.35, d: 1.8, colour: c, surf: 'planks' },
      { mesh: 'box', x: 0.58, y: 0.55, z: 0, w: 0.06, h: 0.35, d: 1.8, colour: c, surf: 'planks' },
      { mesh: 'box', x: 0, y: 0.55, z: -0.88, w: 1.2, h: 0.35, d: 0.06, colour: c, surf: 'planks' },
      { mesh: 'cyl', x: -0.68, y: 0.42, z: 0.2, w: 0.84, h: 0.08, d: 0.84, rz: Math.PI / 2, colour: '#5e4a37', surf: 'planks' },
      { mesh: 'cyl', x: 0.76, y: 0.42, z: 0.2, w: 0.84, h: 0.08, d: 0.84, rz: Math.PI / 2, colour: '#5e4a37', surf: 'planks' },
      { mesh: 'box', x: -0.25, y: 0.45, z: 1.5, w: 0.07, h: 0.07, d: 1.4, colour: '#5e4a37', surf: 'planks', rx: 0.25 },
      { mesh: 'box', x: 0.25, y: 0.45, z: 1.5, w: 0.07, h: 0.07, d: 1.4, colour: '#5e4a37', surf: 'planks', rx: 0.25 },
      { mesh: 'sack', x: 0.15, y: 0.55, z: -0.3, w: 0.5, h: 0.6, d: 0.42, yaw: 0.4, colour: pick(SACK, r), surf: 'cloth' },
    ];
  },
  bucket: () => [
    { mesh: 'barrel', x: 0, y: 0, z: 0, w: 0.34, h: 0.36, d: 0.34, colour: '#7d5f3d', surf: 'planks' },
    { mesh: 'cyl', x: 0, y: 0.26, z: 0, w: 0.35, h: 0.04, d: 0.35, colour: IRON, surf: 'metal' },
  ],
  rope: r => [
    { mesh: 'cyl', x: 0, y: 0, z: 0, w: 0.9, h: 0.12, d: 0.9, colour: ROPE, surf: 'rope' },
    { mesh: 'cyl', x: 0.04, y: 0.12, z: 0, w: 0.75, h: 0.12, d: 0.75, colour: ROPE, surf: 'rope', yaw: 1 },
    { mesh: 'cyl', x: 0, y: 0.24, z: 0.03, w: 0.6, h: 0.1, d: 0.6, colour: '#97835a', surf: 'rope', yaw: 2 },
  ],
  fishbasket: r => [
    { mesh: 'barrel', x: 0, y: 0, z: 0, w: 0.6, h: 0.4, d: 0.6, colour: '#a68a5a', surf: 'thatch' },
    { mesh: 'dome', x: 0, y: 0.32, z: 0, w: 0.5, h: 0.14, d: 0.5, colour: '#8fa0a8', surf: 'metal' },
  ],
  lobsterpot: r => [
    { mesh: 'dome', x: 0, y: 0, z: 0, w: 0.7, h: 0.5, d: 0.55, colour: '#7d6a48', surf: 'rope' },
    { mesh: 'box', x: 0, y: 0, z: 0, w: 0.72, h: 0.05, d: 0.57, colour: '#5e4a37', surf: 'planks' },
  ],
  nets: r => [
    { mesh: 'box', x: -1.2, y: 0, z: 0, w: 0.1, h: 1.7, d: 0.1, colour: '#4e3b2c', surf: 'planks' },
    { mesh: 'box', x: 1.2, y: 0, z: 0, w: 0.1, h: 1.7, d: 0.1, colour: '#4e3b2c', surf: 'planks' },
    { mesh: 'box', x: 0, y: 1.62, z: 0, w: 2.6, h: 0.08, d: 0.08, colour: '#4e3b2c', surf: 'planks' },
    { mesh: 'box', x: 0, y: 0.35, z: 0.02, w: 2.3, h: 1.25, d: 0.03, colour: '#5f6e5c', surf: 'rope', rx: 0.08 },
  ],
  anchor: () => [
    { mesh: 'box', x: 0, y: 0, z: 0, w: 0.1, h: 1.2, d: 0.1, colour: IRON, surf: 'metal', rz: 0.5 },
    { mesh: 'box', x: -0.3, y: 0.05, z: 0, w: 0.9, h: 0.1, d: 0.1, colour: IRON, surf: 'metal', rz: 0.5 },
  ],
};
export const CLUTTER_IDS = Object.freeze(Object.keys(CLUTTER_MODELS));
/** The footprint radius each model needs (for spacing checks). */
export const CLUTTER_R = { barrel: 0.4, barrels: 0.9, crate: 0.5, crates: 0.95, sacks: 0.75, bench: 0.9, planter: 0.6, woodpile: 0.65, cart: 1.4, bucket: 0.25, rope: 0.5, fishbasket: 0.35, lobsterpot: 0.4, nets: 1.3, anchor: 0.6 };

/** A model turned by yaw and moved to (x, y, z); tilts kept (town-view applies rx / rz after the yaw, order YXZ). */
export function placeModel(id, x, y, z, yaw, rng) {
  const parts = CLUTTER_MODELS[id](rng);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return parts.map(p => ({ ...p, x: x + p.x * c + p.z * s, y: y + p.y, z: z - p.x * s + p.z * c, yaw: yaw + (p.yaw || 0) }));
}

/**
 * Trim for one building (its kit parts in the building's own frame, `desc` = proctown's description). Returns MORE parts
 * in the same frame: a sill + lintel + a cross bar on each window, jambs and a stone step at the door, a ridge cap along
 * each gable roof, and on a timber-framed house a rail under the eaves and two braces either side of the front door.
 */
export function buildingTrim(parts, desc) {
  const out = [];
  const trim = desc?.colour?.trim || '#5e4a37';
  for (const p of parts) {
    if (p.tag === 'window') {
      const front = p.w >= p.d, ww = front ? p.w : p.d;
      const own = desc.masses?.find(q => q.index === p.mass) || desc.masses?.[0];
      const nx = front ? 0 : Math.sign(p.x - (own?.x ?? 0)) || 1, nz = front ? 1 : 0;
      const along = (a, b, c, wv, hv, dv) => (front ? { x: a, y: b, z: c, w: wv, h: hv, d: dv } : { x: a, y: b, z: c, w: dv, h: hv, d: wv });
      out.push({ mesh: 'box', ...along(p.x + nx * 0.06, p.y - 0.09, p.z + nz * 0.06, ww + 0.26, 0.09, 0.2), colour: trim, surf: 'planks', tag: 'frame' });       // sill
      out.push({ mesh: 'box', ...along(p.x + nx * 0.03, p.y + p.h, p.z + nz * 0.03, ww + 0.2, 0.1, 0.14), colour: trim, surf: 'planks', tag: 'frame' });         // lintel
      out.push({ mesh: 'box', ...along(p.x + nx * 0.02, p.y, p.z + nz * 0.02, 0.05, p.h, 0.15), colour: trim, surf: 'planks', tag: 'frame' });                 // mullion
      out.push({ mesh: 'box', ...along(p.x + nx * 0.02, p.y + p.h * 0.5, p.z + nz * 0.02, ww, 0.05, 0.15), colour: trim, surf: 'planks', tag: 'frame' });       // transom
    } else if (p.tag === 'door' && p.mesh === 'box') {
      for (const s of [-1, 1]) out.push({ mesh: 'box', x: p.x + s * (p.w / 2 + 0.06), y: p.y, z: p.z + 0.02, w: 0.12, h: p.h, d: 0.2, colour: trim, surf: 'planks', tag: 'frame' });
      out.push({ mesh: 'box', x: p.x, y: p.y - 0.12, z: p.z + 0.35, w: p.w + 0.5, h: 0.2, d: 0.6, colour: '#8a8378', surf: 'ashlar', tag: 'step' });
    } else if (p.tag === 'roof' && p.mesh === 'gable') {
      // the ridge runs along the prism's local z at x = 0, y = top
      out.push({ mesh: 'box', x: p.x, y: p.y + p.h - 0.1, z: p.z, w: Math.min(0.34, p.w * 0.1), h: 0.2, d: p.d + 0.06, yaw: p.yaw || 0, colour: shadeHex(p.colour, -0.18), tag: 'ridge', surf: null });
    }
  }
  if (desc?.wallMaterial === 'timber_frame') {
    for (const m of desc.masses || []) {
      if (m.shape === 'round') continue;
      const H = desc.storeyHeight * (m.low ?? 1), base = m.floor * desc.storeyHeight + (m.lift || 0) - (m.sink || 0), fz = m.z + m.d / 2 + 0.04;
      out.push({ mesh: 'box', x: m.x, y: base + H - 0.32, z: fz, w: m.w, h: 0.16, d: 0.1, colour: trim, surf: 'planks', tag: 'beam' });
      out.push({ mesh: 'box', x: m.x, y: base + 0.02, z: fz, w: m.w, h: 0.16, d: 0.1, colour: trim, surf: 'planks', tag: 'beam' });
      const L = Math.min(H * 0.55, m.w * 0.25);
      for (const sx of [-1, 1]) out.push({ mesh: 'box', x: m.x + sx * (m.w / 2 - L * 0.42), y: base + H * 0.18, z: fz, w: 0.12, h: L * 1.25, d: 0.1, rz: sx * 0.62, colour: trim, surf: 'planks', tag: 'beam' });
    }
  }
  return out;
}
function shadeHex(hex, k) {
  const n = parseInt(String(hex || '#806050').slice(1, 7), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map(v => v.toString(16).padStart(2, '0')).join('');
}

const SHOP_SET = ['barrels', 'crates', 'sacks', 'barrel', 'crate', 'planter', 'bench'];
const HOME_SET = ['woodpile', 'barrel', 'bench', 'planter', 'bucket', 'crate'];
/**
 * What stands beside a building's front door, in the BUILDING's frame (door on its +z face). A shop (lit) gets one or
 * two groups, an ordinary home sometimes one. Never in front of the door itself: always along the wall beside it.
 */
export function doorClutter(b, rng, density = 1) {
  const d = b.desc, door = d?.door; if (!door) return [];
  const m = d.masses?.find(q => q.index === door.mass) || d.masses?.[0]; if (!m) return [];
  const frontZ = m.z + m.d / 2;
  const out = [];
  const want = b.lit ? (rng() < density ? 2 : 1) : (rng() < 0.4 * density ? 1 : 0);
  const sides = rng() < 0.5 ? [-1, 1] : [1, -1];
  for (let k = 0; k < want && k < 2; k++) {
    const s = sides[k];
    const id = pick(b.lit ? SHOP_SET : HOME_SET, rng);
    const r = CLUTTER_R[id];
    const lx = door.x + s * (door.w / 2 + 0.55 + r);
    if (Math.abs(lx - m.x) + r > m.w / 2 + 0.2) continue;                      // past the corner: no
    const lz = frontZ + (id === 'bench' ? 0.3 : r * 0.7 + 0.1);
    out.push({ id, lx, lz, yaw: id === 'bench' ? Math.PI : (rng() - 0.5) * 0.6 });
  }
  return out;
}

/**
 * Around a square (world metres): benches facing the middle on the rim between stall spots, crates and sacks beside
 * each stall, a hand cart and a bucket by the well. `spots` = the stall spots town-view already uses ({x, z, yaw}).
 */
export function squareClutter(square, spots, rng, density = 1) {
  const out = []; if (!square) return out;
  const { x: cx, z: cz } = square, R = Math.max(4, square.r || 5);
  out.push({ id: 'bucket', x: cx + 1.25, z: cz + 0.4, yaw: 0 });
  const angs = spots.map(s => Math.atan2(s.x - cx, s.z - cz)).sort((a, b) => a - b);
  for (let i = 0; i < angs.length; i++) {
    if (rng() > density) continue;
    const a = angs[i], b = i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2;
    const mid = (a + b) / 2, rr = R * 0.82;
    if (b - a < 0.9) continue;
    out.push({ id: 'bench', x: cx + Math.sin(mid) * rr, z: cz + Math.cos(mid) * rr, yaw: mid });
  }
  for (const s of spots) {
    if (rng() > density) continue;
    const id = pick(['sacks', 'crates', 'barrels', 'crate'], rng);
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), lx = (rng() < 0.5 ? -1 : 1) * 2.1, lz = -0.3;
    out.push({ id, x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c, yaw: s.yaw + (rng() - 0.5) * 0.5 });
  }
  if (rng() < density) { const a = (angs[0] ?? 0) + 0.45; out.push({ id: 'cart', x: cx + Math.sin(a) * R * 0.62, z: cz + Math.cos(a) * R * 0.62, yaw: a + 1.3 }); }
  return out;
}
