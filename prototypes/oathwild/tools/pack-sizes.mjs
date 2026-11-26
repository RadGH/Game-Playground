// How many monsters a hero meets at once (owner 2026-11-26: "every enemy I have seen has been in a pack of 5 or more …
// get rid of it. I can barely fight 1v1"). Fills every camp and roam zone the way the server does (encounters.js) over
// many seeds and counts ENCOUNTERS, not spawn rows: two hostile monsters are one encounter when a hero fighting at one
// stands inside the other's noticing distance (+ `slack` metres for the fight drifting). Prints the histogram.
//
//   node prototypes/oathwild/tools/pack-sizes.mjs [--seeds 20] [--slack 4]
// Also exported for tests/world/packs.test.mjs: encounterSizes(rules, placements, { seeds, slack }).
import { createWorld } from '../js/rules/combat.js';
import { spawnCampFor, spawnZone } from '../js/world/encounters.js';

/** Group the hostile units into encounters (connected: a hero at one is noticed by the other). */
export function groupEncounters(units, slack = 4) {
  const hostile = units.filter(u => u.aggroRange > 0);
  const parent = hostile.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < hostile.length; i++) for (let j = i + 1; j < hostile.length; j++) {
    const a = hostile[i], b = hostile[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d <= Math.max(a.aggroRange, b.aggroRange) + slack) parent[find(i)] = find(j);
  }
  const groups = new Map();
  hostile.forEach((u, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(u); });
  return [...groups.values()];
}

/** Every camp + roam zone filled `seeds` times: { sizes: { n: count }, groups: [{ where, n, ids }] } (worst first). */
export function encounterSizes(rules, placements, { seeds = 20, slack = 4 } = {}) {
  const sizes = {}, worst = [];
  for (let s = 1; s <= seeds; s++) {
    const world = createWorld(rules, { seed: s });
    const sets = [];
    for (const c of placements.camps) sets.push([`camp ${c.id}`, spawnCampFor(world, placements, c.id, { heroes: 1 })]);
    for (const z of placements.roam) sets.push([`roam ${z.id}`, spawnZone(world, z)]);
    // zones and camps near each other count together (a hero does not care which list a monster came from)
    const all = sets.flatMap(([where, us]) => us.map(u => Object.assign(u, { where })));
    for (const g of groupEncounters(all, slack)) {
      sizes[g.length] = (sizes[g.length] || 0) + 1;
      if (s === 1) worst.push({ where: [...new Set(g.map(u => u.where))].join(' + '), n: g.length, ids: g.map(u => u.defId).join(', ') });
    }
  }
  worst.sort((a, b) => b.n - a.n);
  return { sizes, worst };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const { rules } = await import('../tests/rules/setup.mjs');
  const { W } = await import('../tests/world/setup.mjs');
  const { sizes, worst } = encounterSizes(rules, W.data.placements, { seeds: arg('seeds', 20), slack: arg('slack', 4) });
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  console.log('encounter size → share (all camps + roam zones, ' + arg('seeds', 20) + ' fills)');
  for (const [n, c] of Object.entries(sizes).sort((a, b) => a[0] - b[0])) console.log(`  ${String(n).padStart(2)}: ${String(c).padStart(5)}  ${(c / total * 100).toFixed(1)}%`);
  console.log('biggest (first fill):');
  for (const w of worst.slice(0, 12)) console.log(`  ${w.n}  ${w.where}: ${w.ids}`);
}
