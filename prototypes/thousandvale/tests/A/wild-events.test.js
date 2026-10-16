// The six wild events (owner 2026-10-16: "add more events … the world should be more alive, and more dangerous"):
// js/sim/wild-events.js on the REAL province. Each is an ordinary event run — the tracker card (`eventTrack`), the map pin
// (`zoneEvent start` with its spot), the result line (`eventDone`) and a personal reward for whoever took part.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

let shared = null;
// the director is quieted for this file (each test starts the event it is about; the ambush test turns its own rule up)
const server = async () => {
  if (shared) return shared;
  shared = await realServer({ runSeed: 33, roadEvents: false });
  const E = shared.world.P.get('torbor_downs').L.packs.events;
  E.nightraid.villageM = 0; E.rift.chancePerMin = 0; E.ambush.chancePer10s = 0; E.caravan.chancePer10s = 0; E.warmarch.everyMin = [1e6, 1e6]; E.bounty.everyMin = [1e6, 1e6];
  return shared;
};
test.after(async () => { if (shared) await shared.srv.stop(); });
const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push({ ...m, t })); return b; };
const hit = (room, p, m, n = 10) => room.event({ type: 'hit', kind: 'dmg', s: p.id, d: m.id, n });
function slay(room, m) { room.rules.room.run(() => { const u = m.r && m.r.unit; if (!u) return; u.dmg = [0, 0]; u.hp = 0; room.rules.room.field.kill(u); }); }
const quiet = (room, x, z, r = 260, keep = new Set()) => { for (const m of [...room.entities.values()]) if (m.kind === 'monster' && !keep.has(m) && !(m.data && m.data.event) && Math.hypot(m.x - x, m.z - z) < r) room.remove(m); };

/** A level-6 character out on a road in a level 4+ zone, far from towns; the copy's packs moved off (so only the event fights). */
async function onTheRoad(name, cls = 'warrior') {
  const { srv, clock, world } = await server();
  const c = await joinReal(srv, clock, name, cls);
  const pv = world.P.get('torbor_downs'), room = pv.copies[0];
  const WE = world.wildEvents();
  const g = WE.groundOf(pv);
  const used = new Set([...WE.live.values()].map(l => Math.round(l.run.at.x / 400) + ':' + Math.round(l.run.at.z / 400)));
  let at = null;
  const arenas = pv.L.zoneEvents || [];
  for (const rt of g.routes) { for (const p of rt.pts) if (g.townDist(p.x, p.z) > 450 && g.band(p.x, p.z)[0] >= 4 && arenas.every(a => Math.hypot(a.x - p.x, a.z - p.z) > 450) && !used.has(Math.round(p.x / 400) + ':' + Math.round(p.z / 400)) && [...WE.live.values()].every(l => Math.hypot(l.run.at.x - p.x, l.run.at.z - p.z) > 600)) { at = p; break; } if (at) break; }
  world.transfer(rec(world, c), room, { x: at.x, z: at.z }, 'test'); await run(clock, 400);
  const o = rec(world, c); o.roadNextAt = Infinity;
  o.char.level = 6; o.entity.setLevel(6);
  if (room.packs) for (const pk of room.packs.packs) if (!pk.event && Math.hypot(pk.route.line.at(pk.s).x - at.x, pk.route.line.at(pk.s).z - at.z) < 500) { room.packs.park(pk); pk.gone = true; pk.respawnAt = Infinity; }
  quiet(room, at.x, at.z);
  return { world, clock, room, pv, WE, g, o, c };
}
const trackOf = (msgs, name) => msgs.filter(m => m.t === 'eventTrack' && m.name === name);

test('ambush: on a road away from towns a crew springs from the brush on BOTH sides; beat both waves and you are paid', async () => {
  const { clock, room, pv, WE, o, c } = await onTheRoad('Roadwalker');
  const msgs = box(c, ['zoneEvent', 'eventTrack', 'eventDone', 'chat']);
  // the director's rule: a player on a road, not in a fight, no other event near — at chance 1 it starts within 10 s
  const E = pv.L.packs.events.ambush, was = E.chancePer10s; E.chancePer10s = 1;
  o.entity.face(0);
  await run(clock, 11000);
  E.chancePer10s = was;
  const l = [...WE.live.values()].find(x => x.kind === 'ambush' && x.room === room && Math.hypot(x.run.at.x - o.entity.x, x.run.at.z - o.entity.z) < 40);
  assert.ok(l, 'an ambush started round the walker');
  const r = l.run;
  assert.ok(msgs.some(m => m.t === 'zoneEvent' && m.kind === 'start' && m.ev.name === r.ev.name && Number.isFinite(m.ev.x)), 'a start line with its spot (the map pin)');
  assert.ok(msgs.some(m => m.t === 'chat' && /Ambush!/.test(m.text)), 'and an announcement in plain words');
  await run(clock, 1200);
  const card = trackOf(msgs, r.ev.name).at(-1);
  assert.ok(card && card.objective && /Defeat the/.test(card.objective.text) && card.objective.of >= 4, 'the tracker card says what to do: ' + JSON.stringify(card && card.objective));
  const side = ms => Math.atan2([...ms].reduce((a, m) => a + m.z, 0) / ms.length - r.at.z, [...ms].reduce((a, m) => a + m.x, 0) / ms.length - r.at.x);
  const w1 = [...r.spawned].filter(m => m.kind === 'monster');
  const a1 = side(w1);
  for (const m of w1) { hit(room, o.entity, m); slay(room, m); }
  await run(clock, 4000);
  const w2 = [...r.spawned].filter(m => m.kind === 'monster' && !m.dead);
  assert.ok(w2.length >= 3, 'the second wave came');
  const d = Math.abs(((side(w2) - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  assert.ok(d > 2, `from the other side of the road (${(d * 57).toFixed(0)} degrees round)`);
  assert.ok(w2.some(m => m.rank === 'champion'), 'with its leader');
  for (const m of w2) { hit(room, o.entity, m); slay(room, m); }
  await run(clock, 2500);
  const done = msgs.find(m => m.t === 'eventDone' && m.name === r.ev.name);
  assert.ok(done && done.result === 'success' && done.credited && done.xp > 0 && done.items.length >= 1, 'won and paid: ' + JSON.stringify(done));
  // nobody is ambushed twice in a row: 15 minutes before the same walker can be again, however the dice fall
  const before = shared.world.counters.wild_ambush || 0;
  E.chancePer10s = 1; await run(clock, 21000); E.chancePer10s = was;
  assert.equal(shared.world.counters.wild_ambush || 0, before, 'no second ambush for the same walker');
  c.close();
});

test('caravan: a wagon ahead is under attack; its attackers go for the crew; lose the drover and it is lost, save it and you are paid', async () => {
  const { clock, room, WE, o, c } = await onTheRoad('Wagonhand');
  const msgs = box(c, ['eventDone', 'zoneEvent']);
  const says = []; c.on('ev', ({ e }) => { for (const ev of e || []) if ((ev.type || ev.t) === 'say') says.push(ev.text); });
  let r = WE.start('caravan', room, o);
  assert.ok(r, 'it starts ahead of you on the road');
  await run(clock, 1500);
  const crew = [...r.spawned].filter(e => e.kind === 'npc');
  const drover = crew.find(e => e.data.traveller && e.data.traveller.cart);
  assert.ok(drover && crew.length === 4 && drover.r.unit && drover.r.unit.maxHp > crew.find(e => e !== drover).r.unit.maxHp, 'a drover (tougher) and three guards, who fight');
  assert.equal(drover.info().vehicle, 'ox_cart', 'with the wagon drawn beside him');
  const foes = [...r.spawned].filter(e => e.kind === 'monster');
  assert.ok(foes.length >= 4 && foes.every(m => [...(m.r.unit.threat || new Map()).keys()].some(id => crew.some(n => n.id === id))), 'the attackers are after the crew');
  // the drover goes down: the caravan is lost
  room.rules.room.run(() => { drover.r.unit.hp = 0; });
  await run(clock, 2000);
  assert.ok(msgs.some(m => m.t === 'eventDone' && m.name === r.ev.name && m.result === 'fail'), 'lost with its drover');
  // another: save it
  quiet(room, o.entity.x, o.entity.z);
  r = WE.start('caravan', room, o);
  assert.ok(r);
  for (let k = 0; k < 2; k++) { await run(clock, 3500); for (const m of [...r.spawned].filter(e => e.kind === 'monster' && !e.dead)) { hit(room, o.entity, m); slay(room, m); } }
  await run(clock, 4000);
  const done = msgs.filter(m => m.t === 'eventDone' && m.name === r.ev.name).at(-1);
  assert.ok(done && done.result === 'success' && done.credited, 'saved and paid: ' + JSON.stringify(done));
  assert.ok(says.some(t => /saved my wagon/i.test(t)), 'and the drover thanks you');
  c.close();
});

test('night raid: at night raiders close on a village from three sides, its militia fight beside you; beat every party', async () => {
  const { clock, room, WE, g, o, c } = await onTheRoad('Nightwatch');
  const msgs = box(c, ['eventDone', 'eventTrack']);
  const v = g.villages.slice().sort((a, b) => Math.hypot(a.x - o.entity.x, a.z - o.entity.z) - Math.hypot(b.x - o.entity.x, b.z - o.entity.z))[0];
  o.entity.moveTo(v.x + 20, v.z, undefined, true); quiet(room, v.x, v.z, 300);
  const r = WE.start('nightraid', room, o, v.name);
  assert.ok(r && new RegExp(v.name).test(r.ev.name), 'a raid on ' + v.name);
  await run(clock, 1500);
  const militia = [...r.spawned].filter(e => e.kind === 'npc');
  assert.equal(militia.length, 3, 'three militia turn out'); assert.ok(militia.every(e => e.data.fighter && e.r.unit), 'and fight');
  const sides = [];
  for (let k = 0; k < 3; k++) {
    const party = [...r.spawned].filter(e => e.kind === 'monster' && !e.dead);
    assert.ok(party.length >= 3, `raiding party ${k + 1} is coming`);
    const cx = party.reduce((a, m) => a + m.x, 0) / party.length, cz = party.reduce((a, m) => a + m.z, 0) / party.length;
    sides.push(Math.atan2(cz - v.z, cx - v.x));
    for (const m of party) { hit(room, o.entity, m); slay(room, m); }
    await run(clock, 26000);
  }
  const spread = [Math.abs(sides[0] - sides[1]), Math.abs(sides[1] - sides[2]), Math.abs(sides[0] - sides[2])].map(d => Math.min(d, Math.PI * 2 - d));
  assert.ok(spread.every(d => d > 1.2), 'from three different sides: ' + spread.map(d => Math.round(d * 57)).join(', '));
  const done = msgs.find(m => m.t === 'eventDone' && m.name === r.ev.name);
  assert.ok(done && done.result === 'success' && done.credited, 'the village holds: ' + JSON.stringify(done));
  c.close();
});

test('rift: it spits waves; when one is down it falters and a touch sets a seal; three seals (the third behind its warden) close it', async () => {
  const { clock, room, WE, o, c } = await onTheRoad('Sealer', 'mage');
  const msgs = box(c, ['eventDone', 'used', 'eventTrack']);
  assert.ok(!o.entity.dead, 'alive at the start');
  const deaths = []; c.on('ev', ({ e }) => { for (const ev of e || []) if ((ev.type || ev.t) === 'die' && ev.d === o.entity.id) deaths.push(ev); });
  // (this test is about the seals, not whether a mage survives a rift alone: what comes through is toothless here)
  const spawn0 = room.spawn; room.spawn = spec => { const e = spawn0(spec); if (e.kind === 'monster' && e.r && e.r.unit) { e.r.unit.dmg = [0, 0]; e.r.unit.ranged = null; e.r.unit.onHit = null; e.r.unit.specials = null; } return e; };
  const r = WE.start('rift', room, o);
  assert.ok(r && r.gate && r.gate.type === 'rift', 'a rift stands in the world');
  o.entity.moveTo(r.gate.x + 2, r.gate.z, undefined, true);
  await run(clock, 1500);
  c.use(r.gate.id); await run(clock, 300);
  assert.ok(msgs.some(m => m.t === 'used' && m.ok === false && /beat the wave/i.test(m.msg || m.text || '')), 'it cannot be touched while things are coming through');
  let warden = false;
  for (let seal = 0; seal < 3; seal++) {
    for (let k = 0; k < 8 && r.gate.data.state !== 'faltering'; k++) {
      for (const m of [...r.spawned].filter(e => e.kind === 'monster' && !e.dead)) { if (m.rank === 'champion') warden = true; hit(room, o.entity, m); slay(room, m); }
      await run(clock, 2500);
    }
    assert.equal(r.gate.data.state, 'faltering', `the rift falters (seal ${seal + 1})`);
    const card = trackOf(msgs, r.ev.name).at(-1);
    assert.ok(card && /touch it/i.test(card.objective.text), 'the card says to touch it now');
    const n0 = msgs.filter(m => m.t === 'used' && m.ok).length;
    c.use(r.gate.id); await run(clock, 400);
    assert.ok(msgs.filter(m => m.t === 'used' && m.ok).length > n0, `the seal is set (${seal + 1}); distance ${Math.round(Math.hypot(o.entity.x - r.gate.x, o.entity.z - r.gate.z))} m, dead ${o.entity.dead} ${JSON.stringify(deaths)} hp ${o.entity.hp}/${o.entity.hpMax}: ` + JSON.stringify(msgs.filter(m => m.t === 'used').at(-1)));
  }
  assert.ok(warden, 'the last seal was guarded');
  await run(clock, 1500);
  room.spawn = spawn0;
  assert.equal(r.gate.data.state, 'closed');
  const done = msgs.find(m => m.t === 'eventDone' && m.name === r.ev.name);
  assert.ok(done && done.result === 'success' && done.credited, 'closed and paid: ' + JSON.stringify(done));
  c.close();
});

test('warlord\'s march: a named warlord with a big escort walks a long route; the map pin follows it; bring it down', async () => {
  const { clock, room, WE, g, o, c } = await onTheRoad('Lordslayer');
  const msgs = box(c, ['eventDone', 'zoneEvent']);
  const zk = g.zoneOf(o.entity.x, o.entity.z);
  const r = WE.start('warmarch', room, o, zk);
  assert.ok(r && r.pack, 'a war-band marches in ' + zk);
  const n = r.pack.members.length + 1;
  assert.ok(n >= 10 && n <= 12, `a big escort: ${n} bodies`);
  assert.equal(r.pack.lead.rank, 'rare');
  const h = r.pack.route.line.at(r.pack.s);
  o.entity.moveTo(h.x + 60, h.z, undefined, true);
  await run(clock, 3000);
  assert.ok(r.pack.live, 'its bodies stand when you come near');
  const lord = r.pack.ents.find(x => x.lead).e;
  assert.equal(lord.name, r.pack.lead.name); assert.equal(lord.data.event, r.ev.uid, 'it carries the event (credit, the long leash)');
  const p0 = { x: r.at.x, z: r.at.z };
  await run(clock, 12000);
  assert.ok(msgs.some(m => m.t === 'zoneEvent' && m.kind === 'update' && m.ev.name === r.ev.name), 'the pin is moved as it marches');
  assert.ok(Math.hypot(r.at.x - p0.x, r.at.z - p0.z) > 1 || r.pack.fighting, 'it marches');
  hit(room, o.entity, lord); slay(room, lord);
  await run(clock, 2500);
  const done = msgs.find(m => m.t === 'eventDone' && m.name === r.ev.name);
  assert.ok(done && done.result === 'success' && done.credited && done.items.length >= 1, 'the warlord is down, and you are paid: ' + JSON.stringify(done));
  assert.ok(!room.packs.packs.includes(r.pack) || !r.pack.live, 'the war-band is retired');
  c.close();
});

test('bounty: a pack leader is marked WANTED across its zone, its last-seen circle on the map; kill it and the bounty is paid', async () => {
  const { clock, room, WE, g, o, c } = await onTheRoad('Bountyhunter');
  const msgs = box(c, ['eventDone', 'zoneEvent', 'chat']);
  const zk = g.zoneOf(o.entity.x, o.entity.z);
  // make sure this zone has a led pack walking (the road copy moved the near ones off)
  const pk = room.packs.packs.find(p => p.route.zone === zk && p.lead && !p.gone) || room.packs.packs.find(p => p.route.zone === zk);
  if (pk && !pk.lead) pk.lead = { type: pk.members[0].type, rank: 'champion', affixes: ['packleader'], name: 'Test-Fang', title: null, level: pk.level + 1 };
  pk.gone = false; pk.leadDeadAt = null;
  const r = WE.start('bounty', room, o, zk);
  assert.ok(r, 'a bounty is posted');
  await run(clock, 400);
  assert.ok(msgs.some(m => m.t === 'chat' && /bounty is posted/i.test(m.text)), 'everyone in the zone hears it');
  const hunted = room.packs.packs.find(p => p.bounty === r.ev.uid);
  const h = hunted.route.line.at(hunted.s);
  assert.ok(Math.hypot(r.at.x - h.x, r.at.z - h.z) < 200, 'the circle is round where it really is (roughly)');
  o.entity.moveTo(h.x + 60, h.z, undefined, true);
  await run(clock, 2500);
  const lead = hunted.ents.find(x => x.lead).e;
  assert.match(lead.info().title, /Wanted/, 'its line says WANTED');
  hit(room, o.entity, lead); slay(room, lead);
  await run(clock, 2500);
  const done = msgs.find(m => m.t === 'eventDone' && m.name === r.ev.name);
  assert.ok(done && done.result === 'success' && done.credited && done.gold > 0, 'the bounty is paid: ' + JSON.stringify(done));
  c.close();
});
