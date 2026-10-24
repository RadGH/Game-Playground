// A friendly cartoon monster as an SVG string, from a small description — shared by Monster Line-Up and Monster
// Makeover (round 12 Halloween games). Pure (no DOM), so node tests can check that what is drawn is what was counted:
// `monsterSvg(m)` draws exactly m.eyes eyes, m.legs legs, m.spots spots and m.horns horns, each as its own shape with
// a data-part attribute (tests count them). Spooky-cute: round bodies, big eyes, smiles, never teeth.
//
//   m = { body: 0..3, fur: '#hex' | palette index, eyes: 1..7, legs: 0..8, spots: 0..10, horns: 0..4,
//         hornKind?: 'little' | 'big' | 'curly', hat?: id | null, mouth?: 'smile' | 'oh' | 'tongue' | 'grin',
//         extra?: 'cape' | 'bowtie' | 'scarf' | 'wings' | null, size: 0..1 (how much of the box it fills), hatCol?, extraCol? }
export const FURS = ['#8a5cf0', '#3ecf8a', '#ff8a3d', '#4fa8ff', '#ff6fb1', '#c8d64a', '#9aa3ad', '#e8434f'];
export const FUR_NAMES = ['purple', 'green', 'orange', 'blue', 'pink', 'lime', 'grey', 'red'];
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
const SPOTS = [[-0.42, 0.2], [0.38, 0.28], [-0.1, 0.5], [0.15, 0.08], [-0.55, 0.52], [0.55, 0.55], [0.02, 0.78], [-0.32, 0.75], [0.36, 0.8], [-0.7, 0.18]];
/** Eye centres (in body radii from the body centre) for 1..7 eyes: one row up to 4, then two rows. */
export function eyeSpots(n) {
  const rows = n <= 4 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)], out = [];
  rows.forEach((k, r) => { for (let i = 0; i < k; i++) out.push([(k === 1 ? 0 : -0.5 + i / (k - 1)) * (k > 2 ? 1.05 : 0.7), -0.38 + r * 0.32 - (rows.length > 1 ? 0.08 : 0)]); });
  return out;
}
const BODY = [
  (r) => `M ${-r} 0 C ${-r} ${-r * 1.25} ${r} ${-r * 1.25} ${r} 0 C ${r} ${r * 0.95} ${-r} ${r * 0.95} ${-r} 0 Z`,                        // blob
  (r) => `M ${-r * 0.75} ${r * 0.9} L ${-r * 0.75} ${-r * 0.6} C ${-r * 0.75} ${-r * 1.5} ${r * 0.75} ${-r * 1.5} ${r * 0.75} ${-r * 0.6} L ${r * 0.75} ${r * 0.9} Z`,   // tall
  (r) => `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r} Z`,                                                               // round
  (r) => `M 0 ${-r * 1.1} C ${r * 0.6} ${-r * 1.1} ${r * 0.55} ${-r * 0.2} ${r * 1.05} ${r * 0.5} C ${r * 1.2} ${r * 0.95} ${-r * 1.2} ${r * 0.95} ${-r * 1.05} ${r * 0.5} C ${-r * 0.55} ${-r * 0.2} ${-r * 0.6} ${-r * 1.1} 0 ${-r * 1.1} Z`,   // pear
];
/** Hats a monster can wear: id -> [label, svg at the top of the head (y = 0, width ~ w)]. */
export const HATS = {
  witch: ['witch hat', (w, c) => `<path d="M ${-w * 0.9} 0 Q 0 ${-w * 0.25} ${w * 0.9} 0 Q 0 ${w * 0.18} ${-w * 0.9} 0 Z" fill="${c}"/><path d="M ${-w * 0.45} ${-w * 0.08} L ${w * 0.15} ${-w * 1.3} Q ${w * 0.25} ${-w * 1.38} ${w * 0.3} ${-w * 1.2} L ${w * 0.45} ${-w * 0.08} Z" fill="${c}"/><rect x="${-w * 0.45}" y="${-w * 0.3}" width="${w * 0.9}" height="${w * 0.16}" fill="#ffd23f"/>`],
  top: ['top hat', (w, c) => `<rect x="${-w * 0.8}" y="${-w * 0.12}" width="${w * 1.6}" height="${w * 0.16}" rx="${w * 0.06}" fill="${c}"/><rect x="${-w * 0.5}" y="${-w * 0.95}" width="${w}" height="${w * 0.88}" rx="${w * 0.06}" fill="${c}"/><rect x="${-w * 0.5}" y="${-w * 0.32}" width="${w}" height="${w * 0.16}" fill="#ff5f8f"/>`],
  bow: ['big bow', (w, c) => `<path d="M 0 ${-w * 0.2} L ${-w * 0.7} ${-w * 0.6} L ${-w * 0.7} ${w * 0.15} Z M 0 ${-w * 0.2} L ${w * 0.7} ${-w * 0.6} L ${w * 0.7} ${w * 0.15} Z" fill="${c}"/><circle cx="0" cy="${-w * 0.2}" r="${w * 0.17}" fill="${shade(c, 0.75)}"/>`],
  crown: ['crown', (w, c) => `<path d="M ${-w * 0.65} 0 L ${-w * 0.65} ${-w * 0.6} L ${-w * 0.32} ${-w * 0.3} L 0 ${-w * 0.75} L ${w * 0.32} ${-w * 0.3} L ${w * 0.65} ${-w * 0.6} L ${w * 0.65} 0 Z" fill="${c}"/><circle cx="0" cy="${-w * 0.22}" r="${w * 0.1}" fill="#ff5f8f"/>`],
  pumpkin: ['pumpkin cap', (w, c) => `<ellipse cx="0" cy="${-w * 0.25}" rx="${w * 0.7}" ry="${w * 0.42}" fill="${c}"/><path d="M ${-w * 0.25} ${-w * 0.6} Q 0 ${-w * 0.1} ${w * 0.25} ${-w * 0.6}" stroke="${shade(c, 0.7)}" stroke-width="${w * 0.06}" fill="none"/><rect x="${-w * 0.07}" y="${-w * 0.9}" width="${w * 0.14}" height="${w * 0.25}" rx="${w * 0.05}" fill="#4c7a2a"/>`],
  cap: ['bobble cap', (w, c) => `<path d="M ${-w * 0.7} 0 Q ${-w * 0.7} ${-w * 0.8} 0 ${-w * 0.8} Q ${w * 0.7} ${-w * 0.8} ${w * 0.7} 0 Z" fill="${c}"/><circle cx="0" cy="${-w * 0.88}" r="${w * 0.18}" fill="#fff"/><rect x="${-w * 0.72}" y="${-w * 0.14}" width="${w * 1.44}" height="${w * 0.16}" rx="${w * 0.06}" fill="#fff"/>`],
};
export const MOUTHS = ['smile', 'oh', 'tongue', 'grin'];
export const EXTRAS = ['cape', 'bowtie', 'scarf', 'wings'];
const esc = s => String(s).replace(/[<>&"]/g, '');

/** The SVG (a whole <svg> element) for monster m. `opts.box` = [w, h] of the viewBox (default 200 x 230). */
export function monsterSvg(m, opts = {}) {
  const [W, H] = opts.box || [200, 230];
  const fur = typeof m.fur === 'number' ? FURS[m.fur % FURS.length] : esc(m.fur || FURS[0]);
  const size = Math.max(0, Math.min(1, m.size ?? 0.7)), R = 40 + 34 * size;              // body radius
  const legH = Math.max(14, R * 0.36), cx = W / 2, cy = H - 14 - legH - R * 0.85;
  const dark = shade(fur, 0.72), light = shade(fur, 1.25), parts = [];
  // wings and cape behind the body
  if (m.extra === 'wings') parts.push(`<g data-part="extra" fill="${esc(m.extraCol || '#4a2f78')}"><path d="M ${cx - R * 0.6} ${cy - R * 0.2} Q ${cx - R * 1.9} ${cy - R * 1.3} ${cx - R * 1.7} ${cy + R * 0.1} Q ${cx - R * 1.4} ${cy - R * 0.1} ${cx - R * 1.2} ${cy + R * 0.3} Q ${cx - R} ${cy} ${cx - R * 0.6} ${cy + R * 0.3} Z"/><path d="M ${cx + R * 0.6} ${cy - R * 0.2} Q ${cx + R * 1.9} ${cy - R * 1.3} ${cx + R * 1.7} ${cy + R * 0.1} Q ${cx + R * 1.4} ${cy - R * 0.1} ${cx + R * 1.2} ${cy + R * 0.3} Q ${cx + R} ${cy} ${cx + R * 0.6} ${cy + R * 0.3} Z"/></g>`);
  if (m.extra === 'cape') parts.push(`<path data-part="extra" d="M ${cx - R * 0.7} ${cy - R * 0.3} L ${cx - R * 1.15} ${cy + R * 1.05} L ${cx + R * 1.15} ${cy + R * 1.05} L ${cx + R * 0.7} ${cy - R * 0.3} Z" fill="${esc(m.extraCol || '#b3263f')}"/>`);
  // legs: stubby rounded feet under the body, evenly spread
  const legs = Math.max(0, Math.min(8, m.legs | 0));
  for (let i = 0; i < legs; i++) {
    const span = Math.min(R * 1.7, 18 + legs * 15), x = cx + (legs === 1 ? 0 : -span / 2 + span * i / (legs - 1)), lw = Math.max(7, Math.min(16, 70 / (legs + 2)));
    parts.push(`<rect data-part="leg" x="${(x - lw / 2).toFixed(1)}" y="${(cy + R * 0.6).toFixed(1)}" width="${lw.toFixed(1)}" height="${(legH + R * 0.25).toFixed(1)}" rx="${(lw / 2).toFixed(1)}" fill="${dark}" stroke="#1a0f26" stroke-width="3"/>`);
  }
  // horns (on top, behind the hat)
  const horns = Math.max(0, Math.min(4, m.horns | 0)), hk = m.hornKind || 'little', top = cy - (m.body === 1 ? R * 1.25 : m.body === 3 ? R * 1.1 : R * 0.95);
  for (let i = 0; i < horns; i++) {
    const x = cx + (horns === 1 ? 0 : -R * 0.55 + R * 1.1 * i / (horns - 1)), hh = hk === 'big' ? R * 0.7 : R * 0.42, hw2 = hk === 'big' ? R * 0.2 : R * 0.14;
    const lean = (x - cx) / R * 0.5;
    const d = hk === 'curly' ? `M ${x - hw2} ${top + 6} Q ${x - hw2 + lean * 20} ${top - hh} ${x + hw2 * 2.2} ${top - hh * 0.9} Q ${x + hw2 * 0.6} ${top - hh * 0.55} ${x + hw2} ${top + 6} Z`
      : `M ${x - hw2} ${top + 6} L ${x + lean * hh} ${top - hh} L ${x + hw2} ${top + 6} Z`;
    parts.push(`<path data-part="horn" d="${d}" fill="#f4ecd8" stroke="#1a0f26" stroke-width="3" stroke-linejoin="round"/>`);
  }
  // the body, with a light belly
  parts.push(`<path data-part="body" d="${BODY[(m.body | 0) % BODY.length](R)}" transform="translate(${cx} ${cy})" fill="${fur}" stroke="#1a0f26" stroke-width="4" stroke-linejoin="round"/>`);
  parts.push(`<ellipse cx="${cx}" cy="${cy + R * 0.42}" rx="${R * 0.55}" ry="${R * 0.38}" fill="${light}" opacity=".55"/>`);
  // spots: distinct round patches on the lower body
  const spots = Math.max(0, Math.min(SPOTS.length, m.spots | 0));
  for (let i = 0; i < spots; i++) { const [sx, sy] = SPOTS[i]; parts.push(`<circle data-part="spot" cx="${(cx + sx * R).toFixed(1)}" cy="${(cy + sy * R).toFixed(1)}" r="${(R * 0.11).toFixed(1)}" fill="${dark}"/>`); }
  // eyes: white with a pupil, all looking the same way
  const eyes = Math.max(1, Math.min(7, m.eyes | 0)), perRow = eyes > 4 ? Math.ceil(eyes / 2) : eyes, gap = perRow > 2 ? 1.05 * R / (perRow - 1) : 0.7 * R;
  const er = Math.max(5, Math.min(R * 0.26, gap * 0.46, eyes > 4 ? R * 0.155 : R));
  for (const [ex, ey] of eyeSpots(eyes)) {
    const x = cx + ex * R, y = cy + ey * R;
    parts.push(`<g data-part="eye"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${er.toFixed(1)}" fill="#fff" stroke="#1a0f26" stroke-width="2.5"/><circle cx="${(x + er * 0.2).toFixed(1)}" cy="${(y + er * 0.15).toFixed(1)}" r="${(er * 0.5).toFixed(1)}" fill="#1a0f26"/><circle cx="${(x + er * 0.38).toFixed(1)}" cy="${(y - er * 0.05).toFixed(1)}" r="${(er * 0.16).toFixed(1)}" fill="#fff"/></g>`);
  }
  // the mouth
  const my = cy + R * (eyes > 4 ? 0.3 : 0.18), mw = R * 0.42, mouth = m.mouth || 'smile';
  if (mouth === 'oh') parts.push(`<ellipse cx="${cx}" cy="${my + 4}" rx="${mw * 0.32}" ry="${mw * 0.4}" fill="#3a0d22" stroke="#1a0f26" stroke-width="2.5"/>`);
  else if (mouth === 'grin') parts.push(`<path d="M ${cx - mw} ${my} Q ${cx} ${my + mw * 1.1} ${cx + mw} ${my} Z" fill="#3a0d22" stroke="#1a0f26" stroke-width="2.5" stroke-linejoin="round"/>`);
  else parts.push(`<path d="M ${cx - mw * 0.8} ${my} Q ${cx} ${my + mw * 0.8} ${cx + mw * 0.8} ${my}" fill="none" stroke="#1a0f26" stroke-width="4" stroke-linecap="round"/>`);
  if (mouth === 'tongue') parts.push(`<path d="M ${cx - mw * 0.25} ${my + mw * 0.36} Q ${cx} ${my + mw * 1.1} ${cx + mw * 0.25} ${my + mw * 0.36} Z" fill="#ff7aa8" stroke="#1a0f26" stroke-width="2"/>`);
  // neckwear in front
  if (m.extra === 'bowtie') parts.push(`<path data-part="extra" d="M ${cx} ${my + R * 0.42} L ${cx - R * 0.32} ${my + R * 0.24} L ${cx - R * 0.32} ${my + R * 0.62} Z M ${cx} ${my + R * 0.42} L ${cx + R * 0.32} ${my + R * 0.24} L ${cx + R * 0.32} ${my + R * 0.62} Z" fill="${esc(m.extraCol || '#ff5f8f')}" stroke="#1a0f26" stroke-width="2"/>`);
  if (m.extra === 'scarf') parts.push(`<g data-part="extra" fill="${esc(m.extraCol || '#ffd23f')}" stroke="#1a0f26" stroke-width="2.5"><rect x="${cx - R * 0.75}" y="${my + R * 0.3}" width="${R * 1.5}" height="${R * 0.24}" rx="${R * 0.1}"/><rect x="${cx + R * 0.25}" y="${my + R * 0.4}" width="${R * 0.24}" height="${R * 0.6}" rx="${R * 0.08}"/></g>`);
  // the hat sits on the top of the head
  if (m.hat && HATS[m.hat]) parts.push(`<g data-part="hat" transform="translate(${cx} ${top + 6})">${HATS[m.hat][1](R * 0.62, esc(m.hatCol || '#3a2160'))}</g>`);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="msvg" aria-hidden="true">${parts.join('')}</svg>`;
}
