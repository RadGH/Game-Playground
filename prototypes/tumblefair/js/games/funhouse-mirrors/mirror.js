// Funhouse Mirrors: one warped face as HTML (browser only, no DOM needed to build the string). The face is cut into
// three horizontal slices so Bulge can swell or pinch the middle like a real funhouse mirror; Tall / Wide / Twist are
// one transform on the whole face, Wobble is a CSS animation whose size comes from a custom property, Tint is a
// coloured layer, Prop an SVG drawn over the face (inside the warp, so it stretches with it). CSS transforms only.
import { TINTS, PROPS } from './sim.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INK = '#0d2228';

/** The props, drawn in a 100 x 100 box over the portrait (the head fills about 10-90 across, its middle ~52 down). */
export const PROP_SVG = [
  '',
  // moustache
  `<path d="M50 66 C44 60 33 60 27 66 C24 70 20 70 17 67 C19 75 31 77 40 72 C45 70 48 69 50 68 C52 69 55 70 60 72 C69 77 81 75 83 67 C80 70 76 70 73 66 C67 60 56 60 50 66 Z" fill="#4a2a12" stroke="${INK}" stroke-width="1.6"/>`,
  // big glasses
  `<g fill="rgba(200,240,255,.35)" stroke="${INK}" stroke-width="3.2"><circle cx="34" cy="54" r="13"/><circle cx="66" cy="54" r="13"/></g><path d="M47 52 Q50 48 53 52 M21 52 L10 48 M79 52 L90 48" stroke="${INK}" stroke-width="3.2" fill="none"/>`,
  // party hat
  `<path d="M50 -6 L66 22 L34 22 Z" fill="#ff5f9e" stroke="${INK}" stroke-width="2"/><path d="M44 8 L56 8 M40 15 L60 15" stroke="#ffd23f" stroke-width="3"/><circle cx="50" cy="-6" r="5" fill="#ffd23f" stroke="${INK}" stroke-width="1.6"/>`,
  // clown nose
  `<circle cx="50" cy="62" r="9" fill="#ff3b3b" stroke="${INK}" stroke-width="2"/><circle cx="47" cy="59" r="2.6" fill="#fff" opacity=".8"/>`,
  // bow tie
  `<path d="M50 92 L32 83 L32 101 Z M50 92 L68 83 L68 101 Z" fill="#3a7bff" stroke="${INK}" stroke-width="2"/><circle cx="50" cy="92" r="4.5" fill="#ffd23f" stroke="${INK}" stroke-width="1.6"/>`,
  // unibrow
  `<path d="M22 44 C32 36 42 40 50 43 C58 40 68 36 78 44 C68 41 58 45 50 47 C42 45 32 41 22 44 Z" fill="#2a1a0a" stroke="${INK}" stroke-width="1.4"/>`,
  // star shades
  `<g fill="#1a1a2e" stroke="#ffd23f" stroke-width="1.6"><path d="M34 41 L37.6 49 L46 49.6 L39.6 55 L41.8 63.4 L34 58.6 L26.2 63.4 L28.4 55 L22 49.6 L30.4 49 Z"/><path d="M66 41 L69.6 49 L78 49.6 L71.6 55 L73.8 63.4 L66 58.6 L58.2 63.4 L60.4 55 L54 49.6 L62.4 49 Z"/></g><path d="M45 51 L55 51" stroke="#ffd23f" stroke-width="2.4"/>`,
];

/** Each prop's drop onto the portrait (measured on real portraits: the eyes sit ~62 down, the nose ~71, the mouth ~79). */
const PROP_DY = [0, 9, 8, 2, 9, 4, 9, 9];

/** A plain face in a seat colour, for a player with no portrait. */
export function stubFace(color = '#ffb36b') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="53" r="38" fill="${color}" stroke="${INK}" stroke-width="3"/><circle cx="37" cy="50" r="5" fill="${INK}"/><circle cx="63" cy="50" r="5" fill="${INK}"/><path d="M36 66 Q50 76 64 66" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** CSS custom properties for a warp. */
export function warpVars(w) {
  const b = w.bulge;
  return `--sx:${(1 + w.wide * 0.17).toFixed(2)};--sy:${(1 + w.tall * 0.17).toFixed(2)};--sk:${w.twist * 9}deg;--rt:${w.twist * 2}deg;` +
    `--k0:${(1 - b * 0.07).toFixed(2)};--k1:${(1 + b * 0.24).toFixed(2)};--k2:${(1 - b * 0.07).toFixed(2)};--wa:${w.wobble * 4}deg;--ws:${(w.wobble * 0.035).toFixed(3)};--wd:${(1.1 - w.wobble * 0.18).toFixed(2)}s`;
}

/** One mirror: the wavy frame, the warped face, its tint and prop. `cls` adds classes to the frame. */
export function mirrorHtml(src, w, { cls = '', label = '' } = {}) {
  const img = `<img src="${esc(src)}" alt="" draggable="false">`;
  return `<div class="fm-mirror${w.wobble ? ' wob' : ''} ${cls}" style="${warpVars(w)}">
    <div class="fm-glass">
      <div class="fm-wob"><div class="fm-warp">
        <div class="fm-sl s0">${img}</div><div class="fm-sl s1">${img}</div><div class="fm-sl s2">${img}</div>
        ${w.prop ? `<svg class="fm-prop" viewBox="0 0 100 100" aria-hidden="true"><g transform="translate(0 ${PROP_DY[w.prop]})">${PROP_SVG[w.prop]}</g></svg>` : ''}
      </div></div>
      <i class="fm-tint t${w.tint}"></i><i class="fm-shine"></i>
    </div>${label ? `<span class="fm-tag">${label}</span>` : ''}</div>`;
}

/** Words for a warp, so a mirror never relies on its colour alone ("Tall · Bulgy · Grape · Party hat"). */
export function warpWords(w) {
  const out = [];
  if (w.tall) out.push(w.tall > 0 ? 'Tall' : 'Squashed');
  if (w.wide) out.push(w.wide > 0 ? 'Wide' : 'Skinny');
  if (w.bulge) out.push(w.bulge > 0 ? 'Bulgy' : 'Pinched');
  if (w.twist) out.push('Twisted');
  if (w.wobble) out.push('Wobbly');
  if (w.tint) out.push(TINTS[w.tint]);
  if (w.prop) out.push(PROPS[w.prop]);
  return out.join(' · ') || 'Plain';
}
