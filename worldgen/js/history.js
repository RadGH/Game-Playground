// A light dusting of history: a few notable events per region so the map has some flavour to read.
// Deliberately small — this is not a chronicle generator, it is three or four lines per region that a
// game can print on a map tooltip or hand to Lingo as memories.
//
//   import { makeHistory } from './history.js';
//   makeHistory(world, opts);    // fills world.history and region.history

import { makeRng, subSeed, clamp } from './noise.js';
import { BIOMES } from './biomes.js';
import { Namer } from './names.js';

// {place} region name · {node} a settlement or landmark in it · {person} a name · {folk} the region's people
const EVENTS = [
  { id: 'founded', w: 5, needs: 'settlement', text: '{node} was founded by {person} in the year {year}.', tags: ['founding'] },
  { id: 'refounded', w: 2, needs: 'settlement', text: '{node} was rebuilt in {year} after standing empty for a generation.', tags: ['founding'] },
  { id: 'fell', w: 4, needs: 'ruin', text: '{node} fell in {year}; nobody agrees on what took it.', tags: ['fall'] },
  { id: 'abandoned', w: 3, needs: 'ruin', text: 'The {folk} walked out of {node} in {year} and never said why.', tags: ['fall'] },
  { id: 'battle', w: 5, needs: 'any', text: 'The fighting at {node} in {year} cost both sides more than either would admit.', tags: ['war'] },
  { id: 'siege', w: 3, needs: 'settlement', text: '{node} held out through a winter siege in {year}.', tags: ['war'] },
  { id: 'plague', w: 3, needs: 'any', text: 'A sickness ran through {place} in {year} and thinned every village in it.', tags: ['loss'] },
  { id: 'flood', w: 2, needs: 'river', text: 'The water came up over {place} in {year} and took the low fields with it.', tags: ['loss'] },
  { id: 'discovery', w: 3, needs: 'any', text: '{person} came back from {node} in {year} with something that should not have been there.', tags: ['lore'] },
  { id: 'treaty', w: 3, needs: 'neighbour', text: '{place} and {other} stopped shooting at each other in {year}. It has mostly held.', tags: ['politics'] },
  { id: 'feud', w: 3, needs: 'neighbour', text: '{place} has not traded with {other} since {year}, and both sides tell it differently.', tags: ['politics'] },
  { id: 'blight', w: 4, needs: 'evil', text: 'Whatever settled over {place} in {year} is still there, and it is still spreading.', tags: ['aura'] },
  { id: 'blessing', w: 3, needs: 'good', text: 'Since {year} nothing has gone badly wrong in {place}, which unsettles people more than it comforts them.', tags: ['aura'] },
  { id: 'eruption', w: 3, needs: 'volcanic', text: 'The mountain opened in {year} and buried the road under ash.', tags: ['disaster'] },
  { id: 'freeze', w: 3, needs: 'cold', text: 'The long freeze of {year} killed the herds and half the herders with them.', tags: ['disaster'] },
  { id: 'gold', w: 2, needs: 'settlement', text: 'Something worth digging for was found near {node} in {year}, and {node} has not been quiet since.', tags: ['wealth'] },
  { id: 'road', w: 2, needs: 'settlement', text: 'The road to {node} was cut and paved in {year}; it is the reason anyone goes there.', tags: ['wealth'] },
  { id: 'vanished', w: 2, needs: 'any', text: 'A caravan went into {place} in {year}. The carts came out. Nobody else did.', tags: ['lore'] },
];

export function makeHistory(world, opts) {
  const rng = makeRng(subSeed(world.seed, 'history'));
  const namer = world._namer || (world._namer = new Namer({ namegen: opts.namegen, raceTable: opts.raceTable, seed: world.seed }));
  const now = 700 + rng.int(0, 600);         // the "present" year of this world
  world.era = { year: now, name: 'the present day' };
  const all = [];

  for (const r of world.regions) {
    const nodes = r.nodes.map(id => world.nodes[id]).filter(Boolean);
    const settlements = nodes.filter(n => n.type === 'settlement');
    const ruins = nodes.filter(n => n.kind === 'ruin' || n.type === 'dungeon');
    const count = clamp(1 + Math.floor(rng() * 3) + (r.cells > 300 ? 1 : 0), 1, 4);
    const facts = {
      settlement: settlements.length > 0, ruin: ruins.length > 0, any: true,
      river: r.riverCells > 0, neighbour: r.neighbours.length > 0,
      evil: r.aura > 0.35, good: r.aura < -0.35,
      volcanic: nodes.some(n => n.kind === 'volcano') || r.biome === 'volcanic',
      cold: r.temperature < 0.3,
    };
    const pool = EVENTS.filter(e => facts[e.needs]);
    if (!pool.length) continue;
    const used = new Set();
    for (let k = 0; k < count; k++) {
      const ev = rng.weighted(pool, e => (used.has(e.id) ? 0.15 : 1) * e.w);
      used.add(ev.id);
      const year = now - rng.int(12, 480);
      const node = ev.needs === 'ruin' ? rng.pick(ruins) : (settlements.length ? rng.pick(settlements) : (nodes.length ? rng.pick(nodes) : null));
      const other = r.neighbours.length ? world.regions[rng.pick(r.neighbours)] : null;
      const person = namer.person(r.race, subSeed(world.seed, `hist${r.id}-${k}`));
      const text = ev.text
        .replace(/\{place\}/g, r.name)
        .replace(/\{node\}/g, node ? node.name : r.name)
        .replace(/\{person\}/g, person.text)
        .replace(/\{folk\}/g, r.people || (r.name.replace(/^The /, '') + ' folk'))
        .replace(/\{other\}/g, other ? other.name : 'their neighbours')
        .replace(/\{year\}/g, String(year));
      const entry = { id: all.length, year, region: r.id, node: node ? node.id : null, kind: ev.id, tags: ev.tags, text };
      r.history.push(entry); all.push(entry);
    }
    r.history.sort((a, b) => a.year - b.year);
  }
  all.sort((a, b) => a.year - b.year);
  world.history = all;
  return world;
}

/** A one-line summary of the world, for the viewer header. */
export function worldSummary(world) {
  const s = world.stats || {};
  const biggest = world.continents[0];
  const dominant = new Map();
  for (const r of world.regions) dominant.set(r.biome, (dominant.get(r.biome) || 0) + r.cells);
  const top = [...dominant.entries()].sort((a, b) => b[1] - a[1])[0];
  const biomeName = top ? (BIOMES.find(b => b.key === top[0])?.name || top[0]) : 'open ground';
  return `${world.regions.length} regions on ${world.continents.length} landmass${world.continents.length === 1 ? '' : 'es'}` +
    (biggest ? `, the largest being ${biggest.name}` : '') +
    `, mostly ${biomeName.toLowerCase()}; ${Math.round((s.landFraction || 0) * 100)}% land.`;
}
