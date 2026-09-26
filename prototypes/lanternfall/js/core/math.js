// Small math helpers shared by pure modules.
export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = v => v > 0 ? 1 : v < 0 ? -1 : 0;
export const approach = (v, target, step) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const aabbOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const hexToRgb = hex => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const hexToRgb01 = hex => hexToRgb(hex).map(v => v / 255);
export function smoothDamp(cur, target, velRef, smooth, dt) {
  const o = 2 / Math.max(0.0001, smooth), x = o * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, temp = (velRef.v + o * change) * dt;
  velRef.v = (velRef.v - o * temp) * e; return target + (change + temp) * e;
}
