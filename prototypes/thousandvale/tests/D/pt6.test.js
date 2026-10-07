// Stream D-UI — play-test 6 logic (no browser): tests/D/pt6.spec.js drives the windows.
//   U1 badges count only what is unseen · U9 a missing line is never printed · U12 the lift's floors · U14 line of sight and
//   what goes on the minimap · U17 a potion's line in your numbers · source checks for U6 / U7 (one source, no second arithmetic)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createUnseen, badgeText } from '../../js/client/ui/unseen.js';
import { tileLos, sightMarkers, liftChoices, potionLine } from '../../js/client/ui/pt6-core.js';
import { eventResult } from '../../js/client/ui/pt5-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = p => readFileSync(join(ROOT, p), 'utf8');

test('U1: a badge counts only unseen things, once each, and clears when you look', () => {
  const U = createUnseen(); let fired = 0; U.onChange(() => fired++);
  U.add('friends', 'on:7'); U.add('friends', 'on:7'); U.add('friends', 'new:9'); U.set('mail', 1);
  assert.equal(U.count('friends'), 2); assert.equal(U.count('mail'), 1); assert.equal(U.total(['friends', 'mail', 'guild']), 3);
  assert.equal(fired, 3, 'the same friend coming online twice is one piece of news');
  U.seen('friends'); assert.equal(U.count('friends'), 0); assert.equal(U.total(['friends', 'mail']), 1);
  U.set('mail', 0); assert.equal(U.total(['friends', 'mail']), 0);
  U.set('mail', -3); assert.equal(U.count('mail'), 0);
  U.add('bag', 'u1'); U.drop('bag', 'u1'); assert.equal(U.count('bag'), 0);
  assert.equal(badgeText(0), ''); assert.equal(badgeText(2), '2'); assert.equal(badgeText(150), '99+');
  // nothing on the menu bar prints a headcount as a badge any more
  assert.ok(!/members\.length > 1 \? String/.test(src('js/client/social.js')), 'the party size is not a badge');
  assert.ok(!/menu-friends'\)\?\.querySelector\('b'\)\?\.replaceChildren\(online/.test(src('js/client/friends.js')), 'friends online is not a badge');
  assert.ok(!/menu-guild'\)\?\.querySelector\('b'\)\?\.replaceChildren\(guild && online/.test(src('js/client/guild.js')), 'guild online is not a badge');
  assert.ok(!/el\.badge\.textContent = S\.bag\.length/.test(src('js/client/bag.js')), 'the bag badge is not "how much you carry"');
});

test('U9: a missing line is never printed — no "null" on a result card', () => {
  for (const m of [{ result: 'success', name: 'Home to Torborhold', got: null, story: null }, { kind: 'end', won: true, ev: { name: 'Home to Torborhold', info: { onSuccess: null } }, result: { text: null } },
    { result: 'success', name: 'Home to Torborhold', got: 'null', story: 'undefined' }]) {
    const r = eventResult(m);
    assert.ok(!/null|undefined/.test(r.text + ' ' + r.got), JSON.stringify(r));
    assert.equal(r.text, 'Won: Home to Torborhold.');
  }
  const r = eventResult({ result: 'success', name: 'Raid', got: 'You got 237 experience, 26 gold and a Savage Battleaxe.', story: 'The road is open again.' });
  assert.equal(r.text, 'Won: Raid. The road is open again.'); assert.equal(r.got, 'You got 237 experience, 26 gold and a Savage Battleaxe.');
  // the DOM side: no bare append with a hole in any interface module
  for (const f of ['event-tracker.js', 'pt5.js', 'reveal.js', 'char-sheet.js', 'feedback.js', 'kit-step.js', 'angling.js', 'journal.js'])
    assert.ok(!/\.append\([^\n]*(\? [^\n:]*: null|&& h\()/.test(src('js/client/ui/' + f)), f + ' appends something that may be null (DOM append writes the word)');
});

test('U14: line of sight over tiles, and what the minimap shows of it', () => {
  // a 10x10 room with a wall along x = 5 and a gap at z in [4, 5)
  const walk = (x, z) => !(x >= 5 && x < 6 && !(z >= 4 && z < 5));
  assert.equal(tileLos(walk, 2, 2, 8, 2, 0.25), false, 'a wall is between');
  assert.equal(tileLos(walk, 2, 4.5, 8, 4.5, 0.25), true, 'through the gap');
  assert.equal(tileLos(walk, 2, 2, 4, 2, 0.25), true);
  assert.equal(tileLos(walk, 4.4, 2, 5.2, 2, 0.75), true, 'a door standing IN the wall is seen from beside it');
  const me = { id: 1, x: 2, z: 2 };
  const bodies = [
    { id: 2, kind: 'monster', hostile: true, name: 'Barrow Rat', level: 2, x: 4, z: 3 }, { id: 3, kind: 'monster', hostile: true, name: 'Hidden Rat', x: 8, z: 2 },
    { id: 4, kind: 'monster', hostile: true, dead: true, name: 'Dead Rat', x: 3, z: 3 }, { id: 5, kind: 'npc', name: 'Tam', title: 'Angler', x: 3, z: 2 },
    { id: 6, kind: 'player', name: 'Brem', level: 4, x: 2, z: 4 }, { id: 7, kind: 'npc', pet: true, name: 'Wolf', x: 3, z: 3 }, { id: 8, kind: 'monster', hostile: true, rank: 'boss', name: 'Warden', x: 4, z: 4 },
    { id: 9, kind: 'monster', hostile: true, name: 'Far Rat', x: 2, z: 300 }, { id: 1, kind: 'player', name: 'Me', x: 2, z: 2 },
  ];
  const things = [{ id: 20, type: 'lift', name: 'Stairs up', x: 4, z: 1, portal: 'up' }, { id: 21, type: 'chest', x: 8, z: 8 }, { id: 22, type: 'door', x: 1, z: 1, portal: 'out' }, { id: 23, type: 'note', x: 3, z: 3 }];
  const known = new Set();
  const los = (ax, az, bx, bz) => tileLos(walk, ax, az, bx, bz, 0.25);
  const m = sightMarkers({ me, bodies, things, los, range: 45, skip: new Set([8]), known });
  assert.deepEqual(m.map(x => x.name).sort(), ['Barrow Rat', 'Brem', 'Stairs up', 'Tam', 'The way out'].sort());
  assert.equal(m.find(x => x.name === 'Barrow Rat').kind, 'monster'); assert.equal(m.find(x => x.name === 'Tam').kind, 'npc'); assert.equal(m.find(x => x.name === 'Brem').kind, 'player');
  assert.equal(m.find(x => x.name === 'Stairs up').kind, 'object');
  // a door once seen stays on the map from the far side of the wall; a monster does not
  const far = sightMarkers({ me: { id: 1, x: 8, z: 8 }, bodies, things, los, range: 45, known });
  assert.ok(far.some(x => x.name === 'The way out')); assert.ok(far.some(x => x.sub === 'A chest')); assert.ok(!far.some(x => x.name === 'Barrow Rat'));
  assert.deepEqual(sightMarkers({ me: null, bodies }), []);
});

test('U12: the lift lists the floors top first, and names the top', () => {
  const c = liftChoices({ kind: 'lift', here: 3, choices: [{ to: 'f:2', floor: 2, name: 'The Ossuary' }, { to: 'f:1', floor: 1 }] });
  assert.deepEqual(c.map(x => x.to), ['f:1', 'f:2']);
  assert.match(c[0].label, /The top — floor 1/); assert.equal(c[0].top, true); assert.equal(c[1].label, 'Floor 2 — The Ossuary');
  assert.deepEqual(liftChoices({}), []);
});

test('U17: a potion\'s card line is in your numbers', () => {
  assert.equal(potionLine({ hp: 47, mp: 0 }, { hpPct: 0.5 }, 20), 'Restores 47 health (50% of yours) at once. Potions share a 20 s wait.');
  assert.equal(potionLine({ hp: 0, mp: 18.4 }, { mpPct: 0.5 }), 'Restores 18 mana (50% of yours) at once.');
  assert.match(potionLine({ hp: 24, mp: 0 }, { hpPct: 0.25, group: true }), /to you and your party near you/);
  assert.equal(potionLine({ hp: 0, mp: 0 }, {}), '');
});

test('U6 + U7 + U13: one source each — the rules\' text for item properties, the server sheet for the bag\'s numbers and the armour share', () => {
  const card = src('js/client/ui/item-card.js');
  assert.match(card, /rules\/item-text\.js/); assert.match(card, /ruleText\(a\)/);
  const bag = src('js/client/bag.js');
  assert.ok(!/armour \+= it\.armor/.test(bag), 'the bag window no longer adds armour up itself');
  assert.match(bag, /sheetLines/);
  const sheet = src('js/client/ui/char-sheet.js');
  assert.match(sheet, /armorReduction/); assert.match(sheet, /bag\?\.setStats\?\.\(bagLines\)/);
  assert.ok(!/armou?r \/ \(/.test(sheet), 'no armour formula of our own in the Character menu');
});
