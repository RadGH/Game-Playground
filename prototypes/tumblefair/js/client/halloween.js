// Halloween (round 6, 2026-10-22): the shared spooky-cute kit for minigames, used only while ctx.season === 'halloween'.
//   * dressArena(ctx, opts) — the dressing every ARENA game gets for free (play.js calls it): dusk light (the stage's
//     two lights are DIMMED and tinted, never switched off, and put back exactly on dispose), a deep purple sky, a
//     purple ground mist that only lies OUTSIDE the play area, a few jack-o'-lanterns with a warm glow on the ground,
//     bats circling high over the edges and little ghosts bobbing beyond the back corners. Everything repeated is ONE
//     instanced mesh; no extra lights. A view can steer it by returning `halloween` from createView:
//       { spots: [[x, y, z], …] }  where the pumpkins stand (default: along the front and back edges, outside)
//       { ghosts: [[x, y, z], …] } where the ghosts bob   { mist: false }  no mist   { y: -0.4 }  ground height outside
//       false                      no dressing at all (the game dresses itself)
//   * builders a view's own reskin can use: pumpkinGeo, faceTexture, ghostGeo, witchHatGeo, glowTexture, spriteTexture
//     ('bat' | 'ghost' | 'candy'), PALETTE.
// Family friendly: everything is round, smiling and soft. Nothing has teeth.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PALETTE = { night: '#1d1430', dusk: '#3a2160', purple: '#7a3cc8', orange: '#ff8a1a', pumpkin: '#ff7a14', slime: '#7dff5a', candle: '#ffd36b', bone: '#f4ecd8', ink: '#1a0f26' };

/** A round ribbed pumpkin of radius r (squashed a little), centre at the origin. */
export function pumpkinGeo(THREE, r = 0.5, ribs = 8) {
  const g = new THREE.SphereGeometry(r, 20, 14), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), k = 1 + 0.07 * Math.cos(a * ribs);
    p.setXYZ(i, v.x * k, v.y * 0.78 * (1 - 0.12 * Math.abs(v.y / r) ** 3), v.z * k);
  }
  g.computeVertexNormals(); return g;
}
/** A pumpkin's stem, sitting on top of pumpkinGeo(r). */
export const stemGeo = (THREE, r = 0.5) => new THREE.CylinderGeometry(r * 0.09, r * 0.13, r * 0.36, 6).translate(0, r * 0.84, 0);
/** A friendly ghost: a rounded bell (radius r, height ~2r) standing on y = 0. */
export function ghostGeo(THREE, r = 0.5) {
  const pts = [[0, 2.0], [0.42, 1.92], [0.72, 1.66], [0.9, 1.25], [0.94, 0.7], [1.0, 0.18], [0.86, 0.02], [0, 0.08]].map(([x, y]) => new THREE.Vector2(x * r, y * r));
  return new THREE.LatheGeometry(pts, 18);
}
/** A witch hat (cone with a bent tip + brim), brim at y = 0, radius r. */
export function witchHatGeo(THREE, r = 0.35) {
  const brim = new THREE.CylinderGeometry(r, r, r * 0.08, 16);
  const cone = new THREE.ConeGeometry(r * 0.52, r * 1.6, 12).translate(0, r * 0.8, 0);
  const tip = new THREE.ConeGeometry(r * 0.2, r * 0.6, 8).rotateZ(-0.9).translate(r * 0.2, r * 1.65, 0);
  const band = new THREE.CylinderGeometry(r * 0.53, r * 0.53, r * 0.16, 12).translate(0, r * 0.12, 0);
  const m = mergeGeometries([brim, cone, tip, band].map(g => g.toNonIndexed()));
  m.computeVertexNormals(); return m;
}
function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** A carved jack-o'-lantern face (warm light on transparent), for a plane in front of a pumpkin. Smiling, no teeth. */
export function faceTexture(THREE) {
  return canvasTex(THREE, 128, 128, (g, w, h) => {
    g.fillStyle = PALETTE.candle; g.shadowColor = '#ffb020'; g.shadowBlur = 10;
    const tri = (x, y, s) => { g.beginPath(); g.moveTo(x - s, y + s * 0.6); g.lineTo(x + s, y + s * 0.6); g.lineTo(x, y - s * 0.8); g.closePath(); g.fill(); };
    tri(40, 50, 15); tri(88, 50, 15);
    g.beginPath(); g.moveTo(26, 76); g.quadraticCurveTo(64, 120, 102, 76); g.quadraticCurveTo(64, 96, 26, 76); g.fill();
  });
}
/** A soft round glow (white centre, fading), tinted by the material colour; use with AdditiveBlending. */
export function glowTexture(THREE) {
  return canvasTex(THREE, 64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
}
/** Flat cartoon sprites: 'bat' (wings out), 'ghost' (smiling sheet ghost), 'candy' (a wrapped sweet). */
export function spriteTexture(THREE, kind) {
  return canvasTex(THREE, 128, 128, (g) => {
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (kind === 'bat') {
      g.fillStyle = '#2a1840'; g.beginPath(); g.moveTo(64, 52);
      g.quadraticCurveTo(40, 26, 6, 40); g.quadraticCurveTo(20, 50, 18, 66); g.quadraticCurveTo(30, 58, 38, 70); g.quadraticCurveTo(48, 62, 56, 76);
      g.lineTo(72, 76); g.quadraticCurveTo(80, 62, 90, 70); g.quadraticCurveTo(98, 58, 110, 66); g.quadraticCurveTo(108, 50, 122, 40); g.quadraticCurveTo(88, 26, 64, 52); g.fill();
      g.beginPath(); g.arc(64, 62, 14, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(54, 52); g.lineTo(52, 40); g.lineTo(60, 49); g.moveTo(74, 52); g.lineTo(76, 40); g.lineTo(68, 49); g.fill();
      g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(58, 60, 3.5, 0, 7); g.arc(70, 60, 3.5, 0, 7); g.fill();
    } else if (kind === 'ghost') {
      g.fillStyle = '#f7f3ff'; g.strokeStyle = '#3a2160'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(26, 112); g.lineTo(26, 58); g.bezierCurveTo(26, 14, 102, 14, 102, 58); g.lineTo(102, 112);
      for (let i = 0; i < 4; i++) { const x = 102 - i * 19; g.quadraticCurveTo(x - 5, 100, x - 9.5, 112); g.quadraticCurveTo(x - 14, 124, x - 19, 112); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#3a2160'; g.beginPath(); g.ellipse(50, 58, 6, 9, 0, 0, 7); g.ellipse(78, 58, 6, 9, 0, 0, 7); g.fill();
      g.fillStyle = '#ff9ec8'; g.globalAlpha = 0.7; g.beginPath(); g.arc(42, 74, 6, 0, 7); g.arc(86, 74, 6, 0, 7); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = '#3a2160'; g.lineWidth = 4; g.beginPath(); g.arc(64, 72, 8, 0.3, Math.PI - 0.3); g.stroke();
    } else {
      g.fillStyle = '#ff8a1a'; g.strokeStyle = '#3a2160'; g.lineWidth = 5;
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(64 + sx * 26, 64); g.lineTo(64 + sx * 56, 40); g.lineTo(64 + sx * 50, 64); g.lineTo(64 + sx * 56, 88); g.closePath(); g.fill(); g.stroke(); }
      g.beginPath(); g.ellipse(64, 64, 30, 24, 0, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.moveTo(50, 50); g.lineTo(78, 78); g.stroke();
    }
  });
}

const dusk = { n: 0, saved: null };
/**
 * The shared arena dressing. ctx is the play ctx (THREE, stage, group, arena, meta); opts is what the view returned as
 * `halloween` (see the header). Returns { frame(dt, t), dispose() } — dispose puts the stage's lights and sky back.
 */
export function dressArena(ctx, opts = {}) {
  const { THREE, stage, group } = ctx, A = ctx.arena || ctx.meta.arena;
  const hw = A.shape === 'circle' ? A.r : A.hw, hd = A.shape === 'circle' ? A.r : A.hd, gy = opts.y ?? 0;
  const own = new THREE.Group(); own.name = 'halloween'; group.add(own);
  // ---- dusk: dim and tint the stage's lights (remembered and restored), a purple sky
  const scene = stage.scene, hemi = scene.children.find(o => o.isHemisphereLight), sun = stage.sun;
  // remembered once, while no other dressing is up (two games can overlap for a moment as one replaces the other)
  if (!dusk.n++) dusk.saved = { bg: scene.background, hemi: hemi && [hemi.intensity, hemi.color.clone(), hemi.groundColor.clone()], sun: sun && [sun.intensity, sun.color.clone()] };
  let undone = false;
  scene.background = new THREE.Color(PALETTE.night);
  if (hemi) { hemi.intensity = 1.35; hemi.color.set('#c2b0ff'); hemi.groundColor.set('#3d2a5c'); }
  if (sun) { sun.intensity = 1.75; sun.color.set('#ffb98a'); }
  // ---- ground mist: a big plane, clear over the arena (+1 m), thickening to a soft purple further out
  let mist = null;
  if (opts.mist !== false) {
    const W = (hw + 22) * 2, D = (hd + 22) * 2, inX = (hw + 1.2) / (W / 2), inZ = (hd + 1.2) / (D / 2);
    const tex = canvasTex(THREE, 128, 128, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = Math.abs(x / (w - 1) * 2 - 1), v = Math.abs(y / (h - 1) * 2 - 1);
        const d = A.shape === 'circle' ? Math.max(0, Math.hypot(u / inX, v / inZ) - 1) : Math.hypot(Math.max(0, u / inX - 1), Math.max(0, v / inZ - 1));
        const a = Math.min(1, d * 1.6) * 0.62 * Math.min(1, (1 - Math.max(u, v)) * 6);
        const i = (y * w + x) * 4; img.data[i] = 92; img.data[i + 1] = 52; img.data[i + 2] = 150; img.data[i + 3] = a * 255;
      }
      g.putImageData(img, 0, 0);
    });
    mist = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mist.position.y = gy + 0.09; mist.renderOrder = 1; own.add(mist);
  }
  // ---- jack-o'-lanterns: instanced body + stem + face + ground glow
  const spots = opts.spots || (A.shape === 'circle'
    ? [0.5, 1.2, 2.0, 2.6, 3.7, 4.4, 5.3].map(a => [Math.sin(a) * (hw + 1.7), gy, Math.cos(a) * (hw + 1.7)])
    : [[-hw * 0.78, gy, hd + 1.8], [-hw * 0.3, gy, hd + 2.1], [hw * 0.35, gy, hd + 1.9], [hw * 0.82, gy, hd + 1.7], [-hw - 1.7, gy, -hd - 1.4], [hw + 1.8, gy, -hd - 1.5], [-hw - 1.9, gy, 0.4], [hw + 1.9, gy, -0.6]]);
  const n = spots.length, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  const R = 0.42;
  const bodies = new THREE.InstancedMesh(pumpkinGeo(THREE, R), new THREE.MeshStandardMaterial({ color: PALETTE.pumpkin, roughness: 0.55, emissive: '#b33a00', emissiveIntensity: 0.35 }), n);
  const stems = new THREE.InstancedMesh(stemGeo(THREE, R), new THREE.MeshStandardMaterial({ color: '#4c7a2a', roughness: 0.8 }), n);
  const faces = new THREE.InstancedMesh(new THREE.PlaneGeometry(R * 1.3, R * 1.3), new THREE.MeshBasicMaterial({ map: faceTexture(THREE), transparent: true, depthWrite: false, toneMapped: false }), n);
  const glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(THREE), color: '#ff9a3a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), n);
  const scl = [];
  spots.forEach(([x, y, z], i) => {
    const s = 0.85 + ((i * 0.37) % 1) * 0.5; scl.push(s);
    m4.compose(v.set(x, y + R * 0.78 * s, z), q.setFromEuler(e.set(0, (i % 3 - 1) * 0.15, 0)), sc.setScalar(s)); bodies.setMatrixAt(i, m4); stems.setMatrixAt(i, m4);
    m4.compose(v.set(x, y + R * 0.82 * s, z + R * 1.12 * s), q.identity(), sc.setScalar(s)); faces.setMatrixAt(i, m4);
    m4.compose(v.set(x, y + 0.11, z + 0.2), q.identity(), sc.setScalar(s)); glows.setMatrixAt(i, m4);
  });
  bodies.castShadow = true; own.add(bodies, stems, faces, glows);
  // ---- bats circling high over the edges, ghosts bobbing beyond the back corners (camera-facing sprites)
  const NB = 6, bats = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: spriteTexture(THREE, 'bat'), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), NB);
  const gspots = opts.ghosts || (A.shape === 'circle' ? [[-hw - 2.4, 1.2, -hd * 0.4], [hw + 2.2, 1.4, -hd * 0.6], [0.5, 1.6, -hd - 2.6]] : [[-hw - 1.4, 1.3, -hd - 2.4], [hw + 1.2, 1.6, -hd - 2.8], [hw * 0.15, 1.9, -hd - 3.4]]);
  const ghosts = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: spriteTexture(THREE, 'ghost'), transparent: true, alphaTest: 0.2, depthWrite: false, opacity: 0.9 }), gspots.length);
  own.add(bats, ghosts);
  const cq = new THREE.Quaternion();
  return {
    frame(dt, t) {
      cq.copy(stage.camera.quaternion);
      for (let i = 0; i < NB; i++) {
        const sp = 0.35 + (i % 3) * 0.08, a = t * sp * (i % 2 ? 1 : -1) + i * 1.05, rx = hw + 2.2 + (i % 2) * 1.2, rz = hd + 2.0 + (i % 3) * 0.8;
        const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + i * 1.7));
        m4.compose(v.set(Math.cos(a) * rx, gy + 4.2 + Math.sin(t * 1.3 + i) * 0.5 + (i % 3) * 0.6, Math.sin(a) * rz), cq, sc.set(flap * (0.7 + (i % 2) * 0.25), 0.7 + (i % 2) * 0.25, 1));
        bats.setMatrixAt(i, m4);
      }
      bats.instanceMatrix.needsUpdate = true;
      gspots.forEach(([x, y, z], i) => { m4.compose(v.set(x + Math.sin(t * 0.7 + i * 2) * 0.35, gy + y + Math.sin(t * 1.6 + i * 1.3) * 0.25, z), cq, sc.setScalar(1 + (i % 2) * 0.2)); ghosts.setMatrixAt(i, m4); });
      ghosts.instanceMatrix.needsUpdate = true;
      const fl = 0.5 + 0.08 * Math.sin(t * 7) + 0.05 * Math.sin(t * 13.3);       // candle flicker: dims, never goes out
      glows.material.opacity = fl; bodies.material.emissiveIntensity = 0.3 + fl * 0.12;
    },
    dispose() {
      if (undone) return; undone = true;
      if (--dusk.n > 0) return;
      const saved = dusk.saved; dusk.saved = null;
      scene.background = saved.bg;
      if (hemi && saved.hemi) { hemi.intensity = saved.hemi[0]; hemi.color.copy(saved.hemi[1]); hemi.groundColor.copy(saved.hemi[2]); }
      if (sun && saved.sun) { sun.intensity = saved.sun[0]; sun.color.copy(saved.sun[1]); }
    },
  };
}
