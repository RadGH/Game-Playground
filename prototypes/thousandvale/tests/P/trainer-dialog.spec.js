import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const J = file => JSON.parse(readFileSync(new URL(file, ROOT), 'utf8'));
const bram = J('data/provinces/professions.json').trainers.find(t => t.id === 'prospector_torborhold');
const town = Object.values(J('data/provinces/offices.json').towns).find(t => t.name === 'Torborhold');
const forager = town.offices.find(o => o.role === 'forager');
const angler = J('data/provinces/angling-pools.json').anglers[0];
const [, zx, zz] = /^z(\d+)_(\d+)$/.exec(town.zone).map(Number);
const freePort = () => new Promise(resolve => {
  const s = createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
let server, base, hook;

test.beforeAll(async () => {
  const port = await freePort(), hookPort = await freePort();
  server = spawn(process.execPath, [fileURLToPath(new URL('tests/D/m3-server.mjs', ROOT)), '--port', String(port), '--hook', String(hookPort)], { cwd: fileURLToPath(ROOT), stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output)), 30000);
    server.stderr.on('data', d => { output += d; });
    server.stdout.on('data', d => { output += d; if (/READY \d+ \d+/.test(output)) { clearTimeout(timer); resolve(); } });
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hook = `http://127.0.0.1:${hookPort}`;
});
test.afterAll(() => server?.kill('SIGTERM'));

for (const [layout, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 393, height: 852 }]]) {
  test(`${layout}: the prospector shows Mining learned and keeps its details accessible on repeat visits`, async ({ browser }) => {
    test.setTimeout(150000);
    const context = await browser.newContext({ viewport, hasTouch: layout === 'phone', isMobile: layout === 'phone' });
    try {
      const page = await context.newPage(), name = `Teacher${layout}`;
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}?autoplay=1&quality=low&name=${name}&cls=warrior&tod=0.45`);
      await page.waitForFunction(() => window.tv && tv.state().status === 'online' && window.tvprof, null, { timeout: 90000 });
      const talk = async (role, x, z) => {
        const response = await fetch(hook + '/teleport', { method: 'POST', body: JSON.stringify({ name, x: x + 1, z }) });
        expect((await response.json()).ok).toBe(true);
        await page.waitForFunction(role => [...thousandvale.actors.actors.values()].some(a => a.role === role), role);
        await page.evaluate(role => {
          const npc = [...thousandvale.actors.actors.values()].find(a => a.role === role);
          thousandvale.S.net.use(npc.id);
        }, role);
      };
      const dialog = page.locator('.tv-dialog');
      await talk('prospector', bram.x, bram.z);
      await expect(dialog.locator('.prof-dlg-status')).toContainText('You have learned Mining.');
      // wrap-up (report #62): his title is the plain one, and the trade button sits beside whatever quests he offers
      await expect.poll(() => page.evaluate(() => [...thousandvale.actors.actors.values()].find(a => a.role === 'prospector').npcTitle)).toBe('Prospector');
      const quests = await dialog.locator('[data-accept], [data-turnin]').count();
      expect(quests, 'the prospector has a quest for a newcomer (the case in the report)').toBeGreaterThan(0);
      await expect(dialog.getByRole('button', { name: 'Mining', exact: true })).toBeVisible();
      await expect(dialog.locator('.prof-dlg-status')).toContainText("Prospector's Pick is in your bag.");
      await dialog.getByRole('button', { name: 'Mining', exact: true }).click();
      const trainer = page.locator('#panel-trainer');
      await expect(trainer).toBeVisible();
      await expect(trainer).toContainText('You know this');
      await expect(trainer).toContainText("Prospector's Pick is in your bag.");
      await expect(trainer).toContainText('Break ore out of boulders.');
      await expect(trainer.locator('[data-learn="mining"]')).toHaveCount(0);
      await trainer.getByRole('button', { name: 'Close', exact: true }).click();

      await talk('prospector', bram.x, bram.z);
      await expect(dialog.locator('.prof-dlg-status')).toContainText('Mining is already learned.');
      await expect(dialog.getByRole('button', { name: 'Mining', exact: true })).toBeVisible();
      await expect(dialog.locator('.prof-dlg-status')).toHaveCount(1);
      await page.evaluate(() => thousandvale.worldUi.closeDialog());

      // A normal teacher still offers a real Learn button and grants the skill and tool through the UI.
      await talk('forager', forager.door.x + zx * 2048, forager.door.z + zz * 2048);
      await expect(dialog.locator('.prof-dlg-status')).toContainText('Teaches Foraging for free.');
      await dialog.getByRole('button', { name: 'Learn: Foraging', exact: true }).click();
      await trainer.locator('[data-learn="foraging"]').click();
      await expect(trainer).toContainText('You know this');
      await expect(trainer.locator('[data-learn="foraging"]')).toHaveCount(0);
      expect(await page.evaluate(() => tvprof.state.list.find(p => p.id === 'foraging')?.tool?.name)).toBeTruthy();
      await trainer.getByRole('button', { name: 'Close', exact: true }).click();

      // wrap-up (report #56): the angler has the same trades door as every other teacher — first visit and after
      await talk('angler', angler.x, angler.z);
      await expect(dialog.locator('.prof-dlg-status')).toContainText('You have learned Angling.');
      await page.evaluate(() => thousandvale.worldUi.closeDialog());
      await talk('angler', angler.x, angler.z);
      await expect(dialog.locator('.prof-dlg-status')).toContainText('Angling is already learned.');
      await dialog.getByRole('button', { name: 'Angling', exact: true }).click();
      await expect(trainer).toBeVisible();
      await expect(trainer).toContainText('Angling');
      await expect(trainer).toContainText('You know this');
      await expect(trainer.locator('[data-learn="angling"]')).toHaveCount(0);
      const tb = await trainer.boundingBox();
      expect(tb.x >= 0 && tb.x + tb.width <= viewport.width + 1, 'the trainer window fits the screen').toBe(true);
      await page.screenshot({ path: `prototypes/thousandvale/tests/P/shots/wrap-56-angler-${layout}.png` });
      expect(await page.evaluate(() => tvprof.state.list.find(p => p.id === 'angling')?.known), 'the Professions list agrees').toBe(true);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
