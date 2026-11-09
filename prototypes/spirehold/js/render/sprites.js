// Spirehold — every picture is drawn here once, at load, into small canvases. No image files.
// Foes face +x (east) in their sprite; the renderer turns them toward the city.

const cache = new Map();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export { shade };

/** Draw one foe body into ctx centred on 0,0, facing +x, about `s` units in radius. frame 0/1 = step. */
function body(ctx, look, color, s, frame) {
  const dark = shade(color, -0.45), lite = shade(color, 0.3);
  const leg = frame ? 1 : -1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const blob = (x, y, rx, ry, fill, stroke = dark) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = Math.max(1, s * 0.12); ctx.strokeStyle = stroke; ctx.stroke(); };
  const line = (x1, y1, x2, y2, w, col) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); };
  switch (look) {
    case 'imp': {
      line(-s * 0.2, -s * 0.35, -s * 0.2 + leg * s * 0.4, -s * 0.8, s * 0.25, dark); line(-s * 0.2, s * 0.35, -s * 0.2 - leg * s * 0.4, s * 0.8, s * 0.25, dark);
      blob(0, 0, s * 0.55, s * 0.5, color);
      blob(s * 0.45, 0, s * 0.42, s * 0.4, lite);
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(s * 0.4, -s * 0.3); ctx.lineTo(s * 0.1, -s * 0.85); ctx.lineTo(s * 0.6, -s * 0.35); ctx.fill(); ctx.beginPath(); ctx.moveTo(s * 0.4, s * 0.3); ctx.lineTo(s * 0.1, s * 0.85); ctx.lineTo(s * 0.6, s * 0.35); ctx.fill();
      ctx.fillStyle = '#ffd040'; ctx.fillRect(s * 0.62, -s * 0.18, s * 0.12, s * 0.1); ctx.fillRect(s * 0.62, s * 0.08, s * 0.12, s * 0.1);
      line(s * 0.3, s * 0.4, s * 0.9, s * 0.6, s * 0.12, '#888');
      break;
    }
    case 'bug': {
      for (let i = -1; i <= 1; i++) { line(i * s * 0.3, 0, i * s * 0.3 + leg * s * 0.2 * i, -s * 0.9, s * 0.1, dark); line(i * s * 0.3, 0, i * s * 0.3 - leg * s * 0.2 * i, s * 0.9, s * 0.1, dark); }
      blob(-s * 0.15, 0, s * 0.6, s * 0.45, color); blob(s * 0.5, 0, s * 0.3, s * 0.3, dark, '#222');
      ctx.globalAlpha = 0.5; blob(-s * 0.2, -s * 0.35, s * 0.5, s * 0.2, '#e0f0ff', 'transparent'); blob(-s * 0.2, s * 0.35, s * 0.5, s * 0.2, '#e0f0ff', 'transparent'); ctx.globalAlpha = 1;
      break;
    }
    case 'wolf': {
      line(-s * 0.5, -s * 0.3, -s * 0.5 + leg * s * 0.35, -s * 0.65, s * 0.2, dark); line(-s * 0.5, s * 0.3, -s * 0.5 - leg * s * 0.35, s * 0.65, s * 0.2, dark);
      line(s * 0.4, -s * 0.3, s * 0.4 - leg * s * 0.35, -s * 0.65, s * 0.2, dark); line(s * 0.4, s * 0.3, s * 0.4 + leg * s * 0.35, s * 0.65, s * 0.2, dark);
      line(-s * 0.8, 0, -s * 1.25, leg * s * 0.25, s * 0.22, color);
      blob(0, 0, s * 0.85, s * 0.42, color); blob(s * 0.85, 0, s * 0.38, s * 0.3, lite);
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(s * 0.75, -s * 0.2); ctx.lineTo(s * 0.65, -s * 0.5); ctx.lineTo(s * 0.9, -s * 0.25); ctx.fill(); ctx.beginPath(); ctx.moveTo(s * 0.75, s * 0.2); ctx.lineTo(s * 0.65, s * 0.5); ctx.lineTo(s * 0.9, s * 0.25); ctx.fill();
      ctx.fillStyle = '#ff4030'; ctx.fillRect(s * 0.95, -s * 0.14, s * 0.1, s * 0.08); ctx.fillRect(s * 0.95, s * 0.06, s * 0.1, s * 0.08);
      break;
    }
    case 'brute': case 'troll': {
      const big = look === 'troll' ? 1.1 : 1;
      line(-s * 0.1, -s * 0.4, -s * 0.1 + leg * s * 0.35, -s * 0.75, s * 0.3, dark); line(-s * 0.1, s * 0.4, -s * 0.1 - leg * s * 0.35, s * 0.75, s * 0.3, dark);
      blob(-s * 0.05, 0, s * 0.6 * big, s * 0.78 * big, color);
      blob(s * 0.15, -s * 0.65, s * 0.28, s * 0.25, color); blob(s * 0.15, s * 0.65, s * 0.28, s * 0.25, color);
      blob(s * 0.4, 0, s * 0.36, s * 0.34, lite);
      if (look === 'troll') { ctx.fillStyle = '#2a5a3a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-s * 0.3 + i * 0.12 * s, (i % 2 ? 1 : -1) * s * 0.3, s * 0.12, 0, 7); ctx.fill(); } }
      else { line(s * 0.3, s * 0.7, s * 1.1, s * 0.9, s * 0.18, '#6a4a2a'); blob(s * 1.15, s * 0.92, s * 0.22, s * 0.22, '#888', '#444'); }
      ctx.fillStyle = '#fff6c0'; ctx.fillRect(s * 0.62, -s * 0.12, s * 0.1, s * 0.06); ctx.fillRect(s * 0.62, s * 0.06, s * 0.1, s * 0.06);
      break;
    }
    case 'skeleton': {
      line(-s * 0.1, -s * 0.3, -s * 0.1 + leg * s * 0.35, -s * 0.7, s * 0.14, '#cfc9b0'); line(-s * 0.1, s * 0.3, -s * 0.1 - leg * s * 0.35, s * 0.7, s * 0.14, '#cfc9b0');
      blob(-s * 0.05, 0, s * 0.35, s * 0.5, '#d8d2bb', '#6a6450');
      for (let i = -2; i <= 2; i++) line(-s * 0.3, i * s * 0.14, s * 0.2, i * s * 0.14, s * 0.06, '#6a6450');
      blob(s * 0.4, 0, s * 0.32, s * 0.3, '#ece6d0', '#6a6450');
      ctx.fillStyle = '#202020'; ctx.fillRect(s * 0.5, -s * 0.16, s * 0.12, s * 0.1); ctx.fillRect(s * 0.5, s * 0.06, s * 0.12, s * 0.1);
      line(s * 0.2, -s * 0.45, s * 1.0, -s * 0.6, s * 0.1, '#9a9a9a');
      break;
    }
    case 'shield': {
      line(-s * 0.2, -s * 0.35, -s * 0.2 + leg * s * 0.3, -s * 0.7, s * 0.25, dark); line(-s * 0.2, s * 0.35, -s * 0.2 - leg * s * 0.3, s * 0.7, s * 0.25, dark);
      blob(-s * 0.1, 0, s * 0.5, s * 0.6, color); blob(s * 0.2, 0, s * 0.3, s * 0.28, lite);
      ctx.fillStyle = '#5a6a7a'; ctx.strokeStyle = '#2a3440'; ctx.lineWidth = s * 0.12; ctx.beginPath(); ctx.rect(s * 0.55, -s * 0.8, s * 0.25, s * 1.6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c0a040'; ctx.beginPath(); ctx.arc(s * 0.68, 0, s * 0.12, 0, 7); ctx.fill();
      break;
    }
    case 'shaman': {
      blob(-s * 0.1, 0, s * 0.55, s * 0.62, color);
      blob(s * 0.25, 0, s * 0.3, s * 0.3, shade(color, -0.2));
      ctx.fillStyle = shade(color, -0.6); ctx.beginPath(); ctx.moveTo(s * 0.45, -s * 0.2); ctx.lineTo(s * 0.05, -s * 0.5); ctx.lineTo(-s * 0.1, s * 0.0); ctx.lineTo(s * 0.05, s * 0.5); ctx.lineTo(s * 0.45, s * 0.2); ctx.fill();
      line(-s * 0.2, s * 0.55, s * 0.9, s * 0.7, s * 0.12, '#6a4a2a');
      ctx.fillStyle = '#80ffb0'; ctx.shadowColor = '#80ffb0'; ctx.shadowBlur = s * 0.6; ctx.beginPath(); ctx.arc(s * 0.95, s * 0.7, s * 0.18, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe060'; ctx.fillRect(s * 0.42, -s * 0.12, s * 0.08, s * 0.06); ctx.fillRect(s * 0.42, s * 0.06, s * 0.08, s * 0.06);
      break;
    }
    case 'ram': {
      ctx.fillStyle = '#3a2a1a'; for (const [x, y] of [[-0.6, -0.75], [0.4, -0.75], [-0.6, 0.75], [0.4, 0.75]]) { ctx.beginPath(); ctx.ellipse(x * s, y * s, s * 0.25, s * 0.12, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#7a5434'; ctx.strokeStyle = '#3a2414'; ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.rect(-s * 0.9, -s * 0.62, s * 1.6, s * 1.24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.moveTo(-s * 0.9, -s * 0.62); ctx.lineTo(s * 0.7, -s * 0.62); ctx.lineTo(s * 0.5, 0); ctx.lineTo(-s * 0.7, 0); ctx.fill();
      line(-s * 0.6, 0, s * 1.15, 0, s * 0.32, '#8a6a4a');
      blob(s * 1.15, 0, s * 0.3, s * 0.3, '#6a6a6a', '#333');
      ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(s * 1.25, -s * 0.28); ctx.quadraticCurveTo(s * 1.6, -s * 0.5, s * 1.3, -s * 0.05); ctx.fill(); ctx.beginPath(); ctx.moveTo(s * 1.25, s * 0.28); ctx.quadraticCurveTo(s * 1.6, s * 0.5, s * 1.3, s * 0.05); ctx.fill();
      break;
    }
    case 'wyvern': {
      const flap = frame ? 0.75 : 1.1;
      ctx.fillStyle = shade(color, -0.25); ctx.strokeStyle = dark; ctx.lineWidth = s * 0.08;
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.1, sgn * s * 0.2); ctx.lineTo(-s * 0.3, sgn * s * 1.3 * flap); ctx.lineTo(-s * 0.55, sgn * s * 0.9 * flap); ctx.lineTo(-s * 0.75, sgn * s * 1.1 * flap); ctx.lineTo(-s * 0.5, sgn * s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      line(-s * 0.5, 0, -s * 1.3, 0, s * 0.18, color);
      blob(0, 0, s * 0.6, s * 0.3, color); blob(s * 0.7, 0, s * 0.3, s * 0.2, lite);
      ctx.fillStyle = '#ffe040'; ctx.fillRect(s * 0.82, -s * 0.12, s * 0.08, s * 0.06); ctx.fillRect(s * 0.82, s * 0.06, s * 0.08, s * 0.06);
      break;
    }
    case 'ghost': {
      ctx.globalAlpha = 0.75; ctx.shadowColor = color; ctx.shadowBlur = s * 0.8;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(s * 0.6, 0);
      ctx.bezierCurveTo(s * 0.6, -s * 0.8, -s * 0.4, -s * 0.8, -s * 0.6, -s * 0.5);
      for (let i = 0; i < 4; i++) ctx.lineTo(-s * (0.95 + (i % 2) * 0.2) - leg * 0.05 * s, -s * 0.5 + i * s * 0.33);
      ctx.lineTo(-s * 0.6, s * 0.5); ctx.bezierCurveTo(-s * 0.4, s * 0.8, s * 0.6, s * 0.8, s * 0.6, 0); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.fillStyle = '#10202a'; ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.2, s * 0.12, 0, 7); ctx.arc(s * 0.3, s * 0.2, s * 0.12, 0, 7); ctx.fill();
      break;
    }
    case 'flame': {
      ctx.shadowColor = '#ff6020'; ctx.shadowBlur = s;
      ctx.fillStyle = '#ff5a10'; ctx.beginPath(); ctx.moveTo(s * 0.6, 0); ctx.quadraticCurveTo(s * 0.2, -s * 0.9, -s * (1.0 + leg * 0.1), -s * 0.2); ctx.quadraticCurveTo(-s * 0.5, 0, -s * (1.0 - leg * 0.1), s * 0.2); ctx.quadraticCurveTo(s * 0.2, s * 0.9, s * 0.6, 0); ctx.fill();
      ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.ellipse(s * 0.15, 0, s * 0.35, s * 0.28, 0, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#401000'; ctx.fillRect(s * 0.3, -s * 0.15, s * 0.1, s * 0.08); ctx.fillRect(s * 0.3, s * 0.07, s * 0.1, s * 0.08);
      break;
    }
    case 'golem': {
      line(-s * 0.1, -s * 0.45, -s * 0.1 + leg * s * 0.3, -s * 0.8, s * 0.32, dark); line(-s * 0.1, s * 0.45, -s * 0.1 - leg * s * 0.3, s * 0.8, s * 0.32, dark);
      ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = s * 0.1;
      ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.5); ctx.lineTo(-s * 0.3, -s * 0.85); ctx.lineTo(-s * 0.65, -s * 0.2); ctx.lineTo(-s * 0.6, s * 0.4); ctx.lineTo(-s * 0.2, s * 0.85); ctx.lineTo(s * 0.55, s * 0.5); ctx.lineTo(s * 0.7, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = lite; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.5); ctx.lineTo(0, 0); ctx.lineTo(-s * 0.2, s * 0.4); ctx.stroke();
      ctx.fillStyle = '#e0f8ff'; ctx.shadowColor = '#a0e0ff'; ctx.shadowBlur = s * 0.5; ctx.fillRect(s * 0.45, -s * 0.18, s * 0.12, s * 0.12); ctx.fillRect(s * 0.45, s * 0.06, s * 0.12, s * 0.12); ctx.shadowBlur = 0;
      break;
    }
    default: blob(0, 0, s * 0.6, s * 0.6, color);
  }
}

/** A foe picture: { c: canvas, half }. kind 'n' normal, 'w' white flash. */
export function foeSprite(look, color, size, frame, kind = 'n') {
  const key = `${look}|${color}|${Math.round(size)}|${frame}|${kind}`;
  let s = cache.get(key); if (s) return s;
  const pad = 4, R = Math.ceil(size * 1.8) + pad; const c = canvas(R * 2, R * 2); const x = c.getContext('2d');
  x.translate(R, R);
  body(x, look, color, size, frame);
  if (kind === 'w') { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(-R, -R, R * 2, R * 2); }
  s = { c, half: R }; cache.set(key, s); return s;
}

/** Soft round glow, used for every light and explosion (drawn with 'lighter'). */
export function glow(color, r = 64) {
  const key = 'glow|' + color + '|' + r; let s = cache.get(key); if (s) return s;
  const c = canvas(r * 2, r * 2); const x = c.getContext('2d'); const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, color); g.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.45)')); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2); cache.set(key, c); return c;
}

/** A tower's roof, seen from above. */
export function towerSprite(type, color, lvl, size = 15) {
  const tier = lvl >= 100 ? 3 : lvl >= 30 ? 2 : lvl >= 10 ? 1 : 0;
  const key = `tower|${type}|${tier}|${size}`; let s = cache.get(key); if (s) return s;
  const R = size + 8; const c = canvas(R * 2, R * 2); const x = c.getContext('2d'); x.translate(R, R);
  // stone base
  x.fillStyle = '#8a8478'; x.strokeStyle = '#3a362e'; x.lineWidth = 2;
  x.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; x.lineTo(Math.cos(a) * size, Math.sin(a) * size); } x.closePath(); x.fill(); x.stroke();
  // crenellations
  x.fillStyle = '#a49e90'; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; x.fillRect(Math.cos(a) * size * 0.82 - 2, Math.sin(a) * size * 0.82 - 2, 4, 4); }
  // the top: what makes each one recognisable
  const inner = size * 0.62;
  x.fillStyle = shade(color, -0.35); x.beginPath(); x.arc(0, 0, inner, 0, 7); x.fill();
  x.lineWidth = 2; x.strokeStyle = color; x.fillStyle = color;
  switch (type) {
    case 'archer': x.beginPath(); x.arc(0, 0, inner * 0.6, -1.2, 1.2); x.stroke(); x.beginPath(); x.moveTo(-inner * 0.5, 0); x.lineTo(inner * 0.75, 0); x.stroke(); break;
    case 'ballista': x.lineWidth = 3; x.beginPath(); x.moveTo(-inner * 0.6, -inner * 0.6); x.lineTo(0, 0); x.lineTo(-inner * 0.6, inner * 0.6); x.moveTo(-inner * 0.4, 0); x.lineTo(inner * 0.9, 0); x.stroke(); break;
    case 'bombard': x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc(0, 0, inner * 0.55, 0, 7); x.fill(); x.fillStyle = '#555'; x.fillRect(0, -inner * 0.22, inner * 0.9, inner * 0.44); break;
    case 'brazier': x.fillStyle = '#ffb030'; x.shadowColor = '#ff6020'; x.shadowBlur = 8; x.beginPath(); x.arc(0, 0, inner * 0.5, 0, 7); x.fill(); x.shadowBlur = 0; break;
    case 'frost': x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; x.moveTo(0, 0); x.lineTo(Math.cos(a) * inner * 0.8, Math.sin(a) * inner * 0.8); } x.stroke(); break;
    case 'storm': x.beginPath(); x.moveTo(-inner * 0.2, -inner * 0.7); x.lineTo(inner * 0.15, -inner * 0.05); x.lineTo(-inner * 0.15, 0.05 * inner); x.lineTo(inner * 0.2, inner * 0.7); x.lineWidth = 3; x.stroke(); break;
    case 'arcane': x.shadowColor = color; x.shadowBlur = 8; x.beginPath(); x.moveTo(0, -inner * 0.7); x.lineTo(inner * 0.5, 0); x.lineTo(0, inner * 0.7); x.lineTo(-inner * 0.5, 0); x.closePath(); x.fill(); x.shadowBlur = 0; break;
    case 'shrine': x.shadowColor = color; x.shadowBlur = 10; x.beginPath(); x.arc(0, 0, inner * 0.38, 0, 7); x.fill(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; x.beginPath(); x.moveTo(Math.cos(a) * inner * 0.5, Math.sin(a) * inner * 0.5); x.lineTo(Math.cos(a) * inner * 0.85, Math.sin(a) * inner * 0.85); x.stroke(); } x.shadowBlur = 0; break;
    case 'observatory': x.fillStyle = '#c8d0e0'; x.beginPath(); x.arc(0, 0, inner * 0.85, 0, 7); x.fill(); x.fillStyle = '#20304a'; x.fillRect(-inner * 0.12, -inner * 0.85, inner * 0.24, inner * 0.9); x.fillStyle = color; x.beginPath(); x.arc(0, -inner * 0.3, 2, 0, 7); x.fill(); break;
  }
  // tier pips
  x.fillStyle = '#ffd860'; for (let i = 0; i < tier; i++) { const a = -Math.PI / 2 + (i - (tier - 1) / 2) * 0.45; x.beginPath(); x.arc(Math.cos(a) * (size + 3), Math.sin(a) * (size + 3), 2.4, 0, 7); x.fill(); }
  s = { c, half: R }; cache.set(key, s); return s;
}

export function mageSprite(color) {
  const key = 'mage|' + color; let s = cache.get(key); if (s) return s;
  const R = 12; const c = canvas(R * 2, R * 2); const x = c.getContext('2d'); x.translate(R, R);
  x.fillStyle = shade(color, -0.4); x.beginPath(); x.arc(0, 0, 7, 0, 7); x.fill();
  x.fillStyle = color; x.beginPath(); x.arc(0, 0, 5, 0, 7); x.fill();
  x.fillStyle = '#f0d8b8'; x.beginPath(); x.arc(0, 0, 2.6, 0, 7); x.fill();
  x.fillStyle = shade(color, -0.2); x.beginPath(); x.moveTo(0, -6); x.lineTo(-3.5, -1); x.lineTo(3.5, -1); x.fill();
  s = { c, half: R }; cache.set(key, s); return s;
}
