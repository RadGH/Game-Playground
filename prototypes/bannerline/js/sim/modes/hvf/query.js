// Read-only helpers for the Hunters vs Farmers UI (docs/hvf-PLAN.md §2.5). Pure: (ctx-like, ...) ->
// plain values; nothing here changes state. `q` = { state, data, map } (a sim is fine: it has all three).

import { hasBit, canSee } from './vision.js';
import { priceOf, buildRefusal, incomeOf, upgradeCost } from './farm.js';
import { gear, castRefusal, buyRefusal as hunterBuyRefusal } from './hunter.js';
import { turnValues } from './turn.js';
import { armyCount } from './army.js';
import { entById, FARMERS, HUNTERS, TICK_HZ } from './state.js';
import { cellOf } from './grid.js';

const ctxOf = q => ({ state: q.state, data: q.data, map: q.map, emit: () => {} });

export function clock(q) {
  const s = q.state.hvf, t = q.state.tick;
  return { seconds: t / TICK_HZ, left: Math.max(0, s.endTick - t) / TICK_HZ, releaseIn: Math.max(0, s.releaseTick - t) / TICK_HZ, released: t >= s.releaseTick, incomeIn: (TICK_HZ - (t % TICK_HZ)) / TICK_HZ };
}

/** A farmer's panel: gold, income and its parts, animals (and strays), buildings, prices. */
export function farmerInfo(q, pid) {
  const { state, data } = q, p = state.players[pid], ctx = ctxOf(q);
  const inc = incomeOf(ctx, p);
  const animals = {}, buildings = {};
  let strays = 0;
  for (const e of state.ents) {
    if (e.owner !== pid || !e.alive || e._gone) continue;
    if (e.kind === 'animal') { animals[e.type] = (animals[e.type] || 0) + 1; if (e.stray) strays++; }
    else if (e.kind === 'building') buildings[e.type] = (buildings[e.type] || 0) + 1;
  }
  const grave = state.hvf.graves.find(g => g.pid === pid) || null;
  return { gold: p.gold, income: inc.total, incomeParts: inc, animals, strays, buildings, ghost: p.ghost, grave, ent: entById(state, p.ent) };
}

/** Build menu rows: cost (this copy), income and payback, tell rating, canBuy + reason (no spot given: gold / role only). */
export function buildMenu(q, pid) {
  const { state, data } = q, p = state.players[pid], B = data.hvf.buildings, A = data.hvf.animals.kinds;
  return B.order.map(kind => {
    const d = B.kinds[kind], cost = priceOf(data, p, kind);
    const income = d.makes ? A[d.makes].income * d.cap : (d.flat || 0);
    const reason = p.role !== 'farmer' ? 'role' : p.ghost ? 'dead' : p.gold < cost ? 'gold' : null;
    return { kind, name: d.name, desc: d.desc, cost, income, incomePct: d.incomePct || 0, payback: income > 0 ? Math.round(cost / income) : null, tell: d.tell, size: d.size.slice(), canBuy: reason === null, reason };
  });
}

/** Would build {kind, x, z} be accepted right now (the placement ghost's colour)? */
export function buildCheck(q, pid, kind, x, z) { return buildRefusal(ctxOf(q), q.state.players[pid], kind, x, z); }

export function hunterInfo(q, pid) {
  const { state, data } = q, p = state.players[pid], e = entById(state, p.ent), H = data.hvf.hunter, U = data.hvf.units.hunter, ctx = ctxOf(q);
  const g = gear(data, p);
  return {
    gold: p.gold, level: p.level, xp: p.xp, xpNext: p.level < U.maxLevel ? U.xpTable[p.level] : null, out: p.out, deaths: p.deaths,
    alive: !!e && e.alive, respawnIn: e && !e.alive && e.respawnAt >= 0 ? (e.respawnAt - state.tick) / TICK_HZ : 0, ent: e,
    lodges: state.ents.filter(b => b.kind === 'building' && b.lodge && b.owner === pid && b.alive && !b._gone).map(b => ({ id: b.id, x: b.x, z: b.z, type: b.type, done: b.done !== false })),
    skills: Object.keys(H.skills).map(slot => ({ slot, id: H.skills[slot].id, name: H.skills[slot].name, level: H.skills[slot].level, readyIn: Math.max(0, (p.cd[slot] || 0) - state.tick) / TICK_HZ, canCast: castRefusal(ctx, p, slot) === null, reason: castRefusal(ctx, p, slot) })),
    snares: { standing: state.ents.filter(x => x.kind === 'snare' && x.owner === pid && !x._gone).length, max: H.skills.W.max + g.snares },
    wards: state.ents.filter(x => x.kind === 'ward' && x.owner === pid && !x._gone).map(w => ({ id: w.id, x: w.x, z: w.z, left: (w.until - state.tick) / TICK_HZ })),
    tracking: p.level >= H.tracking.level, gear: g,
    inv: p.inv.map((it, slot) => it ? { slot, id: it.id, charges: it.charges, name: data.hvf['hunter-items'].items[it.id].name } : null),
  };
}

/** The hunters' Outfitter at a lodge: every item with its price, text and refusal. */
export function hunterShop(q, pid) {
  const { state, data } = q, p = state.players[pid], ctx = ctxOf(q), I = data.hvf['hunter-items'].items;
  return Object.keys(I).map(id => { const why = hunterBuyRefusal(ctx, p, id); return { id, name: I[id].name, desc: I[id].desc, price: I[id].price, canBuy: why === null, reason: why }; });
}

/** Farm upgrades: rank, next price, refusal. */
export function farmUpgrades(q, pid) {
  const { state, data } = q, p = state.players[pid], U = data.hvf.buildings.upgrades;
  return U.order.map(id => { const c = upgradeCost(data, p, id); const reason = c == null ? 'max' : p.gold < c ? 'gold' : null; return { id, name: U[id].name, desc: U[id].desc, rank: p.upgrades[id] || 0, ranks: U[id].costs.length, cost: c, canBuy: reason === null, reason }; });
}

/** The farmer's army bar. */
export function armyInfo(q, pid) {
  const { state, data } = q;
  return { count: armyCount(state, pid), cap: data.hvf.units.army.cap, units: state.ents.filter(u => u.kind === 'army' && u.owner === pid && u.alive && !u._gone).map(u => ({ id: u.id, type: u.type, hpPct: u.hp / u.hpMax, order: u.ord.k })) };
}

/** The Turn moon: value -1..+1, the two sides' values, one line of why. */
export function turnInfo(q) { const v = turnValues(ctxOf(q)); return { value: q.state.hvf.turn, farm: Math.round(v.farm), hunt: Math.round(v.hunt), reason: q.state.hvf.turnWhy }; }

/** Tracks a hunter can see now (needs the Tracking level; only inside his team's vision). */
export function visibleTracks(q, pid) {
  const { state, data } = q, p = state.players[pid];
  if (p.role !== 'hunter' || p.level < data.hvf.hunter.tracking.level) return [];
  return state.hvf.tracks.filter(t => hasBit(state.hvf.vision[HUNTERS], cellOf(q.map, t.x, t.z)));
}

/** Enemy buildings a team remembers (grey ghosts where they were last seen). */
export function seenBuildings(q, team) { return q.state.hvf.seen[team].slice(); }

/** Alive / ghost / out counts per side (the sides strip). */
export function sideInfo(q) {
  const { state } = q, out = { farmers: { alive: 0, ghost: 0 }, hunters: { alive: 0, down: 0, out: 0 } };
  for (const p of state.players) {
    if (p.role === 'farmer') out.farmers[p.ghost ? 'ghost' : 'alive']++;
    else { const e = entById(state, p.ent); out.hunters[p.out ? 'out' : e && e.alive ? 'alive' : 'down']++; }
  }
  return out;
}

/** Is world point (x, z) in `team`'s vision now / ever? */
export function visibleAt(q, team, x, z) { return hasBit(q.state.hvf.vision[team], cellOf(q.map, x, z)); }
export function exploredAt(q, team, x, z) { return hasBit(q.state.hvf.explored[team], cellOf(q.map, x, z)); }
/** Can `team` see this entity (tall grass and lying low count)? The view hides what this says no to. */
export function visibleEnt(q, team, e) { return canSee(ctxOf(q), team, e); }
/** The packed vision / explored bitsets for the fog texture (32 cells per int, row-major). */
export function fogBits(q, team) { return { vision: q.state.hvf.vision[team], explored: q.state.hvf.explored[team], cols: q.map.cols, rows: q.map.rows }; }

export { FARMERS, HUNTERS };
