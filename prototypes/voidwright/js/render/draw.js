// The frame: background → sun → planets → rocks/wrecks → ships → shots → beams → particles, a coloured
// light map, then the WebGL post pass (bloom + shockwaves). Labels go on a plain overlay canvas on top.

import { createPost } from './post.js';
import { bakeBody, bakeKey, paletteFor, mix as mixHex } from './bake.js';
import { drawTurret } from './turret-art.js';
import { glowSprite, lightSprite, hexA, impactFx } from './fx.js';
import { toWorld } from '../sim/ship.js';
import { CELL } from '../sim/grid.js';
import { RARITY_BY_ID, MATERIALS } from '../data/types.js';
import { noise2, rng, hash } from '../core/math.js';
import { shieldRadius } from '../sim/world.js';
import { createPlanets } from './planets.js';

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export function createRenderer(view, overlay, opts = {}) {
  const scene = mk(16, 16), lightC = mk(16, 16);
  const sc = scene.getContext('2d'), lc = lightC.getContext('2d');
  const oc = overlay.getContext('2d');
  let post = opts.noGL ? null : createPost(view);
  const view2d = post ? null : view.getContext('2d');
  const R = { scene, post, quality: 1, dpr: 1, bakes: new Map(), stars: null, nebula: null, W: 0, H: 0, drawn: { x: 0, y: 0, cx: 0, cy: 0, z: 1, n: 0 }, lastShots: new Map() };

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
    R.bakes.clear(); planets.clear();
  };

  // planets live in render/planets.js (unique sphere-noise pictures, day/night, air, clouds, rings, cities)
  const planets = createPlanets(R);
  R.scorchPlanet = (p, x, y) => planets.scorch(p, x, y);
  R.planetStats = () => planets.stats();
  R.planetFinish = w => planets.finish(w);

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
    resize(); fx_ref = fx;
    { const nowT = performance.now(); R.lastDt = R._lt ? Math.min(0.1, (nowT - R._lt) / 1000) : 1 / 60; R._lt = nowT; }
    const W = R.W, H = R.H; const z = cam.zoom * R.dpr; const t = w.t;
    // what was actually drawn this frame (tools/smooth-check.mjs reads it to measure judder)
    if (w.player) { R.drawn.x = w.player.x; R.drawn.y = w.player.y; R.drawn.cx = cam.x; R.drawn.cy = cam.y; R.drawn.z = cam.zoom; R.drawn.n++; }
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
    // planets (render/planets.js)
    planets.draw(g, w, cam, z, W, H, t, lc_light);
    // boost speed lines: thin streaks fixed in space that rush past the ship while the boost burns
    speedLines(g, w, cam, z, ui.boost || 0, W, H);
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
        const sp = Math.hypot(s.vx, s.vy); const bst = s.boosting ? 1 : 0; const thr = (s.thrusting ? 1 : 0.25) * (bst ? 2.6 : 1);
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
          if (bst) {
            // boost: a long white-hot core, a wide outer plume and bright shock diamonds that flicker
            const BL = L * 1.25;
            const tx2 = ex + ax * BL, ty2 = ey + ay * BL, wq = e.n * 4.2 * (0.9 + Math.random() * 0.2), px2 = -ay, py2 = ax;
            const fg = g.createLinearGradient(ex, ey, tx2, ty2); fg.addColorStop(0, hexA(col, 0.85)); fg.addColorStop(0.35, hexA(col, 0.45)); fg.addColorStop(1, hexA(col, 0));
            g.globalAlpha = 1; g.fillStyle = fg; g.beginPath(); g.moveTo(ex + px2 * wq, ey + py2 * wq); g.quadraticCurveTo(ex + ax * BL * 0.4 + px2 * wq * 1.1, ey + ay * BL * 0.4 + py2 * wq * 1.1, tx2, ty2); g.quadraticCurveTo(ex + ax * BL * 0.4 - px2 * wq * 1.1, ey + ay * BL * 0.4 - py2 * wq * 1.1, ex - px2 * wq, ey - py2 * wq); g.closePath(); g.fill();
            g.lineCap = 'round'; g.strokeStyle = hexA('#ffffff', 0.75); g.lineWidth = e.n * 2.6; line(g, ex, ey, ex + ax * BL * 0.45, ey + ay * BL * 0.45); g.lineCap = 'butt';
            const ph = (t * 40 + e.b.idx) % 1;
            for (let k = 0; k < 3; k++) { const d = (k + ph) / 3 * BL * 0.7; const ds = e.n * (3.2 - k * 0.6); g.globalAlpha = 0.7 - k * 0.15; g.drawImage(glowSprite('#ffffff', 0.4), ex + ax * d - ds, ey + ay * d - ds, ds * 2, ds * 2); }
          }
          lc_light(ex + ax * 14, ey + ay * 14, (26 + e.n * 18) * (bst ? 1.8 : 1), col, 0.18 * thr);
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
      g.globalAlpha = s.emp > 0 ? 0.2 + Math.random() * 0.3 : 0.9; g.drawImage(b.glow, 0, 0);
      if (s.kind === 'rock' && s.scanned) { g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 2.5 + s.id); g.drawImage(b.glow, 0, 0); }   // scanned: ore veins shine brighter
      g.restore();
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
      const col = p.kind === 'mat' ? MATERIALS[p.mat]?.color || '#fff' : (p.kind === 'item' || p.kind === 'drone') ? RARITY_BY_ID[p.rarity]?.color || '#c9ccd4' : p.kind === 'cr' || p.kind === 'cache' ? '#ffd84a' : p.kind === 'data' ? '#7af7ff' : p.kind === 'pod' ? '#ffffff' : '#c8ff6a';
      const bob = Math.sin(t * 3 + p.id) * 1.5;
      if (p.kind === 'item' || p.kind === 'drone') {
        const RR = RARITY_BY_ID[p.rarity] || RARITY_BY_ID.common; const big = RR.index;
        if (big >= 1) {
          // light pillar up the screen: short for uncommon/rare, tall and pulsing for epic and up
          const grand = big >= 3; const pulse = grand ? 0.75 + 0.25 * Math.sin(t * 3 + p.id) : 1;
          const hgt = (grand ? 220 + (big - 3) * 160 : 40 + big * 25) / Math.sqrt(z);
          const pw = (grand ? 6 + big * 2 : 2 + big) / Math.sqrt(Math.max(0.3, z));
          const gr = g.createLinearGradient(p.x, p.y, p.x, p.y - hgt);
          gr.addColorStop(0, hexA(col, (grand ? 0.75 : 0.45) * pulse)); gr.addColorStop(0.4, hexA(col, (grand ? 0.3 : 0.15) * pulse)); gr.addColorStop(1, hexA(col, 0));
          g.fillStyle = gr; g.fillRect(p.x - pw, p.y - hgt, pw * 2, hgt);
          if (grand) { g.fillStyle = hexA('#ffffff', 0.35 * pulse); g.fillRect(p.x - pw * 0.25, p.y - hgt * 0.7, pw * 0.5, hgt * 0.7); }
          // rays
          if (big >= 2) {
            g.save(); g.translate(p.x, p.y + bob); g.rotate(t * 0.8);
            const nr = grand ? 6 + big : 4; const rl = grand ? 34 + big * 10 : 22;
            for (let i = 0; i < nr; i++) { g.rotate(Math.PI * 2 / nr); g.fillStyle = hexA(col, (grand ? 0.16 + big * 0.03 : 0.1) * pulse); g.beginPath(); g.moveTo(0, 0); g.lineTo(rl, -3); g.lineTo(rl, 3); g.fill(); }
            g.restore();
          }
          if (grand) {
            // a slow glow that still shows when zoomed far out, and sparkles circling the drop
            const far = Math.min(900, 70 / Math.max(0.05, z)) * pulse;
            g.globalAlpha = 0.22 * pulse; g.drawImage(glowSprite(col), p.x - far, p.y - far, far * 2, far * 2); g.globalAlpha = 1;
            const ns = R.quality >= 1 ? 4 + (big - 3) * 2 : 3;
            for (let i = 0; i < ns; i++) {
              const an = t * (1.4 + (i % 3) * 0.35) * (i % 2 ? -1 : 1) + i * 2.1 + p.id; const rr = 16 + (i % 3) * 8 + Math.sin(t * 2 + i) * 3;
              const sx2 = p.x + Math.cos(an) * rr, sy2 = p.y + bob + Math.sin(an) * rr * 0.7; const ss = 2.2 + Math.sin(t * 6 + i * 1.7) * 1.2;
              g.drawImage(glowSprite(i % 2 ? '#ffffff' : col, 0.3), sx2 - ss * 2, sy2 - ss * 2, ss * 4, ss * 4);
            }
          }
        }
        g.drawImage(glowSprite(col), p.x - 16, p.y - 16 + bob, 32, 32);
        g.globalCompositeOperation = 'source-over';
        g.save(); g.translate(p.x, p.y + bob); g.rotate(p.spin + t * 0.5);
        if (p.kind === 'drone') { g.fillStyle = '#2a3038'; g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.strokeStyle = col; g.lineWidth = 1.4; g.stroke(); }
        else { g.fillStyle = '#20242c'; g.fillRect(-5, -5, 10, 10); g.strokeStyle = col; g.lineWidth = 1.6; g.strokeRect(-5, -5, 10, 10); g.fillStyle = col; g.fillRect(-2, -2, 4, 4); }
        g.restore();
        g.globalCompositeOperation = 'lighter';
        lc_light(p.x, p.y, (80 + big * 40) * (big >= 3 ? 2 : 1), col, big >= 3 ? 0.9 : 0.6);
      } else if (p.kind === 'cache') {
        // a sealed gold crate: slow pulse, a glint sweeping across the lid, light rays
        const pulse = 0.7 + 0.3 * Math.sin(t * 2.2 + p.id);
        g.globalAlpha = 0.6 * pulse; g.drawImage(glowSprite(col), p.x - 26, p.y - 26 + bob, 52, 52); g.globalAlpha = 1;
        g.save(); g.translate(p.x, p.y + bob); g.rotate(t * 0.5);
        for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.fillStyle = hexA(col, 0.1 * pulse); g.beginPath(); g.moveTo(0, 0); g.lineTo(30, -2.5); g.lineTo(30, 2.5); g.fill(); }
        g.restore();
        g.globalCompositeOperation = 'source-over';
        g.save(); g.translate(p.x, p.y + bob); g.rotate((p.spin || 0) + t * 0.3);
        g.fillStyle = '#5a4416'; g.fillRect(-7, -6, 14, 12); g.fillStyle = '#c89a2a'; g.fillRect(-7, -6, 14, 3); g.fillRect(-1.2, -6, 2.4, 12);
        g.strokeStyle = '#ffe48a'; g.lineWidth = 1.2; g.strokeRect(-7, -6, 14, 12);
        const gl = ((t * 0.7 + p.id * 0.13) % 2) - 0.5;   // glint passes every couple of seconds
        if (gl > 0 && gl < 1) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,250,220,0.8)'; g.beginPath(); const gx = -9 + gl * 18; g.moveTo(gx, -6); g.lineTo(gx + 3, -6); g.lineTo(gx - 1, 6); g.lineTo(gx - 4, 6); g.fill(); }
        g.restore(); g.globalCompositeOperation = 'lighter';
        lc_light(p.x, p.y, 90, col, 0.5 * pulse);
      } else if (p.kind === 'data') {
        // a small cyan data core: a spinning hexagon with a bright centre
        g.drawImage(glowSprite(col), p.x - 12, p.y - 12 + bob, 24, 24);
        g.save(); g.translate(p.x, p.y + bob); g.rotate(t * 1.6 + p.id);
        g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); for (let i = 0; i < 6; i++) g.lineTo(Math.cos(i * Math.PI / 3) * 5, Math.sin(i * Math.PI / 3) * 5); g.closePath(); g.stroke();
        g.fillStyle = '#ffffff'; g.fillRect(-1.5, -1.5, 3, 3); g.restore();
        lc_light(p.x, p.y, 50, col, 0.4);
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
    // shots — stronger weapons (higher tier or rarer part, p.vis) get bigger glows, longer trails and orbiting motes
    const liveShots = new Map();
    for (const p of w.shots) {
      const pv = p.vis || 0;
      if (pv >= 1 && p.kind !== 'harpoon' && p.kind !== 'mine') liveShots.set(p.id, { x: p.x, y: p.y, vis: pv, color: p.color, rc: p.rc, life: p.life, vx: p.vx, vy: p.vy });
      if (!vis(p.x, p.y, 60 + pv * 20)) continue;
      const a = Math.atan2(p.vy, p.vx); const c = p.color; const vk = 1 + pv * 0.3;
      if (pv >= 1 && p.kind !== 'harpoon' && p.kind !== 'mine') shotPower(g, p, a, pv, t);
      switch (p.kind) {
        case 'bolt': case 'pulse': { const L = (p.kind === 'pulse' ? 10 : 22) * (1 + pv * 0.35); g.strokeStyle = c; g.lineWidth = (p.w?.size === 'm' ? 4 : 2.6) * (1 + pv * 0.18); streak(g, p.x, p.y, a, L, c); lc_light(p.x, p.y, 50 * vk, c, 0.5); break; }
        case 'bullet': g.strokeStyle = '#fff2c0'; g.lineWidth = 1.4; line(g, p.x, p.y, p.x - Math.cos(a) * 12, p.y - Math.sin(a) * 12); break;
        case 'shell': case 'slug': { g.drawImage(glowSprite(c), p.x - 8 * vk, p.y - 8 * vk, 16 * vk, 16 * vk); g.strokeStyle = hexA(c, 0.6); g.lineWidth = p.kind === 'slug' ? 3 : 2; line(g, p.x, p.y, p.x - Math.cos(a) * (p.kind === 'slug' ? 40 : 18), p.y - Math.sin(a) * (p.kind === 'slug' ? 40 : 18)); lc_light(p.x, p.y, 50, c, 0.4); break; }
        case 'plasma': { const s = (p.w?.size === 'l' ? 16 : p.w?.size === 'm' ? 12 : 7) * (1 + pv * 0.2); const wob = 1 + Math.sin(t * 30 + p.id) * 0.15; g.drawImage(glowSprite(c), p.x - s * 1.5 * wob, p.y - s * 1.5 * wob, s * 3 * wob, s * 3 * wob); g.drawImage(glowSprite('#ffffff', 0.5), p.x - s * 0.5, p.y - s * 0.5, s, s); lc_light(p.x, p.y, s * 8, c, 0.6); break; }
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
        case 'flak': g.drawImage(glowSprite(c), p.x - 5 * vk, p.y - 5 * vk, 10 * vk, 10 * vk); break;
        case 'mine': { const blink = Math.sin(t * 8 + p.id) > 0.3; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#3a3a40'; g.beginPath(); g.arc(p.x, p.y, 6, 0, 7); g.fill(); g.globalCompositeOperation = 'lighter'; if (blink) g.drawImage(glowSprite(c), p.x - 9, p.y - 9, 18, 18); break; }
        case 'harpoon': { g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#c8d0d8'; g.lineWidth = 1.5; const o = p.owner; line(g, o.x, o.y, p.x, p.y); g.save(); g.translate(p.x, p.y); g.rotate(a); g.fillStyle = '#e8eef2'; g.beginPath(); g.moveTo(8, 0); g.lineTo(-4, -4); g.lineTo(-2, 0); g.lineTo(-4, 4); g.fill(); g.restore(); g.globalCompositeOperation = 'lighter'; break; }
        default: g.drawImage(glowSprite(c), p.x - 6 * vk, p.y - 6 * vk, 12 * vk, 12 * vk);
      }
    }
    // a strong shot that vanished before its time ran out hit something: a bigger impact for bigger guns
    for (const [id, o] of R.lastShots) if (!liveShots.has(id) && o.life > 0.04 && vis(o.x, o.y, 100)) impactFx(fx, o.x + o.vx / 120, o.y + o.vy / 120, o.color, o.vis, o.rc);
    R.lastShots = liveShots;
    // beams: wide soft glow + bright core + hot end; stronger beams (bm.vis) get helix strands wrapped round the core
    for (const bm of w.beams) {
      const wd = Math.max(1, bm.width);
      const flick = 0.85 + Math.random() * 0.3;
      if (bm.vis >= 1) beamHelix(g, bm, wd, t, z);
      g.strokeStyle = hexA(bm.color, 0.25); g.lineWidth = wd * 4 * flick; g.lineCap = 'round'; line(g, bm.x, bm.y, bm.x2, bm.y2);
      g.strokeStyle = hexA(bm.color, 0.7); g.lineWidth = wd * 1.6; line(g, bm.x, bm.y, bm.x2, bm.y2);
      g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(0.8, wd * 0.5); line(g, bm.x, bm.y, bm.x2, bm.y2);
      g.lineCap = 'butt';
      if (bm.hit) { const s = (10 + wd * 5) * (1 + Math.min(4, bm.vis || 0) * 0.18); g.drawImage(glowSprite(bm.color), bm.x2 - s, bm.y2 - s, s * 2, s * 2); if (bm.vis >= 3) { const s2 = s * (0.45 + Math.random() * 0.3); g.drawImage(glowSprite(bm.rc || '#ffffff', 0.4), bm.x2 - s2, bm.y2 - s2, s2 * 2, s2 * 2); lc_light(bm.x2, bm.y2, 60 + bm.vis * 30, bm.rc || bm.color, 0.7); } if (Math.random() < 0.5 && fx.parts.length < fx.max) fx.parts.push({ k: 'spark', x: bm.x2, y: bm.y2, vx: (Math.random() - 0.5) * 300, vy: (Math.random() - 0.5) * 300, life: 0.25, age: 0, color: bm.tool === 'mine' ? '#ffd080' : bm.color, w: 1.4, drag: 0.9 }); }
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
        case 'scan': { // a scanner pulse: an expanding cyan ring with a radar sweep behind it
          const k = p.age / p.life; const rr = p.r * Math.sqrt(k); const sw = t * 6 + p.a0;
          g.globalAlpha = f; g.strokeStyle = '#7af7ff'; g.lineWidth = (3 + 4 * f) / Math.sqrt(Math.max(0.1, z)); g.beginPath(); g.arc(p.x, p.y, rr, 0, 7); g.stroke();
          g.globalAlpha = f * 0.25; g.fillStyle = '#7af7ff'; g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, rr, sw - 0.7, sw); g.closePath(); g.fill();
          break;
        }
        case 'pillar': { // a column of light shooting up from a rare drop, fading from the bottom up
          const k = p.age / p.life; const hh = p.h * Math.min(1, k * 5) / Math.sqrt(Math.max(0.15, z)); const ww = p.w * (1 - k * 0.6) / Math.sqrt(Math.max(0.3, z));
          const gr = g.createLinearGradient(p.x, p.y, p.x, p.y - hh);
          gr.addColorStop(0, hexA(p.color, 0)); gr.addColorStop(0.08, hexA(p.color, 0.8 * f)); gr.addColorStop(0.5, hexA(p.color, 0.35 * f)); gr.addColorStop(1, hexA(p.color, 0));
          g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(p.x - ww, p.y - hh, ww * 2, hh);
          g.fillStyle = hexA('#ffffff', 0.55 * f); g.fillRect(p.x - ww * 0.25, p.y - hh * 0.8, ww * 0.5, hh * 0.8);
          break;
        }
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
      const P0 = w.player; const bc = P0 ? [((P0.x - cam.x) * z + W / 2) / W, 1 - ((P0.y - cam.y) * z + H / 2) / H] : [0.5, 0.5];
      post.render(scene, lightC, { waves, ambient: ui.ambient ?? 0.8, bloom: ui.bloom ?? 0.9, flash: fx.flash, flashColor: fx.flashColor, vignette: 0.85 + (ui.boost || 0) * 0.35, boost: (ui.boost || 0) * (R.quality >= 1 ? 1 : 0.6), boostC: bc });
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

  /** Extra layers on a strong projectile: a longer fading trail, a wider halo, and motes circling it (vis 2+). */
  function shotPower(g, p, a, pv, t) {
    const c = p.color, tint = p.rc || c; const ca = Math.cos(a), sa = Math.sin(a);
    const L = 18 + pv * 16; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { g.strokeStyle = hexA(tint, (0.32 - k * 0.09) * Math.min(1, 0.5 + pv * 0.2)); g.lineWidth = (2 + pv * 0.9) * (1 - k * 0.25); line(g, p.x - ca * L * k / 3, p.y - sa * L * k / 3, p.x - ca * L * (k + 1) / 3, p.y - sa * L * (k + 1) / 3); }
    g.lineCap = 'butt';
    const h = 7 + pv * 4; g.globalAlpha = Math.min(0.8, 0.3 + pv * 0.12); g.drawImage(glowSprite(tint), p.x - h, p.y - h, h * 2, h * 2); g.globalAlpha = 1;
    if (pv >= 2) {
      const n = Math.min(3, pv - 1), rr = 4 + pv * 1.6, ms = 2.5 + pv * 0.6;
      for (let i = 0; i < n; i++) {
        const an = t * 18 + (p.id % 7) + i * Math.PI * 2 / n; const ox = Math.cos(an) * rr, oy = Math.sin(an) * rr * 0.55;   // a tilted orbit round the flight line
        const mx = p.x + ca * ox - sa * oy, my = p.y + sa * ox + ca * oy;
        g.drawImage(glowSprite(i % 2 ? '#ffffff' : tint, 0.3), mx - ms, my - ms, ms * 2, ms * 2);
      }
    }
    if (pv >= 3) lc_light(p.x, p.y, 40 + pv * 18, tint, 0.35);
  }

  /** Helix strands that wrap round a beam: 1 strand at vis 1, a double helix at 2, more plus sparkles at 3+. */
  function beamHelix(g, bm, wd, t, z) {
    const dx = bm.x2 - bm.x, dy = bm.y2 - bm.y; const L = Math.hypot(dx, dy); if (L < 4) return;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const v = bm.vis; const strands = v >= 5 ? 4 : v >= 3 ? 3 : v;
    const amp = wd * 1.3 + 2.5 + Math.min(4, v) * 0.9, lam = 58 + wd * 5, spin = t * 14 * (bm.tool === 'mine' ? 0.8 : 1);
    const col = bm.rc || mixHex(bm.color, '#ffffff', 0.35);
    const step = Math.max(3, Math.min(8, 4 / Math.sqrt(Math.max(0.05, z)))); const n = Math.min(140, Math.ceil(L / step));
    const fade = s => Math.min(1, s / 18, (L - s) / 10 + 0.3);   // strands start at the muzzle and taper at the far end
    g.lineCap = 'round';
    for (let k = 0; k < strands; k++) {
      const ph = k * Math.PI * 2 / strands;
      // two passes: the half of each turn behind the beam is dim and thin, the half in front is bright and thick
      for (const front of [false, true]) {
        g.strokeStyle = hexA(col, front ? 0.85 : 0.3); g.lineWidth = (front ? 1.6 : 1) * Math.max(1, wd * 0.45) * (1 + Math.min(3, v) * 0.12);
        g.beginPath(); let pen = false;
        for (let i = 0; i <= n; i++) {
          const s = i / n * L; const th = s / lam * Math.PI * 2 - spin + ph;
          const depth = Math.cos(th); const isFront = depth >= 0;
          const off = Math.sin(th) * amp * fade(s);
          const px = bm.x + ux * s + nx * off, py = bm.y + uy * s + ny * off;
          if (isFront === front) { if (pen) g.lineTo(px, py); else { g.moveTo(px, py); pen = true; } } else pen = false;
        }
        g.stroke();
      }
    }
    g.lineCap = 'butt';
    if (v >= 3 && fx_ref && fx_ref.parts.length < fx_ref.max * fx_ref.quality) {
      const count = R.quality >= 1 ? Math.min(4, v - 1) : 1;
      for (let i = 0; i < count; i++) if (Math.random() < 0.6) {
        const s = Math.random() * L; const off = (Math.random() - 0.5) * amp * 2;
        fx_ref.parts.push({ k: 'glow', x: bm.x + ux * s + nx * off, y: bm.y + uy * s + ny * off, vx: nx * (Math.random() - 0.5) * 60, vy: ny * (Math.random() - 0.5) * 60, life: 0.35, age: 0, color: Math.random() < 0.5 ? '#ffffff' : col, size: 2.5 + Math.random() * 2.5, drag: 0.9, grow: 0 });
      }
    }
    if (v >= 2) { const m = Math.max(2, Math.min(6, L / 120)); for (let i = 0; i <= m; i++) lc_light(bm.x + dx * i / m, bm.y + dy * i / m, 30 + v * 10, col, 0.18); }
  }
  let fx_ref = null;

  R.streaks = [];
  function speedLines(g, w, cam, z, k, W, H) {
    const P = w.player; const L = R.streaks;
    if (P && k > 0.02) {
      const sp = Math.hypot(P.vx, P.vy); const want = Math.round((R.quality >= 1 ? 70 : 30) * k);
      const hw = W / 2 / z, hh = H / 2 / z;
      // new lines appear across the view, mostly ahead of the ship so they sweep past it
      let tries = 0;
      while (L.length < want && tries++ < 12) {
        const ux = P.vx / (sp || 1), uy = P.vy / (sp || 1);
        const ahead = (Math.random() * 1.6 - 0.3) * Math.max(hw, hh);
        L.push({ x: cam.x + ux * ahead + (Math.random() - 0.5) * hw * 2.2 * Math.abs(uy) + (Math.random() - 0.5) * hw * 0.4, y: cam.y + uy * ahead + (Math.random() - 0.5) * hh * 2.2 * Math.abs(ux) + (Math.random() - 0.5) * hh * 0.4, life: 0.5 + Math.random() * 0.5, age: 0 });
      }
    }
    if (!L.length) return;
    const dt = Math.min(0.05, R.lastDt || 1 / 60);
    const vx = P ? P.vx : 0, vy = P ? P.vy : 0; const sp = Math.hypot(vx, vy) || 1;
    const len = Math.min(900, sp * 0.16 + 40);
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i]; s.age += dt;
      const off = Math.abs(s.x - cam.x) * z > W * 0.8 || Math.abs(s.y - cam.y) * z > H * 0.8;
      if (s.age >= s.life || off) { L.splice(i, 1); continue; }
      const f = Math.sin(s.age / s.life * Math.PI) * Math.max(0, k);
      g.strokeStyle = hexA('#cfe6ff', 0.32 * f); g.lineWidth = 1.4 / z;
      line(g, s.x, s.y, s.x - vx / sp * len, s.y - vy / sp * len);
    }
    g.lineCap = 'butt'; g.globalCompositeOperation = 'source-over';
  }

  const frameLights = [];
  function lc_light(x, y, r, color, k) { if (frameLights.length < 600) frameLights.push({ x, y, r, color, k }); }
  R.light = lc_light;
  function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
  function streak(g, x, y, a, L, c) { g.lineCap = 'round'; g.strokeStyle = hexA(c, 0.5); const lw = g.lineWidth; g.lineWidth = lw * 2.2; line(g, x, y, x - Math.cos(a) * L, y - Math.sin(a) * L); g.strokeStyle = '#ffffff'; g.lineWidth = lw * 0.6; line(g, x, y, x - Math.cos(a) * L * 0.7, y - Math.sin(a) * L * 0.7); g.lineCap = 'butt'; }
  return R;
}
