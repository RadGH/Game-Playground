// Report #63: "There are two wells on top of each other here" (The Pail and Plough, z12_02).
//
// The inn's recipe draws a well as a PROP and has a `use` object called "Well" 1.5 m from it, and the client gives every
// `use` object a stand-in model chosen from its NAME — so the place had two wells. The rule now: a `use` object whose
// stand-in is something the recipe already draws within USE_OWN_PROP_R is sent `bare` and gets no model of its own.
// This walks every placement of every zone and counts same-kind things drawn within 1.5 m of each other.
//
//   node --test prototypes/thousandvale/tests/E/wrap-overlap.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vignettePoint, vignetteContent, usePropKind, useIsDrawn, USE_OWN_PROP_R } from '../../js/sim/vignettes.js';

const D = new URL('../../data/vignettes/', import.meta.url);
const J = f => JSON.parse(fs.readFileSync(new URL(f, D)));
const recipes = [...J('m1.json').vignettes, ...J('m2.json').vignettes, ...J('m2b.json').vignettes, ...J('setpieces.json').vignettes, ...(J('curios.json').curios || [])];
const byId = new Map(recipes.map(r => [r.id, r]));
const zones = fs.readdirSync(new URL('placements/', D)).filter(f => /^z\d+_\d+\.json$/.test(f));

/** Every same-kind pair within `r` metres. `honour` = apply the bare rule (false = what was drawn before the fix). */
function pairs(r, honour) {
  const out = [];
  for (const f of zones) {
    const pts = [];
    for (const pl of J('placements/' + f).placements || []) {
      const v = byId.get(pl.recipe || pl.id); if (!v) continue;
      for (const q of [...(v.props || []), ...(v.models || [])]) if (q.kind !== 'ground') pts.push({ id: q.id, src: 'prop', pl: pl.id, ...vignettePoint(pl, q.x || 0, q.z || 0) });
      for (const o of v.objects || []) if (o.type === 'use' && !(honour && useIsDrawn(v, o))) pts.push({ id: usePropKind(o.name), src: 'use', name: o.name, pl: pl.id, ...vignettePoint(pl, o.x || 0, o.z || 0) });
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      if (a.id === b.id && Math.hypot(a.x - b.x, a.z - b.z) <= r) out.push({ zone: f, a, b });
    }
  }
  return out;
}

test('the inn has one well: the "Well" you drink from is the prop the recipe draws', () => {
  const inn = byId.get('sp_pail_and_plough');
  const well = inn.objects.find(o => o.name === 'Well');
  assert.equal(usePropKind(well.name), 'well');
  assert.ok(inn.props.some(p => p.id === 'well'), 'the recipe draws a well');
  assert.equal(useIsDrawn(inn, well), true);
  const pl = J('placements/z12_02.json').placements.find(p => p.id === 'sp_pail_and_plough');
  const made = vignetteContent([pl], recipes).objects.filter(o => o.type === 'use');
  assert.equal(made.find(o => o.name === 'Well').bare, true, 'the sim marks it bare');
  assert.equal(made.find(o => o.name === 'Hearth').bare, undefined, 'a use object with nothing drawn for it keeps its stand-in');
});

test('a use object with no prop of its kind nearby still draws its stand-in', () => {
  const v = { props: [{ kind: 'prop', id: 'well', x: 9, z: 0 }, { kind: 'ground', id: 'well', x: 0, z: 0 }], models: [{ id: 'bench', x: 0, z: 1 }] };
  assert.equal(useIsDrawn(v, { name: 'Old well', x: 0, z: 0 }), false, '9 m away is another well; a ground decal is not a model');
  assert.equal(useIsDrawn(v, { name: 'Old well', x: 9, z: USE_OWN_PROP_R }), true);
  assert.equal(useIsDrawn(v, { name: 'Bench', x: 0, z: 1 }), false, 'a bench is drawn as a stone step, which the recipe does not have');
});

test('nowhere in the province is a use object drawn on top of the same thing', () => {
  const before = pairs(1.6, false).filter(p => p.a.src === 'use' || p.b.src === 'use');
  const after = pairs(1.6, true).filter(p => p.a.src === 'use' || p.b.src === 'use');
  assert.ok(before.length > 0, 'the scan can see the fault (it found the inn well before the rule)');
  assert.ok(before.some(p => p.a.pl === 'sp_pail_and_plough' && p.a.id === 'well'));
  assert.deepEqual(after.map(p => `${p.zone} ${p.a.pl} ${p.a.id}`), []);
});

test('no two props of one kind stand on the same spot (closer than 0.5 m)', () => {
  // props a metre apart are stairs, stacked barrels and rows of hives; closer than half a metre is one thing drawn twice
  const same = pairs(0.5, true);
  assert.deepEqual(same.map(p => `${p.zone} ${p.a.pl} ${p.a.id} ${p.b.pl}`), []);
});
