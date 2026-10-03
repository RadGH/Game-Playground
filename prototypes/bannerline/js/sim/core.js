// Core phases every mode can put in its tick order (no mode-specific rules here).

/** Fire due timers ({ atTick, kind, args }) through a mode's timer table. */
export function makeRunTimers(table) {
  return function runTimers(ctx) {
    const { state } = ctx;
    while (state.timers.length && state.timers[0].atTick <= state.tick) {
      const t = state.timers.shift();
      const fn = table[t.kind];
      if (!fn) throw new Error(`Unknown timer kind "${t.kind}"`);
      fn(ctx, t.args);
    }
  };
}
