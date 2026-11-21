// The six chapter streets and their backdrops, built from low-poly pieces merged into a few meshes (kit.js Batch) in
// one toon material family. The road strip is z −2.6..2.6 (a curb each side), a low foreground lip in front, the
// chapter's buildings / trees / water behind, then mid and far layers that fade toward the sky colour (fog).
//
// Back scenery stays under ~5–6 m in the first rows so the sky band at the top of a 16:9 screen (≈ 5.7° above the
// horizon from the camera) still shows the SIGNATURE: the stone wyrm's spine on the horizon, nearer every chapter
// (Millbrook 170 m away … Crownhollow 30 m) and moving in chapters 5–6.
//
//   const th = await buildTheme('village', { length, chIndex, quality, chapter });
//   scene.add(th.group); th.env → sky, fog, lights; th.update(dt, t, camX, quakeT); th.dispose()
import * as THREE from 'three';
import { Batch, prim, mat, texMat, canvasTex, skyTex, rng, glowTex, mixHex } from './kit.js';
import { ACT_THEMES } from './themes-acts.js';

const breathe = () => new Promise(r => setTimeout(r, 0));
const ROAD_HALF = 2.9;

// ------------------------------------------------------------------------------------------------ road surfaces (256 px = 4 m)
function roadTex(kind, seed = 3) {
  const r = rng(seed);
  return canvasTex(256, 256, (g, W, H) => {
    const fill = (c) => { g.fillStyle = c; g.fillRect(0, 0, W, H); };
    if (kind === 'cobble') {
      fill('#5e5246');
      for (let row = 0; row < 12; row++) for (let i = 0; i < 9; i++) {
        const x = i * 30 + (row % 2) * 15 + (r() - 0.5) * 4, y = row * 22 + (r() - 0.5) * 3, w = 24 + r() * 6, h = 17 + r() * 3;
        const l = 38 + r() * 16; g.fillStyle = `hsl(${28 + r() * 14}, ${10 + r() * 10}%, ${l}%)`;
        g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(255,240,220,${0.08 + r() * 0.08})`; g.beginPath(); g.ellipse(x + w / 2 - 3, y + h / 2 - 3, w / 3, h / 4, 0, 0, Math.PI * 2); g.fill();
        if (i === 8) { g.beginPath(); g.ellipse(x + w / 2 - W, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); }
      }
    } else if (kind === 'dirt') {
      fill('#5a4630');
      for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? `rgba(30,20,10,${0.1 + r() * 0.15})` : `rgba(160,130,90,${0.06 + r() * 0.1})`; g.beginPath(); g.ellipse(r() * W, r() * H, 2 + r() * 8, 1 + r() * 4, r() * 3, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${20 + r() * 60}, 45%, ${22 + r() * 12}%)`; g.beginPath(); g.ellipse(r() * W, r() * H, 4, 2, r() * 3, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(40,28,16,0.55)'; g.lineWidth = 5;
      for (let i = 0; i < 3; i++) { g.beginPath(); let x = r() * W, y = 0; g.moveTo(x, y); while (y < H) { y += 20; x += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    } else if (kind === 'planks') {
      fill('#3a2a1e');
      for (let row = 0; row < 13; row++) {
        const y = row * 20, off = r() * 256;
        for (let k = -1; k < 2; k++) {
          const x = off + k * 256, l = 30 + r() * 10;
          g.fillStyle = `hsl(${24 + r() * 8}, ${28 + r() * 12}%, ${l}%)`; g.fillRect(x + 2, y + 1, 252, 18);
          g.fillStyle = 'rgba(0,0,0,0.12)'; for (let j = 0; j < 4; j++) g.fillRect(x + r() * 250, y + 4 + r() * 12, 30 + r() * 60, 1);
          g.fillStyle = '#2a2018'; g.fillRect(x + 8, y + 5, 3, 3); g.fillRect(x + 8, y + 13, 3, 3); g.fillRect(x + 244, y + 5, 3, 3); g.fillRect(x + 244, y + 13, 3, 3);
        }
      }
    } else if (kind === 'flag') {
      fill('#3e423e');
      for (let row = 0; row < 4; row++) { let x = (row % 2) * -30; while (x < W) { const w = 50 + r() * 40, l = 42 + r() * 12; g.fillStyle = `hsl(${150 + r() * 40}, ${4 + r() * 6}%, ${l}%)`; g.fillRect(x + 3, row * 64 + 3, w - 6, 58); g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x + 3 + r() * w * 0.5, row * 64 + 10 + r() * 30, 12 + r() * 16, 6 + r() * 10); x += w; } }
      for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(90,120,60,0.35)'; g.fillRect(r() * W, Math.floor(r() * 4) * 64, 8 + r() * 14, 3); }
    } else if (kind === 'scales') {
      fill('#3a4448');
      for (let row = 0; row < 11; row++) for (let i = -1; i < 9; i++) {
        const x = i * 32 + (row % 2) * 16, y = row * 24, l = 34 + r() * 14;
        g.fillStyle = `hsl(${180 + r() * 30}, ${10 + r() * 8}%, ${l}%)`; g.beginPath(); g.arc(x + 16, y, 17, 0, Math.PI); g.fill();
        g.strokeStyle = 'rgba(15,20,24,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(x + 16, y, 17, 0, Math.PI); g.stroke();
        g.fillStyle = 'rgba(220,240,255,0.08)'; g.beginPath(); g.arc(x + 12, y + 6, 6, 0, Math.PI * 2); g.fill();
      }
    } else if (kind === 'gold') {
      fill('#8a7a62');
      for (let row = 0; row < 6; row++) for (let i = 0; i < 5; i++) {
        const x = i * 56 + (row % 2) * 28, y = row * 46, l = 52 + r() * 12;
        g.fillStyle = `hsl(${36 + r() * 8}, ${18 + r() * 10}%, ${l}%)`;
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.lineTo(x + 28 + Math.cos(a) * 26, y + 23 + Math.sin(a) * 22); } g.closePath(); g.fill();
      }
      g.strokeStyle = 'rgba(240,190,60,0.7)'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) { g.beginPath(); let x = r() * W, y = 0; g.moveTo(x, y); while (y < H) { y += 16; x += (r() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }
    }
    // ---- Acts II/III surfaces (themes-acts.js)
    else if (kind === 'cracked' || kind === 'ash' || kind === 'mud' || kind === 'bronze') {
      const base = { cracked: '#4a4c56', ash: '#3a3432', mud: '#3e3a26', bronze: '#4a3a2c' }[kind];
      fill(base);
      if (kind === 'cracked' || kind === 'bronze') for (let row = 0; row < 12; row++) for (let i = 0; i < 9; i++) {
        const x = i * 30 + (row % 2) * 15, y = row * 22, l = (kind === 'bronze' ? 24 : 30) + r() * 12;
        g.fillStyle = kind === 'bronze' ? `hsl(${26 + r() * 10}, ${18 + r() * 10}%, ${l}%)` : `hsl(${220 + r() * 20}, ${6 + r() * 6}%, ${l}%)`;
        g.beginPath(); g.ellipse(x + 13, y + 10, 12, 8.5, 0, 0, Math.PI * 2); g.fill();
      }
      if (kind === 'ash') for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.08 ? `rgba(255,${120 + r() * 80},40,${0.5 + r() * 0.4})` : `rgba(${90 + r() * 60},${85 + r() * 50},${80 + r() * 40},${0.15 + r() * 0.2})`; g.beginPath(); g.ellipse(r() * W, r() * H, 1 + r() * 5, 1 + r() * 3, r() * 3, 0, Math.PI * 2); g.fill(); }
      if (kind === 'mud') for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? `rgba(20,24,10,${0.2 + r() * 0.2})` : `rgba(120,130,80,${0.08 + r() * 0.1})`; g.beginPath(); g.ellipse(r() * W, r() * H, 6 + r() * 20, 3 + r() * 8, r() * 3, 0, Math.PI * 2); g.fill(); }
      // cracks: dark, and for the root-split capital a cold blue glow down them
      g.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        g.strokeStyle = kind === 'cracked' && i === 1 ? 'rgba(110,190,255,0.45)' : kind === 'bronze' ? 'rgba(255,150,50,0.45)' : 'rgba(10,8,6,0.55)';
        g.beginPath(); let x = r() * W, y = 0; g.moveTo(x, y); while (y < H) { y += 14; x += (r() - 0.5) * 26; g.lineTo(x, y); } g.stroke();
      }
    } else if (kind === 'glass' || kind === 'void') {
      fill(kind === 'glass' ? '#24302a' : '#0c1a10');
      for (let row = 0; row < 8; row++) for (let i = 0; i < 8; i++) {
        const l = (kind === 'glass' ? 18 : 10) + r() * 10;
        g.fillStyle = `hsl(${128 + r() * 20}, ${30 + r() * 30}%, ${l}%)`; g.fillRect(i * 32 + 2, row * 32 + 2, 28, 28);
        if (r() < 0.25) { g.fillStyle = `rgba(160,255,170,${0.15 + r() * 0.25})`; g.fillRect(i * 32 + 4, row * 32 + 4, 10 + r() * 14, 2); }
      }
    } else if (kind === 'roots') {
      fill('#3a1e22');
      for (let i = 0; i < 60; i++) { g.strokeStyle = `hsl(${350 + r() * 20}, ${30 + r() * 20}%, ${14 + r() * 14}%)`; g.lineWidth = 3 + r() * 9; g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 80; y += (r() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,90,80,${0.08 + r() * 0.15})`; g.beginPath(); g.arc(r() * W, r() * H, 2 + r() * 6, 0, Math.PI * 2); g.fill(); }
    }
  }, { repeat: [1, 1] });
}

// ------------------------------------------------------------------------------------------------ helpers
/** Ground beyond the road (384 px = 6 m): speckles, blades or litter in the theme's colour. */
function groundTex(kind, base) {
  const r = rng(11), c = new THREE.Color(base);
  const hsl = {}; c.getHSL(hsl);
  const col = (dl, ds = 0, dh = 0) => `hsl(${(hsl.h * 360 + dh + 360) % 360}, ${Math.max(0, Math.min(100, hsl.s * 100 + ds))}%, ${Math.max(0, Math.min(100, hsl.l * 100 + dl))}%)`;
  const t = canvasTex(384, 384, (g, W, H) => {
    g.fillStyle = col(0); g.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) { g.fillStyle = col((r() - 0.5) * 7, (r() - 0.5) * 6); g.beginPath(); g.ellipse(r() * W, r() * H, 6 + r() * 22, 3 + r() * 10, r() * 3, 0, Math.PI * 2); g.fill(); }
    if (kind === 'grass') for (let i = 0; i < 900; i++) { const x = r() * W, y = r() * H; g.strokeStyle = col(3 + r() * 6, 3, (r() - 0.5) * 10); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6); g.stroke(); }
    if (kind === 'litter') for (let i = 0; i < 260; i++) { g.fillStyle = `hsl(${20 + r() * 40}, 40%, ${18 + r() * 16}%)`; g.beginPath(); g.ellipse(r() * W, r() * H, 3 + r() * 4, 1.5 + r() * 2, r() * 3, 0, Math.PI * 2); g.fill(); }
    if (kind === 'stone') for (let i = 0; i < 90; i++) { g.fillStyle = col(-8 - r() * 8); g.fillRect(r() * W, r() * H, 10 + r() * 30, 2); }
    if (kind === 'rock') for (let i = 0; i < 160; i++) { g.fillStyle = col((r() - 0.5) * 20); g.beginPath(); const x = r() * W, y = r() * H, s = 4 + r() * 12; g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s * 0.7); g.lineTo(x - s * 0.8, y); g.fill(); }
  }, { repeat: [1, 1] });
  return t;
}

function ctxFor({ length, quality, seed }) {
  const low = quality === 'low';
  return {
    low, L: length, x0: -30, x1: length + 40, rand: rng(seed),
    near: new Batch(32), far: new Batch(64), glow: new Batch(32), mist: new Batch(64),
    group: new THREE.Group(), updates: [], disposables: [], buildings: [], grounds: [],
  };
}
// Each helper adds one piece and returns its DRAWN box (Batch.last, after the transform) so buildings can record what
// was really drawn — the geometry test (tests/render-geometry.mjs) measures these, never the arguments (rule 22).
const box = (b, x, y, z, w, h, d, c, o = {}) => b.add(prim('box'), { x, y: y + h / 2, z, sx: w, sy: h, sz: d, ry: o.ry || 0, rz: o.rz || 0, rx: o.rx || 0 }, c, o).last;
const cyl = (b, x, y, z, r, h, c, seg = 8, o = {}) => b.add(prim('cyl', seg), { x, y: y + h / 2, z, sx: r, sy: h, sz: o.rz2 ?? r, rz: o.rz || 0, rx: o.rx || 0, ry: o.ry || 0 }, c, o).last;
const cone = (b, x, y, z, r, h, c, seg = 8, o = {}) => b.add(prim('cone', seg), { x, y: y + h / 2, z, sx: r, sy: h, sz: o.sz ?? r, rz: o.rz || 0, rx: o.rx || 0, ry: o.ry || 0 }, c, o).last;
const ball = (b, x, y, z, r, c, sx = 1, sy = 1, sz = 1, o = {}) => b.add(prim('ico', o.detail ?? 1), { x, y, z, sx: r * sx, sy: r * sy, sz: r * sz, ry: o.ry || 0 }, c, o).last;
/** A gable roof: ridge along the road (x) for `w` metres, eaves `d` deep (z), base at `y`, apex `h` above it. */
const roof = (b, x, y, z, w, h, d, c) => b.add(prim('prism'), { x, y, z, sx: w, sy: h, sz: d }, c).last;
/** Walls start this far under the ground, so no building ever shows a sliver of sky under it. */
const SINK = 0.15;
/** Record a building for the geometry test: its drawn walls and roof boxes. */
const building = (C, kind, wall, roofBox) => { C.buildings.push({ kind, wall: boxRec(wall), roof: roofBox ? boxRec(roofBox) : null }); };
const boxRec = b => ({ x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z });
/** A walkable / standable top surface (the road, the ground beyond it, a quay deck): the test grounds buildings on these. */
const surface = (C, x0, x1, z0, z1, y, kind) => { C.grounds.push({ x0, x1, z0, z1, y, kind }); };

function house(C, x, z, o) {
  const { near, glow, rand } = C;
  const w = o.w, d = o.d || 3.6, h = o.h, front = z + d / 2;
  const wall = box(near, x, -SINK, z, w, h + SINK, d, o.wall, { jitter: 0.06, rand });
  // timber frame on the front face
  if (o.timber) { const t = o.timber; box(near, x, h - 0.12, front + 0.02, w + 0.04, 0.16, 0.08, t); box(near, x, 1.2, front + 0.02, w + 0.04, 0.12, 0.08, t); for (let i = 0; i <= Math.round(w / 1.4); i++) box(near, x - w / 2 + i * (w / Math.round(w / 1.4)), 0, front + 0.02, 0.14, h, 0.08, t); }
  // the roof sits ON the wall top (its base = the wall's top) and overhangs every wall: 0.25 m at the gable ends, 0.35 m
  // at the eaves (owner #92/#101: roofs were turned 90 degrees — ridge across the house — so a wide house had a narrow roof)
  building(C, o.kind || 'house', wall, roof(near, x, h, z, w + 0.5, o.roofH || 1.8, d + 0.7, o.roof));
  if (o.chimney) box(near, x + w * 0.28, h + 0.6, z - 0.4, 0.5, 1.6, 0.5, o.chimney);
  // door + windows (the window panes glow: lamplight inside)
  const dx = x + (o.doorAt ?? -0.2) * w;
  box(near, dx, 0, front + 0.03, 0.9, 1.75, 0.08, o.door || '#4a3020');
  box(near, dx, 1.75, front + 0.035, 1.05, 0.12, 0.1, o.timber || '#3a2818');
  for (const wx of o.windows || [-0.32, 0.3]) {
    const px = x + wx * w; if (Math.abs(px - dx) < 0.9) continue;
    box(glow, px, 1.15, front + 0.04, 0.7, 0.7, 0.04, o.lit || '#ffc870');
    box(near, px, 1.07, front + 0.06, 0.86, 0.1, 0.12, o.timber || '#3a2818'); box(near, px, 1.5, front + 0.06, 0.08, 0.72, 0.08, o.timber || '#3a2818', {}); box(near, px, 1.15, front + 0.06, 0.74, 0.06, 0.08, o.timber || '#3a2818');
    if (o.flowers) { box(near, px, 0.9, front + 0.2, 0.8, 0.18, 0.25, '#6a4228'); for (let i = 0; i < 4; i++) ball(near, px - 0.3 + i * 0.2, 1.12, front + 0.22, 0.09, ['#e85a6a', '#f2d04a', '#f08ab0', '#ffffff'][i % 4]); }
  }
}
function roundTree(C, b, x, z, s, trunk, leaves) {
  const r = C.rand;
  cyl(b, x, 0, z, 0.18 * s, 2.2 * s, trunk, 6);
  for (let i = 0; i < 4; i++) ball(b, x + (r() - 0.5) * 1.3 * s, (2.4 + r() * 1.0) * s, z + (r() - 0.5) * 0.9 * s, (0.9 + r() * 0.4) * s, leaves[i % leaves.length], 1, 0.85, 1, { jitter: 0.08, rand: r });
}
function pine(C, b, x, z, s, trunk, leaf) {
  cyl(b, x, 0, z, 0.15 * s, 1 * s, trunk, 6);
  for (let i = 0; i < 3; i++) cone(b, x, (0.7 + i * 0.9) * s, z, (1.3 - i * 0.3) * s, 1.6 * s, leaf, 7, { jitter: 0.05, rand: C.rand });
}
function fence(C, b, x0, x1, z, c, h = 0.9) {
  for (let x = x0; x <= x1; x += 0.5) box(b, x, 0, z, 0.1, h + (Math.round(x * 2) % 2) * 0.05, 0.06, c);
  box(b, (x0 + x1) / 2, h * 0.3, z - 0.04, x1 - x0, 0.08, 0.04, c); box(b, (x0 + x1) / 2, h * 0.72, z - 0.04, x1 - x0, 0.08, 0.04, c);
}
function rock(C, b, x, y, z, s, c) { b.add(prim('dodeca'), { x, y: y + s * 0.4, z, sx: s * (1 + C.rand() * 0.5), sy: s * (0.6 + C.rand() * 0.4), sz: s, ry: C.rand() * 6 }, c, { jitter: 0.1, rand: C.rand }); }
/** A low rolling hill: kept under the horizon line so the wyrm's spine always shows above the far land. */
function hill(C, b, x, z, w, h, c) { const d = 15 - z, sy = Math.min(h, (3.8 + d * 0.004) / 0.7); b.add(prim('sphere', 10, 6), { x, y: -sy * 0.3, z, sx: w, sy, sz: w * 0.4 }, c, { jitter: 0.05, rand: C.rand }); }
function lampPost(C, x, z, light = '#ffc060', post = '#2a2420', h = 2.6) {
  cyl(C.near, x, 0, z, 0.07, h, post, 6); box(C.near, x + 0.22, h - 0.06, z, 0.5, 0.06, 0.06, post);
  box(C.near, x + 0.42, h - 0.55, z, 0.26, 0.4, 0.26, post); box(C.glow, x + 0.42, h - 0.5, z, 0.2, 0.3, 0.28, light); cone(C.near, x + 0.42, h - 0.18, z, 0.22, 0.2, post, 4);
  C.halos.push([x + 0.42, h - 0.35, z, light, 1.6]);
}
/** Curbs, verges and the ground under everything. */
function streetBase(C, o) {
  const { near, x0, x1 } = C;
  const W = x1 - x0;
  // the road (textured)
  const t = roadTex(o.road, 7); t.repeat.set(W / 4, (ROAD_HALF * 2) / 4);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(W, ROAD_HALF * 2).rotateX(-Math.PI / 2), texMat(t));
  road.position.set((x0 + x1) / 2, 0, 0); road.receiveShadow = true; C.group.add(road); C.disposables.push(road.geometry, t);
  surface(C, x0, x1, -ROAD_HALF, ROAD_HALF, 0, 'road');
  // ground beyond
  // ground planes, cut around `o.gap` ([xa, xb]: a river crossing)
  const ground = (z0, z1, c, y = -0.02) => {
    const spans = o.gap ? [[x0 - 300, o.gap[0]], [o.gap[1], x1 + 300]] : [[x0 - 300, x1 + 300]];
    const tex = groundTex(o.ground || 'grass', c);
    C.disposables.push(tex);
    for (const [a, b] of spans) {
      const t = tex.clone(); t.repeat.set((b - a) / 6, (z1 - z0) / 6); t.needsUpdate = true; C.disposables.push(t);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(b - a, z1 - z0).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: t, gradientMap: mat('batch').gradientMap }));
      g.position.set((a + b) / 2, y, (z0 + z1) / 2); g.receiveShadow = true; C.group.add(g); C.disposables.push(g.geometry, g.material);
      surface(C, a, b, z0, z1, y, 'ground');
    }
  };
  if (o.backGround) ground(-400, -ROAD_HALF, o.backGround);
  if (o.frontGround) ground(ROAD_HALF, 40, o.frontGround);
  // curbs
  if (o.curb) for (let x = x0; x < x1; x += 0.62) {
    box(near, x, 0, -ROAD_HALF - 0.12, 0.58, 0.14, 0.26, o.curb, { jitter: 0.12, rand: C.rand });
    if (o.frontCurb !== false) box(near, x + 0.3, 0, ROAD_HALF + 0.12, 0.58, 0.12, 0.26, o.curb, { jitter: 0.12, rand: C.rand });
  }
}
/** Repeat along the road at ~`step` metres; low quality spaces decoration out (fewer props, fewer draw-time triangles). */
function scatter(C, x0, x1, step, f) {
  const k = C.low ? 1.6 : 1;
  for (let x = x0; x < x1; x += step * k * (0.6 + C.rand() * 0.8)) if (!C.gap || x < C.gap[0] - 2 || x > C.gap[1] + 2) f(x);   // nothing stands in the river (rule 25)
}

/**
 * The SIGNATURE: the stone wyrm's spine along the horizon — one long, continuous stone back (a half-tube whose height
 * swells and dips slowly) crowned with a regular row of dorsal plates, big-small-small like a sleeping beast.
 * `elev` = how many degrees above the horizon its plates reach from the camera; `moving` (0..1) makes it heave.
 */
function wyrmSpine(C, { z, elev, color, plate, fade, fog, moving = 0, plateK = 1 }) {
  const d = 15 - z, top = 4.6 + d * Math.tan(elev * Math.PI / 180);
  const halfVis = (d / 15) * 13, from = -halfVis - 20, to = C.L + halfVis + 30;
  const bodyH = top * (d < 70 ? 0.5 : 0.7), width = Math.max(6, d * 0.12);
  const prof = x => bodyH * (0.8 + 0.16 * Math.sin(x * 0.021) + 0.1 * Math.sin(x * 0.057 + 1.3));
  // body: a half-tube along x
  const segX = Math.max(1.5, d * 0.02), nx = Math.ceil((to - from) / segX) + 1, nr = 9;
  const pos = new Float32Array(nx * nr * 3), idx = [];
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < nr - 1; j++) { const a = i * nr + j, b = a + nr; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const uv = new Float32Array(nx * nr * 2), tile = Math.max(3, d * 0.06);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nr; j++) { uv[(i * nr + j) * 2] = (i * segX) / tile; uv[(i * nr + j) * 2 + 1] = (j / (nr - 1)) * (Math.PI * width) / tile; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const ring = [];
  for (let j = 0; j < nr; j++) { const th = Math.PI * j / (nr - 1); ring.push([Math.cos(th), Math.sin(th)]); }
  function shape(t) {
    for (let i = 0; i < nx; i++) {
      const x = from + i * segX, heave = moving ? Math.sin(x * 0.045 - t * 0.55) * bodyH * 0.1 * moving : 0, h = prof(x) + heave;
      for (let j = 0; j < nr; j++) { const k = (i * nr + j) * 3; pos[k] = x; pos[k + 1] = ring[j][1] * h - bodyH * 0.08; pos[k + 2] = z + ring[j][0] * width; }
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  }
  shape(0); geo.computeBoundingSphere();
  const gm = mat('batch').gradientMap;
  // near (chapters 5–6) the body shows its scales; far away it is a clean silhouette faded toward the sky
  const near = d < 70, scales = near ? roadTex('scales', 5) : null;
  const bodyMat = new THREE.MeshToonMaterial({ map: scales, color: new THREE.Color(mixHex(color, fog, fade)).multiplyScalar(near ? 2.4 : 1), gradientMap: gm, fog: false });
  if (scales) C.disposables.push(scales);
  const body = new THREE.Mesh(geo, bodyMat); body.frustumCulled = false;
  // plates
  const step = Math.max(3, d * 0.055), n = Math.ceil((to - from) / step);
  const plates = new THREE.InstancedMesh(prim('cone', 4), new THREE.MeshToonMaterial({ color: new THREE.Color(mixHex(plate, fog, fade)), gradientMap: gm, fog: false }), n);
  plates.frustumCulled = false;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const pk = i => [1, 0.62, 0.74][i % 3] * plateK;
  function place(t) {
    for (let i = 0; i < n; i++) {
      const x = from + i * step + step / 2, heave = moving ? Math.sin(x * 0.045 - t * 0.55) * bodyH * 0.1 * moving : 0;
      const h0 = prof(x) * 0.86 + heave, ph = Math.max(top * 0.25, top - bodyH * 0.8) * pk(i);
      E.set(0, 0, -0.18 + (moving ? Math.sin(x * 0.05 - t * 0.55 + 1) * 0.07 * moving : 0)); Q.setFromEuler(E);
      P.set(x, h0 + ph * 0.42, z); S.set(step * 0.3, ph, step * 0.07); M.compose(P, Q, S); plates.setMatrixAt(i, M);
    }
    plates.instanceMatrix.needsUpdate = true;
  }
  place(0);
  C.group.add(body, plates);
  C.disposables.push(geo, bodyMat, plates.material);
  if (moving) C.updates.push((dt, t) => { shape(t); place(t); });
  return { top, z };
}
/** Soft glows (lantern halos, windows) as additive sprites. */
function addHalos(C) {
  if (!C.halos.length) return;
  const m = new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: true });
  for (const [x, y, z, c, s] of C.halos) { const sp = new THREE.Sprite(m.clone()); sp.material.color.set(c); sp.position.set(x, y, z); sp.scale.setScalar(s); C.group.add(sp); C.disposables.push(sp.material); }
  C.disposables.push(m);
}
function clouds(C, color, n = 10, yMin = 22, yMax = 55) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), fog: false, transparent: true, opacity: 0.55, depthWrite: false });
  C.disposables.push(m);
  for (let i = 0; i < n; i++) {
    const x = C.x0 - 80 + C.rand() * (C.x1 - C.x0 + 160), y = yMin + C.rand() * (yMax - yMin), z = -230 - C.rand() * 60;
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(prim('sphere', 10, 6), m); s.scale.set(14 + C.rand() * 12, 4 + C.rand() * 3, 4); s.position.set((k - 1.5) * 12 + C.rand() * 6, C.rand() * 3, 0); g.add(s); }
    g.position.set(x, y, z); C.group.add(g);
    const sp = 0.4 + C.rand() * 0.6; C.updates.push(dt => { g.position.x += dt * sp; });
  }
}

// ------------------------------------------------------------------------------------------------ 1 · Millbrook (village at dawn)
function village(C) {
  const { near, far, glow, rand, L } = C;
  const bx = L - 14, bw = 9;          // the mill bridge: the river crosses under the road here
  streetBase(C, { road: 'cobble', curb: '#8a7e70', backGround: '#6a8a4a', frontGround: '#6a9048', ground: 'grass', gap: [bx - bw / 2 + 0.45, bx + bw / 2 - 0.45] });
  C.gap = [bx - bw / 2, bx + bw / 2];
  const walls = ['#e8dcc0', '#d8c8a4', '#eadfcf', '#cfc0a0', '#e2d2b8'], roofs = ['#8a4a32', '#6a4a3a', '#a85a3a', '#7a5a3a', '#5a4a3e'];
  // the square at the start: bell tower with an EMPTY bell frame, and the bell-stone plinth with nothing on it
  const tx = 3, tz = -9;
  const towerWall = box(near, tx, -SINK, tz, 3.2, 9.5 + SINK, 3.2, '#a8a090', { jitter: 0.04, rand });
  for (let y = 0.9; y < 9.4; y += 0.9) box(near, tx, y, tz + 1.61, 3.24, 0.06, 0.04, '#8a8274');
  for (let y = 0; y < 9.4; y += 0.6) for (const sx of [-1, 1]) box(near, tx + sx * 1.55, y, tz + 1.62, 0.32, 0.5, 0.06, (y * 10) % 12 < 6 ? '#bab2a2' : '#9a9282');
  near.add(prim('arch'), { x: tx, y: 0, z: tz + 1.62, sx: 1.6, sy: 2.4, sz: 0.4 }, '#8a8274');
  box(near, tx, 0, tz + 1.55, 1.08, 1.5, 0.06, '#4a3424'); cone(near, tx, 1.5, tz + 1.55, 0.54, 0.4, '#4a3424', 8, { sz: 0.03 });
  for (const y of [4.2, 6.2]) box(glow, tx, y, tz + 1.63, 0.18, 0.8, 0.04, '#ffc068');
  box(near, tx, 9.5, tz, 3.5, 0.3, 3.5, '#8a8274');
  for (const [ox, oz] of [[-1.45, -1.45], [1.45, -1.45], [-1.45, 1.45], [1.45, 1.45]]) box(near, tx + ox, 9.8, tz + oz, 0.4, 2.4, 0.4, '#a8a090');
  const belfryCap = box(near, tx, 12.2, tz, 3.6, 0.3, 3.6, '#8a8274');
  building(C, 'bell tower', towerWall.union(belfryCap), cone(near, tx, 12.5, tz, 2.85, 3.4, '#6a4a3a', 4, { ry: Math.PI / 4 }));   // the spire: on the belfry cap (12.5), its eaves 0.2 m past it on every side
  box(near, tx, 11.6, tz, 2.4, 0.12, 0.14, '#4a3828');     // the beam the bell hung from — empty
  box(glow, tx, 6.2, tz + 1.62, 0.9, 1.4, 0.04, '#3a2a20'); box(near, tx, 3.0, tz + 1.62, 1.2, 0.2, 0.1, '#7a7264');
  // the plinth
  const px = 10, pz = -3.9;
  box(near, px, 0, pz, 1.6, 0.25, 1.2, '#8a8274'); box(near, px, 0.25, pz, 1.2, 0.9, 0.9, '#b0a898'); box(near, px, 1.15, pz, 1.4, 0.16, 1.05, '#8a8274');
  box(near, px, 1.31, pz, 0.7, 0.05, 0.5, '#2a2420');      // the empty socket where the stone sat
  for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) b2(near, px + s * 0.5, 0.95 - i * 0.18, pz + 0.47, '#4a4a50'); }
  function b2(b, x, y, z, c) { b.add(prim('torus', 0.25, 8), { x, y, z, s: 0.08, rx: (y * 10) % 2 ? Math.PI / 2 : 0 }, c); }
  // a well in the square
  cyl(near, 16, 0, -4.4, 0.75, 0.8, '#9a9080', 10); cyl(near, 16, 0.8, -4.4, 0.6, 0.05, '#2a3a4a', 10);
  box(near, 15.3, 0.8, -4.4, 0.12, 1.6, 0.12, '#5a3a22'); box(near, 16.7, 0.8, -4.4, 0.12, 1.6, 0.12, '#5a3a22'); roof(near, 16, 2.35, -4.4, 1.9, 0.6, 1.2, '#7a4a32');

  // cottages, fences and gardens along the back
  let x = 21, i = 0;
  while (x < L - 34) {
    const w = 4.2 + rand() * 2.2, h = 2.4 + rand() * 0.6;
    house(C, x + w / 2, -6.6 - rand() * 0.8, { w, h, wall: walls[i % 5], roof: roofs[i % 5], roofH: 1.5 + rand() * 0.6, timber: rand() < 0.6 ? '#4a3424' : null, chimney: rand() < 0.6 ? '#7a6a5a' : null, flowers: rand() < 0.5, lit: '#ffc068' });
    fence(C, near, x - 0.2, x + w + 0.2, -3.75, '#e8e0d0', 0.8);
    const gap = 2.5 + rand() * 4.5;
    if (rand() < 0.65) roundTree(C, near, x + w + gap / 2, -6.5 - rand() * 2, 1 + rand() * 0.3, '#5a3a22', ['#5a8a3a', '#6a9a42', '#4a7a32']);
    else { // a haystack and a cart
      ball(near, x + w + gap / 2, 0.6, -5.2, 0.9, '#d8b860', 1, 0.8, 1); box(near, x + w + gap / 2 + 1.4, 0.4, -4.6, 1.6, 0.5, 0.9, '#7a5030'); cyl(near, x + w + gap / 2 + 0.8, 0.35, -4.15, 0.35, 0.06, '#4a3020', 10, { rx: Math.PI / 2 });
    }
    if (rand() < 0.5) { cyl(near, x + w + 0.6, 0, -4.3, 0.3, 0.7, '#7a5030', 8); }
    x += w + gap; i++;
  }
  scatter(C, 20, L - 20, 22, x => lampPost(C, x, -3.5, '#ffc060'));

  // the mill + the river that crosses the road at the end (the mill bridge)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(bw - 1.4, 200).rotateX(-Math.PI / 2), mat('water', { vertexColors: false, color: new THREE.Color('#5a7a9a') }));
  water.position.set(bx, -0.5, -60); C.group.add(water); C.disposables.push(water.geometry);
  const water2 = water.clone(); water2.position.z = 0; water2.scale.z = 0.3; water2.position.z = 30; C.group.add(water2);
  for (const s of [-1, 1]) {
    box(near, bx + s * (bw / 2), -1.2, -20, 0.9, 1.25, 40, '#7a7264');                           // river banks (stone)
    box(near, bx + s * (bw / 2), -1.2, 20, 0.9, 1.25, 30, '#7a7264');
  }
  // cut the green ground away over the river with a dark channel
  box(near, bx, -1.8, -40, bw - 1.2, 1.1, 75, '#2a3a48'); box(near, bx, -1.8, 22, bw - 1.2, 1.1, 36, '#2a3a48');   // river bed, under the water
  // parapets of the bridge (front one low so it never hides a fighter's feet)
  for (let k = 0; k < 9; k++) { box(near, bx - bw / 2 + 0.5 + k * (bw - 1) / 8, 0, -ROAD_HALF - 0.45, (bw - 1) / 8 - 0.06, 0.95, 0.5, '#a8a090', { jitter: 0.06, rand }); box(near, bx - bw / 2 + 0.5 + k * (bw - 1) / 8, 0, ROAD_HALF + 0.42, (bw - 1) / 8 - 0.06, 0.45, 0.45, '#a8a090', { jitter: 0.06, rand }); }
  // mill house upstream with a turning wheel
  const mx = bx - 9, mz = -9;
  house(C, mx, mz, { w: 6, d: 4.5, h: 3.4, wall: '#c8b89a', roof: '#6a4a3a', roofH: 2.2, timber: '#4a3424', chimney: '#6a5a4a', lit: '#ffc068' });
  const wheel = new THREE.Group(); wheel.position.set(mx + 3.6, 1.6, mz + 0.4);
  const wm = mat('batch'); const wb = new Batch(64);
  wb.add(prim('torus', 0.08, 18), { s: 1.75, ry: Math.PI / 2 }, '#5a3a22'); wb.add(prim('torus', 0.08, 18), { s: 1.75, ry: Math.PI / 2, x: 0.35 }, '#5a3a22');
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; wb.add(prim('box'), { y: Math.sin(a) * 0.9, z: Math.cos(a) * 0.9, x: 0.18, sx: 0.06, sy: 1.75, sz: 0.1, rx: -a }, '#6a4a2a'); wb.add(prim('box'), { y: Math.sin(a) * 1.75, z: Math.cos(a) * 1.75, x: 0.18, sx: 0.5, sy: 0.5, sz: 0.08, rx: -a }, '#7a5a3a'); }
  const wheelMesh = wb.build(wm); wheel.add(wheelMesh); wheel.rotation.y = Math.PI / 2; C.group.add(wheel);
  C.updates.push(dt => { wheelMesh.rotation.x -= dt * 0.8; });

  // beyond the gardens: crop fields, hedges, trees, hills
  for (let k = 0; k < 14; k++) {
    const fx = C.x0 + k * ((C.x1 - C.x0) / 14), fw = (C.x1 - C.x0) / 14 - 1.2, fz = -26 - (k % 3) * 6;
    if (fx + fw / 2 > C.gap[0] - 1 && fx - fw / 2 < C.gap[1] + 1) continue;     // the river runs through here
    const cols = [['#7a944a', '#86a052'], ['#b8a452', '#c4b060'], ['#62843e', '#6e9046']][k % 3];
    for (let r = 0; r < 6; r++) box(far, fx, -0.05, fz + r * 1.5, fw, 0.12, 0.9, cols[r % 2]);
    for (let hx = fx - fw / 2; hx < fx + fw / 2; hx += 1.3) ball(far, hx, 0.35, fz + 9.2, 0.75, '#4a6a30', 1.1, 0.8, 0.8);
  }
  scatter(C, C.x0, C.x1, 14, x => roundTree(C, far, x, -18 - rand() * 30, 1.2 + rand() * 0.6, '#4a3020', ['#4a7a3a', '#5a8a3a']));
  scatter(C, C.x0 - 60, C.x1 + 60, 26, x => hill(C, far, x, -80 - rand() * 50, 30 + rand() * 25, 9 + rand() * 9, rand() < 0.5 ? '#6a8a62' : '#7a9a6a'));
  // foreground: verge flowers, posts, a few low stones (all under 0.6 m)
  scatter(C, C.x0, C.x1, 3, x => { const z = 3.4 + rand() * 1.6; if (rand() < 0.5) ball(near, x, 0.15, z, 0.18, ['#e8e05a', '#ffffff', '#e86a8a'][Math.floor(rand() * 3)], 1, 0.6, 1); else box(near, x, 0, z, 0.08, 0.45, 0.08, '#e8e0d0'); });
  scatter(C, C.x0, C.x1, 7, x => rock(C, near, x, 0, 4.6 + rand() * 2, 0.35, '#8a8a7a'));
  C.ridge = { z: -170, elev: 2.6, color: '#6a7488', plate: '#7a8498', fade: 0.4, moving: 0 };
  C.env = {
    sky: skyTex([[0, '#3a5a9a'], [0.45, '#9aa8d0'], [0.75, '#f2b890'], [1, '#ffd8a8']]),
    fog: ['#e8c0a0', 40, 260], hemi: ['#c8d4ff', '#8a6a4a', 1.05], sun: ['#ffc890', 2.6], sunDir: [-0.55, 0.45, 0.7], lamp: ['#ffb060', 4], exposure: 1.05,
  };
  clouds(C, '#ffd8c8', 10);
}

// ------------------------------------------------------------------------------------------------ 2 · Thornwood (forest at green dusk)
function forest(C) {
  const { near, far, glow, rand, L } = C;
  streetBase(C, { road: 'dirt', curb: '#4a5a3a', backGround: '#3a4a2a', frontGround: '#4a6038', ground: 'litter' });
  const bark = ['#3a2e24', '#4a3a2a', '#32281e'];
  // giant trunks behind the path, their tops above the screen; roots flare onto the ground
  scatter(C, C.x0, C.x1, 7.5, x => {
    const z = -6 - rand() * 9, r = 0.8 + rand() * 0.9, c = bark[Math.floor(rand() * 3)];
    cyl(near, x, 0, z, r, 34, c, 9, { jitter: 0.08, rand });
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + rand(); near.add(prim('sphere', 6, 4), { x: x + Math.cos(a) * r * 1.05, y: 0.05, z: z + Math.sin(a) * r * 1.05, sx: r * 0.75, sy: 0.35, sz: r * 0.3, ry: -a }, c); }
    ball(near, x + r * 0.6, 2 + rand() * 4, z + r * 0.7, r * 0.35, '#4a6a2a', 1, 1.4, 0.4);    // moss
    if (rand() < 0.4) { box(glow, x + (rand() - 0.5) * r, 0.3, z + r + 0.05, 0.12, 0.18, 0.12, '#9af0c0'); ball(glow, x + (rand() - 0.5) * r, 0.5, z + r + 0.1, 0.16, '#7ae8d0', 1, 0.5, 1); C.halos.push([x, 0.6, z + r + 0.3, '#7ae8d0', 1.2]); }
  });
  // canopy blobs high up (they darken the top of the screen)
  scatter(C, C.x0, C.x1, 5, x => ball(near, x, 9 + rand() * 4, -6 - rand() * 12, 3.5 + rand() * 2, rand() < 0.5 ? '#2a4a2a' : '#22402a', 1.4, 0.7, 1, { jitter: 0.1, rand }));
  // undergrowth: ferns, bushes, briars along the back curb
  scatter(C, C.x0, C.x1, 1.6, x => {
    const z = -3.5 - rand() * 2;
    if (rand() < 0.45) { for (let k = 0; k < 5; k++) cone(near, x + (rand() - 0.5) * 0.6, 0, z, 0.08, 0.9 + rand() * 0.4, '#4a7a3a', 3, { rz: (k - 2) * 0.35 }); }
    else if (rand() < 0.6) ball(near, x, 0.4, z - 0.4, 0.7 + rand() * 0.3, rand() < 0.5 ? '#3a5a2a' : '#2e4a24', 1.2, 0.8, 1, { jitter: 0.1, rand });
    else briar(C, near, x, z);
  });
  // foreground briars and ferns (low)
  scatter(C, C.x0, C.x1, 3.5, x => { const z = 3.5 + rand() * 1.5; if (rand() < 0.5) briar(C, near, x, z, 0.55); else for (let k = 0; k < 4; k++) cone(near, x + (rand() - 0.5) * 0.5, 0, z, 0.07, 0.55, '#3e6a32', 3, { rz: (k - 1.5) * 0.4 }); });
  scatter(C, C.x0, C.x1, 18, x => { box(near, x, 0, 3.6 + rand(), 2.2, 0.4, 0.45, '#4a3a2a', { ry: rand() - 0.5 }); });   // fallen logs
  // further trunks into the mist
  scatter(C, C.x0 - 40, C.x1 + 40, 4, x => cyl(far, x, 0, -20 - rand() * 50, 0.9 + rand() * 1.2, 40, '#2a3424', 7));
  // mist layers
  for (const [z, op] of [[-9, 0.12], [-16, 0.18], [-28, 0.26]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0 + 80, 5), new THREE.MeshBasicMaterial({ map: mistTex().clone(), color: '#9ac090', transparent: true, opacity: op, depthWrite: false, fog: true }));
    m.position.set((C.x0 + C.x1) / 2, 1.6, z); C.group.add(m); C.disposables.push(m.geometry, m.material);
    C.updates.push((dt, t) => { m.material.map.offset.x = t * 0.004 * (z / -9); });
  }
  // fireflies
  const N = C.low ? 40 : 110, pos = new Float32Array(N * 3), seeds = [];
  for (let i = 0; i < N; i++) seeds.push({ x: C.x0 + rand() * (C.x1 - C.x0), y: 0.5 + rand() * 3.5, z: -1 - rand() * 12 + (rand() < 0.2 ? 6 : 0), p: rand() * 10 });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex(), color: '#e8ff8a', size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; C.group.add(pts); C.disposables.push(geo, pts.material);
  C.updates.push((dt, t) => { for (let i = 0; i < N; i++) { const s = seeds[i]; pos[i * 3] = s.x + Math.sin(t * 0.4 + s.p) * 1.2; pos[i * 3 + 1] = s.y + Math.sin(t * 0.9 + s.p * 2) * 0.4; pos[i * 3 + 2] = s.z + Math.cos(t * 0.3 + s.p) * 0.8; } geo.attributes.position.needsUpdate = true; pts.material.opacity = 0.7 + Math.sin(t * 3) * 0.2; });
  C.ridge = { z: -125, elev: 2.9, color: '#4a5a54', plate: '#5a6a60', fade: 0.5, moving: 0 };
  C.env = {
    sky: skyTex([[0, '#0c1814'], [0.5, '#24402e'], [0.82, '#6a9a62'], [1, '#a8c888']]),
    fog: ['#4e7050', 16, 160], hemi: ['#a0c8b0', '#3a4228', 1.25], sun: ['#d8f0a8', 2.0], sunDir: [-0.4, 0.8, 0.6], lamp: ['#8af0c0', 3], exposure: 1.35,
  };
}
function briar(C, b, x, z, s = 1) {
  for (let k = 0; k < 6; k++) { const a = C.rand() * Math.PI; cyl(b, x + (C.rand() - 0.5) * 0.8 * s, 0, z + (C.rand() - 0.5) * 0.4, 0.035, 1.2 * s, '#5a2a22', 4, { rz: Math.cos(a) * 0.9, rx: (C.rand() - 0.5) * 0.4 }); }
  for (let k = 0; k < 8; k++) cone(b, x + (C.rand() - 0.5) * 0.9 * s, 0.2 + C.rand() * 0.6 * s, z + 0.1, 0.03, 0.14, '#8a4a3a', 3, { rz: C.rand() * 6 });
  if (C.rand() < 0.4) ball(b, x, 0.6 * s, z + 0.12, 0.06, '#c83a5a');
}
let mistT = null;
function mistTex() {
  if (mistT) return mistT;
  mistT = canvasTex(512, 64, (g) => {
    for (let i = 0; i < 60; i++) { const x = Math.random() * 512, y = 20 + Math.random() * 30, r = 20 + Math.random() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 512, 64); }
  }, { repeat: [8, 1] });
  return mistT;
}

// ------------------------------------------------------------------------------------------------ 3 · Saltmere Docks (evening)
function docks(C) {
  const { near, far, glow, rand, L } = C;
  streetBase(C, { road: 'planks', curb: null, backGround: null, frontGround: null });
  // THE QUAY behind the road (owner #101: "the building looks like it is floating"): a planked deck from the road's back
  // edge to QUAY_BACK, on a timber face with pilings down into the water. Warehouses, cargo and lamps stand on it; the
  // piers run on from its back edge out over the harbour.
  const QUAY_BACK = -11, qx0 = C.x0 - 10, qx1 = C.x1 + 30;     // past both ends: the last warehouse never hangs over the water
  const deckT = roadTex('planks', 9); deckT.repeat.set((qx1 - qx0) / 4, (-ROAD_HALF - QUAY_BACK) / 4);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(qx1 - qx0, -ROAD_HALF - QUAY_BACK).rotateX(-Math.PI / 2), texMat(deckT));
  deck.position.set((qx0 + qx1) / 2, -0.004, (QUAY_BACK - ROAD_HALF) / 2); deck.receiveShadow = true; C.group.add(deck); C.disposables.push(deck.geometry, deckT);
  surface(C, qx0, qx1, QUAY_BACK, -ROAD_HALF, -0.004, 'quay');
  box(near, (qx0 + qx1) / 2, -0.75, QUAY_BACK + 0.2, qx1 - qx0, 0.74, 0.4, '#3a2a1e');          // the deck's timber face, down to the water
  for (let x = qx0; x < qx1; x += 2.2) cyl(near, x, -2.5, QUAY_BACK + 0.15, 0.2, 2.45, '#33261b', 7);
  // the quay edge in front (beam + pilings + bollards), harbour water in front and behind
  box(near, (C.x0 + C.x1) / 2, -0.3, ROAD_HALF + 0.2, C.x1 - C.x0, 0.36, 0.42, '#4a3424');
  for (let x = C.x0; x < C.x1; x += 2.2) cyl(near, x, -2.5, ROAD_HALF + 0.25, 0.2, 2.3, '#3a2a1e', 7);
  for (let x = C.x0 + 3; x < C.x1; x += 7.5) { cyl(near, x, 0.06, ROAD_HALF + 0.22, 0.17, 0.45, '#2a2a2e', 8); cyl(near, x, 0.5, ROAD_HALF + 0.22, 0.22, 0.08, '#2a2a2e', 8); }
  const wt = waterTex();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0 + 600, 500).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: wt, color: '#ffffff', gradientMap: mat('batch').gradientMap }));
  water.position.set((C.x0 + C.x1) / 2, -0.7, -150); C.group.add(water); C.disposables.push(water.geometry, water.material, wt);
  C.updates.push((dt, t) => { wt.offset.set(t * 0.01, t * 0.004); });
  // cargo along the back of the quay
  scatter(C, C.x0, C.x1, 3.2, x => {
    const z = -3.5 - rand() * 0.6, k = rand();
    if (k < 0.35) { const n = 1 + Math.floor(rand() * 3); for (let i = 0; i < n; i++) box(near, x + (rand() - 0.5) * 0.2, i * 0.8, z, 0.8, 0.8, 0.8, i % 2 ? '#8a6038' : '#9a7044', { ry: (rand() - 0.5) * 0.3 }); }
    else if (k < 0.6) { for (let i = 0; i < 3; i++) cyl(near, x + i * 0.65, 0, z, 0.3, 0.9, '#6a4a2a', 10); }
    else if (k < 0.75) { cyl(near, x, 0.05, z, 0.45, 0.25, '#b8a070', 12); cyl(near, x, 0.3, z, 0.3, 0.12, '#b8a070', 12); }   // rope coils
    else box(near, x, 0, z - 0.2, 1.6, 0.4, 1.0, '#5a6a5a', { jitter: 0.1, rand });                                           // nets on a sledge
  });
  scatter(C, C.x0 + 6, C.x1, 13, x => lampPost(C, x, -4.6, '#ffb860', '#2a2420', 3.0));
  // warehouses and open moorings alternate along the back
  let x = C.x0, i = 0;
  while (x < C.x1) {
    if (i % 2 === 0) {
      const w = 12 + rand() * 6, h = 3.4 + rand() * 0.8;
      const wall = box(near, x + w / 2, -SINK, -7.6, w, h + SINK, 4, ['#6a5a4a', '#5a5048', '#7a6a58'][i % 3], { jitter: 0.04, rand });
      // a low-pitched slate roof the full length of the warehouse, overhanging 0.2 m at the ends and 0.3 m at the eaves
      building(C, 'warehouse', wall, roof(near, x + w / 2, h, -7.6, w + 0.4, 1.1, 4.6, '#4a4e5a'));
      box(near, x + w / 2, h - 0.25, -5.5, w + 0.5, 0.25, 0.2, '#3a2e24');
      for (let k = 0; k < Math.floor(w / 1.1); k++) box(near, x + 0.55 + k * 1.1, 0, -5.58, 0.06, h, 0.06, '#4a3e34');
      box(near, x + w * 0.35, 0, -5.56, 2.4, 2.6, 0.06, '#2a221c'); box(glow, x + w * 0.35, 0.05, -5.54, 2.0, 2.3, 0.04, '#5a3a20');
      for (const wx of [0.12, 0.65, 0.85]) { box(near, x + w * wx, 1.52, -5.57, 1.06, 0.76, 0.05, '#2a2018'); box(glow, x + w * wx, 1.6, -5.53, 0.9, 0.6, 0.04, '#ff9a40'); box(near, x + w * wx, 1.6, -5.5, 0.06, 0.6, 0.04, '#2a2018'); C.halos.push([x + w * wx, 1.9, -5.2, '#ffa050', 1.4]); }
      x += w + 2;
    } else {
      const w = 16 + rand() * 10;
      // a pier running on from the quay out into the harbour, with a boat moored alongside
      const px = x + w * 0.4, pz0 = QUAY_BACK + 0.4, pz1 = -24;
      box(near, px, -0.2, (pz0 + pz1) / 2, 2.4, 0.196, pz0 - pz1, '#5a4430');
      for (let k = 1; k < 8; k++) box(near, px - 1.2 + k * 0.3, -0.006, (pz0 + pz1) / 2, 0.025, 0.004, pz0 - pz1, '#2e2216');   // plank seams along the pier
      for (let z = pz0 - 1.5; z > pz1; z -= 2.5) { cyl(near, px - 1.15, -2.4, z, 0.16, 2.6, '#3a2a1e', 6); cyl(near, px + 1.15, -2.4, z, 0.16, 2.6, '#3a2a1e', 6); }
      boat(C, px + 2.35, -17 - rand() * 3, rand(), 'row', Math.PI / 2);
      if (rand() < 0.75) boat(C, x + w * 0.85, -30 - rand() * 12, rand(), 'sail');
      x += w;
    }
    i++;
  }
  // far shore: town silhouettes, a lighthouse, hills
  scatter(C, C.x0 - 80, C.x1 + 80, 6, x => { const hh = 3 + rand() * 4; box(far, x, -0.7, -95 - rand() * 10, 4 + rand() * 5, hh, 4, rand() < 0.5 ? '#3e344e' : '#463c56'); if (rand() < 0.5) box(glow, x, hh * 0.5, -92.9, 0.6, 0.5, 0.05, '#ffb060'); });
  const lx = L * 0.55;
  cyl(far, lx, -0.7, -90, 2.2, 14, '#e8e0d8', 10); for (let k = 0; k < 3; k++) cyl(far, lx, 2 + k * 4, -90, 2.25, 1.2, '#b83a3a', 10);
  cyl(glow, lx, 13.3, -90, 1.6, 2, '#ffe8a0', 8); C.halos.push([lx, 14.2, -88, '#ffe0a0', 10]);
  scatter(C, C.x0 - 100, C.x1 + 100, 30, x => hill(C, far, x, -120 - rand() * 30, 40 + rand() * 20, 10 + rand() * 8, '#3a3050'));
  // gulls wheeling over the water
  const gullM = new THREE.MeshToonMaterial({ color: '#f4f0ea', gradientMap: mat('batch').gradientMap, side: THREE.DoubleSide });
  C.disposables.push(gullM);
  for (let g = 0; g < (C.low ? 5 : 12); g++) {
    const gull = new THREE.Group();
    const wingG = new THREE.PlaneGeometry(0.5, 0.14); wingG.translate(0.25, 0, 0);
    const wl = new THREE.Mesh(wingG, gullM), wr = new THREE.Mesh(wingG, gullM); wr.rotation.y = Math.PI;
    const bodyM = new THREE.Mesh(prim('sphere', 6, 4), gullM); bodyM.scale.set(0.08, 0.07, 0.22);
    gull.add(wl, wr, bodyM); C.group.add(gull); C.disposables.push(wingG);
    const cx = C.x0 + rand() * (C.x1 - C.x0), cz = -10 - rand() * 25, cy = 6 + rand() * 6, r = 3 + rand() * 6, sp = (0.3 + rand() * 0.3) * (rand() < 0.5 ? 1 : -1), ph = rand() * 6;
    C.updates.push((dt, t) => { const a = t * sp + ph; gull.position.set(cx + Math.cos(a) * r, cy + Math.sin(t * 0.7 + ph) * 0.5, cz + Math.sin(a) * r * 0.5); gull.rotation.y = -a + (sp > 0 ? 0 : Math.PI); const f = Math.sin(t * 9 + ph) * 0.6; wl.rotation.z = f; wr.rotation.z = -f; });
  }
  C.ridge = { z: -88, elev: 3.4, color: '#2e2a44', plate: '#3a3452', fade: 0.3, moving: 0 };
  C.env = {
    sky: skyTex([[0, '#1c1e48'], [0.45, '#6a3a6a'], [0.78, '#d8706a'], [1, '#f6a860']]),
    fog: ['#a86a78', 35, 230], hemi: ['#9aa8d8', '#4a3a3a', 0.95], sun: ['#ff9a5a', 2.2], sunDir: [0.6, 0.3, 0.65], lamp: ['#ffb060', 7], exposure: 1.1,
  };
  clouds(C, '#f0a08a', 9);
}
/**
 * A clinker-built harbour boat (owner #101: "the boats look pretty cheesy" — they were a box with a cone on the nose).
 * The hull is lofted from cross-sections along its length: a broad square stern (transom), the widest point a little
 * aft of the middle, a pointed bow that rises (sheer) and a keel that lifts toward the bow (rocker). It is built as
 * overlapping plank strakes in two alternating tones, so the plank lines read at road distance, with a darker inside,
 * floorboards, thwarts (seats) and a rubbing strake along the gunwale. `kind` 'row' = oars shipped across the thwarts;
 * 'sail' = a mast with a tan lug sail on a yard. `ry` turns it (π/2 = moored along a pier). Length 5.2 m, beam 1.8 m.
 */
const HULL = { L: 5.2, B: 1.8, D: 0.78 };
function hullAt(u, v) {
  // u: 0 stern → 1 bow; v: 0 keel → 1 gunwale. Returns [x, y, z≥0] for the starboard side.
  const { L, B, D } = HULL;
  const width = u < 0.42 ? 0.72 + 0.28 * Math.sin((u / 0.42) * Math.PI / 2) : Math.pow(Math.max(0, Math.cos(Math.min(1, (u - 0.42) / 0.58) * Math.PI / 2)), 0.75);
  const keel = -D + 0.05 * (1 - u) + 0.42 * Math.pow(Math.max(0, u - 0.5) / 0.5, 2);
  const sheer = 0.06 * Math.pow(1 - u, 2) + 0.34 * Math.pow(Math.max(0, u - 0.45) / 0.55, 2);
  const y = keel + (sheer - keel) * v, half = (B / 2) * width * Math.pow(Math.sin(v * Math.PI / 2), 0.55);
  return [(u - 0.5) * L, y, half];
}
/** A strip of the hull between v0 and v1 (both sides), facing outward (or inward, `inner`), as an indexed geometry. */
function hullStrip(v0, v1, { inner = false, inset = 0, n = 14 } = {}) {
  const pos = [], idx = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) for (const v of [v0, v1]) {
      const [x, y, z] = hullAt(i / n, v);
      pos.push(x, y, side * Math.max(0, z - inset));
    }
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      // outward on the +z side means counter-clockwise seen from +z; flip for the other side and for the inside
      const flip = (side < 0) !== inner;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function transomGeo(inner = false) {
  // the flat stern board: a fan from its centre line out to the stern section
  const pos = [], idx = [], n = 8;
  const [cx, cy0] = hullAt(0, 0), [, cy1] = hullAt(0, 1);
  pos.push(cx, (cy0 + cy1) / 2, 0);
  for (let i = 0; i <= n; i++) { const [x, y, z] = hullAt(0, i / n); pos.push(x, y, z); }
  for (let i = 0; i <= n; i++) { const [x, y, z] = hullAt(0, 1 - i / n); pos.push(x, y, -z); }
  for (let i = 1; i < pos.length / 3 - 1; i++) inner ? idx.push(0, i, i + 1) : idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function boat(C, x, z, r, kind = 'row', ry = 0) {
  const b = new Batch(64);
  const paint = [['#7a3a2a', '#8a4632'], ['#2a4a6a', '#345878'], ['#4e5a3a', '#5a6844'], ['#e0d6c0', '#cfc4ac']][Math.floor(r * 4) % 4];
  const strakes = 6;
  for (let k = 0; k < strakes; k++) {
    // each plank laps a little over the one below it (clinker), which leaves a thin shadow line at every seam
    const v0 = k / strakes, v1 = Math.min(1, (k + 1) / strakes + 0.025);
    b.add(hullStrip(v0, v1, { inset: -0.012 * (k % 2) }), {}, k === strakes - 1 ? '#3a2a1e' : paint[k % 2]);
    b.add(hullStrip(v0, Math.min(1, (k + 1) / strakes), { inner: true, inset: 0.035 }), {}, k % 2 ? '#6a5038' : '#5e4630');
  }
  // the plank seams: a thin dark line where each strake laps over the one below (they read at road distance)
  for (let k = 1; k < strakes; k++) b.add(hullStrip(k / strakes - 0.014, k / strakes + 0.01, { inset: -0.02 }), {}, '#24180f');
  b.add(transomGeo(false), {}, paint[0]); b.add(transomGeo(true), { x: 0.035 }, '#5e4630');
  // keel and stem post, the rubbing strake along the gunwale, floorboards and thwarts
  for (let i = 0; i < 12; i++) { const [x0, y0] = hullAt(i / 12, 0), [x1, y1] = hullAt((i + 1) / 12, 0); b.add(prim('box'), { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - 0.03, sx: x1 - x0 + 0.02, sy: 0.08, sz: 0.08, rz: Math.atan2(y1 - y0, x1 - x0) }, '#2e2218'); }
  { const [sx, sy0] = hullAt(1, 0), [, sy1] = hullAt(1, 1); b.add(prim('box'), { x: sx + 0.02, y: (sy0 + sy1) / 2 + 0.06, sx: 0.09, sy: sy1 - sy0 + 0.16, sz: 0.09, rz: 0.12 }, '#2e2218'); }
  for (const side of [1, -1]) for (let i = 0; i < 14; i++) {
    const [x0, y0, z0] = hullAt(i / 14, 1), [x1, y1, z1] = hullAt((i + 1) / 14, 1);
    b.add(prim('box'), { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: side * ((z0 + z1) / 2 + 0.015), sx: Math.hypot(x1 - x0, z1 - z0) + 0.03, sy: 0.07, sz: 0.06, rz: Math.atan2(y1 - y0, x1 - x0), ry: -side * Math.atan2(z1 - z0, x1 - x0) }, '#2a1e16');
  }
  { const [, fy] = hullAt(0.45, 0.22), [, , fz] = hullAt(0.45, 0.22); b.add(prim('box'), { x: -0.15, y: fy, sx: HULL.L * 0.62, sy: 0.03, sz: fz * 1.7 }, '#7a5a3a'); }
  for (const u of [0.24, 0.5, 0.7]) { const [tx, ty, tz] = hullAt(u, 0.78); b.add(prim('box'), { x: tx, y: ty, sx: 0.24, sy: 0.05, sz: tz * 2 - 0.04 }, '#8a6a48'); }
  if (kind === 'sail') {
    const [mx, my] = hullAt(0.62, 0.25);
    b.add(prim('cyl', 6), { x: mx, y: my + 2.1, sx: 0.06, sy: 4.3, sz: 0.06 }, '#4a3424');
    // a lug sail: a four-sided tan sail hung from a yard slanting up toward the stern, its foot along a boom
    const sail = new THREE.BufferGeometry(), sp = [mx + 0.25, my + 3.9, 0.02, mx - 2.1, my + 3.1, 0.02, mx - 2.0, my + 0.75, 0.02, mx + 0.15, my + 0.75, 0.02];
    sail.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sail.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); sail.computeVertexNormals();
    b.add(sail, {}, '#d8bc8a');
    b.add(prim('cyl', 5), { x: mx - 0.92, y: my + 3.5, sx: 0.035, sy: 2.5, sz: 0.035, rz: Math.PI / 2 - 0.33 }, '#3a2a1e');   // the yard
    b.add(prim('cyl', 5), { x: mx - 0.92, y: my + 0.75, sx: 0.035, sy: 2.4, sz: 0.035, rz: Math.PI / 2 }, '#3a2a1e');         // the boom
    for (let k = 1; k < 4; k++) b.add(prim('box'), { x: mx - 0.95, y: my + 0.75 + k * 0.62, z: 0.03, sx: 2.1, sy: 0.02, sz: 0.01 }, '#b89a6a');   // reef bands
  } else {
    // two oars shipped fore-and-aft along the thwarts, blades over the stern
    for (const s of [1, -1]) { const [, oy, oz] = hullAt(0.5, 0.86); b.add(prim('cyl', 5), { x: -0.2, y: oy + 0.06, z: s * (oz - 0.28), sx: 0.03, sy: 3.0, sz: 0.03, rz: Math.PI / 2 }, '#a07a4e'); b.add(prim('box'), { x: -1.75, y: oy + 0.06, z: s * (oz - 0.28), sx: 0.55, sy: 0.02, sz: 0.15 }, '#a07a4e'); }
    b.add(prim('box'), { x: 0.6, y: hullAt(0.6, 0.3)[1] + 0.12, sx: 0.5, sy: 0.24, sz: 0.4 }, '#6a5a44');      // a fish basket
  }
  const m = b.build(mat('batch'), { shadows: !C.low }); const g = new THREE.Group(); g.add(m); g.rotation.y = ry; g.position.set(x, -0.7, z); C.group.add(g);
  C.disposables.push(...m.children.map(o => o.geometry));
  const ph = r * 10; C.updates.push((dt, t) => { g.position.y = -0.36 + Math.sin(t * 1.1 + ph) * 0.05; g.rotation.z = Math.sin(t * 0.9 + ph) * 0.035; g.rotation.x = Math.sin(t * 0.7 + ph) * 0.025; });
}
let waterT = null;
function waterTex() {
  waterT = canvasTex(256, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#2a3a6a'); gr.addColorStop(1, '#3a4a7a'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) { const x = Math.random() * 256, y = Math.random() * 256, w = 10 + Math.random() * 30; g.fillStyle = Math.random() < 0.3 ? 'rgba(255,170,120,0.35)' : 'rgba(170,190,240,0.25)'; g.fillRect(x, y, w, 2); }
  }, { repeat: [120, 100] });
  return waterT;
}

// ------------------------------------------------------------------------------------------------ 4 · Greyspire Abbey (lantern-green cloister)
function abbey(C) {
  const { near, far, glow, rand, L } = C;
  streetBase(C, { road: 'flag', curb: '#6a6e68', backGround: '#4a5644', frontGround: '#587050', ground: 'grass' });
  const stone = '#8a8e88', dark = '#5a5e5a';
  // cloister colonnade: round arches on columns, a lean-to slate roof, the inner wall with green sconces
  for (let x = C.x0; x < C.x1; x += 2.6) {
    near.add(prim('arch'), { x, y: 0, z: -4.4, sx: 2.6, sy: 3.4, sz: 1 }, stone, { jitter: 0.04, rand });
    cyl(near, x - 1.3, 0, -4.2, 0.18, 0.3, dark, 8);
  }
  box(near, (C.x0 + C.x1) / 2, 3.4, -4.4, C.x1 - C.x0, 0.3, 0.5, dark);
  roof(near, (C.x0 + C.x1) / 2, 3.65, -5.6, C.x1 - C.x0, 1.2, 3.0, '#3a4048');
  box(near, (C.x0 + C.x1) / 2, 0, -7.2, C.x1 - C.x0, 4.2, 0.6, '#6a6e68');
  scatter(C, C.x0, C.x1, 6.5, x => { box(near, x, 1.8, -6.85, 0.3, 0.5, 0.2, '#2a2e2a'); box(glow, x, 2.0, -6.72, 0.2, 0.3, 0.1, '#c6ff5a'); C.halos.push([x, 2.1, -6.4, '#c6ff5a', 1.4]); });
  // the church behind: a long nave wall with buttresses and tall stained glass, towers here and there
  const naveBays = [];
  for (let x = C.x0; x < C.x1; x += 8) {
    naveBays.push(box(near, x, -SINK, -13, 8, 6.4 + SINK, 2, '#767a74', { jitter: 0.03, rand }));
    box(near, x - 4, 0, -11.6, 0.9, 5.4, 1.2, dark);
    // one tall lancet window per bay, leaded in lantern green, gold, red and blue panes
    const panes = ['#8ac83a', '#d89a3a', '#b8382a', '#3a6ad8'];
    for (let k = 0; k < 8; k++) box(glow, x + (k % 2 ? 0.36 : -0.36), 3.0 + Math.floor(k / 2) * 0.62, -11.98, 0.68, 0.56, 0.04, panes[(k + Math.floor(x / 8)) % 4]);
    cone(glow, x, 5.48, -11.98, 0.72, 0.6, panes[Math.floor(x / 8) % 4], 3, { sz: 0.03 });
    box(near, x, 2.9, -11.94, 1.7, 0.1, 0.12, '#3a3e3a'); box(near, x, 2.9, -11.94, 0.08, 2.6, 0.12, '#3a3e3a');
    for (let k = 1; k < 4; k++) box(near, x, 2.9 + k * 0.62, -11.94, 1.5, 0.05, 0.1, '#3a3e3a');
    C.halos.push([x, 4.2, -11.5, '#c8f08a', 2.6]);
  }
  const naveRoof = roof(near, (C.x0 + C.x1) / 2, 6.4, -13, C.x1 - C.x0 + 9, 1.2, 2.6, '#3a4048');
  for (const w of naveBays) building(C, 'nave', w, naveRoof);
  for (const tx of [C.x0 + 22, L * 0.45, L * 0.8]) { const tw = box(near, tx, -SINK, -14.5, 4, 13 + SINK, 4, '#7a7e78'); building(C, 'abbey tower', tw, cone(near, tx, 13, -14.5, 3.2, 8, '#3a4048', 4, { ry: Math.PI / 4 })); box(glow, tx, 9, -12.48, 1, 2.2, 0.04, '#c6ff5a'); }
  // the garth wall and clipped hedges in front, lanterns on short posts
  for (let x = C.x0; x < C.x1; x += 0.9) box(near, x, 0, ROAD_HALF + 0.45, 0.86, 0.42, 0.4, '#7a7e78', { jitter: 0.08, rand });
  for (let x = C.x0; x < C.x1; x += 2.2) ball(near, x, 0.45, ROAD_HALF + 1.4, 0.5, '#2e4a2a', 1.2, 0.7, 0.8);
  scatter(C, C.x0, C.x1, 12, x => { cyl(near, x, 0, ROAD_HALF + 0.8, 0.06, 0.9, '#2a2e2a', 6); box(near, x, 0.9, ROAD_HALF + 0.8, 0.22, 0.3, 0.22, '#2a2e2a'); box(glow, x, 0.95, ROAD_HALF + 0.8, 0.16, 0.2, 0.24, '#c6ff5a'); C.halos.push([x, 1.05, ROAD_HALF + 1.0, '#c6ff5a', 1.1]); });
  // far: hills and the dark land
  scatter(C, C.x0 - 80, C.x1 + 80, 28, x => hill(C, far, x, -70 - rand() * 40, 30 + rand() * 20, 8 + rand() * 8, '#2a3a34'));
  C.ridge = { z: -55, elev: 4.6, color: '#3a4844', plate: '#4a5a54', fade: 0.3, moving: 0 };
  C.env = {
    sky: skyTex([[0, '#070b14'], [0.5, '#16222e'], [0.82, '#2e4a40'], [1, '#4a6a4a']]),
    fog: ['#26342e', 24, 170], hemi: ['#9ab0c8', '#323a30', 1.0], sun: ['#c0d0ff', 1.5], sunDir: [-0.3, 0.8, 0.6], lamp: ['#b8ff6a', 9], exposure: 1.35,
  };
}

// ------------------------------------------------------------------------------------------------ 5 · The Spine (the wyrm's back, awake)
function spine(C) {
  const { near, far, rand, L } = C;
  const cb0 = [];       // cloud puffs far below the front edge
  streetBase(C, { road: 'scales', curb: null, backGround: '#7a8488', frontGround: null, ground: 'rock' });
  // the back curves down in front: rows of scales stepping down toward the drop
  for (let row = 0; row < 5; row++) for (let x = C.x0; x < C.x1; x += 1.1) near.add(prim('sphere', 7, 4), { x: x + (row % 2) * 0.55, y: -0.12 - row * row * 0.32, z: ROAD_HALF + 0.35 + row * 0.75, sx: 0.62, sy: 0.16, sz: 0.55, rx: 0.35 + row * 0.18 }, ['#5e6c72', '#52606a', '#485660', '#3e4c56', '#36444e'][row], { jitter: 0.07, rand });
  for (let x = C.x0 - 120; x < C.x1 + 120; x += 10) cb0.push([x, -14 + rand() * 4, 20 + rand() * 40]);
  // boulders and rubble along the back
  scatter(C, C.x0, C.x1, 2.5, x => rock(C, near, x, 0, -3.6 - rand() * 1.5, 0.4 + rand() * 0.5, '#6a6e70'));
  // the sea of clouds far below and mountain peaks poking through
  const cloudM = new THREE.MeshBasicMaterial({ color: '#e8e0d8', fog: true }); C.disposables.push(cloudM);
  const cb = new Batch(80);
  for (const [x, y, z] of cb0) cb.add(prim('sphere', 10, 6), { x, y, z, sx: 12 + rand() * 8, sy: 3 + rand() * 2, sz: 8 }, rand() < 0.5 ? '#f4ece4' : '#e0d8d4');
  for (let x = C.x0 - 120; x < C.x1 + 120; x += 9) cb.add(prim('sphere', 10, 6), { x, y: -8 + rand() * 3, z: -40 - rand() * 120, sx: 14 + rand() * 10, sy: 4 + rand() * 3, sz: 10 }, rand() < 0.5 ? '#f0e8e0' : '#d8d0d0');
  C.group.add(cb.build(cloudM));
  scatter(C, C.x0 - 100, C.x1 + 100, 25, x => cone(far, x, -10, -90 - rand() * 60, 10 + rand() * 8, 22 + rand() * 14, '#6a7088', 5));
  // the dorsal plates of the waking wyrm right behind the road: they rise and settle like breathing
  const n = Math.ceil((C.x1 - C.x0) / 5.5), plates = new THREE.InstancedMesh(prim('cone', 4), new THREE.MeshToonMaterial({ color: '#6a7478', gradientMap: mat('batch').gradientMap }), n);
  plates.castShadow = !C.low; plates.receiveShadow = true; C.group.add(plates); C.disposables.push(plates.material);
  const base = Array.from({ length: n }, (_, i) => ({ x: C.x0 + i * 5.5 + (rand() - 0.5), h: 3.5 + (i % 3 === 0 ? 3 : rand() * 1.6), z: -6.5 - rand() * 1.5 }));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  C.updates.push((dt, t, camX, quake) => {
    for (let i = 0; i < n; i++) {
      const b = base[i], breathe = Math.sin(t * 0.8 - b.x * 0.06) * 0.25 + (quake > 0 ? Math.sin(t * 30 + i) * 0.15 : 0);
      E.set(0.1, 0, -0.25 + Math.sin(t * 0.5 - b.x * 0.05) * 0.06); Q.setFromEuler(E);
      P.set(b.x, b.h / 2 - 0.4 + breathe, b.z); S.set(1.5, b.h, 0.4); M.compose(P, Q, S); plates.setMatrixAt(i, M);
    }
    plates.instanceMatrix.needsUpdate = true;
  });
  // wind streaks racing past
  const N = C.low ? 10 : 26, streak = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.03), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false }), N);
  streak.frustumCulled = false; C.group.add(streak); C.disposables.push(streak.geometry, streak.material);
  const ws = Array.from({ length: N }, () => ({ x: rand() * 40, y: 0.6 + rand() * 6, z: -8 + rand() * 9, l: 2 + rand() * 5, s: 18 + rand() * 14 }));
  C.updates.push((dt, t, camX) => {
    for (let i = 0; i < N; i++) { const w = ws[i]; w.x -= w.s * dt; if (w.x < -20) { w.x = 20 + rand() * 10; w.y = 0.6 + rand() * 6; } P.set(camX + w.x, w.y, w.z); S.set(w.l, 1, 1); M.compose(P, Q.identity(), S); streak.setMatrixAt(i, M); }
    streak.instanceMatrix.needsUpdate = true;
  });
  // the road itself heaves with the quake
  C.updates.push((dt, t, camX, quake) => { C.group.position.y = quake > 0 ? Math.sin(t * 22) * 0.04 * Math.min(1, quake * 2) : C.group.position.y * 0.8; });
  C.ridge = { z: -22, elev: 8, color: '#4a5458', plate: '#7a8488', fade: 0.2, moving: 1, plateK: 1 };
  C.env = {
    sky: skyTex([[0, '#24345a'], [0.45, '#6a84a8'], [0.8, '#c8c4c0'], [1, '#e8d4b0']]),
    fog: ['#b8b8c0', 40, 240], hemi: ['#c8d4f0', '#5a5048', 1.05], sun: ['#ffe0b0', 2.4], sunDir: [-0.5, 0.6, 0.6], lamp: ['#ffb060', 0], exposure: 1.05,
  };
  clouds(C, '#ffffff', 12);
}

// ------------------------------------------------------------------------------------------------ 6 · Crownhollow (the wyrm's head)
function crown(C) {
  const { near, far, glow, rand, L } = C;
  streetBase(C, { road: 'gold', curb: '#8a7058', backGround: '#9a7c62', frontGround: '#9a7a5e', ground: 'rock' });
  // horn spires rising out of the crown (their tips leave the top of the screen)
  scatter(C, C.x0, C.x1, 17, x => { const s = 2.6 + rand() * 2.6, z = -10 - rand() * 12; near.add(prim('horn'), { x, y: -0.5, z, sx: s, sy: s * (4 + rand() * 2.5), sz: s, ry: (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.6 }, rand() < 0.5 ? '#d8ccb4' : '#c4b69c', { jitter: 0.05, rand }); });
  scatter(C, C.x0 - 40, C.x1 + 40, 9, x => far.add(prim('horn'), { x, y: -1, z: -40 - rand() * 40, sx: 6, sy: 30 + rand() * 20, sz: 6, ry: rand() * 6 }, '#a08878'));
  // rocky crown ridges along the back, spiked
  scatter(C, C.x0, C.x1, 2.2, x => { rock(C, near, x, 0, -3.7 - rand(), 0.5 + rand() * 0.6, '#7a6454'); if (rand() < 0.5) cone(near, x + 0.4, 0, -4.2, 0.25, 1.2 + rand(), '#9a8470', 4); });
  // braziers of lantern fire
  const flames = [];
  scatter(C, C.x0 + 4, C.x1, 9, x => {
    const z = -4.1;
    cyl(near, x, 0, z, 0.16, 1.1, '#3a3028', 6); cyl(near, x, 1.1, z, 0.45, 0.3, '#5a4a38', 8); flames.push([x, 1.35, z]);
    C.halos.push([x, 1.8, z + 0.3, '#d8ff6a', 2.6]);
  });
  const fm = new THREE.MeshBasicMaterial({ color: '#d8ff6a' }), fm2 = new THREE.MeshBasicMaterial({ color: '#fff0a0' });
  C.disposables.push(fm, fm2);
  const fl = new THREE.InstancedMesh(prim('cone', 6), fm, flames.length), fl2 = new THREE.InstancedMesh(prim('cone', 6), fm2, flames.length);
  C.group.add(fl, fl2);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  C.updates.push((dt, t) => { flames.forEach(([x, y, z], i) => { const f = 0.8 + Math.sin(t * 11 + i) * 0.15 + Math.sin(t * 23 + i * 2) * 0.1; P.set(x, y + 0.4 * f, z); S.set(0.32, 0.8 * f, 0.32); M.compose(P, Q, S); fl.setMatrixAt(i, M); P.set(x, y + 0.25 * f, z + 0.05); S.set(0.16, 0.45 * f, 0.16); M.compose(P, Q, S); fl2.setMatrixAt(i, M); }); fl.instanceMatrix.needsUpdate = fl2.instanceMatrix.needsUpdate = true; });
  // the last chain: a great ring post near the end with links rising into the sky
  const cx = L - 8;
  box(near, cx, 0, -5.5, 2, 1.2, 2, '#4a4038'); near.add(prim('torus', 0.2, 16), { x: cx, y: 1.7, z: -5.5, s: 0.9 }, '#3a3a40');
  for (let k = 0; k < 14; k++) near.add(prim('torus', 0.22, 10), { x: cx - k * 0.55, y: 2.6 + k * 1.1, z: -5.5 - k * 0.9, s: 0.5, ry: k % 2 ? Math.PI / 2 : 0, rz: -0.45 }, '#3e3e46');
  // front edge: the crown's rim
  scatter(C, C.x0, C.x1, 2.4, x => { rock(C, near, x, -0.2, ROAD_HALF + 0.9 + rand() * 0.6, 0.35 + rand() * 0.25, '#6a5444'); });
  C.ridge = { z: -30, elev: 6, color: '#6a5444', plate: '#8a7260', fade: 0.3, moving: 0.8, plateK: 1 };
  C.env = {
    sky: skyTex([[0, '#3a2a3a'], [0.4, '#9a5a3a'], [0.75, '#e8a850'], [1, '#ffe4a8']]),
    fog: ['#e0a060', 40, 240], hemi: ['#ffd8a0', '#6a4030', 1.1], sun: ['#ffd890', 2.6], sunDir: [0.3, 0.55, 0.7], lamp: ['#d8ff6a', 6], exposure: 1.05,
  };
  clouds(C, '#ffd0a0', 10, 18, 45);
}

/** Everything the Acts II/III streets are built from (themes-acts.js). */
export const K = { box, cyl, cone, ball, roof, house, roundTree, pine, fence, rock, hill, lampPost, streetBase, scatter, clouds, briar, mistTex, waterTex, boat, building, surface, roadTex, groundTex, SINK, ROAD_HALF, village, forest, docks, abbey, spine, crown };
const THEMES = { village, forest, docks, abbey, spine, crown, ...ACT_THEMES };
/** Every street id this file can build (tests walk them all). */
export const THEME_IDS = Object.keys(THEMES);

/** Build a chapter's street. Async: gives the thread back between layers. */
export async function buildTheme(id, { length = 150, chIndex = 0, quality = 'high', chapter = null } = {}) {
  const C = ctxFor({ length, quality, seed: 1000 + chIndex * 77 });
  C.halos = [];
  (THEMES[id] || village)(C);
  await breathe();
  const shadows = !C.low;
  C.group.add(C.near.build(mat('batch'), { shadows, receive: true, name: 'near' }));
  C.group.add(C.far.build(mat('batch'), { shadows: false, receive: false, name: 'far' }));
  C.group.add(C.glow.build(mat('glow'), { name: 'glow' }));
  await breathe();
  addHalos(C);
  // shadows never go black: the sky fill is at least 1.15 and the sun sits high enough for short shadows
  C.env.hemi[2] = Math.max(1.15, C.env.hemi[2] * 1.15); C.env.sunDir[1] = Math.max(C.env.sunDir[1], 0.75);
  const R = C.ridge;
  if (R) wyrmSpine(C, { ...R, fog: C.env.fog[0] });      // null where she is not on the horizon (risen, flying, or indoors)
  return {
    group: C.group, env: C.env, length, id,
    /** What the geometry test measures (tests/render-geometry.mjs): drawn building boxes and the surfaces they stand on. */
    buildings: C.buildings, grounds: C.grounds, gap: C.gap || null,
    marks: C.marks || {},
    update(dt, t, camX, quake) { for (const f of C.updates) f(dt, t, camX, quake); },
    dispose() {
      C.group.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.parameters) o.geometry.dispose(); });
      for (const d of C.disposables) d.dispose?.();
      C.env.sky.dispose();
    },
  };
}
