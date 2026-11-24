// Oathwild — INDIVIDUAL loot (owner 2026-11-23: no need/greed). Pure. The ONE reader of data/loot-tables.json.
//
// A container (corpse, chest or bag) holds separate contents for every player who may open it. A
// player's share is rolled the first time THAT player opens it, with a generator seeded by the
// container and the player — so the same player always sees the same roll, and nobody can see or
// take anyone else's. Gold sits in the window until it is taken: nothing adds gold to a character
// except takeGold / takeAll.
//
//   createContainer({ id, kind, at, level, table, eligible, seed, expires, name })   → container
//   openFor(rules, container, playerId, { char })   → the player's view { gold, items, empty } (rolls once)
//   takeItem(rules, container, playerId, char, itemId) → { ok, why, item }   (carry weight is only a slow-down)
//   takeGold(container, playerId, char)            → { ok, why, gold }
//   takeAll(rules, container, playerId, char)      → { ok, gold, items }
//   isEmptyFor / isEmpty(container)                  (a corpse vanishes when everyone's share is empty)
//   monsterTable(rules, monster)                   which table a monster's corpse uses
//   rollShare(rules, table, level, rng, { char })  { gold, items } (also used by tests and the sim tool)
//   chestOpenFor(rules, ws, chestId, playerId, now)  chests refill per player (world-state.js keeps the timers)

import { makeRng, hashStr } from './farhold.js';
import { addProfAffix } from './proficiency.js';
import { lockpickChance, gainSkill, hasPerk } from './skills-use.js';

const LT = rules => rules.data.lootTables;
const RARITY = ['normal', 'magic', 'rare', 'legendary'];

export function createContainer({ id, kind = 'corpse', at = [0, 0], level = 1, table = 'beast', eligible = [], seed = 1, expires = null, name = null, lock = null }) {
  return { id, kind, at, level, table, eligible: [...new Set(eligible)], seed, expires, name, lock, shares: {} };
}

/** Which loot table a dead monster uses (rank first, then family). */
export function monsterTable(rules, m) {
  const map = LT(rules).monsterTable;
  return map[m.rank] || map[m.family] || map[m.kind] || map.default;
}

function pickWeighted(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1]?.[0];
}
const between = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));

/** One player's share of a table at `level`. */
export function rollShare(rules, tableId, level, rng) {
  const cfg = LT(rules);
  const t = cfg.tables[tableId] || cfg.tables.beast;
  const goldK = 1 + cfg.goldPerLevel * (level - 1);
  const gold = Math.round(between(rng, t.gold) * goldK);
  const items = [];
  if (rng() < (t.items?.chance || 0)) {
    const n = between(rng, t.items.count);
    for (let i = 0; i < n; i++) {
      const it = rollItem(rules, t, level, rng);
      if (it) items.push(it);
    }
  }
  return { gold, items };
}

/** One item: Emberveil base, Farhold affixes, item level near `level`, rarity weighted by the table. */
export function rollItem(rules, table, level, rng) {
  const cfg = LT(rules);
  const kind = pickWeighted(table.kinds || { armour: 1 }, rng);
  const bases = cfg.kinds[kind] || cfg.kinds.armour;
  const baseKey = bases[Math.floor(rng() * bases.length)];
  // rarity: the table's boost moves weight from normal toward the better ones
  const w = { ...cfg.rarityWeights };
  const boost = table.rarityBoost || 1;
  for (const r of ['magic', 'rare', 'legendary']) w[r] *= boost;
  let rarity = pickWeighted(w, rng);
  if (table.minRarity && RARITY.indexOf(rarity) < RARITY.indexOf(table.minRarity)) rarity = table.minRarity;
  const quality = pickWeighted(cfg.qualityWeights, rng);
  const [lo, hi] = cfg.itemLevelSpread;
  const ilvl = Math.max(1, level + lo + Math.floor(rng() * (hi - lo + 1)));
  const item = rules.rpg.loot.generate(baseKey, rarity, quality, { rng, ilvl, level });
  if (!item) return null;
  item.id = `i${Math.floor(rng() * 1e9).toString(36)}`;
  // proficiency enchantments ("of the Bulwark: can wear plate") on magic-or-better gear
  if (rarity !== 'normal' && item.type !== 'weapon' && rng() < cfg.profAffixChance) {
    const defs = rules.data.proficiency.affixes;
    const def = defs[Math.floor(rng() * defs.length)];
    addProfAffix(item, def);
    item.name = `${item.name.replace(/ of .*$/, '')} ${def.name}`;
  }
  return item;
}

/** The share for one player, rolled on their first open. */
export function openFor(rules, c, playerId, { char = null } = {}) {
  if (!c.eligible.includes(playerId)) return { allowed: false, why: 'Nothing in here is yours — you did not help with this one.', gold: 0, items: [], empty: true };
  if (!c.shares[playerId]) {
    const rng = makeRng((c.seed ^ hashStr(String(playerId))) >>> 0);
    const share = rollShare(rules, c.table, c.level, rng);
    if (c.kind === 'chest' && c.lock && char && hasPerk(rules, char, 'deep_pockets')) share.gold = Math.round(share.gold * 1.25);
    c.shares[playerId] = { gold: share.gold, items: share.items, opened: true };
  }
  const s = c.shares[playerId];
  return { allowed: true, why: null, gold: s.gold, items: s.items, empty: !s.gold && !s.items.length };
}

export function takeItem(rules, c, playerId, char, itemId) {
  const view = openFor(rules, c, playerId, { char });
  if (!view.allowed) return { ok: false, why: view.why };
  const s = c.shares[playerId];
  const i = s.items.findIndex(it => it.id === itemId);
  if (i < 0) return { ok: false, why: 'That item is not here any more.' };
  const [item] = s.items.splice(i, 1);
  char.bag = char.bag || [];
  char.bag.push(item);
  return { ok: true, why: null, item };
}

export function takeGold(c, playerId, char) {
  const s = c.shares[playerId];
  if (!s || !s.gold) return { ok: false, why: 'No gold left here.', gold: 0 };
  const gold = s.gold;
  s.gold = 0;
  char.gold = (char.gold || 0) + gold;
  return { ok: true, why: null, gold };
}

export function takeAll(rules, c, playerId, char) {
  const view = openFor(rules, c, playerId, { char });
  if (!view.allowed) return { ok: false, why: view.why, gold: 0, items: [] };
  const gold = takeGold(c, playerId, char).gold || 0;
  const items = [];
  for (const it of [...c.shares[playerId].items]) items.push(takeItem(rules, c, playerId, char, it.id).item);
  return { ok: true, why: null, gold, items };
}

export const isEmptyFor = (c, playerId) => { const s = c.shares[playerId]; return !!s && !s.gold && !s.items.length; };
/** Every eligible player has opened and emptied their share. */
export const isEmpty = c => c.eligible.every(p => isEmptyFor(c, p));

/**
 * Open a world chest for one player. Chests refill per player: `ws` (world-state.js) remembers when
 * each player last emptied it. A locked chest needs a pick: `pick` = { rng } rolls Lockpicking once.
 */
export function chestOpenFor(rules, ws, chestId, playerId, now, { char = null, pick = null } = {}) {
  const def = chestDef(rules, chestId);
  if (!def) return { ok: false, why: 'There is no such chest.' };
  const last = ws.chests?.[chestId]?.[playerId];
  const refill = def.refillMinutes * 60;
  if (last != null && now - last < refill) {
    // still this fill: what the player left behind is still there
    const kept = ws.chestLoot?.[chestId]?.[playerId];
    if (kept && !isEmptyFor(kept, playerId)) return { ok: true, why: null, container: kept, view: openFor(rules, kept, playerId, { char }) };
    const left = Math.ceil((refill - (now - last)) / 60);
    return { ok: false, why: `Empty — it fills again in about ${left} minute${left === 1 ? '' : 's'}.`, refillIn: refill - (now - last) };
  }
  let skill = null;
  if (def.lock && !(ws.unlocked?.[chestId]?.[playerId])) {
    if (!pick) return { ok: false, why: `Locked (${def.lock}). Your odds: ${Math.round(lockpickChance(rules, char, def.lock) * 100)}%.`, locked: true };
    const chance = lockpickChance(rules, char, def.lock);
    const opened = pick.rng() < chance;
    skill = opened ? gainSkill(rules, char, 'lockpicking', `pick${def.lock[0].toUpperCase()}${def.lock.slice(1)}`) : null;
    if (!opened) return { ok: false, why: 'The pick slips. Try again.', locked: true, skill };
    ws.unlocked = ws.unlocked || {};
    (ws.unlocked[chestId] = ws.unlocked[chestId] || {})[playerId] = true;
  }
  const c = createContainer({ id: `${chestId}:${playerId}:${last ?? 0}`, kind: 'chest', at: def.at, level: def.level, table: def.table, eligible: [playerId], seed: hashStr(`${chestId}:${last ?? 0}`), name: def.name, lock: def.lock });
  ws.chests = ws.chests || {};
  (ws.chests[chestId] = ws.chests[chestId] || {})[playerId] = now;
  ws.chestLoot = ws.chestLoot || {};
  (ws.chestLoot[chestId] = ws.chestLoot[chestId] || {})[playerId] = c;
  return { ok: true, why: null, container: c, view: openFor(rules, c, playerId, { char }), skill };
}

export function chestDef(rules, chestId) {
  for (const r of Object.values(rules.data.regions.regions)) if (r.chests?.[chestId]) return { id: chestId, ...r.chests[chestId] };
  return null;
}
