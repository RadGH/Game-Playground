// Icon Kit — writes the hand-drawn SVG placeholder layers into iconkit/layers/placeholder/.
// These are the fallback set: every frame, plate, glow and glyph the kit knows has one, so a game never waits on
// painted art. Same canvas contract as the painted layers: a 100x100 box, everything centred on (50, 50), the frame's
// outer edge at r 48 (circle) / 2..98 (square), the plate just under the frame's inner edge, glyphs inside ~16..84.
//
//   node iconkit/tools/make-placeholders.mjs
//
// Tintable glyphs (`tintable: true` in data/glyphs.json) are drawn in light greys: the kit multiplies them by an
// element colour, so one drawing serves fire, frost, holy…
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = new URL('../layers/placeholder/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const INK = '#170d07';
const O = (w = 2.2) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const svg = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>\n`;
const lin = (id, stops, x2 = 0, y2 = 1, x1 = 0, y1 = 0) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5, fx = cx, fy = cy) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;

// ---- frames ---------------------------------------------------------------------------------------------------
const GOLD = lin('gold', [[0, '#fff2b8'], [0.28, '#e9bb55'], [0.55, '#9a6620'], [0.8, '#d9a444'], [1, '#6a4010']]);
const GOLD_IN = lin('goldIn', [[0, '#5a3408'], [0.5, '#c89038'], [1, '#fff0b0']]);
/** a four-faceted pyramid stud centred on (x, y) */
const stud = (x, y, s = 3.6) => `<g transform="translate(${x} ${y})">
  <path d="M0 0L${-s} ${-s}H${s}z" fill="#fff4c4"/><path d="M0 0L${s} ${-s}V${s}z" fill="#d9a240"/>
  <path d="M0 0L${s} ${s}H${-s}z" fill="#6a400e"/><path d="M0 0L${-s} ${s}V${-s}z" fill="#b8822c"/>
  <rect x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" fill="none" ${O(0.8)}/></g>`;

const frameCircle = svg(`
  <circle cx="50" cy="50" r="43.75" fill="none" stroke="url(#gold)" stroke-width="8.5"/>
  <circle cx="50" cy="50" r="40.3" fill="none" stroke="url(#goldIn)" stroke-width="1.3"/>
  <circle cx="50" cy="50" r="47.4" fill="none" stroke="#fff0b0" stroke-opacity=".55" stroke-width=".9"/>
  <circle cx="50" cy="50" r="48" fill="none" ${O(1.1)}/><circle cx="50" cy="50" r="39.5" fill="none" ${O(1.3)}/>
  ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<g transform="rotate(${a} 50 50)">${stud(50, 6.25, 3.1)}</g>`).join('')}`, GOLD + GOLD_IN);

const frameSquare = svg(`
  <path fill-rule="evenodd" fill="url(#gold)" d="M11 2H89A9 9 0 0 1 98 11V89A9 9 0 0 1 89 98H11A9 9 0 0 1 2 89V11A9 9 0 0 1 11 2ZM15 11H85A4 4 0 0 1 89 15V85A4 4 0 0 1 85 89H15A4 4 0 0 1 11 85V15A4 4 0 0 1 15 11Z"/>
  <rect x="11.7" y="11.7" width="76.6" height="76.6" rx="3.6" fill="none" stroke="url(#goldIn)" stroke-width="1.3"/>
  <rect x="2.6" y="2.6" width="94.8" height="94.8" rx="8.5" fill="none" stroke="#fff0b0" stroke-opacity=".55" stroke-width=".9"/>
  <rect x="2" y="2" width="96" height="96" rx="9" fill="none" ${O(1.1)}/><rect x="11" y="11" width="78" height="78" rx="4" fill="none" ${O(1.3)}/>
  ${[[6.5, 6.5], [93.5, 6.5], [6.5, 93.5], [93.5, 93.5], [50, 6.5], [50, 93.5], [6.5, 50], [93.5, 50]].map(([x, y]) => stud(x, y, 3.1)).join('')}`, GOLD + GOLD_IN);

// line frames (thin, hairline): light greys with a dark edge — the kit multiplies them by any colour (gold default)
const LINE = lin('ln', [[0, '#ffffff'], [0.5, '#c8c8c8'], [1, '#f4f4f4']], 1, 1);
const lineCircle = (r, w) => svg(`<circle cx="50" cy="50" r="${r + w / 2 + 0.5}" fill="none" stroke="#000" stroke-opacity=".75" stroke-width="1"/>
  <circle cx="50" cy="50" r="${r}" fill="none" stroke="url(#ln)" stroke-width="${w}"/>
  <circle cx="50" cy="50" r="${r - w / 2 - 0.35}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width=".7"/>`, LINE);
const lineSquare = (h, w, rx) => { const o = 50 - h, s = 2 * h; return svg(`<rect x="${o - w / 2 - 0.5}" y="${o - w / 2 - 0.5}" width="${s + w + 1}" height="${s + w + 1}" rx="${rx + w / 2}" fill="none" stroke="#000" stroke-opacity=".75" stroke-width="1"/>
  <rect x="${o}" y="${o}" width="${s}" height="${s}" rx="${rx}" fill="none" stroke="url(#ln)" stroke-width="${w}"/>
  <rect x="${o + w / 2 + 0.35}" y="${o + w / 2 + 0.35}" width="${s - w - 0.7}" height="${s - w - 0.7}" rx="${Math.max(0, rx - w / 2)}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width=".7"/>`, LINE); };

// ---- plates (grey: the kit tints them) ---------------------------------------------------------------------------
const STONE = `<filter id="stone" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="4" seed="7" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  .9 .9 .9 0 -.9" result="spots"/>
  <feComposite in="spots" in2="SourceGraphic" operator="in" result="tex"/>
  <feBlend in="tex" in2="SourceGraphic" mode="multiply"/></filter>`;
const PLATE_FILL = rad('pf', [[0, '#8c8c8c'], [0.55, '#5e5e5e'], [0.92, '#2e2e2e'], [1, '#1c1c1c']], 0.5, 0.45, 0.55);
const cracks = `<g fill="none" stroke="#141414" stroke-width=".9" stroke-opacity=".75" stroke-linecap="round">
  <path d="M22 34l9 5 4 9 9 3"/><path d="M70 22l-4 10 5 7-2 8"/><path d="M60 78l-6-8-9 1-5-6"/><path d="M78 60l-8 2-4 6"/></g>
  <g fill="none" stroke="#bdbdbd" stroke-width=".5" stroke-opacity=".35"><path d="M22.6 35l9 5 4 9 9 3"/><path d="M70.7 22.4l-4 10 5 7-2 8"/></g>`;
const plateCircle = svg(`<circle cx="50" cy="50" r="41" fill="url(#pf)" filter="url(#stone)"/>${`<g clip-path="url(#pc)">${cracks}</g>`}
  <circle cx="50" cy="50" r="40.5" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2"/>`, STONE + PLATE_FILL + '<clipPath id="pc"><circle cx="50" cy="50" r="41"/></clipPath>');
const plateSquare = svg(`<rect x="9.5" y="9.5" width="81" height="81" rx="5" fill="url(#pf)" filter="url(#stone)"/><g clip-path="url(#pc)">${cracks}</g>
  <rect x="10" y="10" width="80" height="80" rx="4.5" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2"/>`, STONE + PLATE_FILL + '<clipPath id="pc"><rect x="9.5" y="9.5" width="81" height="81" rx="5"/></clipPath>');
// a smooth second plate so the Builder has a choice before the painted ones arrive
const PLATE_SMOOTH = rad('ps', [[0, '#a0a0a0'], [0.5, '#6a6a6a'], [1, '#262626']], 0.5, 0.38, 0.6);
const plateSmoothCircle = svg(`<circle cx="50" cy="50" r="41" fill="url(#ps)"/><circle cx="50" cy="50" r="40.5" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="2"/>`, PLATE_SMOOTH);
const plateSmoothSquare = svg(`<rect x="9.5" y="9.5" width="81" height="81" rx="5" fill="url(#ps)"/><rect x="10" y="10" width="80" height="80" rx="4.5" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="2"/>`, PLATE_SMOOTH);

// ---- glows (white: the kit tints them) ---------------------------------------------------------------------------
const glowSoft = svg(`<circle cx="50" cy="50" r="36" fill="url(#gs)"/>`, rad('gs', [[0, '#fff', 0.95], [0.35, '#fff', 0.6], [0.7, '#fff', 0.18], [1, '#fff', 0]]));
const glowSwirl = svg(`<circle cx="50" cy="50" r="30" fill="url(#gs)"/><g fill="none" stroke="#fff" stroke-linecap="round" filter="url(#b)">
  <path d="M50 22a28 28 0 0 1 27 34" stroke-width="5" stroke-opacity=".8"/><path d="M78 56a28 28 0 0 1-40 19" stroke-width="3.5" stroke-opacity=".55"/>
  <path d="M50 78a28 28 0 0 1-27-34" stroke-width="5" stroke-opacity=".8"/><path d="M22 44a28 28 0 0 1 40-19" stroke-width="3.5" stroke-opacity=".55"/></g>`,
  rad('gs', [[0, '#fff', 0.7], [0.6, '#fff', 0.2], [1, '#fff', 0]]) + '<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>');
const glowRays = svg(`<circle cx="50" cy="50" r="24" fill="url(#gs)"/><g fill="#fff" fill-opacity=".45" filter="url(#b)">${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => `<path transform="rotate(${a} 50 50)" d="M48.6 50L50 13 51.4 50z"/>`).join('')}</g>`,
  rad('gs', [[0, '#fff', 0.85], [1, '#fff', 0]]) + '<filter id="b"><feGaussianBlur stdDeviation="1.2"/></filter>');

// ---- glyphs ------------------------------------------------------------------------------------------------------
const G = {};
G.fireball = svg(`
  <path d="M33 66C26 44 46 24 86 15 70 28 74 31 82 33 68 38 70 44 76 48 64 49 62 58 60 72Z" fill="url(#tail)" ${O()}/>
  <path d="M40 60C40 46 52 34 70 27 60 36 63 40 67 42 58 45 58 51 59 60Z" fill="#ffd25a" opacity=".85"/>
  <circle cx="42" cy="62" r="18" fill="url(#ball)" ${O()}/>
  <ellipse cx="37" cy="55" rx="6" ry="4" fill="#fff8d8" opacity=".85" transform="rotate(-30 37 55)"/>`,
  lin('tail', [[0, '#ffd04a'], [0.5, '#ff7a1a'], [1, '#c02a0a']], 1, 0, 0, 1) + rad('ball', [[0, '#fffbe0'], [0.3, '#ffd050'], [0.65, '#ff6a14'], [1, '#9a1e06']], 0.42, 0.4, 0.6));
const shard = (x, y, h, w, rot) => `<g transform="rotate(${rot} ${x} ${y + h / 2})"><path d="M${x} ${y}L${x - w} ${y + h * 0.55}L${x} ${y + h}Z" fill="url(#iceL)" ${O(1.8)}/><path d="M${x} ${y}L${x + w} ${y + h * 0.55}L${x} ${y + h}Z" fill="url(#iceR)" ${O(1.8)}/></g>`;
G['frost-shard'] = svg(`${shard(34, 30, 48, 8, -28)}${shard(66, 30, 48, 8, 28)}${shard(50, 14, 70, 10.5, 0)}
  <path d="M47 24l3-6 3 6" fill="none" stroke="#fff" stroke-width="1.2" opacity=".9"/>`,
  lin('iceL', [[0, '#ffffff'], [0.5, '#c6ecff'], [1, '#5aa8e8']]) + lin('iceR', [[0, '#a8dcff'], [0.6, '#4a92d8'], [1, '#1d4f9a']]));
G.lightning = svg(`
  <g stroke="#cfeeff" stroke-width="1.6" stroke-linecap="round" opacity=".9"><path d="M26 30l6 3M72 66l7 2M30 70l5-4M74 28l-4 5"/></g>
  <path d="M60 12L33 52H48L37 88L70 42H54L66 12Z" fill="url(#bolt)" ${O(2.4)}/>
  <path d="M59 16L40 48H52" fill="none" stroke="#fff" stroke-width="1.6" opacity=".9"/>`,
  lin('bolt', [[0, '#ffffff'], [0.45, '#b8e6ff'], [1, '#2f6fd0']]));
G['arcane-orb'] = svg(`
  <ellipse cx="50" cy="52" rx="33" ry="11" fill="none" stroke="#d6b8ff" stroke-width="2.4" opacity=".55" transform="rotate(-24 50 52)"/>
  <circle cx="50" cy="50" r="19" fill="url(#orb)" ${O()}/>
  <ellipse cx="44" cy="43" rx="6" ry="4" fill="#fff" opacity=".75" transform="rotate(-30 44 43)"/>
  <path d="M19.5 64.5A33 11 -24 0 0 81 39" fill="none" stroke="#f4e8ff" stroke-width="2.8" stroke-linecap="round" transform="rotate(0)"/>
  <path d="M80 26l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z M24 72l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#f4e8ff"/>`,
  rad('orb', [[0, '#fbf2ff'], [0.35, '#c48cff'], [0.75, '#6a2acc'], [1, '#2a0a5a']], 0.42, 0.38, 0.62));
G['holy-light'] = svg(`
  <g fill="#ffe9a0" opacity=".5">${[22.5, 67.5, 112.5, 157.5].map(a => `<path transform="rotate(${a} 50 50)" d="M47.5 50L50 16 52.5 50z"/>`).join('')}</g>
  <circle cx="50" cy="50" r="15" fill="url(#halo)"/>
  <path d="M50 12Q54 46 88 50Q54 54 50 88Q46 54 12 50Q46 46 50 12Z" fill="url(#star)" ${O(2)}/>
  <path d="M50 20Q52.5 45 76 50" fill="none" stroke="#fff" stroke-width="1.3" opacity=".9"/>`,
  rad('star', [[0, '#ffffff'], [0.25, '#fff2b0'], [0.7, '#ffc840'], [1, '#b07818']]) + rad('halo', [[0, '#fff', 0.9], [1, '#ffe080', 0]]));
G['sword-slash'] = svg(`
  <path d="M16 80C22 42 50 20 86 16C64 27 44 46 32 82Z" fill="url(#arc)" ${O()}/>
  <path d="M26 74C32 48 52 30 74 22C58 32 44 48 34 74Z" fill="#fff2c0" opacity=".75"/>
  <g stroke="#ffb070" stroke-width="1.6" stroke-linecap="round" opacity=".8"><path d="M40 84l6-10M52 80l4-7M64 72l3-5"/></g>`,
  lin('arc', [[0, '#7a1206'], [0.45, '#e2401a'], [0.85, '#ffb040'], [1, '#fff4c0']], 1, 0, 0, 1));
G['shield-bash'] = svg(`
  <path d="M27 22H67V46C67 66 57 78 47 84C37 78 27 66 27 46Z" fill="url(#steel)" ${O(2.4)}/>
  <path d="M31 26H63V46C63 63 55 73 47 78C39 73 31 63 31 46Z" fill="none" stroke="#f2f6fb" stroke-width="1.2" opacity=".6"/>
  <path d="M47 26V78M31 44H63" stroke="#4a5262" stroke-width="3"/><circle cx="47" cy="44" r="5" fill="url(#boss)" ${O(1.4)}/>
  <path d="M78 24l3 10 9-2-7 7 8 6-10-1 0 10-5-9-6 6 2-9-9-3 9-2z" fill="url(#flash)" ${O(1.2)}/>`,
  lin('steel', [[0, '#f0f4f8'], [0.4, '#a8b4c4'], [1, '#3e4656']], 1, 1) + rad('boss', [[0, '#fff'], [1, '#8a96a8']], 0.4, 0.35) + rad('flash', [[0, '#fff'], [0.5, '#fff2a0'], [1, '#ffa830']]));
G.poison = svg(`
  <circle cx="64" cy="20" r="3" fill="#c8ff7a" ${O(1)}/><circle cx="58" cy="12" r="2" fill="#c8ff7a" ${O(.8)}/>
  <rect x="43" y="16" width="14" height="8" rx="2" fill="#8a5a2a" ${O(1.8)}/>
  <path d="M45 24H55V36C67 39 74 48 74 60A24 24 0 0 1 26 60C26 48 33 39 45 36Z" fill="url(#glass)" ${O(2.2)}/>
  <path d="M29 58C35 54 45 60 50 58S64 52 71 58A21 21 0 0 1 29 58Z" fill="url(#liq)"/>
  <path d="M33 50C35 44 39 41 44 40" fill="none" stroke="#fff" stroke-width="2" opacity=".75" stroke-linecap="round"/>
  <path d="M50 58c-5 0-8 3-8 7 0 2.4 1.2 4 3 4.8V73h10v-3.2c1.8-.8 3-2.4 3-4.8 0-4-3-7-8-7z" fill="#f4f0e0" ${O(1.2)}/>
  <circle cx="46.8" cy="65" r="1.8" fill="${INK}"/><circle cx="53.2" cy="65" r="1.8" fill="${INK}"/>`,
  lin('glass', [[0, '#e8f4ec', 0.55], [1, '#9ab8a8', 0.35]]) + lin('liq', [[0, '#d4ff70'], [1, '#2e8a12']]));
G['shadow-bolt'] = svg(`
  <g fill="none" stroke="url(#tend)" stroke-width="4" stroke-linecap="round"><path d="M50 50C30 46 22 30 30 18"/><path d="M50 50C66 40 82 46 84 62"/><path d="M50 50C46 68 30 76 18 70"/></g>
  <circle cx="50" cy="50" r="18" fill="url(#void)" ${O()}/>
  <path d="M41 50Q50 41 59 50Q50 59 41 50Z" fill="#e0c8ff"/><circle cx="50" cy="50" r="3" fill="${INK}"/>`,
  rad('void', [[0, '#6a3ab0'], [0.6, '#2c1450'], [1, '#0c0418']]) + lin('tend', [[0, '#b88cff'], [1, '#3a1870']]));
G['nature-leaf'] = svg(`
  <path d="M30 78C24 60 30 40 50 30 48 50 42 66 30 78Z" fill="url(#leaf2)" ${O(1.8)}/>
  <path d="M52 86C30 70 30 36 62 14 78 40 74 70 52 86Z" fill="url(#leaf)" ${O()}/>
  <path d="M52 84C54 62 58 40 62 18" fill="none" stroke="#1e4a10" stroke-width="2"/>
  <path d="M54 68L66 58M55 56L68 44M57 44L66 34M53 66L44 56M55 52L46 42" fill="none" stroke="#1e4a10" stroke-width="1.2"/>
  <path d="M58 22C54 34 50 46 48 60" fill="none" stroke="#e8ffb8" stroke-width="1.4" opacity=".7"/>`,
  lin('leaf', [[0, '#d8ff8a'], [0.5, '#6ab83a'], [1, '#2a6a18']], 1, 1) + lin('leaf2', [[0, '#a8e070'], [1, '#3a7a20']]));
const arrow = (dx, dy) => `<g transform="translate(${dx} ${dy})"><path d="M20 80L70 30" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M20 80L70 30" stroke="#b07a3a" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M74 26L62 30 70 38Z" fill="url(#head)" ${O(1.4)}/><path d="M24 76l-8-2 4-4zM27 73l-3 9-4-4z" fill="#d83a2a" ${O(1)}/></g>`;
G['arrow-volley'] = svg(`${arrow(-10, -6)}${arrow(6, 4)}${arrow(-2, 14)}`, lin('head', [[0, '#ffffff'], [1, '#6a7a90']]));
G.whirlwind = svg(`
  ${[0, 120, 240].map(a => `<g transform="rotate(${a} 50 50)"><path d="M50 50C54 34 66 22 84 22C74 28 66 36 60 52Z" fill="url(#blade)" ${O(1.8)}/></g>`).join('')}
  <circle cx="50" cy="50" r="6" fill="#d8b060" ${O(1.6)}/>
  <g fill="none" stroke="#ffe2b0" stroke-width="1.5" stroke-linecap="round" opacity=".7"><path d="M20 40A32 32 0 0 1 36 20"/><path d="M80 60A32 32 0 0 1 64 80"/><path d="M28 74A32 32 0 0 1 20 62"/></g>`,
  lin('blade', [[0, '#ffffff'], [0.5, '#b8c4d4'], [1, '#4a5466']], 1, 1));
G.dagger = svg(`
  <path d="M74 18L40 56 46 62 80 24Z" fill="url(#blade)" ${O(2)}/><path d="M76 20L43 58" stroke="#fff" stroke-width="1" opacity=".8"/>
  <path d="M34 50L52 68" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M34 50L52 68" stroke="#e0b048" stroke-width="4" stroke-linecap="round"/>
  <path d="M42 64L28 78" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M42 64L28 78" stroke="#6a3a1a" stroke-width="4" stroke-linecap="round"/>
  <circle cx="25" cy="81" r="4.5" fill="#e0b048" ${O(1.6)}/>
  <path d="M60 70c0 4 3 6 3 8a3 3 0 0 1-6 0c0-2 3-4 3-8z" fill="#c81e1e" ${O(1)}/>`,
  lin('blade', [[0, '#ffffff'], [0.5, '#c0cad8'], [1, '#56627a']], 1, 1));
G.skull = svg(`
  <path d="M50 16C32 16 22 28 22 44 22 54 27 61 34 65V76H66V65C73 61 78 54 78 44 78 28 68 16 50 16Z" fill="url(#bone)" ${O(2.4)}/>
  <ellipse cx="39" cy="46" rx="7.5" ry="8.5" fill="#1a1208"/><ellipse cx="61" cy="46" rx="7.5" ry="8.5" fill="#1a1208"/>
  <circle cx="39" cy="47" r="3" fill="#9ef0b0"/><circle cx="61" cy="47" r="3" fill="#9ef0b0"/>
  <path d="M50 56l-4 7h8z" fill="#1a1208"/><path d="M42 76v-7M50 76v-7M58 76v-7" stroke="${INK}" stroke-width="2"/>
  <path d="M32 30C36 22 44 20 50 20" fill="none" stroke="#fff" stroke-width="2" opacity=".6" stroke-linecap="round"/>`,
  lin('bone', [[0, '#fbf6e6'], [0.6, '#cfc2a0'], [1, '#8a7a5a']]));
// tintable (light greys, multiplied by an element colour)
const W = lin('w', [[0, '#ffffff'], [0.55, '#e4e4e4'], [1, '#9a9a9a']], 1, 1);
G.leap = svg(`
  <path d="M18 34C34 10 64 14 66 54" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
  <path d="M18 34C34 10 64 14 66 54" fill="none" stroke="url(#w)" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M56 50L66 66 76 50Z" fill="url(#w)" ${O(2)}/>
  <ellipse cx="66" cy="78" rx="22" ry="6" fill="#d0d0d0" ${O(2)}/>
  <g stroke="#f4f4f4" stroke-width="2.4" stroke-linecap="round"><path d="M40 76l-8-4M92 76l-8-4M50 70l-4-6M82 70l4-6"/></g>`, W);
G.dash = svg(`
  <path d="M46 26L76 50 46 74 54 50Z" fill="url(#w)" ${O()}/><path d="M28 30L52 50 28 70 34 50Z" fill="#cfcfcf" ${O(1.8)}/>
  <g stroke-linecap="round"><path d="M12 42H26M8 50H24M12 58H26" stroke="${INK}" stroke-width="5"/><path d="M12 42H26M8 50H24M12 58H26" stroke="#eee" stroke-width="2.4"/></g>`, W);
G.nova = svg(`
  <g fill="url(#w)" ${O(1.6)}>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path transform="rotate(${a} 50 50)" d="M45 22L50 8 55 22Z"/>`).join('')}</g>
  <circle cx="50" cy="50" r="26" fill="none" stroke="${INK}" stroke-width="9"/><circle cx="50" cy="50" r="26" fill="none" stroke="url(#w)" stroke-width="5.5"/>
  <circle cx="50" cy="50" r="12" fill="url(#c)" ${O(1.8)}/>`, W + rad('c', [[0, '#ffffff'], [1, '#b0b0b0']]));
G['ground-rune'] = svg(`
  <g fill="none" stroke-linecap="round"><path d="M30 60V30M50 56V18M70 60V30" stroke="#f0f0f0" stroke-width="2.4" opacity=".7"/></g>
  <ellipse cx="50" cy="64" rx="36" ry="15" fill="#5a5a5a" fill-opacity=".35" ${O(2.2)}/>
  <ellipse cx="50" cy="64" rx="32" ry="12" fill="none" stroke="url(#w)" stroke-width="3.2"/>
  <ellipse cx="50" cy="64" rx="20" ry="7" fill="none" stroke="#e8e8e8" stroke-width="2"/>
  <g fill="#ffffff"><path d="M50 54l2 3-2 3-2-3z"/><path d="M28 64l2.4 2-2.4 2-2.4-2z"/><path d="M72 64l2.4 2-2.4 2-2.4-2z"/><path d="M50 73l2 2.4-2 2.4-2-2.4z"/></g>`, W);
G.beam = svg(`
  <path d="M26 74L84 16" stroke="#fff" stroke-opacity=".35" stroke-width="16" stroke-linecap="round"/>
  <path d="M26 74L84 16" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M26 74L84 16" stroke="url(#w)" stroke-width="5.5" stroke-linecap="round"/>
  <circle cx="24" cy="76" r="10" fill="url(#c)" ${O(2)}/>
  <g stroke="#f2f2f2" stroke-width="1.8" stroke-linecap="round"><path d="M44 46l-6-6M60 62l6 6M62 30l-4-6M76 46l6 4"/></g>`, W + rad('c', [[0, '#ffffff'], [1, '#a0a0a0']]));
G.summon = svg(`
  <ellipse cx="50" cy="76" rx="30" ry="9" fill="#3a3a3a" ${O(2)}/><ellipse cx="50" cy="76" rx="24" ry="6" fill="#f0f0f0" fill-opacity=".55"/>
  <path d="M50 18C42 18 37 24 37 32 37 37 39 40 42 42 33 46 30 56 30 76H70C70 56 67 46 58 42 61 40 63 37 63 32 63 24 58 18 50 18Z" fill="url(#w)" ${O(2.2)}/>
  <path d="M44 31h.01M56 31h.01" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <g stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".8"><path d="M20 66v-10M80 66v-10M26 58v-6M74 58v-6"/></g>`, W);
G.rally = svg(`
  ${[0, 1, 2].map(i => `<path d="M22 ${72 - i * 18}L50 ${50 - i * 18} 78 ${72 - i * 18} 78 ${82 - i * 18} 50 ${60 - i * 18} 22 ${82 - i * 18}Z" fill="url(#w)" ${O(2)} opacity="${1 - i * 0.12}"/>`).join('')}`, W);
G.ward = svg(`
  <path d="M14 70A36 36 0 0 1 86 70Z" fill="#fff" fill-opacity=".18" ${O(2.2)}/>
  <path d="M18 70A32 32 0 0 1 82 70" fill="none" stroke="url(#w)" stroke-width="5"/>
  <path d="M26 64A24 24 0 0 1 50 40" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
  <path d="M12 72H88" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M12 72H88" stroke="#d8d8d8" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M50 52l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z" fill="#fff" ${O(1.2)}/>`, W);
G.claw = svg(`
  ${[0, 1, 2].map(i => `<path d="M${30 + i * 14} ${18 + i * 4}C${44 + i * 14} ${34 + i * 4} ${44 + i * 12} ${58 + i * 4} ${30 + i * 12} ${82 - i * 2}C${38 + i * 14} ${60 + i * 4} ${36 + i * 14} ${38 + i * 4} ${30 + i * 14} ${18 + i * 4}Z" fill="url(#w)" ${O(2)}/>`).join('')}`, W);

const files = {
  'frame-circle.svg': frameCircle, 'frame-square.svg': frameSquare,
  'frame-thin-circle.svg': lineCircle(46, 4.8), 'frame-thin-square.svg': lineSquare(46, 4.8, 7),
  'frame-hairline-circle.svg': lineCircle(47.6, 2.2), 'frame-hairline-square.svg': lineSquare(47.6, 2.2, 6),
  'plate-circle.svg': plateCircle, 'plate-square.svg': plateSquare, 'plate-smooth-circle.svg': plateSmoothCircle, 'plate-smooth-square.svg': plateSmoothSquare,
  'glow-soft.svg': glowSoft, 'glow-swirl.svg': glowSwirl, 'glow-rays.svg': glowRays,
};
for (const [id, s] of Object.entries(G)) files[`glyph-${id}.svg`] = s;
for (const [name, body] of Object.entries(files)) writeFileSync(join(OUT, name), body);
console.log(`wrote ${Object.keys(files).length} placeholder layers to ${OUT}`);
