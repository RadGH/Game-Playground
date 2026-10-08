// W9 (P-client): record the REAL server's profession messages for the gallery's scenes and the client specs.
//   node tests/P/client-fixtures.mjs      -> js/client/gallery/fixtures/professions.json
// Nothing in that file is typed by hand: a throw-away province is started in-process (the same helpers P-core's
// server test uses), a character learns Mining from Bram, mines, learns Smithing and Tempering at the smith, smelts,
// forges a dagger and asks for a tempering quote — every frame the client got is kept. Re-run after a protocol or
// content change.
import { writeFileSync } from 'node:fs';
import { realServer, joinReal, rec, run, until } from '../A/pt1-helpers.js';
import { perfectInputs } from '../../js/rules/professions-games.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
const S = await realServer({ roadEvents: false });
const P = S.world.province, W = P.professions, clock = S.clock;
const a = await joinReal(S.srv, clock, 'Maren'); const o = rec(S.world, a);
await run(clock, 1500);
const got = {}; for (const t of ['used', 'you', 'gatherR', 'gatherDone', 'craftList', 'craftR', 'craftDone', 'craftQuote', 'profR', 'skinnable', 'bag']) got[t] = on(a, t);
const npc = f => [...P.rooms.values()].flatMap(rm => [...rm.objects.values()].map(e => ({ e, rm }))).find(x => x.e.data && x.e.data.npc && f(x.e.data.npc));
const last = t => got[t][got[t].length - 1];
const wait = (t, n = got[t].length + 1) => until(clock, () => got[t].length >= n, 3000);
const out = { _about: 'Recorded from the real server by tests/P/client-fixtures.mjs (stream P-client, W9). Do not edit by hand.' };

// Bram by the gate: teaches Mining on the first word
const bram = npc(n => n.id === 'prospector_torborhold');
P.transfer(o, bram.rm, { x: bram.e.x + 1.5, z: bram.e.z }, 'fixture'); await run(clock, 600);
a.use(bram.e.id); await wait('used'); out.usedProspector = last('used');
// a starter boulder
const key = 'node:' + S.world.layouts[0].professions.nodes.zones.z12_02.find(n => n.s).id;
const any = [...P.rooms.values()].flatMap(r => [...r.objects.values()]).find(e => e.data && e.data.key === key);
P.transfer(o, o.room, { x: any.x + 1.5, z: any.z }, 'fixture'); await run(clock, 900);
const node = [...o.room.objects.values()].find(e => e.data && e.data.key === key);
out.nodeInfo = { id: node.id, x: node.x, z: node.z, info: a.mirror.infos.get(node.id) };
a.gather('start', { id: node.id }); await wait('gatherR'); out.gatherR = last('gatherR');
const inp = perfectInputs(out.gatherR.game); await run(clock, inp[inp.length - 2] + 60);
a.gather('done', { id: node.id, inputs: inp }); await wait('gatherDone'); out.gatherDone = last('gatherDone');
// the smith: learn, list, smelt, forge, quote
const smith = [...bram.rm.objects.values()].find(e => e.data && e.data.npc && e.data.npc.role === 'smith');
P.transfer(o, bram.rm, { x: smith.x + 1.5, z: smith.z }, 'fixture'); await run(clock, 900);
a.use(smith.id); await wait('used'); out.usedSmith = last('used');
a.prof('learn', { id: 'smithing', npc: smith.id }); await wait('profR'); out.profLearn = last('profR');
a.prof('learn', { id: 'tempering', npc: smith.id }); await wait('profR');
P.grant(o, { items: [W.P.item('copper_ore', 9), W.P.item('tin_ore', 6), W.P.item('bronze_bar', 9)], reason: 'fixture' }); o.char.gold = 340; await run(clock, 200);
const make = async (id, extra = {}) => {
  a.craft('start', { id, npc: smith.id, ...extra }); await wait('craftR'); const r = last('craftR'); if (!r.ok) return { start: r };
  const i2 = perfectInputs(r.game); await run(clock, i2.length ? i2[i2.length - 2] + 60 : 500);
  a.craft('done', { id, inputs: i2 }); await wait('craftDone'); return { start: r, done: last('craftDone') };
};
let r = await make('smelt_bronze_bar'); out.craftR = r.start; out.craftDone = r.done;
r = await make('blades_1', { base: 'dagger' }); out.craftGearR = r.start; out.craftGearDone = r.done;
await run(clock, 300);
a.craft('list', { npc: smith.id }); await wait('craftList'); out.craftList = last('craftList');
const blade = o.char.bag.find(i => i.crafted);
a.craft('quote', { id: 'temper_quality', uid: blade.uid, npc: smith.id }); await wait('craftQuote'); out.craftQuote = last('craftQuote');
r = await make('temper_quality', { uid: blade.uid }); out.temperR = r.start; out.temperDone = r.done;
await run(clock, 300);
a.craft('quote', { id: 'temper_quality', uid: blade.uid, npc: smith.id }); await wait('craftQuote'); out.craftQuoteAfter = last('craftQuote');
// a second blade, untouched, and what tempering IT would take (the tempering scene's quote)
r = await make('blades_1', { base: 'sword' }); out.craftGear2Done = r.done;
const blade2 = o.char.bag.filter(i => i.crafted).find(i => i.uid !== blade.uid);
a.craft('quote', { id: 'temper_quality', uid: blade2.uid, npc: smith.id }); await wait('craftQuote'); out.craftQuote2 = last('craftQuote'); out.blade2Uid = blade2.uid;
await run(clock, 300); a.craft('list', { npc: smith.id }); await wait('craftList'); out.craftList = last('craftList');
// away from any station: the list still comes, nothing can be made
P.transfer(o, bram.rm, { x: smith.x + 40, z: smith.z }, 'fixture'); await run(clock, 700);
a.craft('list', {}); await wait('craftList'); out.craftListAway = last('craftList');
out.professions = W.view(o.char);
// a seasoned character's list (same view function, more experience) for the Professions page
const xpAt = lv => W.P.xpAt(lv);
const seasoned = JSON.parse(JSON.stringify(o.char));
seasoned.professions.known = ['mining', 'logging', 'foraging', 'skinning', 'smithing', 'tempering', 'alchemy'];
seasoned.professions.xp = { mining: xpAt(34) + 60, logging: xpAt(12), foraging: xpAt(27) + 200, skinning: xpAt(8) + 10, smithing: xpAt(26) + 90, tempering: xpAt(11), alchemy: xpAt(3) };
out.professionsSeasoned = W.view(seasoned);
out.bag = o.char.bag;
out.gold = o.char.gold;
out.bladeUid = blade.uid;
writeFileSync(new URL('../../js/client/gallery/fixtures/professions.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('recorded:', Object.keys(out).join(', '), '| recipes', out.craftList.recipes.length, '| bag', out.bag.length);
process.exit(0);
