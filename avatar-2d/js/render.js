// Avatar 2D renderer: turns a character's `avatar` JSON into layered SVG. No DOM needed for renderSVG (returns a string).
//
// Coordinate system: viewBox 0 0 300 400, chibi proportions. Fixed anchors (see README):
//   feet baseline y=380 · hip y=290 · shoulder/neck y=215 · head center (150,135), head radius ≈ 72
// Body height/width never touch the head: the legs group scales in Y about the feet, torso+head translate up;
// torso and legs scale in X about x=150. Face parts get Mii-style offsets (x spacing, y, scale, rotation).
import { PARTS, LAYERS, SLOTS } from './parts/index.js';

export const ANCHORS = { feet: 380, hip: 290, neck: 215, headCx: 150, headCy: 135, headR: 72, cx: 150 };
export const DEFAULT_AVATAR = {
  body: { height: 0.5, width: 0.5, headSize: 0.5, skin: '#f1c27d' },
  headShape: 'round',
  hair: { id: 'short', color: '#3b2a1a' },
  eyes: { id: 'round', color: '#4a6b8a', x: 0, y: 0, scale: 1, rot: 0 },
  brows: { id: 'straight', y: 0, rot: 0, x: 0 },
  nose: { id: 'small', y: 0, scale: 1 },
  mouth: { id: 'smile', y: 0, scale: 1, color: '#b5484d' },
  ears: { id: 'normal' },
  facialHair: { id: 'none' },
  top: { id: 'tshirt', color: '#2e7d32', color2: '#ffffff' },
  bottom: { id: 'pants', color: '#2f4f7f' },
  shoes: { id: 'sneakers', color: '#e8e8e8' },
  accessory: { id: 'none', color: '#333333' },
  hat: { id: 'none', color: '#5a3d8a' },
  extras: { id: 'none', color: '#8a2e2e' },
};

/** Deep-merge missing fields from DEFAULT_AVATAR and drop unknown part ids (fallback to defaults). */
export function normalizeAvatar(a = {}) {
  const out = JSON.parse(JSON.stringify(DEFAULT_AVATAR));
  for (const [k, v] of Object.entries(a || {})) { if (v && typeof v === 'object' && out[k] && typeof out[k] === 'object') Object.assign(out[k], v); else if (k in out) out[k] = v; }
  for (const slot of SLOTS) { const cur = out[slot]?.id ?? out[slot]; if (typeof cur === 'string' && !PARTS[slot]?.[cur]) { if (typeof out[slot] === 'string') out[slot] = DEFAULT_AVATAR[slot]; else out[slot].id = DEFAULT_AVATAR[slot].id; } }
  return out;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Compute the transforms for body groups from height/width/headSize (0..1, 0.5 = neutral). */
export function bodyMetrics(body) {
  const h = clamp(body.height ?? 0.5, 0, 1), w = clamp(body.width ?? 0.5, 0, 1), hs = clamp(body.headSize ?? 0.5, 0, 1);
  const legScale = 0.7 + h * 0.7;         // 0.7 .. 1.4 of leg length
  const torsoScale = 0.85 + h * 0.3;      // torso grows a little with height
  const widthScale = 0.7 + w * 0.7;       // 0.7 .. 1.4
  const headScale = 0.8 + hs * 0.4;       // 0.8 .. 1.2
  const legLen = ANCHORS.feet - ANCHORS.hip, torsoLen = ANCHORS.hip - ANCHORS.neck;
  const hipY = ANCHORS.feet - legLen * legScale;
  const neckY = hipY - torsoLen * torsoScale;
  const headCy = neckY - (ANCHORS.neck - ANCHORS.headCy) * headScale;
  return { legScale, torsoScale, widthScale, headScale, hipY, neckY, headCy, minY: headCy - ANCHORS.headR * headScale - 40 };
}

function part(slot, id) { return PARTS[slot]?.[id] || PARTS[slot]?.[DEFAULT_AVATAR[slot]?.id ?? DEFAULT_AVATAR[slot]] || null; }
function layerOf(slot, p) { return p.layer || slot; }

/**
 * Render to an SVG string. opts: { width, height, background, showAnchors }
 */
export function renderSVG(avatar, opts = {}) {
  const a = normalizeAvatar(avatar), m = bodyMetrics(a.body);
  const vars = `--skin:${a.body.skin};--hair:${a.hair.color};--eye:${a.eyes.color};--mouth:${a.mouth.color};--top:${a.top.color};--top2:${a.top.color2 || '#ffffff'};--bottom:${a.bottom.color};--shoes:${a.shoes.color};--acc:${a.accessory.color};--hat:${a.hat.color};--extra:${a.extras.color};--skin-dark:${shade(a.body.skin, -0.18)};--hair-dark:${shade(a.hair.color, -0.2)};--top-dark:${shade(a.top.color, -0.18)};--bottom-dark:${shade(a.bottom.color, -0.18)};--shoes-dark:${shade(a.shoes.color, -0.25)}`;
  // collect drawable layers: { layer, svg }
  const items = [];
  const T = { legs: `translate(150 ${ANCHORS.feet}) scale(${m.widthScale} ${m.legScale}) translate(-150 -${ANCHORS.feet})`,
    torso: `translate(150 ${m.hipY}) scale(${m.widthScale} ${m.torsoScale}) translate(-150 -${ANCHORS.hip})`,
    head: `translate(${ANCHORS.headCx} ${m.headCy}) scale(${m.headScale}) translate(-${ANCHORS.headCx} -${ANCHORS.headCy})` };
  const add = (slot, sel, extraTransform = '') => { const p = part(slot, sel?.id ?? sel); if (!p) return; for (const piece of p.pieces || [{ layer: layerOf(slot, p), svg: p.svg }]) items.push({ layer: piece.layer, svg: piece.svg, transform: piece.group ? T[piece.group] : extraTransform, slot }); };
  add('bottom', a.bottom, T.legs); add('shoes', a.shoes, T.legs);
  add('top', a.top, T.torso);
  add('headShape', a.headShape, T.head); add('ears', a.ears, T.head); add('hair', a.hair, T.head); add('hat', a.hat, T.head); add('extras', a.extras, T.head); add('facialHair', a.facialHair, T.head); add('accessory', a.accessory, T.head);
  // face parts with Mii offsets, inside the head transform
  const face = (slot, sel, inner) => { const p = part(slot, sel.id); if (!p) return; items.push({ layer: p.layer || slot, slot, transform: T.head, svg: inner(p) }); };
  const eyeT = (mirror) => { const sx = 22 + (a.eyes.x || 0) * 14, sy = 150 + (a.eyes.y || 0) * 16, s = a.eyes.scale || 1, r = (a.eyes.rot || 0) * (mirror ? -1 : 1); return `translate(${150 + (mirror ? sx : -sx)} ${sy}) rotate(${r}) scale(${(mirror ? -1 : 1) * s} ${s})`; };
  face('eyes', a.eyes, p => `<g transform="${eyeT(false)}">${p.svg}</g><g transform="${eyeT(true)}">${p.right || p.svg}</g>`);
  face('brows', a.brows, p => { const sx = 22 + (a.brows.x || 0) * 14, sy = 125 + (a.brows.y || 0) * 16, r = a.brows.rot || 0; return `<g transform="translate(${150 - sx} ${sy}) rotate(${-r})">${p.svg}</g><g transform="translate(${150 + sx} ${sy}) rotate(${r}) scale(-1 1)">${p.svg}</g>`; });
  face('nose', a.nose, p => `<g transform="translate(150 ${170 + (a.nose.y || 0) * 14}) scale(${a.nose.scale || 1})">${p.svg}</g>`);
  face('mouth', a.mouth, p => `<g transform="translate(150 ${192 + (a.mouth.y || 0) * 14}) scale(${a.mouth.scale || 1})">${p.svg}</g>`);
  // legs/torso "body" base pieces come from headShape? no: body base from a built-in part
  add('bodyBase', 'default', T.torso); add('legsBase', 'default', T.legs); add('armsBase', 'default', T.torso);
  items.sort((x, y) => LAYERS.indexOf(x.layer) - LAYERS.indexOf(y.layer));
  const w = opts.width || 300, h = opts.height || 400;
  const bg = opts.background ? `<rect width="300" height="400" fill="${opts.background}"/>` : '';
  const anchors = opts.showAnchors ? `<g stroke="#f0f" stroke-width="0.5" fill="none"><line x1="0" y1="${ANCHORS.feet}" x2="300" y2="${ANCHORS.feet}"/><line x1="0" y1="${m.hipY}" x2="300" y2="${m.hipY}"/><line x1="0" y1="${m.neckY}" x2="300" y2="${m.neckY}"/><circle cx="150" cy="${m.headCy}" r="${ANCHORS.headR * m.headScale}"/></g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="${w}" height="${h}" style="${vars}" data-avatar>${bg}${items.map(i => `<g data-layer="${i.layer}" data-slot="${i.slot}"${i.transform ? ` transform="${i.transform}"` : ''}>${i.svg}</g>`).join('')}${anchors}</svg>`;
}

/** Lighten/darken a #rrggbb by amount (-1..1). */
export function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
  const n = parseInt(m[1], 16); const ch = (v) => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch).map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Render into a container element (browser). Returns the <svg> element. */
export function renderInto(el, avatar, opts) { el.innerHTML = renderSVG(avatar, opts); return el.firstElementChild; }
