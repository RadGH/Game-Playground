// What the second-row pills explain when tapped (owner report #80, 2026-11-16: "It took me several minutes to realize I
// was low on power and water… it would be nice if I could click those pill buttons below the top bar to see more info
// for RCI, power, water"). Pure: reads the city, returns plain numbers and plain-language lines for ui/hud.js.
//   utilityStatus(r, 'power' | 'water') → supply vs use, a warning level (ok / near / over), what's cut off, what to build
//   demandInfo(r)                       → R / C / I demand with the reasons behind each
import { T } from './tuning.js';
import { cat, item, unlocked } from './catalog.js';
import { census, demand, targets, appeal, WORK_SHARE } from './city.js';
import { linkBoost } from './transit.js';

/** Use at or above this share of supply = "near the limit" (amber). Over 100% = red. */
export const NEAR_LIMIT = 0.85;
const ZONE_NAME = { R: 'Homes', C: 'Shops & offices', I: 'Industry' };
const tierName = l => ({ R: ['Habitat Pods', 'Terrace Homes', 'Apartment Block', 'Residential Tower'], C: ['Street Market', 'Shop Row', 'Hotel', 'Office Tower'], I: ['Fab Workshop', 'Logistics Depot'] }[l.zone]?.[l.tier - 1]);

/** ok | near | over | none — how close use is to supply. */
export function limitLevel(supply, use) {
  if (use <= 0) return supply > 0 ? 'ok' : 'none';
  if (use > supply + 1e-6) return 'over';
  return use >= supply * NEAR_LIMIT ? 'near' : 'ok';
}

/**
 * Power or water, for the pill and its sheet.
 * → { kind, supply, use, share, level, spare, cut: [{ name, why, count, x, z }], cutLines, cutCount, turretsOff, builds: [{ id, name, makes, cost, unlock, open }] }
 *   cut = buildings getting none or only part of what they need, grouped by name + problem (8 groups listed; cutLines =
 *   all groups, cutCount = all buildings).
 */
export function utilityStatus(r, kind) {
  const net = kind === 'power' ? (r.power || { supply: 0, demand: 0, share: 1 }) : (r.waterNet || { supply: 0, demand: 0, share: 1 });
  const supply = net.supply || 0, use = net.demand || 0, level = limitLevel(supply, use);
  const cut = [];
  for (const l of r.lots) {
    if (kind === 'power') {
      if ((l.power ?? 0) >= 0) continue;
      const p = l.powered ?? 0; if (p >= 0.999) continue;
      cut.push({ name: l.name || item(l.id)?.name || tierName(l) || 'Building', x: l.x, z: l.z, why: p <= 0 ? 'no power line reaches it' : `gets ${Math.round(p * 100)}% of its power` });
    } else {
      // zoned homes and shops above the first level, and buildings that use water
      const wants = (l.kind === 'zoned' && l.tier >= 2) || (l.water ?? 0) < 0; if (!wants) continue;
      const w = l.wet ?? 0; if (w >= 0.999) continue;
      cut.push({ name: l.name || item(l.id)?.name || tierName(l) || 'Building', x: l.x, z: l.z, why: w <= 0 ? 'no pipe reaches it' : `gets ${Math.round(w * 100)}% of its water` });
    }
  }
  const turretsOff = kind === 'power' ? r.turrets.filter(t => (t.powered ?? 1) < 0.999).length : 0;
  const key = kind === 'power' ? 'power' : 'water';
  const builds = (cat().build || []).filter(e => (e[key] ?? 0) > 0 && !e.unique)
    .map(e => ({ id: e.id, name: e.name, makes: e[key], cost: e.cost, unlock: e.unlock ?? 0, open: unlocked(r, e) }));
  // the same kind of building with the same problem is one line ("Habitat Pods ×11 — gets 89% of its power")
  const groups = new Map();
  for (const c of cut) { const k = `${c.name}|${c.why}`; const g = groups.get(k); if (g) g.count++; else groups.set(k, { ...c, count: 1 }); }
  const lines = [...groups.values()].sort((a, b) => b.count - a.count);
  return { kind, supply, use, share: supply > 0 ? Math.min(1, supply / Math.max(1e-6, use)) : (use ? 0 : 1), level, spare: supply - use, cut: lines.slice(0, 8), cutLines: lines.length, cutCount: cut.length, turretsOff, builds };
}

/**
 * Residential, Commercial and Industrial demand, with the reasons behind each (−1..1 like the meters).
 * → { R: { name, value, want, have, reasons: [text] }, C: …, I: … }
 */
export function demandInfo(r) {
  const dm = demand(r), t = targets(r), c = census(r), a = appeal(r), link = linkBoost(r), out = {};
  const taxLine = z => r.taxes[z] > 0.09 ? `Tax ${Math.round(r.taxes[z] * 1000) / 10}% is above 9%: it holds this zone back` : null;
  const workers = r.people.total * WORK_SHARE;
  const have = { R: c.homes, C: c.cjobs, I: c.ijobs };
  for (const z of ['R', 'C', 'I']) {
    const reasons = [];
    if (z === 'R') {
      reasons.push(c.homes > r.people.total ? `${c.homes - r.people.total} free homes now` : 'Every home is full');
      if (c.jobs > workers) reasons.push(`${Math.round(c.jobs - workers)} open jobs: people come for work`);
      if (a.parts.land >= 0.45) reasons.push('Good land value attracts newcomers');
      if (a.parts.power < 1) reasons.push('Short of power: fewer people want to move in');
      if (a.parts.water < 1) reasons.push('Short of water: fewer people want to move in');
    } else if (z === 'C') {
      reasons.push(`${r.people.total} residents want shops and offices nearby`);
    } else {
      reasons.push(`${Math.round(workers)} workers need jobs`);
      if (c.jobs < workers) reasons.push(`${Math.round(workers - c.jobs)} people have no job yet`);
    }
    if ((z === 'R' || z === 'C') && link[z] > 0) reasons.push(`Links to your other cities add ${Math.round(link[z] * 100)}%`);
    const tl = taxLine(z); if (tl) reasons.push(tl);
    if (dm[z] <= 0.02) reasons.push(z === 'R' ? 'Enough homes for now: grow jobs first' : 'Enough for now: grow the population first');
    out[z] = { name: ZONE_NAME[z], value: dm[z], want: t[z], have: have[z], reasons };
  }
  return out;
}
export { ZONE_NAME };
