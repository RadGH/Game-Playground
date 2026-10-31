// One small mood rule per race (roast: "keep as small moods, not a ninth bar"). data/social.json has the rows. It feeds the same mood number as everything
// else, in closed form, so it costs nothing and is the same at every detail level. `p.rl` is the tick the race's want was last met (never set = as long ago as the start).
//   since  met by doing one of `on`        plan  the same, or a date in the book     floor  which storey home is     room  how full home is     odd  `on` only counts outside mealtimes
const inMeal = (r, m) => r.meals.some(([a, b]) => m >= a && m < b);

function bySince(c, p, r) {
  const hours = c.clock.hours(c.s.t - (p.rl ?? 0));
  if (hours <= r.fresh) return r.plus;
  if (hours >= r.stale) return -r.minus;
  const k = (hours - r.fresh) / (r.stale - r.fresh);
  return r.plus + (-r.minus - r.plus) * k;
}

export function raceMood(c, p) {
  const r = c.d.social.raceMoods[p.race]; if (!r) return 0;
  switch (r.rule) {
    case 'plan': return c.booked?.has(p.id) ? r.plus : bySince(c, p, r);
    case 'floor': { const lv = c.places[p.home].spotLv ?? 0; return lv === 0 ? r.plus : -r.minus * Math.min(1, lv / 2); }
    case 'room': { const n = c.s.households[p.household].members.length; return n <= r.roomy ? r.plus : n >= r.crowded ? -r.minus : 0; }
    default: return bySince(c, p, r);
  }
}

/** Something happened that might be what this race wants: an action id, or `row`, `found`, `mentioned`, `wedding`. */
export function raceTouch(c, p, what) {
  const r = c.d.social.raceMoods[p.race];
  if (!r?.on?.includes(what)) return;
  if (r.rule === 'odd' && inMeal(r, c.clock.minute(c.s.t))) return;
  p.rl = c.s.t;
}
/** A row is a row, except to an orc, for whom it is the best part of the week. */
export const rowMood = (c, p, v) => (c.d.social.raceMoods[p.race]?.on?.includes('row') ? Math.abs(v) : v);
