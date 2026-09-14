// The world rules round 20 added or changed, pinned down: travel one node at a time, revives, quests
// (board, road and markers), humanoid fights for humanoid events, and the removal of the original's
// real-time weapon layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Game, REVIVE } from '../js/game.js';
import { pickCrossingFight } from '../js/explore.js';
import { makeRng } from '../js/rng.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const data = {
  items: J('items.json'), classes: J('classes.json'), skills: J('skills.json'), builds: J('build-presets.json'),
  enemies: J('enemies.json'), bosses: J('bosses.json'), encounters: J('encounters.json'), spells: J('enemy-spells.json'),
  zones: J('zones.json'), zoneTables: J('zone-tables.json'), dialogs: J('dialog-events.json'),
  randomEvents: J('random-events.json'), dungeons: J('dungeons.json'), companions: J('companions.json'),
  statuses: J('status-effects.json'), named: J('named-enemies.json'), sideQuests: J('side-quests.json'),
  classQuests: J('class-quests.json'), balance: J('balance.json'), crossings: J('crossings.json'),
  families: J('enemy-families.json'), roadQuests: J('road-quests.json'),
};
/** A party with no healer in it, so the revive rules are actually visible. */
function newGame(classIds = ['warrior', 'ranger', 'rogue', 'mage']) {
  const g = new Game(data); g.rng = makeRng(7);
  classIds.forEach((c, i) => g.addHero(g.makeHero(c, 'H' + i)));
  g.startQuests(); return g;
}
const zones = Object.values(data.zones).filter(Array.isArray).flat().filter(z => z?.id && z.nodes?.length);

// ── travel ────────────────────────────────────────────────────────────────────────────────────
test('travel is one node at a time: only the neighbours are open, in either direction, and each step costs a move', () => {
  const g = newGame(); g.unlockedZones.push('border_roads'); g.enterZone('border_roads');
  const here = g.node();
  const nb = new Set(g.neighbours(here.id));
  assert.deepEqual(new Set(g.reachable()), nb, 'reachable is exactly the neighbours');

  // walk one step, then check the way back is open and nothing further is
  const first = g.reachable()[0];
  assert.ok(g.travel(first));
  assert.ok(g.reachable().includes(here.id), 'the party can turn round and walk back');
  assert.equal(g.legsUsed, 1, 'walking on costs a move');
  assert.ok(g.travel(here.id), 'walking back is allowed');
  assert.equal(g.legsUsed, 2, 'walking back costs a move too — there is no free teleport');

  // a node visited earlier but two trails away is NOT reachable (the old fast travel is gone)
  const far = g.zone().nodes.find(n => !nb.has(n.id) && n.id !== here.id);
  g.visited.border_roads.push(far.id);
  assert.equal(g.canTravel(far.id), false, 'a visited node further away is still not one move away');
  assert.equal(g.travel(far.id), null);
});

test('every zone has somewhere to buy food and see a cleric (there is no fast travel any more)', () => {
  const missing = zones.filter(z => z.act >= 1 && !z.nodes.some(n => n.type === 'town')).map(z => z.id);
  assert.deepEqual(missing, [], 'act zones without a settlement');
  // and it is near the entrance, not at the far end
  for (const z of zones) {
    const town = z.nodes.find(n => n.type === 'town'); if (!town) continue;
    const byId = Object.fromEntries(z.nodes.map(n => [n.id, n]));
    const targets = new Set(z.nodes.flatMap(n => (n.exits || []).filter(e => byId[e])));
    const start = byId.start || z.nodes.find(n => !targets.has(n.id));
    const d = { [start.id]: 0 }; const q = [start.id];
    while (q.length) { const id = q.shift(); for (const e of byId[id]?.exits || []) if (byId[e] && d[e] == null) { d[e] = d[id] + 1; q.push(e); } }
    assert.ok(d[town.id] <= 1, `${z.id}: the settlement is ${d[town.id]} moves in, it should be at the mouth of the zone`);
  }
});

// ── revives ───────────────────────────────────────────────────────────────────────────────────
test('a fallen hero stays down without a healer, and a healer puts them back up after a fight', () => {
  const g = newGame();                       // warrior / ranger / rogue / mage — nobody heals
  assert.equal(g.healers().length, 0);
  const down = g.party[1]; down.alive = false; down.hp = 0;
  const enc = g.encounter('goblin_patrol'); g.zoneId = 'border_roads'; g.act = 1;
  const v = g.victory(null, enc);
  assert.equal(v.revived.length, 0, 'nobody in this party can pick anyone up');
  assert.equal(down.alive, false, 'the fallen hero is still down after the win');
  assert.ok(v.stillDown.some(h => h === down));

  // the same fight with a cleric in the party
  const g2 = newGame(['warrior', 'cleric', 'rogue', 'mage']);
  assert.ok(g2.healers().length >= 1, 'a cleric is a healer');
  const d2 = g2.party[2]; d2.alive = false; d2.hp = 0;
  g2.zoneId = 'border_roads'; g2.act = 1;
  const v2 = g2.victory(null, g2.encounter('goblin_patrol'));
  assert.equal(v2.revived.length, 1);
  assert.equal(d2.alive, true);
  assert.equal(d2.hp, Math.round(d2.maxHp * REVIVE.healerHp));
  assert.equal(d2.revivedBy.by, g2.party[1].id, 'the cleric is recorded as the one who did it');
  assert.equal(d2.revivedBy.byName, g2.party[1].short);
  assert.equal(d2.revivedBy.source, 'healer');
  assert.ok(g2.revives.length >= 1, 'the party keeps a list of them');
  assert.ok(g2.banks[d2.id].memories.some(m => m.type === 'revive'), 'a revive is a memory both of them keep');
});

test('a night in camp does not raise the dead, but a healer sitting up with them does', () => {
  const g = newGame(); g.unlockedZones.push('border_roads'); g.enterZone('border_roads');
  const down = g.party[0]; down.alive = false; down.hp = 0;
  const out = g.rest();
  assert.equal(out.revived.length, 0);
  assert.equal(down.alive, false, 'sleeping it off is not a revive');

  const g2 = newGame(['cleric', 'warrior', 'rogue', 'mage']);
  g2.unlockedZones.push('border_roads'); g2.enterZone('border_roads');
  const d2 = g2.party[1]; d2.alive = false; d2.hp = 0;
  const o2 = g2.rest();
  assert.equal(o2.revived.length, 1);
  assert.equal(d2.alive, true);
});

test('a shrine, a settlement cleric and a revive item all wake the fallen', () => {
  // shrine
  const g = newGame(); g.unlockedZones.push('border_roads'); g.enterZone('border_roads');
  const shrine = g.zone().nodes.find(n => n.type === 'shrine');
  if (shrine) {
    g.party[0].alive = false; g.party[0].hp = 0; g.nodeId = shrine.id;
    const res = g.enter(shrine);
    assert.equal(res.kind, 'shrine');
    assert.equal(res.revived.length, 1);
    assert.equal(g.party[0].alive, true);
    assert.equal(g.party[0].revivedBy.source, 'shrine');
  }
  // town cleric
  const g2 = newGame(); g2.zoneId = 'border_roads'; g2.act = 1;
  g2.party[3].alive = false; g2.party[3].hp = 0;
  const out = g2.clericRest(g2.townFor());
  assert.equal(out.revived.length, 1);
  assert.equal(g2.party[3].alive, true);
  assert.equal(g2.party[3].revivedBy.source, 'town');
  // the expensive flask a party with no healer has to carry
  const draught = data.items.potions.emberheart_draught;
  assert.ok(draught, 'the shop sells an expensive revive');
  assert.equal(draught.effect.type, 'revive');
  assert.ok(draught.cost >= 400, 'and it is expensive');
  const g3 = newGame(); g3.party[2].alive = false; g3.party[2].hp = 0;
  const r = g3.revive(g3.party[2], { by: g3.party[0], how: 'the Emberheart Draught', hpFrac: draught.effect.pct, source: 'item' });
  assert.equal(r.source, 'item');
  assert.equal(g3.party[2].hp, Math.round(g3.party[2].maxHp * draught.effect.pct));
});

test('losing a fight is not the end: the party wakes in town', () => {
  const g = newGame(); g.unlockedZones.push('border_roads'); g.enterZone('border_roads');
  for (const h of g.party) { h.alive = false; h.hp = 0; }
  g.defeat();
  assert.ok(g.party.every(h => h.alive));
  assert.equal(g.node().type, 'town', 'you wake in the settlement');
});

// ── quests ────────────────────────────────────────────────────────────────────────────────────
test('every act carries at least two bounties of its own, and every one points at a real node', () => {
  const byAct = {};
  for (const q of data.sideQuests.quests) (byAct[q.act] ||= []).push(q);
  for (let act = 1; act <= 6; act++) assert.ok((byAct[act] || []).length >= 2, `act ${act} only has ${(byAct[act] || []).length} bounties`);
  const bad = [];
  for (const q of data.sideQuests.quests) {
    if (!q.targetNode) continue;
    const z = zones.find(x => x.id === q.zone);
    if (!z) { bad.push(`${q.id}: no zone ${q.zone}`); continue; }
    if (!z.nodes.some(n => n.id === q.targetNode)) bad.push(`${q.id}: ${q.zone} has no node ${q.targetNode}`);
  }
  assert.deepEqual(bad, []);
});

test('a stranger on the road offers a job worth more than the town board, aimed at a real place', () => {
  const g = newGame(); g.unlockedZones.push('border_roads'); g.enterZone('border_roads'); g.act = 2;
  const ev = g.roadQuestEvent(makeRng(11));
  assert.ok(ev, 'an offer was made');
  assert.ok(ev.npcName && ev.lines.length, 'somebody with lines makes it');
  const q = ev.roadQuest;
  const z = g.zones[q.zone];
  assert.ok(z.nodes.some(n => n.id === q.targetNode), 'it points at a node that exists');
  assert.ok(!g.cleared.includes(`${q.zone}:${q.targetNode}`), 'and one that is not already done');
  const board = data.sideQuests.quests.filter(x => x.act === 2).map(x => x.gold);
  assert.ok(q.gold > Math.min(...board), `road job pays ${q.gold}, the board pays ${board.join('/')}`);
  assert.ok(ev.lines.every(l => !l.text.includes('{target}')), 'the place is named in the lines');

  // taking it files it like any other bounty, and clearing the node pays out
  const out = g.choose(ev, ev.choices[0]);
  assert.ok(out.rewards.some(t => t.includes(q.title)));
  assert.ok(g.quests.active.includes(q.id));
  assert.equal(g.questById(q.id).id, q.id);
  const gold = g.gold;
  g.cleared.push(`${q.zone}:${q.targetNode}`);
  const done = g.checkSideQuests();
  assert.ok(done.some(x => x.id === q.id), 'it completes like a board bounty');
  assert.equal(g.gold, gold + q.gold);
});

test('the map knows where the quests are', () => {
  const g = newGame(); g.unlockedZones.push('thornwood'); g.enterZone('thornwood'); g.act = 1;
  g.acceptSideQuest('sq_thornwood_spider');
  const marks = g.questMarkers('thornwood');
  assert.ok(marks.some(m => m.nodeId === 'thornwood_boss' && m.kind === 'bounty'), JSON.stringify(marks));
  assert.ok(marks.every(m => g.zone('thornwood').nodes.some(n => n.id === m.nodeId)), 'every marker is on a real node');
  // a bounty in another zone does not litter this map
  g.acceptSideQuest('sq_dust_obsidian');
  assert.ok(!g.questMarkers('thornwood').some(m => m.title === 'Obsidian Garrison'));
});

// ── who turns up when a toll goes wrong ───────────────────────────────────────────────────────
test('tolls, bandits and gate wardens send people, not cinder hounds', () => {
  const g = newGame(); g.unlockedZones.push('dust_roads'); g.enterZone('dust_roads'); g.act = 2;
  // the zone's own pool is all wraiths, hounds and golems — that was the bug
  const pool = data.zones.ZONE_ENCOUNTER_POOLS.dust_roads;
  assert.ok(pool.every(id => g.encounterFamily(id) !== 'humanoid'), 'the Dust Roads pool really has nobody with hands in it');

  const toll = data.crossings.crossings.find(c => c.id === 'toll_stone');
  assert.equal(toll.enemyFamily, 'humanoid');
  for (let i = 0; i < 20; i++) {
    const id = pickCrossingFight(g, makeRng(i), toll);
    assert.equal(g.encounterFamily(id), 'humanoid', `${id} is not a fight against people`);
  }
  // an ordinary crossing still gets whatever haunts the zone
  const ford = data.crossings.crossings.find(c => c.id === 'cold_ford');
  assert.ok(pool.includes(pickCrossingFight(g, makeRng(3), ford)));

  // the same for a toll event: `startCombat: true` used to resolve to nothing at all
  const ev = data.randomEvents.RANDOM_EVENTS.find(e => e.id === 'combat_bandit_toll');
  assert.ok(g.isHumanoidEvent(ev));
  for (let i = 0; i < 20; i++) {
    const id = g.combatFor(ev, true, makeRng(i));
    assert.ok(id && data.encounters.encounters[id], `${id} is not a real encounter`);
    assert.equal(g.encounterFamily(id), 'humanoid');
  }
  // a fight named outright is still that fight
  assert.equal(g.combatFor(ev, 'bandit_ambush', makeRng(1)), 'bandit_ambush');
});

// ── night raids ───────────────────────────────────────────────────────────────────────────────
test('a night raid is bigger and tougher than the same fight by daylight, and pays more', () => {
  const g = newGame(); g.unlockedZones.push('dust_roads'); g.enterZone('dust_roads'); g.act = 2;
  const N = g.nightRaid();
  assert.ok(N.extra >= 1 && N.hp > 1 && N.xp > 1 && N.gold > 1);
  const day = g.encounter('ember_ambush');
  g.rng = makeRng(5); const night = g.nightEncounter();
  assert.ok(night.night);
  assert.ok(night.name.startsWith('Night raid:'));
  // and the odds of being woken up at all are the ~35% the world block asks for
  const chance = g.nightAttack().chance;
  assert.ok(chance > 0.25 && chance < 0.55, `night attack chance is ${chance}`);
  assert.ok(day.enemies.length >= 1);
});

// ── the real-time weapon layer is gone ────────────────────────────────────────────────────────
test('nothing in the data or the rewards mentions the original real-time weapon layer', () => {
  const files = ['random-events.json', 'dialog-events.json', 'balance.json', 'items.json', 'crossings.json'];
  const bad = [];
  for (const f of files) {
    const raw = fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8');
    if (/"tapItem"|"tapPower"|"tap"\s*:/.test(raw)) bad.push(f);
    if (/\btap_[a-z]/.test(raw)) bad.push(f + ' (an id still starts with tap_)');
  }
  assert.deepEqual(bad, []);
  // and the rewards that used to hand one out roll real loot instead
  const g = newGame();
  const before = g.inventory.length;
  const out = g.applyReward({ buildLoot: 'jewelry', buildLootRarity: 'rare' });
  assert.equal(g.inventory.length, before + 1);
  assert.equal(g.inventory.at(-1).rarity, 'rare');
  assert.ok(out.some(t => t.startsWith('found ')));
});
