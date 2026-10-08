// Play-test 4 S11 + S19 (streams A + E) on the REAL world: "towns with only 1 NPC — more NPCs in every town, several
// merchants per town; an NPC who refunds talent points and perks" and "an indicator above the name showing what they
// are; names are random/pointless, some just 'Townsfolk'".
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';
import { until } from './helpers.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };
const PLACEHOLDER = /^(townsfolk|villager|npc|guard|smith|merchant|innkeeper|elder|healer|unbinder|broker|barber|stable master|farmer|farmhand|shepherd|fisher|sergeant|captain|castellan|quartermaster|miller|trader)$/i;

let W = null;
async function world() { if (!W) W = await realServer(); return W; }

test('S11: every town room has several merchants and a crowd; every town of size >= medium has an Unbinder', async () => {
  const { world: w } = await world();
  const pv = w.P.values().next().value;
  assert.ok(pv.towns.length >= 16, 'the hub towns: ' + pv.towns.length);
  for (const t of pv.towns) {
    const npcs = [...t.objects.values()].filter(x => x.kind === 'npc');
    const shops = npcs.filter(x => w.shopsKindOf ? w.shopsKindOf(x) : (x.data.npc && (x.data.npc.shop || ['merchant', 'smith', 'trader', 'armourer', 'apothecary', 'provisioner', 'innkeeper', 'stablehand', 'bowyer', 'tailor', 'jeweller', 'healer'].includes(x.data.npc.role))));
    const kinds = new Set(shops.map(x => x.data.npc.shop || x.data.npc.role));
    assert.ok(npcs.length >= 15, `${t.name}: ${npcs.length} people`);
    assert.ok(kinds.size >= 5, `${t.name}: ${kinds.size} kinds of merchant (${[...kinds]})`);
    for (const need of ['merchant', 'smith']) assert.ok(npcs.some(x => x.data.npc.role === need), `${t.name}: no ${need}`);
    // town and city = medium and up: an Unbinder in each
    assert.ok(npcs.some(x => x.data.npc.role === 'unbinder'), `${t.name}: no Unbinder`);
  }
});

test('S11: every village and hamlet stream B planned (no town room) has a trader and a few folk in the wilds', async () => {
  const { world: w, clock } = await world();
  const pv = w.P.values().next().value;
  await run(clock, 200);
  const wild = pv.copies[0];
  const wn = [...wild.objects.values()].filter(x => x.kind === 'npc');
  let n = 0;
  for (const z of pv.L.zones) for (const st of (z.plan && z.plan.settlements) || []) {
    if (st.hub || st.kind === 'town' || st.kind === 'city') continue;
    n++;
    const r = (st.radius || 40) + 10;
    const here = wn.filter(x => Math.hypot(x.x - st.x, x.z - st.z) < r);
    assert.ok(here.length >= 5, `${st.name} (${st.kind}): ${here.length} people`);
    const trader = here.find(x => x.data.npc && x.data.npc.role === 'merchant');
    assert.ok(trader, `${st.name}: no trader`);
    assert.ok(pv.L.shops && trader.info().title, 'the trader is titled');
  }
  assert.ok(n >= 25, 'settlements checked: ' + n);
});

test('S19 + W27: every NPC has a real name; a title only on the ones placed for the player (no "Townsfolk", "Guard", "Smith" placeholders)', async () => {
  const { world: w, srv, clock } = await world();
  const pv = w.P.values().next().value;
  const a = await joinReal(srv, clock, 'Namecheck', 'warrior'); await run(clock, 1500);
  let n = 0, fill = 0, titled = 0;
  for (const r of [...pv.towns, ...pv.copies]) for (const x of r.entities.values()) {
    if (x.kind !== 'npc' || !x.data || !(x.data.npc || x.data.folk)) continue;
    n++;
    const i = x.info();
    // W27 (round 8, report #48): a title only on NPCs placed for the player; filler folk have a real name and nothing above it
    if (i.filler) { fill++; assert.ok(!i.title, `${i.name} (${i.role}) is filler and must show no title, has "${i.title}"`); assert.ok(!(x.data.npc && x.data.npc.shop), `${i.name} (${i.role}) keeps a shop and was called filler`); }
    else { titled++; assert.ok(i.title && String(i.title).trim() && i.title !== 'Local', `${i.name} (${i.role}) is titled and has no title`); }
    if (['townsfolk', 'villager', 'woodcutter', 'farmer', 'farmhand', 'shepherd', 'guard', 'traveller'].includes(i.role) && !(x.data.npc && (x.data.npc.id || x.data.npc.shop))) assert.ok(!i.title, `a ${i.role} shows "${i.title}"`);
    assert.ok(!PLACEHOLDER.test(i.name), `"${i.name}" is a job, not a name (${i.role})`);
    assert.ok(!/townsfolk|villager|\bnpc\b/i.test(i.name), i.name);
  }
  assert.ok(n > 300, 'npcs checked ' + n);
  assert.ok(fill > 50 && titled > 50, `both kinds exist: ${titled} titled, ${fill} filler`);
  console.log(`W27: ${titled} titled NPCs, ${fill} filler (no title)`);
  // service titles say what they do
  const t0 = pv.towns[0];
  const by = role => [...t0.objects.values()].find(x => x.kind === 'npc' && x.data.npc && x.data.npc.role === role).info();
  assert.equal(by('unbinder').title, 'Unbinder — resets talents & perks');
  assert.equal(by('smith').title, 'Weaponsmith');
  assert.match(by('barber').title, /^Barber/);
  // the same NPC keeps its name: a second world built from the same data names the same guard the same
  const g1 = [...t0.objects.values()].filter(x => x.data && x.data.npc && x.data.npc.role === 'guard').map(x => x.name).sort();
  const W2 = await realServer();
  const g2 = [...W2.world.P.values().next().value.towns[0].objects.values()].filter(x => x.data && x.data.npc && x.data.npc.role === 'guard').map(x => x.name).sort();
  assert.deepEqual(g1, g2, 'names are seeded, not random');
  await W2.srv.stop();
  a.close();
});

test('S11: the Unbinder offers its service with prices, and resetting perks and talents gives the points back for gold', async () => {
  const { world: w, srv, clock } = await world();
  const a = await joinReal(srv, clock, 'Regretter', 'warrior');
  const o = rec(w, a), e = o.entity, rules = o.room.rules;
  o.char.level = 12; rules.onLevel(e); await run(clock, 200);
  const pr = [], tr = [], used = [];
  a.on('perkR', m => pr.push(m)); a.on('talentR', m => tr.push(m)); a.on('used', m => used.push(m));
  // take perks along the forest from the start, and a talent
  const forest = rules.perkForest();
  const before = rules.perks(e).left;
  assert.ok(before >= 2, 'perk points at level 12: ' + before);
  const taken = [];
  for (let k = 0; k < 2; k++) {
    const nxt = (forest.nodes || []).find(nd => nd.id !== 'start' && !taken.includes(nd.id) && (forest.links || []).some(l => (l.includes('start') || taken.some(t => l.includes(t))) && l.includes(nd.id)) && rules.perk(e, 'take', { id: nd.id }).ok);
    if (nxt) taken.push(nxt.id);
  }
  assert.ok(taken.length >= 1, 'took a perk');
  assert.equal(rules.perks(e).left, before - taken.length);
  const tv = rules.talents(e);
  let picked = null;
  for (const sk of tv.skills || []) { const tier = (sk.tiers || []).find(t => t.open !== false && (t.nodes || []).length); if (tier) { const r = rules.talent(e, 'pick', { skill: sk.skillId || sk.id, tier: tier.tier, node: tier.nodes[0].id }); if (r.ok) { picked = sk.skillId || sk.id; break; } } }
  assert.ok(picked, 'picked a talent at level 12');
  // walk to the town's Unbinder and talk
  const town = w.P.values().next().value.towns[0];
  const ub = [...town.objects.values()].find(x => x.data && x.data.npc && x.data.npc.role === 'unbinder');
  w.transfer(o, town, { x: ub.x + 1, z: ub.z }, 'test'); await run(clock, 400);
  a.use(ub.id); await until(clock, () => used.some(m => m.unbinder), 2000);
  const offer = used.find(m => m.unbinder).unbind;
  assert.ok(offer && offer.perkAll > 0 && offer.talentAll > 0, 'priced: ' + JSON.stringify(offer));
  assert.equal(offer.title, 'Unbinder — resets talents & perks');
  assert.equal(offer.has.perks, true);
  o.char.gold = 100000;
  a.perk('reset', {}); await until(clock, () => pr.length, 2000);
  assert.equal(pr[0].ok, true, JSON.stringify(pr[0]));
  assert.equal(rules.perks(e).left, before, 'every perk point back');
  assert.equal(o.char.gold, 100000 - offer.perkAll, 'paid the Unbinder');
  if (picked) {
    a.talent('clear', {}); await until(clock, () => tr.length, 2000);
    assert.equal(tr[0].ok, true, JSON.stringify(tr[0]));
    assert.equal(Object.values(rules.talents(e).skills.find(s => (s.skillId || s.id) === picked).picks || {}).filter(Boolean).length, 0, 'talents cleared');
  }
  a.close();
});

test('teardown', async () => { if (W) await W.srv.stop(); });
