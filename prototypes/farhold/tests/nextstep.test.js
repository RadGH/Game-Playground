// R15 — the one thing to do next.
//
//   "I don't really know how to get iron ore or how to transport ore to my base for refining."
//   "I have stone and clay and I built a furnace. Now what?"
//
// The build panel's "Starting a base" list was written for exactly this and DELETES ITSELF the
// moment anything is standing — so it is on screen for the minute you do not need it and gone for
// the hour you do. The player above had built a furnace, so the guidance had already vanished.
//
// The module is pure, so the test can walk a whole playthrough in a loop and prove two things that
// matter more than any individual sentence: the chain always terminates, and it never tells you to
// do something you cannot do yet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, chainProgress, STEPS } from '../js/nextstep.js';

/** A player with nothing at all. */
const fresh = () => ({
  bag: {}, toolTier: 0,
  hasStore: false, hasSmelter: false, hasFuel: false, hasDrill: false,
  hasRoute: false, hasPower: false, hasLink: false, smelting: false, outposts: 0,
});
const ctxOf = p => ({ ...p, have: id => p.bag[id] || 0 });

test('a player with nothing is told to pick up a weapon, not to build a refinery', () => {
  const s = nextStep(ctxOf(fresh()));
  assert.equal(s.id, 'tool');
  assert.match(s.why, /no separate tool slot/i);
});

test('the exact question that was asked: a furnace is built and nothing has happened', () => {
  // "I have stone and clay and I built a furnace. Now what?"
  const p = fresh();
  p.toolTier = 1; p.bag = { log: 20, stone: 40, clay: 12, iron_ore: 4 };
  p.hasStore = true; p.hasSmelter = true; p.hasFuel = true;
  const s = nextStep(ctxOf(p));
  assert.equal(s.id, 'smelt', `it said "${s.text}" instead`);
  assert.match(s.text, /E on the Furnace/i);
  assert.match(s.where, /walk up/i);
});

test('…and the other one: how do I get iron ore', () => {
  const p = fresh();
  p.toolTier = 1; p.bag = { log: 20, stone: 40, clay: 12 };
  p.hasStore = true; p.hasSmelter = true; p.hasFuel = true;
  const s = nextStep(ctxOf(p));
  assert.equal(s.id, 'findore');
  assert.match(s.why, /ore outcrop/i, 'it does not say where iron actually comes from');
  assert.match(s.where, /Find/, 'it does not say which screen finds one');
});

test('a cold furnace is told about fuel before it is told about ore', () => {
  const p = fresh();
  p.toolTier = 1; p.bag = { clay: 12, iron_ore: 9 };
  p.hasStore = true; p.hasSmelter = true; p.hasFuel = false;
  assert.equal(nextStep(ctxOf(p)).id, 'fuel',
    'it told the player to smelt in a furnace with nothing to burn');
});

test('the chain always terminates, and every step is reachable', () => {
  /**
   * Walk the whole thing: do whatever it says, and check it moves on. If any rule could fire
   * forever — or fire before the one that unlocks it — this loop runs out of turns.
   */
  const p = fresh();
  const seen = [];
  const doIt = {
    tool: () => { p.toolTier = 1; },
    gather: () => { p.bag.log = 10; p.bag.stone = 20; },
    store: () => { p.hasStore = true; },
    clay: () => { p.bag.clay = 12; },
    furnace: () => { p.hasSmelter = true; },
    fuel: () => { p.hasFuel = true; },
    findore: () => { p.bag.iron_ore = 5; },
    // R17: the drill rule asks for `iron_ingot`, which is what a furnace actually makes. It used
    // to ask for `iron` — the build catalogue's short name, which nothing in the game produces —
    // so this walk was feeding it a material that never existed.
    smelt: () => { p.smelting = true; p.bag.iron_ingot = 8; },
    drill: () => { p.hasDrill = true; },
    route: () => { p.hasRoute = true; },
    link: () => { p.hasLink = true; },
    power: () => { p.hasPower = true; },
  };
  for (let turn = 0; turn < 60; turn++) {
    const s = nextStep(ctxOf(p));
    if (!s) break;
    assert.ok(!seen.includes(s.id), `"${s.id}" came round a second time — the chain loops`);
    seen.push(s.id);
    assert.ok(doIt[s.id], `nothing in this test knows how to do "${s.id}"`);
    doIt[s.id]();
  }
  assert.equal(nextStep(ctxOf(p)), null, 'the chain never finished');
  // every rule in the file has to be reachable, or it is a sentence nobody will ever read
  for (const rule of STEPS) {
    if (rule.id === 'link') continue;   // needs two outposts, which this walk never builds
    assert.ok(seen.includes(rule.id), `"${rule.id}" is unreachable — no state ever shows it`);
  }
});

test('the link step waits until there really are two outposts', () => {
  const p = fresh();
  Object.assign(p, {
    toolTier: 1, bag: { log: 9, stone: 9, clay: 12, iron_ingot: 9, iron_ore: 2 },
    hasStore: true, hasSmelter: true, hasFuel: true, hasDrill: true,
    hasRoute: true, hasPower: true, smelting: true, outposts: 1,
  });
  assert.equal(nextStep(ctxOf(p)), null, 'it offered a supply route with one outpost to route between');
  p.outposts = 2;
  assert.equal(nextStep(ctxOf(p)).id, 'link');
});

test('every step says what to do, why, and where — a hint with no `where` is a riddle', () => {
  for (const s of STEPS) {
    assert.ok(s.text && s.text.length < 70, `${s.id}: "${s.text}" is not one short sentence`);
    assert.ok(s.why && s.why.length > 40, `${s.id} does not say why it is next`);
    assert.ok(s.where, `${s.id} does not say where to do it`);
    assert.ok(typeof s.when === 'function', `${s.id} has no condition`);
  }
});

test('progress counts up and never goes backwards as you do the work', () => {
  const p = fresh();
  let last = -1;
  const order = ['tool', 'gather', 'store', 'clay', 'furnace', 'fuel', 'findore', 'smelt'];
  const doIt = {
    tool: () => { p.toolTier = 1; }, gather: () => { p.bag.log = 10; p.bag.stone = 20; },
    store: () => { p.hasStore = true; }, clay: () => { p.bag.clay = 12; },
    furnace: () => { p.hasSmelter = true; }, fuel: () => { p.hasFuel = true; },
    findore: () => { p.bag.iron_ore = 5; }, smelt: () => { p.smelting = true; },
  };
  for (const id of order) {
    const pr = chainProgress(ctxOf(p));
    assert.ok(pr.done > last, `progress stuck at ${pr.done} on "${id}"`);
    last = pr.done;
    doIt[id]();
  }
});
