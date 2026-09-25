// Pixel icons for HUD buttons. Buildings, units and Hollow use their game sprites; tools,
// categories, abilities, research and targeting modes are 11x11 ASCII pixel maps below.
// Legend: . empty, a accent, l light, m mid, d dark, w white, y yellow, r red, g green, o orange, p purple

import { iconCanvas, PAL } from '../render/sprites.js';

const C = { a: '#4ee6ff', l: '#9cc4ff', m: '#36568c', d: '#131d36', w: '#ffffff', y: '#ffe066', r: '#ff5a6e', g: '#6dff9e', o: '#f59f55', p: '#c18bff', c: '#46e8f5' };

const MAPS = {
  'cat:walls': [
    '...........', '.lll.lll.l.', '.mmm.mmm.m.', '...........', '.ll.lll.ll.', '.mm.mmm.mm.', '...........', '.lll.lll.l.', '.mmm.mmm.m.', '...........', '...........'],
  'cat:turrets': [
    '...........', '.......aa..', '......aa...', '.....aa....', '...lll.....', '..lllll....', '..lmmml....', '..lmmml....', '.mmmmmmm...', '.ddddddd...', '...........'],
  'cat:economy': [
    '...........', '....y......', '...yy......', '..yyy......', '.yyyyyyy...', '.....yyy...', '.....yy....', '.....y.....', '....y......', '...........', '...........'],
  'cat:base': [
    '...........', '.....a.....', '....aaa....', '...lllll...', '..lmmmmml..', '..lm...ml..', '..lm.a.ml..', '..lm...ml..', '..lmmmmml..', '..ddddddd..', '...........'],
  'tool:dig': [
    '...........', '..yyyyy....', '.y.....y...', '.....ll....', '....ll.....', '...ll......', '..ll.......', '.ll........', '...........', 'ooooooooooo', 'o.o.o.o.o.o'],
  'tool:salvage': [
    '...........', '..y.....y..', '...y...y...', '....y.y....', '.....y.....', '....y.y....', '...y...y...', '..y.....y..', '...........', '.lll.lll...', '...........'],
  'tool:back': [
    '...........', '...a.......', '..aa.......', '.aaaaaaaa..', '..aa....a..', '...a....a..', '........a..', '........a..', '....aaaaa..', '...........', '...........'],
  'tool:amove': [
    '...........', '.....r.....', '.....r.....', '..rrrrrrr..', '.....r.....', '.r...r...r.', '.rr.....rr.', '..rr...rr..', '...rrrrr...', '...........', '...........'],
  'tool:stop': [
    '...........', '...rrrrr...', '..rrrrrrr..', '.rrwwwwwrr.', '.rrwwwwwrr.', '.rrwwwwwrr.', '.rrrrrrrrr.', '..rrrrrrr..', '...rrrrr...', '...........', '...........'],
  'tool:hold': [
    '...........', '....lll....', '...lllll...', '...lmmml...', '...lmmml...', '...lmmml...', '...lmmml...', '..lllllll..', '.ddddddddd.', '...........', '...........'],
  'tool:patrol': [
    '...........', '..y........', '.yyyyyyy...', '..y....y...', '.......y...', '...y...y...', '...y....y..', '...yyyyyyy.', '........y..', '...........', '...........'],
  'tool:deploy': [
    '...........', '....aaa....', '...ammma...', '...mmmmm...', '..d.m.m.d..', '.d..m.m..d.', 'd...m.m...d', '...........', 'yyyyyyyyyyy', '...........', '...........'],
  'tool:rally': [
    '...........', '..aaaaa....', '..aaaaaa...', '..aaaaa....', '..a........', '..a........', '..a........', '..a........', '.ddd.......', '...........', '...........'],
  'tool:build': [
    '...........', '.......ll..', '......lll..', '.....lll...', '....ll.....', '...ll......', '..yy.......', '.yyy.......', '.yy........', '...........', '...........'],
  'tool:on': [
    '...........', '.....g.....', '..g..g..g..', '.g...g...g.', '.g.......g.', '.g.......g.', '..g.....g..', '...ggggg...', '...........', '...........', '...........'],
  'tool:off': [
    '...........', '.....r.....', '..r..r..r..', '.r...r...r.', '.r.......r.', '.r.......r.', '..r.....r..', '...rrrrr...', '...........', '...........', '...........'],
  'ability:overcharge': [
    '...........', '......y....', '.....yy....', '....yyy....', '...yyyyyy..', '.....yyy...', '.....yy....', '....yy.....', '....y......', '...........', '...........'],
  'ability:blink': [
    '...........', '..w.....w..', '...a...a...', '....aaa....', '.waaawaaaw.', '....aaa....', '...a...a...', '..w.....w..', '...........', '...........', '...........'],
  'ability:orbital': [
    '....www....', '....www....', '....aaa....', '....aaa....', '....aaa....', '....aaa....', '....aaa....', '...aaaaa...', '..yyyyyyy..', '.yyyyyyyyy.', 'ooooooooooo'],
  'target:nearest': [
    '...........', '.....r.....', '...rrrrr...', '..r..r..r..', '..r.rwr.r..', '.rrrwwwrrr.', '..r.rwr.r..', '..r..r..r..', '...rrrrr...', '.....r.....', '...........'],
  'target:strongest': [
    '...........', '....rrr....', '...rrrrr...', '...rrrrr...', '....rrr....', '..rrrrrrr..', '.rrrrrrrrr.', '.rrrrrrrrr.', '.rrrrrrrrr.', '...........', '...........'],
  'target:weakest': [
    '...........', '...........', '...........', '.....r.....', '....rrr....', '.....r.....', '....rrr....', '....r.r....', '...........', '...........', '...........'],
  'target:air': [
    '...........', '.....a.....', '....aaa....', '...aaaaa...', '.aaaaaaaaa.', '....aaa....', '....aaa....', '...aa.aa...', '...........', 'ddddddddddd', '...........'],
  'target:core': [
    '...........', '.....a.....', '....aaa....', '...aawaa...', '....aaa....', '.....a.....', '.r.......r.', '.rr.....rr.', '.rrr...rrr.', '...........', '...........'],
  'research:generic': [
    '...........', '....lll....', '....l.l....', '....l.l....', '...l...l...', '..l.ppp.l..', '.l.ppppp.l.', '.lppppppl..', '..lllllll..', '...........', '...........'],
};

const RESEARCH_TINT = { hardened: 'l', drills: 'c', capacitors: 'y', lenses: 'a', assembly: 'g', ricochet: 'p', lattice: 'o', deepcore: 'w' };

const cache = new Map();

export function iconFor(icon, size = 30) {
  if (!icon) return null;
  const key = `${icon.kind}:${icon.type}:${size}`;
  if (cache.has(key)) return cache.get(key);
  let c;
  if (icon.kind === 'b' || icon.kind === 'u' || icon.kind === 'e') c = iconCanvas(icon.kind === 'b' ? 'b' : 'u', icon.type, icon.team || (icon.kind === 'e' ? 3 : 1), size);
  else if (icon.kind === 'wall') c = wallIcon(icon.type, size);
  else {
    let map = MAPS[`${icon.kind}:${icon.type}`];
    let tint = null;
    if (!map && icon.kind === 'research') { map = MAPS['research:generic']; tint = RESEARCH_TINT[icon.type]; }
    c = drawMap(map || MAPS['tool:build'], size, tint);
  }
  cache.set(key, c);
  return c;
}

function drawMap(map, size, tint) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const n = map.length;
  const s = Math.floor(size / n);
  const off = Math.floor((size - s * n) / 2);
  for (let y = 0; y < n; y++) for (let x = 0; x < map[y].length; x++) {
    let ch = map[y][x];
    if (ch === '.') continue;
    if (tint && ch === 'p') ch = tint;
    ctx.fillStyle = C[ch] || '#fff';
    ctx.fillRect(off + x * s, off + y * s, s, s);
  }
  return c;
}

const WALL_COL = { panel: ['#8fa3c7', '#7488ad'], plate: ['#d2d9e3', '#a6afbf'], prism: ['#d6a8ff', '#9c5cf0'], foam: ['#c7e38c', '#9dbd60'] };
function wallIcon(type, size) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const [a, b] = WALL_COL[type] || ['#888', '#666'];
  const s = Math.floor(size / 10);
  for (let y = 1; y < 9; y++) for (let x = 2; x < 8; x++) {
    ctx.fillStyle = (x + y) % 3 === 0 ? b : a;
    ctx.fillRect(x * s, y * s, s, s);
  }
  ctx.fillStyle = '#4ee6ff';
  ctx.fillRect(2 * s, s, 6 * s, 1);
  return c;
}
