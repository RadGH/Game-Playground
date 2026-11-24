// Readability check for browser tests: the "strict" half of tools/walk-screens.mjs (added 2026-11-15, idea taken from
// Claude Code Game Studios' small check, MIT, github.com/Donchitos/Claude-Code-Game-Studios). Runs only for games
// whose tests/walk.mjs says `strict: true` — every game started from 2026-11-15 on; older games are not held to it
// (owner 2026-11-15: "use the new features going forward").
//   import { screenLookProblems } from '../../../shared/test/screen-look.js';
//   const bad = await page.evaluate(screenLookProblems, { minPx: 12, minContrast: 3 });
// Finds, on VISIBLE text only:
//   * text too small    — font smaller than minPx CSS pixels (default 12)
//   * low contrast      — text colour against the nearest solid background under 3:1 (skipped when the background is a
//                         picture, a gradient or a canvas: it can't be measured from the page, the screenshot shows it)
//   * text overlap      — two separate texts whose boxes share more than a quarter of the smaller one
//   * text off screen   — text cut off by the window edge that no scroller can bring back
// Mark a deliberate exception with data-lint-skip on the element (e.g. a tiny decorative glyph).
export function screenLookProblems(opts = {}) {
  const minPx = opts.minPx ?? 12, minContrast = opts.minContrast ?? 3;
  const out = [], seen = new Set();
  const add = (what, text) => { const k = what + '|' + text; if (!seen.has(k)) { seen.add(k); out.push({ what, text }); } };
  const W = window.innerWidth, H = window.innerHeight;
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const rgba = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  // the solid colour behind an element, or null when something unmeasurable (picture, gradient, canvas) is behind it
  const backdrop = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = rgba(s.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
      if (e === document.documentElement && !layers.length) return null;
    }
    if (!layers.length || layers[layers.length - 1].a < 0.99) {
      // reaches the bottom without a solid colour: a canvas or video under the UI decides it — can't measure
      if (document.querySelector('canvas, video')) return null;
      layers.push({ r: 255, g: 255, b: 255, a: 1 });
    }
    let c = layers.pop(); while (layers.length) c = mix(layers.pop(), c); return c;
  };
  const scrollableUp = el => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2)) return true; } return document.documentElement.scrollHeight > H + 2; };
  const name = t => t.replace(/\s+/g, ' ').slice(0, 50);
  const clipTo = (el, r) => {
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let e = el; e && e !== document.body; e = e.parentElement) {            // the text's own box clips too (an ellipsis)
      const s = getComputedStyle(e);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const c = e.getBoundingClientRect();
      if (s.overflowX !== 'visible') { L = Math.max(L, c.left); R = Math.min(R, c.right); }
      if (s.overflowY !== 'visible') { T = Math.max(T, c.top); B = Math.min(B, c.bottom); }
      if (R - L < 1 || B - T < 1) return null;
    }
    return { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T };
  };

  const boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); if (!t) continue;
    // a tooltip floats over other text on purpose — skip it
    const el = n.parentElement; if (!el || el.closest('script,style,noscript,[data-lint-skip],[aria-hidden="true"],[role="tooltip"],.tipbox') || !visible(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter(r => r.width >= 1 && r.height >= 1); if (!rects.length) continue;
    const s = getComputedStyle(el);
    const px = parseFloat(s.fontSize);
    if (px < minPx && /[A-Za-z0-9]/.test(t)) add('text too small', `${Math.round(px * 10) / 10}px "${name(t)}"`);
    const fg = rgba(s.color), bg = backdrop(el);
    if (fg && bg && fg.a > 0.3) { const r = ratio(mix(fg, bg), bg); if (r < minContrast) add('low contrast', `${Math.round(r * 10) / 10}:1 "${name(t)}"`); }
    for (const r of rects) {
      // clipped by an ancestor with overflow hidden? then what shows is what the designer meant — skip off-screen
      if ((r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) && !scrollableUp(el)) { add('text off screen', `"${name(t)}"`); break; }
    }
    // for overlaps, only the part the player can see counts: cut each box to every clipping ancestor (a scrolled
    // list hides the rows under its edge — those rows do not overlap the panel below it)
    const seen = rects.map(r => clipTo(el, r)).filter(Boolean);
    if (seen.length) boxes.push({ el, t, rects: seen });
  }
  // overlap between two texts that are not the same element (and neither holds the other)
  const area = r => Math.max(0, r.width) * Math.max(0, r.height);
  const inter = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 0 && h > 0 ? w * h : 0; };
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const A = boxes[i], B = boxes[j];
    if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
    let hit = false;
    for (const a of A.rects) { for (const b of B.rects) { const x = inter(a, b); if (x > 0.25 * Math.min(area(a), area(b))) { hit = true; break; } } if (hit) break; }
    if (hit) add('text overlap', `"${name(A.t)}" over "${name(B.t)}"`);
  }
  return out;
}

// Fraction of pixels that differ between two PNG screenshots (base64), measured in a page with a canvas.
// Used by walk-screens' `input` (controls do something) and `live` (screen not frozen) checks.
export async function pixelChange({ a, b, tol = 24 }) {
  const load = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = 'data:image/png;base64,' + src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
  const data = img => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
  const da = data(ia), db = data(ib); let n = 0;
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol || Math.abs(da[i + 2] - db[i + 2]) > tol) n++;
  return n / (w * h);
}
