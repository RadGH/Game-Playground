// Crossing nodes (js/explore.js + data/crossings.json): every choice on every crossing resolves,
// difficulty rises with the act, rewards scale with it, failures cost something, and a party with
// nothing in its pockets can always still get past somehow.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Game } from '../js/game.js';
import { makeRng } from '../js/rng.js';
import { resolveCrossing, crossingChoices, choiceState, dcFor, crossingReward, payRetry, RETRY_COST, findItem } from '../js/explore.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const data = { items: J('items.json'), classes: J('classes.json'), skills: J('skills.json'), builds: J('build-presets.json'), enemies: J('enemies.json'), bosses: J('bosses.json'), encounters: J('encounters.json'), spells: J('enemy-spells.json'), zones: J('zones.json'), zoneTables: J('zone-tables.json'), dialogs: J('dialog-events.json'), randomEvents: J('random-events.json'), dungeons: J('dungeons.json'), companions: J('companions.json'), statuses: J('status-effects.json'), named: J('named-enemies.json'), sideQuests: J('side-quests.json'), balance: J('balance.json'), crossings: J('crossings.json') };
const CROSSINGS = data.crossings.crossings;

function newGame(seed = 5) {
  const g = new Game(data); g.rng = makeRng(seed);
  for (const [c, n] of [['warrior', 'A'], ['ranger', 'B'], ['mage', 'C'], ['cleric', 'D']]) g.addHero(g.makeHero(c, n));
  g.startQuests(); return g;
}
/** A party carrying everything any crossing could ask for. */
function wellSupplied(g) { g.gold = 5000; g.fame = 500; g.supplies = { ration: 9, bandages: 4, torch: 4, tent: 1, rope: 2, timber: 2 }; g.flags.gate_warrant = true; g.inventory.push({ id: 'lamp', name: 'Storm Lantern', rarity: 'magic', slot: 'offhand' }); return g; }

test('every crossing exists, is named, and has a way through for a party with nothing', () => {
  assert.ok(CROSSINGS.length >= 8, 'at least eight crossings');
  const ids = new Set();
  for (const c of CROSSINGS) {
    assert.ok(c.id && c.name && c.intro, c.id + ' is fully written');
    assert.ok(!ids.has(c.id), 'no duplicate crossing id ' + c.id); ids.add(c.id);
    assert.ok(c.choices.length >= 2, c.id + ' offers a choice');
    const g = newGame(); g.gold = 0; g.fame = 0; g.supplies = { ration: 0, bandages: 0, torch: 0, tent: 0, rope: 0, timber: 0 };
    const open = crossingChoices(g, c).filter(x => x.available);
    assert.ok(open.length >= 1, c.id + ' has something a broke, empty-handed party can still do');
    for (const ch of c.choices) assert.ok(ch.success, `${c.id}/${ch.id} says what happens on success`);
  }
});

test('every choice on every crossing resolves, in every act, without throwing', () => {
  for (let act = 1; act <= 6; act++) {
    for (const c of CROSSINGS) {
      for (const choice of c.choices) {
        const g = wellSupplied(newGame(act * 31 + c.id.length)); g.act = act; g.zoneId = 'border_roads'; g.unlockedZones.push('border_roads');
        const r = resolveCrossing(g, c, choice.id, makeRng(act * 7 + choice.id.length));
        const where = `${c.id}/${choice.id} act ${act}`;
        assert.equal(r.blocked, false, where + ' is possible for a well-supplied party: ' + r.why);
        assert.equal(typeof r.ok, 'boolean', where + ' says whether it worked');
        assert.ok(typeof r.text === 'string' && r.text.length > 0, where + ' has something to read');
        assert.ok(Array.isArray(r.costs), where + ' lists what it cost');
        if (r.ok && !r.fight) {
          assert.ok(r.rewards, where + ' pays out');
          for (const k of ['xp', 'gold', 'fame', 'drops']) assert.ok(k in r.rewards, where + ' reward has ' + k);   // same shape victory() returns
          assert.ok(Array.isArray(r.rewards.drops));
          assert.ok(r.rewards.xp > 0 && r.rewards.gold >= 0 && r.rewards.fame >= 0, where);
        }
        if (r.fight) assert.ok(typeof r.fight === 'string' && data.encounters.encounters[r.fight], where + ' names a real encounter');
        assert.ok(g.crossings.length >= 1, where + ' is written down');
      }
    }
  }
});

test('a choice the party cannot afford is blocked with a plain reason, and nothing changes', () => {
  const g = newGame(); g.gold = 0; g.supplies.rope = 0;
  const ford = CROSSINGS.find(c => c.id === 'cold_ford');
  const st = choiceState(g, ford, ford.choices.find(c => c.id === 'rope'));
  assert.equal(st.available, false); assert.match(st.why, /rope/);
  const before = JSON.stringify({ gold: g.gold, day: g.day, supplies: g.supplies });
  const r = resolveCrossing(g, ford, 'rope', makeRng(1));
  assert.equal(r.blocked, true); assert.equal(r.rewards, null);
  assert.equal(JSON.stringify({ gold: g.gold, day: g.day, supplies: g.supplies }), before, 'a blocked choice costs nothing');
  assert.equal(resolveCrossing(g, ford, 'not_a_choice', makeRng(1)).blocked, true);
});

test('difficulty rises with the act and stops at the cap; rewards rise with it too', () => {
  const g = newGame();
  // the numbers live in data/crossings.json's `difficulty` block, so read them rather than hardcoding
  const T = data.crossings.difficulty || { perAct: 2, cap: 26, rewardPerAct: 0.45 };
  const dcs = []; for (let act = 0; act <= 9; act++) { g.act = act; dcs.push(dcFor(g, 12)); }
  assert.equal(dcs[0], 12); assert.equal(dcs[1], 12 + T.perAct); assert.equal(dcs[6], Math.min(T.cap, 12 + 6 * T.perAct));
  for (let i = 1; i < dcs.length; i++) assert.ok(dcs[i] >= dcs[i - 1], 'never gets easier');
  assert.ok(dcs.at(-1) <= T.cap, 'capped');

  const choice = { reward: { mult: 1 } };
  const g1 = newGame(); g1.act = 1; const g6 = newGame(); g6.act = 6;
  const low = crossingReward(g1, choice, makeRng(4)), high = crossingReward(g6, choice, makeRng(4));
  assert.ok(high.xp > low.xp * (1 + 2.5 * T.rewardPerAct), 'act 6 pays much better than act 1');
  assert.ok(high.gold > low.gold);
  // a cheap way out pays much less than a hard one
  const easy = crossingReward(g6, { reward: { mult: 0.2 } }, makeRng(4));
  assert.ok(easy.xp < high.xp / 3, 'walking round the long way is not worth much');
});

test('failing a crossing hurts: damage, supplies, exhaustion or a lost day — and a retry costs a day and a ration', () => {
  const g = wellSupplied(newGame()); g.act = 6;                       // a high act makes the roll hard
  const ford = CROSSINGS.find(c => c.id === 'cold_ford');
  const hp = g.party.map(h => h.hp); const rations = g.supplies.ration;
  let failed = null;
  for (let seed = 1; seed < 60 && !failed; seed++) { const t = wellSupplied(newGame(seed)); t.act = 6; const r = resolveCrossing(t, ford, 'wade', makeRng(seed)); if (!r.ok) failed = { r, t }; }
  assert.ok(failed, 'a hard ford can be failed');
  assert.ok(failed.t.supplies.ration < 9 || failed.t.party.some((h, i) => h.hp < h.maxHp), 'failing costs food or blood');

  const g2 = wellSupplied(newGame()); const day = g2.day, food = g2.supplies.ration;
  payRetry(g2);
  assert.equal(g2.day, day + RETRY_COST.day); assert.equal(g2.supplies.ration, food - 1); assert.equal(g2.legsUsed, 0);
});

test('a crossing that eats a day moves the calendar on and gives the party their moves back', () => {
  const g = wellSupplied(newGame()); g.legsUsed = 3;
  const ford = CROSSINGS.find(c => c.id === 'cold_ford');
  const day = g.day;
  const r = resolveCrossing(g, ford, 'upstream', makeRng(2));
  assert.equal(r.ok, true); assert.equal(r.days, 1); assert.equal(g.day, day + 1); assert.equal(g.legsUsed, 0);
});

test('the party remembers a crossing, and the node stays open once it is beaten', () => {
  const g = wellSupplied(newGame()); g.zoneId = 'prologue';
  const node = g.zone('prologue').nodes.find(n => n.type === 'crossing');
  assert.ok(node, 'the map tool put a crossing in the prologue');
  const c = g.crossingFor(node); assert.ok(c && c.id);
  assert.equal(g.enter(node).kind, 'crossing');
  const r = resolveCrossing(g, c, c.choices.find(x => !x.needs && !x.check)?.id || c.choices[0].id, makeRng(3));
  assert.ok(!r.blocked);
  assert.ok(g.crossings.some(x => x.id === c.id), 'written in the crossing log');
  assert.ok(Object.values(g.banks).some(b => b.memories.some(m => m.details?.crossing === c.id)), 'the heroes remember it');
  g.clearCrossing(node);
  assert.equal(g.enter(node).kind, 'quiet', 'a beaten crossing is just road now');
});

test('items in the bag or worn open a choice; the gate opens on a flag or on fame', () => {
  const g = newGame();
  g.inventory.push({ id: 'i1', name: 'Storm Lantern', rarity: 'magic', slot: 'offhand' });
  assert.ok(findItem(g, 'lantern|torch|lamp'), 'a lantern in the bag counts');
  g.party[0].equipment.offhand = { id: 'i2', name: 'Hooded Lamp', slot: 'offhand' };
  g.inventory = [];
  assert.ok(findItem(g, 'lantern|torch|lamp'), 'a lantern being carried counts too');
  assert.equal(findItem(g, 'rope'), null);

  const gate = CROSSINGS.find(c => c.id === 'wardens_gate');
  const g2 = newGame(); g2.gold = 0; g2.fame = 0;
  const before = crossingChoices(g2, gate);
  assert.equal(before.find(c => c.id === 'papers').available, false);
  assert.equal(before.find(c => c.id === 'fame').available, false);
  g2.flags.gate_warrant = true; g2.fame = 80;
  const after = crossingChoices(g2, gate);
  assert.equal(after.find(c => c.id === 'papers').available, true);
  assert.equal(after.find(c => c.id === 'fame').available, true);
});

test('a trait makes the talking choices easier', () => {
  const g = newGame(); const toll = CROSSINGS.find(c => c.id === 'toll_stone');
  const plain = choiceState(g, toll, toll.choices.find(c => c.id === 'talk'));
  g.party[0].speech = { traits: ['silver_tongue'] };
  const smooth = choiceState(g, toll, toll.choices.find(c => c.id === 'talk'));
  assert.equal(plain.traitBonus, 0); assert.equal(smooth.traitBonus, 4);
  assert.ok(smooth.odds > plain.odds, 'the odds go up when somebody can talk');
});

test('the map tool gave every zone a crossing, and each one names a hazard that exists', () => {
  const g = newGame(); const ids = new Set(CROSSINGS.map(c => c.id));
  let zonesWith = 0;
  for (const zid of g.zoneOrder) {
    const nodes = g.zone(zid).nodes.filter(n => n.type === 'crossing');
    if (nodes.length) zonesWith++;
    assert.ok(nodes.length <= 2, zid + ' has at most two crossings');
    for (const n of nodes) { assert.ok(ids.has(n.crossingId), `${zid}:${n.id} points at a real crossing`); assert.ok(n.exits.length >= 1, `${zid}:${n.id} leads somewhere`); }
  }
  assert.ok(zonesWith >= 10, 'crossings are spread across the world, not bunched in one zone');
});
