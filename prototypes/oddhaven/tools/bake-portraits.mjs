// The gallery's faces: a real render of each premade's 3D body, drawn once here so a phone never has to. Run after changing a premade's look
// (tests/client.test.js fails until you do), with the dev server up on 8401:
//   node prototypes/oddhaven/tools/bake-portraits.mjs
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = new URL('../data/portraits/', import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }), page = await browser.newPage({ viewport: { width: 402, height: 780 } });
page.on('pageerror', e => console.error('page:', e.message));
await page.goto(process.env.ODD_URL ?? 'http://localhost:8401/prototypes/oddhaven/?tier=low');
await page.waitForFunction(() => window.gameEye, null, { timeout: 90000 });
const list = await page.evaluate(() => gameEye.premadeList()), index = {};
for (const h of list) for (let m = 0; m < h.n; m++) {
  const r = await page.evaluate(async ([id, i]) => { const a = gameEye.premadeAvatar(id, i), url = await gameEye.portrait(a); return { url, key: gameEye.faceKey(a) }; }, [h.id, m]);
  writeFileSync(new URL(`${h.id}-${m}.webp`, out), Buffer.from(r.url.split(',')[1], 'base64'));
  index[`${h.id}-${m}`] = r.key;
  if (!r.url.startsWith('data:image/webp')) throw new Error('not a webp: ' + r.url.slice(0, 30));
}
writeFileSync(new URL('index.json', out), JSON.stringify(index, null, 0) + '\n');
console.log(`${Object.keys(index).length} faces`);
await browser.close();
