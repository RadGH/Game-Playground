// Farhold — the muster: a wave defence you ask for, and nothing happens if you lose it.
//
// PURE JavaScript: no DOM, no Three.js. A thin board over js/raid.js and NOT a second wave system.
//
//   import { createMuster } from './muster.js';
//   const muster = createMuster({ data: raidsJson, civics: colonyJson, bestiary });
//   muster.board({ placeId: 'ironmoor', base, level, at: state.elapsed });
//   const quest = muster.start({ placeId: 'ironmoor', tier: 'prowlers', base, level, biome, at, hour });
//
// THE REQUEST, IN FULL:
//
//   "Allow the town center to initiate wave defense minigames that reward loot or resources for
//    victory, or just nothing if defeated besides death penalty if the player dies. No need to
//    penalize for a minigame."
//
// js/raid.js is already this. It is pure, it has four tiers, night and early scaling, a guaranteed
// rare crate, a journal, and a single gate (`canFire`) that nothing can spawn through. So the
// muster is four small edits over there and this board here, and nothing else.
//
// TWO PLACES YOU START ONE, and both are things that already stand on the ground:
//
//   * a town's NOTICE BOARD — every settlement of size 1 and up already has one, and it is a real
//     object you walk up to. The town is paying you to help them run a drill, which is why the
//     spoils are materials out of their own stores rather than reputation.
//   * a MUSTER STONE at your own outpost. The existing Alarm Bell stays what it is — that is the
//     REAL raid, the one that pays standing and can cost you a wall. The stone is the drill. Two
//     objects, two meanings, and the panel says which is which every time.
//
// COOLDOWN IS PER RANK AND PER PLACE. It exists so the muster is a thing you do when you want a
// fight rather than a gold tap you farm, and it is per-rank so clearing rank 4 does not lock out
// rank 1.

import { raidOffer, acceptRaid, beginRaid, loseRaid, raidRewards, notorietyOf } from './raid.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** HEADCOUNT by settlement size, so a town-shaped base is not invented out of nothing. */
export const TOWN_HEADCOUNT = [4, 9, 18, 34, 60, 96];

export function createMuster({ data = null, civics = null, bestiary = null, rng = Math.random, saved = null } = {}) {
  const D = data || {};
  const M = D.muster || civics?.muster || { cooldownHours: {}, leashMetres: 300, leashSeconds: 45, goldMultiplier: 0.6, spoilsRadius: 60 };
  const TIERS = D.tiers || [];

  /** `${placeId}:${tierKey}` -> the elapsed second the last one at that rank ended. */
  const cooled = new Map(Object.entries(saved?.cooled || {}));
  /** The drill on the field, if any. One at a time — a place under attack is not offered another. */
  let quest = saved?.quest || null;
  /** How long you have been outside the leash, in seconds. */
  let strayed = 0;

  const dayLength = civics?.dayLengthSeconds || 900;
  const hoursToSeconds = h => (h || 0) * (dayLength / 24);

  function cooldownLeft(placeId, tierKey, at = 0) {
    const last = cooled.get(`${placeId}:${tierKey}`);
    if (last == null) return 0;
    const span = hoursToSeconds(M.cooldownHours?.[tierKey] ?? 12);
    return Math.max(0, span - (at - last));
  }

  /** "in about four minutes" rather than "241". */
  function waitText(seconds) {
    if (seconds <= 0) return '';
    if (seconds < 90) return 'in under a minute';
    if (seconds < 3600) return `in about ${Math.round(seconds / 60)} minutes`;
    return `in about ${(seconds / 3600).toFixed(1)} hours`;
  }

  /**
   * The four ranks, always all four, each greyed with its reason.
   *
   * §9.3's whole point: the board never hides a rank. "You are not ready for this one yet" and "you
   * did this one an hour ago" are very different sentences and a greyed-out row says neither.
   */
  function board({ placeId = 'here', base = {}, level = 1, at = 0 } = {}) {
    return TIERS.map(t => {
      const wait = cooldownLeft(placeId, t.key, at);
      const deep = (t.levelOffset || 0) > 1 && level < 8;
      return {
        key: t.key, name: t.name, rank: t.rank,
        waves: t.waves,
        level: level + (t.levelOffset || 0),
        gold: (t.reward?.gold || [0, 0]).map(g => Math.round(g * (M.goldMultiplier ?? 0.6))),
        spoils: t.spoils || null,
        crates: t.crates || ['rare'],
        text: t.text,
        ready: wait <= 0 && !deep,
        why: wait > 0 ? `You ran this one recently. Again ${waitText(wait)}.`
          : deep ? 'This one is out of your depth. Come back a few levels from now.'
          : null,
        cooldownLeft: Math.round(wait),
      };
    });
  }

  /**
   * A TOWN-SHAPED BASE, so a walled city musters a harder rank 3 than a hamlet does.
   *
   * `waveSpawns` already scales off `base.defences` and the player's level, so this needs no new
   * arithmetic at all: it only has to describe a settlement in the same four numbers a base is
   * described in. And the town's OWN guards fight, which is what makes a city muster feel different
   * rather than just bigger.
   */
  function baseForTown(node = {}, { plots = 0, guards = 0, walled = false } = {}) {
    const size = clamp(node.size ?? 2, 0, 5);
    return {
      structures: plots || Math.max(6, size * 9),
      defences: guards + (walled ? 6 : 0),
      citizens: TOWN_HEADCOUNT[size] ?? 12,
      throughput: 0,
      waypoint: true,
      gold: 0,
    };
  }

  /**
   * Take a rank off the board and ring it. One call, because a drill you accepted and did not
   * start would just be a raid with extra steps.
   */
  function start({ placeId = 'here', placeName = 'here', tier = null, base = {}, level = 1, biome = 'any', at = 0, hour = 12, heldBy = null } = {}) {
    if (quest && quest.state === 'running') return { ok: false, why: 'One is already on the field.' };
    const row = TIERS.find(t => t.key === tier);
    if (!row) return { ok: false, why: 'No such muster.' };
    const wait = cooldownLeft(placeId, tier, at);
    if (wait > 0) return { ok: false, why: `You ran that one recently. Again ${waitText(wait)}.` };
    const offer = raidOffer({
      base, level, biome,
      enemies: bestiary?.enemies || [], bosses: bestiary?.bosses || [], modifiers: bestiary?.modifiers || [],
      rng, data: D, at, placeName, place: placeId,
      forceTier: tier, drill: true,
      heldBy, // R27 M9 — a drill in warband ground draws that warband (js/raid.js raidersFor)
    });
    if (!offer?.ok) return { ok: false, why: offer?.why || 'Nothing would come.' };
    acceptRaid(offer, { at });
    const begun = beginRaid(offer, { at, hour, data: D });
    if (!begun.ok) return begun;
    quest = offer;
    quest.placeId = placeId;
    strayed = 0;
    return { ok: true, quest, wave: begun.wave };
  }

  /**
   * THE LEASH. You walked away, so it ends.
   *
   * Three hundred metres for forty-five continuous seconds. It is not a punishment and it is not a
   * fail state with teeth — a drill that ends because you left ends exactly the way a drill that
   * ends because you died does, which is to say with nothing taken.
   */
  function tickLeash(dt, { x = 0, z = 0, spot = null } = {}) {
    if (!quest || quest.state !== 'running' || !spot) { strayed = 0; return null; }
    const away = Math.hypot(x - spot.x, z - spot.z);
    if (away <= (M.leashMetres ?? 300)) { strayed = 0; return null; }
    strayed += dt;
    if (strayed < (M.leashSeconds ?? 45)) {
      return { warn: true, seconds: Math.round((M.leashSeconds ?? 45) - strayed), metres: Math.round(away) };
    }
    return { over: true, ...lost({ at: 0 }) };
  }

  /** It did not hold. Nothing is broken and nothing is missing. */
  function lost({ at = 0 } = {}) {
    if (!quest) return { ok: false };
    const out = loseRaid(quest, { base: {}, materials: 0, data: D });
    cooled.set(`${quest.placeId || 'here'}:${quest.tierKey}`, at);
    const done = quest;
    quest = null;
    strayed = 0;
    return { ...out, quest: done };
  }

  /** It held. Crates, gold and a pile of materials. */
  function won({ at = 0 } = {}) {
    if (!quest) return { ok: false };
    const prize = raidRewards(quest, { rng, data: D });
    cooled.set(`${quest.placeId || 'here'}:${quest.tierKey}`, at);
    const done = quest;
    quest = null;
    strayed = 0;
    return { ok: true, prize, quest: done, spoilsRadius: M.spoilsRadius ?? 60 };
  }

  return {
    board, start, lost, won, tickLeash, cooldownLeft, baseForTown, waitText,
    get quest() { return quest; },
    get leashMetres() { return M.leashMetres ?? 300; },
    notoriety: base => notorietyOf(base, D),
    toJSON() { return { v: 1, cooled: Object.fromEntries(cooled), quest }; },
    loadJSON(json) {
      cooled.clear();
      for (const [k, v] of Object.entries(json?.cooled || {})) cooled.set(k, v);
      quest = json?.quest || null;
      return cooled.size;
    },
  };
}
