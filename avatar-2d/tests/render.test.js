// Node tests: every part in every slot renders, body metrics behave, random generation respects race rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSVG, normalizeAvatar, DEFAULT_AVATAR, bodyMetrics, shade } from '../js/render.js';
import { PARTS, SLOTS, LAYERS, partIds } from '../js/parts/index.js';
import { randomAvatar } from '../js/random.js';
const DATA = JSON.parse(readFileSync(new URL('../data/presets.json', import.meta.url)));

test('every part of every slot renders to valid-looking SVG', () => {
  for (const slot of SLOTS) for (const id of partIds(slot)) {
    const a = JSON.parse(JSON.stringify(DEFAULT_AVATAR)); if (slot === 'headShape') a.headShape = id; else a[slot].id = id;
    const svg = renderSVG(a);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${slot}/${id}`);
    assert.ok(!/undefined|NaN|\[object/.test(svg), `${slot}/${id} has undefined/NaN`);
    const p = PARTS[slot][id]; for (const piece of p.pieces || []) assert.ok(LAYERS.includes(piece.layer), `${slot}/${id}: unknown layer ${piece.layer}`);
  }
});

test('all presets render and normalize without changes', () => {
  for (const p of DATA.presets) { const n = normalizeAvatar(p.avatar); for (const slot of SLOTS) { const want = slot === 'headShape' ? p.avatar.headShape : p.avatar[slot].id; const got = slot === 'headShape' ? n.headShape : n[slot].id; assert.equal(got, want, `${p.id}: ${slot} fell back (unknown id ${want})`); } assert.ok(renderSVG(n).length > 500); }
});

test('unknown part ids fall back to defaults instead of crashing', () => {
  const n = normalizeAvatar({ hair: { id: 'nope' }, headShape: 'nope', top: { id: 'nope', color: '#123456' } });
  assert.equal(n.hair.id, DEFAULT_AVATAR.hair.id); assert.equal(n.headShape, DEFAULT_AVATAR.headShape); assert.equal(n.top.id, DEFAULT_AVATAR.top.id); assert.equal(n.top.color, '#123456');
});

test('body metrics: taller = higher head, wider = wider torso, head never scales with body', () => {
  const short = bodyMetrics({ height: 0, width: 0.5, headSize: 0.5 }), tall = bodyMetrics({ height: 1, width: 0.5, headSize: 0.5 });
  assert.ok(tall.headCy < short.headCy); assert.equal(tall.headScale, short.headScale);
  assert.ok(bodyMetrics({ width: 1 }).widthScale > bodyMetrics({ width: 0 }).widthScale);
  const svg = renderSVG({ body: { height: 1, width: 1, headSize: 0 } }); assert.ok(svg.includes('data-layer="headShape"'));
});

test('random generation is seeded and honours race rules', () => {
  const a = randomAvatar(DATA, { race: 'goblin', seed: 7 }), b = randomAvatar(DATA, { race: 'goblin', seed: 7 }), c = randomAvatar(DATA, { race: 'goblin', seed: 8 });
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  for (let i = 0; i < 30; i++) { const g = randomAvatar(DATA, { race: 'goblin', seed: i }); assert.ok(DATA.raceRules.goblin.ears.includes(g.ears.id)); assert.ok(g.body.height <= 0.3); assert.ok(DATA.raceRules.goblin.skin.includes(g.body.skin)); }
  for (let i = 0; i < 30; i++) { const e = randomAvatar(DATA, { race: 'elf', seed: i }); assert.equal(e.ears.id, 'pointed'); }
  const base = randomAvatar(DATA, { seed: 1 }); const faceOnly = randomAvatar(DATA, { seed: 2, base, only: 'face' }); assert.deepEqual(faceOnly.top, base.top); assert.deepEqual(faceOnly.body, base.body);
});

test('shade lightens and darkens', () => { assert.equal(shade('#808080', -0.5), '#404040'); assert.equal(shade('#000000', 0.5), '#808080'); assert.equal(shade('nope', 0.5), 'nope'); });
