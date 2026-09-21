// node --test prototypes/farhold/tests/round16-quests.test.js
//
// R16 — what a finished job pays, and the one function that pays it.
//
//   "Let's have some quests give money and xp, some give item reward via loot crate popup, others
//    give materials (especially if the quest was triggered by building or town growth), or a fourth
//    option where the quest giver asks what type of reward you want and you get to pick. Also add a
//    quest reward where you get to choose one of three rare or better items."
//
// The failure these tests exist to catch is this project's recurring one: a reward that is written
// down and never handed over. `reward.extras` was exactly that for the whole life of the job
// generator — four frames promising a perk point, an opened dungeon, a revealed zone and a weapon
// brand, and nothing anywhere that read the field. So: every kind pays SOMETHING, a materials bag is
// never empty, every material named is a material the game has, and every extra a frame can name
// reaches a handler.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  grantReward, rewardKindFor, materialsFor, materialPoolFor, rewardBlurb, makeQuestRewards,
  REWARD_KINDS, MATERIAL_POOLS, EXTRA_KEYS, REWARD_SHAPE_KEYS, CHOICE_OPTIONS, SIDE_GOLD,
} from '../js/questrewards.js';
import { makeQuest, makeFallQuest, QuestLog } from '../js/quests.js';
import { createJobGen, candidatesFrom } from '../js/jobgen.js';
import { createTerritory } from '../js/territory.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const frames = read('../data/job-frames.json');
const factions = read('../data/factions.json');
const resources = read('../data/resources.json');
const crafting = read('../data/crafting.json');

/**
 * A seeded roll, so a failure can be reproduced.
 *
 * The warm-up matters: a plain linear congruential generator's FIRST output for a small seed is
 * almost the same number every time (about 0.24 to 0.40 for every seed under a few hundred), and
 * the first thing `makeQuest` rolls is the gold. Without the warm-up this fixture never produced a
 * single well-paid job in sixty seeds and the test read like a bug in the reward rule.
 */
function rngFrom(seed) {
  let s = (seed * 2654435761) >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 8; i++) next();
  return next;
}

/** Everything grantReward can touch, replaced with something that just writes down what happened. */
function spy({ pick = 0, answer = null } = {}) {
  const log = { gold: 0, xp: 0, items: [], mats: {}, rolls: [], crates: [], asked: [], extras: [] };
  let n = 0;
  return {
    log,
    level: 8,
    rng: rngFrom(99),
    addGold: g => { log.gold += g; },
    gainXp: x => { log.xp += x; return 0; },
    addMaterials: bag => { for (const [k, v] of Object.entries(bag)) log.mats[k] = (log.mats[k] || 0) + v; },
    addItem: it => log.items.push(it),
    rollDrop: opts => {
      log.rolls.push(opts);
      // the real rollDrop honours `floor`; the fake says so plainly so the assertions below are
      // about the ARGUMENT, which is the thing this module is responsible for getting right
      return { id: 'it' + (n++), name: `Test blade ${n}`, rarity: opts.floor || 'normal', slot: 'weapon' };
    },
    showCrate: spec => { log.crates.push(spec); return Promise.resolve(); },
    choose: q => { log.asked.push(q); return Promise.resolve(answer == null ? pick : answer); },
    extras: Object.fromEntries(EXTRA_KEYS.map(k => [k, (value) => { log.extras.push([k, value]); return `${k} granted`; }])),
  };
}

const questWith = (over = {}) => ({
  id: 'q1', kind: 'hunt', title: 'A job', giverName: 'Maeret',
  count: 1, progress: 1, done: true, turnedIn: false,
  reward: { gold: 100, xp: 60, ...(over.reward || {}) },
  ...over,
});

// ---------------------------------------------------------------- the rule

test('the reward kind is decided from what the job is', () => {
  const rng = () => 0.99;                                     // never rolls the "giver asks" branch
  assert.equal(rewardKindFor({ kind: 'gather', reward: { gold: 50, xp: 40 } }, { rng, level: 1 }), 'materials',
    'fetching and hauling is paid in stock');
  assert.equal(rewardKindFor({ kind: 'clear', reward: { gold: 90, xp: 100 } }, { rng, level: 1 }), 'crate',
    'you cleared a place; something was in it');
  assert.equal(rewardKindFor({ kind: 'visit', reward: { gold: 40, xp: 40 } }, { rng, level: 1 }), 'coin');
  assert.equal(rewardKindFor({ kind: 'hunt', reward: { gold: 60, xp: 60 } }, { rng, level: 1 }), 'coin');
  // the big ones
  assert.equal(rewardKindFor({ kind: 'clear', reward: { gold: 400, xp: 400 } }, { rng, level: 1 }), 'pick3');
  assert.equal(rewardKindFor({ kind: 'kill', reward: { gold: 10, xp: 10, standing: 14 } }, { rng, level: 1 }), 'pick3');
  // and the giver who asks
  assert.equal(rewardKindFor({ kind: 'hunt', reward: { gold: 60, xp: 60 } }, { rng: () => 0, level: 1 }), 'choice');
  // data always wins
  assert.equal(rewardKindFor({ kind: 'hunt', reward: { gold: 60, xp: 60, kind: 'materials' } }, { rng, level: 1 }), 'materials');
});

test('every quest the game makes carries a reward kind it can actually pay', () => {
  const enemies = [{ id: 'moor_hound', name: 'Moor Hound', minLevel: 1, maxLevel: 12 }];
  const nodes = [
    { id: 1, type: 'dungeon', name: 'The Sunk Gallery', x: 12, y: 11 },
    { id: 2, type: 'settlement', name: 'Herdalkeep', x: 10, y: 10 },
  ];
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    for (const kind of ['hunt', 'visit', 'gather', 'clear']) {
      const q = makeQuest(kind, { rng: rngFrom(seed * 7 + kind.length), level: 1 + (seed % 20), giver: { id: 'g', name: 'Maeret' }, enemies, nodes });
      if (!q) continue;
      assert.ok(REWARD_KINDS.includes(q.reward.kind), `${kind} rolled an unknown reward kind: ${q.reward.kind}`);
      seen.add(q.reward.kind);
      assert.ok(rewardBlurb(q).length > 0, 'every job can say what it pays');
    }
  }
  // all five turn up across sixty seeds — a kind that never happens is a kind that does not exist
  for (const k of REWARD_KINDS) assert.ok(seen.has(k), `no quest in sixty seeds ever paid a ${k}`);
});

test('a fall pays plain coin — there is nobody to ask you what you want', () => {
  assert.equal(makeFallQuest({ x: 10, z: 10 }).reward.kind, 'coin');
});

// ---------------------------------------------------------------- paying it out

test('every reward kind pays something', async () => {
  for (const kind of REWARD_KINDS) {
    const ctx = spy();
    const out = await grantReward(questWith({ reward: { gold: 100, xp: 60, kind } }), ctx);
    const paid = out.gold > 0 || out.xp > 0 || out.items.length > 0 || Object.keys(out.mats).length > 0;
    assert.ok(paid, `a ${kind} reward paid nothing at all`);
    assert.ok(out.xp > 0, `a ${kind} reward gave no experience — levelling is never a flavour`);
    assert.equal(ctx.log.xp, out.xp, 'what it reports and what it granted have to be the same number');
  }
});

test('a job that pays in a thing still pays some coin', async () => {
  const coin = await grantReward(questWith({ reward: { gold: 100, xp: 60, kind: 'coin' } }), spy());
  const crate = await grantReward(questWith({ reward: { gold: 100, xp: 60, kind: 'crate' } }), spy());
  assert.equal(coin.gold, 100);
  assert.equal(crate.gold, Math.round(100 * SIDE_GOLD));
  assert.ok(crate.gold > 0, 'a crate job that paid no coin at all would read as a pay cut');
  assert.equal(coin.xp, crate.xp, 'the same work is worth the same experience');
});

test('a crate reward is an item, in the bag and in the popup', async () => {
  const ctx = spy();
  const out = await grantReward(questWith({ reward: { gold: 80, xp: 50, kind: 'crate' } }), ctx);
  assert.equal(out.items.length, 1);
  assert.equal(ctx.log.items.length, 1, 'it has to reach the bag, not only the popup');
  assert.equal(ctx.log.rolls[0].floor, 'magic', 'a quest item that comes out plain white is the reward not existing');
  assert.equal(ctx.log.crates.length, 1, 'and the player has to be shown it');
  assert.equal(ctx.log.crates[0].items[0], out.items[0]);
});

test('pick3 offers exactly three, and all three are rare or better', async () => {
  const ctx = spy({ pick: 2 });
  const out = await grantReward(questWith({ reward: { gold: 300, xp: 300, kind: 'pick3' } }), ctx);
  assert.equal(out.offered.length, 3, 'three cards, side by side');
  assert.equal(ctx.log.rolls.length, 3);
  for (const roll of ctx.log.rolls) assert.equal(roll.floor, 'rare', 'the whole point is "rare or better"');
  for (const it of out.offered) assert.ok(['rare', 'legendary', 'unique'].includes(it.rarity), `${it.rarity} is not rare or better`);
  assert.equal(out.items.length, 1, 'you take ONE of them');
  assert.equal(out.items[0], out.offered[2], 'and it is the one you picked');
  assert.equal(ctx.log.items.length, 1);
  assert.equal(ctx.log.asked.length, 1);
  assert.equal(ctx.log.asked[0].options.length, 3);
  // it is its own popup, so it must not raise a second one on top
  assert.equal(ctx.log.crates.length, 0);
});

test('pick3 with no chooser wired in still hands over an item', async () => {
  const ctx = spy();
  ctx.choose = null;
  const out = await grantReward(questWith({ reward: { gold: 300, xp: 300, kind: 'pick3' } }), ctx);
  assert.equal(out.items.length, 1, 'the player earned an item either way');
});

test('the giver asks, and you get what you asked for', async () => {
  for (const option of CHOICE_OPTIONS) {
    const ctx = spy({ answer: option.id });
    const out = await grantReward(questWith({ reward: { gold: 100, xp: 60, kind: 'choice' } }), ctx);
    assert.equal(ctx.log.asked[0].kind, 'choice');
    assert.equal(ctx.log.asked[0].options.length, 3);
    assert.equal(out.kind, option.id, `asked for ${option.id} and got ${out.kind}`);
    if (option.id === 'crate') assert.equal(out.items.length, 1);
    if (option.id === 'materials') assert.ok(Object.keys(out.mats).length > 0);
    if (option.id === 'coin') assert.equal(out.gold, 100, 'the coin option pays in full');
  }
  // an answer nobody understands falls back to coin rather than to nothing
  const odd = await grantReward(questWith({ reward: { gold: 100, xp: 60, kind: 'choice' } }), spy({ answer: 'llamas' }));
  assert.equal(odd.kind, 'coin');
  assert.equal(odd.gold, 100);
});

// ---------------------------------------------------------------- materials

test('a materials reward is never an empty bag, and never names a material the game has not got', () => {
  const real = new Set([...Object.keys(resources.materials || {}), ...Object.keys(crafting.materials || {})]);
  for (const [pool, rows] of Object.entries(MATERIAL_POOLS)) {
    for (const [id] of rows) assert.ok(real.has(id), `${pool} pays ${id}, which nothing in the game produces`);
  }
  for (let seed = 1; seed <= 200; seed++) {
    for (const kind of ['gather', 'hunt', 'clear', 'visit']) {
      const bag = materialsFor({ kind, reward: {} }, { level: 1 + (seed % 40), rng: rngFrom(seed) });
      const lines = Object.entries(bag);
      assert.ok(lines.length > 0, `seed ${seed} / ${kind} paid an empty bag`);
      for (const [id, n] of lines) {
        assert.ok(real.has(id), `${id} is not a material`);
        assert.ok(Number.isInteger(n) && n >= 1, `${id} x${n} is not a real amount`);
      }
    }
  }
});

test('materials come from the pool the work suggests', () => {
  assert.equal(materialPoolFor({ kind: 'gather' }), 'build');
  assert.equal(materialPoolFor({ kind: 'hunt' }), 'hunt');
  assert.equal(materialPoolFor({ kind: 'clear' }), 'ruin');
  assert.equal(materialPoolFor({ kind: 'hunt', reward: { matPool: 'ruin' } }), 'ruin', 'a frame may name one outright');
});

test('a frame that says exactly what it pays gets exactly that', () => {
  const bag = materialsFor({ kind: 'solve', reward: { mats: { stone: 8, iron_ore: 5 } } }, { level: 1, rng: rngFrom(3) });
  assert.deepEqual(bag, { stone: 8, iron_ore: 5 });
  const higher = materialsFor({ kind: 'solve', reward: { mats: { stone: 8 } } }, { level: 20, rng: rngFrom(3) });
  assert.ok(higher.stone > 8, 'and it still scales with the level the job was taken at');
});

// ---------------------------------------------------------------- the extras nobody read

test('reward.extras are applied, and an extra with no handler is reported rather than lost', async () => {
  const ctx = spy();
  const out = await grantReward(questWith({ reward: { gold: 50, xp: 50, kind: 'coin', extras: { perk: true, opens: 'dungeon', reveals: 'zone', brand: true } } }), ctx);
  assert.deepEqual(ctx.log.extras.map(e => e[0]).sort(), ['brand', 'opens', 'perk', 'reveals']);
  assert.equal(out.extras.length, 4);
  assert.deepEqual(out.unhandled, []);

  const lonely = await grantReward(questWith({ reward: { gold: 50, xp: 50, kind: 'coin', extras: { unicorn: true } } }), spy());
  assert.deepEqual(lonely.unhandled, ['unicorn'], 'a new extra with nowhere to go must be loud, not silent');
});

test('every extra a frame can name has a handler key', () => {
  for (const frame of frames.frames) {
    for (const key of Object.keys(frame.reward || {})) {
      if (REWARD_SHAPE_KEYS.includes(key)) continue;
      assert.ok(EXTRA_KEYS.includes(key), `${frame.id} promises "${key}" and nothing knows how to grant it`);
    }
  }
});

// ---------------------------------------------------------------- handing in

test('a quest cannot be turned in twice', async () => {
  const log = new QuestLog();
  const q = log.add(questWith({ reward: { gold: 100, xp: 60, kind: 'coin' } }));
  q.done = true;

  const ctx = spy();
  const first = await grantReward(q, ctx);
  assert.equal(first.gold, 100);
  const second = await grantReward(q, ctx);
  assert.equal(second.already, true);
  assert.equal(second.gold, 0);
  assert.equal(ctx.log.gold, 100, 'the second press must not pay a second time');

  assert.ok(log.turnIn(q));
  assert.equal(log.turnIn(q), null, 'and the log refuses a second hand-in too');
  assert.equal(log.active.length, 0);
  assert.equal(log.finished.length, 1);
});

test('the journal lists every finished job except the ones that pay themselves', () => {
  const log = new QuestLog();
  const hunt = log.add(questWith({ id: 'a', kind: 'hunt', done: true }));
  log.add(questWith({ id: 'b', kind: 'visit', done: false }));
  const fall = log.add(makeFallQuest({ x: 5, z: 5 }));
  fall.done = true;
  const raid = log.add({ id: 'd', kind: 'raid', done: true, turnedIn: false, count: 3, progress: 3, reward: { gold: 0, xp: 0 } });

  const ready = log.readyAnywhere();
  assert.deepEqual(ready.map(q => q.id), ['a'], 'one finished job with somebody behind it');
  assert.ok(!ready.includes(fall) && !ready.includes(raid), 'a fall and a raid pay themselves');
  // and it is NOT filtered by who asked — that is the whole point
  hunt.giverId = 'someone_three_zones_away';
  assert.equal(log.readyAnywhere().length, 1);
});

test('the blurb says what handing it in gets you', () => {
  assert.match(rewardBlurb(questWith({ reward: { gold: 100, xp: 60, kind: 'coin' } })), /100 gold, 60 xp/);
  assert.match(rewardBlurb(questWith({ reward: { gold: 100, xp: 60, kind: 'crate' } })), /crate/);
  assert.match(rewardBlurb(questWith({ reward: { gold: 100, xp: 60, kind: 'materials' } })), /materials/);
  assert.match(rewardBlurb(questWith({ reward: { gold: 100, xp: 60, kind: 'pick3' } })), /rare/);
  assert.match(rewardBlurb(questWith({ reward: { gold: 100, xp: 60, kind: 'choice' } })), /pick/);
});

test('makeQuestRewards ties the primitives on once', async () => {
  const ctx = spy();
  const rewards = makeQuestRewards(ctx);
  const out = await rewards.grant(questWith({ reward: { gold: 40, xp: 20, kind: 'coin' } }));
  assert.equal(out.gold, 40);
  assert.equal(ctx.log.gold, 40);
  assert.equal(rewards.blurb(questWith({ reward: { gold: 40, xp: 20, kind: 'coin' } })), '40 gold, 20 xp');
});

// ---------------------------------------------------------------- board jobs

test('a job-frames frame that names a reward kind gets it', () => {
  const declared = frames.frames.filter(f => f.reward?.kind);
  assert.ok(declared.length >= 6, 'the data should be saying what the interesting jobs pay in');
  for (const f of declared) assert.ok(REWARD_KINDS.includes(f.reward.kind), `${f.id} names an unknown kind`);

  const zonesList = [
    { id: 0, name: 'Gaina Basin', danger: 'Settled', band: 0, minLevel: 1, maxLevel: 4, home: true, cells: [{ x: 10, y: 10 }], center: { x: 10, y: 10 } },
    { id: 1, name: 'Menwin Weald', danger: 'Open country', band: 1, minLevel: 5, maxLevel: 8, cells: [{ x: 20, y: 12 }, { x: 21, y: 12 }], center: { x: 20, y: 12 } },
    { id: 2, name: 'The Iron Hollow', danger: 'Wild', band: 2, minLevel: 9, maxLevel: 12, cells: [{ x: 30, y: 20 }], center: { x: 30, y: 20 } },
  ];
  const zones = { zones: zonesList, byId: id => zonesList.find(z => z.id === id) || null, list: () => zonesList.slice() };
  const bestiary = [
    { id: 'moor_hound', name: 'Moor Hound', minLevel: 1, maxLevel: 12 },
    { id: 'bog_lurker', name: 'Bog Lurker', minLevel: 2, maxLevel: 14, champion: true },
  ];
  const nodes = [
    { id: 1, type: 'dungeon', name: 'The Sunk Gallery', x: 20, y: 12 },
    { id: 2, type: 'settlement', name: 'Herdalkeep', x: 21, y: 12 },
  ];
  const byKind = new Map(declared.map(f => [f.id, f.reward.kind]));

  let boards = 0;
  const seenKinds = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const land = createTerritory({ zones, seed, factions, metresPerCell: 224 });
    const jobs = createJobGen({ frames, territory: land, factions, seed });
    const zone = zones.byId(1);
    const candidates = candidatesFrom({ zone, territory: land, bestiary, nodes, level: 6, metresPerCell: 224 });
    for (const job of jobs.offer({ zone, level: 6, candidates, want: 5 })) {
      boards++;
      assert.ok(REWARD_KINDS.includes(job.reward.kind), `${job.frame} came off the board with kind ${job.reward.kind}`);
      seenKinds.add(job.reward.kind);
      if (byKind.has(job.frame)) {
        assert.equal(job.reward.kind, byKind.get(job.frame), `${job.frame} says it pays ${byKind.get(job.frame)} and paid ${job.reward.kind}`);
      }
      // the shape keys are the reward's own, not something to be granted
      for (const key of Object.keys(job.reward.extras || {})) {
        assert.ok(!REWARD_SHAPE_KEYS.includes(key), `${job.frame} swept "${key}" into extras`);
        assert.ok(EXTRA_KEYS.includes(key), `${job.frame} promises "${key}" and nothing can grant it`);
      }
    }
  }
  assert.ok(boards > 50, `only ${boards} jobs came off forty boards — the fixture is not exercising anything`);
  assert.ok(seenKinds.size >= 3, 'a board of forty seeds should not be paying one kind of reward');
});

test('a board job with mats in the frame pays those mats', async () => {
  const dig = frames.frames.find(f => f.id === 'dig_it_out');
  assert.ok(dig?.reward?.mats, 'dig_it_out is the frame that says exactly what it pays');
  const ctx = spy();
  const out = await grantReward({
    id: 'j1', kind: 'solve', logKind: 'visit', frame: 'dig_it_out', title: 'Dig it out',
    done: true, reward: { gold: 100, xp: 120, kind: 'materials', mats: dig.reward.mats, extras: { opens: 'dungeon' } },
  }, { ...ctx, level: 1 });
  assert.deepEqual(out.mats, dig.reward.mats);
  assert.deepEqual(ctx.log.extras, [['opens', 'dungeon']], 'and the dungeon it promised to open');
});
