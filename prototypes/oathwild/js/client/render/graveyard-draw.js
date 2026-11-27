// The Old Graveyard drawn (brainstorm 2026-11-27 §2; Ashfield, a region of kind `graveyard`): every piece is built from
// js/world/regions/graveyard.js's layout — the very boxes the server walks against (lessons rule 22) — the way
// arena-draw.js draws the arena. Stone, iron, slate and timber all come from the House Kit's painted atlas (rule 77).
//
//   * gravestones: one instanced mesh per kind and variant (graveyard-kinds.js), each stone placed, turned, leaned,
//     rolled, sunk and scaled as graves.js rolled it; moss and a damp foot per stone (one shader term, `iMoss`)
//   * the cemetery wall: drawn edge to edge (the colliders overlap 4 cm on purpose — rule 83), a coping, an iron railing
//     on top up to the collider's height, pillars with urns at the corners, the gates and every third joint; the main
//     gate gets tall pillars, an iron arch with a lantern and its two iron gates swung open; a broken gap gets rubble
//   * iron railings (thin instanced bars with spear tips) on a stone kerb, the ruined chapel (jagged walls,
//     buttresses, a blocked window, the door arch, fallen roof beams), the crypt portal (a stone front into an earth
//     mound, an iron double door, braziers, two angels), the collapsed grave, open graves (graveyard-fx.js pits seen
//     through the ground, a soil rim, a mound of dirt, a spade stuck in it, the coffin lid beside)
//   * candles on a few graves, flames + glow (one draw), a few real lights by quality (moved to the flames nearest you;
//     never added or removed after load — rule 29), crows on the tall stones that lift off when you come near, a low
//     ground-fog band, and the name + dates of the stone you stand at (a plaque label, not a browser tooltip)
//
//   const v = await createGraveyardView({ scene, G, T, quality, view, objectMeshes })     G = W.graveyard
//   v.update(dt, t, at)     v.stats     v.label (the label shown, for tests)     v.crows
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadHouseKit, atlasMaterial } from '../../../../../housekit/js/build.js';
import { makeSurface } from '../../../../../highdef-3d/js/kit/textures.js';
import { OPEN_GRAVE } from '../../world/regions/graves.js';
import { buildKinds, regPiece } from './graveyard-kinds.js';
import { createHoles, createGlows, createGroundFog, createCrows, createLabel } from './graveyard-fx.js';

const QUALITY = {
  // near: the small stones closer than this are drawn in full, further ones as their plain block (refreshed each second)
  low: { curve: 4, bevel: 1, lights: 0, fog: 32, bars: 0.3, shadows: false, near: 26 },
  medium: { curve: 6, bevel: 1, lights: 2, fog: 64, bars: 0.22, shadows: true, near: 40 },
  high: { curve: 10, bevel: 2, lights: 4, fog: 100, bars: 0.17, shadows: true, near: 60 },
};
const STONE = '#90a1be', FIELD = '#a39f96', IRON = '#55595c', WOOD = '#6f6253', TURF = '#6f7b50';
const LABEL_R = 4, CANDLE = new THREE.Color('#ffb35a'), BRAZIER = new THREE.Color('#ff9a40');

const hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rot2 = (f, lx, lz) => [lx * Math.cos(f) + lz * Math.sin(f), -lx * Math.sin(f) + lz * Math.cos(f)];   // = graves.js fromLocal

/** The House Kit atlas material + moss: green on up-facing stone and round the foot, in blotches; a damp dark foot. */
function mossMaterial(kit, mossTex) {
  const size = kit.quality === 'low' && kit.A.small ? kit.A.size / 2 : kit.A.size;
  const m = atlasMaterial(kit.texture, size, kit.A);
  m.name = 'graveyard stone (moss)';
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.uniforms.uGyMoss = { value: mossTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float iMoss; attribute float gyFoot; varying float vGyMoss; varying float vGyFoot; varying vec3 vGyW; varying vec3 vGyN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 gw = vec4(transformed, 1.0); vec3 gn = objectNormal;
          #ifdef USE_INSTANCING
            gw = instanceMatrix * gw; gn = mat3(instanceMatrix) * gn;
          #endif
          gw = modelMatrix * gw; vGyW = gw.xyz; vGyN = normalize(mat3(modelMatrix) * gn); vGyMoss = iMoss; vGyFoot = gyFoot; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uGyMoss; varying float vGyMoss; varying float vGyFoot; varying vec3 vGyW; varying vec3 vGyN;
        float gyH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gyN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gyH(i), gyH(i + vec2(1, 0)), f.x), mix(gyH(i + vec2(0, 1)), gyH(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float up = clamp(normalize(vGyN).y, 0.0, 1.0);
          float foot = 1.0 - smoothstep(0.0, 0.6, vGyFoot);
          vec2 q = vGyW.xz * 2.1 + vGyW.y * vec2(1.3, -0.9);
          float blot = gyN(q) * 0.6 + gyN(q * 3.1 + 7.7) * 0.4;
          float cover = vGyMoss * (up * 0.85 + foot * 0.7 + 0.12);
          float mk = smoothstep(1.02 - cover * 0.62, 1.16 - cover * 0.62, blot);
          vec3 moss = texture2D(uGyMoss, vGyW.xz * 0.55 + vGyW.y * 0.4).rgb * vec3(0.62, 0.78, 0.46);
          diffuseColor.rgb = mix(diffuseColor.rgb, moss, mk * 0.88);
          diffuseColor.rgb *= mix(0.58, 1.0, smoothstep(-0.05, 0.45, vGyFoot));
          // weathered, not new: a touch darker and greyer, a grime streak running down from the top
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), 0.25) * (0.8 + 0.12 * gyN(vec2(vGyW.x * 1.7 + vGyW.z * 1.3, vGyW.y * 0.35)));
        }`);
  };
  m.customProgramCacheKey = () => 'graveyard-moss-v1';
  return m;
}

/** A static geometry from a sink, with the moss attributes: height above the ground per vertex and a moss amount. */
function withMoss(geo, T, moss) {
  const P = geo.attributes.position, n = P.count, foot = new Float32Array(n), mo = new Float32Array(n).fill(moss);
  for (let i = 0; i < n; i++) foot[i] = P.getY(i) - T.heightAt(P.getX(i), P.getZ(i));
  geo.setAttribute('gyFoot', new THREE.BufferAttribute(foot, 1));
  geo.setAttribute('iMoss', new THREE.BufferAttribute(mo, 1));
  return geo;
}

export async function createGraveyardView({ scene, G, T, quality = 'medium', view = null, objectMeshes = null }) {
  const Q = QUALITY[quality] || QUALITY.medium;
  const kit = await loadHouseKit({ quality });
  const H = (x, z) => T.heightAt(x, z);
  const root = new THREE.Group(); root.name = 'graveyard'; scene.add(root);
  const mossTex = makeSurface('moss', { size: quality === 'low' ? 128 : 256, seed: 7 }).map; mossTex.wrapS = mossTex.wrapT = THREE.RepeatWrapping;
  const dirtTex = makeSurface('dirt', { size: quality === 'low' ? 128 : 256, seed: 13 }).map; dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping;
  const stoneMat = mossMaterial(kit, mossTex);
  const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTex, color: '#b8a58c' }); dirtMat.name = 'graveyard soil';
  const meshes = [];
  const add = (m, part) => { root.add(m); m.userData.part = part; meshes.push(m); return m; };
  /** What is drawn now (the near / far stones change with where you stand): draw calls and triangles per part. */
  const measure = () => {
    const out = { quality, stones: G.stones.length, draws: 0, triangles: {}, total: 0 };
    for (const m of meshes) {
      const per = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      const n = m.isInstancedMesh ? m.count : m.geometry.isInstancedBufferGeometry ? m.geometry.instanceCount : 1;
      if (!n) continue;
      out.draws++; const tri = Math.round(per * n); out.triangles[m.userData.part] = (out.triangles[m.userData.part] || 0) + tri; out.total += tri;
    }
    return out;
  };
  const box = (w, h, d, p, ry = 0, m = 'plaster', t = STONE, rx = 0, rz = 0) => ({ s: 'box', w, h, d, p, r: [rx, ry, rz], m, t });
  const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, (k - 0.5) * 0.08); return '#' + c.getHexString(); };
  // parts placed in a turned frame (x across, z toward its front) at (cx, y0, cz)
  const framed = (parts, cx, cz, f, y0 = 0) => parts.map(p => {
    const [ox, oz] = rot2(f, p.p[0], p.p[2]);
    return { ...p, p: [cx + ox, y0 + p.p[1], cz + oz], r: [p.r?.[0] || 0, (p.r?.[1] || 0) + f, p.r?.[2] || 0] };
  });
  const stoneParts = [], ironParts = [];
  const flames = [];        // { x, y, z, kind: 'candle' | 'brazier' | 'lantern', s }
  const perchSpots = [];    // { x, y, z, face, w } crow perches on drawn tops
  const bars = [];          // { x, y, z, len, f }

  // ---------------------------------------------------------------- the stone kinds (instanced)
  const K = buildKinds(kit, { curve: Q.curve, bevel: Q.bevel });
  regPiece(kit, 'urn', new THREE.LatheGeometry([[0.001, 0], [0.16, 0], [0.12, 0.08], [0.2, 0.2], [0.24, 0.34], [0.17, 0.48], [0.11, 0.52], [0.15, 0.58], [0.001, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), Math.max(6, Q.curve + 2)));
  const urn = (x, y, z) => ({ s: 'kit', kit: 'gy', id: 'urn', p: [x, y, z], r: [0, 0, 0], sc: [1, 1, 1], cells: { face: ['plaster', '#99aac8'], top: ['plaster', '#99aac8'], edge: ['plaster', '#99aac8'] } });
  const geoOf = new Map();
  const kindGeo = v => {
    if (!geoOf.has(v)) {
      const sink = kit.sink(); kit.addParts(sink, K[v], null);
      const g = sink.geometry();
      const P = g.attributes.position, foot = new Float32Array(P.count);
      for (let i = 0; i < P.count; i++) foot[i] = P.getY(i);
      g.setAttribute('gyFoot', new THREE.BufferAttribute(foot, 1));
      geoOf.set(v, g);
    }
    return geoOf.get(v);
  };
  const variantOf = s => {
    if (s.kind === 'headstone-tall' && !s.broken && s.quarter !== 'paupers_field' && !s.story && hash(s.id + 'x') < 0.3) return 'headstone-tall-cross';
    const b = s.broken && K[s.kind + '-broken'] ? '-broken' : '';
    return s.kind + b;
  };
  const groups = new Map();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _v = new THREE.Vector3();
  const stoneM = new Map();             // stone id → its matrix (perches, labels, candles)
  const centre0 = [(G.rect.minX + G.rect.maxX) / 2, (G.rect.minZ + G.rect.maxZ) / 2];
  for (const s of G.stones) {
    const v = variantOf(s);
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v).push(s);
    _e.set(s.lean || 0, s.rot || 0, s.roll || 0, 'YXZ');
    const M = new THREE.Matrix4().compose(_p.set(s.at[0], s.y - (s.sink || 0), s.at[1]), _q.setFromEuler(_e), _s.setScalar(s.scale || 1));
    stoneM.set(s.id, M);
  }
  const openByStone = new Set(G.openGraves.map(o => o.stone));
  const mounds = G.stones.filter(s => ['cross-wood', 'slab', 'headstone-round', 'headstone-tall'].includes(s.kind) && !s.plot && !openByStone.has(s.id) && hash(s.id + 'm') < (s.quarter === 'paupers_field' ? 0.55 : 0.15));
  if (mounds.length) groups.set('grave-mound', mounds);
  // far stand-ins for the small stones: the same block, size and paint, 12 triangles (rule 77: still painted)
  const FAR = { 'headstone-round': [0.72, 0.98, 0.2], 'headstone-round-broken': [0.72, 0.58, 0.2], 'headstone-tall': [0.8, 1.42, 0.24], 'headstone-tall-broken': [0.8, 0.86, 0.24],
    'headstone-tall-cross': [0.5, 1.5, 0.18], slab: [0.68, 0.78, 0.18], 'slab-broken': [0.68, 0.45, 0.18] };
  const farGeo = v => { const [w, h, d] = FAR[v], sink = kit.sink(); kit.addParts(sink, [{ s: 'box', w, h: h + 0.42, d, p: [0, (h - 0.42) / 2, 0], r: [0, 0, 0], m: 'plaster', t: '#a4b6d6' }], null); const g = sink.geometry(); const P = g.attributes.position, f = new Float32Array(P.count); for (let i = 0; i < P.count; i++) f[i] = P.getY(i); g.setAttribute('gyFoot', new THREE.BufferAttribute(f, 1)); return g; };
  const lods = [];
  const tintOf = s => { const k = hash(s.id + 'c'); return _c.setRGB(1, 1, 1).offsetHSL((k - 0.5) * 0.04, 0, (hash(s.id + 'L') - 0.55) * 0.18); };
  for (const [v, list] of groups) {
    const g = kindGeo(v);
    const mesh = new THREE.InstancedMesh(g, stoneMat, list.length);
    const mo = new Float32Array(list.length);
    g.setAttribute('iMoss', new THREE.InstancedBufferAttribute(mo, 1));
    mesh.castShadow = Q.shadows; mesh.receiveShadow = true; mesh.name = 'graveyard ' + v;
    if (FAR[v]) {
      const fg = farGeo(v), far = new THREE.InstancedMesh(fg, stoneMat, list.length);
      fg.setAttribute('iMoss', new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1));
      far.castShadow = Q.shadows; far.receiveShadow = true; far.name = 'graveyard ' + v + ' (far)';
      far.setColorAt(0, _c.setRGB(1, 1, 1)); mesh.setColorAt(0, _c);
      lods.push({ list, near: mesh, far });
      mesh.count = 0; far.count = 0;
      add(mesh, 'stones'); add(far, 'stones');
      continue;
    }
    list.forEach((s, i) => {
      if (v === 'grave-mound') {
        // the turf mound lies on the grave, in front of the marker, flat on the ground (no lean)
        const [ox, oz] = rot2(s.rot, 0, 1.0 * (s.scale || 1)), x = s.at[0] + ox, z = s.at[1] + oz;
        _m.compose(_p.set(x, H(x, z), z), _q.setFromEuler(_e.set(0, s.rot, 0)), _s.set(1, 0.8 + hash(s.id) * 0.5, 0.9 + hash(s.id + 'l') * 0.25));
        mesh.setMatrixAt(i, _m); mo[i] = 0.15;
        mesh.setColorAt(i, _c.setRGB(1, 1, 1).offsetHSL(0, 0, (hash(s.id + 'c') - 0.5) * 0.12));
        return;
      }
      mesh.setMatrixAt(i, stoneM.get(s.id));
      mo[i] = s.moss ?? 0.5;
      mesh.setColorAt(i, tintOf(s));               // each stone a little lighter / darker, warmer / cooler
    });
    mesh.computeBoundingSphere();
    add(mesh, 'stones');
  }
  /** Near stones in full, far ones as blocks: rebuilt about once a second from where you are. */
  function placeLods(focus) {
    const R2 = Q.near * Q.near;
    for (const L of lods) {
      let n = 0, f = 0;
      const mn = L.near.geometry.attributes.iMoss, mf = L.far.geometry.attributes.iMoss;
      for (const s of L.list) {
        const dx = s.at[0] - focus.x, dz = s.at[1] - focus.z, near = dx * dx + dz * dz < R2;
        const M = near ? L.near : L.far, i = near ? n++ : f++;
        M.setMatrixAt(i, stoneM.get(s.id)); M.setColorAt(i, tintOf(s)); (near ? mn : mf).setX(i, s.moss ?? 0.5);
      }
      L.near.count = n; L.far.count = f;
      for (const M of [L.near, L.far]) { M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; M.geometry.attributes.iMoss.needsUpdate = true; M.computeBoundingSphere(); }
    }
  }
  placeLods({ x: centre0[0], z: centre0[1] });

  // ---------------------------------------------------------------- crow perches on the tops actually drawn
  const TOPS = { angel: [0, 2.24, 0.04], obelisk: [0, 3.33, 0], 'mausoleum-small': [0, 4.57, -0.35], mausoleum: [0, 5.78, -0.7], 'headstone-tall': [0, 1.49, 0], 'table-tomb': [0.3, 1.0, 0.4] };
  for (const s of G.stones) {
    const top = TOPS[s.kind]; if (!top || s.broken || variantOf(s) === 'headstone-tall-cross') continue;
    _v.set(...top).applyMatrix4(stoneM.get(s.id));
    perchSpots.push({ x: _v.x, y: _v.y, z: _v.z, face: (s.rot || 0) + (hash(s.id + 'f') - 0.5) * 2, w: s.kind === 'headstone-tall' ? 0.25 : s.kind === 'table-tomb' ? 0.4 : 1 });
  }

  // ---------------------------------------------------------------- the cemetery wall, its pillars, gates and broken gap
  const WL = G.walls, WALL_STONE = 1.5, TOP = WL.height;
  const R = G.rect, centre = [(R.minX + R.maxX) / 2, (R.minZ + R.maxZ) / 2];
  const ends = [];
  G.walls.boxes.forEach((b, i) => {
    const c = Math.cos(b.facing), s = -Math.sin(b.facing), L = 2 * (b.hw - 0.04);   // drawn edge to edge
    const e0 = [b.x - c * L / 2, b.z - s * L / 2], e1 = [b.x + c * L / 2, b.z + s * L / 2];
    const base = Math.min(H(...e0), H(...e1), b.y) - 0.6, top = b.y + WALL_STONE, k = hash('w' + i);
    stoneParts.push(box(L, top - base, WL.thick, [b.x, (top + base) / 2, b.z], b.facing, 'fieldstone', shade(FIELD, k)));
    stoneParts.push(box(L, 0.16, WL.thick + 0.16, [b.x, top + 0.08, b.z], b.facing, 'plaster', '#8494af'));
    // the iron railing on the coping, up to the collider's height
    ironParts.push(box(L, 0.05, 0.05, [b.x, b.y + TOP - 0.16, b.z], b.facing, 'iron', IRON), box(L, 0.05, 0.05, [b.x, top + 0.42, b.z], b.facing, 'iron', IRON));
    const nb = Math.max(1, Math.round(L / Q.bars));
    for (let j = 0; j < nb; j++) { const u = -L / 2 + (j + 0.5) * L / nb; bars.push({ x: b.x + c * u, y: top + 0.12, z: b.z + s * u, len: b.y + TOP - 0.02 - (top + 0.12), f: b.facing }); }
    ends.push({ p: e0, b, i }, { p: e1, b, i });
  });
  // joints: ends that meet (a corner if the two run different ways); a lone end stands at a gap
  const used = new Set(), joints = [];
  ends.forEach((e, i) => {
    if (used.has(i)) return; used.add(i);
    const grp = [e];
    ends.forEach((o, j) => { if (!used.has(j) && Math.hypot(o.p[0] - e.p[0], o.p[1] - e.p[1]) < 0.4) { used.add(j); grp.push(o); } });
    joints.push(grp);
  });
  const gaps = G.walls.gaps.map(g => ({ ...g, main: g.width >= 10 }));
  const pillar = (x, z, f, yTop, w, d, k, cap = 'urn') => {
    const base = Math.min(H(x, z), H(x + 0.5, z + 0.5), H(x - 0.5, z - 0.5)) - 0.6;
    stoneParts.push(box(w, yTop - base, d, [x, (yTop + base) / 2, z], f, 'plaster', shade('#98a9c7', k)));
    stoneParts.push(box(w + 0.16, 0.16, d + 0.16, [x, yTop + 0.08, z], f, 'plaster', '#8d9dba'));
    if (cap === 'urn') stoneParts.push(urn(x, yTop + 0.16, z));
    else stoneParts.push({ s: 'cone', rb: Math.min(w, d) * 0.62, h: 0.42, n: 4, p: [x, yTop + 0.37, z], r: [0, f + Math.PI / 4, 0], m: 'plaster', t: '#8d9dba' });
    perchSpots.push({ x, y: yTop + (cap === 'urn' ? 0.76 : 0.58), z, face: f + Math.PI / 2, w: 0.6 });
  };
  let straight = 0;
  for (const grp of joints) {
    const [x, z] = grp[0].p, ys = grp.map(e => e.b.y), yMax = Math.max(...ys);
    if (grp.length >= 2) {
      const corner = Math.abs(Math.sin(grp[0].b.facing - grp[1].b.facing)) > 0.5;
      if (corner) { pillar(x, z, grp[0].b.facing, yMax + TOP + 0.2, 1.55, 1.55, hash(x + ',' + z)); continue; }
      if (straight++ % 3 === 0 || Math.abs(ys[0] - ys[1]) > 0.25) pillar(x, z, grp[0].b.facing, yMax + TOP + 0.05, 0.9, WL.thick + 0.36, hash(x + ',' + z), straight % 2 ? 'urn' : 'cap');
      continue;
    }
    // a lone end: the gate's post, or the broken gap's ragged end
    const e = grp[0], g = gaps.reduce((a, q) => (Math.hypot(q.at[0] - x, q.at[1] - z) < Math.hypot(a.at[0] - x, a.at[1] - z) ? q : a), gaps[0]);
    if (g?.main) pillar(x, z, e.b.facing, e.b.y + TOP + 0.9, 1.35, WL.thick + 0.5, 0.3);
    else {
      // broken: the end steps down in loose blocks, rubble on the ground beside it
      const c = Math.cos(e.b.facing), s = -Math.sin(e.b.facing), out = Math.sign((g.at[0] - x) * c + (g.at[1] - z) * s) || 1;
      for (let k = 0; k < 3; k++) {
        const u = out * (0.35 + k * 0.55), bx = x + c * u, bz = z + s * u, hgt = WALL_STONE * (0.7 - k * 0.24);
        stoneParts.push(box(0.6, hgt + 0.6, WL.thick * (0.9 - k * 0.12), [bx, H(bx, bz) - 0.6 + (hgt + 0.6) / 2, bz], e.b.facing + (k - 1) * 0.08, 'fieldstone', shade(FIELD, 0.3 + k * 0.2)));
      }
      for (let k = 0; k < 6; k++) {
        const u = out * (0.6 + hash(x + 'r' + k) * 2.2), v = (hash(z + 'v' + k) - 0.5) * 2.6, bx = x + c * u - s * v, bz = z + s * u + c * v;
        stoneParts.push({ s: 'blob', rad: 0.18 + hash(k + 'q' + x) * 0.22, p: [bx, H(bx, bz) + 0.02, bz], r: [hash(k + 'a') * 3, hash(k + 'b') * 3, 0], m: 'fieldstone', t: shade(FIELD, hash(k + 'c' + z)) });
      }
    }
  }
  // the main gate: an iron arch over it with a lantern, and its two iron gates swung open inward
  for (const g of gaps.filter(q => q.main)) {
    const c = Math.cos(g.facing), s = -Math.sin(g.facing);
    const inward = Math.sign((centre[0] - g.at[0]) * -s + (centre[1] - g.at[1]) * c) || 1, n = [-s * inward, c * inward];
    const yG = H(...g.at), span = g.width / 2 + 0.05, rise = 2.2, y0 = yG + TOP + 0.75;
    const seg = 14;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg, a1 = (i + 1) / seg, u0 = -span + a0 * 2 * span, u1 = -span + a1 * 2 * span;
      const h0 = y0 + Math.sin(a0 * Math.PI) * rise, h1 = y0 + Math.sin(a1 * Math.PI) * rise;
      const um = (u0 + u1) / 2, hm = (h0 + h1) / 2, len = Math.hypot(u1 - u0, h1 - h0) + 0.02, tilt = Math.atan2(h1 - h0, u1 - u0);
      for (const off of [0, 0.36]) ironParts.push(box(len, 0.11, 0.09, [g.at[0] + c * um, hm - off, g.at[1] + s * um], g.facing, 'iron', IRON, 0, tilt));
      if (i % 2 === 1) ironParts.push(box(0.035, 0.32, 0.035, [g.at[0] + c * um, hm - 0.16, g.at[1] + s * um], g.facing, 'iron', IRON, 0, tilt));
    }
    // the lantern hangs from the top of the arch
    const lx = g.at[0], lz = g.at[1], ly = y0 + rise - 0.75;
    ironParts.push(box(0.03, 0.55, 0.03, [lx, ly + 0.5, lz], 0, 'iron', IRON), box(0.3, 0.06, 0.3, [lx, ly + 0.2, lz], g.facing, 'iron', IRON), box(0.24, 0.05, 0.24, [lx, ly - 0.2, lz], g.facing, 'iron', IRON));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const [ox, oz] = rot2(g.facing, sx * 0.12, sz * 0.12); ironParts.push(box(0.025, 0.4, 0.025, [lx + ox, ly, lz + oz], g.facing, 'iron', IRON)); }
    flames.push({ x: lx, y: ly - 0.12, z: lz, kind: 'lantern', s: 1 });
    // the gates: each 2.6 m wide, hinged at its post's inner face, swung 105° inward
    const leafW = Math.min(2.8, g.width / 2 - 0.6), leafH = 2.3;
    for (const side of [-1, 1]) {
      const hx = g.at[0] + c * side * (g.width / 2 - 0.3), hz = g.at[1] + s * side * (g.width / 2 - 0.3);
      const ang = 1.83, dx = -c * side * Math.cos(ang) + n[0] * Math.sin(ang), dz = -s * side * Math.cos(ang) + n[1] * Math.sin(ang);
      const f = Math.atan2(-dz, dx), gy = H(hx + dx * leafW / 2, hz + dz * leafW / 2) + 0.06;
      const at = (u, y) => [hx + dx * u, gy + y, hz + dz * u];
      for (const y of [0.15, 1.1, leafH - 0.1]) ironParts.push(box(leafW, 0.06, 0.05, at(leafW / 2, y), f, 'iron', IRON));
      for (const u of [0.03, leafW - 0.03]) ironParts.push(box(0.07, leafH, 0.07, at(u, leafH / 2), f, 'iron', IRON));
      const nb = Math.round(leafW / 0.15);
      for (let i = 1; i < nb; i++) {
        const u = i * leafW / nb, hh = leafH + 0.12 + Math.sin(i / nb * Math.PI) * 0.35;
        ironParts.push(box(0.025, hh, 0.025, at(u, hh / 2), f, 'iron', IRON));
        ironParts.push({ s: 'cone', rb: 0.045, h: 0.13, n: 4, p: at(u, hh + 0.06), r: [0, f + Math.PI / 4, 0], m: 'iron', t: IRON });
      }
    }
  }

  // ---------------------------------------------------------------- iron railings on a stone kerb (chapel yard, the hill)
  for (const fc of G.fences) {
    const fEnds = [];
    fc.boxes.forEach((b, i) => {
      const c = Math.cos(b.facing), s = -Math.sin(b.facing), L = 2 * (b.hw - 0.04);
      const e0 = [b.x - c * L / 2, b.z - s * L / 2], e1 = [b.x + c * L / 2, b.z + s * L / 2];
      const g0 = H(...e0), g1 = H(...e1), base = Math.min(g0, g1, b.y) - 0.35, kTop = Math.max(g0, g1, b.y) + 0.16 + (i % 2) * 0.02;
      stoneParts.push(box(L, kTop - base, 0.34, [b.x, (kTop + base) / 2, b.z], b.facing, 'plaster', shade('#94a5c2', hash(fc.id + i))));
      const top = b.y + fc.height;
      ironParts.push(box(L, 0.04, 0.04, [b.x, top - 0.12, b.z], b.facing, 'iron', IRON), box(L, 0.04, 0.04, [b.x, kTop + 0.16, b.z], b.facing, 'iron', IRON));
      const nb = Math.max(1, Math.round(L / Q.bars));
      for (let j = 0; j < nb; j++) { const u = -L / 2 + (j + 0.5) * L / nb; bars.push({ x: b.x + c * u, y: kTop - 0.02, z: b.z + s * u, len: top - kTop, f: b.facing }); }
      fEnds.push({ p: e0, b }, { p: e1, b });
    });
    // posts: iron at the joints, stone gate posts at the gaps
    const seen = new Set();
    fEnds.forEach((e, i) => {
      if (seen.has(i)) return; seen.add(i);
      let pair = false;
      fEnds.forEach((o, j) => { if (!seen.has(j) && Math.hypot(o.p[0] - e.p[0], o.p[1] - e.p[1]) < 0.3) { seen.add(j); pair = true; } });
      const [x, z] = e.p, y = e.b.y + fc.height;
      if (pair) { ironParts.push(box(0.09, y - H(x, z) + 0.3, 0.09, [x, (y + H(x, z) - 0.3) / 2, z], e.b.facing, 'iron', IRON), { s: 'blob', rad: 0.075, p: [x, y + 0.06, z], r: [0, 0, 0], m: 'iron', t: IRON }); }
      else pillar(x, z, e.b.facing, y + 0.15, 0.5, 0.5, hash(x + 'gp'), 'cap');
    });
  }

  // ---------------------------------------------------------------- the ruined chapel
  if (G.ruin) {
    const ru = G.ruin, f = ru.facing || 0, [cx, cz] = ru.at, [rw, rd] = ru.size;
    ru.boxes.forEach((b, i) => {
      const c = Math.cos(b.facing), s = -Math.sin(b.facing), L = 2 * (b.hw - 0.03);
      const g0 = H(b.x - c * L / 2, b.z - s * L / 2), g1 = H(b.x + c * L / 2, b.z + s * L / 2), base = Math.min(g0, g1, b.y) - 0.6;
      // the end walls stand tallest (the gables); the long walls broken down, most at the middle
      const [lx, lz] = rot2(-f, b.x - cx, b.z - cz), along = Math.abs(lz) > rd / 2 - 1 ? 1 : 0;
      const k = hash('ruin' + i), hgt = ru.height * (along ? 0.72 + 0.28 * k : 0.38 + 0.4 * Math.abs(lz) / (rd / 2) + 0.18 * k);
      stoneParts.push(box(L, b.y + hgt - base, 1.0, [b.x, (b.y + hgt + base) / 2, b.z], b.facing, 'fieldstone', shade('#8d9496', k)));
      // a ragged top: two loose courses, shorter and set back
      for (let j = 0; j < 2; j++) {
        const w = L * (0.3 + hash(i + 't' + j) * 0.4), u = (hash(i + 'u' + j) - 0.5) * (L - w), hh = 0.3 + hash(i + 'h' + j) * 0.6;
        stoneParts.push(box(w, hh, 0.9 - j * 0.1, [b.x + c * u, b.y + hgt + hh / 2 - 0.02, b.z + s * u], b.facing, 'fieldstone', shade('#8d9496', hash(i + 'k' + j))));
      }
      // buttresses on the outside of the long walls, every other piece
      if (!along && i % 2 === 0) {
        const out = Math.sign(lx) || 1, [nx, nz] = rot2(f, out, 0), bx = b.x + nx * 1.05, bz = b.z + nz * 1.05, bh = hgt * 0.7;
        stoneParts.push(box(0.9, bh + 0.6, 1.1, [bx, H(bx, bz) - 0.6 + (bh + 0.6) / 2, bz], b.facing, 'plaster', shade('#8393ae', k)));
        stoneParts.push({ s: 'cone', rb: 0.8, h: 0.6, n: 4, p: [bx, H(bx, bz) + bh + 0.28, bz], r: [0, b.facing + Math.PI / 4, 0], m: 'plaster', t: '#8393ae' });
      }
    });
    const y0 = ru.y, toW = (lx, lz) => { const [ox, oz] = rot2(f, lx, lz); return [cx + ox, cz + oz]; };
    // the door: two proud jambs and a pointed arch of voussoirs over the gap in the south wall
    const doorW = 4, zD = rd / 2;
    for (const sx of [-1, 1]) { const [x, z] = toW(sx * (doorW / 2 + 0.35), zD); stoneParts.push(box(0.7, 4.4 + 0.6, 1.25, [x, y0 + 4.4 / 2 - 0.3, z], f, 'plaster', '#93a4c1')); }
    {
      const Rr = doorW / 2 + 0.35, n = 11;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (1 - (i + 0.5) / n), [x, z] = toW(Math.cos(a) * Rr, zD);
        stoneParts.push(box(0.5, 0.62, 1.3, [x, y0 + 4.3 + Math.sin(a) * Rr, z], f, 'plaster', i === (n - 1) / 2 ? '#a5abad' : '#989fa1', 0, a - Math.PI / 2));
      }
    }
    // a tall window in the north gable, its frame proud of the wall, filled long ago with darker rubble
    {
      const [x, z] = toW(0, -rd / 2), ww = 2.2, wh = 3.4, yb = y0 + 2.2;
      for (const sx of [-1, 1]) { const [px, pz] = toW(sx * (ww / 2 + 0.15), -rd / 2); stoneParts.push(box(0.3, wh, 1.24, [px, yb + wh / 2, pz], f, 'plaster', '#9caecd')); }
      stoneParts.push(box(ww + 0.6, 0.3, 1.24, [x, yb - 0.15, z], f, 'plaster', '#9caecd'));
      { const Rw = ww / 2 + 0.15, n = 7; for (let k = 0; k < n; k++) { const a = Math.PI * (1 - (k + 0.5) / n), [px, pz] = toW(Math.cos(a) * Rw, -rd / 2); stoneParts.push(box(0.36, 0.42, 1.26, [px, yb + wh + Math.sin(a) * Rw, pz], f, 'plaster', '#9fb0cf', 0, a - Math.PI / 2)); } }
      { const [px, pz] = toW(0, -rd / 2); stoneParts.push(box(ww, ww / 2, 1.1, [px, yb + wh + ww / 4 - 0.02, pz], f, 'fieldstone', '#6f6c66')); }
      stoneParts.push(box(ww, wh, 1.1, [x, yb + wh / 2, z], f, 'fieldstone', '#6f6c66'));
    }
    // the altar and fallen roof beams inside; rubble heaps along the walls
    { const [x, z] = toW(0, -rd / 2 + 2.2); stoneParts.push(box(2.4, 1.6, 1.1, [x, y0 + 0.2, z], f, 'plaster', '#9aabca'), box(2.7, 0.14, 1.35, [x, y0 + 1.07, z], f, 'plaster', '#a6b8d8')); }
    for (const [lx, lz, len, tiltX, ry] of [[-3, -3, 7.5, 0.5, 0.25], [2.5, 4, 8, 0.38, -0.3], [0.5, -7.5, 6, 0.18, 1.45]]) {
      const [x, z] = toW(lx, lz);
      stoneParts.push(box(0.32, 0.3, len, [x, H(x, z) + Math.sin(tiltX) * len / 2 - 0.12, z], f + ry, 'timber', '#5b5045', -tiltX));
    }
    for (let k = 0; k < 14; k++) {
      const side = k % 2 ? 1 : -1, [x, z] = toW(side * (rw / 2 - 1.4 - hash('rb' + k) * 1.5), (hash('rz' + k) - 0.5) * (rd - 4));
      stoneParts.push({ s: 'blob', rad: 0.3 + hash('rr' + k) * 0.45, p: [x, H(x, z) + 0.05, z], r: [hash('ra' + k) * 3, hash('rc' + k) * 3, 0], m: 'fieldstone', t: shade('#899092', hash('rt' + k)) });
    }
  }

  // ---------------------------------------------------------------- the crypt portal on Mausoleum Hill
  const crypt = G.entrances.find(e => e.main && e.box);
  if (crypt) {
    const b = crypt.box, f = b.facing, y0 = b.y;
    const yMin = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1.3]].map(([sx, sz]) => { const [ox, oz] = rot2(f, sx * b.hw, sz * b.hd); return H(b.x + ox, b.z + oz); }));
    const dn = y0 - yMin + 0.8;                            // how far below the centre's ground every piece reaches
    const zF = b.hd, P = [];
    regPiece(kit, 'crypt-mound', (() => { const g = new THREE.SphereGeometry(1, Math.max(10, Q.curve * 2), 6, 0, Math.PI * 2, 0, Math.PI / 2); return g; })());
    P.push({ s: 'kit', kit: 'gy', id: 'crypt-mound', p: [0, -dn, -0.9], r: [0, 0, 0], sc: [b.hw + 1.4, 5.2 + dn, b.hd + 1.2], cells: { face: ['thatch', TURF], top: ['thatch', TURF], edge: ['thatch', TURF] } });
    // the front: two wide blocks either side of the door, a heavy lintel, a cornice, a pediment with a cross
    const dw = 2.6, dh = 3.1, fh = 4.8;
    for (const sx of [-1, 1]) {
      P.push(box(b.hw - dw / 2, fh + dn, 1.2, [sx * (dw / 2 + (b.hw - dw / 2) / 2), (fh - dn) / 2, zF - 0.6], 0, 'plaster', '#8e9ebb'));
      P.push(box(0.6, fh + dn + 0.02, 1.36, [sx * (b.hw - 0.3), (fh - dn) / 2, zF - 0.55], 0, 'plaster', '#98a9c7'));          // corner pilasters
      P.push(box(0.5, dh + 0.1, 1.4, [sx * (dw / 2 + 0.2), dh / 2, zF - 0.52], 0, 'plaster', '#9dafce'));                     // door jambs
    }
    P.push(box(dw, fh - dh, 1.2, [0, dh + (fh - dh) / 2, zF - 0.6], 0, 'plaster', '#8e9ebb'));
    P.push(box(dw + 1.4, 0.62, 1.5, [0, dh + 0.31, zF - 0.5], 0, 'plaster', '#a3b5d5'));
    P.push(box(b.hw * 2 + 0.5, 0.32, 1.6, [0, fh + 0.16, zF - 0.55], 0, 'plaster', '#93a4c1'));
    {
      const ped = `ped-crypt-${b.hw}`;
      if (!kit.pieces['gy:' + ped]) { const sh = new THREE.Shape(); sh.moveTo(-b.hw, 0); sh.lineTo(b.hw, 0); sh.lineTo(0, 1.5); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: false }); g.translate(0, 0, -0.5); regPiece(kit, ped, g); }
      P.push({ s: 'kit', kit: 'gy', id: ped, p: [0, fh + 0.32, zF - 0.6], r: [0, 0, 0], sc: [1, 1, 1], cells: { face: ['plaster', '#93a4c1'], top: ['slate', '#6f7880'], edge: ['slate', '#6f7880'] } });
      P.push(box(0.2, 0.9, 0.16, [0, fh + 2.2, zF - 0.6], 0, 'plaster', '#a3b5d5'), box(0.62, 0.18, 0.16, [0, fh + 2.35, zF - 0.6], 0, 'plaster', '#a3b5d5'));
    }
    // the iron double door, studded, 30 cm back in the doorway; ring handles
    P.push(box(dw + 0.1, dh + 0.05, 0.14, [0, dh / 2, zF - 0.95], 0, 'door', '#3a4244'));
    for (const sx of [-1, 1]) for (let r = 0; r < 4; r++) P.push(box(dw / 2 - 0.2, 0.07, 0.04, [sx * dw / 4, 0.4 + r * 0.8, zF - 0.86], 0, 'iron', '#3f4446'));
    P.push(box(0.05, dh, 0.06, [0, dh / 2, zF - 0.86], 0, 'iron', '#3a3f41'));
    // a stone threshold and an apron of flags, then wing walls holding the hill back
    P.push(box(dw + 1.6, 0.4 + dn, 1.6, [0, (0.08 - dn) / 2 - 0.12, zF + 0.75], 0, 'cobbles', '#8d9496'));
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) {
      const len = 2.6, hgt = 2.4 - k * 1.1, x = sx * (b.hw + 0.45 + k * 0.9), z = zF + 0.4 + k * 2.2;
      P.push(box(0.9, hgt + dn, len, [x, (hgt - dn) / 2, z], sx * 0.35, 'fieldstone', shade(FIELD, 0.4 + k * 0.2)));
      P.push(box(1.08, 0.16, len + 0.12, [x, hgt + 0.08, z], sx * 0.35, 'plaster', '#8494af'));
    }
    // angels either side, on the apron's ends
    for (const sx of [-1, 1]) P.push(...K.angel.map(p => ({ ...p, p: [p.p[0] + sx * (dw / 2 + 1.9), p.p[1] + 0.02, p.p[2] + zF + 1.15], r: [p.r[0], p.r[1] - sx * 0.35, p.r[2]] })));
    for (const p of framed(P, b.x, b.z, f, y0)) stoneParts.push(p);
    // braziers: a tripod, an iron bowl, a fire
    for (const sx of [-1, 1]) {
      const [ox, oz] = rot2(f, sx * 2.35, zF + 1.9), x = b.x + ox, z = b.z + oz, gy = H(x, z);
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + f; ironParts.push({ s: 'cyl', rt: 0.03, rb: 0.035, h: 1.15, n: 5, p: [x + Math.sin(a) * 0.16, gy + 0.5, z + Math.cos(a) * 0.16], r: [0.28, a, 0], m: 'iron', t: '#3f4446' }); }
      ironParts.push({ s: 'cyl', rt: 0.42, rb: 0.2, h: 0.3, n: 10, p: [x, gy + 1.08, z], r: [0, 0, 0], m: 'iron', t: '#45494b' });
      ironParts.push({ s: 'blob', rad: 0.25, p: [x, gy + 1.2, z], r: [0, 0, 0], m: 'timber', t: '#2a2420' });
      flames.push({ x, y: gy + 1.22, z, kind: 'brazier', s: 1 });
    }
    // crows like the crypt's angels
    for (const sx of [-1, 1]) { const [ox, oz] = rot2(f, sx * (dw / 2 + 1.9), zF + 1.19); perchSpots.push({ x: b.x + ox, y: y0 + 2.26, z: b.z + oz, face: f, w: 2 }); }
  }

  // ---------------------------------------------------------------- the waypoint: the Lantern Post (its glow; the post is placements' lamp-post)
  if (G.waypoint) flames.push({ x: G.waypoint.at[0] + 0.62, y: G.waypoint.y + 2.55, z: G.waypoint.at[1], kind: 'lantern', s: 1.1 });

  // ---------------------------------------------------------------- dug graves: the pit, a soil rim, the mound, a spade, the lid
  const pits = [], rims = [], heaps = [];
  const tilted = (x, z, f, hx, hz, lift = 0.05, sc = [1, 1, 1]) => {
    // a frame fitted to the ground under a (2hx × 2hz) rectangle: turned f, tilted with the slope
    const [ax, az] = rot2(f, hx, 0), [bx, bz] = rot2(f, 0, hz);
    const sx = (H(x + ax, z + az) - H(x - ax, z - az)) / (2 * hx), sz = (H(x + bx, z + bz) - H(x - bx, z - bz)) / (2 * hz);
    const X = new THREE.Vector3(ax / hx, sx, az / hx).normalize(), Z = new THREE.Vector3(bx / hz, sz, bz / hz).normalize(), Y = new THREE.Vector3().crossVectors(Z, X).normalize();
    Z.crossVectors(X, Y).normalize();
    const y = H(x, z);
    // lift the plane over every bump of the ground inside the rectangle
    let over = 0;
    for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, -0.5, 0, 0.5, 1]) {
      const px = x + ax * u + bx * v, pz = z + az * u + bz * v, plane = y + sx * hx * u + sz * hz * v;
      over = Math.max(over, H(px, pz) - plane);
    }
    const M = new THREE.Matrix4().makeBasis(X, Y, Z).scale(_s.set(...sc));
    M.setPosition(x, y + over + lift, z);
    return M;
  };
  const OG = OPEN_GRAVE, holeHalf = [OG.hole.hw, OG.hole.hd];
  const lidParts = [];
  for (const og of G.openGraves) {
    const f = og.rot || 0, [x, z] = og.at;
    const M = tilted(x, z, f, OG.hole.hw + 0.1, OG.hole.hd + 0.1, 0.04);
    pits.push({ matrix: M }); rims.push(M);
    // the mound of dug earth beside it, and the spade driven into it
    const [mx, mz] = og.mound; heaps.push(tilted(mx, mz, f, OG.mound.hw, OG.mound.hd, -0.12, [OG.mound.hw * 1.15, 0.5, OG.mound.hd * 1.05]));
    const [sx, sz] = og.spade, sy = H(sx, sz) + 0.28, lean = 0.32 + hash(og.id) * 0.2, yaw = f + (hash(og.id + 's') - 0.5);
    const up = (d) => { const [ox, oz] = rot2(yaw, 0, -Math.sin(lean) * d); return [sx + ox, sy + Math.cos(lean) * d, sz + oz]; };
    lidParts.push(box(0.2, 0.3, 0.025, up(-0.02), yaw, 'iron', '#6c7072', lean), box(0.045, 0.95, 0.045, up(0.6), yaw, 'timber', '#7a6650', lean), box(0.16, 0.05, 0.05, up(1.08), yaw, 'timber', '#7a6650', lean));
    // the coffin lid laid on the ground on the far side from the mound
    const moundSide = Math.sign(rot2(-f, og.mound[0] - x, og.mound[1] - z)[0]) || 1, [lx, lz] = rot2(f, -moundSide * 1.2, 0.1);
    const px = x + lx, pz = z + lz;
    if (hash(og.id + 'lid') < 0.7) lidParts.push(box(0.56, 0.06, 1.75, [px, H(px, pz) + 0.07, pz], f + (hash(og.id + 'r') - 0.5) * 0.4, 'planks', '#6a5a48', 0, (hash(og.id + 't') - 0.5) * 0.25));
  }
  // the collapsed grave: a wide pit, its slab broken across it, timbers fallen over, the headstone tipped
  const fall = G.entrances.find(e => e.id === 'collapsed_grave');
  if (fall) {
    const [x, z] = fall.at, f = fall.face || 0, sc = [2.1, 1, 1.25];
    const M = tilted(x, z, f, OG.hole.hw * sc[0] + 0.2, OG.hole.hd * sc[2] + 0.2, 0.04, sc);
    pits.push({ matrix: M }); rims.push(M.clone());
    const y = H(x, z) + 0.12, toW = (lx, lz) => { const [ox, oz] = rot2(f, lx, lz); return [x + ox, z + oz]; };
    for (const [lx, lz, w, d, tx, ry, tz] of [[-0.75, -0.9, 1.1, 0.95, 0.18, 0.2, 0.22], [0.8, 0.85, 1.2, 0.9, -0.2, -0.15, -0.18], [1.35, -0.55, 0.5, 0.7, 0.1, 0.6, 0.35]]) {
      const [px, pz] = toW(lx, lz); stoneParts.push(box(w, 0.16, d, [px, y + 0.06, pz], f + ry, 'plaster', '#94a5c2', tx, tz));
    }
    for (const [lx, lz, ry, tz] of [[0, 0.1, 0.55, 0.12], [0.2, -0.3, -0.7, -0.08]]) { const [px, pz] = toW(lx, lz); stoneParts.push(box(3.1, 0.2, 0.22, [px, y + 0.14, pz], f + ry, 'timber', '#4f453b', 0, tz)); }
    const [hx, hz] = toW(0, -2.0); stoneParts.push({ s: 'kit', kit: 'gy', id: 'tall-b', p: [hx, H(hx, hz) - 0.08, hz], r: [-0.42, f, 0.12], sc: [1, 1, 1], cells: { face: ['plaster', '#a3b5d5'], top: ['plaster', '#90a1be'], edge: ['plaster', '#90a1be'] } });
    for (let k = 0; k < 8; k++) { const [px, pz] = toW((hash('cg' + k) - 0.5) * 3.6, (hash('ch' + k) - 0.5) * 3.2); if (Math.hypot(px - x, pz - z) < 1.4) continue; stoneParts.push({ s: 'blob', rad: 0.12 + hash('ci' + k) * 0.16, p: [px, H(px, pz) + 0.03, pz], r: [k, k * 2, 0], m: 'plaster', t: '#94a5c2' }); }
  }
  // hide the plain stand-ins the world draws at the story graves (placements objects with no art): the pit is the grave
  const drawnHere = new Set([...G.openGraves.map(g => g.object).filter(Boolean), 'collapsed_grave']);
  for (const [id, h] of objectMeshes || []) if (drawnHere.has(id)) h.visible = false;

  // ---------------------------------------------------------------- candles on a few graves
  const candleM = [];
  for (const cd of G.candles) {
    const n = 1 + Math.floor(hash(cd.stone + 'n') * 3);
    for (let k = 0; k < n; k++) {
      const x = cd.at[0] + (hash(cd.stone + 'x' + k) - 0.5) * 0.3, z = cd.at[1] + (hash(cd.stone + 'z' + k) - 0.5) * 0.3, h = 0.1 + hash(cd.stone + 'h' + k) * 0.16, y = H(x, z) - 0.02;
      candleM.push(new THREE.Matrix4().compose(_p.set(x, y, z), _q.identity(), _s.set(1, h, 1)));
      flames.push({ x, y: y + h + 0.012, z, kind: 'candle', s: 0.8 + hash(cd.stone + 's' + k) * 0.4 });
    }
  }
  if (candleM.length) {
    const cs = kit.sink(); kit.addParts(cs, [{ s: 'cyl', rt: 0.03, rb: 0.036, h: 1, n: 6, p: [0, 0.5, 0], r: [0, 0, 0], m: 'plaster', t: '#efe3c3' }], null);
    const mesh = new THREE.InstancedMesh(cs.geometry(), kit.material, candleM.length);
    candleM.forEach((M, i) => mesh.setMatrixAt(i, M));
    mesh.computeBoundingSphere(); mesh.name = 'graveyard candles';
    add(mesh, 'candles');
  }

  // ---------------------------------------------------------------- build the static meshes
  {
    const ss = kit.sink(); kit.addParts(ss, stoneParts, null);
    const sm = new THREE.Mesh(withMoss(ss.geometry(), T, 0.55), stoneMat);
    sm.castShadow = Q.shadows; sm.receiveShadow = true; sm.name = 'graveyard walls + tombs';
    add(sm, 'walls');
    const is = kit.sink(); kit.addParts(is, [...ironParts, ...lidParts], null);
    const im = new THREE.Mesh(is.geometry(), kit.material);
    im.castShadow = Q.shadows; im.receiveShadow = true; im.name = 'graveyard iron + wood';
    add(im, 'iron');
  }
  // railing bars: one instanced piece each — an open square shaft (scaled to its length) and its spear tip, 12 triangles
  if (bars.length) {
    const shaft = new THREE.CylinderGeometry(0.019, 0.019, 1, 4, 1, true); shaft.rotateY(Math.PI / 4); shaft.translate(0, 0.5, 0);
    const tip = new THREE.ConeGeometry(0.036, 0.11, 4, 1, true); tip.rotateY(Math.PI / 4); tip.translate(0, 1.05, 0);
    regPiece(kit, 'bar', mergeGeometries([shaft.toNonIndexed(), tip.toNonIndexed()]));
    const bs = kit.sink(); kit.addParts(bs, [{ s: 'kit', kit: 'gy', id: 'bar', p: [0, 0, 0], r: [0, 0, 0], sc: [1, 1, 1], cells: { '*': ['iron', IRON] } }], null);
    const mesh = new THREE.InstancedMesh(bs.geometry(), kit.material, bars.length);
    bars.forEach((b, i) => mesh.setMatrixAt(i, _m.compose(_p.set(b.x, b.y, b.z), _q.setFromEuler(_e.set(0, b.f, 0)), _s.set(1, b.len, 1))));
    mesh.computeBoundingSphere(); mesh.castShadow = Q.shadows; mesh.name = 'graveyard railing';
    add(mesh, 'railings');
  }
  // soil: rims round the pits and the dug mounds (one draw each)
  {
    const rimS = new THREE.Shape(); const ox = OG.hole.hw + 0.3, oz = OG.hole.hd + 0.3, ix = OG.hole.hw + 0.035, iz = OG.hole.hd + 0.035;
    rimS.moveTo(-ox, -oz); rimS.lineTo(ox, -oz); rimS.lineTo(ox, oz); rimS.lineTo(-ox, oz); rimS.closePath();
    const hole = new THREE.Path(); hole.moveTo(-ix, -iz); hole.lineTo(-ix, iz); hole.lineTo(ix, iz); hole.lineTo(ix, -iz); hole.closePath(); rimS.holes.push(hole);
    const rg = new THREE.ExtrudeGeometry(rimS, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 2, curveSegments: 1 });
    rg.rotateX(-Math.PI / 2); rg.translate(0, -0.08, 0);
    const rimMesh = new THREE.InstancedMesh(rg, dirtMat, Math.max(1, rims.length));
    rims.forEach((M, i) => rimMesh.setMatrixAt(i, M)); rimMesh.count = rims.length;
    rimMesh.computeBoundingSphere(); rimMesh.receiveShadow = true; rimMesh.name = 'graveyard pit rims';
    add(rimMesh, 'graves');
    const mg = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    { const P = mg.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, P.getY(i) * (1 + 0.18 * Math.sin(x * 9 + z * 5))); } mg.computeVertexNormals(); }
    const heapMesh = new THREE.InstancedMesh(mg, dirtMat, Math.max(1, heaps.length));
    heaps.forEach((M, i) => heapMesh.setMatrixAt(i, M)); heapMesh.count = heaps.length;
    heapMesh.computeBoundingSphere(); heapMesh.castShadow = Q.shadows; heapMesh.receiveShadow = true; heapMesh.name = 'graveyard dug earth';
    add(heapMesh, 'graves');
    add(createHoles(pits, { dirt: dirtTex, half: holeHalf, deep: 1.55 }), 'graves');
  }

  // ---------------------------------------------------------------- flames + glow, lights
  const glow = createGlows(flames.length * 2);
  add(glow.mesh, 'flames');
  const lights = [];
  for (let i = 0; i < Q.lights; i++) {
    const L = new THREE.PointLight('#ffa850', 0, 9, 2);
    L.position.set(0, -500, 0); L.name = 'graveyard light ' + i; root.add(L);
    lights.push({ L, src: null, base: 0 });
  }
  function placeLights(focus) {
    if (!lights.length) return;
    const near = flames.map(fl => ({ fl, d: Math.hypot(fl.x - focus.x, fl.z - focus.z) / (fl.kind === 'brazier' ? 2.2 : fl.kind === 'lantern' ? 1.6 : 1) })).filter(o => o.d < 30).sort((a, b) => a.d - b.d);
    // candles that stand together share one light (the first of a cluster)
    const picked = [];
    for (const o of near) { if (picked.some(p => Math.hypot(p.x - o.fl.x, p.z - o.fl.z) < 2)) continue; picked.push(o.fl); if (picked.length >= lights.length) break; }
    lights.forEach((l, i) => {
      const fl = picked[i];
      l.src = fl || null;
      if (fl) { l.L.position.set(fl.x, fl.y + (fl.kind === 'brazier' ? 0.6 : fl.kind === 'lantern' ? 0.3 : 0.7), fl.z); l.base = fl.kind === 'brazier' ? 12 : fl.kind === 'lantern' ? 4 : 1.3; l.L.distance = fl.kind === 'brazier' ? 11 : fl.kind === 'lantern' ? 8 : 4.5; }
      else l.base = 0;
    });
  }
  function placeFlames(t) {
    const A = glow.att;
    flames.forEach((fl, i) => {
      const k = 0.86 + 0.1 * Math.sin(t * 9 + i * 2.3) + 0.06 * Math.sin(t * 23 + i * 1.1);
      const big = fl.kind === 'brazier' ? 1 : fl.kind === 'lantern' ? 0.3 : 0.13 * fl.s;
      const col = fl.kind === 'brazier' ? BRAZIER : CANDLE;
      A.pos.setXYZ(i * 2, fl.x, fl.y, fl.z); A.size.setXY(i * 2, 0.55 * big, 1.1 * big * k); A.col.setXYZW(i * 2, col.r, col.g * 0.95, col.b * 0.7, 1); A.kind.setX(i * 2, 0);
      const gr = fl.kind === 'brazier' ? 3.6 : fl.kind === 'lantern' ? 1.8 : 0.75;
      A.pos.setXYZ(i * 2 + 1, fl.x, fl.y + big * 0.4, fl.z); A.size.setXY(i * 2 + 1, gr * (0.95 + 0.05 * k), gr * (0.95 + 0.05 * k)); A.col.setXYZW(i * 2 + 1, col.r, col.g * 0.7, col.b * 0.4, (fl.kind === 'candle' ? 0.32 : 0.4) * k); A.kind.setX(i * 2 + 1, 1);
    });
    for (const a of Object.values(A)) a.needsUpdate = true;
  }
  placeFlames(0);

  // ---------------------------------------------------------------- crows
  let crows = null;
  {
    const black = (id, geo) => { regPiece(kit, id, geo); return id; };
    const body = kit.sink(), wl = kit.sink(), wr = kit.sink();
    const ink = '#1e1d22', cloth = { face: ['cloth', ink], top: ['cloth', ink], edge: ['cloth', ink] };
    const sph = (r, sx, sy, sz) => { const g = new THREE.SphereGeometry(r, 8, 6); g.scale(sx, sy, sz); return g; };
    black('crow-body', sph(1, 0.085, 0.085, 0.17)); black('crow-head', sph(0.062, 1, 1, 1.1));
    kit.addParts(body, [
      { s: 'kit', kit: 'gy', id: 'crow-body', p: [0, 0.15, 0], r: [-0.2, 0, 0], sc: [1, 1, 1], cells: cloth },
      { s: 'kit', kit: 'gy', id: 'crow-head', p: [0, 0.23, 0.14], r: [0, 0, 0], sc: [1, 1, 1], cells: cloth },
      { s: 'cone', rb: 0.022, h: 0.08, n: 4, p: [0, 0.225, 0.22], r: [Math.PI / 2, 0, 0], m: 'iron', t: '#2b2a2a' },
      { s: 'box', w: 0.09, h: 0.018, d: 0.15, p: [0, 0.12, -0.2], r: [0.35, 0, 0], m: 'cloth', t: ink },
      { s: 'box', w: 0.012, h: 0.1, d: 0.012, p: [0.03, 0.05, 0.02], r: [0, 0, 0], m: 'iron', t: '#2b2a2a' },
      { s: 'box', w: 0.012, h: 0.1, d: 0.012, p: [-0.03, 0.05, 0.02], r: [0, 0, 0], m: 'iron', t: '#2b2a2a' },
    ], null);
    const wing = [[0, 0.06], [0.12, 0.08], [0.3, 0.04], [0.42, -0.04], [0.34, -0.08], [0.24, -0.14], [0.12, -0.13], [0, -0.08]];
    const wShape = pts => { const s = new THREE.Shape(); s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(...p); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }); g.rotateX(Math.PI / 2); return g; };
    black('crow-wing-l', wShape(wing)); black('crow-wing-r', wShape(wing.map(([x, y]) => [-x, y]).reverse()));
    kit.addParts(wl, [{ s: 'kit', kit: 'gy', id: 'crow-wing-l', p: [0, 0, 0], r: [0, 0, 0], sc: [1, 1, 1], cells: cloth }], null);
    kit.addParts(wr, [{ s: 'kit', kit: 'gy', id: 'crow-wing-r', p: [0, 0, 0], r: [0, 0, 0], sc: [1, 1, 1], cells: cloth }], null);
    // 24 perches (as many as the generator rolled), the tallest tops first, spread out
    const want = Math.max(8, G.crows.length);
    const order = [...perchSpots].sort((a, b) => (b.w + hash(a.x + ',' + a.z)) - (a.w + hash(b.x + ',' + b.z)));
    const chosen = [];
    for (const p of order) { if (chosen.length >= want) break; if (chosen.some(c => Math.hypot(c.x - p.x, c.z - p.z) < 9)) continue; chosen.push(p); }
    const circ = [{ x: -105, y: H(-105, -60) + 24, z: -60, r: 18 }, { x: -105, y: H(-105, -60) + 30, z: -58, r: 26 }, { x: -15, y: H(-15, -62) + 26, z: -62, r: 14 }, { x: -60, y: H(-60, 10) + 34, z: 10, r: 30 }];
    crows = createCrows({ geos: { body: body.geometry(), wingL: wl.geometry(), wingR: wr.geometry() }, material: kit.material, perches: chosen.map(p => ({ x: p.x, y: p.y, z: p.z, face: p.face })), circling: quality === 'low' ? circ.slice(0, 2) : circ });
    for (const m of crows.meshes) add(m, 'crows');
  }

  // ---------------------------------------------------------------- ground fog band
  const fogN = Q.fog;
  const fog = createGroundFog(fogN);
  add(fog.mesh, 'fog');
  const inYard = (x, z, pad) => x > R.minX - pad && x < R.maxX + pad && z > R.minZ - pad && z < R.maxZ + pad;
  const fogP = Array.from({ length: fogN }, (_, i) => ({ x: 0, z: 0, y: -500, w: 1, h: 1, a: 0, life: 0, age: 0, seed: hash('fog' + i) }));
  let fogRng = 1;
  const frand = () => { fogRng = (fogRng * 16807) % 2147483647; return fogRng / 2147483647; };
  function spawnFog(p, focus, first) {
    for (let k = 0; k < 8; k++) {
      const a = frand() * Math.PI * 2, d = 4 + Math.sqrt(frand()) * 46, x = focus.x + Math.sin(a) * d, z = focus.z + Math.cos(a) * d;
      if (!inYard(x, z, 14)) continue;
      p.x = x; p.z = z; p.y = H(x, z) + 0.1 + frand() * 0.5; p.w = 7 + frand() * 8; p.h = 1.8 + frand() * 1.7;
      p.a = 0.34 + frand() * 0.24; p.life = 18 + frand() * 16; p.age = first ? frand() * p.life : 0;
      return;
    }
    p.a = 0; p.life = 3 + frand() * 3; p.age = 0; p.y = -500;
  }
  function stepFog(dt, focus, t) {
    const A = fog.att;
    fogP.forEach((p, i) => {
      p.age += dt;
      if (p.age > p.life || Math.hypot(p.x - focus.x, p.z - focus.z) > 56) spawnFog(p, focus, false);
      p.x += 0.32 * dt; p.z += 0.18 * dt;
      const fade = Math.min(1, p.age / 3) * Math.min(1, (p.life - p.age) / 3);
      A.pos.setXYZ(i, p.x, p.y, p.z); A.size.setXY(i, p.w, p.h); A.a.setX(i, p.a * Math.max(0, fade)); A.seed.setX(i, p.seed);
    });
    fog.uniforms.uTime.value = t;
    for (const a of Object.values(A)) a.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the stone label (name + dates up close)
  const label = createLabel();
  root.add(label.sprite);
  const cell = 4, grid = new Map(), key = (i, k) => i * 73856093 ^ k * 19349663;
  const LABEL_H = { 'cross-wood': 1.2, slab: 0.85, 'headstone-round': 1.05, 'headstone-tall': 1.55, obelisk: 3.4, angel: 2.6, 'table-tomb': 1.05, 'family-plot': 1.2, 'mausoleum-small': 4.7, mausoleum: 6.0 };
  for (const s of G.stones) { if (!s.name) continue; const k = key(Math.floor(s.at[0] / cell), Math.floor(s.at[1] / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  const _cf = new THREE.Vector3();
  function nearestStone(x, z) {
    let best = null, bd = LABEL_R;
    // only stones in front of the camera (a label never hangs half off the screen's edge)
    const cam = view?.camera; if (cam) cam.getWorldDirection(_cf);
    const fl = cam ? Math.hypot(_cf.x, _cf.z) || 1 : 1;
    for (let i = Math.floor(x / cell) - 1; i <= Math.floor(x / cell) + 1; i++) for (let k = Math.floor(z / cell) - 1; k <= Math.floor(z / cell) + 1; k++) {
      for (const s of grid.get(key(i, k)) || []) {
        const big = s.kind.startsWith('mausoleum') ? 4 : s.kind === 'family-plot' ? 2.2 : 0;
        if (cam) { const dx = s.at[0] - cam.position.x, dz = s.at[1] - cam.position.z, L = Math.hypot(dx, dz) || 1; if ((dx * _cf.x + dz * _cf.z) / (L * fl) < 0.8) continue; }
        const d = Math.hypot(s.at[0] - x, s.at[1] - z) - big;
        if (d < bd) { bd = d; best = s; }
      }
    }
    return best;
  }

  // compile everything now, behind the loading screen (rule 29: no shader build mid-play)
  if (view?.renderer?.compileAsync) await view.renderer.compileAsync(view.scene, view.camera).catch(() => {});

  let t = 0, labelT = 0, lightT = 0, lodT = 0, current = null;
  const focusOf = at => (at ? { x: at.x, z: at.z } : null);
  return {
    root, crows,
    get stats() { return measure(); },
    get label() { return label.text; },
    update(dt, wt, at) {
      t += dt;
      const focus = focusOf(at);
      placeFlames(t);
      if (focus) {
        if ((lightT -= dt) <= 0) { lightT = 0.4; placeLights(focus); }
        if ((lodT -= dt) <= 0) { lodT = 1; placeLods(focus); }
        if ((labelT -= dt) <= 0) {
          labelT = 0.2;
          const s = nearestStone(focus.x, focus.z);
          if (s !== current) current = s;
          if (s) { _v.set(0, (LABEL_H[s.kind] || 1.2) + 0.45, 0).applyMatrix4(stoneM.get(s.id)); label.show(s.name, s.dates || '', _v.x, _v.y, _v.z); }
          else label.hide();
        }
        crows.update(dt, focus);
        stepFog(dt, focus, t);
      }
      for (const [i, l] of lights.entries()) l.L.intensity = l.base * (0.82 + 0.12 * Math.sin(t * 8.3 + i * 1.9) + 0.06 * Math.sin(t * 21 + i));
      label.update(dt);
    },
  };
}
