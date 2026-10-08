// The DEAD-DATA audit (round 9): does every power and property line an item can carry in Thousandvale DO something here?
// "Move the knob and ask the module": each line is put on a real character in a real room, and it counts as LIVE when
//   * one of its effect hooks (Farhold's effect registry) is actually CALLED during a fight, or
//   * it changes the derived sheet, and a field it changed is actually READ during the fight (a Proxy on the sheet
//     records every read) — or is one of OUTSIDE_READERS, whose reader lives outside the rules and is named there.
// A line with hooks nobody calls, or that moves a number nobody reads (as `movePct` was until round 9), is DEAD.
//
//   node tests/C/effect-audit.mjs        prints the table
import { fileURLToPath } from 'node:url';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { EFFECTS } from '../../js/rules/farhold.js';
import { makeRng } from '../../js/rules/rng.js';

/** Sheet fields whose reader is outside js/rules (the test checks the named source really reads them). */
export const OUTSIDE_READERS = Object.freeze({
  movePct: { file: '../../js/sim/province.js', needle: 'movePct' },             // A: footMul -> entity.speedMul (round 9)
});

const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
const reads = new Set();
let recording = false;
if (!engine.rpg._auditDerive) {
  engine.rpg._auditDerive = true;
  const derive = engine.rpg.derive;
  engine.rpg.derive = function auditDerive(...a) {
    const d = derive.apply(this, a);
    return d && typeof d === 'object' ? new Proxy(d, { get(t, k, r) { if (recording && typeof k === 'string') reads.add(k); return Reflect.get(t, k, r); } }) : d;
  };
}

/** Every line an item can carry here: `[{ kind: 'power' | 'affix', id, stat?, value, from }]`. */
export function reachableLines() {
  const I = engine.items, out = new Map();
  const add = (kind, id, row) => { const key = kind + ':' + id; if (!out.has(key)) out.set(key, { kind, id, ...row }); };
  const lists = Object.entries(I.affixes).filter(([, v]) => Array.isArray(v));
  for (const [name, list] of lists) for (const a of list) if (a?.stat) add('affix', a.stat, { stat: a.stat, value: a.max ?? a.min ?? 1, from: `rollable (${name}: ${a.id})` });
  for (const t of ['weaponBases', 'armorBases']) for (const [k, b] of Object.entries(I[t])) for (const f of b.intrinsic || []) if (f?.stat) add('affix', f.stat, { stat: f.stat, value: f.value ?? 1, from: `base ${k}` });
  for (const u of I.uniques || []) {
    for (const f of [...(u.fixedAffixes || []), ...(u.randomAffixes || [])]) if (f?.stat) add('affix', f.stat, { stat: f.stat, value: f.value ?? f.max ?? f.min ?? 1, from: `unique ${u.id}` });
    if (u.legendaryEffect) add('power', u.legendaryEffect, { value: 1, from: `unique ${u.id}` });
  }
  for (const s of I.sets || []) {
    if (s.legendaryEffect) add('power', s.legendaryEffect, { value: 1, from: `set ${s.id}` });
    for (const id of Object.values(s.thresholdPowers || {})) add('power', id, { value: 1, from: `set ${s.id}` });
    for (const p of s.items || []) for (const f of [...(p.fixedAffixes || []), ...(p.randomAffixes || [])]) if (f?.stat) add('affix', f.stat, { stat: f.stat, value: f.value ?? f.max ?? 1, from: `set ${s.id}` });
    for (const b of Object.values(s.partialBonuses || {})) for (const [stat, value] of Object.entries(b || {})) add('affix', stat, { stat, value, from: `set ${s.id} (bonus)` });
  }
  // …and whatever a generated unique or set piece really carries (Farhold adds lines of its own to some: a quiver's)
  const rng = makeRng(1);
  const fromItem = (it, from) => { for (const a of it?.affixes || []) { if (a.id === 'legendary_effect') { if (a.legendaryId) add('power', a.legendaryId, { value: 1, from }); } else if (a.stat && a.stat !== 'castElement') add('affix', a.stat, { stat: a.stat, value: a.value ?? 1, from }); } };
  for (const u of I.uniques || []) { try { fromItem(engine.rpg.loot.generateUnique(u.id, rng), `unique ${u.id} (generated)`); } catch { /* a unique the loot code cannot make is not reachable */ } }
  for (const s of I.sets || []) for (let i = 0; i < (s.items || []).length; i++) { try { fromItem(engine.rpg.loot.generateSetItem(s.id, i, 'high', rng), `set ${s.id} (generated)`); } catch { /* as above */ } }
  for (const [el, def] of Object.entries(engine.tvGear?.convert?.affixes || {})) add('affix', def.stat, { stat: def.stat, value: 0.08, from: `conversion (${el})` });
  for (const [id, lean] of Object.entries(engine.kits?.leans || {})) for (const p of lean.props || []) add('affix', p.stat, { stat: p.stat, value: p.value, from: `kit lean ${id}` });
  return [...out.values()];
}

const effectOf = line => (line.kind === 'power' ? EFFECTS['legendary:' + line.id] : EFFECTS['affix:' + line.stat]) || null;
const hooksOf = E => (E ? Object.entries(E).filter(([k, f]) => typeof f === 'function' && k !== 'desc').map(([k]) => k) : []);
const CLASS_FOR = [[/^pet/, 'ranger'], [/^heal/, 'cleric'], [/^status/, 'mage'], [/boltSplash|echo|onCast|cost/, 'mage']];

/**
 * Lines whose reader is neither a hook nor a sheet field: the shared engine scans the worn items for the stat itself.
 * Each has its own knob check (does the answer change with the line on?).
 */
export const SCANNED = Object.freeze({
  /** "counts as 2 pieces of every set": one piece of a two-piece set + this = the set's power is on */
  cond_extraSetPiece(u, item) {
    const set = engine.items.sets.find(s => s.legendaryEffect && (s.activationPieces || s.pieces) === 2);
    const piece = engine.rpg.loot.generateSetItem ? null : null;
    const one = { name: 'set piece', type: 'armor', slot: 'head', setId: set.id, rarity: 'legendary', affixes: [], baseKey: set.items[0].baseItemId };
    u.equipment.head = one; u.equipment.ring = null;
    const off = engine.rpg.legendaryPowers(u).includes('legendary:' + set.legendaryEffect);
    u.equipment.ring = item;
    const on = engine.rpg.legendaryPowers(u).includes('legendary:' + set.legendaryEffect);
    u.equipment.head = null;
    return !off && on;
  },
  cond_setThresholdReduce(u, item) {
    const set = engine.items.sets.find(s => s.legendaryEffect && (s.activationPieces || s.pieces) === 2);
    const one = { name: 'set piece', type: 'armor', slot: 'head', setId: set.id, rarity: 'legendary', affixes: [], baseKey: set.items[0].baseItemId };
    u.equipment.head = one; u.equipment.ring = null;
    const off = engine.rpg.legendaryPowers(u).includes('legendary:' + set.legendaryEffect);
    u.equipment.ring = item;
    const on = engine.rpg.legendaryPowers(u).includes('legendary:' + set.legendaryEffect);
    u.equipment.head = null;
    return !off && on;
  },
  /** "every arrow deals this quiver's element": a ranger's arrow is fire with a fire quiver that carries the line, physical without */
  cond_quiverElement(u, item, { room, me, events }) {
    const shoot = withLine => {
      const quiver = engine.makeItem({ base: 'quiver', rarity: 'normal', level: 20, rng: makeRng(8) });
      quiver.element = 'fire'; if (withLine) quiver.affixes.push({ id: 'k_q', name: 'Knob', stat: 'cond_quiverElement', value: 1, element: 'fire' });
      u.equipment.weapon = engine.makeItem({ base: 'shortbow', rarity: 'normal', level: 20, rng: makeRng(9) }); u.equipment.offhand = quiver; u.equipment.ring = null;
      engine.rpg.refresh(u, { full: true });
      const from = events.length;
      room.combat.resolveArrow(u, u.equipment.weapon, 1, 0);
      return events.slice(from).find(e => e.kind === 'arrow')?.element;
    };
    return shoot(false) === 'physical' && shoot(true) === 'fire';
  },
  /** "needs N fewer levels to wear": a helm two levels too high is refused without it and allowed with it */
  cond_levelReqReduce(u, item) {
    const helm = engine.makeItem({ base: 'heavy_helm', rarity: 'normal', level: u.level, rng: makeRng(6) });
    helm.levelReq = u.level + 2;
    u.equipment.ring = null;
    const off = engine.rpg.equipRefusal(u, helm, { into: 'head' });
    u.equipment.ring = item;
    const on = engine.rpg.equipRefusal(u, helm, { into: 'head' });
    return !!off && !on;
  },
});

/** Run one line. Returns `{ live, how, hooks, fired, changed, read }`. A line that looks dead on one class is tried on the others. */
export function auditLine(line, opts = {}) {
  let last = null;
  for (const cls of [null, 'mage', 'ranger', 'cleric']) { last = auditOnce(line, { ...opts, cls }); if (last.live) break; }
  return last;
}
function auditOnce(line, { steps = 1400, cls: forced = null } = {}) {
  const E = effectOf(line), hooks = hooksOf(E);
  const cls = forced || (CLASS_FOR.find(([re]) => hooks.some(h => re.test(h))) || [null, /brand|arrow|quiver/i.test(line.stat || '') ? 'ranger' : 'warrior'])[1];
  const room = createRoom({ id: 'audit', terrain, seed: 9, camps: [], createRules, kind: 'wilds', hooks: { log: () => {} } });
  const me = room.addPlayer({ id: 41, name: 'p', cls, level: 20, xp: 0, gold: 0, room: 'audit', x: SX, z: SZ }, null);
  const u = me.r.unit;
  if (hooks.some(h => /^status/.test(h))) {
    // a status that LANDS (a fire wand's burn, a poison wand's poison): the status powers are asked as it lands
    const wand = engine.makeItem({ base: 'wand', rarity: 'normal', level: 20, rng: makeRng(5) });
    wand.attune = /poison/i.test(line.stat || line.id) ? 'poison' : 'fire'; wand.castElement = wand.attune; wand.element = wand.attune; wand.castStyle = 'bolt'; wand.wandBehaviour = 'bolt';
    room.rules.room.run(() => { u.equipment.weapon = wand; u.equipment.offhand = null; });
  }
  const item = engine.makeItem({ base: 'ring', rarity: 'normal', level: 20, rng: makeRng(3) });
  item.affixes = line.kind === 'power'
    ? [{ id: 'legendary_effect', name: 'Legendary', stat: 'cond_legendaryEffect', value: 1, legendaryId: line.id }]
    : [{ id: 'audit_' + line.stat, name: 'Audit', stat: line.stat, value: line.value },
      // (a barrier's refill rate is only ever asked of someone who HAS a gear barrier)
      ...(line.stat === 'barrierRegen' ? [{ id: 'audit_pool', name: 'Audit', stat: 'barrier', value: 20 }] : [])];
  if (line.kind === 'power') { item.legendaryEffectId = line.id; item.rarity = 'legendary'; }
  const plain = k => { const o = {}; for (const [key, v] of Object.entries(k)) if (typeof v !== 'function') o[key] = JSON.stringify(v); return o; };
  let before = null, after = null;
  if (SCANNED[line.stat]) {
    const events = []; const emit0 = room.rules.field.emit; room.rules.field.emit = ev => { events.push(ev); return emit0(ev); };
    const ok = room.rules.room.run(() => SCANNED[line.stat](u, item, { room: room.rules, me, events }));
    return { live: ok, how: ok ? 'the engine scans worn items for it (knob check)' : 'nothing', hooks, fired: [], changed: [], read: [] };
  }
  // the STATE a conditional sheet line waits for: kills made, low mana, after dark (the same on both sides of the diff)
  u.kills = 3000; u.atNight = true;
  if (hooks.includes('guardPower')) { room.rules.spawnGuard({ x: SX + 3, z: SZ + 3, level: 16, name: 'Guard' }); }
  room.rules.room.run(() => {
    u.equipment.ring = null; engine.rpg.refresh(u, { full: true }); u.mp = 1; engine.rpg.refresh(u); before = { ...plain(u.derived), maxHp: u.maxHp, maxMp: u.maxMp };
    u.equipment.ring = item; u.mp = 1; engine.rpg.refresh(u); after = { ...plain(u.derived), maxHp: u.maxHp, maxMp: u.maxMp };
  });
  const changed = Object.keys(after).filter(k => after[k] !== before[k]);
  const calls = {}, orig = {};
  if (E) for (const k of hooks) { if (k === 'derive') continue; orig[k] = E[k]; calls[k] = 0; E[k] = function (...a) { calls[k]++; return orig[k].apply(this, a); }; }
  reads.clear(); recording = true;
  const fired = () => Object.keys(calls).filter(k => calls[k] > 0);
  const readNow = () => changed.filter(k => reads.has(k) || k === 'maxHp' || k === 'maxMp');
  try {
    for (let k = 0; k < steps; k++) {
      if (fired().length || (k > 60 && readNow().length)) break;
      if (k % 300 === 0) for (let j = 0; j < 3; j++) room.spawn({ kind: 'monster', type: j === 1 ? 'barrow_hound' : 'moor_hound', level: 16, x: SX + j * 2 - 2, z: SZ + 4, data: { noRank: true, ...(hooks.includes('guardPower') ? { event: 'audit' } : {}) } });
      if (hooks.includes('preLethal') && k >= 200) u.hp = Math.min(u.hp, 2); else u.hp = Math.max(u.hp, u.maxHp * 0.3);
      if (k % 7) u.mp = u.maxMp; else u.mp = Math.min(u.mp, u.maxMp * 0.2);
      const t = room.rules.field.monsters.find(m => m.dying == null);
      if (t) { if (k % 40 === 0) room.intent(me, { t: 'cast', slot: 1 + (k / 40) % 6, target: t.id, aim: { x: t.x, z: t.z } }); else room.intent(me, { t: 'cast', slot: 0, target: t.id }); }
      room.step();
    }
  } finally { recording = false; for (const [k, f] of Object.entries(orig)) E[k] = f; }
  const f = fired(), r = readNow(), outside = changed.filter(k => OUTSIDE_READERS[k]);
  const live = f.length > 0 || r.length > 0 || outside.length > 0;
  return { live, how: f.length ? `hook ${f.join(', ')}` : r.length ? `sheet ${r.join(', ')}` : outside.length ? `outside ${outside.join(', ')}` : 'nothing', hooks, fired: f, changed, read: r };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lines = reachableLines();
  const dead = [];
  for (const line of lines) { const a = auditLine(line); if (!a.live) { dead.push(line); console.log('DEAD', line.kind, line.id, '| hooks', a.hooks.join(',') || '-', '| changed', a.changed.join(',') || '-', '|', line.from); } }
  console.log(`${lines.length} lines, ${dead.length} dead`);
}
