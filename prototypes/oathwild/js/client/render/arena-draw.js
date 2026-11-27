// The arena drawn (brainstorm 2026-11-27 §2b): the sand floor, the podium wall round it, ten tiers of stone stands, the
// tall outer wall with its buttresses and battlements, the Heroes' Gate passage, the monster gates with portcullises
// that rise when a pack comes out, the champions' balcony, torches, banners and a crowd that cheers. Every piece is
// built from js/world/arena-place.js's layout — the very boxes the server walks against (lessons rule 22) — with the
// House Kit's painted atlas (housekit/js/build.js: stone, fieldstone, planks, iron, cloth…), so nothing is untextured
// (rule 77). The sand is Highdef's painted sand. Draw calls: one for the stone, one per gate's portcullis, one for the
// banners, one each for the crowd's bodies and heads, one for the flames, one for the sand.
//
//   const v = await createArenaView({ scene: group, L, quality })   L = W.arena
//   v.update(dt, t)    v.gate(id, open)    v.cheer(k)    v.stats
import * as THREE from 'three';
import { loadHouseKit } from '../../../../../housekit/js/build.js';
import { makeSurface } from '../../../../../highdef-3d/js/kit/textures.js';

const STONE = '#d9d2c4', DARK = '#57514a', WARM = '#e6d7bd';
const BANNER = ['#8c2a2a', '#2a4c8c', '#c9a03a'];
const CLOTHES = ['#8c3c3c', '#3c5a8c', '#5e7a3c', '#c9a03a', '#6b4a8c', '#d9d2c4', '#7a4a2a', '#2e6b6b', '#b5523b', '#4a4a52'];
const SKIN = ['#e7b48f', '#d8a27c', '#c08a64', '#a8785a', '#8c6248', '#f0c8a8'];

export async function createArenaView({ scene, L, quality = 'medium' }) {
  const kit = await loadHouseKit({ quality });
  const y0 = L.floorY, cfg = L.cfg;
  const root = new THREE.Group(); root.name = 'arena'; scene.add(root);
  const box = (w, h, d, p, ry, m = 'stone', t = STONE, rx = 0) => ({ s: 'box', w, h, d, p, r: [rx, ry, 0], m, t });
  const parts = [];
  const C = L.centre;
  const polar = (a, r) => [C[0] + Math.sin(a) * r, C[1] + Math.cos(a) * r];

  // ---------------------------------------------------------------- the podium wall round the sand, with a coping
  const W = cfg.wall;
  const angOff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  const gateAngles = [...L.gates, L.champGate].map(g => g.angle);
  for (const b of L.ring.inner) {
    // (the drawn wall opens at each gate: the gate's dark doors stand in the gap; the server's wall stays whole there)
    if (gateAngles.some(a => angOff(b.facing, a) < (cfg.gateWidth / 2) / W.r)) continue;
    parts.push(box(b.hw * 2, W.height + 2, b.hd * 2, [b.x, y0 + W.height / 2 - 1, b.z], b.facing, 'stone', STONE));
    parts.push(box(b.hw * 2 + 0.1, 0.35, b.hd * 2 + 0.5, [b.x, y0 + W.height + 0.17, b.z], b.facing, 'fieldstone', WARM));
  }
  // ---------------------------------------------------------------- the tiers (stepped, round the whole bowl but the passage)
  const HG = { ...L.heroGate, width: cfg.heroGate.width }, gapHalf = a => { let d = a - HG.angle; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  for (const [i, t] of L.tiers.entries()) {
    const r = (t.r0 + t.r1) / 2, depth = t.r1 - t.r0 + 0.05, n = Math.ceil(2 * Math.PI * r / 4), da = 2 * Math.PI / n;
    const top = y0 + t.y + 0.55, h = top - (y0 - 1);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI + (k + 0.5) * da;
      if (gapHalf(a) < (HG.width / 2 + 0.6) / r + da / 2) continue;
      const [x, z] = polar(a, r);
      parts.push(box(2 * r * Math.sin(da / 2) + 0.08, h, depth, [x, y0 - 1 + h / 2, z], a, 'stone', i % 2 ? STONE : '#cfc6b6'));
      parts.push(box(2 * r * Math.sin(da / 2) + 0.08, 0.12, depth * 0.5, [x + Math.sin(a) * depth * 0.2, top + 0.06, z + Math.cos(a) * depth * 0.2], a, 'planks', '#b08a5a'));   // the bench
    }
  }
  // ---------------------------------------------------------------- the outer wall: buttresses, battlements
  const O = cfg.outer;
  L.ring.outer.forEach((b, i) => {
    parts.push(box(b.hw * 2, O.height + 4, b.hd * 2, [b.x, y0 + O.height / 2 - 2, b.z], b.facing, i % 2 ? 'stone' : 'fieldstone', i % 2 ? STONE : '#cbc2b2'));
    if (i % 2 === 0) { const [x, z] = polar(b.facing, O.r + O.thick / 2 + 0.8); parts.push(box(1.6, O.height + 4, 1.4, [x, y0 + O.height / 2 - 2, z], b.facing, 'fieldstone', '#bfb6a6')); }
    if (i % 2) { const [x, z] = polar(b.facing, O.r + 0.4); parts.push(box(b.hw * 1.1, 1.4, b.hd * 2 + 0.3, [x, y0 + O.height + 0.7, z], b.facing, 'stone', STONE)); }
  });
  // ---------------------------------------------------------------- the Heroes' Gate: the passage walls and two arches
  for (const b of L.ring.passage) parts.push(box(b.hw * 2, cfg.wall.height + 6, b.hd * 2, [b.x, y0 + (cfg.wall.height + 6) / 2 - 1, b.z], b.facing, 'stone', STONE));
  for (const rr of [cfg.wall.r, O.r]) {
    const [x, z] = polar(HG.angle, rr), hgt = rr === O.r ? O.height : W.height + 4;
    parts.push(box(HG.width + 3, 2.2, 2.6, [x, y0 + hgt - 1.1 + (rr === O.r ? 0 : 1.5), z], HG.angle, 'fieldstone', WARM));
    for (const s of [-1, 1]) { const px = x + Math.cos(HG.angle) * (HG.width / 2 + 0.9) * s, pz = z - Math.sin(HG.angle) * (HG.width / 2 + 0.9) * s; parts.push(box(1.8, hgt + 1, 2.8, [px, y0 + (hgt + 1) / 2 - 1, pz], HG.angle, 'fieldstone', '#cbc2b2')); }
  }
  // ---------------------------------------------------------------- the monster gates + the champions' gate: recess, pillars, lintel
  const gates = [...L.gates, L.champGate];
  const gw = cfg.gateWidth;
  for (const g of gates) {
    const [x, z] = polar(g.angle, cfg.wall.r - 0.05), rot = g.angle;
    parts.push(box(gw + 0.4, W.height + 2, 0.4, [x + Math.sin(g.angle) * 0.9, y0 + W.height / 2, z + Math.cos(g.angle) * 0.9], rot, 'planks', '#3a2e24'));   // the dark doors behind
    for (const s of [-1, 1]) { const px = x + Math.cos(g.angle) * (gw / 2 + 0.6) * s, pz = z - Math.sin(g.angle) * (gw / 2 + 0.6) * s; parts.push(box(1.3, W.height + 2.6, 2.4, [px, y0 + (W.height + 2.6) / 2 - 1, pz], rot, 'fieldstone', g.kind === 'champion' ? '#d9c060' : '#cbc2b2')); }
    parts.push(box(gw + 2.6, 1.3, 2.4, [x, y0 + W.height + 0.9, z], rot, 'fieldstone', g.kind === 'champion' ? '#d9c060' : WARM));
    // a shield over the gate in the gate's banner colour
    parts.push(box(1.5, 1.8, 0.25, [x - Math.sin(g.angle) * 1.3, y0 + W.height + 1.8, z - Math.cos(g.angle) * 1.3], rot, 'paint', g.kind === 'champion' ? '#c9a03a' : '#8c2a2a'));
  }
  // ---------------------------------------------------------------- the champions' balcony over their gate
  const B = L.balcony, ba = B.angle;
  {
    const [x, z] = B.at;
    parts.push(box(16, 0.6, 7, [x, B.y + 0.3, z], ba, 'planks', '#9a7448'));
    for (const s of [-1, 1]) for (const f of [-1, 1]) { const px = x + Math.cos(ba) * 7.4 * s + Math.sin(ba) * 3 * f, pz = z - Math.sin(ba) * 7.4 * s + Math.cos(ba) * 3 * f; parts.push(box(0.7, 6, 0.7, [px, B.y + 3, pz], ba, 'fieldstone', WARM)); }
    const fx = x - Math.sin(ba) * 3.3, fz = z - Math.cos(ba) * 3.3;
    parts.push(box(16, 1.1, 0.3, [fx, B.y + 1.15, fz], ba, 'paint', '#6b2a2a'));   // the rail, hung red
    parts.push(box(17, 0.3, 8, [x, B.y + 6.2, z], ba, 'cloth', '#8c2a2a', 0.12)); // the canopy
    parts.push(box(2.2, 2.4, 1.4, [x + Math.sin(ba) * 1.5, B.y + 1.8, z + Math.cos(ba) * 1.5], ba, 'paint', '#c9a03a'));   // the high seat
  }
  // ---------------------------------------------------------------- torch posts round the sand
  for (const t of L.torches) { const [x, z] = t.at; parts.push({ s: 'cyl', rt: 0.14, rb: 0.2, h: 2.6, n: 6, p: [x, y0 + 1.3, z], m: 'planks', t: '#6b4a2e' }); parts.push({ s: 'cyl', rt: 0.36, rb: 0.2, h: 0.45, n: 8, p: [x, y0 + 2.75, z], m: 'iron', t: '#8a8a8a' }); }
  const sink = kit.sink();
  kit.addParts(sink, parts, null);
  const stone = new THREE.Mesh(sink.geometry(), kit.material);
  stone.name = 'arena stone'; stone.castShadow = true; stone.receiveShadow = true;
  root.add(stone);

  // ---------------------------------------------------------------- the sand (painted, with a raked darker ring by the wall)
  const sand = makeSurface('sand', { size: quality === 'low' ? 256 : 512, seed: 11 });
  const sandMap = sand.map; sandMap.wrapS = sandMap.wrapT = THREE.RepeatWrapping; sandMap.repeat.set(16, 16); sandMap.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.CircleGeometry(L.floor + 1.2, 96); disc.rotateX(-Math.PI / 2);
  {
    const P = disc.attributes.position, col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const r = Math.hypot(P.getX(i), P.getZ(i)) / L.floor; const k = r > 0.9 ? 0.82 : 1 - r * 0.06; col.set([k, k * 0.97, k * 0.93], i * 3); }
    disc.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const floor = new THREE.Mesh(disc, new THREE.MeshLambertMaterial({ map: sandMap, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  floor.position.set(C[0], y0 + 0.04, C[1]); floor.receiveShadow = true; floor.name = 'arena sand';
  root.add(floor);

  // ---------------------------------------------------------------- portcullises (one mesh each: they rise when a pack comes out)
  const portS = kit.sink(), bars = [];
  for (let i = 0; i < 7; i++) bars.push(box(0.16, 4.4, 0.16, [-gw / 2 + 0.5 + i * (gw - 1) / 6, 2.2, 0], 0, 'iron', '#6a6a6e'));
  for (let i = 0; i < 4; i++) bars.push(box(gw - 0.6, 0.14, 0.18, [0, 0.6 + i * 1.15, 0], 0, 'iron', '#5a5a5e'));
  kit.addParts(portS, bars, null);
  const portGeo = portS.geometry();
  const ports = new Map();
  for (const g of gates) {
    const m = new THREE.Mesh(portGeo, kit.material);
    const [x, z] = polar(g.angle, cfg.wall.r - 0.4);
    m.position.set(x, y0, z); m.rotation.y = g.angle; m.castShadow = true; m.name = 'portcullis ' + g.id;
    m.userData = { open: 0, want: 0 };
    root.add(m); ports.set(g.id, m);
  }

  // ---------------------------------------------------------------- banners on the outer wall, swaying (one instanced mesh)
  const banS = kit.sink();
  kit.addParts(banS, [{ s: 'box', w: 2.2, h: 6, d: 0.06, p: [0, -3, 0], r: [0, 0, 0], m: 'cloth', t: '#ffffff' }, { s: 'cyl', rt: 0.08, rb: 0.08, h: 2.8, n: 6, p: [0, 0.05, 0], r: [0, 0, Math.PI / 2], m: 'planks', t: '#6b4a2e' }], null);
  const banners = new THREE.InstancedMesh(banS.geometry(), kit.material, L.banners.length);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
  L.banners.forEach((b, i) => banners.setColorAt(i, _c.set(BANNER[b.colour])));
  banners.castShadow = true; banners.name = 'arena banners';
  root.add(banners);

  // ---------------------------------------------------------------- flames (one instanced crossed card, painted, additive)
  const flameTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 92, 4, 32, 80, 60);
    gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(0.25, 'rgba(255,190,80,0.95)'); gr.addColorStop(0.6, 'rgba(230,90,20,0.55)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(60, 60, 58, 120, 32, 124); g.bezierCurveTo(6, 120, 4, 60, 32, 4); g.fill();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const fg = new THREE.PlaneGeometry(0.8, 1.5); fg.translate(0, 0.75, 0);
  const fg2 = fg.clone(); fg2.rotateY(Math.PI / 2);
  const flameGeo = new THREE.BufferGeometry().copy(fg); { const a = fg.toNonIndexed(), b = fg2.toNonIndexed(); const pos = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]); const uv = new Float32Array([...a.attributes.uv.array, ...b.attributes.uv.array]); flameGeo.setIndex(null); flameGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); flameGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); flameGeo.deleteAttribute('normal'); }
  const flames = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true }), L.torches.length);
  flames.name = 'arena flames'; flames.frustumCulled = false;
  root.add(flames);

  // ---------------------------------------------------------------- the crowd: people on the benches, cheering
  const want = cfg.crowd?.[quality] ?? 300;
  const step = Math.max(1, L.seats.length / want);
  const seats = [];
  for (let f = 0; f < L.seats.length && seats.length < want; f += step) seats.push(L.seats[Math.floor(f)]);
  const bodyS = kit.sink(), headS = kit.sink();
  kit.addParts(bodyS, [
    { s: 'box', w: 0.56, h: 0.62, d: 0.36, p: [0, 0.62, 0], r: [0, 0, 0], m: 'cloth', t: '#ffffff' },        // the body
    { s: 'box', w: 0.5, h: 0.2, d: 0.5, p: [0, 0.22, 0.12], r: [0, 0, 0], m: 'cloth', t: '#c8c8c8' },         // the lap
    { s: 'box', w: 0.14, h: 0.5, d: 0.14, p: [-0.34, 0.85, 0], r: [0, 0, 0.35], m: 'cloth', t: '#ffffff' },    // an arm (up when cheering: the body leans)
    { s: 'box', w: 0.14, h: 0.5, d: 0.14, p: [0.34, 0.85, 0], r: [0, 0, -0.35], m: 'cloth', t: '#ffffff' },
  ], null);
  kit.addParts(headS, [{ s: 'blob', rad: 0.2, p: [0, 1.15, 0], r: [0, 0, 0], m: 'plaster', t: '#ffffff' }, { s: 'box', w: 0.36, h: 0.1, d: 0.36, p: [0, 1.33, 0], r: [0, 0, 0], m: 'cloth', t: '#7a5a3a' }], null);
  const bodies = new THREE.InstancedMesh(bodyS.geometry(), kit.material, seats.length);
  const heads = new THREE.InstancedMesh(headS.geometry(), kit.material, seats.length);
  seats.forEach((s, i) => { bodies.setColorAt(i, _c.set(CLOTHES[s.hash % CLOTHES.length])); heads.setColorAt(i, _c.set(SKIN[(s.hash >>> 5) % SKIN.length])); });
  bodies.name = 'arena crowd'; heads.name = 'arena crowd heads';
  bodies.receiveShadow = heads.receiveShadow = true;
  root.add(bodies, heads);
  for (const m of [banners, flames, bodies, heads]) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  let cheer = 0.25, tAcc = 0, part = 0;
  const _crowd = new THREE.Vector3(1.25, 1.25, 1.25);       // a touch over life size: they sit 60-86 m from the sand's middle
  function placeCrowd(t, all = false) {
    // a third of the crowd moves each frame (a phone pays per matrix)
    for (let i = all ? 0 : part; i < seats.length; i += all ? 1 : 3) {
      const s = seats[i], ph = (s.hash % 1000) / 1000 * 6.283;
      const lively = ((s.hash >>> 9) % 100) / 100 < 0.3 + cheer * 0.7;
      const bob = lively ? Math.max(0, Math.sin(t * (3 + cheer * 4) + ph)) * (0.08 + cheer * 0.25) : 0;
      _p.set(s.x, s.y + bob, s.z);
      _q.setFromEuler(_e.set(lively ? -0.1 * cheer : 0, s.face + Math.sin(t * 0.3 + ph) * 0.15, 0));
      _m.compose(_p, _q, _crowd);
      bodies.setMatrixAt(i, _m); heads.setMatrixAt(i, _m);
    }
    part = (part + 1) % 3;
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  }
  function placeBanners(t) {
    L.banners.forEach((b, i) => {
      const [x, z] = b.at, top = y0 + cfg.outer.height - 0.5;
      _p.set(x, top, z);
      _q.setFromEuler(_e.set(Math.sin(t * 1.3 + i) * 0.06, b.angle + Math.PI, Math.sin(t * 0.9 + i * 1.7) * 0.03, 'YXZ'));
      _m.compose(_p, _q, _s);
      banners.setMatrixAt(i, _m);
    });
    banners.instanceMatrix.needsUpdate = true;
  }
  const _fs = new THREE.Vector3();
  function placeFlames(t) {
    L.torches.forEach((tr, i) => {
      const k = 0.85 + 0.15 * Math.sin(t * 11 + i * 2.1) + 0.08 * Math.sin(t * 23 + i);
      _p.set(tr.at[0], y0 + 2.95, tr.at[1]);
      _q.setFromEuler(_e.set(0, t * 0.6 + i, 0));
      _fs.set(1, k * 1.1, 1);
      _m.compose(_p, _q, _fs);
      flames.setMatrixAt(i, _m);
    });
    flames.instanceMatrix.needsUpdate = true;
  }
  placeCrowd(0, true); placeBanners(0); placeFlames(0);
  for (const m of [banners, flames, bodies, heads]) m.computeBoundingSphere();
  bodies.frustumCulled = heads.frustumCulled = banners.frustumCulled = false;

  return {
    root, stats: { triangles: stone.geometry.attributes.position.count / 3, crowd: seats.length, gates: ports.size },
    update(dt, t) {
      tAcc += dt;
      cheer += (0.25 - cheer) * Math.min(1, dt * 0.25);
      for (const m of ports.values()) {
        const u = m.userData; u.open += (u.want - u.open) * Math.min(1, dt * 2.5);
        m.position.y = y0 + u.open * 4.3;
      }
      placeFlames(tAcc);
      if (tAcc % 0.1 < dt) placeBanners(tAcc);
      placeCrowd(tAcc);
    },
    /** Raise (open) or drop a gate's portcullis. */
    gate(id, open) { const m = ports.get(id); if (m) m.userData.want = open ? 1 : 0; },
    /** The crowd gets louder (0..1); it calms down by itself. */
    cheer(k) { cheer = Math.min(1, Math.max(cheer, k)); },
  };
}
