// Turn on the speed readout, start a level, send a report; prints the report's perf block.
// node prototypes/kindlewild/tools/perf-hud.mjs [level] [outdir]
import { chromium, webkit } from 'playwright';
const id = process.argv[2] || '1-5', out = process.argv[3] || '/tmp';
const b = process.env.WEBKIT ? await webkit.launch() : await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 402, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:8401/prototypes/kindlewild/');
await p.waitForFunction(() => window.gameEye && !document.getElementById('loading'));
await p.tap('#go-settings'); await p.locator('.modal label.toggle', { hasText: 'speed' }).click(); await p.locator('.modal .big.go').tap();
await p.evaluate((id) => window.gameEye.startLevel(id), id);
await p.locator('.modal .big.go').tap();
await p.waitForTimeout(3000);
await p.screenshot({ path: out + '/perf-hud.png' });
await p.evaluate(() => window.gameEye.app.report());
await p.locator('.modal textarea').fill('test report from tools/perf-hud.mjs');
await p.locator('.modal .big.go').tap();
await p.waitForTimeout(1500);
const rep = await p.evaluate(() => JSON.parse(localStorage.getItem('kindlewild.reports')).at(-1));
console.log(JSON.stringify({ sent: rep.sent, shot: !!rep.shot, shotKB: Math.round((rep.shot || "").length * 0.75 / 1024), perf: rep.perf }, null, 1), errs);
await b.close();
