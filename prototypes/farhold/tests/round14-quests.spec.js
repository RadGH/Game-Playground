// R14 — "That location was hours of foot travel away in a much higher level zone."
//
// `candidatesFrom` is handed `world.nodes`, which is every settlement on the PLANET, and `fits()`
// had no distance test at all — so `walk_it_over`, a frame whose scope is literally "local", would
// happily bind the town forty kilometres away in a level-30 band and call it a local job.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('the jobs on a zone board are near, and none of them is a death sentence', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(() => {
    const fh = window.farhold;
    // `board` is a GETTER on window.farhold, not a function — see the note in js/main.js
    const rows = (fh.board || []).map(j => {
      if (!j.place) return { title: j.title, away: null, band: null, scope: j.scope };
      const away = Math.hypot(j.place.x - fh.control.x, j.place.z - fh.control.z);
      const z = fh.zones.at(j.place.x, j.place.z);
      return { title: j.title, away: Math.round(away), band: z?.minLevel ?? null, scope: j.scope };
    });
    return { level: fh.player.level, rows };
  });
  console.log('board:', JSON.stringify(out, null, 1));
  const placed = out.rows.filter(r => r.away != null);
  for (const r of placed) {
    /**
     * `local` is 4,200 m and `adjacent` is 12,000 m (SCOPE_METRES in js/jobgen.js). A walk is 5.4
     * m/s, so 4.2 km is about thirteen minutes — the longest an errand should ever be, and a long
     * way short of "hours of foot travel".
     */
    const budget = r.scope === 'adjacent' ? 12000 : r.scope === 'rumour' ? Infinity : 4200;
    expect(r.away, `"${r.title}" is a ${r.scope} job ${r.away} m away`).toBeLessThanOrEqual(budget);
    // …and not six level bands up
    if (r.band != null) {
      expect(r.band, `"${r.title}" points at a level ${r.band} band and you are ${out.level}`)
        .toBeLessThanOrEqual(out.level + 4);
    }
  }
  expect(errors).toEqual([]);
});

test('a village crier sends you somewhere you can walk to', async ({ page }) => {
  const errors = await land(page);
  const out = await page.evaluate(async () => {
    const fh = window.farhold;
    // every quest the towns near you are currently offering
    const jobs = [];
    for (const npc of fh.folk.live ? [...fh.folk.live.values()].flat() : []) {
      if (!npc?.offered?.place) continue;
      const away = Math.hypot(npc.offered.place.x - (npc.node.x * 640), npc.offered.place.z - (npc.node.y * 640));
      const z = fh.zones.at(npc.offered.place.x, npc.offered.place.z);
      jobs.push({ title: npc.offered.title, kind: npc.offered.kind, away: Math.round(away), band: z?.minLevel ?? null });
    }
    return { level: fh.player.level, jobs: jobs.slice(0, 12) };
  });
  console.log('crier jobs:', JSON.stringify(out));
  for (const j of out.jobs) {
    // NEAR_METRES is 5,200 in js/quests.js, with a documented fallback to the three closest when a
    // world genuinely has nothing inside it
    expect(j.away, `"${j.title}" is ${j.away} m from the person asking`).toBeLessThan(40000);
    if (j.band != null) expect(j.band).toBeLessThanOrEqual(out.level + 4);
  }
  expect(errors).toEqual([]);
});
