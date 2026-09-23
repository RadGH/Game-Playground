// Farhold R20 — the Unbinder: taking back a spell, a perk or a talent, for coin.
//
//   "Add an NPC at town who is able to reset individual or all spells, perks, and talents, and
//    remove the ability to do it directly from the inventory. These should cost a small amount of
//    gold we can tweak later."
//
// All three used to be free and instant on the character sheet: "Take it all back" emptied the
// whole perk forest, "Give this one back" popped a single node, clicking a talent you already had
// cleared it, and the Spells tab carried an "Unlearn" button on every filled slot. So a build was
// never a decision — it was a setting, and you could re-tune it mid-fight for nothing.
//
// Now there is one door for all three of them, it is a person standing in a town, and it costs
// money. What the sheet does is show you what you have; what it no longer does is take it away.
//
// PURE. No DOM, no Three.js, no data loaded here — js/talkui.js draws the counter, js/main.js
// wires it up, and the node tests drive every rule in this file without a browser.
//
//   import { retrainMenu, forgetSpell, forgetAllPerks } from './retrain.js';
//   const menu = retrainMenu({ player, build, cat, forest, prices });
//   forgetSpell({ player, build, cat, slot: 2, prices });
//
// ---------------------------------------------------------------------------------------------
// ONE SHAPE FOR ALL SIX ACTIONS, WHICH IS THE POINT.
//
// Every `forget*` below does the same four things in the same order: work out the price, refuse
// with a sentence if it cannot be done, take the gold, make the change. They return the same
// `{ ok, why, spent, … }` either way, so the panel has one code path and a refusal can never be
// mistaken for a purchase that quietly did nothing.

import { canRefund, refundOne, refundAll, spentBy, takenOf } from './perks.js';
import { clearTalent, TALENT_LIBRARY, treeFor } from './skilltalents.js';
import { unlearnSpell, PICK_COUNT } from './classbuild.js';

/**
 * What it costs, if `data/balance.json` has no `retrain` block. The real numbers live in the data
 * file; these exist so the module is usable — and testable — on its own.
 */
export const DEFAULT_PRICES = {
  spell: { one: 120, perLevel: 20, all: 500, allPerLevel: 60 },
  perk: { one: 80, perLevel: 12, all: 400, allPerLevel: 45 },
  talent: { one: 60, perLevel: 8, all: 250, allPerLevel: 30 },
};

/**
 * The price of one unbinding.
 *
 * `kind` is 'spell' | 'perk' | 'talent', `scope` is 'one' | 'all'. It climbs with the character's
 * level so that a decision which cost real money at level 5 has not become loose change by 30 —
 * but the base is deliberately small, because charging a lot to try something out only teaches
 * people not to try anything.
 */
export function priceOf(kind, scope = 'one', level = 1, prices = null) {
  const row = (prices || DEFAULT_PRICES)[kind] || DEFAULT_PRICES[kind] || {};
  const base = scope === 'all' ? (row.all ?? 0) : (row.one ?? 0);
  const per = scope === 'all' ? (row.allPerLevel ?? 0) : (row.perLevel ?? 0);
  return Math.max(0, Math.round(base + per * Math.max(0, (level || 1) - 1)));
}

/** Not enough coin, in the same sentence everywhere. Null when there is. */
function purseRefusal(player, price) {
  const gold = player?.gold || 0;
  return gold >= price ? null : `${price} gold. You have ${gold}.`;
}

/** Take the money. Only ever called once a refusal has come back null. */
function spend(player, price) {
  player.gold = Math.max(0, (player.gold || 0) - price);
  return price;
}

// ---------------------------------------------------------------------------- spells

/**
 * Which spells this character could have taken back out.
 *
 * Only a custom build has any: a preset class's six are what the class IS, and unbinding one would
 * leave a warrior who is not a warrior with no way back. The panel says so rather than showing an
 * empty list.
 */
export function spellRows({ player, build, cat, prices = null } = {}) {
  if (!build?.custom || !cat) return [];
  const level = player?.level || 1;
  const price = priceOf('spell', 'one', level, prices);
  return (build.spells || []).map((id, slot) => {
    if (!id) return null;
    const spell = cat.byId.get(id) || null;
    return {
      slot,
      id,
      name: spell?.name || id,
      desc: spell?.desc || '',
      at: cat.unlockAt?.[slot] ?? 1,
      price,
      refusal: purseRefusal(player, price),
    };
  }).filter(Boolean);
}

/**
 * A SPELL'S TALENTS GO WITH IT, AND THEY GO FREE.
 *
 * `player.skillTalents` is keyed by SKILL id, not by slot, so a spell taken off the bar leaves its
 * talents behind. Two things go wrong if they are left: the Unbinder's own talent shelf lists rows
 * for a spell you no longer have (named by their raw id, because `skillState` has nothing to look
 * the name up on), and re-learning that spell later would hand its old talents back, unpaid.
 *
 * Clearing them costs nothing on purpose. The player has already paid to unbind the spell, and
 * charging a second time for a consequence they did not choose would read as the counter helping
 * itself.
 */
function dropTalentsFor(player, skillId) {
  if (!skillId || !player?.skillTalents?.[skillId]) return 0;
  const had = Object.values(player.skillTalents[skillId]).filter(Boolean).length;
  delete player.skillTalents[skillId];
  return had;
}

/** Take one spell back out of its slot. The slot is then owed a pick again, for free. */
export function forgetSpell({ player, build, cat, slot, prices = null } = {}) {
  if (!build?.custom) return { ok: false, why: 'This class was not built — its spells are what it is.', spent: 0 };
  if (!Number.isInteger(slot) || slot < 0 || slot >= PICK_COUNT) return { ok: false, why: 'There is no such slot.', spent: 0 };
  if (!build.spells?.[slot]) return { ok: false, why: 'That slot is already empty.', spent: 0 };
  const price = priceOf('spell', 'one', player?.level || 1, prices);
  const short = purseRefusal(player, price);
  if (short) return { ok: false, why: short, spent: 0 };
  const out = unlearnSpell(build, slot);
  if (!out.ok) return { ok: false, why: out.why, spent: 0 };
  const talents = dropTalentsFor(player, out.refunded);
  const name = cat?.byId?.get(out.refunded)?.name || out.refunded;
  return { ok: true, why: null, spent: spend(player, price), name, slot, talents };
}

/** Take all of them back out at once. */
export function forgetAllSpells({ player, build, cat, prices = null } = {}) {
  if (!build?.custom) return { ok: false, why: 'This class was not built — its spells are what it is.', spent: 0 };
  const held = (build.spells || []).filter(Boolean).length;
  if (!held) return { ok: false, why: 'You have not learned any.', spent: 0 };
  const price = priceOf('spell', 'all', player?.level || 1, prices);
  const short = purseRefusal(player, price);
  if (short) return { ok: false, why: short, spent: 0 };
  const names = [];
  let talents = 0;
  for (let slot = 0; slot < PICK_COUNT; slot++) {
    if (!build.spells?.[slot]) continue;
    const out = unlearnSpell(build, slot);
    if (!out.ok) continue;
    names.push(cat?.byId?.get(out.refunded)?.name || out.refunded);
    talents += dropTalentsFor(player, out.refunded);   // they go with the spell, free
  }
  return { ok: true, why: null, spent: spend(player, price), count: names.length, names, talents };
}

// ---------------------------------------------------------------------------- perks

/**
 * Which perk nodes could go back, and which cannot and why.
 *
 * The "why not" is `canRefund`'s own sentence — a node in the middle of a walk holds everything
 * past it up, and naming those is the difference between a greyed button and an instruction.
 */
export function perkRows({ player, forest, prices = null } = {}) {
  if (!forest) return [];
  const level = player?.level || 1;
  const price = priceOf('perk', 'one', level, prices);
  const taken = [...takenOf(player)].filter(id => id !== 'start');
  return taken.map(id => {
    const node = forest.byId.get(id);
    if (!node) return null;
    const back = canRefund(player, forest, id);
    return {
      id,
      name: node.name || id,
      arm: node.arm || null,
      price,
      // the purse is checked second, so a node that cannot come back says the structural reason
      refusal: back.ok ? purseRefusal(player, price) : back.why,
    };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

/** Hand one perk node back. */
export function forgetPerk({ player, forest, id, prices = null } = {}) {
  if (!forest) return { ok: false, why: 'No forest loaded.', spent: 0 };
  const back = canRefund(player, forest, id);
  if (!back.ok) return { ok: false, why: back.why, spent: 0 };
  const price = priceOf('perk', 'one', player?.level || 1, prices);
  const short = purseRefusal(player, price);
  if (short) return { ok: false, why: short, spent: 0 };
  const out = refundOne(player, forest, id);
  if (!out.ok) return { ok: false, why: out.why, spent: 0 };
  return { ok: true, why: null, spent: spend(player, price), name: out.node?.name || id };
}

/** Empty the whole forest. The points come back; the gold does not. */
export function forgetAllPerks({ player, prices = null } = {}) {
  const held = spentBy(player);
  if (!held) return { ok: false, why: 'You have not spent any.', spent: 0 };
  const price = priceOf('perk', 'all', player?.level || 1, prices);
  const short = purseRefusal(player, price);
  if (short) return { ok: false, why: short, spent: 0 };
  const count = refundAll(player);
  return { ok: true, why: null, spent: spend(player, price), count };
}

// ---------------------------------------------------------------------------- talents

/**
 * Every talent this character has taken, across every skill.
 *
 * `skillState` is the bar as js/skills.js `state()` reports it — it carries the name and the shape,
 * and the shape is what decides which tree a skill was offered, so the node has to be looked up
 * through `treeFor` rather than straight out of the library. Without the shape a swipe talent on a
 * melee skill would be named after whatever bolt node shares its id.
 */
export function talentRows({ player, skillState = [], prices = null } = {}) {
  const level = player?.level || 1;
  const price = priceOf('talent', 'one', level, prices);
  const out = [];
  for (const [skillId, picks] of Object.entries(player?.skillTalents || {})) {
    const skill = skillState.find(s => s.id === skillId) || null;
    const tree = treeFor(skillId, skill?.shape || 'bolt');
    for (const [tier, nodeId] of Object.entries(picks || {})) {
      if (!nodeId) continue;
      const row = tree.tiers.find(t => String(t.tier) === String(tier));
      const node = row?.nodes.find(n => n.id === nodeId) || TALENT_LIBRARY[nodeId] || null;
      out.push({
        skillId,
        skillName: skill?.name || skillId,
        tier: Number(tier),
        nodeId,
        name: node?.name || nodeId,
        desc: node?.desc || '',
        price,
        refusal: purseRefusal(player, price),
      });
    }
  }
  return out.sort((a, b) => a.skillName.localeCompare(b.skillName) || a.tier - b.tier);
}

/** Take one talent off one tier of one skill. */
export function forgetTalent({ player, skillId, tier, prices = null } = {}) {
  const has = player?.skillTalents?.[skillId]?.[tier];
  if (!has) return { ok: false, why: 'There is no talent on that tier.', spent: 0 };
  const price = priceOf('talent', 'one', player?.level || 1, prices);
  const short = purseRefusal(player, price);
  if (short) return { ok: false, why: short, spent: 0 };
  clearTalent(player, skillId, tier);
  return { ok: true, why: null, spent: spend(player, price), name: TALENT_LIBRARY[has]?.name || has };
}

/** Clear every talent on every skill. */
export function forgetAllTalents({ player, prices = null } = {}) {
  const count = countTalents(player);
  if (!count) return { ok: false, why: 'You have not taken any.', spent: 0 };
  const price = priceOf('talent', 'all', player?.level || 1, prices);
  const short = purseRefusal(player, price);
  if (short) return { ok: false, why: short, spent: 0 };
  player.skillTalents = {};
  return { ok: true, why: null, spent: spend(player, price), count };
}

/** How many talents are taken across every skill. */
export function countTalents(player) {
  return Object.values(player?.skillTalents || {})
    .reduce((n, picks) => n + Object.values(picks || {}).filter(Boolean).length, 0);
}

// ---------------------------------------------------------------------------- the whole counter

/**
 * Everything the Unbinder will do for you today, priced, with a reason on anything they will not.
 *
 * One call builds the whole panel — three lists and three "all of it" buttons — so js/talkui.js
 * holds no rules at all and a price can never be quoted in one place and charged in another.
 */
export function retrainMenu({
  player, build = null, cat = null, forest = null, skillState = [], prices = null,
} = {}) {
  const level = player?.level || 1;
  const spells = spellRows({ player, build, cat, prices });
  const perks = perkRows({ player, forest, prices });
  const talents = talentRows({ player, skillState, prices });

  /** The "take the lot" row for one kind: its price, how many it would undo, and why not. */
  const allRow = (kind, count, nothing) => {
    const price = priceOf(kind, 'all', level, prices);
    return {
      price, count,
      refusal: count ? purseRefusal(player, price) : nothing,
    };
  };

  return {
    gold: player?.gold || 0,
    level,
    /** A preset class has no spells to unbind — the panel prints this instead of an empty list. */
    spellsLocked: build?.custom ? null : 'Your six came with the class you chose. Only a class you built yourself can be taken apart.',
    spells,
    spellsAll: allRow('spell', spells.length, 'You have not learned any.'),
    perks,
    perksAll: allRow('perk', spentBy(player), 'You have not spent any.'),
    talents,
    talentsAll: allRow('talent', countTalents(player), 'You have not taken any.'),
  };
}
