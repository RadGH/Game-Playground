// Every enemy, boss, class pet, hireable companion and named hire has a designed look, and every look is real:
// avatar part ids must exist (normalizeAvatar silently swaps unknown ids for defaults) and creature types must exist.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { normalizeAvatar } from '../../../avatar-2d/js/render.js';
import { CREATURE_TYPES, normalizeCreature } from '../../../avatar-3d/js/creature-types.js';
const J = f => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const looks = J('../data/enemy-looks.json');
const enemies = J('../data/enemies.json').entities, bosses = J('../data/bosses.json').entities, comp = J('../data/companions.json');
const byId = l => Array.isArray(l) ? Object.fromEntries(l.map(e => [e.id, e])) : l;
const ROSTER = { enemies, bosses, pets: byId(comp.classPets), companions: byId(comp.companions), hires: byId(comp.hires) };
const ALL = Object.entries(ROSTER).flatMap(([g, r]) => Object.keys(r).map(id => [g, id, looks[g]?.[id]]));

test('every roster id has a look, and no look is orphaned', () => {
  for (const [group, roster] of Object.entries(ROSTER)) {
    for (const id of Object.keys(roster)) assert.ok(looks[group]?.[id], `no look for ${group}/${id}`);
    for (const id of Object.keys(looks[group])) assert.ok(roster[id], `look ${group}/${id} has no roster entry`);
  }
  assert.equal(ALL.length, 80);
});

test('every look is either an avatar or a creature, with flavour text and a voice', () => {
  for (const [group, id, L] of ALL) {
    const where = `${group}/${id}`;
    assert.ok(!!L.avatar !== !!L.creature, `${where}: needs exactly one of avatar/creature`);
    assert.ok(L.name && L.name.length > 1, `${where}: no name`);
    assert.ok(L.desc && L.desc.length > 20, `${where}: no flavour text`);
    assert.ok(L.voiceRole && L.voice?.engine === 'formant', `${where}: no voice`);
    assert.ok(Array.isArray(L.traits) && L.traits.length, `${where}: no speech traits`);
    assert.ok(L.speech?.traits?.length, `${where}: no speech section`);
  }
});

test('avatar looks use real parts: nothing falls back to the default part', () => {
  for (const [group, id, L] of ALL) {
    if (!L.avatar) continue; const n = normalizeAvatar(L.avatar);
    for (const [slot, v] of Object.entries(L.avatar)) {
      if (slot === 'body') continue;
      const want = v?.id ?? v, got = n[slot]?.id ?? n[slot];
      assert.equal(got, want, `${group}/${id}: ${slot} "${want}" is not a real part`);
    }
    for (const k of ['height', 'width', 'headSize']) assert.ok(L.avatar.body[k] >= 0 && L.avatar.body[k] <= 1, `${group}/${id}: body.${k} out of range`);
    assert.match(L.avatar.body.skin, /^#[0-9a-f]{6}$/i, `${group}/${id}: skin colour`);
  }
});

test('creature looks use real types and survive normalising', () => {
  for (const [group, id, L] of ALL) {
    if (!L.creature) continue; const c = L.creature;
    assert.ok(CREATURE_TYPES[c.type], `${group}/${id}: unknown creature type "${c.type}"`);
    const n = normalizeCreature(c);
    assert.equal(n.type, c.type, `${group}/${id}: type fell back to ${n.type}`);
    assert.ok(n.size > 0.2 && n.size < 4, `${group}/${id}: odd size ${n.size}`);
    for (const k of ['body', 'belly', 'accent', 'eyes']) assert.match(n.colors[k], /^#[0-9a-f]{6}$/i, `${group}/${id}: colour ${k}`);
  }
});

test('bosses are bigger than the rank and file they resemble', () => {
  const sizeOf = L => L.creature ? L.creature.size : L.avatar.body.height;
  const enemyAvg = Object.values(looks.enemies).map(sizeOf).reduce((a, b) => a + b, 0) / 33;
  const bossAvg = Object.values(looks.bosses).map(sizeOf).reduce((a, b) => a + b, 0) / 12;
  assert.ok(bossAvg > enemyAvg, `bosses (${bossAvg.toFixed(2)}) should outsize enemies (${enemyAvg.toFixed(2)})`);
});

test('the looks are filed in the character library as enemy_/companion_ entries', () => {
  const lib = J('../../../library/data/defaults.json').entries;
  const get = id => lib.find(e => e.id === id);
  for (const [group, id, L] of ALL) {
    const prefix = group === 'enemies' || group === 'bosses' ? 'enemy_' : 'companion_';
    const e = get(prefix + id);
    assert.ok(e, `library entry ${prefix}${id} missing`);
    assert.equal(e.kind, prefix === 'enemy_' ? 'enemy' : 'npc');
    assert.ok(e.tags.includes('emberveil'));
    assert.equal(e.data.templateId, id);
    assert.equal(!!e.data.avatar, !!L.avatar);
    assert.equal(!!e.data.creature, !!L.creature);
    assert.ok(e.data.voice && e.data.speech, `${prefix}${id}: entry needs voice + speech`);
  }
});
