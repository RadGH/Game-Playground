// The frame: background → sun → planets → rocks/wrecks → ships → shots → beams → particles, a coloured
// light map, then the WebGL post pass (bloom + shockwaves). Labels go on a plain overlay canvas on top.

import { createPost } from './post.js';
import { bakeBody, bakeKey, paletteFor } from './bake.js';
import { drawTurret } from './turret-art.js';
import { glowSprite, lightSprite, hexA } from './fx.js';
import { toWorld } from '../sim/ship.js';
import { CELL } from '../sim/grid.js';
import { RARITY_BY_ID, MATERIALS } from '../data/types.js';
import { PLANET_KINDS } from '../sim/galaxy.js';
import { noise2, rng, hash } from '../core/math.js';
import { shieldRadius } from '../sim/world.js';

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export function createRenderer(view, overlay, opts = {}) {
  const scene = mk(16, 16), lightC = mk(16, 16);
  const sc = scene.getContext('2d'), lc = lightC.getContext('2d');
  const oc = overlay.getContext('2d');
  let post = opts.noGL ? null : createPost(view);
  const view2d = post ? null : view.getContext('2d');
  const R = { scene, post, quality: 1, dpr: 1, bakes: new Map(), stars: null, nebula: null, planetTex: new Map(), W: 0, H: 0 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, R.quality >= 1 ? 1.5 : 1);
    const W = Math.round(view.clientWidth * dpr * (R.quality >= 1 ? 1 : 0.75)), H = Math.round(view.clientHeight * dpr * (R.quality >= 1 ? 1 : 0.75));
    if (W === R.W && H === R.H) return;
    R.W = W; R.H = H; R.dpr = W / Math.max(1, view.clientWidth);
    view.width = W; view.height = H; scene.width = W; scene.height = H;
    lightC.width = Math.max(16, W >> 2); lightC.height = Math.max(16, H >> 2);
    overlay.width = Math.round(view.clientWidth * Math.min(2, window.devicePixelRatio || 1)); overlay.height = Math.round(view.clientHeight * Math.min(2, window.devicePixelRatio || 1));
  }
  R.resize = resize;

  // ---------------------------------------------------------- background
  function makeStars(seed) {
    const layers = [];
    for (let L = 0; L < 3; L++) {
      const c = mk(1024, 1024); const g = c.getContext('2d'); const r = rng(hash(seed, 'stars', L));
      const n = [900, 350, 120][L];
      for (let i = 0; i < n; i++) {
        const x = r() * 1024, y = r() * 1024; const s = [0.6, 1.0, 1.6][L] * (0.5 + r());
        const hue = r() < 0.2 ? '#ffd8b0' : r() < 0.3 ? '#b0d0ff' : '#ffffff';
        g.globalAlpha = 0.3 + r() * 0.7; g.fillStyle = hue; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
        if (L === 2 && r() < 0.15) { g.globalAlpha = 0.25; g.drawImage(glowSprite(hue), x - 8, y - 8, 16, 16); }
      }
      layers.push(c);
    }
    return layers;
  }
  function makeNebula(seed, tint) {
    const c = mk(512, 512); const g = c.getContext('2d'); const n = noise2(hash(seed, 'neb')); const n2 = noise2(hash(seed, 'neb2'));
    const img = g.createImageData(512, 512); const r = rng(seed);
    const cols = [tint || [80, 40, 140], [r.int(20, 90), r.int(40, 120), r.int(90, 180)], [r.int(120, 200), r.int(30, 80), r.int(60, 120)]];
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const v = n.fbm(x / 120, y / 120, 5); const v2 = n2.fbm(x / 80 + 5, y / 80, 4);
      const k = Math.max(0, v - 0.42) * 2.6, k2 = Math.max(0, v2 - 0.5) * 2.4;
      const i = (y * 512 + x) * 4;
      img.data[i] = Math.min(255, cols[0][0] * k + cols[1][0] * k2 + cols[2][0] * k * k2 * 2);
      img.data[i + 1] = Math.min(255, cols[0][1] * k + cols[1][1] * k2 + cols[2][1] * k * k2 * 2);
      img.data[i + 2] = Math.min(255, cols[0][2] * k + cols[1][2] * k2 + cols[2][2] * k * k2 * 2);
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  R.setSystem = (sys) => {
    R.stars = makeStars(sys.seed);
    const t = { yellow: [70, 50, 120], red: [130, 40, 50], blue: [40, 70, 140], white: [60, 60, 100], violet: [110, 40, 150], binary: [120, 70, 50] }[sys.star];
    R.nebula = makeNebula(sys.seed, sys.nebula ? t.map(v => v * 1.6) : t.map(v => v * 0.6));
    R.planetTex.clear(); R.bakes.clear();
  };

  function planetTexture(p) {
    let t = R.planetTex.get(p.id); if (t) return t;
    const S = 768; const c = mk(S, S); const g = c.getContext('2d'); const pk = PLANET_KINDS[p.kind];
    const n = noise2(p.seed), n2 = noise2(p.seed + 3); const img = g.createImageData(S, S);
    const hx = (h) => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
    const [b, d, l] = [hx(pk.base), hx(pk.dark), hx(pk.light)];
    const glow = pk.glow ? hx(pk.glow) : null;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - S / 2, dy = y - S / 2; if (dx * dx + dy * dy > (S / 2) ** 2) continue;
      let v = pk.gas ? n.fbm(x / 140, y / 22, 5) * 0.7 + n2.fbm(x / 60, y / 60, 3) * 0.3 : n.fbm(x / 90, y / 90, 6);
      const v2 = n2.fbm(x / 30, y / 30, 3);
      let col;
      if (v < 0.42) col = d.map((c, i) => c + (b[i] - c) * (v / 0.42));
      else if (v < 0.62) col = b.map((c, i) => c + (l[i] - c) * ((v - 0.42) / 0.2) * 0.6);
      else col = l.map((c, i) => c * (0.8 + v2 * 0.3));
      if (glow && v < 0.36) col = col.map((c, i) => c + glow[i] * (0.36 - v) * 4);
      if (p.kind === 'ocean' && v < 0.5) col = [20, 60 + v * 80, 140 + v * 60];
      const i = (y * S + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // craters
    if (!pk.gas) { const r = rng(p.seed); for (let i = 0; i < 40; i++) { const x = S / 2 + (r() - 0.5) * S * 0.8, y = S / 2 + (r() - 0.5) * S * 0.8; const rr = r() * 18 + 3; g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x - 1, y - 1, rr, Math.PI, Math.PI * 1.7); g.stroke(); } }
    t = { c, g, S }; R.planetTex.set(p.id, t); return t;
  }
  R.scorchPlanet = (p, x, y) => {
    const t = planetTexture(p); const u = (x - p.x) / (p.r * 2) * t.S + t.S / 2, v = (y - p.y) / (p.r * 2) * t.S + t.S / 2;
    t.g.fillStyle = 'rgba(20,12,8,0.25)'; t.g.beginPath(); t.g.arc(u, v, 2 + Math.random() * 2, 0, 7); t.g.fill();
  };

  const detailCache = new Map();
  function detailPattern(g, kind) {
    let pat = detailCache.get(kind); if (pat) return pat;
    const S = 256; const c = mk(S, S); const x = c.getContext('2d'); const n = noise2(hash('detail', kind)); const img = x.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      // tileable: sample a torus
      const a = i / S * Math.PI * 2, b = j / S * Math.PI * 2;
      const v = n.fbm(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + Math.cos(b) * 3 + 20, 4) * 0.7 + n.fbm(Math.sin(b) * 6 + 5, Math.cos(a) * 6 + 7, 3) * 0.3;
      const k = (y => y < 0 ? 0 : y > 255 ? 255 : y)(Math.round(128 + (v - 0.5) * 300));
      const o = (j * S + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = k; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // a few small crater rims / rocks
    const r = rng(hash('rocks', kind));
    for (let i = 0; i < 26; i++) { const cx = r() * S, cy = r() * S, rr = 2 + r() * 7; x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, rr, 3.6, 5.6); x.stroke(); x.strokeStyle = 'rgba(0,0,0,0.4)'; x.beginPath(); x.arc(cx, cy, rr, 0.5, 2.5); x.stroke(); }
    pat = g.createPattern(c, 'repeat'); detailCache.set(kind, pat); return pat;
  }
  function bakeFor(s) {
    let b = R.bakes.get(s.id);
    const key = bakeKey(s);
    if (!b || (b.key !== key && (performance.now() - b.at > (s.stats.blocks > 400 ? 250 : 90)))) {
      const art = bakeBody(s); b = { ...art, key, at: performance.now() }; R.bakes.set(s.id, b);
    }
    return b;
  }
  R.forget = id => R.bakes.delete(id);
  /** Drop hull pictures of bodies that are gone (sectors unload whole asteroid fields). */
  R.prune = (w) => { const live = new Set(); for (const b of w.bodies) if (!b.dead) live.add(b.id); for (const id of R.bakes.keys()) if (!live.has(id)) R.bakes.delete(id); };

  // ---------------------------------------------------------- frame
  R.frame = (w, cam, fx, ui = {}) => {
    resize();
    const W = R.W, H = R.H; const z = cam.zoom * R.dpr; const t = w.t;
    const sx = x => (x - cam.x) * z + W / 2, sy = y => (y - cam.y) * z + H / 2;
    const vis = (x, y, r) => Math.abs(x - cam.x) * z < W / 2 + r * z + 50 && Math.abs(y - cam.y) * z < H / 2 + r * z + 50;
    const g = sc;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = '#04050a'; g.fillRect(0, 0, W, H);
    // nebula + stars (parallax)
    if (R.nebula) {
      const k = 0.02; const s = Math.max(W, H) * 1.6; g.globalAlpha = 0.6;
      g.drawImage(R.nebula, W / 2 - s / 2 - cam.x * k, H / 2 - s / 2 - cam.y * k, s, s); g.globalAlpha = 1;
    }
    if (R.stars) for (let L = 0; L < 3; L++) {
      const k = [0.03, 0.07, 0.14][L]; const img = R.stars[L]; const T = 1024 * (R.dpr > 1.2 ? 1.2 : 1);
      const ox = ((-cam.x * k) % T + T) % T, oy = ((-cam.y * k) % T + T) % T;
      for (let y = oy - T; y < H; y += T) for (let x = ox - T; x < W; x += T) g.drawImage(img, x, y, T, T);
    }
    g.setTransform(z, 0, 0, z, W / 2 - cam.x * z, H / 2 - cam.y * z);
    // sun
    if (w.sun && vis(w.sun.x, w.sun.y, w.sun.r * 6)) {
      const s = w.sun; g.globalCompositeOperation = 'lighter';
      g.drawImage(glowSprite(s.glow), s.x - s.r * 7, s.y - s.r * 7, s.r * 14, s.r * 14);
      g.drawImage(glowSprite(s.color, 0.6), s.x - s.r * 2.2, s.y - s.r * 2.2, s.r * 4.4, s.r * 4.4);
      // corona flicker
      for (let i = 0; i < 6; i++) { const a = t * 0.1 + i; g.globalAlpha = 0.25; g.drawImage(glowSprite(s.glow), s.x + Math.cos(a) * s.r * 0.6 - s.r * 1.6, s.y + Math.sin(a) * s.r * 0.6 - s.r * 1.6, s.r * 3.2, s.r * 3.2); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = s.color; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
      if (s.binary) { const bx = s.x + Math.cos(t * 0.2) * s.r * 3, by = s.y + Math.sin(t * 0.2) * s.r * 3; g.globalCompositeOperation = 'lighter'; g.drawImage(glowSprite('#ff8a5a'), bx - s.r * 2, by - s.r * 2, s.r * 4, s.r * 4); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#ffb090'; g.beginPath(); g.arc(bx, by, s.r * 0.5, 0, 7); g.fill(); }
    }
    // planets: textured disc, lit from the sun, atmosphere rim
    for (const p of w.planets) {
      if (!vis(p.x, p.y, p.r * 1.2)) continue;
      const tx = planetTexture(p); const pk = PLANET_KINDS[p.kind];
      g.save(); g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.clip();
      g.drawImage(tx.c, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      // crisp tiled detail on top of the soft base map, so low orbit does not look blurry
      if (z > 0.25) { const pat = detailPattern(g, p.kind); g.globalCompositeOperation = 'overlay'; g.globalAlpha = Math.min(0.75, (z - 0.25) * 1.5); g.fillStyle = pat; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      const la = Math.atan2(p.y - (w.sun?.y || 0), p.x - (w.sun?.x || 0));
      const gr = g.createLinearGradient(p.x - Math.cos(la) * p.r, p.y - Math.sin(la) * p.r, p.x + Math.cos(la) * p.r, p.y + Math.sin(la) * p.r);
      gr.addColorStop(0, 'rgba(255,240,220,0.08)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,10,0.72)');
      g.fillStyle = gr; g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      g.restore();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = hexA(pk.light, 0.35); g.lineWidth = p.r * 0.05; g.beginPath(); g.arc(p.x, p.y, p.r * 1.02, 0, 7); g.stroke();
      g.strokeStyle = hexA(pk.light, 0.12); g.lineWidth = p.r * 0.12; g.beginPath(); g.arc(p.x, p.y, p.r * 1.06, 0, 7); g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    // bodies: ground first, then rocks/wrecks, then ships and stations
    const order = { ground: 0, rock: 1, wreck: 2, station: 3, ship: 4 };
    const bodies = w.bodies.filter(s => !s.dead && vis(s.x, s.y, s.r)).sort((a, b) => order[a.kind] - order[b.kind] || a.r - b.r);
    const glowsLater = [];
    for (const s of bodies) {
      const b = bakeFor(s);
      const P = b.px; const k = CELL / P;
      g.save(); g.translate(s.x, s.y); g.rotate(s.a);
      g.scale(k, k); g.translate(-s.ox * P - b.pad, -s.oy * P - b.pad);
      if (s.cloak > 0) g.globalAlpha = s === w.player ? 0.35 : 0.08;
      if (s.kind === 'ground') { g.globalAlpha = 0.5; g.fillStyle = '#000'; g.drawImage(b.mask, 6, 6); g.globalAlpha = 1; }
      g.drawImage(b.hull, 0, 0);
      g.restore();
      glowsLater.push([s, b]);
      // engine flames
      if (s.kind === 'ship' && s.engines) {
        const sp = Math.hypot(s.vx, s.vy); const thr = (s.thrusting ? 1 : 0.25) * (s.boosting ? 1.8 : 1);
        const col = paletteFor(s).light;
        g.globalCompositeOperation = 'lighter';
        for (const e of s.engines) {
          if (!e.b.alive) continue;
          const [ex, ey] = toWorld(s, e.b.x, e.cy);
          const L = (8 + e.n * 10) * thr * (0.8 + Math.random() * 0.4) + sp * 0.02;
          const ax = -Math.cos(s.a), ay = -Math.sin(s.a);
          const spr = glowSprite(col);
          // a tapered flame: bright core at the nozzle, coloured plume behind
          g.globalAlpha = 0.55; g.drawImage(spr, ex + ax * 3 - e.n * 5, ey + ay * 3 - e.n * 5, e.n * 10, e.n * 10);
          for (let k = 1; k <= 3; k++) { g.globalAlpha = 0.4 / k; const s2 = e.n * (6 - k); g.drawImage(spr, ex + ax * L * k / 3 - s2, ey + ay * L * k / 3 - s2, s2 * 2, s2 * 2); }
          lc_light(ex + ax * 14, ey + ay * 14, 26 + e.n * 18, col, 0.18 * thr);
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
      // turrets
      if (s.turrets?.length && (s.r * z > 6)) {
        const pal = paletteFor(s);
        for (const tu of s.turrets) {
          if (!tu.b.alive) continue;
          const [tx, ty] = toWorld(s, tu.cx, tu.cy); const S = tu.n * CELL;
          g.save(); g.translate(tx, ty); g.rotate(s.a + tu.aim);
          drawTurret(g, tu.w.id, S, tu.kick, t, pal, null);
          g.restore();
        }
      }
    }
    // glow passes (lit windows, reactors) added on top
    g.globalCompositeOperation = 'lighter';
    for (const [s, b] of glowsLater) {
      if (s.kind === 'wreck') continue;
      const P = b.px; const k = CELL / P;
      g.save(); g.translate(s.x, s.y); g.rotate(s.a); g.scale(k, k); g.translate(-s.ox * P - b.pad, -s.oy * P - b.pad);
      g.globalAlpha = s.emp > 0 ? 0.2 + Math.random() * 0.3 : 0.9; g.drawImage(b.glow, 0, 0); g.restore();
      if (s.kind === 'ship' || s.kind === 'station') { const c = paletteFor(s).light; for (const L of s.lights) { if (!L.b.alive) continue; const [lx, ly] = toWorld(s, L.cx, L.cy); lc_light(lx, ly, 22 + L.n * 18, c, 0.16); } }
      if (s.burn > 0) lc_light(s.x, s.y, s.r * 1.5, '#ff6a2a', 0.4);
      if (s.kind === 'wreck' && s.burnFx > 0) { s.burnFx -= 1 / 60; }
    }
    g.globalAlpha = 1;
    // shields: faint bubble, bright where it was just hit
    for (const s of bodies) {
      if (!s.shields?.length) continue;
      const fl = fx.shieldFlash.get(s.id);
      for (const sh of s.shields) {
        if (!sh.b.alive || sh.cur <= 0) continue;
        const Rr = shieldRadius(s, sh); const frac = sh.cur / sh.max;
        const base = (fl ? fl.t * 1.4 : 0) + (s === w.player ? 0.08 : 0.04);
        const col = fl?.color || '#6fd0ff';
        g.strokeStyle = hexA(col, Math.min(0.9, base * (0.4 + frac))); g.lineWidth = 2 / z + (fl ? 3 : 0);
        g.beginPath();
        if (sh.kind === 'arc') { const face = s.a + sh.b.rot * Math.PI / 4, h = sh.arc * Math.PI / 360; g.arc(s.x, s.y, Rr, face - h, face + h); g.lineWidth = 3 / z + 2; g.strokeStyle = hexA(col, 0.25 + (fl ? fl.t : 0) + frac * 0.2); }
        else g.arc(s.x, s.y, Rr, 0, 7);
        g.stroke();
        if (fl && sh.kind !== 'arc') { g.globalAlpha = fl.t * 0.35; g.drawImage(glowSprite(col), s.x - Rr, s.y - Rr, Rr * 2, Rr * 2); g.globalAlpha = 1; }
      }
    }
    // tethers
    g.globalCompositeOperation = 'source-over';
    for (const T of w.tethers) {
      if (T.ax == null) continue;
      const taut = T.d > T.len; g.strokeStyle = taut ? '#e8eef2' : '#9aa4ae'; g.lineWidth = (taut ? 2.2 : 1.4) / Math.sqrt(z);
      g.beginPath(); g.moveTo(T.ax, T.ay);
      if (taut) g.lineTo(T.bx, T.by); else { const mx = (T.ax + T.bx) / 2, my = (T.ay + T.by) / 2 + (T.len - T.d) * 0.4; g.quadraticCurveTo(mx, my, T.bx, T.by); }
      g.stroke();
      // chain links
      g.fillStyle = '#c8d0d8'; const n = Math.floor(T.d / 14); for (let i = 1; i < n; i++) { const tt = i / n; g.fillRect(T.ax + (T.bx - T.ax) * tt - 1, T.ay + (T.by - T.ay) * tt - 1, 2, 2); }
    }
    // pickups (loot) — Diablo-style: a pillar of rarity light, rotating rays, a label
    g.globalCompositeOperation = 'lighter';
    for (const p of w.pickups) {
      if (!vis(p.x, p.y, 200)) continue;
      const col = p.kind === 'mat' ? MATERIALS[p.mat]?.color || '#fff' : p.kind === 'item' ? RARITY_BY_ID[p.rarity]?.color : p.kind === 'cr' ? '#ffd84a' : p.kind === 'pod' ? '#ffffff' : '#c8ff6a';
      const bob = Math.sin(t * 3 + p.id) * 1.5;
      if (p.kind === 'item') {
        const RR = RARITY_BY_ID[p.rarity]; const big = RR.index;
        if (big >= 1) {
          // light pillar up the screen
          const hgt = (60 + big * 40) / Math.sqrt(z);
          const gr = g.createLinearGradient(p.x, p.y, p.x, p.y - hgt);
          gr.addColorStop(0, hexA(col, 0.55)); gr.addColorStop(1, hexA(col, 0));
          g.fillStyle = gr; g.fillRect(p.x - 3 - big, p.y - hgt, 6 + big * 2, hgt);
          // rays
          g.save(); g.translate(p.x, p.y + bob); g.rotate(t * 0.8);
          for (let i = 0; i < 4 + big; i++) { g.rotate(Math.PI * 2 / (4 + big)); g.fillStyle = hexA(col, 0.12 + big * 0.03); g.beginPath(); g.moveTo(0, 0); g.lineTo(26 + big * 8, -3); g.lineTo(26 + big * 8, 3); g.fill(); }
          g.restore();
        }
        g.drawImage(glowSprite(col), p.x - 16, p.y - 16 + bob, 32, 32);
        g.globalCompositeOperation = 'source-over';
        g.save(); g.translate(p.x, p.y + bob); g.rotate(p.spin + t * 0.5);
        g.fillStyle = '#20242c'; g.fillRect(-5, -5, 10, 10); g.strokeStyle = col; g.lineWidth = 1.6; g.strokeRect(-5, -5, 10, 10);
        g.fillStyle = col; g.fillRect(-2, -2, 4, 4); g.restore();
        g.globalCompositeOperation = 'lighter';
        lc_light(p.x, p.y, 80 + big * 40, col, 0.6);
      } else if (p.kind === 'pod') {
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#d8dde4'; g.beginPath(); g.ellipse(p.x, p.y, 6, 4, p.spin + t * 0.4, 0, 7); g.fill();
        g.globalCompositeOperation = 'lighter';
        if (Math.sin(t * 6 + p.id) > 0) g.drawImage(glowSprite('#ff4040'), p.x - 8, p.y - 8, 16, 16);
        lc_light(p.x, p.y, 40, '#ff6060', 0.4);
      } else {
        const sz = p.kind === 'cr' ? 7 : 5 + Math.min(4, p.n * 0.5);
        g.drawImage(glowSprite(col), p.x - sz * 2, p.y - sz * 2 + bob, sz * 4, sz * 4);
        g.globalCompositeOperation = 'source-over'; g.fillStyle = col;
        g.save(); g.translate(p.x, p.y + bob); g.rotate(p.spin + t); g.beginPath(); g.moveTo(0, -sz * 0.7); g.lineTo(sz * 0.6, 0); g.lineTo(0, sz * 0.7); g.lineTo(-sz * 0.6, 0); g.fill(); g.restore();
        g.globalCompositeOperation = 'lighter';
      }
    }
    // shots
    for (const p of w.shots) {
      if (!vis(p.x, p.y, 60)) continue;
      const a = Math.atan2(p.vy, p.vx); const c = p.color;
      switch (p.kind) {
        case 'bolt': case 'pulse': { const L = p.kind === 'pulse' ? 10 : 22; g.strokeStyle = c; g.lineWidth = p.w?.size === 'm' ? 4 : 2.6; streak(g, p.x, p.y, a, L, c); lc_light(p.x, p.y, 50, c, 0.5); break; }
        case 'bullet': g.strokeStyle = '#fff2c0'; g.lineWidth = 1.4; line(g, p.x, p.y, p.x - Math.cos(a) * 12, p.y - Math.sin(a) * 12); break;
        case 'shell': case 'slug': { g.drawImage(glowSprite(c), p.x - 8, p.y - 8, 16, 16); g.strokeStyle = hexA(c, 0.6); g.lineWidth = p.kind === 'slug' ? 3 : 2; line(g, p.x, p.y, p.x - Math.cos(a) * (p.kind === 'slug' ? 40 : 18), p.y - Math.sin(a) * (p.kind === 'slug' ? 40 : 18)); lc_light(p.x, p.y, 50, c, 0.4); break; }
        case 'plasma': { const s = p.w?.size === 'l' ? 16 : p.w?.size === 'm' ? 12 : 7; const wob = 1 + Math.sin(t * 30 + p.id) * 0.15; g.drawImage(glowSprite(c), p.x - s * 1.5 * wob, p.y - s * 1.5 * wob, s * 3 * wob, s * 3 * wob); g.drawImage(glowSprite('#ffffff', 0.5), p.x - s * 0.5, p.y - s * 0.5, s, s); lc_light(p.x, p.y, s * 8, c, 0.6); break; }
        case 'missile': case 'rocket': case 'torpedo': {
          const big = p.kind === 'torpedo' ? 2.4 : p.kind === 'missile' ? 1.2 : 1;
          g.globalCompositeOperation = 'source-over'; g.save(); g.translate(p.x, p.y); g.rotate(a);
          g.fillStyle = p.kind === 'torpedo' ? '#8a8f98' : '#d0d4da'; g.fillRect(-6 * big, -1.6 * big, 10 * big, 3.2 * big); g.fillStyle = c; g.fillRect(3 * big, -1.6 * big, 2 * big, 3.2 * big);
          g.restore(); g.globalCompositeOperation = 'lighter';
          g.drawImage(glowSprite('#ffb060'), p.x - Math.cos(a) * 7 * big - 7 * big, p.y - Math.sin(a) * 7 * big - 7 * big, 14 * big, 14 * big);
          lc_light(p.x, p.y, 60 * big, '#ff9a40', 0.5);
          if (fx.parts.length < fx.max * fx.quality && Math.random() < 0.7) fx.parts.push({ k: 'smoke', x: p.x - Math.cos(a) * 6 * big, y: p.y - Math.sin(a) * 6 * big, vx: 0, vy: 0, life: 0.7 * big, age: 0, color: '#6a6560', size: 4 * big, drag: 0.95, grow: 1.6, rot: 0 });
          break;
        }
        case 'flak': g.drawImage(glowSprite(c), p.x - 5, p.y - 5, 10, 10); break;
        case 'mine': { const blink = Math.sin(t * 8 + p.id) > 0.3; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#3a3a40'; g.beginPath(); g.arc(p.x, p.y, 6, 0, 7); g.fill(); g.globalCompositeOperation = 'lighter'; if (blink) g.drawImage(glowSprite(c), p.x - 9, p.y - 9, 18, 18); break; }
        case 'harpoon': { g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#c8d0d8'; g.lineWidth = 1.5; const o = p.owner; line(g, o.x, o.y, p.x, p.y); g.save(); g.translate(p.x, p.y); g.rotate(a); g.fillStyle = '#e8eef2'; g.beginPath(); g.moveTo(8, 0); g.lineTo(-4, -4); g.lineTo(-2, 0); g.lineTo(-4, 4); g.fill(); g.restore(); g.globalCompositeOperation = 'lighter'; break; }
        default: g.drawImage(glowSprite(c), p.x - 6, p.y - 6, 12, 12);
      }
    }
    // beams: wide soft glow + bright core + hot end
    for (const bm of w.beams) {
      const wd = Math.max(1, bm.width);
      const flick = 0.85 + Math.random() * 0.3;
      g.strokeStyle = hexA(bm.color, 0.25); g.lineWidth = wd * 4 * flick; g.lineCap = 'round'; line(g, bm.x, bm.y, bm.x2, bm.y2);
      g.strokeStyle = hexA(bm.color, 0.7); g.lineWidth = wd * 1.6; line(g, bm.x, bm.y, bm.x2, bm.y2);
      g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(0.8, wd * 0.5); line(g, bm.x, bm.y, bm.x2, bm.y2);
      g.lineCap = 'butt';
      if (bm.hit) { const s = 10 + wd * 5; g.drawImage(glowSprite(bm.color), bm.x2 - s, bm.y2 - s, s * 2, s * 2); if (Math.random() < 0.5 && fx.parts.length < fx.max) fx.parts.push({ k: 'spark', x: bm.x2, y: bm.y2, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 0.25, age: 0, color: bm.tool === 'mine' ? '#ffd080' : bm.color, w: 1.4, drag: 0.9 }); }
      const L = Math.hypot(bm.x2 - bm.x, bm.y2 - bm.y); const n = Math.max(2, Math.min(8, L / 80));
      for (let i = 0; i <= n; i++) { const tt = i / n; lc_light(bm.x + (bm.x2 - bm.x) * tt, bm.y + (bm.y2 - bm.y) * tt, 30 + wd * 12, bm.color, 0.35); }
    }
    // particles
    for (const p of fx.parts) {
      const f = 1 - p.age / p.life;
      switch (p.k) {
        case 'smoke': g.globalCompositeOperation = 'source-over'; g.globalAlpha = f * 0.35; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.size * (1 + p.age * p.grow), 0, 7); g.fill(); g.globalCompositeOperation = 'lighter'; break;
        case 'chip': g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.min(1, f * 2); g.fillStyle = p.hot && p.age < 0.5 ? '#ffb060' : p.color; g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66); g.restore(); g.globalCompositeOperation = 'lighter'; break;
        case 'spark': g.globalAlpha = f; g.strokeStyle = p.color; g.lineWidth = p.w; line(g, p.x, p.y, p.x - p.vx * 0.03, p.y - p.vy * 0.03); break;
        case 'glow': { g.globalAlpha = f; const s = p.size * (1 + p.age * (p.grow || 0) * 3); g.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2); break; }
        case 'fire': {
          const s = p.size * (0.6 + p.age / p.life * p.grow); const k = p.age / p.life;
          const col = k < 0.25 ? '#fff0c0' : k < 0.5 ? (p.color || '#ffa040') : k < 0.75 ? '#c04010' : '#401808';
          g.globalAlpha = f * 0.9; g.drawImage(glowSprite(col), p.x - s, p.y - s, s * 2, s * 2);
          if (k < 0.5) lc_light(p.x, p.y, s * 3, p.color || '#ff8a2a', f * 0.5);
          break;
        }
        case 'ring': { g.globalAlpha = f; g.strokeStyle = p.color; g.lineWidth = p.w * f + 0.5; const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(p.age / p.life); g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke(); break; }
        case 'bolt': { g.globalAlpha = Math.min(1, f * 1.5); g.strokeStyle = p.color; g.lineWidth = p.w * 2.6; poly(g, p.pts); g.strokeStyle = '#ffffff'; g.lineWidth = p.w * 0.8; poly(g, p.pts); break; }
        case 'line': { g.globalAlpha = f; g.lineCap = 'round'; g.strokeStyle = hexA(p.color, 0.5); g.lineWidth = p.w * 2 * f; line(g, p.x, p.y, p.x2, p.y2); g.strokeStyle = '#ffffff'; g.lineWidth = p.w * 0.5 * f; line(g, p.x, p.y, p.x2, p.y2); g.lineCap = 'butt'; break; }
        case 'shard': { // a bright arc on the shield where it was hit
          g.globalAlpha = f; g.strokeStyle = p.color; g.lineWidth = 3 * f + 1; const an = Math.atan2(p.y - p.cy, p.x - p.cx); const span = 0.12 + p.w / 120;
          g.beginPath(); g.arc(p.cx, p.cy, p.R, an - span, an + span); g.stroke();
          g.drawImage(glowSprite(p.color), p.x - 14, p.y - 14, 28, 28);
          break;
        }
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // drones
    for (const d of w.drones) {
      if (d.dead || !vis(d.x, d.y, 20)) continue;
      g.save(); g.translate(d.x, d.y); g.rotate(d.a);
      g.fillStyle = '#2a3038'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.fill();
      g.strokeStyle = d.def.color; g.lineWidth = 1.4; g.stroke();
      g.restore();
      g.globalCompositeOperation = 'lighter'; g.drawImage(glowSprite(d.def.color), d.x - 6, d.y - 6, 12, 12); g.globalCompositeOperation = 'source-over';
      if (d.def.shield && d.shield > 0) { g.strokeStyle = hexA('#9fd8ff', 0.4); g.lineWidth = 2; g.beginPath(); g.arc(d.x, d.y, 18, 0, 7); g.stroke(); }
      if (d.beam && d.def.repairs && Math.random() < 0.5) { g.strokeStyle = hexA('#6fff8a', 0.5); g.lineWidth = 1; line(g, d.x, d.y, d.beam.x + (Math.random() - 0.5) * d.beam.r, d.beam.y + (Math.random() - 0.5) * d.beam.r); }
      lc_light(d.x, d.y, 30, d.def.color, 0.3);
    }
    // build-mode or other world overlays drawn by the UI
    if (ui.worldOverlay) ui.worldOverlay(g, z);

    // ---------------------------------------------------------- light map
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.fillStyle = '#000'; lc.fillRect(0, 0, lightC.width, lightC.height);
    const lk = lightC.width / W;
    lc.setTransform(z * lk, 0, 0, z * lk, (W / 2 - cam.x * z) * lk, (H / 2 - cam.y * z) * lk);
    lc.globalCompositeOperation = 'lighter';
    if (w.sun) lc.drawImage(lightSprite(w.sun.glow), w.sun.x - w.sun.r * 14, w.sun.y - w.sun.r * 14, w.sun.r * 28, w.sun.r * 28);
    for (const L of frameLights) { lc.globalAlpha = Math.min(1, L.k); lc.drawImage(lightSprite(L.color), L.x - L.r, L.y - L.r, L.r * 2, L.r * 2); }
    for (const L of fx.lights) { lc.globalAlpha = Math.min(1, (L.life / L.max) * L.k); lc.drawImage(lightSprite(L.color), L.x - L.r, L.y - L.r, L.r * 2, L.r * 2); }
    lc.globalAlpha = 1;
    frameLights.length = 0;

    // ---------------------------------------------------------- post
    const shakeX = (Math.random() - 0.5) * fx.shake, shakeY = (Math.random() - 0.5) * fx.shake;
    if (post) {
      const waves = fx.waves.map(v => {
        const k = v.age / v.life; const rr = v.maxR * Math.sqrt(k) * z / H;
        return { x: ((v.x - cam.x) * z + W / 2 + shakeX) / W, y: 1 - ((v.y - cam.y) * z + H / 2 + shakeY) / H, r: rr, s: v.strength * (1 - k), th: Math.max(0.01, 0.06 * (1 - k * 0.5)) };
      });
      post.render(scene, lightC, { waves, ambient: ui.ambient ?? 0.8, bloom: ui.bloom ?? 0.9, flash: fx.flash, flashColor: fx.flashColor, vignette: 0.85 });
      view.style.transform = fx.shake > 0.5 ? `translate(${shakeX / R.dpr}px,${shakeY / R.dpr}px)` : '';
    } else {
      view2d.setTransform(1, 0, 0, 1, 0, 0); view2d.drawImage(scene, shakeX, shakeY);
      view2d.globalCompositeOperation = 'lighter'; view2d.globalAlpha = 0.5; view2d.drawImage(lightC, 0, 0, W, H); view2d.globalAlpha = 1; view2d.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------------- overlay (labels; not post-processed)
    const ow = overlay.width, oh = overlay.height; const ok = ow / view.clientWidth;
    oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, ow, oh);
    const oz = cam.zoom * ok; const ox = x => (x - cam.x) * oz + ow / 2, oy = y => (y - cam.y) * oz + oh / 2;
    oc.textAlign = 'center'; oc.textBaseline = 'bottom';
    // loot labels (items always, materials when close)
    const placed = [];
    for (const p of w.pickups) {
      if (p.kind !== 'item' && p.kind !== 'specimen') continue;
      const x = ox(p.x), y = oy(p.y) - 14 * ok; if (x < -100 || y < -40 || x > ow + 100 || y > oh + 40) continue;
      const col = p.kind === 'item' ? RARITY_BY_ID[p.rarity]?.color : '#c8ff6a';
      const label = p.kind === 'item' ? p.item.name : p.name;
      oc.font = `${Math.round(12 * ok)}px system-ui, sans-serif`;
      const wdt = oc.measureText(label).width + 10 * ok; let yy = y;
      for (const q of placed) if (Math.abs(q[0] - x) < (wdt + q[2]) / 2 && Math.abs(q[1] - yy) < 16 * ok) yy = q[1] - 17 * ok;
      placed.push([x, yy, wdt]);
      oc.fillStyle = 'rgba(0,0,0,0.65)'; oc.fillRect(x - wdt / 2, yy - 15 * ok, wdt, 16 * ok);
      oc.fillStyle = col; oc.fillText(label, x, yy);
    }
    for (const tx of fx.texts) {
      const f = 1 - tx.age / tx.life; oc.globalAlpha = Math.min(1, f * 2);
      oc.font = `bold ${Math.round(tx.size * ok)}px system-ui, sans-serif`;
      oc.strokeStyle = 'rgba(0,0,0,0.8)'; oc.lineWidth = 3 * ok; oc.strokeText(tx.str, ox(tx.x), oy(tx.y)); oc.fillStyle = tx.color; oc.fillText(tx.str, ox(tx.x), oy(tx.y));
    }
    oc.globalAlpha = 1;
    if (ui.overlay) ui.overlay(oc, { ox, oy, oz, ok, ow, oh });
  };

  const frameLights = [];
  function lc_light(x, y, r, color, k) { if (frameLights.length < 600) frameLights.push({ x, y, r, color, k }); }
  R.light = lc_light;
  function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
  function streak(g, x, y, a, L, c) { g.lineCap = 'round'; g.strokeStyle = hexA(c, 0.5); const lw = g.lineWidth; g.lineWidth = lw * 2.2; line(g, x, y, x - Math.cos(a) * L, y - Math.sin(a) * L); g.strokeStyle = '#ffffff'; g.lineWidth = lw * 0.6; line(g, x, y, x - Math.cos(a) * L * 0.7, y - Math.sin(a) * L * 0.7); g.lineCap = 'butt'; }
  return R;
}
