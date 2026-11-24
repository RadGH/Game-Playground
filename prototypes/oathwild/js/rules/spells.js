// Oathwild — the spell catalogue: reused Farhold/Thousandvale rows + Oathwild's own, with ranks
// and modifiers. Pure. The ONE reader of data/spells.json.
//
//   buildCatalog(rules)                        { id: { id, source, base, ranks, dropped } } (engine.js calls it)
//   spellRow(rules, id, { rank, mods, bonusSeconds })  the row a cast uses: rank + owned modifiers applied
//   maxRankOf(rules, id)                       how many ranks a spell has
//   targetKind(row)                            'bolt' | 'ground' | 'cone' | 'line' | 'self' | 'beam'
//   powerFrom(row, { ranged })                 'melee' | 'ranged' | 'spell' | 'heal' | 'blend' | 'blendRanged' | null
//   hasEffect(row)                             false for a row that would do nothing (a test guards it)
//   rowScore(row)                              one number that grows with every rank (a test guards it)
//   SUPPORTED                                  the fields the round-1 sim runs; anything else is dropped

/** Fields js/rules/combat.js and js/rules/describe.js read. Everything else on a borrowed row is dropped at load. */
export const SUPPORTED = Object.freeze(new Set([
  'name', 'shape', 'element', 'school', 'powerFrom', 'mult', 'reach', 'arc', 'range', 'radius', 'splash', 'width',
  'cooldown', 'mp', 'status', 'statuses', 'statusMult', 'stack', 'repeats', 'repeatEvery', 'delay', 'knock', 'taunt',
  'onHit', 'heal', 'healPower', 'leech', 'allies', 'target', 'buffs', 'selfBuff', 'place', 'ricochet', 'projectiles',
  'spread', 'pierce', 'pet', 'count', 'summon', 'dash', 'pullIn', 'barrier', 'hpCost', 'form', 'revive', 'channel',
  'execute', 'pen', 'critBonus', 'petPower', 'bonusSeconds', 'statusStrength',
]));
/** Sub-fields kept inside the nested blocks (the rest is dropped the same way). */
const SUB = {
  onHit: ['taunt', 'heal', 'healAllies'],
  knock: ['stagger', 'push'],
  taunt: ['radius', 'seconds'],
  place: ['kind', 'seconds', 'radius', 'every', 'strike', 'heal', 'debuff', 'buff', 'follow'],
  summon: ['def', 'count', 'lifetime', 'temporary', 'name'],
  dash: ['range', 'to'],
  pullIn: ['metres', 'to'],
  barrier: ['share', 'seconds'],
  revive: ['share'],
  channel: ['seconds', 'every'],
  execute: ['below', 'mult'],
  ricochet: ['bounces', 'range', 'keep'],
  selfBuff: ['name', 'seconds', 'damage', 'resist', 'haste', 'move', 'armor', 'dealLess', 'takeMore', 'healPerSecond'],
  form: ['id', 'name', 'group', 'toggle', 'seconds', 'body', 'stats', 'basic', 'pack'],
};
const FORM_STATS = ['armorPct', 'maxHpPct', 'movePct', 'hastePct', 'thorns'];
const BUFF_FIELDS = ['damage', 'resist', 'haste', 'move', 'armor', 'dealLess', 'takeMore', 'healPerSecond', 'slow'];

/** Farhold's shapes -> the targeting kinds the client draws (ARCH.md "Spell targeting"). */
export const SHAPE_KIND = Object.freeze({ bolt: 'bolt', ground: 'ground', melee: 'cone', around: 'self', beam: 'line', dash: 'line', self: 'self', summon: 'self' });

const clone = o => (o == null ? o : structuredClone(o));

function sourceRow(rules, id, entry) {
  const d = rules.data;
  const tvClassSkills = d.tvClasses?.skills || {};
  if (entry.shape) return { row: clone(entry), source: 'oathwild' };
  const [src, srcId] = entry.from ? entry.from.split(':') : [null, id];
  const tryF = () => d.skills.skills[srcId] && { row: clone(d.skills.skills[srcId]), source: `farhold:${srcId}` };
  const tryT = () => d.tvSkills?.add?.[srcId] && { row: clone(d.tvSkills.add[srcId]), source: `thousandvale:${srcId}` };
  const tryC = () => tvClassSkills[srcId] && { row: clone(tvClassSkills[srcId]), source: `thousandvale:${srcId}` };
  const found = src === 'farhold' ? tryF() : src === 'tv' ? (tryT() || tryC()) : (tryF() || tryT() || tryC());
  if (!found) throw new Error(`oathwild spells: "${id}" has no row (from ${entry.from || 'its own id'})`);
  return found;
}

/** Lay `set` over a row: null removes, objects replace. */
function applySet(row, set) {
  for (const [k, v] of Object.entries(set || {})) {
    if (v === null) delete row[k];
    else row[k] = clone(v);
  }
  return row;
}

/** Drop what the sim does not run; returns the dropped field names. */
function dropUnsupported(row) {
  const dropped = [];
  for (const k of Object.keys(row)) {
    if (!SUPPORTED.has(k)) { dropped.push(k); delete row[k]; continue; }
    const keep = SUB[k];
    if (keep && row[k] && typeof row[k] === 'object' && !Array.isArray(row[k])) {
      for (const sk of Object.keys(row[k])) if (!keep.includes(sk)) { dropped.push(`${k}.${sk}`); delete row[k][sk]; }
    }
  }
  // the form block keeps its own shape
  if (row.form) {
    if (row.form.stats) for (const s of Object.keys(row.form.stats)) if (!FORM_STATS.includes(s)) { dropped.push(`form.stats.${s}`); delete row.form.stats[s]; }
    if (row.form.basic) for (const s of Object.keys(row.form.basic)) if (!['shape', 'reach', 'arc', 'range', 'mult', 'hits', 'element', 'status', 'splash'].includes(s)) { dropped.push(`form.basic.${s}`); delete row.form.basic[s]; }
    if (row.form.body) row.form.body = { creature: row.form.body.creature, scale: row.form.body.scale ?? 1 };
  }
  if (row.selfBuff) {
    // Farhold spells a few buff fields in shares of a stat; the status vocabulary (skills.js buffsOf) wants these
    if (row.selfBuff.movePct != null) { row.selfBuff.move = row.selfBuff.movePct; delete row.selfBuff.movePct; }
    if (row.selfBuff.hastePct != null) { row.selfBuff.haste = row.selfBuff.hastePct; delete row.selfBuff.hastePct; }
    const has = BUFF_FIELDS.some(f => row.selfBuff[f]);
    if (!has) { dropped.push('selfBuff'); delete row.selfBuff; }
  }
  if (row.onHit && !Object.keys(row.onHit).length) delete row.onHit;
  if (row.place) {
    if (row.place.strike) row.place.strike = { mult: row.place.strike.mult, targets: row.place.strike.targets ?? 8, ...(row.place.strike.status ? { status: row.place.strike.status } : {}) };
    const p = row.place;
    if (!p.strike && !p.heal && !p.debuff && !p.buff) { dropped.push('place'); delete row.place; }
  }
  return dropped;
}

/**
 * Turn the spellings into one shape: `repeats` a number with `repeatEvery`; statuses one list
 * `applies: [{ id, over, stackMax? }]`; a status `stack` becomes an applied status that stacks.
 */
function finalise(row) {
  if (row.repeats && typeof row.repeats === 'object') {
    row.repeatEvery = row.repeats.every ?? row.repeatEvery ?? 0.5;
    row.repeats = row.repeats.count ?? 1;
  }
  if (row.repeats && !row.repeatEvery) row.repeatEvery = 0.5;
  const applies = [];
  const push = (entry) => {
    if (!entry) return;
    const e = typeof entry === 'string' ? { id: entry } : { ...entry };
    const id = e.id; delete e.id;
    const at = applies.findIndex(a => a.id === id);
    const next = { id, over: e };
    if (at >= 0) applies[at] = { ...applies[at], over: { ...applies[at].over, ...e } }; else applies.push(next);
  };
  push(row.status);
  for (const s of row.statuses || []) push(s);
  if (row.stack?.status) {
    push({ id: row.stack.status });
    const a = applies.find(x => x.id === row.stack.status);
    a.stackMax = row.stack.max || 3;
  }
  delete row.status; delete row.statuses; delete row.stack;
  row.applies = applies;
  return row;
}

export function buildCatalog(rules) {
  const out = {};
  const cfg = rules.data.spells;
  for (const [id, entry] of Object.entries(cfg.spells)) {
    const { row, source } = sourceRow(rules, id, entry);
    delete row.ranks;
    applySet(row, entry.set);
    delete row.desc; delete row.talents; delete row.forms; delete row.tv;
    const dropped = dropUnsupported(row);
    out[id] = {
      id, source, dropped,
      base: row,
      ranks: clone(entry.ranks || cfg.defaultRanks),
    };
  }
  return out;
}

export const maxRankOf = (rules, id) => rules.spells[id]?.ranks.length || 0;

/** Scale everything a spell does by `p` (damage, heals, barriers, summons) — buffs grow by half as much. */
function scalePower(row, p) {
  if (!(p > 0) || p === 1) return;
  const half = 1 + (p - 1) / 2;
  for (const k of ['mult', 'heal', 'healPower', 'leech']) if (typeof row[k] === 'number') row[k] *= p;
  if (row.barrier) row.barrier.share *= p;
  if (row.revive) row.revive.share = Math.min(1, row.revive.share * p);
  if (row.place?.strike) row.place.strike.mult *= p;
  if (typeof row.place?.heal === 'number') row.place.heal *= p;
  if (row.onHit?.heal) row.onHit.heal *= p;
  if (row.onHit?.healAllies) row.onHit.healAllies *= p;
  if (row.pet || row.summon) row.petPower = (row.petPower || 1) * p;
  if (row.form?.basic?.mult) row.form.basic.mult *= p;
  if (row.form?.stats) for (const s of Object.keys(row.form.stats)) if (row.form.stats[s] > 0) row.form.stats[s] *= half;   // a shape's drawbacks do not grow with rank
  if (row.selfBuff) for (const f of BUFF_FIELDS) if (row.selfBuff[f] > 0) row.selfBuff[f] *= half;
  for (const b of row.buffs || []) for (const f of BUFF_FIELDS) if (b[f] > 0) b[f] *= half;
  if (row.place?.debuff) for (const f of BUFF_FIELDS) if (typeof row.place.debuff[f] === 'number') row.place.debuff[f] *= half;
  // a status-only spell (no damage share) gets stronger statuses
  if (!row.mult) row.statusStrength = (row.statusStrength || 1) * half;
}

/** `add`: numbers add to what is there, lists join, objects merge field by field. */
function applyAdd(row, add) {
  for (const [k, v] of Object.entries(add || {})) {
    if (k === 'seconds') { row.bonusSeconds = (row.bonusSeconds || 0) + v; continue; }
    if (typeof v === 'number') {
      const base = row[k] ?? (k === 'projectiles' ? 1 : 0);
      row[k] = base + v;
    } else if (Array.isArray(v)) {
      row[k] = [...(Array.isArray(row[k]) ? row[k] : row[k] ? [row[k]] : []), ...clone(v)];
    } else if (v && typeof v === 'object') {
      row[k] = deepMerge(row[k] && typeof row[k] === 'object' ? row[k] : {}, v);
    } else {
      // a status id string adds to the statuses list; anything else is set
      if (k === 'status' && row.status) row.statuses = [...(row.statuses || []), v];
      else row[k] = v;
    }
  }
}
function deepMerge(a, b) {
  const o = clone(a);
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' ? deepMerge(o[k], v) : clone(v);
  return o;
}

/**
 * The row a cast uses at `rank`, with the owned modifier nodes (`mods`: [{ name, change }]) laid on.
 * Ranks apply in order (rank 3 = rank 2's changes and then rank 3's), then modifiers.
 */
export function spellRow(rules, id, { rank = 1, mods = [] } = {}) {
  const cat = rules.spells[id];
  if (!cat) return null;
  const row = clone(cat.base);
  const r = Math.max(1, Math.min(cat.ranks.length, rank));
  const baseMp = row.mp || 0, baseCd = row.cooldown || 0;
  let mpK = 1, cdK = 1, p = 1;
  for (let i = 1; i < r; i++) {
    const step = cat.ranks[i] || {};
    // power and mana are given as the total for that rank, relative to rank 1
    p = step.power ?? p;
    mpK = step.mp ?? mpK;
    cdK = step.cooldown ?? cdK;
    if (step.seconds) row.bonusSeconds = step.seconds;
    if (step.add) applyAdd(row, step.add);
  }
  scalePower(row, p);
  row.mp = Math.round(baseMp * mpK);
  row.cooldown = Math.round(baseCd * cdK * 10) / 10;
  const modNames = [];
  for (const m of mods) {
    const ch = m.change || {};
    if (ch.mult) scalePower(row, ch.mult);
    if (ch.add) applyAdd(row, ch.add);
    if (ch.set) applySet(row, ch.set);
    modNames.push(m.name);
  }
  dropUnsupported(row);
  finalise(row);
  row.id = id;
  row.rank = r;
  row.maxRank = cat.ranks.length;
  row.mods = modNames;
  return row;
}

export const targetKind = row => (row?.channel ? 'beam' : SHAPE_KIND[row?.shape] || 'self');

/** Where a spell's numbers come from. `ranged`: the caster holds a bow/crossbow. */
export function powerFrom(row, { ranged = false } = {}) {
  if (!row) return null;
  if (row.powerFrom) return row.powerFrom === 'weapon' ? (ranged ? 'ranged' : 'melee') : row.powerFrom;
  if (row.healPower) return 'heal';
  if (!row.mult && !row.form?.basic?.mult && !row.place?.strike) return row.heal || row.place?.heal ? 'heal' : null;
  if ((row.element || 'physical') === 'physical') return ranged && row.shape === 'bolt' ? 'ranged' : 'melee';
  return 'spell';
}

/** Does this row do anything the sim runs? */
export function hasEffect(row) {
  if (!row) return false;
  return !!(row.mult || row.heal || row.healPower || row.applies?.length || row.selfBuff || row.buffs?.length
    || row.place || row.pet || row.summon || row.form || row.barrier || row.revive || row.taunt || row.dash);
}

/** One number that must grow with every rank (damage, healing, protection, summons, buff strength). */
export function rowScore(row) {
  if (!row) return 0;
  const hits = (row.repeats || 1) * (row.projectiles || 1);
  let s = (row.mult || 0) * hits * 100;
  s += (row.heal || 0) * 100 + (row.healPower || 0) * 50 + (row.leech || 0) * 50;
  s += (row.barrier?.share || 0) * 100 + (row.revive?.share || 0) * 100;
  if (row.place) s += ((row.place.strike?.mult || 0) * 100 + (row.place.heal || 0) * 500) * ((row.place.seconds || 1) / (row.place.every || 1));
  s += (row.petPower || 0) * 50 * (row.count || row.summon?.count || 1);
  if (row.form) s += (row.form.basic?.mult || 0) * 100 + Object.values(row.form.stats || {}).reduce((a, b) => a + Math.abs(b), 0) * 100;
  const buffs = [...(row.buffs || []), ...(row.selfBuff ? [row.selfBuff] : [])];
  for (const b of buffs) for (const f of BUFF_FIELDS) s += Math.abs(b[f] || 0) * 100 * ((b.seconds || 6) + (row.bonusSeconds || 0)) / 6;
  for (const b of [row.place?.debuff, row.place?.buff].filter(Boolean)) for (const f of BUFF_FIELDS) s += Math.abs(b[f] || 0) * 100;
  s += (row.statusStrength || 1) * (row.applies?.length || 0) * 10 + (row.bonusSeconds || 0) * 5;
  s += (row.applies?.length || 0) + (row.pierce || 0) + (row.critBonus || 0);
  return s;
}
