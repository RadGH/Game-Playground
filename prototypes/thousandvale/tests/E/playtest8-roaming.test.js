// Stream E — owner feedback 8, W5: "ox carts … sometimes travelling the road". A LIVE roaming cart, flagged down.
// The run is data (data/provinces/carts.json `roaming.runs`); the walking is stream A's js/sim/travellers.js and the
// route window is stream A's js/sim/carts.js — both pure, so this drives the real modules with E's real data and a
// room that only remembers what was spawned in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTravellers } from '../../js/sim/travellers.js';
import { createCarts } from '../../js/sim/carts.js';
import { cartFare } from '../../tools/content-towns.mjs';

const J = p => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
const CARTS = J('data/provinces/carts.json'), ROUTES = J('data/provinces/torbor_downs-routes.json'), WAND = J('data/provinces/wanderers.json'), TRAV = J('data/provinces/travellers.json'), ECON = J('data/provinces/economy.json');
const seeded = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

function fakeRoom() {
  let id = 1, ms = 0;
  const entities = new Map();
  return { entities, clients: new Map(), now: () => ms, tick: d => { ms += d; }, emit() {},
    // a body that takes any order (face, loop, say…) and remembers only where it stands
    spawn(spec) { const raw = { id: id++, ...spec, removed: false, moveTo(x, z) { raw.x = x; raw.z = z; } }; const e = new Proxy(raw, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? () => {} : undefined) }); entities.set(raw.id, e); return e; },
    remove(e) { e.removed = true; entities.delete(e.id); } };
}

test('W5: the Orrinsford run is a real road near Torborhold on which only ox carts walk', () => {
  const run = CARTS.roaming.runs[0], route = ROUTES.routes.find(r => r.id === run.route);
  assert.ok(route, 'its road is in the routes file');
  assert.deepEqual(run.only, [CARTS.roaming.kind]);
  assert.ok([route.from.name, route.to.name].includes('Torborhold'), 'it starts at the starting town');
  assert.ok(route.length >= (WAND.kinds.ox_carter.minRouteM || 0), 'long enough for the kind');
  // long enough that one is on it by night too (stream A: round(km x perRouteKm) by day, x0.4 at night)
  const perKm = WAND.rules.perRouteKm ?? TRAV.rules.perRouteKm;
  assert.ok(Math.round(Math.round(route.length / 1000 * perKm) * 0.4) >= 1 && WAND.kinds.ox_carter.night === true, 'a cart is out at night as well');
});

test('W5: a cart walking the run can be flagged down — the route window opens, priced from the town it is heading for', () => {
  const run = CARTS.roaming.runs[0], route = ROUTES.routes.find(r => r.id === run.route);
  for (const night of [false, true]) {
    const room = fakeRoom();
    const tr = createTravellers({ room, rng: seeded(11), isNight: () => night, phase: () => (night ? 'night' : 'day'),
      travel: { routes: [{ ...route, id: run.id, kinds: run.only }], kinds: { ...TRAV.kinds, ...WAND.kinds }, rules: { ...TRAV.rules, ...WAND.rules }, chatter: J('data/names/chatter.json'), names: J('data/names/torbor.json') } });
    assert.ok(tr.groups.length >= 1, 'somebody is on the run' + (night ? ' at night' : ''));
    assert.ok(tr.groups.every(g => g.kind === 'ox_carter'), 'and it is a cart');
    // a player walks up to the cart
    const g = tr.groups[0], head = g.route.line.at(g.s);
    const me = room.spawn({ kind: 'player', x: head.x + 3, z: head.z + 2, dead: false });
    for (let i = 0; i < 40 && !g.live; i++) { room.tick(200); tr.step(200); }
    assert.ok(g.live, 'its crew is standing in the world');
    const carter = g.crew[0].e;
    assert.equal(carter.data.npc.role, 'carter');
    assert.equal(carter.data.traveller.vehicle, 'ox_cart');
    assert.equal(carter.data.traveller.cart, true);
    assert.notEqual(carter.data.npc.titled, false, 'a carter for hire shows its title (W27)');
    assert.ok(Math.hypot(carter.x - me.x, carter.z - me.z) <= CARTS.rules.flagDownM, 'within flagging distance');
    // it stands still while you are at its elbow (stopNear), so the window is never walked out of reach
    const s0 = g.s; for (let i = 0; i < 60; i++) { room.tick(200); tr.step(200); }
    assert.ok(Math.abs(g.s - s0) < 3, `the cart waited for you (it moved ${Math.abs(g.s - s0).toFixed(1)} m)`);
    // flag it down
    const C = createCarts({ data: CARTS, layouts: [], online: new Map(), cartFare: m => cartFare(ECON, m) });
    const o = { char: { id: 7, level: 1, gold: 500, bag: [] }, entity: me, conn: null };
    const list = C.list(o, carter);
    assert.ok(list && list.t === 'cartList' && list.roaming === true, 'the route window opens');
    const heading = carter.data.traveller.to, from = CARTS.stops.find(s => s.id === list.from);
    assert.equal(from.town, heading, 'priced from the town it is walking to');
    assert.equal(list.stops.length, CARTS.stops.length - 1, 'every other town is on the board');
    for (const row of list.stops) { const f = CARTS.fares[from.id].find(x => x.to === row.id); assert.equal(row.fare, f.gold); assert.ok(!row.locked, row.name + ' is affordable with 500 gold'); }
    // and with empty pockets every row says why
    const poor = C.list({ ...o, char: { ...o.char, gold: 0 } }, carter);
    assert.ok(poor.stops.every(r => r.locked && r.why === 'gold' && /gold/.test(r.msg)));
    // …unless you hold the quest's token
    const tok = C.list({ ...o, char: { ...o.char, gold: 0, bag: [{ id: 'cart_token', count: 1 }] } }, carter);
    assert.ok(tok.tokens === 1 && tok.stops.every(r => !r.locked));
  }
});
