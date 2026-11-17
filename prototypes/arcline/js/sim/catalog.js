// The catalog (data/catalog.json) loaded once: lookups by id, the zone growth tables, unlock checks.
let C = null;
export function useCatalog(json) { C = json; C.byId = Object.fromEntries(C.build.map(b => [b.id, b])); C.roadById = Object.fromEntries(C.roads.map((r, i) => [r.id, { ...r, level: i + 1 }])); return C; }
export function cat() { if (!C) throw new Error('catalog not loaded'); return C; }
export function item(id) { return cat().byId[id]; }
export function roadKind(level) { return cat().roads[level - 1]; }
import { TECHS, TECH_BY_ID } from './research-data.js';
import { milestones } from './tuning.js';
/** Is tech `id` owned — researched in R&D or bought from a merchant? (the one check both screens use: research.js has) */
export function techDone(region, id) { return region?.research?.done?.[id] != null || region?.ships?.goods?.[id] != null; }
/** The milestone this entry opens at for this region: its own, or earlier with an R&D "plans" tech. */
export function unlockAt(region, entry) {
  let at = entry.unlock ?? 0;
  for (const t of TECHS) if (t.early && entry.id in t.early && techDone(region, t.id)) at = Math.min(at, t.early[entry.id]);
  return at;
}
/** The R&D tech an entry needs before it can be built at all (a new park), or null. */
export function techFor(entry) { return entry?.id ? TECHS.find(t => t.unlocks?.includes(entry.id)) || null : null; }
export function unlocked(region, entry) {
  const t = techFor(entry); if (t && !techDone(region, t.id)) return false;
  return unlockAt(region, entry) <= region.milestone;
}
/** Why an entry is locked, in a sentence ("Research Neon Light Art in R&D" / "Unlocks at milestone 2: 300 people"),
 *  short = for a tray card ("R&D" / "Milestone 2"); null when open. */
export function lockText(region, entry) {
  if (!entry || unlocked(region, entry)) return null;
  const t = techFor(entry);
  if (t && !techDone(region, t.id)) return { text: `Research ${t.name} in R&D to build it.`, short: 'R&D', tech: t.id };
  const at = unlockAt(region, entry), ms = milestones()[at - 1];
  const early = TECHS.find(x => x.early && entry.id in x.early && x.early[entry.id] < at && !techDone(region, x.id));
  return { text: `Unlocks at milestone ${at}: ${ms != null ? ms.toLocaleString('en-US') : '?'} people.${early ? ` ${early.name} in R&D opens it sooner.` : ''}`, short: `Milestone ${at}`, tech: early?.id || null };
}
export { TECH_BY_ID };
/** Materials an entry costs besides credits: { steel: 20, … } */
export function materials(entry) { const m = {}; for (const k of ['metal', 'stone', 'crystal', 'steel', 'concrete', 'cells']) if (entry[k]) m[k] = entry[k]; return m; }
