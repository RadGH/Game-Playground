// Chibi 3 skin weights. No Three.js.
//
// Chibi 2 tied every piece rigidly to one bone, so a bent elbow was two tubes meeting at an angle.
// Chibi 3's skin is one continuous surface, so each vertex has to be shared between the bones on
// either side of a joint, or the surface would tear. The rule:
//
//   1. A vertex is OWNED by the bone of the nearest primitive (the deltoid belongs to the upper arm,
//      the pec to the chest). Garments ask the body which bone is underneath them.
//   2. Near the joint at either end of its owner, it is blended with the bone across that joint,
//      50/50 exactly at the joint and fading out over that joint's blend radius.
//
// Because both sides of a joint use the same formula, a vertex owned by the upper arm and one owned by
// the forearm agree on the weights where they meet, and the skin stays welded through any bend.

/** The child that continues each bone's line (the joint at its far end). */
export const CHAIN = {
  pelvis: 'spine', spine: 'chest', chest: 'neck', neck: 'head',
  clavL: 'upperArmL', upperArmL: 'foreArmL', foreArmL: 'handL',
  clavR: 'upperArmR', upperArmR: 'foreArmR', foreArmR: 'handR',
  thighL: 'shinL', shinL: 'footL', footL: 'toeL', thighR: 'shinR', shinR: 'footR', footR: 'toeR',
  ...Object.fromEntries(['L', 'R'].flatMap(s => ['thumb', 'index', 'middle', 'ring'].map(f => [f + '1' + s, f + '2' + s]))),
  hair1: 'hair2', hair2: 'hair3', hat1: 'hat2', beard1: 'beard2',
  capeL1: 'capeL2', capeL2: 'capeL3', capeR1: 'capeR2', capeR2: 'capeR3',
  skirtF1: 'skirtF2', skirtB1: 'skirtB2', skirtL1: 'skirtL2', skirtR1: 'skirtR2',
};

/** Blend radius (metres, for a 1.8 m body) at the joint where each bone STARTS. */
const JOINT_RADIUS = {
  spine: 0.09, chest: 0.09, neck: 0.05, head: 0.045,
  clavL: 0.05, clavR: 0.05, upperArmL: 0.065, upperArmR: 0.065, foreArmL: 0.05, foreArmR: 0.05, handL: 0.03, handR: 0.03,
  thighL: 0.075, thighR: 0.075, shinL: 0.055, shinR: 0.055, footL: 0.04, footR: 0.04, toeL: 0.025, toeR: 0.025,
};
const FINGER_RADIUS = 0.012, CHAIN_RADIUS = 0.08;

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function radiusAt(name, S = 1) {
  if (JOINT_RADIUS[name] != null) return JOINT_RADIUS[name] * S;
  if (/^(thumb|index|middle|ring)/.test(name)) return FINGER_RADIUS * S;
  return CHAIN_RADIUS * S;
}

/**
 * Weights for one vertex. `rig` is layoutRig()'s result; `owner` a bone name.
 * Returns up to four [boneIndex, weight] pairs summing to 1.
 */
export function jointWeights(rig, x, y, z, owner) {
  const B = rig.byName[owner];
  if (!B) return [[0, 1]];
  const S = rig.P.S, out = new Map([[B.name, 1]]);
  const h = B.pos, childName = CHAIN[B.name], C = childName ? rig.byName[childName] : null;
  // direction of the bone: toward its chain child, else away from its parent
  let dx, dy, dz, L;
  if (C) { dx = C.pos[0] - h[0]; dy = C.pos[1] - h[1]; dz = C.pos[2] - h[2]; }
  else { const Pp = rig.byName[B.parent]?.pos || [h[0], h[1] + 1, h[2]]; dx = h[0] - Pp[0]; dy = h[1] - Pp[1]; dz = h[2] - Pp[2]; }
  L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
  const along = (x - h[0]) * dx + (y - h[1]) * dy + (z - h[2]) * dz;
  // the joint at the start: blend with the parent
  if (B.parent && B.parent !== 'root' && B.name !== 'pelvis' && !B.name.startsWith('grip')) {
    const r = radiusAt(B.name, S), wParent = 1 - smooth(-r, r, along);
    if (wParent > 0.001) { out.set(B.parent, wParent); out.set(B.name, 1 - wParent); }
  }
  // the joint at the end: blend with the chain child
  if (C) {
    const r = radiusAt(C.name, S), wChild = smooth(-r, r, along - L);
    if (wChild > 0.001) {
      const own = out.get(B.name);
      out.set(C.name, wChild * own); out.set(B.name, own * (1 - wChild));
      // the parent keeps its share (a very short bone can be near both ends)
    }
  }
  return normalize([...out].map(([n, w]) => [rig.byName[n].index, w]));
}

/** Blend two weight lists (a skirt that is half leg, half skirt bone). */
export function mixWeights(a, b, t) {
  const m = new Map();
  for (const [i, w] of a) m.set(i, (m.get(i) || 0) + w * (1 - t));
  for (const [i, w] of b) m.set(i, (m.get(i) || 0) + w * t);
  return normalize([...m]);
}

export function normalize(list) {
  const top = list.filter(([, w]) => w > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
  return top.map(([i, w]) => [i, w / sum]);
}

/**
 * Weights along a spring chain (hair, cape, skirt panel): `t` 0 at the root of the chain to 1 at
 * its tip. Each bone takes the stretch nearest it, blended smoothly with its neighbours.
 */
export function chainWeights(rig, names, t, rootBone) {
  // Bone k owns the stretch below its own joint; neighbours blend across the middle of each stretch.
  // The very top edge stays partly on the anchor so the seam with the body never opens.
  const n = names.length, list = [];
  const f = Math.max(0, Math.min(1, t)) * n - 0.5;
  const i = Math.max(0, Math.min(n - 1, Math.floor(f))), u = Math.max(0, Math.min(1, f - i));
  const j = Math.min(n - 1, i + 1);
  list.push([rig.byName[names[i]].index, i === j ? 1 : 1 - u]);
  if (j !== i) list.push([rig.byName[names[j]].index, u]);
  const anchor = rootBone ? 1 - smooth(0, 0.12, t) : 0;
  if (anchor > 0) { for (const p of list) p[1] *= 1 - anchor; list.push([rig.byName[rootBone].index, anchor]); }
  return normalize(list);
}
