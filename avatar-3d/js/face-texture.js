// Draws the face (and marks / facial hair) of an avatar JSON into a canvas using the 2D part catalog, so both versions
// share one face vocabulary. Returns a THREE.CanvasTexture with a transparent background: it is mapped onto a curved
// patch in front of the head (the way Miis do it). Also builds a flat "head" texture variant with skin fill for the
// Quaternius mode if wanted.
import * as THREE from 'three';
import { renderSVG } from '../../avatar-2d/js/render.js';

/** Build an SVG with only the face layers of the avatar, on a transparent background. */
export function faceSVG(avatar, { includeFacialHair = true, includeExtras = true, size = 512 } = {}) {
  const full = renderSVG(avatar, { width: size, height: size });
  // keep the style vars + face layer groups, drop everything else. Face layers live in the head group (translate/scale on head).
  const style = /style="([^"]*)"/.exec(full)?.[1] || '';
  const keep = ['eyes', 'brows', 'nose', 'mouth', ...(includeFacialHair ? ['facialHair'] : []), ...(includeExtras ? ['extras'] : [])];
  const groups = [...full.matchAll(/<g data-layer="([^"]+)" data-slot="[^"]*"( transform="[^"]*")?>([\s\S]*?)<\/g>(?=<g data-layer=|<\/svg>|<g stroke=)/g)]
    .filter(m => keep.includes(m[1])).map(m => `<g>${m[3]}</g>`).join('');
  // The 2D head is centred at (150,135) r 72. Map the box 150±80 × 135±80 to the whole canvas.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="84 69 132 132" width="${size}" height="${size}" style="${style}">${groups}</svg>`;
}

/** Rasterize an SVG string to a canvas (browser only). */
export function svgToCanvas(svg, size = 512) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(img, 0, 0, size, size); resolve(c); };
    img.onerror = e => reject(new Error('svg rasterize failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export async function faceTexture(avatar, opts = {}) {
  const canvas = await svgToCanvas(faceSVG(avatar, opts), opts.size || 512);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}
