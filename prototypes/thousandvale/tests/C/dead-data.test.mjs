// node --test prototypes/thousandvale/tests/C/dead-data.test.mjs
//
// Round 9, the DEAD-DATA rule: no droppable, craftable or promotable item carries a power or a property line that nothing
// in Thousandvale reads. The check is not "is it in a table" (that passes against every orphan) but "move the knob and ask
// the module": tests/C/effect-audit.mjs puts each line on a real character in a real fight and asks whether one of its
// hooks was called or a sheet field it changed was read. What the audit found, and what was done:
//   WIRED     the timed gear effects (rpg.fx.update was never called), state-based sheet lines (kills / low mana / after
//             dark), the gear barrier's refill, "town guards deal more damage while you are with them", move speed (A)
//   STRIPPED  three travel powers (off 3 uniques and 3 sets), the tool / mount properties and uniques

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine, kitsFor } from '../../js/rules/index.js';
import { EFFECTS } from '../../js/rules/farhold.js';
import { INERT_POWERS, INERT_STATS, stripInertItem, TV_POWERS } from '../../js/rules/tv-gear.js';
import { legendaryPool, freshAffix } from '../../js/rules/professions-temper.js';
import { affixText } from '../../js/rules/item-text.js';
import { makeRng } from '../../js/rules/rng.js';
import { reachableLines, auditLine, OUTSIDE_READERS } from './effect-audit.mjs';

const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
let n = 0;
function world(cls = 'warrior', level = 20, hooks = {}) {
  const events = [];
  const id = `dd-${++n}`;
  const room = createRoom({ id, terrain, seed: 9, camps: [], createRules, kind: 'wilds', hooks: { log: () => {}, ...hooks } });
  const ev0 = room.host.event;
  room.host.event = ev => { events.push(ev); return ev0(ev); };
  const me = room.addPlayer({ id: 41, name: 'p', cls, level, xp: 0, gold: 0, room: id, x: SX, z: SZ }, null);
  const mob = (dx, dz, lvl = 16, data = {}) => room.spawn({ kind: 'monster', type: 'moor_hound', level: lvl, x: SX + dx, z: SZ + dz, data: { noRank: true, ...data } });
  const steps = k => { for (let i = 0; i < k; i++) room.step(); };
  const ring = (stat, value, extra = {}) => { const it = engine.makeItem({ base: 'ring', rarity: 'normal', level: 20, rng: makeRng(3) }); it.affixes = [{ id: 'k_' + stat, name: 'Knob', stat, value }]; Object.assign(it, extra); return it; };
  const put = it => { const r = room.rules.equip(me, it); assert.ok(r.ok, r.text); return me.r.unit; };
  return { room, events, me, mob, steps, ring, put, R: room.rules, u: me.r.unit };
}

// ---------------------------------------------------------------------------------------------------- the audit

const LINES = reachableLines();
const LIVE = new Set();

test('the audit: EVERY power and property line an item can carry here does something in a real fight (and the audit can tell when one does not)', () => {
  assert.ok(LINES.length >= 150, `${LINES.length} lines reachable (rollable, built-in, unique, set, conversion, kit)`);
  const dead = [];
  for (const line of LINES) {
    const a = auditLine(line);
    if (a.live) LIVE.add(line.kind + ':' + line.id);
    else dead.push(`${line.kind} ${line.id} — hooks: ${a.hooks.join(', ') || 'none'}; sheet fields changed: ${a.changed.join(', ') || 'none'} (${line.from})`);
  }
  assert.deepEqual(dead, [], 'lines nothing reads');
  // the audit is not a rubber stamp: the three powers that were stripped are still in Farhold's registry — put back on
  // a character they are found dead; so is a property that moves a sheet field nobody reads
  for (const id of ['forage_feast', 'road_cache', 'no_night_raids']) {
    assert.ok(EFFECTS['legendary:' + id], id);
    assert.equal(auditLine({ kind: 'power', id, value: 1, from: 'control' }).live, false, `${id} is found dead`);
  }
  EFFECTS['affix:cond_auditControl'] = { desc: () => 'control', derive: (v, d) => { d.nobodyReadsThis = v; } };
  try { const a = auditLine({ kind: 'affix', id: 'cond_auditControl', stat: 'cond_auditControl', value: 7, from: 'control' }); assert.equal(a.live, false, 'a sheet field nobody reads is found dead'); assert.deepEqual(a.changed, ['nobodyReadsThis']); }
  finally { delete EFFECTS['affix:cond_auditControl']; }
  // a reader outside the rules is named, and really is there
  for (const [field, r] of Object.entries(OUTSIDE_READERS)) assert.ok(readFileSync(new URL(r.file, import.meta.url), 'utf8').includes(r.needle), `${field}: ${r.file} reads it`);
});

test('no droppable, craftable, promotable or kit item carries a line that was not audited live; none carries a stripped one; every line has a card sentence', () => {
  assert.ok(LIVE.size >= 150, 'the audit ran first');
  const bad = new Set();
  const check = (it, where) => {
    if (!it) return;
    for (const a of it.affixes || []) {
      if (a.id === 'legendary_effect') { if (!LIVE.has('power:' + a.legendaryId)) bad.add(`${where}: power ${a.legendaryId} on ${it.name}`); }
      else if (a.stat && !LIVE.has('affix:' + a.stat) && a.stat !== 'castElement') bad.add(`${where}: ${a.stat} on ${it.name}`);
      if (a.stat && a.stat !== 'castElement' && !affixText(a)) bad.add(`${where}: ${a.stat} on ${it.name} has no card sentence`);
    }
    if (it.legendaryEffectId && !LIVE.has('power:' + it.legendaryEffectId)) bad.add(`${where}: power ${it.legendaryEffectId} on ${it.name}`);
    if (INERT_POWERS.includes(it.legendaryEffectId)) bad.add(`${where}: stripped power ${it.legendaryEffectId} on ${it.name}`);
    if (['tool', 'mount', 'light'].includes(it.slot)) bad.add(`${where}: ${it.name} goes in the ${it.slot} slot`);
  };
  const rng = makeRng(606);
  let drops = 0, uniques = 0, sets = 0;
  for (const L of [1, 5, 10, 16, 24, 32, 40, 50]) for (let i = 0; i < 5000; i++) {
    const it = engine.rpg.rollDrop({ level: L, rng, chance: 1, magicFind: i % 2 ? 0 : 900 });
    if (!it) continue;
    drops++; if (it.isUnique) uniques++; if (it.setId) sets++;
    check(it, 'drop');
  }
  assert.ok(drops > 30000 && uniques > 100, `${drops} drops, ${uniques} uniques, ${sets} set pieces`);
  for (const u of engine.items.uniques) check(engine.rpg.loot.generateUnique(u.id, rng), 'unique');               // every unique by name
  for (const s of engine.items.sets) for (let i = 0; i < (s.items || []).length; i++) check(engine.rpg.loot.generateSetItem(s.id, i, 'high', rng), 'set');
  for (const s of engine.items.sets) { for (const id of [s.legendaryEffect, ...Object.values(s.thresholdPowers || {})].filter(Boolean)) if (!LIVE.has('power:' + id)) bad.add(`set ${s.id}: power ${id}`); }
  for (const base of [...Object.keys(engine.items.weaponBases), ...Object.keys(engine.items.armorBases)]) for (const rarity of ['normal', 'magic', 'rare']) {
    const it = engine.makeItem({ base, rarity, level: 20, rng });
    check(it, 'crafted');
    if (rarity !== 'rare' || !it) continue;
    for (let k = 0; k < 6; k++) { const a = freshAffix(engine, it, rng); if (a?.stat && !LIVE.has('affix:' + a.stat)) bad.add(`tempering: ${a.stat}`); }
    for (const p of legendaryPool(engine, it)) if (!LIVE.has('power:' + p.id)) bad.add(`promotion: ${p.id} for ${base}`);
  }
  for (const c of engine.classes) { const k = kitsFor(c.id); for (const it of [...k.armour, ...k.weapons].flatMap(x => x.items)) check(it, `kit ${c.id}`); }
  assert.deepEqual([...bad], []);
});

// ---------------------------------------------------------------------------------------------------- what was stripped

test('STRIPPED: the three travel powers are off the uniques and sets that carried them (the items stay), off items already owned, and the tool / mount lines cannot roll', () => {
  const R = engine.gearReport;
  assert.deepEqual(R.inert.uniques.sort(), ['roadsong', 'the_long_watch', 'thistlewarden']);
  assert.deepEqual(R.inert.sets.sort(), ['foragers_covenant', 'ragpickers_fortune', 'roadwardens_vigil']);
  const rng = makeRng(12);
  for (const id of R.inert.uniques) {
    const it = engine.rpg.loot.generateUnique(id, rng);
    assert.ok(it && it.name && it.affixes.length >= 2, `${id} is still an item with its other properties`);
    assert.ok(!INERT_POWERS.includes(it.legendaryEffectId) && !it.affixes.some(a => a.id === 'legendary_effect' && (!a.legendaryId || INERT_POWERS.includes(a.legendaryId))), `${it.name} carries no dead or empty power line`);
  }
  for (const id of R.inert.sets) { const s = engine.items.sets.find(x => x.id === id); assert.ok(s && !INERT_POWERS.includes(s.legendaryEffect) && Object.keys(s.partialBonuses || {}).length >= 1, `${id}: its piece bonuses stay, the dead full-set power is gone`); }
  for (const id of INERT_POWERS) assert.ok(!engine.items.uniques.some(u => u.legendaryEffect === id) && !engine.items.sets.some(s => s.legendaryEffect === id || Object.values(s.thresholdPowers || {}).includes(id)), id);
  assert.deepEqual(INERT_STATS, [], 'no property is stripped today (the guard bond is wired)');
  // an item a player already owns
  const old = { name: 'Thistlewarden', type: 'weapon', slot: 'weapon', rarity: 'legendary', isUnique: true, legendaryEffectId: 'forage_feast', affixes: [{ id: 'fixed_str', stat: 'str', value: 5 }, { id: 'legendary_effect', stat: 'cond_legendaryEffect', value: 1, legendaryId: 'forage_feast' }] };
  engine.finishItem(old, { fresh: false });
  assert.equal(old.legendaryEffectId, 'tv_forager_hand', 'an owned Thistlewarden gets the replacement power');
  assert.equal(old.affixes.length, 2); assert.equal(old.affixes[1].legendaryId, 'tv_forager_hand'); assert.ok(old.inertStripped);
  const watch = { name: 'The Long Watch', type: 'weapon', slot: 'weapon', rarity: 'legendary', isUnique: true, legendaryEffectId: 'no_night_raids', affixes: [{ id: 'fixed_con', stat: 'con', value: 12 }, { id: 'legendary_effect', stat: 'cond_legendaryEffect', value: 1, legendaryId: 'no_night_raids' }] };
  engine.finishItem(watch, { fresh: false });
  assert.ok(!watch.legendaryEffectId && watch.affixes.some(a => a.stat === 'cond_nightWard' && a.value === 0.2) && !watch.affixes.some(a => a.id === 'legendary_effect'), 'an owned Long Watch trades the dead power for its night line');
  const keepsIts = stripInertItem({ legendaryEffectId: 'thornmail', affixes: [{ id: 'legendary_effect', legendaryId: 'thornmail' }] });
  assert.equal(keepsIts.legendaryEffectId, 'thornmail'); assert.equal(keepsIts.affixes.length, 1);
  // tool / mount properties
  const all = Object.values(engine.items.affixes).filter(Array.isArray).flat();
  assert.equal(all.filter(a => (a.onlySlots || []).some(s => ['tool', 'mount', 'light'].includes(s)) || /^cond_(mount|tool)/.test(a.stat || '')).length, 0);
});

// ---------------------------------------------------------------------------------------------------- what was wired

test('WIRED — move speed: the +18% power is promotable again and is on the sheet field the server moves you by', () => {
  assert.ok(!INERT_POWERS.includes('free_move'));
  const legs = engine.makeItem({ base: 'cloth_legs', rarity: 'rare', level: 20, rng: makeRng(4) });
  assert.ok(legendaryPool(engine, legs).some(p => p.id === 'free_move'), 'in the promotion pool for leggings');
  const w = world('mage');
  const before = w.u.derived.movePct || 0;
  w.put(w.ring('str', 1, { legendaryEffectId: 'free_move', rarity: 'legendary' }));
  assert.equal(w.u.derived.movePct, before + 18);
  assert.match(readFileSync(new URL('../../js/sim/province.js', import.meta.url), 'utf8'), /derived\.movePct|movePct/, 'A reads it (tests/A/pt9-speed walks it over real sockets)');
});

test('WIRED — timed gear effects tick: "more damage the longer the fight" grows and resets, a kill\'s rush starts on the sheet and ENDS, "once a fight" comes back after the fight', () => {
  // (a) sustained damage: the fight clock climbs while something has you as its target, and is 0 again after
  {
    const w = world('warrior');
    w.put(w.ring('cond_sustainedDmgBonus', 0.1));
    w.u.maxHp = w.u.hp = 1e7;
    const m = w.mob(0, 2.5); m.r.unit.maxHp = m.r.unit.hp = 1e7;
    const rt = engine.rpg.fx.rt(w.u);
    const out = () => { const r = engine.rpg.fx.dmgOut({ self: w.u, target: m.r.unit, rt, element: 'physical' }); return typeof r === 'number' ? r : r.mult; };
    assert.equal(out(), 1, 'nothing yet');
    w.steps(20 * 12);
    assert.ok(rt.inCombat > 9, `the fight clock runs (${rt.inCombat?.toFixed(1)} s)`);
    assert.ok(Math.abs(out() - 1.2) < 1e-9, `after 10 s in the fight: +20% (${out()})`);
    w.room.remove(m);
    w.steps(60);
    assert.equal(rt.inCombat, 0); assert.equal(out(), 1, 'and it is gone when the fight is over');
  }
  // (b) a kill's rush: haste on the sheet within a tick of the kill, off again after its five seconds
  {
    const w = world('warrior');
    w.put(w.ring('cond_killInitBonus', 0.2));
    const haste0 = w.u.derived.haste || 0, move0 = w.u.derived.movePct || 0;
    const m = w.mob(0, 2.5, 5);
    for (let k = 0; k < 400 && !m.dead; k++) { w.u.swing.mainReady = 0; w.room.intent(w.me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
    assert.ok(m.dead);
    w.steps(2);
    assert.ok(w.u.derived.haste >= haste0 + 19 && w.u.derived.movePct >= move0 + 19, `the rush is on the sheet (haste ${haste0} -> ${w.u.derived.haste})`);
    w.steps(20 * 6);
    assert.equal(w.u.derived.haste || 0, haste0, 'and it ends'); assert.equal(w.u.derived.movePct || 0, move0);
  }
  // (c) "once a fight" is once a FIGHT
  {
    const w = world('warrior');
    w.put(w.ring('str', 1, { legendaryEffectId: 'cheat_death_once', rarity: 'legendary' }));
    const rt = engine.rpg.fx.rt(w.u);
    rt.cheatSpent = true;
    w.steps(5);
    assert.equal(rt.cheatSpent, false, 'out of a fight it is ready again');
  }
});

test('WIRED — sheet lines that wait on state are re-derived when the state moves: kills made, low mana, after dark', () => {
  // kills
  {
    const w = world('warrior');
    w.put(w.ring('cond_killMemory', 5));
    const hp0 = w.u.maxHp;
    w.u.kills = 20; w.steps(25);
    assert.equal(w.u.maxHp, hp0 + 10, '+5 maximum health per 10 kills, without touching the gear');
  }
  // low mana
  {
    const w = world('mage');
    w.put(w.ring('cond_lowManaRegenBonus', 3));
    w.steps(25);
    const r0 = w.u.derived.mpRegen;
    w.u.mp = 1; w.steps(25);
    assert.ok(Math.abs(w.u.derived.mpRegen - (r0 + 3)) < 1e-9, `+3 mana a second below a third (${r0} -> ${w.u.derived.mpRegen})`);
    w.u.mp = w.u.maxMp; w.steps(25);
    assert.ok(Math.abs(w.u.derived.mpRegen - r0) < 1e-9, 'and back');
  }
  // after dark
  {
    let night = false;
    const w = world('warrior', 20, { isNight: () => night });
    w.put(w.ring('cond_nightWard', 0.25));
    w.steps(25);
    const a0 = w.u.derived.armor;
    night = true; w.steps(25);
    assert.ok(w.u.derived.armor > a0, `more armour after dark (${a0} -> ${w.u.derived.armor})`);
    night = false; w.steps(25);
    assert.equal(w.u.derived.armor, a0);
  }
});

test('WIRED — the gear barrier refills (out of a fight, and by its own rate), never above its pool, and leaves a bigger skill barrier alone', () => {
  const w = world('mage');
  const it = w.ring('barrier', 40);
  it.affixes.push({ id: 'k_regen', name: 'Knob', stat: 'barrierRegen', value: 2 });
  w.put(it);
  const pool = w.u.derived.barrier;
  assert.ok(pool >= 40);
  w.u.barrier = 0; w.steps(21);
  assert.ok(w.u.barrier > 2 && w.u.barrier <= pool, `it comes back (${w.u.barrier} after a second: 8% of ${pool} + 2)`);
  w.steps(20 * 30);
  assert.equal(w.u.barrier, pool, 'up to the pool and no further');
  w.u.barrier = pool + 500; w.steps(40);
  assert.equal(w.u.barrier, pool + 500, 'a skill\'s bigger barrier is not cut down to the gear\'s');
  // and without the property nothing is refilled
  const w0 = world('warrior');
  w0.u.barrier = 0; w0.steps(60);
  assert.equal(w0.u.barrier || 0, 0);
});

test('WIRED — "town guards deal more damage while you are with them" means Thousandvale\'s own guards', () => {
  const avg = bonded => {
    const w = world('warrior');
    if (bonded) w.put(w.ring('cond_guardBond', 1));          // +100%, an odd value on purpose
    w.u.maxHp = w.u.hp = 1e7;
    const g = w.R.spawnGuard({ x: SX + 4, z: SZ, level: 16, name: 'Guard' });
    const m = w.mob(4, 2.5, 16, { event: 'e' }); m.r.unit.maxHp = m.r.unit.hp = 1e7; m.r.unit.dmg = [0, 0]; m.r.unit.armor = 0;
    w.steps(900);
    const hits = w.events.filter(e => e.type === 'hit' && e.s === g.id && e.d === m.id && e.kind === 'dmg');
    assert.ok(hits.length >= 15, `${hits.length} guard hits`);
    return hits.reduce((a, e) => a + e.n, 0) / hits.length;
  };
  const plain = avg(false), bonded = avg(true);
  assert.ok(bonded > plain * 1.6 && bonded < plain * 2.4, `a guard beside the bonded player hits about twice as hard (${plain.toFixed(1)} -> ${bonded.toFixed(1)})`);
});

test('WIRED — "every arrow deals this quiver\'s element": a fire quiver that carries the line makes the arrow fire and it burns; the same quiver without the line does not', () => {
  const shots = withLine => {
    const w = world('ranger');
    const quiver = engine.makeItem({ base: 'quiver', rarity: 'normal', level: 20, rng: makeRng(8) });
    quiver.element = 'fire';
    if (withLine) quiver.affixes.push({ id: 'k_q', name: 'Knob', stat: 'cond_quiverElement', value: 1, element: 'fire' });
    w.R.room.run(() => { w.u.equipment.weapon = engine.makeItem({ base: 'shortbow', rarity: 'normal', level: 20, rng: makeRng(9) }); w.u.equipment.offhand = quiver; engine.rpg.refresh(w.u, { full: true }); });
    const m = w.mob(0, 12); m.r.unit.maxHp = m.r.unit.hp = 1e7; m.r.unit.dmg = [0, 0]; m.r.unit.speed = 0;
    for (let k = 0; k < 200; k++) { w.u.swing.mainReady = 0; w.room.intent(w.me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
    return { fx: w.events.filter(e => e.type === 'fx' && e.kind === 'arrow').map(e => e.element), hits: w.events.filter(e => e.type === 'hit' && e.s === w.me.id && e.d === m.id && e.kind === 'dmg' && e.skill === 'arrow').map(e => e.el || 'physical'), burned: w.events.some(e => e.type === 'fx' && e.kind === 'status' && e.status === 'burn' && e.id === m.id) };
  };
  const plain = shots(false), fire = shots(true);
  assert.ok(plain.fx.length > 3 && plain.fx.every(e => e === 'physical') && plain.hits.every(e => e === 'physical') && !plain.burned);
  assert.ok(fire.fx.length > 3 && fire.fx.every(e => e === 'fire'), `arrows fly as fire (${fire.fx.slice(0, 3)})`);
  assert.ok(fire.hits.length > 3 && fire.hits.every(e => e === 'fire'), 'and land as fire');
  assert.ok(fire.burned, 'and leave a burn');
});

// ---------------------------------------------------------------------------------------------------- the replacements

/** Wear a whole set (every piece, generated by the shared loot code). */
function wearSet(w, setId) {
  const set = engine.items.sets.find(s => s.id === setId), rng = makeRng(21);
  w.R.room.run(() => {
    for (let i = 0; i < set.items.length; i++) { const it = engine.rpg.loot.generateSetItem(setId, i, 'high', rng); const slot = it.type === 'weapon' ? 'weapon' : it.slot === 'ring1' ? 'ring' : it.slot; if (it.type === 'weapon' && it.twoHanded) w.u.equipment.offhand = null; w.u.equipment[slot] = it; }
    engine.rpg.refresh(w.u, { full: true });
  });
  return set;
}

test('REPLACED — Roadwarden\'s Vigil (and Roadsong): +10% move speed while nothing is fighting you, gone within a second of a fight starting, back after it', () => {
  const pct = TV_POWERS.tv_road_pace.pct;
  for (const how of ['set', 'unique']) {
    const w = world('warrior');
    w.u.maxHp = w.u.hp = 1e7;
    const base = w.u.derived.movePct || 0;
    if (how === 'set') { const set = wearSet(w, 'roadwardens_vigil'); assert.equal(set.legendaryEffect, 'tv_road_pace'); }
    else { const it = engine.rpg.loot.generateUnique('roadsong', makeRng(2)); assert.equal(it.legendaryEffectId, 'tv_road_pace'); assert.equal(affixText(it.affixes.find(a => a.id === 'legendary_effect')), TV_POWERS.tv_road_pace.text); w.R.room.run(() => { w.u.equipment.weapon = it; w.u.equipment.offhand = null; engine.rpg.refresh(w.u, { full: true }); }); }
    assert.ok(w.u.legendaryPowers.includes('legendary:tv_road_pace'), `${how}: the power is on`);
    w.steps(25);
    const walking = w.u.derived.movePct;
    assert.ok(walking >= base + pct, `${how}: +${pct}% out of a fight (${base} -> ${walking})`);
    const m = w.mob(0, 2.5); m.r.unit.maxHp = m.r.unit.hp = 1e7;
    w.steps(45);
    assert.equal(w.u.derived.movePct, walking - pct, `${how}: not while something is fighting you`);
    w.room.remove(m); w.steps(45);
    assert.equal(w.u.derived.movePct, walking, `${how}: and back when it is over`);
  }
  assert.match(TV_POWERS.tv_road_pace.text, new RegExp(`\\+${pct}% move speed`), 'the card says the number the code uses');
});

test('REPLACED — Forager\'s Covenant (and Thistlewarden): gathering has a 15% chance of one more of the main material — through the real yield roll', async () => {
  const { createProfessions } = await import('../../js/rules/professions.js');
  const PJ = JSON.parse(readFileSync(new URL('../../data/rules/professions.json', import.meta.url), 'utf8'));
  const PC = JSON.parse(readFileSync(new URL('../../data/provinces/professions.json', import.meta.url), 'utf8'));
  const P = createProfessions(PJ, PC);
  const chance = TV_POWERS.tv_forager_hand.chance;
  const w = world('ranger');
  assert.equal(w.R.gatherBonus(w.me), 0, 'nothing without the gear');
  const blade = engine.rpg.loot.generateUnique('thistlewarden', makeRng(2));
  assert.equal(blade.legendaryEffectId, 'tv_forager_hand');
  w.R.room.run(() => { w.u.equipment.weapon = blade; w.u.equipment.offhand = null; engine.rpg.refresh(w.u, { full: true }); });
  assert.equal(w.R.gatherBonus(w.me), chance);
  const w2 = world('ranger'); const set = wearSet(w2, 'foragers_covenant');
  assert.equal(set.legendaryEffect, 'tv_forager_hand'); assert.equal(w2.R.gatherBonus(w2.me), chance, 'the full set gives the same');
  // the yield roll itself: any node the data has, a few thousand gathers with and without
  const mat = Object.keys(PC.materials)[0];
  const node = { gives: [{ id: mat, n: 1 }], tier: 1 };
  const total = extra => { const rng = makeRng(99); let n = 0; for (let i = 0; i < 6000; i++) for (const y of P.gatherYield({ node, quality: 'good', rng, extra })) n += y.n; return n; };
  const plain = total(0), more = total(w.R.gatherBonus(w.me));
  const per = plain / 6000;
  assert.ok(Math.abs((more - plain) / 6000 - chance) < 0.02, `about ${chance} more material a gather (${per} -> ${(more / 6000).toFixed(3)})`);
  assert.match(readFileSync(new URL('../../js/sim/professions.js', import.meta.url), 'utf8'), /gatherYield\(\{[^}]*extra: [^}]*gatherBonus/, 'the server passes the gatherer\'s bonus to the roll');
  assert.match(TV_POWERS.tv_forager_hand.text, /15% chance/);
});

test('REPLACED — Ragpicker\'s Fortune: +15% gold from kills, and about one crate in ten holds an item one rarity better', () => {
  const lucky = withSet => {
    const w = world('rogue');
    const gf0 = w.u.derived.goldFind || 0;
    if (withSet) { const set = wearSet(w, 'ragpickers_fortune'); assert.equal(set.legendaryEffect, 'tv_ragpicker_luck'); assert.ok(w.u.legendaryPowers.includes('legendary:tv_ragpicker_luck')); }
    const bonus = engine.items.sets.find(s => s.id === 'ragpickers_fortune').partialBonuses;
    void bonus;
    const RANK = { normal: 0, magic: 1, rare: 2, legendary: 3 };
    let better = 0, n = 0;
    for (let i = 0; i < 1500; i++) { const [it] = w.R.openCrate(w.me, w.R.makeCrate(w.me, { slot: 'armor', min: 'uncommon' })) || []; if (!it) continue; n++; if (RANK[it.rarity] >= 2) better++; }
    return { goldFind: (w.u.derived.goldFind || 0) - gf0, share: better / n, n };
  };
  const plain = lucky(false), set = lucky(true);
  assert.ok(plain.n > 1200 && set.n > 1200);
  assert.ok(set.goldFind >= TV_POWERS.tv_ragpicker_luck.goldFind, `the set adds gold find to the sheet (+${set.goldFind}, ${TV_POWERS.tv_ragpicker_luck.goldFind} of it the power)`);
  assert.ok(set.share - plain.share > 0.05 && set.share - plain.share < 0.17, `rare-or-better out of an uncommon crate: ${(plain.share * 100).toFixed(1)}% -> ${(set.share * 100).toFixed(1)}% (the power: +${TV_POWERS.tv_ragpicker_luck.crate * 100}%)`);
  // kill gold reads the sheet's gold find (the reader that was already there)
  const w = world('rogue'); wearSet(w, 'ragpickers_fortune');
  assert.ok(w.u.derived.goldFind >= 15);
});

test('REPLACED — The Long Watch keeps the night: +20% armour after dark, and no empty power line', () => {
  let night = false;
  const w = world('warrior', 20, { isNight: () => night });
  const it = engine.rpg.loot.generateUnique('the_long_watch', makeRng(2));
  assert.ok(!it.legendaryEffectId && !it.affixes.some(a => a.id === 'legendary_effect'));
  const line = it.affixes.find(a => a.stat === 'cond_nightWard');
  assert.ok(line && line.value === 0.2); assert.match(affixText(line), /20% armour after dark/);
  w.R.room.run(() => { w.u.equipment.weapon = it; w.u.equipment.offhand = null; engine.rpg.refresh(w.u, { full: true }); });
  w.steps(25);
  const day = w.u.derived.armor;
  night = true; w.steps(25);
  assert.ok(w.u.derived.armor >= Math.floor(day * 1.15), `armour after dark ${day} -> ${w.u.derived.armor}`);
});
