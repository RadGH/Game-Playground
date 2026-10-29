// M6 screenshots: node prototypes/lodestar/tools/shots-m6.mjs [desktop|phone] [scene]   (under the playground Playwright lock)
// Each scene starts a fresh game (seed 7, small map), raises a mana refinery and a battery with dev commands, fills the
// store, sets the scene up (training dummies, a pond, a grass fire…), then fires the spell through the REAL Spell
// Board and light pen and photographs a burst of frames as it lands. Prints console errors; writes shots/m6/.
import { chromium } from 'playwright';
const out = new URL('../shots/m6/', import.meta.url).pathname;
const base = process.env.LODESTAR_URL || 'http://localhost:8401/prototypes/lodestar/';
const onlySize = process.argv[2] || null, onlyScene = process.argv[3] || null;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let bad = 0;

async function fresh(name, w, h, phone) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') { bad++; console.log(`[${name}] console error:`, m.text()); } });
  page.on('pageerror', (e) => { bad++; console.log(`[${name}] page error:`, e.message); });
  await page.goto(base);
  await page.waitForSelector('.title [data-act=new]');
  await page.click('[data-act=new]');
  await page.waitForSelector('.newgame-modal');
  await page.click('[data-knob=ng-size] .knob-detent[data-detent="0"]');
  await page.fill('#ng-seed', '7');
  await page.click('[data-act=start]');
  await page.waitForFunction(() => window.gameEye?.state().screen === 'game' && window.gameEye.state().tick > 25, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const cmd = (c) => page.evaluate((c) => window.gameEye.act('cmd', c), c);
  const econ = () => page.evaluate(() => window.gameEye.act('econ'));
  const step = async (n, wait = 400) => { await page.evaluate((n) => window.gameEye.act('step', n), n); await page.waitForTimeout(wait); };
  const hq = (await econ()).buildings.find((b) => b.type === 'hq');
  for (const [dx, dy] of [[0, 40], [40, 0], [-40, 0], [0, -40]]) {
    await cmd({ t: 'dev.raise', type: 'mana_refinery', x: hq.x + dx, y: hq.y + dy }); await step(2, 200);
    if ((await econ()).buildings.some((b) => b.type === 'mana_refinery')) break;
  }
  for (const [dx, dy] of [[-30, 44], [30, 44], [44, -30], [-44, -30]]) {
    await cmd({ t: 'dev.raise', type: 'battery', x: hq.x + dx, y: hq.y + dy }); await step(2, 200);
    if ((await econ()).buildings.some((b) => b.type === 'battery')) break;
  }
  await cmd({ t: 'dev.mana', n: 400 });
  await step(4, 300);
  await page.evaluate(() => window.gameEye.fxSlow(5));
  const g = { page, ctx, cmd, econ, step, hq, phone, name };
  g.range = async (i) => { const now = (await page.evaluate(() => window.gameEye.state().range.index)); for (let k = now; k > i; k--) await page.keyboard.press('q'); for (let k = now; k < i; k++) await page.keyboard.press('e'); await page.waitForTimeout(200); };
  g.centre = (x, y) => page.evaluate(([x, y]) => window.gameEye.act('centre', x, y), [x, y]);
  g.toS = (x, y) => page.evaluate(([x, y]) => { const v = window.gameEye.state().view; return [(x - v.cx) * v.ppc + v.w / 2, (y - v.cy) * v.ppc + v.h / 2]; }, [x, y]);
  return g;
}

async function openBoard(g) {
  const { page, phone } = g;
  if (await page.locator('.drawer[data-machine=spellboard]').isVisible()) return;
  if (phone) await page.tap('.handle[data-page=more]');
  await page.click('.bay-tab[data-group=arcane]');
  await page.click('.bay-slot[data-slot=spellboard]');
  await page.waitForTimeout(250);
}

/** Pull the cartridge, aim with the pen (click, or drag for a line), press FIRE. */
async function fire(g, spell, at, at2 = null) {
  const { page, phone } = g;
  await openBoard(g);
  await page.click(`.sb-cart[data-spell=${spell}]`);
  await page.waitForTimeout(650);
  const gb = await page.locator('.glass').boundingBox();
  const [sx, sy] = await g.toS(at[0] + 0.5, at[1] + 0.5);
  if (at2) {
    const [ex, ey] = await g.toS(at2[0] + 0.5, at2[1] + 0.5);
    await page.mouse.move(gb.x + sx, gb.y + sy); await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(gb.x + sx + (ex - sx) * k / 10, gb.y + sy + (ey - sy) * k / 10);
    await page.mouse.up();
  } else if (phone) {
    const t = (type) => page.dispatchEvent('.glass', type, { pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: gb.x + sx, clientY: gb.y + sy + 40, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true });
    await t('pointerdown'); await t('pointerup');
  } else {
    await page.mouse.move(gb.x + sx, gb.y + sy); await page.mouse.click(gb.x + sx, gb.y + sy);
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}${g.name}-${g.tag || spell}-aim.png` });
  await page.click('.sb-fire');
}
async function burst(g, label, startMs, n, everyMs) {
  await g.page.waitForTimeout(startMs);
  for (let k = 0; k < n; k++) { await g.page.screenshot({ path: `${out}${g.name}-${label}-${k}.png` }); await g.page.waitForTimeout(everyMs); }
}
const wild = async (g, pts, hp = 300) => { for (const [x, y] of pts) await g.cmd({ t: 'dev.wild', x, y, hp }); };

const SCENES = {
  async lightning(g) {
    const { hq } = g; const px = hq.x + 64, py = hq.y - 6;
    await g.cmd({ t: 'dev.paint', x: px, y: py, r: 11, mat: 'shallow' });
    await wild(g, [[px - 4, py], [px + 3, py - 4], [px + 2, py + 5], [px + 22, py], [px + 25, py + 6]]);
    await g.range(4); await g.centre(px + 8, py); await g.step(22, 400);
    await fire(g, 'lightning', [px, py]);
    await burst(g, 'lightning', 120, 4, 110);
    // the dry-land chain: a line of dummies in the open
    const cx = hq.x + 70, cy = hq.y + 40;
    await wild(g, [[cx, cy], [cx + 10, cy + 3], [cx + 20, cy - 2], [cx + 30, cy + 4], [cx + 40, cy]]);
    await g.cmd({ t: 'dev.mana', n: 400 }); await g.centre(cx + 18, cy); await g.step(40, 300);
    g.tag = 'chain'; await fire(g, 'lightning', [cx, cy]);
    await burst(g, 'chain', 120, 4, 110);
  },
  async meteor(g) {
    const { hq } = g; const x = hq.x + 74, y = hq.y + 30;
    await wild(g, [[x - 4, y], [x + 6, y + 4], [x + 2, y - 7]]);
    await g.range(3); await g.centre(x, y); await g.step(4, 300);
    await fire(g, 'meteor', [x, y]);
    await burst(g, 'meteor-fall', 900, 4, 450);
    await burst(g, 'meteor-impact', 0, 6, 160);
    await burst(g, 'meteor-after', 1500, 2, 2500);
  },
  async fireline(g) {
    const { hq } = g; const x = hq.x + 40, y = hq.y + 46;
    await g.range(3); await g.centre(x + 28, y + 6); await g.step(4, 300);
    await fire(g, 'fireline', [x, y], [x + 60, y + 14]);
    await burst(g, 'fireline', 300, 5, 450);
    await burst(g, 'fireline-later', 2000, 1, 100);
  },
  async shield(g) {
    const { hq } = g; const x = hq.x + 80, y = hq.y + 40;
    await g.cmd({ t: 'dev.wind', dir: 0, strength: 2 });
    await g.range(3); await g.centre(x, y); await g.step(4, 300);
    await fire(g, 'shield', [x, y]);
    await g.page.waitForTimeout(900);
    // a grass fire upwind, driven at the dome
    for (let k = -30; k <= 30; k += 3) await g.cmd({ t: 'dev.ignite', x: x - 40, y: y + k, r: 2 });
    await burst(g, 'shield', 600, 5, 1200);
  },
  async frost(g) {
    const { hq } = g; const px = hq.x + 64, py = hq.y - 6;
    await g.cmd({ t: 'dev.paint', x: px, y: py, r: 12, mat: 'shallow' });
    await wild(g, [[px - 3, py], [px + 4, py + 3]]);
    await g.range(4); await g.centre(px, py); await g.step(22, 300);
    await fire(g, 'frost', [px, py]);
    await burst(g, 'frost', 500, 4, 250);
  },
  async ridge(g) {
    const { hq } = g; const x = hq.x + 40, y = hq.y + 50;
    await g.range(3); await g.centre(x + 25, y); await g.step(4, 300);
    await fire(g, 'ridge', [x, y], [x + 55, y - 10]);
    await burst(g, 'ridge', 500, 3, 500);
    await g.step(1300, 600);
    await burst(g, 'ridge-crumble', 300, 3, 900);
  },
  async rain(g) {
    const { hq } = g; const x = hq.x + 80, y = hq.y + 40;
    await g.cmd({ t: 'dev.ignite', x, y, r: 12 });
    await g.range(2); await g.centre(x, y); await g.step(60, 400);
    await fire(g, 'rain', [x, y]);
    await burst(g, 'rain', 1800, 4, 1200);
  },
  async mend(g) {
    const { hq } = g; const x = hq.x + 70, y = hq.y + 30;
    await g.cmd({ t: 'dev.ignite', x, y, r: 8 }); await g.step(400, 300);
    await g.range(3); await g.centre(x, y); await g.step(4, 300);
    await fire(g, 'mend', [x, y]);
    await burst(g, 'mend', 500, 3, 400);
  },
  async flare(g) {
    const { hq } = g; const x = hq.x + 90, y = hq.y + 60;
    await g.page.evaluate(() => window.gameEye.act('hour', 23)); await g.step(25, 500);
    await g.range(2); await g.centre(x - 20, y - 20); await g.step(4, 300);
    await fire(g, 'flare', [x, y]);
    await burst(g, 'flare', 900, 4, 700);
  },
  async board(g) {
    await openBoard(g); await g.page.waitForTimeout(300);
    await g.page.screenshot({ path: `${out}${g.name}-board.png` });
    await g.page.click('.sb-cart[data-spell=meteor]'); await g.page.waitForTimeout(700);
    await g.page.screenshot({ path: `${out}${g.name}-board-armed.png` });
    if (g.phone) { await g.page.click('.drawer-close'); await g.page.tap('.handle[data-page=more]'); } else await g.page.click('.drawer-close');
    await g.page.click('.bay-tab[data-group=arcane]'); await g.page.click('.bay-slot[data-slot=gauge]'); await g.page.waitForTimeout(600);
    await g.page.screenshot({ path: `${out}${g.name}-gauge.png` });
  },
};

const sizes = [['desktop', 1280, 800, false], ['phone', 402, 780, true]];
for (const [name, w, h, phone] of sizes) {
  if (onlySize && onlySize !== name) continue;
  for (const [scene, run] of Object.entries(SCENES)) {
    if (onlyScene && onlyScene !== scene) continue;
    if (phone && !['board', 'lightning', 'meteor', 'shield'].includes(scene) && !onlyScene) continue;
    const g = await fresh(name, w, h, phone);
    try { await run(g); } catch (e) { bad++; console.log(`[${name}/${scene}] ${e.message}`); }
    await g.ctx.close();
  }
}
await browser.close();
console.log(bad ? `${bad} problems` : 'no console errors');
