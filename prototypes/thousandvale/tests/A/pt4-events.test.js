// Play-test 4 S5 + S9 (streams A + E) on the REAL world: random road events (treasure chests opened in the corpse
// loot window; delivery / escort / rescue quests that pay themselves) and the wanderers on the roads (a pedlar with a
// real shop who stands still while you shop, errand runners who hand out deliveries, storytellers with a tip).
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };

/** A quiet spot in the wilds of copy 0: a low-level camp's surroundings, outside every town. */
function wildSpot(world) {
  const pv = world.P.values().next().value, L = pv.L;
  const t0 = L.towns[0];
  const camps = L.camps.filter(c => c.type && !c.encounter && (c.level || 1) <= 4 && !L.towns.some(t => Math.hypot(t.x - c.x, t.z - c.z) < (t.r || 40) + 120))
    .sort((a, b) => Math.hypot(a.x - t0.x, a.z - t0.z) - Math.hypot(b.x - t0.x, b.z - t0.z));
  const c = camps[0];
  return { pv, L, room: pv.copies[0], at: { x: c.x + 60, z: c.z + 60 } };
}
async function intoWilds(world, clock, c, at) {
  const o = rec(world, c);
  const { room } = wildSpot(world);
  world.transfer(o, room, at, 'test'); await run(clock, 400);
  o.roadNextAt = Infinity;                                       // no surprise events while a test drives one by hand
  return o;
}
const clearGuards = ev => { for (const m of ev.guards) if (!m.removed) ev.room.remove(m); };
const tp = (o, x, z) => o.entity.moveTo(x, z, undefined, true);
async function walkTo(clock, o, ev, x, z, stepM = 6) {
  for (let k = 0; k < 4000; k++) {
    const e = o.entity, d = Math.hypot(x - e.x, z - e.z);
    if (d < 2) break;
    const s = Math.min(stepM, d);
    tp(o, e.x + (x - e.x) / d * s, e.z + (z - e.z) / d * s);
    clearGuards(ev);                                             // ambushers: this test is about the escort, not the fight
    if (o.entity.dead) o.entity.revive(1);
    await run(clock, 200);
    if (ev.done) break;
  }
}

test('S5: road events drop near a lone player in the wilds on their own, every few minutes', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Wanderer', 'warrior');
  const { room, at } = wildSpot(world);
  const o = rec(world, a);
  world.transfer(o, room, at, 'test'); await run(clock, 400);
  o.roadNextAt = 0;
  const before = world.roadEvents.events.size;
  await run(clock, 100000);
  const mine = [...world.roadEvents.events.values()].filter(ev => !ev.virtual && ev.room === room);
  assert.ok(mine.length > before, 'an event was dropped');
  for (const ev of mine) assert.ok(Math.hypot(ev.x - o.entity.x, ev.z - o.entity.z) < 300, 'near the player');
  a.close(); await srv.stop();
});

test('S5: a treasure chest opens in the corpse loot window once its guards are down, gives its loot, then packs up', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Chestfinder', 'warrior');
  const { at } = wildSpot(world);
  const o = await intoWilds(world, clock, a, at);
  const R = world.roadEvents;
  let ev = null;
  for (let k = 0; k < 40 && !(ev && ev.guards.length); k++) { if (ev) R.end(ev); ev = R.spawnFor(o, 'chest'); }
  assert.ok(ev && ev.chest, 'a chest event');
  assert.equal(ev.chest.kind, 'object'); assert.equal(ev.chest.type, 'chest');
  assert.ok(ev.chest.info().name, 'named');
  const got = box(a, ['used', 'lootWin', 'lootable', 'bag']);
  tp(o, ev.chest.x + 1.5, ev.chest.z); await run(clock, 300);
  if (ev.guards.length) {
    a.use(ev.chest.id); await run(clock, 300);
    assert.ok(got.some(m => m.t === 'used' && m.ok === false && m.why === 'guarded'), 'shut while guarded');
    clearGuards(ev);
  }
  a.use(ev.chest.id); await run(clock, 400);
  assert.ok(got.some(m => m.t === 'used' && m.ok && m.kind === 'chest' && m.loot), 'opened');
  const win = got.find(m => m.t === 'lootWin' && m.id === ev.chest.id && !m.closed);
  assert.ok(win && (win.gold > 0 || win.items.length), 'the corpse loot window, with loot: ' + JSON.stringify(win).slice(0, 200));
  const bag0 = o.char.bag.length, g0 = o.char.gold;
  a.loot('all', { id: ev.chest.id }); await run(clock, 400);
  assert.equal(o.char.bag.length, bag0 + win.items.length, 'items into the bag');
  assert.equal(o.char.gold, g0 + win.gold, 'gold');
  // a second open finds nothing for you
  a.use(ev.chest.id); await run(clock, 300);
  await run(clock, 7000);
  assert.ok(ev.chest.removed, 'the emptied chest packs itself up');
  assert.ok(!R.events.has(ev.id));
  a.close(); await srv.stop();
});

test('S5: a delivery — the courier hands over a parcel, the named town NPC takes it, the quest pays itself', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Postie', 'ranger');
  const { pv, at } = wildSpot(world);
  const o = await intoWilds(world, clock, a, at);
  const ev = world.roadEvents.spawnFor(o, 'deliver');
  assert.ok(ev && ev.npc && ev.target, 'a courier with a target');
  const got = box(a, ['used', 'questR', 'quests', 'bag']);
  tp(o, ev.npc.x + 1.5, ev.npc.z); await run(clock, 300);
  a.use(ev.npc.id); await run(clock, 300);
  const used = got.find(m => m.t === 'used' && m.id === ev.npc.id);
  assert.ok(used && used.offers && used.offers.length === 1, 'offers a quest: ' + JSON.stringify(used).slice(0, 300));
  const q = used.offers[0];
  assert.match(q.steps[0].text, new RegExp(ev.target.name));
  assert.ok(q.steps[0].at, 'a marker');
  a.quest('accept', q.id, ev.npc.id); await run(clock, 300);
  assert.ok(o.char.quests.active[q.id], 'on the quest');
  const parcel = o.char.bag.find(it => it.quest === q.id);
  assert.ok(parcel, 'the parcel is in the bag');
  // to the town, to the named NPC
  const townRoom = pv.towns.find(r => r.name === ev.target.town);
  const npc = [...townRoom.objects.values()].find(n => n.name === ev.target.name && n.data && n.data.npc && n.data.npc.role === ev.target.role);
  assert.ok(npc, 'the recipient exists');
  world.transfer(o, townRoom, { x: npc.x + 1.5, z: npc.z }, 'test'); await run(clock, 500);
  const g0 = o.char.gold;
  a.use(npc.id); await run(clock, 500);
  assert.ok(!o.char.quests.active[q.id], 'done');
  assert.ok(!o.char.bag.some(it => it.quest === q.id), 'parcel handed over');
  assert.ok(got.some(m => m.t === 'questR' && m.op === 'turnin' && m.id === q.id && m.auto && m.ok), 'paid without walking back');
  assert.ok(o.char.gold > g0, 'gold');
  a.close(); await srv.stop();
});

test('S5: an escort follows you to the town (ambushes on the way) and the quest completes', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Escorter', 'warrior');
  const { at } = wildSpot(world);
  const o = await intoWilds(world, clock, a, at);
  const ev = world.roadEvents.spawnFor(o, 'escort');
  assert.ok(ev && ev.npc && ev.town, 'an escort event');
  const got = box(a, ['used', 'questR']);
  tp(o, ev.npc.x + 1.5, ev.npc.z); await run(clock, 300);
  a.use(ev.npc.id); await run(clock, 300);
  const q = got.find(m => m.t === 'used' && m.offers).offers[0];
  a.quest('accept', q.id, ev.npc.id); await run(clock, 300);
  assert.equal(ev.follow, o.char.id, 'following');
  const ambush0 = world.counters.roadAmbush || 0;
  await walkTo(clock, o, ev, ev.town.x, ev.town.z);
  await run(clock, 1500);
  assert.ok(ev.done, 'arrived');
  assert.ok((world.counters.roadAmbush || 0) > ambush0 || Math.hypot(at.x - ev.town.x, at.z - ev.town.z) < 400, 'ambushed on a long walk');
  assert.ok(got.some(m => m.t === 'questR' && m.id === q.id && m.auto && m.ok), 'paid');
  a.close(); await srv.stop();
});

test('S5: a rescue — guards first, then free the captive, then bring them home', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Rescuer', 'warrior');
  const { at } = wildSpot(world);
  const o = await intoWilds(world, clock, a, at);
  const ev = world.roadEvents.spawnFor(o, 'rescue');
  assert.ok(ev && ev.npc && ev.guards.length >= 2, 'a guarded captive');
  const got = box(a, ['used', 'questR', 'quests']);
  tp(o, ev.npc.x + 1.5, ev.npc.z); await run(clock, 300);
  a.use(ev.npc.id); await run(clock, 300);
  const q = got.find(m => m.t === 'used' && m.offers).offers[0];
  assert.equal(q.steps.length, 2);
  a.quest('accept', q.id, ev.npc.id); await run(clock, 300);
  assert.ok(!ev.freed, 'not while the guards stand');
  clearGuards(ev);
  a.use(ev.npc.id); await run(clock, 300);
  assert.ok(ev.freed, 'freed');
  assert.equal(o.char.quests.active[q.id].step, 1, 'step 1 done');
  await walkTo(clock, o, ev, ev.town.x, ev.town.z);
  await run(clock, 1500);
  assert.ok(got.some(m => m.t === 'questR' && m.id === q.id && m.auto && m.ok), 'home and paid');
  a.close(); await srv.stop();
});

test('S9: wanderers on the roads — a pedlar sells real items and stands still while you shop; errand runners offer deliveries; storytellers tip', async () => {
  // midday (the realm clock starts at midnight on boot, and most wanderers walk by day)
  let shift = 0;
  const { srv, clock, world } = await realServer({ wallNow: () => Date.now() + shift });
  shift = 0.45 * 2 * 3600000;
  const a = await joinReal(srv, clock, 'Roadwalker', 'warrior');
  const { pv, room, at } = wildSpot(world);
  const o = await intoWilds(world, clock, a, at);
  await run(clock, 500);
  const tr = room.travellers;
  assert.ok(tr, 'the roads run');
  const kinds = new Set(tr.groups.map(g => g.kind));
  for (const k of ['pedlar', 'errand_runner', 'storyteller']) assert.ok(tr.groups.some(g => g.kind === k), 'a ' + k + ' on the roads: ' + [...kinds]);
  const wand = tr.groups.filter(g => ['pedlar', 'rag_and_bone', 'errand_runner', 'worried_parent', 'storyteller', 'hedge_scholar', 'retired_soldier'].includes(g.kind)).length;
  assert.ok(wand / tr.groups.length > 0.25, 'wanderers are a good share of the road: ' + wand + '/' + tr.groups.length);
  const roadKm = pv.L.travel.routes.reduce((s, r) => s + (r.length || 0), 0) / 1000;
  assert.ok(tr.groups.length / roadKm >= 1, 'about one group per km of road or better: ' + tr.groups.length + ' / ' + Math.round(roadKm) + ' km');
  const got = box(a, ['used', 'shopView', 'questR']);
  async function meet(kind) {
    const g = tr.groups.find(x => x.kind === kind && x.route.line.length > 200 && x.s > 30 && x.s < x.route.line.length - 30);
    const p = g.route.line.at(g.s);
    tp(o, p.x, p.z); await run(clock, 1200);
    const lead = g.crew[0].e;
    assert.ok(lead && !lead.removed, kind + ' materialised');
    tp(o, lead.x + 1.5, lead.z); await run(clock, 600);
    return { g, lead };
  }
  // the pedlar
  const { g, lead } = await meet('pedlar');
  assert.equal(lead.data.npc.shop, 'pedlar');
  const s0 = g.s;
  a.shop('open', { npc: lead.id }); await run(clock, 300);
  const v = got.find(m => m.t === 'shopView' && m.npc === lead.id);
  assert.ok(v && v.stock.length >= 5, 'a stocked pack');
  assert.ok(v.stock.every(r => r.mount || (r.item && r.item.name && r.item.name !== r.label)), 'real named items');
  await run(clock, 4000);
  assert.equal(g.s, s0, 'stood still while we shopped');
  const row = v.stock.find(r => r.cat === 'weapon');
  o.char.gold = 1000; const b0 = o.char.bag.length;
  a.shop('buy', { npc: lead.id, id: row.id }); await run(clock, 300);
  assert.equal(o.char.bag.length, b0 + 1, 'bought from the pedlar');
  // walk away: they move on
  tp(o, lead.x + 40, lead.z + 40); await run(clock, 4000);
  assert.notEqual(g.s, s0, 'walks on once we leave');
  // an errand runner
  const er = await meet('errand_runner');
  a.use(er.lead.id); await run(clock, 300);
  const used = got.filter(m => m.t === 'used' && m.id === er.lead.id).pop();
  assert.ok(used && used.offers && used.offers.length, 'an errand runner offers a delivery: ' + JSON.stringify(used).slice(0, 200));
  a.quest('accept', used.offers[0].id, er.lead.id); await run(clock, 300);
  assert.ok(o.char.bag.some(it => it.quest === used.offers[0].id), 'a letter to carry');
  // a storyteller: lore every time, a tip once
  const st = await meet('storyteller');
  a.use(st.lead.id); await run(clock, 300);
  const u1 = got.filter(m => m.t === 'used' && m.id === st.lead.id).pop();
  assert.ok(u1.road && (u1.road.tip || u1.road.lore), 'lore / a tip');
  assert.ok(u1.road.tip, 'a tip the first time: ' + JSON.stringify(u1.road));
  a.use(st.lead.id); await run(clock, 300);
  const u2 = got.filter(m => m.t === 'used' && m.id === st.lead.id).pop();
  assert.ok(u2.road && u2.road.lore && !u2.road.tip, 'only once');
  a.close(); await srv.stop();
});
