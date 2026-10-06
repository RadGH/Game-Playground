// Play-test 2 Q13 fallback (no three.js, testable in node): the face as a 2D picture from avatar-2d's renderer, used where
// a GPU read-back would block (software renderers). And the software-renderer check itself.
import { renderSVG, normalizeAvatar, bodyMetrics, ANCHORS } from '../../../../../avatar-2d/js/render.js';

/** A software renderer (no GPU: SwiftShader / llvmpipe) — every GPU read-back there blocks for the whole frame (1-3 s). */
export function softwareRenderer(renderer) {
  try { const g = renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|software/i.test(e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''); } catch { return false; }
}
/** The face as a 2D picture (avatar-2d draws the same avatar JSON): no GPU at all — the fallback on software renderers. */
export function svgPortrait(avatar) {
  const a = normalizeAvatar(avatar), m = bodyMetrics(a.body), r = ANCHORS.headR * m.headScale * 1.25;
  const svg = renderSVG(a, { width: 96, height: 96 }).replace(' data-avatar>', ' data-avatar="1">')   // as an <img> it must be strict XML (a bare attribute is not)
    .replace('viewBox="0 0 300 400"', `viewBox="${(ANCHORS.headCx - r).toFixed(1)} ${(m.headCy - r * 1.05).toFixed(1)} ${(r * 2).toFixed(1)} ${(r * 2).toFixed(1)}"`);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
