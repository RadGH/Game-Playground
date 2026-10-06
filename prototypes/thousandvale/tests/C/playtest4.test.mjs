// node --test prototypes/thousandvale/tests/C/playtest4.test.mjs
//
// Owner play-test 4 (~/claude/agent/mmo/round-playtest4.md), the rules side:
//   S13  Forked Bolt's "Grounding" zone appeared round the CASTER; it belongs where the bolt lands. One rule fixes
//        every bolt that leaves a zone (js/rules/cast-skills.js afterCast -> afterBolt `_impactZones`), and an audit
//        casts EVERY skill of every class, bare and with each talent node, and checks where each zone lands.
//   S16  the perk forest had lots for burn/poison/chill and little for lightning: The Gathering Storm (lightning) and
//        The Old Lore (arcane, nature) arms, every new rule with a reader that is exercised here, and a per-class
//        check that the TOP of the forest has plenty that is about how that class fights.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine } from '../../js/rules/index.js';
import { tierNodes } from '../../js/rules/talents.js';
import { perkTags, isTopTier, FLAG_READERS, STAT_READERS } from '../../js/rules/perk-forest.js';
import { PERK_RULES, landed, strikeMult, afterHurt } from '../../js/rules/perk-rules.js';

const engine = rulesEngine();
const rows = engine.skillData.skills;
const terrain = standInTerrain(2, 2048);

function roomWith(cls, id) {
  const events = [];
  const room = createRoom({ id, terrain, seed: 3, camps: [], createRules, hooks: { log: () => {} } });
  const ev0 = room.host.event;
  room.host.event = ev => { events.push(ev); return ev0(ev); };
  const sx = terrain.spawn.x, sz = terrain.spawn.z;
  const me = room.addPlayer({ id: 5, name: 'T', cls, level: 30, xp: 0, gold: 0, room: id, x: sx, z: sz }, null);
  return { room, me, events, sx, sz };
}
/** The placed object behind an fx place event only helps (no strike, no debuff, no trap). */
const helpOnly = (room, z) => z.helps === true;
const zonesIn = list => list.filter(e => e.type === 'fx' && (e.kind === 'place' || e.kind === 'pool'));

// ---------------------------------------------------------------------------- S13

test('S13: Forked Bolt with Grounding puts its zone on the TARGET, not round the caster', () => {
  const { room, me, events, sx, sz } = roomWith('stormcaller', 's13a');
  const u = me.r.unit;
  const i = u.skills.slots.findIndex(s => s.id === 'chain_bolt');
  assert.ok(i >= 0, 'the stormcaller has Forked Bolt');
  u.skillTalents = { chain_bolt: { 1: 'grounding' } };
  const m = room.spawn({ kind: 'monster', type: 'wolf', level: 30, x: sx + 3, z: sz + 14 });
  m.r.unit.attackEvery = 99; m.r.unit.speed = 0;
  const from = events.length;
  const r = room.intent(me, { t: 'cast', slot: i + 1, target: m.id, aim: { x: m.x, z: m.z } });
  assert.ok(r.ok, JSON.stringify(r));
  for (let k = 0; k < 30; k++) room.step();
  const z = zonesIn(events.slice(from));
  assert.equal(z.length, 1, 'one Grounding zone');
  assert.ok(Math.hypot(z[0].x - m.x, z[0].z - m.z) < 1.5, `zone at the target (${z[0].x.toFixed(1)},${z[0].z.toFixed(1)}) vs (${m.x.toFixed(1)},${m.z.toFixed(1)})`);
  assert.ok(Math.hypot(z[0].x - sx, z[0].z - sz) > 10, 'not round the caster');
  // and it works there: the wolf standing in it is struck by the zone (and Shocked)
  const hp0 = m.hp;
  for (let k = 0; k < 40; k++) room.step();
  assert.ok(m.hp < hp0 || m.dead, 'the zone struck the target');
});

test('S13 audit: every zone any skill or talent places lands where it belongs (all 30 classes, bare + every node)', () => {
  const wrong = [];
  let zones = 0;
  const T = 12;                                   // the target stands 12 m in front of the caster
  for (const cls of engine.classes.map(c => c.id)) {
    const { room, me, events, sx, sz } = roomWith(cls, 's13' + cls);
    const u = me.r.unit;
    for (let i = 0; i < 6; i++) {
      const sl = u.skills.slots[i];
      if (sl.empty) continue;
      const row = rows[sl.id];
      const variants = [[0, null]];
      for (const t of [1, 2, 3, 4]) for (const nd of tierNodes(row, t)) variants.push([t, nd]);
      for (const [tier, nd] of variants) {
        for (const g of Object.keys(u.forms || {})) if (u.forms[g]) delete u.forms[g];
        u.skillTalents = nd ? { [sl.id]: { [tier]: nd.id } } : {};
        sl.ready = 0; sl.charges = null; u.mp = u.maxMp; u.hp = u.maxHp;
        me.x = sx; me.z = sz;
        const m = room.spawn({ kind: 'monster', type: 'wolf', level: 30, x: sx, z: sz + T });
        m.r.unit.attackEvery = 99; m.r.unit.speed = 0;
        const from = events.length;
        room.intent(me, { t: 'cast', slot: i + 1, target: m.id, aim: { x: m.x, z: m.z } });
        for (let k = 0; k < 30; k++) room.step();
        const shape = (room.rules.room.run(() => u.skills.rowFor(i)) || row).shape;   // the TALENTED shape (Thrown Shroud makes Smoke a ground skill)
        for (const z of zonesIn(events.slice(from))) {
          zones++;
          const dc = Math.hypot(z.x - sx, z.z - sz), dt = Math.hypot(z.x - sx, z.z - (sz + T));
          const where = `${cls}/${sl.id}:${nd ? nd.id : 'bare'} (${shape}) caster ${dc.toFixed(1)} target ${dt.toFixed(1)}`;
          // a bolt's zone is where it LANDS (the target); a self / around zone is on the caster
          // (a zone that only helps friends — no strike — stays with the caster, where the friends are)
          const helps = z.kind === 'place' && helpOnly(room, z);
          if (shape === 'bolt' && !helps && dt > 2) wrong.push('bolt zone not at the impact: ' + where);
          if (shape === 'bolt' && helps && dc > 4.5) wrong.push('helpful bolt zone away from the caster: ' + where);
          if ((shape === 'self' || shape === 'around') && dc > 4.5) wrong.push('self zone away from the caster: ' + where);
        }
        if (!m.removed) room.remove(m);
      }
      u.skillTalents = {};
    }
  }
  assert.ok(zones > 300, `${zones} zones placed`);
  assert.deepEqual(wrong, []);
});

// ---------------------------------------------------------------------------- S16

const F = engine.rpg.forest;
const top = F.nodes.filter(isTopTier);
const DOTS = new Set(['poison', 'bleed', 'burn', 'burning', 'gnawed', 'curse']);
/** What a class is about, from its own six skills, its weapons and its main attribute. */
function profile(c) {
  const tags = new Set();
  const el = {};
  for (const id of engine.skillData.classes[c.id]) {
    const r = rows[id];
    if (r.element && r.element !== 'physical') { el[r.element] = (el[r.element] || 0) + 1; tags.add(r.element); tags.add('spell'); }
    if (DOTS.has(r.status) || engine.statuses[r.status]?.perSecond > 0) tags.add('dot');
    if (r.shape === 'summon' || r.pet || r.summon) tags.add('pet');
    if (r.heal || r.healFrac || r.burst?.heal || r.healAllies) tags.add('heal');
    if (r.taunt) tags.add('tank');
  }
  const w = (c.weapons || []).join(' ');
  if (/sword|axe|hammer|mace|spear|halberd|polearm/.test(w) || c.primaryAttr === 'STR') tags.add('melee');
  if (/bow|crossbow|javelin/.test(w)) tags.add('ranged');
  if (c.primaryAttr === 'DEX' || /dagger|rapier|bow|crossbow|javelin/.test(w)) tags.add('agile');
  if (/staff|wand|orb|tome|scepter/.test(w) || c.primaryAttr === 'INT') tags.add('spell');
  if (/tank/i.test(c.role || '') || c.shield) tags.add('tank');
  const ranked = Object.entries(el).sort((a, b) => b[1] - a[1]);
  const main = ranked.length ? ranked.filter(x => x[1] === ranked[0][1]).map(x => x[0]) : [];
  return { tags, main };
}

test('S16: every class has a meaningful high-level tree — plenty at the top is about how it fights, and a cornerstone for its main element', () => {
  const thin = [];
  for (const c of engine.classes) {
    const p = profile(c);
    const mine = top.filter(n => [...perkTags(n)].some(t => p.tags.has(t)));
    const keys = mine.filter(n => n.kind === 'keystone');
    if (mine.length < 20) thin.push(`${c.id}: only ${mine.length} top-tier nodes about ${[...p.tags]}`);
    if (keys.length < 3) thin.push(`${c.id}: only ${keys.length} cornerstones about ${[...p.tags]}`);
    if (p.main.length && !top.some(n => n.kind === 'keystone' && p.main.some(m => perkTags(n).has(m)))) thin.push(`${c.id}: no cornerstone for its element ${p.main}`);
  }
  assert.deepEqual(thin, []);
});

test('S16: lightning has at least as much at the top as fire, ice or poison — its own arm, three paths, four rules', () => {
  const count = el => top.filter(n => perkTags(n).has(el)).length;
  const keys = el => top.filter(n => n.kind === 'keystone' && perkTags(n).has(el)).length;
  for (const el of ['fire', 'ice', 'poison']) {
    assert.ok(count('lightning') >= count(el), `lightning ${count('lightning')} vs ${el} ${count(el)}`);
    assert.ok(keys('lightning') >= keys(el), `lightning cornerstones ${keys('lightning')} vs ${el} ${keys(el)}`);
  }
  assert.ok(count('lightning') >= 8 && keys('lightning') >= 4);
  const storm = F.arms.find(a => a.key === 'storm');
  assert.ok(storm, 'The Gathering Storm arm');
  assert.equal(new Set(F.nodes.filter(n => n.arm === 'storm' && n.branch).map(n => n.branch)).size, 3, 'three storm paths');
  for (const a of ['arcane', 'nature']) assert.ok(keys(a) >= 1, a + ' has a cornerstone (The Old Lore)');
  // every new flag and stat names its reader
  for (const f of ['staticCharge', 'conductor', 'thunderhead', 'staticCoat', 'spellwright', 'rootbound']) assert.ok(FLAG_READERS[f], f);
  assert.ok(STAT_READERS.shockPct);
});

// the readers, one at a time, on bare units through the same functions the field calls
function fieldStub() {
  const evs = [], struck = [];
  const monsters = [];
  let r = 0;
  const field = {
    clock: 0, emit: e => evs.push(e), rng: () => r, statusData: engine.statuses, monsters,
    nearestTo: (x, z, range, except) => monsters.filter(m => m !== except && m.dying == null && Math.hypot(m.x - x, m.z - z) <= range).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0] || null,
    strikeArea: (x, z, radius, by, o) => {
      const hit = monsters.filter(m => m.dying == null && Math.hypot(m.x - x, m.z - z) <= radius + 0.5);
      for (const m of hit) { struck.push({ id: m.id, ...o }); landed(field, by, m, { amount: 10 }, o.element); }
      return hit.map(m => ({ enemy: m, result: { amount: 10 } }));
    },
  };
  return { field, evs, struck, monsters, setRng: v => { r = v; } };
}
const foe = (id, x, z = 0) => ({ id, side: 'foe', kind: 'monster', x, z, hp: 100, maxHp: 100, statuses: {} });
const hero = flags => ({ id: 1, kind: 'player', side: 'friend', x: 0, z: 0, hp: 50, maxHp: 100, perkFlags: Object.fromEntries(flags.map(f => [f, true])), derived: {} });

test('S16 readers: Static Charge shocks on a lightning hit; Conductor arcs from a Shocked enemy; Thunderhead bursts on a crit', () => {
  const { field, struck, monsters, setRng } = fieldStub();
  const a = foe(2, 3), b = foe(3, 6);
  monsters.push(a, b);
  const p = hero(['staticCharge']);
  setRng(0.9); landed(field, p, a, { amount: 10 }, 'lightning');
  assert.ok(!a.statuses.shock, '25%: a roll of 0.9 does nothing');
  setRng(0.1); landed(field, p, a, { amount: 10 }, 'fire');
  assert.ok(!a.statuses.shock, 'only lightning');
  landed(field, p, a, { amount: 10 }, 'lightning');
  assert.equal(a.statuses.shock.remaining, PERK_RULES.staticCharge.seconds);
  // Conductor: a hit on the Shocked one arcs to its neighbour, once (no chain off the arc)
  const q = hero(['conductor']);
  landed(field, q, a, { amount: 10 }, 'physical');
  assert.deepEqual(struck.map(s => s.id), [3]);
  assert.equal(struck[0].power, PERK_RULES.conductor.power);
  assert.equal(struck[0].element, 'lightning');
  assert.equal(strikeMult(q, b, { element: 'fire' }), PERK_RULES.conductor.notShocked, 'the cost: less to the unshocked');
  // Thunderhead: a CRITICAL lightning hit bursts and Shocks what it catches
  struck.length = 0;
  const t = hero(['thunderhead']);
  landed(field, t, b, { amount: 10, crit: false }, 'lightning');
  assert.equal(struck.length, 0);
  landed(field, t, b, { amount: 10, crit: true }, 'lightning');
  assert.ok(struck.length >= 1 && struck.every(s => s.power === PERK_RULES.thunderhead.power));
  assert.ok(b.statuses.shock);
});

test('S16 readers: +% to Shocked, Static Coat, Spellwright marks and its cost, Rootbound slows and heals', () => {
  const { field, struck, monsters } = fieldStub();
  const a = foe(2, 1);
  monsters.push(a);
  const p = hero([]); p.derived.shockPct = 20;
  assert.equal(strikeMult(p, a, {}), 1);
  a.statuses.shock = { type: 'shock', remaining: 2 };
  assert.ok(Math.abs(strikeMult(p, a, {}) - 1.2) < 1e-9, 'shockPct');
  delete a.statuses.shock;
  // Static Coat: the monster that hit you is Shocked and struck back — once every 2 s
  const c = hero(['staticCoat']);
  afterHurt(field, c, { amount: 20 }, a, 10);
  assert.ok(a.statuses.shock);
  assert.equal(struck.length, 1); assert.equal(struck[0].power, PERK_RULES.staticCoat.back);
  afterHurt(field, c, { amount: 20 }, a, 11);
  assert.equal(struck.length, 1, 'not again inside 2 s');
  afterHurt(field, c, { amount: 20 }, a, 12.1);
  assert.equal(struck.length, 2);
  // Spellwright: arcane hits stack marks (max 5); every other element is the cost
  const s = hero(['spellwright']);
  const b = foe(3, 2);
  for (let k = 0; k < 7; k++) landed(field, s, b, { amount: 10 }, 'arcane');
  assert.ok(Math.abs(b.statuses.inscribed.takeMore - PERK_RULES.spellwright.per * PERK_RULES.spellwright.max) < 1e-9);
  assert.equal(strikeMult(s, b, { element: 'arcane' }), 1);
  assert.equal(strikeMult(s, b, { element: 'fire' }), PERK_RULES.spellwright.other);
  // Rootbound: a nature hit slows the target and heals you
  const r = hero(['rootbound']);
  const hp = r.hp;
  landed(field, r, b, { amount: 100 }, 'nature');
  assert.equal(b.statuses.web.slow, PERK_RULES.rootbound.slow);
  assert.equal(r.hp, hp + Math.round(100 * PERK_RULES.rootbound.heal));
  assert.equal(strikeMult(r, b, { element: 'holy' }), PERK_RULES.rootbound.other);
});

test('S16: a stormcaller who takes the storm arm hits harder in a real fight (the forest reaches the room)', () => {
  const fight = withPerks => {
    const { room, me, sx, sz } = roomWith('stormcaller', 's16f' + withPerks);
    const u = me.r.unit;
    if (withPerks) {
      u.perks = F.nodes.filter(n => n.arm === 'storm').map(n => n.id);
      room.rules.room.engine.rpg.refresh(u);
      assert.ok(u.perkFlags.conductor && u.perkFlags.staticCharge && u.derived.shockPct > 20, 'flags and stats on the sheet');
    }
    const m = room.spawn({ kind: 'monster', type: 'wolf', level: 30, x: sx, z: sz + 8 });
    m.r.unit.attackEvery = 99; m.r.unit.speed = 0;
    m.r.unit.maxHp = m.r.unit.hp = 1e6;
    const i = u.skills.slots.findIndex(sl => sl.id === 'chain_bolt');
    for (let k = 0; k < 400; k++) {
      u.mp = u.maxMp; u.skills.slots[i].ready = 0;
      room.intent(me, { t: 'cast', slot: i + 1, target: m.id, aim: { x: m.x, z: m.z } });
      room.step();
    }
    assert.equal(room.stats.rulesErrors, 0, room.stats.lastRulesError);
    return 1e6 - m.r.unit.hp;
  };
  const bare = fight(false), storm = fight(true);
  assert.ok(storm > bare * 1.15, `storm arm ${storm} vs bare ${bare}`);
});
