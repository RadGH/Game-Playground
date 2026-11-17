// Street furniture for Arcline (owner report #71, 2026-11-16: "Add street lights and neon sign/billboards especially in
// commercial areas"). Small pieces the game stands on the edge of road tiles; they light up at night through the
// usual lights picture (glow materials), so they cost nothing extra once baked.
//
//   'st-lamp'      a slim alloy street light. The arm reaches along +x (the game turns it so the arm hangs over the
//                  road). kind 0 = one arm (streets), 1 = two arms (avenues and highways: the post stands on the median).
//   'st-billboard' a roadside sign whose face is across +x (both broad faces carry the picture: drivers see it from
//                  either way). kind 0 = a wide billboard on two legs, 1 = a tall neon blade sign on one post.
//                  hue 0..5 picks the neon colour, seed the pattern. Word-free patterns only (no text, no brands).
// Anchor: the model's origin (0, 0, 0) is the foot of the post — the game puts it where it wants the post.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { box, cyl, bodyMat, neonMat } from './shapes.js';
import { rng } from './rng.js';

export const STREET_HUES = ['#ff4fd8', '#3ff0ff', '#ffb02e', '#7dff8a', '#b77dff', '#ff6a5a'];
const alloy = () => bodyMat('graphite', 0, { color: '#2c323d', metal: 0.7, rough: 0.35 });

const adCache = new Map();
/** A glowing billboard face: dark panel, a neon frame and abstract shapes (bars, a disc, a wave) in two colours. */
function adMat(hue, seed, tall) {
  const key = `${hue}:${seed % 6}:${tall}:2`;
  if (adCache.has(key)) return adCache.get(key);
  const R = rng(seed * 31 + hue * 7 + (tall ? 3 : 0)), a = STREET_HUES[hue % 6], b = STREET_HUES[(hue + 2 + (seed % 3)) % 6];
  const w = tall ? 48 : 128, h = tall ? 160 : 64, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#141836'); bg.addColorStop(1, '#2a1748'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.22; g.fillStyle = a; g.fillRect(0, 0, w, h);   // a wash of its colour, so it reads as lit from far off
  g.globalAlpha = 0.9;
  if (tall) {
    for (let y = 14; y < h - 14; y += 18) { g.fillStyle = R() < 0.5 ? a : b; g.fillRect(10, y, R.int(14, w - 20), 10); }
  } else {
    g.fillStyle = b; g.beginPath(); g.arc(w * 0.22, h * 0.5, h * 0.26, 0, Math.PI * 2); g.fill();
    g.strokeStyle = a; g.lineWidth = 5; g.beginPath();
    for (let x = w * 0.42; x < w - 10; x += 2) g.lineTo(x, h * 0.5 + Math.sin(x * 0.18 + seed) * h * 0.16);
    g.stroke();
    g.fillStyle = a; for (let k = 0; k < 3; k++) g.fillRect(w * 0.44 + k * 22, h * 0.76, 14, 6);
  }
  g.globalAlpha = 1; g.strokeStyle = a; g.lineWidth = 4; g.strokeRect(3, 3, w - 6, h - 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.5 });
  m.userData.glow = true; m.userData.dayGlow = 0.6;
  adCache.set(key, m); return m;
}
/** A flat panel (face across x) carrying the picture on both broad faces, the rim in alloy. */
function panel(g, w, h, d, face, rim, y, x = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), [face, face, rim, rim, rim, rim]);
  m.position.set(x, y + h / 2, 0); m.castShadow = true; g.add(m); return m;
}

addRecipes({
  'st-lamp': {
    name: 'Street Light', group: 'services', size: [1, 1], noStyle: true,
    blurb: 'Stands at the edge of a road every few tiles; the head and a cyan band at its foot light up at night.',
    params: [{ key: 'kind', label: 'Arms', min: 0, max: 1, step: 1, def: 0, names: ['One (street)', 'Two (avenue median)'] }],
    build(p) {
      const g = new THREE.Group(), steel = alloy(), head = neonMat('#ffe6b0', 0.08), band = neonMat('#5ff2ff', 0.25);
      const H = 0.62;
      cyl(g, 0.03, 0.025, steel, 0, 0, 0, { seg: 10 });                 // footing
      cyl(g, 0.012, H, steel, 0, 0.02, 0, { rt: 0.008, seg: 8 });       // pole
      box(g, 0.03, 0.012, 0.03, band, 0, 0.06, 0);                      // glowing band near the foot
      for (const s of p.kind ? [1, -1] : [1]) {
        box(g, 0.2, 0.012, 0.012, steel, s * 0.1, H, 0);                 // arm over the road
        box(g, 0.075, 0.018, 0.034, steel, s * 0.19, H - 0.012, 0);       // lamp housing
        box(g, 0.06, 0.006, 0.026, head, s * 0.19, H - 0.02, 0);          // the light, facing down
      }
      return g;
    },
  },
  'st-billboard': {
    name: 'Neon Sign', group: 'services', size: [1, 1], noStyle: true,
    blurb: 'Commercial streets get roadside billboards and tall neon blade signs; they glow by day and blaze at night.',
    params: [
      { key: 'kind', label: 'Kind', min: 0, max: 1, step: 1, def: 0, names: ['Billboard', 'Blade sign'] },
      { key: 'hue', label: 'Colour', min: 0, max: 5, step: 1, def: 0, names: ['Magenta', 'Cyan', 'Amber', 'Green', 'Violet', 'Red'] },
    ],
    build(p) {
      const g = new THREE.Group(), steel = alloy(), rim = alloy(), hue = p.hue | 0;
      const glow = neonMat(STREET_HUES[hue % 6], 0.4);
      if (p.kind) {
        // a blade: one post, a tall glowing panel, a bright cap
        cyl(g, 0.014, 0.18, steel, 0, 0, 0, { seg: 8 });
        panel(g, 0.13, 0.52, 0.035, adMat(hue, p.seed, true), rim, 0.16);
        box(g, 0.05, 0.012, 0.15, glow, 0, 0.68, 0);
      } else {
        // a billboard: two legs, a catwalk, a wide panel with a lit top edge
        for (const z of [-0.2, 0.2]) cyl(g, 0.012, 0.28, steel, 0, 0, z, { seg: 8 });
        box(g, 0.06, 0.012, 0.5, steel, 0.02, 0.26, 0);
        panel(g, 0.56, 0.26, 0.03, adMat(hue, p.seed, false), rim, 0.27);
        box(g, 0.02, 0.01, 0.58, glow, 0, 0.535, 0);
      }
      return g;
    },
  },
});
