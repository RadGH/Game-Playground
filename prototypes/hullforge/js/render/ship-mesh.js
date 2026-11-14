// Builds the drawn hull of any block body: every visible cube face + the automatic corner pieces from
// sim/corners.js, in one BufferGeometry with vertex colours (paint × wear × damage) and atlas UVs. The same
// builder draws ships, wreck chunks, rocks and stations.

import * as THREE from 'three';
import { BLOCKS, PAINTS } from '../data/blocks.js';
import { DIRS, DIRV, faceAxes, hash } from '../core/math.js';
import { key, cellsOf, sizeOf } from '../sim/grid.js';
import { cornerPlan, PROFILES } from '../sim/corners.js';
import { TILE, tileUV, makeAtlases } from './atlas.js';

let atlases = null, hullMat = null, ghostMat = null;
const WHITE = new THREE.Color(1, 1, 1);

/** The one hull material (shared, so no shader rebuilds mid-game). Emission is tinted per vertex (`glowTint`). */
export function hullMaterial() {
  if (hullMat) return hullMat;
  atlases = makeAtlases();
  hullMat = new THREE.MeshStandardMaterial({ map: atlases.map, emissiveMap: atlases.glow, emissive: 0xffffff, emissiveIntensity: 1.6, vertexColors: true, metalness: 0.42, roughness: 0.52 });
  hullMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 glowTint;\nvarying vec3 vGlowTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowTint = glowTint;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlowTint;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlowTint;');
  };
  return hullMat;
}
export function ghostMaterial() {
  if (!ghostMat) ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.35, depthWrite: false });
  return ghostMat;
}

const paintCache = new Map();
function paintColor(i) { if (!paintCache.has(i)) paintCache.set(i, new THREE.Color(PAINTS[i]?.color || PAINTS[0].color)); return paintCache.get(i); }
const defCache = new Map();
function hexColor(h) { if (!defCache.has(h)) defCache.set(h, new THREE.Color(h)); return defCache.get(h); }

function tileFor(b) {
  const t = BLOCKS[b.t]?.big || b.t;   // a big block uses its small block's face, stretched over the panel
  if (TILE[t] != null) return TILE[t];
  const def = BLOCKS[t];
  if (def?.cat === 'turret') return TILE.turret;
  if (def?.ore) return TILE.ore;
  if (t === 'station_dock') return TILE.station_lit;
  return TILE.hull;
}
/** Base colour of a block (before wear and damage). */
function baseColor(b, out) {
  const def = BLOCKS[b.t];
  if (def.cat === 'structure') { out.copy(b.t === 'window' ? hexColor('#b9c3cc') : paintColor(b.p)); const base = def.big || b.t; if (base === 'armor') out.multiplyScalar(0.82); if (base === 'frame') out.lerp(hexColor('#9aa1a8'), 0.35); }
  else if (def.cat === 'rock' || def.cat === 'station') out.copy(hexColor(def.color || '#8a9098'));
  else out.copy(hexColor(def.color || '#8a9098')).lerp(paintColor(b.p), 0.18);
  return out;
}
function glowFor(b, out) {
  const def = BLOCKS[b.t];
  if (def.ore) return out.copy(hexColor(def.fleck)).multiplyScalar(0.9);
  if (b.t === 'station_dock') return out.copy(hexColor('#62f0a8'));
  if (b.t === 'station_lit') return out.copy(hexColor('#ffd38a'));
  return out.copy(WHITE);
}

/**
 * @param {{cells: Map}} g
 * @param {{ wreck?: boolean, plan?: Array }} [opts]
 */
export function buildHullGeometry(g, opts = {}) {
  const pos = [], nor = [], col = [], uv = [], glo = [];
  const c = new THREE.Color(), gc = new THREE.Color();
  const wreck = !!opts.wreck;
  const occ = (x, y, z) => g.occ.has(key(x, y, z));

  const shade = (b, out) => {
    baseColor(b, out);
    const h = hash(b.x, b.y, b.z) % 1000 / 1000; out.multiplyScalar(0.93 + h * 0.12);   // a little per-block variation
    const dmg = b.maxHp > 0 ? 1 - b.hp / b.maxHp : 0;
    if (dmg > 0.02) { out.multiplyScalar(1 - dmg * 0.55); out.lerp(hexColor('#3a2216'), dmg * 0.3); }
    if (wreck) out.multiplyScalar(0.42);
    return out;
  };
  const push = (p, n, cl, u, v, gl) => { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(cl.r, cl.g, cl.b); uv.push(u, v); glo.push(gl.r, gl.g, gl.b); };

  // --- cube faces
  for (const b of g.cells.values()) {
    const def = BLOCKS[b.t]; if (!def) continue;
    shade(b, c); glowFor(b, gc); if (wreck) gc.multiplyScalar(0.1);
    const [tu0, tv0, tu1, tv1] = tileUV(tileFor(b));
    const S = sizeOf(b);
    // a big block's faces are drawn cell by cell, each cell showing its share of one big panel
    for (const [ox, oy, oz] of cellsOf(b)) for (let d = 0; d < 6; d++) {
      const [dx, dy, dz] = DIRS[d];
      if (occ(ox + dx, oy + dy, oz + dz)) continue;
      const { n, u, v } = faceAxes(d);
      let u0 = tu0, v0 = tv0, u1 = tu1, v1 = tv1;
      if (S > 1) {
        const rx = ox - b.x, ry = oy - b.y, rz = oz - b.z;
        const a = (((rx * u.x + ry * u.y + rz * u.z) % S) + S) % S, bb = (((rx * v.x + ry * v.y + rz * v.z) % S) + S) % S;
        const du = (tu1 - tu0) / S, dv = (tv1 - tv0) / S;
        u0 = tu0 + du * a; u1 = u0 + du; v0 = tv0 + dv * bb; v1 = v0 + dv;
      }
      const cx = ox + 0.5 + n.x * 0.5, cy = oy + 0.5 + n.y * 0.5, cz = oz + 0.5 + n.z * 0.5;
      const P = (a, bb) => ({ x: cx + (u.x * a + v.x * bb) * 0.5, y: cy + (u.y * a + v.y * bb) * 0.5, z: cz + (u.z * a + v.z * bb) * 0.5 });
      const p00 = P(-1, -1), p10 = P(1, -1), p11 = P(1, 1), p01 = P(-1, 1);
      // turret / thruster blocks: their mount face is drawn darker (the model sits there)
      const cc = (def.cat === 'turret' || b.t === 'thruster') && d === b.r ? c.clone().multiplyScalar(0.55) : c;
      push(p00, n, cc, u0, v0, gc); push(p10, n, cc, u1, v0, gc); push(p11, n, cc, u1, v1, gc);
      push(p00, n, cc, u0, v0, gc); push(p11, n, cc, u1, v1, gc); push(p01, n, cc, u0, v1, gc);
    }
  }

  // --- corner pieces
  const plan = opts.plan || cornerPlan(g);
  const pieceAt = new Map();
  for (const p of plan) { const k = key(p.x, p.y, p.z); let L = pieceAt.get(k); if (!L) pieceAt.set(k, (L = [])); L.push(p); }
  const samePiece = (x, y, z, p) => (pieceAt.get(key(x, y, z)) || []).some(q => q.kind === p.kind && q.n === p.n && q.t === p.t);
  for (const p of plan) {
    const src = p.src;
    const rockish = BLOCKS[src.t]?.cat === 'rock';
    shade(src, c); gc.copy(WHITE).multiplyScalar(0); if (src.t === 'station_lit' || src.t === 'station_dock') gc.setRGB(0, 0, 0);
    const [u0, v0, u1, v1] = tileUV(rockish ? TILE.rock : BLOCKS[src.t]?.cat === 'station' ? TILE.station : TILE.slope);
    const n = DIRV[p.n], t = DIRV[p.t];
    const b = { x: n.y * t.z - n.z * t.y, y: n.z * t.x - n.x * t.z, z: n.x * t.y - n.y * t.x };
    // (s, h, w) → world, cell-centred
    const W = (s, h, w) => ({ x: p.x + 0.5 + t.x * (s - 0.5) + n.x * (h - 0.5) + b.x * (w - 0.5), y: p.y + 0.5 + t.y * (s - 0.5) + n.y * (h - 0.5) + b.y * (w - 0.5), z: p.z + 0.5 + t.z * (s - 0.5) + n.z * (h - 0.5) + b.z * (w - 0.5) });
    const prof = PROFILES[p.kind];
    // sloped top: the edge(s) of the profile that are neither the floor (h=0) nor the wall (s=0) nor the
    // inner seam between the two halves of a 1x2 piece (s=1 on piece a)
    for (let i = 0; i < prof.length; i++) {
      const A = prof[i], B = prof[(i + 1) % prof.length];
      if (A[1] === 0 && B[1] === 0) continue;                 // floor
      if (A[0] === 0 && B[0] === 0) continue;                 // wall
      if (p.kind === 'w12a' && A[0] === 1 && B[0] === 1) continue;   // seam with piece b
      // outward normal of this edge in (s,h): rotate the edge direction
      const es = B[0] - A[0], eh = B[1] - A[1]; const L = Math.hypot(es, eh);
      const ns = eh / L, nh = -es / L;
      const N = { x: t.x * ns + n.x * nh, y: t.y * ns + n.y * nh, z: t.z * ns + n.z * nh };
      quad(W(A[0], A[1], 0), W(B[0], B[1], 0), W(B[0], B[1], 1), W(A[0], A[1], 1), N, [u0, v0, u1, v1]);
    }
    // end caps (skip when the neighbour along the run is solid or carries the same piece)
    for (const side of [0, 1]) {
      const sx = side ? 1 : -1;
      const nx = p.x + b.x * sx, ny = p.y + b.y * sx, nz = p.z + b.z * sx;
      if (occ(nx, ny, nz) || samePiece(nx, ny, nz, p)) continue;
      const N = { x: b.x * sx, y: b.y * sx, z: b.z * sx };
      const pts = prof.map(([s, h]) => W(s, h, side));
      poly(pts, N, prof, [u0, v0, u1, v1]);
    }
  }

  function tri(a, b2, c2, N, ua, ub, uc) {
    // wind so the face looks along N
    const e1 = { x: b2.x - a.x, y: b2.y - a.y, z: b2.z - a.z }, e2 = { x: c2.x - a.x, y: c2.y - a.y, z: c2.z - a.z };
    const cr = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
    if (cr.x * N.x + cr.y * N.y + cr.z * N.z < 0) { push(a, N, c, ua[0], ua[1], gc); push(c2, N, c, uc[0], uc[1], gc); push(b2, N, c, ub[0], ub[1], gc); }
    else { push(a, N, c, ua[0], ua[1], gc); push(b2, N, c, ub[0], ub[1], gc); push(c2, N, c, uc[0], uc[1], gc); }
  }
  function quad(a, b2, c2, d, N, [u0, v0, u1, v1]) {
    tri(a, b2, c2, N, [u0, v0], [u1, v0], [u1, v1]); tri(a, c2, d, N, [u0, v0], [u1, v1], [u0, v1]);
  }
  function poly(pts, N, prof, [u0, v0, u1, v1]) {
    const uvOf = i => [u0 + (u1 - u0) * prof[i][0], v0 + (v1 - v0) * prof[i][1]];
    for (let i = 1; i < pts.length - 1; i++) tri(pts[0], pts[i], pts[i + 1], N, uvOf(0), uvOf(i), uvOf(i + 1));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('glowTint', new THREE.Float32BufferAttribute(glo, 3));
  geo.computeBoundingSphere();
  geo.userData.pieces = plan.length;
  return geo;
}
