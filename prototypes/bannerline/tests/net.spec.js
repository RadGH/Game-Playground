// Online play in real browsers (PLAN §19 tests 2, 15, 19): two pages talking over BroadcastChannel
// (host / join by room code, same hash at tick 1200, guest closes -> AI takeover), a hidden tab kept
// alive by the clock worker, the cross-engine determinism replay in Firefox, and an opt-in spec over
// the real PeerJS broker (BL_PEERJS=1).
import { test, expect, firefox, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = 'prototypes/bannerline/tests/net/harness.html';
const ready = page => page.waitForFunction(() => window.bl && window.bl.ok, null, { timeout: 30000 });

async function pair(context, url = URL) {
  const host = await context.newPage(), guest = await context.newPage();
  const errors = [];
  for (const p of [host, guest]) { p.on('pageerror', e => errors.push(e.message)); }
  await host.goto(url); await guest.goto(url);
  await ready(host); await ready(guest);
  return { host, guest, errors };
}

async function startMatch(host, guest, code, { tickMs = 10 } = {}) {
  await host.evaluate(c => window.bl.host(c, { name: 'Host', format: '1v1' }), code);
  await guest.evaluate(c => window.bl.join(c, { name: 'Guest' }), code);
  await host.evaluate(() => { window.bl.claim('0-0'); window.bl.readyUp('0-0'); });
  await guest.evaluate(() => window.bl.claim('1-0', { race: 'ashtusk', hero: 'pyromancer' }));
  await expect.poll(() => host.evaluate(() => window.bl.room.state.slots.find(s => s.key === '1-0').kind)).toBe('human');
  await guest.evaluate(() => window.bl.readyUp('1-0'));
  await expect.poll(() => host.evaluate(() => window.bl.room.state.slots.every(s => s.kind !== 'human' || s.ready))).toBe(true);
  return host.evaluate(t => window.bl.start({ seed: 4242, tickMs: t, startIn: 500 }), tickMs);
}

test('two pages: host / join by code, same hash at tick 1200, guest closes -> AI takeover', async ({ context }) => {
  test.setTimeout(120000);
  const { host, guest, errors } = await pair(context);
  const info = await startMatch(host, guest, 'NETAB');
  expect(info.players).toBe(2);
  await expect.poll(() => host.evaluate(() => window.bl.status().tick), { timeout: 60000 }).toBeGreaterThanOrEqual(1200);
  await expect.poll(() => guest.evaluate(() => window.bl.status().hashes[1200]), { timeout: 30000 }).toBeTruthy();
  const hh = await host.evaluate(() => window.bl.status().hashes);
  const gh = await guest.evaluate(() => window.bl.status().hashes);
  expect(gh[1200]).toBe(hh[1200]);
  for (const t of Object.keys(gh)) if (hh[t] !== undefined) expect(gh[t], `tick ${t}`).toBe(hh[t]);
  await guest.close();
  await expect.poll(() => host.evaluate(() => window.bl.status().kinds[1]), { timeout: 20000 }).toBe('ai');
  const t0 = await host.evaluate(() => window.bl.status().tick);
  await expect.poll(() => host.evaluate(() => window.bl.status().tick), { timeout: 10000 }).toBeGreaterThan(t0 + 100);
  expect(errors).toEqual([]);
});

test('a hidden tab keeps ticking on the clock worker; the other side sees it hidden; hashes still agree', async ({ context }) => {
  test.setTimeout(120000);
  const { host, guest, errors } = await pair(context);
  await startMatch(host, guest, 'NETHD', { tickMs: 20 });
  await expect.poll(() => guest.evaluate(() => window.bl.status().tick), { timeout: 30000 }).toBeGreaterThan(200);
  await guest.evaluate(() => window.bl.hide(true));
  const before = await guest.evaluate(() => ({ tick: window.bl.status().tick, frames: window.bl.status().frames }));
  await expect.poll(() => host.evaluate(() => window.bl.status().lsMachines.find(m => m.name === 'Guest').hidden), { timeout: 10000 }).toBe(true);
  await host.waitForTimeout(3000);
  const during = await guest.evaluate(() => window.bl.status());
  expect(during.frames).toBe(before.frames);                 // no animation frames while hidden...
  expect(during.pumpsWhileHidden).toBeGreaterThan(50);       // ...the worker pulsed instead
  expect(during.tick).toBeGreaterThan(before.tick + 80);     // and the match kept moving
  await guest.evaluate(() => window.bl.hide(false));
  await expect.poll(() => host.evaluate(() => window.bl.status().lsMachines.find(m => m.name === 'Guest').hidden), { timeout: 10000 }).toBe(false);
  await expect.poll(() => guest.evaluate(() => window.bl.status().tick), { timeout: 30000 }).toBeGreaterThan(during.tick + 200);
  const hh = await host.evaluate(() => window.bl.status().hashes);
  const gh = await guest.evaluate(() => window.bl.status().hashes);
  let compared = 0;
  for (const t of Object.keys(gh)) if (hh[t] !== undefined) { expect(gh[t], `tick ${t}`).toBe(hh[t]); compared++; }
  expect(compared).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

// ── cross-engine determinism (node V8 vs Firefox SpiderMonkey vs Chromium) ──
async function nodeReplayLog() {
  const { loadDataSync } = await import('../js/sim/data.js');
  const { createSim } = await import('../js/sim/sim.js');
  const data = loadDataSync(n => readFileSync(join(HERE, '..', 'data', n), 'utf8'));
  const config = { seed: 2026, mode: 'linewar', format: '2v2', players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: 'engineer' }, { team: 0, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'unburied', hero: 'druid' },
    { team: 1, kind: 'human', race: 'thornmane', hero: 'ranger' }, { team: 1, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'ashtusk', hero: 'pyromancer' }] };
  let s = 7;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const commands = [];
  const ticks = 6000, every = 200;
  const sim = createSim(config, data, { events: false });
  const hashes = {};
  for (let t = 1; t <= ticks; t++) {
    const c = [];
    for (const p of [0, 2]) {
      if (r() < 0.05) c.push({ p, type: 'send', unit: data.races.races[config.players[p].race].units[Math.floor(r() * 6)] });
      if (r() < 0.02) c.push({ p, type: 'cast', slot: ['Q', 'W', 'E', 'D', 'R'][Math.floor(r() * 5)], x: (p === 0 ? -50 : 50) + r() * 20, z: 40 + r() * 80 });
      if (r() < 0.01) c.push({ p, type: 'learn', slot: ['Q', 'W', 'E', 'D', 'R'][Math.floor(r() * 5)] });
      if (r() < 0.02) c.push({ p, type: 'amove', x: (p === 0 ? -50 : 50) + (r() - 0.5) * 40, z: 30 + r() * 90 });
    }
    if (c.length) commands.push([t, c]);
    sim.step(c);
    if (t % every === 0) hashes[t] = sim.hash();
  }
  return { log: { config, commands, ticks, every }, hashes, final: sim.hash(), dataHash: data.hash };
}

for (const [engine, launcher] of [['firefox', firefox], ['chromium', chromium]]) {
  test(`cross-engine determinism: a recorded 5-minute 2v2 replays to the same hashes in ${engine} as in node`, async () => {
    test.setTimeout(180000);
    const ref = await nodeReplayLog();
    const browser = await launcher.launch();
    try {
      const page = await browser.newPage();
      await page.goto('http://localhost:8401/' + URL);
      await ready(page);
      const got = await page.evaluate(log => window.bl.replay(log), ref.log);
      expect(got.dataHash).toBe(ref.dataHash);
      for (const t of Object.keys(ref.hashes)) expect(got.hashes[t], `tick ${t} in ${engine}`).toBe(ref.hashes[t]);
      expect(got.final).toBe(ref.final);
    } finally { await browser.close(); }
  });
}

test('opt-in: two pages over the real PeerJS broker (BL_PEERJS=1)', async ({ context }) => {
  test.skip(!process.env.BL_PEERJS, 'needs internet and the public PeerJS broker: run with BL_PEERJS=1');
  test.setTimeout(120000);
  const { host, guest } = await pair(context, URL + '?t=peerjs');
  const code = 'P' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-HJ-NP-Z]/g, 'K');
  await startMatch(host, guest, code.slice(0, 5).padEnd(5, 'K'), { tickMs: 25 });
  await expect.poll(() => guest.evaluate(() => window.bl.status().hashes[600]), { timeout: 60000 }).toBeTruthy();
  expect(await guest.evaluate(() => window.bl.status().hashes[600])).toBe(await host.evaluate(() => window.bl.status().hashes[600]));
});
