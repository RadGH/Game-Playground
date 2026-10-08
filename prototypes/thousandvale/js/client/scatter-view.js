// Trees, bushes, rocks and reeds from a zone's baked scatter.bin (stream B: kind, scale, yaw, variant per
// item, world-aligned so nothing is doubled or lost at a zone edge, and already kept off roads, towns,
// water and vignettes). The server walks around the same solid ones (nav.bin), so a tree you see is a
// tree you bump into.
//
// A zone holds 5,000–20,000 items. They are sorted once into 128 m buckets; every half second (and only
// if the camera moved) the buckets near the camera refill the instance lists at the detail their
// distance deserves: full trees close, simplified trees further, crossed cards out to ~700 m, nothing
// past that (the far horizon takes over). The whole zone stays a few dozen draw calls.

import * as THREE from 'three';
import { buildTree, buildBush, buildFern } from '../../../../highdef-3d/js/kit/trees.js';
import { buildRock } from '../../../../highdef-3d/js/kit/rocks.js';
import { foliageMaterials, setWindTime } from './decor.js';
import { perf } from './perf.js';

const BUCKET = 128;
/** Scatter kinds the camera cannot pass (index = SCATTER_KINDS): radius and height at scale 1. */
const SCATTER_SOLID = { 6: { r: 1.2, h: 1.8 }, 7: { r: 2.1, h: 2.8 } };
/** scatter kind (terrain-read SCATTER_KINDS order) -> the kit pieces it may be drawn as. */
export const KIND_ART = [
  { key: 'tree_broadleaf', tree: ['oak', 'beech', 'birch'], scale: 0.62 },
  { key: 'tree_conifer', tree: ['pine', 'fir', 'spruce'], scale: 0.55 },
  { key: 'tree_acacia', tree: ['oak'], scale: 0.6, squash: [1.35, 0.62, 1.35] },
  { key: 'tree_dead', tree: ['dead_snag', 'dead_pine'], scale: 0.6 },
  { key: 'bush', bush: ['shrub', 'berry_bush', 'bramble', 'juniper'], scale: 1 },
  { key: 'rock_small', rock: ['stone', 'pebble'], scale: 0.9, size: 1 },
  { key: 'rock_large', rock: ['boulder', 'mossy_boulder'], scale: 1, size: 2 },
  { key: 'boulder', rock: ['boulder'], scale: 1.4, size: 3 },
  { key: 'reed', fern: ['reed', 'cattail'], scale: 1 },
  // play-test 2 (Q18, B's set pieces): orchard fruit trees — a young broadleaf, short and broad-crowned — and hedgerow
  // bushes, clipped wide and low
  { key: 'tree_fruit', tree: ['oak', 'beech'], scale: 0.3, squash: [1.4, 0.95, 1.4] },
  { key: 'hedge', bush: ['shrub'], scale: 1.15, squash: [1.5, 0.85, 1.5] },
];
/** How far each class of thing is drawn, by quality: [full detail, simplified, cards / last]. */
export const RANGES = { high: { tree: [80, 240, 700], small: 220, reed: 110 }, medium: { tree: [60, 200, 560], small: 170, reed: 90 }, low: { tree: [0, 90, 280], small: 70, reed: 40 } };

const GEO = new Map();
function geoFor(art, name, lod) {
  const k = `${art}|${name}|${lod}`;
  if (!GEO.has(k)) {
    let g = null;
    try {
      if (art === 'tree') { const b = buildTree(name, { seed: 1000 + name.length * 13, lod }); g = { bark: b.bark, leaf: b.foliage }; }
      else if (art === 'bush') { const b = buildBush(name, { seed: 60 + name.length, lod: 1 }); g = { bark: b.bark, leaf: b.foliage }; }
      else if (art === 'fern') { const b = buildFern(name, { seed: 70 + name.length, lod: 1 }); g = { bark: b.bark || null, leaf: b.foliage }; }
      else if (art === 'rock') { g = { rock: buildRock(name, { seed: 40 + name.length, lod: 1, size: 2 }).geometry }; }
    } catch (e) { console.warn('[scatter] kit piece failed', art, name, e.message); }
    GEO.set(k, g);
  }
  return GEO.get(k);
}

/**
 * Build every kit piece a zone might ask for, one per idle moment (P1): a forest of a species nobody had drawn yet
 * used to build its three tree LODs in the middle of a walk. Resolves when all are cached.
 */
export async function prewarmScatter({ quality = 'high' } = {}) {
  const todo = [];
  for (const art of KIND_ART) {
    const type = art.tree ? 'tree' : art.bush ? 'bush' : art.rock ? 'rock' : 'fern';
    for (const name of art[type]) for (const lod of (type === 'tree' ? (quality === 'low' ? [1, 2] : [0, 1, 2]) : [1])) todo.push([type, name, lod]);
  }
  // (play-test 7) rest when 12 ms of building have been done, not before every piece: on a renderer that draws a frame
  // every few seconds an idle callback comes once a frame, and sixty waits were five minutes of boot
  let at = performance.now();
  for (const [type, name, lod] of todo) {
    if (performance.now() - at > 12) { await new Promise(r => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30))); at = performance.now(); }
    perf.span('scatter:prewarm', () => geoFor(type, name, lod));
  }
  return todo.length;
}

/** Bucket items by 128 m cell. Pure — exported for tests. */
export function bucketScatter(sc, ox = 0, oz = 0) {
  const buckets = new Map();
  for (let i = 0; i < sc.count; i++) {
    const x = sc.x[i] + ox, z = sc.z[i] + oz;
    const k = Math.floor(x / BUCKET) + ',' + Math.floor(z / BUCKET);
    let b = buckets.get(k);
    if (!b) { b = { cx: (Math.floor(x / BUCKET) + 0.5) * BUCKET, cz: (Math.floor(z / BUCKET) + 0.5) * BUCKET, items: [] }; buckets.set(k, b); }
    b.items.push(i);
  }
  return [...buckets.values()];
}

export async function createScatterView(T, sc, { quality = 'high' } = {}) {
  const group = new THREE.Group(); group.name = 'scatter-' + (T.zoneKey || '');
  const mats = await foliageMaterials(quality === 'low');
  const R = RANGES[quality] || RANGES.high;
  const ox = T.ox || 0, oz = T.oz || 0;

  // per item: world position, ground height, the prototype it draws as
  const n = sc.count;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), S = new Float32Array(n), P = new Uint16Array(n);
  const protos = [];                 // { art, name, kindArt, lods: [{bark, leaf, rock}], cls }
  const protoIndex = new Map();
  const counts = [];
  for (let i = 0; i < n; i++) {
    const art = KIND_ART[sc.kind[i]]; if (!art) { P[i] = 65535; continue; }
    const type = art.tree ? 'tree' : art.bush ? 'bush' : art.rock ? 'rock' : 'fern';
    const list = art[type];
    const name = list[sc.variant[i] % list.length];
    const pk = sc.kind[i] + '|' + name;
    let pi = protoIndex.get(pk);
    if (pi === undefined) { pi = protos.length; protoIndex.set(pk, pi); protos.push({ type, name, art, cls: type === 'tree' ? 'tree' : type === 'fern' ? 'reed' : 'small' }); counts.push(0); }
    counts[pi]++;
    P[i] = pi;
    X[i] = sc.x[i] + ox; Z[i] = sc.z[i] + oz; Y[i] = T.heightAt(X[i], Z[i]);
    S[i] = Math.max(0.4, Math.min(1.6, sc.scale[i] * art.scale));
  }
  // meshes: trees get three levels, everything else one
  for (const [pi, p] of protos.entries()) {
    const levels = p.type === 'tree' ? [0, 1, 2] : [1];
    p.meshes = levels.map(lod => {
      const g = geoFor(p.type, p.name, lod);
      const parts = [];
      if (g) for (const [geo, mat] of [[g.bark, mats.bark], [g.leaf, mats.leaf], [g.rock, mats.rock]]) {
        if (!geo) continue;
        const cap = Math.min(counts[pi], p.type === 'tree' ? (lod === 0 ? 900 : lod === 1 ? 3000 : 12000) : 6000);
        const m = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
        m.count = 0; m.frustumCulled = false;
        m.castShadow = quality !== 'low' && (p.type !== 'tree' || lod < 2); m.receiveShadow = lod < 2;
        group.add(m); parts.push(m);
      }
      return parts;
    });
  }
  const buckets = bucketScatter(sc, ox, oz);
  // big rocks stop the camera (trees do not: a trunk in front of you every few steps would make it twitch)
  const solids = [];
  for (let i = 0; i < n; i++) { const k = SCATTER_SOLID[sc.kind[i]]; if (k) solids.push({ x: X[i], z: Z[i], r: k.r * S[i], bottom: Y[i] - 1, top: Y[i] + k.h * S[i] }); }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  let lastCam = null;
  const fill = protos.map(p => p.meshes.map(() => 0));
  function relod(cam) {
    for (const f of fill) f.fill(0);
    const far = R.tree[2];
    for (const b of buckets) {
      const d = Math.hypot(b.cx - cam.x, b.cz - cam.z) - BUCKET * 0.7;
      if (d > far) continue;
      for (const i of b.items) {
        const pi = P[i]; if (pi === 65535) continue;
        const p = protos[pi];
        const di = Math.hypot(X[i] - cam.x, Z[i] - cam.z);
        let lvl;
        if (p.type === 'tree') { if (di > far) continue; lvl = di < R.tree[0] ? 0 : di < R.tree[1] ? 1 : 2; }
        else { if (di > (p.cls === 'reed' ? R.reed : R.small)) continue; lvl = 0; }
        const parts = p.meshes[lvl]; if (!parts.length) continue;
        const k = fill[pi][lvl];
        if (k >= parts[0].instanceMatrix.count) continue;
        _q.setFromAxisAngle(_up, sc.yaw[i]);
        const sq = p.art.squash;
        _s.set(S[i] * (sq ? sq[0] : 1), S[i] * (sq ? sq[1] : 1), S[i] * (sq ? sq[2] : 1));
        _p.set(X[i], Y[i] - (p.type === 'rock' ? 0.25 * S[i] : 0.12), Z[i]);
        _m.compose(_p, _q, _s);
        for (const m of parts) m.setMatrixAt(k, _m);
        fill[pi][lvl] = k + 1;
      }
    }
    for (const [pi, p] of protos.entries()) p.meshes.forEach((parts, lvl) => { for (const m of parts) { m.count = fill[pi][lvl]; m.instanceMatrix.needsUpdate = true; } });
  }

  let t = 0, at = 0;
  return {
    group, solids,
    stats: { trees: protos.reduce((a, p, i) => a + (p.type === 'tree' ? counts[i] : 0), 0), items: n, buckets: buckets.length, protos: protos.length },
    update(dt, cam) {
      t += dt; setWindTime(t);
      if (!cam || t < at) return;
      at = t + 0.5;
      if (lastCam && Math.hypot(cam.x - lastCam.x, cam.z - lastCam.z) < 6) return;
      lastCam = { x: cam.x, z: cam.z };
      perf.span('scatter:relod', () => relod(cam));
    },
    /** Force a refill (the camera jumped). */
    refresh(cam) { lastCam = null; at = 0; if (cam) relod(cam); },
    drawnCounts: () => protos.map((p, i) => ({ name: p.name, n: fill[i].reduce((a, b) => a + b, 0) })),
    dispose() { for (const p of protos) for (const parts of p.meshes) for (const m of parts) m.dispose(); },
  };
}
