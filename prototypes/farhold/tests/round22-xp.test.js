// node --test prototypes/farhold/tests/round22-xp.test.js
//
// Round 22 — the experience economy, the level cap as a world setting, and the two multipliers that
// were each being applied twice.
//
// The report this file exists for:
//
//   "Right now I reach level 12 before I even leave the first zone… I was level 22 and teleported to
//    a level 20-22 zone and after just a few kills from my companions I was level 30, 31, so quick.
//    I reached level 30 in about 10 minutes."
//
// Every assertion below is a RULE rather than a number, because the numbers are knobs in
// `data/balance.json` and are meant to move. What must not move is that a kill five levels beneath
// you is worth nothing, that a level cap of 100 is the same climb in twice as many steps, and that
// no multiplier is applied in two places at once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Rpg, xpForLevel, levelFromXp, eventXp, setLevelCap, levelCap, MAX_LEVEL, PLANET_BANDS } from '../js/rpg.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, '..', f), 'utf8');
const items = JSON.parse(read('../emberveil/data/items.json'));
const balance = JSON.parse(read('data/balance.json'));
const xpCfg = balance.xp || {};
const rpg = () => new Rpg(items, balance);

// ---------------------------------------------------------------- the level cap is a world setting

test('the level cap is a world setting, and a longer ladder is the same climb', () => {
  // the default is untouched — a save made before this round loads into the same curve
  setLevelCap(50);
  assert.equal(levelCap(), 50);
  assert.equal(MAX_LEVEL, 50);
  const totalAt50 = xpForLevel(50);
  assert.equal(xpForLevel(30), 30443, 'the 50-level curve moved');

  // …and a 100-level world costs the SAME total, in twice as many steps
  setLevelCap(100);
  assert.equal(levelCap(), 100);
  assert.equal(xpForLevel(100), totalAt50,
    'a 1-100 world is meant to be the same climb cut into smaller steps, not twice the grind');
  assert.equal(xpForLevel(60), xpForLevel(30, 50), 'the 60% mark should cost what the 60% mark costs');
  assert.ok(xpForLevel(2) < 58, 'an early level on a long ladder should be cheaper, not dearer');

  // a shorter one too
  setLevelCap(30);
  assert.equal(xpForLevel(30), totalAt50);

  setLevelCap(50);
});

test('the curve never goes backwards and the cap holds, at every cap', () => {
  for (const cap of [30, 50, 100]) {
    setLevelCap(cap);
    assert.equal(xpForLevel(1), 0);
    for (let l = 2; l <= cap; l++) {
      assert.ok(xpForLevel(l) > xpForLevel(l - 1), `cap ${cap}: level ${l} is not past ${l - 1}`);
    }
    assert.equal(levelFromXp(1e12), cap, `cap ${cap}: the level cap does not hold`);
    assert.equal(levelFromXp(xpForLevel(5)), 5);
  }
  setLevelCap(50);
});

test('the planet bands are the same three fractions of whatever ladder the world has', () => {
  for (const cap of [30, 50, 100]) {
    setLevelCap(cap);
    const [low, mid, high] = PLANET_BANDS;
    assert.equal(low.min, 1, `cap ${cap}: a settled world must start at 1`);
    assert.equal(high.max, cap, `cap ${cap}: the deep dark must reach the cap`);
    assert.equal(low.max, mid.min, `cap ${cap}: a gap between the low and medium bands`);
    assert.equal(mid.max, high.min, `cap ${cap}: a gap between the medium and high bands`);
    assert.ok(low.max > 1 && mid.max > mid.min, `cap ${cap}: a band with no room in it`);
  }
  setLevelCap(50);
  assert.deepEqual(PLANET_BANDS.map(b => [b.min, b.max]), [[1, 30], [30, 40], [40, 50]],
    'the default world bands are not what they have always been');
});

// ---------------------------------------------------------------- what a kill is worth

test('a kill five levels beneath you is worth nothing at all', () => {
  const r = rpg();
  const player = { level: 20 };
  const foe = lvl => ({ level: lvl, xp: 500 });

  assert.equal(r.killXpFor(player, foe(25), xpCfg) > 0, true);
  assert.equal(r.killXpFor(player, foe(15), xpCfg), 0, 'five levels below still paid');
  assert.equal(r.killXpFor(player, foe(14), xpCfg), 0, 'six levels below still paid');
  assert.equal(r.killXpFor(player, foe(1), xpCfg), 0, 'the starting-zone trash still paid at level 20');

  // …and it falls off on the way down, rather than dropping off a cliff at the last step
  const steps = [0, 1, 2, 3, 4, 5].map(gap => r.killXpFor(player, foe(20 - gap), xpCfg));
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] < steps[i - 1], `the award did not fall between gap ${i - 1} and ${i}`);
  }
  assert.equal(steps.at(-1), 0);
});

test('a kill pays a fifth of what it used to, and something above you pays more', () => {
  const r = rpg();
  const player = { level: 20 };
  const even = r.killXpFor(player, { level: 20, xp: 1000 }, xpCfg);
  assert.equal(even, Math.round(1000 * xpCfg.kill), 'an even fight is not paying the configured share');
  assert.equal(xpCfg.kill, 0.2, 'the ask was a fifth');

  // the other side of the same rule: a falloff with no upside is a reason never to fight anything
  const above = r.killXpFor(player, { level: 26, xp: 1000 }, xpCfg);
  assert.ok(above > even, 'something above your level is worth no more than something at it');
  const wayAbove = r.killXpFor(player, { level: 60, xp: 1000 }, xpCfg);
  assert.ok(wayAbove <= even * (xpCfg.killBonusCap ?? 1.6) + 1, 'the bonus for punching up has no ceiling');
});

// ---------------------------------------------------------------- what everything else is worth

test('an event award is priced by the zone it happened in, not by your own level', () => {
  const near = eventXp(30, { zoneLevel: 1, kind: 'landmark', cfg: xpCfg });
  const far = eventXp(30, { zoneLevel: 40, kind: 'landmark', cfg: xpCfg });
  assert.ok(far > near * 3, 'walking to a landmark in the deep dark pays the same as one outside town');

  // "'you gain 50 xp for the walk' should be greatly increased like 150"
  assert.ok(eventXp(50, { zoneLevel: 1, kind: 'landmark', cfg: xpCfg }) >= 150,
    'the walk still pays what it paid');

  // quests and cleared places get the 50% that was asked for, and landmarks get more than that
  assert.equal(xpCfg.quest, 1.5);
  assert.equal(xpCfg.event, 1.5);
  assert.ok(xpCfg.landmark > xpCfg.event);
  assert.ok(eventXp(100, { zoneLevel: 1, kind: 'quest', cfg: xpCfg }) > 100);
  assert.equal(eventXp(0, { zoneLevel: 9, kind: 'quest', cfg: xpCfg }), 0, 'nothing became something');
});

// ---------------------------------------------------------------- one multiplier, one place

test('no XP award site does its own level scaling any more', () => {
  const main = read('js/main.js');
  /**
   * The five that grew up one at a time — `× (1 + (level-1) × 0.15)` twice, `× 0.1` twice, and a
   * bare `40 × freed × player.level`. Nobody had ever seen them side by side, which is the only
   * reason they were different from each other. Every one of them is `eventXp` now.
   */
  assert.equal(/gainXp\(player, Math\.round\([^)]*player\.level - 1\)/.test(main), false,
    'an award site is scaling by the player level on its own again');
  assert.equal(/gainXp\(player, \d+ \* [a-zA-Z.]+ \* player\.level\)/.test(main), false,
    'an award site is multiplying flat by the player level again');
  // and the kill goes through the one function that knows about the gap
  assert.match(main, /rpg\.killXpFor\(player, e, xpCfg\)/);
});

test('spell power and the outgoing buff are each applied exactly once', () => {
  const skills = read('js/skills.js');
  const main = read('js/main.js');
  const rpgSrc = read('js/rpg.js');

  // js/rpg.js `strike` is the one place both live, because a wand bolt and an elemental weapon
  // swing pass through it and never go near js/skills.js
  assert.match(rpgSrc, /element !== 'physical' && a\?\.spellPower\) amount \*= 1 \+ a\.spellPower/);
  assert.match(rpgSrc, /attacker\.equipment && !defender\.equipment\) amount \*= outgoingFrom\(attacker\) \* incomingFrom\(defender\)/);

  // …so the plan handed to strikeArea carries the skill's own multiplier and nothing else
  assert.match(skills, /\n\s*mult: s\.mult \|\| 1,/);
  assert.match(main, /const power = plan\.mult;/);
  assert.equal(/const power = plan\.mult \* outgoingFrom/.test(main), false,
    'castSkill is multiplying by the outgoing buff that strike already applies');
});
