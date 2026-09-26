// scripted movement check: node dev/move.mjs
import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()); });
await p.goto('http://localhost:8401/prototypes/lanternfall/index.html?room=a1_wax_stair_02');
await p.waitForFunction(() => window.lanternfall?.ready);
await p.evaluate(() => { lanternfall.loop.stop(); });
const log = async (label) => console.log(label, JSON.stringify(await p.evaluate(() => lanternfall.player())));
await log('start');
await p.evaluate(() => { lanternfall.input.script([{ ticks: 60, right: true }]); lanternfall.step(60); }); await log('walk 1s');
await p.evaluate(() => { lanternfall.input.script([{ ticks: 60, right: true, run: true }]); lanternfall.step(60); }); await log('run 1s');
await p.evaluate(() => { lanternfall.input.script([{ ticks: 1, jump: true, right: true, run: true }, { ticks: 20, jump: true, right: true, run: true }]); lanternfall.step(21); }); await log('jump apex-ish');
await p.evaluate(() => { lanternfall.input.script([{ ticks: 90, right: true }]); lanternfall.step(90); }); await log('after');
await p.evaluate(() => { lanternfall.loop.start(); });
await p.waitForTimeout(500);
await p.screenshot({ path: process.argv[2] || 'move.png' });
await b.close();
