// The quest runtime (js/sim/quests.js) on stream E's real Torbor Downs data: a quest NPC offers, you accept,
// kills with shared credit move the step, you take it back for xp + gold, the story chain unlocks the next one,
// the log survives a logout, a visit step moves when you walk in, and a town elder is a radiant job board.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { createLoopbackServer } from '../../js/sim/loopback.js';
import { createWorld } from '../../js/sim/world.js';
import { loadProvinceContent } from '../../js/sim/content.js';
import { parseTerrain, parseNav } from '../../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../../js/sim/province-terrain.js';
import { buildLayout } from '../../js/sim/realm.js';
import { vignetteContent } from '../../js/sim/vignettes.js';
import { createQuestBook } from '../../js/sim/quests.js';
import { makeClient, run, until, waitP, loadAll } from './helpers.js';

const root = new URL('../../', import.meta.url);
const readJson = async f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const readBytes = async f => readFileSync(new URL(f, root));
const C = await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, parseNav, createProvinceTerrain });
const L = buildLayout({ key: 'torbor_downs', name: C.name, terrain: C.terrain, zones: C.zones, encounterInfo: C.encounterInfo, vignetteContent, starter: C.starter, rares: C.rares, jobs: C.jobs });

test('the book: every quest of the province loads, every step resolves to something that exists', () => {
  const book = createQuestBook({ layout: L, zones: L.zones, rares: C.rares, jobs: C.jobs, rng: () => 0.3 });
  assert.ok(book.defs.size >= 90, 'quests: ' + book.defs.size);
  const bad = [];
  for (const d of book.defs.values()) for (const st of d.steps) {
    if ((st.kind === 'visit') && !st.place) bad.push(d.id + ': visit ' + (st.vignette || st.site));
    if (st.kind === 'killRare' && !st.rare) bad.push(d.id + ': rare ' + st.zone + '/' + st.slot);
    if (st.kind === 'clear' && st.dungeon === 'door' && !(st.door >= 0)) bad.push(d.id + ': no door in ' + st.zone);
  }
  assert.deepEqual(bad, []);
});

async function world() {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const w = createWorld({ layouts: [L], store, now: clock.now, lingerMs: 0, log: () => {}, events: C.events, encounterInfo: C.encounterInfo, zoneEventFirstMs: 1e9 });
  const srv = createLoopbackServer({ clock, world: w });
  await srv.ready;
  return { clock, store, w, srv };
}
async function join(srv, clock, name, tokenStore) {
  const a = makeClient(srv, clock, tokenStore ? { tokenStore } : {});
  await waitP(clock, a.ready);
  const list = await waitP(clock, a.listChars ? a.listChars() : Promise.resolve(a.chars || []));
  const ch = (list && list[0]) || await waitP(clock, a.createChar({ name, cls: 'warrior' }));
  await waitP(clock, a.play(ch.id));
  return a;
}
const objIn = (rooms, pred) => { for (const r of rooms) for (const o of r.objects.values()) if (pred(o)) return { r, o }; return null; };

test('a quest from accept to reward; the chain unlocks the next; the log survives a logout', async () => {
  const { clock, store, w, srv } = await world();
  const P = w.province, pv = P.P.get('torbor_downs');
  const a = await join(srv, clock, 'Questor');
  const me = () => P.online.get(a.joined.you.char);
  const used = [], qr = [], logs = [];
  a.on('used', m => used.push(m)); a.on('questR', m => qr.push(m)); a.on('quests', m => logs.push(m));
  const rooms = [...pv.towns, ...pv.copies];
  const maud = objIn(rooms, o => o.data && o.data.npc && o.data.npc.id === 'elder_maud');
  assert.ok(maud, 'Elder Maud stands somewhere');
  assert.equal(maud.r.kind, 'town', 'in Torborhold\'s own room');
  P.transfer(me(), maud.r, { x: maud.o.x + 1, z: maud.o.z }, 'test');
  await run(clock, 200);
  a.use(maud.o.id);
  await until(clock, () => used.some(u => u.id === maud.o.id), 2000);
  const offer = used.find(u => u.id === maud.o.id);
  assert.ok(offer.offers.some(q => q.id === 'wolves_at_the_fold'), 'offers Wolves at the Fold');
  assert.ok(!offer.offers.some(q => q.id === 'toll_at_fitockpi'), 'the next story quest is locked');
  a.quest('accept', 'wolves_at_the_fold', maud.o.id);
  await until(clock, () => qr.length, 2000);
  assert.equal(qr[0].ok, true, JSON.stringify(qr[0]));
  assert.ok(logs.at(-1).active.some(q => q.id === 'wolves_at_the_fold'));
  // eight moor hounds, killed with my credit, out in the wilds — S10 (play-test 4): the eighth pays the quest right there
  const xp0 = me().char.xp || 0, gold0 = me().char.gold || 0;
  const wild = P.copies[0];
  P.transfer(me(), wild, { x: maud.o.x + 400, z: maud.o.z }, 'test');
  await run(clock, 200);
  for (let i = 0; i < 8; i++) {
    const m = wild.spawn({ kind: 'monster', type: 'moor_hound', level: 1, x: me().entity.x + 3, z: me().entity.z });
    m.kill(me().entity);
    await run(clock, 60);
  }
  await run(clock, 200);
  assert.ok(!logs.at(-1).active.some(x => x.id === 'wolves_at_the_fold'), 'finished and handed in remotely');
  await until(clock, () => qr.length >= 2, 2000);
  assert.equal(qr[1].ok, true, JSON.stringify(qr[1]));
  assert.equal(qr[1].remote, true); assert.equal(qr[1].auto, true);
  assert.equal(qr[1].next, 'toll_at_fitockpi');
  assert.ok((me().char.xp || 0) > xp0 && (me().char.gold || 0) > gold0, 'paid xp + gold');
  assert.ok(logs.at(-1).done.includes('wolves_at_the_fold'));
  // Reeve Corwin now offers the next story quest
  const corwin = objIn(rooms, o => o.data && o.data.npc && o.data.npc.id === 'reeve_corwin');
  P.transfer(me(), corwin.r, { x: corwin.o.x + 1, z: corwin.o.z }, 'test');
  await run(clock, 200);
  a.use(corwin.o.id);
  await until(clock, () => used.some(u => u.id === corwin.o.id), 2000);
  assert.ok(used.find(u => u.id === corwin.o.id).offers.some(x => x.id === 'toll_at_fitockpi'), 'unlocked');
  a.quest('accept', 'toll_at_fitockpi', corwin.o.id);
  await until(clock, () => qr.length >= 3, 2000);
  assert.equal(qr[2].ok, true);
  // the save: what a reload reads (blob + journal) has the done quest and the active one
  const charId = a.joined.you.char;
  a.close();
  await until(clock, () => !P.online.has(charId), 3000);
  await run(clock, 500);
  const back = loadAll(store).find(c => c.id === charId);
  assert.ok(back.quests.done.wolves_at_the_fold, 'done survives');
  assert.ok(back.quests.active.toll_at_fitockpi, 'active survives');
  await srv.stop();
});

test('a visit step moves when you walk in; a town elder offers radiant jobs bound to the zone', async () => {
  const { clock, w, srv } = await world();
  const P = w.province, pv = P.P.get('torbor_downs');
  const a = await join(srv, clock, 'Wanderer');
  const me = () => P.online.get(a.joined.you.char);
  const used = [], qr = [], logs = [];
  a.on('used', m => used.push(m)); a.on('questR', m => qr.push(m)); a.on('quests', m => logs.push(m));
  // a town elder (the town folk) is a job board
  const elder = objIn(pv.towns, o => o.data && o.data.npc && o.data.npc.role === 'elder' && !o.data.npc.id);
  assert.ok(elder, 'a town elder');
  P.transfer(me(), elder.r, { x: elder.o.x + 1, z: elder.o.z }, 'test');
  await run(clock, 200);
  a.use(elder.o.id);
  await until(clock, () => used.some(u => u.id === elder.o.id), 2000);
  const jobs = (used.find(u => u.id === elder.o.id).offers || []).filter(q => q.job);
  assert.ok(jobs.length >= 2 && jobs.length <= 4, 'jobs offered: ' + jobs.length);
  for (const j of jobs) assert.ok(!/\{\w+\.\w+\}/.test(j.name + j.text), 'every placeholder bound: ' + j.name);
  // accept a visit-type job if there is one, else any; it lands in the log
  const pickJob = jobs.find(j => /What's at|Mark|Lost at|Herbs/.test(j.name)) || jobs[0];
  a.quest('accept', pickJob.id, elder.o.id);
  await until(clock, () => qr.length, 2000);
  assert.equal(qr[0].ok, true, JSON.stringify(qr[0]));
  assert.ok(logs.at(-1).active.some(q => q.id === pickJob.id && q.job));
  // a story visit step: The Old Sow starts at the boar wallow
  const book = pv.book;
  const sow = book.defs.get('the_old_sow');
  const ch = me().char;
  ch.quests.done.tusks_in_the_turnips = 1;
  ch.quests.active.the_old_sow = { step: 0, n: 0 };
  const place = sow.steps[0].place;
  assert.ok(place, 'the wallow resolves to a placement');
  P.transfer(me(), P.copies[0], { x: place.x, z: place.z }, 'test');
  await until(clock, () => (ch.quests.active.the_old_sow || {}).step === 1, 3000);
  assert.equal(ch.quests.active.the_old_sow.step, 1, 'walking into the wallow did it');
  a.close(); await srv.stop();
});
