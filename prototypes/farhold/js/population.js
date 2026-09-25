// Farhold — how many people your holding can hold, and who they are.
//
//   "Once you have established a base and built at least one house, let's start a Population system
//    like warcraft 3. Houses provide increased population, which allows you to recruit NPCs from
//    town (random npcs, not like shops) or from migration events that happen once and awhile but
//    only when you have available population to grow."
//
// Most of this already existed and none of it had a name. `js/colony.js` has citizens, `js/housing.js`
// counts the beds in every `home` structure you have put down, and `rollMigration()` has always
// refused when there are no spare beds. What was missing was the WHOLE POINT of a population system:
// a number on the screen that goes up when you build a house and that tells you what it is for.
//
// So this is deliberately thin. It does not own the citizens and it does not duplicate the beds —
// it reads both and gives the rest of the game one shape to draw and one rule to obey:
//
//   const pop = population({ colony });      // { used, cap, spare, houses, open, line }
//   if (!pop.open) …                          // no room; no recruit, no migrant
//
// The Warcraft rule, plainly: a bed is a population slot, a house is a few beds, and nobody joins
// you with nowhere to sleep. What this adds on top is the FLOOR — a holding with no house at all
// has a cap of zero rather than a cap of "however many bedrolls happen to be lying about", because
// "build at least one house" is where the user drew the line and a bedroll is not a house.

/** A structure counts as a house if it declares `home.beds`. `bedroll` is the one that does not. */
export const HOUSE_MIN_BEDS = 2;

/**
 * The population reading.
 *
 * `houses` counts real houses — a bunkhouse, a cottage, a longhouse — rather than every bed, so
 * "you have not built a house yet" can be said honestly to somebody standing next to two bedrolls.
 */
export function population({ colony = null, housing = null } = {}) {
  const reg = housing || colony?.housing || null;
  const report = reg?.report?.() || null;
  const cap = report ? report.beds : (colony?.base?.beds || 0);
  /**
   * WITH A HOUSING REGISTER, A HOUSE IS A HOUSE. WITHOUT ONE, BEDS ARE ALL THERE IS.
   *
   * js/colony.js keeps a legacy path for a holding set up with `setBase({ beds: n })` and no
   * register at all — that is how every test and every save older than the Civilization Expansion
   * puts people under a roof, and its own `_assignBeds` says so in as many words. There is no
   * concept of a house down there, so insisting on one would refuse every one of them forever.
   * `HOUSE_MIN_BEDS` is the same bar either way: two beds is a building, one is a bedroll.
   */
  const houses = reg
    ? (reg.houses || []).filter(h => (h.beds || 0) >= HOUSE_MIN_BEDS).length
    : (cap >= HOUSE_MIN_BEDS ? 1 : 0);
  const used = colony?.citizens?.length || 0;
  const spare = Math.max(0, cap - used);
  return {
    used, cap, spare, houses,
    /** Is there room for one more person right now? The one rule everything else asks. */
    open: houses > 0 && spare > 0,
    started: houses > 0,
    comfort: report?.meanComfort ?? 0,
    line: houses > 0
      ? `${used} / ${cap}`
      : 'no houses yet',
  };
}

/**
 * Why you cannot take somebody on, in a sentence. A greyed-out button is the one answer a player
 * cannot act on, so every refusal here names the thing to go and build.
 */
export function recruitRefusal(pop, { gold = 0, price = 0 } = {}) {
  if (!pop.started) return 'Nobody will sign on to sleep in the mud. Build a house first — a Bunkhouse is the cheapest.';
  if (pop.spare <= 0) return `Every bed is taken (${pop.used} of ${pop.cap}). Another house makes room.`;
  if (price > gold) return `They want ${price} gold and you have ${gold}.`;
  return null;
}

/** What the HUD and the Town Hall print. Short, because it sits next to a lot of other numbers. */
export function populationText(pop) {
  if (!pop.started) return 'No houses';
  return `${pop.used} / ${pop.cap} people${pop.spare > 0 ? '' : ' — full'}`;
}
