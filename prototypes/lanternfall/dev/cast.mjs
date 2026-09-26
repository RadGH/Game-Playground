// scripted spell check: node dev/cast.mjs "<query>" out.png
import { chromium } from '@playwright/test';
const [, , q = '', out = 'cast.png'] = process.argv;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()); });
await p.goto('http://localhost:8401/prototypes/lanternfall/index.html?dummies=1&' + q);
await p.waitForFunction(() => window.lanternfall?.ready);
await p.evaluate(() => { lanternfall.loop.stop(); });
const r = await p.evaluate(() => {
  const L = lanternfall, g = L.game, out = [];
  const aimAt = e => { g.aim = { x: e.x, y: e.y - 5 }; };
  for (let slot = 0; slot < 4; slot++) {
    L.input.script([{ ticks: 1, ['wick' + (slot + 1)]: true }]); L.step(1);
    const tgt = g.entities.find(e => !e.dead) || { x: g.player.x + 80, y: g.player.y };
    aimAt(tgt);
    L.input.script([{ ticks: 2, cast: true }, { ticks: 1 }]); L.step(3);
    for (let k = 0; k < 40; k++) { aimAt(tgt); L.step(1); }
    out.push({ slot, spells: g.spells.length, oil: Math.round(g.player.oil), hp: g.entities.map(e => Math.round(e.hp)), statuses: g.entities.map(e => Object.keys(e.statuses).join('+')) });
  }
  return out;
});
console.log(JSON.stringify(r, null, 0));
await p.evaluate(() => { const L = lanternfall, g = L.game; g.aim = { x: g.player.x + 100, y: g.player.y - 20 }; L.input.script([{ ticks: 2, cast: true, wick1: true }, { ticks: 1 }]); L.step(8); L.loop.start(); });
await p.waitForTimeout(150);
await p.screenshot({ path: out });
await b.close();
