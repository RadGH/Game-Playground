// Farhold — who holds the ground, and what they think of you.
//
// PURE JavaScript: no Three.js, no DOM. The game, the node tests and the job generator all ask this
// module the same questions and get the same answers.
//
//   import { createStandings, bandOf, deed } from './factions.js';
//   const standings = createStandings(factionData);
//   standings.deed('wardens_reach', 'job_done');    // +6, and -2 to everyone they are at odds with
//   standings.band('wardens_reach').key;            // 'known'
//
// THE ONE IDEA. Standing is the world's memory of you, one number per faction, and helping somebody
// is felt by their enemy. That is what turns twelve factions from a checklist into a set of choices:
// there is no state where everybody likes you, so "who do I work for round here" is a real question.

const RIVAL_SHARE = 1 / 3;   // a rival feels the opposite of a deed, at a third of the size
const FLOOR = -100, CEIL = 100;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Which band a raw standing falls in. Reads the table out of the data file so the numbers and the
 * names live in one place.
 */
export function bandOf(data, value) {
  const bands = data?.bands || [];
  const n = clamp(Math.round(value || 0), FLOOR, CEIL);
  return bands.find(b => n >= b.min && n <= b.max) || bands[Math.floor(bands.length / 2)] || null;
}

/** The faction row, by key. */
export function factionOf(data, key) {
  return (data?.factions || []).find(f => f.key === key) || null;
}

/**
 * How well a faction likes the ground a zone is made of.
 *
 * A zone carries a `danger` word (settled / open country / wild / lawless / hostile — js/zones.js)
 * and a biome family. A faction's `holds` lists both, and the score decides who ends up holding the
 * zone. It is deterministic and needs no placement pass: every zone on every world already knows
 * what it is made of, so every zone already knows who wants it.
 */
export function holdScore(faction, { danger = '', biome = '', level = 1 } = {}) {
  const holds = faction?.holds || {};
  let score = 0;
  // `js/zones.js` writes the danger word capitalised ("Settled"); the data file is lower case. That
  // mismatch quietly made every `danger` test fail, so mine-folk ended up holding farmland.
  const word = String(danger).toLowerCase();
  if ((holds.danger || []).some(d => d.toLowerCase() === word)) score += 2;
  if ((holds.biomes || []).some(b => String(biome).toLowerCase().includes(b))) score += 2;
  score *= holds.weight ?? 1;
  // the nastier the ground, the more the nasty ones want it
  if (faction.hostileAtStart) score += Math.min(2, level / 20);
  return score;
}

/**
 * Who holds this zone. A seeded tie-break keeps two identical zones from both going to the same
 * faction, and `exclude` lets a caller keep one faction out (the Hollowed never hold a settled zone
 * a new character starts in).
 */
export function holderFor(data, zone, seedHash = 0, { exclude = [] } = {}) {
  const list = (data?.factions || []).filter(f => !exclude.includes(f.key));
  if (!list.length) return null;
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    // a stable per-zone jitter, so a world is not four factions repeated
    const jitter = ((seedHash ^ (i * 2654435761)) >>> 0) % 1000 / 1000 * 0.9;
    const score = holdScore(f, zone) + jitter;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return best;
}

/**
 * The standing ledger: one number per faction, and the rule that a deed for one is a deed against
 * their rivals.
 */
export function createStandings(data, saved = null) {
  const values = {};
  for (const f of data?.factions || []) values[f.key] = 0;
  if (saved) for (const [k, v] of Object.entries(saved)) if (k in values) values[k] = clamp(Number(v) || 0, FLOOR, CEIL);

  /** Move one faction directly. Returns what actually changed, after clamping. */
  function add(key, amount, { spread = true } = {}) {
    const faction = factionOf(data, key);
    if (!faction || !amount) return {};
    // The Hollowed cannot be liked. They are not people and there is nobody to negotiate with.
    const want = faction.unlikeable ? Math.min(0, amount) : amount;
    const before = values[key] ?? 0;
    values[key] = clamp(before + want, FLOOR, CEIL);
    const moved = { [key]: values[key] - before };
    if (spread) {
      const share = -want * RIVAL_SHARE;
      for (const rival of faction.rivals || []) {
        if (!(rival in values)) continue;
        Object.assign(moved, add(rival, Math.round(share * 10) / 10, { spread: false }));
      }
    }
    return moved;
  }

  return {
    /** The raw number. */
    get(key) { return values[key] ?? 0; },
    /** Every number, for the save and for the screen. */
    all() { return { ...values }; },
    /** The band row for a faction. */
    band(key) { return bandOf(data, values[key] ?? 0); },
    /** What they charge you, as a multiplier on list price. */
    priceMult(key) { return this.band(key)?.priceMult ?? 1; },
    /** Will they shoot at you on sight? */
    hostile(key) {
      const f = factionOf(data, key);
      if (f?.hostileAtStart && (values[key] ?? 0) < 20) return true;
      return this.band(key)?.key === 'hunted';
    },
    add,
    /** Do a named thing to a faction — the table lives in `data.deeds`. */
    deed(key, name, times = 1) {
      const amount = (data?.deeds || {})[name];
      if (amount == null) return {};
      return add(key, amount * times);
    },
    /** For the save. */
    toJSON() { return { ...values }; },
  };
}

/** Every faction, sorted by how they feel about you — the order the Standing screen wants. */
export function ranked(data, standings) {
  return (data?.factions || [])
    .map(f => ({ ...f, value: standings.get(f.key), band: standings.band(f.key) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
