// Mid-game screenshot: a set-up city at a siege wave. node tools/shot2.mjs [w] [h] [name] [wave]
import { chromium } from 'playwright';
const [w = 1280, h = 800, name = 'mid', wave = 30] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h }, hasTouch: +w < 700, isMobile: +w < 700, deviceScaleFactor: +w < 700 ? 2 : 1 });
const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:8401/prototypes/spirehold/?t=${Date.now()}`);
await p.waitForTimeout(1200);
await p.click('text=Found your city'); await p.waitForTimeout(300); await p.click('button:has-text("Found it")'); await p.waitForTimeout(400);
await p.click('button:has-text("Got it")').catch(() => {});
await p.evaluate((wave) => {
  const { G } = window.app;
  G.city.level = 16; G.city.pop = 4000; G.wall.lvl = 40; G.gold = 1e5; G.lore = 5000; G.shards = 12;
  G.city.landmarks = { market: 5, granary: 4, forge: 6, temple: 3, tavern: 3, academy: 4, library: 2, observatory: 2, guildhall: 1 };
  G.research = { sp_chain: 1, sp_frost: 1, sp_meteor: 1, sp_quake: 1, sp_ward: 1, rs_auto: 1, rs_mages: 3, rs_towers: 10 };
  const types = ['archer', 'ballista', 'bombard', 'frost', 'brazier', 'storm', 'arcane', 'shrine', 'observatory'];
  G.towers = []; for (let s = 0; s < 21; s++) G.towers.push({ slot: s, type: types[s % types.length], lvl: 28 + (s % 4) * 3, br: [s % 2, null], kills: 0, dmg: 0 });
  G.mages = ['pyromancer', 'cryomancer', 'stormcaller', 'geomancer'].map((school, i) => ({ id: i + 1, name: 'Mage ' + i, school, lvl: 30, kills: 0 }));
  G.spells.auto = { meteor: true, chain: true, fireball: true }; G.mana = 300; G._rev = (G._rev | 0) + 1;
  G.wave.n = wave; G.wave.best = wave;
  window.app.B = null;
}, +wave);
await p.evaluate(async () => { const m = await import('./js/sim/game.js'); window.app.B = m.createBattle(window.app.G, 5); window.app.G.wall.hp = 1e9; });
await p.waitForTimeout(9000);
await p.screenshot({ path: `shots/${name}-siege.png` });
await p.click('.tabs button[data-tab=guild]'); await p.waitForTimeout(700);
await p.screenshot({ path: `shots/${name}-guild.png` });
console.log(errs.length ? errs.join('\n') : 'no console errors');
await b.close();
