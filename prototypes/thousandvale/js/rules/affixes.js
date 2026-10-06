// Thousandvale — CHAMPIONS AND RARES in the wilds (play-test 4 S4: "more frequent rare monsters: pack leaders, giants,
// on fire; larger, bigger health bar, special abilities, better loot"). Pure: no DOM, no storage; rng passed in.
//
// Farhold already knows ranks (balance.ranks: a champion is x2.6 health, x1.35 damage, +1 drop at x1.5 rarity; a rare
// x4.5 / x1.6 / +2 drops at x2.2 and a magic floor) and 22 modifiers (data/enemies.json). Thousandvale never ROLLED a
// rank — only camps E marked 'elite' had one. This module:
//   * rolls a rank for every ordinary wilds spawn (data/rules/affixes.json `chance`, from `minLevel`);
//   * adds Thousandvale's own modifiers to the table (`extra`: the Pack-leader, who brings `escort` of its own kind);
//   * gives each modifier a telegraphed SPECIAL (`abilities`) on top of the monster's family specials;
//   * makes a champion / rare visibly bigger (`size` floor) and gives a rare a name of its own (`rareNames`).
//
//   installAffixes(engine, data)                     once per engine (idempotent)
//   rollWildRank(engine, rng, { level, roomKind, e }) -> 'normal' | 'champion' | 'rare'
//   rareName(engine, rng) -> 'Grisk the Gnawer'
//   affixSpecials(engine, modifierIds) -> [special]   (docs/encounters.md specials format)
//   sizeFloor(engine, rank) -> scale multiplier floor (1 for normal)

const DEFAULTS = Object.freeze({ chance: { champion: 0.09, rare: 0.025, minLevel: 2 }, size: { champion: 1.25, rare: 1.45 } });

export function installAffixes(engine, data) {
  if (!engine || engine.affixes) return engine && engine.affixes;
  const cfg = { ...DEFAULTS, ...(data || {}) };
  const table = engine.bestiary && Array.isArray(engine.bestiary.modifiers) ? engine.bestiary.modifiers : null;
  if (table) for (const m of cfg.extra || []) if (m && m.id && !table.some(x => x.id === m.id)) table.push({ ...m });
  engine.affixes = { cfg, abilities: cfg.abilities || {}, byId: new Map((table || []).map(m => [m.id, m])) };
  return engine.affixes;
}

/** A wilds camp's ordinary monster: champion / rare / normal. Never for named, scripted, escort or dungeon bodies. */
export function rollWildRank(engine, rng, { level = 1, roomKind = 'wilds', e = null } = {}) {
  const A = engine && engine.affixes;
  if (!A || roomKind !== 'wilds') return 'normal';
  if (e && !(e.data && e.data.camp)) return 'normal';               // only a wilds CAMP's monster (a test or script spawn never rolls)
  if (e && (e.rank && e.rank !== 'normal' || (e.name && e.name !== e.type) || (e.data && (e.data.encounter || e.data.escortOf != null || e.data.event || e.data.noRank)))) return 'normal';
  const c = A.cfg.chance || DEFAULTS.chance;
  if ((level | 0) < (c.minLevel ?? 2)) return 'normal';
  const x = rng();
  if (x < (c.rare ?? 0)) return 'rare';
  if (x < (c.rare ?? 0) + (c.champion ?? 0)) return 'champion';
  return 'normal';
}

export function rareName(engine, rng) {
  const N = (engine && engine.affixes && engine.affixes.cfg.rareNames) || {};
  const g = N.given || [], ep = N.epithet || [];
  if (!g.length || !ep.length) return null;
  return g[Math.floor(rng() * g.length)] + ' the ' + ep[Math.floor(rng() * ep.length)];
}

/** The telegraphed specials a monster's modifiers give it (each modifier's list, in order; duplicates dropped). */
export function affixSpecials(engine, modifierIds = []) {
  const A = engine && engine.affixes;
  if (!A) return [];
  const out = [], seen = new Set();
  for (const id of modifierIds || []) for (const s of A.abilities[id] || []) if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
  return out;
}

export function sizeFloor(engine, rank) {
  const S = (engine && engine.affixes && engine.affixes.cfg.size) || DEFAULTS.size;
  return rank === 'champion' ? (S.champion || 1) : rank === 'rare' ? (S.rare || 1) : 1;
}

/** How many of its own kind a monster with these modifiers brings (the Pack-leader's `escort`). */
export function escortCount(engine, modifierIds = []) {
  const A = engine && engine.affixes;
  if (!A) return 0;
  let n = 0;
  for (const id of modifierIds || []) n += (A.byId.get(id) && A.byId.get(id).escort) || 0;
  return n;
}
