// The town (owner round 2, R2.3): buildings, Drill Yard unit upgrades, Sanctum powers with lane
// validation, their dead-data guards, and the banned-name check (R2.9: never "Muster").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, data, hero, run, dataWith, ROOT } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { spawnUnit } from '../js/sim/economy.js';
import { dealDamage } from '../js/sim/combat.js';
import { buildingsFor, buildingOf } from '../js/sim/buildings.js';
import { upgradeCost, UPGRADE_STATS } from '../js/sim/upgrades.js';
import { POWER_EFFECTS } from '../js/sim/powers.js';
import { isHidden } from '../js/sim/traits.js';
import * as Q from '../js/sim/query.js';

const two = (d = data, mode = '1v1') => createSim(config({ mode, players: mode === '1v1' ? [
  { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior' },
  { team: 1, kind: 'human', race: 'thornmane', hero: 'warrior' }] : [
  { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior' }, { team: 0, kind: 'human', race: 'freeholds', hero: 'ranger' },
  { team: 1, kind: 'human', race: 'thornmane', hero: 'warrior' }, { team: 1, kind: 'human', race: 'thornmane', hero: 'druid' }] }), d);
const ctxOf = s => ({ state: s.state, data: s.data, map: s.map, emit: (type, f) => s._queue.push({ ...f, type, tick: s.state.tick }) });
const rejects = s => s.drainEvents().filter(e => e.type === 'reject').map(e => e.reason);

// ── buildings ──
test('every team field has an Outfitter, Barracks, Drill Yard and Sanctum; the hero spawns in shop range', () => {
  for (const mode of ['1v1', '2v2']) {
    const s = two(data, mode);
    const list = buildingsFor(data, s.map, mode);
    assert.equal(list.length, 8);
    for (const team of [0, 1]) {
      const f = s.map.fields[team];
      for (const kind of ['shop', 'barracks', 'drillyard', 'sanctum']) {
        const b = buildingOf(ctxOf(s), team, kind);
        assert.ok(b && b.id === `t${team}.${kind}` && b.x > f.x0 && b.x < f.x1 && b.z > f.z0 && b.z < f.z1, `${mode} ${b && b.id}`);
        assert.ok(b.name && b.desc);
      }
      const shop = buildingOf(ctxOf(s), team, 'shop');
      assert.ok(Math.hypot(f.spawn.x - shop.x, f.spawn.z - shop.z) <= shop.radius, 'spawn inside the Outfitter radius');
    }
    assert.deepEqual(Q.buildingsInfo(s.state, data).map(b => b.id), list.map(b => b.id));
  }
  assert.equal(data.buildings.kinds.barracks.name, 'Barracks');
});

// ── Drill Yard ──
test('upgrade costs rise per level; max and gold refuse', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1e6;
  const c1 = upgradeCost(data, p, 'damage');
  s.step([{ p: 0, type: 'upgradeUnit', id: 'damage' }]);
  assert.equal(p.upg.damage, 1);
  assert.ok(upgradeCost(data, p, 'damage') > c1);
  for (let i = 0; i < 20; i++) s.step([{ p: 0, type: 'upgradeUnit', id: 'damage' }]);
  assert.equal(p.upg.damage, data.upgrades.upgrades.damage.max);
  s.drainEvents(); s.step([{ p: 0, type: 'upgradeUnit', id: 'damage' }]);
  assert.deepEqual(rejects(s), ['max']);
  p.gold = 0; s.step([{ p: 0, type: 'upgradeUnit', id: 'health' }]);
  assert.deepEqual(rejects(s), ['gold']);
  const row = Q.upgradesInfo(s.state, data, 0).rows.find(r => r.id === 'damage');
  assert.equal(row.level, data.upgrades.upgrades.damage.max); assert.equal(row.cost, null);
  assert.ok(row.name && row.desc && row.stats.length === 2);
});

test('upgrades apply to units already on the field and to new sends; health keeps its share', () => {
  const s = two(); const p = s.state.players[0];
  const ctx = ctxOf(s), f = s.map.fields[1];
  const old = spawnUnit(ctx, 1, 0, 'levy', { x: f.cx, z: 20 });
  s.step([]);
  old.hp = old.hpMax / 2;
  const dps0 = old._dps, hp0 = old.hpMax, spd0 = old._spd, atk0 = old._atkEvery, leak0 = old._leak;
  p.gold = 1e6;
  for (const id of ['damage', 'health', 'moveSpeed', 'attackSpeed', 'siege']) for (let i = 0; i < 3; i++) s.step([{ p: 0, type: 'upgradeUnit', id }]);
  s.step([]);
  const U = data.upgrades.upgrades;
  assert.ok(Math.abs(old._dps - dps0 * (1 + 3 * U.damage.perLevel)) < 1e-9);
  assert.ok(Math.abs(old.hpMax - hp0 * (1 + 3 * U.health.perLevel)) < 1e-9);
  assert.ok(Math.abs(old.hp / old.hpMax - 0.5) < 0.02, 'share kept');
  assert.ok(Math.abs(old._spd - spd0 * (1 + 3 * U.moveSpeed.perLevel)) < 1e-9);
  assert.ok(old._atkEvery < atk0);
  assert.ok(Math.abs(old._leak - leak0 * (1 + 3 * U.siege.perLevel)) < 1e-9);
  const fresh = spawnUnit(ctx, 1, 0, 'levy', { x: f.cx + 2, z: 20 });
  s.step([]);
  assert.ok(Math.abs(fresh.hpMax - hp0 * (1 + 3 * U.health.perLevel)) < 1e-9, 'new sends upgraded too');
  // the other player's units are untouched
  const theirs = spawnUnit(ctx, 0, 1, 'wolf_pair', { x: s.map.fields[0].cx, z: 20 });
  s.step([]);
  assert.equal(theirs.hpMax, data.derived.units.wolf_pair.hp);
});

test('armour cuts damage taken, life steal and regeneration heal sent units', () => {
  const s = two(); const p = s.state.players[0];
  const ctx = ctxOf(s), f = s.map.fields[1];
  const u = spawnUnit(ctx, 1, 0, 'shieldbearer', { x: f.cx, z: 20 });
  s.step([]);
  const before = u.hp; dealDamage(ctx, null, u, 100, 'blade', { raw: true }); const plain = before - u.hp;
  p.gold = 1e6;
  for (let i = 0; i < 5; i++) { s.step([{ p: 0, type: 'upgradeUnit', id: 'armour' }]); }
  s.step([]);
  const b2 = u.hp; dealDamage(ctx, null, u, 100, 'blade', { raw: true });
  assert.ok(Math.abs((b2 - u.hp) - plain * (1 - 5 * data.upgrades.upgrades.armour.perLevel)) < 1e-6);
  // regeneration
  s.step([{ p: 0, type: 'upgradeUnit', id: 'regen' }]); s.step([]);
  u.hp = u.hpMax / 2; const h0 = u.hp; s.step([]);
  assert.ok(u.hp > h0);
  // life steal: the unit hits the enemy hero
  s.step([{ p: 0, type: 'upgradeUnit', id: 'lifeSteal' }]); s.step([]);
  const { onUnitHit } = upgradesMod;
  u.hp = u.hpMax / 2; const h1 = u.hp; onUnitHit(ctx, u, 100);
  assert.ok(Math.abs(u.hp - (h1 + 100 * data.upgrades.upgrades.lifeSteal.perLevel)) < 1e-9);
});
const upgradesMod = await import('../js/sim/upgrades.js');

test('every upgrade stat has a handler and every upgrades.json number changes the sim', () => {
  for (const id of data.upgrades.order) assert.ok(UPGRADE_STATS[data.upgrades.upgrades[id].stat], id);
  const scene = d => {
    const s = two(d); const p = s.state.players[0];
    p.gold = 1e6;
    s.step(data.upgrades.order.flatMap(id => [0, 1].map(() => ({ p: 0, type: 'upgradeUnit', id }))));
    for (let i = 0; i < 6; i++) s.step([{ p: 0, type: 'send', unit: 'shieldbearer' }]);
    s.step([{ p: 1, type: 'amove', x: s.map.fields[1].cx, z: 30 }]);   // the defender meets them: they fight, bleed and heal
    let h = '';
    for (let t = 0; t < 30; t++) { run(s, 50); h += s.hash() + ','; }
    return h + p.gold;
  };
  const ref = scene(data);
  const dead = [];
  for (const id of data.upgrades.order) for (const k of ['perLevel', 'max', 'base', 'grow']) {
    const d = dataWith(raw => { const r = raw.upgrades.upgrades[id]; if (k === 'base' || k === 'grow') r.cost[k] *= 1.37; else if (k === 'max') r.max = 1; else r.perLevel *= 1.37; });
    if (scene(d) === ref) dead.push(`${id}.${k}`);
  }
  assert.deepEqual(dead, []);
});

// ── Sanctum ──
const cast = (s, id, x, z, pid = 0) => s.step([{ p: pid, type: 'power', id, x, z }]);

test('powers land only where their kind allows, with a reason', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1e6;
  const own = s.map.fields[0], foe = s.map.fields[1];
  s.drainEvents();
  cast(s, 'frost_field', foe.cx, 60); assert.deepEqual(rejects(s), ['ownFieldOnly']);
  cast(s, 'skyfall', own.cx, 60); assert.deepEqual(rejects(s), ['enemyFieldOnly']);
  cast(s, 'thunderstorm', (own.x1 + foe.x0) / 2, 60); assert.deepEqual(rejects(s), ['notInField']);
  cast(s, 'frost_field', own.cx, 60); cast(s, 'skyfall', foe.cx, 60); cast(s, 'thunderstorm', own.cx, 60); cast(s, 'far_sight', foe.cx, 60);
  assert.deepEqual(rejects(s), []);
  cast(s, 'frost_field', own.cx, 60); assert.deepEqual(rejects(s), ['cooldown']);
  p.gold = 0; cast(s, 'earthshaker', own.cx, 60); assert.deepEqual(rejects(s), ['gold']);
  assert.equal(Q.powerTargetCheck(s.state, data, 0, 'binding_roots', foe.cx, 60), 'ownFieldOnly');
  // the hero may be dead
  const s2 = two(); s2.state.players[0].gold = 1e4; hero(s2, 0).alive = false; s2.drainEvents();
  cast(s2, 'frost_field', s2.map.fields[0].cx, 60); assert.deepEqual(rejects(s2), []);
  const rows = Q.powersInfo(s.state, data, 0).rows;
  assert.equal(rows.length, 12);
  for (const k of ['defensive', 'offensive', 'neutral']) assert.ok(rows.filter(r => r.kind === k).length >= 4, k);
  for (const r of rows) assert.ok(r.name && r.desc && r.stats.length, r.id);
});

test('each power does what it says', () => {
  const lab = () => {
    const s = two(); const p = s.state.players[0]; p.gold = 1e6;
    const ctx = ctxOf(s), own = s.map.fields[0], foe = s.map.fields[1];
    const atk = spawnUnit(ctx, 0, 1, 'tracker', { x: own.cx, z: 60 }); atk.hp = atk.hpMax = 1e5; atk._spd = 0;
    const mine = spawnUnit(ctx, 1, 0, 'levy', { x: foe.cx, z: 60 }); mine._spd = 0;
    const mh = hero(s, 0); mh.x = mh.px = own.cx + 1; mh.z = mh.pz = 60; mh._ord.k = 'stop';
    const fh = hero(s, 1); fh.x = fh.px = foe.cx + 1; fh.z = fh.pz = 60; fh._ord.k = 'stop';
    return { s, p, ctx, own, foe, atk, mine, mh, fh };
  };
  const has = (e, id) => e.statuses.some(x => x.id === id);
  let L = lab(); cast(L.s, 'frost_field', L.own.cx, 60); run(L.s, 12); assert.ok(has(L.atk, 'slow'), 'frost slows');
  L = lab(); cast(L.s, 'binding_roots', L.own.cx, 60); assert.ok(has(L.atk, 'root'), 'roots');
  L = lab(); L.mh.hp = 100; cast(L.s, 'mending_light', L.own.cx, 60); assert.ok(L.mh.hp > 100 + L.mh.hpMax * 0.39 && has(L.mh, 'regen'), 'heals');
  L = lab(); cast(L.s, 'stone_ward', L.own.cx, 60); assert.ok(L.mh.statuses.find(x => x.id === 'barrier').power > 0, 'barrier');
  L = lab(); { const h0 = L.fh.hp; cast(L.s, 'skyfall', L.foe.cx, 60); assert.equal(L.fh.hp, h0, 'not yet'); L.fh._ord.k = 'stop'; run(L.s, 31); assert.ok(L.fh.hp < h0, 'lands'); }
  L = lab(); cast(L.s, 'withering_hex', L.foe.cx, 60); assert.ok(has(L.fh, 'quarry') && has(L.fh, 'slow') && !has(L.mine, 'quarry'), 'hex on heroes');
  L = lab(); { const n0 = L.s.state.ents.filter(e => e.kind === 'unit' && e.owner === 0).length; cast(L.s, 'loose_the_pack', L.foe.cx, 60);
    const wolves = L.s.state.ents.filter(e => e.kind === 'unit' && e.owner === 0 && e.type === 'wolf_pair');
    assert.equal(wolves.length, 3 * data.derived.units.wolf_pair.bodies); assert.ok(wolves.every(w => w.field === 1 && w._bounty === 0 && w.hpMax === data.derived.units.wolf_pair.hp * 8));
    assert.equal(L.s.state.players[0].income, data.econ.start.income, 'no income'); assert.ok(n0 >= 1); }
  L = lab(); cast(L.s, 'war_banner', L.foe.cx, 60); assert.ok(has(L.mine, 'might') && has(L.mine, 'haste'), 'banner');
  L = lab(); { const st = spawnUnit(L.ctx, 1, 0, 'briar_stalker', { x: L.foe.cx - 6, z: 60 }); assert.ok(isHidden(st, L.fh.x, L.fh.z));
    // reveal is for the caster's ENEMIES' hidden units: player 1 reveals player 0's stalker in its own field
    L.s.state.players[1].gold = 1e4; cast(L.s, 'far_sight', L.foe.cx, 60, 1); assert.ok(!isHidden(st, L.fh.x, L.fh.z), 'revealed'); }
  L = lab(); { const h0 = L.atk.hp; cast(L.s, 'thunderstorm', L.own.cx, 60); run(L.s, 25); assert.ok(L.atk.hp < h0, 'storm'); }
  L = lab(); cast(L.s, 'earthshaker', L.own.cx, 60); assert.ok(has(L.atk, 'stun'), 'stun');
  L = lab(); cast(L.s, 'blessing_of_valour', L.own.cx, 60); assert.ok(has(L.mh, 'might') && has(L.mh, 'haste'), 'blessing');
});

test('every power effect has a handler and every powers.json number changes the sim', () => {
  for (const id of data.powers.order) for (const ef of data.powers.powers[id].effects) assert.ok(POWER_EFFECTS[ef.do], `${id}: ${ef.do}`);
  assert.deepEqual(data.powers.order.slice().sort(), Object.keys(data.powers.powers).sort());
  const scene = (d, id) => {
    const s = two(d, '2v2'); const p = s.state.players[0];
    p.gold = 1000;
    const ctx = ctxOf(s), own = s.map.fields[0], foe = s.map.fields[1], kind = d.powers.powers[id].kind;
    const fx = kind === 'offensive' ? foe : own, caster = 0;
    // bodies at spread distances, heroes just outside the power's radius (inside once it grows)
    const R = Math.max(...d.powers.powers[id].effects.map(e => e.radius || 0)) || 4;
    for (let i = 0; i < 6; i++) { const e = spawnUnit(ctx, fx.id, fx === own ? 2 : 0, i % 2 ? 'briar_stalker' : 'tracker', { x: fx.cx - i * R * 0.25, z: 60 }); e.hp = e.hpMax = 3000; e._spd = 0.2; }
    const hx = Math.min(R * 1.15 + 1, 20);
    const mh = hero(s, 0); mh.x = mh.px = own.cx + hx; mh.z = mh.pz = 60; mh.hp = mh.hpMax * 0.4; mh._ord.k = 'stop';
    const fh = hero(s, 2); fh.x = fh.px = foe.cx + hx; fh.z = fh.pz = 60; fh._ord.k = 'stop';
    // a second hero per side right on the spot (2v2), hurt so heals and shields show
    const mh2 = hero(s, 1); mh2.x = mh2.px = own.cx + 0.5; mh2.z = mh2.pz = 60.5; mh2.hp = mh2.hpMax * 0.3; mh2._ord.k = 'stop';
    const fh2 = hero(s, 3); fh2.x = fh2.px = foe.cx + 0.5; fh2.z = fh2.pz = 60.5; fh2._ord.k = 'stop';
    s.step([{ p: caster, type: 'power', id, x: fx.cx, z: 60 }]);
    let h = '';
    for (let t = 0; t < 400; t++) { s.step(t === 380 ? [{ p: caster, type: 'power', id, x: fx.cx, z: 60 }] : []); if (t % 10 === 0) h += s.hash() + ','; }
    return h + p.gold;
  };
  const dead = [];
  for (const id of data.powers.order) {
    const ref = scene(data, id);
    const P = data.powers.powers[id];
    const paths = [['cost'], ['cooldown']];
    P.effects.forEach((ef, i) => { for (const k of Object.keys(ef)) if (typeof ef[k] === 'number') paths.push(['effects', i, k]); });
    for (const path of paths) {
      const d = dataWith(raw => { let o = raw.powers.powers[id]; for (const k of path.slice(0, -1)) o = o[k]; const k = path[path.length - 1]; o[k] = k === 'cooldown' ? (o[k] > 19 ? 10 : 30) : k === 'count' ? o[k] + 1 : o[k] * 1.37 + 0.07; });
      if (scene(d, id) === ref) dead.push(`${id}.${path.join('.')}`);
    }
  }
  assert.deepEqual(dead, []);
});

// ── names ──
test('no "Muster" (or other banned names) in stream I files', () => {
  const files = ['data/items-bl.json', 'data/shop.json', 'data/upgrades.json', 'data/powers.json', 'data/buildings.json',
    'js/sim/items.js', 'js/sim/shop.js', 'js/sim/upgrades.js', 'js/sim/powers.js', 'js/sim/buildings.js', 'tools/build-items-bl.mjs'];
  const banned = /muster|\bember|veil\b|heroic|mythic|hearthstone|soulbound|counterspell|lay on hands|consecration|healing wave|last stand|mirror image|hellfire|starfall|barkskin|blink\b/i;
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    const lines = text.split('\n').filter(l => banned.test(l));
    assert.deepEqual(lines, [], f);
  }
  // player-facing names only in the item / upgrade / power / building tables
  const names = [...Object.values(data['items-bl'].items), ...Object.values(data.upgrades.upgrades), ...Object.values(data.powers.powers), ...Object.values(data.buildings.kinds)].map(r => r.name);
  assert.equal(new Set(names).size, names.length, 'names are unique');
});
