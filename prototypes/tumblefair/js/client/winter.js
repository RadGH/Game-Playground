// Winter Fair (Expansion 1, M6, 2026-11-07): the shared snowy kit, used only while ctx.season === 'winter'
// (December 1 to January 6 in js/shared/seasons.js, or a host's preview). The winter twin of js/client/halloween.js.
//   * dressWinter(ctx, opts) — the dressing every ARENA game gets for free (play.js calls it): a crisp cold light (the
//     stage's two lights are TINTED and nudged, never switched off, and put back exactly on dispose), a pale winter sky,
//     a snow blanket that only lies OUTSIDE the play area, little snowmen and snowy evergreens round the edges, and
//     snowflakes drifting down over everything. Every repeated thing is ONE instanced mesh; no extra lights. A view can
//     steer it by returning `winter` from createView:
//       { spots: [[x, y, z], …] }  where the snowmen / trees stand   { blanket: false }  no snow blanket
//       { y: -0.4 }  ground height outside   { flakes: 0 }  no snowfall          false  no dressing (the game dresses itself)
//   * boardSnow(THREE, group, size) — snowfall + snow drifts for the board (boardview.js).
//   * winterWords(text) — board feed lines told the winter way ("Splat." -> a snowdrift).
//   * snowOverlay(ui) — gentle DOM snowflakes over a screen game (never tappable; css/games.css .wf-snow).
//   * snowfall(THREE, n, hw, hd, top, gy) — falling flakes for a 3D view: { mesh, frame(t, cameraQuaternion) }.
//   * builders a view's own reskin can use: snowmanGeo, giftGeo, treeGeo, flakeTexture, PALETTE.
// Family friendly and generic: snow, lights, gifts, cocoa, sleds, snowmen, a jolly gift-giver. No borrowed characters.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PALETTE = { sky: '#bcd8f0', snow: '#f4f8ff', ice: '#bfe3ff', shadow: '#a9c3dc', red: '#e8322a', green: '#2f9a4a', gold: '#ffd23f', cocoa: '#6b3a22', carrot: '#ff8a1a', ink: '#24303a' };

export { winterWords } from './winter-words.js';

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** A soft round snowflake dot (white, fading edge), for falling snow. */
export const flakeTexture = THREE => canvasTex(THREE, 32, 32, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,.85)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
/** A snowman of height ~3r standing on y = 0: three balls (no face — add one if you need it). */
export function snowmanGeo(THREE, r = 0.4) {
  const a = new THREE.SphereGeometry(r, 14, 10).translate(0, r * 0.9, 0), b = new THREE.SphereGeometry(r * 0.72, 14, 10).translate(0, r * 2.15, 0), c = new THREE.SphereGeometry(r * 0.5, 12, 9).translate(0, r * 3.0, 0);
  return mergeGeometries([a, b, c]);
}
/** An evergreen (three stacked cones on a trunk), height ~h, standing on y = 0. Vertex colours: green, brown trunk. */
export function treeGeo(THREE, h = 2) {
  const parts = [[new THREE.CylinderGeometry(h * 0.05, h * 0.06, h * 0.2, 6).translate(0, h * 0.1, 0), '#7a4a2a'],
    [new THREE.ConeGeometry(h * 0.34, h * 0.5, 9).translate(0, h * 0.42, 0), '#2f7a44'], [new THREE.ConeGeometry(h * 0.27, h * 0.42, 9).translate(0, h * 0.64, 0), '#348a4c'],
    [new THREE.ConeGeometry(h * 0.19, h * 0.34, 9).translate(0, h * 0.84, 0), '#3a9a54'], [new THREE.ConeGeometry(h * 0.1, h * 0.14, 9).translate(0, h * 0.98, 0), '#f4f8ff']];
  const gs = parts.map(([g, col]) => { g = g.toNonIndexed(); const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; });
  return mergeGeometries(gs);
}
/** A wrapped gift of size s (a cube with a ribbon cross and a bow), sitting on y = 0. Vertex colours: box, ribbon. */
export function giftGeo(THREE, s = 0.5, box = '#e8322a', ribbon = '#ffd23f') {
  const parts = [[new THREE.BoxGeometry(s, s, s).translate(0, s / 2, 0), box], [new THREE.BoxGeometry(s * 1.02, s * 1.02, s * 0.18).translate(0, s / 2, 0), ribbon],
    [new THREE.BoxGeometry(s * 0.18, s * 1.02, s * 1.02).translate(0, s / 2, 0), ribbon], [new THREE.TorusGeometry(s * 0.14, s * 0.05, 6, 10).rotateY(0.8).translate(-s * 0.1, s * 1.08, 0), ribbon],
    [new THREE.TorusGeometry(s * 0.14, s * 0.05, 6, 10).rotateY(-0.8).translate(s * 0.1, s * 1.08, 0), ribbon]];
  const gs = parts.map(([g, col]) => { g = g.toNonIndexed(); const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; });
  return mergeGeometries(gs);
}

/** Falling snow: n camera-facing flakes in a box (x ±hw, z ±hd, y 0..top) as one instanced mesh. Returns { mesh, frame }. */
export function snowfall(THREE, n, hw, hd, top, gy = 0) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: flakeTexture(THREE), transparent: true, depthWrite: false, opacity: 0.9 }), n);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  // fixed per-flake numbers from a little hash (no Math.random needed; it is only looks)
  const h = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const P = Array.from({ length: n }, (_, i) => [(h(i) * 2 - 1) * hw, (h(i + 1e3) * 2 - 1) * hd, h(i + 2e3) * top, 0.55 + h(i + 3e3) * 0.6, h(i + 4e3) * 6.28, 0.6 + h(i + 5e3) * 0.9]);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  return {
    mesh,
    frame(t, cq) {
      for (let i = 0; i < n; i++) {
        const [x, z, y0, sp, ph, s] = P[i], y = ((y0 - t * sp) % top + top) % top;
        m4.compose(v.set(x + Math.sin(t * 0.8 + ph) * 0.4, gy + y, z + Math.cos(t * 0.6 + ph) * 0.3), cq, sc.setScalar(s)); mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// one set of saved lights however many dressings overlap (a game replacing another for a moment)
const chill = { n: 0, saved: null };

export function dressWinter(ctx, opts = {}) {
  const { THREE, stage, group } = ctx, A = ctx.arena || ctx.meta.arena;
  const hw = A.shape === 'circle' ? A.r : A.hw, hd = A.shape === 'circle' ? A.r : A.hd, gy = opts.y ?? 0;
  const own = new THREE.Group(); own.name = 'winter'; group.add(own);
  // ---- a cold, bright light: tint the stage's lights (remembered and restored), a pale winter sky
  const scene = stage.scene, hemi = scene.children.find(o => o.isHemisphereLight), sun = stage.sun;
  if (!chill.n++) chill.saved = { bg: scene.background, hemi: hemi && [hemi.intensity, hemi.color.clone(), hemi.groundColor.clone()], sun: sun && [sun.intensity, sun.color.clone()] };
  let undone = false;
  scene.background = new THREE.Color(PALETTE.sky);
  if (hemi) { hemi.color.set('#eaf4ff'); hemi.groundColor.set('#b8cce0'); }
  if (sun) sun.color.set('#fff4e6');
  // ---- a snow blanket: clear over the arena (+1 m), white further out
  if (opts.blanket !== false) {
    const W = (hw + 24) * 2, D = (hd + 24) * 2, inX = (hw + 1.2) / (W / 2), inZ = (hd + 1.2) / (D / 2);
    const tex = canvasTex(THREE, 128, 128, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = Math.abs(x / (w - 1) * 2 - 1), v = Math.abs(y / (h - 1) * 2 - 1);
        const d = A.shape === 'circle' ? Math.max(0, Math.hypot(u / inX, v / inZ) - 1) : Math.hypot(Math.max(0, u / inX - 1), Math.max(0, v / inZ - 1));
        const a = Math.min(1, d * 2.2) * 0.92, i = (y * w + x) * 4, sp = ((x * 7 + y * 13) % 11 === 0) ? -12 : 0;
        img.data[i] = 240 + sp; img.data[i + 1] = 246 + sp; img.data[i + 2] = 255; img.data[i + 3] = a * 255;
      }
      g.putImageData(img, 0, 0);
    });
    const blanket = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
    blanket.position.y = gy + 0.08; blanket.renderOrder = 1; blanket.receiveShadow = true; own.add(blanket);
  }
  // ---- snowmen (with carrot noses, coal eyes and a red scarf) and snowy evergreens round the edges
  const spots = opts.spots || (A.shape === 'circle'
    ? [0.5, 1.2, 2.0, 2.6, 3.7, 4.4, 5.3].map(a => [Math.sin(a) * (hw + 1.9), gy, Math.cos(a) * (hw + 1.9)])
    : [[-hw * 0.78, gy, hd + 1.9], [-hw * 0.3, gy, hd + 2.2], [hw * 0.35, gy, hd + 2.0], [hw * 0.82, gy, hd + 1.8], [-hw - 1.8, gy, -hd - 1.5], [hw + 1.9, gy, -hd - 1.6], [-hw - 2.0, gy, 0.4], [hw + 2.0, gy, -0.6]]);
  const men = spots.filter((_, i) => i % 2 === 0), trees = spots.filter((_, i) => i % 2 === 1);
  const R = 0.34, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  const body = new THREE.InstancedMesh(snowmanGeo(THREE, R), new THREE.MeshStandardMaterial({ color: PALETTE.snow, roughness: 0.9 }), men.length);
  const nose = new THREE.InstancedMesh(new THREE.ConeGeometry(R * 0.12, R * 0.6, 6).rotateX(Math.PI / 2).translate(0, R * 3.0, R * 0.68), new THREE.MeshStandardMaterial({ color: PALETTE.carrot, roughness: 0.6 }), men.length);
  const scarf = new THREE.InstancedMesh(new THREE.TorusGeometry(R * 0.5, R * 0.13, 6, 14).rotateX(Math.PI / 2).translate(0, R * 2.6, 0), new THREE.MeshStandardMaterial({ color: PALETTE.red, roughness: 0.8 }), men.length);
  const eyes = new THREE.InstancedMesh(mergeGeometries([-1, 1].map(s => new THREE.SphereGeometry(R * 0.07, 6, 5).translate(s * R * 0.18, R * 3.12, R * 0.44))), new THREE.MeshBasicMaterial({ color: PALETTE.ink }), men.length);
  men.forEach(([x, y, z], i) => { m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, Math.atan2(-x, -z) * 0.3 + (i % 3 - 1) * 0.2, 0)), sc.setScalar(0.9 + (i % 3) * 0.12)); body.setMatrixAt(i, m4); nose.setMatrixAt(i, m4); scarf.setMatrixAt(i, m4); eyes.setMatrixAt(i, m4); });
  const pines = new THREE.InstancedMesh(treeGeo(THREE, 2.2), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), trees.length);
  trees.forEach(([x, y, z], i) => { m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, i * 1.3, 0)), sc.setScalar(0.85 + (i % 3) * 0.15)); pines.setMatrixAt(i, m4); });
  body.castShadow = pines.castShadow = true; own.add(body, nose, scarf, eyes, pines);
  // ---- snowfall over the arena and a little beyond
  const fall = opts.flakes === 0 ? null : snowfall(THREE, opts.flakes || 140, hw + 4, hd + 4, 9, gy);
  if (fall) own.add(fall.mesh);
  const cq = new THREE.Quaternion();
  return {
    frame(dt, t) { if (fall) { cq.copy(stage.camera.quaternion); fall.frame(t, cq); } },
    dispose() {
      if (undone) return; undone = true;
      if (--chill.n > 0) return;
      const saved = chill.saved; chill.saved = null;
      scene.background = saved.bg;
      if (hemi && saved.hemi) { hemi.intensity = saved.hemi[0]; hemi.color.copy(saved.hemi[1]); hemi.groundColor.copy(saved.hemi[2]); }
      if (sun && saved.sun) { sun.intensity = saved.sun[0]; sun.color.copy(saved.sun[1]); }
    },
  };
}

/** The board in winter: a light dusting of snow over the picture (only when there is no painted winter version),
 *  snowmen and evergreens round the edge, and snow falling over it. Returns { frame(t, camera), dispose }. */
export function boardSnow(THREE, group, size, { painted = false } = {}) {
  const own = new THREE.Group(); own.name = 'board-snow'; group.add(own);
  if (!painted) {
    const tex = canvasTex(THREE, 256, 256, (g, w) => {
      // soft white drifts: many overlapping blobs, densest at the edges of the board, never solid over the middle
      const h = i => { const x = Math.sin(i * 91.7 + 17.3) * 43758.5453; return x - Math.floor(x); };
      for (let i = 0; i < 520; i++) {
        const x = h(i) * w, y = h(i + 999) * w, edge = Math.max(Math.abs(x / w * 2 - 1), Math.abs(y / w * 2 - 1)), r = 4 + h(i + 77) * 14;
        const a = 0.08 + edge ** 3 * 0.5;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(250,253,255,${a})`); gr.addColorStop(1, 'rgba(250,253,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    const dust = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    dust.position.y = 0.02; own.add(dust);
  }
  const half = size / 2, spots = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.3; spots.push([Math.cos(a) * (half + 1.5), 0, Math.sin(a) * (half + 1.5)]); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const pines = new THREE.InstancedMesh(treeGeo(THREE, 3.2), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), spots.length);
  spots.forEach(([x, y, z], i) => { m4.compose(v.set(x, y, z), q, sc.setScalar(0.8 + (i % 3) * 0.2)); pines.setMatrixAt(i, m4); });
  own.add(pines);
  const fall = snowfall(THREE, 220, half, half, 12);
  own.add(fall.mesh);
  return { frame(t, camera) { fall.frame(t, camera.quaternion); }, dispose() { group.remove(own); } };
}

/** Gentle snowflakes drifting over a screen (ui) game. Never tappable; hidden with reduced motion. Returns the element. */
export function snowOverlay(ui, n = 16) {
  const el = document.createElement('div'); el.className = 'wf-snow'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--x:${(i * 61) % 100};--d:${-((i * 37) % 11)}s;--s:${5 + (i * 7) % 6}px;--t:${9 + (i * 13) % 7}s"></i>`).join('');
  ui.append(el); return el;
}
