// The people (PLAN M7): homes, meals, settlers walking in and people walking out. PURE.
//
// HOMES are buildings with `beds` in data/buildings.json (one House kind; the global Housing level picks the entry of
// its `beds` list, so raising the level gives EVERY house more beds at once) plus the HQ's bunks for the landing party
// (balance.town.hqBeds). `b.residents` is who lives there; it never goes over its beds.
//
// MEALS: every `mealEvery` ticks each home eats and drinks from ITS OWN pool — inside a yard ring that is the shared
// store, outside one it is the house's pantry, which the porters fill (the house asks for it with a keep-here, so the
// food is carried there like anything else: nothing teleports). Missing `leaveAfterMeals` meals in a row costs the home
// one person, who walks off the map.
//
// SETTLERS: when there is a free bed, food and water for a while, morale is not low and no enemy is near a home, a
// group of up to `groupMax` sets out from one of the map-edge gates nearest the HQ and WALKS to the house with the most
// free beds (a `migrant` entity on the same route search and movers as the porters, never attacked — §0.7). Their beds
// are held for them while they walk (`incoming`). A home pulled down sends its people to other free beds, on foot.

import { SUB } from '../entities.js';
import { cellFactor } from '../logistics/paths.js';

export function createPeople(sim, town) {
  const { g, M } = sim.world;
  const D = sim.data, cfg = town.cfg;
  const V = D.V.migrant;
  const rng = sim.rng.split('town');
  const known = new Map(); // home id → { x, y, residents } (last seen, so a home that vanished can send its people off)

  const bedsOf = (b) => {
    if (b.type === 'hq') return cfg.hqBeds;
    const beds = D.B[b.type].beds;
    if (!beds || b.built < 1) return 0;
    const lv = Math.max(1, Math.min(beds.length, sim.levels.house || 1));
    return beds[lv - 1];
  };
  /** Every home (built houses + the HQ), id order. */
  const homes = () => sim.ents.list('building').filter((b) => b.type === 'hq' || (D.B[b.type].beds && b.built >= 1));

  // ---- gates: walkable points on the map edge, nearest the HQ first
  let gates = null;
  function gateList() {
    if (gates) return gates;
    const hq = sim.ents.list('building').find((b) => b.type === 'hq');
    const cx = hq ? hq.fp.cx : g.W / 2, cy = hq ? hq.fp.cy : g.H / 2;
    const out = [];
    const step = cfg.gateStep;
    const ok = (x, y) => g.inside(x, y) && cellFactor(M, V, g.cells[g.idx(x, y)]) > 0;
    for (let t = step >> 1; t < Math.max(g.W, g.H); t += step) {
      for (const [x, y] of [[t, 1], [t, g.H - 2], [1, t], [g.W - 2, t]]) if (x < g.W && y < g.H && ok(x, y)) out.push([x, y, (x - cx) ** 2 + (y - cy) ** 2]);
    }
    out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    gates = out.slice(0, Math.max(1, cfg.gates * 3)).map(([x, y]) => [x, y]);
    return gates;
  }

  function spawn(dir, n, at, house, route) {
    const e = sim.ents.add('migrant', {
      type: 'migrant', x: Math.round((at[0] + 0.5) * SUB), y: Math.round((at[1] + 0.5) * SUB),
      n, dir, house: house ? house.id : null, state: 'moving', cargo: {}, hp: 1, hpMax: 1, team: 0,
    });
    Object.defineProperty(e, 'vrow', { value: V, enumerable: false, writable: true });
    Object.defineProperty(e, 'route', { value: null, enumerable: false, writable: true });
    sim.movers.go(e, route);
    if (house) house.settling = (house.settling || 0) + n;
    town.walking += n;
    return e;
  }

  /** Free beds in a home, counting the people already walking to it. */
  const free = (b) => bedsOf(b) - (b.residents || 0) - (b.settling || 0);

  /** Best home for newcomers: most free beds, then nearest the HQ. */
  function bestHome(from) {
    let best = null, bf = 0, bd = Infinity;
    for (const b of homes()) {
      const f = free(b);
      if (f <= 0 || b.type === 'hq') continue;
      const d = (b.fp.cx - from[0]) ** 2 + (b.fp.cy - from[1]) ** 2;
      if (f > bf || (f === bf && d < bd)) { best = b; bf = f; bd = d; }
    }
    return best;
  }

  /** Walk `n` people from `at` to a free bed, or off the map if there is none. */
  function rehome(n, at) {
    while (n > 0) {
      const h = bestHome(at);
      if (!h) { leave(n, at); return; }
      const k = Math.min(n, free(h));
      const r = sim.paths.find(Math.floor(at[0]), Math.floor(at[1]), h.door[0], h.door[1], V);
      if (!r) { leave(n, at); return; }
      spawn('in', k, at, h, r);
      n -= k;
    }
  }

  /** People leave: they walk to the nearest gate and are gone. */
  function leave(n, at) {
    if (n <= 0) return;
    town.left += n;
    const gl = gateList();
    let best = null, bd = Infinity;
    for (const p of gl) { const d = (p[0] - at[0]) ** 2 + (p[1] - at[1]) ** 2; if (d < bd) { bd = d; best = p; } }
    const r = best ? sim.paths.find(Math.floor(at[0]), Math.floor(at[1]), best[0], best[1], V) : null;
    if (r) spawn('out', n, at, null, r);
  }

  // ---- meals
  function meals() {
    for (const b of homes()) {
      const n = b.residents || 0;
      if (!n) { b.fed = true; b.watered = true; b.hungry = 0; continue; }
      const p = sim.stores.poolOf(b.id);
      const ate = eat(b, p, 'food', 'foodDebt', cfg.foodPerMeal * n);
      const drank = eat(b, p, 'water', 'waterDebt', cfg.waterPerMeal * n);
      b.fed = ate; b.watered = drank;
      b.hungry = ate && drank ? 0 : (b.hungry || 0) + 1;
      if (b.hungry >= cfg.leaveAfterMeals) {
        b.hungry = 0;
        b.residents = n - 1;
        town.hungryLeft = (town.hungryLeft || 0) + 1;
        leave(1, b.door);
        // one line a game hour at most, however many homes go short
        if (sim.tick - (town.toldLeftAt ?? -1e9) >= sim.data.balance.day.ticks / 24) {
          town.toldLeftAt = sim.tick;
          sim.events.push({ e: 'teletype', tick: sim.tick, base: sim.base, who: 'Town', red: true,
            text: `PEOPLE ARE LEAVING — NO ${ate ? 'WATER' : drank ? 'FOOD' : 'FOOD OR WATER'} AT THEIR HOMES.` });
        }
      }
      sim.dirty.add(b.id);
    }
  }
  /** Take a meal's worth (fractions carried over) from the pool. True when the meal was there. */
  function eat(b, p, res, key, need) {
    const debt = (b[key] || 0) + need;
    const k = Math.floor(debt);
    if (k <= 0) { b[key] = debt; return b[res === 'food' ? 'fed' : 'watered'] !== false; }
    const have = p ? sim.stores.stock(p, res) : 0;
    if (have >= k) { sim.stores.take(p, res, k); sim.used(res, k); b[key] = debt - k; return true; }
    // not enough: eat what there is, the rest is missed
    if (have > 0) { sim.stores.take(p, res, have); sim.used(res, have); }
    b[key] = Math.min(debt - have, need);
    return false;
  }

  /** A house out of every yard ring keeps a pantry: it asks the dispatcher for a few meals of food and water. */
  function pantries() {
    for (const b of homes()) {
      if (b.type === 'hq') continue;
      const p = sim.stores.poolOf(b.id);
      const own = p && p.own;
      const n = b.residents || 0;
      if (!own || !n) { if (b.keepHere) { delete b.keepHere; sim.dirty.add(b.id); } continue; }
      const f = Math.max(1, Math.ceil(n * cfg.foodPerMeal * cfg.pantryMeals)), w = Math.max(1, Math.ceil(n * cfg.waterPerMeal * cfg.pantryMeals));
      if (b.keepHere?.food !== f || b.keepHere?.water !== w) { b.keepHere = { food: f, water: w }; sim.dirty.add(b.id); }
    }
  }

  // ---- settlers
  function enemyNear(x, y, r) {
    for (const e of sim.ents.list('enemy')) { const dx = e.x / SUB - x, dy = e.y / SUB - y; if (dx * dx + dy * dy <= r * r) return true; }
    return false;
  }
  function arrivals() {
    if (!town.open) { town.why = 'the gates are closed to settlers'; return; }
    const pop = town.pop;
    const stock = (r) => (sim.baseStock[r] || 0) + (sim.carried[r] || 0);
    let vac = 0;
    for (const b of homes()) if (b.type !== 'hq') vac += Math.max(0, free(b));
    const buffer = (per) => Math.ceil(Math.max(1, pop) * per * cfg.bufferMeals);
    const why = !vac ? 'no free beds — build houses'
      : stock('food') < buffer(cfg.foodPerMeal) ? 'not enough food in the stores'
        : stock('water') < buffer(cfg.waterPerMeal) ? 'not enough water in the stores'
          : town.morale < cfg.minMorale ? 'morale is too low'
            : town.lamps.safety > 0 ? 'enemies near the houses' : null;
    town.why = why;
    if (why) return;
    if (sim.tick - town.lastArrive < cfg.arriveEvery) return;
    const gl = gateList();
    if (!gl.length) { town.why = 'no road in from the edge of the map'; return; }
    const at = gl[rng.int(Math.min(cfg.gates, gl.length))];
    const h = bestHome(at);
    if (!h) return;
    const n = Math.min(cfg.groupMax, free(h));
    const r = sim.paths.find(at[0], at[1], h.door[0], h.door[1], V);
    town.lastArrive = sim.tick;
    if (!r) { gates.splice(gates.indexOf(at), 1); return; }
    spawn('in', n, at, h, r);
  }

  /** Every tick: settlers walk; on arrival they move in (or, walking out, are gone). */
  function walk() {
    for (const e of [...sim.ents.list('migrant')]) {
      if (e.blocked) {
        const dest = e.dir === 'in' ? sim.ents.get(e.house)?.door : null;
        e.blocked = false;
        const r = dest ? sim.paths.find(Math.floor(e.x / SUB), Math.floor(e.y / SUB), dest[0], dest[1], V) : null;
        if (r) sim.movers.go(e, r); else finish(e, false);
        continue;
      }
      if (e.route) { sim.movers.stepMover(e); continue; }
      finish(e, true);
    }
  }
  function finish(e, arrived) {
    sim.ents.remove(e.id);
    town.walking -= e.n;
    if (e.dir !== 'in') return;
    const h = sim.ents.get(e.house);
    if (h) h.settling = Math.max(0, (h.settling || 0) - e.n);
    const at = [e.x / SUB, e.y / SUB];
    if (!h || !arrived || h.built < 1) { rehome(e.n, at); return; }
    const k = Math.min(e.n, bedsOf(h) - (h.residents || 0));
    h.residents = (h.residents || 0) + k;
    h.fed = h.fed ?? true; h.watered = h.watered ?? true;
    sim.dirty.add(h.id);
    town.arrived += k; town.pop += k;
    // the teletype hears of the first settlers and then each time the town passes a multiple of `tellEvery` people
    const step = cfg.tellEvery || 10, before = town.pop - k;
    if (k && (town.arrived === k || Math.floor(town.pop / step) > Math.floor(before / step))) {
      sim.events.push({ e: 'teletype', tick: sim.tick, base: sim.base, who: 'Town', text: town.arrived === k ? `THE FIRST SETTLERS HAVE MOVED IN — ${town.pop} PEOPLE IN THE TOWN.` : `THE TOWN HAS GROWN TO ${town.pop} PEOPLE.` });
    }
    if (e.n > k) rehome(e.n - k, at);
  }

  /** Keep homes and their beds honest: vanished homes send their people off; nobody sleeps over the beds. */
  function audit() {
    const seen = new Set();
    for (const b of homes()) {
      seen.add(b.id);
      const beds = bedsOf(b);
      if ((b.residents || 0) > beds) { const over = b.residents - beds; b.residents = beds; rehome(over, b.door); }
      known.set(b.id, { x: b.door[0], y: b.door[1], residents: b.residents || 0 });
    }
    for (const [id, k] of [...known]) {
      if (seen.has(id)) continue;
      known.delete(id);
      if (k.residents) rehome(k.residents, [k.x, k.y]);
    }
  }

  return { homes, bedsOf, meals, pantries, arrivals, walk, audit, gateList, free, enemyNear, leave, rehome };
}
