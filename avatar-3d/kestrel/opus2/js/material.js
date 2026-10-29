// Kestrel (opus) — the one material every character shares. Vertex colours, plus a per-vertex roughness and glow read
// from the `kestrelSurf` attribute (x = roughness, y = glow), so skin, hair, eyes and cloth can differ inside ONE draw
// call. Built once per template; nothing about it is toggled afterwards (no shader recompiles at runtime).
import * as THREE from 'three';

export function kestrelMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.name = 'kestrel';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 kestrelSurf;\nvarying vec2 vKSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKSurf = kestrelSurf;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vKSurf;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(vKSurf.x, 0.04, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vKSurf.y * 0.55;');
  };
  m.customProgramCacheKey = () => 'kestrel-opus-1';
  return m;
}
