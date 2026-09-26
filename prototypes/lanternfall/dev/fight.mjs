// scripted fight: node dev/fight.mjs out.png — spawn act 1 monsters and fight them with pole + spells
import { chromium } from '@playwright/test';
const out = process.argv[2] || 'fight.png';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text()); });
await p.goto('http://localhost:8401/prototypes/lanternfall/index.html?room=a1_wax_stair_02&spawn=dripling,wax_mite,tallow_hound,soot_pigeon');
await p.waitForFunction(() => window.lanternfall?.ready);
const r = await p.evaluate(() => {
  const L = lanternfall, g = L.game; L.loop.stop(); const log = [];
  const snap = t => log.push({ t, hp: Math.round(g.player.hp), oil: Math.round(g.player.oil), enemies: g.entities.filter(e => e.kind === 'enemy').map(e => `${e.def.id}:${Math.round(e.hp)}:${e.brain.state}${e.brain.attack ? '/' + e.brain.attack.id + '/' + e.brain.phase : ''}`) });
  for (let s = 0; s < 8; s++) {
    // face the nearest enemy, swing and cast
    const e = g.entities.find(x => x.kind === 'enemy' && !x.dead); if (!e) break;
    g.aim = { x: e.x, y: e.y - e.h / 2 };
    const right = e.x > g.player.x;
    L.input.script([{ ticks: 10, right, left: !right }, { ticks: 2, attack: true }, { ticks: 20 }, { ticks: 2, cast: true }, { ticks: 20 }, { ticks: 2, attack: true }, { ticks: 20 }]);
    L.step(76); snap(s);
  }
  return log;
});
for (const l of r) console.log(JSON.stringify(l));
await p.evaluate(() => lanternfall.loop.start()); await p.waitForTimeout(200);
await p.screenshot({ path: out }); await b.close();
