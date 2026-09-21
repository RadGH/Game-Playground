// node --test prototypes/farhold/tests/round17-onboarding.test.js
//
// R17 — the five-step line that takes a new player from an empty field to an iron ingot.
//
//   "Let's add a brief onboarding quest line that holds the hand of the player and guides them
//    through accepting a quest at the starter town, harvesting basic resources, and starting a
//    basic base. This quest should require you to get enough resources to build the necessary
//    stuff required to smelt iron ore."
//
// The failure these tests exist to catch is the one js/jobgen.js was written to avoid — *"nothing
// is invented, so nothing can send you to an empty field"* — and it is at its very worst in a
// tutorial, because the tutorial is the one part of the game a player has no way to second-guess.
// Two other agents are re-cutting the early crafting chain in this same round, so every id the line
// names is checked against the file that would have to contain it: a rename fails here, loudly,
// rather than turning into a first-time player being told to build something nobody builds.
//
// And the other half: it must be ignorable. A returning character is never offered it, it never
// blocks a single thing, and not taking it costs nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createOnboarding, resolveTargets, makeOnboardQuest, stepOf, stepDone, readFacts, ONBOARDING_URL,
} from '../js/onboarding.js';
import { makeQuest, setFirstJob, getFirstJob, QuestLog, ONBOARD_KIND, isStarted } from '../js/quests.js';
import { grantReward, rewardBlurb } from '../js/questrewards.js';
import { helperFor } from '../js/questhelp.js';
import { MATERIAL_ALIASES } from '../js/buildplan.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));

const onboarding = read('../data/onboarding.json');
const structures = read('../data/structures.json');
const refining = read('../data/refining.json');
const resources = read('../data/resources.json');

const DATA = { structures, refining, resources };

/**
 * A base you can move one piece at a time.
 *
 * `readFacts` reads five real modules; this is the smallest thing that answers the same questions.
 * Materials are one bag and pools are counted separately, which is exactly how the real pair
 * behaves the moment you tip a crate's worth of logs into storage.
 */
function fakeGame({ level = 1, mats = {}, built = [], pools = 0, town = null } = {}) {
  const state = {
    level,
    mats: { ...mats },
    built: [...built],
    pools,
    town: town || { name: 'Dunmere', x: 0, z: 0 },
  };
  const game = {
    player: { get level() { return state.level; } },
    control: { x: 0, z: 0 },
    materials: { count: id => state.mats[id] || 0 },
    stores: { pools: () => new Array(state.pools).fill({ id: 'p' }), count: () => 0 },
    build: { get entries() { return state.built.map(key => ({ key })); } },
    features: {
      settlementAt: () => (state.inTown ? state.town : null),
      nearestSettlement: () => ({ ...state.town, distance: 400 }),
    },
  };
  return {
    game, state,
    give(id, n) { state.mats[id] = (state.mats[id] || 0) + n; },
    raise(key, { pool = false } = {}) { state.built.push(key); if (pool) state.pools++; },
    enterTown() { state.inTown = true; },
  };
}

/** Everything `grantReward` can touch, replaced with a notebook. */
function payer() {
  const paidOut = { gold: 0, xp: 0, items: [], mats: {}, calls: [] };
  const ctx = {
    level: 1,
    rng: () => 0.5,
    addGold: n => { paidOut.gold += n; },
    gainXp: n => { paidOut.xp += n; return 0; },
    addMaterials: bag => { for (const [k, n] of Object.entries(bag)) paidOut.mats[k] = (paidOut.mats[k] || 0) + n; },
    addItem: it => paidOut.items.push(it),
    rollDrop: ({ floor }) => ({ id: 'it1', name: 'A Plain Knife', baseKey: 'dagger', rarity: floor || 'magic' }),
    showCrate: () => {},
  };
  return {
    paidOut,
    pay: async quest => { paidOut.calls.push(quest.id); return grantReward(quest, ctx); },
  };
}

/** Build the line against the real data files, with a base you drive by hand. */
async function lineWith(world, { questLog = new QuestLog(), research = null } = {}) {
  const bank = payer();
  const logged = [];
  const onboard = await createOnboarding({
    data: onboarding, ...DATA, questLog, game: world.game,
    pay: bank.pay, log: (t, tone) => logged.push({ t, tone }), save: () => {}, research,
    every: 0,
  });
  return { onboard, questLog, bank, logged };
}

test.afterEach(() => setFirstJob(null));

// ---------------------------------------------------------------------------- the ids are real

test('1 — every id the line names resolves to something that exists', () => {
  const audit = resolveTargets(onboarding, DATA);
  assert.deepEqual(audit.problems, [], 'the onboarding line points at data that is not there');
  assert.ok(audit.ok);
  // and each step really was looked at, rather than skipped by a check kind nobody handles
  for (const step of onboarding.steps) assert.ok(audit.resolved[step.id], `${step.id} was never resolved`);
});

test('1.1 — the structures it names are buildable pieces, not machine ids or materials', () => {
  const ids = new Set(structures.structures.map(s => s.id));
  for (const step of onboarding.steps) {
    if (step.check?.kind !== 'structure') continue;
    const found = step.check.anyOf.filter(id => ids.has(id));
    assert.ok(found.length, `${step.id}: none of ${step.check.anyOf} is in data/structures.json`);
  }
});

test('1.2 — the smelt step names a recipe that runs on the machine the step before it builds', () => {
  const smelt = onboarding.steps.find(s => s.check?.kind === 'recipe');
  const recipe = refining.recipes.find(r => r.id === smelt.check.recipe);
  assert.ok(recipe, 'the smelt recipe is gone');
  assert.ok(recipe.outputs[smelt.check.material], 'the recipe does not put out what the step waits for');
  // the furnace step has to be the one that builds `recipe.machine`, or the line has a hole in it
  const built = onboarding.steps.flatMap(s => (s.check?.kind === 'structure' ? s.check.anyOf : []));
  assert.ok(built.includes(recipe.machine), `nothing in the line builds a ${recipe.machine}`);
});

test('1.3 — a renamed structure is caught rather than silently pointing at nothing', () => {
  // the whole reason `resolveTargets` exists: pretend another agent renamed the furnace
  const trimmed = { ...structures, structures: structures.structures.filter(s => s.id !== 'furnace') };
  const audit = resolveTargets(onboarding, { ...DATA, structures: trimmed });
  assert.equal(audit.ok, false);
  assert.ok(audit.problems.some(p => p.includes('furnace')), audit.problems.join(' | '));
});

// ---------------------------------------------------------------------------- it is brief

test('2 — the line is four to six steps, and every one of them names a key to press', () => {
  const n = onboarding.steps.length;
  assert.ok(n >= 4 && n <= 6, `"brief" was the ask and the line is ${n} steps`);
  for (const step of onboarding.steps) {
    assert.ok(step.name && step.name.length < 40, `${step.id}: the HUD strip cannot hold "${step.name}"`);
    assert.ok(step.hud, `${step.id} has no line for the objective strip`);
    // round 10's review: "the game never said what to do". A step that does not name a key or a
    // screen is that bug written down again.
    assert.match(step.hud, /\b[BEM]\b|Build|Map/, `${step.id}: "${step.hud}" never says what to press`);
    assert.ok(step.text && step.text.length > 30, `${step.id} has no explanation`);
  }
});

test('2.1 — the gather step asks for at least what the rest of the line spends', () => {
  const gather = onboarding.steps.find(s => s.check?.kind === 'materials');
  // what the structures the line goes on to build cost, in the words the storage pools use
  const wanted = {};
  for (const step of onboarding.steps) {
    if (step.check?.kind !== 'structure') continue;
    for (const id of step.check.anyOf) {
      const def = structures.structures.find(s => s.id === id);
      if (!def) continue;
      for (const [short, n] of Object.entries(def.cost || {})) {
        const real = MATERIAL_ALIASES[short] || short;
        wanted[real] = Math.max(wanted[real] || 0, n);   // `anyOf` means you build ONE of them
      }
    }
  }
  for (const [id, n] of Object.entries(wanted)) {
    if (!(id in gather.check.need)) continue;            // clay is its own step; planks are sawn
    assert.ok(gather.check.need[id] >= n,
      `the line spends ${n} ${id} but only ever asks you to gather ${gather.check.need[id]}`);
  }
});

// ---------------------------------------------------------------------------- the order works

test('3 — the steps only finish in order, and each one finishes for the right reason', async () => {
  const world = fakeGame();
  const { onboard, questLog } = await lineWith(world);
  const quest = questLog.add(makeOnboardQuest(onboarding));

  // step 1 is finished by the act of accepting, so one pass clears it and no more
  await onboard.check();
  assert.equal(quest.step, 1, 'taking the job should have cleared the first step and only the first');

  // step 2: the materials, and nothing else will do
  world.give('log', 8);
  await onboard.check();
  assert.equal(quest.step, 1, 'timber alone is not the step — it asks for stone too');
  world.give('stone', 20);
  await onboard.check();
  assert.equal(quest.step, 2);

  // step 3: a crate that has actually formed a pool
  world.raise('storage_crate');
  await onboard.check();
  assert.equal(quest.step, 2, 'a crate that holds nothing is not a base');
  world.state.pools = 1;
  await onboard.check();
  assert.equal(quest.step, 3);

  // step 4: the furnace
  world.raise('furnace');
  await onboard.check();
  assert.equal(quest.step, 4);

  // step 5: the ingot, which is the whole point of the line
  assert.equal(quest.done, false, 'the line finished before the ingot existed');
  world.give('iron_ingot', 1);
  await onboard.check();
  assert.equal(quest.step, onboarding.steps.length);
  assert.equal(quest.done, true, 'the line did not finish when the ingot was made');
});

test('3.1 — nothing is finished on the first frame of a brand-new run', () => {
  const world = fakeGame();
  const facts = readFacts(world.game);
  for (const step of onboarding.steps) {
    if (step.check?.kind === 'accepted') continue;
    assert.equal(stepDone(step, facts), false, `${step.id} is already done before the player has moved`);
  }
});

test('3.2 — a step reads what is standing, not a flag: knocking the furnace down un-does it', () => {
  const world = fakeGame();
  const furnace = onboarding.steps.find(s => s.check?.anyOf?.includes('furnace'));
  world.raise('furnace');
  assert.equal(stepDone(furnace, readFacts(world.game)), true);
  world.state.built = [];
  assert.equal(stepDone(furnace, readFacts(world.game)), false);
});

// ---------------------------------------------------------------------------- it pays

test('4 — every step pays something, and questrewards is the thing that pays it', async () => {
  const world = fakeGame();
  const { onboard, questLog, bank } = await lineWith(world);
  const quest = questLog.add(makeOnboardQuest(onboarding));

  world.give('log', 8); world.give('stone', 20);
  world.raise('storage_crate', { pool: true });
  world.raise('furnace');
  world.give('iron_ingot', 1);
  await onboard.check();

  assert.equal(quest.done, true);
  // one payment per step that carries a reward, and every one of them through grantReward
  const paying = onboarding.steps.filter(s => s.reward).length;
  assert.equal(bank.paidOut.calls.length, paying, 'a step with a reward went unpaid');
  assert.ok(bank.paidOut.gold > 0 && bank.paidOut.xp > 0, 'the line paid nothing at all');

  // the quest's own reward is still owed — it is handed in like any other job
  assert.equal(quest.turnedIn, false);
  const finish = await grantReward(quest, {
    level: 1, rng: () => 0.5,
    addGold: () => {}, gainXp: () => 0, addItem: () => {},
    rollDrop: ({ floor }) => ({ id: 'x', name: 'Knife', rarity: floor }),
  });
  assert.ok(finish.gold > 0 || finish.items.length, 'handing the line in pays nothing');
});

test('4.1 — every reward in the file is a kind questrewards knows and a blurb you can read', async () => {
  const bags = [...onboarding.steps.map(s => s.reward).filter(Boolean), onboarding.reward];
  for (const reward of bags) {
    const out = await grantReward({ id: 'r', kind: ONBOARD_KIND, title: 't', reward: { ...reward } }, {
      level: 1, rng: () => 0.5,
      rollDrop: ({ floor }) => ({ id: 'x', name: 'Knife', rarity: floor || 'magic' }),
      addItem: () => {}, addGold: () => {}, gainXp: () => 0, addMaterials: () => {},
    });
    assert.notEqual(out.kind, 'none', 'a reward with no kind at all');
    assert.ok(out.gold > 0 || out.xp > 0 || out.items.length || Object.keys(out.mats).length,
      `a step's reward handed over nothing: ${JSON.stringify(reward)}`);
    assert.ok(rewardBlurb({ kind: ONBOARD_KIND, reward: { ...reward } }).length > 0);
  }
});

test('4.2 — finishing a step grants research points, and a missing research module cannot crash it', async () => {
  const world = fakeGame();
  const awarded = [];
  const { onboard, questLog } = await lineWith(world, { research: { award: (why, n) => awarded.push([why, n]) } });
  questLog.add(makeOnboardQuest(onboarding));
  world.give('log', 8); world.give('stone', 20);
  world.raise('storage_crate', { pool: true });
  world.raise('furnace');
  world.give('iron_ingot', 1);
  await onboard.check();
  const expected = onboarding.steps.filter(s => (s.research || 0) > 0).length;
  assert.equal(awarded.length, expected, 'a step that promises research points handed none over');
  assert.ok(awarded.every(([why]) => why.startsWith('onboarding:')));

  // …and the same run with nothing to award to, which is the state of the game until the research
  // module lands. Silence, not a thrown error in the middle of the frame loop.
  const other = fakeGame();
  const second = await lineWith(other);
  second.questLog.add(makeOnboardQuest(onboarding));
  other.give('log', 8); other.give('stone', 20);
  other.raise('storage_crate', { pool: true });
  other.raise('furnace');
  other.give('iron_ingot', 1);
  await second.onboard.check();
  assert.equal(second.questLog.active[0].done, true);
});

// ---------------------------------------------------------------------------- how you get it

test('5 — a quest-giver offers it, through the door every other job comes through', async () => {
  const world = fakeGame();
  const { onboard } = await lineWith(world);
  assert.ok(getFirstJob(), 'nothing registered with makeQuest, so no giver could ever offer it');
  // this is exactly what js/town.js `questFrom` does
  const offered = makeQuest('hunt', {
    rng: () => 0.5, level: 1,
    giver: { id: 'npc1', name: 'Odrun Ashgate', node: { id: 4, name: 'Dunmere' } },
    enemies: [{ id: 'moor_hound', name: 'Moor Hound', minLevel: 1, maxLevel: 4 }],
    nodes: [], from: { id: 4, name: 'Dunmere' },
  });
  assert.equal(offered.kind, ONBOARD_KIND);
  assert.equal(offered.id, onboarding.id);
  assert.equal(offered.giverName, 'Odrun Ashgate');
  assert.equal(isStarted(offered), false, 'it must be handed in like any other job, or the giver never gets new work');
  assert.ok(onboard.live);
});

test('5.1 — once it is taken, the next giver offers ordinary work again', async () => {
  const world = fakeGame();
  const { onboard, questLog } = await lineWith(world);
  questLog.add(makeOnboardQuest(onboarding));
  const next = makeQuest('hunt', {
    rng: () => 0.5, level: 1,
    giver: { id: 'npc2', name: 'Bey Marlow', node: { id: 4 } },
    enemies: [{ id: 'moor_hound', name: 'Moor Hound', minLevel: 1, maxLevel: 4 }],
    nodes: [], from: { id: 4, name: 'Dunmere' },
  });
  assert.equal(next.kind, 'hunt');
  assert.ok(onboard.quest, 'the line is in the log');
});

test('5.2 — it is not offered to somebody who has already done it', async () => {
  // an ingot in the bag: this save has smelted iron, so there is nothing left to teach
  const smelted = fakeGame({ mats: { iron_ingot: 3 } });
  const a = await lineWith(smelted);
  assert.equal(a.onboard.objective(), null);
  assert.notEqual(makeQuest('hunt', {
    rng: () => 0.5, level: 1, giver: { id: 'n', name: 'A', node: { id: 1 } },
    enemies: [{ id: 'e', name: 'E', minLevel: 1, maxLevel: 9 }], nodes: [],
  }).kind, ONBOARD_KIND);

  // a base already standing
  const based = fakeGame({ built: ['storage_crate', 'furnace'], pools: 1 });
  const b = await lineWith(based);
  assert.equal(b.onboard.objective(), null);

  // and a character who has levelled — a returning player must never be nagged
  const veteran = fakeGame({ level: 24 });
  const c = await lineWith(veteran);
  assert.equal(c.onboard.objective(), null);
});

test('5.3 — walking away from the offer costs nothing and blocks nothing', async () => {
  const world = fakeGame();
  const { onboard, questLog, bank } = await lineWith(world);
  // never taken. The base is built anyway, the whole way to an ingot.
  world.give('log', 40); world.give('stone', 60);
  world.raise('storage_crate', { pool: true });
  world.raise('furnace');
  world.give('iron_ingot', 4);
  await onboard.check();
  assert.equal(questLog.active.length, 0, 'the line let itself into a log it was never accepted into');
  assert.equal(bank.paidOut.calls.length, 0, 'it paid a player who never took it');
  assert.equal(onboard.objective(), null, 'it is still nagging a player who did the whole thing alone');
});

// ---------------------------------------------------------------------------- what the player sees

test('6 — the objective line points at the town first, then at the step, then stops', async () => {
  const world = fakeGame();
  const { onboard, questLog } = await lineWith(world);

  const toTown = onboard.objective();
  assert.ok(toTown, 'a new player is told nothing about where the town is');
  assert.match(toTown.name, /Dunmere/, 'the objective does not name the town');
  assert.match(toTown.where, /m|km/, 'it does not say how far');

  world.enterTown();
  assert.match(onboard.objective().where, /\bE\b/, 'standing in the town it still does not say what to press');

  const quest = questLog.add(makeOnboardQuest(onboarding));
  const step = onboard.objective();
  assert.equal(step.name, onboarding.steps[0].name);
  assert.equal(step.where, onboarding.steps[0].hud);

  quest.done = true;
  assert.equal(onboard.objective(), null, 'the line kept the objective strip after it was over');
});

test('6.1 — the journal row and the spoken helper both read properly at every step', () => {
  const log = new QuestLog();
  const quest = log.add(makeOnboardQuest(onboarding));
  assert.equal(log.progressText(quest), `0 / ${onboarding.steps.length}`);
  for (let i = 0; i < onboarding.steps.length; i++) {
    quest.step = i;
    quest.stepName = onboarding.steps[i].name;
    quest.stepHud = onboarding.steps[i].hud;
    const text = log.progressText(quest);
    assert.match(text, /^\d+ \/ \d+$/);
    assert.ok(!text.includes('NaN'));
    const help = helperFor(quest, { x: 0, z: 0 });
    assert.ok(help && help.text.includes(onboarding.steps[i].name), 'the helper says nothing useful');
  }
  quest.done = true;
  assert.equal(log.progressText(quest), 'ready to hand in');
  // a save written before this round has no `step` at all, and the row must not read "NaN / 5"
  const old = makeOnboardQuest(onboarding);
  delete old.step;
  assert.ok(!log.progressText(old).includes('NaN'));
});

test('6.2 — the helper never elbows a real destination out of the way', () => {
  const quest = makeOnboardQuest(onboarding);
  quest.stepName = 'Cut timber and break stone';
  quest.stepHud = 'E on a tree';
  const help = helperFor(quest, { x: 0, z: 0 });
  // `helpersNear` sorts on `away` and main.js shows the nearest one; Infinity is what keeps the
  // tutorial behind "the door is the way in"
  assert.equal(help.away, Infinity);
});

// ---------------------------------------------------------------------------- it saves

test('7 — the line survives a save, because it is an ordinary quest in an ordinary log', async () => {
  const world = fakeGame();
  const first = await lineWith(world);
  const quest = first.questLog.add(makeOnboardQuest(onboarding));
  world.give('log', 8); world.give('stone', 20);
  await first.onboard.check();
  assert.equal(quest.step, 2);

  const saved = JSON.parse(JSON.stringify(first.questLog.toJSON()));
  const reloaded = QuestLog.fromJSON(saved);
  const second = await lineWith(world, { questLog: reloaded });
  assert.equal(second.onboard.quest.step, 2, 'the step was lost in the save');
  assert.equal(second.onboard.step.id, onboarding.steps[2].id);

  world.raise('storage_crate', { pool: true });
  world.raise('furnace');
  world.give('iron_ingot', 1);
  await second.onboard.check();
  assert.equal(second.onboard.quest.done, true, 'a reloaded line cannot be finished');
});

test('7.1 — the url the game reads it from is the file this test reads', () => {
  assert.equal(ONBOARDING_URL, 'data/onboarding.json');
  assert.ok(onboarding.steps.length, 'data/onboarding.json has no steps in it');
});

test('7.2 — a broken data file turns the line off rather than taking the game down', async () => {
  const broken = { ...onboarding, steps: [{ id: 'x', name: 'X', hud: 'E', text: 'x', check: { kind: 'nonsense' } }] };
  const world = fakeGame();
  const onboard = await createOnboarding({
    data: broken, ...DATA, questLog: new QuestLog(), game: world.game, pay: async () => ({}), every: 0,
  });
  assert.equal(onboard.live, false);
  assert.equal(onboard.objective(), null);
  assert.equal(getFirstJob(), null, 'a broken line still took over every quest-giver in the world');
  onboard.tick(1);            // must not throw
  await onboard.check();
});
