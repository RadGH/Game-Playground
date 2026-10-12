import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { icons, classes, iconSvg, iconIds, iconInfo, filterIcons } from '../js/catalog.js';
import { skillIconSvg, skillIconIds } from '../../prototypes/thousandvale/js/client/ui/skill-icons.js';
import { resolveStatic } from '../../prototypes/thousandvale/server/static.js';
const root = new URL('../../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p,root),'utf8'));
const far = json('prototypes/farhold/data/skills.json'), tv = json('prototypes/thousandvale/data/rules/classes-tv.json');
const callings = [...json('prototypes/farhold/data/classes.json').classes, ...tv.classes];
const skills = {...far.skills,...tv.skills};

test('every actual class skill has the right name, class, description, categories and unique artwork', () => {
  assert.equal(classes.length,callings.length);
  assert.deepEqual(iconIds().sort(),callings.flatMap(c=>c.skills).sort());
  const pictures=new Set();
  for (const c of callings) for (const id of c.skills) {
    const i=iconInfo(id), s=skills[id];
    assert.equal(i.name,s.name,id); assert.equal(i.classId,c.id,id); assert.equal(i.className,c.name,id);
    assert.ok(i.description.length>30,id+' needs a visual description');
    for(const tag of ['spell',s.element||'arcane',s.shape||'self']) assert.ok(i.categories.includes(tag),`${id}: ${tag}`);
    assert.ok(!pictures.has(i.body),id+' has reused another spell picture'); pictures.add(i.body);
    assert.doesNotMatch(i.body,/undefined|NaN|<text|<script|<foreignObject|\son\w+=|(?:href|url)\s*[=(]/i,id);
    assert.ok(i.body.includes('#e6c14a') && i.body.includes('#1c1f4a'),id+' uses the reference palette');
    assert.equal(skillIconSvg(id,40),iconSvg(id,40));
  }
  assert.deepEqual(skillIconIds(),iconIds());
});

test('the 30 new classes were drawn in six batches of five, retaining the six Starcaller references', () => {
  for(let batch=1;batch<=6;batch++) {
    const rows=filterIcons({batch}); assert.equal(rows.length,30);
    const ids=[...new Set(rows.map(i=>i.classId))]; assert.equal(ids.length,5);
    for(const id of ids) assert.equal(rows.filter(i=>i.classId===id).length,6);
  }
  const original=filterIcons({batch:0}); assert.equal(original.length,6);
  assert.ok(original.every(i=>i.classId==='starcaller'));
});

test('search matches metadata and combines class, category and batch filters', () => {
  assert.equal(filterIcons().length,186);
  assert.deepEqual(filterIcons({q:'GNawing dark'}).map(i=>i.id),['gnawing_dark']);
  assert.ok(filterIcons({q:'hungry teeth'}).some(i=>i.id==='gnawing_dark'));
  assert.equal(filterIcons({classId:'starcaller',category:'stars'}).length,6);
  assert.deepEqual(filterIcons({classId:'warlock',category:'summon',batch:2,q:'fiend'}).map(i=>i.id),['bind_imp','abyss_gate']);
  assert.equal(filterIcons({classId:'warlock',batch:1}).length,0);
  assert.equal(filterIcons({q:'zzz_missing_spell'}).length,0);
});

test('SVG exports have accessible metadata, safe sizing and an explicit unknown-ID fallback', () => {
  assert.equal(iconSvg('future_unknown'),null); assert.equal(iconSvg('__proto__'),null); assert.equal(iconInfo('constructor'),null);
  assert.match(iconSvg('cleave',40),/width="40" height="40" aria-hidden="true"/);
  const accessible=iconSvg('warcry',128,{accessible:true});
  assert.match(accessible,/<title>War Cry<\/title><desc>/); assert.match(accessible,/role="img" aria-label="War Cry"/);
  assert.match(accessible,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.doesNotMatch(iconSvg('cleave','" onload="bad()'),/onload/);
  assert.match(iconSvg('cleave',Infinity),/width="32"/); assert.match(iconSvg('cleave',-1),/width="1"/);
});

test('Thousandvale can serve the library and its release includes the dependency folder', () => {
  for(const path of ['/icons/index.html','/icons/js/catalog.js','/icons/data/batch-06.js']) assert.ok(resolveStatic('/tmp/playground',path));
  assert.equal(resolveStatic('/tmp/playground','/icons/../private.env'),null);
  const publisher=readFileSync(new URL('prototypes/thousandvale/tools/publish-thousandvale.sh',root),'utf8');
  assert.match(publisher,/ALLOW=\([^)]*\bicons\b/s);
});
