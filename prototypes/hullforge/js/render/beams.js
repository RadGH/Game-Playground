// Laser beams in 3D, after Voidwright's look (voidwright/js/render/draw.js, beam drawing + beamHelix):
//   - a wide soft glow, a coloured middle and a white-hot centre that flicker
//   - a pulsing emitter glow at the muzzle, a bloom where it lands (cool blue on a shield), sparks at the hit
//   - helix strands wrapped round the beam that spin along it: the count grows with `vis` = (Mk − 1) + rarity —
//     1 strand at vis 1, a double helix at 2, 3 at 3-4, 4 at 5+. Mining lasers always get at least 2 (warm yellow).
//     The half of each turn facing the camera is bright and thick, the half behind is dim and thin; strands start
//     at the muzzle and taper off at the far end; vis 3+ throws sparkles off the strands (not on low quality).
//     Epic+ parts colour the strands with their rarity colour (`rc`).
//   - pulse lasers get a faint wavering heat sheath; mining lasers kick up rock dust where they cut.
// All of it goes through the shared streak batch + the pooled particle clouds (no meshes made here).

import * as THREE from 'three';

const C = new THREE.Color(), RC = new THREE.Color(), W = new THREE.Color(1, 1, 1);
const MINE_GLOW = new THREE.Color('#ffd27a'), SHIELD_BLOOM = new THREE.Color('#bfe8ff');
const u = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), tmp = new THREE.Vector3(), toCam = new THREE.Vector3();

/** How many helix strands a beam gets. */
export function strandCount(bm) {
  const v = bm.vis || 0; let s = v >= 5 ? 4 : v >= 3 ? 3 : v;
  if (bm.kind === 'mining') s = Math.max(2, s);
  return s;
}

/**
 * Draw this step's beams.
 * fx: { streaks, glowOnce(x,y,z, r,g,b, size), glow(p), smoke(p), quality }
 */
export function drawBeams(beams, fx, camPos, now) {
  const S = fx.streaks;
  for (const bm of beams) {
    const mining = bm.kind === 'mining';
    const ax = bm.from.x, ay = bm.from.y, az = bm.from.z;
    u.set(bm.to.x - ax, bm.to.y - ay, bm.to.z - az); const L = u.length(); if (L < 0.05) continue; u.multiplyScalar(1 / L);
    C.set(bm.color); if (mining) C.lerp(MINE_GLOW, 0.3);
    const vis = bm.vis || 0;
    const wd = (mining ? 0.1 : 0.13) * (1 + Math.min(4, vis) * 0.08);      // core half-width (m)
    const fl = 0.85 + Math.random() * 0.3;                                   // flicker
    // the layers: wide soft glow, coloured middle, white centre
    // mining beams run right past your own camera most of the time, so they glow softer (no white-out under bloom)
    const k = mining ? 0.6 : 1;
    S.add(ax, ay, az, bm.to.x, bm.to.y, bm.to.z, wd * 4 * fl, C.r * k, C.g * k, C.b * k, 0.2 * k, 0.15 * k, 1.8);
    S.add(ax, ay, az, bm.to.x, bm.to.y, bm.to.z, wd * 1.4, C.r * 1.5 * k, C.g * 1.5 * k, C.b * 1.5 * k, 0.75, 0.65, 1.1);
    S.add(ax, ay, az, bm.to.x, bm.to.y, bm.to.z, wd * 0.4, 1.4 * k, 1.4 * k, 1.4 * k, 1, 0.9, 0.7);
    // heat shimmer on pulse lasers: a faint sheath that wavers sideways along the beam
    if (!mining) heatSheath(S, bm, L, wd, now);
    // the emitter: a pulsing glow at the muzzle so you can see where the beam comes from
    const pulse = 0.8 + 0.2 * Math.sin(now * 30 + (bm.tkey || 0));
    fx.glowOnce(ax, ay, az, C.r, C.g, C.b, (0.9 + wd * 4) * pulse * fl * k);
    fx.glowOnce(ax, ay, az, 1, 1, 1, 0.35 * pulse * k);
    if (vis >= 1 || mining) helix(S, fx, bm, L, wd, vis, mining, camPos, now);
    if (!bm.hit) continue;
    // where it lands: a bloom (blue on a shield), sparks, and on rock a puff of dust
    const ex = bm.to.x, ey = bm.to.y, ez = bm.to.z;
    if (bm.shield) { fx.glowOnce(ex, ey, ez, SHIELD_BLOOM.r, SHIELD_BLOOM.g, SHIELD_BLOOM.b, 2.6 * fl); continue; }
    const bs = (1.3 + wd * 4) * (1 + Math.min(4, vis) * 0.18) * fl;
    fx.glowOnce(ex, ey, ez, C.r * 1.4, C.g * 1.4, C.b * 1.4, bs);
    fx.glowOnce(ex, ey, ez, 1, 1, 1, bs * 0.35);
    if (vis >= 3) { RC.set(bm.rc || '#ffffff'); fx.glowOnce(ex, ey, ez, RC.r, RC.g, RC.b, bs * (0.5 + Math.random() * 0.3)); }
    if (Math.random() < 0.55 * fx.quality) {
      // sparks bounce back off the surface, roughly against the beam
      const s = 6 + Math.random() * 12;
      fx.glow({ x: ex, y: ey, z: ez, vx: (-u.x + (Math.random() - 0.5) * 1.6) * s, vy: (-u.y + (Math.random() - 0.5) * 1.6) * s, vz: (-u.z + (Math.random() - 0.5) * 1.6) * s,
        life: 0.3, max: 0.3, r: mining ? 1 : C.r, g: mining ? 0.82 : C.g, b: mining ? 0.5 : C.b, size: 0.35, drag: 0.9, st: 1 });
    }
    if (mining && Math.random() < 0.35 * fx.quality) {
      const g = 0.28 + Math.random() * 0.12;
      fx.smoke({ x: ex - u.x * 0.3, y: ey - u.y * 0.3, z: ez - u.z * 0.3, vx: (-u.x + (Math.random() - 0.5)) * 2.5, vy: (-u.y + (Math.random() - 0.5)) * 2.5, vz: (-u.z + (Math.random() - 0.5)) * 2.5,
        life: 0.9 + Math.random() * 0.6, max: 1.5, r: g * 1.1, g, b: g * 0.85, a: 0.4, size: 0.7, grow: 1.6, drag: 0.96 });
    }
  }
}

/** Two directions at right angles to the beam (n1, n2), for wrapping things round it. */
function basis() {
  tmp.set(0, 1, 0); if (Math.abs(u.y) > 0.9) tmp.set(1, 0, 0);
  n1.crossVectors(u, tmp).normalize(); n2.crossVectors(u, n1).normalize();
}

function helix(S, fx, bm, L, wd, vis, mining, camPos, now) {
  basis();
  const strands = strandCount(bm);
  const amp = wd * 3 + 0.3 + Math.min(4, vis) * 0.06;      // how far from the axis the strands wind
  const lam = 3.2 + wd * 6;                                    // one full turn every `lam` metres
  const spin = now * 9 * (mining ? 0.8 : 1);
  const col = bm.rc ? RC.set(bm.rc) : RC.copy(C).lerp(W, 0.15);
  // which side of the beam faces the camera (front half of each turn = bright + thick)
  toCam.set(camPos.x - bm.from.x, camPos.y - bm.from.y, camPos.z - bm.from.z).normalize();
  const cn1 = toCam.dot(n1), cn2 = toCam.dot(n2);
  const step = Math.max(0.35, lam / 10); const segs = Math.min(110, Math.ceil(L / step));
  const tw = (0.05 + wd * 0.35) * (1 + Math.min(3, vis) * 0.12);
  const taper = s => Math.min(1, s / 1.2, (L - s) / 1.5 + 0.3);    // start at the muzzle, taper at the far end
  for (let k = 0; k < strands; k++) {
    const ph = k * Math.PI * 2 / strands;
    let px = 0, py = 0, pz = 0, pf = 0;
    for (let i = 0; i <= segs; i++) {
      const s = i / segs * L; const th = s / lam * Math.PI * 2 - spin + ph;
      const c = Math.cos(th), sn = Math.sin(th); const r = amp * taper(s);
      const ox = (n1.x * c + n2.x * sn) * r, oy = (n1.y * c + n2.y * sn) * r, oz = (n1.z * c + n2.z * sn) * r;
      const x = bm.from.x + u.x * s + ox, y = bm.from.y + u.y * s + oy, z = bm.from.z + u.z * s + oz;
      const front = (c * cn1 + sn * cn2) >= 0 ? 1 : 0;      // this bit of strand is on the camera's side of the beam
      if (i > 0) {
        const f = (front + pf) / 2;
        const a = 0.3 + f * 0.7, w = tw * (1 + f * 0.7);
        S.add(px, py, pz, x, y, z, w, col.r * 1.8, col.g * 1.8, col.b * 1.8, a, a, 0.9);
      }
      px = x; py = y; pz = z; pf = front;
    }
  }
  // sparkles drifting off the strands
  if (vis >= 3 && fx.quality >= 1) {
    const count = Math.min(4, vis - 1);
    for (let i = 0; i < count; i++) if (Math.random() < 0.6) {
      const s = Math.random() * L; const th = s / lam * Math.PI * 2 - spin + Math.floor(Math.random() * strands) * Math.PI * 2 / strands;
      const c = Math.cos(th), sn = Math.sin(th); const r = amp * taper(s);
      const ox = n1.x * c + n2.x * sn, oy = n1.y * c + n2.y * sn, oz = n1.z * c + n2.z * sn;
      const white = Math.random() < 0.5; const sp = 1 + Math.random() * 2.5;
      fx.glow({ x: bm.from.x + u.x * s + ox * r, y: bm.from.y + u.y * s + oy * r, z: bm.from.z + u.z * s + oz * r, vx: ox * sp, vy: oy * sp, vz: oz * sp,
        life: 0.4, max: 0.4, r: white ? 1 : col.r, g: white ? 1 : col.g, b: white ? 1 : col.b, size: 0.28 + Math.random() * 0.2, drag: 0.92 });
    }
  }
}

function heatSheath(S, bm, L, wd, now) {
  basis();
  const segs = Math.min(24, Math.max(4, Math.ceil(L / 4)));
  let px = bm.from.x, py = bm.from.y, pz = bm.from.z;
  for (let i = 1; i <= segs; i++) {
    const s = i / segs * L; const k = Math.min(1, s / 3);
    const wob = Math.sin(s * 0.9 - now * 22) * wd * 1.4 * k, wob2 = Math.cos(s * 1.3 - now * 17) * wd * 1.1 * k;
    const x = bm.from.x + u.x * s + n1.x * wob + n2.x * wob2, y = bm.from.y + u.y * s + n1.y * wob + n2.y * wob2, z = bm.from.z + u.z * s + n1.z * wob + n2.z * wob2;
    const w = wd * (3.2 + Math.sin(s * 0.7 + now * 13) * 0.8);
    S.add(px, py, pz, x, y, z, w, C.r * 0.6 + 0.3, C.g * 0.6 + 0.3, C.b * 0.6 + 0.3, 0.1, 0.1, 2.2);
    px = x; py = y; pz = z;
  }
}
