// Thousandvale-only monsters (2026-10-14, docs/EXPANSION-1.md §5). Pure.
//
// The combat core's bestiary is Farhold's (prototypes/farhold/data/enemies.json). A new region needs new creatures —
// new names, new looks, its own family — but their NUMBERS can borrow a tuned Farhold stat block, so a new monster is
// balanced on day one. data/rules/monsters-tv.json: { monsters: [{ id, name, base, family?, levels?, look?, boss? }] }.
// Each row becomes a full bestiary entry: a copy of `base` with the new id, name, family, level range and look. The
// client draws `look` (js/client/looks.js reads the same file); the rules see an ordinary enemy.
//
//   installTvMonsters(bestiary, data)   -> number added (rows whose base is missing are skipped and listed in `bestiary.tvSkipped`)

const clone = o => JSON.parse(JSON.stringify(o));

export function installTvMonsters(bestiary, data) {
  const rows = Array.isArray(data?.monsters) ? data.monsters : [];
  const find = id => (bestiary.enemies || []).find(d => d.id === id) || (bestiary.bosses || []).find(d => d.id === id) || null;
  let n = 0; bestiary.tvSkipped = [];
  for (const m of rows) {
    if (!m?.id || find(m.id)) continue;                    // never shadow a Farhold monster
    const base = find(m.base);
    if (!base) { bestiary.tvSkipped.push(m.id); continue; }
    const def = clone(base);
    def.id = m.id; def.name = m.name || def.name; def.tvBase = base.id;
    if (m.family) def.family = m.family;
    if (Array.isArray(m.levels)) def.levels = m.levels.slice(0, 2);
    if (m.look) def.look = clone(m.look);
    if (m.desc) def.desc = m.desc;
    const isBoss = m.boss ?? (bestiary.bosses || []).includes(base);
    (isBoss ? (bestiary.bosses ||= []) : (bestiary.enemies ||= [])).push(def);
    n++;
  }
  return n;
}
