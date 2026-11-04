// M9 screenshots: the Powers tab, then each power cast through the tab and the map, a few moments
// apart. node prototypes/stoneward/tools/shots-m9.mjs <prefix> [port=8401] [width=402] [height=780]
import { chromium } from 'playwright';
const [out, port = 8401, w = 402, h = 780] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto(`http://localhost:${port}/prototypes/stoneward/?shots&dev`, { waitUntil: 'networkidle' });
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.mouse.click(+w / 2, +h / 2);
await page.waitForTimeout(1600);
await page.click('#land-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'hud', null, { timeout: 10000 });
await page.waitForTimeout(1500);
const town = (await page.evaluate(() => window.gameEye.state())).town.towns[0];
await page.evaluate(() => window.gameEye.order({ t: 'power.faith', n: 3000 }));
await page.click('[data-tab="powers"]');
await page.waitForTimeout(800);
await page.screenshot({ path: out + '-tab.png' });

const spots = [[70, 0], [-70, 10], [0, 70], [0, -70], [90, 60], [-90, -50], [-80, 70]];
const list = [['smite', 'small', [150, 600]], ['meteor', 'medium', [700, 1500, 4000]], ['tornado', 'medium', [1500, 5000]], ['blackhole', 'medium', [1500, 4000, 9000]],
  ['earthquake', 'large', [1200, 6000]], ['firestorm', 'medium', [2500, 7000]], ['rain', 'medium', [1500, 6000]]];
for (let k = 0; k < list.length; k++) {
  const [id, size, times] = list[k];
  const [dx, dy] = spots[k];
  // firestorm, then rain on top of the fire it made
  const at = id === 'rain' ? spots[5] : [dx, dy];
  await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 4), [town.x + at[0], town.y + at[1]]);
  await page.waitForTimeout(1200);
  if (!(await page.isVisible('.pw-grid'))) await page.click('[data-tab="powers"]');
  await page.click(`.pw-sizes [data-size="${size}"]`);
  const names = { smite: 'Smite', meteor: 'Meteor', tornado: 'Tornado', blackhole: 'Black Hole', earthquake: 'Earthquake', firestorm: 'Firestorm', rain: 'Call Rain' };
  await page.click(`.pw-grid button:has-text("${names[id]}")`);
  if (k === 0) await page.screenshot({ path: out + '-picked.png' });
  // tap the map to cast, then shut the tab so the whole map shows
  await page.mouse.click(+w / 2, +h * 0.45);
  await page.waitForTimeout(100);
  await page.click('[data-tab="powers"]');
  let last = 100;
  for (const t of times) { await page.waitForTimeout(Math.max(0, t - last)); last = t; await page.screenshot({ path: `${out}-${id}-${t}.png` }); }
}
await page.evaluate(() => window.gameEye.order({ t: 'time', tod: 0.72 }));
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 4), [town.x + spots[1][0], town.y + spots[1][1]]);
await page.waitForTimeout(1500);
await page.screenshot({ path: out + '-night.png' });
console.log(JSON.stringify(await page.evaluate(() => ({ ...window.gameEye.state(), powers: window.gameEye.view()?.powers && { faith: window.gameEye.view().powers.faith, cool: window.gameEye.view().powers.cool, act: window.gameEye.view().powers.act.length } }))));
console.log(logs.join('\n') || 'no console errors');
await browser.close();
