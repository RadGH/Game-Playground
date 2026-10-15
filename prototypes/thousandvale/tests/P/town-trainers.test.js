import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNav, NAV } from '../../js/rules/terrain-read.js';
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';

const ROOT = new URL('../../', import.meta.url);
const J = file => JSON.parse(readFileSync(new URL(file, ROOT), 'utf8'));
const offices = J('data/provinces/offices.json');
const numbers = J('data/rules/professions.json');
const content = J('data/provinces/professions.json');
const gathering = numbers.professions.filter(p => p.kind === 'gather' && !p.start);

test('every major town has dedicated gathering teachers standing on clear ground', () => {
  assert.deepEqual(offices.problems, []);
  for (const town of Object.values(offices.towns)) {
    const nav = parseNav(readFileSync(new URL(`data/zones/${town.zone}/nav.bin`, ROOT)));
    const [, zx, zz] = /^z(\d+)_(\d+)$/.exec(town.zone).map(Number);
    for (const p of gathering) {
      const dedicated = role => numbers.roles[role]?.trains?.length === 1 && numbers.roles[role].trains[0] === p.id;
      const teachers = town.offices.filter(o => !o.shop && dedicated(o.role)).map(o => ({ ...o.door, titled: o.titled }));
      teachers.push(...content.trainers.filter(t => t.town === town.name && dedicated(t.role)).map(t => ({ x: t.x - zx * 2048, z: t.z - zz * 2048, titled: true })));
      assert.equal(teachers.length, 1, `${town.name}: one dedicated ${p.name} teacher`);
      for (const t of teachers) {
        const bits = nav.at(t.x, t.z);
        assert.ok(t.titled, `${town.name}: ${p.name} teacher has a title`);
        assert.ok(bits & NAV.WALK, `${town.name}: ${p.name} teacher is walkable`);
        assert.equal(bits & (NAV.BUILDING | NAV.SOLID | NAV.DEEP | NAV.SHALLOW | NAV.STEEP), 0, `${town.name}: ${p.name} teacher is clear of obstacles`);
        assert.ok(Math.hypot(t.x - town.x, t.z - town.z) < town.r, `${town.name}: ${p.name} teacher is inside town`);
      }
    }
  }
});

test('round 11 (live #11): every trade is known from the start; the spawned teachers in every major town still offer their trade and sell its tool again', async t => {
  const S = await realServer({ roadEvents: false, travellers: false });
  const a = await joinReal(S.srv, S.clock, 'Townapprentice');
  t.after(async () => { a.close(); await S.srv.stop(); });
  const P = S.world.province, o = rec(S.world, a), clock = S.clock;
  const used = [], bought = [];
  a.on('used', m => used.push(m)); a.on('profR', m => bought.push(m));
  const majorNames = new Set(Object.values(offices.towns).map(t => t.name));
  const towns = [...P.rooms.values()].filter(r => r.kind === 'town' && majorNames.has(r.name));
  assert.equal(towns.length, Object.keys(offices.towns).length);
  for (const id of numbers.professions.map(p => p.id)) assert.ok(P.professions.knows(o.char, id), id + ' known from the start');
  for (const p of numbers.professions.filter(p => p.tool && p.id !== 'angling')) assert.ok(o.char.bag.some(i => i.tool && i.use?.prof === p.id), `${p.name}: starting tool`);
  for (const town of towns) {
    o.char.professions = {}; o.char.bag = []; o.char.gold = 1000;
    P.professions.ensureNodes(town);
    const npcs = [...town.objects.values()].filter(e => e.data?.npc);
    for (const p of numbers.professions.filter(p => !p.start)) {
      const teachers = npcs.filter(e => numbers.roles[e.data.npc.role]?.trains?.includes(p.id));
      const teacher = teachers.find(e => !e.data.npc.shop && numbers.roles[e.data.npc.role].trains.length === 1) || teachers[0];
      assert.ok(teacher, `${town.name}: ${p.name} teacher spawned`);
      P.transfer(o, town, { x: teacher.x + 1, z: teacher.z }, 'test');
      await run(clock, 600);
      used.length = 0;
      a.use(teacher.id); await until(clock, () => used.length, 2000);
      assert.ok(used[0].ok && used[0].prof?.trains.includes(p.id) && used[0].prof.known.includes(p.id), `${town.name}: ${p.name} offered when spoken to`);
      assert.ok(P.professions.knows(o.char, p.id), `${town.name}: ${p.name} known`);
      if (p.tool && !o.char.bag.some(i => i.tool && i.use?.prof === p.id)) {
        bought.length = 0;
        a.prof('tool', { id: p.id, npc: teacher.id }); await until(clock, () => bought.length, 2000);
        assert.ok(bought[0].ok && o.char.bag.some(i => i.tool && i.use?.prof === p.id), `${town.name}: ${p.name} tool sold again: ${JSON.stringify(bought[0])}`);
      }
    }
  }
});
