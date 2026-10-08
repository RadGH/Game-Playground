// Stream E — owner feedback 8 (round-playtest8.md): W1 guards + no raid on a newcomer, W5 ox carts, W27 titles,
// W12 quest givers, W24 chests, W22 no light items, W19 backpacks, W4 quests against kills.
// Every test asks the DATA and the TOOLS, never a copied number: the rules being served are in the files themselves
// (guards.json `hold`, economy.json `targets`, titles.json `titled`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseNav, NAV } from '../../js/rules/terrain-read.js';
import { cartFare, settlements, GUARDS, NEWCOMER } from '../../tools/content-towns.mjs';
import { titledOf, JOB_ROLES } from '../../tools/content-titled.mjs';
import { raidTable } from '../../tools/sim-raid.mjs';
import { simulate } from '../../tools/sim-economy.mjs';
import { travelFare, configureEconomy } from '../../js/sim/economy-knobs.js';

const ROOT = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const tool = (name, ...args) => execFileSync(process.execPath, [fileURLToPath(new URL('tools/' + name, ROOT)), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const MAP = J('data/world/province-map.json').provinces.torbor_downs.map;
const WIDS = Object.values(MAP);
const QUEST = Object.fromEntries(WIDS.map(w => [w, J(`data/vignettes/placements/${w}.quest.json`).placements]));
const MAIN = Object.fromEntries(WIDS.map(w => [w, J(`data/vignettes/placements/${w}.json`)]));
const navs = {};
const nav = w => (navs[w] ||= parseNav(readFileSync(new URL(`data/zones/${w}/nav.bin`, ROOT))));
const standable = (w, x, z) => { const b = nav(w).at(x, z); return (b & NAV.WALK) !== 0 && !(b & (NAV.SOLID | NAV.BUILDING | NAV.DEEP | NAV.SHALLOW | NAV.STEEP)); };
const GUARD = J('data/provinces/guards.json'), CARTS = J('data/provinces/carts.json'), ECON = J('data/provinces/economy.json'), EV = J('data/quests/events.json');
const S = settlements();

// ---------------------------------------------------------------------------------------------------- the tools
test('W1/W5/W12/W27: the generated files are what the tools make (no stale data)', () => {
  for (const t of ['content-towns.mjs', 'content-givers.mjs', 'content-gear.mjs', 'content-crates.mjs', 'content-events.mjs']) tool(t, '--check');
});

// ---------------------------------------------------------------------------------------------------- W1
test('W1: every settlement has guards — at each gate it is meant to hold and in the square — standing on ground a body can stand on', () => {
  assert.deepEqual(GUARD.problems, []);
  for (const s of S) {
    const G = GUARDS[s.kind], posts = GUARD.posts.filter(p => p.settlement === s.id);
    const gates = Math.min(G.gates, s.gates.length);
    assert.equal(posts.filter(p => p.post === 'gate').length, gates * G.perGate, `${s.name}: gate guards`);
    assert.equal(posts.filter(p => p.post === 'square').length, G.square, `${s.name}: square guards`);
    for (const p of posts) {
      assert.ok(standable(s.wid, p.x, p.z), `${p.id}: stands on something solid, wet or steep`);
      assert.equal(p.titled, false, `${p.id}: a guard shows no title (W27)`);
      assert.ok(p.name && !/^guard$/i.test(p.name), `${p.id}: a name`);
      if (p.post === 'gate') {
        const g = s.gates.find(x => x.id === p.gate);
        assert.ok(g, `${p.id}: its gate exists`);
        assert.ok((p.x - g.x) * g.out[0] + (p.z - g.z) * g.out[1] < 0, `${p.id}: stands INSIDE its gate`);
        assert.ok(Math.hypot(p.x - g.x, p.z - g.z) < 12, `${p.id}: within 12 m of its gate`);
      } else assert.ok(Math.hypot(p.x - s.square.x, p.z - s.square.z) < s.square.r + 12, `${p.id}: by the square`);
    }
    // nobody stands on top of anybody
    for (const a of posts) for (const b of posts) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 1.8, `${a.id} and ${b.id} share a spot`);
  }
  // and every post is a row the server spawns
  const rows = Object.values(QUEST).flat().filter(p => p.type === 'guard');
  assert.equal(rows.length, GUARD.posts.length);
  for (const r of rows) assert.ok(r.role === 'guard' && r.titled === false && ['guard', 'sergeant'].includes(r.rank));
});

test('W1: no event near a town, and no raid, may start beside a newcomer — and a raid names the gates it comes in by', () => {
  const N = EV.director.newcomer;
  assert.ok(N.underLevel >= 3 && N.firstMinutes >= 10, 'the owner asked for under level 3 or the first 10 minutes');
  assert.deepEqual([N.underLevel, N.firstMinutes], [NEWCOMER.underLevel, NEWCOMER.firstMinutes]);
  const raids = EV.realm.filter(e => e.site && e.site.settlement);
  assert.ok(raids.some(e => e.site.settlement === 'Torborhold'));
  for (const e of raids) {
    const s = S.find(x => x.name === e.site.settlement);
    assert.ok(e.startOn && e.startOn.clearOfNewcomersM >= s.r + 100, `${e.id}: the whole town and its approaches are covered`);
    assert.ok(e.raid.gates.length === s.gates.length && e.raid.gates.every(g => s.gates.some(x => x.id === g.id)), `${e.id}: its gates are the town's`);
    assert.equal(e.raid.guards, GUARD.posts.filter(p => p.town === s.name).length);
    assert.ok(e.raid.guards >= 6, `${e.id}: a raided town has a real garrison`);
  }
  // every zone event a newcomer could wander into: the level-1-4 ones, and any within 400 m of a settlement
  for (const e of EV.zone) {
    const at = e.map[0];
    const near = Math.min(...S.map(s => { const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(s.wid).map(Number); return Math.hypot(s.x + zx * 2048 - at.x, s.z + zy * 2048 - at.z) - s.r; }));
    if ((e.level || 1) <= NEWCOMER.zoneLevel || near <= NEWCOMER.zoneNear) assert.ok(e.startOn && e.startOn.clearOfNewcomersM >= 150, `${e.id}: level ${e.level}, ${Math.round(near)} m from a town, and nothing keeps it off a newcomer`);
  }
  assert.equal(EV.director.raid.firstTarget, 'guard');
  assert.equal(GUARD.raid.neverFirstTarget, 'newcomer');
  assert.ok(GUARD.raid.newcomerThreatMult < 0.5);
});

test('W1: the guards hold the gate, and players still matter (guards.json `hold`, measured with the real rules)', async () => {
  const H = GUARD.hold, rows = await raidTable();
  assert.ok(rows.length >= 2);
  for (const r of rows) {
    // strong enough to hold: alone they clear the first wave and most are still standing
    assert.ok(r.alone.wave1, `${r.id}: the guards alone never clear wave 1`);
    assert.ok(r.alone.wave1.guardsStanding / r.posts >= H.wave1.minStandingShare, `${r.id}: only ${r.alone.wave1.guardsStanding}/${r.posts} guards stand after wave 1`);
    // weak enough that players matter: alone they do not finish the raid…
    assert.equal(r.alone.won, false, `${r.id}: the guards win the whole raid with nobody helping`);
    // …with players they do, comfortably inside the limit
    const withP = r[['', 'one', 'two', 'three'][H.wholeRaid.withPlayers[0]]];
    assert.ok(withP.won && withP.sec <= r.limitSec * H.wholeRaid.underLimitShare, `${r.id}: guards + ${H.wholeRaid.withPlayers[0]} players do not win in time`);
    // and the guards are worth having: the same players are faster with them than without
    assert.ok(!r.noGuardsTwo.won || r.two.sec < r.noGuardsTwo.sec, `${r.id}: the guards make no difference`);
    // a guard outlasts a raider but hits softer than a player
    assert.ok(r.guard.hp > r.raider.hp * 2 && r.guard.dps < r.player.dps, `${r.id}: a guard is a wall, not a hero`);
  }
});

test('W1: a knob in guards.json really reaches the model (move it and the answer moves)', async () => {
  const a = (await raidTable())[0], b = (await raidTable({ set: { hpMult: GUARD.rules.hpMult * 0.137 } }))[0];
  assert.ok(Math.abs(b.guard.hp / a.guard.hp - 0.137) < 0.01);
  const c = (await raidTable({ set: { vsBossMult: 1, dmgMult: 3.3 } }))[0];
  assert.equal(c.alone.won, true, 'strong guards would win alone — so the rule above is a real constraint on the numbers');
});

// ---------------------------------------------------------------------------------------------------- W5
test('W5: every settlement has a carter and a parked ox cart outside its main gate, off the road, on ground they can stand on', () => {
  assert.deepEqual(CARTS.problems, []);
  assert.equal(CARTS.stops.length, S.length, 'one stop per settlement');
  for (const s of S) {
    const st = CARTS.stops.find(x => x.town === s.name);
    assert.ok(st, s.name + ': no cart stop');
    const c = st.cart, k = st.carter;
    assert.ok(standable(s.wid, k.x, k.z), `${st.id}: the carter cannot stand there`);
    for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      assert.ok(standable(s.wid, c.x + dx, c.z + dz), `${st.id}: the cart is in a wall, water or a slope`);
      assert.ok(!(nav(s.wid).at(c.x + dx, c.z + dz) & NAV.ROAD), `${st.id}: the cart blocks the road`);
    }
    const dk = Math.hypot(k.x - c.x, k.z - c.z);
    assert.ok(dk >= 2 && dk <= 5.5, `${st.id}: the carter stands ${dk.toFixed(1)} m from the cart`);
    const out = Math.hypot(c.x - s.x, c.z - s.z);
    assert.ok(out > (s.wall ? s.wall.radius : s.r * 0.6), `${st.id}: the cart is outside the wall`);
    assert.ok(st.fromGate <= 70, `${st.id}: the cart is ${st.fromGate} m from the gate`);
    // the rows the server spawns
    const rows = QUEST[s.wid];
    const npc = rows.find(p => p.type === 'npc' && p.id === k.id), cart = rows.find(p => p.type === 'cart' && p.id === c.id);
    assert.ok(npc && npc.role === 'carter' && npc.cart === c.id && npc.titled === true, `${st.id}: carter row`);
    assert.ok(cart && cart.model === 'ox_cart' && cart.carter === k.id, `${st.id}: cart row`);
    // and the carter is an NPC of its zone's quest file with something to say
    const def = J(`data/quests/${st.sheet}.json`).npcs[k.id];
    assert.ok(def && def.role === 'carter' && def.greeting && def.placedBy === 'content-towns' && def.name === k.name);
  }
  assert.equal(new Set(CARTS.stops.map(s => s.carter.name)).size >= CARTS.stops.length * 0.9, true, 'carters have their own names');
});

test('W5: every town can be reached from every town, the fares are the fare rule, and they are sensible against an hour of questing', async () => {
  const ids = CARTS.stops.map(s => s.id);
  for (const id of ids) {
    const f = CARTS.fares[id];
    assert.equal(f.length, ids.length - 1, `${id}: reaches ${f.length} of ${ids.length - 1} towns`);
    for (const r of f) {
      assert.equal(r.gold, cartFare(ECON, r.metres), `${id} -> ${r.to}: fare`);
      assert.ok(r.hops >= 1 && ids.includes(r.next));
      const back = CARTS.fares[r.to].find(x => x.to === id);
      assert.ok(back && back.metres === r.metres && back.gold === r.gold, `${id} <-> ${r.to}: the same both ways`);
    }
    assert.deepEqual(f.map(r => r.metres), f.map(r => r.metres).slice().sort((a, b) => a - b), `${id}: nearest first`);
  }
  // a link is a real road of the routes file, or says it is a back lane
  const routes = new Set(J('data/provinces/torbor_downs-routes.json').routes.map(r => r.id));
  for (const l of CARTS.links) assert.ok(l.overland ? !l.route : routes.has(l.route), `${l.a}-${l.b}`);
  assert.ok(CARTS.links.filter(l => l.overland).length <= CARTS.links.length * 0.2, 'mostly real roads');
  // the knob really is the knob
  assert.notEqual(cartFare({ cart: { ...ECON.cart, metresPerGold: 77 } }, 5000), cartFare(ECON, 5000));
  // cheaper than a waystone over the same road, at any length a ride can be
  configureEconomy(ECON);
  for (const m of [500, 2000, 8000, 20000]) assert.ok(cartFare(ECON, m) < travelFare(m), `${m} m: cart ${cartFare(ECON, m)} vs waystone ${travelFare(m)}`);
  // sensible against an hour of questing (economy.json targets)
  const T = ECON.targets, r = await simulate({ levels: [1], hours: 2 });
  const hour = r.levels[1].activities.questing.gold;
  const next = Math.min(...CARTS.fares.cart_torborhold.map(f => f.gold)), nextTown = CARTS.fares.cart_torborhold.find(f => f.town === 'Orrinsford').gold;
  for (const g of [next, nextTown]) assert.ok(g / hour >= T.cartShare[0] && g / hour <= T.cartShare[1], `a ride to the next town is ${g} gold = ${(100 * g / hour).toFixed(1)}% of a level-1 hour (${hour})`);
  const far = Math.max(...Object.values(CARTS.fares).flat().map(f => f.gold));
  assert.ok(far / hour <= T.cartFarthestShare * 1.1, `the dearest ride (${far}) is ${(100 * far / hour).toFixed(0)}% of a level-1 hour`);
});

test('W5: carts walk the roads too, and a quest teaches the whole thing', () => {
  const W = J('data/provinces/wanderers.json'), k = W.kinds[CARTS.roaming.kind];
  assert.ok(k && k.offers === 'cart' && k.vehicle === 'ox_cart' && k.cart && k.crew[0].role === 'carter' && k.crew[0].titled === true);
  assert.ok(k.weight >= 2, 'common enough to meet');
  assert.ok(J('data/names/chatter.json').pools['role.carter'].length >= 5);
  assert.match(J('data/names/titles.json').roles.carter, /rides/i);
  const q = J('data/quests/start.json').quests.find(x => x.id === 'start_wheels_for_hire');
  assert.ok(q && q.tip && /carter/i.test(q.tip) && /fare/i.test(q.tip));
  const st = q.steps[0];
  assert.equal(st.kind, 'ride');
  assert.ok(CARTS.stops.some(s => s.id === st.to) && CARTS.stops.some(s => s.id === st.from));
  assert.equal(CARTS.stops.find(s => s.id === st.from).carter.id, q.giver, 'the carter who offers it is the one you ride with');
  assert.deepEqual(q.grant, [{ good: 'cart_token', count: 1 }]);
  assert.ok(J('data/provinces/shops.json').goodsCatalog.cart_token, 'the token is a real good');
  assert.ok(q.requires.includes('start_road_to_orrinsford'));
  // not a gate on the main chain
  assert.ok(!J('data/quests/start.json').quests.some(x => (x.requires || []).includes(q.id) || x.next === q.id));
  const m = J('data/quests/marks/torbor_downs.json').quests[q.id];
  assert.ok(m && m.giver && m.steps[0] && m.steps[0].to && m.steps[0].to.zone === 'z12_02');
});

// ---------------------------------------------------------------------------------------------------- W27 / W12
const GIVERS = J('data/quests/marks/givers.json'), TITLES = J('data/names/titles.json'), SHOPS = J('data/provinces/shops.json');
const shopRoles = new Set(Object.values(SHOPS.kinds).map(k => k.role));
const questFiles = readdirSync(new URL('data/quests/', ROOT)).filter(f => f.endsWith('.json')).map(f => [f, J('data/quests/' + f)]).filter(([, d]) => d.npcs);

test('W27: EVERY NPC record carries `titled`, true only for someone the player can get something from', () => {
  const flag = (v, where) => assert.equal(typeof v, 'boolean', where + ': no `titled` flag');
  // quest NPCs
  for (const [f, d] of questFiles) for (const [id, n] of Object.entries(d.npcs)) { flag(n.titled, f + ' ' + id); assert.equal(n.titled, true, `${id}: a quest NPC is titled`); }
  // town offices
  const O = J('data/provinces/offices.json');
  for (const t of Object.values(O.towns)) for (const o of t.offices) {
    flag(o.titled, t.name + ' ' + o.role);
    const service = !!(o.shop || o.npc || JOB_ROLES.includes(o.role) || shopRoles.has(o.role) || o.role === 'trainer' || o.role === 'reeve');
    assert.equal(o.titled, service, `${t.name} ${o.role} ${o.name}`);
  }
  for (const s of O.setpieces) flag(s.titled, s.npc);
  // the road: nobody but the one who offers something
  const T = J('data/provinces/travellers.json'), W = J('data/provinces/wanderers.json');
  for (const [k, v] of Object.entries(T.kinds)) for (const c of v.crew) { flag(c.titled, k); assert.equal(c.titled, false, `${k} ${c.role}: an ordinary traveller shows no title`); }
  for (const [k, v] of Object.entries(T.folk)) { flag(v.titled, 'folk ' + k); assert.equal(v.titled, false, `${k}: filler`); }
  assert.equal(T.folk.woodcutter.titled, false, 'the report\'s own example');
  for (const [k, v] of Object.entries(W.kinds)) v.crew.forEach((c, i) => { flag(c.titled, k); assert.equal(c.titled, i === 0 && !!(v.shop || v.offers || v.curious), `${k} ${c.role}`); });
  const R = J('data/provinces/road-events.json');
  for (const kind of ['deliver', 'escort', 'rescue']) for (const r of R[kind]) assert.equal(r.titled, true, r.id);
  // every row the server spawns from <zone>.quest.json
  for (const [w, rows] of Object.entries(QUEST)) for (const p of rows) if (['npc', 'guard'].includes(p.type)) { flag(p.titled, w + ' ' + p.id); assert.equal(p.titled, p.type === 'npc'); }
  // the main placement files are B's bake input and are not rewritten: their rows resolve through the rule in titles.json
  for (const [w, f] of Object.entries(MAIN)) for (const p of f.placements) {
    if (p.type === 'folk') { assert.equal(TITLES.titled.types.folk, false); assert.equal(titledOf(p), false, `${w} ${p.id}`); }
    if (p.type === 'npc') { assert.ok(GIVERS.npcs[p.id], `${w} ${p.id}: an npc row that is in no quest file`); assert.equal(GIVERS.npcs[p.id].titled, true); }
  }
});

test('W27: the rule as data — filler roles are off, service roles are on, and nothing falls back to a title', () => {
  const R = TITLES.titled;
  assert.equal(R.default, false);
  for (const r of Object.keys(TITLES.roles)) assert.equal(typeof R.roles[r], 'boolean', r + ': not in titled.roles');
  for (const r of ['woodcutter', 'townsfolk', 'villager', 'resident', 'farmer', 'farmhand', 'shepherd', 'pilgrim', 'traveller', 'guard', 'drover', 'pedlar', 'miner', 'hunter', 'weaver', 'fisher']) assert.equal(R.roles[r], false, r + ' is filler');
  for (const r of [...JOB_ROLES.filter(x => x in TITLES.roles), ...[...shopRoles].filter(x => x in TITLES.roles), 'trainer', 'carter']) assert.equal(R.roles[r], true, r + ' offers something');
  // E's list of job givers is the server's (js/sim/quests.js)
  const src = readFileSync(new URL('js/sim/quests.js', ROOT), 'utf8'), m = /const JOB_ROLES = new Set\(\[([^\]]+)\]\)/.exec(src);
  assert.deepEqual(m[1].split(',').map(s => s.trim().replace(/'/g, '')).sort(), [...JOB_ROLES].sort());
});

test('W12: every quest giver, hand-in and talk-to NPC is in the giver index, and has a body in the world', () => {
  assert.deepEqual(GIVERS.missing, []);
  const bodies = new Set([...Object.values(MAIN).flatMap(f => f.placements), ...Object.values(QUEST).flat()].filter(p => p.type === 'npc').map(p => p.id));
  let quests = 0;
  for (const [, d] of readdirSync(new URL('data/quests/', ROOT)).filter(f => f.endsWith('.json')).map(f => [f, J('data/quests/' + f)])) for (const q of d.quests || []) {
    if (!q.id || !q.steps) continue;
    quests++;
    if (q.giver) {
      const g = GIVERS.npcs[q.giver];
      assert.ok(g && g.gives.includes(q.id) && g.takes.includes(q.id), `${q.id}: giver ${q.giver}`);
      assert.ok(bodies.has(q.giver), `${q.id}: giver ${q.giver} has no body`);
      if (q.needsGiver) assert.ok(g.mustTake.includes(q.id));
    } else assert.ok(q.startsFrom && GIVERS.objects[q.startsFrom.vignette + '/' + q.startsFrom.object] || q.auto, `${q.id}: nobody gives it`);
    for (const st of q.steps) if ((st.kind === 'talk' || st.kind === 'deliver') && st.npc) { assert.ok(GIVERS.npcs[st.npc].talks.includes(q.id), `${q.id}: ${st.npc}`); assert.ok(bodies.has(st.npc), `${q.id}: ${st.npc} has no body`); }
  }
  assert.ok(quests > 100);
  for (const [id, n] of Object.entries(GIVERS.npcs)) { assert.ok(n.offers, id + ' offers nothing — why is it a quest NPC?'); assert.equal(n.jobs, JOB_ROLES.includes(n.role)); }
  // rows written by E's own tools carry the count
  for (const rows of Object.values(QUEST)) for (const p of rows) if (p.type === 'npc') assert.equal(p.quests, GIVERS.npcs[p.id].gives.length, p.id);
  // the map's town search (D-UI W15)
  const TS = J('data/provinces/town-services.json').towns;
  for (const s of S) assert.ok(TS[s.name] && TS[s.name].includes('carter'), s.name + ': services');
  assert.ok(['angler', 'stable', 'inn', 'trainer', 'unbinder', 'weaponsmith'].every(k => TS.Torborhold.includes(k)));
});

// ---------------------------------------------------------------------------------------------------- W24
test('W24: no chest can be locked by the order things die in', () => {
  const R = J('data/provinces/road-events.json');
  assert.equal(R.rules.chest.lockedBy, 'ownGuards');
  assert.ok(R.rules.chest.lootSec >= 120, 'the owner asked for two minutes');
  assert.ok(R.rules.chest.stuckSec > 0 && R.rules.chest.stuckSec <= R.rules.chest.lootSec);
  assert.ok(R.rules.chest.lootSec < R.rules.lifeSec);
  for (const c of R.chests) {
    if (c.guards[1] > 0) {
      assert.ok(c.guardTypes || c.guardFrom === 'nearestCamp', `${c.id}: guarded, but by what?`);
      assert.ok(c.guardWord, `${c.id}: what the objective calls its keepers`);
      for (const t of c.guardTypes || []) assert.ok(TYPES.has(t), `${c.id}: ${t} is not a monster`);
      for (const t of c.guardFallback || []) assert.ok(TYPES.has(t), `${c.id}: ${t} is not a monster`);
    } else assert.ok(!c.guardTypes && !c.guardFrom, `${c.id}: no guards, so nothing can lock it`);
  }
  // the report's own chest: its keepers ARE the smugglers the objective talks about
  const st = R.chests.find(c => c.id === 'smugglers_stash');
  assert.deepEqual(st.guardTypes, ['road_brigand', 'brigand_archer']);
  assert.match(st.info.objective.text, /smugglers/i);
  // event chests
  assert.equal(EV.director.chest.lockedBy, 'nothing');
  assert.ok(EV.director.chest.lootSec >= 120);
  // vignette chests: the only lock is one thing you USE in the same vignette, and that thing is locked by nothing
  let chests = 0, locked = 0;
  for (const f of ['m1.json', 'm2.json', 'm2b.json', 'setpieces.json', 'curios.json']) {
    const d = J('data/vignettes/' + f);
    for (const v of d.vignettes || d.curios || d.recipes || []) for (const o of v.objects || []) {
      if (o.type !== 'chest') continue;
      chests++;
      for (const k of Object.keys(o)) assert.ok(!/guard|kill|monster|order/i.test(k), `${v.id} chest: locked by "${k}"`);
      if (!o.after) continue;
      locked++;
      const key = v.objects.find(x => x.name === o.after);
      assert.ok(key && key.type !== 'chest' && !key.after, `${v.id}: chest waits on "${o.after}", which is ${key ? 'itself locked' : 'not there'}`);
    }
  }
  assert.ok(chests >= 20, 'chests found: ' + chests);
  assert.ok(locked <= chests * 0.5);
});
const TYPES = new Set(Object.values(J('data/provinces/torbor_downs.json').zones).flatMap(z => (z.camps || []).map(c => c.type)).concat(EV.realm.flatMap(e => (e.waves || []).map(w => w.type))));

// ---------------------------------------------------------------------------------------------------- W22 / W19
test('W22: no lantern, torch or light of any kind is sold, shelved, granted or put in a crate', () => {
  const LIGHTS = new Set([...(J('data/rules/gear-tv.json').lights.legacy || []), ...(J('data/rules/gear-tv.json').lights.goods || []), 'torch', 'lantern', 'torch_bundle', 'torches']);
  assert.ok(LIGHTS.has('hand_lantern') && LIGHTS.has('pitch_torch'));
  for (const [k, kind] of Object.entries({ ...SHOPS.kinds, ...J('data/provinces/wanderers.json').shops })) {
    assert.ok(!(kind.categories || {}).light, k + ': a light shelf');
    for (const c of Object.values(kind.categories || {})) for (const b of c.bases) assert.ok(!LIGHTS.has(b), `${k}: sells ${b}`);
    for (const g of kind.goods || []) assert.ok(!LIGHTS.has(g.id), `${k}: sells ${g.id}`);
  }
  for (const r of Object.values(SHOPS.roles)) for (const s of [...(r.sells || []), ...(r.goods || [])]) assert.ok(!LIGHTS.has(s.base || s.id), 'roles: ' + (s.base || s.id));
  for (const [id, g] of Object.entries(SHOPS.goodsCatalog)) assert.notEqual((g.use || {}).type, 'light', id);
  for (const t of Object.values(SHOPS.towns)) assert.ok(!/hand_lantern|pitch_torch|torch_bundle/.test(JSON.stringify(t)));
  for (const f of readdirSync(new URL('data/quests/', ROOT)).filter(x => x.endsWith('.json'))) {
    const d = J('data/quests/' + f);
    for (const q of d.quests || []) {
      for (const c of (q.reward && q.reward.crates) || []) assert.notEqual(c.slot, 'light', q.id);
      for (const g of [...(q.grant || []), ...((q.reward && q.reward.goods) || [])]) assert.ok(!LIGHTS.has(g.good || g.id), q.id);
      if (q.reward && q.reward.item) assert.ok(!LIGHTS.has(q.reward.item.base) && q.reward.item.slot !== 'light', q.id);
    }
  }
});

test('W19: backpacks are at the tailor (always the three plain ones, by level) and the plain satchel at the general store', () => {
  const packs = Object.entries(J('data/rules/gear-tv.json').bases.armor).filter(([, b]) => b.pack);
  assert.ok(packs.length >= 3);
  const tailor = SHOPS.kinds.tailor, bases = tailor.categories.armor.bases;
  for (const [id, b] of packs) {
    const g = tailor.goods.find(x => x.id === id);
    assert.ok(g && g.source === 'gear', id + ': not a fixed row at the tailor');
    assert.equal(g.minLevel, b.minLevel || 1, id + ': from the level stream C gives it');
    assert.ok(bases.includes(id), id + ': not on the tailor\'s shelf (magic and rare ones)');
    if ((b.minLevel || 1) > 6) assert.equal(tailor.categories.armor.minCap[id], b.minLevel, id + ': shelved only where the town reaches it');
  }
  // dearer the more it holds, and the first one is within a newcomer's first hour
  const rows = packs.map(([id, b]) => ({ slots: b.bagSlots, price: tailor.goods.find(x => x.id === id).price })).sort((a, b) => a.slots - b.slots);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].price > rows[i - 1].price);
  assert.ok(SHOPS.kinds.general.goods.some(g => g.id === packs.sort((a, b) => a[1].bagSlots - b[1].bagSlots)[0][0]));
  assert.ok(SHOPS.roles.tailor.sells.some(s => s.base === 'sling_satchel') || SHOPS.roles.tailor.goods.some(s => s.id === 'sling_satchel'), 'roles rebuilt');
  // a back crate on the start chain can hold one
  assert.ok(J('data/quests/start.json').quests.flatMap(q => (q.reward.crates || [])).filter(c => c.slot === 'back').length >= 2);
});

// ---------------------------------------------------------------------------------------------------- W4
test('W4: quests stay worth doing after kills pay more — and kills stay a fair share', async () => {
  const T = ECON.targets.questXp, r = await simulate({ levels: [1], hours: 1 });
  const first = (await simulate({ levels: [1], hours: 1, set: { 'economy.quest.xpMult': 1 } })).curve;
  for (let L = T.levels[0]; L <= T.levels[1]; L++) {
    const c = r.curve[L];
    assert.ok(c.questingOverKilling >= T.questingOverKilling[0] && c.questingOverKilling <= T.questingOverKilling[1], `level ${L}: an hour of questing is x${c.questingOverKilling} of an hour of killing`);
    assert.ok(c.handInShare >= T.handInShare[0] && c.handInShare <= T.handInShare[1], `level ${L}: hand-ins are ${c.handInShare} of a questing hour`);
    assert.ok(c.killsToLevel <= 25, `level ${L}: ${c.killsToLevel} kills to level by killing alone`);
    // the knob is read: without it a hand-in pays less
    assert.ok(first[L].questXp < c.questXp, 'economy.json quest.xpMult reaches the table');
  }
  // the first ten levels take about an hour and a half to two hours either way
  const sum = k => Object.values(r.curve).reduce((a, c) => a + c[k], 0);
  assert.ok(sum('minutesQuesting') >= 60 && sum('minutesQuesting') <= 150 && sum('minutesKilling') >= 60 && sum('minutesKilling') <= 150, `1-11: ${Math.round(sum('minutesQuesting'))} min questing, ${Math.round(sum('minutesKilling'))} min killing`);
});
