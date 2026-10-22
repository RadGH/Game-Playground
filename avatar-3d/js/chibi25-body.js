// Chibi 2.5, part B — skirt bones: robes, dresses, skirts, coat tails and long capes that the feet never go through.
//
// THE PROBLEM (Chibi 2). A robe is one rigid lathe on the HIPS bone. Walk swings a thigh ±0.42 rad and run ±0.78 rad
// with the heel kicked 1.6 rad back, so the front foot leaves the robe through its front wall and the back heel
// through its back wall on most frames of a run (measured: tools/chibi25-measure.mjs, numbers in CHIBI2.md).
//
// THE LESSON (Chibi 4 step 6, avatar-3d/chibi4/README.md): weighting the cloth to the thighs does not work, because the
// two thighs swing in opposite directions — a front vertex weighted to both moves by their AVERAGE, which is zero.
// What worked was BOTH of: (1) skirt bones round the hips that are each driven by whichever leg is pushing on their
// side the hardest (the front bones by the further-forward leg, the back bones by the further-back heel), and (2) a
// shorter, robe-aware stride. Neither alone was enough there, and neither is here (see the robe test).
//
// HOW IT IS BUILT HERE (only for a 2.5 look that wears something long — `needsSkirt(a)`):
//   - `addSkirtBones(rig)` appends SKIRT_COUNT bones, children of `hips`, at the hip pivot, after part A's eyelids.
//     At rest they are the hips' own frame, so the bind pose is unchanged.
//   - a garment piece passes `weigh: skirtWeigh(rig, …)` to SkinBuilder.add: a vertex below the hip pivot is shared by
//     the two skirt bones nearest its direction round the body, more so the lower it is; above the pivot it stays on
//     its own bone. Long capes do the same from the chest, so a kicked-back heel lifts the cape's hem.
//   - `driveSkirt(pose, rig)` runs on every baked frame of every clip (createClips): it works out where the knees,
//     shins, ankles, toes and heels are in hips space (forward kinematics on the frame's own pose) and tilts each
//     skirt bone just far enough that the cloth in its direction stays outside every leg point above the hem, plus a
//     margin. A point under the hem is allowed — a foot showing under a robe's hem is what a robe looks like.
//   - `strideFor(a)` is the robe stride the walk/run/jump clips read through `rig.stride`.
import * as THREE from 'three';
import { topStyle, bottomStyle } from './chibi2-body.js';

export const SKIRT_COUNT = 8;
export const SKIRT_BONES = Array.from({ length: SKIRT_COUNT }, (_, k) => 'skirt' + k);
/** Direction of skirt bone k round the body, radians from +z (front), positive toward +x. */
export const skirtAngle = k => k / SKIRT_COUNT * Math.PI * 2;

/** Capes that hang to the thigh or lower (their hem is what a kicked heel hits). */
export const LONG_CAPES = ['cape', 'travel_cloak', 'tattered_cape', 'half_cape', 'long_cloak'];

/** What long thing this look wears, or null. `hem`: the lowest garment edge, in leg lengths below the hip pivot. */
export function longGarment(a) {
  const top = topStyle(a?.top?.id), bot = bottomStyle(a?.bottom?.id), cape = a?.cape?.id;
  const kind = ['long', 'knee', 'coat', 'trench'].includes(top.hem) ? top.hem : null;
  const skirt = ['skirt', 'kilt', 'loincloth'].includes(bot.garment) ? bot.garment : null;
  const longCape = LONG_CAPES.includes(cape) ? cape : null;
  if (!kind && !skirt && !longCape) return null;
  const hem = kind === 'long' ? 0.9 : kind === 'trench' ? 0.8 : kind === 'coat' ? 0.55 : kind === 'knee' ? 0.52 : skirt ? (bot.length ?? 0.46) : longCape === 'long_cloak' ? 0.88 : 0;
  return { top: kind, bottom: skirt, cape: longCape, hem };
}
export const needsSkirt = a => !!longGarment(a);

/**
 * The robe stride: how much of the plain gait's thigh swing / knee kick a clip keeps. A floor-length robe shortens
 * the step the most (as a person in a long robe does); a knee-length hem or a skirt less; a cape only reins the heel.
 */
export function strideFor(a) {
  const g = longGarment(a);
  if (!g) return null;
  // `shin`: the most the shin may point back from straight down (thigh + knee, rad) in a gait — a short-legged body's
  // heel would otherwise kick up to the hip line, where no tilt of the cloth can cover it
  if (g.top === 'long') return { swing: 0.62, kick: 0.55, lift: 0.7, shin: 1.3, thigh: 0.66 };
  if (g.top === 'trench') return { swing: 0.7, kick: 0.62, lift: 0.75, shin: 1.35, thigh: 0.7 };
  if (g.cape === 'long_cloak' || (g.bottom && (topStyle(a?.top?.id), bottomStyle(a?.bottom?.id).length || 0) > 0.7)) return { swing: 0.66, kick: 0.58, lift: 0.72, shin: 1.35, thigh: 0.68 };
  if (g.top === 'knee' || g.top === 'coat' || g.bottom) return { swing: 0.78, kick: 0.72, lift: 0.85, shin: 1.45, thigh: 0.72 };
  return { swing: 0.95, kick: 0.75, lift: 1, shin: 1.7, thigh: 1.2 };            // a long cape: the back kick is what reaches it
}
/** The clips `capShin` applies to: the gaits. A kick, a kneel or a saddle is meant to put the leg where it puts it. */
export const GAIT_CLIPS = new Set(['walk', 'run', 'jump', 'sprint', 'backpedal', 'strafeL', 'strafeR']);
export const HEEL_DEPTH = 0.17;
const CHORD = 0.975;
/** Hold the heel down under a long garment (see `shin` in strideFor): the knee gives up whatever is over the cap. */
export function capShin(pose, stride, L = 0.53) {
  if (!stride?.shin) return;
  for (const s of ['L', 'R']) {
    // the heel never comes up closer than HEEL_DEPTH under the hip pivot: there the cloth hangs straight down from the
    // waist and no tilt of a skirt bone can reach round it (a goblin's short leg at a sprint did exactly that)
    const a = pose['leg' + s][0], k = pose['knee' + s][0];
    if (a > 0 && L > 0) {
      const need = (HEEL_DEPTH / L - 0.51 * Math.cos(a)) / 0.49;
      const maxK = need >= 1 ? -a : need <= -1 ? Infinity : Math.acos(need) - a;
      if (k > maxK) { pose['knee' + s][0] = Math.max(0, maxK); pose['foot' + s][0] += (k - Math.max(0, maxK)) * 0.5; }
    }
    const over = pose['leg' + s][0] + pose['knee' + s][0] - stride.shin;
    if (over > 0) { pose['knee' + s][0] -= over; pose['foot' + s][0] += over * 0.5; }
    // and the thigh never comes up further forward than `thigh` (a short body's knee would reach the hip line)
    if (stride.thigh && pose['leg' + s][0] < -stride.thigh) pose['leg' + s][0] = -stride.thigh;
  }
}

/** Append the skirt bones to a rig (after every other bone, so v2 bone indices never move). */
export function addSkirtBones(rig) {
  if (rig.byName.skirt0) return rig;
  const hips = rig.byName.hips;
  for (const name of SKIRT_BONES) {
    const b = new THREE.Bone(); b.name = name;
    b.userData.index = rig.bones.length; rig.bones.push(b); rig.byName[name] = b;
    hips.add(b);
  }
  rig.root.updateMatrixWorld(true);
  rig.skirt = { bones: SKIRT_BONES, garment: null, surfaces: [] };
  return rig;
}

/**
 * A `weigh` function for SkinBuilder.add: a vertex of a garment authored in `bone` space (hips or chest) is shared
 * between `bone` and the two skirt bones nearest its direction, by how far below the hip pivot it is.
 * `from`..`to`: the depth below the pivot (m) over which the cloth hands over from its bone to the skirt.
 */
export const SKIRT_FROM = -0.08, SKIRT_TO = 0.16;
export function skirtWeigh(rig, bone, { from = SKIRT_FROM, to = SKIRT_TO, back = false } = {}) {
  const dy = bone === 'chest' ? rig.byName.chest.position.y : 0;     // chest space -> hips space
  return (x, y, z) => {
    const depth = -(y + dy);
    const t = THREE.MathUtils.smoothstep(depth, from, to);
    if (t <= 0) return [[bone, 1]];
    let ang = Math.atan2(x, z); if (ang < 0) ang += Math.PI * 2;
    if (back && Math.abs(x) < 1e-6 && z > -1e-6) ang = Math.PI;      // a cape's sheet always hangs from the back bones
    const f = ang / (Math.PI * 2) * SKIRT_COUNT, k0 = Math.floor(f) % SKIRT_COUNT, k1 = (k0 + 1) % SKIRT_COUNT, w1 = f - Math.floor(f);
    return [[bone, 1 - t], ['skirt' + k0, t * (1 - w1)], ['skirt' + k1, t * w1]];
  };
}

/**
 * Tell the rig what cloth hangs from the skirt so `driveSkirt` knows how far out it is.
 * `rings` are lathe rings [y, rx, rz, z] in HIPS space (a cape passes its sheet as rings over its covered arc).
 * `arc`: [from, to] radians (round the body, 0 = front) the cloth covers; null = all the way round.
 */
export function registerSkirtSurface(rig, rings, { arc = null, hem = null, from = SKIRT_FROM, to = SKIRT_TO } = {}) {
  if (!rig.skirt) return;
  const sorted = [...rings].sort((p, q) => q[0] - p[0]);              // top first
  rig.skirt.surfaces.push({ rings: sorted, arc, hem: hem ?? sorted[sorted.length - 1][0], from, to });
}

const inArc = (ang, arc, tol = 0) => {
  if (!arc) return true;
  const n = a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const d = n(ang - arc[0]), width = n(arc[1] - arc[0]);
  return d <= width + tol || d >= Math.PI * 2 - tol;
};
/** `ang` moved into `arc` (the nearest edge), so a point just beside a flap tilts the flap's own bones. */
const intoArc = (ang, arc) => {
  if (!arc || inArc(ang, arc)) return ang;
  const d = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
  const e = d(ang, arc[0]) < d(ang, arc[1]) ? arc[0] + 0.01 : arc[1] - 0.01;
  return ((e % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
};
/** Rest radius of a lathe surface at height y, direction ang (from +z toward +x), measured from the hip axis. */
function radiusAt(rings, y, ang) {
  let a = rings[0], b = rings[rings.length - 1];
  for (let i = 1; i < rings.length; i++) if (y >= rings[i][0]) { a = rings[i - 1]; b = rings[i]; break; }
  const t = THREE.MathUtils.clamp((y - a[0]) / ((b[0] - a[0]) || 1), 0, 1);
  const rx = a[1] + (b[1] - a[1]) * t, rz = a[2] + (b[2] - a[2]) * t, z0 = (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * t;
  const sx = Math.sin(ang), cz = Math.cos(ang);
  // the ray from the axis at angle `ang` meets the ellipse (x/rx)^2 + ((z - z0)/rz)^2 = 1
  const A = (sx / rx) ** 2 + (cz / rz) ** 2, B = -2 * cz * z0 / (rz * rz), C = (z0 / rz) ** 2 - 1;
  return (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
}

// ---------------------------------------------------------------- driving the bones
/**
 * A rest profile `prof` ([radius, height] per ring, in direction `ang`) after both skirt bones nearest `ang` tilt by
 * `alpha`, blended exactly as skirtWeigh weighs the cloth (two bones by angle, handed over from the garment's own bone
 * between depths `from` and `to`). -> [[radius along ang, height], ...]
 */
function blendProfile(prof, ang, alpha, from, to) {
  const f = ang / (Math.PI * 2) * SKIRT_COUNT, k0 = Math.floor(f) % SKIRT_COUNT, w1 = f - Math.floor(f);
  const dx = Math.sin(ang), dz = Math.cos(ang), c = Math.cos(alpha), sn = Math.sin(alpha);
  const bones = [[k0, 1 - w1], [(k0 + 1) % SKIRT_COUNT, w1]].map(([k, w]) => { const phi = skirtAngle(k); return [-Math.cos(phi), Math.sin(phi), w]; });
  return prof.map(([h0, v0]) => {
    const px = dx * h0, py = v0, pz = dz * h0, t = THREE.MathUtils.smoothstep(-v0, from, to);
    let ox = 0, oy = 0, oz = 0;
    for (const [ax, az, w] of bones) {
      // Rodrigues about the horizontal axis (ax, 0, az): p cos + (a x p) sin + a (a . p)(1 - cos)
      const dot = ax * px + az * pz, cx = -az * py, cy = az * px - ax * pz, cz = ax * py;
      ox += w * (px * c + cx * sn + ax * dot * (1 - c)); oy += w * (py * c + cy * sn); oz += w * (pz * c + cz * sn + az * dot * (1 - c));
    }
    const bx = px + (ox - px) * t, by = py + (oy - py) * t, bz = pz + (oz - pz) * t;
    return [bx * dx + bz * dz, by];
  });
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Leg points (hips space) for one frame's pose: knee, two along the shin, ankle, toe, heel, instep, both legs. */
function legPoints(pose, rig) {
  const out = [], L = rig.leg, W = rig.wide, LW = Math.pow(W, 0.65), fk = 0.85 + LW * 0.15;
  for (const [s, x] of [['L', -1], ['R', 1]]) {
    const qLeg = new THREE.Quaternion().setFromEuler(_e.set(...pose['leg' + s]));
    const qKnee = qLeg.clone().multiply(_q.setFromEuler(_e.set(...pose['knee' + s])));
    const qFoot = qKnee.clone().multiply(_q2.setFromEuler(_e.set(...pose['foot' + s])));
    const hip = new THREE.Vector3(x * 0.115 * W, 0, 0);
    const knee = hip.clone().add(new THREE.Vector3(0, -L * 0.51, 0).applyQuaternion(qLeg));
    const ankle = knee.clone().add(new THREE.Vector3(0, -L * 0.49, 0).applyQuaternion(qKnee));
    const r = 0.1 * LW * (rig.legThick || 1) + (rig.skirt?.legPad || 0);   // the shin's own thickness (and a boot or greave over it)
    const pts = [[knee, r], [knee.clone().lerp(ankle, 0.35), r], [knee.clone().lerp(ankle, 0.7), r * 0.85], [ankle, r * 0.8]];
    for (const [fx, fy, fz, fr] of [[0, -0.01, 0.2, 0.04], [0, 0.03, 0.1, 0.06], [0, -0.01, -0.07, 0.05], [0.08, 0, 0.06, 0.03], [-0.08, 0, 0.06, 0.03]]) {
      pts.push([ankle.clone().add(new THREE.Vector3(fx * fk, fy * fk, fz * fk).applyQuaternion(qFoot)), fr]);
    }
    for (const t of [0.12, 0.3, 0.6]) pts.push([hip.clone().lerp(knee, t), (0.1 + (rig.round || 0) * 0.03) * LW * (rig.legThick || 1)]);   // (a round body's thighs are fuller: chibi2-body.js legT)
    for (const p of pts) out.push(p);
  }
  return out;
}

/**
 * Tilt every skirt bone for one frame. `pose` is the frame's Euler pose (createClips' format); the skirt entries are
 * written in place, and `scale` (when given) gets each bone's sideways spread. Margin: how far outside a leg point the
 * cloth must stay (m).
 *
 * For each leg point and each cloth surface: the smallest outward tilt `alpha` (in steps of 0.02 rad, up to 1.25) for
 * which the cloth in that point's direction is further out than the point at the point's height — or for which the
 * hem has lifted above the point (it then shows UNDER the hem, which is allowed). A point the tilt alone cannot clear
 * (a thigh straight out to the side in a saddle, right under the waist) asks for SPREAD instead: the bone scales the
 * cloth outward round the body, so it bells out over the thigh.
 */
export function driveSkirt(pose, rig, margin = 0.04, scale = null) {
  const sk = rig.skirt;
  if (!sk || !sk.surfaces.length || !pose.skirt0) return;
  const need = new Array(SKIRT_COUNT).fill(0), spread = new Array(SKIRT_COUNT).fill(1);
  const pts = legPoints(pose, rig);
  const bump = (ang, a, sp) => {
    const f = ang / (Math.PI * 2) * SKIRT_COUNT, k0 = Math.floor(f) % SKIRT_COUNT, k1 = (k0 + 1) % SKIRT_COUNT;
    need[k0] = Math.max(need[k0], a); need[k1] = Math.max(need[k1], a);
    spread[k0] = Math.max(spread[k0], sp); spread[k1] = Math.max(spread[k1], sp);
  };
  for (const surf of sk.surfaces) {
    const top = surf.rings[0][0];
    for (const [q, r] of pts) {
      if (q.y + r < surf.hem) continue;                     // wholly under the hem: allowed
      let ang = Math.atan2(q.x, q.z); if (ang < 0) ang += Math.PI * 2;
      const dist = Math.hypot(q.x, q.z);
      // (2026-10-21: the angle a leg covers is measured where the CLOTH is, not at the leg's own centre — a thigh near the
      // axis "covered" every direction, so a front/back flap such as the loincloth was lifted level in idle)
      if (!inArc(ang, surf.arc, Math.asin(Math.min(1, (r + margin) / Math.max(0.05, dist, surf.arc ? surf.rings[0][1] : 0))))) continue;
      ang = intoArc(ang, surf.arc);
      const rho = dist + r + margin;
      // the rest profile in this direction, cached per 5 degrees on the surface (a clip bakes ~30 frames a second)
      const bin = Math.round(ang / (Math.PI * 2) * 72) % 72;
      surf.bins = surf.bins || [];
      const prof = surf.bins[bin] || (surf.bins[bin] = surf.rings.map(ring => [radiusAt(surf.rings, ring[0], bin / 72 * Math.PI * 2), ring[0]]));
      // the cloth in this direction is shared by two skirt bones (by angle) and handed over from its own bone by depth,
      // exactly as skirtWeigh weighs it — so the curve is the one linear blend skinning will actually draw. It depends
      // only on the direction (bin) and the tilt, so it is cached on the surface: every frame after the first is a lookup.
      surf.blends = surf.blends || [];
      const blendRow = surf.blends[bin] || (surf.blends[bin] = []);
      const curveAt = alpha => {
        const ai = Math.round(alpha / 0.02);
        return blendRow[ai] || (blendRow[ai] = blendProfile(prof, bin / 72 * Math.PI * 2, ai * 0.02, surf.from, surf.to));
      };
      let done = false, best = -Infinity, bestAlpha = 0;
      /** Does a tilt of `alpha` clear the point? (and remember the best miss) */
      const clears = alpha => {
        const cur = curveAt(alpha);
        if (q.y + r + 0.01 < cur[cur.length - 1][1]) return true;   // the hem has lifted over it
        let h = cur[0][0];
        for (let i = 1; i < cur.length; i++) {
          const A = cur[i - 1], B = cur[i];
          if ((A[1] - q.y) * (B[1] - q.y) <= 0 && A[1] !== B[1]) { h = A[0] + (B[0] - A[0]) * (q.y - A[1]) / (B[1] - A[1]); break; }
          if (q.y > A[1] && i === 1) { h = A[0]; break; }                         // above the top ring
        }
        if (h * CHORD >= rho) return true;          // (the drawn ring is a 16-sided polygon: its flats sit inside the ellipse)
        if (h - rho > best + 1e-4) { best = h - rho; bestAlpha = alpha; }
        return false;
      };
      // coarse steps of 0.1 rad to the first tilt that clears, then back in steps of 0.02 to the smallest
      let alpha = 0;
      if (clears(0)) done = true;
      else {
        for (alpha = 0.1; alpha <= 1.55 + 1e-9; alpha += 0.1) if (clears(alpha)) { done = true; break; }
        if (done) { let lo = alpha - 0.1; for (let a2 = lo + 0.02; a2 < alpha - 1e-9; a2 += 0.02) if (clears(a2)) { alpha = a2; break; } }
      }
      if (done) bump(ang, Math.min(alpha, 1.55), 1);
      else {
        // the tilt cannot clear it: spread the cloth there, allowing for how little of the bone a vertex that high has
        const wt = Math.max(0.2, THREE.MathUtils.smoothstep(-q.y, surf.from, surf.to));
        const h0 = prof.reduce((best, [hh, vv], i) => (i && (prof[i - 1][1] - q.y) * (vv - q.y) <= 0) ? hh : best, prof[0][0]);
        bump(ang, bestAlpha, Math.min(1.8, 1 + (rho / Math.max(0.05, h0) - 1) / wt));
      }
      void top;
    }
  }
  // a little give between neighbours so the hem curves instead of kinking at one bone
  const soft = need.map((v, k) => Math.max(v, 0.6 * need[(k + 1) % SKIRT_COUNT], 0.6 * need[(k + SKIRT_COUNT - 1) % SKIRT_COUNT]));
  for (let k = 0; k < SKIRT_COUNT; k++) {
    const a = skirtAngle(k), alpha = soft[k];
    _v.set(Math.sin(a) * Math.sin(alpha), -Math.cos(alpha), Math.cos(a) * Math.sin(alpha));
    _q.setFromUnitVectors(DOWN, _v);
    _e.setFromQuaternion(_q, 'XYZ');
    pose['skirt' + k] = [_e.x, _e.y, _e.z];
    if (scale) scale['skirt' + k] = spread[k];
  }
}

// ---------------------------------------------------------------- body options (CHIBI25_OPTIONS.body)
import { SHAPES, POSTURES } from './chibi25-body-options.js';
const num = (v, d) => Number.isFinite(+v) && v !== null && v !== '' ? +v : d;
const clamp01 = v => Math.min(1, Math.max(0, v));

/**
 * The race record a 2.5 body is built from: the race's own proportions with the body options folded in (shape,
 * shoulders, legs, height range, posture). A NEW object — the shared CHIBI2_RACES table is never written.
 */
export function race25(a, race) {
  const b = a?.body || {}, rb = race?.body || {};
  const shape = SHAPES[b.shape] || SHAPES.average, k = key => Number.isFinite(rb[key]) ? rb[key] : 1;
  const h = clamp01(num(b.height, 0.5));
  // a wider height range than v2: legs 0.7..1.3 of the v2 middle (v2: 0.8..1.2), the torso 0.9..1.1 (v2: 0.94..1.06)
  const legRange = (0.7 + h * 0.6) / (0.8 + h * 0.4), torsoRange = (0.9 + h * 0.2) / (0.94 + h * 0.12);
  const body = {
    ...rb,
    leg: k('leg') * (shape.leg || 1) * (0.85 + clamp01(num(b.legs, 0.5)) * 0.3) * legRange,
    torso: k('torso') * (shape.torso || 1) * torsoRange,
    width: k('width') * (shape.width || 1),
    shoulders: k('shoulders') * (shape.shoulders || 1) * (0.85 + clamp01(num(b.shoulders, 0.5)) * 0.3),
    arm: k('arm') * (shape.arm || 1),
    round: clamp01((Number.isFinite(rb.round) ? rb.round : 0) + (shape.round || 0)),
  };
  const pp = POSTURES[b.posture] || POSTURES.neutral, rp = race?.posture || { chest: 0, head: 0, knees: 0 };
  return { ...race, body, posture: { chest: (rp.chest || 0) + pp.chest, head: (rp.head || 0) + pp.head, knees: (rp.knees || 0) + pp.knees } };
}

/** After createRig: what the mesh builder reads that the rig itself does not carry (limb thickness). */
export function applyBody25(rig, a) {
  const b = a?.body || {}, shape = SHAPES[b.shape] || SHAPES.average;
  rig.armThick = (shape.armT || 1) * (0.8 + clamp01(num(b.arms, 0.5)) * 0.4);
  rig.legThick = shape.legT || 1;
  // an explicit roundness on the look still wins over the shape's (createRig read body.round first), so a shape
  // only moves roundness when the look leaves it unset — that is the race default plus the shape's offset
  if (!Number.isFinite(b.round) && shape.round) rig.round = clamp01(rig.round);
  return rig;
}
