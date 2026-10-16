// Chibi 2.5 (part B) measuring kit: build a real Chibi 2 character, keep the pieces it was assembled from, play its
// baked clips through its own mixer and skin the vertices on the CPU — so a test can ask "where is every boot vertex
// relative to the robe's cloth on frame 14 of the run?" about the mesh that is actually drawn.
//
//   node --import ./avatar-3d/tests/three-register.mjs tools/chibi25-measure.mjs            # robe report, v2 vs 2.5
//   node --import ./avatar-3d/tests/three-register.mjs tools/chibi25-measure.mjs --json      # the same as JSON
//
//   import { buildMeasured, robeCheck } from '../../tools/chibi25-measure.mjs';
//
// THE ROBE CHECK (robeCheck). Every garment piece the body builder tags `garment:<cols>` is a grid of rows x cols
// (a lathe profile, a coat tail's open cylinder or a cape's sheet, all row-major, top row first). Each frame, in the
// hips bone's frame: for 72 directions round the body the cloth's rows are cut by a ray from the hip axis, giving the
// cloth's radius at each row's height in that direction. Every leg vertex (any vertex skinned mostly to a leg, knee or
// foot bone — thighs, shins, boots, feet, greaves) is then looked up in its own direction: if it is between the
// cloth's top and its hem there and further out than the cloth, it has POKED THROUGH. A vertex under the hem is fine
// (a foot showing under a robe is what a robe looks like); a vertex where no cloth is (a coat's open front, the sides
// of a loincloth, beside a cape) is fine. The report is the poke count and the smallest gap (m) per clip.
import { readFileSync } from 'node:fs';

const THREE = await import('three');
const { SkinBuilder } = await import('../avatar-3d/js/chibi2-geometry.js');
const { createChibi2Character } = await import('../avatar-3d/js/chibi2.js');
const { CHIBI2_CLIP_SECONDS, ONE_SHOTS } = await import('../avatar-3d/js/chibi2-motion.js');
const { ROBE_LOOKS } = await import('../avatar-3d/js/chibi25-outfits.js');
await import('../avatar-3d/js/chibi25-motion.js');

// ---------------------------------------------------------------- recording what the builder adds
let recording = null;
const origAdd = SkinBuilder.prototype.add;
SkinBuilder.prototype.add = function (geometry, boneName, color, options = {}) {
  origAdd.call(this, geometry, boneName, color, options);
  if (recording) recording.push({ geometry, bone: boneName, tag: options.tag || null, metal: !!options.metal });
};

/** Build `look` and keep its pieces. Each call builds a fresh template (a unique cache-busting field). */
export async function buildMeasured(look, opts = {}) {
  recording = [];
  const bust = { ...look, body: { ...(look.body || {}), _measure: Math.random() } };
  const trace = opts.trace ? [] : null;
  const actor = await createChibi2Character(bust, { ...opts, trace });
  const pieces = recording; recording = null;
  // a traced build: each piece learns its build stage (chibi2.js tags them in the same order it adds them)
  if (trace && trace.length === pieces.length) pieces.forEach((p, i) => { p.stage = trace[i].tag; });
  else if (trace) console.warn(`trace ${trace.length} vs pieces ${pieces.length}: stages unknown`);
  return { actor, pieces };
}

// ---------------------------------------------------------------- CPU skinning
const _v = new THREE.Vector3(), _acc = new THREE.Vector3(), _t = new THREE.Vector3();
function boneMatrices(skeleton) {
  return skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skeleton.boneInverses[i]));
}
/** Skinned positions of one piece (Float32Array xyz), into `into` space (a Matrix4, e.g. the hips' inverse). */
function skinPiece(piece, mats, into) {
  const g = piece.geometry, p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    _acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (!w) continue;
      _t.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mats[si.getComponent(i, k)]).multiplyScalar(w);
      _acc.add(_t);
    }
    if (into) _acc.applyMatrix4(into);
    out[i * 3] = _acc.x; out[i * 3 + 1] = _acc.y; out[i * 3 + 2] = _acc.z;
  }
  return out;
}

/** Leg vertex indices of a piece (dominant influence on a leg / knee / foot bone). */
function legMask(piece, legIdx) {
  const g = piece.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = [];
  for (let i = 0; i < si.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > bw) { bw = sw.getComponent(i, k); best = si.getComponent(i, k); }
    if (legIdx.has(best)) idx.push(i);
  }
  return idx;
}

// ---------------------------------------------------------------- the cloth model for one frame
const BINS = 72;
/** For each of BINS directions: the cloth's [y, r] at every row (null where the row has no cloth that way). */
function clothProfile(pos, cols) {
  const rows = Math.floor(pos.length / 3 / cols), prof = [];
  for (let b = 0; b < BINS; b++) {
    const ang = b / BINS * Math.PI * 2, dx = Math.sin(ang), dz = Math.cos(ang), curve = [];
    for (let r = 0; r < rows; r++) {
      let best = null;
      for (let c = 0; c < cols - 1; c++) {
        const i = (r * cols + c) * 3, j = i + 3;
        const ax = pos[i], az = pos[i + 2], bx = pos[j], bz = pos[j + 2];
        // ray (t*dx, t*dz) against segment a + s*(b - a)
        const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = (ax * ez - az * ex) / den, s = (ax * dz - az * dx) / den;
        if (t <= 0 || s < -1e-6 || s > 1 + 1e-6) continue;
        const y = pos[i + 1] + (pos[j + 1] - pos[i + 1]) * s;
        if (!best || t > best[1]) best = [y, t];
      }
      curve.push(best);
    }
    prof.push(curve);
  }
  return prof;
}
/** Is the point (hips space) through the cloth? -> { gap } (cloth radius minus the point's; < 0 = poked) or null (no cloth there / under the hem). */
function against(prof, x, y, z) {
  let ang = Math.atan2(x, z); if (ang < 0) ang += Math.PI * 2;
  const curve = prof[Math.round(ang / (Math.PI * 2) * BINS) % BINS];
  const rho = Math.hypot(x, z);
  let hit = null;
  for (let r = 0; r < curve.length - 1; r++) {
    const a = curve[r], b = curve[r + 1];
    if (!a || !b) continue;
    if ((a[0] - y) * (b[0] - y) > 0) continue;
    const t = (y - a[0]) / ((b[0] - a[0]) || 1e-9), rc = a[1] + (b[1] - a[1]) * t;
    const gap = rc - rho;
    if (!hit || gap < hit.gap) hit = { gap };
  }
  return hit;
}

/**
 * Play every clip in `clips` on the measured character and check every leg vertex against every tagged garment.
 * -> { [clip]: { frames, pokes, pokeFrames, minGap, worst: { frame, gap } } }
 */
export function robeCheck({ actor, pieces }, clips, { steps = 24 } = {}) {
  const skel = actor.skeleton, bones = skel.bones, byName = Object.fromEntries(bones.map((b, i) => [b.name, i]));
  const legIdx = new Set(['legL', 'kneeL', 'footL', 'legR', 'kneeR', 'footR'].map(n => byName[n]));
  const garments = pieces.filter(p => p.tag && p.tag.startsWith('garment:')).map(p => ({ piece: p, cols: +p.tag.split(':')[1] }));
  const legs = pieces.filter(p => !p.tag).map(p => ({ piece: p, idx: legMask(p, legIdx) })).filter(l => l.idx.length);
  const hips = bones[byName.hips], inv = new THREE.Matrix4();
  const out = {};
  for (const clip of clips) {
    actor.setAnim(clip, 0, true);
    const dur = CHIBI2_CLIP_SECONDS[clip] || 1, n = steps;
    const res = { frames: 0, pokes: 0, pokeFrames: 0, minGap: Infinity, worst: null };
    let last = 0;
    for (let f = 0; f < n; f++) {
      const t = f / n * dur * (ONE_SHOTS.has(clip) ? 0.98 : 1);
      actor.update(t - last); last = t;
      actor.group.updateMatrixWorld(true);
      inv.copy(hips.matrixWorld).invert();
      const mats = boneMatrices(skel);
      const profs = garments.map(g => clothProfile(skinPiece(g.piece, mats, inv), g.cols));
      let framePokes = 0;
      for (const l of legs) {
        const pos = skinPiece(l.piece, mats, inv);
        for (const i of l.idx) {
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          for (const prof of profs) {
            const h = against(prof, x, y, z);
            if (!h) continue;
            if (h.gap < res.minGap) { res.minGap = h.gap; res.worst = { frame: f, t: +t.toFixed(3), gap: +h.gap.toFixed(4), at: [x, y, z].map(v => +v.toFixed(3)), bone: bones[l.piece.geometry.attributes.skinIndex.getComponent(i, 0)].name }; }
            if (h.gap < 0) framePokes++;
          }
        }
      }
      res.frames++; res.pokes += framePokes; if (framePokes) res.pokeFrames++;
    }
    res.minGap = Number.isFinite(res.minGap) ? +res.minGap.toFixed(4) : null;
    out[clip] = res;
  }
  return out;
}

// ---------------------------------------------------------------- the clipping check (gear vs body)
/**
 * CLIP CHECK. The body is stood in for by solids that sit just INSIDE its skin (85% of the head, torso and hips,
 * 80% of each limb's radius), so a vertex of a held weapon, a shoulder piece, a cape or a pack that is inside one of
 * them is really through the body, not grazing it. Per clip: how many vertex-frames are inside, and the deepest (m).
 *   held      (anything on a grip bone)     vs head, torso, hips, both thighs and shins, the OTHER arm
 *                                             (two-handers, bows and crossbows: not the other forearm — that hand holds it)
 *   shoulder  (gear on an upper-arm bone)   vs head
 *   back      (gear on the chest: capes, quivers, packs, scabbards)  vs both upper arms and forearms
 *   belt      (gear on the hips: pouches, lanterns, tomes)           vs both forearms and hands
 *   plate     (metal on the chest from the body builder: breastplates, scales)  vs both upper arms
 * Needs a traced build (buildMeasured(look, { trace: true })) so each piece knows its build stage.
 */
const PAIRS = {
  held: s => ['head', 'torso', 'hips', 'thighL', 'thighR', 'shinL', 'shinR', 'upper' + (s === 'R' ? 'L' : 'R'), 'fore' + (s === 'R' ? 'L' : 'R')],
  shoulder: () => ['head'],
  back: () => ['upperL', 'upperR', 'foreL', 'foreR'],
  belt: () => ['foreL', 'foreR', 'handL', 'handR'],
  plate: () => ['upperL', 'upperR'],
};
function solids(actor) {
  const B = actor.parts, H = B.eyeL.position.y / 0.25, W = Math.abs(B.legR.position.x) / 0.115, T = B.chest.position.y / 0.15, LW = Math.pow(W, 0.65);
  const w = (bone, v) => new THREE.Vector3(...v).applyMatrix4(B[bone].matrixWorld);
  const pos = bone => new THREE.Vector3().setFromMatrixPosition(B[bone].matrixWorld);
  const ell = (bone, c, r) => ({ kind: 'ell', inv: new THREE.Matrix4().copy(B[bone].matrixWorld).invert(), c: new THREE.Vector3(...c), r: new THREE.Vector3(...r) });
  // a limb's capsule starts `skip` m down the bone from its joint: the top of an upper arm or a thigh is buried in the
  // shoulder / hip by design (the body's own mesh overlaps there), so only the limb proper counts
  const cap = (a, b, r, skip = 0) => { const A = pos(a), Bp = pos(b); return { kind: 'cap', a: A.clone().lerp(Bp, Math.min(0.5, skip / (A.distanceTo(Bp) || 1))), b: Bp, r }; };
  const out = {
    head: ell('head', [0, 0.3 * H, 0.02 * H], [0.29 * H * 0.85, 0.29 * H * 0.85, 0.26 * H * 0.85]),
    torso: ell('chest', [0, 0.07 * T, 0], [0.19 * W * 0.85, 0.21 * T * 0.85, 0.125 * W * 0.85]),
    hips: ell('hips', [0, -0.04, 0], [0.17 * W * 0.85, 0.09 * 0.85, 0.12 * W * 0.85]),
  };
  for (const s of ['L', 'R']) {
    out['upper' + s] = cap('arm' + s, 'elbow' + s, 0.075 * LW * 0.8, 0.06);
    out['fore' + s] = cap('elbow' + s, 'hand' + s, 0.06 * LW * 0.8);
    out['hand' + s] = { kind: 'cap', a: pos('hand' + s), b: w('hand' + s, [0, -0.06, 0.01]), r: 0.05 * 0.8 };
    out['thigh' + s] = cap('leg' + s, 'knee' + s, 0.09 * LW * 0.8, 0.06);
    out['shin' + s] = cap('knee' + s, 'foot' + s, 0.07 * LW * 0.8);
  }
  return out;
}
const _p = new THREE.Vector3(), _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
/** How deep (m, > 0 = inside) a point is in a solid. */
function depth(sol, x, y, z) {
  _p.set(x, y, z);
  if (sol.kind === 'cap') {
    _ab.subVectors(sol.b, sol.a); _ap.subVectors(_p, sol.a);
    const t = THREE.MathUtils.clamp(_ap.dot(_ab) / (_ab.lengthSq() || 1), 0, 1);
    return sol.r - _ap.sub(_ab.multiplyScalar(t)).length();
  }
  _p.applyMatrix4(sol.inv).sub(sol.c);
  const k = Math.hypot(_p.x / sol.r.x, _p.y / sol.r.y, _p.z / sol.r.z);
  return (1 - k) * Math.min(sol.r.x, sol.r.y, sol.r.z);
}
function dominant(piece, bones) {
  const si = piece.geometry.attributes.skinIndex, sw = piece.geometry.attributes.skinWeight;
  let best = 0, bw = -1;
  for (let k = 0; k < 4; k++) if (sw.getComponent(0, k) > bw) { bw = sw.getComponent(0, k); best = si.getComponent(0, k); }
  return bones[best].name;
}
export function classify(pieces, bones) {
  return pieces.map(p => {
    const stage = p.stage || 'body', bone = dominant(p, bones);
    if (stage === 'body' && p.metal && bone === 'chest') return { piece: p, kind: 'plate' };     // a breastplate, scales, mail bands
    if (!['gear', 'gear5', 'armour2'].includes(stage)) return null;
    if (bone === 'gripR' || bone === 'gripL') return { piece: p, kind: 'held', side: bone.slice(-1) };
    if (bone === 'armR' || bone === 'armL') return { piece: p, kind: 'shoulder', side: bone.slice(-1) };
    if (bone === 'chest' || bone.startsWith('skirt')) return { piece: p, kind: 'back' };
    if (bone === 'hips') return { piece: p, kind: 'belt' };
    return null;
  }).filter(Boolean);
}
export function clipCheck({ actor, pieces }, clips, { steps = 12 } = {}) {
  const skel = actor.skeleton, bones = skel.bones;
  const hold = actor.hold || {};
  const items = classify(pieces, bones);
  const out = {};
  for (const clip of clips) {
    actor.setAnim(clip, 0, true);
    const dur = CHIBI2_CLIP_SECONDS[clip] || 1;
    const res = {};
    let last = 0;
    for (let f = 0; f < steps; f++) {
      const t = f / steps * dur * (ONE_SHOTS.has(clip) ? 0.98 : 1);
      actor.update(t - last); last = t;
      actor.group.updateMatrixWorld(true);
      const mats = boneMatrices(skel), sol = solids(actor);
      for (const it of items) {
        let against = PAIRS[it.kind](it.side);
        if (it.kind === 'held' && (hold.twoHand || hold.dualTwo || hold.left === 'bow' || hold.right === 'crossbow' || hold.right === 'polearm' || hold.right === 'staff')) against = against.filter(n => !n.startsWith('fore'));
        const pos = skinPiece(it.piece, mats, null);
        for (const name of against) {
          const sd = sol[name]; let n = 0, deep = 0;
          for (let i = 0; i < pos.length; i += 3) { const d = depth(sd, pos[i], pos[i + 1], pos[i + 2]); if (d > 0.004) { n++; if (d > deep) deep = d; } }
          if (!n) continue;
          const key = `${it.kind}${it.side || ''}>${name}`;
          const r = res[key] || (res[key] = { n: 0, frames: 0, deep: 0, at: null, piece: null });
          r.n += n; r.frames++;
          if (deep > r.deep) {
            r.deep = +deep.toFixed(4); r.at = +(t / dur).toFixed(2);
            const g = it.piece.geometry; g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3());
            r.piece = { centre: c.toArray().map(v => +v.toFixed(2)), verts: g.attributes.position.count };
          }
        }
      }
    }
    out[clip] = res;
  }
  return out;
}

// ---------------------------------------------------------------- the report
export { ROBE_LOOKS };
export const ROBE_CLIPS = ['walk', 'run', 'jump', 'sprint', 'backpedal', 'strafeL', 'strafeR', 'ride', 'rideGallop', 'sit'];

const base = () => JSON.parse(readFileSync(new URL('../prototypes/emberveil/data/class-looks.json', import.meta.url))).classes.mage.avatar;
export function robeLook(id, { race = 'human', v25 = true, body = {} } = {}) {
  const b = base();
  return { ...b, hat: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' }, decor: { id: 'none' }, cape: { id: 'none' }, ...ROBE_LOOKS[id], body: { ...b.body, race, ...body, ...(v25 ? { v: 2.5 } : {}) } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { CHIBI2_ANIMS } = await import('../avatar-3d/js/chibi2-motion.js');
  let extra = [];
  try { extra = (await import('../avatar-3d/js/chibi25-motion.js')).CHIBI25_MOVE_ANIMS; } catch {}
  const { CHIBI2_MOUNT_ANIMS, CHIBI2_RIDE_ANIMS } = await import('../avatar-3d/js/chibi2-motion.js');
  const anims = [...new Set([...CHIBI2_ANIMS, ...extra, ...CHIBI2_MOUNT_ANIMS, ...CHIBI2_RIDE_ANIMS])];
  const clips = ROBE_CLIPS.filter(c => anims.includes(c));
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
  const races = process.argv.find(a => a.startsWith('--races='))?.slice(8).split(',') || ['human'];
  const rows = [];
  for (const id of Object.keys(ROBE_LOOKS)) {
    if (only && !only.includes(id)) continue;
    for (const race of races) for (const v25 of [false, true]) {
      const m = await buildMeasured(robeLook(id, { race, v25 }), { anims });
      const r = robeCheck(m, v25 ? clips : clips.filter(c => !extra.includes(c)));
      m.actor.dispose();
      rows.push({ id, race, v: v25 ? '2.5' : '2', r });
    }
  }
  if (process.argv.includes('--worst')) for (const row of rows) console.log(row.id, row.v, Object.entries(row.r).filter(([, x]) => x.pokes).map(([c, x]) => c + ' ' + JSON.stringify(x.worst)).join(' | '));
  else if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else for (const row of rows) console.log(`${row.id.padEnd(14)} ${row.race.padEnd(8)} v${row.v.padEnd(4)} ` + Object.entries(row.r).map(([c, x]) => `${c}:${x.pokes ? x.pokeFrames + '/' + x.frames + 'f' : 'ok'}(${x.minGap == null ? '-' : (x.minGap * 100).toFixed(1)}cm)`).join(' '));
}
