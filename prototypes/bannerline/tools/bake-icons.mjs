// node prototypes/bannerline/tools/bake-icons.mjs [--url URL]
//
// Bakes every icon (PLAN §16): drives icons.html in headless Chromium, which renders each unit,
// hero, item base and skill with the game's own models, then writes
//   prototypes/bannerline/assets/icons/<kind>/<id>.png  and  assets/icons/index.json
// Run under the shared browser lock from the playground root:
//   flock /tmp/claude-1000/farhold-pw.lock node prototypes/bannerline/tools/bake-icons.mjs
// Re-run after changing a unit's look (data/looks.json), a creature, a Chibi 2 part or the catalog.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const out = fileURLToPath(new URL('../assets/icons/', import.meta.url));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(option('url', 'http://localhost:8401/prototypes/bannerline/icons.html'));
  await page.waitForFunction(() => window.iconForge?.ready, null, { timeout: 120000 });
  const images = await page.evaluate(() => window.iconForge.renderAll());
  const catalog = JSON.parse(await readFile(new URL('catalog.json', `file://${out}`), 'utf8'));
  const index = { _doc: 'Written by tools/bake-icons.mjs. Every file is assets/icons/<kind>/<id>.png.', date: new Date().toISOString().slice(0, 10), size: catalog.size || 128, kinds: {} };
  let n = 0;
  for (const [kind, map] of Object.entries(images)) {
    await mkdir(out + kind, { recursive: true });
    index.kinds[kind] = [];
    for (const [id, url] of Object.entries(map)) {
      await writeFile(`${out}${kind}/${id}.png`, Buffer.from(url.split(',')[1], 'base64'));
      index.kinds[kind].push(id); n++;
    }
  }
  await writeFile(out + 'index.json', JSON.stringify(index, null, 1) + '\n');
  console.log(`baked ${n} icons into ${out}`, Object.fromEntries(Object.entries(index.kinds).map(([k, v]) => [k, v.length])));
  if (errors.length) { console.log('page errors:', errors); process.exitCode = 1; }
} finally { await browser.close(); }
