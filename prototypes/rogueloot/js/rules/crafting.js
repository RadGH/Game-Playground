// Crafting (M17, ruling 9): PoE-style currency SHARDS designed by Fable (data/currency.json, docs/ITEMS.md §crafting).
// Pure. A shard item: { uid, base: 'shard', shard: '<id>', grade: 1-4, n }; dust: { uid, base: 'dust', n }.
// The one rule that keeps low materials from making a low-level hero "set for life":
//   rollIlvl = min(item.ilvl, grade.rollCap) — a shard never rolls above its own grade or above the item's level.
import { addAffix, pickTier, RARITIES, makeItem } from './items.js';

export const isShard = it => it?.base === 'shard';
export const isDust = it => it?.base === 'dust';
export const isCurrency = it => isShard(it) || isDust(it);
export const shardName = (C, it) => isDust(it) ? `Shard Dust${it.n > 1 ? ` ×${it.n}` : ''}` : `${C.grades[it.grade - 1]?.name || ''} ${C.shards.find(s => s.id === it.shard)?.name || it.shard}${it.n > 1 ? ` ×${it.n}` : ''}`;
const newId = rng => 'c' + Math.floor(rng() * 2 ** 31).toString(36);
export function makeShard(rng, shard, grade, n = 1) { return { uid: newId(rng), base: 'shard', shard, grade, n }; }
export function makeDust(rng, n) { return { uid: newId(rng), base: 'dust', n }; }
/** The grade whose item-level range holds a level (area level for drops, item level for salvage). */
export const gradeFor = (C, L) => (C.grades.find(g => L >= g.ilvlMin && L <= g.ilvlMax) || C.grades[C.grades.length - 1]).grade;
const pickW = (rng, entries) => { const tot = entries.reduce((s, [, w]) => s + w, 0); let k = rng() * tot; for (const [v, w] of entries) { k -= w; if (k <= 0) return v; } return entries[entries.length - 1][0]; };
const kw = (keys, L) => { if (L <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (L <= keys[i][0]) { const a = keys[i - 1], b = keys[i]; return a[1] + (b[1] - a[1]) * (L - a[0]) / (b[0] - a[0]); } return keys[keys.length - 1][1]; };

/** Does a kill (or chest) drop a shard for one player? */
export function currencyDrop(C, rng, level, kind = 'normal') {
  const D = C.drop || {}, chance = kw(D.chancePct || [[1, 5]], level) * (D.rankMult?.[kind] ?? 1);
  if (rng() * 100 < (D.dustChancePct || 0)) return makeDust(rng, 1 + Math.floor(rng() * 3));
  if (rng() * 100 >= chance) return null;
  const pool = C.shards.filter(s => (s.fromAreaLevel || 1) <= level).map(s => [s.id, s.dropWeight || 10]);
  if (!pool.length) return null;
  let grade = gradeFor(C, level); const next = C.grades[grade];
  if (next && level >= next.dropAreaMin && rng() * 100 < (D.earlyGradePct || 0)) grade = next.grade;
  return makeShard(rng, pickW(rng, pool), grade, 1);
}

const rarityIdx = r => RARITIES.indexOf(r);
const targets = (rule, it) => [].concat(rule.target || ['normal', 'magic', 'rare', 'unique', 'legendary']).includes(it.rarity);
/** Apply a shard to an item. -> { item } | { err } (pure: returns a new item). */
export function applyShard(data, C, rng, it, shardIt) {
  const S = C.shards.find(s => s.id === shardIt.shard); if (!S) return { err: 'Unknown shard.' };
  const grade = C.grades[shardIt.grade - 1]; if (!grade) return { err: 'Unknown grade.' };
  if (!data.bases[it.base]) return { err: 'That cannot be shaped.' };
  if (it.ided === false) return { err: 'Identify it first.' };
  const R = S.rule || {}, rollIlvl = Math.min(it.ilvl, grade.rollCap);
  if (R.quality) { if (it.quality >= (R.qualityMax || 20)) return { err: 'It is as fine as it gets.' }; return { item: { ...it, quality: Math.min(R.qualityMax || 20, (it.quality || 0) + R.quality) } }; }
  if (R.lock) { if (!it.affixes?.length) return { err: 'Nothing to anchor.' }; return { item: { ...it, anchor: it.affixes[Math.floor(rng() * it.affixes.length)].id } }; }
  if (!targets(R, it)) return { err: `This works on ${[].concat(R.target).join(' or ')} items.` };
  if ((it.rarity === 'unique' || it.rarity === 'legendary') && R.result) return { err: 'Uniques and legendaries cannot be reshaped.' };
  let out = { ...it, affixes: [...(it.affixes || [])] };
  const fill = (n, keep = []) => { out.affixes = keep; for (let i = 0; i < n; i++) if (!addAffix(data, rng, out, { maxIlvl: rollIlvl })) break; };
  const count = r => r === 'magic' ? (rng() < 0.6 ? 1 : 2) : pickW(rng, [[3, 60], [4, 30], [5, rollIlvl >= 10 ? 18 : 9], [6, rollIlvl >= 10 ? 7 : 1]]);
  const anchored = () => (out.anchor ? out.affixes.filter(a => a.id === out.anchor) : []);
  if (R.result && typeof R.result === 'object') {                                   // Wager: a random rarity
    const r = pickW(rng, Object.entries(R.result));
    const made = makeItem(data, rng, it.ilvl, { base: it.base, rarity: r });
    if (r === 'unique' && made.rarity !== 'unique') return { item: { ...made, ided: true, quality: it.quality, uid: it.uid } };
    return { item: { ...made, ided: true, quality: it.quality, uid: it.uid } };
  }
  if (R.reroll === 'all') { const keep = anchored(); out.rarity = R.result || out.rarity; fill(count(out.rarity) - keep.length, keep); delete out.anchor; }
  else if (R.reroll === 'values') { out.affixes = out.affixes.map(a => { const t = data.aff[a.id]?.tiers.find(x => x.tier === a.tier); return t ? { ...a, v: t.min === t.max ? t.min : Math.round(t.min + rng() * (t.max - t.min)) } : a; }); if (out.uv && out.unique) { const u = data.uniques[out.unique]; out.uv = (u?.stats || []).map(s => s.min === s.max ? s.min : Math.round(s.min + rng() * (s.max - s.min))); } }
  else if (R.result === 'normal') { out = { ...out, rarity: 'normal', affixes: [] }; delete out.name; delete out.anchor; }
  else if (R.result === 'magic' && it.rarity === 'normal') { out.rarity = 'magic'; fill(count('magic')); }
  else if (R.result === 'rare' && it.rarity === 'magic') { out.rarity = 'rare'; out.name ||= rareName(rng); for (let i = 0; i < (R.add || 1); i++) addAffix(data, rng, out, { maxIlvl: rollIlvl }); }
  else if (R.add) {
    if (R.requires === 'affixCount == 1' && out.affixes.length !== 1) return { err: 'Only on a magic item with one property.' };
    if (R.requires === 'affixCount < 6' && out.affixes.length >= 6) return { err: 'It already holds six properties.' };
    if (!addAffix(data, rng, out, { maxIlvl: rollIlvl })) return { err: 'There is no room for another property.' };
  } else if (R.remove) {
    const can = out.affixes.filter(a => a.id !== out.anchor); if (!can.length) return { err: 'Nothing to remove.' };
    const gone = can[Math.floor(rng() * can.length)]; out.affixes = out.affixes.filter(a => a !== gone);
    if (out.rarity === 'magic' && !out.affixes.length) out.rarity = 'normal';
  } else return { err: 'That does nothing to this item.' };
  if (out.rarity === 'rare' && !out.name) out.name = rareName(rng);
  return { item: out };
}
const RA = ['Grim', 'Dusk', 'Storm', 'Bitter', 'Raven', 'Iron', 'Thorn', 'Ash', 'Bone', 'Gale', 'Brine', 'Moss', 'Rune', 'Vigil', 'Wild'];
const RB = ['bite', 'brand', 'song', 'fang', 'ward', 'mark', 'grasp', 'gaze', 'heart', 'crest', 'spur', 'knot', 'edge', 'hold', 'tide'];
const rareName = rng => RA[Math.floor(rng() * RA.length)] + RB[Math.floor(rng() * RB.length)];

/** Break an item into dust and shards (graded by ITEM level). -> { dust, shards: [{ shard, grade, n }] } */
export function salvageYield(C, rng, it) {
  const S = C.salvage?.byRarity?.[it.rarity] || C.salvage?.byRarity?.normal || { dust: [1, 2], shards: [0, 0] };
  const roll = ([a, b]) => a + Math.floor(rng() * (b - a + 1));
  const grade = gradeFor(C, it.ilvl), out = { dust: roll(S.dust || [1, 1]), shards: [] };
  const n = roll(S.shards || [0, 0]);
  for (let i = 0; i < n && S.pick; i++) out.shards.push({ shard: pickW(rng, Object.entries(S.pick)), grade, n: 1 });
  if (S.guaranteed) for (const g of [].concat(S.guaranteed)) out.shards.push({ shard: g, grade, n: 1 });
  return out;
}
/** Stack currency into a bag list (same shard + grade, up to the stack size), then new cells. */
export function stackInto(C, list, it) {
  const max = isDust(it) ? (C.dust?.stack || 200) : (C.shards.find(s => s.id === it.shard)?.stack || 50);
  let n = it.n; const out = list.map(x => ({ ...x }));
  for (const x of out) { if (!n) break; if (x.base === it.base && x.shard === it.shard && x.grade === it.grade && x.n < max) { const k = Math.min(n, max - x.n); x.n += k; n -= k; } }
  return { list: out, rest: n ? { ...it, n } : null };
}
export function checkCurrency(C, it) {
  if (isDust(it)) return Number.isInteger(it.n) && it.n >= 1 && it.n <= (C.dust?.stack || 200) ? { ok: true } : { ok: false, why: 'dust stack' };
  const S = C.shards.find(s => s.id === it.shard);
  if (!S) return { ok: false, why: 'unknown shard' };
  if (!(it.grade >= 1 && it.grade <= C.grades.length)) return { ok: false, why: 'shard grade' };
  if (!(Number.isInteger(it.n) && it.n >= 1 && it.n <= (S.stack || 50))) return { ok: false, why: 'shard stack' };
  return { ok: true };
}
void rarityIdx; void pickTier;
