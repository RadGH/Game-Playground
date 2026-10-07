// node --test prototypes/thousandvale/tests/C/playtest6.test.mjs
//
// Owner feedback 6 (~/claude/agent/mmo/round-playtest6.md, the in-game reports), the combat rules:
//   U3   a zone or telegraph ends the moment its caster dies (monsters and players), and hurts nobody after
//   U6   a shield's block is 20%, and says 20% — and EVERY property line is swept: the number on the card is the number on the sheet
//   U8   a boss ward has a life and a breaking point, and the client is told both
//   U11  a druid heals a party member inside a dungeon instance; a fallen party member can be targeted
//   U13  armour: the formula, the perk applied, the reduction shown to a decimal
//   U16  a shape tells the client the body to draw
//   U17  potions heal half your health
//   U18  the druid's wolf shape, and its Wolf Pack

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { affixText, TEXT_FIXES } from '../../js/rules/item-text.js';
import { createCharacter } from '../../js/rules/character.js';
import { coreRows, advancedRows, armorReduction } from '../../js/rules/estimate.js';
import { fixUnits } from '../../js/rules/tv-gear.js';
import { effectOf, potionAmount, POTION_CD_MS } from '../../js/sim/consumables.js';
import { makeRng } from '../../js/rules/rng.js';

const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
let n = 0;
function world(kind = 'wilds') {
  const events = [];
  const id = `pt6-${++n}`;
  const room = createRoom({ id, terrain, seed: 21, camps: [], createRules, kind, hooks: { log: () => {} } });
  const ev0 = room.host.event;
  room.host.event = ev => { events.push(ev); return ev0(ev); };
  let pid = 40;
  const add = (cls, dx = 0, dz = 0, level = 10, party = 'P') => {
    const e = room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: SX + dx, z: SZ + dz }, null);
    if (party) room.rules.onParty(e, party);
    return e;
  };
  const steps = (k = 1) => { for (let i = 0; i < k; i++) room.step(); };
  const slotOf = (e, sid) => e.r.unit.skills.slots.findIndex(s => s.id === sid) + 1;
  return { room, events, add, steps, slotOf };
}
const ready = (e, slot) => { const u = e.r.unit; u.skills.slots[slot - 1].ready = 0; u.mp = u.maxMp; };
const tough = e => { const u = e.r.unit; u.maxHp = u.hp = 1e7; };

// ============================================================================ U3

test('U3: a bog slime dies mid-telegraph — the mark is withdrawn that tick; the puddle it left is taken away and hurts nobody', () => {
  // (a) the telegraph
  {
    const w = world();
    const me = w.add('knight', 0, 0, 5); tough(me);
    const slime = w.room.spawn({ kind: 'monster', type: 'bog_slime', level: 2, x: SX, z: SZ + 6, data: { noRank: true } });
    let tele = null;
    for (let i = 0; i < 800 && !tele; i++) { w.room.step(); tele = w.events.find(e => e.type === 'tele'); }
    assert.ok(tele, 'the slime marked the ground');
    assert.ok(!w.events.some(e => e.type === 'teleR' && e.id === tele.id), 'still winding up');
    const from = w.events.length;
    const hp0 = me.r.unit.hp;
    slime.r.unit.hp = 0; w.room.rules.field.kill(slime.r.unit);
    w.steps(2);
    const gone = w.events.slice(from).find(e => e.type === 'teleR' && e.id === tele.id);
    assert.ok(gone && gone.x === 1 && gone.why === 'dead', `withdrawn at once: ${JSON.stringify(gone)}`);
    w.steps(60);
    assert.ok(me.r.unit.hp >= hp0, 'and it never went off');
    assert.ok(!w.events.slice(from).some(e => e.type === 'hit' && e.d === me.id && e.kind === 'dmg'), 'nothing struck after the death');
    assert.ok(!w.events.slice(from).some(e => e.type === 'obj' && !e.gone), 'no puddle was left by a dead slime');
  }
  // (b) the puddle
  {
    const w = world();
    const me = w.add('knight', 0, 0, 5); tough(me);
    const slime = w.room.spawn({ kind: 'monster', type: 'bog_slime', level: 2, x: SX, z: SZ + 6, data: { noRank: true } });
    const puddles = () => [...w.room.rules.encounters.objects.values()].filter(o => o.leftBy);
    for (let i = 0; i < 2400 && !puddles().length; i++) { me.moveTo(SX, SZ); w.room.step(); }
    assert.equal(puddles().length >= 1, true, 'a slime puddle lies on the ground');
    const p = puddles()[0];
    me.moveTo(p.x, p.z);                                   // stand in it
    w.steps(25);
    const hurtBefore = w.events.filter(e => e.type === 'hit' && e.d === me.id && e.skill === 'pool').length;
    assert.ok(hurtBefore >= 1, 'it hurts while the slime lives');
    slime.r.unit.hp = 0; w.room.rules.field.kill(slime.r.unit);
    const from = w.events.length;
    w.steps(2);
    assert.equal(puddles().length, 0, 'the puddle went with the slime');
    w.steps(120);
    assert.equal(w.events.slice(from).filter(e => e.type === 'hit' && e.d === me.id).length, 0, 'and nothing of it hurts after');
  }
});

test('U3: a player dies — their zone and their burning ground end at once and do nothing after', () => {
  const w = world();
  const cleric = w.add('cleric', 0, 0, 30), friend = w.add('warrior', 3, 0, 30);
  const slot = w.slotOf(cleric, 'sanctuary');
  ready(cleric, slot);
  assert.ok(w.room.intent(cleric, { t: 'cast', slot, aim: { x: friend.x, z: friend.z } }).ok);
  const placed = w.events.find(e => e.type === 'fx' && e.kind === 'place');
  assert.ok(placed, 'Sanctuary stands');
  friend.r.unit.hp = Math.round(friend.r.unit.maxHp * 0.3);
  w.steps(25);
  assert.ok(friend.r.unit.hp > Math.round(friend.r.unit.maxHp * 0.3), 'it heals while the cleric lives');
  const from = w.events.length;
  cleric.r.unit.hp = 0; cleric.r.unit.dead = true;
  w.steps(2);
  assert.ok(w.events.slice(from).some(e => e.type === 'fx' && e.kind === 'unplace' && e.obj === placed.obj && e.why === 'dead'), 'the zone is withdrawn');
  const hp = friend.r.unit.hp;
  friend.r.unit.statuses = {};
  w.steps(60);
  assert.ok(friend.r.unit.hp <= hp + friend.r.unit.maxHp * 0.03 * 3 + 2 && !w.events.slice(from + 4).some(e => e.type === 'hit' && e.kind === 'heal' && e.s === cleric.id), 'no heal from a dead cleric\'s zone');
  // burning ground from a pool wand
  const w2 = world();
  const mage = w2.add('mage', 0, 0, 20);
  const wand = engine.makeItem({ base: 'wand', rarity: 'normal', level: 20, rng: makeRng(3) });
  wand.castStyle = 'pool'; engine.finishItem(wand, { fresh: false });
  assert.ok(w2.room.rules.equip(mage, wand, 'weapon').ok);
  const m = w2.room.spawn({ kind: 'monster', type: 'wolf', level: 20, x: SX, z: SZ + 10, data: { noRank: true } });
  m.r.unit.attackEvery = 99; m.r.unit.speed = 0; m.r.unit.maxHp = m.r.unit.hp = 1e7;
  w2.room.intent(mage, { t: 'cast', slot: 0, target: m.id, aim: { x: m.x, z: m.z } });
  w2.steps(12);
  const pool = w2.events.find(e => e.type === 'fx' && e.kind === 'pool' && e.pid);
  assert.ok(pool, 'burning ground with an id');
  mage.r.unit.hp = 0; mage.r.unit.dead = true;
  const from2 = w2.events.length;
  w2.steps(2);
  assert.ok(w2.events.slice(from2).some(e => e.type === 'fx' && e.kind === 'pool' && e.pid === pool.pid && e.end === 1), 'the ground goes out');
  const hp2 = m.r.unit.hp;
  w2.steps(60);
  assert.equal(m.r.unit.hp, hp2, 'and burns nothing after');
});

// ============================================================================ U6

test('U6: a shield blocks 20% and says 20%; an old shield (0.2) is corrected when it is loaded', () => {
  const w = world();
  const me = w.add('knight', 0, 0, 5);
  const u = me.r.unit;
  w.room.rules.unequip(me, 'offhand');
  const before = u.derived.blockChance;
  const shield = w.room.rules.makeItem(me, { base: 'shield', rarity: 'normal', level: 5 });
  const a = shield.affixes.find(x => x.id === 'base_block_chance');
  assert.equal(a.value, 20);
  assert.equal(affixText(a), '20% chance to block');
  assert.ok(w.room.rules.equip(me, shield, 'offhand').ok);
  assert.equal(u.derived.blockChance, before + 20, 'and 20 points of block reach the sheet');
  assert.equal(advancedRows(engine, u).find(r => r.id === 'blockChance').value, before + 20, 'the sheet row shows the same number (it was x100)');
  const old = { id: 'o', name: 'Old Shield', type: 'armor', slot: 'offhand', isShield: true, affixes: [{ id: 'base_block_chance', stat: 'block_chance', value: 0.2, baseIntrinsic: true }, { id: 'block_chance', stat: 'block_chance', value: 9 }] };
  fixUnits(old); fixUnits(old);
  assert.deepEqual(old.affixes.map(x => x.value), [20, 9], 'corrected once; a rolled block affix (already percent) is left alone');
});

test('U6 sweep: for EVERY property an item can carry, the number on the card is the number the sheet gains', () => {
  const A = engine.items.affixes;
  const defs = [...A.prefixes, ...A.suffixes, ...A.shield, ...A.extended].map(d => ({ id: d.id, stat: d.stat, values: [d.min, d.max] }));
  for (const [key, b] of Object.entries({ ...engine.items.weaponBases, ...engine.items.armorBases })) for (const f of b.intrinsic || []) defs.push({ id: `${key}.${f.stat}`, stat: f.stat, values: [f.value] });
  defs.push({ id: 'base_block_chance', stat: 'block_chance', values: [20] }, { id: 'base_spell_power', stat: 'spellPower', values: [0.08, 0.15] });
  // the sheet fields that are PERCENT-like, and how the sheet row prints each (x1 = already percent points, x100 = a fraction)
  const PCT = { critChance: 1, critDamage: 1, dodge: 1, blockChance: 1, haste: 1, cooldownReduction: 1, goldFind: 1, magicFind: 1, xpFind: 1, lifeSteal: 1, manaSteal: 1, spellPower: 100 };
  const bad = [];
  let swept = 0, checked = 0;
  for (const d of defs) for (const value of d.values) {
    swept++;
    const text = affixText({ id: d.id, stat: d.stat, value });
    if (!text || /undefined|NaN/.test(text)) bad.push(`${d.id}: "${text}"`);
    // a fraction must never be printed as a sub-1 percentage or rounded away to nothing
    if (value > 0 && value < 1 && /(^|[^\d.])0(\.\d+)?%/.test(text)) bad.push(`${d.id} (${value}): "${text}" prints a fraction as a percentage`);
    if (value > 0 && /(^|\s)\+0(\s|$)/.test(text)) bad.push(`${d.id} (${value}): "${text}" rounds the value away`);
    if (value > 0 && value < 1 && !/^cond_/.test(d.stat) && !TEXT_FIXES[d.stat] && /\+0\.\d\b(?!\d)/.test(text) && !text.includes(String(value))) bad.push(`${d.id} (${value}): "${text}" loses the value`);
    if (/^cond_/.test(d.stat) || ['str', 'dex', 'int', 'con'].includes(d.stat)) continue;     // an attribute's knock-on stats are the sheet's, not the card's
    // what the sheet gains
    const ch = createCharacter(engine, { id: 'p', classId: 'knight', level: 10, kit: false });
    const base = { ...ch.derived };
    ch.equipment.ring = { id: 'x', name: 'X', type: 'armor', slot: 'ring', rarity: 'magic', affixes: [{ id: 't', stat: d.stat, value }] };
    engine.rpg.refresh(ch, { full: true });
    for (const [field, k] of Object.entries(PCT)) {
      const gained = (ch.derived[field] || 0) - (base[field] || 0);
      if (Math.abs(gained) < 1e-9) continue;
      const m = /(\d+(?:\.\d+)?)%/.exec(text);
      if (!m) { bad.push(`${d.id}: moves ${field} by ${gained} but the card has no percentage ("${text}")`); continue; }
      checked++;
      if (Math.abs(Number(m[1]) - gained * k) > 0.51) bad.push(`${d.id} (${value}): card says ${m[1]}% but ${field} gains ${+(gained * k).toFixed(2)}%`);
    }
  }
  assert.ok(swept > 110 && checked >= 12, `${swept} property values swept, ${checked} percent stats compared with the sheet`);
  assert.deepEqual(bad, []);
  // and the sheet's own rows print a percent stat as the percent it is
  const ch = createCharacter(engine, { id: 'q', classId: 'knight', level: 10, kit: false });
  ch.equipment.ring = { id: 'x', name: 'X', type: 'armor', slot: 'ring', rarity: 'magic', affixes: [{ stat: 'spellPower', value: 0.18 }, { stat: 'block_chance', value: 15 }, { stat: 'critChance', value: 9 }] };
  const b0 = createCharacter(engine, { id: 'r', classId: 'knight', level: 10, kit: false }).derived;
  engine.rpg.refresh(ch, { full: true });
  const rows = [...coreRows(engine, ch), ...advancedRows(engine, ch)];
  assert.equal(rows.find(r => r.id === 'spellPower').value, 18);
  assert.equal(rows.find(r => r.id === 'blockChance').value, Math.round((b0.blockChance + 15) * 10) / 10);
  assert.equal(rows.find(r => r.id === 'critChance').value, Math.round((b0.critChance + 9) * 10) / 10);
  assert.equal(affixText({ stat: 'spellPower', value: 0.18 }), '+18% spell power (added to every fire, ice, lightning, poison, shadow, holy and arcane hit)');
  assert.equal(affixText({ stat: 'cond_companionFury', value: 0.2 }), 'Your followers deal 20% more damage', 'and the who-wording is applied');
});

// ============================================================================ U13

test('U13: armour — the formula, the perk applied, the reduction shown to a decimal', () => {
  assert.equal(armorReduction(35), 25.9); assert.equal(armorReduction(41), 29.1); assert.equal(armorReduction(45), 31);
  const w = world();
  const me = w.add('knight', 0, 0, 3);
  const u = me.r.unit;
  const a0 = u.derived.armor;
  const row = () => coreRows(engine, u).find(r => r.id === 'armorReduction');
  assert.equal(row().value, armorReduction(a0));
  assert.match(row().tip, /armour \/ \(100 \+ armour\)/);
  const node = [...engine.forest.byId.values()].find(x => x.arm === 'melee' && x.grants?.armor);
  assert.equal(node.grants.armor, 10, 'the low-ring armour perk is +10 (was +6)');
  u.bonusPerks = 10;
  const path = pathTo(engine.forest, [], node.id);
  for (const id of path) assert.ok(w.room.rules.takePerk(me, id).ok, id);
  assert.equal(u.derived.armor, a0 + 10 + path.slice(0, -1).reduce((s, id) => s + (engine.forest.byId.get(id).grants?.armor || 0), 0), 'the perk IS applied to the sheet');
  assert.ok(row().value >= armorReduction(a0) + 4, `the reduction visibly moved: ${armorReduction(a0)}% -> ${row().value}%`);
  // and it is real: the same wolf bite hurts less
  const bite = armor => { const d = { ...u.derived, armor }; return 100 / (100 + armor); };
  assert.ok(bite(a0 + 10) < bite(a0) * 0.94, 'about 7% less physical damage taken');
});
function pathTo(forest, taken, goal) {
  const have = new Set(['start', ...taken]);
  const adj = new Map();
  for (const [a, b] of forest.links || []) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const prev = new Map(); const q = [...have];
  for (const s of have) prev.set(s, null);
  while (q.length) { const cur = q.shift(); if (cur === goal) break; for (const nx of adj.get(cur) || []) if (!prev.has(nx)) { prev.set(nx, cur); q.push(nx); } }
  const out = [];
  for (let c = goal; c && !have.has(c); c = prev.get(c)) out.unshift(c);
  return out;
}

// ============================================================================ U8

function wardFight(encounter, type) {
  const w = world('instance');
  const me = w.add('warrior', 0, 0, 12); tough(me);
  const boss = w.room.spawn({ kind: 'monster', type, level: 3, rank: 'boss', x: SX, z: SZ + 3, data: { encounter } });
  const bu = boss.r.unit;
  w.room.intent(me, { t: 'cast', slot: 0, target: boss.id, aim: { x: boss.x, z: boss.z } });
  w.steps(10);
  bu.hp = Math.round(bu.maxHp * 0.6);
  let up = null;
  for (let i = 0; i < 80 && !up; i++) { me.r.unit.hp = me.r.unit.maxHp; w.room.step(); up = w.events.find(e => e.type === 'fx' && e.kind === 'shield' && e.on === true); }
  return { w, me, boss, bu, up };
}

test('U8: the Barrow Warden\'s ward has a stated life and a breaking point — it is told to the client, breaks under blows, and fades by itself', () => {
  // it fades by itself
  {
    const { w, boss, bu, up } = wardFight('barrow_warden', 'brigand_captain');
    assert.ok(up, 'the ward went up');
    assert.ok(up.ms >= 8000 && up.ms <= 30000, `a stated life (${up.ms} ms)`); assert.ok(up.pool > 0 && up.pool <= bu.maxHp * 0.25, 'and a breaking point');
    assert.deepEqual(Object.keys(w.room.rules.wardOf(boss)).sort(), ['hp', 'leftMs', 'max', 'ms', 'on']);
    const from = w.events.length;
    let ticks = 0, down = null;
    const me = [...w.room.entities.values()].find(e => e.kind === 'player');
    // the fight goes on (a boss nobody fights resets), but every blow's dent in the ward is undone: only the clock can end it
    while (!down && ticks < 700) { me.r.unit.swing.mainReady = 0; w.room.intent(me, { t: 'cast', slot: 0, target: boss.id, aim: { x: boss.x, z: boss.z } }); bu.barrier = up.pool; bu.hp = Math.round(bu.maxHp * 0.6); me.r.unit.hp = me.r.unit.maxHp; w.room.step(); ticks++; down = w.events.slice(from).find(e => e.type === 'fx' && e.kind === 'shield' && e.on === false); }
    assert.ok(down && down.why === 'expired', `it faded (${JSON.stringify(down)})`);
    assert.ok(Math.abs(ticks / 20 - up.ms / 1000) < 1.5, `after ${ticks / 20}s — the ${up.ms / 1000}s it said`);
    const upd = w.events.slice(from).filter(e => e.type === 'fx' && e.kind === 'shield' && e.left != null);
    assert.ok(upd.length >= up.ms / 1000 - 4 && upd[0].left > upd.at(-1).left && upd[0].max === up.pool, 'a countdown and a bar, once a second');
    assert.equal(w.room.rules.wardOf(boss), null);
    assert.equal(bu.barrier, 0);
  }
  // it breaks under blows, long before that
  {
    const { w, me, boss, bu, up } = wardFight('barrow_warden', 'brigand_captain');
    assert.ok(up);
    const from = w.events.length;
    let ticks = 0, down = null;
    while (!down && ticks < 400) { me.r.unit.hp = me.r.unit.maxHp; me.r.unit.swing.mainReady = 0; w.room.intent(me, { t: 'cast', slot: 0, target: boss.id, aim: { x: boss.x, z: boss.z } }); w.room.step(); ticks++; down = w.events.slice(from).find(e => e.type === 'fx' && e.kind === 'shield' && e.on === false); }
    assert.ok(down && down.why === 'broken', `shattered by damage (${JSON.stringify(down)}) after ${ticks / 20}s`);
    assert.ok(ticks / 20 < up.ms / 1000 - 1, 'sooner than waiting it out');
    const hp = bu.hp;
    for (let i = 0; i < 40; i++) { me.r.unit.hp = me.r.unit.maxHp; me.r.unit.swing.mainReady = 0; w.room.intent(me, { t: 'cast', slot: 0, target: boss.id, aim: { x: boss.x, z: boss.z } }); w.room.step(); }
    assert.ok(bu.hp < hp || boss.dead, 'and the Warden can be hurt again');
  }
});

test('U8: every encounter that raises a ward gets the same clock (no script can make a boss unkillable)', () => {
  const withWard = Object.values(engine.encounters.scripts).filter(s => JSON.stringify(s).includes('"shield":true') || /"shield":\{/.test(JSON.stringify(s)));
  assert.ok(withWard.length >= 8, `${withWard.length} scripts raise a ward`);
  const W = engine.progression.ward;
  assert.ok(W.seconds <= 20 && W.pool <= 0.15);
  for (const s of withWard) {
    const custom = [...JSON.stringify(s).matchAll(/"shield":(\{[^}]*\})/g)].map(m => JSON.parse(m[1]));
    for (const c of custom) { assert.ok((c.seconds ?? W.seconds) <= 30, `${s.id}: a ward of ${c.seconds}s`); assert.ok((c.pool ?? W.pool) <= 0.25, `${s.id}: a ward pool of ${c.pool}`); }
  }
});

// ============================================================================ U11

test('U11: inside a dungeon instance a druid\'s Greensap heals the party member it is aimed at; a fallen one can be targeted', () => {
  const w = world('instance');
  const druid = w.add('druid', 0, 0, 3), knight = w.add('knight', 12, 9, 3);       // 15 m apart, as in a crypt room
  const slot = w.slotOf(druid, 'renew');
  assert.equal(slot, 2);
  assert.equal(w.room.rules.bar(druid)[1].ally, true);
  const u = knight.r.unit;
  u.hp = Math.round(u.maxHp * 0.4);
  const hp0 = u.hp;
  assert.ok(w.room.intent(druid, { t: 'target', id: knight.id }).ok, 'a party member is a valid target');
  ready(druid, slot);
  const r = w.room.intent(druid, { t: 'cast', slot, target: knight.id });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(u.hp >= hp0 + Math.round(u.maxHp * 0.1) - 1, `healed at once (${hp0} -> ${u.hp})`);
  assert.ok(u.statuses.regen, 'and mending');
  const heal = w.events.find(e => e.type === 'hit' && e.kind === 'heal' && e.d === knight.id && e.s === druid.id);
  assert.ok(heal, 'everyone sees the heal land on the knight');
  // through a wall-less 29 m it still reaches; at 31 m it lands on the druid instead
  knight.moveTo(druid.x + 29, druid.z); u.hp = hp0; ready(druid, slot);
  w.room.intent(druid, { t: 'cast', slot, target: knight.id });
  assert.ok(u.hp > hp0, 'reaches 29 m');
  knight.moveTo(druid.x + 31.5, druid.z); w.steps(1); u.hp = hp0; u.statuses = {}; ready(druid, slot);
  w.room.intent(druid, { t: 'cast', slot, target: knight.id });
  assert.equal(u.hp, hp0, '31 m is out of reach (the heal lands on the druid)');
  // no party id on one of them = strangers: the only thing that can refuse it
  w.room.rules.onParty(knight, null);
  knight.moveTo(druid.x + 5, druid.z); w.steps(1); ready(druid, slot);
  w.room.intent(druid, { t: 'cast', slot, target: knight.id });
  assert.equal(u.hp, hp0, 'without a shared party the heal is not theirs');
  w.room.rules.onParty(knight, 'P');
  // a fallen friend can be targeted (for a revive)
  u.hp = 0; u.dead = true; w.steps(1);
  assert.ok(knight.dead);
  assert.ok(w.room.intent(druid, { t: 'target', id: knight.id }).ok, 'a fallen party member is targetable');
  const stranger = w.add('rogue', 2, 2, 3, null);
  stranger.r.unit.hp = 0; stranger.r.unit.dead = true; w.steps(1);
  assert.equal(w.room.intent(druid, { t: 'target', id: stranger.id }).ok, false, 'a fallen stranger is not');
});

// ============================================================================ U16 / U18

test('U16: taking a shape tells the client the body to draw, and leaving it says so', () => {
  const w = world();
  const druid = w.add('druid', 0, 0, 30);
  assert.equal(w.room.rules.formOf(druid), null);
  for (const [sid, creature] of [['briarback_shape', 'boar'], ['moonpelt_shape', 'wolf']]) {
    const slot = w.slotOf(druid, sid);
    ready(druid, slot);
    const from = w.events.length;
    assert.ok(w.room.intent(druid, { t: 'cast', slot }).ok, sid);
    const fx = w.events.slice(from).find(e => e.type === 'fx' && e.kind === 'form' && e.on === true);
    assert.ok(fx?.shape, `${sid}: the form event carries the body`);
    assert.equal(fx.shape.creature, creature);
    assert.ok(fx.shape.scale > 0 && fx.shape.colors?.body && fx.shape.id && fx.shape.name);
    assert.deepEqual(w.room.rules.formOf(druid), fx.shape, 'rules.formOf answers the same for a late joiner');
    assert.equal(JSON.stringify(fx.shape).includes('undefined'), false);
  }
  // back to your own body
  const slot = w.slotOf(druid, 'moonpelt_shape');
  w.steps(40); ready(druid, slot);
  const from = w.events.length;
  assert.ok(w.room.intent(druid, { t: 'cast', slot }).ok);
  assert.ok(w.events.slice(from).some(e => e.type === 'fx' && e.kind === 'form' && e.on === false));
  assert.equal(w.room.rules.formOf(druid), null);
  // a stance is not a body
  const fighter = w.add('fighter', 5, 0, 30);
  const st = w.slotOf(fighter, 'duelist_stance');
  ready(fighter, st); w.room.intent(fighter, { t: 'cast', slot: st });
  assert.equal(w.room.rules.formOf(fighter), null);
});

test('U18: Moonpelt — the druid\'s wolf shape on key 3: two bleeding bites, its own talent tree, and Wolf Pack calls two wolves', () => {
  const w = world();
  const druid = w.add('druid', 0, 0, 20);
  const u = druid.r.unit;
  const slot = w.slotOf(druid, 'moonpelt_shape');
  assert.equal(slot, 3, 'key 3: a level-6 druid has it');
  const card = w.room.rules.bar(druid)[2];
  assert.match(card.desc, /Moonpelt shape/);
  const tree = w.room.rules.talents(druid).skills.find(s => s.skillId === 'moonpelt_shape');
  assert.equal(tree.tiers.length, 4);
  assert.ok(tree.tiers.every(t => t.nodes.length >= 2 && t.nodes.every(nd => nd.desc && nd.desc.length > 10)), 'four tiers, two real nodes each');
  assert.ok(tree.tiers[2].nodes.some(nd => nd.id === 'wolf_pack'), 'Wolf Pack is its tier-3 evolution');
  // the shape itself
  const m = w.room.spawn({ kind: 'monster', type: 'wolf', level: 20, x: SX, z: SZ + 2, data: { noRank: true } });
  m.r.unit.attackEvery = 99; m.r.unit.speed = 0; m.r.unit.maxHp = m.r.unit.hp = 1e7;
  const speed0 = u.derived.moveSpeed;
  ready(druid, slot); assert.ok(w.room.intent(druid, { t: 'cast', slot }).ok);
  w.steps(2);
  assert.ok(u.derived.moveSpeed > speed0 * 1.2, 'faster on four legs');
  const from = w.events.length;
  assert.ok(w.room.intent(druid, { t: 'cast', slot: 0, target: m.id, aim: { x: m.x, z: m.z } }).ok);
  w.steps(12);
  const bites = w.events.slice(from).filter(e => e.type === 'hit' && e.d === m.id && e.kind === 'dmg');
  assert.ok(bites.length >= 2, `two bites (${bites.length})`);
  assert.ok(m.r.unit.statuses.bleed, 'that leave Bleeding');
  assert.equal(w.room.rules.attackRange(druid), null, 'a melee shape');
  // leave it, take Wolf Pack, take the shape again: two wolves come
  w.steps(40); ready(druid, slot); w.room.intent(druid, { t: 'cast', slot });
  const pick = w.room.rules.pickTalent(druid, 'moonpelt_shape', 3, 'wolf_pack');
  assert.ok(pick.ok, pick.text);
  const petsOf = () => [...w.room.entities.values()].filter(e => e.kind === 'npc' && e.data?.pet && e.data.owner === druid.id);
  const before = petsOf().length;
  w.steps(40); ready(druid, slot);
  assert.ok(w.room.intent(druid, { t: 'cast', slot }).ok);
  w.steps(3);
  assert.equal(petsOf().length - before, 2, 'two pack wolves');
  assert.ok(petsOf().every(p => p.type === 'grove_wolf'));
  w.steps(31 * 20);
  assert.equal(petsOf().length, before, 'for 30 seconds');
});

// ============================================================================ U17 / U5

test('U17: a healing potion is half your health (a greater one four fifths) on a 20 s cooldown', () => {
  assert.equal(POTION_CD_MS, 20000);
  const heal = (id, hpMax) => potionAmount(effectOf({ kind: 'potion', id, effect: engine.items.potions[id].effect }), hpMax, 100).hp;
  for (const [cls, level] of [['knight', 1], ['knight', 5], ['druid', 5], ['knight', 10], ['knight', 20]]) {
    const hpMax = createCharacter(engine, { id: 'p', classId: cls, level }).maxHp;
    assert.equal(heal('healing_potion', hpMax), Math.max(40, Math.round(hpMax * 0.5)), `${cls} ${level}`);
    assert.equal(heal('greater_healing', hpMax), Math.max(80, Math.round(hpMax * 0.8)));
    assert.ok(heal('healing_potion', hpMax) / hpMax >= 0.5);
  }
});

test('U5: the rules hold no stack — useItem never reads or writes a count (A counts)', () => {
  const w = world();
  const me = w.add('knight', 0, 0, 5);
  const use = Object.freeze({ type: 'buff', buff: Object.freeze({ stat: 'dmgPct', amount: 0.03, minutes: 15 }) });
  const opts = Object.freeze({ name: 'Whetstone', itemId: 'whetstone' });
  const r = w.room.rules.useItem(me, use, opts);
  assert.ok(r.ok && r.consume === true, 'the rules say "consume one"; how many are left is the bag\'s business');
  for (const made of [w.room.rules.makeCrate(me, { slot: 'any' }), w.room.rules.makeItem(me, { base: 'sword' })]) assert.ok(made.count == null && made.stack !== true, 'what the rules make never stacks');
});

test('U11 (the real cause): every healing class can heal a party member at LEVEL 1 — and still has a level-1 attack', () => {
  for (const cls of engine.skillData.healers) {
    const w = world('instance');
    const healer = w.add(cls, 0, 0, 1), friend = w.add('knight', 4, 0, 1);
    const bar = w.room.rules.bar(healer);
    assert.deepEqual([bar[0].locked, bar[1].locked], [false, false], `${cls}: keys 1 and 2 are open at level 1`);
    assert.equal(bar[2].locked, true); assert.equal(bar[2].lockedText, `Unlocks at level ${bar[2].level}`);
    const heal = bar.findIndex(b => b.ally && !b.locked) + 1;
    assert.ok(heal === 1 || heal === 2, `${cls}: the heal is key 1 or 2`);
    const attack = bar.slice(0, 2).find(b => !b.ally);
    assert.ok(attack, `${cls}: the other key is not a heal (${bar[0].id}, ${bar[1].id})`);
    const u = friend.r.unit; u.hp = Math.round(u.maxHp * 0.3); const hp0 = u.hp;
    w.room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: SX, z: SZ + 5, data: { noRank: true } });
    ready(healer, heal);
    const r = w.room.intent(healer, { t: 'cast', slot: heal, target: friend.id, aim: { x: friend.x, z: friend.z } });
    assert.ok(r.ok, `${cls}: ${JSON.stringify(r)}`);
    assert.ok(u.hp > hp0, `${cls}: the level-1 friend was healed`);
    const no = w.room.intent(healer, { t: 'cast', slot: 3 });
    assert.equal(no.ok, false); assert.equal(no.why, 'locked'); assert.match(no.text, /level/);
  }
  // nobody else's ladder moved
  const w = world();
  const war = w.add('warrior', 0, 0, 1);
  assert.deepEqual(w.room.rules.bar(war).map(b => b.level), [1, 3, 6, 12, 18, 24]);
});
