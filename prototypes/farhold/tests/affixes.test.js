// node --test prototypes/farhold/tests/affixes.test.js
//
// The play-test found seven broken affixes and they were all the same bug: the data and the reader
// disagreed about what the number meant. These tests roll the real generator thousands of times and
// assert the thing a player actually sees — that no property is worth nothing, none is worth
// absurdly much, and that an item's level decides both how strong its properties are and which ones
// it is allowed to have at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ENGINE_UNIT, AFFIX_TUNING, AFFIX_CAP, AFFIX_TIERS, SLOT_RULES,
  tuneAffixData, rollAffixValue, itemLevelFor, requirementFor, affixAllowed,
  tierFor, tierMult, capValue, convert, DROPPED_STATS,
} from '../js/affixes.js';
import { Rpg, SLOTS } from '../js/rpg.js';
import { describeAffix, EFFECTS, INITIATIVE_PER_POINT } from '../js/effects.js';
import { pointsLeft } from '../js/perks.js';
import { applyStatus, tickStatuses, TICK_EVERY } from '../js/skills.js';
import { makeRng } from '../../emberveil/js/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const balance = read('../data/balance.json');
const skillData = read('../data/skills.json');

/** A fresh copy each time, because tuning rewrites the tables in place. */
const freshItems = () => read('../../emberveil/data/items.json');

test('every affix in the data is tuned — none is left on the old units', () => {
  const items = freshItems();
  const report = tuneAffixData(items);
  assert.equal(report.untuned.length, 0, `no tuning for: ${report.untuned.join(', ')}`);
  assert.ok(report.tuned > 50, `only ${report.tuned} affixes tuned`);
  // …and every one of them knows which unit it is in
  for (const list of Object.values(items.affixes)) {
    for (const def of list) {
      assert.ok(ENGINE_UNIT[def.stat], `${def.id} (${def.stat}) has no declared unit`);
      assert.ok(def.min > 0 || def.stat === 'cond_extraSetPiece', `${def.id} can roll to nothing`);
      assert.ok(def.max >= def.min, `${def.id} has max below min`);
    }
  }
});

test('the floors the play-test asked for are actually in place', () => {
  // "0.1% critical chance on the first hit… should be more like 10-20% minimum"
  assert.ok(AFFIX_TUNING.first_hit_crit.min >= 10, 'first-hit crit still rolls a rounding error');
  // "exp should probably have a minimum of 5%"
  assert.ok(AFFIX_TUNING.xp_gain.min >= 5);
  // "Critical damage should be more like 10-20%"
  assert.ok(AFFIX_TUNING.crit_damage.min >= 10);
  // "0.1% better loot and I think this should start around 20%"
  assert.ok(AFFIX_TUNING.magic_find_adv.min >= 20);
  // "0% Critical chance" — anything printed as a percentage must roll to a readable one
  assert.ok(AFFIX_TUNING.crit_chance.min >= 1);
  // "Skills come back 0% sooner"
  assert.ok(AFFIX_TUNING.cdr.min >= 1);
});

test('nothing can roll to zero, and nothing can roll absurdly high', () => {
  const items = freshItems();
  const rpg = new Rpg(items, balance);
  const rng = makeRng(4242);
  const bases = [...Object.keys(items.weaponBases), ...Object.keys(items.armorBases)];
  const rarities = ['normal', 'magic', 'rare', 'legendary'];
  let rolled = 0;
  const seen = new Set();
  const bad = [];
  for (let i = 0; i < 4000; i++) {
    const base = bases[Math.floor(rng() * bases.length)];
    const level = 1 + Math.floor(rng() * 50);
    const item = rpg.loot.generate(base, rarities[Math.floor(rng() * 4)], 'fine', { rng, level });
    if (!item) continue;
    for (const a of item.affixes || []) {
      if (a.baseIntrinsic) continue;
      rolled++;
      seen.add(a.stat);
      assert.ok(Number.isFinite(a.value), `${a.stat} rolled ${a.value}`);
      const text = describeAffix(a);
      // a property that reads as zero is a failed property
      // a real word boundary: `90%` must not be read as `0%`
      if (/(^|[^\d.])0(\.0)?%/.test(text)) bad.push(`ZERO ${text}`);
      // …and one that reads as four figures is the unit bug the other way round
      const m = text.match(/([\d.]+)%/);
      if (m && Number(m[1]) > 260) bad.push(`HUGE ${text}`);
    }
  }
  assert.ok(rolled > 8000, `only ${rolled} affixes rolled`);
  assert.ok(seen.size > 55, `only ${seen.size} distinct stats appeared`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} unreadable affixes, e.g. ${bad.slice(0, 3).join(' | ')}`);
});

test('the caps hold, even against a value pushed in from outside', () => {
  // "1993% damage to the undead… that should cap out around 250% tops"
  assert.equal(capValue('cond_dmgVsUndead', 19.93), 2.5);
  assert.equal(capValue('critChance', 900), 60);
  assert.equal(capValue('str', 900), 900, 'a flat attribute has no cap and should not get one by accident');
  for (const [stat, cap] of Object.entries(AFFIX_CAP)) {
    assert.ok(cap > 0, `${stat} has a nonsense cap`);
    assert.ok(capValue(stat, cap * 10) <= cap);
  }
});

test('units are converted, and only where they are genuinely wrong', () => {
  // a percentage written as a fraction
  assert.equal(convert('critChance', 0.05), 5);
  // a fraction written as a percentage
  assert.equal(convert('cond_dmgVsUndead', 20), 0.2);
  // …and values already in the right unit are left exactly alone
  assert.equal(convert('critChance', 12), 12);
  assert.equal(convert('cond_dmgVsUndead', 0.25), 0.25);
  assert.equal(convert('hp', 20), 20, 'a flat stat must never be rescaled');
  assert.equal(convert('str', 0.5), 0.5);
});

test('item level decides the tier, and the tiers climb', () => {
  assert.equal(tierFor(1).name, 'crude');
  assert.equal(tierFor(50).name, 'mythic');
  for (let i = 1; i < AFFIX_TIERS.length; i++) {
    assert.ok(AFFIX_TIERS[i].at > AFFIX_TIERS[i - 1].at, 'tiers are out of order');
    assert.ok(AFFIX_TIERS[i].mult > AFFIX_TIERS[i - 1].mult, 'a later tier is not stronger');
  }
  assert.equal(tierMult(1), 1, 'a level-1 item gets the base range and nothing more');
  assert.ok(tierMult(50) > tierMult(20));
  assert.ok(tierMult(50, 1) < tierMult(50, 6), 'growth is not doing anything');
});

test('the same affix is worth more on a higher-level item, and never less', () => {
  const items = freshItems();
  tuneAffixData(items);
  const def = items.affixes.prefixes.find(a => a.id === 'crit_chance');
  const avg = ilvl => {
    const rng = makeRng(7);
    let total = 0;
    for (let i = 0; i < 400; i++) total += rollAffixValue(def, ilvl, rng);
    return total / 400;
  };
  const low = avg(2), mid = avg(20), high = avg(48);
  assert.ok(mid > low * 1.2, `${mid.toFixed(1)}% at 20 against ${low.toFixed(1)}% at 2`);
  assert.ok(high > mid * 1.2, `${high.toFixed(1)}% at 48 against ${mid.toFixed(1)}% at 20`);
  // …and a level-1 roll is still a real number, not a rounding error
  assert.ok(low >= AFFIX_TUNING.crit_chance.min, 'the low tier fell under its own floor');
});

test('an affix cannot appear before its item level, or on the wrong slot', () => {
  const items = freshItems();
  tuneAffixData(items);
  const byId = {};
  for (const list of Object.values(items.affixes)) for (const a of list) byId[a.id] = a;

  // "Damage should appear from level 1 while crit chance could appear from 3, and more advanced
  // ones like crit chance against the first hit appearing at level 8 or higher."
  assert.ok(affixAllowed(byId.sharp, 'weapon', 1), 'plain damage must be available from the start');
  assert.equal(affixAllowed(byId.crit_chance, 'weapon', 1), false);
  assert.ok(affixAllowed(byId.crit_chance, 'weapon', 3));
  assert.equal(affixAllowed(byId.first_hit_crit, 'weapon', 7), false);
  assert.ok(affixAllowed(byId.first_hit_crit, 'weapon', 8));

  // "experience… should only come on certain slots like helm"
  assert.ok(affixAllowed(byId.xp_gain, 'head', 20));
  for (const slot of ['weapon', 'chest', 'feet', 'ring']) {
    assert.equal(affixAllowed(byId.xp_gain, slot, 20), false, `experience should not roll on ${slot}`);
  }
  // "most should still be available on jewellery"
  const onRings = Object.keys(SLOT_RULES).filter(id => SLOT_RULES[id].includes('ring'));
  assert.ok(onRings.length > Object.keys(SLOT_RULES).length * 0.8, 'jewellery lost most of the pool');
  // and every slot named in a rule is a real slot
  for (const [id, slots] of Object.entries(SLOT_RULES)) {
    for (const s of slots) assert.ok(SLOTS.includes(s), `${id} names a slot that does not exist: ${s}`);
  }
});

test('a low-level item really does carry fewer kinds of property', () => {
  const items = freshItems();
  const rpg = new Rpg(items, balance);
  const kinds = level => {
    const rng = makeRng(31);
    const out = new Set();
    for (let i = 0; i < 600; i++) {
      const item = rpg.loot.generate('sword', 'rare', 'fine', { rng, level });
      for (const a of item?.affixes || []) if (!a.baseIntrinsic) out.add(a.stat);
    }
    return out;
  };
  const early = kinds(1), late = kinds(45);
  assert.ok(late.size > early.size, `${early.size} kinds at level 1 against ${late.size} at 45`);
  assert.ok(!early.has('cond_firstHitCritBonus'), 'a level-1 sword rolled a first-hit conditional');
});

test('item level and the wearer requirement line up, and an affix can lower it', () => {
  const items = freshItems();
  const rpg = new Rpg(items, balance);
  const rng = makeRng(9);
  for (const level of [1, 10, 30, 50]) {
    const it = rpg.loot.generate('sword', 'rare', 'fine', { rng, level });
    assert.ok(Math.abs(it.ilvl - level) <= 4, `a level-${level} drop came out at item level ${it.ilvl}`);
    assert.equal(it.levelReq, requirementFor(it.ilvl));
  }
  assert.equal(itemLevelFor(1, 'normal', () => 0.5), 1, 'item level never goes below 1');

  // the requirement-lowering affix works on its OWN item, in the bag, unequipped
  const item = rpg.loot.generate('sword', 'rare', 'fine', { rng, level: 30 });
  const before = rpg.levelRequirement(item, { equipment: {} });
  item.affixes.push({ id: 'early_promise', stat: 'cond_levelReqReduce', value: 4, name: 'of Early Promise' });
  const after = rpg.levelRequirement(item, { equipment: {} });
  assert.equal(after.level, Math.max(1, before.level - 4));
  assert.equal(after.reduced, true);
  assert.equal(before.reduced, false);

  // …and on everything else once it is worn
  const other = rpg.loot.generate('heavy_helm', 'rare', 'fine', { rng, level: 30 });
  const plain = rpg.levelRequirement(other, { equipment: {} });
  const helped = rpg.levelRequirement(other, { equipment: { ring: item } });
  assert.equal(helped.level, Math.max(1, plain.level - 4));
  assert.equal(helped.reduced, true);
});

test('you cannot wear what you have not grown into, and it says why', () => {
  const items = freshItems();
  const rpg = new Rpg(items, balance);
  const player = rpg.createPlayer({ classId: 'ranger', level: 3 });
  const big = rpg.loot.generate('sword', 'rare', 'fine', { rng: makeRng(2), level: 40 });
  const out = rpg.equip(player, big);
  assert.ok(out?.refused, 'a level-3 character equipped a level-40 sword');
  assert.match(out.refused, /needs level/);
  assert.notEqual(player.equipment.weapon, big);
  // …and the same item goes on once the character has caught up
  player.level = 50;
  assert.equal(rpg.equip(player, big)?.refused, undefined);
  assert.equal(player.equipment.weapon, big);
});

test('every road-weapon property says what it does, in words', () => {
  // "I found an item with 'Starwake: 2' and 'Star brand: 0.2'. I have no idea what these do."
  const items = freshItems();
  const stats = new Set();
  for (const group of ['weaponBases', 'armorBases']) {
    for (const base of Object.values(items[group])) for (const f of base.intrinsic || []) stats.add(f.stat);
  }
  for (const u of items.uniques || []) {
    for (const f of [...(u.fixedAffixes || []), ...(u.randomAffixes || [])]) stats.add(f.stat);
  }
  assert.ok(stats.size > 20, 'the road weapons lost their properties');
  for (const stat of stats) {
    // R21: accuracy is removed from Farhold. items.json is shared with Emberveil, which still
    // rolls it, so the stat is stripped as the file loads (see `tuneAffixData`) rather than
    // deleted from the file — and a stat Farhold has thrown away owes nobody a description.
    if (DROPPED_STATS.has(stat)) continue;
    assert.ok(EFFECTS['affix:' + stat], `${stat} has no entry — it would print as "name: value"`);
    const text = describeAffix({ stat, value: 2, name: 'X' });
    // the fallback is `name: value`; anything else is a real sentence
    assert.ok(!/^X: /.test(text) && !/^\w+: [\d.]+$/.test(text),
      `${stat} fell through to the raw fallback: "${text}"`);
    assert.ok(/[a-z]{4}/.test(text), `${stat} describes itself as "${text}"`);
  }
});

test('a set bonus describes itself in words, not in field names', () => {
  const items = freshItems();
  tuneAffixData(items);
  for (const set of items.sets || []) {
    for (const table of Object.values(set.partialBonuses || {})) {
      for (const [stat, value] of Object.entries(table)) {
        const text = describeAffix({ stat, value });
        assert.ok(EFFECTS['affix:' + stat], `a set bonus uses ${stat}, which has no description`);
        assert.ok(!/^\w+: [\d.]+$/.test(text) && !/^\w+ \+[\d.]+$/.test(text),
          `a set bonus still reads as the raw field name: "${text}"`);
        assert.ok(!/\b0(\.0)?%/.test(text), `a set bonus reads as nothing: "${text}"`);
      }
    }
  }
});

test('damage over time lands in whole ticks, and is worth casting', () => {
  // "Poison damage, at least from the ranger's poison dart skill, seems to only do one damage per
  // tick and is almost useless."
  const foe = { hp: 500, maxHp: 500 };
  const dart = skillData.skills.poison_dart;
  assert.ok(dart.statusMult > 1, 'the dart no longer leans on what it leaves behind');
  const hit = 12;
  applyStatus(foe, 'poison', skillData.statuses.poison, hit * 0.9 * dart.statusMult);

  const ticks = [];
  for (let t = 0; t < 12 && foe.statuses.poison; t += 1 / 60) {
    const d = tickStatuses(foe, 1 / 60);
    if (d > 0) ticks.push(d);
  }
  // one payout a second, not sixty
  assert.ok(ticks.length <= skillData.statuses.poison.seconds + 1,
    `${ticks.length} payouts for an ${skillData.statuses.poison.seconds}s poison`);
  assert.ok(ticks.length >= skillData.statuses.poison.seconds - 1);
  assert.equal(TICK_EVERY, 1);
  // each one is a number a player can read
  for (const d of ticks.slice(0, -1)) assert.ok(d >= 2, `a tick of ${d.toFixed(2)} still reads as nothing`);
  // and the total is most of the hit again, which is what a damage-over-time skill is for
  const total = ticks.reduce((a, b) => a + b, 0);
  assert.ok(total > hit * 2, `the whole poison came to ${total.toFixed(1)} against a ${hit} hit`);
});

test('the registry re-derives the sheet while a timed affix is up', () => {
  // "the move speed on hit proc doesn't seem to work in game" — the timer ticked, and nothing ever
  // rebuilt the sheet, so the buff never reached the legs.
  const items = freshItems();
  const rpg = new Rpg(items, balance);
  const player = rpg.createPlayer({ classId: 'ranger', level: 10 });
  const rt = rpg.fx.rt(player);
  rpg.fx.update(player, 0.016, { fighting: false });
  assert.equal(rpg.fx.update(player, 0.016, { fighting: false }).dirty, false, 'a quiet frame should not be dirty');

  rt.openingRush = 4;
  assert.equal(rpg.fx.update(player, 0.016, { fighting: true }).dirty, true, 'the buff starting was not noticed');
  assert.equal(rpg.fx.update(player, 0.016, { fighting: true }).dirty, false, 'it should only fire on the change');
  rt.openingRush = 0;
  assert.equal(rpg.fx.update(player, 0.016, { fighting: true }).dirty, true, 'the buff ending was not noticed');

  // …and the stat it feeds really does reach move speed
  player.derived.movePct = 0;
  const before = player.derived.moveSpeed;
  player.derived.movePct = 20;
  rpg.refresh(player);
  assert.ok(player.derived.moveSpeed !== before || player.derived.movePct === 0);
});

// ================================================================= R18 — the three unit rulings

/**
 * THE USER'S RULINGS, AS TESTS.
 *
 *   1. "Potency/spellpower should be a percentage modifier that applies to spells."
 *   2. "haste and extraleg should both be percent modifiers, 0.10 = 10% faster movespeed."
 *
 * Each of these was a case where the READER and the WRITERS disagreed about the unit, and in every
 * one the disagreement was invisible on the card — the card printed whatever the writer meant.
 */

test('R18 — spellPower is a share, and one perk node cannot multiply magic damage by five', () => {
  assert.equal(ENGINE_UNIT.spellPower, 'frac',
    'spellPower is read as `1 + v` by both js/rpg.js and js/skills.js, so it is a fraction');

  // the affix rolls as a share, at every item level, and never as points
  for (const ilvl of [1, 20, 45, 60]) {
    const def = { id: 'potency', stat: 'spellPower', min: 0.05, max: 0.15 };
    for (let i = 0; i < 200; i++) {
      const v = rollAffixValue(def, ilvl, Math.random);
      assert.ok(v > 0 && v <= 1.5, `potency rolled ${v} at ilvl ${ilvl} — that is ${1 + v}x spell damage`);
    }
  }
});

test('R18 — every haste writer speaks percentage points, and only initiative converts', () => {
  const d = () => ({ haste: 0, movePct: 0 });

  // initiative is the one affix in POINTS, and it converts at its own site
  const init = EFFECTS['affix:initiative'];
  assert.ok(init?.derive, 'affix:initiative no longer has its own derive — the x4 has moved back');
  assert.ok(!init.plain, 'affix:initiative is a plain field again, so the conversion is lost');
  const a = d(); init.derive(3, a);
  assert.equal(a.haste, 3 * INITIATIVE_PER_POINT, '3 points of initiative should be +12% attack speed');

  /**
   * …and nothing multiplies the SHEET's haste after the fact. This is the actual regression guard:
   * `js/rpg.js` used to do `d.haste *= INITIATIVE_PER_POINT` after every writer had had its say, so
   * the perk labelled "+5% attack speed" gave +20% and the Doubled Grasp keystone's -20% became
   * -80%, clamped to -50% — it halved your attack rate instead of costing a fifth.
   */
  // comments stripped first — the note explaining the fix necessarily QUOTES the old line, and the
  // first version of this guard matched its own documentation and failed
  const rpgSrc = readFileSync(new URL('../js/rpg.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.ok(!/d\.haste\s*\*=/.test(rpgSrc),
    'js/rpg.js multiplies d.haste after the writers again — the perks and the speed legendary '
    + 'already write percentage points and will be quadrupled');
});

test('R18 — an Emberveil "leg of travel" is a modest share here, not +200% move speed', () => {
  const leg = EFFECTS['affix:cond_extraLeg'];
  assert.ok(leg?.derive, 'cond_extraLeg lost its derive');
  const d = { movePct: 0 };
  // the Pathfinder Javelin's own value, straight out of the shared items.json
  leg.derive(2, d);
  assert.ok(d.movePct > 0, 'two legs of travel buy nothing at all');
  assert.ok(d.movePct <= 25,
    `two legs of travel gave +${d.movePct}% move speed — items.json is SHARED with Emberveil, where `
    + 'that value means legs on a stage map, so Farhold has to scale it rather than read it as a share');
  // and the card has to say the same number the sheet gets
  assert.match(leg.desc ? leg.desc(2) : '', /\+\s*8(\.0)?%/, 'the card and the sheet disagree');
});

// ================================================================= R18 — rewards that paid nothing

/**
 * FOUR THINGS THAT LOGGED A REWARD AND GAVE NOTHING.
 *
 * Each of these is the project's signature fault from a different angle: a value written by several
 * call sites and read by none, a function called behind `?.` that does not exist, a rule applied at
 * one call site out of five.
 */
test('R18 — a perk point you were paid reaches the budget', () => {
  const at30 = { level: 30, perks: [] };
  const base = pointsLeft(at30);
  const paid = pointsLeft({ ...at30, bonusPerks: 3 });
  assert.equal(paid, base + 3,
    '`bonusPerks` is written by five call sites (a world boss, a landmark, a stronghold, a job '
    + 'frame) and was read by none — every perk-point reward logged "A perk point, for the trouble." '
    + 'and moved no badge');
});

test('R18 — your own buffs reach a weapon swing, not just a skill cast', () => {
  const items = read('../../emberveil/data/items.json');
  const r = new Rpg(items, balance);
  const hero = r.createPlayer({ name: 'T', classId: 'warrior', level: 20 });
  r.refresh(hero, { full: true });
  const dummy = { name: 'post', hp: 99999, maxHp: 99999, derived: { resistAll: 0 }, dmg: [1, 1] };

  const roll = (who, n = 400) => {
    let total = 0;
    for (let i = 0; i < n; i++) total += r.strike(who, { ...dummy, statuses: {} }, makeRng(i + 1)).amount;
    return total / n;
  };

  const plain = roll(hero);
  // "Hit harder for a while" — the status the game already has, on the player
  applyStatus(hero, 'might', skillData.statuses.might, 1);
  const buffed = roll(hero);
  assert.ok(buffed > plain * 1.05,
    `War Cry's might did nothing to a weapon swing (${plain.toFixed(1)} -> ${buffed.toFixed(1)}): `
    + '`outgoingFrom` was applied at exactly one call site, a skill cast');
});
