// Class signature spell effects (2026-10-14, owner: "design new enhanced spell effect graphics for all spells. Give at
// least one distinct effect to each character, if not every spell. Add an option to disable graphics").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sigLook, SIG_CLASSES, CLASS_STYLE } from '../../js/client/sig-looks.js';
import { FX_LEVELS, drawFor, involves } from '../../js/client/fx-level.js';
import { cleanSettings, SETTINGS_DEFAULTS } from '../../js/client/ui/pt2-core.js';

const skills = JSON.parse(readFileSync(new URL('../../../farhold/data/skills.json', import.meta.url), 'utf8'));

test('every one of the 180 class skills has a signature, and the Starcaller keeps its own stars', () => {
  const classes = Object.keys(skills.classes);
  assert.deepEqual([...SIG_CLASSES].sort(), [...classes].sort(), 'a style for each of the 30 classes');
  let n = 0;
  for (const c of classes) for (const id of skills.classes[c]) {
    const L = sigLook(c, id, skills.skills[id]);
    assert.ok(L, `${c}/${id}`);
    assert.ok(L.motif.head && L.motif.shard && L.motif.glyph);
    assert.ok(L.travel || L.ground || L.impact || L.cast, `${c}/${id} draws something`);
    n++;
  }
  assert.equal(n, 180);
  assert.equal(sigLook('starcaller', 'star_dart', {}), null);
  assert.equal(sigLook('wolf', 'bite', {}), null);
});

test('no two classes look alike: shapes, colours and the way they move all differ', () => {
  const classes = Object.keys(skills.classes);
  const seen = new Map();
  for (const c of classes) {
    const L = sigLook(c, skills.classes[c][0], skills.skills[skills.classes[c][0]]);
    const motion = JSON.stringify(CLASS_STYLE[c]);
    const key = `${L.motif.glyph}|${L.palette.glow}|${motion}`;
    assert.ok(!seen.has(key), `${c} looks like ${seen.get(key)}`);
    seen.set(key, c);
  }
  const motions = new Set(classes.map(c => JSON.stringify(CLASS_STYLE[c])));
  assert.equal(motions.size, 30, 'thirty different ways of moving');
});

test('within a class every skill differs from its siblings (owner: "if not every spell")', () => {
  for (const [c, ids] of Object.entries(skills.classes)) {
    const sigs = ids.map(id => { const L = sigLook(c, id, skills.skills[id]); return JSON.stringify([L.shape, L.motif.head, L.size, L.dir, L.cast?.n, L.ground?.r, L.ground?.spin, L.impact?.n]); });
    assert.equal(new Set(sigs).size, ids.length, `${c}: ${ids.join(', ')}`);
  }
});

test('same input, same answer', () => {
  assert.deepEqual(sigLook('bard', 'discord_note', skills.skills.discord_note), sigLook('bard', 'discord_note', skills.skills.discord_note));
});

test('Spell effects setting: four levels, saved and cleaned; Reduced keeps yours and your target', () => {
  assert.deepEqual(FX_LEVELS.map(l => l.id), ['enhanced', 'standard', 'reduced', 'off']);
  assert.equal(SETTINGS_DEFAULTS.fx, 'enhanced');
  assert.equal(cleanSettings({ fx: 'off' }).fx, 'off');
  assert.equal(cleanSettings({ fx: 'ultra' }).fx, 'enhanced');
  const f = { self: 7, target: 42 };
  const mine = { type: 'cast', s: 7 }, atMe = { type: 'hit', s: 9, d: 7 }, atTarget = { type: 'fx', kind: 'bolt', id: 3, to: 42 }, other = { type: 'cast', s: 99 };
  assert.ok(involves(mine, f) && involves(atMe, f) && involves(atTarget, f) && !involves(other, f));
  // the element effects
  assert.equal(drawFor('enhanced', other, f), 'full');
  assert.equal(drawFor('standard', other, f), 'full');
  assert.equal(drawFor('reduced', other, f), 'flight');
  assert.equal(drawFor('reduced', mine, f), 'full');
  assert.equal(drawFor('off', mine, f), 'flight');
  // the class signatures
  assert.equal(drawFor('enhanced', other, f, { signature: true }), 'full');
  assert.equal(drawFor('standard', mine, f, { signature: true }), 'none');
  assert.equal(drawFor('reduced', mine, f, { signature: true }), 'thin');
  assert.equal(drawFor('reduced', other, f, { signature: true }), 'none');
  assert.equal(drawFor('off', mine, f, { signature: true }), 'none');
});
