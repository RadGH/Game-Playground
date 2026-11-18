// How the round 5 enemy roles (sim/roles.js) look on screen — drawn over the sorted scene by view.draw:
//   Bulwark dome      a flattened translucent dome over everything inside it, a lit rim and a few field lines;
//                     it brightens for a moment when a shot inside it is softened
//   shielded units    a faint cyan ring at their feet (e.shielded — the flag reaches co-op browsers too)
//   Medic heal beam   a pulsing green line from the drone's lens to its patient (e.healing = the patient's id)
//   Flamer            while lit (state 'light'): a flickering pilot flame at the nozzle; while spraying ('spray'):
//                     the cone of fire on the ground, the exact reach and width that burn (data/enemies.json)
//   Spore clouds      S.clouds: a drifting green haze with a dashed edge on the ground, fading out at the end
// Pure canvas drawing: positions go through view.P (world → screen) and lerp (smoothed positions).
import { TILE_W } from '../../../../citykit/js/iso.js';

const FIELD = '111,232,255', GAS = '150,255,100';
const rxOf = (view, r) => r * TILE_W * 0.5 * view.zoom * Math.SQRT2;    // a ground circle's screen half-width

/** A hit softened by a dome (events.js calls this): the dome flashes. */
export function domeHit(view, S, ev) {
  let b = S.byId.get(S.byId.get(ev.id)?.shieldBy);
  if (!b) for (const o of S.enemies) if (!o.dead && S.kinds[o.kind]?.job === 'shieldgen' && Math.hypot(o.x - ev.x, o.z - ev.z) < S.kinds[o.kind].dome) { b = o; break; }   // co-op: only the flag travels
  if (b) (view._domeFlash ||= new Map()).set(b.id, S.time);
}

export function drawRoles(ctx, view, S, lerp, t) {
  const K = S.kinds;
  ctx.save();
  // spore clouds first (they sit low), then domes, beams and fire on top
  for (const c of S.clouds || []) drawCloud(ctx, view, c, t);
  for (const e of S.enemies) {
    if (e.dead || e.state === 'warn') continue;
    const k = K[e.kind]; if (!k) continue;
    if (k.job === 'shieldgen') drawDome(ctx, view, S, e, k, lerp(e), t);
  }
  for (const e of S.enemies) {
    if (e.dead || e.state === 'warn') continue;
    const k = K[e.kind]; if (!k) continue;
    const p = lerp(e);
    if (!view.visible(p.x, p.z, 2)) continue;
    if (e.shielded) {
      const g = view.P(p.x, p.z, 0), rx = rxOf(view, e.r + 0.08), a = 0.35 + 0.15 * Math.sin(t * 6 + p.x * 3);
      ctx.strokeStyle = `rgba(${FIELD},${a.toFixed(2)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (k.job === 'heal' && e.healing) drawBeam(ctx, view, S, e, p, lerp, t);
    if (k.job === 'flame' && (e.state === 'light' || e.state === 'spray')) drawFlame(ctx, view, e, k, p, t);
  }
  ctx.restore();
}

function drawDome(ctx, view, S, e, k, p, t) {
  if (!view.visible(p.x, p.z, k.dome + 1)) return;
  const g = view.P(p.x, p.z, 0), top = view.P(p.x, p.z, k.domeH ?? 0.9), rx = rxOf(view, k.dome), ry = rx / 2, h = g.sy - top.sy;
  const flash = Math.max(0, 1 - (S.time - (view._domeFlash?.get(e.id) ?? -9)) / 0.25);
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  ctx.save();
  // the shell: the back of the ground ring, then an arc over the top
  ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, ry, 0, 0, Math.PI); ctx.ellipse(g.sx, g.sy, rx, h + ry * 0.2, 0, Math.PI, Math.PI * 2); ctx.closePath();
  const grad = ctx.createRadialGradient(g.sx, g.sy - h * 0.35, rx * 0.1, g.sx, g.sy - h * 0.2, rx);
  grad.addColorStop(0, `rgba(${FIELD},${(0.03 + 0.08 * flash).toFixed(3)})`); grad.addColorStop(1, `rgba(${FIELD},${(0.14 + 0.05 * pulse + 0.2 * flash).toFixed(3)})`);
  ctx.fillStyle = grad; ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(${FIELD},${(0.45 + 0.2 * pulse + 0.4 * flash).toFixed(2)})`; ctx.lineWidth = 2; ctx.stroke();
  // field lines across the shell
  ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${FIELD},${(0.16 + 0.25 * flash).toFixed(2)})`;
  for (const f of [0.35, 0.65]) { ctx.beginPath(); ctx.ellipse(g.sx, g.sy - h * f, rx * Math.sqrt(1 - f * f), ry * Math.sqrt(1 - f * f), 0, Math.PI, Math.PI * 2); ctx.stroke(); }
  for (const f of [0.3, 0.65]) { ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx * f, h + ry * 0.2, 0, Math.PI, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

function drawBeam(ctx, view, S, e, p, lerp, t) {
  const T = S.byId.get(e.healing); if (!T || T.dead) return;
  const q = lerp(T), a = view.P(p.x, p.z, (e.flying || 0) + 0.12), b = view.P(q.x, q.z, (T.flying || 0) + 0.18);
  const w = 0.6 + 0.4 * Math.sin(t * 14);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(93,255,138,${(0.25 * w).toFixed(2)})`; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,255,215,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  // pulses running down the beam to the patient
  for (let i = 0; i < 3; i++) { const f = (t * 1.6 + i / 3) % 1; ctx.fillStyle = 'rgba(160,255,190,0.9)'; ctx.beginPath(); ctx.arc(a.sx + (b.sx - a.sx) * f, a.sy + (b.sy - a.sy) * f, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = `rgba(93,255,138,${(0.5 * w).toFixed(2)})`; ctx.lineWidth = 2; const g = view.P(q.x, q.z, 0), rx = rxOf(view, (T.r || 0.2) + 0.1);
  ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawFlame(ctx, view, e, k, p, t) {
  const dir = e.aim ?? e.face;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (e.state === 'light') {            // the telegraph: a flickering pilot flame at the nozzle
    const n = view.P(p.x + Math.cos(dir) * 0.12, p.z + Math.sin(dir) * 0.12, 0.06), f = 0.5 + 0.5 * Math.abs(Math.sin(t * 31)) * Math.abs(Math.sin(t * 13));
    const r = (3 + 4 * f) * Math.min(1.5, view.zoom / 2.5);
    const g = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r * 2.2); g.addColorStop(0, 'rgba(180,230,255,0.95)'); g.addColorStop(0.35, 'rgba(255,170,60,0.8)'); g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore(); return;
  }
  // the cone on the ground: exactly the reach and width that burn
  const pts = [[p.x, p.z]], n = 14;
  for (let i = 0; i <= n; i++) { const a = dir - k.arc + (i / n) * k.arc * 2; pts.push([p.x + Math.cos(a) * k.range, p.z + Math.sin(a) * k.range]); }
  const o = view.P(p.x, p.z, 0.02), far = view.P(p.x + Math.cos(dir) * k.range, p.z + Math.sin(dir) * k.range, 0.02);
  const grad = ctx.createLinearGradient(o.sx, o.sy, far.sx, far.sy);
  grad.addColorStop(0, 'rgba(255,220,120,0.55)'); grad.addColorStop(0.6, 'rgba(255,120,30,0.35)'); grad.addColorStop(1, 'rgba(255,60,10,0.05)');
  ctx.beginPath(); pts.forEach(([x, z], i) => { const s = view.P(x, z, 0.02); if (i) ctx.lineTo(s.sx, s.sy); else ctx.moveTo(s.sx, s.sy); }); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // tongues of fire licking along it (a few blobs that ride outward and flicker)
  for (let i = 0; i < 9; i++) {
    const f = ((t * 2.2 + i / 9) % 1), a = dir + Math.sin(i * 2.7 + t * 9) * k.arc * 0.7 * f, d = 0.1 + f * k.range * 0.95;
    const s = view.P(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 0.05 + f * 0.1), r = (3 + f * 11) * Math.min(1.5, view.zoom / 2.5);
    const g = ctx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, r); g.addColorStop(0, `rgba(255,${Math.round(230 - f * 120)},90,${(0.85 - f * 0.6).toFixed(2)})`); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawCloud(ctx, view, c, t) {
  if (!view.visible(c.x, c.z, c.r + 1)) return;
  const fadeIn = Math.min(1, (c.life - c.t) / 0.4), fadeOut = Math.min(1, c.t / 0.8), a = fadeIn * fadeOut;
  const g = view.P(c.x, c.z, 0), rx = rxOf(view, c.r);
  ctx.save();
  // the edge you must stay out of, on the ground
  ctx.setLineDash([7, 6]); ctx.strokeStyle = `rgba(${GAS},${(0.45 * a).toFixed(2)})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(g.sx, g.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // the haze: soft blobs drifting around inside it
  const seed = c.id ? c.id.charCodeAt(c.id.length - 1) : 0;
  for (let i = 0; i < 12; i++) {
    const ang = i * 2.4 + seed + t * (0.25 + (i % 3) * 0.08), rr = c.r * (0.1 + 0.6 * ((i * 37 % 10) / 10));
    const s = view.P(c.x + Math.cos(ang) * rr, c.z + Math.sin(ang) * rr, 0.06 + 0.06 * Math.sin(t * 0.8 + i)), r = rx * (0.3 + 0.1 * Math.sin(t * 0.6 + i * 1.3));
    ctx.save(); ctx.translate(s.sx, s.sy); ctx.scale(1, 0.55);          // a flat, soft puff (the fade reaches its edge)
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, `rgba(${GAS},${(0.16 * a).toFixed(3)})`); gr.addColorStop(0.6, `rgba(${GAS},${(0.08 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${GAS},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}
