import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const milestone = process.argv[2] || 'm0', version = milestone === 'm0' ? '2.5' : '2.6';
const out = `avatar-3d/shots/chibi26/${milestone}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error(e.message));
async function reset() {
  await page.goto(`http://localhost:8401/avatar-3d/?v=${version}`);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('bones'), null, { timeout: 120000 });
  await page.waitForTimeout(350);
}
async function capture(path, { turn = 0, zoom = 0 } = {}) {
  await reset();
  if (turn) { await page.mouse.move(720, 440); await page.mouse.down(); await page.mouse.move(720 + turn, 440, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(250); }
  if (zoom) { await page.mouse.move(480, 320); await page.mouse.wheel(0, zoom); await page.waitForTimeout(250); }
  await page.screenshot({ path, fullPage: true });
}
await capture(`${out}/front.png`);
await capture(`${out}/three-quarter.png`, { turn: 75 });
await capture(`${out}/side.png`, { turn: 135 });
const facePage = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 });
await facePage.goto(`http://localhost:8401/avatar-3d/?v=${version}`);
await facePage.waitForFunction(() => document.querySelector('#status')?.textContent.includes('bones'), null, { timeout: 120000 });
await facePage.waitForTimeout(500);
const box = await facePage.locator('#viewport').boundingBox();
await facePage.screenshot({ path: `${out}/face-close.png`, clip: { x: box.x + box.width / 2 - 110, y: box.y + 2, width: 220, height: 220 } });
await facePage.close();
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await phone.goto(`http://localhost:8401/avatar-3d/?v=${version}`);
await phone.waitForFunction(() => document.querySelector('#status')?.textContent.includes('bones'), null, { timeout: 120000 });
await phone.waitForTimeout(500);
await phone.screenshot({ path: `${out}/phone.png`, fullPage: true });
await browser.close();
