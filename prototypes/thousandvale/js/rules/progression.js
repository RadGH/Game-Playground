// Thousandvale — what a character has EARNED rather than been handed (play-test 1, P4).
//
//   "Warlock starts with a bound imp and an orange floaty minion — things should unlock by
//    progression, not by default."
//
// Farhold's `begin()` hands every class its companion (classes.json `pet`, plus `pet.extra`) on the
// first frame. Thousandvale does not: a class companion comes at a level, earlier through a quest
// (`unlocks`), or earlier still through the perk forest's Early Bond notable (flag `earlyBond`).
// Summoning SKILLS keep Farhold's slot ladder (1/3/6/12/18/24), so a level-1 bar holds one skill.
//
// Pure: the numbers come from data/rules/progression.json (engine.progression).

export const COMPANION_DEFAULTS = Object.freeze({ main: 10, extra: 20, earlyBondMain: 1, earlyBondExtra: 12 });

/** The level each companion body comes at for this character (quest unlocks make it 1). */
export function companionLevels(unit, cfg = COMPANION_DEFAULTS) {
  const c = { ...COMPANION_DEFAULTS, ...(cfg || {}) };
  const early = !!unit?.perkFlags?.earlyBond;
  const un = unit?.unlocks || {};
  return {
    main: un.companion ? 1 : early ? c.earlyBondMain : c.main,
    extra: un.companion2 ? 1 : early ? c.earlyBondExtra : c.extra,
  };
}

/**
 * Which class-companion bodies this character is owed right now: `[{ id, count, which }]`, from the
 * class row's `pet` (main) and `pet.extra`. Empty for a class with no companion.
 */
export function companionsDue(unit, classDef, cfg = COMPANION_DEFAULTS) {
  const pet = classDef?.pet;
  if (!pet) return [];
  const lv = companionLevels(unit, cfg);
  const level = unit?.level || 1;
  const out = [];
  if (level >= lv.main) out.push({ id: pet.id, count: pet.count || 1, which: 'main' });
  if (pet.extra && level >= lv.extra) out.push({ id: pet.extra.id, count: pet.extra.count || 1, which: 'extra' });
  return out;
}

/** What the client shows: when the class companion comes, and whether it has. */
export function companionInfo(unit, classDef, cfg = COMPANION_DEFAULTS) {
  const pet = classDef?.pet;
  if (!pet) return null;
  const lv = companionLevels(unit, cfg);
  return {
    main: { id: pet.id, count: pet.count || 1, level: lv.main, has: (unit?.level || 1) >= lv.main },
    extra: pet.extra ? { id: pet.extra.id, count: pet.extra.count || 1, level: lv.extra, has: (unit?.level || 1) >= lv.extra } : null,
    verb: pet.verb || null,
  };
}

/** Unlock keys a quest (or anything else A grants) may set: `rules.unlock(e, key)`. */
export const UNLOCK_KEYS = Object.freeze(['companion', 'companion2']);
