// Thousandvale — ANGLING rules (play-test 5, T25). Pure: no files, no DOM, no clock, no Math.random.
// Every roll takes `rng` (a function returning 0..1 — a room stream from js/rules/rng.js).
//
//   const F = createFishing(numbers, content);
//     numbers = data/rules/fishing.json (stream C: every number of the loop)
//     content = data/provinces/angling.json (stream E: fish, junk, legends, pullBack, crates, recipes,
//               tools, bait, skill.ranks) — may be null or partial; then only junk bites and nothing throws.
//
// The loop the server runs:  canFish -> wait -> (bite, biteMs to answer) -> roll -> tug -> lands(tug, score)
//                            -> item(catch) + xp(catch, {first, best}) + gain(state, xp).
//
// "skill" everywhere is the angling LEVEL, 1..100 (a fish's own `skill` in E's file is the level it needs;
// a level-1 newcomer catches every `skill: 0` and `skill: 1` fish).
//
// Choices made here (so nobody has to guess):
//   * Time of day: a fish with time 'any' always bites; otherwise it bites at its own time — and DAY fish
//     also bite at dawn and dusk (those are the edges of the day; it keeps dawn/dusk tables from being thin).
//     Night brings only night + any. A LEGEND is strict: its own time or 'any', nothing else.
//   * A zone offers a fish when the zone's level (a number, or a [lo, hi] band) overlaps the fish's `bands`.
//   * `pool: true` fish come only out of a pool. A pool of tier T uses rarity table `pool<T>`.
//   * roll() never returns a fish, legend or pool the angler lacks the level for. With nothing eligible it is junk.
//   * Junk, a sunken crate and a monster come straight in: tug() is null for junk and monsters; a crate
//     gets the easy (common) tug with a heavy heft.

const RARITIES = ['common', 'uncommon', 'rare', 'epic'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, d) => (Number.isFinite(v) ? v : d);
const list = v => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** Does `time` (now) suit a fish whose own time is `want`? */
export function timeSuits(want, time = 'day') {
  if (!want || want === 'any') return true;
  if (want === time) return true;
  return want === 'day' && (time === 'dawn' || time === 'dusk');
}
/** Does the zone's level / band overlap a [lo, hi] band? */
export function bandSuits(bands, band) {
  if (!Array.isArray(bands) || bands.length < 2 || band == null) return true;
  const [lo, hi] = Array.isArray(band) ? band : [band, band];
  return lo <= bands[1] && hi >= bands[0];
}

function pickWeighted(rows, w, rng) {
  let sum = 0;
  for (const r of rows) sum += Math.max(0, w(r));
  if (!(sum > 0)) return null;
  let x = rng() * sum;
  for (const r of rows) { x -= Math.max(0, w(r)); if (x <= 0) return r; }
  return rows[rows.length - 1];
}

export function createFishing(numbers = {}, content = null) {
  const N = numbers || {};
  const C = content || {};
  const fish = list(C.fish), junk = list(C.junk), legends = list(C.legends), pullBack = list(C.pullBack);
  const tools = list(C.tools), baits = list(C.bait), ranks = list(C.skill?.ranks);
  const byId = new Map();
  for (const f of fish) if (f?.id) byId.set(f.id, f);
  for (const l of legends) if (l?.id) byId.set(l.id, { ...l, legend: true, rarity: 'epic' });
  const junkById = new Map(junk.filter(j => j?.id).map(j => [j.id, j]));
  const MAX = num(N.level?.max, 100);
  const skillOf = s => clamp(Math.floor(num(s, 1)), 1, MAX);
  const t100 = s => (skillOf(s) - 1) / Math.max(1, MAX - 1);
  const rodOf = rod => (rod && typeof rod === 'object' ? rod : tools.find(t => t.id === rod) || null);
  const baitOf = b => (b && typeof b === 'object' ? (b.effect || b) : (baits.find(x => x.id === b)?.effect || null));
  const tierOf = pool => (pool ? clamp(Math.floor(num(typeof pool === 'object' ? pool.tier : pool, 1)), 1, 3) : 0);

  // ---------------------------------------------------------------- level
  /** xp to go from `level` to level + 1 (0 at the cap). */
  const span = level => (level >= MAX ? 0 : Math.round(num(N.level?.a, 12) + num(N.level?.b, 6) * level + num(N.level?.c, 0.35) * level * level));
  const THRESH = [0, 0];                       // THRESH[L] = total xp at which level L starts
  for (let L = 1; L < MAX; L++) THRESH[L + 1] = THRESH[L] + span(L);
  /** The level a total xp is worth. */
  function levelOf(xp) {
    const x = Math.max(0, num(xp, 0));
    let L = 1;
    while (L < MAX && x >= THRESH[L + 1]) L++;
    return L;
  }
  /** TOTAL xp at which `level` + 1 starts (null at the cap). */
  const next = level => (skillOf(level) >= MAX ? null : THRESH[skillOf(level) + 1]);
  /** Add xp. `state` = { xp } (total). Returns { level, xp, next, into, span, up } — `up` = levels gained. */
  function gain(state, add = 0) {
    const before = levelOf(state?.xp);
    const xp = Math.min(THRESH[MAX], Math.max(0, num(state?.xp, 0)) + Math.max(0, Math.round(num(add, 0))));
    const level = levelOf(xp);
    return { level, xp, next: next(level), into: xp - THRESH[level], span: span(level), up: level - before };
  }
  /** Rank name for a level (E's skill.ranks), or null. */
  function rank(level) {
    let name = null;
    for (const r of ranks) if (skillOf(level) >= num(r.from, 0)) name = r.name;
    return name;
  }

  // ---------------------------------------------------------------- pools, gates
  function pool(tier) {
    const p = N.pools?.[tierOf(tier || 1)] || {};
    return { tier: tierOf(tier || 1), minSkill: num(p.minSkill, 1), catches: Array.isArray(p.catches) ? [...p.catches] : [4, 6], rareBoost: num(p.rareBoost, 1) };
  }
  /** How many catches a new pool holds. */
  const poolCatches = (tier, rng) => { const [lo, hi] = pool(tier).catches; return lo + Math.floor(rng() * (hi - lo + 1)); };
  /** May this angler fish here? `rod` = id or tool row (required), `pool` = tier or { tier } or null. */
  function canFish({ skill = 1, pool: p = null, rod = null } = {}) {
    const r = rodOf(rod);
    if (!r) return { ok: false, why: 'noRod', text: 'You need a fishing rod.' };
    const s = skillOf(skill);
    if (num(r.minSkill, 0) > s) return { ok: false, why: 'skill', need: r.minSkill, text: `${r.name || 'That rod'} needs angling ${r.minSkill}.` };
    if (p) { const g = pool(tierOf(p)); if (g.minSkill > s) return { ok: false, why: 'skill', need: g.minSkill, text: `This pool needs angling ${g.minSkill}.` }; }
    return { ok: true };
  }

  // ---------------------------------------------------------------- the wait and the bite
  /** Seconds from the bobber landing to the bite, always inside wait.min..max. */
  function wait(rng, { bait = null, pool: p = null, rod = null } = {}) {
    const lo = num(N.wait?.min, 2), hi = num(N.wait?.max, 9);
    let k = 1 + num(baitOf(bait)?.wait, 0) + num(rodOf(rod)?.bonus?.wait, 0);
    if (p) k *= num(N.wait?.poolMult, 0.8);
    return clamp(lerp(lo, hi, rng()) * Math.max(0.2, k), lo, hi);
  }
  /** The window to answer a bite, ms. */
  const biteMs = skill => Math.round(lerp(num(N.bite?.at0, 1400), num(N.bite?.at100, 1700), t100(skill)));

  // ---------------------------------------------------------------- what can bite
  /** Every fish that can bite here for this angler (pool-only fish only with `pool`). */
  function listFor({ water = null, band = null, time = 'day', skill = 1, pool: p = null } = {}) {
    const s = skillOf(skill);
    const pick = b => fish.filter(f => f && f.id
      && (!water || list(f.water).includes(water))
      && bandSuits(f.bands, b) && timeSuits(f.time, time)
      && num(f.skill, 0) <= s && (!f.pool || !!p));
    const got = pick(band);
    if (got.length || band == null) return got;
    // owner feedback 7: water in a zone ABOVE every species' band (the fish list stops at level 10 today) still holds
    // fish — the ones of the highest band this water has — instead of nothing but weed. Their price follows the zone.
    const top = Math.max(0, ...fish.filter(f => f && (!water || list(f.water).includes(water))).map(f => num((f.bands || [])[1], 0)));
    const lvl = Array.isArray(band) ? num(band[0], 1) : num(band, 1);
    return top > 0 && lvl > top ? pick(top) : got;
  }
  function legendFor({ water, time = 'day', skill = 1, zone = null, caught = null }) {
    if (!zone) return null;
    const s = skillOf(skill);
    const has = id => (caught instanceof Set ? caught.has(id) : Array.isArray(caught) ? caught.includes(id) : false);
    return legends.find(l => l && l.zone === zone && (!l.water || !water || l.water === water)
      && (!l.time || l.time === 'any' || l.time === time) && num(l.skill, 0) <= s && !has(l.id)) || null;
  }
  function rarityWeights(skill, p, bait) {
    const tier = tierOf(p);
    const base = N.rarity?.[tier ? `pool${tier}` : 'open'] || N.rarity?.open || { common: 70, uncommon: 24, rare: 5, epic: 1 };
    const shift = N.rarity?.skillShift || {};
    const lure = 1 + num(baitOf(bait)?.rarity, 0);
    const boost = tier ? pool(tier).rareBoost : 1;
    const out = {};
    for (const r of RARITIES) {
      let w = num(base[r], 0);
      if (shift[r]) w *= 1 + skillOf(skill) / shift[r];
      if (r !== 'common') w *= lure;
      if (r === 'rare' || r === 'epic') w *= boost;
      out[r] = w;
    }
    return out;
  }
  function sizeOf(f, skill, rng) {
    const [lo, hi] = Array.isArray(f.size) && f.size.length >= 2 ? f.size : [20, 40];
    const k = lerp(num(N.size?.kAt0, 1.8), num(N.size?.kAt100, 1.2), t100(skill));
    const frac = Math.pow(rng(), k);
    return { size: Math.round(lerp(lo, hi, frac)), frac };
  }
  /**
   * Owner feedback 7 (V2): what a catch is WORTH. E's `price` on a species is its worth relative to other fish; the
   * numbers that turn it into gold are C's (`value`): a rarity factor (commons little, the prized few a lot), one
   * overall factor, and a rise with the level of the water fished (`band`), so an hour's fishing keeps pace with an
   * hour's questing at every level. Applied HERE and nowhere else: `item.price` is final.
   */
  const bandOf = b => Math.max(1, Math.round(Array.isArray(b) ? num(b[0], 1) : num(b, 1)));
  const bandK = band => 1 + num(N.value?.perBand, 0) * (bandOf(band) - 1);
  const priceOf = (base, frac, rarity = 'common', band = 1) => (base > 0
    ? Math.max(1, Math.round(base * (num(N.size?.priceMin, 0.7) + num(N.size?.priceSpan, 0.8) * frac) * num(N.value?.rarity?.[rarity], 1) * num(N.value?.mult, 1) * bandK(band)))
    : 0);

  /**
   * One catch. Returns
   *   { kind: 'fish'|'junk'|'crate'|'legend'|'monster', id, name, desc, rarity, size (cm, fish/legend), price,
   *     skill (the fish's own requirement), seed, say?, crate? (E's crate spec), monster? { type }, title?, trophy? }
   */
  function roll({ water = 'river', band = 1, time = 'day', skill = 1, zone = null, pool: p = null, rod = null, bait = null, caught = null, rng } = {}) {
    if (typeof rng !== 'function') throw new Error('fishing.roll: rng is required');
    void rod;
    const seed = Math.floor(rng() * 2147483647);
    const K = N.kinds || {};
    const x = rng();
    let edge = 0;
    // something pulls back
    const beasts = pullBack.filter(b => b && b.type && (!b.water || b.water === water) && bandSuits(b.bands, band));
    edge += beasts.length ? num(K.monster, 0.03) : 0;
    if (x < edge) {
      const b = beasts[Math.floor(rng() * beasts.length) % beasts.length];
      return { kind: 'monster', id: b.type, name: null, rarity: null, price: 0, seed, say: b.say || 'Something pulls back.', monster: { type: b.type } };
    }
    // a sunken crate (E's chance and crate spec)
    if (C.crates) {
      edge += num(C.crates.chance, num(K.crate, 0.04));
      if (x < edge) return { kind: 'crate', id: 'sunken_crate', name: 'Sunken Crate', rarity: 'uncommon', price: 0, seed, say: C.crates.say || 'A sunken crate!', crate: { ...(C.crates.crate || { slot: 'any', min: 'uncommon' }) } };
    }
    // the zone's legend
    const lg = legendFor({ water, time, skill, zone, caught });
    if (lg) {
      edge += num(p ? K.legend?.pool : K.legend?.open, p ? 0.04 : 0.012);
      if (x < edge) {
        const sz = sizeOf({ size: lg.size || K.legend?.size || [90, 160] }, skill, rng);
        return { kind: 'legend', id: lg.id, name: lg.name, desc: lg.desc || '', rarity: 'epic', size: sz.size, price: Math.round(num(lg.price, num(K.legend?.price, 120)) * bandK(band)), skill: num(lg.skill, 0), seed, legend: true, title: lg.title || null, trophy: lg.trophy || null, zone: lg.zone };
      }
    }
    // junk (less with skill, less in a pool, less on bread paste)
    const here = listFor({ water, band, time, skill, pool: p });
    let junkP = lerp(num(K.junk?.at0, 0.18), num(K.junk?.at100, 0.05), t100(skill));
    if (p) junkP *= num(K.junk?.poolMult, 0.5);
    junkP *= Math.max(0, 1 + num(baitOf(bait)?.junk, 0));
    edge += junk.length ? junkP : 0;
    if (x < edge || !here.length) {
      const j = junk.length ? junk[Math.floor(rng() * junk.length) % junk.length] : { id: 'weed', name: 'Clump of Weed', desc: 'Wet, green and not a fish.', price: 0 };
      return { kind: 'junk', id: j.id, name: j.name, desc: j.desc || '', rarity: 'common', price: num(j.price, 0), seed };
    }
    // a fish: a rarity that something here has, then one fish of it
    const W = rarityWeights(skill, p, bait);
    const present = RARITIES.filter(r => here.some(f => (f.rarity || 'common') === r));
    const rar = pickWeighted(present, r => W[r], rng) || present[0];
    const of = here.filter(f => (f.rarity || 'common') === rar);
    const f = of[Math.floor(rng() * of.length) % of.length];
    const sz = sizeOf(f, skill, rng);
    return { kind: 'fish', id: f.id, name: f.name, desc: f.desc || '', rarity: rar, size: sz.size, price: priceOf(num(f.price, 0), sz.frac, rar, band), skill: num(f.skill, 0), seed };
  }

  // ---------------------------------------------------------------- the tug
  /** The tension game for a catch, or null when it comes straight in (junk, a monster). */
  function tug(c, skill = 1, rod = null) {
    if (!c || c.kind === 'junk' || c.kind === 'monster') return null;
    const T = N.tug || {};
    const key = c.kind === 'legend' ? 'legend' : c.kind === 'crate' ? 'common' : (c.rarity || 'common');
    const row = T[key] || T.common || { ms: 3000, band: 0.4, need: 0.5, pull: 0.25, speed: 0.8, jitter: 0.15 };
    const wide = (1 + num(T.bandPerSkill, 0.25) * t100(skill)) * (1 + num(rodOf(rod)?.bonus?.band, 0));
    const size = num(c.size, 0);
    const heft = c.kind === 'crate' ? 'heavy' : size >= num(N.heft?.huge, 90) ? 'huge' : size >= num(N.heft?.heavy, 40) ? 'heavy' : 'light';
    return {
      ms: row.ms, band: +Math.min(num(T.bandMax, 0.5), row.band * wide).toFixed(3), need: row.need,
      speed: row.speed, pull: row.pull, jitter: row.jitter, seed: c.seed ?? 0, heft, rarity: key,
    };
  }
  /** Did it land? `score` = the share of the tug the marker stayed in the band (0..1). No tug = it lands. */
  const lands = (t, score) => !t || num(score, 0) >= t.need;

  // ---------------------------------------------------------------- xp
  /** Experience for a catch (landed). `first` = a new species for this angler, `best` = a personal best size. */
  function xp(c, { first = false, best = false } = {}) {
    if (!c) return 0;
    const X = N.xp || {};
    const key = c.kind === 'fish' ? (c.rarity || 'common') : c.kind;
    const base = num(X[key], 0);
    if (c.kind !== 'fish' && c.kind !== 'legend') return Math.round(base);
    return Math.round(base + num(X.perFishSkill, 0) * num(c.skill, 0) + (first ? base * num(X.firstMult, 0.6) : 0) + (best && !first ? num(X.best, 3) : 0));
  }

  // ---------------------------------------------------------------- items and cooking
  /** The bag item for a catch (null for a monster; a crate returns { kind:'crate', crate } for A's makeCrate). */
  function item(c) {
    if (!c || c.kind === 'monster') return null;
    if (c.kind === 'crate') return { id: 'crate', kind: 'crate', type: 'crate', name: c.name, crate: { ...(c.crate || {}) } };
    if (c.kind === 'junk') return { id: c.id, kind: 'junk', type: 'junk', name: c.name, desc: c.desc || '', rarity: 'common', price: num(c.price, 0) };
    const it = { id: c.id, kind: 'fish', type: 'fish', name: c.name, desc: c.desc || '', rarity: c.rarity || 'common', size: c.size, price: num(c.price, 0), species: c.id };
    if (c.kind === 'legend') { it.legend = true; it.trophy = c.trophy || null; it.title = c.title || null; }
    return it;
  }
  /** A species row by id (fish or legend), or null. */
  const species = id => byId.get(id) || null;
  /**
   * Can this recipe be cooked? `counts` = { [speciesId]: n } of the fish in the bag (junk never counts).
   * Needs: { fish: id, count } or { tag: 'any' | <water> | <rarity>, count }. Named fish are set aside first,
   * then tags take the cheapest fish that fit. Returns { ok, why?, text?, uses: { [speciesId]: n } }.
   */
  function canCook(recipe, counts = {}, skill = 1) {
    if (!recipe) return { ok: false, why: 'recipe', text: 'No such recipe.', uses: {} };
    if (num(recipe.skill, 0) > skillOf(skill)) return { ok: false, why: 'skill', need: recipe.skill, text: `Needs angling ${recipe.skill}.`, uses: {} };
    const left = {};
    for (const [id, n] of Object.entries(counts || {})) if (id !== 'any' && n > 0 && (byId.has(id) || !fish.length)) left[id] = n;
    const uses = {};
    const take = (id, n) => { left[id] -= n; uses[id] = (uses[id] || 0) + n; };
    const needs = list(recipe.needs);
    for (const nd of needs.filter(x => x.fish)) {
      const want = num(nd.count, 1);
      if ((left[nd.fish] || 0) < want) return { ok: false, why: 'fish', text: `Needs ${want} ${byId.get(nd.fish)?.name || nd.fish}.`, uses: {} };
      take(nd.fish, want);
    }
    for (const nd of needs.filter(x => !x.fish)) {
      let want = num(nd.count, 1);
      const tag = nd.tag || 'any';
      const fits = id => { const f = byId.get(id); return tag === 'any' || (!!f && (list(f.water).includes(tag) || f.rarity === tag)); };
      const ids = Object.keys(left).filter(id => left[id] > 0 && fits(id)).sort((a, b) => num(byId.get(a)?.price, 0) - num(byId.get(b)?.price, 0));
      for (const id of ids) { const n = Math.min(want, left[id]); take(id, n); want -= n; if (!want) break; }
      if (want > 0) return { ok: false, why: 'fish', text: `Needs ${nd.count} ${tag === 'any' ? 'fish' : tag + ' fish'}.`, uses: {} };
    }
    return { ok: true, uses, makes: recipe.makes || null };
  }

  return {
    wait, biteMs, roll, tug, lands, xp, gain, levelOf, next, span, rank, pool, poolCatches, canFish, item, canCook, species, listFor,
    rarityWeights, maxLevel: MAX,
    get numbers() { return N; },
    get content() { return content; },
  };
}
