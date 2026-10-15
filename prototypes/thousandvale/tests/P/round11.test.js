// Round 11 (stream P, owner play-test 2026-10-15): the profession items that are not covered by the rewritten core tests.
//   #14 no code ids in profession messages · #58 the chosen weapon pattern is honoured, made gear is never plain ·
//   #59 no "Somewhere in Test" in the catch journal · #34 / #57 a <kbd data-action> keeps its key on a keyboard
// Run: node --test prototypes/thousandvale/tests/P/round11.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';
import { perfectInputs } from '../../js/rules/professions-games.js';
import { displayName, wordsOf } from '../../js/sim/professions.js';

const ROOT = new URL('../../', import.meta.url);
const J = f => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8'));
const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };

test('#14: a monster is named in words, never by its code id', () => {
  assert.equal(wordsOf('sporecap_walker'), 'Sporecap Walker');
  assert.equal(displayName({ type: 'sporecap_walker', name: 'sporecap_walker' }), 'Sporecap Walker');
  assert.equal(displayName({ type: 'moor_hound', name: 'Old Greyjaw' }), 'Old Greyjaw', 'a real name wins');
  assert.equal(displayName({ type: 'moor_hound', name: 'moor_hound' }, { types: { moor_hound: { name: 'Moor Hound' } } }), 'Moor Hound');
  assert.equal(displayName({ type: 'sporecap_walker', name: 'sporecap_walker' }, J('data/provinces/professions.json').skins), 'Sporecap Walker');
  // no player-facing profession text is built from `.type` or an id on its own
  const src = readFileSync(new URL('js/sim/professions.js', ROOT), 'utf8');
  assert.ok(!/text: `\$\{dead\.name/.test(src), 'the skinning chat line goes through displayName');
});

test('#14 on the server: killing a beast with no hide tells the skinner its name in words', async t => {
  const S = await realServer({ roadEvents: false, travellers: false });
  const a = await joinReal(S.srv, S.clock, 'Namecheck');
  t.after(async () => { a.close(); await S.srv.stop(); });
  const o = rec(S.world, a), chat = on(a, 'chat');
  await run(S.clock, 800);
  const m = o.room.spawn({ kind: 'monster', type: 'sporecap_walker', level: 3, x: o.entity.x + 2, z: o.entity.z, team: 2 });
  m.kill(o.entity); await run(S.clock, 400);
  const line = chat.find(c => c.name === 'Skinning');
  assert.ok(line, 'the skinner is told: ' + JSON.stringify(chat.map(c => c.text)));
  assert.match(line.text, /^Sporecap Walker: /);
  assert.ok(!/_/.test(line.text), line.text);
});

test('#58 on the server: the pattern you pick is the one you get, and it is never plain', async t => {
  const S = await realServer({ roadEvents: false, travellers: false });
  const a = await joinReal(S.srv, S.clock, 'Longsmith');
  t.after(async () => { a.close(); await S.srv.stop(); });
  const P = S.world.province, W = P.professions, o = rec(S.world, a), clock = S.clock;
  await run(clock, 800);
  P.devSetLevel(o.char.id, 11); await run(clock, 300);
  const town = [...P.rooms.values()].find(r => r.kind === 'town' && [...r.objects.values()].some(e => e.data && e.data.npc && e.data.npc.role === 'smith'));
  const smith = [...town.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === 'smith');
  P.transfer(o, town, { x: smith.x + 1.5, z: smith.z }, 'test'); await run(clock, 800);
  const list = on(a, 'craftList'); a.craft('list', { npc: smith.id }); await until(clock, () => list.length, 2000);
  const row = list[0].recipes.find(r => r.id === 'blades_1');
  assert.ok(row.bases.some(b => b.key === 'longsword' && b.can), 'a level-11 smith may make a longsword: ' + JSON.stringify(row.bases));
  const made = [];
  for (const base of ['longsword', 'dagger', 'longsword']) {
    P.grant(o, { items: [W.P.item('bronze_bar', 3)], reason: 'test' }); o.char.gold = 500; await run(clock, 200);
    const cR = on(a, 'craftR'), cD = on(a, 'craftDone');
    a.craft('start', { id: 'blades_1', npc: smith.id, base }); await until(clock, () => cR.length, 2000);
    assert.ok(cR[0].ok, JSON.stringify(cR[0]));
    const inp = perfectInputs(cR[0].game); await run(clock, inp[inp.length - 2] + 60);
    a.craft('done', { id: 'blades_1', inputs: inp }); await until(clock, () => cD.length, 2000);
    assert.ok(cD[0].ok, JSON.stringify(cD[0]).slice(0, 200));
    const it = o.char.bag.filter(i => i.crafted).at(-1);
    made.push(it);
    assert.equal(it.baseKey, base, `asked for a ${base}, got a ${it.baseKey}`);
    assert.ok(['magic', 'rare'].includes(it.rarity), 'crafted gear is magic or better: ' + it.rarity);
  }
  assert.equal(made.length, 3);
});

test('#59: every fish and legend names a real place — the starter zone\'s sheet id "test" reads "The Torbor Fields"', async () => {
  globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(url), 'utf8')) });
  const N = await import('../../js/client/names.js');
  await N.loadZoneNames(new URL('data/', ROOT));
  assert.equal(N.zoneName('test'), 'The Torbor Fields');
  assert.equal(N.zoneName('saint_orrins_rise'), "Saint Orrin's Rise");
  const { catchRows } = await import('../../js/client/ui/pt5-core.js');
  for (const f of ['angling.json', 'vharlen-angling.json']) {
    const d = J('data/provinces/' + f);
    for (const r of [...(d.fish || []), ...(d.legends || [])]) for (const z of [r.zone, ...(r.zones || [])].filter(Boolean)) {
      const name = N.zoneName(z);
      assert.ok(!/\btest\b/i.test(name), `${r.id}: "${name}"`);
      assert.ok(/[a-z]/.test(name) && name !== z, `${r.id}: zone ${z} has a real name ("${name}")`);
    }
  }
  const rows = catchRows(J('data/provinces/angling.json'), { catches: {}, legends: [] }, z => N.zoneName(z) || z);
  const text = JSON.stringify(rows);
  assert.ok(!/in Test\b/.test(text), 'the Catch page never says "Somewhere in Test"');
  assert.ok(/Somewhere in The Torbor Fields/.test(text), 'the Old Ploughshare is placed in the starter zone by name');
});

test('#34 / #57: a mini-game key cap keeps its key on a keyboard after a controller was used (it went blank: "Hold [] to lift")', async () => {
  const H = await import('../../js/client/input/hints.js');
  const el = { dataset: { action: 'profWork' }, textContent: 'Space', classList: { toggle() {} } };
  assert.equal(H.actionOf(el), 'profWork');
  assert.equal(el.dataset.key0, 'Space', 'the default text is remembered for a data-action cap too');
  assert.equal(H.hintFor('profRight', 'keyboard').text, 'D');
  assert.equal(H.hintFor('profWork', 'touch').text, '', 'touch shows no key (you tap the thing itself)');
  // the words of every mini-game name a key or a tap for every device
  const { HOW } = await import('../../js/client/ui/prof-games.js');
  for (const [type, how] of Object.entries(HOW)) {
    for (const dev of ['keyboard', 'pad']) assert.match(how[dev], /\{work\}|\{left\}|\{right\}|mouse|stick/, `${type} ${dev}: says what to press`);
    assert.match(how.touch, /Tap|Slide|finger/, `${type} touch`);
  }
  assert.match(HOW.forge.keyboard, /\{right\}.*fire|fire.*\{right\}/, 'the forge says which key puts the bar back in');
  assert.match(HOW.trace.pad, /stick/, 'skinning on a pad says the stick moves the knife');
});
