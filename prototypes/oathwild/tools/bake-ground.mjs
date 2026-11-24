// Bakes Oathwild's ground textures once: highdef-3d's painted surfaces (js/kit/textures.js makeSurface, our own code, drawn
// from a seed) saved as img/ground/<layer>.webp, so a phone loads ten small pictures instead of painting them at start-up.
// The layer list (which surface, which tint, how much contrast) is data/ground.json `layers`; run this again after changing it.
//   flock /tmp/oathwild-browser.lock node prototypes/oathwild/tools/bake-ground.mjs [--base http://localhost:8401] [--size 512]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://localhost:8401');
const size = Number(arg('size', 512));
const here = new URL('../', import.meta.url).pathname;
const layers = JSON.parse(readFileSync(here + 'data/ground.json', 'utf8')).layers;
const out = here + 'img/ground/'; mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/prototypes/oathwild/?lite`);
const pics = await page.evaluate(async ({ layers, size }) => {
  const { makeSurface } = await import('/highdef-3d/js/kit/textures.js');
  const res = {};
  for (const L of layers) {
    const s = makeSurface(L.surface, { size, seed: L.seed || 7, ...(L.tint ? { tint: L.tint } : {}) });
    let cv = s.map.image;
    if (L.contrast && L.contrast !== 1) {          // pull every pixel towards the picture's mean (a calmer surface)
      const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); x.drawImage(cv, 0, 0);
      const im = x.getImageData(0, 0, size, size), d = im.data, m = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k];
      for (let k = 0; k < 3; k++) m[k] /= d.length / 4;
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = m[k] + (d[i + k] - m[k]) * L.contrast;
      x.putImageData(im, 0, 0); cv = c;
    }
    res[L.id] = cv.toDataURL('image/webp', 0.88);
  }
  return res;
}, { layers, size });
for (const [id, url] of Object.entries(pics)) {
  writeFileSync(out + id + '.webp', Buffer.from(url.split(',')[1], 'base64'));
  console.log('baked', id);
}
await browser.close();
