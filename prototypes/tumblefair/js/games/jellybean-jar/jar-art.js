// Jellybean Jar's pictures. Pure (no DOM): `layout(thing, n, look, fill)` places exactly n things inside the
// container's shape, the same on every screen for the same arguments, and `svg(...)` turns that into an SVG string.
// Placement: a hex grid of item-sized cells clipped to the shape (with a little jitter), cell size found by a
// binary search so the shape holds about n / fill of them. Jars and the gumball globe fill from the bottom (a jar
// filled to a level); the pool scatters them over the water with gaps; the balloon bunch is packed full.
import { makeRng } from '../../shared/rng.js';

const INK = '#0d2228';
export const W = 200, H = 240;
const BEAN = ['#ff4d6d', '#ffb703', '#3ecf5a', '#4d7cff', '#b45cff', '#ff8a3d', '#ff5fc8', '#2ec4b6', '#f4f1de'];
const GUM = ['#ff4d6d', '#ffd23f', '#3ecf5a', '#4d9cff', '#ff8a3d', '#c05cff', '#ffffff'];
const BALLOON = ['#ff4d6d', '#ffd23f', '#3ecf5a', '#4d9cff', '#ff8a3d', '#c05cff', '#ff7ac8'];

/** The inside of each container (where a thing's centre may go, before the margin). */
export const SHAPES = {
  beans: { inside: (x, y, m) => rrect(x, y, 34 + m, 58 + m, 166 - m, 224 - m, 22), fromBottom: true },
  gumballs: { inside: (x, y, m) => (x - 100) ** 2 + (y - 98) ** 2 <= (80 - m) ** 2, fromBottom: true },
  ducks: { inside: (x, y, m) => ((x - 100) / (86 - m)) ** 2 + ((y - 132) / (80 - m)) ** 2 <= 1, fromBottom: false, sparse: true },
  balloons: { inside: (x, y, m) => ((x - 100) / (88 - m)) ** 2 + ((y - 92) / (78 - m)) ** 2 <= 1, fromBottom: false },
};
function rrect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function cells(shape, r, rng) {
  const s = r * 1.9, dy = s * 0.866, out = [];
  let row = 0;
  for (let y = H - r; y > r; y -= dy, row++) for (let x = r + (row % 2 ? s / 2 : 0); x < W - r; x += s) {
    const jx = x + (rng() - 0.5) * s * 0.18, jy = y + (rng() - 0.5) * s * 0.18;
    if (shape.inside(jx, jy, r * 1.15)) out.push({ x: jx, y: jy, row });
  }
  return out;
}
/** -> { r, items: [{ x, y, c (colour index), a (angle deg) }] } with exactly n items (n >= 1), in counting order. */
export function layout(thing, n, look, fill = 0.8) {
  const shape = SHAPES[thing] || SHAPES.beans, want = Math.ceil(n / (shape.fromBottom || shape.sparse ? fill : 1));
  let lo = 1, hi = 40;
  for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (cells(shape, mid, makeRng(look)).length >= want) lo = mid; else hi = mid; }
  const rng = makeRng(look), all = cells(shape, lo, rng);
  let pick;
  if (shape.fromBottom) pick = all.slice(0, n);                                  // rows from the bottom up
  else pick = makeRng(look ^ 0x5bd1e995).shuffle(all).slice(0, n).sort((a, b) => a.y - b.y);   // spread, drawn back to front
  const r2 = makeRng(look + 7);
  return { r: lo, items: pick.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), c: Math.floor(r2() * 9), a: Math.round(r2() * 360) })) };
}

const S = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;
/** One thing at (x, y), size r. */
function item(thing, it, r, i) {
  const { x, y, a } = it, k = r / 10;
  if (thing === 'beans') { const c = BEAN[it.c % BEAN.length]; return `<g class="jj-it" data-i="${i}" transform="translate(${x} ${y}) rotate(${a}) scale(${k})"><ellipse rx="11" ry="7.5" fill="${c}" ${S} stroke-width="2"/><ellipse cx="-3" cy="-3" rx="4" ry="1.8" fill="#fff" opacity=".6"/></g>`; }
  if (thing === 'gumballs') { const c = GUM[it.c % GUM.length]; return `<g class="jj-it" data-i="${i}" transform="translate(${x} ${y}) scale(${k})"><circle r="9.6" fill="${c}" ${S} stroke-width="1.8"/><circle cx="-3.4" cy="-3.6" r="2.6" fill="#fff" opacity=".7"/></g>`; }
  if (thing === 'ducks') { const f = it.c % 2 ? -1 : 1; return `<g class="jj-it" data-i="${i}" transform="translate(${x} ${y}) scale(${k * f} ${k})"><path d="M-10 1 Q-11 9 0 9 Q10 9 10 1 Q6 -2 -1 0 Z" fill="#ffd23f" ${S} stroke-width="2"/><circle cx="4" cy="-4" r="5.4" fill="#ffd23f" ${S} stroke-width="2"/><path d="M8.5 -4 l5 1.2 l-5 2" fill="#ff8a3d" ${S} stroke-width="1.5"/><circle cx="5.2" cy="-5.4" r="1.2" fill="${INK}"/></g>`; }
  const c = BALLOON[it.c % BALLOON.length];
  return `<g class="jj-it" data-i="${i}" transform="translate(${x} ${y}) rotate(${(a % 30) - 15}) scale(${k})"><ellipse rx="8.6" ry="10.4" fill="${c}" ${S} stroke-width="1.8"/><path d="M-1.6 10.2 l1.6 2.6 l1.6 -2.6 Z" fill="${c}" ${S} stroke-width="1.2"/><ellipse cx="-3" cy="-4" rx="2.2" ry="3.4" fill="#fff" opacity=".5"/></g>`;
}
/** Halloween (round 6): the same layouts, spooky-cute things — candy corn, eyeball gumballs, pumpkins bobbing in a
 *  cauldron, ghost balloons. Same count, same places, so nothing about the guessing changes. */
const IRIS = ['#3ecf5a', '#4d9cff', '#b45cff', '#ff8a3d', '#2ec4b6', '#ff5fc8', '#8a5a2b'];
const GHOST_TINT = ['#ffffff', '#f3ecff', '#fff3e6', '#eafff4'];
function itemHW(thing, it, r, i) {
  const { x, y, a } = it, k = r / 10;
  if (thing === 'beans') return `<g class="jj-it" data-i="${i}" transform="translate(${x} ${y}) rotate(${a}) scale(${k})"><path d="M0 -11 L9 8 Q0 12 -9 8 Z" fill="#ff8a1a" ${S} stroke-width="2"/><path d="M-3.4 -3.8 L3.4 -3.8 L0 -11 Z" fill="#fff8e6"/><path d="M-6.6 3.4 L6.6 3.4 L9 8 Q0 12 -9 8 Z" fill="#ffd23f"/><path d="M0 -11 L9 8 Q0 12 -9 8 Z" fill="none" ${S} stroke-width="2"/></g>`;
  if (thing === 'gumballs') return `<g class="jj-it" data-i="${i}" transform="translate(${x} ${y}) rotate(${a % 40 - 20}) scale(${k})"><circle r="9.6" fill="#fffaf2" ${S} stroke-width="1.8"/><circle cx="1" cy="1" r="4.6" fill="${IRIS[it.c % IRIS.length]}"/><circle cx="1.4" cy="1.4" r="2.2" fill="${INK}"/><circle cx="-0.4" cy="-0.6" r="1" fill="#fff"/></g>`;
  if (thing === 'ducks') return `<g class="jj-it" data-i="${i}" transform="translate(${x} ${y}) rotate(${a % 30 - 15}) scale(${k})"><ellipse cy="1" rx="10" ry="8" fill="#ff7a14" ${S} stroke-width="2"/><path d="M-3.4 -6 Q-4 3 -3.4 8.6 M3.4 -6 Q4 3 3.4 8.6" fill="none" stroke="#c45400" stroke-width="1.4"/><path d="M-1 -7 q1 -5 4 -6" fill="none" stroke="#3f7a2a" stroke-width="2.6" stroke-linecap="round"/><path d="M-5 0 l2 -3 l2 3 Z M1 0 l2 -3 l2 3 Z M-4 3.4 q4 3 8 0" fill="#ffd36b" stroke="#ffd36b" stroke-width=".6"/></g>`;
  const c = GHOST_TINT[it.c % GHOST_TINT.length];
  return `<g class="jj-it" data-i="${i}" transform="translate(${x} ${y}) rotate(${(a % 30) - 15}) scale(${k})"><path d="M-8.4 10 V-1 Q-8.4 -11 0 -11 Q8.4 -11 8.4 -1 V10 L5.6 7.6 L2.8 10 L0 7.6 L-2.8 10 L-5.6 7.6 Z" fill="${c}" ${S} stroke-width="1.8"/><ellipse cx="-3" cy="-2" rx="1.6" ry="2.4" fill="${INK}"/><ellipse cx="3" cy="-2" rx="1.6" ry="2.4" fill="${INK}"/><path d="M-1.6 2.6 q1.6 1.6 3.2 0" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/></g>`;
}
const BACK_HW = {
  beans: `<rect x="40" y="18" width="120" height="22" rx="7" fill="#7a3cc8" ${S} stroke-width="4"/><path d="M48 40 h104 v10 h-104 Z" fill="#e6d8ff" ${S} stroke-width="3.5"/>
    <rect x="30" y="50" width="140" height="180" rx="28" fill="#efe6ff" fill-opacity=".5" ${S} stroke-width="4.5"/><path d="M118 24 q6 -10 14 -4 q-6 2 -6 6 Z" fill="#2a1840"/>`,
  gumballs: `<path d="M64 168 L56 232 H144 L136 168 Z" fill="#7a3cc8" ${S} stroke-width="4.5"/><rect x="88" y="196" width="24" height="18" rx="5" fill="#ff8a1a" ${S} stroke-width="3"/><circle cx="100" cy="205" r="4" fill="${INK}"/>
    <circle cx="100" cy="98" r="86" fill="#efe6ff" fill-opacity=".45" ${S} stroke-width="4.5"/><rect x="88" y="4" width="24" height="12" rx="4" fill="#7a3cc8" ${S} stroke-width="3.5"/>`,
  ducks: `<ellipse cx="100" cy="136" rx="98" ry="92" fill="#3a2a4a" ${S} stroke-width="4.5"/><ellipse cx="100" cy="136" rx="90" ry="84" fill="#5fd14a" ${S} stroke-width="3.5"/>
    <g fill="#9cff7a" opacity=".75"><circle cx="40" cy="112" r="6"/><circle cx="150" cy="176" r="8"/><circle cx="96" cy="206" r="5"/><circle cx="132" cy="80" r="6"/><circle cx="62" cy="168" r="4"/></g>`,
};
/** The container behind (and in front of) the things. */
const BACK = {
  beans: `<rect x="40" y="18" width="120" height="22" rx="7" fill="#e8434f" ${S} stroke-width="4"/><path d="M48 40 h104 v10 h-104 Z" fill="#c9eef5" ${S} stroke-width="3.5"/>
    <rect x="30" y="50" width="140" height="180" rx="28" fill="#dff6fb" fill-opacity=".55" ${S} stroke-width="4.5"/>`,
  gumballs: `<path d="M64 168 L56 232 H144 L136 168 Z" fill="#e8434f" ${S} stroke-width="4.5"/><rect x="88" y="196" width="24" height="18" rx="5" fill="#ffd23f" ${S} stroke-width="3"/><circle cx="100" cy="205" r="4" fill="${INK}"/>
    <circle cx="100" cy="98" r="86" fill="#dff6fb" fill-opacity=".5" ${S} stroke-width="4.5"/><rect x="88" y="4" width="24" height="12" rx="4" fill="#e8434f" ${S} stroke-width="3.5"/>`,
  ducks: `<ellipse cx="100" cy="136" rx="98" ry="92" fill="#ff7ac8" ${S} stroke-width="4.5"/><ellipse cx="100" cy="136" rx="90" ry="84" fill="#4fc3f7" ${S} stroke-width="3.5"/>
    <path d="M30 120 q12 -6 24 0 M140 170 q12 -6 24 0 M90 200 q10 -5 20 0 M120 80 q10 -5 20 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`,
  balloons: `<g stroke="#5b6b70" stroke-width="1.2" fill="none" opacity=".8">${Array.from({ length: 13 }, (_, i) => `<path d="M${40 + i * 10} ${120 + Math.abs(6 - i) * 6} Q${100 + (i - 6) * 3} 190 100 228"/>`).join('')}</g>
    <path d="M90 226 q10 -8 20 0 l-4 10 h-12 Z" fill="#f2c9a0" ${S} stroke-width="3"/>`,
};
BACK_HW.balloons = BACK.balloons;                  // ghost balloons hang on the same strings
const FRONT = {
  beans: `<path d="M44 70 q-6 60 0 140" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".55"/>`,
  gumballs: `<path d="M40 70 q-10 40 6 80" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".55"/>`,
  ducks: '', balloons: '',
};
export const NAMES_HW = { beans: 'candy corns in the jar', gumballs: 'eyeball gumballs in the machine', ducks: 'pumpkins in the cauldron', balloons: 'ghost balloons in the bunch' };
export const MANY_HW = { beans: 'candy corns', gumballs: 'eyeballs', ducks: 'pumpkins', balloons: 'ghosts' };
export const NAMES = { beans: 'jellybeans in the jar', gumballs: 'gumballs in the machine', ducks: 'rubber ducks in the pool', balloons: 'balloons in the bunch' };
export const ONE = { beans: 'jellybean', gumballs: 'gumball', ducks: 'duck', balloons: 'balloon' };
export function svg(thing, n, look, fill, season = null) {
  const L = layout(thing, n, look, fill), hw = season === 'halloween', one = hw ? itemHW : item;
  return `<svg class="jj-svg jj-${thing}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="${(hw ? NAMES_HW : NAMES)[thing] || ''}">${(hw ? BACK_HW : BACK)[thing] || ''}<g class="jj-items">${L.items.map((it, i) => one(thing, it, L.r, i)).join('')}</g>${FRONT[thing] || ''}</svg>`;
}
