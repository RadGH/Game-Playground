// Stream E's M2 placements on the real Torbor Downs bake become room content (js/sim/placements.js):
// every placement kind lands (vignettes, camps, rares with their roaming path, forts, farms, caves as doors,
// waystones, quest NPCs, hooks, treasure clues + caches), things inside a hub town go to that town's room,
// a cave is a 1-floor instance of the cave's own beasts, and a treasure chain opens its cache once per
// character only after every clue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createWorld } from '../../js/sim/world.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { makeClient, run, until, waitP } from './helpers.js';

const root = new URL('../../', import.meta.url);
const readJson = async f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const readBytes = async f => readFileSync(new URL(f, root));
const HAVE = readdirSync(new URL('data/vignettes/placements/', root)).some(f => /^z\d+_\d+\.json$/.test(f));
const C = HAVE ? await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain }) : null;
const L = HAVE ? buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter }) : null;
const all = HAVE ? C.zones.flatMap(z => (z.vignettes ? z.vignettes.placements.map(p => ({ ...p, zone: z.key })) : [])) : [];

test('every placement kind becomes room content; town-side things go to the town room', { skip: !HAVE && 'no placements yet' }, () => {
  const kinds = new Set(all.map(p => p.type));
  for (const k of ['vignette', 'camp', 'rare', 'waystone', 'npc', 'fort', 'farm', 'cave', 'hook', 'treasure_clue', 'treasure_cache', 'wayside']) assert.ok(kinds.has(k), 'E placed some ' + k);
  const objs = [...L.objects, ...L.townObjects.flat()];
  const has = (type, key) => objs.some(o => o.type === type && o.key === key);
  for (const p of all) {
    if (p.type === 'npc') assert.ok(has('npc', 'npc:' + p.id), 'npc ' + p.id);
    if (p.type === 'hook') assert.ok(has('hook', 'hook:' + p.id), 'hook ' + p.id);
    if (p.type === 'wayside') assert.ok(objs.some(o => o.type === 'wayside' && o.key === 'wayside:' + p.id && o.lore), 'wayside with lore ' + p.id);
    if (p.type === 'fort') assert.ok(has('fort', 'fort:' + p.id), 'fort ' + p.id);
    if (p.type === 'farm') assert.ok(has('farm', 'farm:' + p.id), 'farm ' + p.id);
    if (p.type === 'treasure_clue') assert.ok(has('clue', `tr:${p.chain}:${p.step}`), 'clue ' + p.id);
    if (p.type === 'treasure_cache') assert.ok(objs.some(o => o.type === 'cache' && o.key === `tr:${p.chain}:${p.step}` && o.hidden), 'hidden cache ' + p.id);
    if (p.type === 'waystone') assert.ok(L.waystones.some(w => w.key === 'ws:' + p.id), 'waystone ' + p.id);
    if (p.type === 'cave') assert.ok(L.doors.some(d => d.key === 'cave:' + p.id && d.sheet.dungeon.floors >= 1), 'cave door ' + p.id);
    if (p.type === 'rare') { const c = L.camps.find(x => x.encounter === p.id && x.rank === 'rare'); assert.ok(c && Array.isArray(c.respawnMs) && (!Array.isArray(p.path) || p.path.length < 2 || (c.path && c.path.length === p.path.length)), 'rare ' + p.id); }   // a rare may stand still (E's mini bosses, play-test 2)
    if (p.type === 'camp') assert.ok(L.camps.some(c => c.place === p.id && c.type === p.monster), 'camp ' + p.id);
  }
  // the three hooks that are bake features (features[])
  for (const id of ['the_singing_ford', 'the_bridge_city', 'the_thorn_wall']) assert.ok(objs.some(o => o.key === 'hook:' + id && o.site.feature), 'feature hook ' + id);
  assert.ok(objs.find(o => o.key === 'hook:the_thorn_wall').site.pts.length > 5, 'the wall line in world metres');
  // a rare E placed is not placed a second time from the zone sheet
  for (const id of new Set(all.filter(p => p.type === 'rare').map(p => p.id))) assert.equal(L.camps.filter(c => c.encounter === id).length, all.filter(p => p.type === 'rare' && p.id === id).length, 'rare once: ' + id);
  // inside a hub town circle -> that town's room; the wilds list holds nothing inside a town
  for (const [i, list] of L.townObjects.entries()) for (const ob of list) assert.ok(Math.hypot(ob.x - L.towns[i].x, ob.z - L.towns[i].z) < L.towns[i].r);
  for (const ob of L.objects) assert.ok(L.towns.every(t => Math.hypot(ob.x - t.x, ob.z - t.z) >= t.r - 2), 'wilds object outside towns: ' + ob.key);
  // a warband stockade is ONE camp row with a warband leader (stream C brings the escort)
  for (const p of all.filter(x => x.type === 'fort' && x.template === 'warband_stockade')) {
    const rows = L.camps.filter(c => c.place === p.id);
    assert.equal(rows.length, 1, 'one row for ' + p.id); assert.match(rows[0].type, /_(ringleader|warchief|packlord|deathmarshal|mountainlord)$/);
  }
  // B's nav.bin reaches the rules (stream C's ask): monsters step round trees, rocks, buildings, deep water
  assert.ok(L.terrain.nav && typeof L.terrain.nav.passable === 'function');
  const t0 = L.towns[0]; let blocked = 0; for (let i = 0; i < 400; i++) if (!L.terrain.nav.passable(t0.x - 60 + (i % 20) * 6, t0.z - 60 + Math.floor(i / 20) * 6)) blocked++;
  assert.ok(blocked > 0, 'buildings in the hub town block');
  // every hub town has a waystone in its room
  L.towns.forEach((t, i) => assert.ok(L.waystones.some(w => w.town === i), 'waystone in ' + t.name));
});

test('in the world: a quest NPC greets, a cave is a small instance of its own beasts, a treasure chain pays once after every clue', { skip: !HAVE && 'no placements yet' }, async () => {
  const clock = createVirtualClock();
  const { createRules } = await import('../../js/rules/index.js');     // stream C's rules (warband escorts, cave beasts)
  const world = createWorld({ layouts: [L], store: createMemoryStore({ now: clock.now }), now: clock.now, lingerMs: 0, log: () => {}, events: C.events, encounterInfo: C.encounterInfo, createRules });
  const srv = createLoopbackServer({ clock, world });
  await srv.ready;
  const a = makeClient(srv, clock);
  await waitP(clock, a.ready);
  const ch = await waitP(clock, a.createChar({ name: 'Delver', cls: 'warrior' }));
  await waitP(clock, a.play(ch.id));
  const P = world.province;
  const me = () => P.online.get(a.joined.you.char);
  const used = []; a.on('used', m => used.push(m));
  const goUse = async (room, obj) => {
    P.transfer(me(), room, { x: obj.x + 1, z: obj.z }, 'test');
    await run(clock, 200);
    const n0 = used.length;
    a.use(obj.id);
    await until(clock, () => used.length > n0 && used.at(-1).id === obj.id, 2000);
    return used.at(-1);
  };
  const find = (room, pred) => [...room.objects.values()].find(pred);
  // a quest NPC in the wilds (E's `npc` placement)
  const npcP = all.find(p => p.type === 'npc');
  const room0 = P.copies[0];
  const roomOfObj = key => [room0, ...P.P.get('torbor_downs').towns].find(r => find(r, x => x.data && x.data.key === key));
  const nr = roomOfObj('npc:' + npcP.id);
  assert.ok(nr, 'the NPC stands in some room');
  const npcObj = find(nr, x => x.data && x.data.key === 'npc:' + npcP.id);
  const r1 = await goUse(nr, npcObj);
  assert.equal(r1.ok, true); assert.equal(r1.kind, 'npc');
  assert.ok(r1.says.length >= 1, 'greeting from the quest file');
  // a cave: its door leads to a 1-floor instance whose boss is the cave's boss
  const caveP = all.find(p => p.type === 'cave');
  const caveDoor = find(room0, x => x.data && x.data.key === 'cave:' + caveP.id);
  assert.ok(caveDoor && caveDoor.type === 'cave');
  await goUse(room0, caveDoor);
  await until(clock, () => me().room.kind === 'instance', 2000);
  const inst = me().room;
  assert.equal(inst.meta.plan.floors.length, caveP.plan.floors);
  assert.equal(inst.name, caveP.name);
  const tmpl = JSON.parse(readFileSync(new URL('data/provinces/sites.json', root), 'utf8')).caves[caveP.template];
  const types = new Set([...inst.entities.values()].filter(e => e.kind === 'monster').map(e => e.type));
  for (const t of types) assert.ok(tmpl.packs.includes(t) || t === tmpl.boss.type, 'cave beast ' + t);
  // the warband leader at a stockade arrives with its escort (stream C's rules)
  const wb = L.camps.find(c => c.warband);
  if (wb) {
    P.transfer(me(), room0, { x: wb.x + 60, z: wb.z }, 'test');      // a parked (dormant) camp wakes when someone comes near
    await run(clock, 1500);
    const lead = [...room0.entities.values()].find(e => e.kind === 'monster' && e.type === wb.type);
    assert.ok(lead, 'leader spawned');
    const escort = [...room0.entities.values()].filter(e => e.kind === 'monster' && e.data && e.data.escortOf != null);
    assert.ok(escort.length >= 1, 'escort with it');
  }
  // a separate dungeon door gives a separate instance (keyed per door)
  P.transfer(me(), room0, { x: caveDoor.x + 3, z: caveDoor.z + 3 }, 'test');
  await run(clock, 200);
  // treasure: the cache refuses until every clue is found, then pays once
  const chainId = all.find(p => p.type === 'treasure_cache').chain;
  const clues = all.filter(p => p.type === 'treasure_clue' && p.chain === chainId).sort((x, y) => x.step - y.step);
  const cacheP = all.find(p => p.type === 'treasure_cache' && p.chain === chainId);
  const objOf = p => { const k = `tr:${chainId}:${p.step}`; const r = roomOfObj(k); return { r, o: find(r, x => x.data && x.data.key === k) }; };
  const cache = objOf(cacheP);
  const early = await goUse(cache.r, cache.o);
  assert.equal(early.ok, false); assert.equal(early.why, 'locked');
  for (const [i, cp] of clues.entries()) {
    const c = objOf(cp);
    const r = await goUse(c.r, c.o);
    assert.equal(r.ok, true); assert.equal(r.kind, 'clue'); assert.ok(r.text.length > 5);
    assert.equal(r.found.length, i + 1);
    if (i === clues.length - 1) assert.ok(r.hint, 'the last clue gives the cache hint');
  }
  const goldBefore = me().char.gold;
  const got = await goUse(cache.r, cache.o);
  assert.equal(got.ok, true); assert.equal(got.kind, 'cache');
  await run(clock, 200);
  assert.ok(me().char.gold > goldBefore, 'paid');
  const again = await goUse(cache.r, cache.o);
  assert.equal(again.ok, false); assert.equal(again.why, 'opened');
  assert.ok(me().char.treasure[chainId].done);
  a.close(); await srv.stop();
});

test('a hostile fort\'s garrison follows the zone: brigands in the heartland, the dead in ruins and on holy ground', async () => {
  const { placementContent } = await import('../../js/sim/placements.js');
  const sites = JSON.parse(readFileSync(new URL('data/provinces/sites.json', root), 'utf8'));
  const p = [{ type: 'fort', id: 'f', template: 'ruined_fort', friendly: false, x: 0, z: 0, radius: 20, level: 5 }];
  const types = a => placementContent(p, { sites, archetype: a }).camps.map(c => c.type);
  assert.deepEqual(types('heartland'), sites.forts.ruined_fort.garrison.monsters.map(m => m.type));
  assert.deepEqual(types('ruinfield'), sites.forts.ruined_fort.garrison.undead.map(m => m.type));
  assert.deepEqual(types('holy_ground'), sites.forts.ruined_fort.garrison.undead.map(m => m.type));
});
