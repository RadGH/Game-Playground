// Judder check (live report #35, lessons rule 28 + 51): fly at full speed and measure how evenly the ship and the
// world move on screen, frame to frame, at different screen refresh rates.
//   node prototypes/voidwright/tools/smooth-check.mjs        (from ~/claude/playground; dev server on 8401)
// The page's requestAnimationFrame is replaced by a pump with made-up timestamps, so 60 Hz, 144 Hz and uneven frame
// pacing can all be tested headless and the numbers come out the same every run. NOBLEND=1 draws the raw sim
// positions (the pre-2026-11-12 way) for a before/after comparison.
// Prints, per pacing: the mean and 95th-percentile change in on-screen speed between frames (px/s), for the ship and
// for the world scrolling past (the camera). A smooth picture has small numbers; the sim's fixed 60 Hz step drawn
// without blending shows up as big ones at 144 Hz and with uneven frames.
import { chromium } from 'playwright';

const url = process.env.URL || 'http://localhost:8401/prototypes/voidwright/';
const PACINGS = {
  '60 Hz': () => 1000 / 60,
  '144 Hz': () => 1000 / 144,
  'uneven (8-26 ms)': (i, r) => 8 + r() * 18,
};
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => {
  window.__raf = []; window.__now = 0;
  window.requestAnimationFrame = cb => { window.__raf.push(cb); return window.__raf.length; };
  window.__pump = (ms) => { window.__now += ms; const q = window.__raf; window.__raf = []; for (const cb of q) cb(window.__now); };
});
if (process.env.NOBLEND === '1') await p.addInitScript(() => { window.voidwrightNoBlend = true; });
await p.goto(url);
await p.waitForTimeout(800);
await p.evaluate(() => { for (let i = 0; i < 30; i++) window.__pump(16.7); });
await p.click('text=New game'); await p.waitForTimeout(100);
await p.click('text=Launch'); await p.waitForTimeout(300);
await p.evaluate(() => { for (let i = 0; i < 60; i++) window.__pump(16.7); try { const P = window.app.P; P.grace = 0; window.app.spawnT = 1e9; window.app.w.bodies = window.app.w.bodies.filter(b => b === P || b.kind === 'station' || b.kind === 'rock'); } catch { /* */ } });   // no enemies: keep the speed steady so only judder is measured

const results = {};
for (const [name, gap] of Object.entries(PACINGS)) {
  await p.keyboard.down('KeyD'); if (process.env.BOOST !== '0') await p.keyboard.down('ShiftLeft');
  const rows = await p.evaluate(({ src }) => {
    const gapFn = eval(src); let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 120; i++) { window.app.P.boostFuel = 1; window.__pump(gapFn(i, r)); }   // reach top speed, let the camera settle
    const out = [];
    for (let i = 0; i < 240; i++) {
      const ms = gapFn(i, r); window.app.P.boostFuel = 1; window.__pump(ms);   // keep the boost lit: full speed throughout
      const d = window.app.R.drawn;
      out.push({ ms, sx: (d.x - d.cx) * d.z, wx: -d.cx * d.z, sy: (d.y - d.cy) * d.z, speed: Math.hypot(window.app.P.vx, window.app.P.vy) });
    }
    return out;
  }, { src: gap.toString() });
  await p.keyboard.up('KeyD'); await p.keyboard.up('ShiftLeft');
  await p.evaluate(() => { for (let i = 0; i < 90; i++) window.__pump(16.7); });
  const jerk = key => {
    const v = []; for (let i = 1; i < rows.length; i++) v.push((rows[i][key] - rows[i - 1][key]) / (rows[i].ms / 1000));
    const j = []; for (let i = 1; i < v.length; i++) j.push(Math.abs(v[i] - v[i - 1]));
    j.sort((a, c) => a - c);
    return { mean: Math.round(j.reduce((s, x) => s + x, 0) / j.length), p95: Math.round(j[Math.floor(j.length * 0.95)]) };
  };
  results[name] = { speed: Math.round(rows.at(-1).speed), ship: jerk('sx'), world: jerk('wx') };
}
console.log('Change in on-screen speed between frames (px/s; lower = smoother)');
for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(18)} ship mean ${String(v.ship.mean).padStart(5)} p95 ${String(v.ship.p95).padStart(5)} | world mean ${String(v.world.mean).padStart(5)} p95 ${String(v.world.p95).padStart(5)} | ship speed ${v.speed}`);
if (errs.length) console.log('page errors:\n' + errs.slice(0, 5).join('\n'));
await b.close();
