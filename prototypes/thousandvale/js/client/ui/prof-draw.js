// W9 professions — what each mini-game looks like: one canvas drawer per game (js/client/ui/prof-games.js is the game).
//
//   drawGame(ctx, run, w, h, { now, tint, cursor, flashes })     w, h in CSS pixels (the frame scales the canvas for the screen)
//   hitTest(run, w, h, x, y) -> what a click / tap at (x, y) means: { press, side } | { aim } | null
//
// Rules of the drawing: the thing you must hit is always the BRIGHTEST thing on the canvas; what you control is always
// white with a dark edge; green = good place, red = lost. Nothing here reads the DOM or the clock (the frame passes `now`).

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const GRADE = g => (g >= 1 ? '#ffe17a' : g >= 0.7 ? '#8ff0a0' : g > 0 ? '#e8c06a' : '#e0604a');
const INK = '#f3ead8', DIM = '#c7b99b', FAINT = '#8f8370', GOLD = '#f1d595', GOOD = '#8ff0a0', BAD = '#ff6a55';

function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function pips(ctx, parts, total, cx, y, r = 6, gap = 20) {
  const x0 = cx - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    ctx.beginPath(); ctx.arc(x0 + i * gap, y, r, 0, TAU);
    if (i < parts.length) { ctx.fillStyle = GRADE(parts[i]); ctx.fill(); } else { ctx.strokeStyle = 'rgba(243,234,216,0.4)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
}
/** A burst of short rays (a strike landing). k = 0..1 through its life. */
function burst(ctx, x, y, k, colour, n = 9, r = 26) {
  ctx.save(); ctx.strokeStyle = colour; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + 0.3, r0 = r * (0.35 + 0.65 * k), r1 = r0 + r * 0.35 * (1 - k); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke(); }
  ctx.restore();
}
/** Seconds since the run's last note of one of these kinds (Infinity when none). */
const since = (s, ...kinds) => (s.note && (!kinds.length || kinds.includes(s.note.kind)) ? s.t - s.note.at : Infinity);
const heatColour = h => { const k = clamp(h); const c = k > 0.8 ? [255, 244, 200] : k > 0.6 ? [255, 190, 90] : k > 0.42 ? [240, 110, 50] : k > 0.25 ? [170, 50, 36] : [90, 60, 56]; return `rgb(${c[0]},${c[1]},${c[2]})`; };
function hash(i, k = 1) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }

// ------------------------------------------------------------------------------------------------ mining
function strike(ctx, run, w, h, o) {
  const s = run.state, d = run.spec, ore = o.tint || '#c9824a';
  // the boulder: a lump with ore chunks, cracking a little more with every strike
  const cx = w / 2, cy = h * 0.36, R = Math.min(w * 0.23, h * 0.3), shake = since(s, 'hit', 'perfect', 'miss') < 0.12 ? Math.sin(s.t * 90) * 3 : 0;
  ctx.save(); ctx.translate(cx + shake, cy);
  ctx.beginPath(); for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU, r = R * (0.82 + 0.22 * hash(i, 3)) * (Math.sin(a) > 0.2 ? 0.86 : 1); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.82); } ctx.closePath();
  const g = ctx.createLinearGradient(0, -R, 0, R); g.addColorStop(0, '#8d8a84'); g.addColorStop(1, '#4b4844'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#2a2826'; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 6; i++) {            // ore chunks sticking out
    const a = -2.6 + i * 0.52 + hash(i, 5) * 0.2, r = R * (0.45 + 0.42 * hash(i, 7)), x = Math.cos(a) * r * 1.15, y = Math.sin(a) * r * 0.7 - R * 0.08, sz = R * (0.14 + 0.1 * hash(i, 9));
    ctx.save(); ctx.translate(x, y); ctx.rotate(hash(i, 11) * 2);
    ctx.beginPath(); ctx.moveTo(-sz, sz * 0.5); ctx.lineTo(-sz * 0.4, -sz); ctx.lineTo(sz * 0.7, -sz * 0.6); ctx.lineTo(sz, sz * 0.4); ctx.lineTo(0, sz); ctx.closePath();
    ctx.fillStyle = ore; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-sz * 0.4, -sz); ctx.lineTo(sz * 0.7, -sz * 0.6); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = '#1c1a18'; ctx.lineWidth = 2;                        // cracks
  for (let i = 0; i < s.parts.length; i++) if (s.parts[i] > 0) { ctx.beginPath(); let x = (hash(i, 21) - 0.5) * R, y = -R * 0.5; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (hash(i * 7 + k, 23) - 0.5) * R * 0.5; y += R * 0.3; ctx.lineTo(x, y); } ctx.stroke(); }
  ctx.restore();
  // the bar
  const bx = 22, bw = w - 44, by = h * 0.74, bh = 26;
  rr(ctx, bx, by, bw, bh, 8); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(217,178,106,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  const zx = bx + (s.c0 - s.zone / 2) * bw, zw = s.zone * bw, kx = bx + (s.c0 - s.core / 2) * bw, kw = s.core * bw;
  rr(ctx, zx, by + 2, zw, bh - 4, 6); ctx.fillStyle = 'rgba(143,240,160,0.38)'; ctx.fill();
  ctx.save(); ctx.shadowColor = '#ffe17a'; ctx.shadowBlur = 14; rr(ctx, kx, by + 1, kw, bh - 2, 4); ctx.fillStyle = '#ffe17a'; ctx.fill(); ctx.restore();
  // the pick: a white wedge riding the bar
  const px = bx + s.pos * bw, lock = s.lock > 0;
  ctx.save(); ctx.translate(px, by); ctx.globalAlpha = lock ? 0.45 : 1;
  ctx.beginPath(); ctx.moveTo(0, bh + 8); ctx.lineTo(-9, bh + 22); ctx.lineTo(9, bh + 22); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(-2, -5, 4, bh + 10); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeRect(-2, -5, 4, bh + 10);
  ctx.restore();
  const t = since(s, 'hit', 'perfect', 'miss');
  if (t < 0.4 && s.note.pos != null) { const x = bx + s.note.pos * bw; burst(ctx, x, by + bh / 2, t / 0.4, GRADE(s.note.grade), s.note.grade >= 1 ? 12 : 8, s.note.grade >= 1 ? 34 : 22); if (s.note.grade > 0) burst(ctx, cx, cy, t / 0.4, ore, 7, R * 0.9); }
  pips(ctx, s.parts, d.strikes, cx, h - 14);
}

// ------------------------------------------------------------------------------------------------ logging
function chop(ctx, run, w, h) {
  const s = run.state, d = run.spec, cx = w / 2, tw = Math.min(64, w * 0.17), top = 14, bot = h - 34, look = 1.15;
  // the trunk
  const tg = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); tg.addColorStop(0, '#4a3524'); tg.addColorStop(0.5, '#7a5a3a'); tg.addColorStop(1, '#3a2a1c');
  ctx.fillStyle = tg; ctx.fillRect(cx - tw / 2, top, tw, bot - top);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; for (let i = 0; i < 9; i++) { const x = cx - tw / 2 + 6 + hash(i, 2) * (tw - 12), y = top + hash(i, 4) * (bot - top - 30); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (hash(i, 6) - 0.5) * 4, y + 14 + hash(i, 8) * 16); ctx.stroke(); }
  // the mark the woodsman painted, and the notch that grows on each side with every good chop
  const ny = h * 0.56;
  ctx.fillStyle = '#d9483a'; ctx.fillRect(cx - tw / 2, ny - 38, tw, 6);
  const depth = side => Math.min(tw * 0.46, s.beats.filter(b => b.side === side && b.grade > 0).reduce((a, b) => a + b.grade, 0) * tw * 0.16);
  for (const side of ['L', 'R']) { const k = side === 'L' ? -1 : 1, dp = depth(side); if (dp <= 0) continue; ctx.beginPath(); ctx.moveTo(cx + k * tw / 2, ny - 14); ctx.lineTo(cx + k * (tw / 2 - dp), ny); ctx.lineTo(cx + k * tw / 2, ny + 14); ctx.closePath(); ctx.fillStyle = '#e8cf9a'; ctx.fill(); ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 1.2; ctx.stroke(); }
  // where to strike: a ring on each side of the trunk
  const next = s.beats[s.next];
  for (const side of ['L', 'R']) {
    const k = side === 'L' ? -1 : 1, x = cx + k * (tw / 2 + 24), due = next && next.side === side;
    ctx.beginPath(); ctx.arc(x, ny, 19, 0, TAU); ctx.lineWidth = due ? 3.5 : 2; ctx.strokeStyle = due ? '#ffe17a' : 'rgba(243,234,216,0.3)'; ctx.stroke();
    if (due) { ctx.save(); ctx.globalAlpha = 0.18 + 0.12 * Math.sin(s.t * 12); ctx.fillStyle = '#ffe17a'; ctx.fill(); ctx.restore(); }
  }
  // the beats sliding in from the edges
  for (const b of s.beats) {
    if (b.grade != null) continue;
    const u = 1 - (b.at - s.t) / look; if (u < 0) continue;
    const k = b.side === 'L' ? -1 : 1, x0 = cx + k * (w / 2 - 16), x1 = cx + k * (tw / 2 + 24), x = lerp(x0, x1, Math.min(1.12, u));
    ctx.save(); ctx.translate(x, ny); ctx.scale(-k, 1); ctx.globalAlpha = clamp(u * 4);
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-7, -14); ctx.lineTo(-1, 0); ctx.lineTo(-7, 14); ctx.closePath();            // an axe-head chevron pointing at the trunk
    ctx.fillStyle = b === next ? '#fff' : '#c8ccd6'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  // the swing that just landed
  const t = since(s, 'hit', 'perfect', 'miss');
  if (t < 0.35 && s.note.side) { const k = s.note.side === 'L' ? -1 : 1; burst(ctx, cx + k * (tw / 2 + 6), ny, t / 0.35, GRADE(s.note.grade), s.note.grade >= 1 ? 11 : 7, 26); }
  // which side is which, for the thumbs
  ctx.font = '600 12px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = FAINT;
  ctx.fillText('LEFT', w * 0.14, bot + 4); ctx.fillText('RIGHT', w * 0.86, bot + 4);
  pips(ctx, s.parts, d.chops, cx, h - 12, 5, 16);
}

// ------------------------------------------------------------------------------------------------ foraging
const plantX = (i, n, w) => w * (0.5 + (i - (n - 1) / 2) * Math.min(0.19, 0.86 / n));
const plantY = (i, h) => h * (0.6 + (i % 2 ? 0.07 : -0.03));
function pick(ctx, run, w, h, o) {
  const s = run.state, d = run.spec, n = s.plants.length, G = run.helpers, tint = o.tint || '#c58bff';
  ctx.fillStyle = 'rgba(60,82,44,0.5)'; rr(ctx, 10, h * 0.7, w - 20, h * 0.2, 14); ctx.fill();
  for (const p of s.plants) {
    const x = plantX(p.slot, n, w), y = plantY(p.slot, h), st = G.stateOf(p, s.t, d), stem = 46;
    ctx.save(); ctx.translate(x, y);
    const droop = st === 'wilt' ? 0.5 : st === 'lost' ? 0.9 : 0;
    ctx.strokeStyle = st === 'lost' ? '#6a5a3a' : '#5a9a4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.quadraticCurveTo(droop * 10, 30 - stem * 0.6, droop * 22, 30 - stem + droop * 26); ctx.stroke();
    ctx.fillStyle = st === 'lost' ? '#6a5a3a' : '#4f8a40'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * 11, 16, 11, 5, k * 0.5, 0, TAU); ctx.fill(); }
    const hx = droop * 22, hy = 30 - stem + droop * 26;
    if (st === 'picked') {
      const t = s.t - (s.note?.slot === p.slot ? s.note.at : -9);
      ctx.strokeStyle = GRADE(p.grade); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx - 8, hy + 1); ctx.lineTo(hx - 2, hy + 7); ctx.lineTo(hx + 9, hy - 7); ctx.stroke();
      if (t < 0.4) burst(ctx, hx, hy, t / 0.4, GRADE(p.grade), 8, 24);
    } else if (st === 'lost') {
      ctx.strokeStyle = BAD; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx - 7, hy - 7); ctx.lineTo(hx + 7, hy + 7); ctx.moveTo(hx + 7, hy - 7); ctx.lineTo(hx - 7, hy + 7); ctx.stroke();
    } else {
      const open = st === 'ripe' ? 1 : st === 'wilt' ? 0.7 : st === 'swell' ? 0.15 + 0.2 * clamp((s.t - (p.open - 0.35)) / 0.35) : 0;
      if (st === 'ripe') {                                              // a bright ring that closes as the bud's time runs out
        const left = clamp((p.open + d.ripe * d.fresh - s.t) / (d.ripe * d.fresh));
        ctx.save(); ctx.shadowColor = '#ffe17a'; ctx.shadowBlur = 16; ctx.strokeStyle = '#ffe17a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(hx, hy, 17 + 13 * left, 0, TAU); ctx.stroke(); ctx.restore();
      }
      const petals = 6, pr = 5 + 13 * open;
      ctx.fillStyle = st === 'wilt' ? '#8a7a9a' : open > 0.5 ? tint : '#6aa85a';
      for (let i = 0; i < petals; i++) { const a = (i / petals) * TAU + p.slot; ctx.beginPath(); ctx.ellipse(hx + Math.cos(a) * pr * 0.6 * open, hy + Math.sin(a) * pr * 0.6 * open, Math.max(4, pr * 0.62), Math.max(3, pr * 0.4), a, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(hx, hy, 4 + 3 * open, 0, TAU); ctx.fillStyle = open > 0.5 ? '#fff3b0' : '#3f7a34'; ctx.fill();
    }
    if (o.cursor && s.cursor === p.slot && p.grade == null) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-20, 40); ctx.lineTo(-20, 46); ctx.lineTo(20, 46); ctx.lineTo(20, 40); ctx.stroke(); }
    ctx.restore();
  }
  pips(ctx, s.parts, n, w / 2, h - 12, 5, 16);
}

// ------------------------------------------------------------------------------------------------ skinning
function trace(ctx, run, w, h) {
  const s = run.state, d = run.spec, G = run.helpers, px = 18, x0 = px + 14, x1 = w - px - 14, y0 = 16, y1 = h - 26, Y = v => lerp(y1, y0, v), X = u => lerp(x0, x1, u);
  // the hide
  ctx.beginPath(); for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, rx = (w / 2 - px) * (0.94 + 0.08 * hash(i, 2)), ry = (h / 2 - 12) * (0.92 + 0.1 * hash(i, 4)); ctx[i ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * rx, h / 2 - 4 + Math.sin(a) * ry); } ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#b08a5e'); g.addColorStop(1, '#7a5a3c'); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 2; ctx.stroke();
  const prog = G.x(s, d), N = 60;
  // the line still to cut: a bright dashed line inside a soft band as wide as the knife may wander
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); for (let i = 0; i <= N; i++) { const u = i / N; ctx[i ? 'lineTo' : 'moveTo'](X(u), Y(G.path(s, u))); }
  ctx.strokeStyle = 'rgba(255,241,200,0.2)'; ctx.lineWidth = d.tol * 2 * (y1 - y0); ctx.stroke();
  ctx.setLineDash([7, 6]); ctx.strokeStyle = '#fff1c8'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
  // what is cut already
  if (prog > 0) { ctx.beginPath(); const M = Math.max(2, Math.round(N * prog)); for (let i = 0; i <= M; i++) { const u = (i / M) * prog; ctx[i ? 'lineTo' : 'moveTo'](X(u), Y(G.path(s, u))); } ctx.strokeStyle = '#5a1f1a'; ctx.lineWidth = 4; ctx.stroke(); }
  ctx.restore();
  // the knife
  const kx = X(prog), ky = Y(s.y), ok = s.t < d.lead || s.inLine;
  ctx.save(); ctx.translate(kx, ky); ctx.shadowColor = ok ? GOOD : BAD; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -22); ctx.quadraticCurveTo(2, -30, 8, -20); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-2, -38, 8, 14); ctx.strokeRect(-2, -38, 8, 14);
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fillStyle = ok ? GOOD : BAD; ctx.fill(); ctx.restore();
  // how well it is going
  const sc = s.played > 0 ? s.on / s.played : 1, mw = w - 60;
  rr(ctx, 30, h - 14, mw, 7, 3.5); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
  rr(ctx, 30, h - 14, mw * sc, 7, 3.5); ctx.fillStyle = sc >= 0.7 ? GOOD : sc >= 0.4 ? '#e8c06a' : BAD; ctx.fill();
}

// ------------------------------------------------------------------------------------------------ smithing
function forge(ctx, run, w, h) {
  const s = run.state, d = run.spec, gx = w - 62, gy = 14, gw = 34, gh = h - 46, HY = v => gy + gh * (1 - clamp(v));
  // the gauge: heat falling through the band
  rr(ctx, gx, gy, gw, gh, 8); const hg = ctx.createLinearGradient(0, gy, 0, gy + gh); hg.addColorStop(0, '#5a4630'); hg.addColorStop(1, '#1a1410'); ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = 'rgba(217,178,106,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  const mid = (d.lo + d.hi) / 2, half = (d.hi - d.lo) / 2;
  ctx.fillStyle = 'rgba(143,240,160,0.4)'; ctx.fillRect(gx + 2, HY(d.hi), gw - 4, HY(d.lo) - HY(d.hi));
  ctx.save(); ctx.shadowColor = '#ffe17a'; ctx.shadowBlur = 12; ctx.fillStyle = '#ffe17a'; ctx.fillRect(gx + 2, HY(mid + half * 0.45), gw - 4, HY(mid - half * 0.45) - HY(mid + half * 0.45)); ctx.restore();
  const my = HY(s.heat);
  ctx.beginPath(); ctx.moveTo(gx - 4, my); ctx.lineTo(gx - 18, my - 9); ctx.lineTo(gx - 18, my + 9); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(gx, my - 1.5, gw, 3);
  ctx.font = '600 11px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = FAINT; ctx.fillText('HEAT', gx + gw / 2, h - 18);
  // the anvil and the bar on it (or the bar in the fire)
  const ax = (gx - 30) / 2 + 8, ay = h * 0.66, inFire = s.fire > 0;
  ctx.fillStyle = '#3a3d44'; ctx.beginPath(); ctx.moveTo(ax - 62, ay); ctx.lineTo(ax + 50, ay); ctx.lineTo(ax + 78, ay + 9); ctx.lineTo(ax + 50, ay + 18); ctx.lineTo(ax + 18, ay + 18); ctx.lineTo(ax + 12, ay + 36); ctx.lineTo(ax + 34, ay + 48); ctx.lineTo(ax - 44, ay + 48); ctx.lineTo(ax - 22, ay + 36); ctx.lineTo(ax - 28, ay + 18); ctx.lineTo(ax - 62, ay + 18); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#15171a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(ax - 60, ay + 1, 108, 3);
  if (inFire) {
    const fx = ax - 78, fy = ay - 58;
    for (let i = 0; i < 5; i++) { const fl = 16 + 12 * Math.abs(Math.sin(s.t * 9 + i * 1.7)); ctx.beginPath(); ctx.moveTo(fx + i * 9 - 5, fy + 30); ctx.quadraticCurveTo(fx + i * 9 + 6, fy + 30 - fl * 0.5, fx + i * 9, fy + 30 - fl); ctx.quadraticCurveTo(fx + i * 9 - 8, fy + 30 - fl * 0.4, fx + i * 9 - 5, fy + 30); ctx.fillStyle = i % 2 ? '#ffb04a' : '#ff7a30'; ctx.fill(); }
    ctx.save(); ctx.translate(fx + 8, fy + 26); ctx.rotate(-0.25); ctx.shadowColor = heatColour(s.heat); ctx.shadowBlur = 18; rr(ctx, 0, -5, 92, 10, 3); ctx.fillStyle = heatColour(s.heat); ctx.fill(); ctx.restore();
    ctx.fillStyle = DIM; ctx.font = '600 13px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Back in the fire…', ax, ay - 76);
  } else {
    const flat = Math.min(4, s.hits) * 1.2;
    ctx.save(); ctx.shadowColor = heatColour(s.heat); ctx.shadowBlur = 8 + 22 * clamp(s.heat); rr(ctx, ax - 52, ay - 11 + flat, 100, 11 - flat, 3); ctx.fillStyle = heatColour(s.heat); ctx.fill(); ctx.restore();
    // the hammer: up between blows, down for a blink after one
    const t = since(s, 'hit', 'perfect', 'soft', 'miss'), down = t < 0.1, up = clamp((t - 0.1) / 0.2);
    ctx.save(); ctx.translate(ax + 6, ay - 12); ctx.rotate(down ? 0.05 : -0.5 - 0.5 * up);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-3, -62, 7, 56); ctx.fillStyle = '#c8ccd6'; rr(ctx, -19, -16, 38, 18, 3); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    if (t < 0.35) burst(ctx, ax + 4, ay - 8, t / 0.35, s.note.grade > 0 ? heatColour(Math.max(0.7, s.note.heat || 0.7)) : '#9aa2ac', s.note.grade >= 1 ? 13 : 8, s.note.grade >= 1 ? 40 : 26);
  }
  pips(ctx, s.parts, d.strikes, ax, h - 12);
}

// ------------------------------------------------------------------------------------------------ outfitting
function seamPoint(s, u, w, h) { const [p0, f, p1] = s.bend; return [lerp(30, w - 30, u), h * 0.5 + Math.sin(u * f * 4 + p0) * h * 0.16 + Math.sin(u * 7 + p1) * h * 0.05]; }
function stitch(ctx, run, w, h, o) {
  const s = run.state, d = run.spec, G = run.helpers, pos = G.pos(s, d), cloth = o.tint || '#7a5a8a';
  // two pieces of cloth meeting along the seam
  const N = 50; const pts = Array.from({ length: N + 1 }, (_, i) => seamPoint(s, i / N, w, h));
  ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(w - 12, 12); for (let i = N; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = cloth; ctx.fill();
  ctx.beginPath(); ctx.moveTo(12, h - 26); ctx.lineTo(w - 12, h - 26); for (let i = N; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = '#8a6a4a'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1])); ctx.stroke();
  // the thread laid so far
  ctx.save(); ctx.setLineDash([8, 5]); ctx.strokeStyle = '#f4f0e6'; ctx.lineWidth = 2.5; ctx.beginPath(); const M = Math.max(1, Math.round(N * pos)); for (let i = 0; i <= M; i++) { const p = seamPoint(s, (i / M) * pos, w, h); ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1]); } ctx.stroke(); ctx.restore();
  // the marks
  s.holes.forEach((q, i) => {
    const [x, y] = seamPoint(s, q.s, w, h), nextUp = i === s.next;
    ctx.save(); ctx.translate(x, y);
    if (q.grade == null) {
      if (nextUp) { ctx.shadowColor = '#ffe17a'; ctx.shadowBlur = 16; }
      ctx.strokeStyle = nextUp ? '#ffe17a' : 'rgba(255,241,200,0.7)'; ctx.lineWidth = nextUp ? 4 : 2.5; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke();
    } else { ctx.strokeStyle = GRADE(q.grade); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); if (q.grade > 0) { ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); } else { ctx.arc(0, 0, 5, 0, TAU); } ctx.stroke(); }
    ctx.restore();
  });
  // the needle
  const [nx, ny] = seamPoint(s, pos, w, h), [ax, ay] = seamPoint(s, Math.min(1, pos + 0.02), w, h), ang = Math.atan2(ay - ny, ax - nx);
  ctx.save(); ctx.translate(nx, ny); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-16, -3.5); ctx.lineTo(-16, 3.5); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore(); ctx.beginPath(); ctx.arc(nx, ny, 4, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
  const t = since(s, 'hit', 'perfect', 'miss', 'stray');
  if (t < 0.35) { const i = s.note.i, at = i != null ? seamPoint(s, s.holes[i].s, w, h) : [nx, ny]; burst(ctx, at[0], at[1], t / 0.35, s.note.kind === 'stray' ? BAD : GRADE(s.note.grade), 8, 22); }
  pips(ctx, s.holes.filter(q => q.grade != null).map(q => q.grade), d.holes, w / 2, h - 12, 5, 16);
}

// ------------------------------------------------------------------------------------------------ alchemy
function pour(ctx, run, w, h, o) {
  const s = run.state, d = run.spec, cx = w * 0.46, fw = Math.min(120, w * 0.34), top = 44, bot = h - 34, LY = v => lerp(bot - 4, top + 8, clamp(v));
  const colours = [o.tint || '#58c0a0', '#c070e0', '#e0a040'];
  // the stream from the bottle
  if (s.flow > 0 && !s.done) { ctx.fillStyle = colours[s.i % 3]; const sw = 3 + 5 * s.flow; ctx.fillRect(cx - sw / 2, 10, sw, LY(s.level) - 10); }
  ctx.save(); ctx.translate(cx + 30, 12); ctx.rotate(s.hold ? -2.2 : -1.2); rr(ctx, -9, -30, 18, 30, 4); ctx.fillStyle = '#6a8a9a'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#8a6a4a'; ctx.fillRect(-4, -36, 8, 7); ctx.restore();
  // the flask: glass, the layers poured so far, the one being poured
  ctx.save(); rr(ctx, cx - fw / 2, top, fw, bot - top, 14); ctx.clip();
  ctx.fillStyle = 'rgba(200,220,235,0.1)'; ctx.fillRect(cx - fw / 2, top, fw, bot - top);
  let from = 0; for (let i = 0; i < s.i && i < s.marks.length; i++) { ctx.fillStyle = colours[i % 3]; ctx.globalAlpha = 0.8; ctx.fillRect(cx - fw / 2, LY(s.marks[i]), fw, LY(from) - LY(s.marks[i])); from = s.marks[i]; }
  if (!s.done && s.level > from) { ctx.fillStyle = colours[s.i % 3]; ctx.globalAlpha = 0.9; const wob = s.flow > 0 ? Math.sin(s.t * 22) * 1.5 : 0; ctx.fillRect(cx - fw / 2, LY(s.level) + wob, fw, LY(from) - LY(s.level) - wob); }
  ctx.restore();
  rr(ctx, cx - fw / 2, top, fw, bot - top, 14); ctx.strokeStyle = 'rgba(230,240,250,0.75)'; ctx.lineWidth = 2.5; ctx.stroke();
  // the marks
  s.marks.forEach((m, i) => {
    const y = LY(m), cur = i === s.i && !s.done, was = i < s.i;
    ctx.save();
    if (cur) { ctx.fillStyle = 'rgba(143,240,160,0.3)'; ctx.fillRect(cx - fw / 2 - 12, LY(m + 0.045), fw + 24, LY(m - 0.045) - LY(m + 0.045)); ctx.shadowColor = '#ffe17a'; ctx.shadowBlur = 14; }
    ctx.strokeStyle = cur ? '#ffe17a' : was ? GRADE(s.parts[i] ?? 0) : 'rgba(243,234,216,0.35)'; ctx.lineWidth = cur ? 3.5 : 2;
    ctx.beginPath(); ctx.moveTo(cx - fw / 2 - 14, y); ctx.lineTo(cx + fw / 2 + 14, y); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(cx + fw / 2 + 16, y); ctx.lineTo(cx + fw / 2 + 28, y - 7); ctx.lineTo(cx + fw / 2 + 28, y + 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  // a red line a finger above the mark: over this the pour is spoiled
  const m = s.marks[s.i]; if (m != null && !s.done) { ctx.strokeStyle = 'rgba(255,106,85,0.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - fw / 2 - 8, LY(m + 0.1)); ctx.lineTo(cx + fw / 2 + 8, LY(m + 0.1)); ctx.stroke(); ctx.setLineDash([]); }
  const t = since(s, 'hit', 'perfect', 'miss', 'spill');
  if (t < 0.4 && s.note.i != null) burst(ctx, cx, LY(s.marks[s.note.i]), t / 0.4, s.note.kind === 'spill' ? BAD : GRADE(s.note.grade), 9, 30);
  pips(ctx, s.parts, d.pours, cx, h - 12);
}

// ------------------------------------------------------------------------------------------------ tempering
function gauge(ctx, run, w, h, o) {
  const s = run.state, gx = w * 0.6, gw = 44, gy = 14, gh = h - 44, GY = v => gy + gh * (1 - clamp(v, 0, 1.08) / 1.08);
  rr(ctx, gx, gy, gw, gh, 10); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(217,178,106,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  // past the band: lost
  const topB = s.centre + s.width / 2, botB = s.centre - s.width / 2;
  ctx.save(); rr(ctx, gx, gy, gw, gh, 10); ctx.clip();
  ctx.fillStyle = 'rgba(224,72,58,0.3)'; ctx.fillRect(gx, gy, gw, GY(topB) - gy);
  ctx.strokeStyle = 'rgba(255,106,85,0.5)'; ctx.lineWidth = 2; for (let y = gy - gw; y < GY(topB); y += 9) { ctx.beginPath(); ctx.moveTo(gx, y + gw); ctx.lineTo(gx + gw, y); ctx.stroke(); }
  // the fill
  const fg = ctx.createLinearGradient(0, GY(0), 0, GY(1)); fg.addColorStop(0, '#3a6a9a'); fg.addColorStop(0.7, '#7fd0ff'); fg.addColorStop(1, '#fff');
  ctx.fillStyle = fg; ctx.fillRect(gx, GY(s.level), gw, GY(0) - GY(s.level));
  ctx.restore();
  // the band (narrowing) and its heart
  ctx.save(); ctx.shadowColor = '#8ff0a0'; ctx.shadowBlur = 10; ctx.strokeStyle = '#8ff0a0'; ctx.lineWidth = 3; ctx.strokeRect(gx - 7, GY(topB), gw + 14, GY(botB) - GY(topB)); ctx.restore();
  ctx.fillStyle = 'rgba(143,240,160,0.25)'; ctx.fillRect(gx - 7, GY(topB), gw + 14, GY(botB) - GY(topB));
  ctx.save(); ctx.shadowColor = '#ffe17a'; ctx.shadowBlur = 12; ctx.fillStyle = '#ffe17a'; ctx.fillRect(gx - 12, GY(s.centre) - 2, gw + 24, 4); ctx.restore();
  // the level's own marker
  const ly = GY(s.level); ctx.beginPath(); ctx.moveTo(gx + gw + 5, ly); ctx.lineTo(gx + gw + 20, ly - 9); ctx.lineTo(gx + gw + 20, ly + 9); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  // the piece being worked: a blade that brightens as the gauge climbs
  const bx = w * 0.27, by = h * 0.5, glow = clamp(s.level);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(-0.5); ctx.shadowColor = o.tint || '#7fd0ff'; ctx.shadowBlur = 6 + 26 * glow;
  ctx.beginPath(); ctx.moveTo(0, -h * 0.34); ctx.lineTo(9, -h * 0.26); ctx.lineTo(8, h * 0.12); ctx.lineTo(-8, h * 0.12); ctx.lineTo(-9, -h * 0.26); ctx.closePath();
  ctx.fillStyle = `rgb(${Math.round(170 + 85 * glow)},${Math.round(180 + 70 * glow)},${Math.round(190 + 65 * glow)})`; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = '#8a6a3a'; ctx.fillRect(-18, h * 0.12, 36, 6); ctx.fillStyle = '#5a3a22'; ctx.fillRect(-4, h * 0.12 + 6, 8, h * 0.13); ctx.restore();
  if (s.stopped) { const t = since(s); if (t < 0.5) burst(ctx, gx + gw / 2, ly, t / 0.5, s.over ? BAD : GRADE(s.parts[0] || 0), 11, 36); }
  ctx.font = '600 11px "Alegreya Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = BAD; ctx.fillText('LOST', gx + gw / 2, gy + 13);
}

const DRAW = { strike, chop, pick, trace, forge, stitch, pour, gauge };
export function drawGame(ctx, run, w, h, opts = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.save(); try { DRAW[run.game](ctx, run, w, h, opts); } finally { ctx.restore(); }
}

/** What a pointer at (x, y) on a w × h canvas means for this game: { press, side } and / or { aim }. `down` = it has just gone down. */
export function hitTest(run, w, h, x, y, down = true) {
  switch (run.game) {
    case 'chop': return down ? { press: true, side: x < w / 2 ? 'L' : 'R' } : null;
    case 'pick': {
      if (!down) return null;
      const n = run.state.plants.length; let best = 0, bd = Infinity;
      for (let i = 0; i < n; i++) { const dx = Math.abs(plantX(i, n, w) - x); if (dx < bd) { bd = dx; best = i; } }
      return { press: true, side: best };
    }
    case 'trace': return { aim: clamp(1 - (y - 16) / (h - 42)) };
    case 'pour': return down ? { hold: true } : null;
    default: return down ? { press: true } : null;
  }
}
export const _layout = { plantX, plantY, seamPoint };
