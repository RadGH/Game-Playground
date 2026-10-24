// PIN THE TAIL on a screen. Round 12: 14 pictures (tails, a horn, noses, a candle, a stem) in five scenes (sceneSvg). One SVG paddock (160 x 100 units, the sim's own coordinates, so a tap is converted to
// paddock units with the SVG's own matrix and is the same on every screen size). The paddock (grass, fence, flowers,
// rocks, the animals) is one group that can turn (the spin trick); pins and the answer are drawn on top, unturned.
// Show: the animal, its tail spot as a pulsing star. Trick: the animal trots to its new spot / the paddock turns / two
// animals swap, by CSS transitions. Guess: the animals are gone (blurred in round 1); tap to put your pin, tap again to
// move it, DONE to lock. Reveal: the animal is back WITH its tail, and every pin in its seat colour with its name.
import { esc, chip } from '../../client/gamehud.js';
import { ANIMALS, BW, BH } from './sim.js';

const INK = '#0d2228';
const O = (w = 1.4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const leg = (x, y0, y1, c, hoof = '#4a3a30') => `<rect x="${x}" y="${y0}" width="5" height="${y1 - y0}" rx="2" fill="${c}" ${O()}/><rect x="${x}" y="${y1 - 3}" width="5" height="3" rx="1" fill="${hoof}" ${O(1)}/>`;
/** Each animal facing right, in its own box (ANIMALS[k].w x .h), without its tail. */
const BODY = {
  donkey: () => { const c = '#a3a9b3'; return `${leg(12, 26, 44, c)}${leg(18, 27, 44, c)}${leg(34, 27, 44, c)}${leg(40, 26, 44, c)}
    <ellipse cx="26" cy="22" rx="21" ry="12" fill="${c}" ${O()}/><ellipse cx="27" cy="27" rx="13" ry="5" fill="#d4d8de"/>
    <path d="M37 17 L43 5 L51 9 L46 24 Z" fill="${c}" ${O()}/><path d="M38 15 L44 4" stroke="#5b6170" stroke-width="3" stroke-linecap="round"/>
    <path d="M43 6 L40 0.5 L46.5 4 Z M46 6 L46 0.5 L50 5 Z" fill="${c}" ${O(1.1)}/>
    <ellipse cx="48" cy="12" rx="8" ry="6" transform="rotate(22 48 12)" fill="${c}" ${O()}/><ellipse cx="53" cy="15" rx="3.6" ry="3" fill="#d4d8de" ${O(1)}/>
    <circle cx="47.5" cy="9.5" r="1.3" fill="${INK}"/>`; },
  pony: () => { const c = '#c07a3e'; return `${leg(12, 26, 44, c)}${leg(18, 27, 44, c)}${leg(34, 27, 44, c)}${leg(40, 26, 44, c)}
    <ellipse cx="26" cy="21" rx="21" ry="11.5" fill="${c}" ${O()}/>
    <path d="M37 16 L44 4 L52 8 L46 23 Z" fill="${c}" ${O()}/><path d="M36 18 Q38 8 44 3 Q42 10 40 18 Z" fill="#5a3418" ${O(1)}/>
    <path d="M45 5 L44 0.5 L48.5 4 Z" fill="${c}" ${O(1.1)}/>
    <ellipse cx="49" cy="11" rx="7.5" ry="5.6" transform="rotate(25 49 11)" fill="${c}" ${O()}/><ellipse cx="53.5" cy="14" rx="2.8" ry="2.6" fill="#e3a46c" ${O(1)}/>
    <circle cx="48.5" cy="8.6" r="1.3" fill="${INK}"/><path d="M44 4 Q41 1 39 4" fill="#5a3418" ${O(1)}/>`; },
  goat: () => { const c = '#efe6d2'; return `<rect x="11" y="27" width="4" height="17" rx="1.6" fill="${c}" ${O()}/><rect x="17" y="28" width="4" height="16" rx="1.6" fill="${c}" ${O()}/><rect x="30" y="28" width="4" height="16" rx="1.6" fill="${c}" ${O()}/><rect x="36" y="27" width="4" height="17" rx="1.6" fill="${c}" ${O()}/>
    <ellipse cx="23" cy="22" rx="18" ry="10.5" fill="${c}" ${O()}/><path d="M34 18 L39 8 L45 10 L41 24 Z" fill="${c}" ${O()}/>
    <path d="M40 7 Q36 1 31 3 Q36 3 38 9 Z" fill="#8a7a66" ${O(1.1)}/><path d="M37 9 L32 10 L37 12 Z" fill="${c}" ${O(1)}/>
    <ellipse cx="43" cy="12" rx="6.6" ry="5" transform="rotate(28 43 12)" fill="${c}" ${O()}/><path d="M45 17 L45 23 L48 17 Z" fill="#c9bba0" ${O(1)}/>
    <circle cx="43" cy="10" r="1.2" fill="${INK}"/>`; },
  pig: () => { const c = '#ffaec4'; return `<rect x="12" y="27" width="5" height="9" rx="2" fill="${c}" ${O()}/><rect x="18" y="28" width="5" height="8" rx="2" fill="${c}" ${O()}/><rect x="31" y="28" width="5" height="8" rx="2" fill="${c}" ${O()}/><rect x="37" y="27" width="5" height="9" rx="2" fill="${c}" ${O()}/>
    <ellipse cx="25" cy="19" rx="21" ry="12.5" fill="${c}" ${O()}/><circle cx="41" cy="15" r="9" fill="${c}" ${O()}/>
    <path d="M36 8 L37 1.5 L42 7 Z M41 7 L44 1 L46 8 Z" fill="#ff8fae" ${O(1.1)}/><ellipse cx="48.5" cy="17" rx="3.4" ry="4.4" fill="#ff8fae" ${O()}/>
    <circle cx="48" cy="15.6" r=".8" fill="${INK}"/><circle cx="49" cy="18.4" r=".8" fill="${INK}"/><circle cx="42" cy="12.5" r="1.3" fill="${INK}"/>`; },
  cow: () => { const c = '#fbfbf7'; return `${leg(9, 25, 44, c, '#555')}${leg(15, 26, 44, c, '#555')}${leg(33, 26, 44, c, '#555')}${leg(39, 25, 44, c, '#555')}
    <rect x="5" y="9" width="40" height="20" rx="9" fill="${c}" ${O()}/><path d="M12 11 q6 -2 8 4 q-2 6 -8 4 Z M28 18 q6 -3 9 2 q-3 6 -9 3 Z" fill="${INK}"/>
    <ellipse cx="24" cy="29" rx="4" ry="2.6" fill="#ffb3c8" ${O(1)}/>
    <path d="M45 7 Q44 2 47 3 M55 7 Q56 2 53 3" fill="none" ${O(1.4)}/>
    <ellipse cx="50" cy="13" rx="7" ry="8" fill="${c}" ${O()}/><path d="M50 5 q5 1 6 7 q-6 0 -6 -7 Z" fill="${INK}"/><ellipse cx="52.5" cy="20" rx="6" ry="4" fill="#ffb3c8" ${O()}/>
    <circle cx="47.5" cy="11.5" r="1.3" fill="${INK}"/><circle cx="51" cy="20" r=".8" fill="${INK}"/><circle cx="55" cy="20" r=".8" fill="${INK}"/>`; },
  sheep: () => { const c = '#f7f3ea'; return `<rect x="12" y="27" width="4" height="13" rx="1.6" fill="#3c3a40" ${O(1)}/><rect x="18" y="28" width="4" height="12" rx="1.6" fill="#3c3a40" ${O(1)}/><rect x="30" y="28" width="4" height="12" rx="1.6" fill="#3c3a40" ${O(1)}/><rect x="36" y="27" width="4" height="13" rx="1.6" fill="#3c3a40" ${O(1)}/>
    <path d="M8 20 a6 6 0 0 1 6 -9 a7 7 0 0 1 11 -4 a7 7 0 0 1 12 1 a6 6 0 0 1 6 9 a6 6 0 0 1 -3 10 a7 7 0 0 1 -11 2 a7 7 0 0 1 -12 0 a6 6 0 0 1 -9 -9 Z" fill="${c}" ${O()}/>
    <ellipse cx="44" cy="14" rx="5.6" ry="7.2" transform="rotate(-15 44 14)" fill="#3c3a40" ${O()}/><path d="M39 9 L34 11 L39 13 Z" fill="#3c3a40" ${O(1)}/>
    <circle cx="45.5" cy="12" r="1.3" fill="#fff"/><path d="M40 7 q4 -4 8 0" fill="${c}" ${O(1)}/>`; },
  // ---- round 12: more pictures, and more than tails ----
  cat: () => { const c = '#f2a03d'; return `<rect x="11" y="26" width="4" height="13" rx="1.8" fill="${c}" ${O()}/><rect x="17" y="27" width="4" height="12" rx="1.8" fill="${c}" ${O()}/><rect x="29" y="27" width="4" height="12" rx="1.8" fill="${c}" ${O()}/><rect x="35" y="26" width="4" height="13" rx="1.8" fill="${c}" ${O()}/>
    <ellipse cx="24" cy="21" rx="18" ry="9.5" fill="${c}" ${O()}/><path d="M17 13 q2 5 0 9 M24 12 q2 5 0 9 M31 13 q2 5 0 9" fill="none" stroke="#c46a12" stroke-width="2" stroke-linecap="round"/>
    <path d="M35 9 L36 1 L41 6 Z M43 6 L47 1 L47.5 9 Z" fill="${c}" ${O(1.1)}/><circle cx="41.5" cy="12" r="8" fill="${c}" ${O()}/>
    <ellipse cx="45" cy="14.5" rx="3.6" ry="2.6" fill="#ffe2b8" ${O(.9)}/><circle cx="40" cy="10" r="1.3" fill="${INK}"/><circle cx="45" cy="10" r="1.3" fill="${INK}"/><path d="M45 13.5 l-1 1.2 h2 Z" fill="#e8708f"/>
    <path d="M47 15 h4 M47 16.5 l4 1.2" stroke="${INK}" stroke-width=".6"/>`; },
  dog: () => { const c = '#d9a066'; return `${leg(12, 25, 42, c, '#7a4f2a')}${leg(18, 26, 42, c, '#7a4f2a')}${leg(33, 26, 42, c, '#7a4f2a')}${leg(39, 25, 42, c, '#7a4f2a')}
    <ellipse cx="26" cy="21" rx="20" ry="10.5" fill="${c}" ${O()}/><ellipse cx="22" cy="18" rx="7" ry="5" fill="#fff4e0"/>
    <ellipse cx="45" cy="13" rx="8.5" ry="7.5" fill="${c}" ${O()}/><ellipse cx="51.5" cy="16" rx="3.6" ry="3" fill="#fff4e0" ${O(.9)}/><circle cx="53.6" cy="14.6" r="1.4" fill="${INK}"/>
    <path d="M39 7 q-5 2 -4 11 q3 1 5 -2 Z" fill="#7a4f2a" ${O(1)}/><circle cx="46" cy="10.5" r="1.3" fill="${INK}"/><rect x="36" y="18" width="8" height="2.6" rx="1.2" fill="#e8434f" ${O(.7)}/>`; },
  bunny: () => { const c = '#e8e4ee'; return `<ellipse cx="15" cy="36" rx="7" ry="3" fill="${c}" ${O()}/><ellipse cx="32" cy="36.5" rx="5" ry="2.6" fill="${c}" ${O()}/>
    <ellipse cx="21" cy="26" rx="15" ry="10.5" fill="${c}" ${O()}/>
    <ellipse cx="34" cy="4" rx="3" ry="8" transform="rotate(-14 34 8)" fill="${c}" ${O()}/><ellipse cx="34" cy="4.5" rx="1.3" ry="5.6" transform="rotate(-14 34 8)" fill="#ffc2d6"/>
    <ellipse cx="40" cy="5" rx="3" ry="8" transform="rotate(12 40 9)" fill="${c}" ${O()}/><ellipse cx="40" cy="5.5" rx="1.3" ry="5.6" transform="rotate(12 40 9)" fill="#ffc2d6"/>
    <circle cx="37" cy="17" r="7.5" fill="${c}" ${O()}/><circle cx="39" cy="15.5" r="1.3" fill="${INK}"/><circle cx="43.5" cy="18.5" r="1.2" fill="#ff8fae"/><path d="M42 20 h4 M42 21.4 l4 1" stroke="${INK}" stroke-width=".5"/>`; },
  unicorn: () => { const c = '#fbf6ff'; return `<g transform="translate(0 4)">${leg(12, 26, 46, c, '#c9a8ff')}${leg(18, 27, 46, c, '#c9a8ff')}${leg(34, 27, 46, c, '#c9a8ff')}${leg(40, 26, 46, c, '#c9a8ff')}
    <ellipse cx="26" cy="21" rx="21" ry="11.5" fill="${c}" ${O()}/>
    <path d="M37 16 L44 4 L52 8 L46 23 Z" fill="${c}" ${O()}/><path d="M36 18 Q37 8 44 3 Q41 9 41 13 Q39 15 40 18 Z" fill="#ff8fd0" ${O(1)}/><path d="M38 17 Q40 10 43 7" fill="none" stroke="#8fd6ff" stroke-width="1.6"/>
    <path d="M45 5 L44 0.5 L48.5 4 Z" fill="${c}" ${O(1.1)}/>
    <ellipse cx="49" cy="11" rx="7.5" ry="5.6" transform="rotate(25 49 11)" fill="${c}" ${O()}/><ellipse cx="53.5" cy="14" rx="2.8" ry="2.6" fill="#ffd6ec" ${O(1)}/>
    <circle cx="48.5" cy="9" r="1.3" fill="${INK}"/><path d="M6 17 q-6 2 -5 12 q3 -4 6 -6 Z" fill="#ff8fd0" ${O(1)}/></g>`; },
  clown: () => `<path d="M10 14 L22 -1 L34 14 Z" fill="#3d8bff" ${O()}/><circle cx="22" cy="-1" r="2.6" fill="#ffd23f" ${O(1)}/><circle cx="16" cy="9" r="1.3" fill="#ffd23f"/><circle cx="27" cy="7" r="1.3" fill="#ffd23f"/>
    <circle cx="6" cy="24" r="6" fill="#ff7a3c" ${O()}/><circle cx="38" cy="24" r="6" fill="#ff7a3c" ${O()}/><circle cx="7" cy="32" r="5" fill="#ff7a3c" ${O()}/><circle cx="37" cy="32" r="5" fill="#ff7a3c" ${O()}/>
    <circle cx="22" cy="29" r="16" fill="#fff4e8" ${O()}/>
    <path d="M14 20 l2 -4 l2 4 Z M26 20 l2 -4 l2 4 Z" fill="#3d8bff"/><circle cx="16" cy="22.5" r="1.7" fill="${INK}"/><circle cx="28" cy="22.5" r="1.7" fill="${INK}"/>
    <path d="M12 33 q10 11 20 0 q-10 5 -20 0 Z" fill="#e8434f" ${O(1)}/><circle cx="11" cy="30" r="2.4" fill="#ffb3c8"/><circle cx="33" cy="30" r="2.4" fill="#ffb3c8"/>
    <path d="M14 44 l8 3 l8 -3 l-3 4 h-10 Z" fill="#8a4fd8" ${O(1)}/>`,
  snowman: () => `<path d="M12 27 L1 19 M28 27 L39 18" stroke="#7a4f2a" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="20" cy="46" r="12" fill="#fff" ${O()}/><circle cx="20" cy="28" r="10" fill="#fff" ${O()}/><circle cx="20" cy="13" r="8.5" fill="#fff" ${O()}/>
    <rect x="13" y="19.5" width="14" height="3" rx="1.4" fill="#e8434f" ${O(.8)}/><path d="M24 21 l3 9 l-3 1 Z" fill="#e8434f" ${O(.8)}/>
    <rect x="13" y="1" width="14" height="6" rx="1" fill="${INK}"/><rect x="10" y="6.5" width="20" height="2" rx="1" fill="${INK}"/>
    <circle cx="17" cy="11" r="1.2" fill="${INK}"/><circle cx="23.5" cy="11" r="1.2" fill="${INK}"/><path d="M16 16.5 q4 2 8 0" fill="none" stroke="${INK}" stroke-width=".9" stroke-linecap="round" stroke-dasharray=".1 1.6"/>
    <circle cx="20" cy="27" r="1.2" fill="${INK}"/><circle cx="20" cy="32" r="1.2" fill="${INK}"/><circle cx="20" cy="42" r="1.3" fill="${INK}"/>`,
  cake: () => `<ellipse cx="23" cy="41" rx="22" ry="3" fill="#e9eef2" ${O()}/>
    <rect x="5" y="24" width="36" height="16" rx="3" fill="#ff9ec4" ${O()}/><path d="M5 27 q4.5 5 9 0 q4.5 5 9 0 q4.5 5 9 0 q4.5 5 9 0" fill="#fff" ${O(.8)}/>
    <rect x="11" y="11" width="24" height="14" rx="3" fill="#fff3d6" ${O()}/><path d="M11 14 q4 4 8 0 q4 4 8 0 q4 4 8 0" fill="#ff7aa8" ${O(.8)}/>
    <circle cx="10" cy="34" r=".9" fill="#3d8bff"/><circle cx="18" cy="36" r=".9" fill="#ffd23f"/><circle cx="27" cy="33" r=".9" fill="#1f9d55"/><circle cx="35" cy="36" r=".9" fill="#8a4fd8"/>
    <circle cx="16" cy="20" r=".9" fill="#e8434f"/><circle cx="30" cy="21" r=".9" fill="#3d8bff"/>`,
  pumpkin: () => `<ellipse cx="23" cy="25" rx="21" ry="13" fill="#ff7a14" ${O()}/><ellipse cx="23" cy="25" rx="11" ry="13" fill="#ff8f2e" ${O(1)}/><ellipse cx="23" cy="25" rx="4" ry="13" fill="#ffa040" ${O(1)}/>
    <path d="M30 12 q8 -6 13 0 q-7 3 -13 0 Z" fill="#4caf50" ${O(1)}/>`,
};
/** Each animal's tail, starting at its tail point (ANIMALS[k].tail). */
const TAIL = {
  donkey: ([x, y]) => `<path d="M${x} ${y} q-5 3 -5 13" fill="none" ${O(2)}/><path d="M${x - 5} ${y + 11} q-3 4 0 7 q3 -3 0 -7 Z" fill="#4a4f5a" ${O(1)}/>`,
  pony: ([x, y]) => `<path d="M${x + 1} ${y - 1} Q${x - 9} ${y} ${x - 8} ${y + 18} Q${x - 4} ${y + 8} ${x + 1} ${y + 3} Z" fill="#5a3418" ${O(1.1)}/>`,
  goat: ([x, y]) => `<path d="M${x + 1} ${y + 1} q-6 -3 -6 -10 q3 3 7 6 Z" fill="#efe6d2" ${O(1.2)}/>`,
  pig: ([x, y]) => `<path d="M${x} ${y} q-4 -1 -4 2 q0 3 3 2 q2 -1 0 -3 q-3 -2 -5 1" fill="none" stroke="#e66f93" stroke-width="1.6" stroke-linecap="round"/>`,
  cow: ([x, y]) => `<path d="M${x} ${y} q-4 3 -4 15" fill="none" ${O(1.8)}/><path d="M${x - 4} ${y + 14} q-3 4 0 7 q3 -3 0 -7 Z" fill="${INK}"/>`,
  sheep: ([x, y]) => `<circle cx="${x - 1.5}" cy="${y}" r="3.4" fill="#f7f3ea" ${O(1.1)}/>`,
  cat: ([x, y]) => `<path d="M${x + 1} ${y} q-8 -2 -6 -14 q1 -3 3 -1" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M${x + 1} ${y} q-8 -2 -6 -14 q1 -3 3 -1" fill="none" stroke="#f2a03d" stroke-width="2.6" stroke-linecap="round"/>`,
  dog: ([x, y]) => `<path d="M${x + 1} ${y} q-7 -3 -6 -12" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M${x + 1} ${y} q-7 -3 -6 -12" fill="none" stroke="#d9a066" stroke-width="2.6" stroke-linecap="round"/>`,
  bunny: ([x, y]) => `<circle cx="${x - 1}" cy="${y}" r="4" fill="#fff" ${O(1.1)}/>`,
  unicorn: ([x, y]) => `<path d="M${x - 2.6} ${y + 1.4} L${x + 4} ${y - 10} L${x + 2.4} ${y + 2.4} Z" fill="#ffd23f" ${O(1)}/><path d="M${x - 1} ${y - 1} l3 -1 M${x} ${y - 4} l2.6 -1" stroke="#c98a00" stroke-width=".8"/>`,
  clown: ([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="#ff2d46" ${O(1.1)}/><circle cx="${x - 1.4}" cy="${y - 1.5}" r="1.2" fill="#fff" opacity=".8"/>`,
  snowman: ([x, y]) => `<path d="M${x} ${y - 1.8} L${x + 10} ${y} L${x} ${y + 1.8} Z" fill="#ff8a1a" ${O(.9)}/>`,
  cake: ([x, y]) => `<rect x="${x - 1.6}" y="${y - 9}" width="3.2" height="9" fill="#8fd6ff" ${O(.8)}/><path d="M${x - 1.6} ${y - 6} l3.2 -2 M${x - 1.6} ${y - 2.5} l3.2 -2" stroke="#fff" stroke-width=".9"/><path d="M${x} ${y - 15} q2.6 3 0 5 q-2.6 -2 0 -5 Z" fill="#ffd23f" ${O(.7)}/>`,
  pumpkin: ([x, y]) => `<path d="M${x - 2.4} ${y + 1.5} q0 -6 3 -9 l2.6 1.4 q-2.6 2.4 -1.6 7.6 Z" fill="#6b8a2a" ${O(1)}/>`,
};
/** What you pin, for the words on screen. */
const PART_WORD = { tail: 'tail', horn: 'horn', nose: 'nose', candle: 'candle', stem: 'stem' };
/** Round 12: each round is set somewhere — ground colour, the strip at the top, and what is round the edge. */
const SCENE = {
  paddock: { ground: '#8fd27a', sky: '#a9dcf2', line: '#6aa857', edge: 'fence' },
  beach: { ground: '#f4dc9a', sky: '#5cc2ea', line: '#e9c46a', edge: 'waves' },
  circus: { ground: '#e7584f', sky: '#ffe9a8', line: '#c43a33', edge: 'bunting', ring: true },
  garden: { ground: '#2f5e48', sky: '#1d2550', line: '#23473a', edge: 'stars', night: true },
  snow: { ground: '#eef5fb', sky: '#bcd9ee', line: '#cfe1ef', edge: 'pines' },
};
function sceneSvg(id) {
  const S = SCENE[id] || SCENE.paddock, n = Math.ceil(BW / 10);
  let edge = '';
  if (S.edge === 'fence') edge = `${Array.from({ length: 17 }, (_, i) => `<rect x="${i * 10 + 1}" y="3" width="3" height="10" rx="1" fill="#e9c48a" ${O(.8)}/>`).join('')}<rect x="0" y="6" width="${BW}" height="2" fill="#d9a865" ${O(.6)}/>`;
  if (S.edge === 'waves') edge = `<path d="M0 9 ${Array.from({ length: n }, (_, i) => `q2.5 -3 5 0 q2.5 3 5 0`).join(' ')}" fill="none" stroke="#fff" stroke-width="1.6"/>`;
  if (S.edge === 'bunting') edge = `<path d="M0 2 Q${BW / 2} 7 ${BW} 2" fill="none" stroke="${INK}" stroke-width=".6"/>${Array.from({ length: 16 }, (_, i) => { const x = i * 10 + 3, y = 2 + 5 * Math.sin(Math.PI * x / BW); return `<path d="M${x} ${y} h6 l-3 5 Z" fill="${['#3d8bff', '#ffd23f', '#1f9d55', '#8a4fd8'][i % 4]}" ${O(.5)}/>`; }).join('')}`;
  if (S.edge === 'stars') edge = `<circle cx="140" cy="5" r="3.6" fill="#fff4c2"/>${Array.from({ length: 12 }, (_, i) => `<circle cx="${(i * 37) % 150 + 4}" cy="${(i * 13) % 8 + 1.5}" r=".6" fill="#fff"/>`).join('')}`;
  if (S.edge === 'pines') edge = Array.from({ length: 16 }, (_, i) => `<path d="M${i * 10 + 5} 1 l4 9 h-8 Z" fill="#3f7a5a" ${O(.5)}/>`).join('');
  return `<rect width="${BW}" height="${BH}" fill="${S.ground}"/>${S.ring ? `<ellipse cx="${BW / 2}" cy="${BH / 2 + 6}" rx="${BW / 2 - 6}" ry="${BH / 2 - 14}" fill="#f6efe2" stroke="#ffd23f" stroke-width="3"/>` : ''}<rect width="${BW}" height="10" fill="${S.sky}"/><path d="M0 10 H${BW}" stroke="${S.line}" stroke-width="2"/>${edge}`;
}
const DECO = {
  flower: (x, y) => `<g transform="translate(${x} ${y})"><path d="M0 0 v-4" stroke="#2f7a2f" stroke-width="1"/><circle cy="-5" r="2.2" fill="#ffd23f" stroke="#e8434f" stroke-width="1.6" stroke-dasharray="1.2 .6"/></g>`,
  rock: (x, y) => `<path d="M${x - 5} ${y} q1 -5 5 -5 q5 0 5 5 Z" fill="#b8b4ad" ${O(1)}/>`,
  bush: (x, y) => `<path d="M${x - 6} ${y} a3.5 3.5 0 0 1 3 -5 a4 4 0 0 1 6 -1 a3.5 3.5 0 0 1 3 6 Z" fill="#4caf50" ${O(1)}/>`,
  mushroom: (x, y) => `<g transform="translate(${x} ${y})"><rect x="-1" y="-3.5" width="2" height="3.5" fill="#fff" ${O(.8)}/><path d="M-3.4 -3.4 a3.4 3 0 0 1 6.8 0 Z" fill="#e8434f" ${O(.8)}/></g>`,
  shell: (x, y) => `<path d="M${x - 4} ${y} q4 -7 8 0 Z M${x - 2} ${y} l2 -5 l2 5" fill="#ffd6c2" ${O(.8)}/>`,
  starfish: (x, y) => `<path transform="translate(${x} ${y - 3})" d="M0 -4 L1.2 -1.2 L4 -1 L1.8 1 L2.6 4 L0 2.4 L-2.6 4 L-1.8 1 L-4 -1 L-1.2 -1.2 Z" fill="#ff8a5c" ${O(.7)}/>`,
  bucket: (x, y) => `<path d="M${x - 3.5} ${y - 6} h7 l-1 6 h-5 Z" fill="#3d8bff" ${O(.8)}/><path d="M${x - 3.5} ${y - 6} q3.5 -4 7 0" fill="none" ${O(.6)}/>`,
  pebble: (x, y) => `<ellipse cx="${x}" cy="${y - 1.5}" rx="3" ry="1.8" fill="#c9bfb0" ${O(.7)}/>`,
  star: (x, y) => `<path transform="translate(${x} ${y - 3})" d="M0 -3.6 L1 -1 L3.6 -1 L1.6 .7 L2.3 3.4 L0 1.9 L-2.3 3.4 L-1.6 .7 L-3.6 -1 L-1 -1 Z" fill="#ffd23f" ${O(.6)}/>`,
  ball: (x, y) => `<circle cx="${x}" cy="${y - 3.5}" r="3.5" fill="#3d8bff" ${O(.8)}/><path d="M${x - 3.5} ${y - 3.5} h7" stroke="#fff" stroke-width="1.4"/>`,
  confetti: (x, y) => `<rect x="${x - 3}" y="${y - 3}" width="2" height="1.2" fill="#8a4fd8"/><rect x="${x + 1}" y="${y - 5}" width="2" height="1.2" fill="#1f9d55" transform="rotate(30 ${x + 2} ${y - 4})"/><rect x="${x}" y="${y - 1}" width="2" height="1.2" fill="#3d8bff"/>`,
  balloon: (x, y) => `<path d="M${x} ${y} q1 -3 0 -5" fill="none" stroke="${INK}" stroke-width=".5"/><ellipse cx="${x}" cy="${y - 8}" rx="3" ry="3.6" fill="#ff5a7a" ${O(.7)}/>`,
  lantern: (x, y) => `<rect x="${x - .4}" y="${y - 9}" width=".8" height="9" fill="#5a4a3a"/><rect x="${x - 2.4}" y="${y - 12}" width="4.8" height="4.6" rx="1" fill="#ffd36b" ${O(.6)}/>`,
  firefly: (x, y) => `<circle cx="${x}" cy="${y - 6}" r="2.4" fill="#fff6a0" opacity=".35"/><circle cx="${x}" cy="${y - 6}" r=".9" fill="#fff6a0"/>`,
  pine: (x, y) => `<path d="M${x} ${y - 11} l5 10 h-10 Z" fill="#3f7a5a" ${O(.7)}/><path d="M${x - 2.4} ${y - 6} q2.4 1.4 4.8 0" fill="none" stroke="#fff" stroke-width="1"/>`,
  snowball: (x, y) => `<circle cx="${x}" cy="${y - 2.6}" r="2.6" fill="#fff" ${O(.7)}/>`,
};
const TRICK_TEXT = { blur: 'Round 1: it goes blurry', hide: 'Round 2: it hides', slide: 'Round 3: it trots away!', spin: 'Round 4: the paddock spins!', swap: 'Round 5: they swap places!' };

function animalSvg(a, i, withTail = false, starred = false) {
  const A = ANIMALS[a.k], flip = a.f ? `transform="translate(${A.w} 0) scale(-1 1)"` : '';
  return `<g class="pt-an${starred ? ' starred' : ''}" data-i="${i}" style="transform: translate(${a.x}px, ${a.y}px) scale(${a.s})"><g ${flip}>${withTail ? TAIL[a.k](A.tail) : ''}${BODY[a.k]()}${starred ? `<circle cx="${A.w / 2}" cy="-2" r="3" fill="#ffd23f" ${O(1)}/>` : ''}</g></g>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="pt-top"><span class="pt-title">Pin the Tail</span><span class="pt-round"></span><span class="clock"><b>--</b></span></div>
    <div class="pt-banner"></div>
    <div class="pt-boardwrap">
      <svg class="pt-board" viewBox="0 0 ${BW} ${BH}" preserveAspectRatio="xMidYMid meet" style="aspect-ratio:${BW} / ${BH}">
        <defs><filter id="pt-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.4"/></filter>
          <radialGradient id="pt-glow"><stop offset="0" stop-color="#fff7b0"/><stop offset=".6" stop-color="#ffd23f" stop-opacity=".7"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient></defs>
        <g class="pt-world" style="transform-origin:${BW / 2}px ${BH / 2}px">
          <g class="pt-scene">${sceneSvg('paddock')}</g>
          <g class="pt-deco"></g><g class="pt-animals"></g><g class="pt-star"></g>
        </g>
        <g class="pt-marks"></g>
      </svg>
      <div class="pt-hint"></div>
    </div>
    <div class="pt-actions"><button class="pt-done big-btn" disabled>Done</button></div>
    <div class="pt-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="pt-st"></strong>')).join('')}</div>
    <p class="pt-note"></p>`;
  const $ = s => ui.querySelector(s);
  const svg = $('.pt-board'), world = $('.pt-world');
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.pt-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, myPin = null, done = false, timers = [];

  const pinSvg = (p, [x, y], cls = '', label = '') => `<g class="pt-pin ${cls}" style="--seat:${p.color}" transform="translate(${x} ${y})">
      <path d="M0 0 L1.3 -6 h-2.6 Z" fill="#666"/><circle cy="-7.4" r="3.4" fill="${p.color}" ${O(1)}/><circle cx="-1" cy="-8.4" r="1" fill="#fff" opacity=".8"/><circle r=".9" fill="${INK}"/>
      ${label ? `<text y="5.6" text-anchor="middle" class="pt-lbl">${esc(label)}</text>` : ''}</g>`;
  function paintMine() {
    if (phase !== 'guess') return;
    $('.pt-marks').innerHTML = myPin && me != null ? pinSvg(byPid.get(me), myPin, 'mine', 'YOU') : '';
    const d = $('.pt-done'); d.disabled = !myPin || done; d.textContent = done ? 'Pinned!' : myPin ? 'Done' : 'Tap the field';
  }
  svg.addEventListener('pointerdown', e => {
    if (watching || phase !== 'guess' || done) return;
    const m = svg.getScreenCTM(); if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    if (pt.x < 0 || pt.x > BW || pt.y < 0 || pt.y > BH) return;
    myPin = [Math.round(pt.x * 10) / 10, Math.round(pt.y * 10) / 10];
    ctx.send('pin', myPin); ctx.sfx('pick'); paintMine();
  });
  $('.pt-done').addEventListener('click', () => { if (watching || phase !== 'guess' || !myPin || done) return; done = true; ctx.send('done'); ctx.sfx('good'); paintMine(); });

  function setRot(deg, ms) { world.style.transition = ms ? `transform ${ms}ms cubic-bezier(.5,0,.3,1)` : 'none'; world.style.transform = `rotate(${deg}deg)`; }
  function drawAnimals(list, { tail = false, starIndex = -1, blur = false } = {}) {
    const g = $('.pt-animals');
    g.innerHTML = (list || []).map((a, i) => animalSvg(a, i, tail, i === starIndex)).join('');
    g.classList.toggle('blurred', blur);
  }
  let sceneId = 'paddock';
  function drawDeco(deco, scene) {
    if (scene && scene !== sceneId) { sceneId = scene; $('.pt-scene').innerHTML = sceneSvg(scene); ui.dataset.scene = scene; }
    $('.pt-deco').innerHTML = (deco || []).map(d => (DECO[d.k] || DECO.flower)(d.x, d.y)).join('');
  }

  function enter(g) {
    timers.forEach(clearTimeout); timers = [];
    $('.pt-star').innerHTML = ''; $('.pt-marks').innerHTML = '';
    if (g.phase === 'show') {
      setRot(0, 0); drawDeco(g.deco, g.scene);
      drawAnimals(g.animals, { starIndex: g.trick === 'swap' ? 0 : -1 });
      const [x, y] = g.star;
      $('.pt-star').innerHTML = `<g class="pt-target" transform="translate(${x} ${y})"><circle r="9" fill="url(#pt-glow)"/><path d="M0 -5 L1.5 -1.6 L5 -1.5 L2.3 .8 L3.1 4.4 L0 2.4 L-3.1 4.4 L-2.3 .8 L-5 -1.5 L-1.5 -1.6 Z" fill="#ffd23f" ${O(.9)}/></g>`;
      myPin = null; done = false;
      ctx.sfx('open');
    }
    if (g.phase === 'trick') {
      drawAnimals(g.animals, { starIndex: g.trick === 'swap' ? 0 : -1 });
      const ms = 1300;
      if (g.trick === 'spin') { requestAnimationFrame(() => requestAnimationFrame(() => setRot(g.rot, ms))); ctx.sfx('throw'); }
      else {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          ui.querySelectorAll('.pt-an').forEach((el, i) => { const a = g.to[i]; el.style.transition = `transform ${ms}ms cubic-bezier(.5,0,.3,1)`; el.style.transform = `translate(${a.x}px, ${a.y}px) scale(${a.s})`; });
        }));
        ctx.sfx('throw');
      }
    }
    if (g.phase === 'guess') {
      setRot(g.rot, 0); drawDeco(g.deco, g.scene);
      if (g.trick === 'blur') drawAnimals(g.animals, { blur: true });
      else { ui.querySelectorAll('.pt-an').forEach(el => el.classList.add('gone')); timers.push(setTimeout(() => drawAnimals([]), 400)); }
      ctx.sfx('tap'); paintMine();
    }
    if (g.phase === 'reveal') {
      const r = g.reveal;
      setRot(g.rot, 0); drawDeco(g.deco, g.scene);
      drawAnimals(g.animals, { tail: true, starIndex: g.trick === 'swap' ? 0 : -1 });
      const [tx, ty] = r.target;
      const order = players.filter(p => r.pins[p.pid]).sort((a, b) => r.dist[b.pid] - r.dist[a.pid]);   // closest drawn last (on top)
      $('.pt-marks').innerHTML = order.map(p => `<line x1="${r.pins[p.pid][0]}" y1="${r.pins[p.pid][1]}" x2="${tx}" y2="${ty}" stroke="${p.color}" stroke-width="1" stroke-dasharray="2 1.4"/>`).join('')
        + `<g class="pt-answer" transform="translate(${tx} ${ty})"><circle r="4.4" fill="none" stroke="#fff" stroke-width="1.6"/><circle r="4.4" fill="none" stroke="${INK}" stroke-width=".8"/></g>`
        + order.map(p => pinSvg(p, r.pins[p.pid], r.closest.includes(p.pid) ? 'best' : '', `${p.pid === me ? 'YOU' : p.name} +${r.gain[p.pid]}`)).join('');
      if (me != null) ctx.sfx(r.closest.includes(me) || (init.solo && r.gain[me] >= 7) ? 'win' : r.gain[me] > 0 ? 'good' : 'bad');
    }
    if (g.phase === 'end') ctx.sfx('win');
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.pt-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.pt-st'); let t = '', cls = '';
      if (g.phase === 'guess') { if (g.done.includes(p.pid)) { t = 'pinned'; cls = 'in'; } else if (g.pinned.includes(p.pid)) t = 'placing…'; else t = 'thinking…'; }
      if (g.phase === 'reveal') { const r = g.reveal; t = r.pins[p.pid] ? `+${r.gain[p.pid]}` : 'no pin'; cls = r.closest.includes(p.pid) ? 'best' : ''; }
      st.textContent = t; st.className = 'pt-st ' + cls; el.classList.toggle('in', cls === 'in');
    }
  }
  function note(g) {
    const part = PART_WORD[g.part] || 'tail';
    if (g.phase === 'ready') return 'Watch for the star: that is where the tail (or the horn, or the nose…) goes!';
    if (g.phase === 'show') return g.trick === 'swap' ? 'Remember the one with the gold dot!' : 'Remember the star!';
    if (g.phase === 'trick') return g.trick === 'spin' ? 'Round and round…' : 'Keep your eye on it!';
    if (g.phase === 'guess') return watching ? `${g.pinned.length} of ${players.length} pinned` : done ? 'Pinned! Waiting for the others…' : `Tap where the ${part} goes!`;
    if (g.phase === 'reveal') { const w = g.reveal.closest.map(p => byPid.get(p)?.name); return w.length ? `${w.join(' and ')} pinned it closest!` : init.solo ? `+${g.reveal.gain[me ?? players[0].pid]} points` : 'Nobody got close!'; }
    return 'What a game! Most points wins.';
  }

  return {
    priv(d) { if (phase === 'guess' && d.pin && !myPin) { myPin = d.pin; done = d.done; paintMine(); } },
    state(g) {
      if (g.phase !== phase || g.round !== round) { phase = g.phase; round = g.round; enter(g); }
      ui.dataset.phase = g.phase; ui.dataset.trick = g.trick || '';
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'guess' && g.left <= 3);
      $('.pt-round').textContent = g.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      $('.pt-banner').textContent = g.trick && g.phase !== 'end' ? TRICK_TEXT[g.trick] : '';
      $('.pt-hint').textContent = g.phase === 'show' ? `The ${PART_WORD[g.part] || 'tail'} goes here!` : g.phase === 'guess' && !watching && !myPin ? 'Tap!' : '';
      paintChips(g);
      $('.pt-note').textContent = note(g);
    },
    dispose() { timers.forEach(clearTimeout); },
  };
}
