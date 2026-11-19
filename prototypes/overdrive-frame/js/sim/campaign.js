// The campaign: which districts of the city are freed, reached or still dark; which story mission is next; the
// contracts on the board (made from data/campaign.json templates, the same until another mission is flown). Pure: everything comes from the save + the data, so the board and a co-op host agree.
import { makeRng } from './rng.js';
import { layoutFor } from './citylayouts.js';
/** Round 7: a contract's street layout comes from its own map seed (citylayouts.js), so the board shows a mix and the
 *  co-op server rebuilding the contract gets the same one. */
const withLayout = map => ({ ...map, layout: layoutFor(map.district, map.seed) });

const ORDER = ['S', 'A', 'B', 'C', 'D'];
export const missionDone = (save, id) => !!save.grades?.[id];

/** Every district with its state: freed (its story mission done), reached (start, or borders a freed district),
 *  storyOpen (its story mission can be flown now), control 0..1 (freed + cleaned up by contracts — the map recovers). */
export function districtStates(save, CAMP) {
  const D = CAMP.districts, freed = new Set(D.filter(d => missionDone(save, d.story)).map(d => d.id));
  const regionOf = d => d.region || 'city';                      // the city, the outskirts… (round 6) — neighbours only inside one
  const near = (a, b) => regionOf(a) === regionOf(b) && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  return D.map(d => {
    const isFreed = freed.has(d.id);
    const reached = isFreed || d.start || D.some(o => freed.has(o.id) && near(o, d));
    const afterOk = d.afterAny ? d.after.some(id => missionDone(save, id)) : d.after.every(id => missionDone(save, id));
    const cleaned = save.cleanup?.[d.id] || 0;
    return { ...d, region: regionOf(d), freed: isFreed, reached, storyOpen: reached && afterOk && !isFreed, control: isFreed ? Math.min(1, 0.55 + cleaned * 0.15) : reached ? 0.12 : 0, cleaned };
  });
}

/** The story missions in order, each with its district and whether it can be flown. A district can hold more story
 *  missions after its first (`more: [{ story, after }]` — round 5: the long night, the walker, the moon): each opens
 *  once the district is freed and its `after` missions are flown. */
export function storyList(save, CAMP, MISSIONS) {
  const st = districtStates(save, CAMP);
  const rank = x => (x.open ? 0 : x.done ? 1 : 2);               // ready first, then flown (to replay), then locked
  const more = st.flatMap(d => (d.more || []).map(x => ({ district: d, mission: MISSIONS.find(m => m.id === x.story), done: missionDone(save, x.story),
    open: d.freed && (x.after || []).every(id => missionDone(save, id)) && !missionDone(save, x.story), after: x.after || [] })));
  return [...st.map(d => ({ district: d, mission: MISSIONS.find(m => m.id === d.story), open: d.storyOpen, done: d.freed })), ...more].filter(x => x.mission)
    .sort((a, b) => rank(a) - rank(b) || MISSIONS.indexOf(a.mission) - MISSIONS.indexOf(b.mission));
}

const pickW = (R, list) => { const tot = list.reduce((s, x) => s + (x.w || 1), 0); let v = R.next() * tot; for (const x of list) { v -= x.w || 1; if (v <= 0) return x; } return list[0]; };
const range = (R, [a, b]) => Math.round(a + (b - a) * R.next());
const TALL = { downtown: 'com-office', industrial: 'ind-depot', residential: 'res-block', forest: 'forest-cabin', snow: 'snow-radar', desert: 'desert-hangar' };   // outskirts: Pinewatch's crew cabins, Frostline's radar domes, Red Mesa's hangars
const PAY = { 1: 3800, 2: 5600, 3: 7600 };

/** Waves for a contract: one faction's (or both, for a contested district) units, spread over the mission's length. */
export function makeWaves(R, CAMP, held, tier, seconds, { every = false } = {}) {
  const facs = held === 'both' ? ['swarm', 'army'] : [held];
  const n = Math.round(seconds / 32) + 3, waves = [];
  for (let i = 0; i < n; i++) {
    const F = CAMP.factions[facs[i % facs.length]];
    const stage = i / n < 0.35 ? (tier >= 3 ? 'mid' : 'early') : i / n < 0.75 ? (tier >= 2 ? 'mid' : 'early') : (tier >= 2 ? 'late' : 'mid');
    let kind = F[stage][Math.floor(R.next() * F[stage].length)];
    if (R.next() < 0.08 && F.rare.length) kind = F.rare[Math.floor(R.next() * F.rare.length)];
    const c = CAMP.counts[kind] || [2, 4];
    const count = Math.max(1, Math.round(range(R, c) * (0.75 + tier * 0.25)));
    const w = { at: Math.round(3 + (i / n) * seconds * 0.85), kind, count, from: 'edge' };
    if (count > 20) w.spread = 2.5;
    if (tier >= 2 && R.next() < 0.2) w.elite = 0.05;
    if (every && i < 3) { w.every = Math.round(40 + R.next() * 30); w.until = seconds - 10; }
    waves.push(w);
  }
  return waves;
}

/** One contract mission from a template, in the same shape as data/missions.json. */
export function makeContract(R, CAMP, MAKERS, d, tpl, idx, turn) {
  const tier = d.tier || 1, client = CAMP.clients[Math.floor(R.next() * CAMP.clients.length)];
  const clientName = MAKERS.find(m => m.id === client)?.short || 'A client';
  const mid = tpl.length === 'mid', seconds = mid ? 420 : 210 + tier * 20;
  const heldF = d.held === 'both' ? (R.next() < 0.5 ? 'swarm' : 'army') : d.held;
  const F = CAMP.factions[heldF];
  const count = tpl.type === 'demolition' ? 2 + tier : tpl.type === 'sabotage' ? 2 + Math.min(2, tier) : tpl.type === 'convoy' ? 3 + tier : 0;
  const m = {
    id: `c${turn}-${idx}-${tpl.type}`, contract: true, client, district: d.id, type: tpl.type,
    name: `${tpl.name}: ${d.name}`, length: tpl.length, night: Math.round(R.next() * 9) / 10, drop: 4.5, tier,
    pay: Math.round(PAY[tier] * (mid ? 1.5 : 1) / 100) * 100, payPerScore: 5,
    map: withLayout({ seed: 5000 + turn * 97 + idx * 13 + Math.floor(R.next() * 1000), district: d.type, w: 40, h: 40 }),
    brief: tpl.brief.replace('{client}', clientName).replace('{district}', d.name).replace('{count}', count),
    waves: makeWaves(R, CAMP, d.held, tier, seconds, { every: tpl.type === 'defend' }), enemies: [], objectives: [], extract: true,
    par: { time: Math.round(seconds * 1.1) }, comms: [],
  };
  const big = F.big, opt = { id: 'quick', type: 'beat', time: Math.round(seconds * 1.15), optional: true, label: `Done inside ${Math.floor(seconds * 1.15 / 60)}:${String(Math.round(seconds * 1.15) % 60).padStart(2, '0')}` };
  switch (tpl.type) {
    case 'wipe': m.objectives = [{ id: 'clear', type: 'killAll', label: 'Clear the district' }, opt]; break;
    case 'nest': m.enemies = [{ kind: 'nest', count: 2 + tier, place: 'far' }]; m.objectives = [{ id: 'nests', type: 'kill', kind: 'nest', count: 2 + tier, label: `Burn the hives (${2 + tier})` }, opt]; break;
    case 'demolition': m.objectives = [{ id: 'demo', type: 'destroy', pickLots: { recipe: TALL[d.type], count }, label: `Bring down the strongpoints (${count})` }, { id: 'care', type: 'keepLots', optional: true, recipe: 'com-hotel', count: 1, label: 'Leave the shelter standing' }]; break;
    case 'defend': m.objectives = [{ id: 'hold', type: 'survive', time: seconds - 30, label: 'Hold until the transports leave' }, { id: 'care', type: 'keepLots', optional: true, recipe: TALL[d.type], count: 1, label: 'Keep the shelter standing' }]; break;
    case 'hunt': m.enemies = [{ kind: big, count: 1, place: 'far', elite: true, tag: 'target', hpMul: 3 + tier }]; m.objectives = [{ id: 'hunt', type: 'kill', tag: 'target', count: 1, label: `Kill the marked ${big === 'tank' ? 'tank' : 'brute'}` }, { id: 'extra', type: 'kill', count: 80 + tier * 30, optional: true, label: `Bonus: ${80 + tier * 30} kills` }]; break;
    case 'sabotage': m.objectives = [{ id: 'plant', type: 'plant', count, time: 3, label: `Plant charges on the masts (${count})` }, opt]; break;
    case 'salvage': m.objectives = [{ id: 'core', type: 'carry', label: 'Bring the data core to the dropship' }, opt]; break;
    case 'convoy': m.objectives = [{ id: 'convoy', type: 'intercept', kind: 'convoy-truck', count, of: count + 2, label: `Stop the trucks (${count} of ${count + 2})` }, opt]; m.convoy = { side: 'enemy', count: count + 2, kind: 'convoy-truck', at: 20 }; break;
    case 'escort': m.objectives = [{ id: 'escort', type: 'escort', count: 2, of: 3, label: 'Get the trucks through (at least 2 of 3)' }]; m.convoy = { side: 'ally', count: 3, kind: 'ally-truck', at: 8 }; break;
  }
  m.comms = [{ at: 0, who: 'handler', text: m.brief }, ...(CONTRACT_LINES[tpl.type] || [])];
  return m;
}
const CONTRACT_LINES = {
  nest: [{ at: 30, who: 'handler', text: 'Hives keep budding while they stand. Burn them first, mop up after.' }],
  sabotage: [{ at: 20, who: 'handler', text: 'The masts are marked. Stand on each one till the charge is set.' }],
  salvage: [{ at: 15, who: 'handler', text: 'Core beacon is on your map. Carrying it slows you down, so clear a path.' }],
  convoy: [{ at: 18, who: 'handler', text: 'Trucks are rolling. They won\'t stop to fight — they just want out.' }],
  escort: [{ at: 6, who: 'pilot', text: 'Convoy is moving. Stay close; they can\'t outrun anything.' }],
  hunt: [{ at: 25, who: 'handler', text: 'Your mark is on the map. It hits hard. Don\'t stand in front of it.' }],
  defend: [{ at: 60, who: 'handler', text: 'Transports are loading. Keep them off the plaza.' }],
};

/** The contracts board: up to `n` contracts in reached districts, the same until the next mission is flown. */
export function contractsFor(save, CAMP, MAKERS, { n = 5 } = {}) {
  const turn = save.played || 0, R = makeRng(4421 + turn * 7919);
  const reach = districtStates(save, CAMP).filter(d => d.reached);
  const out = [];
  for (let i = 0; i < n && reach.length; i++) {
    const d = reach[(i + turn) % reach.length];
    const tpls = CAMP.contracts.filter(t => !t.only || t.only === d.held || d.held === 'both');
    out.push(makeContract(R, CAMP, MAKERS, d, pickW(R, tpls), i, turn));
  }
  return out;
}

/** After a mission: a contract cleans up its district (the city map recovers). Round 7: reputation and maker licences
 *  are gone (owner: "you just get rep with all 4 factions at once … remove that unless we actually develop the
 *  factions more"); the dealer's rarer shelves took over what licences did. */
export function applyCampaign(save, mission, result) {
  if (!result.won) return {};
  save.cleanup ||= {};
  if (mission.contract) save.cleanup[mission.district] = (save.cleanup[mission.district] || 0) + 1;
  return {};
}

export { ORDER };
