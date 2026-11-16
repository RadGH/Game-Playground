// The title screen's backdrop: a night skyline of real City Kit buildings on an iso strip, a slow aurora, shooting
// stars and a few hover-car lights. Kept cheap: each building is baked ONCE (spread over frames, cached for the page's
// life), the sky, far skyline and city are drawn into pictures on resize, and each frame only adds the moving bits.
//
//   const scene = createTitleScene(canvas, { light: false, sky: true });  scene.start(); … scene.stop();
import { Baker, composite } from '../../../../citykit/js/bake.js';
import { build } from '../../../../citykit/js/kit/buildings.js';
import '../../../../citykit/js/kit/all.js';
import { Weather } from '../../../../citykit/js/world/weather.js';
import { toScreen } from '../../../../citykit/js/iso.js';

// The skyline: back row of towers, front row of low buildings. (x, z) = lot top-left in tiles; centres sit on two
// screen-level lines so the strip reads as a skyline across the screen.
const BACK = [
  { id: 'res-tower', p: { floors: 34, taper: 2, style: 'pearl', seed: 3 }, slot: -5 },
  { id: 'com-office', p: { floors: 46, shape: 2, style: 'chrome', seed: 5 }, slot: -4 },
  { id: 'com-hotel', p: { floors: 26, style: 'copper', seed: 2 }, slot: -3 },
  { id: 'res-tower', p: { floors: 52, taper: 3, style: 'chrome', seed: 8 }, slot: -2 },
  { id: 'lm-arcology', p: { floors: 60, tiers: 5, style: 'graphite', seed: 1 }, slot: 0, big: true },
  { id: 'com-office', p: { floors: 58, shape: 1, style: 'graphite', seed: 9 }, slot: 2 },
  { id: 'com-hotel', p: { floors: 34, style: 'chrome', seed: 6 }, slot: 3 },
  { id: 'res-tower', p: { floors: 40, taper: 1, style: 'graphite', seed: 12 }, slot: 4 },
  { id: 'com-office', p: { floors: 30, shape: 0, style: 'chrome', seed: 2 }, slot: 5 },
];
const FRONT = [
  { id: 'res-block', p: { floors: 9, wings: 2, style: 'graphite', seed: 4 }, slot: -4 },
  { id: 'com-shops', p: { floors: 3, style: 'graphite', seed: 7 }, slot: -3 },
  { id: 'col-comms', p: { tier: 3, style: 'chrome', seed: 2 }, slot: -2 },
  { id: 'com-shops', p: { floors: 2, style: 'chrome', seed: 3 }, slot: -1 },
  { id: 'res-block', p: { floors: 12, wings: 1, style: 'chrome', seed: 9 }, slot: 1 },
  { id: 'com-shops', p: { floors: 4, style: 'graphite', seed: 11 }, slot: 2 },
  { id: 'res-block', p: { floors: 7, wings: 2, style: 'graphite', seed: 13 }, slot: 3 },
  { id: 'com-shops', p: { floors: 3, style: 'chrome', seed: 15 }, slot: 4 },
];
const key = b => `${b.id}|${JSON.stringify(b.p)}`;
const cache = new Map();          // baked pictures live for the whole page (the title can be opened many times)
let baker = null, bakeFailed = false;
const rnd = (a, b) => a + Math.random() * (b - a);

export function createTitleScene(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const weather = new Weather();
  weather.set('aurora', opts.sky !== false); weather.set('stars', opts.sky !== false);
  let W = 1, H = 1, dpr = 1, raf = 0, last = 0, running = false, zoom = 1, baseY = 0;
  let sky = null, city = null, aur = null, aurTick = 0, stars = [], cars = [];
  const light = () => !!opts.light;

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); dpr = Math.min(light() ? 1 : 2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    // the skyline fills the width on a desktop and stays tall on a phone
    zoom = Math.max(0.5, Math.min(1.25, W / 1500, H / 760));
    baseY = H * (W < 700 ? 0.66 : 0.74);
    stars = Array.from({ length: Math.round(W * H / 4200) }, () => ({ x: Math.random() * W, y: Math.random() * baseY * 0.85, r: Math.random() < 0.1 ? 1.4 : 0.8, p: Math.random() * 6, s: rnd(0.6, 2) }));
    drawSky(); drawCity();
    aur = document.createElement('canvas'); aur.width = Math.ceil(W / 2); aur.height = Math.ceil(baseY / 2);
  }
  function drawSky() {
    sky = document.createElement('canvas'); sky.width = canvas.width; sky.height = canvas.height;
    const g = sky.getContext('2d'); g.scale(dpr, dpr);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#03040c'); gr.addColorStop(0.45, '#0a0f26'); gr.addColorStop(0.72, '#24123a'); gr.addColorStop(1, '#05060d');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // horizon glow behind the city
    const hg = g.createRadialGradient(midX(), baseY, 0, midX(), baseY, Math.max(W, H) * 0.7);
    hg.addColorStop(0, 'rgba(255, 79, 216, 0.28)'); hg.addColorStop(0.35, 'rgba(90, 60, 200, 0.12)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg; g.fillRect(0, 0, W, H);
    // a far skyline of plain shapes with a few lit windows, two layers
    for (const [layer, col, hMax, alpha] of [[0, '#120f2a', 210, 1], [1, '#0b0b1d', 140, 1]]) {
      let x = -20; const R = seeded(layer + 7);
      g.fillStyle = col; g.globalAlpha = alpha;
      while (x < W + 20) {
        const w = 16 + R() * 46, h = (30 + R() * hMax) * Math.max(0.6, zoom), y = baseY - 30 * zoom - h + layer * 26 * zoom;
        g.fillStyle = col; g.fillRect(x, y, w, H - y);
        if (R() < 0.3) { g.fillRect(x + w / 2 - 1, y - 18 * zoom, 2, 18 * zoom); }
        for (let wy = y + 6; wy < baseY; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (R() < 0.07) { g.fillStyle = R() < 0.5 ? 'rgba(255,190,110,0.5)' : 'rgba(110,230,255,0.45)'; g.fillRect(wx, wy, 2, 2); g.fillStyle = col; }
        x += w + R() * 10;
      }
      g.globalAlpha = 1;
    }
  }
  // tile → screen, centred on the strip's middle (right of the menu on a desktop)
  const midX = () => (W < 760 ? W * 0.5 : W * 0.64);
  const at = (x, z) => { const s = toScreen(x, z, 0, 0); return { x: midX() + s.sx * zoom, y: baseY + s.sy * zoom - 64 * zoom }; };
  function drawCity() {
    city = document.createElement('canvas'); city.width = canvas.width; city.height = canvas.height;
    const g = city.getContext('2d'); g.scale(dpr, dpr);
    // the ground strip: diamond tiles between the two rows, a glowing avenue down the middle
    const span = Math.ceil(W / (64 * zoom)) + 4;
    for (let sum = -3; sum <= 9; sum++) for (let k = -span; k <= span; k++) {
      if ((sum + k) % 2) continue;
      const x = (sum + k) / 2, z = (sum - k) / 2, c = at(x + 0.5, z + 0.5);
      const road = sum === 4 || sum === 5;
      g.beginPath(); g.moveTo(c.x, c.y - 16 * zoom); g.lineTo(c.x + 32 * zoom, c.y); g.lineTo(c.x, c.y + 16 * zoom); g.lineTo(c.x - 32 * zoom, c.y); g.closePath();
      g.fillStyle = road ? '#151a2c' : (sum + k) % 4 ? '#0e1424' : '#0c1120'; g.fill();
      g.strokeStyle = road ? 'rgba(255, 176, 46, 0.18)' : 'rgba(63, 240, 255, 0.07)'; g.lineWidth = 1; g.stroke();
    }
    // also the tiles on odd sums (fill the gaps of the chequer)
    for (let sum = -3; sum <= 9; sum++) for (let k = -span; k <= span; k++) {
      if (!((sum + k) % 2)) continue;
      const x = (sum + k - 1) / 2 + 0.5, z = (sum - k - 1) / 2 + 0.5, c = at(x + 0.5, z + 0.5);
      g.beginPath(); g.moveTo(c.x, c.y - 16 * zoom); g.lineTo(c.x + 32 * zoom, c.y); g.lineTo(c.x, c.y + 16 * zoom); g.lineTo(c.x - 32 * zoom, c.y); g.closePath();
      g.fillStyle = '#0d1322'; g.fill(); g.strokeStyle = 'rgba(63, 240, 255, 0.06)'; g.stroke();
    }
    // avenue light line
    const a1 = at(-span, 4.5 + span), a2 = at(4.5 + span, -span);
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255, 176, 46, 0.5)'; g.lineWidth = 2 * zoom; g.shadowColor = '#ffb02e'; g.shadowBlur = 10;
    g.beginPath(); g.moveTo(a1.x, a1.y); g.lineTo(a2.x, a2.y); g.stroke(); g.restore();
    // buildings, back to front
    const all = [...BACK.map(b => ({ ...b, row: 0 })), ...FRONT.map(b => ({ ...b, row: 1 }))]
      .map(b => { const sum = b.row ? 7 : 2, cx = (sum + b.slot * 2.2) / 2, cz = (sum - b.slot * 2.2) / 2; return { ...b, cx, cz }; })
      .sort((a, b) => (a.cx + a.cz) - (b.cx + b.cz) || a.cx - b.cx);
    for (const b of all) {
      const pair = cache.get(key(b)); if (!pair) continue;
      const c = at(b.cx, b.cz);
      composite(g, pair, c.x, c.y, 0.92, zoom / (baker?.scale || 1));
    }
    // fog over the bottom so the menu reads on phones
    const fg = g.createLinearGradient(0, baseY - 40, 0, H);
    fg.addColorStop(0, 'rgba(5, 6, 13, 0)'); fg.addColorStop(0.5, 'rgba(5, 6, 13, 0.55)'); fg.addColorStop(1, 'rgba(5, 6, 13, 0.92)');
    g.fillStyle = fg; g.fillRect(0, baseY - 40, W, H);
  }

  async function bakeAll() {
    if (bakeFailed) return;
    const todo = [...BACK, ...FRONT].filter(b => !cache.has(key(b)));
    if (!todo.length) return;
    try { baker ||= new Baker({ scale: 1 }); } catch (e) { bakeFailed = true; console.info('[arcline] title skyline needs WebGL', e?.message); return; }
    for (const b of todo) {
      if (!running) return;
      await new Promise(r => requestAnimationFrame(r));
      try { cache.set(key(b), baker.bakePair(build(b.id, b.p), { rot: 0 })); } catch (e) { console.info('[arcline] could not bake', b.id, e?.message); cache.set(key(b), null); }
      drawCity();
    }
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (opts.paused?.()) { last = now; return; }   // a sheet covers the title: keep the last picture
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    weather.update(dt, W, baseY, 1);
    // cars: a few lights gliding along the avenue and between towers
    if (cars.length < (light() ? 3 : 7) && Math.random() < dt * 1.5) {
      const dir = Math.random() < 0.5 ? 1 : -1, lane = Math.random();
      cars.push({ x: dir > 0 ? -20 : W + 20, y: baseY - (20 + lane * 220) * zoom, v: dir * rnd(60, 160) * Math.max(0.6, zoom), c: ['#3ff0ff', '#ff4fd8', '#ffb02e', '#ffffff'][Math.floor(Math.random() * 4)] });
    }
    for (const c of cars) c.x += c.v * dt;
    cars = cars.filter(c => c.x > -40 && c.x < W + 40);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sky, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // twinkling stars
    ctx.fillStyle = '#dfe8ff';
    for (const s of stars) { ctx.globalAlpha = 0.35 + 0.45 * Math.sin(now / 1000 * s.s + s.p) ** 2; ctx.fillRect(s.x, s.y, s.r, s.r); }
    ctx.globalAlpha = 1;
    // aurora at half size, redrawn every third frame (it moves slowly)
    if (opts.sky !== false && !light()) {
      if ((aurTick++ % 3) === 0) { const a = aur.getContext('2d'); a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, aur.width, aur.height); a.scale(0.5, 0.5); weather.drawSky(a, W, baseY * 1.1, 1); }
      ctx.save(); ctx.globalAlpha = 0.85; ctx.drawImage(aur, 0, 0, W, baseY); ctx.restore();
    } else if (opts.sky !== false) weather.drawSky(ctx, W, baseY, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(city, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const c of cars) {
      const tail = c.v * 0.18, gr = ctx.createLinearGradient(c.x - tail, 0, c.x, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, c.c);
      ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x - tail, c.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      ctx.fillStyle = c.c; ctx.beginPath(); ctx.arc(c.x, c.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  const onResize = () => { if (running) resize(); };
  return {
    start() { if (running) return; running = true; resize(); addEventListener('resize', onResize); last = 0; raf = requestAnimationFrame(frame); bakeAll(); },
    stop() { running = false; cancelAnimationFrame(raf); removeEventListener('resize', onResize); },
    set(o) { Object.assign(opts, o); weather.set('aurora', opts.sky !== false); weather.set('stars', opts.sky !== false); if (running) resize(); },
    get baked() { return cache.size; },
    get ready() { return [...BACK, ...FRONT].every(b => cache.has(key(b))) || bakeFailed; },
  };
}
function seeded(s) { let h = s * 2654435761 >>> 0; return () => { h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return h / 4294967296; }; }
