// Kestrel kit — skirt bones: robes, gowns, long coats, kilts, tassets and aprons that the legs never go through
// (Thousandvale batch 4, 2026-10-28).
//
// THE PROBLEM. A garment is the body's own surface sampled again, so it moves with the skin under it — except below the
// crotch, where there is no skin between the legs. A robe sampled off the legs splits between them; a robe weighted to
// both thighs moves by their AVERAGE (zero, when one swings forward and the other back) and the front foot walks out
// through it. Chibi 2.5 (avatar-3d/js/chibi25-body.js) and Chibi 4 (chibi4/tools/blender/c4anim.py) solved it with
// skirt bones pushed by the legs plus a shorter stride; this is the same idea for the Kestrel rig:
//
//   * SKIRT_N = 6 bones, children of `hips`, at the hip joint height (64 + 6 = 70 bones, the contract's ceiling). They
//     rest unrotated, so the bind pose is unchanged. Only a look that hangs cloth below the crotch gets them
//     (clothes-catalog.js skirtOf); every other look keeps 64 bones and byte-identical clips.
//   * `skirtWeights(φ, depth)`: a skirt vertex below the pivot is shared by the two bones nearest its direction round the
//     body, handed over from the hips by how far below the pivot it is (0 at the pivot → all skirt at HAND below).
//   * `driveSkirtClip(clip, rig, profile)` runs once per baked clip (kestrel.js clipFor): for every frame it works out
//     where the thighs, knees, shins, ankles, heels and toes are in hips space (forward kinematics on the clip's own
//     quaternions), and tilts each bone just far enough that the cloth in its direction — the blend linear skinning will
//     actually draw (`boneTerm` + `legTerm`) — stays outside every leg point above the hem, plus a margin. Where a tilt cannot
//     clear a point (a thigh straight out sideways in a saddle) the bone SPREADS the cloth (scale x/z) instead. A leg
//     point below the hem is allowed: a foot under a robe's hem is what a robe looks like.
//   * The stride: clothes-catalog.js strideOf → `rig.P.stride` (the kit's own gaits, clips.js) and `rig.stride` on the
//     Chibi rig whose clips are retargeted (Chibi's walk / run / jump read it), so a floor-length robe takes shorter
//     steps and kicks the heel less, as a person in a robe does.
import * as THREE from 'three';

export const SKIRT_N = 6;
export const SKIRT_BONES = Array.from({ length: SKIRT_N }, (_, k) => 'skirt' + k);
/** Direction of skirt bone k round the body (radians from +z, positive toward +x). */
export const skirtAngle = k => k / SKIRT_N * Math.PI * 2;
const TAU = Math.PI * 2;
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap2 = a => ((a % TAU) + TAU) % TAU;

/** Depth below the pivot over which cloth hands over from the hips to the skirt bones (m, at base scale). */
export const HAND = 0.22;
/** How much of the cloth just under the hip follows the thigh on its side (it is pushed by it, as trousers are). */
export const LEG_A = 0.62;

/** The leg share of a skirt vertex at angle φ, `depth` m below the pivot: [legL, legR]. */
export function legShare(phi, depth, k = 1, legA = LEG_A) {
  // nothing above the hip joint (cloth there would swing BACK into the body as the thigh comes up), most just under it
  const a = legA * sm(0, 0.07 * k, depth) * (1 - sm(0.12 * k, 0.42 * k, depth));
  if (a <= 0) return [0, 0];
  const sR = sm(-0.4, 0.4, Math.sin(phi));
  return [a * (1 - sR), a * sR];
}
/**
 * Skin weights of a skirt vertex at angle φ (0 = front) and `depth` m below the pivot; `top` = its weights above. Three
 * shares: the thigh on its side (`legShare`, strongest just under the hip, gone by mid-thigh — the cloth there is pushed
 * by the leg), the two skirt bones nearest its direction (handed over from the hips by depth), the rest on `top`.
 */
export function skirtWeights(phi, depth, top, k = 1, hand = HAND * k, legA = LEG_A) {
  const [wl, wr] = legShare(phi, depth, k, legA), a = wl + wr;
  const t = sm(0, hand, depth) * (1 - a);
  if (t <= 0 && a <= 0) return top;
  const f = wrap2(phi) / TAU * SKIRT_N, k0 = Math.floor(f) % SKIRT_N, k1 = (k0 + 1) % SKIRT_N, w1 = f - Math.floor(f);
  const rest = 1 - a - t;
  const out = top.map(([b, w]) => [b, w * rest]);
  if (wl > 0) out.push(['legL', wl]);
  if (wr > 0) out.push(['legR', wr]);
  if (t > 0) out.push(['skirt' + k0, t * (1 - w1)], ['skirt' + k1, t * w1]);
  return out;
}

// --------------------------------------------------------------------------------------------- the profile
/**
 * What driveSkirtClip needs to know about the body and the cloth (built once per template by clothes.js):
 *   surfaces: [{ R(φ, yRel) → rest radius of the cloth from the pivot axis at height yRel (m, relative to the pivot),
 *               rows: [yRel...] top → bottom, hem(φ) → yRel of the hem, arc: null | [[from, to], …] (radians) }]
 *   legs: per side { joints (rest, hips space), radii along the thigh / shin / foot }, pivot (hips space), k
 */
export function legPoints(Q, prof) {
  // Q: { legL, kneeL, footL, toeL, legR, ... } THREE.Quaternions (local) → leg SURFACE points in pivot space, each with
  // the joints from its own bone back up to the hip (the path the leg takes out of the skirt)
  const out = prof._pts || (prof._pts = []);
  let n = 0;
  for (const s of ['L', 'R']) {
    const L = prof.legs[s];
    const qL = Q['leg' + s], qK = qL.clone().multiply(Q['knee' + s]), qF = qK.clone().multiply(Q['foot' + s]), qT = qF.clone().multiply(Q['toe' + s]);
    const hip = L.hip, knee = hip.clone().add(L.knee.clone().applyQuaternion(qL));
    const ankle = knee.clone().add(L.ankle.clone().applyQuaternion(qK)), toe = ankle.clone().add(L.toe.clone().applyQuaternion(qF));
    const J = [[hip, qL], [knee, qK], [ankle, qF], [toe, qT]];
    const paths = [[hip], [knee, hip], [ankle, knee, hip], [toe, ankle, knee, hip]];
    for (const [b, v] of L.pts) {
      const [o, q] = J[b];
      const p = out[n] || (out[n] = [new THREE.Vector3(), 0, null]);
      p[0].copy(v).applyQuaternion(q).add(o); p[1] = 0; p[2] = paths[b]; n++;
    }
  }
  out.length = n;
  return out;
}

/** Do 2D segments ab and cd cross? */
function crosses(ax, ay, bx, by, cx, cy, dx, dy) {
  const o1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), o2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const o3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), o4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return o1 * o2 < 0 && o3 * o4 < 0;
}
/**
 * In the half-plane through the axis at angle `ang` (coordinates [ρ, y]): does the leg's path — the point pushed out by
 * `margin`, then its joints back to the hip — cross the cloth's polyline `cur` (top → hem)? A leg that leaves the skirt
 * under its hem does not cross it; a leg through the cloth does. Exported for the tests (the same rule).
 */
export function pathCrossesCloth(cur, q, path, ang, margin, around = true) {
  const sx = Math.sin(ang), cz = Math.cos(ang), rq = Math.hypot(q.x, q.z);
  const starts = around && margin > 0 ? [[rq + margin, q.y], [rq, q.y + margin], [rq, q.y - margin]] : [[rq + margin, q.y]];
  for (const [sx0, sy0] of starts) {
    let px = sx0, py = sy0;
    for (const j of path) {
      const jx = Math.max(0, j.x * sx + j.z * cz), jy = j.y;
      for (let i = 1; i < cur.length; i++) if (crosses(px, py, jx, jy, cur[i - 1][0], cur[i - 1][1], cur[i][0], cur[i][1])) return true;
      px = jx; py = jy;
    }
  }
  return false;
}

const inArcs = (ang, arcs, tol = 0) => {
  if (!arcs) return true;
  for (const [a, b] of arcs) { const d = wrap2(ang - a), w = wrap2(b - a); if (d <= w + tol || d >= TAU - tol) return true; }
  return false;
};
/**
 * The skirt bones' share of the rest profile `prof` ([radius, yRel] per row, direction `ang`) after the two bones nearest
 * `ang` tilt by `alpha`: [[x, y, z, t], ...] (t = the share), cached per direction and tilt (it does not depend on the legs).
 */
function boneTerm(prof, ang, alpha, hand, k, legA) {
  const f = ang / TAU * SKIRT_N, k0 = Math.floor(f) % SKIRT_N, w1 = f - Math.floor(f);
  const dx = Math.sin(ang), dz = Math.cos(ang), c = Math.cos(alpha), sn = Math.sin(alpha);
  const bones = [[k0, 1 - w1], [(k0 + 1) % SKIRT_N, w1]].map(([kk, w]) => { const phi = skirtAngle(kk); return [-Math.cos(phi), Math.sin(phi), w]; });
  return prof.map(([h0, v0]) => {
    const px = dx * h0, py = v0, pz = dz * h0, [wl, wr] = legShare(ang, -v0, k, legA), t = sm(0, hand, -v0) * (1 - wl - wr);
    let ox = 0, oy = 0, oz = 0;
    for (const [ax, az, w] of bones) {
      const dot = ax * px + az * pz, cx = -az * py, cy = az * px - ax * pz, cz = ax * py;
      ox += w * (px * c + cx * sn + ax * dot * (1 - c)); oy += w * (py * c + cy * sn); oz += w * (pz * c + cz * sn + az * dot * (1 - c));
    }
    return [ox * t, oy * t, oz * t, t];
  });
}
/** The rest-and-legs share of the same rows for this frame: [[x, y, z], ...] (the hips' share + each thigh's turn). */
function legTerm(prof, ang, legs, k, legA) {
  const dx = Math.sin(ang), dz = Math.cos(ang), v = new THREE.Vector3();
  return prof.map(([h0, v0]) => {
    const p = new THREE.Vector3(dx * h0, v0, dz * h0), [wl, wr] = legShare(ang, -v0, k, legA), t = sm(0, legs.hand, -v0) * (1 - wl - wr);
    const out = p.clone().multiplyScalar(1 - wl - wr - t);
    if (wl > 0) out.addScaledVector(v.copy(p).sub(legs.L.hip).applyQuaternion(legs.L.q).add(legs.L.hip), wl);
    if (wr > 0) out.addScaledVector(v.copy(p).sub(legs.R.hip).applyQuaternion(legs.R.q).add(legs.R.hip), wr);
    return [out.x, out.y, out.z];
  });
}

const BINS = 72;
/** Tilts (and spreads) for one frame: `pts` = legPoints(...) → { tilt: [6], spread: [6] }. */
export function skirtPose(pts, prof, margin = 0.026, Q = null) {
  const need = new Array(SKIRT_N).fill(0), spread = new Array(SKIRT_N).fill(1);
  const bump = (ang, a, sp) => {
    const f = ang / TAU * SKIRT_N, k0 = Math.floor(f) % SKIRT_N, k1 = (k0 + 1) % SKIRT_N;
    need[k0] = Math.max(need[k0], a); need[k1] = Math.max(need[k1], a);
    spread[k0] = Math.max(spread[k0], sp); spread[k1] = Math.max(spread[k1], sp);
  };
  const k = prof.k;
  for (const surf of prof.surfaces) {
    const hand = surf.hand ?? HAND * k, legA = surf.legA ?? LEG_A;
    const legs = { hand, L: { hip: prof.legs.L.hip, q: Q ? Q.legL : new THREE.Quaternion() }, R: { hip: prof.legs.R.hip, q: Q ? Q.legR : new THREE.Quaternion() } };
    surf.bins ||= []; surf.blends ||= [];
    const frameLeg = new Map();
    for (const [q, r, path] of pts) {
      let ang = wrap2(Math.atan2(q.x, q.z));
      if (q.y > 0) continue;                                             // above the hip joint: the torso shell's business
      const dist = Math.hypot(q.x, q.z);
      // a leg in a coat's front split or beside a flap passes through the opening: it pushes nothing
      if (!inArcs(ang, surf.arcs, 0.15)) continue;
      const rho = dist + r + margin;
      const bin = Math.round(ang / TAU * BINS) % BINS, bang = bin / BINS * TAU;
      const prof0 = surf.bins[bin] || (surf.bins[bin] = surf.rows.map(y => [surf.R(bang, y), y]));
      const row = surf.blends[bin] || (surf.blends[bin] = []);
      const lt = frameLeg.get(bin) || frameLeg.set(bin, legTerm(prof0, bang, legs, k, legA)).get(bin);
      const dx = Math.sin(bang), dz = Math.cos(bang);
      const curveAt = alpha => {
        const ai = Math.round(alpha / 0.02);
        const bt = row[ai] || (row[ai] = boneTerm(prof0, bang, ai * 0.02, hand, k, legA));
        return bt.map((b, i) => { const x = lt[i][0] + b[0], y = lt[i][1] + b[1], z = lt[i][2] + b[2]; return [x * dx + z * dz, y]; });
      };
      let best = -Infinity, bestAlpha = 0;
      const clears = alpha => {
        const cur = curveAt(alpha);
        if (!pathCrossesCloth(cur, q, path, ang, margin)) return true;
        let h = cur[cur.length - 1][0];
        for (let i = 1; i < cur.length; i++) { const A = cur[i - 1], B = cur[i]; if ((A[1] - q.y) * (B[1] - q.y) <= 0 && A[1] !== B[1]) { h = A[0] + (B[0] - A[0]) * (q.y - A[1]) / (B[1] - A[1]); break; } }
        if (h - rho > best + 1e-4) { best = h - rho; bestAlpha = alpha; }
        return false;
      };
      let alpha = 0, done = false;
      if (clears(0)) done = true;
      else {
        for (alpha = 0.1; alpha <= 1.55 + 1e-9; alpha += 0.1) if (clears(alpha)) { done = true; break; }
        if (done) { const lo = alpha - 0.1; for (let a2 = lo + 0.02; a2 < alpha - 1e-9; a2 += 0.02) if (clears(a2)) { alpha = a2; break; } }
      }
      if (done) bump(ang, Math.min(alpha, 1.55), 1);
      else {
        const wt = Math.max(0.25, sm(0, hand, -q.y));
        const h0 = prof0.reduce((b, [hh, vv], i) => (i && (prof0[i - 1][1] - q.y) * (vv - q.y) <= 0) ? hh : b, prof0[0][0]);
        bump(ang, bestAlpha, Math.min(1.9, 1 + (rho / Math.max(0.05, h0) - 1) / wt + 0.03));
      }
    }
  }
  const soft = need.map((v, kk) => Math.max(v, 0.62 * need[(kk + 1) % SKIRT_N], 0.62 * need[(kk + SKIRT_N - 1) % SKIRT_N]));
  return { tilt: soft, spread };
}

const DOWN = new THREE.Vector3(0, -1, 0);
/** The skirt bone's local rotation for a tilt `alpha` toward its own direction. */
export function tiltQuat(k, alpha, out = new THREE.Quaternion()) {
  const a = skirtAngle(k);
  return out.setFromUnitVectors(DOWN, new THREE.Vector3(Math.sin(a) * Math.sin(alpha), -Math.cos(alpha), Math.cos(a) * Math.sin(alpha)));
}

/**
 * A baked clip with its skirt tracks computed from its own leg tracks (replaces any skirt tracks it had). `rig` = the
 * Kestrel rig (with skirt bones), `prof` = clothes.js skirt profile. Returns a new AnimationClip.
 */
export function driveSkirtClip(clip, rig, prof) {
  if (!prof || !rig.byName.skirt0) return clip;
  const legT = clip.tracks.find(t => t.name === 'legL.quaternion');
  if (!legT) return clip;
  const times = legT.times, n = times.length;
  const want = ['legL', 'kneeL', 'footL', 'toeL', 'legR', 'kneeR', 'footR', 'toeR'];
  const ip = {};
  for (const b of want) { const t = clip.tracks.find(tr => tr.name === b + '.quaternion'); ip[b] = t ? t.createInterpolant() : null; }
  const Q = Object.fromEntries(want.map(b => [b, new THREE.Quaternion()]));
  const qv = SKIRT_BONES.map(() => new Float32Array(n * 4)), sv = SKIRT_BONES.map(() => new Float32Array(n * 3));
  const tq = new THREE.Quaternion();
  // a frame whose legs are where the last solved frame's were (an idle, a held pose) reuses its answer
  let last = null, lastQ = null;
  for (let i = 0; i < n; i++) {
    for (const b of want) { if (ip[b]) { const v = ip[b].evaluate(times[i]); Q[b].set(v[0], v[1], v[2], v[3]).normalize(); } else Q[b].identity(); }
    const same = lastQ && want.every(b => Math.abs(Q[b].dot(lastQ[b])) > 0.99995);
    const res = same ? last : skirtPose(legPoints(Q, prof), prof, undefined, Q);
    if (!same) { last = res; lastQ = Object.fromEntries(want.map(b => [b, Q[b].clone()])); }
    const { tilt, spread } = res;
    for (let k = 0; k < SKIRT_N; k++) {
      tiltQuat(k, tilt[k], tq);
      qv[k].set([tq.x, tq.y, tq.z, tq.w], i * 4);
      sv[k].set([spread[k], 1, spread[k]], i * 3);
    }
  }
  const keep = clip.tracks.filter(t => !/^skirt\d\./.test(t.name));
  for (let k = 0; k < SKIRT_N; k++) {
    keep.push(new THREE.QuaternionKeyframeTrack(SKIRT_BONES[k] + '.quaternion', times, qv[k]));
    keep.push(new THREE.VectorKeyframeTrack(SKIRT_BONES[k] + '.scale', times, sv[k]));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, keep);
}

/**
 * The leg description driveSkirtClip reads, from a Kestrel rig and the body parts (rest pose, pivot space): the joints,
 * and points ON the leg's surface (rings down the thigh and shin, a few on the foot), each pushed out by what is worn
 * there (`pads`: trousers, boots, greaves) and filed under the joint whose turn moves it.
 */
export function legsOf(rig, parts, P, pads = { thigh: 0, shin: 0, foot: 0 }) {
  const B = rig.byName, W = n => new THREE.Vector3(...B[n].userData.world);
  const pivot = new THREE.Vector3(0, P.hipY, 0);
  const legs = {};
  for (const s of ['L', 'R']) {
    const leg = parts['leg' + s];
    const hip = W('leg' + s), knee = W('knee' + s), ankle = W('foot' + s), toe = W('toe' + s);
    const pts = [];
    const ring = (u, b, origin, pad, n = 8) => {
      const F = leg.frame(u);
      for (let j = 0; j < n; j++) {
        const q = leg.at(u, j / n * TAU, { bump: 0.6 }).p, d = new THREE.Vector3(q[0] - F.c[0], q[1] - F.c[1], q[2] - F.c[2]).normalize();
        pts.push([b, new THREE.Vector3(...q).addScaledVector(d, pad).sub(origin)]);
      }
    };
    for (const f of [0.4, 0.55, 0.72, 0.88]) ring(leg.sH + f * (leg.sK - leg.sH), 0, hip, pads.thigh);   // (from the groin on: nearer the hip the leg comes out of the body)
    ring(leg.sK, 1, knee, (pads.thigh + pads.shin) / 2);
    for (const f of [0.12, 0.25, 0.5, 0.75, 0.95]) ring(leg.sK + f * (leg.sA - leg.sK), 1, knee, pads.shin);
    const F = P.footLen, k = P.k, fz = F / 0.27;
    for (const v of [[0, -0.03 * k, -0.075 * fz], [0, 0.03 * k, -0.06 * fz], [0.04, -0.04 * k, 0.02 * fz], [-0.04, -0.04 * k, 0.02 * fz], [0, 0.0, 0.07 * fz], [0, 0.02 * k, 0.02 * fz], [0, -0.05 * k, 0.11 * fz], [0.035, -0.05 * k, 0.1 * fz], [-0.035, -0.05 * k, 0.1 * fz]]) pts.push([2, new THREE.Vector3(v[0] * (s === 'L' ? -1 : 1), v[1], v[2])]);
    pts.push([3, new THREE.Vector3(0, -0.005 * k, 0.05 * fz)]);
    legs[s] = { hip: hip.clone().sub(pivot), knee: knee.clone().sub(hip), ankle: ankle.clone().sub(knee), toe: toe.clone().sub(ankle), pts };
    for (const p of pts) if (p[0] >= 2) p[1].setLength(p[1].length() + pads.foot);   // (a shoe is bigger than the foot)
  }
  return legs;
}
