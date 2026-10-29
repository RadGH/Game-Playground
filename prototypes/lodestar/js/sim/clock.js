// The day clock (PLAN M3: the sim owns time of day). PURE. `day.ticks` ticks make one day; the game starts at
// `day.startHour`. daylight is a byte: 20 at night, 255 by day, ramping at dawn (5–7) and dusk (18–20). `offset`
// (hours) is a dev/test shift only (the `dev.hour` command).

export function createClock(cfg) {
  const dayTicks = cfg.ticks, start = cfg.startHour;
  let offset = 0;
  const clock = {
    hourAt(t) { const h = start + offset + (t / dayTicks) * 24; return ((h % 24) + 24) % 24; },
    dayAt(t) { return 1 + Math.floor((start + offset + (t / dayTicks) * 24) / 24); },
    daylightAt(h) {
      const up = h < 5 ? 0 : h < 7 ? (h - 5) / 2 : h < 18 ? 1 : h < 20 ? 1 - (h - 18) / 2 : 0;
      return Math.round(20 + up * 235);
    },
    /** Shift the clock so that it reads `hour` at tick t (dev/test). */
    setHour(t, hour) { offset = (((hour - clock.hourAt(t)) + offset) % 24 + 24) % 24; },
    get offset() { return offset; }, set offset(v) { offset = v; },
    dayTicks,
  };
  return clock;
}
