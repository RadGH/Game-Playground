// Spell Kit: phase strips for every visual — one sheet per spell (shots/<id>.png) with a frame at each phase's
// best moment, plus shots/best/<id>.webp (the single most impressive frame) and shots/contact.png (all best frames).
// Time is stepped by hand (60 steps a second), so the frames are the same however slow the browser is.
//   node avatar-3d/spellkit/tools/shots.mjs [visual…]      (dev server on 8401; ONE browser run at a time)
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'shots');
const TMP = join(process.env.SHOTS_TMP || tmpdir(), 'spellkit-frames');
const URL_ = process.env.LAB_URL || 'http://localhost:8401/avatar-3d/spellkit/index.html';

// camera per kind: [position, look-at]
const CAM = {
  side: [[-5.6, 2.5, 3.4], [0, 1.1, 3.9]],
  ground: [[-3.6, 5.0, -3.4], [0.3, 0.4, 6.4]],
  self: [[-2.4, 2.0, 3.4], [0, 1.0, 0.2]],
  melee: [[-3.4, 1.9, 1.6], [0, 1.1, 1.0]],
  aura: [[-2.0, 1.8, 4.7], [0, 1.0, 7.5]],
};
// [phase, seconds after it starts, label] per kind; 'best' marks the frame for the contact sheet
const PLAN = {
  missile: { cam: 'side', marks: [['windup', 0.6, 'Wind-up'], ['release', 0.04, 'Release'], ['travel', 0.18, 'Travel'], ['impact', 0.08, 'Impact', 'best'], ['impact', 0.45, 'After']] },
  ground: { cam: 'ground', marks: [['windup', 0.6, 'Wind-up'], ['release', 0.05, 'Release'], ['travel', 0.3, 'Travel'], ['impact', 0.1, 'Impact'], ['linger', 1.6, 'Ground', 'best'], ['linger', 3.5, 'Later']] },
  line: { cam: 'ground', marks: [['windup', 0.5, 'Wind-up'], ['linger', 0.5, 'Starts'], ['linger', 2.0, 'Burning', 'best']] },
  summon: { cam: 'ground', marks: [['windup', 0.6, 'Wind-up'], ['linger', 0.5, 'Circle'], ['linger', 1.68, 'Arrival', 'best'], ['linger', 2.6, 'After']] },
  nova: { cam: 'self', marks: [['windup', 0.4, 'Wind-up'], ['impact', 0.1, 'Burst', 'best'], ['impact', 0.35, 'Spread'], ['impact', 1.6, 'After']] },
  beam: { cam: 'side', marks: [['windup', 0.5, 'Wind-up'], ['beam', 0.12, 'First jump'], ['beam', 0.3, 'Chain', 'best'], ['beam', 0.6, 'Fading']] },
  cone: { cam: 'side', marks: [['windup', 0.3, 'Wind-up'], ['impact', 0.2, 'Spray'], ['impact', 0.45, 'Full', 'best']] },
  melee: { cam: 'melee', marks: [['sweep', 0.12, 'Swing'], ['sweep', 0.22, 'Swing'], ['impact', 0.05, 'Hit', 'best'], ['impact', 0.25, 'After']] },
  self: { cam: 'self', marks: [['windup', 0.5, 'Wind-up'], ['impact', 0.15, 'Burst', 'best'], ['impact', 0.6, 'Rising'], ['aura', 1.2, 'On body']] },
  shift: { cam: 'self', marks: [['impact', 0.06, 'Puff', 'best'], ['impact', 0.3, 'Spread'], ['impact', 0.8, 'Settles']] },
  aura: { cam: 'aura', aura: true, marks: [['aura', 0.6, 'Starts'], ['aura', 1.6, 'Looping', 'best']] },
};

const want = process.argv.slice(2);
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
mkdirSync(join(OUT, 'best'), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL_, { waitUntil: 'load' });
await page.waitForFunction(() => window.__lab?.ready, null, { timeout: 180000 });
await page.waitForTimeout(600);
// the stage only: hide the side panel so the canvas fills the frame
await page.addStyleTag({ content: '.sl-side,.sl-top,.sl-hud{display:none!important}.sl-main{display:block!important;height:100vh!important}.sl-stage-wrap{height:100vh!important}' });
await page.waitForTimeout(300);
await page.evaluate(() => window.__lab.manual(true));
const ids = await page.evaluate(() => Object.keys(window.__lab.kit.visuals).filter(id => id !== 'generic'));
const sheets = [];
for (const id of ids) {
  if (want.length && !want.includes(id)) continue;
  const kind = await page.evaluate(i => window.__lab.kit.visuals[i].kind, id);
  const plan = PLAN[kind] || PLAN.missile;
  await page.evaluate(([cam]) => { window.__lab.kit.clear(); window.__lab.view(...cam); window.__lab.advance(0.2); }, [CAM[plan.cam]]);
  if (plan.aura) await page.evaluate(i => { const L = window.__lab; L.pick(i); L.events = [{ phase: 'aura', t: L.kit.time }]; L.kit.aura(L.dummies[0], i); }, id);
  else await page.evaluate(i => window.__lab.begin(i), id);
  const frames = [];
  let n = 0;
  const has = await page.evaluate(i => { const d = window.__lab.kit.visuals[i]; return { windup: !!d.windup, release: !!(d.windup || d.release), travel: !!d.travel, impact: !!d.impact, linger: !!d.linger, beam: !!d.beam, sweep: !!d.sweep, aura: !!d.aura }; }, id);
  const marks = plan.marks.filter(m => has[m[0]]);
  if (!marks.some(m => m[3])) marks[marks.length - 1] = [...marks[marks.length - 1].slice(0, 3), 'best'];
  for (const [ph, extra, label, best] of marks) {
    const ok = await page.evaluate(async ([ph, extra]) => {
      const L = window.__lab;
      for (let k = 0; k < 900 && !L.events.some(e => e.phase === ph); k++) { L.advance(1 / 60); if (k % 20 === 0) await new Promise(r => setTimeout(r, 0)); }
      const ev = L.events.find(e => e.phase === ph);
      if (!ev) return false;
      const left = ev.t + extra - L.kit.time;
      if (left > 0) L.advance(left);
      return true;
    }, [ph, extra]);
    if (!ok) continue;
    if (process.env.SHOTS_DEBUG) console.log(id, label, JSON.stringify(await page.evaluate(() => { const s = window.__lab.stats(); return [window.__lab.kit.time.toFixed(2), s.particles, s.draws, s.calls]; })));
    const file = join(TMP, `${id}-${n++}.png`);
    await page.screenshot({ path: file, timeout: 120000 });
    frames.push({ file, label, best: !!best });
  }
  sheets.push({ id, label: await page.evaluate(i => window.__lab.kit.visuals[i].label, id), frames });
  console.log(`${id}: ${frames.length} frames`);
}
const stats = await page.evaluate(() => window.__lab.stats());
await browser.close();
writeFileSync(join(TMP, 'sheets.json'), JSON.stringify({ sheets, out: OUT }));
const py = spawnSync('python3', [join(ROOT, 'tools', 'sheet.py'), join(TMP, 'sheets.json')], { encoding: 'utf8' });
process.stdout.write(py.stdout); process.stderr.write(py.stderr);
console.log('programs at the end:', stats.programs, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no page errors');
