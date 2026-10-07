// Play-test 6 (owner feedback 2026-10-07) — D-world, the client's own logic (no browser):
//   U3   a cancelled telegraph is removed AT ONCE (no fade), and every telegraph of a body goes when that body dies / is interrupted
//   U16  what a druid's shape is drawn as (C's shape object -> a creature spec), and main.js wires info.form + fx form
//   U4   a grain field is a standing crop: no long flat-lidded boxes (the "coffins")
//   U19  the horse's nostrils are small matte slits low on the muzzle, never glossy balls the size of its eyes
// Run: node --test prototypes/thousandvale/tests/D/playtest6.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { createTelegraphs } = await import('../../js/client/telegraphs.js');
const { shapeSpec } = await import('../../js/client/actors.js');
const { cropField, CROPS } = await import('../../../../proctown/js/propkit.js');
const src = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('U3: a cancelled telegraph goes at once, and a dead or interrupted caster takes its telegraphs with it', () => {
  const scene = new THREE.Scene();
  let now = 0;
  const tele = createTelegraphs(scene, { heightAt: () => 0, serverNow: () => now, posOf: () => null, selfPos: () => ({ x: 0, z: 0 }), selfId: () => 1 });
  const count = () => { let n = 0; scene.traverse(o => { if (o.isMesh) n++; }); return n; };
  tele.add({ id: 1, s: 50, k: 'harm', ms: 3000, shape: 'circle', x: 0, z: 0, r: 4 }, 0);
  tele.add({ id: 2, s: 50, k: 'harm', ms: 3000, shape: 'cone', x: 0, z: 0, r: 8, arc: 1 }, 0);
  tele.add({ id: 3, s: 51, k: 'harm', ms: 3000, shape: 'line', x: 3, z: 0, len: 10, w: 2 }, 0);
  tele.update(0.016);
  assert.equal(count(), 3); assert.equal(tele.standingInDanger, true);
  tele.resolve({ id: 1, x: 1, why: 'interrupted' });
  assert.equal(count(), 2, 'a cancelled shape is off the ground in the same call — no fade');
  assert.equal(tele.dropSource(50), 1); assert.equal(count(), 1, "the dead caster's other shape is gone too");
  tele.update(0.016); assert.equal(tele.standingInDanger, false, 'and it no longer counts as danger underfoot');
  assert.equal(tele.dropSource(50), 0); assert.equal(tele.dropSource(null), 0);
  // a shape that LANDED keeps its flash (it was not cancelled)
  tele.resolve({ id: 3, hits: [] }); assert.equal(count(), 1); assert.equal(tele.dropSource(51), 0, 'a landed shape is not ripped away by the death that follows');
  // main.js: death and an interrupted cast both drop the caster's drawings; spells.js ends tracked zones
  const main = src('../../js/client/main.js'), spells = src('../../js/client/spells.js');
  assert.match(main, /tele\.dropSource\(ev\.d\); spells\.ownerGone\(ev\.d\)/);
  assert.match(main, /ev\.type === 'castX' && ev\.id != null\) tele\.dropSource\(ev\.id\)/);
  assert.match(spells, /case 'unplace': lingering\.delete\(ev\.obj\); endZone\(ev\.obj\)/);
  assert.match(spells, /if \(ev\.end\) \{ endZone\(ev\.id\)/);
});

test('U16/U18: a shape is a creature body', () => {
  assert.equal(shapeSpec(null), null); assert.equal(shapeSpec('wolf'), null);
  const boar = shapeSpec({ id: 'briarback', creature: 'boar', scale: 1.3, colors: { body: '#4a5a2a' } });
  assert.equal(boar.type, 'boar'); assert.equal(boar.size, 1.3); assert.equal(boar.upright, false); assert.equal(boar.id, 'briarback');
  const wolf = shapeSpec({ id: 'moonpelt', creature: 'wolf', scale: 1.25, upright: true });
  assert.equal(wolf.type, 'wolf'); assert.equal(wolf.upright, true);
  assert.notEqual(boar.key, wolf.key); assert.equal(shapeSpec({ id: 'moonpelt', creature: 'wolf', scale: 1.25, upright: true }).key, wolf.key, 'the same shape is the same body (cache key)');
  assert.equal(shapeSpec({ creature: 'no_such_beast' }).type, 'wolf', 'an unknown creature still gets a body');
  assert.ok(shapeSpec({ creature: 'boar', scale: 99 }).size <= 2.5);
  const main = src('../../js/client/main.js');
  assert.match(main, /'form' in info\) actors\.setShape\(id, shapeOfForm\(info\.form\)\)/, 'info.form (late joiners)');
  assert.match(main, /ev\.kind === 'form'[^\n]*actors\.setShape\(ev\.id, ev\.on === false \? null : shapeOfForm\(ev\)\)/, 'fx form (the moment it happens)');
  assert.match(main, /extraTypes: \[[^\]]*'boar'[^\]]*\]/, 'the shapes\' bodies are warmed at boot');
});

test('U4: a grain field is a standing crop — no long flat-lidded boxes', () => {
  for (const crop of Object.keys(CROPS).filter(c => CROPS[c].kind === 'grain')) {
    const parts = cropField({ w: 46, d: 26, crop, seed: 7 });
    assert.ok(parts.length > 40 && parts.length <= 700, `${crop}: ${parts.length} parts`);
    const sheaves = parts.filter(p => p.mesh === 'sheaf');
    assert.ok(sheaves.length > 100, `${crop}: ${sheaves.length} sheaf patches stand in the field`);
    // the coffin: a BOX longer than 1.2 m, narrower than a metre, with its flat top above knee height
    const coffins = parts.filter(p => p.mesh === 'box' && p.d > 1.2 && p.w < 1 && p.y + p.h > 0.3);
    assert.equal(coffins.length, 0, `${crop}: ${coffins.length} long flat-topped boxes above the ground`);
    const heights = new Set(sheaves.map(p => p.h.toFixed(1))), tints = new Set(sheaves.map(p => p.colour));
    assert.ok(heights.size >= 4 && tints.size >= 12, `${crop}: the stand is uneven (${heights.size} heights, ${tints.size} tints)`);
    assert.ok(sheaves.every(p => p.w >= CROPS[crop].row), `${crop}: patches are as wide as a row, so the rows meet`);
  }
});

test('U19: the horse has nostrils, not a second pair of eyes', () => {
  const eq = src('../../../../avatar-3d/js/equine.js');
  const nos = eq.slice(eq.indexOf('const Rm = at('), eq.indexOf('// ears: up in the world'));
  assert.ok(nos.length > 50, 'the nostril block is where the test expects it');
  assert.doesNotMatch(nos, /rough: 0\.[0-6]\b/, 'a nostril is matte (a glossy dark ball reads as an eye)');
  const r = Number((nos.match(/SphereGeometry\((0\.\d+) \* hk/) || [])[1]);
  assert.ok(r > 0 && r <= 0.012, `a nostril is small (radius ${r} x head scale; the eye is 0.024)`);
  assert.match(nos, /Rm\.(top|bot) \* -|-\s*Rm\.bot|-Rm\.top/, 'it sits below the midline of the muzzle, on the nose end');
});
