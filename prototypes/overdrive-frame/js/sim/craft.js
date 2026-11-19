// The workshop: recipes known from the start, recipes shown locked until a rank, and secret recipes nobody sees until
// they're learned (a schematic from a crate, or an S grade). data/recipes.json lists them; this is every rule about
// them. Pure: changes the save object it's given and returns what it made.
import { makeRng } from './rng.js';
import { RARITY, RARITY_BY_ID, plainSpec } from './loadout.js';
import { newUid, rollLines, rollLine, poolFor, salvageValue } from './loot.js';
import { rollMods, modPool, MOD_COUNT } from './mods.js';
import { KIT_LEVELS, KIT_MAX } from './kit.js';

/** How a recipe looks to this pilot: 'ready' (usable), 'locked' (shown, with why), 'hidden' (secret, not learned). */
export function recipeState(r, save, rank) {
  if (r.state === 'secret') return save.learned?.includes(r.id) ? { state: 'ready' } : { state: 'hidden' };
  if (r.state === 'locked' && rank < (r.rank || 1)) return { state: 'locked', why: `Pilot rank ${r.rank}` };
  return { state: 'ready' };
}

export const COST_KEYS = ['scrap', 'alloy', 'exotic', 'chitin', 'siegeplate', 'credits'];   // boss materials: chitin (Broodmother), siege plate (Juggernaut)
export function canAfford(save, cost = {}) {
  for (const k of COST_KEYS) { const have = k === 'credits' ? save.credits : save.mats[k] || 0; if ((cost[k] || 0) > have) return false; }
  return true;
}
function pay(save, cost = {}) { for (const k of COST_KEYS) { if (k === 'credits') save.credits -= cost[k] || 0; else save.mats[k] -= cost[k] || 0; } }

/** Parts a fabricate recipe may build: ones the pilot has owned or seen at the dealer, in its slots. */
export function fabOptions(r, save, P) {
  const seen = new Set([...(save.seen || []), ...save.items.map(i => i.id)]);
  return [...seen].map(id => P[id]).filter(p => p && !p.crafted && r.slots.includes(p.slot));
}

/** Items an upgrade/refit recipe can work on. */
export function itemOptions(r, save) {
  if (r.type === 'upgrade') return save.items.filter(i => r.from.includes(i.rarity));
  if (r.type === 'refit') return save.items.filter(i => i.rolls?.length);
  if (r.type === 'remod') return save.items.filter(i => i.mods?.length);
  return [];
}

/**
 * Run a recipe. opts: fabricate { partId } · refit { uid, line } · upgrade { uid } · chip { chipId } · crafted {}.
 * @returns {{ ok: boolean, why?: string, item?: object, chip?: object, before?: object }}
 */
export function craft(save, r, opts, { P, CHIPS, rank, seed = Date.now() }) {
  const st = recipeState(r, save, rank); if (st.state !== 'ready') return { ok: false, why: st.why || 'Not learned yet.' };
  if (!canAfford(save, r.cost)) return { ok: false, why: 'Not enough materials.' };
  const R = makeRng(seed >>> 0);
  let out;
  if (r.type === 'fabricate') {
    const part = P[opts.partId]; if (!part || !r.slots.includes(part.slot)) return { ok: false, why: 'Pick a part.' };
    out = { item: { uid: newUid(R), id: part.id, rarity: r.rarity, rolls: rollLines(R, part, r.rarity), mods: rollMods(R, part, r.rarity, plainSpec), found: Date.now(), crafted: true } };
    save.items.push(out.item);
  } else if (r.type === 'crafted') {
    const part = P[r.makes]; if (!part) return { ok: false, why: 'Unknown part.' };
    out = { item: { uid: newUid(R), id: part.id, rarity: 'refined', rolls: rollLines(R, part, 'refined'), mods: rollMods(R, part, 'refined', plainSpec), found: Date.now(), crafted: true } };
    save.items.push(out.item);
  } else if (r.type === 'refit') {
    const it = save.items.find(i => i.uid === opts.uid); if (!it?.rolls?.length) return { ok: false, why: 'Pick a part with a bonus.' };
    const li = Math.max(0, Math.min(it.rolls.length - 1, opts.line | 0));
    const part = P[it.id], before = JSON.parse(JSON.stringify(it));
    const pool = poolFor(part).filter(l => !it.rolls.some((k, j) => j !== li && k.stat === l.stat));
    const step = Math.max(1, RARITY.findIndex(x => x.id === it.rarity));
    it.rolls[li] = rollLine(R, pool[Math.floor(R.next() * pool.length)], step);
    out = { item: it, before };
  } else if (r.type === 'upgrade') {
    const it = save.items.find(i => i.uid === opts.uid); if (!it || !r.from.includes(it.rarity)) return { ok: false, why: 'Pick a part to raise.' };
    const before = JSON.parse(JSON.stringify(it));
    const next = RARITY[RARITY.findIndex(x => x.id === it.rarity) + 1]; if (!next) return { ok: false, why: 'Already the best.' };
    it.rarity = next.id; it.rolls = rollLines(R, P[it.id], next.id, it.rolls);
    // a rarer part carries more mods (mods.js MOD_COUNT): keep the ones it has, add what the new rarity always brings
    const want = MOD_COUNT[next.id].filter(c => c >= 1).length, pool = modPool(P[it.id], plainSpec).filter(m => !(it.mods || []).includes(m.id));
    it.mods = (it.mods || []).slice(); while (it.mods.length < want && pool.length) it.mods.push(pool.splice(Math.floor(R.next() * pool.length), 1)[0].id);
    out = { item: it, before };
  } else if (r.type === 'remod') {
    const it = save.items.find(i => i.uid === opts.uid); if (!it?.mods?.length) return { ok: false, why: 'Pick a part with a mod.' };
    const li = Math.max(0, Math.min(it.mods.length - 1, opts.line | 0)), before = JSON.parse(JSON.stringify(it));
    const pool = modPool(P[it.id], plainSpec).filter(m => !it.mods.includes(m.id));
    if (!pool.length) return { ok: false, why: 'No other mod fits this part.' };
    it.mods = it.mods.slice(); it.mods[li] = pool[Math.floor(R.next() * pool.length)].id;
    out = { item: it, before };
  } else if (r.type === 'chip') {
    const c = CHIPS.find(x => x.id === opts.chipId); if (!c) return { ok: false, why: 'Pick a chip.' };
    if ((c.rank || 1) > rank) return { ok: false, why: `Needs pilot rank ${c.rank}.` };
    out = { chip: { uid: newUid(R), id: c.id } }; save.chips.push(out.chip);
  } else return { ok: false, why: 'Unknown recipe.' };
  pay(save, r.cost);
  return { ok: true, ...out };
}

/** Scrap a part for materials (refused if a saved build uses it — caller checks buildsUsing). */
export function salvage(save, uid, P) {
  const i = save.items.findIndex(x => x.uid === uid); if (i < 0) return null;
  const it = save.items[i], got = salvageValue(P[it.id], it);
  for (const k of Object.keys(got)) save.mats[k] = (save.mats[k] || 0) + got[k];
  save.items.splice(i, 1);
  return got;
}

/**
 * Learn secret recipes. from: { schematic: tier } (a crate's schematic learns one unlearned recipe whose schematic
 * tier ≤ it) or { grade, mission } (an S grade learns every recipe asking for it). Returns the recipes learned.
 */
export function learn(save, RECIPES, from, seed = 1) {
  save.learned ||= [];
  const secret = RECIPES.filter(r => r.state === 'secret' && !save.learned.includes(r.id));
  let got = [];
  if (from.schematic) {
    const list = secret.filter(r => r.learn?.schematic && r.learn.schematic <= from.schematic);
    if (list.length) got = [list[Math.floor(makeRng(seed).next() * list.length)]];
  }
  if (from.grade) got = got.concat(secret.filter(r => r.learn?.grade && r.learn.grade === from.grade && (!r.learn.mission || r.learn.mission === from.mission)));
  for (const r of got) save.learned.push(r.id);
  return got;
}

export { RARITY_BY_ID };

/** The repair kit's next Mk (kit.js KIT_LEVELS): pays its cost and raises save.kit. */
export function upgradeKit(save) {
  const lv = save.kit || 1; if (lv >= KIT_MAX) return { ok: false, why: 'Already Mk V.' };
  const next = KIT_LEVELS[lv];
  if (!canAfford(save, next.cost)) return { ok: false, why: 'Not enough credits or materials.' };
  pay(save, next.cost); save.kit = lv + 1;
  return { ok: true, kit: next };
}
