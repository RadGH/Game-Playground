// TOWN BARKS, one at a time (World stream, round 11 — live #52: "When entering a town square, lots of NPCs talk all at the
// same time … Lorr Draskar: Have you seen my goat? / Tavi Nesskaru: Have you seen my goat? / Maeru Esskar: Have you seen my
// goat?"). Every town folk member barked on its own 90 s clock the moment a player came within 6 m, so walking into a
// square full of them fired them all in the same tick, from the same small pool.
//
// One gate per ROOM decides whether a bark may go out now and which line it may use:
//   * one bark at a time: at least GAP_MS since the last one in this room;
//   * at most BURST_MAX in any BURST_MS;
//   * never the same line twice in a room within REPEAT_MS — the line is picked from the pool minus the ones said lately,
//     and when every line of the pool was said lately, the NPC says nothing this time.
// Pure: no clocks or dice of its own (the caller passes `now` and `rng`).
//
//   const gate = createBarkGate()           // one per room
//   const text = gate.pick(pool, now, rng)  // the line to say, or null (stay quiet)

export const BARK_RULES = Object.freeze({ GAP_MS: 4000, BURST_MS: 20000, BURST_MAX: 3, REPEAT_MS: 120000 });

export function createBarkGate(rules = BARK_RULES) {
  const R = { ...BARK_RULES, ...rules };
  const said = new Map();        // line -> when it was last said in this room
  const times = [];              // when the recent barks went out (BURST_MS window)
  return {
    /** A line from `pool` to say at `now`, or null when the room has had enough barking (or every line was said lately). */
    pick(pool, now, rng = Math.random) {
      if (!Array.isArray(pool) || !pool.length) return null;
      while (times.length && now - times[0] >= R.BURST_MS) times.shift();
      if (times.length && now - times[times.length - 1] < R.GAP_MS) return null;
      if (times.length >= R.BURST_MAX) return null;
      for (const [line, t] of said) if (now - t >= R.REPEAT_MS) said.delete(line);
      const fresh = pool.filter(line => typeof line === 'string' && line && !said.has(line));
      if (!fresh.length) return null;
      const line = fresh[Math.min(fresh.length - 1, Math.floor(rng() * fresh.length))];
      said.set(line, now); times.push(now);
      return line;
    },
    get recent() { return [...said.keys()]; },
  };
}
