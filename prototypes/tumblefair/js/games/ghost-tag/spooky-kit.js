// Spooky-cute pieces the Halloween minigames share (Ghost Tag, Trick-or-Treat Street). Browser only (views).
//   const kit = spookyKit(ctx)     -> { night(), sheetGhost(opts), jackOLantern(r, opts), glowSprite(color, size), faceTex, dispose() }
//   kit.night()                    dims the shared stage to a friendly moonlit night (purple sky, bright enough to read
//                                  every character); dispose() puts the stage's lights and background back exactly.
//                                  Lights are only DIMMED and recoloured, never switched off or added (phones recompile
//                                  every shader when the light count changes).
//   kit.sheetGhost({ color, eyes }) a cartoon bedsheet ghost: a lathe bell with a wavy hem, two big oval eyes and an "o"
//                                  mouth, ~1.3 m tall, origin at the hem. Returns a THREE.Group with .userData.mat.
//   kit.jackOLantern(r, { glow })  a ribbed pumpkin with a happy carved face that glows (emissive), facing +z.
import { canvasTexture } from '../../client/stage.js';

export function spookyKit(ctx) {
  const { THREE, stage } = ctx;
  const mats = [], geos = [], texs = [];
  const own = (list, x) => { list.push(x); return x; };
  let restore = null;

  function night({ sky = '#2a1f55', hemi = '#b7a6ff', ground = '#3a2c66', hemiI = 1.35, moon = '#d6dcff', moonI = 1.25 } = {}) {
    if (restore) return;
    const scene = stage.scene, h = scene.children.find(o => o.isHemisphereLight), sun = stage.sun;
    const was = { bg: scene.background?.clone?.() ?? scene.background, h: h && { c: h.color.clone(), g: h.groundColor.clone(), i: h.intensity }, s: sun && { c: sun.color.clone(), i: sun.intensity } };
    scene.background = new THREE.Color(sky);
    if (h) { h.color.set(hemi); h.groundColor.set(ground); h.intensity = hemiI; }
    if (sun) { sun.color.set(moon); sun.intensity = moonI; }
    restore = () => {
      scene.background = was.bg;
      if (h && was.h) { h.color.copy(was.h.c); h.groundColor.copy(was.h.g); h.intensity = was.h.i; }
      if (sun && was.s) { sun.color.copy(was.s.c); sun.intensity = was.s.i; }
    };
  }

  // ---- the carved face, drawn once: colour map (orange skin, dark holes) + glow map (only the holes light up)
  const FACE = (c, w, h, glow) => {
    c.fillStyle = glow ? '#000' : '#ff8a1f'; c.fillRect(0, 0, w, h);
    if (!glow) { c.strokeStyle = 'rgba(160,60,0,.45)'; c.lineWidth = 6; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, h); c.stroke(); } }
    const cx = w * 0.25, cy = h * 0.52, s = h / 128;                       // u = 0.25 faces +z on a SphereGeometry
    c.fillStyle = glow ? '#fff' : '#3a1600';
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(cx + sx * 18 * s, cy - 22 * s); c.lineTo(cx + sx * 6 * s, cy - 6 * s); c.lineTo(cx + sx * 30 * s, cy - 6 * s); c.closePath(); c.fill(); }
    c.beginPath(); c.moveTo(cx, cy - 2 * s); c.lineTo(cx - 5 * s, cy + 6 * s); c.lineTo(cx + 5 * s, cy + 6 * s); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx - 34 * s, cy + 10 * s); c.quadraticCurveTo(cx, cy + 44 * s, cx + 34 * s, cy + 10 * s); c.quadraticCurveTo(cx, cy + 26 * s, cx - 34 * s, cy + 10 * s); c.fill();
    if (!glow) { c.fillStyle = '#ff8a1f'; c.fillRect(cx - 12 * s, cy + 18 * s, 7 * s, 8 * s); c.fillRect(cx + 6 * s, cy + 18 * s, 7 * s, 8 * s); }       // two teeth
  };
  const faceTex = own(texs, canvasTexture(512, 128, (c, w, h) => FACE(c, w, h, false)));
  const glowTex = own(texs, canvasTexture(512, 128, (c, w, h) => FACE(c, w, h, true)));
  const pumpkinGeo = own(geos, (() => { const g = new THREE.SphereGeometry(1, 20, 14), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), rib = 1 + 0.07 * Math.cos(a * 8); p.setXYZ(i, x * rib, y * 0.78, z * rib); }
    g.computeVertexNormals(); return g; })());
  const stemGeo = own(geos, new THREE.CylinderGeometry(0.07, 0.11, 0.3, 6));
  const stemMat = own(mats, new THREE.MeshStandardMaterial({ color: '#4f7a2a', roughness: 0.9 }));
  /** glow: 0..1 (how brightly the face shines). Each pumpkin gets its own material so it can dim on its own. */
  function jackOLantern(r = 0.5, { glow = 1, color = '#ff8a1f' } = {}) {
    const g = new THREE.Group();
    const mat = own(mats, new THREE.MeshStandardMaterial({ color, map: faceTex, emissive: '#ffb02e', emissiveMap: glowTex, emissiveIntensity: 1.6 * glow, roughness: 0.7 }));
    const body = new THREE.Mesh(pumpkinGeo, mat); body.scale.setScalar(r); body.position.y = r * 0.78; body.castShadow = true; g.add(body);
    const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = r * 1.56 + 0.1; stem.rotation.z = 0.25; stem.scale.setScalar(Math.max(0.6, r * 1.4)); g.add(stem);
    g.userData.mat = mat; g.userData.body = body;
    return g;
  }

  // ---- the bedsheet ghost
  const ghostGeo = own(geos, (() => {
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; const y = 1.3 - t * 1.3; const r = t < 0.45 ? Math.sin(t / 0.45 * Math.PI / 2) * 0.5 : 0.5 + (t - 0.45) * 0.28; pts.push(new THREE.Vector2(Math.max(0.001, r), y)); }
    const g = new THREE.LatheGeometry(pts.reverse(), 28), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.18) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y + (0.18 - y) / 0.18 * 0.09 * Math.sin(a * 7)); } }
    g.computeVertexNormals(); return g;
  })());
  const eyeGeo = own(geos, new THREE.CircleGeometry(1, 16));
  const eyeMat = own(mats, new THREE.MeshBasicMaterial({ color: '#241a3d' }));
  function sheetGhost({ color = '#f4f1ff', opacity = 0.92, scale = 1 } = {}) {
    const g = new THREE.Group();
    const mat = own(mats, new THREE.MeshStandardMaterial({ color, emissive: '#bfd8ff', emissiveIntensity: 0.45, roughness: 0.6, transparent: opacity < 1, opacity, side: THREE.DoubleSide }));
    const sheet = new THREE.Mesh(ghostGeo, mat); sheet.castShadow = true; g.add(sheet);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.scale.set(0.1, 0.14, 1); e.position.set(sx * 0.16, 1.02, 0.45); e.rotation.set(-0.35, sx * 0.3, 0); g.add(e); }
    const mouth = new THREE.Mesh(eyeGeo, eyeMat); mouth.scale.set(0.06, 0.07, 1); mouth.position.set(0, 0.8, 0.5); mouth.rotation.x = -0.2; g.add(mouth);
    for (const sx of [-1, 1]) { const ch = new THREE.Mesh(eyeGeo, own(mats, new THREE.MeshBasicMaterial({ color: '#ff9ec7', transparent: true, opacity: 0.6 }))); ch.scale.set(0.06, 0.04, 1); ch.position.set(sx * 0.27, 0.84, 0.43); ch.rotation.y = sx * 0.5; g.add(ch); }
    g.scale.setScalar(scale); g.userData.mat = mat;
    return g;
  }

  // ---- a soft round glow (additive sprite) for lamps, doors, ghosts
  const glowSpriteTex = own(texs, canvasTexture(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); }));
  function glowSprite(color = '#ffcc66', size = 1.5, opacity = 0.8) {
    const m = own(mats, new THREE.SpriteMaterial({ map: glowSpriteTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
  }

  return {
    night, jackOLantern, sheetGhost, glowSprite, faceTex, glowSpriteTex,
    dispose() { restore?.(); restore = null; for (const t of texs) t.dispose(); for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); },
  };
}
