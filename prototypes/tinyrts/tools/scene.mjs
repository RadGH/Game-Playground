// Visual scene tester: node tools/scene.mjs <name> <outdir>
// Sets up a scripted scene through window.app and screenshots it over time.
import { chromium } from '@playwright/test';
const [, , name = 'turrets', out = '.'] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('SCENE')) errors.push(m.text()); });
await page.goto('http://localhost:8460/?play=sandbox&nopause&seed=4242&style=flat');
await page.waitForTimeout(1200);
const scenes = {
  turrets: `(() => {
    const app = window.app, g = app.game;
    g.waves.enabled = false;
    g.opts.instantBuild = true;
    const core = g.byId.get(g.teams[1].coreId);
    const place = (type, x) => { const { snapPlacement } = app._place; const p = snapPlacement(g, type, x, core.y); const r = g.applyNow({ t: 'build', team: 1, type, x: p.x, y: p.y }); if (!r.ok) console.log('SCENE fail ' + type + ' ' + r.reason); };
    let x = core.x + core.w + 12;
    for (const t of ['relay', 'pulse', 'lance', 'mortar', 'relay', 'railgun', 'flak', 'arc', 'relay', 'solar', 'solar', 'battery']) { place(t, x); x += 15; }
    const gy = g.world.surfaceY(x + 20);
    for (let y = gy - 22; y < gy; y++) for (let xx = x + 20; xx < x + 24; xx++) g.world.set(xx, y, 8, 1);
    app.camera.centerOn(x - 40, core.y);
    const { spawnAt } = app._waves;
    for (const t of ['mite','mite','mite','gnawer','spitter','wisp','wisp','carapace','glare','bombard','splitter']) { const u = spawnAt(g, t, t==='wisp'||t==='bombard' ? 'sky-right' : 'right'); u.x = x + 50 + Math.random()*50; u.y = g.world.surfaceY(Math.floor(u.x)) - (u.flying ? 40 : 1); }
  })()`,
  bosses: `(() => {
    const app = window.app, g = app.game;
    g.waves.enabled = false; g.opts.instantBuild = true;
    const core = g.byId.get(g.teams[1].coreId);
    const { snapPlacement } = app._place;
    const place = (type, x) => { const p = snapPlacement(g, type, x, core.y); g.applyNow({ t: 'build', team: 1, type, x: p.x, y: p.y }); };
    let x = core.x + core.w + 14;
    for (const t of ['pulse', 'mortar', 'flak', 'pulse']) { place(t, x); x += 16; }
    const gy = g.world.surfaceY(x + 10);
    for (let y = gy - 30; y < gy; y++) for (let xx = x + 10; xx < x + 18; xx++) g.world.set(xx, y, 7, 1);
    const { spawnAt } = app._waves;
    const t = spawnAt(g, 'titan', 'right'); t.x = x + 90; t.y = g.world.surfaceY(Math.floor(t.x)) - 1;
    const h = spawnAt(g, 'hivemother', 'sky-right'); h.x = x + 120;
    for (let k = 0; k < 4; k++) { const b = spawnAt(g, 'borer', 'under-right'); b.x = x + 100 + k * 10; }
    app.camera.centerOn(x + 30, core.y);
  })()`,
};
await page.evaluate(scenes[name]);
for (let i = 1; i <= 4; i++) {
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/${name}${i}.png` });
}
const st = await page.evaluate(() => { const g = window.app.game; return { kills: g.teams[1].stats.kills, left: g.units.filter((u) => u.hollow).map((u) => u.type), blds: g.buildings.map((b) => `${b.type}:${Math.round(b.hp)}`), power: g.teams[1].power, res: g.teams[1].res }; });
console.log(JSON.stringify(st));
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 8).join('\n'));
await browser.close();
