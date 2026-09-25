import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const browser = await chromium.launch({ headless: true, args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(option('url', 'http://localhost:8400/avatar-3d/chibi2.html'));
  await page.waitForFunction(() => window.chibi2 && !window.chibi2.building, null, { timeout: 60000 });
  const renderer = await page.evaluate(() => {
    const gl = window.chibi2.scene.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const results = await page.evaluate(opts => window.chibi2.benchmark(opts), { frames: +option('frames', 180), warmup: +option('warmup', 90) });
  const output = { date: new Date().toISOString(), renderer, note: 'Headless browser; frame times describe this renderer and machine only. Fixed simulation steps and identical render settings. Particle variation is stochastic.', errors, results };
  console.log(JSON.stringify(output, null, 2));
  if (option('output', null)) await writeFile(option('output'), JSON.stringify(output, null, 2) + '\n');
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
