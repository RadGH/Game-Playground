// Play-test 1, P19 (stream A over stream E's data): "massive empty areas… a living world: people walking routes and
// talking about the day and recent events". Travellers walk E's town-to-town routes in every wilds copy; their crew
// exists as talkable NPC entities only near players; they bark lines from data/names/chatter.json with every token
// filled, including what happened in the zone lately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { polyline, MATERIAL_R } from '../../js/sim/travellers.js';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

test('P19: polyline walks a route by distance', () => {
  const L = polyline([[0, 0], [10, 0], [10, 10]]);
  assert.equal(L.length, 20);
  assert.deepEqual([L.at(5).x, L.at(5).z], [5, 0]);
  assert.deepEqual([L.at(15).x, L.at(15).z], [10, 5]);
  assert.ok(Math.abs(L.at(15).yaw - 0) < 1e-9, 'facing +z on the second leg');
});

test('P19: travellers walk the roads near a player, talk, and know what happened here', async () => {
  const { srv, clock, world } = await realServer();
  const r = world.copies[0];
  await run(clock, 300);                                       // the copy's first NPC tick puts the roads up
  assert.ok(r.travellers, 'the copy runs the living roads');
  const st0 = r.travellers.stats();
  assert.ok(st0.groups >= 20, 'groups on the roads: ' + st0.groups);   // 85 routes; fewer at night
  assert.equal(st0.entities, 0, 'nobody near: no traveller entities in the room');
  // stand by the middle of a long route, with a group coming
  const g = r.travellers.groups.find(x => x.route.line.length > 1500);
  const a = await joinReal(srv, clock, 'Wayfarer');
  // a rare died here a moment ago (the deeds feed the chatter)
  const o = rec(world, a);
  const says = [];
  a.on('ev', m => { for (const e of m.e) if (e.type === 'say' && e.style === 'bark') says.push(e); });
  const p0 = g.route.line.at(g.s);
  world.transfer(o, r, { x: p0.x + 3, z: p0.z + 3 }, 'test');
  await run(clock, 1500);
  const crew = [...r.entities.values()].filter(e => e.kind === 'npc' && e.data && e.data.traveller);
  assert.ok(crew.length >= 1, 'the crew is drawn near the player');
  assert.ok(crew.every(e => e.team === 1 && e.data.npc && e.data.traveller.kind), 'talkable, friendly, with their kind');
  assert.ok(crew.every(e => !e.r.unit), 'not in the combat core: monsters never fight them, nobody dies on the road');
  // walk with them for a while: they move along the road and bark
  const lead = g.crew[0].e;
  const x0 = lead.x, z0 = lead.z;
  let s = 1;
  for (let i = 0; i < 1500 && (says.length < 1 || i < 400); i++) {   // 20-75 s
    const me = rec(world, a).entity, tx = lead.removed ? me.x : lead.x + 1.5, tz = lead.removed ? me.z : lead.z + 1.5;
    const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
    a.input({ s: ++s, dt: 50, mx: d > 0.5 ? dx / d * Math.min(1, d / 3) : 0, mz: d > 0.5 ? dz / d * Math.min(1, d / 3) : 0, yaw: 0, b: 0 });
    await run(clock, 50, 50);
  }
  assert.ok(Math.hypot(lead.x - x0, lead.z - z0) > 3 || g.pauseUntil > 0, 'the group moved along the road');
  assert.ok(says.length >= 1, 'a traveller spoke to the player');
  assert.ok(says.every(e => !/\{\w+\}/.test(e.text)), 'every token filled: ' + says.map(e => e.text).join(' | '));
  console.log('# barks: ' + says.map(e => e.text).join(' | '));
  // what happened here lately is what they talk about: a rare killed by this player in this zone
  const me = rec(world, a).entity;
  const rare = r.spawn({ kind: 'monster', type: 'crag_hyena', name: 'Old Gnasher', rank: 'rare', level: 5, x: me.x + 3, z: me.z });
  rare.kill(me);
  await run(clock, 100);
  const ctx = world.chatterContext(r, me.x, me.z);
  assert.ok(ctx.recent.includes('recent.rare_killed') && ctx.rare === 'Old Gnasher' && ctx.player === 'Wayfarer', JSON.stringify(ctx));
  assert.ok(ctx.zone && ctx.town, 'zone + nearest town for {zone} / {town}');
  // walk away: the crew is put away again
  world.transfer(rec(world, a), r, { x: p0.x + MATERIAL_R * 3, z: p0.z }, 'test');
  await run(clock, 40000);
  assert.ok(!g.live || g.crew.every(c => !c.e), 'parked when nobody is near');
  assert.equal(r.stats.rulesErrors, 0);
  a.close(); await srv.stop();
});
