// Wandering packs (owner 2026-10-16): "individual pack members weaker and quicker to die than a lone normal, the pack as a
// whole a real fight, good for area skills … a level-5 and a level-15 solo player of a melee and a ranged class can beat a
// typical pack with skills used, a 2-player party comfortably". Real rules (js/rules/packs.js + monster-ai.js), the real
// pack runner (js/sim/packs.js) and the real compositions (data/provinces/packs.json, vharlen-packs.json), on open
// stand-in ground. The bot presses every skill on the nearest pack member, walks into melee reach (a melee class) or holds
// 8-22 m (a ranged one) at a run; it never drinks a potion and never steps out of a telegraph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules } from '../../js/rules/index.js';
import { createPacks } from '../../js/sim/packs.js';

const J = p => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const T = J('data/provinces/packs.json'), V = J('data/provinces/vharlen-packs.json');
const COMPS = { ...T.compositions, ...V.compositions };
let n = 0;

function arena(comp, level, { lead = true, seed = 1 } = {}) {
  const terrain = standInTerrain(2, 2048), sx = terrain.spawn.x, sz = terrain.spawn.z;
  const room = createRoom({ id: `pkb${++n}`, kind: 'wilds', terrain, seed, createRules, hooks: { log: () => {} } });
  const route = { id: 'r', zone: 'z', kind: 'open', loop: true, pts: [[sx + 20, sz], [sx + 60, sz + 40], [sx + 20, sz + 80], [sx - 20, sz + 40]], rests: [], comps: { [comp]: 1 } };
  const C = { ...COMPS[comp], leader: COMPS[comp].leader ? { ...COMPS[comp].leader, chance: lead ? 1 : 0 } : null };
  const P = createPacks({ room, routes: [route], comps: { [comp]: C }, rules: T.rules, rng: () => room.host.random('packs'), bandAt: () => [level, level] });
  const pk = P.packs[0]; pk.s = 0;
  return { room, P, pk, sx, sz };
}

function fight(comp, level, classes, { seed = 1, maxS = 120 } = {}) {
  const { room, P, pk, sx, sz } = arena(comp, level, { seed });
  const me = classes.map((cls, i) => room.addPlayer({ id: 100 + i, name: 'P' + i, cls, level, xp: 0, gold: 0, room: room.id, x: sx + 20 + i * 2, z: sz - 14 }, null));
  P.materialise(pk);
  const bodies = pk.ents.length;
  const foes = () => [...room.entities.values()].filter(e => e.kind === 'monster' && !e.dead && !(e.data && e.data.pack && e.data.pack.prey));
  const held = me.map(() => 0);
  let k = 0;
  for (; k < maxS * 20 && me.some(m => !m.dead) && foes().length; k++) {
    room.step(); P.step(50);
    me.forEach((p, i) => {
      if (p.dead) return;
      const t = foes().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      if (!t) return;
      const reach = room.rules.attackRange ? room.rules.attackRange(p) : null, d = Math.hypot(t.x - p.x, t.z - p.z);
      const mv = reach == null ? (d > 2.2 ? 1 : 0) : d > Math.min(22, reach - 2) ? 1 : d < 7 ? -1 : 0;
      if (mv) { const u = p.r.unit, s = mv * 5.4 * 0.05 / (d || 1), nx = p.x + (t.x - p.x) * s, nz = p.z + (t.z - p.z) * s; p.moveTo(nx, nz); u.x = nx; u.z = nz; }
      for (const sl of [1, 2, 3, 4, 5, 6]) room.intent(p, { t: 'cast', slot: sl, target: t.id, aim: { x: t.x, z: t.z } });
      held[i] += 0.05;
      if (room.intent(p, { t: 'cast', slot: 0, target: t.id, held: held[i] }).ok) held[i] = 0;
    });
  }
  return { won: !foes().length && me.some(m => !m.dead), alive: me.filter(m => !m.dead).length, seconds: Math.round(k / 20), hp: me.map(m => Math.round(100 * m.hp / m.hpMax)), bodies, lead: !!pk.lead };
}

const TYPICAL = [['hound_hunt', 5], ['brigand_crew', 5], ['slagborn_warparty', 15], ['prowler_pack', 15]];

test('a pack member is weaker and quicker to die than a lone monster of its kind; the leader is an elite with a name, a mark and a title', () => {
  for (const [comp, level] of TYPICAL) {
    const { room, P, pk, sx, sz } = arena(comp, level);
    P.materialise(pk);
    const member = pk.ents.find(x => !x.lead).e;
    const lone = room.spawn({ kind: 'monster', type: member.type, level, x: sx - 40, z: sz - 40, data: { noRank: true } });
    assert.ok(member.hpMax <= lone.hpMax * 0.6, `${comp}: a member has ${member.hpMax} health against a lone ${member.type}'s ${lone.hpMax}`);
    const mu = member.r.unit, lu = lone.r.unit;
    assert.ok(mu.dmg[1] <= lu.dmg[1] * 0.5, `${comp}: a member hits for up to ${mu.dmg[1]} against a lone one's ${lu.dmg[1]}`);
    assert.ok(pk.ents.length >= 5 && pk.ents.length <= 10, `${comp}: ${pk.ents.length} bodies (5-10)`);
    const L = pk.ents.find(x => x.lead).e;
    assert.equal(L.rank, 'champion'); assert.ok(L.info().mods.includes('packleader'), 'the Pack-leader mark (the client hangs a banner on it)');
    assert.equal(L.name, pk.lead.name); assert.ok(L.info().title, 'a title over its name');
  }
});

test('solo: a level-5 and a level-15 melee (warrior) and ranged (ranger) character beat a typical pack with its leader', () => {
  const lines = [];
  for (const [comp, level] of TYPICAL) for (const cls of ['warrior', 'ranger']) for (const seed of [1, 2]) {
    const r = fight(comp, level, [cls], { seed });
    lines.push(`${comp} L${level} ${cls} seed ${seed}: ${r.won ? 'won' : 'LOST'} in ${r.seconds} s, ${r.hp[0]}% health left (${r.bodies} bodies)`);
    assert.ok(r.won, lines.join('\n'));
  }
  console.log('# ' + lines.join('\n# '));
});

test('a party of two beats every typical pack comfortably: both standing, more than half their health left between them', () => {
  const lines = [];
  for (const [comp, level] of TYPICAL) {
    const r = fight(comp, level, ['warrior', 'ranger'], { seed: 3 });
    const mean = (r.hp[0] + r.hp[1]) / 2;
    lines.push(`${comp} L${level} warrior + ranger: ${r.won ? 'won' : 'LOST'} in ${r.seconds} s, health ${r.hp.join('% / ')}%`);
    assert.ok(r.won && r.alive === 2 && mean >= 50, lines.join('\n'));
  }
  console.log('# ' + lines.join('\n# '));
});

test('the pack scales with the players fighting it: health x (1 + 0.5 (n - 1)), growing as they join, never shrinking', () => {
  const { room, P, pk, sx, sz } = arena('hound_hunt', 5);
  P.materialise(pk);
  const a = room.addPlayer({ id: 201, name: 'A', cls: 'warrior', level: 5, xp: 0, gold: 0, room: room.id, x: sx, z: sz - 60 }, null);
  const b = room.addPlayer({ id: 202, name: 'B', cls: 'mage', level: 5, xp: 0, gold: 0, room: room.id, x: sx, z: sz - 62 }, null);
  const m = pk.ents.find(x => !x.lead).e, h0 = m.hpMax;
  P.onHit({ type: 'hit', kind: 'dmg', s: a.id, d: m.id, n: 3 });
  assert.equal(m.hpMax, h0, 'one player: as it was');
  P.onHit({ type: 'hit', kind: 'dmg', s: b.id, d: pk.ents[0].e.id, n: 3 });
  assert.ok(Math.abs(m.hpMax - h0 * 1.5) <= 1, `two players: x1.5 (${h0} -> ${m.hpMax}), every member`);
  P.onHit({ type: 'hit', kind: 'dmg', s: a.id, d: m.id, n: 3 });
  assert.ok(Math.abs(m.hpMax - h0 * 1.5) <= 1, 'the same player again changes nothing');
  assert.equal(pk.contrib.size, 2, 'both are owed a share of the spoils');
});

test('the whole pack comes when one member is pulled, and gives up together', () => {
  const { room, P, pk } = arena('hound_hunt', 5);
  P.materialise(pk);
  const w = pk.walker, lead = pk.ents.find(x => x.lead).e;
  const p = room.addPlayer({ id: 301, name: 'Puller', cls: 'ranger', level: 5, xp: 0, gold: 0, room: room.id, x: w.x + 60, z: w.z }, null);
  room.step(); P.step(50);
  const one = pk.ents.find(x => !x.lead).e;
  // a shot from range on ONE member
  room.rules.room.run(() => { const u = one.r.unit; u.state = 'chase'; u.threat = new Map([[p.id, 10]]); u.lastCombatAt = room.rules.room.clock.now(); });
  for (let i = 0; i < 3; i++) { room.step(); P.step(50); }
  assert.ok(pk.ents.every(x => x.e.r.unit.state === 'chase'), 'every member is coming: ' + pk.ents.map(x => x.e.r.unit.state).join(','));
  // ONE member is dragged past the leash (120 m from where it was pulled): the whole pack gives up, goes home with it and heals
  room.rules.room.run(() => { for (const x of pk.ents) x.e.r.unit.hp = Math.max(1, x.e.r.unit.hp - 5); const u = one.r.unit; u.home = [u.x + 500, u.z]; });
  room.step(); P.step(50);
  const st = pk.ents.map(x => x.e.r.unit.state);
  assert.ok(st.every(s => s === 'return' || s === 'wander'), 'nobody is still fighting: ' + st.join(','));
  assert.equal(one.r.unit.state, 'return', 'the dragged one walks back');
  assert.ok(pk.ents.every(x => x.e.r.unit.hp === x.e.r.unit.maxHp), 'and every member healed as it gave up (the leash)');
  void lead;
});
