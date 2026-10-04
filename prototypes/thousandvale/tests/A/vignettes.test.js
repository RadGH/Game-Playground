// E's vignettes as room content: marker, note, NPC, chest (hidden, `after`), `use` (cost/gives/buff), camp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVirtualClock } from '../../js/net/clock.js';
import { loadZoneTerrain } from '../../js/sim/terrain.js';
import { loadZoneContent } from '../../js/sim/content.js';
import { vignettePoint } from '../../js/sim/vignettes.js';
import { makeServer, joinAs, run, ent } from './helpers.js';

const root = new URL('../../', import.meta.url);

test('vignettePoint: yaw 0 keeps local axes; yaw π/2 turns local +z to world +x', () => {
  assert.deepEqual(vignettePoint({ x: 10, z: 20, yaw: 0 }, 1, 2), { x: 11, z: 22 });
  const p = vignettePoint({ x: 0, z: 0, yaw: Math.PI / 2 }, 0, 3);
  assert.ok(Math.abs(p.x - 3) < 1e-9 && Math.abs(p.z) < 1e-9);
});

test('zone test: every placed vignette is in the wilds with its objects, NPCs and camps; using them works per character', async () => {
  const terrain = loadZoneTerrain(readFileSync(new URL('data/zones/test/terrain.bin', root)), 'test');
  const content = await loadZoneContent(async f => JSON.parse(readFileSync(new URL(f, root), 'utf8')), 'test');
  assert.ok(content.vignettes && content.vignettes.placements.length >= 8);
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { terrain, zoneSheet: content.sheet, encounterInfo: content.encounterInfo, vignettes: content.vignettes } });
  await srv.ready;
  const W = srv.world, r = W.copies[0];
  const objs = [...r.objects.values()];
  const markers = objs.filter(o => o.type === 'vignette');
  assert.equal(markers.length, content.vignettes.placements.length);
  assert.ok(markers.every(m => m.data.lore && m.data.r > 0));
  assert.ok(objs.some(o => o.type === 'note') && objs.some(o => o.kind === 'npc') && objs.some(o => o.type === 'use'));
  assert.ok([...r.camps].some(c => c.vignette === 'hanging_oak' && c.type === 'gallows_owl'));
  const a = await joinAs(srv, clock, 'Wanderer');
  const used = []; a.on('used', u => used.push(u));
  const go = async obj => { W.transfer(W.online.get(a.joined.you.char), r, { x: obj.x + 1, z: obj.z }, 't'); await run(clock, 200); a.use(obj.id); await run(clock, 200); return used.at(-1); };
  // note
  const note = objs.find(o => o.type === 'note');
  const n = await go(note);
  assert.ok(n.ok && n.kind === 'note' && n.text.length > 10);
  // use with gives: gold once, then "nothing more"
  const truffle = objs.find(o => o.type === 'use' && o.data.use.gives && o.data.use.gives.gold);
  const g0 = a.joined.you.gold;
  const u1 = await go(truffle);
  assert.ok(u1.ok); assert.ok(a.joined.you.gold > g0);
  const u2 = await go(truffle);
  assert.equal(u2.why, 'opened');
  // use with a cost and no gold: refused
  const bowl = objs.find(o => o.type === 'use' && o.data.use.cost && o.data.use.cost.gold);
  if (bowl) {
    W.online.get(a.joined.you.char).char.gold = 0;
    const b = await go(bowl);
    assert.equal(b.why, 'gold');
  }
  // chest that opens only after its `after` object
  const after = objs.find(o => o.type === 'chest' && o.data.chest.after);
  if (after) {
    const c1 = await go(after);
    assert.equal(c1.why, 'locked');
    const trap = objs.find(o => o.data.key === after.data.chest.after);
    assert.ok(trap, 'the after object exists');
  }
  // hidden chest carries its hint in info
  const hidden = objs.find(o => o.type === 'chest' && o.data.hidden);
  if (hidden) { await go(hidden); assert.equal(a.mirror.infos.get(hidden.id).hidden, 1); assert.ok(a.mirror.infos.get(hidden.id).hint); }
  // npc
  const npc = objs.find(o => o.kind === 'npc');
  if (npc) { const t = await go(npc); assert.equal(t.kind, 'npc'); assert.ok(Array.isArray(t.says)); }
  a.close(); await srv.stop();
});
