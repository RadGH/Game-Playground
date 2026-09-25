// Farhold — how often the world is allowed to talk, and what it is allowed to say.
//
//   "There are events that happen very frequently in the chat like 'something out there has your
//    measure and …'. They happen too often, and they aren't represented on the minimap or in game
//    very well. Can you have a redesign agent plan out how to make these events more impactful,
//    clearly visible, and less generic?"
//
// Two faults, and they are different faults.
//
// FREQUENCY. Seven separate places called `hud.log` with an ambient line and none of them knew
// about the other six. Set-piece encounters alone rolled every 26 seconds at 55%, which is a line
// every 47 seconds — about 76 an hour into a log that holds twelve lines, so the ambient layer
// rewrote the whole visible log every nine and a half minutes, pushing out the hit, heal, level and
// loot lines the player actually needs. This module is the one choke point: everything ambient asks
// `offer()` first, and `offer()` says no most of the time.
//
// GENERICNESS. Of the 22 ambient strings in data/encounters.json and data/events.json, 22 named
// nothing at all — not a creature, not a faction, not a place. "A warband is coming up the road"
// names no warband and no road. `bind()` below fills `{tokens}` from things that genuinely exist
// right now and REFUSES the line when it cannot, which is the same rule js/jobgen.js already lives
// by: nothing is invented, so nothing can be wrong.
//
// Pure JavaScript: no DOM, no Three.js, so the node tests drive the same code the game does.
//
//   const ambient = createAmbient();
//   ambient.tick(dt, { fighting, inTown, inDungeon });
//   const line = ambient.offer({ id, tier, text, at, kind, ttl });
//   if (line) hud.log(line.text, line.tone);

/**
 * The budget.
 *
 * Read plainly: at most two ambient lines a minute, never two flavour lines inside twenty seconds,
 * and a zone event costs so much that it cannot happen twice in two minutes however much the world
 * wants it to.
 */
export const PURSE = {
  perMinute: 2.0,
  cap: 4.0,
  cost: { flavour: 1, activity: 2, zone: 4 },
  /** Seconds of silence owed after each, so two lines never land together. */
  quietAfter: { flavour: 20, activity: 8, zone: 0 },
};

/**
 * Things that are never throttled, because they are consequences of what the player did rather than
 * chatter: the pay-off line of an event they played, a meteor (which is already a thirty-second
 * warning and a marker), and a zone changing hands. Combat, loot and quest lines never came through
 * here at all.
 */
export const FREE_TIERS = new Set(['payoff']);

/**
 * WHAT HAS ALREADY BEEN SAID.
 *
 * Borrowed from `lingo/js/lingo.js` — the one rule worth copying verbatim is the cap: the window is
 * `min(size, poolSize - 1)`, so it can NEVER empty the pool. With eleven encounter announces and a
 * window of ten you see all eleven before you see any of them twice, and the eleventh is still
 * reachable. A window that can empty its own pool is a deadlock, and that is the shape of bug that
 * makes a system quietly stop working months later.
 */
export class SaidBook {
  constructor(size = 24) {
    this.size = size;
    this.hist = new Map();
  }

  /** The ids that are off the table for this pool right now. Never all of them. */
  window(pool, poolSize) {
    const h = this.hist.get(pool) || [];
    const n = Math.max(0, Math.min(this.size, (poolSize || 0) - 1));
    return new Set(n ? h.slice(-n) : []);
  }

  mark(pool, id) {
    const h = this.hist.get(pool) || [];
    h.push(id);
    if (h.length > this.size * 2) h.splice(0, h.length - this.size);
    this.hist.set(pool, h);
    return h;
  }

  /** Would this one be a repeat, out of a pool this big? */
  stale(pool, id, poolSize) { return this.window(pool, poolSize).has(id); }

  toJSON() { return { size: this.size, hist: [...this.hist.entries()] }; }
  static fromJSON(d) {
    const b = new SaidBook(d?.size ?? 24);
    if (d?.hist) b.hist = new Map(d.hist);
    return b;
  }
}

/**
 * Fill `{token}` holes from things that exist right now.
 *
 * Returns null when any token cannot be filled — a line that says "{beast} has taken {place}" with
 * no beast and no place is worse than no line at all, and printing "undefined has taken undefined"
 * is how the whole round's worth of bugs started. Refusing is always correct: another source will
 * be along, and the purse would rather be underspent than spent on nonsense.
 */
export function bind(text, ctx = {}) {
  if (!text) return null;
  let missing = false;
  const out = String(text).replace(/\{([\w.]+)\}/g, (whole, token) => {
    const value = token.split('.').reduce((o, k) => (o == null ? o : o[k]), ctx);
    if (value == null || value === '') { missing = true; return whole; }
    return String(value);
  });
  return missing ? null : out;
}

/** North-east and so on, the same eight the minimap rim arrows use. */
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassTo(dx, dz) {
  // the world's +z is south on the map, so "north" is -z
  const a = Math.atan2(dx, -dz);
  const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return COMPASS[i];
}

export function createAmbient({ purse = PURSE, said = new SaidBook(), now = () => 0 } = {}) {
  let points = purse.cap;          // a run opens with something to spend, or the first minute is mute
  let quietUntil = 0;
  /** An exact sentence never appears twice in a run. Keyed by id and where it happened. */
  const everSaid = new Set();
  let spoken = 0;
  let refused = 0;

  return {
    get points() { return points; },
    get quietUntil() { return quietUntil; },
    said,
    /** For the debug screen: how much of what the world wanted to say actually got through. */
    stats: () => ({ spoken, refused, points: Number(points.toFixed(2)) }),

    /**
     * Earn. Nothing ambient during a fight or underground, ever — a fight has its own noise and a
     * dungeon is not a place where the countryside has news.
     */
    tick(dt, { fighting = false, inTown = false, inDungeon = false } = {}) {
      if (fighting || inDungeon) return points;
      const rate = inTown ? 0.6 : 1;
      points = Math.min(purse.cap, points + rate * purse.perMinute * dt / 60);
      return points;
    },

    /**
     * Something wants to speak.
     *
     * Returns `{ text, tone }` if it may, or null. `id` is what the no-repeat window remembers,
     * `pool` groups ids that compete with each other, `at` is what makes it a pin rather than a
     * sentence, and `ctx` fills the `{tokens}` in the text.
     */
    offer(ev = {}) {
      const t = now();
      const tier = ev.tier || 'flavour';
      const text = ev.ctx ? bind(ev.text, ev.ctx) : ev.text;
      // an unbindable line is refused before it costs anything — see `bind`
      if (!text) { refused++; return null; }

      if (!FREE_TIERS.has(tier)) {
        const cost = purse.cost[tier] ?? 1;
        if (points < cost) { refused++; return null; }
        if (t < quietUntil) { refused++; return null; }
        const key = `${ev.id}:${ev.zoneId ?? ''}`;
        if (everSaid.has(key)) { refused++; return null; }
        if (ev.pool && said.stale(ev.pool, ev.id, ev.poolSize)) { refused++; return null; }
        points -= cost;
        quietUntil = t + (purse.quietAfter[tier] ?? 0);
        everSaid.add(key);
        if (ev.pool) said.mark(ev.pool, ev.id);
      }
      spoken++;
      return { text, tone: ev.tone || (tier === 'zone' ? 'bad' : ''), tier, at: ev.at || null };
    },

    /** Walking into a fresh run, or loading one. */
    reset() { points = purse.cap; quietUntil = 0; everSaid.clear(); spoken = 0; refused = 0; },
  };
}
