// The ground mesh, drawn from a heightfield (heightfield.js) — the exact grid and triangles
// `heightAt` reads, so feet sit on the drawn surface to the millimetre.
//
// Cut into 64-cell chunks so the camera culls what is behind it. Four ground surfaces (grass, forest
// floor, rock, sand) from the high-def kit are blended per pixel; the WEIGHTS are worked out per vertex
// here (slope -> rock, near the water -> sand, a noise field + `paths` -> worn earth). A large-scale
// blotch and a fine close-up grain hide the texture repeat. Water is one plane at the water level.

import * as THREE from 'three';
import { makeSurface, makeWaterNormals } from '../../../../highdef-3d/js/kit/textures.js';
import { makeNoise2D, fbm } from '../../../../worldgen/js/noise.js';

const CHUNK = 64;

export function createTerrainView(hf, { paths = [], seed = 7, textureSize = 512, clearings = [] } = {}) {
  const group = new THREE.Group(); group.name = 'terrain';
  const { res, step, half, data } = hf;
  const cells = res - 1;
  const nForest = makeNoise2D(seed * 13 + 5), nTint = makeNoise2D(seed * 17 + 3);

  // --- surface weights per vertex: x forest floor, y rock, z sand, w worn path ---------------------
  const distToPaths = (x, z) => {
    let best = 1e9;
    for (const p of paths) for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      const d = Math.hypot(x - ax - vx * t, z - az - vz * t) - (p.width || 2.5) / 2;
      if (d < best) best = d;
    }
    return best;
  };
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function weights(x, z, y, ny) {
    const slope = 1 - ny;
    const rock = smooth(0.16, 0.32, slope) + smooth(55, 90, y) * 0.6;
    const sand = (1 - smooth(hf.waterLevel + 0.6, hf.waterLevel + 2.2, y));
    let forest = smooth(0.5, 0.68, fbm(nForest, x * 0.006, z * 0.006, { octaves: 3 }));
    // Clearings (camps, towns) are open grass with a trodden-earth middle, never forest floor.
    let trodden = 0;
    for (const c of clearings) { const d = Math.hypot(x - c.x, z - c.z) / c.r; forest *= smooth(0.8, 1.3, d); trodden = Math.max(trodden, (1 - smooth(0.15, 0.55, d)) * 0.75); }
    const path = Math.max(trodden, paths.length ? 1 - smooth(0, 2.2, distToPaths(x, z)) : 0);
    let w = [forest * 0.85, Math.min(1, rock), sand, path * 0.95];
    // Rock and sand win over the softer layers; normalise so the total never exceeds 1.
    w[0] *= 1 - w[1]; w[3] *= 1 - w[1];
    const sum = w[0] + w[1] + w[2] + w[3];
    if (sum > 1) w = w.map(v => v / sum);
    return w;
  }

  // --- material ---------------------------------------------------------------------------------
  const surf = k => { const s = makeSurface(k, { size: textureSize, seed: 7 }); s.map.anisotropy = 8; s.map.wrapS = s.map.wrapT = THREE.RepeatWrapping; return s.map; };
  const tex = { grass: surf('grass'), floor: surf('forest_floor'), rock: surf('rock'), sand: surf('sand'), path: (() => { try { return surf('dirt'); } catch { return surf('forest_floor'); } })() };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { tGrass: { value: tex.grass }, tFloor: { value: tex.floor }, tRock: { value: tex.rock }, tSand: { value: tex.sand }, tPath: { value: tex.path } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vW; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = aSplat; vW = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tGrass, tFloor, tRock, tSand, tPath; varying vec4 vSplat; varying vec3 vW; varying vec3 vWN;
        float tvHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float tvNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(tvHash(i),tvHash(i+vec2(1,0)),f.x), mix(tvHash(i+vec2(0,1)),tvHash(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        {
          vec2 p = vW.xz;
          float wF = vSplat.x, wR = vSplat.y, wS = vSplat.z, wP = vSplat.w;
          float wG = clamp(1.0 - wF - wR - wS - wP, 0.0, 1.0);
          vec3 c = texture2D(tGrass, p * 0.14).rgb * wG + texture2D(tFloor, p * 0.12).rgb * wF + texture2D(tSand, p * 0.16).rgb * wS + texture2D(tPath, p * 0.15).rgb * wP;
          if (wR > 0.002) {
            vec3 n = normalize(vWN); vec3 b = pow(abs(n), vec3(4.0)); b /= (b.x + b.y + b.z);
            c += (texture2D(tRock, vW.zy * 0.06).rgb * b.x + texture2D(tRock, vW.xz * 0.06).rgb * b.y + texture2D(tRock, vW.xy * 0.06).rgb * b.z) * wR;
          }
          float macro = tvNoise(p * 0.012) * 0.5 + tvNoise(p * 0.041) * 0.5;
          c *= mix(0.82, 1.15, macro);
          float camD = length(vW - cameraPosition);
          float near = 1.0 - smoothstep(18.0, 60.0, camD);
          vec3 det = texture2D(tGrass, p * 0.9).rgb;
          c = mix(c, c * (det * 1.5 + 0.28), near * 0.25);
          diffuseColor.rgb *= c;
        }`);
  };

  // --- chunks -----------------------------------------------------------------------------------
  const per = Math.ceil(cells / CHUNK);
  const tint = new THREE.Color();
  for (let cj = 0; cj < per; cj++) for (let ci = 0; ci < per; ci++) {
    const i0 = ci * CHUNK, j0 = cj * CHUNK, i1 = Math.min(cells, i0 + CHUNK), j1 = Math.min(cells, j0 + CHUNK);
    const nx = i1 - i0 + 1, nz = j1 - j0 + 1, count = nx * nz;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), spl = new Float32Array(count * 4);
    let v = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++, v++) {
      const x = -half + i * step, z = -half + j * step, y = data[j * res + i];
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      // Vertex normal from the grid's central differences (smooth shading; heights stay exact).
      const hl = data[j * res + Math.max(0, i - 1)], hr = data[j * res + Math.min(cells, i + 1)];
      const hd = data[Math.max(0, j - 1) * res + i], hu = data[Math.min(cells, j + 1) * res + i];
      const ddx = (hr - hl) / (2 * step), ddz = (hu - hd) / (2 * step), l = Math.hypot(ddx, 1, ddz);
      nor[v * 3] = -ddx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -ddz / l;
      const w = weights(x, z, y, 1 / l);
      spl.set(w, v * 4);
      // A gentle colour wander so wide meadows are not one flat green.
      const t = fbm(nTint, x * 0.004, z * 0.004, { octaves: 2 });
      tint.setRGB(0.92 + t * 0.16, 0.95 + t * 0.1, 0.9 + (1 - t) * 0.08);
      col[v * 3] = tint.r; col[v * 3 + 1] = tint.g; col[v * 3 + 2] = tint.b;
    }
    // Same diagonal as heightfield.js: cell (i,j) splits along (i, j+1) — (i+1, j).
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;   // a=(i,j) b=(i+1,j) c=(i,j+1) d=(i+1,j+1)
      idx.push(a, c, b, c, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4));
    g.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true; mesh.name = `chunk-${ci}-${cj}`;
    group.add(mesh);
  }

  // --- water ------------------------------------------------------------------------------------
  const normals = makeWaterNormals(256, 7);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping; normals.repeat.set(60, 60);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(hf.size, hf.size, 1, 1), new THREE.MeshStandardMaterial({
    color: '#2f5f73', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82, normalMap: normals, normalScale: new THREE.Vector2(0.35, 0.35),
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = hf.waterLevel - 0.15; water.name = 'water';
  group.add(water);

  return { group, material, water, update(t) { normals.offset.set(t * 0.004, t * 0.0025); } };
}
