// Play-test 2 screenshots on a phone: a town grown at speed (yards, work, boats, roads from afar),
// top-bar explanations, Info → Needs, Army flags, Lines, Transport, a raid, and a save → reload that
// checks the townsfolk are still busy afterwards (owner: "all the people just sat still").
// node prototypes/stoneward/tools/shots-pt2.mjs [outDir]
import { chromium } from 'playwright';
const out = process.argv[2] || 'test-results/stoneward-pt2';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push('PAGE ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
page.on('worker', w => w.on('console', m => { if (m.type() === 'error') errs.push('WORKER ' + m.text().slice(0, 300)); }));
page.on('dialog', d => d.dismiss());
await page.goto('http://localhost:8401/prototypes/stoneward/?dev', { waitUntil: 'networkidle' });
await page.evaluate(() => { try { indexedDB.deleteDatabase('stoneward'); } catch {} });
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 60000 });
await page.evaluate(() => window.gameEye.found());
const shot = n => page.screenshot({ path: `${out}/${n}.png` });
const clean = () => page.evaluate(() => document.querySelectorAll('.celebrate').forEach(e => e.remove()));
await page.waitForTimeout(1500);
await page.evaluate(() => window.gameEye.speed(8));
const grow = Number(process.argv[3] || 150);
for (let s = 0; s < grow; s += 10) { await page.waitForTimeout(10000); await clean(); const st = await page.evaluate(() => window.gameEye.state()); console.log('t', s, 'pop', st.town?.pop, 'day', Math.round((st.clock?.tick || 0) / 1200) / 10); }
await page.evaluate(() => window.gameEye.speed(1));
const st = await page.evaluate(() => window.gameEye.state());
const t = st.town.towns[0];
console.log('town', JSON.stringify(st.town.kinds));
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 7), [t.x, t.y]); await page.waitForTimeout(1500); await clean(); await shot('01-close');
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 3), [t.x, t.y]); await page.waitForTimeout(1500); await clean(); await shot('02-mid');
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 1.0), [t.x, t.y]); await page.waitForTimeout(1500); await clean(); await shot('03-far-roads');
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 0.45), [t.x, t.y]); await page.waitForTimeout(1500); await clean(); await shot('04-farther');
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 3), [t.x, t.y]); await page.waitForTimeout(1200);
// top bar
await page.click('#st-gold'); await page.waitForTimeout(300); await shot('05-gold-tap');
await page.click('#st-pop'); await page.waitForTimeout(300); await shot('06-pop-tap');
// Info → Needs
await page.click('#dock-tabs [data-tab="info"]'); await page.waitForTimeout(400); await shot('07-needs');
await page.click('.groups button:has-text("Kingdom")'); await page.waitForTimeout(300); await shot('08-kingdom');
await page.click('#dock-tabs [data-tab="info"]');
// Lines, Transport, Army
await page.click('#dock-tabs [data-tab="roads"]'); await page.waitForTimeout(300); await shot('09-lines'); await page.click('#dock-tabs [data-tab="roads"]');
await page.click('#dock-tabs [data-tab="rails"]'); await page.waitForTimeout(300); await shot('10-transport'); await page.click('#dock-tabs [data-tab="rails"]');
await page.click('#dock-tabs [data-tab="army"]'); await page.waitForTimeout(300); await shot('11-army');
await page.click('#dock-tabs [data-tab="army"]');
// tap a building (selection outline)
const vb = page.viewportSize();
await page.mouse.click(vb.width / 2, vb.height / 2 - 40); await page.waitForTimeout(700); await shot('12-tap');
// a raid at the edge of town
await page.evaluate(([x, y]) => { for (let k = 0; k < 8; k++) window.gameEye.order({ t: 'spawn', kind: k % 4 === 3 ? 'sapper' : 'bandit', x: x + 70 + k, y: y + 20 }); }, [t.x, t.y]);
await page.evaluate(([x, y]) => window.gameEye.fly(x + 40, y + 15, 3.2), [t.x, t.y]);
for (let k = 0; k < 4; k++) { await page.waitForTimeout(4000); await clean(); await shot('13-raid-' + k); }
// save, reload, continue: are people still moving?
await page.evaluate(() => window.gameEye.speed(1));
await page.click('#btn-menu'); await page.click('#menu-buttons button:has-text("Save now")'); await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'networkidle' });
await page.click('#btn-continue'); await page.waitForFunction(() => window.gameEye.state().screen === 'hud', null, { timeout: 60000 });
await page.waitForTimeout(4000);
const sample = () => page.evaluate(() => (window.gameEye.view()?.people || []).map(p => [p[5], p[0], p[1]]));
const a = await sample(); await page.waitForTimeout(6000); const b = await sample();
const m = new Map(a.map(([id, x, y]) => [id, [x, y]]));
const moved = b.filter(([id, x, y]) => m.has(id) && Math.hypot(m.get(id)[0] - x, m.get(id)[1] - y) > 1).length;
console.log('after reload: moved', moved, 'of', b.length, 'in view');
await clean(); await shot('14-after-reload');
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
