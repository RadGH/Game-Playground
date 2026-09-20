// R14 — the ambient purse: how often the world may talk, and what it may say.
//
//   "There are events that happen very frequently in the chat … They happen too often, and they
//    aren't represented on the minimap or in game very well."
//
// The module is pure, so these drive the same code the game does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbient, SaidBook, bind, compassTo, PURSE } from '../js/ambient.js';

const at = () => { let t = 0; return { now: () => t, set: v => { t = v; } }; };

test('the purse never lets the world overspend', () => {
  const clock = at();
  const a = createAmbient({ now: clock.now });
  // opens with a full purse (4 points), so two activities at 2 each and then nothing
  assert.ok(a.offer({ id: 'a', pool: 'p', poolSize: 9, tier: 'activity', text: 'one' }));
  clock.set(100);
  assert.ok(a.offer({ id: 'b', pool: 'p', poolSize: 9, tier: 'activity', text: 'two' }));
  clock.set(200);
  assert.equal(a.offer({ id: 'c', pool: 'p', poolSize: 9, tier: 'activity', text: 'three' }), null,
    'a third activity got through on an empty purse');
});

test('a minute of walking buys about two lines, and no more', () => {
  const clock = at();
  const a = createAmbient({ now: clock.now });
  a.reset();
  // spend it all
  for (let i = 0; i < 4; i++) { clock.set(i * 100); a.offer({ id: 'x' + i, tier: 'flavour', text: 'x' }); }
  assert.equal(a.points, 0);
  a.tick(60, {});
  assert.ok(a.points <= PURSE.perMinute + 1e-9, `a minute bought ${a.points} points`);
});

/** Empty the purse. A flavour line owes 20 s of quiet after it, so the clock has to move between. */
function drain(a, clock) {
  for (let i = 0; i < 8 && a.points > 0; i++) {
    clock.set(i * 25);
    a.offer({ id: 'drain' + i, tier: 'flavour', text: 'x' });
  }
}

test('nothing ambient during a fight, or underground', () => {
  const clock = at();
  const a = createAmbient({ now: clock.now });
  a.reset();
  drain(a, clock);
  a.tick(600, { fighting: true });
  assert.equal(a.points, 0, 'the purse refilled mid-fight');
  a.tick(600, { inDungeon: true });
  assert.equal(a.points, 0, 'the purse refilled underground');
  a.tick(60, {});
  assert.ok(a.points > 0);
});

test('two flavour lines never land inside twenty seconds of each other', () => {
  const clock = at();
  const a = createAmbient({ now: clock.now });
  assert.ok(a.offer({ id: 'one', tier: 'flavour', text: 'one' }));
  clock.set(5);
  assert.equal(a.offer({ id: 'two', tier: 'flavour', text: 'two' }), null, 'they came out on top of each other');
  clock.set(21);
  assert.ok(a.offer({ id: 'two', tier: 'flavour', text: 'two' }));
});

test('an exact line never appears twice in a run, even a year later', () => {
  const clock = at();
  const a = createAmbient({ now: clock.now });
  assert.ok(a.offer({ id: 'grudge', zoneId: 3, tier: 'flavour', text: 'something out there has your measure' }));
  for (let i = 1; i < 50; i++) {
    clock.set(i * 600);
    a.tick(600, {});
    assert.equal(a.offer({ id: 'grudge', zoneId: 3, tier: 'flavour', text: 'something out there has your measure' }), null,
      'the quoted line came back');
  }
  // …but the same thing happening somewhere ELSE is genuinely new
  clock.set(99999);
  assert.ok(a.offer({ id: 'grudge', zoneId: 9, tier: 'flavour', text: 'something out there has your measure' }));
});

test('the no-repeat window can never empty its own pool', () => {
  // the rule copied from lingo: window = min(size, poolSize - 1). A window that can ban everything
  // is a deadlock, and it is the kind that only shows up months later.
  const book = new SaidBook(24);
  for (let i = 0; i < 100; i++) book.mark('p', 'id' + (i % 3));
  const banned = book.window('p', 3);
  assert.ok(banned.size <= 2, `a pool of 3 had ${banned.size} banned — nothing could ever be said`);
  const pool = ['id0', 'id1', 'id2'];
  assert.ok(pool.some(id => !banned.has(id)), 'every id in the pool was banned at once');
  // a pool of one is always sayable
  assert.equal(book.window('p', 1).size, 0);
});

test('a line that names something that is not there is refused, not printed', () => {
  assert.equal(bind('{beast.name} has taken {place}', {}), null);
  assert.equal(bind('{beast.name} has taken {place}', { beast: { name: 'Moor Hound' } }), null);
  assert.equal(bind('{beast.name} has taken {place}', { beast: { name: 'Moor Hound' }, place: 'the ford' }),
    'Moor Hound has taken the ford');
  assert.equal(bind('nothing to fill'), 'nothing to fill');
  assert.equal(bind(''), null);
});

test('an unbindable line costs nothing — the purse is not spent on nonsense', () => {
  const a = createAmbient();
  const before = a.points;
  assert.equal(a.offer({ id: 'x', tier: 'zone', text: '{nobody} did {nothing}', ctx: {} }), null);
  assert.equal(a.points, before, 'a refused line still took the money');
});

test('a pay-off is never throttled — it is the consequence of what the player just did', () => {
  const clock = at();
  const a = createAmbient({ now: clock.now });
  a.reset();
  drain(a, clock);
  assert.equal(a.points, 0);
  for (let i = 0; i < 5; i++) {
    assert.ok(a.offer({ id: 'won' + i, tier: 'payoff', text: 'You got them out.' }),
      'the reward for playing an event was silenced by the chatter budget');
  }
});

test('the compass says the same eight words the minimap does', () => {
  assert.equal(compassTo(0, -10), 'N');
  assert.equal(compassTo(10, 0), 'E');
  assert.equal(compassTo(0, 10), 'S');
  assert.equal(compassTo(-10, 0), 'W');
  assert.equal(compassTo(10, -10), 'NE');
  assert.equal(compassTo(-10, 10), 'SW');
});
