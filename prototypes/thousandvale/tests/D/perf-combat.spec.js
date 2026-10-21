// 2026-10-20 — the owner's combat-stutter report: "smooth exploring, but once I start targeting in combat I sometimes
// stutter, worse in groups" (his Chrome trace: a 1.53 s frame spent building ONE new shader, mid-fight, at a rift).
//
// A level-15 Starcaller (his class) fights through a real server: a rift event's waves, then a mixed group of monsters
// (casters, archers, beasts, undead, elementals, a champion and a rare), with targeting, the basic attack and every
// skill on the bar, a level-up, a death and a rise. Then every class's skills and signature effects are drawn through
// the client's own handlers — cast by you and by other players nearby — at every Spell effects level, plus every
// telegraph shape. The page's performance log (js/client/perf.js + perf-log.js) names each shader built after the
// boot warm-up; the spec fails if a single one was built in a fight. It also opens the performance panel and checks a
// bug report's context carries the performance log.
//
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/perf-combat.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
import { startBot } from '../../tools/bot-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase, wsUrl;
test.beforeAll(async () => {
  const port = await freePort(), hook = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hook)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hook}`;
  wsUrl = `ws://127.0.0.1:${port}`;
});
let botRef = null;
test.afterAll(async () => { try { botRef?.stop(); } catch {} srv?.kill('SIGTERM'); });
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

// a mixed group: humanoid casters and archers, beasts, undead, elementals, constructs (different bodies, different spells)
const GROUP = [
  { type: 'sootwick_hexer', n: 2 }, { type: 'brigand_archer', n: 2 }, { type: 'ashtusk_bonecaller', n: 1 }, { type: 'marsh_wisp', n: 1 },
  { type: 'cinder_imp', n: 1, rank: 'champion' }, { type: 'barrow_hound', n: 2 }, { type: 'ember_revenant', n: 1, rank: 'rare' }, { type: 'slagborn_firecaller', n: 2 },
];

test('a group fight with targeting builds no shader after the warm-up, and the performance tools work', async ({ browser }) => {
  test.setTimeout(2400000);
  mkdirSync(SHOTS, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=Perfy&cls=starcaller&quality=high&tod=0.85&perf=trace`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 480000 });      // ~4 minutes on the test VM's software renderer
  // a second player — a Pyromancer, a real WebSocket bot (tools/bot-client.mjs) using its own skill bar on what you
  // fight: someone else's fire spells, as in a group (a second browser page could not boot beside this one on the VM)
  const bot = await startBot({ url: wsUrl, name: 'Pyra', mode: 'script', cls: 'pyromancer' });
  botRef = bot; bot.skills = true; bot.fightRadius = 30;
  bot.focus = () => { let best = null, bd = 1e9; for (const e of bot.ents.values()) if (e.kind === 'monster' && !e.dead && bot.pos) { const d = Math.hypot(e.x - bot.pos.x, e.z - bot.pos.z); if (d < bd) { bd = d; best = e.id; } } return best; };
  await hook('/level', { name: 'Pyra', level: 15 });
  await hook('/level', { name: 'Perfy', level: 15 });
  await page.waitForTimeout(8000);                   // the first zone settles (its own shaders are not a fight's)
  const snap = () => page.evaluate(() => thousandvale.perfPanel.snap());
  const phases = [];
  const mark = async label => { const s = await snap(); phases.push({ label, at: s.now, compiles: s.counts.compiles }); console.log('[perf-combat phase]', label, 'shaders so far', s.counts.compiles, (s.compiles || []).slice(-4).map(c => `${c.name} — ${c.what} @ ${c.site}`).join(' | ')); };
  const join2 = async () => { const me = await page.evaluate(() => tv.state().you); await hook('/spawn', { name: 'Pyra', type: 'cairn_rat', n: 1, level: 1, dist: 30, wilds: true, x: me.x + 3, z: me.z + 2 }); await hook('/teleport', { name: 'Pyra', x: me.x + 3, z: me.z + 2 }); bot.goal = { x: me.x + 3, z: me.z + 2 }; };

  // a fight: target the nearest live enemy, attack, and walk the skill bar (both players)
  const fight = async (ms, ids = null) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await hook('/tough', { name: 'Pyra' });
      for (const [name, pg] of [['Perfy', page]]) {
      await hook('/tough', { name });
      await pg.evaluate(only => {
        const st = tv.state(), me = st.you; if (!me) return;
        const live = st.ents.filter(e => !e.dead && e.kind === 'monster' && (!only || only.includes(e.id))).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
        if (live[0]) { tv.attack(live[0].id); tv.cast(1 + (Date.now() / 1500 | 0) % 6, live[0].id); }
      }, ids).catch(() => {});
      }
      await page.waitForTimeout(1500);
    }
  };

  await mark('start');
  // --- 1: a rift opens beside you (his trace) ---
  const rift = await hook('/wild', { name: 'Perfy', kind: 'rift', road: true });      // out on a road, away from towns
  console.log('[perf-combat rift]', JSON.stringify(rift));
  if (rift.ok) await hook('/teleport', { name: 'Perfy', x: rift.x + 9, z: rift.z });
  await page.waitForTimeout(4000);
  await join2();
  await page.waitForTimeout(5000);
  await mark('rift');
  await fight(rift.ok ? 50000 : 5000);
  // --- 2: a mixed group, a champion and a rare among them ---
  const you = await page.evaluate(() => tv.state().you);
  const ids = [];
  for (const [k, g] of GROUP.entries()) { const r = await hook('/spawn', { name: 'Perfy', type: g.type, n: g.n, level: 15, rank: g.rank, dist: 10 + (k % 3) * 3 }); if (r.ok) ids.push(...r.ids); }
  await page.waitForTimeout(6000);
  await mark('group');
  await fight(45000, ids);
  // --- 3: a level-up mid-fight, a death and a rise ---
  await mark('levelup');
  await hook('/level', { name: 'Perfy', level: 16 });
  await page.waitForTimeout(3000);
  await hook('/kill', { name: 'Perfy' });
  await page.waitForTimeout(4000);
  await page.evaluate(() => tv.rise()).catch(() => {});
  await page.waitForTimeout(6000);
  // --- 4: every class's skills + signature effects, cast by you and by another player nearby, at every effects level ---
  await page.evaluate(() => tv.crowd(2, 6));
  for (const level of ['enhanced', 'standard', 'reduced', 'off']) {
    await mark('classes:' + level);
    await page.evaluate(lv => thousandvale.ui2.settings.set('fx', lv), level);
    const classes = await page.evaluate(() => Object.keys(window.__skillClasses || {}));
    for (const cls of (level === 'enhanced' ? classes : classes.slice(0, 6))) {
      await page.evaluate(c => {
        const ids = window.__skillClasses[c] || [], me = tv.state().you.id;
        const t = tv.state().ents.find(e => e.kind === 'monster' && !e.dead)?.id ?? null;
        const other = [...thousandvale.actors.actors.values()].find(a => String(a.id).startsWith('crowd-'))?.id ?? null;
        ids.forEach((id, i) => setTimeout(() => {
          try { thousandvale.spells.demo(id, me, t); } catch {}
          if (other != null) try { thousandvale.spells.demo(id, other, me); } catch {}
        }, i * 120));
        tv.demoSpells(c, 120);
      }, cls);
      await page.waitForTimeout(level === 'enhanced' ? 2500 : 1500);
    }
  }
  await page.evaluate(() => thousandvale.ui2.settings.set('fx', 'enhanced'));
  // --- 5: every telegraph shape and element, boss frames and phases ---
  await mark('telegraphs');
  await page.evaluate(() => { tv.demoEncounter(); setTimeout(() => tv.demoWorldBoss(), 3000); });
  await page.waitForTimeout(12000);
  await mark('end');

  const S = await snap();
  const phaseOf = at => { let p = phases[0].label; for (const x of phases) if (at >= x.at) p = x.label; return p; };
  const built = S.compiles.filter(c => c.at >= phases[0].at).map(c => ({ phase: phaseOf(c.at), name: c.name, what: c.what, site: c.site, users: c.users, frameMs: c.frameMs, key: c.key }));
  // --- the tools: the panel opens and draws; the copy text and a bug report's context carry the log ---
  const atBoot = await page.evaluate(() => thousandvale.perfPanel.isOpen);      // ?perf=trace opened it
  await page.keyboard.press('F9');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => !thousandvale.perfPanel.isOpen && document.getElementById('perf-panel').hidden);
  await page.keyboard.press('F9');
  await page.waitForTimeout(600);
  const panel = await page.evaluate(() => ({ open: thousandvale.perfPanel.isOpen, shown: !document.getElementById('perf-panel').hidden, stats: document.querySelector('#perf-panel .pp-stats')?.textContent || '', text: thousandvale.perfPanel.text() }));
  await page.screenshot({ path: join(SHOTS, 'perf-combat-panel.png') });
  const report = { phases, built, counts: S.counts, stutters: S.stutters.slice(-10), gpu: S.gpu, parallel: S.parallel, panel: { open: panel.open, shown: panel.shown, stats: panel.stats }, errors };
  console.log('[perf-combat]', JSON.stringify({ phases, built: built.map(b => `${b.phase}: ${b.name} — ${b.what} @ ${b.site}`) }, null, 1));
  writeFileSync(join(SHOTS, 'perf-combat.json'), JSON.stringify(report, null, 1));
  writeFileSync(join(SHOTS, 'perf-combat-report.txt'), panel.text);

  expect(atBoot, '?perf= opens the panel at load').toBe(true);
  expect(closed, 'F9 closes it').toBe(true);
  expect(panel.open && panel.shown, 'F9 opens it again').toBe(true);
  expect(panel.stats).toMatch(/stutters/);
  expect(panel.text).toMatch(/Thousandvale performance report/);
  expect(errors, 'page errors').toEqual([]);
  const fights = built.filter(b => b.phase !== 'start');
  expect(fights.map(b => `${b.phase}: ${b.name} — ${b.what} @ ${b.site}`), 'shaders built mid-fight (each one is a freeze on a real graphics card)').toEqual([]);
});
