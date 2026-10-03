// Hunters vs Farmers generator cross-engine check (docs/hvf-PLAN.md §16.2) + the viewer page.
// Lockstep peers rebuild the forest from the seed, so Chromium, Firefox and node must agree on every
// cell. Each browser imports js/sim/modes/hvf/mapgen.js itself and hashes worlds for 12 seeds; node
// computes the same hashes here. Then hvf-map.html is opened in both views with no page errors.
import { test, expect, firefox } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../js/sim/modes/hvf/mapgen.js';
import { hashValue } from '../js/sim/hash.js';

const gen = JSON.parse(readFileSync(new URL('../data/hvf/mapgen.json', import.meta.url), 'utf8'));
const SEEDS = [1, 2, 3, 17, 99, 512, 1234, 4040, 77777, 123456, 9, 31];
const SIZES = [192, 256, 320];
const hashWorld = w => hashValue({ cells: Array.from(w.cells), level: Array.from(w.level), look: Array.from(w.look), hollows: w.hollows.map(h => [h.x, h.z, h.entry]) });

function nodeHashes() {
  const out = [];
  for (const s of SEEDS) for (const size of SIZES) out.push(hashWorld(generateWorld(gen, { seed: s, size, farmers: 5, hunters: 2 })));
  return out;
}

async function browserHashes(page) {
  await page.goto('prototypes/bannerline/hvf-map.html?seed=1&view=one');
  await page.waitForFunction(() => !!window.hvfMap, null, { timeout: 30_000 });
  return page.evaluate(async ({ SEEDS, SIZES }) => {
    const m = await import(new URL('js/sim/modes/hvf/mapgen.js', location.href).href);
    const { hashValue } = await import(new URL('js/sim/hash.js', location.href).href);
    const gen = await (await fetch(new URL('data/hvf/mapgen.json', location.href))).json();
    const out = [];
    for (const s of SEEDS) for (const size of SIZES) {
      const w = m.generateWorld(gen, { seed: s, size, farmers: 5, hunters: 2 });
      out.push(hashValue({ cells: Array.from(w.cells), level: Array.from(w.level), look: Array.from(w.look), hollows: w.hollows.map(h => [h.x, h.z, h.entry]) }));
    }
    return out;
  }, { SEEDS, SIZES });
}

test('the forest is the same cell for cell in node, Chromium and Firefox', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const want = nodeHashes();
  expect(await browserHashes(page)).toEqual(want);
  const fx = await firefox.launch();
  try {
    const p = await fx.newPage({ baseURL });
    expect(await browserHashes(p)).toEqual(want);
  } finally { await fx.close(); }
});

test('the viewer draws one map with metrics and the 16-seed grid, without errors', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('prototypes/bannerline/hvf-map.html?seed=5&format=6v2&view=one');
  await page.waitForFunction(() => !!window.hvfMap, null, { timeout: 30_000 });
  await expect(page.locator('#metrics tr')).toHaveCount(17);
  await expect(page.locator('#status')).toContainText('Valid');
  // the canvas is not blank: many distinct colours
  const colours = await page.evaluate(() => { const c = document.getElementById('map'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); return set.size; });
  expect(colours).toBeGreaterThan(40);
  await page.locator('#view button[data-v="grid"]').click();
  await page.waitForFunction(() => window.hvfGridDone === true, null, { timeout: 90_000 });
  await expect(page.locator('.tile')).toHaveCount(16);
  await expect(page.locator('.tile .bad')).toHaveCount(0);
  await page.locator('.tile').nth(3).click();
  await page.waitForFunction(() => window.hvfMap && window.hvfMap.seed === 8, null, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
