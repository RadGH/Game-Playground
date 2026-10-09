// Play-test 4 S8 (stream A): Torborhold's waystone is always known; entering a town learns its stone; walking within
// 15 m of any waystone learns it with no E press.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

test('S8: home stone at creation, a town stone on entering the town, any stone by walking within 30 m', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Wayfarer', 'ranger');
  const o = rec(world, a);
  const pv = world.P.values().next().value, L = pv.L;
  const home = L.waystones.find(w => w.town === 0);
  assert.equal(L.towns[0].name, 'Torborhold');
  assert.ok(o.char.waystones.includes(home.key), 'Torborhold known from the start');
  const said = []; a.on('waystone', m => said.push(m));
  // walk into Ashcombe's town room: its stone is learned without touching it
  const ti = L.towns.findIndex(t => t.name === 'Ashcombe');
  const town = pv.towns[ti], tw = L.waystones.find(w => w.town === ti);
  assert.ok(!o.char.waystones.includes(tw.key));
  world.transfer(o, town, { x: L.towns[ti].x + 25, z: L.towns[ti].z }, 'test'); await run(clock, 1500);
  assert.ok(o.char.waystones.includes(tw.key), 'town stone learned on entering');
  assert.ok(said.some(m => m.op === 'learned' && m.key === tw.key && m.how === 'town'));
  // a wild stone (a dungeon door's): 45 m away = not yet, 25 m = learned (round 10, Y24: the reach went from 15 m to 30 m — roads pass most stones at 15-25 m)
  const wild = L.waystones.find(w => w.town === undefined && !o.char.waystones.includes(w.key));
  assert.ok(wild, 'a wild waystone');
  const copy = pv.copies[0];
  world.transfer(o, copy, { x: wild.x + 45, z: wild.z }, 'test'); await run(clock, 1500);
  assert.ok(!o.char.waystones.includes(wild.key), 'not from 45 m');
  o.entity.x = wild.x + 25; await run(clock, 1500);
  assert.ok(o.char.waystones.includes(wild.key), 'learned from 25 m, no E');
  assert.ok(said.some(m => m.key === wild.key && m.how === 'near'));
  a.close(); await srv.stop();
});
