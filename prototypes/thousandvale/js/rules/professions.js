// Thousandvale — PROFESSIONS rules (round 8, W9; stream P-core). Pure: no files, no DOM, no clock, no Math.random.
// Every roll takes `rng` (a function returning 0..1 — a room stream).
//
//   const P = createProfessions(numbers, content);
//     numbers = data/rules/professions.json           (every number: skill curve, tiers, quality, games, roles, tempering)
//     content = data/provinces/professions.json       (materials, node kinds, tools, recipes, skins — made by
//               tools/content-professions.mjs); may be null or partial: then nothing can be gathered and nothing throws.
//
// The ten professions: mining, logging, foraging, skinning, angling (gather) · smithing, outfitting, alchemy, cooking,
// tempering (make). ANGLING keeps its own rules (js/rules/fishing.js) and its own saved record; here it is only a row.
//
// What the server (js/sim/professions.js) does with this:
//   gather:  canGather -> gatherGame -> [the client plays] -> scoreGame/qualityOf -> gatherYield + xpFor + gain
//   make:    canCraft  -> craftGame  -> [the client plays] -> craftResult (materials out, goods / a gear order in) + xpFor + gain
//   temper:  temperQuote (js/rules/professions-temper.js does the item work)
//
// Choices made here (so nobody has to guess):
//   * Skill is a LEVEL 1..100 worked out from xp: level n -> n+1 costs xpBase + xpPerLevel x n.
//   * A node / recipe of tier T needs skill tiers[T].minSkill (1 / 25 / 50 / 75 / 90). Work more than `greyAfter` levels
//     under your skill teaches a quarter as much.
//   * A FAILED mini-game gives nothing, spends nothing (a node is not used up, materials stay) — except tempering, where a
//     miss spends the materials: that is its risk, and the item is never harmed.
//   * Crafted gear: you choose the base; its level is min(your level - levelLag, the tier's top level), never under 1; its
//     rarity rolls normal / magic / rare from the quality you played and your skill past the recipe. Never legendary.

import { makeGame, qualityOf, QUALITIES } from './professions-games.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const list = v => (Array.isArray(v) ? v : v == null ? [] : [v]);

export const GATHERING = Object.freeze(['mining', 'logging', 'foraging', 'skinning', 'angling']);
export const MAKING = Object.freeze(['smithing', 'outfitting', 'alchemy', 'cooking', 'tempering']);
export const PROFESSIONS = Object.freeze([...GATHERING, ...MAKING]);
export { QUALITIES };

export function createProfessions(numbers = {}, content = null) {
  const N = numbers || {}, C = content || {};
  const defs = PROFESSIONS.map(id => list(N.professions).find(p => p.id === id) || { id, name: id[0].toUpperCase() + id.slice(1), kind: GATHERING.includes(id) ? 'gather' : 'make' });
  const defById = new Map(defs.map(d => [d.id, d]));
  const S = { max: 100, xpBase: 20, xpPerLevel: 4, ranks: [[1, 'Novice']], ...(N.skill || {}) };
  const tiers = list(N.tiers).length ? list(N.tiers) : [{ tier: 1, minSkill: 1, levels: [1, 10] }];
  const Q = { min: {}, yield: { fail: 0, poor: 1, good: 2, fine: 3, perfect: 3 }, bonusChance: {}, xp: { fail: 0, poor: 0.5, good: 1, fine: 1.25, perfect: 1.5 }, name: {}, ...(N.quality || {}) };
  const G = { reach: 4.5, xpPerTier: 10, greyAfter: 40, greyMult: 0.25, respawnMin: [6, 10], starterRespawnMin: 2, ...(N.gather || {}) };
  const K = { xpPerTier: 12, refineXp: 0.5, levelLag: 1, feeShare: 0.06, batchMax: 10, rarity: {}, ...(N.craft || {}) };
  const materials = C.materials || {}, nodeKinds = C.nodeKinds || {}, classes = C.classes || {}, goods = C.goods || {};
  const tools = list(C.tools), recipes = list(C.recipes);
  const recipeById = new Map(recipes.map(r => [r.id, r]));
  const toolById = new Map(tools.map(t => [t.id, t]));

  // ---- skill ----
  const stepXp = level => S.xpBase + S.xpPerLevel * level;
  /** xp needed to stand at `level` (level 1 = 0). */
  function xpAt(level) { const n = clamp(level, 1, S.max) - 1; return S.xpBase * n + S.xpPerLevel * n * (n + 1) / 2; }
  function levelOf(xp) {
    let lv = 1;
    const x = Math.max(0, +xp || 0);
    while (lv < S.max && x >= xpAt(lv + 1)) lv++;
    return lv;
  }
  /** xp still to go to the next level (null at the top). */
  const next = (level, xp = xpAt(level)) => (level >= S.max ? null : Math.max(0, Math.ceil(xpAt(level + 1) - xp)));
  function rank(level) { let r = null; for (const [at, name] of S.ranks) if (level >= at) r = name; return r; }
  /** Add xp: `{ xp, level, next, up (levels gained) }`. */
  function gain(state, add) {
    const before = levelOf(state.xp || 0);
    const xp = Math.min(xpAt(S.max), Math.max(0, (+state.xp || 0) + Math.max(0, +add || 0)));
    const level = levelOf(xp);
    return { xp: Math.round(xp * 10) / 10, level, next: next(level, xp), up: level - before };
  }

  // ---- tiers ----
  const tier = t => tiers.find(x => x.tier === (t | 0)) || tiers[0];
  /** The best tier a skill may work. */
  function tierForSkill(skill) { let best = tiers[0]; for (const t of tiers) if (skill >= t.minSkill) best = t; return best; }
  /** The tier whose level band holds a monster / item level. */
  function tierForLevel(level) { let best = tiers[0]; for (const t of tiers) if (level >= t.levels[0]) best = t; return best; }

  // ---- items ----
  const material = id => materials[id] || null;
  /** A material as a bag item (`n` of it in one stack). */
  function item(id, n = 1) {
    const m = materials[id];
    if (!m) return null;
    return { kind: 'material', id: m.id, name: m.name, desc: m.desc || '', tier: m.tier || 1, prof: m.prof || null, icon: m.icon || 'ore', tint: m.tint || null,
      rarity: m.rarity || tier(m.tier).rarity || 'normal', price: m.price || 1, value: m.price || 1, count: Math.max(1, n | 0), stackMax: 50 };
  }
  const tool = id => toolById.get(id) || null;
  function toolItem(id) {
    const t = toolById.get(id);
    if (!t) return null;
    return { kind: 'good', tool: true, id: t.id, name: t.name, desc: t.desc || '', rarity: t.tier >= 3 ? 'magic' : 'normal', stack: 1, noStack: true, value: t.price || 1,
      use: { type: 'tool', prof: t.prof, tier: t.tier, ease: t.ease || 0, extra: t.extra || 0 } };
  }
  const isTool = (it, prof = null) => !!(it && it.use && it.use.type === 'tool' && (!prof || it.use.prof === prof));
  /** The best tool of a profession in a bag (highest tier), as `{ id, name, tier, ease, extra }`, or null. */
  function bestTool(bag, prof) {
    let best = null;
    for (const it of bag || []) if (isTool(it, prof) && (!best || (it.use.tier || 1) > best.tier)) best = { id: it.id, name: it.name, tier: it.use.tier || 1, ease: it.use.ease || 0, extra: it.use.extra || 0 };
    return best;
  }
  /** A made consumable (potion / good) exactly as the content file wrote it, or null. */
  const goodItem = id => (goods[id] ? { ...JSON.parse(JSON.stringify(goods[id])), stack: 1 } : null);

  const ease = (skill, need, tl = null) => clamp((skill - need) * ((N.ease && N.ease.perSkill) || 0.025) + ((tl && tl.ease) || 0), 0, 1);

  // ---- gathering ----
  const nodeKind = id => nodeKinds[id] || null;
  /**
   * May this character work this node? `node` = a node kind row (or `{prof, tier}` for a corpse).
   * -> `{ ok }` or `{ ok:false, why: 'notLearned'|'skill'|'tool', text, need? }`
   */
  function canGather({ known = true, skill = 1, node, tool: tl = undefined }) {
    const d = defById.get(node.prof) || { name: node.prof };
    if (!known) return { ok: false, why: 'notLearned', text: `You have not learned ${d.name}. A trainer in town teaches it.` };
    const t = tier(node.tier);
    if (skill < t.minSkill) return { ok: false, why: 'skill', need: t.minSkill, text: `That needs ${d.name} ${t.minSkill}. Yours is ${skill}.` };
    if (tl === null) return { ok: false, why: 'tool', text: `You need a ${toolWord(node.prof)}.` };
    return { ok: true };
  }
  const toolWord = prof => (defById.get(prof) && defById.get(prof).tool) || 'tool';
  /** The mini-game of a profession, eased by skill and tool. */
  function gameFor(prof, { skill = 1, need = 1, tool: tl = null, seed = 1, steps = null } = {}) {
    const d = defById.get(prof);
    if (!d) return null;
    return makeGame(d.game, { seed, ease: ease(skill, need, tl), base: (N.games || {})[d.game] || null, steps });
  }
  const gatherGame = ({ prof, tier: t = 1, skill = 1, tool: tl = null, seed = 1 }) => gameFor(prof, { skill, need: tier(t).minSkill, tool: tl, seed });
  /**
   * What a node gives for a quality: `[{ id, n }]`. The main material by `yield[quality]`; a better tool may add one
   * (`extra` chance); the kind's `bonus` (a gem, resin, a fang) by `bonusChance[quality]`.
   */
  function gatherYield({ node, quality = 'good', rng = () => 0.5, tool: tl = null, extra = 0 }) {
    const out = [];
    const n = Q.yield[quality] || 0;
    if (!n || !node) return out;
    const main = Array.isArray(node.gives) ? node.gives : [{ id: node.gives, n: 1 }];
    for (const g of main) {
      const k = Math.max(1, Math.round(n * (g.n || 1))) + (tl && tl.extra && rng() < tl.extra ? 1 : 0)
        + (extra > 0 && g === main[0] && rng() < extra ? 1 : 0);      // (stream C, round 9) gear: Forager's Covenant — `extra` = rules.gatherBonus(e), one more of the MAIN material
      if (materials[g.id]) out.push({ id: g.id, n: k });
    }
    if (node.bonus && materials[node.bonus] && rng() < (Q.bonusChance[quality] || 0)) out.push({ id: node.bonus, n: 1, bonus: true });
    return out;
  }
  /** Skill xp for one piece of work. `kind`: 'gather' | 'craft' | 'refine'. */
  function xpFor({ tier: t = 1, quality = 'good', skill = 1, kind = 'gather', mult = 1 }) {
    const per = kind === 'gather' ? G.xpPerTier : K.xpPerTier * (kind === 'refine' ? K.refineXp : 1);
    const grey = skill - tier(t).minSkill > G.greyAfter ? G.greyMult : 1;
    return Math.round(per * (t | 0 || 1) * (Q.xp[quality] ?? 1) * grey * mult * 10) / 10;
  }
  /** How long a spent node stays spent for the one who worked it (ms). `h` = 0..1 (a hash of the node, so it is steady). */
  const respawnMs = (node, h = 0.5) => Math.round(60000 * (node && node.starter ? G.starterRespawnMin : G.respawnMin[0] + clamp(h, 0, 1) * (G.respawnMin[1] - G.respawnMin[0])));
  /** What a dead monster of `type` at `level` gives a skinner: `{ prof:'skinning', tier, gives, bonus, name }` or null (not a beast). */
  function skinOf(type, level = 1) {
    const sk = C.skins || {};
    const row = sk.types && sk.types[type];
    if (!row) return null;
    const t = tierForLevel(level);
    const hide = (row.hide && materials[row.hide]) ? row.hide : (classes.hide || [])[Math.max(0, t.tier - 1 - (row.worn | 0))];      // (worn: the long dead give a hide one grade lower; `hide`: a beast with its own — Vharlen's salamanders, EXPANSION-1 §4.5)
    if (!hide) return null;
    return { prof: 'skinning', kind: 'corpse', tier: t.tier, name: row.name || type, gives: [{ id: hide, n: 0.5 }, ...(sk.meat && !row.noMeat ? [{ id: sk.meat, n: 0.34 }] : [])], bonus: row.bonus || sk.bonus || null };
  }

  /** Why a dead monster of `type` cannot be skinned, as one plain sentence — or null when it can (or the type is unknown). */
  const skinNone = type => { const sk = C.skins || {}; return (sk.types && sk.types[type]) ? null : (sk.none && sk.none[type]) || null; };      // the row: { name, why, person? }
  const skinRefusal = type => { const row = skinNone(type); return row ? row.why : null; };

  // ---- making ----
  const recipe = id => recipeById.get(id) || null;
  /** Bag -> how many of each material id it holds. */
  function countsOf(bag) {
    const c = {};
    for (const it of bag || []) if (it && it.kind === 'material') { const id = it.id; c[id] = (c[id] || 0) + Math.max(1, it.count | 0 || 1); }
    return c;
  }
  /** The gold a recipe costs to make (a share of a plain item's list price for gear; a fixed fee otherwise). */
  const feeOf = (rc, plainPrice = 0) => Math.max(0, Math.round(rc.gold != null ? rc.gold : rc.kind === 'gear' ? plainPrice * K.feeShare : 0));
  /** The level a gear recipe's item comes out at for a character of `level`. */
  function gearLevel(rc, level = 1) { const t = tier(rc.tier); return clamp((level | 0) - K.levelLag, 1, t.levels[1]); }
  /** The bases of a gear recipe a character may pick at `level`. */
  const basesFor = (rc, level = 1) => list(rc.bases).map(b => ({ ...b, can: (b.from || 1) <= Math.max(gearLevel(rc, level), 1) }));
  /**
   * May they make it? -> `{ ok }` or `{ ok:false, why: 'notLearned'|'skill'|'station'|'needs'|'gold'|'base', text, need? }`.
   * `station` = the profession ids the place they stand at serves (null = not checked).
   */
  function canCraft(rc, { known = true, skill = 1, counts = {}, gold = 0, fee = feeOf(rc), station = null, level = 1, base = null } = {}) {
    const d = defById.get(rc.prof) || { name: rc.prof };
    if (!known) return { ok: false, why: 'notLearned', text: `You have not learned ${d.name}.` };
    if (skill < (rc.skill || 1)) return { ok: false, why: 'skill', need: rc.skill, text: `Needs ${d.name} ${rc.skill}. Yours is ${skill}.` };
    if (station && !station.includes(rc.prof)) return { ok: false, why: 'station', text: `You need ${(N.stationNames || {})[rc.prof] || 'a workplace'}: ${(N.stationHint || {})[rc.prof] || 'in town'}.` };
    for (const nd of rc.needs || []) if ((counts[nd.id] || 0) < nd.n) { const m = materials[nd.id]; return { ok: false, why: 'needs', text: `You need ${nd.n} ${m ? m.name : nd.id} (you have ${counts[nd.id] || 0}).` }; }
    if (gold < fee) return { ok: false, why: 'gold', text: `That costs ${fee} gold.` };
    if (rc.kind === 'gear') {
      const bs = basesFor(rc, level).filter(b => b.can);
      if (!bs.length) return { ok: false, why: 'base', text: 'You are not high enough in level for any pattern of this kind yet.' };
      if (base && !bs.some(b => b.key === base)) return { ok: false, why: 'base', text: 'You cannot make that pattern yet.' };
    }
    return { ok: true };
  }
  const craftGame = (rc, { skill = 1, tool: tl = null, seed = 1 } = {}) => gameFor(rc.prof, { skill, need: rc.skill || 1, tool: tl, seed, steps: rc.steps || null });
  /** Crafted gear's rarity for a quality and a skill surplus. */
  function rarityFor({ quality = 'good', skill = 1, need = 1, rng = () => 0.5 }) {
    const R = K.rarity || {};
    const sur = clamp(skill - need, 0, R.maxSurplus ?? 30);
    const pr = ((R.rare || {})[quality] || 0), pm = ((R.magic || {})[quality] || 0);
    const rare = pr > 0 ? pr + sur * ((R.perSkill || {}).rare || 0) : 0;
    const magic = pm > 0 ? pm + sur * ((R.perSkill || {}).magic || 0) : 0;
    const x = rng();
    return x < rare ? 'rare' : x < rare + magic ? 'magic' : 'normal';
  }
  /**
   * What a finished craft makes. -> `{ items: [bag items], gear: {base, rarity, level, extraAffix}|null, n }`.
   * A material / good recipe makes `makes.n` (a perfect game may add ONE — `bonus: false` for the rest of a batch); a gear recipe returns the ORDER for the
   * rules' item maker (the server calls it). A failed game makes nothing (the server takes nothing).
   */
  function craftResult(rc, { quality = 'good', skill = 1, level = 1, base = null, rng = () => 0.5, bonus = true } = {}) {
    if (quality === 'fail') return { items: [], gear: null, n: 0 };
    if (rc.kind === 'gear') {
      const bs = basesFor(rc, level).filter(b => b.can);
      const pick = bs.find(b => b.key === base) || bs[0] || null;
      if (!pick) return { items: [], gear: null, n: 0 };
      const rarity = rarityFor({ quality, skill, need: rc.skill || 1, rng });
      const ex = ((K.rarity || {}).extraAffix || {})[quality] || 0;
      return { items: [], n: 1, gear: { base: pick.key, rarity, level: gearLevel(rc, level), extraAffix: rarity === 'magic' && rng() < ex } };
    }
    const mk = rc.makes || {};
    const n = (mk.n || 1) + (bonus && quality === 'perfect' && rc.bonusOnPerfect !== false && rng() < (rc.kind === 'material' ? 0.5 : 0.25) ? 1 : 0);
    let it = null;
    if (rc.kind === 'material') it = item(mk.id, n);
    else if (rc.kind === 'tool') it = toolItem(mk.id);
    else { it = goodItem(mk.id); if (it) it.count = n; }
    return { items: it ? [it] : [], gear: null, n: it ? (rc.kind === 'tool' ? 1 : n) : 0 };
  }
  /** One recipe as the client's list row. */
  function recipeView(rc, { known = true, skill = 1, counts = {}, gold = 0, plainPrice = 0, station = null, level = 1 } = {}) {
    const fee = feeOf(rc, plainPrice);
    const can = canCraft(rc, { known, skill, counts, gold, fee, station, level });
    const mk = rc.makes || null;
    const made = mk ? (materials[mk.id] || goods[mk.id] || toolById.get(mk.id) || {}) : null;
    return { id: rc.id, prof: rc.prof, tier: rc.tier || 1, skill: rc.skill || 1, name: rc.name, desc: rc.desc || '', kind: rc.kind, can: !!can.ok, ...(can.ok ? {} : { why: can.text, code: can.why }),
      needs: (rc.needs || []).map(nd => ({ id: nd.id, name: (materials[nd.id] || {}).name || nd.id, n: nd.n, have: counts[nd.id] || 0 })), gold: fee,
      makes: mk ? { id: mk.id, name: made.name || rc.name, n: mk.n || 1, text: made.desc || '' } : null,
      ...(rc.kind === 'gear' ? { bases: basesFor(rc, level), level: gearLevel(rc, level), levels: tier(rc.tier).levels } : {}),
      game: (defById.get(rc.prof) || {}).game || null };
  }

  return {
    N, C, list: defs, def: id => defById.get(id) || null, tiers, tier, tierForSkill, tierForLevel, maxLevel: S.max,
    levelOf, xpAt, next, rank, gain, ease,
    materials, material, item, tools, tool, toolItem, isTool, bestTool, goodItem, classes,
    nodeKinds, nodeKind, canGather, gatherGame, gatherYield, xpFor, respawnMs, skinOf, skinRefusal, skinNone, toolWord,
    recipes, recipe, countsOf, feeOf, gearLevel, basesFor, canCraft, craftGame, rarityFor, craftResult, recipeView, gameFor,
    qualityOf: score => qualityOf(score, Q.min), qualityName: q => Q.name[q] || q,
    roles: N.roles || {}, roleOf: role => (N.roles && N.roles[role] && typeof N.roles[role] === 'object' ? N.roles[role] : null),
    gatherNumbers: G, craftNumbers: K, temper: N.temper || { ops: {} },
  };
}
