#!/usr/bin/env node
// Walk every screen of a game on a desktop and a phone, and fail on what the owner keeps reporting
// (docs/lessons-from-games.md Part 4 checks 1, 3, 4): long decimals, NaN, code names, browser tooltips, a scroller
// inside a scroller, a page wider than the phone, console errors, browser popups. Screenshots of every screen.
//   node tools/walk-screens.mjs <game> [--base http://host:port] [--shots dir] [--only desktop|phone] [--screens title,map]
// Each game describes its own screens in prototypes/<game>/tests/walk.mjs:
//   export default {
//     path: 'prototypes/<game>/',             // page to open, relative to the base
//     base: 'http://localhost:8581',          // optional: games with their own dev server (default: playground dev 8401)
//     allow: ['N/A'],                         // optional: exact texts that are fine
//     ignoreErrors: [/ResizeObserver/],       // optional: console errors that are not ours
//     views: ['desktop'],                     // optional: only these views (a desktop-only game, by owner ruling)
//     ready: async (page, ctx) => {},         // wait until the first screen is drawn (ctx = { phone, w, h })
//     screens: [{ name: 'title' }, { name: 'map', open: async (page, ctx) => {}, close: async (page, ctx) => {} }],
//     strict: true,                           // NEW GAMES (from 2026-11-15): also readability + controls checks, below
//   };
// strict (every game started from 2026-11-15 on; older games are not held to it — owner 2026-11-15; `--strict` tries it
// on any game without failing it): shared/test/screen-look.js on every screen — text under 12px, contrast under 3:1,
// texts on top of each other, text cut off by the window — plus two per-screen checks a play screen should use:
//     input: ['KeyD:800', 'Space', 'wait:300', 'click:#btn'] or async (page, ctx) => {}   controls do something: the
//            screen is shot, left alone as long as the input takes, shot, then the input is played and shot again; it
//            fails when the input changed (almost) nothing on screen — the game ignores its own controls or froze.
//     live: true                                 the screen moves by itself (a game running): fails when nothing at
//            all changes in 1.5 s — a frozen screen.
// A screen with no `open` checks whatever is showing. `close` should bring the game back to where the next screen
// expects to start. Runs by tools/publish-stable.sh for every game that changed (tools/prepublish-check.sh).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { screenTextProblems } from '../shared/test/screen-text.js';
import { screenLookProblems, pixelChange } from '../shared/test/screen-look.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const game = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!game) { console.error('usage: node tools/walk-screens.mjs <game> [--base URL] [--shots dir] [--only desktop|phone]'); process.exit(2); }
const name = game.replace(/\/$/, '').split('/').pop();
const cfg = (await import(pathToFileURL(flag('--config') ? resolve(flag('--config')) : join(ROOT, 'prototypes', name, 'tests', 'walk.mjs')).href)).default;   // --config: another walk file (tests of this tool)
const BASE = (flag('--base') || cfg.base || 'http://localhost:8401').replace(/\/$/, '');
const SHOTS = resolve(flag('--shots', join(ROOT, 'test-results', 'walk', name)));
mkdirSync(SHOTS, { recursive: true });
const only = flag('--only');
const pick = flag('--screens') ? new Set(flag('--screens').split(',')) : null;   // --screens a,b: only these (while working on them; publishing walks all)
const TRY_STRICT = args.includes('--strict') && !cfg.strict;   // trial run on an older game: report, never fail
const STRICT = !!cfg.strict || TRY_STRICT;
// phone = what an iPhone browser leaves for the page with its bars showing (390×664), not the whole 844-tall screen:
// Wyrmroad's creator passed at 844 and its Set off button was out of reach on Radley's iPhone (2026-11-21).
// cfg.views: a game the owner ruled desktop-only (Hullforge, 2026-11-14: "It does not need phone support") lists ['desktop']
const VIEWS = [{ id: 'desktop', w: 1280, h: 800, phone: false }, { id: 'phone', w: 390, h: 664, phone: true }].filter(v => (!only || v.id === only) && (!cfg.views || cfg.views.includes(v.id)));

// one browser per view (2026-11-18): desktop and phone sharing one software-graphics process for a long walk ran it
// out of room on a big game (Overdrive Frame) — a real device only ever runs one view.
const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
let browser = null;
let failures = 0;
const lines = [];
const notes = [];                                       // --strict trial findings (do not fail)
for (const v of VIEWS) {
  const ctx = { phone: v.phone, w: v.w, h: v.h, view: v.id };
  await browser?.close(); browser = await launch();
  const bc = await browser.newContext({ viewport: { width: v.w, height: v.h }, isMobile: v.phone, hasTouch: v.phone, deviceScaleFactor: v.phone ? 2 : 1, ignoreHTTPSErrors: true });
  const page = await bc.newPage();
  const cmp = await bc.newPage();                       // compares screenshots for the input / live checks
  const shot = async () => (await page.screenshot()).toString('base64');
  const change = async (a, b) => cmp.evaluate(pixelChange, { a, b });
  const play = async (input) => {
    if (typeof input === 'function') return input(page, ctx);
    for (const step of input) {
      const [k, arg] = step.split(/:(.*)/s);
      if (k === 'wait') await page.waitForTimeout(+arg);
      else if (k === 'click') await page.click(arg);
      else if (arg) { await page.keyboard.down(k); await page.waitForTimeout(+arg); await page.keyboard.up(k); }
      else await page.keyboard.press(k);
    }
  };
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
    if (pick && !pick.has(s.name)) continue;
    const problems = [];
    try {
      if (s.open) await s.open(page, ctx);
      await page.waitForTimeout(s.settle ?? 400);
      const bad = await page.evaluate(screenTextProblems, { allow: [...(cfg.allow || []), ...(s.allow || [])] });
      for (const b of bad) problems.push(`${b.what}: ${b.text}`);
      const soft = [];                                  // strict findings: problems for strict games, notes on a --strict trial
      if (STRICT) {
        for (const b of await page.evaluate(screenLookProblems, cfg.look || {})) soft.push(`${b.what}: ${b.text}`);
        if (s.live) {
          // a live screen must move. Look twice: one long task (a picture baking in software graphics on this VM) can
          // stall a frame for over a second; a dead screen is still dead on the second look
          let moved = false;
          for (let look = 0; look < 2 && !moved; look++) { const a = await shot(); await page.waitForTimeout(1500); moved = (await change(a, await shot())) >= 0.0005; }
          if (!moved) soft.push(`frozen: nothing on screen moved in 1.5 s (looked twice)`);
        }
        if (s.input && !(ctx.phone && s.input && s.inputPhone === false)) {
          const input = (ctx.phone && s.inputPhone) || s.input;
          const t0 = Date.now(); const a = await shot(); await play(input); const took = Date.now() - t0; const b = await shot();
          const active = await change(a, b);
          await page.waitForTimeout(Math.min(took, 3000)); const idle = await change(b, await shot());
          if (active < 0.002) soft.push(`controls do nothing: the input changed ${(active * 100).toFixed(2)}% of the screen`);
          else if (idle > 0.002 && active < idle * 0.5) soft.push(`controls do little: the input changed ${(active * 100).toFixed(1)}% of the screen, waiting alone ${(idle * 100).toFixed(1)}%`);
        }
      }
      if (TRY_STRICT) soft.forEach(t => notes.push(`${v.id} ${s.name}: ${t}`)); else problems.push(...soft);
      await page.screenshot({ path: join(SHOTS, `${v.id}-${s.name}.png`) });
      if (s.close) await s.close(page, ctx);
    } catch (e) { problems.push('step failed: ' + e.message.split('\n')[0]); await page.screenshot({ path: join(SHOTS, `${v.id}-${s.name}-FAILED.png`) }).catch(() => {}); }
    problems.push(...errs.splice(0));
    report(s.name, problems);
  }
  await bc.close();
}
await browser?.close();
console.log(`walk ${name} @ ${BASE}${STRICT ? (TRY_STRICT ? ' (strict trial)' : ' (strict)') : ''}\n` + lines.join('\n') + (notes.length ? `\nstrict trial — would fail a new game:\n` + notes.map(n => '  - ' + n).join('\n') : '') + `\nscreenshots: ${SHOTS}\n${failures ? `${failures} problem(s)` : 'all screens clean'}`);
process.exit(failures ? 1 : 0);
