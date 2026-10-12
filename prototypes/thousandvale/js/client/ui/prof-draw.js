// W9 professions — what each mini-game looks like: one canvas drawer per game type (js/client/ui/prof-games.js is the
// view-model; the pattern and the scoring are P-core's js/rules/professions-games.js).
//
//   drawGame(ctx, run, w, h, { tint, cursor, numbers })     w, h in CSS pixels (the frame scales the canvas for the screen)
//   hitTest(run, w, h, x, y) -> what a click / tap at (x, y) means: { press: v } | { aim: y } | null
//
// Rules of the drawing: the thing you must hit is always the BRIGHTEST thing on the canvas (gold, glowing); what you
// control is always white with a dark edge; green = a good place, red = lost. Nothing here reads the DOM or a clock —
// every position comes from run.view(), which comes from the same curves the server scores with.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const GRADE = m => (m >= 2 ? '#ffe17a' : m >= 1 ? '#8ff0a0' : '#e0604a');
const FAINT = '#8f8370', DIM = '#c7b99b', GOOD = '#8ff0a0', BAD = '#ff6a55', GOLD = '#ffe17a';
const FONT = '600 12px "Alegreya Sans", "Segoe UI", sans-serif';

function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
/** One dot per step: gold = perfect, green = good, red = missed, hollow = still to come. `decided(i)` says which are over. */
function pips(ctx, marks, decided, cx, y, r = 6, gap = 20) {
  const n = marks.length, x0 = cx - ((n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    ctx.beginPath(); ctx.arc(x0 + i * gap, y, r, 0, TAU);
    if (marks[i] > 0 || decided(i)) { ctx.fillStyle = GRADE(marks[i]); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke(); }
    else { ctx.strokeStyle = 'rgba(243,234,216,0.45)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
}
/** A burst of short rays (a strike landing). k = 0..1 through its life. */
function burst(ctx, x, y, k, colour, n = 9, r = 26) {
  ctx.save(); ctx.strokeStyle = colour; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + 0.3, r0 = r * (0.35 + 0.65 * k), r1 = r0 + r * 0.35 * (1 - k); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke(); }
  ctx.restore();
}
/** Seconds since the run's last note of one of these kinds (Infinity when none, or when the note was made by itself). */
const since = (v, ...kinds) => (v.note && (!kinds.length || kinds.includes(v.note.kind)) ? (v.t - v.note.at) / 1000 : Infinity);
const HITS = ['perfect', 'hit', 'miss', 'spill', 'over'];
const heatColour = h => { const k = clamp(h); const c = k > 0.86 ? [255, 246, 214] : k > 0.7 ? [255, 206, 110] : k > 0.5 ? [255, 150, 60] : k > 0.34 ? [214, 78, 40] : k > 0.18 ? [140, 48, 40] : [84, 62, 60]; return `rgb(${c[0]},${c[1]},${c[2]})`; };
function hash(i, k = 1) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }
function label(ctx, text, x, y, colour = FAINT, align = 'center') { ctx.font = FONT; ctx.textAlign = align; ctx.fillStyle = colour; ctx.fillText(text, x, y); }

// ------------------------------------------------------------------------------------------------ mining
function strike(ctx, run, v, w, h, o) {
  const ore = o.tint || '#b87333';
  // the boulder: a lump with ore chunks, cracking a little more with every good strike
  const cx = w / 2, cy = h * 0.36, R = Math.min(w * 0.22, h * 0.29), tHit = since(v, ...HITS), shake = tHit < 0.12 ? Math.sin(v.t * 0.09) * 3 : 0;
  ctx.save(); ctx.translate(cx + shake, cy);
  ctx.beginPath(); for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU, r = R * (0.82 + 0.22 * hash(i, 3)) * (Math.sin(a) > 0.2 ? 0.86 : 1); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.82); } ctx.closePath();
  const g = ctx.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#93908a'); g.addColorStop(1, '#4b4844'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#2a2826'; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 6; i++) {            // ore chunks sticking out
    const a = -2.6 + i * 0.52 + hash(i, 5) * 0.2, r = R * (0.45 + 0.42 * hash(i, 7)), x = Math.cos(a) * r * 1.15, y = Math.sin(a) * r * 0.7 - R * 0.08, sz = R * (0.14 + 0.1 * hash(i, 9));
    ctx.save(); ctx.translate(x, y); ctx.rotate(hash(i, 11) * 2);
    ctx.beginPath(); ctx.moveTo(-sz, sz * 0.5); ctx.lineTo(-sz * 0.4, -sz); ctx.lineTo(sz * 0.7, -sz * 0.6); ctx.lineTo(sz, sz * 0.4); ctx.lineTo(0, sz); ctx.closePath();
    ctx.fillStyle = ore; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-sz * 0.4, -sz); ctx.lineTo(sz * 0.7, -sz * 0.6); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = '#1c1a18'; ctx.lineWidth = 2;                        // cracks
  for (let i = 0; i < v.made; i++) if (v.marks[i] > 0) { ctx.beginPath(); let x = (hash(i, 21) - 0.5) * R, y = -R * 0.5; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (hash(i * 7 + k, 23) - 0.5) * R * 0.5; y += R * 0.3; ctx.lineTo(x, y); } ctx.stroke(); }
  ctx.restore();
  // the bar
  const bx = 22, bw = w - 44, by = h * 0.72, bh = 28;
  rr(ctx, bx, by, bw, bh, 8); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(217,178,106,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  if (!v.done) {
    const zx = bx + clamp(v.spot - v.half) * bw, zw = (clamp(v.spot + v.half) - clamp(v.spot - v.half)) * bw, kx = bx + (v.spot - v.perfect) * bw, kw = v.perfect * 2 * bw;
    rr(ctx, zx, by + 2, zw, bh - 4, 6); ctx.fillStyle = 'rgba(143,240,160,0.4)'; ctx.fill();
    ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 14; rr(ctx, kx, by + 1, kw, bh - 2, 4); ctx.fillStyle = GOLD; ctx.fill(); ctx.restore();
  }
  // the pick: a white wedge riding the bar
  const px = bx + v.pos * bw;
  ctx.save(); ctx.translate(px, by);
  ctx.beginPath(); ctx.moveTo(0, bh + 7); ctx.lineTo(-10, bh + 22); ctx.lineTo(10, bh + 22); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(-2, -5, 4, bh + 10); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeRect(-2, -5, 4, bh + 10);
  ctx.restore();
  if (tHit < 0.4 && v.note.pos != null) { const x = bx + v.note.pos * bw, m = v.note.mark; burst(ctx, x, by + bh / 2, tHit / 0.4, GRADE(m), m >= 2 ? 12 : 8, m >= 2 ? 34 : 22); if (m > 0) burst(ctx, cx, cy, tHit / 0.4, ore, 7, R * 0.9); }
  pips(ctx, v.marks, i => i < v.made, cx, h - 12);
}

// ------------------------------------------------------------------------------------------------ logging
const LOOK = 1100;          // ms a beat is on screen before it lands
function rhythm(ctx, run, v, w, h, o) {
  const cx = w / 2, tw = Math.min(64, w * 0.17), top = 12, bot = h - 34, ny = h * 0.5;
  // the trunk
  const tg = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); tg.addColorStop(0, '#4a3524'); tg.addColorStop(0.5, '#7a5a3a'); tg.addColorStop(1, '#3a2a1c');
  ctx.fillStyle = tg; ctx.fillRect(cx - tw / 2, top, tw, bot - top);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; for (let i = 0; i < 9; i++) { const x = cx - tw / 2 + 6 + hash(i, 2) * (tw - 12), y = top + hash(i, 4) * (bot - top - 30); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (hash(i, 6) - 0.5) * 4, y + 14 + hash(i, 8) * 16); ctx.stroke(); }
  // the band the woodsman painted, and the notch that grows on each side with every good chop
  ctx.fillStyle = o.tint || '#d9483a'; ctx.fillRect(cx - tw / 2, ny - 40, tw, 7);
  for (const side of [0, 1]) { const k = side ? 1 : -1, dp = Math.min(tw * 0.46, v.beats.filter(b => b.side === side).reduce((a, b) => a + b.mark, 0) * tw * 0.085); if (dp <= 0) continue; ctx.beginPath(); ctx.moveTo(cx + k * tw / 2, ny - 14); ctx.lineTo(cx + k * (tw / 2 - dp), ny); ctx.lineTo(cx + k * tw / 2, ny + 14); ctx.closePath(); ctx.fillStyle = '#e8cf9a'; ctx.fill(); ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 1.2; ctx.stroke(); }
  // where to strike: a ring on each side of the trunk; the side that is due glows
  const next = v.beats.find(b => !b.taken && !b.gone);
  for (const side of [0, 1]) {
    const k = side ? 1 : -1, x = cx + k * (tw / 2 + 26), due = next && next.side === side && next.at - v.t < LOOK;
    ctx.save(); if (due) { ctx.shadowColor = GOLD; ctx.shadowBlur = 14; }
    ctx.beginPath(); ctx.arc(x, ny, 20, 0, TAU); ctx.lineWidth = due ? 4 : 2; ctx.strokeStyle = due ? GOLD : 'rgba(243,234,216,0.3)'; ctx.stroke(); ctx.restore();
  }
  // the beats sliding in from the edges
  for (const b of v.beats) {
    if (b.taken || b.gone) continue;
    const u = 1 - (b.at - v.t) / LOOK; if (u < 0) continue;
    const k = b.side ? 1 : -1, x0 = cx + k * (w / 2 - 14), x1 = cx + k * (tw / 2 + 26), x = lerp(x0, x1, Math.min(1.1, u));
    ctx.save(); ctx.translate(x, ny); ctx.scale(-k, 1); ctx.globalAlpha = clamp(u * 4);
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -15); ctx.lineTo(-1, 0); ctx.lineTo(-8, 15); ctx.closePath();            // an axe-head chevron pointing at the trunk
    ctx.fillStyle = b === next ? '#fff' : '#c8ccd6'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  // the swing that just landed
  const t = since(v, ...HITS);
  if (t < 0.35 && v.note.v != null) { const k = v.note.v ? 1 : -1; burst(ctx, cx + k * (tw / 2 + 8), ny, t / 0.35, GRADE(v.note.mark), v.note.mark >= 2 ? 11 : 7, 28); }
  label(ctx, 'LEFT', w * 0.13, bot + 6); label(ctx, 'RIGHT', w * 0.87, bot + 6);
  pips(ctx, v.marks, i => v.beats[i].taken || v.beats[i].gone, cx, h - 12, 5, 16);
}

// ------------------------------------------------------------------------------------------------ foraging
const plantX = (i, n, w) => w * (0.5 + (i - (n - 1) / 2) * Math.min(0.158, 0.9 / n));
const plantY = (i, h) => h * (0.56 + (i % 2 ? 0.08 : -0.02));
function pick(ctx, run, v, w, h, o) {
  const n = v.places.length, tint = o.tint || '#c58bff';
  ctx.fillStyle = 'rgba(60,82,44,0.5)'; rr(ctx, 8, h * 0.68, w - 16, h * 0.2, 14); ctx.fill();
  for (const p of v.places) {
    const x = plantX(p.i, n, w), y = plantY(p.i, h), st = p.state, stem = 44;
    ctx.save(); ctx.translate(x, y);
    const droop = st === 'gone' ? 0.6 : st === 'bruised' ? 0.9 : 0, dead = st === 'bruised';
    ctx.strokeStyle = dead ? '#6a5a3a' : '#5a9a4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.quadraticCurveTo(droop * 10, 30 - stem * 0.6, droop * 20, 30 - stem + droop * 24); ctx.stroke();
    ctx.fillStyle = dead ? '#6a5a3a' : '#4f8a40'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * 10, 17, 10, 5, k * 0.5, 0, TAU); ctx.fill(); }
    const hx = droop * 20, hy = 30 - stem + droop * 24;
    if (st === 'picked') {
      ctx.strokeStyle = GRADE(p.mark); ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(hx - 9, hy + 1); ctx.lineTo(hx - 2, hy + 8); ctx.lineTo(hx + 10, hy - 8); ctx.stroke();
      const t = v.note && v.note.v === p.i ? since(v, 'perfect', 'hit') : Infinity; if (t < 0.4) burst(ctx, hx, hy, t / 0.4, GRADE(p.mark), 8, 26);
    } else if (st === 'bruised') {
      ctx.strokeStyle = BAD; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx - 7, hy - 7); ctx.lineTo(hx + 7, hy + 7); ctx.moveTo(hx + 7, hy - 7); ctx.lineTo(hx - 7, hy + 7); ctx.stroke();
    } else {
      const open = st === 'ripe' ? 1 : st === 'swell' ? 0.12 + 0.3 * p.swell : 0;
      if (st === 'ripe') {                                              // a bright ring that closes as the bud's time runs out
        ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 16; ctx.strokeStyle = GOLD; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(hx, hy, 15 + 11 * p.left, 0, TAU); ctx.stroke(); ctx.restore();
      }
      const petals = 6, pr = 5 + 12 * open;
      ctx.fillStyle = st === 'gone' ? '#7a7286' : open > 0.5 ? tint : '#6aa85a';
      for (let i = 0; i < petals; i++) { const a = (i / petals) * TAU + p.i; ctx.beginPath(); ctx.ellipse(hx + Math.cos(a) * pr * 0.6 * open, hy + Math.sin(a) * pr * 0.6 * open, Math.max(4, pr * 0.62), Math.max(3, pr * 0.4), a, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(hx, hy, 4 + 3 * open, 0, TAU); ctx.fillStyle = open > 0.5 ? '#fff3b0' : st === 'gone' ? '#5a5466' : '#3f7a34'; ctx.fill();
    }
    if (o.cursor && v.cursor === p.i && !v.done) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-19, 38); ctx.lineTo(-19, 45); ctx.lineTo(19, 45); ctx.lineTo(19, 38); ctx.stroke(); }
    if (o.numbers) label(ctx, String(p.i + 1), 0, 60, v.cursor === p.i && o.cursor ? '#fff' : FAINT);
    ctx.restore();
  }
  pips(ctx, v.marks, i => { const pl = v.places[run.game.ripe[i].i]; return pl.state === 'gone' || pl.state === 'bruised'; }, w / 2, h - 12, 5, 18);
}

// ------------------------------------------------------------------------------------------------ skinning
const TR = (w, h) => ({ x0: 30, x1: w - 30, y0: 16, y1: h - 30 });
function trace(ctx, run, v, w, h) {
  const { x0, x1, y0, y1 } = TR(w, h), Y = q => lerp(y1, y0, q), X = u => lerp(x0, x1, u);
  // the hide
  ctx.beginPath(); for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, rx = (w / 2 - 8) * (0.95 + 0.07 * hash(i, 2)), ry = (h / 2 - 12) * (0.93 + 0.09 * hash(i, 4)); ctx[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * rx, h / 2 - 6 + Math.sin(a) * ry); } ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#b08a5e'); g.addColorStop(1, '#7a5a3c'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 2; ctx.stroke();
  const N = 64;
  // the line to cut: a bright dashed line inside a soft band as wide as the knife may wander
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); for (let i = 0; i <= N; i++) { const u = i / N; ctx[i ? 'lineTo' : 'moveTo'](X(u), Y(v.line(u))); }
  ctx.strokeStyle = 'rgba(255,241,200,0.22)'; ctx.lineWidth = v.band * 2 * (y1 - y0); ctx.stroke();
  ctx.setLineDash([7, 6]); ctx.strokeStyle = '#fff1c8'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
  // what is cut already
  if (v.u > 0) { ctx.beginPath(); const M = Math.max(2, Math.round(N * v.u)); for (let i = 0; i <= M; i++) { const u = (i / M) * v.u; ctx[i ? 'lineTo' : 'moveTo'](X(u), Y(v.line(u))); } ctx.strokeStyle = '#5a1f1a'; ctx.lineWidth = 4; ctx.stroke(); }
  ctx.restore();
  // each scored point of the cut
  for (let k = 0; k < v.samples; k++) { const u = (k + 0.5) / v.steps; ctx.beginPath(); ctx.arc(X(u), Y(v.line(u)), 4.5, 0, TAU); ctx.fillStyle = GRADE(v.marks[k]); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke(); }
  // the knife
  const kx = X(v.u), ky = Y(v.y), ok = Math.abs(v.y - v.line(v.u)) <= v.band;
  ctx.save(); ctx.translate(kx, ky); ctx.shadowColor = ok ? GOOD : BAD; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -22); ctx.quadraticCurveTo(2, -30, 8, -20); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-2, -38, 8, 14); ctx.strokeRect(-2, -38, 8, 14);
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fillStyle = ok ? GOOD : BAD; ctx.fill(); ctx.stroke(); ctx.restore();
  // how well it is going
  const sum = v.marks.reduce((a, b) => a + b, 0), sc = v.samples ? sum / (2 * v.samples) : 1, mw = w - 60;
  rr(ctx, 30, h - 14, mw, 7, 3.5); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
  if (sc > 0.02) { rr(ctx, 30, h - 14, mw * sc, 7, 3.5); ctx.fillStyle = sc >= 0.65 ? GOOD : sc >= 0.4 ? '#e8c06a' : BAD; ctx.fill(); }
}

// ------------------------------------------------------------------------------------------------ smithing
const FORGE = (w, h) => ({ gx: w - 58, gw: 34, fireW: Math.max(78, w * 0.27) });
function forge(ctx, run, v, w, h) {
  const { gx, gw, fireW } = FORGE(w, h), gy = 14, gh = h - 46, HY = q => gy + gh * (1 - clamp(q));
  // the gauge: heat falling through the band
  rr(ctx, gx, gy, gw, gh, 8); const hg = ctx.createLinearGradient(0, gy, 0, gy + gh); hg.addColorStop(0, '#6a5234'); hg.addColorStop(1, '#17120e'); ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = 'rgba(217,178,106,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  const mid = (v.band[0] + v.band[1]) / 2;
  ctx.fillStyle = 'rgba(143,240,160,0.42)'; ctx.fillRect(gx + 2, HY(v.band[1]), gw - 4, HY(v.band[0]) - HY(v.band[1]));
  ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 12; ctx.fillStyle = GOLD; ctx.fillRect(gx + 2, HY(mid + v.sweet), gw - 4, HY(mid - v.sweet) - HY(mid + v.sweet)); ctx.restore();
  const my = HY(v.heat);
  ctx.beginPath(); ctx.moveTo(gx - 4, my); ctx.lineTo(gx - 18, my - 9); ctx.lineTo(gx - 18, my + 9); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(gx, my - 1.5, gw, 3);
  label(ctx, 'HEAT', gx + gw / 2, h - 18);
  // the fire, on the left: tap it (or the second button) to put the bar back in
  const fx = 10, fy = h * 0.3, fh = h * 0.5, cold = v.heat < v.band[0] && !v.inFire;
  ctx.save(); if (cold) { ctx.shadowColor = GOLD; ctx.shadowBlur = 16; }
  rr(ctx, fx, fy, fireW - 14, fh, 10); ctx.fillStyle = '#3a3230'; ctx.fill(); ctx.strokeStyle = cold ? GOLD : '#15120f'; ctx.lineWidth = cold ? 3 : 2; ctx.stroke(); ctx.restore();
  rr(ctx, fx + 8, fy + fh * 0.32, fireW - 30, fh * 0.58, 8); ctx.fillStyle = '#120c08'; ctx.fill();
  const fcx = fx + (fireW - 14) / 2, fby = fy + fh * 0.88;
  for (let i = 0; i < 5; i++) { const fl = (v.inFire ? 26 : 15) + 10 * Math.abs(Math.sin(v.t * 0.009 + i * 1.7)), x = fcx + (i - 2) * ((fireW - 44) / 5); ctx.beginPath(); ctx.moveTo(x - 6, fby); ctx.quadraticCurveTo(x + 6, fby - fl * 0.5, x, fby - fl); ctx.quadraticCurveTo(x - 9, fby - fl * 0.4, x - 6, fby); ctx.fillStyle = i % 2 ? '#ffb04a' : '#ff7a30'; ctx.fill(); }
  label(ctx, v.inFire ? 'HEATING…' : 'FIRE', fcx, fy + fh + 15, cold ? GOLD : FAINT);
  // the anvil and the bar on it (or the bar in the fire)
  const ax = (fireW + gx - 22) / 2, ay = h * 0.62;
  ctx.fillStyle = '#3a3d44'; ctx.beginPath(); ctx.moveTo(ax - 52, ay); ctx.lineTo(ax + 40, ay); ctx.lineTo(ax + 64, ay + 9); ctx.lineTo(ax + 40, ay + 18); ctx.lineTo(ax + 16, ay + 18); ctx.lineTo(ax + 11, ay + 36); ctx.lineTo(ax + 30, ay + 48); ctx.lineTo(ax - 38, ay + 48); ctx.lineTo(ax - 19, ay + 36); ctx.lineTo(ax - 24, ay + 18); ctx.lineTo(ax - 52, ay + 18); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#15171a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(ax - 50, ay + 1, 88, 3);
  if (v.inFire) {
    ctx.save(); ctx.translate(fcx - 6, fby - 12); ctx.rotate(-0.2); ctx.shadowColor = heatColour(1 - v.fireLeft * 0.5); ctx.shadowBlur = 18; rr(ctx, 0, -5, 70, 10, 3); ctx.fillStyle = heatColour(1 - v.fireLeft * 0.5); ctx.fill(); ctx.restore();
  } else {
    const flat = Math.min(4, v.blows) * 1.2;
    ctx.save(); ctx.shadowColor = heatColour(v.heat); ctx.shadowBlur = 6 + 24 * clamp(v.heat); rr(ctx, ax - 44, ay - 11 + flat, 84, 11 - flat, 3); ctx.fillStyle = heatColour(v.heat); ctx.fill(); ctx.restore();
    // the hammer: up between blows, down for a blink after one
    const t = since(v, 'perfect', 'hit', 'miss'), down = t < 0.1, up = clamp((t - 0.1) / 0.2);
    ctx.save(); ctx.translate(ax + 6, ay - 12); ctx.rotate(down ? 0.05 : -0.5 - 0.5 * up);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-3, -58, 7, 52); ctx.fillStyle = '#c8ccd6'; rr(ctx, -19, -16, 38, 18, 3); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    if (t < 0.35) burst(ctx, ax + 4, ay - 8, t / 0.35, v.note.mark > 0 ? GRADE(v.note.mark) : '#9aa2ac', v.note.mark >= 2 ? 13 : 8, v.note.mark >= 2 ? 40 : 26);
    if (cold && !v.done) label(ctx, 'Too cold — back in the fire', ax, ay - 70, DIM);
    else if (v.heat > v.band[1] && !v.done) label(ctx, 'Too hot — wait', ax, ay - 70, DIM);
  }
  pips(ctx, v.marks, i => i < v.blows, ax, h - 12);
}

// ------------------------------------------------------------------------------------------------ outfitting
function seamPoint(seed, u, w, h) { const p0 = hash(seed, 3) * 6.28, f = 0.6 + hash(seed, 5) * 0.6, p1 = hash(seed, 7) * 6.28; return [lerp(30, w - 30, u), h * 0.47 + Math.sin(u * f * 4 + p0) * h * 0.15 + Math.sin(u * 7 + p1) * h * 0.05]; }
function stitch(ctx, run, v, w, h, o) {
  const seed = run.game.seed % 9973, pos = clamp(v.t / v.total), cloth = o.tint || '#7a5a8a', SP = u => seamPoint(seed, u, w, h);
  // two pieces of cloth meeting along the seam
  const N = 50, pts = Array.from({ length: N + 1 }, (_, i) => SP(i / N));
  ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(w - 10, 10); for (let i = N; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = cloth; ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, h - 28); ctx.lineTo(w - 10, h - 28); for (let i = N; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = '#8a6a4a'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1])); ctx.stroke();
  // the thread laid so far
  ctx.save(); ctx.setLineDash([8, 5]); ctx.strokeStyle = '#f4f0e6'; ctx.lineWidth = 2.5; ctx.beginPath(); const M = Math.max(1, Math.round(N * pos)); for (let i = 0; i <= M; i++) { const p = SP((i / M) * pos); ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1]); } ctx.stroke(); ctx.restore();
  // the marks
  const next = v.beats.find(b => !b.taken && !b.gone);
  for (const b of v.beats) {
    const [x, y] = SP(b.at / v.total);
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round';
    if (!b.taken && !b.gone) {
      if (b === next) { ctx.shadowColor = GOLD; ctx.shadowBlur = 16; }
      ctx.strokeStyle = b === next ? GOLD : 'rgba(255,241,200,0.75)'; ctx.lineWidth = b === next ? 4.5 : 3; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke();
    } else { ctx.strokeStyle = GRADE(b.mark); ctx.lineWidth = 4.5; ctx.beginPath(); if (b.mark > 0) { ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); } else ctx.arc(0, 0, 5, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  // the needle
  const [nx, ny] = SP(pos), [ax, ay] = SP(Math.min(1, pos + 0.02)), ang = Math.atan2(ay - ny, ax - nx);
  ctx.save(); ctx.translate(nx, ny); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-16, -4); ctx.lineTo(-16, 4); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore(); ctx.beginPath(); ctx.arc(nx, ny, 4.5, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
  const t = since(v, ...HITS);
  if (t < 0.35) { const at = v.note.i != null ? SP(v.beats[v.note.i].at / v.total) : [nx, ny]; burst(ctx, at[0], at[1], t / 0.35, v.note.i != null ? GRADE(v.note.mark) : BAD, 8, 24); }
  pips(ctx, v.marks, i => v.beats[i].taken || v.beats[i].gone, w / 2, h - 12, 5, 16);
}

// ------------------------------------------------------------------------------------------------ alchemy, cooking
function pour(ctx, run, v, w, h, o) {
  const n = v.stages.length, fw = Math.min(96, (w - 60) / n - 26), top = 40, bot = h - 34, LY = q => lerp(bot - 4, top + 6, clamp(q));
  const colours = [o.tint || '#58c0a0', '#c070e0', '#e0a040'];
  v.stages.forEach((sg, k) => {
    const cx = w * (0.5 + (k - (n - 1) / 2) * (n > 1 ? 0.42 : 0)), cur = k === v.stage && !v.done, done = sg.level != null, lvl = done ? sg.level : cur ? v.level : 0, col = colours[k % 3];
    ctx.save(); ctx.globalAlpha = cur || done ? 1 : 0.45;
    // the stream from the bottle
    if (cur && !v.waiting && lvl < 1.02) { ctx.fillStyle = col; const sw = 4 + 5 * clamp(lvl * 1.4); ctx.fillRect(cx - sw / 2, 10, sw, LY(lvl) - 10); }
    if (cur) { ctx.save(); ctx.translate(cx + 26, 14); ctx.rotate(v.waiting ? -1.1 : -2.2); rr(ctx, -9, -28, 18, 28, 4); ctx.fillStyle = '#6a8a9a'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#8a6a4a'; ctx.fillRect(-4, -34, 8, 7); ctx.restore(); }
    // the flask: glass and what is in it
    ctx.save(); rr(ctx, cx - fw / 2, top, fw, bot - top, 14); ctx.clip();
    ctx.fillStyle = 'rgba(200,220,235,0.1)'; ctx.fillRect(cx - fw / 2, top, fw, bot - top);
    if (lvl > 0) { const wob = cur && !v.waiting ? Math.sin(v.t * 0.022) * 1.5 : 0; ctx.fillStyle = col; ctx.globalAlpha *= 0.88; ctx.fillRect(cx - fw / 2, LY(lvl) + wob, fw, bot - LY(lvl)); }
    ctx.restore();
    rr(ctx, cx - fw / 2, top, fw, bot - top, 14); ctx.strokeStyle = sg.level > 1 ? BAD : 'rgba(230,240,250,0.8)'; ctx.lineWidth = 2.5; ctx.stroke();
    // the mark: a gold line with the "good" band around it
    const y = LY(sg.mark);
    if (cur) { ctx.fillStyle = 'rgba(143,240,160,0.32)'; ctx.fillRect(cx - fw / 2 - 10, LY(sg.mark + sg.good), fw + 20, LY(sg.mark - sg.good) - LY(sg.mark + sg.good)); ctx.shadowColor = GOLD; ctx.shadowBlur = 14; }
    ctx.strokeStyle = cur ? GOLD : done ? GRADE(sg.score) : 'rgba(243,234,216,0.5)'; ctx.lineWidth = cur ? 3.5 : 2.5;
    ctx.beginPath(); ctx.moveTo(cx - fw / 2 - 12, y); ctx.lineTo(cx + fw / 2 + 12, y); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(cx + fw / 2 + 13, y); ctx.lineTo(cx + fw / 2 + 24, y - 7); ctx.lineTo(cx + fw / 2 + 24, y + 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (done) { const t = v.note && v.note.i === k ? since(v, ...HITS) : Infinity; if (t < 0.4) burst(ctx, cx, LY(Math.min(1, sg.level)), t / 0.4, sg.level > 1 ? BAD : GRADE(sg.score), 9, 30); if (sg.level > 1) label(ctx, 'SPILLED', cx, top - 6, BAD); }
  });
  pips(ctx, v.marks, i => v.stages[i].level != null, w / 2, h - 12);
}

// ------------------------------------------------------------------------------------------------ tempering
function gauge(ctx, run, v, w, h, o) {
  const gx = w * 0.6, gw = 46, gy = 14, gh = h - 44, TOP = 1.12, GY = q => gy + gh * (1 - clamp(q, 0, TOP) / TOP);
  rr(ctx, gx, gy, gw, gh, 10); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(217,178,106,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  const topB = v.centre + v.half, botB = v.centre - v.half;
  ctx.save(); rr(ctx, gx, gy, gw, gh, 10); ctx.clip();
  // past the band: lost
  ctx.fillStyle = 'rgba(224,72,58,0.3)'; ctx.fillRect(gx, gy, gw, GY(topB) - gy);
  ctx.strokeStyle = 'rgba(255,106,85,0.5)'; ctx.lineWidth = 2; for (let y = gy - gw; y < GY(topB); y += 9) { ctx.beginPath(); ctx.moveTo(gx, y + gw); ctx.lineTo(gx + gw, y); ctx.stroke(); }
  // the fill
  const fg = ctx.createLinearGradient(0, GY(0), 0, GY(1)); fg.addColorStop(0, '#3a6a9a'); fg.addColorStop(0.7, '#7fd0ff'); fg.addColorStop(1, '#fff');
  ctx.fillStyle = fg; ctx.fillRect(gx, GY(v.level), gw, GY(0) - GY(v.level));
  ctx.restore();
  // the band (narrowing) and its heart
  ctx.save(); ctx.shadowColor = GOOD; ctx.shadowBlur = 10; ctx.strokeStyle = GOOD; ctx.lineWidth = 3; ctx.strokeRect(gx - 7, GY(topB), gw + 14, GY(botB) - GY(topB)); ctx.restore();
  ctx.fillStyle = 'rgba(143,240,160,0.25)'; ctx.fillRect(gx - 7, GY(topB), gw + 14, GY(botB) - GY(topB));
  const ph = v.half * v.perfect;
  ctx.save(); ctx.shadowColor = GOLD; ctx.shadowBlur = 12; ctx.fillStyle = GOLD; ctx.fillRect(gx - 12, GY(v.centre + ph), gw + 24, Math.max(4, GY(v.centre - ph) - GY(v.centre + ph))); ctx.restore();
  // the level's own marker
  const ly = GY(v.level); ctx.beginPath(); ctx.moveTo(gx + gw + 5, ly); ctx.lineTo(gx + gw + 21, ly - 10); ctx.lineTo(gx + gw + 21, ly + 10); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(gx, ly - 1.5, gw, 3);
  // the piece being worked: a blade that brightens as the gauge climbs
  const bx = w * 0.27, by = h * 0.5, glow = clamp(v.level);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.5); ctx.shadowColor = o.tint || '#7fd0ff'; ctx.shadowBlur = 6 + 26 * glow;
  ctx.beginPath(); ctx.moveTo(0, -h * 0.34); ctx.lineTo(9, -h * 0.26); ctx.lineTo(8, h * 0.12); ctx.lineTo(-8, h * 0.12); ctx.lineTo(-9, -h * 0.26); ctx.closePath();
  ctx.fillStyle = `rgb(${Math.round(170 + 85 * glow)},${Math.round(180 + 70 * glow)},${Math.round(190 + 65 * glow)})`; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#8a6a3a'; ctx.fillRect(-18, h * 0.12, 36, 6); ctx.fillStyle = '#5a3a22'; ctx.fillRect(-4, h * 0.12 + 6, 8, h * 0.13); ctx.restore();
  if (v.stopped || v.over) { const t = since(v); if (t < 0.5) burst(ctx, gx + gw / 2, ly, t / 0.5, v.marks[0] ? GRADE(v.marks[0]) : BAD, 11, 36); }
  label(ctx, 'LOST', gx + gw / 2, gy + 13, BAD);
}

const DRAW = { strike, rhythm, pick, trace, forge, stitch, pour, gauge };
export function drawGame(ctx, run, w, h, opts = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.save(); try { DRAW[run.type](ctx, run, run.view(), w, h, opts); } finally { ctx.restore(); }
}

/** What a pointer at (x, y) on a w × h canvas means for this game: { press: v } (v undefined = the work button) or { aim }. */
export function hitTest(run, w, h, x, y) {
  switch (run.type) {
    case 'rhythm': return { press: x < w / 2 ? 0 : 1 };
    case 'pick': { const n = run.game.spots; let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const dx = Math.abs(plantX(i, n, w) - x); if (dx < bd) { bd = dx; best = i; } } return { press: best }; }
    case 'trace': { const { y0, y1 } = TR(w, h); return { aim: clamp((y1 - y) / (y1 - y0)) }; }
    case 'forge': return { press: x < FORGE(w, h).fireW ? 1 : 0 };
    default: return { press: undefined };
  }
}
/** Where things are, for the spec's synthetic finger: the centre of place i (pick), the two halves (rhythm), the fire and the anvil (forge), a height (trace). */
export function pointFor(run, w, h, what, v) {
  switch (run.type) {
    case 'rhythm': return [w * (v ? 0.8 : 0.2), h * 0.5];
    case 'pick': return [plantX(v, run.game.spots, w), plantY(v, h)];
    case 'trace': { const { x0, x1, y0, y1 } = TR(w, h); return [lerp(x0, x1, clamp(run.t / run.game.ms)), lerp(y1, y0, v)]; }
    case 'forge': return v === 1 ? [FORGE(w, h).fireW / 2, h * 0.5] : [w * 0.55, h * 0.6];
    default: return [w / 2, h / 2];
  }
}
