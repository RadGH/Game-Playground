#!/usr/bin/env node
// Stream G2 (play-test 10) — the PHONE GO-OVER: the real game, a real server, an iPhone-sized touch browser, every window
// that landed in rounds 8 / 9 / 10 opened on it, measured and photographed. Not a pass/fail spec: it writes a report
// (tests/G/shots/goover-<engine>/report.json) and pictures to LOOK at, and prints one line per finding.
//
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node prototypes/thousandvale/tests/G/phone-goover.mjs [chromium|webkit]
//
// WebKit is the closest thing on this machine to the owner's Safari. It needs four libraries Ubuntu does not ship with
// Playwright's build (libevent, libavif, libgav1, libyuv) — installing them needs sudo, so they are unpacked from their
// .deb files into ~/.cache/ms-playwright/webkit-extra-libs and handed over by LD_LIBRARY_PATH:
//   LD_LIBRARY_PATH=$HOME/.cache/ms-playwright/webkit-extra-libs/usr/lib/x86_64-linux-gnu PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node … webkit
//
// What it measures in each state: every control you can press that is the top thing at its own middle — smaller than
// 44 x 44, or off the screen; a window wider than the screen or scrolling sideways; text reading undefined / NaN /
// [object; and whether a window's title bar can be DRAGGED (it must not move on a phone).
// What it cannot measure: the real phone's safe-area insets (env() is 0 in any emulation — the gallery's frames carry
// the iPhone 15 Pro's numbers instead, tests/G/gallery.spec.js) and its frame rate.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as PW from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = process.argv[2] === 'webkit' ? 'webkit' : 'chromium';
const OUT = join(HERE, 'shots', 'goover-' + ENGINE);
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const NAME = 'Pocketwren';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// the screen as the page sees it: full (added to the home screen) and with Safari's bars
const SIZES = { p: { width: 393, height: 852 }, l: { width: 852, height: 393 }, 'p-safari': { width: 393, height: 659 }, 'l-safari': { width: 734, height: 343 } };

const report = { engine: ENGINE, at: new Date().toISOString(), facts: {}, states: [], findings: [], errors: [] };
const finding = (where, what) => { report.findings.push({ where, what }); console.log(`[${ENGINE}] FINDING ${where}: ${what}`); };
let n = 0, page, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, err: e.message }));

/** In the page: what is wrong on screen right now. */
function audit() {
  const SEL = 'button, a[href], input, select, textarea, [role="tab"], [role="radio"], [role="button"], [role="menuitem"], .islot:not(.empty), .pmember, .slot:not(.empty), .loot-row, .interact, .shop-row';
  const vw = innerWidth, vh = innerHeight, small = [], off = [];
  const scrolls = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if ((/auto|scroll/.test(c.overflowY) && p.scrollHeight > p.clientHeight + 2) || (/auto|scroll/.test(c.overflowX) && p.scrollWidth > p.clientWidth + 2)) return true; } return false; };
  const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '')) + (e.textContent ? ` "${e.textContent.trim().slice(0, 20)}"` : '');
  let count = 0;
  for (const el0 of document.querySelectorAll(SEL)) {
    if (el0.closest('[hidden], [aria-hidden="true"]') || el0.disabled) continue;
    let el = el0; if (el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')) el = el.closest('label');
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || +cs.opacity === 0) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    const cx = Math.max(0, Math.min(vw - 1, r.left + r.width / 2)), cy = Math.max(0, Math.min(vh - 1, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    if (!top || !(el.contains(top) || (top.contains(el) && top.matches(SEL)))) continue;
    count++;
    if (r.width < 43.5 || r.height < 43.5) small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (!scrolls(el) && (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1)) off.push(`${name(el)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`);
  }
  const wide = [];
  for (const p of document.querySelectorAll('.tv-panel:not([hidden]), #bag:not([hidden]), .tv-prof:not([hidden]) .prof-game, .tv-confirm, .cl-pop, .tv-changelog:not([hidden]), .phone-sheet:not([hidden]) .ps-card')) {
    const r = p.getBoundingClientRect(); if (r.width < 1) continue;
    if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) wide.push(`${p.id || p.className} box [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}] on ${vw}x${vh}`);
    for (const c of [p, ...p.querySelectorAll('*')]) { if (c.scrollWidth > c.clientWidth + 6 && /auto|scroll/.test(getComputedStyle(c).overflowX) && c.clientWidth > 60 && !c.matches('.chips, .bag-filters, .inv-filters, .map-view, canvas')) { wide.push(`${p.id || p.className}: ${c.className || c.tagName} scrolls sideways (${c.scrollWidth} in ${c.clientWidth})`); break; } }
  }
  const bad = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) { const s = t.nodeValue; if (!/undefined|\[object |NaN\b|\d\.\d{5,}/.test(s)) continue; const e = t.parentElement; if (!e || e.closest('[hidden], script, style, #perf, .perf') || !e.getClientRects().length) continue; bad.push(s.trim().slice(0, 60)); }
  return { count, small, off, wide, bad, doc: document.documentElement.scrollWidth > vw + 2 ? `the page itself is ${document.documentElement.scrollWidth} wide on ${vw}` : '' };
}
async function state(label, { dragSel = null } = {}) {
  n++;
  const file = `${String(n).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: join(OUT, file) }).catch(e => report.errors.push('shot ' + label + ': ' + e.message));
  const a = await page.evaluate(audit).catch(e => ({ err: e.message, small: [], off: [], wide: [], bad: [] }));
  let drag = null;
  if (dragSel) {
    drag = await page.evaluate(async sel => {
      const head = document.querySelector(sel); if (!head) return null;
      const panel = head.closest('.tv-panel') || head.parentElement, r0 = panel.getBoundingClientRect(), hr = head.getBoundingClientRect();
      const o = (x, y) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 77, pointerType: 'touch', isPrimary: true, buttons: 1 });
      const x = hr.left + Math.min(60, hr.width / 3), y = hr.top + hr.height / 2;
      head.dispatchEvent(new PointerEvent('pointerdown', o(x, y)));
      for (let i = 1; i <= 6; i++) (i % 2 ? head : window).dispatchEvent(new PointerEvent('pointermove', o(x + i * 14, y + i * 12)));
      window.dispatchEvent(new PointerEvent('pointerup', o(x + 84, y + 72)));
      await new Promise(r => setTimeout(r, 120));
      const r1 = panel.getBoundingClientRect();
      return Math.round(Math.hypot(r1.left - r0.left, r1.top - r0.top));
    }, dragSel).catch(() => null);
    if (drag) finding(label, `the window MOVED ${drag} px when its title bar was dragged`);
  }
  for (const s of a.small) finding(label, 'under 44 px: ' + s);
  for (const s of a.off) finding(label, 'off the screen: ' + s);
  for (const s of a.wide) finding(label, s);
  for (const s of a.bad) finding(label, 'text: ' + s);
  if (a.doc) finding(label, a.doc);
  if (a.err) report.errors.push(label + ': ' + a.err);
  report.states.push({ label, file, controls: a.count, small: a.small.length, off: a.off.length, wide: a.wide.length, bad: a.bad.length, drag });
  console.log(`[${ENGINE}] ${file}  controls ${a.count}  small ${a.small.length}  off ${a.off.length}  wide ${a.wide.length}`);
}
const tapSel = async (sel, t = 8000) => { const l = page.locator(sel).first(); await l.waitFor({ state: 'visible', timeout: t }); await l.tap(); };
const closeAll = async () => { await page.evaluate(() => { for (let i = 0; i < 4; i++) for (const x of document.querySelectorAll('.tv-panel:not([hidden]) .tvp-x, #bag:not([hidden]) #bag-close, .ph-explain:not([hidden]) button, .ph-hint:not([hidden]) button, .cl-x')) x.click(); window.tvui10?.changelog?.close?.(); window.tvprof?.mini?.cancel?.(); window.tvinput?.touch?.closeSheet?.(); }); await sleep(350); };
async function step(label, fn) { try { await fn(); } catch (e) { report.errors.push(`${label}: ${String(e.message).split('\n')[0]}`); console.log(`[${ENGINE}] STEP FAILED ${label}: ${String(e.message).split('\n')[0]}`); await page.screenshot({ path: join(OUT, `zz-failed-${label}.png`) }).catch(() => {}); await closeAll().catch(() => {}); } }

const port = await freePort(), hk = await freePort();
const srv = spawn(process.execPath, [join(HERE, '..', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; srv.stderr.on('data', d => { out += d; });
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start:\n' + out)), 40000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('server exited ' + c + '\n' + out))); });
const base = `http://127.0.0.1:${port}/prototypes/thousandvale/`; hookBase = `http://127.0.0.1:${hk}`;
const browser = await PW[ENGINE].launch();
let ctx;
try {
  ctx = await browser.newContext({ viewport: SIZES.p, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: UA });
  page = await ctx.newPage();
  page.on('pageerror', e => { report.errors.push('pageerror: ' + e.message); console.log(`[${ENGINE}] PAGE ERROR ${e.message}`); });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) report.errors.push('console: ' + m.text().slice(0, 200)); });

  await page.goto(base + '?fresh=1&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 300000 });
  report.facts = await page.evaluate(() => { const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); return { ua: navigator.userAgent, layout: document.documentElement.dataset.layout || 'desktop', viewport: document.querySelector('meta[name="viewport"]').content, webgl: gl ? gl.getParameter(gl.VERSION) : null, coarse: matchMedia('(pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints, safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top') }; });
  console.log(`[${ENGINE}] facts`, JSON.stringify(report.facts));
  if (report.facts.layout !== 'phone') finding('boot', 'the phone layout did not choose itself');

  await step('title', async () => {
    await sleep(1500); await state('title-front');
    await tapSel('#title-changelog').then(async () => { await sleep(900); await state('title-changelog'); await closeAll(); }).catch(() => report.errors.push('no changelog button on the title'));
    await page.evaluate(() => { for (const x of document.querySelectorAll('.cl-pop button, .tv-changelog .tvp-x, .changelog .tvp-x, [data-act="cl-close"]')) x.click(); });
    await tapSel('#new-char'); await sleep(600);
    report.facts.starcaller = await page.locator('#classes [data-cls="starcaller"]').count() > 0;
    await state('title-new');
    await page.locator('#name').tap(); await page.locator('#name').fill(NAME);
    await tapSel('#calling-open'); await sleep(500);      // feedback #98: the calling picker
    await tapSel(report.facts.starcaller ? '#classes [data-cls="starcaller"]' : '#classes [data-cls="cleric"]'); await sleep(500);
    await state('title-calling');
    await tapSel('#calling-done'); await sleep(300);
    await tapSel('#enter');
    await page.locator('#panel-appearance').waitFor({ state: 'visible', timeout: 20000 }); await sleep(1500);
    await state('appearance');
    await tapSel('#panel-appearance [data-act="save"]');
    await page.waitForFunction(() => tvui5.state().kits.open || thousandvale.S.phase !== 'title', null, { timeout: 30000 });
    if (await page.evaluate(() => tvui5.state().kits.open)) { await sleep(1200); await state('equipment'); await tapSel('#panel-kits [data-act="create"]'); }
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 180000 });
    await sleep(4000);
  });
  await hook('/level', { name: NAME, level: 12 });
  await hook('/give', { name: NAME, items: 1, itemName: 'Angling Rod', kind: 'rod', id: 'angling_rod', rarity: 'common' });
  await hook('/roll', { name: NAME, n: 10, level: 10, boost: 2 });
  await sleep(1500);
  report.facts.bagMax = await page.evaluate(() => thousandvale.S.net?.joined?.you?.bagMax ?? thousandvale.bag?.state?.max ?? null).catch(() => null);

  for (const key of ['p', 'p-safari', 'l', 'l-safari']) {
    await page.setViewportSize(SIZES[key]); await sleep(1800);
    const L = k => `${key}-${k}`;
    await step(L('hud'), async () => { await closeAll(); await state(L('hud')); });
    if (key === 'p' || key === 'l') {
      await step(L('buttons'), async () => { await page.evaluate(() => tvinput.touch.explain()); await sleep(400); await state(L('what-the-buttons-do')); await closeAll(); });
      await step(L('wheel'), async () => { await tapSel('.ph-wheel'); await sleep(300); await state(L('wheel')); await page.locator('.tv-radial .rd-hub').tap(); await sleep(200); await page.locator('.tv-radial .rd-hub').tap(); await sleep(250); await state(L('wheel-emotes')); await page.evaluate(() => tvinput.radial.close()); });
      await step(L('bag'), async () => { await page.evaluate(() => thousandvale.bag.toggle(true)); await sleep(2200); await state(L('bag'), { dragSel: '#bag .bag-head, #bag header' }); await closeAll(); });
      await step(L('sheet'), async () => { await page.evaluate(() => thousandvale.ui5.panels.sheet.open()); await sleep(1200); await state(L('character'), { dragSel: '#panel-sheet .tvp-head' }); await page.evaluate(() => { const s = document.querySelector('#panel-sheet .tvp-body, #panel-sheet'); s.scrollTop = s.scrollHeight; for (const e of document.querySelectorAll('#panel-sheet *')) if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = e.scrollHeight; }); await sleep(400); await state(L('character-professions')); await closeAll(); });
      await step(L('journal-prof'), async () => { await page.evaluate(() => thousandvale.ui.panels.journal.open()); await sleep(900); await tapSel('#panel-journal [data-tab="professions"]'); await sleep(700); await state(L('journal-professions'), { dragSel: '#panel-journal .tvp-head' }); await closeAll(); });
      await step(L('meter'), async () => { await page.evaluate(() => thousandvale.ui8.panels.meter.open()); await sleep(800); await state(L('damage-meter'), { dragSel: '#panel-meter .tvp-head' }); await closeAll(); });
      await step(L('online'), async () => { await page.evaluate(() => thousandvale.ui8.panels.online.open()); await sleep(1000); await state(L('online'), { dragSel: '#panel-online .tvp-head' }); await closeAll(); });
      await step(L('cart'), async () => { await page.evaluate(() => thousandvale.ui8.panels.cart.open()); await sleep(1000); await state(L('ox-cart'), { dragSel: '#panel-cart .tvp-head' }); await closeAll(); });
      await step(L('feedback'), async () => { await page.evaluate(() => thousandvale.ui5.panels.feedback.open()); await sleep(800); await state(L('feedback-write')); await tapSel('#panel-feedback [data-tab="mine"]'); await sleep(1200); await state(L('feedback-my-reports'), { dragSel: '#panel-feedback .tvp-head' }); await closeAll(); });
      await step(L('changelog'), async () => { await page.evaluate(() => tvui10.changelog.open()); await sleep(1200); await state(L('changelog')); await page.evaluate(() => { tvui10.changelog.close?.(); for (const x of document.querySelectorAll('.cl-pop .tvp-x, .cl-win .tvp-x, [data-act="cl-close"]')) x.click(); }); await closeAll(); });
      await step(L('map'), async () => { await page.evaluate(() => thousandvale.ui.panels.map.open()); await sleep(3000); await state(L('map'), { dragSel: '#panel-map .tvp-head' }); await closeAll(); });
      await step(L('settings'), async () => { await page.evaluate(() => thousandvale.ui2.settings.panel.open()); await sleep(700); await tapSel('#panel-settings [data-tab="keys"]'); await tapSel('#panel-settings [data-bind="touch"]'); await sleep(400); await state(L('settings-touch'), { dragSel: '#panel-settings .tvp-head' }); await closeAll(); });
      await step(L('pause'), async () => { await page.evaluate(() => thousandvale.input.run('pause')); await sleep(700); await state(L('pause-menu')); await closeAll(); await page.evaluate(() => document.querySelector('#panel-pause:not([hidden]) .tvp-x')?.click()); });
      await step(L('minigame'), async () => {
        page.evaluate(() => window.tvprof.demo('skinning', { seed: 4 })).catch(() => {});
        await page.waitForFunction(() => window.tvprof.mini.state.state === 'ready', null, { timeout: 8000 }); await sleep(500);
        await state(L('minigame-ready'));
        const c = await page.locator('.prof-canvas').boundingBox();
        await page.touchscreen.tap(c.x + c.width * 0.3, c.y + c.height * 0.5);
        const began = await page.waitForFunction(() => window.tvprof.mini.state.state === 'play', null, { timeout: 4000 }).then(() => true, () => false);
        if (!began) finding(L('minigame'), 'a REAL tap on the canvas did not begin the game');
        await sleep(900); await state(L('minigame-playing'));
        await page.evaluate(() => window.tvprof.mini.cancel());
      });
      await step(L('fish'), async () => { await page.evaluate(() => tvinput.touch.fishHint(true)); await sleep(300); await state(L('fishing-hint')); await closeAll(); });
    }
  }
  // back upright: the things that only the title has (your characters, deleting one)
  await page.setViewportSize(SIZES.p); await sleep(1200);
  await step('logout', async () => {
    await page.evaluate(() => thousandvale.input.run('pause')); await sleep(600);
    await tapSel('#panel-pause [data-act="logout"]');
    await sleep(1500); await page.waitForFunction(() => window.thousandvale && thousandvale.S.phase === 'title' && document.querySelector('#loading')?.classList.contains('done'), null, { timeout: 240000, polling: 500 }).catch(() => {}); await sleep(2500);   // (logging out may reload the page)
    await state('title-your-characters');
    const del = page.locator('.char-del').first();
    if (await del.count()) { await del.tap(); await sleep(500); await state('title-delete-confirm'); await page.evaluate(() => document.querySelector('.char-delete button.ghost, .char-delete [data-act="cancel"]')?.click()); }
    else finding('title', 'no Delete control beside a character on the title (a guest has none? ' + (await page.evaluate(() => document.querySelector('#title')?.innerText.slice(0, 160))) + ')');
    await page.setViewportSize(SIZES.l); await sleep(1500); await state('l-title-your-characters');
  });
} catch (e) { report.errors.push('fatal: ' + e.message); console.log(`[${ENGINE}] FATAL ${e.message}`); }
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`[${ENGINE}] ${report.states.length} states, ${report.findings.length} findings, ${report.errors.length} errors -> ${OUT}/report.json`);
await ctx?.close().catch(() => {}); await browser.close().catch(() => {}); srv.kill('SIGTERM');
process.exit(0);
