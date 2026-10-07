// Stream E — play-test 5 T9 (gear crates on the starting quests) and T10 (rares a newcomer actually meets).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { measureRares, startLine } from '../../tools/content-rares.mjs';
import { CHAMP } from '../../tools/content-hunts.mjs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const SLOTS = new Set(['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring', 'neck', 'armor', 'any', 'back', 'waist', 'light']);
const MINS = ['common', 'uncommon', 'rare', 'epic'];
const QFILES = readdirSync(new URL('data/quests/', root)).filter(f => f.endsWith('.json') && !['events.json', 'jobs.json', 'treasure.json', 'province.json'].includes(f));
const quests = f => J('data/quests/' + f).quests || [];

test('T9: every crate names a real slot and a minimum rarity, and nothing else', () => {
  let n = 0;
  for (const f of QFILES) for (const q of quests(f)) for (const c of (q.reward && q.reward.crates) || []) {
    n++;
    assert.ok(SLOTS.has(c.slot), `${q.id}: slot ${c.slot}`);
    assert.ok(MINS.includes(c.min), `${q.id}: min ${c.min}`);
    assert.deepEqual(Object.keys(c).filter(k => !['slot', 'min', 'forClass'].includes(k)), [], `${q.id}: extra crate fields`);
  }
  assert.ok(n >= 90, 'crates on quests: ' + n);
});

test('T9: EVERY starting quest pays a crate — the start chain, the Torbor Fields, the set pieces, every class quest, the angling quests', () => {
  for (const f of ['start.json', 'test.json', 'setpieces.json', 'classes.json', 'angling.json']) for (const q of quests(f))
    assert.ok(q.reward && Array.isArray(q.reward.crates) && q.reward.crates.length >= 1, `${f} ${q.id}: no crate`);
  // a random `item` roll became the crate; only a NAMED item (the class quests' rares) stays beside it
  for (const f of ['start.json', 'test.json', 'setpieces.json']) for (const q of quests(f)) assert.ok(!q.reward.item, `${f} ${q.id}: still rolls a loose item`);
  for (const q of quests('classes.json')) assert.ok(q.reward.item && q.reward.item.base && q.reward.item.name, `${q.id}: lost its named rare`);
});

test('T9: the start chain alone fills nine different slots, weapon and off hand at rare', () => {
  const crates = quests('start.json').flatMap(q => q.reward.crates);
  const slots = new Set(crates.map(c => c.slot));
  for (const s of ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring', 'neck', 'back', 'waist']) assert.ok(slots.has(s), 'start chain has no ' + s + ' crate');
  assert.equal(crates.find(c => c.slot === 'weapon').min, 'rare');
  // and the first hour round Torborhold (start chain + fields + set pieces) hands out at least 30 crates
  const hour = ['start.json', 'test.json', 'setpieces.json', 'angling.json'].flatMap(f => quests(f)).flatMap(q => q.reward.crates);
  assert.ok(hour.length >= 30, 'first-hour crates: ' + hour.length);
});

test('T9: the first two quests of every other zone pay a weapon crate and an armour crate, uncommon or better', () => {
  const zones = Object.keys(J('data/provinces/torbor_downs.json').zones).filter(z => z !== 'test');
  for (const z of zones) {
    const qs = quests(z + '.json').map((q, i) => ({ q, i })).sort((a, b) => a.q.level - b.q.level || a.i - b.i).slice(0, 2).map(x => x.q);
    assert.deepEqual(qs.map(q => q.reward.crates && q.reward.crates[0].slot), ['weapon', 'armor'], z);
    for (const q of qs) assert.ok(MINS.indexOf(q.reward.crates[0].min) >= 1, `${z} ${q.id}: ${q.reward.crates[0].min}`);
  }
});

test('T9: the quest files are what tools/content-crates.mjs writes', () => {
  execFileSync(process.execPath, [new URL('tools/content-crates.mjs', root).pathname, '--check'], { stdio: 'pipe' });
});

// ------------------------------------------------------------------------------------------------ T10
const zoneOffset = wid => ({ ox: +wid.slice(1, 3) * 2048, oz: +wid.slice(4, 6) * 2048 });
const champs = readdirSync(new URL('data/vignettes/placements/', root)).filter(f => f.endsWith('.quest.json'))
  .flatMap(f => { const d = J('data/vignettes/placements/' + f), o = zoneOffset(d.zone); return (d.placements || []).filter(p => p.rank === 'champion').map(p => ({ ...p, wid: d.zone, wx: p.x + o.ox, wz: p.z + o.oz })); });

test('T10: fixed roadside champions stand in every zone that has roads, each one body with one named modifier', () => {
  assert.ok(champs.length >= 50, 'roadside champions: ' + champs.length);
  const mods = new Set([...J('../farhold/data/enemies.json').modifiers.map(m => m.id), ...J('data/rules/affixes.json').extra.map(m => m.id)]);
  for (const c of champs) {
    assert.deepEqual(c.count, [1, 1], c.id);
    assert.ok(c.level[0] >= CHAMP.minLevel, `${c.id}: level ${c.level[0]}`);
    assert.ok(Array.isArray(c.affixes) && c.affixes.length === 1 && mods.has(c.affixes[0]), `${c.id}: modifier ${c.affixes}`);
    assert.ok(Array.isArray(c.respawnMin) && c.respawnMin[1] <= 10, `${c.id}: back within ten minutes`);
  }
  assert.ok(new Set(champs.map(c => c.wid)).size >= 14, 'zones with a roadside champion');
  assert.ok(new Set(champs.map(c => c.affixes[0])).size >= 8, 'a spread of modifiers');
});

test('T10: a newcomer walking the start chain for half an hour passes at least four placed champions', () => {
  const line = startLine();
  const segDist = (p, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0; return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)); };
  const near = champs.filter(c => line.some((b, i) => i && segDist({ x: c.wx, z: c.wz }, line[i - 1], b) <= 50));
  assert.ok(near.length >= 4, 'champions within sight of the first walk: ' + near.length);
});

test('T10: the measurement — with the roll chance as it stands in the data the walk meets several special monsters', async () => {
  const r = await measureRares();
  assert.ok(r.bodiesMet >= 40, 'ordinary monsters met: ' + r.bodiesMet);
  // "several" = four or more, from the placed champions (once the server passes their rank) plus the roll
  assert.ok(r.placedInData + r.rolledChampions + r.rolledRares + r.namedMeetings >= 4, JSON.stringify(r));
  // and the roll alone must no longer be starved by its level gate: most of what a newcomer meets can roll
  assert.ok(r.bodiesThatCanRoll / r.bodiesMet >= 0.5, `only ${r.bodiesThatCanRoll} of ${r.bodiesMet} monsters met can roll a rank (chance.minLevel ${r.chance.minLevel})`);
});
