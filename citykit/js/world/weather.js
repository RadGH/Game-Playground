// Weather and sky shows — purely visual, never harmful (owner 2026-11-15): rain with splashes, thunderstorms whose
// lightning lights the whole city for an instant (thunder follows a moment later), auroras and shooting stars at
// night, drifting mist. Drawn in screen space over the map; the scene asks for the night amount (0 day … 1 night).

const rnd = (a, b) => a + Math.random() * (b - a);

export const WEATHER_KINDS = [
  { id: 'rain', label: 'Rain' },
  { id: 'storm', label: 'Thunderstorm' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'stars', label: 'Shooting stars' },
  { id: 'mist', label: 'Mist' },
];

export class Weather {
  constructor({ onThunder = null } = {}) {
    this.on = { rain: false, storm: false, aurora: false, stars: false, mist: false };
    this.drops = []; this.splashes = []; this.bolts = []; this.meteors = []; this.blobs = []; this.flash = 0; this.t = 0;
    this.nextBolt = rnd(3, 7); this.nextStar = rnd(1, 4); this.onThunder = onThunder; this.W = 1; this.H = 1;
  }
  set(id, v) { this.on[id] = v; if (id === 'storm' && v) this.on.rain = true; }
  /** Is anything wet falling? (For the scene's darker sky.) */
  get raining() { return this.on.rain || this.on.storm; }

  update(dt, W, H, night) {
    this.t += dt; this.W = W; this.H = H;
    // rain: a steady number of streaks for the screen size, slanted
    const want = this.raining ? Math.round(W * H / (this.on.storm ? 2600 : 4200)) : 0;
    while (this.drops.length < want) this.drops.push({ x: rnd(-60, W), y: rnd(-H, H), v: rnd(700, 1000), l: rnd(10, 22) });
    if (this.drops.length > want) this.drops.length = want;
    for (const d of this.drops) {
      d.x += d.v * 0.22 * dt; d.y += d.v * dt;
      if (d.y > (d.floor ?? H)) {
        if (Math.random() < 0.35) this.splashes.push({ x: d.x, y: d.y, age: 0 });
        d.y = rnd(-80, -10); d.x = rnd(-60, W); d.floor = rnd(H * 0.25, H);
      }
    }
    this.splashes = this.splashes.filter(s => (s.age += dt) < 0.3);
    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.on.storm) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = rnd(4, 11);
        const x = rnd(W * 0.1, W * 0.9), y2 = rnd(H * 0.35, H * 0.8);
        this.bolts.push({ pts: boltPath(x, -10, x + rnd(-80, 80), y2), age: 0, life: 0.35 });
        this.flash = 0.9;
        const delay = rnd(0.4, 1.6);
        if (this.onThunder) setTimeout(() => this.onThunder(x / W * 2 - 1), delay * 1000);
      }
    }
    this.bolts = this.bolts.filter(b => (b.age += dt) < b.life);
    // shooting stars (night)
    if (this.on.stars && night > 0.5) {
      this.nextStar -= dt;
      if (this.nextStar <= 0) { this.nextStar = rnd(1.2, 4.5); const a = rnd(0.25, 0.6); this.meteors.push({ x: rnd(0, W), y: rnd(0, H * 0.3), vx: Math.cos(a) * rnd(500, 800) * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * rnd(300, 500), age: 0, life: rnd(0.5, 0.9) }); }
    }
    this.meteors = this.meteors.filter(m => { m.age += dt; m.x += m.vx * dt; m.y += m.vy * dt; return m.age < m.life; });
    // mist: a few big soft blobs drifting slowly
    const wantBlobs = this.on.mist ? 14 : 0;
    while (this.blobs.length < wantBlobs) this.blobs.push({ x: rnd(-200, W), y: rnd(H * 0.3, H), r: rnd(120, 260), v: rnd(6, 16), a: 0 });
    for (const b of this.blobs) { b.x += b.v * dt; b.a = Math.min(1, b.a + dt * 0.3); if (b.x - b.r > W) { b.x = -b.r; b.y = rnd(H * 0.3, H); } }
    if (!this.on.mist) this.blobs = this.blobs.filter(b => (b.a -= dt * 0.6) > 0);
  }

  /** Behind the map (the sky): auroras and shooting stars live up here. */
  drawSky(ctx, W, H, night) {
    if (this.on.aurora && night > 0.35) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const a = Math.min(1, (night - 0.35) / 0.4);
      for (let band = 0; band < 3; band++) {
        const base = H * (0.12 + band * 0.07), hue = ['#3fffb0', '#5ab0ff', '#c46bff'][band];
        for (let x = 0; x < W; x += 6) {
          const wave = Math.sin(x * 0.006 + this.t * 0.4 + band * 1.7) * 26 + Math.sin(x * 0.017 - this.t * 0.7 + band) * 10;
          const h = 70 + Math.sin(x * 0.01 + this.t * 0.9 + band * 2) * 30;
          const gr = ctx.createLinearGradient(0, base + wave - h, 0, base + wave + 10);
          gr.addColorStop(0, hue + '00'); gr.addColorStop(0.7, hue + '33'); gr.addColorStop(1, hue + '00');
          ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(x * 0.03 + this.t * 2 + band)); ctx.fillStyle = gr; ctx.fillRect(x, base + wave - h, 7, h + 10);
        }
      }
      ctx.restore();
    }
    if (this.meteors.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const m of this.meteors) {
        const k = 1 - m.age / m.life, len = 0.12;
        const gr = ctx.createLinearGradient(m.x - m.vx * len, m.y - m.vy * len, m.x, m.y);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(220,240,255,${k})`);
        ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(m.x - m.vx * len, m.y - m.vy * len); ctx.lineTo(m.x, m.y); ctx.stroke();
      }
      ctx.restore();
    }
  }
  /** Over the map: mist, rain, splashes, lightning bolts and their flash. */
  drawOver(ctx, W, H, night) {
    for (const b of this.blobs) {
      const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      const c = night > 0.5 ? '150,170,210' : '220,228,236';
      gr.addColorStop(0, `rgba(${c},${0.16 * b.a})`); gr.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gr; ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }
    if (this.drops.length) {
      ctx.save(); ctx.strokeStyle = night > 0.5 ? 'rgba(170,200,255,0.35)' : 'rgba(210,225,240,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of this.drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.22, d.y - d.l); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(210,230,255,0.4)';
      for (const s of this.splashes) { const r = 2 + s.age * 18; ctx.globalAlpha = 1 - s.age / 0.3; ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r / 2.5, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    if (this.bolts.length || this.flash > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const b of this.bolts) {
        const k = 1 - b.age / b.life, flick = Math.random() < 0.7 ? 1 : 0.4;
        ctx.globalAlpha = k * flick; ctx.strokeStyle = '#bcd6ff'; ctx.lineWidth = 6; drawPath(ctx, b.pts);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; drawPath(ctx, b.pts);
      }
      ctx.globalAlpha = this.flash * 0.55; ctx.fillStyle = '#d6e4ff'; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}

function boltPath(x1, y1, x2, y2) {
  const pts = [[x1, y1]]; const n = 14;
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([x1 + (x2 - x1) * t + rnd(-28, 28), y1 + (y2 - y1) * t]); }
  pts.push([x2, y2]);
  // a branch
  const j = Math.floor(n * 0.45), [bx, by] = pts[j];
  pts.branch = [[bx, by], [bx + rnd(-90, 90), by + rnd(40, 120)]];
  return pts;
}
function drawPath(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
  if (pts.branch) { ctx.beginPath(); ctx.moveTo(...pts.branch[0]); ctx.lineTo(...pts.branch[1]); ctx.stroke(); }
}
