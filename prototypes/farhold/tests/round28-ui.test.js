// Farhold round 28 — js/skillcard.js, the words and chips every skill screen shares.
//
//   node --test prototypes/farhold/tests/round28-ui.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describeSkills } from '../js/skills.js';
import { registerSkillRows, treeFor } from '../js/skilltalents.js';
import { mechFacts, formVersions, formTransforms, formLabelOf, talentChanges } from '../js/skillcard.js';
import { skillFacts } from '../js/spellcard.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/skills.json', import.meta.url)));
describeSkills(data);
registerSkillRows(data.skills, data.statuses);
const ctx = { statuses: data.statuses, skills: data.skills };
const BAD = /undefined|NaN|\[object|\{/;

test('a form skill gets a chip naming its group and how it is held', () => {
  assert.deepEqual(mechFacts(data.skills.briarback_shape, ctx).map(f => f.text), ['Shape · toggle']);
  assert.deepEqual(mechFacts(data.skills.sporecap_shape, ctx).map(f => f.text), ['Shape · lasts 15s']);
  const cyc = mechFacts(data.skills.wyrm_temper, ctx)[0].text;
  assert.match(cyc, /^Temper · cycles Fire → Frost → Storm$/);
  // the title screen's chips include them
  assert.ok(skillFacts(data.skills.briarback_shape, data.statuses, { skills: data.skills }).some(f => f.kind === 'form'));
});

test('form labels read as a player says them', () => {
  assert.equal(formLabelOf('briarback', data.skills), 'Briarback shape');
  assert.equal(formLabelOf('open', data.skills), 'Open stance');
  assert.equal(formLabelOf('fire', data.skills), 'Fire Temper');
});

test('Thornlash lists every version, own body first, each with a generated sentence', () => {
  const v = formVersions(data.skills.thornlash, ctx);
  assert.deepEqual(v.map(x => x.name), ['Thornlash', 'Bramble Gore', 'Venom Lunge', 'Spore Lob']);
  for (const x of v) { assert.ok(x.desc.length > 20, x.name); assert.doesNotMatch(x.desc, BAD, x.name); }
  assert.match(v[1].desc, /180% weapon damage/);
});

test('a shape names what each other druid skill becomes in it', () => {
  const g = formTransforms(data.skills.briarback_shape, data.classes.druid, ctx);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].entries.map(e => `${e.baseName}>${e.name}`), ['Thornlash>Bramble Gore', 'Greensap>Thornswell', 'Call the Pack>Den Guard']);
  // a skill not on the bar is not listed
  assert.equal(formTransforms(data.skills.briarback_shape, ['cleave'], ctx)[0].entries.length, 0);
});

test('talentChanges states the numbers a pick moves, and nothing for a pure behaviour', () => {
  const tree = treeFor('cleave', 'around');
  const reaping = tree.tiers[0].nodes.find(n => n.id === 'reaping_arc');
  const c = talentChanges(data.skills.cleave, reaping, { skillId: 'cleave', tier: 1 });
  assert.ok(c.some(x => x.label === 'Shape' && x.to === 'strike in front'));
  assert.ok(c.some(x => x.label === 'Reach' && x.from == null), 'a field the skill never had is new, not "— →"');
  const hooked = tree.tiers[0].nodes.find(n => n.id === 'hooked_edge');
  assert.deepEqual(talentChanges(data.skills.cleave, hooked, { skillId: 'cleave', tier: 1 }), []);
  // a cooldown-only library node on a skill that deals no damage does not invent a damage number
  const quick = treeFor('warcry', 'self').tiers[0].nodes.find(n => n.id === 'quick');
  if (quick) assert.ok(talentChanges(data.skills.warcry, quick, { skillId: 'warcry', tier: 1 }).every(x => x.label !== 'Damage'));
});

test('every converted row: chips, versions and deltas render without a stray token', () => {
  for (const [id, row] of Object.entries(data.skills)) {
    for (const f of mechFacts(row, ctx)) assert.doesNotMatch(f.text, BAD, id);
    for (const v of formVersions(row, ctx)) assert.doesNotMatch(v.desc, BAD, `${id} ${v.formId}`);
    if (!row.talents) continue;
    for (const tier of treeFor(id, row.shape).tiers) {
      for (const n of tier.nodes) {
        for (const d of talentChanges(row, n, { skillId: id, tier: tier.tier })) {
          if (d.from == null) { assert.doesNotMatch(d.to, BAD); continue; }
          assert.doesNotMatch(`${d.from} ${d.to}`, BAD, `${id} ${n.id}`);
        }
      }
    }
  }
});
