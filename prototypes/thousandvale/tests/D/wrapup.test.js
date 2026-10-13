// Wrap-up (2026-10-13), interface: reports #67 (damage meter needs /meter twice), #60 (a card explains the status it names),
// #58 (the loot window stays open over several bodies).
// Run: node --test prototypes/thousandvale/tests/D/wrapup.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { meterToggle, lootCloses, lootGoldBody } from '../../js/client/ui/pt8-core.js';
import { statusExplain, statusesNamed, statusNotes, EXPLAINED_KINDS } from '../../js/rules/status-text.js';
import { TICK_EVERY } from '../../../farhold/js/skills.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run } from '../A/helpers.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(GAME, f), 'utf8');
const STATUSES = JSON.parse(readFileSync(join(GAME, '..', 'farhold', 'data', 'skills.json'), 'utf8')).statuses;

// ---------------------------------------------------------------------------------------------------------------- #67
test('#67: /meter after closing the window with its X brings the window back; it does not switch the meter off', () => {
  assert.equal(meterToggle({ on: false, open: false }), 'on');
  assert.equal(meterToggle({ on: true, open: true }), 'off');
  assert.equal(meterToggle({ on: true, open: false }), 'show', 'still counting, window hidden: one /meter shows it');
  // walk it: on -> X -> /meter -> /meter
  let on = false, open = false;
  const cmd = () => { const a = meterToggle({ on, open }); if (a === 'on') { on = true; open = true; } else if (a === 'off') { on = false; open = false; } else open = true; };
  cmd(); assert.deepEqual([on, open], [true, true]);
  open = false;                                   // the X: hidden, still counting
  cmd(); assert.deepEqual([on, open], [true, true], 'ONE command reopens it');
  cmd(); assert.deepEqual([on, open], [false, false]);
  assert.match(src('js/client/ui/meter-window.js'), /meterToggle\(\{ on: S\.on, open: panel\.isOpen \}\)/, 'the window asks the rule');
});

// ---------------------------------------------------------------------------------------------------------------- #60
test('#60: a status named on a card is explained from the status row itself', () => {
  const curse = STATUSES.curse;
  const line = statusExplain(curse);
  assert.ok(line.startsWith(curse.name + ':'));
  for (const n of [curse.takeMore * 100, curse.slow * 100, curse.seconds]) assert.ok(line.includes(String(+n.toFixed(1))), `${n} is on the line: ${line}`);
  // the numbers are READ: move each knob to an odd value and the sentence follows
  const odd = statusExplain({ ...curse, takeMore: 0.37, slow: 0.11, seconds: 13 });
  assert.match(odd, /37% more damage/); assert.match(odd, /11% slower/); assert.match(odd, /for 13s/); assert.match(odd, /restarts the 13s/);
  const burn = statusExplain({ ...STATUSES.burn, seconds: 7 });
  assert.match(burn, /fire damage every/); assert.match(burn, /for 7s/);
  assert.equal(TICK_EVERY, 1, 'the "every second" wording is Farhold\'s tick');
  assert.equal(statusExplain(STATUSES.root), '', 'a status with nothing a number can say gets no line');
  assert.equal(statusExplain(STATUSES.might), '', 'a buff is not explained here');
});
test('#60: only whole status names in PROPERTY lines match, in the order they are named', () => {
  assert.deepEqual(statusesNamed(['Basic attack: throws one shadow bolt up to 30 m. Hits leave Cursed.'], STATUSES), ['curse']);
  assert.deepEqual(statusesNamed(['+12% spell damage to anything already burning, bleeding, poisoned, chilled or cursed'], STATUSES), ['burn', 'bleed', 'poison', 'chill', 'curse']);
  assert.deepEqual(statusesNamed(['+5% spell power (added to every fire, ice, lightning, poison, shadow, holy and arcane hit)'], STATUSES), [], '"poison" the element is not "Poisoned" the status');
  assert.deepEqual(statusesNamed(['The light burns every enemy within 10 metres'], STATUSES), []);
  assert.deepEqual(statusesNamed([], STATUSES), []);
  assert.equal(statusNotes(['Hits leave Chilled.', 'Hits leave Chilled.'], STATUSES).length, 1, 'one line a status');
  for (const id of statusesNamed([Object.values(STATUSES).map(s => s.name).join(', ')], STATUSES)) assert.ok(EXPLAINED_KINDS.includes(STATUSES[id].kind));
  // every status an element leaves on a weapon is one the card can explain or deliberately skips
  for (const id of ['burn', 'chill', 'shock', 'poison', 'curse', 'marked', 'web']) assert.ok(statusExplain(STATUSES[id]), id + ' has a line');
});
test('#60: the card prints the notes under everything else, from its property lines only', () => {
  const card = src('js/client/ui/item-card.js');
  assert.match(card, /rules\/status-text\.js/);
  assert.match(card, /statusNotes\(said, statusTable\)/);
  assert.ok(card.indexOf('ic-status') > card.indexOf('ic-compare'), 'below the comparison');
  assert.ok(!/said\.push\(item\.(lore|name|desc)\)/.test(card), 'the name, lore and description never feed it');
  assert.match(src('css/inventory.css'), /\.itemtip \.ic-status/);
});

// ---------------------------------------------------------------------------------------------------------------- #58
test('#58: a close for an id the window was drawn under closes it; gold is asked of a body that holds some', () => {
  assert.equal(lootCloses(7, new Set([5, 7]), 5), true, 'the body first clicked, emptied earlier');
  assert.equal(lootCloses(7, new Set([5, 7]), 7), true);
  assert.equal(lootCloses(7, new Set([5, 7]), 9), false, 'some other body');
  assert.equal(lootCloses(null, new Set([5]), 5), false, 'nothing open');
  assert.equal(lootGoldBody({ group: [{ id: 5, gold: 0 }, { id: 7, gold: 4 }] }, 5), 7);
  assert.equal(lootGoldBody({ group: [{ id: 5, gold: 2 }, { id: 7, gold: 4 }] }, 5), 5);
  assert.equal(lootGoldBody({}, 5), 5);
});

const rec = (W, c) => W.online.get(c.joined.you.char);
function killAt(W, c, dx, { gold = 5, items = [] } = {}) {
  const o = rec(W, c), r = o.room, e = o.entity;
  const m = r.spawn({ kind: 'monster', type: 'wolf', level: 2, x: e.x + dx, z: e.z, team: 2 });
  m.kill(e);
  r.award(e, { xp: 5, gold, items: items.map(x => ({ ...x })), from: m, reason: 'kill' });
  r.host.despawn(m, 8000);
  return m;
}
const gear = name => ({ name, rarity: 'normal', slot: 'chest', kind: 'gear', level: 2, value: 3 });
/** The client's own rule, replayed over the messages: which window is open after each one. */
function follow(box) {
  let id = null, seen = new Set(), data = null;
  for (const m of box) {
    if (m.t !== 'lootWin') continue;
    if (m.closed) { if (lootCloses(id, seen, m.id)) { id = null; seen = new Set(); data = null; } continue; }
    if (id !== m.id) { if (!(m.chest || m.group || (m.corpses && m.corpses.length > 1))) continue; if (id == null) seen = new Set(); id = m.id; }
    seen.add(m.id); data = m;
  }
  return { id, data };
}

test('#58: E by E over three bodies, the one clicked emptied first — the window closes with the last item and no take is refused', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Picker');
  const o = rec(W, a);
  W.transfer(o, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test'); await run(clock, 200);
  const box = []; for (const t of ['lootWin', 'lootR']) a.on(t, m => box.push({ ...m, t }));
  const m1 = killAt(W, a, 1, { gold: 0, items: [gear('One')] });
  killAt(W, a, -2, { gold: 3, items: [gear('Two')] });
  killAt(W, a, 2, { gold: 4, items: [gear('Three')] });
  await run(clock, 200);
  const bag0 = o.char.bag.length, g0 = o.char.gold;
  a.loot('open', { id: m1.id }); await run(clock, 100);
  let w = follow(box);
  assert.equal(w.id, m1.id); assert.equal(w.data.items.length, 3); assert.equal(w.data.gold, 7);
  // the gold row, once, as the client sends it: the clicked body holds none of it
  a.loot('take', { id: lootGoldBody(w.data, w.id), uid: 'gold' }); await run(clock, 100);
  assert.equal(o.char.gold, g0 + 7, 'one take of the gold row takes the gold of every body in the window');
  // then the selected (first) row until the window is gone — exactly what E does
  for (let i = 0; i < 6; i++) {
    w = follow(box);
    if (w.id == null) break;
    const row = w.data.items[0];
    assert.ok(row, 'an open window always has a row to take (it never sits open and empty)');
    a.loot('take', { id: row.corpse ?? w.id, uid: row.uid }); await run(clock, 100);
  }
  assert.equal(follow(box).id, null, 'the window closed with the last item');
  assert.equal(o.char.bag.length, bag0 + 3);
  assert.deepEqual(box.filter(x => x.t === 'lootR' && x.ok === false), [], 'nothing was refused');
  // the server's closing word names the id it last sent
  const wins = box.filter(x => x.t === 'lootWin');
  const closed = wins.filter(x => x.closed).pop(), last = wins.filter(x => !x.closed).pop();
  assert.equal(closed.id, last.id);
  a.close(); await srv.stop();
});

test('#58: when the window empties and another body in reach holds something, the window moves on to it', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Mover');
  const o = rec(W, a);
  W.transfer(o, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test'); await run(clock, 200);
  const box = []; for (const t of ['lootWin', 'lootR']) a.on(t, m => box.push({ ...m, t }));
  const m1 = killAt(W, a, 1, { gold: 2, items: [gear('First')] });
  await run(clock, 200);
  a.loot('open', { id: m1.id }); await run(clock, 100);
  const m2 = killAt(W, a, -1.5, { gold: 1, items: [gear('Later')] });        // falls while the window is open
  await run(clock, 200);
  a.loot('all', { id: m1.id }); await run(clock, 100);
  const w = follow(box);
  assert.equal(w.id, m2.id, 'the window now shows the other body');
  assert.deepEqual(w.data.items.map(i => i.name), ['Later']);
  a.loot('all', { id: w.id }); await run(clock, 100);
  assert.equal(follow(box).id, null, 'and closes when that is taken too');
  assert.deepEqual(box.filter(x => x.t === 'lootR' && x.ok === false), []);
  a.close(); await srv.stop();
});
