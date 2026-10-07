// Stream E — play-test 5 (W's hand-over): a set piece bound onto one of stream B's ground pieces must fit it.
// tools/content-fit.mjs measures every bound recipe at its placement's scale against what B draws there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkAll, TWINS } from '../../tools/content-fit.mjs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const res = checkAll();

test('fit: every bound set piece is measured, and none draws a twin of B\'s dressing, stands in it, or piles on itself', () => {
  assert.ok(res.length >= 6, 'bound set pieces checked: ' + res.length);
  const bad = res.flatMap(r => [...r.out.map(m => `${r.id}: ${m.rule} ${m.item.id || m.item.want || m.item.crop} — ${m.why}`), ...r.rows.map(w => `${r.id}: ${w.items.length} ${w.id} sections overlap in a row`)]);
  assert.deepEqual(bad, [], 'run node tools/content-fit.mjs --fix');
});

test('fit: Saint Hulda\'s Yard has no railing or graves of its own inside B\'s wall; the Nine Maidens no second ring; the farm and mill no second buildings', () => {
  const by = Object.fromEntries(J('data/vignettes/setpieces.json').vignettes.map(v => [v.id, v]));
  const ids = v => (v.models || []).map(m => m.id);
  assert.ok(!ids(by.sp_saint_hulda_yard).some(id => id === 'iron_fence' || TWINS.graveyard.includes(id)));
  assert.ok(!ids(by.sp_nine_maidens).includes('standing_stone'));
  assert.deepEqual((by.sp_brannock_fields.buildings || []).map(b => b.want), []);
  assert.ok(!(by.sp_turnwater_mill.buildings || []).some(b => b.want === 'mill') && !ids(by.sp_turnwater_mill).includes('watermill_wheel'));
  // nothing was thrown away: the full design is kept beside it
  for (const id of ['sp_saint_hulda_yard', 'sp_nine_maidens', 'sp_brannock_fields', 'sp_turnwater_mill']) assert.ok(by[id].ifFree && Object.keys(by[id].ifFree).length >= 2, id + ': ifFree');
  // and what a quest needs is still drawn: every recipe object that sat on a model still has it
  for (const r of res) for (const o of r.rec.objects || []) for (const m of (r.rec.ifFree && r.rec.ifFree.models) || [])
    assert.ok(Math.hypot((o.x || 0) - m.x, (o.z || 0) - m.z) > 2.5 || (TWINS[r.piece] || []).includes(m.id) || m.id === 'iron_fence', `${r.id}: ${m.id} at the quest object "${o.name}" was taken out`);
});

test('fences: in the two wild recipes W flagged, each rail hangs between posts 2.4 m apart', () => {
  const vs = J('data/vignettes/m1.json').vignettes;
  for (const id of ['hedge_witch_garden', 'dry_well']) {
    const v = vs.find(x => x.id === id), posts = v.props.filter(p => p.id === 'fence_post'), rail = v.props.find(p => p.id === 'fence_rail');
    assert.equal(posts.length, 2);
    assert.ok(Math.abs(Math.hypot(posts[0].x - posts[1].x, posts[0].z - posts[1].z) - 2.4) < 0.05, id + ': post gap');
    for (const p of posts) assert.ok(Math.abs(Math.hypot(p.x - rail.x, p.z - rail.z) - 1.2) < 0.05, id + ': rail not centred');
  }
});
