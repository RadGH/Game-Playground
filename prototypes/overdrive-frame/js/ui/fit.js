// Fit a baked picture into a small canvas, cropped to its visible pixels (previews, comms portraits, enemy icons).
/** The box around a picture's visible pixels (cached), so previews are fitted to the thing, not its empty margin. */
const bboxCache = new WeakMap();
function bbox(cv) {
  if (bboxCache.has(cv)) return bboxCache.get(cv);
  // read a small copy (reading a full picture back from the graphics card can take seconds on slow machines)
  const k = Math.min(1, 96 / Math.max(cv.width, cv.height)), sw = Math.max(1, Math.round(cv.width * k)), sh = Math.max(1, Math.round(cv.height * k));
  const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
  const g = tmp.getContext('2d', { willReadFrequently: true }); g.drawImage(cv, 0, 0, sw, sh);
  const d = g.getImageData(0, 0, sw, sh).data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 30) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const b = x1 < 0 ? [0, 0, cv.width, cv.height] : [Math.max(0, (x0 - 1) / k), Math.max(0, (y0 - 1) / k), Math.min(cv.width, (x1 - x0 + 3) / k), Math.min(cv.height, (y1 - y0 + 3) / k)];
  bboxCache.set(cv, b); return b;
}
/** Draw a picture (and its night lights) fitted into a canvas, cropped to what's visible. */
export function drawFit(dst, src, lights = null, pad = 0.08, crop = true) {
  const [x, y, w, h] = crop ? bbox(src) : [0, 0, src.width, src.height], g = dst.getContext('2d'), k = Math.min(dst.width * (1 - pad * 2) / w, dst.height * (1 - pad * 2) / h);
  const dx = (dst.width - w * k) / 2, dy = (dst.height - h * k) / 2;
  g.clearRect(0, 0, dst.width, dst.height); g.drawImage(src, x, y, w, h, dx, dy, w * k, h * k);
  if (lights) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; g.drawImage(lights, x, y, w, h, dx, dy, w * k, h * k); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
}
