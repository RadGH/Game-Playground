// Oathwild — what a bridge is made of, as data (owner report #129, 2026-11-25: "Bridge looks MVP. It is not even
// textured."). Pure: the browser draws from it (js/client/render/bridge-draw.js) and the tests read it
// (tests/world/bridges.test.mjs), so the deck that is drawn is the deck that is walked (lessons rule 22).
//
//   const plan = bridgePlan(T, bridge)
//   plan.frame   { mid: [x, z], yaw, len, width, deck }   local space: z runs along the span (−len/2 at end `a`,
//                +len/2 at end `b`), x runs across, y is the world height. Group: position (mid.x, 0, mid.z), rotation.y = yaw.
//   plan.parts   [{ role, mat, shape: 'box'|'cyl', at: [x, y, z] (centre), size: [sx, sy, sz], rot?: [rx, ry, rz],
//                  grain?: 'x'|'y'|'z', tint }]
//                role 'deck' = the walked surface (top exactly at bridge.deck, the rectangle between a and b);
//                mat 'wood' | 'stone' | 'paving'
//   plan.body    stone bridges: the arched body as a side profile [[z, y], …] extruded across x0..x1 (null for wood)
//   plan.kit     Kenney Fantasy Town pieces: [{ id, at: [x, y, z], yaw, scale }] (newel pillars, lantern posts)
//   plan.toWorld(lx, lz) → [x, z]
//
// Wooden bridge (bridge.art 'bridge-wood'): planks laid across on stringers, kerb logs, a post-and-rail railing with
// diagonal braces, trestle bents of piles with cap beams and cross braces wherever the ground falls away under the deck,
// stone abutments at both banks, newel posts and lantern posts at the ends.
// Stone bridge ('bridge-stone'): one masonry body with arches over the water (piers with cutwaters, a ring of arch
// stones on both faces), a string course, parapets with coping, a paved deck, stone newel pillars at the ends.

const DECK_T = { wood: 0.09, stone: 0.22 };          // plank / paving thickness

function rng(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 100000) / 100000; }; }
const hashStr = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const r3 = v => Math.round(v * 1000) / 1000;

export function bridgePlan(T, b) {
  const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1];
  const len = Math.hypot(dx, dz), W = b.width, D = b.deck;
  const yaw = Math.atan2(dx, dz);
  const ux = dx / len, uz = dz / len;                 // along (local +z)
  const vx = uz, vz = -ux;                            // across (local +x = (cos yaw, −sin yaw))
  const mid = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2];
  const toWorld = (lx, lz) => [mid[0] + lx * vx + lz * ux, mid[1] + lx * vz + lz * uz];
  const ground = (lx, lz) => T.heightAt(...toWorld(lx, lz));
  const lowest = (lz, xs = [-W / 2, 0, W / 2]) => Math.min(...xs.map(x => ground(x, lz)));
  const rnd = rng(hashStr(b.id));
  const parts = [], kit = [];
  const part = (role, mat, at, size, extra = {}) => parts.push({ role, mat, shape: 'box', at: at.map(r3), size: size.map(r3), tint: 1, ...extra });
  const stone = /stone/.test(b.art || b.id);
  const L2 = len / 2;
  const plan = { id: b.id, kind: stone ? 'stone' : 'wood', frame: { mid, yaw: r3(yaw), len: r3(len), width: W, deck: D }, parts, kit, body: null, toWorld };
  return stone ? stoneBridge(plan) : woodBridge(plan);

  // ---------------------------------------------------------------- wood
  function woodBridge(p) {
    const t = DECK_T.wood, beamH = 0.36, under = D - t - beamH;        // bottom of the stringers
    // planks across the span, tops exactly at the deck; a 3 cm gap between them
    const n = Math.max(1, Math.ceil(len / 0.32)), pitch = len / n, gap = 0.03;
    for (let i = 0; i < n; i++) {
      const lenX = W - rnd() * 0.16, off = (rnd() - 0.5) * 0.08;
      part('deck', 'wood', [off, D - t / 2, -L2 + pitch * (i + 0.5)], [lenX, t, pitch - gap], { grain: 'x', tint: 0.8 + rnd() * 0.28 });
    }
    // stringers (the beams the planks sit on)
    const sx = W >= 6 ? [-W / 2 + 0.45, -W / 6, W / 6, W / 2 - 0.45] : [-W / 2 + 0.4, 0, W / 2 - 0.4];
    for (const x of sx) part('beam', 'wood', [x, D - t - beamH / 2, 0], [0.26, beamH, len + 0.6], { grain: 'z', tint: 0.62 });
    // fascia boards hide the plank ends; kerb logs keep carts off the edge (outside the road's width)
    for (const s of [-1, 1]) {
      part('trim', 'wood', [s * (W / 2 + 0.05), D - 0.17, 0], [0.1, 0.34, len + 0.2], { grain: 'z', tint: 0.7 });
      part('kerb', 'wood', [s * (W / 2 - 0.14), D + 0.08, 0], [0.22, 0.16, len - 0.2], { grain: 'z', tint: 0.74 });
    }
    // the railing: posts, a top rail and a mid rail, one diagonal brace per panel (alternating)
    const np = Math.max(2, Math.round(len / 2.3)), ps = len / np, postX = W / 2 + 0.16;
    for (const s of [-1, 1]) {
      for (let i = 1; i < np; i++) {
        const z = -L2 + ps * i;
        part('post', 'wood', [s * postX, D + 0.28, z], [0.18, 1.72, 0.18], { grain: 'y', tint: 0.78 });
        part('post', 'wood', [s * postX, D + 1.17, z], [0.24, 0.06, 0.24], { grain: 'x', tint: 0.6 });
      }
      part('rail', 'wood', [s * postX, D + 1.06, 0], [0.13, 0.12, len], { grain: 'z', tint: 0.85 });
      part('rail', 'wood', [s * (postX - 0.02), D + 0.56, 0], [0.07, 0.11, len], { grain: 'z', tint: 0.8 });
      for (let i = 0; i < np; i++) {
        const z0 = -L2 + ps * i + 0.12, z1 = -L2 + ps * (i + 1) - 0.12, y0 = D + 0.2, y1 = D + 0.98;
        const up = (i + (s > 0 ? 0 : 1)) % 2 === 0;
        const l = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0);
        part('brace', 'wood', [s * (postX - 0.03), (y0 + y1) / 2, (z0 + z1) / 2], [0.05, 0.1, l], { grain: 'z', tint: 0.72, rot: [up ? -ang : ang, 0, 0] });
      }
    }
    // trestle bents where the ground falls away: piles down into the bank / river bed, a cap beam, cross braces
    const span = [];
    for (let z = -L2; z <= L2 + 1e-6; z += 0.5) if (lowest(z) < D - 1.3) span.push(z);
    if (span.length) {
      const z0 = span[0], z1 = span[span.length - 1], m = Math.max(1, Math.round((z1 - z0) / 4.2));
      const pileX = sx.length === 4 ? [-W / 2 + 0.45, 0, W / 2 - 0.45] : [-W / 2 + 0.4, 0, W / 2 - 0.4];
      const water = b.surface ?? -Infinity;
      for (let k = 0; k <= m; k++) {
        const z = z0 + (z1 - z0) * k / m;
        const capY = under - 0.15;
        part('cap', 'wood', [0, capY, z], [W + 0.5, 0.3, 0.34], { grain: 'x', tint: 0.6 });
        let low = Infinity;
        for (const x of pileX) {
          const g = ground(x, z), bot = g - 0.8, top = capY - 0.15;
          low = Math.min(low, g);
          parts.push({ role: 'pile', mat: 'wood', shape: 'cyl', at: [r3(x), r3((bot + top) / 2), r3(z)], size: [0.36, r3(top - bot), 0.36], grain: 'y', tint: 0.66 + rnd() * 0.1 });
        }
        // cross braces above the water / ground, on both faces of the bent
        const yb = Math.max(low, water) + 0.35, yt = capY - 0.25;
        if (yt - yb > 0.7) {
          const span2 = pileX[2] - pileX[0], l = Math.hypot(span2, yt - yb), ang = Math.atan2(yt - yb, span2);
          part('brace', 'wood', [0, (yb + yt) / 2, z - 0.22], [l, 0.16, 0.06], { grain: 'x', tint: 0.7, rot: [0, 0, ang] });
          part('brace', 'wood', [0, (yb + yt) / 2, z + 0.22], [l, 0.16, 0.06], { grain: 'x', tint: 0.7, rot: [0, 0, -ang] });
        }
      }
    }
    // stone abutments where each end meets the bank
    for (const s of [-1, 1]) {
      const zc = s * (L2 - 0.9), g = Math.min(lowest(zc), lowest(s * (L2 - 1.8)), lowest(s * L2));
      const top = under, bot = g - 1;
      if (top - bot > 0.2) part('abutment', 'stone', [0, (top + bot) / 2, zc], [W + 0.6, top - bot, 2.2], { grain: 'z', tint: 0.95 });
    }
    // newel posts at the four corners (Kenney pillar-wood), a lantern post at each end (Kenney lantern)
    for (const s of [-1, 1]) for (const e of [-1, 1]) kit.push({ id: 'pillar-wood', at: [r3(s * postX), r3(D - 0.6), r3(e * (L2 - 0.1))], yaw: 0, scale: [2.6, 1.95, 2.6] });
    for (const e of [-1, 1]) {
      const [x, z] = [e * (W / 2 + 0.75), e * (L2 + 0.7)];
      kit.push({ id: 'lantern', at: [r3(x), r3(Math.min(ground(x, z), D + 0.3)), r3(z)], yaw: 0, scale: 1.9 });
    }
    return p;
  }

  // ---------------------------------------------------------------- stone
  function stoneBridge(p) {
    const t = DECK_T.stone, ring = 0.42, crown = D - t - ring;   // underside of the arch ring at its crown
    const water = b.surface ?? (D - 1.5);
    // the paved deck, exactly between the two ends
    part('deck', 'paving', [0, D - t / 2, 0], [W, t, len], { grain: 'z' });
    // arches over the wet part of the crossing
    const wet = [];
    for (let z = -L2; z <= L2 + 1e-6; z += 0.4) if (lowest(z) < water + 0.3) wet.push(z);
    const arches = [];
    if (wet.length) {
      const g0 = Math.max(-L2 + 1.2, wet[0] - 0.8), g1 = Math.min(L2 - 1.2, wet[wet.length - 1] + 0.8), gap = g1 - g0;
      const n = Math.max(1, Math.min(3, Math.round(gap / 6.5))), pier = 1.3, a = (gap - (n - 1) * pier) / n;
      const spring = Math.min(water - 0.9, crown - 1.2);
      for (let k = 0; k < n; k++) { const z0 = g0 + k * (a + pier); arches.push({ z0, z1: z0 + a, c: z0 + a / 2, half: a / 2, spring, rise: crown - spring }); }
    }
    const intrados = z => { for (const A of arches) if (z >= A.z0 && z <= A.z1) { const u = (z - A.c) / A.half; return A.spring + A.rise * Math.sqrt(Math.max(0, 1 - u * u)); } return null; };
    // the body's side profile: top under the paving, bottom in the ground (or the arch's underside)
    const ext = 0.8, prof = [], topY = D - t;
    prof.push([-L2 - ext, topY], [L2 + ext, topY]);
    const bottom = [];
    for (let z = L2 + ext; z >= -L2 - ext - 1e-6; z -= 0.25) {
      const yi = intrados(z);
      bottom.push([z, Math.min(topY - 0.3, yi != null ? yi : lowest(Math.max(-L2, Math.min(L2, z))) - 1)]);
    }
    // arch feet: drop straight down at each springing so the opening reads as an arch, not a notch
    for (const A of arches) for (const z of [A.z0, A.z1]) bottom.push([z, A.spring]);
    bottom.sort((u, v) => v[0] - u[0]);
    p.body = { mat: 'stone', x0: -W / 2, x1: W / 2, profile: [...prof, ...bottom].map(([z, y]) => [r3(z), r3(y)]) };
    p.arches = arches.map(A => ({ z0: r3(A.z0), z1: r3(A.z1), spring: r3(A.spring), crown: r3(crown) }));
    // a ring of arch stones on both faces, a little proud of the wall
    for (const A of arches) {
      const steps = Math.max(9, Math.round(Math.PI * (A.half + A.rise) / 2 / 0.42));
      for (let i = 0; i <= steps; i++) {
        const th = Math.PI * i / steps, z = A.c - Math.cos(th) * A.half, y = A.spring + Math.sin(th) * A.rise;
        if (y < water - 0.3) continue;
        // the ellipse's outward normal at this point
        const nz = -Math.cos(th) / A.half, ny = Math.sin(th) / A.rise, nl = Math.hypot(nz, ny) || 1;
        const cz = z + nz / nl * 0.24, cy = y + ny / nl * 0.24;
        const ang = Math.atan2(nz, ny);                            // turn about x: the stone's height runs along the normal
        for (const s of [-1, 1]) part('voussoir', 'stone', [s * (W / 2 + 0.03), cy, cz], [0.14, 0.5, 0.36], { grain: 'z', tint: 0.8 + rnd() * 0.12, rot: [ang, 0, 0] });
      }
    }
    // piers between the arches get pointed cutwaters on both faces
    for (let k = 0; k + 1 < arches.length; k++) {
      const z = (arches[k].z1 + arches[k + 1].z0) / 2, g = lowest(z) - 0.8, top = water + 0.7;
      for (const s of [-1, 1]) {
        part('cutwater', 'stone', [s * (W / 2), (g + top) / 2, z], [0.95, top - g, 0.95], { grain: 'y', tint: 0.9, rot: [0, Math.PI / 4, 0] });
        part('cutwater', 'stone', [s * (W / 2), top + 0.1, z], [1.05, 0.2, 1.05], { grain: 'y', tint: 0.75, rot: [0, Math.PI / 4, 0] });
      }
    }
    // string course, parapets with coping, end pillars
    for (const s of [-1, 1]) {
      part('course', 'stone', [s * (W / 2 + 0.05), D - 0.32, 0], [0.14, 0.16, len + 2 * ext], { grain: 'z', tint: 0.78 });
      part('parapet', 'stone', [s * (W / 2 - 0.2), D + 0.42, 0], [0.4, 0.84, len + 0.4], { grain: 'z', tint: 0.97 });
      part('coping', 'stone', [s * (W / 2 - 0.2), D + 0.9, 0], [0.54, 0.13, len + 0.5], { grain: 'z', tint: 0.8 });
      for (const e of [-1, 1]) kit.push({ id: 'pillar-stone', at: [r3(s * (W / 2 - 0.2)), r3(Math.min(D - 0.2, ground(s * (W / 2 - 0.2), e * (L2 + 0.25)))), r3(e * (L2 + 0.25))], yaw: 0, scale: [4.6, 1.45, 4.6] });
    }
    return p;
  }
}

/** The drawn deck's top at local (x, z): the highest 'deck' part covering that spot (null where none does). */
export function deckTopAt(plan, lx, lz) {
  let top = null;
  for (const q of plan.parts) {
    if (q.role !== 'deck') continue;
    if (Math.abs(lx - q.at[0]) > q.size[0] / 2 + 1e-9 || Math.abs(lz - q.at[2]) > q.size[2] / 2 + 1e-9) continue;
    const y = q.at[1] + q.size[1] / 2;
    if (top == null || y > top) top = y;
  }
  return top;
}
