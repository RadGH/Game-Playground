import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson, mats } from './helpers.js';
import { createGrid } from '../../js/world/grid.js';
import { spawnVoidZone, stepVoidZones } from '../../js/rpg/voidzones.js';
import { dealDamage } from '../../js/rpg/damage.js';
import { hitbox } from '../../js/rpg/melee.js';
import { createRng } from '../../js/core/rng.js';

const idx = f => { const j = loadJson(`data/${f}.json`); if (j.list) j.byId = Object.fromEntries(j.list.map(e => [e.id, e])); return j; };
function game() {
  const g = createGrid(200, 100, mats());
  const player = { kind: 'player', id: 'player', name: 'P', x: 100, y: 60, w: 6, h: 12, hp: 100, maxHp: 100, vx: 0, vy: 0, statuses: {} };
  return { grid: g, player, entities: [], tick: 0, data: { enemies: idx('enemies'), movesets: idx('movesets'), mats: mats() }, rng: { spell: createRng(1) }, meter: { recs: [], record(r) { this.recs.push(r); } } };
}
test('void zone: no damage during warm-up, none on the entry tick, then 4 ticks a second', () => {
  const G = game();
  const z = spawnVoidZone(G, 'test', 100, 54, { shape: 'circle', r: 12, warmup: 500, duration: 3000, dps: 8, rim: '#ff8a2a' });
  for (let k = 0; k < 29; k++) stepVoidZones(G);          // 0.48 s: still warming up
  assert.equal(G.player.hp, 100);
  for (let k = 0; k < 16; k++) stepVoidZones(G);          // first damage tick happens only after the player was inside a whole tick window
  const after = G.player.hp;
  for (let k = 0; k < 60; k++) stepVoidZones(G);
  assert.ok(Math.abs((after - G.player.hp) - 8) < 2.1, `one second inside should cost ~8, cost ${after - G.player.hp}`);
});
test('resist percent, armour and a heal-resist flame', () => {
  const G = game(); const t = { id: 'e', name: 'E', kind: 'enemy', hp: 100, maxHp: 100, resist: { ember: 50, tide: 'heal' }, armour: 100, statuses: {}, vx: 0, vy: 0 };
  const src = { id: 'p', name: 'P' };
  assert.equal(Math.round(dealDamage(G, { source: src, target: t, amount: 40, flame: 'ember' })), 10); // 40 * 0.5 * 100/200
  assert.equal(Math.round(dealDamage(G, { source: src, target: t, amount: 40, flame: 'shade' })), 40); // shade ignores armour
  t.hp = 50; dealDamage(G, { source: src, target: t, amount: 20, flame: 'tide' }); assert.equal(t.hp, 70);
  assert.ok(G.meter.recs.length >= 2 && G.meter.recs[0].kind === 'damage');
});
test('player takes a hit, then is invulnerable for 0.6 s', () => {
  const G = game(); const p = G.player, src = { id: 'm', name: 'M' };
  dealDamage(G, { source: src, target: p, amount: 10 }); assert.equal(p.hp, 90); assert.ok(p.invuln >= 0.59);
  dealDamage(G, { source: src, target: p, amount: 10 }); assert.equal(p.hp, 90);
});
test('melee hitbox sits in front of the body at chest height', () => {
  const p = { x: 100, y: 60, facing: 1 }, box = hitbox(p, { hitbox: [18, 6] });
  assert.deepEqual([box.x, box.w, box.h], [103, 18, 6]); assert.ok(box.y < 60 && box.y > 45);
  const l = hitbox({ ...p, facing: -1 }, { hitbox: [18, 6] }); assert.equal(l.x + l.w, 97);
});
