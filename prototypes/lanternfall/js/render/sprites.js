// ASCII pixel sprites (docs/10 §5.22) -> one RGBA atlas. Pure (no canvas): returns a Uint8Array the
// renderer uploads. Palette values: "#rrggbb", "#rrggbb!" (emissive: alpha 254 marks it for the shader),
// "." or null = transparent. Frames are rows of equal-length strings.
import { hexToRgb } from '../core/math.js';

export function buildAtlas(json, W = 512) {
  const entries = []; // { id, anim, frame, w, h, rows, pal }
  for (const [id, sp] of Object.entries(json.sprites)) {
    const pal = { ...(json.palettes[sp.palette] || {}), ...(sp.pal || {}) };
    for (const [anim, a] of Object.entries(sp.anims)) a.frames.forEach((rows, k) => entries.push({ id, anim, frame: k, rows: expand(rows, json.frames, id), pal, h: 0, w: 0 }));
  }
  for (const e of entries) { e.h = e.rows.length; e.w = Math.max(...e.rows.map(r => r.length)); }
  // shelf packing
  entries.sort((a, b) => b.h - a.h);
  let x = 1, y = 1, rowH = 0;
  for (const e of entries) { if (x + e.w + 1 > W) { x = 1; y += rowH + 1; rowH = 0; } e.x = x; e.y = y; x += e.w + 1; rowH = Math.max(rowH, e.h); }
  let H = 1; while (H < y + rowH + 2) H *= 2;
  const rgba = new Uint8Array(W * H * 4);
  // white texel at (0,0) for untextured quads
  rgba.set([255, 255, 255, 255], 0);
  const cache = {};
  for (const e of entries) {
    e.rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]; const v = e.pal[ch]; if (!v || ch === '.') continue;
      let c = cache[v]; if (!c) { const em = v.endsWith('!'); c = cache[v] = [...hexToRgb(v.replace('!', '')), em ? 254 : 255]; }
      rgba.set(c, ((e.y + ry) * W + e.x + rx) * 4);
    } });
  }
  const index = {};
  for (const e of entries) { ((index[e.id] ||= {})[e.anim] ||= [])[e.frame] = [e.x, e.y, e.w, e.h]; }
  const meta = {}; for (const [id, sp] of Object.entries(json.sprites)) meta[id] = { anchor: sp.anchor || [0, 0], anims: Object.fromEntries(Object.entries(sp.anims).map(([k, a]) => [k, { fps: a.fps || 6, n: a.frames.length, loop: a.loop !== false }])) };
  return { rgba, w: W, h: H, index, meta,
    rect(id, anim, t) { const s = index[id]; if (!s) return null; const fr = s[anim] || s.idle || Object.values(s)[0]; const m = meta[id].anims[anim] || { fps: 6, n: fr.length, loop: true };
      let f = Math.floor(t * m.fps); f = m.loop ? f % fr.length : Math.min(fr.length - 1, f); return fr[f]; } };
}
// frames may reference a named frame from json.frames by string "@name" (reuse) or "@name|flip"
function expand(rows, named, id) { if (typeof rows === 'string' && rows.startsWith('@')) return named[rows.slice(1)]; return rows; }
