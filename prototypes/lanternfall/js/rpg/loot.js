// Loot tables (docs/08 §14, §4.1, §7, §10): pennies, oil blobs, gear with act-gated rarity and affixes,
// consumables from the act pool, guaranteed lines (keys, relics, dust, pearls, a strand pick), elite
// rarity step, Knack rarity boost, relic once-per-save rule, strand dupes -> strand_dust. Pure.
//
// rollLoot(tableId, ctx) -> [{ kind, ... }]
//   kind 'pennies' | 'pearls' | 'scrap' | 'dust' | 'oil' : { amount }  (oil may carry full: true)
//   kind 'item'       : { item }             a rolled gear item or relic (items.js shape)
//   kind 'consumable' : { id, amount }
//   kind 'strand'     : { id, options? }     options = the boss "pick 1" list (id is the default pick)
//   kind 'key'        : { id }               great wicks, room keys
// ctx: { data, rng, level (area level), act (current act, for 'current' tables), tier, elite, pennies
//        (the monster's range), enemyId, extra (monster drops.extra), lootFind | knack, penniesFind,
//        hero (relic + strand ownership), classId, mode, underwater }
import { rollItem, actOfLevel, ownsItem, knowsStrand, RARITY_ORDER } from './items.js';

/** Resolve alias rows (enemies.json's lt_act1_fodder …) to the real table + the tier it fixes. */
export function resolveTable(data, id) {
  let t = data.loot.byId[id]; if (!t) throw new Error(`unknown loot table ${id}`);
  let tier = null; if (t.alias) { tier = t.tier; t = data.loot.byId[t.alias]; if (!t) throw new Error(`loot alias ${id} points nowhere`); }
  return { table: t, tier: t.tier || tier };
}
/** 08 §4.1 Knack: fine and rare weights × (1 + 0.02 × (Knack − 5)), capped ×1.6. Falls back to the derived lootFind. */
export function knackMult(data, ctx) {
  const K = data.items.economy.knack;
  if (ctx.knack != null) return Math.min(K.cap, 1 + K.per * Math.max(0, ctx.knack - K.from));
  return Math.min(K.cap, 1 + Math.max(0, ctx.lootFind || 0));
}
/** Pick a rarity from a tier template: `early` weights before loot.affixFromAct, `late` from it. */
export function pickRarity(data, tierDef, act, mult, rng) {
  const w = act >= data.loot.affixFromAct ? tierDef.rarity.late : tierDef.rarity.early;
  const list = Object.entries(w).map(([id, v]) => ({ id, w: id === 'common' ? v : v * mult }));
  return rng.weighted(list).id;
}
export function stepRarity(r, n = 1) { const o = ['common', 'fine', 'rare']; return o[Math.min(o.length - 1, Math.max(0, o.indexOf(r) + n))]; }
const atLeast = (r, min) => (RARITY_ORDER.indexOf(r) < RARITY_ORDER.indexOf(min) ? min : r);

/** Gear bases that can drop in an act: Req <= act, plus the class's own starting items at any act. */
export function dropBases(data, act, { classId = null, slot = null } = {}) {
  const cls = classId && data.classes?.byId?.[classId], own = cls ? [cls.weapon, cls.lantern] : [];
  return data.items.list.filter(d => d.type === 'gear' && (!slot || slot === 'any' || d.slot === slot) && (d.req <= act || own.includes(d.id)));
}
/** One random gear item (any base allowed in this act, even odds). */
export function rollGear(data, { act, ilvl, rarity, rng, classId = null, slot = null }) {
  if (act < data.loot.affixFromAct) rarity = 'common'; // plain bases before the affix gate (00 §6.2)
  const bases = dropBases(data, act, { classId, slot });
  return rollItem(data, { base: rng.pick(bases), ilvl, rarity, rng, act });
}
/** Relic rule (08 §7): 100% the first time; later only 15% and only if you no longer own it. */
export function relicAllowed(data, hero, id, rng) {
  if (!hero) return true; const found = (hero.relicsFound || []).includes(id);
  if (!found) return true; if (ownsItem(hero, id)) return false;
  return rng.chance(data.items.economy.relicRepeatChance);
}
const amt = (a, rng) => (Array.isArray(a) ? rng.int(a[0], a[1]) : a ?? 1);

export function rollLoot(tableId, ctx) {
  const { data, rng } = ctx; if (!data || !rng) throw new Error('rollLoot needs ctx.data and ctx.rng');
  const { table, tier: fixed } = resolveTable(data, tableId);
  const level = Math.max(1, ctx.level || 1);
  const act = table.act === 'current' || table.act == null ? (ctx.act ?? actOfLevel(data, level)) : table.act;
  const tierId = table.tier || (ctx.elite ? 'elite' : fixed || ctx.tier || 'standard');
  const T = data.loot.tiers[tierId]; if (!T) throw new Error(`unknown loot tier ${tierId}`);
  const out = [], hero = ctx.hero || null;
  const ilvl = ctx.endless ? level : Math.min(data.items.economy.ilvlMax, level);
  // pennies: the monster's own range if it has one (not for elites, which use their row), × actMult
  const pr = (tierId !== 'elite' && ctx.pennies) || T.pennies, actMult = ctx.actMult ?? act;
  const pennies = Math.round(rng.int(pr[0], pr[1]) * actMult * (table.penniesMult || 1) * (1 + (ctx.penniesFind || 0)));
  if (pennies > 0) out.push({ kind: 'pennies', amount: pennies });
  // oil blob
  if (rng.chance(table.oilChance ?? T.oilChance)) out.push(T.oil === 'full' ? { kind: 'oil', amount: 9999, full: true } : { kind: 'oil', amount: amt(T.oil, rng) });
  // extras: the monster's drops.extra, the table's own, elite-only and underwater lines
  for (const x of [...(ctx.extra || []), ...(table.extra || []), ...(ctx.elite ? table.eliteExtra || [] : []), ...(ctx.underwater ? table.underwater || [] : [])]) if (rng.chance(x.chance ?? 1)) out.push(line(x, rng));
  // gear
  const gearOn = !table.noGear || (table.gearIn || []).includes(ctx.mode);
  if (gearOn) {
    const mult = knackMult(data, ctx), chance = table.gearChance ?? T.gearChance; let first = true;
    for (let r = 0; r < T.gearRolls; r++) {
      if (!rng.chance(chance)) continue;
      let rarity = pickRarity(data, T, act, mult, rng);
      if (first && act >= data.loot.affixFromAct) { if (ctx.elite) rarity = stepRarity(rarity, data.loot.eliteRarityStep); if (table.firstGearMin) rarity = atLeast(rarity, table.firstGearMin); }
      first = false;
      out.push({ kind: 'item', item: rollGear(data, { act, ilvl, rarity, rng, classId: ctx.classId || hero?.class }) });
    }
  }
  // consumables from the act pool (08 §14.4)
  if (!table.noConsumables && rng.chance(T.consumableChance)) {
    const pool = data.loot.pools[table.pool === 'current' || table.pool == null ? Math.min(6, act) : table.pool];
    const got = {}; for (let k = 0; k < (T.consumables || 1); k++) { const id = rng.weighted(pool).id; got[id] = (got[id] || 0) + 1; }
    for (const [id, n] of Object.entries(got)) out.push({ kind: 'consumable', id, amount: n });
  }
  // guaranteed lines, then per-enemy lines (minibosses), then the boss strand pick
  for (const g of [...(table.guaranteed || []), ...((ctx.enemyId && table.byEnemy?.[ctx.enemyId]) || [])]) {
    if (g.kind === 'table') { if ((ctx._depth || 0) < 2) out.push(...rollLoot(g.id, { ...ctx, tier: null, elite: false, pennies: null, extra: null, enemyId: null, _depth: (ctx._depth || 0) + 1 })); continue; }
    if (g.kind === 'item') { const def = data.items.byId[g.id]; if (def.type === 'relic' && !relicAllowed(data, hero, g.id, rng)) continue; out.push({ kind: 'item', item: rollItem(data, { base: g.id, ilvl, rng, act }) }); continue; }
    out.push(line(g, rng));
  }
  if (table.strandPick) out.push(strandPick(data, table.strandPick, act, hero, rng));
  return resolveStrandDupes(data, out, hero);
}
function line(x, rng) {
  if (x.kind === 'key') return { kind: 'key', id: x.id };
  if (x.kind === 'consumable' || (x.id && !['scrap', 'strand_dust'].includes(x.id) && !x.kind)) return { kind: 'consumable', id: x.id, amount: amt(x.amount, rng) };
  const kind = x.kind || (x.id === 'strand_dust' ? 'dust' : x.id);
  return { kind, amount: amt(x.amount, rng) };
}
/** A boss's "pick 1" strand (09 §6.0): the options you don't know yet; else the fallback; else dust. */
function strandPick(data, sp, act, hero, rng) {
  const known = id => hero && knowsStrand(hero, data.items.byId[id]);
  let opts = sp.options.filter(id => !known(id));
  if (!opts.length && sp.else === 'sold_charms') opts = data.items.list.filter(d => d.type === 'strand' && d.part === 'charm' && d.soldFrom != null && d.soldFrom <= act && !known(d.id)).map(d => d.id);
  if (!opts.length) return { kind: 'dust', amount: 1 };
  return { kind: 'strand', id: rng.pick(opts), options: opts };
}
/** A strand you already know becomes 1 Strand Dust (08 §10). */
export function resolveStrandDupes(data, drops, hero) {
  if (!hero) return drops;
  return drops.map(d => (d.kind === 'strand' && knowsStrand(hero, data.items.byId[d.id]) ? { kind: 'dust', amount: 1, from: d.id } : d));
}
/** Pots and crates (08 §14.5): the act's fodder pennies + 20% scrap 1-2. */
export function rollPot(ctx) {
  const { data, rng } = ctx, P = data.loot.pots, T = data.loot.tiers[P.tier], act = ctx.act || 1, out = [];
  const p = rng.int(T.pennies[0], T.pennies[1]) * act; if (p > 0) out.push({ kind: 'pennies', amount: p });
  if (rng.chance(P.scrapChance)) out.push({ kind: 'scrap', amount: rng.int(P.scrap[0], P.scrap[1]) });
  return out;
}
