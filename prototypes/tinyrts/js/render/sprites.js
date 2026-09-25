// Code-drawn pixel sprites. Each building/unit type has a small draw function that paints
// rectangles at cell resolution with the team palette. Static bodies are cached per
// (type, team, facing, frame) in offscreen canvases; moving parts (barrels, beams, lights) are
// drawn live by the entity renderer.

export const PAL = {
  1: { dark: '#131d36', body: '#22355a', mid: '#36568c', light: '#9cc4ff', accent: '#4ee6ff', glow: '#d8fbff', trim: '#e8f1ff' },
  2: { dark: '#26120f', body: '#48231a', mid: '#7a3a26', light: '#ffc48a', accent: '#ffab40', glow: '#fff0d0', trim: '#ffe2c0' },
  3: { dark: '#12051a', body: '#2d0b3a', mid: '#57156d', light: '#d070ff', accent: '#ff4fd8', glow: '#ffffff', trim: '#ffb8f0' },
};

const cache = new Map();
const NORMAL_HOLLOW = { ...PAL[3] };
const NORMAL_UMBRA = { ...PAL[2] };

// High-contrast mode: brighter, more saturated enemy colors. Clears the sprite cache.
export function setHighContrast(on) {
  Object.assign(PAL[3], on ? { mid: '#8a1aa8', light: '#ff66ff', accent: '#ff00ff', body: '#4a0f5c' } : NORMAL_HOLLOW);
  Object.assign(PAL[2], on ? { light: '#ffd23a', accent: '#ffcc00', mid: '#a0501a' } : NORMAL_UMBRA);
  cache.clear();
}

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Painter helpers bound to a context + palette.
function painter(ctx, pal) {
  const f = (x, y, w, h, col) => { ctx.fillStyle = pal[col] || col; ctx.fillRect(x, y, w, h); };
  return {
    r: f,
    p: (x, y, col) => f(x, y, 1, 1, col),
    box(x, y, w, h, fill, edge) { f(x, y, w, h, edge || 'dark'); f(x + 1, y + 1, w - 2, h - 2, fill); },
    hline: (x, y, w, col) => f(x, y, w, 1, col),
    vline: (x, y, h, col) => f(x, y, 1, h, col),
    tri(x, y, w, h, col, up = true) {
      for (let k = 0; k < h; k++) {
        const t = up ? k : h - 1 - k;
        const span = Math.max(1, Math.round((w * (t + 1)) / h));
        f(x + Math.floor((w - span) / 2), y + k, span, 1, col);
      }
    },
    diamond(cx, cy, r, col) {
      for (let k = -r; k <= r; k++) { const s = r - Math.abs(k); f(cx - s, cy + k, s * 2 + 1, 1, col); }
    },
  };
}

// ---------- buildings ----------
const BUILDINGS = {
  core(P, w, h, fr) {
    P.box(1, 8, w - 2, h - 8, 'body');
    P.r(3, 10, w - 6, 2, 'mid');
    P.r(0, h - 3, w, 3, 'dark'); P.r(1, h - 3, w - 2, 1, 'mid');
    P.box(3, 4, 4, 5, 'mid'); P.box(w - 7, 4, 4, 5, 'mid');
    P.p(4, 3, 'accent'); P.p(w - 5, 3, 'accent');
    const pulse = fr % 2 === 0 ? 'accent' : 'light';
    P.diamond(Math.floor(w / 2), 6, 5, 'dark');
    P.diamond(Math.floor(w / 2), 6, 4, pulse);
    P.diamond(Math.floor(w / 2), 6, 2, 'glow');
    for (let x = 4; x < w - 4; x += 3) P.p(x, 14, fr % 2 ? 'accent' : 'mid');
    P.r(Math.floor(w / 2) - 2, h - 7, 4, 4, 'dark'); P.r(Math.floor(w / 2) - 1, h - 6, 2, 3, 'accent');
  },
  drill(P, w, h, fr) {
    P.box(0, 0, w, h - 3, 'body');
    P.r(2, 2, w - 4, 1, 'mid');
    P.r(Math.floor(w / 2) - 2, h - 4, 4, 4, 'mid');
    P.tri(Math.floor(w / 2) - 2, h - 2, 4, 2, 'light', false);
    for (let k = 0; k < 3; k++) P.p(2 + ((fr + k * 2) % (w - 4)), 4, 'accent');
    P.r(1, h - 3, 2, 3, 'dark'); P.r(w - 3, h - 3, 2, 3, 'dark');
  },
  solar(P, w, h) {
    P.r(Math.floor(w / 2) - 1, 2, 2, h - 2, 'dark');
    P.r(1, h - 1, w - 2, 1, 'dark');
    for (let x = 0; x < w; x++) { const y = Math.floor(3 - (x / w) * 3); P.r(x, y, 1, 2, x % 3 === 0 ? 'mid' : 'accent'); }
  },
  reactor(P, w, h, fr) {
    P.box(1, 3, w - 2, h - 3, 'body');
    P.box(4, 0, w - 8, 4, 'mid');
    P.r(3, 5, w - 6, h - 8, 'dark');
    const c = fr % 2 ? 'glow' : 'accent';
    P.diamond(Math.floor(w / 2), Math.floor(h / 2) + 1, 4, 'mid');
    P.diamond(Math.floor(w / 2), Math.floor(h / 2) + 1, 3, c);
    P.r(2, h - 2, w - 4, 1, 'accent');
  },
  battery(P, w, h) {
    P.box(0, 1, w, h - 1, 'body');
    P.r(2, 0, w - 4, 1, 'light');
    for (let y = 3; y < h - 1; y += 2) P.r(2, y, w - 4, 1, 'mid');
  },
  relay(P, w, h, fr) {
    P.r(1, 3, 2, h - 3, 'mid');
    P.r(0, h - 2, w, 2, 'dark');
    for (let y = 5; y < h - 2; y += 3) P.r(0, y, w, 1, 'body');
    P.r(0, 1, w, 2, 'light');
    P.p(1, 0, fr % 2 ? 'glow' : 'accent'); P.p(2, 0, fr % 2 ? 'glow' : 'accent');
  },
  refinery(P, w, h, fr) {
    P.box(0, 4, w, h - 4, 'body');
    P.box(w - 5, 0, 3, 6, 'mid');
    P.box(2, 6, 5, h - 8, 'mid'); P.r(3, 7 + (fr % 3), 3, 2, 'accent');
    P.box(8, 6, 5, h - 8, 'mid'); P.r(9, 8, 3, h - 11, fr % 2 ? 'accent' : 'light');
    P.r(0, h - 1, w, 1, 'dark');
  },
  fabricator(P, w, h, fr) {
    P.box(0, 3, w, h - 3, 'body');
    P.r(2, 0, w - 4, 4, 'mid'); P.r(3, 1, w - 6, 1, 'light');
    P.box(Math.floor(w / 2) - 5, h - 9, 10, 9, 'dark');
    for (let y = h - 8; y < h; y += 2) P.r(Math.floor(w / 2) - 4, y, 8, 1, 'mid');
    P.r(2, 5, 3, 2, fr % 2 ? 'accent' : 'mid'); P.r(w - 5, 5, 3, 2, fr % 2 ? 'mid' : 'accent');
  },
  lab(P, w, h, fr) {
    P.box(0, 5, w, h - 5, 'body');
    for (let k = 0; k < 6; k++) { const s = Math.round(Math.sqrt(36 - (5 - k) * (5 - k)) * 1.2); P.r(Math.floor(w / 2) - s, k, s * 2, 1, k < 2 ? 'light' : 'mid'); }
    P.p(Math.floor(w / 2), 2, fr % 2 ? 'glow' : 'accent');
    for (let x = 2; x < w - 2; x += 4) P.r(x, 7, 2, 2, 'accent');
  },
  gate(P, w, h) {
    P.r(0, 0, w, h, 'dark');
    for (let y = 1; y < h; y += 3) P.r(0, y, w, 2, 'mid');
    P.r(1, 0, 2, h, 'body');
    P.r(1, 0, 2, 1, 'accent'); P.r(1, h - 1, 2, 1, 'accent');
    P.vline(1, 2, h - 4, 'accent');
  },
  pulse(P, w, h) {
    P.box(0, h - 4, w, 4, 'body');
    P.r(1, h - 3, w - 2, 1, 'mid');
    P.box(1, 1, w - 2, h - 4, 'mid');
    P.r(2, 1, w - 4, 1, 'light');
    P.r(3, 3, 2, 2, 'accent');
  },
  lance(P, w, h) {
    P.box(1, h - 4, w - 2, 4, 'body');
    P.box(3, 4, w - 6, h - 7, 'mid');
    P.r(4, 5, 2, h - 9, 'light');
    P.box(2, 0, w - 4, 5, 'body');
    P.r(4, 1, 2, 3, 'accent');
  },
  mortar(P, w, h) {
    P.box(0, h - 5, w, 5, 'body');
    P.r(1, h - 4, w - 2, 1, 'mid');
    P.box(2, 2, w - 4, h - 6, 'mid');
    P.r(3, 3, w - 6, 1, 'light');
  },
  railgun(P, w, h) {
    P.box(0, h - 4, w, 4, 'body');
    P.box(3, 1, w - 6, h - 4, 'mid');
    P.r(4, 2, w - 8, 1, 'light');
    P.r(5, 4, 2, 1, 'accent'); P.r(8, 4, 2, 1, 'accent');
  },
  flak(P, w, h) {
    P.box(0, h - 4, w, 4, 'body');
    P.box(2, 1, w - 4, h - 4, 'mid');
    P.r(3, 2, w - 6, 1, 'light');
    P.r(3, 4, 1, 1, 'accent'); P.r(w - 4, 4, 1, 1, 'accent');
  },
  beacon(P, w, h, fr) {
    P.r(0, h - 3, w, 3, 'dark'); P.r(1, h - 3, w - 2, 1, 'mid');
    P.r(2, 5, 2, h - 8, 'mid'); P.r(2, 5, 1, h - 8, 'light');
    for (let y = 7; y < h - 3; y += 3) P.r(1, y, 4, 1, 'body');
    P.tri(0, 0, 6, 4, 'light', false);
    P.diamond(3, 3, 1, fr % 2 ? 'glow' : 'accent');
  },
  arc(P, w, h, fr) {
    P.box(0, h - 3, w, 3, 'body');
    P.r(3, 3, 2, h - 5, 'mid');
    for (let y = 4; y < h - 3; y += 2) P.r(1, y, w - 2, 1, y % 4 === 0 ? 'light' : 'body');
    P.diamond(4, 2, 2, fr % 2 ? 'glow' : 'accent');
  },
};

// ---------- units ----------
const UNITS = {
  drone(P, w, h, fr) {
    P.r(1, 1, 3, 2, 'mid'); P.p(0, 2, 'dark'); P.p(4, 2, 'dark');
    P.p(3, 1, 'accent');
    P.r(0, 0, 5, 1, fr % 2 ? 'light' : 'body');
    P.p(2, 3, 'accent');
  },
  trooper(P, w, h, fr) {
    P.r(1, 0, 2, 2, 'light'); P.p(2, 1, 'accent');
    P.r(0, 2, 4, 3, 'mid'); P.r(1, 2, 2, 1, 'light');
    P.r(3, 3, 1, 1, 'accent');
    if (fr % 2) { P.p(0, 5, 'body'); P.p(0, 6, 'dark'); P.p(3, 5, 'body'); P.p(3, 6, 'dark'); }
    else { P.p(1, 5, 'body'); P.p(1, 6, 'dark'); P.p(2, 5, 'body'); P.p(2, 6, 'dark'); }
  },
  lancer(P, w, h, fr) {
    P.r(1, 0, 2, 2, 'light'); P.p(2, 0, 'accent');
    P.r(0, 2, 4, 4, 'mid'); P.r(0, 3, 4, 1, 'accent');
    if (fr % 2) { P.p(0, 6, 'body'); P.p(0, 7, 'dark'); P.p(3, 6, 'body'); P.p(3, 7, 'dark'); }
    else { P.p(1, 6, 'body'); P.p(1, 7, 'dark'); P.p(2, 6, 'body'); P.p(2, 7, 'dark'); }
  },
  skimmer(P, w, h, fr) {
    P.r(1, 1, 5, 2, 'mid'); P.r(0, 2, 7, 1, 'body'); P.r(2, 0, 3, 1, 'light');
    P.p(5, 1, 'accent'); P.p(0, 3, fr % 2 ? 'accent' : 'glow'); P.p(6, 3, fr % 2 ? 'glow' : 'accent');
  },
  siege(P, w, h, fr, o) {
    P.box(1, 2, 8, 4, 'mid'); P.r(2, 3, 6, 1, 'light');
    P.r(3, 0, 4, 2, 'body'); P.p(6, 1, 'accent');
    const legs = o.deployed ? [[0, 6], [2, 7], [7, 7], [9, 6]] : fr % 2 ? [[1, 6], [3, 6], [6, 6], [8, 6]] : [[2, 6], [3, 6], [6, 6], [7, 6]];
    for (const [x, y] of legs) { P.r(x, y, 1, 10 - y, 'dark'); P.p(x, 9, 'body'); }
  },
  commander(P, w, h, fr) {
    P.r(1, 0, 3, 3, 'light'); P.r(1, 1, 3, 1, 'accent');
    P.r(0, 3, 5, 4, 'mid'); P.r(1, 3, 3, 1, 'trim'); P.p(4, 4, 'accent');
    P.p(0, 7, 'glow');
    if (fr % 2) { P.p(1, 7, 'body'); P.p(1, 8, 'dark'); P.p(3, 7, 'body'); P.p(4, 8, 'dark'); }
    else { P.p(1, 7, 'body'); P.p(0, 8, 'dark'); P.p(3, 7, 'body'); P.p(3, 8, 'dark'); }
  },
  // --- Hollow ---
  mite(P, w, h, fr) {
    P.tri(0, 0, 4, 3, 'mid'); P.p(2, 1, 'glow'); P.p(3, 2, 'accent');
    P.p(fr % 2 ? 0 : 1, 2, 'accent');
  },
  gnawer(P, w, h, fr) {
    P.box(0, 0, 6, 5, 'mid'); P.r(1, 1, 3, 1, 'light');
    P.p(4, 2, 'glow');
    P.r(6, fr % 2 ? 1 : 2, 1, 1, 'accent'); P.r(6, 3, 1, 1, 'accent');
    P.p(1, 4, 'accent'); P.p(3, 4, 'accent');
  },
  spitter(P, w, h, fr) {
    P.diamond(2, 2, 2, 'light'); P.diamond(2, 2, 1, 'accent');
    P.box(1, 3, 5, 3, 'mid'); P.p(4, 4, 'glow'); P.p(5, 3, fr % 2 ? 'accent' : 'light');
  },
  glare(P, w, h, fr) {
    P.r(2, 3, 2, 4, 'mid'); P.r(1, 6, 4, 1, 'body');
    P.diamond(3, 2, 2, 'light'); P.p(3, 2, fr % 2 ? 'glow' : 'accent'); P.p(4, 2, 'glow');
  },
  wisp(P, w, h, fr) {
    P.diamond(2, 2, 2, fr % 2 ? 'accent' : 'light'); P.p(2, 2, 'glow');
    P.p(fr % 2 ? 0 : 4, 1, 'mid');
  },
  splitter(P, w, h, fr) {
    P.tri(0, 1, 4, 3, 'mid'); P.tri(3, 0, 4, 3, 'light'); P.tri(1, 3, 5, 3, 'mid');
    P.p(5, 1, 'glow'); P.p(2, 4, 'accent');
  },
  carapace(P, w, h, fr) {
    P.box(0, 2, 9, 6, 'mid');
    for (let k = 0; k < 4; k++) P.r(1 + k, 2 - Math.min(2, k), 8 - k * 2, 1, 'body');
    P.r(8, 1, 2, 7, 'trim'); P.r(9, 2, 1, 5, 'glow');
    P.p(7, 4, 'accent');
    P.p(1, 7, 'dark'); P.p(4, 7, 'dark'); P.p(7, 7, 'dark');
  },
  borer(P, w, h, fr) {
    P.box(0, 0, 6, 5, 'mid'); P.tri(5, 0, 3, 5, 'light'); P.p(4, 2, 'glow');
    P.p(fr % 2 ? 1 : 2, 2, 'accent');
  },
  bombard(P, w, h, fr) {
    P.box(1, 0, 10, 4, 'mid'); P.r(2, 1, 8, 1, 'light');
    P.r(4, 4, 4, 2, 'body'); P.r(5, 6, 2, 1, fr % 2 ? 'accent' : 'glow');
    P.p(9, 2, 'glow'); P.p(0, 2, 'accent'); P.p(11, 2, 'accent');
  },
  titan(P, w, h, fr) {
    P.box(3, 4, 16, 14, 'mid');
    P.tri(5, 0, 12, 6, 'body');
    P.r(6, 8, 10, 2, 'light');
    P.diamond(14, 9, 2, 'glow'); P.p(14, 9, 'accent');
    for (let k = 0; k < 4; k++) P.r(4 + k * 4, 18 - (k % 2), 2, 4, 'body');
    const lx = fr % 2 ? 0 : 2;
    P.box(4 + lx, 18, 5, 10, 'dark'); P.box(13 - lx, 18, 5, 10, 'dark');
    P.r(4 + lx, 26, 6, 2, 'accent'); P.r(13 - lx, 26, 6, 2, 'accent');
  },
  hivemother(P, w, h, fr) {
    P.box(2, 2, 20, 9, 'mid');
    P.tri(0, 0, 6, 4, 'body'); P.tri(18, 0, 6, 4, 'body');
    for (let k = 0; k < 5; k++) P.p(4 + k * 4, 5 + (k % 2), (fr + k) % 2 ? 'glow' : 'accent');
    for (let k = 0; k < 6; k++) P.r(3 + k * 3, 11, 1, 2 + ((fr + k) % 2), 'light');
  },
  nest(P, w, h, fr) {
    for (let k = 0; k < h; k++) { const s = Math.round((w / 2) * Math.sqrt(1 - ((h - k) / h) ** 2)); P.r(Math.floor(w / 2) - s, k, s * 2, 1, k < 3 ? 'light' : 'mid'); }
    P.r(4, h - 5, 3, 3, 'dark'); P.r(12, h - 6, 4, 4, 'dark'); P.r(9, 3, 2, 2, 'dark');
    P.p(5, h - 4, fr % 2 ? 'accent' : 'glow'); P.p(13, h - 4, fr % 2 ? 'glow' : 'accent');
  },
};

// Get a cached canvas for a sprite. kind: 'b' or 'u'. flip: face left.
export function sprite(kind, type, team, w, h, frame = 0, flip = false, opts = {}) {
  const key = `${kind}|${type}|${team}|${w}|${h}|${frame}|${flip ? 1 : 0}|${opts.deployed ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  c = mk(w, h);
  const ctx = c.getContext('2d');
  const pal = PAL[team] || PAL[1];
  const fn = (kind === 'b' ? BUILDINGS : UNITS)[type];
  if (fn) {
    if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    fn(painter(ctx, pal), w, h, frame, opts);
  } else {
    ctx.fillStyle = pal.mid; ctx.fillRect(0, 0, w, h);
  }
  cache.set(key, c);
  return c;
}

// Small icon (for HUD buttons): returns a canvas of the sprite scaled to fit a box.
export function iconCanvas(kind, type, team = 1, size = 32) {
  const key = `icon|${kind}|${type}|${team}|${size}`;
  let c = cache.get(key);
  if (c) return c;
  let w, h;
  const dims = ICON_SIZES[type];
  if (dims) [w, h] = dims; else { w = 8; h = 8; }
  const s = sprite(kind, type, team, w, h, 0, false);
  c = mk(size, size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const scale = Math.max(1, Math.floor((size - 4) / Math.max(w, h)));
  ctx.drawImage(s, Math.floor((size - w * scale) / 2), Math.floor((size - h * scale) / 2), w * scale, h * scale);
  cache.set(key, c);
  return c;
}

export const ICON_SIZES = {};
export function registerSizes(data) {
  for (const [k, d] of Object.entries(data.buildings.list)) ICON_SIZES[k] = d.size;
  for (const [k, d] of Object.entries(data.units.list)) ICON_SIZES[k] = d.size;
  for (const [k, d] of Object.entries(data.enemies.list)) ICON_SIZES[k] = d.size;
}
