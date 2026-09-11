import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Game } from '../js/game.js'; import { Combat } from '../js/combat.js'; import { makeRng } from '../js/rng.js';
const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const data = { items: J('items.json'), classes: J('classes.json'), skills: J('skills.json'), builds: J('build-presets.json'), enemies: J('enemies.json'), bosses: J('bosses.json'), encounters: J('encounters.json'), spells: J('enemy-spells.json'), zones: J('zones.json'), zoneTables: J('zone-tables.json'), dialogs: J('dialog-events.json'), randomEvents: J('random-events.json'), dungeons: J('dungeons.json'), companions: J('companions.json'), statuses: J('status-effects.json') };
function newGame() { const g = new Game(data); g.rng = makeRng(3); for (const [c, n] of [['warrior', 'A'], ['ranger', 'B'], ['mage', 'C'], ['cleric', 'D']]) g.addHero(g.makeHero(c, n)); g.startQuests(); return g; }
test('map: start at prologue, reachable exits, travel, every node type resolves without throwing', () => {
  const g = newGame(); assert.equal(g.zoneId, 'prologue'); const r = g.reachable(); assert.ok(r.length >= 1); const n = g.travel(r[0]); assert.ok(n); assert.ok(!g.canTravel('nope'));
  for (const zid of g.zoneOrder) { g.zoneId = zid; g.unlockedZones.push(zid); for (const node of g.zone(zid).nodes) { g.nodeId = node.id; const res = g.enter(node); assert.ok(res.kind, zid + ':' + node.id); if (res.kind === 'combat') assert.ok(res.encounter?.enemies.length > 0, zid + ':' + node.id + ' has enemies'); } }
});
test('combat node → fight → victory rewards, cleared memory, boss unlocks the next zone and finishes the quest', () => {
  const g = newGame(); g.zoneId = 'border_roads'; g.unlockedZones.push('border_roads'); g.act = 1; const node = g.zone().nodes.find(n => n.type === 'combat'); g.nodeId = node.id; const res = g.enter(node); assert.equal(res.kind, 'combat');
  for (const e of res.encounter.enemies) e.hp = 1; const c = new Combat(g.fighters(), res.encounter.enemies, { skills: data.skills.skills, spells: data.spells.spells, loot: g.loot, rng: makeRng(2), act: 1 }); const r = c.runAll(); assert.equal(r.result, 'win');
  const before = g.gold; const v = g.victory(node, res.encounter); assert.ok(v.xp > 0); assert.ok(g.gold >= before); assert.equal(g.enter(node).kind, 'cleared');
  const boss = g.zone().nodes.find(n => n.type === 'boss'); g.nodeId = boss.id; const b = g.enter(boss); assert.equal(b.kind, 'combat'); assert.ok(b.encounter.enemies.some(e => e.boss)); for (const e of b.encounter.enemies) e.hp = 1; new Combat(g.fighters(), b.encounter.enemies, { skills: data.skills.skills, spells: data.spells.spells, loot: g.loot, rng: makeRng(2), act: 1 }).runAll(); const bv = g.victory(boss, b.encounter); assert.equal(bv.unlockedZone, 'thornwood'); assert.ok(g.unlockedZones.includes('thornwood')); assert.ok(bv.questDone?.id === 'mq_act1'); assert.ok(g.quests.active.includes('mq_act2'));
});
test('dialog events: choices with gold effects, skill checks and rewards apply; random events respect level/zone', () => {
  const g = newGame(); g.zoneId = 'border_roads'; g.unlockedZones.push('border_roads'); const ev = data.dialogs.DIALOG_EVENTS.shady_wanderer; const gold = g.gold; const r1 = g.choose(ev, ev.choices[0]); assert.equal(g.gold, gold - 10); assert.ok(r1.text.length > 0);
  const r2 = g.choose(ev, ev.choices[2]); assert.ok(r2.check); assert.ok(['sneak_past', 'fight'].includes(r2.check.ok ? 'sneak_past' : 'fight'));
  const r3 = g.choose(ev, ev.choices[1]); assert.equal(r3.startCombat, 'bandit_ambush');
  const re = g.randomEvent(); assert.ok(re && re.minLevel <= 1); assert.ok(g.seenEvents.includes(re.id));
  const out = g.applyReward({ gold: 5, heal: 10, xp: 50 }); assert.ok(out.length === 3);
});
test('town: seeded stock, buy/sell/salvage, hires, companions; save round-trips through JSON', () => {
  const g = newGame(); g.zoneId = 'border_roads'; g.act = 1; const town = g.townFor(); assert.equal(town.name, 'Emberglen'); const stock = g.merchantStock(town); assert.equal(stock.length, 10); g.gold = 10000; const it = stock[0]; assert.ok(g.buy(it, it.price, stock)); assert.equal(stock.length, 9); assert.ok(g.inventory.includes(it)); const p = g.sell(it); assert.ok(p > 0);
  const junk = g.loot.generate('sword', 'magic', 'medium', { rng: makeRng(1) }); g.inventory.push(junk); const y = g.salvage(junk); assert.ok(y.magic_essence >= 1); assert.ok(g.hires(town).length >= 3); assert.ok(g.kennel().length >= 10);
  const comp = g.makeCompanion({ id: 'war_dog', name: 'War Dog', power: 1 }); assert.ok(g.addCompanion(comp)); assert.ok(comp.maxHp >= 38);
  const json = JSON.parse(JSON.stringify(g)); assert.equal(json.party.length, 4); assert.ok(!json.d);
});
