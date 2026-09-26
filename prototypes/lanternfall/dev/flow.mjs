// node dev/flow.mjs [port] — headless walk through the whole campaign: title -> new game -> every act's
// main path (first @next exit each time) -> boss killed -> Great Lamp relit -> next act ... -> ending.
// Plays ~2 s of real ticks in every room so AI, spells, things and bosses all run. Reports errors per room.
import { chromium } from '@playwright/test';
const port = process.argv[2] || '8401';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
await p.goto(`http://localhost:${port}/prototypes/lanternfall/index.html`);
await p.waitForFunction(() => window.lanternfall?.ready, null, { timeout: 30000 });
console.log('title ok', await p.evaluate(() => ({ errors: lanternfall.errors, screen: document.querySelector('#screens')?.textContent?.slice(0, 80) })));
await p.evaluate(() => lanternfall.newGame({ classId: 'lamplighter', difficulty: 'lamplighter', seed: 7 }));
await p.waitForTimeout(500);
const rooms = [];
for (let k = 0; k < 150; k++) {
  const r = await p.evaluate(async () => {
    const L = lanternfall, g = L.game; const P = g.player; P.hp = P.maxHp; P.invuln = 99;
    L.step(120); P.invuln = 99;
    const info = { room: g.room.room.id, name: g.room.room.name, standIn: !!g.room.room.standIn, things: [...new Set(g.room.things.map(t => t.t))].join(','), enemies: g.entities.filter(e => e.kind === 'enemy').length, boss: g.boss?.name || null };
    if (g.boss && !g.boss.dead) { // wake it, fight a little, then finish it
      P.x = g.boss.x - 60; P.y = g.boss.y; L.step(240); P.invuln = 99; info.bossPhase = g.boss.phase; info.bossAtk = g.boss.atk?.id || 'none';
      g.boss.hp = 1; const { dealDamage } = await import('./js/rpg/damage.js'); dealDamage(g, { source: P, target: g.boss, amount: 10 }); L.step(60); info.bossDead = g.boss?.dead ?? true;
    }
    const gl = g.things.list.find(t => t.t === 'great_lamp'); if (gl) { await L.interact(gl); info.lamp = gl.lit; }
    const lp = g.things.list.find(t => t.t === 'lamp_post'); if (lp && !info.lamp) { await L.interact(lp); info.saved = true; }
    const ex = g.room.exits.find(x => x.to === '@next') || g.room.exits.find(x => x.to?.startsWith('@next'));
    if (!ex) return { ...info, end: 'no exit' };
    const before = g.room.room.id; await L.takeExit(ex); await new Promise(r => setTimeout(r, 300));
    return { ...info, next: L.game.room.room.id, moved: L.game.room.room.id !== before, complete: !!g.flags.game_complete, errors: L.errors.length };
  });
  rooms.push(r); console.log(JSON.stringify(r));
  if (r.complete || !r.moved) break;
}
console.log('errors', errs.slice(0, 20), await p.evaluate(() => ({ errors: lanternfall.errors, warnings: lanternfall.warnings, level: lanternfall.game.hero.level, pennies: lanternfall.game.hero.currency.pennies })));
await p.screenshot({ path: new URL('../test-results/lanternfall-flow-end.png', import.meta.url).pathname });
await b.close();
