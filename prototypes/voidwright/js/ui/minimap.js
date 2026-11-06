// The round radar in the corner: rocks, ships by side, stations, planets, loot, points of interest.
import { RARITY_BY_ID } from '../data/types.js';

export function drawMinimap(cv, app) {
  const c = cv.getContext('2d'); const W = cv.width, H = cv.height; const P = app.P, w = app.w; if (!P) return;
  const range = 2600 + P.r * 6; const k = (W / 2) / range;
  c.clearRect(0, 0, W, H);
  c.save(); c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 1, 0, 7); c.clip();
  c.fillStyle = 'rgba(4,8,18,0.6)'; c.fillRect(0, 0, W, H);
  const X = x => W / 2 + (x - P.x) * k, Y = y => H / 2 + (y - P.y) * k;
  c.strokeStyle = 'rgba(95,216,255,0.12)'; for (const r of [0.33, 0.66]) { c.beginPath(); c.arc(W / 2, H / 2, W / 2 * r, 0, 7); c.stroke(); }
  for (const p of w.planets) { c.fillStyle = 'rgba(120,140,170,0.35)'; c.beginPath(); c.arc(X(p.x), Y(p.y), Math.max(3, p.r * k), 0, 7); c.fill(); }
  if (w.sun) { c.fillStyle = w.sun.color; c.beginPath(); c.arc(X(w.sun.x), Y(w.sun.y), Math.max(3, w.sun.r * k), 0, 7); c.fill(); }
  for (const s of w.bodies) {
    if (s.dead || s === P) continue;
    const x = X(s.x), y = Y(s.y); if (x < -10 || y < -10 || x > W + 10 || y > H + 10) continue;
    let col = '#7a7068', r = Math.max(1.2, s.r * k);
    if (s.kind === 'ship') col = s.team === 'hostile' || s.angry ? '#ff5a6a' : s.team === 'friendly' ? '#5fa8ff' : '#aaa';
    else if (s.kind === 'station') col = s.team === 'hostile' ? '#ff3b5c' : '#5fd8ff';
    else if (s.kind === 'ground') col = s.team === 'hostile' ? '#ff8a6a' : '#5fff9a';
    else if (s.kind === 'wreck') col = s.derelict ? '#c48cff' : '#555';
    if (s.kind === 'ship' || s.kind === 'ground') r = Math.max(2, r);
    c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    if (s.boss) { c.strokeStyle = '#ff3b5c'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 4, 0, 7); c.stroke(); }
  }
  for (const p of w.pickups) { if (p.kind !== 'item') continue; c.fillStyle = RARITY_BY_ID[p.rarity]?.color || '#fff'; c.fillRect(X(p.x) - 1.5, Y(p.y) - 1.5, 3, 3); }
  for (const p of w.poi || []) { if (p.done) continue; c.strokeStyle = p.kind === 'beacon' ? '#ffc45a' : p.kind === 'claim' ? '#5fff9a' : '#c48cff'; c.lineWidth = 1.5; c.strokeRect(X(p.x) - 3, Y(p.y) - 3, 6, 6); }
  c.restore();
  // you
  c.save(); c.translate(W / 2, H / 2); c.rotate(P.a); c.fillStyle = '#ffd27a'; c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, -4.5); c.lineTo(-5, 4.5); c.fill(); c.restore();
}
