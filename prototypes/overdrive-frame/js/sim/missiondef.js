// A mission from data/missions.json + its generated district → the def createMission runs. Resolves map picks
// ("the three biggest refineries") into real lot ids, so the objective markers, the rules and the map agree.
import { makeCityMap } from './citymap.js';
import { makeHangarMap, makeRangeMap } from './hangarmap.js';

export function buildMissionDef(m, opts = {}) {
  // the hangar hub and the test range: fixed maps, no waves or objectives, never end (no drop-in either)
  const kind = m.map?.kind;
  if (kind === 'hangar' || kind === 'range') {
    const map = kind === 'hangar' ? makeHangarMap(m.map) : makeRangeMap(m.map);
    return { id: m.id || kind, name: m.name || map.name, seed: m.map.seed || 1, map, start: [map.start], drop: 0, waves: [], enemies: m.enemies || map.enemies || [],
      objectives: [], extract: null, par: {}, pay: 0, payPerScore: 0, tier: 1, comms: [], collateral: [], partDrops: false, kind };
  }
  const map = makeCityMap({ ...m.map, ...(opts.map || {}) });
  const used = new Set();
  const pick = ({ recipe, count }) => {
    const size = l => l.w * l.d * 10 + l.h;
    let list = map.lots.filter(l => l.recipe === recipe && !used.has(l.id)).sort((a, b) => size(b) - size(a));
    if (list.length < count) list = list.concat(map.lots.filter(l => !used.has(l.id) && !list.includes(l) && l.w * l.d >= 2).sort((a, b) => size(b) - size(a)));
    const out = list.slice(0, count); out.forEach(l => used.add(l.id)); return out.map(l => l.id);
  };
  const objectives = (m.objectives || []).map(o => {
    const r = { ...o };
    if (o.pickLots) r.lots = pick(o.pickLots);
    if (o.type === 'keepLots') r.lots = pick({ recipe: o.recipe, count: o.count || 1 });
    return r;
  });
  const collateral = objectives.filter(o => o.type === 'keepLots').flatMap(o => o.lots);
  return {
    id: m.id, name: m.name, seed: m.map.seed, map, start: [map.start], drop: m.drop ?? 3,
    waves: m.waves || [], enemies: (m.enemies || []).filter(e => !e.place), place: (m.enemies || []).filter(e => e.place), objectives,
    convoy: m.convoy || null, orbital: !!m.orbital, orbitalDmg: m.orbitalDmg, extract: m.extract ? map.extract : null,
    par: m.par || {}, pay: m.pay, payPerScore: m.payPerScore, tier: m.tier || 1, comms: m.comms || [], collateral, length: m.length,
  };
}
