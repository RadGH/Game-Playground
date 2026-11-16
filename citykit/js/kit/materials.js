// Materials and facade textures for the futuristic city. Everything is made in code (no image files), cached by key so
// baking a hundred variants reuses the same few textures and materials.
//
// Night lights: any material with userData.glow = true is a light source. The baker draws a second "lights" picture
// from those only (everything else black), which the game adds on top of a darkened day picture at night.
// userData.dayGlow (0..1) is how much it glows in daylight (neon signs a little, windows not at all).
import * as THREE from 'three';
import { rng } from './rng.js';

/** Style palettes: body colours, trim, glass, and the neon colours a building may pick from. */
export const STYLES = {
  chrome:   { label: 'Chrome',   body: ['#c9d2dc', '#aeb9c6', '#dfe5ec'], trim: '#6f7c8c', glass: '#3d6a94', sky: '#b4d4ee', frame: '#c3ccd6', neon: ['#3ff0ff', '#ff4fd8', '#7dff6a'] },
  graphite: { label: 'Graphite', body: ['#3a4150', '#2e3441', '#454d5e'], trim: '#1f242e', glass: '#2b4766', sky: '#8fb2d4', frame: '#6c7686', neon: ['#ff3fa4', '#3fd0ff', '#ffb02e'] },
  pearl:    { label: 'Pearl',    body: ['#eef0f2', '#e4e8ec', '#f6f4ef'], trim: '#b8c0c8', glass: '#4a7aa6', sky: '#c4def2', frame: '#e3e7eb', neon: ['#3ff0ff', '#a26bff', '#ff6b5a'] },
  copper:   { label: 'Copper',   body: ['#a8735a', '#8f604c', '#b98668'], trim: '#5b3d31', glass: '#35566b', sky: '#a9cbe0', frame: '#d4a988', neon: ['#ffb02e', '#3fffd2', '#ff4f6a'] },
  concrete: { label: 'Concrete', body: ['#9aa0a2', '#8a9092', '#a9aeb0'], trim: '#666c6e', glass: '#3a5566', sky: '#a6c3d6', frame: '#9aa1a3', neon: ['#7dff6a', '#3fd0ff', '#ffde3f'] },
};
// Graphite stays for trim/parts but is no longer a building style (owner 2026-11-16: "too dark black, looks out of place")
export const STYLE_IDS = Object.keys(STYLES).filter(id => id !== 'graphite');

const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A facade texture covers 8 bays × 8 floors so lit windows can vary; repeat it (cols/8, floors/8) on a face.
export const BAYS = 8;
const CELL = 32;
/**
 * kind: 'grid' (punched windows) · 'bands' (ribbon windows) · 'curtain' (all glass with mullions) · 'louvre' (fins)
 * Returns { map, lights }: the day colour texture and the night windows (black where dark).
 */
export function facade(styleId, kind = 'grid', seed = 1, litShare = 0.42) {
  return cached(`fac:${styleId}:${kind}:${seed % 6}:${litShare}`, () => {
    const st = STYLES[styleId] || STYLES.chrome;
    const R = rng(seed * 7 + 3);
    const lit = [];
    for (let i = 0; i < BAYS * BAYS; i++) lit.push(R() < litShare ? R.pick(['#ffd98a', '#ffe9b8', '#9fd4ff', '#ffc070', '#c9b8ff']) : null);
    const W = BAYS * CELL, H = BAYS * CELL;
    // glass reflects the sky: lighter at the top of each pane, a few panes tinted differently
    const tints = Array.from({ length: BAYS * BAYS }, () => R.range(-0.12, 0.12));
    const glassFill = (g, x, y, w, h, i) => {
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, shade(st.sky || '#9cc3e6', tints[i])); gr.addColorStop(0.55, shade(st.glass, tints[i])); gr.addColorStop(1, shade(st.glass, tints[i] - 0.12));
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    };
    const win = (g, x, y, isLights) => {
      const i = (y / CELL) * BAYS + (x / CELL);
      const r = kind === 'grid' ? [x + 7, y + 6, CELL - 14, CELL - 12] : kind === 'bands' ? [x, y + 9, CELL, CELL - 16]
        : kind === 'curtain' ? [x + 1, y + 1, CELL - 2, CELL - 3] : [x + 4, y + 4, CELL - 8, CELL - 8];
      if (isLights) { g.fillStyle = lit[i] || '#000'; g.fillRect(...r); } else glassFill(g, ...r, i);
    };
    const map = canvasTex(W, H, (g) => {
      g.fillStyle = kind === 'curtain' ? st.frame : st.body[0]; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += CELL) for (let x = 0; x < W; x += CELL) {
        win(g, x, y, false);
        if (kind === 'louvre') { g.fillStyle = st.trim; for (let k = 0; k < 4; k++) g.fillRect(x + 4 + k * 7, y, 2, CELL); }
      }
      // floor slab lines
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += CELL) g.fillRect(0, y + CELL - 2, W, 2);
    });
    const lights = canvasTex(W, H, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += CELL) for (let x = 0; x < W; x += CELL) win(g, x, y, true);
    });
    return { map, lights };
  });
}

/** Plain body material for a style (index picks one of its body colours). */
export function bodyMat(styleId, idx = 0, opts = {}) {
  const st = STYLES[styleId] || STYLES.chrome;
  const color = opts.color || st.body[idx % st.body.length];
  return cached(`body:${color}:${opts.metal ?? 0.3}:${opts.rough ?? 0.6}`, () =>
    new THREE.MeshStandardMaterial({ color, metalness: opts.metal ?? 0.3, roughness: opts.rough ?? 0.6 }));
}
export function trimMat(styleId) { const st = STYLES[styleId] || STYLES.chrome; return bodyMat(styleId, 0, { color: st.trim, metal: 0.5, rough: 0.45 }); }
export function glassMat(styleId) {
  const st = STYLES[styleId] || STYLES.chrome;
  return cached(`glass:${st.glass}`, () => new THREE.MeshStandardMaterial({ color: st.glass, metalness: 0.7, roughness: 0.15 }));
}
/** A glowing material: neon strips, signs, beacons. dayGlow = how bright by day (0..1). */
export function neonMat(color, dayGlow = 0.5) {
  return cached(`neon:${color}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, roughness: 0.4 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
/** Facade material for one face: windows repeat cols × floors. */
export function facadeMat(styleId, kind, seed, cols, floors, litShare) {
  const { map, lights } = facade(styleId, kind, seed, litShare);
  const key = `facm:${styleId}:${kind}:${seed % 6}:${cols}:${floors}:${litShare}`;
  return cached(key, () => {
    const m = map.clone(); m.repeat.set(cols / BAYS, floors / BAYS); m.needsUpdate = true;
    const l = lights.clone(); l.repeat.set(cols / BAYS, floors / BAYS); l.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: m, emissiveMap: l, emissive: '#ffffff', emissiveIntensity: 0.62, metalness: 0.35, roughness: 0.45 });
    mat.userData.glow = true; mat.userData.dayGlow = 0; return mat;
  });
}

/** A holographic sign texture: a word-free pattern (bars + glyph blocks) — no real text, no brand names. */
export function signMat(color, seed = 1, dayGlow = 0.7) {
  return cached(`sign:${color}:${seed % 8}:${dayGlow}`, () => {
    const R = rng(seed * 13 + 1);
    const t = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = '#05060a'; g.fillRect(0, 0, w, h);
      g.fillStyle = color;
      for (let y = 8; y < h - 8; y += 14) { const n = R.int(1, 3); for (let k = 0; k < n; k++) g.fillRect(8 + k * 17, y, R.int(8, 15), 9); }
      g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    });
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1, roughness: 0.5 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}

/** Plants and ground pieces. */
export function leafMat(color = '#3f9e6a', glow = null) {
  if (glow) return neonMat(glow, 0.25);
  return cached(`leaf:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
}
export function paveMat(color = '#5b6470') { return cached(`pave:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })); }
export function waterMat() { return cached('water', () => new THREE.MeshStandardMaterial({ color: '#2a7fb8', metalness: 0.4, roughness: 0.1 })); }

/** Lighten (k > 0) or darken (k < 0) a #rrggbb colour. */
export function shade(hex, k) {
  const n = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const f = v => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return '#' + n.map(v => f(v).toString(16).padStart(2, '0')).join('');
}
