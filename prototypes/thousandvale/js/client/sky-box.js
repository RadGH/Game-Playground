// The painted sky (play-test 11, Z59 — live #60: "Add a beautiful skybox … Currently the sky always looks grey/overcast
// and has distance fog"). Six Codex-painted panoramas (assets/sky/*.webp + skies.json, tools/sky-art.py) on the inside
// of the sky dome, two at a time, crossfaded by sky-plan.js as the realm clock turns; the sun's glow drawn over them.
//
// THE rule: the land meets the painting with no seam. three adds fog AFTER tone mapping and colour conversion, so a
// fully fogged hill is the fog colour written straight to the screen. This shader therefore (1) shows the painting as
// painted (no tone mapping), and (2) fades the last few degrees above the horizon, and everything under it, into that
// SAME raw fog colour — and scene.js sets the fog to the painting's own horizon colour (sky-plan.js fogColourFor).
//
//   const box = createSkyBox({ base })          // base = URL of assets/sky/
//   box.mesh                                    // add to the scene (scene.js keeps it centred on the camera)
//   box.setPlan(plan)                           // sky-plan.js skyPlan(): which two pictures, how far between
//   box.setSun(dir, strength)                   // the glow round the sun (or moon) — 0 hides it
//   box.ready                                   // true once the first picture is on show
//   box.fog -> [r, g, b] | null                 // the fog colour the current blend wants
//
// Nothing is compiled after boot: ONE shader for every sky (pictures are uniforms). Pictures load lazily (the one the
// clock needs, then its neighbour) and at most four are kept; the gradient dome stays as the fallback until one loads.

import * as THREE from 'three';
import { fogColourFor } from './sky-plan.js';

const KEEP = 4;            // pictures kept on the GPU (preloadAll lifts it)

export function createSkyBox({ base, radius = 2000, gradient = null } = {}) {
  const loader = new THREE.TextureLoader();
  const tex = new Map();          // id -> { t: Texture|null, p: Promise, used: number }
  let skies = null;               // skies.json `skies`
  const blank = new THREE.DataTexture(new Uint8Array([200, 217, 230, 255]), 1, 1); blank.needsUpdate = true; blank.colorSpace = THREE.SRGBColorSpace;
  const uniforms = {
    tA: { value: blank }, tB: { value: blank }, uK: { value: 0 }, uHA: { value: 0.9 }, uHB: { value: 0.9 },
    uFog: { value: new THREE.Vector3(0.79, 0.85, 0.9) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunK: { value: 1 },
    uReady: { value: 0 },
    // the old gradient, used until a picture has loaded (and in a test with no pictures)
    uZenith: { value: gradient?.zenith || new THREE.Color('#3f6fb3') }, uHorizon: { value: gradient?.horizon || new THREE.Color('#c9d9e6') },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vDir = w.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: `
      uniform sampler2D tA, tB; uniform float uK, uHA, uHB, uSunK, uReady; uniform vec3 uFog, uSun, uZenith, uHorizon;
      varying vec3 vDir;
      #define PI 3.14159265
      vec3 pic(sampler2D t, float hv, float u, float e){
        // the picture's horizon row is at hv (0 top .. 1 bottom), its top row the zenith; linear in elevation between
        float v = hv * (1.0 - e);
        return texture2D(t, vec2(u, 1.0 - v)).rgb;
      }
      void main(){
        vec3 d = normalize(vDir);
        float e = clamp(asin(clamp(d.y, -1.0, 1.0)) / (PI * 0.5), 0.0, 1.0);
        float u = atan(d.x, -d.z) / (2.0 * PI) + 0.5;
        // owner 2026-10-16 "a tearing effect seam in the skybox": u jumps 1 -> 0 behind the camera, the screen-space
        // derivative there is huge and the GPU samples the smallest mip for a one-pixel line. Where u jumps, the same
        // direction as u+0.5 (shifted) is continuous — use whichever changes less across the pixel (wrapS repeats).
        float uB = fract(u + 0.5) - 0.5;
        if (fwidth(uB) < fwidth(u) - 0.0001) u = uB;
        vec3 c;
        if (uReady > 0.5) {
          c = pic(tA, uHA, u, e);
          if (uK > 0.001) c = mix(c, pic(tB, uHB, u, e), uK);
        } else {
          c = d.y > 0.0 ? mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.55)) : uHorizon;
        }
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.16) * uSunK;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        // the land meets the painting: the last few degrees, and everything under the horizon, become the RAW fog colour
        // (three writes fogged geometry as that colour after its own colour conversion)
        gl_FragColor.rgb = mix(uFog, gl_FragColor.rgb, smoothstep(-0.005, 0.075, d.y));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
  mesh.frustumCulled = false; mesh.renderOrder = -10; mesh.name = 'sky-box';

  const manifest = fetch(new URL('skies.json', base)).then(r => (r.ok ? r.json() : null)).then(j => { skies = j?.skies || null; return skies; }).catch(() => null);
  let plan = null, fog = null, ready = false, keep = KEEP;
  const stats = { loads: 0, failed: 0, disposed: 0, shown: null };

  function want(id) {
    let rec = tex.get(id);
    if (rec) { rec.used = performance.now(); return rec; }
    rec = { t: null, used: performance.now(), p: null };
    tex.set(id, rec);
    rec.p = manifest.then(sk => {
      const row = sk?.[id]; if (!row) return null;
      return new Promise(res => loader.load(new URL(row.file, base).href, t => {
        t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
        t.anisotropy = 4; rec.t = t; stats.loads++; res(t); apply();
      }, undefined, () => { stats.failed++; res(null); }));
    });
    // keep the newest few
    if (tex.size > keep) {
      const old = [...tex.entries()].filter(([k]) => k !== id && k !== plan?.a && k !== plan?.b).sort((a, b) => a[1].used - b[1].used)[0];
      if (old) { old[1].t?.dispose(); tex.delete(old[0]); stats.disposed++; }
    }
    return rec;
  }
  function apply() {
    if (!plan || !skies) return;
    const A = tex.get(plan.a)?.t, B = tex.get(plan.b)?.t;
    if (!A) { uniforms.uReady.value = B ? 1 : 0; if (B) { uniforms.tA.value = B; uniforms.uHA.value = skies[plan.b].horizonV; uniforms.uK.value = 0; ready = true; } return; }
    uniforms.tA.value = A; uniforms.uHA.value = skies[plan.a].horizonV;
    if (B && plan.b !== plan.a) { uniforms.tB.value = B; uniforms.uHB.value = skies[plan.b].horizonV; uniforms.uK.value = plan.k; }
    else uniforms.uK.value = 0;
    uniforms.uReady.value = 1; ready = true;
    // the fog follows what is actually on show (a picture still loading does not pull it)
    fog = fogColourFor({ a: plan.a, b: B ? plan.b : plan.a, k: B ? plan.k : 0 }, skies);
    if (fog) uniforms.uFog.value.set(fog[0], fog[1], fog[2]);
    stats.shown = { a: plan.a, b: B ? plan.b : plan.a, k: +uniforms.uK.value.toFixed(3) };
  }

  return {
    mesh, material, uniforms, stats,
    get ready() { return ready; },
    get fog() { return ready ? fog : null; },
    get skies() { return skies; },
    manifest,
    /** sky-plan.js skyPlan() output. */
    setPlan(p) {
      plan = p;
      want(p.a); if (p.b !== p.a) want(p.b);
      apply();
    },
    /** The fog colour the scene wants when the painting is NOT ready (the gradient fallback): keep the dome matching it. */
    setFallbackFog(rgb) { if (!ready && rgb) uniforms.uFog.value.set(rgb[0], rgb[1], rgb[2]); },
    setSun(dir, k = 1) { uniforms.uSun.value.copy(dir); uniforms.uSunK.value = k; },
    /** Load every picture now (the spec's look at several times of day; a cold start that knows it will need them). */
    preloadAll() { keep = 8; return manifest.then(sk => Promise.all(Object.keys(sk || {}).map(id => want(id).p))); },
    dispose() { for (const r of tex.values()) r.t?.dispose(); tex.clear(); material.dispose(); mesh.geometry.dispose(); },
  };
}
