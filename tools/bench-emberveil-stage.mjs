// Frame-time benchmark for the Emberveil stage (E31).
//
// Drives prototypes/emberveil/tests/bench-stage.html in a real browser: a 4 v 6 line-up with
// everything casting, healing, bursting and wearing status auras, and reports how long the frames
// took. Run it before and after a change to the effects to see what the change cost.
//
//   ./serve.sh --bg                                   # the page is served, like everything else
//   node tools/bench-emberveil-stage.mjs              # default: 6 s, 8 casts a second
//   node tools/bench-emberveil-stage.mjs --ms 12000 --rate 14
//   node tools/bench-emberveil-stage.mjs --compare    # with the particle cap, then without
//
// Numbers to watch: p95 (the slow frames are what a player feels), `over16ms` (the share of frames
// that missed 60fps) and `liveSprites` (how many trail billboards were alive at the end).
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt; };
const has = name => args.includes('--' + name);

const base = flag('url', 'http://localhost:8400');
const ms = +flag('ms', 6000), rate = +flag('rate', 8);

async function run(browser, { cap = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  const q = new URLSearchParams({ ms: String(ms), rate: String(rate) });
  if (cap !== null) q.set('cap', String(cap));
  await page.goto(`${base}/prototypes/emberveil/tests/bench-stage.html?${q}`);
  await page.bringToFront();
  await page.waitForFunction('document.body.dataset.done === "1"', null, { timeout: ms + 60000 });
  const out = await page.evaluate(() => window.benchResult);
  await page.close();
  if (errors.length) out.pageErrors = errors.slice(0, 3);
  return out;
}

const show = (label, r) => {
  console.log(`\n── ${label} ──`);
  console.log(`  frames        ${r.frames} over ${r.ms} ms (${r.casts} casts)`);
  console.log(`  average       ${r.avgFrameMs} ms  (${r.fps} fps)`);
  console.log(`  p50 / p95     ${r.p50} ms / ${r.p95} ms      worst ${r.worst} ms`);
  console.log(`  missed 60fps  ${r.over16ms}% of frames`);
  console.log(`  live sprites  ${r.liveSprites} (pool ${r.pooled}) · effects ${r.effects} · auras ${r.auras} · dropped ${r.dropped}`);
  console.log(`  draw calls    ${r.drawCalls} · triangles ${r.triangles} · particle cap ${r.cap}`);
  if (r.pageErrors) console.log(`  page errors   ${r.pageErrors.join(' | ')}`);
};

// Headless Chromium throttles timers and rAF on a page it thinks nobody is looking at, which makes
// a frame-time benchmark meaningless. These switches keep it running at full speed.
const browser = await chromium.launch({ args: [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-frame-rate-limit',
] });
try {
  if (has('compare')) {
    const capped = await run(browser, { cap: 320 });
    const uncapped = await run(browser, { cap: 0 });
    show('with the particle cap (320)', capped);
    show('with no cap', uncapped);
    const d = (a, b) => `${a > b ? '+' : ''}${(a - b).toFixed(2)}`;
    console.log(`\n  p95 difference: ${d(uncapped.p95, capped.p95)} ms without the cap, ${uncapped.liveSprites - capped.liveSprites} more live sprites`);
  } else {
    show(`4 v 6, ${rate} casts/s`, await run(browser));
  }
} finally {
  await browser.close();
}
