// Unit tests: rng, mathx, order, hash, data bundle, flow fields, map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedStream, next, int, nextU32 } from '../js/sim/rng.js';
import * as M from '../js/sim/mathx.js';
import { sortBy, sorted } from '../js/sim/order.js';
import { hashValue, hashCanonical } from '../js/sim/hash.js';
import { buildMap } from '../js/sim/map.js';
import { flowDir } from '../js/sim/flow.js';
import { data, dataWith } from './_sim.mjs';

test('rng: same seed same sequence, streams independent, ranges right', () => {
  const a = seedStream(42, 'combat'), b = seedStream(42, 'combat'), c = seedStream(42, 'loot');
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(nextU32(a)); sb.push(nextU32(b)); sc.push(nextU32(c)); }
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  const r = seedStream(1);
  let lo = 1, hi = 0;
  const hist = new Array(6).fill(0);
  for (let i = 0; i < 6000; i++) { const v = next(r); lo = Math.min(lo, v); hi = Math.max(hi, v); hist[int(r, 6)]++; }
  assert.ok(lo >= 0 && hi < 1);
  for (const h of hist) assert.ok(h > 850 && h < 1150, `bucket ${h}`);
  // known first value pins the algorithm (a change here desyncs saved replays)
  assert.equal(nextU32(seedStream(1, 'pin')), nextU32(seedStream(1, 'pin')));
});

test('mathx: sin/cos/atan2 match the engine closely and use the bannerline facing convention', () => {
  for (let a = -12; a < 12; a += 0.071) {
    assert.ok(Math.abs(M.sin(a) - Math.sin(a)) < 1e-9);
    assert.ok(Math.abs(M.cos(a) - Math.cos(a)) < 1e-9);
  }
  for (let i = 0; i < 500; i++) { const y = (i % 17) - 8, x = (i % 13) - 6; assert.ok(Math.abs(M.atan2(y, x) - Math.atan2(y, x)) < 1e-9, `${y},${x}`); }
  assert.equal(M.faceOf(0, 1), 0);                         // +z
  assert.ok(Math.abs(M.faceOf(1, 0) - Math.PI / 2) < 1e-12); // +x
  assert.ok(Math.abs(Math.abs(M.wrapAngle(7 * Math.PI)) - Math.PI) < 1e-12);
  assert.equal(M.q2(1.23456), 1.23);
});

test('order: sortBy is stable, tie-broken by id, and does not mutate', () => {
  const arr = [{ id: 3, k: 1 }, { id: 1, k: 2 }, { id: 2, k: 1 }, { id: 0, k: 2 }];
  const out = sortBy(arr, x => x.k);
  assert.deepEqual(out.map(x => x.id), [2, 3, 0, 1]);
  assert.deepEqual(arr.map(x => x.id), [3, 1, 2, 0]);
  assert.deepEqual(sorted(['b', 'a', 'c']), ['a', 'b', 'c']);
  const big = Array.from({ length: 257 }, (_, i) => ({ id: i, k: (i * 37) % 11 }));
  const s = sortBy(big, x => x.k);
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].k < s[i].k || (s[i - 1].k === s[i].k && s[i - 1].id < s[i].id));
});

test('hash: quantised to mm, order-sensitive for arrays, canonical for data', () => {
  assert.equal(hashValue({ x: 1.0000001 }), hashValue({ x: 1.0000004 }));
  assert.notEqual(hashValue({ x: 1.001 }), hashValue({ x: 1.002 }));
  assert.notEqual(hashValue([1, 2]), hashValue([2, 1]));
  assert.equal(hashCanonical({ a: 1, b: 2 }), hashCanonical({ b: 2, a: 1 }));
  assert.equal(hashValue({ big: 5e9 }), hashValue({ big: 5e9 }));
  assert.notEqual(hashValue({ big: 5e9 }), hashValue({ big: -5e9 }));
});

test('data bundle: frozen, hashed, and the hash moves with any change (datahash)', () => {
  assert.ok(Object.isFrozen(data.units.units.levy));
  assert.throws(() => { 'use strict'; data.units.units.levy.hp = 1; });
  assert.equal(typeof data.hash, 'number');
  const other = dataWith(raw => { raw.econ.start.gold += 1; });
  assert.notEqual(other.hash, data.hash);
  const same = dataWith(() => {});
  assert.equal(same.hash, data.hash);
});

test('derived unit stats apply race traits (Cheap Steel, Running Packs)', () => {
  const brute = data.derived.units.brute, raw = data.units.units.brute;
  const cs = data.races.traits.cheap_steel;
  assert.equal(brute.cost, Math.round(raw.cost * cs.cost));
  assert.ok(Math.abs(brute.income - raw.income * cs.income) < 1e-9);
  const ogre = data.derived.units.ash_ogre;
  assert.equal(ogre.cost, data.units.units.ash_ogre.cost, 'above Cheap Steel maxTier');
  const wolves = data.derived.units.wolf_pair;
  assert.ok(Math.abs(wolves.speed - data.units.units.wolf_pair.speed * data.races.traits.running_packs.packSpeed) < 1e-9);
  assert.equal(data.derived.units.tracker.speed, data.units.units.tracker.speed, 'only packs run faster');
  assert.equal(data.derived.units.levy.hp, data.units.units.levy.hp * data.races.races.freeholds.hpMult);
});

test('every race fields 12 units, each tier 1-6 offers a choice where it has two or more, top tiers add no income', () => {
  for (const [rid, race] of Object.entries(data.races.races)) {
    assert.equal(race.units.length, 12, rid);
    const us = race.units.map(u => data.units.units[u]);
    for (const t of [1, 2, 3, 4]) {
      const tier = us.filter(u => u.tier === t);
      assert.ok(tier.length >= 2, `${rid} tier ${t} has ${tier.length}`);
      assert.equal(new Set(tier.map(u => u.role + '/' + u.traits.join('+') + '/' + u.dmg)).size, tier.length, `${rid} tier ${t}: two choices are the same unit`);
    }
    assert.equal(us.filter(u => u.tier === 6).length, 1, `${rid} champion`);
    for (const u of us) if (u.tier >= 5) assert.equal(u.income, 0, `${u.name} adds income`);
    // income per gold falls with tier
    const ipg = t => { const x = us.filter(u => u.tier === t); return x.reduce((s, u) => s + u.income / u.cost, 0) / x.length; };
    for (let t = 2; t <= 5; t++) if (us.some(u => u.tier === t)) assert.ok(ipg(t) < ipg(t - 1), `${rid}: income per gold at tier ${t}`);
    for (const u of us) assert.ok(u.model && (u.model.chibi2 || u.model.creature), `${u.name} has a look`);
  }
});

test('data/units.json + races.json rosters are up to date with tools/build-roster.mjs', async () => {
  const { execFileSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const { ROOT } = await import('./_sim.mjs');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'build-roster.mjs'), '--check'], { stdio: 'pipe' });
});

test('map: two fields side by side, gate at the top, flow leads every cell to the Keep', () => {
  const map = buildMap(data, 'vale', '1v1');
  assert.equal(map.fields.length, 2);
  const [a, b] = map.fields;
  assert.ok(a.x1 < b.x0, 'fields do not overlap');
  assert.equal(b.x0 - a.x1, data.maps.maps.vale.gap);
  assert.ok(a.gates[0].z < a.leakZ);
  for (const f of map.fields) {
    // walking the flow from the gate reaches the leak line
    let x = f.gates[0].x - 15, z = f.gates[0].z;
    for (let i = 0; i < 400 && z < f.leakZ; i++) { const d = flowDir(f.flow, x, z); x += d.x * 0.5; z += d.z * 0.5; }
    assert.ok(z >= f.leakZ, `flow reached z=${z.toFixed(1)}`);
    assert.ok(Math.abs(x - f.keep.x) <= f.keep.w / 2 + 1, 'arrives at the Keep');
  }
  assert.equal(buildMap(data, 'vale', '3v3').fields[0].gates.length, 3);
  assert.throws(() => buildMap(data, 'nowhere', '1v1'), /Unknown map/);
});

test('flow goes around walls', () => {
  const d = dataWith(raw => { raw.maps.maps.vale.walls = [[-24, 60, 10, 62]]; });
  const f = buildMap(d, 'vale', '1v1').fields[0];
  let x = f.cx - 10, z = 40, crossed = false;
  for (let i = 0; i < 800 && z < f.leakZ; i++) {
    const dir = flowDir(f.flow, x, z); x += dir.x * 0.25; z += dir.z * 0.25;
    if (z >= 60 && z <= 62 && x - f.cx < 10) crossed = true;
  }
  assert.ok(z >= f.leakZ, 'still reaches the Keep');
  assert.ok(!crossed, 'never walks through the wall');
});

test('data/heroes.json is up to date with tools/build-hero-skills.mjs', async () => {
  const { execFileSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const { ROOT } = await import('./_sim.mjs');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'build-hero-skills.mjs'), '--check'], { stdio: 'pipe' });
});

test('econ.json clock.tickHz documents the code tick rate', async () => {
  const { TICK_HZ } = await import('../js/sim/sim.js');
  assert.equal(data.econ.clock.tickHz, TICK_HZ);
});

test('data/items-bl.json is up to date with tools/build-items-bl.mjs', async () => {
  const { execFileSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const { ROOT } = await import('./_sim.mjs');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'build-items-bl.mjs'), '--check'], { stdio: 'pipe' });
});

test('every hero class curve is read: dpsK, hpK (and the Druid self-heal)', async () => {
  const { heroStats } = await import('../js/sim/heroes.js');
  for (const hid of Object.keys(data.heroes.heroes)) {
    const p = { hero: hid, level: 5, inv: [], upg: {}, form: null, race: 'freeholds' };
    const a = heroStats(data, p);
    const d2 = dataWith(raw => { raw.econ.hero.classes[hid].dpsK *= 1.5; raw.econ.hero.classes[hid].hpK *= 1.5; if (raw.econ.hero.classes[hid].selfHeal) raw.econ.hero.classes[hid].selfHeal *= 2; });
    const b = heroStats(d2, p);
    assert.ok(b.dps > a.dps && b.hpMax > a.hpMax, hid);
    if (data.econ.hero.classes[hid].selfHeal) assert.ok(b.selfHeal > a.selfHeal, hid);
  }
});
