// Crossing nodes: the travel hazards between one place and the next (a ford, a slide, a toll, a gate).
// Pure rules — no DOM, no 3D. The UI (js/main.js) plays the walk across the stage and shows the result;
// everything that changes the game state happens here so it can be tested with node --test.
//
// Data: data/crossings.json. One crossing is { id, name, scenery, intro, choices[] }, and a choice is:
//   needs:  { item: 'rope' | 'a|b|c', supply: { torch: 1 }, flag: 'gate_warrant', fame: 60 }
//           what the party must be carrying. `item` matches by name against the bag and equipped gear
//           (a "|" separated list means any of them). A needed supply is spent on success.
//   check:  { stat: 'STR', dc: 12, traits: [...], traitBonus: 4 }
//           best living hero's stat + d20 against dc + 2 per act. Traits give the listed bonus.
//   cost:   { day: 1, gold: 20, goldPerAct: 22, supply: { ration: -1 } }   paid whatever happens
//   fight:  true — the choice ends in a fight instead of a roll
//   auto:   true — carrying the thing is the whole test; no roll
//   reward: { mult, rare, fameBonus }   scaled by act, returned in a won-fight shape
//   fail:   { damage: 0.15, exhaustion: 1, day: 1, supply: {...}, fight: true }
import { derive, gainXp, refresh, checkBonus } from './rules.js';

// What an attribute is worth on a d20 skill check — one point of bonus per three attribute points —
// comes from rules.js so travel checks and combat can never drift apart. It is re-exported here
// because the crossing UI shows the number. The DCs that go with it live in data/crossings.json
// `difficulty` (the choice's dc, plus `perAct` per act, capped).
export { checkBonus };

/** The knobs, from data/crossings.json's `difficulty` block, with an override for tests. */
export function tuningFor(game, tuning = {}) { return { perAct: 2, cap: 20, rewardPerAct: 0.45, ...(game?.d?.crossings?.difficulty || {}), ...tuning }; }
/** Difficulty for a crossing check: the authored dc plus `perAct` per act, capped. */
export function dcFor(game, base = 12, tuning = {}) { const T = tuningFor(game, tuning); return Math.min(T.cap, Math.round(base + (game.act || 0) * T.perAct)); }
/** The party's best living value for an attribute (equipment counts). */
export function bestStat(game, stat) { const live = game.alive(); if (!live.length) return 0; return Math.max(...live.map(h => { try { return derive(h, game.loot)[stat] ?? h.attrs?.[stat] ?? 8; } catch { return h.attrs?.[stat] ?? 8; } })); }
/** The hero who would make the roll, so the UI knows who to put on the stage. */
export function bestHero(game, stat) { const live = game.alive(); if (!live.length) return null; return live.slice().sort((a, b) => ((derive(b, game.loot)[stat] ?? b.attrs?.[stat] ?? 8) - (derive(a, game.loot)[stat] ?? a.attrs?.[stat] ?? 8)))[0]; }
/** Everyone alive who has one of these speech traits — used by the talk-your-way-past choices. */
export function traitHolders(game, traits = []) { return game.alive().filter(h => (h.speech?.traits || []).some(t => traits.includes(t))); }

/** Something in the bag or worn that matches a name pattern ('rope', or 'lantern|torch|lamp'). */
export function findItem(game, pattern) {
  const re = new RegExp('(' + String(pattern).split('|').map(s => s.trim()).filter(Boolean).join('|') + ')', 'i');
  const worn = game.party.flatMap(h => Object.values(h.equipment || {}));
  return [...(game.inventory || []), ...worn].find(it => it && (re.test(it.name || '') || re.test(it.baseKey || '') || re.test(it.subtype || ''))) || null;
}
/** A crossing can also be opened by a flag the game set earlier ("you already have the warrant"). */
export function hasFlag(game, flag) { return !!(game.flags?.[flag] || game.flags?.['item_' + flag]); }

/**
 * Can the party take this choice, and what does taking it cost? Never throws — a choice the party
 * cannot take comes back with `available: false` and a plain-language reason.
 */
export function choiceState(game, crossing, choice, tuning = {}) {
  const T = tuningFor(game, tuning);
  const n = choice.needs || {}; const missing = [];
  let item = null;
  if (n.item) { item = findItem(game, n.item); if (!item) missing.push(`you are not carrying ${String(n.item).split('|')[0]}`); }
  if (n.supply) for (const [k, want] of Object.entries(n.supply)) if ((game.supplies?.[k] || 0) < want) missing.push(`you need ${want} ${k}`);
  if (n.flag && !hasFlag(game, n.flag)) missing.push('you have nothing that says you may pass');
  if (n.fame != null && (game.fame || 0) < n.fame) missing.push(`your name is not worth ${n.fame} fame yet`);
  const goldCost = (choice.cost?.gold || 0) + (choice.cost?.goldPerAct || 0) * Math.max(1, game.act || 1);
  if (goldCost > (game.gold || 0)) missing.push(`you do not have ${goldCost} gold`);
  const stat = choice.check?.stat || null;
  const dc = choice.check ? dcFor(game, choice.check.dc ?? 12, T) : null;
  const holders = choice.check?.traits ? traitHolders(game, choice.check.traits) : [];
  return {
    id: choice.id, text: choice.text, available: missing.length === 0, why: missing.join('; '),
    stat, dc, goldCost, item, fight: !!choice.fight, days: choice.cost?.day || 0,
    best: stat ? bestStat(game, stat) : null, bonus: stat ? checkBonus(bestStat(game, stat)) : null,
    hero: stat ? bestHero(game, stat) : null,
    traitHolders: holders, traitBonus: holders.length ? (choice.check.traitBonus || 0) : 0,
    odds: stat ? Math.max(0, Math.min(100, Math.round((21 - (dc - checkBonus(bestStat(game, stat)) - (holders.length ? (choice.check.traitBonus || 0) : 0))) / 20 * 100))) : null,
  };
}
/** Every choice on a crossing, annotated. */
export function crossingChoices(game, crossing, tuning = {}) { return (crossing.choices || []).map(c => choiceState(game, crossing, c, tuning)); }

/** A crossing's rewards, scaled by act and by how hard the choice was. Same shape a won fight returns. */
export function crossingReward(game, choice, rng, tuning = {}) {
  const T = tuningFor(game, tuning);
  const act = Math.max(1, game.act || 1); const R = choice.reward || {}; const mult = R.mult ?? 1;
  const scale = (1 + (act - 1) * T.rewardPerAct) * mult;
  const xp = Math.round(40 * scale);
  const gold = Math.round((18 + rng.int(0, 14)) * scale);
  const fame = Math.max(0, Math.round(2 * mult)) + (R.fameBonus || choice.fameBonus || 0);
  const drops = [];
  // a hard crossing can pay out like a small fight: a normal find, and sometimes something rare
  if (mult >= 0.8 && rng() < 0.45 + mult * 0.2) { const it = game.loot.generate(rng.pick(['ring', 'necklace', 'sword', 'light_chest', 'wand', 'bow']), 'magic', 'medium', { rng }); if (it) drops.push(it); }
  if ((R.rare || 0) > 0 && rng() < R.rare) { const it = game.loot.generate(rng.pick(['sword', 'heavy_chest', 'staff', 'necklace']), rng() < 0.3 ? 'legendary' : 'rare', 'high', { rng }); if (it) drops.push(it); }
  return { xp, gold, fame, drops };
}

/**
 * Take one choice at a crossing and apply everything it does.
 *
 * @param {Game} game
 * @param {object} crossing  an entry from data/crossings.json
 * @param {string} choiceId
 * @param {function} rng     game.rng-style (callable, with .int and .pick)
 * @returns {{ ok, blocked, why, choice, roll, best, dc, stat, text, rewards, costs, fight, days, memory }}
 *   `rewards` is { xp, gold, fame, drops } — the same shape victory() returns, so the rewards popup
 *   can show a crossing exactly like a won fight. `fight` is an encounter id the caller should run.
 */
export function resolveCrossing(game, crossing, choiceId, rng = game.rng, tuning = {}) {
  const T = tuningFor(game, tuning);
  const choice = (crossing.choices || []).find(c => c.id === choiceId);
  if (!choice) return { ok: false, blocked: true, why: 'no such choice', choice: null, costs: [], rewards: null };
  const st = choiceState(game, crossing, choice, T);
  if (!st.available) return { ok: false, blocked: true, why: st.why, choice, costs: [], rewards: null };

  const costs = [];
  // ---- what the attempt costs whatever happens
  if (st.goldCost) { game.gold = Math.max(0, game.gold - st.goldCost); costs.push(`−${st.goldCost} gold`); }
  for (const [k, d] of Object.entries(choice.cost?.supply || {})) { game.supplies[k] = Math.max(0, (game.supplies[k] || 0) + d); costs.push(`${d > 0 ? '+' : ''}${d} ${k}`); }
  let days = choice.cost?.day || 0;
  // a supply the choice needs is used up
  for (const [k, want] of Object.entries(choice.needs?.supply || {})) { game.supplies[k] = Math.max(0, (game.supplies[k] || 0) - want); costs.push(`−${want} ${k}`); }

  // ---- did it work?
  let ok = true, roll = null;
  if (choice.fight) ok = true;                                    // the fight itself decides; the caller runs it
  else if (choice.check && !choice.auto) { roll = 1 + rng.int(0, 19); ok = checkBonus(st.best) + st.traitBonus + roll >= st.dc; }

  // ---- consequences of failing
  let fight = null;
  if (!ok) {
    const F = choice.fail || {};
    if (F.damage) for (const h of game.alive()) h.hp = Math.max(1, Math.round(h.hp - h.maxHp * F.damage));
    if (F.exhaustion) { game.exhaustion = (game.exhaustion || 0) + F.exhaustion; costs.push(`exhausted ×${game.exhaustion}`); }
    for (const [k, d] of Object.entries(F.supply || {})) { game.supplies[k] = Math.max(0, (game.supplies[k] || 0) + d); costs.push(`${d} ${k}`); }
    if (F.day) days += F.day;
    if (F.fight) fight = pickCrossingFight(game, rng, crossing);
    if (F.damage) costs.push('the party is hurt');
  } else if (choice.fight) {
    fight = pickCrossingFight(game, rng, crossing);
  }

  // ---- the day cost
  if (days) { game.day += days; game.legsUsed = 0; game.fedToday = false; }

  // ---- rewards, only on a win and only when there is no fight to run first
  const rewards = ok && !fight ? crossingReward(game, choice, rng, T) : null;
  const levelUps = [];
  if (rewards) {
    game.gold += rewards.gold; game.fame = Math.max(0, (game.fame || 0) + rewards.fame);
    for (const it of rewards.drops) { game.inventory.push(it); game.logLoot?.(it); if (['rare', 'legendary'].includes(it.rarity)) game.rareFound++; }
    for (const h of game.party) { if (!h.alive) continue; const ups = gainXp(h, rewards.xp); if (ups) { refresh(h, game.loot); levelUps.push({ hero: h, ups }); } }
    rewards.levelUps = levelUps;
  }
  if (choice.fameBonus && !rewards) game.fame = Math.max(0, (game.fame || 0) + choice.fameBonus);

  // ---- the party remembers it (this is what the journal reads)
  const line = `${crossing.name}: ${ok ? 'crossed' : 'turned back'}${choice.memory ? ' — ' + choice.memory : ''}`;
  const memory = { type: 'travel', participants: game.partyIds(), bindings: { place: { id: game.zoneId } }, details: { crossing: crossing.id, outcome: ok ? 'crossed' : 'failed', note: choice.memory || crossing.name } };
  try { game.remember(memory); } catch { /* memory data is optional in tests */ }
  (game.crossings ||= []).push({ id: crossing.id, day: game.day, zone: game.zoneId, choice: choice.id, ok, roll, dc: st.dc, text: line });
  if (game.crossings.length > 40) game.crossings.shift();

  return {
    ok, blocked: false, why: '', choice, roll, best: st.best, statBonus: checkBonus(st.best), bonus: st.traitBonus, dc: st.dc, stat: st.stat,
    hero: st.hero, text: ok ? choice.success : (choice.failure || 'It does not work.'),
    rewards, levelUps, costs, fight, days, memory, journal: line,
  };
}

/**
 * The fight a crossing falls into. Usually whatever haunts this zone — but a crossing that is a toll
 * post or a manned gate says `enemyFamily: "humanoid"` in data/crossings.json, and then the people
 * who wanted the money are the people you fight. (Before this, refusing to pay a bandit on the Dust
 * Roads could produce four cinder hounds.)
 */
export function pickCrossingFight(game, rng = game.rng, crossing = null) {
  const family = crossing?.enemyFamily || null;
  if (family && game.encountersOfFamily) { const ids = game.encountersOfFamily(family); if (ids.length) return rng.pick(ids); }
  const pool = game.d?.zones?.ZONE_ENCOUNTER_POOLS?.[game.zoneId] || [];
  return pool.length ? rng.pick(pool) : null;
}

/** What a second attempt costs after a failure: a day and a ration. Applied by the caller. */
export const RETRY_COST = { day: 1, supply: { ration: -1 } };
/** Pay the retry cost so the party can have another go at a crossing they failed. */
export function payRetry(game) { game.day += RETRY_COST.day; game.legsUsed = 0; game.fedToday = false; game.supplies.ration = Math.max(0, (game.supplies.ration || 0) - 1); return { day: RETRY_COST.day, ration: 1 }; }
