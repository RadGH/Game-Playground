// Buildings (Wayfare County): every `building` object drawn as a box with a flat or gabled roof, merged into one mesh
// per 256 m cell, so a whole town is a handful of draw calls. Windows are not geometry: the wall shader paints window
// bands from the wall's own metre coordinates (u along the wall, v up from the base), one row per storey.
//
// Sizing comes from the object: the collider box (hx, hy, hz) IS the walls; a gable roof sits on top of it (visual
// only — the collider stops at the eaves, which a car never reaches). Colours come from `colour` / `roofColour`.
// Buildings never break, so the meshes are built once.

import * as THREE from 'three';
import { enhance } from '../../../../../highdef-3d/js/materials.js';

const CELL = 256;

export function createBuildings(world, quality, { csm } = {}) {
  const group = new THREE.Group();
  group.name = 'buildings';
  const list = world.objects.filter(o => o.kind === 'building');
  const material = enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0 }), {
    csm, wind: false,
    // its own define: enhance() keys compiled programs by its option flags only, and without this three handed the
    // buildings the rock material's program (same flags) — walls came out black
    defines: { RL_BUILDING: '' },
    vertex: {
      pars: 'attribute vec3 aWall; varying vec3 vWall;',
      main: 'vWall = aWall;',
    },
    fragment: {
      pars: 'varying vec3 vWall; float bdGlass = 0.0;',
      // aWall = (u metres along the wall, v metres above the base, 1 if this wall has windows)
      map: /* glsl */`{
        if ( vWall.z > 0.5 ) {
          float fl = vWall.y / 3.4, fr = fract( fl );
          float col = fract( vWall.x / 3.2 );
          float win = step( 0.32, fr ) * step( fr, 0.78 ) * step( 0.18, col ) * step( col, 0.82 ) * step( 0.9, fl );
          // a band of trim at every floor line
          float trim = 1.0 - 0.12 * ( step( fr, 0.06 ) );
          diffuseColor.rgb *= trim;
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.16, 0.2, 0.25 ) + 0.12 * fract( floor( fl ) * 0.37 + floor( vWall.x / 3.2 ) * 0.61 ), win );
          bdGlass = win;
        }
      }`,
      rough: 'float roughnessFactor = mix( roughness, 0.18, bdGlass );',
    },
  });

  // one geometry per cell
  const cells = new Map();
  for (const o of list) {
    const key = Math.floor((o.x + world.size / 2) / CELL) + ',' + Math.floor((o.z + world.size / 2) / CELL);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(o);
  }
  let tris = 0;
  for (const objs of cells.values()) {
    const g = buildGeometry(objs);
    tris += g.index.count / 3;
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = quality.shadows; mesh.receiveShadow = true;
    mesh.name = 'buildings';
    group.add(mesh);
  }

  return {
    group, material, count: list.length, meshes: group.children.length, triangles: tris,
    update(cam) {
      // whole cells drop out past the terrain's own view distance
      const far = quality.terrainViewDistance + 200;
      for (const m of group.children) {
        const s = m.geometry.boundingSphere;
        const dx = s.center.x - cam.x, dz = s.center.z - cam.z;
        m.visible = Math.sqrt(dx * dx + dz * dz) - s.radius < far;
        m.castShadow = quality.shadows && Math.sqrt(dx * dx + dz * dz) - s.radius < quality.shadowDistance;
      }
    },
    dispose() { for (const m of group.children) m.geometry.dispose(); material.dispose(); },
  };
}

/** Walls + roofs of a list of buildings, in world coordinates (yaw is honoured). */
function buildGeometry(objs) {
  const P = [], N = [], Cc = [], W = [], I = [];
  const quad = (a, b, c, d, n, col, wa, wb, wc, wd) => {
    const base = P.length / 3;
    for (const v of [a, b, c, d]) P.push(v[0], v[1], v[2]);
    for (let q = 0; q < 4; q++) { N.push(n[0], n[1], n[2]); Cc.push(col[0], col[1], col[2]); }
    for (const w of [wa, wb, wc, wd]) W.push(w[0], w[1], w[2]);
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const tri = (a, b, c, n, col) => {
    const base = P.length / 3;
    for (const v of [a, b, c]) P.push(v[0], v[1], v[2]);
    for (let q = 0; q < 3; q++) { N.push(n[0], n[1], n[2]); Cc.push(col[0], col[1], col[2]); W.push(0, 0, 0); }
    I.push(base, base + 1, base + 2);
  };
  const lin = (c) => c.map(v => Math.pow(v, 2.2));   // the colours in the data are sRGB-ish; vertex colours are linear
  for (const o of objs) {
    const { hx, hy, hz } = o.shape;
    const cy = Math.cos(o.yaw || 0), sy = Math.sin(o.yaw || 0);
    // local (x, y, z) -> world, three.js rotation.y convention
    const T = (x, y, z) => [o.x + x * cy + z * sy, o.y + y, o.z - x * sy + z * cy];
    const R = (x, y, z) => [x * cy + z * sy, y, -x * sy + z * cy];
    const wall = lin(o.colour || [0.8, 0.78, 0.72]), roof = lin(o.roofColour || [0.3, 0.3, 0.3]);
    const H = 2 * hy, win = o.windows ? 1 : 0;
    // a hint of variation per building
    const tone = 0.92 + ((o.id * 2654435761) >>> 0) % 1000 / 1000 * 0.14;
    const wc = wall.map(v => v * tone);
    // four walls: (start corner, end corner, outward normal), u runs along the wall
    const walls = [
      [[-hx, hz], [hx, hz], [0, 0, 1], 2 * hx], [[hx, -hz], [-hx, -hz], [0, 0, -1], 2 * hx],
      [[hx, hz], [hx, -hz], [1, 0, 0], 2 * hz], [[-hx, -hz], [-hx, hz], [-1, 0, 0], 2 * hz],
    ];
    for (const [a, b, n, len] of walls) {
      quad(T(a[0], 0, a[1]), T(b[0], 0, b[1]), T(b[0], H, b[1]), T(a[0], H, a[1]), R(...n), wc,
        [0, 0, win], [len, 0, win], [len, H, win], [0, H, win]);
    }
    if (o.roof === 'gable') {
      // the ridge runs along the longer side
      const alongX = hx >= hz;
      const span = alongX ? hz : hx, rh = Math.min(6, span * 0.62), e = 0.35;
      if (alongX) {
        const nA = R(0, span, rh).map(v => v), nB = R(0, span, -rh);
        quad(T(-hx - e, H, hz + e), T(hx + e, H, hz + e), T(hx + e, H + rh, 0), T(-hx - e, H + rh, 0), norm(nA), roof, Z, Z, Z, Z);
        quad(T(hx + e, H, -hz - e), T(-hx - e, H, -hz - e), T(-hx - e, H + rh, 0), T(hx + e, H + rh, 0), norm(nB), roof, Z, Z, Z, Z);
        tri(T(hx, H, hz), T(hx, H, -hz), T(hx, H + rh, 0), R(1, 0, 0), wc);
        tri(T(-hx, H, -hz), T(-hx, H, hz), T(-hx, H + rh, 0), R(-1, 0, 0), wc);
      } else {
        const nA = R(rh, span, 0), nB = R(-rh, span, 0);
        quad(T(hx + e, H, hz + e), T(hx + e, H, -hz - e), T(0, H + rh, -hz - e), T(0, H + rh, hz + e), norm(nA), roof, Z, Z, Z, Z);
        quad(T(-hx - e, H, -hz - e), T(-hx - e, H, hz + e), T(0, H + rh, hz + e), T(0, H + rh, -hz - e), norm(nB), roof, Z, Z, Z, Z);
        tri(T(-hx, H, hz), T(hx, H, hz), T(0, H + rh, hz), R(0, 0, 1), wc);
        tri(T(hx, H, -hz), T(-hx, H, -hz), T(0, H + rh, -hz), R(0, 0, -1), wc);
      }
    } else {
      // a flat roof behind a low parapet band
      const p = 0.5, cap = wc.map(v => v * 0.8);
      quad(T(-hx, H + p, hz), T(hx, H + p, hz), T(hx, H + p, -hz), T(-hx, H + p, -hz), R(0, 1, 0), roof, Z, Z, Z, Z);
      for (const [a, b, n] of walls) quad(T(a[0], H, a[1]), T(b[0], H, b[1]), T(b[0], H + p, b[1]), T(a[0], H + p, a[1]), R(...n), cap, Z, Z, Z, Z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setAttribute('aWall', new THREE.Float32BufferAttribute(W, 3));
  g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  g.computeBoundingSphere();
  return g;
}
const Z = [0, 0, 0];
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
