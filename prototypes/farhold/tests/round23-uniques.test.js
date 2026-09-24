// node --test prototypes/farhold/tests/round23-uniques.test.js
//
// Round 23 — "Generate 2 uniques of every type, including weapon sub types like wands of fire. For
// weapons without subtypes generate 4 uniques instead. Some of these new weapons could inflict
// special dots or impart effects on the user or have interesting auto-attack mechanics."
//
// Three things are checked, and the third is the one that matters:
//
//   1. THE COUNT. Every type in js/uniques.js UNIQUE_TYPES has exactly as many uniques as the rule
//      says, and every unique's own `type` is the type the game would actually treat it as.
//   2. EVERY UNIQUE RESOLVES. Its base exists, its power is in the registry, every affix on it has
//      an effect, the item generates, and a caster comes out the element it was written for.
//   3. EVERY NEW POWER DOES WHAT ITS CARD SAYS, asked through the running code — `rpg.strike`,
//      `tickStatuses`, `rpg.attackMods` and js/uniques.js's resolvers against a field of plain
//      objects. This project's signature fault is finished data that nothing reads; comparing the
//      data to a constant passes against every orphan, so each power is made to act and the
//      outcome is measured.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Rpg, attuneWeapon, elementOf } from '../js/rpg.js';
import { EFFECTS, U23, effectFor, describeAffix } from '../js/effects.js';
import { applyStatus, tickStatuses, slowOf, outgoingFrom } from '../js/skills.js';
import { WEAPON_PATTERNS, wandBehaviour, staffSpell } from '../js/weapons.js';
import { GEAR_BASES } from '../js/gear.js';
import {
  UNIQUE_TYPES, UNIQUE_TARGET, CASTER_ELEMENTS, typeOfUnique, installUniques,
  resolveAttack, afterKill, afterDamaged, tickAuras,
} from '../js/uniques.js';
import { makeRng } from '../../emberveil/js/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));
const src = f => readFileSync(join(here, '..', f), 'utf8');

const uniqueData = read('data/uniques.json');
const toolData = read('data/tools.json');
const balance = read('data/balance.json');
const skillData = read('data/skills.json');
const bestiary = read('data/enemies.json');
const freshItems = () => JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));
/** The ids Emberveil's own file already had — anything else a unique names is a round-23 power. */
const SHARED_POWERS = new Set(Object.keys(freshItems().legendaryEffects));

function world() {
  const items = freshItems();
  installUniques(items, uniqueData, { tools: toolData, describe: id => EFFECTS['legendary:' + id]?.desc() });
  const r = new Rpg(items, balance);
  return { items, r };
}

/** A level-50 character wearing the unique that carries `power` (or the named unique). */
function wearing(power, { uniqueId = null, seed = 7 } = {}) {
  const { items, r } = world();
  const u = uniqueId ? items.uniques.find(x => x.id === uniqueId) : items.uniques.find(x => x.farhold && x.legendaryEffect === power);
  assert.ok(u, `no unique carries ${power}`);
  const p = r.createPlayer({ classId: 'warrior', level: 50 });
  const item = attuneWeapon(r.loot.generateUnique(u.id, makeRng(seed)));
  const refused = r.equip(p, item);
  assert.ok(!refused?.refused, `could not equip ${u.name}: ${refused?.why || refused?.refused}`);
  r.refresh(p, { full: true });
  return { r, p, item, u };
}

/** A plain enemy with a lot of health, standing at (x, z). */
function foe(r, x = 0, z = 0, over = {}) {
  const def = bestiary.enemies.find(e => !e.ranged) || bestiary.enemies[0];
  const e = r.makeEnemy(def, 20, makeRng(3));
  Object.assign(e, { id: 'e' + Math.round(x * 100 + z), x, z, hp: 1e6, maxHp: 1e6, dying: null, statuses: {} }, over);
  return e;
}

const statusFn = (t, type, spec, power = 1) => applyStatus(t, type, spec, power);

/** An rng that always answers `v`, with the two helpers `rpg.strike` asks of one. */
function fixedRng(v) {
  const f = () => v;
  f.range = (a, b) => a + (b - a) * v;
  f.pick = list => list[0];
  return f;
}

/** A field of plain objects over the REAL `rpg.strike`. `log` records every side effect. */
function fakeEnv(r, p, enemies, { rng = () => 0 } = {}) {
  const log = [];
  const strike = (e, power, element) => {
    const res = r.strike(p, e, makeRng(11), { multiplier: power, element, proc: true, applyStatus: statusFn });
    if (res.dead) e.dying = 0;
    return res;
  };
  const env = {
    log, player: p,
    at: () => ({ x: 0, z: 0 }),
    rng,
    near: (x, z, rad, except) => enemies.filter(e => e !== except && e.dying == null && Math.hypot(e.x - x, e.z - z) <= rad),
    strikeOne(e, { power = 1, element = 'physical' } = {}) { const res = strike(e, power, element); log.push(['one', e.id, element, power, res.amount]); return res; },
    strikeArea(x, z, rad, { power = 1, element = 'physical' } = {}) {
      const hits = enemies.filter(e => e.dying == null && Math.hypot(e.x - x, e.z - z) <= rad).map(e => ({ enemy: e, result: strike(e, power, element) }));
      log.push(['area', rad, element, hits.map(h => h.enemy.id)]);
      return hits;
    },
    push: (e, fx, fz, m) => log.push(['push', e.id, m]),
    dropPool: spec => log.push(['pool', spec]),
    later: (ms, fn) => { log.push(['later', ms]); fn(); },
    applyStatus: statusFn,
    applySelf: (type, spec) => applyStatus(p, type, spec, 1),
    statusSpec: type => skillData.statuses[type] || null,
    kill: e => { e.dying = 0; log.push(['kill', e.id]); },
  };
  return env;
}

/** The multiplier the attacker's powers put on a hit against this target. */
const mult = (r, p, target, extra = {}) => r.fx.dmgOut({ self: p, target, element: 'physical', ...extra }).mult;

// ================================================================ 1. the count

test('R23.1 — the taxonomy adds up to the rule: 4 per plain weapon, 2 per caster element, 2 per everything else', () => {
  const per = { weapon: 4, caster: 2, armour: 2, other: 2 };
  for (const t of UNIQUE_TYPES) assert.equal(t.per, per[t.group], `${t.key} is on the wrong count`);
  assert.equal(UNIQUE_TYPES.filter(t => t.group === 'caster').length, 5, 'the five casters are wand, staff, sceptre, orb and tome');
  assert.deepEqual(CASTER_ELEMENTS, ['fire', 'ice', 'lightning', 'poison', 'shadow', 'arcane']);
  assert.equal(UNIQUE_TARGET, 184);
  assert.equal(uniqueData.uniques.length, UNIQUE_TARGET);
});

test('R23.1 — every type holds exactly its share, and every unique is the type the game treats it as', () => {
  const items = freshItems();
  const counts = new Map();
  for (const u of uniqueData.uniques) {
    const t = typeOfUnique(u, items, WEAPON_PATTERNS);
    assert.ok(t, `${u.id} is no type at all`);
    assert.equal(t.key, u.type, `${u.id} says it is a ${u.type}; the game would treat it as a ${t.key}`);
    const key = t.element ? `${t.key}/${t.element}` : t.key;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const t of UNIQUE_TYPES) {
    for (const sub of t.subtypes || [null]) {
      const key = sub ? `${t.key}/${sub}` : t.key;
      assert.equal(counts.get(key) || 0, t.per, `${key} has ${counts.get(key) || 0} uniques, the rule says ${t.per}`);
      counts.delete(key);
    }
  }
  assert.deepEqual([...counts.keys()], [], 'uniques of a type the taxonomy does not list');
});

test('R23.1 — every act from 1 to 6 has uniques, and no act is a desert', () => {
  const byAct = [0, 0, 0, 0, 0, 0, 0];
  for (const u of uniqueData.uniques) byAct[u.act]++;
  for (let a = 1; a <= 6; a++) assert.ok(byAct[a] >= 15, `act ${a} has only ${byAct[a]} uniques`);
});

// ================================================================ 2. every unique resolves

test('R23.2 — every unique names a real base and a real power, and every affix on it has an effect', () => {
  const items = freshItems();
  for (const u of uniqueData.uniques) {
    if (u.gearBase) assert.ok(GEAR_BASES[u.gearBase], `${u.id}: no gear base ${u.gearBase}`);
    else if (u.toolBase) assert.ok(toolData.bases.some(b => b.id === u.toolBase), `${u.id}: no tool base ${u.toolBase}`);
    else assert.ok(items.weaponBases[u.baseItemId] || items.armorBases[u.baseItemId], `${u.id}: no base ${u.baseItemId}`);
    assert.ok(EFFECTS['legendary:' + u.legendaryEffect], `${u.id}: no power ${u.legendaryEffect}`);
    for (const a of [...u.fixedAffixes, ...u.randomAffixes]) assert.ok(effectFor(a), `${u.id}: ${a.stat} has no effect`);
    assert.ok(u.lore && u.lore.length > 12, `${u.id} has no lore`);
    assert.ok(u.act >= 1 && u.act <= 6, `${u.id} act ${u.act}`);
  }
  const ids = uniqueData.uniques.map(u => u.id);
  assert.equal(new Set(ids).size, ids.length, 'two uniques share an id');
  const names = uniqueData.uniques.map(u => u.name);
  assert.equal(new Set(names).size, names.length, 'two uniques share a name');
  // and none of them collides with Emberveil's own
  for (const id of ids) assert.ok(!items.uniques.some(x => x.id === id), `${id} is also an Emberveil unique`);
});

test('R23.2 — every unique generates, equips, carries its power once, and nothing on it is inert', () => {
  const { items, r } = world();
  for (const u of items.uniques.filter(x => x.farhold)) {
    const item = attuneWeapon(r.loot.generateUnique(u.id, makeRng(5)));
    assert.ok(item, `${u.id} did not generate`);
    assert.equal(item.isUnique, true, `${u.id} is not a unique`);
    assert.equal(item.uniqueId, u.id);
    assert.equal(item.legendaryEffectId, u.legendaryEffect);
    assert.ok(item.ilvl > 0 && item.levelReq > 0, `${u.id} has no item level`);
    const p = r.createPlayer({ classId: 'warrior', level: 50 });
    const refused = r.equip(p, item);
    assert.ok(!refused?.refused, `${u.id} could not be worn: ${refused?.why || ''}`);
    assert.deepEqual(p.derived.inert, [], `${u.id} carries something with no effect`);
    const copies = r.fx.effects(p).filter(e => e.id === 'legendary:' + u.legendaryEffect).length;
    assert.equal(copies, 1, `${u.id}'s power runs ${copies} times`);
  }
});

test('R23.2 — a caster is the element it was written for, every time, and keeps its wand behaviour and staff spell', () => {
  const { items, r } = world();
  for (const u of items.uniques.filter(x => x.farhold && x.element)) {
    for (const seed of [1, 2, 3]) {
      const item = attuneWeapon(r.loot.generateUnique(u.id, makeRng(seed)));
      assert.equal(elementOf(item), u.element, `${u.name} (seed ${seed}) came out ${elementOf(item)}`);
      if (u.wandBehaviour) assert.equal(wandBehaviour(item).key, u.wandBehaviour, `${u.name}'s bolt`);
      if (u.staffSpell) assert.equal(staffSpell(item, u.element).key, u.staffSpell, `${u.name}'s spell`);
      if (u.type === 'wand') assert.equal(item.ranged, true, `${u.name} does not throw a bolt`);
    }
  }
});

test('R23.2 — a mount, a lamp, a quiver and a tool unique are the real thing in their own slot', () => {
  const { items, r } = world();
  const slotOf = { mount: 'mount', light: 'light', quiver: 'offhand', tool: 'tool' };
  for (const u of items.uniques.filter(x => x.gearBase || x.toolBase)) {
    const item = r.loot.generateUnique(u.id, makeRng(9));
    assert.equal(item.slot, slotOf[u.type], `${u.name} is in the ${item.slot} slot`);
    if (u.type === 'mount') assert.ok(item.affixes.some(a => a.stat === 'cond_mountBase'), `${u.name} has no riding speed`);
    if (u.type === 'light') assert.ok(item.affixes.some(a => a.stat === 'cond_lightBase'), `${u.name} lights nothing`);
    if (u.type === 'quiver') assert.equal(item.quiver, true, `${u.name} is not a quiver`);
    if (u.type === 'tool') assert.ok(item.toolKey && item.tier >= 1, `${u.name} is not a tool`);
  }
});

test('R23.2 — installing twice does not double the list, and Emberveil\'s own uniques are untouched', () => {
  const items = freshItems();
  const before = items.uniques.length;
  installUniques(items, uniqueData, { tools: toolData });
  installUniques(items, uniqueData, { tools: toolData });
  assert.equal(items.uniques.length, before + uniqueData.uniques.length);
  assert.equal(items.uniques.filter(u => !u.farhold).length, before);
  // the file on disk is Emberveil's too, and none of this is written into it
  assert.ok(!readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8').includes('fh_nettlepin'));
});

test('R23.2 — a legendary drop can be one of these, and it comes out through the ordinary drop path', () => {
  const { r } = world();
  const seen = new Set();
  const rng = makeRng(123);
  for (let i = 0; i < 4000 && seen.size < 12; i++) {
    const it = r.rollDrop({ level: 30, rng, chance: 1, floor: 'legendary' });
    if (it?.farholdUnique) seen.add(it.uniqueId);
  }
  assert.ok(seen.size >= 12, `only ${seen.size} different round-23 uniques turned up in 4000 legendary drops`);
});

// ================================================================ the words

test('R23 — every new power says what it does in numbers, with no vague word and no bare "it"', () => {
  const WEASEL = /more of everything|\bfor a while\b|\bsomewhat\b|\bgreatly\b|\ba bit\b|\bnoticeably\b|\ba little\b|\bslightly\b/i;
  const mine = [...new Set(uniqueData.uniques.map(u => u.legendaryEffect))].filter(id => !SHARED_POWERS.has(id));
  assert.ok(mine.length >= 45, `only ${mine.length} new powers`);
  for (const id of mine) {
    const text = EFFECTS['legendary:' + id].desc(1);
    assert.ok(/\d/.test(text), `${id} states no number: "${text}"`);
    assert.ok(!WEASEL.test(text), `${id} is vague: "${text}"`);
    assert.ok(!/\bit\b/i.test(text), `${id} says "it": "${text}"`);
    assert.ok(!/undefined|NaN/.test(text), `${id}: "${text}"`);
  }
  // and the card reads the power through the ordinary affix printer
  assert.match(describeAffix({ stat: 'cond_legendaryEffect', legendaryId: 'chain_lightning', value: 1 }), /3 more enemies within 8 metres/);
});

// ================================================================ 3. every new power, doing it

/**
 * One test per power. The table is keyed by power id and the test below fails if a power any
 * unique carries is missing from it — so a new power cannot be added without being exercised.
 */
const POWERS = {
  rot_spread() {
    const { r, p } = wearing('rot_spread');
    const a = foe(r, 0, 0), b = foe(r, 3, 0), far = foe(r, 30, 0);
    const res = r.strike(p, a, makeRng(1), { applyStatus: statusFn });
    const rot = a.statuses.rot;
    assert.ok(rot, 'a hit did not apply Rot');
    assert.ok(Math.abs(rot.perSecond * rot.power * U23.rot.seconds - res.amount * U23.rot.share) < 0.01, 'Rot is not 60% of the hit');
    const post = r.fx.onKill({ self: p, target: a });
    const out = afterKill(fakeEnv(r, p, [a, b, far]), post, a);
    assert.deepEqual(out.rotted, [b], 'the Rot did not pass to the enemy beside it, or went too far');
    assert.ok(b.statuses.rot && !far.statuses.rot);
  },
  frostbite() {
    const { r, p } = wearing('frostbite');
    const e = foe(r);
    for (let i = 0; i < 4; i++) r.strike(p, e, makeRng(i + 1), { applyStatus: statusFn });
    assert.equal(e.statuses.frostbite.stacks, 4);
    assert.ok(Math.abs(slowOf(e) - 4 * U23.frostbite.slowPerStack) < 1e-9, `4 stacks slow by ${slowOf(e)}`);
    r.strike(p, e, makeRng(9), { applyStatus: statusFn });
    assert.ok(e.statuses.frozen, 'five stacks did not freeze');
    assert.ok(!e.statuses.frostbite, 'the stacks did not clear');
    assert.equal(slowOf(e), 1, 'a frozen enemy can still move');
  },
  hemorrhage() {
    const { r, p } = wearing('hemorrhage');
    p.derived.critChance = 1000;
    const still = foe(r, 0, 0), runner = foe(r, 5, 0);
    r.strike(p, still, makeRng(2), { applyStatus: statusFn });
    r.strike(p, runner, makeRng(2), { applyStatus: statusFn });
    assert.ok(still.statuses.hemorrhage, 'a critical hit opened no Hemorrhage');
    tickStatuses(still, 0.01); tickStatuses(runner, 0.01);          // take a first position
    runner.x += 10;                                                  // …and run ten metres
    const a = tickStatuses(still, 1), b = tickStatuses(runner, 1);
    assert.ok(Math.abs(b / a - 2) < 0.02, `ten metres run should double the tick (x${(b / a).toFixed(2)})`);
  },
  kindling() {
    const { r, p } = wearing('kindling');
    const e = foe(r);
    const res = r.strike(p, e, makeRng(3), { applyStatus: statusFn });
    const t1 = tickStatuses(e, 1), t2 = tickStatuses(e, 1), t3 = tickStatuses(e, 1);
    assert.ok(Math.abs(t1 - res.amount * U23.kindling.start) < 0.01, 'the first tick is not 8% of the hit');
    assert.ok(Math.abs(t2 / t1 - 1.5) < 0.01 && Math.abs(t3 / t1 - 2) < 0.01, `Kindling does not climb (${t1}, ${t2}, ${t3})`);
    // a fresh hit keeps the climb rather than restarting it
    r.strike(p, e, makeRng(4), { applyStatus: statusFn });
    assert.equal(e.statuses.kindling.ticks, 3, 'a refresh threw the climb away');
  },
  venom_stack() {
    const { r, p } = wearing('venom_stack');
    const e = foe(r);
    for (let i = 0; i < 7; i++) r.strike(p, e, makeRng(1), { applyStatus: statusFn });
    const v = e.statuses.venom;
    assert.equal(v.stacks, U23.venom.stacks, 'Venom stacked past its cap or not at all');
    assert.ok(Math.abs(v.perSecond - v.perStack * 5) < 1e-9);
  },
  doom() {
    const { r, p } = wearing('doom');
    const e = foe(r);
    const a = r.strike(p, e, makeRng(1), { applyStatus: statusFn }).amount;
    const b = r.strike(p, e, makeRng(2), { applyStatus: statusFn }).amount;
    assert.equal(e.statuses.doom.stored, a + b, 'Doom did not store the damage dealt');
    const hp = e.hp;
    tickStatuses(e, U23.doom.seconds + 0.1);
    assert.ok(Math.abs((hp - e.hp) - (a + b) * U23.doom.share) < 0.01, 'Doom did not land 40% of the stored damage');
    assert.ok(!e.statuses.doom);
  },
  shatter() {
    const { r, p } = wearing('shatter');
    const plain = foe(r), cold = foe(r, 1, 0, { statuses: { chill: { slow: 0.45, remaining: 3 } } });
    assert.ok(Math.abs(mult(r, p, cold) / mult(r, p, plain) - 1.5) < 1e-9);
  },
  static_charge() {
    const { r, p } = wearing('static_charge');
    const a = foe(r, 0, 0), b = foe(r, 5, 0), far = foe(r, 40, 0);
    applyStatus(a, 'shock', skillData.statuses.shock, 1);
    const res = r.strike(p, a, makeRng(1), { applyStatus: statusFn });
    assert.ok(res.post.procs?.some(x => x.kind === 'arc'), 'a hit on a Shocked enemy raised no arc');
    const env = fakeEnv(r, p, [a, b, far]);
    const out = resolveAttack(env, { rt: {} }, [{ enemy: a, result: res }], {});
    assert.deepEqual(out.arcs, [b]);
    // an arc does not arc again
    const again = r.strike(p, a, makeRng(1), { applyStatus: statusFn, proc: true });
    assert.ok(!again.post.procs, 'a proc strike raised another proc');
  },
  blood_price() {
    const { r, p } = wearing('blood_price');
    const hp = p.hp;
    r.attackMods(p, 'melee');
    assert.ok(Math.abs((hp - p.hp) - p.maxHp * U23.bloodPrice.cost) < 1e-6, 'the attack cost nothing');
    p.hp = 1;
    r.attackMods(p, 'arrow');
    assert.equal(p.hp, 1, 'Blood Price took the last point of health');
    const { r: r0, p: p0 } = wearing('crit_heal');
    assert.ok(Math.abs(mult(r, p, foe(r)) / mult(r0, p0, foe(r0)) - 1.35) < 1e-9, 'no +35% damage');
  },
  crit_ward() {
    const { r, p } = wearing('crit_ward');
    p.derived.critChance = 1000;
    p.barrier = 0;
    const res = r.strike(p, foe(r), makeRng(1), {});
    assert.ok(res.crit);
    const want = Math.min(p.maxHp * U23.critWard.cap, res.amount * U23.critWard.share);
    assert.ok(Math.abs(p.barrier - want) < 1e-6, `barrier ${p.barrier} against ${want}`);
  },
  kill_frenzy() {
    const { r, p } = wearing('kill_frenzy');
    const base = p.derived.haste;
    for (let i = 0; i < 7; i++) r.fx.onKill({ self: p, target: foe(r) });
    r.refresh(p);
    assert.equal(p.derived.haste - base, U23.frenzy.stacks * U23.frenzy.haste, 'Frenzy did not cap at five stacks of +8%');
    r.fx.update(p, U23.frenzy.seconds + 0.1, { fighting: true });
    r.refresh(p);
    assert.equal(p.derived.haste, base, 'Frenzy outlived its timer');
  },
  mana_burn() {
    const { r, p } = wearing('mana_burn');
    p.mp = 100;
    const e = foe(r);
    const m = mult(r, p, e);
    r.strike(p, e, makeRng(1), {});
    assert.equal(p.mp, 100 - U23.manaBurn.mana, 'the hit did not spend its mana');
    p.mp = 2;
    assert.ok(Math.abs(m / mult(r, p, e) - (1 + U23.manaBurn.damage)) < 1e-9, 'out of mana should be normal damage');
  },
  glass_heart() {
    const { r, p } = wearing('glass_heart');
    const { r: r0, p: p0 } = wearing('crit_heal');
    assert.ok(Math.abs(mult(r, p, foe(r)) / mult(r0, p0, foe(r0)) - 1.5) < 1e-9, 'no +50% damage');
    assert.equal(r.fx.dmgIn({ self: p, target: foe(r), element: 'physical' }), 1 + U23.glassHeart.in);
  },
  vampire_kill() {
    const { r, p } = wearing('vampire_kill');
    const e = foe(r);
    const post = r.fx.onKill({ self: p, target: e });
    p.hp = 10;
    const out = afterKill(fakeEnv(r, p, [e]), post, e);
    assert.ok(out.siphon && p.statuses.siphon, 'the kill started no Siphon');
    for (let t = 0; t < 40; t++) tickStatuses(p, 0.1);
    assert.ok(Math.abs((p.hp - 10) - p.maxHp * U23.siphon.share) < p.maxHp * 0.01, `healed ${p.hp - 10} of ${p.maxHp}`);
  },
  second_wind() {
    const { r, p } = wearing('second_wind');
    p.hp = Math.round(p.maxHp * 0.25); p.barrier = 0;
    const e = foe(r, 0, 0, { dmg: [1, 1], damage: [1, 1] });
    const res = r.strike(e, p, makeRng(1), {});
    assert.ok(res.defenderPost.secondWind, 'a hit under 30% health gave no second wind');
    assert.ok(Math.abs(p.barrier - p.maxHp * U23.secondWind.barrier) < 1e-6);
    p.barrier = 0;
    const again = r.strike(e, p, makeRng(2), {});
    assert.ok(!again.defenderPost.secondWind, 'the second wind came back before its 45s');
  },
  stride() {
    const { r, p } = wearing('stride');
    p.moving = 1; const moving = mult(r, p, foe(r));
    p.moving = 0; const still = mult(r, p, foe(r));
    assert.ok(Math.abs(moving / still - 1.25) < 1e-9);
  },
  stillness() {
    const { r, p } = wearing('stillness');
    p.moving = 0;
    r.fx.update(p, 2, { fighting: true });
    assert.equal(r.fx.critBonus({ self: p, target: foe(r) }), U23.stillness.crit);
    p.moving = 1;
    r.fx.update(p, 0.1, { fighting: true });
    assert.equal(r.fx.critBonus({ self: p, target: foe(r) }), 0, 'moving should end the stillness');
  },
  thornmail() {
    const { r, p } = wearing('thornmail');
    const e = foe(r, 0, 0, { hp: 1, maxHp: 50 });
    const res = r.strike(e, p, makeRng(1), {});
    assert.equal(res.reflected, Math.round(res.amount * U23.thornmail), 'Thornmail reflected the wrong share');
    const out = afterDamaged(fakeEnv(r, p, [e]), res, e);
    assert.equal(out.killed, true, 'the thorns killed it and nothing noticed');
  },
  retaliate_nova() {
    const { r, p } = wearing('retaliate_nova');
    const e = foe(r, 1, 0), f = foe(r, 3, 0), far = foe(r, 20, 0);
    p.derived.dodge = 0;
    const res = r.strike(e, p, fixedRng(0.01), {});
    assert.ok(res.defenderPost.procs?.some(x => x.kind === 'nova'), 'no nova at a 1% roll');
    const env = fakeEnv(r, p, [e, f, far]);
    const out = afterDamaged(env, res, e);
    assert.deepEqual(out.novas[0].map(x => x.id).sort(), [e.id, f.id].sort());
    assert.ok(e.statuses.chill && !far.statuses.chill, 'the nova did not chill');
    const miss = r.strike(e, p, fixedRng(0.99), {});
    assert.ok(!miss.defenderPost.procs, 'a nova at a 99% roll');
  },
  frost_skin() {
    const { r, p } = wearing('frost_skin');
    const melee = foe(r), archer = foe(r, 10, 0);
    r.strike(melee, p, makeRng(1), {});
    r.strike(archer, p, makeRng(1), { ranged: true });
    assert.ok(melee.statuses.chill, 'a melee attacker was not chilled');
    assert.ok(!archer.statuses.chill, 'an archer was chilled from 10 metres away');
  },
  pyre_aura() {
    const { r, p } = wearing('pyre_aura');
    const near = foe(r, 2, 0), far = foe(r, 9, 0);
    const env = fakeEnv(r, p, [near, far]);
    assert.deepEqual(tickAuras(env, r, p, 1.1, { fighting: false }), [], 'the Pyre burned outside a fight');
    const fired = tickAuras(env, r, p, 1.1, { fighting: true });
    assert.deepEqual(fired[0].hit.map(x => x.id), [near.id]);
    assert.ok(near.statuses.burn && !far.statuses.burn, 'the Pyre did not set Burning');
  },
  crit_heal() {
    const { r, p } = wearing('crit_heal');
    p.derived.critChance = 1000;
    p.hp = 10;
    r.strike(p, foe(r), makeRng(1), {});
    assert.equal(p.hp, 10 + Math.round(p.maxHp * U23.critHeal));
  },
  cull() {
    const { r, p } = wearing('cull');
    const weak = foe(r, 0, 0, { hp: 60000, maxHp: 1e6 });
    const res = r.strike(p, weak, makeRng(1), { multiplier: 0.01 });
    assert.ok(res.culled && res.dead && weak.hp === 0, 'a hit under 10% health did not cull');
    const rare = foe(r, 0, 0, { hp: 60000, maxHp: 1e6, rank: 'rare' });
    assert.ok(!r.strike(p, rare, makeRng(1), { multiplier: 0.01 }).culled, 'a rare was culled');
  },
  bulwark() {
    const { r, p } = wearing('bulwark');
    const before = mult(r, p, foe(r));
    p.derived.blockChance = 1000; p.derived.blockPower = 5;
    const res = r.strike(foe(r), p, makeRng(1), {});
    assert.ok(res.blocked > 0);
    assert.ok(Math.abs(mult(r, p, foe(r)) / before - 1.2) < 1e-9, 'a block gave no damage');
    r.fx.update(p, U23.bulwark.seconds + 0.1, { fighting: true });
    assert.ok(Math.abs(mult(r, p, foe(r)) - before) < 1e-9, 'Bulwark outlived its 4s');
  },
  barrier_burst() {
    const { r, p } = wearing('barrier_burst');
    p.barrier = 1;
    const e = foe(r, 1, 0);
    const res = r.strike(e, p, makeRng(1), {});
    assert.ok(res.absorbed > 0 && p.barrier === 0);
    const out = afterDamaged(fakeEnv(r, p, [e]), res, e);
    assert.equal(out.novas.length, 1, 'the broken barrier did not burst');
    p.barrier = 1;
    assert.ok(!r.strike(e, p, makeRng(2), {}).defenderPost.procs, 'burst again inside 10s');
  },
  resonance() {
    const { r, p } = wearing('resonance');
    const s = n => Object.fromEntries(Array.from({ length: n }, (_, i) => ['s' + i, { remaining: 3 }]));
    const bare = mult(r, p, foe(r));
    assert.ok(Math.abs(mult(r, p, foe(r, 0, 0, { statuses: s(3) })) / bare - 1.36) < 1e-9);
    assert.ok(Math.abs(mult(r, p, foe(r, 0, 0, { statuses: s(10) })) / bare - 1.6) < 1e-9, 'no cap at +60%');
  },
  opportunist() {
    const { r, p } = wearing('opportunist');
    const slow = foe(r, 0, 0, { statuses: { web: { slow: 0.8, remaining: 2 } } });
    assert.ok(Math.abs(mult(r, p, slow) / mult(r, p, foe(r)) - 1.3) < 1e-9);
  },
  battle_trance() {
    const { r, p } = wearing('battle_trance');
    p.derived.critChance = 0;
    const e = foe(r);
    const crits = [];
    for (let i = 0; i < 10; i++) crits.push(r.strike(p, e, makeRng(i + 1), {}).crit);
    assert.deepEqual(crits, [false, false, false, false, true, false, false, false, false, true]);
  },
  overflow() {
    const { r, p } = wearing('overflow');
    const { r: r0, p: p0 } = wearing('crit_heal');
    assert.ok(p.derived.mpRegen - p0.derived.mpRegen >= U23.overflow.regen - 1e-9, 'no +2 mana a second');
    p.mp = p.maxMp; const full = mult(r, p, foe(r));
    p.mp = 0; const empty = mult(r, p, foe(r));
    assert.ok(Math.abs(full / empty - 1.2) < 1e-9);
  },
  third_cleave() {
    const { r, p } = wearing('third_cleave');
    const got = [1, 2, 3, 4, 5, 6].map(() => !!r.attackMods(p, 'melee').fullCircle);
    assert.deepEqual(got, [false, false, true, false, false, true]);
    assert.ok(!r.attackMods(p, 'arrow').fullCircle);
  },
  quake_slam() {
    const { r, p } = wearing('quake_slam');
    r.attackMods(p, 'melee'); r.attackMods(p, 'melee');
    const mods = r.attackMods(p, 'melee');
    assert.ok(mods.slam, 'the third swing did not slam');
    const near = foe(r, 3, 0), far = foe(r, 9, 0);
    const env = fakeEnv(r, p, [near, far]);
    const out = resolveAttack(env, mods, [], { x: 0, z: 0 });
    assert.deepEqual(out.slammed, [near]);
    assert.ok(env.log.some(l => l[0] === 'push' && l[1] === near.id && l[2] === U23.slam.push), 'the slam knocked nothing back');
  },
  alternate_elements() {
    const { r, p } = wearing('alternate_elements');
    assert.deepEqual([1, 2, 3, 4].map(() => r.attackMods(p, 'melee').element), ['fire', 'ice', 'lightning', 'fire']);
  },
  fire_trail() {
    const { r, p } = wearing('fire_trail');
    const e = foe(r, 2, 0);
    const env = fakeEnv(r, p, [e]);
    const mods = r.attackMods(p, 'melee');
    const hit = [{ enemy: e, result: r.strike(p, e, makeRng(1), {}) }];
    const out = resolveAttack(env, mods, hit, { x: 0, z: 0 });
    assert.ok(out.patch && out.patch.x === e.x && out.patch.element === 'fire', 'no burning ground under the enemy');
    assert.ok(!r.attackMods(p, 'melee').patch, 'a second patch inside the 1s cooldown');
    r.fx.update(p, 1.1, { fighting: true });
    assert.ok(r.attackMods(p, 'melee').patch, 'the cooldown never ended');
  },
  chain_lightning() {
    const { r, p } = wearing('chain_lightning');
    const a = foe(r, 0, 0), b = foe(r, 5, 0), c = foe(r, 10, 0), d = foe(r, 15, 0), e = foe(r, 20, 0), far = foe(r, 40, 0);
    const env = fakeEnv(r, p, [a, b, c, d, e, far]);
    const out = resolveAttack(env, r.attackMods(p, 'melee'), [{ enemy: a, result: r.strike(p, a, makeRng(1), {}) }], {});
    assert.deepEqual(out.chained, [b, c, d], 'the chain should jump 3 times, 8 metres at a time');
    assert.ok(env.log.filter(l => l[0] === 'one').every(l => l[2] === 'lightning' && l[3] === U23.chain.power));
  },
  ricochet() {
    const { r, p } = wearing('ricochet');
    const a = foe(r, 0, 0), b = foe(r, 6, 0), c = foe(r, 12, 0), d = foe(r, 18, 0);
    assert.ok(!r.attackMods(p, 'melee').ricochet, 'a sword swing ricocheted');
    const out = resolveAttack(fakeEnv(r, p, [a, b, c, d]), r.attackMods(p, 'arrow'), [{ enemy: a, result: r.strike(p, a, makeRng(1), {}) }], {});
    assert.deepEqual(out.bounced, [b, c]);
  },
  split_bolt() {
    const { r, p } = wearing('split_bolt');
    const hitOne = foe(r, 0, 0), s1 = foe(r, 3, 0), s2 = foe(r, 0, 4), s3 = foe(r, -5, 0), s4 = foe(r, 7, 0), far = foe(r, 30, 0);
    const out = resolveAttack(fakeEnv(r, p, [hitOne, s1, s2, s3, s4, far]), r.attackMods(p, 'bolt'),
      [{ enemy: hitOne, result: r.strike(p, hitOne, makeRng(1), {}) }], { at: { x: 0, z: 0 } });
    assert.equal(out.shards.length, 3);
    assert.ok(!out.shards.includes(hitOne) && !out.shards.includes(far));
  },
  fourth_volley() {
    const { r, p } = wearing('fourth_volley');
    assert.deepEqual([1, 2, 3, 4].map(() => r.attackMods(p, 'arrow').shots || 1), [1, 1, 1, U23.volley.arrows]);
  },
  gravity_bolt() {
    const { r, p } = wearing('gravity_bolt');
    const a = foe(r, 3, 0), b = foe(r, 12, 0);
    const env = fakeEnv(r, p, [a, b]);
    const out = resolveAttack(env, r.attackMods(p, 'bolt'), [], { at: { x: 0, z: 0 } });
    assert.deepEqual(out.pulled, [a]);
    assert.ok(env.log.some(l => l[0] === 'push' && l[2] === -U23.gravity.pull), 'the pull was not toward the impact');
  },
  echo_strike() {
    const { r, p } = wearing('echo_strike');
    const e = foe(r);
    const env = fakeEnv(r, p, [e], { rng: () => 0.1 });
    const out = resolveAttack(env, r.attackMods(p, 'melee'), [{ enemy: e, result: r.strike(p, e, makeRng(1), {}) }], {});
    assert.equal(out.echoes, 1);
    assert.ok(env.log.some(l => l[0] === 'one' && l[1] === e.id && l[3] === U23.echo.power), 'the echo never struck');
    const miss = fakeEnv(r, p, [e], { rng: () => 0.9 });
    assert.equal(resolveAttack(miss, r.attackMods(p, 'melee'), [{ enemy: e, result: r.strike(p, e, makeRng(1), {}) }], {}).echoes, 0);
  },
  crescendo() {
    const { r, p } = wearing('crescendo');
    const bare = mult(r, p, foe(r));
    for (let i = 0; i < 5; i++) assert.ok(!r.attackMods(p, 'melee').shockwave);
    assert.ok(Math.abs(mult(r, p, foe(r)) / bare - 1.3) < 1e-9, 'five attacks should be +30%');
    const sixth = r.attackMods(p, 'melee');
    assert.ok(sixth.shockwave, 'the sixth attack released nothing');
    assert.ok(Math.abs(mult(r, p, foe(r)) - bare) < 1e-9, 'the count did not start again');
    const out = resolveAttack(fakeEnv(r, p, [foe(r, 2, 0)]), sixth, [], { x: 0, z: 0 });
    assert.equal(out.shockwave.length, 1);
    r.attackMods(p, 'melee'); r.attackMods(p, 'melee');
    r.fx.update(p, U23.crescendo.idle + 0.1, { fighting: true });
    assert.ok(Math.abs(mult(r, p, foe(r)) - bare) < 1e-9, '3s idle did not reset the count');
  },
  twin_bolt() {
    const { r, p } = wearing('twin_bolt');
    assert.ok(r.attackMods(p, 'bolt').twin?.power === U23.twin.power);
    assert.ok(!r.attackMods(p, 'melee').twin);
  },
  overload() {
    const { r, p } = wearing('overload');
    const got = [1, 2, 3, 4].map(() => r.attackMods(p, 'staff'));
    assert.deepEqual(got.map(m => m.power), [1, 1, 1, U23.overload.power]);
    assert.equal(got[3].scale, U23.overload.scale);
  },
  rider_fury() {
    const { r, p } = wearing('rider_fury');
    p.mounted = false; const walking = mult(r, p, foe(r));
    p.mounted = true;
    assert.ok(Math.abs(mult(r, p, foe(r)) / walking - 1.3) < 1e-9);
    r.refresh(p);
    const speed = p.derived.mountSpeed;
    r.fx.onKill({ self: p, target: foe(r) });
    r.fx.update(p, 0.01, { fighting: true });
    r.refresh(p);
    assert.ok(Math.abs(p.derived.mountSpeed / speed - 1.15) < 1e-9, 'a kill in the saddle did not speed the mount');
  },
  stormrider() {
    const { r, p } = wearing('stormrider');
    const a = foe(r, 4, 0), b = foe(r, 6, 0);
    const env = fakeEnv(r, p, [a, b]);
    p.mounted = false;
    assert.deepEqual(tickAuras(env, r, p, 2.1, { fighting: true }), [], 'lightning on foot');
    p.mounted = true;
    const fired = tickAuras(env, r, p, 2.1, { fighting: true });
    assert.deepEqual(fired[0].hit, [a], 'the strike should find the nearest enemy only');
  },
  searing_light() {
    const { r, p } = wearing('searing_light');
    const a = foe(r, 4, 0), b = foe(r, 9, 0), far = foe(r, 14, 0);
    const fired = tickAuras(fakeEnv(r, p, [a, b, far]), r, p, 2.1, { fighting: true });
    assert.deepEqual(fired[0].hit.map(x => x.id).sort(), [a.id, b.id].sort());
  },
  dread_lantern() {
    const { r, p } = wearing('dread_lantern');
    const near = foe(r, 5, 0), far = foe(r, 12, 0);
    tickAuras(fakeEnv(r, p, [near, far]), r, p, 1.1, { fighting: true });
    assert.ok(Math.abs(outgoingFrom(near) - (1 - U23.dread.dealLess)) < 1e-9, 'an enemy in the light was not unnerved');
    assert.equal(outgoingFrom(far), 1);
  },
  prospector() {
    const { r, p } = wearing('prospector');
    assert.equal(r.gatherBonus(p, () => 0.1).times, 2);
    assert.equal(r.gatherBonus(p, () => 0.5).times, 1);
  },
  quick_hands() {
    const { r, p, item } = wearing('quick_hands');
    const rolled = item.affixes.filter(a => a.stat === 'cond_toolSpeed').reduce((n, a) => n + a.value, 0);
    assert.ok(Math.abs(p.derived.gatherSpeed - rolled - U23.quickHands.speed) < 1e-9, 'no +30% gathering speed');
    const move = p.derived.movePct;
    r.gatherBonus(p);
    r.fx.update(p, 0.01, { fighting: false });
    r.refresh(p);
    assert.equal(p.derived.movePct - move, U23.quickHands.move, 'a finished gather gave no move speed');
  },
};

test('R23.3 — every power a round-23 unique carries has a test below', () => {
  const mine = [...new Set(uniqueData.uniques.map(u => u.legendaryEffect))].filter(id => !SHARED_POWERS.has(id));
  const missing = mine.filter(id => !POWERS[id]);
  assert.deepEqual(missing, [], 'these powers are carried and never exercised');
  const unused = Object.keys(POWERS).filter(id => !mine.includes(id));
  assert.deepEqual(unused, [], 'these powers are tested and carried by no unique');
});

for (const [id, run] of Object.entries(POWERS)) {
  test(`R23.3 — ${id}: the power does what its card says`, () => run());
}

// ================================================================ and the game asks for all of it

test('R23 — js/main.js carries out the requests on every attack path, a kill, a hit taken, the clock and a gather', () => {
  const main = src('js/main.js');
  const need = [
    [/rpg\.attackMods\(player, kind/, 'swingWith never asks the powers about the attack'],
    [/resolveHits\(hits\)/, 'the melee swing never resolves its requests'],
    [/resolveHits\(novaHits\)/, 'the staff nova never resolves its requests'],
    [/resolveHits\(coneHits\)/, 'the staff cone never resolves its requests'],
    [/plan\.mods && !hop\) resolveAttack/, 'a bolt never resolves its requests where it lands'],
    [/shot\?\.mods\) resolveAttack/, 'an arrow never resolves its requests where it lands'],
    [/payload: \{ mods, element \}/, 'an arrow does not carry its requests'],
    [/mods\.twin/, 'Twin Bolt is never fired'],
    [/mods\.shots/, 'Warden\'s Volley never looses more arrows'],
    [/uniquesAfterKill\(uniqueEnv, post, e\)/, 'a kill never passes Rot on or starts the Siphon'],
    [/uniquesAfterDamaged\(uniqueEnv, result, e\)/, 'a hit taken never releases a nova'],
    [/tickAuras\(uniqueEnv, rpg, player, dt/, 'the auras have no clock'],
    [/rpg\.gatherBonus\(player/, 'a finished gather never asks Prospector or Quick Hands'],
    [/installUniques\(items, uniqueData/, 'the uniques are never put into the item table'],
    [/player\.mounted = mounted/, 'nothing tells the powers you are mounted'],
    [/ranged: true/, 'an arrow at the player is not marked ranged, so Frost Skin would chill archers'],
  ];
  for (const [re, why] of need) assert.match(main, re, why);
});

test('R23 — a lingering pool no longer calls a function that does not exist where it runs', () => {
  const main = src('js/main.js');
  const start = main.indexOf('function tickPools(dt)');
  const end = main.indexOf('\n  }\n', start);
  assert.ok(start > 0 && end > start);
  assert.ok(!/\bbrandHit\(/.test(main.slice(start, end)), 'tickPools still calls brandHit, a const inside the frame loop');
});

// R23 — the older caster uniques from the shared items.json are pinned to one element in Farhold
test('the older caster uniques always drop as the element their lore promises', async () => {
  const { readFileSync } = await import('node:fs');
  const { installUniques, LEGACY_CASTER_ELEMENTS } = await import('../js/uniques.js');
  const { Rpg } = await import('../js/rpg.js');
  const items = JSON.parse(readFileSync(new URL('../../emberveil/data/items.json', import.meta.url)));
  const data = JSON.parse(readFileSync(new URL('../data/uniques.json', import.meta.url)));
  installUniques(items, data);
  const rpg = new Rpg(items, {});
  for (const [id, element] of Object.entries(LEGACY_CASTER_ELEMENTS)) {
    const seen = new Set();
    for (let s = 1; s <= 12; s++) {
      let n = s * 7919;
      const rng = () => ((n = (n * 16807) % 2147483647) / 2147483647);
      rng.pick = a => a[Math.floor(rng() * a.length)];
      const raw = rpg.loot.generateUnique(id, rng);
      const u = items.uniques.find(x => x.id === id);
      const { dressUnique } = await import('../js/uniques.js');
      const { attuneWeapon } = await import('../js/rpg.js');
      seen.add(attuneWeapon(dressUnique(raw, u)).castElement);
    }
    assert.deepEqual([...seen], [element], `${id} came out as ${[...seen].join(', ')}`);
  }
});
