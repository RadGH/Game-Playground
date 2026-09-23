/**
 * trees.js — the procedural vegetation kit for the high-def 3D forest experiment.
 *
 * Everything green (and brown) in the forest is built here: trees, bushes, ferns,
 * flowers, grass tufts and the junk lying on the forest floor. No files are loaded,
 * no textures are read — every builder returns plain three.js BufferGeometry that a
 * caller wraps in its own materials.
 *
 * THE CONTRACT (every geometry that leaves this file honours it)
 *   attributes, in this order:  position (3)  normal (3)  uv (2)  color (3)  aWind (2)
 *   - `color` is a linear-space multiplier. 1,1,1 = untouched. It carries baked
 *     ambient occlusion (dark at the base of a trunk, dark deep inside a canopy) plus
 *     a small per-part tint so a canopy is not one flat green. Values ABOVE 1 are
 *     used on purpose for snow (see frost_fir) — a shader can read "brighter than 1"
 *     as "there is snow here".
 *   - `aWind.x` = how much a vertex sways: 0 at the root, ~0.35 at the top of a
 *     trunk, 0.6..1.0 on leaf cards.  `aWind.y` = a phase offset 0..1 so parts do
 *     not all swing together. The caller's shader does something like
 *        pos += swayDir * sin(time * speed + aWind.y * 6.28) * aWind.x * amount
 *   - Y is up. The origin is the point that sits on the ground, centred on X/Z.
 *   - Every builder returns { bark, foliage } — two geometries (either may be null)
 *     because bark wants an opaque material and foliage wants an alpha-tested,
 *     double-sided leaf-card material.
 *   - All randomness comes from the `rng` you pass in (a 0..1 function). The same
 *     seed always gives the same plant. Math.random() is never called.
 *
 * THE LEAF ATLAS
 *   Foliage cards take their UVs from a 4x4 atlas. A ROW is a leaf kind, a COLUMN is
 *   a variant:
 *     row 0 broadleaf clusters   row 1 needle sprays   row 2 small leaves / birch   row 3 fronds / palm / grass blades
 *     cols 0..2 = three variants of the leaf cluster,  col 3 = the WHOLE-CROWN
 *     silhouette of that kind (used by the LOD 2 billboard cross).
 *   Row 0 is the BOTTOM row of the image when the texture is loaded with three's
 *   default `flipY = true` (v = 0 is the bottom edge). Flowers and berries use row 2
 *   cells tinted through the vertex colour; grass blades sample row 3 as a plain
 *   gradient (a blade has no cut-out, its shape is in the geometry).
 *
 * THE GEOMETRY TRICKS, in plain words
 *   - A trunk is a SKELETON (a list of points, each with a radius) that we then
 *     "sweep" a ring of vertices along. To keep the ring from twisting when the
 *     skeleton bends, we carry the previous ring's sideways direction forward and
 *     nudge it back to perpendicular each step ("parallel transport"). Rebuilding
 *     it from world-up every step would make the tube pinch and spin where a branch
 *     goes vertical.
 *   - Leaves are CARDS: little textured rectangles with 3x3 vertices, bowed across
 *     their width so light varies across them. Flat quads read as cardboard.
 *   - AO is baked as vertex colour: trunk base darker, cards deeper in the canopy
 *     darker (0.45 in the middle, 1.0 on the outer shell).
 *
 * Owner: Radley Sustaire. Written for three.js r186. Plain ES module, no build step.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Constants and small helpers
// ---------------------------------------------------------------------------

export const LEAF_ATLAS_COLS = 4;
export const LEAF_ATLAS_ROWS = 4;
/** Which atlas ROW each leaf kind lives on. SPECIES[id].leafKind is one of these numbers. */
export const LEAF_ROWS = { broadleaf: 0, needle: 1, small: 2, frond: 3 };
/** The atlas COLUMN reserved for the whole-crown silhouette that LOD 2 uses. */
export const LEAF_CROWN_COL = 3;

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;
const WHITE = [1, 1, 1];
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A tiny deterministic random generator (mulberry32). Same seed, same numbers.
 * Accepts a number or a string (strings are hashed first).
 */
export function makeRng(seed = 1) {
  let a;
  if (typeof seed === 'string') {
    a = 2166136261;
    for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  } else {
    a = Math.floor(seed) >>> 0;
  }
  if (a === 0) a = 0x9e3779b9; // a seed of 0 would give a dull first draw; use a constant instead
  return function rng() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The UV rectangle of one atlas cell.
 *
 * Two things are baked into this and both bite if you get them wrong. First, three.js flips a
 * canvas as it uploads it, so canvas ROW 0 — the top of the image — ends up at the TOP of the
 * texture, v = 1. Counting rows down from there means `1 - (row + 1) / rows`. Second, the cells
 * are inset by a two-pixel gutter: without it, the smaller mipmaps average a leaf together with
 * its neighbour and you get a faint ghost of the wrong sprite around every edge.
 */
const ATLAS_CELL_PX = 256;
const ATLAS_GUTTER_PX = 2;
export function cellRect(col, row) {
  const padU = ATLAS_GUTTER_PX / (LEAF_ATLAS_COLS * ATLAS_CELL_PX);
  const padV = ATLAS_GUTTER_PX / (LEAF_ATLAS_ROWS * ATLAS_CELL_PX);
  const u0 = col / LEAF_ATLAS_COLS + padU;
  const u1 = (col + 1) / LEAF_ATLAS_COLS - padU;
  const v0 = 1 - (row + 1) / LEAF_ATLAS_ROWS + padV;   // the base of the card
  const v1 = 1 - row / LEAF_ATLAS_ROWS - padV;         // the tip
  return { col, row, u0, v0, u1, v1 };
}

/** Pick one of the variant columns (0..2) on the given row, using the rng. */
export function leafCell(rng, row = 0, variants = 3) {
  const col = Math.min(LEAF_ATLAS_COLS - 1, Math.floor(rng() * variants));
  return cellRect(col, row);
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rand = (rng, a, b) => a + (b - a) * rng();
const randInt = (rng, a, b) => Math.floor(rand(rng, a, b + 0.999));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

/** A unit vector at right angles to `d` (any one will do; used to start a frame). */
function perpOf(d) {
  const helper = Math.abs(d.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const out = helper.cross(d);
  if (out.lengthSq() < 1e-8) return new THREE.Vector3(0, 0, 1);
  return out.normalize();
}

/** A random unit vector at right angles to `d`. */
function randomPerp(rng, d) {
  const n = perpOf(d);
  const b = new THREE.Vector3().crossVectors(d, n);
  const a = rng() * TWO_PI;
  return n.multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a)).normalize();
}

/** A random unit vector anywhere on the sphere. */
function randomDir(rng) {
  const z = rand(rng, -1, 1);
  const a = rng() * TWO_PI;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a));
}

/** A horizontal unit vector at a given angle. */
const azimuth = (a) => new THREE.Vector3(Math.cos(a), 0, Math.sin(a));

/** Ambient occlusion from "how deep inside the canopy" (0 = centre, 1 = outer shell). */
const aoFromDepth = (depth) => 0.45 + 0.55 * Math.pow(clamp(depth, 0, 1), 0.8);

// ---------------------------------------------------------------------------
// GeoBuffer — one growing list of vertices + triangles that becomes a geometry
// ---------------------------------------------------------------------------

/**
 * Every builder pushes vertices and triangles into one of these (one for bark,
 * one for foliage) and converts at the end. Doing it this way means every
 * geometry has exactly the five contract attributes, in order, with no merging
 * step to get wrong.
 */
class GeoBuffer {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.wind = [];
    this.idx = [];
    this.maxR2 = 0;   // furthest any vertex sits from the trunk axis (squared)
    this.maxY = 0;
  }
  get vertexCount() { return this.pos.length / 3; }
  get triangleCount() { return this.idx.length / 3; }
  vertex(x, y, z, nx, ny, nz, u, v, r, g, b, w, phase) {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(r, g, b);
    this.wind.push(w, phase);
    const r2 = x * x + z * z;
    if (r2 > this.maxR2) this.maxR2 = r2;
    if (y > this.maxY) this.maxY = y;
    return i;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  /** Returns null when nothing was added, so a bark-only plant has `foliage: null`. */
  toGeometry() {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    // The phase is a position on a circle, so a branch that accumulated 1.27 turns is the same as
    // one at 0.27 — but the contract every kit shares says 0..1, and a shader that ever clamps or
    // packs this attribute would quietly break on the ones that ran over. Wrap them here, once.
    for (let i = 1; i < this.wind.length; i += 2) {
      const ph = this.wind[i] % 1;
      this.wind[i] = ph < 0 ? ph + 1 : ph;
    }
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Skeleton curves and the tube sweep
// ---------------------------------------------------------------------------

/**
 * Build a stable sideways frame at each point of a polyline.
 * Returns [{ t, n, b }] — t along the curve, n and b at right angles to it.
 * The trick: n is carried from the previous point and only nudged back to
 * perpendicular, so the ring never spins around the tube.
 */
function buildFrames(points) {
  const n = points.length;
  const frames = [];
  let normal = null;
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(next, prev);
    if (t.lengthSq() < 1e-10) t.set(0, 1, 0); else t.normalize();
    if (!normal) {
      normal = perpOf(t);
    } else {
      // remove whatever part of the old sideways vector now points along the tube
      normal = normal.clone().addScaledVector(t, -normal.dot(t));
      if (normal.lengthSq() < 1e-6) normal = perpOf(t); else normal.normalize();
    }
    const b = new THREE.Vector3().crossVectors(t, normal);
    frames.push({ t, n: normal, b });
  }
  return frames;
}

/**
 * Sweep a ring of `sides` vertices along a skeleton and stitch the rings into a tube.
 * pts: [{ p: Vector3, r, wind, ao }]
 * o:   { sides, tint, phase, rng, lump (0..0.2 bark lumpiness), jagEnd / jagStart
 *        (metres of splinter at that end), capEnd, uRepeat, vScale, aoAt(x,y,z) }
 */
function sweepTube(buf, pts, o = {}) {
  if (pts.length < 2) return;
  const sides = Math.max(3, o.sides || 6);
  const tint = o.tint || WHITE;
  const phase = o.phase || 0;
  const rng = o.rng;
  const lump = o.lump || 0;
  const frames = buildFrames(pts.map((q) => q.p));
  const circ = TWO_PI * Math.max(pts[0].r, 0.03); // v repeats about once per circumference so bark looks square
  const vScale = o.vScale || 1;
  const uRepeat = o.uRepeat || 1;
  const rings = [];
  const out = new THREE.Vector3();
  let arc = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    const f = frames[i];
    if (i > 0) arc += q.p.distanceTo(pts[i - 1].p);
    const v = (arc / circ) * vScale;
    const isEnd = i === pts.length - 1;
    const jag = isEnd ? (o.jagEnd || 0) : i === 0 ? (o.jagStart || 0) : 0;
    const bumps = [];
    const splinters = [];
    for (let s = 0; s < sides; s++) {
      bumps.push(lump && rng ? 1 + (rng() - 0.5) * 2 * lump : 1);
      splinters.push(jag && rng ? rng() * jag : 0);
    }
    const ring = [];
    for (let s = 0; s <= sides; s++) {           // sides + 1 so the seam vertex can carry u = 1
      const k = s % sides;
      const a = (s / sides) * TWO_PI;
      const c = Math.cos(a), sn = Math.sin(a);
      out.set(f.n.x * c + f.b.x * sn, f.n.y * c + f.b.y * sn, f.n.z * c + f.b.z * sn);
      let r = q.r * bumps[k];
      if (jag) r *= 0.75 + (rng ? rng() * 0.5 : 0.25); // a broken end is ragged in radius too
      const push = splinters[k] * (isEnd ? 1 : -1);      // splinters stick out past the end
      const px = q.p.x + out.x * r + f.t.x * push;
      const py = q.p.y + out.y * r + f.t.y * push;
      const pz = q.p.z + out.z * r + f.t.z * push;
      let ao = q.ao == null ? 1 : q.ao;
      if (o.aoAt) ao *= o.aoAt(px, py, pz);
      ring.push(buf.vertex(px, py, pz, out.x, out.y, out.z, (s / sides) * uRepeat, v,
        tint[0] * ao, tint[1] * ao, tint[2] * ao, q.wind || 0, phase));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      buf.quad(rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s]);
    }
  }
  if (o.capEnd) {
    const q = pts[pts.length - 1];
    const f = frames[frames.length - 1];
    const ao = (q.ao == null ? 1 : q.ao) * (o.capAo == null ? 1 : o.capAo);
    const cIdx = buf.vertex(q.p.x, q.p.y, q.p.z, f.t.x, f.t.y, f.t.z, 0.5, 0.5,
      tint[0] * ao, tint[1] * ao, tint[2] * ao, q.wind || 0, phase);
    const ring = rings[rings.length - 1];
    for (let s = 0; s < sides; s++) buf.tri(ring[s], ring[s + 1], cIdx);
  }
}

/**
 * Grow a trunk skeleton: straight up with a slight lean, a gentle S-curve and a
 * random wobble, radius tapering fast near the ground and slowly higher up, with
 * a flare at the base. The first point sits a little below y = 0 so the flare never
 * floats on a slope.
 */
function growTrunk(rng, h, rBase, rTop, segs, o = {}) {
  const leanAng = rand(rng, 0, o.lean || 0);
  const leanAz = rng() * TWO_PI;
  const leanX = Math.cos(leanAz) * Math.tan(leanAng);
  const leanZ = Math.sin(leanAz) * Math.tan(leanAng);
  const sAz = rng() * TWO_PI;
  const sAmp = h * (o.sCurve || 0) * rand(rng, 0.4, 1);
  const sX = Math.cos(sAz) * sAmp, sZ = Math.sin(sAz) * sAmp;
  const wobble = o.wobble || 0;
  const taper = o.taper == null ? 1.7 : o.taper;
  const windTop = o.windTop == null ? 0.35 : o.windTop;
  const aoBase = o.aoBase == null ? 0.55 : o.aoBase;
  let wx = 0, wz = 0;
  const pts = [{ p: new THREE.Vector3(0, -(o.sink == null ? 0.25 : o.sink), 0), r: 0, wind: 0, ao: aoBase * 0.9 }];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = h * t;
    const s = Math.sin(t * TWO_PI) * t; // zero at the base; an S that grows with height
    if (i > 0) { wx += (rng() - 0.5) * wobble * h / segs; wz += (rng() - 0.5) * wobble * h / segs; }
    const p = new THREE.Vector3(leanX * y + sX * s + wx, y, leanZ * y + sZ * s + wz);
    let r = rTop + (rBase - rTop) * Math.pow(1 - t, taper);
    r *= 1 + (o.flare || 0) * Math.exp(-y / (rBase * 1.5));
    pts.push({
      p, r,
      wind: windTop * Math.pow(t, 1.6),
      ao: lerp(aoBase, 1, smooth(clamp(t / 0.45, 0, 1))),
    });
  }
  pts[0].r = pts[1].r * 1.04;
  return pts;
}

/**
 * Grow a branch skeleton from `start` along `dir`. `droop` bends it toward the
 * ground over its length (negative lifts it), `wiggle` adds a random wander.
 */
function growBranch(rng, start, dir, len, r0, r1, segs, o = {}) {
  const d = dir.clone().normalize();
  const step = len / Math.max(1, segs);
  const droop = o.droop || 0;
  const wiggle = o.wiggle || 0;
  const taper = o.taper == null ? 1.2 : o.taper;
  const pts = [{ p: start.clone(), r: r0, wind: o.wind0 || 0, ao: o.ao0 == null ? 1 : o.ao0 }];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    d.y -= droop / segs;
    if (wiggle) d.addScaledVector(randomPerp(rng, d), wiggle / segs);
    d.normalize();
    const p = pts[i - 1].p.clone().addScaledVector(d, step);
    pts.push({
      p,
      r: r1 + (r0 - r1) * Math.pow(1 - t, taper),
      wind: lerp(o.wind0 || 0, o.wind1 == null ? (o.wind0 || 0) : o.wind1, t),
      ao: lerp(o.ao0 == null ? 1 : o.ao0, o.ao1 == null ? 1 : o.ao1, t),
    });
  }
  return { pts, endDir: d };
}

/** Sample a skeleton at 0..1: position, radius, wind, ao, and the local frame. */
function curveAt(pts, frames, t) {
  const n = pts.length;
  const x = clamp(t, 0, 1) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  const a = pts[i], b = pts[i + 1];
  const p = a.p.clone().lerp(b.p, f);
  const fa = frames[i], fb = frames[i + 1];
  const tv = fa.t.clone().lerp(fb.t, f).normalize();
  let nv = fa.n.clone().lerp(fb.n, f);
  nv.addScaledVector(tv, -nv.dot(tv));
  if (nv.lengthSq() < 1e-6) nv = perpOf(tv); else nv.normalize();
  const bv = new THREE.Vector3().crossVectors(tv, nv);
  return {
    p, t: tv, n: nv, b: bv,
    r: lerp(a.r, b.r, f),
    wind: lerp(a.wind || 0, b.wind || 0, f),
    ao: lerp(a.ao == null ? 1 : a.ao, b.ao == null ? 1 : b.ao, f),
  };
}

/**
 * How many sides a tube gets, from its radius: a thick trunk needs a round ring,
 * a finger-thick twig reads fine with four. LOD 1 is one notch cheaper.
 */
function sidesFor(r, lod) {
  if (lod === 0) return r >= 0.3 ? 9 : r >= 0.12 ? 7 : r >= 0.05 ? 5 : 4;
  return r >= 0.3 ? 6 : r >= 0.1 ? 5 : 4;
}

/** Direction from a frame: `pitch` radians off the tube axis, at azimuth `az` around it. */
function dirFromFrame(f, pitch, az) {
  return f.t.clone().multiplyScalar(Math.cos(pitch))
    .addScaledVector(f.n, Math.sin(pitch) * Math.cos(az))
    .addScaledVector(f.b, Math.sin(pitch) * Math.sin(az))
    .normalize();
}

// ---------------------------------------------------------------------------
// Strips and cards — the foliage primitives
// ---------------------------------------------------------------------------

/**
 * A strip of quads along a spine, `cols` vertices wide (2 = flat blade, 3 = bowed card).
 * spine: [{ p: Vector3, hw: half width, wind, ao }]
 * side:  the unit vector across the strip
 * o:     { cell, cols, bow, color, phase, shadeNormal, shadeMix }
 * With cols = 3 the middle column is pushed out by `bow * halfwidth`, so the card
 * curves across its width and its normals fan out — the cheap trick that stops a
 * leaf card looking like flat cardboard.
 */
function addStrip(buf, spine, side, o = {}) {
  const rows = spine.length;
  if (rows < 2) return;
  const cols = o.cols || 3;
  const cell = o.cell || cellRect(0, 0);
  const tint = o.color || WHITE;
  const bow = o.bow || 0;
  const phase = o.phase || 0;
  const shade = o.shadeNormal || null;
  const shadeMix = o.shadeMix == null ? 0 : o.shadeMix;
  const along = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const vn = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const grid = [];
  for (let i = 0; i < rows; i++) {
    const q = spine[i];
    const prev = spine[Math.max(0, i - 1)].p;
    const next = spine[Math.min(rows - 1, i + 1)].p;
    along.subVectors(next, prev);
    if (along.lengthSq() < 1e-10) along.set(0, 1, 0); else along.normalize();
    nrm.crossVectors(side, along);
    if (nrm.lengthSq() < 1e-8) nrm.copy(perpOf(along)); else nrm.normalize();
    const ao = q.ao == null ? 1 : q.ao;
    const row = [];
    for (let c = 0; c < cols; c++) {
      const off = cols === 1 ? 0 : (c / (cols - 1)) * 2 - 1; // -1 .. +1 across the strip
      const bulge = bow * (1 - off * off) * q.hw;
      pos.copy(q.p).addScaledVector(side, q.hw * off).addScaledVector(nrm, bulge);
      vn.copy(nrm).addScaledVector(side, 2 * bow * off).normalize();
      if (shade) vn.lerp(shade, shadeMix).normalize();
      const u = cell.u0 + ((off + 1) / 2) * (cell.u1 - cell.u0);
      const v = cell.v0 + (i / (rows - 1)) * (cell.v1 - cell.v0);
      row.push(buf.vertex(pos.x, pos.y, pos.z, vn.x, vn.y, vn.z, u, v,
        tint[0] * ao, tint[1] * ao, tint[2] * ao, q.wind || 0, phase));
    }
    grid.push(row);
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let c = 0; c < cols - 1; c++) {
      buf.quad(grid[i][c], grid[i][c + 1], grid[i + 1][c + 1], grid[i + 1][c]);
    }
  }
}

/**
 * One leaf card. `up` is the direction the card's length runs, `facing` its normal.
 * o: { origin, up, facing, width, height, anchor ('centre' | 'base'), rows, cols,
 *      sag (tip droops toward the ground by sag * height), arch (bends along facing),
 *      widthProfile(t), wind0, wind1, ao, ... plus everything addStrip takes }
 */
function addCard(buf, o) {
  const rows = o.rows || 3;
  const up = o.up.clone().normalize();
  const facing = o.facing.clone().normalize();
  const side = new THREE.Vector3().crossVectors(up, facing);
  if (side.lengthSq() < 1e-8) side.copy(perpOf(up)); else side.normalize();
  const h = o.height, w = o.width;
  const base = o.anchor === 'base' ? 0 : -h / 2;
  const spine = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const p = o.origin.clone().addScaledVector(up, base + h * t);
    if (o.sag) p.y -= o.sag * h * t * t;
    if (o.arch) p.addScaledVector(facing, o.arch * h * Math.sin(t * Math.PI));
    const wt = o.widthProfile ? o.widthProfile(t) : 1;
    spine.push({
      p, hw: (w / 2) * wt,
      wind: lerp(o.wind0 == null ? 0.6 : o.wind0, o.wind1 == null ? 1 : o.wind1, t),
      ao: o.ao == null ? 1 : o.ao,
    });
  }
  addStrip(buf, spine, side, o);
}

/**
 * Turn a normal into a card orientation: `up` is the direction closest to world-up
 * that is still at right angles to `facing`, then rolled around `facing` by `roll`.
 */
function cardFrame(facing, roll) {
  const f = facing.clone().normalize();
  let up = UP.clone().addScaledVector(f, -UP.dot(f));
  if (up.lengthSq() < 1e-6) up = perpOf(f); else up.normalize();
  if (roll) up.applyAxisAngle(f, roll);
  return { facing: f, up };
}

/** A flat cross of 2 or 3 quads (LOD 2 crowns, bush billboards, berries). */
function addCross(buf, o) {
  const count = o.count || 3;
  const a0 = o.rng ? o.rng() * Math.PI : 0;
  for (let k = 0; k < count; k++) {
    const a = a0 + (k / count) * Math.PI;
    const facing = azimuth(a + Math.PI / 2);
    addCard(buf, {
      origin: o.origin, up: UP, facing, width: o.width, height: o.height,
      anchor: o.anchor || 'base', rows: 2, cols: 2, cell: o.cell, color: o.color,
      wind0: o.wind0, wind1: o.wind1, phase: o.phase, shadeNormal: o.shadeNormal, shadeMix: o.shadeMix,
    });
  }
}

// ---------------------------------------------------------------------------
// The card queue — cards are collected, then placed once the canopy is known
// ---------------------------------------------------------------------------

/**
 * Builders push card REQUESTS while growing branches; we only know where the
 * canopy centre is once every branch exists. `emitCards` then computes each
 * card's depth (for AO) and, for `mode: 'canopy'` cards, points it outward and
 * slightly upward from the centre with a random roll.
 */
function emitCards(ctx) {
  const cards = ctx.cards;
  if (!cards.length) return;
  const rng = ctx.rng;
  const centre = new THREE.Vector3();
  for (const c of cards) centre.add(c.origin);
  centre.divideScalar(cards.length);
  if (ctx.canopyCentre) centre.copy(ctx.canopyCentre);
  let radius = 0.5;
  for (const c of cards) radius = Math.max(radius, c.origin.distanceTo(centre));
  ctx.canopyRadius = radius;
  const out = new THREE.Vector3();
  for (const c of cards) {
    out.subVectors(c.origin, centre);
    const d = out.length();
    if (d < 1e-4) out.copy(randomDir(rng)); else out.divideScalar(d);
    const depth = c.depth == null ? d / radius : c.depth;
    const ao = aoFromDepth(depth);
    const vary = rand(rng, 0.88, 1.12);
    const tint = c.color || ctx.leafTint || WHITE;
    const color = [tint[0] * vary * ao, tint[1] * vary * ao, tint[2] * vary * ao];
    let facing = c.facing, up = c.up;
    if (c.mode === 'canopy') {
      const f = out.clone().addScaledVector(UP, 0.35).addScaledVector(randomDir(rng), 0.35).normalize();
      const fr = cardFrame(f, rng() * TWO_PI);
      facing = fr.facing; up = fr.up;
    }
    // Normals lean toward "outward from the canopy" so the whole crown shades like
    // one rounded mass instead of a pile of separately lit rectangles.
    const shade = out.clone().addScaledVector(UP, 0.4).normalize();
    addCard(ctx.foliage, {
      origin: c.origin, up, facing, width: c.width, height: c.height,
      anchor: c.anchor || 'centre', rows: c.rows || 3, cols: c.cols || 3,
      cell: c.cell, color, bow: c.bow == null ? 0.22 : c.bow, sag: c.sag || 0, arch: c.arch || 0,
      widthProfile: c.widthProfile, wind0: c.wind0, wind1: c.wind1, phase: c.phase,
      shadeNormal: shade, shadeMix: c.shadeMix == null ? 0.55 : c.shadeMix,
    });
  }
  ctx.cards = [];
}

// ---------------------------------------------------------------------------
// Species and their build parameters
// ---------------------------------------------------------------------------

/**
 * The player-facing table. `label` is an invented name (nothing borrowed).
 * `leafKind` is the atlas row. Colours are hex strings for the caller's materials.
 * Extra build knobs live in PARAMS below so this table stays readable.
 */
export const SPECIES = {
  pine:        { label: 'Tallcrown Pine',   minHeight: 12,  maxHeight: 22, trunkColor: '#5c4633', leafColor: '#2f5a2e', leafKind: LEAF_ROWS.needle,    biomes: ['taiga', 'highland', 'temperate'] },
  fir:         { label: 'Greenspire Fir',   minHeight: 10,  maxHeight: 20, trunkColor: '#4e3d2f', leafColor: '#264d2c', leafKind: LEAF_ROWS.needle,    biomes: ['taiga', 'highland', 'alpine'] },
  spruce:      { label: 'Needlewatch Spruce', minHeight: 12, maxHeight: 24, trunkColor: '#55402f', leafColor: '#22432a', leafKind: LEAF_ROWS.needle,    biomes: ['taiga', 'alpine', 'bog'] },
  birch:       { label: 'Paleveil Birch',   minHeight: 8,   maxHeight: 16, trunkColor: '#d9d5c8', leafColor: '#6f9a3a', leafKind: LEAF_ROWS.small,     biomes: ['temperate', 'taiga', 'meadow'] },
  oak:         { label: 'Broadhall Oak',    minHeight: 9,   maxHeight: 16, trunkColor: '#5a4632', leafColor: '#3f6b2a', leafKind: LEAF_ROWS.broadleaf, biomes: ['temperate', 'meadow', 'lowland'] },
  beech:       { label: 'Silvergrey Beech', minHeight: 10,  maxHeight: 18, trunkColor: '#8c8578', leafColor: '#4a7a2e', leafKind: LEAF_ROWS.broadleaf, biomes: ['temperate', 'highland'] },
  willow:      { label: 'Weeping Riverwillow', minHeight: 7, maxHeight: 12, trunkColor: '#6b5a44', leafColor: '#7c9c48', leafKind: LEAF_ROWS.small,     biomes: ['riverbank', 'bog', 'lowland'] },
  ancient_oak: { label: 'Elder Broadhall',  minHeight: 24,  maxHeight: 30, trunkColor: '#4d3a2a', leafColor: '#3a6428', leafKind: LEAF_ROWS.broadleaf, biomes: ['temperate', 'lowland', 'landmark'] },
  dead_pine:   { label: 'Ashen Pine',       minHeight: 10,  maxHeight: 18, trunkColor: '#6e6a63', leafColor: '#000000', leafKind: LEAF_ROWS.needle,    biomes: ['taiga', 'burnt', 'bog'] },
  dead_snag:   { label: 'Hollow Snag',      minHeight: 4,   maxHeight: 9,  trunkColor: '#5f5a52', leafColor: '#000000', leafKind: LEAF_ROWS.broadleaf, biomes: ['temperate', 'bog', 'burnt'] },
  stump:       { label: 'Old Stump',        minHeight: 0.4, maxHeight: 1.2, trunkColor: '#5a4632', leafColor: '#000000', leafKind: LEAF_ROWS.broadleaf, biomes: ['temperate', 'taiga', 'meadow'] },
  sapling:     { label: 'Young Broadhall',  minHeight: 1.5, maxHeight: 3,  trunkColor: '#6a5540', leafColor: '#5c8f34', leafKind: LEAF_ROWS.broadleaf, biomes: ['temperate', 'meadow', 'lowland'] },
  palm_fan:    { label: 'Shorefan Palm',    minHeight: 6,   maxHeight: 12, trunkColor: '#8a7355', leafColor: '#4f8a3a', leafKind: LEAF_ROWS.frond,     biomes: ['warm_shore', 'tropical'] },
  frost_fir:   { label: 'Rimewatch Fir',    minHeight: 8,   maxHeight: 16, trunkColor: '#4a3c31', leafColor: '#2b4a35', leafKind: LEAF_ROWS.needle,    biomes: ['alpine', 'tundra', 'taiga'] },
};

/**
 * Build knobs per species. Angles in degrees, lengths as fractions of the tree
 * height unless said otherwise. `kind` picks the builder.
 */
const PARAMS = {
  pine: {
    kind: 'conifer', trunkDiv: 28, crownStart: 0.42, crownRadius: 0.24, profile: 'round',
    whorls: [7, 11], perWhorl: [4, 6], pitch: [78, 98], droop: 0.35, whorlBias: 0.85,
    sprays: [3, 5], sprayLen: [0.7, 1.1], sprayWidth: [0.35, 0.55], sprayDroop: 0.35, lean: 5, sCurve: 0.014, foliage: true,
  },
  fir: {
    kind: 'conifer', trunkDiv: 28, crownStart: 0.16, crownRadius: 0.2, profile: 'cone', coneExp: 0.9,
    whorls: [10, 14], perWhorl: [5, 7], pitch: [85, 100], droop: 0.45, whorlBias: 0.9,
    sprays: [3, 5], sprayLen: [0.55, 0.9], sprayWidth: [0.3, 0.45], sprayDroop: 0.5, lean: 3, sCurve: 0.008, foliage: true,
  },
  spruce: {
    kind: 'conifer', trunkDiv: 28, crownStart: 0.1, crownRadius: 0.16, profile: 'cone', coneExp: 1.0,
    whorls: [11, 14], perWhorl: [5, 7], pitch: [95, 112], droop: 0.7, whorlBias: 0.9,
    sprays: [3, 5], sprayLen: [0.6, 1.0], sprayWidth: [0.25, 0.4], sprayDroop: 0.8, lean: 3, sCurve: 0.006, foliage: true,
  },
  frost_fir: {
    kind: 'conifer', trunkDiv: 28, crownStart: 0.14, crownRadius: 0.21, profile: 'cone', coneExp: 0.85,
    whorls: [9, 12], perWhorl: [5, 6], pitch: [90, 105], droop: 0.6, whorlBias: 0.9,
    sprays: [3, 4], sprayLen: [0.55, 0.9], sprayWidth: [0.32, 0.48], sprayDroop: 0.6, lean: 3, sCurve: 0.008, foliage: true,
    snow: true, leafTint: [0.88, 0.96, 1.08],
  },
  dead_pine: {
    kind: 'conifer', trunkDiv: 26, crownStart: 0.35, crownRadius: 0.16, profile: 'round',
    whorls: [6, 9], perWhorl: [3, 5], pitch: [80, 100], droop: 0.5, whorlBias: 0.9,
    foliage: false, keep: 0.6, lean: 7, sCurve: 0.02, barkTint: [0.82, 0.8, 0.78], lump: 0.08,
  },
  oak: {
    kind: 'broadleaf', trunkDiv: 18, trunkFrac: 0.42, primaries: [3, 5], pitch: [35, 60], forkStart: 0.6,
    depth: 3, forks: [2, 3], forkAngle: [25, 50], lenFall: 0.66, rFall: 0.62, droop: [0.05, 0.1, 0.15], upBias: 0.25,
    branchLen: 0.95, leafSize: 1.5, roots: [4, 6], lean: 4, sCurve: 0.02,
  },
  beech: {
    kind: 'broadleaf', trunkDiv: 20, trunkFrac: 0.55, primaries: [3, 5], pitch: [20, 42], forkStart: 0.55,
    depth: 3, forks: [2, 3], forkAngle: [20, 40], lenFall: 0.68, rFall: 0.62, droop: [0.0, 0.05, 0.12], upBias: 0.3,
    branchLen: 1.0, leafSize: 1.35, roots: [4, 6], lean: 3, sCurve: 0.012, barkTint: [1.04, 1.03, 1.0],
  },
  birch: {
    kind: 'broadleaf', trunkDiv: 26, trunkFrac: 0.5, primaries: [3, 5], pitch: [22, 40], forkStart: 0.45,
    depth: 3, forks: [2, 3], forkAngle: [20, 45], lenFall: 0.66, rFall: 0.6, droop: [0.0, 0.25, 0.55], upBias: 0.15,
    branchLen: 1.0, leafSize: 1.0, roots: [3, 4], lean: 6, sCurve: 0.025, barkTint: [1.05, 1.05, 1.02], lump: 0.03,
  },
  willow: {
    kind: 'broadleaf', trunkDiv: 16, trunkFrac: 0.35, primaries: [4, 6], pitch: [45, 70], forkStart: 0.5,
    depth: 3, forks: [2, 3], forkAngle: [25, 50], lenFall: 0.7, rFall: 0.62, droop: [0.15, 0.6, 1.0], upBias: 0.1,
    branchLen: 1.05, leafSize: 0.9, roots: [4, 6], lean: 8, sCurve: 0.03, weeping: true,
  },
  ancient_oak: {
    kind: 'broadleaf', trunkDiv: 13, trunkFrac: 0.38, primaries: [5, 7], pitch: [38, 65], forkStart: 0.55,
    depth: 3, forks: [2, 3], forkAngle: [25, 50], lenFall: 0.66, rFall: 0.62, droop: [0.08, 0.1, 0.15], upBias: 0.25,
    branchLen: 0.95, leafSize: 1.8, roots: [5, 7], buttress: true, lean: 3, sCurve: 0.012, lump: 0.06, trunkSides: 12,
  },
  sapling: {
    kind: 'broadleaf', trunkDiv: 40, trunkFrac: 0.5, primaries: [2, 3], pitch: [25, 50], forkStart: 0.5,
    depth: 2, forks: [2, 2], forkAngle: [25, 45], lenFall: 0.7, rFall: 0.6, droop: [0.05, 0.1, 0.1], upBias: 0.3,
    branchLen: 1.0, leafSize: 0.45, roots: null, lean: 8, sCurve: 0.03, flare: 0.1,
  },
  dead_snag: { kind: 'snag', trunkDiv: 18, stubs: [2, 4], barkTint: [0.8, 0.78, 0.75], lump: 0.1 },
  stump: { kind: 'stump', radiusOfHeight: 0.42, roots: [4, 6], lump: 0.06 },
  palm_fan: { kind: 'palm', trunkDiv: 30, fronds: [9, 14], frondLen: [0.28, 0.36], frondWidth: [0.5, 0.7], lean: 20 },
};

// ---------------------------------------------------------------------------
// Tree builders
// ---------------------------------------------------------------------------

/** Shared root builder. Buttresses (ancient_oak) start higher and run longer. */
function addRoots(ctx, rBase, count, o = {}) {
  const { rng, lod } = ctx;
  if (lod >= 2 || count <= 0) return;
  const sides = lod === 0 ? 5 : 4;
  const segs = lod === 0 ? 4 : 3;
  const az0 = rng() * TWO_PI;
  for (let k = 0; k < count; k++) {
    const az = az0 + (k / count) * TWO_PI + (rng() - 0.5) * 0.5;
    const out = azimuth(az);
    const start = out.clone().multiplyScalar(rBase * 0.55).addScaledVector(UP, rBase * (o.startHeight == null ? 0.5 : o.startHeight));
    const dir = out.clone().addScaledVector(UP, -(o.dive == null ? 0.45 : o.dive)).normalize();
    const len = rBase * rand(rng, o.len ? o.len[0] : 2.2, o.len ? o.len[1] : 3.5);
    const r0 = rBase * (o.thick == null ? 0.42 : o.thick);
    const br = growBranch(rng, start, dir, len, r0, r0 * 0.15, segs,
      { droop: 0.9, wiggle: 0.3, wind0: 0, wind1: 0, ao0: 0.5, ao1: 0.7, taper: 1.3 });
    // the last point must be underground so the root never floats on uneven terrain
    const last = br.pts[br.pts.length - 1];
    if (last.p.y > -0.25) last.p.y = -0.25;
    sweepTube(ctx.bark, br.pts, { sides, tint: ctx.barkTint, phase: 0, rng, lump: 0.05 });
  }
}

/**
 * Conifers: a tall trunk with whorls (rings) of short drooping branches, densest
 * in the upper part of the crown, and long thin needle sprays along each branch.
 *
 * Triangle budget, measured over five seeds (lod 0 / 1 / 2): pine ~3,500 (max 4,200) /
 * ~1,000 / 22; fir ~5,300 / ~1,400 / 22; spruce ~5,400 (max 5,600) / ~1,400 / 22;
 * frost_fir ~5,000 (max 5,800, the snow layer is flat cards) / ~1,400 / 22; dead_pine ~1,000 / ~500 / 28.
 */
function buildConifer(ctx, P) {
  const { rng, lod, height: h } = ctx;
  const rBase = h / P.trunkDiv;
  if (lod === 2) return buildLod2(ctx, P, rBase, { bottom: h * P.crownStart, radius: h * P.crownRadius * 0.9, dead: !P.foliage });
  const segs = lod === 0 ? 14 : 9;
  const sides = lod === 0 ? 8 : 6;
  const trunk = growTrunk(rng, h, rBase, rBase * 0.05, segs,
    { lean: (P.lean || 3) * DEG, sCurve: P.sCurve, flare: 0.35, windTop: 0.35, aoBase: 0.55, taper: 1.7, wobble: 0.01 });
  const trunkPhase = rng();
  sweepTube(ctx.bark, trunk, { sides, tint: ctx.barkTint, phase: trunkPhase, rng, lump: P.lump || 0.04, capEnd: true });
  if (h > 8) addRoots(ctx, rBase, randInt(rng, 4, 6), { len: [2, 3] });

  const frames = buildFrames(trunk.map((q) => q.p));
  const crownR = h * P.crownRadius;
  let whorls = randInt(rng, P.whorls[0], P.whorls[1]);
  if (lod === 1) whorls = Math.ceil(whorls * 0.6);
  const maxBranches = lod === 0 ? 72 : 30;
  let branches = 0;
  const bSegs = lod === 0 ? 4 : 3;
  const bSides = lod === 0 ? 5 : 4;
  const crownTop = 0.96;
  for (let w = 0; w < whorls && branches < maxBranches; w++) {
    // whorlBias < 1 packs the whorls toward the top of the crown
    const tc = whorls === 1 ? 0.5 : Math.pow(w / (whorls - 1), P.whorlBias || 1) * 0.94;
    const t = lerp(P.crownStart, crownTop, tc);
    const s = curveAt(trunk, frames, t);
    let n = randInt(rng, P.perWhorl[0], P.perWhorl[1]);
    if (lod === 1) n = Math.max(3, n - 2);
    const az0 = rng() * TWO_PI;
    let lenFactor;
    if (P.profile === 'cone') lenFactor = Math.pow(1 - tc, P.coneExp || 1);
    else lenFactor = Math.pow(1 - tc, 0.5) * (0.55 + 0.45 * Math.sin(tc * Math.PI)); // umbrella: longest mid-crown
    const lenHere = crownR * lenFactor + h * 0.02;
    for (let k = 0; k < n && branches < maxBranches; k++) {
      if (P.keep != null && rng() > P.keep) continue; // dead trees have lost some branches
      branches++;
      const az = az0 + (k / n) * TWO_PI + (rng() - 0.5) * 0.5;
      const pitch = rand(rng, P.pitch[0], P.pitch[1]) * DEG * (1 - tc * 0.3);
      const dir = dirFromFrame(s, pitch, az);
      const len = lenHere * rand(rng, 0.8, 1.15) * (P.keep != null ? rand(rng, 0.4, 0.9) : 1);
      const r0 = clamp(Math.min(s.r * 0.35, len * 0.035), 0.015, 0.2);
      const phase = rng();
      const br = growBranch(rng, s.p, dir, len, r0, r0 * 0.2, bSegs,
        { droop: P.droop, wiggle: 0.25, wind0: s.wind, wind1: Math.min(0.55, s.wind + 0.25), ao0: 0.6, ao1: 0.95, taper: 1.2 });
      sweepTube(ctx.bark, br.pts, { sides: Math.min(bSides, sidesFor(r0, lod)), tint: ctx.barkTint, phase, rng, jagEnd: P.keep != null ? r0 * 0.6 : 0 });
      if (P.foliage) addSprays(ctx, P, br.pts, len, crownR, phase, lod);
    }
  }
  // the leader: one or two sprays pointing up from the very tip
  if (P.foliage) {
    const tip = trunk[trunk.length - 1];
    const count = lod === 0 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const dir = UP.clone().addScaledVector(randomDir(rng), 0.3).normalize();
      const fr = cardFrame(perpOf(dir), rng() * TWO_PI);
      const len = rand(rng, P.sprayLen[0], P.sprayLen[1]) * 0.8;
      ctx.cards.push({
        origin: tip.p.clone(), up: dir, facing: fr.facing, mode: 'fixed', anchor: 'base',
        width: rand(rng, P.sprayWidth[0], P.sprayWidth[1]) * 0.8, height: len, cell: leafCell(rng, P.leafRow == null ? LEAF_ROWS.needle : P.leafRow),
        depth: 1, wind0: 0.6, wind1: rand(rng, 0.85, 1), phase: trunkPhase, sag: 0.15,
      });
    }
  }
  ctx.canopyCentre = new THREE.Vector3(0, h * lerp(P.crownStart, 1, 0.5), 0);
  return { trunkRadius: rBase };
}

/**
 * Needle sprays along a conifer branch: several long thin cards leaving the branch
 * to alternate sides and drooping, plus one along the tip.
 */
function addSprays(ctx, P, pts, len, crownR, phase, lod) {
  const rng = ctx.rng;
  const row = LEAF_ROWS.needle;
  const count = lod === 0 ? randInt(rng, P.sprays[0], P.sprays[1]) : 2;
  const sizeScale = clamp(len / (crownR * 0.7), 0.55, 1.25) * (lod === 1 ? 1.5 : 1);
  const frames = buildFrames(pts.map((q) => q.p));
  const flipStart = rng() < 0.5 ? 1 : -1;
  for (let k = 0; k < count; k++) {
    const t = count === 1 ? 1 : lerp(0.35, 1.0, k / (count - 1));
    const s = curveAt(pts, frames, t);
    const sideSign = flipStart * (k % 2 === 0 ? 1 : -1);
    let dir;
    if (t >= 0.99) {
      dir = s.t.clone(); // the tip spray continues the branch
    } else {
      dir = s.t.clone().addScaledVector(s.n, sideSign * 0.6).addScaledVector(s.b, (rng() - 0.5) * 0.4);
    }
    dir.addScaledVector(UP, -P.sprayDroop * 0.5).normalize();
    // the card plane is mostly horizontal (what a spray looks like from the side and above), with some roll
    const fr = cardFrame(UP.clone().addScaledVector(randomDir(rng), 0.45).normalize(), 0);
    let facing = fr.facing.clone().addScaledVector(dir, -fr.facing.dot(dir));
    if (facing.lengthSq() < 1e-6) facing = perpOf(dir); else facing.normalize();
    facing.applyAxisAngle(dir, (rng() - 0.5) * 70 * DEG);
    const width = rand(rng, P.sprayWidth[0], P.sprayWidth[1]) * sizeScale;
    const height = rand(rng, P.sprayLen[0], P.sprayLen[1]) * sizeScale;
    const depth = lerp(0.15, 1, t); // near the trunk = deep in the canopy
    const cell = leafCell(rng, row);
    ctx.cards.push({
      origin: s.p.clone(), up: dir, facing, mode: 'fixed', anchor: 'base', width, height, cell,
      depth, wind0: 0.6, wind1: rand(rng, 0.8, 1), phase: phase + rng() * 0.1, sag: P.sprayDroop * 0.4, bow: 0.18,
    });
    if (P.snow && facing.y > 0.25) {
      // a paler card a hair above the spray: snow resting on the needles. Colour > 1
      // is the signal a shader can use to whiten it further. Flat (2 columns) to
      // keep the snow layer at half the cost of the sprays under it.
      ctx.cards.push({
        origin: s.p.clone().addScaledVector(UP, 0.05), up: dir, facing, mode: 'fixed', anchor: 'base', cols: 2,
        width: width * 0.92, height: height * 0.95, cell, depth: Math.max(depth, 0.7),
        wind0: 0.6, wind1: rand(rng, 0.8, 1), phase: phase + rng() * 0.1, sag: P.sprayDroop * 0.4, bow: 0.18,
        color: [1.7, 1.75, 1.9],
      });
    }
  }
}

/**
 * Broadleaves: a shorter trunk, a few big primary branches that fork twice more and
 * spread wide, with leaf-cluster cards carried on the outer third of each terminal
 * branch. Willows add hanging chains of cards below every tip.
 *
 * Triangle budget, measured over five seeds (lod 0 / 1 / 2): oak ~2,300 (max 2,900) / ~800 / 22;
 * beech ~2,400 / ~840 / 22; birch ~2,300 / ~780 / 22; willow ~3,700 (max 4,000) / ~1,150 / 22;
 * ancient_oak ~5,000 (max 6,000) / ~1,300 / 22; sapling ~500 / ~350 / 22.
 */
function buildBroadleaf(ctx, P) {
  const { rng, lod, height: h } = ctx;
  const rBase = h / P.trunkDiv;
  const trunkH = h * P.trunkFrac;
  if (lod === 2) return buildLod2(ctx, P, rBase, { bottom: trunkH * 0.8, radius: (h - trunkH) * 0.85 });
  const segs = lod === 0 ? 10 : 6;
  const sides = lod === 0 && P.trunkSides ? P.trunkSides : sidesFor(rBase, lod);
  const trunk = growTrunk(rng, trunkH, rBase, rBase * 0.45, segs,
    { lean: (P.lean || 3) * DEG, sCurve: P.sCurve, flare: P.flare == null ? 0.4 : P.flare, windTop: 0.2, aoBase: 0.5, taper: 1.5, wobble: 0.02 });
  const trunkPhase = rng();
  sweepTube(ctx.bark, trunk, { sides, tint: ctx.barkTint, phase: trunkPhase, rng, lump: P.lump || 0.04, capEnd: true });
  if (P.roots) {
    addRoots(ctx, rBase, randInt(rng, P.roots[0], P.roots[1]),
      P.buttress ? { startHeight: 1.6, len: [3.2, 4.5], thick: 0.5, dive: 0.5 } : { len: [2.2, 3.4] });
  }
  const frames = buildFrames(trunk.map((q) => q.p));
  const n = randInt(rng, P.primaries[0], P.primaries[1]);
  const az0 = rng() * TWO_PI;
  const maxDepth = lod === 0 ? P.depth : Math.max(2, P.depth - 1);
  // A primary plus its children form a chain of lengths L, L*f, L*f*f ... The whole
  // chain has to fit in the canopy height, so the primary gets its share of it.
  let chain = 0;
  for (let d = 0; d < maxDepth; d++) chain += Math.pow(P.lenFall, d);
  for (let k = 0; k < n; k++) {
    const leader = k === n - 1;
    const t = leader ? 1.0 : lerp(P.forkStart, 0.97, k / Math.max(1, n - 1)) + (rng() - 0.5) * 0.08;
    const s = curveAt(trunk, frames, clamp(t, 0, 1));
    const az = az0 + (k / n) * TWO_PI + (rng() - 0.5) * 0.7;
    const pitch = (leader ? rand(rng, 5, 20) : rand(rng, P.pitch[0], P.pitch[1])) * DEG;
    const dir = dirFromFrame(s, pitch, az);
    const len = ((h - trunkH) * P.branchLen / chain) * rand(rng, 0.85, 1.15) * (leader ? 0.95 : 1);
    const r0 = s.r * (leader ? 0.85 : 0.6);
    fork(ctx, P, s.p, dir, len, r0, 1, maxDepth, s.wind, rng());
  }
  ctx.canopyCentre = new THREE.Vector3(0, trunkH + (h - trunkH) * 0.45, 0);
  return { trunkRadius: rBase };
}

/** One branch of a broadleaf, forking into children until `maxDepth`, then leaves. */
function fork(ctx, P, start, dir, len, r0, depth, maxDepth, wind0, phase) {
  const { rng, lod } = ctx;
  const terminal = depth >= maxDepth;
  const segs = depth === 1 ? (lod === 0 ? 6 : 4) : (lod === 0 ? 4 : 3);
  const sides = sidesFor(r0, lod);
  const droop = P.droop[Math.min(depth, P.droop.length) - 1];
  const br = growBranch(rng, start, dir, len, r0, r0 * (terminal ? 0.15 : 0.45), segs, {
    droop, wiggle: 0.35, wind0, wind1: Math.min(0.55, wind0 + 0.12),
    ao0: depth === 1 ? 0.65 : 0.8, ao1: depth === 1 ? 0.85 : 1, taper: 1.1,
  });
  sweepTube(ctx.bark, br.pts, { sides, tint: ctx.barkTint, phase, rng, lump: depth === 1 ? 0.04 : 0 });
  if (!terminal) {
    const frames = buildFrames(br.pts.map((q) => q.p));
    const kids = randInt(rng, P.forks[0], P.forks[1]);
    for (let j = 0; j < kids; j++) {
      const tc = j === 0 ? 1.0 : rand(rng, 0.5, 0.95);
      const s = curveAt(br.pts, frames, tc);
      const pitch = rand(rng, P.forkAngle[0], P.forkAngle[1]) * DEG * (j === 0 ? 0.35 : 1);
      const cdir = dirFromFrame(s, pitch, rng() * TWO_PI).addScaledVector(UP, P.upBias).normalize();
      const clen = len * P.lenFall * rand(rng, 0.8, 1.1) * (j === 0 ? 1 : 0.7 + 0.3 * tc);
      fork(ctx, P, s.p, cdir, clen, Math.max(0.01, s.r * P.rFall), depth + 1, maxDepth, s.wind, phase + rng() * 0.15);
    }
  } else {
    leafCards(ctx, P, br, len, phase);
  }
}

/** Leaf-cluster cards on the outer part of a terminal branch. */
function leafCards(ctx, P, br, len, phase) {
  const { rng, lod, height: h } = ctx;
  const row = ctx.sp.leafKind;
  // More clusters, each a little smaller. Three big cards per branch reads as a handful of green
  // blobs stuck on a stick. The trap when fixing that is to shrink them as much as you multiply
  // them: five cards at 0.62 of the size covers a THIRD LESS canopy than three at full size, and
  // the tree comes out looking like winter. Six at 0.80 covers about a quarter more than the
  // original three, spread over twice as many places.
  // Level 1 used to keep two cards where level 0 has six, which with its own thinner branching
  // left a birch with twenty leaf clusters instead of a hundred and fourteen — a bare tree at
  // sixty metres, which is close enough to see clearly. Four larger cards costs a few hundred
  // triangles and puts the canopy back.
  const size = P.leafSize * 0.80 * clamp(h / 12, 0.6, 1.6) * (lod === 1 ? 1.45 : 1);
  const spots = lod === 0 ? [1.0, 0.89, 0.78, 0.67, 0.56, 0.45]
              : lod === 1 ? [1.0, 0.82, 0.64, 0.46] : [1.0, 0.6];
  const frames = buildFrames(br.pts.map((q) => q.p));
  for (const t of spots) {
    const s = curveAt(br.pts, frames, t);
    const sz = size * rand(rng, 0.8, 1.2);
    ctx.cards.push({
      origin: s.p.clone().addScaledVector(randomDir(rng), sz * 0.12), mode: 'canopy', width: sz, height: sz,
      cell: leafCell(rng, row), wind0: rand(rng, 0.6, 0.75), wind1: rand(rng, 0.85, 1), phase: phase + rng() * 0.1,
    });
  }
  if (P.weeping) {
    // a chain of cards hanging straight down from the tip, each a little further down
    const tip = br.pts[br.pts.length - 1].p;
    const links = lod === 0 ? randInt(rng, 3, 4) : 2;
    const linkH = size * (lod === 0 ? 1.2 : 1.8);
    const facing = azimuth(rng() * TWO_PI);
    for (let i = 0; i < links; i++) {
      const down = new THREE.Vector3(rand(rng, -0.15, 0.15), -1, rand(rng, -0.15, 0.15)).normalize();
      ctx.cards.push({
        origin: tip.clone().addScaledVector(UP, -linkH * i * 0.9), up: down, facing, mode: 'fixed', anchor: 'base',
        width: size * 0.55, height: linkH, cell: leafCell(rng, row), depth: 0.8 + 0.2 * (i / links),
        wind0: 0.7, wind1: rand(rng, 0.9, 1), phase: phase + rng() * 0.1, bow: 0.15,
      });
    }
  }
}

/**
 * A dead snag: a thick trunk broken off at a ragged top, with a few stub branches.
 * Triangle budget: ~410 / ~200 / 28.
 */
function buildSnag(ctx, P) {
  const { rng, lod, height: h } = ctx;
  const rBase = h / P.trunkDiv;
  if (lod === 2) return buildLod2(ctx, P, rBase, { dead: true });
  const segs = lod === 0 ? 8 : 5;
  const sides = lod === 0 ? 8 : 5;
  const trunk = growTrunk(rng, h, rBase, rBase * 0.5, segs,
    { lean: 8 * DEG, sCurve: 0.02, flare: 0.45, windTop: 0.12, aoBase: 0.5, taper: 1.2, wobble: 0.03 });
  sweepTube(ctx.bark, trunk, { sides, tint: ctx.barkTint, phase: rng(), rng, lump: P.lump, jagEnd: rBase * 1.4 });
  addRoots(ctx, rBase, randInt(rng, 3, 5), { len: [1.8, 2.8] });
  const frames = buildFrames(trunk.map((q) => q.p));
  const stubs = lod === 0 ? randInt(rng, P.stubs[0], P.stubs[1]) : 2;
  for (let k = 0; k < stubs; k++) {
    const s = curveAt(trunk, frames, rand(rng, 0.4, 0.85));
    const dir = dirFromFrame(s, rand(rng, 55, 95) * DEG, rng() * TWO_PI);
    const len = rand(rng, 0.6, 1.6);
    const br = growBranch(rng, s.p, dir, len, s.r * 0.3, s.r * 0.12, 3, { droop: 0.3, wiggle: 0.3, wind0: s.wind, wind1: s.wind + 0.05, ao0: 0.7, ao1: 1 });
    sweepTube(ctx.bark, br.pts, { sides: lod === 0 ? 5 : 4, tint: ctx.barkTint, phase: rng(), rng, jagEnd: s.r * 0.3 });
  }
  return { trunkRadius: rBase };
}

/**
 * A stump: a short wide trunk with a flat (slightly ragged) top and roots.
 * Triangle budget: ~290 / ~160 / 35.
 */
function buildStump(ctx, P) {
  const { rng, lod, height: h } = ctx;
  const rBase = h * P.radiusOfHeight * rand(rng, 0.85, 1.15);
  const segs = lod === 0 ? 4 : 2;
  const sides = lod === 0 ? 9 : lod === 1 ? 6 : 5;
  const trunk = growTrunk(rng, h, rBase, rBase * 0.8, segs,
    { lean: 4 * DEG, sCurve: 0, flare: 0.5, windTop: 0, aoBase: 0.5, taper: 1.0, sink: 0.2 });
  sweepTube(ctx.bark, trunk, { sides, tint: ctx.barkTint, phase: 0, rng, lump: P.lump, capEnd: true, capAo: 1.15, jagEnd: lod === 0 ? h * 0.12 : 0 });
  if (lod < 2) addRoots(ctx, rBase, randInt(rng, P.roots[0], P.roots[1]), { len: [1.4, 2.2], startHeight: 0.35 });
  return { trunkRadius: rBase };
}

/**
 * A fan palm: one leaning, curving trunk with ring bumps and a crown of long
 * arching fronds (row 3 of the atlas), a few dead ones hanging below.
 * Triangle budget: ~370 / ~180 / 22.
 */
function buildPalm(ctx, P) {
  const { rng, lod, height: h } = ctx;
  const rBase = h / P.trunkDiv;
  if (lod === 2) return buildLod2(ctx, P, rBase, { bottom: h * 0.72, radius: h * 0.3, top: h * 1.1 });
  const segs = lod === 0 ? 12 : 7;
  const sides = lod === 0 ? 8 : 6;
  const lean = rand(rng, 4, P.lean) * DEG;
  const dir = UP.clone().applyAxisAngle(azimuth(rng() * TWO_PI), lean);
  // negative droop = the trunk curves back toward vertical as it rises, like a real palm
  const trunk = growBranch(rng, new THREE.Vector3(0, -0.2, 0), dir, h, rBase, rBase * 0.75, segs,
    { droop: -lean * 1.2, wiggle: 0.05, wind0: 0, wind1: 0.3, ao0: 0.55, ao1: 1, taper: 1.0 });
  const phase = rng();
  sweepTube(ctx.bark, trunk.pts, { sides, tint: ctx.barkTint, phase, rng, lump: 0.07, vScale: 1.6, capEnd: true });
  const top = trunk.pts[trunk.pts.length - 1].p;
  const axis = trunk.endDir.clone();
  const fronds = lod === 0 ? randInt(rng, P.fronds[0], P.fronds[1]) : 7;
  const az0 = rng() * TWO_PI;
  for (let k = 0; k < fronds; k++) {
    const az = az0 + (k / fronds) * TWO_PI + (rng() - 0.5) * 0.4;
    const ring = k % 3;                        // three tiers: upright, level, drooping
    const pitch = (ring === 0 ? rand(rng, 25, 45) : ring === 1 ? rand(rng, 55, 80) : rand(rng, 85, 110)) * DEG;
    const n = perpOf(axis), b = new THREE.Vector3().crossVectors(axis, n);
    const fdir = dirFromFrame({ t: axis, n, b }, pitch, az);
    const facing = UP.clone().addScaledVector(fdir, -UP.dot(fdir)).normalize().applyAxisAngle(fdir, (rng() - 0.5) * 30 * DEG);
    const len = h * rand(rng, P.frondLen[0], P.frondLen[1]) * (lod === 1 ? 1.15 : 1);
    ctx.cards.push({
      origin: top.clone(), up: fdir, facing, mode: 'fixed', anchor: 'base',
      width: rand(rng, P.frondWidth[0], P.frondWidth[1]), height: len, cell: leafCell(rng, LEAF_ROWS.frond),
      rows: 4, depth: 0.6 + 0.4 * (ring / 2), sag: 0.45 + ring * 0.15, bow: 0.3,
      widthProfile: (t) => 0.45 + 0.75 * Math.sin(t * Math.PI * 0.85),
      wind0: 0.6, wind1: rand(rng, 0.85, 1), phase: phase + rng() * 0.2,
    });
  }
  // dead fronds: brown, hanging straight down against the trunk
  const dead = lod === 0 ? randInt(rng, 2, 4) : 1;
  for (let k = 0; k < dead; k++) {
    const down = new THREE.Vector3(rand(rng, -0.25, 0.25), -1, rand(rng, -0.25, 0.25)).normalize();
    ctx.cards.push({
      origin: top.clone().addScaledVector(randomPerp(rng, UP), rBase * 0.8), up: down, facing: azimuth(rng() * TWO_PI),
      mode: 'fixed', anchor: 'base', width: 0.45, height: h * 0.2, cell: leafCell(rng, LEAF_ROWS.frond),
      depth: 0.4, color: [0.75, 0.6, 0.4], wind0: 0.6, wind1: 0.8, phase: phase + rng() * 0.2,
    });
  }
  ctx.canopyCentre = top.clone();
  return { trunkRadius: rBase };
}

/**
 * LOD 2: a 4-sided trunk (16 triangles) and a cross of three flat quads showing the
 * whole crown silhouette (6 triangles) from atlas column LEAF_CROWN_COL. 22 triangles.
 * Dead trees get the trunk plus two stub quads instead of a crown (32 triangles).
 */
function buildLod2(ctx, P, rBase, crown) {
  const { rng, height: h } = ctx;
  const top = crown.top || h;
  const pts = [
    { p: new THREE.Vector3(0, -0.2, 0), r: rBase * 1.2, wind: 0, ao: 0.55 },
    { p: new THREE.Vector3(0, top * 0.45, 0), r: rBase * 0.7, wind: 0.1, ao: 0.85 },
    { p: new THREE.Vector3(0, top, 0), r: rBase * 0.15, wind: 0.3, ao: 1 },
  ];
  sweepTube(ctx.bark, pts, { sides: 4, tint: ctx.barkTint, phase: 0, capEnd: false });
  if (crown.dead) {
    for (let k = 0; k < 2; k++) {
      const s = pts[1].p.clone().lerp(pts[2].p, rand(rng, 0.2, 0.8));
      const dir = azimuth(rng() * TWO_PI).addScaledVector(UP, 0.4).normalize();
      sweepTube(ctx.bark, [{ p: s, r: rBase * 0.25, wind: 0.15, ao: 0.9 }, { p: s.clone().addScaledVector(dir, rBase * 6), r: rBase * 0.06, wind: 0.2, ao: 1 }],
        { sides: 3, tint: ctx.barkTint, phase: 0 });
    }
    return { trunkRadius: rBase };
  }
  addCross(ctx.foliage, {
    origin: new THREE.Vector3(0, crown.bottom, 0), width: crown.radius * 2, height: top - crown.bottom,
    anchor: 'base', rng, cell: cellRect(LEAF_CROWN_COL, ctx.sp.leafKind), color: ctx.leafTint || WHITE,
    wind0: 0.15, wind1: 0.4, phase: rng(), shadeNormal: UP, shadeMix: 0.5,
  });
  return { trunkRadius: rBase };
}

/**
 * Build one tree.
 * @param {string} species  a key of SPECIES
 * @param {object} opts     { rng, lod = 0, height, seed }
 * @returns {{ bark, foliage, height, radius, trunkRadius }}
 */
export function buildTree(species, opts = {}) {
  const sp = SPECIES[species];
  const P = PARAMS[species];
  if (!sp || !P) throw new Error(`trees.js: unknown species "${species}"`);
  const rng = opts.rng || makeRng(opts.seed == null ? 1 : opts.seed);
  const lod = clamp(Math.round(opts.lod || 0), 0, 2);
  const height = opts.height || rand(rng, sp.minHeight, sp.maxHeight);
  const ctx = {
    rng, lod, sp, height, bark: new GeoBuffer(), foliage: new GeoBuffer(), cards: [],
    barkTint: P.barkTint || WHITE, leafTint: P.leafTint || WHITE, canopyCentre: null, canopyRadius: 0,
  };
  let info;
  switch (P.kind) {
    case 'conifer': info = buildConifer(ctx, P); break;
    case 'broadleaf': info = buildBroadleaf(ctx, P); break;
    case 'snag': info = buildSnag(ctx, P); break;
    case 'stump': info = buildStump(ctx, P); break;
    case 'palm': info = buildPalm(ctx, P); break;
    default: throw new Error(`trees.js: no builder for kind "${P.kind}"`);
  }
  return finish(ctx, info);
}

/** Emit queued cards, convert both buffers, and measure the result. */
function finish(ctx, info = {}) {
  emitCards(ctx);
  const radius = Math.sqrt(Math.max(ctx.bark.maxR2, ctx.foliage.maxR2));
  const height = Math.max(ctx.bark.maxY, ctx.foliage.maxY, ctx.height || 0);
  return {
    bark: ctx.bark.toGeometry(),
    foliage: ctx.foliage.toGeometry(),
    height,
    radius,
    trunkRadius: info.trunkRadius || 0,
  };
}

/** A fresh build context for the small plants (no species table entry). */
function smallCtx(opts, minH, maxH) {
  const rng = opts.rng || makeRng(opts.seed == null ? 1 : opts.seed);
  const lod = clamp(Math.round(opts.lod || 0), 0, 2);
  const height = opts.height || rand(rng, minH, maxH);
  return { rng, lod, height, bark: new GeoBuffer(), foliage: new GeoBuffer(), cards: [], barkTint: WHITE, leafTint: WHITE, canopyCentre: null, sp: null };
}

// ---------------------------------------------------------------------------
// Bushes
// ---------------------------------------------------------------------------

const BUSHES = {
  shrub:      { label: 'Hedgeknot Shrub', h: [0.8, 1.4], row: LEAF_ROWS.broadleaf },
  berry_bush: { label: 'Emberberry Bush', h: [0.7, 1.2], row: LEAF_ROWS.broadleaf, berries: true },
  juniper:    { label: 'Creeping Juniper', h: [0.6, 1.0], row: LEAF_ROWS.needle, sprays: true },
  bramble:    { label: 'Thornvine Bramble', h: [0.7, 1.3], row: LEAF_ROWS.small, canes: true },
  heather:    { label: 'Moorbell Heather', h: [0.3, 0.5], row: LEAF_ROWS.small, mound: true, tint: [1.0, 0.82, 1.15] },
};

/**
 * Bushes. shrub / berry_bush: a few twigs and a shell of cards on a squashed ball.
 * juniper: low spreading needle sprays. bramble: arching thorny canes with small
 * leaves. heather: a mound of tiny purple-tinted cards.
 * Triangle budget: shrub ~320 / ~170 / 6; berry_bush ~370 / ~170 / 6; juniper ~440 /
 * ~160 / 6; bramble ~600 (max 750) / ~190 / 6; heather ~420 / ~190 / 6.
 */
export function buildBush(kind, opts = {}) {
  const K = BUSHES[kind];
  if (!K) throw new Error(`trees.js: unknown bush "${kind}"`);
  const ctx = smallCtx(opts, K.h[0], K.h[1]);
  const { rng, lod, height: h } = ctx;
  const radius = K.mound ? h * rand(rng, 1.6, 2.2) : K.sprays ? h * rand(rng, 1.3, 1.7) : h * rand(rng, 0.65, 0.9);
  const centre = new THREE.Vector3(0, h * 0.55, 0);
  ctx.canopyCentre = centre;
  if (lod === 2) {
    addCross(ctx.foliage, { origin: new THREE.Vector3(0, 0, 0), width: radius * 2, height: h, anchor: 'base', rng,
      cell: cellRect(LEAF_CROWN_COL, K.row), color: K.tint || WHITE, wind0: 0.5, wind1: 0.8, phase: rng(), shadeNormal: UP, shadeMix: 0.5 });
    return finish(ctx, {});
  }
  const phase = rng();
  if (K.canes) {
    // bramble: canes leave the centre going up and out, then arch over to the ground
    const canes = lod === 0 ? randInt(rng, 6, 9) : 4;
    for (let k = 0; k < canes; k++) {
      const dir = azimuth(rng() * TWO_PI).addScaledVector(UP, rand(rng, 1.2, 2.2)).normalize();
      const len = rand(rng, 1.6, 2.6) * h;
      const br = growBranch(rng, new THREE.Vector3(0, 0, 0), dir, len, 0.022, 0.008, lod === 0 ? 5 : 3,
        { droop: 1.6, wiggle: 0.4, wind0: 0.2, wind1: 0.6, ao0: 0.6, ao1: 1 });
      const cp = phase + rng() * 0.2;
      sweepTube(ctx.bark, br.pts, { sides: 4, tint: [0.7, 0.55, 0.45], phase: cp });
      const frames = buildFrames(br.pts.map((q) => q.p));
      const leaves = lod === 0 ? randInt(rng, 4, 6) : 3;
      for (let i = 0; i < leaves; i++) {
        const s = curveAt(br.pts, frames, rand(rng, 0.2, 1));
        const sz = rand(rng, 0.16, 0.24) * (lod === 1 ? 1.5 : 1);
        ctx.cards.push({ origin: s.p.clone().addScaledVector(randomDir(rng), 0.04), mode: 'canopy', width: sz, height: sz,
          cell: leafCell(rng, K.row), wind0: 0.6, wind1: rand(rng, 0.8, 1), phase: cp, color: [0.85, 0.95, 0.8] });
      }
    }
    return finish(ctx, {});
  }
  if (K.sprays) {
    // juniper: low branches with needle sprays, like a conifer pressed flat to the ground
    const arms = lod === 0 ? randInt(rng, 6, 9) : 4;
    for (let k = 0; k < arms; k++) {
      const dir = azimuth(rng() * TWO_PI).addScaledVector(UP, rand(rng, 0.15, 0.5)).normalize();
      const len = radius * rand(rng, 0.7, 1.0);
      const br = growBranch(rng, new THREE.Vector3(0, 0.05, 0), dir, len, 0.035, 0.012, lod === 0 ? 4 : 3,
        { droop: 0.3, wiggle: 0.3, wind0: 0.1, wind1: 0.45, ao0: 0.55, ao1: 0.95 });
      const cp = phase + rng() * 0.2;
      sweepTube(ctx.bark, br.pts, { sides: 4, tint: WHITE, phase: cp });
      addSprays(ctx, { sprays: [3, 4], sprayLen: [0.35, 0.55], sprayWidth: [0.22, 0.32], sprayDroop: 0.25 }, br.pts, len, radius * 0.9, cp, lod);
    }
    return finish(ctx, {});
  }
  // shrub, berry bush and heather: twigs inside, a shell of cards outside
  const twigs = K.mound ? (lod === 0 ? 4 : 2) : (lod === 0 ? 5 : 3);
  for (let k = 0; k < twigs; k++) {
    const dir = azimuth(rng() * TWO_PI).addScaledVector(UP, rand(rng, 1.0, 2.5)).normalize();
    const br = growBranch(rng, new THREE.Vector3(0, -0.05, 0), dir, h * rand(rng, 0.5, 0.8), 0.03, 0.008, 3,
      { droop: 0.15, wiggle: 0.3, wind0: 0, wind1: 0.4, ao0: 0.5, ao1: 0.85 });
    sweepTube(ctx.bark, br.pts, { sides: 4, tint: WHITE, phase: phase + rng() * 0.2 });
  }
  const count = K.mound ? (lod === 0 ? randInt(rng, 36, 50) : 18) : (lod === 0 ? randInt(rng, 22, 30) : 12);
  const size = K.mound ? rand(rng, 0.18, 0.26) : h * rand(rng, 0.45, 0.6);
  for (let i = 0; i < count; i++) {
    // a random point on a squashed sphere, pulled inward by a random amount for depth
    const d = randomDir(rng);
    const depthT = Math.pow(rng(), 0.6) * 0.5 + 0.5;
    const origin = new THREE.Vector3(d.x * radius * depthT, centre.y + d.y * h * 0.5 * depthT, d.z * radius * depthT);
    if (origin.y < 0.05) origin.y = 0.05;
    ctx.cards.push({ origin, mode: 'canopy', width: size * rand(rng, 0.8, 1.2) * (lod === 1 ? 1.5 : 1), height: size * rand(rng, 0.8, 1.2) * (lod === 1 ? 1.5 : 1),
      cell: leafCell(rng, K.row), wind0: 0.6, wind1: rand(rng, 0.75, 1), phase: phase + rng() * 0.2, color: K.tint });
  }
  if (K.berries && lod === 0) {
    // little red-tinted crosses on the outer shell — the leaf texture tinted red reads as fruit at a distance
    const berries = randInt(rng, 10, 16);
    for (let i = 0; i < berries; i++) {
      const d = randomDir(rng);
      const origin = new THREE.Vector3(d.x * radius * 0.95, Math.max(0.1, centre.y + d.y * h * 0.45), d.z * radius * 0.95);
      addCross(ctx.foliage, { origin, width: 0.12, height: 0.12, count: 2, rng, cell: leafCell(rng, LEAF_ROWS.small),
        color: [1.35, 0.35, 0.4], wind0: 0.8, wind1: 0.95, phase: phase + rng() * 0.2, shadeNormal: UP, shadeMix: 0.5 });
    }
  }
  return finish(ctx, {});
}

// ---------------------------------------------------------------------------
// Ferns, reeds and other ground plants
// ---------------------------------------------------------------------------

const FERNS = {
  fern:      { label: 'Shadefan Fern', h: [0.4, 0.9], fronds: [6, 10], row: LEAF_ROWS.frond, hw: [0.09, 0.14], pitch: [30, 75] },
  broadleaf: { label: 'Elephant-ear Leaf', h: [0.4, 0.7], fronds: [4, 6], row: LEAF_ROWS.broadleaf, hw: [0.15, 0.22], pitch: [20, 60], bow: 0.35 },
  reed:      { label: 'Marsh Reed', h: [0.9, 1.8], fronds: [8, 14], row: LEAF_ROWS.frond, hw: [0.02, 0.03], pitch: [3, 14], blade: true },
  cattail:   { label: 'Brown-top Cattail', h: [1.0, 1.8], fronds: [6, 10], row: LEAF_ROWS.frond, hw: [0.018, 0.028], pitch: [3, 12], blade: true, heads: true },
};

/**
 * Ferns and reeds: fronds radiating from the centre, arching up and out. Reeds are
 * narrow 2-column blades; cattails add brown seed heads (bark material).
 * Triangle budget: fern ~90 / 60 / 12; broadleaf ~55 / 36 / 12; reed ~60 / 36 / 6; cattail ~130 / 66 / 6.
 */
export function buildFern(kind, opts = {}) {
  const K = FERNS[kind];
  if (!K) throw new Error(`trees.js: unknown fern "${kind}"`);
  const ctx = smallCtx(opts, K.h[0], K.h[1]);
  const { rng, lod, height: h } = ctx;
  const phase = rng();
  const fronds = lod === 2 ? Math.min(3, K.fronds[0]) : lod === 1 ? Math.ceil(K.fronds[0] * 0.7) : randInt(rng, K.fronds[0], K.fronds[1]);
  const az0 = rng() * TWO_PI;
  for (let k = 0; k < fronds; k++) {
    const az = az0 + (k / fronds) * TWO_PI + (rng() - 0.5) * 0.6;
    const pitch = rand(rng, K.pitch[0], K.pitch[1]) * DEG;
    const dir = UP.clone().applyAxisAngle(azimuth(az + Math.PI / 2), pitch);
    const facing = UP.clone().addScaledVector(dir, -UP.dot(dir)).normalize().applyAxisAngle(dir, (rng() - 0.5) * 40 * DEG);
    const len = h * rand(rng, 0.85, 1.15) / Math.max(0.4, Math.cos(pitch * 0.6));
    const hw = rand(rng, K.hw[0], K.hw[1]);
    addCard(ctx.foliage, {
      origin: new THREE.Vector3(rand(rng, -0.03, 0.03), 0, rand(rng, -0.03, 0.03)), up: dir, facing, anchor: 'base',
      width: hw * 2, height: len, rows: lod === 2 ? 2 : 4, cols: K.blade ? 2 : 3, bow: K.bow || 0.25,
      sag: K.blade ? 0.08 : 0.35, arch: 0, cell: leafCell(rng, K.row),
      widthProfile: K.blade ? (t) => 1 - 0.85 * t : (t) => 0.5 + 0.7 * Math.sin(t * Math.PI * 0.8),
      wind0: 0.15, wind1: rand(rng, 0.7, 1), phase: phase + rng() * 0.15,
      color: [aoFromDepth(0.5 + 0.5 * rng()), aoFromDepth(0.5 + 0.5 * rng()), 0.9 + rng() * 0.15],
      shadeNormal: UP, shadeMix: 0.45,
    });
  }
  if (K.heads && lod < 2) {
    const heads = lod === 0 ? randInt(rng, 2, 3) : 1;
    for (let k = 0; k < heads; k++) {
      const lean = rand(rng, 2, 8) * DEG;
      const dir = UP.clone().applyAxisAngle(azimuth(rng() * TWO_PI), lean);
      const stalkH = h * rand(rng, 0.9, 1.1);
      const base = new THREE.Vector3(rand(rng, -0.05, 0.05), 0, rand(rng, -0.05, 0.05));
      const stalk = [
        { p: base, r: 0.008, wind: 0.1, ao: 0.6 },
        { p: base.clone().addScaledVector(dir, stalkH * 0.8), r: 0.006, wind: 0.6, ao: 1 },
        { p: base.clone().addScaledVector(dir, stalkH * 0.81), r: 0.028, wind: 0.62, ao: 1 },
        { p: base.clone().addScaledVector(dir, stalkH), r: 0.026, wind: 0.75, ao: 1 },
        { p: base.clone().addScaledVector(dir, stalkH * 1.01), r: 0.004, wind: 0.76, ao: 1 },
      ];
      sweepTube(ctx.bark, stalk, { sides: 4, tint: [0.55, 0.38, 0.25], phase: phase + rng() * 0.2, capEnd: true });
    }
  }
  return finish(ctx, {});
}

// ---------------------------------------------------------------------------
// Flowers and mushrooms
// ---------------------------------------------------------------------------

const FLOWERS = {
  daisy:        { label: 'Meadow Daisy', h: [0.18, 0.4], stems: [1, 3], head: 'disc', tint: [1.7, 1.7, 1.55] },
  bluebell:     { label: 'Dusk Bluebell', h: [0.2, 0.4], stems: [1, 2], head: 'bells', tint: [0.55, 0.6, 1.65] },
  thistle:      { label: 'Ridgeback Thistle', h: [0.35, 0.7], stems: [1, 1], head: 'tuft', tint: [1.25, 0.6, 1.5] },
  mushroom_cap: { label: 'Loam Cap', h: [0.06, 0.16], mushroom: true, capTint: [0.85, 0.7, 0.5], stemTint: [0.95, 0.9, 0.8] },
  toadstool:    { label: 'Ember Toadstool', h: [0.1, 0.25], mushroom: true, capTint: [1.6, 0.35, 0.3], stemTint: [1.1, 1.05, 0.95] },
};

/**
 * Flowers: a thin stem (bark material, green-tinted) with a head made of small
 * tinted cards. Mushrooms are one swept profile — stem, then a cap that flares out
 * and closes — in the bark material with a tinted cap.
 * Triangle budget: daisy ~55 / ~30 / 14; bluebell ~50 / ~30 / 18; thistle 48 / 32 / 16; mushrooms 104 / 78 / 52.
 */
export function buildFlower(kind, opts = {}) {
  const K = FLOWERS[kind];
  if (!K) throw new Error(`trees.js: unknown flower "${kind}"`);
  const ctx = smallCtx(opts, K.h[0], K.h[1]);
  const { rng, lod, height: h } = ctx;
  const phase = rng();
  if (K.mushroom) {
    const sides = lod === 0 ? 8 : lod === 1 ? 6 : 4;
    const stemR = h * rand(rng, 0.12, 0.2);
    const capR = h * rand(rng, 0.55, 0.9);
    const capH = h * rand(rng, 0.35, 0.6);
    const lean = rand(rng, 0, 12) * DEG;
    const dir = UP.clone().applyAxisAngle(azimuth(rng() * TWO_PI), lean);
    const at = (f) => new THREE.Vector3(0, -0.02, 0).addScaledVector(dir, h * f);
    // The profile: a thin stem, then the ring jumps out to the cap's rim, rises to the
    // dome and closes with a cap. Colour switches from stem tint to cap tint at the rim.
    const stem = [
      { p: at(0), r: stemR * 1.2, wind: 0, ao: 0.55 },
      { p: at(0.5), r: stemR, wind: 0.05, ao: 0.8 },
      { p: at(1 - capH / h), r: stemR * 1.1, wind: 0.1, ao: 0.7 },
    ];
    sweepTube(ctx.bark, stem, { sides, tint: K.stemTint, phase, rng, lump: 0.03 });
    const rimY = 1 - capH / h;
    const cap = [
      { p: at(rimY - 0.02), r: stemR * 1.1, wind: 0.1, ao: 0.6 },
      { p: at(rimY), r: capR, wind: 0.1, ao: 0.7 },
      { p: at(rimY + (1 - rimY) * 0.45), r: capR * 0.85, wind: 0.11, ao: 0.95 },
      { p: at(rimY + (1 - rimY) * 0.85), r: capR * 0.45, wind: 0.12, ao: 1 },
      { p: at(1), r: capR * 0.05, wind: 0.12, ao: 1 },
    ];
    sweepTube(ctx.bark, cap, { sides, tint: K.capTint, phase, rng, lump: 0.02, capEnd: true });
    return finish(ctx, {});
  }
  const stems = lod === 2 ? 1 : randInt(rng, K.stems[0], K.stems[1]);
  for (let k = 0; k < stems; k++) {
    const base = k === 0 ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(rand(rng, -0.08, 0.08), 0, rand(rng, -0.08, 0.08));
    const sh = h * rand(rng, 0.8, 1.1);
    const lean = rand(rng, 2, 14) * DEG;
    const dir = UP.clone().applyAxisAngle(azimuth(rng() * TWO_PI), lean);
    const stem = growBranch(rng, base, dir, sh, K.head === 'tuft' ? 0.009 : 0.005, 0.004, lod === 0 ? 3 : 2,
      { droop: K.head === 'bells' ? 0.35 : 0.05, wiggle: 0.15, wind0: 0.1, wind1: 0.75, ao0: 0.6, ao1: 1 });
    const sp = phase + rng() * 0.2;
    sweepTube(ctx.bark, stem.pts, { sides: lod === 0 ? 4 : 3, tint: [0.55, 0.85, 0.45], phase: sp });
    const top = stem.pts[stem.pts.length - 1].p;
    const cell = leafCell(rng, LEAF_ROWS.small);
    if (K.head === 'disc') {
      // a flat card lying across the stem top, facing the sky
      const fr = cardFrame(UP.clone().addScaledVector(stem.endDir, 0.5).normalize(), rng() * TWO_PI);
      addCard(ctx.foliage, { origin: top, up: fr.up, facing: fr.facing, width: h * 0.22, height: h * 0.22, rows: lod === 0 ? 3 : 2, cols: lod === 0 ? 3 : 2,
        bow: -0.2, cell, color: K.tint, wind0: 0.75, wind1: 0.8, phase: sp, shadeNormal: UP, shadeMix: 0.6 });
    } else if (K.head === 'bells') {
      const frames = buildFrames(stem.pts.map((q) => q.p));
      const bells = lod === 0 ? randInt(rng, 4, 6) : 3;
      for (let i = 0; i < bells; i++) {
        const s = curveAt(stem.pts, frames, lerp(0.5, 1, i / Math.max(1, bells - 1)));
        const down = new THREE.Vector3(rand(rng, -0.4, 0.4), -1, rand(rng, -0.4, 0.4)).normalize();
        addCard(ctx.foliage, { origin: s.p, up: down, facing: azimuth(rng() * TWO_PI), anchor: 'base', width: h * 0.08, height: h * 0.11,
          rows: 2, cols: 2, cell, color: K.tint, wind0: 0.7, wind1: 0.9, phase: sp, shadeNormal: UP, shadeMix: 0.5 });
      }
    } else {
      // thistle: a spiky tuft on top (two crossed cards) and grey-green leaves down the stem
      addCross(ctx.foliage, { origin: top, width: h * 0.16, height: h * 0.2, count: 2, anchor: 'base', rng, cell, color: K.tint,
        wind0: 0.75, wind1: 0.9, phase: sp, shadeNormal: UP, shadeMix: 0.5 });
      if (lod < 2) {
        const frames = buildFrames(stem.pts.map((q) => q.p));
        for (let i = 0; i < (lod === 0 ? 3 : 2); i++) {
          const s = curveAt(stem.pts, frames, rand(rng, 0.15, 0.6));
          const d = dirFromFrame(s, rand(rng, 50, 80) * DEG, rng() * TWO_PI);
          addCard(ctx.foliage, { origin: s.p, up: d, facing: cardFrame(d, 0).facing, anchor: 'base', width: h * 0.12, height: h * 0.28, rows: 3, cols: 2,
            cell: leafCell(rng, LEAF_ROWS.small), color: [0.85, 0.95, 0.85], sag: 0.2, wind0: 0.4, wind1: 0.8, phase: sp, shadeNormal: UP, shadeMix: 0.4 });
        }
      }
    }
  }
  // a pair of ground leaves at the base of the first stem
  if (lod < 2) {
    for (let i = 0; i < 2; i++) {
      const d = azimuth(rng() * TWO_PI).addScaledVector(UP, 0.7).normalize();
      addCard(ctx.foliage, { origin: new THREE.Vector3(0, 0.01, 0), up: d, facing: cardFrame(d, 0).facing, anchor: 'base', width: h * 0.16, height: h * 0.3,
        rows: 3, cols: 2, cell: leafCell(rng, LEAF_ROWS.small), color: [0.8, 0.9, 0.75], sag: 0.35, wind0: 0.2, wind1: 0.6, phase, shadeNormal: UP, shadeMix: 0.5 });
    }
  }
  return finish(ctx, {});
}

// ---------------------------------------------------------------------------
// Grass tufts
// ---------------------------------------------------------------------------

/**
 * A clump of 5-9 curved blades (4 vertex rows, 2 columns, tapering to a point,
 * leaning outward and arching over). Foliage only. Blades sample atlas row 3 as a
 * plain gradient — their shape is in the mesh.
 * Triangle budget: 30-54 at lod 0 (6 per blade), 24-30 at lod 1, 6 at lod 2.
 */
export function buildGrassTuft(opts = {}) {
  const ctx = smallCtx(opts, 0.25, 0.6);
  const { rng, lod, height: h } = ctx;
  const phase = rng();
  const blades = lod === 2 ? 3 : lod === 1 ? randInt(rng, 4, 5) : randInt(rng, 5, 9);
  const az0 = rng() * TWO_PI;
  for (let k = 0; k < blades; k++) {
    const az = az0 + (k / blades) * TWO_PI + (rng() - 0.5) * 0.8;
    const pitch = rand(rng, 8, 40) * DEG;
    const dir = UP.clone().applyAxisAngle(azimuth(az + Math.PI / 2), pitch);
    const facing = azimuth(az).addScaledVector(dir, -azimuth(az).dot(dir)).normalize().applyAxisAngle(dir, (rng() - 0.5) * 50 * DEG);
    const len = h * rand(rng, 0.7, 1.15);
    const hw = rand(rng, 0.012, 0.02) * (lod === 2 ? 1.6 : 1);
    const shade = rand(rng, 0.9, 1.1);
    addCard(ctx.foliage, {
      origin: new THREE.Vector3(rand(rng, -0.04, 0.04), -0.01, rand(rng, -0.04, 0.04)), up: dir, facing, anchor: 'base',
      width: hw * 2, height: len, rows: lod === 2 ? 2 : 4, cols: 2, sag: rand(rng, 0.15, 0.4),
      widthProfile: (t) => 1 - 0.85 * t, cell: cellRect(Math.floor(rng() * 3), LEAF_ROWS.frond),
      color: [0.95 * shade, 1.0 * shade, 0.85 * shade], wind0: 0.15, wind1: rand(rng, 0.8, 1), phase: phase + rng() * 0.2,
      shadeNormal: UP, shadeMix: 0.55,
    });
  }
  // the base of a tuft sits in its own shadow: darken the lowest row afterwards
  const col = ctx.foliage.col, pos = ctx.foliage.pos;
  for (let i = 0; i < pos.length / 3; i++) {
    const f = lerp(0.55, 1, clamp(pos[i * 3 + 1] / (h * 0.5), 0, 1));
    col[i * 3] *= f; col[i * 3 + 1] *= f; col[i * 3 + 2] *= f;
  }
  return finish(ctx, {});
}

// ---------------------------------------------------------------------------
// Logs and forest-floor debris
// ---------------------------------------------------------------------------

const DEBRIS = {
  fallen_log:   { label: 'Fallen Trunk' },
  broken_stump: { label: 'Split Stump' },
  branch_pile:  { label: 'Deadfall Pile' },
  root_arch:    { label: 'Root Arch' },
};

/**
 * Forest-floor debris. All bark material, all resting on y = 0 (a little sunk in).
 *   fallen_log:   a 3-7 m trunk lying on its side, ragged at both ends, a few stubs
 *   broken_stump: a 1.2-2.2 m stump split into a tall splinter
 *   branch_pile:  7-12 sticks criss-crossed in a 1.2 m circle
 *   root_arch:    a thick root looping up out of the ground and back in
 * Triangle budget: fallen_log ~190 / 84 / 28; broken_stump ~280 / ~165 / 36;
 * branch_pile ~200 (max 265) / 72 / 48; root_arch 232 / 144 / 32.
 */
export function buildLogsAndDebris(kind, opts = {}) {
  if (!DEBRIS[kind]) throw new Error(`trees.js: unknown debris "${kind}"`);
  const ctx = smallCtx(opts, 1, 1);
  const { rng, lod } = ctx;
  const tint = [0.86, 0.8, 0.74];
  const groundAO = (x, y, z) => lerp(0.5, 1, clamp(y / 0.5, 0, 1)); // darker the closer to the ground
  const sides = lod === 0 ? 8 : lod === 1 ? 6 : 4;
  if (kind === 'fallen_log') {
    const len = opts.length || rand(rng, 3, 7);
    const r = opts.radius || rand(rng, 0.2, 0.4);
    const az = rng() * TWO_PI;
    const along = azimuth(az);
    const segs = lod === 0 ? 8 : lod === 1 ? 5 : 2;
    const pts = [];
    const bend = randomPerp(rng, along).multiplyScalar(len * 0.03 * rand(rng, 0.3, 1));
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = along.clone().multiplyScalar((t - 0.5) * len).addScaledVector(bend, Math.sin(t * Math.PI));
      p.y = r * 0.8 + Math.abs(bend.y) * 0; // resting slightly sunk into the ground
      pts.push({ p, r: r * (1 - 0.35 * t), wind: 0, ao: 1 });
    }
    sweepTube(ctx.bark, pts, { sides, tint, phase: 0, rng, lump: 0.06, jagStart: r * 0.8, jagEnd: r * 0.5, aoAt: groundAO });
    const frames = buildFrames(pts.map((q) => q.p));
    const stubs = lod === 2 ? 1 : lod === 1 ? 2 : randInt(rng, 2, 4);
    for (let k = 0; k < stubs; k++) {
      const s = curveAt(pts, frames, rand(rng, 0.15, 0.9));
      const d = dirFromFrame(s, rand(rng, 60, 100) * DEG, rand(rng, -0.4, 0.4) * Math.PI + Math.PI); // mostly upward half
      if (d.y < 0.1) d.y = 0.1 + rng() * 0.5;
      d.normalize();
      const br = growBranch(rng, s.p, d, rand(rng, 0.4, 1.2), s.r * 0.25, s.r * 0.08, 2, { droop: 0.2, wiggle: 0.3, ao0: 0.85, ao1: 1 });
      sweepTube(ctx.bark, br.pts, { sides: Math.max(3, sides - 3), tint, phase: 0, rng, jagEnd: s.r * 0.2 });
    }
    return finish(ctx, { trunkRadius: r });
  }
  if (kind === 'broken_stump') {
    const h = opts.height || rand(rng, 1.2, 2.2);
    const r = opts.radius || rand(rng, 0.22, 0.4);
    const segs = lod === 0 ? 5 : 3;
    const trunk = growTrunk(rng, h, r, r * 0.7, segs, { lean: 6 * DEG, sCurve: 0, flare: 0.5, windTop: 0, aoBase: 0.5, taper: 1.0, wobble: 0.02, sink: 0.2 });
    // the top ring is torn: a tall splinter on one side, the rest broken low
    sweepTube(ctx.bark, trunk, { sides, tint, phase: 0, rng, lump: 0.08, jagEnd: h * 0.45, capEnd: true, capAo: 0.8 });
    if (lod < 2) addRoots(ctx, r, randInt(rng, 3, 5), { len: [1.4, 2.2], startHeight: 0.35 });
    return finish(ctx, { trunkRadius: r });
  }
  if (kind === 'branch_pile') {
    const count = lod === 2 ? 4 : lod === 1 ? 6 : randInt(rng, 7, 12);
    const spread = opts.radius || 0.6;
    for (let k = 0; k < count; k++) {
      const len = rand(rng, 0.6, 1.6);
      const dir = azimuth(rng() * TWO_PI).addScaledVector(UP, rand(rng, -0.15, 0.3)).normalize();
      const r0 = rand(rng, 0.03, 0.07);
      const start = azimuth(rng() * TWO_PI).multiplyScalar(rng() * spread).addScaledVector(dir, -len / 2);
      start.y = r0 + rng() * 0.25 * (k / count); // sticks stack a little higher toward the end of the list
      const br = growBranch(rng, start, dir, len, r0, r0 * 0.5, lod === 0 ? 3 : 2, { droop: -dir.y * 0.4, wiggle: 0.35, ao0: 1, ao1: 1 });
      sweepTube(ctx.bark, br.pts, { sides: Math.max(3, sides - 4), tint, phase: 0, rng, jagStart: r0 * 0.8, jagEnd: r0 * 0.8, aoAt: groundAO });
    }
    return finish(ctx, {});
  }
  // root_arch: a fat root leaving the ground, arching over and diving back in
  const span = opts.length || rand(rng, 1.5, 3);
  const top = opts.height || span * rand(rng, 0.25, 0.4);
  const r = opts.radius || rand(rng, 0.12, 0.22);
  const along = azimuth(rng() * TWO_PI);
  const segs = lod === 0 ? 10 : lod === 1 ? 6 : 4;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = along.clone().multiplyScalar((t - 0.5) * span);
    p.y = top * Math.sin(t * Math.PI) - 0.25 * (1 - Math.sin(t * Math.PI)); // ends buried 0.25 m
    p.addScaledVector(randomPerp(rng, along), 0.02 * span * Math.sin(t * Math.PI) * rng());
    pts.push({ p, r: r * (0.7 + 0.3 * Math.sin(t * Math.PI)) * (1 - 0.25 * t), wind: 0, ao: lerp(0.55, 1, Math.sin(t * Math.PI)) });
  }
  sweepTube(ctx.bark, pts, { sides, tint, phase: 0, rng, lump: 0.06 });
  if (lod < 2) {
    const frames = buildFrames(pts.map((q) => q.p));
    for (let k = 0; k < 3; k++) {
      const s = curveAt(pts, frames, rand(rng, 0.25, 0.75));
      const d = dirFromFrame(s, rand(rng, 70, 110) * DEG, rng() * TWO_PI);
      const br = growBranch(rng, s.p, d, rand(rng, 0.5, 1.2), s.r * 0.35, s.r * 0.08, 3, { droop: 1.2, wiggle: 0.3, ao0: 0.8, ao1: 0.6 });
      const last = br.pts[br.pts.length - 1];
      if (last.p.y > -0.2) last.p.y = -0.2;
      sweepTube(ctx.bark, br.pts, { sides: 4, tint, phase: 0, rng });
    }
  }
  return finish(ctx, { trunkRadius: r });
}

// ---------------------------------------------------------------------------
// The catalogue — everything a gallery page needs without reading the code
// ---------------------------------------------------------------------------

export const CATALOG = {
  trees: Object.keys(SPECIES).map((id) => ({
    id, label: SPECIES[id].label, builder: 'buildTree', heights: [SPECIES[id].minHeight, SPECIES[id].maxHeight],
    leafKind: SPECIES[id].leafKind, biomes: SPECIES[id].biomes, hasFoliage: !['dead_pine', 'dead_snag', 'stump'].includes(id),
  })),
  bushes: Object.keys(BUSHES).map((id) => ({ id, label: BUSHES[id].label, builder: 'buildBush', heights: BUSHES[id].h, leafKind: BUSHES[id].row })),
  ferns: Object.keys(FERNS).map((id) => ({ id, label: FERNS[id].label, builder: 'buildFern', heights: FERNS[id].h, leafKind: FERNS[id].row })),
  flowers: Object.keys(FLOWERS).map((id) => ({ id, label: FLOWERS[id].label, builder: 'buildFlower', heights: FLOWERS[id].h, leafKind: LEAF_ROWS.small })),
  grass: [{ id: 'tuft', label: 'Grass Tuft', builder: 'buildGrassTuft', heights: [0.25, 0.6], leafKind: LEAF_ROWS.frond }],
  debris: Object.keys(DEBRIS).map((id) => ({ id, label: DEBRIS[id].label, builder: 'buildLogsAndDebris', heights: [0, 0], leafKind: null })),
  lods: [0, 1, 2],
  attributes: ['position', 'normal', 'uv', 'color', 'aWind'],
  atlas: { cols: LEAF_ATLAS_COLS, rows: LEAF_ATLAS_ROWS, rowMeaning: LEAF_ROWS, crownCol: LEAF_CROWN_COL },
};
