// The one clock (PLAN rule 1). Time in the sim is a tick count and nothing else; `t` never jumps. Speed is NOT here:
// 2x means the driver (driver.js) calls tick() twice as often, so no sim rule can behave differently at speed.

export function createClock(k) {
  const ticksPerDay = k.ticksPerSecond * 60 * k.realMinutesPerDay;
  const minPerTick = 1440 / ticksPerDay;
  const start = k.startMinute;
  const abs = t => start + t * minPerTick;
  return {
    tps: k.ticksPerSecond, ticksPerDay, minPerTick,
    day: t => Math.floor(abs(t) / 1440),
    minute: t => abs(t) % 1440,
    /** The first tick at or after minute `m` of day `d`. */
    tickAt: (d, m) => Math.ceil((d * 1440 + m - start) / minPerTick),
    /** Game minutes as ticks, never less than one. */
    ticks: minutes => Math.max(1, Math.round(minutes / minPerTick)),
    /** Real seconds as ticks. */
    seconds: sec => Math.round(sec * k.ticksPerSecond),
    hours: ticks => ticks * minPerTick / 60,
  };
}

/** Is minute `m` inside [from, to), where the window may wrap midnight? */
export function inWindow(m, from, to) {
  const a = ((from % 1440) + 1440) % 1440, b = ((to % 1440) + 1440) % 1440;
  return a <= b ? (m >= a && m < b) : (m >= a || m < b);
}

/** The next tick after `t` that lands on minute `m` of the day. */
export function nextClock(clock, t, m) {
  const mm = ((m % 1440) + 1440) % 1440;
  const d = clock.day(t);
  const today = clock.tickAt(d, mm);
  return today > t ? today : clock.tickAt(d + 1, mm);
}
