// An invite link (?code=ABCD) for someone who has never made a character (2026-10-20, Tumblefair on games.radgh.com):
// the server says `ready: false` until the player has chosen a name or a look (or played a match), so the page asks for
// those first instead of seating a random "Pip".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProfiles } from '../js/sim/profiles.js';

const cosmetics = JSON.parse(readFileSync(new URL('../data/cosmetics.json', import.meta.url), 'utf8'));
let n = 0;
const mk = () => createProfiles({ cosmetics, randomToken: () => 't' + (++n), cleanLook: (look, old) => ({ ok: true, look: { ...old, ...look } }) });

test('a new player is not ready; choosing a name or a look makes them ready; so does a played match', () => {
  const P = mk();
  const a = P.create();
  assert.equal(P.view(a).ready, false, 'fresh from the first visit');
  P.update(a.token, { name: 'Radley' });
  assert.equal(P.view(P.get(a.token)).ready, true, 'named');
  const b = P.create();
  P.update(b.token, { look: { race: 'elf' } });
  assert.equal(P.view(P.get(b.token)).ready, true, 'a look chosen');
  const c = P.create();
  P.reward(c.token, 10);
  assert.equal(P.view(P.get(c.token)).ready, true, 'someone who has played a match before the flag existed');
  const d = P.create();
  P.update(d.token, { name: '' });
  assert.equal(P.view(P.get(d.token)).ready, false, 'an empty name changes nothing');
});
