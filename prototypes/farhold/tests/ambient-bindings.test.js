// R14 — an ambient line must name something that is actually there, or fall back to one that
// promises nothing.
//
//   "They happen too often, and they aren't represented on the minimap or in game very well. Can
//    you have a redesign agent plan out how to make these events more impactful, clearly visible,
//    and less generic?"
//
// All twenty-two announce strings named NOTHING — not a creature, not a faction, not a place. Each
// now has a `named` variant with {tokens}. The rule these tests exist to hold is the fallback: a
// line whose tokens cannot ALL be filled must be thrown away and the generic one used instead,
// because "{beast} is out here" with no beast is worse than the sentence it replaced.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nameLine, plural } from '../js/encounters.js';
import { bind } from '../js/ambient.js';

const ENC = JSON.parse(readFileSync(new URL('../data/encounters.json', import.meta.url)));
const EV = JSON.parse(readFileSync(new URL('../data/events.json', import.meta.url)));
const ALL = [...(ENC.encounters || []), ...(EV.events || [])];

/** The only tokens `nameLine` knows how to fill. Anything else can never bind. */
const KNOWN = new Set(['beast', 'beasts', 'count', 'owner', 'place']);

const pack = (n, name = 'Moor Hound') =>
  Array.from({ length: n }, (_, i) => ({ defId: 'moor_hound', name, baseName: name, id: i }));

test('every set piece and every road event still has a generic line to fall back on', () => {
  assert.ok(ALL.length >= 22, `only ${ALL.length} ambient specs`);
  for (const spec of ALL) {
    assert.ok(spec.announce, `${spec.id} has no announce — there is nothing to fall back to`);
  }
});

test('every {token} in a named line is one the binder can actually fill', () => {
  let named = 0;
  for (const spec of ALL) {
    if (!spec.named) continue;
    named++;
    for (const m of spec.named.matchAll(/\{(\w+)\}/g)) {
      assert.ok(KNOWN.has(m[1]),
        `${spec.id} asks for {${m[1]}}, which nothing fills — the line would be thrown away every time`);
    }
  }
  assert.ok(named >= 22, `only ${named} lines name anything; the whole point was that none of them did`);
});

test('a named line binds when the creatures are really there', () => {
  const spec = ENC.encounters.find(e => e.id === 'warband');
  const line = nameLine(spec, pack(4), { place: 'Menwin Weald' });
  assert.ok(line, 'the warband line refused to bind against four real bodies');
  assert.match(line, /4/, 'it does not say how many');
  assert.match(line, /Moor Hounds/, 'it does not name the creature');
  assert.match(line, /Menwin Weald/, 'it does not name the place');
  assert.doesNotMatch(line, /[{}]/, `a token survived: "${line}"`);
});

test('…and refuses, rather than lying, when they are not', () => {
  const spec = ENC.encounters.find(e => e.id === 'warband');
  // nothing spawned: a line about {beasts} has no beasts
  assert.equal(nameLine(spec, []), null, 'it named a warband that does not exist');
  // bodies, but no region — the caller is over open water
  assert.equal(nameLine(spec, pack(3), { place: null }), null, 'it named a place it was not given');
  // and a spec with no named variant at all simply has none
  assert.equal(nameLine({ id: 'x', announce: 'Something.' }, pack(3)), null);
});

test('every named line binds against a full context and refuses against an empty one', () => {
  const ctx = { beast: 'Moor Hound', beasts: 'Moor Hounds', count: 3, owner: 'The Wardens', place: 'Menwin Weald' };
  for (const spec of ALL) {
    if (!spec.named) continue;
    const full = bind(spec.named, ctx);
    assert.ok(full, `${spec.id} will not bind even with everything supplied`);
    assert.doesNotMatch(full, /[{}]/, `${spec.id} left a stray brace: "${full}"`);
    if (/\{/.test(spec.named)) {
      assert.equal(bind(spec.named, {}), null, `${spec.id} bound against nothing at all`);
    }
  }
});

test('the plural is good enough for a bestiary of forty-six', () => {
  assert.equal(plural('Moor Hound'), 'Moor Hounds');
  assert.equal(plural('Bog Lurker'), 'Bog Lurkers');
  assert.equal(plural('Ash Fox'), 'Ash Foxes');
  assert.equal(plural('Cinder Shade'), 'Cinder Shades');
  assert.equal(plural('Harpy'), 'Harpies');
  assert.equal(plural('Stone Wretch'), 'Stone Wretches');
  // every real name in the bestiary must come out non-empty and different from itself
  const bestiary = JSON.parse(readFileSync(new URL('../data/enemies.json', import.meta.url)));
  for (const e of bestiary.enemies || []) {
    const p = plural(e.name);
    assert.ok(p && p !== e.name, `"${e.name}" pluralised to "${p}"`);
  }
});

test('no ambient line in the data is a duplicate of another', () => {
  // the user's complaint was that they repeat; two specs sharing a sentence guarantees it
  const seen = new Map();
  for (const spec of ALL) {
    for (const key of ['announce', 'named']) {
      const line = spec[key];
      if (!line) continue;
      assert.ok(!seen.has(line), `${spec.id} and ${seen.get(line)} say exactly the same thing`);
      seen.set(line, spec.id);
    }
  }
});
