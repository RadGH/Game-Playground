// Print before/after loudness for ids through the gallery's own measure(): node sfx/tools/measure.mjs [method] id...
import { chromium } from 'playwright';
const [method, ...ids] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('http://localhost:8401/sfx/'); await p.waitForFunction(() => !!window.sfxDemo);
const rows = await p.evaluate(({ ids, method }) => window.sfxDemo.measure(ids.length ? ids : window.sfxDemo.sfx.ids(), method), { ids, method: method || 'hybrid' });
for (const r of rows) console.log(r.id.padEnd(26), 'before', r.beforeLufs.toFixed(1), 'after', r.afterLufs.toFixed(1), 'aim', r.aim.toFixed(1), 'gain', r.gainDb.toFixed(1), Math.abs(r.afterLufs - r.aim) > 2 ? '  <-- off' : '');
await b.close();
