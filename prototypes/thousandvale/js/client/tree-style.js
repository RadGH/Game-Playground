// Storybook trees — Thousandvale's own tree builder (2026-10-20, owner: "the new big trees look better from a distance.
// They have big interesting leaves. When you get closer it gets replaced with a spindly tree with tiny leaves. Can we
// have trees updated to look more cartoony and mythical rather than realistic").
//
// WHY THE OLD TREES CHANGED AS YOU WALKED UP: the shared kit (highdef-3d/js/kit/trees.js) builds a REAL tree up close —
// a branching skeleton with 100+ small leaf cards on twig ends — and, far away, a cross of three big cards each showing
// one leaf picture stretched over the whole crown. So the far tree showed a handful of huge painted leaves and the near
// one hundreds of small ones on thin branches: two different trees, and the swap at 60-240 m showed.
//
// HOW THESE ARE BUILT: every tree is first PLANNED from its seed — trunk path, limbs, and a few round leaf CLUMPS (centre +
// radius) — and the plan is the same at every detail level. Each level only decides how many pieces draw that plan:
//   level 0  a fluted, twisting trunk with a root flare; thick limbs into each clump; each clump a small solid "puff" with
//            nine BIG leaf cards round it (one card is one whole leaf-cluster picture, so a leaf is a hand across, not a
//            thumbnail), lit like a soft ball (normals point out of the clump), darker inside and underneath, lighter rim
//   level 1  the same clumps with five bigger cards and an eight-sided puff
//   level 2  the same clumps as two crossed cards each (the far tree the owner liked), a three-sided trunk
// so the silhouette, the colours and the size of a leaf are the same at 10 m and at 400 m.
//
// Same contract as the kit (so the scatter's materials, its instancing and the shared wind all work unchanged):
// { bark, foliage } BufferGeometries with position, normal, uv, color, aWind; Y up; origin on the ground. The foliage
// samples the kit's leaf atlas (highdef-3d/js/kit/textures.js loadFoliageAtlas) through cellRect.
//
//   buildStoryTree(name, { seed, lod }) -> { bark, foliage, height, radius, trunkRadius, plan }
//   hasStoryTree(name)
//   buildSceneryTree(name, opts)  — the storybook tree when there is one, the kit tree otherwise (every Thousandvale caller)
//   storyPlan(name, seed)         — the level-free plan (pure; tests read it)
//
// Numbers live in js/client/tree-style-data.js. Nothing here changes the shared kit.

import * as THREE from 'three';
import { buildTree, cellRect, makeRng } from '../../../../highdef-3d/js/kit/trees.js';
import { STORY_TREES, STORY_LOD } from './tree-style-data.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (rng, a, b) => a + (b - a) * rng();
/** The opaque middle of the round-leaf picture (atlas row 2, col 3): a puff samples a small patch of it so it is solid. */
const CORE_CELL = cellRect(3, 2);
/** The kit's bark picture is a dark pine bark; storybook trunks are lighter and warmer (on top of each row's `bark`). */
const BARK_GAIN = 1.4;
const coreUV = (u, v) => [lerp(CORE_CELL.u0, CORE_CELL.u1, 0.5 + u * 0.16), lerp(CORE_CELL.v0, CORE_CELL.v1, 0.55 + v * 0.16)];

export const hasStoryTree = name => Object.prototype.hasOwnProperty.call(STORY_TREES, name);

/** `?trees=kit` in the page address draws the old kit trees instead (before/after comparisons; tests/D/trees.spec.js). */
const KIT_TREES = typeof location !== 'undefined' && /[?&]trees=kit\b/.test(location.search || '');

/** The storybook tree when there is one, else the kit tree — the one call every Thousandvale tree goes through. */
export function buildSceneryTree(name, opts = {}) {
  if (KIT_TREES && !name.startsWith('story_')) return buildTree(name, opts);
  return hasStoryTree(name) ? buildStoryTree(name, opts) : buildTree(name, opts);
}

// ---------------------------------------------------------------------------------------------------------------------
// The buffer (the kit's five attributes, in its order)
// ---------------------------------------------------------------------------------------------------------------------
class Buf {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.wind = []; this.idx = []; this.maxR2 = 0; this.maxY = 0; }
  v(p, n, u, v, c, w, ph) {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]);
    this.wind.push(clamp(w, 0, 1), ((ph % 1) + 1) % 1);
    const r2 = p.x * p.x + p.z * p.z; if (r2 > this.maxR2) this.maxR2 = r2; if (p.y > this.maxY) this.maxY = p.y;
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  get tris() { return this.idx.length / 3; }
  geometry() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The plan (level-free)
// ---------------------------------------------------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** A smooth path through control points (Catmull-Rom), `n` points. */
function pathThrough(ctrl, n) {
  const c = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  return c.getPoints(n - 1);
}
/** Unit vector at azimuth a. */
const az = a => V(Math.cos(a), 0, Math.sin(a));

/** A trunk path from just under the ground to `top`, with a lean and an S-bend; radius rB -> rT with a root flare. */
function trunkPlan(rng, S, top, o = {}) {
  const leanA = rng() * TAU, lean = (o.lean ?? 0.05) * top, bendA = rng() * TAU, bend = (o.bend ?? 0.035) * top;
  const ctrl = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    const p = az(leanA).multiplyScalar(lean * t * t).add(az(bendA).multiplyScalar(bend * Math.sin(t * Math.PI)));
    p.y = lerp(-0.4, top, t);
    ctrl.push(p);
  }
  return { ctrl, rB: S.rB, rT: S.rT, flare: S.flare, twist: S.twist, ridge: S.ridge, phase: rng() };
}

/** Radius of a trunk at fraction t of its length. */
function trunkR(T, t) {
  const base = lerp(T.rB, T.rT, Math.pow(t, 0.75));
  const f = t < 0.16 ? T.flare * Math.pow(1 - t / 0.16, 2) : 0;
  return base * (1 + f);
}

/** Clumps for a round crown: one on top, `n` round it, all inside an ellipsoid of crownR x crownR*squash. */
function roundClumps(rng, S, cy, R) {
  const out = [];
  const sq = S.squash;
  out.push({ c: V(rand(rng, -0.1, 0.1) * R, cy + R * sq * 0.42, rand(rng, -0.1, 0.1) * R), r: R * 0.6 });
  const a0 = rng() * TAU;
  for (let k = 0; k < S.clumps; k++) {
    const a = a0 + (k / S.clumps) * TAU + rand(rng, -0.3, 0.3);
    const d = R * rand(rng, 0.5, 0.62), y = cy + R * sq * rand(rng, -0.22, 0.2);
    out.push({ c: az(a).multiplyScalar(d).setY(y), r: R * rand(rng, 0.44, 0.54) });
  }
  return out;
}

/** The plan of one tree: everything every detail level draws, from the seed alone. */
export function storyPlan(name, seed = 1) {
  const S = STORY_TREES[name];
  if (!S) throw new Error(`tree-style: no storybook tree "${name}"`);
  const rng = makeRng(seed);
  const h = S.h * rand(rng, 0.94, 1.06);
  const plan = { name, form: S.form, h, S, limbs: [], clumps: [], tiers: [], fronds: [], strands: [], accents: [], stubs: [] };
  if (S.form === 'round' || S.form === 'weep') {
    const trunkTop = h * S.trunkH, R = S.crownR;
    const cy = trunkTop + R * S.squash * 0.75;
    plan.trunk = trunkPlan(rng, S, trunkTop + R * 0.15, { lean: 0.04, bend: 0.05 });
    plan.clumps = roundClumps(rng, S, cy, R);
    plan.canopy = { c: V(0, cy, 0), R, H: R * S.squash };
    if (S.form === 'weep') {
      // the curtain: strands hang from the canopy's rim, longest at the front of the dome
      const a0 = rng() * TAU;
      for (let k = 0; k < S.strands; k++) {
        const a = a0 + (k / S.strands) * TAU + rand(rng, -0.12, 0.12), d = R * rand(rng, 0.72, 1.02);
        plan.strands.push({ top: az(a).multiplyScalar(d).setY(cy + R * S.squash * rand(rng, -0.1, 0.25)), len: rand(rng, 0.45, 0.72) * cy, w: R * 0.34, a, ph: rng() });
      }
    }
  } else if (S.form === 'tall') {
    // a trunk that runs up through the crown, clumps stacked along it (a birch's or beech's tall oval)
    const trunkTop = h * 0.9, R = S.crownR, y0 = h * S.trunkH, y1 = h - R * 0.55;
    plan.trunk = trunkPlan(rng, S, trunkTop, { lean: 0.03, bend: 0.03 });
    const n = S.clumps;
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : k / (n - 1), w = Math.sin(lerp(0.35, 0.92, t) * Math.PI);    // widest a little below the middle
      const a = rng() * TAU, d = R * 0.32 * w * (k === n - 1 ? 0.2 : 1);
      plan.clumps.push({ c: az(a).multiplyScalar(d).setY(lerp(y0 + R * 0.5, y1, t)), r: R * lerp(0.5, 0.82, w) * (k === n - 1 ? 0.8 : 1) });
    }
    // and two side clumps low on the crown so it is not a stick through a pile of balls
    for (let k = 0; k < 2; k++) { const a = rng() * TAU; plan.clumps.push({ c: az(a).multiplyScalar(R * 0.62).setY(lerp(y0, y1, 0.3 + 0.25 * k)), r: R * 0.48 }); }
    plan.canopy = { c: V(0, (y0 + h) / 2, 0), R, H: (h - y0) / 2 };
  } else if (S.form === 'tiers' || S.form === 'crown') {
    const trunkTop = h * 0.97;
    plan.trunk = trunkPlan(rng, S, trunkTop, { lean: 0.015, bend: 0.012 });
    const n = S.tiers, yb = S.form === 'crown' ? h * S.trunkH : h * S.trunkH + 0.6;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const y = lerp(yb, h * (S.form === 'crown' ? 0.86 : 0.8), Math.pow(t, S.form === 'crown' ? 1 : 0.92));
      const R = S.form === 'crown' ? S.crownR * lerp(1, 0.55, t) * rand(rng, 0.92, 1.05) : S.crownR * Math.pow(1 - t * 0.86, 0.95) * rand(rng, 0.94, 1.04);
      const tierH = S.form === 'crown' ? R * 0.62 : (h - yb) / n * 1.55;
      plan.tiers.push({ y, R, H: tierH, a: rng() * TAU, ph: rng() });
    }
    plan.canopy = { c: V(0, (yb + h) / 2, 0), R: S.crownR, H: (h - yb) / 2 };
  } else if (S.form === 'snag') {
    plan.trunk = trunkPlan(rng, S, h, { lean: 0.07, bend: 0.06 });
    for (let k = 0; k < S.limbs; k++) {
      const t = lerp(S.tall ? 0.35 : 0.45, 0.9, (k + rng() * 0.5) / S.limbs), a = rng() * TAU;
      plan.stubs.push({ t, a, len: h * rand(rng, 0.18, 0.3) * (S.tall ? 0.8 : 1), rise: rand(rng, 0.2, 0.9), kink: rand(rng, -0.6, 0.6) });
    }
  } else if (S.form === 'palm' || S.form === 'fern') {
    plan.trunk = trunkPlan(rng, S, h, { lean: S.form === 'palm' ? 0.16 : 0.06, bend: S.form === 'palm' ? 0.06 : 0.02 });
    plan.trunk.segmented = S.form === 'palm';
    const top = trunkPointAt(plan.trunk, 1);
    const a0 = rng() * TAU;
    for (let k = 0; k < S.fronds; k++) {
      const a = a0 + (k / S.fronds) * TAU + rand(rng, -0.2, 0.2);
      plan.fronds.push({ base: top.clone(), a, len: S.frondLen * rand(rng, 0.85, 1.12), lift: rand(rng, 0.25, 0.6), droop: rand(rng, 0.55, 0.9), ph: rng(), col: k % 4 });
    }
    plan.canopy = { c: top.clone(), R: S.frondLen, H: S.frondLen * 0.5 };
  }
  // limbs: from the trunk's top half into each clump (round / weep); tall trees get short ones from the trunk
  if (plan.clumps.length && plan.trunk) {
    const L = S.form === 'tall' ? plan.clumps.length - 1 : Math.min(S.limbs, plan.clumps.length - 1);
    const order = plan.clumps.slice(1).map((c, i) => [c, i]).sort((x, y) => y[0].r - x[0].r).slice(0, L);
    for (const [cl] of order) {
      const t0 = S.form === 'tall' ? clamp((cl.c.y - plan.trunk.ctrl[0].y) / (plan.trunk.ctrl[4].y - plan.trunk.ctrl[0].y), 0.3, 0.9) - 0.08 : rand(rng, 0.82, 0.95);
      const from = trunkPointAt(plan.trunk, t0), to = cl.c.clone().lerp(V(0, cl.c.y, 0), 0.25);
      const mid = from.clone().lerp(to, 0.5).add(V(0, (to.y - from.y) * 0.25 + 0.3, 0));
      plan.limbs.push({ pts: [from, mid, to], r0: trunkR(plan.trunk, t0) * 0.62, r1: trunkR(plan.trunk, t0) * 0.28 });
    }
  }
  // the mythical touch: small bright cards on the canopy's outside
  if (S.accent && plan.clumps.length) {
    for (let k = 0; k < S.accent.n; k++) {
      const cl = plan.clumps[k % plan.clumps.length], d = sphereDir(k, S.accent.n, rng() * TAU);
      if (d.y < -0.2) d.y = -d.y;
      plan.accents.push({ p: cl.c.clone().addScaledVector(d, cl.r * 0.92), n: d, s: cl.r * rand(rng, 0.26, 0.36), ph: rng() });
    }
  }
  // a clump's picture: any of the four broadleaf clusters; for small-leaved trees the dense round-leaf one (the other three are sprigs)
  plan.leafCells = plan.clumps.map(() => { const c = Math.floor(rng() * 4) % 4; return cellRect(S.leafRow === 2 ? 3 : c, S.leafRow ?? 0); });
  for (const cl of plan.clumps) cl.ph = rng(), cl.roll = rng() * TAU;
  return plan;
}

/** A point on the trunk at fraction t (0 ground .. 1 top). */
function trunkPointAt(T, t) {
  const c = new THREE.CatmullRomCurve3(T.ctrl, false, 'centripetal');
  return c.getPoint(clamp(t, 0, 1));
}

/** n directions spread evenly over a sphere (a Fibonacci spiral), turned by `turn`. */
function sphereDir(i, n, turn = 0) {
  const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + turn;
  return V(Math.cos(a) * r, y, Math.sin(a) * r);
}

// ---------------------------------------------------------------------------------------------------------------------
// Drawing a plan at one detail level
// ---------------------------------------------------------------------------------------------------------------------

/** Sweep a ring along a path. pts: [{ p, r, wind, ao }]. Ridges (fluting) turn up the tube by `twist` turns. */
function tube(buf, pts, o) {
  const sides = o.sides, tint = o.tint, lobes = Math.max(2, Math.floor(sides / 2));
  let nrm = null, arc = 0;
  const rings = [];
  const circ = TAU * Math.max(pts[0].r, 0.05);
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i], prev = pts[Math.max(0, i - 1)].p, next = pts[Math.min(pts.length - 1, i + 1)].p;
    const t = next.clone().sub(prev); if (t.lengthSq() < 1e-10) t.set(0, 1, 0); t.normalize();
    if (!nrm) { nrm = Math.abs(t.y) < 0.9 ? V(0, 1, 0).cross(t).normalize() : V(1, 0, 0).cross(t).normalize(); }
    else { nrm.addScaledVector(t, -nrm.dot(t)); if (nrm.lengthSq() < 1e-6) nrm = V(1, 0, 0).cross(t); nrm.normalize(); }
    const b = t.clone().cross(nrm);
    if (i > 0) arc += q.p.distanceTo(pts[i - 1].p);
    const f = i / (pts.length - 1);
    const ring = [];
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU;
      const out = nrm.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
      const ridge = o.ridge ? 1 + o.ridge * (1 + 1.6 * Math.max(0, 1 - f / 0.2)) * Math.cos(lobes * a + o.twist * TAU * f) : 1;
      const seg = o.segmented && sides > 3 ? 1 + 0.12 * Math.cos(arc * 2.6) : 1;
      const p = q.p.clone().addScaledVector(out, q.r * ridge * seg);
      const ao = (q.ao ?? 1) * (0.9 + 0.1 * Math.cos(lobes * a + o.twist * TAU * f));
      ring.push(buf.v(p, out, (s / sides) * 2, (arc / circ), [tint[0] * ao, tint[1] * ao, tint[2] * ao], q.wind ?? 0, o.phase ?? 0));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < sides; s++) buf.quad(rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s]);
  if (o.cap) {
    const q = pts[pts.length - 1], last = rings[rings.length - 1];
    const c = buf.v(q.p, UP, 0.5, 0.5, tint.map(x => x * 0.8), q.wind ?? 0, o.phase ?? 0);
    for (let s = 0; s < sides; s++) buf.tri(last[s], last[s + 1], c);
  }
}

/**
 * One leaf card: a rows x cols grid, centred on `c` (or based there: anchor 'base'), bowed across its width. Colour and
 * normal come from `shade(p)` / `normal(p, flat)` so a whole clump lights as one ball.
 */
function card(buf, o) {
  const rows = o.rows, cols = o.cols ?? (rows > 2 ? 3 : 2), up = o.up.clone().normalize(), facing = o.facing.clone().normalize();
  const side = up.clone().cross(facing); if (side.lengthSq() < 1e-8) side.set(1, 0, 0); side.normalize();
  const grid = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1), row = [];
    const along = (o.anchor === 'base' ? t : t - 0.5) * o.h;
    for (let j = 0; j < cols; j++) {
      const s = cols === 1 ? 0 : (j / (cols - 1)) * 2 - 1;
      const p = o.c.clone().addScaledVector(up, along).addScaledVector(side, s * o.w * 0.5)
        .addScaledVector(facing, (o.bow ?? 0.18) * (1 - s * s) * o.w * 0.5);
      if (o.sag) p.y -= o.sag * o.h * t * t;
      if (o.curl) p.addScaledVector(facing, o.curl * o.h * t * t);
      const flat = facing.clone().addScaledVector(side, -0.5 * s * (o.bow ?? 0.18)).normalize();
      const n = o.normal ? o.normal(p, flat) : flat;
      const u = lerp(o.cell.u0, o.cell.u1, (s + 1) / 2), v = lerp(o.cell.v0, o.cell.v1, t);
      const w = o.wind ? o.wind(p, t) : 0.7;
      row.push(buf.v(p, n, u, v, o.shade(p), w, o.ph ?? 0));
    }
    grid.push(row);
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) buf.quad(grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]);
}

/** A card frame: `up` as close to world up as `facing` allows, rolled by `roll`. */
function frame(facing, roll) {
  const f = facing.clone().normalize();
  let up = UP.clone().addScaledVector(f, -UP.dot(f));
  if (up.lengthSq() < 1e-6) up = V(1, 0, 0); up.normalize();
  if (roll) up.applyAxisAngle(f, roll);
  return { facing: f, up };
}

const ICO = (() => { const g = new THREE.IcosahedronGeometry(1, 0); const p = g.getAttribute('position'); const out = []; for (let i = 0; i < p.count; i++) out.push(V(p.getX(i), p.getY(i), p.getZ(i))); g.dispose(); return out; })();
const OCTA = (() => { const g = new THREE.OctahedronGeometry(1, 0); const p = g.getAttribute('position'); const out = []; for (let i = 0; i < p.count; i++) out.push(V(p.getX(i), p.getY(i), p.getZ(i))); g.dispose(); return out; })();

/** The solid middle of a clump: a lumpy low-poly ball (non-indexed soup of `shape`), smooth ball normals. */
function puff(buf, c, r, shape, o) {
  for (let i = 0; i < shape.length; i += 3) {
    const ids = [];
    for (let k = 0; k < 3; k++) {
      const d = shape[i + k];
      const lump = 1 + 0.12 * Math.sin(d.x * 7.1 + d.z * 5.3 + o.seed) ;
      const p = c.clone().add(V(d.x * r * lump, d.y * r * o.sq * lump, d.z * r * lump));
      const n = V(d.x, d.y * 0.8 + 0.25, d.z).normalize();
      const [u, v] = coreUV(d.x, d.y);
      ids.push(buf.v(p, n, u, v, o.shade(p), o.wind, o.ph));
    }
    buf.tri(ids[0], ids[1], ids[2]);
  }
}

/** Light on a canopy: darker inside and underneath, lighter on the upper rim (a multiplier on the leaf picture). */
function canopyShade(S, canopy, tint) {
  return (p, clump) => {
    const up = clamp((p.y - canopy.c.y) / Math.max(1, canopy.H), -1, 1);
    const out = clamp(Math.hypot(p.x, p.z) / Math.max(1, canopy.R), 0, 1.2);
    let k = 0.72 + 0.3 * up + 0.18 * out;
    if (clump) { const d = p.clone().sub(clump.c); k += 0.18 * clamp(d.length() / clump.r - 0.55, -0.6, 0.6) + 0.1 * clamp(d.y / clump.r, -1, 1); }
    k = clamp(k, 0.5, 1.22);
    return [tint[0] * k, tint[1] * k, tint[2] * k];
  };
}

function drawTrunk(bark, plan, L, rng) {
  const T = plan.trunk, S = plan.S, n = Math.max(2, L.rings + (L.sides > 3 && plan.form === 'snag' ? 1 : 0));
  // a birch's dark bands: each is a pair of close rings drawn dark, between light ones (level 0 and 1)
  const bandT = S.bands && L.sides > 3 ? [0.16, 0.29, 0.43, 0.55, 0.68, 0.8] : [];
  const ts = [];
  for (let i = 0; i < n; i++) ts.push(i / (n - 1));
  if (L.sides > 3) ts.push(...(L.sides > 6 ? [0.035, 0.08] : [0.06]));      // the root flare gets its own rings (it is all in the first sixth)
  for (const c of bandT) ts.push(c - 0.035, c - 0.012, c + 0.012, c + 0.035);
  ts.sort((a, b) => a - b);
  const dark = t => bandT.some(c => Math.abs(t - c) < 0.02);
  const pts = ts.map(t => ({ p: trunkPointAt(T, t), r: L.sides === 3 ? trunkR(T, t) * 1.12 : trunkR(T, t), wind: 0.25 * t * t, ao: lerp(0.55, 1, Math.min(1, t * 3)) * (dark(t) ? 0.22 : 1) }));
  if (plan.form === 'snag') pts[pts.length - 1].r *= 0.6;
  tube(bark, pts, { sides: L.sides, tint: S.bark.map(x => x * BARK_GAIN), ridge: L.sides > 3 ? S.ridge : 0, twist: S.twist, phase: T.phase, cap: plan.form !== 'snag' && L.sides > 3, segmented: T.segmented });
  return pts;
}

function drawLimbs(bark, plan, L) {
  for (const lb of L.limbSides ? plan.limbs : []) {
    const path = pathThrough(lb.pts, L.limbSides > 4 ? 5 : 3);
    const pts = path.map((p, i) => ({ p, r: lerp(lb.r0, lb.r1, i / (path.length - 1)), wind: lerp(0.22, 0.4, i / (path.length - 1)), ao: lerp(0.75, 0.95, i / (path.length - 1)) }));
    tube(bark, pts, { sides: L.limbSides, tint: plan.S.bark.map(x => x * BARK_GAIN), ridge: 0, twist: 0, phase: plan.trunk.phase });
  }
  for (const st of plan.stubs.slice(0, L.limbSides ? 99 : 3)) {
    const from = trunkPointAt(plan.trunk, st.t), dir = az(st.a).setY(st.rise).normalize();
    const elbow = from.clone().addScaledVector(dir, st.len * 0.55);
    const dir2 = az(st.a + st.kink).setY(st.rise + 1.1).normalize();
    const tip = elbow.clone().addScaledVector(dir2, st.len * 0.5);
    const r0 = trunkR(plan.trunk, st.t) * 0.62;
    // a dead tree's crooked limbs ARE its silhouette, so the far level keeps them (one straight piece each)
    const pts = [{ p: from, r: r0, wind: 0.2, ao: 0.8 }, { p: elbow, r: r0 * 0.6, wind: 0.28, ao: 0.9 }, { p: tip, r: r0 * 0.12, wind: 0.35, ao: 1 }];
    tube(bark, L.limbSides ? pts : [pts[0], { ...pts[2], r: r0 * 0.3 }],
      { sides: Math.max(3, L.limbSides), tint: plan.S.bark.map(x => x * BARK_GAIN), ridge: 0, twist: 0, phase: plan.trunk.phase });
  }
}

function drawClumps(leaf, plan, L, lod) {
  const S = plan.S, shade = canopyShade(S, plan.canopy, S.leaf);
  const list = lod === 2 ? plan.clumps.slice().sort((a, b) => b.r - a.r).slice(0, plan.strands.length ? 3 : 4) : plan.clumps;
  list.forEach(cl => {
    const cell = plan.leafCells[plan.clumps.indexOf(cl)];
    const ball = (p, flat) => p.clone().sub(cl.c).addScaledVector(UP, cl.r * 0.35).normalize().lerp(flat, 0.2).normalize();
    const wind = p => clamp(0.4 + 0.5 * p.clone().sub(cl.c).length() / cl.r, 0.4, 0.95);
    const sh = lod === 2 ? (p => shade(p, cl).map(x => x * 0.9)) : (p => shade(p, cl));
    if (lod === 2) {
      // the far tree: two crossed upright cards per clump, the same picture as the near cards, the clump's full width
      for (let k = 0; k < 2; k++) {
        const f = az(cl.roll + k * Math.PI / 2);
        card(leaf, { c: cl.c.clone(), up: UP, facing: f, w: cl.r * 2.25, h: cl.r * 2.05, rows: 2, cols: 2, cell, bow: 0, shade: sh, normal: (p) => p.clone().sub(cl.c).setY(0).normalize().addScaledVector(UP, 0.9).normalize(), wind: () => 0.5, ph: cl.ph });
      }
      return;
    }
    if (L.core) puff(leaf, cl.c, cl.r * (lod === 0 ? 0.66 : 0.72), lod === 0 ? ICO : OCTA, { sq: 0.86, seed: cl.ph * 10, shade: sh, wind: 0.5, ph: cl.ph });
    const n = L.cards, off = lod === 0 ? 0.5 : 0.4, size = lod === 0 ? 1.6 : 1.9;
    for (let k = 0; k < n; k++) {
      const d = sphereDir(k, n + 1, cl.roll);                   // n+1 so the bottom-most direction (straight down) is skipped
      const fr = frame(d.clone().addScaledVector(UP, 0.25), cl.roll * 3 + k * 1.7);
      card(leaf, { c: cl.c.clone().addScaledVector(d, cl.r * off), up: fr.up, facing: fr.facing, w: cl.r * size, h: cl.r * size, rows: L.cardRows, cell, bow: 0.22, shade: sh, normal: ball, wind, ph: cl.ph });
    }
  });
}

function drawAccents(leaf, plan, L) {
  const a = plan.S.accent; if (!a || !L.accent) return;
  const cell = cellRect(3, 2), n = Math.round(plan.accents.length * L.accent);
  for (let k = 0; k < n; k++) {
    const ac = plan.accents[k], fr = frame(ac.n, ac.ph * TAU);
    card(leaf, { c: ac.p, up: fr.up, facing: fr.facing, w: ac.s, h: ac.s, rows: 2, cols: 2, cell, bow: 0, shade: () => a.color, normal: () => ac.n, wind: () => 0.8, ph: ac.ph });
  }
}

function drawStrands(leaf, plan, L, lod) {
  if (!plan.strands.length) return;
  const S = plan.S, shade = canopyShade(S, plan.canopy, S.leaf), cell = cellRect(0, 2);
  const n = lod === 2 ? 4 : Math.round(plan.strands.length * L.strandsK);
  const step = plan.strands.length / Math.max(1, n);
  for (let k = 0; k < n; k++) {
    const s = plan.strands[Math.floor(k * step)];
    const facing = az(s.a), down = V(0, -1, 0);
    card(leaf, { c: s.top, up: down, facing, w: s.w * (lod === 2 ? 2.4 : lod === 1 ? 1.4 : 1), h: s.len, rows: lod === 0 ? 4 : 2, cols: 2, cell, anchor: 'base', bow: 0, curl: 0.12,
      shade: p => { const c = shade(p); const k2 = clamp(0.7 + (p.y - s.top.y + s.len) / s.len * 0.4, 0.6, 1.1); return [c[0] * k2, c[1] * k2, c[2] * k2]; },
      normal: () => facing.clone().addScaledVector(UP, 0.4).normalize(), wind: (p, t) => 0.5 + 0.5 * t, ph: s.ph });
  }
}

function drawTiers(leaf, plan, L, lod) {
  const S = plan.S, shade = canopyShade(S, plan.canopy, S.leaf);
  const sides = lod === 0 ? 8 : lod === 1 ? 6 : 3;
  const spokes = lod === 0 ? 8 : lod === 1 ? 5 : 0;
  // far level: at most five skirts (the smallest, top one goes; the next one's point is carried up to the tip)
  const tiers = lod === 2 && plan.tiers.length > 5 ? plan.tiers.slice(0, 5).map((t, i, a) => (i === a.length - 1 ? { ...t, H: plan.tiers[plan.tiers.length - 1].y + plan.tiers[plan.tiers.length - 1].H - t.y } : t)) : plan.tiers;
  for (const [i, tr] of tiers.entries()) {
    const apexY = tr.y + tr.H, base = [], baseY = tr.y;
    const wind = 0.35 + 0.4 * (i / tiers.length);
    // the solid skirt: a cone from a wavy rim to an apex (a fir is stacked cones in every picture book)
    const apex = leaf.v(V(0, apexY, 0), UP, ...coreUV(0, 0.9), shade(V(0, apexY, 0)).map(x => x * 1.05), wind, tr.ph);
    for (let s = 0; s <= sides; s++) {
      const a = tr.a + (s / sides) * TAU, wav = sides > 3 ? 1 + 0.1 * Math.cos(s * 2.0) : 1.1;
      const p = az(a).multiplyScalar(tr.R * wav).setY(baseY - (sides > 3 ? 0.12 * tr.R * (s % 2) : 0));
      const n = az(a).multiplyScalar(0.8).setY(0.6).normalize();
      base.push(leaf.v(p, n, ...coreUV(Math.cos(a), Math.sin(a)), shade(p).map(x => x * 0.82), wind + 0.2, tr.ph));
    }
    for (let s = 0; s < sides; s++) leaf.tri(base[s], base[s + 1], apex);
    if (lod < 2) {
      // its dark underside (seen from below on a slope), slightly domed
      const mid = leaf.v(V(0, baseY + tr.H * 0.22, 0), V(0, -1, 0), ...coreUV(0, 0), S.leaf.map(x => x * 0.3), wind, tr.ph);
      for (let s = 0; s < sides; s++) leaf.tri(base[s + 1], base[s], mid);
    }
    // the fringe: big needle sprays from inside the skirt, pointing out and down past the rim
    for (let k = 0; k < spokes; k++) {
      const a = tr.a + ((k + 0.5) / spokes) * TAU, out = az(a);
      const dir = out.clone().setY(-0.32).normalize();
      const facing = UP.clone().addScaledVector(dir, -dir.y).normalize();
      card(leaf, { c: V(0, baseY + tr.H * 0.35, 0).addScaledVector(out, tr.R * 0.2), up: dir, facing, w: tr.R * 0.95, h: tr.R * 1.05, rows: L.cardRows, cell: cellRect(k % 3, 1), anchor: 'base', bow: 0.2,
        shade: p => shade(p).map(x => x * 1.05), normal: (p, flat) => out.clone().setY(0.7).normalize().lerp(flat, 0.2).normalize(), wind: (p, t) => wind + 0.35 * t, ph: tr.ph });
    }
  }
}

function drawFronds(leaf, plan, L, lod) {
  const S = plan.S, shade = canopyShade(S, plan.canopy, S.leaf);
  const n = lod === 2 ? 4 : lod === 1 ? Math.ceil(plan.fronds.length * 0.75) : plan.fronds.length;
  const step = plan.fronds.length / n;
  for (let k = 0; k < n; k++) {
    const f = plan.fronds[Math.floor(k * step)];
    const out = az(f.a), dir = out.clone().setY(f.lift).normalize();
    // each frond rolled a little about its own length, alternately, so some show their face to a walker at eye level
    const flatUp = UP.clone().addScaledVector(dir, -dir.y).normalize(), across = dir.clone().cross(flatUp).normalize();
    const roll = (k % 2 ? 1 : -1) * 0.5, facing = flatUp.clone().multiplyScalar(Math.cos(roll)).addScaledVector(across, Math.sin(roll)).normalize();
    const cell = cellRect(plan.form === 'palm' ? 0 : (f.col % 2 ? 3 : 0), 3);
    card(leaf, { c: f.base, up: dir, facing, w: f.len * (plan.form === 'palm' ? 0.78 : 0.62) * (lod === 2 ? 1.2 : 1), h: f.len, rows: lod === 0 ? 5 : lod === 1 ? 3 : 2, cols: lod === 0 ? 3 : 2, cell, anchor: 'base', bow: 0.25, sag: f.droop,
      shade: p => shade(p), normal: (p, flat) => flat.clone().lerp(UP, 0.45).normalize(), wind: (p, t) => 0.45 + 0.5 * t, ph: f.ph });
  }
  // a dark knot of nuts / fibre where the fronds meet (palm), level 0 and 1
  if (lod < 2 && plan.form === 'palm') puff(leaf, plan.fronds[0].base.clone().add(V(0, -0.15, 0)), S.rB * 1.4, OCTA, { sq: 0.8, seed: 3, shade: () => [0.45, 0.33, 0.2], wind: 0.3, ph: 0 });
}

/** Build one storybook tree at one detail level (0 near, 1 middle, 2 far). */
export function buildStoryTree(name, opts = {}) {
  const lod = clamp(Math.round(opts.lod || 0), 0, 2), L = STORY_LOD[lod];
  const plan = storyPlan(name, opts.seed ?? 1);
  const bark = new Buf(), leaf = new Buf();
  const rng = makeRng((opts.seed ?? 1) * 7 + lod);
  drawTrunk(bark, plan, L, rng);
  drawLimbs(bark, plan, L);
  if (plan.clumps.length) drawClumps(leaf, plan, L, lod);
  drawStrands(leaf, plan, L, lod);
  if (plan.tiers.length) drawTiers(leaf, plan, L, lod);
  if (plan.fronds.length) drawFronds(leaf, plan, L, lod);
  drawAccents(leaf, plan, L);
  const radius = Math.sqrt(Math.max(bark.maxR2, leaf.maxR2));
  return { bark: bark.geometry(), foliage: leaf.geometry(), height: Math.max(bark.maxY, leaf.maxY), radius, trunkRadius: plan.S.rB, plan, tris: { bark: bark.tris, leaf: leaf.tris } };
}
