// Chibi 2.5 hair (part A, 2026-10-16). The v2 hair block in chibi2.js is frozen for v2 looks; this is its successor.
//
// What changed, and why (each from the contact-sheet audit, chibi25-sheet.html?slot=hair&v=2):
//   * buzz      was the short cap with a heavy slab over the brow; it is a tight cap with a hairline now, and a back.
//   * bangs     the locks splayed out like petals in three-quarter view; a blunt-cut sheet with strand grooves.
//   * long      read as short hair from the front (all of it was behind the ears); side curtains frame the face.
//   * bun/buns  were built INSIDE the hair cap and could not be seen at all; they sit on the crown now.
//   * mohawk    had sideburn locks floating on the shaved scalp; shaved sides are a stubble shade instead.
//   * tonsure   had a full cap, so there was no bald crown; the cap is a ring.
//   * afro      came down over the eyes (centred too far forward); it sits back and up.
//   * horns_hair had no horns.
//   * fringes   ended ON the brows (tips at y 0.365, brows at ~0.39), so every brow poked through the fringe; every
//               fringe now stops above the brow top the face reports (`browTop`).
//
// FITTING UNDER HEADWEAR — one rule instead of per-pair patches. A hat says where it covers (`HAT_FIT`): a crown
// shell down to a brim line (front and back heights), or a band at a height. Any hair vertex inside the covered region
// is pressed INSIDE the hair cap's own surface (which every hat is built to clear), so nothing pokes through the hat;
// hair below the brim — a ponytail, long backs, braids — still hangs below it instead of being dropped. A band
// (circlet, headband) pinches the hair under it. A hood keeps the v2 rule: only the fringe shows, the rest is hidden.
import * as THREE from 'three';
import { shade } from '../../avatar-2d/js/render.js';
import { profile, taperedCurve } from './chibi2-geometry.js';

const sphere = () => new THREE.SphereGeometry(1, 10, 6);
const mix = (c1, c2, t) => '#' + new THREE.Color(c1).lerp(new THREE.Color(c2), t).getHexString();

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
export const HAIR_COVERS_EARS = ['long', 'wavy', 'bob', 'hood_hair', 'locs', 'side_swept', 'twin_tails'];

export function buildHair25(a, rig, c) {
  const { head, faceWidth, faceDepth } = c, hairId = a.hair.id, hair = a.hair.color, H = rig.headScale;
  const hair2 = a.hair.color2 || mix(hair, '#ffffff', 0.25), dark = shade(hair, -0.12);
  const fit = c.fit, hoodUp = !!fit?.hood, noHang = hoodUp || !!fit?.noHang, shell = fit?.shell, band = fit?.band;
  const browTop = Math.max(0.4, c.browTop ?? 0.42), R = rig.round || 0;
  const tag = c.tag || (() => {});
  tag('hair');
  if (hairId === 'bald') return;
  // the hair cap's own surface (head units): every hat is built to clear it, so this is the inner limit under a hat
  const CAP = { cy: 0.32, rx: 0.348 * faceWidth, ry: 0.31, rz: 0.28 * faceDepth };
  const capR = (x, y, z) => Math.hypot(x / CAP.rx, (y - CAP.cy) / CAP.ry, (z + 0.012) / CAP.rz);
  /** the brim line at a point: the front height at the face, the back height at the nape */
  const brimAt = (z) => { const t = THREE.MathUtils.clamp((0.27 - z) / 0.55, 0, 1); return shell[0] + (shell[1] - shell[0]) * t; };
  /** press one vertex inside the cap if a hat covers it; true if it moved */
  const press = (v) => {
    if (shell) {
      if (v.y < brimAt(v.z) - 0.005 || (fit.face && v.z > 0.18 && v.y < 0.47)) return false;
      const r = capR(v.x, v.y, v.z), lim = 0.985;
      if (r > lim) { const k = lim / r; v.set(v.x * k, CAP.cy + (v.y - CAP.cy) * k, (v.z + 0.012) * k - 0.012); }
      return true;
    }
    if (band) {
      // a band pinches the hair under it, easing out over 0.12 above and below (an afro reads as tied, not cut in two)
      const [by, bh, br] = band, d = Math.abs(v.y - by);
      if (d > bh + 0.12) return false;
      const rr = Math.hypot(v.x / br, v.z / (br * 0.86)), lim = 0.97 + Math.max(0, d - bh) * 4;
      if (rr > lim) { const k = lim / rr; v.x *= k; v.z *= k; }
      return true;
    }
    return false;
  };
  const tmp = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  /**
   * Add one hair piece: transform in head units, then fit it under the hat, then hand it to head() (which scales by H).
   * `drop` (true under a shell for crown volumes) drops a piece that would end up entirely inside the cap.
   */
  const put = (g, colour, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], crown = false, bend = null } = {}) => {
    if (bend && noHang) { g.dispose(); return; }        // hanging hair under a pelt or a mail hood stays tucked in
    m4.compose(tmp.set(...position), q.setFromEuler(e.set(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(m4);
    if (fit && !hoodUp) {
      const p = g.attributes.position; let moved = 0;
      for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i); if (press(tmp)) { moved++; p.setXYZ(i, tmp.x, tmp.y, tmp.z); } }
      if (crown && shell && moved === p.count) { g.dispose(); return; }      // a crown volume wholly under the hat: nothing to show
      if (moved) g.computeVertexNormals();
    }
    head(g, colour, bend ? { bend } : {});
  };
  // a long piece that hangs past the nape follows the CHEST, not the nod (as the hood's hem does)
  const hangBend = { bone: 'chest', at: 0.02 * H, width: 0.09 * H };
  const lock = (pts, radii, colour, sides = 6, steps = 6, o = {}) => put(taperedCurve(pts, radii, sides, steps), colour, o);

  // ---- the crown cap (same shape as v2, so v2's hats fit it), with a hairline per style
  // the hairline at the front stops just above the brows (v2's cap came down to y 0.375, over the top of every brow)
  const frontLift = Math.max(0.095, browTop + 0.012 - 0.32);
  const capGeo = (thetaStart = 0, thetaLen = Math.PI / 2) => {
    const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, thetaStart, thetaLen), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * 0.348 * faceWidth, 0.32 + y * 0.31 + Math.max(0, z) ** 1.2 * frontLift, (z * 0.28 - 0.012) * faceDepth); }   // the hairline sits higher at the front than v2's (0.415 vs 0.375), so the brows have forehead under it
    g.computeVertexNormals(); return g;
  };
  const noCap = ['afro', 'mohawk'].includes(hairId) || (hoodUp && true);
  if (!noCap) {
    if (hairId === 'tonsure') put(capGeo(0.62, Math.PI / 2 - 0.62), hair);              // a ring: the crown is bare
    else if (hairId === 'buzz' || hairId === 'undercut') {
      // a tight cap with a hairline: the front edge is lifted to the top of the forehead
      const g = capGeo(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); if (z > 0.05) p.setY(i, Math.max(y, 0.4 + (z - 0.05) * 0.35)); p.setXYZ(i, p.getX(i) * 0.995, 0.32 + (p.getY(i) - 0.32) * 0.985, p.getZ(i) * 0.995); }
      g.computeVertexNormals(); put(g, hairId === 'buzz' ? dark : hair);
    } else put(capGeo(), hair);
  }
  // shaved sides (mohawk, undercut): a stubble shade on the scalp, under where the hair would be
  if (hairId === 'mohawk' || hairId === 'undercut') { const g = capGeo(); g.scale(0.99, 0.985, 0.99); g.translate(0, 0.004, 0); put(g, mix(a.body.skin, hair, 0.35)); }
  // the back of the head reaches the nape for every style (buzz too now — v2 left the back of a buzz cut bare)
  if (!hoodUp && !['mohawk', 'tonsure', 'afro'].includes(hairId)) {
    const long = /long|wavy|braids|pony|bob|hood_hair|locs|mullet|twin/.test(hairId);
    const back = new THREE.SphereGeometry(1, 14, 6, Math.PI - 0.5, Math.PI + 1.0, Math.PI / 2 - 0.08, long ? Math.PI * 0.42 : Math.PI * 0.3);
    const tight = hairId === 'buzz' || hairId === 'undercut';
    put(back, shade(hair, tight ? -0.14 : -0.05), { position: [0, 0.32, -0.02], scale: [(tight ? 0.345 : 0.365 + R * 0.02) * faceWidth, 0.325, (tight ? 0.285 : 0.3 + R * 0.01) * faceDepth] });
  }

  // ---- fringes: every tip ends above the brows
  const tipY = y => Math.max(y, browTop + 0.028);       // the tube is still ~0.02 thick just above its tip
  const fringe = ['short', 'long', 'wavy', 'mullet', 'high_ponytail', 'messy'].includes(hairId);
  if (fringe) for (let i = 0; i < 7; i++) {
    if (hoodUp && (i === 0 || i === 6)) continue;
    const x = (i - 3) * 0.087, arc = 1 - (x / 0.31) ** 2;
    // the middle point is pulled IN (v2's stood up off the crown as horns) and the tip lies on the forehead
    const edge = i === 0 || i === 6 ? 0.88 : 1;            // the outer locks hug the temples (v2's curled out like horns)
    lock([[x * edge - 0.035, 0.53 + arc * 0.05, 0.1], [x * edge + 0.022, 0.5 + arc * 0.01, 0.228 * (edge < 1 ? 0.92 : 1)], [x + 0.045, tipY(0.37 + (i % 3) * 0.027), 0.27]], [0.046, 0.05, 0.003], i % 3 === 1 ? shade(hair, 0.12) : hair);
  }
  if (hairId === 'bangs' || hairId === 'twin_tails') {
    // a blunt-cut sheet over the forehead from the hairline to just above the brows, with strand grooves
    const cols = 12, rows = 4, pos = [], idx = [], cut = browTop + 0.008;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = -1 + 2 * i / cols, x = u * 0.3 * faceWidth, y = cut + (0.56 - cut) * j / rows - (1 - u * u) * 0 - Math.abs(u) ** 3 * 0.05 * (1 - j / rows);
      const rxAt = 0.348 * faceWidth * Math.sqrt(Math.max(0.05, 1 - ((y - 0.32) / 0.33) ** 2)), xx = Math.sign(x) * Math.min(Math.abs(x), rxAt * 0.98);
      const zz = 0.285 * faceDepth * Math.sqrt(Math.max(0, 1 - (xx / (rxAt * 1.04)) ** 2 - ((y - 0.32) / 0.36) ** 2)) + 0.012;
      pos.push(xx, y, zz + (j === 0 ? 0.004 : 0));
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a0 = j * (cols + 1) + i, b0 = a0 + cols + 1; idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    put(g, hair);
    for (let i = 1; i < 6; i++) { const x = (i - 3) * 0.085; lock([[x, 0.5, 0.235], [x * 1.02, cut + 0.03, 0.272]], [0.006, 0.004], shade(hair, -0.15), 3, 2); }
  }
  if ((hairId === 'slicked' || hairId === 'topknot' || hairId === 'long_braid' || hairId === 'undercut') && !shell) for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.1, top = hairId === 'undercut' ? 0.64 : 0.585;
    lock([[x * 0.9, 0.46, 0.225], [x * 1.05, top, hairId === 'undercut' ? 0.06 : 0.02], [x, 0.47, -0.262]], [0.028, hairId === 'undercut' ? 0.05 : 0.032, 0.012], i % 2 ? shade(hair, 0.14) : hair, 5, 7);
  }
  if (hairId === 'side_part') {
    for (let i = 0; i < 4; i++) lock([[0.02 + i * 0.055, 0.50, 0.09], [0.08 + i * 0.06, 0.46, 0.235], [0.17 + i * 0.045, tipY(0.39), 0.268]], [0.055, 0.07, 0.006], i % 2 ? shade(hair, 0.12) : hair);
    if (!hoodUp) lock([[-0.26, 0.48, 0.06], [-0.31, 0.30, 0.04], [-0.28, 0.10, 0.03]], [0.075, 0.06, 0.015], shade(hair, -0.08));
    lock([[-0.02, 0.6, 0.0], [-0.03, 0.56, 0.17]], [0.006, 0.004], shade(hair, -0.25), 3, 3);    // the parting line
  }
  if (hairId === 'side_swept') {
    // one big swoop from the right temple across the forehead to the left, ending above the left brow
    for (let i = 0; i < 6; i++) lock([[0.3 - i * 0.02, 0.5 + i * 0.012, 0.08], [0.12 - i * 0.03, 0.5 - i * 0.004, 0.245], [-0.16 - i * 0.03, tipY(0.4 + i * 0.012), 0.245], [-0.3 + i * 0.004, tipY(0.36 + i * 0.02), 0.12]], [0.035, 0.042, 0.035, 0.006], i % 2 ? shade(hair, 0.1) : hair, 6, 9);
  }
  if (hairId === 'spiky' && !hoodUp) for (let i = 0; i < 7; i++) { const x = (i - 3) * 0.09; lock([[x, 0.46, 0.16], [x * 1.1, 0.53 + (i % 2) * 0.05, 0.15], [x * 1.2, 0.68 + (i % 3) * 0.06, 0.04]], [0.07, 0.05, 0.004], hair, 5, 5, { crown: true }); }
  if (hairId === 'messy' && !hoodUp) for (let i = 0; i < 12; i++) {
    const t = i / 12 * Math.PI * 2, r = 0.25 + (i % 3) * 0.03, x = Math.sin(t) * r, z = Math.cos(t) * r * 0.85 - 0.04;
    lock([[x * 0.6, 0.5, z * 0.6], [x * 1.05, 0.58 + (i % 2) * 0.03, z * 1.05], [x * 1.35 + ((i * 37) % 7 - 3) * 0.01, 0.6 + ((i * 13) % 5) * 0.02, z * 1.35]], [0.05, 0.035, 0.003], i % 2 ? shade(hair, 0.1) : hair, 5, 4, { crown: true });
  }
  if (hairId === 'mohawk' && !hoodUp) {
    for (let i = 0; i < 5; i++) lock([[0, 0.46 + i * 0.025, 0.1], [0, 0.6 + i * 0.015, 0.1], [0, 0.83 - i * 0.035, 0.0]], [0.075, 0.065, 0.008], i % 2 ? shade(hair, 0.10) : hair, 5, 5, { crown: true });
    put(profile([[0.32, 0.09, 0.08], [0.48, 0.11, 0.09], [0.60, 0.035, 0.035]], 8), hair);
  }
  if (hairId === 'pompadour' && !hoodUp) {
    // the quiff: a rolled volume over the forehead, swept up and back, sides short
    put(new THREE.SphereGeometry(1, 12, 7), hair, { position: [0, 0.6, 0.12], scale: [0.25, 0.14, 0.2], rotation: [-0.35, 0, 0], crown: true });
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.07; lock([[x, 0.5, 0.25], [x * 1.1, 0.7, 0.18], [x * 1.1, 0.68, -0.05]], [0.05, 0.05, 0.02], i % 2 ? shade(hair, 0.15) : hair, 5, 6, { crown: true }); }
  }
  if (hairId === 'pixie' && !hoodUp) for (const s of [-1, 1]) lock([[s * 0.05, 0.52, 0.14], [s * 0.2, 0.47, 0.235], [s * 0.315, 0.36, 0.12]], [0.07, 0.055, 0.008], hair);
  if (hairId === 'tonsure' && !hoodUp) put(new THREE.TorusGeometry(0.20, 0.05, 6, 14), hair, { position: [0, 0.52, -0.01], rotation: [Math.PI / 2, 0, 0], scale: [1.25, 0.85, 1] });
  if (hairId === 'hood_hair' && !hoodUp) for (const s of [-1, 1]) lock([[s * 0.18, 0.48, 0.05], [s * 0.30, 0.28, 0.10], [s * 0.26, -0.02, 0.03]], [0.11, 0.08, 0.018], hair, 6, 7);
  if (hairId === 'curly' && !shell) for (const [x, y, z] of [[-0.25, 0.46, 0.10], [-0.10, 0.58, 0.12], [0.06, 0.60, 0.10], [0.21, 0.50, 0.12], [-0.30, 0.34, -0.06], [0.30, 0.36, -0.06], [0, 0.56, -0.18], [-0.2, 0.5, -0.2], [0.2, 0.52, -0.2], [-0.33, 0.24, -0.12], [0.33, 0.24, -0.12], [0, 0.42, -0.3]]) put(new THREE.SphereGeometry(1, 8, 5), hair, { position: [x, y, z], scale: [0.078, 0.078, 0.068], crown: true });
  if (hairId === 'afro' && !hoodUp) {
    // sits back and up so the face stays clear (v2's was centred forward and covered the eyes)
    put(new THREE.SphereGeometry(1, 14, 9), hair, { position: [0, 0.52, -0.11], scale: [0.48, 0.4, 0.4], crown: true });
    for (const [x, y, r] of [[-0.40, 0.44, 0.1], [-0.26, 0.7, 0.1], [0, 0.76, 0.11], [0.26, 0.7, 0.1], [0.40, 0.44, 0.1]]) put(sphere(), hair, { position: [x, y, 0.0], scale: [r, r, r * 0.85], crown: true });
  }
  // side locks over the temples (v2), not on a shaved style
  if (!shell && !hoodUp && !['buzz', 'mohawk', 'undercut', 'afro', 'pompadour', 'tonsure'].includes(hairId)) for (const s of [-1, 1]) lock([[s * 0.28, 0.45, -0.02], [s * 0.335, 0.31, 0.008], [s * 0.30, 0.15, 0.052]], [0.06, 0.043, 0.002], shade(hair, -0.07));
  if (hairId === 'wavy' && !hoodUp) for (const s of [-1, 1]) lock([[s * 0.27, 0.46, -0.06], [s * 0.36, 0.33, 0.0], [s * 0.30, 0.20, 0.03], [s * 0.37, 0.05, -0.01], [s * 0.31, -0.08, -0.04], [s * 0.36, -0.20, -0.06]], [0.07, 0.065, 0.06, 0.055, 0.045, 0.01], shade(hair, 0.06), 6, 14, { bend: hangBend });
  if (hairId === 'long' && !hoodUp) for (const s of [-1, 1]) {
    // side curtains that frame the face and fall to the shoulders (v2's long hair was all behind the ears)
    lock([[s * 0.29, 0.46, 0.08], [s * 0.35, 0.28, 0.1], [s * 0.35, 0.05, 0.06], [s * 0.33, -0.22, 0.0]], [0.06, 0.07, 0.07, 0.02], shade(hair, 0.04), 5, 8, { bend: hangBend });
  }
  if (hairId === 'bob' && !hoodUp) {
    const open = 1.05, bob = new THREE.SphereGeometry(1, 14, 7, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0.62, 1.72);
    const lining = bob.clone(); { const idx = lining.index.array; for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]]; lining.computeVertexNormals(); }
    put(bob, hair, { position: [0, 0.30, -0.03], scale: [0.385, 0.40, 0.335] });
    put(lining, shade(hair, -0.2), { position: [0, 0.30, -0.03], scale: [0.375, 0.39, 0.325] });
  }
  if (hairId === 'braids' && !hoodUp) for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) put(new THREE.IcosahedronGeometry(1, 0), k % 2 ? shade(hair, 0.1) : hair, { position: [s * (0.31 + k * 0.005), 0.16 - k * 0.09, 0.10 + k * 0.014], scale: [0.052, 0.058, 0.046], bend: hangBend });
    put(new THREE.ConeGeometry(0.035, 0.07, 5), a.hair.color2 || '#c83a2a', { position: [s * 0.335, -0.32, 0.17], bend: hangBend });
  }
  if (/long|braids|pony|wavy|locs|mullet/.test(hairId) && hairId !== 'long_braid' && hairId !== 'high_ponytail' && !hoodUp) for (const s of [-1, 1]) lock([[s * 0.23, 0.42, -0.16], [s * 0.30, 0.13, -0.12], [s * 0.27, hairId === 'mullet' ? -0.06 : -0.16, -0.08]], [0.10, 0.085, 0.015], hair, 6, 7, { bend: hangBend });
  if (hairId === 'mullet' && !hoodUp) lock([[0, 0.3, -0.27], [0, 0.05, -0.3], [0, -0.12, -0.26]], [0.2, 0.17, 0.05], shade(hair, -0.04), 8, 6, { bend: hangBend });
  if (hairId === 'ponytail' && !hoodUp) lock([[0.27, 0.38, -0.10], [0.38, 0.10, -0.13], [0.31, -0.20, -0.08]], [0.11, 0.09, 0.02], hair, 7, 8, { bend: hangBend });
  if (hairId === 'high_ponytail' && !hoodUp) {
    put(new THREE.TorusGeometry(0.045, 0.018, 5, 10), hair2, { position: [0, 0.6, -0.2], rotation: [1.0, 0, 0] });
    lock([[0, 0.62, -0.2], [0, 0.66, -0.36], [0, 0.35, -0.42], [0, 0.02, -0.36]], [0.07, 0.1, 0.08, 0.015], hair, 7, 10, { bend: hangBend });
  }
  if (hairId === 'twin_tails' && !hoodUp) for (const s of [-1, 1]) {
    put(sphere(), hair2, { position: [s * 0.29, 0.5, -0.08], scale: [0.04, 0.04, 0.04] });
    lock([[s * 0.3, 0.5, -0.08], [s * 0.44, 0.38, -0.1], [s * 0.45, 0.1, -0.08], [s * 0.4, -0.18, -0.04]], [0.06, 0.09, 0.07, 0.012], hair, 7, 10, { bend: hangBend });
  }
  if ((hairId === 'bun' || hairId === 'buns' || hairId === 'topknot') && !hoodUp) {
    // ON the crown (v2's were inside the cap and invisible)
    const spots = hairId === 'buns' ? [[-0.23, 0.6, -0.03], [0.23, 0.6, -0.03]] : hairId === 'topknot' ? [[0, 0.68, -0.04]] : [[0, 0.6, -0.17]];
    for (const [x, y, z] of spots) {
      put(sphere(), hair, { position: [x, y, z], scale: hairId === 'topknot' ? [0.08, 0.075, 0.08] : [0.12, 0.115, 0.11], crown: true });
      put(new THREE.TorusGeometry(hairId === 'topknot' ? 0.055 : 0.075, 0.014, 4, 12), hair2, { position: [x, y - (hairId === 'topknot' ? 0.06 : 0.07), z * 0.9], rotation: [Math.PI / 2 - (hairId === 'bun' ? 0.7 : 0), 0, 0], crown: true });
    }
  }
  if (hairId === 'long_braid' && !hoodUp) {
    for (let k = 0; k < 8; k++) put(new THREE.IcosahedronGeometry(1, 0), k % 2 ? shade(hair, 0.1) : hair, { position: [0, 0.22 - k * 0.085, -0.3 - Math.min(k, 3) * 0.012 - (k > 2 ? fit?.backPad || 0 : 0)], scale: [0.065 - k * 0.003, 0.06, 0.055], bend: hangBend });
    put(new THREE.ConeGeometry(0.04, 0.08, 5), hair2, { position: [0, -0.5, -0.33 - (fit?.backPad || 0)], rotation: [Math.PI, 0, 0], bend: hangBend });
  }
  if (hairId === 'locs' && !hoodUp) for (let k = 0; k < 12; k++) {
    const t = -2.4 + k / 11 * 4.8, x = Math.sin(t) * 0.33, z = Math.cos(t) * 0.28 - 0.02;
    if (z > 0.15) continue;                                  // never over the face
    const len = 0.32 + (k % 3) * 0.05;
    lock([[x * 0.95, 0.42, z * 0.95], [x * 1.08, 0.2, z * 1.12], [x * 1.05, 0.2 - len, z * 1.1]], [0.035, 0.034, 0.028], k % 2 ? shade(hair, 0.08) : hair, 5, 6, { bend: hangBend });
    put(sphere(), hair2, { position: [x * 1.05, 0.2 - len - 0.01, z * 1.1], scale: [0.03, 0.022, 0.03], bend: hangBend });
  }
  if (hairId === 'horns_hair') {
    // "Wild + horns": a shaggy fringe and two horns from the temples (v2 built no horns at all)
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.1; lock([[x, 0.55, 0.15], [x * 1.1, 0.5, 0.25], [x * 1.2 + (i % 2 ? 0.02 : -0.02), tipY(0.4), 0.268]], [0.05, 0.05, 0.004], hair, 5, 5); }
    if (!shell && !hoodUp) for (const s of [-1, 1]) put(taperedCurve([[s * 0.2, 0.52, 0.1], [s * 0.3, 0.68, 0.06], [s * 0.26, 0.86, -0.04]], [0.05, 0.035, 0.004], 6, 7), '#d9cfa8');
  }
}
