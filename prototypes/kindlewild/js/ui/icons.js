// Tile pictures, drawn once and cached as data URLs: a creature is its own sprite, a material is
// a little swatch of itself (with its glow), spells and tools are an emoji over a coloured glow.
import { hexRgb } from '../sim/materials.js';
import { hash2 } from '../sim/rng.js';

const cache = new Map();

export function pageInfo(data, page) {
  const [kind, id] = page.split(':');
  if (kind === 'spell') { const d = data.spells.spells[id]; return { kind, id, name: d?.name || id, desc: d?.desc || '', color: d?.color || '#c26bff' }; }
  if (kind === 'material') { const m = data.compiled.list[data.compiled.id[id]]; return { kind, id, name: m?.name || id, desc: matDesc(data, id), color: m?.color }; }
  if (kind === 'creature') { const s = data.species[id]; return { kind, id, name: s?.name || id, desc: creatureDesc(s), color: '#7cf09a' }; }
  return { kind, id, ...(TOOLS[id] || { name: id, desc: '' }) };
}

export const TOOLS = {
  erase: { name: 'Clear', desc: 'Sweep away whatever stands on the ground.', color: '#a0b0c0' },
  torch: { name: 'Torch', desc: 'Light a fire wherever you touch.', color: '#ff9a3a' },
  grab: { name: 'Grab', desc: 'Pick a creature up, carry it, and fling it.', color: '#ffd0a0' },
  inspect: { name: 'Look', desc: 'Touch anything to see what it is and how it is doing.', color: '#a0d8ff' },
};

function matDesc(data, id) {
  const m = data.materials.list.find(x => x.id === id);
  if (!m) return '';
  const bits = [];
  if (m.layer === 'ground') bits.push('A kind of ground.');
  if (m.liquid) bits.push('Flows downhill.');
  if (m.ignite) bits.push('Burns.');
  if (m.explode) bits.push('Explodes when lit!');
  if (m.solid) bits.push('Blocks the way.');
  if (m.emit) bits.push('Glows.');
  if (m.hot) bits.push('Very hot.');
  if (m.corrodes) bits.push('Eats through stone.');
  if (m.heals) bits.push('Heals the living.');
  if (m.source) bits.push(`Pours out ${m.source} forever.`);
  if (m.devours) bits.push('Devours the land around it.');
  if (m.chill) bits.push('A cold fire that freezes.');
  if (m.sprouts) bits.push('Grows into a tree.');
  if (m.spreads) bits.push('Creeps outward.');
  return bits.join(' ');
}
function creatureDesc(s) {
  if (!s) return '';
  const bits = [];
  if (s.kind === 'person') bits.push('Lives in a village, works, raises a family.');
  if (s.diet === 'graze') bits.push('Grazes.');
  if (s.diet === 'hunt') bits.push('Hunts.');
  if (s.breed) bits.push('Breeds.');
  if (s.flies) bits.push('Flies.');
  if (s.fireproof) bits.push('Fireproof.');
  if (s.team === 'monster') bits.push('Hostile.');
  if (s.breath) bits.push('Breathes fire!');
  if (s.splits) bits.push('Splits when struck.');
  if (s.stoneAtDawn) bits.push('Turns to stone at sunrise.');
  if (s.reborn) bits.push('Rises again from its ashes.');
  if (s.heal) bits.push('Heals friends.');
  return bits.join(' ');
}

/** A data URL picture for a page (or null for emoji pages). */
export function pageArt(data, page, size = 32) {
  const key = page + '@' + size;
  if (cache.has(key)) return cache.get(key);
  const [kind, id] = page.split(':');
  let url = null;
  if (kind === 'material') url = materialArt(data, id, size);
  else if (kind === 'creature') url = creatureArt(data, id, size);
  else url = iconUrl(data, kind + '-' + id) || badgeArt(pageInfo(data, page), size);
  cache.set(key, url);
  return url;
}

/** The URL of a drawn icon (assets/icons/<id>.webp), or null if it has not been made yet. */
export function iconUrl(data, id) {
  if (!id || !data.icons?.icons?.includes(id)) return null;
  return new URL('../../assets/icons/' + id + '.webp', import.meta.url).href;
}

/** Stand-in until an icon exists: a coloured rune disc with the first letter. */
function badgeArt(info, n) {
  const c = canvas(n), g = c.getContext('2d');
  const col = info.color || '#c26bff';
  g.fillStyle = '#1e1630'; g.fillRect(0, 0, n, n);
  g.fillStyle = col; g.globalAlpha = 0.35; g.beginPath(); g.arc(n / 2, n / 2, n * 0.42, 0, 7); g.fill(); g.globalAlpha = 1;
  g.strokeStyle = col; g.lineWidth = Math.max(1, n / 16); g.beginPath(); g.arc(n / 2, n / 2, n * 0.42, 0, 7); g.stroke();
  g.fillStyle = '#fff'; g.font = `bold ${Math.round(n * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((info.name || '?')[0].toUpperCase(), n / 2, n / 2 + 1);
  return c.toDataURL();
}

function canvas(n) {
  const c = typeof OffscreenCanvas !== 'undefined' && false ? new OffscreenCanvas(n, n) : document.createElement('canvas');
  c.width = n; c.height = n;
  return c;
}

function materialArt(data, id, n) {
  const M = data.compiled;
  const m = M.id[id];
  if (m === undefined) return null;
  const c = canvas(n), g = c.getContext('2d');
  const img = g.createImageData(n, n);
  const r0 = M.r[m], g0 = M.g[m], b0 = M.b[m];
  const v = M.vary[m];
  const row = data.materials.list[m];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const o = (y * n + x) * 4;
    const dx = x - n / 2 + 0.5, dy = y - n / 2 + 0.5;
    const inside = Math.hypot(dx, dy) < n * 0.46 || row.layer === 'ground';
    if (!inside) { img.data[o + 3] = 0; continue; }
    let k = ((hash2(x + m * 7, y) - 128) * v) >> 7;
    if (M.pattern[m] === 1 && y % 3 === 0) k -= 16;
    if (M.pattern[m] === 2 && (y % 4 === 0 || (x + ((y / 4) | 0) * 3) % 6 === 0)) k -= 22;
    if (M.tree[m]) k += (hash2(x >> 2, y >> 2) - 128) >> 2;
    if (M.liquid[m]) k += Math.sin((x + y) * 0.6) * 10;
    let r = r0 + k, gg = g0 + k, b = b0 + k;
    if (id === 'flowers' && hash2(x, y) % 4 === 0) { const p = [[235, 90, 160], [250, 210, 70], [150, 120, 250], [255, 255, 255]][hash2(y, x) % 4]; [r, gg, b] = p; }
    if (id === 'fire') { const h = hash2(x, y) ; r = 255; gg = 80 + (h >> 1); b = 20; }
    if (M.emit[m]) { const glow = 1 - Math.hypot(dx, dy) / (n * 0.5); r += glow * 60; gg += glow * 60; b += glow * 60; }
    img.data[o] = Math.max(0, Math.min(255, r));
    img.data[o + 1] = Math.max(0, Math.min(255, gg));
    img.data[o + 2] = Math.max(0, Math.min(255, b));
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

function creatureArt(data, id, n) {
  const sp = data.species[id];
  if (!sp) return null;
  const f = sp.frames.walk || sp.frames.fly;
  const sw = Math.max(...f.px.map(p => p.x)) - Math.min(...f.px.map(p => p.x)) + 1;
  const sh = f.h;
  const scale = Math.max(1, Math.floor((n - 4) / Math.max(sw, sh)));
  const c = canvas(n), g = c.getContext('2d');
  const minX = Math.min(...f.px.map(p => p.x));
  const ox = Math.floor((n - sw * scale) / 2), oy = Math.floor((n - sh * scale) / 2);
  for (const p of f.px) {
    let rgb = p.rgb;
    if (p.tint) { const l = sp.tintRgb[p.tint]; rgb = l ? l[0] : [200, 200, 200]; }
    g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    if (p.glow) { g.shadowColor = g.fillStyle; g.shadowBlur = 4; } else g.shadowBlur = 0;
    g.fillRect(ox + (p.x - minX) * scale, oy + (p.y + sh - 1) * scale, scale, scale);
  }
  return c.toDataURL();
}
