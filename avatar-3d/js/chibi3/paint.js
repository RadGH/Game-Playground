// Chibi 3 paints: what a surface is made of. No Three.js.
//
// A paint is { color, tile, rough, metal, sheen, detail, emissive, wear, vary }:
//   tile      which detail pattern (material.js TILES) is pressed into it
//   rough     0 mirror .. 1 chalk
//   metal     0 or 1 in practice
//   sheen     soft rim light that cloth and skin have and plastic does not
//   detail    how strongly the tile shows (0 = smooth)
//   wear      how much convex edges brighten (polished plate edges, rubbed leather)
//   vary      low-frequency colour variation, so a big surface is not one flat colour

export const TILE = { skin: 0, cloth: 1, leather: 2, metal: 3, hair: 4, chain: 5, wood: 6, fur: 7 };

export const SURFACES = {
  skin: { tile: TILE.skin, rough: 0.52, metal: 0, sheen: 0.35, detail: 0.22, wear: 0, vary: 0.06 },
  lips: { tile: TILE.skin, rough: 0.4, metal: 0, sheen: 0.3, detail: 0.15, wear: 0, vary: 0.02 },
  cloth: { tile: TILE.cloth, rough: 0.88, metal: 0, sheen: 0.85, detail: 0.85, wear: 0, vary: 0.08 },
  silk: { tile: TILE.cloth, rough: 0.5, metal: 0, sheen: 1, detail: 0.35, wear: 0, vary: 0.04 },
  wool: { tile: TILE.fur, rough: 0.95, metal: 0, sheen: 0.9, detail: 0.6, wear: 0, vary: 0.1 },
  leather: { tile: TILE.leather, rough: 0.62, metal: 0, sheen: 0.15, detail: 0.8, wear: 0.5, vary: 0.12 },
  metal: { tile: TILE.metal, rough: 0.3, metal: 1, sheen: 0, detail: 0.28, wear: 0.9, vary: 0.03 },
  darkMetal: { tile: TILE.metal, rough: 0.42, metal: 1, sheen: 0, detail: 0.4, wear: 0.7, vary: 0.05 },
  gold: { tile: TILE.metal, rough: 0.25, metal: 1, sheen: 0, detail: 0.35, wear: 0.6, vary: 0.03 },
  chain: { tile: TILE.chain, rough: 0.42, metal: 1, sheen: 0, detail: 1, wear: 0.2, vary: 0.05 },
  hair: { tile: TILE.hair, rough: 0.55, metal: 0, sheen: 0.6, detail: 1, wear: 0, vary: 0.1 },
  fur: { tile: TILE.fur, rough: 0.9, metal: 0, sheen: 0.7, detail: 1, wear: 0, vary: 0.14 },
  wood: { tile: TILE.wood, rough: 0.7, metal: 0, sheen: 0.1, detail: 0.9, wear: 0.35, vary: 0.12 },
  bone: { tile: TILE.leather, rough: 0.45, metal: 0, sheen: 0.2, detail: 0.25, wear: 0.4, vary: 0.08 },
  gem: { tile: TILE.metal, rough: 0.08, metal: 0, sheen: 0, detail: 0, wear: 0, vary: 0, emissive: 0.6 },
  glow: { tile: TILE.metal, rough: 0.2, metal: 0, sheen: 0, detail: 0, wear: 0, vary: 0, emissive: 1.4 },
  dark: { tile: TILE.skin, rough: 0.6, metal: 0, sheen: 0, detail: 0, wear: 0, vary: 0 },
};

/** A paint from a surface kind, a colour and any overrides. */
export function paint(kind, color, extra = {}) { return { ...SURFACES[kind], color, kind, ...extra }; }

// ------------------------------------------------------------------ colour helpers (sRGB hex)
export function hexToRgb(hex = '#888888') {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}
export function rgbToHex([r, g, b]) { const c = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0'); return '#' + c(r) + c(g) + c(b); }
export const mixHex = (a, b, t) => { const p = hexToRgb(a), q = hexToRgb(b); return rgbToHex(p.map((v, i) => v + (q[i] - v) * t)); };
/** k > 0 lightens toward white, k < 0 darkens toward black. */
export const shadeHex = (hex, k) => k >= 0 ? mixHex(hex, '#ffffff', k) : mixHex(hex, '#000000', -k);

/** The skin family of paints for one character. */
export function skinPaints(avatar) {
  const skin = avatar?.body?.skin || '#e8b994';
  const warm = mixHex(skin, '#c0504a', 0.22);
  return {
    skinPaint: paint('skin', skin),
    lipsPaint: paint('lips', mixHex(skin, '#a0404a', 0.38)),
    blushPaint: paint('skin', mixHex(skin, warm, 0.6)),
    nailPaint: paint('lips', mixHex(skin, '#f4e6e0', 0.45), { rough: 0.25, detail: 0.1 }),
    mouthPaint: paint('dark', mixHex(skin, '#3a1418', 0.8)),
    lidPaint: paint('skin', mixHex(skin, '#b06060', 0.25), { detail: 0.2 }),
  };
}
