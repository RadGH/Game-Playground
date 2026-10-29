// The town (PLAN M7). PURE: no DOM, no clock, no Math.random. Started by the `town` row of js/sim/systems.js on the
// first tick (ensureTown), which installs it on the sim's extension points:
//   hooks.workFactor(b)  staffing × morale: a building's speed = workers ÷ jobs × the morale factor (× the share of a
//                        farm's field still in crop); builders (b = a site, or null for road crews) get the morale factor
//   hooks.place          a fishery must stand on a bank
//   hooks.hud            hud.town = { pop, beds, walking, jobs, workers, idle, drafted, morale, target, factor, lamps,
//                        why (settlers are not coming because …), open, food/water days, level }
//   hooks.commands       setTown { settlers: bool } — the Town Board's SETTLERS switch (the only town order there is)
// Every tick settlers walk; every balance.town.every ticks: global levels from research rows with `levels`, homes and
// beds audited, meals, pantries, jobs, morale, farms and chimneys, then maybe a group of settlers sets out.
//
// API for later milestones: town.draft(n) → how many it could take for a squad (they keep their beds, leave their
// jobs), town.release(n); town.noise() → [{ x, y, level }] for M4's Noise field (town size feeds Noise; registered on
// sim.hooks.noise).
// Damage rule (§0.7): houses and every `tag: town` row are never attacked; `migrant` entities are never attacked.

import { SUB } from '../entities.js';
import { createPeople } from './people.js';
import { createJobs } from './jobs.js';
import { createFields } from './fields.js';
import { townMorale, stepNeedle, moraleFactor } from './morale.js';

export function ensureTown(sim) {
  if (sim.town) return sim.town;
  const D = sim.data, cfg = D.balance.town;
  const { g } = sim.world;
  const town = {
    cfg, open: true, pop: 0, beds: 0, walking: 0, drafted: 0, arrived: 0, left: 0,
    jobsFilled: 0, jobsWanted: 0, idle: 0,
    morale: cfg.morale.start, target: cfg.morale.start, factor: 1, lamps: { food: 0, water: 0, commons: 0, light: 0, safety: 0, smoke: 0 },
    lastArrive: -1e9, nextMeal: 0, why: null, lastPop: -1, lastMoraleEv: -1e9,
  };
  sim.town = town;
  sim.levels.house = sim.levels.house || 1;
  const people = createPeople(sim, town);
  const jobs = createJobs(sim, town);
  const fields = createFields(sim, town);
  town.people = people; town.jobs = jobs; town.fields = fields;
  town.factor = moraleFactor(town.morale, cfg);

  // ---- hooks
  sim.hooks.workFactor = (b) => {
    const f = town.factor;
    if (!b || b.built < 1) return f;
    const def = D.B[b.type];
    if (!def.jobs) return f;
    return ((b.workers ?? def.jobs) / def.jobs) * fields.share(b) * f;
  };
  (sim.hooks.place ||= []).push(fields.placeRule);
  sim.hooks.commands.setTown = (s, cmd) => {
    if (cmd.settlers === undefined) return 'Say whether settlers are welcome (settlers: true or false).';
    town.open = !!cmd.settlers;
    return null;
  };
  sim.hooks.hud.push((h) => { h.town = hud(); });

  // ---- the landing party sleeps in the HQ and brought a little food and water
  const hq = sim.ents.list('building').find((b) => b.type === 'hq');
  if (hq) {
    hq.residents = Math.min(cfg.startPop, cfg.hqBeds);
    const p = sim.stores.hqPool();
    if (p) for (const [r, n] of Object.entries(cfg.start)) sim.stores.put(p, r, n);
    sim.events.push({ e: 'machineUnlocked', tick: sim.tick, base: sim.base, machine: 'town' });
  }

  function homeState(b) {
    const x = b.fp.cx, y = b.fp.cy;
    let commons = false;
    for (const c of sim.ents.list('building')) {
      const s = D.B[c.type].serves;
      if (!s || c.built < 1) continue;
      const dx = c.fp.cx - x, dy = c.fp.cy - y;
      if (dx * dx + dy * dy <= s * s) { commons = true; break; }
    }
    const q = g.qIdx(Math.floor(x), Math.floor(y));
    const smoke = g.gasKind[q] === 1 || g.gasKind[q] === 3 ? g.gasDensity[q] : 0;
    return {
      id: b.id, x, y, residents: b.residents || 0, smoky: smoke >= cfg.smokeAt, smoke,
      ok: { food: b.fed !== false, water: b.watered !== false, commons, light: g.light[q] >= cfg.lightAt, safety: !people.enemyNear(x, y, cfg.dangerR) },
    };
  }

  function applyLevels() {
    for (const n of Object.values(D.NODE)) {
      if (!n.levels || !sim.research.done.includes(n.id)) continue;
      for (const [k, v] of Object.entries(n.levels)) {
        if ((sim.levels[k] || 1) >= v) continue;
        sim.levels[k] = v;
        sim.events.push({ e: 'levelUp', tick: sim.tick, base: sim.base, kind: k, level: v });
        if (k === 'house') sim.events.push({ e: 'teletype', tick: sim.tick, base: sim.base, who: 'Town', red: true, text: `HOUSING LEVEL ${['I', 'II', 'III', 'IV', 'V'][v - 1]} — EVERY HOUSE NOW SLEEPS ${D.B.house.beds[Math.min(v, D.B.house.beds.length) - 1]}.` });
      }
    }
  }

  function census() {
    let pop = 0, beds = 0;
    for (const b of people.homes()) { pop += b.residents || 0; beds += people.bedsOf(b); }
    town.pop = pop; town.beds = beds;
    if (town.drafted > pop) town.drafted = pop;
  }

  /** The town step (every cfg.every ticks). */
  function step() {
    sim.refreshTotals();
    applyLevels();
    people.audit();
    if (sim.tick >= town.nextMeal) { town.nextMeal = sim.tick + cfg.mealEvery; if (sim.tick > 0) people.meals(); }
    census();
    people.pantries();
    const homes = people.homes();
    town.homes = homes.map(homeState);
    jobs.step(town.homes);
    const m = townMorale(town.homes, cfg);
    town.target = m.target; town.lamps = m.lamps;
    town.morale = stepNeedle(town.morale, town.target, cfg.morale.rate);
    town.factor = moraleFactor(town.morale, cfg);
    fields.step();
    people.arrivals();
    census();
    if (town.pop !== town.lastPop) { town.lastPop = town.pop; sim.events.push({ e: 'pop', tick: sim.tick, base: sim.base, n: town.pop, beds: town.beds }); }
    if (sim.tick - town.lastMoraleEv >= 200) { town.lastMoraleEv = sim.tick; sim.events.push({ e: 'morale', tick: sim.tick, base: sim.base, v: +town.morale.toFixed(3), factor: +town.factor.toFixed(3), lamps: { ...town.lamps } }); }
  }

  town.tick = () => {
    people.walk();
    if (sim.tick % cfg.every === cfg.phase % cfg.every) step();
    return town;
  };
  town.step = step;

  function hud() {
    const stock = (r) => (sim.baseStock[r] || 0) + (sim.carried[r] || 0);
    const perDay = (per) => Math.max(1e-9, town.pop * per * (D.balance.day.ticks / cfg.mealEvery));
    return {
      pop: town.pop, beds: town.beds, walking: town.walking, jobs: town.jobsWanted, workers: town.jobsFilled, idle: town.idle, drafted: town.drafted,
      morale: +town.morale.toFixed(3), target: +town.target.toFixed(3), factor: +town.factor.toFixed(3), low: cfg.morale.low, high: cfg.morale.high,
      lamps: { ...town.lamps }, why: town.why, open: town.open, level: sim.levels.house || 1,
      foodDays: town.pop ? +(stock('food') / perDay(cfg.foodPerMeal)).toFixed(2) : null,
      waterDays: town.pop ? +(stock('water') / perDay(cfg.waterPerMeal)).toFixed(2) : null,
      arrived: town.arrived, left: town.left,
    };
  }
  town.hud = hud;

  // ---- for later milestones
  town.draft = (n) => { const k = Math.max(0, Math.min(n, town.pop - town.drafted)); town.drafted += k; return k; };
  town.release = (n) => { town.drafted = Math.max(0, town.drafted - n); };
  /** Town size feeds Noise (M4's field, sim.hooks.noise): ONE source at the middle of the homes, louder with every person. */
  town.noise = () => {
    let n = 0, x = 0, y = 0;
    for (const b of people.homes()) { const r = b.residents || 0; n += r; x += b.fp.cx * r; y += b.fp.cy * r; }
    if (!n) return [];
    return [{ x: x / n, y: y / n, level: Math.min(cfg.noiseMax, Math.round(n * cfg.noisePerPerson)) }];
  };
  (sim.hooks.noise ??= []).push(town.noise);
  town.homeAt = (id) => town.homes?.find((h) => h.id === id) || null;

  census();
  step(); // first staffing and morale at once, so the very first production batch already reads them
  void SUB;
  return town;
}
