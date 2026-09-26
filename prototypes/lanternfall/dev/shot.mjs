// node dev/shot.mjs <url-path> <out.png> [waitMs] — headless screenshot with software WebGL
import { chromium } from '@playwright/test';
const [, , path, out, wait = '5000', w = '1440', h = '810'] = process.argv;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', m => console.log('console', m.type(), m.text())); p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:8401/prototypes/lanternfall/' + path);
await p.waitForTimeout(+wait);
console.log(await p.evaluate(() => JSON.stringify(window.__stats || (window.lanternfall?.player ? { ready: lanternfall.ready, errors: lanternfall.errors, player: lanternfall.player(), draws: lanternfall.renderer?.stats } : null))));
await p.screenshot({ path: out });
await b.close();
