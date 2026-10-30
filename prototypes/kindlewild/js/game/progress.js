// Progress: Essence, the Grimoire (what is unlocked), spell levels, boons, stars, discoveries,
// settings. Kept in localStorage under `kindlewild.save.v1` (cloud-synced when signed in).
// The rules are pure functions over a plain object so tests can use them without a browser.

export const SAVE_KEY = 'kindlewild.save.v1';

export function freshSave(grimoire) {
  return {
    v: 1,
    essence: 0,
    essenceTotal: 0,
    pages: grimoire.pages.filter(p => p.free).map(p => p.id),
    seenPages: grimoire.pages.filter(p => p.free).map(p => p.id),
    levels: {},          // id -> { stars: [bool,bool,bool], best, cleared, plays }
    discoveries: [],
    spellLevels: {},
    boons: {},
    ratings: {},
    seenIntro: {},
    settings: { volume: 0.7, quality: 'high', tips: true, everything: false, endless: true, shake: true },
    stats: { meteors: 0, casts: 0, born: 0, playSecs: 0, blasts: 0, burned: 0, levelsWon: 0 },
    realm: null,          // the realm's own small record (the world itself is saved separately)
  };
}

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

export function loadSave(grimoire) {
  const base = freshSave(grimoire);
  try {
    const raw = ls.get(SAVE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw);
    const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) }, stats: { ...base.stats, ...(s.stats || {}) } };
    // free pages added in a later version
    for (const p of grimoire.pages) if (p.free && !out.pages.includes(p.id)) out.pages.push(p.id);
    if (!out.seenPages) out.seenPages = out.pages.slice();
    return out;
  } catch { return base; }
}
export function writeSave(save) { return ls.set(SAVE_KEY, JSON.stringify(save)); }

/** How many pages of each tier the player owns. */
export function tierCounts(save, grimoire) {
  const n = [];
  for (const p of grimoire.pages) { n[p.tier] = n[p.tier] || 0; if (save.pages.includes(p.id)) n[p.tier]++; }
  return n;
}
/** Is a tier open? Tier 1 is open from the start; tier t opens when you own `opensAt[t]` pages
 *  of tier t-1 (bought or won). */
export function tierOpen(save, grimoire, t) {
  if (t <= 1) return true;
  if (!tierOpen(save, grimoire, t - 1)) return false;
  const owned = grimoire.pages.filter(p => p.tier === t - 1 && !p.free && save.pages.includes(p.id)).length;
  return owned >= grimoire.opensAt[t];
}

/** Why a page can't be bought (or null if it can). */
export function pageRefusal(save, grimoire, id) {
  const p = grimoire.pages.find(q => q.id === id);
  if (!p) return 'Unknown page';
  if (save.pages.includes(id)) return 'Already yours';
  if (!tierOpen(save, grimoire, p.tier)) return `Own ${grimoire.opensAt[p.tier]} ${grimoire.tierNames[p.tier - 1]} unlocks first`;
  if (save.essence < p.cost) return `Needs ${p.cost} ✦`;
  return null;
}
export function buyPage(save, grimoire, id) {
  const why = pageRefusal(save, grimoire, id);
  if (why) return { ok: false, reason: why };
  const p = grimoire.pages.find(q => q.id === id);
  save.essence -= p.cost;
  save.pages.push(id);
  return { ok: true };
}

export function upgradeCost(save, grimoire, spellId) {
  const lv = save.spellLevels[spellId] || 0;
  if (lv >= grimoire.upgrades.max) return null;
  return grimoire.upgrades.cost[lv];
}
export function buyUpgrade(save, grimoire, spellId) {
  if (!save.pages.includes('spell:' + spellId)) return { ok: false, reason: 'Learn the spell first' };
  const c = upgradeCost(save, grimoire, spellId);
  if (c == null) return { ok: false, reason: 'Fully empowered' };
  if (save.essence < c) return { ok: false, reason: `Needs ${c} ✦` };
  save.essence -= c;
  save.spellLevels[spellId] = (save.spellLevels[spellId] || 0) + 1;
  return { ok: true };
}
export function boonCost(save, grimoire, id) {
  const b = grimoire.boons[id];
  const lv = save.boons[id] || 0;
  return lv >= b.cost.length ? null : b.cost[lv];
}
export function buyBoon(save, grimoire, id) {
  const c = boonCost(save, grimoire, id);
  if (c == null) return { ok: false, reason: 'Fully grown' };
  if (save.essence < c) return { ok: false, reason: `Needs ${c} ✦` };
  save.essence -= c;
  save.boons[id] = (save.boons[id] || 0) + 1;
  return { ok: true };
}

export function earn(save, n) {
  n = Math.round(n);
  if (n <= 0) return 0;
  save.essence += n;
  save.essenceTotal += n;
  return n;
}

/** A discovery seen for the first time: returns essence paid (0 if already known / unknown id). */
export function discover(save, discoveries, id) {
  const d = discoveries.list[id];
  if (!d || save.discoveries.includes(id)) return 0;
  save.discoveries.push(id);
  return earn(save, d.essence);
}

/**
 * Record a finished challenge. Stars are kept per star (best of all tries); essence is paid for
 * each star the first time it is earned and once for the first clear. Returns what was gained.
 */
export function recordLevel(save, level, result) {
  const rec = save.levels[level.id] || { stars: [false, false, false], cleared: false, plays: 0, best: null };
  rec.plays++;
  const gained = { essence: 0, newStars: 0, firstClear: false, reward: null };
  if (result.won) {
    if (!rec.cleared) { rec.cleared = true; gained.firstClear = true; save.stats.levelsWon = (save.stats.levelsWon || 0) + 1; gained.essence += earn(save, 20); if (level.reward && !save.pages.includes(level.reward)) { save.pages.push(level.reward); gained.reward = level.reward; } }
    result.stars.forEach((st, k) => { if (st && !rec.stars[k]) { rec.stars[k] = true; gained.newStars++; gained.essence += earn(save, 10); } });
    rec.best = rec.best == null ? result.secs : Math.min(rec.best, result.secs);
  }
  save.levels[level.id] = rec;
  return gained;
}

/** Is a level open? The first is; each later one opens when the one before is cleared. */
export function levelOpen(save, act, index, acts) {
  if (index > 0) return !!save.levels[act.levels[index - 1].id]?.cleared;
  // the first level of an act opens when the act before it is finished
  const k = acts ? acts.indexOf(act) : 0;
  if (k <= 0) return true;
  const prev = acts[k - 1];
  return !!save.levels[prev.levels[prev.levels.length - 1].id]?.cleared;
}

export function starTotal(save) {
  let n = 0;
  for (const [id, r] of Object.entries(save.levels)) if (!id.startsWith('trial-')) n += r.stars.filter(Boolean).length;
  return n;
}

/** How much of a level's written mana you get: 75% at first, +10% a boon level (both pool and flow). */
export function challengeMana(save) {
  return { manaScale: 0.75 + 0.1 * (save.boons.manaCap || 0), regenScale: 0.75 + 0.1 * (save.boons.manaRegen || 0) };
}

/** Mana numbers for the Realm from boons. */
export function realmMana(save, grimoire) {
  const B = grimoire.boons;
  return {
    max: 120 + (save.boons.manaCap || 0) * B.manaCap.step,
    regenScale: 1 + (save.boons.manaRegen || 0) * B.manaRegen.step,
    faithScale: 1 + (save.boons.faith || 0) * B.faith.step,
    growth: 1 + (save.boons.fertility || 0) * B.fertility.step,
  };
}

/**
 * Combine two copies of the progress save (owner 2026-10-30: finished four acts on the phone, the PC signed in to the
 * same account still showed a fresh start). Progress only grows, so nothing has to be thrown away: the copy that has
 * earned more Essence is the base, and whatever only the other copy has is added to it — cleared levels and stars,
 * unlocks, spell levels, boosts, discoveries, ratings. Essence: the base's balance, plus what the other copy earned
 * that the base did not (first clears 20, stars 10, discoveries their own value), minus what the other copy bought
 * that the base did not. When one copy already holds everything the other does, the result IS that copy.
 * `keep` = settings to keep (this device's: picture quality and volume belong to the device).
 */
export function mergeSaves(a, b, data, keep = a.settings) {
  const G = data.grimoire;
  const [M, O] = (b.essenceTotal || 0) > (a.essenceTotal || 0) ? [b, a] : [a, b];
  const out = structuredClone(M);
  let earned = 0, spent = 0;
  const rewards = new Set(data.levels.acts.flatMap(x => x.levels).map(l => l.reward).filter(Boolean));
  out.levels = out.levels || {};
  for (const [id, r] of Object.entries(O.levels || {})) {
    const m = out.levels[id];
    if (!m) { out.levels[id] = structuredClone(r); if (r.cleared && !id.startsWith('trial-')) earned += 20; earned += (r.stars || []).filter(Boolean).length * 10; continue; }
    if (r.cleared && !m.cleared) { m.cleared = true; earned += 20; }
    (r.stars || []).forEach((st, k) => { if (st && !m.stars[k]) { m.stars[k] = true; earned += 10; } });
    m.plays = Math.max(m.plays || 0, r.plays || 0);
    if (r.best != null) m.best = m.best == null ? r.best : Math.min(m.best, r.best);
  }
  for (const id of O.discoveries || []) if (!out.discoveries.includes(id)) { out.discoveries.push(id); earned += data.discoveries.list[id]?.essence || 0; }
  for (const id of O.pages || []) if (!out.pages.includes(id)) {
    out.pages.push(id);
    const p = G.pages.find(q => q.id === id);
    if (p && !p.free && !rewards.has(id)) spent += p.cost;
  }
  for (const id of O.seenPages || []) if (!(out.seenPages ||= []).includes(id)) out.seenPages.push(id);
  for (const [id, lv] of Object.entries(O.spellLevels || {})) for (let k = out.spellLevels[id] || 0; k < lv; k++) { spent += G.upgrades.cost[k] || 0; out.spellLevels[id] = k + 1; }
  for (const [id, lv] of Object.entries(O.boons || {})) for (let k = out.boons[id] || 0; k < lv; k++) { spent += G.boons[id]?.cost[k] || 0; out.boons[id] = k + 1; }
  for (const [id, r] of Object.entries(O.ratings || {})) if (!out.ratings[id] || (r.at || 0) > (out.ratings[id].at || 0)) out.ratings[id] = r;
  out.seenIntro = { ...(O.seenIntro || {}), ...(out.seenIntro || {}) };
  for (const [k, v] of Object.entries(O.stats || {})) out.stats[k] = Math.max(out.stats[k] || 0, v || 0);
  if ((O.realm?.day || 0) > (out.realm?.day || 0)) out.realm = O.realm;
  out.essenceTotal = (M.essenceTotal || 0) + earned;
  out.essence = Math.max(0, (M.essence || 0) + earned - spent);
  if (keep) out.settings = structuredClone(keep);
  return out;
}
