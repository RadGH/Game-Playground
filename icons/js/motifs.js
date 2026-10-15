// Spell-effect particle shapes (2026-10-14): three white SVG shapes for each class — a projectile head, an impact
// shard, a ground glyph — and the class's three colours. Pure. Split from game-icons.js so the effect code
// (Thousandvale's sig-looks.js / sig-fx.js) loads only these, not every item picture.
import motifs, { palettes } from '../data/game/fx-motifs.js';

export const MOTIFS = motifs;
export const PALETTES = palettes;
/** Every class with motifs -> its three ids: [projectile head, impact shard, ground glyph]. */
export const CLASS_MOTIFS = Object.freeze(Object.keys(motifs).reduce((o, k) => {
  const [cls, part] = k.split('.');
  (o[cls] ||= [null, null, null])['abc'.indexOf(part)] = k;
  return o;
}, {}));
export const classPalette = cls => palettes[cls] || null;
/** A motif as a standalone white SVG (rasterised into the effect atlas). */
export function motifSvg(id, size = 64) {
  const m = motifs[id];
  if (!m) return null;
  const px = Number.isFinite(Number(size)) ? Math.max(1, Math.min(1024, Number(size))) : 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}">${m.art}</svg>`;
}
