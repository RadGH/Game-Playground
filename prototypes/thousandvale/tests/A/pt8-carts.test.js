// Owner feedback 8, W5 (report #26: "ox carts at towns, and sometimes travelling the road, that act as PAID fast travel
// to other towns") on the REAL world with stream E's carts.json: a carter and a parked cart stand by Torborhold's gate,
// either opens the route list (fares from E's table, ride seconds, what you cannot afford marked), `cart go` takes the
// fare, holds you on the cart for the ride and puts you down beside the other town's cart; a token pays one fare; the
// quest step `ride` is credited; a fight, an empty purse or standing too far refuses in a sentence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';
import { cartFare } from '../../js/sim/economy-knobs.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push({ ...m, t })); return b; };
const findIn = (world, pred) => { for (const pv of world.P.values()) for (const r of [...pv.towns, ...pv.copies]) for (const x of r.objects.values()) if (pred(x)) return { x, r }; return null; };

test('W5: the cart by the gate — list, fare, ride, arrival beside the other town\'s cart; refusals in sentences; a token rides free', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Rider', 'warrior');
  const o = rec(world, a), C = world.carts;
  assert.ok(C.stops.size >= 10, 'E\'s stops are loaded: ' + C.stops.size);
  const cart = findIn(world, x => x.data && x.data.cart && x.data.cart.stop === 'cart_torborhold');
  const carter = findIn(world, x => x.data && x.data.npc && x.data.npc.role === 'carter' && x.data.npc.cart === 'cart_torborhold');
  assert.ok(cart && carter, 'Torborhold has a parked cart and a carter');
  assert.equal(cart.x.info().type, 'cart'); assert.equal(cart.x.info().vehicle, 'ox_cart'); assert.equal(cart.x.info().cart, 'cart_torborhold');
  assert.ok(carter.x.info().title, 'the carter is titled (W27): ' + JSON.stringify(carter.x.info().title));
  const got = box(a, ['used', 'cartList', 'cartR', 'cartRide', 'bag', 'joined']);
  // too far: no list
  world.transfer(o, cart.r, { x: cart.x.x + 30, z: cart.x.z }, 'test'); await run(clock, 300);
  a.cart('list', rec(world, a).room.objects.get(cart.x.id) ? cart.x.id : cart.x.id); await run(clock, 200);
  assert.equal(got.filter(m => m.t === 'cartR').at(-1).why, 'far');
  // walk up, use the CART: the list
  world.transfer(rec(world, a), cart.r, { x: cart.x.x + 2, z: cart.x.z }, 'test'); await run(clock, 300);
  rec(world, a).char.gold = 5; 
  a.use(cart.x.id); await run(clock, 300);
  assert.ok(got.some(m => m.t === 'used' && m.ok && m.kind === 'cart'));
  let list = got.filter(m => m.t === 'cartList').at(-1);
  assert.equal(list.from, 'cart_torborhold'); assert.equal(list.name, 'Torborhold'); assert.equal(list.gold, 5);
  assert.ok(list.stops.length >= 5, 'towns to ride to: ' + list.stops.length);
  for (const st of list.stops) {
    assert.ok(st.id && st.name && st.fare >= 4 && st.m > 0 && st.s >= C.R.minRideSec && st.s <= C.R.maxRideSec, JSON.stringify(st));
    assert.equal(st.fare, cartFare(st.m), 'the fare is the economy knob over E\'s road metres: ' + st.name);
    if (st.fare > 5) { assert.equal(st.locked, true); assert.equal(st.why, 'gold'); assert.ok(st.msg.includes(String(st.fare))); }
  }
  assert.ok(list.stops.every((st, i) => !i || st.m >= list.stops[i - 1].m), 'nearest first');
  // the carter answers as an NPC, and the same list follows
  world.transfer(rec(world, a), carter.r, { x: carter.x.x + 1, z: carter.x.z + 1 }, 'test'); await run(clock, 300);
  a.use(carter.x.id); await run(clock, 300);
  assert.ok(got.some(m => m.t === 'used' && m.ok && m.kind === 'npc' && m.id === carter.x.id));
  assert.equal(got.filter(m => m.t === 'cartList').at(-1).id, carter.x.id);
  world.transfer(rec(world, a), cart.r, { x: cart.x.x + 2, z: cart.x.z }, 'test'); await run(clock, 300);
  // cannot pay
  const dear = list.stops.find(st => st.fare > 5);
  a.cart('go', cart.x.id, dear.id); await run(clock, 200);
  let r = got.filter(m => m.t === 'cartR').at(-1);
  assert.equal(r.ok, false); assert.equal(r.why, 'gold'); assert.ok(r.msg.includes(String(dear.fare)) && r.msg.includes(dear.name), r.msg);
  // to where you stand, to nowhere
  a.cart('go', cart.x.id, 'cart_torborhold'); await run(clock, 200);
  assert.equal(got.filter(m => m.t === 'cartR').at(-1).why, 'same');
  a.cart('go', cart.x.id, 'cart_atlantis'); await run(clock, 200);
  assert.equal(got.filter(m => m.t === 'cartR').at(-1).why, 'stop');
  // pay and ride
  const o1 = rec(world, a); o1.char.gold = 200;
  const dest = list.stops[0];
  const j0 = got.filter(m => m.t === 'joined').length;
  a.cart('go', cart.x.id, dest.id); await run(clock, 200);
  r = got.filter(m => m.t === 'cartR').at(-1);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.fare, dest.fare);
  assert.equal(o1.char.gold, 200 - dest.fare, 'the fare is taken');
  const ride = got.find(m => m.t === 'cartRide');
  assert.equal(ride.to.id, dest.id); assert.equal(ride.to.name, dest.name); assert.equal(ride.ms, dest.s * 1000); assert.equal(ride.fare, dest.fare); assert.equal(ride.from.name, 'Torborhold');
  // held on the cart: steps do nothing
  const x0 = o1.entity.x;
  for (let k = 0; k < 6; k++) { a.input({ s: 500 + k, dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 }); await run(clock, 50); }
  assert.ok(Math.abs(o1.entity.x - x0) < 0.05, 'you sit still on the cart');
  a.cart('go', cart.x.id, list.stops[1].id); await run(clock, 100);
  assert.equal(got.filter(m => m.t === 'cartR').at(-1).why, 'busy', 'one ride at a time');
  // arrival
  await until(clock, () => got.filter(m => m.t === 'joined').length > j0 || got.some(m => m.t === 'cartR' && m.op === 'arrive'), dest.s * 1000 + 3000);
  await run(clock, 500);
  const o2 = rec(world, a), at = C.place(dest.id);
  assert.ok(Math.hypot(o2.entity.x - at.x, o2.entity.z - at.z) < 6, 'beside the other town\'s cart: ' + Math.round(Math.hypot(o2.entity.x - at.x, o2.entity.z - at.z)) + ' m');
  assert.ok(!o2.entity.held, 'free to walk again');
  assert.ok(got.some(m => m.t === 'cartR' && m.op === 'arrive' && m.ok && m.name === dest.name));
  const there = findIn(world, x => x.data && x.data.cart && x.data.cart.stop === dest.id);
  assert.ok(there && Math.hypot(there.x.x - o2.entity.x, there.x.z - o2.entity.z) < 8, 'the parked cart of ' + dest.name + ' is right there');
  // back with a token: free, the token is used up
  const tok = world.shops.goodOf('cart_token');
  assert.ok(tok, 'E\'s cart_token good exists');
  world.grant(o2, { items: [tok], gold: 0, reason: 'test' }); await run(clock, 100);
  o2.char.gold = 0;
  world.transfer(o2, there.r, { x: there.x.x + 2, z: there.x.z }, 'test'); await run(clock, 300);
  a.cart('list', there.x.id); await run(clock, 200);
  list = got.filter(m => m.t === 'cartList').at(-1);
  assert.equal(list.tokens, 1); assert.ok(list.stops.every(st => !st.locked), 'a token opens every stop');
  a.cart('go', there.x.id, 'cart_torborhold'); await run(clock, 200);
  r = got.filter(m => m.t === 'cartR').at(-1);
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.token, true); assert.equal(r.fare, 0);
  assert.equal(C.tokensOf(rec(world, a).char), 0, 'the token is spent');
  await run(clock, 16000);
  const home = C.place('cart_torborhold');
  assert.ok(Math.hypot(rec(world, a).entity.x - home.x, rec(world, a).entity.z - home.z) < 6, 'home again');
  a.close(); await srv.stop();
});

test('W5: the quest step `ride` is credited when the cart arrives; a ride called off by death pays the fare back', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Ridertwo', 'warrior');
  const o = rec(world, a), C = world.carts;
  const cart = findIn(world, x => x.data && x.data.cart && x.data.cart.stop === 'cart_torborhold');
  world.transfer(o, cart.r, { x: cart.x.x + 2, z: cart.x.z }, 'test'); await run(clock, 300);
  const got = box(a, ['cartList', 'cartR']);
  a.cart('list', cart.x.id); await run(clock, 200);
  const dest = got.at(-1).stops[0];
  // a book-level check of the step kind (no quest in the data needs to exist for the rule to hold)
  const b = world.P.values().next().value.book;
  const def = { id: 'test_ride', name: 'Wheels', level: 1, steps: [{ kind: 'ride', to: dest.id, count: 1, text: 'Ride to ' + dest.name }], reward: {} };
  b.defs.set(def.id, def);
  rec(world, a).char.quests.active[def.id] = { step: 0, n: 0 };
  rec(world, a).char.gold = 100;
  a.cart('go', cart.x.id, dest.id); await run(clock, dest.s * 1000 + 1500);
  const q = rec(world, a).char.quests;
  assert.ok(q.done[def.id] || (q.active[def.id] && q.active[def.id].step === 1), 'the ride step counted: ' + JSON.stringify(q.active[def.id] || 'done'));
  // die on the cart: called off, fare back
  const there = findIn(world, x => x.data && x.data.cart && x.data.cart.stop === dest.id);
  const o2 = rec(world, a);
  world.transfer(o2, there.r, { x: there.x.x + 2, z: there.x.z }, 'test'); await run(clock, 300);
  const g0 = rec(world, a).char.gold;
  a.cart('go', there.x.id, 'cart_torborhold'); await run(clock, 300);
  assert.ok(rec(world, a).char.gold < g0, 'paid');
  rec(world, a).entity.kill(null);
  await run(clock, 16000);
  assert.equal(rec(world, a).char.gold, g0, 'the fare came back');
  assert.equal(got.filter(m => m.op === 'arrive').at(-1).ok, false);
  assert.ok(Math.hypot(rec(world, a).entity.x - there.x.x, rec(world, a).entity.z - there.x.z) < 40, 'and you did not travel');
  void C;
  a.close(); await srv.stop();
});
