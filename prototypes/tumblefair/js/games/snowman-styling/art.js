// Snowman Styling's drawings: one SVG string per snowman from its outfit (7 option indexes, -1 = nothing), and a small
// icon per option for the pick buttons. Pure strings, no DOM, so a test can call it too.
import { OPTIONS, SLOTS } from './sim.js';

const INK = '#1d2a33', COAL = '#2b2f36', PLAIN = '#7a8ca8';
const star = (cx, cy, r, fill, extra = '') => {
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1); }
  return `<path d="${d}Z" fill="${fill}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" ${extra}/>`;
};
const heart = (cx, cy, r, fill) => `<path d="M${cx} ${cy + r} C${cx - r * 1.6} ${cy - r * 0.2} ${cx - r * 0.6} ${cy - r * 1.4} ${cx} ${cy - r * 0.4} C${cx + r * 0.6} ${cy - r * 1.4} ${cx + r * 1.6} ${cy - r * 0.2} ${cx} ${cy + r}Z" fill="${fill}" stroke="${INK}" stroke-width="1.5"/>`;
const gem = (cx, cy, r, fill) => `<path d="M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy}Z" fill="${fill}" stroke="${INK}" stroke-width="1.5"/>`;

/** Each part as a function (colour hex) -> SVG markup, on the snowman's 200 x 240 frame. */
const PART = {
  hat: [
    c => `<rect x="76" y="0" width="48" height="38" rx="3" fill="#22252b" stroke="${INK}" stroke-width="2"/><rect x="76" y="26" width="48" height="8" fill="${c}"/><rect x="62" y="36" width="76" height="8" rx="4" fill="#22252b" stroke="${INK}" stroke-width="2"/>`,
    c => `<path d="M72 46 Q72 12 100 12 Q128 12 128 46Z" fill="${c}" stroke="${INK}" stroke-width="2"/><rect x="70" y="38" width="60" height="10" rx="5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="100" cy="10" r="9" fill="#fff" stroke="${INK}" stroke-width="2"/>`,
    c => `<path d="M74 44 L74 16 L87 30 L100 10 L113 30 L126 16 L126 44Z" fill="#f2c230" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>${gem(100, 34, 5, c)}<circle cx="74" cy="16" r="3.5" fill="#fff"/><circle cx="126" cy="16" r="3.5" fill="#fff"/>`,
    c => `<path d="M58 44 Q100 -6 142 44 Q100 30 58 44Z" fill="#22252b" stroke="${INK}" stroke-width="2"/>${star(100, 28, 8, c)}`,
    c => `<path d="M80 44 L100 2 L120 44Z" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M86 32 L114 32 M92 20 L108 20" stroke="#fff" stroke-width="4"/><circle cx="100" cy="3" r="6" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>`,
  ],
  scarf: [
    c => `<rect x="70" y="84" width="60" height="14" rx="7" fill="${c}" stroke="${INK}" stroke-width="2"/><path d="M80 84 v14 M92 84 v14 M104 84 v14 M116 84 v14" stroke="#fff" stroke-width="4"/><rect x="112" y="92" width="13" height="34" rx="4" fill="${c}" stroke="${INK}" stroke-width="2"/><path d="M112 104 h13 M112 116 h13" stroke="#fff" stroke-width="4"/>`,
    c => `<rect x="66" y="82" width="68" height="18" rx="9" fill="${c}" stroke="${INK}" stroke-width="2"/><rect x="110" y="92" width="16" height="38" rx="5" fill="${c}" stroke="${INK}" stroke-width="2"/><path d="M110 132 l2 7 M116 132 l0 8 M122 132 l-2 7" stroke="${c}" stroke-width="3"/><path d="M74 91 h50" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-dasharray="4 4"/>`,
    c => `<path d="M100 92 L78 80 L78 104Z M100 92 L122 80 L122 104Z" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="92" r="6" fill="${c}" stroke="${INK}" stroke-width="2"/>`,
    c => `<path d="M68 84 Q100 96 132 84 L130 94 Q100 104 70 94Z" fill="${c}" stroke="${INK}" stroke-width="2"/><path d="M88 96 L100 122 L112 96Z" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="96" cy="104" r="2.5" fill="#fff"/><circle cx="104" cy="106" r="2.5" fill="#fff"/><circle cx="100" cy="114" r="2" fill="#fff"/>`,
    c => `<rect x="70" y="84" width="60" height="14" rx="7" fill="${c}" stroke="${INK}" stroke-width="2"/><rect x="112" y="92" width="13" height="34" rx="4" fill="${c}" stroke="${INK}" stroke-width="2"/>${star(84, 91, 5, '#fff')}${star(100, 91, 5, '#fff')}${star(118, 108, 5, '#fff')}`,
  ],
  nose: [
    () => `<path d="M100 64 L134 70 L100 74Z" fill="#ff8a1a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M110 66 l2 5 M120 68 l1 3" stroke="#c65a00" stroke-width="1.5"/>`,
    () => `<circle cx="100" cy="70" r="7" fill="#d81e3a" stroke="${INK}" stroke-width="2"/><path d="M100 63 Q104 56 110 56" fill="none" stroke="#3a7a2a" stroke-width="2"/><circle cx="98" cy="68" r="2" fill="#fff" opacity=".7"/>`,
    () => `<circle cx="100" cy="70" r="7" fill="#f2c230" stroke="${INK}" stroke-width="2"/><circle cx="98" cy="68" r="1.4" fill="${INK}"/><circle cx="102" cy="68" r="1.4" fill="${INK}"/><circle cx="98" cy="72" r="1.4" fill="${INK}"/><circle cx="102" cy="72" r="1.4" fill="${INK}"/>`,
    () => star(100, 70, 9, '#ffd23f'),
    () => `<ellipse cx="100" cy="70" rx="7" ry="5.5" fill="#8a8f98" stroke="${INK}" stroke-width="2"/>`,
  ],
  eyes: [
    () => `<circle cx="89" cy="58" r="4.5" fill="${COAL}"/><circle cx="111" cy="58" r="4.5" fill="${COAL}"/>`,
    () => `<path d="M74 50 L126 64" stroke="${INK}" stroke-width="2.5"/><ellipse cx="89" cy="58" rx="8" ry="7" fill="#22252b" stroke="${INK}" stroke-width="1.5"/><circle cx="111" cy="58" r="4.5" fill="${COAL}"/>`,
    () => `${star(89, 58, 7, '#ffd23f')}${star(111, 58, 7, '#ffd23f')}`,
    () => `<circle cx="89" cy="58" r="4.5" fill="${COAL}"/><circle cx="111" cy="58" r="4.5" fill="${COAL}"/><circle cx="111" cy="58" r="9" fill="rgba(200,230,255,.35)" stroke="#c9a227" stroke-width="2.5"/><path d="M119 62 Q124 76 118 86" fill="none" stroke="#c9a227" stroke-width="1.5"/>`,
    () => `<path d="M83 60 Q89 52 95 60 M105 60 Q111 52 117 60" fill="none" stroke="${COAL}" stroke-width="3.5" stroke-linecap="round"/><circle cx="82" cy="70" r="4" fill="#ff9aa8" opacity=".7"/><circle cx="118" cy="70" r="4" fill="#ff9aa8" opacity=".7"/>`,
  ],
  buttons: [
    () => [108, 124, 140].map(y => `<circle cx="100" cy="${y}" r="4.5" fill="${COAL}"/>`).join(''),
    () => [['#e8383d', 108], ['#2fa34f', 124], ['#f2b705', 140]].map(([c, y]) => `<path d="M94 ${y + 4} Q94 ${y - 6} 100 ${y - 6} Q106 ${y - 6} 106 ${y + 4}Z" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`).join(''),
    () => [108, 124, 140].map(y => star(100, y, 6, '#ffd23f')).join(''),
    () => [['#e8383d', 108], ['#2a8ff0', 124], ['#2fa34f', 140]].map(([c, y]) => gem(100, y, 6, c)).join(''),
    () => [108, 124, 140].map(y => heart(100, y, 5.5, '#f06aa8')).join(''),
  ],
  arms: [
    c => `<path d="M70 118 L36 98 M130 118 L164 98" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><circle cx="34" cy="96" r="9" fill="${c}" stroke="${INK}" stroke-width="2"/><circle cx="166" cy="96" r="9" fill="${c}" stroke="${INK}" stroke-width="2"/><rect x="28" y="100" width="12" height="5" rx="2" fill="#fff"/><rect x="160" y="100" width="12" height="5" rx="2" fill="#fff"/>`,
    c => `<path d="M70 118 L36 98" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><path d="M130 118 L158 100" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><path d="M160 130 L160 66" stroke="#c9a227" stroke-width="5" stroke-linecap="round"/><circle cx="160" cy="62" r="8" fill="${c}" stroke="${INK}" stroke-width="2"/>${star(160, 62, 4, '#fff')}`,
    () => `<path d="M70 118 L36 98" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><path d="M130 118 L150 104" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><path d="M146 108 L184 78" stroke="#a0702a" stroke-width="9" stroke-linecap="round"/><path d="M176 84 L188 75" stroke="#f2c230" stroke-width="11" stroke-linecap="round"/><path d="M150 105 L160 97" stroke="#f2c230" stroke-width="10"/>`,
    () => `<path d="M70 118 L36 98" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><path d="M130 118 L156 102" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><path d="M158 132 L158 76 Q158 62 170 62 Q182 62 182 74" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M158 132 L158 76 Q158 62 170 62 Q182 62 182 74" fill="none" stroke="#e8383d" stroke-width="7" stroke-linecap="round" stroke-dasharray="6 6"/>`,
    c => `<path d="M70 118 L36 98" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><path d="M130 118 L156 104" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round"/><path d="M156 106 L176 70" stroke="#fff" stroke-width="4" stroke-linecap="round"/>${star(178, 64, 11, '#ffd23f')}<circle cx="168" cy="52" r="2" fill="${c}"/><circle cx="190" cy="76" r="2" fill="${c}"/>`,
  ],
};

/** The snowman: three snowballs, a coal smile, then each worn part on top (arms behind the middle). */
export function snowmanSVG(outfit, { cls = '' } = {}) {
  const at = s => outfit[SLOTS.findIndex(x => x.id === s)] ?? -1;
  const ci = at('colour'), c = ci >= 0 ? OPTIONS.colour[ci].hex : PLAIN;
  const part = s => { const i = at(s); return i >= 0 && PART[s][i] ? PART[s][i](c) : ''; };
  return `<svg class="sm-svg ${cls}" viewBox="0 -4 200 248" aria-hidden="true">
    <ellipse cx="100" cy="234" rx="70" ry="8" fill="rgba(40,70,110,.18)"/>
    ${part('arms')}
    <circle cx="100" cy="188" r="48" fill="#fff" stroke="#9fb7cc" stroke-width="3"/>
    <circle cx="100" cy="120" r="36" fill="#fff" stroke="#9fb7cc" stroke-width="3"/>
    <circle cx="100" cy="64" r="27" fill="#fff" stroke="#9fb7cc" stroke-width="3"/>
    <path d="M86 192 Q92 180 104 186" fill="none" stroke="#dbe7f2" stroke-width="5" stroke-linecap="round"/>
    ${[0, 1, 2, 3, 4].map(k => `<circle cx="${90 + k * 5}" cy="${79 + Math.abs(k - 2) * -1.6 + 2}" r="1.9" fill="${COAL}"/>`).join('')}
    ${part('buttons')}${part('scarf')}${part('eyes')}${part('nose')}${part('hat')}
  </svg>`;
}

/** A small picture for an option button (the part on a scrap of snowman where it helps). */
export function optionIcon(slot, i) {
  if (slot === 'colour') return `<i class="sm-swatch" style="--c:${OPTIONS.colour[i].hex}"></i>`;
  const view = { hat: '50 -4 100 56', scarf: '58 72 84 70', nose: '78 46 60 40', eyes: '70 44 60 32', buttons: '78 96 44 54', arms: '122 44 76 92' }[slot];
  const base = slot === 'nose' || slot === 'eyes' ? '<circle cx="100" cy="64" r="27" fill="#fff" stroke="#9fb7cc" stroke-width="3"/>' : slot === 'buttons' ? '<circle cx="100" cy="120" r="36" fill="#fff" stroke="#9fb7cc" stroke-width="3"/>' : '';
  return `<svg viewBox="${view}" aria-hidden="true">${base}${PART[slot][i]('#e8383d')}</svg>`;
}
