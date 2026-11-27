// Oathwild — the arena's rules (brainstorm 2026-11-27 §2): brackets, the five waves of a match, how monsters are sized
// for the party, the reward chest, the champions' uniques and builds, and each hero's arena record. Pure (no DOM, no
// sockets, seeded dice); the ONE reader of data/arena.json. server/arena.js runs a match with these; tools/sim-arena.mjs
// and tests/rules/arena.test.mjs read the same functions.
//
//   brackets(rules) · bracketOf(rules, id) · bracketMark(rules, char, b)     the board ('hard' / 'fair' / 'easy')
//   rosterFor(rules, b)                → { normals, brutes, bosses } (monster ids from every region at the bracket's levels)
//   wavePlan(rules, b, wave, { heroes, rng })  → { wave, packs: [{ after, gate, monsters: [{ id, level, rank }] }], total, brute, boss }
//   arenaScale(rules, rank, heroes)    → { hp, dmg }   the ONE place arena monsters are sized for the party (rule 33)
//   rewardShare(rules, b, { first, heroLevel, seed }) → { gold, items }   one hero's reward chest (individual loot)
//   makeUnique(rules, id, { rng })     → a named unique item (data-driven stats) · uniqueIds(rules)
//   champions(rules) · championOf(rules, id) · championChar(rules, id) · championScale(rules, champ, heroes)
//   arenaRecord(char)                  → char.arena, filled in (rank, clears, firsts, beaten, titles, title)
//   challengeRefusal(rules, char, id)  → why a hero may not fight that champion yet, or null
//   recordClear(rules, char, bracketId) → { first }     recordChampion(rules, char, id) → { title, first }
//   titleOf(rules, char)               → the title shown with the hero's name ('' when none)
import { makeRng, hashStr, rollAffixValue } from './farhold.js';
import { rollItem } from './loot.js';
import { affixTemplate } from './inventory.js';
import { buildCharacter } from './hero-ai.js';
import { canWear } from './proficiency.js';
import { fillBar } from './hero-ai.js';

const A = rules => rules.data.arena;
const RARITY = ['normal', 'magic', 'rare', 'legendary'];

// ---------------------------------------------------------------- brackets and the board

export const brackets = rules => A(rules).brackets;
export const bracketOf = (rules, id) => A(rules).brackets.find(b => b.id === id) || null;
export const bracketIndex = (rules, id) => A(rules).brackets.findIndex(b => b.id === id);
/** How the board marks a bracket for this hero: 'hard' (under its levels — allowed, never locked), 'fair', 'easy'. */
export function bracketMark(rules, char, b) {
  const lv = char?.level || 1;
  if (lv < b.levels[0] - (A(rules).board.hardBelow || 0)) return 'hard';
  if (lv > b.levels[1]) return 'easy';
  return 'fair';
}

// ---------------------------------------------------------------- monsters

/** Every hostile monster of every region whose levels meet the bracket's (the open world's own rosters). */
export function rosterFor(rules, b) {
  const M = rules.data.monsters.monsters;
  const normals = new Set(), bosses = new Set();
  for (const r of Object.values(rules.data.regions.regions)) {
    // arenaLevels: the band the arena draws this region's monsters for (2026-11-27 the map went to levels 1-5 — the
    // arena's brackets up to 10 still use Thornmere's beasts, orcs and dead; their strength comes from the bracket)
    const lv = r.arenaLevels || r.levels;
    if (lv[1] < b.levels[0] || lv[0] > b.levels[1]) continue;
    for (const x of r.roam || []) if (M[x.id] && (M[x.id].temper || 'hostile') === 'hostile') normals.add(x.id);
    for (const c of Object.values(r.camps || {})) for (const s of c.spawns) {
      if (!M[s.id] || (M[s.id].temper || 'hostile') !== 'hostile') continue;
      (s.rank === 'boss' ? bosses : normals).add(s.id);
    }
  }
  const brutes = [...normals].filter(id => A(rules).brutes.ids.includes(id));
  return { normals: [...normals].sort(), brutes: brutes.length ? brutes.sort() : [...normals].sort().slice(0, 2), bosses: [...bosses].sort() };
}

/** One pack's size: mostly 1, some 2, rarely 3 (data/combat.json packOdds — the open world's own odds). */
function packSize(rules, rng, left) {
  const odds = rules.data.combat.packOdds || [1];
  const total = odds.reduce((a, b) => a + b, 0);
  let r = rng() * total, n = odds.length;
  for (let k = 0; k < odds.length; k++) { r -= odds[k]; if (r <= 0) { n = k + 1; break; } }
  return Math.max(1, Math.min(3, n, left));
}

/**
 * Wave `wave` (1-based) of a match in bracket `b` for `heroes` heroes. Packs arrive `packGap` seconds apart from the
 * gates in turn; a brute (wave 3) or a boss (wave 5) comes out first, alone. Monster levels sit at the wave's `level`
 * share of the bracket's range.
 */
export function wavePlan(rules, b, wave, { heroes = 1, rng = makeRng(1), gates = 3 } = {}) {
  const W = A(rules).waves, row = W.list[wave - 1];
  if (!row) return null;
  const R = rosterFor(rules, b);
  const [lo, hi] = b.levels;
  const level = Math.round(lo + (hi - lo) * (row.level || 0));
  const n = row.normals ? Math.max(1, Math.ceil(row.normals * (1 + W.perHero * (Math.max(1, heroes) - 1)) - 1e-9)) : Math.round(W.perHero * (Math.max(1, heroes) - 1));
  const pick = list => list[Math.floor(rng() * list.length)];
  const packs = [];
  const gap = A(rules).match.packGap;
  let gate = Math.floor(rng() * gates);
  const nextGate = () => { gate = (gate + 1) % gates; return gate; };
  if (row.brute) packs.push({ gate: nextGate(), monsters: [{ id: pick(R.brutes), level, rank: 'champion' }], brute: true });
  if (row.boss && R.bosses.length) packs.push({ gate: nextGate(), monsters: [{ id: pick(R.bosses), level, rank: 'boss' }], boss: true });
  for (let left = n; left > 0;) {
    const k = packSize(rules, rng, left);
    const id = pick(R.normals);
    packs.push({ gate: nextGate(), monsters: Array.from({ length: k }, () => ({ id, level: Math.max(1, level - (rng() < 0.3 ? 1 : 0)), rank: 'normal' })) });
    left -= k;
  }
  packs.forEach((p, i) => { p.after = i * gap; });
  return { wave, level, packs, total: packs.reduce((s, p) => s + p.monsters.length, 0), brute: !!row.brute, boss: !!row.boss };
}

/** Health and damage multipliers for an arena monster of `rank` fighting `heroes` heroes (data/arena.json scale). */
export function arenaScale(rules, rank, heroes = 1) {
  const S = A(rules).scale[rank === 'boss' ? 'boss' : rank === 'champion' ? 'brute' : 'normal'];
  const extra = Math.max(0, Math.min(9, Math.round(heroes) - 1));
  return { hp: S.hp + S.hpPerHero * extra, dmg: S.dmg + S.dmgPerHero * extra };
}

// ---------------------------------------------------------------- rewards

/** One hero's reward chest for a win in bracket `b` (rolled from `seed`: the same hero and match = the same chest). */
export function rewardShare(rules, b, { first = false, heroLevel = null, seed = 1 } = {}) {
  const RW = A(rules).rewards;
  const rng = makeRng(seed >>> 0);
  const idx = Math.max(0, bracketIndex(rules, b.id));
  const level = Math.max(1, Math.min(b.levels[1], heroLevel || b.levels[1]));
  const table = { kinds: RW.kinds, rarityBoost: RW.rarityBoost + RW.boostPerBracket * idx };
  const items = [];
  const count = RW.items + (first ? RW.firstItems : 0);
  for (let i = 0; i < count; i++) {
    const t = first && i === 0 ? { ...table, minRarity: RW.firstMinRarity } : table;
    const it = rollItem(rules, t, level, rng);
    if (it) { it.from = `Arena: ${b.name}`; items.push(it); }
  }
  const gold = Math.round(RW.goldBase + RW.goldPerLevel * b.levels[1] + (first ? RW.firstGold : 0));
  return { gold, items };
}

export const uniqueIds = rules => Object.keys(A(rules).uniques.list);
/** A champion's signature item: an Emberveil base rolled Legendary at its level, with its own fixed enchantments. */
export function makeUnique(rules, id, { rng = makeRng(hashStr(id)) } = {}) {
  const U = A(rules).uniques, def = U.list[id];
  if (!def) return null;
  const it = rules.rpg.loot.generate(def.base, 'legendary', 'high', { rng, ilvl: def.level, level: def.level });
  if (!it) return null;
  it.affixes = def.affixes.map(aid => {
    const t = affixTemplate(rules, aid);
    if (!t) throw new Error(`arena unique ${id}: unknown affix ${aid}`);
    const v = rollAffixValue(t, def.level, () => U.roll) * U.power;
    return { ...t, value: Math.round(v * 100) / 100, ilvl: def.level, unique: true };
  });
  it.id = `u_${id}_${Math.floor(rng() * 1e6).toString(36)}`;
  it.name = def.name;
  it.isUnique = true;
  it.uniqueId = id;
  it.lore = def.lore;
  return it;
}

// ---------------------------------------------------------------- champions

export const champions = rules => [...A(rules).champions.list].sort((a, b) => b.rank - a.rank);
export const championOf = (rules, id) => A(rules).champions.list.find(c => c.id === id) || null;

/** A champion's character: built like a player (hero-ai.js buildCharacter) along its plan, its unique in hand. */
export function championChar(rules, id) {
  const c = championOf(rules, id);
  if (!c) return null;
  const char = buildCharacter(rules, c.plan, { seed: hashStr(`champ:${id}`), gearLevel: c.level, gearRarity: c.gear || 'magic', id: `champ_${id}`, name: c.name, look: c.look });
  const u = makeUnique(rules, c.unique);
  if (u) {
    const slot = u.type === 'weapon' ? 'weapon' : u.isShield ? 'offhand' : u.slot === 'ring' ? (char.gear.ring1 ? 'ring2' : 'ring1') : u.slot;
    if (canWear(rules, char, u, { slot }).ok) {
      char.gear[slot] = u;
      if (slot === 'weapon' && u.twoHanded) delete char.gear.offhand;
    }
  }
  fillBar(rules, char);
  char.champion = id;
  return char;
}

/** How a champion is sized for the bout: its own hp / dmg against one hero, more health per extra hero. */
export function championScale(rules, champ, heroes = 1) {
  const P = A(rules).champions.party, extra = Math.max(0, Math.min(9, Math.round(heroes) - 1));
  return { hp: (champ.hp || 1) * (1 + P.hpPerHero * extra), dmg: (champ.dmg || 1) * (1 + P.dmgPerHero * extra) };
}

// ---------------------------------------------------------------- the hero's arena record (saved on the character)

/** char.arena, filled in. rank = how many champions beaten (0-10); clears / firsts by bracket id. */
export function arenaRecord(char) {
  const a = char.arena && typeof char.arena === 'object' ? char.arena : {};
  a.clears = a.clears && typeof a.clears === 'object' ? a.clears : {};
  a.firsts = a.firsts && typeof a.firsts === 'object' ? a.firsts : {};
  a.beaten = Array.isArray(a.beaten) ? a.beaten : [];
  a.titles = Array.isArray(a.titles) ? a.titles : [];
  a.title = typeof a.title === 'string' ? a.title : null;   // lint-ok: a champion title (an honorific on the hero record), not an HTML title= tooltip
  a.matches = a.matches | 0; a.wins = a.wins | 0;
  a.rank = a.beaten.length;
  char.arena = a;
  return a;
}

/** The next champion this hero may challenge (lowest rank first), or null when the ladder is done. */
export function nextChampion(rules, char) {
  const rec = arenaRecord(char);
  return champions(rules).find(c => !rec.beaten.includes(c.id)) || null;
}

export function challengeRefusal(rules, char, id) {
  const c = championOf(rules, id);
  if (!c) return 'There is no such champion.';
  const rec = arenaRecord(char);
  if (rec.beaten.includes(id)) return null;                 // a rematch is always open (no second reward)
  const next = nextChampion(rules, char);
  if (next && next.id !== id) return `Beat ${next.name} first (rank ${next.rank}).`;
  const b = bracketOf(rules, c.needs);
  if (b && !rec.clears[b.id]) return `Win the ${b.name} bracket (levels ${b.levels[0]}-${b.levels[1]}) first.`;
  return null;
}

export function recordClear(rules, char, bracketId) {
  const rec = arenaRecord(char);
  const first = !rec.clears[bracketId];
  rec.clears[bracketId] = (rec.clears[bracketId] || 0) + 1;
  if (first) rec.firsts[bracketId] = true;
  rec.wins++;
  return { first };
}

export function recordChampion(rules, char, id) {
  const c = championOf(rules, id);
  const rec = arenaRecord(char);
  const first = !rec.beaten.includes(id);
  if (first) { rec.beaten.push(id); if (!rec.titles.includes(c.title)) rec.titles.push(c.title); rec.title = c.title; }   // lint-ok: a champion title (an honorific on the hero record), not an HTML title= tooltip
  rec.rank = rec.beaten.length;
  return { first, title: c.title };
}

/** The title shown with the hero's name: the one they chose (the newest by default). */
export function titleOf(rules, char) {
  const a = char?.arena;
  if (!a?.title || !(a.titles || []).includes(a.title)) return '';
  return a.title;
}
export const RARITY_ORDER = RARITY;
