// Scope overlay glyphs, drawn on the scope's top (overlay) canvas in screen pixels: the HQ mark, the sensor range
// ring, the light-pen reticle, blueprint lines, grid lines and range ticks. Phosphor colours; never drawn into the
// world picture, so reading back the world canvas measures only the world.

export const PHOSPHOR = { green: '#8cffb0', amber: '#ffc35a', red: '#ff5a46', dim: 'rgba(140,255,176,0.28)', faint: 'rgba(140,255,176,0.12)', blue: '#7fd8ff' };

export function glow(ctx, colour, blur = 6) { ctx.shadowColor = colour; ctx.shadowBlur = blur; }

export function drawGrid(ctx, view, W, H, step) {
  const [x0, y0, x1, y1] = view.rect();
  ctx.save();
  ctx.strokeStyle = PHOSPHOR.faint; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) { const [sx] = view.toScreen(gx, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, H); }
  for (let gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) { const [, sy] = view.toScreen(0, gy); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(W, Math.round(sy) + 0.5); }
  ctx.stroke();
  ctx.restore();
}

export function drawHQ(ctx, sx, sy, sizePx, t) {
  const s = Math.max(10, sizePx);
  ctx.save();
  glow(ctx, PHOSPHOR.amber, 8);
  ctx.strokeStyle = PHOSPHOR.amber; ctx.lineWidth = 2;
  ctx.strokeRect(sx - s / 2, sy - s / 2, s, s);
  ctx.beginPath(); ctx.moveTo(sx - s / 4, sy); ctx.lineTo(sx + s / 4, sy); ctx.moveTo(sx, sy - s / 4); ctx.lineTo(sx, sy + s / 4); ctx.stroke();
  // mast blink
  if (Math.floor(t / 600) % 2 === 0) { ctx.fillStyle = PHOSPHOR.red; ctx.beginPath(); ctx.arc(sx + s / 2, sy - s / 2, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.shadowBlur = 0; ctx.fillStyle = PHOSPHOR.amber; ctx.font = '600 10px ui-monospace, monospace'; ctx.textAlign = 'center';
  ctx.fillText('HQ', sx, sy + s / 2 + 12);
  ctx.restore();
}

export function drawRing(ctx, sx, sy, r, colour = PHOSPHOR.dim, dash = [6, 6]) {
  ctx.save(); ctx.strokeStyle = colour; ctx.lineWidth = 1; ctx.setLineDash(dash);
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

export function drawReticle(ctx, sx, sy, { tool, t, finger = null, armed = false } = {}) {
  ctx.save();
  const c = tool ? PHOSPHOR.amber : PHOSPHOR.green;
  glow(ctx, c, 10);
  ctx.strokeStyle = c; ctx.lineWidth = 1.5;
  if (finger) {                                     // the cord from the finger up to the offset reticle
    ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(finger[0], finger[1]); ctx.lineTo(sx, sy + 9); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  const r = 9 + (armed ? Math.sin(t / 120) * 1.5 : 0);
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx - r - 6, sy); ctx.lineTo(sx - r + 3, sy); ctx.moveTo(sx + r - 3, sy); ctx.lineTo(sx + r + 6, sy);
  ctx.moveTo(sx, sy - r - 6); ctx.lineTo(sx, sy - r + 3); ctx.moveTo(sx, sy + r - 3); ctx.lineTo(sx, sy + r + 6);
  ctx.stroke();
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A blueprint line (screen points). `state`: 'drawing' | 'refused' | 'placed'. */
export function drawBlueprint(ctx, pts, { kind = 'wall', state = 'drawing', alpha = 1 } = {}) {
  if (pts.length < 1) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const c = state === 'refused' ? PHOSPHOR.red : kind === 'road' ? PHOSPHOR.blue : PHOSPHOR.amber;
  glow(ctx, c, 8); ctx.strokeStyle = c; ctx.lineWidth = kind === 'wall' ? 3 : 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.setLineDash(state === 'drawing' ? [8, 5] : []);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
  ctx.setLineDash([]); ctx.fillStyle = c;
  for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function drawMarker(ctx, sx, sy, t, colour = PHOSPHOR.amber) {
  ctx.save(); glow(ctx, colour, 8); ctx.strokeStyle = colour; ctx.lineWidth = 1.5;
  const r = 12 + (t / 40) % 14;
  ctx.globalAlpha = 1 - ((t / 40) % 14) / 14;
  ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

// ---- M3: the economy on the overlay (labels, lamps, sites, rings, survey marks, the BUILD ghost, road price) ----

/** A stencilled label on a dark tab (screen px). */
export function drawLabel(ctx, sx, sy, text, { colour = PHOSPHOR.green, align = 'center', size = 10, bg = 'rgba(4,10,6,0.72)' } = {}) {
  ctx.save();
  ctx.font = `700 ${size}px ui-monospace, monospace`;
  const w = ctx.measureText(text).width + 8, h = size + 5;
  const x = align === 'center' ? sx - w / 2 : align === 'right' ? sx - w : sx;
  ctx.fillStyle = bg; ctx.fillRect(Math.round(x), Math.round(sy - h + 2), Math.round(w), h);
  ctx.fillStyle = colour; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, Math.round(x + 4), Math.round(sy - 1));
  ctx.restore();
  return w;
}

/** Three jam lamps (POWER, INPUT, OUTPUT): lit red when that lamp is on, else a dull green pip. */
export function drawLamps(ctx, sx, sy, lamps, t) {
  const blink = Math.floor(t / 350) % 2 === 0;
  ['power', 'input', 'output'].forEach((k, i) => {
    const on = !!lamps?.[k];
    ctx.save();
    ctx.fillStyle = on ? (blink ? PHOSPHOR.red : '#7a2018') : 'rgba(140,255,176,0.35)';
    if (on) glow(ctx, PHOSPHOR.red, 8);
    ctx.beginPath(); ctx.arc(sx + i * 7, sy, on ? 3 : 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}

/** A footprint rectangle (screen px). state: 'ok' | 'bad' | 'site' | 'sel'. */
export function drawFootprint(ctx, x0, y0, w, h, state = 'ok', frac = null) {
  ctx.save();
  const c = state === 'bad' ? PHOSPHOR.red : state === 'sel' ? PHOSPHOR.blue : PHOSPHOR.amber;
  glow(ctx, c, 6); ctx.strokeStyle = c; ctx.lineWidth = state === 'sel' ? 2 : 1.5;
  ctx.setLineDash(state === 'site' ? [5, 4] : state === 'sel' ? [] : [8, 4]);
  ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(w), Math.round(h));
  if (state === 'ok' || state === 'bad') { ctx.globalAlpha = 0.14; ctx.fillStyle = c; ctx.fillRect(x0, y0, w, h); }
  if (frac !== null) {
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x0, y0 + h + 3, w, 4);
    ctx.fillStyle = PHOSPHOR.amber; ctx.fillRect(x0, y0 + h + 3, w * Math.max(0, Math.min(1, frac)), 4);
  }
  ctx.restore();
}

/** A dashed screen-space polyline (the unlaid part of a road blueprint, a red gap). */
export function drawDashed(ctx, pts, colour = PHOSPHOR.blue, width = 2, dash = [6, 5]) {
  if (pts.length < 2) return;
  ctx.save(); glow(ctx, colour, 6); ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
  ctx.restore();
}

/** An expanding survey pulse ring. */
export function drawPulse(ctx, sx, sy, rPx, k) {
  ctx.save(); glow(ctx, PHOSPHOR.green, 10); ctx.strokeStyle = PHOSPHOR.green; ctx.globalAlpha = Math.max(0, 1 - k); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sx, sy, rPx * Math.min(1, k * 1.1), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
