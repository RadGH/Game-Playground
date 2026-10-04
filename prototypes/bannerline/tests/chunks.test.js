// js/net/chunks.js: big messages split into frames and joined back (PeerJS data channels refuse one
// message above 64-256 KB; a late-match resync snapshot is bigger).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { split, createJoiner, CHUNK } from '../js/net/chunks.js';
import { sim } from './_sim.mjs';

test('a small message passes through untouched', () => {
  const m = { t: 'turn', tick: 5, cmds: [] };
  assert.deepEqual(split(m, 1), [m]);
  const join = createJoiner();
  assert.equal(join(m), m);
});

test('a real snapshot over the limit is split under CHUNK per frame and joins back exactly, even interleaved', () => {
  const players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push({ team: t, kind: 'ai', ai: { difficulty: 'veteran' }, race: ['freeholds', 'ashtusk', 'unburied'][i], hero: ['warrior', 'ranger', 'druid'][i] });
  const s = sim({ seed: 4, mode: 'linewar', format: '3v3', map: 'vale', players }, { events: false });
  while (s.tick < 6000 && !s.over) s.step([]);   // a 5-minute 3v3 is ~100 KB
  const msg = { t: 'resync', snap: s.snapshot(), turns: [] };
  const text = JSON.stringify(msg);
  assert.ok(text.length > 64 * 1024, `snapshot is ${text.length} chars (big enough to matter)`);
  const a = split(msg, 7), b = split({ t: 'other', pad: 'x'.repeat(CHUNK * 2) }, 8);
  assert.ok(a.length > 1 && a.every(f => JSON.stringify(f).length < Math.min(64 * 1024, 2 * CHUNK + 200)))   // escaping can grow a frame; never past the smallest browser limit;
  const join = createJoiner();
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) for (const f of [a[i], b[i]]) if (f) { const w = join(f); if (w) out.push(w); }
  assert.equal(out.length, 2);
  assert.equal(JSON.stringify(out.find(o => o.t === 'resync')), text);
  assert.equal(out.find(o => o.t === 'other').pad.length, CHUNK * 2);
});
