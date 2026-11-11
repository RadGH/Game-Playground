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
    tmp.set(SURFACES[surfaceAt(zone, x, z)] || SURFACES.grass);
    const n = Math.sin(x * 0.37 + z * 0.11) * Math.cos(z * 0.29 - x * 0.07) * 0.06;
    noise.setRGB(n, n, n * 0.6); tmp.add(noise);
    if (outside) tmp.multiplyScalar(0.82);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); ground.receiveShadow = true; g.add(ground);
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
  // props, instanced per kind x part
  const byKind = {}; for (const p of area.props) (byKind[p.k] ||= []).push(p);
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
  const lit = area.props.filter(p => LIGHTS[p.k]).sort((a, b) => Math.hypot(a.x - area.spawn.x, a.z - area.spawn.z) - Math.hypot(b.x - area.spawn.x, b.z - area.spawn.z)).slice(0, quality === 'low' ? 2 : 6);
  for (const p of lit) { const L = LIGHTS[p.k], l = new THREE.PointLight(L.color, L.i, L.d, 1.6); l.position.set(p.x, heightAt(zone, p.x, p.z) + L.y * (p.s || 1), p.z); g.add(l); }
  // the sky + fog by theme
  const sky = { shore: '#a8dcef', meadow: '#9fd2e8', forest: '#8ec8c0', marsh: '#a8b8a8', highland: '#b8d0e8', ruins: '#c8c0b0', grave: '#8a90a8', cave: '#202028' }[area.theme] || '#9fd2e8';
  view.scene.background = new THREE.Color(sky); view.scene.fog.color.set(sky);
  view.scene.add(g);
  view.groundY = (x, z) => heightAt(zone, x, z);
  return g;
}
