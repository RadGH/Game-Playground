// A mission from data/missions.json + its generated district → the def createMission runs. Resolves map picks
// ("the three biggest refineries") into real lot ids, so the objective markers, the rules and the map agree.
import { makeCityMap } from './citymap.js';
import { makeHangarMap, makeRangeMap } from './hangarmap.js';

// trees and rock are never stand-in demolition targets ("bring down the strongpoints" picking a pine stand) — Red Mesa marks
// its rock `natural`; the forest's and the snowfield's woods and ridges are listed here (round 6)
const NATURAL = new Set(['forest-pine', 'forest-pines', 'forest-thicket', 'forest-rock', 'forest-crag', 'snow-pines', 'snow-spruce', 'snow-ridge']);

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
    if (list.length < count) list = list.concat(map.lots.filter(l => !used.has(l.id) && !list.includes(l) && l.w * l.d >= 2 && !l.natural && !NATURAL.has(l.recipe)).sort((a, b) => size(b) - size(a)));   // natural: rock (Red Mesa) is never a stand-in target
    const out = list.slice(0, count); out.forEach(l => used.add(l.id)); return out.map(l => l.id);
  };
  const objectives = (m.objectives || []).map(o => {
    const r = { ...o };
    if (o.pickLots) r.lots = pick(o.pickLots);
    if (o.type === 'keepLots') r.lots = pick({ recipe: o.recipe, count: o.count || 1 });
    if (o.zone === 'start') { r.x = map.start.x; r.z = map.start.z; r.r = o.r || 3; }   // round 5: hold the landing pad (survive in a zone)
    else if (o.zone && map.zones?.[o.zone]) { const q = map.zones[o.zone]; r.x = q.x; r.z = q.z; r.r = o.r || q.r; }   // round 6: a named spot (the snowfield's station yard)
    return r;
  });
  // a long mission (round 5): stage 1 is the mission's own objectives + waves; `stages` names it and adds the rest
  const stages = m.stages?.length ? m.stages.map((st, i) => i === 0 ? { id: st.id || 's1', label: st.label, objectives, waves: m.waves || [] }
    : { id: st.id || 's' + (i + 1), label: st.label, waves: st.waves || [], enemies: st.enemies || [], objectives: (st.objectives || []).map(o => (o.pickLots ? { ...o, lots: pick(o.pickLots) } : o.type === 'keepLots' ? { ...o, lots: pick({ recipe: o.recipe, count: o.count || 1 }) } : { ...o })) }) : null;
  const collateral = (stages ? stages.flatMap(s => s.objectives) : objectives).filter(o => o.type === 'keepLots').flatMap(o => o.lots);
  return {
    id: m.id, name: m.name, seed: m.map.seed, map, start: [map.start], drop: m.drop ?? 3,
    waves: m.waves || [], enemies: (m.enemies || []).filter(e => !e.place), place: (m.enemies || []).filter(e => e.place), objectives,
    convoy: m.convoy || null, orbital: !!m.orbital, orbitalDmg: m.orbitalDmg, extract: m.extract ? map.extract : null,
    par: m.par || {}, pay: m.pay, payPerScore: m.payPerScore, tier: m.tier || 1, comms: m.comms || [], collateral, length: m.length,
    versus: m.versus || null,                                              // versus (sim/versus.js): { mode, wins }
    stages, allWaves: stages ? stages.flatMap(s => s.waves) : (m.waves || []),
    gravity: m.gravity ?? 1,       // round 5: the moon is 0.4 (sim/mech.js, lobbed shots in sim/mission.js)
  };
}
