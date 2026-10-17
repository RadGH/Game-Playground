// Chibi 2.5 hair. The v2 hair block in chibi2.js is frozen for v2 looks; this is its successor (a 2.5 look only).
//
// HAIR PASS 2 (2026-10-16, owner: "fix floating parts, see-through edges, and add more original hair styles — stop
// reusing the same top front decorations"). Part A's hair was v2's pieces moved about: open sphere segments and open
// tubes on a round cap. Seen from below, behind or the top, three things went wrong, and this file is rebuilt around
// the three fixes:
//
//   1. SEE-THROUGH. The material is front-side only, so any open edge you can look past shows the inside of the far
//      wall culled away — you see straight through the hair. The cap and the back were sphere segments whose rims
//      stood up to 2 cm off the skin; every lock was a tube with an open root. Now every piece is CLOSED or TUCKED:
//      `shell()` is laid on the skull itself (read off the same head rings the face is built from) and its edge rows
//      dive under the skin, so there is no rim to look past; `strand()` is a flattened ribbon with both ends capped;
//      `slab()` (hanging hair) is a closed solid with walls on all four sides.
//   2. FLOATING. Pieces were placed by hand at fixed numbers on a round head, so on a long or wide head, or after the
//      front was raised for the brows, locks hung in the air. Every point is now asked of the scalp — `S(phi, y, lift)`
//      is a point at height y and bearing phi, `lift` off the skin — so a piece touches the head whatever its shape.
//      tools/chibi25-hair-audit.mjs measures the gap from every piece to the scalp or a neighbour (fails above 5 mm).
//   3. ORIGINALITY. Six styles shared one seven-lock fringe, four one combed set, two one blunt sheet. Each style is
//      now its own function in `STYLES` with its own front (tagged `hair:front` — the hairline of its shell plus its
//      own fringe pieces) and its own silhouette; a test fails if two styles share a front piece.
//
// FITTING UNDER HEADWEAR (part A, unchanged): one rule instead of per-pair patches. A hat says where it covers
// (`HAT_FIT`): a crown shell down to a brim line, or a band. Any hair vertex inside the covered region is pressed
// INSIDE the hair cap's surface (which every hat is built to clear); hair below the brim still hangs. A band pinches
// the hair under it. A hood keeps the v2 rule: only the fringe shows.
//
// Head space: +z forward, +x the character's left (the viewer's right in a front view), the skull spans y -0.035..0.60
// and is ~0.67 wide; one unit is one metre on a default body (positions are multiplied by H through head()).
import * as THREE from 'three';
import { shade } from '../../avatar-2d/js/render.js';
import { headRings } from './chibi2-face.js';

const mix = (c1, c2, t) => '#' + new THREE.Color(c1).lerp(new THREE.Color(c2), t).getHexString();
const TAU = Math.PI * 2, SAG = 0.009;

/**
 * Where each headwear covers, in head units. `shell`: the hair above the line y = front (at the face) .. back (at the
 * nape) is pressed inside the cap. `band`: hair within ±h of y is pinched inside radius r. `hood`: v2's hood rule. `noHang`: hanging hair (ponytails, braids, locs, long backs) is tucked away.
 * Anything not listed covers nothing (the hair is left alone).
 */
export const HAT_FIT = {
  hood: { hood: true }, hood_down: { backPad: 0.07 },          // a lowered hood lies on the back: it covers nothing on the head
  wizard: { shell: [0.5, 0.42] }, wide_brim: { shell: [0.41, 0.39] }, straw: { shell: [0.43, 0.41] }, top_hat: { shell: [0.51, 0.5] },
  feather_cap: { shell: [0.43, 0.4] }, bard_red_feather: { shell: [0.43, 0.4] }, cap: { shell: [0.44, 0.36] }, bandana: { shell: [0.44, 0.33] },
  leather_cap: { shell: [0.4, 0.3] }, horned_helm: { shell: [0.43, 0.38] }, helmet: { shell: [0.43, 0.38] }, war_helm: { shell: [0.42, 0.2] },
  plate_helm: { shell: [0.42, 0.28] }, rune_helm: { shell: [0.42, 0.36] }, wolf_helm: { shell: [0.44, 0.2], noHang: true }, tricorn: { shell: [0.46, 0.46] },
  great_helm: { shell: [-0.1, -0.1], noHang: true }, dragon_helm: { shell: [-0.1, -0.1], noHang: true }, chain_coif: { shell: [0.47, -0.1], face: true, noHang: true }, goggles_up: { shell: [0.49, 0.3] },
  crown: { band: [0.57, 0.06, 0.262] }, circlet: { band: [0.45, 0.03, 0.318] }, headband: { band: [0.46, 0.035, 0.32] }, feather_band: { band: [0.46, 0.035, 0.32] },
  bone_headdress: { band: [0.46, 0.04, 0.322] },
  flower: { spot: [0.27, 0.47, 0.15, 0.085] },                   // a flower over the left temple: hair under it lies flat
};
/** g5_ and other hats: anything whose id says helm/hat/hood/cap gets a generic shell (a 2.5 look only). */
export function hatFit(id, extra = {}) {
  if (!id || id === 'none') return null;
  if (HAT_FIT[id]) return HAT_FIT[id];
  if (extra[id] != null) return { shell: [extra[id], extra[id] - 0.06] };
  if (/hood/.test(id)) return { hood: true };
  if (/helm|hat|cap|coif|cowl|mask/.test(id)) return { shell: [0.42, 0.3] };
  return null;
}
/** Styles whose hair covers normal ears (the 2D pictures hide the ears under these). */
export const HAIR_COVERS_EARS = ['long', 'wavy', 'bob', 'hood_hair', 'locs', 'side_swept', 'twin_tails', 'curly_bob', 'court_cut', 'wolf_cut', 'feathered'];

// ---------------------------------------------------------------------------------------------- the scalp kit
// Everything a style needs, in head units. One kit per build (it reads the head rings of this look).
function makeKit(a, rig, c) {
  const rings = headRings(a, rig), top = rings[rings.length - 1][0], bottom = rings[0][0];
  const ringAt = (y) => {
    if (y <= rings[0][0]) return rings[0];
    for (let i = 1; i < rings.length; i++) if (y <= rings[i][0]) {
      const p = rings[i - 1], q = rings[i], t = (y - p[0]) / (q[0] - p[0]);
      return [y, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    }
    return rings[rings.length - 1];
  };
  // the skull mesh is profile(rings, 20): a 20-sided polygon per ring, up to 1.2% inside the ellipse at the corners.
  // Asking the ellipse is the safe side (hair laid on it is never inside the drawn skin).
  const inside = (x, y, z) => { if (y < bottom || y > top) return false; const [, rx, rz] = ringAt(y); return (x / rx) ** 2 + (z / rz) ** 2 < 1; };
  const C = [0, 0.28, 0];
  const dir = (th, ph) => [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
  const skullR = (d) => { let lo = 0, hi = 0.9; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (inside(C[0] + d[0] * m, C[1] + d[1] * m, C[2] + d[2] * m)) lo = m; else hi = m; } return lo; };
  /** a point at polar angle th (0 = straight up from the head centre) and bearing ph (0 = the face), lift off the skin */
  const T3 = (th, ph, lift = 0) => { const d = dir(th, ph), r = skullR(d) + lift; return [C[0] + d[0] * r, C[1] + d[1] * r, C[2] + d[2] * r]; };
  const thAt = (ph, y) => { let lo = 0, hi = Math.PI; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (T3(m, ph)[1] > y) lo = m; else hi = m; } return (lo + hi) / 2; };
  /** a point on the scalp at height y (the skin's own height) and bearing ph, lifted off the skin */
  const S = (ph, y, lift = 0) => T3(thAt(ph, y), ph, lift);
  return { rings, ringAt, inside, C, dir, skullR, T3, thAt, S };
}

/**
 * A hairline: the height of the hair's edge on the skin at each bearing, from knots on |phi| (0 = mid forehead,
 * 0.85 = temple, 1.25 = in front of the ear, 1.55 = over the ear, 2.0 = behind it, PI = the nape). `skew(ph)` adds a
 * signed offset (a side part, a shaved side).
 */
function hairline({ f = 0.48, t = 0.43, sb = 0.29, e = 0.37, b = 0.25, n = 0.07, skew = null } = {}) {
  // behind the ear the hair comes down to the nape (a high `b` left a shield of bare neck at the back corners)
  const K = [[0, f], [0.85, t], [1.25, sb], [1.55, e], [2.0, Math.min(b, 0.2)], [Math.PI, n]];
  return (ph) => {
    let p = Math.abs(((ph + Math.PI) % TAU + TAU) % TAU - Math.PI), y = K[K.length - 1][1];
    for (let i = 1; i < K.length; i++) if (p <= K[i][0]) { const u = (p - K[i - 1][0]) / (K[i][0] - K[i - 1][0]), s = (1 - Math.cos(u * Math.PI)) / 2; y = K[i - 1][1] + (K[i][1] - K[i - 1][1]) * s; break; }
    return y + (skew ? skew(ph) : 0);
  };
}

/** Make every triangle of a closed solid face out of it (signed volume positive), or of an open shell away from `C`. */
function orientClosed(g) {
  const p = g.attributes.position, idx = g.index.array; let vol = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) { a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]); vol += a.dot(b.cross(c)); }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; }
  return g;
}
function geo(pos, idx) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

export function buildHair25(a, rig, c) {
  const { head } = c, hairId = a.hair.id, H = rig.headScale;
  const tag = c.tag || (() => {});
  tag('hair');
  if (hairId === 'bald') return;
  const style = STYLES[hairId] || STYLES.short;
  const fit = c.fit, hoodUp = !!fit?.hood, noHang = hoodUp || !!fit?.noHang, shellFit = fit?.shell, band = fit?.band;
  const browTop = Math.max(0.4, c.browTop ?? 0.42);
  const k = makeKit(a, rig, c);
  const { S, T3, thAt, skullR, dir, C } = k;
  const hair = a.hair.color, skin = a.body.skin;
  const col = {
    hair, hair2: a.hair.color2 || mix(hair, '#ffffff', 0.25), dark: shade(hair, -0.12), deep: shade(hair, -0.25),
    light: shade(hair, 0.12), stub: mix(skin, hair, 0.38), skin,
  };

  // ---- fitting under a hat (part A's rule)
  const faceWidth = c.faceWidth || 1, faceDepth = c.faceDepth || 1;
  const CAP = { cy: 0.32, rx: 0.348 * faceWidth, ry: 0.31, rz: 0.28 * faceDepth };
  const capR = (x, y, z) => Math.hypot(x / CAP.rx, (y - CAP.cy) / CAP.ry, (z + 0.012) / CAP.rz);
  const brimAt = (z) => { const t = THREE.MathUtils.clamp((0.27 - z) / 0.55, 0, 1); return shellFit[0] + (shellFit[1] - shellFit[0]) * t; };
  const spot = fit?.spot;
  const press = (v) => {
    if (spot) {
      // hair within the flower's reach is laid flat on the scalp under it (lifted no more than 8 mm off the skin)
      const [sx, sy, sz, sr] = spot; if (Math.hypot(v.x - sx, v.y - sy, v.z - sz) > sr) return false;
      const d = new THREE.Vector3(v.x - C[0], v.y - C[1], v.z - C[2]), r = d.length(); d.divideScalar(r);
      const lim = skullR([d.x, d.y, d.z]) + 0.008; if (r > lim) v.set(C[0] + d.x * lim, C[1] + d.y * lim, C[2] + d.z * lim);
      return true;
    }
    if (shellFit) {
      if (v.y < brimAt(v.z) - 0.005 || (fit.face && v.z > 0.18 && v.y < 0.47)) return false;
      const r = capR(v.x, v.y, v.z), lim = 0.985;
      if (r > lim) { const s = lim / r; v.set(v.x * s, CAP.cy + (v.y - CAP.cy) * s, (v.z + 0.012) * s - 0.012); }
      return true;
    }
    if (band) {
      const [by, bh, br] = band, d = Math.abs(v.y - by);
      if (d > bh + 0.12) return false;
      const rr = Math.hypot(v.x / br, v.z / (br * 0.86)), lim = 0.97 + Math.max(0, d - bh) * 4;
      if (rr > lim) { const s = lim / rr; v.x *= s; v.z *= s; }
      return true;
    }
    return false;
  };
  const tmp = new THREE.Vector3();
  const hangBend = { bone: 'chest', at: 0.02 * H, width: 0.09 * H };

  /**
   * Hand one piece to head(). `part` is the trace tag (front / cap / side / back / extra); `hang` = it falls past the
   * nape (follows the chest, tucked away under a pelt or mail hood); `crown` = a volume dropped if a hat covers all of
   * it; `tall` = not shown under a raised hood (a crest, a quiff).
   */
  // a helm that comes down the sides (war helm: back brim under 0.25) covers hair hanging by the cheeks; a lowered hood
  // lying on the back covers hair hanging down the back
  const lowSides = !!(shellFit && shellFit[1] < 0.25), hoodBack = !!fit?.backPad;
  const put = (g, colour, { part = 'extra', hang = false, crown = false, tall = false } = {}) => {
    if ((hang && (noHang || (lowSides && part === 'side') || (hoodBack && part === 'back'))) || (hoodUp && (part !== 'front' || tall))) { g.dispose(); return; }
    if (fit && !hoodUp) {
      const p = g.attributes.position; let moved = 0;
      for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i); if (press(tmp)) { moved++; p.setXYZ(i, tmp.x, tmp.y, tmp.z); } }
      if (crown && shellFit && moved === p.count) { g.dispose(); return; }
    }
    g.computeVertexNormals();
    tag('hair:' + part);
    head(g, colour, hang ? { bend: hangBend } : {});
  };

  // ---------------------------------------------------------------- shell: hair laid on the skull, edges tucked under
  /**
   * `edge(ph)` the hairline height; `hole(ph)` an inner edge (a tonsure's bald crown); `t(p, ph, s)` the thickness at
   * a skull point (s 0 at the crown .. 1 at the hairline); the hairline's own rows ease to `te` and the last row dives
   * 1.2 cm under the skin, so the edge can never be looked past. `arc` limits the bearings (a strip). The triangles
   * over the forehead are split off as the style's FRONT (`hair:front`), the rest is `cap` — one surface, normals
   * computed before the split so there is no seam.
   */
  const shell = ({ edge, hole = null, t = () => 0.02, te = 0.004, cols = 24, rows = 7, colour = hair, arc = null, front = true, part = 'cap', crown = false, frontColour = null }) => {
    const pos = [], idx = [], rowsN = rows + 1 + (hole ? 1 : 0) + 1;
    const ncol = arc ? cols + 1 : cols;
    for (let i = 0; i < ncol; i++) {
      const ph = arc ? arc[0] + (arc[1] - arc[0]) * i / cols : -Math.PI + TAU * i / cols;
      const thE = thAt(ph, edge(ph)), thH = hole ? thAt(ph, hole(ph)) : 0;
      const tuckRow = (th) => { const d = dir(th, ph), r = skullR(d) - 0.012; pos.push(C[0] + d[0] * r, C[1] + d[1] * r, C[2] + d[2] * r); };
      if (hole) tuckRow(Math.max(0, thH - 0.06));
      for (let j = 0; j <= rows; j++) {
        const s = j / rows, th = thH + (thE - thH) * s, d = dir(th, ph), sk = skullR(d);
        const e = hole ? Math.abs(2 * s - 1) : s, sideEase = arc ? Math.min(1, Math.min(i, cols - i) / 1.5) : 1;
        // the crown pole is one point for every column (a thickness that varies with the bearing would open a star there)
        const tp = (!hole && j === 0) ? t([C[0] + d[0] * sk, C[1] + d[1] * sk, C[2] + d[2] * sk], 0, 0) : t([C[0] + d[0] * sk, C[1] + d[1] * sk, C[2] + d[2] * sk], ph, s);
        const th0 = te + (Math.max(te, tp) - te) * (1 - e ** 6);
        // + SAG: the shell's flat triangles cut inside the curve between their corners, and the skull's 20-sided rings poke
        // out between theirs and at the skull's ring creases (up to 4 mm, measured); 9 mm more keeps a thin (stubble) shell outside the skin everywhere
        const r = sk + (arc && (i === 0 || i === cols) ? -0.012 : (th0 + SAG * (1 - e ** 6)) * sideEase);
        pos.push(C[0] + d[0] * r, C[1] + d[1] * r, C[2] + d[2] * r);
      }
      tuckRow(thE + 0.06);
    }
    for (let i = 0; i < (arc ? cols : cols); i++) {
      const i2 = arc ? i + 1 : (i + 1) % cols;
      for (let j = 0; j < rowsN - 1; j++) {
        const a0 = i * rowsN + j, b0 = i2 * rowsN + j;
        // the crown pole (no hole): every column's first vertex is the same point, one triangle per column there
        if (!hole && j === 0) { idx.push(a0, a0 + 1, b0 + 1); continue; }
        idx.push(a0, a0 + 1, b0 + 1, a0, b0 + 1, b0);
      }
    }
    // face every triangle away from the head centre
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
    let out = 0;
    for (let q = 0; q < idx.length; q += 3) { v0.fromArray(pos, idx[q] * 3); v1.fromArray(pos, idx[q + 1] * 3); v2.fromArray(pos, idx[q + 2] * 3); n.subVectors(v1, v0).cross(m.subVectors(v2, v0)); m.addVectors(v0, v1).add(v2).divideScalar(3).sub(new THREE.Vector3(...C)); out += Math.sign(n.dot(m)); }
    if (out < 0) for (let q = 0; q < idx.length; q += 3) { const s = idx[q]; idx[q] = idx[q + 1]; idx[q + 1] = s; }
    const g = geo(pos, idx); g.computeVertexNormals();
    if (!front) { put(g, colour, { part, crown }); return; }
    // split the forehead off as the front
    const nrm = g.attributes.normal.array, fi = [], ci = [];
    for (let q = 0; q < idx.length; q += 3) {
      const z = (pos[idx[q] * 3 + 2] + pos[idx[q + 1] * 3 + 2] + pos[idx[q + 2] * 3 + 2]) / 3, y = (pos[idx[q] * 3 + 1] + pos[idx[q + 1] * 3 + 1] + pos[idx[q + 2] * 3 + 1]) / 3;
      (z > 0.13 && y > 0.36 ? fi : ci).push(idx[q], idx[q + 1], idx[q + 2]);
    }
    for (const [list, p] of [[ci, part], [fi, 'front']]) {
      if (!list.length) continue;
      const map = new Map(), P = [], N = [], I = [];
      for (const v of list) { if (!map.has(v)) { map.set(v, P.length / 3); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]); } I.push(map.get(v)); }
      const h = geo(P, I); h.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      // put() recomputes normals only when a hat moved vertices; keep the shared ones otherwise
      putKeep(h, p === 'front' && frontColour ? frontColour : colour, { part: p, crown });
    }
    g.dispose();
  };
  const putKeep = (g, colour, o) => {
    if (o.part !== 'front' && hoodUp) { g.dispose(); return; }
    if (hoodUp) { g.dispose(); return; }                               // a raised hood hides the scalp entirely
    if (fit) {
      const p = g.attributes.position; let moved = 0;
      for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i); if (press(tmp)) { moved++; p.setXYZ(i, tmp.x, tmp.y, tmp.z); } }
      if (o.crown && shellFit && moved === p.count) { g.dispose(); return; }
      if (moved) g.computeVertexNormals();
    }
    tag('hair:' + o.part);
    head(g, colour, {});
  };

  // ---------------------------------------------------------------- strand: a flattened ribbon with both ends capped
  /**
   * `pts` head-space points (use S()/T3() so they sit on the scalp), `w` widths along it, `flat` thickness / width.
   * The ribbon's flat side faces away from the head centre (it lies on the hair it grows from).
   */
  let nth = 0;
  const strand = (pts, w, colour, { flat = 0.42, sides = 6, steps = 8, closed = false, stagger = true, ...o } = {}) => {
    // neighbouring ribbons of one sweep would lie at the same height and flicker where they overlap (z-fighting): each
    // strand is lifted 0 / 5 / 10 mm in turn past its root (the root stays where it grows), so no two neighbours share a surface
    const lift = stagger ? (nth++ % 3) * 0.005 : 0;
    const curve = new THREE.CatmullRomCurve3(pts.map((p, i) => { const v = new THREE.Vector3(...p), d = v.clone().sub(new THREE.Vector3(...C)).normalize(); return v.addScaledVector(d, i ? lift : 0); }), closed);
    const pos = [], idx = [], cen = new THREE.Vector3(...C), Tn = new THREE.Vector3(), R = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
    const wAt = (t) => { const f = t * (w.length - 1), i = Math.floor(f); return w[Math.min(i, w.length - 1)] + ((w[Math.min(i + 1, w.length - 1)] - w[Math.min(i, w.length - 1)]) * (f - i)); };
    const ring = steps + 1; let prev = null;
    for (let i = 0; i <= steps; i++) {
      const t = closed ? i / (steps + 1) : i / steps, P = curve.getPointAt(t);
      curve.getTangentAt(t, Tn); R.subVectors(P, cen).normalize();
      // the ribbon lies flat on the head (side = tangent x radial); where the strand points straight OUT of the head that
      // cross product vanishes and flips, which pinched spikes and brush tufts inside out — there the side is carried on
      // from the last ring (parallel transport), blended by how well defined the flat-on-the-head side is
      side.crossVectors(Tn, R); const k2 = side.length();
      if (prev) { const pt = prev.clone().addScaledVector(Tn, -prev.dot(Tn)).normalize(); if (k2 > 1e-6) { side.divideScalar(k2); if (side.dot(pt) < 0) side.negate(); side.lerp(pt, 1 - Math.min(1, k2 / 0.5)); } else side.copy(pt); }
      else if (k2 < 1e-6) side.set(1, 0, 0);
      side.normalize(); prev = side.clone(); up.crossVectors(side, Tn).normalize();
      const r = Math.max(0.0015, wAt(t)), h = Math.max(0.0012, r * flat);
      for (let j = 0; j < sides; j++) { const an = TAU * j / sides; pos.push(P.x + side.x * Math.cos(an) * r + up.x * Math.sin(an) * h, P.y + side.y * Math.cos(an) * r + up.y * Math.sin(an) * h, P.z + side.z * Math.cos(an) * r + up.z * Math.sin(an) * h); }
    }
    const last = closed ? ring : steps;
    for (let i = 0; i < last; i++) for (let j = 0; j < sides; j++) {
      const a0 = (i % ring) * sides + j, a1 = (i % ring) * sides + (j + 1) % sides, b0 = ((i + 1) % ring) * sides + j, b1 = ((i + 1) % ring) * sides + (j + 1) % sides;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
    // end caps: the two ends face opposite ways, so their fans wind opposite ways (one fan for both left one cap inside out)
    if (!closed) for (const [ri, ci, flip] of [[0, curve.getPointAt(0), false], [steps, curve.getPointAt(1), true]]) {
      const cv = pos.length / 3; pos.push(ci.x, ci.y, ci.z);
      for (let j = 0; j < sides; j++) { const a0 = ri * sides + j, a1 = ri * sides + (j + 1) % sides; if (flip) idx.push(cv, a1, a0); else idx.push(cv, a0, a1); }
    }
    put(orientClosed(geo(pos, idx)), colour, o);
  };

  // ---------------------------------------------------------------- slab: hanging hair as a closed solid
  /**
   * Bearings `ph` [from, to] across, heights `y` [top, bottom(u)] down; `lift(u, v)` the outer surface off the skin
   * (below the skull's bottom the ring at y 0.06 carries on, opened by `flare`), `thick(u, v)` its depth. Below the skull
   * the hair is kept behind `zMin(y)` in front of nothing it should not be in (the chest), by pushing z back.
   */
  const slab = ({ ph: [p0, p1], y: [y0, yb], lift = () => 0.03, thick = () => 0.025, cols = 10, rows = 6, flare = 0.25, bend = null, colour = hair, ...o }) => {
    const bot = typeof yb === 'function' ? yb : () => yb, pos = [], idx = [], W = cols + 1, Hh = rows + 1;
    const at = (u, v, inner) => {
      const ph = p0 + (p1 - p0) * u, y = y0 + (bot(u) - y0) * v, L = lift(u, v) - (inner ? thick(u, v) : 0);
      const yy = Math.max(y, 0.06), [, rx, rz] = k.ringAt(yy), open = 1 + Math.max(0, 0.06 - y) * flare;
      let x = Math.sin(ph) * (rx * open + L), z = Math.cos(ph) * (rz * open + L);
      if (bend) [x, z] = bend(x, y, z, u, v, inner);
      return [x, y, z];
    };
    for (const inner of [false, true]) for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) pos.push(...at(i / cols, j / rows, inner));
    const O = 0, I = W * Hh, id = (s, i, j) => s + j * W + i;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      idx.push(id(O, i, j), id(O, i + 1, j), id(O, i + 1, j + 1), id(O, i, j), id(O, i + 1, j + 1), id(O, i, j + 1));
      idx.push(id(I, i, j), id(I, i + 1, j + 1), id(I, i + 1, j), id(I, i, j), id(I, i, j + 1), id(I, i + 1, j + 1));
    }
    // walls: top, bottom, left, right
    for (let i = 0; i < cols; i++) for (const j of [0, rows]) { const f = j === 0; const q = [id(O, i, j), id(O, i + 1, j), id(I, i + 1, j), id(I, i, j)]; if (f) idx.push(q[0], q[3], q[2], q[0], q[2], q[1]); else idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); }
    for (let j = 0; j < rows; j++) for (const i of [0, cols]) { const f = i === 0; const q = [id(O, i, j), id(O, i, j + 1), id(I, i, j + 1), id(I, i, j)]; if (f) idx.push(q[0], q[1], q[2], q[0], q[2], q[3]); else idx.push(q[0], q[3], q[2], q[0], q[2], q[1]); }
    put(orientClosed(geo(pos, idx)), colour, o);
  };

  // ---------------------------------------------------------------- small solids
  const ball = (p, s, colour, o = {}) => { const g = new THREE.SphereGeometry(1, o.seg || 9, o.rings || 6); g.scale(...(Array.isArray(s) ? s : [s, s, s])); if (o.rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rot))); g.translate(...p); put(g, colour, o); };
  const knotAt = (p, r, tube, colour, axis = [0, 1, 0], o = {}) => { const g = new THREE.TorusGeometry(r, tube, 5, 12); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize())); g.translate(...p); put(g, colour, o); };
  const cone = (p, r, h, colour, rot = [0, 0, 0], o = {}) => { const g = new THREE.ConeGeometry(r, h, 6); g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot))); g.translate(...p); put(g, colour, o); };
  /** a braid: beads along a path, each overlapping the next (so the chain never breaks) */
  const braid = (pts, size, n, colours, o = {}) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1), P = curve.getPointAt(t), Tn = curve.getTangentAt(t), s = (Array.isArray(size) ? size[0] + (size[1] - size[0]) * t : size);
      const g = new THREE.IcosahedronGeometry(1, 0); g.scale(s * 1.05, s * 1.25, s * 0.9);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Tn.clone().normalize()));
      g.translate(P.x, P.y, P.z); put(g, colours[i % colours.length], typeof o === 'function' ? o(i, t) : o);
    }
  };
  /** a fringe lock from the hairline: root under the shell at (ph0, y0), arching out, tip ending ABOVE the brows */
  const tipY = y => Math.max(y, browTop + 0.03);
  const ctx = { k, S, T3, thAt, col, hair, browTop, tipY, shell, strand, slab, ball, knotAt, cone, braid, hairline, noHang, hoodUp, shellFit, fit };
  style(ctx);
}

// ---------------------------------------------------------------------------------------------- the styles
// Each style is its own function: its shell (hairline + volume), its own FRONT, its own silhouette. Numbers are head
// units. Brows sit at y ~0.39-0.42 (browTop), ears at x ±0.33 y 0.17-0.33, the chest's back at z -0.14 below the nape.
const lerp = (a, b, t) => a + (b - a) * t;
const volTop = (base, top, from = 0.45) => (p) => base + top * Math.max(0, (p[1] - from) / (0.6 - from));
const flatLift = (v) => () => v;

/** long hair at the back: a closed slab from under the shell edge down to y `to` */
const backCurtain = (x, { span = 1.55, top = 0.32, to = -0.22, lift = 0.035, bottom = null, colour, wave = 0, flare = 0.25, cols = 10 } = {}) => x.slab({
  ph: [Math.PI - span, Math.PI + span], y: [top, bottom || to], cols, rows: 6, flare, colour: colour || x.hair, hang: true,
  lift: (u, v) => lerp(0.006, lift, Math.min(1, v * 3)) + (wave ? Math.sin(v * 9 + u * 2) * wave * Math.min(1, v * 3) : 0) + Math.max(0, 0.03 - 0.06 * v) * 0,
  thick: (u, v) => lerp(0.02, 0.026, v) * (1 - 0.6 * Math.abs(2 * u - 1) ** 6),
  part: 'back',
});

const STYLES = {
  // ---------------- the 20 originals, each with its own front now
  buzz(x) {   // a tight stubble cap with squared temples; its front is the hairline itself
    x.shell({ edge: x.hairline({ f: 0.465, t: 0.445, sb: 0.3, e: 0.36, b: 0.23, n: 0.08 }), t: () => 0.007, te: 0.003, colour: x.col.dark, rows: 7, cols: 28 });
  },
  short(x) {  // tousled: five chunky locks spilling forward and to the viewer's right
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.3, e: 0.37, b: 0.25, n: 0.08 }), t: volTop(0.02, 0.025) });
    for (let i = 0; i < 5; i++) { const ph = -0.56 + i * 0.27; x.strand([x.S(ph * 0.45, 0.58, 0.005), x.S(ph, 0.52, 0.034), x.S(ph + 0.13, x.tipY(0.44) + (i % 2) * 0.022, 0.02)], [0.06, 0.068, 0.012], i % 2 ? x.col.light : x.hair, { part: 'front' }); }
  },
  side_part(x) {   // a deep part on the left; the hair from it sweeps across the forehead to the right temple
    x.shell({ edge: x.hairline({ f: 0.49, t: 0.44, sb: 0.3, e: 0.37, b: 0.25, n: 0.08 }), t: volTop(0.022, 0.015) });
    for (let i = 0; i < 4; i++) x.strand([x.S(-0.42 + i * 0.04, 0.59 - i * 0.01, 0.006), x.S(0.15 + i * 0.05, 0.535 - i * 0.012, 0.04), x.S(0.86 - i * 0.1, x.tipY(0.44 + i * 0.012), 0.024)], [0.06, 0.075, 0.015], i % 2 ? x.col.light : x.hair, { part: 'front', steps: 9 });
    x.strand([x.S(-0.45, 0.6, 0.02), x.S(-0.5, 0.52, 0.024)], [0.006, 0.005], x.col.deep, { part: 'front', steps: 3, sides: 4 });                 // the parting groove
    x.strand([x.S(-0.5, 0.56, 0.006), x.S(-0.85, 0.47, 0.03), x.S(-1.05, 0.42, 0.015)], [0.05, 0.05, 0.01], x.col.dark, { part: 'side' });   // the short side
  },
  bangs(x) {   // a blunt-cut sheet straight across, with strand grooves
    x.shell({ edge: x.hairline({ f: 0.53, t: 0.43, sb: 0.29, e: 0.36, b: 0.24, n: 0.08 }), t: volTop(0.022, 0.012) });
    const cut = x.browTop + 0.01;
    x.slab({ ph: [-1.05, 1.05], y: [0.57, cut], cols: 12, rows: 3, lift: (u, v) => lerp(0.012, 0.026, v), thick: () => 0.018, part: 'front', flare: 0 });
    const v = y => (0.57 - y) / (0.57 - cut), on = y => lerp(0.012, 0.026, v(y)) + 0.003;   // the slab's outer face at a height
    for (let i = 1; i < 6; i++) { const ph = (i - 3) * 0.3; x.strand([x.S(ph, 0.53, on(0.53)), x.S(ph, 0.49, on(0.49)), x.S(ph * 1.02, cut + 0.03, on(cut + 0.03))], [0.006, 0.005, 0.004], x.col.dark, { part: 'front', steps: 4, sides: 4, stagger: false }); }
  },
  bob(x) {   // a chin bob: rounded hem all round, and an arched fringe with a rolled edge
    x.shell({ edge: x.hairline({ f: 0.53, t: 0.45, sb: 0.4, e: 0.4, b: 0.3, n: 0.2 }), t: volTop(0.026, 0.02) });
    x.slab({ ph: [0.72, TAU - 0.72], y: [0.46, 0.07], cols: 14, rows: 6, lift: (u, v) => 0.02 + Math.sin(v * Math.PI * 0.85) * 0.05, thick: (u, v) => 0.024 + 0.02 * Math.sin(v * Math.PI * 0.85), part: 'side', flare: 0 });
    const cut = x.browTop + 0.012, arch = u => cut + 0.028 * (1 - (2 * u - 1) ** 2);
    x.slab({ ph: [-0.86, 0.86], y: [0.57, arch], cols: 10, rows: 3, lift: (u, v) => lerp(0.012, 0.03, v), thick: () => 0.02, part: 'front', flare: 0 });
    x.strand(Array.from({ length: 7 }, (_, i) => { const u = i / 6; return x.S(-0.86 + 1.72 * u, arch(u) + 0.008, 0.03); }), [0.013, 0.016, 0.013], x.hair, { part: 'front', steps: 10 });
  },
  long(x) {   // curtain bangs from a centre part, flowing into side curtains to the shoulders
    x.shell({ edge: x.hairline({ f: 0.53, t: 0.45, sb: 0.34, e: 0.36, b: 0.28, n: 0.12 }), t: volTop(0.022, 0.015) });
    for (const s of [-1, 1]) {
      x.strand([x.S(s * 0.03, 0.59, 0.006), x.S(s * 0.35, x.tipY(0.5), 0.04), x.S(s * 0.8, 0.44, 0.042), x.S(s * 1.12, 0.33, 0.036)], [0.05, 0.085, 0.075, 0.05], x.col.light, { part: 'front', steps: 10 });
      x.slab({ ph: s > 0 ? [0.95, 1.6] : [-1.6, -0.95], y: [0.44, -0.2], cols: 4, rows: 7, lift: (u, v) => 0.03 + v * 0.025, thick: () => 0.03, part: 'side', hang: true, flare: 0.5 });
    }
    backCurtain(x, { to: -0.24, span: 1.68 });
  },
  wavy(x) {   // an off-centre part; S-waves over the temples, wavy curtains and a scalloped hem
    x.shell({ edge: x.hairline({ f: 0.52, t: 0.45, sb: 0.33, e: 0.36, b: 0.28, n: 0.12 }), t: volTop(0.026, 0.02) });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const pts = Array.from({ length: 6 }, (_, j) => {
        const u = j / 5, ph = 0.12 + s * (0.04 + u * (1.0 + i * 0.16)), y = lerp(0.585, 0.36 - i * 0.05, u) + Math.sin(u * 7) * 0.012;
        return x.S(ph, Math.abs(ph) < 1.0 ? Math.max(y, x.browTop + 0.06) : y, 0.03 + Math.sin(u * 6 + i) * 0.012 + (u < 0.15 ? -0.02 : 0));   // over the brows the waves stay up
      });
      x.strand(pts, [0.04, 0.06, 0.05, 0.03], i ? x.hair : x.col.light, { part: 'front', steps: 12 });
    }
    for (const s of [-1, 1]) x.slab({ ph: s > 0 ? [1.0, 1.6] : [-1.6, -1.0], y: [0.42, -0.2], cols: 4, rows: 9, lift: (u, v) => 0.035 + Math.sin(v * 10) * 0.018, thick: () => 0.03, part: 'side', hang: true, flare: 0.5 });
    backCurtain(x, { to: u => -0.22 + 0.035 * Math.sin(u * 18), wave: 0.016 });
  },
  ponytail(x) {   // pulled back flat with combed grooves, one loose strand by the left temple, a tail low on the right
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.31, e: 0.37, b: 0.25, n: 0.09 }), t: () => 0.016, frontColour: x.col.light });
    for (let i = 0; i < 3; i++) x.strand([x.S((i - 1) * 0.35, 0.505, 0.012), x.T3(0.45, (i - 1) * 0.5, 0.017), x.T3(1.3, Math.PI - (i - 1) * 0.4, 0.014)], [0.004, 0.005, 0.004], x.col.dark, { part: 'front', sides: 4, steps: 6 });
    x.strand([x.S(-0.42, 0.53, 0.008), x.S(-0.82, 0.465, 0.03), x.S(-0.98, 0.36, 0.028), x.S(-1.02, 0.27, 0.02)], [0.02, 0.026, 0.018, 0.004], x.hair, { part: 'front' });
    const tie = x.S(2.5, 0.33, 0.03);
    x.knotAt(tie, 0.045, 0.02, x.col.hair2, [0.6, 0, -0.8]);
    x.strand([tie, [0.36, 0.13, -0.17], [0.38, -0.08, -0.17], [0.31, -0.24, -0.14]], [0.07, 0.095, 0.075, 0.02], x.hair, { hang: true, part: 'back', steps: 10, flat: 0.8 });
  },
  bun(x) {   // swept UP from the forehead (a high front pouf) to a bun on the back of the crown
    x.shell({ edge: x.hairline({ f: 0.49, t: 0.44, sb: 0.32, e: 0.37, b: 0.27, n: 0.1 }), t: (p) => 0.016 + 0.02 * Math.max(0, p[2] - 0.05) * (p[1] > 0.45 ? 1 : 0) });
    const bun = [0, 0.63, -0.18];
    for (let i = 0; i < 3; i++) { const ph = (i - 1) * 0.45; x.strand([x.S(ph, 0.5, 0.012), x.S(ph * 0.8, 0.585, 0.04), x.T3(0.25, ph * 0.5 + (ph ? 0 : 0), 0.03), [bun[0] + ph * 0.06, bun[1] - 0.02, bun[2] + 0.08]], [0.045, 0.06, 0.05, 0.03], i === 1 ? x.col.light : x.hair, { part: 'front', steps: 9 }); }
    x.ball(bun, [0.12, 0.11, 0.11], x.hair, { crown: true });
    x.knotAt([0, 0.56, -0.15], 0.07, 0.014, x.col.hair2, [0, 0.7, -0.7], { crown: true });
  },
  buns(x) {   // a straight centre part; each half combed up and out to its own bun high on the side
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.31, e: 0.37, b: 0.26, n: 0.1 }), t: () => 0.018 });
    x.strand([x.S(0, 0.6, 0.019), x.S(0, 0.5, 0.019)], [0.005, 0.004], x.col.deep, { part: 'front', steps: 3, sides: 4 });
    for (const s of [-1, 1]) {
      const bun = [s * 0.25, 0.6, -0.04];
      for (let i = 0; i < 2; i++) x.strand([x.S(s * (0.06 + i * 0.25), 0.5 - i * 0.02, 0.012), x.S(s * (0.3 + i * 0.3), 0.55, 0.032), [bun[0] * 0.8, bun[1] - 0.03, bun[2] + 0.06]], [0.04, 0.05, 0.03], i ? x.hair : x.col.light, { part: 'front' });
      x.ball(bun, [0.11, 0.105, 0.1], x.hair, { crown: true });
      x.knotAt([bun[0] * 0.86, bun[1] - 0.07, bun[2]], 0.06, 0.013, x.col.hair2, [s * 0.5, 1, 0], { crown: true });
    }
  },
  mohawk(x) {   // shaved sides; a crest of upright blades from the forehead to the nape, the first curling forward
    x.shell({ edge: x.hairline({ f: 0.47, t: 0.44, sb: 0.3, e: 0.36, b: 0.23, n: 0.08 }), t: () => 0.006, te: 0.003, colour: x.col.stub, rows: 7 });
    // a solid fin along the midline (a ribbon stood on its edge: narrow sideways, tall off the scalp), forehead to the
    // back of the crown, with a few points along its top
    const path = [[0.7, 0], [0.35, 0], [0.02, 0], [0.4, Math.PI], [0.72, Math.PI]];
    x.strand(path.map(([th, ph], i) => x.T3(th, ph, [0.035, 0.07, 0.085, 0.075, 0.04][i])), [0.02, 0.034, 0.04, 0.034, 0.02], x.hair, { flat: 2.8, steps: 10, part: 'extra', crown: true, tall: true, stagger: false });
    x.strand([x.T3(0.78, 0, -0.004), x.T3(0.66, 0, 0.07), x.T3(0.82, 0, 0.12)], [0.02, 0.02, 0.003], x.col.light, { flat: 2.5, steps: 5, part: 'front', crown: true, tall: true, stagger: false });   // the front point curls forward
    for (const [th, ph] of [[0.4, 0], [0.05, 0], [0.38, Math.PI]]) x.strand([x.T3(th, ph, 0.1), x.T3(th + (ph ? 0.1 : -0.06), ph, 0.19)], [0.022, 0.002], x.hair, { flat: 0.7, steps: 3, crown: true, tall: true, stagger: false });
  },
  spiky(x) {   // spikes: a row up and forward off the hairline, more fanned round the crown
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.31, e: 0.37, b: 0.25, n: 0.08 }), t: () => 0.02 });
    for (let i = 0; i < 6; i++) { const ph = -0.9 + i * 0.36; x.strand([x.S(ph, 0.505, 0.004), x.S(ph * 1.05, 0.565, 0.05), x.T3(0.3 + Math.abs(ph) * 0.45, ph * 1.1, 0.19)], [0.05, 0.04, 0.003], i % 2 ? x.col.light : x.hair, { part: 'front', flat: 0.85, crown: true, tall: true, steps: 5 }); }   // standing UP off the hairline, over the crown line
    for (let i = 0; i < 8; i++) { const ph = i / 8 * TAU, th = 0.55 + (i % 2) * 0.35; if (Math.cos(ph) > 0.6) continue; x.strand([x.T3(th, ph, 0.0), x.T3(th + 0.1, ph, 0.08), x.T3(th + 0.25, ph, 0.15)], [0.055, 0.04, 0.003], x.hair, { flat: 0.6, crown: true, steps: 5 }); }
  },
  curly(x) {   // tight curls: a bumpy cap, a row of curls along the hairline, more round the back
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.31, e: 0.37, b: 0.24, n: 0.08 }), t: (p, ph, s) => 0.024 + 0.01 * Math.sin(ph * 7) * Math.sin(s * 9) });
    for (let i = 0; i < 7; i++) { const ph = -1.0 + i / 6 * 2.0; x.ball(x.S(ph, x.tipY(0.49 - Math.abs(ph) * 0.03), 0.02), [0.05, 0.048, 0.042], i % 2 ? x.col.light : x.hair, { part: 'front', seg: 7, rings: 5 }); }
    for (let i = 0; i < 10; i++) { const ph = Math.PI + (i - 4.5) * 0.36; x.ball(x.S(ph, 0.28 + (i % 2) * 0.12, 0.03), 0.06, i % 2 ? x.col.dark : x.hair, { seg: 7, rings: 5 }); }
  },
  afro(x) {   // a big round volume set back; its front edge is a soft rolled rim where it meets the forehead
    x.shell({ edge: x.hairline({ f: 0.49, t: 0.44, sb: 0.31, e: 0.37, b: 0.24, n: 0.08 }), t: () => 0.012 });
    x.ball([0, 0.53, -0.14], [0.47, 0.41, 0.41], x.hair, { crown: true, seg: 14, rings: 9 });
    for (const [xx, y, z, r] of [[-0.42, 0.4, -0.06, 0.12], [-0.27, 0.78, -0.06, 0.12], [0.27, 0.78, -0.06, 0.12], [0.42, 0.4, -0.06, 0.12], [0, 0.86, -0.12, 0.12]]) x.ball([xx, y, z], [r, r, r * 0.85], x.hair, { crown: true });
    x.strand(Array.from({ length: 7 }, (_, i) => { const ph = -1.15 + i * 2.3 / 6; return x.S(ph, Math.max(x.browTop + 0.065, 0.525 - Math.abs(ph) * 0.05), 0.035); }), [0.03, 0.04, 0.04, 0.03], x.hair, { part: 'front', steps: 10, flat: 0.9 });
  },
  braids(x) {   // a zigzag part, smooth wings combed down behind the ears, two braids over the shoulders
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.31, e: 0.37, b: 0.25, n: 0.09 }), t: () => 0.017 });
    x.strand(Array.from({ length: 6 }, (_, i) => x.S((i % 2 ? 0.07 : -0.07), 0.505 + i * 0.018, 0.018)), [0.005, 0.005], x.col.deep, { part: 'front', steps: 10, sides: 4 });
    for (const s of [-1, 1]) {
      x.strand([x.S(s * 0.12, 0.54, 0.008), x.S(s * 0.8, 0.46, 0.024), x.S(s * 1.65, 0.33, 0.026)], [0.05, 0.06, 0.04], x.col.light, { part: 'front', steps: 9 });
      const root = x.S(s * 1.68, 0.27, 0.03);
      x.braid([root, [s * 0.34, 0.14, 0.04], [s * 0.33, -0.05, 0.08], [s * 0.33, -0.25, 0.12]], [0.052, 0.042], 9, [x.hair, x.col.light], { hang: true, part: 'side' });
      x.cone([s * 0.33, -0.31, 0.125], 0.03, 0.07, x.col.hair2, [Math.PI, 0, 0], { hang: true });
    }
  },
  pixie(x) {   // short and feathery: narrow pointed wisps all lying to the viewer's left, pointed sideburns
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.27, e: 0.37, b: 0.23, n: 0.12 }), t: volTop(0.016, 0.02) });
    for (let i = 0; i < 6; i++) { const ph = 0.8 - i * 0.26; x.strand([x.S(ph * 0.5, 0.575, 0.006), x.S(ph - 0.1, 0.52, 0.03), x.S(ph - 0.34, x.tipY(0.45 + (i % 3) * 0.012), 0.016)], [0.035, 0.035, 0.003], i % 2 ? x.col.light : x.hair, { part: 'front', flat: 0.4, steps: 7 }); }
    for (const s of [-1, 1]) x.strand([x.S(s * 1.18, 0.36, 0.008), x.S(s * 1.2, 0.27, 0.012)], [0.03, 0.003], x.col.dark, { part: 'side', steps: 4 });
  },
  slicked(x) {   // combed straight back: glossy strands from the hairline over the crown, no fringe
    x.shell({ edge: x.hairline({ f: 0.49, t: 0.45, sb: 0.31, e: 0.37, b: 0.25, n: 0.09 }), t: volTop(0.022, 0.012) });
    for (let i = 0; i < 5; i++) { const ph = (i - 2) * 0.3; x.strand([x.S(ph, 0.495, 0.012), x.T3(0.35, ph * 0.6, 0.03), x.T3(0.9, Math.PI - ph * 0.5, 0.026), x.T3(1.75, Math.PI - ph * 0.4, 0.006), x.T3(2.05, Math.PI - ph * 0.4, -0.01)], [0.026, 0.034, 0.028, 0.016, 0.004], i % 2 ? x.col.light : shade(x.hair, 0.06), { part: 'front', steps: 10 }); }   // the combed strands sink back into the hair at the nape
  },
  hood_hair(x) {   // shaggy: an uneven layered fringe of narrow points, jagged sides to the jaw and a jagged back
    x.shell({ edge: x.hairline({ f: 0.52, t: 0.45, sb: 0.36, e: 0.37, b: 0.28, n: 0.14 }), t: volTop(0.028, 0.02) });
    const L = [0.03, 0.0, 0.025, 0.005, 0.03, 0.0, 0.02, 0.01];
    for (let i = 0; i < 8; i++) { const ph = -0.95 + i * 0.27; x.strand([x.S(ph * 0.6, 0.58, 0.006), x.S(ph, 0.52, 0.036), x.S(ph * 1.04, x.tipY(0.44 + L[i]), 0.026)], [0.04, 0.045, 0.003], i % 2 ? x.col.light : x.hair, { part: 'front', flat: 0.4, steps: 6 }); }
    for (const s of [-1, 1]) x.slab({ ph: s > 0 ? [0.95, 1.65] : [-1.65, -0.95], y: [0.44, u => 0.08 + (Math.floor(u * 4) % 2) * 0.06], cols: 4, rows: 5, lift: (u, v) => 0.03 + v * 0.02, thick: () => 0.028, part: 'side' });
    backCurtain(x, { top: 0.32, to: u => -0.02 + (Math.floor(u * 7) % 2) * 0.06, lift: 0.04, cols: 14 });
  },
  tonsure(x) {   // a bare crown inside a ring of hair, and a short rolled monk's fringe
    x.shell({ edge: x.hairline({ f: 0.48, t: 0.44, sb: 0.32, e: 0.37, b: 0.25, n: 0.09 }), hole: () => 0.535, t: () => 0.024, rows: 6, front: false });
    x.strand(Array.from({ length: 7 }, (_, i) => x.S(-1.1 + i * 2.2 / 6, 0.5 - Math.abs(-1.1 + i * 2.2 / 6) * 0.03, 0.03)), [0.022, 0.03, 0.03, 0.022], x.col.light, { part: 'front', steps: 10, flat: 0.8 });
  },
  horns_hair(x) {   // wild: jagged locks curling out, and two horns from the temples
    x.shell({ edge: x.hairline({ f: 0.52, t: 0.44, sb: 0.31, e: 0.37, b: 0.24, n: 0.09 }), t: volTop(0.026, 0.02) });
    for (let i = 0; i < 5; i++) { const ph = (i - 2) * 0.33; x.strand([x.S(ph, 0.57, 0.008), x.S(ph * 1.15, 0.5, 0.05), x.S(ph * 1.35 + (i % 2 ? 0.08 : -0.08), x.tipY(0.43), 0.035)], [0.05, 0.05, 0.004], x.hair, { part: 'front', steps: 6 }); }
    if (!x.fit) for (const s of [-1, 1]) x.strand([[s * 0.2, 0.5, 0.1], [s * 0.3, 0.68, 0.06], [s * 0.34, 0.86, -0.04]], [0.05, 0.035, 0.004], '#d9cfa8', { flat: 1, steps: 7, stagger: false });
  },
  // ---------------- part A's ten, each with its own front now
  undercut(x) {   // shaved all round; a long top lifted at the front and swept over to the right and back
    x.shell({ edge: x.hairline({ f: 0.47, t: 0.44, sb: 0.3, e: 0.36, b: 0.23, n: 0.08 }), t: () => 0.006, te: 0.003, colour: x.col.stub, rows: 7, front: false });
    x.shell({ edge: () => 0.5, t: volTop(0.03, 0.02, 0.5), rows: 6, frontColour: x.col.light });
    for (let i = 0; i < 4; i++) x.strand([x.S(-0.55 + i * 0.1, 0.52 + i * 0.012, 0.01), x.S(-0.05 + i * 0.1, 0.565, 0.075 - i * 0.008), x.S(0.6 + i * 0.12, 0.54 - i * 0.01, 0.05), x.T3(1.05, 1.9 + i * 0.15, 0.02)], [0.05, 0.065, 0.05, 0.012], i % 2 ? x.col.light : x.hair, { part: 'front', steps: 10, crown: true });
  },
  topknot(x) {   // a high, receded hairline; every groove converges on a small knot on top of the crown
    x.shell({ edge: x.hairline({ f: 0.56, t: 0.5, sb: 0.33, e: 0.37, b: 0.25, n: 0.1 }), t: () => 0.014 });
    const knot = [0, 0.67, -0.06];
    for (let i = 0; i < 6; i++) { const ph = (i - 2.5) * 0.36 + (i > 2 ? 0 : 0); x.strand([x.S(ph, 0.57 - Math.abs(ph) * 0.05, 0.012), x.T3(0.3, ph * 0.7, 0.016), [knot[0] + Math.sin(ph) * 0.03, knot[1] - 0.05, knot[2] + Math.cos(ph) * 0.03]], [0.004, 0.005, 0.003], x.col.dark, { part: 'front', sides: 4, steps: 6 }); }
    x.ball(knot, [0.075, 0.07, 0.075], x.hair, { crown: true });
    x.knotAt([0, 0.615, -0.055], 0.045, 0.014, x.col.hair2, [0, 1, 0], { crown: true });
  },
  high_ponytail(x) {   // pulled up tight; two long face-framing strands from the temples, a tail from the crown
    x.shell({ edge: x.hairline({ f: 0.49, t: 0.45, sb: 0.33, e: 0.37, b: 0.26, n: 0.1 }), t: () => 0.016 });
    for (const s of [-1, 1]) x.strand([x.S(s * 0.55, 0.49, 0.008), x.S(s * 0.88, 0.4, 0.03), x.S(s * 0.97, 0.28, 0.03), x.S(s * 0.98, 0.18, 0.026)], [0.022, 0.026, 0.022, 0.004], x.col.light, { part: 'front', steps: 9 });
    const tie = x.S(Math.PI, 0.53, 0.03), root = x.S(Math.PI, 0.53, 0.0);
    x.knotAt(tie, 0.045, 0.018, x.col.hair2, [0, 0.45, -0.9], { crown: true });
    x.strand([root, [0, tie[1] + 0.04, tie[2] - 0.09], [0, 0.3, -0.38], [0, 0.0, -0.34]], [0.06, 0.1, 0.08, 0.015], x.hair, { hang: true, part: 'back', steps: 12, flat: 0.75 });
  },
  twin_tails(x) {   // a sawtooth fringe; two tails tied high on the sides
    x.shell({ edge: x.hairline({ f: 0.53, t: 0.44, sb: 0.31, e: 0.37, b: 0.26, n: 0.1 }), t: () => 0.02 });
    const cut = x.browTop + 0.01, saw = u => cut + 0.04 * Math.abs(((u * 6) % 2) - 1);
    x.slab({ ph: [-0.95, 0.95], y: [0.565, saw], cols: 12, rows: 3, lift: (u, v) => lerp(0.012, 0.026, v), thick: () => 0.016, part: 'front', flare: 0 });
    for (const s of [-1, 1]) {
      const tie = x.S(s * 1.65, 0.5, 0.03);
      x.ball(tie, 0.04, x.col.hair2);
      x.strand([tie, [s * 0.44, 0.4, -0.08], [s * 0.46, 0.12, -0.07], [s * 0.41, -0.18, -0.04]], [0.06, 0.09, 0.07, 0.012], x.hair, { hang: true, part: 'side', steps: 11, flat: 0.75 });
    }
  },
  messy(x) {   // just out of bed: cowlicks flicking UP at the front in every direction, tufts round the crown
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.43, sb: 0.31, e: 0.36, b: 0.24, n: 0.07 }), t: (p, ph) => 0.026 + 0.008 * Math.sin(ph * 5 + p[1] * 20) });
    const flick = [[-0.7, 0.5, 0.12], [-0.35, 0.53, -0.1], [0.0, 0.52, 0.16], [0.32, 0.5, -0.14], [0.66, 0.49, 0.1]];
    for (const [ph, y, sw] of flick) x.strand([x.S(ph, 0.58, 0.006), x.S(ph + sw * 0.5, y, 0.04), x.S(ph + sw, y + 0.04, 0.085)], [0.045, 0.04, 0.004], x.col.light, { part: 'front', steps: 6, crown: true });
    for (let i = 0; i < 9; i++) { const ph = Math.PI * 0.4 + i / 9 * Math.PI * 1.2, th = 0.45 + (i % 3) * 0.2; x.strand([x.T3(th, ph, 0), x.T3(th + 0.12, ph + 0.15, 0.06), x.T3(th + 0.2, ph + 0.3 * ((i % 2) * 2 - 1), 0.1)], [0.045, 0.035, 0.003], i % 2 ? x.col.dark : x.hair, { steps: 5, crown: true }); }
  },
  pompadour(x) {   // the quiff: a rolled volume swept up and back over the forehead, short sides
    x.shell({ edge: x.hairline({ f: 0.48, t: 0.45, sb: 0.31, e: 0.37, b: 0.25, n: 0.08 }), t: (p) => p[1] > 0.5 ? 0.025 : 0.012, frontColour: x.col.dark });
    x.ball([0, 0.6, 0.11], [0.25, 0.14, 0.2], x.hair, { part: 'front', crown: true, tall: true, rot: [-0.35, 0, 0], seg: 12, rings: 7 });
    for (let i = 0; i < 5; i++) { const xx = (i - 2) * 0.07; x.strand([[xx, 0.52, 0.24], [xx * 1.1, 0.7, 0.17], [xx * 1.1, 0.67, -0.06], x.T3(0.7, Math.PI, 0.01)], [0.05, 0.05, 0.03, 0.01], i % 2 ? x.col.light : x.hair, { part: 'front', crown: true, tall: true, steps: 8 }); }
  },
  locs(x) {   // locs: short ones fall over the temples, the rest hang round the back to the shoulders
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.31, e: 0.37, b: 0.25, n: 0.1 }), t: () => 0.022 });
    for (const [ph, len] of [[-0.62, 0.0], [-0.3, 0.02], [0.32, 0.01], [0.64, 0.0]]) x.strand([x.S(ph * 0.7, 0.56, 0.01), x.S(ph, 0.5, 0.045), x.S(ph * 1.08, x.tipY(0.45 + len), 0.04)], [0.028, 0.03, 0.02], x.col.light, { part: 'front', steps: 6, flat: 1, sides: 5 });
    for (let i = 0; i < 12; i++) {
      const ph = 1.0 + i / 11 * (TAU - 2.0), len = 0.32 + (i % 3) * 0.05, root = x.S(ph, 0.4, 0.012), out = x.S(ph, 0.24, 0.035);
      const end = [out[0] * 1.03, 0.2 - len, out[2] * 1.03 - 0.02];
      x.strand([root, out, end], [0.034, 0.033, 0.027], i % 2 ? x.col.dark : x.hair, { hang: true, part: 'back', flat: 1, sides: 5, steps: 6 });
      x.ball([end[0], end[1] - 0.012, end[2]], [0.03, 0.022, 0.03], x.col.hair2, { hang: true, part: 'back', seg: 6, rings: 4 });
    }
  },
  long_braid(x) {   // a French braid from the forehead over the crown, carried on as one braid down the back
    x.shell({ edge: x.hairline({ f: 0.505, t: 0.45, sb: 0.32, e: 0.37, b: 0.26, n: 0.11 }), t: () => 0.015 });
    const crown = [[0.86, 0], [0.45, 0], [0.05, 0], [0.6, Math.PI], [1.2, Math.PI], [1.62, Math.PI]].map(([th, ph]) => x.T3(th, ph, 0.024));
    x.braid(crown, 0.045, 8, [x.hair, x.col.light], (i) => ({ part: i < 2 ? 'front' : 'extra' }));
    const pad = x.fit?.backPad || 0;
    x.braid([x.T3(1.75, Math.PI, 0.03), [0, 0.12, -0.3 - pad], [0, -0.15, -0.31 - pad], [0, -0.42, -0.3 - pad]], [0.05, 0.042], 8, [x.hair, x.col.light], { hang: true, part: 'back' });
    x.cone([0, -0.5, -0.3 - pad], 0.04, 0.08, x.col.hair2, [Math.PI, 0, 0], { hang: true });
  },
  mullet(x) {   // a short flat-top brush at the front, long at the back
    x.shell({ edge: x.hairline({ f: 0.49, t: 0.44, sb: 0.3, e: 0.37, b: 0.22, n: 0.1 }), t: (p) => 0.014 + (p[2] < -0.05 ? 0.012 : 0) });
    for (let i = 0; i < 7; i++) { const ph = -0.75 + i * 0.25; x.strand([x.S(ph, 0.5, 0.004), x.S(ph, 0.54, 0.035), x.S(ph * 0.92, 0.575, 0.06)], [0.04, 0.042, 0.035], i % 2 ? x.col.light : x.hair, { part: 'front', flat: 0.55, steps: 4 }); }
    x.slab({ ph: [Math.PI - 1.0, Math.PI + 1.0], y: [0.3, -0.14], cols: 8, rows: 5, lift: (u, v) => lerp(0.01, 0.04, Math.min(1, v * 3)), thick: () => 0.028, part: 'back', hang: true, flare: 0.3 });
  },
  side_swept(x) {   // one big swoop from the right temple across the forehead to the left
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.31, e: 0.37, b: 0.27, n: 0.1 }), t: volTop(0.022, 0.015) });
    for (let i = 0; i < 6; i++) x.strand([x.S(1.0 - i * 0.05, 0.55 + i * 0.008, 0.006), x.S(0.4 - i * 0.08, 0.54 - i * 0.004, 0.045), x.S(-0.45 - i * 0.08, x.tipY(0.45 + i * 0.012), 0.042), x.S(-1.0 + i * 0.01, x.tipY(0.4 + i * 0.02), 0.03)], [0.035, 0.045, 0.035, 0.006], i % 2 ? x.col.light : x.hair, { part: 'front', steps: 10 });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) x.strand([x.S(s * (1.1 + i * 0.22), 0.45, 0.006), x.S(s * (1.2 + i * 0.22), 0.3, 0.035), x.S(s * (1.25 + i * 0.2), 0.14 + i * 0.03, 0.03)], [0.045, 0.05, 0.004], i ? x.hair : x.col.dark, { part: 'side', steps: 6 });
    backCurtain(x, { to: 0.02, lift: 0.03 });
  },
  // ---------------- hair pass 2: thirteen new styles
  crown_braid(x) {   // a braid wrapped round the head like a circlet, the hair pulled smooth under it
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.31, e: 0.37, b: 0.26, n: 0.1 }), t: () => 0.015 });
    // a closed ring of beads round the head, high at the forehead, lower at the nape; each bead overlaps the next
    const ring = Array.from({ length: 13 }, (_, i) => { const ph = -Math.PI + TAU * i / 12; return x.S(ph, 0.505 - (1 - Math.cos(ph)) * 0.045, 0.026); });
    x.braid(ring, 0.04, 26, [x.hair, x.col.light], (i, t) => ({ part: Math.cos(-Math.PI + TAU * t) > 0.35 ? 'front' : 'extra' }));
  },
  side_shave(x) {   // the left side shaved; the long top flops over to the right past the ear
    x.shell({ edge: x.hairline({ f: 0.47, t: 0.44, sb: 0.3, e: 0.36, b: 0.23, n: 0.08 }), t: () => 0.006, te: 0.003, colour: x.col.stub, rows: 7, front: false });
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.45, sb: 0.34, e: 0.36, b: 0.26, n: 0.12, skew: ph => ph < 0 ? 0.16 * Math.min(1, -ph / 0.6) * (1 - Math.max(0, -ph - 2.2)) : 0 }), t: volTop(0.026, 0.02) });
    for (let i = 0; i < 4; i++) x.strand([x.S(-0.55 + i * 0.06, 0.6 - i * 0.012, 0.008), x.S(0.15 + i * 0.05, 0.56 - i * 0.012, 0.05), x.S(0.8 + i * 0.04, 0.47 - i * 0.01, 0.048), x.S(1.15 + i * 0.05, 0.33, 0.042), x.S(1.3 + i * 0.05, 0.15 + i * 0.01, 0.035)], [0.05, 0.065, 0.055, 0.04, 0.008], i % 2 ? x.col.light : x.hair, { part: 'front', steps: 12 });
  },
  wolf_cut(x) {   // choppy layers: a heavy fringe in V-points, shaggy crown flicks, jagged spikes flaring at the nape
    x.shell({ edge: x.hairline({ f: 0.52, t: 0.45, sb: 0.33, e: 0.37, b: 0.27, n: 0.12 }), t: (p, ph, s) => 0.03 + 0.008 * Math.cos(ph * 6) });
    for (const [ph, len, w] of [[-0.55, 0.0, 0.085], [0, 0.03, 0.09], [0.55, 0.0, 0.085]]) x.strand([x.S(ph * 0.5, 0.585, 0.006), x.S(ph, 0.52, 0.045), x.S(ph * 1.05, x.tipY(0.44 + len), 0.03)], [w * 0.9, w, 0.004], ph ? x.hair : x.col.light, { part: 'front', flat: 0.45, steps: 6 });
    for (let i = 0; i < 6; i++) { const ph = 1.2 + i / 5 * (TAU - 2.4), th = 0.75 + (i % 2) * 0.25; x.strand([x.T3(th, ph, 0.0), x.T3(th + 0.12, ph, 0.05), x.T3(th + 0.3, ph + 0.1, 0.075)], [0.05, 0.045, 0.004], x.col.dark, { steps: 5 }); }
    for (let i = 0; i < 7; i++) { const ph = Math.PI + (i - 3) * 0.32; const root = x.S(ph, 0.24, 0.01); x.strand([root, x.S(ph, 0.1, 0.05), [root[0] * 1.35, -0.06 - (i % 2) * 0.05, root[2] * 1.25 - 0.03]], [0.055, 0.05, 0.004], i % 2 ? x.hair : x.col.dark, { hang: true, part: 'back', steps: 6 }); }
    for (const s of [-1, 1]) x.slab({ ph: s > 0 ? [0.95, 1.6] : [-1.6, -0.95], y: [0.43, u => 0.1 + (u > 0.5 ? 0.04 : 0)], cols: 3, rows: 4, lift: (u, v) => 0.03 + v * 0.02, thick: () => 0.028, part: 'side' });
  },
  half_up(x) {   // the top half gathered in a small knot at the back; temple strands tucked behind the ears; the rest falls loose
    x.shell({ edge: x.hairline({ f: 0.5, t: 0.44, sb: 0.33, e: 0.37, b: 0.27, n: 0.12 }), t: volTop(0.02, 0.012) });
    for (const s of [-1, 1]) x.strand([x.S(s * 0.5, 0.53, 0.004), x.S(s * 1.0, 0.45, 0.028), x.S(s * 1.5, 0.4, 0.032), x.S(s * 1.95, 0.35, 0.0)], [0.03, 0.036, 0.03, 0.006], shade(x.hair, 0.05), { part: 'front', steps: 12 });
    const knot = x.S(Math.PI, 0.46, 0.06);
    x.ball(knot, [0.07, 0.065, 0.06], x.hair, { crown: true });
    x.knotAt(x.S(Math.PI, 0.46, 0.015), 0.045, 0.014, x.col.hair2, [0, 0, 1], { crown: true });
    backCurtain(x, { top: 0.36, to: -0.2, span: 1.75, lift: 0.04 });
  },
  ribbon_loops(x) {   // a split fringe (two short side bangs, the middle of the forehead clear); two buns with looped hair under them
    x.shell({ edge: x.hairline({ f: 0.52, t: 0.44, sb: 0.31, e: 0.37, b: 0.26, n: 0.1 }), t: () => 0.018 });
    for (const s of [-1, 1]) {
      x.slab({ ph: s > 0 ? [0.18, 0.78] : [-0.78, -0.18], y: [0.56, u => x.browTop + 0.012 + (s > 0 ? u : 1 - u) * 0.03], cols: 5, rows: 3, lift: (u, v) => lerp(0.012, 0.026, v), thick: () => 0.016, part: 'front', flare: 0 });
      const bun = [s * 0.22, 0.62, -0.13];
      x.ball(bun, [0.095, 0.09, 0.09], x.hair, { crown: true });
      x.knotAt([bun[0], bun[1] - 0.17, bun[2] - 0.05], 0.085, 0.028, x.hair, [1, 0, 0.2], { crown: false });
      x.knotAt([bun[0] * 0.95, bun[1] - 0.07, bun[2] - 0.02], 0.05, 0.016, x.col.hair2, [s * 0.4, 1, -0.3], { crown: true });
    }
  },
  cornrows(x) {   // rows braided flat from the hairline to the nape, scalp showing dark between them
    x.shell({ edge: x.hairline({ f: 0.49, t: 0.44, sb: 0.31, e: 0.36, b: 0.24, n: 0.09 }), t: () => 0.006, te: 0.003, colour: x.col.deep, rows: 7, front: false });
    for (let i = 0; i < 7; i++) {
      const ph = (i - 3) * 0.32, y0 = 0.49 - Math.abs(ph) * 0.035;
      const pts = [x.S(ph, y0, 0.006)];
      // over the top: a signed polar angle from the hairline (front, +) through the crown to the nape (back, -)
      const t0 = x.thAt(ph, y0), t1 = -(2.5 - Math.abs(ph) * 0.12);
      for (let j = 1; j <= 6; j++) { const th = lerp(t0, t1, j / 6); pts.push(th >= 0 ? x.T3(th, ph * 0.9, 0.016) : x.T3(-th, Math.PI - ph * 0.7, 0.016)); }
      x.strand(pts, [0.022, 0.03, 0.03, 0.028, 0.026, 0.02], i % 2 ? x.col.light : x.hair, { part: 'front', steps: 12, sides: 5, flat: 0.55 });
      x.ball(pts[pts.length - 1], 0.024, x.col.hair2, { seg: 6, rings: 4 });
    }
  },
  warrior_braids(x) {   // shaved sides, a widow's peak and a ridge of hair over the top, three beaded braids down the back
    x.shell({ edge: x.hairline({ f: 0.47, t: 0.44, sb: 0.3, e: 0.36, b: 0.23, n: 0.08 }), t: () => 0.006, te: 0.003, colour: x.col.stub, rows: 7, front: false });
    x.strand([x.S(0, 0.455, 0.004), x.S(0, 0.5, 0.025), x.T3(0.25, 0, 0.04), x.T3(0.5, Math.PI, 0.04), x.T3(1.25, Math.PI, 0.02)], [0.03, 0.11, 0.12, 0.11, 0.06], x.hair, { part: 'front', steps: 8, flat: 0.3 });
    for (const s of [-1, 1]) x.strand([x.S(s * 0.05, 0.5, 0.02), x.S(s * 0.16, 0.465, 0.012)], [0.03, 0.004], x.col.dark, { part: 'front', steps: 3 });
    for (const xx of [-0.09, 0, 0.09]) {
      const root = x.T3(1.2, Math.PI - xx * 3, 0.025);
      x.braid([root, [xx * 1.2, 0.2, -0.32], [xx * 1.4, -0.02, -0.29], [xx * 1.5, -0.22, -0.25]], [0.036, 0.03], 11, [x.hair, x.col.light], { hang: true, part: 'back' });
      x.knotAt([xx * 1.5, -0.2, -0.255], 0.026, 0.011, '#c9a24a', [0, 1, 0], { hang: true, part: 'back' });
    }
  },
  feathered(x) {   // a centre part; layers feathered out and BACK at the temples like wings, flicking out at the jaw
    x.shell({ edge: x.hairline({ f: 0.53, t: 0.45, sb: 0.34, e: 0.37, b: 0.28, n: 0.13 }), t: volTop(0.03, 0.02) });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) x.strand([x.S(s * 0.04, 0.59 - i * 0.012, 0.008), x.S(s * (0.3 + i * 0.06), x.tipY(0.5 - i * 0.02), 0.04), x.S(s * (0.85 + i * 0.1), 0.46 - i * 0.035, 0.055), x.S(s * (1.3 + i * 0.12), 0.48 - i * 0.04, 0.045)], [0.03, 0.05, 0.04, 0.004], i % 2 ? x.hair : x.col.light, { part: 'front', steps: 10 });
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) x.strand([x.S(s * (1.05 + i * 0.25), 0.44, 0.008), x.S(s * (1.12 + i * 0.25), 0.26, 0.04), x.S(s * (1.25 + i * 0.25), 0.1, 0.07), x.S(s * (1.45 + i * 0.25), 0.07, 0.11)], [0.05, 0.055, 0.04, 0.004], i % 2 ? x.col.dark : x.hair, { part: 'side', hang: true, steps: 6 });   // the jaw-length layers flick OUT at the ends
    backCurtain(x, { top: 0.33, to: 0.0, lift: 0.04, span: 1.45 });
  },
  curly_bob(x) {   // corkscrew curls round the head to the chin, a few short ones over the forehead
    x.shell({ edge: x.hairline({ f: 0.52, t: 0.45, sb: 0.37, e: 0.38, b: 0.3, n: 0.16 }), t: (p, ph, s) => 0.028 + 0.01 * Math.sin(ph * 8 + s * 6) });
    const coil = (root, down, r, turns, len) => Array.from({ length: turns * 6 + 1 }, (_, j) => { const t = j / (turns * 6), an = t * turns * TAU; return [root[0] + Math.cos(an) * r * (j ? 1 : 0) + down[0] * t * len, root[1] - t * len, root[2] + Math.sin(an) * r * (j ? 1 : 0) + down[2] * t * len]; });
    for (const ph of [-0.5, -0.17, 0.17, 0.5]) { const root = x.S(ph, 0.545, 0.03); x.strand(coil(root, [0, 0, 0.12], 0.024, 2, root[1] - x.tipY(0.46)), [0.012, 0.013, 0.009], x.col.light, { part: 'front', steps: 9, flat: 1, sides: 4 }); }
    for (let i = 0; i < 10; i++) { const ph = 0.95 + i / 9 * (TAU - 1.9), root = x.S(ph, 0.36, 0.03); x.strand(coil(root, [Math.sin(ph) * 0.1, 0, Math.cos(ph) * 0.1], 0.03, 3, 0.26), [0.017, 0.018, 0.013], i % 2 ? x.col.dark : x.hair, { part: 'side', hang: true, steps: 11, flat: 1, sides: 4 }); }
  },
  puff(x) {   // sides pulled up tight to a round puff on top tied with a band; little swirled baby hairs at the temples
    x.shell({ edge: x.hairline({ f: 0.48, t: 0.43, sb: 0.31, e: 0.37, b: 0.25, n: 0.09 }), t: () => 0.011, frontColour: x.col.light });
    x.ball([0, 0.72, -0.05], [0.2, 0.17, 0.2], x.hair, { crown: true, seg: 12, rings: 8 });
    x.knotAt([0, 0.6, -0.05], 0.085, 0.022, x.col.hair2, [0, 1, 0], { crown: true });
    for (const s of [-1, 1]) {
      const c0 = x.S(s * 0.72, 0.455, 0.008);
      x.strand(Array.from({ length: 7 }, (_, j) => { const an = j / 6 * Math.PI * 1.6; return x.S(s * (0.72 - Math.sin(an) * 0.08), 0.455 + Math.cos(an) * 0.018 - j * 0.002, 0.008); }), [0.008, 0.007, 0.003], x.col.dark, { part: 'front', steps: 10, sides: 4 });
      void c0;
    }
  },
  rolled_tail(x) {   // two rolls laid across the top on either side of a part, a low tail over the right shoulder
    x.shell({ edge: x.hairline({ f: 0.49, t: 0.43, sb: 0.3, e: 0.37, b: 0.24, n: 0.1 }), t: volTop(0.016, 0.01) });
    for (const s of [-1, 1]) x.strand(Array.from({ length: 5 }, (_, i) => x.S(s * (0.12 + i * 0.17), 0.555 - i * 0.017, 0.045)), [0.03, 0.055, 0.055, 0.03], s > 0 ? x.col.light : x.hair, { part: 'front', steps: 8, flat: 1, sides: 8 });
    const tie = x.S(2.0, 0.17, 0.03);
    x.knotAt(tie, 0.04, 0.018, x.col.hair2, [0.5, 0.8, -0.3]);
    x.strand([tie, [0.36, 0.0, -0.06], [0.37, -0.16, 0.02], [0.33, -0.32, 0.06]], [0.065, 0.08, 0.06, 0.012], x.hair, { hang: true, part: 'side', steps: 10, flat: 0.8 });
  },
  bowl(x) {   // a bowl cut: an even cap with a thick rounded rim right round its edge, at the brow line in front
    const edge = x.hairline({ f: 0.48, t: 0.47, sb: 0.42, e: 0.4, b: 0.3, n: 0.26 });
    x.shell({ edge, t: () => 0.03 });
    const n = 22, pts = Array.from({ length: n }, (_, i) => { const ph = -Math.PI + TAU * i / n; return x.S(ph, Math.max(x.browTop + 0.035, edge(ph) + 0.012), 0.036); });
    x.strand(pts, [0.024, 0.024], x.hair, { steps: n * 2, closed: true, flat: 1, part: 'front', stagger: false });
  },
  court_cut(x) {   // straight cheek-length sidelocks before the ears, a sparse fringe of separate wisps, long straight back
    x.shell({ edge: x.hairline({ f: 0.53, t: 0.45, sb: 0.36, e: 0.37, b: 0.28, n: 0.12 }), t: volTop(0.02, 0.012) });
    for (let i = 0; i < 7; i++) { const ph = (i - 3) * 0.24; x.strand([x.S(ph * 0.8, 0.58, 0.008), x.S(ph, 0.52, 0.03), x.S(ph, x.tipY(0.445), 0.028)], [0.012, 0.013, 0.004], x.hair, { part: 'front', steps: 5, sides: 4 }); }
    for (const s of [-1, 1]) x.slab({ ph: s > 0 ? [0.9, 1.3] : [-1.3, -0.9], y: [0.44, 0.13], cols: 3, rows: 4, lift: () => 0.032, thick: () => 0.026, part: 'side', flare: 0 });
    backCurtain(x, { top: 0.36, to: -0.32, span: 1.7, lift: 0.035 });
  },
};

/** Every style id this file builds (bald too). */
export const HAIR25_STYLES = ['bald', ...Object.keys(STYLES)];
