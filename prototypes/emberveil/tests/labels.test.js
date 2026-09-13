// Node and encounter labels must not lie about how many enemies are waiting.
//
// This is here because a "Goblin Pair" node fought three goblins: entering a combat node can upgrade
// the encounter to a named leader *with followers*, which makes the fight bigger while the map label
// stays the same. The rule now is: a name that promises a head count ("lone", "pair", "trio", or a
// crowd word like "band"/"patrol") has to be kept, and anything that changes the size of a fight
// either leaves those alone or renames the fight (js/game.js countWordIn / labelFits / encounterLabel).
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Game, countWordIn, groupWordIn, labelFits } from '../js/game.js';
import { makeRng } from '../js/rng.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const data = { items: J('items.json'), classes: J('classes.json'), skills: J('skills.json'), builds: J('build-presets.json'), enemies: J('enemies.json'), bosses: J('bosses.json'), encounters: J('encounters.json'), spells: J('enemy-spells.json'), zones: J('zones.json'), zoneTables: J('zone-tables.json'), dialogs: J('dialog-events.json'), randomEvents: J('random-events.json'), dungeons: J('dungeons.json'), companions: J('companions.json'), statuses: J('status-effects.json'), named: J('named-enemies.json'), sideQuests: J('side-quests.json'), balance: J('balance.json'), crossings: J('crossings.json') };
const ENC = data.encounters.encounters;
const sizeOf = enc => (enc.enemies || []).reduce((s, g) => s + (g.count || 1), 0);

function newGame(seed = 9) {
  const g = new Game(data); g.rng = makeRng(seed);
  for (const [c, n] of [['warrior', 'A'], ['ranger', 'B'], ['mage', 'C'], ['cleric', 'D']]) g.addHero(g.makeHero(c, n));
  g.startQuests(); return g;
}

test('the number words themselves read correctly', () => {
  assert.equal(countWordIn('Lone Goblin'), 1);
  assert.equal(countWordIn('Goblin Pair'), 2);
  assert.equal(countWordIn('A trio of thieves'), 3);
  assert.equal(countWordIn('Goblin Patrol'), null, 'a patrol is a crowd, not a number');
  assert.equal(groupWordIn('Goblin Patrol'), 3);
  assert.equal(countWordIn('Alone in the dark'), null, '"alone" is not "lone"');
  assert.equal(countWordIn('Stonework'), null, '"one" inside another word does not count');
  assert.ok(labelFits('Goblin Pair', 2)); assert.ok(!labelFits('Goblin Pair', 3));
  assert.ok(labelFits('Ash Patrol', 4)); assert.ok(!labelFits('Ash Patrol', 2));
  assert.ok(labelFits('Ruined Watch', 7), 'a name with no number word is always fine');
});

test('every encounter whose name carries a number word has exactly that many enemies', () => {
  const bad = [];
  for (const [id, enc] of Object.entries(ENC)) { const n = sizeOf(enc); if (!labelFits(enc.name || '', n)) bad.push(`${id}: "${enc.name}" but ${n} enem${n === 1 ? 'y' : 'ies'}`); }
  assert.deepEqual(bad, []);
});

test('every map node whose name carries a number word matches the encounter behind it', () => {
  const g = newGame(); const bad = [];
  for (const zid of g.zoneOrder) for (const node of g.zone(zid).nodes) {
    const enc = node.encounter ? ENC[node.encounter] : null; if (!enc) continue;
    const n = sizeOf(enc);
    if (!labelFits(node.name || '', n)) bad.push(`${zid}:${node.id} "${node.name}" → ${node.encounter} has ${n}`);
  }
  assert.deepEqual(bad, []);
});

test('entering a node never produces a fight that contradicts its name — including named leaders', () => {
  const bad = [];
  // Named leaders and nemeses are rolled for, so walk every node many times with different luck.
  for (let seed = 1; seed <= 25; seed++) {
    const g = newGame(seed);
    g.nemeses.push({ name: 'Vraak', title: 'the Patient', templateId: 'goblin_warrior', mods: ['tough'], defeats: 1, zone: 'prologue', sinceDay: 1 });
    for (const zid of g.zoneOrder) {
      g.zoneId = zid; g.unlockedZones.push(zid); g.act = Math.max(1, g.zone(zid).act);
      for (const node of g.zone(zid).nodes) {
        g.nodeId = node.id; const res = g.enter(node);
        if (res.kind !== 'combat' || !res.encounter) continue;
        const n = res.encounter.enemies.length;
        if (!labelFits(node.name || '', n)) bad.push(`seed ${seed} ${zid}:${node.id} "${node.name}" → ${n} enemies (${res.encounter.name})`);
        if (!labelFits(res.encounter.name || '', n)) bad.push(`seed ${seed} ${zid}:${node.id} encounter named "${res.encounter.name}" but ${n} enemies`);
        assert.ok(res.label, `${zid}:${node.id} reports a label for the fight it is actually running`);
      }
    }
  }
  assert.deepEqual(bad.slice(0, 8), []);
});

test('a named leader on a "pair" node is refused; on an unnumbered node it is allowed', () => {
  // The prologue's second fight is the one the bug was reported on.
  let sawThree = false;
  for (let seed = 1; seed <= 60; seed++) {
    const g = newGame(seed); g.zoneId = 'prologue'; const node = g.zone('prologue').nodes.find(n => n.name === 'Goblin Pair');
    assert.ok(node, 'the Goblin Pair node still exists');
    g.nodeId = node.id; const res = g.enter(node);
    assert.equal(res.encounter.enemies.length, 2, `seed ${seed}: Goblin Pair must be two goblins`);
    assert.equal(res.encounter.named, undefined, 'no named leader muscles in on a numbered node');
    if (res.encounter.enemies.length === 3) sawThree = true;
  }
  assert.equal(sawThree, false);
  // an unnumbered node may still get a leader, which is the point of them
  let sawNamed = false;
  for (let seed = 1; seed <= 80 && !sawNamed; seed++) {
    const g = newGame(seed); g.zoneId = 'border_roads'; g.unlockedZones.push('border_roads'); g.act = 1;
    const node = g.zone('border_roads').nodes.find(n => ['combat', 'ambush'].includes(n.type) && !countWordIn(n.name) && !groupWordIn(n.name));
    if (!node) break; g.nodeId = node.id; if (g.enter(node).encounter?.named) sawNamed = true;
  }
  assert.equal(sawNamed, true, 'named leaders still happen on nodes that promised nothing');
});

test('encounterLabel describes the group that is actually standing there', () => {
  const g = newGame();
  const one = { enemies: [{ name: 'Goblin Scout' }] };
  const two = { enemies: [{ name: 'Goblin Scout' }, { name: 'Goblin Scout' }] };
  const three = { enemies: [{ name: 'Goblin Scout' }, { name: 'Goblin Scout' }, { name: 'Goblin Scout' }] };
  const five = { enemies: Array.from({ length: 5 }, () => ({ name: 'Goblin Scout' })) };
  const mixed = { enemies: [{ name: 'Goblin Scout' }, { name: 'Goblin Warrior' }, { name: 'Goblin Warrior' }] };
  assert.equal(g.encounterLabel(one), 'Lone Goblin Scout');
  assert.equal(g.encounterLabel(two), 'Goblin Scout pair');
  assert.equal(g.encounterLabel(three), 'Goblin Scout trio');
  assert.match(g.encounterLabel(five), /band \(5\)/);
  assert.equal(g.encounterLabel(mixed), 'Goblin Scout and 2 Goblin Warriors');
  assert.equal(g.encounterLabel({ named: { name: 'Vraak the Patient' }, enemies: [{ name: 'x' }, { name: 'y' }] }), 'Vraak the Patient and followers');
  assert.equal(g.encounterLabel({ enemies: [{ name: 'Champion Goblin Scout' }, { name: 'Goblin Scout' }] }), 'Goblin Scout pair', 'a champion is still one of them');
  // whatever it says, it says something true
  for (const enc of [one, two, three, five, mixed]) assert.ok(labelFits(g.encounterLabel(enc), enc.enemies.length));
});

test('night raids that grow or shrink rename themselves', () => {
  const bad = [];
  for (let seed = 1; seed <= 40; seed++) {
    const g = newGame(seed); g.zoneId = 'border_roads'; g.unlockedZones.push('border_roads'); g.act = 1;
    for (const v of ['none', 'coach', 'ox_cart', 'war_wagon']) {
      g.vehicle = v; const enc = g.nightEncounter(); if (!enc) continue;
      const n = enc.enemies.length;
      if (!labelFits(enc.name || '', n)) bad.push(`seed ${seed} ${v}: "${enc.name}" but ${n} enemies`);
    }
  }
  assert.deepEqual(bad.slice(0, 8), []);
});
