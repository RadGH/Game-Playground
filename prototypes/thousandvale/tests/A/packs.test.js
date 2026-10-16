// Wandering packs (owner 2026-10-16): "groups or parties of mobs … sometimes led by an elite … they would not stick to
// one place but would wander around … at least 5 … up to 10 … the world should be more alive, and more dangerous".
// js/sim/packs.js on the REAL province (Torbor Downs' bake, the real rules, data/provinces/packs.json and the routes
// tools/content-packs.mjs wrote), plus the encounter rate on paper over both provinces' roads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';
import { createPacks, MATERIAL_R, SPAWN_CLEAR_M } from '../../js/sim/packs.js';
import { polyline } from '../../js/sim/travellers.js';

const J = p => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url), 'utf8'));
let shared = null;
const server = async () => (shared ||= await realServer({ runSeed: 21, roadEvents: false }));
test.after(async () => { if (shared) await shared.srv.stop(); });

/** A player out in the wilds 150 m from pack `pk`'s head (the copy's packs are made on its first tick). */
async function nearPack(name, pick, off = 150) {
  const { srv, clock, world } = await server();
  const c = await joinReal(srv, clock, name, 'warrior');
  const pv = world.P.get('torbor_downs'), room = pv.copies[0];
  await run(clock, 200);
  const P = room.packs;
  const pk = P.packs.find(p => !p.live && !p.gone && pick(p));
  const h = pk.route.line.at(pk.s);
  world.transfer(rec(world, c), room, { x: h.x + off, z: h.z }, 'test'); await run(clock, 400);
  const o = rec(world, c); o.roadNextAt = Infinity;
  o.entity.moveTo(h.x + off, h.z, undefined, true);
  return { world, clock, room, P, pk, o, c };
}
const hit = (room, p, m, n = 10) => room.event({ type: 'hit', kind: 'dmg', s: p.id, d: m.id, n });
function slay(room, m) { room.rules.room.run(() => { const u = m.r.unit; u.dmg = [0, 0]; u.hp = 0; room.rules.room.field.kill(u); }); }

test('a pack exists as bodies only near a player, keeps together while it walks its route, and is put away when nobody is near', async () => {
  const { clock, room, P, pk, o, c } = await nearPack('Packeye', p => p.lead && p.route.loop);
  await run(clock, 1500);
  assert.ok(pk.live, 'it came to life with a player 150 m off');
  assert.ok(pk.ents.length >= 5 && pk.ents.length <= 10, `${pk.ents.length} bodies`);
  const lead = pk.ents.find(x => x.lead).e;
  assert.equal(lead.rank, 'champion'); assert.equal(lead.name, pk.lead.name);
  assert.ok(lead.info().title && lead.info().pack === 2, 'the leader carries its line and its mark');
  const at0 = { x: pk.walker.x, z: pk.walker.z };
  await run(clock, 20000);
  const w = pk.walker;
  assert.ok(Math.hypot(w.x - at0.x, w.z - at0.z) > 12 || pk.resting, 'it walked on (or stopped to rest)');
  const spread = Math.max(...pk.ents.filter(x => !x.e.dead).map(x => Math.hypot(x.e.x - w.x, x.e.z - w.z)));
  assert.ok(spread < 25, `its members keep together round the walker (furthest ${spread.toFixed(1)} m)`);
  // the player goes away: 30 s later the bodies are gone and the pack walks on, on paper
  o.entity.moveTo(o.entity.x + 1200, o.entity.z, undefined, true);
  const s0 = pk.s;
  await run(clock, 36000);
  assert.equal(pk.live, false, 'put away');
  assert.ok(pk.ents.length === 0 && ![...room.entities.values()].some(e => e.data && e.data.pack && e.data.pack.id === pk.uid), 'none of its bodies are left in the room');
  await run(clock, 10000);
  assert.notEqual(pk.s, s0, 'and it is still walking its route');
  c.close();
});

test('at a rest a crew lights a fire and sits round it; a hunting pack runs a deer down and feeds', async () => {
  const { clock, room, P, pk, c } = await nearPack('Firewatch', p => (p.comp === 'brigand_crew' || p.comp === 'highland_raiders' || p.comp === 'imp_band'));
  await run(clock, 1500);
  assert.ok(pk.live);
  P.restNow(pk);
  const fire = pk.resting && pk.resting.fire;
  assert.ok(fire && fire.type === 'campfire' && !fire.removed, 'a fire is lit');
  await run(clock, 3000);
  const near = pk.ents.filter(x => !x.lead && Math.hypot(x.e.x - fire.x, x.e.z - fire.z) < 6).length;
  assert.ok(near >= pk.ents.length - 2, `the crew gathers round it (${near} of ${pk.ents.length - 1})`);
  await run(clock, 45000);
  assert.ok(fire.removed && !pk.resting, 'when it moves on the fire is put out');
  c.close();
  // the hunt
  // (a hunt is only run while a player is within the monsters' thinking range — nobody sees one further off — so stand 80 m away)
  const h = await nearPack('Huntwatch', p => (p.comp === 'hound_hunt' || p.comp === 'hyena_clan' || p.comp === 'stalker_pack') && p.lead, 80);
  await run(h.clock, 1500);
  h.P.restNow(h.pk);
  const prey = h.pk.resting && h.pk.resting.prey;
  assert.ok(prey && prey.type === 'vale_deer', 'a deer breaks cover');
  for (let i = 0; i < 60 && !h.pk.resting?.fed; i++) await run(h.clock, 500);
  assert.ok(prey.dead, 'the pack ran it down (monster against monster): ' + h.pk.comp + ' prey hp ' + prey.hp + ' ' + prey.r?.unit?.state + ' hunters ' + h.pk.ents.map(x => x.e.r.unit.state + ':' + (x.e.r.unit.huntOn === prey.id) + ':' + Math.round(Math.hypot(x.e.x - prey.x, x.e.z - prey.z))).join(' ') + ' resting ' + JSON.stringify(h.pk.resting && h.pk.resting.doing));
  assert.ok(h.pk.resting && h.pk.resting.fed, 'and is feeding round the carcass');
  h.c.close();
});

test('a wiped pack leaves its spoils where it fell, only for those who fought it, pays them a share of a level, and a new pack forms out of sight', async () => {
  const { world, clock, room, P, pk, o, c } = await nearPack('Spoiler', p => p.lead);
  const { srv } = await server();
  const b = await joinReal(srv, clock, 'Bystander', 'mage');
  const ob = rec(world, b);
  world.transfer(ob, room, { x: o.entity.x + 2, z: o.entity.z }, 'test'); await run(clock, 400);
  await run(clock, 1500);
  assert.ok(pk.live);
  const lines = []; c.on('chat', m => lines.push(m.text));
  const xp0 = o.char.xp || 0;
  for (const x of pk.ents) { hit(room, o.entity, x.e); slay(room, x.e); }
  await run(clock, 1500);
  assert.ok(pk.gone, 'wiped');
  const chest = [...room.entities.values()].find(e => e.data && e.data.packSpoils === pk.uid);
  assert.ok(chest, 'the spoils are left');
  assert.deepEqual(chest.data.chest.only, [o.char.id], 'only the one who fought it may open them');
  assert.equal(chest.data.chest.tier, 'rare', 'a pack with a leader leaves a rare');
  assert.equal(chest.info().look, 'packs');
  assert.ok((o.char.xp || 0) > xp0, 'a share of a level, paid at once');
  assert.ok(lines.some(t => /broken.*XP.*spoils/i.test(t)), 'and said so: ' + lines.join(' | '));
  // the bystander cannot open it; the fighter can
  const used = []; b.on('used', m => used.push(m)); c.on('used', m => used.push({ ...m, who: 'a' }));
  ob.entity.moveTo(chest.x + 1, chest.z, undefined, true); o.entity.moveTo(chest.x - 1, chest.z, undefined, true);
  b.use(chest.id); c.use(chest.id); await run(clock, 400);
  assert.ok(used.some(m => !m.who && m.ok === false && m.why === 'locked'), 'the bystander is refused');
  assert.ok(used.some(m => m.who === 'a' && m.ok === true && m.kind === 'chest'), 'the fighter opens it');
  // a new pack forms after its rest — never where anybody can see it: with both players standing on its route it waits
  const route = pk.route;
  pk.respawnAt = room.now();
  for (const q of [o, ob]) q.entity.moveTo(route.line.at(route.line.length * 0.25).x, route.line.at(route.line.length * 0.25).z, undefined, true);
  ob.entity.moveTo(route.line.at(route.line.length * 0.75).x, route.line.at(route.line.length * 0.75).z, undefined, true);
  await run(clock, 2000);
  if (!pk.gone) { const h = pk.route.line.at(pk.s); for (const q of [o, ob]) assert.ok(Math.hypot(h.x - q.entity.x, h.z - q.entity.z) >= SPAWN_CLEAR_M, 'it formed out of everyone\'s sight'); }
  // ...and when everyone has gone it forms
  for (const q of [o, ob]) q.entity.moveTo(q.entity.x + 3000, q.entity.z, undefined, true);
  pk.respawnAt = room.now();
  await run(clock, 2000);
  assert.equal(pk.gone, false, 're-formed');
  assert.ok(pk.members.length + (pk.lead ? 1 : 0) >= 5, 'a whole new pack');
  c.close(); b.close();
});

test('a leader\'s fall breaks a beast pack (some run) or maddens a pack that fights to the end (every member hits harder)', async () => {
  for (const [want, fall] of [[p => p.lead && (p.comp === 'hound_hunt' || p.comp === 'brigand_crew' || p.comp === 'hyena_clan'), 'rout'], [p => p.lead && (p.comp === 'boar_sounder' || p.comp === 'barrow_hounds' || p.comp === 'fen_brood' || p.comp === 'cult_procession' || p.comp === 'serpent_knot'), 'enrage']]) {
    const { clock, room, pk, o, c } = await nearPack('Fall' + fall, want);
    await run(clock, 1500);
    const says = []; c.on('ev', ({ e }) => { for (const ev of e || []) if ((ev.type || ev.t) === 'say') says.push(ev.text); });
    const lead = pk.ents.find(x => x.lead).e, mate = pk.ents.find(x => !x.lead).e, d0 = mate.r.unit.dmg.slice();
    o.entity.moveTo(lead.x + 25, lead.z, undefined, true);          // close enough to hear it
    await run(clock, 200);
    hit(room, o.entity, lead); slay(room, lead);
    await run(clock, 600);
    if (fall === 'rout') assert.ok(pk.ents.some(x => !x.lead && x.e.r.unit.routed), 'some of the pack run');
    else assert.ok(mate.r.unit.dmg[1] > d0[1] && (mate.r.unit.modifiers || []).includes('pack_fury'), `the pack is maddened (${d0} -> ${mate.r.unit.dmg})`);
    assert.ok(says.some(t => (fall === 'rout' ? /scatters/ : /savage/).test(t)), 'and the world says what happened: ' + says.join(' | '));
    c.close();
  }
});

test('on the roads you meet a pack every couple of minutes (on paper, both provinces, 40 minutes of running)', () => {
  for (const [prov, rf, roadsF] of [['torbor', 'data/provinces/pack-routes.json', 'data/provinces/torbor_downs-routes.json'], ['vharlen', 'data/provinces/vharlen-pack-routes.json', 'data/provinces/vharlen-routes.json']]) {
    const routes = J(rf).routes, comps = { ...J('data/provinces/packs.json').compositions, ...(prov === 'vharlen' ? J('data/provinces/vharlen-packs.json').compositions : {}) };
    let ms = 0; const room = { id: 'paper', now: () => ms, clients: new Map(), entities: new Map(), spawn() { throw new Error('nobody is near'); }, remove() {}, emit() {} };
    let seed = 7; const rng = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const P = createPacks({ room, routes, comps, rules: J('data/provinces/packs.json').rules, rng, bandAt: () => [5, 7] });
    const roads = J(roadsF).routes.map(r => polyline(r.pts));
    let ri = 0, s = 0, meets = 0; const seen = new Map(), minutes = 40;
    for (let k = 0; k < minutes * 60 * 20; k++) {
      ms += 50; P.step(50);
      const L = roads[ri]; s += 5.4 * 0.05; if (s > L.length) { ri = (ri * 7 + 3) % roads.length; s = 0; }
      if (k % 20) continue;
      const me = L.at(s);
      for (const pk of P.packs) { const h = pk.route.line.at(pk.s); if (Math.hypot(h.x - me.x, h.z - me.z) < 110 && ms - (seen.get(pk.id) ?? -1e9) > 180000) { seen.set(pk.id, ms); meets++; } }
    }
    const every = minutes / meets;
    console.log(`# ${prov}: ${P.packs.length} packs; ${meets} met within 110 m in ${minutes} min on the roads — one every ${every.toFixed(1)} min`);
    assert.ok(every <= 3, `${prov}: one every ${every.toFixed(2)} min`);
    assert.ok(MATERIAL_R >= 200, 'bodies come before the eye can see them (the client sees ~150 m)');
  }
});
