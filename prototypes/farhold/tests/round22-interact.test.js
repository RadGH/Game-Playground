// node --test prototypes/farhold/tests/round22-interact.test.js
//
// Round 22 — what E offers you, and where an arrow points.
//
// Three reports, one shape: the game promising something the world could not deliver.
//
//   "pressing E on a tree, even with tool equipped, says 'Nothing here to do'"
//   "'E to talk to mercenary captain' … the popup didn't go away until I walked almost 20 feet away.
//    I was NOT standing next to an NPC."
//   "There was a yellow quest indicator in the center of town, pointing at nothing … Quest arrows
//    should always point at something, otherwise the arrow has failed."
//
// js/main.js imports Three.js and cannot be opened by a node test, so the interact rules are checked
// by reading it. That is worth saying plainly: it is a weaker test than driving the function, and it
// is here because the alternative was no test at all on the three joins this round made.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, '..', f), 'utf8');
const main = read('js/main.js');
const onboarding = JSON.parse(read('data/onboarding.json'));
const props = read('js/props.js');

// ---------------------------------------------------------------- E on a tree

test('E offers the tree in front of you, and offers it last', () => {
  // the join itself: `beginGather` has handled props since round 13 and `interactTarget` never
  // asked it anything
  assert.match(main, /const prop = props\.nearest\?\.\(control\.x, control\.z, toolReach\(player, 4\)\);/);
  assert.match(main, /if \(about\) return \{ kind: 'prop', prop, about \};/);
  assert.match(main, /else if \(it\.kind === 'prop'\) \{/);

  /**
   * …and it comes after the seam, so a tree standing on top of an iron outcrop does not eat the
   * outcrop. Standing next to a tree is the default state of a forest; everything else you could be
   * interacting with is more deliberate than that.
   */
  const seamAt = main.indexOf("return { kind: 'seam', seam };");
  const propAt = main.indexOf("return { kind: 'prop', prop, about };");
  assert.ok(seamAt > 0 && propAt > seamAt, 'the prop branch must come after the seam branch');
});

test('the prompt names what the tree gives and what you are holding', () => {
  assert.match(main, /function propPrompt\(about\) \{/);
  // a giant that refuses says why rather than offering a swing it will not accept
  assert.match(main, /if \(about\.harvestable === false\) return/);
  // and `props.describe` is the thing that carries both halves
  assert.match(props, /harvestable: true,/);
  assert.match(props, /why, tier: 99, drops: \{\} \}/);
});

test('the tutorial step describes the system the game actually has', () => {
  const timber = onboarding.steps.find(s => s.id === 'timber');
  assert.ok(timber, 'the timber step is gone');
  // R16 replaced "your weapon is your tool" with a real Tool slot and this text was never updated
  assert.equal(/any weapon in your hand/.test(timber.text), false,
    'the tutorial still describes the pre-round-16 weapon-as-tool system');
  assert.match(timber.text, /Tool slot/);
  // …and it says out loud that it wants BOTH, which is why chopping wood alone never advanced it
  assert.match(timber.text, /8 logs AND 20 stone/);
  assert.deepEqual(timber.check.need, { log: 8, stone: 20 },
    'the text and the check disagree about what this step wants');
});

// ---------------------------------------------------------------- the person on the road

test('a wanderer is offered at talking distance, not from twenty-two metres', () => {
  assert.match(main, /const WANDERER_TALK = 3\.6;/);
  assert.match(main, /roadFolk\.near\(control\.x, control\.z, WANDERER_TALK\)\[0\]/);
  assert.equal(/roadFolk\.near\(control\.x, control\.z, 22\)/.test(main), false,
    'the twenty-two metre prompt is back');
});

test('and there is a body standing there to talk to', () => {
  // js/wanderers.js is pure JavaScript on purpose — it has never had a mesh — so the prompt was
  // offering a conversation with an empty field. `folk.spawnOne` is the third caller of a function
  // written for the freed prisoners in round 12.
  assert.match(main, /function keepWandererBodies\(dt\) \{/);
  assert.match(main, /folk\.spawnOne\(\{\s*\n\s*groupId, role: w\.role/);
  assert.match(main, /keepWandererBodies\(dt\);/);
  // …and they are taken away again, with hysteresis so none of them flickers at the boundary
  assert.match(main, /const WANDERER_BODY = 90;/);
  assert.match(main, /const WANDERER_DROP = 130;/);
  assert.match(main, /function clearWandererBodies\(\) \{/);
  const body = Number(/const WANDERER_BODY = ([\d.]+);/.exec(main)[1]);
  const drop = Number(/const WANDERER_DROP = ([\d.]+);/.exec(main)[1]);
  assert.ok(drop > body, 'a body put down at the same range it is taken away at flickers every frame');
});

// ---------------------------------------------------------------- the arrow

test('nothing draws an arrow at a marker it cannot place', () => {
  const hud = read('js/hud.js');
  const map = read('js/map.js');
  // `bearing` answers null now, and every consumer has to cope rather than dereference it
  assert.match(main, /if \(!b \|\| !Number\.isFinite\(b\.x\) \|\| b\.distance > BEACON_RANGE\) continue;/);
  assert.match(map, /if \(!b\) continue;\s+\/\/ R22/);
  assert.match(hud, /return b \? \{ \.\.\.m, x: b\.x, z: b\.z, distance: b\.distance \} : null;/);
  assert.match(main, /const trackedAt = tracked \? markers\.bearing\(tracked, control, terrain\) : null;/);
});

test('a quest with coordinates and no cell is pinned, not dropped', () => {
  // js/quests.js used to write `cell: { x: cell?.x ?? 0, y: cell?.y ?? 0 }` — a missing cell became
  // a valid-looking marker at map cell (0, 0), which is the arrow pointing at nothing. The note
  // explaining that quotes the old line, so the comments come out before the code is searched.
  const quests = read('js/quests.js').split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  assert.equal(/cell: \{ x: cell\?\.x \?\? 0, y: cell\?\.y \?\? 0 \}/.test(quests), false);
  assert.match(quests, /\.\.\.\(cell \? \{ cell: \{ x: cell\.x, y: cell\.y \} \} : \{\}\)/);
  const markers = read('js/markers.js');
  assert.match(markers, /static cellOf\(x, z\) \{/);
  assert.match(markers, /MarkerBook\.cellOf\(q\.place\.x, q\.place\.z\)/);
});
