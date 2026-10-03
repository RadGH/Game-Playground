// Farhold — round 21: the game says what things DO.
//
// `WORDING.md` is the standard; this is the enforcement. The play-test that produced both:
//
//   "So many spells and item affixes are also worded poorly, like Wand > Flame > 'Sets what it
//    hits alight' or 'Keeps working after it lands'. Hits WHAT? What keeps WORKING? WHAT? The
//    question is WHAT? … 'Leaves the target taking more of everything' (GOD I HATE THIS ONE!) ->
//    'Targets take 10% more damage for 10 seconds'. We need to give numeric values where
//    appropriate for magnitude and duration. Vague descriptions are TERRIBLE."
//
// The three rules a machine can actually check are: no weasel words, a number where an effect
// claims a magnitude, and no bare "it" as the subject of a description. Everything else in
// WORDING.md is a judgement call and lives in review.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { EFFECTS, describeAffix } from '../js/effects.js';
import { DROPPED_STATS } from '../js/affixes.js';
import { TALENT_LIBRARY, PENDING_MODS } from '../js/skilltalents.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));

/**
 * Words that promise a magnitude and then decline to give one. Each of these was in the game when
 * round 21 started; `more of everything` is the one the play-test shouted about.
 */
const WEASEL = [
  /more of everything/i,
  /\bfor a while\b/i,
  /\bsomewhat\b/i,
  /\bgreatly\b/i,
  /\ba bit\b/i,
  /\bnoticeably\b/i,
  /\ba little\b/i,
  /\bslightly\b/i,
];

function weaselIn(text) {
  return WEASEL.find(re => re.test(text)) || null;
}

test('no affix or legendary description uses a word where a number belongs', () => {
  const bad = [];
  for (const id of Object.keys(EFFECTS)) {
    const text = describeAffix({ stat: id.replace(/^affix:/, ''), value: 7, name: 'X' });
    const hit = weaselIn(String(text || ''));
    if (hit) bad.push(`${id}: "${text}" (${hit})`);
  }
  assert.deepEqual(bad, [], `vague descriptions:\n  ${bad.join('\n  ')}`);
});

test('a skill description carries real numbers, not adjectives', () => {
  const data = read('data/skills.json');
  const bad = [], numberless = [];
  for (const [id, s] of Object.entries(data.skills || {})) {
    const text = String(s.desc || '');
    const hit = weaselIn(text);
    if (hit) bad.push(`${id}: "${text}" (${hit})`);
    // every skill does SOMETHING measurable — damage, a radius, a duration or a cost
    if (!/\d/.test(text)) numberless.push(`${id}: "${text}"`);
  }
  assert.deepEqual(bad, [], `vague skills:\n  ${bad.join('\n  ')}`);
  assert.deepEqual(numberless, [], `skills with no number in them:\n  ${numberless.join('\n  ')}`);
});

test('a skill talent says how much and for how long', () => {
  const bad = [];
  for (const [id, node] of Object.entries(TALENT_LIBRARY)) {
    const text = String(node.desc || '');
    const hit = weaselIn(text);
    if (hit) bad.push(`${id}: "${text}" (${hit})`);
    /**
     * A node whose every mod is on `PENDING_MODS` has no magnitude to quote because nothing reads
     * it yet — `Seeking` is the live example: `homing` is filed as "a projectile cannot steer
     * yet". That is a real defect, but it is an INERT-FEATURE defect and `inertTalents` is the
     * audit that owns it; this test would only paper over it by demanding a number for a rule the
     * game does not run. Tying the allow-list to `PENDING_MODS` rather than to a hand-written list
     * of ids means a node stops being excused here the moment its mod is implemented.
     */
    const pending = Object.keys(node.mod || {}).every(k => k in PENDING_MODS);
    if (!pending && !/\d/.test(text)) bad.push(`${id}: "${text}" (no number)`);
  }
  assert.deepEqual(bad, [], `vague talents:\n  ${bad.join('\n  ')}`);
});

test('the class builder names the level of a spell slot instead of describing the wait', () => {
  const data = read('data/classbuild.json');
  for (const tier of data.tiers || []) {
    const text = String(tier.blurb || '');
    assert.ok(!/chosen when you get there/i.test(text), `a tier still says "chosen when you get there": ${text}`);
    assert.ok(!weaselIn(text), `tier blurb is vague: ${text}`);
  }
  // the six element blurbs are the ones the play-test quoted by name
  for (const el of data.elements || []) {
    const text = String(el.blurb || '');
    assert.ok(!/^sets what it hits/i.test(text), `"${el.name}" still says "sets what it hits …"`);
    assert.ok(!weaselIn(text), `"${el.name}" is vague: ${text}`);
    assert.ok(/\d/.test(text), `"${el.name}" claims an effect with no number in it: ${text}`);
  }
});

test('accuracy is gone from Farhold, including out of the shared item table', () => {
  assert.ok(DROPPED_STATS.has('hit'), 'accuracy is supposed to be dropped at load');
  // nothing describes it any more…
  assert.equal(EFFECTS['affix:hit'], undefined, 'the accuracy affix still has a registry entry');

  // …and `tuneAffixData` strips every carrier out of the shared file rather than editing the file,
  // because data/items.json belongs to Emberveil too and Emberveil still rolls accuracy.
  const items = read('../emberveil/data/items.json');
  const raw = JSON.stringify(items);
  assert.ok(raw.includes('"of_hit"'), 'the shared file should still carry of_hit for Emberveil');
});

test('life steal is named the way the genre names it, and says which hits it works on', () => {
  const text = String(describeAffix({ stat: 'lifeSteal', value: 4.4 }));
  assert.match(text, /life steal/i, `life steal should say "Life Steal", got "${text}"`);
  assert.match(text, /4\.4/, `the rolled number should be printed, got "${text}"`);
  assert.ok(!/comes back as health/i.test(text), `still the old phrasing: "${text}"`);
  assert.match(text, /physical|melee|ranged/i,
    `life steal no longer works on spells, so the line has to say so: "${text}"`);
});

test('nothing tells the player their weapon is their tool — there has been a Tool slot since R16', () => {
  for (const f of ['js/hud.js', 'js/nextstep.js']) {
    const src = readFileSync(join(here, '..', f), 'utf8');
    assert.ok(!/no separate tool slot/i.test(src),
      `${f} still describes the tool system round 16 replaced`);
  }
  const resources = read('data/resources.json');
  for (const [key, tool] of Object.entries(resources.tools || {})) {
    if (key.startsWith('_')) continue;
    const from = String(tool.from || '');
    assert.ok(!/weapon/i.test(from),
      `${key}'s "from" still tells the player to carry a weapon: ${from}`);
  }
});

// ───────────────────────────────────── 2026-10-03: the owner banned the word "muster" outright
//
// Not a list check over one data file: the word was in a tab name, a structure, a faction site, a
// talent, a stronghold epithet, a world boss arena and a worldgen place-name pool, so the scan is
// over every file the game ships. The only lines allowed to say it are the ones that read an OLD
// save (a renamed id has to keep loading), and those all name it inside a rename map or a load.

test('the word "muster" appears nowhere a player could read it', async () => {
  const { readdirSync } = await import('node:fs');
  const root = join(here, '..');
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
  const files = [
    ...walk(join(root, 'data')).filter(f => f.endsWith('.json')),
    ...walk(join(root, 'js')).filter(f => f.endsWith('.js')),
    ...readdirSync(root).filter(f => /\.(html|css)$/.test(f)).map(f => join(root, f)),
    ...walk(join(root, '..', '..', 'worldgen', 'js')).filter(f => f.endsWith('.js')),
  ];
  const saveReader = /RENAMED_|json\.muster|kind === 'muster'|^\s*(\/\/|\*)/;
  const bad = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!/muster/i.test(line)) return;
      if (f.endsWith('.js') && f.includes('/farhold/js/') && saveReader.test(line)) return;
      bad.push(`${f.slice(root.length + 1)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, [], `\n  ${bad.join('\n  ')}`);
});

test('a save from before the "muster" rename still loads its stone, its talent and its drill', async () => {
  const { createBuildPlan } = await import('../js/buildplan.js');
  const { renameTalentPicks } = await import('../js/save.js');
  const catalogue = read('data/structures.json');
  const plan = createBuildPlan({ catalogue, terrain: null });
  plan.load({ entries: [{ id: 'e1', key: 'muster_stone', name: 'Muster Stone', x: 0, z: 0, rot: 0 }] });
  const [stone] = plan.entries;
  assert.equal(plan.byId(stone.key)?.levy, true, `an old stone came back as "${stone.key}", which is no catalogue row`);
  assert.doesNotMatch(stone.name, /muster/i);

  const picks = renameTalentPicks({ daybreak_descent: { 2: 'muster', 1: 'something_else' } });
  assert.equal(picks.daybreak_descent[2], 'close_ranks');
  assert.equal(picks.daybreak_descent[1], 'something_else', 'the rename touched a pick it does not own');
  const skills = read('data/skills.json');
  const row = skills.skills.daybreak_descent?.talents?.[2]?.nodes || [];
  assert.ok(row.some(n => n.id === picks.daybreak_descent[2]), 'the renamed talent id is not on the skill');

  // the civics block was saved under `muster`, with a drill quest of kind 'muster' in it
  const { createCivics } = await import('../js/civics.js');
  const { createColony } = await import('../js/colony.js');
  const { WorkBoard } = await import('../js/work.js');
  const board = new WorkBoard();
  const COLONY = read('data/colony.json');
  const colony = createColony({ data: COLONY, board, seed: 3 });
  const civics = createCivics({ data: COLONY, raids: read('data/raids.json'), colony, board, dayLengthSeconds: 900 });
  civics.loadJSON({ v: 1, muster: { v: 1, cooled: { 'yours|prowlers': 12345 }, quest: { kind: 'muster', id: 'raid_x' } } });
  assert.equal(civics.levy.quest?.id, 'raid_x', 'an old save lost its drill in progress');
  assert.equal(civics.levy.quest.kind, 'levy');
  assert.deepEqual(civics.levy.toJSON().cooled, { 'yours|prowlers': 12345 }, 'an old save lost its cooldowns');
  assert.ok(!('muster' in civics.toJSON()), 'a new save still writes the old key');
});
