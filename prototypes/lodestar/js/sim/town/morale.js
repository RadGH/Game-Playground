// Morale (PLAN M7). PURE.
//
// Every home scores five inputs, each 0 or 1 — FOOD (its last meal had food), WATER (and drink), COMMONS (it stands
// inside a Commons' service radius), LIGHT (the coarse light field over it is bright: a lamp, the HQ yard, a fire),
// SAFETY (no enemy within balance.town.dangerR cells) — weighted by `balance.town.morale.weights`, minus
// `smokePenalty` when the smoke over it is thick (`smokeAt`). The base needle is the residents' average; it moves at
// most `rate` a step toward that target, and work speed is low + (high − low) × needle (×0.6 … ×1.2 by default).

export const INPUTS = ['food', 'water', 'commons', 'light', 'safety'];

/** Score of one home, 0–1. `ok` = { food, water, commons, light, safety } booleans; `smoky` boolean. */
export function homeScore(ok, smoky, cfg) {
  const w = cfg.morale.weights;
  let m = 0;
  for (const k of INPUTS) if (ok[k]) m += w[k];
  if (smoky) m -= cfg.smokePenalty;
  return m < 0 ? 0 : m > 1 ? 1 : m;
}

/**
 * The town's target morale and lamps from its homes: [{ residents, ok, smoky }].
 * Returns { target, lamps: { food: share failing, ... , smoke: share under smoke }, people }.
 * With nobody home the target is the data's `start` value.
 */
export function townMorale(homes, cfg) {
  let people = 0, sum = 0;
  const fail = { food: 0, water: 0, commons: 0, light: 0, safety: 0, smoke: 0 };
  for (const h of homes) {
    if (!h.residents) continue;
    people += h.residents;
    sum += h.residents * homeScore(h.ok, h.smoky, cfg);
    for (const k of INPUTS) if (!h.ok[k]) fail[k] += h.residents;
    if (h.smoky) fail.smoke += h.residents;
  }
  const lamps = {};
  for (const k of Object.keys(fail)) lamps[k] = people ? fail[k] / people : 0;
  return { target: people ? sum / people : cfg.morale.start, lamps, people };
}

/** Move the needle toward the target by at most `rate`. */
export function stepNeedle(needle, target, rate) {
  const d = target - needle;
  return d > rate ? needle + rate : d < -rate ? needle - rate : target;
}

/** Work speed multiplier for a needle reading. */
export const moraleFactor = (needle, cfg) => cfg.morale.low + (cfg.morale.high - cfg.morale.low) * needle;
