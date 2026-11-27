// Grass tufts round the camera (they lean in the ONE wind, ./wind.js), placed entirely on the graphics card (the idea is Farhold's and Thousandvale's
// grass-gpu.js: AN INSTANCE IS A SLOT, NOT A TUFT). One patch of slots follows the camera in whole lattice squares; where
// a tuft stands in its square, which way it turns, how tall it is and whether it flowers all come from a hash of the
// square's own whole-number coordinates, so the same ground always grows the same tuft and walking moves you past the
// grass instead of dragging it along.
//
// What decides a tuft: the splat maps (ground-plan.js: grass, wild grass, a little on forest floor and marsh, none on
// roads, cobbles, yards, soil or sand) and the terrain's own height grid (texelFetch on the GRID SPLIT triangles, so a
// tuft stands on the drawn ground). It shrinks to nothing towards the edge of the patch, so there is no line where it
// stops. Colours come from the ground layers' own average colours (ground.js), so a tuft matches the ground under it.
//
//   const grass = createGrass(view, ground, cfg.grass[quality], { quality })
//   grass.update(camera position)        every frame
//   grass.mesh                           one draw call; grass.stats = { slots, triangles }
import * as THREE from 'three';
import { sheafGeometry } from '../../../../../proctown/js/propkit-three.js';
import { wind, WIND_GLSL } from './wind.js';

export function createGrass(view, ground, G, { quality = 'medium' } = {}) {
  const n = Math.ceil(G.radius / G.spacing), side = 2 * n + 1, slots = side * side;
  const base = sheafGeometry(THREE, G.blades);
  const geo = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'color']) geo.setAttribute(k, base.getAttribute(k));
  geo.setIndex(base.getIndex());
  const cells = new Float32Array(slots * 2);
  for (let k = 0, o = 0; k < side; k++) for (let i = 0; i < side; i++) { cells[o++] = i - n; cells[o++] = k - n; }
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  geo.instanceCount = slots;
  const U = ground.U;
  const uGr = { value: new THREE.Vector4(0, 0, G.spacing, G.radius) }, uGrCam = { value: new THREE.Vector3() };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.customProgramCacheKey = () => 'ow-grass|' + quality;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tOwA: U.tOwA, tOwB: U.tOwB, uOwSplat: U.uOwSplat, tOwHeight: U.tOwHeight, uOwGrid: U.uOwGrid, uOwTime: U.uOwTime, uOwGrassCol: U.uOwGrassCol, uGr, uGrCam }, wind.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tOwA, tOwB, tOwHeight; uniform vec4 uOwSplat, uOwGrid, uGr; uniform vec3 uGrCam; uniform float uOwTime; uniform vec3 uOwGrassCol[3];
        attribute vec2 aCell; varying vec3 vGrTint;
        ${ground.NOISE}
        ${WIND_GLSL}
        float owH(vec2 xz) {
          vec2 g = (xz - uOwGrid.xy) / uOwGrid.z; ivec2 c = ivec2(floor(g)); vec2 f = g - vec2(c);
          float h00 = texelFetch(tOwHeight, c, 0).r, h10 = texelFetch(tOwHeight, c + ivec2(1, 0), 0).r;
          float h01 = texelFetch(tOwHeight, c + ivec2(0, 1), 0).r, h11 = texelFetch(tOwHeight, c + ivec2(1, 1), 0).r;
          if (f.x + f.y <= 1.0) return h00 + (h10 - h00) * f.x + (h01 - h00) * f.y;
          return h11 + (h01 - h11) * (1.0 - f.x) + (h10 - h11) * (1.0 - f.y);
        }`)
      .replace('#include <begin_vertex>', `
        vec2 cell = uGr.xy + aCell;
        float h1 = owHash(cell), h2 = owHash(cell + 19.7), h3 = owHash(cell + 41.3), h4 = owHash(cell + 7.1);
        vec2 xz = (cell + vec2(h1, h2)) * uGr.z;
        vec2 suv = (xz - uOwSplat.xy) * uOwSplat.zw;
        vec4 sa = textureLod(tOwA, suv, 0.0), sb = textureLod(tOwB, suv, 0.0);
        float dens = sa.r + sa.g + sa.b * 0.4 + sb.a * 0.55;
        float patchN = owNoise(xz * 0.08);
        float show = step(h3, dens * (0.45 + 0.75 * patchN) - 0.04);
        float dist = length(xz - uGrCam.xz);
        float sc = show * (1.0 - smoothstep(uGr.w * 0.55, uGr.w, dist)) * (0.65 + 0.5 * h4) * (0.7 + 0.5 * patchN) * min(1.0, dens * 1.4);
        vec3 transformed = position;
        float yaw = h1 * 6.2832, cy = cos(yaw), sy = sin(yaw);
        transformed.xz = vec2(transformed.x * cy + transformed.z * sy, -transformed.x * sy + transformed.z * cy);
        transformed *= vec3(0.55, 0.34 + 0.26 * h2 + 0.2 * sa.g, 0.55) * sc;
        float k = position.y * position.y * sc;
        transformed.xz += owGrassLean(xz, k);          // the ONE wind (./wind.js): a gust runs over the meadow
        transformed.xz += xz; transformed.y += owH(xz) - 0.03;
        float wsum = max(1e-3, sa.r + sa.g + sa.b + sb.a);
        vec3 g = (uOwGrassCol[0] * sa.r + uOwGrassCol[1] * sa.g + uOwGrassCol[2] * (sa.b + sb.a)) / wsum;
        vGrTint = g * mix(0.8, 1.35, position.y) * (0.9 + 0.2 * h4);
        float fl = owHash(cell + 3.3);
        if (sa.r > 0.5 && fl < 0.05 && position.y > 0.72) vGrTint = fl < 0.017 ? vec3(0.95, 0.85, 0.3) : fl < 0.034 ? vec3(0.92, 0.9, 0.86) : vec3(0.62, 0.45, 0.85);`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrTint;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGrTint;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.name = 'grass tufts';
  mesh.receiveShadow = quality !== 'low'; mesh.castShadow = false;
  view.scene.add(mesh);
  return {
    mesh,
    stats: { slots, triangles: slots * base.getIndex().count / 3 },
    update(cam) {
      uGr.value.x = Math.floor(cam.x / G.spacing); uGr.value.y = Math.floor(cam.z / G.spacing);
      uGrCam.value.set(cam.x, cam.y, cam.z);
    },
  };
}
