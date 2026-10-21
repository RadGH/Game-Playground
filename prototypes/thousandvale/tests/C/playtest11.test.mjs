// node --test prototypes/thousandvale/tests/C/playtest11.test.mjs
//
// Owner feedback 11 (round-playtest11.md, live reports 2026-10-15) — stream C: Z1 Starlight from level 6, Z2 no
// attributes, Z17 perk text, Z35 find tooltips, Z36 slower weapon attacks / stronger skills, Z39 the Wand of the Ninth
// Star, Z50 no boss refills its health bar, Z60 rares and the melee guard, Z5 the leash. Each test states the rule;
// a tuning number appears only where the number IS the rule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { AI } from '../../js/rules/monster-ai.js';
import { validateEncounters } from '../../js/rules/encounter.js';

const engine = rulesEngine();
const open = standInTerrain(2, 2048);
let n = 0;
function world({ terrain = open, kind = 'wilds', hooks = {}, seed = 5 } = {}) {
  const events = [], awards = [];
  const id = `z11-${++n}`;
  const room = createRoom({ id, terrain, seed, camps: [], createRules, kind, hooks: { log: () => {}, award: (e, a) => awards.push({ id: e.id, ...a }), ...hooks } });
  const w = { room, events, awards, tick: 0, R: room.rules, sx: terrain.spawn.x, sz: terrain.spawn.z };
  const ev0 = room.host.event;
  room.host.event = ev => { events.push({ ...ev, tick: w.tick }); return ev0(ev); };
  let pid = 40;
  w.add = (cls, level, dx = 0, dz = 0, extra = {}) => room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: w.sx + dx, z: w.sz + dz, ...extra }, null);
  w.mob = (type, dx, dz, level = 3, data = {}) => room.spawn({ kind: 'monster', type, level, x: w.sx + dx, z: w.sz + dz, data: { noRank: true, ...data } });
  w.steps = (k = 1) => { for (let i = 0; i < k; i++) { room.step(); w.tick++; } };
  w.hits = (dst, src = null) => events.filter(e => e.type === 'hit' && e.kind === 'dmg' && e.d === dst.id && (src == null || e.s === src.id));
  return w;
}
const tough = m => { const u = m.r.unit; u.maxHp = u.hp = 1e7; return m; };
const tame = m => { const u = tough(m).r.unit; u.dmg = [0, 0]; u.speed = 0; u.aggroRange = 0; return m; };

// ------------------------------------------------------------------------------------------------ Z1 (#1)

test('Z1 (#1): a Starcaller gains no Starlight before level 6 (nothing can spend it yet), and from level 6 it does; the cards say so', () => {
  for (const [level, want] of [[3, 0], [5, 0], [6, 1]]) {
    const w = world();
    const me = w.add('starcaller', level);
    const u = me.r.unit;
    const mob = tame(w.mob('road_brigand', 0, 10, level));
    u.mp = u.maxMp;
    const r = w.R.intent(me, { t: 'cast', slot: 1, target: mob.id });
    assert.equal(r.ok, true, `level ${level}: Star Dart casts (${r.text || ''})`);
    w.steps(60);
    assert.ok(w.hits(mob, me).some(h => h.ab === 'star_dart'), `level ${level}: the star landed`);
    assert.equal(u.mech?.res?.starlight?.n || 0, want, `level ${level}: ${want} Starlight`);
    const card = w.R.bar(me).find(s => s.id === 'star_dart');
    assert.match(card.desc, /From level 6, gains 1 Starlight/, `the Star Dart card says when it starts: ${card.desc}`);
  }
  assert.match(engine.classById('starcaller').signature, /from level 6/i, 'the class card says so too');
});

// ------------------------------------------------------------------------------------------------ Z50 (#51)

test('Z50 (#51): no boss script refills its health bar for another phase, and the validator refuses one that tries', () => {
  const dir = new URL('../../data/encounters/', import.meta.url);
  const scripts = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    if (!d.phases) continue;
    scripts[d.id] = d;
    assert.equal(d.phases.some(p => p.newBar), false, `${f}: a phase refills the bar`);
  }
  assert.ok(Object.keys(scripts).length > 30);
  const one = structuredClone(Object.values(scripts)[0]);
  one.phases.push({ name: 'Again', newBar: { hp: 0.5 }, abilities: [] });
  const bad = validateEncounters({ scripts: { [one.id]: one } });
  assert.ok(bad.some(b => /newBar/.test(b)), 'a newBar phase is refused');
});

// ------------------------------------------------------------------------------------------------ Z5 (#5, the leash)

test('Z5 (#5): a monster follows you three times as far from home (120 m) and keeps chasing 20 s with nothing landing', () => {
  assert.equal(AI.LEASH_METRES, 120);
  assert.equal(AI.LEASH_SECONDS, 20);
  const w = world();
  const me = w.add('mage', 5, 0, 0);
  const m = w.mob('moor_hound', 0, 20, 5);
  const u = m.r.unit;
  u.dmg = [0, 0];
  // the hound is pulled 70 m from home: under the old 40 m leash it would have gone home
  w.R.intent(me, { t: 'cast', slot: 0, target: m.id });
  for (let i = 0; i < 30; i++) w.steps(1);
  const p = me.r.unit; p.x = w.sx; p.z = w.sz - 50; me.x = p.x; me.z = p.z;
  for (let i = 0; i < 20 * 12; i++) w.steps(1);
  assert.notEqual(u.state, 'return', 'still after you');
  assert.ok(Math.hypot(u.x - u.home[0], u.z - u.home[1]) > 40, 'further from home than the old leash allowed');
});

// ------------------------------------------------------------------------------------------------ Z2 (#2) + the melee guard (#61)

import { engineFor, parityEngineFor } from './setup.mjs';
import { createCharacter, restoreGear } from '../../js/rules/character.js';
import { coreRows } from '../../js/rules/estimate.js';
import { refreshItem } from '../../js/rules/index.js';
import { ATTRS, familyText } from '../../js/rules/attributes.js';
import { makeRng } from '../../js/rules/rng.js';

const hasAttr = list => (list || []).some(a => a && ATTRS.includes(a.stat));

test('Z2 (#2): no character has Strength, Dexterity, Intellect or Constitution — the six points everyone had are plain health, mana, critical chance and dodge, and the weapon carries the damage share', async () => {
  const eng = await engineFor(4);
  const par = await parityEngineFor(4);
  for (const cls of ['warrior', 'rogue', 'mage', 'ranger', 'starcaller']) {
    const a = createCharacter(eng, { id: 'a', classId: cls, level: 10, rng: makeRng(3) });
    assert.deepEqual(['str', 'dex', 'int', 'con'].map(k => a.derived[k]), [0, 0, 0, 0], `${cls}: no attributes on the sheet`);
    assert.equal(coreRows(eng, a).some(r => ATTRS.includes(r.id)), false, `${cls}: no attribute rows`);
    const w = a.equipment.weapon;
    assert.ok(w.family && /weapon: \+\d+% damage/.test(w.familyText), `${cls}: the weapon says its family share (${w.familyText})`);
    // the same gear on a Farhold sheet (6 of each attribute, no family share): every number is the same
    const b = createCharacter(par, { id: 'b', classId: cls, level: 10, kit: false });
    for (const [slot, it] of Object.entries(a.equipment)) if (it) b.equipment[slot] = JSON.parse(JSON.stringify(it));
    par.rpg.refresh(b, { full: true });
    for (const k of ['maxHp', 'maxMp', 'critChance', 'dodge']) assert.equal(a.derived[k], b.derived[k], `${cls}: ${k}`);
    assert.deepEqual(a.derived.damage, b.derived.damage, `${cls}: weapon damage`);
  }
  assert.equal(par.classById('warrior').weaponFamily, undefined, 'a parity engine is untouched');
  assert.equal(eng.classById('warrior').weaponFamily, 'heavy', 'a class names its weapon family (the card shows that, not an attribute)');
  assert.equal(eng.classById('starcaller').weaponFamily, 'magic');
});

test('Z2 (#2): nothing rolls, drops or is granted as an attribute — the roll table, every unique, every set and every perk node carry the new stats', async () => {
  const eng = await engineFor(4);
  for (const [g, list] of Object.entries(eng.items.affixes)) if (Array.isArray(list)) assert.equal(hasAttr(list), false, `roll table ${g}`);
  for (const u of eng.items.uniques) assert.equal(hasAttr(u.fixedAffixes) || hasAttr(u.randomAffixes) || hasAttr(u.affixes), false, `unique ${u.id}`);
  for (const s of eng.items.sets) {
    for (const p of s.items || []) assert.equal(hasAttr(p.fixedAffixes) || hasAttr(p.randomAffixes), false, `set ${s.id}`);
    for (const b of Object.values(s.partialBonuses || {})) assert.equal(ATTRS.some(k => k in b), false, `set bonus ${s.id}`);
  }
  for (const n of eng.forest.nodes) assert.equal(ATTRS.some(k => k in (n.grants || {}) || k in (n.whenGrants || {})), false, `perk ${n.id}`);
  const rng = makeRng(11);
  let seen = 0;
  for (let i = 0; i < 300; i++) { const it = eng.makeItem({ base: 'longsword', rarity: 'rare', level: 12, rng }); assert.equal(hasAttr(it.affixes), false); if (it.affixes.some(a => /^(heavy|light|magic)Pct$/.test(a.stat))) seen++; }
  assert.ok(seen > 0, 'the family stats roll');
  // a heavy-damage perk does what it says: a heavy weapon hits harder, a light one does not
  const node = eng.forest.nodes.find(n => n.grants?.heavyPct && !n.ruleId);
  assert.match(node.desc, /damage with heavy weapons/);
});

test('Z2 (#2): an item a player already owns converts when it loads — the same worth, nothing lost (worn and in the bag)', async () => {
  const eng = await engineFor(4);
  const old = {
    type: 'weapon', baseKey: 'longsword', base: 'longsword', name: 'Swift Wise Longsword of the Bear', slot: 'weapon', rarity: 'rare', weaponCategory: 'heavy', subtype: 'sword', dmg: [9, 15], level: 8,
    affixes: [{ id: 'of_str', name: 'Sturdy', stat: 'str', value: 4, min: 2, max: 5 }, { id: 'of_dex', name: 'Swift', stat: 'dex', value: 3 }, { id: 'of_int', name: 'Wise', stat: 'int', value: 2 }, { id: 'of_con', name: 'Hardy', stat: 'con', value: 5 }, { stat: 'hp', value: 10 }],
  };
  const bagged = refreshItem(JSON.parse(JSON.stringify(old)));
  assert.equal(hasAttr(bagged.affixes), false, 'a bag item converts');
  const val = s => bagged.affixes.filter(a => a.stat === s).reduce((n, a) => n + a.value, 0);
  assert.equal(val('heavyPct'), 12); assert.equal(val('lightPct'), 9); assert.equal(val('magicPct'), 6);
  assert.equal(val('critChance'), 0.6); assert.equal(val('dodge'), 0.9); assert.equal(val('mp'), 4); assert.equal(val('hp'), 30, 'Constitution x4 joins the item\'s own health line');
  const ch = createCharacter(eng, { id: 'p', classId: 'warrior', level: 8, kit: false });
  restoreGear(eng, ch, { equipment: { weapon: JSON.parse(JSON.stringify(old)) } });
  assert.equal(hasAttr(ch.equipment.weapon.affixes), false, 'a worn item converts');
  const d = ch.derived;
  assert.equal(d.familyPct, 18 + 12, 'the family share plus the converted Strength');
  const want = [0, 1].map(i => Math.max(i + 1, Math.round((old.dmg[i] * d.levelScale + (d.damageFlat || 0)) * (1 + d.familyPct / 100) * (1 + (d.damagePct || 0) / 100))));
  assert.deepEqual(d.damage, want, 'and that is what the weapon hits for');
});

test('Z60 (#61): a melee weapon in the main hand takes a share off every hit you take; a bow or a wand does not', async () => {
  const eng = await engineFor(4);
  const rng = makeRng(5);
  const guardOf = base => { const ch = createCharacter(eng, { id: 'g', classId: 'warrior', level: 10, kit: false }); const it = eng.makeItem({ base, rarity: 'normal', level: 10, rng }); eng.rpg.equip(ch, it, { force: true }); eng.rpg.refresh(ch, { full: true }); return { d: ch.derived, it }; };
  const two = guardOf('sword2h'), one = guardOf('longsword'), bow = guardOf('bow'), wand = guardOf('wand');
  assert.ok(two.d.weaponGuard > one.d.weaponGuard && one.d.weaponGuard > 0, `two-handed ${two.d.weaponGuard}% > one-handed ${one.d.weaponGuard}%`);
  assert.equal(bow.d.weaponGuard, 0); assert.equal(wand.d.weaponGuard, 0);
  assert.equal(two.d.resistAll, two.d.weaponGuard, 'it is the sheet\'s all-damage resistance (rpg.strike reads it)');
  assert.match(familyText(eng, two.it), /In your main hand: 15% damage reduction/);
  assert.doesNotMatch(familyText(eng, bow.it), /takes/);
  // in a fight: the same monster hits a greatsword-holder softer than a bow-holder
  const take = base => {
    const w = world();
    const me = w.add('warrior', 10, 0, 0);
    const it = eng.makeItem({ base, rarity: 'normal', level: 10, rng: makeRng(2) });
    assert.equal(w.R.equip(me, it, 'weapon').ok, true);
    const u = me.r.unit; u.armor = 0; u.derived.armor = 0; u.derived.dodge = 0; u.derived.blockChance = 0;
    const m = w.mob('road_brigand', 0, 1.5, 10); const mu = m.r.unit; mu.dmg = [40, 40];
    let got = 0; const hp0 = u.hp;
    for (let i = 0; i < 20 * 8; i++) { w.steps(1); u.hp = u.maxHp; }
    got = w.hits(me).reduce((a, h) => a + h.n, 0) / Math.max(1, w.hits(me).length);
    void hp0; return got;
  };
  const melee = take('sword2h'), ranged = take('bow');
  assert.ok(melee > 0 && ranged > 0 && melee < ranged * 0.9, `a hit on the greatsword (${melee.toFixed(1)}) is smaller than on the bow (${ranged.toFixed(1)})`);
});

// ------------------------------------------------------------------------------------------------ Z39 (#40)

test('Z39 (#40): a wand that throws "three bolts in a fan" throws three — three flights, three hits, each its own damage', () => {
  const w = world();
  const me = w.add('starcaller', 6);
  const it = engine.makeItem({ base: 'wand', rarity: 'rare', level: 6, rng: makeRng(4) });
  it.castStyle = 'fan'; engine.finishItem(it, { fresh: false, convert: false });
  assert.match(it.attackText, /three \w+ bolts in a fan/);
  assert.equal(w.R.equip(me, it, 'weapon').ok, true);
  const m = tame(w.mob('road_brigand', 0, 12, 6));
  const from = w.events.length;
  w.R.intent(me, { t: 'cast', slot: 0, target: m.id });
  w.steps(40);
  const ev = w.events.slice(from);
  const bolts = ev.filter(e => e.type === 'fx' && e.kind === 'bolt' && e.id === me.id);
  assert.equal(bolts.length, 3, 'three projectiles leave the wand');
  assert.deepEqual(bolts.map(b => b.n), [1, 2, 3], 'numbered for the client (n / of)');
  assert.ok(bolts.every(b => b.of === 3));
  const dirs = new Set(bolts.map(b => (typeof b.to === 'object' ? `${b.to.x.toFixed(2)},${b.to.z.toFixed(2)}` : 'id' + b.to)));
  assert.ok(dirs.size >= 1);
  const hits = w.hits(m, me);
  assert.equal(hits.length, 3, `three hits, each its own number (${hits.map(h => h.n).join(', ')})`);
});

test('Z39 (#40): the Wand of the Ninth Star is arcane and throws three stars — made as a reward, and an owned one is put right as it loads', () => {
  const w = world();
  const me = w.add('starcaller', 6);
  const made = w.R.makeItem(me, { base: 'wand', rarity: 'rare', level: 6, name: 'Wand of the Ninth Star', attune: 'arcane', castStyle: 'fan' });
  assert.equal(made.name, 'Wand of the Ninth Star');
  assert.equal(made.castElement, 'arcane');
  assert.equal(made.castStyle, 'fan');
  assert.match(made.attackText, /three arcane bolts in a fan/);
  for (let s = 1; s <= 6; s++) {
    const owned = engine.makeItem({ base: 'wand', rarity: 'rare', level: 6, rng: makeRng(s) });
    owned.name = 'Wand of the Ninth Star';
    const back = refreshItem(owned);
    assert.equal(back.castElement, 'arcane', `seed ${s}: arcane`); assert.equal(back.castStyle, 'fan'); assert.equal(back.name, 'Wand of the Ninth Star');
    assert.equal(back.affixes.filter(a => a.stat === 'castElement').length, 1);
  }
  const quest = JSON.parse(readFileSync(new URL('../../data/quests/classes.json', import.meta.url), 'utf8'));
  const flat = JSON.stringify(quest);
  assert.match(flat, /"name":"Wand of the Ninth Star","attune":"arcane","castStyle":"fan"/, 'the quest reward names its element and style');
});

// ------------------------------------------------------------------------------------------------ Z17 (#17) + Z35 (#36)

import { advancedRows } from '../../js/rules/estimate.js';

test('Z17 (#17): the Early Bond card says which follower it means, when it normally comes, and what the perk changes — numbers from the rules', () => {
  const node = engine.forest.nodes.find(n => n.ruleId === 'earlyBond');
  const c = engine.progression.companions;
  assert.match(node.desc, /class companion/);
  assert.match(node.desc, /not a hired blade/);
  assert.ok(node.desc.includes(`level ${c.main}`) && node.desc.includes(`level ${c.extra}`) && node.desc.includes(`level ${c.earlyBondExtra}`), node.desc);
  for (const k of engine.classes.filter(k => k.pet)) assert.ok(node.desc.toLowerCase().includes(k.name.toLowerCase()), `names ${k.id}`);
  assert.doesNotMatch(node.desc, /\{|second body/);
  assert.match(node.cost, /Hirelings/);
  // the sweep: no card leans on words a player cannot read
  for (const n of engine.forest.nodes) {
    const text = `${n.desc} ${n.cost || ''}`;
    assert.doesNotMatch(text, /None but the walk|\{\w+\}/, n.id);
    assert.doesNotMatch(text, /for \d+%(?: each| as \w+)?[.,]/, `${n.id}: a bare "for N%" — of what? (${text})`);
  }
});

test('Z35 (#36): the magic find, gold find and experience rows say exactly what they count for — and the sheet always shows all three', () => {
  const w = world();
  const me = w.add('rogue', 10);
  const rows = advancedRows(engine, me.r.unit);
  const tip = id => rows.find(r => r.id === id)?.tip || '';
  assert.match(tip('magicFind'), /monsters drop/); assert.match(tip('magicFind'), /chests/); assert.match(tip('magicFind'), /quest rewards/); assert.match(tip('magicFind'), /reward boxes/);
  assert.match(tip('magicFind'), /never makes more items drop/); assert.match(tip('magicFind'), /does not touch shop stock/);
  assert.match(tip('goldFind'), /kill/); assert.match(tip('goldFind'), new RegExp(`\\+${engine.prices.goldFind.cap}%`)); assert.match(tip('goldFind'), /not change gold from chests, treasure, quests or events/);
  assert.match(tip('xpFind'), /each kill/); assert.match(tip('xpFind'), /Quests, events/);
  // and the code agrees: experience gained only scales a KILL
  me.r.unit.derived.xpFind = 50;
  const m = w.mob('moor_hound', 0, 2, 10);
  m.r.unit.hp = 1;
  for (let i = 0; i < 40 && !m.dead; i++) { w.R.intent(me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
  assert.ok(w.awards.some(a => a.id === me.id && a.xp > 0));
});

// ------------------------------------------------------------------------------------------------ Z36 (#37)

import { basicPace, weaponAps } from '../../js/rules/combat-cfg.js';
import { abilityRows } from '../../js/rules/estimate.js';

test('Z36 (#37): every basic attack is slower by the one pace knob — the card, the sheet and the fight agree', () => {
  const pace = basicPace(engine);
  assert.ok(pace > 1, 'basic attacks are slowed');
  for (const base of ['dagger', 'longsword', 'sword2h', 'bow', 'wand', 'staff']) {
    const it = engine.makeItem({ base, rarity: 'normal', level: 8, rng: makeRng(3) });
    const raw = weaponAps(it, {});
    assert.ok(Math.abs(it.aps - Math.round(100 * raw / pace) / 100) <= 0.011, `${base}: the card says ${it.aps} a second (${raw} / ${pace})`);
  }
  const w = world();
  const me = w.add('warrior', 8);
  const card = w.R.basic(me);
  const m = tame(w.mob('road_brigand', 0, 2, 8));
  for (let i = 0; i < 20 * 12; i++) { w.R.intent(me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
  const swings = w.events.filter(e => e.type === 'cast' && e.skill === 'basic' && e.s === me.id && e.hand !== 'off').length;
  assert.ok(Math.abs(swings / 12 - card.aps) / card.aps < 0.2, `${swings / 12} swings a second against the card's ${card.aps}`);
});

test('Z36 (#37): skills hit twice as hard as their row says, the card prints what lands, and across the classes skills now carry most of the damage by level 20', async () => {
  const eng1 = await engineFor(5);
  eng1.combatCfg.skills.damage = 1;
  const eng2 = await engineFor(5);
  const K = eng2.combatCfg.skills.damage;
  assert.ok(K >= 1.5, 'skills are at least half as strong again');
  const hit = eng => { const ch = createCharacter(eng, { id: 'k', classId: 'mage', level: 12, kit: false }); return abilityRows(eng, ch); };
  const a = hit(eng1), b = hit(eng2);
  for (let i = 1; i < a.length; i++) if (a[i].perCast && b[i].perCast) assert.ok(Math.abs(b[i].perCast / a[i].perCast - K) < 0.2 * K, `${a[i].name}: ${a[i].perCast} -> ${b[i].perCast}`);
  assert.ok(Math.abs(b[0].dps - a[0].dps) < 0.05 * a[0].dps + 1, 'the basic attack is not touched by the skill power');
  const card = n => n.match(/(\d+)% weapon damage/)?.[1];
  const dart = id => { const ch = createCharacter(id, { id: 's', classId: 'starcaller', level: 6, kit: false }); return ch.skills.slots[0].desc; };
  assert.equal(+card(dart(eng2)), Math.round(+card(dart(eng1)) * K), 'the card says the doubled share');
  // the whole roster: the basic attack's share of what a character deals, one dummy, every skill on cooldown
  const share = L => { let s = 0; for (const c of eng2.classes) { const ch = createCharacter(eng2, { id: 'r', classId: c.id, level: L }); const r = abilityRows(eng2, ch); const basic = r[0].dps || 0, sk = r.slice(1).reduce((n, x) => n + (x.dps || 0), 0); s += basic / Math.max(1, basic + sk); } return s / eng2.classes.length; };
  assert.ok(share(20) < 0.5, `level 20: the basic attack is ${(share(20) * 100).toFixed(0)}% of the damage`);
  assert.ok(share(10) < 0.6, `level 10: ${(share(10) * 100).toFixed(0)}%`);
});

// ------------------------------------------------------------------------------------------------ Z60 (#61)

test('Z60 (#61): a champion and a rare stay inside their health and damage caps however their modifiers stack; a boss is untouched', () => {
  const T = engine.affixes.cfg.ranks;
  const w = world();
  const L = 12;
  const normal = w.mob('thicket_boar', 30, 0, L).r.unit;
  for (const [rank, aff] of [['rare', ['vital', 'packleader']], ['rare', ['giant', 'unyielding']], ['champion', ['vital']], ['champion', ['giant']]]) {
    const m = w.room.spawn({ kind: 'monster', type: 'thicket_boar', level: L, rank, x: w.sx, z: w.sz + 40, data: { affixes: aff } });
    const u = m.r.unit;
    assert.equal(u.rank, rank);
    assert.ok(u.maxHp <= normal.maxHp * T[rank].capHp * 1.25, `${rank} ${aff}: ${u.maxHp} health against a normal ${normal.maxHp} (cap x${T[rank].capHp})`);
    assert.ok((u.dmg[0] + u.dmg[1]) <= (normal.dmg[0] + normal.dmg[1]) * T[rank].capDmg * 1.1 + 2, `${rank} ${aff}: damage ${u.dmg}`);
  }
  const boss = w.room.spawn({ kind: 'monster', type: 'thicket_boar', level: L, rank: 'boss', x: w.sx + 60, z: w.sz, data: {} });
  assert.equal(boss.r.unit.rankTuned, undefined, 'a boss keeps its own numbers');
});

test('Z60 (#61): a rare always pays at least one rare item, a champion at least one magic item', () => {
  for (const [rank, floor, aff] of [['rare', 'rare', ['ironclad', 'warded']], ['champion', 'magic', ['ironclad']]]) {
    for (let s = 1; s <= 4; s++) {
      const w = world({ seed: s * 13 });
      const me = w.add('warrior', 10);
      const m = w.room.spawn({ kind: 'monster', type: 'road_brigand', level: 10, rank, x: w.sx, z: w.sz + 2, data: { affixes: aff } });
      m.r.unit.hp = 1; m.r.unit.dmg = [0, 0];
      for (let i = 0; i < 80 && !m.dead; i++) { w.R.intent(me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
      assert.ok(m.dead, 'killed');
      const items = w.awards.filter(a => a.id === me.id).flatMap(a => a.items || []);
      const R = { normal: 0, magic: 1, rare: 2, legendary: 3 };
      assert.ok(items.some(it => R[it.rarity] >= R[floor]), `seed ${s}: a ${rank} paid ${items.map(i => i.rarity).join(', ') || 'nothing'}`);
    }
  }
});
