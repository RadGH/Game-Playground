// How the Juggernaut's fight looks on top of its baked model (render/boss-art.js draws the model and its broken parts):
//   • the shield dome over its hull while the generator stands: a pale cyan bubble that flares where it is hit, so a
//     player sees at once that the hull is covered (and that the glow on its back is what to break);
//   • a ground mark for every wind-up before it lands (lessons 39): the cannon lane fills along its length, then
//     flashes as the shell goes; the stomp ring fills outward from its feet; the mine row's landing spots fill;
//   • its mines on the ground: a dark puck with a red light (blinking fast once armed) and a faint ring showing how
//     close is too close; a tripped mine becomes an ordinary red circle (S.strikes, drawn by view.js);
//   • its events' look and sound: metal, sparks and fire instead of the Broodmother's acid.
// boss-art.js calls drawWalkerOver / drawWalkerMarks for enemies with `mines` (only walkers have them); events.js
// hands boss events of a walker to walkerFx first.
import { TILE_W, TILE_H } from '../../../../citykit/js/iso.js';

const DOME = '95,232,255';          // the generator's glow (City Kit ar-juggernaut GEN_GLOW)

/** The dome over the hull while the shield is up. q = its ground point on screen; p = its drawn position. */
export function drawWalkerOver(ctx, view, S, e, p, t) {
  if (e.dead || !e.shield || e.state === 'warn') return;
  const R = (e.bodyR || 0.55) + 0.45, z = view.zoom;
  const g = view.P(p.x, p.z, 0), top = view.P(p.x, p.z, R * 1.15);
  const rx = R * TILE_W * z * 0.72, ry = rx / 2, hy = g.sy - top.sy;
  const hit = Math.max(0, 1 - (S.time - (e.lastHit ?? -9)) / 0.18);
  const a = 0.16 + 0.05 * Math.sin(t * 3) + 0.25 * hit;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // the bubble: the ground ellipse below, a tall half-ellipse above, filled with a rim-bright gradient
  ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI); ctx.ellipse(g.sx, g.sy, rx, hy, 0, Math.PI, Math.PI * 2); ctx.closePath();
  const gr = ctx.createRadialGradient(g.sx, g.sy - hy * 0.45, rx * 0.15, g.sx, g.sy - hy * 0.4, rx * 1.05);
  gr.addColorStop(0, `rgba(${DOME},0)`); gr.addColorStop(0.7, `rgba(${DOME},${a * 0.35})`); gr.addColorStop(1, `rgba(${DOME},${a})`);
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = `rgba(${DOME},${0.35 + 0.4 * hit})`; ctx.lineWidth = 1.5; ctx.stroke();
  // a band of light crawling over it, so it reads as a field, not glass
  const k = (t * 0.6) % 1, by = g.sy - hy * (0.15 + 0.7 * k), bw = rx * Math.sqrt(Math.max(0, 1 - (0.15 + 0.7 * k) ** 2));
  ctx.strokeStyle = `rgba(${DOME},${0.25 * (1 - k)})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(g.sx, by, bw, bw / 2.4, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/** Ground marks under a walker: its wind-up (cannon lane, stomp ring, mine spots) and its mines. */
export function drawWalkerMarks(ctx, view, S, e, t) {
  const K = S.kinds[e.kind], A = e.dead ? null : e.atk;
  if (A?.kind === 'cannon') {
    const fill = Math.min(1, A.t / A.wind);
    lane(ctx, view, A.x0, A.z0, A.dir, A.len, A.w, 'rgba(255,60,40,0.16)', '#ff4030');
    lane(ctx, view, A.x0, A.z0, A.dir, A.len * Math.max(0.04, fill), A.w, 'rgba(255,80,50,0.4)', null);
    if (A.t >= A.wind) { const k = Math.max(0, 1 - (A.t - A.wind) / 0.4); lane(ctx, view, A.x0, A.z0, A.dir, A.len, A.w * 0.6, `rgba(255,230,170,${0.7 * k})`, null); }
  } else if (A?.kind === 'stomp') {
    const fill = Math.min(1, A.t / A.wind);
    ring(ctx, view, A.x0, A.z0, A.r, 'rgba(255,60,40,0.14)', '#ff4030');
    ring(ctx, view, A.x0, A.z0, A.r * Math.max(0.08, fill), 'rgba(255,80,50,0.38)', null);
  } else if (A?.kind === 'mines' && !A.done) {
    const fill = Math.min(1, A.t / A.wind);
    for (const s of A.spots || []) { ring(ctx, view, s.x, s.z, 0.32, 'rgba(255,60,40,0.14)', '#ff4030'); ring(ctx, view, s.x, s.z, 0.32 * Math.max(0.1, fill), 'rgba(255,80,50,0.4)', null); }
  }
  const trig = K?.mines?.trigger ?? 0.35;
  for (const n of e.mines || []) {
    const armed = !(n.arm > 0), blink = armed ? (Math.sin(t * 14 + n.x * 3) > 0) : (Math.sin(t * 5 + n.x * 3) > 0.6);
    if (n.life != null && n.life < 2 && Math.sin(t * 20) > 0) continue;                 // switching off: it flickers out
    ring(ctx, view, n.x, n.z, trig + 0.1, 'rgba(255,60,40,0.06)', armed ? 'rgba(255,64,48,0.55)' : 'rgba(255,64,48,0.25)');
    const c = view.P(n.x, n.z, 0.02), s = Math.max(3, 0.11 * TILE_W * view.zoom * 0.7);
    ctx.save();
    ctx.fillStyle = '#23262c'; ctx.strokeStyle = '#4a4f57'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(c.sx, c.sy, s, s / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (blink) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ff3b30'; ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(c.sx, c.sy - s * 0.25, Math.max(1.5, s * 0.3), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

function poly(ctx, view, pts, fill, stroke) {
  ctx.save(); ctx.beginPath();
  pts.forEach(([x, z], i) => { const p = view.P(x, z, 0.01); if (i) ctx.lineTo(p.sx, p.sy); else ctx.moveTo(p.sx, p.sy); });
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}
function lane(ctx, view, x, z, dir, len, w, fill, stroke) {
  const cx = Math.cos(dir), cz = Math.sin(dir), nx = -cz * w / 2, nz = cx * w / 2;
  poly(ctx, view, [[x + nx, z + nz], [x + cx * len + nx, z + cz * len + nz], [x + cx * len - nx, z + cz * len - nz], [x - nx, z - nz]], fill, stroke);
}
function ring(ctx, view, x, z, r, fill, stroke) {
  const pts = []; for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
  poly(ctx, view, pts, fill, stroke);
}

/** A walker's boss events: its own look and sound. Returns true when handled (events.js then skips the default). */
export function walkerFx(ev, S, fx, view, snd) {
  const e = ev.id != null ? S.byId.get(ev.id) : null, K = S.kinds[ev.kind] || (e && S.kinds[e.kind]);
  if (!K?.walker && ev.type !== 'mineTrip' && ev.type !== 'mineOff') return false;
  switch (ev.type) {
    case 'boss': snd('quake.rumble', ev.x, ev.z, { gain: 0.9, pitch: 0.7 }); fx.shake(0.2); fx.smoke(ev.x, ev.z, 5, { life: [1.2, 2], rise: 0.3, size: [14, 22], spread: 0.9, color: '#6b6457' }); return true;
    case 'bossWind':
      if (ev.kind === 'cannon') snd('hvf.bell', ev.x, ev.z, { gain: 0.55, pitch: 0.5 });
      else if (ev.kind === 'stomp') snd('quake.rumble', ev.x, ev.z, { gain: 0.6, pitch: 1.3 });
      else snd('build.place', ev.x, ev.z, { gain: 0.6, pitch: 0.7 });
      return true;
    case 'bossStrike':
      if (ev.kind === 'cannon') {
        const mx = ev.x + Math.cos(ev.dir) * 1.3, mz = ev.z + Math.sin(ev.dir) * 1.3;
        fx.light(mx, mz, 2.2, 0.15, '#ffe9a8', 1.4); fx.spark(mx, mz, 0.75, 14, { speed: [3, 7], life: [0.1, 0.25], color: '#ffd27a' });
        fx.light(ev.x2, ev.z2, 2.4, 0.4, '#ff8a3a', 1.3); fx.ring(ev.x2, ev.z2, 1.2, 0.3, 'rgba(255,200,140,0.9)', 4); view.scorch(ev.x2, ev.z2, 0.5);
        fx.shake(0.3); snd('explosion.large', ev.x, ev.z, { gain: 0.9, pitch: 0.8 }); snd('thunder', ev.x2, ev.z2, { gain: 0.4, pitch: 0.7 });
      } else if (ev.kind === 'stomp') {
        fx.ring(ev.x, ev.z, ev.r, 0.35, 'rgba(210,190,160,0.9)', 6); fx.shake(0.45);
        fx.chunks(ev.x, ev.z, 14, { speed: [1.5, 3.5], up: [2, 4], hot: 0, colors: ['#5a554c', '#6f685c'], stay: [8, 14] });
        snd('quake.rumble', ev.x, ev.z, { gain: 1, pitch: 0.8 }); snd('fragment.crash.medium', ev.x, ev.z, { gain: 0.6 });
      } else if (ev.kind === 'barrage') snd('spell.fire.launch', ev.x, ev.z, { gain: 0.8, pitch: 0.7 });
      else snd('build.place', ev.x, ev.z, { gain: 0.7, pitch: 0.55 });
      return true;
    case 'bossPart': {
      const gen = ev.part === K.shield?.part;
      fx.light(ev.x, ev.z, 2.4, 0.4, gen ? '#5fe8ff' : '#ff9a3a', 1.3); fx.ring(ev.x, ev.z, 1.6, 0.3, gen ? 'rgba(95,232,255,0.9)' : 'rgba(255,190,120,0.9)', 5);
      fx.spark(ev.x, ev.z, 0.6, 34, { speed: [2, 6], life: [0.3, 0.7], color: gen ? '#9ff4ff' : '#ffc46a', up: [2, 5] });
      fx.chunks(ev.x, ev.z, 18, { speed: [1.5, 4], up: [3, 6], hot: 0.6, colors: ['#4a4f57', '#6c704e', '#33383f'], stay: [20, 40] });
      fx.smoke(ev.x, ev.z, 3, { life: [1.4, 2.2], rise: 0.4, size: [12, 20], spread: 0.4 });
      fx.shake(0.3); view.scorch(ev.x, ev.z, 0.6);
      snd('explosion.large', ev.x, ev.z, { gain: 0.8, pitch: 0.9 }); snd('fragment.crash.medium', ev.x, ev.z, { gain: 0.7 });
      if (gen) snd('thunder', ev.x, ev.z, { gain: 0.6, pitch: 1.4 });
      return true;
    }
    case 'bossPhase': fx.shake(0.3); snd('hvf.bell', ev.x, ev.z, { gain: 0.8, pitch: 0.45 }); snd('hvf.bell', ev.x, ev.z, { gain: 0.6, pitch: 0.4, delay: 0.5 }); return true;
    case 'bossKneel': fx.shake(0.5); fx.chunks(ev.x, ev.z, 12, { speed: [1, 3], up: [2, 4], hot: 0, colors: ['#5a554c', '#6f685c'], stay: [10, 20] }); snd('fragment.crash.medium', ev.x, ev.z, { gain: 0.9, pitch: 0.7 }); snd('quake.rumble', ev.x, ev.z, { gain: 0.8 }); return true;
    case 'bossDown':
      fx.shake(0.7); fx.light(ev.x, ev.z, 4.5, 0.9, '#ff8a3a', 1.5); fx.ring(ev.x, ev.z, 2.6, 0.5);
      fx.smoke(ev.x, ev.z, 8, { life: [2, 3.2], rise: 0.45, size: [18, 30], spread: 0.9 }); view.scorch(ev.x, ev.z, 1.8);
      fx.chunks(ev.x, ev.z, 26, { speed: [2, 5], up: [3, 7], hot: 0.8, colors: ['#4a4f57', '#6c704e', '#33383f'], stay: [30, 60] });
      snd('explosion.large', ev.x, ev.z, { gain: 1, pitch: 0.6 }); snd('explosion.large', ev.x, ev.z, { gain: 0.8, pitch: 0.5, delay: 0.35 });
      return true;
    case 'mineTrip': snd('hvf.bell', ev.x, ev.z, { gain: 0.5, pitch: 1.8 }); return true;
    case 'mineOff': return true;
    default: return false;
  }
}
