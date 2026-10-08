#!/usr/bin/env node
// Round 8, W9 (stream P-core) — LIVE SMOKE over a real WebSocket against the running dev server (8491):
// a new character walks from the square to Bram by the gate, learns Mining, takes the quest, walks out of the gate,
// mines four boulders with real timing, walks back, hands the quest in, learns Smithing and Tempering at the smithy,
// smelts bronze, forges a blade and tempers it.   node tests/P/live-smoke.mjs [--url ws://127.0.0.1:8491]
import { readFileSync } from 'node:fs';
import { startBot } from '../../tools/bot-client.mjs';
import { perfectInputs } from '../../js/rules/professions-games.js';

const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const url = arg('url') || 'ws://127.0.0.1:8491';
const J = f => JSON.parse(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const content = J('data/provinces/professions.json'), nodes = J('data/provinces/professions-nodes.json'), offices = J('data/provinces/offices.json');
const OX = 12 * 2048, OZ = 2 * 2048;
const wall = J('data/zones/z12_02/placements.json').placements.find(p => p.kind === 'town_wall' && p.data.name === 'Torborhold');
const tr = content.trainers[0], gate = wall.data.gates.find(g => g.id === tr.gate);
const street = gate.main.pts.map(([x, z]) => ({ x: x + OX, z: z + OZ }));        // gate -> square
const outside = { x: gate.x + gate.out[0] * 14 + OX, z: gate.z + gate.out[1] * 14 + OZ };
const so = Object.values(offices.towns).find(t => t.name === 'Torborhold').offices.find(f => f.role === 'smith');
const smithDoor = { x: so.door.x + OX, z: so.door.z + OZ };
const starters = nodes.zones.z12_02.filter(n => n.s);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = m => { console.error('FAILED:', m); process.exit(1); };

const bot = await startBot({ url, name: 'Smoke' + Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join(''), mode: 'script', cls: 'warrior', log: m => console.log('[bot]', m) });
bot.fightRadius = 0;
const net = bot.net;
const once = (t, ms = 8000, pred = () => true) => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('no ' + t + ' in ' + ms + ' ms')), ms); const off = net.on(t, m => { if (!pred(m)) return; clearTimeout(to); if (typeof off === 'function') off(); res(m); }); });
async function walk(p, r = 1.6, ms = 60000) {
  bot.goal = { x: p.x, z: p.z };
  const t0 = Date.now();
  while (Math.hypot(bot.pos.x - p.x, bot.pos.z - p.z) > r) { if (Date.now() - t0 > ms) fail(`could not walk to ${Math.round(p.x)},${Math.round(p.z)} (at ${Math.round(bot.pos.x)},${Math.round(bot.pos.z)})`); await sleep(100); }
  bot.goal = null; await sleep(250);
}
const ent = pred => { for (const [id, e] of bot.ents) if (pred(e)) return { id, info: e, x: e.x, z: e.z }; return null; };
async function play(startMsg, doneType, send) {
  const g = startMsg.game, inp = perfectInputs(g);
  await sleep(inp[inp.length - 2] + 80);                 // really wait the game out, as a player would
  const p = once(doneType); send(inp); return p;
}
log('joined as', bot.name, 'at', Math.round(bot.pos.x), Math.round(bot.pos.z), 'professions:', (net.joined.you.professions.list || []).length);
if ((net.joined.you.professions.list || []).length !== 10) fail('you.professions has no ten rows');

// 1. to Bram along the main street
for (const p of street.slice().reverse().slice(1, -1)) await walk(p, 3);
await walk({ x: tr.x + 1.2, z: tr.z + 0.6 }, 2.2);
const bram = ent(i => i.key === 'npc:prospector_torborhold');
if (!bram) fail('Bram Delver is not in sight');
let p = once('used'); net.use(bram.id); let u = await p;
log('talked to', u.name, '| prof', JSON.stringify(u.prof), '| offers', (u.offers || []).map(q => q.id).join());
if (!u.prof || !(u.prof.taught || u.prof.known).includes('mining')) fail('mining was not taught');
p = once('questR'); net.quest('accept', 'prof_three_good_swings', bram.id); log('quest accepted:', (await p).ok);

// 2. out of the gate, four boulders (copper, copper, tin, copper)
await walk(street[0], 2.5); await walk(outside, 2.5);
await sleep(1500);
let got = {};
for (const s of [starters[0], starters[1], starters[2], starters[4] || starters[3]]) {
  await walk({ x: s.x + 1.8, z: s.z + 0.8 }, 2.4);
  await sleep(600);
  const node = ent(i => i.key === 'node:' + s.id);
  if (!node) fail('boulder ' + s.id + ' is not in sight');
  let st = null;
  for (let tries = 0; tries < 4; tries++) {            // something with teeth may have wandered up: wait it out, as a player would
    p = once('gatherR'); net.gather('start', { id: node.id }); st = await p;
    if (st.ok || st.why !== 'combat') break;
    log('in a fight by', node.info.name, '- waiting'); await sleep(8000);
  }
  if (!st.ok && st.why === 'combat' && Object.keys(got).length) { log('still fighting: leaving this boulder'); continue; }
  if (!st.ok) fail('gather refused: ' + JSON.stringify(st));
  const d = await play(st, 'gatherDone', inputs => net.gather('done', { id: node.id, inputs }));
  log(`mined ${node.info.name}: ${d.quality} (${d.marks.join('')}) -> ${d.got.map(x => x.n + ' ' + x.name).join(', ')} | mining ${d.skill.level}`);
  if (!d.ok) fail('gather failed: ' + JSON.stringify(d));
  for (const x of d.got) got[x.id] = (got[x.id] || 0) + x.n;
}
if ((got.copper_ore || 0) < 3 || (got.tin_ore || 0) < 3) fail('not enough ore: ' + JSON.stringify(got));

// 3. back in, show Bram, then the smithy
await walk(outside, 2.5); await walk(street[0], 2.5); await walk({ x: tr.x + 1.2, z: tr.z + 0.6 }, 2.2);
await sleep(600);
const bram2 = ent(i => i.key === 'npc:prospector_torborhold');
p = once('used'); net.use(bram2.id); u = await p; await sleep(800);
log('quest handed in; gold now', net.joined.you.gold, '| next offers', (u.offers || []).map(q => q.id).join());
for (const q of street.slice(1, -1)) await walk(q, 3);
await walk(smithDoor, 6, 60000).catch(() => {});
const smith = ent(i => i.role === 'smith');
if (!smith) fail('the smith is not in sight');
await walk({ x: smith.x + 1.5, z: smith.z + 0.5 }, 3);
p = once('used'); net.use(smith.id); u = await p;
log('smith:', u.name, JSON.stringify(u.prof));
for (const id of ['smithing', 'tempering']) { p = once('profR', 8000, m => m.id === id); net.prof('learn', { id, npc: smith.id }); const r = await p; if (!r.ok) fail('learn ' + id + ': ' + JSON.stringify(r)); log('learned', id); }
p = once('craftList'); net.craft('list', { npc: smith.id }); let L = await p;
log('forge list:', L.recipes.length, 'rows; can make now:', L.recipes.filter(r => r.can).map(r => r.id).join());
const craft = async (id, extra = {}) => {
  let q = once('craftR'); net.craft('start', { id, npc: smith.id, ...extra }); const st = await q;
  if (!st.ok) fail(id + ' refused: ' + JSON.stringify(st));
  const d = await play(st, 'craftDone', inputs => net.craft('done', { id, inputs }));
  log(`${id}: ${d.quality} — ${d.msg}`);
  if (!d.ok) fail(id + ' failed: ' + JSON.stringify(d));
  return d;
};
const bars = Math.min(got.copper_ore, got.tin_ore, 10);
await craft('smelt_bronze_bar', { n: bars });
const made = await craft('blades_1', { base: 'dagger' });
const blade = made.items.find(i => i.crafted);
if (!blade) fail('no crafted blade in the reply');
log('forged:', blade.name, '|', blade.rarity, blade.quality, '| level', blade.dropLevel, '| made by', blade.maker);
p = once('craftQuote'); net.craft('quote', { id: 'temper_quality', uid: blade.uid, npc: smith.id }); const quote = await p;
log('temper quote:', quote.can ? quote.text : 'cannot: ' + quote.why, '| needs', quote.needs.map(n => n.n + ' ' + n.name + ' (have ' + n.have + ')').join(), '| gold', quote.gold);
if (quote.can) { const t = await craft('temper_quality', { uid: blade.uid }); log('tempered:', t.item.name, t.item.quality, JSON.stringify(t.item.dmg)); }
else if (quote.code !== 'max' && quote.code !== 'needs' && quote.code !== 'gold') fail('unexpected temper refusal: ' + JSON.stringify(quote));
p = once('sheet'); net.sheet(); const sh = await p;
log('sheet.professions:', sh.professions.list.filter(x => x.known).map(x => `${x.name} ${x.level}`).join(', '));
log('LIVE SMOKE OK');
bot.stop(); await sleep(300); process.exit(0);
