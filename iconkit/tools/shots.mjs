// Icon Kit — screenshots of every tab on a desktop and a 360x740 phone, into iconkit/shots/.
//   flock /tmp/oathwild-browser.lock node iconkit/tools/shots.mjs [base-url]
// Fails (exit 1) on a console error or a page that scrolls sideways on the phone.
import { chromium } from '../../node_modules/playwright/index.mjs';
const BASE = process.argv[2] || 'http://localhost:8401/iconkit/';
const OUT = new URL('../shots/', import.meta.url).pathname;
const TABS = ['builder', 'compare', 'status', 'items', 'classes', 'oathwild', 'library', 'matrix'];
const VIEWS = { desktop: { width: 1366, height: 900 }, phone: { width: 360, height: 740 } };
const browser = await chromium.launch();
let bad = 0;
for (const [vname, vp] of Object.entries(VIEWS)) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: vname === 'phone' ? 2 : 1 });
  page.on('console', m => { if (m.type() === 'error') { bad++; console.log(`[${vname}] console error: ${m.text()}`); } });
  page.on('pageerror', e => { bad++; console.log(`[${vname}] page error: ${e.message}`); });
  for (const tab of TABS) {
    await page.goto(`${BASE}#${tab}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (wide > 1) { bad++; console.log(`[${vname}] ${tab}: page is ${wide}px wider than the screen`); }
    await page.screenshot({ path: `${OUT}${tab}-${vname}.png`, fullPage: tab === 'builder' || tab === 'matrix' || tab === 'status' || tab === 'items' });
  }
  if (vname === 'desktop') {   // close-ups: the stacked icons at every size, painted and drawn
    await page.goto(`${BASE}#builder`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const st = page.locator('.ikr-stage');
    await st.screenshot({ path: `${OUT}builder-stage-painted.png` });
    await page.click('[data-art="placeholder"]'); await page.waitForTimeout(500);
    await page.locator('.ikr-stage').screenshot({ path: `${OUT}builder-stage-drawn.png` });
    await page.click('[data-art="best"]');
  }
  await page.close();
}
await browser.close();
console.log(bad ? `${bad} problem(s)` : 'shots saved, no problems');
process.exit(bad ? 1 : 0);
