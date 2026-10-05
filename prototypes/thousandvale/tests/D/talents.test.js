// Stream D — play-test P6: the data side of the Skills (K) and Perk Forest (N) windows (js/client/ui/talent-model.js).
// Unlock ladder, talent tier gating (one pick per tier, spent tiers stay spent), the forest's connected-path rule,
// points, refunds that would cut a path, and C's JSON shapes (docs/requests.md "D (Client) -> A/C, play-test P6").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeSource, skillLadder, nextUnlockText, treeState, pickCheck, talentPicksWaiting, forestState, perkCheck, refundCheck,
  forestFromJson, perkTotals, tiersOpenAt, talentsFromServer,
} from '../../js/client/ui/talent-model.js';

const skillsData = JSON.parse(readFileSync(new URL('../../../farhold/data/skills.json', import.meta.url)));
const src = makeSource({ skillsData });

test('ladder: six skills in unlock order, the next one flagged with its level', () => {
  const L = skillLadder(src, 'warrior', 7);
  assert.equal(L.length, 6);
  assert.deepEqual(L.map(s => s.level), [...L.map(s => s.level)].sort((a, b) => a - b));
  assert.deepEqual(L.filter(s => s.unlocked).map(s => s.level), [1, 3, 6]);
  const next = L.filter(s => s.next);
  assert.equal(next.length, 1); assert.equal(next[0].level, 12);
  assert.match(nextUnlockText(L, 7), /at level 12 \(5 levels to go\)/);
  assert.equal(nextUnlockText(skillLadder(src, 'warrior', 30), 30), null);
});

test('ladder: the server bar wins (levels, names) when it is sent', () => {
  const bar = [{ slot: 1, id: 'cleave', name: 'Cleave (Iron)', level: 1 }, { slot: 2, id: 'warcry', name: 'War Cry', level: 2 }, { slot: 3, empty: true }];
  const L = skillLadder(src, 'warrior', 2, bar);
  assert.equal(L.find(s => s.id === 'cleave').name, 'Cleave (Iron)');
  assert.equal(L.find(s => s.id === 'warcry').level, 2);
  assert.ok(L.find(s => s.id === 'warcry').unlocked);
});

test('talents: tiers open at their level; one pick per tier; a spent tier is not re-picked', () => {
  const tree = src.tree('cleave');
  assert.ok(tree.tiers.length >= 3);
  for (const t of tree.tiers) assert.ok(t.nodes.length >= 2 && t.nodes.length <= 3, `tier ${t.tier} has 2-3 nodes`);
  for (const t of tree.tiers) for (const n of t.nodes) assert.ok(n.desc && n.desc !== 'No change.', `${n.id} says what it does`);
  const [t1, t2] = tree.tiers;
  assert.equal(tiersOpenAt(src.tierLevels, t1.level - 1), 0);
  assert.equal(pickCheck(tree, {}, t1.level - 1, 1, t1.nodes[0].id).ok, false);
  assert.equal(pickCheck(tree, {}, t1.level, 1, t1.nodes[0].id).ok, true);
  assert.equal(pickCheck(tree, {}, t1.level, 1, t1.nodes[0].id, { skillUnlocked: false }).ok, false);
  const picks = { 1: t1.nodes[0].id };
  assert.match(pickCheck(tree, picks, 99, 1, t1.nodes[1].id).why, /Unbinder/);
  assert.equal(pickCheck(tree, picks, 99, 1, 'nope').ok, false);
  const st = treeState(tree, picks, t2.level);
  assert.equal(st.tiers[0].nodes[0].state, 'picked');
  assert.equal(st.tiers[0].nodes[1].state, 'other');
  assert.equal(st.tiers[1].nodes[0].state, 'open');
  assert.equal(st.tiers[2].nodes[0].state, 'locked');
  assert.equal(st.waiting, 1);
  const L = skillLadder(src, 'warrior', t2.level);
  assert.ok(talentPicksWaiting(src, L, { cleave: picks }, t2.level) >= 1);
});

test('forest: the middle is free; only nodes next to a taken one are open; points come from the level', () => {
  const F = src.forest;
  assert.ok(F.nodes.length > 100, 'a big forest');
  const st1 = forestState(src, [], 1);
  assert.equal(st1.left, 0);
  assert.ok(![...st1.state.values()].includes('open'), 'no points at level 1');
  const st = forestState(src, [], 6);
  assert.ok(st.left > 0);
  const open = [...st.state].filter(([, v]) => v === 'open').map(([k]) => k);
  for (const id of open) assert.ok((F.neighbours.get(id) || []).includes(F.start.id), `${id} touches the middle`);
  const far = F.nodes.find(n => n.kind === 'keystone');
  const no = perkCheck(src, [], 6, 0, far.id);
  assert.equal(no.ok, false); assert.match(no.why, /connects/);
  assert.equal(perkCheck(src, [], 6, 0, open[0]).ok, true);
  assert.equal(perkCheck(src, [open[0]], 2, 0, (F.neighbours.get(open[0]) || []).find(x => x !== F.start.id)).ok, false, 'out of points');
});

test('forest: a node in the middle of a path cannot be handed back; the end of one can', () => {
  const F = src.forest;
  const a = (F.neighbours.get(F.start.id) || [])[0];
  const b = (F.neighbours.get(a) || []).find(x => x !== F.start.id && !(F.neighbours.get(x) || []).includes(F.start.id));
  assert.ok(a && b);
  assert.equal(refundCheck(src, [a, b], a).ok, false);
  assert.equal(refundCheck(src, [a, b], b).ok, true);
  assert.ok(Object.keys(perkTotals(src, [a, b])).length >= 1);
});

test('C data shapes: tier levels and a JSON forest switch the source over', () => {
  const j = { start: 'root', arms: [{ key: 'x', name: 'X', color: '#f00', angle: 0 }], nodes: [{ id: 'root', kind: 'hub', name: 'Root', x: 0, y: 0 }, { id: 'a', kind: 'minor', name: 'A', x: 1, y: 0, arm: 'x', grants: { maxHp: 10 } }, { id: 'b', kind: 'keystone', name: 'B', x: 2, y: 0, arm: 'x' }],
    links: [['root', 'a'], ['a', 'b'], ['a', 'ghost']], pointsPerLevel: 1 };
  const s2 = makeSource({ skillsData, talentsJson: { tierLevels: [2, 5, 9, 14] }, perksJson: j });
  assert.equal(s2.label, 'thousandvale');
  assert.deepEqual(s2.tree('cleave').tiers.map(t => t.level), [2, 5, 9, 14]);
  const F = forestFromJson(j);
  assert.equal(F.links.length, 2, 'links to unknown nodes are dropped');
  assert.equal(perkCheck(s2, [], 3, 0, 'b').ok, false);
  assert.equal(perkCheck(s2, [], 3, 0, 'a').ok, true);
  assert.equal(forestState(s2, ['a'], 3).left, 1);
});

test('C placeholders ({_doc} only) do not empty the forest', () => {
  const s3 = makeSource({ skillsData, talentsJson: { _doc: 'placeholder' }, perksJson: { _doc: 'placeholder' } });
  assert.equal(s3.label, 'farhold');
  assert.ok(s3.forest.nodes.length > 100);
});

test('server talent view (C talentView) -> picks + trees; a plain picks map passes through', () => {
  const view = [{ slot: 1, skillId: 'cleave', name: 'Cleave', open: true, unlockAt: 1, tiers: [
    { tier: 1, level: 3, open: true, picked: 'hooked_edge', nodes: [{ id: 'reaping_arc', name: 'Reaping Arc', desc: 'x' }, { id: 'hooked_edge', name: 'Hooked Edge', desc: 'y', picked: true }] },
    { tier: 2, level: 8, open: false, picked: null, nodes: [{ id: 'a', name: 'A', desc: 'z' }, { id: 'b', name: 'B', desc: 'w' }] }] }];
  const t = talentsFromServer(view);
  assert.deepEqual(t.picks, { cleave: { 1: 'hooked_edge' } });
  const st = treeState(t.trees.cleave, t.picks.cleave, 5);
  assert.equal(st.tiers[0].nodes[1].state, 'picked');
  assert.equal(st.tiers[1].nodes[0].state, 'locked');
  assert.deepEqual(talentsFromServer({ cleave: { 2: 'b' } }).picks, { cleave: { 2: 'b' } });
});

test('C js/rules/perk-forest.js forestView (plain JSON) works as a source when it is sent', async () => {
  const fv = { arms: [{ key: 'a', name: 'A', color: '#fff', angle: 0 }], start: 'start', nodes: [{ id: 'start', kind: 'hub', x: 0, y: 0 }, { id: 'a:1:0', kind: 'minor', arm: 'a', x: 1, y: 0, name: '+1' }], links: [['start', 'a:1:0']] };
  const s4 = makeSource({ skillsData, forest: forestFromJson(fv) });
  assert.equal(perkCheck(s4, [], 5, 0, 'a:1:0').ok, true);
});

test('server perk state: a list, or C rules.perks(e) {total, spent, left, taken}; C rules.talents(e) {skills:[...]}', async () => {
  const { perksFromServer } = await import('../../js/client/ui/talent-model.js');
  assert.deepEqual(perksFromServer(['start', 'a']), { perks: ['a'], left: null });
  assert.deepEqual(perksFromServer({ total: 5, spent: 1, left: 4, taken: ['a'] }), { perks: ['a'], left: 4 });
  assert.equal(perksFromServer(null), null);
  const t = talentsFromServer({ tiers: [3, 8, 18, 28], level: 9, skills: [{ skillId: 'x', tiers: [{ tier: 1, level: 3, picked: 'n1', nodes: [{ id: 'n1' }, { id: 'n2' }] }] }] });
  assert.deepEqual(t.picks, { x: { 1: 'n1' } });
});
