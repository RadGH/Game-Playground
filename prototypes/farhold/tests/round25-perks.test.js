// node --test prototypes/farhold/tests/round25-perks.test.js
//
// Round 25 #8 — "Change 'The Close Ground' and 'The Deep Study' to each branch into 3-5 separate
// paths… a keystone fitting different builds: 2h dual wielder, 2h single wield, dual 1h, 1h +
// shield; and for the magic side… a keystone for each element type that does something
// extraordinary and new, and keep the current 'Blood price' as an option too."
//
// The shape is checked, and then every new keystone is TAKEN and made to act through the running
// code (rpg.derive, rpg.attackMods, fx.onKill + js/uniques.js afterKill, tickAuras, onDamaged).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Rpg } from '../js/rpg.js';
import { EFFECTS, PERK_KS, handsOf } from '../js/effects.js';
import { BRANCHES, KEYSTONES, buildForest, canTake, allocate, handsFit } from '../js/perks.js';
import { applyStatus, createSkillBar } from '../js/skills.js';
import { afterKill, afterDamaged, tickAuras, resolveAttack } from '../js/uniques.js';
import { makeRng } from '../../emberveil/js/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));
const items = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));
const balance = read('data/balance.json');
const skillData = read('data/skills.json');
const r = new Rpg(items, balance);
const forest = r.forest;
const nodeOf = id => forest.nodes.find(n => n.keystoneId === id);

function withKeystone(id, { main = 'sword', off = null } = {}) {
  const p = r.createPlayer({ classId: 'warrior', level: 50 });
  if (main) r.equip(p, r.loot.generate(main, 'normal', 'medium', { rng: makeRng(1) }));
  if (off) r.equip(p, r.loot.generate(off, 'normal', 'medium', { rng: makeRng(2) }), 'offhand');
  p.perks = [nodeOf(id).id];
  r.refresh(p, { full: true });
  return p;
}
const foe = (id, x = 0, z = 0) => ({ id, x, z, hp: 1e6, maxHp: 1e6, dying: null, statuses: {} });
function env(p, enemies, log = []) {
  return {
    log, player: p, at: () => ({ x: 0, z: 0 }), rng: () => 0,
    near: (x, z, rad, except) => enemies.filter(e => e !== except && e.dying == null && Math.hypot(e.x - x, e.z - z) <= rad),
    strikeOne: (e, o) => { log.push(['one', e.id, o.element]); return { amount: 10 }; },
    strikeArea: (x, z, rad, o) => enemies.filter(e => Math.hypot(e.x - x, e.z - z) <= rad).map(e => { log.push(['area', e.id, o.element]); return { enemy: e, result: { amount: 10 } }; }),
    applyStatus: (t, type, spec, power) => { applyStatus(t, type, spec, power); log.push(['status', t.id, type]); },
    statusSpec: type => skillData.statuses[type] || { seconds: 4, perSecond: 1 },
    push: (e) => log.push(['push', e.id]), later: (ms, fn) => fn(), dropPool: () => {},
  };
}

test('both arms branch into four paths, each ending in its keystones, and the old ids still work', () => {
  assert.equal(BRANCHES.melee.length, 4);
  assert.equal(BRANCHES.arcane.length, 4);
  for (const key of ['melee', 'arcane']) {
    for (const path of BRANCHES[key]) {
      assert.ok(path.nodes.length >= 3 && path.nodes.length <= 5, `${path.key} has ${path.nodes.length} nodes`);
      assert.ok(KEYSTONES.some(k => k.branch === path.key), `${path.key} ends in nothing`);
    }
  }
  // the four builds that were asked for, and one keystone per element plus Blood Price
  const melee = KEYSTONES.filter(k => k.arm === 'melee').map(k => k.id).sort();
  assert.deepEqual(melee, ['doubled_grasp', 'flurry', 'full_swing', 'shield_wall']);
  const arcane = KEYSTONES.filter(k => k.arm === 'arcane').map(k => k.id).sort();
  assert.deepEqual(arcane, ['blood_magic', 'halo', 'hollow_pact', 'overflow', 'plague_bearer', 'pyre_heart', 'shatter', 'storm_within']);
  assert.equal(forest.byId.get('melee:7:0').keystoneId, 'doubled_grasp');
  assert.equal(forest.byId.get('arcane:7:0').keystoneId, 'blood_magic');
  for (const k of KEYSTONES) if (k.power) assert.ok(EFFECTS[k.power], `${k.id}'s power ${k.power} is not in the registry`);
});

test('every path keystone can be walked to from the hub', () => {
  for (const k of KEYSTONES.filter(x => x.branch)) {
    const player = { level: 99, perks: [] };
    const target = nodeOf(k.id);
    // walk: take anything on the same arm on the way, nearest first, until the keystone opens
    for (let i = 0; i < 60 && !canTake(player, forest, target.id).ok; i++) {
      const next = forest.nodes
        .filter(n => n.arm === target.arm && canTake(player, forest, n.id).ok && (!n.branch || n.branch === target.branch))
        .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
      if (!next) break;
      allocate(player, forest, next.id);
    }
    assert.ok(canTake(player, forest, target.id).ok, `${k.name} could not be reached`);
  }
});

test('a melee keystone only counts in the hands it names', () => {
  const two = withKeystone('full_swing', { main: 'greatsword' });
  assert.equal(handsOf(two), 'twoOne');
  const bare = r.createPlayer({ classId: 'warrior', level: 50 });
  r.equip(bare, r.loot.generate('greatsword', 'normal', 'medium', { rng: makeRng(1) }));
  r.refresh(bare, { full: true });
  assert.equal(two.derived.damagePct - bare.derived.damagePct, 30, 'Full Swing gave no damage with a two-hander');
  const board = withKeystone('full_swing', { main: 'sword', off: 'shield' });
  assert.ok(!handsFit(board, 'twoOne'));
  const boardBare = r.createPlayer({ classId: 'warrior', level: 50 });
  r.equip(boardBare, r.loot.generate('sword', 'normal', 'medium', { rng: makeRng(1) }));
  r.equip(boardBare, r.loot.generate('shield', 'normal', 'medium', { rng: makeRng(2) }), 'offhand');
  r.refresh(boardBare, { full: true });
  assert.equal(board.derived.damagePct, boardBare.derived.damagePct, 'Full Swing counted with a sword and shield');
});

test('Full Swing slams on every third swing of a lone two-hander', () => {
  const p = withKeystone('full_swing', { main: 'greatsword' });
  const slams = [1, 2, 3, 4, 5, 6].map(() => !!r.attackMods(p, 'melee').slam);
  assert.deepEqual(slams, [false, false, true, false, false, true]);
  const log = [];
  resolveAttack(env(p, [foe('a', 1, 0), foe('b', 2, 0)], log), { slam: { radius: 3.5, power: 0.6, push: 2.5 } }, [], { x: 0, z: 0 });
  assert.ok(log.filter(l => l[0] === 'push').length === 2, 'the slam threw nothing back');
});

test('Flurry echoes hits only with a one-hander in each hand', () => {
  const dual = withKeystone('flurry', { main: 'sword', off: 'dagger' });
  assert.equal(handsOf(dual), 'dualOne');
  assert.equal(r.attackMods(dual, 'melee').echo?.chance, PERK_KS.flurry.chance);
  const single = withKeystone('flurry', { main: 'sword' });
  assert.ok(!r.attackMods(single, 'melee').echo);
});

test('Shield Wall answers a block with a shockwave, and nothing else does', () => {
  const p = withKeystone('shield_wall', { main: 'sword', off: 'shield' });
  const blocked = r.fx.onDamaged({ self: p, amount: 5, blocked: true });
  assert.equal(blocked.procs?.[0]?.kind, 'nova');
  const unblocked = r.fx.onDamaged({ self: p, amount: 5, blocked: false });
  assert.ok(!unblocked.procs?.length);
});

test('Pyre Heart: a burning body bursts and sets the crowd burning; other elements pay', () => {
  const p = withKeystone('pyre_heart', { main: 'wand' });
  const dead = foe('dead'); dead.statuses.burn = { power: 5 };
  const near = foe('near', 2, 0);
  const post = r.fx.onKill({ self: p, target: dead });
  assert.ok(post.burst, 'no burst');
  const log = [];
  const out = afterKill(env(p, [dead, near], log), post, dead);
  assert.deepEqual(out.burst.map(e => e.id), ['near']);
  assert.ok(near.statuses.burn, 'the burst set nothing burning');
  assert.equal(r.fx.dmgOut({ self: p, element: 'ice', target: near }).mult.toFixed(2), '0.80');
  assert.equal(r.fx.dmgOut({ self: p, element: 'fire', target: near }).mult.toFixed(2), '1.00');
});

test('Shatter throws shards off a chilled death, and a chilled enemy takes more', () => {
  const p = withKeystone('shatter', { main: 'wand' });
  const dead = foe('dead'); dead.statuses.chill = {};
  const post = r.fx.onKill({ self: p, target: dead });
  const out = afterKill(env(p, [dead, foe('a', 2, 0), foe('b', 3, 0), foe('c', 4, 0), foe('d', 5, 0)]), post, dead);
  assert.equal(out.shards.length, PERK_KS.shatter.shards);
  const chilled = foe('x'); chilled.statuses.chill = {};
  assert.equal(r.fx.dmgOut({ self: p, element: 'ice', target: chilled }).mult.toFixed(2), (1 + PERK_KS.shatter.takeMore).toFixed(2));
});

test('Storm Within strikes the nearest and shocks it, in a fight only', () => {
  const p = withKeystone('storm_within', { main: 'wand' });
  const near = foe('near', 3, 0), far = foe('far', 8, 0);
  const log = [];
  assert.deepEqual(tickAuras(env(p, [near, far], log), r, p, 2, { fighting: false }), []);
  tickAuras(env(p, [near, far], log), r, p, 2, { fighting: true });
  assert.deepEqual(log.filter(l => l[0] === 'one').map(l => l[1]), ['near']);
  assert.ok(near.statuses.shock, 'the spark shocked nothing');
});

test('Plague Bearer and Hollow Pact pass their status on from a body', () => {
  for (const [id, type] of [['plague_bearer', 'poison'], ['hollow_pact', 'curse']]) {
    const p = withKeystone(id, { main: 'wand' });
    const dead = foe('dead'); dead.statuses[type] = { power: 4 };
    const near = foe('near', 2, 0);
    const out = afterKill(env(p, [dead, near]), r.fx.onKill({ self: p, target: dead }), dead);
    assert.deepEqual(out.spread.map(e => e.id), ['near'], `${id} spread nothing`);
    assert.ok(near.statuses[type], `${id} did not ${type} the neighbour`);
  }
});

test('Hollow Pact and Halo heal on their own element only', () => {
  for (const [id, element] of [['hollow_pact', 'shadow'], ['halo', 'holy']]) {
    const p = withKeystone(id, { main: 'wand' });
    p.hp = 10;
    r.fx.onHit({ self: p, target: foe('t'), amount: 200, element });
    assert.ok(p.hp > 10, `${id} healed nothing on ${element}`);
    const hp = p.hp;
    r.fx.onHit({ self: p, target: foe('t'), amount: 200, element: 'fire' });
    assert.equal(p.hp, hp, `${id} healed on fire`);
  }
  const p = withKeystone('halo', { main: 'wand' });
  assert.ok(r.auraList(p).some(a => a.id === 'halo' && a.status === 'weaken'));
});

test('Overflow echoes every third cast and costs more mana; Blood Price is still there', () => {
  const p = withKeystone('overflow', { main: 'wand' });
  const echoes = [1, 2, 3, 4, 5, 6].map(() => r.fx.onCast({ self: p }).echoCast || 0);
  assert.deepEqual(echoes.map(e => e > 0), [false, false, true, false, false, true]);
  const bar = createSkillBar({ data: skillData, player: p, rpg: r });
  assert.equal(bar.costFor({ mp: 20 }), 25);
  const blood = withKeystone('blood_magic', { main: 'wand' });
  assert.ok(blood.perkFlags.bloodMagic);
});
