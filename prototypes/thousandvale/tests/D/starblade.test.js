// node --test prototypes/thousandvale/tests/D/starblade.test.js
// Play-test 11 (owner #53): the Star Blade's client side — its creation card and emblem, its outfit (portrait, tier 2 and
// the cut of the plate and mail it actually wears), its skill pictures. Pure: no three, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classCardLines, classEmblemSvg } from '../../js/client/ui/class-card.js';
import { classWearLook } from '../../js/client/star-looks.js';
import { gearLook } from '../../js/client/gear-look.js';
import { iconSvg, iconInfo } from '../../../../icons/js/catalog.js';

const J = p => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const tv = J('data/rules/classes-tv.json');
const blade = tv.classes.find(c => c.id === 'starblade');
const outfits = J('data/class-outfits-tv.json');

test('the creation card says what a Star Blade is, in the class row\'s own words, with its own emblem', () => {
  const L = classCardLines(blade);
  assert.equal(L.name, 'Star Blade');
  assert.deepEqual(L.facts, ['Heavy armour', 'Heavy weapons', 'Mana']);
  assert.match(L.hook, /star shield that strikes back/);
  assert.match(L.signature, /Constellation/);
  const em = classEmblemSvg(blade);
  assert.match(em, /^<svg aria-hidden="true"/); assert.doesNotMatch(em, /#fff\b/, 'tinted, not white');
  assert.notEqual(em, classEmblemSvg({ id: 'knight' }), 'not the knight\'s');
  assert.match(classEmblemSvg({ id: 'starcaller', skills: ['star_dart'] }), /<svg/, 'the Starcaller shows its first skill picture');
});

test('outfit: night-blue plate with star-steel edges and the gold star — tier 1, tier 2 and the worn cut, distinct from the Starcaller', () => {
  const o = outfits.classes.starblade, sc = outfits.classes.starcaller;
  assert.equal(o.top.id, 'plate'); assert.equal(o.top.emblem, 'star'); assert.equal(o.top.emblemColor, '#e6c14a', 'the Starcaller\'s gold star — one family');
  assert.notEqual(o.top.color, sc.top.color); assert.notEqual(o.top.id, sc.top.id); assert.notEqual(o.held.id, sc.held.id);
  assert.equal(outfits.tier2.starblade.set, 'Nightsteel Plate');
  // the starting plate is cut in the class colours in the world; another class's plate is not
  const eq = { chest: { baseKey: 'heavy_chest', tier: 'heavy' }, head: { baseKey: 'heavy_helm', tier: 'heavy' } };
  const mine = gearLook(eq, { classWear: outfits.wear.starblade });
  const theirs = gearLook(eq, {});
  assert.equal(mine.top.color, '#1a2350'); assert.equal(mine.top.emblem, 'star'); assert.equal(mine.hat.id, 'war_helm', 'a War Helm still looks like a war helm (W25)');
  assert.notEqual(theirs.top.color, '#1a2350');
  const mail = gearLook({ chest: { baseKey: 'medium_chest', tier: 'medium' } }, { classWear: outfits.wear.starblade });
  assert.equal(mail.top.id, 'chainmail'); assert.equal(mail.top.emblem, 'star');
  // the Starcaller's cloth cut is untouched by the general rule
  const robe = classWearLook({ top: { id: 'robe' } }, outfits.wear.starcaller, s => (s === 'chest' ? 'cloth' : null));
  assert.equal(robe.top.id, 'trim_robe');
  assert.deepEqual(classWearLook({ top: { id: 'plate' } }, outfits.wear.starcaller, () => 'heavy'), { top: { id: 'plate' } }, 'a Starcaller in plate keeps the plate');
});

test('six skill pictures of its own in the Icon Library (batch 7), in the shared medallion, none reused', () => {
  const bodies = new Set();
  for (const id of blade.skills) {
    const i = iconInfo(id);
    assert.ok(i && i.classId === 'starblade' && i.batch === 7, id);
    assert.ok(i.description.length > 30);
    assert.match(iconSvg(id, 40), /#c9d3e6/, `${id}: star steel`);
    assert.ok(!bodies.has(i.body)); bodies.add(i.body);
  }
});
