// Owner feedback 7, D-UI's three asks of stream A: split / merge a consumable stack, a COMPLETE `kitsR` through the real
// gateway (also before sign-in, also from a gateway with no province beside it), and friends "unseen" kept by the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startServer } from '../../server/main.mjs';
import { loadRules, loadClasses } from '../../server/load.mjs';
import { createGateway } from '../../js/sim/gateway.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createVirtualClock } from '../../js/net/clock.js';
import { PROTOCOL_VERSION } from '../../js/net/protocol.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { makeServer, makeClient, joinAs, run, until, waitP, loadAll } from './helpers.js';
import { m3Server } from './m3-helpers.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
const potion = (n = 1) => ({ kind: 'potion', id: 'healing_potion', name: 'Healing Potion', rarity: 'normal', count: n });

test('split: n potions off a stack into a new slot; merge: drop one stack on another; a split-off stack stays apart until merged or handed over', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const srv = makeServer({ clock, store }); await srv.ready;
  const W = srv.world, a = await joinAs(srv, clock, 'Splitter');
  const o = W.online.get(a.joined.you.char);
  W.grant(o, { items: [potion(10)], reason: 'test' }); await run(clock, 100);
  const st = o.char.bag[0];
  const ir = on(a, 'itemR'), bags = on(a, 'bag');
  a.splitItem(st.uid, 3); await until(clock, () => ir.length);
  assert.equal(ir[0].ok, true, JSON.stringify(ir[0])); assert.equal(ir[0].op, 'split');
  assert.deepEqual(o.char.bag.map(i => i.count), [7, 3]);
  const made = o.char.bag.find(i => i.uid === ir[0].made);
  assert.ok(made && made.count === 3 && made.uid !== st.uid);
  assert.deepEqual(a.joined.you.bag.map(i => i.count).sort(), [3, 7], 'the client library\'s bag follows');
  assert.deepEqual(bags.at(-1).remove, [st.uid]);
  // refusals: nothing, everything, a thing that does not stack
  a.splitItem(st.uid, 0); a.splitItem(st.uid, 7); await until(clock, () => ir.length >= 3);
  assert.ok(ir.slice(1, 3).every(m => m.ok === false && m.why === 'count'));
  W.grant(o, { items: [{ name: 'Old Sword', slot: 'weapon', rarity: 'normal' }], reason: 'test' }); await run(clock, 50);
  a.splitItem(o.char.bag.at(-1).uid, 1); await until(clock, () => ir.length >= 4);
  assert.equal(ir[3].ok, false);
  // a later potion joins the main stack, not the one the player set apart; a re-login does not sweep it back either
  W.grant(o, { items: [potion(1)], reason: 'kill' }); await run(clock, 50);
  assert.deepEqual(o.char.bag.filter(i => i.id === 'healing_potion').map(i => i.count), [8, 3]);
  assert.equal(W.restack(o), false, 'left as the player arranged it');
  await W.saveNow(o); await W.flushJournal();
  assert.deepEqual(loadAll(store).find(c => c.id === o.char.id).bag.filter(i => i.id === 'healing_potion').map(i => i.count), [8, 3], 'saved as two stacks');
  // merge: drop the 3 on the 8
  ir.length = 0;
  a.mergeItem(made.uid, st.uid); await until(clock, () => ir.length);
  assert.equal(ir[0].ok, true, JSON.stringify(ir[0])); assert.equal(ir[0].moved, 3);
  assert.deepEqual(o.char.bag.filter(i => i.id === 'healing_potion').map(i => i.count), [11]);
  assert.deepEqual(a.joined.you.bag.filter(i => i.id === 'healing_potion').map(i => i.count), [11]);
  // merge into a nearly full stack moves what fits and leaves the rest
  W.grant(o, { items: [potion(9)], reason: 'test' }); await run(clock, 50);        // 20
  a.splitItem(st.uid, 5); await until(clock, () => ir.length >= 2);                 // 15 + 5
  W.grant(o, { items: [potion(4)], reason: 'test' }); await run(clock, 50);        // 19 + 5
  a.mergeItem(ir[1].made, st.uid); await until(clock, () => ir.length >= 3);
  assert.equal(ir[2].moved, 1); assert.equal(ir[2].left, 4);
  assert.deepEqual(o.char.bag.filter(i => i.id === 'healing_potion').map(i => i.count), [20, 4]);
  a.mergeItem(ir[1].made, o.char.bag.at(-1).uid); await until(clock, () => ir.length >= 4);
  assert.equal(ir[3].ok, false, 'a potion does not merge onto a sword');
  a.close(); await srv.stop();
});

/** Talk to a gateway over a real WebSocket, raw: hello, then whatever is sent. */
async function rawGateway(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/gw');
  const got = [];
  ws.on('message', d => got.push(JSON.parse(String(d))));
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, build: 'dev' }));
  const wait = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = got.find(fn); if (m) return m; await new Promise(r => setTimeout(r, 20)); } return null; };
  await wait(m => m.t === 'welcome');
  return { ws, got, wait };
}
const complete = k => k && k.armour.length === 3 && k.weapons.length >= 2 && [...k.armour, ...k.weapons].every(x => x.id && x.name && x.items.length && x.items.every(i => i.name && i.slot && i.rarity))
  && k.armour.every(a => a.items.reduce((s, i) => s + (i.armor || 0), 0) > 0) && k.weapons.every(w => w.items.some(i => i.type === 'weapon'));

test('kitsR through the REAL gateway socket, BEFORE signing in: every calling answers three armour sets and its weapon packs with real items (armour numbers, weapons)', async () => {
  const port = 19600 + Math.floor(Math.random() * 300);
  const out = process.stdout.write.bind(process.stdout); process.stdout.write = (c, ...a) => (typeof c === 'string' && c.startsWith('{"t":"') ? true : out(c, ...a));
  const S = await startServer({ port, host: '127.0.0.1', db: 'memory', build: 'dev', rules: 'auto', procs: 0, linger: 0, maxPerIp: 50, saveEvery: 60000, process: 't', env: 'dev', adminPort: 0, director: {}, unlimitedIp: [], feedbackFile: false, journalMs: 2000 });
  try {
    const g = await rawGateway(port);
    // no guest, no auth: a brand-new visitor's creation screen
    for (const cls of loadClasses()) g.ws.send(JSON.stringify({ t: 'kits', cls }));
    g.ws.send(JSON.stringify({ t: 'kits', cls: 'no_such_calling' }));
    const classes = loadClasses();
    assert.ok(await g.wait(() => g.got.filter(m => m.t === 'kitsR').length >= classes.length + 1, 8000), 'every ask is answered: ' + g.got.filter(m => m.t === 'kitsR').length);
    for (const cls of classes) {
      const r = g.got.find(m => m.t === 'kitsR' && m.cls === cls);
      assert.ok(r && r.ok && complete(r.kits), cls + ': a complete answer — ' + JSON.stringify(r && r.kits && { a: r.kits.armour.map(x => x.items.length), w: r.kits.weapons.map(x => x.items.length) }));
    }
    const none = g.got.find(m => m.t === 'kitsR' && m.cls === 'no_such_calling');
    assert.ok(none && none.ok === false && none.kits === null && none.why, 'an unknown calling is answered too, plainly');
    assert.ok(!g.got.some(m => m.t === 'kick'), 'and asking early is not "abuse"');
    g.ws.close();
  } finally { await S.stop(); process.stdout.write = out; }
});

test('kitsR from a gateway with NO province and no rules object of its own (stage 2\'s gateway process): still complete', async () => {
  const { kitsFor } = await loadRules('auto');
  const gw = createGateway({ store: createMemoryStore(), build: 'dev', classes: loadClasses(), kitsFor, log: () => {} });
  const sent = [];
  const h = gw.accept('/gw', { send: d => sent.push(JSON.parse(d)), close() {}, ip: '127.0.0.1' });
  h.message(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, build: 'dev' }));
  await new Promise(r => setTimeout(r, 20));
  h.message(JSON.stringify({ t: 'kits', cls: 'mage' }));
  await new Promise(r => setTimeout(r, 50));
  const r = sent.find(m => m.t === 'kitsR');
  assert.ok(r && r.ok && complete(r.kits), JSON.stringify(r).slice(0, 300));
  // a gateway that truly has no kits says so (the client then keeps the default gear) — never sets with empty items
  const bare = createGateway({ store: createMemoryStore(), build: 'dev', kitsFor: () => ({ armour: [{ id: 'a', name: 'A', items: [] }], weapons: [{ id: 'w', name: 'W', items: [] }] }), log: () => {} });
  const sent2 = [];
  const h2 = bare.accept('/gw', { send: d => sent2.push(JSON.parse(d)), close() {}, ip: '127.0.0.1' });
  h2.message(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, build: 'dev' }));
  await new Promise(r => setTimeout(r, 20));
  h2.message(JSON.stringify({ t: 'kits', cls: 'mage' }));
  await new Promise(r => setTimeout(r, 50));
  const r2 = sent2.find(m => m.t === 'kitsR');
  assert.deepEqual([r2.ok, r2.kits, r2.why], [false, null, 'noItems']);
});

test('friends: a new friend is UNSEEN for both sides until `seen`; it survives a reload; the one who was added hears it at once', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const ta = memoryTokenStore();
  const a = makeClient(srv, clock, { tokenStore: ta });
  await waitP(clock, a.ready);
  const ca = await waitP(clock, a.createChar({ name: 'Adder', cls: 'warrior' }));
  await waitP(clock, a.play(ca.id)); await until(clock, () => !!a.joined, 5000);
  const b = await joinAs(srv, clock, 'Added');
  const fa = on(a, 'friends'), fb = on(b, 'friends'), nb = on(b, 'friendNew');
  a.friend('add', 'Added'); await until(clock, () => fa.some(m => m.list.length === 1), 3000);
  const mine = fa.at(-1);
  assert.equal(mine.list[0].unseen, true, 'the row is marked');
  assert.deepEqual(mine.unseen.map(u => [u.name, u.kind]), [['Added', 'added']]); assert.equal(mine.unseenCount, 1);
  await until(clock, () => nb.length && fb.some(m => (m.unseen || []).length), 3000);
  assert.deepEqual([nb[0].name, nb[0].kind], ['Adder', 'addedYou'], 'told at once');
  assert.deepEqual(fb.at(-1).unseen.map(u => [u.name, u.kind]), [['Adder', 'addedYou']]);
  // a reload (a new socket, the same account): the badge is still there
  a.close(); await run(clock, 6000);
  const a2 = makeClient(srv, clock, { tokenStore: ta });
  const fa2 = on(a2, 'friends');
  await waitP(clock, a2.ready); await waitP(clock, a2.play(ca.id)); await until(clock, () => fa2.length, 5000);
  assert.equal(fa2.at(-1).unseenCount, 1, 'it survives a reload');
  // seen: gone, for good
  a2.friendsSeen(); await until(clock, () => fa2.at(-1).unseenCount === 0, 3000);
  assert.equal(fa2.at(-1).unseenCount, 0); assert.ok(!fa2.at(-1).list[0].unseen);
  assert.deepEqual(await store.getWorld('friendsUnseen:' + ca.id), []);
  // the other side clears just that one
  b.friendsSeen(ca.id); await until(clock, () => fb.at(-1).unseenCount === 0, 3000);
  assert.equal(fb.at(-1).unseenCount, 0);
  // adding the same friend again is not news
  a2.friend('add', 'Added'); await run(clock, 400);
  assert.equal(fa2.at(-1).unseenCount, 0);
  a2.close(); b.close(); await srv.stop();
});
