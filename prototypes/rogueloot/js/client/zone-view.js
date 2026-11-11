// Drawing a zone: the ground (heights + painted surfaces, flat-shaded vertex colours), water, cliffs, and every prop
// instanced by kind and part. Reads the SAME samplers the sim's area came from (js/world/zone.js), so a tree you see is
// a tree you bump into. Sets view.groundY(x, z) so actors, drops and labels stand on the ground.
import * as THREE from 'three';
import { SURFACES, surfaceAt, heightAt } from '../world/zone.js';
import { PROP_MESHES, LIGHTS } from './prop-meshes.js';

const matCache = new Map();
const flat = c => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return matCache.get(c); };
const partCache = new Map();
const partsOf = k => { if (!partCache.has(k)) partCache.set(k, (PROP_MESHES[k] || PROP_MESHES.rock)()); return partCache.get(k); };

/**
 * The ground as a picture (owner 2026-11-11: "the ground everywhere is blurry"). Vertex colours on a 1.6-2.5 m grid smear
 * every edge between grass, dirt and road over metres; this paints the same surfaces (base, then every shape in order,
 * exactly as js/world/zone.js surfaceAt reads them) at `ppm` pixels a metre with soft 0.4 m edges and a fine grain, so a
 * road's edge is crisp to a hand's width. Capped at 4096 px a side (the biggest zone is ~370 m with its border).
 */
function paintGround(zone, ox, oz, W, D, ppm, renderer) {
  const k = Math.min(ppm, 4096 / W, 4096 / D), cw = Math.ceil(W * k), ch = Math.ceil(D * k);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  const X = x => (x - ox) * k, Z = z => (z - oz) * k;
  g.fillStyle = SURFACES[zone.base] || SURFACES.grass; g.fillRect(0, 0, cw, ch);
  g.filter = `blur(${Math.max(0.6, 0.4 * k)}px)`;                         // soft edges, about 0.4 m
  for (const sh of zone.surfaces || []) {
    const colour = SURFACES[sh.s] || SURFACES.grass; g.fillStyle = g.strokeStyle = colour;
    if (sh.circle) { g.beginPath(); g.arc(X(sh.circle[0]), Z(sh.circle[1]), sh.circle[2] * k, 0, Math.PI * 2); g.fill(); }
    else if (sh.poly) { g.beginPath(); sh.poly.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.closePath(); g.fill(); }
    else if (sh.path) { g.lineWidth = (sh.width || 3) * k; g.beginPath(); sh.path.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.stroke(); }
  }
  g.filter = 'none';
  // grain: a few percent of light/dark per pixel, the same every visit (a cheap hash, not Math.random)
  const img = g.getImageData(0, 0, cw, ch), d = img.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let h = Math.imul(p ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    const n = ((h & 255) - 128) * 0.09;
    d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.8));
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  return tex;
}

/** A seamless 256 px grain tile: pebbles and patches made of noise that wraps at the edges (so the repeat never shows a seam). */
let DETAIL = null;
function detailTexture(renderer) {
  if (DETAIL) return DETAIL;
  const N = 256, v = new Float32Array(N * N);
  let h = 12345; const rnd = () => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h + Math.imul(h ^ (h >>> 7), 0x297a2d39); return ((h ^ (h >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < N * N; i++) v[i] = rnd();
  const blur = src => { const out = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy + N) % N) * N + ((x + dx + N) % N)]; out[y * N + x] = s / 9; } return out; };
  const fine = blur(v), soft = blur(blur(blur(blur(v))));
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, patch = Math.sin(x / N * Math.PI * 4) * Math.cos(y / N * Math.PI * 6) * 0.06;     // whole periods: wraps
    const pebble = fine[i] > 0.62 ? 0.12 : 0, k = Math.max(0, Math.min(1, 0.5 + (fine[i] - 0.5) * 0.9 + (soft[i] - 0.5) * 1.6 + patch + pebble));
    img.data.set([k * 255, k * 255, k * 255, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  DETAIL = new THREE.CanvasTexture(c); DETAIL.wrapS = DETAIL.wrapT = THREE.RepeatWrapping; DETAIL.colorSpace = THREE.NoColorSpace;
  DETAIL.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  return DETAIL;
}
/** Multiply a ground material by the grain tile, `rx` x `rz` repeats across the ground (one tile = 2 m). */
function withDetail(mat, rx, rz, renderer) {
  const detail = detailTexture(renderer);
  mat.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: detail }; sh.uniforms.detailRepeat = { value: new THREE.Vector2(rx, rz) };
    sh.fragmentShader = 'uniform sampler2D detailMap;\nuniform vec2 detailRepeat;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n  diffuseColor.rgb *= 0.62 + 0.76 * texture2D( detailMap, vMapUv * detailRepeat ).r;');
  };
  mat.customProgramCacheKey = () => 'rl-ground-detail';
}

export function buildZoneView(view, area, { quality = 'high' } = {}) {
  const zone = area.zone, g = new THREE.Group(); g.name = 'zone';
  const { x0, z0, x1, z1 } = area.bounds, pad = 24;
  // ground: a grid with a vertex every `cell` metres; colour per vertex from the painted surface, small noise for life
  const cell = quality === 'low' ? 2.5 : 1.6;
  const W = x1 - x0 + pad * 2, D = z1 - z0 + pad * 2, nx = Math.ceil(W / cell), nz = Math.ceil(D / cell);
  const geo = new THREE.PlaneGeometry(W, D, nx, nz); geo.rotateX(-Math.PI / 2); geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), tmp = new THREE.Color(), noise = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), outside = x < x0 || x > x1 || z < z0 || z > z1;
    pos.setY(i, heightAt(zone, x, z) + (outside ? 0.6 + Math.sin(x * 0.3) * Math.cos(z * 0.27) * 1.2 : 0));
    // the colour comes from the painted ground picture below; the vertex colour only adds broad light-and-shade
    const n = Math.sin(x * 0.37 + z * 0.11) * Math.cos(z * 0.29 - x * 0.07) * 0.07;
    const k = (outside ? 0.82 : 1) * (0.96 + n);
    col.set([k, k, k * 0.98], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const tex = paintGround(zone, x0 - pad, z0 - pad, W, D, quality === 'low' ? 2 : 4, view.renderer);
  const gmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: tex });
  withDetail(gmat, W / 2, D / 2, view.renderer);                        // a 2 m grain tile, sharp at any distance
  const ground = new THREE.Mesh(geo, gmat); ground.receiveShadow = true; g.add(ground);
  g.userData.dispose = () => tex.dispose();
  // water
  for (const w of zone.water || []) {
    const shape = new THREE.Shape(w.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const wg = new THREE.ShapeGeometry(shape); wg.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: w.color || '#3fb8c8', transparent: true, opacity: 0.82 })); m.position.y = -0.15; g.add(m);
  }
  // cliffs: a jagged wall along the path
  for (const c of zone.cliffs || []) {
    for (let i = 1; i < c.path.length; i++) {
      const [ax, az] = c.path[i - 1], [bx, bz] = c.path[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, h = (c.h || 4) * (0.8 + 0.4 * Math.abs(Math.sin(x * 1.3 + z)));
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0).scale(1, h / 1.6 * 0.6, 1), flat(c.color || '#8a8478'));
        rock.position.set(x, h * 0.3 + heightAt(zone, x, z), z); rock.rotation.y = x * 0.7; rock.castShadow = rock.receiveShadow = true; g.add(rock);
      }
    }
  }
  // underground: dark sky, near fog, dim daylight, the torches carry the scene
  const under = ['cave', 'crypt', 'catacomb', 'mine', 'cellar'].includes(area.theme);
  // props, instanced per kind x part
  // Low graphics (phones): the purely decorative small things are skipped; nothing that blocks you is
  const DECOR = new Set(['flowers', 'grass', 'fern', 'rock_small', 'mushroom', 'reeds', 'cobweb', 'bones']);
  const byKind = {}; for (const p of area.props) { if (quality === 'low' && DECOR.has(p.k)) continue; (byKind[p.k] ||= []).push(p); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [k, list] of Object.entries(byKind)) {
    for (const [pg, color] of partsOf(k)) {
      const im = new THREE.InstancedMesh(pg, flat(color), list.length);
      list.forEach((p, i) => { q.setFromAxisAngle(up, p.yaw || 0); v.set(p.x, heightAt(zone, p.x, p.z), p.z); sc.setScalar(p.s || 1); m4.compose(v, q, sc); im.setMatrixAt(i, m4); });
      im.castShadow = !['flowers', 'grass', 'fern', 'rock_small', 'reeds', 'mushroom', 'bones', 'dock', 'bridge'].includes(k); im.receiveShadow = true;
      im.computeBoundingSphere(); g.add(im);
    }
  }
  // a few real lights (every light costs every pixel on a phone): the ones nearest the start
  const lit = area.props.filter(p => LIGHTS[p.k]).sort((a, b) => Math.hypot(a.x - area.spawn.x, a.z - area.spawn.z) - Math.hypot(b.x - area.spawn.x, b.z - area.spawn.z)).slice(0, quality === 'low' ? 2 : under ? 10 : 6);
  for (const p of lit) { const L = LIGHTS[p.k], l = new THREE.PointLight(L.color, L.i, L.d, 1.6); l.position.set(p.x, heightAt(zone, p.x, p.z) + L.y * (p.s || 1), p.z); g.add(l); }
  // the sky + fog by theme
  if (view.sun) view.sun.intensity = under ? 0.35 : 2.1;
  if (view.hemi) { view.hemi.intensity = under ? 0.5 : 1.25; view.hemi.color.set(under ? '#9aa8c8' : '#fff6dc'); }
  view.dark = under;
  const sky = { shore: '#a8dcef', meadow: '#9fd2e8', forest: '#8ec8c0', marsh: '#a8b8a8', highland: '#b8d0e8', ruins: '#c8c0b0', grave: '#8a90a8', cave: '#121218', crypt: '#141018', catacomb: '#141018', mine: '#18140f', cellar: '#16120e' }[area.theme] || '#9fd2e8';
  view.scene.background = new THREE.Color(sky); view.scene.fog.color.set(sky);
  view.scene.add(g);
  view.groundY = (x, z) => heightAt(zone, x, z);
  return g;
}
