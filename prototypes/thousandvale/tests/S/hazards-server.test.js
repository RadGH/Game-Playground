// node --test prototypes/thousandvale/tests/S/hazards-server.test.js
// Expansion 1 §4 (stream S): the hazards in the REAL realm (Torbor Downs + Vharlen as the server loads them, the real
// combat rules): a hot spring soaks and warms a real character, a geyser throws one into a glide and down onto the
// ground again, a lava vent burns one for the zone's damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../../js/sim/world.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { loadLayouts } from '../../server/load.mjs';
import { prepareRules, createRules } from '../../js/rules/index.js';
import { SPRING, GEYSER, cycleOf, nextAt, ventDamage } from '../../js/rules/hazards.js';
import { makeClient, run, until, waitP } from '../A/helpers.js';

test('Vharlen\'s springs, geysers and vents in the real realm', { timeout: 400000 }, async () => {
  const quiet = console.log; console.log = () => {};
  const { layouts, events, encounterInfo } = await loadLayouts(['torbor_downs', 'vharlen']);
  console.log = quiet;
  await prepareRules();
  const clock = createVirtualClock(), store = createMemoryStore({ now: clock.now });
  const world = createWorld({ store, layouts, events, encounterInfo, createRules, now: clock.now, lingerMs: 0, log: () => {}, roadEvents: false, travellers: false });
  const srv = createLoopbackServer({ clock, world }); await srv.ready;
  const c = makeClient(srv, clock, { tokenStore: memoryTokenStore() }); await waitP(clock, c.ready);
  const ch = await waitP(clock, c.createChar({ name: 'Steamer', cls: 'warrior' })); await waitP(clock, c.play(ch.id)); await until(clock, () => !!c.joined, 5000);
  const rec = () => world.online.get(c.joined.you.char);
  const { xpForLevel } = await import('../../js/rules/farhold.js');
  rec().room.award(rec().entity, { xp: xpForLevel(14) + 1, reason: 'test' }); await run(clock, 200);
  const S = world.hazards.sitesFor('vharlen');
  assert.ok(S && S.springs.length && S.geysers.length && S.vents.length, 'the server loaded the island\'s hazards');
  assert.equal(world.hazards.sitesFor('torbor_downs'), null, 'Torbor Downs has none');
  const go = async (x, z) => {
    if (!rec().room.id.startsWith('vharlen/')) { world.moveTo(rec(), 'vharlen', { x, z }, 'ship'); await run(clock, 600); }
    else { rec().entity.moveTo(x, z, undefined, true); const cl = rec().room.clients.get(rec().entity.id); if (cl) cl.selfDirty = true; await run(clock, 100); }
    assert.ok(rec().room.id.startsWith('vharlen/'), rec().room.id);
    // a quiet spot to test in: the camps nearby are taken away (they would come back in a minute and a half)
    const r = rec().room;
    for (const m of [...r.entities.values()]) if (m.kind === 'monster' && Math.hypot(m.x - x, m.z - z) < 120) r.remove(m);
    for (const k of r.camps || []) if (Math.hypot(k.x - x, k.z - z) < 160) { k.count = 0; k.due.length = 0; k.parked = 0; }
    return rec().entity;
  };

  // ---- a hot spring: soak (out of a fight), then climb out warmed ----
  const sp = S.springs.find(s => s.kind === 'hot_spring');
  const e = await go(sp.x + 1, sp.z + 1);
  const u = () => rec().entity.r.unit;
  u().hp = Math.round(u().maxHp * 0.3);
  const maxBefore = u().maxHp;
  await run(clock, 3500, 20);
  assert.ok(u().statuses[SPRING.status], 'Steam-soaked while in the water');
  assert.ok((rec().entity.st || []).includes(SPRING.status), 'everyone near sees it (info.st)');
  assert.ok(u().hp > u().maxHp * 0.5, 'fast healing: ' + Math.round(u().hp) + ' / ' + u().maxHp);
  await go(sp.x + sp.r + 25, sp.z);
  await run(clock, 2500, 20);
  assert.ok(u().statuses[SPRING.warm], 'Steam-warmed after climbing out');
  assert.equal(u().maxHp, Math.round(maxBefore * (1 + SPRING.warmHpPct)), 'and +5% maximum health');

  // ---- a geyser: wait for its eruption standing on it; thrown into a glide and down again ----
  const g = S.geysers.find(q => q.ledge) || S.geysers[0];
  const ge = await go(g.x, g.z);
  const ground = rec().room.groundAt(g.x, g.z);
  const t0 = clock.now(), c0 = cycleOf(g.id, 'geyser'), due = nextAt(c0, t0 + 2500).at;
  await run(clock, due - clock.now() - 200, 20);
  assert.ok(!ge.airborne, 'still standing before it goes');
  let top = ge.y, glided = false;
  for (let k = 0; k < 120; k++) { await run(clock, 50, 10); top = Math.max(top, ge.y); if (ge.glide) glided = true; }
  assert.ok(glided, 'the glide was set');
  assert.ok(top - ground > 11, `thrown high: ${(top - ground).toFixed(1)} m`);
  await until(clock, () => !ge.airborne, 15000, 20);
  assert.ok(!ge.airborne && !ge.glide, 'back on the ground, the glide over');
  assert.ok(c.evs.some(ev => ev.type === 'tele' && ev.ab === 'geyser'), 'the rumble reached the client as a telegraph');
  assert.ok(c.evs.some(ev => ev.type === 'fx' && ev.kind === 'geyser' && ev.phase === 'erupt'));

  // ---- a lava vent: stand in the line at the Caldera and burn ----
  const v = S.vents.find(q => q.zone === 'z12_10');
  const ve = await go(v.cx, v.cz);
  u().hp = u().maxHp; const hpMax = u().maxHp;
  const due2 = nextAt(v.cycle, clock.now() + 3000).at;
  await run(clock, due2 - clock.now() + 150, 20);
  const lost = hpMax - u().hp;
  assert.ok(lost >= ventDamage(v.level) * 0.95 - 1 && lost <= ventDamage(v.level) * 1.5 + 30, `burned ${lost} (a hit is ${ventDamage(v.level)})`);
  assert.ok(c.evs.some(ev => ev.type === 'tele' && ev.ab === 'lava_vent' && ev.shape === 'line'));
  assert.ok(c.evs.some(ev => ev.type === 'hit' && ev.d === ve.id && ev.skill === 'lava_vent'), 'the client heard the burn as a hit');
  await world.shutdown?.();
});
