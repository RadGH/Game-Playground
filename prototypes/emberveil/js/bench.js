// The bench (round 21, E38). Pure rules, no DOM: js/game.js calls these on itself, main.js draws the
// Manage Party dialog from what they return, tests/bench.test.js checks every rule.
//
// `state` is anything shaped like the game: { party, bench, companions, benchCompanions, inventory }.
//
// The rules, in plain words:
//   1. The party changes only in a settlement. Away from one, every move answers "only in town".
//   2. The party never holds more than the limit (data/balance.json → partySize.max, 4 by default).
//      A full party can still take somebody off the bench by swapping them for a current member.
//   3. The party never drops to nobody.
//   4. If somebody in the party is on their feet, somebody still has to be after the change: you
//      cannot bench the last hero standing and leave the fallen to walk the road alone.
//   5. Gear stays on the hero who wears it. A benched hero keeps their kit, and the dialog offers
//      "Take their gear", which moves every equipped piece into the bag for the active party to use.
//   6. A pet summoned by a hero's talent (companion.ownerId) goes to the bench with its owner and
//      comes back with them. Pets bought from a kennel belong to the party and stay put. If the
//      companion slots are full when an owner returns, the pet waits on the bench until one frees up.

export const DEFAULT_PARTY_MAX = 4;
export const COMPANION_MAX = 4;

/** The party size limit from data/balance.json (partySize.max), or 4. */
export function partyLimit(balance) {
  const m = Number(balance?.partySize?.max);
  return Number.isInteger(m) && m >= 1 ? m : DEFAULT_PARTY_MAX;
}
const standing = h => !!h && h.alive !== false && (h.hp ?? 1) > 0;
const fail = why => ({ ok: false, why });

/** Would this party line-up break rules 3 or 4? `before` is the line-up it replaces. */
export function lineUpProblem(before, after) {
  if (!after.length) return 'the party cannot be empty — somebody has to walk the road';
  if (before.some(standing) && !after.some(standing)) return 'that would leave nobody in the party on their feet';
  return null;
}

/** Can this party member go to the bench? */
export function canBench(state, id, { inTown = true } = {}) {
  if (!inTown) return fail('the party only changes in a settlement');
  const h = state.party.find(x => x.id === id); if (!h) return fail('not in the party');
  const problem = lineUpProblem(state.party, state.party.filter(x => x !== h));
  return problem ? fail(problem) : { ok: true, hero: h };
}

/** Can this bench hero join? `swapWith` names a party member to send the other way. */
export function canJoin(state, id, { limit = DEFAULT_PARTY_MAX, inTown = true, swapWith = null } = {}) {
  if (!inTown) return fail('the party only changes in a settlement');
  const h = state.bench.find(x => x.id === id); if (!h) return fail('not on the bench');
  if (swapWith == null) {
    if (state.party.length >= limit) return { ok: false, why: `the party is full (${limit}) — pick somebody to swap out`, needsSwap: true };
    return { ok: true, hero: h };
  }
  const out = state.party.find(x => x.id === swapWith); if (!out) return fail('the hero to swap out is not in the party');
  const after = state.party.map(x => x === out ? h : x);
  const problem = lineUpProblem(state.party, after);
  return problem ? fail(problem) : { ok: true, hero: h, out };
}

/** Rule 6, going: the owner's pets leave the companion line. Returns the pets moved. */
function stashPets(state, hero) {
  const pets = (state.companions || []).filter(c => c.ownerId === hero.id);
  if (!pets.length) return [];
  state.companions = state.companions.filter(c => c.ownerId !== hero.id);
  (state.benchCompanions ||= []).push(...pets);
  return pets;
}
/** Rule 6, coming back: the owner's pets rejoin while there is room. Returns the pets restored. */
function restorePets(state, hero) {
  const waiting = (state.benchCompanions || []).filter(c => c.ownerId === hero.id);
  const back = [];
  for (const c of waiting) {
    if ((state.companions || []).length >= COMPANION_MAX) break;
    (state.companions ||= []).push(c); back.push(c);
  }
  state.benchCompanions = (state.benchCompanions || []).filter(c => !back.includes(c));
  return back;
}

/** Send a party member to the bench. Returns { ok, why?, hero, pets }. */
export function benchHero(state, id, opts = {}) {
  const r = canBench(state, id, opts); if (!r.ok) return r;
  state.party = state.party.filter(x => x !== r.hero);
  state.bench.push(r.hero);
  return { ok: true, hero: r.hero, pets: stashPets(state, r.hero) };
}

/** Bring a bench hero into the party, swapping one out if `swapWith` is given. Returns { ok, why?, hero, out, pets, petsBack }. */
export function joinParty(state, id, opts = {}) {
  const r = canJoin(state, id, opts); if (!r.ok) return r;
  state.bench = state.bench.filter(x => x !== r.hero);
  let pets = [];
  if (r.out) {
    const i = state.party.indexOf(r.out);
    state.party.splice(i, 1, r.hero);           // the newcomer takes the same place in the line-up
    state.bench.push(r.out);
    pets = stashPets(state, r.out);
  } else state.party.push(r.hero);
  return { ok: true, hero: r.hero, out: r.out || null, pets, petsBack: restorePets(state, r.hero) };
}

/**
 * Rule 5: move every piece a hero wears into the bag. `unequip(hero, slot)` is rules.js unequip
 * with the loot table bound, so the hero's numbers are recomputed as each piece comes off.
 * Returns the items moved.
 */
export function takeGear(state, hero, unequip) {
  const moved = [];
  for (const slot of Object.keys(hero?.equipment || {})) {
    const it = unequip ? unequip(hero, slot) : (() => { const x = hero.equipment[slot]; delete hero.equipment[slot]; return x; })();
    if (it) moved.push(it);
  }
  (state.inventory ||= []).push(...moved);
  return moved;
}
