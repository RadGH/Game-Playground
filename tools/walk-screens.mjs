#!/usr/bin/env node
// Walk every screen of a game on a desktop and a phone, and fail on what the owner keeps reporting
// (docs/lessons-from-games.md Part 4 checks 1, 3, 4): long decimals, NaN, code names, browser tooltips, a scroller
// inside a scroller, a page wider than the phone, console errors, browser popups. Screenshots of every screen.
//   node tools/walk-screens.mjs <game> [--base http://host:port] [--shots dir] [--only desktop|phone]
// Each game describes its own screens in prototypes/<game>/tests/walk.mjs:
//   export default {
//     path: 'prototypes/<game>/',             // page to open, relative to the base
//     base: 'http://localhost:8581',          // optional: games with their own dev server (default: playground dev 8401)
//     allow: ['N/A'],                         // optional: exact texts that are fine
//     ignoreErrors: [/ResizeObserver/],       // optional: console errors that are not ours
//     ready: async (page, ctx) => {},         // wait until the first screen is drawn (ctx = { phone, w, h })
//     screens: [{ name: 'title' }, { name: 'map', open: async (page, ctx) => {}, close: async (page, ctx) => {} }],
//   };
// A screen with no `open` checks whatever is showing. `close` should bring the game back to where the next screen
// expects to start. Runs by tools/publish-stable.sh for every game that changed (tools/prepublish-check.sh).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { screenTextProblems } from '../shared/test/screen-text.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const game = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!game) { console.error('usage: node tools/walk-screens.mjs <game> [--base URL] [--shots dir] [--only desktop|phone]'); process.exit(2); }
const name = game.replace(/\/$/, '').split('/').pop();
const cfg = (await import(pathToFileURL(join(ROOT, 'prototypes', name, 'tests', 'walk.mjs')).href)).default;
const BASE = (flag('--base') || cfg.base || 'http://localhost:8401').replace(/\/$/, '');
const SHOTS = resolve(flag('--shots', join(ROOT, 'test-results', 'walk', name)));
mkdirSync(SHOTS, { recursive: true });
const only = flag('--only');
const VIEWS = [{ id: 'desktop', w: 1280, h: 800, phone: false }, { id: 'phone', w: 390, h: 844, phone: true }].filter(v => !only || v.id === only);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let failures = 0;
const lines = [];
for (const v of VIEWS) {
  const ctx = { phone: v.phone, w: v.w, h: v.h, view: v.id };
  const bc = await browser.newContext({ viewport: { width: v.w, height: v.h }, isMobile: v.phone, hasTouch: v.phone, deviceScaleFactor: v.phone ? 2 : 1, ignoreHTTPSErrors: true });
  const page = await bc.newPage();
  const errs = [];
  const ignored = m => (cfg.ignoreErrors || []).some(re => re.test(m));
  page.on('pageerror', e => { if (!ignored(e.message)) errs.push('page error: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && !ignored(m.text()) && !/Failed to load resource|favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  page.on('dialog', d => { errs.push('BROWSER POPUP: ' + d.message()); d.dismiss().catch(() => {}); });
  const report = (screen, problems) => {
    failures += problems.length;
    lines.push(`${v.id.padEnd(7)} ${screen.padEnd(14)} ${problems.length ? 'PROBLEMS\n' + problems.map(p => '          - ' + p).join('\n') : 'ok'}`);
    process.stderr.write(lines[lines.length - 1] + '\n');   // as it goes, so a stuck screen does not hide the rest
  };
  try {
    await page.goto(`${BASE}/${cfg.path.replace(/^\//, '')}`, { waitUntil: 'domcontentloaded' });
    await (cfg.ready ? cfg.ready(page, ctx) : page.waitForLoadState('load'));
  } catch (e) { report('(load)', ['could not load: ' + e.message.split('\n')[0], ...errs.splice(0)]); await bc.close(); continue; }
  for (const s of cfg.screens) {
    const problems = [];
    try {
      if (s.open) await s.open(page, ctx);
      await page.waitForTimeout(s.settle ?? 400);
      const bad = await page.evaluate(screenTextProblems, { allow: [...(cfg.allow || []), ...(s.allow || [])] });
      for (const b of bad) problems.push(`${b.what}: ${b.text}`);
      await page.screenshot({ path: join(SHOTS, `${v.id}-${s.name}.png`) });
      if (s.close) await s.close(page, ctx);
    } catch (e) { problems.push('step failed: ' + e.message.split('\n')[0]); await page.screenshot({ path: join(SHOTS, `${v.id}-${s.name}-FAILED.png`) }).catch(() => {}); }
    problems.push(...errs.splice(0));
    report(s.name, problems);
  }
  await bc.close();
}
await browser.close();
console.log(`walk ${name} @ ${BASE}\n` + lines.join('\n') + `\nscreenshots: ${SHOTS}\n${failures ? `${failures} problem(s)` : 'all screens clean'}`);
process.exit(failures ? 1 : 0);
