// Six needs and a mood. A need is only worked out when somebody looks (settle), in closed form from when it was last
// worked out, so a background person costs nothing between wake-ups and the sums are the same at every detail level.

/** Decay per hour for each need, per person: base x race x traits. Built once at load, never saved. */
export function personRates(p, c) {
  const { needIds } = c, base = c.k.needs.decayPerHour;
  const race = c.raceById[p.race], rates = new Float64Array(needIds.length);
  needIds.forEach((id, i) => {
    let v = base[id] * (race.needScale?.[id] ?? 1);
    for (const tr of p.traits) v *= c.traitById[tr].needScale?.[id] ?? 1;
    rates[i] = v;
  });
  return rates;
}

/** Bring a person's needs up to now. Called before anything reads or changes them. */
export function settle(c, p) {
  const t = c.s.t, dt = t - p.nt;
  if (dt <= 0) return;
  const hours = c.clock.hours(dt), rate = c.rates[p.id];
  const refill = p.act ? c.actionById[p.act.a].refillArr : c.noRefill;
  const n = p.n;
  for (let i = 0; i < n.length; i++) {
    const v = n[i] + (refill[i] - rate[i]) * hours;
    n[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  p.nt = t;
  if (p.moodlets.length) p.moodlets = p.moodlets.filter(m => m.until > t);
  p.mood = moodOf(c, p, n);
}

/** Needs as they stand now, without changing anything: a snapshot must never move the state. */
export function peekNeeds(c, p) {
  const hours = c.clock.hours(Math.max(0, c.s.t - p.nt)), rate = c.rates[p.id];
  const refill = p.act ? c.actionById[p.act.a].refillArr : c.noRefill;
  return p.n.map((v, i) => Math.min(1, Math.max(0, v + (refill[i] - rate[i]) * hours)));
}

import { raceMood } from './racemood.js';

export function moodOf(c, p, n) {
  let sum = 0, low = 1;
  for (let i = 0; i < n.length; i++) { sum += n[i]; if (n[i] < low) low = n[i]; }
  const w = c.k.mood.lowestNeedWeight;
  let mood = (sum / n.length) * (1 - w) + low * w;
  for (const m of p.moodlets) mood += m.value;
  for (const tr of p.traits) mood += c.traitById[tr].moodShift || 0;
  mood += raceMood(c, p);
  return mood < 0 ? 0 : mood > 1 ? 1 : mood;
}

/** Add a passing feeling. Same id refreshes it; past the cap the oldest goes. */
export function addMoodlet(c, p, id, value, hours) {
  p.moodlets = p.moodlets.filter(m => m.id !== id);
  p.moodlets.push({ id, value, until: c.s.t + Math.round(hours * 60 / c.clock.minPerTick) });
  if (p.moodlets.length > c.k.mood.moodletCap) p.moodlets.shift();
}
